// bridge.js
// A single place for translating between the SQL.js database and in-memory objects.

window.bridge = { loadRecipeFromDB, saveRecipeToDB };

// Load a recipe and all its pieces from the database into a full JS object.
function loadRecipeFromDB(db, recipeId) {
  const recipeRows = db.exec(`
    SELECT ID, title, servings_default, servings_min, servings_max
    FROM recipes WHERE ID = ${recipeId};
  `);
  if (!recipeRows.length) return null;

  const [id, title, servingsDefault, servingsMin, servingsMax] =
    recipeRows[0].values[0];
  // --- Load sections
  const sectionsQ = db.exec(`
    SELECT ID, name
    FROM recipe_sections
    WHERE recipe_id = ${id}
    ORDER BY sort_order;
  `);
  const sections = sectionsQ.length
    ? sectionsQ[0].values.map(([ID, name]) => ({ ID, name }))
    : [];

  // --- Load steps
  const stepsQ = db.exec(`
    SELECT ID, section_id, step_number, instructions
    FROM recipe_steps
    WHERE recipe_id = ${id}
    ORDER BY step_number;
  `);
  const steps = stepsQ.length
    ? stepsQ[0].values.map(([ID, section_id, step_number, instructions]) => ({
        ID,
        section_id,
        step_number,
        instructions,
      }))
    : [];

  // --- Load ingredients (borrowed from formatter)
  const ingredientsQ = db.exec(`
    SELECT rim.ID, rim.section_id, rim.quantity, rim.unit,
           i.name, i.variant, rim.prep_notes,
           rim.is_optional, i.parenthetical_note, i.location_at_home
    FROM recipe_ingredient_map rim
    JOIN ingredients i ON rim.ingredient_id = i.ID
    WHERE rim.recipe_id = ${id}
    ORDER BY rim.ID;
  `);

  const ingredients = ingredientsQ.length
    ? ingredientsQ[0].values.map(
        ([
          rimId,
          section_id,
          qty,
          unit,
          name,
          variant,
          prepNotes,
          isOptional,
          parentheticalNote,
          locationAtHome,
        ]) => ({
          rimId,
          section_id,
          quantity: isNaN(parseFloat(qty)) ? qty : parseFloat(qty),

          unit: unit || '',
          name,
          variant: variant || '',
          prepNotes: prepNotes || '',
          isOptional: !!isOptional,
          parentheticalNote: parentheticalNote || '',
          locationAtHome: locationAtHome ? locationAtHome.toLowerCase() : '',
        })
      )
    : [];

  // --- Group steps + ingredients by section
  const sectionMap = new Map(
    sections.map((s) => [s.ID, { ...s, steps: [], ingredients: [] }])
  );
  const unsectioned = { steps: [], ingredients: [] };

  for (const step of steps) {
    const target = sectionMap.get(step.section_id);
    (target ? target.steps : unsectioned.steps).push(step);
  }

  for (const ing of ingredients) {
    const target = sectionMap.get(ing.section_id);
    (target ? target.ingredients : unsectioned.ingredients).push(ing);
  }

  const sectionsWithContent = [...sectionMap.values()];
  if (unsectioned.steps.length || unsectioned.ingredients.length) {
    sectionsWithContent.unshift({ name: '(unnamed)', ...unsectioned });
  }

  const recipe = {
    id,
    title,
    servings: { default: servingsDefault, min: servingsMin, max: servingsMax },
    sections: sectionsWithContent,
  };

  console.log(`🧩 bridge.loadRecipeFromDB (enhanced) →`, recipe);
  return recipe;
}

function saveRecipeToDB(db, recipe) {
  const activeDb = db || window.dbInstance;
  if (!activeDb) throw new Error('No active database found');

  const stepNodes = document.querySelectorAll(
    '.instruction-line.numbered .step-text'
  );
  stepNodes.forEach((stepTextEl, index) => {
    const newOrder = index + 1;
    const newText = stepTextEl.textContent.trim();
    const stepId = stepTextEl.dataset.stepId;
    if (!stepId) return;
    activeDb.run(
      `UPDATE recipe_steps
         SET step_number = ?, instructions = ?
       WHERE ID = ?;`,
      [newOrder, newText, stepId]
    );
  });

  console.log(
    `💾 bridge.saveRecipeToDB → updated ${stepNodes.length} steps from DOM`
  );
}
