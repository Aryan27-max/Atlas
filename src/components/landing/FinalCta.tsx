import Link from "next/link";

import { LogoMark } from "@/components/site/Logo";

import styles from "./landing.module.css";

export function FinalCta() {
  return (
    <section className={`${styles.section} ${styles.mist} ${styles.final}`} aria-labelledby="final-title">
      <div className="container">
        <div className={styles.finalMark}>
          <LogoMark size={72} glow />
        </div>
        <h2 id="final-title" className="type-headline">
          Ready for your next campus drive.
        </h2>
        <p className={`type-intro ${styles.intro}`}>
          Sign in with the details you were given to download Atlas for Mac or Windows.
        </p>
        <div className={styles.finalActions}>
          <Link href="/login" className="button">
            Sign in to download
          </Link>
        </div>
      </div>
    </section>
  );
}
