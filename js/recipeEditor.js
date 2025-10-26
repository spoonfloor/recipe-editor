console.log('✅ recipeEditor.js loaded at', new Date().toISOString());

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

// --- Shared helper: clear any selected instruction line ---
function clearSelectedStep() {
  document
    .querySelectorAll('.instruction-line.selected')
    .forEach((el) => el.classList.remove('selected'));
  // 🧠 Optional: reset global tracking
  window.activeStep = null;
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
  // ✅ Prefer fresh nested sections for restore (supports refactored structure)
  const restoreSource = window.recipeData?.sections
    ? JSON.parse(JSON.stringify(window.recipeData))
    : window.recipeData;

  renderRecipe(restoreSource);

  // Clean up selection and UI state
  if (window.getSelection) window.getSelection().removeAllRanges();
  clearSelectedStep();
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

//
//
//
//
//
//

// --- Save / Cancel Integration (Option A: robust fix) ---
const saveBtn = document.getElementById('editorActionBtn');
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    if (!isDirty) return;

    console.log('💾 Saving changes...');
    try {
      const savedRecipe = await saveRecipeToDB();
      console.log('✅ Changes saved to DB');

      // ✨ Persist SQL.js memory to disk (Electron or browser fallback)
      const binaryArray = window.dbInstance.export();
      const isElectron = !!window.electronAPI;
      if (isElectron) {
        const ok = await window.electronAPI.saveDB(binaryArray, {
          // pre-overwrite backup + write
          overwriteOnly: false,
        });

        if (ok) alert('Database saved successfully.');
        else alert('Save failed — check console for details.');
      } else {
        const blob = new Blob([binaryArray], {
          type: 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'favorite_eats_updated.sqlite';
        a.click();
        URL.revokeObjectURL(url);
      }

      //
      //
      //

      if (savedRecipe) {
        console.log(
          '🔄 Reloading full recipe from DB after save (via bridge)...'
        );
        const refreshed = bridge.loadRecipeFromDB(
          window.dbInstance,
          window.recipeId
        );
        window.recipeData = JSON.parse(JSON.stringify(refreshed));
        renderRecipe(window.recipeData);
        console.log('🧠 Snapshot updated with full reload via bridge');
      }

      //
      //
      //

      isDirty = false;
      cancelBtn.disabled = true;
      disableSave();
      clearSelectedStep(); // 🧹 remove highlight after save
    } catch (err) {
      console.error('❌ Save failed:', err);
    }
  });
}

async function saveRecipeToDB() {
  // Delegate to the bridge, which now owns all DB write logic
  const db = window.dbInstance;
  const recipe = window.recipeData;

  bridge.saveRecipeToDB(db, recipe);

  // Re-read from DB to return a fully refreshed object
  return bridge.loadRecipeFromDB(db, window.recipeId);
}

//
//
//
//

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

  // helper: update visible numbers after reorder
  function renumberSteps() {
    const allSteps = container.querySelectorAll('.instruction-line.numbered');
    allSteps.forEach((line, idx) => {
      const num = line.querySelector('.step-num');
      if (num) num.textContent = `${idx + 1}.`;
    });
  }

  // keyboard handler
  document.addEventListener('keydown', (e) => {
    if (!activeStep) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const moveUp = e.key === 'ArrowUp';
      const sibling = moveUp
        ? activeStep.previousElementSibling
        : activeStep.nextElementSibling;

      if (sibling && sibling.classList.contains('instruction-line')) {
        if (moveUp) container.insertBefore(activeStep, sibling);
        else container.insertBefore(sibling, activeStep);

        // 🔹 immediately update numbers
        renumberSteps();

        // 🔹 Update in-memory database ordering (safe fallback)
        if (db && (recipeId || window.recipeData?.id)) {
          const realRecipeId = recipeId || window.recipeData.id;
          const allSteps = Array.from(
            container.querySelectorAll('.instruction-line.numbered .step-text')
          );

          allSteps.forEach((stepTextEl, index) => {
            const newOrder = index + 1;
            const newText = stepTextEl.textContent;
            const stepId = stepTextEl.dataset.stepId;

            if (!stepId) {
              console.warn(
                '⚠️ Skipping update — missing stepId for:',
                stepTextEl
              );
              return;
            }

            db.run(
              `UPDATE recipe_steps 
                 SET step_number = ?, instructions = ? 
                 WHERE recipe_id = ? AND ID = ?;`,
              [newOrder, newText, realRecipeId, stepId]
            );
          });
        }

        // ✅ Always flag dirty state, even if no DB write occurred
        markDirty();
      }
    }
  });
}

// --- You Will Need helpers (restored) ---
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

function sortIngredients(list, locationOrder = INGREDIENTS_LOCATION_ORDER) {
  return [...list].sort((a, b) => {
    const aLoc = a.locationAtHome || '';
    const bLoc = b.locationAtHome || '';
    const locIndexA = locationOrder.indexOf(aLoc);
    const locIndexB = locationOrder.indexOf(bLoc);
    if (locIndexA !== locIndexB) return locIndexA - locIndexB;

    if (a.isOptional !== b.isOptional) return a.isOptional ? 1 : -1;

    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);

    const varA = a.variant ? a.variant.toLowerCase() : '';
    const varB = b.variant ? b.variant.toLowerCase() : '';
    return varA.localeCompare(varB);
  });
}

