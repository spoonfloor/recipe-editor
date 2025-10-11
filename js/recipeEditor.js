// Recipe editor

// --- Display modes ---
const SHOW_RECIPE_TEXT = true; // normal human-readable output
const SHOW_DEBUG_LOC_TAGS = false; // e.g., esse, 2_frid, spin, baby
const SHOW_DEBUG_MEASURE_TAGS = false; // e.g., marinar, 4½ cup

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

// --- Canonical order for locations (base version used in debug and general logic) ---
const LOCATION_ORDER = [
  '', // null / top-level
  'fridge',
  'freezer',
  'above fridge',
  'pantry',
  'cereal cabinet',
  'spices',
  'measures',
  'fruit stand',
  'coffee bar',
];

// --- Custom order for “You will need” section only ---
const NEED_LOCATION_ORDER = [
  'fridge',
  'freezer',
  'above fridge',
  'pantry',
  'cereal cabinet',
  'spices',
  'fruit stand',
  'coffee bar',
  '', // no location/misc
  'measures',
];

// --- Canonical order for Ingredients section (for normal reading) ---
const INGREDIENTS_LOCATION_ORDER = [
  '', // null / top-level
  'fridge',
  'above fridge',
  'pantry',
  'coffee bar',
  'cereal cabinet',
  'spices',
  'fruit stand',
  'freezer',
  'measures',
];

function enableSave() {
  const saveBtn = document.getElementById('editorActionBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
  }
}

function disableSave() {
  const saveBtn = document.getElementById('editorActionBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
  }
}

// --- Cancel / Dirty state tracking ---
let isDirty = false;
const cancelBtn = document.getElementById('cancelEditsBtn');
cancelBtn.disabled = true; // ✅ start disabled

function markDirty() {
  if (!isDirty) {
    isDirty = true;

    cancelBtn.disabled = false;
    enableSave();
  }
}

function revertChanges() {
  renderRecipe(window.recipeData);
  if (window.getSelection) window.getSelection().removeAllRanges();
  isDirty = false;

  cancelBtn.disabled = true;
  disableSave();
}

cancelBtn.addEventListener('click', () => {
  if (isDirty) {
    revertChanges();

    const saveBtn = document.getElementById('editorActionBtn');
    if (saveBtn) {
      // no-op: intentionally left without logging
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isDirty) {
      revertChanges();
    }
  }
});

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
  if (ing.prepNotes) text += `, ${ing.prepNotes}`;

  // add parenthetical note + optional
  let parens = [];
  if (ing.parentheticalNote) parens.push(ing.parentheticalNote);
  if (ing.isOptional) parens.push('optional');
  if (parens.length > 0) text += ` (${parens.join(', ')})`;

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

  // merge optional into same parentheses
  if (ing.isOptional) {
    if (qtyUnit) text = text.replace(/\)$/, ', optional)');
    else text += ' (optional)';
  }

  return text.trim();
}

