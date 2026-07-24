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
const adapter = fs.readFileSync(
  path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js'),
  'utf8',
);
const migration = fs.readFileSync(
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

assert(
  migration.includes('quantity_unspecified') &&
    migration.includes('p_quantity_unspecified boolean default false') &&
    migration.includes('selected_items_quantity_check') &&
    migration.includes('quantity_unspecified = true') &&
    migration.includes(
      "'quantityUnspecified', case when si.quantity_unspecified then true else null end",
    ),
  'Migration should add quantity_unspecified and round-trip quantityUnspecified in load/save.',
);

assert(
  /applyShoppingAddByTagSelections[\s\S]*planKeyHasBrowsePlannerSelection\((planKey|key)\)[\s\S]*enqueueShoppingPlannerUnspecifiedSelection/.test(
    screen,
  ),
  'Add by tag should skip existing planner selections and enqueue direct some.',
);

assert(
  screen.includes('const shoppingQuantityUnspecifiedKeys = new Set();') &&
    screen.includes('setShoppingUnspecifiedSelection') &&
    screen.includes('quantityUnspecified: true'),
  'Items planner should track and persist direct unspecified selections.',
);

assert(
  main.includes("kind: 'unspecified', quantity: 1") &&
    /addSelectedItemBucket[\s\S]*quantityUnspecified/.test(main),
  'Local plan-row builder should render direct unspecified selections as some.',
);

assert(
  /normalizePlanRowsSelectedItems[\s\S]*quantityUnspecified/.test(adapter) &&
    /entry\.quantityUnspecified[\s\S]*makePlanRowsBucket\(\{ kind: 'unspecified' \}\)/.test(
      adapter,
    ) &&
    adapter.includes('p_quantity_unspecified'),
  'Supabase adapter should map direct unspecified selections to some buckets and RPC flag.',
);

assert(
  screen.includes('flushPlannerSelectionsAfterBulkAddIfRemote') &&
    screen.includes('persistPlannerItemSelectionsWholesaleIfRemote') &&
    /meta\.quantityUnspecified === true[\s\S]*rpcDeleted/.test(screen),
  'Add-by-tag should reject deleted unspecified RPC acks and fall back to wholesale plan save.',
);

console.log('shopping add-by-tag unspecified tests passed.');
