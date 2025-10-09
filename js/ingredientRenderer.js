// Ingredient editor

function renderIngredient(line) {
  const div = document.createElement('div');
  div.className = 'ingredient-line';
  div.dataset.quantity = line.quantity;
  div.dataset.unit = line.unit;
  div.dataset.name = line.name;

  const textSpan = document.createElement('span');
  textSpan.className = 'ingredient-text';

  // Show quantity as fraction if numeric
  let qtyDisplay = line.quantity;
  if (!isNaN(parseFloat(line.quantity))) {
    qtyDisplay = decimalToFractionDisplay(parseFloat(line.quantity));
  }

  // --- Build base name (variant + name) ---
  let baseName;
  if (line.variant) {
    baseName = `${line.variant} ${line.name}`.trim();
  } else {
    baseName = line.name;
  }

  // --- Decide if quantity is numeric or free-text ---
  const isNumericQty = !isNaN(parseFloat(line.quantity));

  let mainText;
  if (isNumericQty && line.quantity !== '') {
    // Handle pluralization of unit
    let unitText = line.unit || '';
    const numericVal = parseFloat(line.quantity);

    // U.S. cookbook style: abbreviations (tsp, tbsp, cup, oz, lb, etc.) never pluralize
    // Only pluralize if it's a long-form unit word (e.g., "teaspoon" → "teaspoons")
    if (unitText && numericVal && numericVal !== 1) {
      const abbrevUnits = [
        'tsp',
        'tbsp',
        'cup',
        'oz',
        'lb',
        'pt',
        'qt',
        'gal',
        'ml',
        'l',
        'g',
        'kg',
      ];
      if (
        !abbrevUnits.includes(unitText.toLowerCase()) &&
        !unitText.endsWith('s')
      ) {
        unitText = unitText + 's';
      }
    }
    mainText = [qtyDisplay, unitText, baseName].filter(Boolean).join(' ');
  } else if (line.quantity) {
    // Free-text quantity like "to taste" or "as needed"
    mainText = [line.prepNotes, baseName, line.quantity]
      .filter(Boolean)
      .join(' ');
    // Clear prepNotes so we don’t repeat it later
    line.prepNotes = '';
  } else {
    mainText = [line.unit, baseName].filter(Boolean).join(' ');
  }

  // --- Append prep notes (if still left) ---
  if (line.prepNotes) {
    mainText += `, ${line.prepNotes}`;
  }

  // --- Handle substitutes (join with " or ") ---
  let groupText = mainText;
  if (line.substitutes && line.substitutes.length > 0) {
    const subsText = line.substitutes.map((sub) => {
      const subBase = sub.variant
        ? `${sub.variant} ${sub.name}`.trim()
        : sub.name;
      return [sub.quantity, sub.unit, subBase].filter(Boolean).join(' ');
    });
    groupText += ' or ' + subsText.join(' or ');
  }

  // --- Build parenthetical collector (AFTER group) ---
  let parenBits = [];
  if (line.parentheticalNote) parenBits.push(line.parentheticalNote);
  if (line.isOptional) parenBits.push('optional');
  if (parenBits.length > 0) {
    groupText += ` (${parenBits.join(', ')})`;
  }

  // ✅ Add precise logs to see which path runs and what DOM gets built
  if (line.subRecipeId) {
    // clickable link only for "variant + name"
    const link = document.createElement('a');
    link.href = '#';
    link.classList.add('sub-recipe-link');
    link.textContent = baseName;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openRecipe) {
        window.openRecipe(line.subRecipeId);
      } else {
        console.warn('openRecipe not available');
      }
    });

    // Build DOM explicitly, never reusing groupText
    if (line.quantity && !isNaN(parseFloat(line.quantity))) {
      textSpan.appendChild(
        document.createTextNode(
          decimalToFractionDisplay(parseFloat(line.quantity)) + ' '
        )
      );
    } else if (line.quantity) {
      textSpan.appendChild(document.createTextNode(line.quantity + ' '));
    }

    if (line.unit) {
      textSpan.appendChild(document.createTextNode(line.unit + ' '));
    }

    // clickable part = baseName only
    textSpan.appendChild(link);

    if (line.prepNotes) {
      textSpan.appendChild(document.createTextNode(', ' + line.prepNotes));
    }

    if (line.substitutes && line.substitutes.length > 0) {
      const subsText = line.substitutes.map((sub) => {
        const subBase = sub.variant
          ? `${sub.variant} ${sub.name}`.trim()
          : sub.name;
        return [sub.quantity, sub.unit, subBase].filter(Boolean).join(' ');
      });
      textSpan.appendChild(
        document.createTextNode(' or ' + subsText.join(' or '))
      );
    }

    if (line.parentheticalNote || line.isOptional) {
      const bits = [];
      if (line.parentheticalNote) bits.push(line.parentheticalNote);
      if (line.isOptional) bits.push('optional');
      textSpan.appendChild(document.createTextNode(` (${bits.join(', ')})`));
    }
  } else {
    // fallback for normal ingredients
    textSpan.textContent = groupText;

    // 🔍 Also log fallback DOM
  }

  // Save raw quantity separately for editing
  textSpan.dataset.rawQuantity = line.quantity || '';

  div.appendChild(textSpan);
  return div;
}
