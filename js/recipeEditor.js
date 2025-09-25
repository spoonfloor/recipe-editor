// Recipe editor

function renderRecipe(recipe) {
  const container = document.getElementById('recipeView');
  container.innerHTML = '';

  // Put recipe title in app bar, sentence case
  const appBarTitle = document.getElementById('recipeTitle');
  if (appBarTitle) {
    const sentenceCase =
      recipe.title.charAt(0).toUpperCase() +
      recipe.title.slice(1).toLowerCase();
    appBarTitle.textContent = sentenceCase;
  }

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

        if (section.steps.length > 1) {
          instr.classList.add('numbered');

          const num = document.createElement('span');
          num.className = 'step-num';
          num.textContent = index + 1 + '.';

          const text = document.createElement('span');
          text.className = 'step-text';
          text.textContent = step;
          makeEditable(text, 'text');

          instr.appendChild(num);
          instr.appendChild(text);
        } else {
          const text = document.createElement('span');
          text.className = 'step-text';
          text.textContent = step;
          makeEditable(text, 'text');

          instr.appendChild(text);
        }

        secDiv.appendChild(instr);
      });
    }

    container.appendChild(secDiv);
  });
}
