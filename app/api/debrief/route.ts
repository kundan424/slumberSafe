import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { saveParkedTasks } from "@/lib/mongodb";

interface DebriefRequestBody {
  transcript?: string;
  storyTopic?: string;
}

interface DebriefResponse {
  comforting_response: string;
  parked_tasks: string[];
  story_text: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: DebriefRequestBody = await req.json();
    const transcript = (body.transcript || "").trim();
    const storyTopic = (body.storyTopic || "").trim();

    if (!transcript && !storyTopic) {
      return NextResponse.json(
        {
          comforting_response: "I'm listening whenever you're ready to share. Rest your eyes and take a slow, deep breath.",
          parked_tasks: [],
          story_text: "",
        },
        { status: 200 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      // Fallback when GROQ_API_KEY is not set yet
      const fallbackTasks: string[] = [];
      const lower = transcript.toLowerCase();
      if (lower.includes("need to") || lower.includes("have to") || lower.includes("tomorrow") || lower.includes("finish") || lower.includes("send")) {
        fallbackTasks.push(transcript.length > 80 ? `${transcript.slice(0, 80)}...` : transcript);
      }

      const fallbackStory = storyTopic
        ? `Soft raindrops tap rhythmically against the windowpane as gentle mist blankets the quiet streets. A warm amber glow spills across the floor, wrapping the room in peaceful stillness. Breathe in slowly, feel the weight of the day fade away into the shadows, and allow your eyes to gently close.`
        : "";

      if (fallbackTasks.length > 0) {
        await saveParkedTasks(fallbackTasks);
      }

      const fallbackResult: DebriefResponse = {
        comforting_response:
          fallbackTasks.length > 0
            ? "I've locked away those tasks for tomorrow morning. Your brain is officially off the clock tonight—let tomorrow worry about tomorrow."
            : "Everything you've carried today is more than enough. Let your shoulders soften and allow yourself to gently rest.",
        parked_tasks: fallbackTasks,
        story_text: fallbackStory,
      };

      return NextResponse.json(fallbackResult);
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are SlumberSafe, a soothing, empathetic bedtime decompression companion.
Your goal is to help a tired, anxious user empty their mind so they can fall asleep peacefully.

Input: The user's late-night spoken thoughts, anxieties, or to-dos.
Optional Story Topic: ${storyTopic ? `"${storyTopic}"` : "None provided"}

Instructions:
1. Provide a comforting, warm, empathetic response acknowledging their feelings (comforting_response, 1-2 calm reassuring sentences, max 40 words). Reassure them that tomorrow will be fine and their work is done for tonight.
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

    // Strip markdown backticks if returned (e.g. ```json ... ```)
    rawContent = rawContent.trim();
    if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    let parsed: DebriefResponse;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("Failed to parse JSON from Groq:", parseError, rawContent);
      parsed = {
        comforting_response:
          "Take a slow breath. Your thoughts are acknowledged, and your mind is safe to rest now.",
        parked_tasks: [],
        story_text: "",
      };
    }

    // Ensure types match mandatory contract
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

    // Store actionable parked tasks in MongoDB Atlas
    if (result.parked_tasks.length > 0) {
      try {
        await saveParkedTasks(result.parked_tasks);
      } catch (dbErr) {
        console.error("Error saving tasks to MongoDB:", dbErr);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/debrief:", error);
    return NextResponse.json(
      {
        comforting_response:
          "Breathe gently. Even when technology stumbles, your mind is safe to pause and sleep tonight.",
        parked_tasks: [],
        story_text: "",
      },
      { status: 500 }
    );
  }
}
