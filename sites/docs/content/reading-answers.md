---
title: Reading answers
description: Citations, sources, the thinking panel, formatting, and the actions under every answer.
---

SYNAPSE answers are designed to be checked. This page explains each part of an answer and how to use it.

## The parts of an answer

From top to bottom, an answer can contain:

1. **Researched in N steps**: what SYNAPSE did on its own before answering: its plan, every search it ran and every page it opened to read in full. Select the line to expand it.
2. **Thinking**: the model's reasoning, when the model shares it. It's collapsed once the answer starts and shows how long the model thought.
3. **The answer**: formatted text with numbered citations.
4. **Actions**: copy and retry buttons.

## Citations

Citations look like small numbered chips placed after a sentence or list item, for example **1** or **2**. Each number matches a source in the sources list.

- **Tap or click a chip** to open that source in a new tab.
- **Several chips** after one sentence mean several sources support it.
- **No chip** usually means the sentence is a summary, a definition, or general reasoning that connects cited points.

SYNAPSE is instructed never to invent a source. If the search finds nothing relevant, it says so rather than citing pages that don't support the answer.

> [!IMPORTANT]
> AI can still make mistakes, such as misreading a page or overstating what it says. For anything important (health, money, law, safety), open the cited sources and check them yourself. The footer under the message box says this too: *SYNAPSE can make mistakes. Please double-check responses.*

## The sources list

Open the **Sources** tab to see every page SYNAPSE found: the page title, its website, and a link. Expand **Researched in N steps** to see the exact searches it chose and which pages it read in full, which helps you understand why certain pages appeared.

## How SYNAPSE researches on its own

SYNAPSE doesn't run one fixed search. Before answering, it repeats a short loop:

1. **Plan**: decide what is still missing to answer well.
2. **Act**: search the web with queries it writes itself, or open up to two of the pages it found to read them in full.
3. **Check**: look at what it has. If sources disagree or something is missing, it goes round again; otherwise it writes the answer.

**Web research** is built for speed: it plans once, runs its searches at the same time, and answers straight away (it only goes round again if the first results are thin), so most answers start within seconds. **Academic** takes up to 3 rounds, and **Deep research** up to 4: it reads full pages, always checks the web at least once, and thinks longer before writing. It stops early as soon as the sources cover your question, and it never spends extra credits: one answer costs the same however many steps it takes.

If web search is unavailable or fails, the block says so, and SYNAPSE answers from the model's own knowledge and any files you attached, without web citations.

## The thinking panel

Some AI models share their step-by-step reasoning while they work. When they do, SYNAPSE shows it in a **Thinking** panel above the answer:

- While the model is thinking, the panel is open and updates live.
- When the answer starts, it closes and shows the thinking time, for example "Thought for 6 seconds".
- Open it any time to read the reasoning.

You can hide thinking panels completely with **Settings → General → Show thinking**.

## Formatting

Answers use rich formatting where it helps:

- **Headings** to organise longer answers.
- **Bullet and numbered lists** for steps and key points.
- **Tables** for comparisons. Wide tables scroll sideways on phones.
- **Code blocks** with syntax highlighting, a language label and a **Copy** button.
- **Bold** for key terms.

The answer text uses a serif font (Source Serif 4) for comfortable reading; the interface uses Inter.

## Actions under an answer

| Action | What it does |
|---|---|
| **Copy** | Copies the answer as text, including Markdown formatting |
| **Retry** | Asks the same question again and replaces the last answer. It uses the same mode and the same attachments, and costs the same credits as asking again |

On computers the actions appear when you hover over an answer; the newest answer always shows them. On phones they're always visible.

## Stopped and failed answers

- **Stopped**: if you select **Stop**, the words written so far are kept, marked as stopped. Stopping before any words appear returns your credits.
- **Failed**: if something goes wrong (for example the AI service is busy), the answer shows an error message and a **Retry** button. If nothing was written, your credits are returned automatically.
- **Connection lost**: if your internet drops mid-answer, SYNAPSE tries to finish and save the answer on the server. Open the chat again to check; if the answer is missing or cut short, select **Retry**.

## Long conversations

- Use the **jump to latest** arrow that appears when you scroll up.
- SYNAPSE follows the answer as it grows, unless you've scrolled up to read something, in which case it stays where you are.
- For best results, start a **new chat** when you change topic. Each chat sends only its own recent messages as context.
