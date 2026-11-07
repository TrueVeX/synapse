---
title: Privacy and security
description: What SYNAPSE stores, what it never sees, who processes your data, and how it is protected.
---

This page explains, in plain language, what happens to your information when you use SYNAPSE. It describes how the service works; it isn't a legal contract.

## What SYNAPSE stores

| Data | Why | Where |
|---|---|---|
| **Name and email** | To identify your account and greet you | SYNAPSE database |
| **Password hash** | To check your password at sign-in (bcrypt; the password itself is never stored) | SYNAPSE database |
| **Chats**: your questions, SYNAPSE's answers, sources, thinking text, research mode, attached file **names** | To show your history | SYNAPSE database |
| **Settings**: language, style, personalization text, default mode, show thinking | To apply your preferences | SYNAPSE database |
| **Credits used** per day or month | To enforce plan limits | SYNAPSE database |
| **Plan and subscription status** | To give you the right features | SYNAPSE database |
| **Payment records**: order or payment ID, plan, amount, date | Accounting and your payment history | SYNAPSE database |
| **Sign-in token** | Keeps you signed in for 7 days | Your browser or app only |
| **Theme and sidebar preference** | Remembers how you like the screen | Your browser or app only |

## What SYNAPSE never stores or sees

- **Card numbers, UPI PINs and bank passwords.** These go directly to Razorpay. SYNAPSE only receives a signed confirmation that a payment succeeded.
- **The contents of your attachments.** Files are read for one answer and discarded; only the file name is saved with your message.
- **Your Google password.** Google sign-in shares only your name and verified email.

## Who processes your data

SYNAPSE relies on trusted service providers. Each receives only what it needs:

| Provider | Role | What it receives |
|---|---|---|
| **OpenRouter** and the AI model provider (NVIDIA Nemotron by default) | Writes answers | Your question, recent chat messages, web results, attachment contents, your name and personalization settings |
| **Tavily** | Web search | The search text built from your question |
| **Supabase** | Hosts the database | Everything SYNAPSE stores (listed above) |
| **Vercel** | Hosts the website and server | Requests passing through, including your IP address in logs |
| **Razorpay** | Payments | The details you enter at checkout |
| **Google** | Optional sign-in | Your sign-in with Google |
| **GitHub** | Hosts app downloads | Your download request |

> [!WARNING]
> SYNAPSE uses a **free** AI model by default. Free models may be offered on terms that let the provider log or use requests. **Don't share confidential, personal, medical, financial or legal documents** with SYNAPSE.

## How your data is protected

- **Encryption in transit**: all connections use HTTPS.
- **Hashed passwords**: bcrypt, with a unique salt per password.
- **Signed sessions**: sign-in tokens are signed with a secret key and expire after 7 days.
- **Locked-down database**: SYNAPSE's tables have row-level security enabled, which closes Supabase's public data API; only SYNAPSE's server connects, with a private connection string.
- **Secrets stay secret**: API keys and passwords live in the hosting provider's encrypted settings, never in the source code.
- **Verified payments**: every payment confirmation and webhook is checked with HMAC-SHA256 before a plan changes.
- **Ownership checks**: every chat request checks that the chat belongs to the signed-in account; chat links don't work for anyone else.

## Your controls

| You want to… | Do this |
|---|---|
| See everything stored about your chats | **Settings → Data controls → Export chats** |
| Delete one chat | **…** next to the chat → **Delete** |
| Delete all chats | **Settings → Data controls → Delete all chats** |
| Stop personalization | **Settings → Personalization → Use personalization** off |
| Stop payments | Pricing page → **Cancel auto-renew** |
| Delete your account | **Settings → Account → Delete account** |

When you delete your account, SYNAPSE cancels auto-pay and deletes your chats, settings, credit records and subscription. Payment records are kept for accounting with the link to you removed. Copies inside the AI and search providers are governed by their own policies.

## Children

SYNAPSE is a general research tool and isn't designed for children. Payments require an adult with a valid payment method.

## Reporting a security problem

If you find a security issue, please report it privately rather than in a public GitHub issue. Open a GitHub issue that only asks for a private contact, without details of the problem, and we'll follow up.
