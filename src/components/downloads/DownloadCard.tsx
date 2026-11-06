import type { PlatformAsset } from "@/lib/github/client";
import { formatBytes } from "@/lib/format";
import type { Platform } from "@/lib/platforms";

import styles from "./downloads.module.css";
import { ThisComputerBadge } from "./ThisComputer";

type Props = {
  platform: Platform;
  /** The matching file in the latest release; null when it isn't there. */
  asset: PlatformAsset | null;
  /** False when the release itself couldn't be read (the page explains why). */
  releaseAvailable: boolean;
};

export function DownloadCard({ platform, asset, releaseAvailable }: Props) {
  const titleId = `card-${platform.id}`;
  const fileId = `file-${platform.id}`;
  const canDownload = releaseAvailable && asset !== null;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <PlatformIcon kind={platform.icon} />
      <ThisComputerBadge platform={platform.id} />
      <h2 id={titleId} className={styles.cardTitle}>
        {platform.name}
      </h2>
      <p className={styles.cardDetail}>{platform.detail}</p>

      <div className={styles.cardAction}>
        {canDownload ? (
          <a
            href={`/api/download/${platform.id}`}
            className="button"
            rel="nofollow"
            aria-describedby={fileId}
          >
            {platform.action}
          </a>
        ) : (
          <button type="button" className="button" disabled aria-describedby={fileId}>
            {platform.action}
          </button>
        )}
      </div>

      <p id={fileId} className={styles.file}>
        {canDownload && asset ? (
          <>
            <span className={styles.fileName}>{asset.name}</span>
            <span>
              {formatBytes(asset.size)}, {platform.arch}
            </span>
          </>
        ) : releaseAvailable ? (
          <span>Not in this release yet.</span>
        ) : (
          <span>Not available right now.</span>
        )}
      </p>

      {canDownload && asset?.digest ? (
        <details className={styles.checksum}>
          <summary>SHA-256 checksum</summary>
          <code>{asset.digest}</code>
        </details>
      ) : null}
    </article>
  );
}

function PlatformIcon({ kind }: { kind: Platform["icon"] }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="64"
      height="64"
      className={styles.icon}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "laptop" ? (
        <>
          <rect x="12" y="14" width="40" height="27" rx="3" />
          <path d="M4 47h56a0 0 0 0 1 0 0 3 3 0 0 1-3 3H7a3 3 0 0 1-3-3 0 0 0 0 1 0 0Z" />
          <path d="M28 47h8" />
        </>
      ) : (
        <>
          <rect x="6" y="10" width="52" height="34" rx="3" />
          <path d="M26 44v8M38 44v8M22 52h20" />
        </>
      )}
    </svg>
  );
}
