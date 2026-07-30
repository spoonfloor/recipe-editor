#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260704170500_plan_sessions_snapshots.sql',
);
const captureMigrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260705140000_plan_session_autosave_client_capture.sql',
);
const closeActiveMigrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260730180000_close_active_plan_session.sql',
);
const planSessionPath = path.join(
  projectRoot,
  'js',
  'favoriteEatsPlanSession.js',
);
const dataIndexPath = path.join(projectRoot, 'js', 'data', 'index.js');
const mainPath = path.join(projectRoot, 'js', 'main.js');
const itemsPagePath = path.join(projectRoot, 'js', 'screens', 'itemsPage.js');
const shoppingListPagePath = path.join(
  projectRoot,
  'js',
  'screens',
  'shoppingListPage.js',
);
const recipesPagePath = path.join(
  projectRoot,
  'js',
  'screens',
  'recipesPage.js',
);
const recipesHtmlPath = path.join(projectRoot, 'recipes.html');
const shoppingHtmlPath = path.join(projectRoot, 'shopping.html');
const shoppingListHtmlPath = path.join(projectRoot, 'shoppingList.html');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const captureSql = fs.readFileSync(captureMigrationPath, 'utf8');
const closeActiveSql = fs.readFileSync(closeActiveMigrationPath, 'utf8');
const planSessionJs = fs.readFileSync(planSessionPath, 'utf8');
const dataIndexJs = fs.readFileSync(dataIndexPath, 'utf8');
const mainJs = fs.readFileSync(mainPath, 'utf8');
const itemsPageJs = fs.readFileSync(itemsPagePath, 'utf8');
const shoppingListPageJs = fs.readFileSync(shoppingListPagePath, 'utf8');
const recipesPageJs = fs.readFileSync(recipesPagePath, 'utf8');
const recipesHtml = fs.readFileSync(recipesHtmlPath, 'utf8');
const shoppingHtml = fs.readFileSync(shoppingHtmlPath, 'utf8');
const shoppingListHtml = fs.readFileSync(shoppingListHtmlPath, 'utf8');

const planSessionScriptTag =
  '<script src="js/favoriteEatsPlanSession.js"></script>';

assert(
  sql.includes('create table if not exists plan.snapshots'),
  'Migration should create plan.snapshots.',
);
assert(
  sql.includes("create type plan.snapshot_kind as enum ('named', 'auto')"),
  'Migration should define snapshot kind enum.',
);
assert(
  sql.includes('create or replace function catalog.list_plan_sessions()'),
  'Migration should define list_plan_sessions RPC.',
);
assert(
  sql.includes('create or replace function catalog.create_named_plan_session'),
  'Migration should define create_named_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.update_named_plan_session'),
  'Migration should define update_named_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.create_auto_plan_session()'),
  'Migration should define create_auto_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.load_plan_session'),
  'Migration should define load_plan_session RPC.',
);
assert(
  sql.includes('create or replace function catalog.delete_plan_session'),
  'Migration should define delete_plan_session RPC.',
);
assert(
  closeActiveSql.includes(
    'create or replace function catalog.close_active_plan_session()',
  ),
  'Migration should define close_active_plan_session RPC.',
);
assert(
  closeActiveSql.includes('active_named_snapshot_id = null'),
  'Close active session should clear plan.documents.active_named_snapshot_id.',
);
assert(
  sql.includes('internal_trim_auto_plan_sessions'),
  'Migration should trim auto sessions to 8.',
);
assert(
  !sql.includes('v_last_auto_fingerprint'),
  'Auto-save should insert on every call; no fingerprint dedup skip.',
);
assert(
  sql.includes('coalesce(ro.removed, false) = false'),
  'Snapshot capture should exclude removed rows.',
);
assert(
  !sql.includes('ro.checked') || sql.includes('checked = ro.checked'),
  'Load overrides should preserve checked state separately from snapshot payload.',
);

