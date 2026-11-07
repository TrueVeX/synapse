---
title: Run your own SYNAPSE
nav: Self-hosting
description: Run SYNAPSE on your computer with PowerShell, deploy it to Vercel and Supabase, set up Razorpay and Google sign-in, and build the apps.
---

This guide is for developers. It covers running SYNAPSE locally on Windows, deploying it, and building the apps. The source code is on [GitHub](https://github.com/TrueVeX/synapse).

## Requirements

| Tool | Version | Used for |
|---|---|---|
| Python | 3.11 | Backend |
| Node.js | 20 or newer | Frontend, docs, apps |
| Git | any recent | Getting the code |
| Android Studio | recent | Android app only (provides the JDK and SDK) |

You also need API keys from [OpenRouter](https://openrouter.ai) (AI) and, for web search, [Tavily](https://tavily.com).

## Run locally on Windows

Open **PowerShell** and get the code:

```powershell
git clone https://github.com/TrueVeX/synapse.git
cd synapse
```

### 1. Backend

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Fill in at least `OPENROUTER_API_KEY`, `TAVILY_API_KEY` and a real `JWT_SECRET`. Generate a secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Leave `DATABASE_URL` empty to use a local SQLite file (`backend/synapse.db`). Start the server:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

Check it at `http://localhost:8000/api/health`; the API explorer is at `http://localhost:8000/docs`.

> [!TIP]
> If PowerShell refuses to run `Activate.ps1`, run `Set-ExecutionPolicy -Scope Process Bypass -Force` first. It only affects the current window.

### 2. Frontend

In a **second** PowerShell window:

```powershell
cd synapse\frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and create an account.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `OPENROUTER_MODEL` | no | Model id, default `nvidia/nemotron-3.5-super-vl:free` |
| `TAVILY_API_KEY` | recommended | Tavily key; without it, answers have no web sources |
| `JWT_SECRET` | yes | Long random secret for sign-in tokens (32+ characters on Vercel) |
| `ACCESS_TOKEN_MINUTES` | no | Sign-in lifetime, default `10080` (7 days) |
| `FRONTEND_ORIGIN` | yes in production | Website address(es) allowed to call the API, comma-separated |
| `DATABASE_URL` | yes in production | Supabase transaction-pooler connection string (port 6543) |
| `GOOGLE_CLIENT_ID` | no | Enables Google sign-in |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | no | Enable payments |
| `RAZORPAY_WEBHOOK_SECRET` | with payments | Verifies Razorpay webhooks |
| `RAZORPAY_PLAN_PRO_MONTHLY`, `RAZORPAY_PLAN_PRO_ANNUAL`, `RAZORPAY_PLAN_MAX_MONTHLY`, `RAZORPAY_PLAN_MAX_ANNUAL` | for auto-pay | Razorpay plan ids; when set, purchases become auto-renewing subscriptions |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend address, e.g. `http://localhost:8000` (no trailing `/`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same value as the backend's `GOOGLE_CLIENT_ID` |

> [!WARNING]
> Never commit `.env` or `.env.local`. They're listed in `.gitignore`. Keep production secrets in your hosting provider's environment settings.

## Deploy to Vercel and Supabase

### 1. Database

1. Create a project at [supabase.com](https://supabase.com). Use a password made of letters and numbers only.
2. Open **Connect → Transaction pooler** and copy the connection string (port **6543**). Replace `[YOUR-PASSWORD]`, including the brackets, with your password.
3. The backend creates its tables on first start. Afterwards, enable row-level security on every table in the **SQL Editor** so Supabase's public data API can't read them:

```sql
alter table users enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table credit_usage enable row level security;
alter table chat_stops enable row level security;
-- user_settings and razorpay_subscriptions are protected automatically
```

### 2. Backend project

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `backend` and the framework to **FastAPI**.
3. Add the backend environment variables (with `DATABASE_URL`).
4. Deploy, then open `https://<your-backend>.vercel.app/api/health`.

### 3. Frontend project

1. Import the repository again; set **Root Directory** to `frontend` (Next.js).
2. Set `NEXT_PUBLIC_API_URL` to the backend address.
3. Deploy, then put the frontend address in the backend's `FRONTEND_ORIGIN` and redeploy the backend.

## Razorpay setup

1. Complete KYC to use **Live Mode** (Test Mode works immediately).
2. **API keys**: Settings → API Keys → Generate Key. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. **Plans** (for auto-pay): Subscriptions → Plans → Create Plan, one per plan and period. Put their `plan_…` ids in the four `RAZORPAY_PLAN_*` variables.
4. **Webhook**: Settings → Webhooks → Add New Webhook:
   - URL: `https://<your-backend>/api/billing/webhook`
   - Secret: a random string, also set as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`

Without `subscription.charged`, first payments work but **renewals never reach SYNAPSE**.

## Google sign-in setup

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and an **OAuth consent screen** (External), then **Publish** it.
2. Create an **OAuth client ID** of type **Web application**.
3. Add your website addresses (and `http://localhost:3000`) under **Authorized JavaScript origins**. No redirect URIs are needed.
4. Set the client id as `GOOGLE_CLIENT_ID` (backend) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend).

## Build the Windows app

The app shell lives in `apps/desktop`. Set your website address in `apps/app.config.json` first:

```json
{ "url": "https://your-site.vercel.app", "api": "https://your-backend.vercel.app" }
```

Then:

```powershell
cd apps\desktop
npm install
npm run dist
```

The installer and portable `.exe` appear in `apps\desktop\dist`.

## Build the Android app

The app lives in `apps/mobile` (Capacitor). With Android Studio installed:

```powershell
cd apps\mobile
npm install
npm run sync
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

The test build is `android\app\build\outputs\apk\debug\app-debug.apk`.

### Signed release builds

Release builds are signed with a private key that never goes into Git:

1. Create a key once:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -keystore synapse-release.jks -alias synapse -keyalg RSA -keysize 2048 -validity 10000
```

2. Save `apps/mobile/android/keystore.properties` (git-ignored) next to the key:

```properties
storeFile=synapse-release.jks
storePassword=your-password
keyAlias=synapse
keyPassword=your-password
```

3. Build: `.\gradlew.bat assembleRelease`. The signed APK is `android\app\build\outputs\apk\release\app-release.apk`.

> [!IMPORTANT]
> Back up `synapse-release.jks` and its password somewhere safe and private. Every future update must be signed with the same key, or Android refuses to install it over the existing app.

## Build the landing page and docs

- **Landing page** (`sites/landing`): plain HTML, CSS and JavaScript. Open `index.html` in a browser, or deploy the folder as a static Vercel project.
- **Docs** (`sites/docs`): Markdown in `content/`, built with `npm install && npm run build` into `dist/`. To add a page, create `content/<slug>.md` with a `title` in its front matter and add the slug to `NAV` in `build.mjs`.
