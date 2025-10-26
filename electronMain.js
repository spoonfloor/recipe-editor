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

const MAX_BACKUPS = 8;

// --- Backup helpers ---

function tsStamp(d = new Date()) {
  // local time: "YYYYMMDD-HHMMSS"
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}-${hh}${mm}${ss}`;
}

function reserveBackupPath(historyDir, base, ext) {
  const stamp = tsStamp();
  for (let n = 0; n < 100; n++) {
    const suffix = n === 0 ? '' : `-${String(n).padStart(2, '0')}`;
    const candidate = path.join(historyDir, `${base}_${stamp}${suffix}${ext}`);
    try {
      const fd = fs.openSync(candidate, 'wx'); // atomic reserve
      fs.closeSync(fd);
      return candidate;
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
  }
  throw new Error('Too many backups in the same second.');
}
function pruneBackups(historyDir, keepCount = MAX_BACKUPS) {
  try {
    if (!fs.existsSync(historyDir)) return;
    const files = fs
      .readdirSync(historyDir)
      .map((name) => ({ name, full: path.join(historyDir, name) }))
      .filter((f) => {
        try {
          return fs.statSync(f.full).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        try {
          return fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs;
        } catch {
          return 0;
        }
      });
    files.slice(keepCount).forEach((f) => {
      try {
        fs.unlinkSync(f.full);
      } catch {}
    });
  } catch (e) {
    console.warn('⚠️ pruneBackups failed:', e);
  }
}

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

      // Guard: prevent edits to backups (no recursive Backup folders)
      const isInBackupFolder = /(^|[\\/])Backup([\\/]|$)/i.test(
        path.normalize(targetPath)
      );
      if (isInBackupFolder) {
        dialog.showErrorBox(
          'Read-only Backup',
          'This file is a read-only backup. Move it out of the Backup folder to edit.'
        );
        return false;
      }

      // Optional backup step
      if (!options.overwriteOnly) {
        const BACKUP_DIR = path.join(path.dirname(targetPath), 'Backup');
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        // Back up existing on-disk DB BEFORE overwrite
        if (fs.existsSync(targetPath)) {
          const base = path.basename(targetPath, path.extname(targetPath));
          const ext = path.extname(targetPath) || '.db';
          const backupPath = reserveBackupPath(BACKUP_DIR, base, ext);
          fs.copyFileSync(targetPath, backupPath);
        }
        pruneBackups(BACKUP_DIR);
      }

      console.log('🧾 Writing DB to:', targetPath);
      // Safer write: temp + rename
      const tmp = `${targetPath}.tmp`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, targetPath);
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
  const chosen = result.filePaths[0];
  if (!chosen) return null;
  const isInBackupFolder = /(^|[\\/])Backup([\\/]|$)/i.test(
    path.normalize(chosen)
  );
  if (isInBackupFolder) {
    await dialog.showMessageBox({
      type: 'warning',
      buttons: ['OK'],
      title: 'Read-only Backup',
      message:
        'This file is a read-only backup. Move it out of the Backup folder to edit.',
      detail:
        'You can view it now, but saving changes will be blocked until it is moved.',
    });
  }
  return chosen;
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
