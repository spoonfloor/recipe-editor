// Utility functions

function roundToFraction(value, denominator = 8) {
  return Math.round(value * denominator) / denominator;
}

function decimalToFractionDisplay(value, denominator = 8) {
  const rounded = roundToFraction(value, denominator);
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const fractionMap = {1:'⅛',2:'¼',3:'⅜',4:'½',5:'⅝',6:'¾',7:'⅞'};
  const fracGlyph = fractionMap[Math.round(fraction*denominator)] || '';
  if(whole === 0 && fracGlyph) return fracGlyph;
  return fracGlyph ? `${whole}${fracGlyph}` : `${whole}`;
}

function makeEditable(span, type) {
  span.addEventListener('click', () => {
    let input = document.createElement('input');
    if(type==='qty') {
      input.type = 'number';
      input.step = "0.01";
      input.value = span.dataset.value || span.textContent;
    } else {
      input.type = 'text';
      input.value = span.textContent;
    }
    span.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      if(type==='qty') {
        const val = parseFloat(input.value) || 0;
        span.textContent = decimalToFractionDisplay(val);
        span.dataset.value = val;
      } else {
        span.textContent = input.value;
      }
      input.replaceWith(span);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { if(e.key==='Enter') commit(); });
  });
}
