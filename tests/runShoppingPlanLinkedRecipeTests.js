#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function createLocalStorageMock(seed = {}) {
  const store = new Map(
    Object.entries(seed).map(([key, value]) => [String(key), String(value)])
  );
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadShoppingPlanFunctions({ recipes = {}, servingsOverrides = {} } = {}) {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    '// --- Shopping plan helpers (tests extract this block) ---',
    'function detectPageIdFromBody() {'
  );

  const localStorage = createLocalStorageMock({
    'favoriteEats:test:recipe-planner-servings': JSON.stringify(servingsOverrides),
  });

  const context = {
    console,
    localStorage,
    isDemoSessionActive() {
      return false;
    },
    favoriteEatsShouldUseSupabaseDataDoor() {
      return false;
    },
    favoriteEatsDataServiceIsSupabaseActive() {
      return false;
    },
    parseNumericQuantityValue(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    },
    normalizeShoppingListUnit(unit) {
      return String(unit || '').trim().toLowerCase();
    },
    convertShoppingListQuantityToMeasuredBase() {
      return null;
    },
    formatShoppingListDisplayDetailText({ buckets = [] } = {}) {
      return buckets
        .map((bucket) => {
          if (bucket?.kind === 'measured') return String(bucket.baseQuantity || 0);
          return String(bucket?.quantity || 0);
        })
        .join(' + ');
    },
    formatShoppingListDisplayRow({ label = '', buckets = [] } = {}) {
      return `${label} (${context.formatShoppingListDisplayDetailText({ buckets })})`;
    },
    getShoppingListIngredientLabel(name, variantName = '') {
      return variantName ? `${variantName} ${name}` : String(name || '').trim();
    },
    getVisibleIngredientNamePool() {
      return ['onion', 'garlic', 'salt', 'pepper'];
    },
    orderShoppingListSelectedStoreIds() {
      return [];
    },
    getShoppingListAssignmentCandidates() {
      return [];
    },
    buildGroupedShoppingListRows(items) {
      return Array.isArray(items) ? items : [];
    },
    window: {
      dbInstance: { exec() { return []; } },
      favoriteEatsStorageKeys: {
        recipePlannerServings: 'favoriteEats:test:recipe-planner-servings',
      },
      normalizeActionableQuantity(value) {
        return value;
      },
      bridge: {
        loadRecipeFromDB(_db, recipeId) {
          const recipe = recipes[String(Math.trunc(Number(recipeId)))];
          if (!recipe) throw new Error(`Unknown recipe ${recipeId}`);
          return clone(recipe);
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(snippet, context, {
    filename: 'main.shopping-plan-linked-recipe-tests.js',
  });

  return context;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`
  );
}

function rowMap(rows) {
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => String(row?.rowType || '').trim().toLowerCase() !== 'section')
      .map((row) => [String(row?.key || ''), row])
      .filter(([key]) => key)
  );
}

function sortedEntries(map, select) {
  return Array.from(map.values())
    .sort((a, b) => String(a?.key || '').localeCompare(String(b?.key || '')))
    .map(select);
}

function runNestedLinkedRecipeTest() {
  const recipes = {
    1: {
      id: 1,
      title: 'Root',
      servings: { default: 4 },
      sections: [
        {
          ingredients: [
            { name: 'onion', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 2, quantity: 3 },
          ],
        },
      ],
    },
    2: {
      id: 2,
      title: 'Sauce',
      servings: { default: 2 },
      sections: [
        {
          ingredients: [
            { name: 'garlic', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 3, quantity: 2 },
          ],
        },
      ],
    },
    3: {
      id: 3,
      title: 'Stock',
      servings: { default: 5 },
      sections: [
        {
          ingredients: [
            { name: 'salt', quantity: 0.5 },
            { isRecipe: true, linkedRecipeId: 4, quantity: 2 },
          ],
        },
      ],
    },
    4: {
      id: 4,
      title: 'Spice Mix',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [{ name: 'pepper', quantity: 1 }],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({
    recipes,
    servingsOverrides: {
      1: 8,
      2: 4,
      3: 10,
    },
  });

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 1,
    title: 'Root',
    quantity: 2,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['garlic', 2],
      ['onion', 4],
      ['salt', 1],
    ],
    'bootstrapped linked roots contribute independently (no stacked inline expansion)'
  );
  assert(!derivedRows.has('pepper'), 'bootstrap depth cap should exclude spice mix beyond depth two');

  const selectionRows = rowMap(context.getShoppingPlanSelectionRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(selectionRows, (row) => [
      row.key,
      row.detailText,
      (Array.isArray(row.contributionRows) ? row.contributionRows : []).map((entry) => ({
        title: entry.title,
        detailText: entry.detailText,
      })),
    ]),
    [
      ['garlic', '2', [{ title: 'Sauce', detailText: '2' }]],
      ['onion', '4', [{ title: 'Root', detailText: '4' }]],
      ['salt', '1', [{ title: 'Stock', detailText: '1' }]],
    ],
    'selection rows attribute bootstrapped root contributions independently'
  );
  assert(!selectionRows.has('pepper'), 'selection rows should exclude bootstrap depth overflow');
}

function runCycleGuardTest() {
  const recipes = {
    10: {
      id: 10,
      title: 'Cycle Root',
      servings: { default: 2 },
      sections: [
        {
          ingredients: [
            { name: 'shallot', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 11, quantity: 2 },
          ],
        },
      ],
    },
    11: {
      id: 11,
      title: 'Loop Child',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [
            { name: 'thyme', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 10, quantity: 3 },
          ],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Cycle Root',
    quantity: 1,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['shallot', 1],
      ['thyme', 1],
    ],
    'cycle guard should still bootstrap the direct linked child as its own root'
  );
}

function runHiddenAlternateIngredientSelectionTest() {
  const recipes = {
    21: {
      id: 21,
      title: 'Alternate Root',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [
            { name: 'onion', quantity: 1 },
            { name: 'bar', quantity: 2, isAlt: true },
          ],
        },
      ],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 21,
    title: 'Alternate Root',
    quantity: 1,
  });

  const derivedRows = rowMap(context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(derivedRows, (row) => [row.key, row.quantity]),
    [
      ['bar', 2],
      ['onion', 1],
    ],
    'derived rows should keep alternate ingredients even when not in the browse pool'
  );

  const selectionRows = rowMap(context.getShoppingPlanSelectionRows({ db: { exec() { return []; } } }));
  assertJsonEqual(
    sortedEntries(selectionRows, (row) => [row.key, row.detailText]),
    [
      ['bar', '2'],
      ['onion', '1'],
    ],
    'selection rows should include recipe-sourced alternate ingredients even when hidden from the browse pool'
  );
}

function runLinkedRecipeMaterializedAsPlanRowTest() {
  const recipes = {
    100: {
      id: 100,
      title: 'foo',
      servings: { default: 1 },
      sections: [{ ingredients: [{ name: 'bar', quantity: 5 }] }],
    },
    200: {
      id: 200,
      title: 'baz',
      servings: { default: 1 },
      sections: [
        {
          ingredients: [
            { isRecipe: true, linkedRecipeId: 100, quantity: 1 },
            { name: 'bar', quantity: 1 },
          ],
        },
      ],
    },
  };
  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 200,
    title: 'baz',
    quantity: 1,
  });
  const merged = context.getShoppingPlanRecipeSelections();
  const roots = context.getShoppingPlanRecipeSelectionRoots();
  assert(
    merged['100'] && Number(merged['100'].quantity) > 0,
    'linked recipe foo should appear in merged recipeSelections',
  );
  assert(
    roots['100'] && Number(roots['100'].quantity) > 0,
    'linked recipe foo should be bootstrapped as a plan root',
  );
  const derived = rowMap(
    context.getRecipeDerivedShoppingPlanRows({ db: { exec() { return []; } } }),
  );
  assertJsonEqual(
    sortedEntries(derived, (row) => [row.key, row.quantity]),
    [['bar', 6]],
    'baz inline bar plus 5 bar from linked foo should total 6',
  );
}

function runNormalizeMaterializeFixtureTest() {
  const recipes = {
    100: {
      id: 100,
      title: 'foo',
      servings: { default: 7 },
      sections: [{ ingredients: [{ name: 'bar', quantity: 5 }] }],
    },
    200: {
      id: 200,
      title: 'baz',
      servings: { default: 3 },
      sections: [
        {
          ingredients: [
            { isRecipe: true, linkedRecipeId: 100, quantity: 1 },
            { name: 'bar', quantity: 1 },
          ],
        },
      ],
    },
  };
  const context = loadShoppingPlanFunctions({ recipes });
  const db = context.window.dbInstance;

  const planShape = (plan) => ({
    recipeSelectionRoots: plan.recipeSelectionRoots,
    recipeSelections: plan.recipeSelections,
  });

  const rawExplicitRoots = {
    version: 1,
    itemSelections: {},
    recipeSelections: {},
    recipeSelectionRoots: {
      '200': { key: '200', recipeId: 200, title: 'baz', quantity: 1 },
    },
    storeOrder: [],
    selectedStoreIds: [],
  };

  const rawLegacyMergedOnly = {
    version: 1,
    itemSelections: {},
    recipeSelections: {
      '200': { key: '200', recipeId: 200, title: 'baz', quantity: 1 },
    },
    storeOrder: [],
    selectedStoreIds: [],
  };

  const explicit = context.normalizeShoppingPlan(rawExplicitRoots);
  context.materializeShoppingPlanRecipeSelectionsFromRoots(explicit, db);

  const legacy = context.normalizeShoppingPlan(rawLegacyMergedOnly);
  context.materializeShoppingPlanRecipeSelectionsFromRoots(legacy, db);

  assertJsonEqual(
    planShape(explicit),
    planShape(legacy),
    'normalize+materialize: explicit roots vs legacy merged-only should match',
  );

  const expected = {
    recipeSelectionRoots: {
      '200': { key: '200', recipeId: 200, title: 'baz', quantity: 1 },
    },
    recipeSelections: {
      '200': {
        key: '200',
        recipeId: 200,
        title: 'baz',
        quantity: 1,
        inboundLinkDepth: 0,
        servingsOverride: 3,
      },
    },
  };

  assertJsonEqual(planShape(explicit), expected, 'fixture JSON shape after normalize+materialize');
}

function runLinkedSubrecipeBootstrapLifecycleTest() {
  const recipes = {
    10: {
      id: 10,
      title: 'Meatball Subs',
      servings: { default: 4 },
      sections: [
        {
          ingredients: [
            { name: 'roll', quantity: 1 },
            { isRecipe: true, linkedRecipeId: 20, quantity: 1 },
          ],
        },
      ],
    },
    20: {
      id: 20,
      title: 'Waldorf Salad',
      servings: { default: 4 },
      sections: [{ ingredients: [{ name: 'apple', quantity: 2 }] }],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 1,
  });
  let plan = context.getShoppingPlan();
  assert(
    plan.recipeSelectionRoots['20'] &&
      Number(plan.recipeSelectionRoots['20'].quantity) === 1,
    'adding parent should bootstrap linked subrecipe as a checked root',
  );

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 20,
    title: 'Waldorf Salad',
    quantity: 0,
  });
  plan = context.getShoppingPlan();
  assert(!plan.recipeSelectionRoots['20'], 'unchecking subrecipe removes its root');
  assert(
    plan.recipeSelectionRoots['10'],
    'unchecking subrecipe leaves parent root intact',
  );

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 0,
  });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 1,
    servingsOverride: 8,
  });
  plan = context.getShoppingPlan();
  assert(
    plan.recipeSelectionRoots['20'] &&
      Number(plan.recipeSelectionRoots['20'].quantity) === 1,
    're-adding parent after opt-out should bootstrap subrecipe again (no remembered no-thanks)',
  );

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 0,
  });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 20,
    title: 'Waldorf Salad',
    quantity: 1,
    servingsOverride: 999,
  });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 1,
  });
  plan = context.getShoppingPlan();
  assert(
    Number(plan.recipeSelectionRoots['20'].servingsOverride) === 999,
    're-adding parent must not bump subrecipe servings when subrecipe stayed on plan',
  );

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 0,
  });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 20,
    title: 'Waldorf Salad',
    quantity: 0,
  });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 10,
    title: 'Meatball Subs',
    quantity: 1,
  });
  plan = context.getShoppingPlan();
  assert(
    Number(plan.recipeSelectionRoots['20'].servingsOverride) === 4,
    're-adding parent after subrecipe removal should bootstrap subrecipe at default servings',
  );
}

function runLastRootRemoveClearsSelectionsTest() {
  const recipes = {
    42: {
      id: 42,
      title: 'Banh Mi',
      servings: { default: 4 },
      sections: [{ ingredients: [{ name: 'bread', quantity: 1 }] }],
    },
  };

  const context = loadShoppingPlanFunctions({ recipes });
  context.setShoppingPlanRecipeRootSelection({
    recipeId: 42,
    title: 'Banh Mi',
    quantity: 1,
    servingsOverride: 10,
  });

  const before = context.getShoppingPlan();
  assert(
    Object.keys(before.recipeSelectionRoots || {}).length === 1,
    'expected one root before remove',
  );

  context.setShoppingPlanRecipeRootSelection({
    recipeId: 42,
    title: 'Banh Mi',
    quantity: 0,
  });

  const after = context.getShoppingPlan();
  assert(
    Object.keys(after.recipeSelectionRoots || {}).length === 0,
    'remove should clear recipeSelectionRoots',
  );
  assert(
    Object.keys(after.recipeSelections || {}).length === 0,
    'remove last root should clear recipeSelections (not re-seed from stale merged rows)',
  );
}

function run() {
  runNestedLinkedRecipeTest();
  runCycleGuardTest();
  runHiddenAlternateIngredientSelectionTest();
  runLinkedRecipeMaterializedAsPlanRowTest();
  runNormalizeMaterializeFixtureTest();
  runLinkedSubrecipeBootstrapLifecycleTest();
  runLastRootRemoveClearsSelectionsTest();
  console.log('Shopping plan linked recipe tests passed.');
}

run();
