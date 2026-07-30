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
const recipeIngredientAmountModelPath = path.join(
  projectRoot,
  'js',
  'recipeIngredientAmountModel.js',
);
const planRecipeCachePath = path.join(projectRoot, 'js', 'favoriteEatsPlanRecipeCache.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const adapterPath = path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js');
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function makeJsonResponse(rows) {
  return {
    ok: true,
    status: 200,
    async json() {
      return rows;
    },
    async text() {
      return JSON.stringify(rows);
    },
  };
}

function createFetchMock() {
  const captured = {
    saveRecipePayload: null,
  };
  const ingredientRows = [
    {
      id: 1,
      name: 'bar',
      is_deprecated: 0,
      is_hidden: 0,
      is_food: 1,
      lemma: 'bar',
      singular_if_unspecified: 0,
      is_mass_noun: 0,
    },
    {
      id: 2,
      name: 'beef',
      is_deprecated: 0,
      is_hidden: 0,
      is_food: 1,
      lemma: 'beef',
      singular_if_unspecified: 0,
      is_mass_noun: 1,
    },
    { id: 464, name: 'a', is_deprecated: 0, is_hidden: 0, is_food: 1, lemma: 'a', singular_if_unspecified: 0, is_mass_noun: 1 },
    { id: 465, name: 'aa', is_deprecated: 0, is_hidden: 0, is_food: 1, lemma: 'aa', singular_if_unspecified: 0, is_mass_noun: 1 },
    { id: 466, name: 'aaa', is_deprecated: 0, is_hidden: 0, is_food: 1, lemma: 'aaa', singular_if_unspecified: 0, is_mass_noun: 1 },
  ];
  const recipeIngredientRowsByRecipeId = new Map([
    [
      1,
      [
        {
          id: 10,
          section_id: null,
          sort_order: 1,
          quantity: 1,
          unit: 'cup',
          ingredients: { id: 1, name: 'bar', ingredient_variants: [] },
        },
      ],
    ],
    [
      2,
      [
        {
          id: 11,
          section_id: null,
          sort_order: 1,
          quantity: 1,
          unit: 'lb',
          ingredients: { id: 2, name: 'beef', ingredient_variants: [] },
        },
      ],
    ],
    [
      3,
      [
        {
          id: 12,
          section_id: null,
          sort_order: 1,
          quantity: 1,
          quantity_min: 1,
          quantity_max: 2,
          quantity_is_approx: false,
          unit: '',
          ingredients: { id: 1, name: 'bar', ingredient_variants: [] },
        },
      ],
    ],
    [
      267,
      [
        {
          id: 1457,
          section_id: null,
          sort_order: 1,
          quantity: '1',
          quantity_min: 1,
          quantity_max: 1,
          quantity_is_approx: false,
          unit: '',
          ingredients: { id: 464, name: 'a', ingredient_variants: [] },
        },
        {
          id: 1458,
          section_id: null,
          sort_order: 2,
          quantity: '1',
          quantity_min: 1,
          quantity_max: 1,
          quantity_is_approx: false,
          unit: '',
          ingredients: { id: 465, name: 'aa', ingredient_variants: [] },
        },
        {
          id: 1459,
          section_id: null,
          sort_order: 3,
          quantity: '1',
          quantity_min: 1,
          quantity_max: 1,
          quantity_is_approx: false,
          unit: '',
          ingredients: { id: 466, name: 'aaa', ingredient_variants: [] },
        },
      ],
    ],
  ]);
  const subrecipeLinkRowsByRecipeId = new Map([
    [
      1,
      [
        {
          id: 100,
          section_id: null,
          sort_order: 2,
          quantity: 2,
          quantity_min: 2,
          quantity_max: 2,
          quantity_is_approx: false,
          unit: '',
          prep_notes: '',
          is_optional: false,
          parenthetical_note: '',
          linked_recipe_id: 2,
          recipe_text: '',
          is_alt: false,
          linked_recipe: { title: 'Child Recipe' },
        },
      ],
    ],
  ]);
  const recipeRowsById = new Map([
    [
      1,
      {
        id: 1,
        title: 'Foo',
        summary: '',
        servings_default: 1,
        servings_min: null,
        servings_max: null,
      },
    ],
    [
      2,
      {
        id: 2,
        title: 'Child Recipe',
        summary: '',
        servings_default: 1,
        servings_min: null,
        servings_max: null,
      },
    ],
    [
      3,
      {
        id: 3,
        title: 'Scaled Foo',
        summary: '',
        servings_default: 10,
        servings_min: null,
        servings_max: null,
      },
    ],
    [
      267,
      {
        id: 267,
        title: 'AAA Soup',
        summary: '',
        servings_default: 1,
        servings_min: 0.5,
        servings_max: 99,
      },
    ],
  ]);

  async function fetchMock(url, options = {}) {
    const parsed = new URL(url);
    const pathWithQuery = `${parsed.pathname.replace(/^\/rest\/v1\//, '')}${parsed.search}`;

    if (pathWithQuery === 'rpc/save_recipe') {
      captured.saveRecipePayload = JSON.parse(options.body || '{}');
      return makeJsonResponse({ id: 1 });
    }
    if (pathWithQuery.startsWith('ingredients?select=id,name,variant')) {
      return makeJsonResponse(ingredientRows);
    }
    if (pathWithQuery.startsWith('ingredient_variants?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('tags?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('ingredient_variant_tag_map?select=')) {
      return makeJsonResponse([]);
    }
    if (pathWithQuery.startsWith('recipe_ingredient_map?recipe_id=eq.')) {
      const recipeId = Number(pathWithQuery.match(/recipe_id=eq\.(\d+)/)?.[1]);
      return makeJsonResponse(recipeIngredientRowsByRecipeId.get(recipeId) || []);
    }
    if (pathWithQuery.startsWith('recipe_subrecipe_links?recipe_id=eq.')) {
      const recipeId = Number(pathWithQuery.match(/recipe_id=eq\.(\d+)/)?.[1]);
      return makeJsonResponse(subrecipeLinkRowsByRecipeId.get(recipeId) || []);
    }
    if (pathWithQuery.startsWith('recipes?select=')) {
      const recipeId = Number(pathWithQuery.match(/id=eq\.(\d+)/)?.[1]);
      const row = recipeRowsById.get(recipeId);
      return makeJsonResponse(row ? [row] : []);
    }

    return makeJsonResponse([]);
  }

  fetchMock.captured = captured;
  return fetchMock;
}

function createContext() {
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const ingredientDisplaySource = fs.readFileSync(ingredientDisplayPath, 'utf8');
  const unitQuantityFormatSource = fs.readFileSync(unitQuantityFormatPath, 'utf8');
  const favoriteEatsAmountKitSource = fs.readFileSync(favoriteEatsAmountKitPath, 'utf8');
  const cookingVolumeLadderSource = fs.readFileSync(cookingVolumeLadderPath, 'utf8');
  const quantityDisplayPolicySource = fs.readFileSync(quantityDisplayPolicyPath, 'utf8');
  const recipeIngredientAmountModelSource = fs.readFileSync(
    recipeIngredientAmountModelPath,
    'utf8',
  );
  const planRecipeCacheSource = fs.readFileSync(planRecipeCachePath, 'utf8');
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');

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
    URL,
    localStorage: null,
    sessionStorage: null,
    formatShoppingPlanQuantity(quantity) {
      const numeric = Number(quantity);
      if (!Number.isFinite(numeric) || numeric <= 0) return '';
      return String(Number(numeric.toFixed(2)));
    },
  };
  context.window = context;

  vm.createContext(context);
  installMeasuredUnitRegistry(context);
  vm.runInContext(decimalSnippet, context, { filename: 'utils.decimal-display.js' });
  vm.runInContext(grammarSnippet, context, { filename: 'utils.ingredient-grammar.js' });
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
  vm.runInContext(recipeIngredientAmountModelSource, context, {
    filename: 'recipeIngredientAmountModel.js',
  });
  vm.runInContext(planRecipeCacheSource, context, {
    filename: 'favoriteEatsPlanRecipeCache.js',
  });
  vm.runInContext(adapterSource, context, { filename: 'supabaseAdapter.js' });

  if (typeof context.createSupabaseAdapter !== 'function') {
    throw new Error('Supabase adapter factory was not attached.');
  }
  return context;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

async function run() {
  const context = createContext();
  const fetchImpl = createFetchMock();
  const adapter = context.createSupabaseAdapter({
    url: 'https://example.test',
    anonKey: 'anon',
    fetchImpl,
  });

  const rows = await adapter.listShoppingListPlanRows({
    selectedRecipes: [{ recipeId: 1, title: 'Foo', quantity: 1 }],
  });
  const byName = new Map(rows.map((row) => [row.name, row]));

  assertEqual(
    byName.get('bar')?.text,
    'bars (1 cup)',
    'Supabase path pluralizes list labels and keeps 1 cup in the detail',
  );
  assertEqual(
    byName.get('beef')?.text,
    'beef (2 lb)',
    'Supabase path expands linked subrecipe rows from recipe_subrecipe_links'
  );

  const scaledRows = await adapter.listShoppingPlanRecipeItems([
    { recipeId: 3, title: 'Scaled Foo', quantity: 1, servings: 100 },
  ]);
  const scaledBar = scaledRows.find((row) => row.name === 'bar');
  assertEqual(
    scaledBar?.quantity,
    10,
    'scalar ingredient quantity wins over stale range endpoints before servings scaling'
  );

  await adapter.saveRecipe({
    id: 1,
    title: 'Foo',
    sections: [
      {
        ingredients: [
          {
            isRecipe: true,
            linkedRecipeId: 2,
            name: 'Child Recipe',
            quantity: 2,
            quantityMin: 1,
            quantityMax: 3,
            sortOrder: 1,
          },
        ],
      },
    ],
  });
  const savePayload = fetchImpl.captured.saveRecipePayload.recipe_payload;
  assertEqual(savePayload.ingredients.length, 0, 'linked recipe is omitted from ingredients payload');
  assertEqual(savePayload.subrecipes.length, 1, 'linked recipe is saved as subrecipe payload');
  assertEqual(
    savePayload.subrecipes[0].linked_recipe_id,
    2,
    'subrecipe payload carries linked recipe id'
  );
  assertEqual(
    savePayload.subrecipes[0].quantity_min,
    2,
    'subrecipe scalar save collapses stale min endpoint'
  );
  assertEqual(
    savePayload.subrecipes[0].quantity_max,
    2,
    'subrecipe scalar save collapses stale max endpoint'
  );

  const aaaRows = await adapter.listShoppingListPlanRows({
    selectedRecipes: [{ recipeId: 267, title: 'AAA Soup', quantity: 1, servings: 1 }],
  });
  const aaaByName = new Map(aaaRows.map((row) => [row.name, row]));
  for (const itemName of ['a', 'aa', 'aaa']) {
    assertEqual(
      aaaByName.get(itemName)?.detailText,
      '1',
      `mass-noun catalog item ${itemName} keeps scalar recipe amount`,
    );
    assertEqual(
      aaaByName.get(itemName)?.buckets?.[0]?.kind,
      'count',
      `mass-noun catalog item ${itemName} uses count bucket`,
    );
  }

  context.favoriteEatsPlanRecipeCache.stash(267, {
    id: 267,
    title: 'AAA Soup',
    servings: { default: 1, min: 0.5, max: 99 },
    sections: [
      {
        ingredients: [
          {
            rowType: 'ingredient',
            name: 'a',
            quantity: '',
            quantityMin: null,
            quantityMax: null,
            unit: '',
            variant: '',
          },
        ],
      },
    ],
  });
  const bypassRows = await adapter.listShoppingListPlanRows({
    selectedRecipes: [{ recipeId: 267, title: 'AAA Soup', quantity: 1, servings: 1 }],
  });
  assertEqual(
    bypassRows.find((row) => row.name === 'a')?.detailText,
    '1',
    'plan row generation bypasses stale session plan-recipe cache',
  );

  console.log('Supabase shopping list plan row tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
