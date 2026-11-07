---
title: The SYNAPSE story
description: A documentary-style account of how SYNAPSE was built, from the first bug fix to apps, payments and this site.
---

Every product has a list of features. This page is the other half: how SYNAPSE came to be, what problems came up along the way, and why it works the way it does. It's written for anyone curious about building a real AI product from scratch.

## The idea

SYNAPSE is built around a simple idea. AI assistants write fluently but can be unsure of their facts; search engines find facts but leave the reading to you. SYNAPSE, created by **Revoori Ashwath Reddy** at **HumanForm Studios**, combines the two: it searches first, reads properly, and then writes an answer that shows exactly where each claim came from.

The name fits that idea: a connection between a question and the knowledge spread across the web, the way a synapse connects two neurons. The logo, a central node with six branches, carries the same image, and it's what you see animating at the top of the [SYNAPSE home page](https://synapse-download.vercel.app).

## Chapter 1: Making it work

The first version had a FastAPI backend, a Next.js frontend and a simple research form. The very first problem was mundane but instructive: after signing in, every request failed with **401 Unauthorized**. The cause was a single name. The backend sent the sign-in token as `access_token`, while the frontend saved a field called `token` that didn't exist. Fixing that one line made the whole app work, and set a habit that shaped everything after: find the real cause before changing anything.

## Chapter 2: A chat that feels right

A research assistant lives or dies by how it feels to use, so the interface was rebuilt as a conversation:

- **A calmer look.** SYNAPSE adopted a warm, paper-and-ink colour theme based on a community theme from 21st.dev, with **Inter** for the interface and the serif **Source Serif 4** for answers, so long answers read like a well-set page rather than a terminal.
- **Streaming answers.** Instead of waiting for a whole answer, SYNAPSE streams it as it's written. A time-based reveal keeps the text flowing smoothly, even on slow devices.
- **Showing the work.** The search, the sources and, when available, the model's reasoning are visible above every answer, with a "Thinking" shimmer while the model works.
- **Your questions on the right**, in bubbles, the way people expect a modern chat to look.
- **Phones first.** Bigger touch targets, a slide-in sidebar, and careful handling of notches and on-screen keyboards.

## Chapter 3: Teaching it who it is

Assistants built on third-party models tend to introduce themselves as the model. SYNAPSE's instructions were written to make it answer plainly when asked who built it: **Revoori Ashwath Reddy at HumanForm Studios**. Its first rule, written into every request, is shorter still: *never fabricate citations*.

## Chapter 4: Into the cloud

Running on one computer isn't a product. SYNAPSE moved to **Vercel** for both the website and the Python backend, and to **Supabase** for a real Postgres database. Serverless hosting brought new puzzles:

- **Stop buttons across servers.** On serverless platforms, the request writing an answer and the request asking it to stop can land on different machines. SYNAPSE solved this with a small table of stop requests that the writing server checks about once a second.
- **Fair credits under pressure.** Credits are charged with a single atomic database update, so two questions sent at the same moment can never overspend.
- **Cold starts without collisions.** Setting up tables on every start-up took brief database locks that could clash with live requests. The backend now checks the database first and skips setup when everything already exists.
- **Secrets kept secret.** API keys live only in the hosting provider's encrypted settings; the public source code contains none.

## Chapter 5: A business, not just a demo

To keep SYNAPSE running, it needed a fair way to pay for AI and search. The model chosen was **freemium**: a generous Free plan and two paid plans, priced in rupees.

- **Credits**, like other assistants use, made costs predictable: simple answers cost one credit, Deep research a little more.
- **Razorpay** brought payments that work the way people in India pay: UPI, cards, netbanking and wallets.
- **Auto-pay** came next. Pro and Max became subscriptions that renew automatically with UPI AutoPay or a card mandate, with a one-tap **Cancel auto-renew** that keeps your plan until the end of the period you paid for.
- **Trust in every payment.** No plan changes without Razorpay's cryptographic signature, checked twice: once from your browser and once from Razorpay's own servers.

## Chapter 6: Phones are different

Real phones found problems that desktop testing missed:

- A payment message appeared at the top of the page while the button was at the bottom, so tapping **Get Pro** seemed to do nothing. Messages now pop up where you can see them.
- The pricing page wouldn't scroll on Android because of one CSS rule that's harmless with a mouse but blocks a finger. It took a screenshot from a real phone to find.
- Payment pop-ups are fragile on phones, so phones got their own checkout: a simple plan picker with a pinned **Continue to pay** button and a full-page Razorpay flow.
- Inside the Android app, UPI was missing, because app windows can't open other apps by themselves. The app now hands UPI links to Android, so GPay, PhonePe and Paytm open directly.

## Chapter 7: Making it personal

People research differently, so SYNAPSE learned to adapt: a **Settings** panel with light and dark themes, 17 answer languages including Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi and Bengali, response styles from concise to detailed, and custom instructions about who you are and how you like answers. Your data stays yours: export every chat, delete them all, or delete your account, which also stops any auto-pay.

## Chapter 8: Everywhere

SYNAPSE became installable:

- a **Windows** app, built with Electron, with an installer and a portable version;
- an **Android** app, built with Capacitor and signed with HumanForm Studios' own release key;
- and on iPhone, a home-screen web app.

Each app opens the live service, so improvements reach everyone at once. Then came this documentation, and a home page that tells the story in one scroll.

## What SYNAPSE believes

1. **Show your sources.** An answer you can't check is only an opinion.
2. **Never invent.** If the evidence isn't there, say so.
3. **Respect people's time.** Stream answers, keep the interface calm, make every tap do what it says.
4. **Respect people's data.** Keep only what's needed, never see payment details, and make deleting easy.
5. **Give credit.** SYNAPSE is built on the work of many people; the [credits page](/credits) names them.

## What's next

Some things on the roadmap: password reset by email, a way for Google-created accounts to set a password for the apps, reading tables in Word documents, a Play Store release, and code-signed Windows builds. Follow the [changelog](/changelog) for what ships.

*SYNAPSE is created by Revoori Ashwath Reddy at HumanForm Studios.*
