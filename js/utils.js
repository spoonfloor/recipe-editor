// Utility functions

window.favoriteEatsSessionKeys = window.favoriteEatsSessionKeys || {
  shoppingNavTargetId: 'favoriteEats:shopping-nav-target-id',
  shoppingNavTargetName: 'favoriteEats:shopping-nav-target-name',
  /** Set only when completing welcome/login; moniker toasts require this until logout/reload policy. */
  monikerPresenceToastsArmed: 'favoriteEats.monikerPresenceToastsArmed',
};
try {
  if (!window.favoriteEatsSessionKeys.monikerPresenceToastsArmed) {
    window.favoriteEatsSessionKeys.monikerPresenceToastsArmed =
      'favoriteEats.monikerPresenceToastsArmed';
  }
} catch (_) {}
window.favoriteEatsStorageKeys = window.favoriteEatsStorageKeys || {
  recipePlannerServings: 'favoriteEats:recipe-planner-servings:v1',
};
window.favoriteEatsEventNames = window.favoriteEatsEventNames || {
  recipePlannerServingsChanged: 'favoriteEats:recipe-planner-servings-changed',
};
/** Prior `localStorage` key for list-stepper servings overrides (migrate on read). */
const RECIPE_PLANNER_SERVINGS_STORAGE_KEY_LEGACY =
  'favoriteEats:recipe-web-servings:v1';

window.favoriteEatsCoPresenceEarliestOkAtTs =
  typeof window.favoriteEatsCoPresenceEarliestOkAtTs === 'number'
    ? window.favoriteEatsCoPresenceEarliestOkAtTs
    : 0;
window.favoriteEatsCoPresenceLoginEventArmed =
  window.favoriteEatsCoPresenceLoginEventArmed === true;

/** Shared duration for `window.ui.toast`, undo toasts, and identity toast timing. */
const UI_TOAST_MS = 3500;

/**
 * Auto-dismiss duration for “Logged in as …” — must stay aligned with
 * `window.ui.toast` (see toast() in this file).
 */
const FAVORITE_EATS_IDENTITY_TOAST_VISIBLE_MS = UI_TOAST_MS;

/** Quiet gap after that toast is removed, before co-presence may show. */
const FAVORITE_EATS_IDENTITY_TO_COHORT_GAP_MS = 500;

/**
 * @param {number} identityAppearDelayMs — delay before identity toast is shown
 * @param {number} [identityVisibleMs] — how long identity toast stays up (auto-dismiss); default matches ui.toast
 * @param {number} [postDismissGapMs] — ms after dismiss before “also active”; default 500
 */
function favoriteEatsSetCoPresenceAllowedAfterIdentityToast(
  identityAppearDelayMs,
  identityVisibleMs,
  postDismissGapMs,
) {
  const d = Math.max(0, Number(identityAppearDelayMs) || 0);
  const visible =
    identityVisibleMs != null
      ? Math.max(1000, Number(identityVisibleMs) || 0)
      : FAVORITE_EATS_IDENTITY_TOAST_VISIBLE_MS;
  const g =
    postDismissGapMs != null
      ? Math.max(0, Number(postDismissGapMs) || 0)
      : FAVORITE_EATS_IDENTITY_TO_COHORT_GAP_MS;
  try {
    window.favoriteEatsCoPresenceEarliestOkAtTs = Date.now() + d + visible + g;
    window.favoriteEatsCoPresenceLoginEventArmed = true;
  } catch (_) {}
}

function favoriteEatsConsumeCoPresenceLoginEventArm() {
  try {
    if (window.favoriteEatsCoPresenceLoginEventArmed !== true) return false;
    window.favoriteEatsCoPresenceLoginEventArmed = false;
    return true;
  } catch (_) {
    return false;
  }
}

function favoriteEatsDeferUntilCoPresenceEarliest(fn) {
  if (typeof fn !== 'function') return;
  let delay = 0;
  try {
    const earliest = Number(window.favoriteEatsCoPresenceEarliestOkAtTs) || 0;
    const now = Date.now();
    if (earliest > 0 && now < earliest) {
      delay = earliest - now;
    }
  } catch (_) {}
  if (delay > 0) {
    window.setTimeout(fn, delay);
    return;
  }
  try {
    fn();
  } catch (_) {}
}

window.favoriteEatsSetCoPresenceAllowedAfterIdentityToast =
  favoriteEatsSetCoPresenceAllowedAfterIdentityToast;
window.favoriteEatsConsumeCoPresenceLoginEventArm =
  favoriteEatsConsumeCoPresenceLoginEventArm;
window.favoriteEatsDeferUntilCoPresenceEarliest =
  favoriteEatsDeferUntilCoPresenceEarliest;

function favoriteEatsNavigationIsReload() {
  try {
    const entries = performance.getEntriesByType('navigation');
    const nav = entries && entries[0];
    if (nav && nav.type === 'reload') return true;
  } catch (_) {}
  try {
    if (
      typeof performance !== 'undefined' &&
      performance.navigation &&
      performance.navigation.type === 1
    ) {
      return true;
    }
  } catch (_) {}
  return false;
}

/** Full reload is not a login event — clear one-shot moniker tokens. */
function favoriteEatsApplyMonikerToastArmPolicyOnNavigation() {
  if (!favoriteEatsNavigationIsReload()) return;
  try {
    sessionStorage.removeItem(
      window.favoriteEatsSessionKeys.monikerPresenceToastsArmed,
    );
    sessionStorage.removeItem('favoriteEats.justLoggedInFromWelcome');
    window.favoriteEatsCoPresenceLoginEventArmed = false;
    window.favoriteEatsCoPresenceEarliestOkAtTs = 0;
  } catch (_) {}
}

window.favoriteEatsApplyMonikerToastArmPolicyOnNavigation =
  favoriteEatsApplyMonikerToastArmPolicyOnNavigation;

function favoriteEatsMonikerPresenceToastsArmed() {
  try {
    return (
      sessionStorage.getItem(
        window.favoriteEatsSessionKeys.monikerPresenceToastsArmed,
      ) === '1'
    );
  } catch (_) {
    return false;
  }
}

window.favoriteEatsMonikerPresenceToastsArmed =
  favoriteEatsMonikerPresenceToastsArmed;

function favoriteEatsPerformSessionLogout() {
  try {
    sessionStorage.removeItem('favoriteEats.sessionLoginAllowed');
    sessionStorage.removeItem('favoriteEats.justLoggedInFromWelcome');
    sessionStorage.removeItem(
      window.favoriteEatsSessionKeys.monikerPresenceToastsArmed,
    );
    sessionStorage.removeItem('favoriteEatsSplashAccess');
    window.favoriteEatsCoPresenceLoginEventArmed = false;
    window.favoriteEatsCoPresenceEarliestOkAtTs = 0;
  } catch (_) {}
  try {
    sessionStorage.removeItem('favoriteEats.loginSessionId');
    sessionStorage.removeItem('recipeEditor.presence.moniker.v1');
    localStorage.removeItem('favoriteEats.loginSessionId');
    localStorage.removeItem('recipeEditor.presence.moniker.v1');
  } catch (_) {}
  try {
    if (typeof window.clearFavoriteEatsShoppingSessionCache === 'function') {
      window.clearFavoriteEatsShoppingSessionCache();
    }
  } catch (_) {}
}

function favoriteEatsCloseMonogramAccountMenu() {
  const m = document.getElementById('appBarMonogramMenu');
  if (m) m.classList.add('bottom-nav--hidden');
  const b = document.getElementById('appBarMonogram');
  if (b) b.setAttribute('aria-expanded', 'false');
}

let favoriteEatsMonogramBackdropListenerBound = false;

function favoriteEatsOnMonogramMenuBackdropClick(ev) {
  const m = document.getElementById('appBarMonogramMenu');
  if (!m || m.classList.contains('bottom-nav--hidden')) return;
  const t = ev.target;
  const monogramBtn = document.getElementById('appBarMonogram');
  if (
    m.contains(t) ||
    (monogramBtn && (monogramBtn === t || monogramBtn.contains(t)))
  ) {
    return;
  }
  favoriteEatsCloseMonogramAccountMenu();
}

function favoriteEatsBindMonogramMenuOutsideDismissOnce() {
  if (favoriteEatsMonogramBackdropListenerBound) return;
  favoriteEatsMonogramBackdropListenerBound = true;
  document.addEventListener('click', favoriteEatsOnMonogramMenuBackdropClick);
}

function favoriteEatsAppActivityHasOthersActive() {
  try {
    return window.favoriteEatsAppActivityHasOthers === true;
  } catch (_) {
    return false;
  }
}

function favoriteEatsSyncMonogramAlsoActiveButton() {
  const btn = document.getElementById('appBarMonogramAlsoActiveBtn');
  if (!(btn instanceof HTMLButtonElement)) return;
  const active = favoriteEatsAppActivityHasOthersActive();
  btn.disabled = !active;
  btn.setAttribute('aria-disabled', active ? 'false' : 'true');
}

function favoriteEatsLastNameSortKey(displayName) {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts[parts.length - 1];
}

