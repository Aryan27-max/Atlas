// Where to go after signing in. Only paths on this site are allowed, so a
// crafted link like /login?next=https://evil.example can't send someone away.

export const DEFAULT_AFTER_LOGIN = "/downloads";

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return DEFAULT_AFTER_LOGIN;
  // Must be a path on this origin: starts with one slash, not "//" or "/\".
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  // No control characters or backslashes anywhere (browsers treat "\" like "/").
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return DEFAULT_AFTER_LOGIN;
  // Never bounce back to the sign-in page or into the API.
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/api/")) return DEFAULT_AFTER_LOGIN;
  return value;
}
