import Link from "next/link";

import { Cutoffs } from "@/components/landing/Cutoffs";
import { Details } from "@/components/landing/Details";
import { Evidence } from "@/components/landing/Evidence";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Overnight } from "@/components/landing/Overnight";
import { Privacy } from "@/components/landing/Privacy";
import { Requirements } from "@/components/landing/Requirements";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#cutoffs", label: "Cutoffs" },
  { href: "#privacy", label: "Privacy" },
  { href: "#requirements", label: "Requirements" },
];

export default function HomePage() {
  return (
    <>
      <SiteNav
        sections={SECTIONS}
        action={
          <Link href="/login" className="button button-small">
            Sign in
          </Link>
        }
      />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Cutoffs />
        <Evidence />
        <Privacy />
        <Overnight />
        <Details />
        <Requirements />
        <FinalCta />
      </main>
      <SiteFooter
        notes={
          <>
            <ol>
              <li id="fn-time">
                Time per resume depends on the computer. On a laptop without a suitable graphics chip, expect about 2 to 3
                minutes each. Atlas measures the real pace as it goes and updates its estimate.
              </li>
              <li id="fn-ollama">
                Ollama is a separate, free program. Atlas only uses an Ollama running on the same computer, and refuses
                any other address, whatever the settings say.
              </li>
            </ol>
            <p>Students shown on this page are fictional.</p>
          </>
        }
      />
    </>
  );
}
