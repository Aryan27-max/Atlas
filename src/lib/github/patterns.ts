// Asset file-name patterns: * matches any run of characters, ? matches one.
// Matching ignores case and covers the whole name, so "Atlas-*-x64.dmg" never
// matches "Atlas-1.0.0-x64.dmg.blockmap".

export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else source += ch.replace(/[.+^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "i");
}

export type AssetMatch<T> = { match: T | null; ambiguous: boolean };

/** Finds the asset whose name matches. With several matches, picks the first by name and says so. */
export function findAsset<T extends { name: string }>(assets: readonly T[], pattern: string): AssetMatch<T> {
  const rx = globToRegExp(pattern);
  const matches = assets.filter((a) => rx.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  return { match: matches[0] ?? null, ambiguous: matches.length > 1 };
}