/** Stable A–Z by last token (last “word”) of each moniker, then full string. */
function favoriteEatsSortMonikersByLastName(names) {
  return names.slice().sort((a, b) => {
    const ka = favoriteEatsLastNameSortKey(a);
    const kb = favoriteEatsLastNameSortKey(b);
    let cmp = ka.localeCompare(kb, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    return cmp;
  });
}

function favoriteEatsOpenContributorsModalWithList(rawOthers) {
  const filtered = Array.isArray(rawOthers)
    ? rawOthers
        .map((s) => String(s || '').trim())
        .filter(Boolean)
    : [];
  if (!filtered.length) return;
  const others = favoriteEatsSortMonikersByLastName(filtered);

  const n = others.length;
  const lead =
    n === 1
      ? '1 co-conspirator is in your midst.'
      : String(n) + ' co-conspirators are in your midst.';

  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.className = 'ui-dialog-body';
  p.style.marginTop = '0';
  p.textContent = prettifyModalDisplayText(lead);
  wrap.appendChild(p);
  const ul = document.createElement('ul');
  ul.style.margin = '0';
  ul.style.paddingLeft = '1.25rem';
  ul.style.fontSize = 'var(--body-font-size)';
  for (let i = 0; i < others.length; i += 1) {
    const li = document.createElement('li');
    li.textContent = others[i];
    ul.appendChild(li);
  }
  wrap.appendChild(ul);

  try {
    if (window.ui && typeof window.ui.dialog === 'function') {
      void window.ui.dialog({
        title: 'Currently active',
        message: '',
        messageNode: wrap,
        confirmText: 'Okay',
        showCancel: false,
      });
    }
  } catch (_) {}
}

window.favoriteEatsOpenContributorsModalWithList =
  favoriteEatsOpenContributorsModalWithList;

function favoriteEatsOpenAlsoActiveContributorsModal() {
  if (!favoriteEatsAppActivityHasOthersActive()) return;

  let others = [];
  try {
    others = Array.isArray(window.favoriteEatsAppActivityOtherMonikers)
      ? window.favoriteEatsAppActivityOtherMonikers.slice()
      : [];
  } catch (_) {}

  favoriteEatsOpenContributorsModalWithList(others);
}

let favoriteEatsAlsoActivePresenceListenerBound = false;
function favoriteEatsBindMonogramAlsoActivePresenceListenerOnce() {
  if (favoriteEatsAlsoActivePresenceListenerBound) return;
  favoriteEatsAlsoActivePresenceListenerBound = true;
  window.addEventListener('favoriteEatsAppActivityOthers', () => {
    favoriteEatsSyncMonogramAlsoActiveButton();
  });
}

function favoriteEatsMonikerStorage() {
  if (
    window.recipePresenceMoniker &&
    typeof window.recipePresenceMoniker.getMonikerStorage === 'function'
  ) {
    return window.recipePresenceMoniker.getMonikerStorage();
  }
  return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
}

function favoriteEatsMonikerDisplayLabelForAccountMenu() {
  let moniker = 'Doctor Incognito';
  try {
    const listA = window.NAME_DECK_LIST_A;
    const listB = window.NAME_DECK_LIST_B;
    if (
      Array.isArray(listA) &&
      Array.isArray(listB) &&
      window.recipePresenceMoniker &&
      typeof window.recipePresenceMoniker.getOrCreateMoniker === 'function'
    ) {
      const info = window.recipePresenceMoniker.getOrCreateMoniker(
        listA,
        listB,
        favoriteEatsMonikerStorage(),
      );
      const picked = String((info && info.moniker) || '').trim();
      if (picked) moniker = picked;
    }
  } catch (_) {}
  return moniker;
}

function favoriteEatsBuildMonogramAccountMenuContent(navEl) {
  navEl.replaceChildren();
  const section = document.createElement('div');
  section.className = 'bottom-nav-editor-section';
  const identity = document.createElement('div');
  identity.id = 'appBarMonogramMenuIdentity';
  identity.className = 'bottom-nav-account-identity';
  identity.setAttribute('aria-live', 'polite');
  const sep = document.createElement('div');
  sep.className = 'bottom-nav-editor-separator';
  sep.setAttribute('role', 'presentation');
  section.appendChild(identity);
  section.appendChild(sep);

  const row = document.createElement('div');
  row.className = 'bottom-nav-pill-row';

  let monogramExtraButtons = [];
  try {
    if (typeof window.favoriteEatsMonogramMenuExtraButtons === 'function') {
      const result = window.favoriteEatsMonogramMenuExtraButtons();
      if (Array.isArray(result)) {
        monogramExtraButtons = result.filter((n) => n instanceof HTMLElement);
      }
    }
  } catch (_) {}
  monogramExtraButtons.forEach((node) => row.appendChild(node));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bottom-nav-pill';
  btn.textContent = 'Log out';
  btn.addEventListener('click', () => {
    favoriteEatsPerformSessionLogout();
    window.location.href = 'index.html';
  });
  row.appendChild(btn);

  const alsoBtn = document.createElement('button');
  alsoBtn.type = 'button';
  alsoBtn.id = 'appBarMonogramAlsoActiveBtn';
  alsoBtn.className = 'bottom-nav-pill';
  alsoBtn.textContent = 'Also active';
  alsoBtn.addEventListener('click', () => {
    favoriteEatsOpenAlsoActiveContributorsModal();
  });
  row.appendChild(alsoBtn);

  row.addEventListener(
    'click',
    (e) => {
      const b =
        e.target instanceof Element ? e.target.closest('button') : null;
      if (!b || !row.contains(b)) return;
      favoriteEatsCloseMonogramAccountMenu();
    },
    true,
  );

  navEl.appendChild(section);
  navEl.appendChild(row);

  favoriteEatsBindMonogramAlsoActivePresenceListenerOnce();
  favoriteEatsSyncMonogramAlsoActiveButton();
}

function favoriteEatsSyncMonogramAccountMenuIdentity() {
  const identityEl = document.getElementById('appBarMonogramMenuIdentity');
  if (!identityEl) return;
  const moniker = favoriteEatsMonikerDisplayLabelForAccountMenu();
  identityEl.textContent = 'Logged in as ' + moniker;
}

function favoriteEatsEnsureMonogramAccountMenu() {
  let el = document.getElementById('appBarMonogramMenu');
  const created = !el;
  if (!el) {
    el = document.createElement('nav');
    el.id = 'appBarMonogramMenu';
    el.className =
      'bottom-nav bottom-nav--monogram-menu bottom-nav--hidden no-select';
    el.setAttribute('aria-label', 'Account');
    document.body.appendChild(el);
  }
  if (created || !document.getElementById('appBarMonogramMenuIdentity')) {
    favoriteEatsBuildMonogramAccountMenuContent(el);
  }
  return el;
}

function favoriteEatsToggleMonogramAccountMenu() {
  const m = favoriteEatsEnsureMonogramAccountMenu();
  const opening = m.classList.contains('bottom-nav--hidden');
  if (opening) {
    favoriteEatsSyncMonogramAccountMenuIdentity();
    favoriteEatsSyncMonogramAlsoActiveButton();
    try {
      if (
        typeof window.favoriteEatsSyncMonogramMenuExtraButtons === 'function'
      ) {
        window.favoriteEatsSyncMonogramMenuExtraButtons();
      }
    } catch (_) {}
    try {
      if (
        typeof window.favoriteEatsSyncShoppingListMonogramActions === 'function'
      ) {
        window.favoriteEatsSyncShoppingListMonogramActions();
      }
    } catch (_) {}
    const primary = document.querySelector(
      'nav.bottom-nav[aria-label="Primary"]',
    );
    if (primary) primary.classList.add('bottom-nav--hidden');
    m.classList.remove('bottom-nav--hidden');
    const monogramBtn = document.getElementById('appBarMonogram');
    if (monogramBtn) monogramBtn.setAttribute('aria-expanded', 'true');
    favoriteEatsBindMonogramMenuOutsideDismissOnce();
  } else {
    favoriteEatsCloseMonogramAccountMenu();
  }
}

window.favoriteEatsCloseMonogramAccountMenu = favoriteEatsCloseMonogramAccountMenu;

function favoriteEatsRebuildMonogramAccountMenu() {
  const el = document.getElementById('appBarMonogramMenu');
  if (el) favoriteEatsBuildMonogramAccountMenuContent(el);
}

window.favoriteEatsRebuildMonogramAccountMenu = favoriteEatsRebuildMonogramAccountMenu;

/** Clears prior listeners (e.g. stale onclick) and uses capture so nothing else can show a dialog first. */
let favoriteEatsMonogramMenuAbort = null;
let favoriteEatsMonogramWindowBlurBound = false;

function favoriteEatsEnsureMonogramMenuWindowBlurCloser() {
  if (favoriteEatsMonogramWindowBlurBound) return;
  favoriteEatsMonogramWindowBlurBound = true;
  window.addEventListener('blur', () => {
    favoriteEatsCloseMonogramAccountMenu();
  });
}

function favoriteEatsInstallAppBarMonogramMenuBinding() {
  const monogramBtn = document.getElementById('appBarMonogram');
  if (!(monogramBtn instanceof HTMLElement)) return;

  favoriteEatsEnsureMonogramMenuWindowBlurCloser();
  favoriteEatsBindMonogramAlsoActivePresenceListenerOnce();

  try {
    monogramBtn.setAttribute('aria-haspopup', 'true');
    monogramBtn.setAttribute('aria-expanded', 'false');
  } catch (_) {}

  try {
    monogramBtn.onclick = null;
  } catch (_) {}

  if (favoriteEatsMonogramMenuAbort) {
    try {
      favoriteEatsMonogramMenuAbort.abort();
    } catch (_) {}
  }
  favoriteEatsMonogramMenuAbort = new AbortController();
  const { signal } = favoriteEatsMonogramMenuAbort;

  monogramBtn.addEventListener(
    'click',
    (ev) => {
      try {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      } catch (_) {}
      favoriteEatsToggleMonogramAccountMenu();
    },
    { capture: true, signal },
  );
}

// --- Recipe planner servings helpers (tests extract this block) ---
function getRecipePlannerServingsModelId(recipe, { fallbackRecipeId = null } = {}) {
  const raw =
    recipe && typeof recipe === 'object' && recipe.id != null
      ? Number(recipe.id)
      : Number(fallbackRecipeId);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
}

function loadRecipePlannerServingsMapShared() {
  try {
    const key = window.favoriteEatsStorageKeys.recipePlannerServings;
    let raw = localStorage.getItem(key);
    if (!raw) {
      raw = localStorage.getItem(RECIPE_PLANNER_SERVINGS_STORAGE_KEY_LEGACY);
      if (raw) {
        try {
          localStorage.setItem(key, raw);
        } catch (_) {}
      }
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistRecipePlannerServingsMapShared(nextMap) {
  try {
    localStorage.setItem(
      window.favoriteEatsStorageKeys.recipePlannerServings,
      JSON.stringify(
        nextMap && typeof nextMap === 'object' && !Array.isArray(nextMap)
          ? nextMap
          : {}
      )
    );
  } catch (_) {}
}

function dispatchRecipePlannerServingsChangedShared(recipeId, nextValue) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  const normalizedRecipeId = Number(recipeId);
  if (!Number.isFinite(normalizedRecipeId) || normalizedRecipeId <= 0) return;
  try {
    window.dispatchEvent(
      new CustomEvent(window.favoriteEatsEventNames.recipePlannerServingsChanged, {
        detail: {
          recipeId: Math.trunc(normalizedRecipeId),
          value: nextValue == null ? null : Number(nextValue),
        },
      })
    );
  } catch (_) {}
}

function roundRecipePlannerServingsValueShared(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 2) / 2;
}

function getRecipeBaseServingsDefaultShared(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  if (recipe._plannerModeBaseServingsDefaultInitialized) {
    return recipe._plannerModeBaseServingsDefault;
  }
  let base = recipe.servingsDefault;
  if (
    (base === null || base === undefined || base === '') &&
    recipe.servings &&
    typeof recipe.servings === 'object' &&
    recipe.servings.default != null
  ) {
    base = recipe.servings.default;
  }
  const numeric = Number(base);
  recipe._plannerModeBaseServingsDefault =
    Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
  recipe._plannerModeBaseServingsDefaultInitialized = true;
  return recipe._plannerModeBaseServingsDefault;
}

const RECIPE_PLANNER_SERVINGS_MIN = 0.5;
const RECIPE_PLANNER_SERVINGS_MAX = 99;

function getRecipePlannerServingsBoundsShared(recipe) {
  const baseDefault = getRecipeBaseServingsDefaultShared(recipe);
  if (!Number.isFinite(Number(baseDefault)) || Number(baseDefault) <= 0) {
    // No declared servings: assume a baseline yield of 1 so planner + shopping scale together.
    return {
      baseDefault: 1,
      min: RECIPE_PLANNER_SERVINGS_MIN,
      max: RECIPE_PLANNER_SERVINGS_MAX,
      canAdjust: true,
    };
  }

  let min = RECIPE_PLANNER_SERVINGS_MIN;
  let max = RECIPE_PLANNER_SERVINGS_MAX;

  return {
    baseDefault,
    min,
    max,
    canAdjust: max > min,
  };
}

function invalidateRecipePlannerServingsBaseDefaultShared(recipe) {
  if (!recipe || typeof recipe !== 'object') return;
  delete recipe._plannerModeBaseServingsDefaultInitialized;
  delete recipe._plannerModeBaseServingsDefault;
}

function clampRecipePlannerServingsValueShared(rawValue, bounds) {
  if (!bounds) return null;
  if (bounds.baseDefault == null) {
    const rounded = roundRecipePlannerServingsValueShared(rawValue);
    if (rounded == null) return null;
    return 1;
  }
  const rounded = roundRecipePlannerServingsValueShared(rawValue);
  if (rounded == null) return null;
  return Math.max(bounds.min, Math.min(bounds.max, rounded));
}

function getRecipePlannerServingsStoredValueShared(
  recipe,
  { fallbackRecipeId = null, scrubInvalid = false } = {}
) {
  const recipeId = getRecipePlannerServingsModelId(recipe, { fallbackRecipeId });
  if (recipeId == null) return null;
  const bounds = getRecipePlannerServingsBoundsShared(recipe);
  if (!bounds) return null;
  const storageKey = String(recipeId);
  const map = loadRecipePlannerServingsMapShared();
  const raw = map[storageKey];
  const next = clampRecipePlannerServingsValueShared(raw, bounds);

  if (scrubInvalid) {
    const hasStoredValue = Object.prototype.hasOwnProperty.call(map, storageKey);
    if (next == null || next === bounds.baseDefault) {
      if (hasStoredValue) {
        delete map[storageKey];
        persistRecipePlannerServingsMapShared(map);
      }
    } else if (!hasStoredValue || Number(raw) !== next) {
      map[storageKey] = next;
      persistRecipePlannerServingsMapShared(map);
    }
  }

  return next;
}

function setRecipePlannerServingsStoredValueShared(recipe, nextValue, { fallbackRecipeId = null } = {}) {
  const recipeId = getRecipePlannerServingsModelId(recipe, { fallbackRecipeId });
  if (recipeId == null) return;
  const bounds = getRecipePlannerServingsBoundsShared(recipe);
  if (!bounds) return;
  const map = loadRecipePlannerServingsMapShared();
  const storageKey = String(recipeId);
  const previousRaw = map[storageKey];
  const hadPrevious = Object.prototype.hasOwnProperty.call(map, storageKey);
  const previousEffective =
    clampRecipePlannerServingsValueShared(previousRaw, bounds) ?? bounds.baseDefault;
  const next = clampRecipePlannerServingsValueShared(nextValue, bounds);
  let changed = false;
  if (next == null || next === bounds.baseDefault) {
    if (hadPrevious) {
      delete map[storageKey];
      changed = true;
    }
  } else {
    if (!hadPrevious || Number(previousRaw) !== next) {
      map[storageKey] = next;
      changed = true;
    }
  }
  if (changed) {
    persistRecipePlannerServingsMapShared(map);
  }
  const nextEffective = next ?? bounds.baseDefault;
  if (previousEffective !== nextEffective) {
    dispatchRecipePlannerServingsChangedShared(recipeId, nextEffective);
  }
}

function getRecipeEffectiveServingsShared(
  recipe,
  { fallbackRecipeId = null, scrubInvalid = false } = {}
) {
  const bounds = getRecipePlannerServingsBoundsShared(recipe);
  if (!bounds) return null;
  const stored = getRecipePlannerServingsStoredValueShared(recipe, {
    fallbackRecipeId,
    scrubInvalid,
  });
  const candidate =
    Number.isFinite(Number(stored)) && stored != null ? stored : bounds.baseDefault;
  return clampRecipePlannerServingsValueShared(candidate, bounds);
}

function getRecipePlannerServingsMultiplierShared(
  recipe,
  { fallbackRecipeId = null, scrubInvalid = false } = {}
) {
  const bounds = getRecipePlannerServingsBoundsShared(recipe);
  if (!bounds) {
    return 1;
  }
  const current = getRecipeEffectiveServingsShared(recipe, {
    fallbackRecipeId,
    scrubInvalid,
  });
  if (current == null || !Number.isFinite(Number(current)) || Number(current) <= 0) {
    return 1;
  }
  const denom =
    bounds.baseDefault != null &&
    Number.isFinite(Number(bounds.baseDefault)) &&
    Number(bounds.baseDefault) > 0
      ? Number(bounds.baseDefault)
      : 1;
  const multiplier = Number(current) / denom;
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

window.favoriteEatsRecipePlannerServings = window.favoriteEatsRecipePlannerServings || Object.freeze({
  getRecipeModelId: getRecipePlannerServingsModelId,
  loadMap: loadRecipePlannerServingsMapShared,
  persistMap: persistRecipePlannerServingsMapShared,
  dispatchChanged: dispatchRecipePlannerServingsChangedShared,
  changeEventName: window.favoriteEatsEventNames.recipePlannerServingsChanged,
  roundValue: roundRecipePlannerServingsValueShared,
  getBaseDefault: getRecipeBaseServingsDefaultShared,
  getBounds: getRecipePlannerServingsBoundsShared,
  clampValue: clampRecipePlannerServingsValueShared,
  getStoredValue: getRecipePlannerServingsStoredValueShared,
  setStoredValue: setRecipePlannerServingsStoredValueShared,
  getEffectiveServings: getRecipeEffectiveServingsShared,
  getMultiplier: getRecipePlannerServingsMultiplierShared,
  plannerServingsMin: RECIPE_PLANNER_SERVINGS_MIN,
  plannerServingsMax: RECIPE_PLANNER_SERVINGS_MAX,
  invalidateBaseDefault: invalidateRecipePlannerServingsBaseDefaultShared,
});
// --- End recipe planner servings helpers ---

function waitForAppBarReady({ timeoutMs = 2000 } = {}) {
  const mount = document.getElementById('appBarMount');
  const start =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      // Once the title exists, the fragment is present and safe to wire.
      const titleEl = document.getElementById('appBarTitle');
      if (titleEl) return resolve(true);

      // If we have a mount with an injected flag, trust it.
      if (mount?.dataset?.injected === '1') return resolve(true);

      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();

      if (now - start > timeoutMs) return resolve(false);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

function isCurrentAppBarShellMarkup(source) {
  const requiredIds = [
    'appBarTitle',
    'appBarSearchLayer',
    'appBarSearchToggleBtn',
    'appBarMonogram',
  ];
  if (typeof source === 'string') {
    if (!requiredIds.every((id) => source.includes(`id="${id}"`))) return false;
    // Bump `data-app-bar-shell` in fragments/appBar.shell.html when markup changes
    // (invalidates stale sessionStorage cache, e.g. old monogram placeholder).
    return (
      source.includes('app-bar-text-action') &&
      source.includes('id="appBarAddBtn"') &&
      source.includes('data-app-bar-shell="7"')
    );
  }
  if (source instanceof Document || source instanceof Element) {
    if (!requiredIds.every((id) => source.querySelector(`#${id}`))) return false;
    const addBtn = source.querySelector('#appBarAddBtn');
    const shellRoot = source.querySelector('.app-bar-wrapper[data-app-bar-shell="7"]');
    return !!(
      addBtn &&
      addBtn.classList.contains('app-bar-text-action') &&
      shellRoot
    );
  }
  return false;
}

function ensureAppBarInjected() {
  const already = document.getElementById('appBarTitle');
  const mount = document.getElementById('appBarMount');

  if (already && isCurrentAppBarShellMarkup(document)) {
    favoriteEatsInstallAppBarMonogramMenuBinding();
    return waitForAppBarReady();
  }
  if (!mount) return Promise.resolve(false);

  if (already) {
    mount.innerHTML = '';
    if (mount.dataset) {
      mount.dataset.injected = '0';
      mount.dataset.injecting = '0';
    }
  }

  // Fast path: session cache (avoids flash on navigation after first load).
  if (mount.dataset?.appBarInline !== '1') {
    try {
      const cached =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('favoriteEats_appBarShell')
          : null;
      if (cached && cached.length > 0 && isCurrentAppBarShellMarkup(cached)) {
        mount.innerHTML = cached;
        if (mount.dataset) {
          mount.dataset.injected = '1';
          mount.dataset.injecting = '0';
        }
        favoriteEatsInstallAppBarMonogramMenuBinding();
        return waitForAppBarReady();
      } else if (cached && typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('favoriteEats_appBarShell');
      }
    } catch (_) {
      // ignore cache failures
    }
  }

  // Prevent double-injection if initAppBar is called multiple times quickly.
  if (mount.dataset && mount.dataset.injecting === '1') {
    // Injection already in progress — wait for the fragment to be present.

    return waitForAppBarReady();
  }

  if (mount.dataset) mount.dataset.injecting = '1';

  return fetch('fragments/appBar.shell.html')
    .then((r) => {
      if (!r.ok)
        throw new Error(`Failed to load app bar fragment (${r.status})`);
      return r.text();
    })
    .then((html) => {
      mount.innerHTML = html;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('favoriteEats_appBarShell', html);
        }
      } catch (_) {
        // ignore
      }
      if (mount.dataset) {
        mount.dataset.injected = '1';
        mount.dataset.injecting = '0';
      }

      favoriteEatsInstallAppBarMonogramMenuBinding();
      return waitForAppBarReady();
    })
    .catch((err) => {
      console.error('❌ App bar inject failed:', err);
      if (mount.dataset) mount.dataset.injecting = '0';
      return false;
    });
}

const COMPACT_WEB_APP_BAR_MAX_WIDTH_PX = 500;
const COMPACT_WEB_APP_BAR_SEARCH_EXPANDED_CLASS = 'app-bar-search-expanded';

function isCompactWebAppBarModeActive() {
  if (typeof document === 'undefined') return false;
  const body = document.body;
  if (!body) return false;
  if (typeof window === 'undefined') return false;
  const isSnugWidth =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(
          `(max-width: ${COMPACT_WEB_APP_BAR_MAX_WIDTH_PX}px)`,
        ).matches
      : Number(window.innerWidth || 0) <= COMPACT_WEB_APP_BAR_MAX_WIDTH_PX;
  if (!isSnugWidth) return false;
  if (body.dataset?.plannerMode === 'on') return true;
  // Editing mode: match planner compact bar behavior at narrow widths (web-only product).
  return true;
}

function getCompactWebAppBarSearchElements() {
  return {
    wrapper: document.querySelector('.app-bar-wrapper'),
    searchLayer: document.getElementById('appBarSearchLayer'),
    searchInput: document.getElementById('appBarSearchInput'),
    searchToggleBtn: document.getElementById('appBarSearchToggleBtn'),
    titleEl: document.getElementById('appBarTitle'),
  };
}

function isCompactWebAppBarSearchExpanded() {
  const { wrapper } = getCompactWebAppBarSearchElements();
  return !!wrapper?.classList?.contains(COMPACT_WEB_APP_BAR_SEARCH_EXPANDED_CLASS);
}

function setCompactWebAppBarSearchExpanded(expanded, options = {}) {
  const { focusInput = false, restoreFocus = false } = options;
  const { wrapper, searchLayer, searchInput, searchToggleBtn, titleEl } =
    getCompactWebAppBarSearchElements();
  if (!(wrapper instanceof HTMLElement)) return false;

  const searchToggleVisible =
    searchToggleBtn instanceof HTMLButtonElement &&
    searchToggleBtn.style.display !== 'none';
  const searchLayerVisible =
    searchLayer instanceof HTMLElement && searchLayer.style.display !== 'none';
  const nextExpanded =
    !!expanded &&
    isCompactWebAppBarModeActive() &&
    searchToggleVisible &&
    searchLayerVisible;

  wrapper.classList.toggle(COMPACT_WEB_APP_BAR_SEARCH_EXPANDED_CLASS, nextExpanded);

  if (searchToggleBtn instanceof HTMLButtonElement) {
    searchToggleBtn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
  }

  if (titleEl instanceof HTMLElement) {
    if (nextExpanded) {
      titleEl.setAttribute('aria-hidden', 'true');
    } else {
      titleEl.removeAttribute('aria-hidden');
    }
  }

  // iOS: keyboard only appears if focus() runs in the same synchronous user gesture as the tap (not rAF).
  if (nextExpanded && focusInput && searchInput instanceof HTMLInputElement) {
    try {
      if (searchLayer instanceof HTMLElement) void searchLayer.offsetHeight;
      searchInput.focus();
      const caret = String(searchInput.value || '').length;
      searchInput.setSelectionRange(caret, caret);
    } catch (_) {}
  } else if (
    !nextExpanded &&
    restoreFocus &&
    searchToggleBtn instanceof HTMLButtonElement
  ) {
    window.requestAnimationFrame(() => {
      try {
        searchToggleBtn.focus();
      } catch (_) {}
    });
  }

  return nextExpanded;
}

/** Update label text for app bar Add/Cancel/Save without removing icon markup. */
function setAppBarTextActionLabel(btn, text) {
  if (!btn) return;
  const label = btn.querySelector?.('.app-bar-action-label');
  if (label) label.textContent = text;
  else btn.textContent = text;
}

/**
 * Ensure an app bar pill has `.app-bar-action-label` + one snug Material icon.
 * Do not use for #appBarCancelBtn (dual icon markup).
 */
function ensureAppBarTextActionPair(btn, labelText, materialIconGlyph) {
  if (!btn) return;
  btn.classList.add('app-bar-text-action');
  let label = btn.querySelector(':scope > .app-bar-action-label');
  let icon = btn.querySelector(
    ':scope > .app-bar-action-icon--snug-only:not(.app-bar-cancel-icon--dismiss):not(.app-bar-cancel-icon--reset)',
  );
  if (!label || !icon) {
    btn.replaceChildren();
    label = document.createElement('span');
    label.className = 'app-bar-action-label';
    btn.appendChild(label);
    icon = document.createElement('span');
    icon.className =
      'material-symbols-outlined app-bar-action-icon app-bar-icon-font app-bar-action-icon--snug-only';
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
  }
  label.textContent = labelText;
  icon.textContent = materialIconGlyph;
}

function initAppBar(options = {}) {
  const {
    mode = 'list',
    titleText = '',

    showAdd = true,
    showCancel = true,
    showSave = true,
    cancelText = 'Cancel',
    saveText = 'Save',
    onMenu = null,
    onAdd = null,

    onBack = null,
    onCancel = null,
    onSave = null,

    _skipEnsure = false,
  } = options;

  // List: search on by default. Editor: off unless `showSearch` is passed (e.g. store editor).
  const showSearch =
    options.showSearch !== undefined ? options.showSearch : mode === 'list';

  // If a page uses the mount-based fragment, inject it before wiring.
  // IMPORTANT: do not continue wiring until the fragment exists.

  if (!_skipEnsure) {
    const mount = document.getElementById('appBarMount');

    const already = document.getElementById('appBarTitle');
    const shouldEnsure = !!mount && !already;

    if (shouldEnsure) {
      // Block wiring until the fragment is actually present.

      ensureAppBarInjected().then((ok) => {
        if (!ok) {
          console.warn('⚠️ initAppBar: app bar injection did not complete.');
          return;
        }
        initAppBar({ ...options, _skipEnsure: true });
      });

      return;
    }
  }

  // NOTE: The visible app bar can live either inside `.app-bar` (legacy v1)
  // or inside `.app-bar-wrapper` (list-page SoT visuals). Use global IDs.

  const menuBtn = document.getElementById('appBarMenuBtn');

  const backBtn = document.getElementById('appBarBackBtn');

  const addBtn = document.getElementById('appBarAddBtn');
  const searchToggleBtn = document.getElementById('appBarSearchToggleBtn');

  const cancelBtn = document.getElementById('appBarCancelBtn');
  const saveBtn = document.getElementById('appBarSaveBtn');
  const monogramBtn = document.getElementById('appBarMonogram');
  const titleEl = document.getElementById('appBarTitle');

  const searchLayer = document.getElementById('appBarSearchLayer');

  // If we got here but the fragment still isn't present, bail quietly.
  // (This avoids wiring nulls and makes failures obvious in the console.)

  if (!titleEl && document.getElementById('appBarMount')) {
    const mount = document.getElementById('appBarMount');
    if (mount?.dataset?.injecting === '1') {
      // In-flight injection: schedule a single re-entry to wire once present.

      waitForAppBarReady().then((ok) => {
        if (ok) initAppBar({ ...options, _skipEnsure: true });
      });
      return;
    }

    console.warn('⚠️ initAppBar: app bar not present (missing #appBarTitle).');
    return;
  }

  if (titleEl && titleText) {
    titleEl.textContent = titleText;
  }

  // menu (list)
  if (menuBtn && onMenu) {
    menuBtn.onclick = onMenu;
  }

  // back always exists
  if (backBtn && onBack) {
    backBtn.onclick = onBack;
  }

  // add (list)
  if (addBtn && onAdd) {
    addBtn.onclick = onAdd;
  }

  // Mode visibility + wiring (single shell, explicit differences)
  if (mode === 'list') {
    if (menuBtn) menuBtn.style.display = '';
    if (backBtn) backBtn.style.display = 'none';
    if (searchLayer) searchLayer.style.display = showSearch ? '' : 'none';
    if (searchToggleBtn) searchToggleBtn.style.display = showSearch ? '' : 'none';

    if (addBtn) addBtn.style.display = showAdd ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    if (monogramBtn) monogramBtn.style.display = '';
  } else {
    if (menuBtn) menuBtn.style.display = 'none';
    if (backBtn) backBtn.style.display = '';
    if (searchLayer) searchLayer.style.display = showSearch ? '' : 'none';
    if (searchToggleBtn) searchToggleBtn.style.display = showSearch ? '' : 'none';

    if (addBtn) addBtn.style.display = 'none';
    if (cancelBtn) {
      cancelBtn.style.display = showCancel ? '' : 'none';
      setAppBarTextActionLabel(cancelBtn, cancelText || 'Cancel');
      cancelBtn.classList.remove('app-bar-cancel--reset-servings');
      if (onCancel) cancelBtn.onclick = onCancel;
    }
    if (saveBtn) {
      saveBtn.style.display = showSave ? '' : 'none';
      setAppBarTextActionLabel(saveBtn, saveText || 'Save');
      if (onSave) saveBtn.onclick = onSave;
    }
    if (monogramBtn) monogramBtn.style.display = 'none';
    try {
      favoriteEatsCloseMonogramAccountMenu();
    } catch (_) {}
  }

  if (monogramBtn && mode === 'list') {
    try {
      const listA = window.NAME_DECK_LIST_A;
      const listB = window.NAME_DECK_LIST_B;
      if (
        Array.isArray(listA) &&
        Array.isArray(listB) &&
        window.recipePresenceMoniker &&
        typeof window.recipePresenceMoniker.getOrCreateMoniker === 'function'
      ) {
        const info = window.recipePresenceMoniker.getOrCreateMoniker(
          listA,
          listB,
          favoriteEatsMonikerStorage(),
        );
        const monogram = String((info && info.monogram) || '?').trim() || '?';
        setAppBarTextActionLabel(monogramBtn, monogram);
      }
    } catch (_) {}

    favoriteEatsInstallAppBarMonogramMenuBinding();

    const monogramLabel = monogramBtn.querySelector('.app-bar-action-label');
    if (monogramLabel instanceof HTMLElement) {
      monogramLabel.style.visibility = 'visible';
    }
  }

  // Search layout is handled by CSS (flex middle column) to avoid collisions.
  setCompactWebAppBarSearchExpanded(
    showSearch && isCompactWebAppBarSearchExpanded(),
  );
}

/**
 * Round a number to the nearest fraction denominator
 * @param {number} value
 * @param {number} denominator
 * @returns {number}
 */
function roundToFraction(value, denominator = 8) {
  return Math.round(value * denominator) / denominator;
}

/**
 * Convert a decimal to a fractional display string using Unicode glyphs
 * (e.g., 1.5 -> "1½", 0.25 -> "¼")
 * Keeps thirds strict so 0.3 stays 3/10 while 0.33/0.333... can map to 1/3.
 * @param {number|string} value
 * @param {number[]} denominators
 * @returns {string}
 */
function decimalToFractionDisplay(value, denominators = [2, 4, 8]) {
  const raw = typeof value === 'string' ? String(value).trim() : '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const formatDecimalFallback = () => {
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      return raw
        .replace(/(\.\d*?[1-9])0+$/u, '$1')
        .replace(/\.0+$/u, '');
    }
    // Numeric input: avoid float-noise tails (e.g. 1.499999 → match shopping qty rounding).
    return String(Number(n.toFixed(4)));
  };
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const fraction = abs - whole;
  const denomList = (Array.isArray(denominators) && denominators.length
    ? denominators
    : [2, 4, 8]
  )
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d > 0 && d !== 3);

  if (!denomList.length) return String(n);

  const THIRD_EPS = 1e-6;
  let forcedThirdNum = null;
  const rawThirdPattern = raw.match(/^(\d+)\.3{2,}$/);
  const rawTwoThirdPattern = raw.match(/^(\d+)\.6{2,}$/);
  if (rawThirdPattern) {
    forcedThirdNum = 1;
  } else if (rawTwoThirdPattern) {
    forcedThirdNum = 2;
  } else if (Math.abs(fraction - 1 / 3) <= THIRD_EPS) {
    forcedThirdNum = 1;
  } else if (Math.abs(fraction - 2 / 3) <= THIRD_EPS) {
    forcedThirdNum = 2;
  }

  let best = null;
  if (forcedThirdNum != null) {
    best = { num: forcedThirdNum, den: 3, err: 0 };
  } else {
    denomList.forEach((den) => {
      const num = Math.round(fraction * den);
      const err = Math.abs(fraction - num / den);
      if (
        best == null ||
        err < best.err - 1e-12 ||
        (Math.abs(err - best.err) <= 1e-12 && den < best.den)
      ) {
        best = { num, den, err };
      }
    });
  }

  if (!best) return String(n);
  // Allow ~0.0001 slop so near-half values (e.g. 1.4999) still map to halves/quarters.
  if (best.den !== 3 && best.err > 1e-4) {
    return formatDecimalFallback();
  }
  let wholePart = whole + Math.floor(best.num / best.den);
  let numPart = best.num % best.den;
  let denPart = best.den;

  const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x || 1;
  };

  if (numPart > 0) {
    const g = gcd(numPart, denPart);
    numPart /= g;
    denPart /= g;
  }

  const fractionMap = {
    '1/2': '½',
    '1/3': '⅓',
    '2/3': '⅔',
    '1/4': '¼',
    '3/4': '¾',
    1: '⅛',
    3: '⅜',
    5: '⅝',
    7: '⅞',
  };
  const fracKey = `${numPart}/${denPart}`;
  const fracGlyph =
    fractionMap[fracKey] || (denPart === 8 ? fractionMap[numPart] || '' : '');

  let rendered = '';
  if (numPart === 0) {
    rendered = `${wholePart}`;
  } else if (wholePart === 0) {
    rendered = fracGlyph || `${numPart}/${denPart}`;
  } else {
    rendered = fracGlyph ? `${wholePart}${fracGlyph}` : `${wholePart} ${numPart}/${denPart}`;
  }

  return isNegative && rendered !== '0' ? `-${rendered}` : rendered;
}

