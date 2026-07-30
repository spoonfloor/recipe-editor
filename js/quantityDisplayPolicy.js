/**
 * Measured mass/volume display ladders (shopping vs cooking) and helpers
 * for unit-editor scalar snapping / previews. Loaded before main.js.
 */
(function () {
  const MEASURED_DISPLAY_LADDER_EPS = 1e-9;
  /** Tolerates ml rounding from convertIngredientQuantityToMeasuredBase (toFixed(6)). */
  const MEASURED_BASE_CONVERSION_SLACK = 1e-6;
  const MEASURED_LB_SHOPPING_CEIL_SLACK = 1e-7;
  const MEASURED_UNIT_FACTORS = Object.freeze({
    tsp: 4.92892159375,
    tbsp: 14.78676478125,
    cup: 236.5882365,
    gal: 3785.411784,
    lb: 453.59237,
  });
  const MEASURED_LB_PER_GRAM = 1 / MEASURED_UNIT_FACTORS.lb;
  const MEASURED_FINE_LB_FRACS = Object.freeze([
    0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75,
  ]);
  const MEASURED_COARSE_CUP_FRACS = Object.freeze([0, 1 / 3, 0.5, 2 / 3]);
  const METRIC_MASS_KG_THRESHOLD_G = 1000;
  const METRIC_VOLUME_L_THRESHOLD_ML = 1000;
  const METRIC_LARGE_UNIT_STEP = 0.1;
  /** Below this (in g or ml): whole-number display. */
  const METRIC_SMALL_WHOLE_THRESHOLD = 20;
  const METRIC_MEDIUM_STEP = 5;

  function snapMetricDisplayQuantity(value, step, isShopping) {
    const v = Number(value);
    const s = Number(step);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return null;
    const snapped = isShopping
      ? measuredDisplayCeilStep(v, s)
      : measuredDisplayRoundStep(v, s);
    if (snapped == null || !Number.isFinite(snapped) || snapped <= 0) {
      return isShopping ? s : Math.max(s, 1);
    }
    if (!isShopping && step === 1 && snapped < 1) {
      return 1;
    }
    return snapped;
  }

  function measuredMetricDisplayFromBase(
    baseQuantity,
    smallUnit,
    largeUnit,
    kgOrLThreshold,
    isShopping,
  ) {
    const numeric = Number(baseQuantity);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (numeric >= kgOrLThreshold - MEASURED_DISPLAY_LADDER_EPS) {
      const largeRaw = numeric / kgOrLThreshold;
      const quantity = snapMetricDisplayQuantity(
        largeRaw,
        METRIC_LARGE_UNIT_STEP,
        isShopping,
      );
      if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
      const unit = largeUnit;
      return {
        family: smallUnit === 'g' ? 'mass' : 'volume',
        quantity,
        unit,
        displayLabel: formatMetricDisplayLabel(quantity, unit),
      };
    }
    if (numeric < METRIC_SMALL_WHOLE_THRESHOLD - MEASURED_DISPLAY_LADDER_EPS) {
      const quantity = snapMetricDisplayQuantity(numeric, 1, isShopping);
      if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        family: smallUnit === 'g' ? 'mass' : 'volume',
        quantity,
        unit: smallUnit,
        displayLabel: formatMetricDisplayLabel(quantity, smallUnit),
      };
    }
    const quantity = snapMetricDisplayQuantity(numeric, METRIC_MEDIUM_STEP, isShopping);
    if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      family: smallUnit === 'g' ? 'mass' : 'volume',
      quantity,
      unit: smallUnit,
      displayLabel: formatMetricDisplayLabel(quantity, smallUnit),
    };
  }

  function measuredUnitRegistry() {
    return typeof window !== 'undefined' ? window.favoriteEatsMeasuredUnitRegistry : null;
  }

  function normalizeMeasuredIngredientUnit(unitText) {
    const reg = measuredUnitRegistry();
    if (reg && typeof reg.normalizeMeasuredUnit === 'function') {
      return reg.normalizeMeasuredUnit(unitText);
    }
    return String(unitText || '').trim();
  }

  function measuredIngredientMetaForCanonical(canonical) {
    const reg = measuredUnitRegistry();
    if (!reg || typeof reg.getMeasuredUnitMetaByCanonical !== 'function') return null;
    const meta = reg.getMeasuredUnitMetaByCanonical(canonical);
    if (!meta) return null;
    if (meta.family === 'mass') {
      return { family: 'mass', factorToG: meta.factor };
    }
    return { family: 'volume', factorToMl: meta.factor };
  }

  /**
   * @returns {{ family: 'mass'|'volume', baseQuantity: number, canonicalUnit: string }|null}
   *   mass → grams, volume → ml
   */
  function convertIngredientQuantityToMeasuredBase(quantity, unitText) {
    const numeric = Number(quantity);
    const canonical = normalizeMeasuredIngredientUnit(unitText);
    if (!canonical || !Number.isFinite(numeric) || numeric <= 0) return null;
    const meta = measuredIngredientMetaForCanonical(canonical);
    if (!meta) return null;
    if (meta.family === 'mass') {
      return {
        family: 'mass',
        baseQuantity: Number((numeric * meta.factorToG).toFixed(6)),
        canonicalUnit: canonical,
      };
    }
    return {
      family: 'volume',
      baseQuantity: Number((numeric * meta.factorToMl).toFixed(6)),
      canonicalUnit: canonical,
    };
  }

  function measuredDisplayCeilStep(value, step) {
    const v = Number(value);
    const s = Number(step);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return null;
    return Math.ceil(v / s - MEASURED_DISPLAY_LADDER_EPS) * s;
  }

  function measuredDisplayRoundStep(value, step) {
    const v = Number(value);
    const s = Number(step);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return null;
    return Math.round(v / s) * s;
  }

  function measuredDisplayNormalizeOut(family, quantity, unit) {
    if (!Number.isFinite(quantity) || quantity <= 0 || !unit) return null;
    return {
      family,
      quantity: Number(quantity.toFixed(6)),
      unit,
    };
  }

  function measuredFineLbShoppingCeil(W) {
    let best = Infinity;
    for (let n = 1; n <= 4; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < 1 - MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v > 4 + MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v >= W - MEASURED_LB_SHOPPING_CEIL_SLACK && v < best) best = v;
      }
    }
    return Number.isFinite(best) && best < Infinity ? best : null;
  }

  function measuredFineLbCookingNearest(W) {
    let best = null;
    let bestErr = Infinity;
    for (let n = 0; n <= 12; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < 1 - MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v > 10 + MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - W);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  function measuredMassDisplayShopping(grams) {
    const W = grams * MEASURED_LB_PER_GRAM;
    if (!Number.isFinite(W) || W <= 0) return null;
    if (W < 1 - MEASURED_DISPLAY_LADDER_EPS) {
      const oz = measuredDisplayCeilStep(W * 16, 1);
      return measuredDisplayNormalizeOut('mass', oz, 'oz');
    }
    if (W <= 4 + MEASURED_DISPLAY_LADDER_EPS) {
      const lb = measuredFineLbShoppingCeil(W);
      if (lb == null) return null;
      return measuredDisplayNormalizeOut('mass', lb, 'lb');
    }
    const lb = measuredDisplayCeilStep(W, 0.5);
    return measuredDisplayNormalizeOut('mass', lb, 'lb');
  }

  function measuredMassDisplayCooking(grams) {
    const W = grams * MEASURED_LB_PER_GRAM;
    if (!Number.isFinite(W) || W <= 0) return null;
    if (W < 1 - MEASURED_DISPLAY_LADDER_EPS) {
      const oz = measuredDisplayRoundStep(W * 16, 1);
      const ozClamped = !Number.isFinite(oz) || oz <= 0 ? 1 : oz;
      return measuredDisplayNormalizeOut('mass', ozClamped, 'oz');
    }
    if (W <= 10 + MEASURED_DISPLAY_LADDER_EPS) {
      const lb = measuredFineLbCookingNearest(W);
      if (lb == null) return null;
      return measuredDisplayNormalizeOut('mass', lb, 'lb');
    }
    const lb = measuredDisplayRoundStep(W, 0.5);
    return measuredDisplayNormalizeOut('mass', lb, 'lb');
  }

  function measuredVolumeDisplayShopping(ml) {
    const ladder = window.favoriteEatsCookingVolumeLadder;
    if (!ladder || typeof ladder.getMeasuredDisplayFromMl !== 'function') {
      return null;
    }
    return ladder.getMeasuredDisplayFromMl(ml, undefined, 'shopping');
  }

  function measuredNearestMixedCup(cups, fracs, minN, maxN) {
    let best = null;
    let bestErr = Infinity;
    for (let n = minN; n <= maxN; n += 1) {
      for (let fi = 0; fi < fracs.length; fi += 1) {
        const f = fracs[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - cups);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  // Unified volume ladder: js/cookingVolumeLadder.js (cooking nearest / shopping ceil).
  // Legacy band ladder: js/legacy/measuredVolumeDisplayCooking.js (unhooked)

  function measuredVolumeDisplayCooking(ml, sourceUnit) {
    const ladder = window.favoriteEatsCookingVolumeLadder;
    if (!ladder || typeof ladder.getMeasuredDisplayFromMl !== 'function') {
      return null;
    }
    return ladder.getMeasuredDisplayFromMl(ml, sourceUnit, 'cooking');
  }

  function formatMetricDisplayLabel(quantity, unit) {
    const u = String(unit || '').trim();
    if (u === 'g' || u === 'ml') {
      return `${Math.round(quantity)} ${u}`;
    }
    if (u === 'kg' || u === 'l') {
      return `${Number(quantity).toFixed(1)} ${u}`;
    }
    return '';
  }

  function measuredMassDisplayMetricShopping(grams) {
    return measuredMetricDisplayFromBase(
      grams,
      'g',
      'kg',
      METRIC_MASS_KG_THRESHOLD_G,
      true,
    );
  }

  function measuredMassDisplayMetricCooking(grams) {
    return measuredMetricDisplayFromBase(
      grams,
      'g',
      'kg',
      METRIC_MASS_KG_THRESHOLD_G,
      false,
    );
  }

  function measuredVolumeDisplayMetricShopping(ml) {
    return measuredMetricDisplayFromBase(
      ml,
      'ml',
      'l',
      METRIC_VOLUME_L_THRESHOLD_ML,
      true,
    );
  }

  function measuredVolumeDisplayMetricCooking(ml) {
    return measuredMetricDisplayFromBase(
      ml,
      'ml',
      'l',
      METRIC_VOLUME_L_THRESHOLD_ML,
      false,
    );
  }

  function resolveMeasuredDisplayOptions(options) {
    if (!options || typeof options !== 'object') return { useMetric: false };
    return { useMetric: !!options.useMetric };
  }

  function getMeasuredDisplayFromBase(
    family,
    baseQuantity,
    intent = 'cooking',
    sourceUnit,
    options,
  ) {
    const numeric = Number(baseQuantity);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const mode = String(intent || 'cooking').toLowerCase();
    const isShopping = mode === 'shopping';
    const { useMetric } = resolveMeasuredDisplayOptions(options);
    if (useMetric) {
      if (family === 'mass') {
        return isShopping
          ? measuredMassDisplayMetricShopping(numeric)
          : measuredMassDisplayMetricCooking(numeric);
      }
      if (family === 'volume') {
        return isShopping
          ? measuredVolumeDisplayMetricShopping(numeric)
          : measuredVolumeDisplayMetricCooking(numeric);
      }
      return null;
    }
    if (family === 'mass') {
      return isShopping
        ? measuredMassDisplayShopping(numeric)
        : measuredMassDisplayCooking(numeric);
    }
    if (family === 'volume') {
      return isShopping
        ? measuredVolumeDisplayShopping(numeric)
        : measuredVolumeDisplayCooking(numeric, sourceUnit);
    }
    return null;
  }

  function getShoppingListMeasuredDisplayFromBase(family, baseQuantity, options) {
    return getMeasuredDisplayFromBase(family, baseQuantity, 'shopping', undefined, options);
  }

  function nearestOnFineQ3Scalar(x) {
    const W = Number(x);
    if (!Number.isFinite(W) || W <= 0) return null;
    let best = null;
    let bestErr = Infinity;
    const maxN = Math.ceil(W) + 4;
    for (let n = 0; n <= maxN; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        const err = Math.abs(v - W);
        if (
          best == null ||
          err < bestErr - 1e-12 ||
          (Math.abs(err - bestErr) <= 1e-12 && v < best)
        ) {
          best = v;
          bestErr = err;
        }
      }
    }
    return best;
  }

  /**
   * Cooking display snap for count-like / generic scalar amounts (not mass/volume ladders).
   * @param {number} amount
   * @param {number} stepDenominator 1 | 2 | 3 | 4 | 8 | 12 (12 = ¼∪⅓ grid)
   */
  function snapScalarCookingNearest(amount, stepDenominator) {
    const n = Number(amount);
    const d = Number(stepDenominator);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (d === 12) return nearestOnFineQ3Scalar(n);
    if (![1, 2, 3, 4, 8].includes(d)) return null;
    const fmt = window.favoriteEatsUnitQuantityFormat;
    if (fmt && typeof fmt.roundQuantityWithGrid === 'function') {
      return fmt.roundQuantityWithGrid(n, d, 'nearest');
    }
    return measuredDisplayRoundStep(n, 1 / d);
  }

  function fineQ3GridShoppingCeil(W) {
    let best = Infinity;
    const maxN = Math.ceil(W) + 6;
    for (let n = 0; n <= maxN; n += 1) {
      for (let fi = 0; fi < MEASURED_FINE_LB_FRACS.length; fi += 1) {
        const f = MEASURED_FINE_LB_FRACS[fi];
        const v = n + f;
        if (v < MEASURED_DISPLAY_LADDER_EPS) continue;
        if (v + MEASURED_DISPLAY_LADDER_EPS >= W && v < best) best = v;
      }
    }
    return Number.isFinite(best) && best < Infinity ? best : null;
  }

  /**
   * Shopping display snap (ceil on step grid) for count-like scalars.
   * @param {number} amount
   * @param {number} stepDenominator 1 | 2 | 3 | 4 | 8 | 12
   */
  function snapScalarShoppingCeil(amount, stepDenominator) {
    const n = Number(amount);
    const d = Number(stepDenominator);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (d === 12) {
      const v = fineQ3GridShoppingCeil(n);
      return v;
    }
    if (![1, 2, 3, 4, 8].includes(d)) return null;
    const step = 1 / d;
    const out = measuredDisplayCeilStep(n, step);
    if (out == null || !Number.isFinite(out) || out <= 0) return step;
    return out;
  }

  function gridDenominatorForStepSelect(stepDenom) {
    const d = Number(stepDenom);
    if (d === 12) return 12;
    if ([1, 2, 3, 4, 8].includes(d)) return d;
    return 8;
  }

  function formatGlyphForAmount(amount, stepDenom) {
    const kit = window.favoriteEatsAmountKit;
    if (kit && typeof kit.formatScalarForStep === 'function') {
      return kit.formatScalarForStep(amount, stepDenom);
    }
    const fmt = window.favoriteEatsUnitQuantityFormat;
    const gridD = gridDenominatorForStepSelect(stepDenom);
    if (fmt && typeof fmt.formatQuantityOnGridGlyphs === 'function') {
      const g = fmt.formatQuantityOnGridGlyphs(Number(amount), gridD);
      return g || String(Number(amount.toFixed(3)));
    }
    return String(Number(amount.toFixed(3)));
  }

  /**
   * Preview addends use 1×, 7×, 13× the step atom (e.g. step 8 → ⅛ + …).
   * Step 12 ("¼ & ⅓") uses ¼-sized addends so every term sits on the fine union grid
   * (never twelfth-based copy).
   * @param {object} opts
   * @param {number} opts.stepDenominator 1 | 2 | 3 | 4 | 8 | 12
   * @param {string} opts.singular
   * @param {string} opts.plural
   */
  const UNIT_EDITOR_DISPLAY_PREVIEW_AMOUNTS = Object.freeze([
    0.4, 0.667, 1.111, 1.375, 2.499, 3.7,
  ]);

  function formatUnitEditorPreviewSourceAmount(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return '—';
    let text = numeric.toFixed(3);
    if (text.includes('.')) {
      text = text.replace(/0+$/, '').replace(/\.$/, '');
    }
    return text || '0';
  }

  function snapUnitEditorPreviewGlyph(amount, stepDenominator, intent) {
    const step = Number(stepDenominator);
    if (![1, 2, 3, 4, 8, 12].includes(step)) return '—';
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return '—';
    const mode = String(intent || 'cooking').toLowerCase();
    const snapped =
      mode === 'shopping'
        ? snapScalarShoppingCeil(numeric, step)
        : snapScalarCookingNearest(numeric, step);
    if (snapped == null || !Number.isFinite(snapped) || snapped <= 0) return '—';
    const glyph = formatGlyphForAmount(snapped, step);
    return glyph ? String(glyph).trim() : '—';
  }

  /**
   * Fixed SOT amounts → recipe (nearest) / shopping (ceil) glyphs for unit-editor preview.
   * @param {{ stepDenominator?: number }} opts
   */
  function buildUnitEditorDisplayPreviewChart(opts) {
    const stepDenom = Number(opts?.stepDenominator) || 8;
    const step = [1, 2, 3, 4, 8, 12].includes(stepDenom) ? stepDenom : 8;
    const rows = UNIT_EDITOR_DISPLAY_PREVIEW_AMOUNTS.slice()
      .sort((a, b) => a - b)
      .map((amount) => ({
        amount: formatUnitEditorPreviewSourceAmount(amount),
        recipe: snapUnitEditorPreviewGlyph(amount, step, 'cooking'),
        shopping: snapUnitEditorPreviewGlyph(amount, step, 'shopping'),
      }));
    return { rows };
  }

  function buildUnitEditorExampleTotals(opts) {
    const stepDenom = Number(opts?.stepDenominator) || 8;
    const singular = String(opts?.singular || 'unit').trim() || 'unit';
    const plural = String(opts?.plural || singular).trim() || singular;
    const coeffs = [1, 7, 13];
    const d = [1, 2, 3, 4, 8, 12].includes(stepDenom) ? stepDenom : 8;
    const baseUnit = stepDenom === 12 ? 0.25 : 1 / d;
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
      return { lines: [], sum: 0, sumGlyph: '', error: 'bad step' };
    }
    const parts = coeffs.map((c) => c * baseUnit);
    const sum = parts.reduce((a, b) => a + b, 0);
    const snapped = snapScalarCookingNearest(sum, stepDenom);
    const sumGlyph =
      snapped != null && Number.isFinite(snapped)
        ? formatGlyphForAmount(snapped, stepDenom)
        : '—';
    const lines = coeffs.map((c, i) => {
      const amt = parts[i];
      const label = c === 1 ? singular : plural;
      const glyph = formatGlyphForAmount(amt, stepDenom);
      return `${glyph} ${label}`;
    });
    const joined = lines.join(' + ');
    return {
      lines,
      joined,
      sum,
      sumGlyph,
      summary: `${joined} → ${sumGlyph} ${plural}`,
    };
  }

  window.favoriteEatsQuantityDisplayPolicy = {
    getMeasuredDisplayFromBase,
    getShoppingListMeasuredDisplayFromBase,
    snapScalarCookingNearest,
    snapScalarShoppingCeil,
    formatGlyphForAmount,
    buildUnitEditorExampleTotals,
    buildUnitEditorDisplayPreviewChart,
    normalizeMeasuredIngredientUnit,
    convertIngredientQuantityToMeasuredBase,
  };
})();
