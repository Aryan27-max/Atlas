import Link from "next/link";
import type { ReactNode } from "react";

import { site } from "@/lib/site";

import styles from "./SiteFooter.module.css";

type Props = {
  /** Footnotes for the page above, Apple-style. */
  notes?: ReactNode;
};

export function SiteFooter({ notes }: Props) {
  return (
    <footer className={styles.footer}>
      <div className="container">
        {notes ? <div className={styles.notes}>{notes}</div> : null}
        <div className={styles.bottom}>
          <p className={styles.copyright}>
            Copyright © {site.copyrightYear} {site.copyrightHolder}. All rights reserved.
          </p>
          <nav aria-label="Footer">
            <ul className={styles.links}>
              <li>
                <Link href="/#privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/#requirements">Requirements</Link>
              </li>
              <li>
                <Link href="/downloads">Downloads</Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