/**
 * Shopping Items stepper / badge labels: kitchen fractions only (no long decimals).
 * Snaps plan floats (often 4 dp) to the catalog scalar grid, then formats via amount kit.
 * Does not use mass/volume measured ladders — plan qty is count-like.
 * @param {number|string} qty
 * @param {number} [stepDenominator] catalog step 1|2|3|4|8|12; default 12 (¼∪⅓ grid)
 * @returns {string}
 */
function formatShoppingQtyForDisplay(qty, stepDenominator) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const stepRaw = Number(stepDenominator);
  const step = [1, 2, 3, 4, 8, 12].includes(stepRaw) ? stepRaw : 12;

  const pol =
    typeof window !== 'undefined'
      ? window.favoriteEatsQuantityDisplayPolicy
      : null;
  const kit =
    typeof window !== 'undefined' ? window.favoriteEatsAmountKit : null;

  let snapped = n;
  if (pol && typeof pol.snapScalarCookingNearest === 'function') {
    const nearest = pol.snapScalarCookingNearest(n, step);
    if (nearest != null && Number.isFinite(nearest) && nearest > 0) {
      snapped = nearest;
    }
  }

  if (kit && typeof kit.formatScalarForStep === 'function') {
    const label = kit.formatScalarForStep(snapped, step);
    if (label) return String(label).trim();
  }
  if (pol && typeof pol.formatGlyphForAmount === 'function') {
    const glyph = pol.formatGlyphForAmount(snapped, step);
    if (glyph) return String(glyph).trim();
  }

  const formatted = decimalToFractionDisplay(snapped);
  return formatted || String(Number(snapped.toFixed(2)));
}

/**
 * Items page variant sub-lines: plain counts up to 999, then compact k labels.
 * @param {number|string} qty
 * @returns {string}
 */
function formatShoppingBrowseSublineQtyForDisplay(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) return '10k+';
  if (n >= 1000) {
    const k = Math.round(n / 100) / 10;
    return `${k}k`;
  }
  const rounded = Math.round(n);
  if (rounded < 1) return '0';
  return String(Math.min(999, rounded));
}

