---
title: Changelog
description: What's new in SYNAPSE.
---

## 1.0.0: November 2026

The first public release of SYNAPSE on the web, Windows and Android.

### Research

- Chat-based research with live web search (Tavily) and numbered citations.
- Three research modes: Web research, Academic and Deep research (advanced search).
- Extended thinking toggle, and a thinking panel for models that share their reasoning.
- Streaming answers with **Stop** and **Retry**; partial answers are kept when stopped.
- Follow-up questions keep the chat's context; short follow-ups are searched together with the previous question.
- Attachments: PDF, DOCX, TXT, MD, CSV, JSON and images (PNG, JPG, WEBP, GIF). Long pasted text becomes an attachment.
- Saved chats with their own links, rename and delete.

### Plans and payments

- Freemium plans: Free (110 credits a day), Pro (600 credits a month) and Max (1,500 credits a month).
- Credits are refunded automatically when an answer fails or is stopped before writing anything.
- Razorpay payments in INR with **auto-pay subscriptions** (UPI AutoPay and card mandates), monthly or yearly.
- **Cancel auto-renew** keeps your plan until the end of the paid period.
- A dedicated phone checkout with full-page Razorpay payments.
- UPI apps open directly from the Android app.

### Personalization and data

- Settings: Light, Dark or System theme; 17 answer languages; response styles; custom instructions; default research mode; show or hide thinking.
- Export all chats as JSON, delete all chats, delete your account (which also cancels auto-pay).

### Accounts

- Email and password sign-up and sign-in, and Continue with Google on the website.

### Apps

- Windows app (installer and portable), Electron-based.
- Android app (Android 7.0+), Capacitor-based, signed with HumanForm Studios' release key.
- SYNAPSE favicon and home-screen icons for browsers.

### Reliability and security

- Stop works across server instances.
- Atomic credit charging.
- Payment confirmations and webhooks verified with HMAC-SHA256.
- Row-level security on every database table.
- Faster cold starts: database setup is skipped when it's already done.
- PDFs are read with pypdf on the hosted service.

### Sites

- [synapse-download.vercel.app](https://synapse-download.vercel.app): the SYNAPSE home page with downloads.
- [synapse-docs.vercel.app](https://synapse-docs.vercel.app): this documentation.
