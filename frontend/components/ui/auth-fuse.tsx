"use client";

// Auth Fuse (21st.dev) adapted for SYNAPSE: real sign-in / sign-up / Google
// sign-in, SYNAPSE colours and liquid glass, and SYNAPSE's own panel instead
// of the demo photos and quotes. Switching between "Sign in" and "Sign up"
// keeps the address (/login or /signup) and any ?next= in sync.

import * as React from "react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff, Globe, Layers, Loader2, Mic, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_URL, TOKEN_KEY } from "@/lib/api";
import { GOOGLE_CLIENT_ID, getGoogleAccessToken, isInsideApp } from "@/lib/google";
import { nextPath, withNext } from "@/lib/next-url";
import { SynapseMark } from "@/components/chat/synapse-mark";

// ---------------------------------------------------------------------------
// Typewriter

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({ text, speed = 100, cursor = "|", loop = false, deleteSpeed = 50, delay = 1500, className }: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);
  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else if (displayText.length > 0) {
          setDisplayText((prev) => prev.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentIndex(0);
          setTextArrayIndex((prev) => (prev + 1) % textArray.length);
        }
      },
      isDeleting ? deleteSpeed : speed,
    );
    return () => clearTimeout(timeout);
  }, [currentIndex, isDeleting, currentText, loop, speed, deleteSpeed, delay, displayText, textArray.length]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse text-primary">{cursor}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Primitives

const labelVariants = cva("text-sm font-medium leading-none text-card-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70");

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />);
Label.displayName = LabelPrimitive.Root.displayName;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90",
        outline: "glass-pill rounded-xl text-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        lg: "h-12 px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-xl border border-input bg-background/40 px-3.5 text-base text-foreground transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:bg-background/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(({ className, label, ...props }, ref) => {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="grid w-full items-center gap-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <Input id={id} type={showPassword ? "text" : "password"} className={cn("pe-11", className)} ref={ref} {...props} />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 end-0 flex h-full w-11 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Forms

type Mode = "signin" | "signup";

function readError(data: unknown, fallback: string) {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join(" ");
  return fallback;
}

function finish(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.location.href = nextPath();
}

function AuthForm({ mode }: { mode: Mode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signUp = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/${signUp ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signUp ? { name, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, signUp ? "Could not create your account." : "Sign in failed."));
      finish(data.access_token);
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach SYNAPSE right now. Please try again." : err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="flex flex-col gap-7">
      <div className="flex flex-col items-center gap-2 text-center">
        <SynapseMark size={36} className="mb-1" />
        <h1 className="font-serif text-[1.75rem] font-normal leading-tight text-card-foreground">
          {signUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-balance text-sm text-muted-foreground">
          {signUp ? "110 free credits every day. No card needed." : "Sign in to continue your research."}
        </p>
      </div>
      <div className="grid gap-4">
        {signUp && (
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" type="text" placeholder="Your name" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordInput
          name="password"
          label="Password"
          required
          minLength={signUp ? 8 : undefined}
          autoComplete={signUp ? "new-password" : "current-password"}
          placeholder={signUp ? "At least 8 characters" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-1" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? (signUp ? "Creating account…" : "Signing in…") : signUp ? "Create account" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}

function AuthFormContainer({ isSignIn, onToggle }: { isSignIn: boolean; onToggle: () => void }) {
  const [showGoogle, setShowGoogle] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");

  useEffect(() => setShowGoogle(Boolean(GOOGLE_CLIENT_ID) && !isInsideApp()), []);

  async function continueWithGoogle() {
    setGoogleError("");
    setGoogleBusy(true);
    try {
      const accessToken = await getGoogleAccessToken();
      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, "Google sign-in failed."));
      finish(data.access_token);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="glass-strong glass-sheen mx-auto grid w-full max-w-[400px] gap-3 rounded-[28px] p-6 sm:p-8">
      <AuthForm key={isSignIn ? "signin" : "signup"} mode={isSignIn ? "signin" : "signup"} />
      <div className="text-center text-sm text-muted-foreground">
        {isSignIn ? "New to SYNAPSE?" : "Already have an account?"}
        <Button variant="link" type="button" className="h-auto px-1.5 py-2" onClick={onToggle}>
          {isSignIn ? "Create an account" : "Sign in"}
        </Button>
      </div>
      {showGoogle && (
        <>
          <div className="relative text-center text-xs uppercase tracking-wider text-muted-foreground after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-border">
            <span className="relative z-10 rounded-full bg-popover px-2.5 py-0.5">Or continue with</span>
          </div>
          <Button variant="outline" type="button" onClick={continueWithGoogle} disabled={googleBusy}>
            {googleBusy ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>
          {googleError && (
            <p role="alert" className="text-center text-sm text-destructive">
              {googleError}
            </p>
          )}
        </>
      )}
      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        Created by <span className="text-foreground">Revoori Ashwath Reddy</span> · <span className="text-foreground">HumanForm Studios</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page

const CONTENT = {
  signin: {
    lines: ["Welcome back. Your research continues.", "Every answer shows its sources.", "Ask anything. Check everything."],
  },
  signup: {
    lines: ["Research that shows its work.", "Live web search with real citations.", "Start free. 110 credits every day."],
  },
} as const;

const FEATURES = [
  { icon: Globe, text: "Live web search with numbered citations" },
  { icon: Layers, text: "Three research modes, from quick to deep" },
  { icon: Mic, text: "Ask by voice, in 17 languages" },
  { icon: ShieldCheck, text: "Your files and payments stay private" },
];

export function AuthUI({ initialMode = "signin" }: { initialMode?: Mode }) {
  const [isSignIn, setIsSignIn] = useState(initialMode === "signin");

  // Already signed in: go straight on.
  useEffect(() => {
    try {
      if (localStorage.getItem(TOKEN_KEY)) window.location.replace(nextPath());
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleForm = () => {
    const next = !isSignIn;
    setIsSignIn(next);
    window.history.replaceState(null, "", withNext(next ? "/login" : "/signup"));
  };

  const content = isSignIn ? CONTENT.signin : CONTENT.signup;

  return (
    <div className="w-full min-h-dvh md:grid md:grid-cols-2">
      <style>{`input[type="password"]::-ms-reveal, input[type="password"]::-ms-clear { display: none; }`}</style>

      <div className="flex min-h-dvh items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] md:min-h-0 md:py-12">
        <AuthFormContainer isSignIn={isSignIn} onToggle={toggleForm} />
      </div>

      {/* SYNAPSE panel (desktop and tablets) */}
      <div className="hidden p-4 md:block">
        <div className="glass glass-sheen relative flex h-full min-h-[560px] flex-col justify-between overflow-hidden rounded-[32px] p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-[#9c87f5]/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <SynapseMark size={28} />
            <span className="font-serif text-2xl text-card-foreground">SYNAPSE</span>
          </div>
          <div className="relative flex flex-1 items-center justify-center">
            <SynapseMark size={150} animate className="opacity-90 drop-shadow-[0_0_40px_rgba(217,119,87,0.45)]" />
          </div>
          <div className="relative space-y-6">
            <blockquote className="space-y-2">
              <p className="min-h-[4.5rem] font-serif text-[1.75rem] font-light leading-snug text-card-foreground">
                <Typewriter key={isSignIn ? "in" : "up"} text={[...content.lines]} speed={55} loop delay={2200} />
              </p>
              <cite className="block text-sm not-italic text-muted-foreground">SYNAPSE · HumanForm Studios</cite>
            </blockquote>
            <ul className="grid gap-2.5">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-foreground">
                  <span className="glass-pill grid size-8 shrink-0 place-items-center text-primary">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthUI;