function getActionableQuantityFractionPolicy(unitText) {
  const normalizedUnit = String(unitText || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');

  if (!normalizedUnit) {
    return { denominators: [2, 4], allowThirds: false };
  }

  if (
    normalizedUnit === 'tsp' ||
    normalizedUnit === 'teaspoon' ||
    normalizedUnit === 'teaspoons' ||
    normalizedUnit === 'tbsp' ||
    normalizedUnit === 'tablespoon' ||
    normalizedUnit === 'tablespoons' ||
    normalizedUnit === 'cup' ||
    normalizedUnit === 'cups'
  ) {
    return { denominators: [2, 4, 8], allowThirds: true };
  }

  if (
    normalizedUnit === 'oz' ||
    normalizedUnit === 'ounce' ||
    normalizedUnit === 'ounces' ||
    normalizedUnit === 'lb' ||
    normalizedUnit === 'lbs' ||
    normalizedUnit === 'pound' ||
    normalizedUnit === 'pounds'
  ) {
    return { denominators: [2, 4], allowThirds: false };
  }

  return null;
}

function normalizeActionableQuantity(value, unitText = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const policy = getActionableQuantityFractionPolicy(unitText);
  if (!policy) {
    return Number(numeric.toFixed(2));
  }

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

  (Array.isArray(policy.denominators) ? policy.denominators : []).forEach((den) => {
    const normalizedDen = Number(den);
    if (!Number.isInteger(normalizedDen) || normalizedDen <= 0) return;
    const num = Math.round(fraction * normalizedDen);
    registerCandidate(whole + num / normalizedDen, normalizedDen);
  });

  if (policy.allowThirds) {
    const thirdNum = Math.round(fraction * 3);
    registerCandidate(whole + thirdNum / 3, 3);
  }

  if (!best) return Number(numeric.toFixed(2));
  const rounded = Number(best.value.toFixed(6));
  return Number.isFinite(rounded) && rounded > 0 ? rounded : Number(numeric.toFixed(2));
}

// --- normalizeTemperatureTokensInText (tests extract between markers) ---
/**
 * Canonical compact temperatures in recipe step prose: NNN°F / NNN°C.
 * Shared by step blur/save normalization and display prettify.
 * @param {string} rawText
 * @returns {string}
 */
function normalizeTemperatureTokensInText(rawText) {
  let out = String(rawText || '');
  out = out.replace(/\b(\d+)\s*degrees?\s+Fahrenheit\b/gi, (_, n) => `${n}°F`);
  out = out.replace(/\b(\d+)\s*degrees?\s+Celsius\b/gi, (_, n) => `${n}°C`);
  out = out.replace(
    /(\d+)\s*(?:degrees?|°)\s*([FC])\b/gi,
    (_, deg, unit) => `${deg}°${String(unit || '').toUpperCase()}`
  );
  return out;
}
// --- end normalizeTemperatureTokensInText ---

/**
 * Prettify display-only free text (fractions, ranges, ellipsis, smart quotes).
 * This is intentionally presentational and should not be used for persisted values.
 * @param {string} rawText
 * @returns {string}
 */
function prettifyDisplayText(rawText) {
  const replaceWithMap = (input, mapEntries) => {
    let out = String(input || '');
    mapEntries.forEach(([rx, repl]) => {
      out = out.replace(rx, repl);
    });
    return out;
  };

  const prettifyFractionForms = (input) => {
    const fractionMap = [
      [/(^|[^\d/])7\s*\/\s*8(?=$|[^\d/])/g, '$1⅞'],
      [/(^|[^\d/])5\s*\/\s*8(?=$|[^\d/])/g, '$1⅝'],
      [/(^|[^\d/])3\s*\/\s*8(?=$|[^\d/])/g, '$1⅜'],
      [/(^|[^\d/])1\s*\/\s*8(?=$|[^\d/])/g, '$1⅛'],
      [/(^|[^\d/])3\s*\/\s*4(?=$|[^\d/])/g, '$1¾'],
      [/(^|[^\d/])1\s*\/\s*4(?=$|[^\d/])/g, '$1¼'],
      [/(^|[^\d/])2\s*\/\s*3(?=$|[^\d/])/g, '$1⅔'],
      [/(^|[^\d/])1\s*\/\s*3(?=$|[^\d/])/g, '$1⅓'],
      [/(^|[^\d/])1\s*\/\s*2(?=$|[^\d/])/g, '$1½'],
      [/\bthree\s+quarters\b/gi, '¾'],
      [/\b(one|a)\s+quarter\b/gi, '¼'],
      [/\btwo\s+thirds\b/gi, '⅔'],
      [/\bone\s+third\b/gi, '⅓'],
      [/\b(one|a)\s+half\b/gi, '½'],
      [/\bseven\s+eighths\b/gi, '⅞'],
      [/\bfive\s+eighths\b/gi, '⅝'],
      [/\bthree\s+eighths\b/gi, '⅜'],
      [/\bone\s+eighth\b/gi, '⅛'],
    ];

    let out = replaceWithMap(input, fractionMap);
    out = out.replace(/(\d+)\s+([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1$2');
    return out;
  };

  const prettifyRangesAndEllipsis = (input) => {
    let out = String(input || '');
    out = out.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
    out = out.replace(/\.{3}/g, '…');
    return out;
  };

  const prettifyTemperatures = (input) => normalizeTemperatureTokensInText(input);

  const protectMeasurementPrimes = (input) => {
    const tokenPrefix = '__FE_DISPLAY_PRETTIFY__';
    const protectedChunks = [];
    const protect = (rx, text) =>
      text.replace(rx, (m) => {
        const token = `${tokenPrefix}${protectedChunks.length}__`;
        protectedChunks.push(m);
        return token;
      });

    let out = String(input || '');
    out = protect(/\b\d+\s*'\s*\d+\s*"/g, out);
    out = protect(/\b\d+\s*"/g, out);
    out = protect(/\b\d+\s*'/g, out);

    return { text: out, protectedChunks, tokenPrefix };
  };

  const restoreProtectedChunks = (input, protectedChunks, tokenPrefix) => {
    let out = String(input || '');
    protectedChunks.forEach((value, idx) => {
      const token = `${tokenPrefix}${idx}__`;
      out = out.split(token).join(value);
    });
    return out;
  };

  const prettifySmartQuotes = (input) => {
    const protectedState = protectMeasurementPrimes(input);
    let out = protectedState.text;
    out = out.replace(/([A-Za-z0-9])'([A-Za-z0-9])/g, '$1’$2');
    out = out.replace(/"([^"\n]+)"/g, '“$1”');
    out = out.replace(/'([^'\n]+)'/g, '‘$1’');
    out = out.replace(/(^|[\s([{\u2014-])"(?=\S)/g, '$1“');
    out = out.replace(/"(?=[$\s)\]}.,!?;:])/g, '”');
    out = out.replace(/(^|[\s([{\u2014-])'(?=\S)/g, '$1‘');
    out = out.replace(/'(?=[$\s)\]}.,!?;:])/g, '’');
    return restoreProtectedChunks(
      out,
      protectedState.protectedChunks,
      protectedState.tokenPrefix
    );
  };

  let out = String(rawText || '');
  if (!out) return out;
  out = prettifyFractionForms(out);
  out = prettifyRangesAndEllipsis(out);
  out = prettifyTemperatures(out);
  out = prettifySmartQuotes(out);
  return out;
}

if (typeof window !== 'undefined' && !window.prettifyDisplayText) {
  window.prettifyDisplayText = prettifyDisplayText;
}

/** Display-only smart punctuation for modal chrome (titles, messages, labels). */
function prettifyModalDisplayText(rawText) {
  if (typeof prettifyDisplayText === 'function') {
    return prettifyDisplayText(rawText);
  }
  return String(rawText || '');
}
if (typeof window !== 'undefined' && !window.normalizeTemperatureTokensInText) {
  window.normalizeTemperatureTokensInText = normalizeTemperatureTokensInText;
}
if (typeof window !== 'undefined' && !window.decimalToFractionDisplay) {
  window.decimalToFractionDisplay = decimalToFractionDisplay;
}
if (typeof window !== 'undefined' && !window.normalizeActionableQuantity) {
  window.normalizeActionableQuantity = normalizeActionableQuantity;
}
if (typeof window !== 'undefined' && !window.formatShoppingQtyForDisplay) {
  window.formatShoppingQtyForDisplay = formatShoppingQtyForDisplay;
}
if (typeof window !== 'undefined' && !window.formatShoppingBrowseSublineQtyForDisplay) {
  window.formatShoppingBrowseSublineQtyForDisplay =
    formatShoppingBrowseSublineQtyForDisplay;
}

// --- Global Undo (single-slot, toast-based) ---
function getUndoKeyboardShortcutLabel() {
  try {
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    if (/Mac|iPhone|iPad/i.test(platform) || /\biPhone\b|\biPad\b|\biPod\b/i.test(ua)) {
      return '⌘Z';
    }
  } catch (_) {}
  return 'Ctrl+Z';
}

/** @returns {() => void} removes the document listener */
function attachToastOutsideDismiss(toastEl, onDismiss) {
  if (!(toastEl instanceof HTMLElement) || typeof onDismiss !== 'function') {
    return () => {};
  }
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    document.removeEventListener('click', onDocumentClick, true);
  };
  const onDocumentClick = (e) => {
    const t = e && e.target;
    if (!(t instanceof Node)) return;
    if (toastEl.contains(t)) return;
    if (t instanceof Element && t.closest('.ui-dialog-panel')) return;
    cleanup();
    onDismiss();
  };
  document.addEventListener('click', onDocumentClick, true);
  return cleanup;
}

function showUndoToastGlobal({ message, onUndo, timeoutMs = UI_TOAST_MS } = {}) {
  try {
    let host = document.getElementById('typeaheadToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'typeaheadToastHost';
      // Keep legacy class for existing CSS; also add the new shared class.
      host.className = 'typeahead-toast-host ui-toast-host';
      document.body.appendChild(host);
    }

    // Clear any existing toasts (single-slot behavior)
    try {
      while (host.firstChild) host.removeChild(host.firstChild);
    } catch (_) {}

    const toast = document.createElement('div');
    toast.className = 'typeahead-toast ui-toast';
    const shortcut = getUndoKeyboardShortcutLabel();
    toast.title = `You can also press ${shortcut} to undo (even after this message hides).`;

    const msg = document.createElement('div');
    msg.className = 'typeahead-toast__msg ui-toast__msg';
    msg.textContent = message || '';
    toast.appendChild(msg);

    const lifetimeMs = Math.max(1000, Number(timeoutMs) || UI_TOAST_MS);
    let dismissTimer = null;
    let cleanupOutsideDismiss = null;

    const removeToastFromDom = () => {
      try {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      } catch (_) {}
    };

    const dismissToastOnly = () => {
      try {
        window.clearTimeout(dismissTimer);
      } catch (_) {}
      try {
        if (typeof cleanupOutsideDismiss === 'function') cleanupOutsideDismiss();
      } catch (_) {}
      cleanupOutsideDismiss = null;
      try {
        const um = window.undoManager;
        if (um && typeof um.clear === 'function') {
          um.clear();
        } else {
          removeToastFromDom();
        }
      } catch (_) {
        removeToastFromDom();
      }
    };

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'typeahead-toast__undo ui-toast__action';
    undoBtn.textContent = 'Undo';
    undoBtn.title = `Keyboard: ${shortcut}`;
    undoBtn.addEventListener('click', () => {
      try {
        window.clearTimeout(dismissTimer);
      } catch (_) {}
      try {
        if (typeof cleanupOutsideDismiss === 'function') cleanupOutsideDismiss();
      } catch (_) {}
      cleanupOutsideDismiss = null;
      try {
        if (typeof onUndo === 'function') onUndo();
      } finally {
        removeToastFromDom();
      }
    });
    toast.appendChild(undoBtn);

    host.appendChild(toast);
    cleanupOutsideDismiss = attachToastOutsideDismiss(toast, dismissToastOnly);

    dismissTimer = window.setTimeout(() => {
      dismissToastOnly();
    }, lifetimeMs);

    toast.addEventListener('mouseenter', () => {
      try {
        window.clearTimeout(dismissTimer);
      } catch (_) {}
    });

    toast.addEventListener('mouseleave', () => {
      try {
        window.clearTimeout(dismissTimer);
      } catch (_) {}
      dismissTimer = window.setTimeout(() => {
        dismissToastOnly();
      }, lifetimeMs);
    });

    return toast;
  } catch (_) {
    return null;
  }
}

function createUndoManager() {
  let current = null; // { undo: fn, toastEl }

  const clear = () => {
    current = null;
    try {
      const host = document.getElementById('typeaheadToastHost');
      if (host) host.innerHTML = '';
    } catch (_) {}
  };

  const push = ({ message, undo, timeoutMs } = {}) => {
    if (typeof undo !== 'function') return false;
    current = { undo, toastEl: null };
    const toastEl = showUndoToastGlobal({
      message,
      timeoutMs,
      onUndo: () => {
        try {
          undo();
        } finally {
          current = null;
        }
      },
    });
    current.toastEl = toastEl;
    return true;
  };

  /** @returns {boolean} true if a pending undo ran (e.g. keyboard shortcut after toast expired) */
  const invokePending = () => {
    if (!current || typeof current.undo !== 'function') return false;
    const fn = current.undo;
    const el = current.toastEl;
    current = null;
    try {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {}
    try {
      fn();
    } catch (_) {}
    return true;
  };

  return { push, clear, invokePending };
}

if (typeof window !== 'undefined') {
  // Shared global undo helpers (page-local).
  if (!window.showUndoToast) window.showUndoToast = showUndoToastGlobal;
  if (!window.undoManager) window.undoManager = createUndoManager();
}

// --- Unified dialogs + toasts (window.ui) ---
(function initUnifiedUI() {
  if (typeof window === 'undefined') return;
  if (window.ui) return;

  const ensureDialogHost = () => {
    let host = document.getElementById('uiDialogHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'uiDialogHost';
      host.className = 'ui-dialog-host';
      document.body.appendChild(host);
    }
    return host;
  };

  const uiDialogSessions = [];

  const registerUiDialogSession = (session) => {
    if (session) uiDialogSessions.push(session);
  };

  const unregisterUiDialogSession = (session) => {
    const idx = uiDialogSessions.indexOf(session);
    if (idx >= 0) uiDialogSessions.splice(idx, 1);
  };

  /** Close every open `window.ui` modal and resolve its promise as cancelled. */
  const dismissOpenDialogs = () => {
    const sessions = uiDialogSessions.splice(0);
    for (const session of sessions) {
      try {
        session.dismiss();
      } catch (_) {}
    }
    try {
      const host = document.getElementById('uiDialogHost');
      if (!host) return;
      host.querySelectorAll('.ui-dialog-backdrop').forEach((el) => el.remove());
      delete host.dataset.open;
    } catch (_) {}
  };

  // Modal is not a document surface: suppress the browser context menu on
  // buttons/copy/back noise, while keeping it for real text fields.
  const attachUiDialogContextMenuSuppression = (backdrop) => {
    if (!(backdrop instanceof HTMLElement)) return;
    backdrop.addEventListener(
      'contextmenu',
      (e) => {
        try {
          const t = e && e.target;
          if (
            t &&
            typeof t.closest === 'function' &&
            t.closest('input, textarea, select, [contenteditable="true"]')
          ) {
            return;
          }
          e.preventDefault();
        } catch (_) {}
      },
      true,
    );
  };

  /** Dismiss when the user clicks the dimmed area outside the panel (not only on bare backdrop). */
  const attachUiDialogOutsideDismiss = (
    backdrop,
    panel,
    onDismiss,
    { enabled = true } = {},
  ) => {
    if (!enabled) return;
    if (!(backdrop instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
    if (typeof onDismiss !== 'function') return;
    backdrop.addEventListener('click', (e) => {
      if (!e) return;
      // Use the event path at dispatch time. In-panel handlers may replace
      // innerHTML during bubble (e.g. unknown-items suggestion pills), which
      // detaches e.target before this listener runs; contains() then lies.
      const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
      if (path ? path.includes(panel) : panel.contains(e.target)) return;
      onDismiss();
    });
  };

  const ensureToastHost = () => {
    // Reuse existing host if present (legacy id)
    let host = document.getElementById('typeaheadToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'typeaheadToastHost';
      document.body.appendChild(host);
    }
    if (!host.classList.contains('ui-toast-host')) host.classList.add('ui-toast-host');
    if (!host.classList.contains('typeahead-toast-host'))
      host.classList.add('typeahead-toast-host');
    return host;
  };

  const getFocusable = (root) => {
    if (!(root instanceof Element)) return [];
    const sel =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(root.querySelectorAll(sel));
    return nodes.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute('disabled')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
  };

  const modalText = (rawText) => prettifyModalDisplayText(rawText);

  const trapTabKey = (e, panel) => {
    if (!e || e.key !== 'Tab') return;
    const items = getFocusable(panel);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const dialog = ({
    title = '',
    message = '',
    messageNode = null, // Optional extra body content (e.g. links list)
    fields = null, // [{ key, label, type, value, placeholder, required, autocapitalize, options, validate }]
    confirmText = 'OK',
    getConfirmText = null, // (values) => string — live primary CTA label
    cancelText = 'Cancel',
    showCancel = true,
    danger = false,
    validate = null, // (values) => string|''|null
    onConfirm = null, // (values) => void|Promise
    closeOnBackdrop = true,
  } = {}) => {
    return new Promise((resolve) => {
      const host = ensureDialogHost();
      const prevFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';

      const panel = document.createElement('div');
      panel.className = 'ui-dialog-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      // If we don't render a visible title, still give the dialog an accessible name.
      // Prefer title, else a short message summary, else fallback.
      const ariaLabel = (() => {
        const t = (title || '').trim();
        if (t) return modalText(t);
        const m = String(message || '')
          .replace(/\r\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .trim();
        if (m) return modalText(m.split('\n')[0].slice(0, 80));
        return 'Dialog';
      })();
      panel.setAttribute('aria-label', ariaLabel);

      if (title) {
        const titleEl = document.createElement('h2');
        titleEl.className = 'ui-dialog-title';
        titleEl.textContent = modalText(String(title));
        panel.appendChild(titleEl);
      }

      let bodyEl = null;
      if (message) {
        bodyEl = document.createElement('div');
        bodyEl.className = 'ui-dialog-body';
        // Normalize: keep newlines, but remove indentation that often comes from
        // template-literal formatting (prevents "giant indent" rendering).
        const raw = String(message);
        const normalized = raw
          .replace(/\r\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .trim();
        bodyEl.textContent = modalText(normalized);
        panel.appendChild(bodyEl);
      }

      if (messageNode && messageNode instanceof Node) {
        const extraEl = document.createElement('div');
        extraEl.className = 'ui-dialog-extra';
        extraEl.appendChild(messageNode);
        panel.appendChild(extraEl);
      }

      const errorEl = document.createElement('div');
      errorEl.className = 'ui-dialog-error';
      errorEl.style.display = 'none';
      panel.appendChild(errorEl);

      const values = {};
      let firstInput = null;
      const fieldErrorEls = new Map();

      if (Array.isArray(fields) && fields.length) {
        const fieldsWrap = document.createElement('div');
        fieldsWrap.className = 'ui-dialog-fields';

        fields.forEach((f) => {
          const key = String(f?.key || '');
          if (!key) return;
          const fieldType = String(f?.type || 'text');

          if (fieldType === 'toggleGroup') {
            const options = Array.isArray(f.options) ? f.options : [];
            let initial = f?.value != null ? String(f.value) : '';
            if (
              initial &&
              !options.some((o) => String(o?.value ?? '') === initial)
            ) {
              initial = '';
            }
            if (!initial && options.length) {
              initial = String(options[0]?.value ?? '');
            }
            values[key] = initial;

            const field = document.createElement('div');
            field.className = 'ui-dialog-field';

            const lab = document.createElement('div');
            lab.className = 'ui-dialog-label';
            lab.textContent = modalText(String(f?.label || key));
            field.appendChild(lab);

            const row = document.createElement('div');
            row.className = 'ui-dialog-toggle-group';
            row.setAttribute('role', 'radiogroup');
            row.setAttribute('aria-label', modalText(String(f?.label || key)));

            const groupName = `uiDialogToggle_${key}_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}`;

            const syncFromDom = () => {
              const checked = row.querySelector(
                `input[type="radio"][name="${groupName}"]:checked`,
              );
              values[key] = checked ? String(checked.value) : initial;
              syncValidity();
            };

            options.forEach((opt) => {
              const optValue = String(opt?.value ?? '');
              const optLabel = String(opt?.label ?? optValue);
              const labEl = document.createElement('label');
              labEl.className = 'shopping-item-toggle';
              const inp = document.createElement('input');
              inp.type = 'radio';
              inp.name = groupName;
              inp.value = optValue;
              if (optValue === values[key]) inp.checked = true;
              inp.addEventListener('change', syncFromDom);
              const span = document.createElement('span');
              span.textContent = modalText(optLabel);
              labEl.appendChild(inp);
              labEl.appendChild(span);
              row.appendChild(labEl);
            });

            field.appendChild(row);
            const fieldError = document.createElement('div');
            fieldError.className = 'ui-dialog-field-error';
            fieldError.style.display = 'none';
            field.appendChild(fieldError);
            fieldErrorEls.set(key, fieldError);
            fieldsWrap.appendChild(field);
            return;
          }

          if (fieldType === 'checkboxGroup') {
            const options = Array.isArray(f.options) ? f.options : [];
            const initial = Array.isArray(f?.value)
              ? f.value.map((v) => String(v ?? '')).filter(Boolean)
              : [];
            values[key] = initial.slice();

            const field = document.createElement('div');
            field.className = 'ui-dialog-field';

            const fieldLabel = String(f?.label || '').trim();
            if (fieldLabel) {
              const lab = document.createElement('div');
              lab.className = 'ui-dialog-label';
              lab.textContent = modalText(fieldLabel);
              field.appendChild(lab);
            }

            const row = document.createElement('div');
            row.className = 'ui-dialog-toggle-group ui-dialog-toggle-group--stacked';
            row.setAttribute('role', 'group');
            row.setAttribute(
              'aria-label',
              modalText(fieldLabel || String(f?.key || key)),
            );

            const syncFromDom = () => {
              values[key] = Array.from(
                row.querySelectorAll('input[type="checkbox"]:checked'),
              ).map((inp) => String(inp.value || ''));
              syncValidity();
            };

            options.forEach((opt) => {
              const optValue = String(opt?.value ?? '');
              const optLabel = String(opt?.label ?? optValue);
              const labEl = document.createElement('label');
              labEl.className = 'shopping-item-toggle';
              const inp = document.createElement('input');
              inp.type = 'checkbox';
              inp.value = optValue;
              if (values[key].includes(optValue)) inp.checked = true;
              inp.addEventListener('change', syncFromDom);
              const span = document.createElement('span');
              span.textContent = modalText(optLabel);
              labEl.appendChild(inp);
              labEl.appendChild(span);
              row.appendChild(labEl);
              if (!firstInput) firstInput = inp;
            });

            field.appendChild(row);
            const fieldError = document.createElement('div');
            fieldError.className = 'ui-dialog-field-error';
            fieldError.style.display = 'none';
            field.appendChild(fieldError);
            fieldErrorEls.set(key, fieldError);
            fieldsWrap.appendChild(field);
            return;
          }

          values[key] = f?.value != null ? String(f.value) : '';

          const field = document.createElement('label');
          field.className = 'ui-dialog-field';

          const lab = document.createElement('div');
          lab.className = 'ui-dialog-label';
          lab.textContent = modalText(String(f?.label || key));
          field.appendChild(lab);

          const input = document.createElement('input');
          input.className = 'ui-dialog-input';
          input.type = String(f?.type || 'text');
          input.value = values[key];
          if (f?.placeholder) input.placeholder = String(f.placeholder);
          if (f?.autocapitalize) input.setAttribute('autocapitalize', f.autocapitalize);
          if (f?.required) input.dataset.required = '1';

          input.addEventListener('input', () => {
            values[key] = input.value || '';
            syncValidity();
          });

          field.appendChild(input);
          const fieldError = document.createElement('div');
          fieldError.className = 'ui-dialog-field-error';
          fieldError.style.display = 'none';
          field.appendChild(fieldError);
          fieldErrorEls.set(key, fieldError);
          fieldsWrap.appendChild(field);

          if (!firstInput) firstInput = input;
        });

        panel.appendChild(fieldsWrap);
      }

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'button-filled button-filled--secondary';
      cancelBtn.textContent = modalText(cancelText || 'Cancel');

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = `button-filled ${danger ? 'button-filled--danger' : ''}`.trim();
      confirmBtn.textContent = modalText(confirmText || 'OK');

      if (showCancel) actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      panel.appendChild(actions);

      backdrop.appendChild(panel);
      host.appendChild(backdrop);
      host.dataset.open = '1';
      attachUiDialogContextMenuSuppression(backdrop);

      const cleanup = () => {
        try {
          delete host.dataset.open;
        } catch (_) {}
        try {
          if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        } catch (_) {}
        try {
          prevFocus?.focus?.();
        } catch (_) {}
      };

      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        unregisterUiDialogSession(session);
        cleanup();
        resolve(value);
      };
      const session = {
        dismiss() {
          settle(null);
        },
      };
      registerUiDialogSession(session);

      const setError = (msg) => {
        const m = (msg || '').trim();
        if (!m) {
          errorEl.textContent = '';
          errorEl.style.display = 'none';
        } else {
          errorEl.textContent = modalText(m);
          errorEl.style.display = '';
        }
      };

      const setFieldError = (key, msg) => {
        const el = fieldErrorEls.get(String(key || ''));
        if (!el) return;
        const m = String(msg || '').trim();
        if (!m) {
          el.textContent = '';
          el.style.display = 'none';
        } else {
          el.textContent = modalText(m);
          el.style.display = '';
        }
      };

      const syncValidity = () => {
        let err = '';
        let hasMissingRequired = false;
        let hasFieldErrors = false;
        try {
          // Field-level required + validation
          if (Array.isArray(fields)) {
            for (const f of fields) {
              const key = String(f?.key || '');
              if (!key) continue;
              const rawValue = values?.[key];
              const fieldType = String(f?.type || 'text');
              if (f?.required) {
                const missingRequired =
                  fieldType === 'checkboxGroup'
                    ? !Array.isArray(rawValue) || rawValue.length === 0
                    : !String(rawValue != null ? rawValue : '').trim();
                if (missingRequired) {
                  hasMissingRequired = true;
                  setFieldError(key, '');
                  continue;
                }
              }
              const value =
                fieldType === 'checkboxGroup'
                  ? Array.isArray(rawValue)
                    ? rawValue.join(',')
                    : ''
                  : rawValue != null
                    ? String(rawValue)
                    : '';
              let fieldErr = '';
              if (typeof f?.validate === 'function') {
                fieldErr = String(f.validate(value, values) || '').trim();
              }
              setFieldError(key, fieldErr);
              if (fieldErr) {
                hasFieldErrors = true;
              }
            }
          }
          // Only show a global error when per-field validation and required checks pass.
          if (!err && !hasMissingRequired && !hasFieldErrors && typeof validate === 'function') {
            err = String(validate(values) || '').trim();
          }
        } catch (_) {}

        setError(err);
        confirmBtn.disabled = !!err || hasMissingRequired || hasFieldErrors;
        let nextConfirmText = confirmText || 'OK';
        if (typeof getConfirmText === 'function') {
          try {
            const dynamic = String(getConfirmText(values) || '').trim();
            if (dynamic) nextConfirmText = dynamic;
          } catch (_) {}
        }
        confirmBtn.textContent = modalText(nextConfirmText);
      };

      const doCancel = () => {
        settle(null);
      };

      const doConfirm = async () => {
        syncValidity();
        if (confirmBtn.disabled) return;
        try {
          if (typeof onConfirm === 'function') {
            await onConfirm(values);
          }
        } catch (err) {
          setError(err?.message || 'Something went wrong.');
          confirmBtn.disabled = false;
          return;
        }
        settle(values);
      };

      cancelBtn.addEventListener('click', doCancel);
      confirmBtn.addEventListener('click', () => {
        void doConfirm();
      });

      attachUiDialogOutsideDismiss(backdrop, panel, doCancel, {
        enabled: closeOnBackdrop,
      });

      panel.addEventListener(
        'keydown',
        (e) => {
          if (!e) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            doCancel();
            return;
          }
          trapTabKey(e, panel);
          if (e.key === 'Enter') {
            // Enter on inputs should submit; on buttons is handled by click anyway.
            const t = e.target;
            if (t && t instanceof HTMLInputElement) {
              e.preventDefault();
              void doConfirm();
            }
          }
        },
        { capture: true }
      );

      // Initial validation + focus
      syncValidity();
      window.setTimeout(() => {
        try {
          (firstInput || confirmBtn).focus();
          if (firstInput && firstInput.select) firstInput.select();
        } catch (_) {}
      }, 0);
    });
  };

  /**
   * Three-outcome dialog (store editor unknown ingredients).
   * Backdrop click and Escape resolve to `dismissChoice` (default: "discard").
   */
  const dialogThreeChoice = ({
    title = '',
    message = '',
    discardText = 'Discard',
    fixText = 'Fix input',
    createText = 'Create',
    discardDanger = false,
    dismissChoice = 'discard',
  } = {}) =>
    new Promise((resolve) => {
      const host = ensureDialogHost();
      const prevFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';

      const panel = document.createElement('div');
      panel.className = 'ui-dialog-panel ui-dialog-panel--three-choice';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', modalText((title || '').trim()) || 'Confirm');

      if (title) {
        const titleEl = document.createElement('h2');
        titleEl.className = 'ui-dialog-title';
        titleEl.textContent = modalText(String(title));
        panel.appendChild(titleEl);
      }

      if (message) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'ui-dialog-body';
        bodyEl.textContent = modalText(
          String(message).replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim()
        );
        panel.appendChild(bodyEl);
      }

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions ui-dialog-actions--three';

      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = discardDanger
        ? 'button-filled button-filled--danger'
        : 'button-filled button-filled--secondary';
      discardBtn.textContent = modalText(discardText || 'Cancel');

      const fixBtn = document.createElement('button');
      fixBtn.type = 'button';
      fixBtn.className = 'button-filled button-filled--secondary';
      fixBtn.textContent = modalText(fixText || 'Fix input');

      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.className = 'button-filled';
      createBtn.textContent = modalText(createText || 'Create');

      actions.appendChild(fixBtn);
      actions.appendChild(discardBtn);
      actions.appendChild(createBtn);
      panel.appendChild(actions);

      backdrop.appendChild(panel);
      host.appendChild(backdrop);
      host.dataset.open = '1';
      attachUiDialogContextMenuSuppression(backdrop);

      const cleanup = () => {
        try {
          delete host.dataset.open;
        } catch (_) {}
        try {
          if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        } catch (_) {}
        try {
          prevFocus?.focus?.();
        } catch (_) {}
      };

      let settled = false;
      const settle = (choice) => {
        if (settled) return;
        settled = true;
        unregisterUiDialogSession(session);
        cleanup();
        resolve(choice);
      };
      const session = {
        dismiss() {
          settle('fix');
        },
      };
      registerUiDialogSession(session);

      const finish = (choice) => {
        settle(choice);
      };
      const dismissToChoice =
        dismissChoice === 'fix' ||
        dismissChoice === 'discard' ||
        dismissChoice === 'create'
          ? dismissChoice
          : 'discard';

      discardBtn.addEventListener('click', () => finish('discard'));
      fixBtn.addEventListener('click', () => finish('fix'));
      createBtn.addEventListener('click', () => finish('create'));

      attachUiDialogOutsideDismiss(backdrop, panel, () =>
        finish(dismissToChoice),
      );

      panel.addEventListener(
        'keydown',
        (e) => {
          if (!e) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            finish(dismissToChoice);
            return;
          }
          trapTabKey(e, panel);
        },
        { capture: true }
      );

      window.setTimeout(() => {
        try {
          fixBtn.focus();
        } catch (_) {}
      }, 0);
    });

  const suggestUnknownItem = (rawValue, pool) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    const p = Array.isArray(pool) ? pool : [];
    const rawLower = raw.toLowerCase();
    const exact = p.find((n) => String(n || '').trim().toLowerCase() === rawLower);
    if (exact) return '';

    const includes = p
      .map((n) => String(n || '').trim())
      .filter((n) => n.length > 0)
      .filter((n) => n.toLowerCase().includes(rawLower) || rawLower.includes(n.toLowerCase()));
    if (includes.length > 0) {
      includes.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return includes[0] || '';
    }

    const a = rawLower;
    const levenshtein = (x, y) => {
      if (x === y) return 0;
      if (!x.length) return y.length;
      if (!y.length) return x.length;
      const v0 = new Array(y.length + 1);
      const v1 = new Array(y.length + 1);
      for (let i = 0; i <= y.length; i++) v0[i] = i;
      for (let i = 0; i < x.length; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < y.length; j++) {
          const cost = x[i] === y[j] ? 0 : 1;
          v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= y.length; j++) v0[j] = v1[j];
      }
      return v0[y.length];
    };

    let best = '';
    let bestDist = Infinity;
    p.forEach((n) => {
      const candidate = String(n || '').trim();
      if (!candidate) return;
      const d = levenshtein(a, candidate.toLowerCase());
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      } else if (d === bestDist && candidate.localeCompare(best, undefined, { sensitivity: 'base' }) < 0) {
        best = candidate;
      }
    });

    if (!best) return '';
    const maxDistance = a.length <= 5 ? 1 : 2;
    return bestDist <= maxDistance ? best : '';
  };

  const unknownItemsDialog = ({
    title = '',
    message = '',
    items = [],
    suggestionPool = [],
    applyAllText = 'Apply all',
    cancelText = 'Cancel',
    editText = 'Edit',
    saveText = 'Save',
  } = {}) =>
    new Promise((resolve) => {
      const titleTemplate = String(title || '').trim();
      const titleCountPrefix = (() => {
        const match = titleTemplate.match(/^(.+)\s\(\d+\)$/);
        return match ? match[1] : '';
      })();
      const titleIsCountTemplate = !!titleCountPrefix;
      const host = ensureDialogHost();
      const prevFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const normKey = (s) => String(s || '').trim().toLowerCase();
      const uniqueRows = [];
      const seen = new Set();

      (Array.isArray(items) ? items : []).forEach((entry, idx) => {
        const original =
          entry && typeof entry === 'object'
            ? String(entry.original != null ? entry.original : '')
            : String(entry != null ? entry : '');
        const key = normKey(original);
        if (!key || seen.has(key)) return;
        seen.add(key);

        const inputSuggestion =
          entry && typeof entry === 'object' ? String(entry.suggestion || '').trim() : '';
        const suggested = inputSuggestion || suggestUnknownItem(original, suggestionPool);
        uniqueRows.push({
          id: `unknown-${idx}-${Date.now()}`,
          original,
          value: original,
          suggestion: suggested,
          suggestionApplied: false,
          isPurple: false,
        });
      });

      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';

      const panel = document.createElement('div');
      panel.className = 'ui-dialog-panel ui-dialog-panel--unknown-items';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute(
        'aria-label',
        modalText((title || '').trim()) || modalText('Unknown items')
      );

      const defaultUnknownMessage =
        'These items are not in your database. Edit, match them to existing items, or save them as new ones.';
      const allResolvedMessage =
        'All items are in your database. You may save changes without creating new items.';

      const titleEl = document.createElement('h2');
      titleEl.className = 'ui-unknown-items-title';
      titleEl.textContent = modalText(title || `New items (${uniqueRows.length})`);
      panel.appendChild(titleEl);

      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'ui-unknown-items-subtitle';
      subtitleEl.textContent = modalText(message || defaultUnknownMessage);
      panel.appendChild(subtitleEl);

      const listWrap = document.createElement('div');
      listWrap.className = 'ui-unknown-items-list-wrap';

      const head = document.createElement('div');
      head.className = 'ui-unknown-items-table-head';
      const headOriginal = document.createElement('div');
      headOriginal.textContent = 'Original';
      const headSuggestions = document.createElement('div');
      headSuggestions.className = 'ui-unknown-items-col-suggestions-head';
      const headSuggestionsText = document.createElement('span');
      headSuggestionsText.textContent = 'Suggestions';
      const applyAllBtn = document.createElement('button');
      applyAllBtn.className = 'ui-unknown-items-apply-all';
      applyAllBtn.dataset.role = 'apply-all';
      applyAllBtn.type = 'button';
      applyAllBtn.textContent = modalText(String(applyAllText || 'Apply all'));
      headSuggestions.appendChild(headSuggestionsText);
      headSuggestions.appendChild(applyAllBtn);
      head.appendChild(headOriginal);
      head.appendChild(headSuggestions);
      listWrap.appendChild(head);

      const body = document.createElement('div');
      listWrap.appendChild(body);
      panel.appendChild(listWrap);

      const actions = document.createElement('div');
      actions.className = 'ui-unknown-items-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'button-filled button-filled--secondary';
      cancelBtn.textContent = modalText(cancelText || 'Cancel');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'button-filled button-filled--secondary';
      editBtn.textContent = modalText(editText || 'Edit');
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'button-filled';
      saveBtn.textContent = modalText(saveText || 'Save');
      actions.appendChild(cancelBtn);
      actions.appendChild(editBtn);
      actions.appendChild(saveBtn);
      panel.appendChild(actions);

      backdrop.appendChild(panel);
      host.appendChild(backdrop);
      host.dataset.open = '1';
      attachUiDialogContextMenuSuppression(backdrop);

      let editingId = null;
      let editingStartValue = '';
      let pendingCaret = null; // { rowId, index|null }

      const getRowById = (id) => uniqueRows.find((r) => r.id === id) || null;
      const knownSet = new Set(
        (Array.isArray(suggestionPool) ? suggestionPool : [])
          .map((n) => String(n || '').trim().toLowerCase())
          .filter((n) => n.length > 0)
      );
      const isKnownName = (v) => knownSet.has(String(v || '').trim().toLowerCase());
      const unresolvedCount = () => uniqueRows.filter((r) => !isKnownName(r.value)).length;

      const computeCaretIndexFromPointer = ({ textEl, text, clientX }) => {
        try {
          if (!textEl || !String(text || '').length) return null;
          const style = window.getComputedStyle(textEl);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
          const rect = textEl.getBoundingClientRect();
          const localX = Math.max(0, Math.min(clientX - rect.left, rect.width));
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i <= text.length; i++) {
            const w = ctx.measureText(text.slice(0, i)).width;
            const d = Math.abs(w - localX);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
          return bestIdx;
        } catch (_) {
          return null;
        }
      };

      const cleanup = () => {
        try {
          delete host.dataset.open;
        } catch (_) {}
        try {
          if (window.favoriteEatsTypeahead && typeof window.favoriteEatsTypeahead.close === 'function') {
            window.favoriteEatsTypeahead.close();
          }
        } catch (_) {}
        try {
          if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        } catch (_) {}
        try {
          prevFocus?.focus?.();
        } catch (_) {}
      };

      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        unregisterUiDialogSession(session);
        cleanup();
        resolve(value);
      };
      const session = {
        dismiss() {
          settle(null);
        },
      };
      registerUiDialogSession(session);

      const finishCancel = () => {
        settle(null);
      };

      const finishSave = () => {
        const rows = uniqueRows.map((r) => ({
          original: String(r.original || '').trim(),
          value: String(r.value || '').trim() || String(r.original || '').trim(),
        }));
        settle({ rows });
      };

      const applySuggestionForRow = (row) => {
        if (!row || !row.suggestion || row.suggestionApplied) return;
        row.value = row.suggestion;
        row.suggestionApplied = true;
        row.isPurple = true;
      };

      const invalidateSuggestionForRow = (row) => {
        if (!row) return;
        row.suggestion = '';
        row.suggestionApplied = true;
      };

      const openEditorById = (rowId) => {
        const row = getRowById(rowId);
        if (!row) return;
        editingId = rowId;
        editingStartValue = row.value;
        renderRows();
        const input = body.querySelector('input[data-role="edit-original"]');
        if (input && input instanceof HTMLInputElement) {
          input.focus();
          let pos = input.value.length;
          if (pendingCaret && pendingCaret.rowId === rowId && Number.isFinite(pendingCaret.index)) {
            pos = Math.max(0, Math.min(Number(pendingCaret.index), input.value.length));
          }
          input.setSelectionRange(pos, pos);
          pendingCaret = null;
          const rowEl = input.closest('.ui-unknown-items-row');
          if (rowEl && typeof rowEl.scrollIntoView === 'function') {
            rowEl.scrollIntoView({ block: 'nearest' });
          }
          if (window.favoriteEatsTypeahead && typeof window.favoriteEatsTypeahead.attach === 'function') {
            window.favoriteEatsTypeahead.attach({
              inputEl: input,
              getPool: async () => suggestionPool,
              openOnFocus: true,
              maxVisible: 8,
            });
          }
        }
      };

      const closeEditor = () => {
        editingId = null;
        editingStartValue = '';
        try {
          if (window.favoriteEatsTypeahead && typeof window.favoriteEatsTypeahead.close === 'function') {
            window.favoriteEatsTypeahead.close();
          }
        } catch (_) {}
      };

      const refreshHeaderState = () => {
        const unresolved = unresolvedCount();
        titleEl.textContent = modalText(
          !titleTemplate || titleIsCountTemplate
            ? `${titleCountPrefix || 'New items'} (${unresolved})`
            : titleTemplate
        );
        subtitleEl.textContent = modalText(
          unresolved === 0 ? allResolvedMessage : message || defaultUnknownMessage
        );
      };

      const renderRows = () => {
        refreshHeaderState();

        const hasSuggestions = uniqueRows.some((r) => {
          if (!r || !r.suggestion || r.suggestionApplied) return false;
          // If this row is already manually matched to an existing known name,
          // do not count it as needing a suggestion action.
          if (isKnownName(r.value)) return false;
          return true;
        });
        applyAllBtn.hidden = !hasSuggestions;
        headSuggestionsText.textContent = hasSuggestions ? 'Suggestions' : 'No suggestions';
        if (!uniqueRows.length) {
          body.innerHTML = '<div class="ui-unknown-items-empty-state">No pending items.</div>';
          return;
        }
        body.innerHTML = uniqueRows
          .map((row) => {
            const isEditing = editingId === row.id;
            const showSuggestion = !!row.suggestion && !row.suggestionApplied;
            return `
              <div class="ui-unknown-items-row">
                ${
                  isEditing
                    ? `<input
                         class="ui-unknown-items-original-input"
                         data-role="edit-original"
                         data-id="${row.id}"
                         type="text"
                         value="${String(row.value || '')
                           .replaceAll('&', '&amp;')
                           .replaceAll('<', '&lt;')
                           .replaceAll('>', '&gt;')
                           .replaceAll('"', '&quot;')}"
                       />`
                    : `<button class="ui-unknown-items-original-btn" data-role="open-edit" data-id="${row.id}" type="button">
                         <span class="ui-unknown-items-original-text ${row.isPurple ? 'is-purple' : ''}">${String(
                           row.value || ''
                         )
                           .replaceAll('&', '&amp;')
                           .replaceAll('<', '&lt;')
                           .replaceAll('>', '&gt;')
                           .replaceAll('"', '&quot;')}</span>
                       </button>`
                }
                <div class="ui-unknown-items-suggestion">
                  ${
                    showSuggestion
                      ? `<button class="ui-unknown-items-suggestion-pill" data-role="apply-suggestion" data-id="${
                          row.id
                        }" type="button">${String(row.suggestion || '')
                          .replaceAll('&', '&amp;')
                          .replaceAll('<', '&lt;')
                          .replaceAll('>', '&gt;')
                          .replaceAll('"', '&quot;')}</button>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('');
      };

      renderRows();

      cancelBtn.addEventListener('click', finishCancel);
      saveBtn.addEventListener('click', finishSave);
      editBtn.addEventListener('click', () => {
        if (!uniqueRows.length) return;
        pendingCaret = { rowId: uniqueRows[0].id, index: 0 };
        openEditorById(uniqueRows[0].id);
      });

      panel.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const roleEl = t.closest('[data-role]');
        if (!(roleEl instanceof HTMLElement)) return;
        const role = roleEl.dataset.role;
        const id = roleEl.dataset.id;
        if (role === 'apply-all') {
          if (applyAllBtn.hidden) return;
          uniqueRows.forEach((row) => applySuggestionForRow(row));
          renderRows();
          return;
        }
        if (role === 'apply-suggestion' && id) {
          const row = getRowById(id);
          applySuggestionForRow(row);
          renderRows();
          return;
        }
        if (role === 'open-edit' && id) {
          const textNode = roleEl.querySelector('.ui-unknown-items-original-text');
          const row = getRowById(id);
          const idx =
            textNode && row
              ? computeCaretIndexFromPointer({
                  textEl: textNode,
                  text: row.value,
                  clientX: Number(e.clientX || 0),
                })
              : null;
          pendingCaret = { rowId: id, index: idx };
          openEditorById(id);
        }
      });

      panel.addEventListener('input', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.dataset.role !== 'edit-original') return;
        const row = getRowById(t.dataset.id || '');
        if (!row) return;
        row.value = t.value;
        if (row.value !== editingStartValue) {
          row.isPurple = false;
          invalidateSuggestionForRow(row);
        }
        refreshHeaderState();
      });

      panel.addEventListener(
        'blur',
        (e) => {
          const t = e.target;
          if (!(t instanceof HTMLInputElement)) return;
          if (t.dataset.role !== 'edit-original') return;
          const row = getRowById(t.dataset.id || '');
          if (row) {
            row.value = t.value;
            if (row.value !== editingStartValue) {
              row.isPurple = false;
              invalidateSuggestionForRow(row);
            }
          }
          closeEditor();
          renderRows();
        },
        true
      );

      panel.addEventListener(
        'keydown',
        (e) => {
          if (!e) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            finishCancel();
            return;
          }
          trapTabKey(e, panel);
          const t = e.target;
          if (!(t instanceof HTMLInputElement)) return;
          if (t.dataset.role !== 'edit-original') return;
          if (e.key === 'Enter') {
            e.preventDefault();
            t.blur();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            const row = getRowById(t.dataset.id || '');
            if (row) row.value = editingStartValue;
            closeEditor();
            renderRows();
          }
        },
        { capture: true }
      );

      attachUiDialogOutsideDismiss(backdrop, panel, finishCancel);

      window.setTimeout(() => {
        try {
          saveBtn.focus();
        } catch (_) {}
      }, 0);
    });

  // Alert: default has *no title* (title "Alert" is redundant most of the time).
  const alertDialog = ({
    title = '',
    message = '',
    messageNode = null,
    okText = 'OK',
  } = {}) =>
    dialog({
      title,
      message,
      messageNode,
      confirmText: okText,
      showCancel: false,
      closeOnBackdrop: true,
    }).then(() => true);

  const confirmDialog = ({
    // Generic titles like "Confirm" are redundant; callers should pass a semantic title
    // only when it adds clarity (e.g. "Delete Recipe").
    title = '',
    message = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    danger = false,
  } = {}) =>
    dialog({
      title,
      message,
      confirmText,
      cancelText,
      showCancel: true,
      danger,
      closeOnBackdrop: true,
    }).then((res) => !!res);

  const promptDialog = ({
    // Generic titles like "Prompt" are redundant; callers should pass a semantic title
    // only when it adds clarity (e.g. "Rename", "New Unit").
    title = '',
    message = '',
    label = 'Value',
    value = '',
    placeholder = '',
    confirmText = 'OK',
    getConfirmText = null, // (values) => string — live primary CTA label
    cancelText = 'Cancel',
    required = false,
    normalize = null, // (v) => v
    validate = null, // (v) => string|''|null
  } = {}) =>
    dialog({
      title,
      message,
      fields: [
        {
          key: 'value',
          label,
          type: 'text',
          value,
          placeholder,
          required,
          autocapitalize: 'sentences',
        },
      ],
      confirmText,
      getConfirmText,
      cancelText,
      showCancel: true,
      validate: (vals) => {
        const raw = vals?.value != null ? String(vals.value) : '';
        const v =
          typeof normalize === 'function' ? String(normalize(raw) || '') : raw;
        if (required && !v.trim()) return 'Please enter a value.';
        if (typeof validate === 'function') return String(validate(v) || '').trim();
        return '';
      },
    }).then((vals) => {
      if (!vals) return null;
      const raw = vals.value != null ? String(vals.value) : '';
      const v = typeof normalize === 'function' ? String(normalize(raw) || '') : raw;
      return v;
    });

  const formDialog = ({
    // Generic titles like "Form" are redundant; callers should pass a semantic title
    // only when it adds clarity.
    title = '',
    message = '',
    fields = [], // [{ key, label, type, value, placeholder, required, normalize, options, validate }]
    confirmText = 'OK',
    cancelText = 'Cancel',
    validate = null, // (values) => string|''|null
    danger = false,
  } = {}) =>
    dialog({
      title,
      message,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type || 'text',
        value: f.value != null && f.value !== '' ? f.value : '',
        placeholder: f.placeholder || '',
        required: !!f.required,
        autocapitalize: f.autocapitalize || 'sentences',
        options: Array.isArray(f.options) ? f.options : null,
        validate: typeof f.validate === 'function' ? f.validate : null,
      })),
      confirmText,
      cancelText,
      showCancel: true,
      danger,
      validate: (vals) => {
        const out = {};
        fields.forEach((f) => {
          const k = String(f?.key || '');
          if (!k) return;
          const raw = vals?.[k] != null ? String(vals[k]) : '';
          out[k] =
            typeof f.normalize === 'function' ? String(f.normalize(raw) || '') : raw;
        });
        if (typeof validate === 'function') return String(validate(out) || '').trim();
        return '';
      },
      onConfirm: (vals) => {
        // Normalize before returning
        const out = {};
        fields.forEach((f) => {
          const k = String(f?.key || '');
          if (!k) return;
          const raw = vals?.[k] != null ? String(vals[k]) : '';
          out[k] =
            typeof f.normalize === 'function' ? String(f.normalize(raw) || '') : raw;
        });
        // Mutate resolved values to normalized output
        Object.keys(vals || {}).forEach((k) => delete vals[k]);
        Object.assign(vals, out);
      },
    });

  const toast = ({
    message = '',
    messageNode = null,
    actionText = '',
    onAction = null,
    timeoutMs = UI_TOAST_MS,
    singleSlot = true,
    toastClass = '',
  } = {}) => {
    try {
      const host = ensureToastHost();
      if (singleSlot) {
        try {
          while (host.firstChild) host.removeChild(host.firstChild);
        } catch (_) {}
      }

      const el = document.createElement('div');
      el.className = 'ui-toast typeahead-toast';
      if (toastClass) {
        const parts = String(toastClass)
          .split(/\s+/)
          .map((p) => p.trim())
          .filter(Boolean);
        for (let i = 0; i < parts.length; i += 1) {
          el.classList.add(parts[i]);
        }
      }

      const msg = document.createElement('div');
      msg.className = 'ui-toast__msg typeahead-toast__msg';
      if (messageNode != null && typeof messageNode.nodeType === 'number') {
        msg.appendChild(messageNode);
      } else {
        msg.textContent = message || '';
      }
      el.appendChild(msg);

      const lifetimeMs = Math.max(1000, Number(timeoutMs) || UI_TOAST_MS);
      let t = null;
      let cleanupOutsideDismiss = null;

      const removeToastFromDom = () => {
        try {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (_) {}
      };

      const dismissToastOnly = () => {
        try {
          window.clearTimeout(t);
        } catch (_) {}
        try {
          if (typeof cleanupOutsideDismiss === 'function') cleanupOutsideDismiss();
        } catch (_) {}
        cleanupOutsideDismiss = null;
        removeToastFromDom();
      };

      if (actionText) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-toast__action typeahead-toast__undo';
        btn.textContent = actionText;
        btn.addEventListener('click', () => {
          dismissToastOnly();
          try {
            if (typeof onAction === 'function') onAction();
          } catch (_) {}
        });
        el.appendChild(btn);
      }

      host.appendChild(el);
      cleanupOutsideDismiss = attachToastOutsideDismiss(el, dismissToastOnly);

      t = window.setTimeout(() => {
        dismissToastOnly();
      }, lifetimeMs);

      el.addEventListener('mouseenter', () => {
        try {
          window.clearTimeout(t);
        } catch (_) {}
      });
      el.addEventListener('mouseleave', () => {
        try {
          window.clearTimeout(t);
        } catch (_) {}
        t = window.setTimeout(() => {
          dismissToastOnly();
        }, lifetimeMs);
      });

      return el;
    } catch (_) {
      return null;
    }
  };

  window.ui = Object.freeze({
    dialog,
    dialogThreeChoice,
    unknownItems: unknownItemsDialog,
    alert: alertDialog,
    confirm: confirmDialog,
    prompt: promptDialog,
    form: formDialog,
    toast,
    dismissOpenDialogs,
    isDialogOpen: () => !!document.querySelector('#uiDialogHost[data-open="1"]'),
  });
})();

// --- Ingredient grammar helpers (pluralization) ---
function normalizeIngredientSingularSpelling(raw) {
  const base = String(raw || '').trim();
  const lower = base.toLowerCase();
  if (lower === 'tomatoe') return 'tomato';
  if (lower === 'potatoe') return 'potato';
  return base;
}

/** Partitive / structural units: noun stays singular ("1 slice tomato"), not "any unit ⇒ plural". */
function isPartitiveStyleUnit(rawUnit) {
  const unit = String(rawUnit || '').trim().toLowerCase();
  if (!unit) return false;
  return new Set([
    'slice',
    'slices',
    'piece',
    'pieces',
    'wedge',
    'wedges',
    'rib',
    'ribs',
    'stalk',
    'stalks',
  ]).has(unit);
}

function pluralizeEnglishNoun(singular, pluralOverride) {
  const base = normalizeIngredientSingularSpelling(singular);
  const override = (pluralOverride || '').trim();
  if (!base) return '';
  if (override) return override;

  const lower = base.toLowerCase();
  // Small irregular set (everything else can use plural_override if needed)
  const irregular = {
    leaf: 'leaves',
    loaf: 'loaves',
    knife: 'knives',
    life: 'lives',
    wife: 'wives',
    wolf: 'wolves',
    tomato: 'tomatoes',
    potato: 'potatoes',
  };
  if (irregular[lower]) {
    // Preserve capitalization of first letter (simple)
    const pl = irregular[lower];
    return base[0] === base[0].toUpperCase()
      ? pl.charAt(0).toUpperCase() + pl.slice(1)
      : pl;
  }

  // -ch/-sh/-s/-x/-z => +es
  if (/(ch|sh|s|x|z)$/i.test(base)) return base + 'es';

  // consonant + y => ies
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(base)) {
    return base.slice(0, -1) + 'ies';
  }

  return base + 's';
}

function parseNumericQuantityValue(q) {
  if (q == null) return null;
  if (typeof q === 'number') return Number.isFinite(q) ? q : null;
  const raw = String(q).trim();
  if (!raw) return null;

  // Mixed fraction: "1 1/2"
  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (
      Number.isFinite(whole) &&
      Number.isFinite(num) &&
      Number.isFinite(den) &&
      den > 0
    ) {
      return whole + num / den;
    }
  }

  // Simple fraction: "1/4"
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return num / den;
    }
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isNumericQuantity(q) {
  return parseNumericQuantityValue(q) != null;
}

/** Engaged custom plural only when use_plural_override is true (legacy: non-empty override). */
function effectiveIngredientPluralOverride(line) {
  const raw = String(
    line?.pluralOverride != null
      ? line.pluralOverride
      : line?.plural_override != null
        ? line.plural_override
        : '',
  ).trim();
  if (
    line?.usePluralOverride != null ||
    line?.use_plural_override != null
  ) {
    return (line.usePluralOverride ?? line.use_plural_override) ? raw : '';
  }
  return raw;
}

function getIngredientGrammarBase(displayBase, lemma, pluralOverride) {
  const display = String(displayBase || '').trim();
  const root = normalizeIngredientSingularSpelling(lemma);
  if (!display) return root;
  if (!root) return display;

  const displayLower = display.toLowerCase();
  const rootLower = root.toLowerCase();
  if (displayLower === rootLower) return root;

  const rootPlural = pluralizeEnglishNoun(root, pluralOverride).trim().toLowerCase();
  if (displayLower === rootPlural) return root;

  // If the typed/display label is not just the singular or plural form of the
  // canonical lemma, preserve that label for grammar too (e.g. AKA "beer"
  // should stay "beer"/"beers" instead of silently becoming "ale"/"ales").
  return display;
}

function getIngredientNounDisplay(line) {
  // line can be a recipe ingredient row or a formatter ingredient row
  if (!line) return '';

  // Linked sub-recipes use recipe titles; never apply ingredient pluralization
  // (e.g. qty 2 × recipe "bar" must stay "bar", not "bars").
  const linkedRecipeIdRaw = Number(
    line.linkedRecipeId != null ? line.linkedRecipeId : line.linked_recipe_id,
  );
  const linkedRecipeId = Math.trunc(linkedRecipeIdRaw);
  const isLinkedRecipeRow = !!(
    line.isRecipe ??
    line.is_recipe ??
    false
  ) &&
    Number.isFinite(linkedRecipeIdRaw) &&
    linkedRecipeId > 0;
  if (isLinkedRecipeRow) {
    const linkedTitle =
      String(
        line.linkedRecipeTitle != null
          ? line.linkedRecipeTitle
          : line.linked_recipe_title != null
            ? line.linked_recipe_title
            : '',
      ).trim() ||
      String(line.recipeText != null ? line.recipeText : '').trim() ||
      String(line.name || '').trim() ||
      String(line.lemma || '').trim();
    if (linkedTitle) return linkedTitle;
  }

  const name = (line.name || '').trim();
  const lemma = (line.lemma || '').trim();
  const displayBase = name || lemma;
  if (!displayBase) return '';

  const hasSingularIfUnspecified =
    line.singularIfUnspecified != null || line.singular_if_unspecified != null;
  const hasIsMassNoun =
    line.isMassNoun != null || line.is_mass_noun != null;
  const singularIfUnspecified = !!(
    line.singularIfUnspecified ??
    line.singular_if_unspecified ??
    false
  );
  const isMassNoun = !!(line.isMassNoun ?? line.is_mass_noun ?? 0);
  const pluralOverride = effectiveIngredientPluralOverride(line);
  const hasGrammarMetadata =
    !!lemma ||
    !!String(pluralOverride || '').trim() ||
    hasSingularIfUnspecified ||
    hasIsMassNoun;

  if (isMassNoun) return displayBase;
  // Unknown/free-text ingredients should stay exactly as typed to avoid
  // over-pluralization (e.g., "olive oils", "waters", "tomatoeses").
  if (!hasGrammarMetadata) return displayBase;
  const grammarBase = getIngredientGrammarBase(displayBase, lemma, pluralOverride);

  const unitRaw = String(line.unit != null ? line.unit : '').trim();
  const hasUnit = !!unitRaw;

  const qtyIsNumeric = isNumericQuantity(line.quantity);
  const n = qtyIsNumeric ? parseNumericQuantityValue(line.quantity) : null;
  const quantitySpecifiedNumeric = n != null && Number.isFinite(n);
  const quantityUnspecified = !quantitySpecifiedNumeric;

  if (singularIfUnspecified && quantityUnspecified) {
    return grammarBase || displayBase;
  }

  if (hasUnit) {
    if (isPartitiveStyleUnit(unitRaw)) {
      return grammarBase || displayBase;
    }
    return pluralizeEnglishNoun(grammarBase || displayBase, pluralOverride);
  }

  if (quantitySpecifiedNumeric) {
    const EPS = 1e-9;
    const isSingularCount = n > EPS && n <= 1 + EPS;
    if (isSingularCount) {
      return grammarBase || displayBase;
    }
    return pluralizeEnglishNoun(grammarBase || displayBase, pluralOverride);
  }

  return pluralizeEnglishNoun(grammarBase || displayBase, pluralOverride);
}

function getIngredientDisplayName(line) {
  if (!line) return '';
  const noun = getIngredientNounDisplay(line);
  const variant = (line.variant || '').trim();
  return variant ? `${variant} ${noun}`.trim() : noun;
}

/** Shopping-catalog row (Items browse, store aisle lists): plural label with no qty/unit. */
function getShoppingCatalogItemDisplayName(item) {
  if (!item) return '';
  const name = String(
    item.name != null ? item.name : item.baseName != null ? item.baseName : '',
  ).trim();
  if (!name) return '';
  return getIngredientNounDisplay({
    name,
    lemma: String(item.lemma || '').trim(),
    singularIfUnspecified: !!(
      item.singularIfUnspecified ?? item.singular_if_unspecified
    ),
    isMassNoun: !!(item.isMassNoun ?? item.is_mass_noun),
    pluralOverride: String(
      item.pluralOverride ?? item.plural_override ?? '',
    ).trim(),
    usePluralOverride: !!(
      item.usePluralOverride ?? item.use_plural_override
    ),
  });
}

/** Lowercase needles so typed plurals (tomatoes) match singular catalog rows (tomato). */
function shoppingCatalogLookupNeedleVariants(needleLc) {
  const needle = String(needleLc || '').trim().toLowerCase();
  const out = [];
  if (needle) out.push(needle);
  if (needle.length >= 6 && needle.endsWith('oes')) {
    out.push(needle.slice(0, -2));
  }
  if (needle.length >= 5 && needle.endsWith('ies')) {
    out.push(needle.slice(0, -3) + 'y');
  }
  if (
    needle.length >= 2 &&
    needle.endsWith('s') &&
    !needle.endsWith('ss') &&
    !needle.endsWith('oes') &&
    !needle.endsWith('ies')
  ) {
    out.push(needle.slice(0, -1));
  }
  return [...new Set(out)];
}

/** Search needles for one catalog row (name, lemma, list display, plural forms). */
function collectShoppingCatalogSearchLabels(item, options = {}) {
  const includeVariants = options.includeVariants !== false;
  const labels = [];
  const seen = new Set();
  const add = (raw) => {
    const label = String(raw || '')
      .trim()
      .toLowerCase();
    if (!label || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  };
  if (!item) return labels;

  add(item.name);
  if (item.lemma) add(item.lemma);

  const display = getShoppingCatalogItemDisplayName(item);
  add(display);

  const baseKey = String(item.baseKey || item.name || '')
    .trim()
    .toLowerCase();
  shoppingCatalogLookupNeedleVariants(baseKey).forEach(add);
  shoppingCatalogLookupNeedleVariants(
    String(display || '')
      .trim()
      .toLowerCase(),
  ).forEach(add);

  if (item.usePluralOverride ?? item.use_plural_override) {
    add(item.pluralOverride ?? item.plural_override);
  }

  if (includeVariants) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    variants.forEach((variant) => add(variant));
  }

  return labels;
}

/** Items browse search: match stored name, list display, and plural/singular variants. */
function shoppingCatalogItemMatchesSearchQuery(item, query, options = {}) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;
  const labels = collectShoppingCatalogSearchLabels(item, options);
  const queryNeedles = shoppingCatalogLookupNeedleVariants(needle);
  return labels.some((label) =>
    queryNeedles.some((queryNeedle) => label.includes(queryNeedle)),
  );
}

function buildShoppingCatalogLabelIndex(catalogByName) {
  const index = new Map();
  if (!catalogByName || typeof catalogByName.forEach !== 'function') {
    return index;
  }
  const add = (label, item) => {
    const key = String(label || '')
      .trim()
      .toLowerCase();
    if (!key || index.has(key)) return;
    index.set(key, item);
  };
  catalogByName.forEach((item) => {
    if (!item) return;
    add(item.name, item);
    if (item.lemma) add(item.lemma, item);
    const display = getShoppingCatalogItemDisplayName(item);
    add(display, item);
    shoppingCatalogLookupNeedleVariants(
      String(item.baseKey || item.name || '')
        .trim()
        .toLowerCase(),
    ).forEach((needle) => add(needle, item));
    shoppingCatalogLookupNeedleVariants(
      String(display || '')
        .trim()
        .toLowerCase(),
    ).forEach((needle) => add(needle, item));
  });
  return index;
}

/** Store-aisle / shopping type-along: pluralized display labels per catalog row. */
function buildShoppingCatalogTypeaheadNamePool(
  catalogByName,
  labelIndex = null,
  rawNames = null,
) {
  const out = [];
  const seen = new Set();
  const add = (label) => {
    const display = String(label || '').trim();
    const key = display.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(display);
  };
  const resolveCatalogItem = (rawName) => {
    const raw = String(rawName || '').trim();
    if (!raw) return null;
    if (labelIndex || catalogByName) {
      return resolveShoppingCatalogItemByLabel(
        catalogByName,
        labelIndex,
        raw,
      );
    }
    return null;
  };
  const addFromCatalogItem = (item) => {
    if (!item) return;
    add(getShoppingCatalogItemDisplayName(item));
  };

  if (Array.isArray(rawNames) && rawNames.length) {
    rawNames.forEach((rawName) => {
      const known = resolveCatalogItem(rawName);
      if (known) addFromCatalogItem(known);
      else add(rawName);
    });
  }

  if (catalogByName && typeof catalogByName.forEach === 'function') {
    catalogByName.forEach((item) => addFromCatalogItem(item));
  }

  return out.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

function resolveShoppingCatalogItemByLabel(catalogByName, labelIndex, typedLabel) {
  const needle = String(typedLabel || '')
    .trim()
    .toLowerCase();
  if (!needle) return null;
  if (catalogByName && typeof catalogByName.get === 'function') {
    const direct = catalogByName.get(needle);
    if (direct) return direct;
  }
  if (labelIndex && typeof labelIndex.get === 'function') {
    const hit = labelIndex.get(needle);
    if (hit) return hit;
  }
  const variants = shoppingCatalogLookupNeedleVariants(needle);
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (catalogByName && typeof catalogByName.get === 'function') {
      const direct = catalogByName.get(v);
      if (direct) return direct;
    }
    if (labelIndex && typeof labelIndex.get === 'function') {
      const hit = labelIndex.get(v);
      if (hit) return hit;
    }
  }
  return null;
}

// Expose helpers for other modules (loaded as scripts, not ES modules)
if (typeof window !== 'undefined') {
  window.pluralizeEnglishNoun = pluralizeEnglishNoun;
  window.effectiveIngredientPluralOverride = effectiveIngredientPluralOverride;
  window.getIngredientNounDisplay = getIngredientNounDisplay;
  window.getIngredientDisplayName = getIngredientDisplayName;
  window.getShoppingCatalogItemDisplayName = getShoppingCatalogItemDisplayName;
  window.shoppingCatalogLookupNeedleVariants =
    shoppingCatalogLookupNeedleVariants;
  window.collectShoppingCatalogSearchLabels =
    collectShoppingCatalogSearchLabels;
  window.shoppingCatalogItemMatchesSearchQuery =
    shoppingCatalogItemMatchesSearchQuery;
  window.buildShoppingCatalogLabelIndex = buildShoppingCatalogLabelIndex;
  window.buildShoppingCatalogTypeaheadNamePool =
    buildShoppingCatalogTypeaheadNamePool;
  window.resolveShoppingCatalogItemByLabel = resolveShoppingCatalogItemByLabel;
}

/**
 * Make a span element editable on click
 * Dynamically replaces it with an input, inheriting the font
 * @param {HTMLElement} span
 * @param {'qty'|'text'} type
 */

/**
 * Generic inline row editing helper (servings, ingredients, etc.).
 *
 * @param {{
 *   rowElement: HTMLElement;
 *   isEmpty: () => boolean;
 *   commit: () => void | Promise<void>;
 *   cancel: () => void;
 *   getIsEditing: () => boolean;
 *   setIsEditing: (bool: boolean) => void;
 * }} options
 *
 * @returns {{
 *   enterEdit: () => void;
 *   exitEdit: (shouldCommit: boolean) => void;
 *   destroy: () => void;
 * } | null}
 */
function setupInlineRowEditing(options) {
  if (!options || typeof options !== 'object') return null;

  const {
    rowElement,
    isEmpty,
    commit,
    cancel,
    getIsEditing,
    setIsEditing,
    onEnterCommit,
  } = options;

  if (
    !rowElement ||
    typeof isEmpty !== 'function' ||
    typeof commit !== 'function' ||
    typeof cancel !== 'function' ||
    typeof getIsEditing !== 'function' ||
    typeof setIsEditing !== 'function'
  ) {
    return null;
  }

  // Single-active-row guard across the app.
  if (!window._inlineRowEditState) {
    window._inlineRowEditState = { activeRow: null };
  }
  const globalState = window._inlineRowEditState;

  const enterEdit = () => {
    if (getIsEditing()) return;
    if (globalState.activeRow && globalState.activeRow !== rowElement) {
      // v1: block second editor instead of auto-committing.
      return;
    }
    globalState.activeRow = rowElement;
    setIsEditing(true);
  };

  const finishEditingState = () => {
    setIsEditing(false);
    if (globalState.activeRow === rowElement) {
      globalState.activeRow = null;
    }
  };

  /** Serializes overlapping blur/Escape exits so async `commit()` always finishes before we drop edit state. */
  let _exitChain = Promise.resolve();

  const runExit = (fn) => {
    _exitChain = _exitChain.then(fn).catch((err) => {
      console.warn('setupInlineRowEditing: exit chain', err);
    });
    return _exitChain;
  };

  const exitEditAsync = async (shouldCommit) => {
    if (!getIsEditing()) return;
    try {
      if (shouldCommit && !isEmpty()) {
        await Promise.resolve(commit());
      } else {
        cancel();
      }
    } catch (err) {
      console.warn('setupInlineRowEditing: commit failed', err);
    } finally {
      finishEditingState();
    }
  };

  const exitEdit = (shouldCommit) => {
    void runExit(async () => {
      await exitEditAsync(shouldCommit);
    });
  };

  // Guards against duplicate commit/cancel when Enter triggers DOM replacement,
  // which can synchronously fire focusout while we're still handling Enter.
  let _isFinalizing = false;

  const handleClick = () => {
    if (!getIsEditing()) {
      enterEdit();
    }
  };

  const handleKeyDown = (e) => {
    if (!getIsEditing()) return;
    if (_isFinalizing) return;

    // Preserve native hard line breaks in multiline editors (e.g. ingredient paste row).
    if (
      e.key === 'Enter' &&
      e.shiftKey &&
      e.target &&
      e.target.tagName === 'TEXTAREA'
    ) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      const empty = isEmpty();
      _isFinalizing = true;

      // IMPORTANT: end "editing" state BEFORE mutating DOM so any synchronous
      // focusout caused by replacement won't trigger a second commit.
      setIsEditing(false);
      if (globalState.activeRow === rowElement) globalState.activeRow = null;

      void (async () => {
        try {
          if (!empty) {
            try {
              await Promise.resolve(commit());
            } catch (err) {
              console.warn('setupInlineRowEditing: commit failed', err);
            }
            if (typeof onEnterCommit === 'function') onEnterCommit();
          } else {
            cancel();
          }
        } finally {
          // Allow future edits in the next tick.
          setTimeout(() => {
            _isFinalizing = false;
          }, 0);
        }
      })();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      void runExit(async () => {
        await exitEditAsync(false);
      });
    }
  };

  const handleFocusOut = (e) => {
    if (!getIsEditing()) return;
    if (_isFinalizing) return;

    const next = e.relatedTarget;
    if (next && rowElement.contains(next)) return;

    const shouldCommit = !isEmpty();
    // Mobile browsers (notably iOS Safari) often emit focusout with a null
    // relatedTarget when tapping between controls in the same row. Defer the
    // exit decision so checkbox toggles and label clicks can settle first
    // (same pattern as recipe tags inline edit).
    setTimeout(() => {
      if (!getIsEditing()) return;
      if (_isFinalizing) return;
      const active = document.activeElement;
      if (active && rowElement.contains(active)) return;
      void runExit(async () => {
        await exitEditAsync(shouldCommit);
      });
    }, 0);
  };

  // Clicking inside the row but not on a focusable control (e.g. the tray background)
  // should NOT trigger blur-commit. We use a "neutral focus" target when available,
  // so the row can remain in edit mode with no active field selected.
  const handleTrayPointerDownCapture = (e) => {
    if (!getIsEditing()) return;
    const t = e && e.target ? e.target : null;
    if (!t || !rowElement.contains(t)) return;

    // Clicking a pill label should behave like a label click (focus the wired input).
    // Let `wireLabelToInput` handle that.
    if (t.closest && t.closest('.field-pill')) return;

    // Clicking a label-wrapped control (e.g. the Ingredients "opt" toggle) should
    // behave normally. Preventing default on mousedown here can cancel the label's
    // default action (toggling the nested checkbox).
    if (t.closest) {
      const labelEl = t.closest('label');
      if (labelEl && labelEl.querySelector && labelEl.querySelector('input')) {
        return;
      }
      if (t.closest('.ingredient-edit-toggle')) return;
    }

    // Clicking a disabled button (or a child element inside one) must be a
    // no-op: do not redirect focus, which would cause handleFocusOut to fire
    // with relatedTarget outside the row and exit edit mode.
    const nearestBtn = t.closest && t.closest('button');
    if (nearestBtn && nearestBtn.disabled) return;

    // If the click is already on a focusable control, let it behave normally.
    const tag = (t.tagName || '').toLowerCase();
    const isFocusable =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      t.isContentEditable === true;

    if (isFocusable) return;

    // Tray background click:
    // - close any overlay dropdown
    // - move focus off inputs (neutral focus) without leaving edit mode
    e.preventDefault();

    try {
      if (
        window.favoriteEatsTypeahead &&
        typeof window.favoriteEatsTypeahead.close === 'function'
      ) {
        window.favoriteEatsTypeahead.close();
      }
    } catch (_) {}

    const blurTarget = rowElement.querySelector('.inline-edit-blur-target');
    if (blurTarget && typeof blurTarget.focus === 'function') {
      blurTarget.focus();
      return;
    }

    // Fallback: keep focus inside row (avoid exiting edit mode).
    const first = rowElement.querySelector(
      'input, textarea, select, [contenteditable="true"]'
    );
    if (first && typeof first.focus === 'function') {
      first.focus();
      if (typeof first.select === 'function') first.select();
    }
  };

  rowElement.addEventListener('click', handleClick);
  rowElement.addEventListener('keydown', handleKeyDown);
  rowElement.addEventListener('focusout', handleFocusOut);
  rowElement.addEventListener('pointerdown', handleTrayPointerDownCapture, true);

  return {
    enterEdit,
    exitEdit,
    destroy() {
      rowElement.removeEventListener('click', handleClick);
      rowElement.removeEventListener('keydown', handleKeyDown);
      rowElement.removeEventListener('focusout', handleFocusOut);
      rowElement.removeEventListener('pointerdown', handleTrayPointerDownCapture, true);
      if (globalState.activeRow === rowElement) {
        globalState.activeRow = null;
      }
    },
  };
}

