import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DownloadCard } from "@/components/downloads/DownloadCard";
import { DownloadNotice } from "@/components/downloads/DownloadNotice";
import styles from "@/components/downloads/downloads.module.css";
import { MobileNote } from "@/components/downloads/ThisComputer";
import { LogoMark } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { downloadMessage, isDownloadErrorCode, type DownloadMessage } from "@/lib/github/messages";
import { getReleaseSummary } from "@/lib/github/releases";
import { PLATFORM_IDS, PLATFORMS, isPlatformId } from "@/lib/platforms";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Download",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DownloadsPage({ searchParams }: Props) {
  if (!(await getSession())) redirect("/login?next=/downloads");

  const params = await searchParams;
  const release = await getReleaseSummary();

  // A download that didn't start sends the visitor back here with ?error=…
  const notices: DownloadMessage[] = [];
  if (isDownloadErrorCode(params.error)) {
    const platformName = isPlatformId(params.platform) ? PLATFORMS[params.platform].name : undefined;
    notices.push(downloadMessage(params.error, platformName));
  }
  if (!release.ok) {
    const pageMessage = downloadMessage(release.code);
    if (!notices.some((n) => n.title === pageMessage.title)) notices.push(pageMessage);
  }

  const releasedOn = release.ok ? formatDate(release.value.publishedAt) : null;

  return (
    <>
      <SiteNav
        action={
          <form action={logout}>
            <button type="submit" className={styles.signOut}>
              Sign out
            </button>
          </form>
        }
      />
      <main id="main" className={styles.main}>
        <div className="container">
          <header className={styles.header}>
            <div className={styles.headerMark}>
              <LogoMark size={64} glow />
            </div>
            <h1 className="type-headline">Download Atlas</h1>
            {release.ok ? (
              <p className={`type-intro ${styles.release}`}>
                Version {release.value.version}
                {releasedOn ? `, released ${releasedOn}` : ""}.
              </p>
            ) : (
              <p className={`type-intro ${styles.release}`}>Choose the version for your computer.</p>
            )}
          </header>

          {notices.length > 0 ? (
            <div className={styles.notices}>
              {notices.map((n) => (
                <DownloadNotice key={n.title} message={n} />
              ))}
            </div>
          ) : null}

          <MobileNote />

          <div className={styles.cards}>
            {PLATFORM_IDS.map((id) => (
              <DownloadCard
                key={id}
                platform={PLATFORMS[id]}
                asset={release.ok ? release.value.assets[id] : null}
                releaseAvailable={release.ok}
              />
            ))}
          </div>

          <p className={`type-body ${styles.ollama}`}>
            Atlas also needs Ollama, a free app that runs the AI model on your computer.{" "}
            <a href={site.ollamaDownloadUrl} rel="noopener noreferrer" target="_blank">
              Get Ollama
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>

          <section className={styles.notes} aria-labelledby="notes-title">
            <h2 id="notes-title" className={styles.notesTitle}>
              Before you open Atlas
            </h2>
            <div className={styles.noteGrid}>
              <div>
                <h3>Not sure which Mac you have?</h3>
                <p className="type-body">
                  Open the Apple menu and choose About This Mac. If Chip says Apple M1 or later, choose Apple silicon. If
                  it says Intel, choose Intel.
                </p>
              </div>
              <div>
                <h3>Opening it on a Mac</h3>
                <p className="type-body">
                  The first time, macOS says it can’t verify Atlas. Click Done, open System Settings, then Privacy &amp;
                  Security, scroll down and click Open Anyway. You only do this once.
                </p>
              </div>
              <div>
                <h3>Installing on Windows</h3>
                <p className="type-body">
                  If you see “Windows protected your PC”, click More info, then Run anyway. Atlas installs into your own
                  user folder, so you don’t need an administrator password.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
