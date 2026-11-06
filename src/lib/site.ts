// Site-wide settings you're likely to change. Nothing secret.

export const site = {
  name: "Atlas",
  title: "Atlas: private resume screening for campus hiring",
  description:
    "Atlas scores student resumes against your criteria with an AI model that runs on your own computer, then sorts them into Shortlisted, Cutoff and Rejected. No resume goes to an online AI service.",
  copyrightHolder: "Aryan Gupta",
  copyrightYear: 2026,
  ollamaDownloadUrl: "https://ollama.com/download",
};

/**
 * The site's public address, for absolute links in link previews (Open Graph).
 * Optional: on Vercel, Next.js uses the production URL by itself.
 */
export function siteUrl(): URL | undefined {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/**
 * Real screenshots, when you have them. Each visual on the landing page is a
 * drawn placeholder until you set its entry here. Put the files in
 * public/screenshots/ and give the path from the site root, for example:
 *
 *   results: { light: "/screenshots/results-light.png", dark: "/screenshots/results-dark.png", width: 2558, height: 1600 },
 *
 * `dark` is optional. width and height are the image's pixel size (they keep
 * the layout from jumping while it loads). Use fictional students only.
 */
export type Screenshot = { light: string; dark?: string; width: number; height: number };

export const screenshots: Record<"results" | "candidate" | "progress", Screenshot | null> = {
  results: null,
  candidate: null,
  progress: null,
};