/**
 * Wire a label-like element so clicking it focuses/selects a target input.
 * Shared by servings + ingredient inline editors.
 * @param {HTMLElement} labelEl
 * @param {HTMLInputElement|HTMLTextAreaElement} inputEl
 */
function wireLabelToInput(labelEl, inputEl) {
  if (!labelEl || !inputEl) return;

  labelEl.addEventListener('mousedown', (e) => {
    // Keep focus inside the row so blur logic sees focus staying in the row.
    e.preventDefault();
    inputEl.focus();
    if (typeof inputEl.select === 'function') {
      inputEl.select();
    }
  });
}

/**
 * Newline list textareas (shopping variants/sizes, store aisle items).
 * @param {HTMLTextAreaElement} el
 * @param {{ maxLines?: number }} [opts]
 */
function attachEditorTextareaAutoGrow(el, { maxLines = 8 } = {}) {
  if (!el) return;
  let computedMaxPx = 0;
  const computeMaxPx = () => {
    try {
      const cs = window.getComputedStyle ? getComputedStyle(el) : null;
      const fontSize = cs ? parseFloat(cs.fontSize) : 0;
      const lineHeightRaw = cs ? parseFloat(cs.lineHeight) : 0;
      const lineHeight =
        Number.isFinite(lineHeightRaw) && lineHeightRaw > 0
          ? lineHeightRaw
          : Number.isFinite(fontSize) && fontSize > 0
            ? fontSize * 1.4
            : 22;
      const padTop = cs ? parseFloat(cs.paddingTop) : 0;
      const padBot = cs ? parseFloat(cs.paddingBottom) : 0;
      const pad =
        (Number.isFinite(padTop) ? padTop : 0) +
        (Number.isFinite(padBot) ? padBot : 0);
      const lines = Math.max(1, Number(maxLines) || 8);
      return Math.round(pad + lineHeight * lines);
    } catch (_) {
      return 220;
    }
  };
  const resize = () => {
    try {
      if (!computedMaxPx) computedMaxPx = computeMaxPx();
      el.style.height = 'auto';
      const next = Math.min(el.scrollHeight || 0, computedMaxPx);
      el.style.height = `${Math.max(56, next)}px`;
    } catch (_) {}
  };
  try {
    el.__feAutoGrowResize = resize;
  } catch (_) {}
  el.addEventListener('input', resize);
  try {
    requestAnimationFrame(resize);
  } catch (_) {
    resize();
  }
}

