import { ChevronLeft, WifiOff } from "./icons";
import styles from "./mockups.module.css";

const DONE = 142;
const TOTAL = 200;

/** A long screening, paused overnight because the internet dropped. */
export function ProgressMockup() {
  const circumference = 2 * Math.PI * 52;
  return (
    <div
      className={styles.frame}
      role="img"
      aria-label="A screening in progress at 142 of 200 students, paused because there's no internet connection. It continues by itself when the connection is back."
    >
      <div className={`${styles.window} ${styles.progressWindow}`} aria-hidden="true">
        <div className={styles.toolbar}>
          <span className={styles.lights}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.back}>
            <ChevronLeft className={styles.backIcon} />
            Home
          </span>
          <span className={styles.toolbarTitle}>Screening 4 Nov</span>
          <span className={styles.toolbarSpacer} />
          <span className={styles.toolButton}>Resume</span>
        </div>

        <div className={styles.progressCard}>
          <div className={styles.ring}>
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className={styles.ringTrack} />
              <circle
                cx="60"
                cy="60"
                r="52"
                className={styles.ringValue}
                strokeDasharray={`${(DONE / TOTAL) * circumference} ${circumference}`}
              />
            </svg>
            <span className={styles.ringText}>
              <span className={styles.ringNumber}>{DONE}</span>
              <span className={styles.ringOf}>of {TOTAL} students</span>
            </span>
          </div>

          <div className={styles.progressBody}>
            <p className={styles.pausedPill}>
              <WifiOff className={styles.pausedIcon} />
              Paused
            </p>
            <p className={styles.progressTitle}>No internet connection</p>
            <p className={styles.progressSub}>Continues by itself when the connection is back.</p>
            <div className={styles.stats}>
              <span className={styles.stat}>
                <b>54</b>Waiting
              </span>
              <span className={styles.stat}>
                <b className={styles.statDone}>142</b>Done
              </span>
              <span className={styles.stat}>
                <b>4</b>Needs attention
              </span>
            </div>
          </div>
        </div>

        <ul className={styles.activity}>
          <li>
            <span>02:14</span>Paused: No internet connection
          </li>
          <li>
            <span>02:13</span>Scored résumé #142
          </li>
          <li>
            <span>22:01</span>Screening started
          </li>
        </ul>
      </div>
    </div>
  );
}
