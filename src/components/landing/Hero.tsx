import Image from "next/image";
import Link from "next/link";

import { ResultsMockup } from "@/components/mockups/ResultsMockup";
import { Visual } from "@/components/mockups/Visual";
import { screenshots } from "@/lib/site";
import heroArt from "@/public/brand/hero-bg.png";

import styles from "./landing.module.css";

export function Hero() {
  return (
    <section className={`${styles.hero} ${styles.dark}`} aria-labelledby="hero-title">
      <div className="container">
        <h1 id="hero-title" className={`type-hero ${styles.heroTitle}`}>
          <span>Every resume read.</span> <span>None sent away.</span>
        </h1>

        {/* The gap the artwork's glowing logo sits in. The artwork is centred on
            this element, so the logo stays between the headline and the text
            below at every width, however the headline wraps. */}
        <div className={styles.heroStage} aria-hidden="true">
          <div className={styles.heroArt}>
            <Image
              src={heroArt}
              alt=""
              fill
              preload
              fetchPriority="high"
              placeholder="blur"
              sizes="(max-width: 900px) 1000px, (max-width: 1600px) 110vw, 1780px"
              className={styles.heroArtImage}
            />
          </div>
        </div>

        <p className={`type-intro ${styles.heroIntro}`}>
          Atlas scores each student’s resume against your criteria with an AI model that runs on your own computer,
          then sorts everyone into Shortlisted, Cutoff and Rejected.
        </p>
        <div className={styles.heroActions}>
          <Link href="/login" className="button">
            Sign in to download
          </Link>
          <a href="#how" className="button button-quiet">
            See how it works
          </a>
        </div>
        <p className={`type-caption ${styles.heroNote}`}>
          For Mac and Windows. Uses Ollama, a free app, to run the model.
          <span className={styles.fn}>
            <a href="#fn-ollama" aria-label="Footnote 2">
              2
            </a>
          </span>
        </p>
      </div>
      <div className={`container-wide ${styles.heroVisual}`}>
        <Visual
          shot={screenshots.results}
          alt="The Atlas results window, with students ranked by score in the Shortlisted group."
        >
          <ResultsMockup />
        </Visual>
      </div>
    </section>
  );
}
