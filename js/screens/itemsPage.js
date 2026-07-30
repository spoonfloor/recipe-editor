/**
 * Items (shopping catalog) hub page UI (Slice 7 phase 2).
 */
(function favoriteEatsItemsPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;
  const SHOPPING_PLANNER_QTY_SYNC_LOG_PREFIX =
    '[favorite-eats-items-quantity-stepper]';
  let favoriteEatsItemsQuantityQueue = null;
  let favoriteEatsItemsQuantityQueueHandlers = {
    applyLocal: null,
    flushRemote: null,
  };

  function logShoppingPlannerQtySync(label, detail = {}) {
    try {
      if (global.favoriteEatsInputSyncDebugToConsole !== true) return;
      console.info(SHOPPING_PLANNER_QTY_SYNC_LOG_PREFIX, label, detail || {});
    } catch (_) {}
  }

  function getFavoriteEatsItemsQuantityQueue(handlers = {}) {
    favoriteEatsItemsQuantityQueueHandlers = {
      applyLocal:
        typeof handlers.applyLocal === 'function'
          ? handlers.applyLocal
          : favoriteEatsItemsQuantityQueueHandlers.applyLocal,
      flushRemote:
        typeof handlers.flushRemote === 'function'
          ? handlers.flushRemote
          : favoriteEatsItemsQuantityQueueHandlers.flushRemote,
    };
    if (favoriteEatsItemsQuantityQueue) return favoriteEatsItemsQuantityQueue;
    if (
      !global.favoriteEatsInputSync ||
      typeof global.favoriteEatsInputSync.createCoalescedOpQueue !== 'function'
    ) {
      return null;
    }
    favoriteEatsItemsQuantityQueue =
      global.favoriteEatsInputSync.createCoalescedOpQueue({
        flushDelayMs: 140,
        // Charter §H: stepper bursts survive a forced reload.
        storageKey: 'favoriteEatsInputSync:plan:items:v1',
        storage:
          typeof global !== 'undefined' && global.localStorage
            ? global.localStorage
            : null,
        onLocalApply: (op) => {
          const fn = favoriteEatsItemsQuantityQueueHandlers.applyLocal;
          if (typeof fn === 'function') fn(op);
        },
        flushOp: (op) => {
          const fn = favoriteEatsItemsQuantityQueueHandlers.flushRemote;
          return typeof fn === 'function' ? fn(op) : null;
        },
        onFlushStart: (op) => {
          logShoppingPlannerQtySync('flush started', {
            itemKey: String(op?.entityKey || ''),
            value: op?.value,
            clientSeq: op?.clientSeq || null,
          });
        },
        onFlushSuccess: (op, result) => {
          const updatedAt =
            result && typeof result === 'object'
              ? result.updated_at || result.updatedAt || null
              : null;
          logShoppingPlannerQtySync('ack', {
            itemKey: String(op?.entityKey || ''),
            value: op?.value,
            updated_at: updatedAt,
          });
        },
        onFlushFailure: (op, err) => {
          logShoppingPlannerQtySync('flush failed', {
            itemKey: String(op?.entityKey || ''),
            value: op?.value,
            message: err && err.message ? String(err.message) : String(err || ''),
          });
        },
      });
    try {
      global.favoriteEatsPlanItemsQuantityQueue = favoriteEatsItemsQuantityQueue;
    } catch (_) {}
    return favoriteEatsItemsQuantityQueue;
  }

  function registerFavoriteEatsItemsPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsItemsPage deps are not registered.');
    }
    return deps;
  }

  async function loadShoppingPage() {
  const {
    fePageLoadFoodIconBegin,
    fePageLoadFoodIconFail,
    fePageLoadFoodIconFinish,
    favoriteEatsShouldUseSupabaseDataDoor,
    shouldUseRemoteShoppingState,
    hydrateShoppingStateFromDataService,
    favoriteEatsReportSupabasePrefetchFailure,
    initAppBar,
    initBottomNav,
    waitForAppBarReady,
    enableTopLevelListKeyboardNav,
    wireAppBarSearch,
    ensureAppBarTextActionPair,
    isPlannerModeEnabled,
    favoriteEatsDataServiceIsSupabaseActive,
    favoriteEatsHrefWithCurrentAdapter,
    getShoppingPlan,
    getShoppingPlanItemSelections,
    getShoppingPlanRecipeSelections,
    getShoppingPlanSelectionRows,
    getShoppingPlanSelectionRowsViaDataService,
    setShoppingPlanItemSelection,
    persistShoppingPlan,
    runWithShoppingPlanMutationBatch,
    flushCoalescedPlanSaveToDataService,
    flushPlanNarrowRpcQueuesWithSessionCommitBatch,
    abortPlanInputSyncQueuesForWholesaleClear,
    runFavoriteEatsRemoteShoppingPlanRefresh,
    createEmptyShoppingPlan,
    cloneForUndo,
    clearShoppingPlanSelections,
    persistDbForCurrentRuntime,
    uiToast,
    uiConfirm,
    uiToastUndo,
    promptRemoveItemFromMenuPlan,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    registerFavoriteEatsRemotePlanPatchHook,
    registerFavoriteEatsCatalogReferenceUiRefreshHook,
    registerFavoriteEatsCatalogCompositionUiRefreshHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    applySplitListRowLabelPair,
    createItemsBrowseSplitRowHeadline,
    formatListRowDetailParenthetical,
    makeListRowTextMeasurer,
    fitVariantParentFoldedLine,
    parseVariantParentDetailText,
    createSectionToggleButton,
    createShoppingBrowsePlannerDocHeadline,
    deriveIngredientLemmaInMain,
    formatShoppingBrowseItemLabel,
    formatShoppingBrowsePlannerAmountButtonText,
    formatShoppingBrowsePlannerRemoveLabel,
    formatShoppingBrowsePlannerStepperQtyLabel,
    formatShoppingBrowsePlannerDisplayDetailText,
    getBrowsePlannerDirectQtyFromPlainStep,
    getBrowsePlannerPlainStepQtyFromParts,
    shoppingBrowsePlannerRowHasAmountTail,
    getRecipeDerivedShoppingPlanRows,
    getRecipePlannerServingsStoredValue,
    getShoppingBrowseLocationIds,
    getShoppingBrowsePlannerVariantNames,
    getShoppingBrowseLocationSortBucketIds,
    getShoppingBrowsePlannerBadgeContent,
    shoppingBrowseItemMatchesBrowseFilters,
    getShoppingBrowseVariantsMatchingTagKeys,
    normalizeShoppingBrowseTagKeys,
    getUnitSizeRemovalAction,
    getVisibleIngredientTagNamePool,
    isIngredientBaseVariantName,
    isShoppingBrowseBaseVariantName,
    makeIngredientVariantShoppingPlanKey,
    normalizeShoppingHomeLocationId,
    resolveBrowseIvKeyForPlanRow,
    resolvePersistedShoppingItemKeyForDb,
    resolveShoppingBrowsePlanRowAggregateKey,
    shouldShoppingBrowsePlannerStepperShowTailIcon,
    getShoppingPlanRemoteSaveInFlight,
    SHOPPING_SCROLL_RESTORE_SESSION_KEY,
    FAVORITE_EATS_PLANNER_MODE_EVENT,
    SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY,
    SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX,
    SHOPPING_ITEMS_SORT_MODE_AZ,
    SHOPPING_ITEMS_SORT_MODE_LOCATION,
    SHOPPING_ITEMS_SORT_SESSION_KEY,
    SHOPPING_PLAN_KEY_SEP,
    SHOPPING_TAG_FILTER_PREFIX,
    ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
  } = requireDeps();
  fePageLoadFoodIconBegin('shopping');
  const list = document.getElementById('shoppingList');

  initAppBar({
    mode: 'list',
    titleText: 'Items',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applyShoppingFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn instanceof HTMLButtonElement && !isPlannerModeEnabled()) {
    ensureAppBarTextActionPair(addBtn, 'Add', 'add');
  }
  const listRowStepper = window.listRowStepper;

  if (!list) return;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const rememberShoppingScrollForReload = () => {
    try {
      const y = Number(window.scrollY || window.pageYOffset || 0);
      sessionStorage.setItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY, String(y));
    } catch (_) {}
  };
  const restoreShoppingScrollAfterReload = () => {
    let targetY = null;
    try {
      const raw = sessionStorage.getItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      sessionStorage.removeItem(SHOPPING_SCROLL_RESTORE_SESSION_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) targetY = parsed;
    } catch (_) {}
    if (targetY === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        } catch (_) {
          window.scrollTo(0, targetY);
        }
      });
    });
  };
  const consumeShoppingNavTarget = () => {
    try {
      const rawId = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      const rawName = sessionStorage.getItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetId,
      );
      sessionStorage.removeItem(
        window.favoriteEatsSessionKeys.shoppingNavTargetName,
      );
      const targetId = Number(rawId);
      const targetName = String(rawName || '')
        .trim()
        .toLowerCase();
      if ((!Number.isFinite(targetId) || targetId <= 0) && !targetName) {
        return null;
      }
      return {
        id:
          Number.isFinite(targetId) && targetId > 0
            ? Math.trunc(targetId)
            : null,
        name: targetName || '',
      };
    } catch (_) {
      return null;
    }
  };
  const shoppingNavTargetCleanupTimers = new WeakMap();
  const pulseShoppingNavTargetRow = (row) => {
    if (!(row instanceof HTMLElement)) return;
    const existingTimer = shoppingNavTargetCleanupTimers.get(row);
    if (existingTimer) window.clearTimeout(existingTimer);
    const cleanup = () => {
      row.classList.remove('shopping-nav-target');
      shoppingNavTargetCleanupTimers.delete(row);
    };
    row.classList.remove('shopping-nav-target');
    void row.offsetWidth;
    row.classList.add('shopping-nav-target');
    row.addEventListener('animationend', cleanup, { once: true });
    const timeoutId = window.setTimeout(cleanup, 1400);
    shoppingNavTargetCleanupTimers.set(row, timeoutId);
  };
  const scrollToShoppingNavTarget = (target) => {
    if (!target) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const row = Array.from(list.querySelectorAll('li')).find((li) => {
            const itemId = Number(li.dataset.shoppingItemId || '');
            if (
              Number.isFinite(itemId) &&
              itemId > 0 &&
              Number.isFinite(target.id) &&
              itemId === target.id
            ) {
              return true;
            }
            const key = String(
              li.dataset.shoppingStepperKey ||
                li.dataset.variantParentKey ||
                '',
            )
              .trim()
              .toLowerCase();
            if (!key) return false;
            if (target.name && key === target.name) return true;
            return false;
          });
          if (!(row instanceof HTMLElement)) return;
          row.scrollIntoView({ block: 'center', behavior: 'auto' });
          pulseShoppingNavTargetRow(row);
        } catch (_) {}
      });
    });
  };
  const pendingShoppingNavTarget = consumeShoppingNavTarget();

  const getShoppingEditorHref = () => 'shoppingEditor.html';

  let shoppingRows = [];
  /** Tag filter dropdown options for Items page (ids use {@link SHOPPING_TAG_FILTER_PREFIX}). */
  let shoppingTagChipOptionDefs = [];
  let shoppingRowsLoadedFromDataService = false;
  const dataServiceShoppingItemToPageRow = (item) => {
    const removedVariants = Array.isArray(item?.removedVariants)
      ? item.removedVariants
      : [];
    return {
      ...item,
      variants: Array.isArray(item?.variants) ? item.variants : [],
      variantIdByName:
        item?.variantIdByName && typeof item.variantIdByName === 'object'
          ? item.variantIdByName
          : null,
      variantDeprecatedSet: new Set(
        removedVariants
          .map((name) =>
            String(name || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
      isDeprecated: !!item?.isRemoved,
      tags: Array.isArray(item?.tags) ? item.tags : [],
      variantTagsByName:
        item?.variantTagsByName && typeof item.variantTagsByName === 'object'
          ? item.variantTagsByName
          : {},
      recipeUseCount: Number(item?.recipeUseCount || 0),
      aisleUseCount: Number(item?.aisleUseCount || 0),
    };
  };

  if (
    window.favoriteEatsItemsScreen &&
    typeof window.favoriteEatsItemsScreen.bootstrapItemsHub === 'function'
  ) {
    const boot = await window.favoriteEatsItemsScreen.bootstrapItemsHub({
      shouldUseSupabase: favoriteEatsShouldUseSupabaseDataDoor(),
      includePlan: isPlannerModeEnabled() && shouldUseRemoteShoppingState(),
      shouldUseRemoteShoppingState: shouldUseRemoteShoppingState(),
      hydrateShoppingState: hydrateShoppingStateFromDataService,
      reportPrefetchFailure: favoriteEatsReportSupabasePrefetchFailure,
      mapItemRow: dataServiceShoppingItemToPageRow,
    });
    if (boot.ok && Array.isArray(boot.itemRows)) {
      shoppingRows = boot.itemRows;
      shoppingRowsLoadedFromDataService = true;
    } else if (Array.isArray(boot.itemRows)) {
      shoppingRows = boot.itemRows;
    }
  }

  if (!shoppingRowsLoadedFromDataService) {
    try {
      if (list?.dataset) list.dataset.fePerfItemsReady = '0';
    } catch (_) {}
    fePageLoadFoodIconFail();
    return;
  }
  const db = null;
  window.dbInstance = db;
  window.dataService.useSupabase = true;

  // Catalog Items page always loads via screen RPC or listShoppingItems above.
  // ingredient_variants resolution is unused (db stays null).
  const hasVariantTable = false;

  const rebuildShoppingTagChipOptionDefsFromRows = async () => {
    const seen = new Map();
    shoppingRows.forEach((item) => {
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const label = String(raw || '').trim();
        if (!label) return;
        const key = label.toLowerCase();
        if (!seen.has(key)) seen.set(key, label);
      });
    });
    let pool = [];
    try {
      pool = await getVisibleIngredientTagNamePool();
    } catch (err) {
      console.warn('listIngredientTagNames pool unavailable:', err);
    }
    (Array.isArray(pool) ? pool : []).forEach((label) => {
      const normalizedLabel = String(label || '').trim();
      const key = normalizedLabel.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.set(key, normalizedLabel);
    });
    const pairs = Array.from(seen.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    );
    shoppingTagChipOptionDefs = pairs.map(([lower, label]) => ({
      id: `${SHOPPING_TAG_FILTER_PREFIX}${lower}`,
      label,
    }));
  };

  await rebuildShoppingTagChipOptionDefsFromRows();

  const getSharedHomeLocationDefs = () => {
    if (typeof window.getHomeLocationDefs === 'function') {
      return window.getHomeLocationDefs();
    }
    return [
      { id: 'fridge', label: 'fridge' },
      { id: 'freezer', label: 'freezer' },
      { id: 'above fridge', label: 'above fridge' },
      { id: 'cereal cabinet', label: 'cereal cabinet' },
      { id: 'pantry', label: 'pantry' },
      { id: 'spices', label: 'spices' },
      { id: 'fruit stand', label: 'fruit stand' },
      { id: 'coffee bar', label: 'coffee bar' },
      { id: 'none', label: 'no location' },
    ];
  };
  const shoppingLocationChipDefs = getSharedHomeLocationDefs();
  const shoppingFilterChipDefsWeb = [
    { id: 'selected', label: 'selected', kind: 'flag' },
  ];
  const shoppingFilterChipDefsEditor = [
    { id: 'food', label: 'food', kind: 'flag' },
    { id: 'not food', label: 'not food', kind: 'flag' },
  ];
  const shoppingMoreChipOptionDefs = [
    { id: 'no recipe', label: 'no recipe' },
    { id: 'no aisle', label: 'no aisle' },
    { id: 'has variant(s)', label: 'has variant(s)' },
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeFilterChips = new Set();
  const selectedShoppingNames = new Set();
  const shoppingQuantities = new Map();
  const shoppingQuantityUnspecifiedKeys = new Set();
  const shoppingRecipeQuantities = new Map();
  const shoppingSelectionMeta = new Map();
  let shoppingChipCounts = new Map();
  let filterChipRail = null;
  let suppressLocationDropdownReopen = false;
  let reopenShoppingCompoundDropdownId = '';
  let shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
  const collapsedItemsBrowseHomeSections = new Set();
  const restoreShoppingItemsSortMode = () => {
    if (!isPlannerModeEnabled()) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
      return;
    }
    try {
      const raw = sessionStorage.getItem(SHOPPING_ITEMS_SORT_SESSION_KEY);
      const key = String(raw || '')
        .trim()
        .toLowerCase();
      shoppingItemsSortMode =
        key === SHOPPING_ITEMS_SORT_MODE_LOCATION
          ? SHOPPING_ITEMS_SORT_MODE_LOCATION
          : SHOPPING_ITEMS_SORT_MODE_AZ;
    } catch (_) {
      shoppingItemsSortMode = SHOPPING_ITEMS_SORT_MODE_AZ;
    }
  };
  const persistShoppingItemsSortMode = () => {
    if (!isPlannerModeEnabled()) return;
    try {
      sessionStorage.setItem(
        SHOPPING_ITEMS_SORT_SESSION_KEY,
        shoppingItemsSortMode,
      );
    } catch (_) {}
  };
  const restoreItemsBrowseHomeCollapsed = () => {
    collapsedItemsBrowseHomeSections.clear();
    if (!isPlannerModeEnabled()) return;
    try {
      const raw = sessionStorage.getItem(
        ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
      );
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((id) => {
        const k = String(id || '').trim();
        if (k) collapsedItemsBrowseHomeSections.add(k);
      });
    } catch (_) {}
  };
  const persistItemsBrowseHomeCollapsed = () => {
    if (!isPlannerModeEnabled()) return;
    try {
      sessionStorage.setItem(
        ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY,
        JSON.stringify(Array.from(collapsedItemsBrowseHomeSections)),
      );
    } catch (_) {}
  };
  restoreShoppingItemsSortMode();
  restoreItemsBrowseHomeCollapsed();
  const syncShoppingActionButtonState = () => {
    if (!(addBtn instanceof HTMLButtonElement)) return;
    if (!isShoppingPlannerSelectMode()) {
      addBtn.disabled = false;
      addBtn.removeAttribute('aria-disabled');
    }
    try {
      if (
        typeof window.favoriteEatsSyncMonogramMenuExtraButtons === 'function'
      ) {
        window.favoriteEatsSyncMonogramMenuExtraButtons();
      }
    } catch (_) {}
  };
  const syncShoppingAppBarActionChrome = () => {
    const plannerOn = isShoppingPlannerSelectMode();
    const saveBtn = document.getElementById('appBarSaveBtn');
    if (addBtn instanceof HTMLButtonElement) {
      if (plannerOn) {
        addBtn.style.display = 'none';
      } else {
        addBtn.style.display = '';
        ensureAppBarTextActionPair(addBtn, 'Add', 'add');
      }
    }
    try {
      window.favoriteEatsPlanSession?.syncShoppingListPlanSessionSaveButtonState?.(
        saveBtn,
        { visible: plannerOn },
      );
    } catch (_) {}
    syncShoppingActionButtonState();
  };

  const getShoppingSelectionKey = (rawName) =>
    String(rawName || '')
      .trim()
      .toLowerCase();
  const isShoppingPlannerSelectMode = () => isPlannerModeEnabled();
  const getShoppingFilterChipMode = () =>
    isShoppingPlannerSelectMode() ? 'planner' : 'editor';
  const getShoppingFilterChipStorageKey = (
    mode = getShoppingFilterChipMode(),
  ) => `${SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX}:${mode}`;
  // On macOS, Ctrl+primary click can emit a contextmenu event.
  // Planner remove uses isControlPrimaryContextMenuGesture (module scope).
  const getActiveShoppingFilterChipDefs = () =>
    getShoppingFilterChipMode() === 'planner'
      ? shoppingFilterChipDefsWeb
      : shoppingFilterChipDefsEditor;
  const SHOPPING_QTY_EPSILON = 1e-9;
  const getDirectShoppingQty = (key) => shoppingQuantities.get(key) || 0;
  const getRecipeShoppingQty = (key) => shoppingRecipeQuantities.get(key) || 0;
  const getShoppingQty = (key) =>
    Math.max(0, getDirectShoppingQty(key) + getRecipeShoppingQty(key));
  const hasPositiveShoppingQty = (qty) =>
    Number.isFinite(Number(qty)) && Number(qty) > SHOPPING_QTY_EPSILON;
  const getNextShoppingStepQty = (currentQty, delta) => {
    if (
      window.listRowStepper &&
      typeof window.listRowStepper.getNextStepQty === 'function'
    ) {
      return window.listRowStepper.getNextStepQty(currentQty, delta, {
        min: 0,
        max: 99,
        epsilon: SHOPPING_QTY_EPSILON,
      });
    }
    const numeric = Number(currentQty);
    if (!Number.isFinite(numeric)) return delta > 0 ? 1 : 0;
    return Math.max(0, numeric + Number(delta || 0));
  };
  const parseShoppingQtyInputValue = (rawValue) => {
    const raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(99, Math.round(numeric)));
  };
  const setShoppingQty = (key, qty, meta = null, options = {}) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const nextMeta =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const itemName = String(nextMeta.itemName || nextMeta.name || '').trim();
    const variantName = String(nextMeta.variantName || '').trim();
    const metaIv = Number(nextMeta.ingredientVariantId);
    const ingredientVariantIdFromMeta =
      Number.isFinite(metaIv) && metaIv > 0 ? Math.trunc(metaIv) : null;
    if (itemName || variantName || !shoppingSelectionMeta.has(normalizedKey)) {
      shoppingSelectionMeta.set(normalizedKey, { itemName, variantName });
    }
    const recipeQty = getRecipeShoppingQty(normalizedKey);
    const desiredQty = Math.max(0, Number(qty || 0));
    if (!Number.isFinite(desiredQty)) return;
    const directQty = Number((desiredQty - recipeQty).toFixed(4));
    if (Math.abs(directQty) < SHOPPING_QTY_EPSILON) {
      shoppingQuantities.delete(normalizedKey);
      if (shoppingQuantityUnspecifiedKeys.has(normalizedKey)) {
        selectedShoppingNames.add(normalizedKey);
        const persistedMeta = shoppingSelectionMeta.get(normalizedKey) || {};
        setShoppingPlanItemSelection(
          {
            key: normalizedKey,
            name: persistedMeta.itemName || itemName || normalizedKey,
            variantName: persistedMeta.variantName || variantName,
            quantity: 0,
            quantityUnspecified: true,
            ingredientVariantId: ingredientVariantIdFromMeta,
          },
          options,
        );
      } else {
        shoppingQuantityUnspecifiedKeys.delete(normalizedKey);
        selectedShoppingNames.delete(normalizedKey);
        shoppingSelectionMeta.delete(normalizedKey);
        setShoppingPlanItemSelection(
          { key: normalizedKey, quantity: 0 },
          options,
        );
      }
    } else {
      const keepUnspecified = shoppingQuantityUnspecifiedKeys.has(normalizedKey);
      shoppingQuantities.set(normalizedKey, directQty);
      if (keepUnspecified) {
        shoppingQuantityUnspecifiedKeys.add(normalizedKey);
      }
      selectedShoppingNames.add(normalizedKey);
      const persistedMeta = shoppingSelectionMeta.get(normalizedKey) || {};
      setShoppingPlanItemSelection(
        {
          key: normalizedKey,
          name: persistedMeta.itemName || itemName || normalizedKey,
          variantName: persistedMeta.variantName || variantName,
          quantity: directQty,
          quantityUnspecified: keepUnspecified,
          ingredientVariantId: ingredientVariantIdFromMeta,
        },
        options,
      );
    }
    syncShoppingActionButtonState();
  };
  const setShoppingUnspecifiedSelection = (key, meta = null, options = {}) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const nextMeta =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const itemName = String(nextMeta.itemName || nextMeta.name || '').trim();
    const variantName = String(nextMeta.variantName || '').trim();
    const metaIv = Number(nextMeta.ingredientVariantId);
    const ingredientVariantIdFromMeta =
      Number.isFinite(metaIv) && metaIv > 0 ? Math.trunc(metaIv) : null;
    if (itemName || variantName || !shoppingSelectionMeta.has(normalizedKey)) {
      shoppingSelectionMeta.set(normalizedKey, { itemName, variantName });
    }
    shoppingQuantities.delete(normalizedKey);
    shoppingQuantityUnspecifiedKeys.add(normalizedKey);
    selectedShoppingNames.add(normalizedKey);
    const persistedMeta = shoppingSelectionMeta.get(normalizedKey) || {};
    setShoppingPlanItemSelection(
      {
        key: normalizedKey,
        name: persistedMeta.itemName || itemName || normalizedKey,
        variantName: persistedMeta.variantName || variantName,
        quantity: 0,
        quantityUnspecified: true,
        ingredientVariantId: ingredientVariantIdFromMeta,
      },
      options,
    );
    syncShoppingActionButtonState();
  };
  const hydrateShoppingSelectionsFromPlan = () => {
    shoppingQuantities.clear();
    shoppingQuantityUnspecifiedKeys.clear();
    selectedShoppingNames.clear();
    shoppingSelectionMeta.clear();
    const storedSelections = getShoppingPlanItemSelections();
    Object.keys(storedSelections).forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      const entry = storedSelections[rawKey];
      const quantityUnspecified = entry?.quantityUnspecified === true;
      const quantity = Number(entry?.quantity);
      const rawIv = Number(entry?.ingredientVariantId);
      const ingredientVariantId =
        Number.isFinite(rawIv) && rawIv > 0 ? Math.trunc(rawIv) : null;
      const meta = {
        itemName: String(entry?.name || '').trim(),
        variantName: String(entry?.variantName || '').trim(),
        ...(ingredientVariantId ? { ingredientVariantId } : {}),
      };
      if (quantityUnspecified) {
        shoppingQuantityUnspecifiedKeys.add(key);
      }
      if (
        Number.isFinite(quantity) &&
        Math.abs(quantity) >= SHOPPING_QTY_EPSILON
      ) {
        shoppingQuantities.set(key, quantity);
      }
      if (
        !quantityUnspecified &&
        (!Number.isFinite(quantity) ||
          Math.abs(quantity) < SHOPPING_QTY_EPSILON)
      ) {
        return;
      }
      selectedShoppingNames.add(key);
      shoppingSelectionMeta.set(key, meta);
    });
  };
  const clearShoppingPlannerUiState = () => {
    shoppingQuantities.clear();
    shoppingQuantityUnspecifiedKeys.clear();
    shoppingRecipeQuantities.clear();
    selectedShoppingNames.clear();
    shoppingSelectionMeta.clear();
    shoppingBrowsePlanRowsByKey.clear();
    expandedVariantItems.clear();
    try {
      shoppingRowStepperController?.collapseAll?.();
    } catch (_) {}
  };

  const getVariantQtyKey = (itemName, variantName) => {
    const base = getShoppingSelectionKey(itemName);
    const v = String(variantName || '')
      .trim()
      .toLowerCase();
    // Align with getShoppingPlanAggregateKey / adapter shoppingPlanAggregateKey:
    // base variant is the plain lowercased name, not `name\x1edefault`.
    if (isIngredientBaseVariantName(v)) return base;
    return `${base}${SHOPPING_PLAN_KEY_SEP}${v}`;
  };
  const resolveBrowseIngredientVariantId = (browseItem, rawVariantName) => {
    if (!browseItem || typeof browseItem !== 'object') return null;
    const v = String(rawVariantName || '')
      .trim()
      .toLowerCase();
    if (!v || v === 'default') {
      const n = Number(browseItem.defaultVariantId);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    const map = browseItem.variantIdByName;
    if (!map || typeof map !== 'object') return null;
    const vid = Number(map[v]);
    return Number.isFinite(vid) && vid > 0 ? Math.trunc(vid) : null;
  };

  const getBrowseVariantPlanKey = (itemName, rawVariantName, browseItem) => {
    const v = String(rawVariantName || '').trim();
    if (!v || v === 'default') {
      const defVid = resolveBrowseIngredientVariantId(browseItem, 'default');
      if (Number.isFinite(defVid) && defVid > 0) {
        return makeIngredientVariantShoppingPlanKey(defVid);
      }
      return getVariantQtyKey(itemName, v || 'default');
    }
    if (browseItem && browseItem.variantIdByName) {
      const vid = browseItem.variantIdByName[v.toLowerCase()];
      if (Number.isFinite(vid) && vid > 0) {
        return makeIngredientVariantShoppingPlanKey(vid);
      }
    }
    if (hasVariantTable) {
      const resolved = resolvePersistedShoppingItemKeyForDb(db, itemName, v);
      if (resolved) return resolved;
    }
    return getVariantQtyKey(itemName, v);
  };
  const getShoppingItemVariantAwareKey = (itemName, variantName = '') => {
    const itemKey = getShoppingSelectionKey(itemName);
    if (!itemKey) return '';
    const match = shoppingRows.find(
      (it) => getShoppingSelectionKey(it?.name) === itemKey,
    );
    const hasVariants =
      !!match && Array.isArray(match.variants) && match.variants.length > 0;
    // Even when an ingredient has no non-default variants, recipe-derived rows
    // are keyed by `iv:{defaultVariantId}` (see listShoppingPlanRecipeItems).
    // Prefer that stable id key whenever it is known so simple-row reads/writes
    // line up with hydrateRecipeDerivedShoppingSelections.
    if (!hasVariants) {
      const defVid = resolveBrowseIngredientVariantId(match, 'default');
      if (Number.isFinite(defVid) && defVid > 0) {
        return makeIngredientVariantShoppingPlanKey(defVid);
      }
      return itemKey;
    }
    return getBrowseVariantPlanKey(
      itemName,
      String(variantName || '').trim() || 'default',
      match,
    );
  };
  const getRecipeSelectionsForDataService = () =>
    Object.values(getShoppingPlanRecipeSelections()).map((entry) => {
      const recipeId = Number(entry?.recipeId);
      const servings = getRecipePlannerServingsStoredValue(recipeId);
      return {
        ...entry,
        servings,
      };
    });
  const hydrateRecipeDerivedShoppingSelections = async () => {
    shoppingRecipeQuantities.clear();
    let recipeRows = [];
    const useDataDoor =
      favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
    if (useDataDoor) {
      window.dataService.useSupabase = true;
    }
    if (
      window.dataService &&
      typeof window.dataService.listShoppingPlanRecipeItems === 'function'
    ) {
      try {
        recipeRows = await window.dataService.listShoppingPlanRecipeItems(
          getRecipeSelectionsForDataService(),
        );
      } catch (err) {
        if (useDataDoor) {
          favoriteEatsReportSupabasePrefetchFailure(
            'listShoppingPlanRecipeItems',
            err,
          );
          throw err;
        }
        console.error('dataService.listShoppingPlanRecipeItems failed:', err);
        recipeRows = getRecipeDerivedShoppingPlanRows({ db });
      }
    } else {
      if (useDataDoor) {
        const err = new Error(
          'dataService.listShoppingPlanRecipeItems is not available.',
        );
        favoriteEatsReportSupabasePrefetchFailure(
          'listShoppingPlanRecipeItems',
          err,
        );
        throw err;
      }
      recipeRows = getRecipeDerivedShoppingPlanRows({ db });
    }
    recipeRows.forEach((entry) => {
      const label = String(entry?.label || '').trim();
      const quantity = Number(entry?.quantity || 0);
      if (!label || !Number.isFinite(quantity) || quantity <= 0) return;
      const baseName = String(entry?.name || '').trim();
      const variantName = String(entry?.variantName || '').trim();
      const fromPlan = String(entry?.key || '').trim();
      const key =
        fromPlan || getShoppingItemVariantAwareKey(baseName, variantName);
      if (!key) return;
      shoppingRecipeQuantities.set(
        key,
        (shoppingRecipeQuantities.get(key) || 0) + quantity,
      );
    });
  };
  const shoppingBrowsePlanRowsByKey = new Map();
  const refreshShoppingBrowsePlanRowsIndex = async (options = {}) => {
    const shouldApply =
      options && typeof options.shouldApply === 'function'
        ? options.shouldApply
        : null;
    if (!isShoppingPlannerSelectMode()) {
      shoppingBrowsePlanRowsByKey.clear();
      return false;
    }
    try {
      const rows =
        favoriteEatsShouldUseSupabaseDataDoor() && window.dataService
          ? await getShoppingPlanSelectionRowsViaDataService({ db })
          : getShoppingPlanSelectionRows({ db });
      const nextRowsByKey = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = String(row?.key || '').trim();
        if (!key) return;
        nextRowsByKey.set(key, row);
        const ivKey = resolveBrowseIvKeyForPlanRow(row, shoppingRows);
        if (ivKey) nextRowsByKey.set(ivKey, row);
      });
      if (shouldApply && !shouldApply()) return false;
      shoppingBrowsePlanRowsByKey.clear();
      nextRowsByKey.forEach((row, key) => {
        shoppingBrowsePlanRowsByKey.set(key, row);
      });
      return true;
    } catch (err) {
      console.warn('Items browse plan row index failed:', err);
      return false;
    }
  };
  let initialShoppingBrowsePlanRowsIndexPromise = Promise.resolve();
  if (isShoppingPlannerSelectMode()) {
    hydrateShoppingSelectionsFromPlan();
    initialShoppingBrowsePlanRowsIndexPromise = refreshShoppingBrowsePlanRowsIndex();
  }

  const runDeferredRecipeDerivedHydrate = async () => {
    if (!isShoppingPlannerSelectMode()) return;
    try {
      await recomputeRecipeDerivedPlanDisplay();
      syncShoppingActionButtonState();
      applyShoppingFilters();
    } catch (recipeHydrateErr) {
      console.warn(
        'Items page: hydrateRecipeDerivedShoppingSelections failed:',
        recipeHydrateErr,
      );
    }
  };
  const recomputeRecipeDerivedPlanDisplay = async (options = {}) => {
    const shouldApply =
      options && typeof options.shouldApply === 'function'
        ? options.shouldApply
        : null;
    if (!isShoppingPlannerSelectMode()) return false;
    const planRowsIndexApplied = await refreshShoppingBrowsePlanRowsIndex({
      shouldApply,
    });
    if (shouldApply && !shouldApply()) return false;
    if (!planRowsIndexApplied) return false;
    await hydrateRecipeDerivedShoppingSelections();
    if (shouldApply && !shouldApply()) return false;
    refreshShoppingSelectionUi({ fullRerender: false });
    return true;
  };
  syncShoppingActionButtonState();

  const getBrowsePlanRow = (planKey) => {
    const key = String(planKey || '').trim();
    if (!key) return null;
    const direct = shoppingBrowsePlanRowsByKey.get(key);
    if (direct) return direct;
    const aggregateKey = resolveShoppingBrowsePlanRowAggregateKey(
      key,
      shoppingRows,
    );
    if (aggregateKey && aggregateKey !== key) {
      return shoppingBrowsePlanRowsByKey.get(aggregateKey) || null;
    }
    return null;
  };
  const planKeyHasDirectUnspecifiedSelection = (planKey) =>
    shoppingQuantityUnspecifiedKeys.has(String(planKey || '').trim());
  const getBrowseDisplayBucketsForKey = (planKey) => {
    const key = String(planKey || '').trim();
    const row = getBrowsePlanRow(planKey);
    const tails = (Array.isArray(row?.buckets) ? row.buckets : []).filter(
      (bucket) => bucket && bucket.kind !== 'selected',
    );
    const direct = getDirectShoppingQty(planKey);
    if (direct > SHOPPING_QTY_EPSILON) {
      const buckets = [
        { key: 'selected', kind: 'selected', quantity: direct },
        ...tails.map((bucket) => ({ ...bucket })),
      ];
      if (
        planKeyHasDirectUnspecifiedSelection(key) &&
        !tails.some((bucket) => bucket && bucket.kind === 'unspecified')
      ) {
        buckets.splice(1, 0, {
          key: 'unspecified',
          kind: 'unspecified',
          quantity: 1,
        });
      }
      return buckets;
    }
    if (planKeyHasDirectUnspecifiedSelection(key)) {
      const hasUnspecifiedTail = tails.some(
        (bucket) => bucket && bucket.kind === 'unspecified',
      );
      const directSome = hasUnspecifiedTail
        ? []
        : [{ key: 'unspecified', kind: 'unspecified', quantity: 1 }];
      return [...directSome, ...tails.map((bucket) => ({ ...bucket }))];
    }
    return tails.map((bucket) => ({ ...bucket }));
  };
  const getBrowseAmountDetailText = (planKey) => {
    const row = getBrowsePlanRow(planKey);
    return formatShoppingBrowsePlannerDisplayDetailText({
      variantName: row?.variantName || '',
      buckets: getBrowseDisplayBucketsForKey(planKey),
      useMetric: !!row?.useMetric,
    });
  };
  const browsePlannerRowHasAmountTail = (planKey) => {
    const row = getBrowsePlanRow(planKey);
    return shoppingBrowsePlannerRowHasAmountTail(
      getBrowseDisplayBucketsForKey(planKey),
      {
        variantName: row?.variantName || '',
        useMetric: !!row?.useMetric,
      },
    );
  };
  const getBrowsePlannerPlainStepQty = (planKey) => {
    const row = getBrowsePlanRow(planKey);
    return getBrowsePlannerPlainStepQtyFromParts({
      directQty: getDirectShoppingQty(planKey),
      recipeQty: getRecipeShoppingQty(planKey),
      planRowBuckets: Array.isArray(row?.buckets) ? row.buckets : [],
    });
  };
  const getBrowsePlannerDirectQtyForPlainStep = (planKey, nextPlain) =>
    getBrowsePlannerDirectQtyFromPlainStep({
      plainQty: nextPlain,
      directQty: getDirectShoppingQty(planKey),
      recipeQty: getRecipeShoppingQty(planKey),
      planRowBuckets: Array.isArray(getBrowsePlanRow(planKey)?.buckets)
        ? getBrowsePlanRow(planKey).buckets
        : [],
    });
  const getNextBrowsePlannerDirectQty = (planKey, delta) => {
    const plain = getBrowsePlannerPlainStepQty(planKey);
    const nextPlain = getNextShoppingStepQty(plain, delta);
    return getBrowsePlannerDirectQtyForPlainStep(planKey, nextPlain);
  };
  const planKeyHasBrowsePlannerSelection = (planKey) =>
    planKeyHasDirectUnspecifiedSelection(planKey) ||
    hasPositiveShoppingQty(getBrowsePlannerPlainStepQty(planKey)) ||
    browsePlannerRowHasAmountTail(planKey);
  const browsePlannerDecreaseClearsSelection = (planKey) => {
    if (browsePlannerRowHasAmountTail(planKey)) return false;
    const plainQty = getBrowsePlannerPlainStepQty(planKey);
    const nextPlain = getNextShoppingStepQty(plainQty, -1);
    return (
      hasPositiveShoppingQty(plainQty) && !hasPositiveShoppingQty(nextPlain)
    );
  };
  const syncBrowsePlannerStepperAfterQtyChange = (planKey) => {
    const normalized = String(planKey || '').trim();
    if (!normalized) return;
    if (planKeyHasBrowsePlannerSelection(normalized)) {
      shoppingRowStepperController.activate(normalized);
    } else if (shoppingRowStepperController.isActive(normalized)) {
      shoppingRowStepperController.collapseActive();
    }
  };
  const itemHasBrowsePlannerSelection = (
    itemName,
    variants,
    browseItem,
    options = {},
  ) => {
    const includeDefault = options.includeDefault !== false;
    if (
      includeDefault &&
      planKeyHasBrowsePlannerSelection(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      )
    ) {
      return true;
    }
    return (variants || []).some((v) =>
      planKeyHasBrowsePlannerSelection(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      ),
    );
  };
  const getShoppingRowHasSelection = (item) => {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return false;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    if (variants.length > 0) {
      return itemHasBrowsePlannerSelection(itemName, variants, item);
    }
    const key =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    return planKeyHasBrowsePlannerSelection(key);
  };
  const getBrowsePlannerItemDefaultPlanKey = (item) => {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return '';
    return (
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName)
    );
  };
  const itemNeedsPlannerExpandableRow = (item) => {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    if (variants.length > 0) return true;
    const planKey = getBrowsePlannerItemDefaultPlanKey(item);
    if (!planKey) return false;
    // No-variant chevrons are for recipe-derived amount strings only; plain
    // whole-number stepper qty stays on a flat primary row.
    return browsePlannerRowHasAmountTail(planKey);
  };
  const noVariantPlannerRowDomMismatch = () => {
    if (!isShoppingPlannerSelectMode()) return false;
    for (const item of shoppingRows) {
      const variants = Array.isArray(item?.variants) ? item.variants : [];
      if (variants.length > 0) continue;
      const itemName = String(item?.name || '').trim();
      if (!itemName) continue;
      const needsExpand = itemNeedsPlannerExpandableRow(item);
      const itemKey = getShoppingSelectionKey(itemName);
      const parentLi = list.querySelector(
        `li.shopping-variant-parent[data-variant-parent-key="${itemKey}"]`,
      );
      const simpleLi = list.querySelector(
        `li[data-shopping-stepper-key="${itemName}"]`,
      );
      if (needsExpand && simpleLi && !parentLi) return true;
      if (!needsExpand && parentLi) return true;
    }
    return false;
  };
  const setShoppingQtyFromDirectDelta = (
    key,
    delta,
    meta = null,
    options = {},
  ) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const direct = getDirectShoppingQty(normalizedKey);
    const recipe = getRecipeShoppingQty(normalizedKey);
    const nextDirect = getNextShoppingStepQty(direct, delta);
    setShoppingQty(normalizedKey, nextDirect + recipe, meta, options);
  };
  const setShoppingQtyFromDirectValue = (
    key,
    nextDirect,
    meta = null,
    options = {},
  ) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const recipe = getRecipeShoppingQty(normalizedKey);
    const numericDirect = Math.max(0, Number(nextDirect || 0));
    setShoppingQty(
      normalizedKey,
      Number.isFinite(numericDirect) ? numericDirect + recipe : recipe,
      meta,
      options,
    );
  };
  // Charter §C: structural separation. The local-apply helper never reaches
  // remote; the flush helper never touches local containers. This replaces the
  // old antipattern that smuggled a flush through a local-update function.
  const applyShoppingPlannerQtyLocal = (op) => {
    if (!op || op.surface !== 'plan' || op.field !== 'quantity') return;
    logShoppingPlannerQtySync('local applied', {
      itemKey: String(op.entityKey || ''),
      value: op.value,
      clientSeq: op.clientSeq || null,
    });
    const meta = op.meta && typeof op.meta === 'object' ? op.meta : {};
    if (
      meta.quantityUnspecified === true &&
      !hasPositiveShoppingQty(Number(op.value || 0))
    ) {
      setShoppingUnspecifiedSelection(op.entityKey, meta, {
        skipRemoteSave: true,
      });
      return;
    }
    setShoppingQtyFromDirectValue(op.entityKey, op.value, op.meta, {
      skipRemoteSave: true,
    });
  };
  const flushShoppingPlannerQtyToRemote = async (op) => {
    if (!op || op.surface !== 'plan' || op.field !== 'quantity') return null;
    if (shouldUseRemoteShoppingState && !shouldUseRemoteShoppingState()) {
      return { ok: true, updated_at: null };
    }
    if (
      !window.dataService ||
      typeof window.dataService.setPlanItemQuantity !== 'function'
    ) {
      return null;
    }
    const itemKey = String(op.entityKey || '').trim();
    if (!itemKey) return null;
    const meta = op.meta && typeof op.meta === 'object' ? op.meta : {};
    const request = {
      itemKey,
      quantity: Number(op.value || 0),
    };
    if (Object.prototype.hasOwnProperty.call(meta, 'itemName')) {
      request.name = meta.itemName == null ? '' : String(meta.itemName);
    }
    if (Object.prototype.hasOwnProperty.call(meta, 'variantName')) {
      request.variantName =
        meta.variantName == null ? '' : String(meta.variantName);
    }
    if (Object.prototype.hasOwnProperty.call(meta, 'ingredientVariantId')) {
      const raw = Number(meta.ingredientVariantId);
      request.ingredientVariantId =
        Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
    }
    if (
      meta.quantityUnspecified === true ||
      shoppingQuantityUnspecifiedKeys.has(itemKey)
    ) {
      request.quantityUnspecified = true;
    }
    const result = await window.dataService.setPlanItemQuantity(request);
    const rpcOk = !result || result.ok !== false;
    const rpcDeleted =
      result && typeof result === 'object' && result.deleted === true;
    if (meta.quantityUnspecified === true && (!rpcOk || rpcDeleted)) {
      const reason =
        result && typeof result === 'object' && result.reason
          ? String(result.reason)
          : rpcDeleted
            ? 'server treated unspecified selection as delete'
            : 'rpc failed';
      throw new Error(
        `Could not persist unspecified plan selection for ${itemKey}: ${reason}`,
      );
    }
    logShoppingPlannerQtySync('rpc returned', {
      itemKey,
      value: request.quantity,
      updated_at:
        result && typeof result === 'object'
          ? result.updated_at || result.updatedAt || null
          : null,
      ok: !result || result.ok !== false,
      reason:
        result && typeof result === 'object' && result.reason
          ? String(result.reason)
          : '',
    });
    return result;
  };
  const shoppingPlannerQtyInputQueue = getFavoriteEatsItemsQuantityQueue({
    applyLocal: applyShoppingPlannerQtyLocal,
    flushRemote: flushShoppingPlannerQtyToRemote,
  });
  // Expose so main.js's wholesale-hydrate helpers
  // (mergeRemotePlanForPerKeyStaleness, seedShoppingPlanItemsQuantityQueueFromRemotePlan)
  // can read per-key state and protect itemSelections against snapshot races.
  // Mirrors window.favoriteEatsPlanRecipeServingsQueue for recipes.
  try {
    if (typeof window !== 'undefined' && shoppingPlannerQtyInputQueue) {
      window.favoriteEatsPlanItemsQuantityQueue = shoppingPlannerQtyInputQueue;
    }
  } catch (_) {
    // ignore
  }
  // Per-row Realtime patch for `plan.selected_items`. Receives the Supabase
  // postgres_changes payload, uses the queue's per-key skip rule to drop
  // stale / same-device echoes, applies the new quantity to local state,
  // and refreshes the items DOM in place. Returning `true` tells the
  // wholesale-hydrate fallback to stand down.
  const applyShoppingPlannerQtyRemotePatch = (payload) => {
    if (!payload || typeof payload !== 'object') return false;
    if (String(payload.schema || '') !== 'plan') return false;
    if (String(payload.table || '') !== 'selected_items') return false;
    const eventType = String(payload.eventType || '').toUpperCase();
    const isDelete = eventType === 'DELETE';
    const rowData = isDelete
      ? payload.old && typeof payload.old === 'object'
        ? payload.old
        : null
      : payload.new && typeof payload.new === 'object'
        ? payload.new
        : null;
    if (!rowData) return false;
    const itemKey = String(rowData.item_key || '').trim();
    if (!itemKey) return false;
    const nextDirect = isDelete ? 0 : Math.max(0, Number(rowData.quantity || 0));
    if (!Number.isFinite(nextDirect)) return false;
    const quantityUnspecified =
      !isDelete && rowData.quantity_unspecified === true;
    const updatedAt = rowData.updated_at || null;
    const opLike = { surface: 'plan', entityKey: itemKey, field: 'quantity' };
    if (
      shoppingPlannerQtyInputQueue &&
      typeof shoppingPlannerQtyInputQueue.shouldSkipEcho === 'function' &&
      shoppingPlannerQtyInputQueue.shouldSkipEcho(opLike, {
        updated_at: updatedAt,
        value: nextDirect,
      })
    ) {
      const queueState =
        typeof shoppingPlannerQtyInputQueue.getKeyState === 'function'
          ? shoppingPlannerQtyInputQueue.getKeyState(opLike)
          : null;
      logShoppingPlannerQtySync('child patch skipped', {
        itemKey,
        value: nextDirect,
        updated_at: updatedAt,
        pending: !!queueState?.pending,
        inFlight: !!queueState?.inFlight,
        lastAppliedServerUpdatedAt:
          queueState?.lastAppliedServerUpdatedAt || null,
      });
      return true;
    }
    const rawIv = Number(rowData.ingredient_variant_id);
    const meta = {
      itemName: String(rowData.name || '').trim(),
      variantName: String(rowData.variant_name || '').trim(),
      ingredientVariantId:
        Number.isFinite(rawIv) && rawIv > 0 ? Math.trunc(rawIv) : null,
    };
    if (quantityUnspecified) {
      shoppingQuantityUnspecifiedKeys.add(itemKey);
    }
    if (quantityUnspecified && nextDirect <= SHOPPING_QTY_EPSILON) {
      setShoppingUnspecifiedSelection(itemKey, meta, {
        skipRemoteSave: true,
      });
    } else {
      setShoppingQtyFromDirectValue(itemKey, nextDirect, meta, {
        skipRemoteSave: true,
      });
    }
    logShoppingPlannerQtySync('child patch applied', {
      itemKey,
      value: nextDirect,
      updated_at: updatedAt,
      eventType,
    });
    if (
      shoppingPlannerQtyInputQueue &&
      typeof shoppingPlannerQtyInputQueue.recordEchoApplied === 'function'
    ) {
      shoppingPlannerQtyInputQueue.recordEchoApplied(opLike, {
        updated_at: updatedAt,
        value: nextDirect,
        quantityUnspecified,
      });
    }
    // Items list is only visible in planner-select mode; the DOM refresh is
    // a no-op cost when the user isn't on this page. `fullRerender: false`
    // updates only the affected stepper / qty in place.
    try {
      if (typeof refreshShoppingSelectionUi === 'function') {
        refreshShoppingSelectionUi({ fullRerender: false });
      }
    } catch (err) {
      console.warn('refreshShoppingSelectionUi (remote patch) failed:', err);
    }
    return true;
  };
  const enqueueShoppingPlannerDirectQty = (key, nextDirect, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return false;
    const numericDirect = Math.max(0, Number(nextDirect || 0));
    const value = Number.isFinite(numericDirect) ? numericDirect : 0;
    if (!shoppingPlannerQtyInputQueue) {
      setShoppingQtyFromDirectValue(normalizedKey, value, meta);
      return true;
    }
    logShoppingPlannerQtySync('enqueue requested', {
      itemKey: normalizedKey,
      value,
      clientSeq: shoppingBrowsePlannerInputSeq + 1,
    });
    const nextMeta =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? { ...meta }
        : {};
    if (
      shoppingQuantityUnspecifiedKeys.has(normalizedKey) &&
      nextMeta.quantityUnspecified !== false
    ) {
      nextMeta.quantityUnspecified = true;
    }
    return shoppingPlannerQtyInputQueue.enqueue({
      surface: 'plan',
      entityKey: normalizedKey,
      field: 'quantity',
      value,
      meta: nextMeta,
      clientSeq: (shoppingBrowsePlannerInputSeq += 1),
    });
  };
  const enqueueShoppingPlannerUnspecifiedSelection = (key, meta = null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return false;
    if (!shoppingPlannerQtyInputQueue) {
      setShoppingUnspecifiedSelection(normalizedKey, meta);
      return true;
    }
    logShoppingPlannerQtySync('enqueue requested', {
      itemKey: normalizedKey,
      value: 0,
      clientSeq: shoppingBrowsePlannerInputSeq + 1,
    });
    return shoppingPlannerQtyInputQueue.enqueue({
      surface: 'plan',
      entityKey: normalizedKey,
      field: 'quantity',
      value: 0,
      meta: {
        ...(meta && typeof meta === 'object' && !Array.isArray(meta)
          ? { ...meta }
          : {}),
        quantityUnspecified: true,
      },
      clientSeq: (shoppingBrowsePlannerInputSeq += 1),
    });
  };

  const getItemTotalQty = (itemName, variants, browseItem, options = {}) => {
    const includeDefault = options.includeDefault !== false;
    let total = 0;
    if (includeDefault) {
      total = getShoppingQty(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      );
    }
    (variants || []).forEach((v) => {
      total += getShoppingQty(getBrowseVariantPlanKey(itemName, v, browseItem));
    });
    return total;
  };
  const getItemDirectTotalQty = (itemName, variants, browseItem, options = {}) => {
    const includeDefault = options.includeDefault !== false;
    let total = 0;
    if (includeDefault) {
      total = getDirectShoppingQty(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      );
    }
    (variants || []).forEach((v) => {
      total += getDirectShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  };
  const itemBrowseGroupHasRecipeTail = (itemName, variants, browseItem, options = {}) => {
    const includeDefault = options.includeDefault !== false;
    if (
      includeDefault &&
      browsePlannerRowHasAmountTail(
        getBrowseVariantPlanKey(itemName, 'default', browseItem),
      )
    ) {
      return true;
    }
    return (variants || []).some((v) =>
      browsePlannerRowHasAmountTail(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      ),
    );
  };
  const getVariantQtyMap = (itemName, variants, browseItem, options = {}) => {
    const includeDefault = options.includeDefault !== false;
    const m = new Map();
    if (includeDefault) {
      m.set(
        'default',
        getDirectShoppingQty(
          getBrowseVariantPlanKey(itemName, 'default', browseItem),
        ),
      );
    }
    (variants || []).forEach((v) => {
      m.set(
        v,
        getDirectShoppingQty(getBrowseVariantPlanKey(itemName, v, browseItem)),
      );
    });
    return m;
  };
  const hasAnyVariantSelection = (itemName, variants) =>
    hasPositiveShoppingQty(getItemTotalQty(itemName, variants));
  function getItemRecipeQty(itemName, variants, browseItem) {
    let total = getRecipeShoppingQty(
      getBrowseVariantPlanKey(itemName, 'default', browseItem),
    );
    (variants || []).forEach((v) => {
      total += getRecipeShoppingQty(
        getBrowseVariantPlanKey(itemName, v, browseItem),
      );
    });
    return total;
  }
  function getShoppingRowDirectQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemDirectTotalQty(itemName, variants, item)
      : getDirectShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }
  function getShoppingRowTotalQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemTotalQty(itemName, variants, item)
      : getShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }
  function getShoppingRowRecipeQty(item) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) return 0;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    return variants.length > 0
      ? getItemRecipeQty(itemName, variants, item)
      : getRecipeShoppingQty(
          getShoppingItemVariantAwareKey(itemName) ||
            getShoppingSelectionKey(itemName),
        );
  }

  const expandedVariantItems = new Set();
  const syncVariantParentByKey = new Map();
  const fitVariantParentHeadlineByKey = new Map();
  let syncVariantChildVisuals = () => {};
  let itemsVariantParentFitFrame = 0;
  let itemsVariantParentFitObserver = null;
  const scheduleVariantParentHeadlineFitting = () => {
    if (itemsVariantParentFitFrame) {
      cancelAnimationFrame(itemsVariantParentFitFrame);
    }
    itemsVariantParentFitFrame = requestAnimationFrame(() => {
      itemsVariantParentFitFrame = 0;
      fitVariantParentHeadlineByKey.forEach((fitFn) => {
        try {
          fitFn();
        } catch (_) {}
      });
    });
  };
  const ensureVariantParentHeadlineFitObserver = () => {
    if (!list || itemsVariantParentFitObserver) return;
    if (typeof ResizeObserver !== 'function') return;
    itemsVariantParentFitObserver = new ResizeObserver(() => {
      scheduleVariantParentHeadlineFitting();
    });
    itemsVariantParentFitObserver.observe(list);
  };
  const syncAllVisibleVariantChildSteppers = () => {
    list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
      const varKey = String(row.dataset.variantQtyKey || '');
      if (varKey) syncVariantChildVisuals(row, varKey);
    });
  };
  const collapseExpandedVariantRows = () => {
    let changed = false;
    if (shoppingRowStepperController.collapseActive()) {
      changed = true;
      syncAllVisibleVariantChildSteppers();
    }
    if (!expandedVariantItems.size) return changed;
    changed = true;
    expandedVariantItems.clear();
    list.querySelectorAll('li.shopping-variant-parent').forEach((parentLi) => {
      parentLi.dataset.expanded = 'false';
    });
    list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
      row.style.display = 'none';
    });
    syncVariantParentByKey.forEach((syncFn) => {
      try {
        syncFn();
      } catch (_) {}
    });
    return changed;
  };
  const getShoppingPlannerRowActiveKey = (row) => {
    if (!(row instanceof HTMLElement)) return '';
    const varKey = String(row.dataset.variantQtyKey || '').trim();
    if (varKey) return varKey;
    const itemName = String(row.dataset.shoppingStepperKey || '').trim();
    if (!itemName) return '';
    return (
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName)
    );
  };
  const shoppingRowStepperController = listRowStepper.createController({
    listEl: list,
    isEnabled: isShoppingPlannerSelectMode,
    collapseExpanded: collapseExpandedVariantRows,
    idleCollapseMs: 3500,
    onIdleCollapse: () => {
      syncAllVisibleShoppingRowStates();
      syncAllVisibleVariantChildSteppers();
      syncShoppingActionButtonState();
    },
    shouldPauseIdleCollapse: () =>
      !!list.querySelector('.shopping-stepper-qty-input') ||
      isShoppingCompoundDropdownOpen(),
    idleResetActivity: (target, activeKey) => {
      const el =
        target instanceof Element
          ? target
          : target instanceof Text
            ? target.parentElement
            : null;
      const row = el?.closest?.('li');
      return !!(
        row &&
        list.contains(row) &&
        getShoppingPlannerRowActiveKey(row) === activeKey
      );
    },
  });
  /** Bumped on planner qty / stepper focus; remote hydrate must not overwrite in-flight edits. */
  let shoppingBrowsePlannerEditSeq = 0;
  const bumpShoppingBrowsePlannerEdit = () => {
    shoppingBrowsePlannerEditSeq += 1;
  };
  let shoppingBrowsePlanUiRefreshSeq = 0;
  let shoppingBrowsePlannerInputSeq = 0;
  const buildBrowsePlannerRowStepperOptions = (
    plainStepQty,
    hasAmountTail,
    isActive,
    decreaseClearsSelection,
  ) => ({
    enabled: isShoppingPlannerSelectMode(),
    qty: plainStepQty,
    qtyMax: 9999,
    isActive:
      isActive &&
      (hasPositiveShoppingQty(plainStepQty) || hasAmountTail),
    allowZeroActive: hasAmountTail && !hasPositiveShoppingQty(plainStepQty),
    selectedDatasetKey: 'shoppingSelected',
    showAsSelected:
      hasPositiveShoppingQty(plainStepQty) || hasAmountTail,
    badgeContent: getShoppingBrowsePlannerBadgeContent(plainStepQty, {
      hasAmountTail,
    }),
    stepperShowTailIcon: shouldShoppingBrowsePlannerStepperShowTailIcon(
      plainStepQty,
      { hasAmountTail },
    ),
    shoppingDecreaseClearsSelection: decreaseClearsSelection,
    formatQtyLabel: (qty) =>
      formatShoppingBrowsePlannerStepperQtyLabel(qty, {
        hasAmountTail,
      }),
  });
  const getMenuPlanItemRemoveContext = (planKey) => {
    const key = String(planKey || '').trim();
    if (!key) return null;
    const hasDirect =
      hasPositiveShoppingQty(getDirectShoppingQty(key)) ||
      planKeyHasDirectUnspecifiedSelection(key);

    const planRow = getBrowsePlanRow(key);
    const recipeContributors = [];
    const seenRecipeKeys = new Set();
    (Array.isArray(planRow?.contributionRows) ? planRow.contributionRows : [])
      .filter((entry) => String(entry?.sourceType || '') === 'recipe')
      .forEach((entry) => {
        const recipeId = Number(entry?.recipeId);
        const dedupeKey =
          Number.isFinite(recipeId) && recipeId > 0
            ? `id:${Math.trunc(recipeId)}`
            : String(entry?.title || '').trim().toLowerCase();
        if (!dedupeKey || seenRecipeKeys.has(dedupeKey)) return;
        seenRecipeKeys.add(dedupeKey);
        recipeContributors.push({
          id:
            Number.isFinite(recipeId) && recipeId > 0
              ? Math.trunc(recipeId)
              : null,
          title:
            String(entry?.title || '').trim() ||
            (Number.isFinite(recipeId) && recipeId > 0
              ? `Recipe ${Math.trunc(recipeId)}`
              : 'Recipe'),
        });
      });
    recipeContributors.sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, {
        sensitivity: 'base',
      }),
    );

    const hasRecipe =
      recipeContributors.length > 0 ||
      hasPositiveShoppingQty(getRecipeShoppingQty(key));
    if (!hasDirect && !hasRecipe) return null;

    return {
      hasDirect,
      hasRecipe,
      recipeContributors,
    };
  };
  const mergeMenuPlanRecipeContributors = (target, sourceEntries) => {
    const seenRecipeKeys = new Set(
      (Array.isArray(target) ? target : []).map((entry) => {
        const recipeId = Number(entry?.id);
        return Number.isFinite(recipeId) && recipeId > 0
          ? `id:${Math.trunc(recipeId)}`
          : String(entry?.title || '').trim().toLowerCase();
      }),
    );
    const merged = Array.isArray(target) ? target.slice() : [];
    (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((entry) => {
      const recipeId = Number(entry?.id);
      const dedupeKey =
        Number.isFinite(recipeId) && recipeId > 0
          ? `id:${Math.trunc(recipeId)}`
          : String(entry?.title || '').trim().toLowerCase();
      if (!dedupeKey || seenRecipeKeys.has(dedupeKey)) return;
      seenRecipeKeys.add(dedupeKey);
      merged.push(entry);
    });
    merged.sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, {
        sensitivity: 'base',
      }),
    );
    return merged;
  };
  const plannerParentHandlesRemoveDirectly = (allVariantNames, namedVariants) => {
    const names = Array.isArray(allVariantNames) ? allVariantNames : [];
    const named = Array.isArray(namedVariants) ? namedVariants : [];
    if (names.length === 1) return true;
    if (named.length === 1) return true;
    if (
      named.length === 0 &&
      names.length > 0 &&
      names.every((variantName) =>
        isShoppingBrowseBaseVariantName(
          variantName === 'default' ? 'default' : variantName,
        ),
      )
    ) {
      return true;
    }
    return false;
  };
  const getPlannerParentRemoveContext = (baseName, allVariantNames, browseItem) => {
    let hasDirect = false;
    let hasRecipe = false;
    let recipeContributors = [];
    (Array.isArray(allVariantNames) ? allVariantNames : []).forEach(
      (variantName) => {
        const planKey = getBrowseVariantPlanKey(
          baseName,
          variantName,
          browseItem,
        );
        const ctx = getMenuPlanItemRemoveContext(planKey);
        if (!ctx) return;
        hasDirect = hasDirect || ctx.hasDirect;
        hasRecipe = hasRecipe || ctx.hasRecipe;
        recipeContributors = mergeMenuPlanRecipeContributors(
          recipeContributors,
          ctx.recipeContributors,
        );
      },
    );
    if (!hasDirect && !hasRecipe) return null;
    return { hasDirect, hasRecipe, recipeContributors };
  };
  const runMenuPlanItemRemove = (
    planKey,
    displayName,
    meta = null,
    onAfterRemove = null,
  ) => {
    const key = String(planKey || '').trim();
    if (!key) return;
    const context = getMenuPlanItemRemoveContext(key);
    if (!context) return;
    void (async () => {
      const removed = await promptRemoveItemFromMenuPlan({
        displayName,
        hasDirect: context.hasDirect,
        hasRecipe: context.hasRecipe,
        recipeContributors: context.recipeContributors,
        removeDirect: async () => {
          bumpShoppingBrowsePlannerEdit();
          enqueueShoppingPlannerDirectQty(key, 0, meta);
        },
      });
      if (!removed) return;
      if (typeof onAfterRemove === 'function') {
        onAfterRemove();
      }
    })();
  };
  const runMenuPlanParentItemRemove = (
    baseName,
    allVariantNames,
    browseItem,
    displayName,
    onAfterRemove = null,
  ) => {
    const context = getPlannerParentRemoveContext(
      baseName,
      allVariantNames,
      browseItem,
    );
    if (!context) return;
    void (async () => {
      const removed = await promptRemoveItemFromMenuPlan({
        displayName,
        hasDirect: context.hasDirect,
        hasRecipe: context.hasRecipe,
        recipeContributors: context.recipeContributors,
        removeDirect: async () => {
          bumpShoppingBrowsePlannerEdit();
          (Array.isArray(allVariantNames) ? allVariantNames : []).forEach(
            (variantName) => {
              const planKey = getBrowseVariantPlanKey(
                baseName,
                variantName,
                browseItem,
              );
              const keyContext = getMenuPlanItemRemoveContext(planKey);
              if (!keyContext?.hasDirect) return;
              enqueueShoppingPlannerDirectQty(planKey, 0, {
                itemName: baseName,
                variantName:
                  variantName === 'default' ? 'default' : variantName,
                ingredientVariantId: resolveBrowseIngredientVariantId(
                  browseItem,
                  variantName,
                ),
              });
            },
          );
        },
      });
      if (!removed) return;
      if (typeof onAfterRemove === 'function') {
        onAfterRemove();
      }
    })();
  };
  const syncBrowsePlannerRowAmountButton = (rowEl, planKey) => {
    const amountBtn = rowEl.querySelector(
      'button.shopping-list-doc-text--amount',
    );
    if (!(amountBtn instanceof HTMLButtonElement)) return;
    const detail = getBrowseAmountDetailText(planKey);
    const amountText = formatShoppingBrowsePlannerAmountButtonText(detail);
    amountBtn.textContent = amountText;
    amountBtn.style.display = amountText ? '' : 'none';
  };
  const syncShoppingRowVisuals = (rowEl, itemName) => {
    // Variant-aware key so simple rows whose ingredient has an `iv:{defaultId}`
    // entry (recipe-derived selections) read the same bucket they were written to.
    const selectionKey =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    const plainStepQty = getBrowsePlannerPlainStepQty(selectionKey);
    const hasAmountTail = browsePlannerRowHasAmountTail(selectionKey);
    listRowStepper.syncRowVisuals(
      rowEl,
      buildBrowsePlannerRowStepperOptions(
        plainStepQty,
        hasAmountTail,
        shoppingRowStepperController.isActive(selectionKey),
        browsePlannerDecreaseClearsSelection(selectionKey),
      ),
    );
    syncBrowsePlannerRowAmountButton(rowEl, selectionKey);
  };
  const syncShoppingRowSelectionState = (rowEl, itemName) => {
    syncShoppingRowVisuals(rowEl, itemName);
  };
  const syncAllVisibleShoppingRowStates = () => {
    list.querySelectorAll('li[data-shopping-stepper-key]').forEach((row) => {
      const itemName = String(row.dataset.shoppingStepperKey || '');
      if (itemName) syncShoppingRowSelectionState(row, itemName);
    });
  };
  const isShoppingFilterChipDropdownUiTarget = (target) => {
    const el =
      target instanceof Element
        ? target
        : target instanceof Text
          ? target.parentElement
          : null;
    if (!el) return false;
    return !!(
      el.closest('.list-filter-chip-dock') ||
      el.closest('.app-filter-chip-dropdown-panel') ||
      el.closest('.app-filter-chip-dropdown-backdrop')
    );
  };
  shoppingRowStepperController.bindAutoDismiss({
    shouldIgnoreTarget: (target) => {
      if (list.querySelector('.shopping-stepper-qty-input')) return true;
      return isShoppingFilterChipDropdownUiTarget(target);
    },
    onDismissed: () => {
      syncAllVisibleShoppingRowStates();
      syncAllVisibleVariantChildSteppers();
    },
  });
  const toggleShoppingRowSelectionState = (rowEl, itemName) => {
    const key =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    if (!key) return;
    bumpShoppingBrowsePlannerEdit();
    const direct = getDirectShoppingQty(key);
    const nextDirect = hasPositiveShoppingQty(direct) ? 0 : 1;
    enqueueShoppingPlannerDirectQty(key, nextDirect, { itemName });
    syncBrowsePlannerStepperAfterQtyChange(key);
    refreshShoppingSelectionUi({ fullRerender: false });
  };
  const incrementShoppingQty = (rowEl, itemName, delta) => {
    const key =
      getShoppingItemVariantAwareKey(itemName) ||
      getShoppingSelectionKey(itemName);
    if (!key) return;
    bumpShoppingBrowsePlannerEdit();
    enqueueShoppingPlannerDirectQty(
      key,
      getNextBrowsePlannerDirectQty(key, delta),
      { itemName },
    );
    syncBrowsePlannerStepperAfterQtyChange(key);
    refreshShoppingSelectionUi({ fullRerender: false });
  };
  const attachShoppingQtyManualEdit = ({
    qtyEl,
    getQty,
    commitQty,
    onAfterCommit,
  }) => {
    if (!(qtyEl instanceof HTMLElement)) return;
    let inputEl = null;
    let isEditing = false;

    const rerender = () => {
      if (typeof onAfterCommit === 'function') onAfterCommit();
    };
    const onBlur = () => finishEditing('commit');
    const onKeyDown = (event) => {
      if (!event) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEditing('commit');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finishEditing('cancel');
        return;
      }
      event.stopPropagation();
    };
    const finishEditing = (mode) => {
      if (!isEditing) return;
      const currentInput = inputEl;
      inputEl = null;
      isEditing = false;
      if (currentInput) {
        currentInput.removeEventListener('blur', onBlur);
        currentInput.removeEventListener('keydown', onKeyDown);
      }
      if (mode === 'commit') {
        const nextQty = parseShoppingQtyInputValue(currentInput?.value);
        if (nextQty != null) {
          commitQty(nextQty);
          rerender();
          return;
        }
      }
      rerender();
    };
    const stopPropagation = (event) => {
      if (!event) return;
      event.preventDefault();
      event.stopPropagation();
    };

    qtyEl.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    qtyEl.addEventListener('dblclick', (event) => {
      if (!isShoppingPlannerSelectMode()) return;
      stopPropagation(event);
      if (isEditing) return;
      isEditing = true;
      const currentQty = Number(getQty());
      const initialValue = Number.isFinite(currentQty)
        ? String(Math.max(0, Math.min(99, Math.round(currentQty))))
        : '0';
      qtyEl.textContent = '';
      inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.className = 'shopping-stepper-qty-input';
      inputEl.min = '0';
      inputEl.max = '99';
      inputEl.step = '1';
      inputEl.inputMode = 'numeric';
      inputEl.value = initialValue;
      inputEl.addEventListener('click', (e) => e.stopPropagation());
      inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
      inputEl.addEventListener('dblclick', (e) => e.stopPropagation());
      inputEl.addEventListener('blur', onBlur);
      inputEl.addEventListener('keydown', onKeyDown);
      qtyEl.appendChild(inputEl);
      try {
        inputEl.focus();
        inputEl.select();
      } catch (_) {}
    });
  };

  const persistShoppingChipState = (mode = getShoppingFilterChipMode()) => {
    try {
      sessionStorage.setItem(
        getShoppingFilterChipStorageKey(mode),
        JSON.stringify(Array.from(activeFilterChips)),
      );
    } catch (_) {}
  };

  const swapShoppingFilterChipsForPlannerModeChange = (event) => {
    const enteringPlanner = !!(event && event.detail && event.detail.enabled);
    const outgoingMode = enteringPlanner ? 'editor' : 'planner';
    persistShoppingChipState(outgoingMode);
    activeFilterChips.clear();
    restoreShoppingChipState();
  };

  const restoreShoppingChipState = () => {
    try {
      const storageKey = getShoppingFilterChipStorageKey();
      let raw = sessionStorage.getItem(storageKey);
      let shouldPersistMigratedState = false;
      if (!raw) {
        raw = sessionStorage.getItem(SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY);
        shouldPersistMigratedState = !!raw;
      }
      if (!raw && getShoppingFilterChipMode() === 'planner') {
        raw = sessionStorage.getItem(
          `${SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX}:web`,
        );
        shouldPersistMigratedState = !!raw;
      }
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const knownIds = new Set(
        getActiveShoppingFilterChipDefs().map((c) => String(c.id)),
      );
      if (getShoppingFilterChipMode() === 'planner') {
        knownIds.add('not food');
      }
      shoppingLocationChipDefs.forEach((locationDef) => {
        const locationId = String(locationDef?.id || '')
          .trim()
          .toLowerCase();
        if (locationId) knownIds.add(locationId);
      });
      shoppingMoreChipOptionDefs.forEach((optionDef) => {
        const optionId = String(optionDef?.id || '')
          .trim()
          .toLowerCase();
        if (optionId) knownIds.add(optionId);
      });
      shoppingTagChipOptionDefs.forEach((def) => {
        const tid = String(def?.id || '')
          .trim()
          .toLowerCase();
        if (tid) knownIds.add(tid);
      });
      parsed.forEach((chipId) => {
        const id = String(chipId || '')
          .trim()
          .toLowerCase();
        // Back-compat: old "hidden" chip represented deprecated/removed.
        if (id === 'hidden' && knownIds.has('removed')) {
          activeFilterChips.add('removed');
          return;
        }
        if (knownIds.has(id)) activeFilterChips.add(id);
      });
      if (getShoppingFilterChipMode() === 'planner') {
        if (activeFilterChips.delete('food')) {
          shouldPersistMigratedState = true;
        }
        if (activeFilterChips.delete('for recipes')) {
          shouldPersistMigratedState = true;
        }
      } else if (
        activeFilterChips.has('food') &&
        activeFilterChips.has('not food')
      ) {
        activeFilterChips.delete('not food');
        shouldPersistMigratedState = true;
      }
      if (shouldPersistMigratedState) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(activeFilterChips)),
        );
      }
    } catch (_) {}
  };

  const normalizeLocationForChip = (raw) =>
    normalizeShoppingHomeLocationId(raw);
  const getShoppingRowLocationIdsForBrowse = (item) =>
    getShoppingBrowseLocationIds(item).map((locationId) =>
      normalizeLocationForChip(locationId),
    );

  const recomputeShoppingChipCounts = () => {
    const counts = new Map();
    getActiveShoppingFilterChipDefs().forEach((c) => counts.set(c.id, 0));
    if (!counts.has('food')) counts.set('food', 0);
    if (!counts.has('not food')) counts.set('not food', 0);
    shoppingMoreChipOptionDefs.forEach((optionDef) => {
      const optionId = String(optionDef?.id || '')
        .trim()
        .toLowerCase();
      if (optionId) counts.set(optionId, 0);
    });
    shoppingTagChipOptionDefs.forEach((def) => {
      const tid = String(def?.id || '')
        .trim()
        .toLowerCase();
      if (tid) counts.set(tid, 0);
    });
    shoppingRows.forEach((item) => {
      if (isShoppingPlannerSelectMode()) {
        if (getShoppingRowHasSelection(item)) {
          counts.set('selected', (counts.get('selected') || 0) + 1);
        }
        if (hasPositiveShoppingQty(getShoppingRowRecipeQty(item))) {
          counts.set('for recipes', (counts.get('for recipes') || 0) + 1);
        }
      }
      if (item && item.isDeprecated) {
        counts.set('removed', (counts.get('removed') || 0) + 1);
      }
      if (item && item.isHidden) {
        counts.set('hidden', (counts.get('hidden') || 0) + 1);
      }
      if (item && item.isFood === true) {
        counts.set('food', (counts.get('food') || 0) + 1);
      }
      if (item && item.isFood === false) {
        counts.set('not food', (counts.get('not food') || 0) + 1);
      }
      getShoppingRowLocationIdsForBrowse(item).forEach((locId) => {
        counts.set(locId, (counts.get(locId) || 0) + 1);
      });
      if (Number(item?.recipeUseCount || 0) <= 0) {
        counts.set('no recipe', (counts.get('no recipe') || 0) + 1);
      }
      if (Number(item?.aisleUseCount || 0) <= 0) {
        counts.set('no aisle', (counts.get('no aisle') || 0) + 1);
      }
      if (Array.isArray(item?.variants) && item.variants.length > 0) {
        counts.set('has variant(s)', (counts.get('has variant(s)') || 0) + 1);
      }
      const tagSeen = new Set();
      (Array.isArray(item.tags) ? item.tags : []).forEach((raw) => {
        const key = String(raw || '')
          .trim()
          .toLowerCase();
        if (!key) return;
        const chipId = `${SHOPPING_TAG_FILTER_PREFIX}${key}`;
        if (tagSeen.has(chipId)) return;
        tagSeen.add(chipId);
        counts.set(chipId, (counts.get(chipId) || 0) + 1);
      });
    });
    shoppingChipCounts = counts;
  };

  const pruneInactiveShoppingChipState = () => {
    let changed = false;
    Array.from(activeFilterChips).forEach((chipId) => {
      const count = Number(shoppingChipCounts.get(chipId) || 0);
      if (count <= 0) {
        activeFilterChips.delete(chipId);
        changed = true;
      }
    });
    if (changed) persistShoppingChipState();
  };

  const getActiveShoppingLocationFilterIds = (chipIds = activeFilterChips) =>
    shoppingLocationChipDefs
      .map((c) =>
        String(c?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id && chipIds.has(id));

  const getActiveShoppingTagKeysFromChipIds = (chipIds = activeFilterChips) =>
    Array.from(chipIds)
      .map((id) =>
        String(id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((id) => id.startsWith(SHOPPING_TAG_FILTER_PREFIX))
      .map((id) => id.slice(SHOPPING_TAG_FILTER_PREFIX.length));

  const buildShoppingRowFilterMatcher = ({
    chipIds = activeFilterChips,
    forcedLocationIds = null,
    forcedTagKeys = null,
  } = {}) => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const foodOnly = chipIds.has('food');
    const selectedOnly = chipIds.has('selected');
    const recipeOnly = chipIds.has('for recipes');
    const removedOnly = chipIds.has('removed');
    const hiddenOnly = chipIds.has('hidden');
    const notFoodOnly = chipIds.has('not food');
    const noRecipeOnly = chipIds.has('no recipe');
    const noAisleOnly = chipIds.has('no aisle');
    const hasVariantsOnly = chipIds.has('has variant(s)');
    const activeLocationIds = Array.isArray(forcedLocationIds)
      ? forcedLocationIds
      : getActiveShoppingLocationFilterIds(chipIds);
    const activeTagKeys = Array.isArray(forcedTagKeys)
      ? forcedTagKeys
          .map((k) =>
            String(k || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : getActiveShoppingTagKeysFromChipIds(chipIds);
    return (item) => {
      const variants = Array.isArray(item?.variants) ? item.variants : [];
      const matchesSearch =
        !query ||
        (typeof window.shoppingCatalogItemMatchesSearchQuery === 'function'
          ? window.shoppingCatalogItemMatchesSearchQuery(item, query)
          : String(item?.name || '')
              .toLowerCase()
              .includes(query) ||
            variants.some((v) =>
              String(v || '')
                .toLowerCase()
                .includes(query),
            ));
      const matchesRemoved = removedOnly
        ? item?.isDeprecated === true
        : item?.isDeprecated !== true;
      const matchesHidden = hiddenOnly
        ? item?.isHidden === true
        : item?.isHidden !== true;
      const matchesFood = foodOnly
        ? item?.isFood === true
        : notFoodOnly
          ? item?.isFood === false
          : true;
      const matchesLocation =
        activeLocationIds.length === 0 ||
        shoppingBrowseItemMatchesBrowseFilters(item, {
          locationIds: activeLocationIds,
        });
      const matchesNoRecipe = noRecipeOnly
        ? Number(item?.recipeUseCount || 0) <= 0
        : true;
      const matchesNoAisle = noAisleOnly
        ? Number(item?.aisleUseCount || 0) <= 0
        : true;
      const matchesHasVariants = hasVariantsOnly
        ? variants.length > 0
        : true;
      const matchesSelected = selectedOnly
        ? getShoppingRowHasSelection(item)
        : true;
      const matchesRecipeSelections = recipeOnly
        ? hasPositiveShoppingQty(getShoppingRowRecipeQty(item))
        : true;
      const matchesTags =
        activeTagKeys.length === 0 ||
        (Array.isArray(item.tags) &&
          activeTagKeys.some((tk) =>
            item.tags.some(
              (t) =>
                String(t || '')
                  .trim()
                  .toLowerCase() === tk,
            ),
          ));
      return (
        matchesSearch &&
        matchesRemoved &&
        matchesHidden &&
        matchesFood &&
        matchesLocation &&
        matchesNoRecipe &&
        matchesNoAisle &&
        matchesHasVariants &&
        matchesSelected &&
        matchesRecipeSelections &&
        matchesTags
      );
    };
  };

  const isShoppingLocationOptionUnavailable = (rawLocationId) => {
    const locationId = String(rawLocationId || '')
      .trim()
      .toLowerCase();
    if (!locationId) return true;
    // Keep selected options enabled so users can always unselect them.
    if (activeFilterChips.has(locationId)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedLocationIds: [locationId],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const isShoppingTagOptionUnavailable = (rawChipId) => {
    const id = String(rawChipId || '')
      .trim()
      .toLowerCase();
    if (!id.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return true;
    const keyOnly = id.slice(SHOPPING_TAG_FILTER_PREFIX.length);
    if (!keyOnly) return true;
    if (activeFilterChips.has(id)) return false;
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
      forcedTagKeys: [keyOnly],
    });
    return !shoppingRows.some((item) => rowMatchesFilters(item));
  };

  const renderShoppingMoreFoodPanelHeader = (panel) => {
    if (!isShoppingPlannerSelectMode()) return;
    const host = document.createElement('div');
    host.className = 'app-filter-chip-dropdown-panel-header';
    const labelText = 'not food';
    const editorLabel = document.createElement('label');
    editorLabel.className = 'bottom-nav-editor-toggle';
    const editorTitle = document.createElement('span');
    editorTitle.textContent = labelText;
    const switchTrack = document.createElement('span');
    switchTrack.className = 'bottom-nav-editor-switch-track';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bottom-nav-editor-switch-input';
    input.setAttribute('aria-label', labelText);
    input.checked = activeFilterChips.has('not food');
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      if (input.checked) {
        activeFilterChips.add('not food');
        activeFilterChips.delete('food');
      } else {
        activeFilterChips.delete('not food');
      }
      reopenShoppingCompoundDropdownId = 'shopping-more-filters';
      persistShoppingChipState();
      rerenderShoppingFilterChips();
      applyShoppingFilters();
    });
    const switchKnob = document.createElement('span');
    switchKnob.className = 'bottom-nav-editor-switch-knob';
    switchTrack.appendChild(input);
    switchTrack.appendChild(switchKnob);
    editorLabel.appendChild(editorTitle);
    editorLabel.appendChild(switchTrack);
    host.appendChild(editorLabel);
    panel.appendChild(host);
  };

  const flushPlanNarrowRpcBatchIfRemote = async () => {
    if (
      shouldUseRemoteShoppingState() &&
      typeof flushPlanNarrowRpcQueuesWithSessionCommitBatch === 'function'
    ) {
      await flushPlanNarrowRpcQueuesWithSessionCommitBatch();
    }
  };

  const persistPlannerItemSelectionsWholesaleIfRemote = async () => {
    if (
      !shouldUseRemoteShoppingState() ||
      typeof flushCoalescedPlanSaveToDataService !== 'function'
    ) {
      return;
    }
    await flushCoalescedPlanSaveToDataService({ awaited: true });
  };

  const flushPlannerSelectionsAfterBulkAddIfRemote = async () => {
    try {
      await flushPlanNarrowRpcBatchIfRemote();
    } catch (err) {
      console.warn(
        'Items planner narrow quantity flush failed; falling back to wholesale plan save:',
        err,
      );
      try {
        await persistPlannerItemSelectionsWholesaleIfRemote();
      } catch (fallbackErr) {
        console.warn('Items planner wholesale plan save fallback failed:', fallbackErr);
        uiToast('Could not save tagged items to your meal plan.');
        throw fallbackErr;
      }
    }
  };

  const applyShoppingPlannerSelectionsForMatchingItems = (itemPredicate) => {
    if (!isShoppingPlannerSelectMode()) return false;
    if (typeof itemPredicate !== 'function') return false;
    let changed = false;
    bumpShoppingBrowsePlannerEdit();
    runWithShoppingPlanMutationBatch(() => {
      shoppingRows.forEach((item) => {
        if (!item || item.isHidden === true || item.isDeprecated === true) {
          return;
        }
        if (!itemPredicate(item)) return;
        const baseName = String(item?.name || '').trim();
        if (!baseName) return;
        const variants = Array.isArray(item?.variants) ? item.variants : [];
        const setKeyIfZero = (planKey, meta) => {
          const key = String(planKey || '').trim();
          if (!key) return;
          if (hasPositiveShoppingQty(getDirectShoppingQty(key))) return;
          enqueueShoppingPlannerDirectQty(key, 1, meta);
          changed = true;
        };
        if (variants.length > 0) {
          variants.forEach((variantName) => {
            setKeyIfZero(getBrowseVariantPlanKey(baseName, variantName, item), {
              itemName: baseName,
              variantName,
              ingredientVariantId: resolveBrowseIngredientVariantId(
                item,
                variantName,
              ),
            });
          });
        } else {
          setKeyIfZero(getShoppingItemVariantAwareKey(baseName), {
            itemName: baseName,
          });
        }
      });
    });
    if (changed) {
      refreshShoppingSelectionUi({ fullRerender: true });
    }
    return changed;
  };

  const applyShoppingAddByTagSelections = (selectedTagKeys) => {
    const tagKeys = normalizeShoppingBrowseTagKeys(selectedTagKeys);
    if (!tagKeys.length) return false;
    if (!isShoppingPlannerSelectMode()) return false;
    let changed = false;
    bumpShoppingBrowsePlannerEdit();
    runWithShoppingPlanMutationBatch(() => {
      shoppingRows.forEach((item) => {
        if (!item || item.isHidden === true || item.isDeprecated === true) {
          return;
        }
        const baseName = String(item?.name || '').trim();
        if (!baseName) return;
        const matchingVariants = getShoppingBrowseVariantsMatchingTagKeys(
          item,
          tagKeys,
        );
        if (!matchingVariants.length) return;
        matchingVariants.forEach((variantName) => {
          const planKey = getBrowseVariantPlanKey(baseName, variantName, item);
          const key = String(planKey || '').trim();
          if (!key) return;
          if (planKeyHasBrowsePlannerSelection(key)) return;
          const enqueued = enqueueShoppingPlannerUnspecifiedSelection(key, {
            itemName: baseName,
            variantName,
            ingredientVariantId: resolveBrowseIngredientVariantId(
              item,
              variantName,
            ),
          });
          if (enqueued !== false) changed = true;
        });
      });
    });
    if (changed) {
      refreshShoppingSelectionUi({ fullRerender: true });
    }
    return changed;
  };

  const getAddByTagDialogFieldOptions = () =>
    shoppingTagChipOptionDefs.map((def) => ({
      value: String(def?.id || '')
        .trim()
        .toLowerCase()
        .slice(SHOPPING_TAG_FILTER_PREFIX.length),
      label: def?.label || def?.id || '',
    }));

  const openAddByTagModal = async () => {
    const tagOptions = getAddByTagDialogFieldOptions().filter((opt) =>
      String(opt?.value || '').trim(),
    );
    if (!tagOptions.length) return;
    let selectedTagKeys = null;
    let ok = false;
    if (window.ui && typeof window.ui.dialog === 'function') {
      const res = await window.ui.dialog({
        title: 'Add by tag',
        message:
          'All items with selected tags will be added to the items list. Items already selected won\u2019t be changed.',
        fields: [
          {
            key: 'tags',
            type: 'checkboxGroup',
            options: tagOptions,
            value: [],
            required: true,
          },
        ],
        confirmText: 'Add',
        cancelText: 'Cancel',
      });
      ok = !!res;
      selectedTagKeys = ok && res && Array.isArray(res.tags) ? res.tags : null;
    } else {
      ok = false;
    }
    if (!ok || !selectedTagKeys || !selectedTagKeys.length) return;
    const changed = applyShoppingAddByTagSelections(selectedTagKeys);
    if (changed) {
      await flushPlannerSelectionsAfterBulkAddIfRemote();
    }
    syncItemsMonogramExtraButtonsState();
  };

  const refreshItemsAfterPlanClear = async () => {
    if (shouldUseRemoteShoppingState()) {
      await runFavoriteEatsRemoteShoppingPlanRefresh({
        force: true,
        source: 'clear all items',
      });
      return;
    }
    hydrateShoppingSelectionsFromPlan();
    await refreshShoppingBrowsePlanRowsIndex();
    await runDeferredRecipeDerivedHydrate();
    refreshShoppingSelectionUi({ fullRerender: false });
  };

  const handleClearItemsFromPlan = async () => {
    const hasItemSelections =
      Object.keys(getShoppingPlanItemSelections()).length > 0;
    const hasRecipeSelections =
      Object.keys(getShoppingPlanRecipeSelections()).length > 0;
    if (!hasItemSelections && !hasRecipeSelections) {
      uiToast('No shopping selections to clear.');
      return;
    }
    const confirmed = await uiConfirm({
      title: 'Clear all items',
      message:
        'Are you sure you want to remove all items from your items list? This will completely clear both your items list and your shopping list.',
      confirmText: 'Clear all items',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    if (
      window.favoriteEatsPlanSession &&
      typeof window.favoriteEatsPlanSession.resolveDirtyBeforeClearAllItems ===
        'function'
    ) {
      const dirtyOk =
        await window.favoriteEatsPlanSession.resolveDirtyBeforeClearAllItems();
      if (!dirtyOk) return;
    }
    const previousPlan = cloneForUndo(getShoppingPlan(), () =>
      createEmptyShoppingPlan(),
    );
    const previousShoppingQuantities = new Map(shoppingQuantities);
    const previousShoppingRecipeQuantities = new Map(shoppingRecipeQuantities);
    const previousShoppingQuantityUnspecifiedKeys = new Set(
      shoppingQuantityUnspecifiedKeys,
    );
    const previousSelectedShoppingNames = new Set(selectedShoppingNames);
    const previousShoppingSelectionMeta = new Map(
      Array.from(shoppingSelectionMeta.entries(), ([key, value]) => [
        key,
        cloneForUndo(value, () => value),
      ]),
    );
    const restoreClearedSelections = () => {
      void (async () => {
        persistShoppingPlan(previousPlan);
        shoppingQuantities.clear();
        previousShoppingQuantities.forEach((qty, key) => {
          shoppingQuantities.set(key, qty);
        });
        shoppingRecipeQuantities.clear();
        previousShoppingRecipeQuantities.forEach((qty, key) => {
          shoppingRecipeQuantities.set(key, qty);
        });
        shoppingQuantityUnspecifiedKeys.clear();
        previousShoppingQuantityUnspecifiedKeys.forEach((key) => {
          shoppingQuantityUnspecifiedKeys.add(key);
        });
        selectedShoppingNames.clear();
        previousSelectedShoppingNames.forEach((name) => {
          selectedShoppingNames.add(name);
        });
        shoppingSelectionMeta.clear();
        previousShoppingSelectionMeta.forEach((meta, key) => {
          shoppingSelectionMeta.set(key, cloneForUndo(meta, () => meta));
        });
        if (
          shouldUseRemoteShoppingState() &&
          typeof flushCoalescedPlanSaveToDataService === 'function'
        ) {
          await flushCoalescedPlanSaveToDataService({ awaited: true });
        }
        collapseExpandedVariantRows();
        shoppingRowStepperController?.collapseAll?.();
        await refreshItemsAfterPlanClear();
        syncShoppingActionButtonState();
      })();
    };
    if (typeof abortPlanInputSyncQueuesForWholesaleClear === 'function') {
      await abortPlanInputSyncQueuesForWholesaleClear();
    }
    runWithShoppingPlanMutationBatch(() => {
      clearShoppingPlanSelections({
        clearItems: true,
        clearRecipes: true,
        allowEmptyPlanRemoteSave: true,
      });
    });
    if (
      shouldUseRemoteShoppingState() &&
      typeof flushCoalescedPlanSaveToDataService === 'function'
    ) {
      await flushCoalescedPlanSaveToDataService({ awaited: true });
    }
    clearShoppingPlannerUiState();
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    await refreshItemsAfterPlanClear();
    syncShoppingActionButtonState();
    uiToastUndo('All shopping selections cleared.', restoreClearedSelections);
  };

  let itemsMonogramManageBtn = null;
  let itemsMonogramCloseSessionBtn = null;
  let itemsMonogramClearBtn = null;
  let itemsMonogramAddByTagBtn = null;
  const syncItemsMonogramPlanSessionButtonState = () => {
    if (
      window.favoriteEatsPlanSession &&
      typeof window.favoriteEatsPlanSession.syncPlanSessionMonogramButtonState ===
        'function'
    ) {
      window.favoriteEatsPlanSession.syncPlanSessionMonogramButtonState(
        itemsMonogramManageBtn,
        itemsMonogramCloseSessionBtn,
      );
    }
  };
  const syncItemsMonogramClearButtonState = () => {
    if (!(itemsMonogramClearBtn instanceof HTMLButtonElement)) return;
    const disabled =
      Object.keys(getShoppingPlanItemSelections()).length === 0 &&
      Object.keys(getShoppingPlanRecipeSelections()).length === 0;
    itemsMonogramClearBtn.disabled = disabled;
    itemsMonogramClearBtn.setAttribute(
      'aria-disabled',
      disabled ? 'true' : 'false',
    );
  };
  const syncItemsMonogramExtraButtonsState = () => {
    syncItemsMonogramPlanSessionButtonState();
    syncItemsMonogramClearButtonState();
    if (itemsMonogramAddByTagBtn instanceof HTMLButtonElement) {
      const shouldDisableAddByTag =
        !isShoppingPlannerSelectMode() ||
        getAddByTagDialogFieldOptions().length === 0;
      itemsMonogramAddByTagBtn.disabled = shouldDisableAddByTag;
      itemsMonogramAddByTagBtn.setAttribute(
        'aria-disabled',
        shouldDisableAddByTag ? 'true' : 'false',
      );
    }
  };
  const ensureItemsMonogramAddByTagButton = () => {
    if (!(itemsMonogramAddByTagBtn instanceof HTMLButtonElement)) {
      itemsMonogramAddByTagBtn = document.createElement('button');
      itemsMonogramAddByTagBtn.type = 'button';
      itemsMonogramAddByTagBtn.id = 'appBarMonogramItemsAddByTagBtn';
      itemsMonogramAddByTagBtn.className = 'bottom-nav-pill';
      itemsMonogramAddByTagBtn.textContent = 'Add by tag';
      itemsMonogramAddByTagBtn.addEventListener('click', () => {
        if (itemsMonogramAddByTagBtn.disabled) return;
        void openAddByTagModal();
      });
    }
    return [itemsMonogramAddByTagBtn];
  };
  const ensureItemsMonogramActionButtons = () => {
    if (!isShoppingPlannerSelectMode()) return [];
    if (!(itemsMonogramManageBtn instanceof HTMLButtonElement)) {
      itemsMonogramManageBtn =
        window.favoriteEatsPlanSession?.createManageMonogramButton?.() || null;
    }
    if (!(itemsMonogramCloseSessionBtn instanceof HTMLButtonElement)) {
      itemsMonogramCloseSessionBtn =
        window.favoriteEatsPlanSession?.createCloseSessionMonogramButton?.() ||
        null;
    }
    if (!(itemsMonogramClearBtn instanceof HTMLButtonElement)) {
      itemsMonogramClearBtn = document.createElement('button');
      itemsMonogramClearBtn.type = 'button';
      itemsMonogramClearBtn.id = 'appBarMonogramItemsClearBtn';
      itemsMonogramClearBtn.className = 'bottom-nav-pill';
      itemsMonogramClearBtn.textContent = 'Clear all items';
      itemsMonogramClearBtn.addEventListener('click', () => {
        if (itemsMonogramClearBtn.disabled) return;
        void handleClearItemsFromPlan();
      });
    }
    const plannerButtons = ensureItemsMonogramAddByTagButton();
    syncItemsMonogramExtraButtonsState();
    const buttons = [];
    if (itemsMonogramManageBtn instanceof HTMLButtonElement) {
      buttons.push(itemsMonogramManageBtn);
    }
    if (itemsMonogramCloseSessionBtn instanceof HTMLButtonElement) {
      buttons.push(itemsMonogramCloseSessionBtn);
    }
    if (itemsMonogramClearBtn instanceof HTMLButtonElement) {
      buttons.push(itemsMonogramClearBtn);
    }
    return buttons.concat(plannerButtons);
  };
  const rebuildItemsMonogramMenu = () => {
    try {
      if (typeof window.favoriteEatsRebuildMonogramAccountMenu === 'function') {
        window.favoriteEatsRebuildMonogramAccountMenu();
      }
    } catch (_) {}
  };
  window.favoriteEatsMonogramMenuExtraButtons = ensureItemsMonogramActionButtons;
  window.favoriteEatsSyncMonogramMenuExtraButtons =
    syncItemsMonogramExtraButtonsState;
  rebuildItemsMonogramMenu();

  const isShoppingCompoundDropdownOpen = () =>
    !!filterChipRail?.trackEl?.querySelector(
      '.app-filter-chip-dropdown-wrap.is-open',
    );

  const rerenderShoppingFilterChips = () => {
    const chipMountEl = filterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    const reopenCompoundDropdown =
      !suppressLocationDropdownReopen && isShoppingCompoundDropdownOpen();
    const persistedOpenId =
      typeof window.readOpenFilterChipCompoundDropdownId === 'function'
        ? window.readOpenFilterChipCompoundDropdownId(chipMountEl)
        : '';
    const reopenCompoundDropdownId = reopenCompoundDropdown
      ? reopenShoppingCompoundDropdownId || persistedOpenId
      : '';
    suppressLocationDropdownReopen = false;
    reopenShoppingCompoundDropdownId = '';
    const chips = getActiveShoppingFilterChipDefs()
      .filter((chipDef) => chipDef?.kind !== 'location')
      .map((chipDef) => {
        const chipId = String(chipDef?.id || '').toLowerCase();
        const count = Number(shoppingChipCounts.get(chipId) || 0);
        return {
          id: chipId,
          label: chipDef?.label || chipId,
          disabled: count <= 0,
        };
      });
    const locationSelectedIds = shoppingLocationChipDefs
      .map((locationDef) =>
        String(locationDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((locationId) => locationId && activeFilterChips.has(locationId));
    const moreSelectedIds = shoppingMoreChipOptionDefs
      .map((optionDef) =>
        String(optionDef?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((optionId) => optionId && activeFilterChips.has(optionId));
    const tagSelectedIds = shoppingTagChipOptionDefs
      .map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      )
      .filter((tid) => tid && activeFilterChips.has(tid));
    const sortOrderCompoundChip = isShoppingPlannerSelectMode()
      ? [
          {
            id: 'shopping-sort-order',
            label: 'sort by',
            selectionMode: 'single',
            options: [
              { id: SHOPPING_ITEMS_SORT_MODE_AZ, label: 'A–Z' },
              { id: SHOPPING_ITEMS_SORT_MODE_LOCATION, label: 'location' },
            ],
            selectedOptionIds: new Set([
              shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION
                ? SHOPPING_ITEMS_SORT_MODE_LOCATION
                : SHOPPING_ITEMS_SORT_MODE_AZ,
            ]),
            onToggleOption: (optionId) => {
              const key = String(optionId || '')
                .trim()
                .toLowerCase();
              if (
                key !== SHOPPING_ITEMS_SORT_MODE_AZ &&
                key !== SHOPPING_ITEMS_SORT_MODE_LOCATION
              )
                return;
              if (key === shoppingItemsSortMode) return;
              shoppingItemsSortMode = key;
              persistShoppingItemsSortMode();
              reopenShoppingCompoundDropdownId = 'shopping-sort-order';
              rerenderShoppingFilterChips();
              applyShoppingFilters();
            },
          },
        ]
      : [];
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips,
      reopenCompoundDropdown,
      reopenCompoundDropdownId,
      leadingCompoundChips: sortOrderCompoundChip,
      compoundInsertIndex: isShoppingPlannerSelectMode()
        ? 1
        : getShoppingFilterChipMode() === 'editor'
          ? 3
          : 4,
      compoundChips: [
        {
          id: 'home-locations',
          label: 'location',
          options: shoppingLocationChipDefs.map((locationDef) => {
            const locationId = String(locationDef?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: locationId,
              label: String(locationDef?.label || locationId),
              disabled: isShoppingLocationOptionUnavailable(locationId),
            };
          }),
          selectedOptionIds: locationSelectedIds,
          onToggleOption: (locationId) => {
            const key = String(locationId || '').toLowerCase();
            if (!key) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingLocationOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'home-locations';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingLocationChipDefs.forEach((locationDef) => {
              const id = String(locationDef?.id || '')
                .trim()
                .toLowerCase();
              if (id) activeFilterChips.delete(id);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear location filters',
        },
        {
          id: 'shopping-item-tags',
          label: 'tags',
          disabled: shoppingTagChipOptionDefs.length === 0,
          options: shoppingTagChipOptionDefs.map((def) => {
            const optionId = String(def?.id || '')
              .trim()
              .toLowerCase();
            return {
              id: optionId,
              label: String(def?.label || optionId),
              disabled: isShoppingTagOptionUnavailable(optionId),
            };
          }),
          selectedOptionIds: tagSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key.startsWith(SHOPPING_TAG_FILTER_PREFIX)) return;
            if (
              !activeFilterChips.has(key) &&
              isShoppingTagOptionUnavailable(key)
            )
              return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-item-tags';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingTagChipOptionDefs.forEach((def) => {
              const tid = String(def?.id || '')
                .trim()
                .toLowerCase();
              if (tid) activeFilterChips.delete(tid);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear tag filters',
        },
        {
          id: 'shopping-more-filters',
          label: 'more',
          ...(isShoppingPlannerSelectMode()
            ? {
                pillActive:
                  moreSelectedIds.length > 0 ||
                  activeFilterChips.has('not food'),
                renderPanelHeader: renderShoppingMoreFoodPanelHeader,
              }
            : {}),
          options: shoppingMoreChipOptionDefs.map((optionDef) => {
            const optionId = String(optionDef?.id || '')
              .trim()
              .toLowerCase();
            const count = Number(shoppingChipCounts.get(optionId) || 0);
            return {
              id: optionId,
              label: String(optionDef?.label || optionId),
              disabled: count <= 0,
            };
          }),
          selectedOptionIds: moreSelectedIds,
          onToggleOption: (optionId) => {
            const key = String(optionId || '').toLowerCase();
            if (!key) return;
            const count = Number(shoppingChipCounts.get(key) || 0);
            if (count <= 0) return;
            if (activeFilterChips.has(key)) {
              activeFilterChips.delete(key);
            } else {
              activeFilterChips.add(key);
            }
            reopenShoppingCompoundDropdownId = 'shopping-more-filters';
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          onClearSelection: () => {
            suppressLocationDropdownReopen = true;
            reopenShoppingCompoundDropdownId = '';
            shoppingMoreChipOptionDefs.forEach((optionDef) => {
              const optionId = String(optionDef?.id || '')
                .trim()
                .toLowerCase();
              if (optionId) activeFilterChips.delete(optionId);
            });
            persistShoppingChipState();
            rerenderShoppingFilterChips();
            applyShoppingFilters();
          },
          clearAriaLabel: 'Clear more filters',
        },
      ],
      activeChipIds: activeFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        const count = Number(shoppingChipCounts.get(key) || 0);
        if (count <= 0) return;
        const isSelectedFamilyChip = key === 'selected';
        const isFoodFamilyChip = key === 'food' || key === 'not food';
        if (activeFilterChips.has(key)) {
          activeFilterChips.delete(key);
        } else {
          if (isSelectedFamilyChip) {
            activeFilterChips.delete('selected');
          }
          if (isFoodFamilyChip) {
            activeFilterChips.delete('food');
            activeFilterChips.delete('not food');
          }
          activeFilterChips.add(key);
        }
        persistShoppingChipState();
        rerenderShoppingFilterChips();
        applyShoppingFilters();
      },
      chipClassName: 'app-filter-chip',
    });
    filterChipRail?.sync?.();
  };
  const refreshShoppingFilterUi = () => {
    recomputeShoppingChipCounts();
    pruneInactiveShoppingChipState();
    if (!isShoppingCompoundDropdownOpen()) {
      rerenderShoppingFilterChips();
    } else {
      filterChipRail?.sync?.();
    }
  };
  const refreshShoppingSelectionUi = ({ fullRerender = true } = {}) => {
    if (!isShoppingPlannerSelectMode()) {
      clearShoppingPlannerUiState();
      refreshShoppingFilterUi();
      applyShoppingFilters();
      syncShoppingActionButtonState();
      return;
    }
    if (fullRerender) {
      void refreshShoppingBrowsePlanRowsIndex();
    }
    if (!fullRerender && isShoppingPlannerSelectMode()) {
      if (noVariantPlannerRowDomMismatch()) {
        refreshShoppingSelectionUi({ fullRerender: true });
        return;
      }
      recomputeShoppingChipCounts();
      // Counts can change after async recipe-derived hydrate; rerender chip disabled state.
      rerenderShoppingFilterChips();
      filterChipRail?.sync?.();
      syncAllVisibleShoppingRowStates();
      list.querySelectorAll('li.shopping-variant-child').forEach((row) => {
        const varKey = String(row.dataset.variantQtyKey || '');
        if (varKey) syncVariantChildVisuals(row, varKey);
      });
      syncVariantParentByKey.forEach((syncFn) => {
        try {
          syncFn();
        } catch (_) {}
      });
      syncShoppingActionButtonState();
      return;
    }
    refreshShoppingFilterUi();
    applyShoppingFilters();
    syncAllVisibleShoppingRowStates();
  };
  const openBrowsePlannerStepper = (planKey) => {
    const normalized = String(planKey || '').trim();
    if (!normalized || !planKeyHasBrowsePlannerSelection(normalized)) return false;
    bumpShoppingBrowsePlannerEdit();
    shoppingRowStepperController.activate(normalized);
    return true;
  };
  const toggleBrowsePlannerStepper = (planKey, onAfter) => {
    const normalized = String(planKey || '').trim();
    if (!normalized) return false;
    if (shoppingRowStepperController.isActive(normalized)) {
      bumpShoppingBrowsePlannerEdit();
      shoppingRowStepperController.collapseActive();
    } else if (!openBrowsePlannerStepper(normalized)) {
      return false;
    }
    if (typeof onAfter === 'function') onAfter();
    return true;
  };
  const focusShoppingPlannerRow = (key) => {
    toggleBrowsePlannerStepper(key, () =>
      refreshShoppingSelectionUi({ fullRerender: false }),
    );
  };
  const focusChildVariantStepper = (varKey) => {
    toggleBrowsePlannerStepper(varKey, () => {
      syncAllVisibleVariantChildSteppers();
      syncAllVisibleShoppingRowStates();
    });
  };

  window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap = (remaps) => {
    if (!Array.isArray(remaps) || remaps.length === 0) return;
    remaps.forEach(({ oldKey, newKey, itemName, variantName }) => {
      const okOld = String(oldKey || '').trim();
      const okNew = String(newKey || '').trim();
      if (!okOld || !okNew) return;
      if (okOld === okNew) {
        const cur = shoppingSelectionMeta.get(okNew) || {};
        shoppingSelectionMeta.set(okNew, {
          itemName: String(
            itemName != null ? itemName : cur.itemName || '',
          ).trim(),
          variantName: String(
            variantName != null ? variantName : cur.variantName || '',
          ).trim(),
          ...(cur.ingredientVariantId
            ? { ingredientVariantId: cur.ingredientVariantId }
            : {}),
        });
        return;
      }
      if (shoppingQuantities.has(okOld)) {
        const dq = Number(shoppingQuantities.get(okOld) || 0);
        const prevNew = Number(shoppingQuantities.get(okNew) || 0);
        shoppingQuantities.delete(okOld);
        const combined = Number((prevNew + dq).toFixed(4));
        if (Math.abs(combined) > SHOPPING_QTY_EPSILON) {
          shoppingQuantities.set(okNew, combined);
        }
      }
      const metaOld = shoppingSelectionMeta.get(okOld);
      shoppingSelectionMeta.delete(okOld);
      const existingNew = shoppingSelectionMeta.get(okNew) || {};
      const mergedIv =
        metaOld?.ingredientVariantId ?? existingNew?.ingredientVariantId;
      shoppingSelectionMeta.set(okNew, {
        itemName: String(
          itemName != null
            ? itemName
            : metaOld?.itemName || existingNew.itemName || '',
        ).trim(),
        variantName: String(
          variantName != null
            ? variantName
            : metaOld?.variantName || existingNew.variantName || '',
        ).trim(),
        ...(mergedIv ? { ingredientVariantId: mergedIv } : {}),
      });
      if (selectedShoppingNames.has(okOld)) {
        selectedShoppingNames.delete(okOld);
        selectedShoppingNames.add(okNew);
      }
    });
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  window.__favoriteEatsPruneShoppingBrowseSelectionKeys = (keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    keys.forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      shoppingQuantities.delete(key);
      shoppingSelectionMeta.delete(key);
      selectedShoppingNames.delete(key);
      if (shoppingRowStepperController.isActive(key)) {
        shoppingRowStepperController.collapseActive();
      }
    });
    collapseExpandedVariantRows();
    shoppingRowStepperController?.collapseAll?.();
    refreshShoppingSelectionUi();
    syncShoppingActionButtonState();
  };

  const mountShoppingFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    filterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'shoppingFilterChipDock',
    });

    refreshShoppingFilterUi();
    filterChipRail?.sync?.();
  };

  const getFilteredShoppingRows = () => {
    const rowMatchesFilters = buildShoppingRowFilterMatcher({
      chipIds: activeFilterChips,
    });
    const filtered = shoppingRows.filter((item) => rowMatchesFilters(item));
    filtered.sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, {
        sensitivity: 'base',
      }),
    );
    return filtered;
  };

  const applyShoppingFilters = () => {
    renderShoppingList(getFilteredShoppingRows());
  };

  async function getRecipesUsingShoppingNameViaDataService(name) {
    const n = (name || '').trim();
    if (!n) return [];
    if (
      window.dataService &&
      typeof window.dataService.listShoppingItemRecipeUsage === 'function'
    ) {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listShoppingItemRecipeUsage(n);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('dataService.listShoppingItemRecipeUsage failed:', err);
        if (favoriteEatsDataServiceIsSupabaseActive()) return [];
      }
    }
    return [];
  }

  async function removeShoppingName(name) {
    const n = (name || '').trim();
    if (!n) return false;

    const recipes = await getRecipesUsingShoppingNameViaDataService(n);
    const usedCount = recipes.length;

    if (getUnitSizeRemovalAction(usedCount) === 'remove') {
      const usageLine =
        usedCount === 1
          ? 'This item is used in this recipe:'
          : 'This item is used in these recipes:';
      const details = document.createElement('div');
      details.className = 'shopping-remove-dialog-details';

      const linksWrap = document.createElement('div');
      linksWrap.className = 'shopping-remove-dialog-links';
      recipes.forEach((recipe) => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'shopping-remove-dialog-link';
        a.textContent = recipe.title || `Recipe ${recipe.id}`;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.openRecipe === 'function') {
            window.openRecipe(recipe.id, recipe.title);
          }
        });
        linksWrap.appendChild(a);
      });
      if (recipes.length) details.appendChild(linksWrap);

      const note = document.createElement('div');
      note.className = 'shopping-remove-dialog-note';
      note.textContent = `Removing it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine}`,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove item',
          message: `Remove '${n}'? ${usageLine} Removing it will hide it from the Shopping Items list but will not delete it. To delete '${n}' permenantly, first remove it from the recipes that use it.`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;

      try {
        await window.dataService.deleteShoppingItem({
          name: n,
          action: 'remove',
        });
      } catch (err) {
        console.error('❌ Failed to deprecate shopping item:', err);
        uiToast('Failed to remove item. See console for details.');
        return false;
      }
    } else {
      const ok = await uiConfirm({
        title: 'Delete Shopping Item',
        message: `Delete '${n}' permanently? It isn't used in any recipes. This will permanently delete it from the database.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;

      try {
        await window.dataService.deleteShoppingItem({
          name: n,
          action: 'delete',
        });
      } catch (err) {
        console.error('❌ Failed to delete shopping item:', err);
        uiToast('Failed to delete item. See console for details.');
        return false;
      }
    }

    // Persist DB after remove/hide.
    try {
      await persistDbForCurrentRuntime(db, {
        failureMessage: 'Failed to save database after removing shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after removing shopping item:',
        err,
      );
      uiToast('Failed to save database after removing shopping item.');
      return false;
    }

    return true;
  }

  // --- Shopping item label helpers (tests extract this block) ---
  function getShoppingItemDisplayName(item) {
    const fallbackName = String(item?.name || '').trim();
    if (!fallbackName) return '';
    if (typeof window?.getShoppingCatalogItemDisplayName === 'function') {
      return (
        String(window.getShoppingCatalogItemDisplayName(item) || '').trim() ||
        fallbackName
      );
    }
    if (typeof window?.getIngredientNounDisplay !== 'function')
      return fallbackName;

    const displayName = window.getIngredientNounDisplay({
      name: fallbackName,
      lemma: String(item?.lemma || '').trim(),
      singularIfUnspecified: !!item?.singularIfUnspecified,
      isMassNoun: !!item?.isMassNoun,
      pluralOverride: String(item?.pluralOverride || '').trim(),
      usePluralOverride: !!item?.usePluralOverride,
    });

    return String(displayName || '').trim() || fallbackName;
  }

  if (typeof window !== 'undefined') {
    window.__shoppingItemLabelHelpers = {
      getShoppingItemDisplayName,
    };
  }
  // --- End shopping item label helpers ---

  function renderShoppingList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    syncVariantParentByKey.clear();
    fitVariantParentHeadlineByKey.clear();
    if (!items.length) {
      renderTopLevelEmptyState(list, 'shoppingItems');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    const buildVariantParentDisplayParts = (variants, variantQtyMap) => {
      const vs = Array.isArray(variants)
        ? variants.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (vs.length === 0) return [];

      const anySelected =
        isShoppingPlannerSelectMode() &&
        variantQtyMap &&
        Array.from(variantQtyMap.values()).some((q) => q > 0);

      if (!anySelected) return vs.slice();

      const parts = [];
      const defaultQty = (variantQtyMap && variantQtyMap.get('default')) || 0;
      if (defaultQty > 0) parts.push('any');
      const counted = [];
      const uncounted = [];
      vs.forEach((v) => {
        const q = (variantQtyMap && variantQtyMap.get(v)) || 0;
        if (q > 0) counted.push(v);
        else uncounted.push(v);
      });
      return parts.concat(counted, uncounted);
    };

    const splitVariantParentFullLine = (fullLine, baseLabel) => {
      const base = String(baseLabel || '').trim();
      const line = String(fullLine || '').trim();
      if (!line || line === base) return { label: base, detail: '' };
      const prefix = `${base} (`;
      if (line.startsWith(prefix) && line.endsWith(')')) {
        return {
          label: base,
          detail: String(line.slice(prefix.length, -1)).trim(),
        };
      }
      return { label: base, detail: '' };
    };

    const applyVariantParentFoldedHeadline = (
      fullLine,
      baseLabel,
      nameLinkEl,
      detailOpenEl,
      detailNamesEl,
      detailMoreSuffixEl,
      detailCloseEl,
      headlineEl,
    ) => {
      const { label, detail } = splitVariantParentFullLine(fullLine, baseLabel);
      const hasDetail = !!detail;
      const { names, moreSuffix } = parseVariantParentDetailText(detail);

      nameLinkEl.textContent = label;
      detailOpenEl.style.display = hasDetail ? '' : 'none';
      detailNamesEl.style.display = hasDetail ? '' : 'none';
      detailCloseEl.style.display = hasDetail ? '' : 'none';

      if (hasDetail) {
        detailNamesEl.textContent = names;
        detailNamesEl.classList.add('list-row-detail--js-fitted');
        if (moreSuffix) {
          detailMoreSuffixEl.textContent = moreSuffix;
          detailMoreSuffixEl.style.display = '';
        } else {
          detailMoreSuffixEl.textContent = '';
          detailMoreSuffixEl.style.display = 'none';
        }
        detailCloseEl.textContent = ')';
        if (detailNamesEl instanceof HTMLButtonElement) {
          detailNamesEl.setAttribute('aria-label', `Variant summary: ${detail}`);
        }
      } else {
        detailNamesEl.textContent = '';
        detailNamesEl.classList.remove('list-row-detail--js-fitted');
        detailMoreSuffixEl.textContent = '';
        detailMoreSuffixEl.style.display = 'none';
        if (detailNamesEl instanceof HTMLButtonElement) {
          detailNamesEl.removeAttribute('aria-label');
        }
      }

      headlineEl.classList.toggle('list-row-headline--split', hasDetail);
    };

    const fitExpandedVariantParentName = (li, baseName, nameLinkEl) => {
      const label = String(baseName || '').trim();
      if (!(nameLinkEl instanceof HTMLElement)) return;
      const maxPx = listRowStepper.getPlannerRowPrimaryLabelBudgetPx(li);
      const measure = makeListRowTextMeasurer(nameLinkEl);
      const fitted =
        measure && maxPx > 0
          ? listRowStepper.truncatePlannerRowTextToFitPx(label, maxPx, measure)
          : label;
      nameLinkEl.textContent = fitted;
      if (fitted !== label) {
        nameLinkEl.setAttribute('title', label);
      } else {
        nameLinkEl.removeAttribute('title');
      }
    };

    const makeStepperDOM = () => {
      return listRowStepper.createStepperDOM();
    };

    syncVariantChildVisuals = (childLi, varKey) => {
      const plainStepQty = getBrowsePlannerPlainStepQty(varKey);
      const hasAmountTail = browsePlannerRowHasAmountTail(varKey);
      listRowStepper.syncRowVisuals(
        childLi,
        buildBrowsePlannerRowStepperOptions(
          plainStepQty,
          hasAmountTail,
          shoppingRowStepperController.isActive(varKey),
          browsePlannerDecreaseClearsSelection(varKey),
        ),
      );
      syncBrowsePlannerRowAmountButton(childLi, varKey);
    };

    let currentLocationSortBucketId = '';
    const getShoppingBrowseFilterOptions = () => ({
      searchQuery: searchInput?.value || '',
      locationIds: getActiveShoppingLocationFilterIds(),
      locationBucketId: currentLocationSortBucketId,
    });

    const getShoppingBrowseDisplayName = (item) =>
      formatShoppingBrowseItemLabel(getShoppingItemDisplayName(item), item, {
        ...getShoppingBrowseFilterOptions(),
      });

    const getVisiblePlannerVariantNamesForItem = (item) => {
      const visibility = getShoppingBrowsePlannerVariantNames(
        item,
        getShoppingBrowseFilterOptions(),
      );
      const names = [];
      if (visibility.includeDefault) names.push('default');
      visibility.variantNames.forEach((variantName) => names.push(variantName));
      return {
        visibility,
        allVariantNames: names,
        namedVariants: visibility.variantNames,
      };
    };

    const appendShoppingCatalogRowForItem = (item, li, displayName) => {
      const baseDisplayName = String(displayName || '').trim();
      const namedVariants = Array.isArray(item?.variants)
        ? item.variants.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      const hasVariants = namedVariants.length > 0;

      let primaryEl = null;
      let detailEl = null;

      if (hasVariants) {
        const splitRow = createItemsBrowseSplitRowHeadline(
          'shopping-list-row-label',
        );
        primaryEl = splitRow.primary;
        detailEl = splitRow.detail;
        if (
          item.variantDeprecatedSet instanceof Set &&
          item.variantDeprecatedSet.size > 0
        ) {
          primaryEl.classList.add('shopping-list-row-label--variant-deprecated');
        }
        li.appendChild(splitRow.wrap);
        const initialLine = `${baseDisplayName} (${namedVariants.join(', ')})`;
        applySplitListRowLabelPair(
          primaryEl,
          detailEl,
          initialLine,
          baseDisplayName,
        );
      } else {
        const label = document.createElement('span');
        label.className = 'shopping-list-row-label';
        label.textContent = baseDisplayName;
        li.appendChild(label);
      }

      li.addEventListener('click', (event) => {
        const wantsRemove = event.ctrlKey || event.metaKey;
        if (wantsRemove) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
          return;
        }
        sessionStorage.setItem('selectedShoppingItemId', String(item.id));
        sessionStorage.setItem('selectedShoppingItemName', item.name || '');
        sessionStorage.removeItem('selectedShoppingItemIsNew');
        rememberShoppingScrollForReload();
        window.location.href = getShoppingEditorHref();
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void (async () => {
          const ok = await removeShoppingName(item.name || '');
          if (!ok) return;
          rememberShoppingScrollForReload();
          window.location.reload();
        })();
      });

      window.favoriteEatsBindLongPressRemove?.(li, () => {
        void (async () => {
          const ok = await removeShoppingName(item.name || '');
          if (!ok) return;
          rememberShoppingScrollForReload();
          window.location.reload();
        })();
      });

      if (hasVariants) {
        li.title = `${baseDisplayName}\n\nAll variants: ${namedVariants.join(', ')}`;
        list.appendChild(li);
        requestAnimationFrame(() => {
          try {
            const measurePrimary = makeListRowTextMeasurer(primaryEl);
            const measureDetail = makeListRowTextMeasurer(detailEl);
            const maxPx = Math.max(0, li.clientWidth);
            const measureFullLine = (inside) =>
              measurePrimary(baseDisplayName) +
              measureDetail(formatListRowDetailParenthetical(inside));
            const fit = fitVariantParentFoldedLine({
              baseName: baseDisplayName,
              parts: namedVariants,
              maxPx,
              measureFullLine,
            });
            if (fit.ready) {
              applySplitListRowLabelPair(
                primaryEl,
                detailEl,
                fit.fullLine,
                baseDisplayName,
              );
            }
          } catch (_) {}
        });
        return;
      }
      list.appendChild(li);
    };

    const appendShoppingBrowseRowsForItem = (item) => {
      const li = document.createElement('li');
      const baseName = String(item?.name || '').trim();
      const baseDisplayName = getShoppingItemDisplayName(item);
      const displayName = getShoppingBrowseDisplayName(item);
      const hasVariantDisplayHint = displayName !== baseDisplayName;
      const hasVariants =
        Array.isArray(item.variants) && item.variants.length > 0;
      const plannerSelectMode = isShoppingPlannerSelectMode();
      const visiblePlannerVariants = hasVariants
        ? getVisiblePlannerVariantNamesForItem(item)
        : null;
      if (
        plannerSelectMode &&
        hasVariants &&
        visiblePlannerVariants &&
        visiblePlannerVariants.allVariantNames.length === 0
      ) {
        return;
      }
      const needsExpandableRow =
        plannerSelectMode && itemNeedsPlannerExpandableRow(item);
      if (Number.isFinite(Number(item?.id)) && Number(item.id) > 0) {
        li.dataset.shoppingItemId = String(Math.trunc(Number(item.id)));
      }

      if (!plannerSelectMode) {
        appendShoppingCatalogRowForItem(item, li, baseDisplayName);
        return;
      }

      // ── Expandable planner row (variants, or selected no-variant items) ──
      if (needsExpandableRow) {
        const { allVariantNames, namedVariants, visibility } = hasVariants
          ? visiblePlannerVariants
          : {
              visibility: { includeDefault: true, variantNames: [] },
              allVariantNames: ['default'],
              namedVariants: [],
            };
        const variantQtyOptions = {
          includeDefault: visibility.includeDefault,
        };
        li.classList.add(
          'shopping-variant-parent',
          'shopping-list-group-item',
          'shopping-list-doc-item',
        );
        const itemKey = getShoppingSelectionKey(baseName);
        li.dataset.variantParentKey = itemKey;
        const isExpanded = expandedVariantItems.has(itemKey);
        li.dataset.expanded = isExpanded ? 'true' : 'false';

        const textWrap = document.createElement('div');
        textWrap.className = 'shopping-list-doc-text-wrap';

        const headline = document.createElement('div');
        headline.className =
          'shopping-list-doc-headline list-row-headline--split';

        const labelGroup = document.createElement('span');
        labelGroup.className =
          'list-row-label-group list-row-label-group--fit-pending';

        const nameLink = document.createElement('a');
        nameLink.href = getShoppingEditorHref();
        nameLink.className = 'shopping-list-doc-link list-row-primary';
        if (
          item.variantDeprecatedSet instanceof Set &&
          item.variantDeprecatedSet.size > 0
        ) {
          nameLink.classList.add('shopping-list-doc-link--variant-deprecated');
        }
        nameLink.textContent = baseDisplayName;

        const tail = document.createElement('span');
        tail.className = 'shopping-list-doc-tail';
        tail.appendChild(document.createTextNode('\u00a0'));

        const amountBtn = document.createElement('button');
        amountBtn.type = 'button';
        amountBtn.className =
          'shopping-list-doc-text shopping-list-doc-text--amount list-row-detail';
        amountBtn.setAttribute('aria-label', 'Variant summary');
        amountBtn.textContent = '';

        const detailOpen = document.createElement('span');
        detailOpen.className =
          'shopping-list-doc-detail-open shopping-list-doc-detail-paren';
        detailOpen.setAttribute('aria-hidden', 'true');
        detailOpen.textContent = '(';

        const detailMoreSuffix = document.createElement('span');
        detailMoreSuffix.className =
          'shopping-list-doc-detail-more-suffix list-row-detail-more-suffix';
        detailMoreSuffix.setAttribute('aria-hidden', 'true');
        detailMoreSuffix.style.display = 'none';

        const detailClose = document.createElement('span');
        detailClose.className =
          'shopping-list-doc-detail-close shopping-list-doc-detail-paren';
        detailClose.setAttribute('aria-hidden', 'true');
        detailClose.textContent = ')';

        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className =
          'shopping-list-doc-expand shopping-list-section-toggle';
        expandBtn.setAttribute(
          'aria-label',
          isExpanded ? 'Collapse variant details' : 'Expand variant details',
        );
        expandBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        const expandIcon = document.createElement('span');
        expandIcon.className =
          'material-symbols-outlined shopping-list-section-toggle__icon';
        expandIcon.setAttribute('aria-hidden', 'true');
        expandIcon.textContent = 'expand_more';
        expandBtn.appendChild(expandIcon);

        tail.appendChild(detailOpen);
        tail.appendChild(amountBtn);
        tail.appendChild(detailMoreSuffix);
        tail.appendChild(detailClose);
        tail.appendChild(document.createTextNode('\u00a0'));
        tail.appendChild(expandBtn);

        labelGroup.appendChild(nameLink);
        labelGroup.appendChild(tail);
        headline.appendChild(labelGroup);
        textWrap.appendChild(headline);

        const badge = document.createElement('span');
        badge.className = 'shopping-list-row-badge';
        badge.style.display = 'none';

        const trailingReserve = document.createElement('span');
        trailingReserve.className =
          'material-symbols-outlined shopping-list-row-icon shopping-list-row-trailing-reserve';
        trailingReserve.setAttribute('aria-hidden', 'true');
        trailingReserve.textContent = 'add_box';
        trailingReserve.style.display = 'none';

        const childRows = [];

        li.appendChild(textWrap);
        li.appendChild(trailingReserve);
        li.appendChild(badge);

        const applyFoldedHeadlineFromFullLine = (fullLine) => {
          applyVariantParentFoldedHeadline(
            fullLine,
            baseDisplayName,
            nameLink,
            detailOpen,
            amountBtn,
            detailMoreSuffix,
            detailClose,
            headline,
          );
        };

        let fitParentHeadlineDeferred = false;
        const fitParentHeadline = () => {
          const expanded = li.dataset.expanded === 'true';
          try {
            if (expanded) {
              labelGroup.classList.remove('list-row-label-group--fit-pending');
              labelGroup.classList.add('list-row-label-group--fit-ready');
              fitExpandedVariantParentName(li, baseDisplayName, nameLink);
              return;
            }
            if (hasVariantDisplayHint) {
              applyFoldedHeadlineFromFullLine(displayName);
              labelGroup.classList.remove('list-row-label-group--fit-pending');
              labelGroup.classList.add('list-row-label-group--fit-ready');
              return;
            }

            const maxPx = listRowStepper.getPlannerRowLabelGroupBudgetPx(li);
            const measureBase = makeListRowTextMeasurer(nameLink);
            const measureDetail = makeListRowTextMeasurer(amountBtn);
            const nbspPx = measureDetail('\u00a0');
            const chevronBtnPx =
              expandBtn.getBoundingClientRect().width ||
              expandBtn.offsetWidth ||
              0;
            const measureFullLine = (inside) => {
              const detail = String(inside || '');
              return (
                measureBase(baseDisplayName) +
                nbspPx +
                measureDetail('(' + detail + ')') +
                nbspPx +
                chevronBtnPx
              );
            };

            const qtyMap = getVariantQtyMap(
              baseName,
              namedVariants,
              item,
              variantQtyOptions,
            );
            const parts = buildVariantParentDisplayParts(
              namedVariants,
              qtyMap,
            );
            const fit = fitVariantParentFoldedLine({
              baseName: baseDisplayName,
              parts,
              maxPx,
              measureFullLine,
            });

            if (!fit.ready) {
              if (!fitParentHeadlineDeferred) {
                fitParentHeadlineDeferred = true;
                requestAnimationFrame(() => {
                  fitParentHeadlineDeferred = false;
                  fitParentHeadline();
                });
              }
              return;
            }

            applyFoldedHeadlineFromFullLine(fit.fullLine);
            labelGroup.classList.remove('list-row-label-group--fit-pending');
            labelGroup.classList.add('list-row-label-group--fit-ready');
          } catch (_) {
            labelGroup.classList.remove('list-row-label-group--fit-pending');
          }
        };

        // Parent visuals: expand control; badge with total when collapsed with count > 0;
        // no badge while expanded. Defined before child row creation so incrementVariant can reference it.
        const syncParentVisuals = () => {
          const directTotal = getItemDirectTotalQty(
            baseName,
            namedVariants,
            item,
            variantQtyOptions,
          );
          const totalQty = getItemTotalQty(
            baseName,
            namedVariants,
            item,
            variantQtyOptions,
          );
          const groupHasTail = itemBrowseGroupHasRecipeTail(
            baseName,
            namedVariants,
            item,
            variantQtyOptions,
          );
          const expanded = li.dataset.expanded === 'true';
          const hasQty =
            totalQty > 0 || (groupHasTail && isShoppingPlannerSelectMode());
          const badgeLabel = getShoppingBrowsePlannerBadgeContent(directTotal, {
            hasAmountTail: groupHasTail,
          });

          expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          expandBtn.setAttribute(
            'aria-label',
            expanded ? 'Collapse variant details' : 'Expand variant details',
          );

          listRowStepper.syncVariantParentRowVisuals(li, {
            expanded,
            hasQty,
            checked: hasQty,
            badgeContent: !expanded && badgeLabel ? badgeLabel : null,
          });

          if (expanded) {
            headline.classList.remove('list-row-headline--split');
            detailOpen.style.display = 'none';
            amountBtn.textContent = '';
            amountBtn.style.display = 'none';
            amountBtn.classList.remove('list-row-detail--js-fitted');
            detailMoreSuffix.style.display = 'none';
            detailClose.style.display = 'none';
          } else {
            amountBtn.style.display = '';
          }

          fitParentHeadline();
        };
        syncVariantParentByKey.set(itemKey, syncParentVisuals);
        fitVariantParentHeadlineByKey.set(itemKey, fitParentHeadline);

        const clearVariantChildStepperExpansion = () => {
          const activeNow = shoppingRowStepperController.getActiveKey?.() || '';
          const childKeys = allVariantNames.map((variantName) =>
            getBrowseVariantPlanKey(baseName, variantName, item),
          );
          if (activeNow && childKeys.includes(activeNow)) {
            shoppingRowStepperController.collapseActive();
          }
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
        };
        const toggleExpansion = () => {
          if (shoppingRowStepperController.collapseActive()) {
            syncAllVisibleShoppingRowStates();
          }
          const wasExpanded = expandedVariantItems.has(itemKey);
          if (wasExpanded) {
            expandedVariantItems.delete(itemKey);
            li.dataset.expanded = 'false';
            clearVariantChildStepperExpansion();
            childRows.forEach((r) => (r.style.display = 'none'));
          } else {
            collapseExpandedVariantRows();
            expandedVariantItems.add(itemKey);
            li.dataset.expanded = 'true';
            childRows.forEach((r) => (r.style.display = ''));
          }
          syncParentVisuals();
        };

        allVariantNames.forEach((variantName) => {
          const childLi = document.createElement('li');
          childLi.classList.add('shopping-variant-child');
          childLi.style.display = isExpanded ? '' : 'none';

          const variantLabelText =
            variantName === 'default' ? 'any' : variantName;
          const vdk = String(variantName || '')
            .trim()
            .toLowerCase();
          const { textWrap: childTextWrap } = createShoppingBrowsePlannerDocHeadline({
              labelText: variantLabelText,
              labelDeprecated:
                item.variantDeprecatedSet instanceof Set &&
                vdk &&
                item.variantDeprecatedSet.has(vdk),
              amountAriaLabel: 'Variant recipe amount',
            });

          const childIcon = document.createElement('span');
          childIcon.className =
            'material-symbols-outlined shopping-list-row-icon';
          childIcon.textContent = 'add_box';
          childIcon.setAttribute('aria-hidden', 'true');

          const {
            stepper: childStepper,
            minusBtn,
            plusBtn,
            qtySpan,
          } = makeStepperDOM();

          const childBadge = document.createElement('span');
          childBadge.className = 'shopping-list-row-badge';
          childBadge.style.display = 'none';

          childLi.appendChild(childTextWrap);
          childLi.appendChild(childIcon);
          childLi.appendChild(childStepper);
          childLi.appendChild(childBadge);

          const varKey = getBrowseVariantPlanKey(baseName, variantName, item);
          childLi.dataset.variantQtyKey = varKey;
          syncVariantChildVisuals(childLi, varKey);

          const incrementVariant = (delta) => {
            bumpShoppingBrowsePlannerEdit();
            enqueueShoppingPlannerDirectQty(
              varKey,
              getNextBrowsePlannerDirectQty(varKey, delta),
              {
                itemName: baseName,
                variantName: variantName === 'default' ? 'default' : variantName,
                ingredientVariantId: resolveBrowseIngredientVariantId(
                  item,
                  variantName,
                ),
              },
            );
            syncBrowsePlannerStepperAfterQtyChange(varKey);
            refreshShoppingSelectionUi({ fullRerender: false });
          };
          attachShoppingQtyManualEdit({
            qtyEl: qtySpan,
            getQty: () => getBrowsePlannerPlainStepQty(varKey),
            commitQty: (nextPlain) =>
              enqueueShoppingPlannerDirectQty(
                varKey,
                getBrowsePlannerDirectQtyForPlainStep(varKey, nextPlain),
                {
                  itemName: baseName,
                  variantName,
                  ingredientVariantId: resolveBrowseIngredientVariantId(
                    item,
                    variantName,
                  ),
                },
              ),
            onAfterCommit: () =>
              refreshShoppingSelectionUi({ fullRerender: false }),
          });

          childBadge.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isShoppingPlannerSelectMode()) return;
            focusChildVariantStepper(varKey);
          });

          childIcon.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            incrementVariant(1);
          });
          minusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (
              isShoppingPlannerSelectMode() &&
              !hasPositiveShoppingQty(getBrowsePlannerPlainStepQty(varKey))
            ) {
              if (shoppingRowStepperController.isActive(varKey)) {
                shoppingRowStepperController.collapseActive();
              }
              syncVariantChildVisuals(childLi, varKey);
              syncParentVisuals();
              return;
            }
            incrementVariant(-1);
          });
          plusBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            incrementVariant(1);
          });

          const removeLabel = formatShoppingBrowsePlannerRemoveLabel(
            displayName,
            variantName,
          );
          const promptRemoveVariantFromPlanningList = () => {
            runMenuPlanItemRemove(
              varKey,
              removeLabel,
              {
                itemName: baseName,
                variantName:
                  variantName === 'default' ? 'default' : variantName,
                ingredientVariantId: resolveBrowseIngredientVariantId(
                  item,
                  variantName,
                ),
              },
              () => {
                if (shoppingRowStepperController.isActive(varKey)) {
                  shoppingRowStepperController.collapseActive();
                }
                refreshShoppingSelectionUi({ fullRerender: false });
                syncVariantChildVisuals(childLi, varKey);
                syncParentVisuals();
              },
            );
          };

          childLi.addEventListener(
            'click',
            (event) => {
              if (!isShoppingPlannerSelectMode()) return;
              if (!isControlClickRemoveGesture(event)) return;
              event.preventDefault();
              event.stopPropagation();
              promptRemoveVariantFromPlanningList();
            },
            true,
          );

          childLi.addEventListener('click', (event) => {
            if (!isShoppingPlannerSelectMode()) return;
            if (isControlClickRemoveGesture(event)) return;
            event.preventDefault();
            event.stopPropagation();
            focusChildVariantStepper(varKey);
            syncParentVisuals();
          });

          childLi.addEventListener('contextmenu', (event) => {
            if (!isShoppingPlannerSelectMode()) return;
            if (isControlPrimaryContextMenuGesture(event)) {
              event.preventDefault();
              event.stopPropagation();
              promptRemoveVariantFromPlanningList();
            }
          });

          window.favoriteEatsBindLongPressRemove?.(childLi, () => {
            if (!isShoppingPlannerSelectMode()) return;
            promptRemoveVariantFromPlanningList();
          }, {
            shouldIgnore: (event) => {
              const target = event.target;
              if (!(target instanceof Element)) return true;
              return !!target.closest(
                '.shopping-list-row-stepper, .shopping-list-row-badge, .shopping-list-row-icon, .shopping-list-doc-amount-skin, button',
              );
            },
          });

          childRows.push(childLi);
        });

        const parentRemoveOnPrimaryGesture = plannerParentHandlesRemoveDirectly(
          allVariantNames,
          namedVariants,
        );
        const syncParentRowAfterMenuPlanRemove = () => {
          if (shoppingRowStepperController.collapseActive()) {
            shoppingRowStepperController.collapseActive();
          }
          refreshShoppingSelectionUi({ fullRerender: false });
          syncParentVisuals();
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
        };
        const handlePlannerParentPrimaryRemoveGesture = () => {
          if (parentRemoveOnPrimaryGesture) {
            runMenuPlanParentItemRemove(
              baseName,
              allVariantNames,
              item,
              displayName,
              syncParentRowAfterMenuPlanRemove,
            );
            return;
          }
          toggleExpansion();
        };

        const clearAllVariantQuantities = () => {
          allVariantNames.forEach((variantName) => {
            const vk = getBrowseVariantPlanKey(baseName, variantName, item);
            enqueueShoppingPlannerDirectQty(vk, 0, {
              itemName: baseName,
              variantName: variantName === 'default' ? 'default' : variantName,
              ingredientVariantId: resolveBrowseIngredientVariantId(
                item,
                variantName,
              ),
            });
          });
          if (shoppingRowStepperController.collapseActive()) {
            syncAllVisibleVariantChildSteppers();
          }
          childRows.forEach((row) => {
            const varKey = String(row.dataset.variantQtyKey || '');
            if (varKey) syncVariantChildVisuals(row, varKey);
          });
          refreshShoppingSelectionUi({ fullRerender: false });
        };

        expandBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleExpansion();
        });

        amountBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

        nameLink.addEventListener('click', (event) => {
          if (isShoppingPlannerSelectMode()) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          sessionStorage.setItem('selectedShoppingItemId', String(item.id));
          sessionStorage.setItem('selectedShoppingItemName', item.name || '');
          sessionStorage.removeItem('selectedShoppingItemIsNew');
          rememberShoppingScrollForReload();
          window.location.href = getShoppingEditorHref();
        });

        li.addEventListener('click', (event) => {
          const plannerSelectMode = isShoppingPlannerSelectMode();
          if (plannerSelectMode && isControlClickRemoveGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            handlePlannerParentPrimaryRemoveGesture();
            return;
          }
          const wantsRemove = event.ctrlKey || event.metaKey;
          if (wantsRemove && !plannerSelectMode) {
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const ok = await removeShoppingName(item.name || '');
              if (!ok) return;
              rememberShoppingScrollForReload();
              window.location.reload();
            })();
            return;
          }
          if (plannerSelectMode) {
            toggleExpansion();
            return;
          }
          sessionStorage.setItem('selectedShoppingItemId', String(item.id));
          sessionStorage.setItem('selectedShoppingItemName', item.name || '');
          sessionStorage.removeItem('selectedShoppingItemIsNew');
          rememberShoppingScrollForReload();
          window.location.href = getShoppingEditorHref();
        });

        badge.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isShoppingPlannerSelectMode()) return;
          if (event.shiftKey) {
            clearAllVariantQuantities();
            return;
          }
          toggleExpansion();
        });

        li.addEventListener('contextmenu', (event) => {
          if (isShoppingPlannerSelectMode()) {
            if (isControlPrimaryContextMenuGesture(event)) {
              event.preventDefault();
              event.stopPropagation();
              handlePlannerParentPrimaryRemoveGesture();
              return;
            }
            event.preventDefault();
            li.classList.toggle('shopping-row-flagged');
            return;
          }
          event.preventDefault();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
        });

        window.favoriteEatsBindLongPressRemove?.(
          li,
          () => {
            if (isShoppingPlannerSelectMode()) {
              handlePlannerParentPrimaryRemoveGesture();
              return;
            }
            void (async () => {
              const ok = await removeShoppingName(item.name || '');
              if (!ok) return;
              rememberShoppingScrollForReload();
              window.location.reload();
            })();
          },
          {
            shouldIgnore: (event) => {
              const target = event.target;
              if (!(target instanceof Element)) return true;
              return !!target.closest(
                '.shopping-list-row-stepper, .shopping-list-row-badge, .shopping-list-row-icon, .shopping-browse-expand-btn, .shopping-list-doc-amount-skin, button',
              );
            },
          },
        );

        list.appendChild(li);
        childRows.forEach((child) => list.appendChild(child));
        syncParentVisuals();
        li.title = hasVariants
          ? `${displayName}\n\nAll variants: ${namedVariants.join(', ')}`
          : displayName;

        return; // next item
      }

      // ── Simple row (no variants, unselected — no chevron) ──
      const { textWrap: simpleTextWrap } =
        createShoppingBrowsePlannerDocHeadline({
          labelText: displayName,
          amountAriaLabel: 'Recipe amount',
        });
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.textContent = 'add_box';
      icon.setAttribute('aria-hidden', 'true');

      const { stepper, minusBtn, plusBtn, qtySpan } = makeStepperDOM();

      const badge = document.createElement('span');
      badge.className = 'shopping-list-row-badge';
      badge.style.display = 'none';
      li.dataset.shoppingStepperKey = baseName;
      li.classList.add('shopping-browse-planner-row');
      li.appendChild(simpleTextWrap);
      li.appendChild(icon);
      li.appendChild(stepper);
      li.appendChild(badge);
      syncShoppingRowSelectionState(li, baseName);
      const simpleRowKey = () =>
        getShoppingItemVariantAwareKey(baseName) ||
        getShoppingSelectionKey(baseName);
      attachShoppingQtyManualEdit({
        qtyEl: qtySpan,
        getQty: () => getBrowsePlannerPlainStepQty(simpleRowKey()),
        commitQty: (nextPlain) =>
          enqueueShoppingPlannerDirectQty(
            simpleRowKey(),
            getBrowsePlannerDirectQtyForPlainStep(simpleRowKey(), nextPlain),
            { itemName: baseName },
          ),
        onAfterCommit: () =>
          refreshShoppingSelectionUi({ fullRerender: false }),
      });

      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingPlannerSelectMode()) return;
        incrementShoppingQty(li, baseName, 1);
      });

      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isShoppingPlannerSelectMode()) return;
        if (!openBrowsePlannerStepper(simpleRowKey())) return;
        refreshShoppingSelectionUi({ fullRerender: false });
      });

      minusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          isShoppingPlannerSelectMode() &&
          !hasPositiveShoppingQty(getBrowsePlannerPlainStepQty(simpleRowKey()))
        ) {
          if (shoppingRowStepperController.isActive(simpleRowKey())) {
            shoppingRowStepperController.collapseActive();
            syncAllVisibleShoppingRowStates();
          }
          return;
        }
        incrementShoppingQty(li, baseName, -1);
      });

      plusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        incrementShoppingQty(li, baseName, 1);
      });

      const promptRemoveSimpleRowFromPlanningList = () => {
        const key = simpleRowKey();
        runMenuPlanItemRemove(key, displayName, { itemName: baseName }, () => {
          if (shoppingRowStepperController.isActive(key)) {
            shoppingRowStepperController.collapseActive();
          }
          refreshShoppingSelectionUi({ fullRerender: false });
        });
      };

      li.addEventListener('click', (event) => {
        const plannerSelectMode = isShoppingPlannerSelectMode();
        if (plannerSelectMode && isControlClickRemoveGesture(event)) {
          event.preventDefault();
          event.stopPropagation();
          promptRemoveSimpleRowFromPlanningList();
          return;
        }
        const wantsRemove = event.ctrlKey || event.metaKey;
        if (wantsRemove && !plannerSelectMode) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
          return;
        }

        if (plannerSelectMode) {
          const hadExpandedVariants = collapseExpandedVariantRows();
          // If this click only served to collapse an expanded variant group,
          // do not also focus the simple row.
          if (hadExpandedVariants) return;
          focusShoppingPlannerRow(simpleRowKey());
          return;
        }

        sessionStorage.setItem('selectedShoppingItemId', String(item.id));
        sessionStorage.setItem('selectedShoppingItemName', item.name || '');
        sessionStorage.removeItem('selectedShoppingItemIsNew');
        rememberShoppingScrollForReload();
        window.location.href = getShoppingEditorHref();
      });

      li.addEventListener('contextmenu', (event) => {
        if (isShoppingPlannerSelectMode()) {
          if (isControlPrimaryContextMenuGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            promptRemoveSimpleRowFromPlanningList();
            return;
          }
          event.preventDefault();
          li.classList.toggle('shopping-row-flagged');
          return;
        }
        event.preventDefault();
        void (async () => {
          const ok = await removeShoppingName(item.name || '');
          if (!ok) return;
          rememberShoppingScrollForReload();
          window.location.reload();
        })();
      });

      window.favoriteEatsBindLongPressRemove?.(
        li,
        () => {
          if (isShoppingPlannerSelectMode()) {
            promptRemoveSimpleRowFromPlanningList();
            return;
          }
          void (async () => {
            const ok = await removeShoppingName(item.name || '');
            if (!ok) return;
            rememberShoppingScrollForReload();
            window.location.reload();
          })();
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return true;
            return !!target.closest(
              '.shopping-list-row-stepper, .shopping-list-row-badge, .shopping-list-row-icon, .shopping-list-doc-amount-skin, button',
            );
          },
        },
      );

      list.appendChild(li);

    };

    const sortIsLocation =
      isShoppingPlannerSelectMode() &&
      shoppingItemsSortMode === SHOPPING_ITEMS_SORT_MODE_LOCATION;
    const searchActiveForSections = !!(searchInput?.value || '').trim();

    if (!sortIsLocation) {
      items.forEach(appendShoppingBrowseRowsForItem);
    } else {
      const bucketOrderIds = shoppingLocationChipDefs.map((def) =>
        String(def?.id || '')
          .trim()
          .toLowerCase(),
      );
      const bucketLists = new Map();
      bucketOrderIds.forEach((id) => bucketLists.set(id, []));
      const browseFilterOptionsForBuckets = {
        searchQuery: searchInput?.value || '',
        locationIds: getActiveShoppingLocationFilterIds(),
      };
      items.forEach((browseItem) => {
        getShoppingBrowseLocationSortBucketIds(
          browseItem,
          browseFilterOptionsForBuckets,
          bucketOrderIds,
        ).forEach((bucketId) => {
          if (!bucketLists.has(bucketId)) bucketLists.set(bucketId, []);
          bucketLists.get(bucketId).push(browseItem);
        });
      });
      bucketLists.forEach((arr) => {
        arr.sort((a, b) =>
          (a?.name || '').localeCompare(b?.name || '', undefined, {
            sensitivity: 'base',
          }),
        );
      });
      bucketOrderIds.forEach((bucketId) => {
        const rowItems = bucketLists.get(bucketId) || [];
        if (!rowItems.length) return;
        const def = shoppingLocationChipDefs.find(
          (d) =>
            String(d?.id || '')
              .trim()
              .toLowerCase() === bucketId,
        );
        const headerRaw = String(def?.label || bucketId || '').trim();
        const headerText = headerRaw.toUpperCase();
        const sectionKey = itemsBrowseHomeCollapseKey(bucketId);
        const sectionLi = document.createElement('li');
        sectionLi.className =
          'list-section-label shopping-list-section--store'.trim();
        const isCollapsible = !searchActiveForSections;
        if (isCollapsible) {
          const isExpanded = !collapsedItemsBrowseHomeSections.has(sectionKey);
          const toggleBtn = createSectionToggleButton({
            label: headerText,
            expanded: isExpanded,
            completed: false,
            onToggle: () => {
              if (collapsedItemsBrowseHomeSections.has(sectionKey)) {
                collapsedItemsBrowseHomeSections.delete(sectionKey);
              } else {
                collapsedItemsBrowseHomeSections.add(sectionKey);
              }
              persistItemsBrowseHomeCollapsed();
              applyShoppingFilters();
            },
          });
          sectionLi.appendChild(toggleBtn);
        } else {
          sectionLi.textContent = headerText;
        }
        list.appendChild(sectionLi);
        if (
          !isCollapsible ||
          !collapsedItemsBrowseHomeSections.has(sectionKey)
        ) {
          rowItems.forEach((browseItem) => {
            currentLocationSortBucketId = bucketId;
            appendShoppingBrowseRowsForItem(browseItem);
          });
          currentLocationSortBucketId = '';
        }
      });
    }

    // Keep selection valid after rerender (search/filter changes).
    if (isShoppingPlannerSelectMode()) {
      ensureVariantParentHeadlineFitObserver();
      scheduleVariantParentHeadlineFitting();
    }
    listNav?.syncAfterRender?.();
  }

  restoreShoppingChipState();
  mountShoppingFilterChips();
  // Initial render
  applyShoppingFilters();
  fePageLoadFoodIconFinish();
  try {
    if (window.favoriteEatsPlanSession) {
      void window.favoriteEatsPlanSession.refreshCatalogFromServer().then(() => {
        if (
          !window.favoriteEatsPlanSession.getHasNamedSnapshot() &&
          window.favoriteEatsPlanSession.isDirty()
        ) {
          window.favoriteEatsPlanSession.setBaselineFromCurrentLiveState();
        }
      });
      window.favoriteEatsPlanSession.wireShoppingListSaveButton(
        document.getElementById('appBarSaveBtn'),
      );
    }
  } catch (_) {}
  syncShoppingAppBarActionChrome();
  try {
    if (list?.dataset) list.dataset.fePerfItemsReady = '1';
  } catch (_) {}
  if (isShoppingPlannerSelectMode()) {
    void initialShoppingBrowsePlanRowsIndexPromise.then(() => {
      if (!isShoppingPlannerSelectMode()) return;
      refreshShoppingSelectionUi({ fullRerender: false });
    });
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => void runDeferredRecipeDerivedHydrate(), {
        timeout: 2000,
      });
    } else {
      setTimeout(() => void runDeferredRecipeDerivedHydrate(), 0);
    }
  }

  const unregisterCatalogShoppingItems =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listShoppingItems();
        shoppingRows = (Array.isArray(rows) ? rows : []).map(
          dataServiceShoppingItemToPageRow,
        );
        await rebuildShoppingTagChipOptionDefsFromRows();
        refreshShoppingFilterUi();
        applyShoppingFilters();
        syncShoppingActionButtonState();
      } catch (err) {
        console.warn('catalog reference refresh (shopping items) failed:', err);
      }
    });
  const unregisterCatalogCompositionItems =
    registerFavoriteEatsCatalogCompositionUiRefreshHook(async () => {
      if (!isShoppingPlannerSelectMode()) return;
      try {
        await recomputeRecipeDerivedPlanDisplay();
        syncShoppingActionButtonState();
      } catch (err) {
        console.warn(
          'catalog composition refresh (recipe-derived plan display) failed:',
          err,
        );
      }
    });
  window.addEventListener('pagehide', unregisterCatalogShoppingItems, {
    once: true,
  });
  window.addEventListener('pagehide', unregisterCatalogCompositionItems, {
    once: true,
  });

  restoreShoppingScrollAfterReload();
  scrollToShoppingNavTarget(pendingShoppingNavTarget);

  // Recipes-style Add: popup → Cancel does nothing → Create inserts + opens editor
  async function openCreateShoppingItemDialog() {
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }

    const name = await window.ui.prompt({
      title: 'New Shopping Item',
      label: 'Name',
      value: '',
      placeholder: '',
      confirmText: 'Create',
      cancelText: 'Cancel',
      required: true,
      normalize: (v) => (v || '').trim(),
    });
    if (!name) return;

    let newId = null;
    try {
      if (
        !window.dataService ||
        typeof window.dataService.findOrCreateShoppingItem !== 'function'
      ) {
        throw new Error(
          'dataService.findOrCreateShoppingItem is not available.',
        );
      }
      const result = await window.dataService.findOrCreateShoppingItem({
        name,
        lemma: deriveIngredientLemmaInMain(name),
      });
      newId = result?.id != null ? Number(result.id) : null;
      if (newId == null || !Number.isFinite(newId) || newId <= 0) {
        throw new Error('findOrCreateShoppingItem returned no id.');
      }
    } catch (err) {
      console.error('❌ Failed to create shopping item:', err);
      uiToast('Failed to create shopping item. See console.');
      return;
    }

    try {
      await persistDbForCurrentRuntime(db, {
        failureMessage: 'Failed to save database after creating shopping item.',
      });
    } catch (err) {
      console.error(
        '❌ Failed to persist DB after creating shopping item:',
        err,
      );
      uiToast('Failed to save database after creating shopping item.');
      return;
    }

    if (newId != null) {
      sessionStorage.setItem('selectedShoppingItemId', String(newId));
      sessionStorage.setItem('selectedShoppingItemName', name);
      sessionStorage.setItem('selectedShoppingItemIsNew', '1');
      window.location.href = favoriteEatsHrefWithCurrentAdapter(
        'shoppingEditor.html',
      );
    }
  }

  const onShoppingActionClick = () => {
    void openCreateShoppingItemDialog();
  };
  if (addBtn) {
    syncShoppingAppBarActionChrome();
    addBtn.addEventListener('click', onShoppingActionClick);
    window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, (event) => {
      if (!document.body.classList.contains('shopping-page')) return;
      swapShoppingFilterChipsForPlannerModeChange(event);
      syncShoppingAppBarActionChrome();
      rebuildItemsMonogramMenu();
      if (isShoppingPlannerSelectMode()) {
        refreshShoppingFilterUi();
        applyShoppingFilters();
        void (async () => {
          if (
            shouldUseRemoteShoppingState() &&
            typeof hydrateShoppingStateFromDataService === 'function'
          ) {
            try {
              await hydrateShoppingStateFromDataService();
            } catch (err) {
              console.warn('Items page: planner state hydrate failed:', err);
              return;
            }
          }
          hydrateShoppingSelectionsFromPlan();
          await refreshShoppingBrowsePlanRowsIndex();
          await runDeferredRecipeDerivedHydrate();
          refreshShoppingSelectionUi();
        })();
      } else {
        clearShoppingPlannerUiState();
        refreshShoppingFilterUi();
        applyShoppingFilters();
      }
    });
  }

  // Charter §G: after a realtime-triggered hydrate, override any keys with a
  // pending stepper op in the queue back to the queue's pending value. This
  // replaces wholesale "skip refresh while busy" gates with a per-key merge
  // that lets unrelated rows refresh freely.
  const mergePendingPlannerQtyIntoLocalMaps = () => {
    if (
      !shoppingPlannerQtyInputQueue ||
      typeof shoppingPlannerQtyInputQueue.peekPendingKeys !== 'function'
    ) {
      return;
    }
    // Iterate the queue's pending keys directly. This includes keys that
    // are NOT in shoppingQuantities yet (e.g. an in-flight "create at qty 1"
    // that the server snapshot has not seen, so hydrate left it out).
    const pendingKeys = shoppingPlannerQtyInputQueue.peekPendingKeys();
    pendingKeys.forEach((compoundKey) => {
      // compoundKey is "plan:<entityKey>:quantity"; extract entityKey.
      const parts = String(compoundKey).split(':');
      if (parts.length < 3 || parts[0] !== 'plan' || parts[parts.length - 1] !== 'quantity') {
        return;
      }
      const entityKey = parts.slice(1, -1).join(':');
      const pending = shoppingPlannerQtyInputQueue.getPendingOp({
        surface: 'plan',
        entityKey,
        field: 'quantity',
      });
      if (!pending) return;
      applyShoppingPlannerQtyLocal({
        surface: 'plan',
        field: 'quantity',
        entityKey,
        value: pending.value,
        meta: pending.meta || null,
      });
    });
  };

  registerFavoriteEatsRemotePlanUiRefreshHook(async () => {
    const refreshSeq = (shoppingBrowsePlanUiRefreshSeq += 1);
    const requestSeqAtStart =
      Number(global.__favoriteEatsRemotePlanUiRefreshRequestSeq || 0) || 0;
    const isLatestPlanUiRefresh = () =>
      refreshSeq === shoppingBrowsePlanUiRefreshSeq &&
      requestSeqAtStart ===
        (Number(global.__favoriteEatsRemotePlanUiRefreshRequestSeq || 0) || 0);
    if (!isShoppingPlannerSelectMode()) return;
    if (list.querySelector('.shopping-stepper-qty-input')) return;
    const editSeqAtStart = shoppingBrowsePlannerEditSeq;
    const planSaveInFlight = getShoppingPlanRemoteSaveInFlight() > 0;
    const userEditedDuringHydrate =
      editSeqAtStart !== shoppingBrowsePlannerEditSeq;
    if (!planSaveInFlight && !userEditedDuringHydrate) {
      hydrateShoppingSelectionsFromPlan();
      mergePendingPlannerQtyIntoLocalMaps();
    }
    try {
      await recomputeRecipeDerivedPlanDisplay({
        shouldApply: isLatestPlanUiRefresh,
      });
      if (!isLatestPlanUiRefresh()) return;
    } catch (err) {
      console.warn(
        'hydrateRecipeDerivedShoppingSelections (realtime) failed:',
        err,
      );
      return;
    }
    syncShoppingActionButtonState();
  });
  // PoC: per-row Realtime patch for items quantity (Charter walkback fix).
  // When this hook returns true, the wholesale `load_shopping_state` round
  // trip is skipped for that payload — eliminating the snapshot race that
  // produced the stepper snapback.
  if (typeof registerFavoriteEatsRemotePlanPatchHook === 'function') {
    registerFavoriteEatsRemotePlanPatchHook((payload) =>
      applyShoppingPlannerQtyRemotePatch(payload),
    );
  }
  // Charter §H boot replay: drain any pending stepper ops left in the durable
  // ring from a prior session through the narrow RPC. Bypasses onLocalApply
  // because the local maps were just hydrated from the in-memory plan.
  void (async function drainShoppingPlannerQtyDurable() {
    if (
      !shoppingPlannerQtyInputQueue ||
      typeof shoppingPlannerQtyInputQueue.drainDurable !== 'function'
    ) {
      return;
    }
    const ops = shoppingPlannerQtyInputQueue.drainDurable();
    if (!Array.isArray(ops) || ops.length === 0) return;
    for (const op of ops) {
      if (!op || op.surface !== 'plan' || op.field !== 'quantity') continue;
      try {
        const result = await flushShoppingPlannerQtyToRemote(op);
        const updatedAt =
          result && typeof result === 'object'
            ? result.updated_at || result.updatedAt || null
            : null;
        if (
          updatedAt &&
          typeof shoppingPlannerQtyInputQueue.recordEchoApplied === 'function'
        ) {
          shoppingPlannerQtyInputQueue.recordEchoApplied(
            {
              surface: 'plan',
              entityKey: String(op.entityKey || ''),
              field: 'quantity',
            },
            { updated_at: updatedAt, value: op.value },
          );
        }
      } catch (err) {
        console.warn('shopping planner qty durable replay failed:', err);
      }
    }
  })();

  window.addEventListener(
    'pagehide',
    () => {
      if (
        shoppingPlannerQtyInputQueue &&
        typeof shoppingPlannerQtyInputQueue.flushAll === 'function'
      ) {
        void shoppingPlannerQtyInputQueue.flushAll();
      }
      delete window.favoriteEatsMonogramMenuExtraButtons;
      delete window.favoriteEatsSyncMonogramMenuExtraButtons;
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

  global.favoriteEatsItemsPage = {
    registerFavoriteEatsItemsPageDeps,
    loadShoppingPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
