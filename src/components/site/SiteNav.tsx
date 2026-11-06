import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "./Logo";
import { NavLinks, type NavSection } from "./NavLinks";
import styles from "./SiteNav.module.css";

type Props = {
  /** In-page links (landing page only). */
  sections?: NavSection[];
  /** The control on the right: "Sign in", "Sign out"… */
  action?: ReactNode;
  /** "dark" (default): a dark glass bar in both themes, matching the dark hero. "auto" follows the system. */
  tone?: "auto" | "dark";
};

export function SiteNav({ sections, action, tone = "dark" }: Props) {
  return (
    <header className={tone === "dark" ? `${styles.nav} ${styles.dark}` : styles.nav}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Atlas, home">
          <LogoMark size={22} />
          <span className={styles.brandName}>Atlas</span>
        </Link>
        <div className={styles.end}>
          {sections && sections.length > 0 ? <NavLinks sections={sections} /> : null}
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      </div>
    </header>
  );
}
