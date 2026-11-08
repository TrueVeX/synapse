
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import os
import sqlite3
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field


# ============================================================
# 1. CONFIGURATION
# ============================================================

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

DB_PATH = BACKEND_DIR / "synapse.db"

# Set DATABASE_URL (Supabase "Transaction pooler" connection string) to use
# Postgres. Without it, the local synapse.db SQLite file is used.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

# Vercel sets VERCEL=1. Its file system is temporary, so SQLite and the
# built-in development JWT secret are not allowed there.
ON_VERCEL = bool(os.getenv("VERCEL"))

if ON_VERCEL and not USE_POSTGRES:
    raise RuntimeError(
        "DATABASE_URL is not set. Add your Supabase connection string "
        "in the Vercel project's Environment Variables."
    )

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()

OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "nvidia/nemotron-3.5-super-vl:free",
).strip()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

JWT_SECRET = os.getenv(
    "JWT_SECRET",
    "change-this-development-secret",
)

PLACEHOLDER_JWT_SECRETS = {
    "change-this-development-secret",
    "replace-this-with-a-long-random-secret",
}

if ON_VERCEL and (JWT_SECRET in PLACEHOLDER_JWT_SECRETS or len(JWT_SECRET) < 32):
    raise RuntimeError(
        "JWT_SECRET must be set to a long random value (32+ characters) "
        "in the Vercel project's Environment Variables."
    )

JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_MINUTES = int(
    os.getenv("ACCESS_TOKEN_MINUTES", "10080")
)

MAX_UPLOAD_BYTES = 15 * 1024 * 1024

TEXT_FILE_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json"
}

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif"
}


# ============================================================
# 2. FASTAPI AND CORS
# ============================================================

app = FastAPI(
    title="SYNAPSE API",
    description="AI-powered research assistant API",
    version="0.3.0",
)

configured_origins = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000",
)

ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in configured_origins.split(",")
    if origin.strip()
]

for origin in (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
):
    if origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 3. PASSWORD SECURITY
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


# ============================================================
# 4. REQUEST MODELS
# ============================================================

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


# ============================================================
# 5. DATABASE
# ============================================================

class QueryResult:
    """Rows from one query, plus the new row's id after an INSERT."""

    def __init__(self, cursor, lastrowid=None, first_row=None):
        self._cursor = cursor
        self._first_row = first_row
        self.lastrowid = lastrowid
        self.rowcount = cursor.rowcount

    def fetchone(self):
        if self._first_row is not None:
            row, self._first_row = self._first_row, None
            return row
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()


class DatabaseConnection:
    """One connection to SQLite (local) or Postgres (Supabase).

    Queries are written once with SQLite-style "?" placeholders; for
    Postgres they are converted. Use it as `with get_connection() as c:`;
    the block commits on success, rolls back on error and closes.
    """

    _INSERT_WITH_ID = ("INSERT INTO USERS", "INSERT INTO MESSAGES")

    def __init__(self):
        if USE_POSTGRES:
            import psycopg
            from psycopg.rows import dict_row

            self._raw = psycopg.connect(
                DATABASE_URL,
                row_factory=dict_row,
                prepare_threshold=None,  # required by Supabase's pooler
                connect_timeout=15,
            )
        else:
            self._raw = sqlite3.connect(DB_PATH, timeout=15)
            self._raw.row_factory = sqlite3.Row

    def execute(self, sql: str, params=()):
        if not USE_POSTGRES:
            cursor = self._raw.execute(sql, params)
            return QueryResult(cursor, cursor.lastrowid)

        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")
        sql = sql.replace("?", "%s")
        wants_id = " ".join(sql.split()).upper().startswith(self._INSERT_WITH_ID)

        if wants_id:
            sql = sql.rstrip() + " RETURNING id"

        cursor = self._raw.cursor()
        cursor.execute(sql, params)

        if wants_id:
            row = cursor.fetchone()
            return QueryResult(cursor, row["id"])

        return QueryResult(cursor)

    def commit(self):
        self._raw.commit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self._raw.commit()
            else:
                self._raw.rollback()
        finally:
            self._raw.close()
        return False


def get_connection():
    return DatabaseConnection()


def duplicate_key_errors():
    """Exception types raised when a UNIQUE rule (e.g. same email) is broken."""
    errors = [sqlite3.IntegrityError]
    if USE_POSTGRES:
        import psycopg

        errors.append(psycopg.IntegrityError)
    return tuple(errors)


APP_TABLES = (
    "users", "conversations", "messages", "subscriptions", "payments",
    "credit_usage", "chat_stops", "user_settings", "razorpay_subscriptions",
)
APP_INDEXES = ("idx_conversations_user", "idx_messages_conversation")


def database_ready():
    """Postgres only: True when every table, index and RLS setting already
    exists. Each Vercel cold start would otherwise re-run the CREATE / ALTER
    statements, which briefly lock tables and can clash with live requests."""

    with get_connection() as connection:
        tables = connection.execute(
            """
            SELECT c.relname, c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            """
        ).fetchall()
        indexes = connection.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
        ).fetchall()

    found = {row["relname"]: row["relrowsecurity"] for row in tables}
    return (
        all(name in found for name in APP_TABLES)
        and found.get("user_settings") and found.get("razorpay_subscriptions")
        and set(APP_INDEXES) <= {row["indexname"] for row in indexes}
    )


def initialize_database():
    if USE_POSTGRES:
        try:
            if database_ready():
                return
        except Exception:
            traceback.print_exc()  # fall through and create what's missing

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT NOT NULL DEFAULT '[]',
                attachments TEXT NOT NULL DEFAULT '[]',
                mode TEXT,
                thinking TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversations_user
            ON conversations (user_id, updated_at)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
            ON messages (conversation_id, id)
            """
        )
        # Plans, payments and credit usage (section 14c).
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id INTEGER PRIMARY KEY,
                plan TEXT NOT NULL,
                billing TEXT NOT NULL,
                started_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_order_id TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                order_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                billing TEXT NOT NULL,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL,
                status TEXT NOT NULL,
                payment_id TEXT,
                created_at TEXT NOT NULL,
                paid_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_usage (
                user_id INTEGER NOT NULL,
                window_key TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, window_key)
            )
            """
        )
        # Stop requests, so Stop works even when it reaches a different
        # server instance than the one writing the answer (Vercel).
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_stops (
                request_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        # Per-user settings (personalization, response style...), as JSON.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                data TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            )
            """
        )
        # Razorpay auto-pay subscriptions (one row per subscription started).
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS razorpay_subscriptions (
                subscription_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                billing TEXT NOT NULL,
                status TEXT NOT NULL,
                cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
                current_end TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        if USE_POSTGRES:
            # Keep these tables closed to Supabase's public Data API, like the others.
            connection.execute("ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY")
            connection.execute("ALTER TABLE razorpay_subscriptions ENABLE ROW LEVEL SECURITY")
        connection.commit()


initialize_database()


def find_user_by_email(email: str):
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT id, name, email, password_hash, created_at
            FROM users
            WHERE email = ?
            """,
            (email.lower().strip(),),
        ).fetchone()


def public_user(user):
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
    }


# ============================================================
# 6. JWT AUTHENTICATION
# ============================================================

def create_access_token(email: str):
    expires = (
        datetime.now(timezone.utc)
        + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    )

    payload = {
        "sub": email,
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def get_email_from_token(authorization: Optional[str]):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication token is missing.",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        email = payload.get("sub")

        if not email:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token.",
            )

        return email

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Your session is invalid or expired. Please log in again.",
        )


def require_user(authorization: Optional[str]):
    """Returns the signed-in user's row, or raises 401."""

    email = get_email_from_token(authorization)
    user = find_user_by_email(email)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Your session is invalid or expired. Please log in again.",
        )

    return user


# ============================================================
# 7. STATUS ENDPOINTS
# ============================================================

@app.get("/")
def root():
    return {
        "name": "SYNAPSE API",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/status")
@app.get("/api/health")
def api_status():
    return {
        "status": "ok",
        "ai_configured": bool(OPENROUTER_API_KEY),
        "web_search_configured": bool(TAVILY_API_KEY),
        "model": OPENROUTER_MODEL,
    }


# ============================================================
# 8. REGISTER
# ============================================================

@app.post("/api/auth/register")
def register_user(payload: RegisterRequest):

    name = payload.name.strip()
    email = str(payload.email).lower().strip()
    password = payload.password

    if len(name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid name.",
        )

    password_bytes = len(password.encode("utf-8"))

    if password_bytes < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 UTF-8 bytes.",
        )

    if password_bytes > 72:
        raise HTTPException(
            status_code=400,
            detail="Password is too long. Maximum is 72 UTF-8 bytes.",
        )

    try:
        password_hash = pwd_context.hash(password)

        created_at = datetime.now(
            timezone.utc
        ).isoformat()

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users
                (name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    name,
                    email,
                    password_hash,
                    created_at,
                ),
            )

            connection.commit()
            user_id = cursor.lastrowid

    except duplicate_key_errors():
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not create your account. Check the backend terminal.",
        )

    return {
        "message": "Account created successfully.",
        "access_token": create_access_token(email),
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
        },
    }


