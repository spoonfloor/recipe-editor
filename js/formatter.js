function formatRecipe(db, recipeId) {
  // --- Load recipe title ---
  const recipeTitleQuery = db.exec(
    `SELECT title FROM recipes WHERE ID=${recipeId};`
  );
  const title =
    recipeTitleQuery.length > 0 ? recipeTitleQuery[0].values[0][0] : 'Untitled';

  // --- Load sections ---
  const sectionsQuery = db.exec(
    `SELECT ID, name FROM recipe_sections WHERE recipe_id=${recipeId} ORDER BY sort_order;`
  );
  const recipeSections =
    sectionsQuery.length > 0 ? sectionsQuery[0].values : [];

  const sections = recipeSections.map(([sectionId, sectionName]) => {
    // Ingredients
    const ingQuery = db.exec(
      `SELECT rim.quantity, rim.unit, i.name
       FROM recipe_ingredient_map rim
       JOIN ingredients i ON rim.ingredient_id = i.ID
       WHERE rim.recipe_id=${recipeId} AND rim.section_id=${sectionId};`
    );
    const ingredients =
      ingQuery.length > 0
        ? ingQuery[0].values.map(([qty, unit, name]) => ({
            quantity: parseFloat(qty) || qty,
            unit: unit || '',
            name,
          }))
        : [];

    // Steps
    const stepsQuery = db.exec(
      `SELECT instructions
       FROM recipe_steps
       WHERE recipe_id=${recipeId} AND section_id=${sectionId}
       ORDER BY step_number;`
    );
    const steps =
      stepsQuery.length > 0 ? stepsQuery[0].values.map((r) => r[0]) : [];

    return { name: sectionName, ingredients, steps };
  });

  return { title, sections };
}

// ✅ Expose globally so main.js can use it without import
window.formatRecipe = formatRecipe;
