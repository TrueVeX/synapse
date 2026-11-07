import * as React from "react";
import { cn } from "@/lib/utils";
export function InputGroup({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("flex h-11 items-center rounded-xl border border-border bg-input/30 pr-2 focus-within:border-ring",className)} {...props}/>;}
export function InputGroupInput({className,...props}:React.InputHTMLAttributes<HTMLInputElement>){return <input className={cn("h-full min-w-0 flex-1 bg-transparent px-3 text-base sm:text-sm text-foreground outline-none placeholder:text-muted-foreground",className)} {...props}/>;}
export function InputGroupAddon({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("flex items-center",className)} {...props}/>;}
export function InputGroupButton({className,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={cn("rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground",className)} {...props}/>;}