# ============================================================
# 9. LOGIN
# ============================================================

@app.post("/api/auth/login")
def login_user(payload: LoginRequest):

    email = str(payload.email).lower().strip()

    user = find_user_by_email(email)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password.",
        )

    try:
        valid_password = pwd_context.verify(
            payload.password,
            user["password_hash"],
        )
    except Exception:
        valid_password = False

    if not valid_password:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password.",
        )

    return {
        "message": "Login successful.",
        "access_token": create_access_token(email),
        "token_type": "bearer",
        "user": public_user(user),
    }


# ============================================================
# 10. CURRENT USER
# FIXES THE /api/auth/me 404 ERROR
# ============================================================

# ============================================================
# 9b. SIGN IN WITH GOOGLE
# The browser gets an access token from Google's sign-in popup; we ask
# Google whether it is genuine AND was issued to our own client ID.
# ============================================================

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()


class GoogleLoginRequest(BaseModel):
    access_token: str = Field(min_length=10, max_length=4096)


@app.post("/api/auth/google")
def login_with_google(payload: GoogleLoginRequest):

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not set up yet. Use email and password for now.",
        )

    try:
        info = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": payload.access_token},
            timeout=15,
        )
        profile = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {payload.access_token}"},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Could not reach Google. Please try again.") from exc

    if not info.ok or not profile.ok:
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")

    token = info.json()
    person = profile.json()

    # A token made for a different app must not log anyone in here.
    if token.get("aud") != GOOGLE_CLIENT_ID and token.get("azp") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="This Google sign-in was not made for SYNAPSE.")

    email = str(person.get("email") or token.get("email") or "").lower().strip()
    verified = person.get("email_verified") in (True, "true") or token.get("email_verified") in (True, "true")

    if not email or not verified:
        raise HTTPException(status_code=401, detail="Your Google account's email address is not verified.")

    user = find_user_by_email(email)

    if not user:
        name = (str(person.get("name") or "").strip() or email.split("@")[0])[:100]
        # Google accounts get a random password nobody knows; they sign in with Google.
        password_hash = pwd_context.hash(secrets.token_urlsafe(32))

        try:
            with get_connection() as connection:
                connection.execute(
                    """
                    INSERT INTO users (name, email, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (name, email, password_hash, datetime.now(timezone.utc).isoformat()),
                )
        except duplicate_key_errors():
            pass  # created a moment ago by a parallel request

        user = find_user_by_email(email)

    return {
        "message": "Login successful.",
        "access_token": create_access_token(email),
        "token_type": "bearer",
        "user": public_user(user),
    }


@app.get("/api/auth/me")
def get_current_user(
    authorization: Optional[str] = Header(default=None),
):

    email = get_email_from_token(authorization)

    user = find_user_by_email(email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User account not found.",
        )

    return {
        "user": public_user(user),
    }


# ============================================================
# 11. DOCUMENT TEXT EXTRACTION
# ============================================================

def extract_document_text(filename: str, data: bytes):

    extension = Path(filename).suffix.lower()

    if extension in TEXT_FILE_EXTENSIONS:
        return data.decode(
            "utf-8",
            errors="replace",
        )[:100000]

    if extension == ".pdf":
        try:
            try:
                import fitz  # PyMuPDF: best quality, optional
            except ImportError:
                fitz = None

            if fitz:
                with fitz.open(
                    stream=data,
                    filetype="pdf",
                ) as pdf:
                    pages = [
                        page.get_text("text")
                        for page in pdf
                    ]
            else:
                # pypdf: pure Python, small enough for Vercel.
                from pypdf import PdfReader

                reader = PdfReader(BytesIO(data))
                pages = [
                    page.extract_text() or ""
                    for page in reader.pages
                ]

            text = "\n\n".join(pages).strip()
            if not text:
                raise ValueError(
                    "it has no selectable text (it may be a scanned image)"
                )

            return text[:100000]

        except Exception as exc:
            raise ValueError(
                f"Could not read PDF: {exc}"
            ) from exc

    if extension == ".docx":
        try:
            from docx import Document

            document = Document(BytesIO(data))

            paragraphs = [
                paragraph.text
                for paragraph in document.paragraphs
            ]

            return "\n".join(paragraphs)[:100000]

        except Exception as exc:
            raise ValueError(
                f"Could not read DOCX: {exc}"
            ) from exc

    return ""


# ============================================================
# 12. TAVILY WEB SEARCH
# ============================================================

import re as _re

# Words that mean the answer depends on live or verifiable information.
_WEB_SIGNALS = _re.compile(
    r"\b("
    r"search|look\s*up|google|browse|online|on the (web|internet)|website|web ?site|url|links?|"
    r"sources?|cite|citations?|references?|according to|"
    r"latest|recent(ly)?|current(ly)?|today|tonight|yesterday|tomorrow|this (week|month|year)|"
    r"right now|as of|up to date|news|headlines?|breaking|trending|"
    r"prices?|how much (does|do|is) .{0,40}cost|stock price|share price|crypto|bitcoin|exchange rate|"
    r"weather|forecast|live score|scores?|fixtures?|standings|"
    r"election|elected|polls?|release date|released|launched|announced|"
    r"who won|who is the (current )?(ceo|president|prime minister|pm|chief|head|owner|founder)|"
    r"studies|research (on|about|says)|statistics|stats on|data on|survey|journal|"
    r"compare|comparison|versus|reviews?|best .{0,30} (to buy|in 20\d\d)|"
    r"20[2-9]\d"
    r")\b",
    _re.IGNORECASE,
)

# Small talk that never needs the web, even as a short follow-up.
_SMALL_TALK = _re.compile(
    r"^\s*(hi|hello|hey|hii+|yo|thanks?|thank you|thx|ok(ay)?|cool|nice|great|bye|good (morning|afternoon|evening|night)|"
    r"how are you|who are you|what('?s| is) your name|who (built|made|created) you)\b",
    _re.IGNORECASE,
)


def needs_web_search(question: str, search_text: str, mode: str) -> bool:
    """Decides whether an answer should use live web search.

    Deep research always searches. Otherwise SYNAPSE answers from the model
    itself and only searches when the question asks for current, sourced or
    verifiable information (news, prices, "latest", studies, links...).
    """

    if mode.lower() in ("deep", "deep research"):
        return True
    if not TAVILY_API_KEY:
        return False
    if _SMALL_TALK.match(question or ""):
        return False
    if _re.search(r"https?://|www\.", question or ""):
        return True
    return bool(_WEB_SIGNALS.search(search_text or question or ""))


def search_web(query: str, mode: str):

    if not TAVILY_API_KEY:
        return []

    depth = (
        "advanced"
        if mode.lower() in ("deep", "deep research")
        else "basic"
    )

    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": depth,
                "topic": "general",
                "max_results": 6,
                "include_answer": False,
            },
            timeout=30,
        )

        response.raise_for_status()

        results = response.json().get(
            "results",
            [],
        )

        return [
            {
                "title": item.get("title", "Untitled source"),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                "score": item.get("score"),
            }
            for item in results
        ]

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Web search failed: {exc}",
        ) from exc


# ============================================================
# 13. OPENROUTER AI RESEARCH
# ============================================================

SYSTEM_PROMPT = (
    "You are SYNAPSE, an accurate AI research "
    "assistant. Never fabricate citations. "
    "SYNAPSE was built by Revoori Ashwath Reddy at HumanForm Studios. "
    "Whenever someone asks "
    "who built, made, created, developed or owns you (or SYNAPSE), or "
    "asks about your developer or creator, answer directly that you were "
    "built by Revoori Ashwath Reddy at HumanForm Studios. Do not use web search results or "
    "citation markers for that answer."
)

MODE_INSTRUCTIONS = {
    "academic": (
        "Use a clear academic style. Define important terms "
        "and distinguish evidence from interpretation."
    ),
    "deep": (
        "Provide a detailed structured investigation. "
        "Compare evidence and explain uncertainty."
    ),
    "deep research": (
        "Provide a detailed structured investigation. "
        "Compare evidence and explain uncertainty."
    ),
}


def build_research_prompt(
    query: str,
    mode: str,
    sources: list,
    document_text: list,
    searched: bool = True,
):

    if not searched:
        # Answered from the model's own knowledge: no web results, no citations.
        document_context = (
            "\n\nUPLOADED DOCUMENTS:\n" + "\n\n".join(document_text)
            if document_text
            else ""
        )
        instruction = MODE_INSTRUCTIONS.get(mode.lower(), "")
        return (
            f"{query}\n\n"
            + (f"{instruction}\n" if instruction else "")
            + "Answer from your own knowledge. No web search was used for this "
            "question, so do not add citation markers like [1] or mention "
            "searching. If the answer depends on very recent events you can't "
            "know, say so briefly."
            + document_context
        )

    source_context = ""

    if sources:
        source_lines = []

        for index, source in enumerate(sources, start=1):
            source_lines.append(
                f"[{index}] {source['title']}\n"
                f"URL: {source['url']}\n"
                f"{source['content']}"
            )

        source_context = (
            "\n\nWEB SEARCH RESULTS:\n"
            + "\n\n".join(source_lines)
        )

    document_context = ""

    if document_text:
        document_context = (
            "\n\nUPLOADED DOCUMENTS:\n"
            + "\n\n".join(document_text)
        )

    instruction = MODE_INSTRUCTIONS.get(
        mode.lower(),
        "Answer clearly and directly using available evidence.",
    )

    return (
        f"Research mode: {mode}\n\n"
        f"Question: {query}\n\n"
        f"{instruction}\n"
        "Never invent facts, URLs, or citations. "
        "Use source markers such as [1] when supported "
        "by the supplied web results. Explain uncertainty.\n"
        f"{source_context}"
        f"{document_context}"
    )


def build_user_content(prompt_text: str, images: list):

    if not images:
        return prompt_text

    message_content = [
        {
            "type": "text",
            "text": prompt_text,
        }
    ]

    for item in images:
        message_content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": item["data_url"],
                },
            }
        )

    return message_content


def call_openrouter(
    query: str,
    mode: str,
    sources: list,
    document_text: list,
    images: list,
):

    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenRouter API key is not configured in backend/.env.",
        )

    prompt_text = build_research_prompt(
        query,
        mode,
        sources,
        document_text,
    )

    message_content = build_user_content(
        prompt_text,
        images,
    )

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "SYNAPSE",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": message_content,
                    },
                ],
                "temperature": 0.3,
            },
            timeout=120,
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_message = (
                    error_data.get("error", {}).get("message")
                    or str(error_data)
                )
            except ValueError:
                error_message = response.text[:1000]

            raise HTTPException(
                status_code=502,
                detail=(
                    f"OpenRouter error ({response.status_code}): "
                    f"{error_message}"
                ),
            )

        result = response.json()

        answer = result["choices"][0]["message"]["content"]

        if isinstance(answer, list):
            answer = "\n".join(
                part.get("text", "")
                for part in answer
                if isinstance(part, dict)
            )

        if not isinstance(answer, str) or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail="The AI returned an empty response.",
            )

        return answer.strip()

    except HTTPException:
        raise

    except requests.Timeout as exc:
        raise HTTPException(
            status_code=504,
            detail="AI request timed out. Please try again.",
        ) from exc

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not contact OpenRouter: {exc}",
        ) from exc

    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from OpenRouter.",
        ) from exc


# ============================================================
# 14a. UPLOADED FILES
# ============================================================

async def read_uploads(files: Optional[list[UploadFile]]):
    """Returns (document_text, image_inputs, attached_filenames)."""

    document_text = []
    image_inputs = []
    attached_filenames = []

    for upload in files or []:

        filename = upload.filename or "uploaded-file"
        attached_filenames.append(filename)

        data = await upload.read()

        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{filename} exceeds the 15 MB upload limit.",
            )

        if not data:
            continue

        extension = Path(filename).suffix.lower()

        if extension in IMAGE_EXTENSIONS:

            mime_type = (
                upload.content_type
                or "application/octet-stream"
            )

            encoded = base64.b64encode(
                data
            ).decode("ascii")

            image_inputs.append(
                {
                    "filename": filename,
                    "data_url": (
                        f"data:{mime_type};base64,{encoded}"
                    ),
                }
            )

        else:

            try:
                extracted = extract_document_text(
                    filename,
                    data,
                )

            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail=str(exc),
                ) from exc

            if extracted.strip():
                document_text.append(
                    f"--- {filename} ---\n{extracted}"
                )
            else:
                document_text.append(
                    f"--- {filename} ---\n"
                    "Text extraction is not supported for this file type."
                )

    return document_text, image_inputs, attached_filenames


# ============================================================
# 14. RESEARCH ENDPOINT
# Accepts query OR prompt, plus optional file uploads.
# ============================================================

@app.post("/api/research")
async def research(
    query: str = Form(""),
    mode: str = Form("web"),
    prompt: str = Form(""),
    files: Optional[list[UploadFile]] = File(default=None),
    authorization: Optional[str] = Header(default=None),
):

    user = require_user(authorization)
    user_query = (query or prompt).strip()

    if not user_query:
        raise HTTPException(
            status_code=400,
            detail="Please enter a research question.",
        )

    window_key, cost = charge_credits(user["id"], mode, len(files or []))

    try:
        document_text, image_inputs, attached_filenames = await read_uploads(
            files
        )

        sources = search_web(
            user_query,
            mode,
        )

        answer = call_openrouter(
            user_query,
            mode,
            sources,
            document_text,
            image_inputs,
        )
    except Exception:
        refund_credits(user["id"], window_key, cost)
        raise

    return {
        "answer": answer,
        "response": answer,
        "content": answer,
        "sources": sources,
        "mode": mode,
        "model": OPENROUTER_MODEL,
        "attached_files": attached_filenames,
    }


# ============================================================
# 14b. CHAT CONVERSATIONS
# Saved per user in SQLite. Used by the chat interface.
# ============================================================

CHAT_SYSTEM_PROMPT = (
    SYSTEM_PROMPT
    + " Format answers in clear Markdown: short paragraphs, headings "
    "and bullet lists where they help, tables for comparisons, and "
    "fenced code blocks with a language name for code. Use earlier "
    "messages in the conversation as context for follow-up questions."
)

MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_CHARS = 6000


class ChatError(Exception):
    """An error whose message is safe to show in the chat."""


class RenameConversationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class StopGenerationRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=100)


class Generation:
    """One answer being written. It runs on its own thread, so it still
    finishes (and is saved) if the browser disconnects, and the Stop
    button ends it through /api/chat/stop."""

    STOP_CHECK_SECONDS = 1.0

    def __init__(self, user_id: int, request_id: str):
        self.user_id = user_id
        self.request_id = request_id
        self.stop_requested = threading.Event()
        self._last_db_check = 0.0

    def should_stop(self):
        """True after Stop was pressed, on this server or another one."""
        if self.stop_requested.is_set():
            return True

        now = time.monotonic()
        if now - self._last_db_check < self.STOP_CHECK_SECONDS:
            return False
        self._last_db_check = now

        try:
            with get_connection() as connection:
                row = connection.execute(
                    "SELECT 1 AS found FROM chat_stops WHERE request_id = ? AND user_id = ?",
                    (self.request_id, self.user_id),
                ).fetchone()
        except Exception:
            traceback.print_exc()
            return False

        if row:
            self.stop_requested.set()
        return self.stop_requested.is_set()

    def forget_stop_request(self):
        try:
            with get_connection() as connection:
                connection.execute(
                    "DELETE FROM chat_stops WHERE request_id = ?",
                    (self.request_id,),
                )
        except Exception:
            traceback.print_exc()


ACTIVE_GENERATIONS = {}
ACTIVE_GENERATIONS_LOCK = threading.Lock()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def make_title(text: str):
    title = " ".join(text.split())

    if not title:
        return "New chat"

    if len(title) <= 60:
        return title

    return title[:60].rstrip() + "…"


def load_json_list(value):
    try:
        data = json.loads(value or "[]")
    except ValueError:
        return []

    return data if isinstance(data, list) else []


def get_owned_conversation(conversation_id: str, user_id: int):
    with get_connection() as connection:
        conversation = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ? AND user_id = ?
            """,
            (conversation_id, user_id),
        ).fetchone()

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


