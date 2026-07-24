#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const screen = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'itemsPage.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');
const rpcMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260524162400_set_plan_item_quantity_rpc.sql',
  ),
  'utf8',
);
const rpcResetMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260525204109_set_plan_item_quantity_reset_checked.sql',
  ),
  'utf8',
);
const rpcUnspecifiedMigration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260724143000_plan_selected_items_quantity_unspecified.sql',
  ),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

[
  '[favorite-eats-items-quantity-stepper]',
  'enqueue requested',
  'local applied',
  'flush started',
  'rpc returned',
  'ack',
  'child patch applied',
  'child patch skipped',
  'flush failed',
].forEach((needle) => {
  assert(
    screen.includes(needle),
    `Items quantity path should log proof event: ${needle}.`,
  );
});

assert(
  screen.includes('let favoriteEatsItemsQuantityQueue = null') &&
    screen.includes('function getFavoriteEatsItemsQuantityQueue') &&
    screen.includes("storageKey: 'favoriteEatsInputSync:plan:items:v1'") &&
    screen.includes('global.favoriteEatsPlanItemsQuantityQueue') &&
    screen.includes('window.favoriteEatsPlanItemsQuantityQueue = shoppingPlannerQtyInputQueue') &&
    screen.includes('flushAll()'),
  'Items quantity queue should be singleton/module-scoped, durable, exposed, and flushed on pagehide.',
);

assert(
  screen.includes('getDirectShoppingQty') &&
    screen.includes('getBrowsePlannerPlainStepQty') &&
    screen.includes('getNextBrowsePlannerDirectQty') &&
    screen.includes('syncBrowsePlannerStepperAfterQtyChange') &&
    screen.includes('browsePlannerDecreaseClearsSelection') &&
    screen.includes('getShoppingRowHasSelection') &&
    screen.includes('planKeyHasBrowsePlannerSelection') &&
    screen.includes('formatShoppingBrowsePlannerDisplayDetailText') &&
    screen.includes('browsePlannerRowHasAmountTail') &&
    /planKeyHasBrowsePlannerSelection[\s\S]*getBrowsePlannerPlainStepQty\(planKey\)/.test(
      screen,
    ) &&
    /buildBrowsePlannerRowStepperOptions[\s\S]*qty: plainStepQty/.test(screen) &&
    main.includes('isShoppingBrowsePlannerWholeNumberOnlyBuckets') &&
    main.includes('formatShoppingBrowsePlannerDisplayDetailText') &&
    !screen.includes('enqueueBrowsePlannerPlainStepQty'),
  'Items browse planner stepper should show plain-step qty while bucket-2 tails stay in parens.',
);

assert(
  /recomputeShoppingChipCounts\(\)[\s\S]{0,220}rerenderShoppingFilterChips\(\)/.test(
    screen,
  ),
  'Recipe-derived chip count changes should rerender filter chips, not dock sync only.',
);

assert(
  screen.includes('shoppingPlannerQtyInputQueue.enqueue') &&
    screen.includes('applyShoppingPlannerQtyLocal') &&
    screen.includes('flushShoppingPlannerQtyToRemote') &&
    screen.includes('window.dataService.setPlanItemQuantity(request)'),
  'Items quantity input should use the split local-apply / narrow-RPC queue path.',
);

const flushBlock = extractFunction(screen, 'flushShoppingPlannerQtyToRemote');
assert(
  !flushBlock.includes('setShoppingQtyFromDirectValue') &&
    !flushBlock.includes('persistShoppingPlan') &&
    !flushBlock.includes('setShoppingPlanItemSelection') &&
    !flushBlock.includes('forceRemoteSave'),
  'Items quantity flush must not write the local container or call a whole-plan save path.',
);

assert(
  screen.includes('applyShoppingPlannerQtyRemotePatch') &&
    screen.includes("String(payload.table || '') !== 'selected_items'") &&
    screen.includes('shoppingPlannerQtyInputQueue.shouldSkipEcho') &&
    screen.includes('shoppingPlannerQtyInputQueue.recordEchoApplied') &&
    screen.includes('pending: !!queueState?.pending') &&
    screen.includes('inFlight: !!queueState?.inFlight') &&
    screen.includes('refreshShoppingSelectionUi({ fullRerender: false })'),
  'Items quantity child realtime should apply/skip per-key patches without rebuilding the page.',
);

