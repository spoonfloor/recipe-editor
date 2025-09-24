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

// Welcome page logic: load DB and redirect
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

  // Stub for recipes action button
  const recipesActionBtn = document.getElementById('recipesActionBtn');
  if (recipesActionBtn) {
    recipesActionBtn.addEventListener('click', () => {
      console.log('Recipes action button clicked');
    });
  }

  // Search input: console only on Enter key
  const searchInput = document.querySelector('.app-bar .search-bar input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        console.log('Search submitted:', e.target.value);
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

  // --- Load recipe title ---
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

  // --- Load sections ---
  const sectionsQuery = db.exec(
    `SELECT ID, name FROM recipe_sections WHERE recipe_id=${recipeId} ORDER BY sort_order;`
  );

  const recipeSections =
    sectionsQuery.length > 0 ? sectionsQuery[0].values : [];

  const recipe = {
    title: recipeTitle,
    sections: [],
  };

  // For each section, load ingredients and steps
  recipeSections.forEach(([sectionId, sectionName]) => {
    // Ingredients
    const ingQuery = db.exec(
      `SELECT rim.quantity, rim.unit, i.name
       FROM recipe_ingredient_map rim
       JOIN ingredients i ON rim.ingredient_id = i.ID
       WHERE rim.recipe_id=${recipeId} AND rim.section_id=${sectionId};`
    );
    const ingredients =
      ingQuery.length > 0
        ? ingQuery[0].values.map(([qty, unit, name]) => ({
            quantity: parseFloat(qty) || qty,
            unit: unit || '',
            name,
          }))
        : [];

    // Steps
    const stepsQuery = db.exec(
      `SELECT instructions
       FROM recipe_steps
       WHERE recipe_id=${recipeId} AND section_id=${sectionId}
       ORDER BY step_number;`
    );
    const steps =
      stepsQuery.length > 0 ? stepsQuery[0].values.map((r) => r[0]) : [];

    recipe.sections.push({
      name: sectionName,
      ingredients,
      steps,
    });
  });

  // Render recipe
  renderRecipe(recipe);

  // Stub for editor action button
  const editorActionBtn = document.getElementById('editorActionBtn');
  if (editorActionBtn) {
    editorActionBtn.addEventListener('click', () => {
      console.log('Editor action button clicked');
    });
  }
  // Add this to your main.js or a script in recipeEditor.html
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'recipes.html';
    });
  }
}