def public_message(row):
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "sources": load_json_list(row["sources"]),
        "attachments": load_json_list(row["attachments"]),
        "mode": row["mode"],
        "thinking": row["thinking"] or "",
        "created_at": row["created_at"],
    }


def public_sources(sources: list):
    return [
        {
            "title": source.get("title") or "Untitled source",
            "url": source.get("url") or "",
            "content": (source.get("content") or "")[:400],
        }
        for source in sources
    ]


def save_assistant_message(
    conversation_id: str,
    reply_to_user_id: int,
    content: str,
    sources: list,
    mode: str,
    thinking: str,
):
    now = utc_now()

    with get_connection() as connection:
        last_user_id = connection.execute(
            """
            SELECT MAX(id) AS last_id FROM messages
            WHERE conversation_id = ? AND role = 'user'
            """,
            (conversation_id,),
        ).fetchone()["last_id"]

        # The chat was deleted, or a newer question was asked meanwhile:
        # this answer no longer belongs at the end of the chat.
        if last_user_id is None or last_user_id != reply_to_user_id:
            return None

        # Retry replaces the earlier answer to the same question.
        connection.execute(
            """
            DELETE FROM messages
            WHERE conversation_id = ? AND role = 'assistant' AND id > ?
            """,
            (conversation_id, last_user_id),
        )

        cursor = connection.execute(
            """
            INSERT INTO messages
            (conversation_id, role, content, sources, attachments,
             mode, thinking, created_at)
            VALUES (?, 'assistant', ?, ?, '[]', ?, ?, ?)
            """,
            (
                conversation_id,
                content,
                json.dumps(sources, ensure_ascii=False),
                mode,
                thinking,
                now,
            ),
        )

        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id),
        )

        connection.commit()
        return cursor.lastrowid