/**
 * Shared paste behavior for newline list textareas.
 * Keeps paste plain-text and normalizes Windows line endings.
 * @param {HTMLTextAreaElement} el
 */
function attachEditorNewlineListPaste(el) {
  if (!el) return;
  el.addEventListener('paste', (e) => {
    try {
      const cd = e.clipboardData || window.clipboardData;
      if (!cd || typeof cd.getData !== 'function') return;
      const raw = cd.getData('text/plain');
      if (typeof raw !== 'string' || raw.length === 0) return;
      const normalized = raw.replace(/\r\n?/g, '\n');
      // Let regular single-line paste behave naturally.
      if (normalized.indexOf('\n') === -1) return;

      e.preventDefault();
      const start = Number.isFinite(el.selectionStart) ? el.selectionStart : 0;
      const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : start;
      const v = String(el.value || '');
      el.value = v.slice(0, start) + normalized + v.slice(end);
      const caret = start + normalized.length;
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(caret, caret);
      }
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    } catch (_) {}
  });
}

/**
 * Mount a fixed horizontal filter chip rail under the app bar search chrome.
 * Vertical placement uses CSS tokens (`.list-filter-chip-dock` top + stack height vars).
 * Returned `.sync()` is a no-op kept for call-site compatibility after chip rerenders.
 *
 * @param {{ anchorEl: HTMLElement, dockId?: string, removeOnDestroy?: boolean }} opts
 */
