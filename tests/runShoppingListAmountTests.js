#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(projectRoot, 'js', 'utils.js');
const ingredientDisplayPath = path.join(projectRoot, 'js', 'ingredientDisplay.js');
const unitQuantityFormatPath = path.join(projectRoot, 'js', 'unitQuantityFormat.js');
const favoriteEatsAmountKitPath = path.join(projectRoot, 'js', 'favoriteEatsAmountKit.js');
const cookingVolumeLadderPath = path.join(projectRoot, 'js', 'cookingVolumeLadder.js');
const quantityDisplayPolicyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function loadHelpers() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const ingredientDisplaySource = fs.readFileSync(ingredientDisplayPath, 'utf8');
  const unitQuantityFormatSource = fs.readFileSync(unitQuantityFormatPath, 'utf8');
  const favoriteEatsAmountKitSource = fs.readFileSync(favoriteEatsAmountKitPath, 'utf8');
  const cookingVolumeLadderSource = fs.readFileSync(cookingVolumeLadderPath, 'utf8');
  const quantityDisplayPolicySource = fs.readFileSync(quantityDisplayPolicyPath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');

  const decimalSnippet = extractSnippet(
    utilsSource,
    'function decimalToFractionDisplay(',
    'function showUndoToastGlobal('
  );
  const grammarSnippet = extractSnippet(
    utilsSource,
    'function normalizeIngredientSingularSpelling(',
    '/**\n * Make a span element editable'
  );
  const shoppingListSnippet = extractSnippet(
    mainSource,
    '// --- Shopping list amount helpers (tests extract this block) ---',
    '// --- End shopping list amount helpers ---'
  );

  const context = {
    console,
    window: {},
    getShoppingPlanSelectionLabel(entry) {
      if (!entry || typeof entry !== 'object') return '';
      const name = String(entry.name || '').trim();
      const variantName = String(entry.variantName || '').trim();
      if (!name) return '';
      if (!variantName || variantName.toLowerCase() === 'default') return name;
      return `${name} (${variantName})`;
    },
    formatShoppingPlanQuantity(quantity) {
      const numeric = Number(quantity);
      if (!Number.isFinite(numeric) || numeric <= 0) return '';
      return String(Number(numeric.toFixed(2)));
    },
  };

  vm.createContext(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });

  if (typeof context.decimalToFractionDisplay === 'function') {
    context.window.decimalToFractionDisplay = context.decimalToFractionDisplay;
  }
  if (typeof context.parseNumericQuantityValue === 'function') {
    context.window.parseNumericQuantityValue = context.parseNumericQuantityValue;
  }
  if (typeof context.pluralizeEnglishNoun === 'function') {
    context.window.pluralizeEnglishNoun = context.pluralizeEnglishNoun;
  }
  if (typeof context.getShoppingCatalogItemDisplayName === 'function') {
    context.window.getShoppingCatalogItemDisplayName =
      context.getShoppingCatalogItemDisplayName;
  }
  if (typeof context.buildShoppingCatalogLabelIndex === 'function') {
    context.window.buildShoppingCatalogLabelIndex =
      context.buildShoppingCatalogLabelIndex;
  }
  if (typeof context.resolveShoppingCatalogItemByLabel === 'function') {
    context.window.resolveShoppingCatalogItemByLabel =
      context.resolveShoppingCatalogItemByLabel;
  }

  vm.runInContext(ingredientDisplaySource, context, { filename: 'ingredientDisplay.js' });
  vm.runInContext(unitQuantityFormatSource, context, { filename: 'unitQuantityFormat.js' });
  vm.runInContext(favoriteEatsAmountKitSource, context, { filename: 'favoriteEatsAmountKit.js' });
  vm.runInContext(cookingVolumeLadderSource, context, {
    filename: 'cookingVolumeLadder.js',
  });
  vm.runInContext(quantityDisplayPolicySource, context, {
    filename: 'quantityDisplayPolicy.js',
  });
  vm.runInContext(shoppingListSnippet, context, {
    filename: 'main.shopping-list-amount-helpers.js',
  });

  const helpers = context.window.__shoppingListAmountHelpers;
  if (!helpers) throw new Error('Shopping list amount helpers were not attached to window.');
  return { helpers, context };
}

