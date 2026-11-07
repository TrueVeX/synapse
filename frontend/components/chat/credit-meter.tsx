"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { CreditInfo } from "@/lib/api";

export function resetLabel(credits: CreditInfo) {
  const when = new Date(credits.resets_at);
  if (credits.window === "day") {
    return `Resets ${when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  }
  return `Resets ${when.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

/** Credits left in the current day / month, with a thin progress bar. */
export function CreditMeter({ credits, compact = false }: { credits: CreditInfo; compact?: boolean }) {
  const left = Math.max(credits.limit - credits.used, 0);
  const share = credits.limit ? left / credits.limit : 0;
  const low = share <= 0.2;

  return (
    <div className={cn("w-full", compact ? "space-y-1.5" : "space-y-2")}>
      <div className={cn("flex items-baseline justify-between gap-2", compact ? "text-xs" : "text-sm")}>
        <span className={cn("font-medium", low ? "text-destructive" : "text-card-foreground")}>
          {left.toLocaleString("en-IN")} of {credits.limit.toLocaleString("en-IN")} credits left
        </span>
        <span className="shrink-0 text-muted-foreground">{resetLabel(credits)}</span>
      </div>
      <div
        className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2")}
        role="meter"
        aria-label="Credits left"
        aria-valuemin={0}
        aria-valuemax={credits.limit}
        aria-valuenow={left}
      >
        <motion.div
          className={cn("h-full rounded-full", low ? "bg-destructive" : "bg-primary")}
          initial={false}
          animate={{ width: `${Math.max(share * 100, left > 0 ? 3 : 0)}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
        />
      </div>
    </div>
  );
}
