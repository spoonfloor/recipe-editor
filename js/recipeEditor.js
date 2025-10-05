// Recipe editor

// --- Global debug toggle ---
const DEBUG_MODE = true;

// --- Canonical measure order (normalized units) ---
const MEASURE_ORDER = [
  '⅛ tsp',
  '¼ tsp',
  '½ tsp',
  '1 tsp',
  '½ tbsp',
  '1 tbsp',
  '1½ tbsp',
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

// --- Location order: "You will need" (clockwise kitchen sweep) ---
const LOCATION_ORDER_NEED = [
  '', // null / top-level
  'fridge',
  'freezer',
  'above fridge',
  'pantry',
  'cereal cabinet',
  'spices',
  'fruit stand',
  'measures',
];

// --- Location order: "Ingredients" (chef’s workflow) ---
const LOCATION_ORDER_INGREDIENTS = [
  '', // catch-all / unspecified
  'fridge', // core perishables
  'pantry', // staples
  'above fridge', // oils, vinegars
  'cereal cabinet', // nuts, grains
  'fruit stand', // fresh fruit
  'freezer', // long-term storage
  'spices', // flavorings
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

  // Build main part
  let text = `${ing.variant ? ing.variant + ' ' : ''}${ing.name}`;
  if (qtyUnit) text = `${qtyUnit} ${text}`;

  // Add prep notes
  if (ing.prepNotes) {
    text += `, ${ing.prepNotes}`;
  }

  // Add parenthetical note + optional
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

  // Merge optional into same parentheses
  if (ing.isOptional) {
    if (qtyUnit) {
      text = text.replace(/\)$/, ', optional)');
    } else {
      text += ' (optional)';
    }
  }

  return text.trim();
}

// --- Debug helper: context-aware tag builder ---
function debugTag(ing, context = 'ingredients') {
  if (!DEBUG_MODE) return '';
  const locList =
    context === 'need' ? LOCATION_ORDER_NEED : LOCATION_ORDER_INGREDIENTS;

  const loc = (ing.locationAtHome || '').toLowerCase();
  const locIndex = locList.indexOf(loc);
  const locTag =
    (locIndex >= 0 ? `${locIndex + 1}_` : '') + (loc || 'none').slice(0, 4);

  const optTag = ing.isOptional ? 'opti' : 'esse';
  const nameTag = (ing.name || '')
    .replace(/[^a-z]/gi, '')
    .slice(0, 4)
    .toLowerCase();
  const variantTag =
    (ing.variant || '')
      .replace(/[^a-z]/gi, '')
      .slice(0, 4)
      .toLowerCase() || '----';

  return ` [${optTag}, ${locTag}, ${nameTag}, ${variantTag}]`;
}

// --- Sort helper for Ingredients section ---
function sortIngredientsForIngredients(list) {
  return [...list].sort((a, b) => {
    // 1️⃣ Required before optional (global)
    if (a.isOptional !== b.isOptional) return a.isOptional ? 1 : -1;

    // 2️⃣ Location (chef’s workflow order)
    const locA = a.locationAtHome || '';
    const locB = b.locationAtHome || '';
    const indexA = LOCATION_ORDER_INGREDIENTS.indexOf(locA);
    const indexB = LOCATION_ORDER_INGREDIENTS.indexOf(locB);
    if (indexA !== indexB) return indexA - indexB;

    // 3️⃣ Core name (A–Z)
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    const nameCompare = nameA.localeCompare(nameB);
    if (nameCompare !== 0) return nameCompare;

    // 4️⃣ Variant (A–Z)
    const variantA = (a.variant || '').toLowerCase();
    const variantB = (b.variant || '').toLowerCase();
    return variantA.localeCompare(variantB);
  });
}

