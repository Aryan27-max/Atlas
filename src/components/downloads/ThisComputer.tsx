"use client";

import type { PlatformId } from "@/lib/platforms";

import { useDetection } from "./detect";
import styles from "./downloads.module.css";

/** "For this computer", on the card that matches the visitor's computer. */
export function ThisComputerBadge({ platform }: { platform: PlatformId }) {
  const detection = useDetection();
  if (detection?.platform !== platform) return <span className={styles.badgeSpace} aria-hidden="true" />;
  return <span className={styles.badge}>For this computer</span>;
}

/** A gentle note for phones and tablets, which can't run Atlas. */
export function MobileNote() {
  const detection = useDetection();
  if (!detection?.mobile) return null;
  return (
    <p className={styles.mobileNote}>
      Atlas runs on Mac and Windows computers. Open this page on the computer you’ll use it on.
    </p>
  );
}
