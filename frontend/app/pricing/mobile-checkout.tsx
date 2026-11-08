"use client";

// Phone and in-app checkout: a simple plan picker with a pinned "Continue to
// pay" bar. Payment opens Razorpay as a full page (no pop-up), which works
// reliably on phones, UPI apps and the Android app.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditMeter } from "@/components/chat/credit-meter";
import type { BillingStatus, PlansResponse } from "@/lib/api";

type Billing = "monthly" | "annual";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function MobileCheckout({
  plans,
  status,
  signedIn,
  busy,
  cancelling,
  onPay,
  onCancelAutopay,
}: {
  plans: PlansResponse;
  status: BillingStatus | null;
  signedIn: boolean;
  busy: boolean;
  cancelling: boolean;
  onPay: (planId: string, billing: Billing) => void;
  onCancelAutopay: () => void;
}) {
  const paid = plans.plans.filter((plan) => plan.id !== "free");
  const free = plans.plans.find((plan) => plan.id === "free");
  const autopay = status?.autopay ?? null;
  const renewing = autopay && !autopay.cancel_at_period_end ? autopay : null;

  const [billing, setBilling] = useState<Billing>(renewing?.billing ?? "monthly");
  const [selected, setSelected] = useState<string>(
    renewing?.plan === "pro" ? "max" : status?.plan === "max" ? "max" : "pro",
  );
  const [confirmCancel, setConfirmCancel] = useState(false);

  // When the account loads, start on a plan the user can actually buy.
  useEffect(() => {
    if (renewing) {
      setBilling(renewing.billing);
      setSelected(renewing.plan === "pro" ? "max" : "pro");
    }
  }, [renewing?.plan, renewing?.billing]); // eslint-disable-line react-hooks/exhaustive-deps

  const choice = paid.find((plan) => plan.id === selected) ?? paid[0];
  const isCurrent = (planId: string) => renewing?.plan === planId && renewing.billing === billing;
  const priceOf = (plan: (typeof paid)[number]) => (billing === "monthly" ? plan.monthly_price : plan.annual_price);
  const monthlyEquivalent = (plan: (typeof paid)[number]) =>
    billing === "monthly" ? plan.monthly_price : Math.round(plan.annual_price / 12);

  const action = useMemo(() => {
    if (!choice) return "";
    if (!signedIn) return "Sign in to continue";
    if (isCurrent(choice.id)) return "This is your current plan";
    if (renewing) return `Switch to ${choice.name} · ${inr.format(priceOf(choice))}`;
    return `Continue to pay ${inr.format(priceOf(choice))}`;
  }, [choice, signedIn, renewing, billing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!choice) return null;
  const disabled = busy || (signedIn && isCurrent(choice.id)) || (signedIn && !plans.payments_enabled);

  return (
    <div className="px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-6">
      <h1 className="font-serif text-[1.75rem] leading-tight text-card-foreground">Upgrade SYNAPSE</h1>
      <p className="mt-1 text-sm text-muted-foreground">More credits, Deep research and more files per message.</p>

      {/* Current plan */}
      {status && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 font-medium text-card-foreground">
              {status.plan !== "free" && <Sparkles className="size-4 text-primary" />}
              Your plan: {status.plan_name}
            </p>
            {renewing && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Auto-renew on</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.plan === "free"
              ? "Free forever."
              : renewing
                ? `Renews on ${formatDate(renewing.next_charge_at ?? status.expires_at!)}`
                : `Active until ${formatDate(status.expires_at!)}${autopay?.cancel_at_period_end ? " · auto-renew off" : ""}`}
          </p>
          <div className="mt-3">
            <CreditMeter credits={status.credits} compact />
          </div>
          {renewing && renewing.status === "active" && (
            <div className="mt-3 border-t border-border pt-3 text-sm">
              {confirmCancel ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">Stop auto-renew? You keep your plan until the period ends.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onCancelAutopay}
                      disabled={cancelling}
                      className="h-10 flex-1 rounded-xl bg-red-600 font-medium text-white disabled:opacity-60"
                    >
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancelling}
                      className="h-10 flex-1 rounded-xl border border-border"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className="text-muted-foreground underline underline-offset-4">
                  Cancel auto-renew
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Monthly / yearly */}
      <div role="radiogroup" aria-label="Billing period" className="mt-6 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={billing === value}
            onClick={() => setBilling(value)}
            className={cn(
              "h-11 rounded-xl text-sm font-medium transition-colors",
              billing === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {value === "monthly" ? "Monthly" : `Yearly · save ${plans.annual_discount_percent}%`}
          </button>
        ))}
      </div>

      {/* Plans */}
      <div role="radiogroup" aria-label="Plan" className="mt-4 space-y-3">
        {paid.map((plan) => {
          const active = plan.id === choice.id;
          const current = isCurrent(plan.id);
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(plan.id)}
              className={cn(
                "glass w-full rounded-3xl border-2 p-4 text-left transition-colors",
                active ? "border-primary" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-card-foreground">{plan.name}</span>
                    {plan.id === "pro" && !current && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Popular</span>
                    )}
                    {current && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-foreground">Current</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.credits.toLocaleString("en-IN")} credits every month</p>
                </div>
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {active && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-card-foreground">{inr.format(monthlyEquivalent(plan))}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {billing === "monthly" ? "Billed monthly" : `${inr.format(plan.annual_price)} billed yearly`}
                {plans.autopay ? " · auto-renews" : ""}
              </p>
              {active && (
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {free && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-card-foreground">Free</span>
            <span className="text-muted-foreground"> · {free.credits} credits every day</span>
          </span>
          {status?.plan === "free" ? (
            <span className="text-xs text-muted-foreground">Current</span>
          ) : !signedIn ? (
            <Link href="/signup" className="text-xs font-medium text-primary">Start free</Link>
          ) : (
            <span className="text-xs text-muted-foreground">Included</span>
          )}
        </div>
      )}

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        {plans.autopay
          ? "Pay with UPI AutoPay or a card. Renews automatically until you cancel; cancel any time on this page."
          : "Pay once with UPI, card, netbanking or wallet. Nothing renews automatically."}
      </p>

      {/* Pinned pay bar */}
      <div className="glass-strong fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-b-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            SYNAPSE {choice.name} · {billing === "monthly" ? "Monthly" : "Yearly"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" /> Razorpay
          </span>
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={() => onPay(choice.id, billing)}
            disabled={disabled}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-5 animate-spin" />}
            {busy ? "Opening Razorpay…" : plans.payments_enabled ? action : "Payments aren't switched on yet"}
          </button>
        ) : (
          <Link
            href="/login?next=/pricing"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}
