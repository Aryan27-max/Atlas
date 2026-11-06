// The three installers Atlas ships. Safe to import anywhere, including the
// browser: nothing here is secret. The real asset patterns are read from the
// environment on the server (lib/github/config.ts); these are the defaults.

export const PLATFORM_IDS = ["mac-arm64", "mac-x64", "win-x64"] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export type Platform = {
  id: PlatformId;
  /** Card title. */
  name: string;
  /** Who it's for, in plain words. */
  detail: string;
  /** The architecture, for people who know what that means. */
  arch: string;
  /** Button text. */
  action: string;
  icon: "laptop" | "desktop";
  envKey: "ASSET_PATTERN_MAC_ARM64" | "ASSET_PATTERN_MAC_X64" | "ASSET_PATTERN_WIN_X64";
  /** Matches the artifactName in the main repository's app/electron-builder.yml. */
  defaultPattern: string;
};

export const PLATFORMS: Record<PlatformId, Platform> = {
  "mac-arm64": {
    id: "mac-arm64",
    name: "Mac with Apple silicon",
    detail: "For Macs with an M1 chip or later.",
    arch: "arm64",
    action: "Download for Mac",
    icon: "laptop",
    envKey: "ASSET_PATTERN_MAC_ARM64",
    defaultPattern: "Atlas-*-arm64.dmg",
  },
  "mac-x64": {
    id: "mac-x64",
    name: "Mac with Intel",
    detail: "For Macs with an Intel processor.",
    arch: "x64",
    action: "Download for Mac",
    icon: "laptop",
    envKey: "ASSET_PATTERN_MAC_X64",
    defaultPattern: "Atlas-*-x64.dmg",
  },
  "win-x64": {
    id: "win-x64",
    name: "Windows 10 and 11",
    detail: "For 64-bit Windows PCs.",
    arch: "x64",
    action: "Download for Windows",
    icon: "desktop",
    envKey: "ASSET_PATTERN_WIN_X64",
    defaultPattern: "Atlas-Setup-*-x64.exe",
  },
};

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value);
}