// --- Sort helper (optional → alphabetical) ---
function sortIngredients(list, locationOrder = INGREDIENTS_LOCATION_ORDER) {
  return [...list].sort((a, b) => {
    // 1. location order
    const aLoc = a.locationAtHome || '';
    const bLoc = b.locationAtHome || '';
    const locIndexA = locationOrder.indexOf(aLoc);
    const locIndexB = locationOrder.indexOf(bLoc);
    if (locIndexA !== locIndexB) return locIndexA - locIndexB;

    // 2. required before optional
    if (a.isOptional !== b.isOptional) return a.isOptional ? 1 : -1;

    // 3. alphabetical by core name
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);

    // 4. alphabetical by variant
    const varA = a.variant ? a.variant.toLowerCase() : '';
    const varB = b.variant ? b.variant.toLowerCase() : '';
    return varA.localeCompare(varB);
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

// --- Debug helpers ---
function debugTag(ing, context) {
  const opt = ing.isOptional ? 'opti' : 'esse';
  const locIndex =
    (context === 'need'
      ? LOCATION_ORDER.indexOf(ing.locationAtHome || '')
      : INGREDIENTS_LOCATION_ORDER.indexOf(ing.locationAtHome || '')) + 1;
  const loc = (ing.locationAtHome || 'none').slice(0, 4) || 'none';
  const nameCore = ing.name.slice(0, 4).toLowerCase().padEnd(4, '-');
  const varCore = (ing.variant || '----')
    .slice(0, 4)
    .toLowerCase()
    .padEnd(4, '-');
  return `${opt}, ${locIndex}_${loc}, ${nameCore}, ${varCore}`;
}

function measureDebugTag(ing, allIngredients = []) {
  const normalize = (str) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, 7);

  const core = normalize(ing.name);
  const variant = normalize(ing.variant);
  const dupes = allIngredients.filter((x) => normalize(x.name) === core);
  const needsVariant = dupes.length > 1 && variant.length > 0;
  const id = needsVariant ? `${core}_${variant}` : core;

  let measure = '—';
  if (ing.quantity || ing.unit) {
    measure = [ing.quantity, ing.unit].filter(Boolean).join(' ');
  }

  return `${id}, ${measure}`;
}

function composeDisplayText(recipeText, locDebug, measureDebug) {
  const parts = [];
  if (SHOW_RECIPE_TEXT && recipeText) parts.push(recipeText);
  if (SHOW_DEBUG_LOC_TAGS && locDebug) parts.push(locDebug);
  if (SHOW_DEBUG_MEASURE_TAGS && measureDebug) parts.push(measureDebug);
  return parts.join(' | ');
}

// --- Keyboard Step Reordering System (with live renumbering) ---
function setupStepReordering(container, db, recipeId) {
  let activeStep = null;

  // click to select
  container.addEventListener('click', (e) => {
    const line = e.target.closest('.instruction-line');
    if (!line || !container.contains(line)) return;

    container
      .querySelectorAll('.instruction-line.selected')
      .forEach((el) => el.classList.remove('selected'));

    line.classList.add('selected');
    activeStep = line;
  });

  // --- Helper: renumber visible steps ---
  function renumberSteps() {
    const steps = Array.from(
      container.querySelectorAll('.instruction-line.numbered')
    );
    steps.forEach((el, i) => {
      const num = el.querySelector('.step-num');
      if (num) num.textContent = i + 1 + '.';
    });
  }

  // --- Helper: insertAfter (fixes leapfrogging) ---
  function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
  }

  // --- Arrow key reorder (Ctrl/⌘ + ↑/↓) ---
  document.addEventListener('keydown', (e) => {
    if (!activeStep) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();

      const steps = Array.from(
        container.querySelectorAll('.instruction-line.numbered')
      );
      const idx = steps.indexOf(activeStep);
      if (idx === -1) return;

      console.log('⬇️ Key pressed:', e.key);
      console.log(
        'Before move → active step text:',
        activeStep.querySelector('.step-text').textContent
      );
      console.log('Before move → active step index:', idx);

      if (e.key === 'ArrowUp' && idx > 0) {
        container.insertBefore(activeStep, steps[idx - 1]);
      }

      if (e.key === 'ArrowDown' && idx < steps.length - 1) {
        insertAfter(activeStep, steps[idx + 1]); // 🔥 FIX
      }

      // Recalculate steps after move
      const newSteps = Array.from(
        container.querySelectorAll('.instruction-line.numbered')
      );
      const newIdx = newSteps.indexOf(activeStep);

      console.log(
        'After move → active step text:',
        activeStep.querySelector('.step-text').textContent
      );
      console.log('After move → new index:', newIdx);

      // ✅ Renumber after move
      renumberSteps();
    }
  });
}

