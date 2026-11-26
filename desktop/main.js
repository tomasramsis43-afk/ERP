const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// The address comes from ERP_WEB_URL (runtime override) or config.json (set at build time).
const target = process.env.ERP_WEB_URL || require('./config.json').url;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'ERP',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(target);
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  // Links to other sites open in the normal browser, never inside the ERP window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  // Check for updates shortly after launch; failures are silent (offline).
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 5000);
  autoUpdater.on('update-downloaded', () => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: 'A new version has been downloaded. Restart to apply it?',
    });
    if (choice === 0) autoUpdater.quitAndInstall();
  });
});

app.on('window-all-closed', () => app.quit());
