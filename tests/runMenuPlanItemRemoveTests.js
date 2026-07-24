#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const itemsPagePath = path.join(projectRoot, 'js', 'screens', 'itemsPage.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

const main = read(mainPath);
const itemsPage = read(itemsPagePath);

assert(
  main.includes('function classifyMenuPlanItemRemoveCase(') &&
    main.includes("if (direct && !recipe) return 'direct-only'") &&
    main.includes("if (!direct && recipe) return 'recipe-only'") &&
    main.includes("if (direct && recipe) return 'mixed'"),
  'main.js should define menu plan item remove classification.',
);

assert(
  main.includes('async function promptRemoveItemFromMenuPlan(') &&
    main.includes("confirmText: 'OK'") &&
    main.includes('showCancel: false') &&
    main.includes("confirmText = 'Remove direct amount'") &&
    main.includes('from menu plan?'),
  'main.js should define promptRemoveItemFromMenuPlan with agreed copy.',
);

assert(
  main.includes('promptRemoveItemFromMenuPlan,') &&
    main.includes('classifyMenuPlanItemRemoveCase,'),
  'Items page bridge should export menu plan remove helpers.',
);

assert(
  itemsPage.includes('function getMenuPlanItemRemoveContext') ||
    itemsPage.includes('const getMenuPlanItemRemoveContext ='),
  'itemsPage should gather menu plan remove context per plan key.',
);

assert(
  itemsPage.includes('runMenuPlanItemRemove(') &&
    itemsPage.includes('promptRemoveItemFromMenuPlan({') &&
    itemsPage.includes("String(entry?.sourceType || '') === 'recipe'"),
  'itemsPage should route remove gestures through runMenuPlanItemRemove.',
);

assert(
  !/getMenuPlanItemRemoveContext[\s\S]*browsePlannerRowHasAmountTail\(key\)/.test(
    itemsPage,
  ),
  'Menu plan remove should not treat manual some display tails as recipe usage.',
);

assert(
  !itemsPage.includes('canResetBrowsePlannerDirectRow') &&
  !itemsPage.includes('promptRemoveVariantParentFromPlanningList'),
  'itemsPage should not silently skip recipe-only removes or bulk-remove parents.',
);

assert(
  itemsPage.includes('plannerParentHandlesRemoveDirectly(') &&
    itemsPage.includes('runMenuPlanParentItemRemove(') &&
    itemsPage.includes('handlePlannerParentPrimaryRemoveGesture'),
  'itemsPage should route parent remove vs expand based on variant count.',
);

assert(
  itemsPage.includes('isShoppingBrowseBaseVariantName') &&
    /named\.length === 1/.test(itemsPage) &&
    /names\.length === 1/.test(itemsPage),
  'Single-variant and base/any-only parents should allow direct remove.',
);

assert(
  /plannerSelectMode && isControlClickRemoveGesture\(event\)[\s\S]*handlePlannerParentPrimaryRemoveGesture\(\)/.test(
    itemsPage,
  ),
  'Parent ctrl+click should use handlePlannerParentPrimaryRemoveGesture.',
);

console.log('menu plan item remove tests passed.');
