// electronMain.js

console.log('🧙 electronMain.js loaded from:', __filename);

// Electron main process — handles app lifecycle and real file I/O.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// 🔧 Adjustable constants
// Default DB path (used if user never picked a file)
let ACTIVE_DB_PATH =
  '/Volumes/primary/eric_files/websites/favorite_eats/database/favorite_eats.db';
// const HISTORY_DIR = path.join(path.dirname(NAS_DB_PATH), 'history'); // backup folder next to it

const HISTORY_DIR = path.join(path.dirname(ACTIVE_DB_PATH), 'history');

const MAX_BACKUPS = 5; // easy-to-find constant

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // load your existing web app entry
  win.loadFile('index.html');
}

// --- File I/O helpers ---

ipcMain.handle('loadDB', async (event, pathArg = null) => {
  ACTIVE_DB_PATH = pathArg || ACTIVE_DB_PATH;
  console.log('📖 Loading DB from:', ACTIVE_DB_PATH);
  return fs.promises.readFile(ACTIVE_DB_PATH);
});

ipcMain.handle(
  'saveDB',
  async (event, bytes, options = { overwriteOnly: false }) => {
    try {
      const buffer = Buffer.from(bytes);
      const targetPath = ACTIVE_DB_PATH;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      // Optional backup step
      if (!options.overwriteOnly) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(HISTORY_DIR, `favorite_eats_${ts}.sqlite`);
        fs.writeFileSync(backupPath, buffer);
      }

      console.log('🧾 Writing DB to:', targetPath);
      fs.writeFileSync(targetPath, buffer);
      return true;
    } catch (err) {
      console.error('❌ Save failed:', err);
      dialog.showErrorBox('Save Error', err.message);
      return false;
    }
  }
);
ipcMain.handle('pickDB', async (event, lastPath = null) => {
  const options = {
    title: 'Select a SQLite database',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    properties: ['openFile'],
  };

  // If we know the last used path, start there
  if (lastPath) {
    const lastDir = path.dirname(lastPath);
    if (fs.existsSync(lastDir)) {
      options.defaultPath = lastDir;
    }
  }

  const result = await dialog.showOpenDialog(options);
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('getEnv', async () => ({
  appPath: app.getAppPath(),
  userData: app.getPath('userData'),
}));

// --- App startup ---
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
