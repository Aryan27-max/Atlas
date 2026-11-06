"use client";

import styles from "./status.module.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>This page didn’t load.</h1>
      <p className={styles.body}>Something went wrong on our side. Try again, and if it keeps happening, come back later.</p>
      <button type="button" className="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
