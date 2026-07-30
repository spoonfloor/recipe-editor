/**
 * Recipes hub page UI (Slice 7 phase 2).
 */
(function favoriteEatsRecipesPageModule(global) {
  if (!global) return;

  /** @type {object|null} */
  let deps = null;

  function registerFavoriteEatsRecipesPageDeps(nextDeps) {
    deps = nextDeps && typeof nextDeps === 'object' ? nextDeps : null;
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('favoriteEatsRecipesPage deps are not registered.');
    }
    return deps;
  }

/** Cuisine tags shown under one compound filter on the recipes list (label: regional). */
const RECIPE_LIST_REGIONAL_TAG_LABELS = [
  'Asian',
  'Chinese',
  'Indian',
  'Italian',
  'Japanese',
  'Mediterranean',
  'Mexican & Latin',
  'Vietnamese',
];
const RECIPE_LIST_REGIONAL_KEYS = new Set(
  RECIPE_LIST_REGIONAL_TAG_LABELS.map((s) => s.toLowerCase()),
);
/** Meal tags shown under one compound filter on the recipes list (label: meal). */
const RECIPE_LIST_MEAL_TAG_LABELS = ['dinner', 'lunch', 'breakfast'];
const RECIPE_LIST_MEAL_KEYS = new Set(
  RECIPE_LIST_MEAL_TAG_LABELS.map((s) => s.toLowerCase()),
);
/** Recipes list filter chip id — not a real tag; shows recipes with no tags. */
const RECIPE_LIST_NO_TAG_FILTER_CHIP_ID = '__fe_recipe_no_tag__';
/** Recipes list filter chip id — planner picks only (plan quantity / stepper selection > 0). */
const RECIPE_LIST_SELECTED_FILTER_CHIP_ID = '__fe_recipe_selected__';

  async function loadRecipesPage() {
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
    ensureRecipeListServingsHeaderLabelMediaListener,
    ensureRecipeTagsSchemaInMain,
    ensureIngredientVariantTagsSchemaInMain,
    enableTopLevelListKeyboardNav,
    wireAppBarSearch,
    FAVORITE_EATS_JUST_LOGGED_IN_FROM_WELCOME_KEY,
    FAVORITE_EATS_WELCOME_IDENTITY_TOAST_DELAY_MS,
    isPlannerModeEnabled,
    favoriteEatsDataServiceIsSupabaseActive,
    primeShoppingPlanRecipeDetailCacheForRecipeTree,
    primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots,
    touchShoppingPlanRecipeSelectionsMaterialization,
    setShoppingPlanRecipeRootSelection,
    getShoppingPlanRecipeSelectionRoots,
    getShoppingPlanRecipeSelections,
    getShoppingPlanItemSelections,
    getShoppingPlan,
    persistShoppingPlan,
    runWithShoppingPlanMutationBatch,
    flushCoalescedPlanSaveToDataService,
    createEmptyShoppingPlan,
    cloneForUndo,
    clearShoppingPlanSelections,
    persistDbForCurrentRuntime,
    uiToast,
    uiConfirm,
    uiToastUndo,
    ensureAppBarTextActionPair,
    setSelectedRecipeNavigationSession,
    confirmRemoveFromPlanningList,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    setRecipeCatalogRealtimeUnsub,
    FAVORITE_EATS_PLANNER_MODE_EVENT,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    favoriteEatsHrefWithCurrentAdapter,
    favoriteEatsFormatRecipeTitleForDisplay,
  } = requireDeps();

  fePageLoadFoodIconBegin('recipes');
  const db = null;
  window.dbInstance = db;
  if (window.dataService) {
    window.dataService.useSupabase = true;
  }
  let prefetchedRecipeRows = null;
  let recipeRowsLoadedFromDataService = false;
  if (
    window.favoriteEatsRecipesScreen &&
    typeof window.favoriteEatsRecipesScreen.bootstrapRecipesHub === 'function'
  ) {
    const boot = await window.favoriteEatsRecipesScreen.bootstrapRecipesHub({
      shouldUseSupabase: favoriteEatsShouldUseSupabaseDataDoor(),
      includePlan: isPlannerModeEnabled() && shouldUseRemoteShoppingState(),
      shouldUseRemoteShoppingState: shouldUseRemoteShoppingState(),
      hydrateShoppingState: hydrateShoppingStateFromDataService,
      reportPrefetchFailure: favoriteEatsReportSupabasePrefetchFailure,
    });
    if (boot.hydrateFailed) {
      fePageLoadFoodIconFail();
      return;
    }
    if (boot.ok && Array.isArray(boot.recipeRows)) {
      prefetchedRecipeRows = boot.recipeRows;
      recipeRowsLoadedFromDataService = true;
    }
  }

  if (!recipeRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }

  initAppBar({
    mode: 'list',
    titleText: 'Recipes',
  });

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();
  var enteredViaWelcome = false;
  try {
    enteredViaWelcome =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(FAVORITE_EATS_JUST_LOGGED_IN_FROM_WELCOME_KEY) ===
        '1';
  } catch (_) {}
  try {
    if (
      typeof window.favoriteEatsShowWelcomeLandingMonikerToast === 'function'
    ) {
      window.favoriteEatsShowWelcomeLandingMonikerToast();
    }
  } catch (_) {}
  try {
    const monikerArmOk = enteredViaWelcome;
    if (monikerArmOk) {
      if (
        typeof window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast ===
        'function'
      ) {
        window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast(
          FAVORITE_EATS_WELCOME_IDENTITY_TOAST_DELAY_MS,
        );
      }
    } else {
      window.favoriteEatsCoPresenceEarliestOkAtTs = 0;
      window.favoriteEatsCoPresenceLoginEventArmed = false;
    }
  } catch (_) {}

  const addBtnRecipes = document.getElementById('appBarAddBtn');
  const recipesActionBtn = addBtnRecipes;

  const list = document.getElementById('recipeList');
  if (!list) return;
  ensureRecipeListServingsHeaderLabelMediaListener();
  ensureRecipeTagsSchemaInMain(db);
  ensureIngredientVariantTagsSchemaInMain(db);
  list.innerHTML = '';

  window.dbInstance = db;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);
  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: (query) => {
      searchQuery = String(query || '').toLowerCase();
      invalidateRecipesBrowseUi('userSearchChanged');
    },
  });
  const recipeFilterChipRail =
    typeof window.mountTopFilterChipRail === 'function' && searchInput
      ? window.mountTopFilterChipRail({
          anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
          dockId: 'recipeFilterChipDock',
        })
      : null;

  const activeTagFilters = new Set();
  /** Compound filter menu to reopen after chip rerender (regional / meal / more). */
  let reopenRecipeCompoundDropdownId = '';
  let searchQuery = '';
  let recipeRows = [];
  let recipeRootInputClientSeq = 0;
  const recipePlannerServingsUi = window.recipePlannerModeServings || {};
  const recipePlannerServingsChangedEventName =
    window.favoriteEatsRecipePlannerServings?.changeEventName ||
    window.favoriteEatsEventNames?.recipePlannerServingsChanged ||
    '';
  const isRecipePlannerSelectMode = () => isPlannerModeEnabled();
  const getRecipeRootQuantityQueue = () => {
    if (typeof window.getFavoriteEatsPlanRecipeRootQuantityQueue === 'function') {
      return window.getFavoriteEatsPlanRecipeRootQuantityQueue();
    }
    return window.favoriteEatsPlanRecipeRootQuantityQueue || null;
  };
  const recipeRootQuantityOpLike = (recipeId) => ({
    surface: 'plan',
    entityKey: String(Math.trunc(Number(recipeId))),
    field: 'recipeRootQuantity',
  });
  const toPositiveServingsOrNull = (rawValue) => {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const getRecipeQtyKey = (recipeId) => String(recipeId || '').trim();
  const getRecipeRootSelectionQuantity = (recipeId) => {
    const rid = Number(recipeId);
    if (!Number.isFinite(rid) || rid <= 0) return 0;
    const queue = getRecipeRootQuantityQueue();
    const opLike = recipeRootQuantityOpLike(rid);
    if (queue && typeof queue.getPendingOp === 'function') {
      const pending = queue.getPendingOp(opLike);
      const inFlight =
        typeof queue.getInFlightOp === 'function'
          ? queue.getInFlightOp(opLike)
          : null;
      const localIntent = pending || inFlight;
      if (localIntent) {
        return Math.max(0, Math.min(99, Number(localIntent.value || 0)));
      }
    }
    const roots = getShoppingPlanRecipeSelectionRoots();
    const entry = roots[getRecipeQtyKey(rid)];
    return Math.max(0, Math.min(99, Number(entry?.quantity || 0)));
  };
  const isRecipeSelected = (recipeId) => getRecipeRootSelectionQuantity(recipeId) > 0;
  const formatRecipeTitleForDisplay =
    window.favoriteEatsFormatRecipeTitleForDisplay ||
    favoriteEatsFormatRecipeTitleForDisplay;
  const getRecipeRowById = (recipeId) =>
    recipeRows.find((row) => Number(row?.id) === Number(recipeId)) || null;
  const primeRecipeRowServings = (recipeRow) => {
    if (!recipeRow) return;
    // Charter §F: per-key precedence. If the servings queue has an in-flight
    // value for this recipe, the queue's value is the authoritative local
    // intent — newer than anything cached in storage A (recipePlannerServingsMap)
    // or storage B (shoppingPlanCache). Apply it to the model FIRST so the
    // priming step below cannot clobber the user's most-recent tap when the
    // wholesale realtime hydrate carried a stale snapshot.
    const queue =
      typeof window !== 'undefined'
        ? window.favoriteEatsPlanRecipeServingsQueue
        : null;
    if (queue && typeof queue.getPendingOp === 'function') {
      const rid = Number(recipeRow.id);
      if (Number.isFinite(rid) && rid > 0) {
        const opLike = {
          surface: 'plan',
          entityKey: String(Math.trunc(rid)),
          field: 'servingsOverride',
        };
        const pending = queue.getPendingOp(opLike);
        const inFlight =
          typeof queue.getInFlightOp === 'function'
            ? queue.getInFlightOp(opLike)
            : null;
        const localIntent = pending || inFlight;
        if (
          localIntent &&
          typeof recipePlannerServingsUi.applyToModel === 'function'
        ) {
          const nextValue =
            localIntent.value == null ? null : Number(localIntent.value);
          recipePlannerServingsUi.applyToModel(recipeRow, nextValue, {
            persist: false,
          });
          return;
        }
      }
    }
    if (typeof window.recipePlannerModePrimeRecipe !== 'function') return;
    window.recipePlannerModePrimeRecipe(recipeRow);
  };
  const getRecipeRowBounds = (recipeRow) => {
    if (typeof recipePlannerServingsUi.getBounds === 'function') {
      return recipePlannerServingsUi.getBounds(recipeRow);
    }
    return null;
  };
  const getRecipeRowDisplayServings = (recipeRow) => {
    if (typeof recipePlannerServingsUi.getDisplayValue === 'function') {
      return recipePlannerServingsUi.getDisplayValue(recipeRow);
    }
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds) return null;
    return bounds.baseDefault;
  };
  const formatRecipeRowServings = (rawValue) => {
    if (typeof recipePlannerServingsUi.formatDisplay === 'function') {
      return recipePlannerServingsUi.formatDisplay(rawValue);
    }
    return typeof window.formatShoppingQtyForDisplay === 'function'
      ? window.formatShoppingQtyForDisplay(rawValue)
      : String(rawValue == null ? '' : rawValue);
  };
  const initializeRecipeRowServings = (recipeRow) => {
    const bounds = getRecipeRowBounds(recipeRow);
    if (!bounds || typeof recipePlannerServingsUi.applyToModel !== 'function')
      return null;
    const initial =
      bounds.baseDefault != null && bounds.baseDefault > 0
        ? bounds.baseDefault
        : 1;
    return recipePlannerServingsUi.applyToModel(recipeRow, initial);
  };
  const syncRecipesActionButtonState = () => {
    if (!(recipesActionBtn instanceof HTMLButtonElement)) return;
    if (!isRecipePlannerSelectMode()) {
      recipesActionBtn.disabled = false;
      recipesActionBtn.removeAttribute('aria-disabled');
    }
    try {
      if (
        typeof window.favoriteEatsSyncMonogramMenuExtraButtons === 'function'
      ) {
        window.favoriteEatsSyncMonogramMenuExtraButtons();
      }
    } catch (_) {}
  };
  const syncRecipesAppBarActionChrome = () => {
    const plannerOn = isRecipePlannerSelectMode();
    const saveBtn = document.getElementById('appBarSaveBtn');
    if (recipesActionBtn instanceof HTMLButtonElement) {
      if (plannerOn) {
        recipesActionBtn.style.display = 'none';
      } else {
        recipesActionBtn.style.display = '';
        ensureAppBarTextActionPair(recipesActionBtn, 'Add', 'add');
      }
    }
    try {
      window.favoriteEatsPlanSession?.syncShoppingListPlanSessionSaveButtonState?.(
        saveBtn,
        { visible: plannerOn },
      );
    } catch (_) {}
    syncRecipesActionButtonState();
  };
  const formatRecipeRowServingsNote = (rawValue) => {
    const formatted =
      rawValue == null ? '' : formatRecipeRowServings(rawValue);
    return formatted ? `${formatted} svg` : '';
  };
  const syncRecipeRowCheckboxState = (rowEl, recipeRow) => {
    if (!(rowEl instanceof HTMLElement) || !recipeRow) return;
    const recipeId = recipeRow.id;
    const enabled = isRecipePlannerSelectMode();
    const bounds = getRecipeRowBounds(recipeRow);
    const hasServings = !!bounds;
    const selected = isRecipeSelected(recipeId);
    const displayServings = selected ? getRecipeRowDisplayServings(recipeRow) : null;
    const servingsNote = formatRecipeRowServingsNote(displayServings);
    const checkbox = rowEl.querySelector('.recipe-list-plan-checkbox');
    const checkboxIcon = checkbox?.querySelector('.material-symbols-outlined');
    const servingsDetail = rowEl.querySelector('.recipe-list-servings-detail');
    const disabledIndicator = rowEl.querySelector(
      '.recipe-list-servings-disabled',
    );

    rowEl.dataset.recipeServingsAvailable = hasServings ? 'true' : 'false';
    rowEl.dataset.recipeSelected =
      enabled && selected && hasServings ? 'true' : 'false';
    rowEl.classList.toggle(
      'shopping-row-checked',
      enabled && selected && hasServings,
    );

    if (servingsDetail) {
      servingsDetail.textContent = servingsNote ? `(${servingsNote})` : '';
      servingsDetail.style.display = servingsNote ? '' : 'none';
    }
    const tail = rowEl.querySelector('.recipe-list-servings-tail');
    if (tail) {
      tail.style.display = servingsNote ? '' : 'none';
    }

    if (!enabled) {
      if (checkbox) checkbox.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'none';
      return;
    }

    if (!hasServings) {
      if (checkbox) checkbox.style.display = 'none';
      if (disabledIndicator) disabledIndicator.style.display = 'inline-flex';
      return;
    }

    if (disabledIndicator) disabledIndicator.style.display = 'none';
    if (checkbox instanceof HTMLButtonElement) {
      checkbox.style.display = 'inline-flex';
      checkbox.disabled = false;
      checkbox.setAttribute(
        'aria-checked',
        selected ? 'true' : 'false',
      );
      checkbox.setAttribute(
        'aria-label',
        selected ? 'Remove recipe from plan' : 'Add recipe to plan',
      );
    }
    if (checkboxIcon) {
      checkboxIcon.textContent = selected ? 'check_box' : 'check_box_outline_blank';
    }
  };
  const shouldUseNarrowRecipeRootRpc = () =>
    shouldUseRemoteShoppingState() &&
    favoriteEatsDataServiceIsSupabaseActive() &&
    window.dataService &&
    typeof window.dataService.setPlanRecipeQuantity === 'function';
  const enqueueRecipeRootToggle = (recipeId, isSelected) => {
    const recipeRow = getRecipeRowById(recipeId);
    if (!recipeRow) return false;
    if (isSelected && !getRecipeRowBounds(recipeRow)) return false;
    if (isSelected) initializeRecipeRowServings(recipeRow);
    if (isSelected && favoriteEatsDataServiceIsSupabaseActive()) {
      void primeShoppingPlanRecipeDetailCacheForRecipeTree([recipeId]).catch(
        (primeErr) => {
          console.warn(
            'primeShoppingPlanRecipeDetailCacheForRecipeTree failed:',
            primeErr,
          );
        },
      );
    }
    const nextValue = isSelected ? 1 : 0;
    const previousValue = isRecipeSelected(recipeId) ? 1 : 0;
    const displayServingsForRpc = isSelected
      ? toPositiveServingsOrNull(getRecipeRowDisplayServings(recipeRow))
      : null;
    const meta = {
      title: recipeRow?.title || '',
      servingsOverride: displayServingsForRpc,
    };
    const useNarrowRpc = shouldUseNarrowRecipeRootRpc();
    const queue = getRecipeRootQuantityQueue();
    if (queue && typeof queue.enqueue === 'function') {
      return queue.enqueue({
        surface: 'plan',
        entityKey: String(Math.trunc(Number(recipeId))),
        field: 'recipeRootQuantity',
        value: nextValue,
        previousValue,
        meta,
        useNarrowRpc: !!useNarrowRpc,
        clientSeq: (recipeRootInputClientSeq += 1),
      });
    }
    setShoppingPlanRecipeRootSelection(
      {
        recipeId,
        title: meta.title,
        quantity: nextValue,
        servingsOverride: isSelected ? displayServingsForRpc : null,
      },
      { skipRemoteSave: true },
    );
    if (useNarrowRpc) {
      void window.dataService
        .setPlanRecipeQuantity({
          recipeId,
          title: meta.title,
          quantity: nextValue,
          servingsOverride: displayServingsForRpc,
        })
        .catch((err) => {
          console.warn('setPlanRecipeQuantity failed:', err);
        });
    }
    return true;
  };
  const setRecipeSelected = async (recipeId, isSelected) => {
    const enqueued = enqueueRecipeRootToggle(recipeId, isSelected);
    if (!enqueued) return;
    syncRecipesActionButtonState();
    invalidateRecipesBrowseUi('planSelectionChanged');
  };
  const countSelectedRecipesInPlan = () => {
    const roots = getShoppingPlanRecipeSelectionRoots();
    const queue = getRecipeRootQuantityQueue();
    const keys = new Set(Object.keys(roots || {}));
    if (queue && typeof queue.peekPendingKeys === 'function') {
      queue.peekPendingKeys().forEach((compoundKey) => {
        const parts = String(compoundKey).split(':');
        if (
          parts.length >= 3 &&
          parts[0] === 'plan' &&
          parts[parts.length - 1] === 'recipeRootQuantity'
        ) {
          keys.add(parts.slice(1, -1).join(':'));
        }
      });
    }
    if (queue && typeof queue.peekInFlightKeys === 'function') {
      queue.peekInFlightKeys().forEach((compoundKey) => {
        const parts = String(compoundKey).split(':');
        if (
          parts.length >= 3 &&
          parts[0] === 'plan' &&
          parts[parts.length - 1] === 'recipeRootQuantity'
        ) {
          keys.add(parts.slice(1, -1).join(':'));
        }
      });
    }
    let count = 0;
    keys.forEach((key) => {
      const qty = getRecipeRootSelectionQuantity(key);
      if (qty > 0) count += 1;
    });
    return count;
  };
  const clearRecipePlannerUiState = () => {};

  const handleClearAllItemsFromPlan = async () => {
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
    const restoreClearedSelections = () => {
      persistShoppingPlan(previousPlan);
      syncRecipesActionButtonState();
      invalidateRecipesBrowseUi('planSelectionChanged');
    };
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
    syncRecipesActionButtonState();
    invalidateRecipesBrowseUi('planSelectionChanged');
    uiToastUndo('All shopping selections cleared.', restoreClearedSelections);
  };

  let recipesMonogramManageBtn = null;
  let recipesMonogramCloseSessionBtn = null;
  let recipesMonogramClearBtn = null;
  const syncRecipesMonogramPlanSessionButtonState = () => {
    if (
      window.favoriteEatsPlanSession &&
      typeof window.favoriteEatsPlanSession.syncPlanSessionMonogramButtonState ===
        'function'
    ) {
      window.favoriteEatsPlanSession.syncPlanSessionMonogramButtonState(
        recipesMonogramManageBtn,
        recipesMonogramCloseSessionBtn,
      );
    }
  };
  const syncRecipesMonogramClearButtonState = () => {
    if (!(recipesMonogramClearBtn instanceof HTMLButtonElement)) return;
    const disabled =
      Object.keys(getShoppingPlanItemSelections()).length === 0 &&
      Object.keys(getShoppingPlanRecipeSelections()).length === 0;
    recipesMonogramClearBtn.disabled = disabled;
    recipesMonogramClearBtn.setAttribute(
      'aria-disabled',
      disabled ? 'true' : 'false',
    );
  };
  const syncRecipesMonogramExtraButtonsState = () => {
    syncRecipesMonogramPlanSessionButtonState();
    syncRecipesMonogramClearButtonState();
  };
  const ensureRecipesMonogramActionButtons = () => {
    if (!isRecipePlannerSelectMode()) return [];
    if (!(recipesMonogramManageBtn instanceof HTMLButtonElement)) {
      recipesMonogramManageBtn =
        window.favoriteEatsPlanSession?.createManageMonogramButton?.() || null;
    }
    if (!(recipesMonogramCloseSessionBtn instanceof HTMLButtonElement)) {
      recipesMonogramCloseSessionBtn =
        window.favoriteEatsPlanSession?.createCloseSessionMonogramButton?.() ||
        null;
    }
    if (!(recipesMonogramClearBtn instanceof HTMLButtonElement)) {
      recipesMonogramClearBtn = document.createElement('button');
      recipesMonogramClearBtn.type = 'button';
      recipesMonogramClearBtn.id = 'appBarMonogramRecipesClearBtn';
      recipesMonogramClearBtn.className = 'bottom-nav-pill';
      recipesMonogramClearBtn.textContent = 'Clear all items';
      recipesMonogramClearBtn.addEventListener('click', () => {
        if (recipesMonogramClearBtn.disabled) return;
        void handleClearAllItemsFromPlan();
      });
    }
    syncRecipesMonogramExtraButtonsState();
    const buttons = [];
    if (recipesMonogramManageBtn instanceof HTMLButtonElement) {
      buttons.push(recipesMonogramManageBtn);
    }
    if (recipesMonogramCloseSessionBtn instanceof HTMLButtonElement) {
      buttons.push(recipesMonogramCloseSessionBtn);
    }
    if (recipesMonogramClearBtn instanceof HTMLButtonElement) {
      buttons.push(recipesMonogramClearBtn);
    }
    return buttons;
  };
  const rebuildRecipesMonogramMenu = () => {
    try {
      if (typeof window.favoriteEatsRebuildMonogramAccountMenu === 'function') {
        window.favoriteEatsRebuildMonogramAccountMenu();
      }
    } catch (_) {}
  };
  window.favoriteEatsMonogramMenuExtraButtons =
    ensureRecipesMonogramActionButtons;
  window.favoriteEatsSyncMonogramMenuExtraButtons =
    syncRecipesMonogramExtraButtonsState;
  rebuildRecipesMonogramMenu();

  const isRecipeFilterChipDropdownUiTarget = (target) => {
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

  const isRecipeCompoundDropdownOpen = () =>
    !!recipeFilterChipRail?.trackEl?.querySelector(
      '.app-filter-chip-dropdown-wrap.is-open',
    );

  const renderTagFilterChips = (rows) => {
    const chipMountEl = recipeFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    const reopenCompoundDropdown = isRecipeCompoundDropdownOpen();
    const persistedOpenId =
      typeof window.readOpenFilterChipCompoundDropdownId === 'function'
        ? window.readOpenFilterChipCompoundDropdownId(chipMountEl)
        : '';
    const reopenCompoundDropdownId = reopenCompoundDropdown
      ? reopenRecipeCompoundDropdownId || persistedOpenId
      : '';
    reopenRecipeCompoundDropdownId = '';
    const regionalSeen = new Set();
    const regionalKeysInOrder = [];
    const mealSeen = new Set();
    const mealKeysInOrder = [];
    const flatNames = [];
    const flatSeen = new Set();
    (rows || []).forEach((r) => {
      (Array.isArray(r.tags) ? r.tags : []).forEach((name) => {
        const key = String(name || '')
          .trim()
          .toLowerCase();
        if (!key) return;
        if (RECIPE_LIST_REGIONAL_KEYS.has(key)) {
          if (!regionalSeen.has(key)) {
            regionalSeen.add(key);
            regionalKeysInOrder.push(key);
          }
          return;
        }
        if (RECIPE_LIST_MEAL_KEYS.has(key)) {
          if (!mealSeen.has(key)) {
            mealSeen.add(key);
            mealKeysInOrder.push(key);
          }
          return;
        }
        if (flatSeen.has(key)) return;
        flatSeen.add(key);
        flatNames.push(String(name || '').trim());
      });
    });
    regionalKeysInOrder.sort((a, b) => {
      const labelA =
        RECIPE_LIST_REGIONAL_TAG_LABELS.find((l) => l.toLowerCase() === a) ||
        a;
      const labelB =
        RECIPE_LIST_REGIONAL_TAG_LABELS.find((l) => l.toLowerCase() === b) ||
        b;
      return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
    });
    mealKeysInOrder.sort((a, b) => {
      const ia = RECIPE_LIST_MEAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === a,
      );
      const ib = RECIPE_LIST_MEAL_TAG_LABELS.findIndex(
        (l) => l.toLowerCase() === b,
      );
      return ia - ib;
    });
    flatNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    const regionalOptions = regionalKeysInOrder.map((key) => ({
      id: key,
      label:
        RECIPE_LIST_REGIONAL_TAG_LABELS.find((l) => l.toLowerCase() === key) ||
        key,
      disabled: false,
    }));
    const regionalSelectedIds = new Set(
      [...activeTagFilters].filter((k) => RECIPE_LIST_REGIONAL_KEYS.has(k)),
    );
    const leadingRegionalCompound =
      regionalOptions.length > 0
        ? [
            {
              id: 'recipe-regional',
              label: 'regional',
              options: regionalOptions,
              selectedOptionIds: regionalSelectedIds,
              onToggleOption: (optionId) => {
                const k = String(optionId || '').toLowerCase();
                if (!k) return;
                if (activeTagFilters.has(k)) activeTagFilters.delete(k);
                else activeTagFilters.add(k);
                applyRecipeCompoundFilterChange({
                  reopenCompoundId: 'recipe-regional',
                });
              },
              onClearSelection: () => {
                RECIPE_LIST_REGIONAL_KEYS.forEach((rk) => {
                  if (activeTagFilters.has(rk)) activeTagFilters.delete(rk);
                });
                applyRecipeCompoundFilterChange();
              },
              clearAriaLabel: 'Clear regional filters',
            },
          ]
        : [];
    const mealOptions = mealKeysInOrder.map((key) => ({
      id: key,
      label:
        RECIPE_LIST_MEAL_TAG_LABELS.find((l) => l.toLowerCase() === key) ||
        key,
      disabled: false,
    }));
    const mealSelectedIds = new Set(
      [...activeTagFilters].filter((k) => RECIPE_LIST_MEAL_KEYS.has(k)),
    );
    const leadingMealCompound =
      mealOptions.length > 0
        ? [
            {
              id: 'recipe-meal',
              label: 'meal',
              options: mealOptions,
              selectedOptionIds: mealSelectedIds,
              onToggleOption: (optionId) => {
                const k = String(optionId || '').toLowerCase();
                if (!k) return;
                if (activeTagFilters.has(k)) activeTagFilters.delete(k);
                else activeTagFilters.add(k);
                applyRecipeCompoundFilterChange({
                  reopenCompoundId: 'recipe-meal',
                });
              },
              onClearSelection: () => {
                RECIPE_LIST_MEAL_KEYS.forEach((mk) => {
                  if (activeTagFilters.has(mk)) activeTagFilters.delete(mk);
                });
                applyRecipeCompoundFilterChange();
              },
              clearAriaLabel: 'Clear meal filters',
            },
          ]
        : [];
    const moreCompoundSelectedIds = new Set(
      [...activeTagFilters].filter(
        (id) => id === RECIPE_LIST_NO_TAG_FILTER_CHIP_ID,
      ),
    );
    const recipeMoreCompoundChips = [
      {
        id: 'recipe-more',
        label: 'more',
        options: [
          {
            id: RECIPE_LIST_NO_TAG_FILTER_CHIP_ID,
            label: 'no tag',
            disabled: false,
          },
        ],
        selectedOptionIds: moreCompoundSelectedIds,
        onToggleOption: (optionId) => {
          const k = String(optionId || '').toLowerCase();
          if (!k) return;
          if (activeTagFilters.has(k)) activeTagFilters.delete(k);
          else activeTagFilters.add(k);
          applyRecipeCompoundFilterChange({ reopenCompoundId: 'recipe-more' });
        },
        onClearSelection: () => {
          activeTagFilters.delete(RECIPE_LIST_NO_TAG_FILTER_CHIP_ID);
          applyRecipeCompoundFilterChange();
        },
        clearAriaLabel: 'Clear more filters',
      },
    ];
    window.renderFilterChipList({
      mountEl: chipMountEl,
      reopenCompoundDropdown,
      reopenCompoundDropdownId,
      leadingCompoundChips: [...leadingMealCompound, ...leadingRegionalCompound],
      chips: [
        ...(isRecipePlannerSelectMode()
          ? [
              {
                id: RECIPE_LIST_SELECTED_FILTER_CHIP_ID,
                label: 'selected',
                disabled: false,
              },
            ]
          : []),
        ...flatNames.map((name) => ({
          id: String(name || '').toLowerCase(),
          label: String(name || ''),
          disabled: false,
        })),
      ],
      compoundChips: recipeMoreCompoundChips,
      activeChipIds: activeTagFilters,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        if (!key) return;
        if (activeTagFilters.has(key)) activeTagFilters.delete(key);
        else activeTagFilters.add(key);
        invalidateRecipesBrowseUi('userFilterToggle');
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const getActiveRecipeRegionalFilterKeys = () =>
    Array.from(activeTagFilters).filter((k) => RECIPE_LIST_REGIONAL_KEYS.has(k));

  const getActiveRecipeMealFilterKeys = () =>
    Array.from(activeTagFilters).filter((k) => RECIPE_LIST_MEAL_KEYS.has(k));

  const getActiveRecipeFlatTagFilterKeys = () =>
    Array.from(activeTagFilters).filter(
      (k) =>
        k !== RECIPE_LIST_NO_TAG_FILTER_CHIP_ID &&
        k !== RECIPE_LIST_SELECTED_FILTER_CHIP_ID &&
        !RECIPE_LIST_REGIONAL_KEYS.has(k) &&
        !RECIPE_LIST_MEAL_KEYS.has(k),
    );

  const recipeRowMatchesActiveTagFilters = (row) => {
    const tags = Array.isArray(row?.tags) ? row.tags : [];
    const rowKeys = new Set(
      tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean),
    );
    const recipeRowHasAnyTag = () =>
      tags.some((t) => String(t || '').trim());

    const regionalKeys = getActiveRecipeRegionalFilterKeys();
    const mealKeys = getActiveRecipeMealFilterKeys();
    const flatTagKeys = getActiveRecipeFlatTagFilterKeys();
    const noTagOnly = activeTagFilters.has(RECIPE_LIST_NO_TAG_FILTER_CHIP_ID);
    const selectedOnly =
      isRecipePlannerSelectMode() &&
      activeTagFilters.has(RECIPE_LIST_SELECTED_FILTER_CHIP_ID);

    const matchesRegional =
      regionalKeys.length === 0 ||
      regionalKeys.some((k) => rowKeys.has(k));
    const matchesMeal =
      mealKeys.length === 0 || mealKeys.some((k) => rowKeys.has(k));
    const matchesFlatTags =
      flatTagKeys.length === 0 || flatTagKeys.some((k) => rowKeys.has(k));
    const matchesNoTag = noTagOnly ? !recipeRowHasAnyTag() : true;
    const matchesSelected = selectedOnly ? isRecipeSelected(row.id) : true;

    return (
      matchesRegional &&
      matchesMeal &&
      matchesFlatTags &&
      matchesNoTag &&
      matchesSelected
    );
  };

  const getFilteredRecipeRows = () => {
    const q = searchQuery;
    return recipeRows.filter((row) => {
      const titleText = row.title.toLowerCase();
      const tags = Array.isArray(row.tags) ? row.tags : [];
      const tagsInline = tags.join(' ').toLowerCase();
      const searchMatches =
        !q || titleText.includes(q) || tagsInline.includes(q);
      if (!searchMatches) return false;
      if (!activeTagFilters.size) return true;
      return recipeRowMatchesActiveTagFilters(row);
    });
  };

  // 🔹 Helper to render a given set of recipes
  function renderRecipeList(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'recipes');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    // Hide servings label row in planner mode.
    // if (isPlannerModeEnabled()) {
    //   const headerLi = document.createElement('li');
    //   headerLi.className = 'recipe-list-servings-header';
    //   headerLi.setAttribute('aria-hidden', 'true');
    //   const headerSpacer = document.createElement('span');
    //   headerSpacer.className =
    //     'shopping-list-row-label recipe-list-servings-header-spacer';
    //   headerSpacer.textContent = '';
    //   const headerSlot = document.createElement('span');
    //   headerSlot.className = 'recipe-list-servings-slot';
    //   const headerLabel = document.createElement('span');
    //   headerLabel.className = 'recipe-list-servings-header-label';
    //   syncRecipeListServingsHeaderLabelText(headerLabel);
    //   headerSlot.appendChild(headerLabel);
    //   headerLi.appendChild(headerSpacer);
    //   headerLi.appendChild(headerSlot);
    //   list.appendChild(headerLi);
    // }

    const plannerSelectMode = isRecipePlannerSelectMode();
    items.forEach((row) => {
      const id = row.id;
      const title = row.title;
      const li = document.createElement('li');
      if (!plannerSelectMode) {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'shopping-list-row-label';
        const titleHit = document.createElement('span');
        titleHit.className = 'recipe-list-title-hit';
        titleHit.textContent = formatRecipeTitleForDisplay(title);
        titleSpan.appendChild(titleHit);
        titleSpan.style.fontSize = 'var(--text-bucket-list-primary)';
        li.appendChild(titleSpan);
        li.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            void deleteRecipeWithConfirm(db, id, title);
            return;
          }
          setSelectedRecipeNavigationSession(id, title);
          window.location.href =
            favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
        });
        li.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          void deleteRecipeWithConfirm(db, id, title);
        });
        window.favoriteEatsBindLongPressRemove?.(li, () => {
          void deleteRecipeWithConfirm(db, id, title);
        });
        list.appendChild(li);
        return;
      }

      primeRecipeRowServings(row);
      li.classList.add('recipe-list-planner-row');
      const headline = document.createElement('div');
      headline.className =
        'recipe-list-row-headline list-row-headline--split shopping-list-row-label';
      const titleHit = document.createElement('span');
      titleHit.className = 'recipe-list-title-hit list-row-primary';
      titleHit.textContent = formatRecipeTitleForDisplay(title);
      headline.appendChild(titleHit);
      const tail = document.createElement('span');
      tail.className = 'recipe-list-servings-tail shopping-list-doc-tail';
      tail.style.display = 'none';
      tail.appendChild(document.createTextNode('\u00a0'));
      const servingsDetail = document.createElement('span');
      servingsDetail.className =
        'recipe-list-servings-detail list-row-detail shopping-list-doc-contribution-detail';
      tail.appendChild(servingsDetail);
      headline.appendChild(tail);
      li.appendChild(headline);

      const checkbox = document.createElement('button');
      checkbox.type = 'button';
      checkbox.className =
        'recipe-list-plan-checkbox shopping-list-doc-checkbox';
      checkbox.setAttribute('role', 'checkbox');
      const checkboxIcon = document.createElement('span');
      checkboxIcon.className = 'material-symbols-outlined';
      checkboxIcon.setAttribute('aria-hidden', 'true');
      checkbox.appendChild(checkboxIcon);
      const disabledIndicator = document.createElement('span');
      disabledIndicator.className =
        'material-symbols-outlined recipe-list-servings-disabled';
      disabledIndicator.textContent = 'add_box';
      disabledIndicator.setAttribute('aria-hidden', 'true');
      const slot = document.createElement('span');
      slot.className = 'recipe-list-checkbox-slot';
      slot.appendChild(checkbox);
      slot.appendChild(disabledIndicator);
      li.appendChild(slot);

      const recipeKey = getRecipeQtyKey(id);
      li.dataset.recipeRowKey = recipeKey;
      syncRecipeRowCheckboxState(li, row);

      checkbox.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isRecipePlannerSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        const selectedNow = isRecipeSelected(id);
        void setRecipeSelected(id, !selectedNow);
      });
      slot.addEventListener('click', (event) => {
        if (event.target === checkbox || checkbox.contains(event.target)) return;
        if (!isRecipePlannerSelectMode()) return;
        if (!getRecipeRowBounds(row)) return;
        if (disabledIndicator.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        const selectedNow = isRecipeSelected(id);
        void setRecipeSelected(id, !selectedNow);
      });
      disabledIndicator.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      const promptRemoveRecipeFromPlanningList = () => {
        if (!isRecipeSelected(id)) return;
        void (async () => {
          const ok = await confirmRemoveFromPlanningList(title);
          if (!ok) return;
          await setRecipeSelected(id, false);
        })();
      };
      li.addEventListener('click', (event) => {
        if (slot.contains(event.target)) return;
        if (isPlannerModeEnabled() && isControlClickRemoveGesture(event)) {
          event.preventDefault();
          event.stopPropagation();
          promptRemoveRecipeFromPlanningList();
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          void deleteRecipeWithConfirm(db, id, title);
          return;
        }
        setSelectedRecipeNavigationSession(id, title);
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
      });

      li.addEventListener('contextmenu', (event) => {
        if (isPlannerModeEnabled()) {
          if (isControlPrimaryContextMenuGesture(event)) {
            event.preventDefault();
            event.stopPropagation();
            promptRemoveRecipeFromPlanningList();
          }
          return;
        }
        event.preventDefault();
        void deleteRecipeWithConfirm(db, id, title);
      });

      window.favoriteEatsBindLongPressRemove?.(
        li,
        () => {
          if (isPlannerModeEnabled()) {
            promptRemoveRecipeFromPlanningList();
            return;
          }
          void deleteRecipeWithConfirm(db, id, title);
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            return target instanceof Element && slot.contains(target);
          },
        },
      );

      list.appendChild(li);
    });

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  const syncAllVisibleRecipeRowStates = () => {
    list.querySelectorAll('li[data-recipe-row-key]').forEach((row) => {
      const recipeKey = String(row.dataset.recipeRowKey || '');
      if (!recipeKey) return;
      const recipeRow = getRecipeRowById(Number(recipeKey));
      if (recipeRow) {
        primeRecipeRowServings(recipeRow);
        syncRecipeRowCheckboxState(row, recipeRow);
      }
    });
  };
  const syncOneRecipeRow = (recipeId) => {
    const rid = Number(recipeId);
    if (!Number.isFinite(rid) || rid <= 0) return;
    const key = String(Math.trunc(rid));
    const rowEl = list.querySelector(
      `li[data-recipe-row-key="${CSS && CSS.escape ? CSS.escape(key) : key}"]`,
    );
    if (!(rowEl instanceof HTMLElement)) return;
    const recipeRow = getRecipeRowById(rid);
    if (recipeRow) syncRecipeRowCheckboxState(rowEl, recipeRow);
  };
  const paintRecipesBrowseMembership = () => {
    renderRecipeList(getFilteredRecipeRows());
  };
  const paintRecipesBrowseFilterChrome = () => {
    if (!isRecipeCompoundDropdownOpen() || reopenRecipeCompoundDropdownId) {
      renderTagFilterChips(recipeRows);
    }
    recipeFilterChipRail?.sync?.();
  };
  const paintRecipesBrowseVisibleRows = () => {
    syncAllVisibleRecipeRowStates();
  };
  const paintRecipesBrowseActionChrome = () => {
    syncRecipesActionButtonState();
  };
  const rerenderFilteredRecipes = () => {
    paintRecipesBrowseMembership();
    paintRecipesBrowseFilterChrome();
  };

  /** @type {object|null} */
  let recipesBrowseSession = null;
  const getRecipesBrowseContext = () => ({
    plannerSelectMode: isRecipePlannerSelectMode(),
    selectedFilterActive: activeTagFilters.has(
      RECIPE_LIST_SELECTED_FILTER_CHIP_ID,
    ),
    hasActiveTagFilters: activeTagFilters.size > 0,
  });
  const invalidateRecipesBrowseUi = (reason) => {
    const ds = window.favoriteEatsDocumentSession;
    if (
      recipesBrowseSession &&
      ds &&
      typeof ds.invalidateRecipesBrowse === 'function'
    ) {
      ds.invalidateRecipesBrowse(
        recipesBrowseSession,
        reason,
        getRecipesBrowseContext(),
      );
      return;
    }
    if (ds && typeof ds.surfacesForRecipesBrowseInvalidation === 'function') {
      const surfaces = ds.surfacesForRecipesBrowseInvalidation(
        reason,
        getRecipesBrowseContext(),
      );
      if (surfaces.includes(ds.SURFACE_MEMBERSHIP || 'membership')) {
        rerenderFilteredRecipes();
        return;
      }
      if (surfaces.includes(ds.SURFACE_VISIBLE_ROWS || 'visibleRows')) {
        paintRecipesBrowseVisibleRows();
        paintRecipesBrowseActionChrome();
        recipeFilterChipRail?.sync?.();
      }
      return;
    }
    rerenderFilteredRecipes();
  };
  const refreshRecipeSelectionUi = ({ fullRerender = true } = {}) => {
    invalidateRecipesBrowseUi(
      fullRerender ? 'catalogListChanged' : 'planSelectionChanged',
    );
  };
  const applyRecipeCompoundFilterChange = ({ reopenCompoundId = '' } = {}) => {
    reopenRecipeCompoundDropdownId = String(reopenCompoundId || '').trim();
    invalidateRecipesBrowseUi('userFilterToggle');
  };

  try {
    const ds = window.favoriteEatsDocumentSession;
    if (ds && typeof ds.createRecipesBrowseSession === 'function') {
      recipesBrowseSession = ds.createRecipesBrowseSession({
        getContext: getRecipesBrowseContext,
        paintMembership: paintRecipesBrowseMembership,
        paintFilterChrome: paintRecipesBrowseFilterChrome,
        paintVisibleRows: paintRecipesBrowseVisibleRows,
        paintActionChrome: paintRecipesBrowseActionChrome,
      });
    }
  } catch (sessionErr) {
    console.warn(
      'favoriteEatsDocumentSession: recipes browse init failed',
      sessionErr,
    );
  }

  getRecipeRootQuantityQueue();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
      if (
        recipesBrowseSession &&
        typeof recipesBrowseSession.destroy === 'function'
      ) {
        try {
          recipesBrowseSession.destroy();
        } catch (_) {}
        recipesBrowseSession = null;
      }
      const activeQueue = getRecipeRootQuantityQueue();
      if (activeQueue && typeof activeQueue.flushAll === 'function') {
        try {
          void activeQueue.flushAll();
        } catch (_) {}
      }
    });
  }
  if (recipePlannerServingsChangedEventName) {
    window.addEventListener(recipePlannerServingsChangedEventName, () => {
      invalidateRecipesBrowseUi('servingsDisplayChanged');
    });
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== window.favoriteEatsStorageKeys?.recipePlannerServings)
      return;
    invalidateRecipesBrowseUi('servingsDisplayChanged');
  });

  // Read recipes via the data service door (see js/data/contracts/listRecipes.md).
  if (!recipeRowsLoadedFromDataService) {
    try {
      recipeRows = await window.dataService.listRecipes();
    } catch (err) {
      console.error('dataService.listRecipes failed:', err);
      recipeRows = [];
    }
  } else {
    recipeRows = Array.isArray(prefetchedRecipeRows)
      ? prefetchedRecipeRows
      : [];
  }
  if (isRecipePlannerSelectMode()) {
    getRecipeRootQuantityQueue();
  } else {
    clearRecipePlannerUiState();
  }
  syncRecipesActionButtonState();
  invalidateRecipesBrowseUi('catalogListChanged');
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
  syncRecipesAppBarActionChrome();

  if (isRecipePlannerSelectMode()) {
    void (async () => {
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        try {
          await primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots();
          touchShoppingPlanRecipeSelectionsMaterialization();
        } catch (primeErr) {
          console.warn(
            'Recipes page: shopping-plan recipe cache prime/rematerialize failed:',
            primeErr,
          );
        }
      }
      if (!isRecipePlannerSelectMode()) return;
      syncRecipesActionButtonState();
      invalidateRecipesBrowseUi('planSelectionChanged');
    })();
  }

  // --- Recipes action button stub ---

  async function openCreateRecipeDialog(db) {
    if (!window.ui) return;
    if (!window.dataService?.useSupabase && !db) return;
    const vals = await window.ui.form({
      title: 'New Recipe',
      fields: [
        {
          key: 'title',
          label: 'Title',
          value: '',
          required: true,
          normalize: (v) => (v || '').trim(),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        if (!v.title || !v.title.trim()) return 'Title is required.';
        return '';
      },
    });
    if (!vals) return;

    const title = vals.title;
    let newId = null;
    try {
      const created = await window.dataService.createRecipe({ title });
      newId = created?.id;
    } catch (err) {
      console.error('❌ Failed to create recipe:', err);
      window.ui.toast({ message: 'Failed to create recipe. See console.' });
      return;
    }

    if (!window.dataService.useSupabase) {
      // Persist SQLite so editor + list can see the new recipe.
      try {
        await persistDbForCurrentRuntime(db, {
          failureMessage: 'Failed to save database after creating recipe.',
        });
      } catch (err) {
        console.error('❌ Failed to persist DB after creating recipe:', err);
        window.ui.toast({
          message: 'Failed to save database after creating recipe.',
        });
        return;
      }
    }

    if (newId != null) {
      setSelectedRecipeNavigationSession(newId, '');
      sessionStorage.setItem('selectedRecipeIsNew', '1');
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
    }
  }

  async function deleteRecipeWithConfirm(db, recipeId, title) {
    if (recipeId == null || !window.ui) return;
    if (!window.dataService?.useSupabase && !db) return;
    const ok = await window.ui.confirm({
      title: 'Delete Recipe',
      message: `Delete "${title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    try {
      await window.dataService.deleteRecipe({ id: recipeId });
    } catch (err) {
      console.error('❌ Failed to delete recipe:', err);
      window.ui.toast({ message: 'Failed to delete recipe. See console.' });
      return;
    }

    if (!window.dataService.useSupabase) {
      try {
        await persistDbForCurrentRuntime(db, {
          failureMessage: 'Failed to save database after deleting recipe.',
        });
      } catch (err) {
        console.error('❌ Failed to persist DB after deleting recipe:', err);
        window.ui.toast({
          message: 'Failed to save database after deleting recipe.',
        });
        return;
      }
    }

    recipeRows = recipeRows.filter((r) => Number(r.id) !== Number(recipeId));
    invalidateRecipesBrowseUi('catalogListChanged');
  }

  const onRecipesActionClick = () => {
    void openCreateRecipeDialog(db);
  };
  if (recipesActionBtn) {
    syncRecipesAppBarActionChrome();
    recipesActionBtn.addEventListener('click', onRecipesActionClick);
    window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, () => {
      if (!document.body.classList.contains('recipes-page')) return;
      syncRecipesAppBarActionChrome();
      rebuildRecipesMonogramMenu();
      if (isRecipePlannerSelectMode()) {
        invalidateRecipesBrowseUi('planSelectionChanged');
        void (async () => {
          if (
            shouldUseRemoteShoppingState() &&
            typeof hydrateShoppingStateFromDataService === 'function'
          ) {
            try {
              await hydrateShoppingStateFromDataService();
            } catch (err) {
              console.warn('Recipes page: planner state hydrate failed:', err);
              return;
            }
          }
          if (favoriteEatsShouldUseSupabaseDataDoor()) {
            try {
              await primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots();
              touchShoppingPlanRecipeSelectionsMaterialization();
            } catch (primeErr) {
              console.warn(
                'Recipes page: shopping-plan recipe cache prime/rematerialize failed:',
                primeErr,
              );
            }
          }
          if (!isRecipePlannerSelectMode()) return;
          syncRecipesActionButtonState();
          invalidateRecipesBrowseUi('planSelectionChanged');
        })();
      } else {
        activeTagFilters.delete(RECIPE_LIST_SELECTED_FILTER_CHIP_ID);
        clearRecipePlannerUiState();
        invalidateRecipesBrowseUi('userFilterToggle');
      }
    });
  }

  // Charter §G: after a wholesale hydrate, override any recipes with a
  // pending servings-override op in the singleton queue back to the queue's
  // pending value. Unrelated rows take the authoritative server value as
  // usual; only the in-burst row is preserved.
  const mergePendingRecipeServingsIntoLocalCache = () => {
    const queue = window.favoriteEatsPlanRecipeServingsQueue;
    if (!queue || typeof queue.peekPendingKeys !== 'function') return;
    const ring = window.favoriteEatsRecipePlannerServings;
    if (!ring || typeof ring.setStoredValue !== 'function') return;
    // Iterate the queue's active keys directly so an in-flight servings
    // change on a recipe survives even if the wholesale hydrate did not
    // include that recipe (e.g. add-to-plan + change-servings burst).
    const activeKeys = new Set(queue.peekPendingKeys());
    if (typeof queue.peekInFlightKeys === 'function') {
      queue.peekInFlightKeys().forEach((key) => activeKeys.add(key));
    }
    activeKeys.forEach((compoundKey) => {
      const parts = String(compoundKey).split(':');
      if (
        parts.length < 3 ||
        parts[0] !== 'plan' ||
        parts[parts.length - 1] !== 'servingsOverride'
      ) {
        return;
      }
      const entityKey = parts.slice(1, -1).join(':');
      const opLike = {
        surface: 'plan',
        entityKey,
        field: 'servingsOverride',
      };
      const pending = queue.getPendingOp(opLike);
      const inFlight =
        typeof queue.getInFlightOp === 'function'
          ? queue.getInFlightOp(opLike)
          : null;
      const localIntent = pending || inFlight;
      if (!localIntent) return;
      const rid = Number(entityKey);
      if (!Number.isFinite(rid) || rid <= 0) return;
      const row = getRecipeRowById(rid);
      if (!row) return;
      try {
        ring.setStoredValue(
          row,
          localIntent.value == null ? null : Number(localIntent.value),
          { fallbackRecipeId: rid },
        );
      } catch (_) {}
    });
  };

  const mergePendingRecipeRootIntoLocalCache = () => {
    const queue = getRecipeRootQuantityQueue();
    if (!queue || typeof queue.peekPendingKeys !== 'function') return;
    const activeKeys = new Set(queue.peekPendingKeys());
    if (typeof queue.peekInFlightKeys === 'function') {
      queue.peekInFlightKeys().forEach((key) => activeKeys.add(key));
    }
    activeKeys.forEach((compoundKey) => {
      const parts = String(compoundKey).split(':');
      if (
        parts.length < 3 ||
        parts[0] !== 'plan' ||
        parts[parts.length - 1] !== 'recipeRootQuantity'
      ) {
        return;
      }
      const entityKey = parts.slice(1, -1).join(':');
      const opLike = {
        surface: 'plan',
        entityKey,
        field: 'recipeRootQuantity',
      };
      const pending = queue.getPendingOp(opLike);
      const inFlight =
        typeof queue.getInFlightOp === 'function'
          ? queue.getInFlightOp(opLike)
          : null;
      const localIntent = pending || inFlight;
      if (!localIntent) return;
      const rid = Number(entityKey);
      if (!Number.isFinite(rid) || rid <= 0) return;
      const row = getRecipeRowById(rid);
      const meta =
        localIntent.meta && typeof localIntent.meta === 'object'
          ? localIntent.meta
          : {};
      const nextQty = Math.max(0, Math.min(99, Number(localIntent.value || 0)));
      const isSelected = nextQty > 0;
      setShoppingPlanRecipeRootSelection(
        {
          recipeId: rid,
          title: String(meta.title || row?.title || '').trim(),
          quantity: isSelected ? nextQty : 0,
          servingsOverride: isSelected ? meta.servingsOverride ?? null : null,
        },
        { skipRemoteSave: true },
      );
    });
  };

  registerFavoriteEatsRemotePlanUiRefreshHook(() => {
    if (!isRecipePlannerSelectMode()) return;
    mergePendingRecipeRootIntoLocalCache();
    mergePendingRecipeServingsIntoLocalCache();
    invalidateRecipesBrowseUi('planRemoteRefresh');
  });

  let recipeCatalogRealtimeDebounce = null;
  const scheduleRecipeCatalogListRefresh = () => {
    if (recipeCatalogRealtimeDebounce) {
      clearTimeout(recipeCatalogRealtimeDebounce);
    }
    recipeCatalogRealtimeDebounce = setTimeout(() => {
      recipeCatalogRealtimeDebounce = null;
      void (async () => {
        try {
          window.dataService.useSupabase = true;
          const next = await window.dataService.listRecipes();
          recipeRows = Array.isArray(next) ? next : [];
          invalidateRecipesBrowseUi('catalogListChanged');
        } catch (err) {
          console.warn('Recipe list refresh (catalog realtime) failed:', err);
        }
      })();
    }, 320);
  };

  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    typeof window.dataService.subscribeRecipeCatalogChanges === 'function'
  ) {
    try {
      window.dataService.useSupabase = true;
      setRecipeCatalogRealtimeUnsub(
        window.dataService.subscribeRecipeCatalogChanges({
          channelKey: 'recipes-list',
          onChange: (payload) => {
            scheduleRecipeCatalogListRefresh();
            void payload;
          },
        }),
      );
    } catch (err) {
      console.warn('subscribeRecipeCatalogChanges failed:', err);
    }
  }

  window.addEventListener(
    'pagehide',
    () => {
      if (recipeCatalogRealtimeDebounce) {
        clearTimeout(recipeCatalogRealtimeDebounce);
        recipeCatalogRealtimeDebounce = null;
      }
      delete window.favoriteEatsMonogramMenuExtraButtons;
      delete window.favoriteEatsSyncMonogramMenuExtraButtons;
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

  global.favoriteEatsRecipesPage = {
    registerFavoriteEatsRecipesPageDeps,
    loadRecipesPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