assert(
  planSessionJs.includes('onRemoteSessionCommit'),
  'Plan session module should expose canonical remote-commit gate.',
);
assert(
  planSessionJs.includes('beginSessionCommitBatch') &&
    planSessionJs.includes('endSessionCommitBatch'),
  'Auto-save should coalesce burst remote commits via batch boundaries (Add all).',
);
assert(
  !planSessionJs.includes('REMOTE_COMMIT_AUTO_SAVE_DEBOUNCE_MS'),
  'Auto-save should not debounce remote commits.',
);
assert(
  planSessionJs.includes('buildAutoSaveCapturePayload') &&
    planSessionJs.includes('autoSaveCaptureQueue'),
  'Auto-save should queue commit-time capture payloads (one snapshot per commit ack).',
);
assert(
  !planSessionJs.includes('autoSaveQueued'),
  'Auto-save should not use single-slot queued flag (dropped commits).',
);
assert(
  !planSessionJs.includes('favoriteEatsShouldAllowRemoteSessionCommit'),
  'Auto-save should not veto after a successful remote commit ack.',
);
assert(
  dataIndexJs.includes('withRemoteSessionCommit') &&
    dataIndexJs.includes('notifyRemoteSessionCommit'),
  'data/index.js should own remote-commit ack emission for durable RPCs.',
);
assert(
  dataIndexJs.includes("withRemoteSessionCommit('plan'") &&
    dataIndexJs.includes("withRemoteSessionCommit('listConfig'"),
  'data/index.js should classify plan vs listConfig commits.',
);
assert(
  /withRemoteSessionCommit\('listConfig'[\s\S]*applyShoppingListSourcedRowsSync/.test(
    dataIndexJs,
  ) &&
    /withRemoteSessionCommit\('listConfig'[\s\S]*uncheckAllShoppingListRows/.test(
      dataIndexJs,
    ) &&
    /withRemoteSessionCommit\('listConfig'[\s\S]*restoreRemovedShoppingListRows/.test(
      dataIndexJs,
    ),
  'Bulk list RPCs (reset amounts, uncheck all, restore removed) should ack listConfig commits for auto-save.',
);
assert(
  !mainJs.includes('function emitPlanSessionRemoteCommitAck') &&
    !mainJs.includes('emitPlanSessionRemoteCommitAckForPersistedRequest'),
  'main.js must not emit page-level remote-commit acks.',
);
assert(
  captureSql.includes('p_plan_state jsonb') &&
    captureSql.includes('p_list_overrides_state jsonb'),
  'Auto-save RPC should accept client capture payload at commit ack time.',
);
assert(
  mainJs.includes('resetInputSyncQueuesForWholesaleApply') &&
    mainJs.includes('wholesale: true') &&
    mainJs.includes('favoriteEatsApplyLoadedPlanSession'),
  'Session load should apply wholesale state without per-key staleness merge.',
);
assert(
  fs.readFileSync(path.join(projectRoot, 'js', 'favoriteEatsInputSync.js'), 'utf8')
    .includes('resetKeyStateForWholesaleApply'),
  'Input sync queues should reset ack state on wholesale session load.',
);
assert(
  mainJs.includes('flushPlanNarrowRpcQueuesWithSessionCommitBatch') &&
    mainJs.includes('beginSessionCommitBatch'),
  'main.js should batch narrow RPC flushes for Add all.',
);
assert(
  !itemsPageJs.includes('emitPlanSessionRemoteCommitAck') &&
    !itemsPageJs.includes('favoriteEatsPlanSession?.notifyPlanSessionCommittedChange'),
  'Items page must not ack remote commits directly.',
);
assert(
  itemsPageJs.includes('flushPlanNarrowRpcQueuesWithSessionCommitBatch'),
  'Items bulk planner adds should flush narrow RPC queues through the batch gate.',
);
assert(
  !shoppingListPageJs.includes('notifyListOverridePersisted') &&
    !shoppingListPageJs.includes('emitPlanSessionRemoteCommitAck'),
  'Shopping list page must not ack remote commits directly.',
);
assert(
  !shoppingListPageJs.includes("id = 'appBarShoppingListCancelBtn'") &&
    !shoppingListPageJs.includes("ensureAppBarTextActionPair(webCancelEditBtn") &&
    !shoppingListPageJs.includes('Unsaved shopping list changes') &&
    !shoppingListPageJs.includes('shoppingListRowDraftByRowId'),
  'Shopping list row edits should commit immediately without draft buffers or nav speedbumps.',
);

assert(
  /clearShoppingPlanSelections\(\{[\s\S]*allowEmptyPlanRemoteSave: true[\s\S]*\}\);[\s\S]*await flushCoalescedPlanSaveToDataService\(\{ awaited: true \}\)/.test(
    recipesPageJs,
  ),
  'Recipes clear should await wholesale plan flush before user can rely on Manage.',
);

assert(
  planSessionJs.includes('Manage sessions'),
  'Plan session module should label manage CTA correctly.',
);
assert(
  planSessionJs.includes('Auto-Saved Sessions') &&
    planSessionJs.includes('ui-plan-session-section-title') &&
    planSessionJs.includes('renderAutoSessionRows') &&
    planSessionJs.includes('renderNamedSessionRows'),
  'Manage dialog should split named vs auto session rows.',
);
assert(
  planSessionJs.includes('No meal plan sessions yet') &&
    planSessionJs.includes('presentEmptyCatalogStep') &&
    planSessionJs.includes('createPlanSessionsModalSession'),
  'Manage flow should use one modal session with an empty-state step.',
);
assert(
  planSessionJs.includes('aria-multiselectable') &&
    planSessionJs.includes('Choose a meal plan to load'),
  'Manage dialog should support multi-select with load gated to one row.',
);
assert(
  planSessionJs.includes('event.shiftKey') &&
    planSessionJs.includes('event.metaKey || event.ctrlKey') &&
    planSessionJs.includes('selectRange') &&
    planSessionJs.includes('selectOnly'),
  'Manage dialog should use plain, shift-range, and modifier-toggle selection.',
);
assert(
  planSessionJs.includes('selectAllSessions') &&
    planSessionJs.includes('isSelectAllShortcut') &&
    planSessionJs.includes("setAttribute('inert'"),
  'Manage dialog should support Cmd/Ctrl+A select-all and inert background isolation.',
);
assert(
  /formatDefaultSessionName[\s\S]*Week of \$\{day\} \$\{month\}/.test(
    planSessionJs,
  ),
  'Default session name prefill should use Week of D full-month format.',
);
assert(
  /formatSessionTimestamp[\s\S]*getSeconds\(\)/.test(planSessionJs),
  'Session timestamps should include seconds.',
);
assert(
  planSessionJs.includes('Save this meal plan?'),
  'Plan session module should include first-save copy.',
);
assert(
  planSessionJs.includes('syncShoppingListPlanSessionSaveButtonState'),
  'Plan session module should sync explicit Save button state.',
);
assert(
  planSessionJs.includes('hasSaveablePlanContent') &&
    planSessionJs.includes('btn.disabled = !saveEnabled'),
  'Explicit Save should disable in zero-state (no plan content).',
);
assert(
  !planSessionJs.includes('saveBtn.disabled = !isDirty'),
  'Explicit Save should not be gated on dirty state.',
);
assert(
  (() => {
    const match = planSessionJs.match(
      /async function runAutoSaveNow\(\) \{([\s\S]*?)\n  \}/,
    );
    return match && !match[1].includes('hasSaveablePlanContent');
  })(),
  'Auto-save should snapshot empty plans (e.g. after clear all).',
);
assert(
  planSessionJs.includes('Replace existing session?'),
  'Plan session module should confirm name collisions before overwrite.',
);
assert(
  planSessionJs.includes('A session named “'),
  'Collision dialog should name the conflicting session.',
);
assert(
  planSessionJs.includes('Go back'),
  'Collision dialog should offer Go back to the save modal.',
);
assert(
  planSessionJs.includes('Save session as:'),
  'Plan session module should label the session name field.',
);
assert(
  planSessionJs.includes('persistNamedSessionWithName'),
  'Plan session module should use unified save-by-name logic.',
);
assert(
  !planSessionJs.includes('Save as'),
  'Save modal should not use a separate Save-as CTA.',
);
assert(
  planSessionJs.includes('planSessionSaveConfirmText') &&
    planSessionJs.includes("return 'Update'") &&
    planSessionJs.includes('getConfirmText'),
  'Save modal should flip Update/Save CTA from the session name field.',
);
assert(
  [recipesHtml, shoppingHtml, shoppingListHtml].every((html) =>
    html.includes(planSessionScriptTag),
  ),
  'Plan session module should load on every surface that commits plan changes.',
);
assert(
  planSessionJs.includes('resolveDirtyBeforeClearAllItems') &&
    planSessionJs.includes('resolveDirtyBeforeCloseNamedSession') &&
    planSessionJs.includes('closing this session') &&
    planSessionJs.includes('resolveDirtyNamedSessionBeforeAction'),
  'Plan session module should expose unsaved-changes gates for clear-all and close.',
);
assert(
  /async function closeActiveNamedSession\([\s\S]*resolveDirtyBeforeCloseNamedSession/.test(
    planSessionJs,
  ),
  'Close this session should resolve unsaved changes before detaching.',
);
assert(
  [itemsPageJs, recipesPageJs, shoppingListPageJs].every((source) =>
    /uiConfirm\([\s\S]*Clear all items[\s\S]*resolveDirtyBeforeClearAllItems/.test(
      source,
    ),
  ),
  'Clear all items should confirm first, then resolve unsaved plan changes.',
);
assert(
  /resolveDirtyNamedSessionBeforeAction[\s\S]*activeNamedSnapshotId == null/.test(
    planSessionJs,
  ),
  'Unsaved-changes gate should require an active named session, not catalog presence.',
);
assert(
  planSessionJs.includes('Close this session') &&
    planSessionJs.includes('createCloseSessionMonogramButton') &&
    planSessionJs.includes('closeActiveNamedSession') &&
    planSessionJs.includes('closeActivePlanSession'),
  'Plan session module should expose Close this session monogram action.',
);
assert(
  dataIndexJs.includes('closeActivePlanSession'),
  'data/index.js should wire closeActivePlanSession RPC.',
);
assert(
  (() => {
    const match = planSessionJs.match(
      /function presentSessionPickerStep\([\s\S]*?\n  \}\n\n  async function fetchPlanSessionCatalog/,
    );
    return match && !match[0].includes('Close this session');
  })(),
  'Close this session should not appear in the manage sessions modal.',
);
assert(
  [itemsPageJs, recipesPageJs, shoppingListPageJs].every((source) =>
    /createManageMonogramButton[\s\S]*createCloseSessionMonogramButton/.test(
      source,
    ),
  ),
  'Monogram menus should wire Close this session directly beneath Manage sessions.',
);

console.log('runPlanSessionsMigrationTests: ok');
