"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Search, ShieldCheck } from "lucide-react";
import { SynapseMark } from "@/components/chat/synapse-mark";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { FancyButton } from "@/components/ui/sign-up-1-utils/fancy-button";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export default function SignUp() {
 const [show,setShow]=useState(false),[name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError("");setBusy(true);
  try { const r=await fetch(`${API}/api/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})}); const d=await r.json(); if(!r.ok)throw new Error(d.detail||"Could not create account"); localStorage.setItem("synapse_token",d.access_token); window.location.href="/"; }
  catch(err){setError(err instanceof Error?err.message:"Connection failed. Is the backend running?");} finally{setBusy(false);}
 }
 return <main className="grid min-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl lg:grid-cols-[1fr_0.85fr]">
  <section className="flex flex-col justify-center p-7 sm:p-10">
   <Link href="/login" className="mb-10 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><SynapseMark size={24}/> SYNAPSE</Link>
   <div className="mb-7"><p className="mb-3 text-xs font-semibold uppercase tracking-[.25em] text-primary">Your research workspace</p><h1 className="text-3xl font-semibold tracking-tight text-foreground">Create your account</h1><p className="mt-2 text-sm text-muted-foreground">One workspace for questions, research and ideas.</p></div>
   <form onSubmit={submit} className="flex flex-col gap-4">
    <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input id="name" required minLength={2} autoComplete="name" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></Field>
    <Field><FieldLabel htmlFor="password">Password</FieldLabel><InputGroup><InputGroupInput id="password" type={show?"text":"password"} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)}/><InputGroupAddon><InputGroupButton type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide password":"Show password"}>{show?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</InputGroupButton></InputGroupAddon></InputGroup></Field>
    {error&&<p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <FancyButton type="submit" disabled={busy} className="mt-2 h-12">{busy?"Creating account…":"Create free account"}</FancyButton>
   </form>
   <p className="mt-6 text-center text-sm text-muted-foreground">Already registered? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></p>
   <p className="mt-6 text-center text-xs text-muted-foreground">By continuing, you agree to use SYNAPSE responsibly.</p>
   <p className="mt-3 text-center text-xs text-muted-foreground">Created by Revoori Ashwath Reddy</p>
  </section>
  <aside className="relative hidden flex-col justify-between overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_color-mix(in_srgb,var(--primary)_28%,transparent),_var(--muted)_60%)] p-10 lg:flex">
   <div className="absolute -right-20 -top-20 size-80 rounded-full border border-primary/15"/><div className="absolute -right-8 -top-8 size-56 rounded-full border border-primary/15"/>
   <div className="relative flex items-center gap-2 text-sm text-primary"><ShieldCheck className="size-4"/> Private workspace</div>
   <div className="relative"><div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10"><Search className="size-7 text-primary"/></div><h2 className="max-w-sm text-3xl font-semibold leading-tight text-foreground">Turn questions into clear understanding.</h2><p className="mt-4 max-w-sm leading-7 text-foreground">Explore a topic, bring sources together and build a better picture of the answer.</p></div>
   <p className="relative text-xs tracking-widest text-muted-foreground">SYNAPSE · CREATED BY REVOORI ASHWATH REDDY</p>
  </aside>
 </main>;
}
