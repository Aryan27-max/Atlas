// Display formatting. British English, to match the app.

/** File sizes the way macOS Finder shows them (1 MB = 1,000,000 bytes). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, "")} ${units[unit]}`;
}

/** "6 November 2026". */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
