function formatRecipe(db, recipeId) {
  // Title + Servings
  const recipeTitleQuery = db.exec(
    `SELECT title, servings_default, servings_min, servings_max FROM recipes WHERE ID=${recipeId};`
  );
  let title = 'Untitled';
  let servingsDefault = null;
  let servingsMin = null;
  let servingsMax = null;
  if (recipeTitleQuery.length) {
    const row = recipeTitleQuery[0].values[0];
    title = row[0];
    servingsDefault = row[1];
    servingsMin = row[2];
    servingsMax = row[3];
  }

  // Sections (may be empty)
  const sectionsQuery = db.exec(
    `SELECT ID, name FROM recipe_sections WHERE recipe_id=${recipeId} ORDER BY sort_order;`
  );
  const sectionRows = sectionsQuery.length ? sectionsQuery[0].values : [];

  // Helpers
  function loadIngredients(whereClause) {
    const q = db.exec(
      `
      SELECT rim.ID,
             rim.quantity,
             rim.unit,
             i.name,
             i.variant,
             rim.prep_notes,
             rim.is_optional,
             i.parenthetical_note,
             i.location_at_home
      FROM recipe_ingredient_map rim
      JOIN ingredients i ON rim.ingredient_id = i.ID
      WHERE rim.recipe_id=${recipeId} AND ${whereClause}
      ORDER BY rim.ID;
      `
    );

    if (!q.length) return [];

    return q[0].values.map(
      ([
        rimId,
        qty,
        unit,
        name,
        variant,
        prepNotes,
        isOptional,
        parentheticalNote,
        locationAtHome,
      ]) => {
        // Fetch substitutes for this ingredient
        const subsQ = db.exec(
          `SELECT r.quantity,
                  r.unit,
                  i.name,
                  i.variant
           FROM recipe_ingredient_substitutes r
           JOIN ingredients i ON r.ingredient_id = i.ID
           WHERE r.recipe_ingredient_id=${rimId};`
        );

        const substitutes = subsQ.length
          ? subsQ[0].values.map(([sQty, sUnit, sName, sVariant]) => ({
              quantity: parseFloat(sQty) || sQty,
              unit: sUnit || '',
              name: sName,
              variant: sVariant || '',
            }))
          : [];

        // 🔍 Try to find a matching recipe title
        const searchTerm = [variant, name].filter(Boolean).join(' ');
        const subRecipeQ = db.exec(
          `SELECT ID FROM recipes 
   WHERE LOWER(title) LIKE LOWER('%${searchTerm.replace(/'/g, "''")}%') 
   LIMIT 1;`
        );
        const subRecipeId = subRecipeQ.length
          ? subRecipeQ[0].values[0][0]
          : null;

        return {
          quantity: parseFloat(qty) || qty,
          unit: unit || '',
          name,
          variant: variant || '',
          prepNotes: prepNotes || '',
          parentheticalNote: parentheticalNote || '',
          isOptional: !!isOptional,
          substitutes,
          locationAtHome: locationAtHome ? locationAtHome.toLowerCase() : '',
          subRecipeId, // add the field (can be null)
        };
      }
    );
  }

  function loadSteps(whereClause) {
    const q = db.exec(
      `SELECT instructions
       FROM recipe_steps
       WHERE recipe_id=${recipeId} AND ${whereClause}
       ORDER BY step_number;`
    );
    return q.length ? q[0].values.map((r) => r[0]) : [];
  }

  // Build sections
  let sections = sectionRows.map(([id, name]) => ({
    name,
    contexts: [],
    ingredients: loadIngredients(`rim.section_id=${id}`),
    steps: loadSteps(`section_id=${id}`),
  }));

  // Fallback for global (no-section) items
  const globalIngredients = loadIngredients(`rim.section_id IS NULL`);
  const globalSteps = loadSteps(`section_id IS NULL`);
  if (globalIngredients.length || globalSteps.length) {
    sections = [
      {
        name: null,
        contexts: [],
        ingredients: globalIngredients,
        steps: globalSteps,
      },
      ...sections,
    ];
  }

  return {
    title,
    servings: {
      default: servingsDefault,
      min: servingsMin,
      max: servingsMax,
    },
    servingsDefault, // ← ✅ add this line
    sections,
  };
}

window.formatRecipe = formatRecipe;
