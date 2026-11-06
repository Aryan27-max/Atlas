import { CandidateMockup } from "@/components/mockups/CandidateMockup";
import { Visual } from "@/components/mockups/Visual";
import { Reveal } from "@/components/site/Reveal";
import { screenshots } from "@/lib/site";

import styles from "./landing.module.css";

export function Evidence() {
  return (
    <section id="evidence" className={`${styles.section} ${styles.mist}`} aria-labelledby="evidence-title">
      <div className={`container ${styles.split}`}>
        <div className={styles.copy}>
          <h2 id="evidence-title" className={styles.splitTitle}>
            Every score shows its working.
          </h2>
          <p className="type-body">
            The model scores six parts of each resume against a fixed rubric. Atlas, not the model, combines them into
            one score and decides the group, and your cutoffs are never shown to the model.
          </p>
          <p className="type-body">
            Open any student to see the reasons, the quotes from the resume that back them up, and any skill claimed on
            the form that the resume doesn’t show.
          </p>
          <p className="type-body">
            Disagree? Move one student or several to another group, with a note. Every move is recorded, and yours always
            wins.
          </p>
        </div>
        <Reveal>
          <Visual
            shot={screenshots.candidate}
            alt="A student's detail in Atlas: the overall score, six part scores, the reasons, and quotes from the resume."
          >
            <CandidateMockup />
          </Visual>
        </Reveal>
      </div>
    </section>
  );
}
