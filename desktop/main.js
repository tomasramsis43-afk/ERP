const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// The address comes from ERP_WEB_URL (runtime override) or config.json (set at build time).
const target = process.env.ERP_WEB_URL || require('./config.json').url;

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
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
