
from __future__ import annotations

import asyncio
import base64
import json
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
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


def initialize_database():
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
            import fitz

            with fitz.open(
                stream=data,
                filetype="pdf",
            ) as pdf:
                pages = [
                    page.get_text("text")
                    for page in pdf
                ]

            return "\n\n".join(pages)[:100000]

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
    "SYNAPSE was built by Revoori Ashwath Reddy. Whenever someone asks "
    "who built, made, created, developed or owns you (or SYNAPSE), or "
    "asks about your developer or creator, answer directly that you were "
    "built by Revoori Ashwath Reddy. Do not use web search results or "
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
):

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
):

    user_query = (query or prompt).strip()

    if not user_query:
        raise HTTPException(
            status_code=400,
            detail="Please enter a research question.",
        )

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

    document_text, image_inputs, attached_filenames = await read_uploads(
        files
    )

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

        try:
            emit(
                {
                    "type": "meta",
                    "conversation_id": conversation_id,
                    "title": title,
                    "request_id": request_id,
                }
            )

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
            )

            messages = [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
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
                emit({"type": "stopped"})
                return

            if not answer:
                raise ChatError("The AI returned an empty response.")

            message_id = save(answer)

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
# 15. END OF SYNAPSE API
# ============================================================
