import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { saveParkedTasks } from "@/lib/mongodb";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface DebriefRequestBody {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  storyTopic?: string;
  isReadyForSleep?: boolean;
  groqApiKey?: string;
  mongoUri?: string;
}

interface DebriefResponse {
  assistant_response: string;
  tasks: Array<{ text: string; priority: string }>;
  next_question: string;
  session_complete: boolean;
  should_offer_story: boolean;
  story_text: string;
}

// Smart offline conversational engine when GROQ_API_KEY is not configured
function generateDynamicDebrief(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  storyTopic: string,
  isReadyForSleep: boolean
): DebriefResponse {
  const extractedTasks: string[] = [];
  const lastUserMessage = messages.slice().reverse().find(m => m.role === "user")?.content || "";
  const text = lastUserMessage.trim();
  const lower = text.toLowerCase();

  // Pattern matching for actionable items in conversational speech
  const actionablePatterns = [
    /(?:need to|have to|must|should|ought to)\s+([^.,;!?\n]+)/gi,
    /(?:finish|complete|send|submit|call|email|text|write|buy|purchase|pick up|clean|schedule|fix|review|prepare)\s+([^.,;!?\n]+)/gi,
    /(?:remember to|don't forget to)\s+([^.,;!?\n]+)/gi,
    /(?:tomorrow|morning|noon|later)\s+(?:i need to|i have to|to)\s+([^.,;!?\n]+)/gi,
  ];

  for (const pattern of actionablePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[0].trim();
      const cleaned = candidate.replace(
        /^(i\s+need\s+to|i\s+have\s+to|need\s+to|have\s+to)\s+/i,
        ""
      );
      const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      if (formatted.length > 3 && !extractedTasks.includes(formatted)) {
        extractedTasks.push(formatted);
      }
    }
  }

  // If user entered short direct to-do item
  if (extractedTasks.length === 0 && text.length > 0) {
    const lines = text.split(/[.\n;]+/).map((s) => s.trim()).filter((s) => s.length > 3);
    for (const line of lines) {
      if (
        /^(buy|call|send|finish|review|meet|email|pay|schedule|clean|submit|do|pick up)/i.test(
          line
        ) ||
        (line.length <= 60 && !/^(no|yes|nothing|goodnight|sleep|ready)/i.test(line))
      ) {
        extractedTasks.push(line.charAt(0).toUpperCase() + line.slice(1));
      }
    }
  }

  const wantsSleep =
    isReadyForSleep ||
    /\b(sleep|story|goodnight|ready to sleep|no that's all|nothing else|that is all|that's it|all for tonight|done)\b/i.test(
      lower
    );

  let assistant_response = "";
  let story_text = "";
  let next_question = "";
  let session_complete = false;

  if (wantsSleep) {
    session_complete = true;
    assistant_response =
      "Your mind has emptied everything it needed to tonight. Close your eyes, let your shoulders melt into bed, and listen as the quiet night carries you into sleep.";
    const topic = storyTopic.trim() || "a quiet rainy harbor in Maine";
    story_text = `Picture ${topic.toLowerCase()}. Soft, rhythmic whispers of evening mist drift slowly through the quiet air. A gentle, reassuring warmth settles all around you, easing away every lingering thought of today. Every breath you take grows deeper, slower, and lighter as stillness blankets the room. The world outside is peaceful, your tasks are locked safely away, and your mind is completely free to rest.`;
  } else {
    if (extractedTasks.length > 0) {
      assistant_response = `I've saved those ${extractedTasks.length} task${extractedTasks.length > 1 ? "s" : ""} for tomorrow. You don't need to carry them tonight.`;
      next_question = "What else is on your mind?";
    } else if (text.length > 0) {
      assistant_response = `I hear you. It's safe to set that down now.`;
      next_question = "Is there anything else you want to talk about?";
    } else {
      assistant_response = "Take your time.";
      next_question = "I'm listening.";
    }
  }

  return {
    assistant_response,
    tasks: extractedTasks.slice(0, 5).map(t => ({ text: t, priority: "normal" })),
    next_question,
    session_complete,
    should_offer_story: wantsSleep,
    story_text,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: DebriefRequestBody = await req.json();
    console.log("[DEBRIEF] Received Request:", JSON.stringify(body, null, 2));

    const messages = body.messages || [];
    const storyTopic = (body.storyTopic || "").trim();
    const isReadyForSleep = Boolean(body.isReadyForSleep);

    const apiKey =
      body.groqApiKey ||
      req.headers.get("x-groq-key") ||
      process.env.GROQ_API_KEY;

    const mongoUri =
      body.mongoUri ||
      req.headers.get("x-mongo-uri") ||
      process.env.MONGODB_URI;

    // Offline / fallback dynamic engine
    if (!apiKey) {
      const dynamicResult = generateDynamicDebrief(
        messages,
        storyTopic,
        isReadyForSleep
      );
      if (dynamicResult.tasks.length > 0) {
        try {
          const taskStrings = dynamicResult.tasks.map(t => t.text);
          await saveParkedTasks(taskStrings, mongoUri);
        } catch (dbErr) {
          console.warn("Error saving tasks to storage:", dbErr);
        }
      }
      return NextResponse.json(dynamicResult);
    }

    // Call Groq Llama 3.3 Versatile
    const groq = new Groq({ apiKey });

    const systemPrompt = `You are SlumberSafe, a soothing, empathetic bedtime companion.
You are having an ongoing, spoken bedside conversation with a tired user lying in bed.

Your personality:
- Calm, warm, and natural. Like a gentle human listener, not a customer service bot.
- Do NOT say "How can I help you?", "Tell me more", or act like a productivity assistant.
- Do NOT repeat the user's entire transcript back to them.
- Keep your responses short (1-2 sentences). The user is trying to sleep.

Your goals:
1. Empathize with their thoughts in 1-2 calm, conversational sentences in "assistant_response". Reassure them that tomorrow will be fine.
2. Extract any concrete, actionable tasks from what they said and put them in the "tasks" array. If none, return []. DO NOT talk about the tasks mechanically, just reassure them that it's safe for tomorrow.
3. Determine the "next_question" to keep the conversation flowing naturally if they have more on their mind, or leave it empty if the session is ending.
4. Check if the user is ready to sleep (they explicitly say "goodnight", "ready to sleep", "done", "that's all", or isReadyForSleep is true):
   - If they ARE ready to sleep: set "session_complete" to true and "should_offer_story" to true. Generate a peaceful 100-word bedtime scene in "story_text" based on the topic. Provide a very short "assistant_response" inviting them to close their eyes.
   - If they are NOT yet ready for sleep: acknowledge their thoughts briefly. Leave "story_text" empty, "should_offer_story" false, and "session_complete" false. DO NOT forcefully push for a sleep story if they are just venting.

Output must strictly match this JSON schema:
{
  "assistant_response": "1-2 warm conversational sentences.",
  "tasks": [{"text": "task 1", "priority": "normal"}],
  "next_question": "A short, natural follow-up question, or empty if ending.",
  "session_complete": boolean,
  "should_offer_story": boolean,
  "story_text": "100-word calming story if ready for sleep, otherwise empty string."
}`;

    const formattedMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Append all past turns
    for (const h of messages) {
      formattedMessages.push({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      });
    }

    // If there's an explicit force sleep override, we can append a system hint
    if (isReadyForSleep) {
      formattedMessages.push({
        role: "system",
        content: `Hint: The user clicked 'Ready for Sleep Story'. Generate the story now using topic: "${storyTopic || "gentle rain"}". Set session_complete: true and should_offer_story: true.`,
      });
    }

    console.log("[DEBRIEF] Sending to LLM:", JSON.stringify(formattedMessages, null, 2));

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: formattedMessages as any,
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 600,
    });

    let rawContent = completion.choices[0]?.message?.content || "{}";
    rawContent = rawContent.trim();
    if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    
    console.log("[DEBRIEF] LLM Raw Response:", rawContent);

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      console.warn("Failed to parse JSON from Groq, using dynamic fallback:", parseError);
      parsed = generateDynamicDebrief(
        messages,
        storyTopic,
        isReadyForSleep
      );
    }

    const result: DebriefResponse = {
      assistant_response:
        typeof parsed.assistant_response === "string" && parsed.assistant_response.length > 0
          ? parsed.assistant_response
          : "Your mind has carried enough today. Allow yourself to release tension and drift into sleep.",
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.filter((t: any) => t && typeof t.text === "string" && t.text.trim().length > 0).map((t: any) => ({ text: t.text.trim(), priority: t.priority || "normal" }))
        : [],
      next_question: typeof parsed.next_question === "string" ? parsed.next_question : "",
      session_complete: Boolean(parsed.session_complete),
      should_offer_story: Boolean(parsed.should_offer_story),
      story_text: typeof parsed.story_text === "string" ? parsed.story_text : "",
    };

    if (result.tasks.length > 0) {
      try {
        const taskStrings = result.tasks.map(t => t.text);
        console.log("[MONGO] saving tasks:", taskStrings);
        await saveParkedTasks(taskStrings, mongoUri);
        console.log("[MONGO] tasks saved successfully");
      } catch (dbErr) {
        console.warn("Error saving tasks to MongoDB:", dbErr);
        // Do NOT claim task was saved if it failed
        result.assistant_response = "I couldn't safely park that one just now, so I don't want you to rely on me remembering it. " + result.assistant_response;
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/debrief, falling back to dynamic parser:", error);
    const dynamicResult = generateDynamicDebrief(
      (req as any).body?.messages || [],
      (req as any).body?.storyTopic || "",
      false
    );
    return NextResponse.json(dynamicResult);
  }
}

