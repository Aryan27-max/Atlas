// Which header holds the visitor's real address. Pure, so it can be tested.
//
// On Vercel (VERCEL=1), x-vercel-forwarded-for and x-forwarded-for are built by
// Vercel from the connection, and a value a client sends is discarded
// (vercel.com/docs/headers/request-headers). x-real-ip is not documented as
// protected, so it's only a last resort.
//
// Elsewhere, the reverse proxy in front must overwrite X-Forwarded-For with
// the connecting address (nginx: proxy_set_header X-Forwarded-For $remote_addr;).
// Without such a proxy every one of these headers is client-controlled, and
// only the site-wide sign-in limit still holds.

export function addressFromHeaders(h: Pick<Headers, "get">, onVercel: boolean): string {
  const order = onVercel ? ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] : ["x-forwarded-for", "x-real-ip"];
  for (const name of order) {
    const first = h.get(name)?.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "unknown";
}
