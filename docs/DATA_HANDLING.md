# How Atlas handles student data

*A plain-language description of what Atlas does with the data you give it, for your firm and your legal team to review. It describes how the software works. It is not legal advice, and it doesn't say whether your use complies with any law.*

## In one paragraph
Atlas runs entirely on the recruiter's computer. The student list, the résumés, the scores and everything else stay in one folder on that computer. The AI that reads the résumés (Ollama) also runs on that computer: **no résumé text, name, email or phone number is ever sent to an online AI service or to us.** Atlas only goes online to download each student's résumé from the link in your list, to check whether the internet is working, and, when you ask, to download an AI model.

---

## 1. What stays on the computer
Everything Atlas keeps is in its data folder:

| Windows | macOS |
|---|---|
| `%APPDATA%\Atlas` | `~/Library/Application Support/Atlas` |

(Settings → Data → **Show in folder** opens it.)

| What | Where | How long |
|---|---|---|
| The student list (names, emails, phones, RA numbers, CGPA, department, skills, links) | `atlas.db` (a SQLite database) | until you delete the screening |
| The text of each résumé, and its scores, reasons and quoted evidence | `atlas.db` | until you delete the screening |
| Your criteria, cutoffs, moves ("Moved by you") and settings | `atlas.db` | until you delete the screening or all data |
| Downloaded résumé PDFs | `downloads/` | deleted as soon as their text is saved; at most about 2 at a time |
| The uploaded list file | `uploads/` | until the screening starts or is cancelled |
| A technical log | `logs/engine.log` | rotated; **contains no résumé text, names, emails or phones**. Students are identified by RA number |
| CSV exports | wherever you choose to save them | you control these files; Atlas never deletes them |

## 2. What leaves the computer, and only this

| What | Where to | What's sent |
|---|---|---|
| Downloading each résumé | the link in your list (usually Google Drive) | an ordinary web request for that file, like opening the link in a browser |
| Checking the internet when a download fails | `drive.google.com` and `www.google.com` (a connection with **no data sent**), then `connectivitycheck.gstatic.com/generate_204` (a request with **no data**, which also detects Wi-Fi sign-in pages) | nothing about anyone |
| Downloading an AI model, when you choose "Get another model" | Ollama's model library (`registry.ollama.ai`), via the Ollama app | the model's name |
| "Open download page" (if Ollama isn't installed) | opens `https://ollama.com/download` in your browser | nothing from Atlas |

There is **no** telemetry, crash reporting, usage analytics, automatic update check or account in Atlas.

Two things that might look like they go online don't: Atlas reads this computer's processor, memory and graphics **locally** (for time estimates and Settings → About), and **Start Ollama** only opens the Ollama app already installed on the computer.

## 3. What the AI is and isn't shown
The AI model runs locally in Ollama (on `127.0.0.1`, which can't be reached from other computers). Atlas refuses to use an Ollama on any other computer, whatever the settings say. Even so, Atlas hides identity from it, so that scores depend on what the résumé shows, not who wrote it:

- **Never shown to the AI:** the student's name, email, phone number, RA number, class section, and photos.
  - The top of the résumé (name and contact details) is removed.
  - A "Personal details" or "Declaration" part (date of birth, gender, religion, family) is removed.
  - Names are also removed from the rest of the résumé, wherever they appear: from the list, from the résumé's own name line, from email addresses and from profile usernames (GitHub, LinkedIn…).
- **Shown to the AI:** the rest of the résumé text, CGPA, department, and the skills and hackathons the student claimed on the form. The claims are marked as claims to check against the résumé, not as facts.
- **Never shown to the AI:** your cutoff scores. The AI scores, and Atlas decides the buckets.
- The AI's answers are kept in `atlas.db`, so you can see why a student scored as they did.

Atlas has a built-in check for this. `leak_check` counts identity words in what would be sent to the AI; on the test data it reports 0.

## 4. Deleting data
- **One screening:** Settings → Data → **Delete** next to the screening. Its students, résumé text, scores and history are removed, and the database is compacted so the space is freed.
- **Everything:** Settings → Data → **Delete all data…** (you type DELETE to confirm). Removes every screening, uploaded file, downloaded résumé, log and setting.
- **CSV exports** you saved elsewhere are not touched by either. Delete them yourself.
- **Uninstalling Atlas keeps the data folder**, so reinstalling doesn't lose work. To remove everything, use **Delete all data** first, or delete the folder above after uninstalling.
- There is currently **no "delete one student"** button. To remove one person's data, delete the screening they're in.

## 5. Points for your legal team (India's DPDP Act and similar)
These are facts about the software that may be relevant. Whether they're sufficient is for your legal team to decide.

- **Who processes the data:** your firm, on your own computers. Atlas sends no personal data to the software's makers or to any third-party service.
- **Purpose:** Atlas only screens résumés against the criteria you enter, and it uses the data for nothing else.
- **Minimisation:** identity fields are removed before the AI sees a résumé (section 3). Downloaded PDFs are deleted once read.
- **Retention:** Atlas keeps screenings until you delete them. **Your firm should decide how long to keep them** (for example, delete a screening once the hiring round closes) and use the delete tools above.
- **Requests from students:** a student's data can be removed by deleting the screening they're in. A per-student export or deletion is not built in.
- **Security:** data is stored unencrypted in the data folder, protected by the computer's user account. Use full-disk encryption (BitLocker / FileVault) and a password-protected account on recruiters' laptops. The app's internal connection is limited to the same computer and protected by a per-launch secret.
- **Consent and notice:** collecting the students' details and résumé links, and telling students how they'll be used, happens outside Atlas, through your firm's own process.
