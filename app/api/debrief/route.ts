import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { saveParkedTasks } from "@/lib/mongodb";

interface DebriefRequestBody {
  transcript?: string;
  storyTopic?: string;
  groqApiKey?: string;
  mongoUri?: string;
}

interface DebriefResponse {
  comforting_response: string;
  parked_tasks: string[];
  story_text: string;
}

// Smart offline task extractor and storyteller when GROQ_API_KEY is not set
function generateDynamicDebrief(transcript: string, storyTopic: string): DebriefResponse {
  const tasks: string[] = [];
  const text = transcript.trim();

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
      const cleaned = candidate.replace(/^(i\s+need\s+to|i\s+have\s+to|need\s+to|have\s+to)\s+/i, "");
      const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      if (formatted.length > 4 && !tasks.includes(formatted)) {
        tasks.push(formatted);
      }
    }
  }

  // If user entered short direct to-do (e.g. "Send report to Mark")
  if (tasks.length === 0 && text.length > 0) {
    const lines = text.split(/[.\n;]+/).map((s) => s.trim()).filter((s) => s.length > 3);
    for (const line of lines) {
      if (
        /^(buy|call|send|finish|review|meet|email|pay|schedule|clean|submit|do|pick up)/i.test(line) ||
        line.length <= 80
      ) {
        tasks.push(line.charAt(0).toUpperCase() + line.slice(1));
      }
    }
  }

  // Dynamic empathetic response
  let comforting_response = "";
  if (tasks.length > 0) {
    comforting_response = `I have locked away those ${tasks.length} task${tasks.length > 1 ? "s" : ""} safely for tomorrow morning. Your mind is officially off the clock tonight—let tomorrow take care of itself.`;
  } else if (text.length > 0) {
    comforting_response = `Your mind has carried so much today. Every thought you just spoke is safe to put down now. Take a deep, gentle breath and let your shoulders melt into rest.`;
  } else {
    comforting_response = `I am right here with you. Close your eyes, let go of the day, and allow yourself to gently drift away into sleep.`;
  }

  // Dynamic sensory sleep story generator
  let story_text = "";
  const topic = storyTopic.trim();
  if (topic) {
    story_text = `Picture ${topic.toLowerCase()}. Soft, rhythmic whispers of evening mist drift slowly through the quiet air. A gentle, reassuring warmth settles all around you, easing away the friction of today. Every breath you take grows deeper and slower as stillness blankets the scene. The world outside is peaceful, your thoughts are safe, and it is time now to close your eyes and rest.`;
  } else if (/story|tell me/i.test(text)) {
    story_text = `A warm, quiet cabin sits nestled deep inside a starlit pine forest. Outside, a gentle mountain rain taps soothingly against the windowpane, like a lullaby sung just for you. An amber fire crackles quietly in the hearth, filling the room with comforting cedar scent. Breathe in slowly, feel the day melt into the shadows, and let yourself drift into deep, uninterrupted sleep.`;
  }

  return {
    comforting_response,
    parked_tasks: tasks.slice(0, 5), // top tasks
    story_text,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: DebriefRequestBody = await req.json();
    const transcript = (body.transcript || "").trim();
    const storyTopic = (body.storyTopic || "").trim();

    const apiKey =
      body.groqApiKey ||
      req.headers.get("x-groq-key") ||
      process.env.GROQ_API_KEY;

    const mongoUri =
      body.mongoUri ||
      req.headers.get("x-mongo-uri") ||
      process.env.MONGODB_URI;

    // If Groq API key is not supplied, use our smart dynamic NLP engine
    if (!apiKey) {
      const dynamicResult = generateDynamicDebrief(transcript, storyTopic);
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

    const systemPrompt = `You are SlumberSafe, a soothing, empathetic bedtime decompression companion.
Your goal is to help a tired, anxious user empty their mind so they can fall asleep peacefully.

Input: The user's late-night spoken thoughts, anxieties, or to-dos.
Optional Story Topic: ${storyTopic ? `"${storyTopic}"` : "None provided"}

Instructions:
1. Provide a comforting, warm, empathetic response acknowledging their feelings (comforting_response: 1-2 calm reassuring sentences, max 40 words). Reassure them that tomorrow will be fine and their work is done for tonight.
2. Extract any concrete, actionable tasks they mentioned so they do not have to keep them in memory (parked_tasks array of strings). If no actionable tasks were mentioned, return an empty array [].
3. If a storyTopic is provided (or if the user asked for a story in their speech), generate a 100-word peaceful, sensory-rich, low-stimulation bedtime story scene (story_text). Use gentle imagery (gentle rain, soft moonlight, rustling leaves, quiet harbor). Avoid excitement, plot twists, or danger. End with an invitation to close eyes and rest. If no story topic or request is present, return an empty string "".

Output must strictly match this JSON schema:
{
  "comforting_response": "1-2 warm empathetic sentences reassuring the user.",
  "parked_tasks": ["task 1", "task 2"],
  "story_text": "100-word calming story if topic provided, otherwise empty string."
}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Bedside transcript: "${transcript}"\nStory topic requested: "${storyTopic}"`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 600,
    });

    let rawContent = completion.choices[0]?.message?.content || "{}";
    rawContent = rawContent.trim();
    if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    let parsed: DebriefResponse;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      console.warn("Failed to parse JSON from Groq, using dynamic fallback:", parseError);
      parsed = generateDynamicDebrief(transcript, storyTopic);
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

    // Store actionable parked tasks in MongoDB Atlas or shared memory store
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
      (req as any).body?.transcript || "",
      (req as any).body?.storyTopic || ""
    );
    return NextResponse.json(dynamicResult);
  }
}
