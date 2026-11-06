import styles from "./landing.module.css";

const DETAILS = [
  {
    title: "It says what to do next.",
    body: "When a student’s link is private, Atlas says so, and suggests asking them to set sharing to “Anyone with the link”. Every message is written that way.",
  },
  {
    title: "Clean in Excel.",
    body: "Exports use UTF-8 with a byte-order mark, so names in any script show correctly, and cells are protected against spreadsheet formula injection.",
  },
  {
    title: "At home on Mac and Windows.",
    body: "Native on both, in light and dark, following your system setting. Select several students with Cmd-click on a Mac or Ctrl-click on Windows.",
  },
];

export function Details() {
  return (
    <section className={`${styles.section} ${styles.mist}`} aria-labelledby="details-title">
      <div className="container">
        <div className={styles.head}>
          <h2 id="details-title" className="type-headline">
            Small things, done properly.
          </h2>
        </div>
        <div className={styles.details}>
          {DETAILS.map((d) => (
            <div key={d.title} className={styles.detail}>
              <h3>{d.title}</h3>
              <p className="type-body">{d.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
