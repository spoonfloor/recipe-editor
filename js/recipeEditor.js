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

    if (section.name) {
      const header = document.createElement('h2');
      header.textContent = section.name;
      makeEditable(header, 'text');
      secDiv.appendChild(header);
    }

    if (section.ingredients.length) {
      const ingHeader = document.createElement('h3');
      ingHeader.textContent = 'Ingredients';
      secDiv.appendChild(ingHeader);

      section.ingredients.forEach((ing) => {
        secDiv.appendChild(renderIngredient(ing));
      });
    }

    if (section.steps.length) {
      const stepHeader = document.createElement('h3');
      stepHeader.textContent = 'Steps';
      secDiv.appendChild(stepHeader);

      section.steps.forEach((step, index) => {
        const instr = document.createElement('div');
        instr.className = 'instruction-line';
        instr.textContent = index + 1 + '. ' + step;
        makeEditable(instr, 'text');
        secDiv.appendChild(instr);
      });
    }

    container.appendChild(secDiv);
  });
}
