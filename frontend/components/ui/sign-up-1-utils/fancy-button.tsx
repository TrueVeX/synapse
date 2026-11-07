"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
export function FancyButton({className,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={cn("rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_0_30px_color-mix(in_srgb,var(--primary)_20%,transparent)] transition hover:-translate-y-0.5 hover:bg-primary/90",className)} {...props}/>;}
