---
title: Accounts and sign-in
description: Signing up with email or Google, staying signed in, using the apps, and deleting your account.
---

## Ways to sign in

| Method | Where it works | What SYNAPSE receives |
|---|---|---|
| **Email and password** | Website, Windows app, Android app | The name, email and password you enter |
| **Continue with Google** | Website | Your name and verified email address from Google |

### Passwords

- Passwords need **at least 8 characters** (up to 72 bytes).
- SYNAPSE stores only a **bcrypt hash** of your password, never the password itself.
- Use a password you don't use anywhere else.

### Google sign-in

When you select **Continue with Google**, Google asks you to choose an account and approve sharing your name and email. SYNAPSE checks with Google that the sign-in is genuine and was issued for SYNAPSE before letting you in. Only Google accounts with a verified email address can sign in.

If an account with the same email already exists, Google sign-in opens that account.

## Staying signed in

After signing in, your browser or app keeps a signed sign-in token for **7 days**. After that, you're asked to sign in again. Signing in on one device doesn't sign you out anywhere else.

To sign out, open the account menu at the bottom of the sidebar, or go to **Settings → Account → Sign out**.

## Using the apps

The Windows and Android apps sign in with **email and password**. Google's sign-in isn't available inside apps, because Google doesn't allow its sign-in inside app windows, so the apps hide that button.

> [!NOTE]
> If you created your account with **Continue with Google**, it has no SYNAPSE password yet, so you can't sign in to the apps with it for now. Use SYNAPSE in your phone's browser instead, and add it to your home screen for an app-like experience (Chrome: **⋮ → Add to Home screen**; Safari: **Share → Add to Home Screen**).

## Forgotten password

Password reset by email isn't available yet. If you've forgotten your password and also signed up with a Google account using the same email, sign in with Google on the website. Otherwise, contact us through [GitHub](https://github.com/TrueVeX/synapse/issues) without posting any private details.

## Changing your details

- **Name**: change it in **Settings → Account → Full name**.
- **Email**: can't be changed yet. To use a different email, create a new account.

## Deleting your account

Go to **Settings → Account → Delete account** and type your email to confirm. SYNAPSE cancels any auto-pay first, then permanently deletes your chats, settings and plan. See [Settings → Deleting your account](/settings#deleting-your-account) for exactly what is removed.

## Account security tips

- Sign out on shared computers.
- Don't share chat exports; they contain your full history.
- If you think someone else knows your password, contact us so we can help secure your account.
