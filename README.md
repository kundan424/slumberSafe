# 🌙 SlumberSafe: Bedside Debrief & Doomscroll Deterrent

> **Built for Hacktoberfest 2026 (#hf26challenge) — DEV Challenge #1: "Build for a Friend"**  
> *A private, voice-first bedtime decompression companion designed to break the late-night racing thoughts and doomscrolling cycle.*

---

## 🌟 The Story & Problem Statement

Late at night around 11:00 PM, unfinished to-dos, racing thoughts, and tomorrow's stresses create bedtime friction. To cope with bedtime anxiety, many people turn to blue light feeds and social media, doomscrolling past 1:00 or 2:00 AM.

Commercial AI chatbots fail at this use case:
1. They require staring into bright text chat UIs.
2. They do not automatically lock away to-dos for the next morning.
3. They log intimate vulnerable thoughts onto closed commercial cloud servers.

**SlumberSafe** solves this with an OLED screen-free voice companion powered by open-weight AI (Meta's Llama 3.3 via Groq) and soft whispered bedside audio (ElevenLabs).

---

## ✨ Features (MVP Scope)

1. **Late-Night Doomscroll Interceptor Banner**
   - Active bedtime alert nudging the user when looking at the screen late at night.
   - One-tap CTA to put the phone down and start a 3-minute voice decompression session.

2. **Bedside Voice Debrief (Screen-Free Hero Feature)**
   - Native Web Speech recognition (`webkitSpeechRecognition`) transcribes spoken thoughts with zero cloud latency.
   - Includes graceful fallback textarea for noisy environments or restricted mic permissions.

3. **Task Lockbox (Morning Momentum)**
   - Open-weight Llama 3.3 separates emotional worries from concrete actionable tasks.
   - Automatically stores extracted to-dos in **MongoDB Atlas** under status `PARKED`.
   - Audio reassurance informs the user that their brain is officially off the clock.

4. **Sleep Story Engine**
   - Generates a calming 100-word low-stimulation sensory scene on any topic requested.
   - Spoken bedside audio synthesized using **ElevenLabs** whispered voice.
   - Graceful visual & browser speech fallback if ElevenLabs credentials are unset.

5. **Morning Momentum View**
   - Displays all parked tasks with interactive checkboxes so nothing gets forgotten the next morning.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS (OLED dark palette `bg-zinc-950` / `bg-black`)
- **Speech-to-Text (STT):** Browser native `webkitSpeechRecognition` (Web Speech API)
- **Open AI Core (LLM):** `groq-sdk` with `llama-3.3-70b-versatile` (fast open-weight inference)
- **Voice Synthesis (TTS):** ElevenLabs REST API (`/v1/text-to-speech`)
- **Database:** Native `mongodb` driver with MongoDB Atlas connection pooling
- **Icons & Styling:** `lucide-react`, `clsx`, `tailwind-merge`

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/slumbersafe.git
cd slumbersafe
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory (refer to `.env.example`):

```env
# Groq Cloud API Key (for Llama 3.3)
GROQ_API_KEY=gsk_your_groq_api_key

# ElevenLabs API Key & Bedside Voice ID
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# MongoDB Atlas Connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/slumbersafe?retryWrites=true&w=majority
```

*(Note: The app runs with graceful mock and memory fallbacks if API keys are not immediately configured, allowing offline and testing previews out of the box).*

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your mobile device or browser.

---

## 📱 UI State Machine

- `IDLE`: Displays pulsing "Start Wind-Down" button and late-night interceptor banner.
- `LISTENING`: Mic active, visual soundwave pulse, and real-time transcript.
- `PROCESSING`: Soothing state while Llama 3.3 analyzes speech and parks tasks.
- `PLAYING_AUDIO`: ElevenLabs bedtime audio playback with comforting response and bedtime story.
- `MORNING_VIEW`: Clean card showing parked tasks with toggleable checkboxes.

---

## 🔒 Privacy & Open-Source AI Mandate

- **Intimate Privacy:** Bedside anxieties and personal schedules are processed with open weights rather than logged into commercial chat histories.
- **Zero Token Anxiety:** Designed to be used every night without subscription paywalls.

---

## 🏆 Hacktoberfest 2026 DEV Challenge Submission

- **Challenge:** #1: "Build for a Friend"
- **Categories:** Best Use of ElevenLabs, Best Use of MongoDB Atlas
