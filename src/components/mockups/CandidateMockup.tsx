import styles from "./mockups.module.css";

// A fictional student. The overall score is the weighted mean of the six
// parts, exactly as Atlas computes it: criteria fit 30%, technical 20%,
// projects 20%, experience 15%, achievements 10%, communication 5% → 87.6 → 88.
const PARTS = [
  { label: "Technical", value: 88 },
  { label: "Projects", value: 90 },
  { label: "Experience", value: 78 },
  { label: "Achievements", value: 84 },
  { label: "Communication", value: 86 },
  { label: "Criteria fit", value: 92 },
];

/** A student's detail sheet, drawn. */
export function CandidateMockup() {
  return (
    <div
      className={styles.frame}
      role="img"
      aria-label="A student's detail in Atlas: 88 out of 100, rank 2, with six part scores, the reasons for the score, a quote from the resume as evidence, and a skill claimed on the form that the resume doesn't show."
    >
      <div className={`${styles.window} ${styles.sheet}`} aria-hidden="true">
        <p className={styles.sheetName}>Ishaan Verma</p>
        <p className={styles.sheetMeta}>ECE, CGPA 8.70</p>

        <div className={styles.scoreBlock}>
          <div className={styles.overall}>
            <span className={styles.overallValue}>88</span>
            <span className={styles.overallOf}>out of 100</span>
            <span className={styles.overallRank}>Rank 2</span>
          </div>
          <ul className={styles.parts}>
            {PARTS.map((p) => (
              <li key={p.label} className={styles.part}>
                <span className={styles.partLabel}>{p.label}</span>
                <span className={styles.partTrack}>
                  <span className={styles.partFill} style={{ width: `${p.value}%` }} />
                </span>
                <span className={styles.partValue}>{p.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.tags}>
          <span className={styles.tagShort}>Shortlisted</span>
          <span className={styles.tagPlain}>By score</span>
        </p>

        <p className={styles.sheetHeading}>Why this score</p>
        <ul className={styles.bullets}>
          <li>Two embedded projects match the firmware focus in the criteria.</li>
          <li>An internship with a hardware team, with measured results.</li>
        </ul>

        <p className={styles.sheetHeading}>Evidence from the resume</p>
        <p className={styles.quoteLabel}>Relevant project</p>
        <p className={styles.quote}>“Designed a low-power sensor board and wrote its firmware in C”</p>

        <p className={styles.sheetHeading}>Listed in form but not found in resume</p>
        <ul className={styles.bullets}>
          <li>Claims Rust; not in the resume</li>
        </ul>
      </div>
    </div>
  );
}