// --- Sort helper for You Will Need section ---
function sortIngredientsForNeed(list) {
  return [...list].sort((a, b) => {
    // 1️⃣ Location (clockwise sweep)
    const locA = a.locationAtHome || '';
    const locB = b.locationAtHome || '';
    const indexA = LOCATION_ORDER_NEED.indexOf(locA);
    const indexB = LOCATION_ORDER_NEED.indexOf(locB);
    if (indexA !== indexB) return indexA - indexB;

    // 2️⃣ Required before optional
    if (a.isOptional !== b.isOptional) return a.isOptional ? 1 : -1;

    // 3️⃣ Core name (A–Z)
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    const nameCompare = nameA.localeCompare(nameB);
    if (nameCompare !== 0) return nameCompare;

    // 4️⃣ Variant (A–Z)
    const variantA = (a.variant || '').toLowerCase();
    const variantB = (b.variant || '').toLowerCase();
    return variantA.localeCompare(variantB);
  });
}

// --- Merge duplicates for "You will need" ---
function mergeByIngredient(list) {
  const merged = [];
  const map = new Map();

  list.forEach((ing) => {
    const key = `${ing.variant || ''}|${ing.name}|${ing.locationAtHome || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...ing }); // clone first instance
    } else {
      const existing = map.get(key);
      if (
        typeof existing.quantity === 'number' &&
        typeof ing.quantity === 'number' &&
        existing.unit === ing.unit
      ) {
        existing.quantity += ing.quantity;
      }
      existing.isOptional = existing.isOptional || ing.isOptional;
    }
  });

  map.forEach((v) => merged.push(v));
  return merged;
}

// --- Main render function ---
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

        sortIngredientsForIngredients(section.ingredients).forEach((ing) => {
          const line = document.createElement('div');
          line.className = 'ingredient-line';
          const span = document.createElement('span');
          span.textContent =
            formatIngredientLine(ing) + debugTag(ing, 'ingredients');
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

    Object.keys(grouped).forEach((loc) => {
      grouped[loc] = mergeByIngredient(grouped[loc]);
    });

    LOCATION_ORDER_NEED.forEach((loc) => {
      if (!grouped[loc] || grouped[loc].length === 0) return;

      if (loc) {
        const locHeader = document.createElement('div');
        locHeader.className = 'subsection-header';
        locHeader.textContent = capitalizeWords(loc);
        container.appendChild(locHeader);
      }

      sortIngredientsForNeed(grouped[loc]).forEach((ing) => {
        const line = document.createElement('div');
        line.className = 'ingredient-line';
        const span = document.createElement('span');
        span.textContent = formatNeedLine(ing) + debugTag(ing, 'need');
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

    if (unit.includes('tsp')) {
      let remaining = qty;
      const unitMeasures = ['1 tsp', '½ tsp', '¼ tsp', '⅛ tsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    } else if (unit.includes('tbsp')) {
      let remaining = qty;
      if (Math.abs(remaining - 1.5) < 1e-6) {
        found.add('1½ tbsp');
        remaining = 0;
      } else {
        const unitMeasures = ['1 tbsp', '½ tbsp'];
        for (const m of unitMeasures) {
          while (remaining + 1e-6 >= measures[m]) {
            found.add(m);
            remaining -= measures[m];
          }
        }
      }
    } else if (unit.includes('cup')) {
      const qtyNum = Number(qty);
      if (qtyNum < 5) {
        found.add('4 cup');
        const remainder = qtyNum % 4;
        if (remainder > 0) {
          const dryCups = [
            '⅛ cup',
            '¼ cup',
            '⅓ cup',
            '½ cup',
            '⅔ cup',
            '¾ cup',
            '1 cup',
          ];
          for (const m of dryCups) {
            if (Math.abs(remainder - measures[m]) < 0.01) {
              found.add(m);
              break;
            }
            if (remainder < measures[m]) {
              found.add(m);
              break;
            }
          }
        }
      } else {
        found.add('8 cup');
      }
    }
  }

  ingredients.forEach((ing) => {
    if (!ing.unit || !ing.quantity) return;
    const qty = ing.quantity;
    const unit = ing.unit.toLowerCase();

    const name = ing.name.toLowerCase();
    const isLiquid =
      (ing.locationAtHome &&
        ['fridge', 'above fridge'].includes(ing.locationAtHome)) ||
      name === 'water';

    decompose(qty, unit, isLiquid);
  });

  return MEASURE_ORDER.filter((m) => found.has(m));
}
