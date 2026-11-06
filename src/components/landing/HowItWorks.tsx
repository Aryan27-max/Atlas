import styles from "./landing.module.css";

const STEPS = [
  {
    title: "Bring your student list.",
    body: "Choose the Google Forms export, as Excel or CSV. Atlas checks it first and lists anything to fix, like missing links or duplicate RA numbers, before anything is saved.",
  },
  {
    title: "Say who you’re looking for.",
    body: "Describe the role in plain words, choose a model, and set your score lines. The first time you use a model, Atlas tests it on a sample resume.",
  },
  {
    title: "Let Atlas read.",
    body: "Atlas downloads each resume from its link, reads it and scores it, all on your computer. You see a time estimate before it starts.",
  },
  {
    title: "Review and export.",
    body: "Open anyone to see why they scored as they did, move people between groups, then export a CSV that opens cleanly in Excel.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className={`${styles.section} ${styles.mist}`} aria-labelledby="how-title">
      <div className="container">
        <div className={styles.head}>
          <h2 id="how-title" className="type-headline">
            From a spreadsheet to a shortlist.
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