assert(
  main.includes("String(payload.table || '') === 'documents'") &&
    main.includes('[favorite-eats-items-quantity-stepper]') &&
    main.includes('parent event absorbed') &&
    main.includes('companion event absorbed') &&
    main.includes("String(payload.table || '') === 'store_preferences'") &&
    /String\(payload\.table \|\| ''\) === 'documents'[\s\S]*return;[\s\S]*runFavoriteEatsRemotePlanPatchHooks\(payload\)/.test(
      main,
    ),
  'plan companion realtime events should be absorbed before wholesale fallback.',
);

assert(
  main.includes('function applyFavoriteEatsPlanSelectedItemRealtimePatch') &&
    main.includes("String(payload.table || '') !== 'selected_items'") &&
    main.includes('window.favoriteEatsPlanItemsQuantityQueue') &&
    main.includes('queue.shouldSkipEcho') &&
    main.includes('queue.recordEchoApplied') &&
    main.includes('setShoppingPlanItemSelection') &&
    main.includes('{ skipRemoteSave: true }') &&
    main.includes('runFavoriteEatsRemotePlanUiRefreshHooksOnly') &&
    main.includes('scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly') &&
    main.includes('PLAN_SELECTED_ITEMS_UI_REFRESH_DEBOUNCE_MS') &&
    main.includes('favoriteEatsPlanSelectedItemsUiRefreshTimer') &&
    main.includes('ui refresh coalesced') &&
    /function scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly[\s\S]*clearTimeout\(favoriteEatsPlanSelectedItemsUiRefreshTimer\)[\s\S]*setTimeout\([\s\S]*runFavoriteEatsRemotePlanUiRefreshHooksOnly\(\)[\s\S]*PLAN_SELECTED_ITEMS_UI_REFRESH_DEBOUNCE_MS/.test(
      main,
    ) &&
    /String\(payload\.table \|\| ''\) === 'selected_items'[\s\S]*applyFavoriteEatsPlanSelectedItemRealtimePatch\(payload\)[\s\S]*scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly\([\s\S]*return;[\s\S]*String\(payload\.table \|\| ''\) === 'documents'/.test(
      main,
    ),
  'plan.selected_items realtime should patch child rows immediately and coalesce passive UI refreshes before wholesale fallback.',
);

assert(
  main.includes(
    "/^plan realtime fallback:plan\\.(selected_items|selected_recipe_roots|selected_recipes|documents|store_preferences)$/",
  ) &&
    main.includes('absorbedPlanRealtimeMatch') &&
    main.includes('return;'),
  'Known migrated plan realtime tables should fail closed at hydrate scheduling too.',
);

assert(
  main.includes('function mergeRemotePlanForPerKeyStaleness') &&
    main.includes('window.favoriteEatsPlanItemsQuantityQueue') &&
    main.includes('itemSelections: merged') &&
    main.includes('function seedShoppingPlanItemsQuantityQueueFromRemotePlan') &&
    main.includes('seedShoppingPlanItemsQuantityQueueFromRemotePlan(remoteState.plan)') &&
    main.includes('__favoriteEatsHydrateSource') &&
    main.includes('plan hydrate scheduled') &&
    main.includes('plan hydrate started'),
  'Wholesale plan hydrate should run protected item merge and seed item queue state.',
);

assert(
  !/forceRemoteSave:\s*true/.test(screen) &&
    !screen.includes('scheduleCoalescedPlanSaveToDataService') &&
    !flushBlock.includes('setShoppingQtyFromDirectValue'),
  'Items quantity routine input should not use old whole-plan save/refresh shortcuts.',
);

assert(
  rpcMigration.includes(
    'create or replace function catalog.set_plan_item_quantity',
  ),
  'Items quantity narrow RPC migration should exist.',
);
assert(
  /create or replace function catalog\.set_plan_item_quantity[\s\S]*returning updated_at into v_updated_at[\s\S]*'updated_at', v_updated_at/.test(
    rpcMigration,
  ) &&
    rpcMigration.includes('update plan.documents') &&
    rpcMigration.includes('version = version + 1'),
  'Items quantity RPC should return child updated_at and bump plan.documents.',
);

assert(
  rpcResetMigration.includes(
    'create or replace function catalog.set_plan_item_quantity',
  ) &&
    rpcResetMigration.includes('v_reset_source_key') &&
    rpcResetMigration.includes('update list.row_overrides') &&
    rpcResetMigration.includes('set checked = false') &&
    rpcResetMigration.includes('source_key in') &&
    rpcResetMigration.includes("'checked_reset_count', v_reset_checked_count") &&
    !rpcResetMigration.includes('save_shopping_state'),
  'Removing an Items quantity row should reset matching shopping-list checked override without whole-list save.',
);

assert(
  screen.includes('getBrowsePlannerItemDefaultPlanKey') &&
    screen.includes('itemNeedsPlannerExpandableRow') &&
    screen.includes('noVariantPlannerRowDomMismatch') &&
    screen.includes("allVariantNames: ['default']") &&
    screen.includes('needsExpandableRow') &&
    /itemNeedsPlannerExpandableRow[\s\S]*browsePlannerRowHasAmountTail\(planKey\)/.test(
      screen,
    ),
  'No-variant Items browse rows should expand only when recipe amount tails exist.',
);

const listRowStepperSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'listRowStepper.js'),
  'utf8',
);
assert(
  screen.includes('const openBrowsePlannerStepper = (planKey) =>') &&
    screen.includes('const toggleBrowsePlannerStepper = (planKey, onAfter) =>') &&
    /openBrowsePlannerStepper[\s\S]*planKeyHasBrowsePlannerSelection\(normalized\)/.test(
      screen,
    ) &&
    /toggleBrowsePlannerStepper[\s\S]*openBrowsePlannerStepper\(normalized\)/.test(
      screen,
    ) &&
    /focusShoppingPlannerRow[\s\S]*toggleBrowsePlannerStepper\(key/.test(screen) &&
    /focusChildVariantStepper[\s\S]*toggleBrowsePlannerStepper\(varKey/.test(
      screen,
    ) &&
    /openBrowsePlannerStepper\(simpleRowKey\(\)\)/.test(screen) &&
    !/focusChildVariantStepper[\s\S]*hasPositiveShoppingQty\(plain\)/.test(screen) &&
    !/focusShoppingPlannerRow[\s\S]*hasPositiveShoppingQty\(plain\)/.test(screen),
  'Items browse planner stepper open/toggle should share planKeyHasBrowsePlannerSelection eligibility.',
);

assert(
  listRowStepperSource.includes('getPlannerRowTextBudgetPx') &&
    listRowStepperSource.includes('getPlannerRowLabelGroupBudgetPx') &&
    listRowStepperSource.includes('measurePlannerRowChevronReservePx') &&
    listRowStepperSource.includes('truncatePlannerRowTextToFitPx') &&
    listRowStepperSource.includes('syncVariantParentTrailingReserve(rowEl, true)') &&
    screen.includes('fitExpandedVariantParentName') &&
    screen.includes('list-row-label-group') &&
    screen.includes('shopping-list-doc-detail-more-suffix') &&
    screen.includes('applyVariantParentFoldedHeadline') &&
    screen.includes('fitVariantParentFoldedLine') &&
    screen.includes('fitParentHeadline') &&
    screen.includes('fitVariantParentHeadlineByKey') &&
    screen.includes('list-row-label-group--fit-pending') &&
    screen.includes('list-row-detail--js-fitted') &&
    screen.includes('ensureVariantParentHeadlineFitObserver') &&
    screen.includes('getPlannerRowLabelGroupBudgetPx(li)'),
  'Items variant-parent headlines should use canonical fit, reserve stepper column, and glue chevrons in a label group.',
);

assert(
  rpcUnspecifiedMigration.includes('p_quantity_unspecified boolean default false') &&
    rpcUnspecifiedMigration.includes('quantity_unspecified'),
  'Items quantity RPC migration should support direct unspecified selections.',
);

assert(
  screen.includes('enqueueShoppingPlannerUnspecifiedSelection') &&
    screen.includes('setShoppingUnspecifiedSelection'),
  'Items quantity path should enqueue direct unspecified selections separately from numeric qty.',
);

console.log('shopping plan items quantity architecture tests passed.');
