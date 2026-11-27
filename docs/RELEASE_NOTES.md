# Atlas 0.3.0

Atlas screens student résumés on your own computer. You give it the student list (Excel or CSV), describe who you're looking for, and an AI model running on the same computer (through Ollama) reads each résumé and sorts the students into **Shortlisted**, **Cutoff** and **Rejected**, with the reasons. Nothing about the students is sent to an online AI service.

## Downloads

| Your computer | File |
|---|---|
| Windows 10 or 11 (64-bit) | `Atlas-Setup-0.3.0-x64.exe` |
| Mac with Apple silicon (M1 or later) | `Atlas-0.3.0-arm64.dmg` |
| Mac with an Intel processor | `Atlas-0.3.0-x64.dmg` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple silicon.

`SHA256SUMS.txt` lists each file's SHA-256 checksum, so IT can check a download is complete and unchanged.

## Installing

Follow **INSTALL.md**, attached to this release. In short:
1. **Install Ollama** from ollama.com/download.
2. **Install Atlas.** This version isn't code-signed yet, so your computer warns you the first time:
   - **Windows:** "Windows protected your PC": click **More info**, then **Run anyway**.
   - **Mac:** open Atlas once, then go to **System Settings → Privacy & Security → Open Anyway**.
3. **Open Atlas.** It shows a "hello" screen while it starts. Then Welcome tells you what Ollama needs, with one button for each step.

**Smart App Control.** On a Windows 11 PC with Smart App Control switched on, the installer may be blocked with no "Run anyway". Ask your IT contact; a signed version of Atlas is the lasting fix.

## New in 0.3.0
- **Input fields:** when you start a new screening, an **Input fields** box lists every column Atlas reads from the student list, which ones are required (RA number and résumé link), what each is for, and the other column names it accepts. Student lists can be CSV (.csv) or Excel (.xlsx); save an old .xls file as .xlsx first.
- **Department filter:** on the Cutoffs page you now type the departments you want and press **Add**. Atlas checks each one against the student list (capitals, spaces and dots don't matter, so "cse" finds "C.S.E."). A department that isn't in the list is refused with a message, so you can't filter on a typo. Leave it empty to include every department.

## Everything in Atlas
- **Student lists:** Excel (.xlsx) and CSV student lists, checked before anything is saved.
- **Private scoring:** résumés are downloaded and scored by a local AI model, with names, emails, phone numbers and RA numbers kept from the model.
- **Results:** live cutoffs, a minimum number to shortlist, and moving students between groups by hand, with a note.
- **Long screenings:** a long screening pauses by itself if the internet or Ollama drops, and carries on where it stopped. You can also close Atlas and reopen it.
- **Export:** to a CSV that opens correctly in Excel.
- **Look and feel:** light and dark themes; the Atlas app icon and start-up screen.

## Known limitations
- **Unsigned:** the first-launch warnings described above.
- **Speed:** on a laptop without a suitable graphics chip, each résumé takes about 2–3 minutes, so 200 students is an overnight job.
- **Scanned résumés:** these (images, not text) are listed under **Needs attention** for a person to read.
- **Ollama:** it is installed separately. Atlas finds and starts it, but never installs it.
