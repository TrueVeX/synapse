"use client";

// Sign in / sign up (21st.dev "sign-up" by EaseMize) adapted for SYNAPSE:
// - real accounts: email + password sign-in, sign-up (name, email, password,
//   confirm), Continue with Google, sign in with a code and forgot password
//   (email or text codes) instead of the demo's fake timers
// - SYNAPSE's black-and-white palette: the background glows are neutral
//   instead of the theme's red/amber/blue chart colours, and the GitHub
//   button is dropped (SYNAPSE has no GitHub sign-in)
// - works on phones (fluid width, safe areas, wrapping headlines)
// - glass input / button styles live in app/globals.css

import React, {
  Children,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Loader, Lock, Mail, PartyPopper, Smartphone, UserRound, X } from "lucide-react";
import { AnimatePresence, motion, type Transition, type Variants } from "motion/react";
import confetti, { type CreateTypes as ConfettiInstance, type Options as ConfettiOptions } from "canvas-confetti";
import { cn } from "@/lib/utils";
import { API_URL, TOKEN_KEY } from "@/lib/api";
import { GOOGLE_CLIENT_ID, getGoogleAccessToken, isInsideApp } from "@/lib/google";
import { nextPath, withNext } from "@/lib/next-url";
import { SynapseMark } from "@/components/chat/synapse-mark";

// ---------------------------------------------------------------------------
// Confetti

type ConfettiApi = { fire: (options?: ConfettiOptions) => void };
type ConfettiRef = ConfettiApi | null;

const Confetti = forwardRef<ConfettiRef, React.ComponentPropsWithoutRef<"canvas">>((props, ref) => {
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    if (node) {
      if (!instanceRef.current) instanceRef.current = confetti.create(node, { resize: true, useWorker: true });
    } else if (instanceRef.current) {
      instanceRef.current.reset();
      instanceRef.current = null;
    }
  }, []);
  const fire = useCallback((options: ConfettiOptions = {}) => void instanceRef.current?.(options), []);
  const api = useMemo(() => ({ fire }), [fire]);
  useImperativeHandle(ref, () => api, [api]);
  return <canvas ref={canvasRef} {...props} />;
});
Confetti.displayName = "Confetti";

// ---------------------------------------------------------------------------
// Text loop and blur fade

