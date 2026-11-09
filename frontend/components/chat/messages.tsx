"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  CornerDownRight,
  FileText,
  Globe,
  Layers,
  Plus,
  ImageIcon,
  Lightbulb,
  BookOpen,
  Search,
  Route,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { ShiningText } from "@/components/ui/shining-text";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/api";
import { Markdown, domainOf, useCopy } from "./markdown";
import { SynapseMark } from "./synapse-mark";
import { useSmoothText } from "./use-smooth-text";

export type SearchState = {
  state: "searching" | "done" | "off" | "error";
  query?: string;
  error?: string | null;
};

/** One step of the autonomous research agent (plan, search or read a page). */
export type AgentStep = { kind: "plan" | "search" | "read"; text: string; url?: string };

export type UIMessage = {
  key: string;
  id?: number | null;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
  sources?: Source[];
  search?: SearchState;
  /** What the agent did before answering, shown live. */
  steps?: AgentStep[];
  thinking?: string;
  thinkingStartedAt?: number;
  thinkingSeconds?: number;
  status: "pending" | "streaming" | "done" | "error" | "stopped";
  error?: string;
  /** The error is a plan limit: show a link to the pricing page. */
  upgrade?: boolean;
  /** Streamed in this session: reveal smoothly. Loaded history appears at once. */
  animate?: boolean;
};

