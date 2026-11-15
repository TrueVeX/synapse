---
title: Accounts and sign-in
description: Signing up with email or Google, staying signed in, using the apps, and deleting your account.
---

## Ways to sign in

| Method | Where it works | What SYNAPSE receives |
|---|---|---|
| **Email and password** | Website, Windows app, Android app | The name, email and password you enter |
| **Continue with Google** | Website | Your name and verified email address from Google |
| **Sign in with a code** | Website, Windows app, Android app | A 6-digit code sent to your email, or by text to the mobile number on your account |

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
> If you created your account with **Continue with Google**, it has no SYNAPSE password yet. To use the apps, choose **Sign in with a code** (the code goes to your Google email), or set a password with **Forgot password?**. Use SYNAPSE in your phone's browser instead, and add it to your home screen for an app-like experience (Chrome: **⋮ → Add to Home screen**; Safari: **Share → Add to Home Screen**).

## Forgotten password

1. On the sign-in screen, select **Forgot password?** (next to the password field).
2. Enter your **email**, or the **mobile number** you added to your account, and select **Send code**.
3. Enter the **6-digit code** from the email or text message, choose a **new password**, and select **Set new password**. You're signed in straight away.

Codes expire after **10 minutes** and stop working after **5 wrong tries**. You can ask for a new code after 45 seconds (up to 5 an hour). For your privacy, SYNAPSE gives the same reply whether or not an account exists for what you typed, so if no code arrives, check the spelling, your spam folder, or try your other sign-in.

This also works for accounts created with Google: it sets a SYNAPSE password so you can use the apps.

## Sign in with a code

Prefer not to type a password? Select **Sign in with a code** on the sign-in screen, enter your email or mobile number, and type the 6-digit code you receive.

## Your mobile number

Add a mobile number in **Settings → Account → Mobile number**. SYNAPSE texts a 6-digit code to confirm it's yours. Once added, you can use the number to sign in with a code or reset your password. Numbers without a country code are treated as Indian (+91); for other countries, start with **+** and the country code. Each number can belong to one account. You can change or remove it at any time.

## Changing your details

- **Name**: change it in **Settings → Account → Full name**.
- **Email**: can't be changed yet. To use a different email, create a new account.

## Deleting your account

Go to **Settings → Account → Delete account** and type your email to confirm. SYNAPSE cancels any auto-pay first, then permanently deletes your chats, settings and plan. See [Settings → Deleting your account](/settings#deleting-your-account) for exactly what is removed.

## Account security tips

- Sign out on shared computers.
- Don't share chat exports; they contain your full history.
- If you think someone else knows your password, contact us so we can help secure your account.
