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
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

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

  const context = {
    window: {},
    console,
  };

  vm.createContext(context);
  installMeasuredUnitRegistry(context);
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

  vm.runInContext(ingredientDisplaySource, context, { filename: 'ingredientDisplay.js' });
  vm.runInContext(unitQuantityFormatSource, context, { filename: 'unitQuantityFormat.js' });
  vm.runInContext(favoriteEatsAmountKitSource, context, { filename: 'favoriteEatsAmountKit.js' });
  vm.runInContext(cookingVolumeLadderSource, context, { filename: 'cookingVolumeLadder.js' });
  vm.runInContext(quantityDisplayPolicySource, context, { filename: 'quantityDisplayPolicy.js' });

  const helpers = context.window.ingredientDisplay;
  if (!helpers) throw new Error('Ingredient display helpers were not attached to window.');
  return { helpers, win: context.window };
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const { helpers, win } = loadHelpers();

  const inlineCases = [
    {
      label: 'variant ordering uses canonical name display',
      input: { quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: '¾ lb Impossible chuck',
    },
    {
      label: 'structured quantities format with unicode fraction output',
      input: { quantityMin: 0.75, quantityMax: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: '¾ lb Impossible chuck',
    },
    {
      label: 'free-text quantity is preserved while canonical name ordering remains',
      input: { quantity: 'about 1/2', unit: 'cup', name: 'stock', variant: 'chicken' },
      expected: 'about ½ cup chicken stock',
    },
    {
      label: 'parenthetical note and optional tag are appended once',
      input: {
        quantity: 1,
        unit: 'cup',
        name: 'parsley',
        parentheticalNote: 'packed',
        isOptional: true,
      },
      expected: '1 cup parsley (packed, optional)',
    },
    {
      label: 'substitutes reuse the shared formatter',
      input: {
        quantity: 1,
        unit: 'lb',
        name: 'beef',
        substitutes: [{ quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' }],
      },
      expected: '1 lb beef or ¾ lb Impossible chuck',
    },
    {
      label: 'cup pluralizes for qty > 1 (no abbreviation)',
      input: { quantity: 2, unit: 'cup', name: 'flour' },
      expected: '2 cups flour',
    },
    {
      label: 'unit fallback pluralization handles bunch correctly',
      input: { quantity: 2, unit: 'bunch', name: 'scallion' },
      expected: '2 bunches scallion',
    },
    {
      label: 'sub-1 quantity keeps unit singular',
      input: { quantity: 0.25, unit: 'bunch', name: 'cilantro' },
      expected: '¼ bunch cilantro',
    },
    {
      label: 'linked recipe title is never ingredient-pluralized for qty > 1',
      input: {
        isRecipe: true,
        linkedRecipeId: 42,
        linkedRecipeTitle: 'bar',
        recipeText: 'bar',
        name: 'bar',
        lemma: 'bar',
        quantity: 2,
      },
      expected: '2 bar',
    },
    {
      label: 'sub-1 measure + unit pluralizes countable catalog nouns (½ cup pecans)',
      input: {
        quantity: 0.5,
        unit: 'cup',
        name: 'pecan',
        lemma: 'pecan',
        pluralOverride: 'pecans',
      },
      expected: '½ cup pecans',
    },
    {
      label: 'measure + unit keeps mass nouns singular (½ cup rice)',
      input: {
        quantity: 0.5,
        unit: 'cup',
        name: 'rice',
        lemma: 'rice',
        isMassNoun: true,
      },
      expected: '½ cup rice',
    },
    {
      label: 'partitive slice keeps singular tomato (not tomatoes)',
      input: {
        quantity: 1,
        unit: 'slice',
        name: 'tomato',
        lemma: 'tomato',
      },
      expected: '1 slice tomato',
    },
    {
      label: 'no unit uses count grammar (2 tomatoes)',
      input: {
        quantity: 2,
        name: 'tomato',
        lemma: 'tomato',
      },
      expected: '2 tomatoes',
    },
    {
      label: 'no unit singular count (1 tomato)',
      input: {
        quantity: 1,
        name: 'tomato',
        lemma: 'tomato',
      },
      expected: '1 tomato',
    },
  ];

  inlineCases.forEach((testCase) => {
    const actual = helpers.formatIngredientText(testCase.input);
    assertEqual(actual, testCase.expected, testCase.label);
  });

  win.unitsDisplayMap = {
    snaptest: {
      code: 'snaptest',
      abbrev: 'snaptest',
      name_singular: 'snaptest',
      name_plural: 'snaptests',
      category: 'small',
      quantityRoundingPreset: 'custom',
      quantityRoundingStepDenominator: 4,
      quantityRoundingMode: 'nearest',
    },
  };

  assertEqual(
    helpers.formatIngredientText({
      quantity: 1.111,
      unit: 'snaptest',
      name: 'salt',
    }),
    '1 snaptest salt',
    'cooking intent snaps custom unit to nearest quarter (1.111 → 1)',
  );
  assertEqual(
    helpers.formatIngredientText(
      {
        quantity: 1.111,
        unit: 'snaptest',
        name: 'salt',
      },
      { intent: 'shopping' },
    ),
    '1¼ snaptest salt',
    'shopping intent uses ceil snap; singular unit below 2',
  );

  win.unitsDisplayMap = {
    oz: {
      code: 'oz',
      abbrev: 'oz',
      name_singular: 'ounce',
      name_plural: 'ounces',
      category: 'mass',
      quantityRoundingPreset: 'nearest_eighth',
      quantityRoundingStepDenominator: null,
      quantityRoundingMode: null,
    },
  };
  assertEqual(
    helpers.formatIngredientText({ quantity: 2.49, unit: 'oz', name: 'jam' }),
    '2 oz jam',
    'catalog-default mass uses cooking measured ladder for oz (2.49 → 2 oz)',
  );
  assertEqual(
    helpers.formatIngredientText({
      quantity: '',
      quantityMin: 2.49,
      quantityMax: 2.49,
      unit: 'oz',
      name: 'jam',
    }),
    '2 oz jam',
    'structured quantity fields use cooking measured ladder for oz (2.49 → 2 oz)',
  );
  assertEqual(
    helpers.formatNeedLineText({ quantity: 4.73, unit: 'oz', name: 'jam' }),
    'jam (5 oz)',
    'YWN-style line uses same ladder for merged decimal oz total',
  );
  win.unitsDisplayMap = {};
  assertEqual(
    helpers.formatIngredientText({ quantity: 2.49, unit: 'oz', name: 'jam' }),
    '2 oz jam',
    'known measured units use the canonical ladder before async unit metadata loads',
  );
  assertEqual(
    helpers.formatIngredientText({
      quantity: 3,
      unit: 'oz',
      name: 'noodles',
      useMetric: true,
      pluralOverride: 'noodles',
    }),
    '85 g noodles',
    'catalog useMetric overrides US oz display on recipe lines',
  );
  assertEqual(
    helpers.formatIngredientText({
      quantity: 3,
      quantityMin: 3,
      quantityMax: 3,
      unit: 'lb',
      name: 'noodles',
      pluralOverride: 'noodles',
    }),
    '3 lb noodles',
    'without line flag or catalog map, US display is unchanged',
  );

  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 2,
      quantityMax: 2,
      unit: 'tbsp',
      name: 'miso paste',
      prepNotes: 'softened at room temp',
    }),
    '2 tbsp miso paste, softened at room temp',
    '2 tbsp stays on tbsp ladder after ml base conversion rounding',
  );

  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 0.25,
      quantityMax: 0.25,
      unit: 'tsp',
      name: 'hot sauce',
    }),
    '¼ tsp hot sauce',
    '¼ tsp stays ¼ tsp',
  );

  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 4,
      quantityMax: 4,
      unit: 'tsp',
      name: 'hot sauce',
    }),
    '1 tbsp + 1 tsp hot sauce',
    '4 tsp uses compound rung on unified ladder',
  );

  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 2.5,
      quantityMax: 2.5,
      unit: 'tsp',
      name: 'hot sauce',
    }),
    '2½ tsp hot sauce',
    '2½ tsp uses ½-tsp ladder',
  );

  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 1.5,
      quantityMax: 1.5,
      unit: 'tbsp',
      name: 'hot sauce',
    }),
    '1½ tbsp hot sauce',
    '1½ tbsp on tbsp ladder',
  );

  win.unitsDisplayMap = {
    sysct: {
      code: 'sysct',
      abbrev: 'ct',
      name_singular: 'count',
      name_plural: 'counts',
      category: 'count',
      quantityRoundingPreset: 'system_measured',
      quantityRoundingStepDenominator: null,
      quantityRoundingMode: null,
    },
  };
  assertEqual(
    helpers.formatIngredientText({ quantity: 1.4, unit: 'sysct', name: 'item' }),
    '1 ct item',
    'non-measured system_measured snaps like whole-number step',
  );
  assertEqual(
    helpers.formatIngredientText({ quantity: 1.6, unit: 'sysct', name: 'item' }),
    '2 cts item',
    'non-measured system_measured plural unit when quantity > 1',
  );
  win.unitsDisplayMap = {};

  win.unitsDisplayMap = {
    box: {
      code: 'box',
      name_singular: 'box',
      name_plural: 'boxes',
      category: 'packaging',
      quantityRoundingPreset: 'nearest_eighth',
      quantityRoundingStepDenominator: null,
      quantityRoundingMode: null,
    },
  };
  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 1.1,
      quantityMax: 1.1,
      unit: 'box',
      name: 'pasta',
    }),
    '1⅛ box pasta',
    'structured min/max uses catalog snap for count units (1.1 box → 1⅛ box)',
  );
  assertEqual(
    helpers.formatIngredientText({ quantity: 1.1, unit: 'box', name: 'pasta' }),
    '1⅛ box pasta',
    'quantity-only path matches min/max for count units',
  );
  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 2.1,
      quantityMax: 2.1,
      unit: 'box',
      name: 'pasta',
    }),
    '2⅛ boxes pasta',
    'count units pluralize from snapped amount >= 2',
  );
  assertEqual(
    helpers.formatIngredientText({
      quantityMin: 3.166,
      quantityMax: 3.166,
      unit: 'cup',
      name: 'marinara sauce',
    }),
    '3 cups marinara sauce',
    'volume min/max still uses cooking ladder (3.166 cup → 3 cups)',
  );
  win.unitsDisplayMap = {};

  const needLineCases = [
    {
      label: 'you will need uses shared canonical quantity and name',
      input: { quantity: 0.75, unit: 'lb', name: 'chuck', variant: 'Impossible' },
      expected: 'Impossible chuck (¾ lb)',
    },
    {
      label: 'you will need optional text stays inside parentheses',
      input: { quantity: 1, unit: 'clove', name: 'garlic', isOptional: true },
      expected: 'garlic (1 clove, optional)',
    },
  ];

  needLineCases.forEach((testCase) => {
    const actual = helpers.formatNeedLineText(testCase.input);
    assertEqual(actual, testCase.expected, testCase.label);
  });

  const parts = helpers.getIngredientDisplayParts({
    quantity: 0.75,
    unit: 'lb',
    name: 'chuck',
    variant: 'Impossible',
    prepNotes: 'thawed',
  });

  assertEqual(parts.leadText, '¾ lb', 'display parts expose canonical lead text');
  assertEqual(parts.nameText, 'Impossible chuck', 'display parts expose canonical name text');
  assertEqual(parts.text, '¾ lb Impossible chuck, thawed', 'display parts expose canonical full text');
  assertEqual(helpers.getUnitDisplay('cup', 2), 'cups', 'unit display pluralizes cup correctly');
  assertEqual(helpers.getUnitDisplay('cup', 1.125), 'cup', 'unit display keeps cup singular between 1 and 2');
  assertEqual(helpers.getUnitDisplay('cup', 0.25), 'cup', 'unit display keeps cup singular for sub-1 quantity');
  assertEqual(helpers.getUnitDisplay('bunch', 2), 'bunches', 'unit display pluralizes bunch correctly');
  assertEqual(helpers.getUnitDisplay('bunch', 0.25), 'bunch', 'unit display keeps bunch singular for sub-1 quantity');

  console.log('Ingredient display tests passed.');
}

run();
