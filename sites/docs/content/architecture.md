---
title: Architecture
description: How SYNAPSE is built, from the Next.js frontend and FastAPI backend to the database, AI, search, payments and apps.
---

SYNAPSE is a web application with a separate frontend and backend, a Postgres database, three external services (AI, search and payments) and two native app shells. This page explains how the pieces fit together.

## Overview

```text
 Browser / Windows app / Android app
            │  HTTPS
            ▼
 ┌──────────────────────────────┐        ┌──────────────────────────────┐
 │ Frontend (Next.js 15)        │  JSON  │ Backend (FastAPI, Python)    │
 │ synapse-humanform.vercel.app │ ─────▶ │ synapse-ai-research          │
 │ React 19 · Tailwind CSS 4    │ ◀───── │   .vercel.app                │
 └──────────────────────────────┘ NDJSON └──────────────┬───────────────┘
                                                        │
              ┌─────────────────┬───────────────┬───────┴────────┬──────────────┐
              ▼                 ▼               ▼                ▼              ▼
        Supabase Postgres   OpenRouter       Tavily          Razorpay     Google Identity
        (accounts, chats,   (AI model:       (web search)    (payments,   (optional
         credits, plans)     Nemotron)                        auto-pay)    sign-in)
```

| Part | Technology | Hosted at |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Motion | Vercel: `synapse-humanform.vercel.app` |
| Backend | Python, FastAPI, Uvicorn locally; Vercel Python runtime in production | Vercel: `synapse-ai-research.vercel.app` (Singapore region) |
| Database | PostgreSQL on Supabase (SQLite when running locally) | Supabase, via the transaction pooler |
| AI | OpenRouter chat completions, streamed | OpenRouter |
| Web search | Tavily Search API | Tavily |
| Payments | Razorpay Subscriptions and Orders | Razorpay |
| Windows app | Electron 45, packaged with electron-builder | GitHub Releases |
| Android app | Capacitor 8 | GitHub Releases |
| Landing page | Hand-written HTML, CSS and JavaScript | Vercel: `synapse-download.vercel.app` |
| Documentation | Markdown built with `marked` into static HTML | Vercel: `synapse-docs.vercel.app` |

## Frontend

The frontend is a Next.js app in `frontend/`.

- **Routes**: `/` (new chat), `/chat/[id]` (a saved chat), `/login`, `/signup`, `/pricing`. Friendly redirects such as `/upgrade` and `/plans` → `/pricing`, and `/sign-in` → `/login`, are configured in `next.config.ts`.
- **Chat app** (`components/chat/chat-app.tsx`): loads the account, settings, plan and chat list; updates the URL as you open chats; streams answers; handles stop, retry, rename and delete.
- **Messages** (`components/chat/messages.tsx`): user bubbles, assistant answers with the web-search block, thinking panel, Markdown, citation chips, and copy/retry actions. Text is revealed smoothly using a time-based reveal, so it stays fluid even when the tab is throttled.
- **Markdown** (`components/chat/markdown.tsx`): `react-markdown` with GitHub-flavoured Markdown and syntax highlighting; citations like `[1]` become clickable chips.
- **Input** (`components/ui/claude-style-chat-input.tsx`): a 21st.dev component adapted for SYNAPSE, with file attachments, paste-to-attachment, mode menu and extended-thinking toggle.
- **Settings** (`components/chat/settings-dialog.tsx`): General, Personalization, Data controls and Account tabs.
- **Pricing** (`app/pricing/`): a desktop layout with the 21st.dev pricing cards, and a separate phone layout (`mobile-checkout.tsx`) with a pinned pay button and full-page Razorpay checkout.
- **Theme**: Claude-style colour tokens in `globals.css` (light and dark), fonts Inter and Source Serif 4 via `next/font`.
- **API client** (`lib/api.ts`): adds the `Authorization: Bearer` header, turns error responses into readable messages, and parses the answer stream.

## Backend

