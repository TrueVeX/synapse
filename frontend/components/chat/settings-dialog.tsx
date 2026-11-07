"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  Database,
  Download,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  UserRoundCog,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  api,
  type BillingStatus,
  type ResponseStyle,
  type User,
  type UserSettings,
} from "@/lib/api";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { initialsOf } from "./sidebar";

const EASE = [0.2, 0, 0, 1] as const;

export type SettingsTab = "general" | "personalization" | "data" | "account";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings2 }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "personalization", label: "Personalization", icon: UserRoundCog },
  { id: "data", label: "Data controls", icon: Database },
  { id: "account", label: "Account", icon: UserRound },
];

const STYLES: { id: ResponseStyle; label: string; hint: string }[] = [
  { id: "default", label: "Default", hint: "Balanced answers" },
  { id: "concise", label: "Concise", hint: "Short and direct" },
  { id: "detailed", label: "Detailed", hint: "Thorough, with examples" },
  { id: "formal", label: "Formal", hint: "Professional tone" },
  { id: "friendly", label: "Friendly", hint: "Warm and simple" },
];

const MODES = [
  { id: "web", label: "Web research" },
  { id: "academic", label: "Academic" },
  { id: "deep", label: "Deep research" },
] as const;

const FALLBACK_LANGUAGES = ["auto", "English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Spanish", "French", "German", "Arabic", "Japanese", "Chinese"];

const LIMIT = 1500;

// ---------------------------------------------------------------------------
// Small building blocks

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="py-1">
      {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({ label, description, children, stack }: { label: string; description?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-3 py-4", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-card-foreground">{label}</div>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("shrink-0", !stack && "sm:max-w-[60%]")}>{children}</div>
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full min-w-44 cursor-pointer rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none transition-colors hover:bg-accent focus-visible:border-ring sm:h-9 sm:w-auto sm:text-sm"
    >
      {children}
    </select>
  );
}

function ActionButton({
  children,
  onClick,
  danger,
  busy,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-60 sm:h-9",
        danger
          ? "border-red-500/40 text-red-500 hover:bg-red-500/10 dark:text-red-400"
          : "border-border text-foreground hover:bg-accent",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  requireText,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  requireText?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [open]);
  const ready = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={busy ? undefined : onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</div>
            {requireText && (
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={requireText}
                autoComplete="off"
                aria-label="Type your email to confirm"
                className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring sm:text-sm"
              />
            )}
            {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!ready || busy}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Tabs

function GeneralTab({
  settings,
  languages,
  billing,
  onChange,
}: {
  settings: UserSettings;
  languages: string[];
  billing: BillingStatus | null;
  onChange: (changes: Partial<UserSettings>) => void;
}) {
  const [theme, setThemeState] = useState<ThemeChoice>("dark");
  useEffect(() => setThemeState(getTheme()), []);

  const themes: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <>
      <Section title="Appearance">
        <Row label="Theme" description="Saved on this device.">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background p-1">
            {themes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => {
                  setTheme(id);
                  setThemeState(id);
                }}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
                  theme === id ? "bg-accent font-medium text-card-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Responses">
        <Row label="Response language" description="SYNAPSE replies in this language. Auto matches the language you write in.">
          <SelectBox label="Response language" value={settings.language} onChange={(language) => onChange({ language })}>
            {languages.map((language) => (
              <option key={language} value={language}>
                {language === "auto" ? "Auto (match my message)" : language}
              </option>
            ))}
          </SelectBox>
        </Row>
        <Row label="Default research mode" description="The mode selected when you start a new chat.">
          <SelectBox
            label="Default research mode"
            value={settings.default_mode}
            onChange={(value) => onChange({ default_mode: value as UserSettings["default_mode"] })}
          >
            {MODES.map((mode) => (
              <option key={mode.id} value={mode.id} disabled={mode.id === "deep" && billing !== null && !billing.deep_research}>
                {mode.label}
                {mode.id === "deep" && billing !== null && !billing.deep_research ? " (Pro)" : ""}
              </option>
            ))}
          </SelectBox>
        </Row>
        <Row label="Show thinking" description="Show the AI's reasoning panel above answers when the model shares it.">
          <Switch
            checked={settings.show_thinking}
            onCheckedChange={(show_thinking) => onChange({ show_thinking })}
            aria-label="Show thinking"
          />
        </Row>
      </Section>
    </>
  );
}

function PersonalizationTab({
  settings,
  onChange,
  onSaveText,
}: {
  settings: UserSettings;
  onChange: (changes: Partial<UserSettings>) => void;
  onSaveText: (changes: Pick<UserSettings, "about_me" | "instructions">) => Promise<boolean>;
}) {
  const [about, setAbout] = useState(settings.about_me);
  const [wishes, setWishes] = useState(settings.instructions);
  const [saving, setSaving] = useState(false);
  const dirty = about !== settings.about_me || wishes !== settings.instructions;

  useEffect(() => {
    setAbout(settings.about_me);
    setWishes(settings.instructions);
  }, [settings.about_me, settings.instructions]);

  const textarea = (value: string, set: (value: string) => void, placeholder: string, label: string) => (
    <div>
      <textarea
        value={value}
        onChange={(event) => set(event.target.value.slice(0, LIMIT))}
        placeholder={placeholder}
        aria-label={label}
        rows={4}
        disabled={!settings.personalization_enabled}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-base leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50 sm:text-sm"
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {value.length}/{LIMIT}
      </div>
    </div>
  );

  return (
    <>
      <Section>
        <Row label="Use personalization" description="Let SYNAPSE use what you share below in every new answer.">
          <Switch
            checked={settings.personalization_enabled}
            onCheckedChange={(personalization_enabled) => onChange({ personalization_enabled })}
            aria-label="Use personalization"
          />
        </Row>
        <Row label="Response style" description="How SYNAPSE writes its answers." stack>
          <div role="radiogroup" aria-label="Response style" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={settings.style === style.id}
                onClick={() => onChange({ style: style.id })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  settings.style === style.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <div className="text-sm font-medium text-card-foreground">{style.label}</div>
                <div className="text-xs text-muted-foreground">{style.hint}</div>
              </button>
            ))}
          </div>
        </Row>
        <Row label="What should SYNAPSE know about you?" description="For example your field of study, your work or your interests." stack>
          {textarea(about, setAbout, "I'm a final-year medical student in Hyderabad, interested in cardiology research...", "About you")}
        </Row>
        <Row label="How should SYNAPSE respond?" description="Any preferences for format, tone or detail." stack>
          {textarea(wishes, setWishes, "Use simple language, give examples, and end with a short summary...", "How SYNAPSE should respond")}
        </Row>
      </Section>
      <div className="sticky bottom-0 z-10 -mx-5 flex justify-end gap-2 border-t border-border bg-popover px-5 py-3 sm:-mx-8 sm:px-8">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            setAbout(settings.about_me);
            setWishes(settings.instructions);
          }}
          className="h-9 rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSaveText({ about_me: about, instructions: wishes });
            setSaving(false);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
      </div>
    </>
  );
}

