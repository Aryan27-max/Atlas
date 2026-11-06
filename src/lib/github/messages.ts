// What people see when a download can't start. Each message says what happened
// and what to do next. Owner-facing detail goes to the server log instead.

export const DOWNLOAD_ERROR_CODES = [
  "not-configured",
  "no-release",
  "asset-missing",
  "access-denied",
  "rate-limited",
  "unavailable",
] as const;

export type DownloadErrorCode = (typeof DOWNLOAD_ERROR_CODES)[number];

export function isDownloadErrorCode(value: unknown): value is DownloadErrorCode {
  return typeof value === "string" && (DOWNLOAD_ERROR_CODES as readonly string[]).includes(value);
}

export type DownloadMessage = { title: string; body: string };

export function downloadMessage(code: DownloadErrorCode, platformName?: string): DownloadMessage {
  switch (code) {
    case "not-configured":
      return {
        title: "Downloads aren’t set up yet.",
        body: "This site isn’t connected to the Atlas releases yet. Let the person who sent you the link know.",
      };
    case "no-release":
      return {
        title: "There’s no release to download yet.",
        body: "When a version of Atlas is published, it appears here. Check back later.",
      };
    case "asset-missing":
      return {
        title: platformName
          ? `The installer for ${platformName} isn’t in this release.`
          : "That installer isn’t in this release.",
        body: "Let the person who sent you the link know which one is missing.",
      };
    case "access-denied":
      return {
        title: "Downloads are unavailable right now.",
        body: "This site can’t reach the Atlas releases. Let the person who sent you the link know.",
      };
    case "rate-limited":
      return {
        title: "Too many downloads at once.",
        body: "Wait a few minutes, then try again.",
      };
    case "unavailable":
      return {
        title: "The download didn’t start.",
        body: "The release service didn’t respond. Wait a minute, then try again.",
      };
  }
}
