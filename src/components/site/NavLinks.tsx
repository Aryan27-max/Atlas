"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./SiteNav.module.css";

export type NavSection = { href: string; label: string };

/** Section links: a row on larger screens, a menu on phones. */
export function NavLinks({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.linksRoot}>
      <nav aria-label="Sections" className={styles.linksNav}>
        <ul className={styles.links}>
          {sections.map((s) => (
            <li key={s.href}>
              <a href={s.href} className={styles.link}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" className={styles.menuIcon} data-open={open}>
          <path className={styles.menuTop} d="M2 6.5h14" />
          <path className={styles.menuBottom} d="M2 11.5h14" />
        </svg>
      </button>

      <div id={panelId} className={styles.panel} data-open={open} hidden={!open}>
        <nav aria-label="Sections">
          <ul className={styles.panelList}>
            {sections.map((s) => (
              <li key={s.href}>
                <a href={s.href} className={styles.panelLink} onClick={() => setOpen(false)}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
