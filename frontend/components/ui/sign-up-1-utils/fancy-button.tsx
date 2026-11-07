"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type FancyButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "icon-lg" = square logo tile used at the top of the sign-in card */
  size?: "default" | "icon-lg";
};

export function FancyButton({ className, size = "default", ...props }: FancyButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_0_30px_color-mix(in_srgb,var(--primary)_20%,transparent)] transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60",
        size === "icon-lg" && "size-12 p-0",
        className,
      )}
      {...props}
    />
  );
}
