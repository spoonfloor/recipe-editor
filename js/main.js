// Shared SQL.js init (offline / local version)
let SQL;
initSqlJs({
  locateFile: (file) => `js/${file}`, // load local sql-wasm.wasm
}).then((sql) => {
  SQL = sql;

  // --- existing page load logic ---
  if (document.body.classList.contains('recipes-page')) {
    loadRecipesPage();
  }
  if (document.body.classList.contains('recipe-editor-page')) {
    loadRecipeEditorPage();
  }
});

// Welcome page logic
const loadDbBtn = document.getElementById('loadDbBtn');
const dbLoader = document.getElementById('dbLoader');

if (loadDbBtn && dbLoader) {
  loadDbBtn.addEventListener('click', async () => {
    const isElectron = !!window.electronAPI;

    if (isElectron) {
      // --- Electron flow ---
      try {
        // 1. Remember last folder
        const lastPath = localStorage.getItem('favoriteEatsDbPath');

        // 2. Prompt for DB file
        let dbPath = await window.electronAPI.pickDB(lastPath);
        if (!dbPath) {
          alert('No database selected.');
          return;
        }

        // 3. Save for next session
        localStorage.setItem('favoriteEatsDbPath', dbPath);

        // 4. Load and store DB bytes
        const bytes = await window.electronAPI.loadDB(dbPath);
        const Uints = new Uint8Array(bytes);
        localStorage.setItem(
          'favoriteEatsDb',
          JSON.stringify(Array.from(Uints))
        );

        // 5. Navigate to recipes list
        window.location.href = 'recipes.html';
      } catch (err) {
        console.error('❌ Error loading database:', err);
        alert('Failed to load database — check console for details.');
      }
    } else {
      // --- Browser fallback flow (no Electron) ---
      dbLoader.click();
    }
  });

  dbLoader.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const Uints = new Uint8Array(reader.result);
      localStorage.setItem('favoriteEatsDb', JSON.stringify(Array.from(Uints)));
      window.location.href = 'recipes.html';
    };
    reader.readAsArrayBuffer(file);
  });
}

// Recipes page logic
function loadRecipesPage() {
  const stored = localStorage.getItem('favoriteEatsDb');
  if (!stored) {
    alert('No database loaded. Please go back to the welcome page.');
    return;
  }

  const Uints = new Uint8Array(JSON.parse(stored));
  const db = new SQL.Database(Uints);

  // --- Load recipes ---
  const recipes = db.exec(
    'SELECT ID, title FROM recipes ORDER BY title COLLATE NOCASE;'
  );
  const list = document.getElementById('recipeList');
  list.innerHTML = '';

  if (recipes.length > 0) {
    const rows = recipes[0].values;
    rows.forEach(([id, title]) => {
      const li = document.createElement('li');
      li.textContent = title;
      li.addEventListener('click', () => {
        sessionStorage.setItem('selectedRecipeId', id);
        window.location.href = 'recipeEditor.html';
      });
      list.appendChild(li);
    });
  }

  // --- Recipes action button stub ---
  const recipesActionBtn = document.getElementById('recipesActionBtn');
  if (recipesActionBtn) {
    recipesActionBtn.addEventListener('click', () => {});
  }

  // --- Search bar logic with clear button ---
  const searchInput = document.getElementById('recipeSearch');
  const clearBtn = document.querySelector('.clear-search');

  if (searchInput && clearBtn) {
    // Hide clear button initially
    clearBtn.style.display = 'none';

    // Show/hide clear button when typing
    searchInput.addEventListener('input', () => {
      clearBtn.style.display = searchInput.value ? 'inline' : 'none';
    });

    // Clear input on × click
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      searchInput.focus();
    });

    // Log search on Enter key
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
      }
    });
  }
}

// Recipe editor page logic
// --- Save button setup ---
const editorActionBtn = document.getElementById('editorActionBtn');
if (editorActionBtn) {
  // start dimmed
  editorActionBtn.disabled = true;
  editorActionBtn.style.opacity = '0.5';
  editorActionBtn.style.cursor = 'not-allowed';

  editorActionBtn.addEventListener('click', async () => {
    if (editorActionBtn.disabled) return; // ignore if inactive

    try {
      const binaryArray = window.dbInstance.export();

      const isElectron = !!window.electronAPI;
      if (isElectron) {
        const overwriteOnly = true; // 🔧 set true to skip backup
        const ok = await window.electronAPI.saveDB(binaryArray, {
          overwriteOnly,
        });
        if (ok) {
          alert('Database saved successfully.');
        } else {
          alert('Save failed — check console for details.');
        }
      } else {
        // Browser fallback (download)
        const blob = new Blob([binaryArray], {
          type: 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'favorite_eats_updated.sqlite';
        a.click();
        URL.revokeObjectURL(url);
      }

      // reset buttons
      editorActionBtn.disabled = true;
      editorActionBtn.style.opacity = '0.5';
      editorActionBtn.style.cursor = 'not-allowed';

      const cancelBtn = document.getElementById('cancelEditsBtn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = '0.5';
        cancelBtn.style.cursor = 'not-allowed';
      }
    } catch (err) {
      console.error('❌ Failed to save DB:', err);
      alert('Error saving database — check console for details.');
    }
  });
}

// --- Recipe editor loader ---
function loadRecipeEditorPage() {
  const stored = localStorage.getItem('favoriteEatsDb');
  if (!stored) {
    alert('No database loaded. Please go back to the welcome page.');
    window.location.href = 'index.html';
    return;
  }

  const recipeId = sessionStorage.getItem('selectedRecipeId');
  if (!recipeId) {
    alert('No recipe selected.');
    window.location.href = 'recipes.html';
    return;
  }

  // Restore database
  const Uints = new Uint8Array(JSON.parse(stored));
  const db = new SQL.Database(Uints);
  window.dbInstance = db;
  window.recipeId = recipeId;

  // Fetch and render the recipe
  const recipe = formatRecipe(db, recipeId);
  const titleEl = document.getElementById('recipeTitle');
  if (titleEl) titleEl.textContent = recipe.title;
  renderRecipe(recipe);
}
document.addEventListener('DOMContentLoaded', () => {
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'recipes.html';
    });
  }
});
