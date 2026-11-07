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
  | { type: "meta"; conversation_id: string; title: string; request_id: string; credits?: CreditInfo }
  | { type: "status"; stage: "searching" | "thinking"; query?: string }
  | { type: "sources"; sources: Source[]; error: string | null; enabled: boolean; query?: string }
  | { type: "thinking"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; message_id: number | null; conversation_id: string }
  | { type: "stopped" }
  | { type: "error"; message: string };

export type CreditInfo = {
  used: number;
  limit: number;
  remaining: number;
  window: "day" | "month";
  resets_at: string;
};

export type BillingStatus = {
  plan: "free" | "pro" | "max";
  plan_name: string;
  billing: "monthly" | "annual" | null;
  expires_at: string | null;
  credits: CreditInfo;
  costs: { web: number; academic: number; deep: number | null };
  deep_research: boolean;
  max_files: number;
};

export type PlanInfo = {
  id: "free" | "pro" | "max";
  name: string;
  credits: number;
  window: "day" | "month";
  deep_cost: number | null;
  max_files: number;
  monthly_price: number;
  annual_price: number;
  features: string[];
  description: string;
};

export type PlansResponse = {
  currency: "INR";
  payments_enabled: boolean;
  annual_discount_percent: number;
  plans: PlanInfo[];
};

export type ResponseStyle = "default" | "concise" | "detailed" | "formal" | "friendly";

export type UserSettings = {
  personalization_enabled: boolean;
  about_me: string;
  instructions: string;
  style: ResponseStyle;
  language: string;
  default_mode: "web" | "academic" | "deep";
  show_thinking: boolean;
};

export type SettingsResponse = {
  settings: UserSettings;
  options: { styles: ResponseStyle[]; languages: string[] };
};

export const DEFAULT_SETTINGS: UserSettings = {
  personalization_enabled: true,
  about_me: "",
  instructions: "",
  style: "default",
  language: "auto",
  default_mode: "web",
  show_thinking: true,
};

/** Billing error codes sent by the backend with 402/403 responses. */
export const UPGRADE_CODES = ["out_of_credits", "upgrade_required", "too_many_files"];

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True when the fix is a bigger plan (out of credits, Pro-only feature...). */
export function needsUpgrade(error: unknown) {
  return error instanceof ApiError && !!error.code && UPGRADE_CODES.includes(error.code);
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
  // Billing errors: { code, message }
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
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
  let code: string | undefined;
  try {
    const data = await response.json();
    message = detailToMessage(data?.detail) ?? message;
    if (data?.detail && typeof data.detail === "object" && "code" in data.detail) code = String(data.detail.code);
  } catch {
    /* not JSON */
  }
  return new ApiError(message, response.status, code);
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
