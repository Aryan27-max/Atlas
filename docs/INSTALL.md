# Installing and using Atlas

Atlas screens résumés on your own computer. A student list goes in; Atlas downloads each résumé from its link, an AI model running on the same computer reads it against your criteria, and the students come out sorted into **Shortlisted**, **Cutoff** and **Rejected**. Nothing about the students is sent to an online AI service (see [DATA_HANDLING.md](DATA_HANDLING.md)).

You install two things: **Ollama** (the free program that runs the AI model) and **Atlas**.

## What you need
- **Windows 10 or 11** (64-bit), or a **Mac** (Apple silicon or Intel).
- **16 GB of memory** recommended. The suggested model needs about 6–7 GB while it works.
- **About 10 GB of free disk space**: about 5 GB for the model, under 1 GB for Atlas, and room for your screenings.
- **Internet**, to download the model once and the résumés during a screening.
- Time: on a typical laptop without a suitable graphics chip, each résumé takes **about 2–3 minutes**, so 200 students is an overnight job. Atlas shows an estimate before you start.

## 1. Install Ollama
1. Go to **ollama.com/download** and download Ollama for your system.
2. Run the installer like any other program. When it finishes, Ollama runs quietly in the background (a llama icon in the taskbar tray on Windows, or the menu bar on a Mac).

You don't need to type anything into Ollama: Atlas talks to it.

## 2. Install Atlas
Download the installer for your computer from the Atlas release page you were sent: **Atlas-Setup-…-x64.exe** for Windows, or the **.dmg** for your Mac (below). `SHA256SUMS.txt` on the same page lets IT check the files.

Until Atlas is code-signed (the firm's decision: see [SIGNING.md](SIGNING.md)), your computer will warn you that it doesn't recognise the app. That's expected. Here is how to get past it.

### Windows
1. Double-click **Atlas-Setup-…-x64.exe**.
2. If you see **"Windows protected your PC"**: click **More info**, then **Run anyway**.
3. Atlas installs into your own user folder (no administrator password needed), adds a Start-menu and desktop shortcut, and opens.

If Windows says **"Smart App Control blocked an app that may be unsafe"** and offers no *Run anyway*, the laptop has Smart App Control switched on, which blocks every unsigned app. Ask your IT contact; the lasting fix is a signed version of Atlas.

### Mac
1. Open **Atlas-…-arm64.dmg** (Apple silicon: M1 or later) or **Atlas-…-x64.dmg** (Intel). Not sure? Apple menu → About This Mac: "Chip: Apple M…" means arm64.
2. Drag **Atlas** into **Applications**.
3. Open Atlas from Applications. The first time, macOS says it **could not verify that Atlas is free of malware**: click **Done**.
4. Open **System Settings → Privacy & Security**, scroll down to the message about Atlas, and click **Open Anyway**. Confirm with your password, then click **Open**.

You only do this once.

## 3. The first run
Atlas first writes **"hello"** on an off-white screen (off-white even in dark mode) while it gets ready, which takes a few seconds. If that takes long, it says **Still starting…**; that's normal on a slow or busy computer. Then it opens on **Welcome**. The **This computer** card says what Ollama is doing and offers one button:

| What the card says | Press |
|---|---|
| **Install Ollama to start screening** | **Open download page**, then do step 1 above, then **Check again** |
| **Ollama isn't running** | **Start Ollama** (Atlas opens it for you; this takes a few seconds) |
| **Ollama is running · no model yet** | **Get a model**: `qwen3:8b` is suggested. It downloads about 5 GB once; keep Atlas open until it finishes |
| **Ollama is running** · N models installed | nothing: you're ready |

The card also shows the folder where Atlas keeps everything.

## 4. Your first screening
1. **New screening**, then **Choose file…**: the student list as **Excel (.xlsx) or CSV**, for example the Google Forms export. The **Input fields** box on the same screen lists the columns Atlas reads and which two are required (RA number and résumé link). An old Excel file (.xls) has to be saved as .xlsx first. Atlas checks it first and lists anything to fix (missing links, duplicate RA numbers…). Nothing is saved until you start.
2. Choose the **model**. The first time you use a model, Atlas tests it on a sample résumé: a minute or two, up to five on a slower computer.
3. **Criteria**: describe who you're looking for, in plain words.
4. **Cutoffs**: the score for the shortlist, where the cutoff band starts, an optional minimum number to shortlist, and optional filters: a minimum CGPA, and the departments to keep. Type a department as it appears in the student list and press **Add**; Atlas tells you if no student is in that department. Click a department to remove it.
5. **Review**: check everything and the time estimate, then **Start screening**. If it will take more than 4 hours, Atlas asks first and suggests running it overnight.

When it finishes, **View results**. You can adjust the cutoffs (nothing is re-scored), open any student to see the reasons and the quotes from their résumé, move students between buckets (one at a time, or several: Shift- or Ctrl-click, Cmd-click on a Mac, then *Move to…*), and **Export** to a CSV that opens in Excel.

## 5. Overnight checklist
Before you leave a long screening running:
- [ ] The laptop is **plugged in**.
- [ ] The **lid stays open** (most laptops sleep when the lid closes, whatever the settings).
- [ ] Settings → **Keep the computer awake** is on (it is by default; the screen can still turn off).
- [ ] **Atlas stays open.** Minimising it is fine.
- [ ] The internet is **stable**, and doesn't need a Wi-Fi sign-in page again during the night.
- [ ] Other heavy programs are closed.

If something goes wrong in the night (Wi-Fi drops, Ollama stops, the computer restarts), Atlas **pauses and keeps its place**. Most pauses continue by themselves; otherwise press **Resume** in the morning. No student is lost or screened twice. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) explains every message.

## 6. Where your data lives
| Windows | Mac |
|---|---|
| `%APPDATA%\Atlas` | `~/Library/Application Support/Atlas` |

Settings → Data shows the folder (**Show in folder**) and how much space it uses. Exports go wherever you save them.

- **Delete one screening:** Settings → Data → **Delete** next to it.
- **Delete everything:** Settings → Data → **Delete all data…** (you type DELETE to confirm).

## 7. Updating and uninstalling
- **Update:** install the new version over the old one. Your screenings stay.
- **Uninstall:** Windows: Settings → Apps → Installed apps → **Atlas** → Uninstall. Mac: drag Atlas from Applications to the Trash.
- **Uninstalling keeps your data folder**, so a reinstall picks up where you were. To remove the data too, use **Delete all data** before uninstalling, or delete the folder above afterwards.
- Ollama is a separate program; uninstall it the same way if you no longer need it.
