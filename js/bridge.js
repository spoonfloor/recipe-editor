// bridge.js
// A single place for translating between the SQL.js database and in-memory objects.

window.bridge = { loadRecipeFromDB, saveRecipeToDB };

/**
 * Load a recipe and all its pieces from the database into a full JS object.
 */
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

  //
  //
  //

  // --- Load steps, assigning them to sections when possible
  const allStepsQ = db.exec(`
  SELECT ID, section_id, step_number, instructions
  FROM recipe_steps
  WHERE recipe_id = ${id}
  ORDER BY step_number;
`);
  const allSteps = allStepsQ.length
    ? allStepsQ[0].values.map(
        ([ID, section_id, step_number, instructions]) => ({
          ID,
          section_id,
          step_number,
          instructions,
        })
      )
    : [];

  // Group by section_id (including null)
  const sectionMap = new Map(sections.map((s) => [s.ID, { ...s, steps: [] }]));
  const unsectioned = [];

  for (const step of allSteps) {
    const target = sectionMap.get(step.section_id);
    if (target) target.steps.push(step);
    else unsectioned.push(step);
  }

  const sectionsWithSteps = [...sectionMap.values()];

  // Add fallback section for any unsectioned steps
  if (unsectioned.length) {
    sectionsWithSteps.unshift({ name: '(unnamed)', steps: unsectioned });
  }

  //
  //
  //

  // --- Fallback for recipes without sections
  if (sectionsWithSteps.length === 0) {
    const stepsQ = db.exec(`
      SELECT ID, step_number, instructions
      FROM recipe_steps
      WHERE recipe_id = ${id}
      ORDER BY step_number;
    `);
    const steps = stepsQ.length
      ? stepsQ[0].values.map(([ID, step_number, instructions]) => ({
          ID,
          step_number,
          instructions,
        }))
      : [];
    sectionsWithSteps.push({ name: '(unnamed)', steps });
  }

  const recipe = {
    id,
    title,
    servings: { default: servingsDefault, min: servingsMin, max: servingsMax },
    sections: sectionsWithSteps,
  };

  console.log(`🧩 bridge.loadRecipeFromDB →`, recipe);
  return recipe;
}

/**
 * Persist the in-memory recipe object back into SQL.js.
 */

//
//
//

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