def stream_openrouter(messages: list):
    """Yields ("thinking" | "delta", text) pieces as OpenRouter streams them."""

    if not OPENROUTER_API_KEY:
        raise ChatError(
            "OpenRouter API key is not configured in backend/.env."
        )

    try:
        with requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "SYNAPSE",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
                "temperature": 0.3,
                "stream": True,
            },
            stream=True,
            timeout=(15, 120),
        ) as response:

            if not response.ok:
                try:
                    error_data = response.json()
                    error_message = (
                        error_data.get("error", {}).get("message")
                        or str(error_data)
                    )
                except ValueError:
                    error_message = response.text[:1000]

                raise ChatError(
                    f"OpenRouter error ({response.status_code}): "
                    f"{error_message}"
                )

            for raw_line in response.iter_lines():
                # Decode as UTF-8 ourselves: the stream has no charset header.
                line = raw_line.decode("utf-8", errors="replace").strip()

                # Blank lines and ": keep-alive" comments carry no data.
                if not line.startswith("data:"):
                    continue

                data = line[5:].strip()

                if data == "[DONE]":
                    break

                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue

                if chunk.get("error"):
                    error = chunk["error"]
                    message = (
                        error.get("message")
                        if isinstance(error, dict)
                        else str(error)
                    )
                    raise ChatError(f"OpenRouter error: {message}")

                choices = chunk.get("choices") or []

                if not choices:
                    continue

                delta = choices[0].get("delta") or {}

                reasoning = delta.get("reasoning")
                if isinstance(reasoning, str) and reasoning:
                    yield "thinking", reasoning

                content = delta.get("content")
                if isinstance(content, str) and content:
                    yield "delta", content

    except requests.Timeout as exc:
        raise ChatError(
            "AI request timed out. Please try again."
        ) from exc

    except requests.RequestException as exc:
        raise ChatError(
            f"Could not contact OpenRouter: {exc}"
        ) from exc


@app.get("/api/conversations")
def list_conversations(
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT 200
            """,
            (user["id"],),
        ).fetchall()

    return {
        "conversations": [dict(row) for row in rows],
    }


@app.get("/api/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    conversation = get_owned_conversation(conversation_id, user["id"])

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, role, content, sources, attachments,
                   mode, thinking, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY id
            """,
            (conversation_id,),
        ).fetchall()

    return {
        "conversation": dict(conversation),
        "messages": [public_message(row) for row in rows],
    }


@app.patch("/api/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    payload: RenameConversationRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    get_owned_conversation(conversation_id, user["id"])

    title = " ".join(payload.title.split())

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Please enter a chat name.",
        )

    with get_connection() as connection:
        connection.execute(
            "UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?",
            (title, conversation_id, user["id"]),
        )
        connection.commit()

    return {
        "conversation": dict(
            get_owned_conversation(conversation_id, user["id"])
        ),
    }


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    get_owned_conversation(conversation_id, user["id"])

    with get_connection() as connection:
        connection.execute(
            "DELETE FROM messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        connection.execute(
            "DELETE FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user["id"]),
        )
        connection.commit()

    return {
        "deleted": True,
    }