function DataTab({ onToast, onChatsCleared }: { onToast: (text: string) => void; onChatsCleared: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportChats() {
    setExporting(true);
    try {
      const data = await api<unknown>("/api/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `synapse-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast("Your chats were downloaded.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't export your chats.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Section>
        <Row label="Export chats" description="Download all your chats, sources and settings as a JSON file.">
          <ActionButton onClick={exportChats} busy={exporting} icon={<Download className="size-4" />}>
            Export
          </ActionButton>
        </Row>
        <Row label="Delete all chats" description="Permanently remove every chat in your history. This can't be undone.">
          <ActionButton danger onClick={() => { setError(null); setConfirm(true); }} icon={<Trash2 className="size-4" />}>
            Delete all
          </ActionButton>
        </Row>
      </Section>
      <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
        Your chats are stored securely and used only to show your history. Files you attach are read for that answer and are not saved.
      </p>
      <ConfirmDialog
        open={confirm}
        title="Delete all chats?"
        body="Every chat in your history will be permanently deleted. This can't be undone."
        confirmLabel="Delete all"
        busy={deleting}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api("/api/conversations", { method: "DELETE" });
            setConfirm(false);
            onChatsCleared();
            onToast("All chats deleted.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't delete your chats.");
          } finally {
            setDeleting(false);
          }
        }}
      />
    </>
  );
}

