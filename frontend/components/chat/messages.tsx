"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Globe,
  ImageIcon,
  Lightbulb,
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

export type UIMessage = {
  key: string;
  id?: number | null;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
  sources?: Source[];
  search?: SearchState;
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
              className="inline-flex max-w-[16rem] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
            >
              {isImageName(name) ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      )}
      <div className="max-w-full rounded-2xl rounded-br-md bg-popover px-4 py-2.5 shadow-sm shadow-black/20">
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

function WebSearchBlock({ search, sources }: { search: SearchState; sources: Source[] }) {
  const [open, setOpen] = useState(false);

  if (search.state === "searching") {
    return (
      <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground" role="status">
        <Globe className="size-4 animate-pulse text-primary" />
        <ShiningText text="Searching the web..." />
      </div>
    );
  }

  const label =
    search.state === "error" ? "Web search unavailable" : sources.length ? "Searched the web" : "No web results";

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => sources.length && setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors",
          sources.length > 0 && "hover:bg-accent hover:text-foreground",
        )}
        aria-expanded={open}
        title={search.error ?? search.query}
      >
        <Globe className="size-4" />
        <span>{label}</span>
        {sources.length > 0 && <span className="text-xs opacity-70">{sources.length} results</span>}
        {sources.length > 0 && (
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        )}
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
            <ol className="mt-2 max-w-xl space-y-0.5 rounded-xl border border-border bg-card/40 p-1.5">
              {sources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold uppercase text-muted-foreground">
                      {domainOf(source.url).charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{source.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{domainOf(source.url)}</span>
                  </a>
                </li>
              ))}
            </ol>
          </motion.div>
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
};

export function AssistantMessage({ message, isLast, canRetry, onRetry, showThinking = true }: AssistantMessageProps) {
  const shown = useSmoothText(message.content, Boolean(message.animate));
  const generating = message.status === "pending" || message.status === "streaming";
  const revealing = generating || shown.length < message.content.length;
  const searching = message.search?.state === "searching";
  const thinkingShown = showThinking && Boolean(message.thinking);
  const waitingForWords = generating && !message.content && !searching && !thinkingShown;
  const thinkingActive = generating && !message.content && Boolean(message.thinking);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="group/assistant"
    >
      {message.search && message.search.state !== "off" && (
        <WebSearchBlock search={message.search} sources={message.sources ?? []} />
      )}

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