function TextLoop({ children, className, interval = 1.5, transition = { duration: 0.3 } }: { children: ReactNode[]; className?: string; interval?: number; transition?: Transition }) {
  const [index, setIndex] = useState(0);
  const items = Children.toArray(children);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % items.length), interval * 1000);
    return () => clearInterval(timer);
  }, [items.length, interval]);
  const variants: Variants = { initial: { y: 20, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -20, opacity: 0 } };
  return (
    <div className={cn("relative inline-block whitespace-nowrap", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={index} initial="initial" animate="animate" exit="exit" transition={transition} variants={variants}>
          {items[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function BlurFade({ children, className, duration = 0.4, delay = 0, yOffset = 6, blur = "6px" }: { children: ReactNode; className?: string; duration?: number; delay?: number; yOffset?: number; blur?: string }) {
  // Plays as soon as the step appears (the original waited for an
  // in-view check, which can lag and leave a step invisible for a moment).
  const variants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: -yOffset, opacity: 1, filter: "blur(0px)" },
  };
  return (
    <motion.div initial="hidden" animate="visible" exit="hidden" variants={variants} transition={{ delay: 0.04 + delay, duration, ease: "easeOut" }} className={className}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Glass button and glass input

const glassButtonVariants = cva("relative isolate cursor-pointer rounded-full transition-all", {
  variants: { size: { default: "text-base font-medium", sm: "text-sm font-medium", lg: "text-lg font-medium", icon: "h-10 w-10" } },
  defaultVariants: { size: "default" },
});
const glassButtonTextVariants = cva("glass-button-text block", {
  variants: { size: { default: "px-6 py-3.5", sm: "px-4 py-2.5", lg: "px-8 py-4", icon: "flex h-10 w-10 items-center justify-center" } },
  defaultVariants: { size: "default" },
});

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(({ className, children, size, contentClassName, ...props }, ref) => (
  <div className={cn("glass-button-wrap relative cursor-pointer rounded-full", className)}>
    <button className={cn("glass-button", glassButtonVariants({ size }))} ref={ref} {...props}>
      <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>{children}</span>
    </button>
    <div className="glass-button-shadow pointer-events-none rounded-full" />
  </div>
));
GlassButton.displayName = "GlassButton";

function GlassField({
  label,
  showLabel,
  icon,
  action,
  children,
}: {
  label: string;
  showLabel: boolean;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full">
      <AnimatePresence>
        {showLabel && (
          <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute -top-6 left-4 z-10">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="glass-input-wrap w-full">
        <div className="glass-input">
          <span className="glass-input-text-area" />
          <div className="relative z-10 flex w-10 shrink-0 items-center justify-center pl-2 text-foreground/80">{icon}</div>
          {children}
          {action && <div className="relative z-10 w-10 shrink-0 pr-1">{action}</div>}
        </div>
      </div>
    </div>
  );
}

const inputClass = "relative z-10 h-full w-0 flex-grow bg-transparent py-3 text-base text-foreground placeholder:text-foreground/60 focus:outline-none";

function NextButton({ label, type = "button", onClick, disabled }: { label: string; type?: "button" | "submit"; onClick?: () => void; disabled?: boolean }) {
  return (
    <GlassButton type={type} onClick={onClick} disabled={disabled} size="icon" aria-label={label} contentClassName="text-foreground/80 hover:text-foreground">
      <ArrowRight className="size-5" />
    </GlassButton>
  );
}

// ---------------------------------------------------------------------------
// Background: soft, slowly floating glows in the SYNAPSE palette

function GradientBackground() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 800 600" fill="none" preserveAspectRatio="xMidYMid slice" className="absolute left-0 top-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="auth_grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--foreground)", stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: "var(--muted-foreground)", stopOpacity: 0.12 }} />
        </linearGradient>
        <linearGradient id="auth_grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "var(--muted-foreground)", stopOpacity: 0.2 }} />
          <stop offset="100%" style={{ stopColor: "var(--foreground)", stopOpacity: 0.1 }} />
        </linearGradient>
        <radialGradient id="auth_grad3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--foreground)", stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: "var(--foreground)", stopOpacity: 0 }} />
        </radialGradient>
        <filter id="auth_blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="35" /></filter>
        <filter id="auth_blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25" /></filter>
        <filter id="auth_blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45" /></filter>
      </defs>
      <g style={{ animation: "auth-float1 20s ease-in-out infinite" }}>
        <ellipse cx="200" cy="500" rx="250" ry="180" fill="url(#auth_grad1)" filter="url(#auth_blur1)" transform="rotate(-30 200 500)" />
        <rect x="500" y="100" width="300" height="250" rx="80" fill="url(#auth_grad2)" filter="url(#auth_blur2)" transform="rotate(15 650 225)" />
      </g>
      <g style={{ animation: "auth-float2 25s ease-in-out infinite" }}>
        <circle cx="650" cy="450" r="150" fill="url(#auth_grad3)" filter="url(#auth_blur3)" />
        <ellipse cx="50" cy="150" rx="180" ry="120" fill="var(--muted-foreground)" fillOpacity="0.12" filter="url(#auth_blur2)" />
      </g>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="size-5" aria-hidden="true">
      <g fillRule="evenodd" fill="none">
        <g fillRule="nonzero" transform="translate(3, 2)">
          <path fill="#4285F4" d="M57.8123233,30.1515267 C57.8123233,27.7263183 57.6155321,25.9565533 57.1896408,24.1212666 L29.4960833,24.1212666 L29.4960833,35.0674653 L45.7515771,35.0674653 C45.4239683,37.7877475 43.6542033,41.8844383 39.7213169,44.6372555 L39.6661883,45.0037254 L48.4223791,51.7870338 L49.0290201,51.8475849 C54.6004021,46.7020943 57.8123233,39.1313952 57.8123233,30.1515267" />
          <path fill="#34A853" d="M29.4960833,58.9921667 C37.4599129,58.9921667 44.1456164,56.3701671 49.0290201,51.8475849 L39.7213169,44.6372555 C37.2305867,46.3742596 33.887622,47.5868638 29.4960833,47.5868638 C21.6960582,47.5868638 15.0758763,42.4415991 12.7159637,35.3297782 L12.3700541,35.3591501 L3.26524241,42.4054492 L3.14617358,42.736447 C7.9965904,52.3717589 17.959737,58.9921667 29.4960833,58.9921667" />
          <path fill="#FBBC05" d="M12.7159637,35.3297782 C12.0932812,33.4944915 11.7329116,31.5279353 11.7329116,29.4960833 C11.7329116,27.4640054 12.0932812,25.4976752 12.6832029,23.6623884 L12.6667095,23.2715173 L3.44779955,16.1120237 L3.14617358,16.2554937 C1.14708246,20.2539019 0,24.7439491 0,29.4960833 C0,34.2482175 1.14708246,38.7380388 3.14617358,42.736447 L12.7159637,35.3297782" />
          <path fill="#EB4335" d="M29.4960833,11.4050769 C35.0347044,11.4050769 38.7707997,13.7975244 40.9011602,15.7968415 L49.2255853,7.66898166 C44.1130815,2.91684746 37.4599129,0 29.4960833,0 C17.959737,0 7.9965904,6.62018183 3.14617358,16.2554937 L12.6832029,23.6623884 C15.0758763,16.5505675 21.6960582,11.4050769 29.4960833,11.4050769" />
        </g>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The page

type Mode = "signin" | "signup";
type Step = "email" | "name" | "password" | "confirm" | "codeDest" | "code";
type ModalState = { status: "closed" } | { status: "loading"; messages: string[] } | { status: "error"; message: string } | { status: "success"; message: string };

const emailOk = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

function readError(data: unknown, fallback: string) {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join(" ");
  return fallback;
}

async function post(path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach SYNAPSE right now. Please try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readError(data, "Something went wrong. Please try again."));
  return data;
}

const HEADINGS: Record<Step, (mode: Mode, purpose: "login" | "reset") => { title: string; text: string }> = {
  email: (mode) =>
    mode === "signup"
      ? { title: "Get started with SYNAPSE", text: "Research with live sources. 110 free credits every day." }
      : { title: "Welcome back", text: "Sign in to continue your research." },
  name: () => ({ title: "What should we call you?", text: "Your name appears in your account and greetings." }),
  password: (mode) =>
    mode === "signup"
      ? { title: "Create your password", text: "Use at least 8 characters." }
      : { title: "Enter your password", text: "Welcome back. One more step." },
  confirm: () => ({ title: "One last step", text: "Confirm your password to continue." }),
  codeDest: (_m, purpose) =>
    purpose === "reset"
      ? { title: "Reset your password", text: "We'll send a 6-digit code to your email or phone." }
      : { title: "Sign in with a code", text: "No password needed. We'll send you a 6-digit code." },
  code: (_m, purpose) =>
    purpose === "reset" ? { title: "Check your messages", text: "Enter the code and choose a new password." } : { title: "Check your messages", text: "Enter the 6-digit code we sent." },
};

export function AuthComponent({ initialMode = "signin" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [purpose, setPurpose] = useState<"login" | "reset">("login");
  const [destination, setDestination] = useState("");
  const [sentTo, setSentTo] = useState<{ destination: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [modal, setModal] = useState<ModalState>({ status: "closed" });
  const [codesReady, setCodesReady] = useState(false);
  const [smsReady, setSmsReady] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const confettiRef = useRef<ConfettiRef>(null);
  const signUp = mode === "signup";

  // Already signed in: go straight on.
  useEffect(() => {
    try {
      if (localStorage.getItem(TOKEN_KEY)) window.location.replace(nextPath());
    } catch {
      /* storage unavailable */
    }
    setShowGoogle(Boolean(GOOGLE_CLIENT_ID) && !isInsideApp());
    fetch(`${API_URL}/api/auth/otp/channels`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setCodesReady(Boolean(data && (data.email || data.sms)));
        setSmsReady(Boolean(data?.sms));
      })
      .catch(() => {});
  }, []);

  // Each step's field takes focus as soon as it appears (not the first
  // email field, so phones don't pop the keyboard on page load).
  const focusOnMount = useCallback((node: HTMLInputElement | null) => {
    if (node) window.setTimeout(() => node.focus({ preventScroll: true }), 60);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const switchMode = () => {
    const next: Mode = signUp ? "signin" : "signup";
    setMode(next);
    setStep("email");
    setPassword("");
    setConfirm("");
    window.history.replaceState(null, "", withNext(next === "signin" ? "/login" : "/signup"));
  };

  const celebrate = (token: string, message: string) => {
    setModal({ status: "success", message });
    const fire = confettiRef.current?.fire;
    if (fire && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100, colors: ["#ffffff", "#a3a3a3", "#525252"] };
      fire({ ...defaults, particleCount: 50, origin: { x: 0, y: 1 }, angle: 60 });
      fire({ ...defaults, particleCount: 50, origin: { x: 1, y: 1 }, angle: 120 });
    }
    localStorage.setItem(TOKEN_KEY, token);
    window.setTimeout(() => (window.location.href = nextPath()), 1300);
  };

  const run = async (messages: string[], work: () => Promise<void>) => {
    setModal({ status: "loading", messages });
    try {
      await work();
    } catch (err) {
      setModal({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  // ---- steps ---------------------------------------------------------------
  const next = () => {
    if (step === "email" && emailOk(email)) setStep(signUp ? "name" : "password");
    else if (step === "name" && name.trim().length >= 2) setStep("password");
    else if (step === "password" && signUp && password.length >= 8) setStep("confirm");
    else if (step === "password" && !signUp && password) void signIn();
    else if (step === "confirm") void createAccount();
    else if (step === "codeDest" && destination.trim()) void sendCode();
  };

  const back = () => {
    if (step === "confirm") {
      setConfirm("");
      setStep("password");
    } else if (step === "password") setStep(signUp ? "name" : "email");
    else if (step === "name") setStep("email");
    else if (step === "code") setStep("codeDest");
    else if (step === "codeDest") setStep(purpose === "reset" ? "password" : "email");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      next();
    }
  };

  const signIn = () =>
    run(["Checking your details...", "Signing you in..."], async () => {
      const data = await post("/api/auth/login", { email: email.trim(), password });
      celebrate(data.access_token, `Welcome back, ${String(data.user?.name ?? "").split(" ")[0] || "friend"}!`);
    });

  const createAccount = () => {
    if (password !== confirm) {
      setModal({ status: "error", message: "Those passwords don't match." });
      return;
    }
    return run(["Creating your account...", "Setting things up...", "Almost there..."], async () => {
      const data = await post("/api/auth/register", { name: name.trim(), email: email.trim(), password });
      celebrate(data.access_token, "Welcome to SYNAPSE!");
    });
  };

  const google = () =>
    run(["Opening Google...", "Signing you in..."], async () => {
      const accessToken = await getGoogleAccessToken();
      const data = await post("/api/auth/google", { access_token: accessToken });
      celebrate(data.access_token, "You're in!");
    });

  const startCode = (kind: "login" | "reset") => {
    setPurpose(kind);
    setDestination(email);
    setCode("");
    setPassword("");
    setStep("codeDest");
  };

  const sendCode = () =>
    run(["Sending your code..."], async () => {
      const data = await post("/api/auth/otp/send", { destination: sentTo && step === "code" ? sentTo.destination : destination, purpose });
      setSentTo({ destination: data.destination, masked: data.masked });
      setWait(data.resend_in ?? 45);
      setCode("");
      setModal({ status: "closed" });
      setStep("code");
    });

  const verifyCode = (event?: FormEvent) => {
    event?.preventDefault();
    if (!sentTo || code.length !== 6 || (purpose === "reset" && password.length < 8)) return;
    void run(["Checking the code...", purpose === "reset" ? "Saving your new password..." : "Signing you in..."], async () => {
      const data = await post("/api/auth/otp/verify", {
        destination: sentTo.destination,
        purpose,
        code,
        new_password: purpose === "reset" ? password : undefined,
      });
      celebrate(data.access_token, purpose === "reset" ? "Password updated!" : "You're in!");
    });
  };

  const heading = HEADINGS[step](mode, purpose);
  const busy = modal.status !== "closed";
  const title = (
    <motion.div key={`title-${step}-${mode}`} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex w-full flex-col items-center gap-3 text-center">
      <BlurFade delay={step === "email" ? 0.2 : 0} className="w-full">
        <h1 className="text-balance font-serif text-[2.1rem] font-light leading-[1.1] tracking-tight text-foreground sm:text-5xl">{heading.title}</h1>
      </BlurFade>
      <BlurFade delay={step === "email" ? 0.4 : 0.15}>
        <p className="text-balance text-sm font-medium text-muted-foreground">
          {step === "code" && sentTo ? `We sent a 6-digit code to ${sentTo.masked}.` : heading.text}
        </p>
      </BlurFade>
    </motion.div>
  );

  const backButton = (
    <BlurFade delay={0.2}>
      <button type="button" onClick={back} className="mt-4 flex items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Go back
      </button>
    </BlurFade>
  );

  const linkClass = "text-sm text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline";

  return (
    <div className="auth-page flex min-h-dvh w-full flex-col overflow-x-hidden">
      <Confetti ref={confettiRef} className="pointer-events-none fixed left-0 top-0 z-[999] h-full w-full" />

      {/* Status modal: working / error / success */}
      <AnimatePresence>
        {modal.status !== "closed" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-live="polite">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-strong relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl p-8 text-center">
              {modal.status === "error" && (
                <button type="button" onClick={() => setModal({ status: "closed" })} className="absolute right-3 top-3 p-1 text-muted-foreground transition-colors hover:text-foreground" aria-label="Close">
                  <X className="size-5" />
                </button>
              )}
              {modal.status === "loading" && (
                <TextLoop interval={1.5}>
                  {modal.messages.map((message) => (
                    <div key={message} className="flex flex-col items-center gap-4">
                      <Loader className="size-12 animate-spin text-foreground" />
                      <p className="text-lg font-medium text-foreground">{message}</p>
                    </div>
                  ))}
                </TextLoop>
              )}
              {modal.status === "error" && (
                <>
                  <AlertCircle className="size-12 text-destructive" />
                  <p className="text-balance text-base font-medium text-foreground">{modal.message}</p>
                  <GlassButton onClick={() => setModal({ status: "closed" })} size="sm" className="mt-2" autoFocus>
                    Try again
                  </GlassButton>
                </>
              )}
              {modal.status === "success" && (
                <>
                  <PartyPopper className="size-12 text-foreground" />
                  <p className="text-lg font-medium text-foreground">{modal.message}</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brand: top-left on phones, centred on larger screens */}
      <div className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2 md:left-1/2 md:-translate-x-1/2">
        <SynapseMark size={22} />
        <span className="font-serif text-lg text-foreground">SYNAPSE</span>
      </div>

      <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <GradientBackground />
        </div>
        <fieldset disabled={busy} className="relative z-10 mx-auto flex w-full max-w-[22rem] flex-col items-center gap-8 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-24">
          <AnimatePresence mode="wait">{title}</AnimatePresence>

          {step === "email" && showGoogle && (
            <BlurFade delay={0.6} className="flex w-full flex-col items-center gap-4">
              <p className="text-sm font-medium text-muted-foreground">Continue with</p>
              <GlassButton type="button" onClick={() => void google()} contentClassName="flex items-center justify-center gap-2" size="sm">
                <GoogleIcon />
                <span className="font-semibold text-foreground">Google</span>
              </GlassButton>
              <div className="flex w-full items-center gap-2 py-1">
                <hr className="w-full border-border" />
                <span className="text-xs font-semibold text-muted-foreground">OR</span>
                <hr className="w-full border-border" />
              </div>
            </BlurFade>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (step === "code") verifyCode();
              else next();
            }}
            className="w-full space-y-8"
            autoComplete="on"
          >
            <AnimatePresence mode="wait">
              {step === "email" && (
                <motion.div key="email" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }}>
                  <BlurFade delay={showGoogle ? 0.8 : 0.5}>
                    <GlassField
                      label="Email"
                      showLabel={email.length > 0}
                      icon={<Mail className="size-5" />}
                      action={emailOk(email) ? <NextButton label="Continue with email" type="submit" /> : null}
                    >
                      <input type="email" name="email" autoComplete="email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKeyDown} className={inputClass} />
                    </GlassField>
                  </BlurFade>
                  <BlurFade delay={showGoogle ? 1 : 0.7} className="mt-6 flex flex-col items-center gap-3">
                    {!signUp && codesReady && (
                      <button type="button" onClick={() => startCode("login")} className={cn(linkClass, "inline-flex items-center gap-1.5")}>
                        <KeyRound className="size-4" /> Sign in with a code instead
                      </button>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {signUp ? "Already have an account?" : "New to SYNAPSE?"}{" "}
                      <button type="button" onClick={switchMode} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {signUp ? "Sign in" : "Create an account"}
                      </button>
                    </p>
                  </BlurFade>
                </motion.div>
              )}

              {step === "name" && (
                <motion.div key="name" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }}>
                  <BlurFade>
                    <GlassField label="Full name" showLabel={name.length > 0} icon={<UserRound className="size-5" />} action={name.trim().length >= 2 ? <NextButton label="Continue" type="submit" /> : null}>
                      <input ref={focusOnMount} type="text" name="name" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKeyDown} className={inputClass} />
                    </GlassField>
                  </BlurFade>
                  {backButton}
                </motion.div>
              )}

              {step === "password" && (
                <motion.div key="password" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }} className="space-y-8">
                  {/* Hidden email keeps password managers happy on this step. */}
                  <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
                  <BlurFade>
                    <GlassField
                      label="Password"
                      showLabel={password.length > 0}
                      icon={
                        password ? (
                          <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} className="rounded-full p-2 transition-colors hover:text-foreground">
                            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                          </button>
                        ) : (
                          <Lock className="size-5" />
                        )
                      }
                      action={(signUp ? password.length >= 8 : password.length > 0) ? <NextButton label={signUp ? "Continue" : "Sign in"} type="submit" /> : null}
                    >
                      <input
                        ref={focusOnMount}
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete={signUp ? "new-password" : "current-password"}
                        placeholder={signUp ? "At least 8 characters" : "Password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={onKeyDown}
                        className={inputClass}
                      />
                    </GlassField>
                  </BlurFade>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" onClick={back} className="flex items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-foreground">
                      <ArrowLeft className="size-4" /> Go back
                    </button>
                    {!signUp && codesReady && (
                      <button type="button" onClick={() => startCode("reset")} className={linkClass}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {step === "confirm" && (
                <motion.div key="confirm" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }}>
                  <BlurFade>
                    <GlassField
                      label="Confirm password"
                      showLabel={confirm.length > 0}
                      icon={
                        confirm ? (
                          <button type="button" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm((v) => !v)} className="rounded-full p-2 transition-colors hover:text-foreground">
                            {showConfirm ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                          </button>
                        ) : (
                          <Lock className="size-5" />
                        )
                      }
                      action={confirm.length >= 8 ? <NextButton label="Create account" type="submit" /> : null}
                    >
                      <input ref={focusOnMount} type={showConfirm ? "text" : "password"} name="confirm-password" autoComplete="new-password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
                    </GlassField>
                  </BlurFade>
                  {backButton}
                </motion.div>
              )}

              {step === "codeDest" && (
                <motion.div key="codeDest" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }}>
                  <BlurFade>
                    <GlassField
                      label={smsReady ? "Email or mobile number" : "Email"}
                      showLabel={destination.length > 0}
                      icon={destination && !destination.includes("@") && /\d/.test(destination) ? <Smartphone className="size-5" /> : <Mail className="size-5" />}
                      action={destination.trim().length >= 5 ? <NextButton label="Send code" type="submit" /> : null}
                    >
                      <input ref={focusOnMount} type="text" name="username" autoComplete="username" placeholder={smsReady ? "Email or +91 98765 43210" : "Email"} value={destination} onChange={(e) => setDestination(e.target.value)} onKeyDown={onKeyDown} className={inputClass} />
                    </GlassField>
                  </BlurFade>
                  {smsReady && <p className="mt-3 px-4 text-xs text-muted-foreground">Text codes work for numbers added in Settings → Account.</p>}
                  {backButton}
                </motion.div>
              )}

              {step === "code" && (
                <motion.div key="code" exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }} className="space-y-8">
                  <BlurFade>
                    <GlassField
                      label="Code"
                      showLabel={code.length > 0}
                      icon={<KeyRound className="size-5" />}
                      action={code.length === 6 && purpose === "login" ? <NextButton label="Sign in" type="submit" /> : null}
                    >
                      <input
                        ref={focusOnMount}
                        name="one-time-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className={cn(inputClass, "font-mono tracking-[0.4em] placeholder:font-sans placeholder:tracking-normal")}
                      />
                    </GlassField>
                  </BlurFade>
                  {purpose === "reset" && (
                    <BlurFade delay={0.1}>
                      <GlassField
                        label="New password"
                        showLabel={password.length > 0}
                        icon={
                          password ? (
                            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} className="rounded-full p-2 transition-colors hover:text-foreground">
                              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                            </button>
                          ) : (
                            <Lock className="size-5" />
                          )
                        }
                        action={code.length === 6 && password.length >= 8 ? <NextButton label="Set new password" type="submit" /> : null}
                      >
                        <input type={showPassword ? "text" : "password"} name="new-password" autoComplete="new-password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                      </GlassField>
                    </BlurFade>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" onClick={back} className="flex items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-foreground">
                      <ArrowLeft className="size-4" /> Go back
                    </button>
                    <button type="button" disabled={wait > 0} onClick={() => void sendCode()} className={cn(linkClass, "disabled:no-underline disabled:opacity-60")}>
                      {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </fieldset>
      </div>

      <p className="relative z-10 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] text-muted-foreground">
        Created by <span className="text-foreground">Revoori Ashwath Reddy</span> · <span className="text-foreground">HumanForm Studios</span>
      </p>
    </div>
  );
}

export default AuthComponent;