function mountTopFilterChipRail(opts = {}) {
  const anchorEl = opts?.anchorEl;
  if (!(anchorEl instanceof HTMLElement)) return null;

  const dockId = String(opts?.dockId || 'topFilterChipDock').trim();
  const removeOnDestroy = opts?.removeOnDestroy !== false;

  let dock = dockId ? document.getElementById(dockId) : null;
  if (!dock) {
    dock = document.createElement('div');
    if (dockId) dock.id = dockId;
    dock.className = 'list-filter-chip-dock';
    document.body.appendChild(dock);
  } else if (!dock.classList.contains('list-filter-chip-dock')) {
    dock.classList.add('list-filter-chip-dock');
  }

  let track = dock.querySelector('.list-filter-chip-track');
  if (!(track instanceof HTMLElement)) {
    track = document.createElement('div');
    track.className = 'list-filter-chip-track';
    dock.appendChild(track);
  } else if (track.parentElement !== dock) {
    dock.appendChild(track);
  }

  dock.querySelectorAll('.list-filter-chip-viewport').forEach((el) => {
    try {
      el.remove();
    } catch (_) {}
  });

  const bodyEl =
    document.body instanceof HTMLBodyElement ? document.body : null;
  const bodyRailCountKey = 'topFilterChipRailCount';
  if (bodyEl) {
    const currentCount = Math.max(
      0,
      Number.parseInt(bodyEl.dataset?.[bodyRailCountKey] || '0', 10) || 0,
    );
    bodyEl.dataset[bodyRailCountKey] = String(currentCount + 1);
    bodyEl.classList.add('has-top-filter-chip-rail');
  }

  try {
    dock.style.removeProperty('top');
    document.documentElement.style.removeProperty(
      '--top-filter-chip-rail-stack-height',
    );
  } catch (_) {}

  const sync = () => {};

  let destroyed = false;
  return {
    dockEl: dock,
    viewportEl: dock,
    trackEl: track,
    sync,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (bodyEl) {
        const currentCount = Math.max(
          0,
          Number.parseInt(bodyEl.dataset?.[bodyRailCountKey] || '0', 10) || 0,
        );
        const nextCount = Math.max(0, currentCount - 1);
        if (nextCount > 0) {
          bodyEl.dataset[bodyRailCountKey] = String(nextCount);
        } else {
          delete bodyEl.dataset[bodyRailCountKey];
          bodyEl.classList.remove('has-top-filter-chip-rail');
        }
      }
      if (removeOnDestroy && dock?.parentNode) {
        dock.parentNode.removeChild(dock);
      }
    },
  };
}

let filterDropdownChipPanelIdSeq = 0;
const FILTER_CHIP_DROPDOWN_OPEN_GRACE_MS = 200;
const FILTER_CHIP_COMPOUND_DROPDOWN_AUTO_CLOSE_MS = 2000;
const FILTER_CHIP_COMPOUND_DROPDOWN_AUTO_CLOSE_SNUG_MS = 2500;
const openFilterChipCompoundDropdownClosers = new Set();

function getFilterChipCompoundDropdownAutoCloseMs() {
  if (typeof window === 'undefined') {
    return FILTER_CHIP_COMPOUND_DROPDOWN_AUTO_CLOSE_MS;
  }
  const isSnugOrSmaller =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(
          `(max-width: ${COMPACT_WEB_APP_BAR_MAX_WIDTH_PX}px)`,
        ).matches
      : Number(window.innerWidth || 0) <= COMPACT_WEB_APP_BAR_MAX_WIDTH_PX;
  return isSnugOrSmaller
    ? FILTER_CHIP_COMPOUND_DROPDOWN_AUTO_CLOSE_SNUG_MS
    : FILTER_CHIP_COMPOUND_DROPDOWN_AUTO_CLOSE_MS;
}

