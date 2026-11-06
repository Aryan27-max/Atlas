import Link from "next/link";

import { SiteNav } from "@/components/site/SiteNav";

import styles from "./status.module.css";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main id="main" className={styles.main}>
        <h1 className={styles.title}>This page can’t be found.</h1>
        <p className={styles.body}>The link may be mistyped, or the page may have moved.</p>
        <Link href="/" className="button">
          Go to the overview
        </Link>
      </main>
    </>
  );
}