function seedCatalogGrammarCache(context, items) {
  const byName = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    const key = name.toLowerCase();
    if (!key || byName.has(key)) return;
    byName.set(key, item);
  });
  const labelIndex =
    typeof context.buildShoppingCatalogLabelIndex === 'function'
      ? context.buildShoppingCatalogLabelIndex(byName)
      : new Map();
  if (typeof context.applyFavoriteEatsCatalogGrammarCaches === 'function') {
    context.applyFavoriteEatsCatalogGrammarCaches(byName, labelIndex);
  } else {
    context.favoriteEatsCatalogByNameLc = byName;
    context.favoriteEatsCatalogLabelIndexLc = labelIndex;
    context.window.favoriteEatsCatalogByNameLc = byName;
    context.window.favoriteEatsCatalogLabelIndexLc = labelIndex;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson} but got ${actualJson}`);
  }
}

function run() {
  const { helpers, context } = loadHelpers();

  assertEqual(helpers.normalizeShoppingListUnit('Fluid Ounces'), 'fl oz', 'fluid ounces normalize');
  assertEqual(helpers.normalizeShoppingListUnit('cans'), 'can', 'plural package units singularize');

  const massBase = helpers.convertShoppingListQuantityToMeasuredBase(20, 'oz');
  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase(massBase.family, massBase.baseQuantity),
    {
      family: 'mass',
      quantity: 1.25,
      unit: 'lb',
    },
    '20 oz converts to 1.25 lb display bucket'
  );

  const gallonBase = helpers.convertShoppingListQuantityToMeasuredBase(1, 'gallon');
  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase(gallonBase.family, gallonBase.baseQuantity),
    {
      family: 'volume',
      quantity: 1,
      unit: 'gal',
    },
    '1 gallon remains 1 gal'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 55),
    {
      family: 'volume',
      quantity: 11.25,
      unit: 'tsp',
      displayLabel: '3 tbsp + 2 ¼ tsp',
    },
    '55 ml shopping ceil on unified ladder (first rung ≥ 55 ml)'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 950),
    {
      family: 'volume',
      quantity: 4.5,
      unit: 'cup',
    },
    '950 ml rounds up to 4.5 cups (no pint/quart labels)'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 1900),
    {
      family: 'volume',
      quantity: 8.5,
      unit: 'cup',
    },
    '1900 ml (~8 cups) stays on cup ladder with ½-cup ceil below 16 cups'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 10 * 236.5882365),
    {
      family: 'volume',
      quantity: 10,
      unit: 'cup',
    },
    '10 cups equivalent stays 10 cups (not blunt 1 gal)'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 16 * 236.5882365),
    {
      family: 'volume',
      quantity: 1,
      unit: 'gal',
    },
    '16 cups equivalent switches to 1 gal'
  );

  assertDeepEqual(
    helpers.getShoppingListMeasuredDisplayFromBase('volume', 17 * 236.5882365),
    {
      family: 'volume',
      quantity: 1.5,
      unit: 'gal',
    },
    '17 cups equivalent ceils to next ½ gallon'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('volume', 950, 'cooking'),
    {
      family: 'volume',
      quantity: 4,
      unit: 'cup',
    },
    '950 ml cooking ladder rounds to whole cups (vs shopping 4.5 cup ceil)'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('volume', 950),
    helpers.getMeasuredDisplayFromBase('volume', 950, 'cooking'),
    'default measured display intent is cooking'
  );

  assertDeepEqual(
    helpers.getMeasuredDisplayFromBase('mass', 300, 'cooking'),
    {
      family: 'mass',
      quantity: 11,
      unit: 'oz',
    },
    '300 g cooking sub-lb uses nearest whole oz'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [
        {
          key: 'measured:oz',
          kind: 'measured',
          unit: 'oz',
          family: 'mass',
          baseQuantity: massBase.baseQuantity,
        },
      ],
    }),
    'foo (20 oz)',
    'measured buckets keep their recipe unit instead of merging mass families'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'sugar',
      buckets: [
        {
          key: 'measured:cup',
          kind: 'measured',
          unit: 'cup',
          family: 'volume',
          baseQuantity: 0.125 * 236.5882365,
        },
      ],
    }),
    'sugar (2 tbsp)',
    'eighth-cup volume snaps on centralized ladder (⅛ cup → 2 tbsp rung)'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'sugar',
      buckets: [
        {
          key: 'measured:cup',
          kind: 'measured',
          unit: 'cup',
          family: 'volume',
          baseQuantity: 0.03125 * 236.5882365,
        },
      ],
    }),
    'sugar (½ tbsp)',
    'sub-quarter cup snaps on unified ladder (½ tbsp = 1½ tsp)'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'paprika',
      variantName: 'smoked',
      buckets: [
        {
          key: 'measured:tsp',
          kind: 'measured',
          unit: 'tsp',
          family: 'volume',
          baseQuantity: 1.625 * 4.92892159375,
        },
      ],
    }),
    'smoked paprika (1¾ tsp)',
    'summed tsp volume uses centralized ladder, not raw fraction of base qty'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 2.5 }],
    }),
    'foo (2½)',
    'plain step count renders before recipe unit tails'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'broccoli',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        {
          key: 'exact:crown|',
          kind: 'exact',
          quantity: 3,
          unit: 'crown',
          size: '',
        },
        {
          key: 'measured:lb',
          kind: 'measured',
          unit: 'lb',
          family: 'mass',
          baseQuantity: 453.59237 * 3.5,
        },
      ],
    }),
    'broccoli (1 + 3 crowns + 3½ lb)',
    'selected plain count leads unlike unit tails'
  );

  assertEqual(
    helpers.formatShoppingListDisplayDetailText({
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 7 },
        {
          key: 'measured:tbsp',
          kind: 'measured',
          unit: 'tbsp',
          family: 'volume',
          baseQuantity: 2 * 14.78676478125,
        },
        {
          key: 'measured:tsp',
          kind: 'measured',
          unit: 'tsp',
          family: 'volume',
          baseQuantity: 2.5 * 4.92892159375,
        },
      ],
    }),
    '7 + 2 tbsp + 2½ tsp',
    'direct stepper count prefixes multiple recipe volume tails'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        { key: 'count', kind: 'count', quantity: 1, unit: '', size: '' },
      ],
    }),
    'foo (2)',
    'selected plain count merges with unitless recipe count'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'flour',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        {
          key: 'measured:cup',
          kind: 'measured',
          unit: 'cup',
          family: 'volume',
          baseQuantity: 3 * 236.5882365,
        },
      ],
    }),
    'flour (1 + 3 cups)',
    'selected plain count stays separate from a lone measured recipe tail'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'alicorn_c',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
      ],
    }),
    'alicorn_c (1 + some)',
    'direct numeric count composes with direct unspecified (add-by-tag some)'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerDisplayDetailText({
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
      ],
    }),
    '1 + some',
    'items browse shows direct count plus direct some'
  );

  assertEqual(
    helpers.formatShoppingListDisplayDetailText({
      variantName: 'large',
      buckets: [{ key: 'count', kind: 'count', quantity: 2, unit: '', size: '' }],
    }),
    '2 large',
    'detail formatter keeps size variants in the amount text'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'unspecified', kind: 'unspecified', quantity: 3 }],
    }),
    'foo (some)',
    'unspecified recipe buckets render as some instead of a batch count'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
        { key: 'exact:pinch|', kind: 'exact', quantity: 1, unit: 'pinch', size: '' },
        { key: 'exact:carton|', kind: 'exact', quantity: 1, unit: 'carton', size: '' },
        {
          key: 'measured:gal',
          kind: 'measured',
          unit: 'gal',
          family: 'volume',
          baseQuantity: gallonBase.baseQuantity,
        },
      ],
    }),
    'foo (some + 1 pinch + 1 carton + 1 gal)',
    'unlike units stay separate in the tail after plain-step rules'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'apples',
      buckets: [
        { key: 'count', kind: 'count', quantity: 12, unit: '', size: '' },
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
      ],
    }),
    'apples (some + 12)',
    'unspecified recipe lines stay literal while compatible numeric amounts remain summed'
  );

  assertEqual(
    helpers.formatShoppingListDisplayDetailText({
      buckets: [
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
        { key: 'unspecified', kind: 'unspecified', quantity: 1 },
      ],
    }),
    'some',
    'duplicate unspecified buckets collapse to a single some'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'large',
      buckets: [{ key: 'unspecified', kind: 'unspecified', quantity: 1 }],
    }),
    'ginger (some large)',
    'size variants still appear alongside some for unspecified quantities'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'foo',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 2 }],
    }),
    'foo (2)',
    'manual plain-step selection without recipe tails'
  );

  assertEqual(
    helpers.getBrowsePlannerPlainStepQtyFromParts({
      directQty: 0,
      recipeQty: 1,
      planRowBuckets: [{ key: 'count', kind: 'count', quantity: 1 }],
    }),
    1,
    'recipe-only unitless count promotes to browse plain-step qty'
  );

  assertEqual(
    helpers.getBrowsePlannerDirectQtyFromPlainStep({
      plainQty: 1,
      directQty: 0,
      recipeQty: 1,
      planRowBuckets: [{ key: 'count', kind: 'count', quantity: 1 }],
    }),
    0,
    'plain step at recipe floor does not persist duplicate direct qty'
  );

  assertEqual(
    helpers.getBrowsePlannerDirectQtyFromPlainStep({
      plainQty: 2,
      directQty: 0,
      recipeQty: 1,
      planRowBuckets: [{ key: 'count', kind: 'count', quantity: 1 }],
    }),
    1,
    'plain step above recipe floor maps to incremental direct qty'
  );

  assertEqual(
    helpers.getBrowsePlannerPlainStepQtyFromParts({
      directQty: 0,
      recipeQty: 1,
      planRowBuckets: [
        { key: 'measured:lb', kind: 'measured', unit: 'lb', baseQuantity: 1 },
      ],
    }),
    0,
    'measured recipe tails do not promote to plain-step qty'
  );

  assertDeepEqual(
    helpers.getShoppingBrowsePlannerBadgeContent(
      helpers.getBrowsePlannerPlainStepQtyFromParts({
        directQty: 0,
        recipeQty: 1,
        planRowBuckets: [{ key: 'count', kind: 'count', quantity: 1 }],
      }),
      { hasAmountTail: true },
    ),
    { type: 'icon', name: 'add_diamond' },
    'recipe-derived tail uses diamond badge even when count promotes to plain step'
  );

  assertEqual(
    helpers.formatShoppingListPlainStepBadgeLabel(0, { hasAmountTail: true }),
    '',
    'tail-only text badge is empty; icon is used instead'
  );

  assertEqual(
    helpers.formatShoppingListPlainStepBadgeLabel(2, { hasAmountTail: true }),
    '',
    'recipe tail badge uses diamond icon instead of numeric text'
  );

  assertEqual(
    helpers.formatShoppingListPlainStepBadgeLabel(2, { hasAmountTail: false }),
    '2',
    'plain-only badge omits tilde'
  );

  assertDeepEqual(
    helpers.getShoppingBrowsePlannerBadgeContent(0, { hasAmountTail: true }),
    { type: 'icon', name: 'add_diamond' },
    'tail-only collapsed badge uses add_diamond icon'
  );

  assertDeepEqual(
    helpers.getShoppingBrowsePlannerBadgeContent(2, { hasAmountTail: true }),
    { type: 'icon', name: 'add_diamond' },
    'non-exclusive whole number with recipe tail uses diamond badge'
  );

  assertDeepEqual(
    helpers.getShoppingBrowsePlannerBadgeContent(33, { hasAmountTail: true }),
    { type: 'icon', name: 'add_diamond' },
    'manual whole plus recipe tail keeps diamond at rest'
  );

  assertDeepEqual(
    helpers.getShoppingBrowsePlannerBadgeContent(5, { hasAmountTail: false }),
    { type: 'text', value: '5' },
    'manual whole only shows numeric badge'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerStepperQtyLabel(0, { hasAmountTail: true }),
    '0',
    'tail-only active stepper shows zero instead of an icon hint'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerAmountButtonText('500 g'),
    '(500 g)',
    'browse amount button wraps recipe detail in parens'
  );

  assertEqual(
    helpers.isShoppingBrowsePlannerWholeNumberOnlyBuckets([
      { key: 'selected', kind: 'selected', quantity: 2 },
    ]),
    true,
    'manual plain-step selected bucket is whole-number-only'
  );

  assertEqual(
    helpers.isShoppingBrowsePlannerWholeNumberOnlyBuckets([
      { key: 'count', kind: 'count', quantity: 181 },
    ]),
    true,
    'recipe-only unitless count bucket is whole-number-only'
  );

  assertEqual(
    helpers.isShoppingBrowsePlannerWholeNumberOnlyBuckets([
      { key: 'count', kind: 'count', quantity: 12 },
      { key: 'unspecified', kind: 'unspecified', quantity: 1 },
    ]),
    false,
    'unspecified recipe tails are not whole-number-only'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerDisplayDetailText({
      buckets: [{ key: 'selected', kind: 'selected', quantity: 2 }],
    }),
    '',
    'items browse suppresses manual whole-number-only detail text'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerDisplayDetailText({
      buckets: [{ key: 'count', kind: 'count', quantity: 181 }],
    }),
    '',
    'items browse suppresses recipe whole-number-only detail text'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerDisplayDetailText({
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        {
          key: 'exact:box|',
          kind: 'exact',
          quantity: 1,
          unit: 'box',
          size: '',
        },
      ],
    }),
    '1 + 1 box',
    'items browse keeps composite bucket-2 detail text'
  );

  assertEqual(
    helpers.formatShoppingBrowsePlannerDisplayDetailText({
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        {
          key: 'measured:gal',
          kind: 'measured',
          unit: 'gal',
          family: 'volume',
          baseQuantity: gallonBase.baseQuantity,
        },
      ],
    }),
    '1 + 1 gal',
    'items browse keeps direct plain-step separate from lone measured recipe tail'
  );

  assertEqual(
    helpers.shoppingBrowsePlannerRowHasAmountTail(
      [{ key: 'count', kind: 'count', quantity: 181 }],
    ),
    false,
    'recipe whole-number-only rows do not expose browse amount tails'
  );

  assertEqual(
    helpers.shoppingBrowsePlannerRowHasAmountTail(
      [{ key: 'unspecified', kind: 'unspecified', quantity: 1 }],
    ),
    true,
    'unspecified recipe amounts still expose browse amount tails'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'pickled',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 1 }],
    }),
    'pickled ginger (1)',
    'non-size variants stay in the ingredient name'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'ginger',
      variantName: 'large',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 1 }],
    }),
    'ginger (1 large)',
    'size variants move into the amount text instead of the name'
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'beans',
      variantName: 'cannellini',
      buckets: [
        { key: 'selected', kind: 'selected', quantity: 1 },
        { key: 'exact:can|', kind: 'exact', quantity: 2, unit: 'can', size: '' },
      ],
    }),
    'cannellini beans (1 + 2 cans)',
    'variant products stay on one line with packaging in the amount'
  );

  assertEqual(
    helpers.formatShoppingListAmountLeadText({
      quantity: 1.1,
      unit: 'box',
    }),
    '1⅛ box',
    'count packaging units use shopping snap and fraction glyphs (1.1 box → 1⅛ box)',
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'pasta',
      buckets: [{ key: 'exact:box|', kind: 'exact', quantity: 1.1, unit: 'box', size: '' }],
    }),
    'pasta (1⅛ box)',
    'shopping list row detail uses central formatter for box amounts',
  );

  seedCatalogGrammarCache(context, [
    {
      name: 'tomato',
      lemma: 'tomato',
      singularIfUnspecified: false,
      isMassNoun: false,
      pluralOverride: '',
      usePluralOverride: false,
    },
    {
      name: 'flour',
      lemma: 'flour',
      singularIfUnspecified: true,
      isMassNoun: false,
      pluralOverride: '',
      usePluralOverride: false,
    },
    {
      name: 'fish',
      lemma: 'fish',
      singularIfUnspecified: false,
      isMassNoun: false,
      pluralOverride: 'fishies',
      usePluralOverride: false,
    },
  ]);

  assertEqual(
    helpers.getShoppingListIngredientLabel('tomato'),
    'tomatoes',
    'shopping list labels pluralize countable catalog items',
  );

  assertEqual(
    helpers.getShoppingListIngredientLabel('flour'),
    'flour',
    'shopping list labels keep singular when singularIfUnspecified is set',
  );

  assertEqual(
    helpers.getShoppingListIngredientLabel('fish'),
    'fishes',
    'shopping list labels ignore stored plural_override when use_plural_override is off',
  );

  assertEqual(
    helpers.formatShoppingListDisplayRow({
      name: 'tomato',
      buckets: [{ key: 'selected', kind: 'selected', quantity: 3 }],
    }),
    'tomatoes (3)',
    'shopping list row label uses catalog pluralization with detail',
  );

  console.log('Shopping list amount tests passed.');
}

run();
