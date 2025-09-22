// Recipe editor

function renderRecipe(recipe) {
  const container = document.getElementById('recipeView');
  container.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = recipe.title;
  makeEditable(title, 'text');
  container.appendChild(title);

  recipe.sections.forEach((section) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'section';

    const header = document.createElement('h2');
    header.textContent = section.name;
    makeEditable(header, 'text');
    secDiv.appendChild(header);

    section.ingredients.forEach((ing) => {
      secDiv.appendChild(renderIngredient(ing));
    });

    section.steps.forEach((step) => {
      const instr = document.createElement('div');
      instr.className = 'instruction-line';
      instr.textContent = step;
      makeEditable(instr, 'text');
      secDiv.appendChild(instr);
    });

    container.appendChild(secDiv);
  });
}
