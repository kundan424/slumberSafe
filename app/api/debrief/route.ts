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
  comforting_response: string;
  parked_tasks: string[];
  story_text: string;
}

// Smart offline conversational engine when GROQ_API_KEY is not configured
function generateDynamicDebrief(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  storyTopic: string,
  isReadyForSleep: boolean
): DebriefResponse {
  const tasks: string[] = [];
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
      if (formatted.length > 3 && !tasks.includes(formatted)) {
        tasks.push(formatted);
      }
    }
  }

  // If user entered short direct to-do item
  if (tasks.length === 0 && text.length > 0) {
    const lines = text.split(/[.\n;]+/).map((s) => s.trim()).filter((s) => s.length > 3);
    for (const line of lines) {
      if (
        /^(buy|call|send|finish|review|meet|email|pay|schedule|clean|submit|do|pick up)/i.test(
          line
        ) ||
        (line.length <= 60 && !/^(no|yes|nothing|goodnight|sleep|ready)/i.test(line))
      ) {
        tasks.push(line.charAt(0).toUpperCase() + line.slice(1));
      }
    }
  }

  const wantsSleep =
    isReadyForSleep ||
    /\b(sleep|story|goodnight|ready to sleep|no that's all|nothing else|that is all|that's it|all for tonight)\b/i.test(
      lower
    );

  let comforting_response = "";
  let story_text = "";

  if (wantsSleep) {
    comforting_response =
      "Your mind has emptied everything it needed to tonight. Close your eyes, let your shoulders melt into bed, and listen as the quiet night carries you into sleep.";
    const topic = storyTopic.trim() || "a quiet rainy harbor in Maine";
    story_text = `Picture ${topic.toLowerCase()}. Soft, rhythmic whispers of evening mist drift slowly through the quiet air. A gentle, reassuring warmth settles all around you, easing away every lingering thought of today. Every breath you take grows deeper, slower, and lighter as stillness blankets the room. The world outside is peaceful, your tasks are locked safely away, and your mind is completely free to rest.`;
  } else {
    if (tasks.length > 0) {
      comforting_response = `I've saved those ${tasks.length} task${tasks.length > 1 ? "s" : ""} for tomorrow. You don't need to carry them tonight.`;
    } else if (text.length > 0) {
      comforting_response = `I hear you. It's safe to set that down now.`;
    } else {
      comforting_response = "Take your time. I'm listening.";
    }
  }

  return {
    comforting_response,
    parked_tasks: tasks.slice(0, 5),
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
      if (dynamicResult.parked_tasks.length > 0) {
        try {
          await saveParkedTasks(dynamicResult.parked_tasks, mongoUri);
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
1. Empathize with their thoughts in 1-2 calm, conversational sentences. Reassure them that tomorrow will be fine.
2. Extract any concrete, actionable tasks from what they said and put them in the "parked_tasks" array. If none, return [].
3. Check if the user is ready to sleep (they explicitly say "goodnight", "ready to sleep", "tell me a story", or isReadyForSleep is true):
   - If they ARE ready to sleep: set "story_text" to a peaceful 100-word low-stimulation bedtime scene based on the topic. Provide a very short comforting_response inviting them to close their eyes.
   - If they are NOT yet ready for sleep: acknowledge their thoughts briefly and naturally pause. Leave "story_text" empty. DO NOT forcefully push for a sleep story if they are just venting.

Output must strictly match this JSON schema:
{
  "comforting_response": "1-2 warm conversational sentences. (DO NOT ask for a story topic unless they are ready for sleep)",
  "parked_tasks": ["task 1", "task 2"],
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
        content: `Hint: The user clicked 'Ready for Sleep Story'. Generate the story now using topic: "${storyTopic || "gentle rain"}".`,
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

    let parsed: DebriefResponse;
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
      comforting_response:
        typeof parsed.comforting_response === "string" && parsed.comforting_response.length > 0
          ? parsed.comforting_response
          : "Your mind has carried enough today. Allow yourself to release tension and drift into sleep.",
      parked_tasks: Array.isArray(parsed.parked_tasks)
        ? parsed.parked_tasks.filter((t) => typeof t === "string" && t.trim().length > 0)
        : [],
      story_text: typeof parsed.story_text === "string" ? parsed.story_text : "",
    };

    if (result.parked_tasks.length > 0) {
      try {
        await saveParkedTasks(result.parked_tasks, mongoUri);
      } catch (dbErr) {
        console.warn("Error saving tasks to MongoDB:", dbErr);
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

