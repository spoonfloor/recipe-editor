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

// Recipes page logic: read DB from localStorage and show list
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

  // Query recipe by ID
  const recipes = db.exec(
    `SELECT ID, title FROM recipes WHERE ID=${recipeId};`
  );
  if (recipes.length > 0) {
    const [id, title] = recipes[0].values[0];
    // TODO: replace fakeRecipe with real query for sections/ingredients/steps
    const fakeRecipe = {
      title,
      sections: [
        {
          name: 'Filling',
          ingredients: [
            { quantity: 2, unit: 'tbsp', name: 'extra-virgin olive oil' },
            { quantity: 1, unit: '', name: 'yellow onion, chopped' },
            { quantity: 0.5, unit: 'tsp', name: 'fine sea salt, to taste' },
          ],
          steps: [
            'Preheat the oven to 425 degrees Fahrenheit.',
            'Prepare the filling: In a large skillet over medium heat, warm the olive oil.',
            'Add onion, carrots, mushrooms, salt and pepper.',
          ],
        },
      ],
    };
    renderRecipe(fakeRecipe);
  }
}
