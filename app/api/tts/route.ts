import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const selectedVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "ELEVENLABS_API_KEY is not configured. Falling back to visual/browser speech.",
          fallback: true,
        },
        { status: 400 }
      );
    }

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;

    const response = await fetch(elevenLabsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("ElevenLabs API error response:", response.status, errText);
      return NextResponse.json(
        {
          error: `ElevenLabs error: ${response.statusText}`,
          details: errText,
          fallback: true,
        },
        { status: response.status }
      );
    }

    const audioArrayBuffer = await response.arrayBuffer();

    return new Response(audioArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("Error in /api/tts:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to generate speech",
        fallback: true,
      },
      { status: 500 }
    );
  }
}