The backend is a FastAPI application in `backend/app/main.py`; `backend/index.py` exposes it to Vercel's Python runtime. Functions may run for up to 300 seconds, enough for long Deep research answers.

### Request lifecycle of an answer

When you send a question, the frontend calls `POST /api/chat/stream` with a multipart form (question, mode, chat id, request id, files). The backend then:

1. **Authenticates** the request with the JWT in the `Authorization` header.
2. **Loads your settings** and builds personal instructions (name, language, style, custom instructions).
3. **Charges credits atomically**: one SQL `UPDATE … WHERE used + cost <= limit` per request, so two simultaneous questions can never overspend.
4. **Reads attachments**: text, Markdown, CSV and JSON as text; DOCX with python-docx; PDF with pypdf (or PyMuPDF if installed); images as base64 data URLs for the vision model. Up to 100,000 characters per document are used.
5. **Saves your question** and creates the chat if it's new (its title is the first 60 characters of the question).
6. **Starts a worker thread** that writes the answer, while the request streams events back:
   - searches Tavily (basic or advanced depth, up to 6 results);
   - builds the prompt from the system instructions, the last 12 messages (each up to 6,000 characters), web results and file text;
   - streams the OpenRouter completion, separating the model's `reasoning` (thinking) from the answer text.
7. **Streams NDJSON events** to the browser (one JSON object per line): `meta`, `status`, `sources`, `thinking`, `delta`, then `done`, `stopped` or `error`.
8. **Saves the answer**, or keeps partial text if it failed half-way. If no text was produced at all, the credits are **refunded**.

The worker thread hands events to the response through an `asyncio.Queue` (`loop.call_soon_threadsafe`), so the event loop never blocks while the model writes.

### Stopping across servers

On Vercel, the request that writes an answer and the request that asks it to stop may land on **different server instances**. SYNAPSE handles this in two ways: if the answer is running on the same instance, an in-memory event stops it at once; otherwise `POST /api/chat/stop` records the request in the `chat_stops` table, and the writing instance checks that table about once a second. Old stop records are cleaned up after an hour.

### Saving safely

An answer is saved only if the question it replies to is still the latest question in the chat. This prevents a slow, stopped or retried answer from overwriting a newer one.

## Database

SYNAPSE uses PostgreSQL on Supabase in production and a local SQLite file (`backend/synapse.db`) during development. A small adapter lets the same SQL run on both: it translates `?` placeholders to `%s`, `AUTOINCREMENT` columns to `BIGSERIAL`, and returns inserted ids. The Postgres connection uses Supabase's **transaction pooler** (port 6543) with prepared statements disabled, as the pooler requires.

On start-up, the backend creates any missing tables. In production it first checks the database catalogue and skips table setup entirely when everything already exists, so cold starts never take table locks.

### Tables

| Table | Holds |
|---|---|
| `users` | id, name, email (unique), bcrypt password hash, created time |
| `conversations` | id, owner, title, created and updated times |
| `messages` | chat id, role (user or assistant), content, sources (JSON), attachment names (JSON), mode, thinking text, created time |
| `user_settings` | owner, settings JSON (personalization, style, language, default mode, show thinking) |
| `credit_usage` | owner, credit window key (a day for Free, a 30-day cycle for paid plans), credits used |
| `subscriptions` | owner, current plan, billing period, start and expiry of access |
| `razorpay_subscriptions` | Razorpay subscription id, owner, plan, billing, status, cancel-at-period-end flag, next charge date |
| `payments` | order or payment id, owner, plan, billing, amount (paise), status, paid time |
| `chat_stops` | stop requests for answers running on other server instances |

Row-level security is enabled on every table, which closes Supabase's automatic public data API. Only the backend, which holds the private connection string, can read or write.

## AI and search

