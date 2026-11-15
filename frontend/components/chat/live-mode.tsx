"use client";

// SYNAPSE Live: a real-time spoken conversation, like Gemini Live.
// - Listens with the browser's speech recognition and replies out loud
//   (ElevenLabs when the backend has a key, otherwise the device's voice).
// - Can see through the camera or a shared screen: each turn sends one
//   snapshot of what's on show.
// - Tap the orb (or start talking after it finishes) to interrupt.
// - Every turn is saved as a normal chat titled "Live: ...".

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Keyboard,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  SendHorizontal,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { api, fetchLiveSpeech, streamLiveTurn, type LiveConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

type Phase = "starting" | "listening" | "thinking" | "speaking" | "muted";
type Visual = "none" | "camera" | "screen";

/* eslint-disable @typescript-eslint/no-explicit-any */
const getRecognition = (): any =>
  typeof window === "undefined" ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

/** Text that reads well aloud: no Markdown symbols, links or [1] markers. */
function speakable(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The most natural-sounding installed voice for the user's language. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const base = lang.toLowerCase().split("-")[0];
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = sameLang.length ? sameLang : voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 8 : 0) +
    (/google/i.test(v.name) ? 5 : 0) +
    (/samantha|aria|jenny|sonia|libby|neerja|female/i.test(v.name) ? 2 : 0) +
    (v.lang.toLowerCase() === lang.toLowerCase() ? 3 : 0) +
    (v.localService ? 0 : 1);
  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const STATUS: Record<Phase, string> = {
  starting: "Connecting...",
  listening: "Listening",
  thinking: "Thinking...",
  speaking: "Speaking · tap to interrupt",
  muted: "Microphone off",
};

export function LiveMode({ onClose }: { onClose: (conversationId: string | null) => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [visual, setVisual] = useState<Visual>("none");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [userText, setUserText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceInput, setVoiceInput] = useState(true);
  const [canShareScreen, setCanShareScreen] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const phaseRef = useRef<Phase>("starting");
  const configRef = useRef<LiveConfig>({ voice: "browser", search: false });
  const conversationRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<{ text: string; audio: Promise<Blob | null> | null }[]>([]);
  const pumpingRef = useRef(false);
  const streamDoneRef = useRef(true);
  const closedRef = useRef(false);
  const langRef = useRef("en-US");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  // ---- Listening ----------------------------------------------------------
  const startListening = useCallback(() => {
    if (closedRef.current) return;
    if (phaseRef.current === "muted") return;
    setPhaseBoth("listening");
    const Recognition = getRecognition();
    if (!Recognition || !voiceInput) return;
    try {
      recognitionRef.current?.abort?.();
    } catch {
      /* already stopped */
    }
    const recognition = new Recognition();
    recognition.lang = langRef.current;
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setUserText((finalText + interim).trim());
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNotice("Microphone access is blocked. Allow it in your browser, or type instead.");
        setVoiceInput(false);
        setTyping(true);
      } else if (event.error === "network" || event.error === "language-not-supported") {
        setNotice("Voice recognition isn't available here. Type instead, or open SYNAPSE in Chrome or Edge.");
        setVoiceInput(false);
        setTyping(true);
      }
    };
    recognition.onend = () => {
      const said = finalText.trim();
      if (closedRef.current) return;
      if (said && phaseRef.current === "listening") {
        void sendTurn(said);
      } else if (phaseRef.current === "listening") {
        // Silence: keep listening.
        window.setTimeout(() => phaseRef.current === "listening" && startListening(), 250);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* start() throws if a session is still closing; onend restarts it */
    }
    // sendTurn is defined below and stable (useCallback with refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput]);

  const stopListening = () => {
    try {
      recognitionRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  };

  // ---- Speaking ------------------------------------------------------------
  const finishIfIdle = useCallback(() => {
    if (pumpingRef.current || queueRef.current.length || !streamDoneRef.current) return;
    if (phaseRef.current === "speaking" || phaseRef.current === "thinking") startListening();
  }, [startListening]);

  const speakBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      voiceRef.current = voiceRef.current ?? pickVoice(langRef.current);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.lang = voiceRef.current?.lang ?? langRef.current;
      utterance.rate = 1.04;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

  const playBlob = (blob: Blob) =>
    new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    while (queueRef.current.length && !closedRef.current) {
      const item = queueRef.current.shift()!;
      if (phaseRef.current !== "speaking") setPhaseBoth("speaking");
      const blob = item.audio ? await item.audio : null;
      if (phaseRef.current !== "speaking") break; // interrupted meanwhile
      if (blob) await playBlob(blob);
      else await speakBrowser(item.text);
    }
    pumpingRef.current = false;
    finishIfIdle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishIfIdle]);

  const enqueue = useCallback(
    (raw: string) => {
      const text = speakable(raw);
      if (!text) return;
      const audio =
        configRef.current.voice === "elevenlabs" && speechAbortRef.current
          ? fetchLiveSpeech(text, speechAbortRef.current.signal)
          : null;
      queueRef.current.push({ text, audio });
      void pump();
    },
    [pump],
  );

  const silence = () => {
    queueRef.current = [];
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  /** Stop talking (and any reply still being written) and listen again. */
  const interrupt = useCallback(() => {
    turnAbortRef.current?.abort();
    streamDoneRef.current = true;
    silence();
    pumpingRef.current = false;
    if (phaseRef.current !== "muted") startListening();
  }, [startListening]);

  // ---- One turn --------------------------------------------------------------
  const snapshot = async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !videoStreamRef.current || !video.videoWidth) return null;
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  };

  const sendTurn = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said || closedRef.current) return;
      stopListening();
      silence();
      setUserText(said);
      setReplyText("");
      setNotice(null);
      setPhaseBoth("thinking");

      const form = new FormData();
      form.append("text", said);
      if (conversationRef.current) form.append("conversation_id", conversationRef.current);
      const frame = await snapshot();
      if (frame) {
        form.append("image", frame, "frame.jpg");
        form.append("source", visualRef.current);
      }

      const controller = new AbortController();
      turnAbortRef.current = controller;
      speechAbortRef.current = new AbortController();
      streamDoneRef.current = false;
      let buffer = "";
      let reply = "";

      try {
        await streamLiveTurn(
          form,
          (event) => {
            if (event.type === "meta") conversationRef.current = event.conversation_id;
            else if (event.type === "status") setNotice("Checking the web...");
            else if (event.type === "delta") {
              setNotice(null);
              reply += event.text;
              buffer += event.text;
              setReplyText(reply);
              // Speak sentence by sentence so the voice starts right away.
              const match = buffer.match(/^([\s\S]*?[.!?。！？](?=\s|$))\s*/);
              if (match && match[1].trim().length >= 12) {
                enqueue(match[1]);
                buffer = buffer.slice(match[0].length);
              }
            } else if (event.type === "error") {
              setNotice(event.message);
            }
          },
          controller.signal,
        );
        if (buffer.trim()) enqueue(buffer);
      } catch (error) {
        if (controller.signal.aborted) return;
        setNotice(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      } finally {
        if (turnAbortRef.current === controller) turnAbortRef.current = null;
      }
      streamDoneRef.current = true;
      if (!reply) {
        if (!closedRef.current && phaseRef.current !== "muted") startListening();
        return;
      }
      finishIfIdle();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enqueue, finishIfIdle, startListening],
  );

  // ---- Camera and screen ----------------------------------------------------
  const visualRef = useRef<Visual>("none");
  const stopVisual = () => {
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    visualRef.current = "none";
    setVisual("none");
  };

  const showStream = (stream: MediaStream, kind: Visual) => {
    videoStreamRef.current = stream;
    visualRef.current = kind;
    setVisual(kind);
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (videoStreamRef.current === stream) stopVisual();
    });
  };

  const startCamera = async (mode: "user" | "environment" = facing) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stopVisual();
      setFacing(mode);
      showStream(stream, "camera");
      const devices = await navigator.mediaDevices.enumerateDevices();
      setHasMultipleCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch {
      setNotice("Camera access is blocked or unavailable.");
    }
  };

  const startScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      stopVisual();
      showStream(stream, "screen");
    } catch {
      setNotice("Screen sharing was cancelled or isn't available here.");
    }
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStreamRef.current;
  }, [visual]);

  // ---- Microphone (level meter + mute) --------------------------------------
  const toggleMute = () => {
    if (phaseRef.current === "muted") {
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = true));
      setPhaseBoth("listening");
      startListening();
    } else {
      stopListening();
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      interrupt();
      setPhaseBoth("muted");
    }
  };

  // ---- Start and clean up ---------------------------------------------------
  useEffect(() => {
    closedRef.current = false;
    langRef.current = navigator.language || "en-US";
    setCanShareScreen(Boolean(navigator.mediaDevices?.getDisplayMedia));
    if (!getRecognition()) {
      setVoiceInput(false);
      setTyping(true);
      setNotice("Voice recognition isn't available in this browser. Type instead, or open SYNAPSE in Chrome or Edge.");
    }
    if ("speechSynthesis" in window) {
      const load = () => (voiceRef.current = pickVoice(langRef.current));
      load();
      window.speechSynthesis.addEventListener?.("voiceschanged", load);
    }

    let frame = 0;
    let context: AudioContext | null = null;
    (async () => {
      try {
        configRef.current = await api<LiveConfig>("/api/live/config");
      } catch {
        /* defaults: built-in voice */
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (closedRef.current) return stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = stream;
        // A light level meter that makes the orb breathe with your voice.
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (const value of data) sum += value;
          const level = Math.min(1, sum / data.length / 70);
          orbRef.current?.style.setProperty("--level", (phaseRef.current === "listening" ? level : 0).toFixed(3));
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setNotice("Microphone access is blocked. Allow it in your browser, or type instead.");
        setVoiceInput(false);
        setTyping(true);
      }
      if (!closedRef.current) startListening();
    })();

    return () => {
      closedRef.current = true;
      cancelAnimationFrame(frame);
      void context?.close();
      turnAbortRef.current?.abort();
      stopListening();
      silence();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // Runs once when Live opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(conversationRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (phaseRef.current === "muted") setPhaseBoth("listening");
    void sendTurn(text);
  };

  const onOrb = () => {
    if (phase === "speaking" || phase === "thinking") interrupt();
    else if (phase === "muted") toggleMute();
  };

  // ---- UI -------------------------------------------------------------------
  const control =
    "glass-pill inline-flex size-12 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent active:scale-95 sm:size-14";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="SYNAPSE Live"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col bg-background/75 backdrop-blur-2xl"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          Live
        </span>
        <span className="text-xs text-muted-foreground">
          {configRef.current.voice === "elevenlabs" ? "ElevenLabs voice" : "Device voice"}
        </span>
      </div>

      {/* Stage */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4">
        {visual !== "none" ? (
          <div className="relative w-full max-w-3xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "max-h-[48dvh] w-full rounded-3xl bg-black object-contain shadow-2xl",
                visual === "camera" && facing === "user" && "-scale-x-100",
              )}
            />
            <span className="glass-pill absolute left-3 top-3 px-2.5 py-1 text-xs">
              {visual === "camera" ? "SYNAPSE can see your camera" : "SYNAPSE can see your screen"}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onOrb}
          aria-label={phase === "speaking" || phase === "thinking" ? "Interrupt" : STATUS[phase]}
          className="group relative grid place-items-center outline-none"
        >
          <div
            ref={orbRef}
            className={cn(
              "live-orb relative rounded-full",
              visual !== "none" ? "size-20 sm:size-24" : "size-40 sm:size-52",
              `live-orb--${phase}`,
            )}
          />
        </button>

        <div className="w-full max-w-2xl space-y-3 text-center" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            {notice ?? (phase === "listening" && !voiceInput ? "Your turn · type below" : STATUS[phase])}
          </p>
          <AnimatePresence mode="wait">
            {replyText ? (
              <motion.p
                key="reply"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-h-[22dvh] overflow-y-auto font-serif text-xl leading-relaxed text-foreground sm:text-2xl"
              >
                {speakable(replyText)}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {userText && <p className="mx-auto line-clamp-2 text-sm text-muted-foreground">&ldquo;{userText}&rdquo;</p>}
        </div>
      </div>

      {/* Type instead */}
      {typing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitDraft();
          }}
          className="mx-auto mb-3 flex w-full max-w-xl items-center gap-2 px-4"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type to SYNAPSE..."
            className="glass-pill h-12 flex-1 rounded-full bg-transparent px-5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <button type="submit" className={cn(control, "size-12")} aria-label="Send">
            <SendHorizontal className="size-5" />
          </button>
        </form>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 px-4 pb-6 pt-2 sm:gap-4">
        <button
          type="button"
          className={cn(control, visual === "camera" && "bg-foreground text-background hover:bg-foreground/90")}
          onClick={() => (visual === "camera" ? stopVisual() : void startCamera())}
          aria-pressed={visual === "camera"}
          aria-label={visual === "camera" ? "Turn camera off" : "Turn camera on"}
          title={visual === "camera" ? "Turn camera off" : "Show SYNAPSE your camera"}
        >
          {visual === "camera" ? <VideoOff className="size-5" /> : <Video className="size-5" />}
        </button>
        {visual === "camera" && hasMultipleCameras && (
          <button
            type="button"
            className={control}
            onClick={() => void startCamera(facing === "user" ? "environment" : "user")}
            aria-label="Switch camera"
            title="Switch camera"
          >
            <SwitchCamera className="size-5" />
          </button>
        )}
        {canShareScreen && (
          <button
            type="button"
            className={cn(control, visual === "screen" && "bg-foreground text-background hover:bg-foreground/90")}
            onClick={() => (visual === "screen" ? stopVisual() : void startScreen())}
            aria-pressed={visual === "screen"}
            aria-label={visual === "screen" ? "Stop sharing screen" : "Share your screen"}
            title={visual === "screen" ? "Stop sharing" : "Show SYNAPSE your screen"}
          >
            <MonitorUp className="size-5" />
          </button>
        )}
        {voiceInput && (
          <button
            type="button"
            className={cn(control, phase === "muted" && "bg-foreground text-background hover:bg-foreground/90")}
            onClick={toggleMute}
            aria-pressed={phase === "muted"}
            aria-label={phase === "muted" ? "Unmute microphone" : "Mute microphone"}
            title={phase === "muted" ? "Unmute" : "Mute"}
          >
            {phase === "muted" ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
        )}
        <button
          type="button"
          className={cn(control, typing && "bg-foreground text-background hover:bg-foreground/90")}
          onClick={() => setTyping((value) => !value)}
          aria-pressed={typing}
          aria-label="Type instead"
          title="Type instead"
        >
          <Keyboard className="size-5" />
        </button>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-red-500 px-5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-red-600 active:scale-95 sm:h-14 sm:px-6"
          onClick={() => onClose(conversationRef.current)}
          aria-label="End Live"
        >
          <PhoneOff className="size-5" /> End
        </button>
      </div>
    </motion.div>
  );
}

export default LiveMode;
