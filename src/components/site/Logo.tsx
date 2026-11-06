import Image from "next/image";

import styles from "./Logo.module.css";

/**
 * The Atlas logo: the Swift logo supplied for this project
 * (Public_assets/swift-svgrepo-com.svg in the main repository), served from a
 * sanitised copy at public/brand/swift-logo.svg.
 *
 * Decorative wherever it appears next to the name "Atlas", so its alt text is
 * empty. Pass `label` where the mark stands alone and carries meaning.
 */
export function LogoMark({ size = 24, label, glow = false }: { size?: number; label?: string; glow?: boolean }) {
  return (
    <Image
      src="/brand/swift-logo.svg"
      alt={label ?? ""}
      width={size}
      height={size}
      unoptimized
      className={glow ? `${styles.mark} ${styles.glow}` : styles.mark}
    />
  );
}