function closeOtherOpenFilterChipCompoundDropdowns(exceptClosePanel = null) {
  openFilterChipCompoundDropdownClosers.forEach((closeFn) => {
    if (closeFn === exceptClosePanel) return;
    try {
      closeFn();
    } catch (_) {}
  });
}

function resolveFilterChipDropdownUiElement(target) {
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function readOpenFilterChipCompoundDropdownId(mountEl) {
  if (!(mountEl instanceof HTMLElement)) return '';
  const openWrap = mountEl.querySelector('.app-filter-chip-dropdown-wrap.is-open');
  if (!openWrap) return '';
  return String(openWrap.dataset.compoundId || '').trim().toLowerCase();
}

/**
 * Shared chip renderer used by multiple list pages.
 * Renders a simple pill-chip set with active/disabled states.
 *
 * @param {{
 *   mountEl: HTMLElement,
 *   chips: Array<{ id: string, label: string, disabled?: boolean }>,
 *   activeChipIds?: Set<string>|string[],
 *   onToggle?: (chipId: string) => void,
 *   chipClassName?: string
 * }} opts
 */
function renderFilterChipList(opts = {}) {
  const mountEl = opts?.mountEl;
  if (!(mountEl instanceof HTMLElement)) return;

  const chips = Array.isArray(opts?.chips) ? opts.chips : [];
  const compoundChips = Array.isArray(opts?.compoundChips) ? opts.compoundChips : [];
  const trailingChips = Array.isArray(opts?.trailingChips) ? opts.trailingChips : [];
  const leadingCompoundChips = Array.isArray(opts?.leadingCompoundChips)
    ? opts.leadingCompoundChips
    : [];
  const totalCompoundChipCount =
    leadingCompoundChips.length + compoundChips.length;
  const activeSrc = opts?.activeChipIds;
  const active = activeSrc instanceof Set ? activeSrc : new Set(activeSrc || []);
  const onToggle = typeof opts?.onToggle === 'function' ? opts.onToggle : null;
  const chipClassName = String(opts?.chipClassName || 'app-filter-chip').trim();
  const reopenCompoundDropdown = !!opts?.reopenCompoundDropdown;
  const reopenCompoundDropdownId = String(opts?.reopenCompoundDropdownId || '')
    .trim()
    .toLowerCase();

  const previousCleanupFns = Array.isArray(mountEl.__chipUiCleanupFns)
    ? mountEl.__chipUiCleanupFns
    : [];
  previousCleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
  mountEl.__chipUiCleanupFns = [];

  mountEl.innerHTML = '';

  const compoundInsertIndexRaw = opts?.compoundInsertIndex;
  const compoundInsertIndex =
    compoundInsertIndexRaw == null ||
    compoundInsertIndexRaw === '' ||
    Number.isNaN(Number(compoundInsertIndexRaw))
      ? null
      : Math.max(0, Math.floor(Number(compoundInsertIndexRaw)));

  const renderOneFlatChip = (chipDef) => {
    const id = String(chipDef?.id || '').trim().toLowerCase();
    if (!id) return;
    const label = String(chipDef?.label || id);
    const disabled = !!chipDef?.disabled;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = chipClassName;
    chip.textContent = label;
    chip.disabled = disabled;
    if (disabled) chip.classList.add('is-disabled');
    if (active.has(id)) chip.classList.add('is-active');
    if (onToggle) {
      chip.addEventListener('click', () => onToggle(id));
    }
    mountEl.appendChild(chip);
  };

  const renderOneCompoundChip = (compoundDef) => {
      const compoundId = String(compoundDef?.id || '').trim().toLowerCase();
      if (!compoundId) return;
      const optionDefs = Array.isArray(compoundDef?.options) ? compoundDef.options : [];
      const optionSelectedIds = new Set(
        compoundDef?.selectedOptionIds instanceof Set
          ? Array.from(compoundDef.selectedOptionIds)
          : compoundDef?.selectedOptionIds || [],
      );
      const label = String(compoundDef?.label || compoundId);
      const toggleOption =
        typeof compoundDef?.onToggleOption === 'function'
          ? compoundDef.onToggleOption
          : null;
      const onClearSelection =
        typeof compoundDef?.onClearSelection === 'function'
          ? compoundDef.onClearSelection
          : null;
      const align = String(compoundDef?.panelAlign || 'start').trim().toLowerCase();
      const selectionMode = String(compoundDef?.selectionMode || '')
        .trim()
        .toLowerCase();
      const isSingleSelect = selectionMode === 'single';
      const hasSelection = optionSelectedIds.size > 0;
      const pillActiveOverride = compoundDef?.pillActive;
      const pillIsActive =
        typeof pillActiveOverride === 'boolean'
          ? pillActiveOverride
          : isSingleSelect
            ? false
            : hasSelection;
      const compoundDisabled =
        !!compoundDef?.disabled || optionDefs.length === 0;

      const wrapper = document.createElement('div');
      wrapper.className = 'app-filter-chip-dropdown-wrap';
      wrapper.dataset.compoundId = compoundId;

      const pill = document.createElement('div');
      pill.className = `${chipClassName} app-filter-chip--dropdown app-filter-chip--dropdown-pill`;
      pill.setAttribute('role', 'group');
      if (compoundDisabled) {
        pill.classList.add('is-disabled');
      }

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'app-filter-chip-dropdown-open';
      openBtn.setAttribute('aria-haspopup', 'listbox');
      openBtn.setAttribute('aria-expanded', 'false');
      if (compoundDisabled) {
        openBtn.disabled = true;
        openBtn.classList.add('is-disabled');
      }
      if (pillIsActive) pill.classList.add('is-active');

      const labelEl = document.createElement('span');
      labelEl.className = 'app-filter-chip-dropdown-label';
      labelEl.textContent = label;
      openBtn.appendChild(labelEl);

      const chevronEl = document.createElement('span');
      chevronEl.className =
        'material-symbols-outlined app-filter-chip-dropdown-chevron';
      chevronEl.setAttribute('aria-hidden', 'true');
      chevronEl.textContent = 'expand_more';
      openBtn.appendChild(chevronEl);

      pill.appendChild(openBtn);

      if (hasSelection && onClearSelection && !isSingleSelect) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'app-filter-chip-dropdown-clear';
        clearBtn.setAttribute(
          'aria-label',
          String(compoundDef?.clearAriaLabel || 'Clear selection'),
        );
        const clearIcon = document.createElement('span');
        clearIcon.className =
          'material-symbols-outlined app-filter-chip-dropdown-clear-icon';
        clearIcon.setAttribute('aria-hidden', 'true');
        clearIcon.textContent = 'cancel';
        clearBtn.appendChild(clearIcon);
        clearBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          onClearSelection();
        });
        pill.appendChild(clearBtn);
      }

      const panel = document.createElement('div');
      panel.className = 'app-filter-chip-dropdown-panel';
      const panelClassName = String(compoundDef?.panelClassName || '').trim();
      if (panelClassName) {
        panel.classList.add(panelClassName);
      }
      panel.hidden = true;
      panel.role = 'listbox';
      panel.setAttribute(
        'aria-multiselectable',
        isSingleSelect ? 'false' : 'true',
      );
      panel.id = `filterChipDropdownPanel${++filterDropdownChipPanelIdSeq}`;
      openBtn.setAttribute('aria-controls', panel.id);

      const renderPanelHeader =
        typeof compoundDef?.renderPanelHeader === 'function'
          ? compoundDef.renderPanelHeader
          : null;
      if (renderPanelHeader) {
        try {
          renderPanelHeader(panel);
        } catch (_) {}
      }

      optionDefs.forEach((optionDef) => {
        const optionId = String(optionDef?.id || '').trim().toLowerCase();
        if (!optionId) return;
        const optionLabel = String(optionDef?.label || optionId);
        const optionDisabled = !!optionDef?.disabled;
        const selected = optionSelectedIds.has(optionId);

        const optionBtn = document.createElement('button');
        optionBtn.type = 'button';
        optionBtn.className = 'app-filter-chip-dropdown-option';
        optionBtn.role = 'option';
        optionBtn.dataset.optionId = optionId;
        optionBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) optionBtn.classList.add('is-selected');
        if (optionDisabled) {
          optionBtn.disabled = true;
          optionBtn.classList.add('is-disabled');
        }

        const optionText = document.createElement('span');
        optionText.className = 'app-filter-chip-dropdown-option-label';
        optionText.textContent = optionLabel;
        optionBtn.appendChild(optionText);

        const optionCheck = document.createElement('span');
        optionCheck.className =
          'material-symbols-outlined app-filter-chip-dropdown-option-check';
        optionCheck.setAttribute('aria-hidden', 'true');
        optionCheck.textContent = selected ? 'check' : '';
        optionBtn.appendChild(optionCheck);

        if (toggleOption) {
          optionBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (optionDisabled) return;
            toggleOption(optionId);
          });
        }

        panel.appendChild(optionBtn);
      });

      const renderPanelFooter =
        typeof compoundDef?.renderPanelFooter === 'function'
          ? compoundDef.renderPanelFooter
          : null;
      if (renderPanelFooter) {
        try {
          renderPanelFooter(panel);
        } catch (_) {}
      }

      wrapper.appendChild(pill);
      mountEl.appendChild(wrapper);

      let backdropEl = null;
      let panelOpenedAt = 0;
      let autoCloseTimer = null;
      let autoCloseAfterHoverEndTimer = null;

      const clearAutoCloseTimer = () => {
        if (autoCloseTimer != null) {
          clearTimeout(autoCloseTimer);
          autoCloseTimer = null;
        }
      };

      const clearAutoCloseAfterHoverEndTimer = () => {
        if (autoCloseAfterHoverEndTimer != null) {
          clearTimeout(autoCloseAfterHoverEndTimer);
          autoCloseAfterHoverEndTimer = null;
        }
      };

      const isPointerOverDropdownUi = () => {
        try {
          return !!(wrapper.matches(':hover') || panel.matches(':hover'));
        } catch (_) {
          return false;
        }
      };

      const isDropdownUiHoverRelatedTarget = (target) => {
        const el = resolveFilterChipDropdownUiElement(target);
        if (!el) return false;
        return wrapper.contains(el) || panel.contains(el);
      };

      const scheduleAutoCloseTimer = () => {
        clearAutoCloseTimer();
        autoCloseTimer = setTimeout(() => {
          autoCloseTimer = null;
          closePanel();
        }, getFilterChipCompoundDropdownAutoCloseMs());
      };

      const scheduleAutoCloseAfterHoverEnd = () => {
        clearAutoCloseAfterHoverEndTimer();
        autoCloseAfterHoverEndTimer = setTimeout(() => {
          autoCloseAfterHoverEndTimer = null;
          if (panel.hidden) return;
          if (isPointerOverDropdownUi()) return;
          scheduleAutoCloseTimer();
        }, 80);
      };

      const onDropdownUiPointerEnter = () => {
        clearAutoCloseAfterHoverEndTimer();
        clearAutoCloseTimer();
      };

      const onDropdownUiPointerLeave = (event) => {
        if (isDropdownUiHoverRelatedTarget(event?.relatedTarget)) return;
        if (panel.hidden) return;
        scheduleAutoCloseAfterHoverEnd();
      };

      const syncAutoCloseForOpenPanel = () => {
        if (panel.hidden) return;
        if (isPointerOverDropdownUi()) {
          clearAutoCloseAfterHoverEndTimer();
          clearAutoCloseTimer();
          return;
        }
        scheduleAutoCloseAfterHoverEnd();
      };

      const closePanel = () => {
        if (panel.hidden) return;
        clearAutoCloseAfterHoverEndTimer();
        clearAutoCloseTimer();
        panel.hidden = true;
        wrapper.classList.remove('is-open');
        openBtn.setAttribute('aria-expanded', 'false');
        if (backdropEl && backdropEl.parentNode) {
          backdropEl.parentNode.removeChild(backdropEl);
        }
        backdropEl = null;
        if (panel.parentElement) {
          panel.parentElement.removeChild(panel);
        }
      };
      openFilterChipCompoundDropdownClosers.add(closePanel);
      const syncPanelPosition = () => {
        if (panel.hidden) return;
        const rect = pill.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth || rect.right;
        panel.style.minWidth = `${Math.round(rect.width)}px`;
        const margin = 12;
        let left = align === 'end' ? rect.right - panel.offsetWidth : rect.left;
        left = Math.max(margin, Math.min(left, viewportWidth - panel.offsetWidth - margin));
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(rect.bottom + 8)}px`;
      };
      const openPanel = () => {
        if (!panel.hidden) return;
        closeOtherOpenFilterChipCompoundDropdowns(closePanel);
        backdropEl = document.createElement('div');
        backdropEl.className = 'app-filter-chip-dropdown-backdrop';
        backdropEl.setAttribute('aria-hidden', 'true');
        backdropEl.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          closePanel();
        });
        document.body.appendChild(backdropEl);
        document.body.appendChild(panel);
        panel.hidden = false;
        wrapper.classList.add('is-open');
        openBtn.setAttribute('aria-expanded', 'true');
        syncPanelPosition();
        panelOpenedAt = Date.now();
        requestAnimationFrame(() => {
          syncAutoCloseForOpenPanel();
        });
      };
      const onDocumentPointerDown = (event) => {
        if (panel.hidden) return;
        const target = resolveFilterChipDropdownUiElement(event?.target);
        if (
          Date.now() - panelOpenedAt < FILTER_CHIP_DROPDOWN_OPEN_GRACE_MS &&
          target &&
          pill.contains(target)
        ) {
          return;
        }
        if (!target) {
          closePanel();
          return;
        }
        if (pill.contains(target) || panel.contains(target)) return;
        closePanel();
      };
      const onDocumentKeyDown = (event) => {
        if (event?.key === 'Escape') {
          closePanel();
        }
      };
      const onViewportMove = () => {
        syncPanelPosition();
      };

      openBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (compoundDisabled) return;
        if (panel.hidden) {
          openPanel();
        } else {
          closePanel();
        }
      });
      wrapper.addEventListener('pointerenter', onDropdownUiPointerEnter);
      wrapper.addEventListener('pointerleave', onDropdownUiPointerLeave);
      panel.addEventListener('pointerenter', onDropdownUiPointerEnter);
      panel.addEventListener('pointerleave', onDropdownUiPointerLeave);
      document.addEventListener('pointerdown', onDocumentPointerDown, true);
      document.addEventListener('keydown', onDocumentKeyDown);
      window.addEventListener('resize', onViewportMove);
      window.addEventListener('scroll', onViewportMove, true);

      mountEl.__chipUiCleanupFns.push(() => {
        openFilterChipCompoundDropdownClosers.delete(closePanel);
        clearAutoCloseAfterHoverEndTimer();
        clearAutoCloseTimer();
        wrapper.removeEventListener('pointerenter', onDropdownUiPointerEnter);
        wrapper.removeEventListener('pointerleave', onDropdownUiPointerLeave);
        panel.removeEventListener('pointerenter', onDropdownUiPointerEnter);
        panel.removeEventListener('pointerleave', onDropdownUiPointerLeave);
        closePanel();
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        document.removeEventListener('keydown', onDocumentKeyDown);
        window.removeEventListener('resize', onViewportMove);
        window.removeEventListener('scroll', onViewportMove, true);
      });

      if (
        reopenCompoundDropdown &&
        (
          (reopenCompoundDropdownId && compoundId === reopenCompoundDropdownId) ||
          (!reopenCompoundDropdownId && totalCompoundChipCount === 1)
        )
      ) {
        requestAnimationFrame(() => {
          openPanel();
        });
      }
  };

  leadingCompoundChips.forEach(renderOneCompoundChip);

  if (compoundInsertIndex == null) {
    chips.forEach((chipDef) => renderOneFlatChip(chipDef));
    compoundChips.forEach(renderOneCompoundChip);
  } else {
    chips.forEach((chipDef, idx) => {
      if (idx === compoundInsertIndex) {
        compoundChips.forEach(renderOneCompoundChip);
      }
      renderOneFlatChip(chipDef);
    });
    if (compoundInsertIndex >= chips.length) {
      compoundChips.forEach(renderOneCompoundChip);
    }
  }
  trailingChips.forEach((chipDef) => renderOneFlatChip(chipDef));
}

if (typeof window !== 'undefined') {
  window.mountTopFilterChipRail = mountTopFilterChipRail;
  window.renderFilterChipList = renderFilterChipList;
  window.readOpenFilterChipCompoundDropdownId =
    readOpenFilterChipCompoundDropdownId;
}

(function favoriteEatsLongPressModule(global) {
  if (!global || global.favoriteEatsLongPress) return;

  const DEFAULT_HOLD_MS = 500;
  const DEFAULT_MOVE_THRESHOLD_PX = 10;

  function isCoarsePointer() {
    try {
      return global.matchMedia('(pointer: coarse)').matches;
    } catch (_) {
      return false;
    }
  }

  function bind(target, callback, options = {}) {
    if (!(target instanceof Element) || typeof callback !== 'function') {
      return () => {};
    }

    const holdMs = Number(options.holdMs) || DEFAULT_HOLD_MS;
    const moveThresholdPx =
      Number(options.moveThresholdPx) || DEFAULT_MOVE_THRESHOLD_PX;
    const onlyCoarse = options.onlyCoarse !== false;

    let timer = null;
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let suppressNextClick = false;

    const clearTimer = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const resetGesture = () => {
      clearTimer();
      activePointerId = null;
    };

    const onPointerDown = (event) => {
      if (onlyCoarse && !isCoarsePointer()) return;
      if (!(event instanceof PointerEvent)) return;
      if (Number(event.button) !== 0) return;
      if (typeof options.shouldIgnore === 'function' && options.shouldIgnore(event)) {
        return;
      }

      resetGesture();
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      timer = setTimeout(() => {
        timer = null;
        suppressNextClick = true;
        try {
          callback(event);
        } catch (_) {}
      }, holdMs);
    };

    const onPointerMove = (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) > moveThresholdPx) resetGesture();
    };

    const onPointerUp = (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId) return;
      resetGesture();
    };

    const onPointerCancel = (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId) return;
      resetGesture();
    };

    const onClickCapture = (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerCancel);
    target.addEventListener('click', onClickCapture, true);

    return () => {
      resetGesture();
      suppressNextClick = false;
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
      target.removeEventListener('click', onClickCapture, true);
    };
  }

  function bindRemoveAction(target, callback, options = {}) {
    return bind(target, callback, options);
  }

  global.favoriteEatsLongPress = {
    bind,
    bindRemoveAction,
    isCoarsePointer,
  };
  global.favoriteEatsBindLongPressRemove = bindRemoveAction;
})(typeof window !== 'undefined' ? window : null);
