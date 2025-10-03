// Utility functions

/**
 * Round a number to the nearest fraction denominator
 * @param {number} value
 * @param {number} denominator
 * @returns {number}
 */
function roundToFraction(value, denominator = 8) {
  return Math.round(value * denominator) / denominator;
}

/**
 * Convert a decimal to a fractional display string using Unicode glyphs
 * (e.g., 1.5 -> "1½", 0.25 -> "¼")
 * @param {number} value
 * @param {number} denominator
 * @returns {string}
 */
function decimalToFractionDisplay(value, denominator = 8) {
  const rounded = roundToFraction(value, denominator);
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const fractionMap = {
    1: '⅛',
    2: '¼',
    3: '⅜',
    4: '½',
    5: '⅝',
    6: '¾',
    7: '⅞',
  };
  const fracGlyph = fractionMap[Math.round(fraction * denominator)] || '';
  if (whole === 0 && fracGlyph) return fracGlyph;
  return fracGlyph ? `${whole}${fracGlyph}` : `${whole}`;
}

/**
 * Make a span element editable on click
 * Dynamically replaces it with an input, inheriting the font
 * @param {HTMLElement} span
 * @param {'qty'|'text'} type
 */
function makeEditable(span, type) {
  span.addEventListener('click', () => {
    const input = document.createElement('input');

    // Configure input type and initial value
    if (type === 'qty') {
      input.type = 'number';
      input.step = '0.01';
      input.value = span.dataset.value || span.textContent;
    } else {
      input.type = 'text';
      input.value = span.textContent;
    }

    // Ensure font and size inherit from parent
    input.style.fontFamily = 'inherit';
    input.style.fontSize = 'inherit';
    input.style.lineHeight = 'inherit';
    input.style.width = `${span.offsetWidth + 10}px`;
    input.className = 'inline-input';

    // Replace span with input
    span.replaceWith(input);
    input.focus();
    input.select();

    // Commit changes back to the span
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
