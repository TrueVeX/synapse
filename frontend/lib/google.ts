// "Continue with Google": opens Google's sign-in popup and returns an access
// token, which the backend checks with Google (POST /api/auth/google).

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleOAuth = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleOAuth;
  }
}

/** True inside the SYNAPSE Windows / Android apps (Google blocks sign-in in app windows). */
export function isInsideApp() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("SynapseApp");
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection."));
    document.head.appendChild(script);
  });
}

/** Opens Google's popup; resolves with an access token, rejects if cancelled. */
export async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in isn't set up yet. Please use email and password.");
  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || "Google sign-in was cancelled."));
      },
      error_callback: (error) => {
        reject(new Error(error.type === "popup_closed" ? "Google sign-in was cancelled." : "Google sign-in failed. Please try again."));
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
