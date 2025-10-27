// preload.js
// Exposes a tiny, safe API to the renderer (your existing front-end)
// so it can ask Electron's main process to load/save the DB.

const { contextBridge, ipcRenderer } = require('electron');

// Guard: only expose minimal, explicit functions

const api = Object.freeze({
  // Load DB bytes (Uint8Array) from a path known to main, or from a user-picked file (to be wired in main)
  loadDB: (path = null) => ipcRenderer.invoke('loadDB', path),

  // Save DB bytes to NAS (main decides overwrite vs backup options)
  // bytes should be a Uint8Array from SQL.js export()
  saveDB: (bytes, options = { overwriteOnly: false }) =>
    ipcRenderer.invoke('saveDB', bytes, options),

  // Optional helper: open a file picker in main and return the chosen path
  pickDB: () => ipcRenderer.invoke('pickDB'),

  // Optional helper: ask main for some environment info if you want (not required)
  getEnv: () => ipcRenderer.invoke('getEnv'),
});

contextBridge.exposeInMainWorld('electronAPI', api);
