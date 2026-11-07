---
title: Troubleshooting
description: Fixes for common problems with signing in, answers, files, payments and the apps.
---

Find your problem below. Each fix starts with the quickest thing to try.

## Loading and connection

### SYNAPSE takes a few seconds to load the first time

SYNAPSE's server starts on demand. After a quiet period, the first request can take 5–10 seconds while it wakes up; later requests are fast. Wait a moment and try again.

### "SYNAPSE can't load right now" or "Can't reach the SYNAPSE backend"

1. Check your internet connection.
2. Select **Try again**.
3. If it keeps happening, the service may be briefly unavailable. Try again in a few minutes.

### The page doesn't scroll on my phone

Update your browser, or reinstall the latest Android app from the download page. If one page still doesn't scroll, tell us which page and which phone you use.

## Signing in

### "Your session is invalid or expired"

Sign-ins last 7 days. Sign in again.

### I can't find the Google button in the app

Google sign-in is only available on the website. See [Accounts and sign-in](/accounts#using-the-apps).

### "An account with this email already exists"

You've signed up before, perhaps with Google. Use **Sign in**, or **Continue with Google** on the website.

### Google sign-in shows an error

Make sure pop-ups are allowed for SYNAPSE in your browser, and that you're not in a private window that blocks third-party cookies. Try again, or use email and password.

## Answers

### "You've used your … credits"

You've run out of credits for today (Free) or this cycle (Pro and Max). The message says when they reset. Upgrade on the pricing page for more. See [Plans and credits](/plans-and-credits).

### "Deep research and extended thinking are part of Pro and Max"

You chose Deep research, or turned on extended thinking, on the Free plan. Switch back to Web research or Academic, or upgrade.

### An answer stopped halfway or shows an error

Select **Retry**. If the AI service is busy, waiting a minute usually helps. Failed answers that wrote nothing don't use credits.

### "Web search failed" or no sources

The search service may be temporarily unavailable. SYNAPSE still answers from the model's knowledge and your files. Retry later to get cited sources.

### Answers are in the wrong language

Check **Settings → General → Response language**. With **Auto**, SYNAPSE matches the language you write in.

## Files

### "Your Free plan allows 1 file per message"

Remove the extra files, send them in separate messages, or upgrade (Pro: 5, Max: 10).

### "Could not read PDF"

The PDF may be damaged or password-protected, or it's a scanned document with no selectable text. Try exporting the PDF again, removing the password, or attaching the pages as images.

### A large file fails to send

The hosted service accepts about 4 MB of attachments per message. Split the document or attach only the pages you need.

## Payments

### UPI doesn't appear in the payment options

- In the **Android app**, install the latest version from the download page; older test versions didn't support UPI apps.
- In a **browser**, make sure you're paying in INR and that your bank supports UPI AutoPay.
- Use a card if UPI still isn't offered.

### My payment succeeded but my plan didn't change

Refresh the pricing page after a minute. If you see "Payment received. Your plan will be active within a few minutes", Razorpay's notification will finish activating it. If nothing changes after 10 minutes, contact us through [Razorpay's support page](https://razorpay.com/support/).

### I was charged twice

Open the pricing page and check **Payment history**. If you see two charges for the same period, contact us through Razorpay's support page and we'll refund the duplicate.

### I want to stop auto-pay

Pricing page → **Cancel auto-renew** → **Yes, cancel**. See [Billing and auto-pay](/billing#cancelling).

## Apps

### Windows: "Windows protected your PC"

Select **More info → Run anyway**. The app isn't code-signed yet.

### Android: "App not installed"

- You may have an older **test version** installed. Uninstall SYNAPSE, then install the new APK.
- Make sure the download finished (the file is about 3.6 MB).
- Make sure you allowed **install unknown apps** for the app you opened the APK from.

### Android: Play Protect blocks the install

Tap **More details → Install anyway**. Play Protect warns about apps that aren't from the Play Store.

### The app shows "Can't reach SYNAPSE"

Check your internet connection and tap **Try again**. The apps need the internet to work.

## Still stuck?

- Search these docs with **Ctrl + K** (or the search button).
- Payment issues: [Razorpay support](https://razorpay.com/support/).
- Bugs: [open an issue on GitHub](https://github.com/TrueVeX/synapse/issues). Don't include passwords or payment details.