// --- Main render function ---
function renderRecipe(recipe) {
  // 🔹 Keep a copy for cancel/revert
  window.recipeData = JSON.parse(JSON.stringify(recipe));

  // ❌ Removed recursive revertChanges() call
  // Initial reset now handled in loadRecipeEditorPage()

  const container = document.getElementById('recipeView');
  container.innerHTML = '';

  if (recipe.servingsDefault) {
    const servingsLine = document.createElement('div');
    servingsLine.className = 'servings-line';
    servingsLine.textContent = `Serves ${recipe.servingsDefault}`;
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
          container.appendChild(subHeader);
        }

        // updated sort call
        sortIngredients(section.ingredients).forEach((ing) => {
          const line = document.createElement('div');
          line.className = 'ingredient-line';
          const span = document.createElement('span');
          const locDebug = debugTag(ing, 'ingredients');
          const measureDebug = measureDebugTag(ing, section.ingredients);

          if (ing.subRecipeId) {
            // quantity
            if (ing.quantity && !isNaN(parseFloat(ing.quantity))) {
              span.appendChild(
                document.createTextNode(
                  decimalToFractionDisplay(parseFloat(ing.quantity)) + ' '
                )
              );
            } else if (ing.quantity) {
              span.appendChild(document.createTextNode(ing.quantity + ' '));
            }

            // unit
            if (ing.unit) {
              span.appendChild(document.createTextNode(ing.unit + ' '));
            }

            // clickable baseName only
            const baseName = ing.variant
              ? `${ing.variant} ${ing.name}`.trim()
              : ing.name;
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'sub-recipe-link';
            link.textContent = composeDisplayText(
              baseName,
              locDebug,
              measureDebug
            );
            link.addEventListener('click', (e) => {
              e.preventDefault();
              sessionStorage.setItem('selectedRecipeId', ing.subRecipeId);
              window.location.href = 'recipeEditor.html';
            });
            span.appendChild(link);

            // optional / parenthetical
            const bits = [];
            if (ing.parentheticalNote) bits.push(ing.parentheticalNote);
            if (ing.isOptional) bits.push('optional');
            if (bits.length > 0) {
              span.appendChild(
                document.createTextNode(` (${bits.join(', ')})`)
              );
            }
          } else {
            // normal ingredient fallback
            const recipeText = formatIngredientLine(ing);
            span.textContent = composeDisplayText(
              recipeText,
              locDebug,
              measureDebug
            );
          }

          line.appendChild(span);
          container.appendChild(line);
        });
      }
    });
  }

  // --- You will need section ---
  const allIngredients = recipe.sections.flatMap((sec) => sec.ingredients);
  if (allIngredients.length) {
    // 🔹 Create wrapper card
    const needWrapper = document.createElement('div');
    needWrapper.className = 'you-will-need-card';
    container.appendChild(needWrapper);

    // Header inside the card
    const needHeader = document.createElement('div');
    needHeader.className = 'section-header';
    needHeader.textContent = 'You will need';
    needWrapper.appendChild(needHeader);

    const grouped = {};
    allIngredients.forEach((ing) => {
      const loc = ing.locationAtHome || '';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(ing);
    });

    // Merge duplicates by ingredient
    Object.keys(grouped).forEach((loc) => {
      grouped[loc] = mergeByIngredient(grouped[loc]);
    });

    // Iterate through locations in defined order
    NEED_LOCATION_ORDER.forEach((loc) => {
      const hasKey = Object.prototype.hasOwnProperty.call(grouped, loc);
      const items = hasKey ? grouped[loc] : [];
      if (!items || items.length === 0) return;

      if (loc) {
        const locHeader = document.createElement('div');
        locHeader.className = 'subsection-header';
        locHeader.textContent = capitalizeWords(loc);
        needWrapper.appendChild(locHeader);
      } else {
        const miscHeader = document.createElement('div');
        miscHeader.className = 'subsection-header';
        miscHeader.textContent = 'Misc';
        needWrapper.appendChild(miscHeader);
      }

      sortIngredients(items, NEED_LOCATION_ORDER).forEach((ing) => {
        const line = document.createElement('div');
        line.className = 'ingredient-line';
        const span = document.createElement('span');
        const recipeText = formatNeedLine(ing);
        const locDebug = debugTag(ing, 'need');
        const measureDebug = measureDebugTag(ing, items);
        span.textContent = composeDisplayText(
          recipeText,
          locDebug,
          measureDebug
        );
        line.appendChild(span);
        needWrapper.appendChild(line);
      });
    });

    // --- Measures section (INSIDE card) ---
    const measures = computeMeasures(allIngredients);
    if (measures.length) {
      const measureHeader = document.createElement('div');
      measureHeader.className = 'subsection-header';
      measureHeader.textContent = 'Measures';
      needWrapper.appendChild(measureHeader);

      measures.forEach((m) => {
        const line = document.createElement('div');
        line.className = 'ingredient-line';
        const span = document.createElement('span');
        span.textContent = m;
        line.appendChild(span);
        needWrapper.appendChild(line);
      });
    }
  }

  // --- Instructions section ---
  if (recipe.sections.some((sec) => sec.steps.length)) {
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
          container.appendChild(subHeader);
        }

        section.steps.forEach((step, index) => {
          const instr = document.createElement('div');
          instr.className = 'instruction-line numbered';

          const num = document.createElement('span');
          num.className = 'step-num';
          num.textContent = index + 1 + '.';

          const text = document.createElement('span');
          text.className = 'step-text';
          text.textContent = step.instructions;

          // ✅ Always set stepId (safe cast to string)
          text.dataset.stepId = String(step.ID);

          instr.appendChild(num);
          instr.appendChild(text);
          container.appendChild(instr);
        });
      }
    });
  }

  const stepContainer = document.getElementById('recipeView');
  setupStepReordering(stepContainer, window.dbInstance, window.recipeId);
}

