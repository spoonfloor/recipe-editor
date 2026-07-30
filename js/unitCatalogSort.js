// Units catalog list (units.html): sort volume → mass → other, by physical
// size within measured volume/mass, then ASCII-nocase by unit code.
//
// Magnitudes come from favoriteEatsMeasuredUnitRegistry (US cup, etc.).

(function initUnitCatalogSort(global) {
  if (!global) return;

  function measuredUnitRegistry() {
    return global.favoriteEatsMeasuredUnitRegistry || null;
  }

  function asciiNocaseFold(s) {
    return String(s).replace(/[A-Z]/g, (c) => c.toLowerCase());
  }

  function normalizeUnitCodeKey(code) {
    return asciiNocaseFold(String(code == null ? '' : code).trim());
  }

  function unitCatalogBucket(categoryRaw) {
    const c = String(categoryRaw == null ? '' : categoryRaw).trim().toLowerCase();
    if (c === 'volume') return 0;
    if (c === 'mass') return 1;
    return 2;
  }

  function magnitudeForCatalogSort(row) {
    const bucket = unitCatalogBucket(row?.category);
    if (bucket === 2) return 0;

    const key = normalizeUnitCodeKey(row?.code);
    const reg = measuredUnitRegistry();
    const meta =
      reg && typeof reg.getMagnitudeMeta === 'function'
        ? reg.getMagnitudeMeta(key)
        : null;
    if (!meta) return Number.POSITIVE_INFINITY;
    if (bucket === 0 && meta.family !== 'volume') return Number.POSITIVE_INFINITY;
    if (bucket === 1 && meta.family !== 'mass') return Number.POSITIVE_INFINITY;
    return meta.baseAmount;
  }

  function compareAsciiNocaseCode(aCode, bCode) {
    const la = asciiNocaseFold(aCode == null ? '' : String(aCode));
    const lb = asciiNocaseFold(bCode == null ? '' : String(bCode));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function compareUnitsListCatalogRows(a, b) {
    const ba = unitCatalogBucket(a?.category);
    const bb = unitCatalogBucket(b?.category);
    if (ba !== bb) return ba - bb;

    if (ba === 2) {
      return compareAsciiNocaseCode(a?.code, b?.code);
    }

    const ma = magnitudeForCatalogSort(a);
    const mb = magnitudeForCatalogSort(b);
    if (ma !== mb) return ma - mb;
    return compareAsciiNocaseCode(a?.code, b?.code);
  }

  function sortUnitsListForCatalogUi(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list.slice().sort(compareUnitsListCatalogRows);
  }

  global.sortUnitsListForCatalogUi = sortUnitsListForCatalogUi;
})(typeof globalThis !== 'undefined' ? globalThis : window);
