# Product Requirements Document (PRD) — SlumberSafe

## 1. Problem Statement
Built for Hacktoberfest 2026 (#hf26challenge). The user suffers from late-night racing thoughts and doomscrolls in bed past 11:00 PM. Existing chatbots are text-heavy, closed-source, and fail to track tasks for the morning.

## 2. In-Scope Features (MVP)
1. **Late-Night Interceptor Banner:** Alert card shown when active past 11:00 PM nudging the user to start their wind-down session.
2. **Bedside Voice Debrief (Hero Feature):** Screen-free audio capture via browser mic. The user speaks their stresses/thoughts out loud.
3. **Task Lockbox (Differentiator):** AI extracts concrete to-dos from the speech, reassures the user that they are saved, and stores them in MongoDB Atlas.
4. **Sleep Story Engine:** If requested, generates a soothing 100-word low-stimulation story on any topic, spoken via ElevenLabs TTS in a whispered tone.
5. **Morning Momentum Card:** When viewed in daytime mode, reveals the parked tasks cleanly with checkboxes.

## 3. STRICTLY OUT OF SCOPE (DO NOT BUILD)
- DO NOT build user authentication, login screens, or passwords (single local user session).
- DO NOT build Google Calendar or Apple Reminders integrations.
- DO NOT build real-time conversational voice interruption (audio plays sequentially).
- DO NOT build multi-page routing. Everything runs on one mobile-first page.