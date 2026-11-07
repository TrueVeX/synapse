import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement,React.InputHTMLAttributes<HTMLInputElement>>(({className,...props},ref)=>
 <input ref={ref} className={cn("h-11 w-full rounded-xl border border-border bg-input/30 px-3 text-base sm:text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",className)} {...props}/>);
Input.displayName="Input";
