---
title: Files and images
description: Attach documents and images to your questions. Supported formats, limits per plan, and tips.
---

SYNAPSE can read documents and images you attach to a message, and use them together with web results.

## How to attach

- Select **+** next to the message box and choose files, or
- **Drag and drop** files onto the message box (on a computer), or
- **Paste** long text: anything over 300 characters becomes a "pasted" attachment card, which keeps your message readable.

Attached files appear as cards above the box. Remove one with its **×** button before sending.

If you send files without a question, SYNAPSE asks itself to "Analyze the attached file" for you.

## Supported formats

| Type | Formats | How SYNAPSE reads it |
|---|---|---|
| **Documents** | PDF | Extracts the text from every page |
| | Word (`.docx`) | Reads the text of every paragraph (text inside tables isn't read yet) |
| | Text (`.txt`), Markdown (`.md`) | Reads the text directly |
| | Data (`.csv`, `.json`) | Reads the contents as text |
| **Images** | PNG, JPG/JPEG, WEBP, GIF | Sends the image to the AI model, which can see it |

Up to the first 100,000 characters of each document are used.

> [!NOTE]
> **Scanned PDFs** (photos of pages) contain no selectable text. SYNAPSE can't read them as documents and tells you so. Export the pages as images and attach those instead; the model can look at images.

## Limits

| Plan | Files per message |
|---|---|
| Free | 1 |
| Pro | 5 |
| Max | 10 |

On the hosted version of SYNAPSE, all attachments in one message together can be **about 4 MB**, because of the hosting platform's request limit. For bigger documents, split them, or copy the relevant pages as text.

If you attach more files than your plan allows, SYNAPSE explains the limit and offers an upgrade; no credits are used.

## What happens to your files

- File **contents** are read for the answer you asked for, sent to the AI model as part of that request, and then discarded. They aren't saved on SYNAPSE's servers.
- The **file names** are saved with your message, so you can see in your history what you attached.
- When you **retry** an answer in the same session, SYNAPSE resends the same files. If you reopen an old chat later, the files are no longer available; attach them again if needed.

> [!WARNING]
> Files are processed by the AI model provider through OpenRouter. Free AI models may have terms that allow the provider to use requests to improve their services. Don't attach confidential, personal or sensitive documents.

## Tips for better results

- **Ask a specific question** about the file: "List every deadline in this contract" works better than "Read this".
- **Point to sections**: "Summarise section 3 of the attached report".
- **Combine with the web**: "Does the attached plan match current government guidance?" makes SYNAPSE compare your file with live sources.
- **For spreadsheets**, export the sheet as CSV first.
