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

  textSpan.textContent = groupText;

  // Save raw quantity separately for editing
  textSpan.dataset.rawQuantity = line.quantity || '';

  makeEditable(textSpan, 'text');
  div.appendChild(textSpan);
  return div;
}

function makeEditable(span, type) {
  span.addEventListener('click', () => {
    const input = document.createElement('input');

    if (type === 'qty') {
      input.type = 'number';
      input.step = '0.01';
      input.value = span.dataset.value || span.textContent;
    } else {
      input.type = 'text';
      input.value = span.textContent;
    }

    input.style.width = `${span.offsetWidth + 10}px`;
    input.className = 'inline-input';

    span.replaceWith(input);
    input.focus();
    input.select();

    input.addEventListener('input', () => {
      const tmp = document.createElement('span');
      tmp.style.visibility = 'hidden';
      tmp.style.position = 'absolute';
      tmp.style.font = window.getComputedStyle(input).font;
      tmp.textContent = input.value || ' ';
      document.body.appendChild(tmp);
      input.style.width = tmp.offsetWidth + 12 + 'px';
      document.body.removeChild(tmp);
    });

    function commit() {
      if (type === 'qty') {
        const val = parseFloat(input.value) || 0;
        span.textContent = decimalToFractionDisplay(val);
        span.dataset.value = val;
      } else {
        span.textContent = input.value;
      }
      input.replaceWith(span);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });
  });
}
