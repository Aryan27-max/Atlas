import styles from "./mockups.module.css";

/**
 * The same résumé twice: as the student wrote it, and as the model on the
 * recruiter's computer receives it, with identity removed and the form's
 * details added as claims to check.
 */
export function RedactionMockup() {
  return (
    <div
      className={styles.redaction}
      role="img"
      aria-label="Two copies of a résumé. In the copy the model sees, the photo, name and contact details are removed; the projects, experience and skills stay, along with CGPA, department and the skills the student claimed on the form, marked as claims to check."
    >
      <div className={styles.doc} aria-hidden="true">
        <p className={styles.docCaption}>The résumé</p>
        <div className={styles.docHeader}>
          <span className={styles.photo} />
          <span className={styles.idLines}>
            <span className={`${styles.bar} ${styles.barName}`} />
            <span className={`${styles.bar} ${styles.barContact}`} />
          </span>
        </div>
        <DocBody />
      </div>

      <div className={`${styles.doc} ${styles.docModel}`} aria-hidden="true">
        <p className={styles.docCaption}>What the model sees</p>
        <div className={styles.docHeader}>
          <span className={`${styles.photo} ${styles.removedPhoto}`} />
          <span className={styles.idLines}>
            <span className={styles.removed}>Name removed</span>
            <span className={styles.removed}>Contact details removed</span>
          </span>
        </div>
        <DocBody />
        <div className={styles.claims}>
          <span className={styles.claim}>CGPA 8.70</span>
          <span className={styles.claim}>ECE</span>
          <span className={styles.claim}>Claimed skills, to check</span>
        </div>
      </div>
    </div>
  );
}

function DocBody() {
  return (
    <div className={styles.docBody}>
      <span className={styles.docSection}>Projects</span>
      <span className={`${styles.bar} ${styles.w95}`} />
      <span className={`${styles.bar} ${styles.w80}`} />
      <span className={`${styles.bar} ${styles.w60}`} />
      <span className={styles.docSection}>Experience</span>
      <span className={`${styles.bar} ${styles.w90}`} />
      <span className={`${styles.bar} ${styles.w70}`} />
      <span className={styles.docSection}>Skills</span>
      <span className={styles.chips}>
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
