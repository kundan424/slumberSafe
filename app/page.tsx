"use strict";
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Moon,
  Sun,
  CheckCircle2,
  Circle,
  Sparkles,
  Volume2,
  VolumeX,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Feather,
  BedDouble,
  Lock,
  Settings,
  Plus,
  X,
  Radio,
} from "lucide-react";

type UIState = "IDLE" | "LISTENING" | "PROCESSING" | "PLAYING_AUDIO" | "MORNING_VIEW";

interface DebriefData {
  comforting_response: string;
  parked_tasks: string[];
  story_text: string;
}

interface TaskItem {
  _id: string;
  title: string;
  status: "PARKED" | "COMPLETED";
  createdAt: string;
}

export default function SlumberSafePage() {
  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [storyTopic, setStoryTopic] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [debriefResult, setDebriefResult] = useState<DebriefData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState("11:15 PM");
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // User Settings (stored in localStorage)
  const [groqKey, setGroqKey] = useState("");
  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [voiceId, setVoiceId] = useState("21m00Tcm4TlvDq8ikWAM"); // Rachel default
  const [mongoUri, setMongoUri] = useState("");

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef("");

  // Keep transcriptRef synced
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Load stored credentials on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setGroqKey(localStorage.getItem("slumber_groq_key") || "");
      setElevenlabsKey(localStorage.getItem("slumber_elevenlabs_key") || "");
      setVoiceId(localStorage.getItem("slumber_voice_id") || "21m00Tcm4TlvDq8ikWAM");
      setMongoUri(localStorage.getItem("slumber_mongo_uri") || "");
    }
  }, []);

  const saveSettings = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("slumber_groq_key", groqKey);
      localStorage.setItem("slumber_elevenlabs_key", elevenlabsKey);
      localStorage.setItem("slumber_voice_id", voiceId);
      localStorage.setItem("slumber_mongo_uri", mongoUri);
    }
    setShowSettings(false);
  };

  // Live bedtime clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch morning parked tasks
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", {
        headers: { ...(mongoUri ? { "x-mongo-uri": mongoUri } : {}) },
      });
      const data = await res.json();
      if (Array.isArray(data.tasks)) {
        setTasks(data.tasks);
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  }, [mongoUri]);

  useEffect(() => {
    if (uiState === "MORNING_VIEW") {
      loadTasks();
    }
  }, [uiState, loadTasks]);

  // Bedside Audio Synthesizer (ElevenLabs + soft browser speech fallback)
  const speakBedsideAudio = async (text: string, onEnd?: () => void) => {
    if (isAudioMuted || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(elevenlabsKey ? { "x-elevenlabs-key": elevenlabsKey } : {}),
          ...(voiceId ? { "x-voice-id": voiceId } : {}),
        },
        body: JSON.stringify({
          text: text.trim(),
          voiceId,
          elevenlabsApiKey: elevenlabsKey,
        }),
      });

      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (onEnd) onEnd();
        };
        audio.play().catch(() => {});
        return;
      }
    } catch (err) {
      console.warn("ElevenLabs audio request failed:", err);
    }

    // Fallback: gentle browser speech synthesis with slow whispered rate
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("English")
      );
      if (naturalVoice) utterance.voice = naturalVoice;
      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      if (onEnd) onEnd();
    }
  };

  // Start Bedside Speech Recognition (Continuous + Hands-free Silence Detection)
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicError("Browser speech recognition is not supported here. Feel free to type below.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let full = "";
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript + " ";
        }
        const updated = full.trim();
        setTranscript(updated);
        setIsSpeakingLive(true);

        // Hands-Free Gemini Live Silence Detection:
        // Automatically process thoughts after 2.8s of silence so the user never has to click in bed!
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (updated.length > 5) {
          silenceTimerRef.current = setTimeout(() => {
            setIsSpeakingLive(false);
            processDebrief(updated);
          }, 2800);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Mic recognition error:", event.error);
        if (event.error === "not-allowed") {
          setMicError("Microphone access is blocked. You can type in the box below.");
        }
      };

      recognition.onend = () => {
        setIsSpeakingLive(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setMicError(null);
    } catch (err) {
      console.error("Speech init failure:", err);
      setMicError("Could not start microphone. Please type below.");
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsSpeakingLive(false);
  };

  // Bedside Greeting + Auto-Listen (Conversational Gemini Live Experience)
  const handleStartWindDown = () => {
    setTranscript("");
    setUiState("LISTENING");
    const greeting =
      "I'm listening. Take a gentle, deep breath, and tell me whatever is on your mind tonight.";
    speakBedsideAudio(greeting, () => {
      startSpeechRecognition();
    });
    // Start mic in parallel so user speech isn't lost if they speak right away
    startSpeechRecognition();
  };

  // Submit Spoken Debrief to Groq Llama 3.3 Engine
  const processDebrief = async (textToProcess?: string) => {
    stopListening();
    const activeText = (textToProcess !== undefined ? textToProcess : transcriptRef.current).trim();
    if (!activeText && !storyTopic.trim()) return;

    setUiState("PROCESSING");
    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(groqKey ? { "x-groq-key": groqKey } : {}),
          ...(mongoUri ? { "x-mongo-uri": mongoUri } : {}),
        },
        body: JSON.stringify({
          transcript: activeText,
          storyTopic,
          groqApiKey: groqKey,
          mongoUri,
        }),
      });

      const data: DebriefData = await res.json();
      setDebriefResult(data);
      setUiState("PLAYING_AUDIO");

      // Auto-play bedtime comforting response & story
      const speechScript = [data.comforting_response, data.story_text].filter(Boolean).join(" ");
      if (speechScript) {
        speakBedsideAudio(speechScript);
      }
    } catch (err) {
      console.error("Debrief processing error:", err);
      setDebriefResult({
        comforting_response: "Breathe slowly. Your racing mind is safe to pause and rest tonight.",
        parked_tasks: [],
        story_text: "",
      });
      setUiState("PLAYING_AUDIO");
    }
  };

  // Add Task Manually in Morning View
  const handleAddManualTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mongoUri ? { "x-mongo-uri": mongoUri } : {}),
        },
        body: JSON.stringify({ title: newTaskInput.trim() }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => [data.task, ...prev]);
        setNewTaskInput("");
      }
    } catch (err) {
      console.error("Failed to add manual task", err);
    }
  };

  // Toggle task status
  const toggleTask = async (id: string, currentStatus: "PARKED" | "COMPLETED") => {
    const nextStatus = currentStatus === "PARKED" ? "COMPLETED" : "PARKED";
    setTasks((prev) =>
      prev.map((t) => (t._id === id ? { ...t, status: nextStatus } : t))
    );
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(mongoUri ? { "x-mongo-uri": mongoUri } : {}),
        },
        body: JSON.stringify({ id, status: nextStatus }),
      });
    } catch (e) {
      console.error("Failed to toggle task", e);
    }
  };

  const resetSession = () => {
    stopListening();
    if (audioRef.current) audioRef.current.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTranscript("");
    setStoryTopic("");
    setDebriefResult(null);
    setUiState("IDLE");
  };

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col justify-between max-w-md mx-auto p-5 select-none relative font-sans">
      {/* Bedside Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-indigo-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="flex items-center justify-between z-10 pt-2 pb-4 border-b border-zinc-900">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-base font-semibold tracking-wide text-zinc-200">
            Slumber<span className="text-indigo-400">Safe</span>
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSettings(true)}
            title="Bedside Settings (API Keys & Voice)"
            className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() =>
              setUiState(uiState === "MORNING_VIEW" ? "IDLE" : "MORNING_VIEW")
            }
            className="flex items-center space-x-1.5 text-xs px-3 py-1.5 rounded-full bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition"
          >
            {uiState === "MORNING_VIEW" ? (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Night Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Morning Momentum</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center space-x-2">
                <Settings className="w-4 h-4 text-indigo-400" />
                <span>Bedside Settings</span>
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Groq API Key (Llama 3.3):</label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">ElevenLabs API Key:</label>
                <input
                  type="password"
                  placeholder="xi-..."
                  value={elevenlabsKey}
                  onChange={(e) => setElevenlabsKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">ElevenLabs Voice ID:</label>
                <div className="flex space-x-1 mb-1">
                  {[
                    { name: "Rachel", id: "21m00Tcm4TlvDq8ikWAM" },
                    { name: "Charlotte", id: "XB0fDUnXU5powFXDhCwa" },
                    { name: "George", id: "JBFqnCBsd6RMkjVDRZzb" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoiceId(v.id)}
                      className={`px-2 py-1 rounded text-[10px] border transition ${
                        voiceId === v.id
                          ? "bg-indigo-950 text-indigo-300 border-indigo-700"
                          : "bg-zinc-900 text-zinc-500 border-zinc-800"
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Voice ID"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">MongoDB Atlas URI:</label>
                <input
                  type="password"
                  placeholder="mongodb+srv://..."
                  value={mongoUri}
                  onChange={(e) => setMongoUri(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              onClick={saveSettings}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
            >
              Save Credentials
            </button>
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex flex-col justify-center my-6 z-10">
        {/* 1. IDLE STATE */}
        {uiState === "IDLE" && (
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Late-Night Doomscroll Interceptor Banner */}
            <div className="w-full bg-gradient-to-b from-indigo-950/40 to-zinc-900/40 border border-indigo-900/40 rounded-2xl p-4 text-left shadow-lg">
              <div className="flex items-center space-x-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
                <BedDouble className="w-4 h-4 text-indigo-400" />
                <span>Late-Night Interceptor • {currentTimeStr}</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                You’ve been scrolling in bed. Your brain deserves rest. Put your phone face-down and start tonight’s voice debrief.
              </p>
            </div>

            {/* Pulsing Start Wind-Down Button */}
            <div className="py-6 flex flex-col items-center">
              <button
                onClick={handleStartWindDown}
                className="w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-950 p-[2px] shadow-2xl shadow-indigo-950/80 animate-glow-breathe transition active:scale-95 flex items-center justify-center group"
              >
                <div className="w-full h-full bg-zinc-950 rounded-full flex flex-col items-center justify-center space-y-2 group-hover:bg-zinc-900/80 transition">
                  <Mic className="w-9 h-9 text-indigo-400 group-hover:scale-110 transition duration-300" />
                  <span className="text-xs font-medium text-zinc-300 tracking-wider">
                    Start Wind-Down
                  </span>
                </div>
              </button>
              <p className="text-xs text-zinc-500 mt-4">
                Hands-free voice companion • Greet & speak from bed
              </p>
            </div>

            {/* Bedtime Story Topic Input */}
            <div className="w-full text-left space-y-2">
              <label className="text-xs text-zinc-400 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Bedtime sleep story topic (optional):</span>
              </label>
              <input
                type="text"
                placeholder="e.g., A quiet rainy harbor in Maine"
                value={storyTopic}
                onChange={(e) => setStoryTopic(e.target.value)}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>
        )}

        {/* 2. LISTENING STATE (Conversational Hands-Free Voice) */}
        {uiState === "LISTENING" && (
          <div className="flex flex-col items-center space-y-6">
            <div className="flex items-center space-x-2 text-xs text-emerald-400 uppercase tracking-widest font-semibold">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>{isSpeakingLive ? "Listening to Your Voice..." : "Ready & Listening"}</span>
            </div>

            {/* Soundwave Animation */}
            <div className="flex items-end justify-center space-x-2 h-16 py-2">
              <div className={`soundwave-bar ${isSpeakingLive ? "animate-wave-1" : "h-3 opacity-40"}`} />
              <div className={`soundwave-bar ${isSpeakingLive ? "animate-wave-2" : "h-5 opacity-40"}`} />
              <div className={`soundwave-bar ${isSpeakingLive ? "animate-wave-3" : "h-7 opacity-40"}`} />
              <div className={`soundwave-bar ${isSpeakingLive ? "animate-wave-4" : "h-5 opacity-40"}`} />
              <div className={`soundwave-bar ${isSpeakingLive ? "animate-wave-2" : "h-3 opacity-40"}`} />
            </div>

            <p className="text-[11px] text-zinc-400 text-center italic">
              Speak naturally. SlumberSafe auto-detects when you finish speaking.
            </p>

            {/* Live Transcript & Fallback Input */}
            <div className="w-full space-y-2">
              <label className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Spoken Thoughts & To-Dos:</span>
                <span className="text-[11px] text-zinc-500">Live Voice Transcription</span>
              </label>
              <textarea
                rows={4}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Speak aloud or type your racing thoughts here... e.g. 'I need to send the report to Mark and buy groceries tomorrow.'"
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition resize-none"
              />
              {micError && (
                <p className="text-xs text-amber-400 bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/50">
                  {micError}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="w-full flex space-x-3 pt-2">
              <button
                onClick={resetSession}
                className="flex-1 py-3 px-4 rounded-xl bg-zinc-900 text-zinc-400 text-sm hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => processDebrief()}
                className="flex-2 py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition flex items-center justify-center space-x-2"
              >
                <span>Lock Away & Sleep</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 3. PROCESSING STATE */}
        {uiState === "PROCESSING" && (
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-16">
            <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin flex items-center justify-center">
              <Moon className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h2 className="text-base font-medium text-zinc-200">
              Soothing your mind...
            </h2>
            <p className="text-xs text-zinc-500 max-w-xs">
              Separating worries from tasks and locking them safely away for tomorrow morning.
            </p>
          </div>
        )}

        {/* 4. PLAYING AUDIO / RESULTS STATE */}
        {uiState === "PLAYING_AUDIO" && debriefResult && (
          <div className="space-y-5 animate-in fade-in duration-500">
            {/* Audio Voice Playing Indicator */}
            <div className="flex items-center justify-between bg-indigo-950/30 border border-indigo-900/40 rounded-xl px-4 py-3">
              <div className="flex items-center space-x-2.5 text-xs text-indigo-300">
                <Volume2 className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="font-medium">Bedside Whispered Voice</span>
              </div>
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.muted = !isAudioMuted;
                  }
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    if (!isAudioMuted) window.speechSynthesis.cancel();
                  }
                  setIsAudioMuted(!isAudioMuted);
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Comforting Response */}
            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                <Feather className="w-3.5 h-3.5" />
                <span>Comforting Words</span>
              </span>
              <p className="text-sm text-zinc-200 italic leading-relaxed">
                &ldquo;{debriefResult.comforting_response}&rdquo;
              </p>
            </div>

            {/* Parked Tasks Lockbox Confirmation */}
            {debriefResult.parked_tasks.length > 0 && (
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2.5">
                <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Tasks Locked in Atlas ({debriefResult.parked_tasks.length})</span>
                </span>
                <ul className="space-y-1.5">
                  {debriefResult.parked_tasks.map((task, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-zinc-300 flex items-center space-x-2 bg-black/40 px-3 py-2 rounded-xl"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-zinc-500 pt-1">
                  Parked safely until morning. Your mind is off the clock.
                </p>
              </div>
            )}

            {/* Bedtime Story */}
            {debriefResult.story_text && (
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Bedtime Sleep Story</span>
                </span>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {debriefResult.story_text}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  const speechScript = [
                    debriefResult.comforting_response,
                    debriefResult.story_text,
                  ].filter(Boolean).join(" ");
                  speakBedsideAudio(speechScript);
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-indigo-300 text-xs font-medium transition flex items-center justify-center space-x-2 border border-zinc-800"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Replay Bedside Audio</span>
              </button>

              <button
                onClick={resetSession}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition flex items-center justify-center space-x-2 border border-zinc-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Close Eyes & Sleep (Reset)</span>
              </button>
            </div>
          </div>
        )}

        {/* 5. MORNING VIEW (MOMENTUM CARD) */}
        {uiState === "MORNING_VIEW" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-gradient-to-br from-amber-950/20 to-zinc-900/60 border border-amber-900/30 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sun className="w-4 h-4" />
                <span>Morning Momentum Card</span>
              </div>
              <p className="text-xs text-zinc-400">
                Good morning! Here are the tasks locked away last night so you could sleep:
              </p>
            </div>

            {/* Add Task Manually */}
            <form onSubmit={handleAddManualTask} className="flex space-x-2">
              <input
                type="text"
                placeholder="Add a task for morning..."
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!newTaskInput.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs flex items-center space-x-1 disabled:opacity-40 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {tasks.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs space-y-2">
                <ShieldCheck className="w-8 h-8 text-zinc-600 mx-auto" />
                <p>No parked tasks for this morning.</p>
                <p className="text-[11px]">Your mind is completely clear!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <button
                    key={task._id}
                    onClick={() => toggleTask(task._id, task.status)}
                    className="w-full text-left p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 transition flex items-center space-x-3 group"
                  >
                    {task.status === "COMPLETED" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 shrink-0" />
                    )}
                    <span
                      className={`text-xs ${
                        task.status === "COMPLETED"
                          ? "line-through text-zinc-500"
                          : "text-zinc-200"
                      }`}
                    >
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setUiState("IDLE")}
              className="w-full py-3 rounded-xl bg-zinc-900 text-zinc-300 text-xs font-medium hover:bg-zinc-800 transition"
            >
              Return to Bedside Companion
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-[10px] text-zinc-600 border-t border-zinc-900 pt-3 z-10">
        SlumberSafe • Built for Hacktoberfest 2026 (#hf26challenge) • Zero Data Logging
      </footer>
    </main>
  );
}
