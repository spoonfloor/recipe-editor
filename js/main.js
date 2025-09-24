// Shared SQL.js init
let SQL;
initSqlJs({
  locateFile: (file) =>
    `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`,
}).then((sql) => {
  SQL = sql;
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
  loadDbBtn.addEventListener('click', () => dbLoader.click());
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
    recipesActionBtn.addEventListener('click', () => {
      console.log('Recipes action button clicked');
    });
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
        console.log('Search submitted:', searchInput.value);
      }
    });
  }
}

// Recipe editor page logic
function loadRecipeEditorPage() {
  const stored = localStorage.getItem('favoriteEatsDb');
  if (!stored) {
    alert('No database loaded. Please go back to the welcome page.');
    window.location.href = 'index.html';
    return;
  }

  const Uints = new Uint8Array(JSON.parse(stored));
  const db = new SQL.Database(Uints);

  const recipeId = sessionStorage.getItem('selectedRecipeId');
  if (!recipeId) {
    alert('No recipe selected.');
    window.location.href = 'recipes.html';
    return;
  }

  // Load recipe title
  const recipeTitleQuery = db.exec(
    `SELECT title FROM recipes WHERE ID=${recipeId};`
  );
  if (recipeTitleQuery.length === 0) {
    alert('Recipe not found.');
    window.location.href = 'recipes.html';
    return;
  }
  const recipeTitle = recipeTitleQuery[0].values[0][0];

  // Update app bar title
  const appBarTitle = document.getElementById('recipeTitle');
  if (appBarTitle) appBarTitle.textContent = recipeTitle;

  // --- Use formatter to convert DB data to human-readable recipe ---
  const recipe = formatRecipe(db, recipeId);

  // Render recipe
  renderRecipe(recipe);

  // Editor action button stub
  const editorActionBtn = document.getElementById('editorActionBtn');
  if (editorActionBtn) {
    editorActionBtn.addEventListener('click', () => {
      console.log('Editor action button clicked');
    });
  }

  // Back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'recipes.html';
    });
  }
}
