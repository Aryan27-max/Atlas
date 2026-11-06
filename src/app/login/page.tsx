import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { LogoMark } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSession } from "@/lib/auth/session";

import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);

  if (await getSession()) redirect(next);

  return (
    <>
      <SiteNav />
      <main id="main" className={styles.main}>
        <div className={styles.panel}>
          <LogoMark size={56} glow />
          <h1 className={styles.title}>Sign in to download Atlas</h1>
          <p className={styles.lead}>Use the username and password you were given.</p>
          <LoginForm next={next} />
          <p className={styles.help}>
            Don’t have them? Ask the person who sent you the link to this page.
          </p>
          <p className={styles.back}>
            <Link href="/">Back to the overview</Link>
          </p>
        </div>
      </main>
    </>
  );
}