// --- Helpers ---
function capitalizeWords(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Compute Measures ---
function computeMeasures(ingredients) {
  const found = new Set();

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

  function addDryCup(qtyNum) {
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
      if (Math.abs(qtyNum - measures[m]) < 0.01) {
        found.add(m);
        return;
      }
      if (qtyNum < measures[m]) {
        found.add(m);
        return;
      }
    }
  }

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
      }
      const unitMeasures = ['1 tbsp', '½ tbsp'];
      for (const m of unitMeasures) {
        while (remaining + 1e-6 >= measures[m]) {
          found.add(m);
          remaining -= measures[m];
        }
      }
    } else if (unit.includes('cup')) {
      const qtyNum = Number(qty);
      function chooseLiquidMeasure(qtyCups) {
        if (qtyCups <= 1.25) return '1 cup';
        if (qtyCups <= 2.5) return '2 cup';
        if (qtyCups <= 5.5) return '4 cup';
        return '8 cup';
      }
      if (qtyNum <= 1.25) {
        addDryCup(qtyNum);
      } else {
        const mainVessel = chooseLiquidMeasure(qtyNum);
        found.add(mainVessel);
        const mainSize = measures[mainVessel];
        const remainder = qtyNum % mainSize;
        if (remainder > 0 && remainder < 1.25) {
          addDryCup(remainder);
        }
      }
    }
  }

  ingredients.forEach((ing) => {
    if (!ing.unit || !ing.quantity) return;
    const qty = ing.quantity;
    const unit = ing.unit.toLowerCase();
    const loc = (ing.locationAtHome || '').toLowerCase();
    const name = ing.name.toLowerCase();
    const isLiquid =
      (loc && ['fridge', 'above fridge'].includes(loc)) ||
      ['water', 'broth', 'sauce', 'oil', 'vinegar', 'juice'].some((w) =>
        name.includes(w)
      );
    decompose(qty, unit, isLiquid);
  });

  return MEASURE_ORDER.filter((m) => found.has(m));
}
