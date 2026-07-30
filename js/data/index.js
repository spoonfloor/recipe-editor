// The data service "door".
//
// This is the ONLY entry point UI code may use to read/write app data.
// UI code calls window.dataService.<method>() — the door dispatches to the
// correct active adapter. UI does not import
// adapters directly.
//
// Architecture note: docs/supabase-architecture.md.
//
// Adapter selection:
//   - Supabase only.

(function initDataService(global) {
  if (!global) return;

  let supabaseAdapter = null;
  let supabaseConfig = {};

  function configureSupabase(opts = {}) {
    supabaseConfig = { ...supabaseConfig, ...opts };
    supabaseAdapter = null;
  }

  function getSupabaseAdapter() {
    if (supabaseAdapter) return supabaseAdapter;
    if (typeof global.createSupabaseAdapter !== 'function') {
      throw new Error(
        'Supabase adapter is not loaded. Make sure ' +
          'js/data/adapters/supabaseAdapter.js loads before js/data/index.js.',
      );
    }
    supabaseAdapter = global.createSupabaseAdapter(supabaseConfig);
    return supabaseAdapter;
  }

  function isCatalogWriteBlocked() {
    return (
      typeof global.favoriteEatsIsCatalogWriteBlocked === 'function' &&
      global.favoriteEatsIsCatalogWriteBlocked()
    );
  }

  function isDemoRemoteShoppingWriteBlocked() {
    return (
      typeof global.favoriteEatsIsDemoSession === 'function' &&
      global.favoriteEatsIsDemoSession()
    );
  }

  function rejectCatalogWrite(label) {
    return Promise.reject(
      new Error(`${label}: catalog edits are disabled in demo mode.`),
    );
  }

  function rejectDemoRemoteShoppingWrite(label) {
    return Promise.reject(
      new Error(`${label}: remote shopping state is disabled in demo mode.`),
    );
  }

  function guardCatalogWrite(label, fn) {
    return (...args) =>
      isCatalogWriteBlocked() ? rejectCatalogWrite(label) : fn(...args);
  }

  function guardDemoRemoteShoppingWrite(label, fn) {
    return (...args) =>
      isDemoRemoteShoppingWriteBlocked()
        ? rejectDemoRemoteShoppingWrite(label)
        : fn(...args);
  }

  function remoteRpcSucceeded(result) {
    return !(result && typeof result === 'object' && result.ok === false);
  }

  function notifyRemoteSessionCommit(kind) {
    if (kind !== 'plan' && kind !== 'listConfig') return;
    try {
      global.favoriteEatsPlanSession?.onRemoteSessionCommit?.({ kind });
    } catch (_) {}
  }

  async function withRemoteSessionCommit(kind, fn) {
    const result = await fn();
    if (remoteRpcSucceeded(result)) {
      notifyRemoteSessionCommit(kind);
    }
    return result;
  }

  const adapter = () => getSupabaseAdapter();

  global.dataService = {
    useSupabase: true,
    configureSupabase,
    get activeAdapter() {
      return 'supabase';
    },
    createRecipe: guardCatalogWrite('createRecipe', (request) =>
      adapter().createRecipe(request),
    ),
    deleteRecipe: guardCatalogWrite('deleteRecipe', (request) =>
      adapter().deleteRecipe(request),
    ),
    createSize: guardCatalogWrite('createSize', (request) =>
      adapter().createSize(request),
    ),
    createTag: guardCatalogWrite('createTag', (request) =>
      adapter().createTag(request),
    ),
    deleteTag: guardCatalogWrite('deleteTag', (request) =>
      adapter().deleteTag(request),
    ),
    editTag: guardCatalogWrite('editTag', (request) =>
      adapter().editTag(request),
    ),
    createUnit: guardCatalogWrite('createUnit', (request) =>
      adapter().createUnit(request),
    ),
    editUnit: guardCatalogWrite('editUnit', (request) =>
      adapter().editUnit(request),
    ),
    removeUnit: guardCatalogWrite('removeUnit', (request) =>
      adapter().removeUnit(request),
    ),
    countRecipesUsingUnit: (request) =>
      adapter().countRecipesUsingUnit(request),
    listRecipesUsingUnit: (request) =>
      adapter().listRecipesUsingUnit(request),
    editSize: guardCatalogWrite('editSize', (request) =>
      adapter().editSize(request),
    ),
    removeSize: guardCatalogWrite('removeSize', (request) =>
      adapter().removeSize(request),
    ),
    countRecipesUsingSize: (request) =>
      adapter().countRecipesUsingSize(request),
    listRecipesUsingSize: (request) =>
      adapter().listRecipesUsingSize(request),
    createStore: guardCatalogWrite('createStore', (request) =>
      adapter().createStore(request),
    ),
    deleteStore: guardCatalogWrite('deleteStore', (request) =>
      adapter().deleteStore(request),
    ),
    editStore: guardCatalogWrite('editStore', (request) =>
      adapter().editStore(request),
    ),
    saveStoreLayout: guardCatalogWrite('saveStoreLayout', (request) =>
      adapter().saveStoreLayout(request),
    ),
    saveRecipe: guardCatalogWrite('saveRecipe', (request) =>
      adapter().saveRecipe(request),
    ),
    buildRecipeEditorPreflightHelpers: () =>
      adapter().buildRecipeEditorPreflightHelpers(),
    loadShoppingState: () => adapter().loadShoppingState(),
    loadShoppingListScreen: () => adapter().loadShoppingListScreen(),
    loadItemsScreen: (request) => adapter().loadItemsScreen(request),
    loadRecipesScreen: (request) => adapter().loadRecipesScreen(request),
    loadRecipeEditorScreen: (recipeId) =>
      adapter().loadRecipeEditorScreen(recipeId),
    getShoppingRevisions: () => adapter().getShoppingRevisions(),
    saveShoppingState: guardDemoRemoteShoppingWrite(
      'saveShoppingState',
      async (request, options) => {
        const result = await adapter().saveShoppingState(request, options);
        if (
          request &&
          typeof request === 'object' &&
          remoteRpcSucceeded(result)
        ) {
          if (Object.prototype.hasOwnProperty.call(request, 'plan')) {
            notifyRemoteSessionCommit('plan');
          } else if (
            Object.prototype.hasOwnProperty.call(request, 'shoppingListDoc')
          ) {
            notifyRemoteSessionCommit('listConfig');
          }
        }
        return result;
      },
    ),
    saveShoppingPlan: guardDemoRemoteShoppingWrite(
      'saveShoppingPlan',
      async (plan, options) => {
        const result = await adapter().saveShoppingPlan(plan, options);
        if (remoteRpcSucceeded(result)) {
          notifyRemoteSessionCommit('plan');
        }
        return result;
      },
    ),
    listPlanSessions: () => adapter().listPlanSessions(),
    createNamedPlanSession: guardDemoRemoteShoppingWrite(
      'createNamedPlanSession',
      (name) => adapter().createNamedPlanSession(name),
    ),
    updateNamedPlanSession: guardDemoRemoteShoppingWrite(
      'updateNamedPlanSession',
      (snapshotId, name) => adapter().updateNamedPlanSession(snapshotId, name),
    ),
    createAutoPlanSession: guardDemoRemoteShoppingWrite(
      'createAutoPlanSession',
      (capture) => adapter().createAutoPlanSession(capture),
    ),
    loadPlanSession: guardDemoRemoteShoppingWrite('loadPlanSession', (snapshotId) =>
      adapter().loadPlanSession(snapshotId),
    ),
    deletePlanSession: guardDemoRemoteShoppingWrite(
      'deletePlanSession',
      (snapshotId) => adapter().deletePlanSession(snapshotId),
    ),
    closeActivePlanSession: guardDemoRemoteShoppingWrite(
      'closeActivePlanSession',
      () => adapter().closeActivePlanSession(),
    ),
    rewritePlanItemKeys: guardDemoRemoteShoppingWrite('rewritePlanItemKeys', (request) =>
      adapter().rewritePlanItemKeys(request),
    ),
    patchShoppingListSourceKeys: guardDemoRemoteShoppingWrite(
      'patchShoppingListSourceKeys',
      (request) => adapter().patchShoppingListSourceKeys(request),
    ),
    uncheckAllShoppingListRows: guardDemoRemoteShoppingWrite(
      'uncheckAllShoppingListRows',
      () =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().uncheckAllShoppingListRows(),
        ),
    ),
    applyShoppingListSourcedRowsSync: guardDemoRemoteShoppingWrite(
      'applyShoppingListSourcedRowsSync',
      (request) =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().applyShoppingListSourcedRowsSync(request),
        ),
    ),
    restoreRemovedShoppingListRows: guardDemoRemoteShoppingWrite(
      'restoreRemovedShoppingListRows',
      () =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().restoreRemovedShoppingListRows(),
        ),
    ),
    setShoppingListRowChecked: guardDemoRemoteShoppingWrite(
      'setShoppingListRowChecked',
      (request) => adapter().setShoppingListRowChecked(request),
    ),
    setPlanItemQuantity: guardDemoRemoteShoppingWrite(
      'setPlanItemQuantity',
      (request) =>
        withRemoteSessionCommit('plan', () =>
          adapter().setPlanItemQuantity(request),
        ),
    ),
    setPlanRecipeServingsOverride: guardDemoRemoteShoppingWrite(
      'setPlanRecipeServingsOverride',
      (request) =>
        withRemoteSessionCommit('plan', () =>
          adapter().setPlanRecipeServingsOverride(request),
        ),
    ),
    setPlanRecipeQuantity: guardDemoRemoteShoppingWrite(
      'setPlanRecipeQuantity',
      (request) =>
        withRemoteSessionCommit('plan', () =>
          adapter().setPlanRecipeQuantity(request),
        ),
    ),
    setShoppingListRowText: guardDemoRemoteShoppingWrite(
      'setShoppingListRowText',
      (request) =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().setShoppingListRowText(request),
        ),
    ),
    setShoppingListRowRemoved: guardDemoRemoteShoppingWrite(
      'setShoppingListRowRemoved',
      (request) =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().setShoppingListRowRemoved(request),
        ),
    ),
    setShoppingListRowPlacement: guardDemoRemoteShoppingWrite(
      'setShoppingListRowPlacement',
      (request) =>
        withRemoteSessionCommit('listConfig', () =>
          adapter().setShoppingListRowPlacement(request),
        ),
    ),
    appendManualShoppingListRow: guardDemoRemoteShoppingWrite(
      'appendManualShoppingListRow',
      (request) => adapter().appendManualShoppingListRow(request),
    ),
    drawPresenceMoniker: (request) => adapter().drawPresenceMoniker(request),
    subscribePlanChanges: (handlers) => adapter().subscribePlanChanges(handlers),
    subscribeListChanges: (handlers) => adapter().subscribeListChanges(handlers),
    subscribeRecipeCatalogChanges: (handlers) =>
      adapter().subscribeRecipeCatalogChanges(handlers),
    subscribeCatalogReferenceChanges: (handlers) =>
      adapter().subscribeCatalogReferenceChanges(handlers),
    subscribeRecipePresence: (handlers) =>
      adapter().subscribeRecipePresence(handlers),
    subscribeAppActivityPresence: (handlers) =>
      adapter().subscribeAppActivityPresence(handlers),
    listRecipes: () => adapter().listRecipes(),
    loadRecipeDetail: (recipeId, loadOpts) =>
      adapter().loadRecipeDetail(recipeId, loadOpts),
    loadTagUsage: (tagId) => adapter().loadTagUsage(tagId),
    loadTypeaheadPools: (options) => adapter().loadTypeaheadPools(options),
    listTags: () => adapter().listTags(),
    loadUnitlessQuantityPolicy: () => adapter().loadUnitlessQuantityPolicy(),
    saveUnitlessQuantityPolicy: guardCatalogWrite('saveUnitlessQuantityPolicy', (request) =>
      adapter().saveUnitlessQuantityPolicy(request),
    ),
    listUnits: () => adapter().listUnits(),
    listSizes: () => adapter().listSizes(),
    listStores: () => adapter().listStores(),
    loadStoreDetail: (request) => adapter().loadStoreDetail(request),
    lookupShoppingItemByName: (request) =>
      adapter().lookupShoppingItemByName(request),
    findOrCreateShoppingItem: guardCatalogWrite('findOrCreateShoppingItem', (request) =>
      adapter().findOrCreateShoppingItem(request),
    ),
    pruneOrphanedIngredientSynonyms: guardCatalogWrite(
      'pruneOrphanedIngredientSynonyms',
      () => adapter().pruneOrphanedIngredientSynonyms(),
    ),
    ensureIngredientBaseVariants: guardCatalogWrite('ensureIngredientBaseVariants', () =>
      adapter().ensureIngredientBaseVariants(),
    ),
    saveShoppingCatalogItem: guardCatalogWrite('saveShoppingCatalogItem', (request) =>
      adapter().saveShoppingCatalogItem(request),
    ),
    lookupIngredientNameByLemma: (request) =>
      adapter().lookupIngredientNameByLemma(request),
    listIngredientTagNames: () => adapter().listIngredientTagNames(),
    listShoppingItems: () => adapter().listShoppingItems(),
    loadShoppingItemDetail: (request) =>
      adapter().loadShoppingItemDetail(request),
    deleteShoppingItem: guardCatalogWrite('deleteShoppingItem', (request) =>
      adapter().deleteShoppingItem(request),
    ),
    listShoppingItemRecipeUsage: (itemName) =>
      adapter().listShoppingItemRecipeUsage(itemName),
    loadShoppingItemVariantUsage: (request) =>
      adapter().loadShoppingItemVariantUsage(request),
    purgeCatalogVariantReferences: guardCatalogWrite(
      'purgeCatalogVariantReferences',
      (request) => adapter().purgeCatalogVariantReferences(request),
    ),
    listShoppingListHomeLocations: (sourceKeys) =>
      adapter().listShoppingListHomeLocations(sourceKeys),
    isIngredientVariantDeprecated: (request) =>
      adapter().isIngredientVariantDeprecated(request),
    listShoppingPlanRecipeItems: (selectedRecipes) =>
      adapter().listShoppingPlanRecipeItems(selectedRecipes),
    seedListShoppingPlanRecipeItemsCatalog: (items) =>
      adapter().seedListShoppingPlanRecipeItemsCatalog(items),
    bumpRecipeCompositionReadModel: () => adapter().bumpRecipeCompositionReadModel(),
    listShoppingListAssignments: (request) =>
      adapter().listShoppingListAssignments(request),
    listShoppingListRecipeSummaries: (selectedRecipes) =>
      adapter().listShoppingListRecipeSummaries(selectedRecipes),
    listShoppingListPlanRows: (request) =>
      adapter().listShoppingListPlanRows(request),
    resolveCanonicalIngredientForShoppingReconcile: (request) =>
      adapter().resolveCanonicalIngredientForShoppingReconcile(request),
    resolveIngredientForStaleShoppingAggregateKey: (request) =>
      adapter().resolveIngredientForStaleShoppingAggregateKey(request),
    listIngredientVariantsWithIngredientsByIds: (request) =>
      adapter().listIngredientVariantsWithIngredientsByIds(request),
    listIngredientVariantsByIngredientIds: (request) =>
      adapter().listIngredientVariantsByIngredientIds(request),
    resolvePersistedShoppingPlanItemKey: (request) =>
      adapter().resolvePersistedShoppingPlanItemKey(request),
  };
})(typeof window !== 'undefined' ? window : globalThis);
