---
title: API reference
description: Every HTTP endpoint of the SYNAPSE backend, with authentication, request and response formats, and the answer stream.
---

The SYNAPSE web app and apps talk to a JSON HTTP API. This page documents it for developers who run their own copy of SYNAPSE or want to understand how it works.

> [!NOTE]
> The hosted API is meant for the official SYNAPSE apps. Requests from other websites are blocked by CORS. If you build on the API, [run your own copy](/self-hosting).

## Basics

| | |
|---|---|
| **Base URL (hosted)** | `https://synapse-ai-research.vercel.app` |
| **Base URL (local)** | `http://localhost:8000` |
| **Format** | JSON requests and responses, except file uploads (multipart form) and the answer stream (NDJSON) |
| **Authentication** | `Authorization: Bearer <access_token>` on every endpoint marked 🔒 |
| **Interactive docs** | FastAPI serves Swagger UI at `/docs` on your own copy |

### Authentication

Sign up or sign in to get an `access_token` (a JWT valid for 7 days by default). Send it with every protected request:

```http
GET /api/auth/me HTTP/1.1
Host: synapse-ai-research.vercel.app
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Errors

Errors use FastAPI's standard shape with a human-readable message:

```json
{ "detail": "Your session is invalid or expired. Please log in again." }
```

Plan-related errors include a machine-readable code:

```json
{
  "detail": {
    "code": "out_of_credits",
    "message": "You've used your 110 Free credits for today. They reset 12:00 AM IST. Upgrade for more.",
    "resets_at": "2026-11-08T00:00:00+05:30"
  }
}
```

| Status | Meaning |
|---|---|
| `400` | Invalid input (the message explains what to fix) |
| `401` | Missing, invalid or expired token |
| `402` | `out_of_credits` |
| `403` | `upgrade_required` (Deep research on Free) or `too_many_files` |
| `404` | Not found, or not yours |
| `409` | An account with this email already exists |
| `422` | Request validation failed (FastAPI) |
| `502`, `503`, `504` | An upstream service (AI, search, Razorpay, Google) failed or isn't configured |

## Status

### `GET /api/health`

Also available as `GET /api/status`. Reports whether the AI and search keys are configured.

```json
{ "status": "ok", "ai_configured": true, "web_search_configured": true, "model": "nvidia/nemotron-3.5-super-vl:free" }
```

## Accounts

### `POST /api/auth/register`

Creates an account and signs it in.

```json
{ "name": "Asha Rao", "email": "asha@example.com", "password": "a-long-password" }
```

- `name`: 2–100 characters. `password`: 8–72 bytes.
- Response `200`:

```json
{
  "message": "Account created successfully.",
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": 12, "name": "Asha Rao", "email": "asha@example.com" }
}
```

- `409` if the email is already registered.

### `POST /api/auth/login`

```json
{ "email": "asha@example.com", "password": "a-long-password" }
```

Response: `access_token`, `token_type` and `user`, as above. `401` on a wrong email or password.

### `POST /api/auth/google`

Signs in with a Google access token obtained from Google Identity Services in the browser. Creates the account on first sign-in.

```json
{ "access_token": "ya29.a0..." }
```

The token must have been issued for SYNAPSE's Google client id, and the Google account's email must be verified. Response as for login. `503` if Google sign-in isn't configured.

### `GET /api/auth/me` 🔒

```json
{ "user": { "id": 12, "name": "Asha Rao", "email": "asha@example.com" } }
```

### `PATCH /api/auth/me` 🔒

Changes the display name.

```json
{ "name": "Asha R." }
```

Response: `{ "user": { … } }`.

### `DELETE /api/auth/me` 🔒

Deletes the account. Any auto-pay subscription is cancelled with Razorpay first; if that fails, nothing is deleted (`502`).

```json
{ "confirm_email": "asha@example.com" }
```

Response: `{ "deleted": true }`. `400` if `confirm_email` doesn't match.

## Settings

### `GET /api/settings` 🔒

```json
{
  "settings": {
    "personalization_enabled": true,
    "about_me": "",
    "instructions": "",
    "style": "default",
    "language": "auto",
    "default_mode": "web",
    "show_thinking": true
  },
  "options": {
    "styles": ["default", "concise", "detailed", "formal", "friendly"],
    "languages": ["auto", "English", "Hindi", "Telugu", "…"]
  }
}
```

### `PUT /api/settings` 🔒

Send only the fields you want to change. `about_me` and `instructions` are limited to 1,500 characters; `style`, `language` and `default_mode` (`web`, `academic`, `deep`) must be one of the listed options.

```json
{ "language": "Telugu", "style": "concise" }
```

Response: `{ "settings": { … } }` with all fields.

## Chats

### `GET /api/conversations` 🔒

Your chats, newest first (up to 200).

```json
{ "conversations": [ { "id": "6337c8b7…", "title": "Compare solar and wind power…", "created_at": "…", "updated_at": "…" } ] }
```

### `GET /api/conversations/{id}` 🔒

```json
{
  "conversation": { "id": "6337c8b7…", "title": "…", "created_at": "…", "updated_at": "…" },
  "messages": [
    { "id": 101, "role": "user", "content": "…", "sources": [], "attachments": ["report.pdf"], "mode": "web", "thinking": "", "created_at": "…" },
    { "id": 102, "role": "assistant", "content": "…", "sources": [ { "title": "…", "url": "https://…" } ], "attachments": [], "mode": "web", "thinking": "…", "created_at": "…" }
  ]
}
```

`404` if the chat doesn't exist or belongs to someone else.

### `PATCH /api/conversations/{id}` 🔒

```json
{ "title": "Energy for Rampur" }
```

### `DELETE /api/conversations/{id}` 🔒

Deletes one chat and its messages. Response: `{ "deleted": true }`.

### `DELETE /api/conversations` 🔒

Deletes **all** your chats. Response: `{ "deleted": 14 }` (the number of chats).

### `GET /api/export` 🔒

Everything stored about your chats as one JSON document: `exported_at`, `account`, `settings`, and `conversations` (each with its `messages`).

## Answers

### `POST /api/chat/stream` 🔒

Asks a question and streams the answer. Send a **multipart form**:

| Field | Required | Description |
|---|---|---|
| `query` | yes, unless `regenerate` | The question |
| `mode` | no | `web` (default), `academic` or `deep` |
| `conversation_id` | no | Continue an existing chat; omit to start a new one |
| `regenerate` | no | `true` to answer the chat's last question again (retry) |
| `request_id` | no | Your id for this answer, used by `/api/chat/stop` |
| `files` | no | One or more files (repeat the field) |

Plan rules are checked before anything is saved: `402 out_of_credits`, `403 upgrade_required`, `403 too_many_files`.

The response is `application/x-ndjson`: one JSON event per line.

| Event | Fields | Meaning |
|---|---|---|
| `meta` | `conversation_id`, `title`, `request_id`, `credits` | Sent first; the chat id (new or existing) and your credits after charging |
| `step` | `kind` (`plan`, `search` or `read`), `text`, `url` (for `read`) | One step of the autonomous research loop: the plan, a search it ran, or a page it opened |
| `status` | `stage` (`searching` or `thinking`), `query` | Progress updates |
| `sources` | `sources`, `error`, `enabled`, `query` | Web results used for this answer |
| `thinking` | `text` | A piece of the model's reasoning |
| `delta` | `text` | A piece of the answer |
| `done` | `message_id`, `conversation_id` | The answer finished and was saved |
| `stopped` | | The answer was stopped; any text so far was saved |
| `error` | `message` | The answer failed; partial text, if any, was saved |

Example:

```text
{"type": "meta", "conversation_id": "6337c8b7…", "title": "Compare solar and wind…", "request_id": "c0ffee…", "credits": {"used": 1, "limit": 110, "remaining": 109, "window": "day", "resets_at": "…"}}
{"type": "step", "kind": "plan", "text": "I need recent cost and output figures for both, so I will search for them."}
{"type": "step", "kind": "search", "text": "solar vs wind power small town cost 2026"}
{"type": "status", "stage": "searching", "query": "solar vs wind power small town cost 2026"}
{"type": "sources", "sources": [{"title": "…", "url": "https://…"}], "error": null, "enabled": true, "query": "…"}
{"type": "status", "stage": "thinking"}
{"type": "delta", "text": "Both can power a small town"}
{"type": "delta", "text": "; the better choice depends on…"}
{"type": "done", "message_id": 102, "conversation_id": "6337c8b7…"}
```

Reading the stream with JavaScript:

```js
const res = await fetch(`${API}/api/chat/stream`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form, // FormData with query, mode, …
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) if (line.trim()) handle(JSON.parse(line));
}
```

### `POST /api/chat/stop` 🔒

Stops an answer that is being written.

```json
{ "request_id": "c0ffee…" }
```

Returns `{ "stopped": true }` if the answer was running on the same server instance. Otherwise the stop is recorded and the instance writing the answer stops within about a second; the response is then `{ "stopped": false }`.

### `POST /api/research` 🔒

A simpler, one-shot endpoint kept for compatibility: multipart `query` (or `prompt`), `mode` and `files`. Returns `{ "answer", "sources", "mode", "model", "attached_files" }` without saving a chat. It charges credits like a chat answer.

## Billing

### `GET /api/billing/plans`

Public. Plans, prices in rupees, and whether payments and auto-pay are enabled.

```json
{
  "currency": "INR",
  "payments_enabled": true,
  "autopay": true,
  "annual_discount_percent": 20,
  "plans": [
    { "id": "free", "name": "Free", "credits": 110, "window": "day", "deep_cost": null, "max_files": 1, "monthly_price": 0, "annual_price": 0, "features": ["…"], "description": "…" },
    { "id": "pro", "name": "Pro", "credits": 600, "window": "month", "deep_cost": 3, "max_files": 5, "monthly_price": 499, "annual_price": 4788, "features": ["…"], "description": "…" },
    { "id": "max", "name": "Max", "credits": 1500, "window": "month", "deep_cost": 2, "max_files": 10, "monthly_price": 1299, "annual_price": 12468, "features": ["…"], "description": "…" }
  ]
}
```

### `GET /api/billing/status` 🔒

```json
{
  "plan": "pro",
  "plan_name": "Pro",
  "billing": "monthly",
  "expires_at": "2026-12-08T10:00:00+00:00",
  "autopay": { "plan": "pro", "billing": "monthly", "status": "active", "cancel_at_period_end": false, "next_charge_at": "2026-12-07T10:00:00+00:00" },
  "credits": { "used": 12, "limit": 600, "remaining": 588, "window": "month", "resets_at": "…" },
  "costs": { "web": 1, "academic": 1, "deep": 3 },
  "deep_research": true,
  "max_files": 5
}
```

`autopay` is `null` when the plan doesn't renew automatically.

### `POST /api/billing/checkout` 🔒

Starts a purchase.

```json
{ "plan": "pro", "billing": "monthly" }
```

With auto-pay configured, the response describes a Razorpay subscription:

```json
{
  "mode": "subscription",
  "callback_url": "https://synapse-ai-research.vercel.app/api/billing/callback?back=…",
  "key_id": "rzp_live_…",
  "subscription_id": "sub_…",
  "amount": 49900,
  "currency": "INR",
  "plan": "pro",
  "billing": "monthly",
  "description": "SYNAPSE Pro · Monthly · renews automatically",
  "prefill": { "name": "Asha Rao", "email": "asha@example.com" }
}
```

Without auto-pay, `mode` is `order` and the response contains an `order_id` instead. `400` if you're already subscribed to that exact plan and period.

### `POST /api/billing/verify` 🔒

Confirms a payment after Razorpay Checkout's pop-up finishes. Send Razorpay's handler response:

```json
{ "razorpay_payment_id": "pay_…", "razorpay_subscription_id": "sub_…", "razorpay_signature": "…" }
```

(For one-time orders, send `razorpay_order_id` instead of `razorpay_subscription_id`.) The signature is checked with HMAC-SHA256; on success the response is the new billing status.

### `POST /api/billing/callback`

Used by the **full-page** checkout on phones. Razorpay posts the payment fields here as a form; SYNAPSE checks the signature, activates the plan, and redirects (`303`) to `/pricing?payment=success`, `failed` or `pending` on the website. The optional `back` query parameter chooses which allowed website to return to.

### `POST /api/billing/webhook`

Called by Razorpay. The `X-Razorpay-Signature` header must be the HMAC-SHA256 of the raw body with the webhook secret. Handles `subscription.charged` (renewals), other `subscription.*` status changes, and `payment.captured` / `order.paid` for one-time orders.

### `POST /api/billing/cancel` 🔒

Turns off auto-renew. Access continues until the end of the paid period. Response: the updated billing status. `404` if there's nothing to cancel.

### `GET /api/billing/payments` 🔒

Your last 20 successful payments:

```json
{ "payments": [ { "order_id": "sub:pay_…", "plan": "pro", "billing": "monthly", "amount": 499.0, "currency": "INR", "paid_at": "…" } ] }
```

## Limits

| Limit | Value |
|---|---|
| Request body on Vercel | about 4.5 MB (all files in one message) |
| Upload per file (self-hosted) | 15 MB |
| Text used per document | 100,000 characters |
| Chat history sent to the model | last 12 messages, 6,000 characters each |
| Web results per question | 6 |
| Function duration on Vercel | 300 seconds |
| Token lifetime | 7 days (`ACCESS_TOKEN_MINUTES`) |
