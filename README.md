# SYNAPSE

**Created by Revoori Ashwath Reddy · HumanForm Studios**

SYNAPSE is an AI research assistant. Ask a question and it searches the web, reads any files you attach, and streams back a cited answer in a chat interface.

## Live websites

- **Use SYNAPSE:** https://synapse-humanform.vercel.app
- **Home page and downloads:** https://humanform-synapse.vercel.app
- **Documentation:** https://synapse-humanform-docs.vercel.app
- **SYNAPSE Browser downloads:** https://synapse-browser.vercel.app
- **Backend API:** https://synapse-ai-research.vercel.app
- **Downloads:** [Windows installer](https://github.com/TrueVeX/synapse/releases/latest/download/SYNAPSE-Setup.exe) · [Windows portable](https://github.com/TrueVeX/synapse/releases/latest/download/SYNAPSE-Portable.exe) · [Android APK](https://github.com/TrueVeX/synapse/releases/latest/download/SYNAPSE.apk)

## Features

- **Chat interface** with a sidebar of saved chats (rename, delete), a greeting screen with suggested prompts, and shareable chat links (`/chat/<id>`).
- **Live streaming answers** that appear smoothly as they are written, with a **Stop** button and **Retry**.
- **Web research**: answers cite their sources; citations appear as clickable source chips and a "Searched the web" panel.
- **Thinking panel** showing the model's reasoning when the model provides it.
- **Research modes**: Web research, Academic and Deep research.
- **Attachments**: images (PNG, JPG, WEBP, GIF) and documents (DOCX, TXT, MD, CSV, JSON). PDF reading needs the optional `pymupdf` package.
- **Formatted answers**: headings, lists, tables and syntax-highlighted code blocks with a copy button.
- **Accounts**: sign up / sign in with hashed passwords and signed login tokens.
- **Mobile-friendly**: touch-sized controls, slide-in sidebar, and safe-area support for notched phones.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4, Motion |
| Backend | Python FastAPI |
| Database | SQLite locally, or PostgreSQL (Supabase) when `DATABASE_URL` is set |
| AI | OpenRouter (default model: `nvidia/nemotron-3.5-super-vl:free`) |
| Web search | Tavily |
| Hosting (optional) | Vercel |

## Getting started (Windows)

You need **Python 3.11**, **Node.js 20+**, an **OpenRouter API key**, and (optionally) a **Tavily API key**.

### 1. Backend

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Fill in `backend/.env`:

```env
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=nvidia/nemotron-3.5-super-vl:free
TAVILY_API_KEY=your_tavily_key
JWT_SECRET=a_long_random_secret
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_URL=
```

Create a real `JWT_SECRET` (do not keep the example text). This prints a random value to paste in:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Leave `DATABASE_URL` empty to use a local `synapse.db` file. Then start the backend:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

In a second PowerShell window:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open **http://localhost:3000**.

The helper scripts `start-backend.ps1` and `start-frontend.ps1` do the same steps. If PowerShell blocks them, run `Set-ExecutionPolicy -Scope Process Bypass -Force` first.

## Deploying (Vercel + Supabase)

The repository is ready to deploy as **two Vercel projects**: one with root directory `backend/` (the API, entry point `backend/index.py`) and one with root directory `frontend/` (the website).

1. Create a Supabase project, open **Connect → Transaction pooler**, and copy the connection string.
2. In the **backend** Vercel project, add the environment variables `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TAVILY_API_KEY`, `JWT_SECRET`, `DATABASE_URL` and `FRONTEND_ORIGIN` (your website's Vercel address).
3. In the **frontend** Vercel project, set `NEXT_PUBLIC_API_URL` to the backend's Vercel address.

On Vercel the backend refuses to start without `DATABASE_URL` or with a weak `JWT_SECRET`. Vercel limits each request to about 4.5 MB of uploads and 300 seconds.

## Websites

| Site | Address | Source |
|---|---|---|
| SYNAPSE (the app) | https://synapse-humanform.vercel.app | `frontend/` + `backend/` |
| Home page and downloads | https://humanform-synapse.vercel.app | `sites/landing/` (static HTML) |
| Documentation | https://synapse-humanform-docs.vercel.app | `sites/docs/` (Markdown, built with `npm run build`) |

## Windows and Android apps

The apps in `apps/` open the deployed SYNAPSE website, so they always show the latest version. First set your website address in `apps/app.config.json` (`"url": "https://your-site.vercel.app"`); until then the apps show a "not connected yet" screen.

- **Windows (.exe):** `cd apps/desktop`, `npm install`, `npm run dist`. The installer and a portable `.exe` appear in `apps/desktop/dist/`.
- **Android (.apk):** needs Android Studio. `cd apps/mobile`, `npm install`, `npm run sync`, then in `apps/mobile/android` run `gradlew.bat assembleDebug` (with `JAVA_HOME` set to Android Studio's `jbr` folder). The APK appears in `android/app/build/outputs/apk/debug/`.

Google blocks its sign-in inside app windows, so the apps offer email and password sign-in; "Continue with Google" works on the website.

## Keeping your keys private

API keys are **never** stored in this repository. They live only in `backend/.env` (and `frontend/.env.local`), which are listed in `.gitignore`, and in your hosting provider's environment settings. Only the `.env.example` templates, with empty values, are committed. If a key is ever exposed, revoke it in the provider's dashboard and create a new one.

Do not upload confidential or personal documents to free AI models; the provider's terms apply to what you send.

## Credits

SYNAPSE is built on these services and open-source projects. Thank you to their creators.

**Services**

- [OpenRouter](https://openrouter.ai): access to AI models
- [NVIDIA](https://www.nvidia.com) Nemotron: the default AI model
- [Tavily](https://tavily.com): web search API for cited answers
- [Supabase](https://supabase.com): hosted PostgreSQL database
- [Vercel](https://vercel.com): hosting

**Frameworks and libraries**

- [Next.js](https://nextjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com)
- [FastAPI](https://fastapi.tiangolo.com), [Uvicorn](https://www.uvicorn.org), [Pydantic](https://docs.pydantic.dev), [Requests](https://requests.readthedocs.io)
- [Motion](https://motion.dev) for animations, [Lucide](https://lucide.dev) for icons
- [react-markdown](https://github.com/remarkjs/react-markdown), [remark-gfm](https://github.com/remarkjs/remark-gfm), [rehype-highlight](https://github.com/rehypejs/rehype-highlight) and [highlight.js](https://highlightjs.org) for formatted answers
- [passlib](https://passlib.readthedocs.io) and [bcrypt](https://github.com/pyca/bcrypt) for password hashing, [python-jose](https://github.com/mpdavis/python-jose) for login tokens
- [psycopg](https://www.psycopg.org) for PostgreSQL, [python-docx](https://python-docx.readthedocs.io) for Word files
- Fonts: [Inter](https://rsms.me/inter/) and [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) via Google Fonts

**Design**

- UI components from the [21st.dev](https://21st.dev) community: the chat input, the "shining text" thinking animation, the sign-up form and the prompt composer
- Color theme: [Claude theme by @serafimcloud](https://21st.dev/@serafimcloud/themes/claude) on 21st.dev
- The chat layout is inspired by modern AI assistants such as Claude. SYNAPSE is an independent project and is not affiliated with or endorsed by Anthropic, OpenRouter, NVIDIA, Tavily, Supabase or Vercel.

## License

SYNAPSE is open source under the [MIT License](LICENSE). © 2026 Revoori Ashwath Reddy (HumanForm Studios).