function mergeByIngredient(list) {
  const merged = [];
  const map = new Map();

  list.forEach((ing) => {
    const key = `${ing.variant || ''}|${ing.name}|${ing.locationAtHome || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...ing });
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

// --- Main render function (bridge edition: safe, data-driven, backward compatible) ---
function renderRecipe(recipe) {
  console.log('🧩 renderRecipe called with:', recipe);

  // Keep a deep copy for cancel/revert
  window.recipeData = JSON.parse(JSON.stringify(recipe));

  // --- Bridge normalization: make sure we have a usable recipe.steps array
  if (!recipe.steps && Array.isArray(recipe.sections)) {
    // Find any section that actually has steps
    const instructionSection = recipe.sections.find(
      (s) => Array.isArray(s.steps) && s.steps.length > 0
    );

    if (instructionSection) {
      console.log(
        `🧱 Bridge normalization: found steps in section "${
          instructionSection.name || '(unnamed)'
        }"`
      );

      recipe.steps = instructionSection.steps.map((s) => ({
        id: s.ID || s.id,
        instructions: s.instructions,
        step_number: s.step_number,
      }));
    } else {
      console.warn(
        '⚠️ Bridge: no section with steps found, rendering fallback view'
      );
    }
  }

  // --- Clear & rebuild container
  const container = document.getElementById('recipeView');
  container.innerHTML = `
    <div id="ingredientsSection"></div>
    <div id="stepsSection">
      <h2 class="section-header">Instructions</h2>
    </div>
  `;

  // ✅ Define these right away so inserts can safely reference them
  const ingredientsSection = container.querySelector('#ingredientsSection');
  const stepsSection = container.querySelector('#stepsSection');

  // ✅ Optional: render servings info
  if (recipe.servingsDefault) {
    const servingsLine = document.createElement('div');
    servingsLine.className = 'servings-line';
    servingsLine.textContent = `Serves ${recipe.servingsDefault}`;
    const ingredientsSection = container.querySelector('#ingredientsSection');
    ingredientsSection.appendChild(servingsLine);
  }

  if (recipe.sections && recipe.sections.length > 0) {
    const ingredientsHeader = document.createElement('h2');
    ingredientsHeader.className = 'section-header';
    ingredientsHeader.textContent = 'Ingredients';
    const ingredientsSection = container.querySelector('#ingredientsSection');
    ingredientsSection.appendChild(ingredientsHeader);

    // Flatten all ingredients across sections
    const allIngredients = recipe.sections.flatMap((s) => s.ingredients || []);
    allIngredients.forEach((ing) => {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');

      // Build display like "¾ cup pine nuts"
      const qty =
        ing.quantity && !isNaN(parseFloat(ing.quantity))
          ? decimalToFractionDisplay(parseFloat(ing.quantity)) + ' '
          : ing.quantity
          ? ing.quantity + ' '
          : '';

      const unit = ing.unit ? ing.unit + ' ' : '';
      const name = ing.name || '';

      span.textContent = `${qty || ''}${unit || ''}${name}`;
      line.appendChild(span);
      ingredientsSection.appendChild(line);
    });
  }

  // --- You will need section (restored) ---
  const allIngredients = recipe.sections.flatMap((s) => s.ingredients || []);
  if (allIngredients.length > 0) {
    const needWrapper = document.createElement('div');
    needWrapper.className = 'you-will-need-card';
    container.insertBefore(needWrapper, stepsSection); // appears between ingredients and instructions
    const needHeader = document.createElement('h2');
    needHeader.className = 'section-header';
    needHeader.textContent = 'You will need';
    needWrapper.appendChild(needHeader);

    // Group by location
    const grouped = {};
    allIngredients.forEach((ing) => {
      const loc = ing.locationAtHome || '';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(ing);
    });

    // Merge duplicates
    Object.keys(grouped).forEach((loc) => {
      grouped[loc] = mergeByIngredient(grouped[loc]);
    });

    // Render by NEED_LOCATION_ORDER
    NEED_LOCATION_ORDER.forEach((loc) => {
      const items = grouped[loc];
      if (!items || !items.length) return;

      const subHeader = document.createElement('div');
      subHeader.className = 'subsection-header';
      subHeader.textContent = loc ? capitalizeWords(loc) : 'Misc';
      needWrapper.appendChild(subHeader);

      sortIngredients(items, NEED_LOCATION_ORDER).forEach((ing) => {
        const line = document.createElement('div');
        line.className = 'ingredient-line';
        const span = document.createElement('span');
        span.textContent = formatNeedLine(ing);
        line.appendChild(span);
        needWrapper.appendChild(line);
      });
    });

    // --- Measures section ---
    const measures = computeMeasures(allIngredients);
    if (measures.length > 0) {
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

  // ✅ Render steps (instructions)
  if (recipe.steps && recipe.steps.length > 0) {
    recipe.steps.forEach((step, i) => {
      const line = document.createElement('div');
      line.className = 'instruction-line numbered';
      line.innerHTML = `
        <span class="step-num">${i + 1}.</span>
        <span class="step-text" data-step-id="${step.id}">
          ${step.instructions}
        </span>
      `;
      stepsSection.appendChild(line);
    });

    // ✅ Enable reordering
    setupStepReordering(stepsSection, window.db, recipe.id);
  } else {
    const noSteps = document.createElement('div');
    noSteps.className = 'empty-state';
    noSteps.textContent = 'No instructions found.';
    stepsSection.appendChild(noSteps);
  }

  // --- Log summary for debugging
  console.log(
    `📋 Rendered recipe: ${recipe.title || 'Untitled'} — ${
      recipe.steps ? recipe.steps.length : 0
    } steps`
  );
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
