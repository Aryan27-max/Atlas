import { RedactionMockup } from "@/components/mockups/RedactionMockup";
import { Reveal } from "@/components/site/Reveal";

import styles from "./landing.module.css";

const FACTS = [
  {
    title: "What the model never sees",
    body: "Name, email, phone, RA number, class section and photos. Atlas removes them even where they appear inside the résumé: its header, email addresses and profile handles.",
  },
  {
    title: "What goes online",
    body: "Only the résumé links in your list, a connection check that sends no data when a download fails, and model downloads you ask for. No telemetry, no accounts, no update checks.",
  },
  {
    title: "Where everything lives",
    body: "In one folder on your computer. Each downloaded PDF is deleted as soon as its text is saved, and you can delete a screening, or everything, from Settings.",
  },
];

export function Privacy() {
  return (
    <section id="privacy" className={`${styles.section} ${styles.dark}`} aria-labelledby="privacy-title">
      <div className="container">
        <div className={styles.head}>
          <h2 id="privacy-title" className="type-headline">
            Résumés stay on your computer.
          </h2>
          <p className={`type-intro ${styles.intro}`}>
            The AI model runs on your own computer, through Ollama. No résumé text, name, email or phone number is ever
            sent to an online AI service. And the model scores what a résumé shows, not who wrote it.
          </p>
        </div>
        <Reveal className={styles.privacyVisual}>
          <RedactionMockup />
        </Reveal>
        <div className={styles.facts}>
          {FACTS.map((f) => (
            <div key={f.title} className={styles.fact}>
              <h3>{f.title}</h3>
              <p className="type-body">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
