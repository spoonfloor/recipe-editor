// Shared SQL.js init (offline / local version)
let SQL;
/** @type {Promise<void> | null} */
let sqlJsInitPromise = null;

const SQL_JS_CDN_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist';

/**
 * Loads sql.js once from jsDelivr (same major as devDependency). Required before SQL.Database.
 */
async function ensureSqlJsReady() {
  if (typeof SQL !== 'undefined' && SQL && typeof SQL.Database === 'function') {
    return;
  }
  if (!sqlJsInitPromise) {
    sqlJsInitPromise = (async () => {
      const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
      if (typeof globalObj.initSqlJs !== 'function') {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `${SQL_JS_CDN_BASE}/sql-wasm.js`;
          s.async = true;
          s.crossOrigin = 'anonymous';
          s.onload = () => resolve(undefined);
          s.onerror = () =>
            reject(new Error('Failed to load sql.js from jsDelivr'));
          (document.head || document.documentElement).appendChild(s);
        });
      }
      const init = globalObj.initSqlJs;
      if (typeof init !== 'function') {
        throw new Error('initSqlJs is not available after loading sql.js');
      }
      SQL = await init({
        locateFile: (file) => `${SQL_JS_CDN_BASE}/${file}`,
      });
    })();
  }
  await sqlJsInitPromise;
}

// Set by loadStoresPage: if Cmd+↑/↓ should reorder a selected row instead of changing tabs.
/** @type {null | ((e: KeyboardEvent) => boolean)} */
let consumeCmdVerticalArrowBeforeTopLevelNav = null;

// --- Unified user messaging helpers (dialogs/toasts) ---
function uiToast(message, opts = {}) {
  try {
    if (window.ui && typeof window.ui.toast === 'function') {
      return window.ui.toast({ message: String(message || ''), ...opts });
    }
  } catch (_) {}
  try {
    // Fallback for early boot / missing ui
    alert(String(message || ''));
  } catch (_) {}
  return null;
}
function fePageLoadFoodIconBegin(pageId) {
  try {
    return window.pageLoadFoodIcon?.begin?.(pageId) === true;
  } catch (_) {
    return false;
  }
}

function fePageLoadFoodIconFinish() {
  try {
    window.pageLoadFoodIcon?.finish?.();
  } catch (_) {}
}

function fePageLoadFoodIconFail() {
  try {
    window.pageLoadFoodIcon?.fail?.();
  } catch (_) {}
}


/** User-visible failure when `save_shopping_state` does not complete (queued or awaited). */
function toastSaveShoppingStateFailed(err, request) {
  const keys =
    request && typeof request === 'object' && !Array.isArray(request)
      ? Object.keys(request)
      : [];
  const bits = [];
  if (keys.includes('plan')) bits.push('meal plan');
  if (keys.includes('shoppingListDoc')) bits.push('shopping list');
  const what = bits.length ? bits.join(' and ') : 'data';
  uiToast(
    `Could not save ${what} to the server. This change may disappear after refresh. Check your connection and try again.`,
  );
  if (err) console.error('saveShoppingState failed:', err);
}

function favoriteEatsFormatRecipeTitleForDisplay(rawTitle) {
  return String(rawTitle || '')
    .replace(/'/g, '\u2019')
    .replace(/--/g, '\u2014')
    .replace(/\.{3}/g, '\u2026');
}

if (typeof window !== 'undefined') {
  window.favoriteEatsFormatRecipeTitleForDisplay =
    favoriteEatsFormatRecipeTitleForDisplay;
}

/** Session keys for navigating into recipeEditor.html; firstPaintAppBar reads the title. */
function setSelectedRecipeNavigationSession(recipeId, displayTitleRaw) {
  sessionStorage.setItem('selectedRecipeId', String(recipeId));
  let stored = '';
  if (displayTitleRaw != null) {
    const raw = String(displayTitleRaw).trim();
    if (raw) stored = favoriteEatsFormatRecipeTitleForDisplay(raw);
  }
  try {
    if (stored) sessionStorage.setItem('selectedRecipeTitle', stored);
    else sessionStorage.removeItem('selectedRecipeTitle');
  } catch (_) {}
}

// --- App-wide co-presence toast (event/cohort-based; identity→cohort timing in utils.js) ---
const FAVORITE_EATS_APP_ACTIVITY_SESSION_KEY =
  'favoriteEats.appActivityPresence.tabKey';
const FAVORITE_EATS_SESSION_LOGIN_GATE_KEY = 'favoriteEats.sessionLoginAllowed';
const FAVORITE_EATS_LOGIN_SESSION_ID_KEY = 'favoriteEats.loginSessionId';
const FAVORITE_EATS_JUST_LOGGED_IN_FROM_WELCOME_KEY =
  'favoriteEats.justLoggedInFromWelcome';
/** Delay before welcome landing “Logged in as …” toast (must match recipePresenceMoniker). */
const FAVORITE_EATS_WELCOME_IDENTITY_TOAST_DELAY_MS = 250;
let favoriteEatsAppCoPresenceDeferTimer = null;
let favoriteEatsAppCoPresenceDeferPayload = null;

function favoriteEatsEmitAppActivityCoPresenceToast(
  moniker,
  additionalOthersCount = 0,
) {
  try {
    if (
      typeof window.favoriteEatsConsumeCoPresenceLoginEventArm !== 'function' ||
      !window.favoriteEatsConsumeCoPresenceLoginEventArm()
    ) {
      return;
    }
    const label = String(moniker || '').trim();
    if (!label) return;
    if (!window.ui || typeof window.ui.toast !== 'function') return;
    if (document && document.visibilityState === 'hidden') return;
    const extra = Math.max(0, Math.floor(Number(additionalOthersCount) || 0));
    if (
      window.presenceToastMessage &&
      typeof window.presenceToastMessage.buildPresenceAlsoEditingFragment ===
        'function'
    ) {
      const frag = window.presenceToastMessage.buildPresenceAlsoEditingFragment(
        label,
        extra,
        {
          linkClass: 'recipe-presence-toast-link',
          onOthersClick: () => {
            try {
              if (
                typeof window.favoriteEatsOpenContributorsModalWithList ===
                'function'
              ) {
                let list = [];
                try {
                  list = Array.isArray(
                    window.favoriteEatsAppActivityOtherMonikers,
                  )
                    ? window.favoriteEatsAppActivityOtherMonikers.slice()
                    : [];
                } catch (_) {}
                window.favoriteEatsOpenContributorsModalWithList(list);
              }
            } catch (_) {}
          },
        },
      );
      window.ui.toast({
        message: '',
        messageNode: frag,
        toastClass: 'recipe-presence-toast',
      });
      return;
    }
    window.ui.toast({
      message:
        extra === 0
          ? label + ' is also active'
          : label +
            ' (+ ' +
            extra +
            ' other' +
            (extra === 1 ? '' : 's') +
            ') are also active',
      toastClass: 'recipe-presence-toast',
    });
  } catch (_) {}
}

function favoriteEatsMaybeToastCrossSessionMoniker(
  moniker,
  additionalOthersCount = 0,
) {
  const emit = () => {
    favoriteEatsEmitAppActivityCoPresenceToast(moniker, additionalOthersCount);
  };

  try {
    const earliest = Number(window.favoriteEatsCoPresenceEarliestOkAtTs) || 0;
    const now = Date.now();
    if (earliest > 0 && now < earliest) {
      const delay = earliest - now;
      if (favoriteEatsAppCoPresenceDeferTimer) {
        try {
          clearTimeout(favoriteEatsAppCoPresenceDeferTimer);
        } catch (_) {}
      }
      favoriteEatsAppCoPresenceDeferPayload = {
        moniker,
        additionalOthersCount,
      };
      favoriteEatsAppCoPresenceDeferTimer = window.setTimeout(() => {
        favoriteEatsAppCoPresenceDeferTimer = null;
        const p = favoriteEatsAppCoPresenceDeferPayload;
        favoriteEatsAppCoPresenceDeferPayload = null;
        if (!p) return;
        favoriteEatsEmitAppActivityCoPresenceToast(
          p.moniker,
          p.additionalOthersCount,
        );
      }, delay);
      return;
    }
  } catch (_) {}

  if (favoriteEatsAppCoPresenceDeferTimer) {
    try {
      clearTimeout(favoriteEatsAppCoPresenceDeferTimer);
    } catch (_) {}
    favoriteEatsAppCoPresenceDeferTimer = null;
    favoriteEatsAppCoPresenceDeferPayload = null;
  }
  emit();
}

function favoriteEatsGetAppActivityPresenceKey() {
  try {
    if (typeof sessionStorage === 'undefined')
      return 'app-' + String(Date.now());
    const existing = sessionStorage.getItem(
      FAVORITE_EATS_APP_ACTIVITY_SESSION_KEY,
    );
    if (existing) return existing;
    const id =
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : 'app-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
    sessionStorage.setItem(FAVORITE_EATS_APP_ACTIVITY_SESSION_KEY, id);
    return id;
  } catch (_) {
    return 'app-fallback';
  }
}

function favoriteEatsGetLoginSessionId() {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    const fromSession = String(
      sessionStorage.getItem(FAVORITE_EATS_LOGIN_SESSION_ID_KEY) || '',
    ).trim();
    if (fromSession) return fromSession;
    if (typeof localStorage === 'undefined') return '';
    const legacy = String(
      localStorage.getItem(FAVORITE_EATS_LOGIN_SESSION_ID_KEY) || '',
    ).trim();
    if (!legacy) return '';
    try {
      sessionStorage.setItem(FAVORITE_EATS_LOGIN_SESSION_ID_KEY, legacy);
      localStorage.removeItem(FAVORITE_EATS_LOGIN_SESSION_ID_KEY);
    } catch (_) {}
    return legacy;
  } catch (_) {
    return '';
  }
}

function favoriteEatsHasSessionLoginGate() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.favoriteEatsGate &&
      typeof window.favoriteEatsGate.hasAccess === 'function' &&
      window.favoriteEatsGate.hasAccess()
    ) {
      return true;
    }
  } catch (_) {}
  try {
    return (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(FAVORITE_EATS_SESSION_LOGIN_GATE_KEY) === '1'
    );
  } catch (_) {
    return false;
  }
}

function favoriteEatsShouldRequireSessionGateForPage(pageId) {
  const key = String(pageId || '')
    .trim()
    .toLowerCase();
  if (!key) return false;
  return key !== 'welcome' && key !== 'web-db-error';
}

function uiAlert(title, message, options = {}) {
  const messageNode =
    options && options.messageNode instanceof Node ? options.messageNode : null;
  try {
    if (window.ui && typeof window.ui.alert === 'function') {
      return window.ui.alert({
        title: String(title || ''),
        message: String(message || ''),
        messageNode,
      });
    }
  } catch (_) {}
  try {
    alert(String(message || ''));
  } catch (_) {}
  return Promise.resolve(true);
}

async function uiConfirm({
  title = 'Confirm',
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  try {
    if (window.ui && typeof window.ui.confirm === 'function') {
      return await window.ui.confirm({
        title,
        message,
        confirmText,
        cancelText,
        danger,
      });
    }
  } catch (_) {}
  try {
    return window.confirm(String(message || 'Are you sure?'));
  } catch (_) {}
  return false;
}

function classifyMenuPlanItemRemoveCase({ hasDirect = false, hasRecipe = false } = {}) {
  const direct = !!hasDirect;
  const recipe = !!hasRecipe;
  if (direct && !recipe) return 'direct-only';
  if (!direct && recipe) return 'recipe-only';
  if (direct && recipe) return 'mixed';
  return 'none';
}

function buildMenuPlanItemRemoveRecipeLinksNode(recipes) {
  const linksWrap = document.createElement('div');
  linksWrap.className = 'shopping-remove-dialog-links';
  (Array.isArray(recipes) ? recipes : []).forEach((recipe) => {
    const recipeId = Number(recipe?.id);
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'shopping-remove-dialog-link';
    a.textContent =
      String(recipe?.title || '').trim() ||
      (Number.isFinite(recipeId) && recipeId > 0
        ? `Recipe ${Math.trunc(recipeId)}`
        : 'Recipe');
    a.addEventListener('click', (event) => {
      event.preventDefault();
      if (
        Number.isFinite(recipeId) &&
        recipeId > 0 &&
        typeof window.openRecipe === 'function'
      ) {
        window.openRecipe(Math.trunc(recipeId), recipe?.title || '');
      }
    });
    linksWrap.appendChild(a);
  });
  return linksWrap;
}

async function promptRemoveItemFromMenuPlan({
  displayName = '',
  hasDirect = false,
  hasRecipe = false,
  recipeContributors = [],
  removeDirect = null,
} = {}) {
  const name = String(displayName || '').trim();
  if (!name) return false;

  const removeCase = classifyMenuPlanItemRemoveCase({ hasDirect, hasRecipe });
  if (removeCase === 'none') return false;

  const recipes = Array.isArray(recipeContributors) ? recipeContributors : [];
  const recipeCount = recipes.length;
  const thisTheseRecipes = recipeCount === 1 ? 'this recipe' : 'these recipes';
  const theRecipes = recipeCount === 1 ? 'the recipe' : 'the recipes';

  if (removeCase === 'recipe-only') {
    const usageLine =
      recipeCount === 1
        ? `The item '${name}' is used in this recipe:`
        : `The item '${name}' is used in these recipes:`;
    const details = document.createElement('div');
    details.className = 'shopping-remove-dialog-details';
    if (recipeCount > 0) {
      details.appendChild(buildMenuPlanItemRemoveRecipeLinksNode(recipes));
    }
    const note = document.createElement('div');
    note.className = 'shopping-remove-dialog-note';
    note.textContent = `To remove it, first remove ${theRecipes} above from your menu plan.`;
    details.appendChild(note);

    if (window.ui && typeof window.ui.dialog === 'function') {
      await window.ui.dialog({
        title: 'Remove item',
        message: usageLine,
        messageNode: details,
        confirmText: 'OK',
        showCancel: false,
      });
    } else {
      await uiConfirm({
        title: 'Remove item',
        message: `${usageLine} To remove it, first remove ${theRecipes} above from your menu plan.`,
        confirmText: 'OK',
        cancelText: 'Cancel',
      });
    }
    return false;
  }

  let message = '';
  let messageNode = null;
  let confirmText = 'Remove';

  if (removeCase === 'direct-only') {
    message = `Remove '${name}' from menu plan? This will set the item quantity to zero and remove it from your shopping list.`;
  } else {
    message = `Remove '${name}'? This item has been added directly and also appears in ${thisTheseRecipes}:`;
    const details = document.createElement('div');
    details.className = 'shopping-remove-dialog-details';
    if (recipeCount > 0) {
      details.appendChild(buildMenuPlanItemRemoveRecipeLinksNode(recipes));
    }
    const note = document.createElement('div');
    note.className = 'shopping-remove-dialog-note';
    note.textContent = `To remove it entirely, first remove ${theRecipes} above from your menu plan. Or, you can remove just the directly added amount.`;
    details.appendChild(note);
    messageNode = details;
    confirmText = 'Remove direct amount';
  }

  let ok = false;
  if (window.ui && typeof window.ui.dialog === 'function') {
    const res = await window.ui.dialog({
      title: 'Remove item',
      message,
      ...(messageNode ? { messageNode } : {}),
      confirmText,
      cancelText: 'Cancel',
      danger: true,
    });
    ok = !!res;
  } else {
    ok = await uiConfirm({
      title: 'Remove item',
      message,
      confirmText,
      cancelText: 'Cancel',
      danger: true,
    });
  }

  if (!ok) return false;
  if (typeof removeDirect === 'function') {
    await removeDirect();
  }
  return true;
}

async function confirmRemoveFromPlanningList(displayName) {
  const name = String(displayName || '').trim();
  if (!name) return false;
  return uiConfirm({
    title: 'Remove from list',
    message: `Remove "${name}" from your shopping list?`,
    confirmText: 'Remove',
    cancelText: 'Cancel',
    danger: true,
  });
}

async function confirmShoppingListRowRemove(displayName) {
  const name = String(
    splitShoppingListRowTextToLabelAndDetail(displayName).label || '',
  ).trim();
  if (!name) return false;
  return uiConfirm({
    title: 'Remove item?',
    message: `Remove "${name}" from your shopping list? It will be moved to the bottom of your list, where you can restore it later.`,
    confirmText: 'Remove',
    cancelText: 'Cancel',
    danger: true,
  });
}

async function confirmShoppingListRowRestore(displayName) {
  const name = String(
    splitShoppingListRowTextToLabelAndDetail(displayName).label || '',
  ).trim();
  if (!name) return false;
  return uiConfirm({
    title: 'Restore item?',
    message: `Restore "${name}" to your shopping list?`,
    confirmText: 'Restore',
    cancelText: 'Cancel',
  });
}

async function confirmShoppingListRestoreAll() {
  return uiConfirm({
    title: 'Restore all items?',
    message: 'Restore all items to your shopping list?',
    confirmText: 'Restore',
    cancelText: 'Cancel',
  });
}

function isControlClickRemoveGesture(event) {
  return !!(
    event &&
    event.type === 'click' &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    Number(event.button) === 0
  );
}

// macOS Ctrl+primary click can emit contextmenu instead of click — treat the same.
function isControlPrimaryContextMenuGesture(event) {
  return !!(
    event &&
    event.type === 'contextmenu' &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    Number(event.button) === 0
  );
}

function cloneForUndo(value, fallbackFactory = () => null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return typeof fallbackFactory === 'function' ? fallbackFactory() : null;
  }
}

function uiToastUndo(message, onUndo, { timeoutMs = 3500 } = {}) {
  if (typeof onUndo !== 'function') return uiToast(message);
  try {
    const um = window.undoManager;
    if (um && typeof um.push === 'function') {
      return um.push({
        message: String(message || ''),
        undo: onUndo,
        timeoutMs,
      });
    }
  } catch (_) {}
  return uiToast(message, {
    actionText: 'Undo',
    onAction: onUndo,
    timeoutMs,
  });
}

const FAVORITE_EATS_BUILD_DEFAULTS = Object.freeze({
  target: 'desktop',
  plannerExperience: false,
  allowHiddenPlannerModeToggle: true,
});

function readFavoriteEatsBuildConfig() {
  try {
    const raw = window.__FAVORITE_EATS_BUILD__;
    if (!raw || typeof raw !== 'object') {
      return { ...FAVORITE_EATS_BUILD_DEFAULTS };
    }
    const target = String(raw.target || FAVORITE_EATS_BUILD_DEFAULTS.target)
      .trim()
      .toLowerCase();
    return {
      ...FAVORITE_EATS_BUILD_DEFAULTS,
      ...raw,
      target: target === 'web' ? 'web' : FAVORITE_EATS_BUILD_DEFAULTS.target,
      plannerExperience:
        raw.plannerExperience === true || raw.forceWebExperience === true,
      allowHiddenPlannerModeToggle:
        raw.allowHiddenPlannerModeToggle !== false &&
        raw.allowHiddenForceWebModeToggle !== false,
    };
  } catch (_) {
    return { ...FAVORITE_EATS_BUILD_DEFAULTS };
  }
}

const FAVORITE_EATS_BUILD = Object.freeze(readFavoriteEatsBuildConfig());
/* '1' = planner layout on; absent or '0' = off (editing).
   Default is editing until the user turns planner layout on via the nav switch or shortcut. */
const PLANNER_LAYOUT_STORAGE_KEY = 'favoriteEatsPlannerModeOn';
/** Prior key — read once when migrating (see `isPlannerModeEnabled`). */
const PLANNER_LAYOUT_STORAGE_KEY_LEGACY = 'favoriteEatsPlannerOn';
/** Dispatched on `window` when planner layout flips. `detail.enabled` is a boolean. */
const FAVORITE_EATS_PLANNER_MODE_EVENT = 'favoriteEatsPlannerModeChanged';
// Only enforced when isPublicPlannerExperienceLocked() (GitHub Pages / dist/web with injected
// __FAVORITE_EATS_BUILD__). Recipe editor is allowed on public web: dist/web ships recipeEditor.html.
const PUBLIC_WEB_PAGE_REDIRECTS = Object.freeze({
  tags: 'recipes',
  'tag-editor': 'recipes',
  units: 'recipes',
  'unit-editor': 'recipes',
  'unitless-items': 'recipes',
  sizes: 'recipes',
  'size-editor': 'recipes',
  'shopping-editor': 'shopping',
  'store-editor': 'stores',
});

function isPublicPlannerExperienceLocked() {
  return (
    FAVORITE_EATS_BUILD.target === 'web' &&
    FAVORITE_EATS_BUILD.plannerExperience
  );
}

function isDemoSessionActive() {
  try {
    return (
      typeof window.favoriteEatsIsDemoSession === 'function' &&
      window.favoriteEatsIsDemoSession()
    );
  } catch (_) {
    return false;
  }
}

function isPlannerExperienceLockedForApp() {
  if (isDemoSessionActive()) return true;
  return isPublicPlannerExperienceLocked();
}

function isHiddenPlannerModeToggleAllowed() {
  return (
    !isPlannerExperienceLockedForApp() &&
    FAVORITE_EATS_BUILD.allowHiddenPlannerModeToggle !== false
  );
}

function getPublicWebRedirectPageId(
  pageId = document.body?.dataset?.page || '',
) {
  if (!isPlannerExperienceLockedForApp()) return '';
  const key = String(pageId || '')
    .trim()
    .toLowerCase();
  if (!key) return '';
  return PUBLIC_WEB_PAGE_REDIRECTS[key] || '';
}

function redirectIfPublicWebPageIsDisallowed() {
  const redirectPageId = getPublicWebRedirectPageId();
  if (!redirectPageId) return false;
  window.location.replace(getTopLevelPageHref(redirectPageId));
  return true;
}

function isPlannerModeEnabled() {
  if (isPlannerExperienceLockedForApp()) return true;
  try {
    const v = localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY);
    if (v === '1' || v === '0') return v === '1';
    const legacy = localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY_LEGACY);
    if (legacy === '1' || legacy === '0') {
      try {
        localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, legacy);
      } catch (_) {}
      return legacy === '1';
    }
    return false;
  } catch (_) {
    return false;
  }
}

/** Wide recipe-list servings header from this width; keep in sync with `css/styles.css`. */
const RECIPE_LIST_SERVINGS_HEADER_WIDE_MIN_PX = 620;

/** @type {MediaQueryList | null} */
let recipeListServingsHeaderCompactMq = null;

function recipeListServingsHeaderCompactMqList() {
  if (recipeListServingsHeaderCompactMq)
    return recipeListServingsHeaderCompactMq;
  if (typeof window.matchMedia !== 'function') return null;
  recipeListServingsHeaderCompactMq = window.matchMedia(
    `(max-width: ${RECIPE_LIST_SERVINGS_HEADER_WIDE_MIN_PX - 1}px)`,
  );
  return recipeListServingsHeaderCompactMq;
}

function syncRecipeListServingsHeaderLabelText(headerLabel) {
  if (!headerLabel) return;
  const mq = recipeListServingsHeaderCompactMqList();
  const compact = mq ? mq.matches : false;
  headerLabel.textContent = compact ? 'svgs' : 'servings';
}

let recipeListServingsHeaderLabelMqBound = false;

function ensureRecipeListServingsHeaderLabelMediaListener() {
  const mq = recipeListServingsHeaderCompactMqList();
  if (!mq || recipeListServingsHeaderLabelMqBound) return;
  recipeListServingsHeaderLabelMqBound = true;
  const onChange = () => {
    const label = document.querySelector(
      'body.recipes-page #recipeList .recipe-list-servings-header-label',
    );
    syncRecipeListServingsHeaderLabelText(label);
  };
  try {
    mq.addEventListener('change', onChange);
  } catch (_) {
    mq.addListener(onChange);
  }
}

function applyPlannerModePresentation(enabled = isPlannerModeEnabled()) {
  const body = document.body;
  if (!(body instanceof HTMLElement)) return !!enabled;

  const plannerLayoutOn = !!enabled;
  body.dataset.plannerMode = plannerLayoutOn ? 'on' : 'off';
  body.dataset.pageSet = plannerLayoutOn ? 'planner' : 'editor';
  body.classList.toggle('planner-mode', plannerLayoutOn);
  applyDocumentThemePlatform(plannerLayoutOn);

  // Planner list pages: Save in app bar; clear actions live in the monogram menu.
  try {
    const addBtn = document.getElementById('appBarAddBtn');
    const saveBtn = document.getElementById('appBarSaveBtn');
    if (
      body.classList.contains('recipes-page') ||
      body.classList.contains('shopping-page')
    ) {
      if (addBtn instanceof HTMLButtonElement) {
        if (plannerLayoutOn) {
          addBtn.style.display = 'none';
        } else {
          addBtn.style.display = '';
          ensureAppBarTextActionPair(addBtn, 'Add', 'add');
        }
      }
      if (saveBtn instanceof HTMLButtonElement) {
        if (plannerLayoutOn) {
          saveBtn.style.display = 'inline-flex';
          saveBtn.setAttribute('aria-hidden', 'false');
          ensureAppBarTextActionPair(saveBtn, 'Save', 'check_circle');
        } else {
          saveBtn.style.display = 'none';
          saveBtn.setAttribute('aria-hidden', 'true');
        }
      }
    } else if (body.classList.contains('stores-page')) {
      if (addBtn instanceof HTMLButtonElement) {
        if (plannerLayoutOn) {
          ensureAppBarTextActionPair(addBtn, 'Clear items', 'cancel');
        } else {
          ensureAppBarTextActionPair(addBtn, 'Add', 'add');
        }
      }
    }
  } catch (_) {}

  return plannerLayoutOn;
}

function setPlannerModeEnabled(enabled) {
  if (isPlannerExperienceLockedForApp()) {
    return applyPlannerModePresentation(true);
  }
  const was = isPlannerModeEnabled();
  const next = !!enabled;
  if (was === next) {
    return applyPlannerModePresentation(next);
  }
  try {
    localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, next ? '1' : '0');
    localStorage.removeItem(PLANNER_LAYOUT_STORAGE_KEY_LEGACY);
  } catch (_) {}
  const result = applyPlannerModePresentation(next);
  try {
    window.dispatchEvent(
      new CustomEvent(FAVORITE_EATS_PLANNER_MODE_EVENT, {
        detail: { enabled: next },
      }),
    );
  } catch (_) {}
  return result;
}

function getTopLevelPageOrder() {
  return isPlannerModeEnabled()
    ? ['recipes', 'shopping', 'stores', 'shopping-list']
    : ['recipes', 'shopping', 'stores', 'tags', 'sizes', 'units'];
}

function getTopLevelPageHref(pageId) {
  const key = String(pageId || '')
    .trim()
    .toLowerCase();
  if (!key) return 'index.html';
  if (key === 'shopping-list') return 'shoppingList.html';
  return `${key}.html`;
}

/** Planner layout off → editor (purple accent); planner layout on → planner chrome (#e55939 family). */
function applyDocumentThemePlatform(planner = isPlannerModeEnabled()) {
  const root = document.documentElement;
  if (!(root instanceof HTMLElement)) return;
  root.dataset.platform = planner ? 'planner' : 'editor';
}

if (!redirectIfPublicWebPageIsDisallowed()) {
  applyPlannerModePresentation();
}
window.plannerMode = Object.freeze({
  isEnabled: isPlannerModeEnabled,
  setEnabled: setPlannerModeEnabled,
  apply: applyPlannerModePresentation,
});

function isTypingContext(target) {
  const el = target instanceof Element ? target : null;
  const active =
    document.activeElement instanceof Element ? document.activeElement : null;

  const selector =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

  return !!(el?.closest(selector) || active?.closest(selector));
}

function isAppBarSearchContext(target) {
  const el = target instanceof Element ? target : null;
  const active =
    document.activeElement instanceof Element ? document.activeElement : null;
  return !!(
    el?.closest?.('#appBarSearchInput') ||
    active?.closest?.('#appBarSearchInput')
  );
}

function isModalOpen() {
  try {
    if (window.ui && typeof window.ui.isDialogOpen === 'function') {
      return !!window.ui.isDialogOpen();
    }
  } catch (_) {}
  // Legacy fallback (older static modals)
  return !!document.querySelector('.modal:not(.hidden)');
}

const typeToAppBarSearchControllers = new WeakMap();
const appBarSearchControllers = new WeakMap();

function wireTypeToAppBarSearch(searchInput) {
  if (!(searchInput instanceof HTMLInputElement)) return;
  const priorController = typeToAppBarSearchControllers.get(searchInput);
  try {
    priorController?.abort();
  } catch (_) {}
  const controller = new AbortController();
  typeToAppBarSearchControllers.set(searchInput, controller);

  const onKeyDown = (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.defaultPrevented) return;
    if (e.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== ' ' && e.shiftKey) return;
    if (e.key.length !== 1) return;
    if (isModalOpen()) return;
    if (document.activeElement?.closest?.('.bottom-nav')) return;
    if (isAppBarSearchContext(e.target)) return;
    if (isTypingContext(e.target)) return;

    e.preventDefault();

    const start =
      typeof searchInput.selectionStart === 'number'
        ? searchInput.selectionStart
        : searchInput.value.length;
    const end =
      typeof searchInput.selectionEnd === 'number'
        ? searchInput.selectionEnd
        : searchInput.value.length;
    const nextValue =
      searchInput.value.slice(0, start) +
      e.key +
      searchInput.value.slice(Math.max(start, end));

    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      setCompactWebAppBarSearchExpanded(true);
    }
    searchInput.focus();
    searchInput.value = nextValue;

    try {
      const caret = start + e.key.length;
      searchInput.setSelectionRange(caret, caret);
    } catch (_) {}

    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  document.addEventListener('keydown', onKeyDown, {
    capture: true,
    signal: controller.signal,
  });
}

function wireAppBarSearch(searchInput, options = {}) {
  if (!(searchInput instanceof HTMLInputElement)) return null;
  const priorController = appBarSearchControllers.get(searchInput);
  try {
    priorController?.abort();
  } catch (_) {}
  const controller = new AbortController();
  appBarSearchControllers.set(searchInput, controller);

  const {
    clearBtn = document.getElementById('appBarSearchClear'),
    toggleBtn = document.getElementById('appBarSearchToggleBtn'),
    onQueryChange = null,
    normalizeQuery = (value) => String(value || '').trim(),
    enableTypeToSearch = true,
  } = options;

  if (enableTypeToSearch) wireTypeToAppBarSearch(searchInput);

  const isCompactExpanded = () =>
    typeof isCompactWebAppBarSearchExpanded === 'function' &&
    isCompactWebAppBarSearchExpanded();

  const hasActiveQuery = () => !!normalizeQuery(searchInput.value);

  const expandCompactSearch = ({ focusInput = true } = {}) => {
    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      return !!setCompactWebAppBarSearchExpanded(true, { focusInput });
    }
    if (focusInput) searchInput.focus();
    return false;
  };

  const collapseCompactSearch = ({ restoreFocus = false } = {}) => {
    if (hasActiveQuery()) return false;
    if (typeof setCompactWebAppBarSearchExpanded === 'function') {
      return !!setCompactWebAppBarSearchExpanded(false, { restoreFocus });
    }
    if (restoreFocus && toggleBtn instanceof HTMLButtonElement) {
      toggleBtn.focus();
    }
    return false;
  };

  const syncCompactSearchExpansion = () => {
    if (hasActiveQuery() && !isCompactExpanded()) {
      expandCompactSearch({ focusInput: false });
    }
  };

  const syncClearBtn = () => {
    if (!(clearBtn instanceof HTMLElement)) return;
    const compactExpanded = isCompactExpanded();
    clearBtn.style.display =
      searchInput.value || compactExpanded ? 'inline-flex' : 'none';
    clearBtn.setAttribute(
      'aria-label',
      searchInput.value ? 'Clear search' : 'Close search',
    );
    syncCompactSearchExpansion();
  };

  const emitQueryChange = () => {
    syncClearBtn();
    if (typeof onQueryChange === 'function') {
      onQueryChange(normalizeQuery(searchInput.value), searchInput.value);
    }
  };

  syncClearBtn();
  searchInput.addEventListener('input', emitQueryChange, {
    signal: controller.signal,
  });

  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.addEventListener(
      'click',
      () => {
        expandCompactSearch();
        syncClearBtn();
      },
      { signal: controller.signal },
    );
  }

  if (clearBtn instanceof HTMLElement) {
    clearBtn.addEventListener(
      'click',
      () => {
        if (searchInput.value) {
          searchInput.value = '';
          emitQueryChange();
          searchInput.focus();
          return;
        }
        collapseCompactSearch({ restoreFocus: true });
        syncClearBtn();
      },
      { signal: controller.signal },
    );
  }

  searchInput.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (searchInput.value) {
          searchInput.value = '';
          emitQueryChange();
        }
        if (isCompactExpanded()) {
          collapseCompactSearch({ restoreFocus: true });
          syncClearBtn();
        } else {
          searchInput.blur();
        }
      }
    },
    { signal: controller.signal },
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!isCompactExpanded()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest('.app-bar-wrapper')) return;
      collapseCompactSearch();
      syncClearBtn();
    },
    {
      capture: true,
      signal: controller.signal,
    },
  );

  window.addEventListener(
    'resize',
    () => {
      if (
        typeof isCompactWebAppBarModeActive === 'function' &&
        !isCompactWebAppBarModeActive()
      ) {
        collapseCompactSearch();
      }
      syncClearBtn();
    },
    { signal: controller.signal },
  );

  return {
    clearBtn,
    toggleBtn,
    syncClearBtn,
    emitQueryChange,
    expandCompactSearch,
    collapseCompactSearch,
  };
}

const TOP_LEVEL_EMPTY_STATE_MESSAGES = Object.freeze({
  recipes: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  shoppingItems: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  shoppingList: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  searchNoMatch: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  units: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  tags: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  sizes: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
  stores: Object.freeze({
    diagnosis: 'utter emptiness.',
    cta: 'total bliss.',
  }),
});

function setTopLevelEmptyStateLayoutMode(listEl, isEmpty) {
  if (!(listEl instanceof HTMLElement)) return;
  listEl.classList.toggle('is-top-level-empty', !!isEmpty);
}

function resolveTopLevelEmptyStateMessage(messageOrKey) {
  if (
    messageOrKey &&
    typeof messageOrKey === 'object' &&
    !Array.isArray(messageOrKey)
  ) {
    return {
      diagnosis: String(messageOrKey.diagnosis || '').trim(),
      cta: String(messageOrKey.cta || '').trim(),
    };
  }
  const messageKey = String(messageOrKey || '').trim();
  if (messageKey && TOP_LEVEL_EMPTY_STATE_MESSAGES[messageKey]) {
    return TOP_LEVEL_EMPTY_STATE_MESSAGES[messageKey];
  }
  const parts = Array.isArray(messageOrKey)
    ? messageOrKey.map((s) => String(s || '').trim()).filter(Boolean)
    : [String(messageOrKey || '').trim()].filter(Boolean);
  return {
    diagnosis: parts[0] || '',
    cta: parts[1] || '',
  };
}

function renderTopLevelEmptyState(listEl, messageOrKey) {
  if (!(listEl instanceof HTMLElement)) return;
  setTopLevelEmptyStateLayoutMode(listEl, true);
  listEl.innerHTML = '';
  const { diagnosis, cta } = resolveTopLevelEmptyStateMessage(messageOrKey);
  const li = document.createElement('li');
  li.className = 'list-section-label top-level-empty-state';
  const diagnosisEl = document.createElement('p');
  diagnosisEl.className = 'top-level-empty-diagnosis';
  diagnosisEl.textContent = diagnosis;
  li.appendChild(diagnosisEl);
  const ctaEl = document.createElement('p');
  ctaEl.className = 'top-level-empty-cta';
  ctaEl.textContent = cta;
  li.appendChild(ctaEl);
  listEl.appendChild(li);
}

function normalizeRecipeTagList(rawTags) {
  const source = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '').split('\n');
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((tag) => {
      const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

// --- Unit/size row state helpers (tests extract this block) ---
function normalizeUnitSizeFlag(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n === 1 : value === true;
}

function getUnitSizeRowState(row) {
  return {
    isHidden: normalizeUnitSizeFlag(row?.isHidden ?? row?.is_hidden),
    isRemoved: normalizeUnitSizeFlag(row?.isRemoved ?? row?.is_removed),
  };
}

function isUnitSizeRowSelectable(row) {
  const state = getUnitSizeRowState(row);
  return state.isRemoved !== true;
}

function getUnitSizeRemovalAction(usedRecipeCount) {
  const n = Number(usedRecipeCount);
  if (Number.isFinite(n) && n > 0) return 'remove';
  return 'delete';
}

function shouldShowUnitSizeRow(row, activeFilterChips) {
  const state = getUnitSizeRowState(row);
  const chipSet =
    activeFilterChips && typeof activeFilterChips.has === 'function'
      ? activeFilterChips
      : new Set();
  const showHidden = chipSet.has('hidden');
  const showRemoved = chipSet.has('removed');
  if (!showHidden && !showRemoved) return !state.isHidden && !state.isRemoved;
  if (showHidden && showRemoved) return state.isHidden || state.isRemoved;
  if (showHidden) return state.isHidden === true;
  return state.isRemoved === true;
}

if (typeof window !== 'undefined') {
  window.__unitSizeRowStateHelpers = {
    normalizeUnitSizeFlag,
    getUnitSizeRowState,
    isUnitSizeRowSelectable,
    getUnitSizeRemovalAction,
    shouldShowUnitSizeRow,
  };
}
// --- End unit/size row state helpers ---

// --- Size sort helpers (tests extract this block) ---
function normalizeSizeSortLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getNamedSizeRank(value) {
  const label = normalizeSizeSortLabel(value).replace(/\s*-\s*/g, '-');
  if (!label) return null;

  const rankMap = new Map([
    ['extra-small', 10],
    ['x-small', 10],
    ['xsmall', 10],
    ['xs', 10],
    ['small', 20],
    ['sm', 20],
    ['medium', 30],
    ['med', 30],
    ['regular', 30],
    ['large', 40],
    ['lg', 40],
    ['extra-large', 50],
    ['x-large', 50],
    ['xlarge', 50],
    ['xl', 50],
    ['jumbo', 60],
    ['family-size', 70],
    ['family size', 70],
  ]);
  return rankMap.has(label) ? rankMap.get(label) : null;
}

function getNumericSizeSortMeta(value) {
  const label = normalizeSizeSortLabel(value);
  if (!label) return null;

  const match = label.match(
    /^(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|liter|liters)$/,
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;

  const weightUnits = {
    oz: 28.3495,
    ounce: 28.3495,
    ounces: 28.3495,
    g: 1,
    gram: 1,
    grams: 1,
    kg: 1000,
    kilogram: 1000,
    kilograms: 1000,
    lb: 453.592,
    lbs: 453.592,
    pound: 453.592,
    pounds: 453.592,
  };
  if (Object.prototype.hasOwnProperty.call(weightUnits, unit)) {
    return { group: 1, rank: amount * weightUnits[unit], label };
  }

  const volumeUnits = {
    ml: 1,
    milliliter: 1,
    milliliters: 1,
    l: 1000,
    liter: 1000,
    liters: 1000,
  };
  if (Object.prototype.hasOwnProperty.call(volumeUnits, unit)) {
    return { group: 2, rank: amount * volumeUnits[unit], label };
  }

  return null;
}

function getSizeSortMeta(value) {
  const label = normalizeSizeSortLabel(
    value && typeof value === 'object' ? value.name : value,
  );
  const namedRank = getNamedSizeRank(label);
  if (namedRank != null) return { group: 0, rank: namedRank, label };

  const numericMeta = getNumericSizeSortMeta(label);
  if (numericMeta) return numericMeta;

  return { group: 3, rank: Number.POSITIVE_INFINITY, label };
}

function getSizeSortOrderValue(value) {
  if (!value || typeof value !== 'object') return null;
  const n = Number(value.sortOrder ?? value.sort_order);
  return Number.isFinite(n) ? n : null;
}

function compareSizeDisplayValues(a, b) {
  const metaA = getSizeSortMeta(a);
  const metaB = getSizeSortMeta(b);
  if (metaA.group !== metaB.group) return metaA.group - metaB.group;
  if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank;

  // For unclassified text sizes, preserve curated DB order when present.
  if (metaA.group === 3) {
    const sortA = getSizeSortOrderValue(a);
    const sortB = getSizeSortOrderValue(b);
    if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB;
  }

  const labelCompare = metaA.label.localeCompare(metaB.label, undefined, {
    sensitivity: 'base',
  });
  if (labelCompare !== 0) return labelCompare;

  const sortA = getSizeSortOrderValue(a);
  const sortB = getSizeSortOrderValue(b);
  if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB;

  return 0;
}

function sortSizeNames(values) {
  return (Array.isArray(values) ? values.slice() : []).sort(
    compareSizeDisplayValues,
  );
}

function sortSizeRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort(
    compareSizeDisplayValues,
  );
}

if (typeof window !== 'undefined') {
  window.__sizeSortHelpers = {
    normalizeSizeSortLabel,
    getNamedSizeRank,
    getNumericSizeSortMeta,
    getSizeSortMeta,
    compareSizeDisplayValues,
    sortSizeNames,
    sortSizeRows,
  };
}
// --- End size sort helpers ---

// --- Shopping list amount helpers (tests extract this block) ---
const SHOPPING_LIST_MEASURED_UNIT_META = Object.freeze({
  tsp: Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 4.92892159375,
  }),
  tbsp: Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 14.78676478125,
  }),
  cup: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 236.5882365 }),
  'fl oz': Object.freeze({
    family: 'volume',
    baseUnit: 'ml',
    factor: 29.5735295625,
  }),
  pt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 473.176473 }),
  qt: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 946.352946 }),
  gal: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 3785.411784 }),
  ml: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1 }),
  l: Object.freeze({ family: 'volume', baseUnit: 'ml', factor: 1000 }),
  g: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1 }),
  kg: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 1000 }),
  oz: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 28.349523125 }),
  lb: Object.freeze({ family: 'mass', baseUnit: 'g', factor: 453.59237 }),
});

const SHOPPING_LIST_UNIT_ALIASES = Object.freeze({
  t: 'tsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tb: 'tbsp',
  tbl: 'tbsp',
  tbspn: 'tbsp',
  tbs: 'tbsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  c: 'cup',
  cup: 'cup',
  cups: 'cup',
  floz: 'fl oz',
  'fl oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  fluidounce: 'fl oz',
  fluidounces: 'fl oz',
  pt: 'pt',
  pint: 'pt',
  pints: 'pt',
  qt: 'qt',
  quart: 'qt',
  quarts: 'qt',
  gal: 'gal',
  gallon: 'gal',
  gallons: 'gal',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
});

function normalizeShoppingListUnit(unitText) {
  const raw = String(unitText || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (Object.prototype.hasOwnProperty.call(SHOPPING_LIST_UNIT_ALIASES, raw)) {
    return SHOPPING_LIST_UNIT_ALIASES[raw];
  }
  if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
  if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
  return raw;
}

function getShoppingListMeasuredUnitMeta(unitText) {
  const normalized = normalizeShoppingListUnit(unitText);
  if (!normalized) return null;
  return SHOPPING_LIST_MEASURED_UNIT_META[normalized] || null;
}

function convertShoppingListQuantityToMeasuredBase(quantity, unitText) {
  const numeric = Number(quantity);
  const meta = getShoppingListMeasuredUnitMeta(unitText);
  if (!meta || !Number.isFinite(numeric) || numeric <= 0) return null;
  return {
    unit: normalizeShoppingListUnit(unitText),
    family: meta.family,
    baseUnit: meta.baseUnit,
    baseQuantity: Number((numeric * meta.factor).toFixed(6)),
  };
}

function roundShoppingListDisplayQuantity(value, unitText = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const normalizedUnit = normalizeShoppingListUnit(unitText);
  let denominators = null;
  let allowThirds = false;

  if (
    normalizedUnit === 'tsp' ||
    normalizedUnit === 'tbsp' ||
    normalizedUnit === 'cup'
  ) {
    denominators = [2, 4, 8];
    allowThirds = true;
  } else if (
    normalizedUnit === 'oz' ||
    normalizedUnit === 'lb' ||
    normalizedUnit === 'pt' ||
    normalizedUnit === 'qt' ||
    normalizedUnit === 'gal'
  ) {
    denominators = [2, 4];
  }

  if (!denominators) return Number(numeric.toFixed(2));

  const abs = Math.abs(numeric);
  const whole = Math.floor(abs);
  const fraction = abs - whole;
  let best = null;

  const registerCandidate = (candidateValue, denominatorWeight) => {
    const err = Math.abs(abs - candidateValue);
    if (
      best == null ||
      err < best.err - 1e-12 ||
      (Math.abs(err - best.err) <= 1e-12 && denominatorWeight < best.den)
    ) {
      best = {
        value: candidateValue,
        err,
        den: denominatorWeight,
      };
    }
  };

  denominators.forEach((den) => {
    const num = Math.round(fraction * den);
    registerCandidate(whole + num / den, den);
  });

  if (allowThirds) {
    const thirdNum = Math.round(fraction * 3);
    registerCandidate(whole + thirdNum / 3, 3);
  }

  if (!best) return Number(numeric.toFixed(2));
  const rounded = Number(best.value.toFixed(6));
  return Number.isFinite(rounded) && rounded > 0
    ? rounded
    : Number(numeric.toFixed(2));
}

/** name/lemma keys (lowercase) → true when catalog item has Use metric enabled. */
let favoriteEatsCatalogMetricByKeyLc = null;
/** Catalog rows keyed by normalized ingredient name (shopping-list pluralization). */
let favoriteEatsCatalogByNameLc = null;
let favoriteEatsCatalogLabelIndexLc = null;

function catalogGrammarItemFromShoppingListRow(item) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || '').trim();
  if (!name) return null;
  return {
    name,
    baseKey: name.toLowerCase(),
    lemma: String(item.lemma || '').trim(),
    singularIfUnspecified: !!item.singularIfUnspecified,
    isMassNoun: !!item.isMassNoun,
    pluralOverride: String(item.pluralOverride || '').trim(),
    usePluralOverride: !!item.usePluralOverride,
  };
}

function buildFavoriteEatsCatalogGrammarCaches(items) {
  const byName = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const catalogItem = catalogGrammarItemFromShoppingListRow(item);
    if (!catalogItem) return;
    const key = String(catalogItem.baseKey || '').trim();
    if (!key || byName.has(key)) return;
    byName.set(key, catalogItem);
  });
  const labelIndex =
    typeof buildShoppingCatalogLabelIndex === 'function'
      ? buildShoppingCatalogLabelIndex(byName)
      : new Map();
  return { byName, labelIndex };
}

function applyFavoriteEatsCatalogGrammarCaches(byName, labelIndex) {
  favoriteEatsCatalogByNameLc = byName;
  favoriteEatsCatalogLabelIndexLc = labelIndex;
  if (typeof window !== 'undefined') {
    window.favoriteEatsCatalogByNameLc = byName;
    window.favoriteEatsCatalogLabelIndexLc = labelIndex;
  }
}

function resolveFavoriteEatsCatalogGrammarForName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const byName =
    favoriteEatsCatalogByNameLc ||
    (typeof window !== 'undefined' ? window.favoriteEatsCatalogByNameLc : null);
  const labelIndex =
    favoriteEatsCatalogLabelIndexLc ||
    (typeof window !== 'undefined' ? window.favoriteEatsCatalogLabelIndexLc : null);
  if (!byName) return null;
  if (typeof resolveShoppingCatalogItemByLabel === 'function') {
    return resolveShoppingCatalogItemByLabel(byName, labelIndex, raw);
  }
  if (typeof byName.get === 'function') {
    return byName.get(raw.toLowerCase()) || null;
  }
  return null;
}

function buildFavoriteEatsCatalogMetricByKeyLc(items) {
  const map = new Map();
  const addKey = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (key) map.set(key, true);
  };
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.useMetric) return;
    addKey(item.name);
    addKey(item.lemma);
    const nameLc = String(item.name || '').trim().toLowerCase();
    if (
      nameLc &&
      typeof shoppingCatalogLookupNeedleVariants === 'function'
    ) {
      shoppingCatalogLookupNeedleVariants(nameLc).forEach(addKey);
    }
  });
  return map;
}

async function refreshFavoriteEatsCatalogReferenceCaches() {
  if (
    !favoriteEatsShouldUseSupabaseDataDoor() ||
    !window.dataService ||
    typeof window.dataService.listShoppingItems !== 'function'
  ) {
    favoriteEatsCatalogMetricByKeyLc = null;
    applyFavoriteEatsCatalogGrammarCaches(null, null);
    return;
  }
  window.dataService.useSupabase = true;
  try {
    const rows = await window.dataService.listShoppingItems();
    favoriteEatsCatalogMetricByKeyLc = buildFavoriteEatsCatalogMetricByKeyLc(rows);
    const grammar = buildFavoriteEatsCatalogGrammarCaches(rows);
    applyFavoriteEatsCatalogGrammarCaches(grammar.byName, grammar.labelIndex);
  } catch (err) {
    console.warn('refreshFavoriteEatsCatalogReferenceCaches failed:', err);
    favoriteEatsCatalogMetricByKeyLc = null;
    applyFavoriteEatsCatalogGrammarCaches(null, null);
  }
}

async function refreshFavoriteEatsCatalogMetricFlags() {
  return refreshFavoriteEatsCatalogReferenceCaches();
}

function favoriteEatsCatalogLineUsesMetric(line) {
  const map = favoriteEatsCatalogMetricByKeyLc;
  if (!map || !line || typeof line !== 'object') return false;
  const keys = [];
  const push = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (key) keys.push(key);
  };
  push(line.name);
  push(line.lemma);
  const nameLc = String(line.name || '').trim().toLowerCase();
  if (nameLc && typeof shoppingCatalogLookupNeedleVariants === 'function') {
    shoppingCatalogLookupNeedleVariants(nameLc).forEach(push);
  }
  return keys.some((key) => map.has(key));
}

function hydrateRecipeIngredientMetricFlags(recipe) {
  if (!recipe || !Array.isArray(recipe.sections)) return;
  recipe.sections.forEach((section) => {
    (Array.isArray(section?.ingredients) ? section.ingredients : []).forEach(
      (line) => {
        if (!line || line.rowType === 'heading') return;
        if (line.useMetric || line.use_metric) return;
        if (favoriteEatsCatalogLineUsesMetric(line)) {
          line.useMetric = true;
        }
      },
    );
  });
}

window.favoriteEatsCatalogLineUsesMetric = favoriteEatsCatalogLineUsesMetric;
window.refreshFavoriteEatsCatalogReferenceCaches =
  refreshFavoriteEatsCatalogReferenceCaches;
window.refreshFavoriteEatsCatalogMetricFlags = refreshFavoriteEatsCatalogMetricFlags;
window.resolveFavoriteEatsCatalogGrammarForName =
  resolveFavoriteEatsCatalogGrammarForName;
window.hydrateRecipeIngredientMetricFlags = hydrateRecipeIngredientMetricFlags;

function getQuantityDisplayPolicy() {
  return window.favoriteEatsQuantityDisplayPolicy;
}

function getMeasuredDisplayFromBase(
  family,
  baseQuantity,
  intent = 'cooking',
  options,
) {
  const api = getQuantityDisplayPolicy();
  if (!api || typeof api.getMeasuredDisplayFromBase !== 'function') {
    console.warn('quantityDisplayPolicy.js missing or incomplete');
    return null;
  }
  return api.getMeasuredDisplayFromBase(
    family,
    baseQuantity,
    intent,
    undefined,
    options,
  );
}

function getShoppingListMeasuredDisplayFromBase(family, baseQuantity, options) {
  const api = getQuantityDisplayPolicy();
  if (
    !api ||
    typeof api.getShoppingListMeasuredDisplayFromBase !== 'function'
  ) {
    console.warn('quantityDisplayPolicy.js missing or incomplete');
    return null;
  }
  return api.getShoppingListMeasuredDisplayFromBase(
    family,
    baseQuantity,
    options,
  );
}

const INGREDIENT_BASE_VARIANT_NAME = 'default';
const INGREDIENT_RESERVED_VARIANT_NAMES = Object.freeze(
  new Set([INGREDIENT_BASE_VARIANT_NAME, 'base', 'any']),
);

function isIngredientBaseVariantName(rawVariant) {
  const normalized = String(rawVariant || '')
    .trim()
    .toLowerCase();
  return !normalized || normalized === INGREDIENT_BASE_VARIANT_NAME;
}

function normalizeNamedIngredientVariant(rawVariant) {
  const trimmed = String(rawVariant || '').trim();
  return isIngredientBaseVariantName(trimmed) ? '' : trimmed;
}

function isReservedIngredientVariantName(rawVariant) {
  const normalized = String(rawVariant || '')
    .trim()
    .toLowerCase();
  return normalized ? INGREDIENT_RESERVED_VARIANT_NAMES.has(normalized) : false;
}

function getIngredientBaseVariantWhereSql(columnSql = 'variant') {
  const escapedBaseVariant = INGREDIENT_BASE_VARIANT_NAME.replace(/'/g, "''");
  return `lower(trim(COALESCE(${columnSql}, ''))) IN ('', '${escapedBaseVariant}')`;
}

function getShoppingListIngredientLabel(name, variantName = '') {
  const displayFields = getShoppingListDisplayFields(name, variantName);
  const fallbackVariant =
    String(variantName || '').trim() &&
    String(variantName || '')
      .trim()
      .toLowerCase() !== 'default' &&
    !isShoppingListSizeVariant(variantName)
      ? variantName
      : '';
  const fallback = [
    String(fallbackVariant || '').trim(),
    String(name || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  return displayFields.displayName || fallback;
}

function formatShoppingListIngredientText(line) {
  const source = line && typeof line === 'object' ? line : {};
  if (typeof window === 'undefined') {
    return String(source?.name || '').trim();
  }
  if (typeof window.formatIngredientText === 'function') {
    try {
      return String(window.formatIngredientText(source) || '').trim();
    } catch (_) {}
  }
  const fallbackName = [
    String(source.variant || '').trim(),
    String(source.name || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const pieces = [
    String(source.quantity ?? '').trim(),
    String(source.size || '').trim(),
    String(source.unit || '').trim(),
    fallbackName,
  ].filter(Boolean);
  return pieces.join(' ').trim();
}

const SHOPPING_LIST_SIZE_VARIANT_TOKENS = Object.freeze(
  new Set([
    'small',
    'medium',
    'large',
    'extra-small',
    'extra small',
    'x-small',
    'x small',
    'extra-large',
    'extra large',
    'x-large',
    'x large',
    'xlarge',
    'jumbo',
    'mini',
  ]),
);

function formatShoppingListDisplayQuantity(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (
    typeof window !== 'undefined' &&
    typeof window.decimalToFractionDisplay === 'function'
  ) {
    try {
      const formatted = window.decimalToFractionDisplay(numeric);
      if (formatted) return String(formatted).trim();
    } catch (_) {}
  }
  return formatShoppingPlanQuantity(numeric);
}

function isShoppingListSizeVariant(variantText) {
  const normalized = String(variantText || '')
    .trim()
    .toLowerCase();
  return normalized ? SHOPPING_LIST_SIZE_VARIANT_TOKENS.has(normalized) : false;
}

function getShoppingListDisplayFields(name, variantName = '') {
  const resolvedName = String(name || '').trim();
  const resolvedVariant = String(variantName || '').trim();
  const normalizedVariant = resolvedVariant.toLowerCase();
  const nameVariant =
    resolvedVariant &&
    normalizedVariant !== 'default' &&
    !isShoppingListSizeVariant(resolvedVariant)
      ? resolvedVariant
      : '';
  const quantitySizePrefix =
    resolvedVariant &&
    normalizedVariant !== 'default' &&
    isShoppingListSizeVariant(resolvedVariant)
      ? resolvedVariant
      : '';

  let displayName = '';
  const catalogGrammar = resolveFavoriteEatsCatalogGrammarForName(resolvedName);
  if (
    catalogGrammar &&
    typeof window !== 'undefined' &&
    typeof window.getShoppingCatalogItemDisplayName === 'function'
  ) {
    try {
      const noun = String(
        window.getShoppingCatalogItemDisplayName(catalogGrammar) || '',
      ).trim();
      if (noun) {
        displayName = [nameVariant, noun].filter(Boolean).join(' ').trim();
      }
    } catch (_) {}
  }
  if (
    !displayName &&
    typeof window !== 'undefined' &&
    typeof window.getIngredientDisplayCoreParts === 'function'
  ) {
    try {
      displayName = String(
        window.getIngredientDisplayCoreParts({
          name: resolvedName,
          variant: nameVariant,
        })?.nameText || '',
      ).trim();
    } catch (_) {}
  }
  if (!displayName) {
    displayName = [nameVariant, resolvedName].filter(Boolean).join(' ').trim();
  }

  return {
    displayName,
    quantitySizePrefix,
  };
}

function mergeShoppingListSizeText(prefix, sizeText = '') {
  return [String(prefix || '').trim(), String(sizeText || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function formatShoppingListAmountLeadText({
  quantity = '',
  size = '',
  unit = '',
} = {}) {
  if (
    typeof window !== 'undefined' &&
    typeof window.getIngredientDisplayCoreParts === 'function'
  ) {
    try {
      const leadText = String(
        window.getIngredientDisplayCoreParts(
          {
            quantity,
            size,
            unit,
            name: '',
            variant: '',
          },
          { intent: 'shopping' },
        )?.leadText || '',
      ).trim();
      if (leadText) return leadText;
    } catch (_) {}
  }
  const normalizedUnit = normalizeShoppingListUnit(unit);
  const quantityText = formatShoppingListDisplayQuantity(quantity);
  return [quantityText, String(size || '').trim(), normalizedUnit || String(unit || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getShoppingListBucketSortPriority(bucket) {
  if (!bucket || typeof bucket !== 'object') return 99;
  if (bucket.kind === 'unspecified') return 0;
  if (bucket.kind === 'selected' || bucket.kind === 'count') return 1;
  return 2;
}

function formatShoppingListUnspecifiedLeadText({ size = '' } = {}) {
  return ['some', String(size || '').trim()].filter(Boolean).join(' ').trim();
}

function shoppingListRecipeUnitQuantityLooksDecimal(quantityText) {
  return /^\d*\.\d+$/.test(String(quantityText || '').trim());
}

function getShoppingListBucketLeadText(bucket, options = {}) {
  if (!bucket || typeof bucket !== 'object') return '';
  const quantitySizePrefix = String(options.quantitySizePrefix || '').trim();
  if (bucket.kind === 'selected') {
    return formatShoppingListAmountLeadText({
      quantity: bucket.quantity,
      size: quantitySizePrefix,
    });
  }
  if (bucket.kind === 'unspecified') {
    return formatShoppingListUnspecifiedLeadText({
      size: quantitySizePrefix,
    });
  }
  if (bucket.kind === 'measured') {
    const unit = normalizeShoppingListUnit(bucket.unit || '');
    const meta = unit ? getShoppingListMeasuredUnitMeta(unit) : null;
    const baseQty = Number(bucket.baseQuantity);
    // Volume always uses the centralized ladder (same snap as recipe editor / policy).
    if (bucket.family !== 'volume' && meta && Number.isFinite(baseQty) && baseQty > 0) {
      const rawQty = baseQty / meta.factor;
      const rounded =
        typeof roundShoppingListDisplayQuantity === 'function'
          ? roundShoppingListDisplayQuantity(rawQty, unit)
          : rawQty;
      if (Number.isFinite(rounded) && rounded > 0) {
        const quantityText = formatShoppingListDisplayQuantity(rounded);
        if (!shoppingListRecipeUnitQuantityLooksDecimal(quantityText)) {
          return [quantityText, quantitySizePrefix, unit].filter(Boolean).join(' ').trim();
        }
      }
    }
    const display = getShoppingListMeasuredDisplayFromBase(
      bucket.family,
      bucket.baseQuantity,
      { useMetric: !!options.useMetric },
    );
    if (!display) return '';
    const displayLabel = String(display.displayLabel || '').trim();
    if (displayLabel) return displayLabel;
    return formatShoppingListAmountLeadText({
      quantity: display.quantity,
      size: quantitySizePrefix,
      unit: display.unit,
    });
  }
  return formatShoppingListAmountLeadText({
    quantity: bucket.quantity,
    size: mergeShoppingListSizeText(quantitySizePrefix, bucket.size || ''),
    unit: bucket.unit || '',
  });
}

function getShoppingListPlainStepBucketQuantity(buckets) {
  const list = Array.isArray(buckets) ? buckets : [];
  const selected = list.find((bucket) => bucket?.kind === 'selected');
  const qty = Number(selected?.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function getShoppingListTailDisplayBuckets(buckets) {
  return (Array.isArray(buckets) ? buckets : []).filter(
    (bucket) => bucket && bucket.kind !== 'selected',
  );
}

function buildShoppingListDisplayMergeBuckets(
  buckets,
  { keepPlainStepSeparate = false } = {},
) {
  const list = Array.isArray(buckets)
    ? buckets.filter((bucket) => bucket && typeof bucket === 'object')
    : [];
  const hadSelectedBucket = list.some(
    (bucket) =>
      bucket.kind === 'selected' &&
      Number.isFinite(Number(bucket.quantity)) &&
      Number(bucket.quantity) > 1e-9,
  );
  let plainQty = getShoppingListPlainStepBucketQuantity(list);
  let tails = getShoppingListTailDisplayBuckets(list).map((bucket) => ({
    ...bucket,
  }));

  const countQty = tails
    .filter((bucket) => bucket.kind === 'count')
    .reduce(
      (sum, bucket) => sum + Math.max(0, Number(bucket.quantity || 0)),
      0,
    );
  if (hadSelectedBucket && countQty > 0) {
    plainQty = Number((plainQty + countQty).toFixed(4));
    tails = tails.filter((bucket) => bucket.kind !== 'count');
  }

  const hasExactTail = tails.some((bucket) => bucket.kind === 'exact');
  const measuredTails = tails.filter((bucket) => bucket.kind === 'measured');
  if (
    !keepPlainStepSeparate &&
    hadSelectedBucket &&
    plainQty > 1e-9 &&
    !hasExactTail &&
    measuredTails.length === 1 &&
    !tails.some((bucket) => bucket.kind === 'count')
  ) {
    const measured = measuredTails[0];
    const unit = normalizeShoppingListUnit(measured.unit || '');
    const meta = unit ? getShoppingListMeasuredUnitMeta(unit) : null;
    if (meta && Number.isFinite(Number(meta.factor)) && meta.factor > 0) {
      const measuredIndex = tails.indexOf(measured);
      tails[measuredIndex] = {
        ...measured,
        baseQuantity: Number(
          (
            Number(measured.baseQuantity || 0) +
            plainQty * Number(meta.factor)
          ).toFixed(6),
        ),
      };
      plainQty = 0;
    }
  }

  const displayBuckets = [];
  if (plainQty > 1e-9) {
    displayBuckets.push({
      key: 'selected',
      kind: 'selected',
      quantity: plainQty,
    });
  }
  const unspecifiedTails = tails.filter((bucket) => bucket.kind === 'unspecified');
  if (unspecifiedTails.length > 1) {
    tails = tails.filter((bucket) => bucket.kind !== 'unspecified');
    tails.unshift({
      key: 'unspecified',
      kind: 'unspecified',
      quantity:
        unspecifiedTails.reduce(
          (sum, bucket) => sum + Math.max(0, Number(bucket.quantity || 0)),
          0,
        ) || 1,
    });
  }

  displayBuckets.push(...tails);
  return displayBuckets;
}

function formatShoppingListPlainStepQuantityText(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (typeof formatShoppingQtyForDisplay === 'function') {
    const label = String(formatShoppingQtyForDisplay(numeric) || '').trim();
    if (label) return label;
  }
  return String(Math.round(numeric));
}

function formatShoppingListTailDetailText({
  variantName = '',
  buckets = [],
  useMetric = false,
} = {}) {
  const displayFields = getShoppingListDisplayFields('', variantName);
  const list = getShoppingListTailDisplayBuckets(buckets);
  if (!list.length) return '';
  return list
    .slice()
    .sort(
      (a, b) =>
        getShoppingListBucketSortPriority(a) -
        getShoppingListBucketSortPriority(b),
    )
    .map((bucket) =>
      getShoppingListBucketLeadText(bucket, {
        quantitySizePrefix: displayFields.quantitySizePrefix,
        useMetric,
      }),
    )
    .filter(Boolean)
    .join(' + ');
}

function formatShoppingListDisplayDetailText({
  variantName = '',
  buckets = [],
  useMetric = false,
  keepPlainStepSeparate = false,
} = {}) {
  const displayFields = getShoppingListDisplayFields('', variantName);
  const mergedBuckets = buildShoppingListDisplayMergeBuckets(buckets, {
    keepPlainStepSeparate,
  });
  const plainQty = getShoppingListPlainStepBucketQuantity(mergedBuckets);
  const plainText =
    plainQty > 0
      ? formatShoppingListAmountLeadText({
          quantity: plainQty,
          size: displayFields.quantitySizePrefix,
        })
      : '';
  const tailText = formatShoppingListTailDetailText({
    variantName,
    buckets: mergedBuckets,
    useMetric,
  });
  if (plainText && tailText) return `${plainText} + ${tailText}`;
  if (plainText) return plainText;
  return tailText;
}

const SHOPPING_PLANNER_QTY_EPSILON = 1e-9;

/**
 * Items browse bucket 1: exclusively whole-number stepper qty (manual `selected`
 * and/or unitless recipe `count`). Bucket 2 is every other amount shape.
 */
function isShoppingBrowsePlannerWholeNumberOnlyBuckets(
  buckets,
  { variantName = '' } = {},
) {
  const list = Array.isArray(buckets)
    ? buckets.filter((bucket) => bucket && typeof bucket === 'object')
    : [];
  if (!list.length) return false;
  if (
    list.some(
      (bucket) => bucket.kind !== 'selected' && bucket.kind !== 'count',
    )
  ) {
    return false;
  }
  const displayFields = getShoppingListDisplayFields('', variantName);
  if (String(displayFields.quantitySizePrefix || '').trim()) return false;
  return list.some((bucket) => {
    const qty = Number(bucket.quantity);
    return Number.isFinite(qty) && qty > SHOPPING_PLANNER_QTY_EPSILON;
  });
}

/** Bucket 2 only: non-whole-number amount detail for Items browse parens / chevrons. */
function shoppingBrowsePlannerRowHasAmountTail(
  buckets,
  { variantName = '', useMetric = false } = {},
) {
  if (isShoppingBrowsePlannerWholeNumberOnlyBuckets(buckets, { variantName })) {
    return false;
  }
  const detail = formatShoppingListDisplayDetailText({
    variantName,
    buckets,
    useMetric,
  });
  return !!String(detail || '').trim();
}

/** Items browse display detail; suppresses bucket-1 whole numbers (stepper owns them). */
function formatShoppingBrowsePlannerDisplayDetailText({
  variantName = '',
  buckets = [],
  useMetric = false,
} = {}) {
  if (isShoppingBrowsePlannerWholeNumberOnlyBuckets(buckets, { variantName })) {
    return '';
  }
  return formatShoppingListDisplayDetailText({
    variantName,
    buckets,
    useMetric,
    keepPlainStepSeparate: true,
  });
}

function formatShoppingListPlainStepBadgeLabel(plainQty, { hasAmountTail = false } = {}) {
  const content = getShoppingBrowsePlannerBadgeContent(plainQty, {
    hasAmountTail,
  });
  if (!content) return '';
  if (content.type === 'icon') return '';
  return String(content.value || '');
}

const SHOPPING_BROWSE_PLANNER_TAIL_ICON = 'add_diamond';

/** Recipe unitless `count` buckets promote to browse stepper qty when direct is 0. */
function getBrowsePlannerRecipeCountPromotionFloor(
  recipeQty,
  planRowBuckets,
) {
  const recipe = Number(recipeQty);
  if (!Number.isFinite(recipe) || recipe <= SHOPPING_PLANNER_QTY_EPSILON) {
    return 0;
  }
  const tails = (Array.isArray(planRowBuckets) ? planRowBuckets : []).filter(
    (bucket) => bucket && bucket.kind !== 'selected',
  );
  if (tails.length === 0) return recipe;
  if (tails.every((bucket) => bucket.kind === 'count')) return recipe;
  return 0;
}

function getBrowsePlannerPlainStepQtyFromParts({
  directQty = 0,
  recipeQty = 0,
  planRowBuckets = null,
} = {}) {
  const direct = Number(directQty);
  if (Number.isFinite(direct) && direct > SHOPPING_PLANNER_QTY_EPSILON) {
    return direct;
  }
  return getBrowsePlannerRecipeCountPromotionFloor(recipeQty, planRowBuckets);
}

function getBrowsePlannerDirectQtyFromPlainStep({
  plainQty = 0,
  directQty = 0,
  recipeQty = 0,
  planRowBuckets = null,
} = {}) {
  const direct = Number(directQty);
  const numericPlain = Math.max(0, Number(plainQty || 0));
  if (!Number.isFinite(numericPlain)) return 0;
  if (Number.isFinite(direct) && direct > SHOPPING_PLANNER_QTY_EPSILON) {
    return Number(numericPlain.toFixed(4));
  }
  const floor = getBrowsePlannerRecipeCountPromotionFloor(
    recipeQty,
    planRowBuckets,
  );
  return Number(Math.max(0, numericPlain - floor).toFixed(4));
}

function getShoppingBrowsePlannerBadgeContent(
  plainQty,
  { hasAmountTail = false } = {},
) {
  if (hasAmountTail) {
    return { type: 'icon', name: SHOPPING_BROWSE_PLANNER_TAIL_ICON };
  }
  const numeric = Number(plainQty);
  if (Number.isFinite(numeric) && numeric > 0) {
    const formatted =
      typeof window !== 'undefined' &&
      typeof window.formatShoppingBrowseSublineQtyForDisplay === 'function'
        ? window.formatShoppingBrowseSublineQtyForDisplay(numeric)
        : formatShoppingListPlainStepQuantityText(numeric);
    if (formatted) return { type: 'text', value: formatted };
  }
  return null;
}

function formatShoppingBrowsePlannerStepperQtyLabel(
  plainQty,
  { hasAmountTail: _hasAmountTail = false } = {},
) {
  const numeric = Number(plainQty);
  if (
    typeof window !== 'undefined' &&
    typeof window.formatShoppingBrowseSublineQtyForDisplay === 'function'
  ) {
    return window.formatShoppingBrowseSublineQtyForDisplay(numeric);
  }
  return formatShoppingListPlainStepQuantityText(numeric) || '0';
}

function shouldShoppingBrowsePlannerStepperShowTailIcon(
  _plainQty,
  { hasAmountTail: _hasAmountTail = false } = {},
) {
  return false;
}

function createShoppingBrowsePlannerDocHeadline({
  labelText = '',
  labelClassName = 'shopping-list-row-label',
  labelDeprecated = false,
  amountAriaLabel = 'Recipe amount',
} = {}) {
  const textWrap = document.createElement('div');
  textWrap.className =
    'shopping-list-doc-text-wrap shopping-browse-planner-doc-text-wrap';

  const headline = document.createElement('div');
  headline.className =
    'shopping-list-doc-headline shopping-browse-planner-doc-headline';

  const label = document.createElement('span');
  label.className = labelClassName;
  if (labelDeprecated) {
    label.classList.add('shopping-list-row-label--variant-deprecated');
  }

  const tail = document.createElement('span');
  tail.className = 'shopping-list-doc-tail';
  tail.appendChild(document.createTextNode('\u00a0'));

  const amountBtn = document.createElement('button');
  amountBtn.type = 'button';
  amountBtn.className =
    'shopping-list-doc-text shopping-list-doc-text--amount';
  amountBtn.setAttribute('aria-label', amountAriaLabel);
  amountBtn.style.display = 'none';

  const parsed = splitShoppingListRowTextToLabelAndDetail(labelText);
  if (parsed.detail) {
    headline.classList.add('list-row-headline--split');
    label.classList.add('list-row-primary');
    label.textContent = parsed.label;
    amountBtn.classList.add('list-row-detail');
    amountBtn.textContent = formatListRowDetailParenthetical(parsed.detail);
    amountBtn.style.display = '';
  } else {
    label.textContent = String(labelText || '');
  }

  tail.appendChild(amountBtn);
  headline.appendChild(label);
  headline.appendChild(tail);
  textWrap.appendChild(headline);

  return { textWrap, headline, label, amountBtn };
}

function formatShoppingBrowsePlannerAmountButtonText(detailText) {
  const detail = String(detailText || '').trim();
  return detail ? `(${detail})` : '';
}

function formatShoppingListDisplayRow({
  label = '',
  name = '',
  variantName = '',
  buckets = [],
  useMetric = false,
} = {}) {
  const displayFields = getShoppingListDisplayFields(name, variantName);
  const resolvedLabel =
    String(label || '').trim() ||
    displayFields.displayName ||
    getShoppingListIngredientLabel(name, variantName);
  if (!resolvedLabel) return '';
  const detailText = formatShoppingListDisplayDetailText({
    variantName,
    buckets,
    useMetric,
  });
  if (!detailText) return resolvedLabel;
  return `${resolvedLabel} (${detailText})`;
}

function getShoppingListPlanRowResolvedLabel(planRow) {
  if (!planRow || typeof planRow !== 'object') return '';
  const name = String(planRow.name || '').trim();
  const variantName = String(planRow.variantName || '').trim();
  const displayFields = getShoppingListDisplayFields(name, variantName);
  return (
    String(planRow.label || '').trim() ||
    displayFields.displayName ||
    getShoppingListIngredientLabel(name, variantName) ||
    ''
  );
}

// --- Shopping list row label + qty override helpers (tests extract prefix) ---
function splitShoppingListRowTextToLabelAndDetail(text) {
  const src = String(text || '').trim();
  if (!src) return { label: '', detail: '' };
  const m = src.match(/^(.+?)\s+\(([^)]*)\)\s*$/);
  if (!m) {
    return { label: src, detail: '' };
  }
  return {
    label: String(m[1] || '').trim(),
    detail: String(m[2] || '').trim(),
  };
}

function splitFoldedListRowLabel(fullLine, baseLabel) {
  const b = String(baseLabel || '').trim();
  const f = String(fullLine || '').trim();
  if (!f) return { label: b, detail: '' };
  if (!b) return splitShoppingListRowTextToLabelAndDetail(f);
  if (f === b) return { label: b, detail: '' };
  const prefix = `${b} (`;
  if (f.startsWith(prefix) && f.endsWith(')')) {
    return {
      label: b,
      detail: String(f.slice(prefix.length, -1)).trim(),
    };
  }
  return splitShoppingListRowTextToLabelAndDetail(f);
}

function formatListRowDetailParenthetical(detail) {
  const d = String(detail || '').trim();
  return d ? `(${d})` : '';
}

function createListRowDetailTail() {
  const tail = document.createElement('span');
  tail.className = 'shopping-list-doc-tail';
  tail.appendChild(document.createTextNode('\u00a0'));
  return tail;
}

function applySplitListRowLabelPair(primaryEl, detailEl, fullLine, baseLabel) {
  const { label, detail } = splitFoldedListRowLabel(fullLine, baseLabel);
  primaryEl.textContent = label;
  const parens = formatListRowDetailParenthetical(detail);
  if (detailEl) {
    detailEl.textContent = parens;
    const visible = !!parens;
    const tailEl = detailEl.closest?.('.shopping-list-doc-tail') || null;
    const tailHasExpandControl = !!tailEl?.querySelector?.(
      '.shopping-list-doc-expand',
    );
    if (tailEl?.style && !tailHasExpandControl) {
      tailEl.style.display = visible ? '' : 'none';
    } else if (detailEl.style) {
      detailEl.style.display = visible ? '' : 'none';
    }
  }
  const wrap = primaryEl.closest?.(
    '.list-row-headline--split, .shopping-list-doc-headline',
  );
  if (wrap) {
    wrap.classList.toggle('list-row-headline--split', !!parens);
  }
  return { label, detail, parens };
}

function createItemsBrowseSplitRowHeadline(
  labelClassName = 'shopping-list-row-label',
) {
  const wrap = document.createElement('div');
  wrap.className =
    'list-row-headline list-row-headline--split shopping-list-row-headline';
  const primary = document.createElement('span');
  primary.className = `list-row-primary ${labelClassName}`;
  const tail = createListRowDetailTail();
  const detail = document.createElement('span');
  detail.className = 'list-row-detail';
  tail.appendChild(detail);
  wrap.appendChild(primary);
  wrap.appendChild(tail);
  return { wrap, primary, tail, detail };
}

const SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS = 12;
const SHOPPING_LIST_DISPLAY_ELLIPSIS = '…';

function truncatePrefixWithEllipsis(
  str,
  maxChars,
  ell = SHOPPING_LIST_DISPLAY_ELLIPSIS,
) {
  const s = String(str || '');
  const limit = Math.max(0, Math.trunc(Number(maxChars)));
  if (!s || s.length <= limit) return s;
  if (limit <= 0) return '';
  if (limit <= ell.length) return ell.slice(0, limit);
  return s.slice(0, limit - ell.length) + ell;
}

function fitShoppingListSplitRowDisplay({
  detail = '',
  maxPx = 0,
  measure = null,
  detailMinChars = SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
  suffixPx = 0,
  ell = SHOPPING_LIST_DISPLAY_ELLIPSIS,
} = {}) {
  const resolvedDetail = String(detail || '').trim();
  if (!resolvedDetail) {
    return {
      detailParen: '',
      detailTruncated: false,
    };
  }
  if (typeof measure !== 'function' || maxPx <= 0) {
    return {
      detailParen: formatListRowDetailParenthetical(resolvedDetail),
      detailTruncated: false,
    };
  }

  const fullParen = formatListRowDetailParenthetical(resolvedDetail);
  const reservedPx = Math.max(0, Number(suffixPx) || 0);
  const fullParenPx = measure(fullParen);

  if (fullParenPx + reservedPx <= maxPx) {
    return {
      detailParen: fullParen,
      detailTruncated: false,
    };
  }

  const minChars = Math.max(0, Math.trunc(Number(detailMinChars)));
  let detailChars = Math.min(resolvedDetail.length, minChars);
  let detailVisible = resolvedDetail;
  let detailTruncated = false;

  if (resolvedDetail.length > detailChars) {
    detailVisible = truncatePrefixWithEllipsis(resolvedDetail, detailChars, ell);
    detailTruncated = true;
  }

  let detailParen = formatListRowDetailParenthetical(detailVisible);
  let detailParenPx = measure(detailParen);

  while (detailParenPx + reservedPx > maxPx && detailChars > 0) {
    detailChars -= 1;
    if (detailChars >= resolvedDetail.length) {
      detailVisible = resolvedDetail;
      detailTruncated = false;
    } else if (detailChars === 0) {
      detailVisible = ell;
      detailTruncated = true;
    } else {
      detailVisible = truncatePrefixWithEllipsis(
        resolvedDetail,
        detailChars,
        ell,
      );
      detailTruncated = resolvedDetail.length > detailChars;
    }
    detailParen = formatListRowDetailParenthetical(detailVisible);
    detailParenPx = measure(detailParen);
  }

  return {
    detailParen,
    detailTruncated,
  };
}

const VARIANT_PARENT_MORE_SUFFIX_RE = /^(.*)(, \+ \d+ more)$/;

function parseVariantParentDetailText(detail) {
  const text = String(detail || '').trim();
  if (!text) return { names: '', moreSuffix: '' };
  const match = VARIANT_PARENT_MORE_SUFFIX_RE.exec(text);
  if (!match) return { names: text, moreSuffix: '' };
  return {
    names: String(match[1] || '').trim(),
    moreSuffix: String(match[2] || ''),
  };
}

function truncateEndToFitPx(str, maxPx, measureFn, ell = SHOPPING_LIST_DISPLAY_ELLIPSIS) {
  const s = String(str || '');
  const measure = typeof measureFn === 'function' ? measureFn : null;
  if (!measure) return s;
  if (maxPx <= 0) return '';
  if (measure(s) <= maxPx) return s;
  if (measure(ell) > maxPx) return '';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = s.slice(0, Math.max(0, mid - 1)) + ell;
    if (measure(candidate) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, Math.max(0, lo - 1)) + ell;
}

function truncateInsideForFullLineMeasure(
  inside,
  maxPx,
  measureFullLine,
  ell = SHOPPING_LIST_DISPLAY_ELLIPSIS,
) {
  const text = String(inside || '');
  if (!text) return '';
  if (typeof measureFullLine !== 'function') return text;
  if (measureFullLine(text) <= maxPx) return text;
  if (measureFullLine(ell) > maxPx) return ell;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, Math.max(0, mid - 1)) + ell;
    if (measureFullLine(candidate) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, Math.max(0, lo - 1)) + ell;
}

/**
 * Fit collapsed variant-parent headline: end-truncate inside parens only;
 * "+ n more" only when full suffix and full leading names fit (never truncated names + suffix).
 */
function fitVariantParentFoldedLine({
  baseName = '',
  parts = null,
  maxPx = 0,
  measureFullLine = null,
  ell = SHOPPING_LIST_DISPLAY_ELLIPSIS,
} = {}) {
  const base = String(baseName || '').trim();
  const variantParts = Array.isArray(parts)
    ? parts.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const allInside = variantParts.join(', ');

  const pack = (inside, ready) => {
    const detail = String(inside || '').trim();
    const parsed = parseVariantParentDetailText(detail);
    return {
      fullLine: detail ? `${base} (${detail})` : base,
      detail,
      names: parsed.names,
      moreSuffix: parsed.moreSuffix,
      ready: !!ready,
    };
  };

  if (!variantParts.length) {
    return pack('', true);
  }
  if (typeof measureFullLine !== 'function' || maxPx <= 0) {
    return pack(allInside, false);
  }
  if (measureFullLine(allInside) <= maxPx) {
    return pack(allInside, true);
  }

  const endTruncateAll = () =>
    pack(
      truncateInsideForFullLineMeasure(
        allInside,
        maxPx,
        measureFullLine,
        ell,
      ) || variantParts[0],
      true,
    );

  if (variantParts.length <= 3) {
    return endTruncateAll();
  }

  for (let visibleCount = 1; visibleCount <= 3; visibleCount += 1) {
    const remaining = variantParts.length - visibleCount;
    if (remaining <= 0) continue;
    const suffix = `, + ${remaining} more`;
    const names = variantParts.slice(0, visibleCount).join(', ');
    const inside = `${names}${suffix}`;
    if (measureFullLine(inside) <= maxPx) {
      return pack(inside, true);
    }
  }

  return endTruncateAll();
}

function makeListRowTextMeasurer(el) {
  try {
    const cs = window.getComputedStyle ? getComputedStyle(el) : null;
    const fontStyle = cs ? cs.fontStyle : 'normal';
    const fontVariant = cs ? cs.fontVariant : 'normal';
    const fontWeight = cs ? cs.fontWeight : '400';
    const fontSize = cs ? cs.fontSize : '16px';
    const fontFamily = cs ? cs.fontFamily : 'sans-serif';
    const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = font;
    return (s) => {
      try {
        return ctx.measureText(String(s || '')).width || 0;
      } catch (_) {
        return 0;
      }
    };
  } catch (_) {
    return null;
  }
}

function joinShoppingListLabelAndDetail(label, detail) {
  const l = String(label || '').trim();
  const d = String(detail || '').trim();
  if (!l) return d;
  if (!d) return l;
  return `${l} (${d})`;
}

function getShoppingListRowCanonicalLabel(row, planRow) {
  if (planRow && typeof planRow === 'object') {
    const explicitLabel = String(planRow.label || '').trim();
    if (explicitLabel) return explicitLabel;
    const resolvedLabel = getShoppingListPlanRowResolvedLabel(planRow);
    if (resolvedLabel) return resolvedLabel;
  }
  const sourceText = String(row?.sourceText || '').trim();
  if (sourceText) {
    return splitShoppingListRowTextToLabelAndDetail(sourceText).label;
  }
  return splitShoppingListRowTextToLabelAndDetail(String(row?.text || '')).label;
}

function shoppingListPlanRowFromGeneratedRow(generatedRow) {
  if (!generatedRow || typeof generatedRow !== 'object') return null;
  const sourceText = String(
    generatedRow.sourceText || generatedRow.text || '',
  ).trim();
  if (!sourceText) return null;
  const parsed = splitShoppingListRowTextToLabelAndDetail(sourceText);
  return {
    label: parsed.label,
    detailText: parsed.detail,
  };
}

function shoppingListRowSupportsQtyOnlyEdit(row, planRow) {
  const sourceKey = String(row?.sourceKey || '').trim();
  if (!sourceKey) return false;
  const planRowDetail = String(planRow?.detailText || '').trim();
  const sourceDetail = splitShoppingListRowTextToLabelAndDetail(
    String(row?.sourceText || ''),
  ).detail;
  const rowDetail = splitShoppingListRowTextToLabelAndDetail(
    String(row?.text || ''),
  ).detail;
  return !!(planRowDetail || sourceDetail || rowDetail);
}

function buildShoppingListQtyOnlyOverrideText(row, planRow, detailRaw) {
  const canonicalLabel = getShoppingListRowCanonicalLabel(row, planRow);
  let nextDetail = String(detailRaw ?? '').trim();
  if (!nextDetail) {
    const planRowDetail = String(planRow?.detailText || '').trim();
    const fromSource = splitFoldedListRowLabel(
      String(row?.sourceText || ''),
      canonicalLabel,
    ).detail;
    // Cleared amount input should revert to generated/source detail, not the
    // current override still stored on the row.
    nextDetail = String(planRowDetail || fromSource || '').trim();
  }
  return joinShoppingListLabelAndDetail(canonicalLabel, nextDetail);
}

function sanitizeShoppingListRowTextCommit(row, planRow, nextText) {
  const sourceKey = String(row?.sourceKey || '').trim();
  const trimmed = String(nextText || '').trim();
  if (!sourceKey) return trimmed;
  if (!trimmed) return trimmed;
  const canonicalLabel = getShoppingListRowCanonicalLabel(row, planRow);
  const folded = splitFoldedListRowLabel(trimmed, canonicalLabel);
  const parsed = splitShoppingListRowTextToLabelAndDetail(trimmed);
  const detail = folded.detail || parsed.detail || '';
  return buildShoppingListQtyOnlyOverrideText(row, planRow, detail);
}

function normalizeShoppingListRowQtyOnlyOverride(row, planRow) {
  if (!row || typeof row !== 'object') return row;
  const sourceKey = String(row.sourceKey || '').trim();
  if (!sourceKey) return row;
  const sourceText = String(row.sourceText || '').trim();
  if (!sourceText) return row;

  const sourceLabel = splitShoppingListRowTextToLabelAndDetail(sourceText).label;
  const canonicalLabel =
    sourceLabel || getShoppingListRowCanonicalLabel(row, planRow);
  const sourceFolded = splitFoldedListRowLabel(sourceText, canonicalLabel);
  const currentFolded = splitFoldedListRowLabel(String(row.text || ''), canonicalLabel);
  const nextDetail = currentFolded.detail || sourceFolded.detail;
  const nextText = joinShoppingListLabelAndDetail(canonicalLabel, nextDetail);
  const normalizedRow = {
    ...row,
    text: nextText,
    userEdited: nextText !== sourceText,
  };
  if (!shoppingListRowAmountDetailDivergedFromSource(normalizedRow)) {
    normalizedRow.userEdited = false;
    normalizedRow.text = sourceText;
  }
  return normalizedRow;
}

function normalizeShoppingListDocQtyOnlyOverrides(storedDoc, generatedDoc) {
  const normalizedStored = normalizeShoppingListDoc(storedDoc);
  const generatedRows = normalizeShoppingListDoc(generatedDoc).rows;
  const generatedByKey = new Map();
  generatedRows.forEach((generatedRow) => {
    const sourceKey = String(generatedRow?.sourceKey || '').trim();
    if (sourceKey) generatedByKey.set(sourceKey, generatedRow);
  });
  return normalizeShoppingListDoc({
    version: normalizedStored.version,
    rows: normalizedStored.rows.map((row) => {
      const sourceKey = String(row?.sourceKey || '').trim();
      if (!sourceKey) return row;
      const generatedRow = generatedByKey.get(sourceKey) || null;
      return normalizeShoppingListRowQtyOnlyOverride(
        row,
        shoppingListPlanRowFromGeneratedRow(generatedRow),
      );
    }),
  });
}

function shoppingListRowAmountDetailDivergedFromSource(row) {
  const sourceKey = String(row?.sourceKey || '').trim();
  const sourceText = String(row?.sourceText || '').trim();
  if (!sourceKey || !sourceText) return false;
  const currentText = String(row?.text || '').trim();
  const cur = splitShoppingListRowTextToLabelAndDetail(currentText);
  const src = splitShoppingListRowTextToLabelAndDetail(sourceText);
  if (cur.detail || src.detail) {
    return cur.detail !== src.detail;
  }
  return currentText !== sourceText;
}

function getShoppingListRowQtyDetailFromText(text, sourceText) {
  const baselineLabel = splitShoppingListRowTextToLabelAndDetail(
    String(sourceText || text || ''),
  ).label;
  const folded = splitFoldedListRowLabel(String(text || ''), baselineLabel);
  if (folded.detail) return folded.detail;
  return splitShoppingListRowTextToLabelAndDetail(String(text || '')).detail;
}

function getShoppingListGeneratedSourceAmountDetail(generatedRow) {
  const generatedSource = String(
    generatedRow?.sourceText || generatedRow?.text || '',
  ).trim();
  return splitShoppingListRowTextToLabelAndDetail(generatedSource).detail;
}

function shoppingListRowGeneratedSourceAmountDetailChanged(storedRow, generatedRow) {
  const storedSource = String(storedRow?.sourceText || '').trim();
  const generatedSource = String(generatedRow?.sourceText || '').trim();
  if (!storedSource || !generatedSource) return false;
  const stored = splitShoppingListRowTextToLabelAndDetail(storedSource);
  const generated = splitShoppingListRowTextToLabelAndDetail(generatedSource);
  if (stored.detail || generated.detail) {
    return stored.detail !== generated.detail;
  }
  return storedSource !== generatedSource;
}

function buildShoppingListRowTextPreservingUserQtyDetail(storedRow, generatedRow) {
  if (!doesShoppingListRowHaveUserOverride(storedRow)) {
    return String(generatedRow?.text || '').trim();
  }
  const userDetail = getShoppingListRowQtyDetailFromText(
    storedRow.text,
    storedRow.sourceText,
  );
  const genLabel = splitShoppingListRowTextToLabelAndDetail(
    String(generatedRow?.sourceText || generatedRow?.text || ''),
  ).label;
  return joinShoppingListLabelAndDetail(genLabel, userDetail);
}

function buildShoppingListQtyUpdateConflict(storedRow, generatedRow) {
  const nextGeneratedText = String(generatedRow?.sourceText || '').trim();
  const nextGeneratedDisplayText = String(generatedRow?.text || '').trim();
  return {
    kind: 'qty-update',
    rowId: String(storedRow?.id || '').trim(),
    sourceKey: String(storedRow?.sourceKey || generatedRow?.sourceKey || '').trim(),
    currentText: String(storedRow?.text || '').trim(),
    currentDetail: getShoppingListRowQtyDetailFromText(
      storedRow?.text,
      storedRow?.sourceText,
    ),
    previousGeneratedText: String(storedRow?.sourceText || '').trim(),
    nextGeneratedText,
    nextGeneratedDisplayText,
    nextDetail: getShoppingListGeneratedSourceAmountDetail(generatedRow),
    nextStoreLabel: String(generatedRow?.sourceStoreLabel || '').trim(),
    nextBucketLabel: String(generatedRow?.sourceBucketLabel || '').trim(),
    nextStoreId: generatedRow?.storeId,
    nextAisleId: generatedRow?.aisleId,
    nextAisleSortOrder: generatedRow?.aisleSortOrder,
  };
}

function mergeShoppingListStoredRowWithGeneratedRow(storedRow, generatedRow) {
  const hasUserOverride = doesShoppingListRowHaveUserOverride(storedRow);
  const nextText = buildShoppingListRowTextPreservingUserQtyDetail(
    storedRow,
    generatedRow,
  );
  if (isShoppingListRowListRemoved(storedRow)) {
    return {
      ...storedRow,
      text: nextText,
      checked: !!storedRow.checked,
      sourceKey: String(generatedRow?.sourceKey || storedRow?.sourceKey || '').trim(),
      sourceText: String(generatedRow?.sourceText || '').trim(),
      sourceStoreLabel: String(generatedRow?.sourceStoreLabel || '').trim(),
      sourceBucketLabel: String(generatedRow?.sourceBucketLabel || '').trim(),
      userEdited: hasUserOverride,
    };
  }
  return {
    ...storedRow,
    text: nextText,
    checked: !!storedRow.checked,
    storeLabel: String(generatedRow?.storeLabel || '').trim(),
    storeId: generatedRow?.storeId,
    bucketLabel: String(generatedRow?.bucketLabel || '').trim(),
    aisleId: generatedRow?.aisleId,
    aisleSortOrder: generatedRow?.aisleSortOrder,
    sourceKey: String(generatedRow?.sourceKey || storedRow?.sourceKey || '').trim(),
    sourceText: String(generatedRow?.sourceText || '').trim(),
    sourceStoreLabel: String(generatedRow?.sourceStoreLabel || '').trim(),
    sourceBucketLabel: String(generatedRow?.sourceBucketLabel || '').trim(),
    userEdited: hasUserOverride,
  };
}

// --- End shopping list row label + qty override helpers (tests extract prefix) ---

if (typeof window !== 'undefined') {
  window.__listRowLabelKit = {
    splitShoppingListRowTextToLabelAndDetail,
    splitFoldedListRowLabel,
    formatListRowDetailParenthetical,
    createListRowDetailTail,
    createItemsBrowseSplitRowHeadline,
    applySplitListRowLabelPair,
    truncatePrefixWithEllipsis,
    fitShoppingListSplitRowDisplay,
    parseVariantParentDetailText,
    truncateEndToFitPx,
    truncateInsideForFullLineMeasure,
    fitVariantParentFoldedLine,
    VARIANT_PARENT_MORE_SUFFIX_RE,
    SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
    SHOPPING_LIST_DISPLAY_ELLIPSIS,
  };
  window.__shoppingListAmountHelpers = {
    normalizeShoppingListUnit,
    getShoppingListMeasuredUnitMeta,
    convertShoppingListQuantityToMeasuredBase,
    roundShoppingListDisplayQuantity,
    getMeasuredDisplayFromBase,
    getShoppingListMeasuredDisplayFromBase,
    getShoppingListIngredientLabel,
    getShoppingListBucketLeadText,
    formatShoppingListAmountLeadText,
    formatShoppingListDisplayDetailText,
    formatShoppingBrowsePlannerDisplayDetailText,
    formatShoppingListDisplayRow,
    getShoppingListPlainStepBucketQuantity,
    formatShoppingListTailDetailText,
    formatShoppingListPlainStepBadgeLabel,
    formatShoppingBrowsePlannerStepperQtyLabel,
    getShoppingBrowsePlannerBadgeContent,
    formatShoppingBrowsePlannerAmountButtonText,
    shouldShoppingBrowsePlannerStepperShowTailIcon,
    isShoppingBrowsePlannerWholeNumberOnlyBuckets,
    shoppingBrowsePlannerRowHasAmountTail,
    getBrowsePlannerRecipeCountPromotionFloor,
    getBrowsePlannerPlainStepQtyFromParts,
    getBrowsePlannerDirectQtyFromPlainStep,
  };
}
// --- End shopping list amount helpers ---

// --- Shopping browse labeling helpers (tests extract this block) ---
function normalizeShoppingBrowseLocationId(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  return !value || value === 'measures' ? 'none' : value;
}

function getShoppingBrowseVariantHomeRows(item) {
  const rows = Array.isArray(item?.variantHomeLocations)
    ? item.variantHomeLocations
    : [];
  const out = [];
  const byKey = new Map();
  rows.forEach((entry) => {
    const variant = String(entry?.variant || '').trim();
    if (!variant) return;
    const rowKey = variant.toLowerCase();
    const normalizedHome = normalizeShoppingBrowseLocationId(
      entry?.homeLocation,
    );
    const existing = byKey.get(rowKey);
    if (existing) {
      if (existing.homeLocation === 'none' && normalizedHome !== 'none') {
        existing.homeLocation = normalizedHome;
      }
      return;
    }
    const nextRow = { variant, homeLocation: normalizedHome };
    byKey.set(rowKey, nextRow);
    out.push(nextRow);
  });
  const baseHomeFallback = normalizeShoppingBrowseLocationId(
    item?.locationAtHome,
  );
  if (baseHomeFallback !== 'none') {
    out.forEach((row) => {
      if (row.homeLocation === 'none') {
        row.homeLocation = baseHomeFallback;
      }
    });
  }
  return out;
}

function getShoppingBrowseLocationIds(item) {
  const ids = [];
  const seen = new Set();
  const pushId = (rawId) => {
    const normalizedId = normalizeShoppingBrowseLocationId(rawId);
    if (seen.has(normalizedId)) return;
    seen.add(normalizedId);
    ids.push(normalizedId);
  };
  pushId(item?.locationAtHome);
  getShoppingBrowseVariantHomeRows(item).forEach((entry) =>
    pushId(entry.homeLocation),
  );
  return ids;
}

/** Active location chips, or a single location-sort section bucket when grouping. */
function getShoppingBrowseEffectiveLocationIds(options = {}) {
  const { normalizedLocationIds } =
    getShoppingBrowseBrowseFilterOptions(options);
  if (normalizedLocationIds.length > 0) return normalizedLocationIds;
  const rawBucket = options?.locationBucketId;
  if (rawBucket == null || String(rawBucket).trim() === '') return [];
  return [normalizeShoppingBrowseLocationId(rawBucket)];
}

function getShoppingBrowseMatchInfo(item, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const normalizedLocationIds = getShoppingBrowseEffectiveLocationIds(options);
  const hasQuery = !!normalizedQuery;
  const hasLocationFilters = normalizedLocationIds.length > 0;
  if (!hasQuery && !hasLocationFilters) {
    return {
      baseMatched: false,
      matchedVariantNames: [],
      variantNameToShow: '',
    };
  }

  const baseLocationId = normalizeShoppingBrowseLocationId(
    item?.locationAtHome,
  );
  const baseSearchMatches =
    !hasQuery ||
    (typeof window !== 'undefined' &&
    typeof window.shoppingCatalogItemMatchesSearchQuery === 'function'
      ? window.shoppingCatalogItemMatchesSearchQuery(item, normalizedQuery, {
          includeVariants: false,
        })
      : String(item?.name || '')
          .trim()
          .toLowerCase()
          .includes(normalizedQuery));
  const baseMatched =
    baseSearchMatches &&
    (!hasLocationFilters || normalizedLocationIds.includes(baseLocationId));

  let matchedVariantNames = getShoppingBrowseVariantHomeRows(item)
    .filter((entry) => {
      const variantName = String(entry?.variant || '')
        .trim()
        .toLowerCase();
      if (!variantName) return false;
      const searchMatches = !hasQuery || variantName.includes(normalizedQuery);
      const locationMatches =
        !hasLocationFilters ||
        normalizedLocationIds.includes(
          normalizeShoppingBrowseLocationId(entry?.homeLocation),
        );
      return searchMatches && locationMatches;
    })
    .map((entry) => String(entry.variant || '').trim())
    .filter(Boolean);

  // Item-name search should still surface each variant under its own home section.
  if (hasQuery && baseSearchMatches && matchedVariantNames.length === 0) {
    matchedVariantNames = getShoppingBrowseVariantHomeRows(item)
      .filter((entry) => {
        const variantName = String(entry?.variant || '')
          .trim()
          .toLowerCase();
        if (!variantName) return false;
        if (!hasLocationFilters) return true;
        return normalizedLocationIds.includes(
          normalizeShoppingBrowseLocationId(entry?.homeLocation),
        );
      })
      .map((entry) => String(entry.variant || '').trim())
      .filter(Boolean);
  }

  const splitHomeLocationCount = getShoppingBrowseLocationIds(item).filter(
    (id) => id !== 'none',
  ).length;

  return {
    baseMatched,
    matchedVariantNames,
    variantNameToShow:
      matchedVariantNames.length === 1 &&
      (!baseMatched ||
        (hasLocationFilters &&
          (!normalizedLocationIds.includes(baseLocationId) ||
            (hasQuery && splitHomeLocationCount > 1))))
        ? matchedVariantNames[0]
        : '',
  };
}

function getShoppingBrowseBrowseFilterOptions(options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const normalizedLocationIds = Array.from(
    new Set(
      (Array.isArray(options?.locationIds) ? options.locationIds : [])
        .map((value) => normalizeShoppingBrowseLocationId(value))
        .filter(Boolean),
    ),
  );
  return {
    normalizedQuery,
    normalizedLocationIds,
    hasQuery: !!normalizedQuery,
    hasLocationFilters: normalizedLocationIds.length > 0,
  };
}

function shoppingBrowseItemMatchesBrowseFilters(item, options = {}) {
  const { hasQuery, hasLocationFilters } =
    getShoppingBrowseBrowseFilterOptions(options);
  if (!hasLocationFilters && !hasQuery) return true;
  const matchInfo = getShoppingBrowseMatchInfo(item, options);
  return matchInfo.baseMatched || matchInfo.matchedVariantNames.length > 0;
}

function getShoppingBrowseMatchedLocationIds(item, options = {}) {
  const { hasQuery, hasLocationFilters } =
    getShoppingBrowseBrowseFilterOptions(options);
  if (!hasQuery && !hasLocationFilters) {
    return getShoppingBrowseLocationIds(item);
  }
  const matchInfo = getShoppingBrowseMatchInfo(item, options);
  const matched = new Set();
  if (matchInfo.baseMatched) {
    matched.add(normalizeShoppingBrowseLocationId(item?.locationAtHome));
  }
  getShoppingBrowseVariantHomeRows(item).forEach((entry) => {
    const variantKey = String(entry?.variant || '')
      .trim()
      .toLowerCase();
    if (
      !matchInfo.matchedVariantNames.some(
        (name) =>
          String(name || '')
            .trim()
            .toLowerCase() === variantKey,
      )
    ) {
      return;
    }
    matched.add(normalizeShoppingBrowseLocationId(entry?.homeLocation));
  });
  return Array.from(matched);
}

function getShoppingBrowsePrimaryLocationBucketId(
  item,
  options = {},
  bucketOrderIds = [],
) {
  const order = Array.isArray(bucketOrderIds) ? bucketOrderIds : [];
  const { hasQuery, hasLocationFilters } =
    getShoppingBrowseBrowseFilterOptions(options);
  const idSet = new Set(
    hasQuery || hasLocationFilters
      ? getShoppingBrowseMatchedLocationIds(item, options)
      : getShoppingBrowseLocationIds(item),
  );
  for (let i = 0; i < order.length; i++) {
    if (idSet.has(order[i])) return order[i];
  }
  return 'none';
}

function orderShoppingBrowseLocationBucketIds(locationIds, bucketOrderIds = []) {
  const order = Array.isArray(bucketOrderIds) ? bucketOrderIds : [];
  const idSet = new Set(
    (Array.isArray(locationIds) ? locationIds : []).map((rawId) =>
      normalizeShoppingBrowseLocationId(rawId),
    ),
  );
  const bucketIds = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (idSet.has(id)) bucketIds.push(id);
  }
  if (!bucketIds.length) bucketIds.push('none');
  return bucketIds;
}

function getShoppingBrowseLocationSortBucketIds(
  item,
  options = {},
  bucketOrderIds = [],
) {
  const order = Array.isArray(bucketOrderIds) ? bucketOrderIds : [];
  const { hasQuery, hasLocationFilters } =
    getShoppingBrowseBrowseFilterOptions(options);
  if (hasLocationFilters) {
    return [
      getShoppingBrowsePrimaryLocationBucketId(item, options, order),
    ];
  }
  const locationIds = hasQuery
    ? getShoppingBrowseMatchedLocationIds(item, options)
    : getShoppingBrowseLocationIds(item);
  return orderShoppingBrowseLocationBucketIds(locationIds, order);
}

function getShoppingBrowsePlannerVariantNames(item, options = {}) {
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  const { hasQuery } = getShoppingBrowseBrowseFilterOptions(options);
  if (!hasQuery && getShoppingBrowseEffectiveLocationIds(options).length === 0) {
    return {
      includeDefault: true,
      variantNames: variants.slice(),
    };
  }
  const matchInfo = getShoppingBrowseMatchInfo(item, options);
  const matchedKeys = new Set(
    matchInfo.matchedVariantNames.map((name) =>
      String(name || '')
        .trim()
        .toLowerCase(),
    ),
  );
  return {
    includeDefault: matchInfo.baseMatched,
    variantNames: variants.filter((variantName) =>
      matchedKeys.has(
        String(variantName || '')
          .trim()
          .toLowerCase(),
      ),
    ),
  };
}

function formatShoppingBrowseItemLabel(baseLabel, item, options = {}) {
  const resolvedBaseLabel =
    String(baseLabel || '').trim() || String(item?.name || '').trim();
  if (!resolvedBaseLabel) return '';
  const matchInfo = getShoppingBrowseMatchInfo(item, options);
  return matchInfo.variantNameToShow
    ? `${resolvedBaseLabel} (${matchInfo.variantNameToShow})`
    : resolvedBaseLabel;
}

function isShoppingBrowseBaseVariantName(variantName) {
  const key = String(variantName || '')
    .trim()
    .toLowerCase();
  return !key || key === 'default' || key === 'base' || key === 'any';
}

function formatShoppingBrowsePlannerRemoveLabel(baseDisplayName, variantName) {
  const base = String(baseDisplayName || '').trim();
  if (isShoppingBrowseBaseVariantName(variantName)) return base;
  const variant = String(variantName || '').trim();
  if (!base) return variant;
  if (!variant) return base;
  return `${variant} ${base}`;
}

function normalizeShoppingBrowseTagKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function normalizeShoppingBrowseTagKeys(rawTagKeys) {
  const seen = new Set();
  const out = [];
  (Array.isArray(rawTagKeys) ? rawTagKeys : []).forEach((raw) => {
    const key = normalizeShoppingBrowseTagKey(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

function getShoppingBrowseVariantTagsByName(item) {
  const map = item?.variantTagsByName;
  return map && typeof map === 'object' ? map : {};
}

function shoppingBrowseVariantTagsMatchKeys(item, variantKey, tagKeys) {
  const normalizedTagKeys = normalizeShoppingBrowseTagKeys(tagKeys);
  if (!normalizedTagKeys.length) return false;
  const variantTags = getShoppingBrowseVariantTagsByName(item);
  const tags = Array.isArray(variantTags[String(variantKey || '').trim().toLowerCase()])
    ? variantTags[String(variantKey || '').trim().toLowerCase()]
    : [];
  return normalizedTagKeys.some((tagKey) =>
    tags.some((raw) => normalizeShoppingBrowseTagKey(raw) === tagKey),
  );
}

function shoppingBrowseItemHasExplicitVariantTagMatch(item, tagKeys) {
  return getShoppingBrowseVariantsMatchingTagKeys(item, tagKeys).length > 0;
}

function getShoppingBrowseVariantsMatchingTagKeys(item, tagKeys) {
  const normalizedTagKeys = normalizeShoppingBrowseTagKeys(tagKeys);
  if (!normalizedTagKeys.length) return [];
  const namedVariants = Array.isArray(item?.variants) ? item.variants : [];
  const out = [];
  const seen = new Set();
  const pushVariant = (variantName) => {
    const key = isShoppingBrowseBaseVariantName(variantName)
      ? 'default'
      : String(variantName || '').trim();
    if (!key) return;
    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(isShoppingBrowseBaseVariantName(variantName) ? 'default' : key);
  };
  if (namedVariants.length > 0) {
    if (shoppingBrowseVariantTagsMatchKeys(item, 'default', normalizedTagKeys)) {
      pushVariant('default');
    }
    namedVariants.forEach((variantName) => {
      const variantKey = String(variantName || '').trim().toLowerCase();
      if (!variantKey) return;
      if (shoppingBrowseVariantTagsMatchKeys(item, variantKey, normalizedTagKeys)) {
        pushVariant(variantName);
      }
    });
    return out;
  }
  if (shoppingBrowseVariantTagsMatchKeys(item, 'default', normalizedTagKeys)) {
    pushVariant('default');
    return out;
  }
  // Legacy rows cached before per-variant tags existed: union tags imply base only.
  const unionTags = Array.isArray(item?.tags) ? item.tags : [];
  if (
    normalizedTagKeys.some((tagKey) =>
      unionTags.some((raw) => normalizeShoppingBrowseTagKey(raw) === tagKey),
    )
  ) {
    pushVariant('default');
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.__shoppingBrowseLabelHelpers = {
    normalizeShoppingBrowseLocationId,
    getShoppingBrowseVariantHomeRows,
    getShoppingBrowseLocationIds,
    getShoppingBrowseMatchInfo,
    getShoppingBrowseBrowseFilterOptions,
    shoppingBrowseItemMatchesBrowseFilters,
    getShoppingBrowseMatchedLocationIds,
    getShoppingBrowseEffectiveLocationIds,
    getShoppingBrowsePrimaryLocationBucketId,
    getShoppingBrowseLocationSortBucketIds,
    getShoppingBrowsePlannerVariantNames,
    formatShoppingBrowseItemLabel,
    isShoppingBrowseBaseVariantName,
    formatShoppingBrowsePlannerRemoveLabel,
    normalizeShoppingBrowseTagKey,
    normalizeShoppingBrowseTagKeys,
    getShoppingBrowseVariantTagsByName,
    shoppingBrowseVariantTagsMatchKeys,
    shoppingBrowseItemHasExplicitVariantTagMatch,
    getShoppingBrowseVariantsMatchingTagKeys,
  };
}
// --- End shopping browse labeling helpers ---

function tableHasColumnInMain(db, tableName, colName) {
  void db;
  void tableName;
  void colName;
  return false;
}

function ensureRecipeTagsSchemaInMain(db) {
  void db;
  return false;
}

function ensureIngredientVariantTagsSchemaInMain(db) {
  void db;
  return false;
}

function ensureIngredientVariantIsDeprecatedColumnInMain(db) {
  void db;
  return false;
}

function ensureSizesSchemaInMain(db) {
  void db;
  return false;
}

function ensureUnitsSchemaInMain(db) {
  void db;
  return false;
}

async function persistLoadedDbInMain(db) {
  if (!db) return;
  await persistBinaryArrayInMain(db.export(), {});
}

async function persistBinaryArrayInMain(
  binaryArray,
  { overwriteOnly = false, failureMessage = 'Failed to save database.' } = {},
) {
  const cache = window.favoriteEatsSqliteBlobCache;
  try {
    localStorage.setItem(
      'favoriteEatsDb',
      JSON.stringify(Array.from(binaryArray)),
    );
    if (cache && typeof cache.write === 'function') {
      try {
        await cache.write(binaryArray);
      } catch (err) {
        console.warn('SQLite blob IndexedDB mirror failed:', err);
      }
    }
  } catch (err) {
    if (cache && typeof cache.write === 'function') {
      await cache.write(binaryArray);
    } else {
      throw new Error(failureMessage);
    }
  }
}

const BUNDLED_FAVORITE_EATS_DB_PATH = 'assets/favorite_eats.db';
const BUNDLED_WEB_DB_ONLY_MODE = FAVORITE_EATS_BUILD.target === 'web';

function bundledFavoriteEatsDbUrl() {
  try {
    return new URL(BUNDLED_FAVORITE_EATS_DB_PATH, window.location.href).href;
  } catch (_) {
    return BUNDLED_FAVORITE_EATS_DB_PATH;
  }
}

async function fetchBundledFavoriteEatsDbBytes() {
  const res = await fetch(bundledFavoriteEatsDbUrl(), { cache: 'no-store' });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 100) return null;
  return new Uint8Array(buf);
}

function clearStoredFavoriteEatsDbBytesForWeb() {
  try {
    localStorage.removeItem('favoriteEatsDb');
  } catch (_) {}
  const cache = window.favoriteEatsSqliteBlobCache;
  if (cache && typeof cache.remove === 'function') {
    void cache.remove().catch(() => {});
  }
}

function getStoredFavoriteEatsDbBytesForWeb() {
  try {
    const stored = localStorage.getItem('favoriteEatsDb');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.length) {
      clearStoredFavoriteEatsDbBytesForWeb();
      return null;
    }
    return new Uint8Array(parsed);
  } catch (_) {
    clearStoredFavoriteEatsDbBytesForWeb();
    return null;
  }
}

async function persistFavoriteEatsDbBytesForWeb(uints) {
  const cache = window.favoriteEatsSqliteBlobCache;
  try {
    localStorage.setItem('favoriteEatsDb', JSON.stringify(Array.from(uints)));
    if (cache && typeof cache.write === 'function') {
      try {
        await cache.write(uints);
      } catch (err) {
        console.warn('SQLite blob IndexedDB mirror failed:', err);
      }
    }
  } catch (err) {
    if (cache && typeof cache.write === 'function') {
      await cache.write(uints);
    } else {
      throw err;
    }
  }
}

/**
 * Resolves web runtime bytes: legacy localStorage, optional bundled file fetch.
 * (The bundled file was removed in the Supabase migration; fetch usually returns null.)
 */
async function ensureFavoriteEatsDbBytesForWeb() {
  if (BUNDLED_WEB_DB_ONLY_MODE) {
    clearStoredFavoriteEatsDbBytesForWeb();
    try {
      return await fetchBundledFavoriteEatsDbBytes();
    } catch (err) {
      console.warn('Bundled DB fetch failed:', err);
      return null;
    }
  }

  const storedBytes = getStoredFavoriteEatsDbBytesForWeb();
  if (storedBytes) return storedBytes;

  const cache = window.favoriteEatsSqliteBlobCache;
  if (cache && typeof cache.read === 'function') {
    try {
      const idbBytes = await cache.read();
      if (idbBytes instanceof Uint8Array && idbBytes.length) return idbBytes;
    } catch (err) {
      console.warn('SQLite blob IndexedDB read failed:', err);
    }
  }

  let bundledBytes = null;
  try {
    bundledBytes = await fetchBundledFavoriteEatsDbBytes();
  } catch (err) {
    console.warn('Bundled DB fetch failed:', err);
  }

  if (!bundledBytes) return null;
  await persistFavoriteEatsDbBytesForWeb(bundledBytes);
  return bundledBytes;
}

async function loadFavoriteEatsDbBytesForCurrentRuntime() {
  const browserBytes = await ensureFavoriteEatsDbBytesForWeb();
  if (browserBytes instanceof Uint8Array && browserBytes.length) {
    return browserBytes;
  }

  throw new Error(
    FAVORITE_EATS_BUILD.target === 'web'
      ? 'Bundled web database could not be loaded.'
      : 'No database loaded in browser storage.',
  );
}

async function openFavoriteEatsDbForCurrentRuntime() {
  await ensureSqlJsReady();
  const bytes = await loadFavoriteEatsDbBytesForCurrentRuntime();
  return new SQL.Database(bytes);
}

async function persistDbForCurrentRuntime(db, options = {}) {
  if (!db) return;
  const binaryArray = db.export();
  await persistBinaryArrayInMain(binaryArray, options);
}

// SQL.js path retired; catalog repair is `dataService.ensureIngredientBaseVariants`.
function ensureIngredientBaseVariantsInMain(db) {
  void db;
  return 0;
}

// SQL.js path retired; synonym orphan cleanup is `dataService.pruneOrphanedIngredientSynonyms`.
function pruneOrphanedIngredientSynonymsInMain(db) {
  void db;
  return 0;
}

async function ensureIngredientLemmaMaintenanceInMain(db) {
  if (isDemoSessionActive()) return 0;
  let synonymPruned = 0;
  try {
    if (
      favoriteEatsShouldUseSupabaseDataDoor() &&
      window.dataService &&
      typeof window.dataService.pruneOrphanedIngredientSynonyms === 'function'
    ) {
      window.dataService.useSupabase = true;
      synonymPruned =
        Number(await window.dataService.pruneOrphanedIngredientSynonyms()) || 0;
    } else if (db) {
      synonymPruned = Number(pruneOrphanedIngredientSynonymsInMain(db)) || 0;
    }
  } catch (err) {
    console.warn('⚠️ Failed to prune ingredient synonym orphans:', err);
    synonymPruned = 0;
    if (db) {
      try {
        synonymPruned = Number(pruneOrphanedIngredientSynonymsInMain(db)) || 0;
      } catch (err2) {
        console.warn('⚠️ SQLite synonym orphan prune fallback failed:', err2);
        synonymPruned = 0;
      }
    }
  }

  if (!db) {
    let baseVariantChangedCountCloud = 0;
    if (
      favoriteEatsShouldUseSupabaseDataDoor() &&
      window.dataService &&
      typeof window.dataService.ensureIngredientBaseVariants === 'function'
    ) {
      try {
        window.dataService.useSupabase = true;
        baseVariantChangedCountCloud =
          Number(await window.dataService.ensureIngredientBaseVariants()) || 0;
      } catch (err) {
        console.warn(
          '⚠️ Failed to repair ingredient base variants (catalog):',
          err,
        );
        baseVariantChangedCountCloud = 0;
      }
    }
    const changedCountCloud =
      (synonymPruned > 0 ? synonymPruned : 0) +
      (baseVariantChangedCountCloud > 0 ? baseVariantChangedCountCloud : 0);
    if (synonymPruned > 0) {
      console.info(
        `ℹ️ Removed ${synonymPruned} orphaned ingredient synonym row(s) (catalog).`,
      );
    }
    if (baseVariantChangedCountCloud > 0) {
      console.info(
        `ℹ️ Repaired ${baseVariantChangedCountCloud} ingredient base variant row(s) (catalog).`,
      );
    }
    return changedCountCloud > 0 ? changedCountCloud : 0;
  }

  let lemmaChangedCount = 0;
  let baseVariantChangedCount = 0;
  try {
    if (typeof window.bridge?.regenerateAllIngredientLemmas === 'function') {
      lemmaChangedCount =
        Number(window.bridge.regenerateAllIngredientLemmas(db)) || 0;
    }
  } catch (err) {
    console.warn('⚠️ Failed to regenerate ingredient lemmas:', err);
    lemmaChangedCount = 0;
  }
  try {
    baseVariantChangedCount =
      Number(ensureIngredientBaseVariantsInMain(db)) || 0;
  } catch (err) {
    console.warn('⚠️ Failed to repair ingredient base variants:', err);
    baseVariantChangedCount = 0;
  }
  const changedCount =
    (Number.isFinite(lemmaChangedCount) ? lemmaChangedCount : 0) +
    (Number.isFinite(baseVariantChangedCount) ? baseVariantChangedCount : 0) +
    (Number.isFinite(synonymPruned) && synonymPruned > 0 ? synonymPruned : 0);
  if (changedCount <= 0) return 0;
  try {
    await persistLoadedDbInMain(db);
    if (lemmaChangedCount > 0) {
      console.info(
        `ℹ️ Regenerated ${lemmaChangedCount} ingredient lemma value(s).`,
      );
    }
    if (baseVariantChangedCount > 0) {
      console.info(
        `ℹ️ Repaired ${baseVariantChangedCount} ingredient base variant row(s).`,
      );
    }
    if (synonymPruned > 0) {
      console.info(
        `ℹ️ Removed ${synonymPruned} orphaned ingredient synonym row(s).`,
      );
    }
  } catch (err) {
    console.warn('⚠️ Failed to persist ingredient maintenance updates:', err);
  }
  return changedCount;
}

function deriveIngredientLemmaInMain(rawTitle) {
  if (typeof window.bridge?.deriveIngredientLemma === 'function') {
    return String(window.bridge.deriveIngredientLemma(rawTitle) || '').trim();
  }
  return String(rawTitle || '').trim();
}

const LAST_PAGE_SESSION_KEY = 'favoriteEats:last-page-id';
const SHOPPING_FILTER_CHIPS_SESSION_KEY_LEGACY =
  'favoriteEats:shopping-filter-chips';
const SHOPPING_FILTER_CHIPS_SESSION_KEY_PREFIX =
  'favoriteEats:shopping-filter-chips';
/** Prefix for Items-page tag filter chip ids (avoids collisions with home location ids). */
const SHOPPING_TAG_FILTER_PREFIX = 'tag:';
const SHOPPING_SCROLL_RESTORE_SESSION_KEY =
  'favoriteEats:shopping-scroll-restore-y';
const SHOPPING_ITEMS_SORT_SESSION_KEY = 'favoriteEats:shopping-items-sort:v1';
const SHOPPING_ITEMS_SORT_MODE_AZ = 'a-z';
const SHOPPING_ITEMS_SORT_MODE_LOCATION = 'location';
const ITEMS_BROWSE_HOME_COLLAPSED_SESSION_KEY =
  'favoriteEats:items-browse-home-collapsed';
/** One-shot: scroll this aisle card into view after store editor loads. */
const STORE_EDITOR_FOCUS_AISLE_SESSION_KEY =
  'favoriteEats:store-editor-focus-aisle-id';
/** Dev: sessionStorage `favoriteEats:store-jump-debug=1` → search click scrolls list to bottom. */
const STORE_EDITOR_JUMP_DEBUG_SESSION_KEY = 'favoriteEats:store-jump-debug';
// --- Shopping plan helpers (tests extract this block) ---
const SHOPPING_PLAN_STORAGE_KEY = 'favoriteEats:shopping-plan:v1';
/** Same-tab backup when `localStorage` is blocked or unreadable (legacy bridge + local-only mode). */
const SHOPPING_PLAN_SESSION_MIRROR_KEY =
  'favoriteEats:shopping-plan:session-mirror:v1';

function resolveShoppingPlanStorageKey() {
  try {
    if (typeof window.favoriteEatsGetShoppingPlanStorageKey === 'function') {
      return window.favoriteEatsGetShoppingPlanStorageKey();
    }
  } catch (_) {}
  return SHOPPING_PLAN_STORAGE_KEY;
}

function resolveShoppingPlanSessionMirrorKey() {
  try {
    if (typeof window.favoriteEatsGetShoppingPlanSessionMirrorKey === 'function') {
      return window.favoriteEatsGetShoppingPlanSessionMirrorKey();
    }
  } catch (_) {}
  return SHOPPING_PLAN_SESSION_MIRROR_KEY;
}
/** Legacy aggregate-key separator (still parsed when loading old storage). Postgres rejects U+0000 in json/text. */
const SHOPPING_PLAN_LEGACY_KEY_SEP = '\x00';
/** Aggregate-key separator: ASCII Record Separator (U+001E). Safe for Postgres JSON/RPC payloads. */
const SHOPPING_PLAN_KEY_SEP = '\x1e';
/** When set, `itemSelections` keys use this prefix + `ingredient_variants.id` (stable across renames). */
const SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX = 'iv:';
let shoppingPlanCache = null;
let shoppingStateHydrationPromise = null;
let shoppingStateRemoteWriteSuppressed = false;
let shoppingListDocAuthoritativeCache = null;
let shoppingPlanLegacyBridgeAttempted = false;
let shoppingListLegacyBridgeAttempted = false;
/** True after a successful `load_shopping_state` apply; only queued `shoppingListDoc` waits (plan always saves). */
let shoppingStateSnapshotLoaded = false;
const REMOTE_SHOPPING_AUTHORITY_SESSION_KEY =
  'favoriteEats:remote-shopping-authority:v1';
/** Slice 3: after first remote apply, Supabase owns plan/list; localStorage is cache-only. */
let favoriteEatsRemoteShoppingAuthorityEstablished = false;
/** Latest `maintainShoppingPlanStorageWithDb` result from invalidation refresh (shared by UI hooks). */
let favoriteEatsInvalidationMaintainOut = null;

function restoreFavoriteEatsRemoteShoppingAuthorityFromSession() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    favoriteEatsRemoteShoppingAuthorityEstablished =
      sessionStorage.getItem(REMOTE_SHOPPING_AUTHORITY_SESSION_KEY) === '1';
  } catch (_) {}
}

function isFavoriteEatsRemoteShoppingAuthorityEstablished() {
  return !!favoriteEatsRemoteShoppingAuthorityEstablished;
}

function markFavoriteEatsRemoteShoppingAuthorityEstablished() {
  if (favoriteEatsRemoteShoppingAuthorityEstablished) return;
  favoriteEatsRemoteShoppingAuthorityEstablished = true;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(REMOTE_SHOPPING_AUTHORITY_SESSION_KEY, '1');
  } catch (_) {}
}

/** Drop warm plan/list session cache so the next boot hydrates from Supabase. */
function clearFavoriteEatsShoppingSessionCache() {
  shoppingPlanCache = null;
  shoppingListDocAuthoritativeCache = null;
  shoppingStateSnapshotLoaded = false;
  shoppingPlanLegacyBridgeAttempted = false;
  shoppingListLegacyBridgeAttempted = false;
  shoppingStateHydrationPromise = null;
  favoriteEatsRemoteShoppingAuthorityEstablished = false;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(REMOTE_SHOPPING_AUTHORITY_SESSION_KEY);
      sessionStorage.removeItem(resolveShoppingPlanSessionMirrorKey());
      sessionStorage.removeItem(resolveShoppingListDocSessionMirrorKey());
    } catch (_) {}
  }
  if (typeof localStorage !== 'undefined' && shouldUseRemoteShoppingState()) {
    try {
      localStorage.removeItem(resolveShoppingPlanStorageKey());
    } catch (_) {}
  }
  const store = window.favoriteEatsStore;
  if (store && typeof store.clearSessionSnapshot === 'function') {
    try {
      store.clearSessionSnapshot();
    } catch (_) {}
  }
  favoriteEatsShoppingHydrateForceRemoteAfterAuth = true;
}

function patchFavoriteEatsStorePlanFromMainCache(plan) {
  const store = window.favoriteEatsStore;
  if (!store || typeof store.patchOptimisticPlan !== 'function') return;
  try {
    store.patchOptimisticPlan(plan);
  } catch (err) {
    console.warn('patchOptimisticPlan failed:', err);
  }
}

function shouldRunShoppingLegacyBridge() {
  return (
    shouldUseRemoteShoppingState() &&
    !isFavoriteEatsRemoteShoppingAuthorityEstablished()
  );
}

restoreFavoriteEatsRemoteShoppingAuthorityFromSession();
/**
 * Supersedes in-flight `load_shopping_state` applies when Realtime, a forced hydrate,
 * or a save echo indicates newer remote intent (see docs/app-performance-optimization.md).
 */
let shoppingStateRemoteApplyGeneration = 0;
/**
 * `saveShoppingState` calls that include `plan` (queued or awaited). Hydrate must not
 * apply `load_shopping_state` over local caches until these settle — otherwise a fetch
 * can return rows from before the write and wipe servings/plan edits (Recipes page).
 */
let shoppingPlanRemoteSaveInFlight = 0;
let shoppingPlanMutationBatchDepth = 0;
let shoppingPlanMutationBatchDeferredSave = false;
let shoppingPlanMutationBatchAllowEmptyRemoteSave = false;
const SHOPPING_PLAN_SAVE_DEBOUNCE_MS = 400;
let shoppingPlanCoalescedSaveTimer = null;
let shoppingPlanCoalescedSaveAllowEmpty = false;
let shoppingPlanCoalescedPendingPlan = null;
let shoppingPlanCoalescedSaveDrainPromise = null;
let favoriteEatsShoppingPlanRealtimeUnsub = null;
let favoriteEatsShoppingListRealtimeUnsub = null;
let favoriteEatsShoppingPlanRealtimeDebounceTimer = null;
let favoriteEatsShoppingListRealtimeDebounceTimer = null;
const PLAN_SELECTED_ITEMS_UI_REFRESH_DEBOUNCE_MS = 80;
let favoriteEatsPlanSelectedItemsUiRefreshTimer = null;
let favoriteEatsRemotePlanUiRefreshRequestSeq = 0;
/** UI callbacks after remote plan refresh (regen merge, steppers). */
let favoriteEatsRemotePlanUiRefreshHooks = [];
/** UI callbacks after list-only revision refresh (checkbox sync — no plan regen). */
let favoriteEatsRemoteListUiRefreshHooks = [];
/** Incremental list Realtime patch handlers; return true when payload was handled. */
let favoriteEatsRemoteListPatchHooks = [];
/** Incremental plan Realtime patch handlers; mirrors the list patch hook system. */
let favoriteEatsRemotePlanPatchHooks = [];
/** Hydrate ran before any hook existed (e.g. pageshow vs slow loader); flush when a refresh hook registers. */
let favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = false;
/** `'list'` | `'plan'` — which hook kind should flush a pending remote UI refresh. */
let favoriteEatsPendingRemoteShoppingUiRefreshKind = null;
let favoriteEatsShoppingVisibilityRefetchInstalled = false;
let favoriteEatsShoppingPageshowRefetchInstalled = false;
/** Set on auth boundary logout/login; blocks revision fast-path until a full remote hydrate applies. */
let favoriteEatsShoppingHydrateForceRemoteAfterAuth = false;
let favoriteEatsRecipeCatalogRealtimeUnsub = null;
/** Catalog reference tables (items, stores, units, tags, sizes + joins): UI refresh hooks. */
let favoriteEatsCatalogReferenceRealtimeUnsub = null;
let favoriteEatsCatalogReferenceRealtimeDebounceTimer = null;
let favoriteEatsCatalogReferenceUiRefreshHooks = [];
let favoriteEatsCatalogReferencePendingComposition = false;
let favoriteEatsCatalogReferencePendingReference = false;
const FAVORITE_EATS_CATALOG_SURFACES_REFRESH_BC =
  'favorite-eats-catalog-surfaces-refresh';
const FAVORITE_EATS_CATALOG_SURFACES_STORAGE_KEY =
  'fe:catalog-surfaces-refresh:v1';
let favoriteEatsCatalogSurfacesCrossTabInstalled = false;
let favoriteEatsRecipeCatalogCompositionUnsub = null;
let favoriteEatsAppActivityPresenceUnsub = null;

function makeIngredientVariantShoppingPlanKey(ingredientVariantId) {
  const n = Math.trunc(Number(ingredientVariantId));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${n}`;
}

function parseIngredientVariantIdFromShoppingPlanKey(key) {
  const s = String(key || '').trim();
  if (!s.startsWith(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX)) return null;
  const n = Number(s.slice(SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Items browse: map iv:{id} selection keys to listShoppingListPlanRows aggregate keys. */
function resolveBrowseIvKeyForCatalogItem(catalogItem, rawVariantName = '') {
  if (!catalogItem || typeof catalogItem !== 'object') return '';
  const variantName = String(rawVariantName || '').trim();
  if (!variantName || isIngredientBaseVariantName(variantName)) {
    const defVid = Math.trunc(Number(catalogItem.defaultVariantId));
    return Number.isFinite(defVid) && defVid > 0
      ? makeIngredientVariantShoppingPlanKey(defVid)
      : '';
  }
  const map = catalogItem.variantIdByName;
  if (!map || typeof map !== 'object') return '';
  const vid = Math.trunc(Number(map[variantName.toLowerCase()]));
  return Number.isFinite(vid) && vid > 0
    ? makeIngredientVariantShoppingPlanKey(vid)
    : '';
}

function resolveBrowseIvKeyForPlanRow(planRow, catalogItems) {
  const name = String(planRow?.name || '').trim();
  if (!name) return '';
  const list = Array.isArray(catalogItems) ? catalogItems : [];
  const item =
    list.find(
      (row) =>
        String(row?.name || '')
          .trim()
          .toLowerCase() === name.toLowerCase(),
    ) || null;
  if (!item) return '';
  return resolveBrowseIvKeyForCatalogItem(item, planRow?.variantName || '');
}

function resolveShoppingBrowsePlanRowAggregateKey(planKey, catalogItems) {
  const key = String(planKey || '').trim();
  if (!key) return '';
  const ivId = parseIngredientVariantIdFromShoppingPlanKey(key);
  if (ivId == null) return key;
  const list = Array.isArray(catalogItems) ? catalogItems : [];
  for (const item of list) {
    const itemName = String(item?.name || '').trim();
    if (!itemName) continue;
    const defVid = Math.trunc(Number(item.defaultVariantId));
    if (Number.isFinite(defVid) && defVid === ivId) {
      return getShoppingPlanAggregateKey(itemName, 'default');
    }
    const map = item.variantIdByName;
    if (!map || typeof map !== 'object') continue;
    for (const [variantLc, rawVid] of Object.entries(map)) {
      if (Math.trunc(Number(rawVid)) !== ivId) continue;
      const variants = Array.isArray(item.variants) ? item.variants : [];
      const proper =
        variants.find(
          (v) => String(v || '').trim().toLowerCase() === variantLc,
        ) || variantLc;
      return getShoppingPlanAggregateKey(itemName, proper);
    }
  }
  return key;
}

if (typeof window !== 'undefined') {
  window.__shoppingBrowsePlanRowHelpers = {
    resolveBrowseIvKeyForCatalogItem,
    resolveBrowseIvKeyForPlanRow,
    resolveShoppingBrowsePlanRowAggregateKey,
  };
}

// SQL.js `iv:` upgrade path removed; stable keys come from `resolvePersistedShoppingItemKeyUnified`.
function resolvePersistedShoppingItemKeyForDb(db, name, variantName) {
  void db;
  const raw = String(name || '').trim();
  if (!raw) return '';
  return getShoppingPlanAggregateKey(raw, variantName);
}

async function resolvePersistedShoppingItemKeyUnified(db, name, variantName) {
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.resolvePersistedShoppingPlanItemKey === 'function'
  ) {
    try {
      window.dataService.useSupabase = true;
      const key = await window.dataService.resolvePersistedShoppingPlanItemKey({
        name,
        variantName,
      });
      if (key) return key;
    } catch (err) {
      console.warn('resolvePersistedShoppingPlanItemKey failed:', err);
    }
  }
  return resolvePersistedShoppingItemKeyForDb(db, name, variantName);
}

function loadRecipePlannerServingsMap() {
  const api = window.favoriteEatsRecipePlannerServings || {};
  if (typeof api.loadMap === 'function') return api.loadMap();
  try {
    const raw = localStorage.getItem(
      window.favoriteEatsStorageKeys.recipePlannerServings,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (_) {
    return {};
  }
}

function getRecipePlannerServingsStoredValue(recipeOrId, recipe = null) {
  const recipeModel =
    recipe && typeof recipe === 'object'
      ? recipe
      : recipeOrId && typeof recipeOrId === 'object'
        ? recipeOrId
        : null;
  const fallbackRecipeId =
    recipeModel == null ? Number(recipeOrId) : Number(recipeModel?.id);
  const rid =
    Number.isFinite(fallbackRecipeId) && fallbackRecipeId > 0
      ? Math.trunc(fallbackRecipeId)
      : null;
  if (rid != null) {
    const planKey = String(rid);
    const sel = getShoppingPlanRecipeSelections()[planKey];
    const root = getShoppingPlanRecipeSelectionRoots()[planKey];
    const rawPlan =
      sel?.servingsOverride != null
        ? sel.servingsOverride
        : sel?.servings_override != null
          ? sel.servings_override
          : root?.servingsOverride != null
            ? root.servingsOverride
            : root?.servings_override;
    if (rawPlan != null) {
      const fromPlan = Number(rawPlan);
      if (Number.isFinite(fromPlan) && fromPlan > 0) {
        const api = window.favoriteEatsRecipePlannerServings || {};
        if (
          recipeModel &&
          typeof api.getBounds === 'function' &&
          typeof api.clampValue === 'function'
        ) {
          const bounds = api.getBounds(recipeModel);
          if (bounds) {
            const clamped = api.clampValue(fromPlan, bounds);
            if (clamped != null) return clamped;
          }
        }
        return Math.round(fromPlan * 2) / 2;
      }
    }
  }
  const api = window.favoriteEatsRecipePlannerServings || {};
  if (typeof api.getStoredValue === 'function') {
    return api.getStoredValue(recipeModel, {
      fallbackRecipeId,
      scrubInvalid: true,
    });
  }
  const normalizedId = Number(recipeOrId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  const raw = loadRecipePlannerServingsMap()[String(Math.trunc(normalizedId))];
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric * 2) / 2
    : null;
}

if (typeof window !== 'undefined') {
  /** Plan-aware servings (merged `servingsOverride` + planner map); used by recipe list priming in `recipeEditor.js`. */
  window.favoriteEatsGetRecipePlannerServingsStoredValueForUi = (
    recipeOrId,
    recipe = null,
  ) => getRecipePlannerServingsStoredValue(recipeOrId, recipe);
}

function getShoppingPlanAggregateKey(name, variantName = '') {
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase();
  const normalizedVariant = String(variantName || '')
    .trim()
    .toLowerCase();
  if (!normalizedName) return '';
  if (
    !normalizedVariant ||
    normalizedVariant === INGREDIENT_BASE_VARIANT_NAME
  ) {
    return normalizedName;
  }
  return `${normalizedName}${SHOPPING_PLAN_KEY_SEP}${normalizedVariant}`;
}

/** First separator index when key encodes base+variant (prefers leftmost of legacy NUL or current RS). */
function findShoppingPlanAggregateSeparatorIndex(key) {
  const k = String(key || '');
  const iNul = k.indexOf(SHOPPING_PLAN_LEGACY_KEY_SEP);
  const iRs = k.indexOf(SHOPPING_PLAN_KEY_SEP);
  if (iNul < 0) return iRs;
  if (iRs < 0) return iNul;
  return Math.min(iNul, iRs);
}

/**
 * @returns {string|null} variant lower, or `''` if `key` is only base, or `null` if not under this base
 */
function getShoppingPlanVariantSuffixAfterBase(baseLower, key) {
  const k = String(key || '');
  const b = String(baseLower || '');
  if (k === b) return '';
  for (const sep of [SHOPPING_PLAN_KEY_SEP, SHOPPING_PLAN_LEGACY_KEY_SEP]) {
    const prefix = b + sep;
    if (k.startsWith(prefix)) {
      const rest = k.slice(prefix.length).toLowerCase();
      return rest === INGREDIENT_BASE_VARIANT_NAME ? '' : rest;
    }
  }
  return null;
}

function formatShoppingPlanQuantity(quantity) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(Number(numeric.toFixed(2)));
}

function normalizeShoppingPlanStoreIdList(rawStoreIds) {
  const out = [];
  const seen = new Set();
  (Array.isArray(rawStoreIds) ? rawStoreIds : []).forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!Number.isFinite(storeId) || storeId <= 0 || seen.has(storeId)) return;
    seen.add(storeId);
    out.push(storeId);
  });
  return out;
}

function normalizeShoppingPlanStoreOrder(rawStoreOrder) {
  return normalizeShoppingPlanStoreIdList(rawStoreOrder);
}

function normalizeShoppingPlanSelectedStoreIds(rawSelectedStoreIds) {
  return normalizeShoppingPlanStoreIdList(rawSelectedStoreIds);
}

function createEmptyShoppingPlan() {
  return {
    version: 1,
    itemSelections: {},
    recipeSelections: {},
    /** User-toggled recipes only; `recipeSelections` is merged (roots + implied linked). */
    recipeSelectionRoots: {},
    storeOrder: [],
    selectedStoreIds: [],
  };
}

function normalizeShoppingPlan(rawPlan) {
  const source =
    rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
      ? rawPlan
      : {};
  const rawSelections =
    source.itemSelections &&
    typeof source.itemSelections === 'object' &&
    !Array.isArray(source.itemSelections)
      ? source.itemSelections
      : {};
  const rawRecipeSelections =
    source.recipeSelections &&
    typeof source.recipeSelections === 'object' &&
    !Array.isArray(source.recipeSelections)
      ? source.recipeSelections
      : {};
  const rawRecipeSelectionRoots =
    source.recipeSelectionRoots &&
    typeof source.recipeSelectionRoots === 'object' &&
    !Array.isArray(source.recipeSelectionRoots)
      ? source.recipeSelectionRoots
      : null;
  const storeOrder = normalizeShoppingPlanStoreOrder(source.storeOrder);
  const selectedStoreIds = normalizeShoppingPlanSelectedStoreIds(
    source.selectedStoreIds,
  );
  const itemSelections = {};
  const recipeSelections = {};

  // Sorted keys so JSON.stringify(normalizeShoppingPlan(...)) matches across
  // server payloads vs client-built plans (avoids spurious save_shopping_state).
  Object.keys(rawSelections)
    .slice()
    .sort((a, b) => String(a).localeCompare(String(b)))
    .forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      const rawEntry = rawSelections[rawKey];
      const entry =
        rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
          ? rawEntry
          : {};
      const quantityUnspecified =
        entry.quantityUnspecified === true ||
        entry.quantity_unspecified === true;
      const quantityRaw = Number(entry.quantity);
      const quantity = Number.isFinite(quantityRaw)
        ? Number(quantityRaw.toFixed(4))
        : 0;
      if (!quantityUnspecified && Math.abs(quantity) < 1e-9) return;
      const nextEntry = {
        key,
        name: String(entry.name || entry.itemName || '').trim(),
        variantName: String(entry.variantName || '').trim(),
        quantity: quantityUnspecified ? 0 : quantity,
      };
      if (quantityUnspecified) {
        nextEntry.quantityUnspecified = true;
      }
      const rawIv = Number(entry.ingredientVariantId);
      if (Number.isFinite(rawIv) && rawIv > 0) {
        nextEntry.ingredientVariantId = Math.trunc(rawIv);
      } else {
        const fromKey = parseIngredientVariantIdFromShoppingPlanKey(key);
        if (fromKey) {
          nextEntry.ingredientVariantId = fromKey;
        }
      }
      itemSelections[key] = nextEntry;
    });

  Object.keys(rawRecipeSelections)
    .slice()
    .sort((a, b) => String(a).localeCompare(String(b)))
    .forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      const rawEntry = rawRecipeSelections[rawKey];
      const entry =
        rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
          ? rawEntry
          : {};
      const recipeId = Number(entry.recipeId != null ? entry.recipeId : key);
      // quantity = make-count (times this recipe is in the plan), not servings.
      const quantity = Math.max(0, Math.min(99, Number(entry.quantity || 0)));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const normalizedKey = String(Math.trunc(recipeId));
      const nextRecipe = {
        key: normalizedKey,
        recipeId: Math.trunc(recipeId),
        title: String(entry.title || entry.recipeTitle || '').trim(),
        quantity,
      };
      const rawServingsOv =
        entry.servingsOverride != null
          ? Number(entry.servingsOverride)
          : entry.servings_override != null
            ? Number(entry.servings_override)
            : NaN;
      if (Number.isFinite(rawServingsOv) && rawServingsOv > 0) {
        const ring = window.favoriteEatsRecipePlannerServings;
        const rounded =
          ring && typeof ring.roundValue === 'function'
            ? ring.roundValue(rawServingsOv)
            : null;
        if (rounded != null && Number.isFinite(rounded) && rounded > 0) {
          nextRecipe.servingsOverride = rounded;
        } else {
          nextRecipe.servingsOverride = Math.round(rawServingsOv * 2) / 2;
        }
      }
      const rawInbound = Number(entry.inboundLinkDepth);
      if (Number.isFinite(rawInbound) && rawInbound >= 0) {
        nextRecipe.inboundLinkDepth = Math.min(2, Math.trunc(rawInbound));
      }
      recipeSelections[normalizedKey] = nextRecipe;
    });

  const recipeSelectionRoots = {};
  const hasRootsKey = Object.prototype.hasOwnProperty.call(
    source,
    'recipeSelectionRoots',
  );
  if (hasRootsKey && rawRecipeSelectionRoots) {
    Object.keys(rawRecipeSelectionRoots)
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((rawKey) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        const rawEntry = rawRecipeSelectionRoots[key];
        const entry =
          rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
            ? rawEntry
            : {};
        const recipeId = Number(entry.recipeId != null ? entry.recipeId : key);
        const quantity = Math.max(0, Math.min(99, Number(entry.quantity || 0)));
        if (!Number.isFinite(recipeId) || recipeId <= 0) return;
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        const normalizedKey = String(Math.trunc(recipeId));
        const nextRoot = {
          key: normalizedKey,
          recipeId: Math.trunc(recipeId),
          title: String(entry.title || entry.recipeTitle || '').trim(),
          quantity,
        };
        const rawServingsOv =
          entry.servingsOverride != null
            ? Number(entry.servingsOverride)
            : entry.servings_override != null
              ? Number(entry.servings_override)
              : NaN;
        if (Number.isFinite(rawServingsOv) && rawServingsOv > 0) {
          const ring = window.favoriteEatsRecipePlannerServings;
          const rounded =
            ring && typeof ring.roundValue === 'function'
              ? ring.roundValue(rawServingsOv)
              : null;
          if (rounded != null && Number.isFinite(rounded) && rounded > 0) {
            nextRoot.servingsOverride = rounded;
          } else {
            nextRoot.servingsOverride = Math.round(rawServingsOv * 2) / 2;
          }
        }
        recipeSelectionRoots[normalizedKey] = nextRoot;
      });
  } else {
    Object.keys(recipeSelections).forEach((k) => {
      const entry = recipeSelections[k];
      if (!entry || typeof entry !== 'object') return;
      recipeSelectionRoots[k] = { ...entry };
    });
  }

  if (
    !Object.keys(recipeSelectionRoots).length &&
    Object.keys(recipeSelections).length
  ) {
    Object.keys(recipeSelections).forEach((k) => {
      const entry = recipeSelections[k];
      if (!entry || typeof entry !== 'object') return;
      recipeSelectionRoots[k] = { ...entry };
    });
  }

  return {
    version: 1,
    itemSelections,
    recipeSelections,
    recipeSelectionRoots,
    storeOrder,
    selectedStoreIds,
  };
}

function shoppingPlanHasSelections(plan) {
  const normalized = normalizeShoppingPlan(plan);
  return (
    Object.keys(normalized.itemSelections || {}).length > 0 ||
    Object.keys(normalized.recipeSelections || {}).length > 0 ||
    Object.keys(normalized.recipeSelectionRoots || {}).length > 0 ||
    normalizeShoppingPlanStoreOrder(normalized.storeOrder).length > 0 ||
    normalizeShoppingPlanSelectedStoreIds(normalized.selectedStoreIds).length >
      0
  );
}

function shoppingPlanHasContentSelections(plan) {
  const normalized = normalizeShoppingPlan(plan);
  return (
    Object.keys(normalized.itemSelections || {}).length > 0 ||
    Object.keys(normalized.recipeSelections || {}).length > 0 ||
    Object.keys(normalized.recipeSelectionRoots || {}).length > 0
  );
}

function shouldUseRemoteShoppingState() {
  if (isDemoSessionActive()) return false;
  return (
    favoriteEatsDataServiceIsSupabaseActive() &&
    window.dataService &&
    typeof window.dataService.saveShoppingState === 'function'
  );
}

// --- Shopping state save guard helpers (tests extract this block) ---
function assertHydratedBeforePlanWrite() {
  if (!shouldUseRemoteShoppingState()) return { allowed: true };
  if (shoppingStateSnapshotLoaded) return { allowed: true };
  if (isFavoriteEatsRemoteShoppingAuthorityEstablished()) {
    return { allowed: true };
  }
  const store = window.favoriteEatsStore;
  if (
    store &&
    typeof store.hasAuthoritativeSnapshot === 'function' &&
    store.hasAuthoritativeSnapshot()
  ) {
    const snap =
      typeof store.getSnapshot === 'function' ? store.getSnapshot() : null;
    if (snap && shoppingPlanHasContentSelections(snap.plan)) {
      return { allowed: true };
    }
  }
  return { allowed: false, reason: 'plan_not_hydrated' };
}

function getAuthoritativeStoreSnapshotPlan() {
  const store = window.favoriteEatsStore;
  if (!store || typeof store.getSnapshot !== 'function') return null;
  const snap = store.getSnapshot();
  if (!snap || snap.plan == null) return null;
  return normalizeShoppingPlan(snap.plan);
}

function getAuthoritativeStoreSnapshotListDoc() {
  const store = window.favoriteEatsStore;
  if (!store || typeof store.getSnapshot !== 'function') return null;
  const snap = store.getSnapshot();
  if (!snap || snap.listDoc == null) return null;
  return normalizeShoppingListDoc(snap.listDoc);
}

function shoppingListDocHasPersistedRows(doc) {
  return (normalizeShoppingListDoc(doc).rows || []).length > 0;
}

async function probeRemotePlanHasSelections(planForLocalCheck = null) {
  const localPlan = normalizeShoppingPlan(
    planForLocalCheck != null ? planForLocalCheck : getShoppingPlan(),
  );
  const localContentEmpty = !shoppingPlanHasContentSelections(localPlan);

  // After local prune (e.g. catalog variant delete), the in-memory store snapshot
  // can still list deleted iv: rows while localStorage is already empty. Do not
  // short-circuit on stale store content — confirm against the server first.
  if (!localContentEmpty) {
    const storePlan = getAuthoritativeStoreSnapshotPlan();
    if (storePlan && shoppingPlanHasContentSelections(storePlan)) return true;
  }

  if (
    !window.dataService ||
    typeof window.dataService.loadShoppingState !== 'function'
  ) {
    return false;
  }
  try {
    window.dataService.useSupabase = true;
    const state = await window.dataService.loadShoppingState();
    const remotePlan =
      state && state.plan ? normalizeShoppingPlan(state.plan) : null;
    return shoppingPlanHasContentSelections(remotePlan);
  } catch (err) {
    console.warn('probeRemotePlanHasSelections failed:', err);
    return true;
  }
}

async function probeRemoteListHasPersistedRows() {
  const storeDoc = getAuthoritativeStoreSnapshotListDoc();
  if (storeDoc && shoppingListDocHasPersistedRows(storeDoc)) return true;
  if (
    !window.dataService ||
    typeof window.dataService.loadShoppingState !== 'function'
  ) {
    return false;
  }
  try {
    window.dataService.useSupabase = true;
    const state = await window.dataService.loadShoppingState();
    const remoteDoc = getShoppingListDocFromStoreOrState(state);
    return shoppingListDocHasPersistedRows(remoteDoc);
  } catch (err) {
    console.warn('probeRemoteListHasPersistedRows failed:', err);
    return true;
  }
}

async function assertSafePlanSnapshotBeforeRemoteSave(plan, options = {}) {
  if (!shouldUseRemoteShoppingState()) return { allowed: true };
  if (options.allowEmptyPlanRemoteSave) return { allowed: true };
  const normalized = normalizeShoppingPlan(plan);
  if (shoppingPlanHasContentSelections(normalized)) return { allowed: true };
  if (await probeRemotePlanHasSelections(normalized)) {
    if (
      !shoppingStateHydrationPromise &&
      !favoriteEatsShoppingPlanRealtimeDebounceTimer
    ) {
      scheduleFavoriteEatsRemoteShoppingPlanHydrate({
        force: true,
        source: 'safe plan snapshot guard',
      });
    }
    return { allowed: false, reason: 'empty_plan_would_overwrite_server' };
  }
  return { allowed: true };
}

async function assertSafeListSnapshotBeforeRemoteSave(listDoc, options = {}) {
  if (!shouldUseRemoteShoppingState()) return { allowed: true };
  if (options.allowEmptyListRemoteSave) return { allowed: true };
  const normalized = normalizeShoppingListDoc(listDoc);
  if (shoppingListDocHasPersistedRows(normalized)) return { allowed: true };
  if (
    !shoppingStateSnapshotLoaded &&
    !isFavoriteEatsRemoteShoppingAuthorityEstablished()
  ) {
    scheduleFavoriteEatsRemoteShoppingPlanHydrate({
      force: true,
      source: 'safe list snapshot hydration guard',
    });
    return { allowed: false, reason: 'list_not_hydrated' };
  }
  if (await probeRemoteListHasPersistedRows()) {
    scheduleFavoriteEatsRemoteShoppingPlanHydrate({
      force: true,
      source: 'safe list snapshot guard',
    });
    return { allowed: false, reason: 'empty_list_would_overwrite_server' };
  }
  return { allowed: true };
}

async function guardPlanRemoteSave(plan, options = {}) {
  const hydrateGuard = assertHydratedBeforePlanWrite();
  if (!hydrateGuard.allowed) {
    scheduleFavoriteEatsRemoteShoppingPlanHydrate({
      force: true,
      source: 'plan write hydration guard',
    });
    return hydrateGuard;
  }
  return assertSafePlanSnapshotBeforeRemoteSave(plan, options);
}

async function evaluateShoppingStateRemoteSaveGuards(request, options = {}) {
  if (!shouldUseRemoteShoppingState()) return { allowed: true };
  const body =
    request && typeof request === 'object' && !Array.isArray(request)
      ? request
      : {};
  const touchesPlan = Object.prototype.hasOwnProperty.call(body, 'plan');
  const touchesList = Object.prototype.hasOwnProperty.call(
    body,
    'shoppingListDoc',
  );
  if (touchesPlan) {
    const planGuard = await guardPlanRemoteSave(body.plan, options);
    if (!planGuard.allowed) return planGuard;
  }
  if (touchesList) {
    const listGuard = await assertSafeListSnapshotBeforeRemoteSave(
      body.shoppingListDoc,
      options,
    );
    if (!listGuard.allowed) return listGuard;
  }
  return { allowed: true };
}

function notifyBlockedShoppingStateRemoteSave(guardResult, request) {
  const reason = String(guardResult?.reason || 'blocked');
  const touchesPlan =
    request &&
    typeof request === 'object' &&
    Object.prototype.hasOwnProperty.call(request, 'plan');
  const touchesList =
    request &&
    typeof request === 'object' &&
    Object.prototype.hasOwnProperty.call(request, 'shoppingListDoc');
  console.warn('Blocked remote shopping state save:', reason, request);
  if (
    touchesPlan &&
    (reason === 'empty_plan_would_overwrite_server' ||
      reason === 'plan_not_hydrated')
  ) {
    uiToast(
      'Your meal plan is still loading. Changes will sync once it is ready.',
    );
  } else if (
    touchesList &&
    (reason === 'empty_list_would_overwrite_server' ||
      reason === 'list_not_hydrated')
  ) {
    console.warn('Blocked remote shopping list save:', reason);
  }
}

if (typeof window !== 'undefined') {
  window.__shoppingStateSaveGuardHelpers = {
    assertHydratedBeforePlanWrite,
    assertSafePlanSnapshotBeforeRemoteSave,
    assertSafeListSnapshotBeforeRemoteSave,
    guardPlanRemoteSave,
    evaluateShoppingStateRemoteSaveGuards,
    shoppingListDocHasPersistedRows,
    shoppingPlanHasSelections,
    shoppingPlanHasContentSelections,
  };
}
// --- End shopping state save guard helpers ---

/**
 * When a recipe is on the shopping plan, mirror web servings into `servingsOverride`
 * for multi-device. Prefer `recipeSelectionRoots` when this id has an active root row
 * with positive make-count; otherwise patch merged-only `recipeSelections`.
 */
// Charter §C: structurally separated narrow-RPC queue for recipe servings
// overrides. Lives at module scope so it survives page navigations within the
// SPA. The queue's onLocalApply mutates the local plan cache only; the flushOp
// calls catalog.set_plan_recipe_servings_override and returns updated_at so
// per-key echo suppression works against the realtime fanout.
let favoriteEatsPlanRecipeServingsQueue = null;

function applyLocalPlanRecipeServingsOverride(op) {
  if (!op || op.surface !== 'plan' || op.field !== 'servingsOverride') {
    return;
  }
  const recipeId = Number(op.entityKey);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return;
  const key = String(Math.trunc(recipeId));
  const sel = getShoppingPlanRecipeSelections()[key];
  if (!sel) return;
  const roots = getShoppingPlanRecipeSelectionRoots();
  const rootEntry = roots && typeof roots === 'object' ? roots[key] : undefined;
  const rootQtyRaw =
    rootEntry != null ? Math.max(0, Math.min(99, Number(rootEntry.quantity || 0))) : 0;
  const useRoot =
    rootEntry &&
    typeof rootEntry === 'object' &&
    Number.isFinite(rootQtyRaw) &&
    rootQtyRaw > 0;
  const nextServings = op.value == null ? null : Number(op.value);
  if (useRoot) {
    setShoppingPlanRecipeRootSelection(
      {
        recipeId,
        title: String(rootEntry.title || sel.title || '').trim(),
        quantity: rootQtyRaw,
        servingsOverride: nextServings,
      },
      { skipRemoteSave: true },
    );
  } else {
    setShoppingPlanRecipeSelection(
      {
        recipeId,
        title: String(sel.title || '').trim(),
        quantity: Number(sel.quantity || 0),
        servingsOverride: nextServings,
      },
      { skipRemoteSave: true },
    );
  }
}

async function sendPlanRecipeServingsOverrideRpc(op) {
  if (!op || op.surface !== 'plan' || op.field !== 'servingsOverride') {
    return null;
  }
  if (
    !window.dataService ||
    typeof window.dataService.setPlanRecipeServingsOverride !== 'function'
  ) {
    return null;
  }
  const recipeId = Number(op.entityKey);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return null;
  const request = {
    recipeId: Math.trunc(recipeId),
    servingsOverride: op.value == null ? null : Number(op.value),
  };
  return window.dataService.setPlanRecipeServingsOverride(request);
}

function shouldAllowRemoteSessionCommit() {
  return (
    shouldUseRemoteShoppingState() && !shoppingStateRemoteWriteSuppressed
  );
}

if (typeof window !== 'undefined') {
  window.favoriteEatsShouldAllowRemoteSessionCommit =
    shouldAllowRemoteSessionCommit;
}

async function flushPlanNarrowRpcQueuesWithSessionCommitBatch() {
  if (!shouldUseRemoteShoppingState()) return;
  const planSession = window.favoriteEatsPlanSession;
  if (planSession && typeof planSession.beginSessionCommitBatch === 'function') {
    planSession.beginSessionCommitBatch();
  }
  try {
    const queues = [
      getFavoriteEatsPlanRecipeRootQuantityQueue(),
      getFavoriteEatsPlanRecipeServingsQueue(),
      window.favoriteEatsPlanItemsQuantityQueue,
    ].filter(Boolean);
    await Promise.all(
      queues.map((queue) =>
        queue && typeof queue.flushAll === 'function'
          ? queue.flushAll()
          : Promise.resolve(),
      ),
    );
  } finally {
    if (planSession && typeof planSession.endSessionCommitBatch === 'function') {
      planSession.endSessionCommitBatch();
    }
  }
}

function shouldTriggerPlanSessionAutoSaveAfterNarrowCommit(op) {
  if (op && op.useNarrowRpc === false) return false;
  return shouldUseRemoteShoppingState();
}

function getFavoriteEatsPlanRecipeServingsQueue() {
  if (favoriteEatsPlanRecipeServingsQueue) {
    return favoriteEatsPlanRecipeServingsQueue;
  }
  if (
    !window.favoriteEatsInputSync ||
    typeof window.favoriteEatsInputSync.createCoalescedOpQueue !== 'function'
  ) {
    return null;
  }
  favoriteEatsPlanRecipeServingsQueue =
    window.favoriteEatsInputSync.createCoalescedOpQueue({
      flushDelayMs: 140,
      storageKey: 'favoriteEatsInputSync:plan:recipeServings:v1',
      storage:
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null,
      onLocalApply: applyLocalPlanRecipeServingsOverride,
      flushOp: async (op) => {
        if (!shouldUseRemoteShoppingState()) {
          return { ok: true, updated_at: null };
        }
        return sendPlanRecipeServingsOverrideRpc(op);
      },
      onFlushSuccess: () => {
        if (!shouldUseRemoteShoppingState()) return;
      },
    });
  try {
    if (typeof window !== 'undefined') {
      // Expose so recipesPage's plan-refresh hook can merge per-key pending ops.
      window.favoriteEatsPlanRecipeServingsQueue =
        favoriteEatsPlanRecipeServingsQueue;
    }
  } catch (_) {
    // ignore
  }
  return favoriteEatsPlanRecipeServingsQueue;
}

// Charter §C/D: structurally separated narrow-RPC queue for Recipes page
// plan membership (checkbox 0/1). Local apply writes recipeSelectionRoots only;
// flush calls catalog.set_plan_recipe_quantity.
let favoriteEatsPlanRecipeRootQuantityQueue = null;

function applyLocalPlanRecipeRootQuantity(op) {
  if (!op || op.surface !== 'plan' || op.field !== 'recipeRootQuantity') {
    return;
  }
  const recipeId = Number(op.entityKey);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return;
  const meta = op.meta && typeof op.meta === 'object' ? op.meta : {};
  const nextQty = Math.max(0, Math.min(99, Number(op.value || 0)));
  const isSelected = Number.isFinite(nextQty) && nextQty > 0;
  setShoppingPlanRecipeRootSelection(
    {
      recipeId,
      title: String(meta.title || '').trim(),
      quantity: isSelected ? nextQty : 0,
      servingsOverride: isSelected
        ? meta.servingsOverride == null
          ? null
          : Number(meta.servingsOverride)
        : null,
    },
    { skipRemoteSave: true },
  );
  updateShoppingPlan((plan) => {
    materializeShoppingPlanRecipeSelectionsFromRoots(plan, window.dbInstance);
  }, { skipRemoteSave: true });
}

async function sendPlanRecipeRootQuantityRpc(op) {
  if (!op || op.surface !== 'plan' || op.field !== 'recipeRootQuantity') {
    return null;
  }
  if (
    !window.dataService ||
    typeof window.dataService.setPlanRecipeQuantity !== 'function'
  ) {
    return null;
  }
  const recipeId = Number(op.entityKey);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return null;
  const meta = op.meta && typeof op.meta === 'object' ? op.meta : {};
  const nextQty = Math.max(0, Math.min(99, Number(op.value || 0)));
  const isSelected = Number.isFinite(nextQty) && nextQty > 0;
  const request = {
    recipeId: Math.trunc(recipeId),
    title: String(meta.title || '').trim(),
    quantity: isSelected ? nextQty : 0,
  };
  if (isSelected && meta.servingsOverride != null) {
    request.servingsOverride = Number(meta.servingsOverride);
  }
  return window.dataService.setPlanRecipeQuantity(request);
}

function getFavoriteEatsPlanRecipeRootQuantityQueue() {
  if (favoriteEatsPlanRecipeRootQuantityQueue) {
    return favoriteEatsPlanRecipeRootQuantityQueue;
  }
  if (
    !window.favoriteEatsInputSync ||
    typeof window.favoriteEatsInputSync.createCoalescedOpQueue !== 'function'
  ) {
    return null;
  }
  favoriteEatsPlanRecipeRootQuantityQueue =
    window.favoriteEatsInputSync.createCoalescedOpQueue({
      flushDelayMs: 120,
      storageKey: 'favoriteEatsInputSync:plan:recipeRootQuantity:v1',
      storage:
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null,
      onLocalApply: applyLocalPlanRecipeRootQuantity,
      flushOp: async (op) => {
        if (op && op.useNarrowRpc === false) {
          return { ok: true, updated_at: null };
        }
        if (!shouldUseRemoteShoppingState()) {
          return { ok: true, updated_at: null };
        }
        return sendPlanRecipeRootQuantityRpc(op);
      },
      onFlushFailure: (op) => {
        if (!op || op.previousValue === undefined) return;
        applyLocalPlanRecipeRootQuantity({
          ...op,
          value: op.previousValue,
        });
        try {
          scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly(
            'recipe root quantity flush failed',
          );
        } catch (_) {}
      },
      onFlushSuccess: (op) => {
        if (!shouldTriggerPlanSessionAutoSaveAfterNarrowCommit(op)) return;
      },
    });
  try {
    if (typeof window !== 'undefined') {
      window.favoriteEatsPlanRecipeRootQuantityQueue =
        favoriteEatsPlanRecipeRootQuantityQueue;
      window.getFavoriteEatsPlanRecipeRootQuantityQueue =
        getFavoriteEatsPlanRecipeRootQuantityQueue;
    }
  } catch (_) {
    // ignore
  }
  return favoriteEatsPlanRecipeRootQuantityQueue;
}

// Charter §F/G — per-key staleness guard for the WHOLESALE plan hydrate.
//
// The narrow set_plan_recipe_servings_override RPC bumps a row's updated_at
// and returns it; the queue records it in lastAppliedServerUpdatedAt[K].
// A subsequent load_shopping_state may have captured a snapshot BEFORE that
// commit (the realtime echo just races us). For such rows we want the local
// cache, not the snapshot. For rows we have never touched (or rows where
// the snapshot is strictly newer than our last accepted ack), accept the
// snapshot.
//
// This helper returns a shallow-cloned plan object with migrated collections
// merged per-key against the current `shoppingPlanCache`.
function mergeRemotePlanForPerKeyStaleness(remotePlan) {
  if (!remotePlan || typeof remotePlan !== 'object') return remotePlan;
  let result = remotePlan;

  // ---- recipeSelections: servingsOverride queue (recipes planner) ----
  const recipeQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeServingsQueue
      : null;
  const recipeSelections =
    remotePlan.recipeSelections &&
    typeof remotePlan.recipeSelections === 'object' &&
    !Array.isArray(remotePlan.recipeSelections)
      ? remotePlan.recipeSelections
      : null;
  if (
    recipeQueue &&
    typeof recipeQueue.getKeyState === 'function' &&
    recipeSelections
  ) {
    const currentRecipes =
      shoppingPlanCache?.recipeSelections &&
      typeof shoppingPlanCache.recipeSelections === 'object'
        ? shoppingPlanCache.recipeSelections
        : {};
    let anyReplaced = false;
    const merged = { ...recipeSelections };
    Object.keys(merged).forEach((key) => {
      const entry = merged[key];
      if (!entry || typeof entry !== 'object') return;
      const state = recipeQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'servingsOverride',
      });
      if (!state || state.lastAppliedServerUpdatedAt == null) return;
      const incomingUpdatedAt =
        entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
      if (incomingUpdatedAt == null) {
        if (
          state.hasLocalValue &&
          entry.servingsOverride !== state.lastLocalValue
        ) {
          if (currentRecipes[key]) {
            merged[key] = { ...currentRecipes[key] };
          } else {
            delete merged[key];
          }
          anyReplaced = true;
        }
        return;
      }
      const ta = Date.parse(String(incomingUpdatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) {
        if (currentRecipes[key]) {
          merged[key] = { ...currentRecipes[key] };
        } else {
          delete merged[key];
        }
        anyReplaced = true;
      }
    });
    Object.keys(currentRecipes).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(merged, key)) return;
      const state = recipeQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'servingsOverride',
      });
      if (!state) return;
      if (state.lastAppliedServerUpdatedAt == null && !state.hasLocalValue) {
        return;
      }
      merged[key] = { ...currentRecipes[key] };
      anyReplaced = true;
    });
    if (anyReplaced) {
      result = { ...result, recipeSelections: merged };
    }
  }

  // ---- itemSelections: quantity queue (items planner stepper) ----
  // Without this, a load_shopping_state snapshot captured in flight (before
  // our latest set_plan_item_quantity commit) would overwrite the local
  // stepper value during the wholesale fallback triggered by the
  // plan.documents realtime event. Mirrors the recipeSelections path above.
  const itemsQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanItemsQuantityQueue
      : null;
  const itemSelections =
    remotePlan.itemSelections &&
    typeof remotePlan.itemSelections === 'object' &&
    !Array.isArray(remotePlan.itemSelections)
      ? remotePlan.itemSelections
      : null;
  if (
    itemsQueue &&
    typeof itemsQueue.getKeyState === 'function' &&
    itemSelections
  ) {
    const currentItems =
      shoppingPlanCache?.itemSelections &&
      typeof shoppingPlanCache.itemSelections === 'object'
        ? shoppingPlanCache.itemSelections
        : {};
    let anyReplaced = false;
    const merged = { ...itemSelections };
    Object.keys(merged).forEach((key) => {
      const entry = merged[key];
      if (!entry || typeof entry !== 'object') return;
      const state = itemsQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'quantity',
      });
      if (!state || state.lastAppliedServerUpdatedAt == null) return;
      const incomingUpdatedAt =
        entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
      if (incomingUpdatedAt == null) {
        // No timestamp on incoming row — be conservative: only override if
        // the incoming value differs from the value we last applied locally
        // (local absence is also a valid current value, e.g. qty reached 0).
        const incomingQty = Number(entry.quantity);
        const incomingUnspecified =
          entry.quantityUnspecified === true ||
          entry.quantity_unspecified === true;
        const localUnspecified = state.lastLocalQuantityUnspecified === true;
        const qtyMismatch =
          state.hasLocalValue &&
          Number.isFinite(incomingQty) &&
          incomingQty !== state.lastLocalValue;
        const unspecifiedMismatch =
          state.hasLocalValue && incomingUnspecified !== localUnspecified;
        if (qtyMismatch || unspecifiedMismatch) {
          if (currentItems[key]) {
            merged[key] = { ...currentItems[key] };
          } else {
            delete merged[key];
          }
          anyReplaced = true;
        }
        return;
      }
      const ta = Date.parse(String(incomingUpdatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) {
        if (currentItems[key]) {
          merged[key] = { ...currentItems[key] };
        } else {
          delete merged[key];
        }
        anyReplaced = true;
      }
    });
    // Edge case: a row we have a pending/just-acked local create for may be
    // ABSENT from the snapshot (server captured the snapshot before the
    // INSERT committed). For each such key, splice the current cache entry
    // back into the merged map so the wholesale hydrate doesn't disappear
    // the row from local state. The companion seed function will leave the
    // queue's per-key state untouched for these keys.
    Object.keys(currentItems).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(merged, key)) return;
      const state = itemsQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'quantity',
      });
      if (!state) return;
      if (state.lastAppliedServerUpdatedAt == null && !state.hasLocalValue) {
        return;
      }
      merged[key] = { ...currentItems[key] };
      anyReplaced = true;
    });
    if (anyReplaced) {
      result = { ...result, itemSelections: merged };
    }
  }

  // ---- recipeSelectionRoots: recipeRootQuantity queue (recipes checkbox) ----
  const recipeRootQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeRootQuantityQueue
      : null;
  const recipeSelectionRoots =
    remotePlan.recipeSelectionRoots &&
    typeof remotePlan.recipeSelectionRoots === 'object' &&
    !Array.isArray(remotePlan.recipeSelectionRoots)
      ? remotePlan.recipeSelectionRoots
      : null;
  if (
    recipeRootQueue &&
    typeof recipeRootQueue.getKeyState === 'function' &&
    recipeSelectionRoots
  ) {
    const currentRoots =
      shoppingPlanCache?.recipeSelectionRoots &&
      typeof shoppingPlanCache.recipeSelectionRoots === 'object'
        ? shoppingPlanCache.recipeSelectionRoots
        : {};
    let anyReplaced = false;
    const merged = { ...recipeSelectionRoots };
    Object.keys(merged).forEach((key) => {
      const entry = merged[key];
      if (!entry || typeof entry !== 'object') return;
      const state = recipeRootQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'recipeRootQuantity',
      });
      if (!state || state.lastAppliedServerUpdatedAt == null) return;
      const incomingUpdatedAt =
        entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
      const incomingQty = Math.max(0, Number(entry.quantity || 0));
      const incomingSelected = Number.isFinite(incomingQty) && incomingQty > 0;
      const localSelected =
        state.hasLocalValue &&
        Number.isFinite(Number(state.lastLocalValue)) &&
        Number(state.lastLocalValue) > 0;
      if (incomingUpdatedAt == null) {
        if (state.hasLocalValue && incomingSelected !== localSelected) {
          if (currentRoots[key]) {
            merged[key] = { ...currentRoots[key] };
          } else {
            delete merged[key];
          }
          anyReplaced = true;
        }
        return;
      }
      const ta = Date.parse(String(incomingUpdatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) {
        if (currentRoots[key]) {
          merged[key] = { ...currentRoots[key] };
        } else {
          delete merged[key];
        }
        anyReplaced = true;
      }
    });
    Object.keys(currentRoots).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(merged, key)) return;
      const state = recipeRootQueue.getKeyState({
        surface: 'plan',
        entityKey: String(key),
        field: 'recipeRootQuantity',
      });
      if (!state) return;
      if (state.lastAppliedServerUpdatedAt == null && !state.hasLocalValue) {
        return;
      }
      merged[key] = { ...currentRoots[key] };
      anyReplaced = true;
    });
    if (anyReplaced) {
      result = { ...result, recipeSelectionRoots: merged };
    }
  }

  return result;
}

// Seed per-key versioning state in the recipe servings queue from a
// wholesale hydrate. After we accept the server's value for a row, record
// the (value, updatedAt) pair so the next echo for that row can be skipped
// when it carries a strictly-older updated_at. Charter §F.3.
function seedShoppingPlanRecipeServingsQueueFromRemotePlan(remotePlan) {
  if (!remotePlan || typeof remotePlan !== 'object') return;
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeServingsQueue
      : null;
  if (!queue || typeof queue.recordEchoApplied !== 'function') return;
  const recipeSelections =
    remotePlan.recipeSelections &&
    typeof remotePlan.recipeSelections === 'object' &&
    !Array.isArray(remotePlan.recipeSelections)
      ? remotePlan.recipeSelections
      : null;
  if (!recipeSelections) return;
  Object.keys(recipeSelections).forEach((key) => {
    const entry = recipeSelections[key];
    if (!entry || typeof entry !== 'object') return;
    const updatedAt =
      entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
    if (updatedAt == null) return;
    // Skip rows we just rejected as stale — the queue already holds a newer
    // lastAppliedServerUpdatedAt for those keys; recordEchoApplied's internal
    // strictly-greater check will no-op anyway, but skipping early avoids
    // accidentally re-writing lastLocalValue from the stale snapshot.
    const state = queue.getKeyState({
      surface: 'plan',
      entityKey: String(key),
      field: 'servingsOverride',
    });
    if (state && state.lastAppliedServerUpdatedAt != null) {
      const ta = Date.parse(String(updatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) return;
    }
    const value =
      entry.servingsOverride != null
        ? Number(entry.servingsOverride)
        : entry.servings_override != null
          ? Number(entry.servings_override)
          : null;
    try {
      queue.recordEchoApplied(
        {
          surface: 'plan',
          entityKey: String(key),
          field: 'servingsOverride',
        },
        {
          value: value != null && Number.isFinite(value) ? value : null,
          updated_at: updatedAt,
        },
      );
    } catch (_) {}
  });
}

// Seed per-key versioning state in the items quantity queue from a wholesale
// hydrate. After we accept the server's value for a row, record the
// (value, updatedAt) pair so the next echo for that row can be skipped when
// it carries a strictly-older updated_at. Mirror of
// seedShoppingPlanRecipeServingsQueueFromRemotePlan for the items planner
// stepper. Charter §F.3.
function seedShoppingPlanItemsQuantityQueueFromRemotePlan(remotePlan) {
  if (!remotePlan || typeof remotePlan !== 'object') return;
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanItemsQuantityQueue
      : null;
  if (!queue || typeof queue.recordEchoApplied !== 'function') return;
  const itemSelections =
    remotePlan.itemSelections &&
    typeof remotePlan.itemSelections === 'object' &&
    !Array.isArray(remotePlan.itemSelections)
      ? remotePlan.itemSelections
      : null;
  if (!itemSelections) return;
  Object.keys(itemSelections).forEach((key) => {
    const entry = itemSelections[key];
    if (!entry || typeof entry !== 'object') return;
    const updatedAt =
      entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
    if (updatedAt == null) return;
    // Skip rows the merge step just rejected as stale (queue already holds a
    // newer lastAppliedServerUpdatedAt). recordEchoApplied's strictly-greater
    // check would no-op anyway, but skipping early avoids accidentally
    // rewriting lastLocalValue from the stale snapshot.
    const state = queue.getKeyState({
      surface: 'plan',
      entityKey: String(key),
      field: 'quantity',
    });
    if (state && state.lastAppliedServerUpdatedAt != null) {
      const ta = Date.parse(String(updatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) return;
    }
    const rawQty = Number(entry.quantity);
    const value = Number.isFinite(rawQty) ? rawQty : 0;
    const quantityUnspecified =
      entry.quantityUnspecified === true ||
      entry.quantity_unspecified === true;
    try {
      queue.recordEchoApplied(
        {
          surface: 'plan',
          entityKey: String(key),
          field: 'quantity',
        },
        {
          value,
          updated_at: updatedAt,
          quantityUnspecified,
        },
      );
    } catch (_) {}
  });
}

function seedShoppingPlanRecipeRootQuantityQueueFromRemotePlan(remotePlan) {
  if (!remotePlan || typeof remotePlan !== 'object') return;
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeRootQuantityQueue
      : null;
  if (!queue || typeof queue.recordEchoApplied !== 'function') return;
  const recipeSelectionRoots =
    remotePlan.recipeSelectionRoots &&
    typeof remotePlan.recipeSelectionRoots === 'object' &&
    !Array.isArray(remotePlan.recipeSelectionRoots)
      ? remotePlan.recipeSelectionRoots
      : null;
  if (!recipeSelectionRoots) return;
  Object.keys(recipeSelectionRoots).forEach((key) => {
    const entry = recipeSelectionRoots[key];
    if (!entry || typeof entry !== 'object') return;
    const updatedAt =
      entry.updatedAt != null ? entry.updatedAt : entry.updated_at;
    if (updatedAt == null) return;
    const state = queue.getKeyState({
      surface: 'plan',
      entityKey: String(key),
      field: 'recipeRootQuantity',
    });
    if (state && state.lastAppliedServerUpdatedAt != null) {
      const ta = Date.parse(String(updatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) return;
    }
    const rawQty = Number(entry.quantity);
    const value =
      Number.isFinite(rawQty) && rawQty > 0 ? Math.min(99, Math.trunc(rawQty)) : 0;
    try {
      queue.recordEchoApplied(
        {
          surface: 'plan',
          entityKey: String(key),
          field: 'recipeRootQuantity',
        },
        {
          value,
          updated_at: updatedAt,
        },
      );
    } catch (_) {}
  });
}

function shoppingListCheckboxEntityKeyFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const sourceKey = String(row.sourceKey || '').trim();
  if (sourceKey) return sourceKey;
  return String(row.id || '').trim();
}

function rowCheckedValue(row) {
  return !!(row && typeof row === 'object' && row.checked);
}

// Charter §G.1 — protected wholesale list hydrate for migrated checkbox rows.
// A load_shopping_state snapshot can race a narrow row RPC. Before persisting
// that snapshot to the canonical list cache, preserve any row whose per-key
// queue state proves the snapshot is stale or captured without row timestamps.
function mergeRemoteListDocForCheckboxStaleness(
  remoteDoc,
  sourceLabel = 'unspecified',
) {
  if (!remoteDoc || typeof remoteDoc !== 'object') return remoteDoc;
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsShoppingListCheckboxInputQueue
      : null;
  if (!queue || typeof queue.getKeyState !== 'function') {
    try {
      if (window.favoriteEatsInputSyncDebugToConsole === true) {
        console.info(
          '[favorite-eats-shopping-list-checkbox]',
          'protected wholesale list merge skipped',
          {
            source: sourceLabel,
            reason: 'queue unavailable',
            rowCount: Array.isArray(remoteDoc.rows) ? remoteDoc.rows.length : 0,
          },
        );
      }
    } catch (_) {}
    return remoteDoc;
  }
  const rows = Array.isArray(remoteDoc.rows) ? remoteDoc.rows : null;
  if (!rows) return remoteDoc;
  const currentRows =
    shoppingListDocAuthoritativeCache &&
    Array.isArray(shoppingListDocAuthoritativeCache.rows)
      ? shoppingListDocAuthoritativeCache.rows
      : [];
  const currentByKey = new Map();
  currentRows.forEach((row) => {
    const key = shoppingListCheckboxEntityKeyFromRow(row);
    if (key) currentByKey.set(key, row);
  });
  let anyReplaced = false;
  const seenKeys = new Set();
  const mergedRows = rows.map((row) => {
    const key = shoppingListCheckboxEntityKeyFromRow(row);
    if (!key) return row;
    seenKeys.add(key);
    const state = queue.getKeyState({
      surface: 'list',
      entityKey: key,
      field: 'checked',
    });
    if (!state) return row;
    const currentRow = currentByKey.get(key);
    const incomingUpdatedAt =
      row.updatedAt != null ? row.updatedAt : row.updated_at;
    const hasLocalIntent = !!(state.pending || state.inFlight);
    let shouldPreserveForStaleVersion = false;
    if (
      incomingUpdatedAt != null &&
      state.lastAppliedServerUpdatedAt != null
    ) {
      const ta = Date.parse(String(incomingUpdatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      shouldPreserveForStaleVersion =
        Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb;
    } else if (
      incomingUpdatedAt == null &&
      state.hasLocalValue &&
      rowCheckedValue(row) !== !!state.lastLocalValue
    ) {
      shouldPreserveForStaleVersion = true;
    }
    if (currentRow && (hasLocalIntent || shouldPreserveForStaleVersion)) {
      anyReplaced = true;
      return { ...currentRow };
    }
    return row;
  });

  currentByKey.forEach((row, key) => {
    if (seenKeys.has(key)) return;
    const state = queue.getKeyState({
      surface: 'list',
      entityKey: key,
      field: 'checked',
    });
    if (
      state &&
      (state.pending ||
        state.inFlight ||
        state.hasLocalValue ||
        state.lastAppliedServerUpdatedAt != null)
    ) {
      mergedRows.push({ ...row });
      anyReplaced = true;
    }
  });

  try {
    if (window.favoriteEatsInputSyncDebugToConsole === true) {
      console.info(
        '[favorite-eats-shopping-list-checkbox]',
        anyReplaced
          ? 'protected wholesale list merge preserved rows'
          : 'protected wholesale list merge checked rows',
        {
          source: sourceLabel,
          rowCount: mergedRows.length,
        },
      );
    }
  } catch (_) {}

  return anyReplaced ? { ...remoteDoc, rows: mergedRows } : remoteDoc;
}

function seedShoppingListCheckboxQueueFromRemoteDoc(remoteDoc) {
  if (!remoteDoc || typeof remoteDoc !== 'object') return;
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsShoppingListCheckboxInputQueue
      : null;
  if (!queue || typeof queue.recordEchoApplied !== 'function') return;
  const rows = Array.isArray(remoteDoc.rows) ? remoteDoc.rows : [];
  rows.forEach((row) => {
    const key = shoppingListCheckboxEntityKeyFromRow(row);
    if (!key) return;
    const updatedAt = row.updatedAt != null ? row.updatedAt : row.updated_at;
    if (updatedAt == null) return;
    const state =
      typeof queue.getKeyState === 'function'
        ? queue.getKeyState({
            surface: 'list',
            entityKey: key,
            field: 'checked',
          })
        : null;
    if (state && state.lastAppliedServerUpdatedAt != null) {
      const ta = Date.parse(String(updatedAt));
      const tb = Date.parse(String(state.lastAppliedServerUpdatedAt));
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb) return;
    }
    queue.recordEchoApplied(
      { surface: 'list', entityKey: key, field: 'checked' },
      { updated_at: updatedAt, value: rowCheckedValue(row) },
    );
  });
}

function syncPlanRecipeServingsWithWebServingsEventDetail(detail) {
  if (!detail || typeof detail !== 'object') return;
  if (!shouldUseRemoteShoppingState()) return;
  const recipeId = Number(detail.recipeId);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return;
  const key = String(Math.trunc(recipeId));
  const sel = getShoppingPlanRecipeSelections()[key];
  if (!sel) return;
  const rawVal = detail.value;
  let servingsOverride;
  if (rawVal == null || !Number.isFinite(Number(rawVal))) {
    servingsOverride = null;
  } else {
    const ring = window.favoriteEatsRecipePlannerServings;
    const rounded =
      ring && typeof ring.roundValue === 'function'
        ? ring.roundValue(Number(rawVal))
        : Number(rawVal);
    servingsOverride =
      rounded != null && Number.isFinite(rounded) && rounded > 0
        ? rounded
        : null;
  }
  const queue = getFavoriteEatsPlanRecipeServingsQueue();
  if (queue && typeof queue.enqueue === 'function') {
    queue.enqueue({
      surface: 'plan',
      entityKey: String(Math.trunc(recipeId)),
      field: 'servingsOverride',
      value: servingsOverride,
    });
    return;
  }
  // Fallback path when the narrow-RPC queue is unavailable (e.g. legacy
  // bundle): retain the old wholesale plan save shape.
  const roots = getShoppingPlanRecipeSelectionRoots();
  const rootEntry =
    roots && typeof roots === 'object' ? roots[key] : undefined;
  const rootQtyRaw =
    rootEntry != null
      ? Math.max(0, Math.min(99, Number(rootEntry.quantity || 0)))
      : 0;
  const useRoot =
    rootEntry &&
    typeof rootEntry === 'object' &&
    Number.isFinite(rootQtyRaw) &&
    rootQtyRaw > 0;
  if (useRoot) {
    setShoppingPlanRecipeRootSelection({
      recipeId,
      title: String(rootEntry.title || sel.title || '').trim(),
      quantity: rootQtyRaw,
      servingsOverride,
    });
  } else {
    setShoppingPlanRecipeSelection({
      recipeId,
      title: String(sel.title || '').trim(),
      quantity: Number(sel.quantity || 0),
      servingsOverride,
    });
  }
}

/**
 * After loading the shopping plan from Supabase, copy recipe serving overrides into
 * the same browser storage that recipe screens use, so another tab or device sees
 * the same numbers. Does not fire servings-changed events (avoids save loops).
 */
function syncRecipePlannerServingsLocalCacheFromShoppingPlan(plan) {
  if (!shouldUseRemoteShoppingState()) return;
  const api = window.favoriteEatsRecipePlannerServings;
  if (
    !api ||
    typeof api.loadMap !== 'function' ||
    typeof api.persistMap !== 'function' ||
    typeof api.roundValue !== 'function'
  ) {
    return;
  }
  const normalized =
    plan && typeof plan === 'object' ? normalizeShoppingPlan(plan) : null;
  const recipeSelections = normalized?.recipeSelections;
  const recipeSelectionRoots = normalized?.recipeSelectionRoots;
  if (!recipeSelections || typeof recipeSelections !== 'object') return;
  // Charter §G: per-key skip. If the servings queue has a pending op for a
  // recipe, the server's wholesale plan snapshot is stale relative to the
  // user's in-flight intent; do NOT overwrite recipePlannerServingsMap (the
  // map the recipes UI reads from) for that key.
  const servingsQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeServingsQueue
      : null;
  const map = { ...api.loadMap() };
  let changed = false;
  Object.values(recipeSelections).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const rid = Number(entry.recipeId);
    if (!Number.isFinite(rid) || rid <= 0) return;
    const key = String(Math.trunc(rid));
    if (
      servingsQueue &&
      typeof servingsQueue.hasPending === 'function' &&
      servingsQueue.hasPending({
        surface: 'plan',
        entityKey: key,
        field: 'servingsOverride',
      })
    ) {
      return;
    }
    const rootEntry =
      recipeSelectionRoots &&
      typeof recipeSelectionRoots === 'object' &&
      !Array.isArray(recipeSelectionRoots)
        ? recipeSelectionRoots[key]
        : null;
    const rawOv =
      entry.servingsOverride != null
        ? entry.servingsOverride
        : entry.servings_override;
    const rootOv =
      rootEntry?.servingsOverride != null
        ? rootEntry.servingsOverride
        : rootEntry?.servings_override;
    const resolvedOv = rawOv != null ? rawOv : rootOv;
    if (resolvedOv == null) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const mapVal = Number(map[key]);
        const onPlanQty = Math.max(
          Number(entry?.quantity || 0),
          Number(rootEntry?.quantity || 0),
        );
        if (
          Number.isFinite(mapVal) &&
          mapVal > 0 &&
          Number.isFinite(onPlanQty) &&
          onPlanQty > 0
        ) {
          return;
        }
        delete map[key];
        changed = true;
      }
    } else {
      const rounded = api.roundValue(Number(resolvedOv));
      if (
        rounded != null &&
        Number.isFinite(rounded) &&
        rounded > 0 &&
        Number(map[key]) !== rounded
      ) {
        map[key] = rounded;
        changed = true;
      }
    }
  });
  if (changed) api.persistMap(map);
}

function scheduleCoalescedPlanSaveToDataService(plan, options = {}) {
  shoppingPlanCoalescedPendingPlan = normalizeShoppingPlan(plan);
  if (options.allowEmptyPlanRemoteSave) {
    shoppingPlanCoalescedSaveAllowEmpty = true;
  }
  if (shoppingPlanCoalescedSaveTimer != null) {
    clearTimeout(shoppingPlanCoalescedSaveTimer);
  }
  shoppingPlanCoalescedSaveTimer = setTimeout(() => {
    shoppingPlanCoalescedSaveTimer = null;
    void drainCoalescedPlanSaveQueue();
  }, SHOPPING_PLAN_SAVE_DEBOUNCE_MS);
}

function finishShoppingPlanMutationBatch() {
  shoppingPlanMutationBatchDepth = Math.max(0, shoppingPlanMutationBatchDepth - 1);
  if (
    shoppingPlanMutationBatchDepth === 0 &&
    shoppingPlanMutationBatchDeferredSave
  ) {
    shoppingPlanMutationBatchDeferredSave = false;
    const saveOptions = shoppingPlanMutationBatchAllowEmptyRemoteSave
      ? { allowEmptyPlanRemoteSave: true }
      : {};
    shoppingPlanMutationBatchAllowEmptyRemoteSave = false;
    queueSaveShoppingStateToDataService({ plan: getShoppingPlan() }, saveOptions);
  }
}

function runWithShoppingPlanMutationBatch(fn) {
  shoppingPlanMutationBatchDepth += 1;
  const finish = () => {
    finishShoppingPlanMutationBatch();
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          finish();
          return value;
        },
        (err) => {
          finish();
          throw err;
        },
      );
    }
    finish();
    return result;
  } catch (err) {
    finish();
    throw err;
  }
}

function queueSaveShoppingStateToDataService(partialState, options = {}) {
  if (shoppingStateRemoteWriteSuppressed || !shouldUseRemoteShoppingState())
    return;
  let request =
    partialState &&
    typeof partialState === 'object' &&
    !Array.isArray(partialState)
      ? partialState
      : {};
  if (!Object.keys(request).length) return;
  // Never strip `plan` here: dropping it silently caused recipe-plan edits to never
  // reach Supabase when hydrate was delayed or returned an empty `plan` payload.
  // List doc still waits for the first successful snapshot (legacy ordering guard).
  if (
    Object.prototype.hasOwnProperty.call(request, 'shoppingListDoc') &&
    !shoppingStateSnapshotLoaded
  ) {
    const { shoppingListDoc: _skippedList, ...rest } = request;
    void _skippedList;
    request = rest;
    if (!Object.keys(request).length) return;
  }
  const touchesPlan = Object.prototype.hasOwnProperty.call(request, 'plan');
  const touchesList = Object.prototype.hasOwnProperty.call(
    request,
    'shoppingListDoc',
  );
  if (touchesPlan && !touchesList) {
    scheduleCoalescedPlanSaveToDataService(request.plan, options);
    return;
  }
  void (async () => {
    const guardResult = await evaluateShoppingStateRemoteSaveGuards(
      request,
      options,
    );
    if (!guardResult.allowed) {
      notifyBlockedShoppingStateRemoteSave(guardResult, request);
      return;
    }
    if (touchesPlan) {
      bumpShoppingStateRemoteApplyGeneration();
      shoppingPlanRemoteSaveInFlight += 1;
    }
    let remoteState;
    try {
      window.dataService.useSupabase = true;
      remoteState = await window.dataService.saveShoppingState(request, options);
    } catch (err) {
      console.error('dataService.saveShoppingState failed:', err);
      toastSaveShoppingStateFailed(err, request);
    } finally {
      if (touchesPlan) {
        shoppingPlanRemoteSaveInFlight -= 1;
      }
    }
    if (!remoteState || typeof remoteState !== 'object') return;
    try {
      applyShoppingStateEchoFromSaveResponse(remoteState, {
        wholesale: !!(options && options.allowEmptyPlanRemoteSave),
      });
    } catch (err) {
      console.warn(
        'applyShoppingStateEchoFromSaveResponse (queued save) failed:',
        err,
      );
    }
  })();
}

/** Awaited save so the next page load cannot hydrate stale remote plan/doc over rewritten keys. */
async function awaitPersistShoppingStateToDataService(partialState, options = {}) {
  if (!shouldUseRemoteShoppingState()) return undefined;
  const request =
    partialState &&
    typeof partialState === 'object' &&
    !Array.isArray(partialState)
      ? partialState
      : {};
  if (!Object.keys(request).length) return undefined;
  const guardResult = await evaluateShoppingStateRemoteSaveGuards(
    request,
    options,
  );
  if (!guardResult.allowed) {
    notifyBlockedShoppingStateRemoteSave(guardResult, request);
    return undefined;
  }
  const touchesPlan = Object.prototype.hasOwnProperty.call(request, 'plan');
  const touchesList = Object.prototype.hasOwnProperty.call(
    request,
    'shoppingListDoc',
  );
  if (touchesPlan) {
    bumpShoppingStateRemoteApplyGeneration();
    shoppingPlanRemoteSaveInFlight += 1;
  }
  try {
    window.dataService.useSupabase = true;
  } catch (_) {}
  try {
    const rs =
      touchesPlan &&
      !touchesList &&
      typeof window.dataService.saveShoppingPlan === 'function'
        ? await window.dataService.saveShoppingPlan(request.plan, options)
        : await window.dataService.saveShoppingState(request, options);
    if (rs && typeof rs === 'object') {
      try {
        applyShoppingStateEchoFromSaveResponse(rs, {
          wholesale: !!(options && options.allowEmptyPlanRemoteSave),
        });
      } catch (err) {
        console.warn(
          'applyShoppingStateEchoFromSaveResponse (awaited save) failed:',
          err,
        );
      }
    }
    return rs;
  } catch (err) {
    console.warn('dataService shopping plan/state save (awaited flush) failed:', err);
    toastSaveShoppingStateFailed(err, request);
    return undefined;
  } finally {
    if (touchesPlan) {
      shoppingPlanRemoteSaveInFlight -= 1;
    }
  }
}

async function drainCoalescedPlanSaveQueue() {
  if (shoppingPlanCoalescedSaveDrainPromise) {
    return shoppingPlanCoalescedSaveDrainPromise;
  }
  shoppingPlanCoalescedSaveDrainPromise = (async () => {
    while (shoppingPlanCoalescedPendingPlan) {
      const plan = shoppingPlanCoalescedPendingPlan;
      shoppingPlanCoalescedPendingPlan = null;
      const saveOptions = shoppingPlanCoalescedSaveAllowEmpty
        ? { allowEmptyPlanRemoteSave: true }
        : {};
      shoppingPlanCoalescedSaveAllowEmpty = false;
      await awaitPersistShoppingStateToDataService({ plan }, saveOptions);
    }
  })().finally(() => {
    shoppingPlanCoalescedSaveDrainPromise = null;
  });
  return shoppingPlanCoalescedSaveDrainPromise;
}

async function flushCoalescedPlanSaveToDataService({ awaited = false } = {}) {
  if (shoppingPlanCoalescedSaveTimer != null) {
    clearTimeout(shoppingPlanCoalescedSaveTimer);
    shoppingPlanCoalescedSaveTimer = null;
  }
  if (!shoppingPlanCoalescedPendingPlan) {
    shoppingPlanCoalescedPendingPlan = normalizeShoppingPlan(getShoppingPlan());
  }
  if (awaited) {
    return drainCoalescedPlanSaveQueue();
  }
  void drainCoalescedPlanSaveQueue();
  return undefined;
}

if (
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function' &&
  !window.__favoriteEatsCoalescedPlanSavePagehideWired
) {
  window.__favoriteEatsCoalescedPlanSavePagehideWired = true;
  window.addEventListener('pagehide', () => {
    if (
      !shouldUseRemoteShoppingState() ||
      (!shoppingPlanCoalescedPendingPlan && shoppingPlanCoalescedSaveTimer == null)
    ) {
      return;
    }
    void flushCoalescedPlanSaveToDataService({ awaited: true });
  });
}

/**
 * Apply catalog.save_shopping_state response (same shape as load_shopping_state)
 * into local plan/list caches without re-saving.
 * Returns the normalized list doc when the payload included shoppingListDoc.
 */
function bumpShoppingStateRemoteApplyGeneration() {
  shoppingStateRemoteApplyGeneration += 1;
}

function getPlanInputSyncQueuesForWholesaleApply() {
  const queues = [
    typeof window !== 'undefined' ? window.favoriteEatsPlanItemsQuantityQueue : null,
    typeof window !== 'undefined' ? window.favoriteEatsPlanRecipeServingsQueue : null,
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeRootQuantityQueue
      : null,
    getFavoriteEatsPlanRecipeServingsQueue(),
    getFavoriteEatsPlanRecipeRootQuantityQueue(),
  ];
  const seen = new Set();
  return queues.filter((queue) => {
    if (!queue || seen.has(queue)) return false;
    seen.add(queue);
    return true;
  });
}

function resetInputSyncQueuesForWholesaleApply() {
  const queues = [
    ...getPlanInputSyncQueuesForWholesaleApply(),
    typeof window !== 'undefined'
      ? window.favoriteEatsShoppingListCheckboxInputQueue
      : null,
  ];
  const seen = new Set();
  queues.forEach((queue) => {
    if (!queue || seen.has(queue)) return;
    seen.add(queue);
    if (typeof queue.abortPendingForWholesaleApply === 'function') {
      queue.abortPendingForWholesaleApply();
    } else if (typeof queue.resetKeyStateForWholesaleApply === 'function') {
      queue.resetKeyStateForWholesaleApply();
    }
  });
}

/** Clear-all / wholesale replace: drop queued narrow writes before empty plan save. */
async function abortPlanInputSyncQueuesForWholesaleClear() {
  getPlanInputSyncQueuesForWholesaleApply().forEach((queue) => {
    if (typeof queue.abortPendingForWholesaleApply === 'function') {
      queue.abortPendingForWholesaleApply();
    } else if (typeof queue.resetKeyStateForWholesaleApply === 'function') {
      queue.resetKeyStateForWholesaleApply();
    }
  });
  await Promise.all(
    getPlanInputSyncQueuesForWholesaleApply().map((queue) =>
      queue && typeof queue.awaitInFlightDrain === 'function'
        ? queue.awaitInFlightDrain()
        : Promise.resolve(),
    ),
  );
}

function applyShoppingStateEchoFromSaveResponse(remoteState, options = {}) {
  if (!remoteState || typeof remoteState !== 'object') return null;
  const wholesale = !!(options && options.wholesale);
  const hasPlan = Object.prototype.hasOwnProperty.call(remoteState, 'plan');
  const hasPlanRevision =
    Object.prototype.hasOwnProperty.call(remoteState, 'planUpdatedAt') ||
    Object.prototype.hasOwnProperty.call(remoteState, 'planVersion');
  const hasListKey = Object.prototype.hasOwnProperty.call(
    remoteState,
    'shoppingListDoc',
  );
  if (hasPlan || hasPlanRevision || (hasListKey && remoteState.shoppingListDoc != null)) {
    bumpShoppingStateRemoteApplyGeneration();
  }
  if (wholesale) {
    resetInputSyncQueuesForWholesaleApply();
  }
  let listDoc = null;
  if (hasPlan) {
    const planToPersist = wholesale
      ? remoteState.plan
      : mergeRemotePlanForPerKeyStaleness(remoteState.plan);
    persistShoppingPlan(normalizeShoppingPlan(planToPersist), {
      skipRemoteSave: true,
    });
    seedShoppingPlanRecipeServingsQueueFromRemotePlan(remoteState.plan);
    seedShoppingPlanItemsQuantityQueueFromRemotePlan(remoteState.plan);
    seedShoppingPlanRecipeRootQuantityQueueFromRemotePlan(remoteState.plan);
  }
  if (hasListKey && remoteState.shoppingListDoc != null) {
    const listToPersist = wholesale
      ? mergeRemoteListDocForCheckboxStaleness(
          remoteState.shoppingListDoc,
          'loaded session',
        )
      : mergeRemoteListDocForCheckboxStaleness(
          remoteState.shoppingListDoc,
          'save echo',
        );
    listDoc = persistShoppingListDoc(
      normalizeShoppingListDoc(listToPersist),
      { skipRemoteSave: true },
    );
    seedShoppingListCheckboxQueueFromRemoteDoc(listToPersist);
  }
  if ((hasPlan || hasListKey) && shouldUseRemoteShoppingState()) {
    try {
      syncRecipePlannerServingsLocalCacheFromShoppingPlan(getShoppingPlan());
    } catch (err) {
      console.warn(
        'syncRecipePlannerServingsLocalCacheFromShoppingPlan (save echo) failed:',
        err,
      );
    }
  }
  void favoriteEatsStoreApplyRemoteFromSaveEcho(remoteState);
  return listDoc;
}

async function favoriteEatsApplyLoadedPlanSession(result) {
  if (!result || typeof result !== 'object') return;
  const prevSuppressed = shoppingStateRemoteWriteSuppressed;
  shoppingStateRemoteWriteSuppressed = true;
  try {
    if (result.shoppingState && typeof result.shoppingState === 'object') {
      applyShoppingStateEchoFromSaveResponse(result.shoppingState, {
        wholesale: true,
      });
    } else if (result.plan) {
      applyShoppingStateEchoFromSaveResponse(
        {
          plan: result.plan,
          planUpdatedAt: result.planUpdatedAt,
          planVersion: result.planVersion,
        },
        { wholesale: true },
      );
    }
  } finally {
    shoppingStateRemoteWriteSuppressed = prevSuppressed;
  }
}
window.favoriteEatsApplyLoadedPlanSession = favoriteEatsApplyLoadedPlanSession;

/** In-flight `set_shopping_list_row_*` RPCs — `load_shopping_state` must not apply over them. */
let shoppingListRowDataRpcInFlight = 0;
const shoppingListRowDataRpcDrainResolvers = [];
/** Bumps when a row-level list RPC completes (used to detect writes during a hydrate fetch). */
let shoppingListRowMutationEpoch = 0;
let shoppingHydrateStaleRetryTimer = null;

function beginShoppingListRowDataRpc() {
  shoppingListRowDataRpcInFlight += 1;
}

function endShoppingListRowDataRpc() {
  shoppingListRowDataRpcInFlight = Math.max(
    0,
    shoppingListRowDataRpcInFlight - 1,
  );
  shoppingListRowMutationEpoch += 1;
  if (shoppingListRowDataRpcInFlight === 0) {
    const pending = shoppingListRowDataRpcDrainResolvers.splice(0);
    for (let i = 0; i < pending.length; i += 1) {
      try {
        pending[i]();
      } catch (_) {}
    }
  }
}

async function awaitShoppingListRowDataRpcDrain() {
  if (shoppingListRowDataRpcInFlight <= 0) return;
  await new Promise((resolve) => {
    shoppingListRowDataRpcDrainResolvers.push(resolve);
  });
}

function scheduleShoppingHydrateStaleRetryCoalesced() {
  if (shoppingHydrateStaleRetryTimer != null) return;
  shoppingHydrateStaleRetryTimer = setTimeout(() => {
    shoppingHydrateStaleRetryTimer = null;
    void hydrateShoppingStateFromDataService({ source: 'stale hydrate retry' });
  }, 40);
}

function buildShoppingHydrateApplyGuards(applyGenAtFetchStart, mutationEpochAtFetch) {
  return {
    applyGenerationAtFetchStart: applyGenAtFetchStart,
    mutationEpochAtFetch,
    currentApplyGeneration: shoppingStateRemoteApplyGeneration,
    currentMutationEpoch: shoppingListRowMutationEpoch,
    currentRowRpcInFlight: shoppingListRowDataRpcInFlight,
    currentPlanSaveInFlight: shoppingPlanRemoteSaveInFlight,
  };
}

function applyShoppingHydrateThroughStore(state, revisions, guards, options = {}) {
  const store = window.favoriteEatsStore;
  if (!store || typeof store.applyRemote !== 'function') {
    return { outcome: 'applied' };
  }
  return store.applyRemote(
    {
      plan: state?.plan,
      listDoc: state?.shoppingListDoc,
      revisions: revisions || {},
      guards,
    },
    options,
  );
}

function getShoppingListDocFromStoreOrState(state) {
  const store = window.favoriteEatsStore;
  if (store && typeof store.getSnapshot === 'function') {
    const snap = store.getSnapshot();
    if (snap?.listDoc != null) {
      return normalizeShoppingListDoc(snap.listDoc);
    }
  }
  return normalizeShoppingListDoc(state?.shoppingListDoc);
}

function recipePlanEntryServingsOverride(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.servingsOverride != null) return Number(entry.servingsOverride);
  if (entry.servings_override != null) return Number(entry.servings_override);
  return null;
}

/** Incomplete warm-store plan must not skip protected load_shopping_state. */
function shoppingPlanStoreSnapshotBlocksRevisionFastPath(plan) {
  const normalized = normalizeShoppingPlan(plan);
  const roots = normalized?.recipeSelectionRoots || {};
  const merged = normalized?.recipeSelections || {};
  let map = {};
  try {
    map = loadRecipePlannerServingsMap();
  } catch (_) {}
  return Object.keys(roots).some((key) => {
    const root = roots[key];
    const qty = Number(root?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    const rootOv = recipePlanEntryServingsOverride(root);
    const mergedOv = recipePlanEntryServingsOverride(merged[key]);
    if (
      mergedOv != null &&
      Number.isFinite(mergedOv) &&
      mergedOv > 0 &&
      (rootOv == null || !Number.isFinite(rootOv) || rootOv <= 0)
    ) {
      return true;
    }
    if (
      (rootOv == null || !Number.isFinite(rootOv) || rootOv <= 0) &&
      (mergedOv == null || !Number.isFinite(mergedOv) || mergedOv <= 0)
    ) {
      const mapVal = Number(map[key]);
      if (Number.isFinite(mapVal) && mapVal > 0) return true;
    }
    return false;
  });
}

function shouldUseShoppingStoreRevisionProbeFastPath(probeRevisions, snapshot) {
  const revisions =
    probeRevisions && typeof probeRevisions === 'object' ? probeRevisions : {};
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  if (
    revisions.planUpdatedAt != null &&
    !shoppingPlanHasContentSelections(snap.plan)
  ) {
    return false;
  }
  if (
    revisions.listSessionUpdatedAt != null &&
    !shoppingListDocHasPersistedRows(snap.listDoc)
  ) {
    return false;
  }
  if (shoppingPlanStoreSnapshotBlocksRevisionFastPath(snap.plan)) {
    return false;
  }
  return true;
}

async function persistShoppingHydrateRemoteStateToMain(state, force) {
  const hydrateSource =
    state && typeof state.__favoriteEatsHydrateSource === 'string'
      ? state.__favoriteEatsHydrateSource
      : 'remote hydrate';
  if (force) {
    shoppingStateSnapshotLoaded = false;
  }
  shoppingStateSnapshotLoaded = true;
  favoriteEatsShoppingHydrateForceRemoteAfterAuth = false;
  const hasRemotePlan = Object.prototype.hasOwnProperty.call(state || {}, 'plan');
  const hasRemoteShoppingListDoc = Object.prototype.hasOwnProperty.call(
    state || {},
    'shoppingListDoc',
  );
  shoppingStateRemoteWriteSuppressed = true;
  try {
    if (hasRemotePlan) {
      const protectedRemotePlan = mergeRemotePlanForPerKeyStaleness(state?.plan);
      const remoteNormalized = normalizeShoppingPlan(protectedRemotePlan);
      let effectivePlan = remoteNormalized;
      if (
        shouldRunShoppingLegacyBridge() &&
        !shoppingPlanHasSelections(effectivePlan)
      ) {
        const bridged = peekShoppingPlanForLegacyBridge();
        if (bridged && shoppingPlanHasSelections(bridged)) {
          effectivePlan = normalizeShoppingPlan(bridged);
        }
      }
      persistShoppingPlan(effectivePlan, { skipRemoteSave: true });
      seedShoppingPlanRecipeServingsQueueFromRemotePlan(state?.plan);
      seedShoppingPlanItemsQuantityQueueFromRemotePlan(state?.plan);
      seedShoppingPlanRecipeRootQuantityQueueFromRemotePlan(state?.plan);
      if (
        shouldRunShoppingLegacyBridge() &&
        shoppingPlanHasSelections(effectivePlan) &&
        !shoppingPlanHasSelections(remoteNormalized)
      ) {
        shoppingStateRemoteWriteSuppressed = false;
        try {
          await awaitPersistShoppingStateToDataService({ plan: effectivePlan });
        } catch (err) {
          console.warn(
            'awaitPersistShoppingStateToDataService (empty-remote plan bridge) failed:',
            err,
          );
        }
        shoppingStateRemoteWriteSuppressed = true;
      }
    } else if (
      shouldRunShoppingLegacyBridge() &&
      !shoppingPlanLegacyBridgeAttempted
    ) {
      shoppingPlanLegacyBridgeAttempted = true;
      const localPlan = shouldUseRemoteShoppingState()
        ? (() => {
            const bridged = peekShoppingPlanForLegacyBridge();
            if (bridged) return bridged;
            return normalizeShoppingPlan(getShoppingPlan());
          })()
        : normalizeShoppingPlan(getShoppingPlan());
      if (shoppingPlanHasSelections(localPlan)) {
        persistShoppingPlan(localPlan, { skipRemoteSave: true });
        shoppingStateRemoteWriteSuppressed = false;
        await awaitPersistShoppingStateToDataService({ plan: localPlan });
        shoppingStateRemoteWriteSuppressed = true;
      }
    }
    if (hasRemoteShoppingListDoc) {
      const remoteDoc = getShoppingListDocFromStoreOrState(state);
      const protectedRemoteDoc =
        mergeRemoteListDocForCheckboxStaleness(remoteDoc, hydrateSource);
      persistShoppingListDoc(protectedRemoteDoc, { skipRemoteSave: true });
      seedShoppingListCheckboxQueueFromRemoteDoc(protectedRemoteDoc);
    } else if (
      shouldRunShoppingLegacyBridge() &&
      !shoppingListLegacyBridgeAttempted
    ) {
      shoppingListLegacyBridgeAttempted = true;
      const localDoc = loadShoppingListDocFromStorage();
      if ((localDoc?.rows || []).length) {
        persistShoppingListDoc(localDoc, { skipRemoteSave: true });
        shoppingStateRemoteWriteSuppressed = false;
        await awaitPersistShoppingStateToDataService({
          shoppingListDoc: localDoc,
        });
        shoppingStateRemoteWriteSuppressed = true;
      } else {
        shoppingListDocAuthoritativeCache = null;
      }
    }
  } finally {
    shoppingStateRemoteWriteSuppressed = false;
    if (shouldUseRemoteShoppingState()) {
      try {
        syncRecipePlannerServingsLocalCacheFromShoppingPlan(getShoppingPlan());
      } catch (err) {
        console.warn(
          'syncRecipePlannerServingsLocalCacheFromShoppingPlan failed:',
          err,
        );
      }
    }
    markFavoriteEatsRemoteShoppingAuthorityEstablished();
  }
  return true;
}

function syncMainCachesFromFavoriteEatsStoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  if (snapshot.plan != null) {
    const protectedPlan = mergeRemotePlanForPerKeyStaleness(snapshot.plan);
    persistShoppingPlan(normalizeShoppingPlan(protectedPlan), {
      skipRemoteSave: true,
    });
    seedShoppingPlanRecipeServingsQueueFromRemotePlan(snapshot.plan);
    seedShoppingPlanItemsQuantityQueueFromRemotePlan(snapshot.plan);
    seedShoppingPlanRecipeRootQuantityQueueFromRemotePlan(snapshot.plan);
  }
  // Row checkbox/text RPCs update main cache optimistically before the store revision
  // catches up; do not clobber checked state from a probe-only hydrate.
  if (snapshot.listDoc != null && shoppingListRowDataRpcInFlight <= 0) {
    const protectedListDoc = mergeRemoteListDocForCheckboxStaleness(
      snapshot.listDoc,
      'store snapshot sync',
    );
    persistShoppingListDoc(normalizeShoppingListDoc(protectedListDoc), {
      skipRemoteSave: true,
    });
    seedShoppingListCheckboxQueueFromRemoteDoc(protectedListDoc);
  }
}

function registerFavoriteEatsScreenApplyBridge() {
  if (
    !window.favoriteEatsScreenApply ||
    typeof window.favoriteEatsScreenApply.registerFavoriteEatsScreenApplyDeps !==
      'function'
  ) {
    return;
  }
  window.favoriteEatsScreenApply.registerFavoriteEatsScreenApplyDeps({
    syncMainCachesFromFavoriteEatsStoreSnapshot,
    persistShoppingHydrateRemoteStateToMain,
    markFavoriteEatsRemoteShoppingAuthorityEstablished,
    markShoppingStateSnapshotLoaded() {
      shoppingStateSnapshotLoaded = true;
    },
  });
}
registerFavoriteEatsScreenApplyBridge();

function registerFavoriteEatsRecipesPageBridge() {
  if (
    !window.favoriteEatsRecipesPage ||
    typeof window.favoriteEatsRecipesPage.registerFavoriteEatsRecipesPageDeps !==
      'function'
  ) {
    return;
  }
  window.favoriteEatsRecipesPage.registerFavoriteEatsRecipesPageDeps({
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
    getShoppingPlanRecipeSelections,
    getShoppingPlanRecipeSelectionRoots,
    getShoppingPlanItemSelections,
    getShoppingPlan,
    persistShoppingPlan,
    runWithShoppingPlanMutationBatch,
    createEmptyShoppingPlan,
    cloneForUndo,
    clearShoppingPlanSelections,
    flushCoalescedPlanSaveToDataService,
    flushPlanNarrowRpcQueuesWithSessionCommitBatch,
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
    setRecipeCatalogRealtimeUnsub(fn) {
      if (typeof favoriteEatsRecipeCatalogRealtimeUnsub === 'function') {
        try {
          favoriteEatsRecipeCatalogRealtimeUnsub();
        } catch (_) {}
      }
      favoriteEatsRecipeCatalogRealtimeUnsub = fn;
    },
    FAVORITE_EATS_PLANNER_MODE_EVENT,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    favoriteEatsHrefWithCurrentAdapter,
    favoriteEatsFormatRecipeTitleForDisplay,
  });
}
registerFavoriteEatsRecipesPageBridge();

function registerFavoriteEatsItemsPageBridge() {
  if (
    !window.favoriteEatsItemsPage ||
    typeof window.favoriteEatsItemsPage.registerFavoriteEatsItemsPageDeps !==
      'function'
  ) {
    return;
  }
  window.favoriteEatsItemsPage.registerFavoriteEatsItemsPageDeps({
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
    confirmRemoveFromPlanningList,
    promptRemoveItemFromMenuPlan,
    classifyMenuPlanItemRemoveCase,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    registerFavoriteEatsCatalogReferenceUiRefreshHook,
    registerFavoriteEatsCatalogCompositionUiRefreshHook:
      window.favoriteEatsRecipeCompositionSync &&
      typeof window.favoriteEatsRecipeCompositionSync
        .registerFavoriteEatsCatalogCompositionUiRefreshHook === 'function'
        ? window.favoriteEatsRecipeCompositionSync
            .registerFavoriteEatsCatalogCompositionUiRefreshHook
        : () => () => {},
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
    createShoppingListSectionHeader,
    shoppingListDisplaySectionIsSecondary,
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
    getShoppingBrowsePrimaryLocationBucketId,
    getShoppingBrowseLocationSortBucketIds,
    getShoppingBrowsePlannerBadgeContent,
    shoppingBrowseItemMatchesBrowseFilters,
    getShoppingBrowseVariantsMatchingTagKeys,
    shoppingBrowseItemHasExplicitVariantTagMatch,
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
    getShoppingPlanRemoteSaveInFlight() {
      return shoppingPlanRemoteSaveInFlight;
    },
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
  });
}
registerFavoriteEatsItemsPageBridge();

function registerFavoriteEatsShoppingListPageBridge() {
  if (
    !window.favoriteEatsShoppingListPage ||
    typeof window.favoriteEatsShoppingListPage
      .registerFavoriteEatsShoppingListPageDeps !== 'function'
  ) {
    return;
  }
  window.favoriteEatsShoppingListPage.registerFavoriteEatsShoppingListPageDeps({
    fePageLoadFoodIconBegin,
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
    favoriteEatsHrefWithCurrentAdapter,
    getTopLevelPageOrder,
    cloneForUndo,
    uiToast,
    uiConfirm,
    uiToastUndo,
    getShoppingPlan,
    getShoppingPlanItemSelections,
    getShoppingPlanRecipeSelections,
    persistShoppingPlan,
    runWithShoppingPlanMutationBatch,
    clearShoppingPlanSelections,
    createEmptyShoppingPlan,
    flushCoalescedPlanSaveToDataService,
    abortPlanInputSyncQueuesForWholesaleClear,
    runFavoriteEatsRemoteShoppingPlanRefresh,
    isControlClickRemoveGesture,
    isControlPrimaryContextMenuGesture,
    setSelectedRecipeNavigationSession,
    registerFavoriteEatsRemotePlanUiRefreshHook,
    registerFavoriteEatsRemoteListUiRefreshHook,
    registerFavoriteEatsRemoteListPatchHook,
    registerFavoriteEatsRemotePlanPatchHook,
    teardownFavoriteEatsShoppingPlanRealtime,
    ensureFavoriteEatsShoppingPlanRealtimeSubscription,
    ensureFavoriteEatsShoppingListRealtimeSubscription,
    renderTopLevelEmptyState,
    setTopLevelEmptyStateLayoutMode,
    createSectionToggleButton,
    createShoppingListSectionHeader,
    shoppingListDisplaySectionIsSecondary,
    normalizeShoppingHomeLocationId,
    getShoppingPlanSelectionRowsViaDataService,
    getShoppingListSelectedRecipeSummaryRowsViaDataService,
    buildShoppingListDocFromPlanRows,
    getAuthoritativeShoppingListDoc,
    normalizeShoppingListDoc,
    persistShoppingListDoc,
    mergeShoppingListDocWithGenerated,
    resolveShoppingListDocConflict,
    applyShoppingListDiscardQuantityChanges,
    isShoppingListDiscardChangesNoOp,
    awaitPersistShoppingStateToDataService,
    persistShoppingListBulkOperationToDataService,
    shoppingListSourcedRowsPayloadFromDoc,
    runFavoriteEatsRemoteShoppingPlanRefresh,
    runFavoriteEatsRemoteListRefresh,
    beginShoppingListRowDataRpc,
    endShoppingListRowDataRpc,
    getShoppingListRowDataRpcInFlight() {
      return shoppingListRowDataRpcInFlight;
    },
    getShoppingListChecklistDisplayRows,
    filterShoppingListChecklistRowsForCollapse,
    getShoppingListPlanRowResolvedLabel,
    splitShoppingListRowTextToLabelAndDetail,
    joinShoppingListLabelAndDetail,
    getShoppingListRowCanonicalLabel,
    buildShoppingListQtyOnlyOverrideText,
    sanitizeShoppingListRowTextCommit,
    normalizeShoppingListRowQtyOnlyOverride,
    normalizeShoppingListDocQtyOnlyOverrides,
    shoppingListRowSupportsQtyOnlyEdit,
    shoppingListRowAmountDetailDivergedFromSource,
    shoppingListRowGeneratedSourceAmountDetailChanged,
    fitShoppingListSplitRowDisplay,
    makeListRowTextMeasurer,
    SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
    getShoppingListRowQtyDetailFromText,
    buildShoppingListQtyUpdateConflict,
    mergeShoppingListStoredRowWithGeneratedRow,
    applyShoppingListRowListRemove,
    applyShoppingListRowListRestore,
    isShoppingListRowListRemoved,
    shoppingListPseudoRemovedCollapseKey,
    buildShoppingListRowPlacementRpcPayload,
    confirmShoppingListRowRemove,
    confirmShoppingListRowRestore,
    confirmShoppingListRestoreAll,
    readShoppingListViewModeFromSession,
    persistShoppingListViewMode,
    readShoppingListKeepCompletedInPlaceFromSession,
    persistShoppingListKeepCompletedInPlace,
    readShoppingListGroupItemVariantsFromSession,
    persistShoppingListGroupItemVariants,
    readShoppingListCheckboxActionFromSession,
    persistShoppingListCheckboxActionFromSession,
    readShoppingListCollapsedSectionsFromSession,
    persistShoppingListCollapsedSections,
    buildShoppingListExportPayload,
    formatShoppingListPlainTextFromViewState,
    formatShoppingListHtmlFromViewState,
    getFavoriteEatsInvalidationMaintainOut() {
      return favoriteEatsInvalidationMaintainOut;
    },
    FAVORITE_EATS_PLANNER_MODE_EVENT,
  });
}
registerFavoriteEatsShoppingListPageBridge();

function registerFavoriteEatsRecipeEditorPageBridge() {
  if (
    !window.favoriteEatsRecipeEditorPage ||
    typeof window.favoriteEatsRecipeEditorPage
      .registerFavoriteEatsRecipeEditorPageDeps !== 'function'
  ) {
    return;
  }
  window.favoriteEatsRecipeEditorPage.registerFavoriteEatsRecipeEditorPageDeps({
    fePageLoadFoodIconBegin,
    fePageLoadFoodIconFail,
    fePageLoadFoodIconFinish,
    favoriteEatsFormatRecipeTitleForDisplay,
    uiToast,
    favoriteEatsHrefWithCurrentAdapter,
    openFavoriteEatsDbForCurrentRuntime,
    shouldUseRemoteShoppingState,
    hydrateShoppingStateFromDataService,
    ensureIngredientLemmaMaintenanceInMain,
    isPlannerModeEnabled,
    ensureRecipeTagsSchemaInMain,
    ensureIngredientVariantTagsSchemaInMain,
    ensureSizesSchemaInMain,
    ensureUnitsSchemaInMain,
    favoriteEatsShouldUseSupabaseDataDoor,
    initAppBar,
    resolveUnknownIngredientNames,
    resolveUnknownIngredientVariants,
    resolveUnknownUnitCodes,
    resolveUnknownSizeNames,
    resolveUnknownTagNames,
    normalizeRecipeTagDraftList,
    persistBinaryArrayInMain,
    refreshFavoriteEatsCatalogMetricFlags,
    hydrateRecipeIngredientMetricFlags,
    setAppBarTextActionLabel,
  });
}
registerFavoriteEatsRecipeEditorPageBridge();

async function favoriteEatsStoreApplyRemoteFromSaveEcho(remoteState) {
  const store = window.favoriteEatsStore;
  if (
    !store ||
    typeof store.applyRemote !== 'function' ||
    !remoteState ||
    typeof remoteState !== 'object'
  ) {
    return;
  }
  const hasPlanPayload = Object.prototype.hasOwnProperty.call(
    remoteState,
    'plan',
  );
  const hasListPayload =
    Object.prototype.hasOwnProperty.call(remoteState, 'shoppingListDoc') &&
    remoteState.shoppingListDoc != null;
  if (!hasPlanPayload && !hasListPayload) {
    return;
  }
  if (
    !window.dataService ||
    typeof window.dataService.getShoppingRevisions !== 'function'
  ) {
    return;
  }
  try {
    window.dataService.useSupabase = true;
    const revisions = await window.dataService.getShoppingRevisions();
    if (remoteState.planUpdatedAt != null) {
      revisions.planUpdatedAt = String(remoteState.planUpdatedAt);
    }
    const payload = { revisions, guards: {} };
    if (hasPlanPayload) {
      payload.plan = normalizeShoppingPlan(remoteState.plan);
    }
    if (hasListPayload) {
      payload.listDoc = normalizeShoppingListDoc(remoteState.shoppingListDoc);
    }
    store.applyRemote(payload, { postWriteEcho: true });
  } catch (err) {
    console.warn('favoriteEatsStore save echo apply failed:', err);
  }
}

async function hydrateShoppingStateFromDataService(options = {}) {
  const force = !!(options && options.force);
  const source =
    options && typeof options.source === 'string' && options.source
      ? options.source
      : force
        ? 'forced hydrate'
        : 'hydrate';
  if (
    !window.dataService ||
    typeof window.dataService.loadShoppingState !== 'function'
  ) {
    return false;
  }

  const executeHydration = async () => {
    await awaitShoppingListRowDataRpcDrain();
    const applyGenAtFetchStart = shoppingStateRemoteApplyGeneration;
    const mutationEpochAtFetch = shoppingListRowMutationEpoch;
    window.dataService.useSupabase = true;

    let probeRevisions = null;
    if (typeof window.dataService.getShoppingRevisions === 'function') {
      try {
        probeRevisions = await window.dataService.getShoppingRevisions();
      } catch (err) {
        console.warn('getShoppingRevisions probe failed:', err);
      }
    }

    const store = window.favoriteEatsStore;
    if (
      !force &&
      !favoriteEatsShoppingHydrateForceRemoteAfterAuth &&
      probeRevisions &&
      store &&
      typeof store.revisionsMatchProbe === 'function' &&
      store.revisionsMatchProbe(probeRevisions) &&
      store.hasAuthoritativeSnapshot()
    ) {
      const snapshot = store.getSnapshot();
      if (
        shouldUseShoppingStoreRevisionProbeFastPath(probeRevisions, snapshot)
      ) {
        syncMainCachesFromFavoriteEatsStoreSnapshot(snapshot);
        shoppingStateSnapshotLoaded = true;
        markFavoriteEatsRemoteShoppingAuthorityEstablished();
        return true;
      }
    }

    const state = await window.dataService.loadShoppingState();
    if (state && typeof state === 'object') {
      try {
        Object.defineProperty(state, '__favoriteEatsHydrateSource', {
          configurable: true,
          enumerable: false,
          value: source,
        });
      } catch (_) {
        state.__favoriteEatsHydrateSource = source;
      }
    }
    const applyGuards = buildShoppingHydrateApplyGuards(
      applyGenAtFetchStart,
      mutationEpochAtFetch,
    );
    const applyResult = applyShoppingHydrateThroughStore(
      state,
      probeRevisions || {},
      applyGuards,
      { force },
    );

    if (applyResult.outcome === 'blocked') {
      scheduleShoppingHydrateStaleRetryCoalesced();
      return false;
    }
    if (applyResult.outcome === 'rejected_older') {
      return false;
    }
    if (applyResult.outcome === 'skipped_equal') {
      if (store && typeof store.getSnapshot === 'function') {
        syncMainCachesFromFavoriteEatsStoreSnapshot(store.getSnapshot());
      }
      shoppingStateSnapshotLoaded = true;
      markFavoriteEatsRemoteShoppingAuthorityEstablished();
      return true;
    }

    if (
      applyResult.outcome !== 'applied' &&
      shoppingListRowDataRpcInFlight > 0
    ) {
      scheduleShoppingHydrateStaleRetryCoalesced();
      return false;
    }
    if (
      applyResult.outcome !== 'applied' &&
      shoppingListRowMutationEpoch !== mutationEpochAtFetch
    ) {
      scheduleShoppingHydrateStaleRetryCoalesced();
      return false;
    }
    if (
      applyResult.outcome !== 'applied' &&
      applyGenAtFetchStart !== shoppingStateRemoteApplyGeneration
    ) {
      scheduleShoppingHydrateStaleRetryCoalesced();
      return false;
    }
    if (
      applyResult.outcome !== 'applied' &&
      shoppingPlanRemoteSaveInFlight > 0
    ) {
      scheduleShoppingHydrateStaleRetryCoalesced();
      return false;
    }

    return persistShoppingHydrateRemoteStateToMain(state, force);
  };

  const runWrapped = () => {
    const promise = executeHydration().finally(() => {
      if (shoppingStateHydrationPromise === promise) {
        shoppingStateHydrationPromise = null;
      }
    });
    return promise;
  };

  if (!force && shoppingStateHydrationPromise) {
    return shoppingStateHydrationPromise;
  }

  if (force && shoppingStateHydrationPromise) {
    shoppingStateHydrationPromise = shoppingStateHydrationPromise
      .catch(() => {})
      .then(() => {
        const nextPromise = runWrapped();
        shoppingStateHydrationPromise = nextPromise;
        return nextPromise;
      });
    return shoppingStateHydrationPromise;
  }

  shoppingStateHydrationPromise = runWrapped();
  return shoppingStateHydrationPromise;
}

function flushFavoriteEatsPendingRemoteShoppingUiRefresh() {
  if (
    !favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks ||
    !shouldUseRemoteShoppingState()
  ) {
    return;
  }
  const kind = favoriteEatsPendingRemoteShoppingUiRefreshKind || 'plan';
  favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = false;
  favoriteEatsPendingRemoteShoppingUiRefreshKind = null;
  if (kind === 'list') {
    void runFavoriteEatsRemoteListRefresh({ source: 'pending list ui refresh' });
    return;
  }
  void runFavoriteEatsRemoteShoppingPlanRefresh({
    source: 'pending plan ui refresh',
  });
}

function registerFavoriteEatsRemoteListUiRefreshHook(fn) {
  if (typeof fn !== 'function') return;
  favoriteEatsRemoteListUiRefreshHooks.push(fn);
  if (
    favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks &&
    favoriteEatsPendingRemoteShoppingUiRefreshKind === 'list'
  ) {
    flushFavoriteEatsPendingRemoteShoppingUiRefresh();
  }
}

function registerFavoriteEatsRemoteListPatchHook(fn) {
  if (typeof fn !== 'function') return;
  favoriteEatsRemoteListPatchHooks.push(fn);
}

// Per-row Realtime patch hook system for plan changes. Mirrors the list
// patch hook so screens (items / recipes) can claim a specific row payload
// and avoid the wholesale `load_shopping_state` round-trip. Hooks return
// true when they consumed the payload; if no hook claims it, the caller
// falls back to the wholesale hydrate.
function registerFavoriteEatsRemotePlanPatchHook(fn) {
  if (typeof fn !== 'function') return;
  favoriteEatsRemotePlanPatchHooks.push(fn);
}

function registerFavoriteEatsRemotePlanUiRefreshHook(fn) {
  if (typeof fn !== 'function') return;
  favoriteEatsRemotePlanUiRefreshHooks.push(fn);
  if (
    favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks &&
    favoriteEatsPendingRemoteShoppingUiRefreshKind !== 'list'
  ) {
    flushFavoriteEatsPendingRemoteShoppingUiRefresh();
  }
}

function teardownFavoriteEatsShoppingPlanRealtime() {
  if (favoriteEatsCatalogReferenceRealtimeDebounceTimer) {
    try {
      clearTimeout(favoriteEatsCatalogReferenceRealtimeDebounceTimer);
    } catch (_) {}
    favoriteEatsCatalogReferenceRealtimeDebounceTimer = null;
  }
  if (typeof favoriteEatsCatalogReferenceRealtimeUnsub === 'function') {
    try {
      favoriteEatsCatalogReferenceRealtimeUnsub();
    } catch (_) {}
  }
  favoriteEatsCatalogReferenceRealtimeUnsub = null;
  favoriteEatsCatalogReferenceUiRefreshHooks = [];
  if (typeof favoriteEatsRecipeCatalogCompositionUnsub === 'function') {
    try {
      favoriteEatsRecipeCatalogCompositionUnsub();
    } catch (_) {}
  }
  favoriteEatsRecipeCatalogCompositionUnsub = null;
  if (favoriteEatsShoppingPlanRealtimeDebounceTimer) {
    try {
      clearTimeout(favoriteEatsShoppingPlanRealtimeDebounceTimer);
    } catch (_) {}
    favoriteEatsShoppingPlanRealtimeDebounceTimer = null;
  }
  if (favoriteEatsPlanSelectedItemsUiRefreshTimer) {
    try {
      clearTimeout(favoriteEatsPlanSelectedItemsUiRefreshTimer);
    } catch (_) {}
    favoriteEatsPlanSelectedItemsUiRefreshTimer = null;
  }
  if (typeof favoriteEatsShoppingPlanRealtimeUnsub === 'function') {
    try {
      favoriteEatsShoppingPlanRealtimeUnsub();
    } catch (_) {}
  }
  favoriteEatsShoppingPlanRealtimeUnsub = null;
  favoriteEatsRemotePlanUiRefreshHooks = [];
  favoriteEatsRemoteListUiRefreshHooks = [];
  favoriteEatsRemoteListPatchHooks = [];
  favoriteEatsRemotePlanPatchHooks = [];
  favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = false;
  favoriteEatsPendingRemoteShoppingUiRefreshKind = null;
  if (favoriteEatsShoppingListRealtimeDebounceTimer) {
    try {
      clearTimeout(favoriteEatsShoppingListRealtimeDebounceTimer);
    } catch (_) {}
    favoriteEatsShoppingListRealtimeDebounceTimer = null;
  }
  if (typeof favoriteEatsRecipeCatalogRealtimeUnsub === 'function') {
    try {
      favoriteEatsRecipeCatalogRealtimeUnsub();
    } catch (_) {}
  }
  favoriteEatsRecipeCatalogRealtimeUnsub = null;
  if (typeof favoriteEatsShoppingListRealtimeUnsub === 'function') {
    try {
      favoriteEatsShoppingListRealtimeUnsub();
    } catch (_) {}
  }
  favoriteEatsShoppingListRealtimeUnsub = null;
  if (typeof favoriteEatsAppActivityPresenceUnsub === 'function') {
    try {
      favoriteEatsAppActivityPresenceUnsub();
    } catch (_) {}
  }
  favoriteEatsAppActivityPresenceUnsub = null;
  try {
    window.favoriteEatsAppActivityHasOthers = false;
    window.favoriteEatsAppActivitySelfMoniker = '';
    window.favoriteEatsAppActivityOtherMonikers = [];
    window.dispatchEvent(
      new CustomEvent('favoriteEatsAppActivityOthers', {
        detail: { hasOthers: false, otherMonikers: [], selfMoniker: '' },
      }),
    );
  } catch (_) {}
  if (favoriteEatsAppCoPresenceDeferTimer) {
    try {
      clearTimeout(favoriteEatsAppCoPresenceDeferTimer);
    } catch (_) {}
  }
  favoriteEatsAppCoPresenceDeferTimer = null;
  favoriteEatsAppCoPresenceDeferPayload = null;
  if (shoppingHydrateStaleRetryTimer != null) {
    try {
      clearTimeout(shoppingHydrateStaleRetryTimer);
    } catch (_) {}
    shoppingHydrateStaleRetryTimer = null;
  }
}

// Debounced plan refresh (force allowed). List Realtime uses a separate path
// that revision-probes without plan regen merge (checkbox snap-back defense).
function scheduleFavoriteEatsRemoteShoppingPlanHydrate(options = {}) {
  if (!shouldUseRemoteShoppingState()) return;
  if (
    !window.dataService ||
    (typeof window.dataService.subscribePlanChanges !== 'function' &&
      typeof window.dataService.subscribeListChanges !== 'function')
  ) {
    return;
  }
  const force = !!(options && options.force);
  const source =
    options && typeof options.source === 'string' && options.source
      ? options.source
      : force
        ? 'forced plan hydrate'
        : 'plan hydrate';
  const absorbedPlanRealtimeMatch = String(source || '').match(
    /^plan realtime fallback:plan\.(selected_items|selected_recipe_roots|selected_recipes|documents|store_preferences)$/,
  );
  if (absorbedPlanRealtimeMatch) {
    try {
      if (window.favoriteEatsInputSyncDebugToConsole === true) {
        console.info(
          '[favorite-eats-items-quantity-stepper]',
          absorbedPlanRealtimeMatch[1] === 'documents'
            ? 'parent event absorbed'
            : 'companion event absorbed',
          {
            table: absorbedPlanRealtimeMatch[1],
            source,
            absorbed: true,
          },
        );
      }
    } catch (_) {}
    return;
  }
  try {
    if (window.favoriteEatsInputSyncDebugToConsole === true) {
      console.info(
        '[favorite-eats-shopping-list-checkbox]',
        'plan hydrate scheduled',
        { source, force },
      );
    }
  } catch (_) {}
  if (favoriteEatsShoppingPlanRealtimeDebounceTimer) {
    clearTimeout(favoriteEatsShoppingPlanRealtimeDebounceTimer);
  }
  favoriteEatsShoppingPlanRealtimeDebounceTimer = setTimeout(() => {
    favoriteEatsShoppingPlanRealtimeDebounceTimer = null;
    if (force) {
      bumpShoppingStateRemoteApplyGeneration();
    }
    void runFavoriteEatsRemoteShoppingPlanRefresh({ force, source });
  }, 320);
}

function scheduleFavoriteEatsRemoteListRefresh(source = 'list realtime fallback') {
  if (!shouldUseRemoteShoppingState()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeListChanges !== 'function'
  ) {
    return;
  }
  if (favoriteEatsShoppingListRealtimeDebounceTimer) {
    clearTimeout(favoriteEatsShoppingListRealtimeDebounceTimer);
  }
  try {
    if (window.favoriteEatsInputSyncDebugToConsole === true) {
      console.info(
        '[favorite-eats-shopping-list-checkbox]',
        'list hydrate scheduled',
        { source },
      );
    }
  } catch (_) {}
  favoriteEatsShoppingListRealtimeDebounceTimer = setTimeout(() => {
    favoriteEatsShoppingListRealtimeDebounceTimer = null;
    void runFavoriteEatsRemoteListRefresh({ source });
  }, 320);
}

// Charter §I forbids using a global "any pending op anywhere" gate to skip
// refreshes. The per-key merge in shoppingListPage (mergePendingCheckboxOpsIntoDoc)
// and itemsPage (mergePendingPlannerQtyIntoLocalMaps) protects in-burst rows
// at refresh time; the per-key shouldSkipEcho gate protects them at realtime
// echo time. So this function intentionally returns false; the
// shoppingListRowDataRpcInFlight counter is preserved for non-correctness uses
// (RPC instrumentation) but is no longer load-bearing for refresh gating.
function shouldSkipShoppingListRemoteUiRefresh() {
  return false;
}

async function runFavoriteEatsRemoteListUiRefreshHooksOnly() {
  const hooks = favoriteEatsRemoteListUiRefreshHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      await hooks[i]();
    } catch (err2) {
      console.warn('Remote shopping list UI refresh failed:', err2);
    }
  }
  if (!hooks.length) {
    favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = true;
    favoriteEatsPendingRemoteShoppingUiRefreshKind = 'list';
  }
}

async function runFavoriteEatsRemoteListPatchHooks(payload) {
  if (!favoriteEatsRemoteListPatchHooks.length) return false;
  let handled = false;
  const hooks = favoriteEatsRemoteListPatchHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      const result = await hooks[i](payload);
      if (result === true) handled = true;
    } catch (err) {
      console.warn('Remote shopping list patch failed:', err);
    }
  }
  return handled;
}

async function runFavoriteEatsRemotePlanPatchHooks(payload) {
  if (!favoriteEatsRemotePlanPatchHooks.length) return false;
  let handled = false;
  const hooks = favoriteEatsRemotePlanPatchHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      const result = await hooks[i](payload);
      if (result === true) handled = true;
    } catch (err) {
      console.warn('Remote shopping plan patch failed:', err);
    }
  }
  return handled;
}

function logFavoriteEatsItemsQuantitySync(label, detail = {}) {
  try {
    if (window.favoriteEatsInputSyncDebugToConsole !== true) return;
    console.info('[favorite-eats-items-quantity-stepper]', label, detail || {});
  } catch (_) {}
}

async function runFavoriteEatsRemotePlanUiRefreshHooksOnly() {
  const hooks = favoriteEatsRemotePlanUiRefreshHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      await hooks[i]();
    } catch (err2) {
      console.warn('Remote shopping plan UI refresh failed:', err2);
    }
  }
  if (!hooks.length) {
    favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = true;
    favoriteEatsPendingRemoteShoppingUiRefreshKind = 'plan';
  }
}

function scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly(source = 'plan child patch') {
  favoriteEatsRemotePlanUiRefreshRequestSeq += 1;
  try {
    window.__favoriteEatsRemotePlanUiRefreshRequestSeq =
      favoriteEatsRemotePlanUiRefreshRequestSeq;
  } catch (_) {}
  if (favoriteEatsPlanSelectedItemsUiRefreshTimer) {
    clearTimeout(favoriteEatsPlanSelectedItemsUiRefreshTimer);
  }
  favoriteEatsPlanSelectedItemsUiRefreshTimer = setTimeout(() => {
    favoriteEatsPlanSelectedItemsUiRefreshTimer = null;
    void runFavoriteEatsRemotePlanUiRefreshHooksOnly();
  }, PLAN_SELECTED_ITEMS_UI_REFRESH_DEBOUNCE_MS);
  logFavoriteEatsItemsQuantitySync('ui refresh coalesced', {
    source,
    delayMs: PLAN_SELECTED_ITEMS_UI_REFRESH_DEBOUNCE_MS,
  });
}

function applyFavoriteEatsPlanSelectedItemRealtimePatch(payload) {
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
  if (!rowData) return true;
  const itemKey = String(rowData.item_key || '').trim();
  if (!itemKey) return true;
  const nextQuantity = isDelete ? 0 : Math.max(0, Number(rowData.quantity || 0));
  if (!Number.isFinite(nextQuantity)) return true;
  const updatedAt = rowData.updated_at || rowData.updatedAt || null;
  const opLike = { surface: 'plan', entityKey: itemKey, field: 'quantity' };
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanItemsQuantityQueue
      : null;
  if (
    queue &&
    typeof queue.shouldSkipEcho === 'function' &&
    queue.shouldSkipEcho(opLike, { updated_at: updatedAt, value: nextQuantity })
  ) {
    const queueState =
      typeof queue.getKeyState === 'function' ? queue.getKeyState(opLike) : null;
    logFavoriteEatsItemsQuantitySync('child patch skipped', {
      itemKey,
      value: nextQuantity,
      updated_at: updatedAt,
      pending: !!queueState?.pending,
      inFlight: !!queueState?.inFlight,
      lastAppliedServerUpdatedAt: queueState?.lastAppliedServerUpdatedAt || null,
    });
    return true;
  }
  const rawIv = Number(rowData.ingredient_variant_id);
  setShoppingPlanItemSelection(
    {
      key: itemKey,
      name: String(rowData.name || '').trim(),
      variantName: String(rowData.variant_name || '').trim(),
      quantity: nextQuantity,
      ingredientVariantId:
        Number.isFinite(rawIv) && rawIv > 0 ? Math.trunc(rawIv) : null,
    },
    { skipRemoteSave: true },
  );
  if (queue && typeof queue.recordEchoApplied === 'function') {
    queue.recordEchoApplied(opLike, {
      updated_at: updatedAt,
      value: nextQuantity,
    });
  }
  logFavoriteEatsItemsQuantitySync('child patch applied', {
    itemKey,
    value: nextQuantity,
    updated_at: updatedAt,
    eventType,
    handler: 'main',
  });
  return true;
}

function applyFavoriteEatsPlanSelectedRecipeRealtimePatch(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (String(payload.schema || '') !== 'plan') return false;
  if (String(payload.table || '') !== 'selected_recipes') return false;
  const eventType = String(payload.eventType || '').toUpperCase();
  const isDelete = eventType === 'DELETE';
  const rowData = isDelete
    ? payload.old && typeof payload.old === 'object'
      ? payload.old
      : null
    : payload.new && typeof payload.new === 'object'
      ? payload.new
      : null;
  if (!rowData) return true;
  const recipeId = Number(rowData.recipe_id);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return true;
  const key = String(Math.trunc(recipeId));
  const nextQuantity = isDelete ? 0 : Math.max(0, Number(rowData.quantity || 0));
  if (!Number.isFinite(nextQuantity)) return true;
  const rawServings = isDelete
    ? null
    : rowData.servings_override != null
      ? Number(rowData.servings_override)
      : null;
  const nextServings =
    rawServings != null && Number.isFinite(rawServings) && rawServings > 0
      ? rawServings
      : null;
  const updatedAt = rowData.updated_at || rowData.updatedAt || null;
  const opLike = { surface: 'plan', entityKey: key, field: 'servingsOverride' };
  const queue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeServingsQueue
      : null;
  const queueState =
    queue && typeof queue.getKeyState === 'function'
      ? queue.getKeyState(opLike)
      : null;
  const hasActiveLocalServingsIntent = !!(
    queueState?.pending || queueState?.inFlight
  );
  const shouldSkipServingsEcho = !!(
    !isDelete &&
    queue &&
    typeof queue.shouldSkipEcho === 'function' &&
    queue.shouldSkipEcho(opLike, { updated_at: updatedAt, value: nextServings })
  );
  const servingsForPatch =
    shouldSkipServingsEcho && hasActiveLocalServingsIntent
      ? undefined
      : nextServings;
  if (isDelete || nextQuantity <= 0) {
    setShoppingPlanRecipeRootSelection(
      {
        recipeId,
        title: String(rowData.title || '').trim(),
        quantity: 0,
      },
      { skipRemoteSave: true },
    );
  } else {
    const roots = getShoppingPlanRecipeSelectionRoots();
    const rootEntry = roots && typeof roots === 'object' ? roots[key] : null;
    setShoppingPlanRecipeRootSelection(
      {
        recipeId,
        title: String(rootEntry?.title || rowData.title || '').trim(),
        quantity:
          rootEntry && typeof rootEntry === 'object'
            ? Number(rootEntry.quantity || nextQuantity)
            : nextQuantity,
        servingsOverride: servingsForPatch,
      },
      { skipRemoteSave: true },
    );
  }
  if (
    !isDelete &&
    !hasActiveLocalServingsIntent &&
    queue &&
    typeof queue.recordEchoApplied === 'function'
  ) {
    queue.recordEchoApplied(opLike, {
      updated_at: updatedAt,
      value: nextServings,
    });
  }
  return true;
}

function applyFavoriteEatsPlanSelectedRecipeRootRealtimePatch(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (String(payload.schema || '') !== 'plan') return false;
  if (String(payload.table || '') !== 'selected_recipe_roots') return false;
  const eventType = String(payload.eventType || '').toUpperCase();
  const isDelete = eventType === 'DELETE';
  const rowData = isDelete
    ? payload.old && typeof payload.old === 'object'
      ? payload.old
      : null
    : payload.new && typeof payload.new === 'object'
      ? payload.new
      : null;
  if (!rowData) return true;
  const recipeId = Number(rowData.recipe_id);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return true;
  const key = String(Math.trunc(recipeId));
  const nextQuantity = isDelete ? 0 : Math.max(0, Number(rowData.quantity || 0));
  if (!Number.isFinite(nextQuantity)) return true;
  const rootQuantityValue = nextQuantity > 0 ? 1 : 0;
  const rawServings = isDelete
    ? null
    : rowData.servings_override != null
      ? Number(rowData.servings_override)
      : null;
  const nextServings =
    rawServings != null && Number.isFinite(rawServings) && rawServings > 0
      ? rawServings
      : null;
  const updatedAt = rowData.updated_at || rowData.updatedAt || null;
  const rootOpLike = {
    surface: 'plan',
    entityKey: key,
    field: 'recipeRootQuantity',
  };
  const rootQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeRootQuantityQueue
      : null;
  if (
    rootQueue &&
    typeof rootQueue.shouldSkipEcho === 'function' &&
    rootQueue.shouldSkipEcho(rootOpLike, {
      updated_at: updatedAt,
      value: rootQuantityValue,
    })
  ) {
    return true;
  }
  const servingsOpLike = {
    surface: 'plan',
    entityKey: key,
    field: 'servingsOverride',
  };
  const servingsQueue =
    typeof window !== 'undefined'
      ? window.favoriteEatsPlanRecipeServingsQueue
      : null;
  const servingsQueueState =
    servingsQueue && typeof servingsQueue.getKeyState === 'function'
      ? servingsQueue.getKeyState(servingsOpLike)
      : null;
  const hasActiveLocalServingsIntent = !!(
    servingsQueueState?.pending || servingsQueueState?.inFlight
  );
  const shouldSkipServingsEcho = !!(
    !isDelete &&
    servingsQueue &&
    typeof servingsQueue.shouldSkipEcho === 'function' &&
    servingsQueue.shouldSkipEcho(servingsOpLike, {
      updated_at: updatedAt,
      value: nextServings,
    })
  );
  const servingsForPatch =
    shouldSkipServingsEcho && hasActiveLocalServingsIntent
      ? undefined
      : nextServings;
  setShoppingPlanRecipeRootSelection(
    {
      recipeId,
      title: String(rowData.title || '').trim(),
      quantity: nextQuantity,
      servingsOverride: servingsForPatch,
    },
    { skipRemoteSave: true },
  );
  updateShoppingPlan((plan) => {
    materializeShoppingPlanRecipeSelectionsFromRoots(plan, window.dbInstance);
  }, { skipRemoteSave: true });
  if (
    rootQueue &&
    typeof rootQueue.recordEchoApplied === 'function'
  ) {
    rootQueue.recordEchoApplied(rootOpLike, {
      updated_at: updatedAt,
      value: rootQuantityValue,
    });
  }
  if (
    !isDelete &&
    !hasActiveLocalServingsIntent &&
    servingsQueue &&
    typeof servingsQueue.recordEchoApplied === 'function'
  ) {
    servingsQueue.recordEchoApplied(servingsOpLike, {
      updated_at: updatedAt,
      value: nextServings,
    });
  }
  return true;
}

async function runFavoriteEatsRemoteListRefresh(options = {}) {
  if (!shouldUseRemoteShoppingState()) return;
  const source =
    options && typeof options.source === 'string' && options.source
      ? options.source
      : 'list refresh';
  try {
    if (window.favoriteEatsInputSyncDebugToConsole === true) {
      console.info(
        '[favorite-eats-shopping-list-checkbox]',
        'list hydrate started',
        { source },
      );
    }
  } catch (_) {}
  let hydrated = false;
  try {
    hydrated = await hydrateShoppingStateFromDataService({ source });
  } catch (err) {
    console.warn('Remote shopping list hydrate failed:', err);
    return;
  }
  if (!hydrated || shouldSkipShoppingListRemoteUiRefresh()) return;
  await runFavoriteEatsRemoteListUiRefreshHooksOnly();
}

async function runFavoriteEatsRemoteShoppingPlanRefresh(options = {}) {
  if (!shouldUseRemoteShoppingState()) return;
  const force = !!(options && options.force);
  const source =
    options && typeof options.source === 'string' && options.source
      ? options.source
      : force
        ? 'forced plan refresh'
        : 'plan refresh';
  try {
    if (window.favoriteEatsInputSyncDebugToConsole === true) {
      console.info(
        '[favorite-eats-shopping-list-checkbox]',
        'plan hydrate started',
        { source, force },
      );
    }
  } catch (_) {}
  const store = window.favoriteEatsStore;
  const beforeRevisions =
    store && typeof store.getSnapshot === 'function'
      ? store.getSnapshot().revisions
      : { planUpdatedAt: null, listSessionUpdatedAt: null };
  let hydrated = false;
  try {
    hydrated = await hydrateShoppingStateFromDataService(
      force ? { force: true, source } : { source },
    );
  } catch (err) {
    console.warn('Remote shopping plan hydrate failed:', err);
    return;
  }
  if (!hydrated || shouldSkipShoppingListRemoteUiRefresh()) return;

  if (!force && store && typeof store.revisionProbeAxesChanged === 'function') {
    const afterRevisions =
      typeof store.getSnapshot === 'function'
        ? store.getSnapshot().revisions
        : beforeRevisions;
    const axes = store.revisionProbeAxesChanged(beforeRevisions, afterRevisions);
    if (axes.list && !axes.plan) {
      await runFavoriteEatsRemoteListUiRefreshHooksOnly();
      return;
    }
  }

  favoriteEatsInvalidationMaintainOut = null;
  if (favoriteEatsShouldUseSupabaseDataDoor()) {
    try {
      favoriteEatsInvalidationMaintainOut = await maintainShoppingPlanStorageWithDb(
        null,
        { skipRemotePlanSave: true },
      );
    } catch (maintainErr) {
      console.warn(
        'maintainShoppingPlanStorageWithDb (invalidation) failed:',
        maintainErr,
      );
    }
  }
  const hooks = favoriteEatsRemotePlanUiRefreshHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      await hooks[i]();
    } catch (err2) {
      console.warn('Remote shopping plan UI refresh failed:', err2);
    }
  }
  favoriteEatsInvalidationMaintainOut = null;
  if (!hooks.length) {
    favoriteEatsPendingRemoteShoppingUiRefreshAfterHooks = true;
    favoriteEatsPendingRemoteShoppingUiRefreshKind = 'plan';
  }
}

function registerFavoriteEatsCatalogReferenceUiRefreshHook(fn) {
  if (typeof fn !== 'function') return () => {};
  favoriteEatsCatalogReferenceUiRefreshHooks.push(fn);
  return () => {
    const idx = favoriteEatsCatalogReferenceUiRefreshHooks.indexOf(fn);
    if (idx >= 0) favoriteEatsCatalogReferenceUiRefreshHooks.splice(idx, 1);
  };
}

async function commitOpenRecipeEditorDocumentPaint(surfaces, reason) {
  const ds = window.favoriteEatsDocumentSession;
  const session =
    ds && typeof ds.getActiveRecipeSession === 'function'
      ? ds.getActiveRecipeSession()
      : null;
  if (!session || typeof session.commitPaint !== 'function') return false;
  await session.commitPaint({ surfaces, reason });
  return true;
}

async function tryApplyOpenRecipeEditorCatalogPatches() {
  const ds = window.favoriteEatsDocumentSession;
  const session =
    ds && typeof ds.getActiveRecipeSession === 'function'
      ? ds.getActiveRecipeSession()
      : null;
  if (!session || typeof session.applyCatalogVariantPurgedPatch !== 'function') {
    return false;
  }
  const patches =
    ds && typeof ds.consumePendingCatalogVariantPurges === 'function'
      ? ds.consumePendingCatalogVariantPurges()
      : [];
  if (!patches.length) return false;

  let matchContext = {};
  try {
    if (
      window.dataService &&
      typeof window.dataService.buildRecipeEditorPreflightHelpers === 'function'
    ) {
      window.dataService.useSupabase = true;
      const bundle = await window.dataService.buildRecipeEditorPreflightHelpers();
      if (bundle && bundle.ingredient) {
        matchContext = {
          getVisibleCanonicalId: bundle.ingredient.getVisibleCanonicalId,
        };
      }
    }
  } catch (_) {}

  let changed = false;
  patches.forEach((patch) => {
    if (session.applyCatalogVariantPurgedPatch(patch, matchContext)) {
      changed = true;
    }
  });
  if (!changed) return false;
  await session.commitPaint({
    surfaces: [ds.SURFACE_INGREDIENTS, ds.SURFACE_YOU_WILL_NEED],
    reason: 'catalog-variant-purged',
  });
  return true;
}

function invalidateFavoriteEatsRecipeCatalogReadCaches() {
  if (
    !window.dataService ||
    typeof window.dataService.bumpRecipeCompositionReadModel !== 'function'
  ) {
    return;
  }
  try {
    window.dataService.useSupabase = true;
    window.dataService.bumpRecipeCompositionReadModel();
  } catch (err) {
    console.warn('invalidateFavoriteEatsRecipeCatalogReadCaches failed:', err);
  }
}

async function loadOpenRecipeEditorRecipeDetailBypassingCache(recipeId) {
  const id = Number(recipeId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (
    !window.dataService ||
    typeof window.dataService.loadRecipeDetail !== 'function'
  ) {
    return null;
  }
  invalidateFavoriteEatsRecipeCatalogReadCaches();
  window.dataService.useSupabase = true;
  return window.dataService.loadRecipeDetail(id, {
    bypassRecipeDetailCache: true,
  });
}

async function tryMergeOpenRecipeEditorCatalogIngredientFieldsFromServer() {
  if (!document.body.classList.contains('recipe-editor-page')) return false;
  const recipeId = Number(window.recipeId);
  if (!Number.isFinite(recipeId) || recipeId <= 0 || !window.recipeData) {
    return false;
  }
  if (
    typeof window.recipeEditorApplyPersistedCatalogIngredientFields !==
    'function'
  ) {
    return false;
  }
  try {
    const refreshed = await loadOpenRecipeEditorRecipeDetailBypassingCache(
      recipeId,
    );
    if (!refreshed) return false;
    const changed = window.recipeEditorApplyPersistedCatalogIngredientFields(
      window.recipeData,
      refreshed,
    );
    if (!changed) return false;
    if (typeof window.hydrateRecipeIngredientMetricFlags === 'function') {
      window.hydrateRecipeIngredientMetricFlags(window.recipeData);
    }
    const ds = window.favoriteEatsDocumentSession;
    if (
      ds &&
      typeof ds.SURFACE_INGREDIENTS === 'string' &&
      typeof ds.SURFACE_YOU_WILL_NEED === 'string' &&
      (await commitOpenRecipeEditorDocumentPaint(
        [ds.SURFACE_INGREDIENTS, ds.SURFACE_YOU_WILL_NEED],
        'catalog-merge',
      ))
    ) {
      return true;
    }
    if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
      window.recipeEditorRerenderIngredientsFromModel({
        syncYouWillNeed: false,
      });
    }
    if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
      window.recipeEditorRerenderYouWillNeedFromModel();
    }
    return true;
  } catch (err) {
    console.warn(
      'tryMergeOpenRecipeEditorCatalogIngredientFieldsFromServer failed:',
      err,
    );
    return false;
  }
}

async function refreshFavoriteEatsOpenRecipeEditorFromCatalogChange() {
  if (!document.body.classList.contains('recipe-editor-page')) return false;
  const recipeId = Number(window.recipeId);
  if (!Number.isFinite(recipeId) || recipeId <= 0) return false;
  if (typeof window.fePaintProbeLog === 'function') {
    window.fePaintProbeLog('catalog:openRecipeEditorReload:enter', {
      recipeId,
      dirty:
        typeof window.recipeEditorGetIsDirty === 'function'
          ? window.recipeEditorGetIsDirty()
          : null,
    });
  }
  if (
    typeof window.recipeEditorGetIsDirty === 'function' &&
    window.recipeEditorGetIsDirty()
  ) {
    try {
      if (await tryApplyOpenRecipeEditorCatalogPatches()) {
        return true;
      }
    } catch (patchErr) {
      console.warn(
        'tryApplyOpenRecipeEditorCatalogPatches (dirty editor) failed:',
        patchErr,
      );
    }
    try {
      if (await tryMergeOpenRecipeEditorCatalogIngredientFieldsFromServer()) {
        return true;
      }
    } catch (mergeErr) {
      console.warn(
        'tryMergeOpenRecipeEditorCatalogIngredientFieldsFromServer (dirty editor) failed:',
        mergeErr,
      );
    }
    return false;
  }
  if (
    !window.dataService ||
    typeof window.dataService.loadRecipeDetail !== 'function'
  ) {
    return false;
  }
  try {
    const refreshed = await loadOpenRecipeEditorRecipeDetailBypassingCache(
      recipeId,
    );
    if (!refreshed) return false;

    const ds = window.favoriteEatsDocumentSession;
    const session =
      ds && typeof ds.getActiveRecipeSession === 'function'
        ? ds.getActiveRecipeSession()
        : null;
    const saveOwnedCatalogReload =
      session && typeof session.consumeSaveOwnedCatalogReload === 'function'
        ? session.consumeSaveOwnedCatalogReload()
        : false;

    if (
      typeof window.recipeEditorApplyPersistedBindingFields === 'function' &&
      window.recipeData
    ) {
      window.recipeEditorApplyPersistedBindingFields(window.recipeData, refreshed);
    }

    const displayEquivalent =
      typeof window.recipeEditorModelsDisplayEquivalent === 'function' &&
      window.recipeEditorModelsDisplayEquivalent(window.recipeData, refreshed);

    if (displayEquivalent && !saveOwnedCatalogReload) {
      window.originalRecipeSnapshot = JSON.parse(
        JSON.stringify(window.recipeData),
      );
      if (typeof window.hydrateRecipeIngredientMetricFlags === 'function') {
        window.hydrateRecipeIngredientMetricFlags(window.recipeData);
      }
      if (
        ds &&
        typeof ds.SURFACE_INGREDIENTS === 'string' &&
        typeof ds.SURFACE_YOU_WILL_NEED === 'string' &&
        (await commitOpenRecipeEditorDocumentPaint(
          [ds.SURFACE_INGREDIENTS, ds.SURFACE_YOU_WILL_NEED],
          'catalog-reload-equivalent',
        ))
      ) {
        if (typeof window.fePaintProbeLog === 'function') {
          window.fePaintProbeLog('catalog:openRecipeEditorReload:paintedEquivalent', {
            recipeId,
          });
        }
        return true;
      }
      if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
        window.recipeEditorRerenderYouWillNeedFromModel();
      }
      if (typeof window.fePaintProbeLog === 'function') {
        window.fePaintProbeLog('catalog:openRecipeEditorReload:skipEquivalent', {
          recipeId,
          saveOwnedCatalogReload,
        });
      }
      return true;
    }

    if (saveOwnedCatalogReload) {
      window.originalRecipeSnapshot = JSON.parse(
        JSON.stringify(window.recipeData),
      );
      if (typeof window.fePaintProbeLog === 'function') {
        window.fePaintProbeLog('catalog:openRecipeEditorReload:skipSaveOwned', {
          recipeId,
        });
      }
      return true;
    }

    window.originalRecipeSnapshot = JSON.parse(JSON.stringify(refreshed));
    window.recipeData = JSON.parse(JSON.stringify(refreshed));
    if (typeof window.hydrateRecipeIngredientMetricFlags === 'function') {
      window.hydrateRecipeIngredientMetricFlags(window.recipeData);
    }
    const isPlannerMode =
      document.body?.dataset?.plannerMode === 'on';
    if (
      !isPlannerMode &&
      ds &&
      typeof ds.SURFACE_FULL_PAGE === 'string' &&
      (await commitOpenRecipeEditorDocumentPaint(
        [ds.SURFACE_FULL_PAGE],
        'catalog-reload',
      ))
    ) {
      if (typeof window.fePaintProbeLog === 'function') {
        window.fePaintProbeLog('catalog:openRecipeEditorReload:paintedFullPage', {
          recipeId,
        });
      }
      return true;
    }
    let renderedRefreshedRecipe = false;
    if (!isPlannerMode && typeof renderRecipe === 'function' && window.recipeData) {
      renderRecipe(window.recipeData);
      renderedRefreshedRecipe = true;
    }
    if (
      !renderedRefreshedRecipe &&
      !isPlannerMode &&
      typeof window.recipeEditorRerenderIngredientsFromModel === 'function'
    ) {
      window.recipeEditorRerenderIngredientsFromModel();
    }
    if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
      window.recipeEditorRerenderYouWillNeedFromModel();
    }
    return true;
  } catch (err) {
    console.warn(
      'refreshFavoriteEatsOpenRecipeEditorFromCatalogChange failed:',
      err,
    );
    return false;
  }
}

async function refreshFavoriteEatsOpenRecipeEditorCatalogGrammarFromModel() {
  if (!document.body.classList.contains('recipe-editor-page')) return;
  try {
    if (await tryApplyOpenRecipeEditorCatalogPatches()) {
      return;
    }
  } catch (patchErr) {
    console.warn(
      'tryApplyOpenRecipeEditorCatalogPatches (grammar fallback) failed:',
      patchErr,
    );
  }
  if (typeof window.hydrateRecipeIngredientMetricFlags === 'function') {
    window.hydrateRecipeIngredientMetricFlags(window.recipeData);
  }
  const ds = window.favoriteEatsDocumentSession;
  if (
    ds &&
    typeof ds.SURFACE_INGREDIENTS === 'string' &&
    typeof ds.SURFACE_YOU_WILL_NEED === 'string' &&
    (await commitOpenRecipeEditorDocumentPaint(
      [ds.SURFACE_INGREDIENTS, ds.SURFACE_YOU_WILL_NEED],
      'catalog-grammar',
    ))
  ) {
    return;
  }
  if (typeof window.recipeEditorRerenderIngredientsFromModel === 'function') {
    window.recipeEditorRerenderIngredientsFromModel();
  }
  if (typeof window.recipeEditorRerenderYouWillNeedFromModel === 'function') {
    window.recipeEditorRerenderYouWillNeedFromModel();
  }
}

registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
  await refreshFavoriteEatsCatalogReferenceCaches();
  const reloaded = await refreshFavoriteEatsOpenRecipeEditorFromCatalogChange();
  if (!reloaded) {
    await refreshFavoriteEatsOpenRecipeEditorCatalogGrammarFromModel();
  }
});

if (
  window.favoriteEatsRecipeCompositionSync &&
  typeof window.favoriteEatsRecipeCompositionSync
    .registerFavoriteEatsCatalogCompositionUiRefreshHook === 'function'
) {
  window.favoriteEatsRecipeCompositionSync.registerFavoriteEatsCatalogCompositionUiRefreshHook(
    async () => {
      const reloaded =
        await refreshFavoriteEatsOpenRecipeEditorFromCatalogChange();
      if (!reloaded) {
        await refreshFavoriteEatsOpenRecipeEditorCatalogGrammarFromModel();
      }
    },
  );
}

function applyFavoriteEatsCatalogSurfacesCrossTabPayload(data, fallbackSource) {
  if (!data || data.type !== 'catalog-surfaces-refresh') return;
  scheduleFavoriteEatsCatalogDependentSurfacesRefresh({
    source:
      typeof data.source === 'string' && data.source.trim()
        ? data.source.trim()
        : fallbackSource || 'cross-tab catalog surfaces refresh',
    composition: data.composition !== false,
    reference: data.reference !== false,
    skipCrossTabBroadcast: true,
    catalogVariantPurged: data.catalogVariantPurged || null,
  });
}

function postFavoriteEatsCatalogSurfacesCrossTabStorageSignal(options = {}) {
  if (typeof localStorage === 'undefined') return;
  const purge =
    options && options.catalogVariantPurged ? options.catalogVariantPurged : null;
  try {
    localStorage.setItem(
      FAVORITE_EATS_CATALOG_SURFACES_STORAGE_KEY,
      JSON.stringify({
        type: 'catalog-surfaces-refresh',
        source:
          options && typeof options.source === 'string' ? options.source : '',
        composition: options.composition !== false,
        reference: options.reference !== false,
        catalogVariantPurged:
          purge &&
          Number.isFinite(Number(purge.ingredientId)) &&
          String(purge.variantName || '').trim()
            ? {
                ingredientId: Number(purge.ingredientId),
                variantName: String(purge.variantName).trim(),
                ingredientName:
                  typeof purge.ingredientName === 'string'
                    ? purge.ingredientName.trim()
                    : '',
              }
            : null,
        t: Date.now(),
      }),
    );
  } catch (_) {}
}

function installFavoriteEatsCatalogSurfacesCrossTabRefresh() {
  if (favoriteEatsCatalogSurfacesCrossTabInstalled) return;
  favoriteEatsCatalogSurfacesCrossTabInstalled = true;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (
        !event ||
        event.key !== FAVORITE_EATS_CATALOG_SURFACES_STORAGE_KEY ||
        !event.newValue
      ) {
        return;
      }
      try {
        const data = JSON.parse(event.newValue);
        applyFavoriteEatsCatalogSurfacesCrossTabPayload(
          data,
          'storage catalog surfaces refresh',
        );
      } catch (err) {
        console.warn('catalog surfaces storage refresh parse failed:', err);
      }
    });
  }
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(
      FAVORITE_EATS_CATALOG_SURFACES_REFRESH_BC,
    );
    channel.onmessage = (event) => {
      applyFavoriteEatsCatalogSurfacesCrossTabPayload(
        event && event.data,
        'cross-tab catalog surfaces refresh',
      );
    };
    window._feCatalogSurfacesBroadcastChannel = channel;
  } catch (err) {
    console.warn('installFavoriteEatsCatalogSurfacesCrossTabRefresh failed:', err);
  }
}

function broadcastFavoriteEatsCatalogSurfacesRefresh(options = {}) {
  installFavoriteEatsCatalogSurfacesCrossTabRefresh();
  const purge =
    options && options.catalogVariantPurged ? options.catalogVariantPurged : null;
  const payload = {
    type: 'catalog-surfaces-refresh',
    source: options && typeof options.source === 'string' ? options.source : '',
    composition: options.composition !== false,
    reference: options.reference !== false,
    catalogVariantPurged:
      purge &&
      Number.isFinite(Number(purge.ingredientId)) &&
      String(purge.variantName || '').trim()
        ? {
            ingredientId: Number(purge.ingredientId),
            variantName: String(purge.variantName).trim(),
            ingredientName:
              typeof purge.ingredientName === 'string'
                ? purge.ingredientName.trim()
                : '',
          }
        : null,
  };
  try {
    const channel = window._feCatalogSurfacesBroadcastChannel;
    if (channel && typeof channel.postMessage === 'function') {
      channel.postMessage(payload);
    }
  } catch (_) {}
  postFavoriteEatsCatalogSurfacesCrossTabStorageSignal(options);
}

function enqueueFavoriteEatsCatalogDependentSurfacesRefresh(options = {}) {
  if (options.composition) {
    favoriteEatsCatalogReferencePendingComposition = true;
  }
  if (options.reference) {
    favoriteEatsCatalogReferencePendingReference = true;
  }
  const purge = options.catalogVariantPurged;
  if (
    purge &&
    window.favoriteEatsDocumentSession &&
    typeof window.favoriteEatsDocumentSession.stashCatalogVariantPurgedPatch ===
      'function'
  ) {
    window.favoriteEatsDocumentSession.stashCatalogVariantPurgedPatch(purge);
  }
  const source =
    options && typeof options.source === 'string' ? options.source.trim() : '';
  if (source) {
    favoriteEatsCatalogDependentSurfacesPendingSource = source;
  }
}

function flushFavoriteEatsCatalogDependentSurfacesRefreshDebounced(
  fallbackSource = '',
) {
  const needsComposition = favoriteEatsCatalogReferencePendingComposition;
  const needsReference = favoriteEatsCatalogReferencePendingReference;
  favoriteEatsCatalogReferencePendingComposition = false;
  favoriteEatsCatalogReferencePendingReference = false;
  const source =
    favoriteEatsCatalogDependentSurfacesPendingSource ||
    fallbackSource ||
    'catalog dependent surfaces refresh';
  favoriteEatsCatalogDependentSurfacesPendingSource = '';
  if (needsComposition && window.favoriteEatsRecipeCompositionSync) {
    window.favoriteEatsRecipeCompositionSync.scheduleFavoriteEatsCatalogCompositionRefresh(
      { source },
    );
  }
  if (needsReference) {
    void runFavoriteEatsCatalogReferenceRefresh();
  }
}

function scheduleFavoriteEatsCatalogDependentSurfacesRefresh(options = {}) {
  if (!favoriteEatsShouldUseSupabaseDataDoor()) return;
  const refreshOptions = {
    composition: options.composition !== false,
    reference: options.reference !== false,
    source:
      options && typeof options.source === 'string' && options.source.trim()
        ? options.source.trim()
        : 'catalog dependent surfaces refresh',
    catalogVariantPurged: options.catalogVariantPurged || null,
  };
  enqueueFavoriteEatsCatalogDependentSurfacesRefresh(refreshOptions);
  if (!options.skipCrossTabBroadcast) {
    broadcastFavoriteEatsCatalogSurfacesRefresh(refreshOptions);
  }
  if (favoriteEatsCatalogReferenceRealtimeDebounceTimer) {
    clearTimeout(favoriteEatsCatalogReferenceRealtimeDebounceTimer);
  }
  favoriteEatsCatalogReferenceRealtimeDebounceTimer = setTimeout(() => {
    favoriteEatsCatalogReferenceRealtimeDebounceTimer = null;
    flushFavoriteEatsCatalogDependentSurfacesRefreshDebounced();
  }, 320);
}

window.favoriteEatsNotifyCatalogDependentSurfacesRefresh =
  scheduleFavoriteEatsCatalogDependentSurfacesRefresh;

function scheduleFavoriteEatsCatalogReferenceRefresh(payload) {
  if (!favoriteEatsShouldUseSupabaseDataDoor()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeCatalogReferenceChanges !== 'function'
  ) {
    return;
  }
  const table = payload && payload.table != null ? String(payload.table) : '';
  const compositionSync = window.favoriteEatsRecipeCompositionSync;
  if (
    compositionSync &&
    typeof compositionSync.isCompositionTable === 'function' &&
    compositionSync.isCompositionTable(table)
  ) {
    favoriteEatsCatalogReferencePendingComposition = true;
  } else {
    favoriteEatsCatalogReferencePendingReference = true;
  }
  if (favoriteEatsCatalogReferenceRealtimeDebounceTimer) {
    clearTimeout(favoriteEatsCatalogReferenceRealtimeDebounceTimer);
  }
  favoriteEatsCatalogReferenceRealtimeDebounceTimer = setTimeout(() => {
    favoriteEatsCatalogReferenceRealtimeDebounceTimer = null;
    const needsComposition = favoriteEatsCatalogReferencePendingComposition;
    const needsReference = favoriteEatsCatalogReferencePendingReference;
    favoriteEatsCatalogReferencePendingComposition = false;
    favoriteEatsCatalogReferencePendingReference = false;
    if (needsComposition && window.favoriteEatsRecipeCompositionSync) {
      window.favoriteEatsRecipeCompositionSync.scheduleFavoriteEatsCatalogCompositionRefresh(
        { source: `catalog composition realtime:${table || 'unknown'}` },
      );
    }
    if (needsReference) {
      void runFavoriteEatsCatalogReferenceRefresh();
    }
  }, 320);
}

async function runFavoriteEatsCatalogReferenceRefresh() {
  if (document.body.classList.contains('recipe-editor-page')) {
    invalidateFavoriteEatsRecipeCatalogReadCaches();
  }
  const hooks = favoriteEatsCatalogReferenceUiRefreshHooks.slice();
  for (let i = 0; i < hooks.length; i += 1) {
    try {
      await hooks[i]();
    } catch (err) {
      console.warn('catalog reference UI refresh hook failed:', err);
    }
  }
  if (
    window.favoriteEatsCatalogCache &&
    typeof window.favoriteEatsCatalogCache.clearItemsCache === 'function'
  ) {
    void window.favoriteEatsCatalogCache.clearItemsCache();
  }
  if (
    window.favoriteEatsCatalogCache &&
    typeof window.favoriteEatsCatalogCache.clearRecipesListCache === 'function'
  ) {
    window.favoriteEatsCatalogCache.clearRecipesListCache();
  }
  if (
    isFavoriteEatsRemoteShoppingAuthorityEstablished() &&
    shouldUseRemoteShoppingState()
  ) {
    scheduleFavoriteEatsRemoteShoppingPlanHydrate({
      force: true,
      source: 'catalog reference refresh',
    });
  }
}

function ensureFavoriteEatsCatalogReferenceRealtimeSubscription() {
  if (!favoriteEatsShouldUseSupabaseDataDoor()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeCatalogReferenceChanges !== 'function'
  ) {
    return;
  }
  if (favoriteEatsCatalogReferenceRealtimeUnsub) return;
  try {
    window.dataService.useSupabase = true;
    favoriteEatsCatalogReferenceRealtimeUnsub =
      window.dataService.subscribeCatalogReferenceChanges({
        onChange: (payload) => {
          scheduleFavoriteEatsCatalogReferenceRefresh(payload);
        },
      });
  } catch (err) {
    console.warn('subscribeCatalogReferenceChanges failed:', err);
    favoriteEatsCatalogReferenceRealtimeUnsub = null;
  }
}

function ensureFavoriteEatsRecipeCatalogCompositionSubscription() {
  if (!favoriteEatsShouldUseSupabaseDataDoor()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeRecipeCatalogChanges !== 'function'
  ) {
    return;
  }
  if (favoriteEatsRecipeCatalogCompositionUnsub) return;
  try {
    window.dataService.useSupabase = true;
    favoriteEatsRecipeCatalogCompositionUnsub =
      window.dataService.subscribeRecipeCatalogChanges({
        channelKey: 'composition',
        onChange: () => {
          if (
            window.favoriteEatsRecipeCompositionSync &&
            typeof window.favoriteEatsRecipeCompositionSync
              .scheduleFavoriteEatsCatalogCompositionRefresh === 'function'
          ) {
            window.favoriteEatsRecipeCompositionSync.scheduleFavoriteEatsCatalogCompositionRefresh(
              { source: 'catalog recipes realtime' },
            );
          }
        },
      });
  } catch (err) {
    console.warn('subscribeRecipeCatalogChanges (composition) failed:', err);
    favoriteEatsRecipeCatalogCompositionUnsub = null;
  }
}

function ensureFavoriteEatsShoppingPlanRealtimeSubscription() {
  if (!shouldUseRemoteShoppingState()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribePlanChanges !== 'function'
  ) {
    return;
  }
  if (favoriteEatsShoppingPlanRealtimeUnsub) return;
  try {
    window.dataService.useSupabase = true;
    favoriteEatsShoppingPlanRealtimeUnsub =
      window.dataService.subscribePlanChanges({
        onChange: (payload) => {
          if (
            payload &&
            String(payload.schema || '') === 'plan' &&
            String(payload.table || '') === 'selected_recipe_roots'
          ) {
            try {
              applyFavoriteEatsPlanSelectedRecipeRootRealtimePatch(payload);
              scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly(
                'plan.selected_recipe_roots child patch',
              );
            } catch (err) {
              console.warn(
                'Remote shopping plan selected recipe root patch failed:',
                err,
              );
            }
            return;
          }
          if (
            payload &&
            String(payload.schema || '') === 'plan' &&
            String(payload.table || '') === 'selected_recipes'
          ) {
            try {
              applyFavoriteEatsPlanSelectedRecipeRealtimePatch(payload);
              scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly(
                'plan.selected_recipes child patch',
              );
            } catch (err) {
              console.warn(
                'Remote shopping plan selected recipe patch failed:',
                err,
              );
            }
            return;
          }
          if (
            payload &&
            String(payload.schema || '') === 'plan' &&
            String(payload.table || '') === 'selected_items'
          ) {
            try {
              applyFavoriteEatsPlanSelectedItemRealtimePatch(payload);
              scheduleFavoriteEatsRemotePlanUiRefreshHooksOnly(
                'plan.selected_items child patch',
              );
            } catch (err) {
              console.warn('Remote shopping plan selected item patch failed:', err);
            }
            return;
          }
          if (
            payload &&
            String(payload.schema || '') === 'plan' &&
            String(payload.table || '') === 'store_preferences'
          ) {
            logFavoriteEatsItemsQuantitySync('companion event absorbed', {
              table: 'store_preferences',
              updated_at: payload?.new?.updated_at || null,
              absorbed: true,
            });
            return;
          }
          if (
            payload &&
            String(payload.schema || '') === 'plan' &&
            String(payload.table || '') === 'documents'
          ) {
            try {
              if (window.favoriteEatsInputSyncDebugToConsole === true) {
                console.info(
                  '[favorite-eats-items-quantity-stepper]',
                  'parent event absorbed',
                  {
                    table: 'documents',
                    updated_at: payload?.new?.updated_at || null,
                    absorbed: true,
                  },
                );
              }
            } catch (_) {}
            return;
          }
          // Per-row patch hooks run first (mirrors list path). If any hook
          // claims the payload, skip the wholesale `load_shopping_state`
          // refetch entirely. This is the surgery the original input-sync
          // roadmap called for and the current Charter quietly walked back.
          void (async () => {
            const patched = await runFavoriteEatsRemotePlanPatchHooks(payload);
            if (!patched) {
              scheduleFavoriteEatsRemoteShoppingPlanHydrate({
                force: true,
                source: `plan realtime fallback:${payload?.schema || ''}.${payload?.table || ''}`,
              });
            }
          })();
        },
      });
  } catch (err) {
    console.warn('subscribePlanChanges failed:', err);
    favoriteEatsShoppingPlanRealtimeUnsub = null;
  }
}

function ensureFavoriteEatsShoppingListRealtimeSubscription() {
  if (!shouldUseRemoteShoppingState()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeListChanges !== 'function'
  ) {
    return;
  }
  if (favoriteEatsShoppingListRealtimeUnsub) return;
  try {
    window.dataService.useSupabase = true;
    favoriteEatsShoppingListRealtimeUnsub =
      window.dataService.subscribeListChanges({
        onChange: (payload) => {
          if (
            payload &&
            String(payload.schema || '') === 'list' &&
            String(payload.table || '') === 'sessions'
          ) {
            try {
              if (window.favoriteEatsInputSyncDebugToConsole === true) {
                console.info(
                  '[favorite-eats-shopping-list-checkbox]',
                  'parent event absorbed',
                  {
                    table: 'sessions',
                    updated_at: payload?.new?.updated_at || null,
                    absorbed: true,
                  },
                );
              }
            } catch (_) {}
            return;
          }
          void (async () => {
            const patched = await runFavoriteEatsRemoteListPatchHooks(payload);
            if (!patched) {
              scheduleFavoriteEatsRemoteListRefresh(
                `list realtime fallback:${payload?.schema || ''}.${payload?.table || ''}`,
              );
            }
          })();
        },
      });
  } catch (err) {
    console.warn('subscribeListChanges failed:', err);
    favoriteEatsShoppingListRealtimeUnsub = null;
  }
}

function installFavoriteEatsShoppingVisibilityRefetch() {
  if (favoriteEatsShoppingVisibilityRefetchInstalled) return;
  favoriteEatsShoppingVisibilityRefetchInstalled = true;
  let lastHiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
      return;
    }
    if (!shouldUseRemoteShoppingState()) return;
    if (!lastHiddenAt) return;
    const awayMs = Date.now() - lastHiddenAt;
    if (awayMs < 4_000) return;
    scheduleFavoriteEatsRemoteShoppingPlanHydrate({
      source: 'visibility refetch',
    });
  });
}

/** After history navigation, in-memory plan/list can be stale — not only for bfcache (`persisted`). */
function installFavoriteEatsShoppingBackForwardCacheRefetch() {
  if (favoriteEatsShoppingPageshowRefetchInstalled) return;
  favoriteEatsShoppingPageshowRefetchInstalled = true;
  window.addEventListener('pageshow', (event) => {
    if (!shouldUseRemoteShoppingState()) return;
    let navType = '';
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && typeof nav.type === 'string') navType = nav.type;
    } catch (_) {}
    const fromHistory = event.persisted === true || navType === 'back_forward';
    if (!fromHistory) return;
    void runFavoriteEatsRemoteShoppingPlanRefresh({
      force: true,
      source: 'back-forward cache refetch',
    });
  });
}

function ensureFavoriteEatsAppActivityPresenceSubscription() {
  if (!favoriteEatsShouldUseSupabaseDataDoor()) return;
  if (
    !window.dataService ||
    typeof window.dataService.subscribeAppActivityPresence !== 'function'
  ) {
    return;
  }
  if (favoriteEatsAppActivityPresenceUnsub) return;
  const listA = window.NAME_DECK_LIST_A;
  const listB = window.NAME_DECK_LIST_B;
  const info =
    Array.isArray(listA) &&
    Array.isArray(listB) &&
    window.recipePresenceMoniker &&
    typeof window.recipePresenceMoniker.getOrCreateMoniker === 'function'
      ? window.recipePresenceMoniker.getOrCreateMoniker(
          listA,
          listB,
          typeof window.recipePresenceMoniker.getMonikerStorage === 'function'
            ? window.recipePresenceMoniker.getMonikerStorage()
            : null,
        )
      : { moniker: 'Doctor Incognito' };
  const myMoniker = String(info?.moniker || '').trim() || 'Doctor Incognito';
  const myKey = favoriteEatsGetAppActivityPresenceKey();
  const myLoginSessionId = favoriteEatsGetLoginSessionId();
  /** Tracks remote presence keys seen on the last sync (logout/leave is not a toast trigger). */
  let prevAppActivityOtherPresenceKeys = new Set();
  try {
    window.dataService.useSupabase = true;
    favoriteEatsAppActivityPresenceUnsub =
      window.dataService.subscribeAppActivityPresence({
        presenceKey: myKey,
        loginSessionId: myLoginSessionId,
        moniker: myMoniker,
        onState: (rawState) => {
          const keys = Object.keys(rawState || {});
          const sortedOtherKeys = keys
            .filter(
              (k) =>
                k &&
                k !== myKey &&
                Array.isArray(rawState[k]) &&
                rawState[k].length > 0,
            )
            .sort();

          const otherMonikers = [];
          for (let i = 0; i < sortedOtherKeys.length; i += 1) {
            const ok = sortedOtherKeys[i];
            const oa = Array.isArray(rawState[ok]) ? rawState[ok] : [];
            if (oa.length === 0) continue;
            let label = '';
            for (let j = 0; j < oa.length; j += 1) {
              const m = String(oa[j]?.moniker || '').trim();
              if (m) {
                label = m;
                break;
              }
            }
            if (!label) label = 'Someone else';
            otherMonikers.push(label);
          }

          const hasOthers = otherMonikers.length > 0;
          try {
            window.favoriteEatsAppActivityHasOthers = hasOthers;
            window.favoriteEatsAppActivitySelfMoniker = myMoniker;
            window.favoriteEatsAppActivityOtherMonikers = otherMonikers;
            window.dispatchEvent(
              new CustomEvent('favoriteEatsAppActivityOthers', {
                detail: { hasOthers, otherMonikers, selfMoniker: myMoniker },
              }),
            );
          } catch (_) {}

          const joinDetected = sortedOtherKeys.some(
            (k) => !prevAppActivityOtherPresenceKeys.has(k),
          );

          prevAppActivityOtherPresenceKeys = new Set(sortedOtherKeys);

          if (!joinDetected || otherMonikers.length === 0) {
            return;
          }

          const sorted = otherMonikers
            .slice()
            .sort((a, b) => String(a).localeCompare(String(b)));
          favoriteEatsMaybeToastCrossSessionMoniker(
            sorted[0],
            Math.max(0, sorted.length - 1),
          );
        },
      });
  } catch (err) {
    console.warn('subscribeAppActivityPresence failed:', err);
    favoriteEatsAppActivityPresenceUnsub = null;
  }
}

/** Parse plan JSON from localStorage without touching `shoppingPlanCache` (remote legacy bridge). */
function peekShoppingPlanFromLocalStorageCache() {
  try {
    const raw = localStorage.getItem(resolveShoppingPlanStorageKey());
    if (!raw) return null;
    return normalizeShoppingPlan(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function peekShoppingPlanSessionMirror() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(resolveShoppingPlanSessionMirrorKey());
    if (!raw) return null;
    return normalizeShoppingPlan(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function persistShoppingPlanSessionMirror(planNormalized) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(
      resolveShoppingPlanSessionMirrorKey(),
      JSON.stringify(planNormalized),
    );
  } catch (_) {}
}

/**
 * Prefer localStorage snapshot, then same-tab session mirror (covers quota-blocked LS).
 * Used by Supabase legacy bridge only — does not assign `shoppingPlanCache`.
 */
function peekShoppingPlanForLegacyBridge() {
  const fromLs = peekShoppingPlanFromLocalStorageCache();
  if (fromLs && shoppingPlanHasSelections(fromLs)) return fromLs;
  const fromSession = peekShoppingPlanSessionMirror();
  if (fromSession && shoppingPlanHasSelections(fromSession)) return fromSession;
  return null;
}

function loadShoppingPlanFromStorage() {
  if (shoppingPlanCache != null) return shoppingPlanCache;
  if (shouldUseRemoteShoppingState()) {
    // Remote mode: localStorage is cache only — seed an empty plan until hydrate
    // or legacy bridge assigns shoppingPlanCache from server/local bridge.
    shoppingPlanCache = createEmptyShoppingPlan();
    return shoppingPlanCache;
  }
  try {
    const raw = localStorage.getItem(resolveShoppingPlanStorageKey());
    if (!raw) {
      const mirror = peekShoppingPlanSessionMirror();
      if (mirror) {
        shoppingPlanCache = normalizeShoppingPlan(mirror);
        try {
          materializeShoppingPlanRecipeSelectionsFromRoots(
            shoppingPlanCache,
            window.dbInstance,
          );
        } catch (err) {
          console.warn(
            'materializeShoppingPlanRecipeSelectionsFromRoots (mirror, empty LS) failed:',
            err,
          );
        }
        return shoppingPlanCache;
      }
      shoppingPlanCache = createEmptyShoppingPlan();
      return shoppingPlanCache;
    }
    shoppingPlanCache = normalizeShoppingPlan(JSON.parse(raw));
    try {
      materializeShoppingPlanRecipeSelectionsFromRoots(
        shoppingPlanCache,
        window.dbInstance,
      );
    } catch (err) {
      console.warn(
        'materializeShoppingPlanRecipeSelectionsFromRoots (load) failed:',
        err,
      );
    }
    return shoppingPlanCache;
  } catch (_) {
    const mirror = peekShoppingPlanSessionMirror();
    if (mirror) {
      shoppingPlanCache = normalizeShoppingPlan(mirror);
      try {
        materializeShoppingPlanRecipeSelectionsFromRoots(
          shoppingPlanCache,
          window.dbInstance,
        );
      } catch (err) {
        console.warn(
          'materializeShoppingPlanRecipeSelectionsFromRoots (mirror) failed:',
          err,
        );
      }
      return shoppingPlanCache;
    }
    shoppingPlanCache = createEmptyShoppingPlan();
    return shoppingPlanCache;
  }
}

function persistShoppingPlan(plan, options = {}) {
  const normalized = normalizeShoppingPlan(plan);
  const skipRemoteSave = !!options.skipRemoteSave;
  const prevNormalized =
    shoppingPlanCache != null ? normalizeShoppingPlan(shoppingPlanCache) : null;
  const preMaterializeUnchanged =
    prevNormalized != null &&
    JSON.stringify(prevNormalized) === JSON.stringify(normalized);
  try {
    materializeShoppingPlanRecipeSelectionsFromRoots(
      normalized,
      window.dbInstance,
    );
  } catch (err) {
    console.warn('materializeShoppingPlanRecipeSelectionsFromRoots failed:', err);
  }
  const allowEmptyPlanRemoteSave =
    !!options.allowEmptyPlanRemoteSave ||
    (!!options.forceRemoteSave &&
      shouldUseRemoteShoppingState() &&
      !shoppingPlanHasContentSelections(normalized));
  const skipDuplicateRemotePlanSave =
    !skipRemoteSave &&
    shouldUseRemoteShoppingState() &&
    preMaterializeUnchanged &&
    !options.forceRemoteSave;
  shoppingPlanCache = normalized;
  try {
    localStorage.setItem(resolveShoppingPlanStorageKey(), JSON.stringify(normalized));
  } catch (_) {}
  persistShoppingPlanSessionMirror(normalized);
  if (skipRemoteSave && shouldUseRemoteShoppingState()) {
    patchFavoriteEatsStorePlanFromMainCache(normalized);
  }
  if (!skipRemoteSave && !skipDuplicateRemotePlanSave) {
    const remoteSaveOptions = allowEmptyPlanRemoteSave
      ? { allowEmptyPlanRemoteSave: true }
      : {};
    if (shoppingPlanMutationBatchDepth > 0) {
      shoppingPlanMutationBatchDeferredSave = true;
      if (allowEmptyPlanRemoteSave) {
        shoppingPlanMutationBatchAllowEmptyRemoteSave = true;
      }
    } else {
      queueSaveShoppingStateToDataService({ plan: normalized }, remoteSaveOptions);
    }
  }
  try {
    window.favoriteEatsPlanSession?.syncShoppingListPlanSessionSaveButtonState?.();
  } catch (_) {}
  return normalized;
}

function getShoppingPlan() {
  return loadShoppingPlanFromStorage();
}

function updateShoppingPlan(mutator, options = {}) {
  const current = getShoppingPlan();
  let draft;
  try {
    draft = JSON.parse(JSON.stringify(current));
  } catch (_) {
    draft = createEmptyShoppingPlan();
  }
  if (typeof mutator === 'function') mutator(draft);
  return persistShoppingPlan(draft, options);
}

function getShoppingPlanStoreOrder() {
  return normalizeShoppingPlanStoreOrder(getShoppingPlan()?.storeOrder);
}

function setShoppingPlanStoreOrder(storeIds) {
  const normalizedStoreOrder = normalizeShoppingPlanStoreOrder(storeIds);
  return updateShoppingPlan((plan) => {
    plan.storeOrder = normalizedStoreOrder;
  });
}

function getShoppingPlanSelectedStoreIds() {
  return normalizeShoppingPlanSelectedStoreIds(
    getShoppingPlan()?.selectedStoreIds,
  );
}

function setShoppingPlanSelectedStoreIds(storeIds) {
  const normalizedSelectedStoreIds =
    normalizeShoppingPlanSelectedStoreIds(storeIds);
  return updateShoppingPlan((plan) => {
    plan.selectedStoreIds = normalizedSelectedStoreIds;
  });
}

if (typeof window !== 'undefined') {
  window.__shoppingPlanHelpers = {
    normalizeShoppingPlanStoreIdList,
    normalizeShoppingPlanStoreOrder,
    normalizeShoppingPlanSelectedStoreIds,
    createEmptyShoppingPlan,
    normalizeShoppingPlan,
    loadShoppingPlanFromStorage,
    persistShoppingPlan,
    getShoppingPlan,
    updateShoppingPlan,
    getShoppingPlanStoreOrder,
    setShoppingPlanStoreOrder,
    getShoppingPlanSelectedStoreIds,
    setShoppingPlanSelectedStoreIds,
  };
  if (!window.__favoriteEatsPlanServingsMirrorWired) {
    window.__favoriteEatsPlanServingsMirrorWired = true;
    const servingsEvt =
      window.favoriteEatsEventNames?.recipePlannerServingsChanged;
    if (servingsEvt) {
      window.addEventListener(servingsEvt, (ev) => {
        try {
          syncPlanRecipeServingsWithWebServingsEventDetail(ev?.detail);
        } catch (err) {
          console.warn(
            'syncPlanRecipeServingsWithWebServingsEventDetail failed:',
            err,
          );
        }
      });
    }
    // Charter §H boot replay: construct the queue eagerly so any pending
    // servings ops left in the durable ring from a prior session are
    // replayed through the narrow RPC before any new user input lands.
    const queue = getFavoriteEatsPlanRecipeServingsQueue();
    getFavoriteEatsPlanRecipeRootQuantityQueue();
    if (queue && typeof queue.drainDurable === 'function') {
      void (async function drainPlanRecipeServingsDurable() {
        const ops = queue.drainDurable();
        if (!Array.isArray(ops) || ops.length === 0) return;
        if (!shouldUseRemoteShoppingState()) return;
        if (
          !window.dataService ||
          typeof window.dataService.setPlanRecipeServingsOverride !== 'function'
        ) {
          return;
        }
        for (const op of ops) {
          if (
            !op ||
            op.surface !== 'plan' ||
            op.field !== 'servingsOverride'
          ) {
            continue;
          }
          const rid = Number(op.entityKey);
          if (!Number.isFinite(rid) || rid <= 0) continue;
          try {
            const result = await sendPlanRecipeServingsOverrideRpc(op);
            const updatedAt =
              result && typeof result === 'object'
                ? result.updated_at || result.updatedAt || null
                : null;
            if (
              updatedAt &&
              typeof queue.recordEchoApplied === 'function'
            ) {
              queue.recordEchoApplied(
                {
                  surface: 'plan',
                  entityKey: String(Math.trunc(rid)),
                  field: 'servingsOverride',
                },
                { updated_at: updatedAt, value: op.value },
              );
            }
          } catch (err) {
            console.warn(
              'plan recipe servings durable replay failed:',
              err,
            );
          }
        }
      })();
    }
    const rootQueue = getFavoriteEatsPlanRecipeRootQuantityQueue();
    if (rootQueue && typeof rootQueue.drainDurable === 'function') {
      void (async function drainPlanRecipeRootQuantityDurable() {
        const ops = rootQueue.drainDurable();
        if (!Array.isArray(ops) || ops.length === 0) return;
        if (!shouldUseRemoteShoppingState()) return;
        if (
          !window.dataService ||
          typeof window.dataService.setPlanRecipeQuantity !== 'function'
        ) {
          return;
        }
        for (const op of ops) {
          if (
            !op ||
            op.surface !== 'plan' ||
            op.field !== 'recipeRootQuantity'
          ) {
            continue;
          }
          const rid = Number(op.entityKey);
          if (!Number.isFinite(rid) || rid <= 0) continue;
          try {
            const result = await sendPlanRecipeRootQuantityRpc(op);
            const updatedAt =
              result && typeof result === 'object'
                ? result.updated_at || result.updatedAt || null
                : null;
            if (
              updatedAt &&
              typeof rootQueue.recordEchoApplied === 'function'
            ) {
              rootQueue.recordEchoApplied(
                {
                  surface: 'plan',
                  entityKey: String(Math.trunc(rid)),
                  field: 'recipeRootQuantity',
                },
                { updated_at: updatedAt, value: op.value },
              );
            }
          } catch (err) {
            console.warn(
              'plan recipe root quantity durable replay failed:',
              err,
            );
          }
        }
      })();
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', () => {
        const activeServingsQueue = getFavoriteEatsPlanRecipeServingsQueue();
        if (activeServingsQueue && typeof activeServingsQueue.flushAll === 'function') {
          try {
            void activeServingsQueue.flushAll();
          } catch (_) {}
        }
        const activeRootQueue = getFavoriteEatsPlanRecipeRootQuantityQueue();
        if (activeRootQueue && typeof activeRootQueue.flushAll === 'function') {
          try {
            void activeRootQueue.flushAll();
          } catch (_) {}
        }
      });
    }
  }
}
// --- End shopping plan helpers ---

function normalizeShoppingIngredientNameKey(rawName) {
  return String(rawName || '')
    .trim()
    .toLowerCase();
}

function normalizeShoppingMigrationVariantRow(raw) {
  const row = raw && typeof raw === 'object' ? raw : { value: raw };
  const value = normalizeNamedIngredientVariant(
    String(row.value != null ? row.value : raw || ''),
  ).trim();
  const variantId = Number(row.variantId);
  return {
    value,
    lower: value.toLowerCase(),
    variantId: Number.isFinite(variantId) && variantId > 0 ? variantId : null,
  };
}

function getShoppingMigrationVariantRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeShoppingMigrationVariantRow)
    .filter((row) => row.value);
}

function inferShoppingVariantRenames({
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
}) {
  const prevRows = getShoppingMigrationVariantRows(
    Array.isArray(prevNamedRows) ? prevNamedRows : prevNamedValues,
  );
  const nextRows = getShoppingMigrationVariantRows(
    Array.isArray(nextNamedRows) ? nextNamedRows : nextNamedValues,
  );
  const renames = [];
  const seenFrom = new Set();
  const nextByVariantId = new Map();
  nextRows.forEach((row) => {
    if (row.variantId) nextByVariantId.set(row.variantId, row);
  });

  prevRows.forEach((prevRow) => {
    if (!prevRow.variantId || seenFrom.has(prevRow.lower)) return;
    const nextRow = nextByVariantId.get(prevRow.variantId);
    if (!nextRow || !nextRow.lower || nextRow.lower === prevRow.lower) return;
    renames.push({
      from: prevRow.value,
      to: nextRow.value,
      fromVariantId: prevRow.variantId,
    });
    seenFrom.add(prevRow.lower);
  });

  const prevLow = new Set(prevRows.map((row) => row.lower));
  const nextLow = new Set(nextRows.map((row) => row.lower));
  const removed = prevRows.filter((row) => !nextLow.has(row.lower));
  const added = nextRows.filter((row) => !prevLow.has(row.lower));
  if (removed.length > 0 && removed.length === added.length) {
    removed.forEach((prevRow, index) => {
      if (seenFrom.has(prevRow.lower)) return;
      const nextRow = added[index];
      if (!nextRow) return;
      renames.push({
        from: prevRow.value,
        to: nextRow.value,
        fromVariantId: prevRow.variantId || null,
      });
      seenFrom.add(prevRow.lower);
    });
  }

  return renames;
}

function computePostRenameVariantLower(variantLower, variantRenames) {
  let v = String(variantLower || '')
    .trim()
    .toLowerCase();
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  const ren = Array.isArray(variantRenames) ? variantRenames : [];
  for (let i = 0; i < ren.length; i += 1) {
    const from = String(ren[i]?.from || '')
      .trim()
      .toLowerCase();
    if (from && v === from) {
      v = String(ren[i]?.to || '')
        .trim()
        .toLowerCase();
      break;
    }
  }
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  return v;
}

function newShoppingItemSelectionKey(newBase, variantLower, variantRenames) {
  const SEP = SHOPPING_PLAN_KEY_SEP;
  const vout = computePostRenameVariantLower(variantLower, variantRenames);
  if (!vout) return newBase;
  return `${newBase}${SEP}${vout}`;
}

function resolveVariantDisplayForSelection(
  variantLower,
  variantRenames,
  displayLookup,
) {
  const v = String(variantLower || '')
    .trim()
    .toLowerCase();
  if (!v || v === INGREDIENT_BASE_VARIANT_NAME) return '';
  if (displayLookup instanceof Map && displayLookup.has(v))
    return displayLookup.get(v);
  const ren = Array.isArray(variantRenames) ? variantRenames : [];
  for (let i = 0; i < ren.length; i += 1) {
    const to = String(ren[i]?.to || '').trim();
    if (to && to.toLowerCase() === v) return to;
  }
  return v;
}

async function collectShoppingPlanEntriesToRewriteForIngredientIdentity({
  db,
  oldDisplayName,
  newDisplayName,
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
  hasVariantTable,
}) {
  const oldName = String(oldDisplayName || '').trim();
  const newName = String(newDisplayName || '').trim();
  const oldBase = normalizeShoppingIngredientNameKey(oldName);
  const newBase = normalizeShoppingIngredientNameKey(newName);
  if (!oldBase) return null;

  const variantRenames = hasVariantTable
    ? inferShoppingVariantRenames({
        prevNamedValues,
        nextNamedValues,
        prevNamedRows,
        nextNamedRows,
      })
    : [];
  const nextRows = getShoppingMigrationVariantRows(
    Array.isArray(nextNamedRows) ? nextNamedRows : nextNamedValues,
  );
  const nextByDraftVariantId = new Map();
  const nextByLower = new Map();
  nextRows.forEach((row) => {
    if (row.variantId) nextByDraftVariantId.set(row.variantId, row);
    if (row.lower && !nextByLower.has(row.lower))
      nextByLower.set(row.lower, row);
  });
  const renameByFromLower = new Map();
  variantRenames.forEach((row) => {
    const fromLower = String(row?.from || '')
      .trim()
      .toLowerCase();
    const toLower = String(row?.to || '')
      .trim()
      .toLowerCase();
    if (fromLower && toLower) renameByFromLower.set(fromLower, toLower);
  });

  const displayLookup = new Map();
  nextRows.forEach((row) => {
    if (!row.value) return;
    displayLookup.set(row.lower, row.value);
  });

  const sel = getShoppingPlanItemSelections();
  const extract = [];
  for (const oldKey of Object.keys(sel)) {
    if (!oldKey) continue;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') continue;
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || Math.abs(quantity) < 1e-9) continue;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      const entryBase = normalizeShoppingIngredientNameKey(entry.name);
      if (entryBase && entryBase !== oldBase) continue;
      const entryVariantLower = normalizeNamedIngredientVariant(
        String(entry.variantName || ''),
      )
        .trim()
        .toLowerCase();
      const nextFromId = nextByDraftVariantId.get(idFromKey);
      const nextRow =
        nextFromId ||
        (entryVariantLower ? nextByLower.get(entryVariantLower) : null);
      const fallbackVariantLower = entryVariantLower
        ? computePostRenameVariantLower(entryVariantLower, variantRenames)
        : '';
      const isBaseVariantSelection =
        !entryVariantLower ||
        entryVariantLower === INGREDIENT_BASE_VARIANT_NAME;
      const nextVariantLower =
        (nextRow && nextRow.lower) || fallbackVariantLower;
      if (!nextVariantLower && !isBaseVariantSelection) continue;
      const nextVariantDisplay = nextVariantLower
        ? displayLookup.get(nextVariantLower) ||
          (nextRow && nextRow.value) ||
          resolveVariantDisplayForSelection(
            nextVariantLower,
            variantRenames,
            displayLookup,
          )
        : '';
      const newKey = await resolvePersistedShoppingItemKeyUnified(
        db,
        newName || oldName,
        nextVariantDisplay,
      );
      if (!newKey) continue;
      const oldStoredName = String(entry.name || '').trim();
      const oldStoredVariant = String(entry.variantName || '').trim();
      if (
        newKey === oldKey &&
        oldStoredName === (newName || oldName) &&
        oldStoredVariant === nextVariantDisplay
      ) {
        continue;
      }
      extract.push({
        oldKey,
        newKey,
        name: newName || oldName,
        variantName: nextVariantDisplay,
      });
      continue;
    }

    const variantFromBase = getShoppingPlanVariantSuffixAfterBase(
      oldBase,
      oldKey,
    );
    if (variantFromBase === null) continue;

    let vLower = variantFromBase;
    const mappedLower =
      renameByFromLower.get(vLower) ||
      computePostRenameVariantLower(vLower, variantRenames);
    const vForDisplayLower = computePostRenameVariantLower(
      vLower,
      variantRenames,
    );
    const variantDisp = resolveVariantDisplayForSelection(
      vForDisplayLower,
      variantRenames,
      displayLookup,
    );
    const newKey =
      hasVariantTable && mappedLower
        ? await resolvePersistedShoppingItemKeyUnified(db, newName, variantDisp)
        : newShoppingItemSelectionKey(newBase, vLower, variantRenames);
    if (!newKey) continue;
    extract.push({
      oldKey,
      newKey,
      name: newName,
      variantName: variantDisp,
    });
  }

  return {
    oldBase,
    newBase,
    variantRenames,
    newName,
    extract,
  };
}

/** Parse aggregate / legacy shopping plan selection keys into base + variant parts. */
function parseShoppingPlanItemSelectionKeyForReconcile(key) {
  const k = String(key || '');
  const idx = findShoppingPlanAggregateSeparatorIndex(k);
  if (idx < 0) {
    return { baseLower: k.trim().toLowerCase(), variantPartLower: '' };
  }
  return {
    baseLower: k.slice(0, idx).trim().toLowerCase(),
    variantPartLower: k
      .slice(idx + 1)
      .trim()
      .toLowerCase(),
  };
}

async function patchShoppingListDocForRewrittenSelectionKeysAsync({
  extract,
  db = null,
  skipRemoteSave = false,
} = {}) {
  if (!Array.isArray(extract) || !extract.length) return;
  const rewrite = new Map(extract.map((e) => [e.oldKey, e]));
  const rawDoc = getAuthoritativeShoppingListDoc();
  if (!rawDoc || !Array.isArray(rawDoc.rows) || !rawDoc.rows.length) return;

  const useDataDoor =
    favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
  const sqliteDb = db || window.dbInstance;
  let planRows;
  if (!useDataDoor && sqliteDb && typeof sqliteDb.exec === 'function') {
    planRows = getShoppingPlanSelectionRows({ db: sqliteDb });
  } else {
    planRows = await getShoppingPlanSelectionRowsViaDataService({
      db: sqliteDb,
    });
  }
  const genDoc = buildShoppingListDocFromPlanRows(planRows);
  const genByKey = new Map();
  genDoc.rows.forEach((row) => {
    const sk = String(row.sourceKey || '').trim();
    if (sk) genByKey.set(sk, row);
  });

  let changed = false;
  const nextRows = rawDoc.rows.map((rawRow) => {
    const row = normalizeShoppingListDocRow(rawRow, 0);
    if (!row) return rawRow;
    const sk = String(row.sourceKey || '').trim();
    if (!sk || !rewrite.has(sk)) return rawRow;
    const spec = rewrite.get(sk);
    const newSk = spec.newKey;
    const gen = genByKey.get(newSk);
    const next = { ...rawRow, sourceKey: newSk };
    if (newSk !== sk) changed = true;
    if (!row.userEdited && gen) {
      const t = String(gen.text || gen.label || '').trim();
      if (t) {
        if (String(rawRow.text || '').trim() !== t) changed = true;
        next.text = t;
        next.sourceText = t;
      }
    } else if (newSk !== sk) {
      changed = true;
    }
    return next;
  });

  if (changed) {
    persistShoppingListDoc(normalizeShoppingListDoc({ rows: nextRows }), {
      skipRemoteSave,
    });
  }
}

async function persistShoppingIdentityKeyRewritesToDataService(extract) {
  if (!Array.isArray(extract) || !extract.length || !shouldUseRemoteShoppingState()) {
    return;
  }
  try {
    window.dataService.useSupabase = true;
  } catch (_) {}
  const rewrites = extract.map((row) => {
    const ingredientVariantId = parseIngredientVariantIdFromShoppingPlanKey(
      row.newKey,
    );
    const out = {
      oldKey: row.oldKey,
      newKey: row.newKey,
      name: row.name,
      variantName: row.variantName,
    };
    if (ingredientVariantId) out.ingredientVariantId = ingredientVariantId;
    return out;
  });
  const keyMap = Object.fromEntries(
    extract.map((row) => [row.oldKey, row.newKey]),
  );
  let planEcho = null;
  let listEcho = null;
  if (typeof window.dataService.rewritePlanItemKeys === 'function') {
    planEcho = await window.dataService.rewritePlanItemKeys({ rewrites });
  }
  if (typeof window.dataService.patchShoppingListSourceKeys === 'function') {
    listEcho = await window.dataService.patchShoppingListSourceKeys({ keyMap });
  }
  const echo = {};
  if (planEcho && typeof planEcho === 'object') {
    if (planEcho.planUpdatedAt != null) {
      echo.planUpdatedAt = String(planEcho.planUpdatedAt);
    }
    if (planEcho.planVersion != null) {
      echo.planVersion = Number(planEcho.planVersion);
    }
  }
  if (listEcho && typeof listEcho === 'object' && listEcho.listSessionUpdatedAt != null) {
    echo.listSessionUpdatedAt = String(listEcho.listSessionUpdatedAt);
  }
  if (Object.keys(echo).length) {
    try {
      applyShoppingStateEchoFromSaveResponse(echo);
    } catch (err) {
      console.warn('applyShoppingStateEchoFromSaveResponse (identity rewrite) failed:', err);
    }
    void favoriteEatsStoreApplyRemoteFromSaveEcho(echo);
  }
}

function shoppingPlanPersistOptionsFromMaintain(options = {}) {
  return options.skipRemotePlanSave ? { skipRemoteSave: true } : {};
}

async function reconcileShoppingPlanItemSelectionKeysWithDataService(
  planPersistOptions = {},
) {
  if (
    !favoriteEatsShouldUseSupabaseDataDoor() ||
    !window.dataService ||
    typeof window.dataService.resolveCanonicalIngredientForShoppingReconcile !==
      'function' ||
    typeof window.dataService.listIngredientVariantsWithIngredientsByIds !==
      'function' ||
    typeof window.dataService.listIngredientVariantsByIngredientIds !==
      'function'
  ) {
    return;
  }
  window.dataService.useSupabase = true;
  const ds = window.dataService;
  const staleAggregateResolve =
    typeof ds.resolveIngredientForStaleShoppingAggregateKey === 'function'
      ? ds.resolveIngredientForStaleShoppingAggregateKey.bind(ds)
      : null;

  const sel = getShoppingPlanItemSelections();
  const sourceKeys = Object.keys(sel);
  if (!sourceKeys.length) return;

  const extract = [];
  const metaUpdates = new Map();
  const toRemove = [];

  const queueMeta = (k, name, variantName) => {
    if (!k) return;
    const nextName = String(name || '').trim();
    const nextVar = String(variantName || '').trim();
    const e = sel[k];
    if (!e || typeof e !== 'object') return;
    const sameName = String(e.name || '').trim() === nextName;
    const sameVar = String(e.variantName || '').trim() === nextVar;
    if (sameName && sameVar) return;
    metaUpdates.set(k, { name: nextName, variantName: nextVar });
  };

  const ivIdsNeeded = [];
  for (const oldKey of sourceKeys) {
    if (!oldKey) continue;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') continue;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) continue;
    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      ivIdsNeeded.push(Math.trunc(Number(idFromKey)));
      continue;
    }
    const storedIv = Math.trunc(Number(entry?.ingredientVariantId));
    if (Number.isFinite(storedIv) && storedIv > 0) {
      ivIdsNeeded.push(storedIv);
    }
  }

  const livRows = ivIdsNeeded.length
    ? await ds.listIngredientVariantsWithIngredientsByIds({
        variantIds: ivIdsNeeded,
      })
    : [];
  const livById = new Map(
    (Array.isArray(livRows) ? livRows : []).map((r) => [r.id, r]),
  );

  const baseLowerSet = new Set();
  for (const oldKey of sourceKeys) {
    if (!oldKey) continue;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') continue;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) continue;
    if (parseIngredientVariantIdFromShoppingPlanKey(oldKey)) continue;
    const { baseLower } = parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (baseLower) baseLowerSet.add(baseLower);
  }

  const canonByBaseLower = new Map();
  await Promise.all(
    [...baseLowerSet].map(async (bl) => {
      try {
        const row = await ds.resolveCanonicalIngredientForShoppingReconcile({
          baseLower: bl,
        });
        canonByBaseLower.set(bl, row || null);
      } catch (_) {
        canonByBaseLower.set(bl, null);
      }
    }),
  );

  const ingredientIdsForVariantLookup = new Set();
  for (const bl of baseLowerSet) {
    const row = canonByBaseLower.get(bl);
    if (row && row.id) ingredientIdsForVariantLookup.add(row.id);
  }

  let variantRowsAll =
    ingredientIdsForVariantLookup.size > 0
      ? await ds.listIngredientVariantsByIngredientIds({
          ingredientIds: [...ingredientIdsForVariantLookup],
        })
      : [];
  variantRowsAll = Array.isArray(variantRowsAll) ? variantRowsAll : [];

  const findVariantRow = (ingredientId, variantPartLower) => {
    const vpl = String(variantPartLower || '')
      .trim()
      .toLowerCase();
    if (!vpl) return null;
    const iid = Math.trunc(Number(ingredientId));
    return (
      variantRowsAll.find(
        (r) =>
          Math.trunc(Number(r.ingredient_id)) === iid &&
          String(r.variant || '')
            .trim()
            .toLowerCase() === vpl,
      ) || null
    );
  };

  const resolveVariantDisplay = (ingredientId, variantPartLower, entryVariantId = null) => {
    const vpl = String(variantPartLower || '')
      .trim()
      .toLowerCase();
    if (
      !vpl ||
      vpl === INGREDIENT_BASE_VARIANT_NAME ||
      vpl === 'base' ||
      vpl === 'any'
    ) {
      return '';
    }
    const iid = Math.trunc(Number(ingredientId));
    if (!Number.isFinite(iid) || iid <= 0) {
      return String(variantPartLower || '').trim();
    }
    const hit = findVariantRow(iid, variantPartLower);
    if (hit) return String(hit.variant || '').trim();
    const storedIv = intOrNull(entryVariantId);
    if (storedIv != null && storedIv > 0) {
      const byId =
        variantRowsAll.find(
          (r) =>
            Math.trunc(Number(r.id)) === storedIv &&
            Math.trunc(Number(r.ingredient_id)) === iid,
        ) || null;
      if (byId) return String(byId.variant || '').trim();
    }
    return String(variantPartLower || '').trim();
  };

  for (const oldKey of sourceKeys) {
    if (!oldKey) continue;
    const entry = sel[oldKey];
    if (!entry || typeof entry !== 'object') continue;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) continue;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      const liv = livById.get(Math.trunc(Number(idFromKey)));
      if (!liv) {
        toRemove.push(oldKey);
        continue;
      }
      const nextN = String(liv.ingredientName || '').trim();
      const nextV = String(liv.variant || '').trim();
      const e = sel[oldKey];
      if (e) {
        const sameName = String(e.name || '').trim() === nextN;
        const sameVar = String(e.variantName || '').trim() === nextV;
        if (!sameName || !sameVar) {
          queueMeta(oldKey, nextN, nextV);
        }
      }
      continue;
    }

    const storedIvMerge = Math.trunc(Number(entry?.ingredientVariantId));
    if (Number.isFinite(storedIvMerge) && storedIvMerge > 0) {
      const liv = livById.get(storedIvMerge);
      if (!liv) {
        toRemove.push(oldKey);
        continue;
      }
      const nextN = String(liv.ingredientName || '').trim();
      const nextV = String(liv.variant || '').trim();
      const preferKey = makeIngredientVariantShoppingPlanKey(storedIvMerge);
      if (oldKey !== preferKey) {
        extract.push({
          oldKey,
          newKey: preferKey,
          name: nextN,
          variantName: nextV,
        });
      } else {
        queueMeta(oldKey, nextN, nextV);
      }
      continue;
    }

    const { baseLower, variantPartLower } =
      parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (!baseLower) continue;

    let row = canonByBaseLower.get(baseLower);
    if (!row && !String(variantPartLower || '').trim()) {
      const nl = String(entry?.name || '')
        .trim()
        .toLowerCase();
      if (nl && nl !== baseLower) {
        if (!canonByBaseLower.has(nl)) {
          try {
            const r = await ds.resolveCanonicalIngredientForShoppingReconcile({
              baseLower: nl,
            });
            canonByBaseLower.set(nl, r || null);
          } catch (_) {
            canonByBaseLower.set(nl, null);
          }
        }
        row = canonByBaseLower.get(nl);
      }
    }
    if (!row && staleAggregateResolve) {
      try {
        row = await staleAggregateResolve({
          keyBaseLower: baseLower,
          variantPartLower,
          variantNeedle:
            String(entry?.variantName || '').trim() ||
            String(variantPartLower || '').trim(),
          entryNameLower: String(entry?.name || '')
            .trim()
            .toLowerCase(),
        });
        if (row && row.id) {
          const extra = await ds.listIngredientVariantsByIngredientIds({
            ingredientIds: [row.id],
          });
          const arr = Array.isArray(extra) ? extra : [];
          if (arr.length) {
            variantRowsAll = variantRowsAll.concat(arr);
          }
        }
      } catch (_) {
        row = null;
      }
    }
    if (!row) continue;

    const variantDisplay = resolveVariantDisplay(
      row.id,
      variantPartLower,
      entry?.ingredientVariantId,
    );
    const preferIdKey =
      String(variantPartLower || '').trim() &&
      !isIngredientBaseVariantName(variantPartLower) &&
      !isReservedIngredientVariantName(variantPartLower);
    let newKey;
    if (preferIdKey) {
      const vr = findVariantRow(row.id, String(variantPartLower || '').trim());
      const rid = vr ? Math.trunc(Number(vr.id)) : 0;
      if (Number.isFinite(rid) && rid > 0) {
        newKey = makeIngredientVariantShoppingPlanKey(rid);
      }
    }
    if (!newKey) {
      newKey = getShoppingPlanAggregateKey(row.name, variantDisplay);
    }
    if (!newKey) continue;

    if (newKey !== oldKey) {
      extract.push({
        oldKey,
        newKey,
        name: row.name,
        variantName: variantDisplay,
      });
    } else {
      queueMeta(newKey, row.name, variantDisplay);
    }
  }

  if (toRemove.length) {
    updateShoppingPlan(
      (plan) => {
        if (!plan.itemSelections || typeof plan.itemSelections !== 'object')
          return;
        toRemove.forEach((k) => {
          if (k && Object.prototype.hasOwnProperty.call(plan.itemSelections, k)) {
            delete plan.itemSelections[k];
          }
        });
      },
      planPersistOptions,
    );
    try {
      const fn = window.__favoriteEatsPruneShoppingBrowseSelectionKeys;
      if (typeof fn === 'function' && toRemove.length) fn(toRemove);
    } catch (err) {
      console.warn(
        'Failed to prune live shopping browse keys (reconcile removed iv)',
        err,
      );
    }
  }

  if (!extract.length && !metaUpdates.size) return;

  updateShoppingPlan(
    (plan) => {
    if (!plan.itemSelections || typeof plan.itemSelections !== 'object') return;
    const sel2 = plan.itemSelections;

    if (extract.length) {
      const merged = new Map();
      extract.forEach((row) => {
        const live = sel2[row.oldKey];
        if (!live || typeof live !== 'object') return;
        const q = Number(live.quantity);
        if (!Number.isFinite(q) || Math.abs(q) < 1e-9) return;
        const prev = merged.get(row.newKey);
        const nextQty = Number((q + (prev ? prev.quantity : 0)).toFixed(4));
        const nIv = parseIngredientVariantIdFromShoppingPlanKey(row.newKey);
        const o = {
          key: row.newKey,
          name: row.name,
          variantName: row.variantName,
          quantity: nextQty,
        };
        if (nIv) o.ingredientVariantId = nIv;
        merged.set(row.newKey, o);
      });
      extract.forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(sel2, row.oldKey)) {
          delete sel2[row.oldKey];
        }
      });
      merged.forEach((v) => {
        sel2[v.key] = { ...v };
      });
    }

    if (metaUpdates.size) {
      metaUpdates.forEach((meta, k) => {
        const live = sel2[k];
        if (!live || typeof live !== 'object') return;
        sel2[k] = {
          ...live,
          name: meta.name,
          variantName: meta.variantName,
        };
      });
    }
  },
    planPersistOptions,
  );

  if (extract.length) {
    try {
      await patchShoppingListDocForRewrittenSelectionKeysAsync({ extract });
    } catch (err) {
      console.warn('Failed to patch shopping list doc (reconcile)', err);
    }
  }

  if (extract.length) {
    const browseRemaps = extract.map((row) => ({
      oldKey: row.oldKey,
      newKey: row.newKey,
      itemName: row.name,
      variantName: row.variantName,
    }));
    try {
      const fn = window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap;
      if (typeof fn === 'function' && browseRemaps.length) fn(browseRemaps);
    } catch (err) {
      console.warn(
        'Failed to remap live shopping browse keys (reconcile)',
        err,
      );
    }
  }
}

async function pruneOrphanShoppingItemSelectionsWithDataService(
  planPersistOptions = {},
) {
  if (
    !favoriteEatsShouldUseSupabaseDataDoor() ||
    !window.dataService ||
    typeof window.dataService.resolveCanonicalIngredientForShoppingReconcile !==
      'function' ||
    typeof window.dataService.listIngredientVariantsWithIngredientsByIds !==
      'function' ||
    typeof window.dataService.listIngredientVariantsByIngredientIds !==
      'function'
  ) {
    return;
  }
  window.dataService.useSupabase = true;
  const ds = window.dataService;

  const toRemove = [];
  const sel = getShoppingPlanItemSelections();

  const ivIdsNeeded = [];
  Object.entries(sel).forEach(([oldKey, entry]) => {
    if (!oldKey || !entry || typeof entry !== 'object') return;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;
    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      ivIdsNeeded.push(Math.trunc(Number(idFromKey)));
      return;
    }
    const sid = Math.trunc(Number(entry?.ingredientVariantId));
    if (Number.isFinite(sid) && sid > 0) ivIdsNeeded.push(sid);
  });

  const livRows = ivIdsNeeded.length
    ? await ds.listIngredientVariantsWithIngredientsByIds({
        variantIds: ivIdsNeeded,
      })
    : [];
  const ivOk = new Set(
    (Array.isArray(livRows) ? livRows : []).map((r) => r.id),
  );

  const baseLowerSet = new Set();
  Object.entries(sel).forEach(([oldKey, entry]) => {
    if (!oldKey || !entry || typeof entry !== 'object') return;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;
    if (parseIngredientVariantIdFromShoppingPlanKey(oldKey)) return;
    const { baseLower } = parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (baseLower) baseLowerSet.add(baseLower);
  });

  const canonByBaseLower = new Map();
  await Promise.all(
    [...baseLowerSet].map(async (bl) => {
      try {
        const row = await ds.resolveCanonicalIngredientForShoppingReconcile({
          baseLower: bl,
        });
        canonByBaseLower.set(bl, row || null);
      } catch (_) {
        canonByBaseLower.set(bl, null);
      }
    }),
  );

  const ingredientIds = [
    ...new Set(
      [...canonByBaseLower.values()]
        .filter(Boolean)
        .map((r) => r.id)
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  let variantRowsAll = ingredientIds.length
    ? await ds.listIngredientVariantsByIngredientIds({ ingredientIds })
    : [];
  variantRowsAll = Array.isArray(variantRowsAll) ? variantRowsAll : [];

  const variantExistsForIngredient = (ingredientId, variantPartLower) => {
    const vpl = String(variantPartLower || '')
      .trim()
      .toLowerCase();
    if (!vpl) return true;
    const iid = Math.trunc(Number(ingredientId));
    return variantRowsAll.some(
      (r) =>
        Math.trunc(Number(r.ingredient_id)) === iid &&
        String(r.variant || '')
          .trim()
          .toLowerCase() === vpl,
    );
  };

  Object.entries(sel).forEach(([oldKey, entry]) => {
    if (!oldKey || !entry || typeof entry !== 'object') return;
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;

    const idFromKey = parseIngredientVariantIdFromShoppingPlanKey(oldKey);
    if (idFromKey) {
      if (!ivOk.has(Math.trunc(Number(idFromKey)))) {
        toRemove.push(oldKey);
      }
      return;
    }

    const storedIvPrune = Math.trunc(Number(entry?.ingredientVariantId));
    if (Number.isFinite(storedIvPrune) && storedIvPrune > 0) {
      if (!ivOk.has(storedIvPrune)) {
        toRemove.push(oldKey);
      }
      return;
    }

    const { baseLower, variantPartLower } =
      parseShoppingPlanItemSelectionKeyForReconcile(oldKey);
    if (!baseLower) {
      toRemove.push(oldKey);
      return;
    }

    const row = canonByBaseLower.get(baseLower);
    if (!row) {
      return;
    }

    const v = String(variantPartLower || '').trim();
    if (
      !v ||
      isIngredientBaseVariantName(v) ||
      isReservedIngredientVariantName(v)
    ) {
      return;
    }
    if (!variantExistsForIngredient(row.id, v)) {
      toRemove.push(oldKey);
    }
  });

  if (!toRemove.length) return;

  updateShoppingPlan(
    (plan) => {
      if (!plan.itemSelections || typeof plan.itemSelections !== 'object') return;
      toRemove.forEach((k) => {
        if (k && Object.prototype.hasOwnProperty.call(plan.itemSelections, k)) {
          delete plan.itemSelections[k];
        }
      });
    },
    planPersistOptions,
  );

  try {
    const fn = window.__favoriteEatsPruneShoppingBrowseSelectionKeys;
    if (typeof fn === 'function' && toRemove.length) fn(toRemove);
  } catch (err) {
    console.warn('Failed to prune live shopping browse keys', err);
  }
}

async function healShoppingListDocWithGeneratedFromPlan(db) {
  const useDataDoor =
    favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
  if (useDataDoor) {
    window.dataService.useSupabase = true;
  }
  if (!useDataDoor && (!db || typeof db.exec !== 'function')) {
    return { planRows: null };
  }

  let lastPlanRows = null;
  const computeHealPersist = async (storedDoc) => {
    const planRows = useDataDoor
      ? await getShoppingPlanSelectionRowsViaDataService({ db })
      : getShoppingPlanSelectionRows({ db });
    lastPlanRows = planRows;
    const generated = buildShoppingListDocFromPlanRows(planRows);
    const merged = mergeShoppingListDocWithGenerated(storedDoc, generated);
    const mergedHealNormalized = normalizeShoppingListDoc(merged.doc);
    const storedHealNormalized = storedDoc
      ? normalizeShoppingListDoc(storedDoc)
      : null;
    const skipHealShoppingListRemoteSave =
      shouldUseRemoteShoppingState() &&
      storedHealNormalized &&
      Array.isArray(merged.conflicts) &&
      merged.conflicts.length === 0 &&
      JSON.stringify(mergedHealNormalized) ===
        JSON.stringify(storedHealNormalized);
    return { merged, skipHealShoppingListRemoteSave };
  };

  let stored = getAuthoritativeShoppingListDoc();
  let { merged, skipHealShoppingListRemoteSave } =
    await computeHealPersist(stored);

  if (
    useDataDoor &&
    shouldUseRemoteShoppingState() &&
    !skipHealShoppingListRemoteSave
  ) {
    try {
      await hydrateShoppingStateFromDataService({
        source: 'shopping list heal hydrate',
      });
      stored = getAuthoritativeShoppingListDoc();
      ({ merged, skipHealShoppingListRemoteSave } =
        await computeHealPersist(stored));
    } catch (err) {
      console.warn('healShoppingListDoc: server-first refresh failed:', err);
    }
  }

  // Remote refresh/heal merges are local view-model only; never push full list
  // docs from Realtime-driven paths (prevents save_shopping_state feedback loops).
  persistShoppingListDoc(merged.doc, {
    skipRemoteSave:
      shouldUseRemoteShoppingState() || skipHealShoppingListRemoteSave,
  });
  return { planRows: lastPlanRows };
}

async function maintainShoppingPlanStorageWithDb(db, options = {}) {
  const useDataDoor =
    favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
  const planPersistOptions = shoppingPlanPersistOptionsFromMaintain(options);
  if (useDataDoor) {
    window.dataService.useSupabase = true;
  }
  if (!useDataDoor && (!db || typeof db.exec !== 'function')) {
    return { planRows: null };
  }
  if (useDataDoor) {
    try {
      await reconcileShoppingPlanItemSelectionKeysWithDataService(
        planPersistOptions,
      );
    } catch (err) {
      console.warn('Shopping plan reconcile failed:', err);
    }
    try {
      await pruneOrphanShoppingItemSelectionsWithDataService(planPersistOptions);
    } catch (err) {
      console.warn('Shopping plan orphan prune failed:', err);
    }
  }
  let healPlanRows = null;
  try {
    const healOut = await healShoppingListDocWithGeneratedFromPlan(db);
    healPlanRows = healOut?.planRows ?? null;
  } catch (err) {
    console.warn('Shopping list doc heal failed:', err);
  }
  if (shouldUseRemoteShoppingState()) {
    try {
      syncRecipePlannerServingsLocalCacheFromShoppingPlan(getShoppingPlan());
    } catch (err) {
      console.warn(
        'syncRecipePlannerServingsLocalCacheFromShoppingPlan (maintain) failed:',
        err,
      );
    }
  }
  return { planRows: healPlanRows };
}

async function migrateShoppingIdentityAfterIngredientEditorSave({
  db,
  oldDisplayName,
  newDisplayName,
  prevNamedValues,
  nextNamedValues,
  prevNamedRows,
  nextNamedRows,
  hasVariantTable,
}) {
  const ctx = await collectShoppingPlanEntriesToRewriteForIngredientIdentity({
    db,
    oldDisplayName,
    newDisplayName,
    prevNamedValues,
    nextNamedValues,
    prevNamedRows,
    nextNamedRows,
    hasVariantTable,
  });
  if (!ctx) return;
  const { oldBase, newBase, variantRenames, extract } = ctx;
  if (oldBase === newBase && !variantRenames.length && !extract.length) return;

  const browseRemaps = [];
  if (extract.length) {
    updateShoppingPlan((plan) => {
      const sel = plan.itemSelections;
      if (!sel || typeof sel !== 'object') return;
      const merged = new Map();
      extract.forEach((row) => {
        const live = sel[row.oldKey];
        if (!live || typeof live !== 'object') return;
        const qty = Number(live.quantity);
        if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return;
        const prev = merged.get(row.newKey);
        const nextQty = Number((qty + (prev ? prev.quantity : 0)).toFixed(4));
        const mIv = parseIngredientVariantIdFromShoppingPlanKey(row.newKey);
        const o = {
          key: row.newKey,
          name: row.name,
          variantName: row.variantName,
          quantity: nextQty,
        };
        if (mIv) o.ingredientVariantId = mIv;
        merged.set(row.newKey, o);
      });
      extract.forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(sel, row.oldKey)) {
          delete sel[row.oldKey];
        }
      });
      merged.forEach((v) => {
        sel[v.key] = { ...v };
      });
    });

    extract.forEach((row) => {
      browseRemaps.push({
        oldKey: row.oldKey,
        newKey: row.newKey,
        itemName: row.name,
        variantName: row.variantName,
      });
    });

    try {
      await patchShoppingListDocForRewrittenSelectionKeysAsync({
        extract,
        db,
        skipRemoteSave: favoriteEatsDataServiceIsSupabaseActive(),
      });
    } catch (err) {
      console.warn('Failed to patch shopping list doc', err);
    }

    if (favoriteEatsDataServiceIsSupabaseActive()) {
      try {
        await persistShoppingIdentityKeyRewritesToDataService(extract);
      } catch (err) {
        console.warn('Failed to persist shopping identity key rewrites', err);
        const plan = getShoppingPlan();
        const listDoc = getAuthoritativeShoppingListDoc();
        if (listDoc && (listDoc.rows || []).length) {
          await awaitPersistShoppingStateToDataService({ shoppingListDoc: listDoc });
        }
        if (shoppingPlanHasSelections(plan)) {
          await awaitPersistShoppingStateToDataService({ plan });
        }
      }
    }
  }

  try {
    const fn = window.__favoriteEatsApplyShoppingBrowseSelectionKeyMap;
    if (typeof fn === 'function' && browseRemaps.length) fn(browseRemaps);
  } catch (err) {
    console.warn('Failed to remap live shopping browse keys', err);
  }
}

function setShoppingPlanItemSelection({
  key,
  name = '',
  variantName = '',
  quantity = 0,
  quantityUnspecified = false,
  ingredientVariantId: ingredientVariantIdArg = null,
} = {}, options = {}) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return getShoppingPlan();
  return updateShoppingPlan((plan) => {
    if (!plan.itemSelections || typeof plan.itemSelections !== 'object') {
      plan.itemSelections = {};
    }
    const unspecified = quantityUnspecified === true;
    const nextQtyRaw = Number(quantity);
    if (!Number.isFinite(nextQtyRaw)) {
      delete plan.itemSelections[normalizedKey];
      return;
    }
    const nextQty = Number(nextQtyRaw.toFixed(4));
    if (!unspecified && Math.abs(nextQty) < 1e-9) {
      delete plan.itemSelections[normalizedKey];
      return;
    }
    const prevEntry = plan.itemSelections[normalizedKey];
    const prevIv = Number(prevEntry?.ingredientVariantId);
    const fromKeyId =
      parseIngredientVariantIdFromShoppingPlanKey(normalizedKey);
    const nIv = Number(ingredientVariantIdArg);
    const ingredientVariantId =
      fromKeyId ||
      (Number.isFinite(nIv) && nIv > 0 ? Math.trunc(nIv) : null) ||
      (Number.isFinite(prevIv) && prevIv > 0 ? Math.trunc(prevIv) : null) ||
      null;
    const out = {
      key: normalizedKey,
      name: String(name || '').trim(),
      variantName: String(variantName || '').trim(),
      quantity: unspecified ? 0 : nextQty,
    };
    if (unspecified) {
      out.quantityUnspecified = true;
    }
    if (ingredientVariantId) {
      out.ingredientVariantId = ingredientVariantId;
    }
    plan.itemSelections[normalizedKey] = out;
  }, options);
}

function getShoppingPlanItemSelections() {
  const plan = getShoppingPlan();
  return plan?.itemSelections && typeof plan.itemSelections === 'object'
    ? plan.itemSelections
    : {};
}

/** Patches merged `recipeSelections` only (e.g. implied-only rows). Servings mirror prefers roots when possible; planner toggles use `setShoppingPlanRecipeRootSelection`. */
function setShoppingPlanRecipeSelection(
  {
    recipeId,
    title = '',
    quantity = 0,
    servingsOverride,
  } = {},
  options = {},
) {
  const normalizedRecipeId = Number(recipeId);
  if (!Number.isFinite(normalizedRecipeId) || normalizedRecipeId <= 0) {
    return getShoppingPlan();
  }
  const normalizedKey = String(Math.trunc(normalizedRecipeId));
  return updateShoppingPlan((plan) => {
    if (!plan.recipeSelections || typeof plan.recipeSelections !== 'object') {
      plan.recipeSelections = {};
    }
    const prev = plan.recipeSelections[normalizedKey];
    const nextQty = Math.max(0, Math.min(99, Number(quantity || 0)));
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      delete plan.recipeSelections[normalizedKey];
      return;
    }
    let nextServings;
    if (servingsOverride === null) {
      nextServings = null;
    } else if (servingsOverride !== undefined) {
      nextServings = servingsOverride;
    } else {
      nextServings = prev?.servingsOverride;
    }
    const out = {
      key: normalizedKey,
      recipeId: Math.trunc(normalizedRecipeId),
      title: String(title || '').trim(),
      quantity: nextQty,
    };
    if (nextServings != null) {
      const ring = window.favoriteEatsRecipePlannerServings;
      const rounded =
        ring && typeof ring.roundValue === 'function'
          ? ring.roundValue(Number(nextServings))
          : Number(nextServings);
      if (rounded != null && Number.isFinite(rounded) && rounded > 0) {
        out.servingsOverride = rounded;
      }
    }
    plan.recipeSelections[normalizedKey] = out;
  }, options);
}

function getShoppingPlanRecipeSelections() {
  const plan = getShoppingPlan();
  return plan?.recipeSelections && typeof plan.recipeSelections === 'object'
    ? plan.recipeSelections
    : {};
}

function clearShoppingPlanSelections({
  clearItems = false,
  clearRecipes = false,
  allowEmptyPlanRemoteSave = false,
} = {}) {
  return updateShoppingPlan((plan) => {
    if (clearItems) plan.itemSelections = {};
    if (clearRecipes) {
      plan.recipeSelections = {};
      plan.recipeSelectionRoots = {};
    }
  }, allowEmptyPlanRemoteSave ? { allowEmptyPlanRemoteSave: true } : {});
}

function getShoppingPlanSelectionLabel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const name = String(entry.name || '').trim();
  const variantName = String(entry.variantName || '').trim();
  if (!name) return '';
  if (!variantName || variantName.toLowerCase() === 'default') return name;
  return `${name} (${variantName})`;
}

function getRecipeIngredientShoppingCount(line) {
  if (!line || typeof line !== 'object') return null;
  const qtyMax = Number(line.quantityMax);
  if (Number.isFinite(qtyMax) && qtyMax > 0) return qtyMax;
  const qtyMin = Number(line.quantityMin);
  if (Number.isFinite(qtyMin) && qtyMin > 0) return qtyMin;
  if (typeof parseNumericQuantityValue === 'function') {
    const parsed = parseNumericQuantityValue(line.quantity);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

const SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH = 2;

const SHOPPING_PLAN_MATERIALIZE_RECIPE_CACHE_KEY =
  '__favoriteEatsShoppingPlanRecipeMaterializeCache';

function getShoppingPlanRecipeMaterializeCacheBucket() {
  if (typeof window === 'undefined') return null;
  if (!window[SHOPPING_PLAN_MATERIALIZE_RECIPE_CACHE_KEY]) {
    window[SHOPPING_PLAN_MATERIALIZE_RECIPE_CACHE_KEY] = Object.create(null);
  }
  return window[SHOPPING_PLAN_MATERIALIZE_RECIPE_CACHE_KEY];
}

/** @returns {object|null} */
function peekShoppingPlanRecipeMaterializeCache(recipeId) {
  const id = Math.trunc(Number(recipeId));
  if (!Number.isFinite(id) || id <= 0) return null;
  const planCache = window.favoriteEatsPlanRecipeCache;
  if (planCache && typeof planCache.peek === 'function') {
    const sessionHit = planCache.peek(id);
    if (sessionHit) return sessionHit;
  }
  const bucket = getShoppingPlanRecipeMaterializeCacheBucket();
  if (!bucket) return null;
  const r = bucket[String(id)];
  return r && Array.isArray(r.sections) ? r : null;
}

function stashShoppingPlanRecipeMaterializeCache(recipeId, recipe) {
  const id = Math.trunc(Number(recipeId));
  if (!Number.isFinite(id) || id <= 0 || !recipe) return;
  const planCache = window.favoriteEatsPlanRecipeCache;
  if (planCache && typeof planCache.stash === 'function') {
    planCache.stash(id, recipe);
  }
  const bucket = getShoppingPlanRecipeMaterializeCacheBucket();
  if (!bucket) return;
  bucket[String(id)] = recipe;
}

function loadShoppingPlanRecipeFromDB(db, recipeId) {
  const id = Math.trunc(Number(recipeId));
  if (!Number.isFinite(id) || id <= 0) return null;
  if (
    window.bridge &&
    typeof window.bridge.loadRecipeFromDB === 'function'
  ) {
    const dbArg = db || window.dbInstance;
    try {
      const fromBridge = window.bridge.loadRecipeFromDB(dbArg, recipeId);
      if (fromBridge && Array.isArray(fromBridge.sections)) return fromBridge;
    } catch (_) {}
  }
  return peekShoppingPlanRecipeMaterializeCache(id);
}

function getRecipeDefaultServingsCountFromModel(recipe) {
  const def = Number(
    recipe?.servings?.default != null
      ? recipe.servings.default
      : recipe?.servingsDefault,
  );
  return Number.isFinite(def) && def > 0 ? def : null;
}

/**
 * Chosen servings for a root menu recipe while materializing (avoid reading the
 * merged row we're rebuilding). Order: root row → previous merged → planner storage → default.
 */
function getEffectiveChosenServingsForPlanRoot(
  rootId,
  rootEntry,
  prevMerged,
  db,
) {
  const key = String(Math.trunc(rootId));
  const rOv =
    rootEntry?.servingsOverride != null
      ? Number(rootEntry.servingsOverride)
      : rootEntry?.servings_override != null
        ? Number(rootEntry.servings_override)
        : NaN;
  if (Number.isFinite(rOv) && rOv > 0) return rOv;
  const p = prevMerged[key];
  const pOv =
    p?.servingsOverride != null
      ? Number(p.servingsOverride)
      : p?.servings_override != null
        ? Number(p.servings_override)
        : NaN;
  if (Number.isFinite(pOv) && pOv > 0) return pOv;
  const recipe = loadShoppingPlanRecipeFromDB(db, rootId);
  if (!recipe) return null;
  const api = window.favoriteEatsRecipePlannerServings;
  if (typeof api?.getStoredValue === 'function') {
    const stored = api.getStoredValue(recipe, {
      fallbackRecipeId: rootId,
      scrubInvalid: false,
    });
    if (Number.isFinite(Number(stored)) && Number(stored) > 0) return Number(stored);
  }
  const raw = loadRecipePlannerServingsMap()[String(Math.trunc(rootId))];
  const fromMap = Number(raw);
  if (Number.isFinite(fromMap) && fromMap > 0) {
    return Math.round(fromMap * 2) / 2;
  }
  const modelDef = getRecipeDefaultServingsCountFromModel(recipe);
  if (Number.isFinite(Number(modelDef)) && Number(modelDef) > 0) {
    return Number(modelDef);
  }
  return 1;
}

function computeMealScaleForPlanRoot(rootId, rootEntry, prevMerged, db) {
  const recipe = loadShoppingPlanRecipeFromDB(db, rootId);
  const defRaw = getRecipeDefaultServingsCountFromModel(recipe);
  const def =
    Number.isFinite(Number(defRaw)) && Number(defRaw) > 0
      ? Number(defRaw)
      : 1;
  const chosen = getEffectiveChosenServingsForPlanRoot(
    rootId,
    rootEntry,
    prevMerged,
    db,
  );
  if (!Number.isFinite(chosen) || chosen <= 0) return 1;
  return chosen / def;
}

/** Servings multiplier using draft `roots` / `prevMerged` (materialize pass), not global plan cache. */
function getRecipeServingsMultiplierForShoppingPlanScoped(
  recipeId,
  recipe,
  roots,
  prevMerged,
  db,
) {
  const defRaw = getRecipeDefaultServingsCountFromModel(recipe);
  const def =
    Number.isFinite(Number(defRaw)) && Number(defRaw) > 0
      ? Number(defRaw)
      : 1;
  const chosen = getEffectiveChosenServingsForPlanRoot(
    recipeId,
    roots[String(Math.trunc(recipeId))],
    prevMerged,
    db,
  );
  if (!Number.isFinite(chosen) || chosen <= 0) return 1;
  return chosen / def;
}

function getRecipeServingsMultiplierForShoppingPlan(recipeId, recipe) {
  const api = window.favoriteEatsRecipePlannerServings;
  if (recipe && typeof api?.getMultiplier === 'function') {
    const m = api.getMultiplier(recipe, {
      fallbackRecipeId: recipeId,
      scrubInvalid: true,
    });
    return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
  }
  // Snippet/tests may run before `utils.js` binds `favoriteEatsRecipePlannerServings`.
  const recipeDefaultRaw = Number(
    recipe?.servings?.default != null
      ? recipe.servings.default
      : recipe?.servingsDefault,
  );
  const recipeDefaultServings =
    Number.isFinite(recipeDefaultRaw) && recipeDefaultRaw > 0
      ? recipeDefaultRaw
      : 1;
  const selectedRaw = getRecipePlannerServingsStoredValue(recipeId, recipe);
  let selectedEff =
    Number.isFinite(Number(selectedRaw)) && Number(selectedRaw) > 0
      ? Number(selectedRaw)
      : null;
  if (selectedEff == null) {
    selectedEff =
      Number.isFinite(recipeDefaultRaw) && recipeDefaultRaw > 0
        ? recipeDefaultRaw
        : 1;
  }
  return selectedEff / recipeDefaultServings;
}

/**
 * When parent recipes are selected, sums each linked recipe's implied "make count"
 * from link rows (same depth / cycle rules as shopping walks).
 * Also records the shortest inbound link-chain depth from a root (0 = root itself)
 * so merged walks do not reset `linkDepth` and over-expand.
 */
function collectImpliedShoppingPlanLinkedRecipeAddonQuantities(
  db,
  rootsByKey,
  prevMerged,
) {
  const implied = new Map();
  const inboundDepth = new Map();
  /** @type {Map<number, Set<number>>} */
  const impliedRootIds = new Map();
  const visit = (
    recipeId,
    outerMultExclServings,
    depthFromRoot,
    ancestors,
    rootId,
  ) => {
    const rid = Math.trunc(Number(recipeId));
    if (!Number.isFinite(rid) || rid <= 0) return;
    if (depthFromRoot >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH) return;
    const nextAncestors =
      ancestors instanceof Set ? new Set(ancestors) : new Set();
    if (nextAncestors.has(rid)) return;
    const recipe = loadShoppingPlanRecipeFromDB(db, rid);
    if (!recipe || !Array.isArray(recipe.sections)) return;
    const sm = getRecipeServingsMultiplierForShoppingPlanScoped(
      rid,
      recipe,
      rootsByKey,
      prevMerged,
      db,
    );
    const outer = Number(outerMultExclServings);
    if (!Number.isFinite(outer) || outer <= 0) return;
    const multWithServings = outer * sm;
    if (!Number.isFinite(multWithServings) || multWithServings <= 0) return;
    nextAncestors.add(rid);

    recipe.sections.forEach((section) => {
      const ingredients = Array.isArray(section?.ingredients)
        ? section.ingredients
        : [];
      ingredients.forEach((line) => {
        if (!line || line.rowType === 'heading') return;
        const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
        if (!line.isRecipe) return;
        if (
          !Number.isFinite(linkedRecipeId) ||
          linkedRecipeId <= 0 ||
          nextAncestors.has(linkedRecipeId)
        ) {
          return;
        }
        const linkQuantity = getRecipeIngredientShoppingCount(line);
        const lineM =
          Number.isFinite(linkQuantity) && linkQuantity > 0 ? linkQuantity : 1;
        const add = multWithServings * lineM;
        implied.set(
          linkedRecipeId,
          (implied.get(linkedRecipeId) || 0) + add,
        );
        const rootKey = Math.trunc(Number(rootId));
        if (Number.isFinite(rootKey) && rootKey > 0) {
          if (!impliedRootIds.has(linkedRecipeId)) {
            impliedRootIds.set(linkedRecipeId, new Set());
          }
          impliedRootIds.get(linkedRecipeId).add(rootKey);
        }
        const nextDepth = depthFromRoot + 1;
        const prevD = inboundDepth.get(linkedRecipeId);
        if (prevD == null || nextDepth < prevD) {
          inboundDepth.set(linkedRecipeId, nextDepth);
        }
        visit(
          linkedRecipeId,
          multWithServings * lineM,
          nextDepth,
          nextAncestors,
          rootId,
        );
      });
    });
  };

  Object.values(rootsByKey || {}).forEach((entry) => {
    const id = Math.trunc(Number(entry?.recipeId));
    const q = Math.max(0, Math.min(99, Number(entry?.quantity || 0)));
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(q) || q <= 0) return;
    inboundDepth.set(id, 0);
    visit(id, q, 0, new Set(), id);
  });
  return { implied, inboundDepth, impliedRootIds };
}

/**
 * Writes `plan.recipeSelections` = user roots + linked recipes implied by those roots.
 * Preserves `servingsOverride` / titles from the previous merged map when possible.
 */
function materializeShoppingPlanRecipeSelectionsFromRoots(plan, db) {
  void db;
  if (!plan || typeof plan !== 'object') return;
  if (!plan.recipeSelectionRoots || typeof plan.recipeSelectionRoots !== 'object') {
    plan.recipeSelectionRoots = {};
  }
  if (!plan.recipeSelections || typeof plan.recipeSelections !== 'object') {
    plan.recipeSelections = {};
  }
  const roots = plan.recipeSelectionRoots;
  const prevMerged = { ...plan.recipeSelections };
  const { implied, inboundDepth, impliedRootIds } =
    collectImpliedShoppingPlanLinkedRecipeAddonQuantities(
      db,
      roots,
      prevMerged,
    );
  const idSet = new Set();
  Object.keys(roots).forEach((k) => {
    const n = Math.trunc(Number(k));
    if (Number.isFinite(n) && n > 0) idSet.add(n);
  });
  implied.forEach((_v, id) => {
    if (Number.isFinite(id) && id > 0) idSet.add(id);
  });

  const nextSelections = {};
  idSet.forEach((recipeId) => {
    const key = String(Math.trunc(recipeId));
    const rootEntry = roots[key];
    const rootQty = rootEntry
      ? Math.max(0, Math.min(99, Number(rootEntry.quantity || 0)))
      : 0;
    const impliedRaw = implied.get(recipeId) || 0;
    const mergedQtyRaw = rootQty + impliedRaw;
    const mergedQty = Math.max(
      0,
      Math.min(99, Number(mergedQtyRaw.toFixed(4))),
    );
    if (!Number.isFinite(mergedQty) || mergedQty <= 0) return;

    const prev = prevMerged[key];
    const titleFromRoot = String(rootEntry?.title || '').trim();
    const titleFromPrev = String(prev?.title || '').trim();
    let title = titleFromRoot || titleFromPrev;
    if (!title) {
      const loaded = loadShoppingPlanRecipeFromDB(db, recipeId);
      title = String(loaded?.title || '').trim();
    }
    if (!title) title = `Recipe ${recipeId}`;

    const out = {
      key,
      recipeId: Math.trunc(recipeId),
      title,
      quantity: mergedQty,
    };
    const depthHint = inboundDepth.get(recipeId);
    if (depthHint != null && Number.isFinite(depthHint) && depthHint >= 0) {
      out.inboundLinkDepth = Math.min(
        SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH,
        Math.trunc(depthHint),
      );
    }
    const prevServ =
      prev?.servingsOverride != null
        ? Number(prev.servingsOverride)
        : prev?.servings_override != null
          ? Number(prev.servings_override)
          : NaN;
    const rootServ =
      rootEntry?.servingsOverride != null
        ? Number(rootEntry.servingsOverride)
        : rootEntry?.servings_override != null
          ? Number(rootEntry.servings_override)
          : NaN;
    let rawServingsOv =
      Number.isFinite(rootServ) && rootServ > 0 ? rootServ : prevServ;

    if (rootEntry && (!Number.isFinite(rawServingsOv) || rawServingsOv <= 0)) {
      const chosenRoot = getEffectiveChosenServingsForPlanRoot(
        recipeId,
        rootEntry,
        prevMerged,
        db,
      );
      if (Number.isFinite(chosenRoot) && chosenRoot > 0) {
        rawServingsOv = chosenRoot;
      }
    }

    if (!rootEntry && (!Number.isFinite(rawServingsOv) || rawServingsOv <= 0)) {
      const rootsSet = impliedRootIds.get(recipeId);
      let maxScale = 0;
      if (rootsSet && rootsSet.size) {
        rootsSet.forEach((rid) => {
          const rk = String(Math.trunc(rid));
          const scale = computeMealScaleForPlanRoot(
            rid,
            roots[rk],
            prevMerged,
            db,
          );
          if (scale > maxScale) maxScale = scale;
        });
      }
      if (maxScale <= 0) maxScale = 1;
      const recipeL = loadShoppingPlanRecipeFromDB(db, recipeId);
      const defL = getRecipeDefaultServingsCountFromModel(recipeL);
      if (recipeL && Number.isFinite(defL) && defL > 0) {
        let y = defL * maxScale;
        const ring = window.favoriteEatsRecipePlannerServings;
        if (ring && typeof ring.roundValue === 'function') {
          const rv = ring.roundValue(Number(y));
          if (rv != null && Number.isFinite(rv) && rv > 0) y = Number(rv);
        }
        if (Number.isFinite(y) && y > 0) {
          rawServingsOv = y;
        }
      }
    }

    if (Number.isFinite(rawServingsOv) && rawServingsOv > 0) {
      const ring = window.favoriteEatsRecipePlannerServings;
      let rounded =
        ring && typeof ring.roundValue === 'function'
          ? ring.roundValue(rawServingsOv)
          : null;
      if (rounded == null || !Number.isFinite(rounded) || rounded <= 0) {
        rounded = Number(rawServingsOv);
      }
      if (Number.isFinite(rounded) && rounded > 0) {
        out.servingsOverride = rounded;
      }
    }
    nextSelections[key] = out;
  });

  plan.recipeSelections = nextSelections;
}

function getShoppingPlanRecipeSelectionRoots() {
  const plan = getShoppingPlan();
  return plan?.recipeSelectionRoots && typeof plan.recipeSelectionRoots === 'object'
    ? plan.recipeSelectionRoots
    : {};
}

function buildMergedShoppingPlanRecipeIdSet(recipeSelectionsByKey) {
  const ids = new Set();
  Object.values(recipeSelectionsByKey || {}).forEach((entry) => {
    const id = Math.trunc(Number(entry?.recipeId));
    const q = Number(entry?.quantity || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!Number.isFinite(q) || q <= 0) return;
    ids.add(id);
  });
  return ids;
}

function setShoppingPlanRecipeRootSelection(
  {
    recipeId,
    title = '',
    quantity = 0,
    servingsOverride,
  } = {},
  options = {},
) {
  const normalizedRecipeId = Number(recipeId);
  if (!Number.isFinite(normalizedRecipeId) || normalizedRecipeId <= 0) {
    return getShoppingPlan();
  }
  const normalizedKey = String(Math.trunc(normalizedRecipeId));
  return updateShoppingPlan((plan) => {
    if (!plan.recipeSelectionRoots || typeof plan.recipeSelectionRoots !== 'object') {
      plan.recipeSelectionRoots = {};
    }
    const prev = plan.recipeSelectionRoots[normalizedKey];
    const nextQty = Math.max(0, Math.min(99, Number(quantity || 0)));
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      delete plan.recipeSelectionRoots[normalizedKey];
      // Drop stale merged rows too — otherwise normalize re-seeds roots from
      // `recipeSelections` when this was the last root (Recipes remove no-op).
      if (plan.recipeSelections && typeof plan.recipeSelections === 'object') {
        delete plan.recipeSelections[normalizedKey];
      }
      return;
    }
    let nextServings;
    if (servingsOverride === null) {
      nextServings = null;
    } else if (servingsOverride !== undefined) {
      nextServings = servingsOverride;
    } else {
      nextServings = prev?.servingsOverride;
    }
    const out = {
      key: normalizedKey,
      recipeId: Math.trunc(normalizedRecipeId),
      title: String(title || '').trim(),
      quantity: nextQty,
    };
    if (nextServings != null) {
      const ring = window.favoriteEatsRecipePlannerServings;
      const rounded =
        ring && typeof ring.roundValue === 'function'
          ? ring.roundValue(Number(nextServings))
          : Number(nextServings);
      if (rounded != null && Number.isFinite(rounded) && rounded > 0) {
        out.servingsOverride = rounded;
      }
    }
    plan.recipeSelectionRoots[normalizedKey] = out;
  }, options);
}

function walkExpandedShoppingPlanIngredientLines(
  db,
  recipe,
  {
    recipeId = null,
    recipeTitle = '',
    outerRecipeMultiplier = 1,
    linkDepth = 0,
    ancestorRecipeIds = null,
    skipInlineLinkedRecipeIds = null,
  } = {},
  visit,
) {
  // No SQL here — only `bridge.loadRecipeFromDB` for nested subrecipes.
  if (
    !recipe ||
    !Array.isArray(recipe.sections) ||
    typeof visit !== 'function'
  ) {
    return;
  }

  const normalizedRecipeId = Math.trunc(Number(recipeId));
  const normalizedRecipeTitle = String(recipeTitle || '').trim();
  const normalizedOuterMultiplier = Number(outerRecipeMultiplier);
  const normalizedLinkDepth = Math.max(0, Math.trunc(Number(linkDepth) || 0));
  if (
    !Number.isFinite(normalizedOuterMultiplier) ||
    normalizedOuterMultiplier <= 0
  ) {
    return;
  }

  const nextAncestors =
    ancestorRecipeIds instanceof Set ? new Set(ancestorRecipeIds) : new Set();
  if (Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0) {
    nextAncestors.add(normalizedRecipeId);
  }

  const servingsMultiplier = getRecipeServingsMultiplierForShoppingPlan(
    normalizedRecipeId,
    recipe,
  );

  recipe.sections.forEach((section) => {
    const ingredients = Array.isArray(section?.ingredients)
      ? section.ingredients
      : [];
    ingredients.forEach((line) => {
      if (!line || line.rowType === 'heading') return;

      const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
      if (line.isRecipe) {
        if (
          !Number.isFinite(linkedRecipeId) ||
          linkedRecipeId <= 0 ||
          normalizedLinkDepth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
          nextAncestors.has(linkedRecipeId)
        ) {
          return;
        }

        if (
          skipInlineLinkedRecipeIds instanceof Set &&
          skipInlineLinkedRecipeIds.has(linkedRecipeId)
        ) {
          return;
        }

        const linkedRecipe = loadShoppingPlanRecipeFromDB(db, linkedRecipeId);
        if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) return;

        const linkQuantity = getRecipeIngredientShoppingCount(line);
        const normalizedLinkQuantity =
          Number.isFinite(linkQuantity) && linkQuantity > 0 ? linkQuantity : 1;

        walkExpandedShoppingPlanIngredientLines(
          db,
          linkedRecipe,
          {
            recipeId: linkedRecipeId,
            recipeTitle: String(linkedRecipe?.title || '').trim(),
            outerRecipeMultiplier:
              normalizedOuterMultiplier *
              servingsMultiplier *
              normalizedLinkQuantity,
            linkDepth: normalizedLinkDepth + 1,
            ancestorRecipeIds: nextAncestors,
            skipInlineLinkedRecipeIds,
          },
          visit,
        );
        return;
      }

      visit(line, {
        recipeId:
          Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0
            ? normalizedRecipeId
            : null,
        recipeTitle: normalizedRecipeTitle,
        recipeCount: normalizedOuterMultiplier,
        servingsMultiplier,
      });
    });
  });
}

function getRecipeDerivedShoppingPlanRows({ db = window.dbInstance } = {}) {
  if (
    !window.bridge ||
    typeof window.bridge.loadRecipeFromDB !== 'function'
  ) {
    return [];
  }
  const dbEffective = db || window.dbInstance;
  const aggregate = new Map();
  const mergedPlanRecipeIds = buildMergedShoppingPlanRecipeIdSet(
    getShoppingPlanRecipeSelections(),
  );

  Object.values(getShoppingPlanRecipeSelections()).forEach((selection) => {
    const recipeId = Number(selection?.recipeId);
    const recipeCount = Number(selection?.quantity || 0);
    if (!Number.isFinite(recipeId) || recipeId <= 0) return;
    if (!Number.isFinite(recipeCount) || recipeCount <= 0) return;

    const recipe = loadShoppingPlanRecipeFromDB(dbEffective, recipeId);
    if (!recipe || !Array.isArray(recipe.sections)) return;

    walkExpandedShoppingPlanIngredientLines(
      dbEffective,
      recipe,
      {
        recipeId,
        recipeTitle: String(recipe?.title || '').trim(),
        outerRecipeMultiplier: recipeCount,
        linkDepth: Math.max(
          0,
          Math.min(
            SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH,
            Math.trunc(Number(selection?.inboundLinkDepth) || 0),
          ),
        ),
        skipInlineLinkedRecipeIds: mergedPlanRecipeIds,
      },
      (
        line,
        { recipeCount: expandedRecipeCount = 0, servingsMultiplier = 1 } = {},
      ) => {
        const name = String(line.name || '').trim();
        if (!name) return;
        const variantName = String(line.variant || '').trim();
        const key = resolvePersistedShoppingItemKeyForDb(dbEffective, name, variantName);
        if (!key) return;
        const ingredientCount = getRecipeIngredientShoppingCount(line);
        if (!Number.isFinite(ingredientCount) || ingredientCount <= 0) return;
        const scaledPerRecipeQuantityRaw = ingredientCount * servingsMultiplier;
        const scaledPerRecipeQuantity =
          Math.abs(servingsMultiplier - 1) > 1e-9 &&
          typeof window.normalizeActionableQuantity === 'function'
            ? Number(
                window.normalizeActionableQuantity(
                  scaledPerRecipeQuantityRaw,
                  line.unit || '',
                ),
              )
            : Number(scaledPerRecipeQuantityRaw.toFixed(4));
        if (
          !Number.isFinite(scaledPerRecipeQuantity) ||
          scaledPerRecipeQuantity <= 0
        ) {
          return;
        }
        const nextQuantity = scaledPerRecipeQuantity * expandedRecipeCount;
        const existing = aggregate.get(key);
        if (existing) {
          existing.quantity += nextQuantity;
          return;
        }
        aggregate.set(key, {
          key,
          name,
          variantName,
          label: getShoppingPlanSelectionLabel({ name, variantName }),
          quantity: nextQuantity,
        });
      },
    );
  });

  return Array.from(aggregate.values());
}

// --- Shopping list grouping helpers (tests extract this block) ---
const SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME = 'default';
const SHOPPING_LIST_BASE_PLAN_VARIANT_NAMES = new Set([
  SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME,
  'base',
  'any',
]);

function isShoppingListBasePlanVariantName(variantName) {
  const normalized = String(variantName || '')
    .trim()
    .toLowerCase();
  return !normalized || SHOPPING_LIST_BASE_PLAN_VARIANT_NAMES.has(normalized);
}

const SHOPPING_LIST_UNKNOWN_AISLE_ID = -1;
const SHOPPING_LIST_UNKNOWN_AISLE_LABEL = 'unknown';
const SHOPPING_LIST_UNKNOWN_AISLE_SORT_ORDER = -1;

function isShoppingListUnknownAisleId(aisleId) {
  return Math.trunc(Number(aisleId)) === SHOPPING_LIST_UNKNOWN_AISLE_ID;
}

function buildShoppingListUnknownAisleCandidates(storeIds) {
  const normalizedStoreIds = Array.isArray(storeIds) ? storeIds : [];
  const seen = new Set();
  const candidates = [];
  normalizedStoreIds.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!Number.isFinite(storeId) || storeId <= 0 || seen.has(storeId)) return;
    seen.add(storeId);
    candidates.push({
      storeId,
      aisleId: SHOPPING_LIST_UNKNOWN_AISLE_ID,
      aisleLabel: SHOPPING_LIST_UNKNOWN_AISLE_LABEL,
      aisleSortOrder: SHOPPING_LIST_UNKNOWN_AISLE_SORT_ORDER,
    });
  });
  return candidates;
}
function orderShoppingListSelectedStoreIds(storeOrder, selectedStoreIds) {
  const normalizedStoreOrder = Array.isArray(storeOrder) ? storeOrder : [];
  const normalizedSelectedStoreIds = Array.isArray(selectedStoreIds)
    ? selectedStoreIds
    : [];
  const selectedSet = new Set();
  normalizedSelectedStoreIds.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!Number.isFinite(storeId) || storeId <= 0) return;
    selectedSet.add(storeId);
  });
  if (!selectedSet.size) return [];
  const ordered = [];
  normalizedStoreOrder.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!selectedSet.has(storeId)) return;
    ordered.push(storeId);
    selectedSet.delete(storeId);
  });
  normalizedSelectedStoreIds.forEach((rawId) => {
    const storeId = Math.trunc(Number(rawId));
    if (!selectedSet.has(storeId)) return;
    ordered.push(storeId);
    selectedSet.delete(storeId);
  });
  return ordered;
}

/**
 * Same ordering intent as Stores → orderStoreRowsFromPlan when plan.storeOrder is
 * empty: use catalog listStores order filtered to selected ids. Avoids shopping list
 * sections ordering by raw selectedStoreIds JSON order (differs from Stores UI).
 */
async function resolveAssignmentStoreOrderForDataService() {
  const persisted = normalizeShoppingPlanStoreOrder(
    getShoppingPlan()?.storeOrder,
  );
  if (persisted.length) return persisted;
  const selected = normalizeShoppingPlanSelectedStoreIds(
    getShoppingPlan()?.selectedStoreIds,
  );
  if (!selected.length) return [];
  if (
    !favoriteEatsShouldUseSupabaseDataDoor() ||
    !window.dataService ||
    typeof window.dataService.listStores !== 'function'
  ) {
    return orderShoppingListSelectedStoreIds([], selected);
  }
  try {
    window.dataService.useSupabase = true;
    const storeRows = await window.dataService.listStores();
    const catalogIds = (Array.isArray(storeRows) ? storeRows : [])
      .map((row) => Math.trunc(Number(row?.id)))
      .filter((id) => Number.isFinite(id) && id > 0);
    const want = new Set(selected);
    const ordered = [];
    catalogIds.forEach((id) => {
      if (want.has(id)) ordered.push(id);
    });
    selected.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id);
    });
    return ordered;
  } catch (err) {
    console.warn(
      'resolveAssignmentStoreOrderForDataService: listStores failed:',
      err,
    );
    return orderShoppingListSelectedStoreIds([], selected);
  }
}

function compareShoppingListAssignmentCandidates(a, b) {
  const variantRankA = Number(a?.variantRank);
  const variantRankB = Number(b?.variantRank);
  const normalizedVariantRankA = Number.isFinite(variantRankA)
    ? variantRankA
    : -1;
  const normalizedVariantRankB = Number.isFinite(variantRankB)
    ? variantRankB
    : -1;
  if (normalizedVariantRankA !== normalizedVariantRankB) {
    return normalizedVariantRankA - normalizedVariantRankB;
  }
  const aisleSortA = Number(a?.aisleSortOrder);
  const aisleSortB = Number(b?.aisleSortOrder);
  const normalizedAisleSortA = Number.isFinite(aisleSortA)
    ? aisleSortA
    : 999999;
  const normalizedAisleSortB = Number.isFinite(aisleSortB)
    ? aisleSortB
    : 999999;
  if (normalizedAisleSortA !== normalizedAisleSortB) {
    return normalizedAisleSortA - normalizedAisleSortB;
  }
  const aisleIdA = Math.trunc(Number(a?.aisleId));
  const aisleIdB = Math.trunc(Number(b?.aisleId));
  if (
    Number.isFinite(aisleIdA) &&
    Number.isFinite(aisleIdB) &&
    aisleIdA !== aisleIdB
  ) {
    return aisleIdA - aisleIdB;
  }
  return String(a?.aisleLabel || '').localeCompare(
    String(b?.aisleLabel || ''),
    undefined,
    {
      sensitivity: 'base',
    },
  );
}

function chooseShoppingListAssignment(candidates, orderedSelectedStoreIds) {
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const orderedStoreIds = Array.isArray(orderedSelectedStoreIds)
    ? orderedSelectedStoreIds
    : [];
  if (!candidateList.length || !orderedStoreIds.length) return null;
  for (const rawStoreId of orderedStoreIds) {
    const storeId = Math.trunc(Number(rawStoreId));
    if (!Number.isFinite(storeId) || storeId <= 0) continue;
    const matches = candidateList
      .filter((candidate) => Math.trunc(Number(candidate?.storeId)) === storeId)
      .sort(compareShoppingListAssignmentCandidates);
    if (matches.length) return matches[0];
  }
  return null;
}

function getShoppingListVariantAssignmentKey(name, variantName = '') {
  if (typeof getShoppingPlanAggregateKey === 'function') {
    return getShoppingPlanAggregateKey(name, variantName);
  }
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase();
  const normalizedVariant = String(variantName || '')
    .trim()
    .toLowerCase();
  if (!normalizedName) return '';
  if (
    !normalizedVariant ||
    normalizedVariant === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME
  )
    return normalizedName;
  return `${normalizedName}\x1e${normalizedVariant}`;
}

function mergeShoppingListAssignmentCandidates(...candidateLists) {
  const merged = [];
  const seen = new Map();
  candidateLists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const storeId = Math.trunc(Number(candidate.storeId));
      const aisleId = Math.trunc(Number(candidate.aisleId));
      const aisleLabel = String(candidate.aisleLabel || '').trim();
      const dedupeKey =
        Number.isFinite(storeId) &&
        storeId > 0 &&
        Number.isFinite(aisleId) &&
        aisleId > 0
          ? `${storeId}:${aisleId}`
          : `${storeId}:${aisleId}:${aisleLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        const existingIndex = seen.get(dedupeKey);
        const existingCandidate = merged[existingIndex];
        if (
          compareShoppingListAssignmentCandidates(
            candidate,
            existingCandidate,
          ) < 0
        ) {
          merged[existingIndex] = candidate;
        }
        return;
      }
      seen.set(dedupeKey, merged.length);
      merged.push(candidate);
    });
  });
  return merged;
}

function buildOrderedVariantAssignmentCandidates(
  name,
  { variantAssignmentMap = null, variantOrderMap = null } = {},
) {
  const hasGetter = (value) => !!value && typeof value.get === 'function';
  const nameKey = String(name || '')
    .trim()
    .toLowerCase();
  if (
    !nameKey ||
    !hasGetter(variantAssignmentMap) ||
    !hasGetter(variantOrderMap)
  ) {
    return [];
  }
  const orderedVariants = Array.isArray(variantOrderMap.get(nameKey))
    ? variantOrderMap.get(nameKey)
    : [];
  if (!orderedVariants.length) return [];
  const rankedCandidates = [];
  orderedVariants.forEach((variantName, variantRank) => {
    const assignmentKey = getShoppingListVariantAssignmentKey(
      nameKey,
      variantName,
    );
    if (!assignmentKey) return;
    const variantCandidates = variantAssignmentMap.get(assignmentKey) || [];
    variantCandidates.forEach((candidate) => {
      rankedCandidates.push({
        ...candidate,
        variantRank,
      });
    });
  });
  return mergeShoppingListAssignmentCandidates(rankedCandidates);
}

function shoppingListAssignmentCandidatesAtStore(candidates, storeId) {
  const normalizedStoreId = Math.trunc(Number(storeId));
  if (!Number.isFinite(normalizedStoreId) || normalizedStoreId <= 0) return [];
  return (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => Math.trunc(Number(candidate?.storeId)) === normalizedStoreId,
  );
}

function listShoppingListPlausibleUnknownStoreIds(
  row,
  {
    baseAssignmentMap = null,
    variantAssignmentMap = null,
    variantOrderMap = null,
    selectedStoreIds = null,
  } = {},
) {
  const hasGetter = (value) => !!value && typeof value.get === 'function';
  const nameKey = String(row?.name || '')
    .trim()
    .toLowerCase();
  if (!nameKey) return [];
  const variantName = String(row?.variantName || '').trim();
  const isBasePlanRow = isShoppingListBasePlanVariantName(variantName);
  const storeIds = (Array.isArray(selectedStoreIds) ? selectedStoreIds : [])
    .map((rawId) => Math.trunc(Number(rawId)))
    .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
  if (!storeIds.length) return [];

  if (isBasePlanRow) {
    if (!hasGetter(variantAssignmentMap) || !hasGetter(variantOrderMap)) return [];
    const orderedVariants = Array.isArray(variantOrderMap.get(nameKey))
      ? variantOrderMap.get(nameKey)
      : [];
    return storeIds.filter((storeId) =>
      orderedVariants.some((variantKey) => {
        const assignmentKey = getShoppingListVariantAssignmentKey(
          nameKey,
          variantKey,
        );
        if (!assignmentKey) return false;
        return (
          shoppingListAssignmentCandidatesAtStore(
            variantAssignmentMap.get(assignmentKey) || [],
            storeId,
          ).length > 0
        );
      }),
    );
  }

  if (!hasGetter(baseAssignmentMap)) return [];
  const baseCandidates = baseAssignmentMap.get(nameKey) || [];
  return storeIds.filter(
    (storeId) =>
      shoppingListAssignmentCandidatesAtStore(baseCandidates, storeId).length >
      0,
  );
}

function getShoppingListAssignmentCandidates(
  row,
  {
    baseAssignmentMap = null,
    variantAssignmentMap = null,
    allVariantsAssignmentMap = null,
    variantOrderMap = null,
    selectedStoreIds = null,
  } = {},
) {
  const hasGetter = (value) => !!value && typeof value.get === 'function';
  const nameKey = String(row?.name || '')
    .trim()
    .toLowerCase();
  const variantName = String(row?.variantName || '').trim();
  const isBasePlanRow = isShoppingListBasePlanVariantName(variantName);
  if (!isBasePlanRow) {
    const variantAssignmentKey = getShoppingListVariantAssignmentKey(
      row.name,
      variantName,
    );
    const exactVariantCandidates =
      variantAssignmentKey && hasGetter(variantAssignmentMap)
        ? variantAssignmentMap.get(variantAssignmentKey) || []
        : [];
    if (exactVariantCandidates.length) return exactVariantCandidates;
    const allVariantCandidates =
      nameKey && hasGetter(allVariantsAssignmentMap)
        ? allVariantsAssignmentMap.get(nameKey) || []
        : [];
    if (allVariantCandidates.length) return allVariantCandidates;
    const plausibleStoreIds = listShoppingListPlausibleUnknownStoreIds(row, {
      baseAssignmentMap,
      variantAssignmentMap,
      variantOrderMap,
      selectedStoreIds,
    });
    if (plausibleStoreIds.length) {
      return buildShoppingListUnknownAisleCandidates(plausibleStoreIds);
    }
    return [];
  }
  const baseCandidates =
    nameKey && hasGetter(baseAssignmentMap)
      ? baseAssignmentMap.get(nameKey) || []
      : [];
  if (isBasePlanRow) {
    if (baseCandidates.length) return baseCandidates;
    const plausibleStoreIds = listShoppingListPlausibleUnknownStoreIds(row, {
      baseAssignmentMap,
      variantAssignmentMap,
      variantOrderMap,
      selectedStoreIds,
    });
    if (plausibleStoreIds.length) {
      return buildShoppingListUnknownAisleCandidates(plausibleStoreIds);
    }
    return [];
  }
  return [];
}

function buildGroupedShoppingListRows(items, options = {}) {
  const itemList = Array.isArray(items) ? items : [];
  const selectedStores = Array.isArray(options?.selectedStores)
    ? options.selectedStores
    : [];
  const unlistedLabel =
    String(options?.unlistedLabel || 'UNLISTED').trim() || 'UNLISTED';
  const storeIdsInOrder = selectedStores
    .map((store) => Math.trunc(Number(store?.id)))
    .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
  const storeGroups = new Map(
    storeIdsInOrder.map((storeId) => [
      storeId,
      {
        aisles: new Map(),
      },
    ]),
  );
  const unlistedItems = [];

  itemList.forEach((item) => {
    if (!item || String(item.text || '').trim() === '') return;
    const chosenAssignment = chooseShoppingListAssignment(
      item.assignmentCandidates,
      storeIdsInOrder,
    );
    if (!chosenAssignment) {
      unlistedItems.push(item);
      return;
    }
    const storeId = Math.trunc(Number(chosenAssignment.storeId));
    const aisleId = Math.trunc(Number(chosenAssignment.aisleId));
    const storeGroup = storeGroups.get(storeId);
    const unknownAisle = isShoppingListUnknownAisleId(aisleId);
    if (
      !storeGroup ||
      !Number.isFinite(aisleId) ||
      (!unknownAisle && aisleId <= 0)
    ) {
      unlistedItems.push(item);
      return;
    }
    const incomingSort = Number.isFinite(
      Number(chosenAssignment.aisleSortOrder),
    )
      ? Number(chosenAssignment.aisleSortOrder)
      : 999999;
    if (!storeGroup.aisles.has(aisleId)) {
      storeGroup.aisles.set(aisleId, {
        aisleId,
        aisleLabel: unknownAisle
          ? SHOPPING_LIST_UNKNOWN_AISLE_LABEL
          : String(chosenAssignment.aisleLabel || '').trim() ||
            `Aisle ${aisleId}`,
        aisleSortOrder: incomingSort,
        items: [],
      });
    } else {
      const bucket = storeGroup.aisles.get(aisleId);
      const curSort = bucket.aisleSortOrder;
      const curPlaceholder = !Number.isFinite(curSort) || curSort >= 999999;
      const incomingPlaceholder =
        !Number.isFinite(incomingSort) || incomingSort >= 999999;
      const preferIncoming =
        incomingSort < curSort || (curPlaceholder && !incomingPlaceholder);
      if (preferIncoming) {
        bucket.aisleSortOrder = incomingSort;
        bucket.aisleLabel = unknownAisle
          ? SHOPPING_LIST_UNKNOWN_AISLE_LABEL
          : String(chosenAssignment.aisleLabel || '').trim() ||
            `Aisle ${aisleId}`;
      }
    }
    storeGroup.aisles.get(aisleId).items.push(item);
  });

  const compareItems = (a, b) =>
    String(a?.label || '').localeCompare(String(b?.label || ''), undefined, {
      sensitivity: 'base',
    });

  const rows = [];
  selectedStores.forEach((store) => {
    const storeId = Math.trunc(Number(store?.id));
    const storeGroup = storeGroups.get(storeId);
    if (!storeGroup || !storeGroup.aisles.size) return;
    const aisles = Array.from(storeGroup.aisles.values())
      .filter((aisle) => Array.isArray(aisle.items) && aisle.items.length > 0)
      .sort((a, b) => compareShoppingListAssignmentCandidates(a, b));
    if (!aisles.length) return;
    rows.push({
      key: `section:store:${storeId}`,
      rowType: 'section',
      sectionKind: 'store',
      storeId,
      text: String(store?.label || '').trim() || `Store ${storeId}`,
      className: 'shopping-list-section shopping-list-section--store',
    });
    aisles.forEach((aisle) => {
      rows.push({
        key: `section:aisle:${storeId}:${aisle.aisleId}`,
        rowType: 'section',
        sectionKind: 'aisle',
        storeId,
        aisleId: aisle.aisleId,
        aisleSortOrder: aisle.aisleSortOrder,
        text: aisle.aisleLabel,
        className: 'shopping-list-section shopping-list-section--aisle',
      });
      aisle.items.sort(compareItems).forEach((item) => {
        rows.push({
          ...item,
          rowType: 'item',
          className: 'shopping-list-group-item',
        });
      });
    });
  });

  if (unlistedItems.length) {
    rows.push({
      key: 'section:unlisted',
      rowType: 'section',
      sectionKind: 'unlisted',
      text: unlistedLabel,
      className: 'shopping-list-section shopping-list-section--unlisted',
    });
    unlistedItems.sort(compareItems).forEach((item) => {
      rows.push({
        ...item,
        rowType: 'item',
        className: 'shopping-list-group-item',
      });
    });
  }

  return rows;
}

if (typeof window !== 'undefined') {
  window.__shoppingListGroupingHelpers = {
    orderShoppingListSelectedStoreIds,
    compareShoppingListAssignmentCandidates,
    chooseShoppingListAssignment,
    getShoppingListVariantAssignmentKey,
    mergeShoppingListAssignmentCandidates,
    buildOrderedVariantAssignmentCandidates,
    buildShoppingListUnknownAisleCandidates,
    isShoppingListBasePlanVariantName,
    getShoppingListAssignmentCandidates,
    buildGroupedShoppingListRows,
    SHOPPING_LIST_UNKNOWN_AISLE_ID,
    SHOPPING_LIST_UNKNOWN_AISLE_LABEL,
  };
}
// --- End shopping list grouping helpers ---

function ingredientScopedVariantIsDeprecated() {
  return false;
}

async function ingredientScopedVariantIsDeprecatedViaDataService({
  ingredientName = '',
  variantText = '',
} = {}) {
  if (
    window.dataService &&
    typeof window.dataService.isIngredientVariantDeprecated === 'function'
  ) {
    try {
      return await window.dataService.isIngredientVariantDeprecated({
        ingredientName,
        variantText,
      });
    } catch (err) {
      console.error('dataService.isIngredientVariantDeprecated failed:', err);
    }
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.ingredientScopedVariantIsDeprecated =
    ingredientScopedVariantIsDeprecated;
}

/** Offline catalog: omit recipe-sourced shopping rows when every matching ingredient row is hidden or removed (aligns with listShoppingItems aggregation). */
function isSqliteCatalogIngredientExcludedFromShoppingList(db, rawName) {
  if (!db || typeof db.exec !== 'function') return false;
  const name = String(rawName || '').trim();
  if (!name) return false;
  try {
    const esc = name.replace(/'/g, "''");
    const result = db.exec(
      `SELECT is_hidden, is_deprecated, hide_from_shopping_list FROM ingredients WHERE lower(trim(name)) = lower('${esc}')`,
    );
    const batch = Array.isArray(result) ? result[0] : null;
    const rows = batch?.values;
    if (!Array.isArray(rows) || !rows.length) return false;
    let allHidden = true;
    let allRemoved = true;
    rows.forEach((row) => {
      const isHidden = Number(row[0] ?? 0) === 1;
      const isDeprecated = Number(row[1] ?? 0) === 1;
      const hideFromShopping = Number(row[2] ?? 0) === 1;
      if (!isHidden) allHidden = false;
      if (!isDeprecated && !hideFromShopping) allRemoved = false;
    });
    return allHidden || allRemoved;
  } catch (_) {
    return false;
  }
}

function getShoppingPlanSelectionRows(options = {}) {
  const db = options?.db || window.dbInstance;
  const visibleNameKeys =
    !favoriteEatsShouldUseSupabaseDataDoor() && db
      ? new Set(
          getVisibleIngredientNamePool(db).map((name) =>
            String(name || '')
              .trim()
              .toLowerCase(),
          ),
        )
      : null;
  const aggregate = new Map();
  const ensureRow = ({
    name = '',
    variantName = '',
    allowInvisible = false,
  } = {}) => {
    const resolvedName = String(name || '').trim();
    const resolvedVariantName = String(variantName || '').trim();
    if (!resolvedName) return null;
    const key = getShoppingPlanAggregateKey(resolvedName, resolvedVariantName);
    if (!key) return null;
    const nameKey = resolvedName.toLowerCase();
    if (
      !allowInvisible &&
      visibleNameKeys instanceof Set &&
      !visibleNameKeys.has(nameKey)
    ) {
      return null;
    }
    if (!aggregate.has(key)) {
      aggregate.set(key, {
        key,
        name: resolvedName,
        variantName: resolvedVariantName,
        useMetric: false,
        label: getShoppingListIngredientLabel(
          resolvedName,
          resolvedVariantName,
        ),
        buckets: new Map(),
        bucketOrder: [],
        contributionSources: new Map(),
        contributionSourceOrder: [],
      });
    }
    const row = aggregate.get(key);
    return row;
  };
  const noteRowUseMetric = (row, lineOrFlag) => {
    if (!row) return;
    const flag =
      typeof lineOrFlag === 'boolean'
        ? lineOrFlag
        : !!(lineOrFlag && (lineOrFlag.useMetric ?? lineOrFlag.use_metric));
    if (flag) row.useMetric = true;
  };
  const addBucketToTarget = (target, bucket) => {
    if (!target || !bucket || typeof bucket !== 'object') return;
    const bucketKey = String(bucket.key || '').trim();
    if (!bucketKey) return;
    if (!target.buckets.has(bucketKey)) {
      target.bucketOrder.push(bucketKey);
      target.buckets.set(bucketKey, { ...bucket });
      return;
    }
    const existing = target.buckets.get(bucketKey);
    if (!existing) return;
    if (bucket.kind === 'measured') {
      existing.baseQuantity = Number(
        (
          Number(existing.baseQuantity || 0) + Number(bucket.baseQuantity || 0)
        ).toFixed(6),
      );
      return;
    }
    existing.quantity = Number(
      (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(
        4,
      ),
    );
  };
  const ensureContributionSource = (row, source = {}) => {
    if (!row || typeof row !== 'object') return null;
    const sourceType = String(source.sourceType || '').trim() || 'recipe';
    const sourceKey =
      sourceType === 'manual'
        ? 'manual:selected'
        : `recipe:${Math.trunc(Number(source.recipeId || 0))}`;
    if (!sourceKey) return null;
    if (!row.contributionSources.has(sourceKey)) {
      row.contributionSourceOrder.push(sourceKey);
      row.contributionSources.set(sourceKey, {
        sourceType,
        sourceKey,
        recipeId:
          sourceType === 'recipe' && Number.isFinite(Number(source.recipeId))
            ? Math.trunc(Number(source.recipeId))
            : null,
        title: String(source.title || '').trim(),
        buckets: new Map(),
        bucketOrder: [],
      });
    }
    return row.contributionSources.get(sourceKey) || null;
  };
  const getContributionSortValue = (buckets) =>
    (Array.isArray(buckets) ? buckets : []).reduce((sum, bucket) => {
      if (bucket?.kind === 'measured') {
        return sum + Math.max(0, Number(bucket.baseQuantity || 0));
      }
      return sum + Math.max(0, Number(bucket?.quantity || 0));
    }, 0);
  const addSelectedItemBucket = (entry) => {
    const name = String(entry?.name || '').trim();
    const variantName = String(entry?.variantName || '').trim();
    const quantityUnspecified = entry?.quantityUnspecified === true;
    const quantity = Number(entry?.quantity || 0);
    if (!name) return;
    if (
      !quantityUnspecified &&
      (!Number.isFinite(quantity) || quantity <= 1e-9)
    ) {
      return;
    }
    const row = ensureRow({ name, variantName });
    if (!row) return;
    const bucket = quantityUnspecified
      ? { key: 'unspecified', kind: 'unspecified', quantity: 1 }
      : {
          key: 'selected',
          kind: 'selected',
          quantity,
        };
    addBucketToTarget(row, bucket);
    const source = ensureContributionSource(row, {
      sourceType: 'manual',
      title: 'Directly added',
    });
    addBucketToTarget(source, bucket);
  };
  const addRecipeIngredientBucket = (
    line,
    {
      recipeId = null,
      recipeTitle = '',
      recipeCount = 0,
      servingsMultiplier = 1,
    } = {},
  ) => {
    if (!line || typeof line !== 'object') return;
    if (line.rowType === 'heading' || line.isRecipe) return;
    const name = String(line.name || '').trim();
    if (!name) return;
    const variantName = String(line.variant || '').trim();
    if (
      !favoriteEatsShouldUseSupabaseDataDoor() &&
      isSqliteCatalogIngredientExcludedFromShoppingList(db, name)
    ) {
      return;
    }
    // Recipe lines bypass visibleNameKeys so OR/alt flows keep working; hidden/removed still drop via
    // listShoppingListPlanRows (Supabase) or isSqliteCatalogIngredientExcludedFromShoppingList.
    const row = ensureRow({ name, variantName, allowInvisible: true });
    if (!row) return;
    noteRowUseMetric(row, line);
    const recipeMultiplier = Number(recipeCount);
    if (!Number.isFinite(recipeMultiplier) || recipeMultiplier <= 0) return;
    const source = ensureContributionSource(row, {
      sourceType: 'recipe',
      recipeId,
      title: recipeTitle,
    });

    const ingredientCount = getRecipeIngredientShoppingCount(line);
    if (!Number.isFinite(ingredientCount) || ingredientCount <= 0) {
      const bucket = {
        key: 'unspecified',
        kind: 'unspecified',
        quantity: recipeMultiplier,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    const scaledPerRecipeQuantityRaw = ingredientCount * servingsMultiplier;
    const scaledPerRecipeQuantity =
      Math.abs(servingsMultiplier - 1) > 1e-9 &&
      typeof window.normalizeActionableQuantity === 'function'
        ? Number(
            window.normalizeActionableQuantity(
              scaledPerRecipeQuantityRaw,
              line.unit || '',
            ),
          )
        : Number(scaledPerRecipeQuantityRaw.toFixed(4));
    if (
      !Number.isFinite(scaledPerRecipeQuantity) ||
      scaledPerRecipeQuantity <= 0
    )
      return;

    const nextQuantity = Number(
      (scaledPerRecipeQuantity * recipeMultiplier).toFixed(4),
    );
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return;

    const normalizedUnit = normalizeShoppingListUnit(line.unit || '');
    const size = String(line.size || '').trim();
    const measured = convertShoppingListQuantityToMeasuredBase(
      nextQuantity,
      normalizedUnit,
    );
    if (measured) {
      const bucket = {
        key: `measured:${measured.unit}`,
        kind: 'measured',
        unit: measured.unit,
        family: measured.family,
        baseUnit: measured.baseUnit,
        baseQuantity: measured.baseQuantity,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    if (normalizedUnit || size) {
      const bucket = {
        key: `exact:${normalizedUnit}|${size.toLowerCase()}`,
        kind: 'exact',
        quantity: nextQuantity,
        unit: normalizedUnit,
        size,
      };
      addBucketToTarget(row, bucket);
      addBucketToTarget(source, bucket);
      return;
    }

    const bucket = {
      key: 'count',
      kind: 'count',
      quantity: nextQuantity,
      unit: '',
      size: '',
    };
    addBucketToTarget(row, bucket);
    addBucketToTarget(source, bucket);
  };

  Object.values(getShoppingPlanItemSelections()).forEach(addSelectedItemBucket);

  if (
    !favoriteEatsShouldUseSupabaseDataDoor() &&
    db &&
    window.bridge &&
    typeof window.bridge.loadRecipeFromDB === 'function'
  ) {
    const mergedPlanRecipeIds = buildMergedShoppingPlanRecipeIdSet(
      getShoppingPlanRecipeSelections(),
    );
    Object.values(getShoppingPlanRecipeSelections()).forEach((selection) => {
      const recipeId = Number(selection?.recipeId);
      const recipeCount = Number(selection?.quantity || 0);
      if (!Number.isFinite(recipeId) || recipeId <= 0) return;
      if (!Number.isFinite(recipeCount) || recipeCount <= 0) return;

      const recipe = loadShoppingPlanRecipeFromDB(db, recipeId);
      if (!recipe || !Array.isArray(recipe.sections)) return;

      walkExpandedShoppingPlanIngredientLines(
        db,
        recipe,
        {
          recipeId,
          recipeTitle: String(recipe?.title || '').trim(),
          outerRecipeMultiplier: recipeCount,
          linkDepth: Math.max(
            0,
            Math.min(
              SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH,
              Math.trunc(Number(selection?.inboundLinkDepth) || 0),
            ),
          ),
          skipInlineLinkedRecipeIds: mergedPlanRecipeIds,
        },
        addRecipeIngredientBucket,
      );
    });
  }

  const rows = Array.from(aggregate.values())
    .map((row) => {
      const buckets = row.bucketOrder
        .map((bucketKey) => row.buckets.get(bucketKey))
        .filter(Boolean)
        .filter((bucket) => {
          if (bucket.kind === 'measured') {
            return Number(bucket.baseQuantity || 0) > 1e-9;
          }
          return Number(bucket.quantity || 0) > 1e-9;
        });
      const variantIsDeprecated =
        !!row.variantName &&
        ingredientScopedVariantIsDeprecated(db, row.name, row.variantName);
      const serializedBuckets = buckets.map((bucket) => ({ ...bucket }));
      return {
        key: row.key,
        name: row.name,
        variantName: row.variantName,
        variantIsDeprecated,
        label: row.label,
        buckets: serializedBuckets,
        detailText: formatShoppingListDisplayDetailText({
          variantName: row.variantName,
          buckets,
          useMetric: !!row.useMetric,
        }),
        text: formatShoppingListDisplayRow({
          label: row.label,
          name: row.name,
          variantName: row.variantName,
          buckets,
          useMetric: !!row.useMetric,
        }),
        contributionRows: row.contributionSourceOrder
          .map((sourceKey) => row.contributionSources.get(sourceKey))
          .filter(Boolean)
          .map((source) => {
            const sourceBuckets = source.bucketOrder
              .map((bucketKey) => source.buckets.get(bucketKey))
              .filter(Boolean)
              .filter((bucket) => {
                if (bucket.kind === 'measured') {
                  return Number(bucket.baseQuantity || 0) > 1e-9;
                }
                return Number(bucket.quantity || 0) > 1e-9;
              });
            const detailText = formatShoppingListDisplayDetailText({
              variantName: row.variantName,
              buckets: sourceBuckets,
              useMetric: !!row.useMetric,
            });
            if (!detailText) return null;
            return {
              sourceType: source.sourceType,
              sourceKey: source.sourceKey,
              recipeId: source.recipeId,
              title:
                String(source.title || '').trim() ||
                (source.sourceType === 'manual' ? 'Directly added' : 'Recipe'),
              detailText,
              sortValue: getContributionSortValue(sourceBuckets),
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (a.sourceType !== b.sourceType) {
              return a.sourceType === 'recipe' ? -1 : 1;
            }
            const sortDelta =
              Number(b.sortValue || 0) - Number(a.sortValue || 0);
            if (Math.abs(sortDelta) > 1e-9) return sortDelta;
            return String(a.title || '').localeCompare(
              String(b.title || ''),
              undefined,
              {
                sensitivity: 'base',
              },
            );
          }),
      };
    })
    .filter((entry) => String(entry.text || '').trim());

  if (options?.ungroupedOnly) return rows;

  /** @type {{ id: number, label: string }[]} */
  let selectedStores = [];
  const baseAssignmentMap = new Map();
  const variantAssignmentMap = new Map();
  const variantAnyAssignmentMap = new Map();
  const variantOrderMap = new Map();

  const groupedInputRows = rows.map((row) => {
    return {
      ...row,
      assignmentCandidates: getShoppingListAssignmentCandidates(row, {
        baseAssignmentMap,
        variantAssignmentMap,
        variantAnyAssignmentMap,
        variantOrderMap,
      }),
    };
  });

  return buildGroupedShoppingListRows(groupedInputRows, {
    selectedStores,
    unlistedLabel: 'UNLISTED',
  });
}

async function getShoppingPlanSelectionRowsViaDataService(options = {}) {
  const db = options?.db || window.dbInstance;
  const useDataDoor =
    favoriteEatsShouldUseSupabaseDataDoor() && window.dataService;
  if (useDataDoor) {
    window.dataService.useSupabase = true;
  }
  const getUngroupedRowsFallback = () =>
    getShoppingPlanSelectionRows({ db, ungroupedOnly: true });
  let rows = [];
  if (
    window.dataService &&
    typeof window.dataService.listShoppingListPlanRows === 'function'
  ) {
    try {
      const selectedRecipes = Object.values(
        getShoppingPlanRecipeSelections(),
      ).map((entry) => {
        const recipeId = Number(entry?.recipeId);
        return {
          ...entry,
          servings: getRecipePlannerServingsStoredValue(recipeId),
        };
      });
      rows = await window.dataService.listShoppingListPlanRows({
        selectedItems: Object.values(getShoppingPlanItemSelections()),
        selectedRecipes,
      });
      rows = (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        variantIsDeprecated:
          row?.variantIsDeprecated != null
            ? !!row.variantIsDeprecated
            : !!row?.variantIsRemoved,
      }));
    } catch (err) {
      if (useDataDoor) throw err;
      console.error('dataService.listShoppingListPlanRows failed:', err);
      rows = getUngroupedRowsFallback();
    }
  } else {
    if (useDataDoor) {
      throw new Error('dataService.listShoppingListPlanRows is not available.');
    }
    rows = getUngroupedRowsFallback();
  }
  if (
    !window.dataService ||
    typeof window.dataService.listShoppingListAssignments !== 'function'
  ) {
    if (useDataDoor) {
      throw new Error(
        'dataService.listShoppingListAssignments is not available.',
      );
    }
    return getShoppingPlanSelectionRows({ db });
  }
  try {
    const assignmentStoreOrder =
      await resolveAssignmentStoreOrderForDataService();
    const assignmentData = await window.dataService.listShoppingListAssignments(
      {
        storeOrder: assignmentStoreOrder,
        selectedStoreIds: getShoppingPlanSelectedStoreIds(),
        items: rows.map((row) => ({
          key: row.key,
          name: row.name,
          variantName: row.variantName,
          ingredientId: row.ingredientId,
        })),
      },
    );
    const assignmentsByKey =
      assignmentData && typeof assignmentData.assignmentsByKey === 'object'
        ? assignmentData.assignmentsByKey
        : {};
    const groupedInputRows = rows.map((row) => ({
      ...row,
      assignmentCandidates: Array.isArray(assignmentsByKey[row.key])
        ? assignmentsByKey[row.key]
        : [],
    }));
    return buildGroupedShoppingListRows(groupedInputRows, {
      selectedStores: Array.isArray(assignmentData?.selectedStores)
        ? assignmentData.selectedStores
        : [],
      unlistedLabel: 'UNLISTED',
    });
  } catch (err) {
    if (useDataDoor) throw err;
    console.error('dataService.listShoppingListAssignments failed:', err);
    return getShoppingPlanSelectionRows({ db });
  }
}

function detectPageIdFromBody() {
  const body = document.body;
  if (!body) return null;
  return (
    body.dataset.page ||
    (body.classList.contains('recipes-page')
      ? 'recipes'
      : body.classList.contains('recipe-editor-page')
        ? 'recipe-editor'
        : body.classList.contains('shopping-page')
          ? 'shopping'
          : body.classList.contains('shopping-list-page')
            ? 'shopping-list'
            : body.classList.contains('shopping-editor-page')
              ? 'shopping-editor'
              : body.classList.contains('units-page')
                ? 'units'
                : body.classList.contains('unit-editor-page')
                  ? 'unit-editor'
                  : body.classList.contains('sizes-page')
                    ? 'sizes'
                    : body.classList.contains('size-editor-page')
                      ? 'size-editor'
                      : body.classList.contains('tags-page')
                        ? 'tags'
                        : body.classList.contains('tag-editor-page')
                          ? 'tag-editor'
                          : body.classList.contains('stores-page')
                            ? 'stores'
                            : body.classList.contains('store-editor-page')
                              ? 'store-editor'
                              : null)
  );
}

function shouldDeferSqlBootForCurrentPage() {
  const pageId = detectPageIdFromBody();
  return pageId === 'welcome' || pageId === 'web-db-error';
}

function markCurrentPageAsLastVisited() {
  try {
    const current = detectPageIdFromBody();
    if (!current) return;
    sessionStorage.setItem(
      LAST_PAGE_SESSION_KEY,
      String(current).toLowerCase(),
    );
  } catch (_) {}
}

// Track previous page id across full page navigations.
markCurrentPageAsLastVisited();

function enableTopLevelListKeyboardNav(listEl, options = {}) {
  if (!(listEl instanceof Element)) return null;
  const requireExistingSelectionForArrows =
    !!options.requireExistingSelectionForArrows;
  const disableArrowNavigation = !!options.disableArrowNavigation;
  const disableEnterActivation = !!options.disableEnterActivation;
  const disableHoverSelection = !!options.disableHoverSelection;
  const toggleSelectionOnClick = !!options.toggleSelectionOnClick;
  const clearSelectionOnOutsidePointerDown =
    !!options.clearSelectionOnOutsidePointerDown;
  const clearSelectionOnOutsideFocus = !!options.clearSelectionOnOutsideFocus;
  const clearSelectionOnWindowBlur = !!options.clearSelectionOnWindowBlur;
  const clearSelectionOnEscape = !!options.clearSelectionOnEscape;
  const excludeRow =
    typeof options.excludeRow === 'function' ? options.excludeRow : null;

  // Marks this list so CSS can avoid showing a second "hover highlight"
  // when keyboard selection moves off the hovered row.
  listEl.classList.add('top-level-kbd-nav');

  // Start with *no* selection. Hover or enabled keyboard nav can select.
  let selectedIdx = -1;
  let selectionSource = null; // 'hover' | 'keyboard' | null

  const getRows = () =>
    Array.from(listEl.querySelectorAll('li')).filter((li) => {
      if (li.classList.contains('recipe-list-servings-header')) return false;
      if (excludeRow && excludeRow(li)) return false;
      return true;
    });

  const applySelection = () => {
    const rows = getRows();
    if (rows.length === 0) return;

    if (selectedIdx == null) selectedIdx = -1;
    if (selectedIdx >= rows.length) selectedIdx = rows.length - 1;

    rows.forEach((li, i) =>
      li.classList.toggle('is-selected', i === selectedIdx),
    );
    if (selectedIdx >= 0) {
      rows[selectedIdx]?.scrollIntoView?.({ block: 'nearest' });
    }
  };

  const applySelectedIdx = (idx) => {
    selectedIdx = idx;
    applySelection();
  };

  const clearSelection = () => {
    selectionSource = null;
    applySelectedIdx(-1);
  };

  // Hover should not be a competing highlight; it should *move selection*.
  listEl.addEventListener('mouseover', (e) => {
    if (disableHoverSelection) return;
    const li = e.target?.closest?.('li');
    if (!li || !listEl.contains(li)) return;
    const rows = getRows();
    const idx = rows.indexOf(li);
    if (idx >= 0) {
      selectionSource = 'hover';
      applySelectedIdx(idx);
    }
  });

  // If the mouse is not over a hover target (li), clear hover-driven selection.
  const clearHoverSelectionIfNeeded = (e) => {
    if (disableHoverSelection) return;
    if (selectionSource !== 'hover') return;
    const li = e?.target?.closest?.('li');
    if (li && listEl.contains(li)) return;
    selectionSource = null;
    applySelectedIdx(-1);
  };

  // When moving over blank space inside the list, clear the highlight.
  listEl.addEventListener('mousemove', clearHoverSelectionIfNeeded);
  // When leaving the list entirely, clear the highlight.
  listEl.addEventListener('mouseleave', clearHoverSelectionIfNeeded);

  // Click should also update selection (keeps state coherent after mouse use).
  listEl.addEventListener('click', (e) => {
    const li = e.target?.closest?.('li');
    if (!li || !listEl.contains(li)) return;
    const rows = getRows();
    const idx = rows.indexOf(li);
    if (idx >= 0) {
      if (toggleSelectionOnClick && idx === selectedIdx) {
        clearSelection();
        return;
      }
      // Treat click as a "committed" selection so it doesn't get cleared on mouseout.
      selectionSource = 'keyboard';
      applySelectedIdx(idx);
    }
  });

  if (clearSelectionOnOutsidePointerDown) {
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (selectedIdx < 0) return;
        const targetRow = e.target?.closest?.('li');
        if (targetRow && listEl.contains(targetRow)) return;
        clearSelection();
      },
      { capture: true },
    );
  }

  if (clearSelectionOnOutsideFocus) {
    document.addEventListener(
      'focusin',
      (e) => {
        if (selectedIdx < 0) return;
        if (e.target instanceof Node && listEl.contains(e.target)) return;
        clearSelection();
      },
      { capture: true },
    );
  }

  if (clearSelectionOnWindowBlur) {
    window.addEventListener('blur', () => {
      if (selectedIdx < 0) return;
      clearSelection();
    });
  }

  document.addEventListener(
    'keydown',
    (e) => {
      // Only plain keys; don't steal Cmd/Ctrl/Alt/Shift combos
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.isComposing) return;
      if (isTypingContext(e.target)) return;
      if (isModalOpen()) return;
      if (document.activeElement?.closest?.('.bottom-nav')) return;

      const rows = getRows();
      if (rows.length === 0) return;

      if (e.key === 'Escape') {
        if (!clearSelectionOnEscape || selectedIdx < 0) return;
        e.preventDefault();
        clearSelection();
        return;
      }

      if (disableArrowNavigation) return;

      if (e.key === 'ArrowDown') {
        if (selectedIdx < 0 && requireExistingSelectionForArrows) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        // If nothing selected yet, Down selects the first row.
        if (selectedIdx < 0) {
          selectionSource = 'keyboard';
          applySelectedIdx(0);
          return;
        }
        selectionSource = 'keyboard';
        applySelectedIdx(Math.min(selectedIdx + 1, rows.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        if (selectedIdx < 0 && requireExistingSelectionForArrows) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        // If nothing selected yet, Up selects the last row.
        if (selectedIdx < 0) {
          selectionSource = 'keyboard';
          applySelectedIdx(rows.length - 1);
          return;
        }
        selectionSource = 'keyboard';
        applySelectedIdx(Math.max(selectedIdx - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        if (disableEnterActivation) {
          if (selectedIdx >= 0) e.preventDefault();
          return;
        }
        if (selectedIdx < 0) return;
        e.preventDefault();
        rows[selectedIdx]?.click?.();
      }
    },
    { capture: true },
  );

  // Initial paint
  applySelection();

  return {
    syncAfterRender() {
      applySelection();
    },
    getSelectedIdx() {
      return selectedIdx;
    },
    setSelectedIdx(idx, options = {}) {
      selectionSource =
        options?.source === 'hover'
          ? 'hover'
          : options?.source === null
            ? null
            : 'keyboard';
      applySelectedIdx(idx);
    },
    resetToTop() {
      selectedIdx = -1;
      applySelection();
    },
  };
}

function bootFavoriteEatsApp() {
  // --- page load routing ---

  if (redirectIfPublicWebPageIsDisallowed()) return;

  try {
    if (
      typeof window.favoriteEatsApplyMonikerToastArmPolicyOnNavigation ===
      'function'
    ) {
      window.favoriteEatsApplyMonikerToastArmPolicyOnNavigation();
    }
  } catch (_) {}

  const pageId = detectPageIdFromBody();
  if (
    favoriteEatsShouldRequireSessionGateForPage(pageId) &&
    !favoriteEatsHasSessionLoginGate()
  ) {
    window.location.replace('index.html');
    return;
  }

  // --- Cmd/Ctrl+S: invoke visible editor Save action ---
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (String(e.key || '').toLowerCase() !== 's') return;

      const saveBtn = document.getElementById('appBarSaveBtn');
      if (!(saveBtn instanceof HTMLButtonElement)) return;
      if (saveBtn.disabled) return;

      const styles = window.getComputedStyle(saveBtn);
      if (styles.display === 'none' || styles.visibility === 'hidden') return;

      e.preventDefault();
      e.stopPropagation();
      saveBtn.click();
    },
    { capture: true },
  );

  // --- Cmd/Ctrl+Z: invoke pending undo-toast action (works after toast auto-dismisses) ---
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (String(e.key || '').toLowerCase() !== 'z') return;
      if (isTypingContext(e.target)) return;

      const um = window.undoManager;
      if (!um || typeof um.invokePending !== 'function') return;
      if (!um.invokePending()) return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );

  // --- Cmd+← / Cmd+→ / Cmd+↑ / Cmd+↓: move between top-level pages ---
  document.addEventListener(
    'keydown',
    async (e) => {
      // Cmd only (avoid stealing Ctrl/Alt/Shift combos)
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.isComposing) return;

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
        return;
      if (isTypingContext(e.target) && !isAppBarSearchContext(e.target)) return;
      const topLevelPages = getTopLevelPageOrder();
      const idx = topLevelPages.indexOf(pageId);
      if (idx === -1) return; // only act on top-level list pages

      // Stores: Cmd+↑/↓ reorders when a row has keyboard selection (red), not tab switching.
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        typeof consumeCmdVerticalArrowBeforeTopLevelNav === 'function'
      ) {
        try {
          if (consumeCmdVerticalArrowBeforeTopLevelNav(e)) return;
        } catch (_) {}
      }

      // Treat Up like Left, and Down like Right.
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx =
        (idx + delta + topLevelPages.length) % topLevelPages.length;

      e.preventDefault();
      if (
        pageId === 'shopping-list' &&
        !(await runFavoriteEatsShoppingListRowEditNavigateGuard())
      ) {
        return;
      }
      window.location.href = getTopLevelPageHref(topLevelPages[nextIdx]);
    },
    { capture: true },
  );

  // --- Cmd+↑: go to parent/back page on editor pages ---
  const CHILD_EDITOR_PAGES = new Set([
    'recipe-editor',
    'shopping-editor',
    'unit-editor',
    'unitless-items',
    'size-editor',
    'tag-editor',
    'store-editor',
  ]);

  document.addEventListener(
    'keydown',
    (e) => {
      // Cmd only (avoid stealing Ctrl/Alt/Shift combos)
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.isComposing) return;

      if (e.key !== 'ArrowUp') return;
      if (!CHILD_EDITOR_PAGES.has(pageId)) return;
      if (isTypingContext(e.target) && !isAppBarSearchContext(e.target)) return;

      const backBtn = document.getElementById('appBarBackBtn');
      if (!backBtn) return;

      e.preventDefault();
      backBtn.click();
    },
    { capture: true },
  );

  const pageLoaders = {
    recipes: loadRecipesPage,
    'recipe-editor': loadRecipeEditorPage,
    shopping: loadShoppingPage,
    'shopping-list': loadShoppingListPage,
    'shopping-editor': loadShoppingItemEditorPage,
    units: loadUnitsPage,
    'unit-editor': loadUnitEditorPage,
    'unitless-items': loadUnitlessItemsPage,
    sizes: loadSizesPage,
    'size-editor': loadSizeEditorPage,
    tags: loadTagsPage,
    'tag-editor': loadTagEditorPage,
    stores: loadStoresPage,
    'store-editor': loadStoreEditorPage,
  };

  if (pageId && pageLoaders[pageId]) {
    const loader = pageLoaders[pageId];
    void (async () => {
      try {
        if (window.dataService) {
          window.dataService.useSupabase = true;
        }
        // Catalog/editor pages must not block first render on Plan/List. Surfaces
        // that need Plan/List own their hydrate path inside their page loader.
        if (
          pageId !== 'shopping-list' &&
          pageId !== 'shopping' &&
          pageId !== 'recipes' &&
          pageId !== 'stores' &&
          pageId !== 'shopping-editor' &&
          pageId !== 'recipe-editor' &&
          pageId !== 'store-editor' &&
          pageId !== 'unit-editor' &&
          pageId !== 'unitless-items' &&
          pageId !== 'size-editor' &&
          pageId !== 'tag-editor'
        ) {
          await hydrateShoppingStateFromDataService({
            source: `navigation pre-load:${pageId || ''}`,
          });
        }
      } catch (err) {
        console.warn('Shopping state hydrate failed:', err);
      }
      if (shouldUseRemoteShoppingState()) {
        ensureFavoriteEatsShoppingPlanRealtimeSubscription();
        ensureFavoriteEatsShoppingListRealtimeSubscription();
        installFavoriteEatsShoppingVisibilityRefetch();
        installFavoriteEatsShoppingBackForwardCacheRefetch();
      }
      if (favoriteEatsShouldUseSupabaseDataDoor()) {
        installFavoriteEatsCatalogSurfacesCrossTabRefresh();
        ensureFavoriteEatsCatalogReferenceRealtimeSubscription();
        ensureFavoriteEatsRecipeCatalogCompositionSubscription();
        ensureFavoriteEatsAppActivityPresenceSubscription();
      }
      await Promise.resolve(loader());
    })();
  }
}

if (!shouldDeferSqlBootForCurrentPage()) {
  bootFavoriteEatsApp();
}

function favoriteEatsShouldUseSupabaseDataDoor() {
  return true;
}

if (typeof window !== 'undefined') {
  window.clearFavoriteEatsShoppingSessionCache =
    clearFavoriteEatsShoppingSessionCache;
}

function favoriteEatsDataServiceIsSupabaseActive() {
  return !!(
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    window.dataService.useSupabase
  );
}

/**
 * Loads full recipe payloads (shopping-plan shape) into the synchronous materialization
 * cache so `materializeShoppingPlanRecipeSelectionsFromRoots` can walk linked recipes
 * when SQLite `bridge` is unavailable (`dbInstance` null on the Recipes page).
 */
async function primeShoppingPlanRecipeDetailCacheVisit(
  recipeId,
  depth,
  ancestorIds,
) {
  if (!favoriteEatsDataServiceIsSupabaseActive()) return;
  if (
    !window.dataService ||
    typeof window.dataService.loadRecipeDetail !== 'function'
  ) {
    return;
  }
  const id = Math.trunc(Number(recipeId));
  if (!Number.isFinite(id) || id <= 0) return;
  if (ancestorIds.has(id)) return;
  let recipe = peekShoppingPlanRecipeMaterializeCache(id);
  if (!recipe) {
    try {
      recipe = await window.dataService.loadRecipeDetail(id, {
        forShoppingPlan: true,
      });
    } catch (err) {
      console.warn('loadRecipeDetail (shopping-plan prime) failed:', id, err);
      return;
    }
    if (recipe && Array.isArray(recipe.sections)) {
      stashShoppingPlanRecipeMaterializeCache(id, recipe);
    } else {
      return;
    }
  }
  if (depth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH) return;
  const nextAncestors = new Set(ancestorIds);
  nextAncestors.add(id);
  for (const section of recipe.sections || []) {
    const ingredients = Array.isArray(section?.ingredients)
      ? section.ingredients
      : [];
    for (let i = 0; i < ingredients.length; i += 1) {
      const line = ingredients[i];
      if (!line || line.rowType === 'heading' || !line.isRecipe) continue;
      const lid = Math.trunc(Number(line.linkedRecipeId));
      if (!Number.isFinite(lid) || lid <= 0 || nextAncestors.has(lid)) continue;
      await primeShoppingPlanRecipeDetailCacheVisit(lid, depth + 1, nextAncestors);
    }
  }
}

async function primeShoppingPlanRecipeDetailCacheForRecipeTree(seedRecipeIds) {
  const seeds = (Array.isArray(seedRecipeIds) ? seedRecipeIds : [])
    .map((x) => Math.trunc(Number(x)))
    .filter((x) => Number.isFinite(x) && x > 0)
    .filter((id) => !peekShoppingPlanRecipeMaterializeCache(id));
  if (!seeds.length) return;
  await Promise.all(
    seeds.map((sid) =>
      primeShoppingPlanRecipeDetailCacheVisit(sid, 0, new Set()),
    ),
  );
}

async function primeShoppingPlanRecipeDetailCacheFromPlanRecipeRoots() {
  const roots = getShoppingPlanRecipeSelectionRoots();
  const ids = Object.values(roots || {})
    .map((e) => Math.trunc(Number(e?.recipeId)))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return;
  await primeShoppingPlanRecipeDetailCacheForRecipeTree(ids);
}

function touchShoppingPlanRecipeSelectionsMaterialization() {
  const current = getShoppingPlan();
  if (!current) return current;
  return persistShoppingPlan(current, { skipRemoteSave: true });
}

/** Loud signal when a Supabase-first read fails (testing / default web path). */
function favoriteEatsReportSupabasePrefetchFailure(label, err) {
  const inner =
    err && typeof err.message === 'string' ? err.message : String(err || '');
  const msg = `Supabase read failed (${label}). Check Supabase config/network. ${inner}`;
  console.error(msg, err);
  try {
    uiToast(msg);
  } catch (_) {}
}

function favoriteEatsHrefWithCurrentAdapter(href) {
  return href;
}
if (typeof window !== 'undefined') {
  window.favoriteEatsHrefWithCurrentAdapter =
    favoriteEatsHrefWithCurrentAdapter;
}

// Recipes page logic (Slice 7 phase 2 — UI in js/screens/recipesPage.js)
async function loadRecipesPage() {
  registerFavoriteEatsRecipesPageBridge();
  if (
    window.favoriteEatsRecipesPage &&
    typeof window.favoriteEatsRecipesPage.loadRecipesPage === 'function'
  ) {
    return window.favoriteEatsRecipesPage.loadRecipesPage();
  }
  fePageLoadFoodIconFail();
}


// --- Shopping / Units / Stores loaders (v0 stubs) ---
// Items page logic (Slice 7 phase 2 — UI in js/screens/itemsPage.js)
async function loadShoppingPage() {
  registerFavoriteEatsItemsPageBridge();
  if (
    window.favoriteEatsItemsPage &&
    typeof window.favoriteEatsItemsPage.loadShoppingPage === 'function'
  ) {
    return window.favoriteEatsItemsPage.loadShoppingPage();
  }
  fePageLoadFoodIconFail();
}

// --- Shopping list checklist helpers (tests extract this block) ---
const SHOPPING_LIST_DOC_STORAGE_KEY = 'favoriteEats:shopping-list-doc:v2';
const SHOPPING_LIST_DOC_SESSION_MIRROR_KEY =
  'favoriteEats:shopping-list-doc:session-mirror:v2';

function resolveShoppingListDocStorageKey() {
  try {
    if (typeof window.favoriteEatsGetShoppingListDocStorageKey === 'function') {
      return window.favoriteEatsGetShoppingListDocStorageKey();
    }
  } catch (_) {}
  return SHOPPING_LIST_DOC_STORAGE_KEY;
}

function resolveShoppingListDocSessionMirrorKey() {
  try {
    if (
      typeof window.favoriteEatsGetShoppingListDocSessionMirrorKey === 'function'
    ) {
      return window.favoriteEatsGetShoppingListDocSessionMirrorKey();
    }
  } catch (_) {}
  return SHOPPING_LIST_DOC_SESSION_MIRROR_KEY;
}
const SHOPPING_LIST_VIEW_MODE_SESSION_KEY =
  'favoriteEats:shopping-list-view-mode';
const SHOPPING_LIST_KEEP_COMPLETED_IN_PLACE_SESSION_KEY =
  'favoriteEats:shopping-list-keep-completed-in-place:v1';
const SHOPPING_LIST_GROUP_ITEM_VARIANTS_SESSION_KEY =
  'favoriteEats:shopping-list-group-item-variants:v1';
const SHOPPING_LIST_CHECKBOX_ACTION_SESSION_KEY =
  'favoriteEats:shopping-list-checkbox-action:v2';
const SHOPPING_LIST_COLLAPSED_SECTIONS_SESSION_KEY =
  'favoriteEats:shopping-list-collapsed-sections:v1';
const SHOPPING_LIST_CHECKBOX_ACTION_COMPLETE = 'complete';
const SHOPPING_LIST_CHECKBOX_ACTION_REMOVE = 'remove';
const SHOPPING_LIST_DOC_VERSION = 3;
const SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL = 'removed';
const SHOPPING_LIST_REMOVED_SECTION_DISPLAY_LABEL = 'Removed';
const SHOPPING_RESERVED_STORE_NAME_ERROR =
  "Stores can't use that name. Please choose another one.";

function normalizeReservedShoppingListStoreNameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isReservedShoppingListStoreName(value) {
  return (
    normalizeReservedShoppingListStoreNameKey(value) ===
    SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL
  );
}

function isShoppingListRemovedPseudoStoreLabel(storeLabel) {
  return (
    normalizeReservedShoppingListStoreNameKey(storeLabel) ===
    SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL
  );
}

function isShoppingListRowListRemoved(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.removed === true) return true;
  return isShoppingListRemovedPseudoStoreLabel(row?.storeLabel);
}

function shoppingListPseudoRemovedCollapseKey() {
  return 'sl-pseudo-removed';
}

function applyShoppingListRowListRemove(row) {
  if (!row || typeof row !== 'object') return row;
  if (
    row.removed === true &&
    isShoppingListRemovedPseudoStoreLabel(row?.storeLabel)
  ) {
    return row;
  }
  row.removed = true;
  row.restoreStoreLabel = String(row.storeLabel || '').trim();
  row.restoreBucketLabel = String(row.bucketLabel || '').trim();
  row.restoreStoreId = row.storeId;
  row.restoreAisleId = row.aisleId;
  row.restoreAisleSortOrder = row.aisleSortOrder;
  row.storeLabel = SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL;
  row.bucketLabel = '';
  row.storeId = null;
  row.aisleId = null;
  row.aisleSortOrder = null;
  return row;
}

function applyShoppingListRowListRestore(row) {
  if (!row || typeof row !== 'object') return row;
  if (!isShoppingListRowListRemoved(row)) return row;
  row.removed = false;
  row.storeLabel = String(
    row.restoreStoreLabel ?? row.sourceStoreLabel ?? '',
  ).trim();
  row.bucketLabel = String(
    row.restoreBucketLabel ?? row.sourceBucketLabel ?? '',
  ).trim();
  const restoreStoreId = Math.trunc(Number(row.restoreStoreId));
  row.storeId =
    Number.isFinite(restoreStoreId) && restoreStoreId > 0 ? restoreStoreId : null;
  const restoreAisleId = Math.trunc(Number(row.restoreAisleId));
  row.aisleId =
    Number.isFinite(restoreAisleId) && restoreAisleId > 0 ? restoreAisleId : null;
  const restoreSort = Number(row.restoreAisleSortOrder);
  row.aisleSortOrder = Number.isFinite(restoreSort) ? restoreSort : null;
  row.restoreStoreLabel = '';
  row.restoreBucketLabel = '';
  row.restoreStoreId = null;
  row.restoreAisleId = null;
  row.restoreAisleSortOrder = null;
  return row;
}

function buildShoppingListRowPlacementRpcPayload(row, rowIdOverride = '') {
  if (!row || typeof row !== 'object') return null;
  const rowId = String(rowIdOverride || row.sourceKey || row.id || '').trim();
  if (!rowId) return null;
  const storeId = Math.trunc(Number(row.storeId));
  const aisleId = Math.trunc(Number(row.aisleId));
  const aisleSortOrder = Number(row.aisleSortOrder);
  const order = Number(row.order);
  return {
    rowId,
    storeId:
      row.storeId != null &&
      String(row.storeId).trim() !== '' &&
      Number.isFinite(storeId) &&
      storeId > 0
        ? storeId
        : null,
    storeLabel: String(row.storeLabel || '').trim(),
    bucketLabel: String(row.bucketLabel || '').trim(),
    aisleId:
      row.aisleId != null &&
      String(row.aisleId).trim() !== '' &&
      Number.isFinite(aisleId)
        ? aisleId
        : null,
    aisleSortOrder:
      row.aisleSortOrder != null &&
      String(row.aisleSortOrder).trim() !== '' &&
      Number.isFinite(aisleSortOrder)
        ? aisleSortOrder
        : null,
    order:
      row.order != null && String(row.order).trim() !== '' && Number.isFinite(order)
        ? Math.trunc(order)
        : null,
  };
}

function readShoppingListViewModeFromSession() {
  try {
    const raw = String(
      sessionStorage.getItem(SHOPPING_LIST_VIEW_MODE_SESSION_KEY) || '',
    )
      .trim()
      .toLowerCase();
    if (raw === 'home' || raw === 'stores') return raw;
  } catch (_) {}
  return 'stores';
}

function persistShoppingListViewMode(mode) {
  const next = mode === 'home' ? 'home' : 'stores';
  try {
    sessionStorage.setItem(SHOPPING_LIST_VIEW_MODE_SESSION_KEY, next);
  } catch (_) {}
}

function readShoppingListKeepCompletedInPlaceFromSession() {
  try {
    const raw = String(
      sessionStorage.getItem(
        SHOPPING_LIST_KEEP_COMPLETED_IN_PLACE_SESSION_KEY,
      ) || '',
    )
      .trim()
      .toLowerCase();
    if (raw === 'on') return true;
    if (raw === 'off') return false;
  } catch (_) {}
  return true;
}

function persistShoppingListKeepCompletedInPlace(enabled) {
  try {
    sessionStorage.setItem(
      SHOPPING_LIST_KEEP_COMPLETED_IN_PLACE_SESSION_KEY,
      enabled ? 'on' : 'off',
    );
  } catch (_) {}
}

function readShoppingListGroupItemVariantsFromSession() {
  try {
    const raw = String(
      sessionStorage.getItem(SHOPPING_LIST_GROUP_ITEM_VARIANTS_SESSION_KEY) ||
        '',
    )
      .trim()
      .toLowerCase();
    if (raw === 'off') return false;
    if (raw === 'on') return true;
  } catch (_) {}
  return true;
}

function persistShoppingListGroupItemVariants(enabled) {
  try {
    sessionStorage.setItem(
      SHOPPING_LIST_GROUP_ITEM_VARIANTS_SESSION_KEY,
      enabled ? 'on' : 'off',
    );
  } catch (_) {}
}

function readShoppingListCheckboxActionFromSession() {
  try {
    const raw = String(
      sessionStorage.getItem(SHOPPING_LIST_CHECKBOX_ACTION_SESSION_KEY) || '',
    )
      .trim()
      .toLowerCase();
    if (raw === SHOPPING_LIST_CHECKBOX_ACTION_REMOVE) {
      return SHOPPING_LIST_CHECKBOX_ACTION_REMOVE;
    }
    if (raw === SHOPPING_LIST_CHECKBOX_ACTION_COMPLETE) {
      return SHOPPING_LIST_CHECKBOX_ACTION_COMPLETE;
    }
  } catch (_) {}
  return SHOPPING_LIST_CHECKBOX_ACTION_COMPLETE;
}

function persistShoppingListCheckboxActionFromSession(action) {
  const next =
    String(action || '')
      .trim()
      .toLowerCase() === SHOPPING_LIST_CHECKBOX_ACTION_REMOVE
      ? SHOPPING_LIST_CHECKBOX_ACTION_REMOVE
      : SHOPPING_LIST_CHECKBOX_ACTION_COMPLETE;
  try {
    sessionStorage.setItem(SHOPPING_LIST_CHECKBOX_ACTION_SESSION_KEY, next);
  } catch (_) {}
}

function readShoppingListCollapsedSectionsFromSession() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(SHOPPING_LIST_COLLAPSED_SECTIONS_SESSION_KEY) ||
        '[]',
    );
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set();
    parsed.forEach((id) => {
      const key = String(id || '').trim();
      if (key) out.add(key);
    });
    return out;
  } catch (_) {}
  return new Set();
}

function persistShoppingListCollapsedSections(collapsedKeys) {
  try {
    const keys =
      collapsedKeys instanceof Set
        ? Array.from(collapsedKeys)
        : Array.isArray(collapsedKeys)
          ? collapsedKeys
          : [];
    sessionStorage.setItem(
      SHOPPING_LIST_COLLAPSED_SECTIONS_SESSION_KEY,
      JSON.stringify(
        keys.map((key) => String(key || '').trim()).filter(Boolean),
      ),
    );
  } catch (_) {}
}

function createShoppingListChecklistRowId() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `shopping-list-row-${stamp}-${random}`;
}

function createEmptyShoppingListDoc() {
  return {
    version: SHOPPING_LIST_DOC_VERSION,
    rows: [],
  };
}

function normalizeShoppingListDocRow(rawRow, fallbackOrder = 0) {
  const source =
    rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow)
      ? rawRow
      : {};
  const text = String(source.text || '').trim();
  if (!text) return null;
  const rawOrder = Number(source.order);
  const rawStoreId = Math.trunc(Number(source.storeId));
  const rawAisleId = Math.trunc(Number(source.aisleId));
  const rawAisleSortOrder = Number(source.aisleSortOrder);
  const hasExplicitAisleSortOrder =
    source.aisleSortOrder != null &&
    String(source.aisleSortOrder).trim() !== '';
  const sourceKey = String(source.sourceKey || '').trim();
  const sourceText = String(source.sourceText || '').trim();
  const sourceStoreLabel = String(source.sourceStoreLabel || '').trim();
  const sourceBucketLabel = String(source.sourceBucketLabel || '').trim();
  const hasExplicitUserEdited = typeof source.userEdited === 'boolean';
  const inferredUserEdited = !!(
    sourceKey &&
    sourceText &&
    text &&
    text !== sourceText
  );
  const removedCanonical =
    !!source.removed ||
    isShoppingListRemovedPseudoStoreLabel(source.storeLabel);
  const row = {
    id: String(source.id || '').trim() || createShoppingListChecklistRowId(),
    text,
    checked: !!source.checked,
    removed: removedCanonical,
    storeLabel: String(source.storeLabel || '').trim(),
    storeId: Number.isFinite(rawStoreId) && rawStoreId > 0 ? rawStoreId : null,
    bucketLabel: String(source.bucketLabel || '').trim(),
    aisleId: Number.isFinite(rawAisleId) && rawAisleId > 0 ? rawAisleId : null,
    aisleSortOrder:
      hasExplicitAisleSortOrder && Number.isFinite(rawAisleSortOrder)
        ? rawAisleSortOrder
        : null,
    sourceKey,
    sourceText: sourceKey ? sourceText || text : '',
    sourceStoreLabel: sourceKey
      ? sourceStoreLabel || String(source.storeLabel || '').trim()
      : '',
    sourceBucketLabel: sourceKey
      ? sourceBucketLabel || String(source.bucketLabel || '').trim()
      : '',
    userEdited: sourceKey
      ? hasExplicitUserEdited
        ? !!source.userEdited || inferredUserEdited
        : inferredUserEdited
      : false,
    restoreStoreLabel: String(source.restoreStoreLabel || '').trim(),
    restoreBucketLabel: String(source.restoreBucketLabel || '').trim(),
    restoreStoreId:
      source.restoreStoreId != null &&
      String(source.restoreStoreId).trim() !== '' &&
      Number.isFinite(Math.trunc(Number(source.restoreStoreId))) &&
      Math.trunc(Number(source.restoreStoreId)) > 0
        ? Math.trunc(Number(source.restoreStoreId))
        : null,
    restoreAisleId:
      source.restoreAisleId != null &&
      String(source.restoreAisleId).trim() !== '' &&
      Number.isFinite(Math.trunc(Number(source.restoreAisleId))) &&
      Math.trunc(Number(source.restoreAisleId)) > 0
        ? Math.trunc(Number(source.restoreAisleId))
        : null,
    restoreAisleSortOrder:
      source.restoreAisleSortOrder != null &&
      String(source.restoreAisleSortOrder).trim() !== '' &&
      Number.isFinite(Number(source.restoreAisleSortOrder))
        ? Number(source.restoreAisleSortOrder)
        : null,
    order: Number.isFinite(rawOrder) ? rawOrder : fallbackOrder,
  };
  const updatedAt = source.updatedAt != null ? source.updatedAt : source.updated_at;
  if (updatedAt != null && String(updatedAt).trim()) {
    row.updatedAt = String(updatedAt);
  }
  if (
    removedCanonical &&
    !isShoppingListRemovedPseudoStoreLabel(row.storeLabel)
  ) {
    return applyShoppingListRowListRemove(row);
  }
  return row;
}

function normalizeShoppingListDoc(rawDoc) {
  const source =
    rawDoc && typeof rawDoc === 'object' && !Array.isArray(rawDoc)
      ? rawDoc
      : {};
  const rawRows = Array.isArray(source.rows) ? source.rows : [];
  const rows = rawRows
    .map((row, index) => normalizeShoppingListDocRow(row, index))
    .filter(Boolean)
    .sort((a, b) => {
      const orderDelta = Number(a.order || 0) - Number(b.order || 0);
      if (Math.abs(orderDelta) > 1e-9) return orderDelta;
      return String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map((row, index) => ({
      ...row,
      order: index,
    }));
  return {
    version: SHOPPING_LIST_DOC_VERSION,
    rows,
  };
}

function loadShoppingListDocFromStorage() {
  try {
    const raw = localStorage.getItem(resolveShoppingListDocStorageKey());
    if (raw) return normalizeShoppingListDoc(JSON.parse(raw));
  } catch (_) {
    return null;
  }
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const rawSession = sessionStorage.getItem(
      resolveShoppingListDocSessionMirrorKey(),
    );
    if (!rawSession) return null;
    return normalizeShoppingListDoc(JSON.parse(rawSession));
  } catch (_) {
    return null;
  }
}

function persistShoppingListDocSessionMirror(docNormalized) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(
      resolveShoppingListDocSessionMirrorKey(),
      JSON.stringify(docNormalized),
    );
  } catch (_) {}
}

function getAuthoritativeShoppingListDoc() {
  if (shouldUseRemoteShoppingState()) {
    if (shoppingListDocAuthoritativeCache != null) {
      return normalizeShoppingListDoc(shoppingListDocAuthoritativeCache);
    }
    // Remote mode: localStorage is cache only — do not treat it as authority
    // before hydrate or legacy bridge has populated shoppingListDocAuthoritativeCache.
    return normalizeShoppingListDoc(null);
  }
  return loadShoppingListDocFromStorage();
}

/**
 * If `next` differs from `prev` only by adding one `list.manual_rows`-style row
 * (no sourceKey), return it so we can call `append_manual_shopping_list_row`
 * instead of `save_shopping_state`. This is for programmatic/session deltas—
 * Favorite Eats does not expose a Shopping List UI to compose such rows.
 */
function detectSingleManualShoppingListRowAppend(prevDoc, nextDoc) {
  const prev =
    prevDoc && typeof prevDoc === 'object'
      ? normalizeShoppingListDoc(prevDoc)
      : normalizeShoppingListDoc(null);
  const next = normalizeShoppingListDoc(nextDoc);
  const prevRows = Array.isArray(prev?.rows) ? prev.rows : [];
  const nextRows = Array.isArray(next?.rows) ? next.rows : [];
  if (nextRows.length !== prevRows.length + 1) return null;
  const prevIds = new Set(
    prevRows.map((r) => String(r?.id || '').trim()).filter(Boolean),
  );
  const added = nextRows.filter(
    (r) => !prevIds.has(String(r?.id || '').trim()),
  );
  if (added.length !== 1) return null;
  const row = added[0];
  if (String(row?.sourceKey || '').trim()) return null;
  const text = String(row?.text || '').trim();
  if (!text) return null;
  return row;
}

function persistShoppingListDoc(doc, options = {}) {
  const normalized = normalizeShoppingListDoc(doc);
  const skipRemoteSave = !!options.skipRemoteSave;
  const prevListNormalized =
    shoppingListDocAuthoritativeCache != null
      ? normalizeShoppingListDoc(shoppingListDocAuthoritativeCache)
      : null;
  const skipDuplicateRemoteListSave =
    !skipRemoteSave &&
    shouldUseRemoteShoppingState() &&
    prevListNormalized != null &&
    JSON.stringify(prevListNormalized) === JSON.stringify(normalized);
  const appendManualRow =
    !skipRemoteSave &&
    !skipDuplicateRemoteListSave &&
    shouldUseRemoteShoppingState() &&
    window.dataService &&
    typeof window.dataService.appendManualShoppingListRow === 'function'
      ? detectSingleManualShoppingListRowAppend(prevListNormalized, normalized)
      : null;
  shoppingListDocAuthoritativeCache = normalized;
  try {
    localStorage.setItem(
      resolveShoppingListDocStorageKey(),
      JSON.stringify(normalized),
    );
  } catch (_) {}
  persistShoppingListDocSessionMirror(normalized);
  if (
    skipRemoteSave &&
    shouldUseRemoteShoppingState() &&
    window.favoriteEatsStore &&
    typeof window.favoriteEatsStore.patchOptimisticListDoc === 'function'
  ) {
    try {
      window.favoriteEatsStore.patchOptimisticListDoc(normalized);
    } catch (_) {}
  }
  if (!skipRemoteSave && !skipDuplicateRemoteListSave) {
    if (appendManualRow) {
      const rowId = String(appendManualRow.id || '').trim();
      const manualText = String(appendManualRow.text || '').trim();
      void window.dataService
        .appendManualShoppingListRow(
          rowId ? { text: manualText, rowId } : { text: manualText },
        )
        .then((result) => {
          if (result && result.ok !== false) return;
          queueSaveShoppingStateToDataService({
            shoppingListDoc: shoppingListDocAuthoritativeCache,
          });
        })
        .catch((err) => {
          console.warn('appendManualShoppingListRow failed:', err);
          queueSaveShoppingStateToDataService({
            shoppingListDoc: shoppingListDocAuthoritativeCache,
          });
        });
    } else {
      queueSaveShoppingStateToDataService({ shoppingListDoc: normalized });
    }
  }
  return normalized;
}

function doesShoppingListRowHaveUserOverride(row) {
  if (!row || typeof row !== 'object') return false;
  const sourceKey = String(row.sourceKey || '').trim();
  const text = String(row.text || '').trim();
  const sourceText = String(row.sourceText || '').trim();
  if (!sourceKey || !text || !sourceText) return false;
  if (text === sourceText) return false;
  return shoppingListRowAmountDetailDivergedFromSource(row);
}

function hydrateLegacyShoppingListDocSources(storedDoc, generatedDoc) {
  const normalizedStoredDoc = normalizeShoppingListDoc(storedDoc);
  const normalizedGeneratedDoc = normalizeShoppingListDoc(generatedDoc);
  const storedRows = normalizedStoredDoc.rows;
  const generatedRows = normalizedGeneratedDoc.rows;
  const allRowsNeedSourceKeys =
    storedRows.length > 0 &&
    storedRows.every((row) => !String(row?.sourceKey || '').trim());
  if (!allRowsNeedSourceKeys) return normalizedStoredDoc;
  if (storedRows.length !== generatedRows.length) return normalizedStoredDoc;
  const canHydrateByOrder = storedRows.every((row, index) => {
    const generatedRow = generatedRows[index];
    if (!generatedRow || !String(generatedRow.sourceKey || '').trim())
      return false;
    return (
      String(row.storeLabel || '').trim() ===
        String(generatedRow.storeLabel || '').trim() &&
      String(row.bucketLabel || '').trim() ===
        String(generatedRow.bucketLabel || '').trim()
    );
  });
  if (!canHydrateByOrder) return normalizedStoredDoc;
  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows: storedRows.map((row, index) => {
      const generatedRow = generatedRows[index];
      const generatedText = String(generatedRow?.text || '').trim();
      return {
        ...row,
        sourceKey: String(generatedRow?.sourceKey || '').trim(),
        sourceText: generatedText,
        sourceStoreLabel: String(generatedRow?.sourceStoreLabel || '').trim(),
        sourceBucketLabel: String(generatedRow?.sourceBucketLabel || '').trim(),
        userEdited: generatedText
          ? String(row?.text || '').trim() !== generatedText
          : false,
      };
    }),
  });
}

function buildShoppingListDocFromPlanRows(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const docRows = [];
  let currentStoreLabel = '';
  let currentStoreId = null;
  let currentBucketLabel = '';
  let currentAisleId = null;
  let currentAisleSortOrder = null;

  sourceRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const rowType = String(row.rowType || '').trim();
    const text = String(row.text || row.label || '').trim();
    const className = String(row.className || '').trim();
    const rowStoreId = Math.trunc(Number(row.storeId));
    const rowAisleId = Math.trunc(Number(row.aisleId));
    const rowAisleSortOrder = Number(row.aisleSortOrder);

    if (rowType === 'section') {
      if (!text) return;
      if (className.includes('shopping-list-section--store')) {
        currentStoreLabel = text;
        currentStoreId =
          Number.isFinite(rowStoreId) && rowStoreId > 0 ? rowStoreId : null;
        currentBucketLabel = '';
        currentAisleId = null;
        currentAisleSortOrder = null;
        return;
      }
      if (className.includes('shopping-list-section--unlisted')) {
        currentStoreLabel = '';
        currentStoreId = null;
        currentBucketLabel = text;
        currentAisleId = null;
        currentAisleSortOrder = null;
        return;
      }
      currentBucketLabel = text;
      currentAisleId =
        Number.isFinite(rowAisleId) && rowAisleId > 0 ? rowAisleId : null;
      currentAisleSortOrder = Number.isFinite(rowAisleSortOrder)
        ? rowAisleSortOrder
        : null;
      return;
    }

    if (!text) return;
    docRows.push({
      id: createShoppingListChecklistRowId(),
      text,
      checked: false,
      storeLabel: currentStoreLabel,
      storeId: currentStoreId,
      bucketLabel: currentBucketLabel,
      aisleId: currentAisleId,
      aisleSortOrder: currentAisleSortOrder,
      sourceKey: String(row.key || '').trim(),
      sourceText: text,
      sourceStoreLabel: currentStoreLabel,
      sourceBucketLabel: currentBucketLabel,
      userEdited: false,
      order: docRows.length,
    });
  });

  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows: docRows,
  });
}

function orderShoppingListChecklistStoreLabels(storeLabels) {
  const named = [];
  const unlisted = [];
  const removed = [];
  const seen = new Set();
  (Array.isArray(storeLabels) ? storeLabels : []).forEach((rawLabel) => {
    const key = String(rawLabel ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    if (isShoppingListRemovedPseudoStoreLabel(key)) {
      removed.push(key);
      return;
    }
    if (!key.trim()) unlisted.push(key);
    else named.push(key);
  });
  return [...named, ...unlisted, ...removed];
}

function pushMergedShoppingListDocRow(mergedRows, row) {
  mergedRows.push({
    ...row,
    order: mergedRows.length,
  });
}

function mergeShoppingListDocWithGenerated(storedDoc, generatedDoc) {
  const normalizedGeneratedDoc = normalizeShoppingListDoc(generatedDoc);
  const hydratedStoredDoc = hydrateLegacyShoppingListDocSources(
    storedDoc,
    normalizedGeneratedDoc,
  );
  const normalizedStoredDoc = normalizeShoppingListDocQtyOnlyOverrides(
    hydratedStoredDoc,
    normalizedGeneratedDoc,
  );
  const generatedRows = normalizedGeneratedDoc.rows;
  const storedRows = normalizedStoredDoc.rows;
  const storedRowsBySourceKey = new Map();
  const manualRows = [];
  storedRows.forEach((row) => {
    const sourceKey = String(row?.sourceKey || '').trim();
    if (!sourceKey) {
      manualRows.push(row);
      return;
    }
    storedRowsBySourceKey.set(sourceKey, row);
  });

  const generatedSourceKeys = new Set();
  const mergedRows = [];
  const conflicts = [];

  generatedRows.forEach((generatedRow) => {
    const sourceKey = String(generatedRow?.sourceKey || '').trim();
    if (!sourceKey) {
      pushMergedShoppingListDocRow(mergedRows, generatedRow);
      return;
    }
    generatedSourceKeys.add(sourceKey);
    const storedRow = storedRowsBySourceKey.get(sourceKey);
    if (!storedRow) {
      pushMergedShoppingListDocRow(mergedRows, generatedRow);
      return;
    }

    const hasUserOverride = doesShoppingListRowHaveUserOverride(storedRow);
    const qtyUpdatePending =
      hasUserOverride &&
      shoppingListRowGeneratedSourceAmountDetailChanged(storedRow, generatedRow);

    if (qtyUpdatePending) {
      const pendingText = buildShoppingListRowTextPreservingUserQtyDetail(
        storedRow,
        generatedRow,
      );
      pushMergedShoppingListDocRow(mergedRows, {
        ...storedRow,
        text: pendingText,
        checked: !!storedRow.checked,
        storeLabel: String(generatedRow.storeLabel || '').trim(),
        storeId: generatedRow.storeId,
        bucketLabel: String(generatedRow.bucketLabel || '').trim(),
        aisleId: generatedRow.aisleId,
        aisleSortOrder: generatedRow.aisleSortOrder,
        sourceKey,
        sourceStoreLabel: String(generatedRow.sourceStoreLabel || '').trim(),
        sourceBucketLabel: String(generatedRow.sourceBucketLabel || '').trim(),
        userEdited: true,
      });
      conflicts.push(buildShoppingListQtyUpdateConflict(storedRow, generatedRow));
      return;
    }

    if (isShoppingListRowListRemoved(storedRow)) {
      pushMergedShoppingListDocRow(
        mergedRows,
        mergeShoppingListStoredRowWithGeneratedRow(storedRow, generatedRow),
      );
      return;
    }

    pushMergedShoppingListDocRow(
      mergedRows,
      mergeShoppingListStoredRowWithGeneratedRow(storedRow, generatedRow),
    );
  });

  manualRows
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .forEach((row) => {
      pushMergedShoppingListDocRow(mergedRows, row);
    });

  return {
    doc: normalizeShoppingListDoc({
      version: SHOPPING_LIST_DOC_VERSION,
      rows: mergedRows,
    }),
    conflicts,
  };
}

/** Quantity/layout fields for Discard changes; excludes check state. */
function toShoppingListDiscardComparableRows(doc) {
  return normalizeShoppingListDoc(doc).rows.map((row, index) => ({
    text: String(row?.text || '').trim(),
    storeLabel: String(row?.storeLabel || '').trim(),
    bucketLabel: String(row?.bucketLabel || '').trim(),
    order: index,
  }));
}

function isShoppingListDiscardChangesNoOp(currentDoc, generatedDoc) {
  const currentComparable = toShoppingListDiscardComparableRows(currentDoc);
  const generatedComparable = toShoppingListDiscardComparableRows(generatedDoc);
  return (
    JSON.stringify(currentComparable) === JSON.stringify(generatedComparable)
  );
}

/** Revert quantity/text overrides from generated plan; preserve row ids and checked state. */
function applyShoppingListDiscardQuantityChanges(currentDoc, generatedDoc) {
  const normalizedCurrent = normalizeShoppingListDoc(currentDoc);
  const normalizedGenerated = normalizeShoppingListDoc(generatedDoc);
  const generatedBySourceKey = new Map();
  normalizedGenerated.rows.forEach((row) => {
    const sourceKey = String(row?.sourceKey || '').trim();
    if (sourceKey) generatedBySourceKey.set(sourceKey, row);
  });

  const manualRows = [];
  const nextRows = [];

  normalizedCurrent.rows.forEach((storedRow) => {
    const sourceKey = String(storedRow?.sourceKey || '').trim();
    if (!sourceKey) {
      manualRows.push(storedRow);
      return;
    }
    const generatedRow = generatedBySourceKey.get(sourceKey);
    if (!generatedRow) {
      if (doesShoppingListRowHaveUserOverride(storedRow)) return;
      nextRows.push(storedRow);
      return;
    }
    if (isShoppingListRowListRemoved(storedRow)) {
      nextRows.push({
        ...storedRow,
        text: String(generatedRow.text || '').trim(),
        sourceText: String(generatedRow.sourceText || '').trim(),
        sourceStoreLabel: String(generatedRow.sourceStoreLabel || '').trim(),
        sourceBucketLabel: String(generatedRow.sourceBucketLabel || '').trim(),
        userEdited: false,
      });
      return;
    }
    nextRows.push({
      ...storedRow,
      text: String(generatedRow.text || '').trim(),
      checked: !!storedRow.checked,
      storeLabel: String(generatedRow.storeLabel || '').trim(),
      storeId: generatedRow.storeId,
      bucketLabel: String(generatedRow.bucketLabel || '').trim(),
      aisleId: generatedRow.aisleId,
      aisleSortOrder: generatedRow.aisleSortOrder,
      sourceText: String(generatedRow.sourceText || '').trim(),
      sourceStoreLabel: String(generatedRow.sourceStoreLabel || '').trim(),
      sourceBucketLabel: String(generatedRow.sourceBucketLabel || '').trim(),
      userEdited: false,
    });
  });

  const keptSourceKeys = new Set(
    nextRows.map((row) => String(row?.sourceKey || '').trim()).filter(Boolean),
  );
  normalizedGenerated.rows.forEach((generatedRow) => {
    const sourceKey = String(generatedRow?.sourceKey || '').trim();
    if (!sourceKey || keptSourceKeys.has(sourceKey)) return;
    nextRows.push(generatedRow);
  });

  manualRows
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .forEach((row) => {
      nextRows.push(row);
    });

  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows: nextRows,
  });
}

function shoppingListSourcedRowsPayloadFromDoc(doc) {
  const normalized = normalizeShoppingListDoc(doc);
  return normalized.rows
    .map((row, index) => {
      const sourceKey = String(row?.sourceKey || '').trim();
      if (!sourceKey) return null;
      return {
        sourceKey,
        text: String(row.text || '').trim(),
        sourceText: String(row.sourceText || row.text || '').trim(),
        checked: !!row.checked,
        storeId: row.storeId,
        storeLabel: String(row.storeLabel || '').trim(),
        bucketLabel: String(row.bucketLabel || '').trim(),
        aisleId: row.aisleId,
        aisleSortOrder: row.aisleSortOrder,
        sourceStoreLabel: String(row.sourceStoreLabel || row.storeLabel || '').trim(),
        sourceBucketLabel: String(
          row.sourceBucketLabel || row.bucketLabel || '',
        ).trim(),
        userEdited: !!row.userEdited,
        order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      };
    })
    .filter(Boolean);
}

async function persistShoppingListBulkOperationToDataService(
  operation,
  options = {},
) {
  if (!shouldUseRemoteShoppingState()) return undefined;
  const fallbackDoc = options.fallbackDoc;
  const saveOptions =
    options.saveOptions && typeof options.saveOptions === 'object'
      ? options.saveOptions
      : {};
  const rpcByOperation = {
    uncheckAll: 'uncheckAllShoppingListRows',
    syncSourcedRows: 'applyShoppingListSourcedRowsSync',
    restoreRemoved: 'restoreRemovedShoppingListRows',
  };
  const rpcName = rpcByOperation[operation];
  try {
    window.dataService.useSupabase = true;
  } catch (_) {}
  if (rpcName && typeof window.dataService[rpcName] === 'function') {
    try {
      const request =
        options.request && typeof options.request === 'object'
          ? options.request
          : {};
      const result =
        operation === 'syncSourcedRows'
          ? await window.dataService.applyShoppingListSourcedRowsSync(request)
          : operation === 'restoreRemoved'
            ? await window.dataService.restoreRemovedShoppingListRows()
            : await window.dataService.uncheckAllShoppingListRows();
      if (result && result.ok === false) {
        throw new Error(String(result.reason || 'bulk_list_rpc_failed'));
      }
      const echo = {};
      if (result && result.listSessionUpdatedAt != null) {
        echo.listSessionUpdatedAt = String(result.listSessionUpdatedAt);
      }
      if (Object.keys(echo).length) {
        try {
          applyShoppingStateEchoFromSaveResponse(echo);
        } catch (err) {
          console.warn(
            'applyShoppingStateEchoFromSaveResponse (bulk list save) failed:',
            err,
          );
        }
        void favoriteEatsStoreApplyRemoteFromSaveEcho(echo);
      }
      return result;
    } catch (err) {
      console.warn(`Shopping list bulk ${operation} failed:`, err);
    }
  }
  if (fallbackDoc) {
    return awaitPersistShoppingStateToDataService(
      { shoppingListDoc: fallbackDoc },
      saveOptions,
    );
  }
  return undefined;
}

function resolveShoppingListDocConflict(doc, conflict, resolution = 'keep') {
  const normalizedDoc = normalizeShoppingListDoc(doc);
  const rows = normalizedDoc.rows.slice();
  const rowIndex = rows.findIndex(
    (row) => String(row?.id || '') === String(conflict?.rowId || ''),
  );
  if (rowIndex === -1) return normalizedDoc;
  const row = rows[rowIndex];
  const mode = resolution === 'replace' ? 'replace' : 'keep';

  if (String(conflict?.kind || '').trim() === 'remove') {
    if (mode === 'replace') {
      rows.splice(rowIndex, 1);
      return normalizeShoppingListDoc({
        version: SHOPPING_LIST_DOC_VERSION,
        rows,
      });
    }
    rows[rowIndex] = {
      ...row,
      sourceKey: '',
      sourceText: '',
      sourceStoreLabel: '',
      sourceBucketLabel: '',
      userEdited: false,
    };
    return normalizeShoppingListDoc({
      version: SHOPPING_LIST_DOC_VERSION,
      rows,
    });
  }

  const nextGeneratedText = String(conflict?.nextGeneratedText || '').trim();
  const nextStoreLabel = String(conflict?.nextStoreLabel || '').trim();
  const nextBucketLabel = String(conflict?.nextBucketLabel || '').trim();
  const nextStoreId = Math.trunc(Number(conflict?.nextStoreId));
  const nextAisleId = Math.trunc(Number(conflict?.nextAisleId));
  const nextAisleSortOrder = Number(conflict?.nextAisleSortOrder);
  if (!nextGeneratedText) return normalizedDoc;

  if (mode === 'replace') {
    const replaceText = String(
      conflict?.nextGeneratedDisplayText || nextGeneratedText || '',
    ).trim();
    rows[rowIndex] = {
      ...row,
      text: replaceText || nextGeneratedText,
      storeLabel: nextStoreLabel,
      storeId:
        Number.isFinite(nextStoreId) && nextStoreId > 0 ? nextStoreId : null,
      bucketLabel: nextBucketLabel,
      aisleId:
        Number.isFinite(nextAisleId) && nextAisleId > 0 ? nextAisleId : null,
      aisleSortOrder: Number.isFinite(nextAisleSortOrder)
        ? nextAisleSortOrder
        : null,
      sourceKey: String(conflict?.sourceKey || row?.sourceKey || '').trim(),
      sourceText: nextGeneratedText,
      sourceStoreLabel: nextStoreLabel,
      sourceBucketLabel: nextBucketLabel,
      userEdited: false,
    };
  } else {
    rows[rowIndex] = {
      ...row,
      storeLabel: nextStoreLabel,
      storeId:
        Number.isFinite(nextStoreId) && nextStoreId > 0 ? nextStoreId : null,
      bucketLabel: nextBucketLabel,
      aisleId:
        Number.isFinite(nextAisleId) && nextAisleId > 0 ? nextAisleId : null,
      aisleSortOrder: Number.isFinite(nextAisleSortOrder)
        ? nextAisleSortOrder
        : null,
      sourceKey: String(conflict?.sourceKey || row?.sourceKey || '').trim(),
      sourceText: nextGeneratedText,
      sourceStoreLabel: nextStoreLabel,
      sourceBucketLabel: nextBucketLabel,
      userEdited: true,
    };
  }

  return normalizeShoppingListDoc({
    version: SHOPPING_LIST_DOC_VERSION,
    rows,
  });
}

function shoppingListStoreCollapseKey(storeLabel) {
  return `sl-store:\x1e${String(storeLabel || '')}`;
}

function shoppingListAisleCollapseKey(storeLabel, bucketLabel) {
  return `sl-aisle:\x1e${String(storeLabel || '')}\x1e${String(bucketLabel || '')}`;
}

function shoppingListPseudoUnlistedCollapseKey() {
  return 'sl-pseudo-unlisted';
}

function shoppingListCompletedCollapseKey(storeLabel) {
  return `completed\x1e${String(storeLabel || '')}`;
}

function toShoppingListAisleTitleCase(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  return normalized.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeShoppingListBucketKey(bucketLabel) {
  return String(bucketLabel || '')
    .trim()
    .toLowerCase();
}

function getShoppingListDocBucketKey(row) {
  const aisleId = Math.trunc(Number(row?.aisleId));
  if (Number.isFinite(aisleId) && aisleId > 0) {
    return `aisle:${aisleId}`;
  }
  return `label:${normalizeShoppingListBucketKey(row?.bucketLabel)}`;
}

function getShoppingListBucketDescriptors(rows) {
  const buckets = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = getShoppingListDocBucketKey(row);
    const label = String(row?.bucketLabel || '').trim();
    const aisleId = Math.trunc(Number(row?.aisleId));
    const rawSortOrder = Number(row?.aisleSortOrder);
    const hasExplicitSortOrder =
      row?.aisleSortOrder != null && String(row.aisleSortOrder).trim() !== '';
    const sortOrder =
      hasExplicitSortOrder && Number.isFinite(rawSortOrder)
        ? rawSortOrder
        : 999999;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label,
        sortOrder,
        aisleId: Number.isFinite(aisleId) && aisleId > 0 ? aisleId : null,
        firstIndex: index,
      });
      return;
    }
    const bucket = buckets.get(key);
    if (!bucket.label && label) {
      bucket.label = label;
    }
    if (sortOrder < bucket.sortOrder) {
      bucket.sortOrder = sortOrder;
    }
    if (
      Number.isFinite(aisleId) &&
      aisleId > 0 &&
      (!Number.isFinite(bucket.aisleId) ||
        bucket.aisleId == null ||
        aisleId < bucket.aisleId)
    ) {
      bucket.aisleId = aisleId;
    }
  });
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    const aisleIdA = Number.isFinite(a.aisleId) ? a.aisleId : 999999;
    const aisleIdB = Number.isFinite(b.aisleId) ? b.aisleId : 999999;
    if (aisleIdA !== aisleIdB) {
      return aisleIdA - aisleIdB;
    }
    const hasExplicitOrderA =
      (Number.isFinite(a.sortOrder) && a.sortOrder < 999999) ||
      Number.isFinite(a.aisleId);
    const hasExplicitOrderB =
      (Number.isFinite(b.sortOrder) && b.sortOrder < 999999) ||
      Number.isFinite(b.aisleId);
    if (!hasExplicitOrderA && !hasExplicitOrderB) {
      return a.firstIndex - b.firstIndex;
    }
    const labelDelta = String(a.label || '').localeCompare(
      String(b.label || ''),
      undefined,
      {
        sensitivity: 'base',
      },
    );
    if (labelDelta !== 0) {
      return labelDelta;
    }
    return a.firstIndex - b.firstIndex;
  });
}

function buildShoppingListRemovedPseudoStoreDisplayRows(rows, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => shoppingListRowMatchesSearch(row, normalizedQuery))
    : rows;
  if (!visibleRows.length) return [];
  const out = [];
  out.push({
    rowType: 'section',
    text: SHOPPING_LIST_REMOVED_SECTION_DISPLAY_LABEL,
    className:
      'shopping-list-section--removed shopping-list-section--pseudo-removed-root',
    sectionCollapseKey: shoppingListPseudoRemovedCollapseKey(),
    collapseBoundary: 'pseudo-removed-root',
    collapsible: true,
    showRestoreAll: true,
  });
  sortShoppingListRowsByText(visibleRows, options).forEach((row) => {
    out.push(
      createShoppingListDisplayItemRow(row, {
        listRemoved: true,
      }),
    );
  });
  return out;
}

function formatShoppingListPlainText(docRows) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) =>
      !row?.checked &&
      !isShoppingListRowListRemoved(row) &&
      String(row?.text || '').trim(),
  );
  if (!rows.length) return '';

  const seenStores = new Set();
  const storeOrderScratch = [];
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrderScratch.push(key);
  });
  const storeOrder = orderShoppingListChecklistStoreLabels(storeOrderScratch);

  const lines = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;
    if (lines.length) lines.push('');
    const normalizedStoreLabel = String(storeLabel || '').trim();
    lines.push((normalizedStoreLabel || 'Unlisted').toUpperCase());

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketLabel = String(bucket?.label || '').trim();
      const normalizedBucketLabel = bucketLabel;
      if (
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        )
      ) {
        lines.push(toShoppingListAisleTitleCase(normalizedBucketLabel));
      }
      storeRows
        .filter((row) => getShoppingListDocBucketKey(row) === bucket.key)
        .forEach((row) => {
          lines.push(`- ${String(row?.text || '').trim()}`);
        });
    });
  });

  return lines.join('\n');
}

function formatShoppingListHtml(docRows) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) =>
      !row?.checked &&
      !isShoppingListRowListRemoved(row) &&
      String(row?.text || '').trim(),
  );
  if (!rows.length) return '';

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const seenStores = new Set();
  const storeOrderScratch = [];
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrderScratch.push(key);
  });
  const storeOrder = orderShoppingListChecklistStoreLabels(storeOrderScratch);

  const blocks = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;
    if (blocks.length) blocks.push('<br>');

    const normalizedStoreLabel = String(storeLabel || '').trim();
    blocks.push(
      `<p>${escapeHtml((normalizedStoreLabel || 'Unlisted').toUpperCase())}</p>`,
    );

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketLabel = String(bucket?.label || '').trim();
      const normalizedBucketLabel = bucketLabel;
      const shouldShowBucketLabel =
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        );
      if (shouldShowBucketLabel) {
        blocks.push(
          `<p>${escapeHtml(toShoppingListAisleTitleCase(normalizedBucketLabel))}</p>`,
        );
      }
      const bucketItems = storeRows.filter(
        (row) => getShoppingListDocBucketKey(row) === bucket.key,
      );
      if (!bucketItems.length) return;
      blocks.push('<ul>');
      bucketItems.forEach((row) => {
        blocks.push(`<li>${escapeHtml(String(row?.text || '').trim())}</li>`);
      });
      blocks.push('</ul>');
    });
  });

  return blocks.join('');
}

function formatShoppingListDisplaySectionHeaderLine(row) {
  if (row?.rowType !== 'section') return '';
  const boundary = String(row.collapseBoundary || '').trim();
  const text = String(row.text || row.label || '').trim();
  if (
    boundary === 'store' ||
    boundary === 'home' ||
    boundary === 'pseudo-unlisted-root'
  ) {
    return (text || 'Unlisted').toUpperCase();
  }
  if (
    boundary === 'aisle' ||
    boundary === 'plain-aisle' ||
    boundary === 'completed'
  ) {
    return toShoppingListAisleTitleCase(
      text || (boundary === 'completed' ? 'completed' : ''),
    );
  }
  return toShoppingListAisleTitleCase(text) || (text || '').toUpperCase();
}

function formatShoppingListPlainTextFromViewState(
  visibleRows,
  { selectedRecipes = [], recipesExpanded = false } = {},
) {
  const lines = [];
  if (
    recipesExpanded &&
    Array.isArray(selectedRecipes) &&
    selectedRecipes.length
  ) {
    lines.push('RECIPES');
    selectedRecipes.forEach((recipe) => {
      const title = String(recipe?.title || '').trim();
      if (!title) return;
      const parts = String(recipe?.servingsText || '').trim();
      lines.push(parts ? `- ${title} (${parts})` : `- ${title}`);
    });
  }
  if (!Array.isArray(visibleRows)) return lines.join('\n');
  visibleRows.forEach((row) => {
    if (row?.rowType === 'section') {
      const boundary = String(row.collapseBoundary || '').trim();
      if (boundary === 'pseudo-removed-root') return;
      if (
        boundary === 'store' ||
        boundary === 'home' ||
        boundary === 'pseudo-unlisted-root'
      ) {
        if (lines.length) {
          lines.push('');
        }
      }
      const header = formatShoppingListDisplaySectionHeaderLine(row);
      if (header) {
        lines.push(header);
      }
      return;
    }
    if (row?.rowType === 'item') {
      if (row.checked || row.listRemoved) return;
      const t = String(row.text || '').trim();
      if (!t) return;
      lines.push(`- ${t}`);
    }
  });
  return lines.join('\n');
}

function formatShoppingListHtmlFromViewState(
  visibleRows,
  { selectedRecipes = [], recipesExpanded = false } = {},
) {
  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const blocks = [];
  let openList = false;
  const closeList = () => {
    if (!openList) return;
    blocks.push('</ul>');
    openList = false;
  };

  if (
    recipesExpanded &&
    Array.isArray(selectedRecipes) &&
    selectedRecipes.length
  ) {
    blocks.push(`<p>${escapeHtml('RECIPES')}</p>`);
    blocks.push('<ul>');
    openList = true;
    selectedRecipes.forEach((recipe) => {
      const title = String(recipe?.title || '').trim();
      if (!title) return;
      const parts = String(recipe?.servingsText || '').trim();
      const liText = parts
        ? `${escapeHtml(title)} (${escapeHtml(parts)})`
        : escapeHtml(title);
      blocks.push(`<li>${liText}</li>`);
    });
    closeList();
  }

  if (!Array.isArray(visibleRows) || !visibleRows.length) {
    return blocks.join('');
  }

  visibleRows.forEach((row) => {
    if (row?.rowType === 'section') {
      closeList();
      const boundary = String(row.collapseBoundary || '').trim();
      if (boundary === 'pseudo-removed-root') return;
      if (
        boundary === 'store' ||
        boundary === 'home' ||
        boundary === 'pseudo-unlisted-root'
      ) {
        if (blocks.length) {
          blocks.push('<br>');
        }
      }
      const header = formatShoppingListDisplaySectionHeaderLine(row);
      if (header) {
        blocks.push(`<p>${escapeHtml(header)}</p>`);
      }
      return;
    }
    if (row?.rowType === 'item') {
      if (row.checked || row.listRemoved) return;
      const t = String(row.text || '').trim();
      if (!t) return;
      if (!openList) {
        blocks.push('<ul>');
        openList = true;
      }
      blocks.push(`<li>${escapeHtml(t)}</li>`);
    }
  });
  closeList();
  return blocks.join('');
}

function buildShoppingListExportPayload(docRows, options = {}) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows.filter(
    (row) =>
      !row?.checked &&
      !isShoppingListRowListRemoved(row) &&
      String(row?.text || '').trim(),
  );
  const title = String(options?.title || '').trim() || 'Shopping List';
  if (!rows.length) {
    return { title, stores: [] };
  }

  const seenStores = new Set();
  const storeOrderScratch = [];
  rows.forEach((row) => {
    const key = String(row?.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrderScratch.push(key);
  });
  const storeOrder = orderShoppingListChecklistStoreLabels(storeOrderScratch);

  const stores = [];
  storeOrder.forEach((storeLabel) => {
    const storeRows = rows.filter(
      (row) => String(row?.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;

    const normalizedStoreLabel = String(storeLabel || '').trim();
    const storeEntry = {
      label: (normalizedStoreLabel || 'Unlisted').toUpperCase(),
      aisles: [],
    };

    const bucketDescriptors = getShoppingListBucketDescriptors(storeRows);
    const soleUnlistedPseudo =
      !normalizedStoreLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    bucketDescriptors.forEach((bucket) => {
      const bucketRows = storeRows.filter(
        (row) => getShoppingListDocBucketKey(row) === bucket.key,
      );
      if (!bucketRows.length) return;
      const normalizedBucketLabel = String(bucket?.label || '').trim();
      const shouldShowBucketLabel =
        normalizedBucketLabel &&
        !(
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(normalizedBucketLabel) === 'unlisted'
        );
      storeEntry.aisles.push({
        label: shouldShowBucketLabel
          ? toShoppingListAisleTitleCase(normalizedBucketLabel)
          : '',
        items: bucketRows
          .map((row) => String(row?.text || '').trim())
          .filter(Boolean),
      });
    });

    if (storeEntry.aisles.length) {
      stores.push(storeEntry);
    }
  });

  return { title, stores };
}

function filterShoppingListChecklistRowsForCollapse(
  displayRows,
  collapsedKeys,
) {
  const collapsed = new Set(
    collapsedKeys == null
      ? []
      : typeof collapsedKeys[Symbol.iterator] === 'function'
        ? collapsedKeys
        : [],
  );
  const out = [];
  let topCollapsed = false;
  let aisleCollapsed = false;

  displayRows.forEach((row) => {
    if (row?.rowType === 'section') {
      const boundary = String(row.collapseBoundary || '').trim();
      if (
        boundary === 'store' ||
        boundary === 'pseudo-unlisted-root' ||
        boundary === 'pseudo-removed-root' ||
        boundary === 'home'
      ) {
        const key = String(row.sectionCollapseKey || '');
        topCollapsed = !!(key && collapsed.has(key));
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      if (topCollapsed) {
        return;
      }
      if (boundary === 'completed') {
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      if (boundary === 'aisle') {
        const key = String(row.sectionCollapseKey || '');
        const canCollapse = !!row.collapsible && !!key;
        aisleCollapsed = !!(canCollapse && collapsed.has(key));
        out.push(row);
        return;
      }
      if (boundary === 'plain-aisle') {
        aisleCollapsed = false;
        out.push(row);
        return;
      }
      out.push(row);
      return;
    }

    if (row?.rowType === 'item') {
      if (topCollapsed) {
        return;
      }
      if (
        row.completedSectionKey &&
        collapsed.has(String(row.completedSectionKey || ''))
      ) {
        return;
      }
      if (aisleCollapsed) {
        return;
      }
      out.push(row);
    }
  });

  return out;
}

function getShoppingListHomeLocationDefs() {
  return typeof window !== 'undefined' &&
    typeof window.getHomeLocationDefs === 'function'
    ? window.getHomeLocationDefs()
    : [
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
}

const SHOPPING_LIST_HOME_LOCATION_DEFS =
  typeof window !== 'undefined' &&
  typeof window.getHomeLocationDefs === 'function'
    ? window.getHomeLocationDefs()
    : [
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
/** Same as SHOPPING_PLAN_KEY_SEP — literal avoids helper-bundle ordering issues in tests. */
const SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP = '\x1e';

function normalizeShoppingHomeLocationId(raw) {
  if (
    typeof window !== 'undefined' &&
    typeof window.normalizeHomeLocationId === 'function'
  ) {
    return window.normalizeHomeLocationId(raw);
  }
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value || value === 'measures') return 'none';
  return getShoppingListHomeLocationDefs().some((entry) => entry.id === value)
    ? value
    : 'none';
}

function normalizeIngredientVariantRows(rows, options = {}) {
  const fallbackBaseHome = normalizeShoppingHomeLocationId(
    options?.fallbackBaseHome || 'none',
  );
  const normalizeRowTags = (rawTags) =>
    normalizeRecipeTagList(
      Array.isArray(rawTags)
        ? rawTags
        : rawTags == null
          ? []
          : String(rawTags)
              .split(/[\n,]/)
              .map((value) => String(value || '').trim()),
    );
  const mergeTagLists = (left, right) =>
    normalizeRecipeTagList([
      ...(Array.isArray(left) ? left : []),
      ...(Array.isArray(right) ? right : []),
    ]);
  const namedRows = [];
  const namedRowsByKey = new Map();
  let baseRow = null;

  (Array.isArray(rows) ? rows : []).forEach((rawRow) => {
    const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
    const isBase = !!row.isBase || isIngredientBaseVariantName(row.value);
    const normalizedHome = normalizeShoppingHomeLocationId(
      row.homeLocation != null
        ? row.homeLocation
        : row.home != null
          ? row.home
          : isBase
            ? fallbackBaseHome
            : 'none',
    );
    const normalizedTags = normalizeRowTags(
      row.tags != null ? row.tags : row.tagNames != null ? row.tagNames : [],
    );

    const depFlag = !!row.isDeprecated;
    const vId = Number(row.variantId);
    if (isBase) {
      if (!baseRow) {
        baseRow = {
          isBase: true,
          value: '',
          homeLocation: normalizedHome,
          tags: normalizedTags,
          variantId: Number.isFinite(vId) && vId > 0 ? vId : null,
          isDeprecated: false,
        };
      } else {
        if (Number.isFinite(vId) && vId > 0) baseRow.variantId = vId;
        if (depFlag) baseRow.isDeprecated = true;
        if (baseRow.homeLocation === 'none' && normalizedHome !== 'none') {
          baseRow.homeLocation = normalizedHome;
          baseRow.tags = mergeTagLists(baseRow.tags, normalizedTags);
        } else if (normalizedTags.length) {
          baseRow.tags = mergeTagLists(baseRow.tags, normalizedTags);
        }
      }
      return;
    }

    const normalizedValue = normalizeNamedIngredientVariant(row.value);
    if (!normalizedValue) return;
    const rowKey = normalizedValue.toLowerCase();
    const existing = namedRowsByKey.get(rowKey);
    if (existing) {
      if (depFlag) existing.isDeprecated = true;
      if (Number.isFinite(vId) && vId > 0) existing.variantId = vId;
      if (existing.homeLocation === 'none' && normalizedHome !== 'none') {
        existing.homeLocation = normalizedHome;
      }
      if (normalizedTags.length) {
        existing.tags = mergeTagLists(existing.tags, normalizedTags);
      }
      return;
    }

    const normalizedRow = {
      isBase: false,
      value: normalizedValue,
      homeLocation: normalizedHome,
      tags: normalizedTags,
      variantId: Number.isFinite(vId) && vId > 0 ? vId : null,
      isDeprecated: depFlag,
    };
    namedRowsByKey.set(rowKey, normalizedRow);
    namedRows.push(normalizedRow);
  });

  return [
    baseRow || {
      isBase: true,
      value: '',
      homeLocation: fallbackBaseHome,
      tags: [],
    },
    ...namedRows,
  ];
}

function serializeIngredientVariantRows(rows, options = {}) {
  try {
    return JSON.stringify(normalizeIngredientVariantRows(rows, options));
  } catch (_) {
    return JSON.stringify(
      normalizeIngredientVariantRows([], {
        fallbackBaseHome: options?.fallbackBaseHome || 'none',
      }),
    );
  }
}

function parseIngredientVariantRowsSerialized(rawValue, options = {}) {
  const fallbackBaseHome = normalizeShoppingHomeLocationId(
    options?.fallbackBaseHome || 'none',
  );
  const serialized = String(rawValue || '').trim();
  if (!serialized) {
    return normalizeIngredientVariantRows([], { fallbackBaseHome });
  }

  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) {
      return normalizeIngredientVariantRows(parsed, { fallbackBaseHome });
    }
  } catch (_) {}

  return normalizeIngredientVariantRows(
    serialized.split('\n').map((value) => ({
      isBase: false,
      value,
      homeLocation: 'none',
      tags: [],
    })),
    { fallbackBaseHome },
  );
}

function getShoppingListSourceBaseKey(sourceKey) {
  const normalized = String(sourceKey || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  const iNul = normalized.indexOf('\x00');
  const iRs = normalized.indexOf('\x1e');
  let sepIndex = -1;
  if (iNul >= 0 && iRs >= 0) sepIndex = Math.min(iNul, iRs);
  else sepIndex = iNul >= 0 ? iNul : iRs;
  return sepIndex === -1 ? normalized : normalized.slice(0, sepIndex);
}

function shoppingListHomeCollapseKey(locationId) {
  return `home:${normalizeShoppingHomeLocationId(locationId)}`;
}

function itemsBrowseHomeCollapseKey(locationId) {
  return `items-browse-home:${normalizeShoppingHomeLocationId(locationId)}`;
}

function shoppingListHomeCompletedCollapseKey() {
  return 'completed:home';
}

function shoppingListRowMatchesSearch(row, query) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;
  return String(row?.text || '')
    .toLowerCase()
    .includes(normalizedQuery);
}

function compareShoppingListRowText(a, b) {
  const textDelta = String(a?.text || '').localeCompare(
    String(b?.text || ''),
    undefined,
    { sensitivity: 'base' },
  );
  if (textDelta !== 0) return textDelta;
  return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, {
    sensitivity: 'base',
  });
}

function getShoppingListRowSortBaseKey(row) {
  const sourceKey = String(row?.sourceKey || '')
    .trim()
    .toLowerCase();
  const baseFromSource = getShoppingListSourceBaseKey(sourceKey);
  if (baseFromSource) return baseFromSource;
  return String(row?.text || '')
    .trim()
    .toLowerCase();
}

function getShoppingListRowVariantSortSuffix(row) {
  const sourceKey = String(row?.sourceKey || '')
    .trim()
    .toLowerCase();
  if (!sourceKey) return null;
  const baseKey = getShoppingListSourceBaseKey(sourceKey);
  if (!baseKey) return null;
  if (typeof getShoppingPlanVariantSuffixAfterBase === 'function') {
    const suffix = getShoppingPlanVariantSuffixAfterBase(baseKey, sourceKey);
    if (suffix === null) return null;
    return String(suffix || '')
      .trim()
      .toLowerCase();
  }
  if (sourceKey === baseKey) return '';
  return sourceKey.slice(baseKey.length + 1).trim().toLowerCase();
}

function getShoppingListRowVariantSortRank(row) {
  const suffix = getShoppingListRowVariantSortSuffix(row);
  if (suffix === '') return 0;
  if (suffix == null) return 2;
  return 1;
}

function compareShoppingListRowsByBase(a, b) {
  const baseDelta = getShoppingListRowSortBaseKey(a).localeCompare(
    getShoppingListRowSortBaseKey(b),
    undefined,
    { sensitivity: 'base' },
  );
  if (baseDelta !== 0) return baseDelta;

  const rankDelta =
    getShoppingListRowVariantSortRank(a) - getShoppingListRowVariantSortRank(b);
  if (rankDelta !== 0) return rankDelta;

  const suffixA = getShoppingListRowVariantSortSuffix(a);
  const suffixB = getShoppingListRowVariantSortSuffix(b);
  if (suffixA != null && suffixB != null && suffixA !== suffixB) {
    const suffixDelta = suffixA.localeCompare(suffixB, undefined, {
      sensitivity: 'base',
    });
    if (suffixDelta !== 0) return suffixDelta;
  }

  return compareShoppingListRowText(a, b);
}

function sortShoppingListRowsByText(rows, options = {}) {
  const compare =
    options?.groupItemVariants === true
      ? compareShoppingListRowsByBase
      : compareShoppingListRowText;
  return (Array.isArray(rows) ? rows : []).slice().sort(compare);
}

function createShoppingListDisplayItemRow(row, extra = {}) {
  return {
    rowType: 'item',
    id: row.id,
    text: row.text,
    checked: !!row.checked,
    className: 'shopping-list-group-item shopping-list-doc-item',
    sourceKey: String(row.sourceKey || '').trim(),
    sourceText: String(row.sourceText || '').trim(),
    userEdited: !!row.userEdited,
    ...extra,
  };
}

function buildShoppingListChecklistStoreDisplayRows(rows, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const isSearchActive = !!normalizedQuery;
  const keepCompletedInPlace = !!options?.keepCompletedInPlace;
  const visibleRows = isSearchActive
    ? rows.filter((row) => shoppingListRowMatchesSearch(row, normalizedQuery))
    : rows;
  const out = [];

  const seenStores = new Set();
  const storeOrderScratch = [];
  visibleRows.forEach((row) => {
    const key = String(row.storeLabel || '');
    if (seenStores.has(key)) return;
    seenStores.add(key);
    storeOrderScratch.push(key);
  });
  const storeOrder = orderShoppingListChecklistStoreLabels(storeOrderScratch);

  const pushItemRows = (items, extra = {}) => {
    sortShoppingListRowsByText(items, options).forEach((row) => {
      out.push(createShoppingListDisplayItemRow(row, extra));
    });
  };

  storeOrder.forEach((storeLabel) => {
    const storeRows = visibleRows.filter(
      (row) => String(row.storeLabel || '') === storeLabel,
    );
    if (!storeRows.length) return;

    if (isShoppingListRemovedPseudoStoreLabel(storeLabel)) {
      out.push({
        rowType: 'section',
        text: SHOPPING_LIST_REMOVED_SECTION_DISPLAY_LABEL,
        className:
          'shopping-list-section--removed shopping-list-section--pseudo-removed-root',
        sectionCollapseKey: shoppingListPseudoRemovedCollapseKey(),
        collapseBoundary: 'pseudo-removed-root',
        collapsible: true,
        showRestoreAll: true,
      });
      sortShoppingListRowsByText(storeRows, options).forEach((row) => {
        out.push(
          createShoppingListDisplayItemRow(row, {
            listRemoved: true,
          }),
        );
      });
      return;
    }

    const activeRows = storeRows.filter((row) => !row.checked);
    const completedRows = storeRows.filter((row) => row.checked);
    const bucketDescriptorSourceRows = keepCompletedInPlace
      ? storeRows
      : isSearchActive
        ? activeRows
        : [...activeRows, ...completedRows];
    const bucketDescriptors = getShoppingListBucketDescriptors(
      bucketDescriptorSourceRows,
    );

    const soleUnlistedPseudo =
      !storeLabel &&
      bucketDescriptors.length === 1 &&
      normalizeShoppingListBucketKey(bucketDescriptors[0]?.label) ===
        'unlisted';

    if (storeLabel) {
      out.push({
        rowType: 'section',
        text: storeLabel,
        className: 'shopping-list-section--store',
        sectionCollapseKey: shoppingListStoreCollapseKey(storeLabel),
        collapseBoundary: 'store',
        collapsible: true,
      });
    } else {
      out.push({
        rowType: 'section',
        text: 'Unlisted',
        className:
          'shopping-list-section--unlisted shopping-list-section--pseudo-unlisted-root',
        sectionCollapseKey: shoppingListPseudoUnlistedCollapseKey(),
        collapseBoundary: 'pseudo-unlisted-root',
        collapsible: true,
      });
    }

    const pushBucket = (bucket, items) => {
      const list = Array.isArray(items) ? items : [];
      const allBucketRows = storeRows.filter(
        (row) => getShoppingListDocBucketKey(row) === bucket.key,
      );
      if (!allBucketRows.length) return;

      const label = String(bucket?.label || '').trim();
      if (!label) {
        if (!list.length) return;
        pushItemRows(list);
        return;
      }
      if (!storeLabel) {
        if (
          soleUnlistedPseudo &&
          normalizeShoppingListBucketKey(label) === 'unlisted'
        ) {
          if (!list.length) return;
          pushItemRows(list);
          return;
        }
        out.push({
          rowType: 'section',
          text: label,
          className:
            normalizeShoppingListBucketKey(label) === 'unlisted'
              ? 'shopping-list-section--unlisted'
              : 'shopping-list-section--aisle',
          collapseBoundary: 'plain-aisle',
          collapsible: false,
        });
      } else {
        out.push({
          rowType: 'section',
          text: label,
          className: 'shopping-list-section--aisle',
          sectionCollapseKey: shoppingListAisleCollapseKey(storeLabel, label),
          collapseBoundary: 'aisle',
          collapsible: list.length > 0,
        });
      }
      if (!list.length) return;
      pushItemRows(list);
    };

    const rowsForBucketItems = keepCompletedInPlace ? storeRows : activeRows;
    bucketDescriptors.forEach((bucket) => {
      pushBucket(
        bucket,
        rowsForBucketItems.filter(
          (row) => getShoppingListDocBucketKey(row) === bucket.key,
        ),
      );
    });

    if (!keepCompletedInPlace && completedRows.length) {
      const completedSectionKey = shoppingListCompletedCollapseKey(storeLabel);
      out.push({
        rowType: 'section',
        text: 'completed',
        className: 'shopping-list-section--completed',
        sectionKey: completedSectionKey,
        sectionCollapseKey: completedSectionKey,
        collapseBoundary: 'completed',
        collapsible: true,
      });
      sortShoppingListRowsByText(completedRows, options).forEach((row) => {
        out.push(
          createShoppingListDisplayItemRow(row, {
            completedSectionKey,
          }),
        );
      });
    }
  });

  return out;
}

function getShoppingListHomeLocationIdForRow(row, homeLocationBySourceKey) {
  const sourceKey = String(row?.sourceKey || '')
    .trim()
    .toLowerCase();
  const lookup =
    homeLocationBySourceKey instanceof Map
      ? homeLocationBySourceKey
      : new Map(Object.entries(homeLocationBySourceKey || {}));
  const baseKey = getShoppingListSourceBaseKey(sourceKey);

  let resolved = 'none';
  if (sourceKey && lookup.has(sourceKey)) {
    resolved = normalizeShoppingHomeLocationId(lookup.get(sourceKey));
  }
  if (resolved === 'none' && baseKey && lookup.has(baseKey)) {
    resolved = normalizeShoppingHomeLocationId(lookup.get(baseKey));
  }
  return resolved;
}

function buildShoppingListChecklistHomeDisplayRows(rows, options = {}) {
  const normalizedQuery = String(options?.searchQuery || '')
    .trim()
    .toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => shoppingListRowMatchesSearch(row, normalizedQuery))
    : rows;
  const keepCompletedInPlace = !!options?.keepCompletedInPlace;
  const out = [];
  const homeLocationBySourceKey =
    options?.homeLocationBySourceKey instanceof Map
      ? options.homeLocationBySourceKey
      : new Map(Object.entries(options?.homeLocationBySourceKey || {}));

  if (keepCompletedInPlace) {
    getShoppingListHomeLocationDefs().forEach((locationDef) => {
      const locationRows = visibleRows.filter(
        (row) =>
          getShoppingListHomeLocationIdForRow(row, homeLocationBySourceKey) ===
          locationDef.id,
      );
      if (!locationRows.length) return;
      out.push({
        rowType: 'section',
        text: locationDef.label,
        className: 'shopping-list-section--store',
        sectionCollapseKey: shoppingListHomeCollapseKey(locationDef.id),
        collapseBoundary: 'home',
        collapsible: true,
      });
      sortShoppingListRowsByText(locationRows, options).forEach((row) => {
        out.push(
          createShoppingListDisplayItemRow(row, {
            homeLocationId: locationDef.id,
            homeLocationLabel: locationDef.label,
          }),
        );
      });
    });
    return out;
  }

  const activeRows = visibleRows.filter((row) => !row.checked);
  const completedRows = visibleRows.filter((row) => row.checked);

  getShoppingListHomeLocationDefs().forEach((locationDef) => {
    const locationRows = activeRows.filter(
      (row) =>
        getShoppingListHomeLocationIdForRow(row, homeLocationBySourceKey) ===
        locationDef.id,
    );
    if (!locationRows.length) return;
    out.push({
      rowType: 'section',
      text: locationDef.label,
      className: 'shopping-list-section--store',
      sectionCollapseKey: shoppingListHomeCollapseKey(locationDef.id),
      collapseBoundary: 'home',
      collapsible: true,
    });
    sortShoppingListRowsByText(locationRows, options).forEach((row) => {
      out.push(
        createShoppingListDisplayItemRow(row, {
          homeLocationId: locationDef.id,
          homeLocationLabel: locationDef.label,
        }),
      );
    });
  });

  if (completedRows.length) {
    const completedSectionKey = shoppingListHomeCompletedCollapseKey();
    out.push({
      rowType: 'section',
      text: 'completed',
      className: 'shopping-list-section--completed',
      sectionKey: completedSectionKey,
      sectionCollapseKey: completedSectionKey,
      collapseBoundary: 'completed',
      collapsible: true,
    });
    sortShoppingListRowsByText(completedRows, options).forEach((row) => {
      out.push(
        createShoppingListDisplayItemRow(row, {
          completedSectionKey,
          homeLocationId: getShoppingListHomeLocationIdForRow(
            row,
            homeLocationBySourceKey,
          ),
        }),
      );
    });
  }

  return out;
}

function getShoppingListChecklistDisplayRows(docRows, options = {}) {
  const rows = normalizeShoppingListDoc({ rows: docRows }).rows;
  const mode = String(options?.mode || 'stores')
    .trim()
    .toLowerCase();
  if (mode === 'home') {
    const activeRows = rows.filter((row) => !isShoppingListRowListRemoved(row));
    const removedRows = rows.filter((row) => isShoppingListRowListRemoved(row));
    const out = buildShoppingListChecklistHomeDisplayRows(activeRows, options);
    if (!removedRows.length) return out;
    return out.concat(
      buildShoppingListRemovedPseudoStoreDisplayRows(removedRows, options),
    );
  }
  return buildShoppingListChecklistStoreDisplayRows(rows, options);
}

function shoppingListDisplaySectionIsSecondary(row) {
  const className = String(row?.className || '');
  return (
    className.includes('shopping-list-section--completed') ||
    className.includes('shopping-list-section--removed')
  );
}

function createSectionToggleButton({
  label = '',
  expanded = true,
  onToggle,
  completed = false,
  secondary = false,
}) {
  const isSecondary = secondary || completed;
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = isSecondary
    ? 'shopping-list-section-toggle shopping-list-section-toggle--secondary'
    : 'shopping-list-section-toggle';
  toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'shopping-list-section-toggle__label';
  toggleLabel.textContent = String(label || '').trim();
  toggleBtn.appendChild(toggleLabel);
  const toggleIcon = document.createElement('span');
  toggleIcon.className =
    'material-symbols-outlined shopping-list-section-toggle__icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.textContent = 'expand_more';
  toggleBtn.appendChild(toggleIcon);
  if (typeof onToggle === 'function') {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle(event);
    });
  }
  return toggleBtn;
}

function createShoppingListSectionHeader({
  label = '',
  expanded = true,
  onToggle,
  secondary = false,
  trailingActions = [],
} = {}) {
  const toggleBtn = createSectionToggleButton({
    label,
    expanded,
    onToggle,
    secondary,
  });
  if (!Array.isArray(trailingActions) || !trailingActions.length) {
    return toggleBtn;
  }
  const headerRow = document.createElement('div');
  headerRow.className = 'shopping-list-section-header-row';
  headerRow.appendChild(toggleBtn);
  trailingActions.forEach((action) => {
    if (!action || typeof action.onClick !== 'function') return;
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = String(
      action.className ||
        'recipe-editor-manage-link shopping-list-section-header-action',
    ).trim();
    actionBtn.textContent = String(action.label || '').trim();
    actionBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      action.onClick(event);
    });
    headerRow.appendChild(actionBtn);
  });
  return headerRow;
}

function getShoppingListSelectedRecipeSummaryRows({
  db = window.dbInstance,
} = {}) {
  const selections = Object.values(getShoppingPlanRecipeSelections()).filter(
    (entry) => Number(entry?.recipeId) > 0,
  );
  if (!selections.length) return [];
  const formatServingsValue = (rawValue) => {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    if (typeof window.formatShoppingQtyForDisplay === 'function') {
      return String(window.formatShoppingQtyForDisplay(numeric) || '').trim();
    }
    return Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
  };
  return selections
    .map((selection) => {
      const recipeId = Math.trunc(Number(selection?.recipeId));
      if (!Number.isFinite(recipeId) || recipeId <= 0) return null;
      const recipe = favoriteEatsShouldUseSupabaseDataDoor()
        ? null
        : db
          ? loadShoppingPlanRecipeFromDB(db, recipeId)
          : null;
      const title =
        String(selection?.title || '').trim() ||
        String(recipe?.title || '').trim() ||
        `Recipe ${recipeId}`;
      const recipeDefaultServings = Number(
        recipe?.servings?.default != null
          ? recipe.servings.default
          : recipe?.servingsDefault,
      );
      const selectedServings = getRecipePlannerServingsStoredValue(
        recipeId,
        recipe,
      );
      const servingsValue =
        Number.isFinite(selectedServings) && selectedServings > 0
          ? selectedServings
          : Number.isFinite(recipeDefaultServings) && recipeDefaultServings > 0
            ? recipeDefaultServings
            : null;
      const formattedServings = formatServingsValue(servingsValue);
      return {
        recipeId,
        title,
        servingsText: formattedServings ? `${formattedServings} svg` : '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const titleDelta = String(a?.title || '').localeCompare(
        String(b?.title || ''),
        undefined,
        {
          sensitivity: 'base',
        },
      );
      if (titleDelta !== 0) return titleDelta;
      return Number(a?.recipeId || 0) - Number(b?.recipeId || 0);
    });
}

async function getShoppingListSelectedRecipeSummaryRowsViaDataService({
  db = window.dbInstance,
} = {}) {
  const supabaseActive = favoriteEatsDataServiceIsSupabaseActive();
  const selections = Object.values(getShoppingPlanRecipeSelections())
    .filter((entry) => Number(entry?.recipeId) > 0)
    .map((entry) => {
      const recipeId = Math.trunc(Number(entry?.recipeId));
      return {
        recipeId,
        title: String(entry?.title || '').trim(),
        servings: getRecipePlannerServingsStoredValue(recipeId),
      };
    });
  if (!selections.length) return [];
  if (
    !window.dataService ||
    typeof window.dataService.listShoppingListRecipeSummaries !== 'function'
  ) {
    if (supabaseActive) {
      throw new Error(
        'dataService.listShoppingListRecipeSummaries is not available.',
      );
    }
    return getShoppingListSelectedRecipeSummaryRows({ db });
  }
  try {
    return await window.dataService.listShoppingListRecipeSummaries(selections);
  } catch (err) {
    if (supabaseActive) throw err;
    console.error('dataService.listShoppingListRecipeSummaries failed:', err);
    return getShoppingListSelectedRecipeSummaryRows({ db });
  }
}

if (typeof window !== 'undefined') {
  window.__shoppingListChecklistHelpers = {
    createEmptyShoppingListDoc,
    normalizeShoppingListDoc,
    doesShoppingListRowHaveUserOverride,
    buildShoppingListDocFromPlanRows,
    mergeShoppingListDocWithGenerated,
    isShoppingListDiscardChangesNoOp,
    applyShoppingListDiscardQuantityChanges,
    resolveShoppingListDocConflict,
    buildShoppingListQtyOnlyOverrideText,
    sanitizeShoppingListRowTextCommit,
    normalizeShoppingListRowQtyOnlyOverride,
    normalizeShoppingListDocQtyOnlyOverrides,
    shoppingListRowSupportsQtyOnlyEdit,
    shoppingListRowAmountDetailDivergedFromSource,
    shoppingListRowGeneratedSourceAmountDetailChanged,
    getShoppingListRowQtyDetailFromText,
    buildShoppingListQtyUpdateConflict,
    mergeShoppingListStoredRowWithGeneratedRow,
    formatShoppingListPlainText,
    formatShoppingListPlainTextFromViewState,
    formatShoppingListHtml,
    buildShoppingListExportPayload,
    getShoppingListChecklistDisplayRows,
    compareShoppingListRowText,
    compareShoppingListRowsByBase,
    sortShoppingListRowsByText,
    getShoppingListHomeLocationIdForRow,
    filterShoppingListChecklistRowsForCollapse,
    normalizeShoppingHomeLocationId,
    getShoppingListSourceBaseKey,
    shoppingListCompletedCollapseKey,
    shoppingListStoreCollapseKey,
    shoppingListAisleCollapseKey,
    shoppingListHomeCollapseKey,
    shoppingListPseudoUnlistedCollapseKey,
    shoppingListPseudoRemovedCollapseKey,
    isShoppingListRowListRemoved,
    isReservedShoppingListStoreName,
    applyShoppingListRowListRemove,
    applyShoppingListRowListRestore,
    SHOPPING_LIST_REMOVED_PSEUDO_STORE_LABEL,
    SHOPPING_RESERVED_STORE_NAME_ERROR,
    buildShoppingListRowPlacementRpcPayload,
  };
}
// --- End shopping list checklist helpers ---

// Shopping List page logic (Slice 7 phase 2 — UI in js/screens/shoppingListPage.js)
async function loadShoppingListPage() {
  registerFavoriteEatsShoppingListPageBridge();
  if (
    window.favoriteEatsShoppingListPage &&
    typeof window.favoriteEatsShoppingListPage.loadShoppingListPage === 'function'
  ) {
    return window.favoriteEatsShoppingListPage.loadShoppingListPage();
  }
  fePageLoadFoodIconFail();
}

// --- Shared helper for child editor pages (shopping, units, stores, …) ---

function wireChildEditorPage({
  backBtn,
  cancelBtn,
  saveBtn,
  appBarTitleEl,
  bodyTitleEl,
  initialTitle,
  backHref,
  onSave,
  extraFields,
  normalizeTitle: normalizeTitleFn,
  displayTitle: displayTitleFn,
  subtitleEl,
  initialSubtitle,
  normalizeSubtitle: normalizeSubtitleFn,
  subtitlePlaceholder: subtitlePlaceholderText,
  subtitleEmptyMeansHidden = false,
  subtitleRevealBtn = null,
  hideSubtitleWhenMatchesTitle = false,
  subtitlePlaceholderWhenEquivalentToTitle = false,
  extraDirtyState = null,
}) {
  if (!appBarTitleEl || !bodyTitleEl) return;

  const bodyTitleIsTextEntry =
    bodyTitleEl.tagName === 'INPUT' || bodyTitleEl.tagName === 'TEXTAREA';
  const readBodyTitleRaw = () => {
    if (bodyTitleIsTextEntry) return String(bodyTitleEl.value ?? '');
    return String(bodyTitleEl.textContent ?? '');
  };

  const subtitlePlaceholder = subtitlePlaceholderText || 'Abbreviation';
  const normalize = (value) => (value || '').trim();
  const normalizeTitle = normalizeTitleFn || normalize;
  const displayTitle = displayTitleFn || ((v) => v ?? '');
  const writeBodyTitleDom = (storedTitle) => {
    const shown = displayTitle(storedTitle) || '';
    if (bodyTitleIsTextEntry) bodyTitleEl.value = shown;
    else bodyTitleEl.textContent = shown;
  };
  const maybeAutoGrow = (el) => {
    try {
      if (el && typeof el.__feAutoGrowResize === 'function') {
        el.__feAutoGrowResize();
      }
    } catch (_) {}
  };
  let baselineTitle = normalizeTitle(initialTitle);
  const extras = Array.isArray(extraFields) ? extraFields : [];
  let baselineExtras = {};
  extras.forEach((f) => {
    if (!f || !f.key) return;
    baselineExtras[String(f.key)] = normalize(f.initialValue);
  });

  const hasSubtitle = !!subtitleEl && normalizeSubtitleFn;
  let baselineSubtitle = hasSubtitle
    ? initialSubtitle
      ? normalizeSubtitleFn(initialSubtitle)
      : ''
    : '';

  /** Store editor: no saved location — subtitle row only while title/subtitle editing or after user enters a location. */
  const emptySubtitleFlow = () =>
    !!(
      subtitleEmptyMeansHidden &&
      hasSubtitle &&
      !(baselineSubtitle || '').trim()
    );

  let titleSessionActive = false;
  let subtitleSessionActive = false;
  /** True between pointerdown on subtitle and subtitle click (title blurs first). */
  let subtitlePointerKeepAlive = false;
  /** Shown after subtitle blur; survives sync until Save/Cancel (fixes draft wipe when baseline non-empty). */
  let lastCommittedSubtitle = hasSubtitle ? baselineSubtitle || '' : '';

  writeBodyTitleDom(baselineTitle);
  appBarTitleEl.textContent = displayTitle(baselineTitle) || '';

  const setSubtitlePlaceholderClass = (showPlaceholder) => {
    try {
      if (showPlaceholder) subtitleEl.classList.add('placeholder-prompt');
      else subtitleEl.classList.remove('placeholder-prompt');
    } catch (_) {}
  };

  const syncSubtitleDomFromBaseline = () => {
    if (!hasSubtitle) return;
    const storedSubtitle = (lastCommittedSubtitle || '').trim()
      ? lastCommittedSubtitle
      : '';
    const titleForSubtitleCompare = normalizeTitle(readBodyTitleRaw());
    const subtitleMatchesTitle =
      hideSubtitleWhenMatchesTitle &&
      !!storedSubtitle &&
      normalizeSubtitleFn(storedSubtitle) === titleForSubtitleCompare;
    const titleComparableForHint = subtitlePlaceholderWhenEquivalentToTitle
      ? normalizeSubtitleFn(readBodyTitleRaw())
      : '';
    const nonDistinctForHint =
      subtitlePlaceholderWhenEquivalentToTitle &&
      (!storedSubtitle ||
        (!!storedSubtitle &&
          normalizeSubtitleFn(storedSubtitle) === titleComparableForHint));
    const subDisplay = nonDistinctForHint
      ? subtitlePlaceholder
      : storedSubtitle
        ? subtitleMatchesTitle
          ? ''
          : storedSubtitle
        : subtitlePlaceholder;
    if (!subtitleEmptyMeansHidden) {
      subtitleEl.style.display = '';
      subtitleEl.textContent = subDisplay;
      setSubtitlePlaceholderClass(
        nonDistinctForHint || subDisplay === subtitlePlaceholder,
      );
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
      try {
        subtitleEl.removeAttribute('aria-hidden');
      } catch (_) {}
      return;
    }
    if (!emptySubtitleFlow()) {
      subtitleEl.style.display = '';
      subtitleEl.textContent = subDisplay;
      setSubtitlePlaceholderClass(
        nonDistinctForHint || subDisplay === subtitlePlaceholder,
      );
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
      try {
        subtitleEl.removeAttribute('aria-hidden');
      } catch (_) {}
      return;
    }
    const hasPending = (lastCommittedSubtitle || '').trim().length > 0;
    const showRow =
      titleSessionActive ||
      subtitleSessionActive ||
      hasPending ||
      subtitlePointerKeepAlive;
    if (!showRow) {
      subtitleEl.textContent = '';
      setSubtitlePlaceholderClass(false);
      subtitleEl.style.display = 'none';
      subtitleEl.setAttribute('aria-hidden', 'true');
      if (subtitleRevealBtn) subtitleRevealBtn.style.display = '';
      return;
    }
    subtitleEl.style.display = '';
    subtitleEl.removeAttribute('aria-hidden');
    if (subtitleRevealBtn) subtitleRevealBtn.style.display = 'none';
    if (subtitleSessionActive) return;
    const showingPlaceholder = !hasPending;
    subtitleEl.textContent = showingPlaceholder
      ? subtitlePlaceholder
      : lastCommittedSubtitle;
    setSubtitlePlaceholderClass(showingPlaceholder);
  };

  if (hasSubtitle) syncSubtitleDomFromBaseline();

  if (subtitleRevealBtn && subtitleEmptyMeansHidden && hasSubtitle) {
    subtitleRevealBtn.addEventListener('click', () => {
      subtitleRevealBtn.style.display = 'none';
      subtitleEl.style.display = '';
      subtitleEl.textContent = subtitlePlaceholder;
      setSubtitlePlaceholderClass(true);
      try {
        subtitleEl.click();
      } catch (_) {}
    });
  }

  if (hasSubtitle && subtitleEmptyMeansHidden) {
    subtitleEl.addEventListener(
      'pointerdown',
      () => {
        if (emptySubtitleFlow()) subtitlePointerKeepAlive = true;
      },
      true,
    );
  }

  let isDirty = false;

  const pageDirty = () =>
    isDirty ||
    (typeof extraDirtyState?.isDirty === 'function' &&
      extraDirtyState.isDirty());

  const updateButtons = () => {
    const d = pageDirty();
    if (cancelBtn) cancelBtn.disabled = !d;
    if (saveBtn) saveBtn.disabled = !d;
  };

  updateButtons(); // page starts clean

  const markDirty = () => {
    if (!isDirty) {
      isDirty = true;
      updateButtons();
    }
  };

  const readNormalizedExtraSnapshot = () => {
    const extraValues = {};
    extras.forEach((f) => {
      if (!f || !f.key) return;
      const key = String(f.key);
      let raw = '';
      try {
        if (typeof f.getValue === 'function') {
          raw = f.getValue();
        } else {
          const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
          const primaryEl = f.el || els[0] || null;
          if (!primaryEl) return;
          if ('value' in primaryEl) raw = primaryEl.value;
          else if ('textContent' in primaryEl) raw = primaryEl.textContent;
        }
      } catch (_) {
        raw = '';
      }
      extraValues[key] = normalize(raw);
    });
    return extraValues;
  };

  const tryClearDirtyIfRestoredToBaseline = () => {
    if (
      typeof extraDirtyState?.isDirty === 'function' &&
      extraDirtyState.isDirty()
    ) {
      updateButtons();
      return;
    }
    const nextTitle = normalizeTitle(readBodyTitleRaw());
    if (nextTitle !== baselineTitle) {
      updateButtons();
      return;
    }
    let nextSubtitle = '';
    if (hasSubtitle) {
      let raw = lastCommittedSubtitle;
      try {
        if (subtitleEl?.isContentEditable) {
          const t = subtitleEl.textContent || '';
          const ph = subtitlePlaceholder.trim().toLowerCase();
          raw = t.trim().toLowerCase() === ph ? '' : normalizeSubtitleFn(t);
        } else {
          raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
        }
      } catch (_) {
        raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
      }
      nextSubtitle = normalizeSubtitleFn(raw || '');
    }
    if (hasSubtitle && nextSubtitle !== baselineSubtitle) {
      updateButtons();
      return;
    }
    const extraNow = readNormalizedExtraSnapshot();
    for (const f of extras) {
      if (!f || !f.key) continue;
      const key = String(f.key);
      if ((extraNow[key] ?? '') !== (baselineExtras[key] ?? '')) {
        updateButtons();
        return;
      }
    }
    isDirty = false;
    updateButtons();
  };

  const markDirtyFromUserEdit = () => {
    markDirty();
    requestAnimationFrame(() => {
      try {
        tryClearDirtyIfRestoredToBaseline();
      } catch (_) {}
    });
  };

  // Extra fields: set baseline values and wire dirty tracking
  extras.forEach((f) => {
    if (!f) return;
    const key = String(f.key || '');
    if (!key) return;

    const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
    const primaryEl = f.el || els[0] || null;
    if (!primaryEl) return;

    try {
      const v = baselineExtras[key] ?? '';
      if (typeof f.setValue === 'function') {
        f.setValue(v);
      } else if ('value' in primaryEl) {
        primaryEl.value = v;
      } else if ('textContent' in primaryEl) {
        primaryEl.textContent = v;
      }
    } catch (_) {}
    // If this field supports auto-grow, ensure it sizes correctly even when value
    // is set programmatically (baseline load).
    try {
      maybeAutoGrow(primaryEl);
      els.forEach((el) => maybeAutoGrow(el));
    } catch (_) {}

    try {
      const targets = els.length > 0 ? els : [primaryEl];
      targets.forEach((el) => {
        try {
          el.addEventListener('input', markDirtyFromUserEdit);
          el.addEventListener('change', markDirtyFromUserEdit);
        } catch (_) {}
      });
    } catch (_) {}
  });

  // Title is editable in the page body only (app-bar title is display-only).
  if (!bodyTitleIsTextEntry) {
    bodyTitleEl.addEventListener('click', () => {
      if (bodyTitleEl.isContentEditable) return;

      const starting = bodyTitleEl.textContent || '';
      const startingStored = normalizeTitle(starting);

      titleSessionActive = true;
      if (emptySubtitleFlow()) syncSubtitleDomFromBaseline();

      bodyTitleEl.contentEditable = 'true';
      bodyTitleEl.classList.add('editing-title');
      bodyTitleEl.focus();

      const onInput = () => {
        markDirtyFromUserEdit();
      };

      const cleanup = () => {
        bodyTitleEl.contentEditable = 'false';
        bodyTitleEl.classList.remove('editing-title');
        bodyTitleEl.removeEventListener('blur', onBlur);
        bodyTitleEl.removeEventListener('keydown', onKeyDown);
        bodyTitleEl.removeEventListener('input', onInput);
        titleSessionActive = false;
        // While the store has no saved subtitle, don't immediately sync/hide on
        // title blur. Subtitle clicking causes the title to blur first, and we
        // need the subtitle click handler to still run reliably.
        if (!emptySubtitleFlow()) syncSubtitleDomFromBaseline();
        requestAnimationFrame(() => {
          // Do not clear `subtitlePointerKeepAlive` here.
          // Title blur happens before subtitle click; clearing early can hide
          // the subtitle before its click handler runs.
          syncSubtitleDomFromBaseline();
        });
      };

      const commit = () => {
        const next = normalizeTitle(bodyTitleEl.textContent);
        const changed = next !== startingStored;
        bodyTitleEl.textContent = displayTitle(next);
        appBarTitleEl.textContent = displayTitle(next);
        if (changed) markDirty();
        tryClearDirtyIfRestoredToBaseline();
      };

      const cancelEdit = () => {
        bodyTitleEl.textContent = starting;
        appBarTitleEl.textContent = starting;
      };

      const onBlur = () => {
        commit();
        cleanup();
      };

      const onKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          cleanup();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
          cleanup();
        }
      };

      bodyTitleEl.addEventListener('input', onInput);
      bodyTitleEl.addEventListener('blur', onBlur);
      bodyTitleEl.addEventListener('keydown', onKeyDown);
    });
  } else {
    bodyTitleEl.addEventListener('input', () => {
      markDirtyFromUserEdit();
      try {
        appBarTitleEl.textContent =
          displayTitle(normalizeTitle(readBodyTitleRaw())) || '';
      } catch (_) {}
      if (hasSubtitle && subtitlePlaceholderWhenEquivalentToTitle) {
        try {
          syncSubtitleDomFromBaseline();
        } catch (_) {}
      }
    });
  }

  if (hasSubtitle) {
    subtitleEl.addEventListener('click', () => {
      if (subtitleEl.isContentEditable) return;
      subtitlePointerKeepAlive = false;
      const storedTrim = (lastCommittedSubtitle || '').trim();
      const starting = storedTrim
        ? lastCommittedSubtitle
        : subtitleEl.textContent || '';
      const isPlaceholder =
        starting.trim().toLowerCase() ===
        subtitlePlaceholder.trim().toLowerCase();
      const redundantWithTitle =
        !!subtitlePlaceholderWhenEquivalentToTitle &&
        !!storedTrim &&
        normalizeSubtitleFn(lastCommittedSubtitle) ===
          normalizeSubtitleFn(readBodyTitleRaw());
      const storedSubtitleOnOpen = lastCommittedSubtitle;
      const restoreOnCancelEmptyFlow = emptySubtitleFlow()
        ? (lastCommittedSubtitle || '').trim() ||
          (isPlaceholder ? '' : starting)
        : null;
      subtitleSessionActive = true;
      // Keep the hint text visible until the first real character is typed.
      const openAsHint = isPlaceholder || redundantWithTitle;
      subtitleEl.textContent = openAsHint ? subtitlePlaceholder : starting;
      subtitleEl.contentEditable = 'true';
      subtitleEl.classList.remove('placeholder-prompt');
      subtitleEl.classList.add('editing-title');
      subtitleEl.focus();
      // Put caret at the start so typing replaces the hint immediately.
      try {
        const sel = window.getSelection && window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(subtitleEl);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_) {}

      const onInput = () => markDirtyFromUserEdit();
      const cleanup = () => {
        subtitleEl.contentEditable = 'false';
        subtitleEl.classList.remove('editing-title');
        subtitleEl.removeEventListener('blur', onBlur);
        subtitleEl.removeEventListener('keydown', onKeyDown);
        subtitleEl.removeEventListener('input', onInput);
        subtitleSessionActive = false;
        syncSubtitleDomFromBaseline();
      };
      const commit = () => {
        const raw = subtitleEl.textContent || '';
        let next = normalizeSubtitleFn(raw);
        const phLower = subtitlePlaceholder.trim().toLowerCase();
        const rawTrimLower = raw.trim().toLowerCase();
        if (rawTrimLower === phLower) {
          if (redundantWithTitle) {
            next = normalizeSubtitleFn(storedSubtitleOnOpen || '');
          } else {
            next = '';
          }
        } else if (isPlaceholder && next.toLowerCase() === phLower) {
          next = '';
        }
        lastCommittedSubtitle = next;
        if (next !== (baselineSubtitle || '')) markDirty();
        tryClearDirtyIfRestoredToBaseline();
      };
      const cancelEdit = () => {
        if (emptySubtitleFlow() && restoreOnCancelEmptyFlow !== null) {
          subtitleEl.textContent = restoreOnCancelEmptyFlow;
        } else {
          subtitleEl.textContent = baselineSubtitle || subtitlePlaceholder;
        }
      };
      const onBlur = () => {
        commit();
        cleanup();
      };
      const onKeyDown = (e) => {
        // Placeholder behavior: keep visible on focus, but remove on first
        // typed character so the hint doesn't get partially overwritten.
        try {
          const phNorm = subtitlePlaceholder.trim().toLowerCase();
          const curNorm = (subtitleEl.textContent || '').trim().toLowerCase();
          const isPrintable =
            e.key &&
            String(e.key).length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey;

          if (curNorm === phNorm && isPrintable) {
            subtitleEl.textContent = '';
            const sel = window.getSelection && window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(subtitleEl);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        } catch (_) {}

        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          cleanup();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
          cleanup();
        }
      };
      subtitleEl.addEventListener('blur', onBlur);
      subtitleEl.addEventListener('input', onInput);
      subtitleEl.addEventListener('keydown', onKeyDown);
    });
  }

  const saveChildEditor = async () => {
    if (!pageDirty()) return true;

    const nextTitle = normalizeTitle(readBodyTitleRaw());
    writeBodyTitleDom(nextTitle);
    appBarTitleEl.textContent = displayTitle(nextTitle) || '';

    let nextSubtitle = '';
    if (hasSubtitle) {
      let raw = lastCommittedSubtitle;
      try {
        if (subtitleEl?.isContentEditable) {
          const t = subtitleEl.textContent || '';
          const ph = subtitlePlaceholder.trim().toLowerCase();
          raw = t.trim().toLowerCase() === ph ? '' : normalizeSubtitleFn(t);
        } else {
          raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
        }
      } catch (_) {
        raw = normalizeSubtitleFn(lastCommittedSubtitle || '');
      }
      nextSubtitle = normalizeSubtitleFn(raw || '');
    }

    const extraValues = readNormalizedExtraSnapshot();

    try {
      if (typeof onSave === 'function') {
        await onSave({
          title: nextTitle,
          subtitle: hasSubtitle ? nextSubtitle : undefined,
          baselineTitle,
          extraValues,
        });
      }
    } catch (err) {
      if (err && err.silent) return false;
      console.error('❌ Failed to save child editor:', err);
      uiToast('Failed to save changes. See console for details.');
      return false;
    }

    isDirty = false;
    try {
      extraDirtyState?.onAfterSaveSuccess?.();
    } catch (err2) {
      console.warn('extraDirtyState.onAfterSaveSuccess', err2);
    }
    updateButtons();
    baselineTitle = nextTitle;
    if (hasSubtitle) {
      baselineSubtitle = nextSubtitle;
      lastCommittedSubtitle = nextSubtitle;
    }
    baselineExtras = { ...baselineExtras, ...extraValues };
    if (hasSubtitle) syncSubtitleDomFromBaseline();
    return true;
  };

  let childEditorExitPromptInFlight = false;

  const childEditorAttemptExit = async ({
    reason = 'exit',
    onClean = null,
    onDiscard = null,
    onSaveSuccess = null,
  } = {}) => {
    const run = async (fn) => {
      if (typeof fn === 'function') await fn();
    };

    if (!pageDirty()) {
      await run(onClean);
      return true;
    }

    if (childEditorExitPromptInFlight) return false;
    childEditorExitPromptInFlight = true;

    try {
      if (
        window.ui &&
        typeof window.ui.dismissOpenDialogs === 'function'
      ) {
        window.ui.dismissOpenDialogs();
      }
      if (window.ui && typeof window.ui.dialogThreeChoice === 'function') {
        const choice = await window.ui.dialogThreeChoice({
          title: 'Unsaved changes',
          message: 'Save changes before exiting?',
          fixText: 'Cancel',
          discardText: 'Discard',
          createText: 'Save',
          dismissChoice: 'fix',
        });
        if (choice === 'fix') return false;
        if (choice === 'create') {
          const ok = await saveChildEditor();
          if (!ok || pageDirty()) return false;
          await run(onSaveSuccess);
          return true;
        }
        if (choice === 'discard') {
          isDirty = false;
          updateButtons();
          await run(onDiscard);
          return true;
        }
        return false;
      }

      if (
        window.ui &&
        typeof window.ui.dismissOpenDialogs === 'function'
      ) {
        window.ui.dismissOpenDialogs();
      }
      const ok = await uiConfirm({
        title: 'Discard Changes?',
        message: 'Discard unsaved changes?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;
      isDirty = false;
      updateButtons();
      await run(onDiscard);
      return true;
    } finally {
      childEditorExitPromptInFlight = false;
    }
  };

  window.favoriteEatsChildEditorAttemptExit = childEditorAttemptExit;

  const navigateChildEditorAway = (href) => {
    window.location.href = href;
  };

  const doBack = async () => {
    await childEditorAttemptExit({
      reason: 'back',
      onClean: () => navigateChildEditorAway(backHref),
      onDiscard: () => navigateChildEditorAway(backHref),
      onSaveSuccess: () => navigateChildEditorAway(backHref),
    });
  };

  const isChildEditorNavigationalAnchor = (anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    const rawHref = String(anchor.getAttribute('href') || '').trim();
    if (!rawHref || rawHref === '#' || rawHref.startsWith('#')) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol === 'mailto:' || url.protocol === 'tel:') return false;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        !!url.hash
      ) {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  /** Real href navigations only; `href="#"` links use `openRecipe` / other handlers. */
  const handleChildEditorLinkClick = (event) => {
    if (!pageDirty() || event.defaultPrevented) return;
    const anchor =
      event.target &&
      typeof event.target.closest === 'function' &&
      event.target.closest('a');
    if (!isChildEditorNavigationalAnchor(anchor)) return;
    event.preventDefault();
    const href = anchor.href;
    void childEditorAttemptExit({
      reason: 'link',
      onClean: () => navigateChildEditorAway(href),
      onDiscard: () => navigateChildEditorAway(href),
      onSaveSuccess: () => navigateChildEditorAway(href),
    });
  };

  const handleChildEditorBeforeUnload = (event) => {
    if (!pageDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  document.addEventListener('click', handleChildEditorLinkClick, true);
  window.addEventListener('beforeunload', handleChildEditorBeforeUnload);
  window.addEventListener(
    'pagehide',
    () => {
      document.removeEventListener('click', handleChildEditorLinkClick, true);
      window.removeEventListener('beforeunload', handleChildEditorBeforeUnload);
      if (
        window.favoriteEatsChildEditorAttemptExit === childEditorAttemptExit
      ) {
        window.favoriteEatsChildEditorAttemptExit = null;
      }
    },
    { once: true },
  );

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      void doBack();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pageDirty()) return;
      writeBodyTitleDom(baselineTitle);
      appBarTitleEl.textContent = displayTitle(baselineTitle) || '';
      if (hasSubtitle) {
        lastCommittedSubtitle = baselineSubtitle || '';
        syncSubtitleDomFromBaseline();
      }
      try {
        extraDirtyState?.onCancel?.();
      } catch (err) {
        console.warn('extraDirtyState.onCancel', err);
      }
      extras.forEach((f) => {
        if (!f) return;
        const key = String(f.key || '');
        if (!key) return;
        const v = baselineExtras[key] ?? '';
        try {
          if (typeof f.setValue === 'function') {
            f.setValue(v);
          } else {
            const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
            const primaryEl = f.el || els[0] || null;
            if (!primaryEl) return;
            if ('value' in primaryEl) primaryEl.value = v;
            else if ('textContent' in primaryEl) primaryEl.textContent = v;
          }
        } catch (_) {}
        // Re-measure any auto-grow fields after restoring values.
        try {
          const els = Array.isArray(f.els) ? f.els.filter(Boolean) : [];
          const primaryEl = f.el || els[0] || null;
          maybeAutoGrow(primaryEl);
          els.forEach((el) => maybeAutoGrow(el));
        } catch (_) {}
      });
      isDirty = false;
      updateButtons();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveChildEditor();
    });
  }

  return {
    refreshDirty: updateButtons,
    tryClearDirtyIfRestoredToBaseline,
    updateExtraBaseline: (key, rawValue) => {
      const k = String(key || '');
      if (!k) return;
      baselineExtras[k] = normalize(rawValue);
      tryClearDirtyIfRestoredToBaseline();
    },
    syncSubtitle: hasSubtitle ? syncSubtitleDomFromBaseline : undefined,
    markDirtyFromUserEdit,
    attemptExit: childEditorAttemptExit,
  };
}

async function loadShoppingItemEditorPage() {
  fePageLoadFoodIconBegin('shopping-editor');
  if (window.dataService) {
    try {
      window.dataService.useSupabase = true;
    } catch (_) {}
  }

  const view = document.getElementById('pageContent');

  if (!view) {
    fePageLoadFoodIconFail();
    return;
  }

  const isNew = sessionStorage.getItem('selectedShoppingItemIsNew') === '1';
  const storedName = sessionStorage.getItem('selectedShoppingItemName') || '';

  let titleText = storedName.trim();
  if (!titleText && !isNew) {
    titleText = 'Shopping item';
  }

  // Page owns the title; app bar mirrors it (display-only).

  // App bar: render shell + mode toggles only.
  // Wiring (back/cancel/save + dirty confirm) is handled by wireChildEditorPage
  // after the fragment exists, so there is exactly one path.
  initAppBar({ mode: 'editor', titleText });

  // Body: read-only display title (segments focus fields), grammar card, variant card
  view.innerHTML = `
    <h1
      id="childEditorTitle"
      class="recipe-title shopping-item-display-title"
      aria-label="Item name"
    >
      <span
        id="childEditorTitleSingularSeg"
        class="shopping-item-title-seg"
        role="button"
        tabindex="0"
        aria-label="Singular or name — click to edit"
      ></span><span
        id="childEditorTitleJoiner"
        class="shopping-item-title-joiner"
        aria-hidden="true"
      >/</span><span
        id="childEditorTitlePluralSeg"
        class="shopping-item-title-seg"
        role="button"
        tabindex="0"
        aria-label="Plural — click to edit"
      ></span>
    </h1>

    <div
      id="shoppingItemOverridesCard"
      class="shopping-item-editor-card"
      aria-label="Pluralization overrides"
    >
      <div
        id="shoppingItemLanguageDetails"
        class="shopping-item-grammar-layout"
      >
        <div
          class="shopping-item-grammar-section shopping-item-grammar-section--word-fields"
        >
          <div class="shopping-item-field" style="width: 100%;">
            <div
              id="shoppingItemCanonicalNameLabel"
              class="shopping-item-label"
            >
              Singular
            </div>
            <input
              id="shoppingItemSingularInput"
              class="shopping-item-input"
              type="text"
              autocomplete="off"
              spellcheck="true"
            />
          </div>

          <div id="shoppingItemCountableGrammarSection" style="width: 100%;">
            <div
              id="shoppingItemPluralOverrideField"
              class="shopping-item-field"
              style="width: 100%;"
            >
              <div class="shopping-item-label">Plural</div>
              <input
                id="shoppingItemPluralOverrideInput"
                class="shopping-item-input"
                type="text"
                placeholder="e.g. leaves, grapes, bagels"
              />
            </div>

            <div
              id="shoppingItemUsePluralOverrideRow"
              class="shopping-item-status-row"
            >
              <label class="shopping-item-toggle">
                <input id="shoppingItemUsePluralOverrideToggle" type="checkbox" />
                <span>Use override</span>
              </label>
            </div>
          </div>
        </div>

        <div
          id="shoppingItemSingularIfUnspecifiedBlock"
          class="shopping-item-grammar-section shopping-item-grammar-section--plural-default"
        >
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input id="shoppingItemSingularIfUnspecifiedToggle" type="checkbox" />
              <span>Use singular when quantity is unspecified</span>
            </label>
          </div>
        </div>

        <div
          id="shoppingItemIsMassNounBlock"
          class="shopping-item-grammar-section shopping-item-grammar-section--mass-noun"
        >
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input id="shoppingItemIsMassNounToggle" type="checkbox" />
              <span>Is a mass or substance (e.g. rice, turmeric)</span>
            </label>
          </div>
        </div>

        <div
          id="shoppingItemGrammarExampleEcho"
          class="shopping-item-help"
          style="display: none;"
        ></div>
      </div>
    </div>

    <div class="shopping-item-editor-card" aria-label="Shopping item">
      <div class="shopping-item-field shopping-item-variant-field">
        <div class="shopping-item-label">Variant</div>
        <input id="shoppingItemVariantRowsHiddenInput" type="hidden" />
        <div
          id="shoppingItemVariantEditor"
          class="shopping-item-variant-editor"
          aria-label="Item variants"
        >
          <div
            id="shoppingItemVariantRows"
            class="shopping-item-variant-rows"
            role="group"
            aria-label="Variant rows"
          ></div>
        </div>
        <div class="shopping-item-help">
          Base item is always present. Named variants are optional.
        </div>
      </div>

      <div class="shopping-item-field">
        <div class="shopping-item-label">Also known as</div>
        <textarea
          id="shoppingItemSynonymsTextarea"
          class="shopping-item-textarea"
          placeholder="e.g. spring onion, scallion"
          wrap="off"
        ></textarea>
      </div>

      <div class="shopping-item-field">
        <div class="shopping-item-label">Sizes</div>
        <textarea
          id="shoppingItemSizesTextarea"
          class="shopping-item-textarea"
          placeholder="e.g. 12oz can"
          wrap="off"
        ></textarea>
      </div>

      <div class="shopping-item-status">
        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemUseMetricToggle" type="checkbox" />
            <span>Use metric</span>
          </label>
        </div>

        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsNotFoodToggle" type="checkbox" />
            <span>Not food</span>
          </label>
        </div>

        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsDeprecatedToggle" type="checkbox" />
            <span>Removed</span>
          </label>
        </div>

        <div id="shoppingItemIsHiddenRow" class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="shoppingItemIsHiddenToggle" type="checkbox" />
            <span>Hidden</span>
          </label>
        </div>

        <div class="shopping-item-help">
          Removed items won’t appear in your Items list, but they’re still saved. You can delete them once they’re no longer used by any recipe.
        </div>
      </div>
    </div>
  `;

  const variantRowsHiddenInput = document.getElementById(
    'shoppingItemVariantRowsHiddenInput',
  );
  const variantRowsEl = document.getElementById('shoppingItemVariantRows');
  const singularInputEl = document.getElementById('shoppingItemSingularInput');
  let variantRowsDraft = [];
  let variantRowsBaselineSignature = '';
  let refreshVariantEditorDirty = () => {};
  let commitVariantRowsBaseline = () => {};
  let pendingVariantCellFocus = null;
  let variantActionDialogOpen = false;
  let activeVariantTagEditorState = null;
  /** Tracks an in-flight Ctrl/Cmd tag-pill gesture so blur doesn't tear down the clicked row. */
  let pendingVariantTagPillInteraction = null;
  /** Suppresses the old tags input blur cleanup during intentional rerender-and-refocus flows. */
  let pendingVariantTagBlurCleanupSuppression = null;
  /** Bumps on every variant grid rebuild so stale name-input blur handlers cannot steal focus. */
  let variantRowsRenderGeneration = 0;

  const isVariantTagDebugLoggingEnabled = () =>
    !!(window && window.__favoriteEatsVariantTagDebug);
  const logVariantTagDebug = (message, details = null) => {
    if (!isVariantTagDebugLoggingEnabled()) return;
    if (details && typeof details === 'object') {
      console.log(`[variant-tags] ${message}`, details);
      return;
    }
    console.log(`[variant-tags] ${message}`);
  };
  const suppressNextVariantTagBlurCleanup = (rowIndex, reason = '') => {
    const normalizedRowIndex = Number(rowIndex);
    if (!Number.isFinite(normalizedRowIndex) || normalizedRowIndex < 0) return;
    pendingVariantTagBlurCleanupSuppression = {
      rowIndex: normalizedRowIndex,
      reason: String(reason || ''),
    };
    logVariantTagDebug(
      'suppress next tags blur cleanup',
      pendingVariantTagBlurCleanupSuppression,
    );
  };

  const confirmShoppingVariantTagRemoval = async (tagLabel) => {
    const cleanTag = String(tagLabel || '').trim() || 'this tag';
    try {
      if (window.ui && typeof window.ui.confirm === 'function') {
        const ok = await window.ui.confirm({
          title: 'Remove tag?',
          message: `Remove "${cleanTag}" from this variant?`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        return !!ok;
      }
      return window.confirm(`Remove "${cleanTag}" from this variant?`);
    } catch (_) {
      return false;
    }
  };

  const getActiveVariantTagEditorRowIndex = () => {
    const rowIndex = Number(activeVariantTagEditorState?.rowIndex);
    return Number.isFinite(rowIndex) ? rowIndex : -1;
  };

  const setActiveVariantTagEditorState = (
    rowIndex,
    draft = '',
    options = {},
  ) => {
    const normalizedRowIndex = Number(rowIndex);
    if (!Number.isFinite(normalizedRowIndex) || normalizedRowIndex < 0) {
      activeVariantTagEditorState = null;
      return;
    }
    const insertAfterTagIndex = Number(options?.insertAfterTagIndex);
    activeVariantTagEditorState = {
      rowIndex: normalizedRowIndex,
      draft: String(draft || ''),
      insertAfterTagIndex: Number.isFinite(insertAfterTagIndex)
        ? Math.trunc(insertAfterTagIndex)
        : -1,
    };
  };

  const beginVariantTagPillInteraction = (rowIndex) => {
    const interaction = {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      previousActiveRowIndex: getActiveVariantTagEditorRowIndex(),
      handled: false,
    };
    pendingVariantTagPillInteraction = interaction;
    return interaction;
  };

  const getVariantTagInsertAfterIndexForPoint = (
    pillElements,
    clientX,
    clientY,
  ) => {
    const pills = Array.isArray(pillElements)
      ? pillElements
          .filter((el) => el instanceof HTMLElement)
          .map((el, index) => ({
            index,
            rect: el.getBoundingClientRect(),
          }))
      : [];
    if (!pills.length) return -1;
    if (typeof clientX !== 'number' || typeof clientY !== 'number')
      return pills[pills.length - 1].index;

    const rows = [];
    const rowTolerancePx = 6;
    pills.forEach((pill) => {
      const existingRow = rows.find(
        (row) => Math.abs(row.top - pill.rect.top) <= rowTolerancePx,
      );
      if (existingRow) {
        existingRow.items.push(pill);
        existingRow.top = Math.min(existingRow.top, pill.rect.top);
        existingRow.bottom = Math.max(existingRow.bottom, pill.rect.bottom);
        return;
      }
      rows.push({
        top: pill.rect.top,
        bottom: pill.rect.bottom,
        items: [pill],
      });
    });
    rows.sort((a, b) => a.top - b.top);
    rows.forEach((row) => row.items.sort((a, b) => a.rect.left - b.rect.left));

    const targetRow =
      rows.find(
        (row) =>
          clientY >= row.top - rowTolerancePx &&
          clientY <= row.bottom + rowTolerancePx,
      ) ||
      rows.reduce((bestRow, row) => {
        if (!bestRow) return row;
        const bestDistance =
          clientY < bestRow.top
            ? bestRow.top - clientY
            : clientY > bestRow.bottom
              ? clientY - bestRow.bottom
              : 0;
        const rowDistance =
          clientY < row.top
            ? row.top - clientY
            : clientY > row.bottom
              ? clientY - row.bottom
              : 0;
        return rowDistance < bestDistance ? row : bestRow;
      }, null);
    if (!targetRow) return pills[pills.length - 1].index;

    for (let i = 0; i < targetRow.items.length; i += 1) {
      const pill = targetRow.items[i];
      const midpoint = pill.rect.left + pill.rect.width / 2;
      if (clientX < midpoint) return pill.index - 1;
    }
    return targetRow.items[targetRow.items.length - 1].index;
  };

  const getVariantRowsSignature = (rows) =>
    normalizeIngredientVariantRows(Array.isArray(rows) ? rows : [])
      .map((row) => {
        const homeLocation = normalizeShoppingHomeLocationId(
          row?.homeLocation || 'none',
        );
        const tagKey = normalizeRecipeTagList(row?.tags || []).join('|');
        const dep = row?.isDeprecated ? '1' : '0';
        if (row?.isBase) return `base:${homeLocation}:${tagKey}:${dep}`;
        return `variant:${String(row?.value || '')}:${homeLocation}:${tagKey}:${dep}`;
      })
      .join('\n');

  const getNamedVariantRowsFromDraft = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row && !row.isBase)
      .map((row) => ({
        isBase: false,
        value: normalizeNamedIngredientVariant(row.value),
        homeLocation: normalizeShoppingHomeLocationId(
          row.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(row.tags || []),
        variantId: Number.isFinite(Number(row.variantId))
          ? Number(row.variantId)
          : null,
        isDeprecated: !!row.isDeprecated,
      }))
      .filter((row) => row.value);

  const buildSupabaseShoppingSavePayload = (
    next,
    baselineTitle,
    extraValues,
  ) => {
    const idStr = sessionStorage.getItem('selectedShoppingItemId');
    const ingredientId = Number(idStr);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
      throw new Error('missing-ingredient-id-for-catalog-save');
    }

    const variantRowsText =
      (extraValues && extraValues.variant_rows) ||
      (extraValues && extraValues.variants) ||
      '';
    const sizesText = (extraValues && extraValues.sizes) || '';
    const synonymsText = (extraValues && extraValues.synonyms) || '';
    const home = (extraValues && extraValues.home) || '';

    const normalizedVariantRows = parseIngredientVariantRowsSerialized(
      variantRowsText,
      {
        fallbackBaseHome: home,
      },
    );
    const namedVariantRows = getNamedVariantRowsFromDraft(
      normalizedVariantRows,
    ).filter(
      (row) => String(row.value || '').trim().toLowerCase() !== 'any',
    );

    const variants = namedVariantRows.map((row) => row.value);
    const reservedVariantNames = variants.filter((value) =>
      isReservedIngredientVariantName(value),
    );
    if (reservedVariantNames.length > 0) {
      uiToast('Variant names can’t be "default", "base", or "any".');
      const err = new Error('reserved shopping item variant name');
      err.silent = true;
      throw err;
    }

    const parseList = (raw) => {
      const lines = String(raw || '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const out = [];
      const seen = new Set();
      lines.forEach((s) => {
        const key = s.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(s);
      });
      return out;
    };

    const normalizedBaseHomeLocation = normalizeShoppingHomeLocationId(
      normalizedVariantRows.find((row) => row?.isBase)?.homeLocation ||
        home ||
        'none',
    );

    const rowsForWrite = normalizeIngredientVariantRows(normalizedVariantRows, {
      fallbackBaseHome: normalizedBaseHomeLocation,
    });

    const variantRowsPayload = rowsForWrite
      .filter((row) => {
        if (row?.isBase) return true;
        return (
          String(normalizeNamedIngredientVariant(row.value) || '')
            .trim()
            .toLowerCase() !== 'any'
        );
      })
      .map((row) => ({
      isBase: !!row.isBase,
      variant: row.isBase
        ? INGREDIENT_BASE_VARIANT_NAME
        : normalizeNamedIngredientVariant(row.value),
      homeLocation: normalizeShoppingHomeLocationId(
        row?.homeLocation || 'none',
      ),
      isDeprecated: !!row.isDeprecated,
      tags: normalizeRecipeTagList(row?.tags || []),
    }));

    const isFoodRaw = (extraValues && extraValues.is_food) || '';
    const isDeprecatedRaw = (extraValues && extraValues.is_deprecated) || '';
    const isHiddenRaw = (extraValues && extraValues.is_hidden) || '';
    const pluralOverride = (extraValues && extraValues.plural_override) || '';
    const usePluralOverrideRaw =
      (extraValues && extraValues.use_plural_override) || '';
    const singularIfUnspecifiedRaw =
      (extraValues && extraValues.singular_if_unspecified) || '';
    const isMassNounRaw = (extraValues && extraValues.is_mass_noun) || '';
    const useMetricRaw = (extraValues && extraValues.use_metric) || '';

    const nextName = String(next || '').trim();
    const prevName = String(baselineTitle || '').trim();
    return {
      ingredientId,
      name: nextName,
      ...(prevName &&
      prevName.toLowerCase() !== nextName.toLowerCase()
        ? { previousName: prevName }
        : {}),
      lemma: deriveIngredientLemmaInMain(next),
      pluralOverride: String(pluralOverride || '').trim(),
      usePluralOverride: usePluralOverrideRaw === '1',
      singularIfUnspecified: singularIfUnspecifiedRaw === '1',
      isMassNoun: isMassNounRaw === '1',
      useMetric: useMetricRaw === '1',
      isFood: isFoodRaw === '1',
      isDeprecated: isDeprecatedRaw === '1',
      isHidden: isHiddenRaw === '1',
      variantRows: variantRowsPayload,
      sizes: parseList(sizesText),
      synonyms: parseList(synonymsText),
    };
  };

  const getVariantRowsForEditing = (rows) =>
    normalizeIngredientVariantRows(rows);
  const ensureBaseVariantRowPresent = () => {
    if (variantRowsDraft[0]?.isBase) return;
    const existingBaseRow = variantRowsDraft.find((row) => row?.isBase);
    const baseHomeLocation = normalizeShoppingHomeLocationId(
      existingBaseRow?.homeLocation || 'none',
    );
    variantRowsDraft = [
      {
        isBase: true,
        value: '',
        homeLocation: baseHomeLocation,
        tags: normalizeRecipeTagList(existingBaseRow?.tags || []),
      },
      ...variantRowsDraft.filter((row) => row && !row.isBase),
    ];
  };
  const homeLocationDefsForEditor = getShoppingListHomeLocationDefs().filter(
    (locationDef) =>
      normalizeShoppingHomeLocationId(locationDef?.id || 'none') !== 'none',
  );
  const homeLocationLabelById = new Map();
  const homeLocationIdByLookupKey = new Map();
  homeLocationDefsForEditor.forEach((locationDef) => {
    const normalizedId = normalizeShoppingHomeLocationId(
      locationDef?.id || 'none',
    );
    if (normalizedId === 'none') return;
    const label =
      String(locationDef?.label || normalizedId).trim() || normalizedId;
    homeLocationLabelById.set(normalizedId, label);
    homeLocationIdByLookupKey.set(normalizedId, normalizedId);
    homeLocationIdByLookupKey.set(label.toLowerCase(), normalizedId);
  });

  const getCurrentItemNameForBaseRow = () => {
    const raw = String(
      singularInputEl?.value || titleText || storedName || 'item',
    ).trim();
    return raw || 'item';
  };

  const getHomeLocationDisplayText = (homeLocationId) => {
    const normalizedId = normalizeShoppingHomeLocationId(
      homeLocationId || 'none',
    );
    if (normalizedId === 'none') return '';
    return homeLocationLabelById.get(normalizedId) || normalizedId;
  };

  const resolveHomeLocationIdFromInput = (rawValue) => {
    const normalized = String(rawValue || '')
      .trim()
      .toLowerCase();
    if (!normalized) return 'none';
    return homeLocationIdByLookupKey.get(normalized) || '';
  };

  const syncVariantHiddenInput = ({ emit = false } = {}) => {
    if (!variantRowsHiddenInput) return;
    const nextValue = serializeIngredientVariantRows(variantRowsDraft);
    const previousValue = String(variantRowsHiddenInput.value || '');
    variantRowsHiddenInput.value = nextValue;
    if (!emit || nextValue === previousValue) return;
    try {
      variantRowsHiddenInput.dispatchEvent(
        new Event('input', { bubbles: true }),
      );
      variantRowsHiddenInput.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
    } catch (_) {}
    refreshVariantEditorDirty();
  };

  const addVariantTagToRow = (rowIndex, rawTag, { emit = true } = {}) => {
    const normalizedIndex = Number(rowIndex);
    if (
      !Number.isFinite(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= variantRowsDraft.length
    ) {
      return false;
    }
    const nextTag = normalizeRecipeTagList([rawTag])[0] || '';
    if (!nextTag) return false;
    const currentTags = normalizeRecipeTagList(
      variantRowsDraft[normalizedIndex].tags || [],
    );
    const nextTags = normalizeRecipeTagList([...currentTags, nextTag]);
    const previousKey = JSON.stringify(
      currentTags.map((value) => String(value || '').toLowerCase()),
    );
    const nextKey = JSON.stringify(
      nextTags.map((value) => String(value || '').toLowerCase()),
    );
    if (previousKey === nextKey) return false;
    variantRowsDraft[normalizedIndex].tags = nextTags;
    syncVariantHiddenInput({ emit });
    return true;
  };

  const insertVariantTagToRow = (
    rowIndex,
    rawTag,
    insertAfterTagIndex,
    { emit = true } = {},
  ) => {
    const normalizedIndex = Number(rowIndex);
    if (
      !Number.isFinite(normalizedIndex) ||
      normalizedIndex < 0 ||
      normalizedIndex >= variantRowsDraft.length
    ) {
      return false;
    }
    const nextTag = normalizeRecipeTagList([rawTag])[0] || '';
    if (!nextTag) return false;
    const currentTags = normalizeRecipeTagList(
      variantRowsDraft[normalizedIndex].tags || [],
    );
    const normalizedInsertAfter = Number.isFinite(Number(insertAfterTagIndex))
      ? Math.trunc(Number(insertAfterTagIndex))
      : currentTags.length - 1;
    const insertAt = Math.max(
      0,
      Math.min(currentTags.length, normalizedInsertAfter + 1),
    );
    const nextTags = normalizeRecipeTagList([
      ...currentTags.slice(0, insertAt),
      nextTag,
      ...currentTags.slice(insertAt),
    ]);
    const previousKey = JSON.stringify(
      currentTags.map((value) => String(value || '').toLowerCase()),
    );
    const nextKey = JSON.stringify(
      nextTags.map((value) => String(value || '').toLowerCase()),
    );
    if (previousKey === nextKey) return false;
    variantRowsDraft[normalizedIndex].tags = nextTags;
    syncVariantHiddenInput({ emit });
    return true;
  };

  const commitActiveVariantTagDraft = ({ clear = false, emit = true } = {}) => {
    if (!activeVariantTagEditorState) return false;
    const rowIndex = Number(activeVariantTagEditorState.rowIndex);
    const draft = String(activeVariantTagEditorState.draft || '').trim();
    const insertAfterTagIndex = Number(
      activeVariantTagEditorState.insertAfterTagIndex,
    );
    const changed = draft
      ? insertVariantTagToRow(rowIndex, draft, insertAfterTagIndex, { emit })
      : false;
    if (clear) activeVariantTagEditorState = null;
    else {
      activeVariantTagEditorState.draft = '';
      if (changed) {
        activeVariantTagEditorState.insertAfterTagIndex = Math.trunc(
          (Number.isFinite(insertAfterTagIndex) ? insertAfterTagIndex : -1) + 1,
        );
      }
    }
    try {
      refreshVariantEditorDirty();
    } catch (_) {}
    return changed;
  };

  /** Merge in-progress tag text so Save serializes the same rows the user sees while typing. */
  const getVariantRowsDraftWithMergedActiveTagDraft = () => {
    const raw = Array.isArray(variantRowsDraft) ? variantRowsDraft : [];
    const rows = raw.map((row) => ({
      ...row,
      tags: normalizeRecipeTagList(row?.tags || []),
    }));
    if (!activeVariantTagEditorState) return rows;
    const idx = Number(activeVariantTagEditorState.rowIndex);
    const draftRaw = String(activeVariantTagEditorState.draft || '').trim();
    const nextTag = normalizeRecipeTagList([draftRaw])[0] || '';
    const insertAfterTagIndex = Number(
      activeVariantTagEditorState.insertAfterTagIndex,
    );
    if (!Number.isFinite(idx) || idx < 0 || idx >= rows.length || !nextTag) {
      return rows;
    }
    const cur = normalizeRecipeTagList(rows[idx].tags || []);
    const normalizedInsertAfter = Number.isFinite(insertAfterTagIndex)
      ? Math.trunc(insertAfterTagIndex)
      : cur.length - 1;
    const insertAt = Math.max(
      0,
      Math.min(cur.length, normalizedInsertAfter + 1),
    );
    const merged = normalizeRecipeTagList([
      ...cur.slice(0, insertAt),
      nextTag,
      ...cur.slice(insertAt),
    ]);
    rows[idx] = {
      ...rows[idx],
      tags: merged,
    };
    return rows;
  };

  const setPendingVariantCellFocus = (rowIndex, column, options = {}) => {
    pendingVariantCellFocus = {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      column: column === 'home' || column === 'tags' ? column : 'variant',
      caretAtStart: options?.caretAtStart !== false,
      openTypeahead: !!options?.openTypeahead,
    };
  };

  const removeEmptyNamedVariantRows = () => {
    const baseRow = variantRowsDraft.find((row) => row?.isBase) || {
      isBase: true,
      value: '',
      homeLocation: 'none',
    };
    const namedRows = variantRowsDraft
      .filter((row) => row && !row.isBase)
      .filter((row) => String(row?.value || '').trim())
      .map((row) => ({
        isBase: false,
        value: String(row?.value || ''),
        homeLocation: normalizeShoppingHomeLocationId(
          row?.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(row?.tags || []),
        variantId: Number.isFinite(Number(row?.variantId))
          ? Number(row.variantId)
          : null,
        isDeprecated: !!row?.isDeprecated,
      }));
    variantRowsDraft = [
      {
        isBase: true,
        value: '',
        homeLocation: normalizeShoppingHomeLocationId(
          baseRow.homeLocation || 'none',
        ),
        tags: normalizeRecipeTagList(baseRow.tags || []),
        variantId: Number.isFinite(Number(baseRow?.variantId))
          ? Number(baseRow.variantId)
          : null,
        isDeprecated: !!baseRow?.isDeprecated,
      },
      ...namedRows,
    ];
  };

  const createEmptyInsertedVariantRow = () => ({
    isBase: false,
    value: '',
    homeLocation: 'none',
    tags: [],
    variantId: null,
    isDeprecated: false,
    // Shift+Enter inserts a fresh empty row. If focus jitters during the
    // immediate rerender cycle, the first blur must not auto-delete it.
    preventAutoDeleteOnInitialBlur: true,
  });

  const ensureNamedVariantRowAt = (rowIndex) => {
    ensureBaseVariantRowPresent();
    const desiredIndex = Math.max(1, Number(rowIndex) || 1);
    while (variantRowsDraft.length <= desiredIndex) {
      variantRowsDraft.push(createEmptyInsertedVariantRow());
    }
    syncVariantHiddenInput({ emit: true });
    return desiredIndex;
  };

  const insertNamedVariantRowAfter = (rowIndex) => {
    ensureBaseVariantRowPresent();
    const sourceIndex = Math.max(0, Number(rowIndex) || 0);
    const insertAt = Math.max(
      1,
      Math.min(variantRowsDraft.length, sourceIndex + 1),
    );
    variantRowsDraft.splice(insertAt, 0, createEmptyInsertedVariantRow());
    syncVariantHiddenInput({ emit: true });
    return insertAt;
  };

  const insertPastedVariantRowsAt = (rowIndex, rawText) => {
    const normalizedText = String(rawText || '').replace(/\r\n?/g, '\n');
    if (!normalizedText.includes('\n')) return false;
    const targetIndex = Math.max(1, Number(rowIndex) || 1);
    const currentRow =
      variantRowsDraft[targetIndex] && !variantRowsDraft[targetIndex].isBase
        ? variantRowsDraft[targetIndex]
        : { isBase: false, value: '', homeLocation: 'none' };
    const existingKeys = new Set(
      variantRowsDraft
        .filter((row, index) => index !== targetIndex && row && !row.isBase)
        .map((row) => normalizeNamedIngredientVariant(row.value).toLowerCase())
        .filter(Boolean),
    );
    const pastedKeys = new Set();
    const nextRows = [];
    let skippedDuplicateCount = 0;
    let skippedReservedCount = 0;

    normalizedText
      .split('\n')
      .map((value) => String(value || '').trim())
      .forEach((value) => {
        if (!value) return;
        if (isReservedIngredientVariantName(value)) {
          skippedReservedCount += 1;
          return;
        }
        const normalizedValue = normalizeNamedIngredientVariant(value);
        if (!normalizedValue) {
          skippedReservedCount += 1;
          return;
        }
        const rowKey = normalizedValue.toLowerCase();
        if (existingKeys.has(rowKey) || pastedKeys.has(rowKey)) {
          skippedDuplicateCount += 1;
          return;
        }
        pastedKeys.add(rowKey);
        nextRows.push({
          isBase: false,
          value: normalizedValue,
          homeLocation:
            nextRows.length === 0
              ? normalizeShoppingHomeLocationId(
                  currentRow.homeLocation || 'none',
                )
              : 'none',
          tags: [],
          variantId: null,
          isDeprecated: false,
        });
      });

    if (!nextRows.length) {
      uiToast('No new variants to add.');
      return true;
    }

    if (
      variantRowsDraft[targetIndex] &&
      !variantRowsDraft[targetIndex].isBase
    ) {
      variantRowsDraft.splice(targetIndex, 1, ...nextRows);
    } else {
      variantRowsDraft.splice(targetIndex, 0, ...nextRows);
    }
    removeEmptyNamedVariantRows();
    syncVariantHiddenInput({ emit: true });
    renderVariantRows({
      focusCell: {
        rowIndex: targetIndex,
        column: 'variant',
        caretAtStart: true,
      },
    });

    const detailBits = [];
    if (skippedDuplicateCount > 0) {
      detailBits.push(
        `${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? '' : 's'} skipped`,
      );
    }
    if (skippedReservedCount > 0) {
      detailBits.push(
        `${skippedReservedCount} reserved name${skippedReservedCount === 1 ? '' : 's'} skipped`,
      );
    }
    uiToast(
      detailBits.length
        ? `Added ${nextRows.length} variant${nextRows.length === 1 ? '' : 's'}; ${detailBits.join(', ')}.`
        : `Added ${nextRows.length} variant${nextRows.length === 1 ? '' : 's'}.`,
    );
    return true;
  };

  const moveVariantRow = (rowIndex, delta) => {
    const currentIndex = Number(rowIndex);
    if (!Number.isFinite(currentIndex) || currentIndex <= 0) return false;
    const targetIndex = currentIndex + Number(delta || 0);
    if (targetIndex <= 0 || targetIndex >= variantRowsDraft.length)
      return false;
    const currentRow = variantRowsDraft[currentIndex];
    const targetRow = variantRowsDraft[targetIndex];
    if (!currentRow || currentRow.isBase || !targetRow || targetRow.isBase)
      return false;
    variantRowsDraft.splice(currentIndex, 1);
    variantRowsDraft.splice(targetIndex, 0, currentRow);
    syncVariantHiddenInput({ emit: true });
    return true;
  };

  /**
   * Permanently removes a named catalog variant from the draft after confirm.
   * Rewrites recipe references and removes explicit aisle links for the deleted variant via purgeCatalogVariantReferences.
   * @returns {Promise<boolean>} true if draft was mutated; false if cancelled.
   * @param {{ variantNameForRemoval?: string }} [options] When the name input is
   *   cleared before this runs, pass the last committed name so lookups still match.
   */
  const runCatalogVariantRemovalFlow = async (
    normalizedIndex,
    options = {},
  ) => {
    const row = variantRowsDraft[Number(normalizedIndex)];
    if (!row || row.isBase) return false;
    const overrideRaw =
      options?.variantNameForRemoval != null
        ? String(options.variantNameForRemoval)
        : '';
    const variantName = normalizeNamedIngredientVariant(
      overrideRaw.trim() !== '' ? overrideRaw : row.value,
    );
    if (!variantName) return false;

    const idStr = sessionStorage.getItem('selectedShoppingItemId');
    const ingredientId = Number(idStr);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return false;

    const itemName = getCurrentItemNameForBaseRow();

    if (
      !window.dataService ||
      typeof window.dataService.loadShoppingItemVariantUsage !== 'function'
    ) {
      uiToast('Variant usage lookup is unavailable.');
      return false;
    }

    let recipes = [];
    let aislePlacements = [];
    try {
      window.dataService.useSupabase = true;
      const usage = await window.dataService.loadShoppingItemVariantUsage({
        ingredientId,
        variantName,
      });
      recipes = Array.isArray(usage?.recipes) ? usage.recipes : [];
      aislePlacements = Array.isArray(usage?.aislePlacements)
        ? usage.aislePlacements
        : [];
    } catch (err) {
      console.error('dataService.loadShoppingItemVariantUsage failed:', err);
      uiToast('Failed to check variant usage. See console for details.');
      return false;
    }

    const refCount = recipes.length;
    const aisleCount = aislePlacements.length;
    const inUse = refCount > 0 || aisleCount > 0;

    let ok = false;
    if (inUse) {
      const summaryLine = buildCatalogVariantDeleteInUseMessage({
        variantName,
        itemName,
        recipeCount: refCount,
        aisleCount,
      });
      const details = createVariantUsageLedgerNode(recipes, aislePlacements);
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Delete variant in use',
          message: summaryLine,
          messageNode: details,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Delete variant in use',
          message: `${summaryLine}${formatVariantUsageLedgerPlainText(recipes, aislePlacements)}`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          danger: true,
        });
      }
    } else {
      const summaryLine = buildCatalogVariantDeleteUnusedMessage({
        variantName,
        itemName,
      });
      ok = await uiConfirm({
        title: 'Delete variant',
        message: summaryLine,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
    }
    if (!ok) return false;

    if (typeof window.dataService.purgeCatalogVariantReferences === 'function') {
      try {
        window.dataService.useSupabase = true;
        await window.dataService.purgeCatalogVariantReferences({
          ingredientId,
          variantName,
          ingredientName: getCurrentItemNameForBaseRow(),
        });
        try {
          if (
            window.favoriteEatsDocumentSession &&
            typeof window.favoriteEatsDocumentSession
              .stashCatalogVariantPurgedPatch === 'function'
          ) {
            window.favoriteEatsDocumentSession.stashCatalogVariantPurgedPatch({
              ingredientId,
              variantName,
              ingredientName: getCurrentItemNameForBaseRow(),
            });
          }
        } catch (_) {}
      } catch (err) {
        console.error('dataService.purgeCatalogVariantReferences failed:', err);
        uiToast('Failed to update recipe references. See console for details.');
        return false;
      }
    }

    try {
      await pruneOrphanShoppingItemSelectionsWithDataService({
        skipRemoteSave: true,
      });
    } catch (err) {
      console.warn(
        'Shopping plan orphan prune after catalog variant delete failed:',
        err,
      );
    }

    if (shouldUseRemoteShoppingState()) {
      try {
        await hydrateShoppingStateFromDataService({
          force: true,
          source: 'catalog variant delete',
        });
      } catch (err) {
        console.warn(
          'Shopping plan hydrate after catalog variant delete failed:',
          err,
        );
      }
    }

    variantRowsDraft.splice(normalizedIndex, 1);
    removeEmptyNamedVariantRows();
    try {
      document.activeElement?.blur?.();
    } catch (_) {}
    syncVariantHiddenInput({ emit: false });
    renderVariantRows();
    try {
      commitVariantRowsBaseline();
    } catch (_) {}
    return true;
  };

  const openVariantRowActions = async (rowIndex) => {
    const normalizedIndex = Number(rowIndex);
    const row = variantRowsDraft[normalizedIndex];
    if (!row || variantActionDialogOpen) return;
    variantActionDialogOpen = true;
    try {
      if (row.isBase) {
        if (
          normalizeShoppingHomeLocationId(row.homeLocation || 'none') === 'none'
        )
          return;
        const ok = await uiConfirm({
          title: 'Clear home location',
          message: `Clear the home location for Base item (${getCurrentItemNameForBaseRow()})?`,
          confirmText: 'Clear',
          cancelText: 'Cancel',
        });
        if (!ok) return;
        row.homeLocation = 'none';
        syncVariantHiddenInput({ emit: true });
        renderVariantRows({
          focusCell: { rowIndex: 0, column: 'home', caretAtStart: true },
        });
        return;
      }

      await runCatalogVariantRemovalFlow(normalizedIndex);
    } finally {
      variantActionDialogOpen = false;
    }
  };

  const handleVariantCellContextAction = (event, rowIndex) => {
    if (!event || event.defaultPrevented) return;
    const isCtrlOnlyGesture = !!(
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    );
    if (!isCtrlOnlyGesture) return;
    const isCtrlClick = event.type === 'click' && Number(event.button) === 0;
    const isCtrlContextMenu = event.type === 'contextmenu';
    if (!isCtrlClick && !isCtrlContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    void openVariantRowActions(rowIndex);
  };

  const applyPendingVariantCellFocus = () => {
    if (!variantRowsEl || !pendingVariantCellFocus) return;
    const { rowIndex, column, caretAtStart, openTypeahead } =
      pendingVariantCellFocus;
    const findPendingFocusTarget = () => {
      const selector =
        column === 'home'
          ? `.shopping-item-variant-home-input[data-row-index="${rowIndex}"]`
          : column === 'tags'
            ? `.shopping-item-variant-tags-input[data-row-index="${rowIndex}"]`
            : `.shopping-item-variant-name-input[data-row-index="${rowIndex}"]`;
      const target =
        variantRowsEl.querySelector(selector) ||
        variantRowsEl.querySelector(
          column === 'home'
            ? '.shopping-item-variant-home-input[data-row-index]'
            : column === 'tags'
              ? '.shopping-item-variant-tags-input[data-row-index]'
              : '.shopping-item-variant-name-input[data-row-index]',
        );
      return target instanceof HTMLInputElement ? target : null;
    };

    const tryApplyFocus = () => {
      const target = findPendingFocusTarget();
      if (!(target instanceof HTMLInputElement)) return false;
      try {
        logVariantTagDebug('apply pending focus', {
          rowIndex,
          column,
          caretAtStart: !!caretAtStart,
          openTypeahead: !!openTypeahead,
          targetClassName: target.className,
          targetValue: target.value,
        });
        target.focus({ preventScroll: true });
        const caretIndex = caretAtStart ? 0 : target.value.length;
        target.setSelectionRange(caretIndex, caretIndex);
        if (openTypeahead) {
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              bubbles: true,
            }),
          );
        }
        return true;
      } catch (_) {
        return false;
      }
    };

    const finishIfStable = () => {
      const target = findPendingFocusTarget();
      if (!(target instanceof HTMLInputElement)) return false;
      if (document.activeElement !== target) return false;
      pendingVariantCellFocus = null;
      return true;
    };

    // Try immediately after render. Some browsers still move focus after the
    // originating key event completes, so also verify/refocus on the next task.
    tryApplyFocus();
    window.setTimeout(() => {
      if (!pendingVariantCellFocus) return;
      tryApplyFocus();
      if (finishIfStable()) return;
      requestAnimationFrame(() => {
        try {
          tryApplyFocus();
        } finally {
          pendingVariantCellFocus = null;
        }
      });
    }, 0);
    requestAnimationFrame(() => {
      if (!pendingVariantCellFocus) return;
      tryApplyFocus();
      finishIfStable();
    });
  };

  const renderVariantRows = ({ focusCell = null } = {}) => {
    if (!variantRowsEl) return;
    variantRowsRenderGeneration += 1;
    ensureBaseVariantRowPresent();
    if (
      activeVariantTagEditorState &&
      (!Number.isFinite(Number(activeVariantTagEditorState.rowIndex)) ||
        Number(activeVariantTagEditorState.rowIndex) < 0 ||
        Number(activeVariantTagEditorState.rowIndex) >= variantRowsDraft.length)
    ) {
      activeVariantTagEditorState = null;
    }
    if (focusCell && Number.isFinite(Number(focusCell.rowIndex))) {
      setPendingVariantCellFocus(
        focusCell.rowIndex,
        focusCell.column,
        focusCell,
      );
    }
    variantRowsEl.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'shopping-item-variant-grid';

    const headerRowEl = document.createElement('div');
    headerRowEl.className =
      'shopping-item-variant-grid-row shopping-item-variant-grid-row--header';
    headerRowEl.setAttribute('aria-hidden', 'true');

    const nameHeaderEl = document.createElement('div');
    nameHeaderEl.className = 'shopping-item-variant-header-cell';
    nameHeaderEl.textContent = 'Name';

    const homeHeaderEl = document.createElement('div');
    homeHeaderEl.className = 'shopping-item-variant-header-cell';
    homeHeaderEl.textContent = 'Home location';

    const tagsHeaderEl = document.createElement('div');
    tagsHeaderEl.className = 'shopping-item-variant-header-cell';
    tagsHeaderEl.textContent = 'Tags';

    headerRowEl.appendChild(nameHeaderEl);
    headerRowEl.appendChild(homeHeaderEl);
    headerRowEl.appendChild(tagsHeaderEl);
    gridEl.appendChild(headerRowEl);

    variantRowsDraft.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'shopping-item-variant-grid-row';
      rowEl.dataset.rowIndex = String(index);

      const variantCell = document.createElement('div');
      variantCell.className = row?.isBase
        ? 'shopping-item-variant-cell shopping-item-variant-cell--base'
        : 'shopping-item-variant-cell shopping-item-variant-cell--variant';
      variantCell.dataset.rowIndex = String(index);
      variantCell.title = row?.isBase
        ? `${getCurrentItemNameForBaseRow()} (base)`
        : String(row?.value || '');
      variantCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey) return;
        if (activeVariantTagEditorState) {
          commitActiveVariantTagDraft({ clear: true });
        }
        const targetIndex = row?.isBase ? ensureNamedVariantRowAt(1) : index;
        renderVariantRows({
          focusCell: {
            rowIndex: targetIndex,
            column: 'variant',
            caretAtStart: true,
          },
        });
      });
      variantCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );

      if (row?.isBase) {
        const baseLabel = document.createElement('div');
        baseLabel.className = 'shopping-item-variant-base-label';
        const basePrefix = document.createElement('span');
        basePrefix.className = 'shopping-item-variant-base-prefix';
        basePrefix.textContent = getCurrentItemNameForBaseRow();
        const baseName = document.createElement('span');
        baseName.className = 'shopping-item-variant-base-name';
        baseName.textContent = '(base)';
        baseLabel.appendChild(basePrefix);
        baseLabel.appendChild(baseName);
        variantCell.appendChild(baseLabel);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'shopping-item-variant-name-input';
        input.dataset.rowIndex = String(index);
        input.dataset.committedValue = String(row?.value || '');
        input.placeholder = '';
        input.value = String(row?.value || '');
        input.setAttribute(
          'aria-label',
          String(row?.value || '').trim()
            ? `Variant ${index}`
            : `Variant row ${index}`,
        );
        input.addEventListener('input', () => {
          if (!variantRowsEl || !variantRowsEl.contains(input)) return;
          if (!variantRowsDraft[index] || variantRowsDraft[index].isBase)
            return;
          variantRowsDraft[index].value = input.value;
          variantRowsDraft[index].preventAutoDeleteOnInitialBlur = false;
          syncVariantHiddenInput({ emit: true });
          input.title = input.value;
        });
        input.addEventListener('paste', (event) => {
          const clipboard = event.clipboardData || window.clipboardData;
          const pastedText =
            clipboard?.getData?.('text/plain') ||
            clipboard?.getData?.('Text') ||
            '';
          if (!String(pastedText || '').match(/[\r\n]/)) return;
          event.preventDefault();
          event.stopPropagation();
          insertPastedVariantRowsAt(index, pastedText);
        });
        input.addEventListener('keydown', (event) => {
          if (event.isComposing) return;
          if (event.metaKey && !event.ctrlKey && !event.altKey) {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              const moved = moveVariantRow(
                index,
                event.key === 'ArrowDown' ? 1 : -1,
              );
              if (moved) {
                renderVariantRows({
                  focusCell: {
                    rowIndex: Math.max(
                      1,
                      index + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
              return;
            }
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (event.shiftKey) {
              const normalizedBeforeInsert = normalizeNamedIngredientVariant(
                input.value,
              );
              if (normalizedBeforeInsert) {
                variantRowsDraft[index].value = normalizedBeforeInsert;
                variantRowsDraft[index].preventAutoDeleteOnInitialBlur = false;
                input.dataset.committedValue = normalizedBeforeInsert;
              }
              const targetIndex = insertNamedVariantRowAfter(index);
              renderVariantRows({
                focusCell: {
                  rowIndex: targetIndex,
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            // Plain Enter commits by blurring — but blur on an empty row with no
            // committed value removes the row. A second Enter (key repeat / focus
            // redelivery after Shift+Enter inserts a row) must not blur that fresh
            // empty field or the new row vanishes immediately.
            const rawTrim = String(input.value || '').trim();
            const prevTrim = String(input.dataset.committedValue || '').trim();
            if (!rawTrim && !prevTrim) return;
            input.blur();
            return;
          }
          if (
            event.key === 'Backspace' &&
            String(input.value || '').trim() === ''
          ) {
            const prevC = String(input.dataset.committedValue || '').trim();
            if (!prevC) {
              event.preventDefault();
              event.stopPropagation();
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows({
                focusCell: {
                  rowIndex: Math.max(1, index - 1),
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const ok = await runCatalogVariantRemovalFlow(index, {
                variantNameForRemoval: prevC,
              });
              if (!ok) {
                input.value = prevC;
                if (variantRowsDraft[index]) {
                  variantRowsDraft[index].value = prevC;
                }
                syncVariantHiddenInput({ emit: true });
                renderVariantRows({
                  focusCell: {
                    rowIndex: index,
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
            })();
          }
        });
        input.addEventListener('blur', () => {
          if (!variantRowsEl || !variantRowsEl.contains(input)) return;
          if (!variantRowsDraft[index] || variantRowsDraft[index].isBase)
            return;
          const previousCommittedValue = String(
            input.dataset.committedValue || '',
          ).trim();
          const normalizedValue = normalizeNamedIngredientVariant(input.value);
          if (!normalizedValue) {
            if (!previousCommittedValue) {
              if (variantRowsDraft[index]?.preventAutoDeleteOnInitialBlur) {
                variantRowsDraft[index].preventAutoDeleteOnInitialBlur = false;
                return;
              }
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows();
              return;
            }
            void (async () => {
              const ok = await runCatalogVariantRemovalFlow(index, {
                variantNameForRemoval: previousCommittedValue,
              });
              if (!ok) {
                input.value = previousCommittedValue;
                if (variantRowsDraft[index]) {
                  variantRowsDraft[index].value = previousCommittedValue;
                }
                syncVariantHiddenInput({ emit: true });
                renderVariantRows({
                  focusCell: {
                    rowIndex: index,
                    column: 'variant',
                    caretAtStart: true,
                  },
                });
              }
            })();
            return;
          }
          const duplicateIndex = variantRowsDraft.findIndex(
            (entry, entryIndex) =>
              entryIndex !== index &&
              entry &&
              !entry.isBase &&
              normalizeNamedIngredientVariant(entry.value).toLowerCase() ===
                normalizedValue.toLowerCase(),
          );
          if (duplicateIndex !== -1) {
            uiToast('That variant already exists.');
            if (!previousCommittedValue) {
              variantRowsDraft.splice(index, 1);
              removeEmptyNamedVariantRows();
              syncVariantHiddenInput({ emit: true });
              renderVariantRows({
                focusCell: {
                  rowIndex: duplicateIndex,
                  column: 'variant',
                  caretAtStart: true,
                },
              });
              return;
            }
            variantRowsDraft[index].value = previousCommittedValue;
            syncVariantHiddenInput({ emit: true });
            renderVariantRows({
              focusCell: {
                rowIndex: index,
                column: 'variant',
                caretAtStart: true,
              },
            });
            return;
          }
          variantRowsDraft[index].value = normalizedValue;
          const pendingDeprecated = !!variantRowsDraft[index].isDeprecated;
          const committedKey = normalizeNamedIngredientVariant(
            previousCommittedValue,
          ).toLowerCase();
          const nextKey = normalizedValue.toLowerCase();
          const valueUnchangedForDeprecation =
            committedKey.length > 0 && committedKey === nextKey;
          const blurRenderGeneration = variantRowsRenderGeneration;
          const blurDuringIntentionalRefocus = !!pendingVariantCellFocus;
          void (async () => {
            const fromDbDeprecated =
              await ingredientScopedVariantIsDeprecatedViaDataService({
                ingredientName: getCurrentItemNameForBaseRow(),
                variantText: normalizedValue,
              });
            if (!variantRowsDraft[index]) return;
            // DB lags until save after "Remove variant"; keep draft flag on blur.
            variantRowsDraft[index].isDeprecated =
              fromDbDeprecated ||
              (valueUnchangedForDeprecation && pendingDeprecated);
            syncVariantHiddenInput({ emit: true });
            // Grid rebuild (e.g. Shift+Enter insert row) blurs this input while it is
            // still connected and pendingVariantCellFocus is set; a late async completion
            // must not rerender without focus or steal the new row's caret.
            if (
              blurDuringIntentionalRefocus ||
              blurRenderGeneration !== variantRowsRenderGeneration ||
              !input.isConnected
            ) {
              return;
            }
            input.value = normalizedValue;
            input.dataset.committedValue = normalizedValue;
            input.title = normalizedValue;
            renderVariantRows();
          })();
        });
        input.addEventListener('click', (event) => {
          if (event.ctrlKey) return;
          event.stopPropagation();
        });
        input.addEventListener('contextmenu', (event) =>
          handleVariantCellContextAction(event, index),
        );
        input.addEventListener('click', (event) =>
          handleVariantCellContextAction(event, index),
        );
        variantCell.appendChild(input);
      }

      const homeCell = document.createElement('div');
      homeCell.className =
        'shopping-item-variant-cell shopping-item-variant-cell--home';
      homeCell.dataset.rowIndex = String(index);
      homeCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey) return;
        if (activeVariantTagEditorState) {
          commitActiveVariantTagDraft({ clear: true });
        }
        renderVariantRows({
          focusCell: {
            rowIndex: index,
            column: 'home',
            caretAtStart: true,
            openTypeahead: true,
          },
        });
      });
      homeCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );

      const homeInput = document.createElement('input');
      homeInput.type = 'text';
      homeInput.className = 'shopping-item-variant-home-input';
      homeInput.dataset.rowIndex = String(index);
      homeInput.dataset.committedValue = getHomeLocationDisplayText(
        row?.homeLocation || 'none',
      );
      homeInput.value = getHomeLocationDisplayText(row?.homeLocation || 'none');
      homeInput.placeholder = '';
      homeInput.title = homeInput.value;
      homeInput.setAttribute(
        'aria-label',
        row?.isBase
          ? `Home location for Base item`
          : `Home location for ${normalizeNamedIngredientVariant(row?.value) || 'variant'}`,
      );
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.attach === 'function'
      ) {
        window.favoriteEatsTypeahead.attach({
          inputEl: homeInput,
          getPool: async () =>
            homeLocationDefsForEditor.map((entry) =>
              String(entry.label || entry.id),
            ),
          getItems: (pool, query) => {
            const normalizedQuery = String(query || '')
              .trim()
              .toLowerCase();
            const items = (Array.isArray(pool) ? pool : [])
              .map((value) => String(value || '').trim())
              .filter(Boolean);
            if (!normalizedQuery) return items;
            return items.filter((value) =>
              value.toLowerCase().includes(normalizedQuery),
            );
          },
          openOnFocus: true,
          pickOnEnterWhenQueryEmpty: false,
          minWidth: 220,
          maxWidth: 360,
        });
      }
      homeInput.addEventListener('input', () => {
        homeInput.title = homeInput.value;
        const liveMatch = resolveHomeLocationIdFromInput(homeInput.value);
        if (!liveMatch) return;
        variantRowsDraft[index].homeLocation = liveMatch;
        syncVariantHiddenInput({ emit: true });
      });
      homeInput.addEventListener('keydown', (event) => {
        if (event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            const moved = moveVariantRow(
              index,
              event.key === 'ArrowDown' ? 1 : -1,
            );
            if (moved) {
              renderVariantRows({
                focusCell: {
                  rowIndex: Math.max(
                    1,
                    index + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                  column: 'home',
                  caretAtStart: true,
                  openTypeahead: true,
                },
              });
            }
            return;
          }
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          const nextIndex = index + 1;
          if (nextIndex < variantRowsDraft.length) {
            renderVariantRows({
              focusCell: {
                rowIndex: nextIndex,
                column: 'home',
                caretAtStart: true,
                openTypeahead: true,
              },
            });
            return;
          }
        }
        window.setTimeout(() => {
          try {
            homeInput.blur();
          } catch (_) {}
        }, 0);
      });
      homeInput.addEventListener('blur', () => {
        const rawValue = String(homeInput.value || '').trim();
        const normalizedHomeLocation = resolveHomeLocationIdFromInput(rawValue);
        if (!rawValue) {
          variantRowsDraft[index].homeLocation = 'none';
          homeInput.value = '';
          homeInput.dataset.committedValue = '';
          homeInput.title = '';
          syncVariantHiddenInput({ emit: true });
          return;
        }
        if (!normalizedHomeLocation) {
          uiToast('Choose a known home location.');
          homeInput.value = String(homeInput.dataset.committedValue || '');
          homeInput.title = homeInput.value;
          return;
        }
        variantRowsDraft[index].homeLocation = normalizedHomeLocation;
        homeInput.value = getHomeLocationDisplayText(normalizedHomeLocation);
        homeInput.dataset.committedValue = homeInput.value;
        homeInput.title = homeInput.value;
        syncVariantHiddenInput({ emit: true });
      });
      homeInput.addEventListener('click', (event) => {
        if (event.ctrlKey) return;
        event.stopPropagation();
      });
      homeInput.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      homeInput.addEventListener('click', (event) =>
        handleVariantCellContextAction(event, index),
      );
      homeCell.appendChild(homeInput);

      const tagsCell = document.createElement('div');
      tagsCell.className =
        'shopping-item-variant-cell shopping-item-variant-cell--tags';
      tagsCell.dataset.rowIndex = String(index);
      const committedTags = normalizeRecipeTagList(row?.tags || []);
      variantRowsDraft[index].tags = committedTags;
      const tagsEditorState =
        Number(activeVariantTagEditorState?.rowIndex) === index
          ? activeVariantTagEditorState
          : null;
      const isEditingTags = !!tagsEditorState;
      const activeInsertAfterTagIndex = Number.isFinite(
        Number(tagsEditorState?.insertAfterTagIndex),
      )
        ? Math.trunc(Number(tagsEditorState?.insertAfterTagIndex))
        : committedTags.length - 1;
      const inputInsertBeforeIndex = isEditingTags
        ? Math.max(
            0,
            Math.min(committedTags.length, activeInsertAfterTagIndex + 1),
          )
        : -1;
      const tagsControl = document.createElement('div');
      tagsControl.className = isEditingTags
        ? 'shopping-item-variant-tags-control is-editing'
        : 'shopping-item-variant-tags-control';

      const tagsInput = document.createElement('input');
      tagsInput.type = 'text';
      tagsInput.className = 'shopping-item-variant-tags-input';
      tagsInput.dataset.rowIndex = String(index);
      const tagsInputSlot = document.createElement('span');
      tagsInputSlot.className = 'shopping-item-variant-tags-slot';
      tagsInputSlot.appendChild(tagsInput);
      tagsInput.value =
        isEditingTags && typeof tagsEditorState?.draft === 'string'
          ? tagsEditorState.draft
          : '';
      const syncVariantTagsInputLayout = () => {
        const draftValue = String(tagsInput.value || '');
        tagsInput.size = Math.max(1, draftValue.length || 1);
        tagsInputSlot.classList.toggle('is-empty', draftValue.length === 0);
      };
      syncVariantTagsInputLayout();
      tagsInput.placeholder = '';
      tagsInput.setAttribute(
        'aria-label',
        row?.isBase
          ? `Tags for Base item`
          : `Tags for ${normalizeNamedIngredientVariant(row?.value) || 'variant'}`,
      );
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.attach === 'function'
      ) {
        window.favoriteEatsTypeahead.attach({
          inputEl: tagsInput,
          getPool: async () => {
            if (window.dataService) window.dataService.useSupabase = true;
            return await getVisibleIngredientTagNamePool();
          },
          openOnFocus: true,
          pickOnEnterWhenQueryEmpty: false,
          minWidth: 220,
          maxWidth: 380,
          onPick: (pickedValue, inputEl) => {
            const inserted = insertVariantTagToRow(
              index,
              pickedValue,
              activeInsertAfterTagIndex,
            );
            inputEl.value = '';
            syncVariantTagsInputLayout();
            if (!inserted) return;
            setActiveVariantTagEditorState(index, '', {
              insertAfterTagIndex: activeInsertAfterTagIndex + 1,
            });
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: 'typeahead-pick',
            });
          },
        });
      }
      tagsInput.addEventListener('input', () => {
        const currentInsertAfterTagIndex =
          Number(activeVariantTagEditorState?.rowIndex) === index &&
          Number.isFinite(
            Number(activeVariantTagEditorState?.insertAfterTagIndex),
          )
            ? Math.trunc(
                Number(activeVariantTagEditorState.insertAfterTagIndex),
              )
            : activeInsertAfterTagIndex;
        setActiveVariantTagEditorState(index, tagsInput.value || '', {
          insertAfterTagIndex: currentInsertAfterTagIndex,
        });
        syncVariantTagsInputLayout();
        refreshVariantEditorDirty();
      });
      tagsInput.addEventListener('keydown', (event) => {
        const getCurrentInsertAfterTagIndex = () =>
          Number(activeVariantTagEditorState?.rowIndex) === index &&
          Number.isFinite(
            Number(activeVariantTagEditorState?.insertAfterTagIndex),
          )
            ? Math.trunc(
                Number(activeVariantTagEditorState.insertAfterTagIndex),
              )
            : activeInsertAfterTagIndex;

        const tryMoveVariantTagInsertSlot = (direction) => {
          if (direction !== -1 && direction !== 1) return false;
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return false;
          if (String(tagsInput.value || '') !== '') return false;
          const existingTags = normalizeRecipeTagList(
            variantRowsDraft[index].tags || [],
          );
          if (existingTags.length === 0) return false;

          event.preventDefault();
          event.stopPropagation();

          const currentInsertAfterTagIndex = getCurrentInsertAfterTagIndex();
          const nextInsertAfterTagIndex = Math.max(
            -1,
            Math.min(
              existingTags.length - 1,
              currentInsertAfterTagIndex + direction,
            ),
          );
          if (nextInsertAfterTagIndex === currentInsertAfterTagIndex) {
            logVariantTagDebug('slot move no-op at boundary', {
              rowIndex: index,
              key: event.key,
              insertAfterTagIndex: currentInsertAfterTagIndex,
            });
            return true;
          }

          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: nextInsertAfterTagIndex,
          });
          logVariantTagDebug('slot move via arrow key', {
            rowIndex: index,
            key: event.key,
            insertAfterTagIndex: currentInsertAfterTagIndex,
            nextInsertAfterTagIndex,
          });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup: true,
            reason: direction < 0 ? 'slot-move:left' : 'slot-move:right',
          });
          return true;
        };

        const commitTagsDraftInlineAndStay = () => {
          const draftText = String(tagsInput.value || '').trim();
          if (!draftText) {
            logVariantTagDebug('skip inline commit: empty draft', {
              rowIndex: index,
              key: event.key,
              shiftKey: !!event.shiftKey,
              insertAfterTagIndex: activeInsertAfterTagIndex,
            });
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          const pickedSuggestion =
            !!window.favoriteEatsTypeahead &&
            typeof window.favoriteEatsTypeahead
              .pickHighlightedIfOpenForInput === 'function' &&
            window.favoriteEatsTypeahead.pickHighlightedIfOpenForInput(
              tagsInput,
            );
          if (pickedSuggestion) {
            logVariantTagDebug('inline commit resolved via typeahead pick', {
              rowIndex: index,
              key: event.key,
              draftText,
              insertAfterTagIndex: activeInsertAfterTagIndex,
            });
            return true;
          }
          const changed = insertVariantTagToRow(
            index,
            draftText,
            activeInsertAfterTagIndex,
          );
          tagsInput.value = '';
          syncVariantTagsInputLayout();
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          logVariantTagDebug('inline commit attempted', {
            rowIndex: index,
            key: event.key,
            draftText,
            changed,
            insertAfterTagIndex: activeInsertAfterTagIndex,
            nextInsertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          if (changed) {
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: `inline-commit:${String(event.key || '').toLowerCase() || 'unknown'}`,
            });
          }
          return true;
        };

        logVariantTagDebug('keydown', {
          rowIndex: index,
          key: event.key,
          shiftKey: !!event.shiftKey,
          ctrlKey: !!event.ctrlKey,
          metaKey: !!event.metaKey,
          altKey: !!event.altKey,
          draftText: String(tagsInput.value || ''),
          activeInsertAfterTagIndex,
          defaultPrevented: !!event.defaultPrevented,
        });

        if (event.key === 'ArrowLeft') {
          if (tryMoveVariantTagInsertSlot(-1)) return;
        }
        if (event.key === 'ArrowRight') {
          if (tryMoveVariantTagInsertSlot(1)) return;
        }

        if (event.key === 'Tab' && !event.shiftKey) {
          if (!String(tagsInput.value || '').trim()) {
            logVariantTagDebug('allow native Tab: empty draft', {
              rowIndex: index,
              activeInsertAfterTagIndex,
            });
            return;
          }
          commitTagsDraftInlineAndStay();
          return;
        }
        if (event.key === 'Enter' && event.shiftKey) {
          if (event.repeat) return;
          event.preventDefault();
          event.stopPropagation();
          if (!String(tagsInput.value || '').trim()) {
            logVariantTagDebug('Shift+Enter on empty draft: keep insert slot focused', {
              rowIndex: index,
              activeInsertAfterTagIndex,
            });
            return;
          }
          commitTagsDraftInlineAndStay();
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          if (event.repeat) return;
          if (
            window.favoriteEatsTypeahead &&
            typeof window.favoriteEatsTypeahead.tryPickEnterForInput ===
              'function' &&
            window.favoriteEatsTypeahead.tryPickEnterForInput(tagsInput)
          ) {
            event.preventDefault();
            event.stopPropagation();
            logVariantTagDebug('plain Enter picked highlighted suggestion', {
              rowIndex: index,
              draftText: String(tagsInput.value || ''),
            });
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          logVariantTagDebug('plain Enter scheduling blur', {
            rowIndex: index,
            draftText: String(tagsInput.value || ''),
            activeInsertAfterTagIndex,
          });
          window.setTimeout(() => {
            try {
              tagsInput.blur();
            } catch (_) {}
          }, 0);
          return;
        }
        if (event.key === ',') {
          event.preventDefault();
          event.stopPropagation();
          const changed = insertVariantTagToRow(
            index,
            tagsInput.value || '',
            activeInsertAfterTagIndex,
          );
          tagsInput.value = '';
          syncVariantTagsInputLayout();
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: activeInsertAfterTagIndex + 1,
          });
          if (changed) {
            rerenderVariantTagsEditorWithFocus(index, {
              suppressBlurCleanup: true,
              reason: 'inline-commit:comma',
            });
          }
          return;
        }
        if (
          event.key === 'Backspace' &&
          String(tagsInput.value || '').trim() === ''
        ) {
          const existingTags = normalizeRecipeTagList(
            variantRowsDraft[index].tags || [],
          );
          const previousTagIndex = Math.min(
            existingTags.length - 1,
            activeInsertAfterTagIndex,
          );
          if (previousTagIndex < 0) return;
          event.preventDefault();
          event.stopPropagation();
          variantRowsDraft[index].tags = normalizeRecipeTagList(
            existingTags.filter((_, tagIndex) => tagIndex !== previousTagIndex),
          );
          syncVariantHiddenInput({ emit: true });
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: previousTagIndex - 1,
          });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup: true,
            reason: 'backspace-remove-previous-tag',
          });
        }
      });
      tagsInput.addEventListener('blur', () => {
        logVariantTagDebug('tags input blur', {
          rowIndex: index,
          draftText: String(tagsInput.value || ''),
          activeElementClassName:
            document.activeElement instanceof HTMLElement
              ? document.activeElement.className
              : '',
          pendingVariantCellFocus,
          pendingVariantTagPillInteraction,
        });
        window.setTimeout(() => {
          // Grid rebuild removes this input; stale blur timers must not rerender
          // or they race with Shift+Enter "insert variant row" focus.
          if (!tagsInput.isConnected) return;
          if (pendingVariantTagPillInteraction) {
            logVariantTagDebug(
              'blur deferred for pending tag-pill interaction',
              {
                rowIndex: index,
                pendingVariantTagPillInteraction,
              },
            );
            if (pendingVariantTagPillInteraction.rowIndex === index) return;
            commitActiveVariantTagDraft({ clear: true });
            return;
          }
          if (pendingVariantTagBlurCleanupSuppression?.rowIndex === index) {
            logVariantTagDebug(
              'skip blur cleanup due to intentional tags refocus',
              {
                rowIndex: index,
                reason: pendingVariantTagBlurCleanupSuppression.reason,
              },
            );
            pendingVariantTagBlurCleanupSuppression = null;
            return;
          }
          if (tagsCell.contains(document.activeElement)) {
            logVariantTagDebug('blur ignored: focus stayed inside tags cell', {
              rowIndex: index,
              activeElementClassName:
                document.activeElement instanceof HTMLElement
                  ? document.activeElement.className
                  : '',
            });
            return;
          }
          logVariantTagDebug(
            'blur committing active draft and maybe rerendering',
            {
              rowIndex: index,
              draftText: String(tagsInput.value || ''),
            },
          );
          commitActiveVariantTagDraft({ clear: true });
          if (pendingVariantCellFocus) {
            logVariantTagDebug(
              'skip rerender after blur: pending focus exists',
              {
                rowIndex: index,
                pendingVariantCellFocus,
              },
            );
            return;
          }
          logVariantTagDebug('rerender rows after blur', { rowIndex: index });
          renderVariantRows();
        }, 0);
      });
      tagsInput.addEventListener('click', (event) => {
        if (event.ctrlKey) return;
        event.stopPropagation();
      });
      tagsInput.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      tagsCell.addEventListener('mousedown', (event) => {
        if (event.target === tagsInput) return;
        if (event.ctrlKey || event.metaKey || Number(event.button) !== 0)
          return;
        event.preventDefault();
      });

      const focusTagsInputInCurrentRow = () => {
        try {
          tagsInput.focus();
          const caretIndex = tagsInput.value.length;
          tagsInput.setSelectionRange(caretIndex, caretIndex);
        } catch (_) {}
      };

      const tagPills = [];
      const renderTagsInput = () => {
        tagsControl.appendChild(tagsInputSlot);
      };

      committedTags.forEach((tag, tagIndex) => {
        if (isEditingTags && tagIndex === inputInsertBeforeIndex) {
          renderTagsInput();
        }
        const pill = document.createElement('span');
        pill.className = 'recipe-tag-pill shopping-item-variant-tag-pill';
        pill.textContent = tag;
        pill.title = 'Ctrl-click to remove';
        const removeTag = () => {
          setActiveVariantTagEditorState(index, '', {
            insertAfterTagIndex: tagIndex - 1,
          });
          variantRowsDraft[index].tags = normalizeRecipeTagList(
            committedTags.filter(
              (value) =>
                String(value || '').toLowerCase() !==
                String(tag || '').toLowerCase(),
            ),
          );
          syncVariantHiddenInput({ emit: true });
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup:
              Number(activeVariantTagEditorState?.rowIndex) === index,
            reason: 'remove-tag',
          });
        };
        pill.addEventListener('mousedown', (event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          beginVariantTagPillInteraction(index);
        });
        const handleTagPillModifierAction = async (event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const interaction =
            pendingVariantTagPillInteraction?.rowIndex === index
              ? pendingVariantTagPillInteraction
              : beginVariantTagPillInteraction(index);
          if (interaction.handled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          interaction.handled = true;
          event.preventDefault();
          event.stopPropagation();
          const ok = await confirmShoppingVariantTagRemoval(tag);
          if (pendingVariantTagPillInteraction === interaction) {
            pendingVariantTagPillInteraction = null;
          }
          if (!ok) {
            if (interaction.previousActiveRowIndex === index) {
              focusTagsInputInCurrentRow();
            } else if (interaction.previousActiveRowIndex >= 0) {
              setActiveVariantTagEditorState(index, '', {
                insertAfterTagIndex: tagIndex - 1,
              });
              rerenderVariantTagsEditorWithFocus(index, {
                reason: 'cancel-remove-refocus',
              });
            }
            return;
          }
          removeTag();
        };
        pill.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey) {
            void handleTagPillModifierAction(event);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (
            activeVariantTagEditorState &&
            Number(activeVariantTagEditorState.rowIndex) !== index
          ) {
            commitActiveVariantTagDraft({ clear: true });
          }
          const rect = pill.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          const insertAfterTagIndex =
            typeof event.clientX === 'number' && event.clientX < midpoint
              ? tagIndex - 1
              : tagIndex;
          setActiveVariantTagEditorState(
            index,
            Number(activeVariantTagEditorState?.rowIndex) === index
              ? String(activeVariantTagEditorState?.draft || '')
              : '',
            { insertAfterTagIndex },
          );
          rerenderVariantTagsEditorWithFocus(index, {
            suppressBlurCleanup:
              Number(activeVariantTagEditorState?.rowIndex) === index,
            reason: 'pill-click-reposition',
          });
        });
        pill.addEventListener('contextmenu', handleTagPillModifierAction);
        window.favoriteEatsBindLongPressRemove?.(pill, async () => {
          const ok = await confirmShoppingVariantTagRemoval(tag);
          if (!ok) return;
          removeTag();
        });
        tagPills.push(pill);
        tagsControl.appendChild(pill);
      });
      if (isEditingTags && inputInsertBeforeIndex >= committedTags.length) {
        renderTagsInput();
      }
      tagsCell.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
        if (
          activeVariantTagEditorState &&
          Number(activeVariantTagEditorState.rowIndex) !== index
        ) {
          commitActiveVariantTagDraft({ clear: true });
        }
        setActiveVariantTagEditorState(
          index,
          Number(activeVariantTagEditorState?.rowIndex) === index
            ? String(activeVariantTagEditorState?.draft || '')
            : '',
          {
            insertAfterTagIndex: getVariantTagInsertAfterIndexForPoint(
              tagPills,
              event.clientX,
              event.clientY,
            ),
          },
        );
        rerenderVariantTagsEditorWithFocus(index, {
          suppressBlurCleanup:
            Number(activeVariantTagEditorState?.rowIndex) === index,
          reason: 'tags-cell-click',
        });
      });
      tagsCell.addEventListener('contextmenu', (event) =>
        handleVariantCellContextAction(event, index),
      );
      tagsCell.appendChild(tagsControl);

      rowEl.appendChild(variantCell);
      rowEl.appendChild(homeCell);
      rowEl.appendChild(tagsCell);
      window.favoriteEatsBindLongPressRemove?.(
        rowEl,
        () => {
          void openVariantRowActions(index);
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return true;
            return !!target.closest(
              'input, textarea, button, select, label, .shopping-item-variant-tag-pill',
            );
          },
        },
      );
      gridEl.appendChild(rowEl);
    });

    variantRowsEl.appendChild(gridEl);
    applyPendingVariantCellFocus();
  };
  const rerenderVariantTagsEditorWithFocus = (
    rowIndex,
    { suppressBlurCleanup = false, reason = '' } = {},
  ) => {
    if (suppressBlurCleanup) {
      suppressNextVariantTagBlurCleanup(rowIndex, reason);
    }
    renderVariantRows({
      focusCell: {
        rowIndex,
        column: 'tags',
        caretAtStart: false,
        openTypeahead: true,
      },
    });
  };

  const setVariantRowsFromSerialized = (rawValue) => {
    activeVariantTagEditorState = null;
    variantRowsDraft = getVariantRowsForEditing(
      parseIngredientVariantRowsSerialized(rawValue),
    );
    syncVariantHiddenInput({ emit: false });
    renderVariantRows();
  };

  if (singularInputEl) {
    singularInputEl.addEventListener('input', () => {
      renderVariantRows();
    });
    singularInputEl.addEventListener(
      'blur',
      () => {
        renderVariantRows();
      },
      true,
    );
  }

  attachEditorTextareaAutoGrow(
    document.getElementById('shoppingItemSynonymsTextarea'),
  );
  attachEditorTextareaAutoGrow(
    document.getElementById('shoppingItemSizesTextarea'),
  );
  attachEditorNewlineListPaste(
    document.getElementById('shoppingItemSynonymsTextarea'),
  );
  attachEditorNewlineListPaste(
    document.getElementById('shoppingItemSizesTextarea'),
  );

  const persistShoppingItem = async ({
    title: next,
    baselineTitle,
    extraValues,
    baselineVariantRowsForMigration,
  }) => {
    if (!next) return;

    window.dataService.useSupabase = true;
    try {
      if (
        !window.dataService ||
        typeof window.dataService.saveShoppingCatalogItem !== 'function'
      ) {
        throw new Error('saveShoppingCatalogItem is not available.');
      }

      const mergedVariantRows = getVariantRowsDraftWithMergedActiveTagDraft();
      let anyVisibleTagNamed = null;
      if (
        typeof window.dataService.buildRecipeEditorPreflightHelpers ===
        'function'
      ) {
        try {
          const bundle =
            await window.dataService.buildRecipeEditorPreflightHelpers();
          if (typeof bundle?.tag?.anyVisibleTagNamed === 'function') {
            anyVisibleTagNamed = bundle.tag.anyVisibleTagNamed;
          }
        } catch (err) {
          console.warn('buildRecipeEditorPreflightHelpers failed:', err);
        }
      }
      if (!anyVisibleTagNamed) {
        const pool = await getVisibleTagNamePool();
        const visibleKeys = new Set(
          (Array.isArray(pool) ? pool : [])
            .map((name) => String(name || '').trim().toLowerCase())
            .filter(Boolean),
        );
        anyVisibleTagNamed = (name) =>
          visibleKeys.has(String(name || '').trim().toLowerCase());
      }

      const unknownTagUnique = [];
      const seenUnknownTags = new Set();
      mergedVariantRows.forEach((row) => {
        normalizeRecipeTagList(row?.tags || []).forEach((tag) => {
          const key = String(tag || '').trim().toLowerCase();
          if (!key || seenUnknownTags.has(key)) return;
          seenUnknownTags.add(key);
          if (anyVisibleTagNamed(tag)) return;
          unknownTagUnique.push(tag);
        });
      });

      if (unknownTagUnique.length) {
        const resolvedTags = await resolveUnknownTagNames({
          db: null,
          tags: unknownTagUnique,
          title: `New tags (${unknownTagUnique.length})`,
          message:
            unknownTagUnique.length === 1
              ? 'This tag is not in your database. Edit, match it to an existing tag, or save it as a new one.'
              : 'These tags are not in your database. Edit, match them to existing tags, or save them as new ones.',
        });
        if (!resolvedTags) {
          uiToast('Save cancelled.');
          const silent = new Error('save-cancelled-unknown-tags');
          silent.silent = true;
          throw silent;
        }
        const replacementMap = resolvedTags.map;
        mergedVariantRows.forEach((row, index) => {
          if (!variantRowsDraft[index]) return;
          variantRowsDraft[index].tags = normalizeRecipeTagList(
            row?.tags || [],
          ).map((tag) => {
            const key = String(tag || '').trim().toLowerCase();
            return replacementMap.get(key) || tag;
          });
        });
        activeVariantTagEditorState = null;
        const baseHome = normalizeShoppingHomeLocationId(
          variantRowsDraft[0]?.homeLocation || 'none',
        );
        try {
          syncVariantHiddenInput({ emit: false });
        } catch (_) {}
        if (extraValues && typeof extraValues === 'object') {
          extraValues.variant_rows = serializeIngredientVariantRows(
            variantRowsDraft,
            { fallbackBaseHome: baseHome },
          );
        }
      }

      const payload = buildSupabaseShoppingSavePayload(
        next,
        baselineTitle,
        extraValues,
      );
      await window.dataService.saveShoppingCatalogItem(payload);
      await migrateShoppingIdentityAfterIngredientEditorSave({
        db: null,
        oldDisplayName: baselineTitle,
        newDisplayName: next,
        prevNamedRows: getNamedVariantRowsFromDraft(
          baselineVariantRowsForMigration,
        ),
        nextNamedRows: (Array.isArray(payload.variantRows)
          ? payload.variantRows
          : []
        )
          .filter((row) => row && !row.isBase)
          .map((row) => ({
            value: normalizeNamedIngredientVariant(row.variant),
          })),
        hasVariantTable: true,
      });
    } catch (err) {
      const msg = String(err && err.message ? err.message : '');
      if (msg === 'missing-ingredient-id-for-catalog-save') {
        uiToast(
          'Cannot save this item without an ingredient id. Open it again from Items.',
        );
        const silent = new Error(msg);
        silent.silent = true;
        throw silent;
      }
      if (err && err.silent) throw err;
      console.error(
        '❌ Failed to upsert shopping item ingredient (Supabase):',
        err,
      );
      uiToast('Failed to save shopping item. See console for details.');
      throw err;
    }
    sessionStorage.setItem(
      'selectedShoppingItemName',
      String(next || '').trim(),
    );
    sessionStorage.removeItem('selectedShoppingItemIsNew');
  };

  // Wire shared editor behavior once the injected shell exists.
  if (typeof waitForAppBarReady === 'function') {
    waitForAppBarReady().then(async () => {
      let baselineVariants = '';
      let baselineSizes = '';
      let baselineSynonyms = '';
      let baselineHome = 'none';
      let baselineVariantRows = normalizeIngredientVariantRows([], {
        fallbackBaseHome: baselineHome,
      });
      let baselineIsFood = '1';
      let baselineIsDeprecated = '0';
      let baselineIsHidden = '0';
      let baselinePluralOverride = '';
      let baselineUsePluralOverride = '0';
      let baselineSingularIfUnspecified = '0';
      let baselineIsMassNoun = '0';
      let baselineUseMetric = '0';
      /** Schema-driven: which grammar rows exist; substance mode still hides singular-if-unspecified. */
      let grammarVisibilitySingularIfUnspecified = true;
      /** Last checkpoint for plural Esc: set at init + after successful save (persisted override). */
      let pluralEscBaselineUse = '0';
      let pluralEscBaselineText = '';

      const syncShoppingItemGrammarUi = () => {
        const massToggle = document.getElementById(
          'shoppingItemIsMassNounToggle',
        );
        const mass = !!(massToggle && massToggle.checked);
        const countableSection = document.getElementById(
          'shoppingItemCountableGrammarSection',
        );
        const labelEl = document.getElementById(
          'shoppingItemCanonicalNameLabel',
        );
        if (countableSection) {
          countableSection.style.display = mass ? 'none' : '';
        }
        if (labelEl) {
          labelEl.textContent = mass ? 'Name' : 'Singular';
        }
        setShoppingItemDetailVisible(
          'shoppingItemSingularIfUnspecifiedBlock',
          grammarVisibilitySingularIfUnspecified && !mass,
        );
        try {
          syncShoppingItemPluralLockUi();
        } catch (_) {}
      };

      const syncShoppingItemPageTitleDisplay = () => {
        const sin = document.getElementById('shoppingItemSingularInput');
        const plIn = document.getElementById('shoppingItemPluralOverrideInput');
        const useOvEl = document.getElementById(
          'shoppingItemUsePluralOverrideToggle',
        );
        const massEl = document.getElementById('shoppingItemIsMassNounToggle');
        const appBar = document.getElementById('appBarTitle');
        const segS = document.getElementById('childEditorTitleSingularSeg');
        const segP = document.getElementById('childEditorTitlePluralSeg');
        const joiner = document.getElementById('childEditorTitleJoiner');
        const grammarExampleEcho = document.getElementById(
          'shoppingItemGrammarExampleEcho',
        );
        const escapeGrammarExampleSegment = (raw) =>
          String(raw ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const syncGrammarExampleHelp = (
          mass,
          singularTrimmed,
          pluralForPhrase,
          singularIfUnspecified,
        ) => {
          const word = mass
            ? singularTrimmed
            : singularIfUnspecified
              ? singularTrimmed
              : pluralForPhrase;
          if (!grammarExampleEcho) return;
          if (word) {
            const safeWord = escapeGrammarExampleSegment(word);
            grammarExampleEcho.style.display = '';
            grammarExampleEcho.innerHTML = `e.g. “Darling, do we need any <span class="shopping-item-grammar-example-name">${safeWord}</span> from the market?”`;
          } else {
            grammarExampleEcho.style.display = 'none';
            grammarExampleEcho.textContent = '';
          }
        };
        if (!sin || !segS) {
          if (grammarExampleEcho) {
            grammarExampleEcho.style.display = 'none';
            grammarExampleEcho.textContent = '';
          }
          return;
        }

        const mass = !!(massEl && massEl.checked);
        const s = String(sin.value || '').trim();
        const useOv = !!(useOvEl && useOvEl.checked);
        const plRaw = String(plIn?.value || '').trim();
        const autoPl =
          typeof window.pluralizeEnglishNoun === 'function'
            ? String(window.pluralizeEnglishNoun(s, '') || '').trim()
            : s
              ? `${s}s`
              : '';
        const displayPlural = useOv ? plRaw : autoPl;
        const sifuEl = document.getElementById(
          'shoppingItemSingularIfUnspecifiedToggle',
        );
        const singularIfUnspecified = !!(sifuEl && sifuEl.checked);

        if (mass) {
          if (joiner) joiner.style.display = 'none';
          if (segP) {
            segP.style.display = 'none';
            segP.textContent = '';
          }
          segS.textContent = s;
          if (appBar) appBar.textContent = s;
          syncGrammarExampleHelp(true, s, displayPlural, false);
          return;
        }
        if (joiner) joiner.style.display = '';
        if (segP) segP.style.display = '';
        segS.textContent = s;
        if (segP) segP.textContent = displayPlural;
        const phraseDisplayWord = singularIfUnspecified ? s : displayPlural;
        if (appBar) appBar.textContent = phraseDisplayWord;
        syncGrammarExampleHelp(false, s, displayPlural, singularIfUnspecified);
      };

      const wireShoppingItemDisplayTitleSegments = () => {
        const segS = document.getElementById('childEditorTitleSingularSeg');
        const segP = document.getElementById('childEditorTitlePluralSeg');
        const sin = document.getElementById('shoppingItemSingularInput');
        const pl = document.getElementById('shoppingItemPluralOverrideInput');
        const focusSingular = (e) => {
          try {
            if (e) e.preventDefault();
          } catch (_) {}
          try {
            sin?.focus();
          } catch (_) {}
        };
        const focusPlural = (e) => {
          try {
            if (e) e.preventDefault();
          } catch (_) {}
          try {
            pl?.focus();
          } catch (_) {}
        };
        if (segS) {
          segS.addEventListener('click', focusSingular);
          segS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') focusSingular(e);
          });
        }
        if (segP) {
          segP.addEventListener('click', focusPlural);
          segP.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') focusPlural(e);
          });
        }
      };

      const getShoppingItemAutoPlural = (singularTrimmed) => {
        const s = String(singularTrimmed || '').trim();
        if (!s) return '';
        if (typeof window.pluralizeEnglishNoun === 'function') {
          return String(window.pluralizeEnglishNoun(s, '') || '').trim();
        }
        return `${s}s`;
      };

      const pluralFormsMatchForShoppingItem = (a, b) => {
        const x = String(a || '')
          .trim()
          .toLowerCase();
        const y = String(b || '')
          .trim()
          .toLowerCase();
        if (!x && !y) return true;
        return x === y;
      };

      const syncShoppingItemPluralLockUi = () => {
        const massEl = document.getElementById('shoppingItemIsMassNounToggle');
        if (massEl && massEl.checked) {
          try {
            syncShoppingItemPageTitleDisplay();
          } catch (_) {}
          return;
        }

        const sin = document.getElementById('shoppingItemSingularInput');
        const plIn = document.getElementById('shoppingItemPluralOverrideInput');
        const useOvEl = document.getElementById(
          'shoppingItemUsePluralOverrideToggle',
        );
        if (!sin || !plIn || !useOvEl) return;

        const s = String(sin.value || '').trim();
        const autoPl = getShoppingItemAutoPlural(s);
        const engaged = !!useOvEl.checked;
        if (!engaged) {
          plIn.value = autoPl;
          plIn.readOnly = true;
          plIn.classList.add('shopping-item-input--plural-locked');
        } else {
          plIn.readOnly = false;
          plIn.classList.remove('shopping-item-input--plural-locked');
        }
        try {
          syncShoppingItemPageTitleDisplay();
        } catch (_) {}
      };

      const snapshotShoppingItemPluralEscBaseline = () => {
        const ov = document.getElementById(
          'shoppingItemUsePluralOverrideToggle',
        );
        const pl = document.getElementById('shoppingItemPluralOverrideInput');
        pluralEscBaselineUse = ov?.checked ? '1' : '0';
        pluralEscBaselineText =
          pluralEscBaselineUse === '1' ? String(pl?.value || '').trim() : '';
      };

      const wireShoppingItemPluralLockBehavior = () => {
        const plIn = document.getElementById('shoppingItemPluralOverrideInput');
        if (!plIn) return;

        plIn.addEventListener('focusin', () => {
          const massEl = document.getElementById(
            'shoppingItemIsMassNounToggle',
          );
          if (massEl && massEl.checked) return;
          const useOvEl = document.getElementById(
            'shoppingItemUsePluralOverrideToggle',
          );
          if (!useOvEl || useOvEl.checked) return;
          useOvEl.checked = true;
          useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          requestAnimationFrame(() => {
            try {
              const len = plIn.value.length;
              plIn.setSelectionRange(len, len);
            } catch (_) {}
          });
        });

        plIn.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          const massEl = document.getElementById(
            'shoppingItemIsMassNounToggle',
          );
          if (massEl && massEl.checked) return;
          const useOvEl = document.getElementById(
            'shoppingItemUsePluralOverrideToggle',
          );
          if (!useOvEl) return;

          if (pluralEscBaselineUse !== '1') {
            if (!useOvEl.checked) return;
            e.preventDefault();
            useOvEl.checked = false;
            useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
            requestAnimationFrame(() => {
              try {
                plIn.blur();
              } catch (_) {}
            });
            return;
          }

          e.preventDefault();
          useOvEl.checked = true;
          plIn.value = pluralEscBaselineText;
          useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          try {
            syncShoppingItemPluralLockUi();
          } catch (_) {}
          requestAnimationFrame(() => {
            try {
              plIn.blur();
            } catch (_) {}
          });
        });

        plIn.addEventListener('blur', () => {
          const massEl = document.getElementById(
            'shoppingItemIsMassNounToggle',
          );
          if (massEl && massEl.checked) return;
          const useOvEl = document.getElementById(
            'shoppingItemUsePluralOverrideToggle',
          );
          const sin = document.getElementById('shoppingItemSingularInput');
          if (!useOvEl || !useOvEl.checked || !sin) return;
          const autoPl = getShoppingItemAutoPlural(sin.value || '');
          if (pluralFormsMatchForShoppingItem(plIn.value || '', autoPl)) {
            useOvEl.checked = false;
            useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      };

      const setShoppingItemDetailVisible = (elOrId, ok) => {
        const el =
          typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        el.style.display = ok ? '' : 'none';
      };

      const applyShoppingItemDetailFromDataService = (detail) => {
        if (!detail || typeof detail !== 'object') return false;
        baselineHome = normalizeShoppingHomeLocationId(
          detail.homeLocation || 'none',
        );
        baselineVariantRows = normalizeIngredientVariantRows(
          Array.isArray(detail.variantRows) ? detail.variantRows : [],
          { fallbackBaseHome: baselineHome },
        );
        baselineVariants = getNamedVariantRowsFromDraft(baselineVariantRows)
          .map((row) => row.value)
          .join('\n');
        baselineSizes = String(detail.sizesText || '');
        baselineSynonyms = String(detail.synonymsText || '');
        baselineIsFood = detail.isFood === false ? '0' : '1';
        baselineIsDeprecated = detail.isRemoved ? '1' : '0';
        baselineIsHidden = detail.isHidden ? '1' : '0';
        baselinePluralOverride = String(detail.pluralOverride || '');
        if (typeof detail.usePluralOverride === 'boolean') {
          baselineUsePluralOverride = detail.usePluralOverride ? '1' : '0';
        } else {
          baselineUsePluralOverride = String(detail.pluralOverride || '').trim()
            ? '1'
            : '0';
        }
        baselineSingularIfUnspecified = detail.singularIfUnspecified
          ? '1'
          : '0';
        baselineIsMassNoun = detail.isMassNoun ? '1' : '0';
        baselineUseMetric = detail.useMetric ? '1' : '0';

        const visibility =
          detail.visibility && typeof detail.visibility === 'object'
            ? detail.visibility
            : {};
        const showPluralOverride = visibility.showPluralOverride !== false;
        const showSingularIfUnspecified =
          visibility.showSingularIfUnspecified !== false;
        const showIsMassNoun = visibility.showIsMassNoun !== false;
        grammarVisibilitySingularIfUnspecified = showSingularIfUnspecified;
        const showAnyOverrides =
          visibility.showAnyOverrides !== false &&
          (showPluralOverride || showSingularIfUnspecified || showIsMassNoun);
        setShoppingItemDetailVisible(
          'shoppingItemOverridesCard',
          showAnyOverrides,
        );
        setShoppingItemDetailVisible(
          'shoppingItemLanguageDetails',
          showAnyOverrides,
        );
        setShoppingItemDetailVisible(
          'shoppingItemPluralOverrideField',
          showPluralOverride,
        );
        setShoppingItemDetailVisible(
          'shoppingItemUsePluralOverrideRow',
          showPluralOverride,
        );
        setShoppingItemDetailVisible(
          'shoppingItemSingularIfUnspecifiedBlock',
          showSingularIfUnspecified && !detail.isMassNoun,
        );
        setShoppingItemDetailVisible(
          'shoppingItemIsMassNounBlock',
          showIsMassNoun,
        );
        setShoppingItemDetailVisible(
          'shoppingItemIsHiddenRow',
          visibility.showHiddenToggle !== false,
        );
        return true;
      };

      const getShoppingPageHref = () => 'shopping.html';

      const loadShoppingItemDetailFromDataService = async () => {
        const idStr = sessionStorage.getItem('selectedShoppingItemId');
        const id = Number(idStr);
        if (
          !Number.isFinite(id) ||
          id <= 0 ||
          !window.dataService ||
          typeof window.dataService.loadShoppingItemDetail !== 'function'
        ) {
          return false;
        }
        if (favoriteEatsShouldUseSupabaseDataDoor()) {
          window.dataService.useSupabase = true;
          console.info('[dataService] using Supabase adapter');
        }
        const detail = await window.dataService.loadShoppingItemDetail({
          ingredientId: id,
          itemName: storedName,
        });
        return applyShoppingItemDetailFromDataService(detail);
      };

      let loadedViaDataService = false;

      try {
        if (!isNew && favoriteEatsShouldUseSupabaseDataDoor()) {
          try {
            loadedViaDataService =
              await loadShoppingItemDetailFromDataService();
          } catch (err) {
            favoriteEatsReportSupabasePrefetchFailure(
              'loadShoppingItemDetail',
              err,
            );
            fePageLoadFoodIconFail();
            return;
          }
        }

        if (!loadedViaDataService) {
          if (window.dataService) {
            window.dataService.useSupabase = true;
          }
          grammarVisibilitySingularIfUnspecified = true;
          setShoppingItemDetailVisible('shoppingItemOverridesCard', true);
          setShoppingItemDetailVisible('shoppingItemLanguageDetails', true);
          setShoppingItemDetailVisible('shoppingItemPluralOverrideField', true);
          setShoppingItemDetailVisible(
            'shoppingItemUsePluralOverrideRow',
            true,
          );
          setShoppingItemDetailVisible(
            'shoppingItemSingularIfUnspecifiedBlock',
            true,
          );
          setShoppingItemDetailVisible('shoppingItemIsMassNounBlock', true);
          setShoppingItemDetailVisible('shoppingItemIsHiddenRow', true);
        }
      } catch (_) {}

      if (!loadedViaDataService) {
        try {
          loadedViaDataService = await loadShoppingItemDetailFromDataService();
        } catch (err) {
          console.error('dataService.loadShoppingItemDetail failed:', err);
          if (favoriteEatsDataServiceIsSupabaseActive()) {
            fePageLoadFoodIconFail();
            return;
          }
        }
      }

      const pageCtl = wireChildEditorPage({
        backBtn: document.getElementById('appBarBackBtn'),
        cancelBtn: document.getElementById('appBarCancelBtn'),
        saveBtn: document.getElementById('appBarSaveBtn'),
        appBarTitleEl: document.getElementById('appBarTitle'),
        bodyTitleEl: document.getElementById('shoppingItemSingularInput'),
        initialTitle: titleText,
        backHref: getShoppingPageHref(),
        extraFields: [
          {
            key: 'variant_rows',
            el: document.getElementById('shoppingItemVariantRowsHiddenInput'),
            initialValue: serializeIngredientVariantRows(baselineVariantRows, {
              fallbackBaseHome: baselineHome,
            }),
            getValue: () =>
              serializeIngredientVariantRows(
                getVariantRowsDraftWithMergedActiveTagDraft(),
              ),
            setValue: (value) => {
              setVariantRowsFromSerialized(value);
            },
          },
          {
            key: 'synonyms',
            el: document.getElementById('shoppingItemSynonymsTextarea'),
            initialValue: baselineSynonyms,
          },
          {
            key: 'sizes',
            el: document.getElementById('shoppingItemSizesTextarea'),
            initialValue: baselineSizes,
          },
          {
            key: 'plural_override',
            el: document.getElementById('shoppingItemPluralOverrideInput'),
            initialValue: baselinePluralOverride,
          },
          {
            key: 'use_plural_override',
            el: document.getElementById('shoppingItemUsePluralOverrideToggle'),
            initialValue: baselineUsePluralOverride === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemUsePluralOverrideToggle')
                ?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemUsePluralOverrideToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'singular_if_unspecified',
            el: document.getElementById(
              'shoppingItemSingularIfUnspecifiedToggle',
            ),
            initialValue: baselineSingularIfUnspecified === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemSingularIfUnspecifiedToggle')
                ?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemSingularIfUnspecifiedToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_mass_noun',
            el: document.getElementById('shoppingItemIsMassNounToggle'),
            initialValue: baselineIsMassNoun === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsMassNounToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemIsMassNounToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'use_metric',
            el: document.getElementById('shoppingItemUseMetricToggle'),
            initialValue: baselineUseMetric === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemUseMetricToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('shoppingItemUseMetricToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_food',
            el: document.getElementById('shoppingItemIsNotFoodToggle'),
            initialValue: baselineIsFood === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsNotFoodToggle')?.checked
                ? '0'
                : '1',
            setValue: (v) => {
              const el = document.getElementById('shoppingItemIsNotFoodToggle');
              if (el) el.checked = String(v) !== '1';
            },
          },
          {
            key: 'is_deprecated',
            el: document.getElementById('shoppingItemIsDeprecatedToggle'),
            initialValue: baselineIsDeprecated === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsDeprecatedToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'shoppingItemIsDeprecatedToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_hidden',
            el: document.getElementById('shoppingItemIsHiddenToggle'),
            initialValue: baselineIsHidden === '1' ? '1' : '0',
            getValue: () =>
              document.getElementById('shoppingItemIsHiddenToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('shoppingItemIsHiddenToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
        ],
        onSave: (args) =>
          persistShoppingItem({
            ...args,
            baselineVariantRowsForMigration: baselineVariantRows,
          }),
        extraDirtyState: {
          isDirty: () => {
            const draftText = String(activeVariantTagEditorState?.draft || '');
            if (draftText.trim().length > 0) return true;
            return (
              getVariantRowsSignature(variantRowsDraft) !==
              variantRowsBaselineSignature
            );
          },
          onCancel: () => {
            requestAnimationFrame(() => {
              try {
                syncShoppingItemGrammarUi();
              } catch (_) {}
            });
          },
          onAfterSaveSuccess: () => {
            commitActiveVariantTagDraft({ clear: true, emit: false });
            try {
              renderVariantRows();
            } catch (_) {}
            try {
              commitVariantRowsBaseline();
            } catch (_) {}
            try {
              syncShoppingItemGrammarUi();
            } catch (_) {}
            try {
              snapshotShoppingItemPluralEscBaseline();
            } catch (_) {}
          },
        },
      });
      refreshVariantEditorDirty =
        (pageCtl && pageCtl.refreshDirty) ||
        (() => {
          /* noop */
        });
      commitVariantRowsBaseline = () => {
        ensureBaseVariantRowPresent();
        const baseHome = normalizeShoppingHomeLocationId(
          variantRowsDraft[0]?.homeLocation || 'none',
        );
        baselineVariantRows = normalizeIngredientVariantRows(
          variantRowsDraft.map((row) => ({ ...row })),
          { fallbackBaseHome: baseHome },
        );
        // Baseline must reflect draft *after* render: ensureBaseVariantRowPresent
        // can normalize rows and would leave an eager snapshot falsely "dirty".
        variantRowsBaselineSignature =
          getVariantRowsSignature(variantRowsDraft);
        try {
          syncVariantHiddenInput({ emit: false });
        } catch (_) {}
        try {
          pageCtl?.updateExtraBaseline?.(
            'variant_rows',
            serializeIngredientVariantRows(variantRowsDraft, {
              fallbackBaseHome: baseHome,
            }),
          );
        } catch (_) {}
        try {
          refreshVariantEditorDirty();
        } catch (_) {}
      };
      variantRowsBaselineSignature = getVariantRowsSignature(variantRowsDraft);
      try {
        refreshVariantEditorDirty();
      } catch (_) {}

      try {
        wireShoppingItemDisplayTitleSegments();
      } catch (_) {}

      try {
        wireShoppingItemPluralLockBehavior();
      } catch (_) {}

      const massToggle = document.getElementById(
        'shoppingItemIsMassNounToggle',
      );
      if (massToggle) {
        massToggle.addEventListener('change', () => {
          try {
            syncShoppingItemGrammarUi();
          } catch (_) {}
        });
      }
      const singularForTitleSync = document.getElementById(
        'shoppingItemSingularInput',
      );
      if (singularForTitleSync) {
        singularForTitleSync.addEventListener('input', () => {
          try {
            syncShoppingItemPluralLockUi();
          } catch (_) {}
        });
      }
      const pluralForTitleSync = document.getElementById(
        'shoppingItemPluralOverrideInput',
      );
      if (pluralForTitleSync) {
        pluralForTitleSync.addEventListener('input', () => {
          try {
            syncShoppingItemPageTitleDisplay();
          } catch (_) {}
        });
      }
      const useOvForTitleSync = document.getElementById(
        'shoppingItemUsePluralOverrideToggle',
      );
      if (useOvForTitleSync) {
        useOvForTitleSync.addEventListener('change', () => {
          try {
            syncShoppingItemPluralLockUi();
          } catch (_) {}
        });
      }
      const singularIfUnspecForTitleSync = document.getElementById(
        'shoppingItemSingularIfUnspecifiedToggle',
      );
      if (singularIfUnspecForTitleSync) {
        singularIfUnspecForTitleSync.addEventListener('change', () => {
          try {
            syncShoppingItemPageTitleDisplay();
          } catch (_) {}
        });
      }
      try {
        syncShoppingItemGrammarUi();
      } catch (_) {}
      try {
        snapshotShoppingItemPluralEscBaseline();
      } catch (_) {}
      fePageLoadFoodIconFinish();
    });
  } else {
    fePageLoadFoodIconFail();
  }
}

async function loadUnitlessItemsPage() {
  fePageLoadFoodIconBegin('unitless-items');
  const view = document.getElementById('pageContent');

  if (!view) {
    fePageLoadFoodIconFail();
    return;
  }

  initAppBar({ mode: 'editor', titleText: 'Unitless Items' });

  const normalizePolicy = (policy) => {
    const source = policy && typeof policy === 'object' ? policy : {};
    const rawStep = Number(source.quantityRoundingStepDenominator);
    return {
      useSystemDefault: source.useSystemDefault !== false,
      quantityRoundingStepDenominator: [1, 2, 3, 4, 8, 12].includes(rawStep)
        ? rawStep
        : 8,
    };
  };

  let policy = normalizePolicy(null);
  if (
    window.dataService &&
    typeof window.dataService.loadUnitlessQuantityPolicy === 'function'
  ) {
    try {
      window.dataService.useSupabase = true;
      policy = normalizePolicy(await window.dataService.loadUnitlessQuantityPolicy());
    } catch (err) {
      console.error('dataService.loadUnitlessQuantityPolicy failed:', err);
      uiToast('Failed to load unitless item settings.');
    }
  }

  const effStepForUi = String(policy.quantityRoundingStepDenominator || 8);
  const stepWhole = effStepForUi === '1' ? 'selected' : '';
  const stepHalf = effStepForUi === '2' ? 'selected' : '';
  const stepThird = effStepForUi === '3' ? 'selected' : '';
  const stepQuarter = effStepForUi === '4' ? 'selected' : '';
  const stepEighth = effStepForUi === '8' ? 'selected' : '';
  const stepKitchen = effStepForUi === '12' ? 'selected' : '';
  const initialSystemDefault = policy.useSystemDefault !== false;

  view.innerHTML = `
    <h1 id="unitlessItemsBodyTitle" class="recipe-title">Unitless Items</h1>
    <input id="unitlessItemsTitleHidden" type="hidden" value="Unitless Items" />
    <div class="unit-editor-card-section-heading">Quantity display</div>
    <div
      id="unitRoundingCard"
      class="shopping-item-editor-card"
      aria-label="Quantity display"
    >
      <div class="unit-rounding-display-stack">
        <div
          id="unitRoundingFractionDetails"
          class="shopping-item-grammar-layout"
        >
          <div class="shopping-item-field" style="width: 100%;">
            <div class="shopping-item-label">Base fraction(s)</div>
            <div
              id="unitRoundingStepLockedLabel"
              class="shopping-item-input shopping-item-input--plural-locked"
              style="display: none;"
            >
              System default
            </div>
            <select
              id="unitRoundingStepSelect"
              class="shopping-item-input shopping-item-input--menu-picker"
            >
              <option value="1" ${stepWhole}>Whole number</option>
              <option value="2" ${stepHalf}>½</option>
              <option value="3" ${stepThird}>⅓</option>
              <option value="4" ${stepQuarter}>¼</option>
              <option value="8" ${stepEighth}>⅛</option>
              <option value="12" ${stepKitchen}>¼ &amp; ⅓</option>
            </select>
          </div>
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input
                id="unitRoundingUseSystemDefaultToggle"
                type="checkbox"
                ${initialSystemDefault ? 'checked' : ''}
              />
              <span>Use system default</span>
            </label>
          </div>
        </div>
        <div id="unitRoundingExampleTotals" class="unit-rounding-preview">
          <div class="shopping-item-label">Display preview</div>
          <div class="unit-rounding-chart" id="unitRoundingChart">
            <div class="unit-rounding-chart-head">
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--amount">Amount</span>
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--recipe">Recipe</span>
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--shopping">Shopping</span>
            </div>
            <div class="unit-rounding-chart-body" id="unitRoundingChartBody"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const syncUnitlessRoundingUi = () => {
    const toggle = document.getElementById(
      'unitRoundingUseSystemDefaultToggle',
    );
    const stepEl = document.getElementById('unitRoundingStepSelect');
    const locked = document.getElementById('unitRoundingStepLockedLabel');
    if (!stepEl || !locked) return;
    const systemOn = !!toggle?.checked;
    locked.style.display = systemOn ? '' : 'none';
    stepEl.style.display = systemOn ? 'none' : '';
    stepEl.disabled = systemOn;
  };

  const escapeUnitRoundingPreviewText = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const syncUnitlessRoundingExampleTotals = () => {
    const host = document.getElementById('unitRoundingChartBody');
    const stepEl = document.getElementById('unitRoundingStepSelect');
    const toggle = document.getElementById(
      'unitRoundingUseSystemDefaultToggle',
    );
    const policyApi = window.favoriteEatsQuantityDisplayPolicy;
    if (!host || !stepEl || !policyApi?.buildUnitEditorDisplayPreviewChart) return;
    const step = toggle?.checked ? 2 : Number(stepEl.value) || 2;
    const chart = policyApi.buildUnitEditorDisplayPreviewChart({
      stepDenominator: step,
    });
    const rows = Array.isArray(chart?.rows) ? chart.rows : [];
    host.innerHTML = rows
      .map((row) => {
        const amount = escapeUnitRoundingPreviewText(row.amount);
        const recipe = escapeUnitRoundingPreviewText(row.recipe);
        const shopping = escapeUnitRoundingPreviewText(row.shopping);
        return (
          '<div class="unit-rounding-chart-row">' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--amount unit-rounding-chart-cell--value">' +
          amount +
          '</span>' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--recipe unit-rounding-chart-cell--value">' +
          recipe +
          '</span>' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--shopping unit-rounding-chart-cell--value">' +
          shopping +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  };

  syncUnitlessRoundingUi();
  syncUnitlessRoundingExampleTotals();

  if (typeof waitForAppBarReady === 'function') {
    waitForAppBarReady().then(() => {
      const backHref =
        sessionStorage.getItem('favoriteEatsUnitlessItemsBackHref') ||
        'recipes.html';
      const unitlessCtl = wireChildEditorPage({
        backBtn: document.getElementById('appBarBackBtn'),
        cancelBtn: document.getElementById('appBarCancelBtn'),
        saveBtn: document.getElementById('appBarSaveBtn'),
        appBarTitleEl: document.getElementById('appBarTitle'),
        bodyTitleEl: document.getElementById('unitlessItemsTitleHidden'),
        initialTitle: 'Unitless Items',
        backHref,
        normalizeTitle: () => 'Unitless Items',
        displayTitle: () => 'Unitless Items',
        extraFields: [
          {
            key: 'use_system_default',
            el: document.getElementById('unitRoundingUseSystemDefaultToggle'),
            initialValue: initialSystemDefault ? '1' : '0',
            getValue: () =>
              document.getElementById('unitRoundingUseSystemDefaultToggle')
                ?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById(
                'unitRoundingUseSystemDefaultToggle',
              );
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'quantity_rounding_step_denominator',
            el: document.getElementById('unitRoundingStepSelect'),
            initialValue: effStepForUi,
            getValue: () =>
              String(
                document.getElementById('unitRoundingStepSelect')?.value || '8',
              ),
            setValue: (v) => {
              const el = document.getElementById('unitRoundingStepSelect');
              if (el) el.value = String(v || '8');
            },
          },
        ],
        extraDirtyState: {
          onCancel: () => {
            requestAnimationFrame(() => {
              syncUnitlessRoundingUi();
              syncUnitlessRoundingExampleTotals();
            });
          },
        },
        onSave: async ({ extraValues }) => {
          if (
            !window.dataService ||
            typeof window.dataService.saveUnitlessQuantityPolicy !== 'function'
          ) {
            uiToast('Cannot save unitless item settings: data service is required.');
            throw new Error('unitless quantity policy save unavailable');
          }
          const stepDenom = Number(
            extraValues?.quantity_rounding_step_denominator || '8',
          );
          if (![1, 2, 3, 4, 8, 12].includes(stepDenom)) {
            uiToast('Choose a valid option in Base fractions.');
            throw new Error('bad unitless rounding step');
          }
          window.dataService.useSupabase = true;
          const saved = await window.dataService.saveUnitlessQuantityPolicy({
            useSystemDefault: extraValues?.use_system_default === '1',
            quantityRoundingStepDenominator: stepDenom,
          });
          try {
            window.dispatchEvent(new Event('favoriteEats:db-updated'));
          } catch (_) {}
          policy = normalizePolicy(saved);
        },
      });

      const toggle = document.getElementById(
        'unitRoundingUseSystemDefaultToggle',
      );
      if (toggle) {
        toggle.addEventListener('change', () => {
          syncUnitlessRoundingUi();
          syncUnitlessRoundingExampleTotals();
          unitlessCtl?.markDirtyFromUserEdit?.();
        });
      }
      const stepEl = document.getElementById('unitRoundingStepSelect');
      if (stepEl) {
        stepEl.addEventListener('change', () => {
          syncUnitlessRoundingExampleTotals();
          unitlessCtl?.markDirtyFromUserEdit?.();
        });
      }

      syncUnitlessRoundingUi();
      syncUnitlessRoundingExampleTotals();
      fePageLoadFoodIconFinish();
    });
  } else {
    fePageLoadFoodIconFail();
  }
}

function loadUnitEditorPage() {
  fePageLoadFoodIconBegin('unit-editor');
  const view = document.getElementById('pageContent');

  if (!view) {
    fePageLoadFoodIconFail();
    return;
  }

  const getUnitAutoPlural = (singular) => {
    const s = String(singular || '').trim();
    if (!s) return '';
    if (typeof window.pluralizeEnglishNoun === 'function') {
      return String(window.pluralizeEnglishNoun(s, '') || '').trim();
    }
    return `${s}s`;
  };

  const unitPluralFormsMatch = (a, b) => {
    const x = String(a || '')
      .trim()
      .toLowerCase();
    const y = String(b || '')
      .trim()
      .toLowerCase();
    if (!x && !y) return true;
    return x === y;
  };

  const UNIT_FIXED_ROUNDING_PRESET_SET = new Set([
    'nearest_eighth',
    'nearest_quarter',
    'nearest_half',
    'nearest_whole',
    'system_measured',
  ]);
  const unitFixedRoundingStepDenom = (preset) => {
    switch (String(preset || '').trim()) {
      case 'nearest_eighth':
        return 8;
      case 'nearest_quarter':
        return 4;
      case 'nearest_half':
        return 2;
      case 'nearest_whole':
        return 1;
      default:
        return null;
    }
  };
  const normalizeInitialRoundingPreset = (raw) => {
    const p = String(raw || '')
      .trim()
      .toLowerCase();
    if (p === 'custom') return 'custom';
    if (p === 'system_measured') return 'system_measured';
    if (UNIT_FIXED_ROUNDING_PRESET_SET.has(p)) return p;
    return 'nearest_eighth';
  };

  const isNew = sessionStorage.getItem('selectedUnitIsNew') === '1';
  const storedName = sessionStorage.getItem('selectedUnitNameSingular') || '';
  const code = sessionStorage.getItem('selectedUnitCode') || '';
  const initialHidden = sessionStorage.getItem('selectedUnitIsHidden') === '1';
  const initialRemoved =
    sessionStorage.getItem('selectedUnitIsRemoved') === '1';
  const initialUsePluralOverride =
    sessionStorage.getItem('selectedUnitUsePluralOverride') === '1';
  const storedPluralOverride =
    sessionStorage.getItem('selectedUnitPluralOverride') || '';
  const initialRoundingPreset = normalizeInitialRoundingPreset(
    sessionStorage.getItem('selectedUnitQuantityRoundingPreset') ||
      'nearest_eighth',
  );
  const initialRoundingStep =
    sessionStorage.getItem('selectedUnitQuantityRoundingStepDenom') || '8';
  const initialRoundingMode =
    sessionStorage.getItem('selectedUnitQuantityRoundingMode') || 'nearest';

  const unitCategory = String(
    sessionStorage.getItem('selectedUnitCategory') || '',
  )
    .trim()
    .toLowerCase();
  const isMeasuredCategory =
    unitCategory === 'mass' || unitCategory === 'volume';
  const initialSystemMeasured =
    initialRoundingPreset === 'system_measured' ||
    (isMeasuredCategory && initialRoundingPreset !== 'custom');

  const initialPluralField = initialUsePluralOverride
    ? storedPluralOverride || getUnitAutoPlural(storedName)
    : getUnitAutoPlural(storedName);

  const normAbbrevCompare = (x) =>
    String(x || '')
      .trim()
      .toLowerCase();
  const abbrevIsDistinct =
    !!String(code || '').trim() &&
    normAbbrevCompare(code) !== normAbbrevCompare(storedName);
  const abbrevFirstPaint = abbrevIsDistinct
    ? normAbbrevCompare(code)
    : 'Add an abbreviation.';
  const abbrevLineClass =
    'unit-abbreviation-line' + (abbrevIsDistinct ? '' : ' placeholder-prompt');

  const titleDisplay = storedName || (isNew ? 'New unit' : 'Unit');
  const initialTitle =
    (storedName || '').trim() || (isNew ? 'new unit' : 'unit');

  initAppBar({ mode: 'editor', titleText: titleDisplay });

  const impliedStepAtInit =
    initialRoundingPreset === 'system_measured'
      ? null
      : unitFixedRoundingStepDenom(initialRoundingPreset);
  const rawStepForUi =
    initialRoundingPreset === 'custom'
      ? initialRoundingStep || '8'
      : initialSystemMeasured && isMeasuredCategory
        ? '8'
        : initialSystemMeasured && !isMeasuredCategory
          ? '1'
          : String(impliedStepAtInit ?? '8');
  const effStepForUi = ['1', '2', '3', '4', '8', '12'].includes(rawStepForUi)
    ? rawStepForUi
    : '8';
  const stepWhole = effStepForUi === '1' ? 'selected' : '';
  const stepHalf = effStepForUi === '2' ? 'selected' : '';
  const stepThird = effStepForUi === '3' ? 'selected' : '';
  const stepQuarter = effStepForUi === '4' ? 'selected' : '';
  const stepEighth = effStepForUi === '8' ? 'selected' : '';
  const stepKitchen = effStepForUi === '12' ? 'selected' : '';

  view.innerHTML = `
    <h1
      id="childEditorTitle"
      class="recipe-title shopping-item-display-title"
      aria-label="Unit names"
    >
      <span
        id="childEditorTitleSingularSeg"
        class="shopping-item-title-seg"
        role="button"
        tabindex="0"
        aria-label="Singular — click to edit"
      ></span><span
        id="childEditorTitleJoiner"
        class="shopping-item-title-joiner"
        aria-hidden="true"
      >/</span><span
        id="childEditorTitlePluralSeg"
        class="shopping-item-title-seg"
        role="button"
        tabindex="0"
        aria-label="Plural — click to edit"
      ></span>
    </h1>
    <div id="unitAbbreviation" class="${abbrevLineClass}">${abbrevFirstPaint}</div>

    <div class="unit-editor-card-section-heading">Pluralization</div>
    <div
      id="unitPluralizationCard"
      class="shopping-item-editor-card"
      aria-label="Pluralization"
    >
      <div
        id="unitPluralizationDetails"
        class="shopping-item-grammar-layout"
      >
        <div class="shopping-item-field" style="width: 100%;">
          <div class="shopping-item-label">Singular</div>
          <input
            id="unitSingularInput"
            class="shopping-item-input"
            type="text"
            autocomplete="off"
            spellcheck="true"
            value=""
          />
        </div>
        <div class="shopping-item-field" style="width: 100%;">
          <div class="shopping-item-label">Plural</div>
          <input
            id="unitPluralInput"
            class="shopping-item-input"
            type="text"
            placeholder="e.g. leaves, teaspoons"
          />
        </div>
        <div class="shopping-item-status-row">
          <label class="shopping-item-toggle">
            <input id="unitUsePluralOverrideToggle" type="checkbox" ${
              initialUsePluralOverride ? 'checked' : ''
            } />
            <span>Use override</span>
          </label>
        </div>
        <div class="shopping-item-status">
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input id="unitIsHiddenToggle" type="checkbox" ${
                initialHidden ? 'checked' : ''
              } />
              <span>Hidden</span>
            </label>
          </div>
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input id="unitIsRemovedToggle" type="checkbox" ${
                initialRemoved ? 'checked' : ''
              } />
              <span>Removed</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="unit-editor-card-section-heading">Quantity display</div>
    <div
      id="unitRoundingCard"
      class="shopping-item-editor-card"
      aria-label="Quantity display"
    >
      <input type="hidden" id="unitRoundingPresetHidden" value="" />
      <input type="hidden" id="unitRoundingModeHidden" value="nearest" />
      <div class="unit-rounding-display-stack">
        <div
          id="unitRoundingFractionDetails"
          class="shopping-item-grammar-layout"
        >
          <div class="shopping-item-field" style="width: 100%;">
            <div class="shopping-item-label">Base fraction(s)</div>
          <div
            id="unitRoundingStepLockedLabel"
            class="shopping-item-input shopping-item-input--plural-locked"
            style="display: none;"
          >
            System default
          </div>
            <select
              id="unitRoundingStepSelect"
              class="shopping-item-input shopping-item-input--menu-picker"
            >
              <option value="1" ${stepWhole}>Whole number</option>
              <option value="2" ${stepHalf}>½</option>
              <option value="3" ${stepThird}>⅓</option>
              <option value="4" ${stepQuarter}>¼</option>
              <option value="8" ${stepEighth}>⅛</option>
              <option value="12" ${stepKitchen}>¼ &amp; ⅓</option>
            </select>
          </div>
          <div class="shopping-item-status-row">
            <label class="shopping-item-toggle">
              <input
                id="unitRoundingUseSystemDefaultToggle"
                type="checkbox"
                ${initialSystemMeasured ? 'checked' : ''}
              />
              <span>Use system default</span>
            </label>
          </div>
        </div>
        <div id="unitRoundingExampleTotals" class="unit-rounding-preview">
          <div class="shopping-item-label">Display preview</div>
          <div class="unit-rounding-chart" id="unitRoundingChart">
            <div class="unit-rounding-chart-head">
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--amount">Amount</span>
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--recipe">Recipe</span>
              <span class="unit-rounding-chart-cell unit-rounding-chart-cell--shopping">Shopping</span>
            </div>
            <div class="unit-rounding-chart-body" id="unitRoundingChartBody"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const singularInput = document.getElementById('unitSingularInput');
  if (singularInput) singularInput.value = storedName;
  const unitPluralInput = document.getElementById('unitPluralInput');
  if (unitPluralInput) unitPluralInput.value = initialPluralField;

  const presetHiddenEl = document.getElementById('unitRoundingPresetHidden');
  const modeHiddenEl = document.getElementById('unitRoundingModeHidden');
  if (presetHiddenEl) {
    presetHiddenEl.value = initialSystemMeasured
      ? 'system_measured'
      : 'custom';
  }
  if (modeHiddenEl) modeHiddenEl.value = 'nearest';

  const syncUnitRoundingPresetHidden = () => {
    const toggle = document.getElementById(
      'unitRoundingUseSystemDefaultToggle',
    );
    const hidden = document.getElementById('unitRoundingPresetHidden');
    if (!hidden) return;
    hidden.value = toggle?.checked ? 'system_measured' : 'custom';
  };

  const syncUnitRoundingMeasuredUi = () => {
    const toggle = document.getElementById(
      'unitRoundingUseSystemDefaultToggle',
    );
    const stepEl = document.getElementById('unitRoundingStepSelect');
    const locked = document.getElementById('unitRoundingStepLockedLabel');
    if (!stepEl || !locked) return;
    const systemOn = !!toggle?.checked;
    if (systemOn) {
      locked.textContent = isMeasuredCategory
        ? 'System default'
        : 'Whole number';
      locked.style.display = '';
      stepEl.style.display = 'none';
      stepEl.disabled = true;
    } else {
      locked.style.display = 'none';
      stepEl.style.display = '';
      stepEl.disabled = false;
    }
    syncUnitRoundingPresetHidden();
  };

  const escapeUnitRoundingPreviewText = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const syncUnitRoundingExampleTotals = () => {
    const previewCard = document.getElementById('unitRoundingExampleTotals');
    const host = document.getElementById('unitRoundingChartBody');
    const stepEl = document.getElementById('unitRoundingStepSelect');
    const policy = window.favoriteEatsQuantityDisplayPolicy;
    if (!host || !stepEl || !policy?.buildUnitEditorDisplayPreviewChart) return;
    const toggle = document.getElementById(
      'unitRoundingUseSystemDefaultToggle',
    );
    if (isMeasuredCategory && toggle?.checked) {
      if (host) host.innerHTML = '';
      if (previewCard) previewCard.style.display = 'none';
      return;
    }
    if (previewCard) previewCard.style.display = '';
    const step = toggle?.checked ? 1 : Number(stepEl.value) || 8;
    const chart = policy.buildUnitEditorDisplayPreviewChart({
      stepDenominator: step,
    });
    const rows = Array.isArray(chart?.rows) ? chart.rows : [];
    host.innerHTML = rows
      .map((row) => {
        const amount = escapeUnitRoundingPreviewText(row.amount);
        const recipe = escapeUnitRoundingPreviewText(row.recipe);
        const shopping = escapeUnitRoundingPreviewText(row.shopping);
        return (
          '<div class="unit-rounding-chart-row">' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--amount unit-rounding-chart-cell--value">' +
          amount +
          '</span>' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--recipe unit-rounding-chart-cell--value">' +
          recipe +
          '</span>' +
          '<span class="unit-rounding-chart-cell unit-rounding-chart-cell--shopping unit-rounding-chart-cell--value">' +
          shopping +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  };

  syncUnitRoundingMeasuredUi();
  syncUnitRoundingExampleTotals();

  if (typeof waitForAppBarReady === 'function') {
    waitForAppBarReady().then(() => {
      let unitPluralEscBaselineUse = '0';
      let unitPluralEscBaselineText = '';
      const snapshotUnitPluralEscBaseline = () => {
        const ov = document.getElementById('unitUsePluralOverrideToggle');
        const pl = document.getElementById('unitPluralInput');
        unitPluralEscBaselineUse = ov?.checked ? '1' : '0';
        unitPluralEscBaselineText =
          unitPluralEscBaselineUse === '1'
            ? String(pl?.value || '').trim()
            : '';
      };

      const syncUnitEditorTitleDisplay = () => {
        const sin = document.getElementById('unitSingularInput');
        const plIn = document.getElementById('unitPluralInput');
        const useOvEl = document.getElementById('unitUsePluralOverrideToggle');
        const segS = document.getElementById('childEditorTitleSingularSeg');
        const segP = document.getElementById('childEditorTitlePluralSeg');
        const joiner = document.getElementById('childEditorTitleJoiner');
        const appBar = document.getElementById('appBarTitle');
        if (!sin || !segS) return;
        const s = String(sin.value || '').trim();
        const useOv = !!(useOvEl && useOvEl.checked);
        const plRaw = String(plIn?.value || '').trim();
        const autoPl = getUnitAutoPlural(s);
        const displayPlural = useOv ? plRaw : autoPl;
        if (joiner) joiner.style.display = '';
        if (segP) segP.style.display = '';
        segS.textContent = s;
        if (segP) segP.textContent = displayPlural;
        if (appBar) appBar.textContent = s || titleDisplay;
      };

      const syncUnitPluralLockUi = () => {
        const sin = document.getElementById('unitSingularInput');
        const plIn = document.getElementById('unitPluralInput');
        const useOvEl = document.getElementById('unitUsePluralOverrideToggle');
        if (!sin || !plIn || !useOvEl) return;
        const s = String(sin.value || '').trim();
        const autoPl = getUnitAutoPlural(s);
        const engaged = !!useOvEl.checked;
        if (!engaged) {
          plIn.value = autoPl;
          plIn.readOnly = true;
          plIn.classList.add('shopping-item-input--plural-locked');
        } else {
          plIn.readOnly = false;
          plIn.classList.remove('shopping-item-input--plural-locked');
        }
        syncUnitEditorTitleDisplay();
      };

      const wireUnitPluralLockBehavior = () => {
        const plIn = document.getElementById('unitPluralInput');
        if (!plIn) return;

        plIn.addEventListener('focusin', () => {
          const useOvEl = document.getElementById(
            'unitUsePluralOverrideToggle',
          );
          if (!useOvEl || useOvEl.checked) return;
          useOvEl.checked = true;
          useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          requestAnimationFrame(() => {
            try {
              const len = plIn.value.length;
              plIn.setSelectionRange(len, len);
            } catch (_) {}
          });
        });

        plIn.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          const useOvEl = document.getElementById(
            'unitUsePluralOverrideToggle',
          );
          if (!useOvEl) return;

          if (unitPluralEscBaselineUse !== '1') {
            if (!useOvEl.checked) return;
            e.preventDefault();
            useOvEl.checked = false;
            useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
            requestAnimationFrame(() => {
              try {
                plIn.blur();
              } catch (_) {}
            });
            return;
          }

          e.preventDefault();
          useOvEl.checked = true;
          plIn.value = unitPluralEscBaselineText;
          useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          try {
            syncUnitPluralLockUi();
          } catch (_) {}
          requestAnimationFrame(() => {
            try {
              plIn.blur();
            } catch (_) {}
          });
        });

        plIn.addEventListener('blur', () => {
          const useOvEl = document.getElementById(
            'unitUsePluralOverrideToggle',
          );
          const sin = document.getElementById('unitSingularInput');
          if (!useOvEl || !useOvEl.checked || !sin) return;
          const autoPl = getUnitAutoPlural(sin.value || '');
          if (unitPluralFormsMatch(plIn.value || '', autoPl)) {
            useOvEl.checked = false;
            useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      };

      const wireUnitRoundingControls = (markDirtyFromEdit) => {
        const toggle = document.getElementById(
          'unitRoundingUseSystemDefaultToggle',
        );
        if (toggle) {
          toggle.addEventListener('change', () => {
            syncUnitRoundingMeasuredUi();
            syncUnitRoundingExampleTotals();
            markDirtyFromEdit?.();
          });
        }
        const stepEl = document.getElementById('unitRoundingStepSelect');
        if (stepEl) {
          stepEl.addEventListener('change', () => {
            syncUnitRoundingExampleTotals();
            markDirtyFromEdit?.();
          });
        }
        const sin = document.getElementById('unitSingularInput');
        const plIn = document.getElementById('unitPluralInput');
        if (sin) {
          sin.addEventListener('input', () => {
            syncUnitRoundingExampleTotals();
          });
        }
        if (plIn) {
          plIn.addEventListener('input', () => {
            syncUnitRoundingExampleTotals();
          });
        }
      };

      const wireUnitTitleSegments = () => {
        const segS = document.getElementById('childEditorTitleSingularSeg');
        const segP = document.getElementById('childEditorTitlePluralSeg');
        const sin = document.getElementById('unitSingularInput');
        const focusSingular = (e) => {
          try {
            if (e) e.preventDefault();
          } catch (_) {}
          try {
            sin?.focus();
          } catch (_) {}
        };
        const focusPlural = (e) => {
          try {
            if (e) e.preventDefault();
          } catch (_) {}
          const useOvEl = document.getElementById(
            'unitUsePluralOverrideToggle',
          );
          const plEl = document.getElementById('unitPluralInput');
          if (!plEl) return;
          if (useOvEl && !useOvEl.checked) {
            useOvEl.checked = true;
            useOvEl.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            try {
              syncUnitPluralLockUi();
            } catch (_) {}
          }
          requestAnimationFrame(() => {
            try {
              plEl.focus();
              const len = plEl.value.length;
              plEl.setSelectionRange(len, len);
            } catch (_) {}
          });
        };
        if (segS) {
          segS.addEventListener('click', focusSingular);
          segS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') focusSingular(e);
          });
        }
        if (segP) {
          segP.addEventListener('click', focusPlural);
          segP.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') focusPlural(e);
          });
        }
      };

      wireUnitTitleSegments();

      wireUnitPluralLockBehavior();

      const unitEditorCtl = wireChildEditorPage({
        backBtn: document.getElementById('appBarBackBtn'),
        cancelBtn: document.getElementById('appBarCancelBtn'),
        saveBtn: document.getElementById('appBarSaveBtn'),
        appBarTitleEl: document.getElementById('appBarTitle'),
        bodyTitleEl: document.getElementById('unitSingularInput'),
        initialTitle,
        backHref: 'units.html',
        normalizeTitle: (s) => (s || '').trim(),
        displayTitle: (s) => (s || '').trim(),
        subtitleEl: document.getElementById('unitAbbreviation'),
        initialSubtitle: code,
        normalizeSubtitle: (s) => (s || '').trim().toLowerCase(),
        subtitlePlaceholder: 'Add an abbreviation.',
        subtitlePlaceholderWhenEquivalentToTitle: true,
        extraFields: [
          {
            key: 'name_plural',
            el: document.getElementById('unitPluralInput'),
            initialValue: initialPluralField,
          },
          {
            key: 'use_plural_override',
            el: document.getElementById('unitUsePluralOverrideToggle'),
            initialValue: initialUsePluralOverride ? '1' : '0',
            getValue: () =>
              document.getElementById('unitUsePluralOverrideToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('unitUsePluralOverrideToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'quantity_rounding_preset',
            el: document.getElementById('unitRoundingPresetHidden'),
            initialValue: initialSystemMeasured
              ? 'system_measured'
              : 'custom',
            getValue: () =>
              String(
                document.getElementById('unitRoundingPresetHidden')?.value ||
                  'custom',
              ),
            setValue: (v) => {
              const el = document.getElementById('unitRoundingPresetHidden');
              if (el) el.value = String(v || 'custom');
            },
          },
          {
            key: 'quantity_rounding_step_denominator',
            el: document.getElementById('unitRoundingStepSelect'),
            initialValue: effStepForUi,
            getValue: () =>
              String(
                document.getElementById('unitRoundingStepSelect')?.value || '8',
              ),
            setValue: (v) => {
              const el = document.getElementById('unitRoundingStepSelect');
              if (el) el.value = String(v || '8');
            },
          },
          {
            key: 'quantity_rounding_mode',
            el: document.getElementById('unitRoundingModeHidden'),
            initialValue: 'nearest',
            getValue: () => 'nearest',
            setValue: () => {
              const el = document.getElementById('unitRoundingModeHidden');
              if (el) el.value = 'nearest';
            },
          },
          {
            key: 'is_hidden',
            el: document.getElementById('unitIsHiddenToggle'),
            initialValue: initialHidden ? '1' : '0',
            getValue: () =>
              document.getElementById('unitIsHiddenToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('unitIsHiddenToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
          {
            key: 'is_removed',
            el: document.getElementById('unitIsRemovedToggle'),
            initialValue: initialRemoved ? '1' : '0',
            getValue: () =>
              document.getElementById('unitIsRemovedToggle')?.checked
                ? '1'
                : '0',
            setValue: (v) => {
              const el = document.getElementById('unitIsRemovedToggle');
              if (el) el.checked = String(v) === '1';
            },
          },
        ],
        extraDirtyState: {
          onCancel: () => {
            requestAnimationFrame(() => {
              try {
                syncUnitPluralLockUi();
                syncUnitEditorTitleDisplay();
                syncUnitRoundingMeasuredUi();
                syncUnitRoundingExampleTotals();
                snapshotUnitPluralEscBaseline();
              } catch (_) {}
            });
          },
          onAfterSaveSuccess: () => {
            try {
              snapshotUnitPluralEscBaseline();
            } catch (_) {}
          },
        },
        onSave: async ({
          title: next,
          subtitle: nextCode,
          extraValues: ev,
        }) => {
          const oldCode = (sessionStorage.getItem('selectedUnitCode') || '')
            .trim()
            .toLowerCase();
          if (!oldCode && !isNew) return;

          const singularTrimmed = String(next || '').trim();
          const singularLower = singularTrimmed.toLowerCase();
          let newCode = (nextCode ?? '').trim().toLowerCase();
          if (!newCode || newCode === singularLower) {
            newCode = singularLower;
          }
          const pluralInputTrimmed = String(
            document.getElementById('unitPluralInput')?.value || '',
          ).trim();
          const usePluralOverride = ev?.use_plural_override === '1';
          const autoPlural = getUnitAutoPlural(singularTrimmed);
          const effectivePlural = usePluralOverride
            ? pluralInputTrimmed
            : autoPlural;
          const isHidden = document.getElementById('unitIsHiddenToggle')
            ?.checked
            ? 1
            : 0;
          const isRemoved = document.getElementById('unitIsRemovedToggle')
            ?.checked
            ? 1
            : 0;

          const presetRaw = String(ev?.quantity_rounding_preset || 'custom')
            .trim()
            .toLowerCase();
          const quantityRoundingPreset =
            presetRaw === 'system_measured' ? 'system_measured' : 'custom';
          const stepRaw = String(
            ev?.quantity_rounding_step_denominator || '8',
          ).trim();
          const modeRaw = 'nearest';
          let stepDenom = null;
          let quantityRoundingMode = null;
          if (quantityRoundingPreset === 'custom') {
            stepDenom = Number(stepRaw);
            quantityRoundingMode = modeRaw;
            if (
              !Number.isFinite(stepDenom) ||
              ![1, 2, 3, 4, 8, 12].includes(stepDenom)
            ) {
              uiToast('Choose a valid option in Base fractions.');
              throw new Error('bad rounding step');
            }
          }

          const canEditUnitThroughDataService =
            oldCode &&
            window.dataService &&
            typeof window.dataService.editUnit === 'function' &&
            typeof window.dataService.listUnits === 'function';
          if (canEditUnitThroughDataService) {
            window.dataService.useSupabase = true;
            const units = await window.dataService.listUnits();
            const hasDup = (Array.isArray(units) ? units : []).some((unit) => {
              const otherCode = String(unit?.code || '')
                .trim()
                .toLowerCase();
              return (
                otherCode && otherCode !== oldCode && otherCode === newCode
              );
            });
            if (hasDup) {
              uiToast('That abbreviation is already used by another unit.');
              throw new Error('Duplicate unit code');
            }
            await window.dataService.editUnit({
              oldCode,
              code: newCode,
              nameSingular: singularTrimmed,
              namePlural: effectivePlural || pluralInputTrimmed,
              usePluralOverride,
              pluralOverride: usePluralOverride ? pluralInputTrimmed : '',
              quantityRoundingPreset,
              quantityRoundingStepDenominator: stepDenom,
              quantityRoundingMode: quantityRoundingMode,
              isHidden: !!isHidden,
              isRemoved: !!isRemoved,
            });
            sessionStorage.setItem('selectedUnitCode', newCode);
            sessionStorage.setItem('selectedUnitNameSingular', singularTrimmed);
            sessionStorage.setItem(
              'selectedUnitNamePlural',
              effectivePlural || pluralInputTrimmed,
            );
            sessionStorage.setItem(
              'selectedUnitUsePluralOverride',
              usePluralOverride ? '1' : '0',
            );
            sessionStorage.setItem(
              'selectedUnitPluralOverride',
              usePluralOverride ? pluralInputTrimmed : '',
            );
            sessionStorage.setItem(
              'selectedUnitQuantityRoundingPreset',
              quantityRoundingPreset,
            );
            sessionStorage.setItem(
              'selectedUnitQuantityRoundingStepDenom',
              quantityRoundingPreset === 'custom' ? String(stepRaw) : '',
            );
            sessionStorage.setItem(
              'selectedUnitQuantityRoundingMode',
              quantityRoundingPreset === 'custom' ? modeRaw : '',
            );
            sessionStorage.setItem('selectedUnitIsHidden', String(isHidden));
            sessionStorage.setItem('selectedUnitIsRemoved', String(isRemoved));
            sessionStorage.removeItem('selectedUnitIsNew');
            return;
          }

          uiToast('Cannot save unit: data service is required.');
          throw new Error('unit save unavailable');
        },
      });

      wireUnitRoundingControls(unitEditorCtl?.markDirtyFromUserEdit);

      const useOvToggle = document.getElementById(
        'unitUsePluralOverrideToggle',
      );
      if (useOvToggle) {
        useOvToggle.addEventListener('change', () => {
          const engaged = !!useOvToggle.checked;
          if (engaged) {
            const pl = document.getElementById('unitPluralInput');
            const s = String(sinEl?.value || '').trim();
            if (pl && !String(pl.value || '').trim()) {
              pl.value = getUnitAutoPlural(s);
            }
          }
          syncUnitPluralLockUi();
        });
      }

      const sinEl = document.getElementById('unitSingularInput');
      if (sinEl) {
        sinEl.addEventListener('input', () => {
          syncUnitPluralLockUi();
        });
      }
      const plEl = document.getElementById('unitPluralInput');
      if (plEl) {
        plEl.addEventListener('input', () => {
          syncUnitEditorTitleDisplay();
        });
      }

      syncUnitRoundingMeasuredUi();
      syncUnitPluralLockUi();
      syncUnitRoundingExampleTotals();
      snapshotUnitPluralEscBaseline();
      fePageLoadFoodIconFinish();
    });
  } else {
    fePageLoadFoodIconFail();
  }
}

async function loadUnitsPage() {
  fePageLoadFoodIconBegin('units');
  initAppBar({
    mode: 'list',
    titleText: 'Units',
    showAdd: true,
  });

  const list = document.getElementById('unitsList');

  // App bar is injected async; wait before wiring menu/search.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  let unitsMonogramUnitlessItemsBtn = null;
  const ensureUnitsMonogramUnitlessItemsButton = () => {
    if (!(unitsMonogramUnitlessItemsBtn instanceof HTMLButtonElement)) {
      unitsMonogramUnitlessItemsBtn = document.createElement('button');
      unitsMonogramUnitlessItemsBtn.type = 'button';
      unitsMonogramUnitlessItemsBtn.id = 'appBarMonogramUnitlessItemsBtn';
      unitsMonogramUnitlessItemsBtn.className = 'bottom-nav-pill';
      unitsMonogramUnitlessItemsBtn.textContent = 'Unitless Items';
      unitsMonogramUnitlessItemsBtn.addEventListener('click', () => {
        try {
          sessionStorage.setItem(
            'favoriteEatsUnitlessItemsBackHref',
            'units.html',
          );
        } catch (_) {}
        window.location.href = 'unitlessItems.html';
      });
    }
    return [unitsMonogramUnitlessItemsBtn];
  };
  window.favoriteEatsMonogramMenuExtraButtons =
    ensureUnitsMonogramUnitlessItemsButton;
  try {
    if (typeof window.favoriteEatsRebuildMonogramAccountMenu === 'function') {
      window.favoriteEatsRebuildMonogramAccountMenu();
    }
  } catch (_) {}

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applyUnitFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  if (!list) return;

  // Keyboard selection + Enter activation for list rows.
  const listNav = enableTopLevelListKeyboardNav(list);

  let unitRows = [];
  let unitRowsLoadedFromDataService = false;
  // Supabase-first units list (web default), then SQLite.
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listUnits === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listUnits();
      const raw = Array.isArray(rows) ? rows : [];
      unitRows =
        typeof window.sortUnitsListForCatalogUi === 'function'
          ? window.sortUnitsListForCatalogUi(raw)
          : raw;
      unitRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listUnits', err);
      unitRows = [];
      unitRowsLoadedFromDataService = false;
    }
  }

  if (!unitRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }
  window.dataService.useSupabase = true;

  const queryUnits = async () => {
    try {
      const rows = await window.dataService.listUnits();
      const raw = Array.isArray(rows) ? rows : [];
      return typeof window.sortUnitsListForCatalogUi === 'function'
        ? window.sortUnitsListForCatalogUi(raw)
        : raw;
    } catch (err) {
      console.error('dataService.listUnits failed:', err);
      uiToast('Failed to load units.');
      return [];
    }
  };

  if (!unitRowsLoadedFromDataService) {
    unitRows = await queryUnits();
  }

  const unitFilterChipDefs = [
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeUnitFilterChips = new Set();
  let unitChipCounts = new Map();
  let unitFilterChipRail = null;

  const recomputeUnitChipCounts = () => {
    const counts = new Map();
    unitFilterChipDefs.forEach((chip) => counts.set(chip.id, 0));
    unitRows.forEach((row) => {
      const state = getUnitSizeRowState(row);
      if (state.isHidden) counts.set('hidden', (counts.get('hidden') || 0) + 1);
      if (state.isRemoved)
        counts.set('removed', (counts.get('removed') || 0) + 1);
    });
    unitChipCounts = counts;
  };

  const rerenderUnitFilterChips = () => {
    const chipMountEl = unitFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: unitFilterChipDefs.map((chipDef) => {
        const count = Number(unitChipCounts.get(chipDef.id) || 0);
        return {
          id: chipDef.id,
          label: chipDef.label,
          disabled: count <= 0,
        };
      }),
      activeChipIds: activeUnitFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        const count = Number(unitChipCounts.get(key) || 0);
        if (!key || count <= 0) return;
        if (activeUnitFilterChips.has(key)) activeUnitFilterChips.delete(key);
        else activeUnitFilterChips.add(key);
        rerenderUnitFilterChips();
        applyUnitFilters();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const mountUnitFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    unitFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'unitFilterChipDock',
    });
    recomputeUnitChipCounts();
    rerenderUnitFilterChips();
    unitFilterChipRail?.sync?.();
  };

  const getFilteredUnits = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    return unitRows.filter((u) => {
      if (!shouldShowUnitSizeRow(u, activeUnitFilterChips)) return false;
      const haystack = [
        u.code || '',
        u.nameSingular || '',
        u.namePlural || '',
        u.category || '',
      ]
        .join(' ')
        .toLowerCase();
      return !query || haystack.includes(query);
    });
  };

  function renderUnitsList({ units }) {
    list.innerHTML = '';

    const rows = Array.isArray(units) ? units : [];
    if (!rows.length) {
      renderTopLevelEmptyState(list, 'units');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);

    rows.forEach((unit) => {
      const li = document.createElement('li');
      const state = getUnitSizeRowState(unit);
      if (state.isRemoved) li.classList.add('list-item--removed');

      const code = (unit.code || '').trim();
      const nameSingular = (unit.nameSingular || '').trim();
      let line = nameSingular || code;
      if (
        nameSingular &&
        code &&
        nameSingular.toLowerCase() !== code.toLowerCase()
      ) {
        line = `${nameSingular} (${code})`;
      }

      li.textContent = line;

      const countRecipesUsingUnit = async (code) => {
        const c = (code || '').trim();
        if (!c) return 0;
        if (
          window.dataService &&
          typeof window.dataService.countRecipesUsingUnit === 'function'
        ) {
          try {
            window.dataService.useSupabase = true;
            const n = await window.dataService.countRecipesUsingUnit({
              code: c,
            });
            return Number.isFinite(Number(n)) ? Number(n) : 0;
          } catch (err) {
            console.warn('countRecipesUsingUnit (dataService) failed:', err);
            return 0;
          }
        }
        return 0;
      };

      const getRecipesUsingUnit = async (code) => {
        const c = (code || '').trim();
        if (!c) return [];
        if (
          window.dataService &&
          typeof window.dataService.listRecipesUsingUnit === 'function'
        ) {
          try {
            window.dataService.useSupabase = true;
            const rows = await window.dataService.listRecipesUsingUnit({
              code: c,
            });
            return Array.isArray(rows) ? rows : [];
          } catch (err) {
            console.warn('getRecipesUsingUnit (dataService) failed:', err);
            return [];
          }
        }
        return [];
      };

      const removeUnit = async (code) => {
        const c = (code || '').trim();
        if (!c) return false;

        const usedCount = await countRecipesUsingUnit(c);

        if (getUnitSizeRemovalAction(usedCount) === 'remove') {
          const recipes = await getRecipesUsingUnit(c);
          const usageLine =
            usedCount === 1
              ? 'This unit is used in this recipe:'
              : 'This unit is used in these recipes:';
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
          note.textContent =
            'Removing marks this unit as removed and blocks it from new selections. It remains in existing recipes until replaced.';
          details.appendChild(note);

          let ok = false;
          if (window.ui && typeof window.ui.dialog === 'function') {
            const res = await window.ui.dialog({
              title: 'Remove Unit',
              message: `Remove "${c}"? ${usageLine}`,
              messageNode: details,
              confirmText: 'Remove',
              cancelText: 'Cancel',
              danger: true,
            });
            ok = !!res;
          } else {
            ok = await uiConfirm({
              title: 'Remove Unit',
              message: `Remove "${c}"? ${usageLine} Removing marks it as removed and blocks it from new selections.`,
              confirmText: 'Remove',
              cancelText: 'Cancel',
              danger: true,
            });
          }
          if (!ok) return false;

          try {
            await window.dataService.removeUnit({ code: c, action: 'remove' });
          } catch (err) {
            console.error('❌ Failed to remove unit:', err);
            uiToast('Failed to remove unit. See console for details.');
            return false;
          }
        } else {
          const ok = await uiConfirm({
            title: 'Delete Unit',
            message: `Remove '${c}' permanently? It isn't used in any recipes. This will permanently delete it from the database.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true,
          });
          if (!ok) return false;

          try {
            await window.dataService.removeUnit({ code: c, action: 'delete' });
          } catch (err) {
            console.error('❌ Failed to delete unit:', err);
            uiToast('Failed to delete unit. See console for details.');
            return false;
          }
        }

        return true;
      };

      li.addEventListener('click', (event) => {
        const wantsRemove = event.ctrlKey || event.metaKey;
        if (wantsRemove) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeUnit(unit.code || '');
            if (!ok) return;
            unitRows = await queryUnits();
            recomputeUnitChipCounts();
            rerenderUnitFilterChips();
            applyUnitFilters();
          })();
          return;
        }

        // Stash selected unit in session for future editor wiring
        sessionStorage.setItem('selectedUnitCode', unit.code || '');
        sessionStorage.setItem(
          'selectedUnitNameSingular',
          unit.nameSingular || '',
        );
        sessionStorage.setItem('selectedUnitNamePlural', unit.namePlural || '');
        sessionStorage.setItem(
          'selectedUnitUsePluralOverride',
          unit.usePluralOverride ? '1' : '0',
        );
        sessionStorage.setItem(
          'selectedUnitPluralOverride',
          unit.pluralOverride || '',
        );
        sessionStorage.setItem(
          'selectedUnitQuantityRoundingPreset',
          unit.quantityRoundingPreset || 'nearest_eighth',
        );
        sessionStorage.setItem(
          'selectedUnitQuantityRoundingStepDenom',
          unit.quantityRoundingStepDenominator != null
            ? String(unit.quantityRoundingStepDenominator)
            : '',
        );
        sessionStorage.setItem(
          'selectedUnitQuantityRoundingMode',
          unit.quantityRoundingMode || '',
        );
        sessionStorage.setItem('selectedUnitCategory', unit.category || '');
        sessionStorage.setItem(
          'selectedUnitIsHidden',
          state.isHidden ? '1' : '0',
        );
        sessionStorage.setItem(
          'selectedUnitIsRemoved',
          state.isRemoved ? '1' : '0',
        );
        sessionStorage.removeItem('selectedUnitIsNew');

        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('unitEditor.html');
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void (async () => {
          const ok = await removeUnit(unit.code || '');
          if (!ok) return;
          unitRows = await queryUnits();
          recomputeUnitChipCounts();
          rerenderUnitFilterChips();
          applyUnitFilters();
        })();
      });

      window.favoriteEatsBindLongPressRemove?.(li, () => {
        void (async () => {
          const ok = await removeUnit(unit.code || '');
          if (!ok) return;
          unitRows = await queryUnits();
          recomputeUnitChipCounts();
          rerenderUnitFilterChips();
          applyUnitFilters();
        })();
      });

      list.appendChild(li);
    });

    // Keep selection valid after rerender (search/filter changes).
    listNav?.syncAfterRender?.();
  }

  const applyUnitFilters = () => {
    renderUnitsList({ units: getFilteredUnits() });
  };

  mountUnitFilterChips();
  // Initial render
  applyUnitFilters();
  fePageLoadFoodIconFinish();

  const unregisterCatalogUnits =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        unitRows = await queryUnits();
        recomputeUnitChipCounts();
        rerenderUnitFilterChips();
        applyUnitFilters();
      } catch (err) {
        console.warn('catalog reference refresh (units) failed:', err);
      }
    });
  window.addEventListener('pagehide', unregisterCatalogUnits, { once: true });

  async function openCreateUnitDialog() {
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }

    const vals = await window.ui.form({
      title: 'New Unit',
      fields: [
        {
          key: 'nameSingular',
          label: 'Name (singular)',
          value: '',
          required: true,
          normalize: (v) => (v || '').trim(),
        },
        {
          key: 'code',
          label: 'Abbreviation (optional)',
          value: '',
          required: false,
          normalize: (v) => (v || '').trim(),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        if (!v.nameSingular || !v.nameSingular.trim()) {
          return 'Name (singular) is required.';
        }
        return '';
      },
    });
    if (!vals) return;

    const nameSingular = (vals.nameSingular || '').trim();
    const code = ((vals.code || '').trim() || nameSingular).trim();
    if (!nameSingular || !code) return;

    let savedCode = code;
    try {
      const created = await window.dataService.createUnit({
        nameSingular,
        code,
      });
      savedCode = String(created?.code || code);
    } catch (err) {
      console.error('❌ Failed to create unit:', err);
      uiToast('Failed to create unit. (Code must be unique.)');
      return;
    }

    sessionStorage.setItem('selectedUnitCode', savedCode);
    sessionStorage.setItem('selectedUnitNameSingular', nameSingular);
    sessionStorage.setItem('selectedUnitNamePlural', '');
    sessionStorage.setItem('selectedUnitUsePluralOverride', '0');
    sessionStorage.setItem('selectedUnitPluralOverride', '');
    sessionStorage.setItem(
      'selectedUnitQuantityRoundingPreset',
      'nearest_eighth',
    );
    sessionStorage.setItem('selectedUnitQuantityRoundingStepDenom', '');
    sessionStorage.setItem('selectedUnitQuantityRoundingMode', '');
    sessionStorage.setItem('selectedUnitCategory', '');
    sessionStorage.setItem('selectedUnitIsHidden', '0');
    sessionStorage.setItem('selectedUnitIsRemoved', '0');
    sessionStorage.setItem('selectedUnitIsNew', '1');
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('unitEditor.html');
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateUnitDialog();
    });
  }
}

async function loadTagsPage() {
  fePageLoadFoodIconBegin('tags');
  initAppBar({
    mode: 'list',
    titleText: 'Tags',
    showAdd: true,
  });

  const list = document.getElementById('tagsList');
  if (!list) return;

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      renderTags(applyTagSearchFilter(tagRows));
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  const listNav = enableTopLevelListKeyboardNav(list);

  let tagRows = [];
  let tagRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listTags === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listTags();
      tagRows = Array.isArray(rows) ? rows : [];
      tagRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listTags', err);
      tagRows = [];
      tagRowsLoadedFromDataService = false;
    }
  }

  if (!tagRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }
  window.dataService.useSupabase = true;

  const queryTags = async () => {
    try {
      return await window.dataService.listTags();
    } catch (err) {
      console.error('dataService.listTags failed:', err);
      uiToast('Failed to load tags.');
      return [];
    }
  };

  if (!tagRowsLoadedFromDataService) {
    tagRows = await queryTags();
  }

  const TAGS_COLLAPSE_KEYS = {
    recipes: 'tags-section-recipes',
    ingredients: 'tags-section-ingredients',
  };
  const collapsedTagsSections = new Set();

  const deleteTag = async (tag) => {
    if (!tag || !Number.isFinite(Number(tag.id))) return false;
    const ok = await uiConfirm({
      title: 'Delete Tag',
      message: `Delete "${tag.name}"? This removes it from all recipes and ingredient variants.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return false;
    try {
      await window.dataService.deleteTag({ id: tag.id });
      return true;
    } catch (err) {
      console.error('❌ Failed to delete tag:', err);
      uiToast('Failed to delete tag. See console.');
      return false;
    }
  };

  function renderTags(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'tags');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    const appendSection = (
      label,
      collapseKey,
      headerModifierClass,
      sectionRows,
    ) => {
      const expanded = !collapsedTagsSections.has(collapseKey);
      const header = document.createElement('li');
      header.className = `list-section-label ${headerModifierClass}`;
      const toggleBtn = createSectionToggleButton({
        label,
        expanded,
        onToggle: () => {
          if (collapsedTagsSections.has(collapseKey)) {
            collapsedTagsSections.delete(collapseKey);
          } else {
            collapsedTagsSections.add(collapseKey);
          }
          renderTags(applyTagSearchFilter(tagRows));
        },
      });
      header.appendChild(toggleBtn);
      list.appendChild(header);
      if (!expanded) return;
      [...sectionRows]
        .sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
          }),
        )
        .forEach((tag) => {
          const li = document.createElement('li');
          li.textContent = tag.name || '';
          li.addEventListener('click', (event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              event.stopPropagation();
              void (async () => {
                const ok = await deleteTag(tag);
                if (!ok) return;
                tagRows = await queryTags();
                renderTags(applyTagSearchFilter(tagRows));
              })();
              return;
            }
            sessionStorage.setItem('selectedTagId', String(tag.id));
            sessionStorage.setItem('selectedTagName', tag.name || '');
            sessionStorage.removeItem('selectedTagIsNew');
            sessionStorage.removeItem('selectedTagUseFor');
            window.location.href =
              favoriteEatsHrefWithCurrentAdapter('tagEditor.html');
          });
          li.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            void (async () => {
              const ok = await deleteTag(tag);
              if (!ok) return;
              tagRows = await queryTags();
              renderTags(applyTagSearchFilter(tagRows));
            })();
          });
          window.favoriteEatsBindLongPressRemove?.(li, () => {
            void (async () => {
              const ok = await deleteTag(tag);
              if (!ok) return;
              tagRows = await queryTags();
              renderTags(applyTagSearchFilter(tagRows));
            })();
          });
          list.appendChild(li);
        });
    };
    appendSection(
      'Recipes',
      TAGS_COLLAPSE_KEYS.recipes,
      'shopping-list-section--recipes',
      items.filter(
        (tag) =>
          tag.hasRecipeUsage ||
          (!tag.hasIngredientUsage &&
            (tag.intendedUse || 'recipes') !== 'ingredients'),
      ),
    );
    appendSection(
      'Ingredients',
      TAGS_COLLAPSE_KEYS.ingredients,
      'tags-list-section--ingredients',
      items.filter(
        (tag) =>
          tag.hasIngredientUsage ||
          (!tag.hasRecipeUsage &&
            (tag.intendedUse || 'recipes') === 'ingredients'),
      ),
    );
    listNav?.syncAfterRender?.();
  }

  const applyTagSearchFilter = (rows) => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    if (!q) return rows;
    return (rows || []).filter((row) =>
      String(row.name || '')
        .toLowerCase()
        .includes(q),
    );
  };

  const openCreateTagDialog = async () => {
    if (!window.ui) return;
    const findDuplicateTagIdByName = (rawName) => {
      const candidate = String(rawName || '').trim();
      if (!candidate) return null;
      const match = (Array.isArray(tagRows) ? tagRows : []).find(
        (row) =>
          String(row?.name || '')
            .trim()
            .toLowerCase() === candidate.toLowerCase(),
      );
      const id = Number(match?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    };
    const vals = await window.ui.form({
      title: 'New Tag',
      fields: [
        {
          key: 'name',
          label: 'Name',
          value: '',
          required: true,
          normalize: (v) => String(v || '').trim(),
          validate: (nameVal) => {
            const clipped = String(nameVal || '')
              .trim()
              .slice(0, 48)
              .trim();
            if (!clipped) return '';
            const dupId = findDuplicateTagIdByName(clipped);
            if (!Number.isFinite(dupId)) return '';
            return `There is already a tag called "${clipped}". Please choose a unique name.`;
          },
        },
        {
          key: 'useFor',
          label: 'Use for',
          type: 'toggleGroup',
          value: 'recipes',
          options: [
            { value: 'recipes', label: 'Recipes' },
            { value: 'ingredients', label: 'Ingredients' },
          ],
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        const clipped = String(v.name || '')
          .trim()
          .slice(0, 48)
          .trim();
        if (!clipped) return 'Name is required.';
        return '';
      },
    });
    if (!vals) return;
    const name = String(vals.name || '')
      .trim()
      .slice(0, 48)
      .trim();
    if (!name) return;
    const useFor = vals.useFor === 'ingredients' ? 'ingredients' : 'recipes';
    try {
      const created = await window.dataService.createTag({
        name,
        intendedUse: useFor,
      });
      const newId = Number(created?.id);
      if (Number.isFinite(newId) && newId > 0) {
        const sectionKey =
          useFor === 'ingredients'
            ? TAGS_COLLAPSE_KEYS.ingredients
            : TAGS_COLLAPSE_KEYS.recipes;
        collapsedTagsSections.delete(sectionKey);
        tagRows = await queryTags();
        renderTags(applyTagSearchFilter(tagRows));
        return;
      }
      tagRows = await queryTags();
      renderTags(applyTagSearchFilter(tagRows));
    } catch (err) {
      console.error('❌ Failed to create tag:', err);
      uiToast('Failed to create tag. Please try again.');
    }
  };

  const unregisterCatalogTags =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        tagRows = await queryTags();
        renderTags(applyTagSearchFilter(tagRows));
      } catch (err) {
        console.warn('catalog reference refresh (tags) failed:', err);
      }
    });
  window.addEventListener('pagehide', unregisterCatalogTags, { once: true });

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateTagDialog();
    });
  }

  renderTags(tagRows);
  fePageLoadFoodIconFinish();
}

function navigateShoppingListToIngredient({ id, name }) {
  const keys = window.favoriteEatsSessionKeys || {};
  const ingId = Number(id);
  const n = String(name || '').trim();
  try {
    if (Number.isFinite(ingId) && ingId > 0) {
      sessionStorage.setItem(
        keys.shoppingNavTargetId,
        String(Math.trunc(ingId)),
      );
      sessionStorage.setItem(keys.shoppingNavTargetName, n);
    } else if (n) {
      sessionStorage.removeItem(keys.shoppingNavTargetId);
      sessionStorage.setItem(keys.shoppingNavTargetName, n);
    } else {
      sessionStorage.removeItem(keys.shoppingNavTargetId);
      sessionStorage.removeItem(keys.shoppingNavTargetName);
    }
  } catch (_) {}
  window.location.href = favoriteEatsHrefWithCurrentAdapter('shopping.html');
}

function loadTagEditorPage() {
  fePageLoadFoodIconBegin('tag-editor');
  const view = document.getElementById('pageContent');
  if (!view) {
    fePageLoadFoodIconFail();
    return;
  }

  const isNew = sessionStorage.getItem('selectedTagIsNew') === '1';
  const idStr = sessionStorage.getItem('selectedTagId');
  const tagId = Number(idStr);
  const storedName = sessionStorage.getItem('selectedTagName') || '';
  const titleDisplay = storedName || (isNew ? 'New tag' : 'Tag');
  const initialTitle = storedName || (isNew ? 'new tag' : 'tag');

  initAppBar({ mode: 'editor', titleText: titleDisplay });
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleDisplay || ''}</h1>
    <div id="tagUsageCardMount"></div>
  `;
  const usageMount = document.getElementById('tagUsageCardMount');

  const renderRecipesForTag = (recipesListEl, rows) => {
    if (!recipesListEl) return;
    recipesListEl.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.className = 'placeholder-prompt';
      span.textContent = 'No recipes use this tag.';
      line.appendChild(span);
      recipesListEl.appendChild(line);
      return;
    }
    items.forEach((row) => {
      const recipeId = Number(row?.id);
      const title = String(row?.title || '').trim();
      if (!Number.isFinite(recipeId) || recipeId <= 0 || !title) return;
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = title;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof window.openRecipe === 'function') {
          window.openRecipe(recipeId, title);
          return;
        }
        setSelectedRecipeNavigationSession(recipeId, title);
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
      });
      line.appendChild(link);
      recipesListEl.appendChild(line);
    });
    if (!recipesListEl.children.length) renderRecipesForTag(recipesListEl, []);
  };

  const renderIngredientsForTag = (listEl, rows) => {
    if (!listEl) return;
    listEl.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const span = document.createElement('span');
      span.className = 'placeholder-prompt';
      span.textContent = 'No ingredients use this tag.';
      line.appendChild(span);
      listEl.appendChild(line);
      return;
    }
    items.forEach((row) => {
      const ingredientId = Number(row?.ingredientId);
      const canonicalName = String(row?.ingredientName || '').trim();
      const label = String(row?.label || '').trim();
      if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !label) return;
      const line = document.createElement('div');
      line.className = 'ingredient-line';
      const link = document.createElement('a');
      link.href = 'shopping.html';
      link.textContent = label;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigateShoppingListToIngredient({
          id: ingredientId,
          name: canonicalName || label,
        });
      });
      line.appendChild(link);
      listEl.appendChild(line);
    });
    if (!listEl.children.length) renderIngredientsForTag(listEl, []);
  };

  const renderTagUsage = (usage) => {
    const mode = usage?.mode === 'ingredients' ? 'ingredients' : 'recipes';
    if (mode === 'ingredients') {
      usageMount.innerHTML = `
        <div id="tagRecipesCard" class="you-will-need-card" aria-label="Ingredients with this tag">
          <h2 class="section-header">INGREDIENTS</h2>
          <div id="tagRecipesList"></div>
        </div>`;
      renderIngredientsForTag(
        document.getElementById('tagRecipesList'),
        Array.isArray(usage?.ingredients) ? usage.ingredients : [],
      );
      return;
    }
    usageMount.innerHTML = `
      <div id="tagRecipesCard" class="you-will-need-card" aria-label="Recipes with this tag">
        <h2 class="section-header">RECIPES</h2>
        <div id="tagRecipesList"></div>
      </div>`;
    renderRecipesForTag(
      document.getElementById('tagRecipesList'),
      Array.isArray(usage?.recipes) ? usage.recipes : [],
    );
  };

  const loadTagUsageCard = async () => {
    if (!usageMount) return;

    if (
      window.dataService &&
      typeof window.dataService.loadTagUsage === 'function'
    ) {
      window.dataService.useSupabase = true;
      try {
        renderTagUsage(await window.dataService.loadTagUsage(tagId));
        return;
      } catch (err) {
        favoriteEatsReportSupabasePrefetchFailure('loadTagUsage', err);
        return;
      }
    }

    console.warn(
      '⚠️ dataService.loadTagUsage is not available; tag usage card left empty.',
    );
    usageMount.innerHTML = `
      <div id="tagRecipesCard" class="you-will-need-card" aria-label="Recipes with this tag">
        <h2 class="section-header">RECIPES</h2>
        <div id="tagRecipesList"></div>
      </div>`;
    renderRecipesForTag(document.getElementById('tagRecipesList'), []);
  };
  const tagUsageLoadPromise = loadTagUsageCard();

  if (typeof waitForAppBarReady !== 'function') {
    fePageLoadFoodIconFail();
    return;
  }
  waitForAppBarReady().then(async () => {
    wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle,
      backHref: 'tags.html',
      normalizeTitle: (s) =>
        String(s || '')
          .trim()
          .slice(0, 48),
      onSave: async ({ title: next }) => {
        const name = String(next || '')
          .trim()
          .slice(0, 48)
          .trim();
        if (!name) {
          uiToast('Tag name is required.');
          throw new Error('Tag name required');
        }

        const canSaveTagThroughDataService =
          favoriteEatsShouldUseSupabaseDataDoor() &&
          window.dataService &&
          typeof window.dataService.createTag === 'function' &&
          typeof window.dataService.editTag === 'function' &&
          typeof window.dataService.listTags === 'function';
        if (canSaveTagThroughDataService) {
          window.dataService.useSupabase = true;
          const tags = await window.dataService.listTags();
          const hasDup = (Array.isArray(tags) ? tags : []).some((tag) => {
            const otherId = Number(tag?.id);
            return (
              (!Number.isFinite(tagId) || tagId <= 0 || otherId !== tagId) &&
              String(tag?.name || '')
                .trim()
                .toLowerCase() === name.toLowerCase()
            );
          });
          if (hasDup) {
            uiToast('That tag already exists.');
            throw new Error('Duplicate tag');
          }
          if (Number.isFinite(tagId) && tagId > 0) {
            await window.dataService.editTag({ id: tagId, name });
          } else {
            const created = await window.dataService.createTag({ name });
            const newId = Number(created?.id);
            if (Number.isFinite(newId) && newId > 0) {
              sessionStorage.setItem('selectedTagId', String(newId));
            }
          }
          sessionStorage.setItem('selectedTagName', name);
          sessionStorage.removeItem('selectedTagIsNew');
          return;
        }

        uiToast('Cannot save tag: data service is required.');
        throw new Error('tag save unavailable');
      },
    });
    try {
      await tagUsageLoadPromise;
    } catch (_) {}
    fePageLoadFoodIconFinish();
  });
}

async function loadSizesPage() {
  fePageLoadFoodIconBegin('sizes');
  initAppBar({
    mode: 'list',
    titleText: 'Sizes',
    showAdd: true,
  });

  const list = document.getElementById('sizesList');
  if (!list) return;

  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: () => {
      applySizeFilters();
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');
  if (addBtn) ensureAppBarTextActionPair(addBtn, 'Add', 'add');

  const listNav = enableTopLevelListKeyboardNav(list);

  let sizeRows = [];
  let sizeRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listSizes === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listSizes();
      sizeRows = Array.isArray(rows) ? rows : [];
      sizeRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listSizes', err);
      sizeRows = [];
      sizeRowsLoadedFromDataService = false;
    }
  }

  if (!sizeRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }
  window.dataService.useSupabase = true;

  const querySizes = async () => {
    try {
      return await window.dataService.listSizes();
    } catch (err) {
      console.error('dataService.listSizes failed:', err);
      uiToast('Failed to load sizes.');
      return [];
    }
  };

  if (!sizeRowsLoadedFromDataService) {
    sizeRows = await querySizes();
  }

  const sizeFilterChipDefs = [
    { id: 'hidden', label: 'hidden' },
    { id: 'removed', label: 'removed' },
  ];
  const activeSizeFilterChips = new Set();
  let sizeChipCounts = new Map();
  let sizeFilterChipRail = null;

  const recomputeSizeChipCounts = () => {
    const counts = new Map();
    sizeFilterChipDefs.forEach((chip) => counts.set(chip.id, 0));
    sizeRows.forEach((row) => {
      const state = getUnitSizeRowState(row);
      if (state.isHidden) counts.set('hidden', (counts.get('hidden') || 0) + 1);
      if (state.isRemoved)
        counts.set('removed', (counts.get('removed') || 0) + 1);
    });
    sizeChipCounts = counts;
  };

  const rerenderSizeFilterChips = () => {
    const chipMountEl = sizeFilterChipRail?.trackEl;
    if (!chipMountEl) return;
    if (typeof window.renderFilterChipList !== 'function') {
      chipMountEl.innerHTML = '';
      return;
    }
    window.renderFilterChipList({
      mountEl: chipMountEl,
      chips: sizeFilterChipDefs.map((chipDef) => {
        const count = Number(sizeChipCounts.get(chipDef.id) || 0);
        return {
          id: chipDef.id,
          label: chipDef.label,
          disabled: count <= 0,
        };
      }),
      activeChipIds: activeSizeFilterChips,
      onToggle: (chipId) => {
        const key = String(chipId || '').toLowerCase();
        const count = Number(sizeChipCounts.get(key) || 0);
        if (!key || count <= 0) return;
        if (activeSizeFilterChips.has(key)) activeSizeFilterChips.delete(key);
        else activeSizeFilterChips.add(key);
        rerenderSizeFilterChips();
        applySizeFilters();
      },
      chipClassName: 'app-filter-chip',
    });
  };

  const mountSizeFilterChips = () => {
    if (!searchInput) return;
    if (typeof window.mountTopFilterChipRail !== 'function') return;
    sizeFilterChipRail = window.mountTopFilterChipRail({
      anchorEl: document.querySelector('.app-bar-wrapper') || searchInput,
      dockId: 'sizeFilterChipDock',
    });
    recomputeSizeChipCounts();
    rerenderSizeFilterChips();
    sizeFilterChipRail?.sync?.();
  };

  const countRecipesUsingSize = async (sizeName) => {
    const n = String(sizeName || '').trim();
    if (!n) return 0;
    if (
      window.dataService &&
      typeof window.dataService.countRecipesUsingSize === 'function'
    ) {
      try {
        window.dataService.useSupabase = true;
        const raw = await window.dataService.countRecipesUsingSize({
          name: n,
        });
        return Number.isFinite(Number(raw)) ? Number(raw) : 0;
      } catch (err) {
        console.warn('countRecipesUsingSize (dataService) failed:', err);
        return 0;
      }
    }
    return 0;
  };

  const getRecipesUsingSize = async (sizeName) => {
    const n = String(sizeName || '').trim();
    if (!n) return [];
    if (
      window.dataService &&
      typeof window.dataService.listRecipesUsingSize === 'function'
    ) {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listRecipesUsingSize({
          name: n,
        });
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.warn('getRecipesUsingSize (dataService) failed:', err);
        return [];
      }
    }
    return [];
  };

  const removeSize = async (sizeRow) => {
    if (!sizeRow || !Number.isFinite(Number(sizeRow.id))) return false;
    const name = String(sizeRow.name || '').trim();
    const usedCount = await countRecipesUsingSize(name);

    if (usedCount > 0) {
      const recipes = await getRecipesUsingSize(name);
      const usageLine =
        usedCount === 1
          ? 'This size is used in this recipe:'
          : 'This size is used in these recipes:';
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
      note.textContent = `Removing marks this size as removed and blocks it from new selections, but keeps existing recipe references intact.`;
      details.appendChild(note);

      let ok = false;
      if (window.ui && typeof window.ui.dialog === 'function') {
        const res = await window.ui.dialog({
          title: 'Remove Size',
          message: `Remove "${name}"? ${usageLine}`,
          messageNode: details,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
        ok = !!res;
      } else {
        ok = await uiConfirm({
          title: 'Remove Size',
          message: `Remove "${name}"? ${usageLine} Removing marks it as removed and blocks it from new selections.`,
          confirmText: 'Remove',
          cancelText: 'Cancel',
          danger: true,
        });
      }
      if (!ok) return false;

      try {
        await window.dataService.removeSize({
          id: sizeRow.id,
          action: 'remove',
        });
      } catch (err) {
        console.error('❌ Failed to remove size:', err);
        uiToast('Failed to remove size. See console.');
        return false;
      }
    } else {
      const ok = await uiConfirm({
        title: 'Delete Size',
        message: `Remove "${name}" permanently? It isn't used in any recipes. This will permanently delete it from the database.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!ok) return false;
      try {
        await window.dataService.removeSize({
          id: sizeRow.id,
          action: 'delete',
        });
      } catch (err) {
        console.error('❌ Failed to delete size:', err);
        uiToast('Failed to delete size. See console.');
        return false;
      }
    }

    return true;
  };

  function renderSizes(rows) {
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      renderTopLevelEmptyState(list, 'sizes');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    items.forEach((sizeRow) => {
      const li = document.createElement('li');
      if (getUnitSizeRowState(sizeRow).isRemoved)
        li.classList.add('list-item--removed');
      li.textContent = sizeRow.name || '';
      li.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          void (async () => {
            const ok = await removeSize(sizeRow);
            if (!ok) return;
            sizeRows = await querySizes();
            recomputeSizeChipCounts();
            rerenderSizeFilterChips();
            applySizeFilters();
          })();
          return;
        }
        sessionStorage.setItem('selectedSizeId', String(sizeRow.id));
        sessionStorage.setItem('selectedSizeName', sizeRow.name || '');
        sessionStorage.setItem(
          'selectedSizeIsHidden',
          sizeRow.isHidden ? '1' : '0',
        );
        sessionStorage.setItem(
          'selectedSizeIsRemoved',
          sizeRow.isRemoved ? '1' : '0',
        );
        sessionStorage.removeItem('selectedSizeIsNew');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('sizeEditor.html');
      });
      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        void (async () => {
          const ok = await removeSize(sizeRow);
          if (!ok) return;
          sizeRows = await querySizes();
          recomputeSizeChipCounts();
          rerenderSizeFilterChips();
          applySizeFilters();
        })();
      });
      window.favoriteEatsBindLongPressRemove?.(li, () => {
        void (async () => {
          const ok = await removeSize(sizeRow);
          if (!ok) return;
          sizeRows = await querySizes();
          recomputeSizeChipCounts();
          rerenderSizeFilterChips();
          applySizeFilters();
        })();
      });
      list.appendChild(li);
    });
    listNav?.syncAfterRender?.();
  }

  const applySizeSearchFilter = (rows) => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (!shouldShowUnitSizeRow(row, activeSizeFilterChips)) return false;
      return (
        !q ||
        String(row.name || '')
          .toLowerCase()
          .includes(q)
      );
    });
  };

  const openCreateSizeDialog = async () => {
    if (!window.ui) return;
    const vals = await window.ui.form({
      title: 'New Size',
      fields: [
        {
          key: 'name',
          label: 'Name',
          value: '',
          required: true,
          normalize: (v) =>
            String(v || '')
              .trim()
              .replace(/\s+/g, ' '),
        },
      ],
      confirmText: 'Create',
      cancelText: 'Cancel',
      validate: (v) => {
        const clipped = String(v.name || '')
          .trim()
          .slice(0, 64)
          .trim();
        if (!clipped) return 'Name is required.';
        return '';
      },
    });
    if (!vals) return;
    const name = String(vals.name || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) return;
    try {
      const created = await window.dataService.createSize({ name });
      const newId = Number(created?.id);
      if (Number.isFinite(newId) && newId > 0) {
        sessionStorage.setItem('selectedSizeId', String(newId));
        sessionStorage.setItem('selectedSizeName', name);
        sessionStorage.setItem('selectedSizeIsHidden', '0');
        sessionStorage.setItem('selectedSizeIsRemoved', '0');
        sessionStorage.setItem('selectedSizeIsNew', '1');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('sizeEditor.html');
        return;
      }
      sizeRows = await querySizes();
      recomputeSizeChipCounts();
      rerenderSizeFilterChips();
      renderSizes(applySizeSearchFilter(sizeRows));
    } catch (err) {
      console.error('❌ Failed to create size:', err);
      uiToast('Failed to create size. Name must be unique.');
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      void openCreateSizeDialog();
    });
  }

  const applySizeFilters = () => {
    renderSizes(applySizeSearchFilter(sizeRows));
  };

  mountSizeFilterChips();
  applySizeFilters();
  fePageLoadFoodIconFinish();

  const unregisterCatalogSizes =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        sizeRows = await querySizes();
        recomputeSizeChipCounts();
        rerenderSizeFilterChips();
        applySizeFilters();
      } catch (err) {
        console.warn('catalog reference refresh (sizes) failed:', err);
      }
    });
  window.addEventListener('pagehide', unregisterCatalogSizes, { once: true });
}

function loadSizeEditorPage() {
  fePageLoadFoodIconBegin('size-editor');
  const view = document.getElementById('pageContent');
  if (!view) {
    fePageLoadFoodIconFail();
    return;
  }

  const isNew = sessionStorage.getItem('selectedSizeIsNew') === '1';
  const idStr = sessionStorage.getItem('selectedSizeId');
  const sizeId = Number(idStr);
  const storedName = sessionStorage.getItem('selectedSizeName') || '';
  const initialHidden = sessionStorage.getItem('selectedSizeIsHidden') === '1';
  const initialRemoved =
    sessionStorage.getItem('selectedSizeIsRemoved') === '1';
  let baselineHidden = !!initialHidden;
  let baselineRemoved = !!initialRemoved;
  const titleDisplay = storedName || (isNew ? 'New size' : 'Size');
  const initialTitle = storedName || (isNew ? 'new size' : 'size');

  initAppBar({ mode: 'editor', titleText: titleDisplay });
  view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleDisplay || ''}</h1>
    <div class="shopping-item-status" style="margin-top: 20px;">
      <div class="shopping-item-status-row">
        <label class="shopping-item-toggle">
          <input id="sizeIsHiddenToggle" type="checkbox" ${initialHidden ? 'checked' : ''} />
          <span>Hidden</span>
        </label>
      </div>
      <div class="shopping-item-status-row">
        <label class="shopping-item-toggle">
          <input id="sizeIsRemovedToggle" type="checkbox" ${initialRemoved ? 'checked' : ''} />
          <span>Removed</span>
        </label>
      </div>
    </div>
  `;

  if (typeof waitForAppBarReady !== 'function') {
    fePageLoadFoodIconFail();
    return;
  }
  waitForAppBarReady().then(() => {
    const pageCtl = wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle,
      backHref: 'sizes.html',
      normalizeTitle: (s) =>
        String(s || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 64),
      extraDirtyState: {
        isDirty: () => {
          const h = !!document.getElementById('sizeIsHiddenToggle')?.checked;
          const r = !!document.getElementById('sizeIsRemovedToggle')?.checked;
          return h !== baselineHidden || r !== baselineRemoved;
        },
        onCancel: () => {
          const hEl = document.getElementById('sizeIsHiddenToggle');
          const rEl = document.getElementById('sizeIsRemovedToggle');
          if (hEl) hEl.checked = baselineHidden;
          if (rEl) rEl.checked = baselineRemoved;
        },
        onAfterSaveSuccess: () => {
          baselineHidden =
            !!document.getElementById('sizeIsHiddenToggle')?.checked;
          baselineRemoved = !!document.getElementById('sizeIsRemovedToggle')
            ?.checked;
        },
      },
      onSave: async ({ title: next }) => {
        const name = String(next || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 64)
          .trim();
        if (!name) {
          uiToast('Size name is required.');
          throw new Error('Size name required');
        }

        const isHidden = document.getElementById('sizeIsHiddenToggle')?.checked
          ? 1
          : 0;
        const isRemoved = document.getElementById('sizeIsRemovedToggle')
          ?.checked
          ? 1
          : 0;
        const canSaveSizeThroughDataService =
          favoriteEatsShouldUseSupabaseDataDoor() &&
          window.dataService &&
          typeof window.dataService.createSize === 'function' &&
          typeof window.dataService.editSize === 'function' &&
          typeof window.dataService.listSizes === 'function';
        if (canSaveSizeThroughDataService) {
          window.dataService.useSupabase = true;
          const sizes = await window.dataService.listSizes();
          const hasDup = (Array.isArray(sizes) ? sizes : []).some((size) => {
            const otherId = Number(size?.id);
            return (
              (!Number.isFinite(sizeId) || sizeId <= 0 || otherId !== sizeId) &&
              String(size?.name || '')
                .trim()
                .toLowerCase() === name.toLowerCase()
            );
          });
          if (hasDup) {
            uiToast('That size already exists.');
            throw new Error('Duplicate size');
          }
          if (Number.isFinite(sizeId) && sizeId > 0) {
            await window.dataService.editSize({
              id: sizeId,
              name,
              isHidden: !!isHidden,
              isRemoved: !!isRemoved,
              oldName: storedName,
            });
          } else {
            const created = await window.dataService.createSize({ name });
            const newId = Number(created?.id);
            if (Number.isFinite(newId) && newId > 0) {
              sessionStorage.setItem('selectedSizeId', String(newId));
              if (isHidden || isRemoved) {
                await window.dataService.editSize({
                  id: newId,
                  name,
                  isHidden: !!isHidden,
                  isRemoved: !!isRemoved,
                  oldName: name,
                });
              }
            }
          }
          sessionStorage.setItem('selectedSizeName', name);
          sessionStorage.setItem('selectedSizeIsHidden', String(isHidden));
          sessionStorage.setItem('selectedSizeIsRemoved', String(isRemoved));
          sessionStorage.removeItem('selectedSizeIsNew');
          return;
        }

        uiToast('Cannot save size: data service is required.');
        throw new Error('size save unavailable');
      },
    });
    const refreshDirty =
      (pageCtl && pageCtl.refreshDirty) ||
      (() => {
        /* noop */
      });
    const hiddenToggle = document.getElementById('sizeIsHiddenToggle');
    const removedToggle = document.getElementById('sizeIsRemovedToggle');
    [hiddenToggle, removedToggle].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', () => refreshDirty());
    });
    fePageLoadFoodIconFinish();
  });
}

/**
 * Usage phrase for catalog variant delete (omit zero counts).
 * @param {number} recipeCount
 * @param {number} aisleCount
 * @returns {string}
 */
function formatCatalogVariantDeleteUsagePhrase(recipeCount, aisleCount) {
  const parts = [];
  if (recipeCount > 0) {
    parts.push(recipeCount === 1 ? '1 recipe' : `${recipeCount} recipes`);
  }
  if (aisleCount > 0) {
    parts.push(aisleCount === 1 ? '1 aisle' : `${aisleCount} aisles`);
  }
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} and ${parts[1]}`;
}

/**
 * @param {{ variantName: string, itemName: string, recipeCount: number, aisleCount: number }} opts
 * @returns {string}
 */
function buildCatalogVariantDeleteInUseMessage(opts) {
  const variantName = String(opts?.variantName || '').trim();
  const itemName = String(opts?.itemName || '').trim() || 'item';
  const recipeCount = Number(opts?.recipeCount) || 0;
  const aisleCount = Number(opts?.aisleCount) || 0;
  const usage = formatCatalogVariantDeleteUsagePhrase(recipeCount, aisleCount);
  const removeClause = usage ? ` and remove it from ${usage}` : '';
  const referenceLabel = [variantName, itemName].filter(Boolean).join(' ');
  return `This will permanently delete the “${variantName}” variant from the catalog${removeClause}. Existing references to “${referenceLabel}” will be converted to “${itemName}.” This action can’t be undone.`;
}

/**
 * @param {{ variantName: string, itemName: string }} opts
 * @returns {string}
 */
function buildCatalogVariantDeleteUnusedMessage(opts) {
  const variantName = String(opts?.variantName || '').trim();
  const itemName = String(opts?.itemName || '').trim() || 'item';
  return `Permanently delete the “${variantName}” variant of “${itemName}” from the catalog? This action can’t be undone.`;
}

/**
 * Recipes + aisles link ledger for variant delete-in-use dialog.
 * @param {{ id: number, title: string }[]} recipes
 * @param {{ storeId: number, chainName: string, locationName: string, aisleId: number, aisleName: string }[]} aislePlacements
 * @returns {HTMLDivElement}
 */
function createVariantUsageLedgerNode(recipes, aislePlacements) {
  const details = document.createElement('div');
  details.className = 'shopping-remove-dialog-details';
  const refCount = Array.isArray(recipes) ? recipes.length : 0;
  const aisleCount = Array.isArray(aislePlacements)
    ? aislePlacements.length
    : 0;
  if (refCount > 0) {
    const recipesHeading = document.createElement('div');
    recipesHeading.className = 'shopping-remove-dialog-section-heading';
    recipesHeading.textContent = 'Recipes';
    details.appendChild(recipesHeading);
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
    details.appendChild(linksWrap);
  }
  if (aisleCount > 0) {
    const aislesHeading = document.createElement('div');
    aislesHeading.className = 'shopping-remove-dialog-section-heading';
    aislesHeading.textContent = 'Aisles';
    details.appendChild(aislesHeading);
    const aisleLinksWrap = document.createElement('div');
    aisleLinksWrap.className = 'shopping-remove-dialog-links';
    aislePlacements.forEach((placement) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'shopping-remove-dialog-link';
      const aisleLabel =
        String(placement.aisleName || '').trim() ||
        `Aisle ${placement.aisleId}`;
      const storeBits = [
        String(placement.chainName || '').trim(),
        String(placement.locationName || '').trim(),
      ].filter(Boolean);
      const storeLabel = storeBits.length ? storeBits.join(', ') : 'Store';
      a.textContent = `${aisleLabel} (${storeLabel})`;
      a.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof window.openStoreAisle === 'function') {
          window.openStoreAisle(
            placement.storeId,
            placement.aisleId,
            placement.chainName,
            placement.locationName,
          );
        }
      });
      aisleLinksWrap.appendChild(a);
    });
    details.appendChild(aisleLinksWrap);
  }
  return details;
}

/** Plain-text fallback for variant usage ledger (native alert / no rich UI). */
function formatVariantUsageLedgerPlainText(recipes, aislePlacements) {
  const refCount = Array.isArray(recipes) ? recipes.length : 0;
  const aisleCount = Array.isArray(aislePlacements)
    ? aislePlacements.length
    : 0;
  const recipeLines =
    refCount > 0
      ? `\n\nRecipes\n${recipes.map((r) => `• ${r.title || `Recipe ${r.id}`}`).join('\n')}`
      : '';
  const aisleLines =
    aisleCount > 0
      ? `\n\nAisles\n${aislePlacements
          .map((p) => {
            const aisleLabel =
              String(p.aisleName || '').trim() || `Aisle ${p.aisleId}`;
            const storeBits = [
              String(p.chainName || '').trim(),
              String(p.locationName || '').trim(),
            ].filter(Boolean);
            const storeLabel = storeBits.length
              ? storeBits.join(', ')
              : 'Store';
            return `• ${aisleLabel} (${storeLabel})`;
          })
          .join('\n')}`
      : '';
  return `${recipeLines}${aisleLines}`;
}

async function loadStoresPage() {
  fePageLoadFoodIconBegin('stores');
  initAppBar({
    mode: 'list',
    titleText: 'Stores',
  });

  const list = document.getElementById('storesList');

  // App bar is injected async; wait before wiring menu/search/add.
  if (typeof waitForAppBarReady === 'function') {
    await waitForAppBarReady();
  }
  initBottomNav();

  const searchInput = document.getElementById('appBarSearchInput');
  const clearBtn = document.getElementById('appBarSearchClear');
  wireAppBarSearch(searchInput, {
    clearBtn,
    onQueryChange: (query) => {
      const selectedStoreId = getSelectedVisibleStoreId();
      searchQuery = String(query || '').toLowerCase();
      rerenderFilteredStores({
        selectedStoreId,
        clearSelectionWhenMissing: true,
      });
    },
  });
  const addBtn = document.getElementById('appBarAddBtn');

  if (!list) return;

  // Keyboard behavior:
  // - Enter is no-op
  // - Cmd+↑/↓ reorders when a row has red selection (hijacks top-level tab shortcut)
  // - Escape clears the current selection
  const listNav = enableTopLevelListKeyboardNav(list, {
    requireExistingSelectionForArrows: true,
    disableArrowNavigation: true,
    disableEnterActivation: true,
    disableHoverSelection: true,
    toggleSelectionOnClick: true,
    clearSelectionOnOutsidePointerDown: true,
    clearSelectionOnOutsideFocus: true,
    clearSelectionOnWindowBlur: true,
    clearSelectionOnEscape: true,
  });

  let storeRows = [];
  let storeRowsLoadedFromDataService = false;
  if (
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.listStores === 'function'
  ) {
    window.dataService.useSupabase = true;
    try {
      const rows = await window.dataService.listStores();
      storeRows = Array.isArray(rows) ? rows : [];
      storeRowsLoadedFromDataService = true;
    } catch (err) {
      favoriteEatsReportSupabasePrefetchFailure('listStores', err);
      storeRows = [];
      storeRowsLoadedFromDataService = false;
    }
  }

  if (!storeRowsLoadedFromDataService) {
    fePageLoadFoodIconFail();
    return;
  }
  const db = null;
  window.dbInstance = db;
  window.dataService.useSupabase = true;

  if (shouldUseRemoteShoppingState()) {
    try {
      await hydrateShoppingStateFromDataService({
        source: 'stores page load',
      });
    } catch (hydrateErr) {
      console.warn(
        'Stores page: could not load plan/list from server:',
        hydrateErr,
      );
    }
  }

  const queryStores = async () => {
    try {
      return await window.dataService.listStores();
    } catch (err) {
      console.error('dataService.listStores failed:', err);
      uiToast('Failed to load stores.');
      return [];
    }
  };

  if (!storeRowsLoadedFromDataService) {
    storeRows = await queryStores();
  }
  const defaultStoreRows = storeRows.slice();
  const orderStoreRowsFromPlan = (rows) => {
    const normalizedRows = Array.isArray(rows) ? rows.slice() : [];
    const persistedOrder = getShoppingPlanStoreOrder();
    if (!persistedOrder.length) return normalizedRows;
    const rowsById = new Map();
    normalizedRows.forEach((row) => {
      const rowId = Number(row?.id);
      if (!Number.isFinite(rowId) || rowId <= 0) return;
      rowsById.set(rowId, row);
    });
    const orderedRows = [];
    persistedOrder.forEach((storeId) => {
      const row = rowsById.get(storeId);
      if (!row) return;
      orderedRows.push(row);
      rowsById.delete(storeId);
    });
    normalizedRows.forEach((row) => {
      const rowId = Number(row?.id);
      if (!rowsById.has(rowId)) return;
      orderedRows.push(row);
      rowsById.delete(rowId);
    });
    return orderedRows;
  };
  storeRows = orderStoreRowsFromPlan(storeRows);
  const getExistingStoreIds = () =>
    new Set(
      storeRows
        .map((row) => Math.trunc(Number(row?.id)))
        .filter((storeId) => Number.isFinite(storeId) && storeId > 0),
    );
  const checkedStoreIds = new Set(
    getShoppingPlanSelectedStoreIds().filter((storeId) =>
      getExistingStoreIds().has(storeId),
    ),
  );
  const getStoreOrderIds = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => Math.trunc(Number(row?.id)))
      .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
  const isAtDefaultStoreOrder = () => {
    const currentIds = getStoreOrderIds(storeRows);
    const defaultIds = getStoreOrderIds(defaultStoreRows);
    if (currentIds.length !== defaultIds.length) return false;
    for (let idx = 0; idx < currentIds.length; idx += 1) {
      if (currentIds[idx] !== defaultIds[idx]) return false;
    }
    return true;
  };
  const canResetStoreSelections = () =>
    checkedStoreIds.size > 0 || !isAtDefaultStoreOrder();
  let searchQuery = '';
  const isStorePlannerSelectMode = () => isPlannerModeEnabled();
  const syncStoresResetButtonState = () => {
    if (!(addBtn instanceof HTMLButtonElement)) return;
    if (!isStorePlannerSelectMode()) {
      addBtn.disabled = false;
      addBtn.setAttribute('aria-disabled', 'false');
      return;
    }
    const canReset = canResetStoreSelections();
    addBtn.disabled = !canReset;
    addBtn.setAttribute('aria-disabled', canReset ? 'false' : 'true');
  };
  /** One plan write for store order + selection (avoids two racing save_shopping_state calls). */
  const persistStorePreferencesFromUi = () => {
    const nextOrder = normalizeShoppingPlanStoreOrder(
      storeRows
        .map((row) => Math.trunc(Number(row?.id)))
        .filter((storeId) => Number.isFinite(storeId) && storeId > 0),
    );
    const nextSelected = normalizeShoppingPlanSelectedStoreIds(
      Array.from(checkedStoreIds).filter((storeId) =>
        getExistingStoreIds().has(storeId),
      ),
    );
    const cur = getShoppingPlan();
    if (
      JSON.stringify(normalizeShoppingPlanStoreOrder(cur.storeOrder)) ===
        JSON.stringify(nextOrder) &&
      JSON.stringify(
        normalizeShoppingPlanSelectedStoreIds(cur.selectedStoreIds),
      ) === JSON.stringify(nextSelected)
    ) {
      return;
    }
    updateShoppingPlan((plan) => {
      plan.storeOrder = nextOrder;
      plan.selectedStoreIds = nextSelected;
    });
  };
  persistStorePreferencesFromUi();

  const syncStoresUiFromShoppingPlan = () => {
    storeRows = orderStoreRowsFromPlan(defaultStoreRows.slice());
    const ids = getExistingStoreIds();
    checkedStoreIds.clear();
    getShoppingPlanSelectedStoreIds()
      .filter((storeId) => ids.has(storeId))
      .forEach((storeId) => checkedStoreIds.add(storeId));
  };

  const getFilteredStoreRows = () => {
    const q = searchQuery;
    if (!q) return storeRows;
    return storeRows.filter((store) => {
      const chain = String(store?.chain || '').toLowerCase();
      const location = String(store?.location || '').toLowerCase();
      return chain.includes(q) || location.includes(q);
    });
  };

  const syncStoreRowVisualState = (rowEl, storeId) => {
    if (!(rowEl instanceof HTMLElement)) return;
    const isChecked = checkedStoreIds.has(Number(storeId));
    rowEl.classList.toggle(
      'shopping-row-checked',
      isStorePlannerSelectMode() && isChecked,
    );
    const icon = rowEl.querySelector('.shopping-list-row-icon');
    if (icon) {
      icon.textContent = isChecked ? 'check_box' : 'check_box_outline_blank';
    }
  };

  const swapStoreRowsById = (sourceId, targetId) => {
    const sourceIdx = storeRows.findIndex(
      (row) => Number(row?.id) === Number(sourceId),
    );
    const targetIdx = storeRows.findIndex(
      (row) => Number(row?.id) === Number(targetId),
    );
    if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return false;
    const nextRows = storeRows.slice();
    [nextRows[sourceIdx], nextRows[targetIdx]] = [
      nextRows[targetIdx],
      nextRows[sourceIdx],
    ];
    storeRows = nextRows;
    persistStorePreferencesFromUi();
    return true;
  };

  let activeStoreDrag = null;
  let suppressStoreListClickUntil = 0;

  const getVisibleStoreIndexById = (storeId) =>
    getFilteredStoreRows().findIndex(
      (row) => Number(row?.id) === Number(storeId),
    );

  const isStoreReorderDragEnabled = () =>
    isStorePlannerSelectMode() &&
    !searchQuery &&
    getFilteredStoreRows().length > 1;

  const isStoreRowDragExcludedTarget = (event, rowEl) => {
    if (!(event instanceof PointerEvent) || !(rowEl instanceof HTMLElement)) {
      return false;
    }
    const targetEl = event.target;
    if (!(targetEl instanceof Element)) return false;
    if (
      targetEl.closest(
        '.shopping-list-row-icon, button, a, input, label, textarea, select',
      )
    ) {
      return true;
    }
    const rowRect = rowEl.getBoundingClientRect();
    const checkboxExclusionPx = 48;
    return rowRect.right - event.clientX <= checkboxExclusionPx;
  };

  const getStoreRowElementById = (storeId) =>
    list.querySelector(`[data-store-id="${Number(storeId)}"]`);

  const clearStoreDragVisualState = () => {
    list
      .querySelectorAll('.store-row-dragging, .store-row-drag-source')
      .forEach((rowEl) => {
        rowEl.classList.remove('store-row-dragging', 'store-row-drag-source');
        rowEl.style.transform = '';
      });
    list
      .querySelectorAll('.shopping-list-row-handle--dragging')
      .forEach((handleEl) =>
        handleEl.classList.remove('shopping-list-row-handle--dragging'),
      );
  };

  const measureActiveStoreDragThreshold = () => {
    if (!activeStoreDrag) return 0;
    const rowEl = getStoreRowElementById(activeStoreDrag.storeId);
    if (!(rowEl instanceof HTMLElement))
      return activeStoreDrag.thresholdPx || 0;
    const rect = rowEl.getBoundingClientRect();
    const nextThreshold = Math.max(rect.height * 0.5, 24);
    activeStoreDrag.thresholdPx = nextThreshold;
    return nextThreshold;
  };

  const syncActiveStoreDragVisualState = () => {
    clearStoreDragVisualState();
    if (!activeStoreDrag || !isStoreReorderDragEnabled()) return;
    const rowEl = getStoreRowElementById(activeStoreDrag.storeId);
    if (!(rowEl instanceof HTMLElement)) return;
    rowEl.classList.add('store-row-dragging', 'store-row-drag-source');
    rowEl.style.transform = `translateY(${Math.round(activeStoreDrag.offsetY || 0)}px)`;
    const handleEl = rowEl.querySelector('.shopping-list-row-handle');
    handleEl?.classList?.add('shopping-list-row-handle--dragging');
  };

  const detachStoreDragListeners = () => {
    if (!activeStoreDrag) return;
    document.removeEventListener(
      'pointermove',
      activeStoreDrag.onPointerMove,
      true,
    );
    document.removeEventListener(
      'pointerup',
      activeStoreDrag.onPointerUp,
      true,
    );
    document.removeEventListener(
      'pointercancel',
      activeStoreDrag.onPointerCancel,
      true,
    );
    window.removeEventListener('blur', activeStoreDrag.onWindowBlur);
  };

  const finishActiveStoreDrag = ({ suppressClick = false } = {}) => {
    if (!activeStoreDrag) return;
    try {
      activeStoreDrag.dragSourceEl?.releasePointerCapture?.(
        activeStoreDrag.pointerId,
      );
    } catch (_) {}
    detachStoreDragListeners();
    clearStoreDragVisualState();
    if (suppressClick) suppressStoreListClickUntil = Date.now() + 250;
    activeStoreDrag = null;
  };

  const trySwapDraggedStore = (direction) => {
    if (!activeStoreDrag) return false;
    const visibleRows = getFilteredStoreRows();
    const sourceIdx = getVisibleStoreIndexById(activeStoreDrag.storeId);
    if (sourceIdx < 0) return false;
    const targetIdx = sourceIdx + Number(direction || 0);
    if (targetIdx < 0 || targetIdx >= visibleRows.length) return false;
    const targetStore = visibleRows[targetIdx];
    if (!targetStore) return false;
    const moved = swapStoreRowsById(activeStoreDrag.storeId, targetStore.id);
    if (!moved) return false;
    activeStoreDrag.didSwap = true;
    rerenderFilteredStores({ selectedStoreId: activeStoreDrag.storeId });
    measureActiveStoreDragThreshold();
    return true;
  };

  const onStoreDragPointerMove = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    if (!isStoreReorderDragEnabled()) {
      finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
      return;
    }
    event.preventDefault();
    const deltaY = event.clientY - activeStoreDrag.baselineY;
    activeStoreDrag.offsetY = deltaY;
    syncActiveStoreDragVisualState();
    const threshold = measureActiveStoreDragThreshold();
    if (threshold <= 0 || Math.abs(deltaY) < threshold) return;
    const direction = deltaY > 0 ? 1 : -1;
    const moved = trySwapDraggedStore(direction);
    if (!moved) return;
    activeStoreDrag.baselineY = event.clientY;
    activeStoreDrag.offsetY = 0;
    syncActiveStoreDragVisualState();
  };

  const onStoreDragPointerUp = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    event.preventDefault();
    finishActiveStoreDrag({ suppressClick: true });
  };

  const onStoreDragPointerCancel = (event) => {
    if (!activeStoreDrag || event.pointerId !== activeStoreDrag.pointerId)
      return;
    finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
  };

  const onStoreDragWindowBlur = () => {
    finishActiveStoreDrag({ suppressClick: !!activeStoreDrag?.didSwap });
  };

  const startStoreDrag = (event, storeId) => {
    if (!(event instanceof PointerEvent)) return;
    if (event.button !== 0 || event.isPrimary === false) return;
    if (!isStoreReorderDragEnabled()) return;
    const rowEl = getStoreRowElementById(storeId);
    if (!(rowEl instanceof HTMLElement)) return;
    finishActiveStoreDrag();
    const visibleIdx = getVisibleStoreIndexById(storeId);
    if (visibleIdx >= 0) {
      listNav?.setSelectedIdx?.(visibleIdx);
    }
    activeStoreDrag = {
      pointerId: event.pointerId,
      storeId: Number(storeId),
      dragSourceEl: rowEl,
      baselineY: event.clientY,
      offsetY: 0,
      thresholdPx: Math.max(rowEl.getBoundingClientRect().height * 0.5, 24),
      didSwap: false,
      onPointerMove: onStoreDragPointerMove,
      onPointerUp: onStoreDragPointerUp,
      onPointerCancel: onStoreDragPointerCancel,
      onWindowBlur: onStoreDragWindowBlur,
    };
    document.addEventListener('pointermove', onStoreDragPointerMove, true);
    document.addEventListener('pointerup', onStoreDragPointerUp, true);
    document.addEventListener('pointercancel', onStoreDragPointerCancel, true);
    window.addEventListener('blur', onStoreDragWindowBlur);
    try {
      rowEl.setPointerCapture(event.pointerId);
    } catch (_) {}
    event.preventDefault();
    event.stopPropagation();
    syncActiveStoreDragVisualState();
  };

  function renderStoresList(rows, options = {}) {
    if (activeStoreDrag && !isStoreReorderDragEnabled()) {
      finishActiveStoreDrag({ suppressClick: activeStoreDrag.didSwap });
    }
    list.innerHTML = '';
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      finishActiveStoreDrag();
      renderTopLevelEmptyState(list, 'stores');
      listNav?.syncAfterRender?.();
      return;
    }
    setTopLevelEmptyStateLayoutMode(list, false);
    const reorderEnabled = isStoreReorderDragEnabled();

    items.forEach((store) => {
      const li = document.createElement('li');
      li.dataset.storeId = String(store.id);
      li.classList.toggle('stores-row-reorderable', reorderEnabled);
      const dragHandle = document.createElement('span');
      dragHandle.className =
        'material-symbols-outlined shopping-list-row-handle';
      dragHandle.setAttribute('aria-hidden', 'true');
      dragHandle.textContent = 'drag_indicator';
      // Display exactly as stored (no forced capitalization)
      const chain = store.chain || '';
      const location = store.location || '';
      const storeLabel = location ? `${chain} (${location})` : chain || '';
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined shopping-list-row-icon';
      icon.setAttribute('aria-hidden', 'true');
      li.appendChild(dragHandle);
      if (location) {
        li.classList.add('stores-list-row--split-label');
        const splitRow = createItemsBrowseSplitRowHeadline('shopping-list-row-label');
        splitRow.primary.textContent = chain;
        splitRow.detail.textContent = `(${location})`;
        li.appendChild(splitRow.wrap);
      } else {
        const label = document.createElement('span');
        label.className = 'shopping-list-row-label';
        label.textContent = chain || '';
        li.appendChild(label);
      }
      li.appendChild(icon);
      syncStoreRowVisualState(li, store.id);

      const deleteStoreDeep = async (storeId, label) => {
        const ok = await uiConfirm({
          title: 'Delete store',
          message: `Delete '${label}'?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          danger: true,
        });
        if (!ok) return false;

        try {
          await window.dataService.deleteStore({ id: storeId });
        } catch (err) {
          console.error('❌ Failed to delete store:', err);
          uiToast('Failed to delete store. See console for details.');
          return false;
        }

        storeRows = storeRows.filter(
          (row) => Number(row?.id) !== Number(storeId),
        );
        checkedStoreIds.delete(Number(storeId));
        persistStorePreferencesFromUi();

        return true;
      };

      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isStorePlannerSelectMode()) return;
        const storeId = Number(store.id);
        if (checkedStoreIds.has(storeId)) checkedStoreIds.delete(storeId);
        else checkedStoreIds.add(storeId);
        persistStorePreferencesFromUi();
        syncStoreRowVisualState(li, storeId);
      });

      li.addEventListener('pointerdown', (event) => {
        if (isStoreRowDragExcludedTarget(event, li)) return;
        startStoreDrag(event, store.id);
      });

      li.addEventListener('click', (event) => {
        const wantsDelete = event.ctrlKey || event.metaKey;
        const plannerSelectMode = isStorePlannerSelectMode();
        if (wantsDelete && !plannerSelectMode) {
          event.preventDefault();
          event.stopPropagation();
          const label = storeLabel || 'Store';
          void (async () => {
            const ok = await deleteStoreDeep(Number(store.id), label);
            if (ok) window.location.reload();
          })();
          return;
        }

        if (plannerSelectMode) {
          return;
        }

        // Open editor
        sessionStorage.setItem('selectedStoreId', String(store.id));
        sessionStorage.setItem('selectedStoreChain', store.chain || '');
        sessionStorage.setItem('selectedStoreLocation', store.location || '');
        sessionStorage.removeItem('selectedStoreIsNew');
        window.location.href =
          favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
      });

      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (isStorePlannerSelectMode()) {
          return;
        }
        const label = storeLabel || 'Store';
        void (async () => {
          const ok = await deleteStoreDeep(Number(store.id), label);
          if (ok) window.location.reload();
        })();
      });

      window.favoriteEatsBindLongPressRemove?.(
        li,
        () => {
          finishActiveStoreDrag({ suppressClick: true });
          if (isStorePlannerSelectMode()) return;
          const label = storeLabel || 'Store';
          void (async () => {
            const ok = await deleteStoreDeep(Number(store.id), label);
            if (ok) window.location.reload();
          })();
        },
        {
          shouldIgnore: (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return true;
            return !!target.closest(
              '.shopping-list-row-handle, .shopping-list-row-icon, input, textarea, button, select, label',
            );
          },
        },
      );

      list.appendChild(li);
    });

    syncActiveStoreDragVisualState();

    // Keep selection valid after rerender (search/filter changes).
    const selectedStoreId = Number(options?.selectedStoreId);
    if (
      Number.isFinite(selectedStoreId) &&
      selectedStoreId > 0 &&
      typeof listNav?.setSelectedIdx === 'function'
    ) {
      const nextSelectedIdx = items.findIndex(
        (store) => Number(store?.id) === selectedStoreId,
      );
      if (nextSelectedIdx >= 0) {
        listNav.setSelectedIdx(nextSelectedIdx);
        return;
      }
      if (options?.clearSelectionWhenMissing) {
        listNav.setSelectedIdx(-1, { source: null });
        return;
      }
    }
    listNav?.syncAfterRender?.();
  }

  const getSelectedVisibleStoreId = () => {
    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    const visibleRows = getFilteredStoreRows();
    if (
      !Number.isFinite(selectedIdx) ||
      selectedIdx < 0 ||
      selectedIdx >= visibleRows.length
    ) {
      return null;
    }
    const storeId = Number(visibleRows[selectedIdx]?.id);
    return Number.isFinite(storeId) && storeId > 0 ? storeId : null;
  };

  const rerenderFilteredStores = (options = {}) => {
    syncStoresUiFromShoppingPlan();
    const nextOptions = { ...options };
    const requestedStoreId = Number(nextOptions?.selectedStoreId);
    const shouldPreserveById =
      !!nextOptions?.preserveSelectionById &&
      (!Number.isFinite(requestedStoreId) || requestedStoreId <= 0);
    if (shouldPreserveById) {
      const selectedStoreId = getSelectedVisibleStoreId();
      if (selectedStoreId) nextOptions.selectedStoreId = selectedStoreId;
    }
    renderStoresList(getFilteredStoreRows(), nextOptions);
    syncStoresResetButtonState();
  };

  list.addEventListener(
    'click',
    (event) => {
      if (Date.now() > suppressStoreListClickUntil) return;
      suppressStoreListClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  let isOpeningStoreDialog = false;
  const normalizeStoreField = (value) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
  const openCreateStoreDialog = async () => {
    if (isOpeningStoreDialog) return;
    if (!window.ui) {
      uiToast('UI not ready yet.');
      return;
    }
    isOpeningStoreDialog = true;
    if (addBtn instanceof HTMLButtonElement) {
      addBtn.disabled = true;
      addBtn.setAttribute('aria-disabled', 'true');
    }
    try {
      const vals = await window.ui.form({
        title: 'New store',
        fields: [
          {
            key: 'chain',
            label: 'Name',
            value: '',
            required: true,
            normalize: normalizeStoreField,
            validate: (value) =>
              isReservedShoppingListStoreName(value)
                ? SHOPPING_RESERVED_STORE_NAME_ERROR
                : '',
          },
          {
            key: 'location',
            label: 'Location (optional)',
            value: '',
            required: false,
            normalize: normalizeStoreField,
          },
        ],
        confirmText: 'Create',
        cancelText: 'Cancel',
        validate: (values) => {
          if (!normalizeStoreField(values?.chain)) return 'Chain is required.';
          return '';
        },
      });
      if (!vals) return;

      const chain = normalizeStoreField(vals.chain);
      const location = normalizeStoreField(vals.location);
      if (!chain) return;

      let newStoreId = null;
      try {
        const created = await window.dataService.createStore({
          chain,
          location,
        });
        newStoreId = Number(created?.id);
        if (!Number.isFinite(newStoreId) || newStoreId <= 0) {
          uiToast('Failed to create store. See console for details.');
          return;
        }
      } catch (err) {
        console.error('❌ Failed to create store:', err);
        uiToast('Failed to create store. See console for details.');
        return;
      }

      sessionStorage.setItem('selectedStoreId', String(newStoreId));
      sessionStorage.removeItem('selectedStoreIsNew');
      sessionStorage.setItem('selectedStoreChain', chain);
      sessionStorage.setItem('selectedStoreLocation', location);
      window.location.href =
        favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
    } finally {
      isOpeningStoreDialog = false;
      syncStoresResetButtonState();
    }
  };

  const moveSelectedStoreRow = (delta) => {
    const items = getFilteredStoreRows();
    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    if (
      !Number.isFinite(selectedIdx) ||
      selectedIdx < 0 ||
      selectedIdx >= items.length
    ) {
      return false;
    }
    const targetIdx = selectedIdx + Number(delta || 0);
    if (targetIdx < 0 || targetIdx >= items.length) return false;
    const selectedStore = items[selectedIdx];
    const targetStore = items[targetIdx];
    if (!selectedStore || !targetStore) return false;
    return swapStoreRowsById(selectedStore.id, targetStore.id);
  };

  // Initial render
  rerenderFilteredStores();
  fePageLoadFoodIconFinish();

  consumeCmdVerticalArrowBeforeTopLevelNav = (e) => {
    if (!(e instanceof KeyboardEvent)) return false;
    if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
    if (e.isComposing) return false;
    if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
      return false;
    if (isModalOpen()) return false;
    if (document.activeElement?.closest?.('.bottom-nav')) return false;

    const selectedIdx = Number(listNav?.getSelectedIdx?.() ?? -1);
    if (!Number.isFinite(selectedIdx) || selectedIdx < 0) return false;

    const visibleRows = getFilteredStoreRows();
    const selectedStore = visibleRows[selectedIdx];
    if (!selectedStore) return false;

    e.preventDefault();
    e.stopPropagation();
    const moved = moveSelectedStoreRow(e.key === 'ArrowDown' ? 1 : -1);
    if (moved) rerenderFilteredStores({ selectedStoreId: selectedStore.id });
    return true;
  };

  const onStoresActionClick = () => {
    if (isStorePlannerSelectMode()) {
      if (!canResetStoreSelections()) return;
      storeRows = defaultStoreRows.slice();
      checkedStoreIds.clear();
      updateShoppingPlan((plan) => {
        plan.storeOrder = [];
        plan.selectedStoreIds = [];
      });
      listNav?.setSelectedIdx?.(-1, { source: null });
      rerenderFilteredStores({ clearSelectionWhenMissing: true });
    } else {
      void openCreateStoreDialog();
    }
  };
  const syncStoresAppBarActionChrome = () => {
    if (!addBtn) return;
    if (isStorePlannerSelectMode()) {
      ensureAppBarTextActionPair(addBtn, 'Reset', 'cancel');
    } else {
      ensureAppBarTextActionPair(addBtn, 'Add', 'add');
    }
    syncStoresResetButtonState();
  };
  if (addBtn) {
    syncStoresAppBarActionChrome();
    addBtn.addEventListener('click', onStoresActionClick);
    window.addEventListener(FAVORITE_EATS_PLANNER_MODE_EVENT, () => {
      if (!document.body.classList.contains('stores-page')) return;
      syncStoresAppBarActionChrome();
      rerenderFilteredStores();
    });
  }

  const unregisterCatalogStores =
    registerFavoriteEatsCatalogReferenceUiRefreshHook(async () => {
      try {
        window.dataService.useSupabase = true;
        const rows = await window.dataService.listStores();
        storeRows = Array.isArray(rows) ? rows.slice() : [];
        storeRows = orderStoreRowsFromPlan(storeRows);
        syncStoresUiFromShoppingPlan();
        rerenderFilteredStores({ clearSelectionWhenMissing: true });
        syncStoresResetButtonState();
      } catch (err) {
        console.warn('catalog reference refresh (stores) failed:', err);
      }
    });
  window.addEventListener('pagehide', unregisterCatalogStores, { once: true });

  registerFavoriteEatsRemotePlanUiRefreshHook(() => {
    // hydrateShoppingStateFromDataService (caller) already refreshed plan cache;
    // rebuild checked ids + row order from authoritative plan before redraw.
    syncStoresUiFromShoppingPlan();
    rerenderFilteredStores({ clearSelectionWhenMissing: true });
  });
  window.addEventListener(
    'pagehide',
    () => {
      teardownFavoriteEatsShoppingPlanRealtime();
    },
    { once: true },
  );
}

function loadStoreEditorPage() {
  fePageLoadFoodIconBegin('store-editor');
  const view = document.getElementById('pageContent');

  if (!view) {
    console.warn('No #pageContent found; skipping store-editor wiring.');
    fePageLoadFoodIconFail();
    return;
  }

  void (async () => {
    const isNew = sessionStorage.getItem('selectedStoreIsNew') === '1';
    const idStr = sessionStorage.getItem('selectedStoreId');
    const storeId = Number(idStr);
    const hasPersistedStore = Number.isFinite(storeId) && storeId > 0;

    let chain = sessionStorage.getItem('selectedStoreChain') || '';
    let locationName = sessionStorage.getItem('selectedStoreLocation') || '';
    /** @type {{ id: number, name: string }[]} */
    let aisleRows = [];
    /** @type {Map<number, string[]>} */
    let aisleItemsByAisle = new Map();
    /** @type {Map<number, Array<any>>} */
    let aisleItemSpecsByAisle = new Map();
    /** @type {Set<number>} */
    let deletedAisleIds = new Set();
    let nextTempAisleId = -1;
    let draftSnapshot = null;
    let refreshDirty = () => {};
    let ingredientCatalog = { byName: new Map(), hasVariantAisleTable: false };
    /** @type {Map<string, object>} */
    let storeCatalogLabelIndex = new Map();
    let activeVariantPicker = null;

    const getStoreAisleDisplayNameForSpec = (spec) => {
      const baseName = String(spec?.baseName || '').trim();
      if (!baseName) return '';
      const known =
        typeof window.resolveShoppingCatalogItemByLabel === 'function'
          ? window.resolveShoppingCatalogItemByLabel(
              ingredientCatalog?.byName,
              storeCatalogLabelIndex,
              baseName,
            )
          : ingredientCatalog?.byName?.get?.(normItemKey(baseName)) || null;
      if (
        known &&
        typeof window.getShoppingCatalogItemDisplayName === 'function'
      ) {
        return (
          String(window.getShoppingCatalogItemDisplayName(known) || '').trim() ||
          baseName
        );
      }
      if (typeof window.getShoppingCatalogItemDisplayName === 'function') {
        return (
          String(
            window.getShoppingCatalogItemDisplayName({ name: baseName }) || '',
          ).trim() || baseName
        );
      }
      return baseName;
    };

    const resolveStoreCatalogItemForTypedBase = (typedBase) => {
      if (typeof window.resolveShoppingCatalogItemByLabel !== 'function') {
        return ingredientCatalog?.byName?.get?.(normItemKey(typedBase)) || null;
      }
      return (
        window.resolveShoppingCatalogItemByLabel(
          ingredientCatalog?.byName,
          storeCatalogLabelIndex,
          typedBase,
        ) || null
      );
    };

    const normItemKey = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();

    const parseUniqueItemLines = (raw) => {
      const seen = new Set();
      const out = [];
      for (const line of String(raw || '').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const k = normItemKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    };

    const normVariantKey = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();
    const splitLineIntoBaseAndParen = (line) => {
      const t = String(line || '').trim();
      if (!t) return null;
      const m = t.match(/^(.*?)\s*\((.*)\)\s*$/);
      if (!m) return { baseName: t, inside: '', hasParen: false };
      return {
        baseName: String(m[1] || '').trim(),
        inside: String(m[2] || ''),
        hasParen: true,
      };
    };
    const splitLineIntoBaseAndParenLoose = (line) => {
      const strict = splitLineIntoBaseAndParen(line);
      if (strict && strict.hasParen) return strict;
      const t = String(line || '').trim();
      if (!t) return null;
      const openIdx = t.indexOf('(');
      if (openIdx < 0) return strict;
      const baseName = String(t.slice(0, openIdx) || '').trim();
      if (!baseName) return strict;
      let inside = String(t.slice(openIdx + 1) || '').trim();
      if (inside.endsWith(')')) inside = inside.slice(0, -1).trim();
      return { baseName, inside, hasParen: true };
    };
    const STORE_AISLE_ANY_VARIANT_TOKEN = 'any';
    const STORE_AISLE_ALL_VARIANT_TOKEN = 'all';
    const isStoreAisleAnyVariantToken = (name) =>
      normVariantKey(String(name || '')) === STORE_AISLE_ANY_VARIANT_TOKEN;
    const isStoreAisleAllVariantToken = (name) =>
      normVariantKey(String(name || '')) === STORE_AISLE_ALL_VARIANT_TOKEN;
    const isStoreAisleReservedVariantToken = (name) =>
      isStoreAisleAnyVariantToken(name) || isStoreAisleAllVariantToken(name);
    const storeAisleHasActiveNamedCatalogVariants = (catalogVariants) =>
      (Array.isArray(catalogVariants) ? catalogVariants : []).some((variant) => {
        const name = String(variant?.name ?? variant ?? '').trim();
        if (!name || variant?.isDeprecated) return false;
        if (isStoreAisleReservedVariantToken(name)) return false;
        if (isReservedIngredientVariantName(name)) return false;
        return /[a-z0-9]/i.test(name);
      });
    const isSupportedVariantName = (s) => {
      const t = String(s || '').trim();
      if (!t) return false;
      if (/[()]/.test(t)) return false;
      if (isStoreAisleReservedVariantToken(t)) return true;
      if (isReservedIngredientVariantName(t)) return false;
      return /[a-z0-9]/i.test(t);
    };
    const finalizeStoreAisleSelectedVariants = (
      selected,
      dbOrdered = [],
      catalogVariants = null,
    ) => {
      const source = Array.isArray(selected) ? selected : [];
      const hasActiveNamed = storeAisleHasActiveNamedCatalogVariants(
        catalogVariants ??
          (Array.isArray(dbOrdered)
            ? dbOrdered.map((name) => ({ name }))
            : []),
      );
      const named = source.filter((v) => !isStoreAisleReservedVariantToken(v));
      const orderedNames = Array.isArray(dbOrdered)
        ? dbOrdered.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      const dbKeys = new Set(orderedNames.map((v) => normVariantKey(v)));
      const extras = named.filter((v) => !dbKeys.has(normVariantKey(v)));
      const wanted = new Set(named.map((v) => normVariantKey(v)));
      const ordered = [];
      orderedNames.forEach((name) => {
        if (wanted.has(normVariantKey(name))) ordered.push(name);
      });
      extras.forEach((name) => {
        if (!ordered.some((v) => normVariantKey(v) === normVariantKey(name))) {
          ordered.push(name);
        }
      });
      if (!hasActiveNamed) {
        return ordered;
      }
      if (source.some(isStoreAisleAllVariantToken)) {
        return [STORE_AISLE_ALL_VARIANT_TOKEN];
      }
      const anyTokens = source.filter(isStoreAisleAnyVariantToken);
      return anyTokens.length
        ? [STORE_AISLE_ANY_VARIANT_TOKEN, ...ordered]
        : ordered;
    };
    const compareStoreAisleItemSpecs = (a, b) => {
      const nameDelta = String(a?.baseName || '').localeCompare(
        String(b?.baseName || ''),
        undefined,
        { sensitivity: 'base' },
      );
      if (nameDelta !== 0) return nameDelta;
      const aId = Number(a?.ingredientId) || 0;
      const bId = Number(b?.ingredientId) || 0;
      if (aId !== bId) return aId - bId;
      return String(a?.baseKey || '').localeCompare(
        String(b?.baseKey || ''),
        undefined,
        { sensitivity: 'base' },
      );
    };
    const sortStoreAisleItemSpecsList = (specs) => {
      (Array.isArray(specs) ? specs : []).sort(compareStoreAisleItemSpecs);
      return specs;
    };
    const parseVariantNames = (insideRaw) => {
      const inside = String(insideRaw || '').trim();
      if (!inside) return [];
      const out = [];
      const seen = new Set();
      const tokens = inside.split(',').map((s) => String(s || '').trim());
      for (const tok of tokens) {
        if (!isSupportedVariantName(tok)) continue;
        const k = normVariantKey(tok);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(tok);
      }
      if (out.some(isStoreAisleAllVariantToken)) {
        return [STORE_AISLE_ALL_VARIANT_TOKEN];
      }
      const namedOnly = out.filter((tok) => !isStoreAisleReservedVariantToken(tok));
      if (!namedOnly.length && out.some(isStoreAisleAnyVariantToken)) {
        return [];
      }
      return out;
    };
    const collapseVariantSummary = (baseName, selectedNames) => {
      const base = String(baseName || '').trim();
      const names = Array.isArray(selectedNames)
        ? selectedNames.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (!names.length) return base;
      const maxInsideChars = 45;
      const ellipsize = (s, max) => {
        const t = String(s || '');
        if (t.length <= max) return t;
        if (max <= 1) return '…';
        return `${t.slice(0, max - 1)}…`;
      };
      const fullInside = names.join(', ');
      if (fullInside.length <= maxInsideChars) return `${base} (${fullInside})`;

      const parts = [];
      for (let i = 0; i < names.length; i++) {
        const remaining = names.length - (i + 1);
        const suffix =
          remaining > 0
            ? `, + ${remaining} other${remaining === 1 ? '' : 's'}`
            : '';
        const candidateParts = [...parts, names[i]];
        const candidateInside = `${candidateParts.join(', ')}${suffix}`;
        if (candidateInside.length <= maxInsideChars) {
          parts.push(names[i]);
          continue;
        }
        if (!parts.length) {
          // Ensure at least one variant token is visible before the suffix.
          const roomForFirst = Math.max(1, maxInsideChars - suffix.length);
          parts.push(ellipsize(names[i], roomForFirst));
        }
        break;
      }
      const remaining = Math.max(0, names.length - parts.length);
      const suffix =
        remaining > 0
          ? `, + ${remaining} other${remaining === 1 ? '' : 's'}`
          : '';
      const inside = `${parts.join(', ')}${suffix}`;
      return `${base} (${inside})`;
    };
    const cloneSpecs = (specs) =>
      (Array.isArray(specs) ? specs : []).map((s) => ({
        baseName: s.baseName || '',
        baseKey: s.baseKey || '',
        ingredientId: Number.isFinite(Number(s.ingredientId))
          ? Number(s.ingredientId)
          : null,
        selectedVariants: Array.isArray(s.selectedVariants)
          ? [...s.selectedVariants]
          : [],
        knownVariants: Array.isArray(s.knownVariants)
          ? s.knownVariants.map((v) => ({
              id: Number.isFinite(Number(v?.id)) ? Number(v.id) : null,
              name: String(v?.name || ''),
              isDeprecated: !!v?.isDeprecated,
            }))
          : [],
      }));
    const specsToDisplayLines = (specs, opts = {}) => {
      const pickerKey = String(opts.pickerBaseKey || '')
        .trim()
        .toLowerCase();
      const expandAll = opts.expandAll === true;
      return (Array.isArray(specs) ? specs : []).map((spec) => {
        if (pickerKey && spec.baseKey === pickerKey) return spec.baseName || '';
        const displayBase = getStoreAisleDisplayNameForSpec(spec);
        if (expandAll) {
          const variants = Array.isArray(spec.selectedVariants)
            ? spec.selectedVariants
                .map((v) => String(v || '').trim())
                .filter(Boolean)
            : [];
          return variants.length
            ? `${displayBase} (${variants.join(', ')})`
            : displayBase;
        }
        return collapseVariantSummary(
          displayBase,
          spec.selectedVariants,
        );
      });
    };
    const syncDisplayLinesFromSpecs = (aid, opts = {}) => {
      const specs = Array.isArray(aisleItemSpecsByAisle.get(aid))
        ? aisleItemSpecsByAisle.get(aid)
        : [];
      aisleItemsByAisle.set(aid, specsToDisplayLines(specs, opts));
    };
    const syncStoreAisleDeprecatedFieldClassForField = (aid, itemsFieldEl) => {
      if (!(itemsFieldEl instanceof HTMLElement)) return;
      const specs = aisleItemSpecsByAisle.get(aid) || [];
      let bad = false;
      for (const spec of specs) {
        const known = ingredientCatalog?.byName?.get?.(spec.baseKey) || null;
        if (!known?.variants?.length) continue;
        const depKeys = new Set(
          known.variants
            .filter((vv) => vv.isDeprecated)
            .map((vv) => normVariantKey(String(vv.name || ''))),
        );
        for (const sv of spec.selectedVariants || []) {
          if (depKeys.has(normVariantKey(String(sv || '')))) {
            bad = true;
            break;
          }
        }
        if (bad) break;
      }
      itemsFieldEl.classList.toggle(
        'store-aisle-items-field--has-deprecated-variant',
        bad,
      );
    };
    const setAisleTextareaRawDraft = (textarea, value) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.__feStoreRawDraftValue = String(value == null ? '' : value);
    };
    const getAisleTextareaRawDraft = (textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return '';
      if (typeof textarea.__feStoreRawDraftValue === 'string') {
        return textarea.__feStoreRawDraftValue;
      }
      return String(textarea.value || '');
    };
    const parseSpecsFromRaw = (raw, prevSpecs, catalog) => {
      const prevByKey = new Map();
      (Array.isArray(prevSpecs) ? prevSpecs : []).forEach((s) => {
        if (s?.baseKey) prevByKey.set(s.baseKey, s);
      });
      const out = [];
      const seenBase = new Set();
      for (const line of String(raw || '').split('\n')) {
        const parsed = splitLineIntoBaseAndParenLoose(line);
        if (!parsed) continue;
        const typedBase = String(parsed.baseName || '').trim();
        if (!typedBase) continue;
        const known = resolveStoreCatalogItemForTypedBase(typedBase);
        const baseName = known
          ? String(known.name || typedBase).trim()
          : typedBase;
        const baseKey = normItemKey(baseName);
        if (!baseKey || seenBase.has(baseKey)) continue;
        seenBase.add(baseKey);
        const prev = prevByKey.get(baseKey) || null;
        let selected = [];
        const inside = String(parsed.inside || '');
        const looksCollapsed = /\+\s*\d+\s+others?/i.test(inside);
        if (parsed.hasParen) {
          if (looksCollapsed && prev && Array.isArray(prev.selectedVariants)) {
            selected = [...prev.selectedVariants];
          } else {
            selected = parseVariantNames(inside);
          }
        }
        // Collapsed lines reuse prev.selectedVariants; drop soft-deprecated variants
        // that no longer appear as explicit variant tokens in the edited line.
        if (known && Array.isArray(known.variants) && selected.length) {
          const depKeys = new Set(
            known.variants
              .filter((v) => v.isDeprecated)
              .map((v) => normVariantKey(String(v?.name || '').trim())),
          );
          if (depKeys.size) {
            const explicitVariantKeys = new Set(
              parseVariantNames(inside).map((name) => normVariantKey(name)),
            );
            selected = selected.filter((sv) => {
              const k = normVariantKey(sv);
              if (!depKeys.has(k)) return true;
              return explicitVariantKeys.has(k);
            });
          }
        }
        if (known && Array.isArray(known.variants)) {
          const dbOrdered = known.variants.map((v) =>
            String(v?.name || '').trim(),
          );
          selected = finalizeStoreAisleSelectedVariants(
            selected,
            dbOrdered,
            known.variants,
          );
        } else {
          selected = finalizeStoreAisleSelectedVariants(
            selected.filter(isSupportedVariantName),
          );
        }
        out.push({
          baseName,
          baseKey,
          ingredientId:
            known && Number.isFinite(Number(known.ingredientId))
              ? Number(known.ingredientId)
              : null,
          selectedVariants: selected,
          knownVariants:
            known && Array.isArray(known.variants)
              ? known.variants.map((v) => ({
                  id: Number(v.id),
                  name: v.name,
                  isDeprecated: !!v.isDeprecated,
                }))
              : [],
        });
      }
      return out;
    };
    const normalizeSpecsWithCatalog = (specs, catalog) => {
      const out = [];
      const seenBase = new Set();
      for (const spec of Array.isArray(specs) ? specs : []) {
        const baseName = String(spec?.baseName || '').trim();
        if (!baseName) continue;
        const baseKey = normItemKey(baseName);
        if (!baseKey || seenBase.has(baseKey)) continue;
        seenBase.add(baseKey);
        const known = catalog?.byName?.get?.(baseKey) || null;
        let selected = Array.isArray(spec?.selectedVariants)
          ? spec.selectedVariants
              .map((v) => String(v || '').trim())
              .filter(isSupportedVariantName)
          : [];
        if (known && Array.isArray(known.variants)) {
          const dbOrdered = known.variants.map((v) =>
            String(v?.name || '').trim(),
          );
          selected = finalizeStoreAisleSelectedVariants(
            selected,
            dbOrdered,
            known.variants,
          );
        } else {
          selected = finalizeStoreAisleSelectedVariants(selected);
        }
        out.push({
          baseName,
          baseKey,
          ingredientId:
            known && Number.isFinite(Number(known.ingredientId))
              ? Number(known.ingredientId)
              : Number.isFinite(Number(spec?.ingredientId))
                ? Number(spec.ingredientId)
                : null,
          selectedVariants: selected,
          knownVariants:
            known && Array.isArray(known.variants)
              ? known.variants.map((v) => ({
                  id: Number(v.id),
                  name: v.name,
                  isDeprecated: !!v.isDeprecated,
                }))
              : Array.isArray(spec?.knownVariants)
                ? spec.knownVariants.map((v) => ({
                    id: Number.isFinite(Number(v?.id)) ? Number(v.id) : null,
                    name: String(v?.name || ''),
                    isDeprecated: !!v?.isDeprecated,
                  }))
                : [],
        });
      }
      return out;
    };

    const cloneDraftSnapshot = () => ({
      aisleRows: aisleRows.map((r) => ({ id: r.id, name: r.name })),
      items: Object.fromEntries(
        [...aisleItemsByAisle.entries()].map(([k, v]) => [String(k), [...v]]),
      ),
      specs: Object.fromEntries(
        [...aisleItemSpecsByAisle.entries()].map(([k, v]) => [
          String(k),
          cloneSpecs(v),
        ]),
      ),
      deletedIds: [...deletedAisleIds],
    });
    const restoreDraftFromSnapshot = (snap) => {
      if (!snap) return;
      aisleRows = snap.aisleRows.map((r) => ({ id: r.id, name: r.name }));
      aisleItemsByAisle = new Map();
      for (const [ks, v] of Object.entries(snap.items || {})) {
        const n = Number(ks);
        aisleItemsByAisle.set(Number.isFinite(n) ? n : ks, [...v]);
      }
      aisleItemSpecsByAisle = new Map();
      for (const [ks, v] of Object.entries(snap.specs || {})) {
        const n = Number(ks);
        aisleItemSpecsByAisle.set(Number.isFinite(n) ? n : ks, cloneSpecs(v));
      }
      deletedAisleIds = new Set(snap.deletedIds || []);
    };
    const itemsListEqual = (a, b) => {
      const pa = parseUniqueItemLines((a || []).join('\n'));
      const pb = parseUniqueItemLines((b || []).join('\n'));
      if (pa.length !== pb.length) return false;
      for (let i = 0; i < pa.length; i++) {
        if (normItemKey(pa[i]) !== normItemKey(pb[i])) return false;
      }
      return true;
    };
    const specsEqual = (a, b) => {
      const aa = Array.isArray(a) ? a : [];
      const bb = Array.isArray(b) ? b : [];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i++) {
        const sa = aa[i] || {};
        const sb = bb[i] || {};
        if (normItemKey(sa.baseName) !== normItemKey(sb.baseName)) return false;
        if (
          (sa.selectedVariants || []).length !==
          (sb.selectedVariants || []).length
        )
          return false;
        for (let j = 0; j < (sa.selectedVariants || []).length; j++) {
          if (
            normVariantKey(sa.selectedVariants[j]) !==
            normVariantKey((sb.selectedVariants || [])[j])
          )
            return false;
        }
      }
      return true;
    };
    const aislesDraftDirty = () => {
      if (!draftSnapshot) return false;
      const sd = draftSnapshot.deletedIds || [];
      if (deletedAisleIds.size !== sd.length) return true;
      for (const id of deletedAisleIds) if (!sd.includes(id)) return true;
      for (const id of sd) if (!deletedAisleIds.has(id)) return true;
      if (aisleRows.length !== draftSnapshot.aisleRows.length) return true;
      for (let i = 0; i < aisleRows.length; i++) {
        if (aisleRows[i]?.id !== draftSnapshot.aisleRows[i]?.id) return true;
      }
      const snapRows = new Map(draftSnapshot.aisleRows.map((r) => [r.id, r]));
      for (const r of aisleRows) {
        const s = snapRows.get(r.id);
        if (!s) return true;
        if ((r.name || '') !== (s.name || '')) return true;
        const cur = aisleItemsByAisle.get(r.id) || [];
        const snapItems = draftSnapshot.items[String(r.id)] || [];
        if (!itemsListEqual(cur, snapItems)) return true;
        const curSpecs = aisleItemSpecsByAisle.get(r.id) || [];
        const snapSpecs = draftSnapshot.specs?.[String(r.id)] || [];
        if (!specsEqual(curSpecs, snapSpecs)) return true;
      }
      for (const id of snapRows.keys()) {
        if (!aisleRows.some((row) => row.id === id)) return true;
      }
      return false;
    };

    const prepareStoreEditorReadAdapter = async () => {
      if (
        !window.dataService ||
        typeof window.dataService.loadStoreDetail !== 'function'
      ) {
        return null;
      }
      window.dataService.useSupabase = true;
      console.info('[dataService] using Supabase adapter');
      return null;
    };

    const applyStoreDetailFromDataService = (detail) => {
      if (!detail || typeof detail !== 'object') return false;
      chain = String(detail.chain || '');
      locationName = String(detail.location || '');

      const catalogByName = new Map();
      (Array.isArray(detail.ingredientCatalog)
        ? detail.ingredientCatalog
        : []
      ).forEach((item) => {
        const name = String(item?.name || '').trim();
        const key = normItemKey(item?.baseKey || name);
        const ingredientId = Number(item?.ingredientId);
        if (!key || catalogByName.has(key)) return;
        catalogByName.set(key, {
          ingredientId: Number.isFinite(ingredientId) ? ingredientId : null,
          name,
          baseKey: key,
          lemma: String(item?.lemma || '').trim(),
          singularIfUnspecified: !!item?.singularIfUnspecified,
          isMassNoun: !!item?.isMassNoun,
          pluralOverride: String(item?.pluralOverride || '').trim(),
          variants: Array.isArray(item?.variants)
            ? item.variants.map((variant) => ({
                id: Number.isFinite(Number(variant?.id))
                  ? Number(variant.id)
                  : null,
                name: String(variant?.name || ''),
                isDeprecated: Boolean(variant?.isDeprecated),
              }))
            : [],
        });
      });
      storeCatalogLabelIndex =
        typeof window.buildShoppingCatalogLabelIndex === 'function'
          ? window.buildShoppingCatalogLabelIndex(catalogByName)
          : new Map();
      ingredientCatalog = {
        byName: catalogByName,
        hasVariantAisleTable: detail.hasVariantAisleTable === true,
      };

      aisleRows = (Array.isArray(detail.aisles) ? detail.aisles : [])
        .map((aisle) => ({
          id: Number(aisle?.id),
          name: String(aisle?.name || ''),
          itemSpecs: Array.isArray(aisle?.itemSpecs) ? aisle.itemSpecs : [],
        }))
        .filter((aisle) => Number.isFinite(aisle.id));
      aisleItemsByAisle = new Map();
      aisleItemSpecsByAisle = new Map();
      aisleRows.forEach((aisle) => {
        const specs = normalizeSpecsWithCatalog(
          aisle.itemSpecs,
          ingredientCatalog,
        );
        aisleItemSpecsByAisle.set(aisle.id, specs);
        syncDisplayLinesFromSpecs(aisle.id);
      });
      return true;
    };

    if (hasPersistedStore) {
      try {
        if (
          window.dataService &&
          typeof window.dataService.loadStoreDetail === 'function'
        ) {
          try {
            await prepareStoreEditorReadAdapter();
            const detail = await window.dataService.loadStoreDetail({
              storeId,
            });
            applyStoreDetailFromDataService(detail);
          } catch (err) {
            if (favoriteEatsShouldUseSupabaseDataDoor()) {
              favoriteEatsReportSupabasePrefetchFailure('loadStoreDetail', err);
              fePageLoadFoodIconFail();
              return;
            }
            console.error('dataService.loadStoreDetail failed:', err);
          }
        }
      } catch (err) {
        console.warn('Store editor: failed to load store/aisles', err);
      }
    }

    if (hasPersistedStore) draftSnapshot = cloneDraftSnapshot();

    const titleText = chain ? chain : isNew ? 'New store' : 'Store';
    const locTrim = (locationName || '').trim();
    const storeLocationBlock = locTrim
      ? `<div id="storeLocationSubtitle" class="unit-abbreviation-line"></div>`
      : `<div id="storeLocationSubtitle" class="unit-abbreviation-line" style="display:none" aria-hidden="true"></div>`;

    initAppBar({ mode: 'editor', titleText, showSearch: hasPersistedStore });

    const aislesBlock = hasPersistedStore
      ? `
    <h2
      id="storeAislesSectionLabel"
      class="section-header store-aisles-section-label"
    >
      Aisles
    </h2>
    <div id="storeAislesList" class="store-aisles-list" aria-label="Store aisles"></div>
    <div id="storeAddAisleCtaEmpty" class="store-add-aisle-cta" role="button" tabindex="0">
      <span class="placeholder-prompt">Add an aisle</span>
    </div>`
      : '';

    view.innerHTML = `
    <h1 id="childEditorTitle" class="recipe-title">${titleText || ''}</h1>
    ${storeLocationBlock}
    ${aislesBlock}
  `;

    const STORE_AISLE_SLOT_CLASS = 'store-aisle-slot';
    const STORE_AISLE_HINT_ACTIVE_CLASS = 'store-aisle-slot--hint-active';
    const STORE_AISLE_CARD_SELECTED_CLASS = 'store-aisle-card--selected';
    const STORE_MASTER_LINK_MODE_CLASS = 'store-master-link-mode';
    let selectedStoreAisleId = null;

    const syncStoreAisleCardSelection = (nextId = selectedStoreAisleId) => {
      const list = document.getElementById('storeAislesList');
      if (!list) return;
      let resolvedId = nextId;
      if (
        resolvedId != null &&
        !aisleRows.some((row) => row.id === resolvedId)
      ) {
        resolvedId = null;
      }
      selectedStoreAisleId = resolvedId;
      list.querySelectorAll('.store-aisle-card').forEach((cardEl) => {
        const aid = Number(cardEl.dataset.aisleId);
        const isSelected =
          selectedStoreAisleId != null &&
          Number.isFinite(aid) &&
          aid === selectedStoreAisleId;
        cardEl.classList.toggle(STORE_AISLE_CARD_SELECTED_CLASS, isSelected);
        const controls = cardEl.querySelector('.store-aisle-move-controls');
        if (controls) {
          controls.hidden = !isSelected;
          controls.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
        }
      });
    };

    const selectStoreAisle = (aisleId) => {
      syncStoreAisleCardSelection(aisleId ?? null);
    };

    let hoverModifierActive = false;
    const desktopHoverEnabled = (() => {
      try {
        return Boolean(
          window.matchMedia &&
          window.matchMedia('(hover: hover) and (pointer: fine)').matches,
        );
      } catch (_) {
        return false;
      }
    })();

    const syncStoreMasterLinkModeClass = () => {
      try {
        document.body.classList.toggle(
          STORE_MASTER_LINK_MODE_CLASS,
          hoverModifierActive,
        );
      } catch (_) {}
    };

    const syncActiveAisleHintClass = (targetSlot = null) => {
      try {
        const list = document.getElementById('storeAislesList');
        if (!list) return;
        list
          .querySelectorAll(`.${STORE_AISLE_HINT_ACTIVE_CLASS}`)
          .forEach((el) => el.classList.remove(STORE_AISLE_HINT_ACTIVE_CLASS));
        if (
          targetSlot &&
          targetSlot.classList &&
          targetSlot.classList.contains(STORE_AISLE_SLOT_CLASS)
        ) {
          targetSlot.classList.add(STORE_AISLE_HINT_ACTIVE_CLASS);
        }
      } catch (_) {}
    };

    const getTextareaLineBoundsAtCaret = (textarea, caretPos) => {
      const value = String(textarea && textarea.value ? textarea.value : '');
      const pos =
        caretPos != null && Number.isFinite(caretPos)
          ? Number(caretPos)
          : Number(
              textarea && textarea.selectionStart != null
                ? textarea.selectionStart
                : 0,
            );
      const prevNl = value.lastIndexOf('\n', Math.max(0, pos - 1));
      const lineStart = prevNl === -1 ? 0 : prevNl + 1;
      const nextNl = value.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? value.length : nextNl;
      return { lineStart, lineEnd };
    };

    const getTextareaLineTextAtCaret = (textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return '';
      const caretPos = Number(textarea.selectionStart ?? 0);
      const { lineStart, lineEnd } = getTextareaLineBoundsAtCaret(
        textarea,
        caretPos,
      );
      return String(textarea.value || '').slice(lineStart, lineEnd);
    };

    const getShoppingMatchByName = async (rawName) => {
      const name = String(rawName || '').trim();
      if (!name) return null;

      if (
        favoriteEatsShouldUseSupabaseDataDoor() &&
        window.dataService &&
        typeof window.dataService.lookupShoppingItemByName === 'function'
      ) {
        window.dataService.useSupabase = true;
        try {
          return (
            (await window.dataService.lookupShoppingItemByName({ name })) ||
            null
          );
        } catch (err) {
          console.error('dataService.lookupShoppingItemByName failed:', err);
          return null;
        }
      }

      return null;
    };

    const extractMasterNameFromAisleLine = (rawLine) => {
      const line = String(rawLine || '').trim();
      if (!line) return '';
      try {
        const parsed = parseSpecsFromRaw(line, [], ingredientCatalog);
        if (Array.isArray(parsed) && parsed[0] && parsed[0].baseName) {
          return String(parsed[0].baseName).trim();
        }
      } catch (_) {}
      return line;
    };

    const navigateToShoppingMatch = (match) => {
      const normalizedId = Number(match && match.id);
      const normalizedName = String(
        match && match.name ? match.name : '',
      ).trim();
      if (
        !Number.isFinite(normalizedId) ||
        normalizedId <= 0 ||
        !normalizedName
      )
        return;
      sessionStorage.setItem('selectedShoppingItemId', String(normalizedId));
      sessionStorage.setItem('selectedShoppingItemName', normalizedName);
      sessionStorage.removeItem('selectedShoppingItemIsNew');
      window.location.href = favoriteEatsHrefWithCurrentAdapter(
        'shoppingEditor.html',
      );
    };

    const syncEmptyStateAisleCta = () => {
      const cta = document.getElementById('storeAddAisleCtaEmpty');
      if (!cta) return;
      cta.hidden = aisleRows.length > 0;
    };

    let storeEditorSearchQuery = '';
    /** @type {HTMLInputElement | null} */
    let storeEditorSearchInput = null;
    const normalizeStoreEditorSearchQuery = (value) =>
      String(value || '')
        .trim()
        .toLowerCase();
    const lineMatchesStoreEditorSearch = (line, query, spec = null) => {
      const q = normalizeStoreEditorSearchQuery(query);
      if (!q) return true;
      if (
        String(line || '')
          .toLowerCase()
          .includes(q)
      ) {
        return true;
      }
      if (!spec) return false;
      const base = String(spec?.baseName || '')
        .trim()
        .toLowerCase();
      if (base && base.includes(q)) return true;
      const lemma = String(
        resolveStoreCatalogItemForTypedBase(spec.baseName)?.lemma || '',
      )
        .trim()
        .toLowerCase();
      return !!(lemma && lemma.includes(q));
    };
    const getStoreEditorFilteredLineEntries = (aid, query) => {
      const q = normalizeStoreEditorSearchQuery(query);
      const lines = Array.isArray(aisleItemsByAisle.get(aid))
        ? aisleItemsByAisle.get(aid)
        : [];
      const specs = Array.isArray(aisleItemSpecsByAisle.get(aid))
        ? aisleItemSpecsByAisle.get(aid)
        : [];
      if (!q) {
        return lines.map((line, lineIndex) => ({ line, lineIndex }));
      }
      const entries = [];
      lines.forEach((line, lineIndex) => {
        if (lineMatchesStoreEditorSearch(line, q, specs[lineIndex] || null)) {
          entries.push({ line, lineIndex });
        }
      });
      return entries;
    };
    const getStoreEditorFilteredLines = (aid, query) =>
      getStoreEditorFilteredLineEntries(aid, query).map((entry) => entry.line);
    const aisleMatchesStoreEditorSearch = (aisleName, aid, query) => {
      const q = normalizeStoreEditorSearchQuery(query);
      if (!q) return true;
      if (
        String(aisleName || '')
          .toLowerCase()
          .includes(q)
      )
        return true;
      return getStoreEditorFilteredLines(aid, q).length > 0;
    };
    const applyStoreEditorSearch = (query = storeEditorSearchQuery) => {
      storeEditorSearchQuery = normalizeStoreEditorSearchQuery(query);
      const isSearchActive = !!storeEditorSearchQuery;
      if (isSearchActive) closeActiveVariantPicker({ commit: true });
      document.body.classList.toggle(
        'store-editor-search-active',
        isSearchActive,
      );

      const list = document.getElementById('storeAislesList');
      if (!list) return;
      const slotEls = Array.from(
        list.querySelectorAll(`.${STORE_AISLE_SLOT_CLASS}`),
      );
      slotEls.forEach((slotEl) => {
        const cardEl = slotEl.querySelector('.store-aisle-card');
        const aid = Number(cardEl?.dataset?.aisleId);
        const aisle = aisleRows.find((row) => row.id === aid);
        const showSlot = aisle
          ? aisleMatchesStoreEditorSearch(
              aisle.name,
              aisle.id,
              storeEditorSearchQuery,
            )
          : !isSearchActive;
        slotEl.hidden = !showSlot;
        slotEl.setAttribute('aria-hidden', showSlot ? 'false' : 'true');

        if (!(cardEl instanceof HTMLElement)) return;
        cardEl.classList.toggle(
          'store-aisle-card--search-active',
          isSearchActive,
        );

        const itemsFieldEl = cardEl.querySelector('.store-aisle-items-field');
        if (itemsFieldEl instanceof HTMLElement) {
          itemsFieldEl.classList.toggle(
            'store-aisle-items-field--search-active',
            isSearchActive,
          );
        }

        const resultsEl = cardEl.querySelector('.store-aisle-search-results');
        if (!(resultsEl instanceof HTMLElement)) return;

        const matchingEntries =
          aisle && isSearchActive
            ? getStoreEditorFilteredLineEntries(
                aisle.id,
                storeEditorSearchQuery,
              )
            : [];
        resultsEl.innerHTML = '';
        matchingEntries.forEach(({ line, lineIndex }) => {
          const lineEl = document.createElement('div');
          lineEl.className = 'store-aisle-search-line';
          lineEl.textContent = String(line || '');
          lineEl.dataset.lineIndex = String(lineIndex);
          lineEl.setAttribute('role', 'button');
          lineEl.tabIndex = 0;
          lineEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            jumpToStoreEditorSearchResult(aisle.id, lineIndex, cardEl);
          });
          lineEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            jumpToStoreEditorSearchResult(aisle.id, lineIndex, cardEl);
          });
          resultsEl.appendChild(lineEl);
        });
        resultsEl.hidden = !(isSearchActive && matchingEntries.length > 0);
        resultsEl.setAttribute(
          'aria-hidden',
          resultsEl.hidden ? 'true' : 'false',
        );
      });
    };

    const getTextareaLineStartCaret = (value, lineIndex) => {
      const lines = String(value || '').split('\n');
      if (!lines.length) return 0;
      const idx = Math.max(0, Math.min(lineIndex, lines.length - 1));
      let offset = 0;
      for (let i = 0; i < idx; i += 1) {
        offset += lines[i].length + 1;
      }
      return offset;
    };

    const getTextareaLineRange = (value, lineIndex) => {
      const lines = String(value || '').split('\n');
      if (!lines.length) {
        return { start: 0, end: 0, text: '' };
      }
      const idx = Math.max(0, Math.min(lineIndex, lines.length - 1));
      const start = getTextareaLineStartCaret(value, idx);
      const text = lines[idx] || '';
      return { start, end: start + text.length, text };
    };

    const getStoreAisleTextareaLineHeight = (textarea) => {
      const cs = window.getComputedStyle(textarea);
      const fontSize = parseFloat(cs.fontSize) || 18;
      const lineHeightRaw = parseFloat(cs.lineHeight);
      return Number.isFinite(lineHeightRaw) && lineHeightRaw > 0
        ? lineHeightRaw
        : fontSize * 1.45;
    };

    const storeAisleLineJumpHighlightTimers = new WeakMap();

    const clearStoreAisleLineJumpHighlight = (itemsField) => {
      if (!(itemsField instanceof HTMLElement)) return;
      const existing = itemsField.querySelector('.store-aisle-line-jump-highlight');
      if (!(existing instanceof HTMLElement)) return;
      const timer = storeAisleLineJumpHighlightTimers.get(existing);
      if (timer) window.clearTimeout(timer);
      storeAisleLineJumpHighlightTimers.delete(existing);
      existing.remove();
    };

    const pulseStoreAisleTextareaLine = (
      textarea,
      lineIndex,
      value,
      afterPulse,
    ) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const itemsField = textarea.closest('.store-aisle-items-field');
      if (!(itemsField instanceof HTMLElement)) return;
      clearStoreAisleLineJumpHighlight(itemsField);
      const cs = window.getComputedStyle(textarea);
      const lineHeight = getStoreAisleTextareaLineHeight(textarea);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      const highlightInsetLeft = 4;
      const highlightInsetRight = 6;
      const highlightInsetY = 2;
      const lineTop = padTop + lineIndex * lineHeight;
      const visibleTop = textarea.offsetTop + lineTop - textarea.scrollTop;
      const contentWidth = Math.max(
        0,
        textarea.clientWidth - padLeft - padRight,
      );
      const highlightLeft = Math.max(
        textarea.offsetLeft + 2,
        textarea.offsetLeft + padLeft - highlightInsetLeft,
      );
      const highlightWidth = Math.min(
        contentWidth + highlightInsetLeft + highlightInsetRight,
        textarea.offsetLeft + textarea.clientWidth - highlightLeft - 2,
      );
      const highlight = document.createElement('div');
      highlight.className = 'store-aisle-line-jump-highlight';
      highlight.setAttribute('aria-hidden', 'true');
      highlight.style.top = `${visibleTop - highlightInsetY}px`;
      highlight.style.left = `${highlightLeft}px`;
      highlight.style.width = `${Math.max(0, highlightWidth)}px`;
      highlight.style.height = `${lineHeight + highlightInsetY * 2}px`;
      itemsField.insertBefore(highlight, textarea);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const timer = storeAisleLineJumpHighlightTimers.get(highlight);
        if (timer) window.clearTimeout(timer);
        storeAisleLineJumpHighlightTimers.delete(highlight);
        highlight.remove();
        if (typeof afterPulse === 'function') {
          try {
            afterPulse();
          } catch (_) {}
        }
      };
      highlight.addEventListener('animationend', finish, { once: true });
      storeAisleLineJumpHighlightTimers.set(
        highlight,
        window.setTimeout(finish, 1400),
      );
    };

    const scrollStoreAisleTextareaLineToTop = (
      textarea,
      lineIndex,
      value,
      { placeCaret = true } = {},
    ) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const textValue = String(value == null ? textarea.value : value);
      const { start } = getTextareaLineRange(textValue, lineIndex);
      const lineHeight = getStoreAisleTextareaLineHeight(textarea);
      const scrollTarget = Math.max(0, lineIndex * lineHeight);
      const maxScroll = Math.max(
        0,
        (textarea.scrollHeight || 0) - (textarea.clientHeight || 0),
      );
      if (placeCaret) {
        try {
          textarea.setSelectionRange(start, start);
        } catch (_) {}
      }
      textarea.scrollTop = Math.min(scrollTarget, maxScroll);
      textarea.scrollLeft = 0;
    };

    const focusStoreAisleTextareaLineCaret = (textarea, lineIndex, value) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const textValue = String(value == null ? textarea.value : value);
      const { start } = getTextareaLineRange(textValue, lineIndex);
      textarea.__feStoreSkipExpandOnFocus = true;
      try {
        textarea.focus({ preventScroll: true });
      } catch (_) {
        try {
          textarea.focus();
        } catch (_) {}
      }
      try {
        textarea.setSelectionRange(start, start);
      } catch (_) {}
    };

    const isStoreEditorJumpDebugEnabled = () => {
      try {
        return (
          sessionStorage.getItem(STORE_EDITOR_JUMP_DEBUG_SESSION_KEY) === '1'
        );
      } catch (_) {
        return false;
      }
    };

    const revealStoreAisleSearchLine = (textarea, aisleId, lineIndex) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const lines = Array.isArray(aisleItemsByAisle.get(aisleId))
        ? aisleItemsByAisle.get(aisleId)
        : [];
      const value = lines.join('\n');
      if (textarea.value !== value) {
        textarea.value = value;
        setAisleTextareaRawDraft(textarea, value);
      }
      try {
        textarea.__feAutoGrowResize?.();
      } catch (_) {}
      focusStoreAisleTextareaLineCaret(textarea, lineIndex, value);

      const applyJumpScroll = () => {
        if (isStoreEditorJumpDebugEnabled()) {
          const maxScroll = Math.max(
            0,
            (textarea.scrollHeight || 0) - (textarea.clientHeight || 0),
          );
          try {
            console.info('[store-jump-debug] click jump', {
              aisleId,
              lineIndex,
              maxScroll,
              lineCount: lines.length,
            });
          } catch (_) {}
          textarea.scrollTop = maxScroll;
          textarea.scrollLeft = 0;
          textarea.style.outline = '3px solid #e53935';
          window.setTimeout(() => {
            textarea.style.outline = '';
          }, 2000);
          const lastIndex = Math.max(0, lines.length - 1);
          pulseStoreAisleTextareaLine(textarea, lastIndex, value);
          return;
        }
        scrollStoreAisleTextareaLineToTop(textarea, lineIndex, value, {
          placeCaret: false,
        });
      };

      applyJumpScroll();
      requestAnimationFrame(() => {
        applyJumpScroll();
        if (!isStoreEditorJumpDebugEnabled()) {
          pulseStoreAisleTextareaLine(textarea, lineIndex, value);
        }
      });
    };

    const jumpToStoreEditorSearchResult = (aisleId, lineIndex, anchorEl) => {
      if (!Number.isFinite(Number(lineIndex)) || Number(lineIndex) < 0) return;
      const runJump = () => {
        const card =
          anchorEl instanceof HTMLElement
            ? anchorEl.closest('.store-aisle-card') || anchorEl
            : document.querySelector(
                `.store-aisle-card[data-aisle-id="${String(aisleId)}"]`,
              );
        const textarea = card?.querySelector('textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        selectStoreAisle(aisleId);
        revealStoreAisleSearchLine(textarea, aisleId, Number(lineIndex));
      };
      try {
        console.info('[store-editor] search result jump', {
          aisleId,
          lineIndex,
          jumpDebug: isStoreEditorJumpDebugEnabled(),
        });
      } catch (_) {}
      if (normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) {
        endStoreEditorSearchPreservingScroll(anchorEl, runJump);
      } else {
        runJump();
      }
    };

    const endStoreEditorSearchPreservingScroll = (anchorEl, afterClear) => {
      if (!normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) return;
      const anchor = anchorEl instanceof HTMLElement ? anchorEl : null;
      const anchorTop =
        anchor && anchor.isConnected
          ? anchor.getBoundingClientRect().top
          : null;
      const se =
        document.scrollingElement || document.documentElement || document.body;
      const fallbackX = se ? se.scrollLeft : 0;
      const fallbackY = se ? se.scrollTop : 0;

      if (storeEditorSearchInput) {
        storeEditorSearchInput.value = '';
        storeEditorSearchInput.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      } else {
        applyStoreEditorSearch('');
      }

      // Raw scrollY restore is wrong when search ends: previously hidden aisles
      // reappear *above* the current row and the layout reflows. Keep the
      // clicked/focused aisle at the same viewport Y by nudging `scrollBy` after
      // reflow, and re-run a few times to also beat the browser’s focus
      // scroll-into-view for the textarea.
      const nudgeAisleToSavedViewportY = () => {
        if (anchor == null || anchorTop == null || !anchor.isConnected) {
          return;
        }
        const newTop = anchor.getBoundingClientRect().top;
        const delta = newTop - anchorTop;
        if (Math.abs(delta) < 0.5) return;
        try {
          window.scrollBy(0, delta);
        } catch (_) {}
      };

      const nudgeOrFallback = () => {
        if (anchor && anchorTop != null && anchor.isConnected) {
          nudgeAisleToSavedViewportY();
        } else {
          try {
            if (se) {
              se.scrollLeft = fallbackX;
              se.scrollTop = fallbackY;
            }
            window.scrollTo(fallbackX, fallbackY);
          } catch (_) {}
        }
      };

      try {
        if (anchor) void anchor.offsetHeight;
      } catch (_) {}
      let afterClearDone = false;
      const runAfterClearOnce = () => {
        if (afterClearDone || typeof afterClear !== 'function') return;
        afterClearDone = true;
        try {
          afterClear();
        } catch (_) {}
      };
      requestAnimationFrame(() => {
        nudgeOrFallback();
        requestAnimationFrame(() => {
          nudgeOrFallback();
          setTimeout(() => {
            nudgeOrFallback();
            runAfterClearOnce();
            setTimeout(() => {
              nudgeOrFallback();
            }, 16);
          }, 0);
        });
      });
    };

    let lastPointerClientX = -1;
    let lastPointerClientY = -1;

    const getHoveredSlot = () => {
      try {
        if (lastPointerClientX < 0) return null;
        const el = document.elementFromPoint(
          lastPointerClientX,
          lastPointerClientY,
        );
        if (!el) return null;
        return el.closest ? el.closest(`.${STORE_AISLE_SLOT_CLASS}`) : null;
      } catch (_) {
        return null;
      }
    };

    const syncAddAisleHoverModifier = (e) => {
      const next = !!(e && e.altKey);
      if (next === hoverModifierActive) return;
      hoverModifierActive = next;
      syncStoreMasterLinkModeClass();
      if (hoverModifierActive) {
        const slot = getHoveredSlot();
        if (slot) syncActiveAisleHintClass(slot);
      } else {
        syncActiveAisleHintClass(null);
      }
    };

    const clearAddAisleHoverModifier = () => {
      if (!hoverModifierActive) return;
      hoverModifierActive = false;
      syncStoreMasterLinkModeClass();
      syncActiveAisleHintClass(null);
    };

    try {
      if (typeof window._storeAddAisleHoverModifierTeardown === 'function') {
        window._storeAddAisleHoverModifierTeardown();
      }
    } catch (_) {}
    const onPointerMove = (e) => {
      lastPointerClientX = e.clientX;
      lastPointerClientY = e.clientY;
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('keydown', syncAddAisleHoverModifier, true);
    document.addEventListener('keyup', syncAddAisleHoverModifier, true);
    window.addEventListener('blur', clearAddAisleHoverModifier);
    window._storeAddAisleHoverModifierTeardown = () => {
      try {
        document.removeEventListener('pointermove', onPointerMove, true);
      } catch (_) {}
      try {
        document.removeEventListener(
          'keydown',
          syncAddAisleHoverModifier,
          true,
        );
      } catch (_) {}
      try {
        document.removeEventListener('keyup', syncAddAisleHoverModifier, true);
      } catch (_) {}
      try {
        window.removeEventListener('blur', clearAddAisleHoverModifier);
      } catch (_) {}
      hoverModifierActive = false;
      syncStoreMasterLinkModeClass();
      syncActiveAisleHintClass(null);
    };

    const closeActiveVariantPicker = ({ commit = true } = {}) => {
      if (!activeVariantPicker) return;
      const {
        aid,
        baseKey,
        textarea,
        panel,
        outsideClickHandler,
        onEsc,
        onPanelKeyDown,
        onDocumentKeyDown,
        focusBaselineValue,
      } = activeVariantPicker;
      try {
        document.removeEventListener('mousedown', outsideClickHandler, true);
      } catch (_) {}
      try {
        textarea?.removeEventListener('keydown', onEsc, true);
      } catch (_) {}
      try {
        panel?.removeEventListener('keydown', onPanelKeyDown, true);
      } catch (_) {}
      try {
        document.removeEventListener('keydown', onDocumentKeyDown, true);
      } catch (_) {}
      try {
        panel?.remove();
      } catch (_) {}
      try {
        textarea?.classList?.remove('store-variant-picker-hidden-input');
      } catch (_) {}
      activeVariantPicker = null;
      const specs = cloneSpecs(aisleItemSpecsByAisle.get(aid) || []);
      if (!commit && typeof focusBaselineValue === 'string') {
        const restored = parseSpecsFromRaw(
          focusBaselineValue,
          specs,
          ingredientCatalog,
        );
        aisleItemSpecsByAisle.set(aid, restored);
      }
      syncDisplayLinesFromSpecs(aid);
      if (textarea && typeof textarea.value === 'string') {
        textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
        setAisleTextareaRawDraft(textarea, textarea.value);
        try {
          textarea.__feAutoGrowResize?.();
        } catch (_) {}
        const itemsFieldEl = textarea.closest('.store-aisle-items-field');
        if (itemsFieldEl)
          syncStoreAisleDeprecatedFieldClassForField(aid, itemsFieldEl);
      }
      if (baseKey) refreshDirty();
    };

    const maybeOpenVariantPickerFromCaret = (textarea, aid) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const originalTextareaValue = String(textarea.value || '');
      const v = String(textarea.value || '');
      const selStart = Number(textarea.selectionStart ?? 0);
      const selEnd = Number(textarea.selectionEnd ?? selStart);
      const pos = Math.max(selStart, selEnd);
      const prevNl = v.lastIndexOf('\n', Math.max(0, pos - 1));
      const lineStart = prevNl === -1 ? 0 : prevNl + 1;
      const nextNl = v.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? v.length : nextNl;
      const lineText = String(v.slice(lineStart, lineEnd) || '');
      const col = Math.max(0, pos - lineStart);
      const selColStart = Math.max(0, Math.min(selStart, selEnd) - lineStart);
      const selColEnd = Math.max(0, Math.max(selStart, selEnd) - lineStart);
      const hasSelection = selColEnd > selColStart;
      const openIdx = lineText.indexOf('(');
      const closeIdx = lineText.lastIndexOf(')');
      if (openIdx < 0) return;
      const hasClosingParen = closeIdx > openIdx;
      if (hasClosingParen) {
        const inParenByCaret = col >= openIdx && col <= closeIdx + 1;
        const inParenBySelection =
          hasSelection && selColEnd >= openIdx && selColStart <= closeIdx + 1;
        if (!inParenByCaret && !inParenBySelection) return;
      } else if (col < openIdx) {
        const inParenBySelection = hasSelection && selColEnd >= openIdx;
        if (inParenBySelection) {
          // Selection reaches into the open-paren segment (e.g. triple-click line select).
        } else {
          // Support in-progress variant text (e.g. "apple (Fuji") before closing ")".
          return;
        }
      }
      const specs = parseSpecsFromRaw(
        textarea.value,
        aisleItemSpecsByAisle.get(aid) || [],
        ingredientCatalog,
      );
      aisleItemSpecsByAisle.set(aid, specs);
      const parsed = splitLineIntoBaseAndParenLoose(lineText);
      const typedBase = String(parsed?.baseName || '').trim();
      if (!typedBase) return;
      const knownForPicker = resolveStoreCatalogItemForTypedBase(typedBase);
      const baseKey = normItemKey(
        knownForPicker
          ? String(knownForPicker.name || typedBase).trim()
          : typedBase,
      );
      if (!baseKey) return;
      const spec = specs.find((s) => s.baseKey === baseKey);
      if (!spec || !Number.isFinite(Number(spec.ingredientId))) return;
      closeActiveVariantPicker({ commit: true });
      const card = textarea.closest('.store-aisle-card');
      const itemsField = textarea.closest('.store-aisle-items-field');
      if (!card || !itemsField) return;
      const selected = new Set(
        (spec.selectedVariants || []).map((x) => normVariantKey(x)),
      );
      const knownVariants = Array.isArray(spec.knownVariants)
        ? spec.knownVariants.filter((x) => String(x?.name || '').trim())
        : [];
      // Build picker options optimistically: saved DB variants first, then any
      // valid ad-hoc variants the user already typed in this line.
      const pickerVariants = [];
      const seenPickerVariantKeys = new Set();
      knownVariants.forEach((variant) => {
        const vn = String(variant?.name || '').trim();
        const key = normVariantKey(vn);
        if (!key || seenPickerVariantKeys.has(key)) return;
        seenPickerVariantKeys.add(key);
        pickerVariants.push({
          id: Number.isFinite(Number(variant?.id)) ? Number(variant.id) : null,
          name: vn,
        });
      });
      if (knownVariants.length > 0 && !seenPickerVariantKeys.has('any')) {
        seenPickerVariantKeys.add('any');
        pickerVariants.unshift({
          id: null,
          name: STORE_AISLE_ANY_VARIANT_TOKEN,
        });
      }
      if (knownVariants.length > 0 && !seenPickerVariantKeys.has('all')) {
        seenPickerVariantKeys.add('all');
        pickerVariants.push({
          id: null,
          name: STORE_AISLE_ALL_VARIANT_TOKEN,
        });
      }
      (spec.selectedVariants || []).forEach((variantName) => {
        const vn = String(variantName || '').trim();
        const key = normVariantKey(vn);
        if (!key || seenPickerVariantKeys.has(key)) return;
        if (!isSupportedVariantName(vn)) return;
        seenPickerVariantKeys.add(key);
        pickerVariants.push({ id: null, name: vn });
      });
      const panel = document.createElement('div');
      panel.className = 'store-variant-picker store-variant-picker--inline';
      const inlineLine = document.createElement('div');
      inlineLine.className = 'store-variant-picker-inline-line';
      const baseLabel = document.createElement('span');
      baseLabel.className =
        'store-variant-picker-inline-name store-variant-picker-inline-name-pill';
      baseLabel.textContent = spec.baseName || '';
      inlineLine.appendChild(baseLabel);
      const pillsWrap = document.createElement('div');
      pillsWrap.className =
        'store-variant-picker-pills store-variant-picker-pills--inline';
      const pillButtons = [];
      let addAllBtn = null;
      const syncAllPillStates = () => {
        pillButtons.forEach(({ btn, key }) => {
          const on = selected.has(key);
          btn.classList.toggle('is-on', on);
          btn.classList.toggle('is-off', !on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (addAllBtn) {
          const allTokenSelected = selected.has(
            normVariantKey(STORE_AISLE_ALL_VARIANT_TOKEN),
          );
          const allSelected =
            allTokenSelected ||
            (pickerVariants.length > 0 &&
              pickerVariants.every((v) =>
                selected.has(normVariantKey(String(v?.name || '').trim())),
              ));
          addAllBtn.disabled = allSelected;
          addAllBtn.classList.toggle('is-unavailable', allSelected);
          addAllBtn.setAttribute(
            'aria-disabled',
            allSelected ? 'true' : 'false',
          );
        }
      };
      if (knownVariants.length >= 5) {
        addAllBtn = document.createElement('button');
        addAllBtn.type = 'button';
        addAllBtn.className =
          'ui-unknown-items-suggestion-pill store-variant-picker-pill store-variant-picker-pill--add-all';
        addAllBtn.textContent = 'Add all';
        addAllBtn.addEventListener('click', () => {
          selected.clear();
          selected.add(normVariantKey(STORE_AISLE_ALL_VARIANT_TOKEN));
          spec.selectedVariants = [STORE_AISLE_ALL_VARIANT_TOKEN];
          syncAllPillStates();
          syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
          textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
          try {
            textarea.__feAutoGrowResize?.();
          } catch (_) {}
          const ifield = textarea.closest('.store-aisle-items-field');
          if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
          refreshDirty();
        });
        pillsWrap.appendChild(addAllBtn);
      }
      pickerVariants.forEach((variant) => {
        const vn = String(variant?.name || '').trim();
        const key = normVariantKey(vn);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'ui-unknown-items-suggestion-pill store-variant-picker-pill';
        btn.textContent = vn;
        pillButtons.push({ btn, key });
        btn.addEventListener('click', () => {
          if (isStoreAisleAllVariantToken(vn)) {
            selected.clear();
            selected.add(key);
          } else {
            selected.delete(normVariantKey(STORE_AISLE_ALL_VARIANT_TOKEN));
            if (selected.has(key)) selected.delete(key);
            else selected.add(key);
          }
          const nextList = selected.has(normVariantKey(STORE_AISLE_ALL_VARIANT_TOKEN))
            ? [STORE_AISLE_ALL_VARIANT_TOKEN]
            : pickerVariants
                .map((v2) => String(v2?.name || '').trim())
                .filter((name) => selected.has(normVariantKey(name)));
          spec.selectedVariants = nextList;
          syncAllPillStates();
          syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
          textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
          try {
            textarea.__feAutoGrowResize?.();
          } catch (_) {}
          const ifield = textarea.closest('.store-aisle-items-field');
          if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
          refreshDirty();
        });
        pillsWrap.appendChild(btn);
      });
      syncAllPillStates();
      inlineLine.appendChild(pillsWrap);
      panel.appendChild(inlineLine);
      itemsField.appendChild(panel);
      textarea.classList.add('store-variant-picker-hidden-input');
      syncDisplayLinesFromSpecs(aid, { pickerBaseKey: spec.baseKey });
      textarea.value = (aisleItemsByAisle.get(aid) || []).join('\n');
      try {
        textarea.__feAutoGrowResize?.();
      } catch (_) {}
      {
        const ifield = textarea.closest('.store-aisle-items-field');
        if (ifield) syncStoreAisleDeprecatedFieldClassForField(aid, ifield);
      }

      const outsideClickHandler = (evt) => {
        const t = evt?.target;
        if (!(t instanceof HTMLElement)) return;
        if (panel.contains(t)) return;
        if (t === textarea) return;
        closeActiveVariantPicker({ commit: true });
      };
      const onEsc = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key !== 'Escape') return;
        evt.preventDefault();
        evt.stopPropagation();
        closeActiveVariantPicker({ commit: false });
        try {
          textarea.blur();
        } catch (_) {}
      };
      const onPanelKeyDown = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key === 'Escape') {
          evt.preventDefault();
          evt.stopPropagation();
          closeActiveVariantPicker({ commit: false });
          try {
            textarea.blur();
          } catch (_) {}
        }
      };
      const onDocumentKeyDown = (evt) => {
        const key = String(evt?.key || '');
        if (key === 'Enter') {
          evt.preventDefault();
          evt.stopPropagation();
          const caretPos = Number(textarea?.selectionStart ?? 0);
          closeActiveVariantPicker({ commit: true });
          try {
            const nextPos = Math.max(
              0,
              Math.min(caretPos, Number(textarea?.value?.length ?? 0)),
            );
            textarea.focus();
            textarea.setSelectionRange(nextPos, nextPos);
          } catch (_) {}
          return;
        }
        if (key !== 'Escape') return;
        evt.preventDefault();
        evt.stopPropagation();
        closeActiveVariantPicker({ commit: false });
        try {
          textarea.blur();
        } catch (_) {}
      };
      document.addEventListener('mousedown', outsideClickHandler, true);
      textarea.addEventListener('keydown', onEsc, true);
      panel.addEventListener('keydown', onPanelKeyDown, true);
      document.addEventListener('keydown', onDocumentKeyDown, true);
      activeVariantPicker = {
        aid,
        baseKey: spec.baseKey,
        textarea,
        panel,
        outsideClickHandler,
        onEsc,
        onPanelKeyDown,
        onDocumentKeyDown,
        focusBaselineValue: originalTextareaValue,
      };
    };

    const renderAisleCards = () => {
      const list = document.getElementById('storeAislesList');
      if (!list) return;

      closeActiveVariantPicker({ commit: true });
      list.innerHTML = '';
      aisleRows.forEach((a) => {
        const aisleIndex = aisleRows.findIndex((r) => r.id === a.id);

        const slot = document.createElement('div');
        slot.className = STORE_AISLE_SLOT_CLASS;

        const card = document.createElement('div');
        card.className = 'shopping-item-editor-card store-aisle-card';
        card.dataset.aisleId = String(a.id);
        card.tabIndex = 0;
        if (desktopHoverEnabled) {
          slot.addEventListener('mouseenter', (e) => {
            hoverModifierActive = !!e.altKey;
            syncStoreMasterLinkModeClass();
            if (hoverModifierActive) {
              syncActiveAisleHintClass(slot);
            }
          });
          slot.addEventListener('mouseleave', () => {
            syncActiveAisleHintClass(null);
          });
        }

        const aisleTargetIsNameOrList = (target) =>
          target.closest('.store-aisle-name') ||
          target.closest('textarea') ||
          target.closest('.store-variant-picker') ||
          target.closest('.store-aisle-move-controls');

        const moveAisleByDelta = (delta, options = null) => {
          const from = aisleRows.findIndex((r) => r.id === a.id);
          if (from < 0) return;
          const to = from + delta;
          if (to < 0 || to >= aisleRows.length) return;
          const [row] = aisleRows.splice(from, 1);
          aisleRows.splice(to, 0, row);
          renderAisleCards();
          if (options?.focus === 'textarea') {
            const movedCard = document.querySelector(
              `.store-aisle-card[data-aisle-id="${String(a.id)}"]`,
            );
            const movedTextarea = movedCard?.querySelector(
              '.shopping-item-textarea',
            );
            if (movedTextarea) {
              try {
                movedTextarea.focus({ preventScroll: true });
              } catch (_) {
                movedTextarea.focus();
              }
              const start = Number.isFinite(options.selectionStart)
                ? Number(options.selectionStart)
                : null;
              const end = Number.isFinite(options.selectionEnd)
                ? Number(options.selectionEnd)
                : start;
              if (start != null) {
                try {
                  movedTextarea.setSelectionRange(start, end ?? start);
                } catch (_) {}
              }
            }
          }
          refreshDirty();
        };

        const attemptDeleteAisle = async () => {
          const ok = await uiConfirm({
            title: 'Delete aisle?',
            message: `Permanently delete “${(a.name || 'Aisle').replace(/"/g, '')}” and its item list?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true,
          });
          if (!ok) return;
          const idx = aisleRows.findIndex((r) => r.id === a.id);
          if (idx < 0) return;
          const snapshot = { id: a.id, name: a.name };
          const itemsSnap = [...(aisleItemsByAisle.get(a.id) || [])];
          const specsSnap = cloneSpecs(aisleItemSpecsByAisle.get(a.id) || []);
          const wasPersisted = a.id > 0;

          if (wasPersisted) deletedAisleIds.add(a.id);
          aisleRows = aisleRows.filter((r) => r.id !== a.id);
          aisleItemsByAisle.delete(a.id);
          aisleItemSpecsByAisle.delete(a.id);
          renderAisleCards();
          refreshDirty();

          const restore = () => {
            try {
              if (wasPersisted) deletedAisleIds.delete(snapshot.id);
              const insertAt = Math.min(Math.max(0, idx), aisleRows.length);
              aisleRows.splice(insertAt, 0, {
                id: snapshot.id,
                name: snapshot.name,
              });
              aisleItemsByAisle.set(snapshot.id, [...itemsSnap]);
              aisleItemSpecsByAisle.set(snapshot.id, cloneSpecs(specsSnap));
            } catch (_) {}
            renderAisleCards();
            refreshDirty();
          };

          try {
            const um = window.undoManager;
            if (um && typeof um.push === 'function') {
              um.push({
                message: 'Aisle removed',
                undo: restore,
                timeoutMs: 3500,
              });
            } else if (typeof window.showUndoToast === 'function') {
              window.showUndoToast({
                message: 'Aisle removed',
                onUndo: restore,
              });
            }
          } catch (_) {}
        };

        card.addEventListener('click', (e) => {
          const wantsDelete = e.ctrlKey || e.metaKey;
          if (!wantsDelete) {
            if (aisleTargetIsNameOrList(e.target)) return;
            selectStoreAisle(a.id);
            return;
          }
          if (aisleTargetIsNameOrList(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          void attemptDeleteAisle();
        });

        card.addEventListener('contextmenu', (e) => {
          if (aisleTargetIsNameOrList(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          void attemptDeleteAisle();
        });

        card.addEventListener('focusin', (e) => {
          if (e.target !== card) return;
          selectStoreAisle(a.id);
        });

        card.addEventListener(
          'pointerdown',
          (e) => {
            if (e.button !== 0) return;
            if (e.ctrlKey || e.metaKey) return;
            if (e.target.closest('.store-aisle-move-controls')) return;
            if (e.target.closest('.store-aisle-search-line')) return;
            if (!normalizeStoreEditorSearchQuery(storeEditorSearchQuery))
              return;
            endStoreEditorSearchPreservingScroll(card);
          },
          true,
        );

        const moveControls = document.createElement('div');
        moveControls.className = 'store-aisle-move-controls';
        moveControls.setAttribute('aria-label', 'Aisle actions');

        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'store-aisle-move-btn';
        moveUpBtn.type = 'button';
        const moveUpIcon = document.createElement('span');
        moveUpIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        moveUpIcon.setAttribute('aria-hidden', 'true');
        moveUpIcon.textContent = 'arrow_upward_alt';
        moveUpBtn.appendChild(moveUpIcon);
        moveUpBtn.setAttribute('aria-label', 'Move aisle up');
        if (aisleIndex <= 0) {
          moveUpBtn.disabled = true;
          moveUpBtn.setAttribute('aria-disabled', 'true');
        }
        moveUpBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveAisleByDelta(-1);
        });

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'store-aisle-move-btn';
        moveDownBtn.type = 'button';
        const moveDownIcon = document.createElement('span');
        moveDownIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        moveDownIcon.setAttribute('aria-hidden', 'true');
        moveDownIcon.textContent = 'arrow_downward_alt';
        moveDownBtn.appendChild(moveDownIcon);
        moveDownBtn.setAttribute('aria-label', 'Move aisle down');
        if (aisleIndex >= aisleRows.length - 1) {
          moveDownBtn.disabled = true;
          moveDownBtn.setAttribute('aria-disabled', 'true');
        }
        moveDownBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveAisleByDelta(1);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'store-aisle-move-btn store-aisle-add-btn';
        addBtn.type = 'button';
        addBtn.setAttribute('aria-label', 'Add an aisle');
        const addIcon = document.createElement('span');
        addIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        addIcon.setAttribute('aria-hidden', 'true');
        addIcon.textContent = 'add';
        addBtn.appendChild(addIcon);
        addBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          void runAddAisle(aisleIndex);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'store-aisle-move-btn store-aisle-delete-btn';
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('aria-label', 'Delete aisle');
        const deleteIcon = document.createElement('span');
        deleteIcon.className =
          'material-symbols-outlined store-aisle-move-icon';
        deleteIcon.setAttribute('aria-hidden', 'true');
        deleteIcon.textContent = 'delete';
        deleteBtn.appendChild(deleteIcon);
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          void attemptDeleteAisle();
        });

        moveControls.appendChild(moveUpBtn);
        moveControls.appendChild(moveDownBtn);
        moveControls.appendChild(addBtn);
        moveControls.appendChild(deleteBtn);
        moveControls.hidden = true;
        moveControls.setAttribute('aria-hidden', 'true');
        card.appendChild(moveControls);

        const nameEl = document.createElement('div');
        nameEl.className = 'shopping-item-label store-aisle-name';
        nameEl.textContent = a.name || 'Aisle';

        nameEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectStoreAisle(a.id);
          if (nameEl.isContentEditable) return;
          const starting = (a.name || '').trim() || 'Aisle';

          nameEl.contentEditable = 'true';
          nameEl.classList.add('editing-title');
          nameEl.textContent = starting;
          nameEl.focus();

          const cleanup = () => {
            nameEl.contentEditable = 'false';
            nameEl.classList.remove('editing-title');
            nameEl.removeEventListener('blur', onBlur);
            nameEl.removeEventListener('keydown', onKeyDown);
          };

          const commitLocal = () => {
            let next = (nameEl.textContent || '').trim();
            if (!next) next = starting;
            a.name = next;
            nameEl.textContent = next || 'Aisle';
            cleanup();
            refreshDirty();
          };

          const onBlur = () => {
            commitLocal();
          };

          const onKeyDown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              nameEl.removeEventListener('blur', onBlur);
              commitLocal();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              nameEl.textContent = a.name || 'Aisle';
              cleanup();
            }
          };

          nameEl.addEventListener('blur', onBlur);
          nameEl.addEventListener('keydown', onKeyDown);
        });

        card.appendChild(nameEl);

        let specs = cloneSpecs(aisleItemSpecsByAisle.get(a.id) || []);
        if (!specs.length) {
          const items = aisleItemsByAisle.get(a.id) || [];
          specs = parseSpecsFromRaw(items.join('\n'), [], ingredientCatalog);
          aisleItemSpecsByAisle.set(a.id, specs);
          syncDisplayLinesFromSpecs(a.id);
        }
        const itemsField = document.createElement('div');
        itemsField.className = 'shopping-item-field store-aisle-items-field';

        const ta = document.createElement('textarea');
        ta.className = 'shopping-item-textarea editor-paste-textarea';
        ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
        setAisleTextareaRawDraft(ta, ta.value);
        ta.placeholder = 'Add an item.';
        ta.setAttribute('aria-label', 'Aisle items');
        ta.wrap = 'soft';
        attachEditorTextareaAutoGrow(ta, { maxLines: 10 });
        attachEditorNewlineListPaste(ta);

        // Ingredient-name suggestions for the aisle items "paste box".
        try {
          const taTypeahead = window.favoriteEatsTypeahead;
          if (
            taTypeahead &&
            typeof taTypeahead.attachMultilineIngredientLineTypeahead ===
              'function'
          ) {
            taTypeahead.attachMultilineIngredientLineTypeahead(ta, {
              openOnBlankLineFocus: true,
              getNamePool: async () => {
                const rawNames = await taTypeahead.getNamePool();
                if (
                  typeof window.buildShoppingCatalogTypeaheadNamePool !==
                  'function'
                ) {
                  return rawNames;
                }
                return window.buildShoppingCatalogTypeaheadNamePool(
                  ingredientCatalog?.byName,
                  storeCatalogLabelIndex,
                  rawNames,
                );
              },
              getVariantPoolForBaseName: (baseName) => {
                const typedBase = String(baseName || '').trim();
                if (!typedBase) return [];
                const known = resolveStoreCatalogItemForTypedBase(typedBase);
                if (!known || !Array.isArray(known.variants)) return [];
                const out = [];
                const seen = new Set();
                known.variants.forEach((v) => {
                  if (v?.isDeprecated) return;
                  const clean = String(v?.name || '').trim();
                  if (!clean) return;
                  const k = normVariantKey(clean);
                  if (!k || seen.has(k)) return;
                  seen.add(k);
                  out.push(clean);
                });
                if (out.length && !seen.has('any')) {
                  out.unshift(STORE_AISLE_ANY_VARIANT_TOKEN);
                }
                if (out.length && !seen.has('all')) {
                  out.push(STORE_AISLE_ALL_VARIANT_TOKEN);
                }
                return out;
              },
            });
          }
        } catch (_) {}

        let escBaseline = parseUniqueItemLines(ta.value);
        let escBaselineText = ta.value;

        ta.addEventListener('focus', () => {
          selectStoreAisle(a.id);
          if (ta.__feStoreSkipExpandOnFocus) {
            ta.__feStoreSkipExpandOnFocus = false;
            if (normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) {
              const anchorCard = ta.closest('.store-aisle-card');
              endStoreEditorSearchPreservingScroll(anchorCard);
            }
            closeActiveVariantPicker({ commit: true });
            syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
            return;
          }
          if (normalizeStoreEditorSearchQuery(storeEditorSearchQuery)) {
            const anchorCard = ta.closest('.store-aisle-card');
            endStoreEditorSearchPreservingScroll(anchorCard);
          }
          closeActiveVariantPicker({ commit: true });
          const nextSpecs = parseSpecsFromRaw(
            ta.value,
            aisleItemSpecsByAisle.get(a.id) || [],
            ingredientCatalog,
          );
          aisleItemSpecsByAisle.set(a.id, nextSpecs);
          syncDisplayLinesFromSpecs(a.id, { expandAll: true });
          ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
          setAisleTextareaRawDraft(ta, ta.value);
          escBaseline = parseUniqueItemLines(ta.value);
          escBaselineText = ta.value;
          syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
        });

        ta.addEventListener('input', () => {
          setAisleTextareaRawDraft(ta, ta.value);
          const nextSpecs = parseSpecsFromRaw(
            ta.value,
            aisleItemSpecsByAisle.get(a.id) || [],
            ingredientCatalog,
          );
          aisleItemSpecsByAisle.set(a.id, nextSpecs);
          aisleItemsByAisle.set(a.id, parseUniqueItemLines(ta.value));
          syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
          refreshDirty();
        });

        ta.addEventListener('click', (e) => {
          if (
            e &&
            e.altKey &&
            slot.classList.contains(STORE_AISLE_HINT_ACTIVE_CLASS)
          ) {
            const lineText = getTextareaLineTextAtCaret(ta);
            const baseName = extractMasterNameFromAisleLine(lineText);
            if (baseName) {
              e.preventDefault();
              e.stopPropagation();
              void (async () => {
                const match = await getShoppingMatchByName(baseName);
                if (match) navigateToShoppingMatch(match);
              })();
              return;
            }
          }
          if (Number(e?.detail || 0) < 3) return;
          if (activeVariantPicker && activeVariantPicker.textarea === ta)
            return;
          // Let native selection/caret settle first, then inspect caret context.
          window.setTimeout(() => {
            maybeOpenVariantPickerFromCaret(ta, a.id);
          }, 0);
        });

        ta.addEventListener('keydown', (e) => {
          const wantsAisleReorder =
            e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.shiftKey &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown');
          if (wantsAisleReorder) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
              e.stopImmediatePropagation();
            }
            moveAisleByDelta(e.key === 'ArrowUp' ? -1 : 1, {
              focus: 'textarea',
              selectionStart: ta.selectionStart,
              selectionEnd: ta.selectionEnd,
            });
            return;
          }
          if (
            e.key === 'Enter' &&
            activeVariantPicker &&
            activeVariantPicker.textarea === ta
          ) {
            // Picker-level Enter handler (capture phase) owns commit + focus restore.
            return;
          }
          if (e.key === 'Enter' && e.shiftKey) {
            // Chat-style newline override: Shift+Enter inserts a hard line break.
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            closeActiveVariantPicker({ commit: true });
            try {
              ta.blur();
            } catch (_) {}
            return;
          }
          if (
            e.key === 'Escape' &&
            activeVariantPicker &&
            activeVariantPicker.textarea === ta
          ) {
            // Picker-level Esc handler (capture phase) owns close + blur.
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            closeActiveVariantPicker({ commit: false });
            ta.value = escBaselineText || escBaseline.join('\n');
            const nextSpecs = parseSpecsFromRaw(
              ta.value,
              aisleItemSpecsByAisle.get(a.id) || [],
              ingredientCatalog,
            );
            aisleItemSpecsByAisle.set(a.id, nextSpecs);
            syncDisplayLinesFromSpecs(a.id);
            ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
            syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
            try {
              ta.__feAutoGrowResize();
            } catch (_) {}
            refreshDirty();
            return;
          }
        });

        ta.addEventListener('blur', () => {
          window.setTimeout(() => {
            if (activeVariantPicker && activeVariantPicker.textarea === ta)
              return;
            const nextSpecs = sortStoreAisleItemSpecsList(
              parseSpecsFromRaw(
                ta.value,
                aisleItemSpecsByAisle.get(a.id) || [],
                ingredientCatalog,
              ),
            );
            aisleItemSpecsByAisle.set(a.id, nextSpecs);
            syncDisplayLinesFromSpecs(a.id);
            ta.value = (aisleItemsByAisle.get(a.id) || []).join('\n');
            setAisleTextareaRawDraft(ta, ta.value);
            escBaseline = parseUniqueItemLines(ta.value);
            escBaselineText = ta.value;
            syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
            try {
              ta.__feAutoGrowResize?.();
            } catch (_) {}
            refreshDirty();
          }, 0);
        });

        const filteredResults = document.createElement('div');
        filteredResults.className = 'store-aisle-search-results';
        filteredResults.hidden = true;
        filteredResults.setAttribute('aria-hidden', 'true');
        filteredResults.setAttribute('aria-label', 'Matching aisle items');
        itemsField.appendChild(filteredResults);

        itemsField.appendChild(ta);
        syncStoreAisleDeprecatedFieldClassForField(a.id, itemsField);
        card.appendChild(itemsField);

        slot.appendChild(card);

        const slotCta = document.createElement('div');
        slotCta.className = 'store-add-aisle-cta store-add-aisle-cta--per-slot';
        slotCta.setAttribute('role', 'button');
        slotCta.tabIndex = 0;
        const slotCtaLabel = document.createElement('span');
        slotCtaLabel.className = 'placeholder-prompt';
        slotCtaLabel.textContent = 'Add an aisle';
        slotCta.appendChild(slotCtaLabel);
        slot.appendChild(slotCta);

        list.appendChild(slot);
      });
      syncEmptyStateAisleCta();
      syncStoreAisleCardSelection();
      applyStoreEditorSearch(storeEditorSearchQuery);
      list.querySelectorAll('.store-aisle-card').forEach((cardEl) => {
        const aid = Number(cardEl.dataset.aisleId);
        const field = cardEl.querySelector('.store-aisle-items-field');
        if (Number.isFinite(aid) && field) {
          syncStoreAisleDeprecatedFieldClassForField(aid, field);
        }
      });
      try {
        const rawFocus = sessionStorage.getItem(
          STORE_EDITOR_FOCUS_AISLE_SESSION_KEY,
        );
        if (rawFocus != null && rawFocus !== '') {
          sessionStorage.removeItem(STORE_EDITOR_FOCUS_AISLE_SESSION_KEY);
          const focusAisleId = Number(rawFocus);
          if (Number.isFinite(focusAisleId) && focusAisleId > 0 && list) {
            requestAnimationFrame(() => {
              const card = list.querySelector(
                `.store-aisle-card[data-aisle-id="${String(focusAisleId)}"]`,
              );
              card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
      } catch (_) {}
    };

    const runAddAisle = async (insertAfterIndex) => {
      if (!window.ui) {
        uiToast('UI not ready yet.');
        return;
      }
      const name = await window.ui.prompt({
        title: 'New Aisle',
        label: 'Name',
        value: '',
        confirmText: 'Create',
        cancelText: 'Cancel',
        required: true,
        normalize: (v) => (v || '').trim(),
      });
      if (!name) return;

      const tid = nextTempAisleId--;
      const newRow = { id: tid, name };
      if (
        insertAfterIndex != null &&
        insertAfterIndex >= 0 &&
        insertAfterIndex < aisleRows.length
      ) {
        aisleRows.splice(insertAfterIndex + 1, 0, newRow);
      } else {
        aisleRows.push(newRow);
      }
      aisleItemsByAisle.set(tid, []);
      aisleItemSpecsByAisle.set(tid, []);
      renderAisleCards();
      refreshDirty();
    };

    const wireStoreAisleSelection = () => {
      if (!hasPersistedStore) return;
      document.addEventListener(
        'pointerdown',
        (e) => {
          if (selectedStoreAisleId == null) return;
          if (e.target.closest('.store-aisle-card')) return;
          selectStoreAisle(null);
        },
        true,
      );
    };

    const wireAddAisle = () => {
      if (!hasPersistedStore) return;
      const list = document.getElementById('storeAislesList');
      const emptyCta = document.getElementById('storeAddAisleCtaEmpty');

      if (list) {
        const slotIndex = (cta) => {
          const slot = cta.closest('.store-aisle-slot');
          if (!slot) return undefined;
          const slots = Array.from(list.querySelectorAll('.store-aisle-slot'));
          return slots.indexOf(slot);
        };
        list.addEventListener('click', (e) => {
          const cta = e.target.closest('.store-add-aisle-cta--per-slot');
          if (!cta) return;
          e.preventDefault();
          e.stopPropagation();
          void runAddAisle(slotIndex(cta));
        });
        list.addEventListener('keydown', (e) => {
          const cta = e.target.closest('.store-add-aisle-cta--per-slot');
          if (!cta) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void runAddAisle(slotIndex(cta));
          }
        });
      }

      if (emptyCta) {
        emptyCta.addEventListener('click', () => void runAddAisle());
        emptyCta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void runAddAisle();
          }
        });
      }
    };

    if (typeof waitForAppBarReady !== 'function') {
      renderAisleCards();
      wireStoreAisleSelection();
      wireAddAisle();
      fePageLoadFoodIconFinish();
      return;
    }

    await waitForAppBarReady();
    wireStoreAisleSelection();
    if (hasPersistedStore) {
      storeEditorSearchInput = document.getElementById('appBarSearchInput');
      const storeEditorSearchClearBtn =
        document.getElementById('appBarSearchClear');
      wireAppBarSearch(storeEditorSearchInput, {
        clearBtn: storeEditorSearchClearBtn,
        onQueryChange: (query) => {
          applyStoreEditorSearch(query);
        },
        normalizeQuery: normalizeStoreEditorSearchQuery,
      });
    }

    /** Sync aisle names + textarea drafts from the DOM into in-memory layout state (call before building a save request). */
    const flushStoreAislesDraft = () => {
      if (!hasPersistedStore) return;
      for (const card of document.querySelectorAll('.store-aisle-card')) {
        const aid = Number(card.dataset.aisleId);
        const row = aisleRows.find((r) => r.id === aid);
        if (!row) continue;
        const ne = card.querySelector('.store-aisle-name');
        if (ne) {
          const t = (ne.textContent || '').trim();
          if (t) row.name = t;
        }
        const ta = card.querySelector('textarea');
        if (ta) {
          const currentSpecs = cloneSpecs(aisleItemSpecsByAisle.get(aid) || []);
          const nextSpecs = sortStoreAisleItemSpecsList(
            currentSpecs.length
              ? normalizeSpecsWithCatalog(currentSpecs, ingredientCatalog)
              : parseSpecsFromRaw(
                  getAisleTextareaRawDraft(ta),
                  [],
                  ingredientCatalog,
                ),
          );
          aisleItemSpecsByAisle.set(aid, nextSpecs);
          syncDisplayLinesFromSpecs(aid);
          ta.value = (aisleItemsByAisle.get(aid) || []).join('\n');
          setAisleTextareaRawDraft(ta, ta.value);
          const itemsFieldEl = card.querySelector('.store-aisle-items-field');
          if (itemsFieldEl)
            syncStoreAisleDeprecatedFieldClassForField(aid, itemsFieldEl);
        }
      }
    };

    const buildStoreLayoutSaveRequest = ({ id, chain, location }) => ({
      id,
      chain,
      location,
      aisles: aisleRows.map((aisle, index) => ({
        id: aisle.id,
        name: aisle.name || 'Aisle',
        sortOrder: index + 1,
        itemSpecs: cloneSpecs(aisleItemSpecsByAisle.get(aisle.id) || []),
      })),
    });

    const pageCtl = wireChildEditorPage({
      backBtn: document.getElementById('appBarBackBtn'),
      cancelBtn: document.getElementById('appBarCancelBtn'),
      saveBtn: document.getElementById('appBarSaveBtn'),
      appBarTitleEl: document.getElementById('appBarTitle'),
      bodyTitleEl: document.getElementById('childEditorTitle'),
      initialTitle: titleText,
      backHref: 'stores.html',
      subtitleEl: document.getElementById('storeLocationSubtitle'),
      initialSubtitle: locTrim,
      normalizeSubtitle: (s) => (s || '').trim(),
      subtitlePlaceholder: 'Add a description.',
      subtitleEmptyMeansHidden: true,
      extraDirtyState: hasPersistedStore
        ? {
            isDirty: () => aislesDraftDirty(),
            onCancel: () => {
              restoreDraftFromSnapshot(draftSnapshot);
              renderAisleCards();
            },
            onAfterSaveSuccess: () => {
              draftSnapshot = cloneDraftSnapshot();
            },
          }
        : null,
      onSave: async ({ title: next, subtitle: nextLoc }) => {
        const sid = sessionStorage.getItem('selectedStoreId');
        const id = Number(sid);
        const loc = (nextLoc ?? '').trim();
        if (isReservedShoppingListStoreName(next)) {
          uiToast(SHOPPING_RESERVED_STORE_NAME_ERROR);
          throw { silent: true };
        }
        const dataService = window.dataService;
        if (!dataService) {
          uiToast('Store save is unavailable.');
          return;
        }
        dataService.useSupabase = true;

        // Persisted stores: aisles + assignments + variant rows are written only
        // via `dataService.saveStoreLayout` (Supabase `save_store_layout` RPC).
        if (hasPersistedStore) {
          if (typeof dataService.saveStoreLayout !== 'function') {
            uiToast('Store layout save is unavailable.');
            return;
          }
          flushStoreAislesDraft();
          const variantSpeedBumpOk = await runStoreLayoutUnknownVariantSpeedBump({
            aisleRows,
            aisleItemSpecsByAisle,
            cloneSpecs,
            isSupportedVariantName,
            isStoreAisleReservedVariantToken,
            normVariantKey,
          });
          if (!variantSpeedBumpOk) {
            uiToast('Save cancelled.');
            return;
          }
          for (const card of document.querySelectorAll('.store-aisle-card')) {
            const aid = Number(card.dataset.aisleId);
            if (!Number.isFinite(aid)) continue;
            syncDisplayLinesFromSpecs(aid);
            const ta = card.querySelector('textarea');
            if (ta) {
              ta.value = (aisleItemsByAisle.get(aid) || []).join('\n');
              setAisleTextareaRawDraft(ta, ta.value);
            }
          }
          const detail = await dataService.saveStoreLayout(
            buildStoreLayoutSaveRequest({
              id,
              chain: next || '',
              location: loc,
            }),
          );
          applyStoreDetailFromDataService(detail);
          sessionStorage.setItem('selectedStoreChain', next || '');
          sessionStorage.setItem('selectedStoreLocation', loc);
          sessionStorage.removeItem('selectedStoreIsNew');
          return;
        }

        if (typeof dataService.createStore !== 'function') {
          uiToast('Store creation is unavailable.');
          return;
        }
        const created = await dataService.createStore({
          chain: next || '',
          location: loc,
        });
        const newId = Number(created?.id);
        if (Number.isFinite(newId) && newId > 0) {
          sessionStorage.setItem('selectedStoreId', String(newId));
        }
        sessionStorage.setItem('selectedStoreChain', next || '');
        sessionStorage.setItem('selectedStoreLocation', loc);
        sessionStorage.removeItem('selectedStoreIsNew');
        window.location.reload();
      },
    });
    refreshDirty =
      (pageCtl && pageCtl.refreshDirty) ||
      (() => {
        /* noop */
      });
    renderAisleCards();
    wireAddAisle();
    fePageLoadFoodIconFinish();
  })();
}

// Shared helper for *all* editor pages (shopping, units, stores, future)

// Usage inside any load*EditorPage():
//   const editor = initEditorPage({ saveBtn, cancelBtn, root: view });
//   editor.markDirty();  // optional manual trigger
// ---------------------------------------------------------------------------
function initEditorPage({ saveBtn, cancelBtn, root }) {
  // Each editor gets its own dirty flag; starts clean.
  let isDirty = false;

  // Disable buttons until the user edits.
  if (cancelBtn) cancelBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;

  const enableButtons = () => {
    if (cancelBtn) cancelBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  };

  const markDirty = () => {
    if (isDirty) return;
    isDirty = true;
    enableButtons();
  };

  // Common-sense rule: anything the user can change marks the page dirty.
  const wireDirtyTracking = (node) => {
    if (!node) return;
    const editables = node.querySelectorAll(
      'input, textarea, select, [contenteditable="true"]',
    );
    editables.forEach((el) => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });
  };

  wireDirtyTracking(root);

  // Expose a tiny API for pages that need manual control later.
  return {
    markDirty,
    resetDirty() {
      isDirty = false;
      if (cancelBtn) cancelBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
    },
    get isDirty() {
      return isDirty;
    },
  };
}

const BOTTOM_NAV_TAB_LABELS = Object.freeze({
  recipes: 'Recipes',
  shopping: 'Items',
  'shopping-list': 'List',
  stores: 'Stores',
  tags: 'Tags',
  sizes: 'Sizes',
  units: 'Units',
});

function syncBottomNavPills(pillRow) {
  if (!(pillRow instanceof HTMLElement)) return;
  const order = getTopLevelPageOrder();
  const existing = new Map();
  Array.from(pillRow.querySelectorAll('.bottom-nav-pill')).forEach((p) => {
    const tab = String(p.dataset.tab || '').trim();
    if (tab) existing.set(tab, p);
  });
  const frag = document.createDocumentFragment();
  for (const tab of order) {
    let pill = existing.get(tab);
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'bottom-nav-pill';
      pill.dataset.tab = tab;
    }
    const label = BOTTOM_NAV_TAB_LABELS[tab];
    if (label) pill.textContent = label;
    frag.appendChild(pill);
  }
  while (pillRow.firstChild) pillRow.removeChild(pillRow.firstChild);
  pillRow.appendChild(frag);
}

function applyBottomNavActiveState(pillRow, activeTab) {
  if (!(pillRow instanceof HTMLElement)) return;
  pillRow.querySelectorAll('.bottom-nav-pill').forEach((pill) => {
    const tab = pill.dataset.tab;
    const isActive = tab === activeTab;
    pill.classList.toggle('bottom-nav-pill--active', isActive);
    if (isActive) pill.setAttribute('aria-current', 'page');
    else pill.removeAttribute('aria-current');
  });
}

function getListPageBottomNavActiveTab() {
  const body = document.body;
  if (!body) return null;
  if (body.classList.contains('recipes-page')) return 'recipes';
  if (body.classList.contains('shopping-page')) return 'shopping';
  if (body.classList.contains('shopping-list-page')) return 'shopping-list';
  if (body.classList.contains('units-page')) return 'units';
  if (body.classList.contains('sizes-page')) return 'sizes';
  if (body.classList.contains('stores-page')) return 'stores';
  if (body.classList.contains('tags-page')) return 'tags';
  return null;
}

async function runFavoriteEatsShoppingListRowEditNavigateGuard() {
  if (detectPageIdFromBody() !== 'shopping-list') return true;
  const guard = window.favoriteEatsShoppingListRowEditNavigateGuard;
  if (typeof guard !== 'function') return true;
  try {
    return !!(await guard());
  } catch (err) {
    console.warn('Shopping list navigation guard failed:', err);
    return false;
  }
}

function reconcileAfterPlannerModeToggle() {
  const pillRow = document.querySelector('.bottom-nav-pill-row');
  const activeTab = getListPageBottomNavActiveTab();
  if (pillRow instanceof HTMLElement) {
    syncBottomNavPills(pillRow);
    if (activeTab) applyBottomNavActiveState(pillRow, activeTab);
  }
  const nextPages = getTopLevelPageOrder();
  const currentPage = String(activeTab || detectPageIdFromBody() || '')
    .trim()
    .toLowerCase();
  if (!nextPages.includes(currentPage)) {
    if (currentPage === 'recipe-editor') {
      void loadRecipeEditorPage();
      return;
    }
    const targetPage = nextPages.includes('recipes')
      ? 'recipes'
      : nextPages[0] || 'recipes';
    window.location.href = getTopLevelPageHref(targetPage);
  }
}

function syncBottomNavEditingToggleCheckedState() {
  const bottomNavEditorToggle = document.getElementById(
    'bottomNavEditorToggle',
  );
  if (bottomNavEditorToggle instanceof HTMLInputElement) {
    bottomNavEditorToggle.checked = !isPlannerModeEnabled();
  }
}

let favoriteEatsPlannerModeShortcutWired = false;
function wireFavoriteEatsPlannerModeShortcutOnce() {
  if (favoriteEatsPlannerModeShortcutWired) return;
  favoriteEatsPlannerModeShortcutWired = true;
  document.addEventListener(
    'keydown',
    async (e) => {
      if (e.isComposing) return;
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
      const key = String(e.key || '').toLowerCase();
      if (key === 'e') {
        if (!isHiddenPlannerModeToggleAllowed()) return;
        if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
          return;
        if (isModalOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        if (!(await runFavoriteEatsShoppingListRowEditNavigateGuard())) return;
        setPlannerModeEnabled(!isPlannerModeEnabled());
        syncBottomNavEditingToggleCheckedState();
        reconcileAfterPlannerModeToggle();
        return;
      }
      if (key === 'l') {
        if (!isPlannerModeEnabled()) return;
        if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
          return;
        if (isModalOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        if (detectPageIdFromBody() === 'shopping-list') return;
        window.location.href = getTopLevelPageHref('shopping-list');
        return;
      }
      if (key === 'p') {
        if (isTypingContext(e.target) && !isAppBarSearchContext(e.target))
          return;
        if (isModalOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        if (detectPageIdFromBody() === 'recipes') return;
        if (!(await runFavoriteEatsShoppingListRowEditNavigateGuard())) return;
        window.location.href = getTopLevelPageHref('recipes');
      }
    },
    { capture: true },
  );
}

wireFavoriteEatsPlannerModeShortcutOnce();

// --- Bottom navigation wiring (list pages only) ---
function initBottomNav() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;

  // Hidden-by-default sheet model: rely on CSS class.
  nav.classList.add('bottom-nav--hidden');

  const pillRow = nav.querySelector('.bottom-nav-pill-row');
  if (pillRow instanceof HTMLElement) {
    syncBottomNavPills(pillRow);
  }

  if (
    isHiddenPlannerModeToggleAllowed() &&
    pillRow instanceof HTMLElement &&
    !nav.querySelector('.bottom-nav-editor-section')
  ) {
    const editorSection = document.createElement('div');
    editorSection.className = 'bottom-nav-editor-section';
    const editorLabel = document.createElement('label');
    editorLabel.className = 'bottom-nav-editor-toggle';
    const editorTitle = document.createElement('span');
    editorTitle.textContent = 'Editing';
    const switchTrack = document.createElement('span');
    switchTrack.className = 'bottom-nav-editor-switch-track';
    const editorToggle = document.createElement('input');
    editorToggle.type = 'checkbox';
    editorToggle.id = 'bottomNavEditorToggle';
    editorToggle.className = 'bottom-nav-editor-switch-input';
    editorToggle.setAttribute('aria-label', 'Editing');
    const switchKnob = document.createElement('span');
    switchKnob.className = 'bottom-nav-editor-switch-knob';
    switchTrack.appendChild(editorToggle);
    switchTrack.appendChild(switchKnob);
    editorLabel.appendChild(editorTitle);
    editorLabel.appendChild(switchTrack);
    const editorSeparator = document.createElement('div');
    editorSeparator.className = 'bottom-nav-editor-separator';
    editorSeparator.setAttribute('role', 'presentation');
    editorSection.appendChild(editorLabel);
    editorSection.appendChild(editorSeparator);
    nav.insertBefore(editorSection, pillRow);
  }

  const pills = Array.from(nav.querySelectorAll('.bottom-nav-pill'));
  if (!pills.length) return;

  const body = document.body;
  let activeTab = null;

  if (body.classList.contains('recipes-page')) {
    activeTab = 'recipes';
  } else if (body.classList.contains('shopping-page')) {
    activeTab = 'shopping';
  } else if (body.classList.contains('shopping-list-page')) {
    activeTab = 'shopping-list';
  } else if (body.classList.contains('units-page')) {
    activeTab = 'units';
  } else if (body.classList.contains('sizes-page')) {
    activeTab = 'sizes';
  } else if (body.classList.contains('stores-page')) {
    activeTab = 'stores';
  } else if (body.classList.contains('tags-page')) {
    activeTab = 'tags';
  }

  const BOTTOM_NAV_EDIT_TOGGLE_AUTO_CLOSE_MS = 500;
  let bottomNavEditToggleAutoCloseTimer = null;

  const isNavOpen = () => !nav.classList.contains('bottom-nav--hidden');

  const clearBottomNavEditToggleAutoCloseTimer = () => {
    if (bottomNavEditToggleAutoCloseTimer != null) {
      clearTimeout(bottomNavEditToggleAutoCloseTimer);
      bottomNavEditToggleAutoCloseTimer = null;
    }
  };

  const closeNav = () => {
    clearBottomNavEditToggleAutoCloseTimer();
    nav.classList.add('bottom-nav--hidden');
  };

  const openNav = () => {
    clearBottomNavEditToggleAutoCloseTimer();
    nav.classList.remove('bottom-nav--hidden');
  };

  const scheduleNavAutoCloseAfterEditToggle = () => {
    if (!isNavOpen()) return;
    clearBottomNavEditToggleAutoCloseTimer();
    bottomNavEditToggleAutoCloseTimer = setTimeout(() => {
      bottomNavEditToggleAutoCloseTimer = null;
      closeNav();
    }, BOTTOM_NAV_EDIT_TOGGLE_AUTO_CLOSE_MS);
  };

  const bottomNavEditorToggle = document.getElementById(
    'bottomNavEditorToggle',
  );
  if (bottomNavEditorToggle && pillRow instanceof HTMLElement) {
    bottomNavEditorToggle.checked = !isPlannerModeEnabled();
    bottomNavEditorToggle.addEventListener('change', async () => {
      if (!(await runFavoriteEatsShoppingListRowEditNavigateGuard())) {
        syncBottomNavEditingToggleCheckedState();
        return;
      }
      setPlannerModeEnabled(!bottomNavEditorToggle.checked);
      reconcileAfterPlannerModeToggle();
      scheduleNavAutoCloseAfterEditToggle();
    });
  }

  // Shared toggle handler for menu icon + app-bar title.

  const menuButton = document.getElementById('appBarMenuBtn');
  const titleToggle = document.getElementById('appBarTitle');

  const toggleNavVisibility = () => {
    if (!isNavOpen()) {
      if (typeof window.favoriteEatsCloseMonogramAccountMenu === 'function') {
        window.favoriteEatsCloseMonogramAccountMenu();
      }
      openNav();
      return;
    }
    closeNav();
  };

  // Menu icon toggles bottom nav visibility on list pages.
  if (menuButton) {
    menuButton.addEventListener('click', () => {
      toggleNavVisibility();
    });
  }

  // App-bar title also acts as a nav toggle.
  if (titleToggle) {
    titleToggle.addEventListener('click', () => {
      toggleNavVisibility();
    });
  }

  // Click-outside / blur-to-dismiss behavior.
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('bottom-nav--hidden')) return;

    const target = event.target;

    // Ignore clicks inside nav or on the toggle controls.
    if (
      nav.contains(target) ||
      (menuButton && (menuButton === target || menuButton.contains(target))) ||
      (titleToggle && (titleToggle === target || titleToggle.contains(target)))
    ) {
      return;
    }

    const monogramMenu = document.getElementById('appBarMonogramMenu');
    const monogramBtnEl = document.getElementById('appBarMonogram');
    if (
      (monogramMenu && monogramMenu.contains(target)) ||
      (monogramBtnEl &&
        (monogramBtnEl === target || monogramBtnEl.contains(target)))
    ) {
      return;
    }

    closeNav();
  });

  if (pillRow instanceof HTMLElement) {
    applyBottomNavActiveState(pillRow, activeTab);
    const prefetchTopLevelPage = (tabId) => {
      if (!tabId || tabId === activeTab) return;
      const href = getTopLevelPageHref(tabId);
      if (!href) return;
      for (const el of document.head.querySelectorAll(
        'link[rel="prefetch"][data-fe-top-prefetch]',
      )) {
        if (el.getAttribute('data-fe-top-prefetch') === href) return;
      }
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.setAttribute('data-fe-top-prefetch', href);
      document.head.appendChild(link);
    };
    pillRow.addEventListener(
      'pointerenter',
      (event) => {
        const pill =
          event.target &&
          typeof event.target.closest === 'function' &&
          event.target.closest('.bottom-nav-pill');
        if (!pill || !pillRow.contains(pill)) return;
        prefetchTopLevelPage(pill.dataset.tab);
      },
      { passive: true },
    );
    pillRow.addEventListener('click', async (event) => {
      const pill =
        event.target &&
        typeof event.target.closest === 'function' &&
        event.target.closest('.bottom-nav-pill');
      if (!pill || !pillRow.contains(pill)) return;
      const tab = pill.dataset.tab;
      if (!tab) return;
      if (tab === activeTab) {
        closeNav();
        const ae = document.activeElement;
        if (ae && typeof ae.blur === 'function') ae.blur();
        return;
      }
      if (!(await runFavoriteEatsShoppingListRowEditNavigateGuard())) {
        closeNav();
        return;
      }
      window.location.href = getTopLevelPageHref(tab);
    });
  }
}

function getVisibleIngredientNamePool(db) {
  void db;
  return [];
}

async function getVisibleIngredientNamePoolViaDataService(db) {
  const useDataDoor =
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.loadTypeaheadPools === 'function';

  if (useDataDoor) {
    window.dataService.useSupabase = true;
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const pools = await window.dataService.loadTypeaheadPools();
      return Array.isArray(pools?.ingredientNames) ? pools.ingredientNames : [];
    } catch (err) {
      console.error('dataService.loadTypeaheadPools failed:', err);
      return [];
    }
  }
  if (!db) return [];
  return getVisibleIngredientNamePool(db);
}

async function getVisibleVariantPoolForIngredientViaDataService(
  db,
  ingredientName,
  fallback,
) {
  const normalizedName = String(ingredientName || '').trim();
  const useDataDoor =
    !!normalizedName &&
    favoriteEatsShouldUseSupabaseDataDoor() &&
    window.dataService &&
    typeof window.dataService.loadTypeaheadPools === 'function';

  if (useDataDoor) {
    window.dataService.useSupabase = true;
    try {
      if (db && typeof window.dataService.setSqliteDb === 'function') {
        window.dataService.setSqliteDb(db);
      }
      const pools = await window.dataService.loadTypeaheadPools({
        ingredientName: normalizedName,
      });
      return Array.isArray(pools?.variantNames) ? pools.variantNames : [];
    } catch (err) {
      console.error('dataService.loadTypeaheadPools failed:', err);
      return [];
    }
  }
  return typeof fallback === 'function' ? fallback() : [];
}

function normalizeRecipeTagDraftList(rawTags) {
  const source = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((tag) => {
      const clipped = tag.length > 48 ? tag.slice(0, 48).trim() : tag;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

async function getVisibleTagNamePool() {
  if (window.dataService && typeof window.dataService.listTags === 'function') {
    try {
      const rows = await window.dataService.listTags();
      const seen = new Set();
      return (Array.isArray(rows) ? rows : [])
        .map((row) => String(row?.name || '').trim())
        .filter((name) => {
          if (!name) return false;
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (err) {
      console.error('dataService.listTags failed:', err);
    }
  }
  return [];
}

async function getVisibleIngredientTagNamePool() {
  if (
    window.dataService &&
    typeof window.dataService.listIngredientTagNames === 'function'
  ) {
    try {
      return await window.dataService.listIngredientTagNames();
    } catch (err) {
      console.error('dataService.listIngredientTagNames failed:', err);
    }
  }
  return [];
}

async function getVisibleVariantTagNamePool() {
  return getVisibleIngredientTagNamePool();
}

function normalizeRecipeSizeNameList(rawSizes) {
  const source = Array.isArray(rawSizes)
    ? rawSizes
    : String(rawSizes || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((size) => {
      const clipped = size.length > 64 ? size.slice(0, 64).trim() : size;
      if (!clipped) return;
      const key = clipped.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clipped);
    });
  return out;
}

async function getVisibleSizeNamePool() {
  if (
    window.dataService &&
    typeof window.dataService.listSizes === 'function'
  ) {
    try {
      const rows = await window.dataService.listSizes();
      const names = [];
      const seen = new Set();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (row?.isRemoved) return;
        const name = String(row?.name || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        names.push(name);
      });
      return sortSizeNames(names);
    } catch (err) {
      console.error('dataService.listSizes failed:', err);
    }
  }
  return [];
}

function normalizeRecipeUnitCodeList(rawUnits) {
  const source = Array.isArray(rawUnits)
    ? rawUnits
    : String(rawUnits || '')
        .split('\n')
        .map((v) => v.trim());
  const seen = new Set();
  const out = [];
  source
    .map((v) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .forEach((code) => {
      const key = code.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(code);
    });
  return out;
}

async function getVisibleUnitCodePool() {
  if (
    window.dataService &&
    typeof window.dataService.listUnits === 'function'
  ) {
    try {
      const rows = await window.dataService.listUnits();
      const seen = new Set();
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => !row?.isRemoved)
        .map((row) => String(row?.code || '').trim())
        .filter((code) => {
          if (!code) return false;
          const key = code.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    } catch (err) {
      console.error('dataService.listUnits failed:', err);
    }
  }
  return [];
}

async function resolveUnknownIngredientNames({
  db,
  names,
  title = '',
  message = '',
}) {
  const list = Array.isArray(names) ? names : [];
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleIngredientNamePoolViaDataService(db);
  const result = await ui.unknownItems({
    title: title || `New ingredients (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This ingredient is not in your database. Edit, match it to an existing ingredient, or save it as a new one.'
        : 'These ingredients are not in your database. Edit, match them to existing ingredients, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacement = String(row?.value || '').trim();
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownIngredientVariants({
  db,
  variantLookup,
  entries,
  title = '',
  message = '',
}) {
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') return null;

  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return { map: new Map() };
  const variantLookupResolved = variantLookup || null;
  if (!variantLookupResolved || !variantLookupResolved.hasVariantTable)
    return { map: new Map() };

  const deduped = [];
  const seen = new Set();
  rows.forEach((row) => {
    const ingredientId = Number(row?.ingredientId);
    const ingredientName = String(row?.ingredientName || '').trim();
    const variant = String(row?.variant || '').trim();
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variant) return;
    const key = `${ingredientId}::${variant.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({ ingredientId, ingredientName, variant });
  });
  if (!deduped.length) return { map: new Map() };

  const groups = new Map();
  deduped.forEach((entry) => {
    if (!groups.has(entry.ingredientId)) groups.set(entry.ingredientId, []);
    groups.get(entry.ingredientId).push(entry);
  });

  const replacementMap = new Map();
  for (const [ingredientId, groupEntries] of groups.entries()) {
    const ingredientName =
      String(groupEntries[0]?.ingredientName || '').trim() ||
      variantLookupResolved.getIngredientNameById(ingredientId) ||
      'ingredient';
    const suggestionPool =
      await getVisibleVariantPoolForIngredientViaDataService(
        db,
        ingredientName,
        () =>
          variantLookupResolved.getVisibleVariantPoolForIngredientId(
            ingredientId,
          ),
      );
    const dialogTitle =
      title ||
      `${
        groupEntries.length === 1 ? 'New variant' : 'New variants'
      } for ${ingredientName} (${groupEntries.length})`;
    const dialogMessage =
      message ||
      (groupEntries.length === 1
        ? `This variant for ${ingredientName} is not in your database. Edit, match it to an existing variant, or save it as a new one.`
        : `These variants for ${ingredientName} are not in your database. Edit, match them to existing variants, or save them as new ones.`);
    const result = await ui.unknownItems({
      title: dialogTitle,
      message: dialogMessage,
      items: groupEntries.map((entry) => entry.variant),
      suggestionPool,
      applyAllText: 'Apply all',
      cancelText: 'Cancel',
      editText: 'Edit',
      saveText: 'Save',
    });
    if (!result || !Array.isArray(result.rows)) return null;
    result.rows.forEach((row) => {
      const original = String(row?.original || '').trim();
      const replacement = String(row?.value || '').trim();
      if (!original || !replacement) return;
      const key = `${ingredientId}::${original.toLowerCase()}`;
      replacementMap.set(key, replacement);
    });
  }

  return { map: replacementMap };
}

function collectUnknownStoreAisleVariantEntries(
  aisleRows,
  aisleItemSpecsByAisle,
  {
    cloneSpecs,
    isSupportedVariantName,
    isStoreAisleReservedVariantToken,
    normVariantKey,
    resolveIngredientId,
    anyVariantForIngredient,
    getIngredientNameById,
  },
) {
  const unknownVariantUnique = [];
  const seenUnknownVariants = new Set();
  for (const aisle of Array.isArray(aisleRows) ? aisleRows : []) {
    const specs = cloneSpecs(aisleItemSpecsByAisle.get(aisle.id) || []);
    for (const spec of specs) {
      const base = String(spec?.baseName || '').trim();
      if (!base) continue;
      const ingredientId = Number(resolveIngredientId(spec, base));
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) continue;
      const selected = (spec.selectedVariants || []).filter((variantName) =>
        isSupportedVariantName(variantName),
      );
      for (const variantName of selected) {
        if (isStoreAisleReservedVariantToken(variantName)) continue;
        if (anyVariantForIngredient(ingredientId, variantName)) continue;
        const key = `${ingredientId}::${normVariantKey(variantName)}`;
        if (!key || seenUnknownVariants.has(key)) continue;
        seenUnknownVariants.add(key);
        unknownVariantUnique.push({
          ingredientId,
          ingredientName: getIngredientNameById(ingredientId) || base,
          variant: variantName,
        });
      }
    }
  }
  return unknownVariantUnique;
}

function applyStoreAisleVariantReplacementMap(
  aisleRows,
  aisleItemSpecsByAisle,
  replacementMap,
  {
    cloneSpecs,
    isSupportedVariantName,
    normVariantKey,
    resolveIngredientId,
  },
) {
  for (const aisle of Array.isArray(aisleRows) ? aisleRows : []) {
    const specs = cloneSpecs(aisleItemSpecsByAisle.get(aisle.id) || []);
    specs.forEach((spec) => {
      const base = String(spec?.baseName || '').trim();
      const ingredientId = Number(resolveIngredientId(spec, base));
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
      const nextSelected = [];
      const seenSelected = new Set();
      (spec.selectedVariants || []).forEach((variantName) => {
        const original = String(variantName || '').trim();
        if (!isSupportedVariantName(original)) return;
        const key = `${ingredientId}::${normVariantKey(original)}`;
        const replacement = String(replacementMap.get(key) || original).trim();
        if (!isSupportedVariantName(replacement)) return;
        const replacementKey = normVariantKey(replacement);
        if (!replacementKey || seenSelected.has(replacementKey)) return;
        seenSelected.add(replacementKey);
        nextSelected.push(replacement);
      });
      spec.selectedVariants = nextSelected;
    });
    aisleItemSpecsByAisle.set(aisle.id, specs);
  }
}

/**
 * Store layout save: prompt before persisting aisle tokens that would create
 * new catalog variants (save_store_layout materializes missing variants).
 * @returns {Promise<boolean>} false when the user cancels; true to proceed.
 */
async function runStoreLayoutUnknownVariantSpeedBump({
  aisleRows,
  aisleItemSpecsByAisle,
  cloneSpecs,
  isSupportedVariantName,
  isStoreAisleReservedVariantToken,
  normVariantKey,
}) {
  const dataService = window.dataService;
  if (
    !dataService ||
    typeof dataService.buildRecipeEditorPreflightHelpers !== 'function'
  ) {
    return true;
  }

  let variantHelpers = null;
  let getVisibleCanonicalId = null;
  try {
    dataService.useSupabase = true;
    const bundle = await dataService.buildRecipeEditorPreflightHelpers();
    variantHelpers = bundle?.variant || null;
    getVisibleCanonicalId = bundle?.ingredient?.getVisibleCanonicalId || null;
  } catch (err) {
    console.warn('buildRecipeEditorPreflightHelpers failed:', err);
    return true;
  }

  if (!variantHelpers?.hasVariantTable) return true;

  const { anyVariantForIngredient, getIngredientNameById } = variantHelpers;
  const resolveIngredientId = (spec, baseName) => {
    const fromSpec = Number(spec?.ingredientId);
    if (Number.isFinite(fromSpec) && fromSpec > 0) return fromSpec;
    if (typeof getVisibleCanonicalId === 'function') {
      return Number(getVisibleCanonicalId(baseName));
    }
    return NaN;
  };

  const speedBumpOptions = {
    cloneSpecs,
    isSupportedVariantName,
    isStoreAisleReservedVariantToken,
    normVariantKey,
    resolveIngredientId,
    anyVariantForIngredient,
    getIngredientNameById,
  };

  const unknownVariantUnique = collectUnknownStoreAisleVariantEntries(
    aisleRows,
    aisleItemSpecsByAisle,
    speedBumpOptions,
  );
  if (!unknownVariantUnique.length) return true;

  const resolvedVariants = await resolveUnknownIngredientVariants({
    db: null,
    variantLookup: variantHelpers,
    entries: unknownVariantUnique,
  });
  if (!resolvedVariants) return false;

  applyStoreAisleVariantReplacementMap(
    aisleRows,
    aisleItemSpecsByAisle,
    resolvedVariants.map,
    speedBumpOptions,
  );
  return true;
}

async function resolveUnknownTagNames({ db, tags, title = '', message = '' }) {
  const list = normalizeRecipeTagDraftList(tags);
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleTagNamePool();
  const result = await ui.unknownItems({
    title: title || `New tags (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This tag is not in your database. Edit, match it to an existing tag, or save it as a new one.'
        : 'These tags are not in your database. Edit, match them to existing tags, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeTagDraftList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownSizeNames({
  db,
  sizes,
  title = '',
  message = '',
}) {
  const list = normalizeRecipeSizeNameList(sizes);
  if (!list.length) return { map: new Map(), finalNames: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleSizeNamePool();
  const result = await ui.unknownItems({
    title: title || `New sizes (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This size is not in your database. Edit, match it to an existing size, or save it as a new one.'
        : 'These sizes are not in your database. Edit, match them to existing sizes, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalNames = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeSizeNameList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalNames.push(replacement);
  });
  return { map, finalNames };
}

async function resolveUnknownUnitCodes({
  db,
  units,
  title = '',
  message = '',
}) {
  const list = normalizeRecipeUnitCodeList(units);
  if (!list.length) return { map: new Map(), finalCodes: [] };
  const ui = window.ui;
  if (!ui || typeof ui.unknownItems !== 'function') {
    return null;
  }
  const suggestionPool = await getVisibleUnitCodePool();
  const result = await ui.unknownItems({
    title: title || `New units (${list.length})`,
    message:
      message ||
      (list.length === 1
        ? 'This unit is not in your database. Edit, match it to an existing unit, or save it as a new one.'
        : 'These units are not in your database. Edit, match them to existing units, or save them as new ones.'),
    items: list,
    suggestionPool,
    applyAllText: 'Apply all',
    cancelText: 'Cancel',
    editText: 'Edit',
    saveText: 'Save',
  });
  if (!result || !Array.isArray(result.rows)) return null;

  const map = new Map();
  const finalCodes = [];
  const seenFinal = new Set();
  result.rows.forEach((row) => {
    const key = String(row?.original || '')
      .trim()
      .toLowerCase();
    const replacementRaw = String(row?.value || '').trim();
    const replacement = replacementRaw
      ? normalizeRecipeUnitCodeList([replacementRaw])[0] || ''
      : '';
    if (!key || !replacement) return;
    map.set(key, replacement);
    const rk = replacement.toLowerCase();
    if (seenFinal.has(rk)) return;
    seenFinal.add(rk);
    finalCodes.push(replacement);
  });
  return { map, finalCodes };
}

// --- Recipe editor loader (Slice 7 phase 2 — UI in js/screens/recipeEditorPage.js) ---
async function loadRecipeEditorPage() {
  registerFavoriteEatsRecipeEditorPageBridge();
  if (
    window.favoriteEatsRecipeEditorPage &&
    typeof window.favoriteEatsRecipeEditorPage.loadRecipeEditorPage ===
      'function'
  ) {
    return window.favoriteEatsRecipeEditorPage.loadRecipeEditorPage();
  }
  uiToast('Recipe editor failed to load.');
  window.location.href = favoriteEatsHrefWithCurrentAdapter('recipes.html');
}

async function favoriteEatsAttemptEditorExitBeforeNavigate(options = {}) {
  if (typeof window.recipeEditorAttemptExit === 'function') {
    return !!(await window.recipeEditorAttemptExit(options));
  }
  if (typeof window.favoriteEatsChildEditorAttemptExit === 'function') {
    return !!(await window.favoriteEatsChildEditorAttemptExit(options));
  }
  if (typeof options.onClean === 'function') {
    await options.onClean();
  }
  return true;
}

window.openRecipe = function openRecipe(recipeId, displayTitleRaw) {
  const rid = Number(recipeId);
  if (!Number.isFinite(rid) || rid <= 0) return;
  const proceed = () => {
    setSelectedRecipeNavigationSession(rid, displayTitleRaw);
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('recipeEditor.html');
  };
  void favoriteEatsAttemptEditorExitBeforeNavigate({
    reason: 'open-recipe',
    onClean: proceed,
    onDiscard: proceed,
    onSaveSuccess: proceed,
  });
};

/**
 * Open the store editor; optionally focus an aisle after load (see STORE_EDITOR_FOCUS_AISLE_SESSION_KEY).
 * @param {number} storeId
 * @param {number} [aisleId]
 * @param {string} [chainName]
 * @param {string} [locationName]
 */
window.openStoreAisle = function openStoreAisle(
  storeId,
  aisleId,
  chainName,
  locationName,
) {
  const sid = Number(storeId);
  if (!Number.isFinite(sid) || sid <= 0) return;
  const aid = Number(aisleId);
  const proceed = () => {
    sessionStorage.setItem('selectedStoreId', String(sid));
    sessionStorage.removeItem('selectedStoreIsNew');
    if (chainName != null)
      sessionStorage.setItem('selectedStoreChain', String(chainName));
    if (locationName != null)
      sessionStorage.setItem('selectedStoreLocation', String(locationName));
    if (Number.isFinite(aid) && aid > 0) {
      sessionStorage.setItem(STORE_EDITOR_FOCUS_AISLE_SESSION_KEY, String(aid));
    } else {
      sessionStorage.removeItem(STORE_EDITOR_FOCUS_AISLE_SESSION_KEY);
    }
    window.location.href =
      favoriteEatsHrefWithCurrentAdapter('storeEditor.html');
  };
  void favoriteEatsAttemptEditorExitBeforeNavigate({
    reason: 'open-store-aisle',
    onClean: proceed,
    onDiscard: proceed,
    onSaveSuccess: proceed,
  });
};
