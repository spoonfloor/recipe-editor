#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(projectRoot, 'js', 'main.js'), 'utf8');
const screen = fs.readFileSync(
  path.join(projectRoot, 'js', 'screens', 'itemsPage.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractConstFunction(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert(start !== -1, `Missing ${name}.`);
  const bodyStart = source.indexOf('{', start);
  assert(bodyStart !== -1, `Missing ${name} body.`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}.`);
}

const quantityFlushBlock = extractConstFunction(
  screen,
  'flushShoppingPlannerQtyToRemote',
);

assert(
  main.includes('flushCoalescedPlanSaveToDataService') &&
    /registerFavoriteEatsItemsPageDeps\(\{[\s\S]*flushCoalescedPlanSaveToDataService[\s\S]*\}\);/.test(
      main,
    ),
  'Items page deps should expose the coalesced plan-save flush.',
);

assert(
  /clearShoppingPlanSelections\(\{[\s\S]*allowEmptyPlanRemoteSave: true[\s\S]*\}\);[\s\S]*await flushCoalescedPlanSaveToDataService\(\{ awaited: true \}\)/.test(
    screen,
  ),
  'Items reset should flush the intentional empty-plan save before reporting success.',
);

assert(
  screen.includes('abortPlanInputSyncQueuesForWholesaleClear') &&
    /await abortPlanInputSyncQueuesForWholesaleClear\(\)/.test(screen) &&
    screen.includes('clearShoppingPlannerUiState()') &&
    screen.includes('refreshItemsAfterPlanClear'),
  'Items clear should abort narrow queues, reset full planner UI state, and refresh from remote.',
);

assert(
  main.includes('function abortPlanInputSyncQueuesForWholesaleClear') &&
    /applyShoppingStateEchoFromSaveResponse\(rs, \{[\s\S]*allowEmptyPlanRemoteSave/.test(
      main,
    ),
  'Empty-plan save echo should apply wholesale and abort queued narrow writes.',
);

assert(
  !quantityFlushBlock.includes('flushCoalescedPlanSaveToDataService'),
  'Routine Items quantity flush must not use the whole-plan flush helper.',
);

console.log('items reset remote flush tests passed.');
