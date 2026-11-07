/** The page to return to after signing in, from `?next=/somewhere`.
 *  Only same-site paths are allowed, so the link can't send people elsewhere. */
export function nextPath(fallback = "/") {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** Keeps `?next=` when moving between the sign-in and sign-up pages. */
export function withNext(path: string) {
  if (typeof window === "undefined") return path;
  const next = new URLSearchParams(window.location.search).get("next");
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
