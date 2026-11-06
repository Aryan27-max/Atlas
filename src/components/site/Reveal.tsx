"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Milliseconds to wait after the element comes into view. */
  delay?: number;
};

/**
 * Eases a large visual into place the first time it scrolls into view.
 *
 * Server-rendered HTML is always fully visible. Only after hydration, and only
 * for elements that are still below the fold, does this hide the element and
 * wait for it to scroll in. Without JavaScript, or with reduced motion, nothing
 * is ever hidden.
 */
export function Reveal({ children, className, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    // Below the fold: hide now (the user can't see it), reveal on arrival.
    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal={state === "idle" ? undefined : state}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
