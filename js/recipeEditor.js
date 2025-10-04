// Recipe editor

const MEASURE_ORDER = [
  '⅛ tsp',
  '¼ tsp',
  '½ tsp',
  '1 tsp',
  '½ tbsp',
  '1 tbsp',
  '1½ tbsp', // ✅ added here
  '⅛ cup',
  '¼ cup',
  '⅓ cup',
  '½ cup',
  '⅔ cup',
  '¾ cup',
  '1 cup',
  '2 cup',
  '4 cup',
  '8 cup',
];

// canonical order for locations
const LOCATION_ORDER = [
  '', // null / top-level
  'fridge',
  'freezer',
  'above fridge',
  'pantry',
  'cereal cabinet',
  'spices',
  'measures',
];

// --- Format helpers ---
function formatIngredientLine(ing) {
  let qtyText = '';
  if (typeof ing.quantity === 'number' && !isNaN(ing.quantity)) {
    qtyText = decimalToFractionDisplay(ing.quantity);
  } else if (typeof ing.quantity === 'string' && ing.quantity.trim()) {
    qtyText = ing.quantity; // e.g. "to taste", "2 or 3"
  }

  const unitText = ing.unit || '';
  const qtyUnit = [qtyText, unitText].filter(Boolean).join(' ');

  // build main part
  let text = `${ing.variant ? ing.variant + ' ' : ''}${ing.name}`;
  if (qtyUnit) text = `${qtyUnit} ${text}`;

  // add prep notes
  if (ing.prepNotes) {
    text += `, ${ing.prepNotes}`;
  }

  // add parenthetical note + optional
  let parens = [];
  if (ing.parentheticalNote) parens.push(ing.parentheticalNote);
  if (ing.isOptional) parens.push('optional');
  if (parens.length > 0) {
    text += ` (${parens.join(', ')})`;
  }

  return text.trim();
}

function formatNeedLine(ing) {
  let qtyText = '';
  if (typeof ing.quantity === 'number' && !isNaN(ing.quantity)) {
    qtyText = decimalToFractionDisplay(ing.quantity);
  } else if (typeof ing.quantity === 'string' && ing.quantity.trim()) {
    qtyText = ing.quantity;
  }

  const unitText = ing.unit || '';
  const qtyUnit = [qtyText, unitText].filter(Boolean).join(' ');

  let text = `${ing.variant ? ing.variant + ' ' : ''}${ing.name}`;
  if (qtyUnit) text += ` (${qtyUnit})`;

  // 🚫 omit prepNotes here

  // merge optional into same parentheses
  if (ing.isOptional) {
    if (qtyUnit) {
      text = text.replace(/\)$/, ', optional)');
    } else {
      text += ' (optional)';
    }
  }

  return text.trim();
}

