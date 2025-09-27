// Recipe editor

function renderRecipe(recipe) {
  const container = document.getElementById('recipeView');
  container.innerHTML = '';

  // Title now handled in app bar, not here

  // Ingredients section
  if (recipe.sections.some((sec) => sec.ingredients.length)) {
    const ingHeader = document.createElement('div');
    ingHeader.className = 'section-header';
    ingHeader.textContent = 'Ingredients';
    container.appendChild(ingHeader);

    recipe.sections.forEach((section) => {
      if (
        section.ingredients.length &&
        (section.contexts.includes('ingredients') ||
          section.contexts.length === 0)
      ) {
        if (section.name) {
          const subHeader = document.createElement('div');
          subHeader.className = 'subsection-header';
          subHeader.textContent = section.name;
          makeEditable(subHeader, 'text');
          container.appendChild(subHeader);
        }
        section.ingredients.forEach((ing) => {
          container.appendChild(renderIngredient(ing));
        });
      }
    });
  }

  // Instructions section
  if (
    recipe.sections.some(
      (sec) => sec.steps.length || (!sec.name && sec.ingredients.length)
    )
  ) {
    const stepHeader = document.createElement('div');
    stepHeader.className = 'section-header';
    stepHeader.textContent = 'Instructions';
    container.appendChild(stepHeader);

    // Then: loop through sections for steps + named subsections
    recipe.sections.forEach((section) => {
      if (
        section.steps.length &&
        (section.contexts.includes('instructions') ||
          section.contexts.length === 0)
      ) {
        if (section.name) {
          const subHeader = document.createElement('div');
          subHeader.className = 'subsection-header';
          subHeader.textContent = section.name;
          makeEditable(subHeader, 'text');
          container.appendChild(subHeader);
        }

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

          container.appendChild(instr);
        });
      }
    });
  }
}