const EASE = [0.2, 0, 0, 1] as const;

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function CopyAction({ text, label = "Copy" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <IconButton label={copied ? "Copied" : label} onClick={() => copy(text)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "done" : "copy"}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

export function UserMessage({ message }: { message: UIMessage }) {
  const attachments = message.attachments ?? [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="group/user flex flex-col items-end gap-1.5 pl-8 sm:pl-24"
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {attachments.map((name, index) => (
            <span
              key={`${name}-${index}`}
              className="glass inline-flex max-w-[16rem] items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground"
            >
              {isImageName(name) ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      )}
      <div className="glass glass-sheen max-w-full rounded-[22px] rounded-br-md px-4 py-2.5">
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-card-foreground">
          {message.content}
        </p>
      </div>
      <div className="flex h-8 items-center opacity-0 transition-opacity duration-200 group-hover/user:opacity-100 focus-within:opacity-100 touch:opacity-100">
        <CopyAction text={message.content} label="Copy message" />
      </div>
    </motion.div>
  );
}

function Favicon({ url }: { url: string }) {
  const domain = domainOf(url);
  const [failed, setFailed] = useState(false);
  if (failed || !domain) {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded-[5px] bg-muted text-[9px] font-semibold uppercase text-muted-foreground">
        {domain.charAt(0) || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-4 shrink-0 rounded-[4px]"
    />
  );
}

/** Perplexity-style row of source cards that scrolls sideways. */
function SourceCards({ sources }: { sources: Source[] }) {
  return (
    <div className="source-row mb-4">
      {sources.map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="glass flex w-44 shrink-0 flex-col justify-between gap-2 rounded-2xl p-3 transition-transform hover:-translate-y-0.5 active:scale-[0.98] sm:w-48"
        >
          <span className="line-clamp-2 text-[13px] leading-snug text-card-foreground">{source.title}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Favicon url={source.url} />
            <span className="truncate">{domainOf(source.url)}</span>
            <span className="ml-auto shrink-0 opacity-70">{index + 1}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/** Full list for the Sources tab, with a short excerpt from each page. */
function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ol className="space-y-2">
      {sources.map((source, index) => (
        <li key={`${source.url}-${index}`}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass block rounded-2xl p-3.5 transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Favicon url={source.url} />
              <span className="truncate">{domainOf(source.url)}</span>
              <span className="ml-auto shrink-0">{index + 1}</span>
            </span>
            <span className="mt-1.5 block font-medium leading-snug text-card-foreground">{source.title}</span>
            {source.content && (
              <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-muted-foreground">{source.content}</span>
            )}
          </a>
        </li>
      ))}
    </ol>
  );
}

function SearchingPill({ query }: { query?: string }) {
  return (
    <div className="glass-pill mb-4 inline-flex max-w-full items-center gap-2 px-3.5 py-1.5 text-sm text-muted-foreground" role="status">
      <Globe className="size-4 shrink-0 animate-pulse text-primary" />
      <ShiningText text="Searching the web..." />
      {query && <span className="hidden truncate text-xs opacity-70 sm:inline">{query}</span>}
    </div>
  );
}

const STEP_ICON = { plan: Route, search: Search, read: BookOpen } as const;
const STEP_LABEL = { plan: "", search: "Searched", read: "Read" } as const;

/** The agent's steps: open while it works, then folds into "Researched in N steps". */
function AgentSteps({ steps, working }: { steps: AgentStep[]; working: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = working || open;
  const searches = steps.filter((step) => step.kind === "search").length;
  const reads = steps.filter((step) => step.kind === "read").length;
  const summary = [
    searches && `${searches} search${searches === 1 ? "" : "es"}`,
    reads && `${reads} page${reads === 1 ? "" : "s"} read`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={working}
        className="inline-flex items-center gap-2 rounded-xl px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
        aria-expanded={expanded}
      >
        <Route className={cn("size-4", working && "text-primary")} />
        {working ? (
          <ShiningText text="Researching on its own..." />
        ) : (
          <span>
            Researched in {steps.length} step{steps.length === 1 ? "" : "s"}
            {summary && <span className="opacity-70"> · {summary}</span>}
          </span>
        )}
        {!working && <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mt-1 space-y-1.5 overflow-hidden border-l-2 border-border pl-4"
          >
            {steps.map((step, index) => {
              const Icon = STEP_ICON[step.kind];
              const last = working && index === steps.length - 1;
              return (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", last && "animate-pulse text-primary")} />
                  <span className="min-w-0 break-words">
                    {STEP_LABEL[step.kind] && <span className="font-medium text-foreground/80">{STEP_LABEL[step.kind]} </span>}
                    {step.kind === "read" && step.url ? (
                      <a href={step.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">
                        {step.text}
                      </a>
                    ) : step.kind === "search" ? (
                      <span>&ldquo;{step.text}&rdquo;</span>
                    ) : (
                      <span>{step.text}</span>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingBlock({ message, active }: { message: UIMessage; active: boolean }) {
  const [open, setOpen] = useState(false);
  const seconds = message.thinkingSeconds;
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <Lightbulb className={cn("size-4", active && "text-primary")} />
        {active ? (
          <ShiningText text="Thinking..." />
        ) : (
          <span>{seconds ? `Thought for ${seconds} second${seconds === 1 ? "" : "s"}` : "Thought process"}</span>
        )}
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
              {message.thinking}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type AssistantMessageProps = {
  message: UIMessage;
  isLast: boolean;
  canRetry: boolean;
  onRetry: () => void;
  /** Settings → Show thinking. */
  showThinking?: boolean;
  /** Follow-up questions shown under the latest answer. */
  related?: string[];
  onAsk?: (question: string) => void;
};

export function AssistantMessage({ message, isLast, canRetry, onRetry, showThinking = true, related, onAsk }: AssistantMessageProps) {
  const shown = useSmoothText(message.content, Boolean(message.animate));
  const generating = message.status === "pending" || message.status === "streaming";
  const revealing = generating || shown.length < message.content.length;
  const searching = message.search?.state === "searching";
  const steps = message.steps ?? [];
  const agentWorking = generating && !message.content && !message.thinking && steps.length > 0;
  const thinkingShown = showThinking && Boolean(message.thinking);
  const waitingForWords = generating && !message.content && !searching && !thinkingShown && !agentWorking;
  const thinkingActive = generating && !message.content && Boolean(message.thinking);
  const sources = message.sources ?? [];
  const hasSources = sources.length > 0 && message.search?.state !== "searching";
  const [tab, setTab] = useState<"answer" | "sources">("answer");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="group/assistant"
    >
      {steps.length > 0 && <AgentSteps steps={steps} working={agentWorking} />}
      {message.search?.state === "searching" && steps.length === 0 && <SearchingPill query={message.search.query} />}

      {hasSources && (
        <div role="tablist" aria-label="Answer views" className="glass-pill mb-3 inline-flex items-center gap-1 p-1">
          {(["answer", "sources"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                tab === value ? "bg-foreground/90 text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "answer" ? <Sparkles className="size-3.5" /> : <Layers className="size-3.5" />}
              {value === "answer" ? "Answer" : `Sources · ${sources.length}`}
            </button>
          ))}
        </div>
      )}
      {(message.search?.state === "error" || (message.search?.state === "done" && !hasSources)) && (
        <p className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="size-3.5" /> {message.search?.state === "error" ? "Web search unavailable" : "No web results"}
        </p>
      )}

      {hasSources && tab === "sources" ? (
        <SourceList sources={sources} />
      ) : (
      <>
      {hasSources && <SourceCards sources={sources} />}

      {thinkingShown && <ThinkingBlock message={message} active={thinkingActive} />}

      {waitingForWords && (
        <div className="mb-2" role="status" aria-live="polite">
          <ShiningText text="SYNAPSE is thinking..." />
        </div>
      )}

      {shown && (
        <div className="synapse-prose">
          <Markdown text={shown} sources={message.sources} />
        </div>
      )}
      </>
      )}

      {message.status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{message.error || "Something went wrong."}</span>
          {message.upgrade && (
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-3.5" /> View plans
            </Link>
          )}
        </div>
      )}

      {message.status === "stopped" && !generating && (
        <p className="mt-2 text-xs text-muted-foreground">
          {message.content ? "Response stopped." : "No response was saved for this message."}
        </p>
      )}

      <div className="mt-2 flex h-9 items-center gap-0.5">
        {revealing ? (
          <SynapseMark size={26} animate className="ml-0.5" />
        ) : (
          <div
            className={cn(
              "flex items-center gap-0.5 transition-opacity duration-200",
              isLast ? "opacity-100" : "opacity-0 group-hover/assistant:opacity-100 focus-within:opacity-100 touch:opacity-100",
            )}
          >
            {message.content && <CopyAction text={message.content} />}
            {isLast && canRetry && (
              <IconButton label="Retry" onClick={onRetry}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {isLast && !revealing && related && related.length > 0 && onAsk && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="mt-4"
        >
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-card-foreground">
            <CornerDownRight className="size-4 text-primary" /> Related
          </p>
          <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
            {related.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => onAsk(question)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] text-foreground transition-colors hover:bg-accent active:bg-accent"
                >
                  <span>{question}</span>
                  <Plus className="size-4 shrink-0 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading chat">
      {[0, 1].map((row) => (
        <div key={row} className="space-y-3">
          <div className="h-11 w-2/5 animate-pulse rounded-2xl bg-muted" />
          <div className="space-y-2">
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
