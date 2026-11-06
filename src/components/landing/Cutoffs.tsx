import { Reveal } from "@/components/site/Reveal";

import { CutoffDemo } from "./CutoffDemo";
import styles from "./landing.module.css";

export function Cutoffs() {
  return (
    <section id="cutoffs" className={styles.section} aria-labelledby="cutoffs-title">
      <div className="container">
        <div className={styles.head}>
          <h2 id="cutoffs-title" className="type-headline">
            Move the line. Nobody is re‑scored.
          </h2>
          <p className={`type-intro ${styles.intro}`}>
            Each student is scored once. Drag the shortlist and cutoff lines and the groups redraw instantly. Ask for a
            minimum, and Atlas fills by rank, labels who was filled, and never splits a tie. Try it with 42 fictional
            students.
          </p>
        </div>
        <Reveal>
          <CutoffDemo />
        </Reveal>
      </div>
    </section>
  );
}
