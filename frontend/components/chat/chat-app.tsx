"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, FileSearch, GraduationCap, Menu, Scale, Search, Sparkles, SquarePen } from "lucide-react";
import ClaudeChatInput, { type ChatInputSubmit, type Model } from "@/components/ui/claude-style-chat-input";
import {
  ApiError,
  DEFAULT_SETTINGS,
  api,
  clearToken,
  getToken,
  isAuthError,
  needsUpgrade,
  streamChat,
  type BillingStatus,
  type Conversation,
  type StoredMessage,
  type SettingsResponse,
  type StreamEvent,
  type User,
  type UserSettings,
} from "@/lib/api";
import { watchSystemTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { AssistantMessage, ConversationSkeleton, UserMessage, type UIMessage } from "./messages";
import { Sidebar } from "./sidebar";
import { SynapseMark } from "./synapse-mark";
import { resetLabel } from "./credit-meter";
import { SettingsDialog } from "./settings-dialog";

const EASE = [0.2, 0, 0, 1] as const;

// The selector's ids are sent to the backend as `mode`. Descriptions show the credit cost.
function researchModes(billing: BillingStatus | null): Model[] {
  const costs = billing?.costs ?? { web: 1, academic: 1, deep: 3 };
  const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;
  return [
    { id: "web", name: "Web research", description: `Fast answer with live web sources · ${credits(costs.web)}` },
    { id: "academic", name: "Academic", description: `Formal, evidence-focused explanation · ${credits(costs.academic)}` },
    billing && !billing.deep_research
      ? { id: "deep", name: "Deep research", description: "Detailed investigation · Pro and Max", badge: "Pro" }
      : { id: "deep", name: "Deep research", description: `Detailed investigation, advanced search · ${credits(costs.deep ?? 3)}` },
  ];
}

const ACCEPTED_FILES = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md,.csv,.json";

const SUGGESTIONS = [
  {
    label: "Research",
    icon: Search,
    prompts: [
      "What are the latest breakthroughs in fusion energy?",
      "How is AI being used in drug discovery right now?",
      "What does current research say about the health effects of intermittent fasting?",
    ],
  },
  {
    label: "Compare",
    icon: Scale,
    prompts: [
      "Compare solar and wind power for a small town.",
      "Python or JavaScript: which should a complete beginner learn first?",
      "Compare the economic ideas of Keynes and Hayek.",
    ],
  },
  {
    label: "Learn",
    icon: GraduationCap,
    prompts: [
      "Explain how large language models are trained, step by step.",
      "Teach me the basics of how vaccines work.",
      "What is quantum entanglement, in simple terms?",
    ],
  },
  {
    label: "Analyze a file",
    icon: FileSearch,
    prompts: [
      "Summarize the attached document in five key points.",
      "What are the main arguments in the attached paper?",
      "Describe what is shown in the attached image.",
    ],
  },
];

function routeConversationId(pathname: string | null) {
  const match = pathname?.match(/^\/chat\/([A-Za-z0-9_-]+)\/?$/);
  return match ? match[1] : null;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `m-${Date.now().toString(36)}-${keyCounter}`;
}

function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return newKey();
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function fallbackQuery(fileCount: number, pastedCount: number) {
  if (pastedCount && !fileCount) return "Analyze the pasted text.";
  return fileCount + pastedCount === 1 ? "Analyze the attached file." : "Analyze the attached files.";
}

function fromStored(message: StoredMessage): UIMessage {
  return {
    key: `db-${message.id}`,
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    sources: message.sources,
    thinking: message.thinking || undefined,
    search: message.role === "assistant" && message.sources.length ? { state: "done" } : undefined,
    status: "done",
  };
}

function Splash() {
  return (
    <div className="grid h-dvh place-items-center bg-background">
      <SynapseMark size={40} animate title="Loading SYNAPSE" />
    </div>
  );
}

function BootError({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="grid h-dvh place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <SynapseMark size={36} className="mx-auto mb-5" />
        <h1 className="font-serif text-2xl text-card-foreground">SYNAPSE can&rsquo;t load right now</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatApp() {
  const router = useRouter();
  const pathname = usePathname();
  const routeId = routeConversationId(pathname);

  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>();
  const [openSuggestion, setOpenSuggestion] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [languages, setLanguages] = useState<string[] | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const lastFilesRef = useRef<File[]>([]);
  const lastModeRef = useRef("web");
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const signOut = useCallback(() => {
    abortRef.current?.abort();
    clearToken();
    router.replace("/login");
  }, [router]);

  const showToast = useCallback((text: string) => setToast(text), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ---- Sign-in check and chat list -------------------------------------
  const boot = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setBootError(null);

    try {
      // Settings load alongside the account so the first screen already uses them.
      const [me, saved] = await Promise.all([
        api<{ user: User }>("/api/auth/me"),
        api<SettingsResponse>("/api/settings").catch(() => null),
      ]);
      if (saved) {
        setSettings(saved.settings);
        setLanguages(saved.options.languages);
      }
      setUser(me.user);
    } catch (error) {
      // 401 = bad/expired login, 404 = the account no longer exists.
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) signOut();
      else setBootError(error instanceof Error ? error.message : "Could not reach the backend.");
      return;
    }

    api<BillingStatus>("/api/billing/status").then(setBilling).catch(() => {});

    try {
      const list = await api<{ conversations: Conversation[] }>("/api/conversations");
      setConversations(list.conversations);
    } catch (error) {
      if (isAuthError(error)) return signOut();
      setBootError(
        error instanceof ApiError && error.status === 404
          ? "The backend is running an older version without chat history. Restart the backend so it loads the latest backend/app/main.py."
          : error instanceof Error
            ? error.message
            : "Could not load your chats.",
      );
    }
  }, [router, signOut]);

  useEffect(() => {
    boot();
  }, [boot]);

  // "System" theme follows the device's light/dark setting live.
  useEffect(() => watchSystemTheme(), []);

  // ---- Sidebar collapse (remembered per browser) -------------------------
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("synapse_sidebar") === "collapsed");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("synapse_sidebar", next ? "collapsed" : "open");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  // ---- Opening chats -----------------------------------------------------
  const loadConversation = useCallback(
    async (id: string | null) => {
      abortRef.current?.abort();
      activeIdRef.current = id;
      setActiveId(id);
      setMobileOpen(false);
      setOpenSuggestion(null);
      setShowJump(false);
      lastFilesRef.current = [];
      stickToBottomRef.current = true;
      setMessages([]);

      if (!id) {
        setLoadingChat(false);
        return;
      }

      setLoadingChat(true);
      try {
        const data = await api<{ conversation: Conversation; messages: StoredMessage[] }>(`/api/conversations/${id}`);
        if (activeIdRef.current !== id) return;

        const loaded = data.messages.map(fromStored);
        const last = data.messages[data.messages.length - 1];
        // A question whose answer was stopped before any words arrived.
        if (last?.role === "user") {
          loaded.push({ key: `missing-${last.id}`, role: "assistant", content: "", status: "stopped" });
        }
        const lastMode = [...data.messages].reverse().find((message) => message.mode)?.mode;
        if (lastMode) lastModeRef.current = lastMode;

        setMessages(loaded);
        setLoadingChat(false);
      } catch (error) {
        if (activeIdRef.current !== id) return;
        setLoadingChat(false);
        if (isAuthError(error)) return signOut();
        showToast(
          error instanceof ApiError && error.status === 404
            ? "That chat no longer exists."
            : error instanceof Error
              ? error.message
              : "Could not open that chat.",
        );
        activeIdRef.current = null;
        setActiveId(null);
        window.history.replaceState(null, "", "/");
      }
    },
    [showToast, signOut],
  );

  const navigate = useCallback(
    (id: string | null) => {
      const url = id ? `/chat/${id}` : "/";
      if (window.location.pathname !== url) window.history.pushState(null, "", url);
      loadConversation(id);
    },
    [loadConversation],
  );

  // Direct visits to /chat/<id> and the browser's back/forward buttons.
  useEffect(() => {
    if (!user) return;
    if (routeId === activeIdRef.current) return;
    loadConversation(routeId);
  }, [routeId, user, loadConversation]);

  // ---- Scrolling ---------------------------------------------------------
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distance < 80;
    setShowJump(distance > 240);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottomRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const inConversation = messages.length > 0 || loadingChat;

  // Follow the answer as it grows, unless the reader has scrolled up.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const element = scrollRef.current;
      if (element && stickToBottomRef.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [inConversation]);

  // ---- Sending and streaming ---------------------------------------------
  const runStream = useCallback(
    async (options: { query: string; mode: string; files: File[]; regenerate: boolean; userMessage?: UIMessage }) => {
      const { query, mode, files, regenerate, userMessage } = options;
      const assistantKey = newKey();
      const requestId = newRequestId();
      let streamConversationId = activeIdRef.current;

      setMessages((previous) => {
        const next = [...previous];
        if (regenerate) {
          while (next.length && next[next.length - 1].role === "assistant") next.pop();
        }
        if (userMessage) next.push(userMessage);
        next.push({
          key: assistantKey,
          role: "assistant",
          content: "",
          status: "pending",
          animate: true,
          // The web-search block appears only if the server actually searches.
        });
        return next;
      });
      requestAnimationFrame(() => scrollToBottom(true));

      const controller = new AbortController();
      abortRef.current = controller;
      requestIdRef.current = requestId;
      streamingRef.current = true;
      setIsStreaming(true);

      const update = (change: (message: UIMessage) => UIMessage) =>
        setMessages((previous) => previous.map((message) => (message.key === assistantKey ? change(message) : message)));

      const form = new FormData();
      form.append("query", query);
      form.append("mode", mode);
      form.append("request_id", requestId);
      if (activeIdRef.current) form.append("conversation_id", activeIdRef.current);
      if (regenerate) form.append("regenerate", "true");
      files.forEach((file) => form.append("files", file, file.name));

      const onEvent = (event: StreamEvent) => {
        switch (event.type) {
          case "meta": {
            streamConversationId = event.conversation_id;
            if (event.credits) {
              const credits = event.credits;
              setBilling((current) => (current ? { ...current, credits } : current));
            }
            if (!activeIdRef.current) {
              activeIdRef.current = event.conversation_id;
              setActiveId(event.conversation_id);
              window.history.replaceState(null, "", `/chat/${event.conversation_id}`);
            }
            const stamp = new Date().toISOString();
            setConversations((previous) => {
              const existing = previous.find((item) => item.id === event.conversation_id);
              return [
                { id: event.conversation_id, title: existing?.title ?? event.title, created_at: existing?.created_at ?? stamp, updated_at: stamp },
                ...previous.filter((item) => item.id !== event.conversation_id),
              ];
            });
            break;
          }
          case "status":
            if (event.stage === "searching") update((m) => ({ ...m, search: { state: "searching", query: event.query } }));
            break;
          case "sources":
            update((m) => ({
              ...m,
              sources: event.sources,
              search: {
                state: !event.enabled ? "off" : event.error ? "error" : "done",
                query: event.query,
                error: event.error,
              },
            }));
            break;
          case "thinking":
            update((m) => ({
              ...m,
              status: "streaming",
              thinking: (m.thinking ?? "") + event.text,
              thinkingStartedAt: m.thinkingStartedAt ?? Date.now(),
            }));
            break;
          case "delta":
            update((m) => ({
              ...m,
              status: "streaming",
              content: m.content + event.text,
              thinkingSeconds:
                m.thinkingSeconds ??
                (m.thinkingStartedAt ? Math.max(1, Math.round((Date.now() - m.thinkingStartedAt) / 1000)) : undefined),
            }));
            break;
          case "done":
            update((m) => ({ ...m, id: event.message_id, status: "done" }));
            break;
          case "stopped":
            update((m) => ({ ...m, status: "stopped" }));
            break;
          case "error":
            update((m) => ({ ...m, status: "error", error: event.message }));
            break;
        }
      };

      try {
        await streamChat(form, onEvent, controller.signal);
        update((m) =>
          m.status === "pending" || m.status === "streaming"
            ? { ...m, status: "error", error: "The connection closed before the answer finished." }
            : m,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          update((m) => (m.status === "pending" || m.status === "streaming" ? { ...m, status: "stopped" } : m));
        } else if (isAuthError(error)) {
          signOut();
        } else {
          update((m) => ({
            ...m,
            status: "error",
            error: error instanceof Error ? error.message : "Something went wrong.",
            upgrade: needsUpgrade(error),
            search: needsUpgrade(error) ? undefined : m.search,
          }));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (requestIdRef.current === requestId) requestIdRef.current = null;
        streamingRef.current = false;
        setIsStreaming(false);
        // Credits may have been refunded (stopped / failed answers).
        api<BillingStatus>("/api/billing/status").then(setBilling).catch(() => {});
        if (streamConversationId) {
          const id = streamConversationId;
          const stamp = new Date().toISOString();
          setConversations((previous) => {
            const found = previous.find((item) => item.id === id);
            return found ? [{ ...found, updated_at: stamp }, ...previous.filter((item) => item.id !== id)] : previous;
          });
        }
      }
    },
    [scrollToBottom, signOut],
  );

  const send = useCallback(
    (submission: ChatInputSubmit) => {
      if (streamingRef.current) return;
      const files = [
        ...submission.files.map((item) => item.file),
        ...submission.pastedContent.map(
          (paste, index) => new File([paste.content], `pasted-text-${index + 1}.txt`, { type: "text/plain" }),
        ),
      ];
      const query =
        submission.message.trim() || fallbackQuery(submission.files.length, submission.pastedContent.length);
      // Extended thinking switches the request to Deep research.
      const mode = submission.isThinkingEnabled ? "deep" : submission.model;
      lastFilesRef.current = files;
      lastModeRef.current = mode;
      setOpenSuggestion(null);
      runStream({
        query,
        mode,
        files,
        regenerate: false,
        userMessage: { key: newKey(), role: "user", content: query, attachments: files.map((file) => file.name), status: "done" },
      });
    },
    [runStream],
  );

  const stop = useCallback(() => {
    const requestId = requestIdRef.current;
    if (requestId) {
      api("/api/chat/stop", { method: "POST", body: JSON.stringify({ request_id: requestId }) }).catch(() => {});
    }
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (streamingRef.current) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;

    if (activeIdRef.current) {
      runStream({ query: lastUser.content, mode: lastModeRef.current, files: lastFilesRef.current, regenerate: true });
      return;
    }

    // The chat was never created (the first request failed), so send it again.
    setMessages([]);
    runStream({
      query: lastUser.content,
      mode: lastModeRef.current,
      files: lastFilesRef.current,
      regenerate: false,
      userMessage: { ...lastUser, key: newKey() },
    });
  }, [messages, runStream]);

  // ---- Rename / delete -----------------------------------------------------
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const previousTitle = conversations.find((item) => item.id === id)?.title;
      setConversations((previous) => previous.map((item) => (item.id === id ? { ...item, title } : item)));
      try {
        const result = await api<{ conversation: Conversation }>(`/api/conversations/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
        setConversations((previous) =>
          previous.map((item) => (item.id === id ? { ...item, title: result.conversation.title } : item)),
        );
      } catch (error) {
        if (isAuthError(error)) return signOut();
        setConversations((previous) =>
          previous.map((item) => (item.id === id ? { ...item, title: previousTitle ?? item.title } : item)),
        );
        showToast(error instanceof Error ? error.message : "Could not rename the chat.");
      }
    },
    [conversations, showToast, signOut],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await api(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((previous) => previous.filter((item) => item.id !== id));
        if (activeIdRef.current === id) navigate(null);
        showToast("Chat deleted.");
      } catch (error) {
        if (isAuthError(error)) return signOut();
        showToast(error instanceof Error ? error.message : "Could not delete the chat.");
      }
    },
    [navigate, showToast, signOut],
  );

  const clearAllChats = useCallback(() => {
    setConversations([]);
    navigate(null);
  }, [navigate]);

  const activeTitle = conversations.find((item) => item.id === activeId)?.title;
  const modes = useMemo(() => researchModes(billing), [billing]);

  useEffect(() => {
    document.title = activeTitle ? `${activeTitle} — SYNAPSE` : "SYNAPSE — AI Research";
  }, [activeTitle]);

  if (bootError) return <BootError message={bootError} onRetry={boot} onSignOut={signOut} />;
  if (!user) return <Splash />;

  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const suggestion = SUGGESTIONS.find((item) => item.label === openSuggestion);
  const credits = billing?.credits;
  const lowCredits = credits && credits.remaining <= Math.max(2, Math.floor(credits.limit * 0.2));

  // Shown above the input box when credits are running low (like Claude's usage notice).
  const creditNotice = lowCredits && credits && (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2 text-xs text-muted-foreground"
      role="status"
    >
      <span>
        <span className={credits.remaining === 0 ? "font-medium text-destructive" : "font-medium text-card-foreground"}>
          {credits.remaining === 0 ? "You're out of credits" : `${credits.remaining} credit${credits.remaining === 1 ? "" : "s"} left`}
        </span>{" "}
        · {resetLabel(credits)}
      </span>
      {billing?.plan !== "max" && (
        <Link href="/pricing" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Sparkles className="size-3.5" /> Upgrade
        </Link>
      )}
    </motion.div>
  );

  // Deep research can be the default only on plans that include it.
  const defaultMode =
    settings.default_mode === "deep" && billing && !billing.deep_research ? "web" : settings.default_mode;

  const composer = (position: "center" | "bottom") => (
    <motion.div layoutId="synapse-composer" transition={{ type: "spring", stiffness: 260, damping: 32 }} className="w-full">
      <ClaudeChatInput
        key={defaultMode}
        className="max-w-3xl"
        models={modes}
        defaultModel={defaultMode}
        placeholder={position === "center" ? "What would you like to research today?" : "Reply to SYNAPSE..."}
        accept={ACCEPTED_FILES}
        isStreaming={isStreaming}
        onStop={stop}
        prefill={position === "center" ? prefill : undefined}
        footerText={position === "bottom" ? "SYNAPSE can make mistakes. Please double-check responses." : ""}
        onSendMessage={send}
      />
    </motion.div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapsed={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        onNewChat={() => navigate(null)}
        onSelect={(id) => navigate(id)}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onSignOut={signOut}
        onOpenSettings={() => {
          setMobileOpen(false);
          setSettingsOpen(true);
        }}
        billing={billing}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        billing={billing}
        settings={settings}
        languages={languages}
        onSettingsChange={setSettings}
        onUserChange={setUser}
        onChatsCleared={clearAllChats}
        onSignOut={signOut}
        onToast={showToast}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 px-2 md:px-5 box-content pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="size-5" />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            {activeTitle && (
              <motion.h1
                key={activeTitle}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="min-w-0 truncate text-sm font-medium text-card-foreground"
              >
                {activeTitle}
              </motion.h1>
            )}
          </AnimatePresence>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => navigate(null)}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            aria-label="New chat"
          >
            <SquarePen className="size-[18px]" />
          </button>
        </header>

        {inConversation ? (
          <>
            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} onScroll={handleScroll} className="synapse-scroll h-full overflow-y-auto">
                <div ref={contentRef} className="mx-auto w-full max-w-3xl px-4 pb-8 pt-2 md:px-6 md:pb-10">
                  {loadingChat ? (
                    <ConversationSkeleton />
                  ) : (
                    <div className="space-y-5">
                      {messages.map((message, index) =>
                        message.role === "user" ? (
                          <UserMessage key={message.key} message={message} />
                        ) : (
                          <AssistantMessage
                            key={message.key}
                            message={message}
                            isLast={index === messages.length - 1}
                            canRetry={!isStreaming}
                            onRetry={retry}
                            showThinking={settings.show_thinking}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
              <AnimatePresence>
                {showJump && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => scrollToBottom(true)}
                    className="absolute bottom-3 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-popover text-foreground shadow-lg shadow-black/30 transition-colors hover:bg-accent"
                    aria-label="Scroll to the latest message"
                  >
                    <ArrowDown className="size-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <div className="shrink-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-3 md:px-6">
              <div className="mx-auto w-full max-w-3xl">
                {creditNotice}
                {composer("bottom")}
              </div>
            </div>
          </>
        ) : (
          <div className="synapse-scroll flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4">
            <div className="flex w-full max-w-3xl flex-1 flex-col justify-center pb-[8vh]">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="mb-7 flex items-center justify-center gap-3 sm:mb-9"
              >
                <SynapseMark size={40} className="synapse-mark--intro" />
                <h1 className="font-serif text-[2rem] font-light leading-tight tracking-tight text-card-foreground sm:text-[2.6rem]">
                  {greeting()}, {firstName}
                </h1>
              </motion.div>

              {creditNotice}
              {composer("center")}

              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.45, ease: EASE }}
                className="mt-4 flex flex-wrap justify-center gap-2"
              >
                {SUGGESTIONS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOpenSuggestion((current) => (current === label ? null : label))}
                    aria-expanded={openSuggestion === label}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      openSuggestion === label && "bg-accent text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </motion.div>

              <div className="sm:min-h-[11rem]">
                <AnimatePresence mode="wait">
                  {suggestion && (
                    <motion.ul
                      key={suggestion.label}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      className="mx-auto mt-3 max-w-2xl divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/50"
                    >
                      {suggestion.prompts.map((prompt) => (
                        <li key={prompt}>
                          <button
                            type="button"
                            onClick={() => {
                              setPrefill({ text: prompt, nonce: Date.now() });
                              setOpenSuggestion(null);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
                          >
                            {prompt}
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <p className="pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-center text-xs text-muted-foreground">
              SYNAPSE · Created by <span className="text-foreground">Revoori Ashwath Reddy</span> · <span className="text-foreground">HumanForm Studios</span>
            </p>
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-2xl shadow-black/40"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
