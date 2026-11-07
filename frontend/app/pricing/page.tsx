"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { ArrowLeft, CheckCircle2, Receipt, Sparkles } from "lucide-react";
import { Pricing, type PricingPlan } from "@/components/ui/pricing";
import { SynapseMark } from "@/components/chat/synapse-mark";
import { CreditMeter } from "@/components/chat/credit-meter";
import {
  ApiError,
  api,
  getToken,
  isAuthError,
  clearToken,
  type BillingStatus,
  type PlansResponse,
} from "@/lib/api";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string; backdrop_color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type Checkout = {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  description: string;
  prefill: { name: string; email: string };
};

type Payment = { order_id: string; plan: string; billing: string; amount: number; paid_at: string };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const FAQ = [
  {
    q: "What is a credit?",
    a: "Each answer uses credits. A Web research or Academic answer costs 1 credit, Deep research costs 3 (2 on Max). Retrying an answer costs the same as asking again.",
  },
  {
    q: "When do credits reset?",
    a: "Free credits refresh every day at midnight (IST). Pro and Max credits refresh every 30 days from the day you subscribe, including on annual plans. Unused credits don't roll over.",
  },
  {
    q: "What if an answer fails or I stop it?",
    a: "If you stop an answer before any words appear, or it fails without writing anything, the credits are returned automatically.",
  },
  {
    q: "How does billing work?",
    a: "You pay once for a month or a year through Razorpay (UPI, cards, netbanking and wallets). Your plan stays active until the end of that period; buy again to renew or switch plans. Nothing is charged automatically.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [billing, history] = await Promise.all([
        api<BillingStatus>("/api/billing/status"),
        api<{ payments: Payment[] }>("/api/billing/payments"),
      ]);
      setStatus(billing);
      setPayments(history.payments);
      setSignedIn(true);
    } catch (error) {
      if (isAuthError(error)) {
        clearToken();
        setSignedIn(false);
      }
    }
  }, []);

  useEffect(() => {
    document.title = "Plans & pricing — SYNAPSE";
    setSignedIn(Boolean(getToken()));
    api<PlansResponse>("/api/billing/plans")
      .then(setPlans)
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Could not load plans."));
    refreshAccount();
  }, [refreshAccount]);

  const cards = useMemo<PricingPlan[]>(() => {
    if (!plans) return [];
    return plans.plans.map((plan) => {
      const current = status?.plan === plan.id;
      const isFree = plan.id === "free";
      let buttonText = isFree ? "Start for free" : `Get ${plan.name}`;
      if (current) buttonText = isFree ? "Your current plan" : `Renew ${plan.name}`;
      if (isFree && status && status.plan !== "free") buttonText = "Included";
      return {
        id: plan.id,
        name: plan.name.toUpperCase(),
        price: String(plan.monthly_price),
        yearlyPrice: String(isFree ? 0 : Math.round(plan.annual_price / 12)),
        yearlyTotal: plan.annual_price || undefined,
        period: "per month",
        features: plan.features,
        description: plan.description,
        buttonText,
        href: isFree ? (signedIn ? "/" : "/signup") : undefined,
        isPopular: plan.id === "pro",
        disabled: isFree && signedIn,
      };
    });
  }, [plans, status, signedIn]);

  async function startCheckout(plan: PricingPlan, billing: "monthly" | "annual") {
    setNotice(null);
    if (!getToken()) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    if (plans && !plans.payments_enabled) {
      setNotice({ kind: "error", text: "Payments aren't switched on yet. Please try again soon." });
      return;
    }

    setBusyPlanId(plan.id);
    try {
      const [ready, order] = await Promise.all([
        loadRazorpay(),
        api<Checkout>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: plan.id, billing }) }),
      ]);
      if (!ready || !window.Razorpay) throw new ApiError("Couldn't load the Razorpay checkout. Check your connection.", 0);

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "SYNAPSE",
        description: order.description,
        order_id: order.order_id,
        prefill: order.prefill,
        theme: { color: "#d97757", backdrop_color: "rgba(20, 20, 19, 0.75)" },
        handler: async (response) => {
          try {
            const updated = await api<BillingStatus>("/api/billing/verify", {
              method: "POST",
              body: JSON.stringify(response),
            });
            setStatus(updated);
            refreshAccount();
            setNotice({
              kind: "success",
              text: `Welcome to SYNAPSE ${updated.plan_name}! ${updated.credits.limit.toLocaleString("en-IN")} credits are ready to use.`,
            });
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 }, colors: ["#d97757", "#9c87f5", "#faf9f5"], disableForReducedMotion: true });
          } catch (error) {
            setNotice({
              kind: "error",
              text:
                (error instanceof Error ? error.message : "We couldn't confirm the payment.") +
                " If money was taken, your plan will activate automatically within a few minutes.",
            });
          } finally {
            setBusyPlanId(null);
          }
        },
        modal: { ondismiss: () => setBusyPlanId(null) },
      });
      checkout.on("payment.failed", (result) => {
        setNotice({ kind: "error", text: result.error?.description || "The payment didn't go through. You weren't charged." });
      });
      checkout.open();
    } catch (error) {
      if (isAuthError(error)) {
        clearToken();
        router.push(`/login?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Couldn't start the payment." });
      setBusyPlanId(null);
    }
  }

  return (
    <main className="synapse-scroll min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <SynapseMark size={22} />
            <span className="font-serif text-xl tracking-tight text-card-foreground">SYNAPSE</span>
          </Link>
          {signedIn ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to chat
            </Link>
          ) : (
            <Link
              href="/login?next=/pricing"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4">
        <AnimatePresence>
          {notice && (
            <motion.div
              role={notice.kind === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={
                notice.kind === "error"
                  ? "mt-6 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  : "mt-6 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-card-foreground"
              }
            >
              {notice.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />}
              <span className="flex-1">{notice.text}</span>
              {notice.kind === "success" && (
                <Link href="/" className="shrink-0 font-medium text-primary hover:underline">
                  Start researching
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {status && (
          <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Your plan</p>
                <p className="mt-1 flex items-center gap-2 font-serif text-2xl text-card-foreground">
                  {status.plan !== "free" && <Sparkles className="size-5 text-primary" />}
                  SYNAPSE {status.plan_name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {status.plan === "free"
                    ? "Free forever. Upgrade any time for more credits and Deep research."
                    : `${status.billing === "annual" ? "Annual" : "Monthly"} plan · active until ${formatDate(status.expires_at!)}`}
                </p>
              </div>
              <div className="w-full sm:w-80">
                <CreditMeter credits={status.credits} />
              </div>
            </div>
          </section>
        )}

        {loadError ? (
          <div className="py-24 text-center">
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        ) : !plans ? (
          <div className="grid place-items-center py-32">
            <SynapseMark size={36} animate title="Loading plans" />
          </div>
        ) : (
          <Pricing
            plans={cards}
            title="Research without limits"
            description={"Start free. Upgrade when you need more answers or Deep research.\nAll prices are in Indian Rupees (INR)."}
            onSelect={startCheckout}
            busyPlanId={busyPlanId}
          />
        )}

        <section className="mx-auto max-w-3xl pb-6">
          <h2 className="text-center font-serif text-2xl text-card-foreground">How credits work</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Free</th>
                  <th className="px-4 py-3 font-medium">Pro</th>
                  <th className="px-4 py-3 font-medium">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 text-card-foreground">Web research</td>
                  <td className="px-4 py-3">1 credit</td>
                  <td className="px-4 py-3">1 credit</td>
                  <td className="px-4 py-3">1 credit</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-card-foreground">Academic</td>
                  <td className="px-4 py-3">1 credit</td>
                  <td className="px-4 py-3">1 credit</td>
                  <td className="px-4 py-3">1 credit</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-card-foreground">Deep research / Extended thinking</td>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3">3 credits</td>
                  <td className="px-4 py-3">2 credits</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-card-foreground">Files per message</td>
                  <td className="px-4 py-3">1</td>
                  <td className="px-4 py-3">5</td>
                  <td className="px-4 py-3">10</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-3xl py-10">
          <h2 className="text-center font-serif text-2xl text-card-foreground">Questions</h2>
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-card-foreground marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {payments.length > 0 && (
          <section className="mx-auto max-w-3xl pb-10">
            <h2 className="flex items-center justify-center gap-2 font-serif text-2xl text-card-foreground">
              <Receipt className="size-5 text-muted-foreground" /> Payment history
            </h2>
            <ul className="mt-5 divide-y divide-border rounded-2xl border border-border">
              {payments.map((payment) => (
                <li key={payment.order_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-card-foreground">
                    SYNAPSE {payment.plan === "max" ? "Max" : "Pro"} · {payment.billing === "annual" ? "Annual" : "Monthly"}
                  </span>
                  <span className="text-muted-foreground">{formatDate(payment.paid_at)}</span>
                  <span className="font-medium text-card-foreground">{inr.format(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-border py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
          Payments are processed securely by Razorpay. SYNAPSE never sees your card or UPI details.
          <br />
          SYNAPSE · Created by <span className="text-foreground">Revoori Ashwath Reddy</span> · <span className="text-foreground">HumanForm Studios</span>
        </footer>
      </div>
    </main>
  );
}
