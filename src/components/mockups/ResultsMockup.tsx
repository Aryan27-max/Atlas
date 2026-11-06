import { Alert, Ban, ChevronLeft, CircleCheck, CircleHalf, CircleX, Download, Info, Sliders } from "./icons";
import styles from "./mockups.module.css";

// Fictional students only.
const ROWS = [
  { rank: 1, name: "Ananya Krishnan", dept: "CSE", cgpa: "9.10", score: 92 },
  { rank: 2, name: "Ishaan Verma", dept: "ECE", cgpa: "8.70", score: 89 },
  { rank: 3, name: "Tara Nair", dept: "CSE", cgpa: "9.40", score: 88 },
  { rank: 4, name: "Vivaan Joshi", dept: "IT", cgpa: "8.20", score: 85 },
  { rank: 5, name: "Sana Qureshi", dept: "CSE", cgpa: "8.90", score: 83 },
  { rank: 6, name: "Dev Malhotra", dept: "Mech", cgpa: "7.80", score: 81 },
  { rank: 7, name: "Nila Reddy", dept: "IT", cgpa: "8.50", score: 77 },
  { rank: 8, name: "Kabir Sethi", dept: "ECE", cgpa: "8.00", score: 74, filled: true },
  { rank: 9, name: "Riya Chatterjee", dept: "CSE", cgpa: "7.60", score: 73, filled: true },
];

const SIDEBAR = [
  { label: "Shortlisted", count: 9, Icon: CircleCheck, active: true },
  { label: "Cutoff", count: 12, Icon: CircleHalf },
  { label: "Rejected", count: 14, Icon: CircleX },
];

const NOT_SCORED = [
  { label: "Needs attention", count: 2, Icon: Alert },
  { label: "Filtered out", count: 1, Icon: Ban },
];

/** The Results screen, drawn. */
export function ResultsMockup() {
  return (
    <div
      className={styles.frame}
      role="img"
      aria-label="The Atlas results window: 9 students shortlisted, 12 in the cutoff band and 14 rejected, ranked by score. Two were shortlisted to reach the minimum and are labelled 'Filled to minimum'."
    >
      <div className={`${styles.window} ${styles.resultsWindow}`} aria-hidden="true">
        <aside className={styles.sidebar}>
          <div className={styles.lights}>
            <i />
            <i />
            <i />
          </div>
          <p className={styles.sideLabel}>Results</p>
          <ul className={styles.sideList}>
            {SIDEBAR.map(({ label, count, Icon, active }) => (
              <li key={label} className={styles.sideItem} data-active={active ? "true" : undefined}>
                <Icon className={styles.sideIcon} />
                <span>{label}</span>
                <span className={styles.sideCount}>{count}</span>
              </li>
            ))}
          </ul>
          <p className={styles.sideLabel}>Not scored</p>
          <ul className={styles.sideList}>
            {NOT_SCORED.map(({ label, count, Icon }) => (
              <li key={label} className={styles.sideItem}>
                <Icon className={styles.sideIcon} />
                <span>{label}</span>
                <span className={styles.sideCount}>{count}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className={styles.main}>
          <div className={styles.toolbar}>
            <span className={styles.back}>
              <ChevronLeft className={styles.backIcon} />
              Home
            </span>
            <span className={styles.toolbarTitle}>Screening 4 Nov</span>
            <span className={styles.toolbarSpacer} />
            <span className={styles.search}>Search name or RA</span>
            <span className={styles.toolButton}>
              <Sliders className={styles.toolIcon} />
              Adjust cutoffs
            </span>
            <span className={`${styles.toolButton} ${styles.toolPrimary}`}>
              <Download className={styles.toolIcon} />
              Export
            </span>
          </div>

          <div className={styles.content}>
            <p className={styles.banner}>
              <Info className={styles.bannerIcon} />2 candidates below 75 were shortlisted to reach the minimum.
            </p>
            <p className={styles.groupTitle}>Shortlisted</p>
            <div className={styles.table}>
              <div className={`${styles.row} ${styles.head}`}>
                <span>Rank</span>
                <span>Name</span>
                <span className={styles.colDept}>Department</span>
                <span className={styles.colCgpa}>CGPA</span>
                <span>Score</span>
                <span className={styles.colTag} />
              </div>
              {ROWS.map((r) => (
                <div key={r.rank} className={styles.row}>
                  <span className={styles.rank}>{r.rank}</span>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.colDept}>{r.dept}</span>
                  <span className={styles.colCgpa}>{r.cgpa}</span>
                  <span>
                    <span className={styles.score}>{r.score}</span>
                  </span>
                  <span className={styles.colTag}>{r.filled ? <span className={styles.filledTag}>Filled to minimum</span> : null}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
