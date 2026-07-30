#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(
    projectRoot,
    'supabase',
    'migrations',
    '20260730120000_plan_selected_items_composable_unspecified.sql',
  ),
  'utf8',
);
const screen = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'itemsPage.js'),
  'utf8',
);
const main = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');
const adapter = fs.readFileSync(
  path.join(projectRoot, 'js', 'data', 'adapters', 'supabaseAdapter.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migration.includes('v_unspecified,') &&
    !migration.includes('v_unspecified and v_quantity <= 0,') &&
    migration.includes('create or replace function catalog.set_plan_item_quantity'),
  'Migration should persist quantity_unspecified even when quantity > 0.',
);

assert(
  !screen.includes('shoppingQuantityUnspecifiedKeys.delete(normalizedKey);\n      selectedShoppingNames.add(normalizedKey);') &&
    screen.includes('quantityUnspecified: keepUnspecified') &&
    screen.includes('planKeyHasDirectUnspecifiedSelection(key)'),
  'Items planner should preserve direct some when stepping a numeric direct count.',
);

assert(
  /addSelectedItemBucket[\s\S]*someBucket[\s\S]*selectedBucket/.test(main) &&
    main.includes('keepPlainStepSeparate = true'),
  'Plan-row builder and display merge should compose direct some with counts and keep plain steps separate.',
);

assert(
  /entry\.quantityUnspecified[\s\S]*makePlanRowsBucket\(\{ kind: 'unspecified' \}\)[\s\S]*makePlanRowsBucket\(\{[\s\S]*kind: 'selected'/.test(
    adapter,
  ),
  'Supabase adapter should emit both unspecified and selected buckets for composable direct selections.',
);

console.log('shopping composable unspecified tests passed.');
