---
title: Windows and Android apps
nav: Windows and Android
description: Download, install, update and uninstall the SYNAPSE apps for Windows and Android.
---

SYNAPSE has apps for **Windows 10 and 11** and **Android 7.0 and later**. Download them from the [SYNAPSE download page](https://synapse-download.vercel.app/#download).

The apps open the live SYNAPSE service in their own window. That means:

- They always have the **newest features**; there's nothing to update for most changes.
- Your **chats, settings, plan and credits** are the same as on the web.
- They need an **internet connection**. Without one, they show a "Can't reach SYNAPSE" screen with a **Try again** button.

## Windows

### Downloads

| File | What it is | Size |
|---|---|---|
| `SYNAPSE-Setup.exe` | Installer. Adds SYNAPSE to the Start menu and desktop | about 116 MB |
| `SYNAPSE-Portable.exe` | Runs without installing, from any folder or USB drive | about 105 MB |

Requirements: Windows 10 or 11, 64-bit.

### Installing

1. Download **`SYNAPSE-Setup.exe`** and open it.
2. If **"Windows protected your PC"** appears, select **More info**, then **Run anyway**.
   This warning appears because the app isn't code-signed yet; Windows doesn't recognise new apps that aren't signed with a paid certificate. Check the file's SHA-256 fingerprint on the download page if you want to confirm it's genuine.
3. Choose where to install SYNAPSE, or keep the default, and finish the installer.
4. Open **SYNAPSE** from the Start menu or the desktop shortcut, and sign in with your email and password.

### Using the Windows app

- Opening SYNAPSE again while it's already running brings the existing window to the front.
- **Links to other websites**, such as sources in answers, open in your default browser.
- **Payments**: Razorpay's checkout opens inside the app, in its own window where needed (for example for bank pages).
- The menu bar is hidden; press **Alt** to show it.

### Uninstalling

Open **Settings → Apps → Installed apps**, find **SYNAPSE**, and select **Uninstall**. The portable version is just a file; delete it.

## Android

### Download

| File | What it is | Size |
|---|---|---|
| `SYNAPSE.apk` | The SYNAPSE app for Android phones and tablets | about 3.6 MB |

Requirements: Android 7.0 or later.

### Installing

1. On your phone, open the [download page](https://synapse-download.vercel.app/#download) and tap **Download APK**. (Or download it on a computer and copy it to the phone's **Download** folder.)
2. Open the downloaded **`SYNAPSE.apk`** from the notification or the **Files** app.
3. If Android says *"For your security, your phone is not allowed to install unknown apps from this source"*, tap **Settings**, turn on **Allow from this source**, and go back.
4. Tap **Install**.
5. If **Google Play Protect** shows a warning, tap **More details → Install anyway**. Play Protect warns about apps that aren't from the Play Store.
6. Tap **Open** and sign in with your email and password.

> [!IMPORTANT]
> If you installed a **test version** of SYNAPSE before, uninstall it first. The public app is signed with HumanForm Studios' release key, and Android won't install it over a test build ("App not installed as package conflicts with an existing package").

### Using the Android app

- **UPI payments**: when you pay with UPI, the app opens GPay, PhonePe, Paytm or your bank's UPI app directly. If no UPI app is installed, use a card instead.
- **Links to other websites**, such as sources, open in your browser.
- **Google sign-in** isn't shown in the app; see [Accounts and sign-in](/accounts#using-the-apps).

### Uninstalling

Long-press the **SYNAPSE** icon and choose **Uninstall** (or **App info → Uninstall**).

## Updates

Most improvements reach the apps automatically, because they load the live service. Occasionally a new app file is needed, for example to support a new payment feature. When that happens, download the new version from the download page and install it over the old one. Your account and chats aren't affected.

## Verifying downloads

The download page lists the **SHA-256 fingerprint** of each file. To check a download on Windows, open PowerShell in your Downloads folder and run:

```powershell
Get-FileHash .\SYNAPSE-Setup.exe -Algorithm SHA256
```

The **Hash** value should match the fingerprint on the download page exactly.

## iPhone and iPad

There's no iOS app yet. Open [synapse-humanform.vercel.app](https://synapse-humanform.vercel.app) in Safari, tap **Share → Add to Home Screen**, and SYNAPSE opens full-screen like an app.
