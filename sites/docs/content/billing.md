---
title: Billing and auto-pay
description: How paying for Pro and Max works with Razorpay, UPI AutoPay and cards, and how to switch, cancel or get help.
---

SYNAPSE Pro and Max are **subscriptions** that renew automatically, monthly or yearly. Payments are handled by **Razorpay**, a licensed Indian payment gateway. SYNAPSE never sees your card number, UPI PIN or bank details.

## Subscribing

1. Open the [pricing page](https://synapse-humanform.vercel.app/pricing) (or **Settings → Account → Upgrade**).
2. Choose **Monthly** or **Yearly**, then select **Get Pro** or **Get Max**. On phones, pick a plan and tap **Continue to pay**.
3. Razorpay opens. Choose a payment method:
   - **UPI AutoPay**: approve a mandate in GPay, PhonePe, Paytm or your bank's UPI app.
   - **Card**: approve the auto-debit (e-mandate) with your bank's OTP.
4. Razorpay charges the first payment immediately.
5. You return to SYNAPSE and see **"Welcome to SYNAPSE Pro!"** (or Max). Your new credits are ready straight away.

> [!TIP]
> In the Android app, choosing UPI opens your UPI app directly. If you don't see UPI, update to the latest version of the app from the [download page](https://humanform-synapse.vercel.app/#download).

### How SYNAPSE confirms your payment

SYNAPSE activates your plan only after checking Razorpay's **cryptographic signature** on the payment. Two independent paths do this, so your plan activates even if your browser closes at the wrong moment:

1. **Your browser** sends the signed confirmation back to SYNAPSE when Razorpay finishes.
2. **Razorpay's server** sends a signed notification (a webhook) directly to SYNAPSE.

If you see "Payment received. Your plan will be active within a few minutes", the second path will finish the job; refresh the page after a minute or two.

## Renewals

- Razorpay charges you automatically at the start of each period: every month, or every year.
- Each successful renewal extends your plan and refreshes your credits. Your pricing page shows **"Renews automatically on …"** with the next date.
- Razorpay may notify you about upcoming and completed charges by email or SMS.

### If a renewal payment fails

Razorpay retries failed payments over the following days. While it retries, you keep your plan until the end of the period you already paid for (plus one day of grace). If every retry fails, the subscription stops and your account returns to **Free** when that period ends. Subscribe again from the pricing page any time.

## Switching plans

To move between Pro and Max, or between monthly and yearly, select the new plan on the pricing page (the button says **Switch to Max**, **Switch to Pro** or **Switch billing**).

- The new plan starts **immediately** when its first payment succeeds, with a fresh credit cycle.
- Your old subscription is **cancelled automatically** so you're never charged for both.
- Time left on the old plan **isn't refunded automatically**. If you switched by mistake, contact us (see below).

## Cancelling

1. Open the [pricing page](https://synapse-humanform.vercel.app/pricing).
2. Under **Your plan**, select **Cancel auto-renew**, then **Yes, cancel**.

What happens next:

- You **won't be charged again**.
- You **keep your plan and credits** until the end of the period you paid for. The pricing page shows "Auto-renew is off · active until …".
- After that date, your account returns to **Free** automatically. Your chats and settings are kept.
- Changed your mind? Before the period ends, select **Restart Pro** (or Max) to subscribe again.

You can also cancel auto-pay from your UPI app or bank, but cancelling in SYNAPSE is quickest and keeps everything in sync.

> [!NOTE]
> **Deleting your account** also cancels auto-pay immediately. See [Accounts and sign-in](/accounts).

## Payment history and receipts

The bottom of the pricing page lists your recent payments: plan, billing period, date and amount. Razorpay sends payment receipts to the email or phone number you enter at checkout.

## Refunds and payment problems

For anything about a payment (a charge you don't recognise, a double charge, money taken without the plan activating, or a refund request), use **[Razorpay's support page](https://razorpay.com/support/)** and choose the option for customers who paid a business. Your request reaches us together with the payment details, which helps us resolve it quickly.

## Prices and taxes

All prices are in Indian rupees and shown on the pricing page before you pay; the amount Razorpay shows at checkout is the amount charged. Plans are currently available for payment methods supported by Razorpay in India.

## Security

- Payments run on Razorpay's checkout. SYNAPSE never sees card numbers, UPI PINs or bank passwords.
- SYNAPSE checks every payment confirmation with a secret only SYNAPSE and Razorpay know (HMAC-SHA256), so a fake "payment done" message can't activate a plan.
- Razorpay's notifications to SYNAPSE are signed and checked the same way.

For technical details, see [Architecture → Payments](/architecture#payments).
