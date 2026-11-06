import { ProgressMockup } from "@/components/mockups/ProgressMockup";
import { Visual } from "@/components/mockups/Visual";
import { Reveal } from "@/components/site/Reveal";
import { screenshots } from "@/lib/site";

import styles from "./landing.module.css";

export function Overnight() {
  return (
    <section id="overnight" className={styles.section} aria-labelledby="overnight-title">
      <div className={`container ${styles.split} ${styles.splitReverse}`}>
        <div className={styles.copy}>
          <h2 id="overnight-title" className={styles.splitTitle}>
            Leave it running overnight.
          </h2>
          <p className="type-body">
            If the Wi-Fi drops or Ollama stops, Atlas pauses, and carries on by itself when it’s back. If the computer
            restarts, Atlas picks up exactly where it stopped.
          </p>
          <p className="type-body">
            No student is lost, and none is screened twice. Atlas shows a time estimate before you start, and asks first
            if a list will take more than four hours.
            <span className={styles.fn}>
              <a href="#fn-time" aria-label="Footnote 1">
                1
              </a>
            </span>
          </p>
        </div>
        <Reveal>
          <Visual
            shot={screenshots.progress}
            alt="A screening in progress in Atlas, paused because the internet connection dropped."
          >
            <ProgressMockup />
          </Visual>
        </Reveal>
      </div>
    </section>
  );
}
