# Technical Specification — SlumberSafe

## 1. Tech Stack
- Frontend: Next.js 14 (App Router) + Tailwind CSS (OLED dark palette `bg-zinc-950`).
- Voice Input (STT): Browser native `webkitSpeechRecognition`.
- LLM Inference: Groq Cloud SDK (`llama-3.3-70b-versatile` or `llama-3.2-3b-preview`).
- Voice Output (TTS): ElevenLabs REST API (`/v1/text-to-speech/{voice_id}`).
- Database: Native MongoDB Driver connected to MongoDB Atlas.

## 2. UI State Machine
The single page (`app/page.tsx`) must strictly follow these states:
- `IDLE`: Displays pulsing "Start Wind-Down" button and late-night alert banner.
- `LISTENING`: Mic active, visual soundwave/pulse animation, live transcript display.
- `PROCESSING`: Loading state ("Soothing your mind...").
- `PLAYING_AUDIO`: Audio playing via ElevenLabs, showing comforting text on screen.
- `MORNING_VIEW`: Clean card showing parked tasks with toggleable checkboxes.

## 3. Exact API Contracts

### POST `/api/debrief`
- **Request Body:** `{ "transcript": "string", "storyTopic": "string | optional" }`
- **Mandatory JSON Response (Never return plain text):**
```json
{
  "comforting_response": "1-2 warm empathetic sentences reassuring the user.",
  "parked_tasks": ["task 1", "task 2"],
  "story_text": "100-word calming story if topic provided, otherwise empty string."
}