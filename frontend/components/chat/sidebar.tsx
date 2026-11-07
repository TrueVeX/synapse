"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, User } from "@/lib/api";
import { SynapseMark } from "./synapse-mark";

const EASE = [0.2, 0, 0, 1] as const;

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Closes a popover when the user clicks outside it or presses Escape. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

function Popover({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.14, ease: EASE }}
          className={cn(
            "absolute z-40 min-w-44 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-2xl shadow-black/40",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuItem({
  icon,
  children,
  danger,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent",
        danger && "text-destructive",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onAskDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => Promise<void>;
  onAskDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const title = draft.trim();
    setEditing(false);
    if (title && title !== conversation.title) await onRename(title);
    else setDraft(conversation.title);
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="px-1 py-0.5">
        <input
          autoFocus
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => submit()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(conversation.title);
              setEditing(false);
            }
          }}
          aria-label="Chat name"
          className="h-10 md:h-9 w-full rounded-lg border border-ring bg-background px-2.5 text-base md:text-sm text-foreground outline-none"
        />
      </form>
    );
  }

  return (
    <div ref={menuRef} className="group/row relative">
      <button
        type="button"
        onClick={onSelect}
        title={conversation.title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 md:h-9 w-full items-center rounded-lg pl-2.5 pr-10 text-left text-[15px] md:text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-card-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-card-foreground",
        )}
      >
        <span className="truncate">{conversation.title}</span>
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-label={`Options for ${conversation.title}`}
        className={cn(
          "absolute right-1 top-1/2 grid size-8 md:size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground",
          menuOpen || active ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 touch:opacity-100",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <Popover open={menuOpen} className="right-0 top-10 origin-top-right">
        <MenuItem
          icon={<Pencil className="size-4" />}
          onClick={() => {
            setMenuOpen(false);
            setDraft(conversation.title);
            setEditing(true);
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          danger
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            setMenuOpen(false);
            onAskDelete();
          }}
        >
          Delete
        </MenuItem>
      </Popover>
    </div>
  );
}

function DeleteDialog({
  conversation,
  onCancel,
  onConfirm,
}: {
  conversation: Conversation | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!conversation) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [conversation, onCancel]);

  return (
    <AnimatePresence>
      {conversation && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl"
          >
            <h2 id="delete-chat-title" className="text-lg font-semibold text-card-foreground">
              Delete chat?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              &ldquo;{conversation.title}&rdquo; will be permanently deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={onConfirm}
                className="h-9 rounded-lg bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type SidebarProps = {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSignOut: () => void;
};

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-card-foreground"
    >
      {children}
    </button>
  );
}

function SidebarPanel({
  compact,
  onRequestDelete,
  ...props
}: SidebarProps & { compact: boolean; onRequestDelete: (conversation: Conversation) => void }) {
  const { user, conversations, activeId } = props;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useDismiss(userMenuOpen, () => setUserMenuOpen(false));
  const initials = initialsOf(user.name);
  const isMobile = !compact && props.mobileOpen;

  const avatar = (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
      {initials}
    </span>
  );

  if (compact) {
    return (
      <div className="flex h-full flex-col items-center gap-1 py-3">
        <RailButton label="Open sidebar" onClick={props.onToggleCollapsed}>
          <PanelLeftOpen className="size-[18px]" />
        </RailButton>
        <button
          type="button"
          onClick={props.onNewChat}
          title="New chat"
          aria-label="New chat"
          className="mt-1 grid size-9 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95"
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Plus className="size-4" />
          </span>
        </button>
        <RailButton label="Chats" onClick={props.onToggleCollapsed}>
          <MessagesSquare className="size-[18px]" />
        </RailButton>
        <div className="flex-1" />
        <div ref={userMenuRef} className="relative">
          <button type="button" onClick={() => setUserMenuOpen((value) => !value)} aria-label="Account menu">
            {avatar}
          </button>
          <Popover open={userMenuOpen} className="bottom-11 left-0 origin-bottom-left">
            <div className="px-2.5 py-2 text-xs text-muted-foreground">{user.email}</div>
            <MenuItem icon={<LogOut className="size-4" />} onClick={props.onSignOut}>
              Sign out
            </MenuItem>
          </Popover>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 max-w-full flex-col">
      <div className="flex h-14 items-center justify-between px-3 mt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 pl-1">
          <SynapseMark size={22} />
          <span className="font-serif text-xl tracking-tight text-card-foreground">SYNAPSE</span>
        </div>
        {isMobile ? (
          <RailButton label="Close sidebar" onClick={props.onCloseMobile}>
            <X className="size-[18px]" />
          </RailButton>
        ) : (
          <RailButton label="Collapse sidebar" onClick={props.onToggleCollapsed}>
            <PanelLeftClose className="size-[18px]" />
          </RailButton>
        )}
      </div>

      <div className="px-2">
        <button
          type="button"
          onClick={props.onNewChat}
          className="group flex h-10 w-full items-center gap-2.5 rounded-lg px-1.5 text-sm font-medium text-card-foreground transition-colors hover:bg-sidebar-accent/70"
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-transform group-hover:scale-105 group-active:scale-95">
            <Plus className="size-4" />
          </span>
          New chat
        </button>
      </div>

      <div className="mt-4 px-4 pb-1 text-xs font-medium text-muted-foreground">Recents</div>
      <nav className="synapse-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Recent chats">
        {conversations.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">Your chats will appear here.</p>
        ) : (
          <motion.ul layout className="space-y-0.5">
            <AnimatePresence initial={false}>
              {conversations.map((conversation) => (
                <motion.li
                  key={conversation.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <ConversationRow
                    conversation={conversation}
                    active={conversation.id === activeId}
                    onSelect={() => props.onSelect(conversation.id)}
                    onRename={(title) => props.onRename(conversation.id, title)}
                    onAskDelete={() => onRequestDelete(conversation)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </nav>

      <div ref={userMenuRef} className="relative border-t border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setUserMenuOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent/70"
          aria-label="Account menu"
        >
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-card-foreground">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
        <Popover open={userMenuOpen} className="bottom-14 left-2 right-2 origin-bottom">
          <MenuItem icon={<LogOut className="size-4" />} onClick={props.onSignOut}>
            Sign out
          </MenuItem>
        </Popover>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const { mobileOpen, onCloseMobile } = props;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCloseMobile();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop: full sidebar or a slim rail */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] md:block",
          props.collapsed ? "w-14" : "w-72",
        )}
      >
        <SidebarPanel {...props} mobileOpen={false} compact={props.collapsed} onRequestDelete={setDeleteTarget} />
      </aside>

      {/* Phones: slide-in drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial="closed" animate="open" exit="closed">
            <motion.div
              className="absolute inset-0 bg-black/60"
              variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
              onClick={onCloseMobile}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 max-w-[85vw] border-r border-border bg-sidebar shadow-2xl"
              variants={{ open: { x: 0 }, closed: { x: "-100%" } }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <SidebarPanel {...props} compact={false} onRequestDelete={setDeleteTarget} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <DeleteDialog
        conversation={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) await props.onDelete(target.id);
        }}
      />
    </>
  );
}
