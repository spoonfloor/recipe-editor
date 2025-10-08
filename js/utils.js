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