function AccountTab({
  user,
  billing,
  onUserChange,
  onSignOut,
  onToast,
}: {
  user: User;
  billing: BillingStatus | null;
  onUserChange: (user: User) => void;
  onSignOut: () => void;
  onToast: (text: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(user.name), [user.name]);
  const nameDirty = name.trim() !== user.name && name.trim().length > 0;

  async function saveName() {
    setSavingName(true);
    try {
      const result = await api<{ user: User }>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      onUserChange(result.user);
      onToast("Name updated.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't update your name.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 pb-2">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-base font-semibold text-background">
          {initialsOf(user.name)}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium text-card-foreground">{user.name}</div>
          <div className="truncate text-sm text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <Section>
        <Row label="Full name" description="What SYNAPSE calls you.">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (nameDirty) saveName();
            }}
          >
            <input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              aria-label="Full name"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring sm:h-9 sm:w-56 sm:text-sm"
            />
            <button
              type="submit"
              disabled={!nameDirty || savingName}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 sm:h-9"
            >
              {savingName && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
          </form>
        </Row>
        <Row label="Email" description="Used to sign in. It can't be changed.">
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </Row>
        <Row
          label="Plan"
          description={billing ? `${billing.plan_name} · ${billing.credits.remaining} of ${billing.credits.limit} credits left` : "Your plan and credits."}
        >
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent sm:h-9"
          >
            <Sparkles className="size-4 text-primary" />
            {billing?.plan === "max" ? "Manage plan" : "Upgrade"}
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </Row>
        <Row label="Sign out" description="Sign out of SYNAPSE on this device.">
          <ActionButton onClick={onSignOut} icon={<LogOut className="size-4" />}>
            Sign out
          </ActionButton>
        </Row>
        <Row label="Delete account" description="Permanently delete your account, chats and settings. This can't be undone.">
          <ActionButton danger onClick={() => { setError(null); setConfirm(true); }} icon={<Trash2 className="size-4" />}>
            Delete account
          </ActionButton>
        </Row>
      </Section>
      <ConfirmDialog
        open={confirm}
        title="Delete your account?"
        body={
          <>
            Your account, all chats and settings will be permanently deleted. Any paid plan time left is lost. Type{" "}
            <span className="font-medium text-card-foreground">{user.email}</span> to confirm.
          </>
        }
        requireText={user.email}
        confirmLabel="Delete account"
        busy={deleting}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api("/api/auth/me", { method: "DELETE", body: JSON.stringify({ confirm_email: user.email }) });
            onSignOut();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't delete your account.");
            setDeleting(false);
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

export function SettingsDialog({
  open,
  initialTab = "general",
  onClose,
  user,
  billing,
  settings,
  languages,
  onSettingsChange,
  onUserChange,
  onChatsCleared,
  onSignOut,
  onToast,
}: {
  open: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  user: User;
  billing: BillingStatus | null;
  settings: UserSettings;
  languages?: string[];
  onSettingsChange: (settings: UserSettings) => void;
  onUserChange: (user: User) => void;
  onChatsCleared: () => void;
  onSignOut: () => void;
  onToast: (text: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Let a confirm dialog handle Escape first.
      if (event.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** Saves right away and rolls back if the server refuses. */
  const save = useCallback(
    async (changes: Partial<UserSettings>) => {
      const previous = settings;
      onSettingsChange({ ...settings, ...changes });
      try {
        const result = await api<{ settings: UserSettings }>("/api/settings", { method: "PUT", body: JSON.stringify(changes) });
        onSettingsChange(result.settings);
        return true;
      } catch (err) {
        onSettingsChange(previous);
        onToast(err instanceof Error ? err.message : "Couldn't save your settings.");
        return false;
      }
    },
    [settings, onSettingsChange, onToast],
  );

  const active = TABS.find((item) => item.id === tab)!;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2, ease: EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground shadow-2xl sm:h-[min(640px,88dvh)] sm:max-w-4xl sm:flex-row sm:rounded-2xl sm:border sm:border-border"
          >
            {/* Navigation: a side list on larger screens, scrollable tabs on phones */}
            <nav className="shrink-0 border-b border-border pt-[env(safe-area-inset-top)] sm:w-56 sm:border-b-0 sm:border-r sm:bg-sidebar sm:pt-0">
              <div className="flex h-14 items-center justify-between px-4 sm:h-auto sm:px-5 sm:pb-3 sm:pt-5">
                <h2 id="settings-title" className="font-serif text-xl text-card-foreground">
                  Settings
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="synapse-scroll flex gap-1 overflow-x-auto px-3 pb-2 sm:flex-col sm:overflow-visible sm:px-3">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={(event) => {
                      setTab(id);
                      // Phones: keep the chosen tab visible in the scrolling tab strip.
                      event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                    }}
                    aria-current={tab === id ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors sm:w-full",
                      tab === id
                        ? "bg-sidebar-accent font-medium text-card-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="hidden h-14 shrink-0 items-center justify-between px-8 pt-2 sm:flex">
                <h3 className="text-base font-semibold text-card-foreground">{active.label}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="synapse-scroll min-h-0 flex-1 overflow-y-auto px-5 sm:px-8">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    className="pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: EASE }}
                  >
                    {tab === "general" && (
                      <GeneralTab settings={settings} languages={languages ?? FALLBACK_LANGUAGES} billing={billing} onChange={save} />
                    )}
                    {tab === "personalization" && (
                      <PersonalizationTab
                        settings={settings}
                        onChange={save}
                        onSaveText={async (changes) => {
                          const ok = await save(changes);
                          if (ok) onToast("Personalization saved.");
                          return ok;
                        }}
                      />
                    )}
                    {tab === "data" && <DataTab onToast={onToast} onChatsCleared={onChatsCleared} />}
                    {tab === "account" && (
                      <AccountTab user={user} billing={billing} onUserChange={onUserChange} onSignOut={onSignOut} onToast={onToast} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
