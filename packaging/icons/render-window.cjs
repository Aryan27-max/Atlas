// The window render-icons.mjs draws in: blank, offscreen (no visible window, a
// scale factor of 1), and closed by the script when it's done.
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { offscreen: true } })
  void win.loadURL('about:blank')
})
