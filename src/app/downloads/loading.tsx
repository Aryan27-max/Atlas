import styles from "@/components/downloads/downloads.module.css";
import { LogoMark } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { PLATFORM_IDS, PLATFORMS } from "@/lib/platforms";

// Shown while the downloads page looks up the latest release on GitHub.
// Same layout as the page, so nothing jumps when it arrives.

export default function DownloadsLoading() {
  return (
    <>
      <SiteNav />
      <main id="main" className={styles.main} aria-busy="true">
        <div className="container">
          <header className={styles.header}>
            <div className={styles.headerMark}>
              <LogoMark size={64} glow />
            </div>
            <h1 className="type-headline">Download Atlas</h1>
            <p className={`type-intro ${styles.release}`} role="status">
              Finding the latest version…
            </p>
          </header>

          <div className={styles.cards}>
            {PLATFORM_IDS.map((id) => (
              <article key={id} className={styles.card} aria-labelledby={`loading-${id}`}>
                <span className={styles.badgeSpace} aria-hidden="true" />
                <h2 id={`loading-${id}`} className={styles.cardTitle}>
                  {PLATFORMS[id].name}
                </h2>
                <p className={styles.cardDetail}>{PLATFORMS[id].detail}</p>
                <div className={styles.cardAction}>
                  <button type="button" className="button" disabled>
                    {PLATFORMS[id].action}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
