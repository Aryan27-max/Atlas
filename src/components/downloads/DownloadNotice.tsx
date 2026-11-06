import type { DownloadMessage } from "@/lib/github/messages";

import styles from "./downloads.module.css";

/** A calm notice above the cards: what happened, and what to do next. */
export function DownloadNotice({ message }: { message: DownloadMessage }) {
  return (
    <div className={styles.notice} role="alert">
      <svg viewBox="0 0 24 24" className={styles.noticeIcon} aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1.1" fill="currentColor" />
      </svg>
      <div>
        <p className={styles.noticeTitle}>{message.title}</p>
        <p className={styles.noticeBody}>{message.body}</p>
      </div>
    </div>
  );
}
