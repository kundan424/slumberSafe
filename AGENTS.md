# Agent Instructions & Coding Rules — SlumberSafe

You are an expert full-stack developer building the SlumberSafe MVP for Hacktoberfest 2026 (#hf26challenge).
Read `PRD.md` and `SPEC.md` carefully before writing code. Adhere strictly to these rules to maximize efficiency and avoid token waste:

## 1. Single-File UI Rule (Prevent Fragmentation)
- Keep all frontend components, modal dialogs, and state inside `app/page.tsx`.
- Do NOT split the UI into separate child files (e.g., `Header.tsx`, `MicButton.tsx`, `StoryCard.tsx`, etc.) unless `page.tsx` exceeds 400 lines. Keeping state colocated prevents endless circular edits.

## 2. Zero Hallucinated Packages & Versions
- Use ONLY the following packages:
  - `groq-sdk` (for fast open-weight Llama 3.2 / Llama 3.3 inference)
  - `mongodb` (native driver for MongoDB Atlas task storage)
  - `lucide-react` (clean mobile icons)
  - `clsx` and `tailwind-merge`
- Do NOT install or import unapproved packages (e.g. Prisma, Redux, Framer Motion, Axios). Use standard `fetch()`.

## 3. Strict Web Speech & Audio Architecture
- Use the browser's native `webkitSpeechRecognition` (Web Speech API) directly inside React hooks.
- Provide a clean fallback textarea input in case the browser blocks mic permissions.
- When ElevenLabs audio is returned from `/api/tts`, play it directly using standard HTML5 `Audio()` or an `<audio>` ref.
- If ElevenLabs fails (e.g. invalid API key or rate limit), show the soothing text visually on screen without crashing the app.

## 4. Strict LLM Output Handling
- The LLM endpoint `/api/debrief` must strictly request and parse JSON from the model.
- Always wrap `JSON.parse()` in a try/catch. If the model outputs markdown backticks (` ```json `), strip them cleanly before parsing.

## 5. Mobile-First OLED Dark Theme
- Use Tailwind CSS with pure OLED dark background (`bg-zinc-950` / `bg-black`).
- Use large, touch-friendly buttons suitable for a user lying in bed using a phone.
- Include the Late-Night Doomscroll Interceptor banner at the top of the interface.

## 6. No Placeholders or Incomplete Code
- Write full, working implementations. Never output `// TODO: implement later` or dummy mock data when the real endpoint logic is defined in `SPEC.md`.
