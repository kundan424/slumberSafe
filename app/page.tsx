"use strict";
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
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
  Send,
  Coffee,
} from "lucide-react";

type UIState = "IDLE" | "AI_SPEAKING" | "LISTENING" | "PROCESSING" | "SESSION_COMPLETE" | "MORNING_VIEW";

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  tasks?: string[];
}

interface DebriefData {
  assistant_response: string;
  tasks: Array<{ text: string; priority: string }>;
  next_question: string;
  session_complete: boolean;
  should_offer_story: boolean;
  story_text?: string;
}

interface TaskItem {
  _id: string;
  title: string;
  status: "PARKED" | "COMPLETED";
  createdAt: string;
}

export default function SlumberSafePage() {
  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [currentInput, setCurrentInput] = useState("");
  const [storyTopic, setStoryTopic] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [allParkedTasks, setAllParkedTasks] = useState<string[]>([]);
  const [finalDebrief, setFinalDebrief] = useState<DebriefData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState("11:15 PM");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [groqKey, setGroqKey] = useState("");
  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [voiceId, setVoiceId] = useState("21m00Tcm4TlvDq8ikWAM"); // Rachel default
  const [mongoUri, setMongoUri] = useState("");

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAiSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const conversationRef = useRef<ConversationTurn[]>([]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Load stored credentials
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

  // Synthesize audio with ElevenLabs & fallback
  const speakBedsideAudio = (text: string, onEnd?: () => void) => {
    if (isAudioMuted || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    setIsAiSpeaking(true);
    isAiSpeakingRef.current = true;

    const finalize = () => {
      console.log("[AUDIO] playback ended");
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      if (onEnd) onEnd();
    };

    fetch("/api/tts", {
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
    })
      .then((res) => {
        if (res.ok && res.headers.get("content-type")?.includes("audio")) {
          return res.blob();
        }
        throw new Error("Fallback needed");
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = finalize;
        audio.onerror = finalize;
        console.log("[AUDIO] playback started");
        audio.play().catch(finalize);
      })
      .catch(() => {
        // Fallback: Web Speech synthesis with soft whisper cadence
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.84;
          utterance.pitch = 0.95;
          const voices = window.speechSynthesis.getVoices();
          const softVoice = voices.find(
            (v) =>
              v.name.includes("Natural") ||
              v.name.includes("Google") ||
              v.name.includes("English")
          );
          if (softVoice) utterance.voice = softVoice;
          utterance.onend = finalize;
          utterance.onerror = finalize;
          console.log("[AUDIO] playback started (fallback TTS)");
          window.speechSynthesis.speak(utterance);
        } else {
          finalize();
        }
      });
  };

  // Continuous speech recognition with anti-echo and silence detection
  const startListening = () => {
    console.log("[VOICE] recognition started");
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicError("Browser speech recognition is not supported. Please type below.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        // Echo cancellation: Ignore input while AI is speaking or processing
        if (isAiSpeakingRef.current || isProcessingRef.current) return;

        let full = "";
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript + " ";
        }
        const updated = full.trim();
        if (updated) {
          setCurrentInput(updated);
          setIsUserSpeaking(true);

          // Hands-free Gemini Live silence detection: auto-submit after 3.2s pause
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          if (updated.length > 6) {
            silenceTimerRef.current = setTimeout(() => {
              console.log("[VOICE] final transcript:", updated);
              setIsUserSpeaking(false);
              handleSendTurn(updated);
            }, 3200);
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed") {
          setMicError("Microphone permission denied. You can type below.");
        }
      };

      recognition.onend = () => {
        console.log("[VOICE] recognition stopped");
        setIsUserSpeaking(false);
        // Automatically restart listening if still in LISTENING state
        if (!isAiSpeakingRef.current && !isProcessingRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setMicError(null);
    } catch (err) {
      console.error("Speech recognition error:", err);
      setMicError("Could not start microphone. Feel free to type below.");
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null; // Prevent it from auto-restarting
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsUserSpeaking(false);
  };

  // Start Bedside Wind-Down Conversation
  const handleStartWindDown = () => {
    setConversation([]);
    setAllParkedTasks([]);
    setFinalDebrief(null);
    setCurrentInput("");
    setUiState("AI_SPEAKING");

    const greeting = "Let's slow things down for a moment. How was your day?";

    // Add greeting to conversation feed
    setConversation([{ role: "assistant", content: greeting }]);

    // Speak greeting, then automatically begin listening for user response
    speakBedsideAudio(greeting, () => {
      setUiState("LISTENING");
      startListening();
    });
  };

  // Send a Conversational Turn (Dictate stresses, tasks, thoughts)
  const handleSendTurn = async (inputText?: string, forceSleep: boolean = false) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const textToSend = (inputText !== undefined ? inputText : currentInput).trim();
    if (!textToSend && !forceSleep) return;

    console.log("[DEBRIEF] request sent");
    // Temporarily pause listening while AI is thinking
    isProcessingRef.current = true;
    setUiState("PROCESSING");
    stopListening();
    setCurrentInput("");

    const newHistory = [
      ...conversationRef.current,
      ...(textToSend ? [{ role: "user" as const, content: textToSend }] : []),
    ];
    setConversation(newHistory);

    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(groqKey ? { "x-groq-key": groqKey } : {}),
          ...(mongoUri ? { "x-mongo-uri": mongoUri } : {}),
        },
        body: JSON.stringify({
          messages: newHistory,
          storyTopic,
          isReadyForSleep: forceSleep,
          groqApiKey: groqKey,
          mongoUri,
        }),
      });

      const data: DebriefData = await res.json();
      console.log("[DEBRIEF] response received:", data);
      
      // Accumulate any extracted tasks
      if (data.tasks && data.tasks.length > 0) {
        const taskStrings = data.tasks.map(t => t.text);
        console.log("[DEBRIEF] tasks detected:", taskStrings);
        setAllParkedTasks((prev) => {
          const newTasks = taskStrings.filter((t) => !prev.includes(t));
          return [...prev, ...newTasks];
        });
      }

      // Check if session is complete
      if (data.session_complete || forceSleep) {
        setFinalDebrief(data);
        setUiState("SESSION_COMPLETE");
        const finalScript = [data.assistant_response, data.story_text]
          .filter(Boolean)
          .join(" ");
        console.log("[TTS] generating response for sleep");
        speakBedsideAudio(finalScript);
      } else {
        // Continue conversation: AI speaks and then prompts user for next turn
        const fullResponse = [data.assistant_response, data.next_question].filter(Boolean).join(" ");
        setConversation((prev) => [
          ...prev,
          {
            role: "assistant",
            content: fullResponse,
            tasks: data.tasks?.map(t => t.text),
          },
        ]);

        console.log("[TTS] generating response");
        setUiState("AI_SPEAKING");
        speakBedsideAudio(fullResponse, () => {
          console.log("[SESSION] returning to listening");
          // AI finished speaking; resume listening for user's next thoughts!
          isProcessingRef.current = false;
          setUiState("LISTENING");
          startListening();
        });
      }
    } catch (err) {
      console.error("Turn processing error:", err);
      const fallbackMsg =
        "Your thoughts are safe with me. Let your mind pause and take a gentle breath.";
      setConversation((prev) => [...prev, { role: "assistant", content: fallbackMsg }]);
      setUiState("AI_SPEAKING");
      speakBedsideAudio(fallbackMsg, () => {
        isProcessingRef.current = false;
        setUiState("LISTENING");
        startListening();
      });
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
    setCurrentInput("");
    setConversation([]);
    setFinalDebrief(null);
    setUiState("IDLE");
  };

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex flex-col justify-between max-w-md mx-auto p-5 select-none relative font-sans">
      {/* Bedside Glow */}
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
                <label className="text-zinc-400 block mb-1">
                  Bedside Voice (100% Free Premade Voices):
                </label>
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  {[
                    { name: "Rachel (Calm)", id: "21m00Tcm4TlvDq8ikWAM" },
                    { name: "Bella (Whisper)", id: "EXAVITQu4vr4xnSDxMaL" },
                    { name: "Adam (Warm Male)", id: "pNInz6obpgDQGcFmaJgB" },
                    { name: "Antoni (Soft)", id: "ErXwobaYiN019PkySvjV" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoiceId(v.id)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] border text-left transition ${
                        voiceId === v.id
                          ? "bg-indigo-950/80 text-indigo-300 border-indigo-600"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-center my-4 z-10">
        {/* 1. IDLE STATE */}
        {uiState === "IDLE" && (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-full bg-gradient-to-b from-indigo-950/40 to-zinc-900/40 border border-indigo-900/40 rounded-2xl p-4 text-left shadow-lg">
              <div className="flex items-center space-x-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
                <BedDouble className="w-4 h-4 text-indigo-400" />
                <span>Late-Night Interceptor • {currentTimeStr}</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                You’ve been scrolling in bed. Your brain deserves rest. Put your phone face-down and start tonight’s conversational voice wind-down.
              </p>
            </div>

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
                Conversational Bedside Debrief • Hands-free voice
              </p>
            </div>

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

        {/* 2. CONVERSING STATE (Multi-turn Gemini Voice Experience) */}
        {(uiState === "AI_SPEAKING" || uiState === "LISTENING" || uiState === "PROCESSING") && (
          <div className="flex flex-col space-y-3 h-[72vh]">
            {/* Status Indicator */}
            <div className="flex items-center justify-between bg-zinc-950/90 border border-zinc-800/80 rounded-xl px-3.5 py-2 text-xs">
              <div className="flex items-center space-x-2">
                {isAiSpeaking ? (
                  <>
                    <Volume2 className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span className="text-indigo-300 font-medium">SlumberSafe is speaking...</span>
                  </>
                ) : isProcessingRef.current ? (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span className="text-indigo-300 font-medium">SlumberSafe is thinking...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 font-medium">
                      {isUserSpeaking ? "Hearing your voice..." : "Listening to you (Speak freely)"}
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.muted = !isAudioMuted;
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    if (!isAudioMuted) window.speechSynthesis.cancel();
                  }
                  setIsAudioMuted(!isAudioMuted);
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Conversation Feed */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
              {conversation.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-950/60 text-indigo-100 border border-indigo-900/50 rounded-br-sm"
                        : "bg-zinc-900/90 text-zinc-200 border border-zinc-800/80 rounded-bl-sm"
                    }`}
                  >
                    <p>{msg.content}</p>
                    {msg.tasks && msg.tasks.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/80 space-y-1">
                        <span className="text-[10px] text-emerald-400 font-semibold uppercase flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>Parked for Morning:</span>
                        </span>
                        {msg.tasks.map((task, tidx) => (
                          <div
                            key={tidx}
                            className="text-[11px] text-zinc-300 flex items-center space-x-1.5 bg-black/40 px-2 py-1 rounded"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{task}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Live Spoken Input / Fallback Textarea */}
            <div className="space-y-2 pt-2 border-t border-zinc-900">
              <div className="relative">
                <textarea
                  rows={2}
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  placeholder={
                    isAiSpeaking
                      ? "Listening will resume automatically when voice finishes..."
                      : isProcessingRef.current
                        ? "Thinking..."
                        : "Speak your thoughts or type here... (Pauses auto-send)"
                  }
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-2.5 pr-10 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition resize-none"
                />
                <button
                  type="button"
                  onClick={() => handleSendTurn()}
                  disabled={!currentInput.trim()}
                  className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              {micError && (
                <p className="text-[11px] text-amber-400 bg-amber-950/20 px-2 py-1 rounded border border-amber-900/40">
                  {micError}
                </p>
              )}

              {/* Quick Bedside Action Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={resetSession}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 text-zinc-400 text-xs hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSendTurn(undefined, true)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white text-xs font-medium transition flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-950/60"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Ready for Sleep Story</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. PLAYING AUDIO / FINAL SLEEP STATE */}
        {uiState === "SESSION_COMPLETE" && finalDebrief && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between bg-indigo-950/30 border border-indigo-900/40 rounded-xl px-4 py-3">
              <div className="flex items-center space-x-2.5 text-xs text-indigo-300">
                <Volume2 className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="font-medium">Whispered Sleep Narrator</span>
              </div>
              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.muted = !isAudioMuted;
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

            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                <Feather className="w-3.5 h-3.5" />
                <span>Comforting Words</span>
              </span>
              <p className="text-sm text-zinc-200 italic leading-relaxed">
                &ldquo;{finalDebrief.assistant_response}&rdquo;
              </p>
            </div>

            {/* Parked Tasks Confirmation */}
            {allParkedTasks.length > 0 && (
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Tasks Locked in Atlas ({allParkedTasks.length})</span>
                </span>
                <ul className="space-y-1.5">
                  {allParkedTasks.map((task, idx) => (
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
                  Safely stored in MongoDB Atlas. Your mind is off the clock.
                </p>
              </div>
            )}

            {/* Bedtime Story */}
            {finalDebrief.story_text && (
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Bedtime Sleep Scene</span>
                </span>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {finalDebrief.story_text}
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  const speechScript = [
                    finalDebrief.assistant_response,
                    finalDebrief.story_text,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  speakBedsideAudio(speechScript);
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-indigo-300 text-xs font-medium transition flex items-center justify-center space-x-2 border border-zinc-800"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Replay Whispered Bedside Audio</span>
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

        {/* 4. MORNING VIEW (MOMENTUM CARD) */}
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
