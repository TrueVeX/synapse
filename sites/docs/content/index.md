---
title: SYNAPSE documentation
nav: Introduction
description: Everything about SYNAPSE, the AI research assistant by HumanForm Studios, from your first question to the API.
---

SYNAPSE is an AI research assistant. You ask a question in plain language; SYNAPSE searches the live web, reads the most relevant pages and any files you attach, and writes a clear answer with **numbered citations** that link to every source it used. It runs in your browser at [synapse-humanform.vercel.app](https://synapse-humanform.vercel.app) and as apps for **Windows** and **Android**.

SYNAPSE was created by **Revoori Ashwath Reddy** at **HumanForm Studios**.

> [!TIP]
> New here? Start with [Getting started](/getting-started). It takes about five minutes and covers everything you need for your first research session.

## What SYNAPSE does

- **Answers from the live web.** Every question triggers a fresh web search. SYNAPSE reads the top results and builds its answer from what those pages say today, not only from what a model memorised during training.
- **Shows its work.** You see the search it ran, the sources it read, and, when the model shares it, its reasoning. Citations appear as small numbered chips next to the sentences they support.
- **Reads your files.** Attach PDFs, Word documents, text, Markdown, CSV or JSON files and images. SYNAPSE reads them together with the web results.
- **Remembers the conversation.** Follow-up questions use the context of the chat, so "what about the cost?" still finds the right pages.
- **Adapts to you.** Choose an answer language, a response style, and tell SYNAPSE about yourself so answers fit your needs.
- **Goes where you go.** The same account works on the web, on Windows and on Android, with your chats and plan everywhere.

## How this documentation is organised

| Section | What you'll find |
|---|---|
| [Get started](/getting-started) | Creating an account, asking questions, reading answers, research modes, files and images |
| [Plans and account](/plans-and-credits) | Free, Pro and Max plans, how credits work, auto-pay billing with Razorpay, settings and personalization, sign-in |
| [Apps](/apps) | Installing and using SYNAPSE on Windows and Android |
| [Trust and help](/privacy) | What SYNAPSE stores and why, answers to common questions, fixes for common problems |
| [Developers](/architecture) | How SYNAPSE is built, the full HTTP API, and how to run your own copy |
| [About](/story) | The story of SYNAPSE, the changelog, credits for every service and library, and HumanForm Studios |

## SYNAPSE at a glance

| | |
|---|---|
| **Web app** | [synapse-humanform.vercel.app](https://synapse-humanform.vercel.app) |
| **Downloads** | [humanform-synapse.vercel.app](https://humanform-synapse.vercel.app/#download): Windows 10/11 (64-bit) and Android 7.0+ |
| **Default AI model** | NVIDIA Nemotron, through OpenRouter |
| **Web search** | Tavily: up to 6 sources per question |
| **Research modes** | Web research, Academic, Deep research |
| **Files** | PDF, DOCX, TXT, MD, CSV, JSON, PNG, JPG, WEBP, GIF |
| **Plans** | Free (110 credits a day), Pro (₹499/month), Max (₹1,299/month) |
| **Payments** | Razorpay: UPI AutoPay, cards, netbanking, wallets |
| **Answer languages** | 17 languages, or automatic |
| **Made by** | Revoori Ashwath Reddy · HumanForm Studios |

## A quick example

You type:

```text
Compare solar and wind power for a small town.
```

SYNAPSE then:

1. Shows **Searched the web** while it looks for current, relevant pages.
2. Lists the **sources** it found.
3. Streams in an answer, word by word, with citation chips such as **1** and **2** after the sentences each source supports.
4. Leaves **Copy** and **Retry** buttons under the answer, and a box for your follow-up question.

Ask "Which one needs less maintenance?" next, and SYNAPSE keeps the context of the first question.

## Getting help

- Browse the [FAQ](/faq) and [Troubleshooting](/troubleshooting) pages; most questions are answered there.
- For payment questions, use [Razorpay's support page](https://razorpay.com/support/), which forwards your request to us with the payment details attached.
- For bugs and feature ideas, open an issue on [GitHub](https://github.com/TrueVeX/synapse/issues).
