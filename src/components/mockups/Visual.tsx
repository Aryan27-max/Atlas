import type { ReactNode } from "react";

import type { Screenshot } from "@/lib/site";

import styles from "./mockups.module.css";

type Props = {
  /** A real screenshot from lib/site.ts → screenshots, or null for the drawn placeholder. */
  shot: Screenshot | null;
  /** Describes the screenshot for people who can't see it. */
  alt: string;
  /** The drawn placeholder. */
  children: ReactNode;
};

/** Shows a real screenshot when one is configured, otherwise the drawn mockup. */
export function Visual({ shot, alt, children }: Props) {
  if (!shot) return <>{children}</>;
  return (
    <picture>
      {shot.dark ? <source srcSet={shot.dark} media="(prefers-color-scheme: dark)" /> : null}
      <img
        src={shot.light}
        alt={alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        decoding="async"
        className={styles.shot}
      />
    </picture>
  );
}
