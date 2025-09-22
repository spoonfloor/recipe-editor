// Ingredient editor

function renderIngredient(line) {
  const div = document.createElement('div');
  div.className = 'ingredient-line';
  div.dataset.quantity = line.quantity;
  div.dataset.unit = line.unit;
  div.dataset.name = line.name;

  const qtySpan = document.createElement('span');
  qtySpan.className = 'qty-span';
  qtySpan.textContent = decimalToFractionDisplay(line.quantity);
  qtySpan.dataset.value = line.quantity;

  const unitSpan = document.createElement('span');
  unitSpan.className = 'unit-span';
  unitSpan.textContent = line.unit;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name-span';
  nameSpan.textContent = line.name;

  div.appendChild(qtySpan);
  div.appendChild(unitSpan);
  div.appendChild(nameSpan);

  makeEditable(qtySpan, 'qty');
  makeEditable(unitSpan, 'text');
  makeEditable(nameSpan, 'text');

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