- **OpenRouter** gives one API for many models. SYNAPSE uses NVIDIA Nemotron by default, set by `OPENROUTER_MODEL`. The request streams with server-sent events; reasoning tokens become the thinking panel.
- **System instructions** tell the model to answer accurately, cite sources by number, never fabricate citations, and to say that SYNAPSE was built by Revoori Ashwath Reddy at HumanForm Studios when asked. Mode instructions add the Academic or Deep research style. Personal instructions add your name, language, style and custom instructions, framed as preferences that never override accuracy or safety.
- **Tavily** returns titles, URLs and page content excerpts. Short follow-up questions are searched together with the previous question.

## Plans and credits

Plans are defined in one table in the backend (credits, window, Deep research cost, file limit, prices in paise). Credit windows are keyed so they reset naturally:

- **Free**: `free:<IST date>`, a new window every day at midnight IST.
- **Paid**: `<plan>:<start>:<n>`, a new window every 30 days from the subscription start.

## Payments

SYNAPSE supports two Razorpay flows; production uses auto-pay subscriptions.

### Auto-pay subscriptions

1. `POST /api/billing/checkout` creates a **Razorpay subscription** for the plan's Razorpay plan id (60 cycles monthly, 5 yearly) and records it as `created`.
2. The browser opens Razorpay Checkout with the `subscription_id`. On computers this is a pop-up; on phones and in the Android app it's a full-page flow (`redirect` with a `callback_url`), and in the Android app UPI intents are enabled (`webview_intent`).
3. After the first payment, SYNAPSE verifies the signature: HMAC-SHA256 of `payment_id|subscription_id` with the key secret. This happens in `POST /api/billing/verify` (pop-up) or `POST /api/billing/callback` (full page).
4. `record_subscription_charge` records the payment once (the payment id is unique), extends access to Razorpay's `current_end` plus one day, and cancels any older auto-pay subscription of the same user.
5. **Renewals** arrive as `subscription.charged` webhooks, verified with HMAC-SHA256 of the raw body using the webhook secret, and are applied the same way. Other `subscription.*` events update the status.
6. `POST /api/billing/cancel` asks Razorpay to stop at the end of the current cycle; access continues until it expires.

### One-time orders (fallback)

If no Razorpay plan id is configured for a plan, checkout falls back to a one-time **order** for 30 or 365 days, verified with HMAC-SHA256 of `order_id|payment_id`, with `payment.captured` / `order.paid` webhooks as a backup.

## Authentication

- **Passwords**: hashed with bcrypt through passlib; 8–72 bytes.
- **Sessions**: JWTs signed with HS256 using `JWT_SECRET` (at least 32 characters in production), valid for 7 days by default.
- **Google**: the browser gets an access token from Google Identity Services; the backend checks with Google's `tokeninfo` endpoint that the token was issued for SYNAPSE's client id, requires a verified email, and fetches the name from `userinfo`.

## The apps

Both apps are thin native shells around the live website:

- **Windows (Electron)**: opens the site URL from `apps/app.config.json`, keeps navigation on the site, opens other links in the default browser, allows Razorpay pop-ups, enforces a single instance, and shows a local offline page if the site can't load.
- **Android (Capacitor)**: loads the site with `server.url`, allows navigation to Razorpay and the SYNAPSE backend (for the payment return), hands `upi://` and `intent://` links to Android so UPI apps open, and shows an offline page on errors.

Both add `SynapseApp` to the browser's user agent, which the website uses to hide Google sign-in inside the apps and to choose the right payment flow.

## Deployment

| Vercel project | Root directory | Domain |
|---|---|---|
| `synapse-ai` | `frontend/` | synapse-humanform.vercel.app |
| `synapse-ai-research` | `backend/` | synapse-ai-research.vercel.app |
| `synapse-download` | `sites/landing/` | synapse-download.vercel.app |
| `synapse-docs` | `sites/docs/` | synapse-docs.vercel.app |

All four deploy automatically from the `main` branch of the GitHub repository. Secrets (API keys, database URL, JWT and Razorpay secrets) are stored as Vercel environment variables, never in the repository. App installers are published as GitHub Releases.
