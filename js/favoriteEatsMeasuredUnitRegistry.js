/**
 * favoriteEatsMeasuredUnitRegistry — canonical measured-unit codes, aliases, and families.
 *
 * Invariant: `oz` is mass (weight ounce); `floz` / `fl oz` is volume (fluid ounce).
 * Ladders (cup↔tsp display, shopping ceil) stay in quantityDisplayPolicy.js.
 */
(function initFavoriteEatsMeasuredUnitRegistry(global) {
  if (!global) return;

  const MEASURED_UNIT_META = Object.freeze({
    tsp: Object.freeze({
      family: 'volume',
      baseUnit: 'ml',
      factor: 4.92892159375,
    }),
    tbsp: Object.freeze({
      family: 'volume',
      baseUnit: 'ml',
      factor: 14.78676478125,
    }),
    cup: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 236.5882365 }),
    'fl oz': Object.freeze({
      family: 'volume',
      baseUnit: 'ml',
      factor: 29.5735295625,
    }),
    pt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 473.176473 }),
    qt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 946.352946 }),
    gal: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 3785.411784 }),
    ml: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1 }),
    l: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1000 }),
    g: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1 }),
    kg: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1000 }),
    oz: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 28.349523125 }),
    lb: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 453.59237 }),
  });

  const MEASURED_UNIT_ALIASES = Object.freeze({
    t: 'tsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tb: 'tbsp',
    tbl: 'tbsp',
    tbspn: 'tbsp',
    tbs: 'tbsp',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    c: 'cup',
    cup: 'cup',
    cups: 'cup',
    floz: 'fl oz',
    'fl oz': 'fl oz',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    fluidounce: 'fl oz',
    fluidounces: 'fl oz',
    pt: 'pt',
    pint: 'pt',
    pints: 'pt',
    qt: 'qt',
    quart: 'qt',
    quarts: 'qt',
    gal: 'gal',
    gallon: 'gal',
    gallons: 'gal',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    l: 'l',
    liter: 'l',
    liters: 'l',
    g: 'g',
    gram: 'g',
    grams: 'g',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    oz: 'oz',
    ounce: 'oz',
    ounces: 'oz',
    lb: 'lb',
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
  });

  function normalizeMeasuredUnitRaw(unitText) {
    return String(unitText || '')
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ');
  }

  function normalizeMeasuredUnit(unitText) {
    const raw = normalizeMeasuredUnitRaw(unitText);
    if (!raw) return '';
    if (Object.prototype.hasOwnProperty.call(MEASURED_UNIT_ALIASES, raw)) {
      return MEASURED_UNIT_ALIASES[raw];
    }
    if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
    if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
    if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
    return raw;
  }

  function getMeasuredUnitMetaByCanonical(canonical) {
    const code = String(canonical || '').trim();
    if (!code) return null;
    return MEASURED_UNIT_META[code] || null;
  }

  function getMeasuredUnitMeta(unitText) {
    const canonical = normalizeMeasuredUnit(unitText);
    if (!canonical) return null;
    return getMeasuredUnitMetaByCanonical(canonical);
  }

  function getMagnitudeMeta(unitText) {
    const canonical = normalizeMeasuredUnit(unitText);
    if (!canonical) return null;
    const meta = getMeasuredUnitMetaByCanonical(canonical);
    if (!meta) return null;
    return Object.freeze({ family: meta.family, baseAmount: meta.factor });
  }

  function convertQuantityToMeasuredBase(quantity, unitText) {
    const numeric = Number(quantity);
    const canonical = normalizeMeasuredUnit(unitText);
    if (!canonical || !Number.isFinite(numeric) || numeric <= 0) return null;
    const meta = getMeasuredUnitMetaByCanonical(canonical);
    if (!meta) return null;
    return {
      unit: canonical,
      family: meta.family,
      baseUnit: meta.baseUnit,
      baseQuantity: Number((numeric * meta.factor).toFixed(6)),
    };
  }

  /** Ambiguous mass code — show "weight" in picker/list UX only (not floz). */
  function isOzWeightUnitCode(unitCode) {
    return normalizeMeasuredUnitRaw(unitCode) === 'oz';
  }

  function formatUnitTypeaheadLabel(unitCode) {
    const code = String(unitCode || '').trim();
    if (!code) return '';
    const hint = getUnitCatalogListHint(code);
    return hint ? `${code} ${hint}` : code;
  }

  function getUnitCatalogListHint(unitCode) {
    return isOzWeightUnitCode(unitCode) ? '(weight)' : '';
  }

  function renderUnitTypeaheadItem(rowEl, unitCode) {
    const code = String(unitCode || '').trim();
    if (!rowEl || !code) return;
    rowEl.textContent = '';
    rowEl.append(document.createTextNode(code));
    const hint = getUnitCatalogListHint(code);
    if (!hint) return;
    rowEl.append(document.createTextNode(' '));
    const hintEl = document.createElement('span');
    hintEl.className = 'catalog-unit-list-hint';
    hintEl.textContent = hint;
    rowEl.append(hintEl);
  }

  global.favoriteEatsMeasuredUnitRegistry = Object.freeze({
    MEASURED_UNIT_META,
    MEASURED_UNIT_ALIASES,
    normalizeMeasuredUnit,
    getMeasuredUnitMeta,
    getMeasuredUnitMetaByCanonical,
    getMagnitudeMeta,
    convertQuantityToMeasuredBase,
    formatUnitTypeaheadLabel,
    getUnitCatalogListHint,
    renderUnitTypeaheadItem,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
