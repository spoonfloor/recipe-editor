(function initIngredientDisplay(globalScope) {
  const root = globalScope || {};
  const EPSILON = 1e-9;

  function toPositiveNumberOrNull(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function parseQuantityToken(token) {
    if (typeof root.parseNumericQuantityValue === 'function') {
      return root.parseNumericQuantityValue(token);
    }
    if (token == null) return null;
    const raw = String(token).trim();
    if (!raw) return null;

    const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (
        Number.isFinite(whole) &&
        Number.isFinite(num) &&
        Number.isFinite(den) &&
        den > 0
      ) {
        return whole + num / den;
      }
      return null;
    }

    const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const num = Number(fraction[1]);
      const den = Number(fraction[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return num / den;
      }
      return null;
    }

    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function formatNumericDisplay(value) {
    if (typeof root.decimalToFractionDisplay === 'function') {
      const formatted = root.decimalToFractionDisplay(value);
      if (formatted) return formatted;
    }
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (typeof root.prettifyDisplayText === 'function') {
      return root.prettifyDisplayText(raw);
    }
    return raw;
  }

  function getIngredientNameText(line, nounQuantity) {
    const fallbackName = [String(line?.variant || '').trim(), String(line?.name || '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (typeof root.getIngredientDisplayName !== 'function') return fallbackName;

    try {
      const computed = root.getIngredientDisplayName({
        ...(line || {}),
        quantity: nounQuantity,
      });
      return String(computed || '').trim() || fallbackName;
    } catch (_) {
      return fallbackName;
    }
  }

  /** Resolve unit singular/plural metadata from the Supabase data-service unit list. */
  let unitsMetaServiceMap = null;
  let unitsMetaServiceLoadPromise = null;
  let unitlessQuantityPolicy = null;
  let unitlessQuantityPolicyLoadPromise = null;

  function metaFromListUnitsContractRow(row) {
    return {
      code: String(row && row.code != null ? row.code : '').trim(),
      name_singular: String(row && row.nameSingular != null ? row.nameSingular : '').trim(),
      name_plural: String(row && row.namePlural != null ? row.namePlural : '').trim(),
      category: String(row && row.category != null ? row.category : '').trim(),
      quantityRoundingPreset: String(
        row && row.quantityRoundingPreset != null ? row.quantityRoundingPreset : '',
      )
        .trim()
        .toLowerCase(),
      quantityRoundingStepDenominator: (() => {
        if (row?.quantityRoundingStepDenominator == null) return null;
        const n = Number(row.quantityRoundingStepDenominator);
        return Number.isFinite(n) ? n : null;
      })(),
      quantityRoundingMode: String(
        row && row.quantityRoundingMode != null ? row.quantityRoundingMode : '',
      )
        .trim()
        .toLowerCase(),
    };
  }

  function categoryKey(meta) {
    return String(meta?.category ?? '').trim().toLowerCase();
  }

  function presetKey(meta) {
    return String(
      meta?.quantityRoundingPreset ?? meta?.quantity_rounding_preset ?? '',
    )
      .trim()
      .toLowerCase();
  }

  function stepDenomFromMeta(meta) {
    const d = Number(
      meta?.quantityRoundingStepDenominator ??
        meta?.quantity_rounding_step_denominator,
    );
    return [1, 2, 3, 4, 8, 12].includes(d) ? d : null;
  }

  /**
   * Step denominator for catalog "flexible" scalar snap, or null to leave raw display.
   * Mass/volume + `system_measured` → null (measured ladders elsewhere).
   * Non-measured + `system_measured` → 1 (same rounding as whole-number / step 1).
   */
  function resolveCatalogSnapStep(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const cat = categoryKey(meta);
    const preset = presetKey(meta);
    const isMeasured = cat === 'mass' || cat === 'volume';

    if (isMeasured) {
      if (preset === 'system_measured') return null;
      if (preset === 'custom') return stepDenomFromMeta(meta);
      return null;
    }

    if (preset === 'system_measured') return 1;
    if (preset === 'custom') return stepDenomFromMeta(meta);

    const fixedMap = {
      nearest_eighth: 8,
      nearest_quarter: 4,
      nearest_half: 2,
      nearest_whole: 1,
    };
    return fixedMap[preset] ?? null;
  }

  function snapScalarForCatalogIntent(value, stepDenom, intent) {
    const pol = root.favoriteEatsQuantityDisplayPolicy;
    if (!pol) return null;
    const mode = String(intent || 'cooking').toLowerCase();
    if (mode === 'shopping') {
      return typeof pol.snapScalarShoppingCeil === 'function'
        ? pol.snapScalarShoppingCeil(value, stepDenom)
        : null;
    }
    return typeof pol.snapScalarCookingNearest === 'function'
      ? pol.snapScalarCookingNearest(value, stepDenom)
      : null;
  }

  /** Kitchen default when a typed unit has no catalog metadata. */
  const DEFAULT_SCALAR_SNAP_STEP = 8;
  /** Unitless item default: half-step count display. */
  const DEFAULT_UNITLESS_SCALAR_SNAP_STEP = 2;

  function normalizeUnitlessQuantityPolicy(policy) {
    const source = policy && typeof policy === 'object' ? policy : {};
    const rawStep = Number(
      source.quantityRoundingStepDenominator ??
        source.quantity_rounding_step_denominator,
    );
    return {
      useSystemDefault:
        source.useSystemDefault !== false && source.use_system_default !== false,
      quantityRoundingStepDenominator: [1, 2, 3, 4, 8, 12].includes(rawStep)
        ? rawStep
        : DEFAULT_UNITLESS_SCALAR_SNAP_STEP,
    };
  }

  function getUnitlessScalarSnapStep() {
    if (unitlessQuantityPolicy === null) {
      void ensureUnitlessQuantityPolicyLoaded();
    }
    const policy = normalizeUnitlessQuantityPolicy(unitlessQuantityPolicy);
    return policy.useSystemDefault
      ? DEFAULT_UNITLESS_SCALAR_SNAP_STEP
      : policy.quantityRoundingStepDenominator;
  }

  async function ensureUnitlessQuantityPolicyLoaded() {
    if (
      !root.dataService ||
      typeof root.dataService.loadUnitlessQuantityPolicy !== 'function' ||
      !root.dataService.useSupabase
    ) {
      return;
    }
    if (unitlessQuantityPolicy !== null) return;
    if (!unitlessQuantityPolicyLoadPromise) {
      unitlessQuantityPolicyLoadPromise = (async () => {
        try {
          unitlessQuantityPolicy = normalizeUnitlessQuantityPolicy(
            await root.dataService.loadUnitlessQuantityPolicy(),
          );
        } catch (err) {
          console.error('ingredientDisplay: loadUnitlessQuantityPolicy failed:', err);
          unitlessQuantityPolicy = normalizeUnitlessQuantityPolicy(null);
        } finally {
          unitlessQuantityPolicyLoadPromise = null;
        }
      })();
    }
    await unitlessQuantityPolicyLoadPromise;
  }

  /**
   * Snap + format one positive scalar for display (measured ladder, then catalog grid).
   * @returns {{ quantityFmt: string, displayValue: number, measuredDisplayUnit: string, amountIncludesUnit: boolean }|null}
   */
  function formatParsedScalarAmountDisplay(
    amount,
    unitText,
    meta,
    intent,
    displayToken,
    line,
    options,
  ) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    const ladder = trySystemMeasuredLadderDisplay(
      parsed,
      unitText,
      meta,
      intent,
      line,
      options,
    );
    if (ladder && (ladder.displayUnit || ladder.amountIncludesUnit)) {
      return {
        quantityFmt: ladder.quantityFmt,
        displayValue: ladder.displayValue,
        measuredDisplayUnit: String(ladder.displayUnit || '').trim(),
        amountIncludesUnit: Boolean(ladder.amountIncludesUnit),
      };
    }

    let stepDenom = resolveCatalogSnapStep(meta);
    if (stepDenom == null) {
      stepDenom = String(unitText || '').trim()
        ? DEFAULT_SCALAR_SNAP_STEP
        : getUnitlessScalarSnapStep();
    }

    let displayValue = parsed;
    const token =
      displayToken != null && String(displayToken).trim()
        ? displayToken
        : parsed;
    let quantityFmt = formatNumericDisplay(token);
    const snapped = snapScalarForCatalogIntent(parsed, stepDenom, intent);
    if (snapped != null && Number.isFinite(snapped) && snapped > 0) {
      displayValue = snapped;
      const pol = root.favoriteEatsQuantityDisplayPolicy;
      if (pol && typeof pol.formatGlyphForAmount === 'function') {
        const g = pol.formatGlyphForAmount(snapped, stepDenom);
        quantityFmt = g || formatNumericDisplay(String(snapped));
      } else {
        quantityFmt = formatNumericDisplay(String(snapped));
      }
    }

    return {
      quantityFmt,
      displayValue,
      measuredDisplayUnit: '',
      amountIncludesUnit: false,
    };
  }

  /**
   * Canonical measured mass/volume display (shopping vs cooking ladders).
   * Skips fractional-pound lines (&lt; 1 lb) so values like ¾ lb stay in lb, not oz.
   * @returns {{ quantityFmt: string, displayValue: number, displayUnit: string, amountIncludesUnit?: boolean }|null}
   */
  function lineUsesMetricDisplay(line, options) {
    if (options && options.useMetric != null) return !!options.useMetric;
    if (line && (line.useMetric ?? line.use_metric)) return true;
    if (typeof root.favoriteEatsCatalogLineUsesMetric === 'function') {
      return !!root.favoriteEatsCatalogLineUsesMetric(line);
    }
    return false;
  }

  function trySystemMeasuredLadderDisplay(parsed, unitTextRaw, meta, intent, line, options) {
    const cat = categoryKey(meta);
    const preset = presetKey(meta);
    if (
      meta &&
      ((cat !== 'mass' && cat !== 'volume') || preset === 'custom')
    ) {
      return null;
    }
    const pol = root.favoriteEatsQuantityDisplayPolicy;
    if (
      !pol ||
      typeof pol.convertIngredientQuantityToMeasuredBase !== 'function' ||
      typeof pol.getMeasuredDisplayFromBase !== 'function' ||
      typeof pol.normalizeMeasuredIngredientUnit !== 'function'
    ) {
      return null;
    }
    const unitRaw = String(unitTextRaw == null ? '' : unitTextRaw).trim();
    if (!unitRaw) return null;
    const conv = pol.convertIngredientQuantityToMeasuredBase(parsed, unitRaw);
    if (!conv) return null;
    const family = cat || conv.family;
    if (conv.family !== family) return null;
    const canonical = pol.normalizeMeasuredIngredientUnit(unitRaw);
    if (canonical === 'lb' && parsed < 1 - EPSILON) {
      return null;
    }
    const display = pol.getMeasuredDisplayFromBase(
      family,
      conv.baseQuantity,
      intent,
      conv.canonicalUnit || unitRaw,
      { useMetric: lineUsesMetricDisplay(line, options) },
    );
    if (!display || !Number.isFinite(display.quantity) || display.quantity <= 0) {
      return null;
    }
    const displayLabel = String(display.displayLabel || '').trim();
    if (displayLabel) {
      return {
        quantityFmt: displayLabel,
        displayValue: display.quantity,
        displayUnit: '',
        amountIncludesUnit: true,
      };
    }
    let quantityFmt = '';
    if (typeof root.decimalToFractionDisplay === 'function') {
      quantityFmt = String(root.decimalToFractionDisplay(display.quantity) || '').trim();
    }
    if (!quantityFmt) {
      quantityFmt = String(Number(display.quantity.toFixed(3)));
    }
    return {
      quantityFmt,
      displayValue: display.quantity,
      displayUnit: String(display.unit || '').trim(),
    };
  }

  async function ensureUnitsMetaLoadedFromDataService() {
    if (
      !root.dataService ||
      typeof root.dataService.listUnits !== 'function' ||
      !root.dataService.useSupabase
    ) {
      return;
    }
    if (unitsMetaServiceMap !== null) return;

    if (!unitsMetaServiceLoadPromise) {
      unitsMetaServiceLoadPromise = (async () => {
        try {
          const rows = await root.dataService.listUnits();
          const byCode = new Map();
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            const c = String(row && row.code != null ? row.code : '')
              .trim()
              .toLowerCase();
            if (!c) return;
            if (!byCode.has(c)) {
              const m = metaFromListUnitsContractRow(row);
              if (m.code || m.name_singular || m.name_plural) {
                byCode.set(c, m);
              }
            }
          });
          unitsMetaServiceMap = byCode;
        } catch (err) {
          console.error('ingredientDisplay: listUnits failed:', err);
          unitsMetaServiceMap = new Map();
        } finally {
          unitsMetaServiceLoadPromise = null;
        }
      })();
    }
    await unitsMetaServiceLoadPromise;
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('favoriteEats:db-updated', () => {
      unitsMetaServiceMap = null;
      unitsMetaServiceLoadPromise = null;
      unitlessQuantityPolicy = null;
      unitlessQuantityPolicyLoadPromise = null;
      if (
        root.dataService &&
        root.dataService.useSupabase &&
        typeof root.dataService.listUnits === 'function'
      ) {
        void ensureUnitsMetaLoadedFromDataService();
      }
      if (
        root.dataService &&
        root.dataService.useSupabase &&
        typeof root.dataService.loadUnitlessQuantityPolicy === 'function'
      ) {
        void ensureUnitlessQuantityPolicyLoaded();
      }
    });
  }

  if (
    root.dataService &&
    root.dataService.useSupabase &&
    typeof root.dataService.listUnits === 'function'
  ) {
    void ensureUnitsMetaLoadedFromDataService();
  }
  if (
    root.dataService &&
    root.dataService.useSupabase &&
    typeof root.dataService.loadUnitlessQuantityPolicy === 'function'
  ) {
    void ensureUnitlessQuantityPolicyLoaded();
  }

  function getDbBackedUnitMeta(codeLower) {
    const key = String(codeLower || '').trim().toLowerCase();
    if (!key) return null;
    if (root.dataService && root.dataService.useSupabase) {
      if (unitsMetaServiceMap instanceof Map) {
        if (unitsMetaServiceMap.has(key)) return unitsMetaServiceMap.get(key);
        return null;
      }
      void ensureUnitsMetaLoadedFromDataService();
    }
    return null;
  }

  function getUnitDisplay(unitText, numericVal) {
    const rawUnit = String(unitText || '').trim();
    if (!rawUnit) return '';

    const reg =
      root.favoriteEatsMeasuredUnitRegistry &&
      typeof root.favoriteEatsMeasuredUnitRegistry.normalizeMeasuredUnit === 'function'
        ? root.favoriteEatsMeasuredUnitRegistry
        : null;
    const canonicalUnit = reg ? reg.normalizeMeasuredUnit(rawUnit) : rawUnit;
    const codeLower = canonicalUnit.toLowerCase();
    const meta = resolveUnitMeta(codeLower);

    const unit = String(
      (meta && (meta.abbrev || meta.abbreviation || '')) || rawUnit
    ).trim();
    const singularLabel = String(
      (meta && (meta.name_singular || meta.name || '')) || ''
    ).trim();
    const pluralLabel = String(
      (meta && (meta.name_plural || meta.plural || '')) || ''
    ).trim();

    if (Number.isFinite(numericVal) && numericVal >= 2) {
      const abbrevUnits = [
        'tsp',
        'tbsp',
        'fl oz',
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

      if (abbrevUnits.includes(codeLower)) {
        return unit;
      }

      if (
        pluralLabel &&
        singularLabel &&
        rawUnit.toLowerCase() === singularLabel.toLowerCase()
      ) {
        return pluralLabel;
      }

      if (typeof root.pluralizeEnglishNoun === 'function') {
        return root.pluralizeEnglishNoun(unit);
      }

      if (!unit.endsWith('s')) {
        return unit + 's';
      }
    }

    return unit;
  }

  function resolveUnitMeta(unitText) {
    const codeLower = String(unitText || '').trim().toLowerCase();
    if (!codeLower) return null;
    let meta = null;
    if (root.unitsDisplayMap && root.unitsDisplayMap[codeLower]) {
      meta = root.unitsDisplayMap[codeLower];
    } else if (root.unitsMeta && root.unitsMeta[codeLower]) {
      meta = root.unitsMeta[codeLower];
    } else {
      meta = getDbBackedUnitMeta(codeLower);
    }
    return meta;
  }

  function getIngredientQuantityParts(line, options = {}) {
    const qMinRaw = toPositiveNumberOrNull(line?.quantityMin);
    const qMaxRaw = toPositiveNumberOrNull(line?.quantityMax);
    const qApprox = !!line?.quantityIsApprox;

    let quantityText = '';
    let numericValue = null;
    let nounQuantity = line?.quantity;
    let measuredDisplayUnit = null;
    let amountIncludesUnit = false;
    const intent = options?.intent === 'shopping' ? 'shopping' : 'cooking';

    if (qMinRaw != null || qMaxRaw != null) {
      const qMin = qMinRaw != null ? qMinRaw : qMaxRaw;
      const qMax = qMaxRaw != null ? qMaxRaw : qMinRaw;
      const same = qMin != null && qMax != null && Math.abs(qMin - qMax) < EPSILON;
      const meta = resolveUnitMeta(line?.unit);
      const minLadder =
        qMin != null
          ? trySystemMeasuredLadderDisplay(qMin, line?.unit, meta, intent, line, options)
          : null;
      const maxLadder =
        qMax != null
          ? trySystemMeasuredLadderDisplay(qMax, line?.unit, meta, intent, line, options)
          : null;
      const ladderUnitsMatch =
        minLadder &&
        maxLadder &&
        minLadder.displayUnit &&
        minLadder.displayUnit === maxLadder.displayUnit;
      const ladderLabelsMatch =
        minLadder &&
        maxLadder &&
        minLadder.amountIncludesUnit &&
        maxLadder.amountIncludesUnit;
      const canUseLadder = ladderUnitsMatch || ladderLabelsMatch;

      if (canUseLadder) {
        quantityText = same
          ? minLadder.quantityFmt
          : `${minLadder.quantityFmt} to ${maxLadder.quantityFmt}`;
        measuredDisplayUnit = ladderLabelsMatch ? '' : minLadder.displayUnit;
        amountIncludesUnit = Boolean(ladderLabelsMatch);
        numericValue = same ? minLadder.displayValue : maxLadder.displayValue;
        nounQuantity = maxLadder.displayValue;
      } else if (qMin != null && qMax != null) {
        const minFormatted = formatParsedScalarAmountDisplay(
          qMin,
          line?.unit,
          meta,
          intent,
          qMin,
          line,
          options,
        );
        const maxFormatted = formatParsedScalarAmountDisplay(
          qMax,
          line?.unit,
          meta,
          intent,
          qMax,
          line,
          options,
        );
        if (same && minFormatted) {
          quantityText = minFormatted.quantityFmt;
          numericValue = minFormatted.displayValue;
          nounQuantity = minFormatted.displayValue;
          measuredDisplayUnit = minFormatted.measuredDisplayUnit;
          amountIncludesUnit = minFormatted.amountIncludesUnit;
        } else if (minFormatted && maxFormatted) {
          quantityText = `${minFormatted.quantityFmt} to ${maxFormatted.quantityFmt}`;
          numericValue = maxFormatted.displayValue;
          nounQuantity = maxFormatted.displayValue;
          measuredDisplayUnit =
            minFormatted.measuredDisplayUnit &&
            minFormatted.measuredDisplayUnit === maxFormatted.measuredDisplayUnit
              ? minFormatted.measuredDisplayUnit
              : '';
          amountIncludesUnit =
            minFormatted.amountIncludesUnit && maxFormatted.amountIncludesUnit;
        } else {
          quantityText = same
            ? formatNumericDisplay(qMin)
            : `${formatNumericDisplay(qMin)} to ${formatNumericDisplay(qMax)}`;
          if (same) numericValue = qMin;
          nounQuantity = qMax != null ? qMax : qMin;
        }
      }

      if (qApprox && quantityText) quantityText = `about ${quantityText}`;
    } else {
      const rawQty = String(line?.quantity || '').trim();
      if (rawQty) {
        const approxMatch = rawQty.match(
          /^(about|approx(?:\.|imately)?|around|roughly|~)\s+/i
        );
        const approxPrefix = approxMatch ? 'about ' : '';
        const coreQty = approxMatch ? rawQty.slice(approxMatch[0].length).trim() : rawQty;
        const rangeMatch = coreQty.match(/^(.+?)\s*(?:to|-)\s*(.+)$/i);

        if (rangeMatch) {
          const left = parseQuantityToken(rangeMatch[1]);
          const right = parseQuantityToken(rangeMatch[2]);
          if (Number.isFinite(left) && left > 0 && Number.isFinite(right) && right > 0) {
            const meta = resolveUnitMeta(line?.unit);
            const leftFmt = formatParsedScalarAmountDisplay(
              left,
              line?.unit,
              meta,
              intent,
              rangeMatch[1],
              line,
              options,
            );
            const rightFmt = formatParsedScalarAmountDisplay(
              right,
              line?.unit,
              meta,
              intent,
              rangeMatch[2],
              line,
              options,
            );
            quantityText = leftFmt && rightFmt
              ? `${approxPrefix}${leftFmt.quantityFmt} to ${rightFmt.quantityFmt}`.trim()
              : `${approxPrefix}${formatNumericDisplay(rangeMatch[1])} to ${formatNumericDisplay(rangeMatch[2])}`.trim();
            if (rightFmt) {
              numericValue = rightFmt.displayValue;
              nounQuantity = rightFmt.displayValue;
            }
          } else {
            quantityText = rawQty;
          }
        } else {
          const parsed = parseQuantityToken(coreQty);
          if (Number.isFinite(parsed) && parsed > 0) {
            const meta = resolveUnitMeta(line?.unit);
            const formatted = formatParsedScalarAmountDisplay(
              parsed,
              line?.unit,
              meta,
              intent,
              coreQty,
              line,
              options,
            );
            if (formatted) {
              quantityText = `${approxPrefix}${formatted.quantityFmt}`.trim();
              numericValue = formatted.displayValue;
              nounQuantity = formatted.displayValue;
              measuredDisplayUnit = formatted.measuredDisplayUnit;
              amountIncludesUnit = formatted.amountIncludesUnit;
            } else {
              quantityText = rawQty;
            }
          } else {
            quantityText = rawQty;
          }
        }
      }
    }

    return {
      quantityText,
      numericValue,
      nounQuantity,
      measuredDisplayUnit,
      amountIncludesUnit,
    };
  }

  function getIngredientDisplayCoreParts(line, options = {}) {
    const quantityParts = getIngredientQuantityParts(line, options);
    const sizeText = String(line?.size || '').trim();
    const unitForDisplay = quantityParts.amountIncludesUnit
      ? ''
      : String(
          quantityParts.measuredDisplayUnit != null &&
            String(quantityParts.measuredDisplayUnit).trim()
            ? quantityParts.measuredDisplayUnit
            : line?.unit || '',
        ).trim();
    const unitText = unitForDisplay
      ? Number.isFinite(quantityParts.numericValue)
        ? getUnitDisplay(unitForDisplay, quantityParts.numericValue)
        : unitForDisplay
      : '';
    const amountUnitText = [sizeText, unitText].filter(Boolean).join(' ');
    const leadText = quantityParts.quantityText
      ? [quantityParts.quantityText, amountUnitText].filter(Boolean).join(' ')
      : amountUnitText;
    const nameText = getIngredientNameText(line, quantityParts.nounQuantity);
    const mainText = [leadText, nameText].filter(Boolean).join(' ').trim();

    return {
      quantityText: quantityParts.quantityText,
      numericValue: quantityParts.numericValue,
      nounQuantity: quantityParts.nounQuantity,
      sizeText,
      unitText,
      amountUnitText,
      leadText,
      nameText,
      mainText,
    };
  }

  function formatIngredientCoreText(line, options = {}) {
    return getIngredientDisplayCoreParts(line, options).mainText;
  }

  function getIngredientDisplayParts(line, options = {}) {
    const core = getIngredientDisplayCoreParts(line, options);
    const prepText = String(line?.prepNotes || '').trim();
    const substituteTexts = Array.isArray(line?.substitutes)
      ? line.substitutes
          .map((sub) =>
            formatIngredientCoreText({ ...(sub || {}), substitutes: [] }, options),
          )
          .filter(Boolean)
      : [];
    const parentheticalBits = [];
    const parentheticalNote = String(line?.parentheticalNote || '').trim();
    if (parentheticalNote) parentheticalBits.push(parentheticalNote);
    if (line?.isOptional) parentheticalBits.push('optional');
    const parentheticalText = parentheticalBits.join(', ');

    let text = core.mainText;
    if (prepText) text += text ? `, ${prepText}` : prepText;
    if (substituteTexts.length) text += `${text ? ' or ' : ''}${substituteTexts.join(' or ')}`;
    if (parentheticalText) text += `${text ? ' ' : ''}(${parentheticalText})`;

    return {
      ...core,
      prepText,
      substituteTexts,
      parentheticalBits,
      parentheticalText,
      text: text.trim(),
    };
  }

  function formatIngredientText(line, options = {}) {
    return getIngredientDisplayParts(line, options).text;
  }

  function formatNeedLineText(line, options = {}) {
    const parts = getIngredientDisplayCoreParts(line, options);
    let text = parts.nameText;

    if (parts.leadText) {
      text += text ? ` (${parts.leadText})` : parts.leadText;
    }

    if (line?.isOptional) {
      text = parts.leadText ? text.replace(/\)$/, ', optional)') : `${text} (optional)`.trim();
    }

    return text.trim();
  }

  root.getUnitDisplay = getUnitDisplay;
  root.getIngredientDisplayCoreParts = getIngredientDisplayCoreParts;
  root.getIngredientDisplayParts = getIngredientDisplayParts;
  root.formatIngredientText = formatIngredientText;
  root.formatNeedLineText = formatNeedLineText;
  root.resolveIngredientLineUsesMetric = lineUsesMetricDisplay;
  root.favoriteEatsUnitlessQuantityPolicy = {
    defaultStepDenominator: DEFAULT_UNITLESS_SCALAR_SNAP_STEP,
    getCachedPolicy: () => normalizeUnitlessQuantityPolicy(unitlessQuantityPolicy),
    reload: async () => {
      unitlessQuantityPolicy = null;
      await ensureUnitlessQuantityPolicyLoaded();
      return normalizeUnitlessQuantityPolicy(unitlessQuantityPolicy);
    },
  };
  root.ingredientDisplay = {
    getUnitDisplay,
    getIngredientDisplayCoreParts,
    getIngredientDisplayParts,
    formatIngredientText,
    formatNeedLineText,
    resolveIngredientLineUsesMetric: lineUsesMetricDisplay,
  };
})(
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : this
);
