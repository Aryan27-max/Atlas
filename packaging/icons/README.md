# App icon: placeholder

`icon.png` is a **placeholder** (a blue rounded square with an "A", drawn by code). Replace it with Atlas's real icon before giving the app to recruiters.

What to supply:
- **`icon.png`, 1024 × 1024 pixels**, PNG with a transparent background. electron-builder turns it into the Windows `.ico` and the macOS `.icns` itself.
- On macOS the artwork should sit inside a rounded square about 824 × 824 pixels in the middle, as Apple's other icons do (the placeholder follows that).
- Optional: your own `icon.ico` (Windows) and `icon.icns` (macOS) in this folder, if a designer prepares them; then point `win.icon` and `mac.icon` in `app/electron-builder.yml` at them.

Keep the file name and the size, and rebuild (`npm run dist` from `app/`).
