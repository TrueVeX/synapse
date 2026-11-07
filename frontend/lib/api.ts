// Shared client for the SYNAPSE FastAPI backend.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const TOKEN_KEY = "synapse_token";

export type User = { id: number; name: string; email: string };
export type Source = { title: string; url: string; content?: string };
export type Conversation = { id: string; title: string; created_at: string; updated_at: string };
export type StoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  attachments: string[];
  mode: string | null;
  thinking: string;
  created_at: string;
};

// Events sent by POST /api/chat/stream, one JSON object per line.
export type StreamEvent =
  | { type: "meta"; conversation_id: string; title: string; request_id: string }
  | { type: "status"; stage: "searching" | "thinking"; query?: string }
  | { type: "sources"; sources: Source[]; error: string | null; enabled: boolean; query?: string }
  | { type: "thinking"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; message_id: number | null; conversation_id: string }
  | { type: "stopped" }
  | { type: "error"; message: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** True when the backend says the saved login is missing, invalid or expired. */
export function isAuthError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  // FastAPI validation errors (422) arrive as a list of { msg } objects.
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
      .join(" ");
  }
  return null;
}

async function toApiError(response: Response) {
  let message = `Request failed (${response.status}).`;
  try {
    const data = await response.json();
    message = detailToMessage(data?.detail) ?? message;
  } catch {
    /* not JSON */
  }
  return new ApiError(message, response.status);
}

function networkError() {
  return new ApiError(`Can't reach the SYNAPSE backend at ${API_URL}. Is it running?`, 0);
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }

  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

/** Sends a chat message and calls onEvent for every streamed event. */
export async function streamChat(
  form: FormData,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/chat/stream`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw networkError();
  }

  if (!response.ok) throw await toApiError(response);
  if (!response.body) throw new ApiError("This browser cannot read streamed answers.", 0);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return; // ignore a malformed line rather than failing the whole answer
    }
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }

  flush(buffer + decoder.decode());
}