@app.post("/api/chat/stream")
async def chat_stream(
    query: str = Form(""),
    mode: str = Form("web"),
    conversation_id: str = Form(""),
    regenerate: bool = Form(False),
    request_id: str = Form(""),
    files: Optional[list[UploadFile]] = File(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Streams one chat answer as newline-delimited JSON events:

    meta -> status(searching) -> sources -> status(thinking)
    -> thinking* / delta* -> done | stopped | error
    """

    user = require_user(authorization)
    user_id = user["id"]
    conversation_id = conversation_id.strip()
    request_id = request_id.strip()[:100] or uuid.uuid4().hex

    existing = (
        get_owned_conversation(conversation_id, user_id)
        if conversation_id
        else None
    )

    history_rows = []

    if existing:
        with get_connection() as connection:
            history_rows = connection.execute(
                """
                SELECT id, role, content FROM messages
                WHERE conversation_id = ?
                ORDER BY id
                """,
                (conversation_id,),
            ).fetchall()

    if regenerate:
        rows = list(history_rows)

        while rows and rows[-1]["role"] == "assistant":
            rows.pop()

        if not existing or not rows:
            raise HTTPException(
                status_code=400,
                detail="There is nothing to retry yet.",
            )

        reply_to_user_id = rows[-1]["id"]
        user_query = rows[-1]["content"]
        history_rows = rows[:-1]

    else:
        reply_to_user_id = None
        user_query = query.strip()

        if not user_query:
            raise HTTPException(
                status_code=400,
                detail="Please enter a research question.",
            )

    # The user's personalization settings (name, language, style, custom instructions).
    personal_prompt = personalization_prompt(user, load_settings(user_id))

    # Plan rules and credits: checked before anything is saved.
    window_key, credit_cost_taken = charge_credits(user_id, mode, len(files or []))

    try:
        document_text, image_inputs, attached_filenames = await read_uploads(
            files
        )
    except Exception:
        refund_credits(user_id, window_key, credit_cost_taken)
        raise

    history = [
        {
            "role": row["role"],
            "content": row["content"][:MAX_HISTORY_CHARS],
        }
        for row in history_rows[-MAX_HISTORY_MESSAGES:]
        if row["content"].strip()
    ]

    # Short follow-ups ("what about its cost?") search better with the
    # previous question attached.
    search_query = user_query
    previous_questions = [
        row["content"] for row in history_rows if row["role"] == "user"
    ]

    if previous_questions and len(user_query.split()) < 8:
        search_query = (
            f"{previous_questions[-1]} {user_query}"
        )[:300]

    now = utc_now()

    with get_connection() as connection:
        if existing:
            title = existing["title"]
        else:
            conversation_id = uuid.uuid4().hex
            title = make_title(user_query)
            connection.execute(
                """
                INSERT INTO conversations
                (id, user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (conversation_id, user_id, title, now, now),
            )

        if not regenerate:
            cursor = connection.execute(
                """
                INSERT INTO messages
                (conversation_id, role, content, sources, attachments,
                 mode, thinking, created_at)
                VALUES (?, 'user', ?, '[]', ?, ?, '', ?)
                """,
                (
                    conversation_id,
                    user_query,
                    json.dumps(attached_filenames, ensure_ascii=False),
                    mode,
                    now,
                ),
            )
            reply_to_user_id = cursor.lastrowid

        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id),
        )
        connection.commit()

    loop = asyncio.get_running_loop()
    events = asyncio.Queue()
    generation = Generation(user_id, request_id)

    with ACTIVE_GENERATIONS_LOCK:
        ACTIVE_GENERATIONS[request_id] = generation

    def emit(payload):
        try:
            loop.call_soon_threadsafe(events.put_nowait, payload)
        except RuntimeError:
            pass  # the server is shutting down

    def write_answer():
        answer_parts = []
        thinking_parts = []
        sources = []

        def save(content: str):
            return save_assistant_message(
                conversation_id,
                reply_to_user_id,
                content,
                sources,
                mode,
                "".join(thinking_parts),
            )

        def keep_partial():
            # Failed part-way: keep what was written so far.
            partial = "".join(answer_parts).strip()

            if partial:
                try:
                    save(partial)
                except Exception:
                    traceback.print_exc()

        answered = False

        try:
            emit(
                {
                    "type": "meta",
                    "conversation_id": conversation_id,
                    "title": title,
                    "request_id": request_id,
                    "credits": billing_status(user_id)["credits"],
                }
            )

            searched = needs_web_search(user_query, search_query, mode)

            if searched:
                emit(
                    {
                        "type": "status",
                        "stage": "searching",
                        "query": search_query,
                    }
                )

                search_error = None

                try:
                    sources = public_sources(search_web(search_query, mode))
                except HTTPException as exc:
                    search_error = str(exc.detail)
                    sources = []

                emit(
                    {
                        "type": "sources",
                        "sources": sources,
                        "error": search_error,
                        "enabled": bool(TAVILY_API_KEY),
                        "query": search_query,
                    }
                )

            if generation.should_stop():
                emit({"type": "stopped"})
                return

            emit({"type": "status", "stage": "thinking"})

            prompt_text = build_research_prompt(
                user_query,
                mode,
                sources,
                document_text,
                searched=searched,
            )

            messages = [
                {"role": "system", "content": f"{CHAT_SYSTEM_PROMPT}\n\n{personal_prompt}"},
                *history,
                {
                    "role": "user",
                    "content": build_user_content(prompt_text, image_inputs),
                },
            ]

            pieces = stream_openrouter(messages)

            try:
                for kind, text in pieces:
                    if generation.should_stop():
                        break

                    if kind == "thinking":
                        thinking_parts.append(text)
                    else:
                        answer_parts.append(text)

                    emit({"type": kind, "text": text})
            finally:
                pieces.close()

            answer = "".join(answer_parts).strip()

            if generation.should_stop():
                if answer:
                    save(answer)
                    answered = True
                emit({"type": "stopped"})
                return

            if not answer:
                raise ChatError("The AI returned an empty response.")

            message_id = save(answer)
            answered = True

            emit(
                {
                    "type": "done",
                    "message_id": message_id,
                    "conversation_id": conversation_id,
                }
            )

        except ChatError as exc:
            keep_partial()
            emit({"type": "error", "message": str(exc)})

        except Exception:
            traceback.print_exc()
            keep_partial()
            emit(
                {
                    "type": "error",
                    "message": (
                        "Something went wrong while writing the answer. "
                        "Check the backend terminal."
                    ),
                }
            )

        finally:
            # No answer at all (stopped early or failed): give the credits back.
            if not answered and not "".join(answer_parts).strip():
                refund_credits(user_id, window_key, credit_cost_taken)
            with ACTIVE_GENERATIONS_LOCK:
                ACTIVE_GENERATIONS.pop(request_id, None)
            generation.forget_stop_request()
            emit(None)

    threading.Thread(
        target=write_answer,
        name=f"synapse-answer-{request_id[:8]}",
        daemon=True,
    ).start()

    async def stream_events():
        while True:
            item = await events.get()

            if item is None:
                break

            yield json.dumps(item, ensure_ascii=False) + "\n"

    return StreamingResponse(
        stream_events(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


class RelatedRequest(BaseModel):
    conversation_id: str = Field(min_length=1, max_length=100)


@app.post("/api/chat/related")
def related_questions(
    payload: RelatedRequest,
    authorization: Optional[str] = Header(default=None),
):
    """Suggests three short follow-up questions for the latest answer in a
    chat (the "Related" list). Free: no credits are used."""

    user = require_user(authorization)
    get_owned_conversation(payload.conversation_id, user["id"])

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT role, content FROM messages
            WHERE conversation_id = ?
            ORDER BY id DESC LIMIT 2
            """,
            (payload.conversation_id,),
        ).fetchall()

    question = next((r["content"] for r in rows if r["role"] == "user"), "")
    answer = next((r["content"] for r in rows if r["role"] == "assistant"), "")
    if not question or not OPENROUTER_API_KEY:
        return {"questions": []}

    prompt = (
        "Suggest exactly 3 short follow-up questions a curious user might ask next, "
        "based on this exchange. Each under 12 words, in the same language as the "
        "question. Reply with only a JSON array of 3 strings.\n\n"
        f"Question: {question[:600]}\n\nAnswer: {answer[:1800]}"
    )

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "X-Title": "SYNAPSE",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1200,
                "reasoning": {"effort": "low", "exclude": True},
            },
            timeout=40,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"].get("content") or ""
        match = _re.search(r"\[[\s\S]*\]", text)
        items = json.loads(match.group(0)) if match else []
        questions = [
            " ".join(str(item).split())[:140]
            for item in items
            if isinstance(item, str) and item.strip()
        ][:3]
    except Exception:
        traceback.print_exc()
        questions = []

    return {"questions": questions}


@app.post("/api/chat/stop")
def stop_generation(
    payload: StopGenerationRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    with ACTIVE_GENERATIONS_LOCK:
        generation = ACTIVE_GENERATIONS.get(payload.request_id)

    if generation and generation.user_id == user["id"]:
        generation.stop_requested.set()
        return {"stopped": True}

    # The answer may be running on another server instance (Vercel):
    # record the request; that instance checks for it while writing.
    # It only matches answers that belong to this same user.
    with get_connection() as connection:
        # Clear out stop requests that never matched a running answer.
        connection.execute(
            "DELETE FROM chat_stops WHERE created_at < ?",
            ((datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),),
        )
        connection.execute(
            """
            INSERT INTO chat_stops (request_id, user_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT (request_id) DO NOTHING
            """,
            (payload.request_id, user["id"], utc_now()),
        )

    return {"stopped": False}


# ============================================================
# 14c. PLANS, CREDITS AND PAYMENTS (Razorpay, INR)
# Every answer costs credits. Free credits reset daily (midnight
# IST); paid plans get a monthly allowance. Prices are in paise.
# ============================================================

IST = timezone(timedelta(hours=5, minutes=30))
CREDIT_WINDOW_DAYS = 30
BILLING_DAYS = {"monthly": 30, "annual": 365}

PLANS = {
    "free": {
        "name": "Free",
        "credits": 110,
        "window": "day",
        "deep_research": False,
        "deep_cost": None,
        "max_files": 1,
        "prices": {},
        "features": [
            "110 credits every day",
            "Web research and Academic modes",
            "Live web sources with citations",
            "1 file or image per message",
            "Saved chat history",
        ],
        "description": "For trying SYNAPSE and light everyday research.",
    },
    "pro": {
        "name": "Pro",
        "credits": 600,
        "window": "month",
        "deep_research": True,
        "deep_cost": 3,
        "max_files": 5,
        "prices": {"monthly": 49900, "annual": 478800},
        "features": [
            "600 credits every month",
            "Deep research mode (3 credits)",
            "Extended thinking",
            "Up to 5 files or images per message",
            "Everything in Free",
        ],
        "description": "For students and professionals who research every day.",
    },
    "max": {
        "name": "Max",
        "credits": 1500,
        "window": "month",
        "deep_research": True,
        "deep_cost": 2,
        "max_files": 10,
        "prices": {"monthly": 129900, "annual": 1246800},
        "features": [
            "1,500 credits every month",
            "Deep research for only 2 credits",
            "Extended thinking",
            "Up to 10 files or images per message",
            "Everything in Pro",
        ],
        "description": "For heavy research, teams of one and power users.",
    },
}

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

# Auto-pay: Razorpay plan IDs. A plan/billing pair with an ID is sold as an
# auto-renewing subscription; without one it falls back to a one-time order.
RAZORPAY_PLAN_IDS = {
    (plan, billing): os.getenv(f"RAZORPAY_PLAN_{plan.upper()}_{billing.upper()}", "").strip()
    for plan in ("pro", "max")
    for billing in ("monthly", "annual")
}

# How many renewals a subscription allows before it ends (Razorpay needs a number).
SUBSCRIPTION_CYCLES = {"monthly": 60, "annual": 5}

# Statuses in which Razorpay will keep charging the customer.
RENEWING_STATUSES = ("authenticated", "active", "pending")


class CheckoutRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=20)
    billing: str = Field(min_length=1, max_length=20)


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str = Field(min_length=1, max_length=100)
    razorpay_signature: str = Field(min_length=1, max_length=200)
    # One of these two: a one-time order, or an auto-pay subscription.
    razorpay_order_id: Optional[str] = Field(default=None, max_length=100)
    razorpay_subscription_id: Optional[str] = Field(default=None, max_length=100)


def razorpay_call(method: str, path: str, payload: Optional[dict] = None):
    """Calls the Razorpay API; raises a friendly 502 if it fails."""

    try:
        response = requests.request(
            method,
            f"https://api.razorpay.com/v1{path}",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json=payload,
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Could not reach Razorpay. Please try again.") from exc

    if not response.ok:
        try:
            message = response.json().get("error", {}).get("description")
        except ValueError:
            message = None
        raise HTTPException(
            status_code=502,
            detail=f"Razorpay couldn't complete that{': ' + message if message else '.'}",
        )

    return response.json()


def renewing_subscription(user_id: int):
    """The user's auto-pay subscription that Razorpay is still charging, if any."""

    with get_connection() as connection:
        return connection.execute(
            f"""
            SELECT subscription_id, plan, billing, status,
                   cancel_at_period_end, current_end
            FROM razorpay_subscriptions
            WHERE user_id = ? AND status IN ({", ".join("?" for _ in RENEWING_STATUSES)})
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (user_id, *RENEWING_STATUSES),
        ).fetchone()


def unix_to_iso(value):
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).isoformat() if value else None
    except (TypeError, ValueError):
        return None


def record_subscription_charge(subscription_id: str, payment_id: str, amount: int, current_end=None):
    """Applies one paid auto-pay charge (the first or a renewal).

    Safe to call twice for the same payment (verify + webhook). Returns the
    user id, or None if the subscription is unknown.
    """

    now = datetime.now(timezone.utc)

    with get_connection() as connection:
        sub = connection.execute(
            "SELECT user_id, plan, billing FROM razorpay_subscriptions WHERE subscription_id = ?",
            (subscription_id,),
        ).fetchone()

        if not sub:
            return None

        # The payment id is unique, so a second call for the same charge does nothing.
        inserted = connection.execute(
            """
            INSERT INTO payments
            (order_id, user_id, plan, billing, amount, currency, status, payment_id, created_at, paid_at)
            VALUES (?, ?, ?, ?, ?, 'INR', 'paid', ?, ?, ?)
            ON CONFLICT (order_id) DO NOTHING
            """,
            (
                f"sub:{payment_id}",
                sub["user_id"],
                sub["plan"],
                sub["billing"],
                int(amount or PLANS[sub["plan"]]["prices"][sub["billing"]]),
                payment_id,
                now.isoformat(),
                now.isoformat(),
            ),
        ).rowcount

        # Access lasts until Razorpay's next charge date, plus a day of grace
        # so a renewal that arrives a little late doesn't interrupt anyone.
        period_end = parse_time(current_end) if current_end else now + timedelta(days=BILLING_DAYS[sub["billing"]])
        expires = period_end + timedelta(days=1)

        connection.execute(
            """
            UPDATE razorpay_subscriptions
            SET status = 'active', current_end = ?, updated_at = ?
            WHERE subscription_id = ?
            """,
            (period_end.isoformat(), now.isoformat(), subscription_id),
        )

        if inserted == 1:
            current = connection.execute(
                "SELECT plan, billing, started_at, expires_at FROM subscriptions WHERE user_id = ?",
                (sub["user_id"],),
            ).fetchone()
            renewal = (
                current
                and current["plan"] == sub["plan"]
                and current["billing"] == sub["billing"]
                and parse_time(current["expires_at"]) > now
            )
            # A renewal keeps the same start (credit months continue);
            # a new or changed plan starts fresh today.
            started = current["started_at"] if renewal else now.isoformat()
            new_expiry = max(parse_time(current["expires_at"]), expires) if renewal else expires

            connection.execute(
                """
                INSERT INTO subscriptions
                (user_id, plan, billing, started_at, expires_at, last_order_id, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id) DO UPDATE SET
                    plan = excluded.plan,
                    billing = excluded.billing,
                    started_at = excluded.started_at,
                    expires_at = excluded.expires_at,
                    last_order_id = excluded.last_order_id,
                    updated_at = excluded.updated_at
                """,
                (
                    sub["user_id"],
                    sub["plan"],
                    sub["billing"],
                    started,
                    new_expiry.isoformat(),
                    subscription_id,
                    now.isoformat(),
                ),
            )

        # Any older auto-pay (e.g. after switching Pro -> Max) must stop charging.
        older = connection.execute(
            f"""
            SELECT subscription_id FROM razorpay_subscriptions
            WHERE user_id = ? AND subscription_id <> ?
              AND status IN ({", ".join("?" for _ in RENEWING_STATUSES)})
            """,
            (sub["user_id"], subscription_id, *RENEWING_STATUSES),
        ).fetchall()

    for row in older:
        try:
            razorpay_call("POST", f"/subscriptions/{row['subscription_id']}/cancel", {"cancel_at_cycle_end": 0})
        except HTTPException:
            traceback.print_exc()
        set_subscription_status(row["subscription_id"], "cancelled")

    return sub["user_id"]


def set_subscription_status(subscription_id: str, status: str, current_end=None, cancel_at_period_end=None):
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE razorpay_subscriptions
            SET status = ?,
                current_end = COALESCE(CAST(? AS TEXT), current_end),
                cancel_at_period_end = COALESCE(CAST(? AS INTEGER), cancel_at_period_end),
                updated_at = ?
            WHERE subscription_id = ?
            """,
            (status, current_end, cancel_at_period_end, utc_now(), subscription_id),
        )


def parse_time(value: str):
    return datetime.fromisoformat(value)


def active_subscription(user_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT plan, billing, started_at, expires_at
            FROM subscriptions WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    if (
        row
        and row["plan"] in PLANS
        and parse_time(row["expires_at"]) > datetime.now(timezone.utc)
    ):
        return row

    return None


def credit_window(user_id: int):
    """Returns (plan_key, subscription_row, window_key, resets_at)."""

    now = datetime.now(timezone.utc)
    subscription = active_subscription(user_id)

    if not subscription:
        today = now.astimezone(IST).date()
        midnight = datetime(today.year, today.month, today.day, tzinfo=IST)
        return "free", None, f"free:{today.isoformat()}", midnight + timedelta(days=1)

    started = parse_time(subscription["started_at"])
    expires = parse_time(subscription["expires_at"])
    index = int((now - started).total_seconds() // (CREDIT_WINDOW_DAYS * 86400))
    resets = min(started + timedelta(days=CREDIT_WINDOW_DAYS * (index + 1)), expires)
    key = f"{subscription['plan']}:{subscription['started_at']}:{index}"
    return subscription["plan"], subscription, key, resets


def credits_used(user_id: int, window_key: str):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT used FROM credit_usage WHERE user_id = ? AND window_key = ?",
            (user_id, window_key),
        ).fetchone()
    return row["used"] if row else 0


def credit_cost(plan_key: str, mode: str):
    if mode.lower() in ("deep", "deep research"):
        return PLANS[plan_key]["deep_cost"]
    return 1


def billing_status(user_id: int):
    plan_key, subscription, window_key, resets_at = credit_window(user_id)
    plan = PLANS[plan_key]
    used = credits_used(user_id, window_key)

    autopay = renewing_subscription(user_id)

    return {
        "plan": plan_key,
        "plan_name": plan["name"],
        "billing": subscription["billing"] if subscription else None,
        "expires_at": subscription["expires_at"] if subscription else None,
        # Auto-pay details when the plan renews automatically.
        "autopay": (
            {
                "plan": autopay["plan"],
                "billing": autopay["billing"],
                "status": autopay["status"],
                "cancel_at_period_end": bool(autopay["cancel_at_period_end"]),
                "next_charge_at": autopay["current_end"],
            }
            if autopay
            else None
        ),
        "credits": {
            "used": used,
            "limit": plan["credits"],
            "remaining": max(plan["credits"] - used, 0),
            "window": plan["window"],
            "resets_at": resets_at.isoformat(),
        },
        "costs": {
            "web": 1,
            "academic": 1,
            "deep": plan["deep_cost"],
        },
        "deep_research": plan["deep_research"],
        "max_files": plan["max_files"],
    }


def billing_error(status_code: int, code: str, message: str, **extra):
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, **extra},
    )


def charge_credits(user_id: int, mode: str, file_count: int):
    """Checks the plan's rules and takes the credits for one answer.

    Returns (window_key, cost) so the credits can be refunded if no
    answer is produced. Raises 402/403 with an upgrade hint otherwise.
    """

    plan_key, _, window_key, resets_at = credit_window(user_id)
    plan = PLANS[plan_key]
    cost = credit_cost(plan_key, mode)

    if cost is None:
        raise billing_error(
            403,
            "upgrade_required",
            "Deep research and extended thinking are part of Pro and Max. "
            "Upgrade to use them.",
        )

    if file_count > plan["max_files"]:
        raise billing_error(
            403,
            "too_many_files",
            f"Your {plan['name']} plan allows {plan['max_files']} "
            f"file{'s' if plan['max_files'] != 1 else ''} per message. "
            "Upgrade to attach more.",
        )

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO credit_usage (user_id, window_key, used)
            VALUES (?, ?, 0)
            ON CONFLICT (user_id, window_key) DO NOTHING
            """,
            (user_id, window_key),
        )
        # Only succeeds if the credits are still there (safe even when
        # two answers are requested at the same moment).
        result = connection.execute(
            """
            UPDATE credit_usage SET used = used + ?
            WHERE user_id = ? AND window_key = ? AND used + ? <= ?
            """,
            (cost, user_id, window_key, cost, plan["credits"]),
        )

    if result.rowcount != 1:
        when = resets_at.astimezone(IST)
        reset_text = (
            when.strftime("%I:%M %p IST").lstrip("0")
            if plan["window"] == "day"
            else when.strftime("%d %b %Y").lstrip("0")
        )
        raise billing_error(
            402,
            "out_of_credits",
            f"You've used your {plan['credits']} {plan['name']} credits"
            f"{' for today' if plan['window'] == 'day' else ' for this month'}. "
            f"They reset {reset_text}. Upgrade for more.",
            resets_at=resets_at.isoformat(),
        )

    return window_key, cost


def refund_credits(user_id: int, window_key: str, cost: int):
    try:
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE credit_usage
                SET used = CASE WHEN used >= ? THEN used - ? ELSE 0 END
                WHERE user_id = ? AND window_key = ?
                """,
                (cost, cost, user_id, window_key),
            )
    except Exception:
        traceback.print_exc()


def activate_payment(order_id: str, payment_id: str):
    """Marks an order paid and starts the plan. Safe to call twice."""

    now = datetime.now(timezone.utc)

    with get_connection() as connection:
        updated = connection.execute(
            """
            UPDATE payments SET status = 'paid', payment_id = ?, paid_at = ?
            WHERE order_id = ? AND status = 'created'
            """,
            (payment_id, now.isoformat(), order_id),
        )

        payment = connection.execute(
            "SELECT user_id, plan, billing, status FROM payments WHERE order_id = ?",
            (order_id,),
        ).fetchone()

        if not payment:
            return None

        if updated.rowcount == 1:
            expires = now + timedelta(days=BILLING_DAYS[payment["billing"]])
            connection.execute(
                """
                INSERT INTO subscriptions
                (user_id, plan, billing, started_at, expires_at,
                 last_order_id, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id) DO UPDATE SET
                    plan = excluded.plan,
                    billing = excluded.billing,
                    started_at = excluded.started_at,
                    expires_at = excluded.expires_at,
                    last_order_id = excluded.last_order_id,
                    updated_at = excluded.updated_at
                """,
                (
                    payment["user_id"],
                    payment["plan"],
                    payment["billing"],
                    now.isoformat(),
                    expires.isoformat(),
                    order_id,
                    now.isoformat(),
                ),
            )

    return payment["user_id"]


@app.get("/api/billing/plans")
def list_plans():
    return {
        "currency": "INR",
        "payments_enabled": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET),
        "autopay": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and all(RAZORPAY_PLAN_IDS.values())),
        "annual_discount_percent": 20,
        "plans": [
            {
                "id": key,
                "name": plan["name"],
                "credits": plan["credits"],
                "window": plan["window"],
                "deep_cost": plan["deep_cost"],
                "max_files": plan["max_files"],
                "monthly_price": plan["prices"].get("monthly", 0) // 100,
                "annual_price": plan["prices"].get("annual", 0) // 100,
                "features": plan["features"],
                "description": plan["description"],
            }
            for key, plan in PLANS.items()
        ],
    }


