import { site } from "@/lib/site";

import styles from "./landing.module.css";

export function Requirements() {
  return (
    <section id="requirements" className={styles.section} aria-labelledby="requirements-title">
      <div className="container">
        <div className={styles.head}>
          <h2 id="requirements-title" className="type-headline">
            What you need.
          </h2>
        </div>
        <dl className={styles.specs}>
          <div className={styles.spec}>
            <dt>Computer</dt>
            <dd>A Mac with Apple silicon or an Intel processor, or a PC with Windows 10 or 11 (64-bit).</dd>
          </div>
          <div className={styles.spec}>
            <dt>Memory</dt>
            <dd>16 GB recommended. The suggested model uses about 6 to 7 GB while it works.</dd>
          </div>
          <div className={styles.spec}>
            <dt>Storage</dt>
            <dd>About 10 GB free: about 5 GB for the model, under 1 GB for Atlas, and room for your screenings.</dd>
          </div>
          <div className={styles.spec}>
            <dt>AI model</dt>
            <dd>
              Ollama, free from{" "}
              <a href={site.ollamaDownloadUrl} rel="noopener noreferrer" target="_blank">
                ollama.com
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
              . Atlas can find and start it for you, and suggests a model to download once (about 5 GB).
            </dd>
          </div>
          <div className={styles.spec}>
            <dt>Internet</dt>
            <dd>To download the model once, and each resume during a screening.</dd>
          </div>
          <div className={styles.spec}>
            <dt>Student list</dt>
            <dd>An Excel (.xlsx) or CSV file, such as a Google Forms export, with a resume link for each student.</dd>
          </div>
          <div className={styles.spec}>
            <dt>Time</dt>
            <dd>
              About 2 to 3 minutes per resume on a laptop without a suitable graphics chip, so 200 students is an
              overnight job.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
