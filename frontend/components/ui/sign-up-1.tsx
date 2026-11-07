"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FancyButton } from "@/components/ui/sign-up-1-utils/fancy-button";
import { Icons } from "@/components/ui/sign-up-1-utils/icons";
import { EyeIcon, EyeOffIcon, Globe, Loader2, Quote, ShieldCheck, Sparkles } from "lucide-react";
import { API_URL, TOKEN_KEY } from "@/lib/api";
import { GOOGLE_CLIENT_ID, getGoogleAccessToken, isInsideApp } from "@/lib/google";
import { nextPath, withNext } from "@/lib/next-url";

type Mode = "signup" | "login";

const COPY = {
  signup: {
    title: "Create your account",
    subtitle: "Get started in just a few steps.",
    submit: "Create Account",
    busy: "Creating account…",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue your research.",
    submit: "Sign In",
    busy: "Signing in…",
    switchText: "New to SYNAPSE?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
} as const;

function readError(data: unknown, fallback: string) {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join(" ");
  return fallback;
}

export function SignUp({ mode = "signup" }: { mode?: Mode }) {
  const copy = COPY[mode];
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [switchHref, setSwitchHref] = useState<string>(copy.switchHref);
  const [showGoogle, setShowGoogle] = useState(false);

  // Already signed in: go straight on. Keep ?next= when switching pages.
  useEffect(() => {
    setSwitchHref(withNext(copy.switchHref));
    setShowGoogle(Boolean(GOOGLE_CLIENT_ID) && !isInsideApp());
    try {
      if (localStorage.getItem(TOKEN_KEY)) window.location.replace(nextPath());
    } catch {
      /* storage unavailable */
    }
  }, [copy.switchHref]);

  function finish(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    window.location.href = nextPath();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy("form");
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, mode === "signup" ? "Could not create your account." : "Sign in failed."));
      finish(data.access_token);
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach SYNAPSE right now. Please try again." : err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  async function continueWithGoogle() {
    setError("");
    setBusy("google");
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
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(null);
    }
  }

  return (
    <main className="w-full max-w-xl rounded-4xl lg:max-w-4xl lg:bg-muted lg:p-1">
      <section className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-3xl bg-card p-6 shadow-elevated-lg sm:p-8">
          <div className="flex flex-col items-center gap-4">
            <Link href="/" aria-label="SYNAPSE home">
              <FancyButton type="button" size="icon-lg" className="size-14 rounded-xl" tabIndex={-1}>
                <Icons.Logo className="size-9" />
              </FancyButton>
            </Link>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-card-foreground">{copy.title}</h1>
              <p className="text-md text-muted-foreground">{copy.subtitle}</p>
            </div>
          </div>

          {showGoogle && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full gap-3 rounded-xl text-[15px] [&>svg]:size-5"
                onClick={continueWithGoogle}
                disabled={busy !== null}
              >
                {busy === "google" ? <Loader2 className="animate-spin" /> : <Icons.Google />}
                Continue with Google
              </Button>

              <div className="relative text-center text-xs text-muted-foreground uppercase before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border/50 before:content-['']">
                <span className="relative bg-card px-2">or with email</span>
              </div>
            </>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <Field className="gap-1">
                <FieldLabel htmlFor="name" className="gap-0">
                  Full Name <span className="text-primary">*</span>
                </FieldLabel>
                <Input
                  id="name"
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Your name"
                  className="h-11"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            )}

            <Field className="gap-1">
              <FieldLabel htmlFor="email" className="gap-0">
                Email <span className="text-primary">*</span>
              </FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-11"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field className="gap-1">
              <FieldLabel htmlFor="password" className="gap-0">
                Password <span className="text-primary">*</span>
              </FieldLabel>
              <InputGroup className="h-11 rounded-xl border-border">
                <InputGroupInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={mode === "signup" ? 8 : 1}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••••"}
                  className="h-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-sm"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            {error && (
              <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}

            <FancyButton type="submit" className="mt-1 h-11" disabled={busy !== null}>
              {busy === "form" && <Loader2 className="size-4 animate-spin" />}
              {busy === "form" ? copy.busy : copy.submit}
            </FancyButton>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {copy.switchText}{" "}
            <Button asChild variant="link" className="h-auto p-0">
              <Link href={switchHref}>{copy.switchLink}</Link>
            </Button>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            Created by <span className="text-foreground">Revoori Ashwath Reddy</span> · <span className="text-foreground">HumanForm Studios</span>
          </p>
        </div>

        {/* SYNAPSE: what you get, in place of the demo's testimonial */}
        <div className="hidden lg:flex lg:flex-col lg:justify-end lg:p-12">
          <div className="mt-auto flex flex-col gap-6">
            <Quote className="size-8 text-primary/70" />
            <p className="text-lg leading-relaxed text-card-foreground">
              Ask anything. SYNAPSE searches the web, reads your files and writes a{" "}
              <span className="font-medium text-primary">cited answer</span> you can trust and check.
            </p>
            <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2.5">
                <Globe className="size-4 text-primary" /> Live web sources on every answer
              </li>
              <li className="flex items-center gap-2.5">
                <Sparkles className="size-4 text-primary" /> 10 free credits every day
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-primary" /> Your chats stay private to your account
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SignUp;