// --- Sort helper (section → location → optional → alphabetical) ---
function sortIngredients(list) {
  return [...list].sort((a, b) => {
    // 1. Location order
    const locA = a.locationAtHome ? a.locationAtHome.toLowerCase() : '';
    const locB = b.locationAtHome ? b.locationAtHome.toLowerCase() : '';
    const idxA = LOCATION_ORDER.indexOf(locA);
    const idxB = LOCATION_ORDER.indexOf(locB);
    if (idxA !== idxB) return idxA - idxB;

    // 2. Required before optional
    if (a.isOptional !== b.isOptional) {
      return a.isOptional ? 1 : -1;
    }

    // 3. Alphabetical
    const nameA = `${a.variant || ''} ${a.name}`.trim().toLowerCase();
    const nameB = `${b.variant || ''} ${b.name}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function renderRecipe(recipe) {
  const container = document.getElementById('recipeView');
  container.innerHTML = '';

  // --- Servings (if present) ---
  if (recipe.servingsDefault) {
    const servingsLine = document.createElement('div');
    servingsLine.className = 'servings-line';
    servingsLine.textContent = `Servings: ${recipe.servingsDefault}`;
    container.appendChild(servingsLine);
  }

  // --- Ingredients section ---
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

        // 🔹 Sorted render with formatIngredientLine
        sortIngredients(section.ingredients).forEach((ing) => {
          const line = document.createElement('div');
          line.className = 'ingredient-line';
          const span = document.createElement('span');
          span.textContent = formatIngredientLine(ing);
          line.appendChild(span);
          container.appendChild(line);
        });
      }
    });
  }

  // --- You will need section ---
  const allIngredients = recipe.sections.flatMap((sec) => sec.ingredients);
  if (allIngredients.length) {
    const needHeader = document.createElement('div');
    needHeader.className = 'section-header';
    needHeader.textContent = 'You will need';
    container.appendChild(needHeader);

    // Group by location
    const grouped = {};
    allIngredients.forEach((ing) => {
      const loc = ing.locationAtHome || '';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(ing);
    });

    // Render groups in canonical location order
    LOCATION_ORDER.forEach((loc) => {
      if (!grouped[loc] || grouped[loc].length === 0) return;

      if (loc) {
        const locHeader = document.createElement('div');
        locHeader.className = 'subsection-header';
        locHeader.textContent = capitalizeWords(loc);
        container.appendChild(locHeader);
      }

      // 🔹 Apply same sort rules with formatNeedLine
      sortIngredients(grouped[loc]).forEach((ing) => {
        const line = document.createElement('div');
        line.className = 'ingredient-line';
        const span = document.createElement('span');
        span.textContent = formatNeedLine(ing);
        line.appendChild(span);
        container.appendChild(line);
      });
    });
  }

  // --- Measures section ---
  const measures = computeMeasures(allIngredients);
  if (measures.length) {
    const measureHeader = document.createElement('div');
    measureHeader.className = 'section-header';
    measureHeader.textContent = 'Measures';
    container.appendChild(measureHeader);

    measures.forEach((m) => {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.textContent = m;
      line.appendChild(span);
      container.appendChild(line);
    });
  }

  // --- Instructions section ---
  if (
    recipe.sections.some(
      (sec) => sec.steps.length || (!sec.name && sec.ingredients.length)
    )
  ) {
    const stepHeader = document.createElement('div');
    stepHeader.className = 'section-header';
    stepHeader.textContent = 'Instructions';
    container.appendChild(stepHeader);

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

// --- Helpers ---
function capitalizeWords(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Decompose quantity into minimal canonical measures
 */
function computeMeasures(ingredients) {
  const found = new Set();

  // Canonical measures in base units
  const measures = {
    '⅛ tsp': 0.125,
    '¼ tsp': 0.25,
    '½ tsp': 0.5,
    '1 tsp': 1,
    '½ tbsp': 0.5,
    '1 tbsp': 1,
    '1½ tbsp': 1.5,
    '⅛ cup': 0.125,
    '¼ cup': 0.25,
    '⅓ cup': 0.333,
    '½ cup': 0.5,
    '⅔ cup': 0.667,
    '¾ cup': 0.75,
    '1 cup': 1,
    '2 cup': 2,
    '4 cup': 4,
    '8 cup': 8,
  };

  function decompose(qty, unit, isLiquid) {
    if (!qty || isNaN(qty)) return;

    // --- Teaspoons ---
    if (unit.includes('tsp')) {
      let remaining = qty;
      const unitMeasures = ['1 tsp', '½ tsp', '¼ tsp', '⅛ tsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m] && qty + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    }

    // --- Tablespoons ---
    else if (unit.includes('tbsp')) {
      let remaining = qty;

      // Special case: exactly 1.5 tbsp → prefer "1½ tbsp"
      if (Math.abs(remaining - 1.5) < 1e-6) {
        found.add('1½ tbsp');
        remaining = 0;
      }

      // Special case: multiples of 4 tbsp → convert to cups
      else if (Math.abs(remaining % 4) < 1e-6) {
        const cups = remaining / 16; // 16 tbsp = 1 cup
        decompose(cups, 'cup', isLiquid);
        remaining = 0;
      }

      // Otherwise, decompose into 1 tbsp + ½ tbsp
      const unitMeasures = ['1 tbsp', '½ tbsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m] && qty + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    }

    // --- Cups ---
    else if (unit.includes('cup')) {
      if (isLiquid) {
        // liquids → nearest larger cup (2c/4c/8c allowed)
        const cupOrder = [
          '⅛ cup',
          '¼ cup',
          '⅓ cup',
          '½ cup',
          '⅔ cup',
          '¾ cup',
          '1 cup',
          '2 cup',
          '4 cup',
          '8 cup',
        ];
        let best = '1 cup';
        for (const m of cupOrder) {
          if (qty <= measures[m] + 1e-6) {
            best = m;
            break;
          }
        }
        found.add(best);
      } else {
        // dry → limit to 1 cup max
        let remaining = qty;
        const unitMeasures = [
          '1 cup',
          '¾ cup',
          '⅔ cup',
          '½ cup',
          '⅓ cup',
          '¼ cup',
          '⅛ cup',
        ];
        for (const m of unitMeasures) {
          while (remaining + 1e-6 >= measures[m] && qty + 1e-6 >= measures[m]) {
            found.add(m);
            remaining -= measures[m];
          }
        }
      }
    }
  }

  // Process all ingredients
  ingredients.forEach((ing) => {
    if (!ing.unit || !ing.quantity) return;
    const qty = ing.quantity;
    const unit = ing.unit.toLowerCase();

    // 🔹 Treat fridge/freezer as liquid, AND always treat "water" as liquid
    const name = ing.name.toLowerCase();
    const isLiquid =
      (ing.locationAtHome &&
        ['fridge', 'freezer'].includes(ing.locationAtHome)) ||
      name === 'water';

    decompose(qty, unit, isLiquid);
  });

  return MEASURE_ORDER.filter((m) => found.has(m));
}