@app.get("/api/billing/status")
def get_billing_status(
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    return billing_status(user["id"])


@app.post("/api/billing/checkout")
def create_checkout(
    payload: CheckoutRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    plan_key = payload.plan.lower()
    billing = payload.billing.lower()

    if plan_key not in PLANS or billing not in PLANS[plan_key]["prices"]:
        raise HTTPException(status_code=400, detail="Please choose Pro or Max, monthly or annual.")

    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(
            status_code=503,
            detail="Payments are not set up yet. Add the Razorpay keys to the backend settings.",
        )

    amount = PLANS[plan_key]["prices"][billing]
    description = f"SYNAPSE {PLANS[plan_key]['name']} · {billing.capitalize()}"
    # Where the full-page (mobile) checkout returns to after paying.
    callback_url = str(request.url_for("razorpay_callback"))
    if callback_url.startswith("http://") and ON_VERCEL:
        callback_url = "https://" + callback_url[len("http://"):]
    site = (request.headers.get("origin") or "").rstrip("/")
    if site in ALLOWED_ORIGINS:
        callback_url += "?back=" + requests.utils.quote(site, safe="")
    plan_id = RAZORPAY_PLAN_IDS.get((plan_key, billing))

    # ---- Auto-pay: an auto-renewing Razorpay subscription ------------------
    if plan_id:
        current = renewing_subscription(user["id"])
        if (
            current
            and current["plan"] == plan_key
            and current["billing"] == billing
            and current["status"] == "active"
            and not current["cancel_at_period_end"]
        ):
            raise HTTPException(
                status_code=400,
                detail=f"You're already subscribed to {PLANS[plan_key]['name']} ({billing}). It renews automatically.",
            )

        subscription = razorpay_call(
            "POST",
            "/subscriptions",
            {
                "plan_id": plan_id,
                "total_count": SUBSCRIPTION_CYCLES[billing],
                "quantity": 1,
                "customer_notify": 1,
                "notes": {"user_id": str(user["id"]), "plan": plan_key, "billing": billing},
            },
        )

        now = utc_now()
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO razorpay_subscriptions
                (subscription_id, user_id, plan, billing, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'created', ?, ?)
                """,
                (subscription["id"], user["id"], plan_key, billing, now, now),
            )

        return {
            "mode": "subscription",
            "callback_url": callback_url,
            "key_id": RAZORPAY_KEY_ID,
            "subscription_id": subscription["id"],
            "amount": amount,
            "currency": "INR",
            "plan": plan_key,
            "billing": billing,
            "description": f"{description} · renews automatically",
            "prefill": {"name": user["name"], "email": user["email"]},
        }

    # ---- One-time payment for 30 / 365 days ---------------------------------
    try:
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={
                "amount": amount,
                "currency": "INR",
                "receipt": f"syn-{user['id']}-{int(time.time())}",
                "notes": {"user_id": str(user["id"]), "plan": plan_key, "billing": billing},
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Could not reach Razorpay. Please try again.") from exc

    if not response.ok:
        try:
            message = response.json().get("error", {}).get("description")
        except ValueError:
            message = None
        raise HTTPException(
            status_code=502,
            detail=f"Razorpay could not start the payment{': ' + message if message else '.'}",
        )

    order = response.json()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO payments
            (order_id, user_id, plan, billing, amount, currency, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'INR', 'created', ?)
            """,
            (order["id"], user["id"], plan_key, billing, amount, utc_now()),
        )

    return {
        "mode": "order",
        "callback_url": callback_url,
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount,
        "currency": "INR",
        "plan": plan_key,
        "billing": billing,
        "description": description,
        "prefill": {"name": user["name"], "email": user["email"]},
    }


@app.post("/api/billing/verify")
def verify_payment(
    payload: VerifyPaymentRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    # ---- Auto-pay subscription: the first payment ---------------------------
    if payload.razorpay_subscription_id:
        with get_connection() as connection:
            sub = connection.execute(
                "SELECT subscription_id FROM razorpay_subscriptions WHERE subscription_id = ? AND user_id = ?",
                (payload.razorpay_subscription_id, user["id"]),
            ).fetchone()

        if not sub or not RAZORPAY_KEY_SECRET:
            raise HTTPException(status_code=404, detail="Subscription not found.")

        # Razorpay signs "payment_id|subscription_id" with our secret.
        expected = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            f"{payload.razorpay_payment_id}|{sub['subscription_id']}".encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, payload.razorpay_signature):
            raise HTTPException(status_code=400, detail="Payment could not be verified.")

        # Ask Razorpay for the next charge date and the amount actually paid.
        current_end, amount = None, None
        try:
            details = razorpay_call("GET", f"/subscriptions/{sub['subscription_id']}")
            current_end = unix_to_iso(details.get("current_end"))
            payment = razorpay_call("GET", f"/payments/{payload.razorpay_payment_id}")
            amount = payment.get("amount")
        except HTTPException:
            traceback.print_exc()

        record_subscription_charge(sub["subscription_id"], payload.razorpay_payment_id, amount, current_end)
        return billing_status(user["id"])

    # ---- One-time order ------------------------------------------------------
    if not payload.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment could not be verified.")

    with get_connection() as connection:
        payment = connection.execute(
            "SELECT order_id FROM payments WHERE order_id = ? AND user_id = ?",
            (payload.razorpay_order_id, user["id"]),
        ).fetchone()

    if not payment or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=404, detail="Payment not found.")

    # Signed with our secret: proves Razorpay really took this payment.
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{payment['order_id']}|{payload.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment could not be verified.")

    activate_payment(payment["order_id"], payload.razorpay_payment_id)
    return billing_status(user["id"])


def razorpay_signature_ok(message: str, signature: str):
    if not (RAZORPAY_KEY_SECRET and signature):
        return False
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@app.post("/api/billing/callback")
async def razorpay_callback(request: Request, back: str = ""):
    """Full-page checkout (used on phones and in the apps).

    Razorpay sends the browser here after paying, instead of calling a
    function in the page. We check the signature, activate the plan and
    send the user back to the pricing page with the result.
    """

    origin = back.strip().rstrip("/")
    site = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

    def back_to(result: str, message: str = ""):
        query = f"payment={result}"
        if message:
            query += "&message=" + requests.utils.quote(message[:200])
        return RedirectResponse(f"{site}/pricing?{query}", status_code=303)

    form = await request.form()
    payment_id = str(form.get("razorpay_payment_id") or "")
    signature = str(form.get("razorpay_signature") or "")
    subscription_id = str(form.get("razorpay_subscription_id") or "")
    order_id = str(form.get("razorpay_order_id") or "")

    if not payment_id:
        # Razorpay reports a failed or cancelled payment with error[...] fields.
        return back_to("failed", str(form.get("error[description]") or ""))

    try:
        if subscription_id:
            if not razorpay_signature_ok(f"{payment_id}|{subscription_id}", signature):
                return back_to("failed", "The payment could not be verified.")
            current_end, amount = None, None
            try:
                details = razorpay_call("GET", f"/subscriptions/{subscription_id}")
                current_end = unix_to_iso(details.get("current_end"))
                amount = razorpay_call("GET", f"/payments/{payment_id}").get("amount")
            except HTTPException:
                traceback.print_exc()
            if not record_subscription_charge(subscription_id, payment_id, amount, current_end):
                return back_to("failed", "We couldn't find that subscription.")
        elif order_id:
            if not razorpay_signature_ok(f"{order_id}|{payment_id}", signature):
                return back_to("failed", "The payment could not be verified.")
            if not activate_payment(order_id, payment_id):
                return back_to("failed", "We couldn't find that payment.")
        else:
            return back_to("failed")
    except Exception:
        traceback.print_exc()
        # The webhook will still activate the plan if money was taken.
        return back_to("pending")

    return back_to("success")


@app.post("/api/billing/webhook")
async def razorpay_webhook(request: Request):
    """Backup path: Razorpay tells us about payments even if the browser
    closed before /verify was called."""

    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret is not configured.")

    body = await request.body()
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature.")

    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid body.")

    name = event.get("event", "")
    payload = event.get("payload", {})
    payment = payload.get("payment", {}).get("entity", {})
    subscription = payload.get("subscription", {}).get("entity", {})

    if name in ("payment.captured", "order.paid"):
        if payment.get("order_id") and payment.get("id"):
            activate_payment(payment["order_id"], payment["id"])

    elif name == "subscription.charged" and subscription.get("id") and payment.get("id"):
        # Every successful auto-pay charge, including monthly/yearly renewals.
        record_subscription_charge(
            subscription["id"],
            payment["id"],
            payment.get("amount"),
            unix_to_iso(subscription.get("current_end")),
        )

    elif name.startswith("subscription.") and subscription.get("id"):
        # authenticated / activated / pending / halted / cancelled / completed...
        # Access already paid for continues until it runs out.
        status = name.split(".", 1)[1]
        set_subscription_status(
            subscription["id"],
            subscription.get("status") or status,
            unix_to_iso(subscription.get("current_end")),
        )

    return {"ok": True}


@app.post("/api/billing/cancel")
def cancel_autopay(
    authorization: Optional[str] = Header(default=None),
):
    """Stops auto-pay. The plan stays active until the end of the paid period."""

    user = require_user(authorization)
    current = renewing_subscription(user["id"])

    if not current:
        raise HTTPException(status_code=404, detail="You don't have an auto-renewing plan.")

    if current["status"] == "active":
        # Razorpay stops at the end of the current period (no further charges).
        result = razorpay_call(
            "POST", f"/subscriptions/{current['subscription_id']}/cancel", {"cancel_at_cycle_end": 1}
        )
        set_subscription_status(
            current["subscription_id"],
            result.get("status") or "active",
            unix_to_iso(result.get("current_end")),
            1,
        )
    else:
        # Never paid (or still waiting for approval): cancel straight away.
        razorpay_call("POST", f"/subscriptions/{current['subscription_id']}/cancel", {"cancel_at_cycle_end": 0})
        set_subscription_status(current["subscription_id"], "cancelled")

    return billing_status(user["id"])


@app.get("/api/billing/payments")
def list_payments(
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT order_id, plan, billing, amount, currency, paid_at
            FROM payments
            WHERE user_id = ? AND status = 'paid'
            ORDER BY paid_at DESC
            LIMIT 20
            """,
            (user["id"],),
        ).fetchall()

    return {
        "payments": [
            {**dict(row), "amount": row["amount"] / 100}
            for row in rows
        ],
    }


# ============================================================
# 14d. SETTINGS, ACCOUNT AND DATA CONTROLS
# Personalization (like Claude / ChatGPT custom instructions), the
# display name, exporting or deleting chats, and deleting the account.
# ============================================================

RESPONSE_STYLES = {
    "default": "",
    "concise": "Keep answers short and to the point: lead with the answer, then only the most important details.",
    "detailed": "Give thorough, well-structured answers that cover background, nuances and examples.",
    "formal": "Use a formal, professional tone suited to reports and academic writing.",
    "friendly": "Use a warm, friendly and encouraging tone, explaining things simply.",
}

RESPONSE_LANGUAGES = [
    "auto", "English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam",
    "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Spanish",
    "French", "German", "Arabic", "Japanese", "Chinese",
]

DEFAULT_SETTINGS = {
    "personalization_enabled": True,
    "about_me": "",
    "instructions": "",
    "style": "default",
    "language": "auto",
    "default_mode": "web",
    "show_thinking": True,
}


class SettingsUpdate(BaseModel):
    personalization_enabled: Optional[bool] = None
    about_me: Optional[str] = Field(default=None, max_length=1500)
    instructions: Optional[str] = Field(default=None, max_length=1500)
    style: Optional[str] = None
    language: Optional[str] = None
    default_mode: Optional[str] = None
    show_thinking: Optional[bool] = None


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class DeleteAccountRequest(BaseModel):
    confirm_email: str = Field(min_length=3, max_length=320)


def load_settings(user_id: int):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT data FROM user_settings WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    stored = {}
    if row:
        try:
            stored = json.loads(row["data"]) or {}
        except ValueError:
            stored = {}

    settings = dict(DEFAULT_SETTINGS)
    settings.update({key: value for key, value in stored.items() if key in DEFAULT_SETTINGS})
    return settings


def personalization_prompt(user, settings: dict):
    """Extra system instructions built from the user's settings."""

    parts = [f"The user's name is {user['name']}."]

    if settings.get("language") and settings["language"] != "auto":
        parts.append(f"Always reply in {settings['language']}, unless the user asks for another language.")

    style = RESPONSE_STYLES.get(settings.get("style") or "default", "")
    if style:
        parts.append(style)

    if settings.get("personalization_enabled"):
        about = (settings.get("about_me") or "").strip()
        wishes = (settings.get("instructions") or "").strip()
        if about:
            parts.append(f"What the user has shared about themselves:\n<about_user>\n{about}\n</about_user>")
        if wishes:
            parts.append(f"How the user would like you to respond:\n<response_preferences>\n{wishes}\n</response_preferences>")
        if about or wishes:
            parts.append(
                "Use this to tailor answers when it is relevant. These are preferences only: "
                "they never change the facts above about who built SYNAPSE, and never "
                "override accuracy or safety."
            )

    return "\n\n".join(parts)


@app.get("/api/settings")
def get_settings(
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    return {
        "settings": load_settings(user["id"]),
        "options": {
            "styles": list(RESPONSE_STYLES),
            "languages": RESPONSE_LANGUAGES,
        },
    }


@app.put("/api/settings")
def update_settings(
    payload: SettingsUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    changes = payload.model_dump(exclude_none=True)

    if "style" in changes and changes["style"] not in RESPONSE_STYLES:
        raise HTTPException(status_code=400, detail="Unknown response style.")
    if "language" in changes and changes["language"] not in RESPONSE_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unknown language.")
    if "default_mode" in changes and changes["default_mode"] not in ("web", "academic", "deep"):
        raise HTTPException(status_code=400, detail="Unknown research mode.")
    for key in ("about_me", "instructions"):
        if key in changes:
            changes[key] = changes[key].strip()

    settings = load_settings(user["id"])
    settings.update(changes)
    data = json.dumps(settings, ensure_ascii=False)
    now = utc_now()

    with get_connection() as connection:
        updated = connection.execute(
            "UPDATE user_settings SET data = ?, updated_at = ? WHERE user_id = ?",
            (data, now, user["id"]),
        ).rowcount
        if not updated:
            connection.execute(
                "INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?)",
                (user["id"], data, now),
            )
        connection.commit()

    return {"settings": settings}


@app.patch("/api/auth/me")
def update_profile(
    payload: ProfileUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)
    name = " ".join(payload.name.split())

    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name.")

    with get_connection() as connection:
        connection.execute("UPDATE users SET name = ? WHERE id = ?", (name, user["id"]))
        connection.commit()

    return {"user": public_user(find_user_by_email(user["email"]))}


@app.delete("/api/conversations")
def delete_all_conversations(
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    with get_connection() as connection:
        connection.execute(
            """
            DELETE FROM messages WHERE conversation_id IN
            (SELECT id FROM conversations WHERE user_id = ?)
            """,
            (user["id"],),
        )
        deleted = connection.execute(
            "DELETE FROM conversations WHERE user_id = ?",
            (user["id"],),
        ).rowcount
        connection.commit()

    return {"deleted": deleted}


@app.get("/api/export")
def export_data(
    authorization: Optional[str] = Header(default=None),
):
    """Everything SYNAPSE stores about the user's chats, as one JSON file."""

    user = require_user(authorization)

    with get_connection() as connection:
        conversations = connection.execute(
            """
            SELECT id, title, created_at, updated_at FROM conversations
            WHERE user_id = ? ORDER BY created_at
            """,
            (user["id"],),
        ).fetchall()
        messages = connection.execute(
            """
            SELECT m.id, m.conversation_id, m.role, m.content, m.sources,
                   m.attachments, m.mode, m.thinking, m.created_at
            FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = ? ORDER BY m.id
            """,
            (user["id"],),
        ).fetchall()

    by_conversation = {}
    for row in messages:
        by_conversation.setdefault(row["conversation_id"], []).append(public_message(row))

    return {
        "exported_at": utc_now(),
        "account": {**public_user(user), "created_at": user["created_at"]},
        "settings": load_settings(user["id"]),
        "conversations": [
            {**dict(row), "messages": by_conversation.get(row["id"], [])}
            for row in conversations
        ],
    }


@app.delete("/api/auth/me")
def delete_account(
    payload: DeleteAccountRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = require_user(authorization)

    if payload.confirm_email.strip().lower() != user["email"].lower():
        raise HTTPException(status_code=400, detail="That email doesn't match your account.")

    user_id = user["id"]

    # Stop any auto-pay first so Razorpay never charges a deleted account.
    autopay = renewing_subscription(user_id)
    if autopay:
        try:
            razorpay_call("POST", f"/subscriptions/{autopay['subscription_id']}/cancel", {"cancel_at_cycle_end": 0})
        except HTTPException as exc:
            raise HTTPException(
                status_code=502,
                detail="We couldn't stop your auto-pay with Razorpay, so the account wasn't deleted. Please try again.",
            ) from exc

    with get_connection() as connection:
        connection.execute(
            """
            DELETE FROM messages WHERE conversation_id IN
            (SELECT id FROM conversations WHERE user_id = ?)
            """,
            (user_id,),
        )
        for table in ("conversations", "credit_usage", "subscriptions", "chat_stops", "user_settings", "razorpay_subscriptions"):
            connection.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        # Payment records are kept for accounting, unlinked from the deleted account.
        connection.execute("UPDATE payments SET user_id = 0 WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()

    return {"deleted": True}


# ============================================================
# 15. END OF SYNAPSE API
# ============================================================
