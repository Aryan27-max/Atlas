"use client";

import { useEffect, useState } from "react";

import type { PlatformId } from "@/lib/platforms";

// Best-effort guess at the visitor's computer, used only to point at the right
// card. Never decisive: every card stays available, and when the guess is
// unsure (Safari and Firefox don't reveal a Mac's chip) nothing is marked.

/** mobile: a phone or tablet. other: a computer that isn't a Mac or a Windows PC (Linux, ChromeOS). */
export type Detection = { platform: PlatformId | null; mobile: boolean; other?: boolean };

type UAData = { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> };

let pending: Promise<Detection> | null = null;

function detect(): Promise<Detection> {
  const ua = navigator.userAgent;
  const iPadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod|Android/i.test(ua) || iPadAsMac) return Promise.resolve({ platform: null, mobile: true });
  if (/Windows NT/i.test(ua)) return Promise.resolve({ platform: "win-x64", mobile: false });
  if (/CrOS|Linux|X11/i.test(ua)) return Promise.resolve({ platform: null, mobile: false, other: true });

  if (/Macintosh|Mac OS X/.test(ua)) {
    const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
    if (data?.getHighEntropyValues) {
      return data
        .getHighEntropyValues(["architecture"])
        .then((v): Detection => ({
          platform: v.architecture === "arm" ? "mac-arm64" : v.architecture === "x86" ? "mac-x64" : null,
          mobile: false,
        }))
        .catch((): Detection => ({ platform: null, mobile: false }));
    }
  }
  return Promise.resolve({ platform: null, mobile: false });
}

export function useDetection(): Detection | null {
  const [detection, setDetection] = useState<Detection | null>(null);
  useEffect(() => {
    let alive = true;
    pending ??= detect();
    pending.then((d) => {
      if (alive) setDetection(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return detection;
}
