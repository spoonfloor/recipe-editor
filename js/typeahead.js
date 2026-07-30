// Reusable typeahead / type-along dropdown controller (v1)
// Designed to satisfy docs/ux/ux_ingredient-type-ahead.md

(function () {
  if (typeof window === 'undefined') return;

  // Blur-time near-match correction for ingredient name/unit/variant (Levenshtein vs pool).
  const INGREDIENT_BLUR_NORMALIZATION_ENABLED = true;

  // --- Global per-session exemption set for normalization ("Undo" exempts exact raw string)
  const normalizationExemptions = new Set();
  window._typeaheadNormalizationExemptions = normalizationExemptions;

  // --- Small toast helper (reuse global if available)
  const showUndoToast =
    typeof window.showUndoToast === 'function'
      ? window.showUndoToast
      : function showUndoToastFallback({ message, onUndo }) {
          try {
            let host = document.getElementById('typeaheadToastHost');
            if (!host) {
              host = document.createElement('div');
              host.id = 'typeaheadToastHost';
              host.className = 'typeahead-toast-host';
              document.body.appendChild(host);
            }

            const toast = document.createElement('div');
            toast.className = 'typeahead-toast';

            const msg = document.createElement('div');
            msg.className = 'typeahead-toast__msg';
            msg.textContent = message || '';
            toast.appendChild(msg);

            const undoBtn = document.createElement('button');
            undoBtn.type = 'button';
            undoBtn.className = 'typeahead-toast__undo';
            undoBtn.textContent = 'Undo';
            undoBtn.addEventListener('click', () => {
              try {
                if (typeof onUndo === 'function') onUndo();
              } finally {
                if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
              }
            });
            toast.appendChild(undoBtn);

            host.appendChild(toast);

            const t = window.setTimeout(() => {
              if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
            }, 3500);

            toast.addEventListener('mouseenter', () => {
              try {
                window.clearTimeout(t);
              } catch (_) {}
            });

            return toast;
          } catch (_) {
            return null;
          }
        };

  // --- Text helpers
  const norm = (s) => (s || '').toString().trim();
  const lower = (s) => norm(s).toLowerCase();

  // --- Typeahead keyboard helpers (tests extract this block) ---
  function shouldPreserveTextareaShiftEnter(inputEl, event) {
    return !!(
      event &&
      event.key === 'Enter' &&
      event.shiftKey &&
      inputEl &&
      String(inputEl.tagName || '').toUpperCase() === 'TEXTAREA'
    );
  }

  window.__typeaheadKeyboardHelpers = {
    shouldPreserveTextareaShiftEnter,
  };
  // --- End typeahead keyboard helpers ---

  // Levenshtein distance (small strings; OK for our pool sizes)
  function levenshtein(a, b) {
    a = lower(a);
    b = lower(b);
    if (a === b) return 0;
    const al = a.length;
    const bl = b.length;
    if (!al) return bl;
    if (!bl) return al;

    const v0 = new Array(bl + 1);
    const v1 = new Array(bl + 1);
    for (let i = 0; i <= bl; i++) v0[i] = i;

    for (let i = 0; i < al; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bl; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= bl; j++) v0[j] = v1[j];
    }

    return v0[bl];
  }

  function isNearMatchCandidate(input, candidate) {
    const s = norm(input);
    const c = norm(candidate);
    if (!s || !c) return false;
    if (s.length < 3) return false; // v1 rule
    if (lower(s) === lower(c)) return false;

    const d = levenshtein(s, c);
    // Conservative heuristic (v1; exact math intentionally deferred in spec)
    // - short strings: only 1 edit
    // - longer strings: up to 2 edits
    if (s.length <= 5) return d <= 1;
    return d <= 2;
  }

  function findBestNearMatch(input, pool) {
    const s = norm(input);
    if (!s || s.length < 3) return null;

    let best = null;
    let bestD = Infinity;
    let tie = false;

    for (const cand of pool || []) {
      if (!isNearMatchCandidate(s, cand)) continue;
      const d = levenshtein(s, cand);
      if (d < bestD) {
        best = cand;
        bestD = d;
        tie = false;
      } else if (d === bestD) {
        tie = true;
      }
    }

    if (!best || tie) return null;
    return best;
  }

  function findBestNearMatchForUnit(input, pool) {
    // Units are prone to dangerous false positives (e.g., tbsp -> tsp).
    // For v1 we only attempt near-match normalization if there is a prefix relationship
    // between input and candidate (in either direction).
    const s = norm(input);
    if (!s || s.length < 3) return null;
    const sL = lower(s);

    let best = null;
    let bestD = Infinity;
    let tie = false;

    for (const cand of pool || []) {
      const c = norm(cand);
      if (!c) continue;
      const cL = lower(c);
      if (sL === cL) continue;
      const prefixOk = sL.startsWith(cL) || cL.startsWith(sL);
      if (!prefixOk) continue;
      if (!isNearMatchCandidate(s, c)) continue;
      const d = levenshtein(s, c);
      if (d < bestD) {
        best = c;
        bestD = d;
        tie = false;
      } else if (d === bestD) {
        tie = true;
      }
    }

    if (!best || tie) return null;
    return best;
  }

  function findCaseInsensitiveExactPoolMatch(input, pool) {
    const s = norm(input);
    if (!s) return null;
    const sLower = lower(s);
    for (const cand of pool || []) {
      const c = norm(cand);
      if (!c) continue;
      if (lower(c) === sLower) return c;
    }
    return null;
  }

  function applyBlurNormalization(inputEl, raw, next, messagePrefix) {
    const from = norm(raw);
    const to = norm(next);
    if (!from || !to || from === to) return;

    inputEl.value = to;
    try {
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}

    showUndoToast({
      message: `${messagePrefix} “${from}” → “${to}”`,
      onUndo: () => {
        normalizationExemptions.add(from);
        inputEl.value = from;
        try {
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
        try {
          inputEl.focus();
          if (typeof inputEl.select === 'function') inputEl.select();
        } catch (_) {}
      },
    });
  }

  // --- Ranking / filtering
  function filterAndRank(pool, query) {
    const q = lower(query);
    const items = (pool || []).map((v) => norm(v)).filter((v) => v.length > 0);
    if (!q) {
      // empty query: alphabetical
      return items.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }

    const matches = [];
    for (const item of items) {
      const li = lower(item);
      const idx = li.indexOf(q);
      if (idx === -1) continue;
      const isPrefix = idx === 0;
      matches.push({ item, isPrefix });
    }

    matches.sort((a, b) => {
      if (a.isPrefix !== b.isPrefix) return a.isPrefix ? -1 : 1;
      return a.item.localeCompare(b.item, undefined, { sensitivity: 'base' });
    });

    return matches.map((m) => m.item);
  }

  function filterAndRankPreservePoolOrderOnEmpty(pool, query) {
    const q = lower(query);
    const items = (pool || []).map((v) => norm(v)).filter((v) => v.length > 0);
    if (!q) {
      // Keep pool order (caller controls canonical order).
      return items;
    }
    return filterAndRank(items, q);
  }

  // --- Dropdown UI (single active instance)
  class TypeaheadDropdown {
    constructor() {
      this.el = null;
      this.items = [];
      this.highlightIdx = 0;
      this.isOpen = false;
      this.anchorInput = null;
      this.config = null;
      this.fixedWidth = null;
      this._updateReqId = 0;

      this._onScroll = (e) => {
        // Close on page scroll, but NOT when the dropdown list itself scrolls
        // (arrowing through items can scroll the internal list).
        try {
          const t = e && e.target ? e.target : null;
          if (t && this.el && (t === this.el || this.el.contains(t))) return;
        } catch (_) {}
        // Ignore scroll events caused by layout reflow immediately after open
        // (e.g. auto-grow textarea resizing during the same input event).
        if (this._scrollMuteUntil && Date.now() < this._scrollMuteUntil) return;
        this.close();
      };
    }

    ensureEl() {
      if (this.el) return this.el;
      const el = document.createElement('div');
      el.className = 'typeahead-dropdown';
      el.style.display = 'none';

      // Prevent clicks inside dropdown from causing row blur/commit.
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // keep focus in the input
        const inp = this.anchorInput;
        if (inp && typeof inp.focus === 'function') inp.focus();
      });

      el.addEventListener('click', (e) => {
        const t = e.target;
        const row = t && t.closest ? t.closest('.typeahead-item') : null;
        const empty = t && t.closest ? t.closest('.typeahead-empty') : null;
        if (row) {
          const value =
            row.dataset && row.dataset.value
              ? row.dataset.value
              : row.textContent;
          this.pick(value);
          return;
        }
        if (empty) {
          this.close();
        }
      });

      document.body.appendChild(el);
      this.el = el;
      return el;
    }

    open(input, config) {
      if (!input) return;
      this.ensureEl();
      this.anchorInput = input;
      this.config = config || null;
      this.isOpen = true;
      this.fixedWidth = null; // assigned on first position

      this._scrollMuteUntil = Date.now() + 80;
      window.addEventListener('scroll', this._onScroll, true);

      this.update();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.anchorInput = null;
      this.config = null;
      this.items = [];
      this.highlightIdx = 0;
      if (this.el) this.el.style.display = 'none';
      window.removeEventListener('scroll', this._onScroll, true);
    }

    getQuery() {
      const inp = this.anchorInput;
      // Special-case: allow one-time forced empty query (used for "open on focus"
      // for units so the user sees the full list immediately).
      if (inp && inp._typeaheadForceEmptyQueryOnce) {
        inp._typeaheadForceEmptyQueryOnce = false;
        return '';
      }
      if (this.config && typeof this.config.getQuery === 'function') {
        try {
          return norm(this.config.getQuery(inp));
        } catch (_) {}
      }
      return inp ? norm(inp.value) : '';
    }

    async getPool() {
      const cfg = this.config;
      if (!cfg || typeof cfg.getPool !== 'function') return [];
      const inp = this.anchorInput;
      return await cfg.getPool(inp);
    }

    async update() {
      if (!this.isOpen || !this.anchorInput) return;
      const el = this.ensureEl();
      const anchor = this.anchorInput;
      const query = this.getQuery();
      let allowEmptyQuery = false;
      try {
        allowEmptyQuery =
          !query &&
          this.config &&
          typeof this.config.allowSuggestionsWhenQueryEmpty === 'function' &&
          !!this.config.allowSuggestionsWhenQueryEmpty(anchor, query);
      } catch (_) {}
      if (this.config && this.config.closeOnEmptyQuery && !query && !allowEmptyQuery) {
        this.close();
        return;
      }

      const reqId = ++this._updateReqId;
      const pool = await this.getPool();
      if (reqId !== this._updateReqId) return; // stale async update
      if (!this.isOpen || !this.anchorInput) return;
      if (this.anchorInput !== anchor) return; // focus moved during async fetch
      // Per-instance list behavior (defaults to current filter+rank).
      let ranked = [];
      try {
        if (this.config && typeof this.config.getItems === 'function') {
          ranked = this.config.getItems(pool, query, anchor) || [];
        } else {
          ranked = filterAndRank(pool, query);
        }
      } catch (_) {
        ranked = filterAndRank(pool, query);
      }

      // Above-the-fold cap (scroll for the rest). Default stays 8.
      let maxVisible = 8;
      try {
        const v = this.config && this.config.maxVisible;
        if (Number.isFinite(Number(v))) {
          maxVisible = Math.max(1, Math.floor(Number(v)));
        }
      } catch (_) {}

      // Render
      el.innerHTML = '';

      const hideEmptyState = !!(this.config && this.config.hideEmptyState);
      if (ranked.length === 0) {
        if (hideEmptyState) {
          this.items = [];
          this.highlightIdx = 0;
          this.close();
          return;
        }
        const empty = document.createElement('div');
        empty.className = 'typeahead-empty';
        empty.textContent = 'No matches';
        el.appendChild(empty);
        this.items = [];
        this.highlightIdx = 0;
      } else {
        this.items = ranked;

        // With a non-empty query, keep best match (index 0) as the single highlight
        // target for Enter. With an empty query (e.g. open-on-focus full pool), keep
        // the deterministic default at 0 except when the field value is an exact
        // name already in the list — then highlight/scroll to that row.
        const fieldVal = anchor ? norm(anchor.value) : '';
        if (query) {
          this.highlightIdx = 0;
        } else if (fieldVal) {
          const matchIdx = ranked.findIndex(
            (item) => lower(item) === lower(fieldVal)
          );
          this.highlightIdx = matchIdx >= 0 ? matchIdx : 0;
        } else {
          this.highlightIdx = 0;
        }
        if (this.highlightIdx == null || this.highlightIdx < 0)
          this.highlightIdx = 0;
        if (this.highlightIdx >= this.items.length) this.highlightIdx = 0;

        const container = document.createElement('div');
        container.className = 'typeahead-list';
        // Cap visible rows; allow scroll for the rest.
        // 34px matches the intended row height implied by CSS (see .typeahead-list max-height).
        container.style.maxHeight = `${maxVisible * 34}px`;
        el.appendChild(container);

        ranked.forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = 'typeahead-item';
          const value =
            item && typeof item === 'object' && item.value != null
              ? String(item.value)
              : String(item);
          row.dataset.value = value;
          if (this.config && typeof this.config.renderItemDisplay === 'function') {
            try {
              this.config.renderItemDisplay(row, value, item);
            } catch (_) {
              row.textContent = value;
            }
          } else {
            let label = value;
            if (this.config && typeof this.config.formatItemDisplay === 'function') {
              try {
                label = this.config.formatItemDisplay(value, item) || value;
              } catch (_) {}
            } else if (item && typeof item === 'object' && item.label != null) {
              label = String(item.label);
            }
            row.textContent = label;
          }
          if (idx === this.highlightIdx) row.classList.add('is-highlighted');
          container.appendChild(row);
        });

        // Clamp visible height to 8 rows (scroll below the fold).
        // We'll do this via CSS max-height, but set it here for safety.
        el.dataset.maxVisible = String(maxVisible);
      }

      this.position();
      if (Array.isArray(this.items) && this.items.length > 0) {
        this.setHighlight(this.highlightIdx);
      }
    }

    position() {
      if (!this.isOpen || !this.anchorInput || !this.el) return;
      const el = this.el;
      const inp = this.anchorInput;

      const rect = inp.getBoundingClientRect();
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh =
        window.innerHeight || document.documentElement.clientHeight || 0;

      const cfg = this.config || null;
      const GAP = Number.isFinite(Number(cfg?.dropdownGap))
        ? Math.max(0, Number(cfg.dropdownGap))
        : 8;
      const MARGIN = 8;
      const MIN_W = Number.isFinite(Number(cfg?.minWidth))
        ? Math.max(0, Number(cfg.minWidth))
        : 240;
      const MAX_W = Number.isFinite(Number(cfg?.maxWidth))
        ? Math.max(MIN_W, Number(cfg.maxWidth))
        : 420;

      const matchAnchorWidth = !!cfg?.matchAnchorWidth;
      const width = matchAnchorWidth
        ? Math.max(0, rect.width)
        : Math.min(Math.max(Math.max(rect.width, MIN_W), MIN_W), MAX_W);
      if (this.fixedWidth == null) this.fixedWidth = width;

      // Default left aligned to input; scoot to avoid cutoff
      let left = rect.left;
      const w = Math.min(this.fixedWidth, Math.max(80, vw - MARGIN * 2));
      if (left + w > vw - MARGIN) left = vw - MARGIN - w;
      if (left < MARGIN) left = MARGIN;

      // Compute available vertical space (prefer below)
      const belowTop = rect.bottom + GAP;
      const aboveBottom = rect.top - GAP;
      const availBelow = vh - MARGIN - belowTop;
      const availAbove = aboveBottom - MARGIN;

      const placement =
        cfg && typeof cfg.placement === 'string'
          ? cfg.placement.toLowerCase()
          : 'auto';
      const preferBelow = availBelow >= 160 || availBelow >= availAbove;
      const placeBelow =
        placement === 'below'
          ? true
          : placement === 'above'
            ? false
            : preferBelow;

      // Set maxHeight to available space and let list scroll internally.
      const maxH = Math.max(80, placeBelow ? availBelow : availAbove);

      let top = placeBelow ? belowTop : null;
      let bottom = placeBelow ? null : vh - aboveBottom;

      el.style.position = 'fixed';
      el.style.left = `${Math.round(left)}px`;
      el.style.width = `${Math.round(w)}px`;
      el.style.maxHeight = `${Math.floor(maxH)}px`;
      el.style.top = top != null ? `${Math.round(top)}px` : '';
      el.style.bottom = bottom != null ? `${Math.round(bottom)}px` : '';
      el.style.display = 'block';
    }

    setHighlight(nextIdx) {
      if (!this.isOpen || !this.el) return;
      if (!Array.isArray(this.items) || this.items.length === 0) return;
      const len = this.items.length;
      let idx = nextIdx;
      // Clamp, do not wrap (wrapping felt surprising in practice).
      if (idx < 0) idx = 0;
      if (idx >= len) idx = len - 1;
      this.highlightIdx = idx;

      const rows = this.el.querySelectorAll('.typeahead-item');
      rows.forEach((r, i) => {
        r.classList.toggle('is-highlighted', i === this.highlightIdx);
      });

      const active = rows[this.highlightIdx];
      if (active && typeof active.scrollIntoView === 'function') {
        // Keep it visible in the internal scroller
        active.scrollIntoView({ block: 'nearest' });
      }
    }

    moveHighlight(delta) {
      if (!this.isOpen) return;
      if (!Array.isArray(this.items) || this.items.length === 0) return;
      this.setHighlight((this.highlightIdx || 0) + delta);
    }

    pick(value) {
      if (!this.isOpen || !this.anchorInput) return;
      const v = norm(value);
      if (!v) return;
      const inp = this.anchorInput;
      let caretPos = null;
      const hasCustomSetValue =
        this.config && typeof this.config.setValue === 'function';
      if (hasCustomSetValue) {
        try {
          const res = this.config.setValue(v, inp);
          if (res && Number.isFinite(res.caretPos)) caretPos = res.caretPos;
        } catch (_) {}
      } else {
        inp.value = v;
      }
      try {
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}

      // Keep focus, close dropdown
      try {
        inp.focus();
        if (typeof inp.setSelectionRange === 'function') {
          // If custom setValue returned a caret position, respect it (e.g. textarea line replacement).
          if (caretPos != null) inp.setSelectionRange(caretPos, caretPos);
          // Default behavior: keep caret at the end for normal inputs.
          else if (!hasCustomSetValue)
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
      } catch (_) {}

      if (this.config && typeof this.config.onPick === 'function') {
        try {
          this.config.onPick(v, inp);
        } catch (_) {}
      }

      this.close();
    }

    pickHighlighted() {
      if (!Array.isArray(this.items) || this.items.length === 0) return false;
      const idx = this.highlightIdx || 0;
      const v = this.items[idx];
      if (!v) return false;
      this.pick(v);
      return true;
    }
  }

  const dropdown = new TypeaheadDropdown();

  function isOpenForInput(inputEl) {
    return !!(inputEl && dropdown.isOpen && dropdown.anchorInput === inputEl);
  }

  function pickHighlightedIfOpenForInput(inputEl) {
    if (!isOpenForInput(inputEl)) return false;
    return !!dropdown.pickHighlighted();
  }

  /** Mirrors Enter handling in attachTypeaheadToInput keydown (for hosts that register keydown before typeahead). */
  function tryPickEnterForInput(inputEl) {
    if (!isOpenForInput(inputEl)) return false;
    if (!dropdown.items || dropdown.items.length === 0) return false;
    const cfg = dropdown.config;
    let canPick = true;
    if (cfg && cfg.pickOnEnterWhenQueryEmpty === false) {
      let q = '';
      try {
        q =
          typeof cfg.getQuery === 'function'
            ? norm(cfg.getQuery(inputEl))
            : norm(inputEl.value);
      } catch (_) {}
      canPick = q.length > 0;
    }
    if (!canPick) return false;
    return !!dropdown.pickHighlighted();
  }

  // --- Pool cache + invalidation
  const poolCache = {
    nameAll: null,
    unitAll: null,
    sizeAll: null,
    variantsByName: new Map(), // lower(name) -> string[]
  };

  function invalidatePools() {
    poolCache.nameAll = null;
    poolCache.unitAll = null;
    poolCache.sizeAll = null;
    poolCache.variantsByName = new Map();
  }

  window.addEventListener('favoriteEats:db-updated', () => invalidatePools());

  // Expose a callable invalidation hook.
  window.typeaheadInvalidatePools = invalidatePools;

  async function loadPoolsThroughDataService(ingredientName = '') {
    if (
      !window.dataService ||
      typeof window.dataService.loadTypeaheadPools !== 'function'
    ) {
      return {
        ingredientNames: [],
        unitCodes: [],
        sizeNames: [],
        variantNames: [],
      };
    }
    if (window.dataService) {
      window.dataService.useSupabase = true;
    }
    try {
      const pools = await window.dataService.loadTypeaheadPools({ ingredientName });
      return pools && typeof pools === 'object'
        ? pools
        : {
            ingredientNames: [],
            unitCodes: [],
            sizeNames: [],
            variantNames: [],
          };
    } catch (err) {
      console.warn('typeahead: dataService.loadTypeaheadPools failed', err);
      return {
        ingredientNames: [],
        unitCodes: [],
        sizeNames: [],
        variantNames: [],
      };
    }
  }

  function cacheSharedPools(pools) {
    if (!pools || typeof pools !== 'object') return;
    if (Array.isArray(pools.ingredientNames)) {
      poolCache.nameAll = pools.ingredientNames;
    }
    if (Array.isArray(pools.unitCodes)) {
      poolCache.unitAll = pools.unitCodes;
    }
    if (Array.isArray(pools.sizeNames)) {
      poolCache.sizeAll = pools.sizeNames;
    }
  }

  async function ensureSharedPools() {
    if (poolCache.nameAll && poolCache.unitAll && poolCache.sizeAll) return;
    const pools = await loadPoolsThroughDataService('');
    cacheSharedPools(pools);
  }

  async function getNamePool() {
    if (poolCache.nameAll) return poolCache.nameAll;
    await ensureSharedPools();
    return poolCache.nameAll || [];
  }

  async function getUnitPool() {
    if (poolCache.unitAll) return poolCache.unitAll;
    await ensureSharedPools();
    return poolCache.unitAll || [];
  }

  async function getSizePool() {
    if (poolCache.sizeAll) return poolCache.sizeAll;
    await ensureSharedPools();
    return poolCache.sizeAll || [];
  }

  async function getVariantPoolForName(nameText) {
    const key = lower(nameText);
    if (!key) return [];
    if (poolCache.variantsByName.has(key))
      return poolCache.variantsByName.get(key) || [];
    const pools = await loadPoolsThroughDataService(nameText);
    cacheSharedPools(pools);
    const out = Array.isArray(pools.variantNames) ? pools.variantNames : [];
    poolCache.variantsByName.set(key, out);
    return out;
  }

  // --- Normalization on blur
  async function maybeNormalizeOnBlur(
    inputEl,
    poolProvider,
    { mode = 'default' } = {}
  ) {
    const raw = norm(inputEl.value);
    if (!raw) return;
    if (normalizationExemptions.has(raw)) return;

    const pool = await poolProvider();
    if (!Array.isArray(pool) || pool.length === 0) return;

    // If there is an exact case-insensitive match, canonicalize to pool casing.
    const exact = findCaseInsensitiveExactPoolMatch(raw, pool);
    if (exact) {
      applyBlurNormalization(inputEl, raw, exact, 'Normalized');
      return;
    }

    // Near-match typo correction follows v1 minimum length gate.
    if (raw.length < 3) return;

    const best =
      mode === 'unit'
        ? findBestNearMatchForUnit(raw, pool)
        : findBestNearMatch(raw, pool);
    if (!best) return;
    applyBlurNormalization(inputEl, raw, best, 'Corrected');
  }

  // --- Attachment helpers
  function attachTypeaheadToInput({
    inputEl,
    getPool,
    onPick,
    openOnFocus,
    maxVisible,
    getItems,
    getQuery,
    setValue,
    closeOnEmptyQuery,
    openOnlyWhenQueryNonEmpty,
    ignoreInputTypes,
    hideEmptyState,
    dropdownGap,
    matchAnchorWidth,
    pickOnEnterWhenQueryEmpty,
    openOnArrowDownWhenClosed,
    allowSuggestionsWhenQueryEmpty,
    minWidth,
    maxWidth,
    placement,
    formatItemDisplay,
    renderItemDisplay,
  }) {
    if (!inputEl) return;
    const cfg = {
      getPool,
      onPick,
      maxVisible,
      getItems,
      getQuery,
      setValue,
      closeOnEmptyQuery,
      openOnlyWhenQueryNonEmpty,
      ignoreInputTypes,
      hideEmptyState,
      dropdownGap,
      matchAnchorWidth,
      pickOnEnterWhenQueryEmpty,
      openOnArrowDownWhenClosed,
      allowSuggestionsWhenQueryEmpty,
      minWidth,
      maxWidth,
      placement,
      formatItemDisplay,
      renderItemDisplay,
    };

    // If Escape is used to cancel the row, suppress blur-time normalization/toasts.
    inputEl._typeaheadSuppressNextNormalize = false;
    inputEl._typeaheadAttachConfig = cfg;

    // v2 behavior: dropdown is OFF by default; it opens only on user keystroke
    // (input events) or explicit ArrowDown, and stays closed on focus unless
    // explicitly enabled via openOnFocus.

    // Optional: open on focus (used for ingredient unit field)
    if (openOnFocus) {
      inputEl.addEventListener('focus', (e) => {
        // Avoid programmatic focus (e.g., initial render/tab-order helpers).
        if (e && e.isTrusted === false) return;

        // Show full pool on focus regardless of current value.
        inputEl._typeaheadForceEmptyQueryOnce = true;

        if (!dropdown.isOpen || dropdown.anchorInput !== inputEl) {
          dropdown.open(inputEl, cfg);
          return;
        }

        dropdown.highlightIdx = 0;
        dropdown.update();
      });
    }

    // Live open/update (trusted user edits only)
    inputEl.addEventListener('input', (e) => {
      // Ignore programmatic/synthetic input events (prefill/autosize).
      if (e && e.isTrusted === false) return;

      const inputType =
        e && typeof e.inputType === 'string' ? e.inputType : '';
      if (
        cfg.ignoreInputTypes &&
        Array.isArray(cfg.ignoreInputTypes) &&
        inputType &&
        cfg.ignoreInputTypes.includes(inputType)
      ) {
        // Avoid opening/refreshing suggestions during paste/drop actions.
        dropdown.close();
        return;
      }

      if (!dropdown.isOpen || dropdown.anchorInput !== inputEl) {
        if (cfg.openOnlyWhenQueryNonEmpty) {
          let q = '';
          try {
            q =
              typeof cfg.getQuery === 'function'
                ? norm(cfg.getQuery(inputEl))
                : norm(inputEl.value);
          } catch (_) {}
          let allowEmptyQuery = false;
          try {
            allowEmptyQuery =
              !q &&
              cfg &&
              typeof cfg.allowSuggestionsWhenQueryEmpty === 'function' &&
              !!cfg.allowSuggestionsWhenQueryEmpty(inputEl, q);
          } catch (_) {}
          if (!q && !allowEmptyQuery) return;
        }
        dropdown.open(inputEl, cfg);
        return;
      }

      dropdown.highlightIdx = 0; // deterministic top highlight after filter changes
      dropdown.update();
    });

    // Close on blur
    inputEl.addEventListener('blur', () => {
      // Close first; normalization may run after (and can reopen on focus later).
      if (dropdown.isOpen && dropdown.anchorInput === inputEl) dropdown.close();
    });

    // Keyboard controls (must prevent row-level Enter commit when dropdown open)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Row-level handler will cancel the row; we must not fire normalization on the blur it triggers.
        inputEl._typeaheadSuppressNextNormalize = true;
      }
      if (!dropdown.isOpen || dropdown.anchorInput !== inputEl) {
        // Allow ArrowDown to explicitly open the dropdown while focused.
        if (e.key === 'ArrowDown' && cfg.openOnArrowDownWhenClosed !== false) {
          e.preventDefault();
          e.stopPropagation();
          dropdown.open(inputEl, cfg);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        // If list is empty, treat ArrowDown as "reopen/update" (no-op otherwise)
        if (!dropdown.items || dropdown.items.length === 0) {
          dropdown.update();
        } else {
          dropdown.moveHighlight(1);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!dropdown.items || dropdown.items.length === 0) {
          dropdown.update();
        } else {
          dropdown.moveHighlight(-1);
        }
        return;
      }

      if (e.key === 'Enter') {
        // Shift+Enter: native newline in TEXTAREA (do not treat as pick).
        if (shouldPreserveTextareaShiftEnter(inputEl, e)) {
          return;
        }
        // Only intercept Enter if there is something to pick.
        if (dropdown.items && dropdown.items.length > 0) {
          let canPick = true;
          if (cfg && cfg.pickOnEnterWhenQueryEmpty === false) {
            let q = '';
            try {
              q =
                typeof cfg.getQuery === 'function'
                  ? norm(cfg.getQuery(inputEl))
                  : norm(inputEl.value);
            } catch (_) {}
            canPick = q.length > 0;
          }
          if (!canPick) return;
          e.preventDefault();
          e.stopPropagation();
          dropdown.pickHighlighted();
        }
      }
    });
  }

  function setupIngredientRowTabOrder(rowEl, orderedFields) {
    if (!rowEl) return;
    const order = Array.isArray(orderedFields) ? orderedFields : [];
    const inputs = Array.from(rowEl.querySelectorAll('.ingredient-edit-input'));
    if (inputs.length === 0) return;

    const byField = new Map();
    inputs.forEach((inp) => {
      const f = inp.dataset && inp.dataset.field ? inp.dataset.field : '';
      if (f) byField.set(f, inp);
    });

    const getNextField = (currentField, dir) => {
      const idx = order.indexOf(currentField);
      if (idx === -1) return null;
      for (let step = 1; step <= order.length; step += 1) {
        const nextIdx =
          dir > 0
            ? (idx + step) % order.length
            : (idx - step + order.length * 2) % order.length;
        const candidate = order[nextIdx];
        if (candidate && byField.has(candidate)) return candidate;
      }
      return null;
    };

    inputs.forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const f = inp.dataset && inp.dataset.field ? inp.dataset.field : '';
        if (!f) return;

        e.preventDefault();
        e.stopPropagation();

        const dir = e.shiftKey ? -1 : 1;
        const nextField = getNextField(f, dir);
        const nextInp = nextField ? byField.get(nextField) : null;
        if (nextInp) {
          nextInp.focus();
          if (typeof nextInp.select === 'function') nextInp.select();
        }
      });
    });
  }

  // Public: wire a freshly-created ingredient edit row.
  // Assumes row contains inputs with data-field: name, unit, var.
  window.setupIngredientTypeaheadRow = function setupIngredientTypeaheadRow(
    rowEl
  ) {
    if (!rowEl) return;

    // Tab order follows visual order in the row.
    setupIngredientRowTabOrder(rowEl, [
      'qtymin',
      'qtymax',
      'name',
      'isrecipe',
      'recipe',
      'unit',
      'size',
      'var',
      'prep',
      'notes',
      'isopt',
      'isaprx',
    ]);

    const nameInput = rowEl.querySelector(
      '.ingredient-edit-input[data-field="name"]'
    );
    const unitInput = rowEl.querySelector(
      '.ingredient-edit-input[data-field="unit"]'
    );
    const sizeInput = rowEl.querySelector(
      '.ingredient-edit-input[data-field="size"]'
    );
    const varInput = rowEl.querySelector(
      '.ingredient-edit-input[data-field="var"]'
    );

    // NAME
    if (nameInput) {
      attachTypeaheadToInput({
        inputEl: nameInput,
        getPool: async () => await getNamePool(),
        openOnFocus: true,
      });

      nameInput.addEventListener('blur', async () => {
        if (nameInput._typeaheadSuppressNextNormalize) {
          nameInput._typeaheadSuppressNextNormalize = false;
          return;
        }
        if (!INGREDIENT_BLUR_NORMALIZATION_ENABLED) return;
        await maybeNormalizeOnBlur(nameInput, async () => await getNamePool());
      });
    }

    // UNIT
    if (unitInput) {
      attachTypeaheadToInput({
        inputEl: unitInput,
        getPool: async () => await getUnitPool(),
        openOnFocus: true,
        getItems: (pool, query) =>
          filterAndRankPreservePoolOrderOnEmpty(pool, query),
        renderItemDisplay(row, code) {
          const reg =
            typeof window !== 'undefined'
              ? window.favoriteEatsMeasuredUnitRegistry
              : null;
          if (reg && typeof reg.renderUnitTypeaheadItem === 'function') {
            reg.renderUnitTypeaheadItem(row, code);
            return;
          }
          row.textContent = code;
        },
      });

      unitInput.addEventListener('blur', async () => {
        if (unitInput._typeaheadSuppressNextNormalize) {
          unitInput._typeaheadSuppressNextNormalize = false;
          return;
        }
        if (!INGREDIENT_BLUR_NORMALIZATION_ENABLED) return;
        await maybeNormalizeOnBlur(unitInput, async () => await getUnitPool(), {
          mode: 'unit',
        });
      });
    }

    // SIZE (show full list on focus, like units; no normalization)
    if (sizeInput) {
      attachTypeaheadToInput({
        inputEl: sizeInput,
        getPool: async () => await getSizePool(),
        openOnFocus: true,
        maxVisible: 10,
      });
    }

    // VARIANT (scoped to current name input value)
    if (varInput) {
      const getScopeName = () => {
        const liveName = nameInput ? norm(nameInput.value) : '';
        return liveName;
      };

      attachTypeaheadToInput({
        inputEl: varInput,
        getPool: async () => {
          const n = getScopeName();
          return await getVariantPoolForName(n);
        },
        openOnFocus: true,
      });

      varInput.addEventListener('focus', (e) => {
        if (e && e.isTrusted === false) return;
        varInput.classList.remove('ingredient-edit-input--deprecated-variant-blur');
      });
      varInput.addEventListener('input', () => {
        varInput.classList.remove('ingredient-edit-input--deprecated-variant-blur');
      });

      varInput.addEventListener('blur', async () => {
        if (varInput._typeaheadSuppressNextNormalize) {
          varInput._typeaheadSuppressNextNormalize = false;
          return;
        }
        const n = getScopeName();
        const raw = norm(varInput.value);
        if (raw && typeof window.ingredientScopedVariantIsDeprecated === 'function') {
          let fromDbDeprecated = false;
          if (
            window.dataService &&
            typeof window.dataService.isIngredientVariantDeprecated === 'function'
          ) {
            try {
              fromDbDeprecated =
                await window.dataService.isIngredientVariantDeprecated({
                  ingredientName: n,
                  variantText: raw,
                });
            } catch (_) {
              fromDbDeprecated = false;
            }
          } else {
            fromDbDeprecated = false;
          }
          if (fromDbDeprecated) {
            varInput.classList.add('ingredient-edit-input--deprecated-variant-blur');
            return;
          }
        }
        varInput.classList.remove('ingredient-edit-input--deprecated-variant-blur');
        if (!INGREDIENT_BLUR_NORMALIZATION_ENABLED) return;
        await maybeNormalizeOnBlur(
          varInput,
          async () => await getVariantPoolForName(n)
        );
      });
    }
  };

  async function canonicalizeVariantForIngredientName(nameText, rawVariant) {
    const raw = norm(rawVariant);
    if (!raw) return raw;
    const pool = await getVariantPoolForName(nameText);
    const exact = findCaseInsensitiveExactPoolMatch(raw, pool);
    return exact || raw;
  }

  function vSlice(s, a, b) {
    return String(s || '').slice(a, b);
  }

  function getCaretLineBounds(textarea, caretPos) {
    const v = String(textarea.value || '');
    const pos =
      caretPos != null && Number.isFinite(caretPos)
        ? Number(caretPos)
        : (textarea.selectionStart ?? 0);
    const prevNl = v.lastIndexOf('\n', pos - 1);
    const lineStart = prevNl === -1 ? 0 : prevNl + 1;
    const nextNl = v.indexOf('\n', pos);
    const lineEnd = nextNl === -1 ? v.length : nextNl;
    return { lineStart, lineEnd };
  }

  function getParsedNameFromIngredientLine(lineText) {
    try {
      if (typeof window.parseIngredientLine !== 'function') return '';
      const row = window.parseIngredientLine(String(lineText || ''));
      return row && String(row.name || '').trim()
        ? String(row.name).trim()
        : '';
    } catch (_) {
      return '';
    }
  }

  function replaceNameInIngredientLine(lineText, pickedName) {
    const line = String(lineText || '');
    const pick = String(pickedName || '').trim();
    if (!pick) return line;
    const parsedName = getParsedNameFromIngredientLine(line);
    if (parsedName) {
      const idx = line.toLowerCase().lastIndexOf(parsedName.toLowerCase());
      if (idx >= 0) {
        return line.slice(0, idx) + pick + line.slice(idx + parsedName.length);
      }
    }
    return pick;
  }

  async function lookupCanonicalIngredientNameForMultilineBlur(rawName) {
    const typed = norm(rawName);
    if (!typed) return typed;
    if (normalizationExemptions.has(typed)) return typed;

    if (
      window.dataService &&
      typeof window.dataService.lookupShoppingItemByName === 'function'
    ) {
      try {
        const row = await window.dataService.lookupShoppingItemByName({
          name: typed,
        });
        if (row && row.name != null && String(row.name).trim()) {
          return String(row.name).trim();
        }
      } catch (err) {
        console.warn(
          'typeahead: lookupShoppingItemByName for multiline blur failed',
          err,
        );
      }
    }

    return typed;
  }

  async function canonicalizeMultilineIngredientLineText(
    lineText,
    {
      useParsedName = true,
      resolveCanonicalName = lookupCanonicalIngredientNameForMultilineBlur,
    } = {},
  ) {
    const line = String(lineText || '');
    if (!norm(line)) return line;

    try {
      if (typeof window.parseIngredientLine === 'function') {
        const row = window.parseIngredientLine(line);
        if (row && row.isRecipe) return line;
      }
    } catch (_) {}

    const parsedName = useParsedName
      ? getParsedNameFromIngredientLine(line)
      : String(line || '').trim();
    if (!parsedName) return line;

    const canonical = await resolveCanonicalName(parsedName);
    if (!canonical || canonical === parsedName) return line;
    return replaceNameInIngredientLine(line, canonical);
  }

  async function normalizeMultilineIngredientTextareaNamesOnBlur(
    textarea,
    {
      useParsedName = true,
      resolveCanonicalName = lookupCanonicalIngredientNameForMultilineBlur,
    } = {},
  ) {
    if (!textarea) return false;
    const raw = String(textarea.value || '');
    if (!norm(raw)) return false;

    const lines = raw.split(/\r?\n/);
    let changed = false;
    const nextLines = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const next = await canonicalizeMultilineIngredientLineText(line, {
        useParsedName,
        resolveCanonicalName,
      });
      nextLines.push(next);
      if (next !== line) changed = true;
    }
    if (!changed) return false;

    textarea.value = nextLines.join('\n');
    try {
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
    return true;
  }

  function buildMultilineLineTypeaheadContext(textarea, options = {}) {
    const caretPos = textarea.selectionStart ?? 0;
    const { lineStart, lineEnd } = getCaretLineBounds(textarea, caretPos);
    const lineText = vSlice(textarea.value, lineStart, lineEnd);
    const caretInLine = Math.max(
      0,
      Math.min(lineText.length, caretPos - lineStart),
    );
    const beforeCaret = vSlice(lineText, 0, caretInLine);
    const openParenIdx = beforeCaret.lastIndexOf('(');
    const closeParenIdx = beforeCaret.lastIndexOf(')');
    const inVariantContext = openParenIdx >= 0 && closeParenIdx < openParenIdx;
    const useParsedName = !!options.useParsedNameForNameMode;

    if (!inVariantContext) {
      const query = useParsedName
        ? getParsedNameFromIngredientLine(lineText) ||
          String(lineText || '').trim()
        : String(lineText || '').trim();
      return {
        mode: 'name',
        query,
        lineStart,
        lineEnd,
      };
    }

    const baseName = String(vSlice(lineText, 0, openParenIdx) || '').trim();
    if (!baseName) {
      const query = useParsedName
        ? getParsedNameFromIngredientLine(lineText) ||
          String(lineText || '').trim()
        : String(lineText || '').trim();
      return {
        mode: 'name',
        query,
        lineStart,
        lineEnd,
      };
    }

    const tokenAnchor = beforeCaret.lastIndexOf(',');
    const tokenStartInLine =
      tokenAnchor >= openParenIdx ? tokenAnchor + 1 : openParenIdx + 1;

    const afterCaret = vSlice(lineText, caretInLine, lineText.length);
    const tokenEndRel = afterCaret.search(/[,\)]/);
    const tokenEndInLine =
      tokenEndRel === -1 ? lineText.length : caretInLine + tokenEndRel;

    let tokenTextStartInLine = tokenStartInLine;
    // Only skip whitespace up to the caret — not across text after the caret.
    // Otherwise "foo(bar, |baz" (caret before the space) yields an empty query and
    // type-along never opens after ", ".
    while (
      tokenTextStartInLine < caretInLine &&
      /\s/.test(lineText[tokenTextStartInLine] || '')
    ) {
      tokenTextStartInLine += 1;
    }

    let queryEnd = Math.min(caretInLine, tokenEndInLine);
    let query = String(
      vSlice(lineText, tokenTextStartInLine, queryEnd),
    ).trim();
    // If the caret trails the typed token (common right after ", "), still filter
    // using the in-progress token text that follows the caret on the same line.
    if (!query && tokenTextStartInLine < tokenEndInLine) {
      query = String(
        vSlice(lineText, tokenTextStartInLine, tokenEndInLine),
      ).trim();
    }

    return {
      mode: 'variant',
      baseName,
      query,
      lineStart,
      lineEnd,
      tokenTextStartAbs: lineStart + tokenTextStartInLine,
      tokenEndAbs: lineStart + tokenEndInLine,
    };
  }

  /**
   * Typeahead for multiline textareas: one ingredient/catalog line at a time.
   * Name mode: ingredient pool; variant mode: pool for base name inside "(…)".
   */
  function attachMultilineIngredientLineTypeahead(textarea, options = {}) {
    if (!textarea) return false;
    const taTypeahead = window.favoriteEatsTypeahead;
    if (
      !taTypeahead ||
      typeof taTypeahead.attach !== 'function' ||
      typeof taTypeahead.getNamePool !== 'function'
    ) {
      return false;
    }

    const useParsedName = !!options.useParsedNameForNameMode;
    const repairUnclosedVariantParen =
      options.repairUnclosedVariantParen !== false;
    const ctxOpts = { useParsedNameForNameMode: useParsedName };
    const getLineTypeaheadContext = (el) =>
      buildMultilineLineTypeaheadContext(el, ctxOpts);

    const repairUnclosedParensOnActiveLine = (el) => {
      if (!el || !repairUnclosedVariantParen) return false;
      const repairLine =
        typeof window.repairUnclosedParensInIngredientPasteLine === 'function'
          ? window.repairUnclosedParensInIngredientPasteLine
          : null;
      if (!repairLine) return false;
      const caretPos = el.selectionStart ?? 0;
      const { lineStart, lineEnd } = getCaretLineBounds(el, caretPos);
      const lineText = vSlice(el.value, lineStart, lineEnd);
      const nextLine = repairLine(lineText);
      if (nextLine === lineText) return false;
      el.value = vSlice(el.value, 0, lineStart) + nextLine + vSlice(el.value, lineEnd);
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
      return true;
    };

    const defaultVariantPool = async (baseName) =>
      await getVariantPoolForName(baseName);

    const getVariantPoolForBaseName =
      typeof options.getVariantPoolForBaseName === 'function'
        ? options.getVariantPoolForBaseName
        : defaultVariantPool;

    const resolveNamePool =
      typeof options.getNamePool === 'function'
        ? options.getNamePool
        : async () => await taTypeahead.getNamePool();

    const resolveVariantPool = async (baseName) => {
      const raw = getVariantPoolForBaseName(baseName);
      return Array.isArray(raw) ? raw : await raw;
    };

    const openOnBlankLineFocus = options.openOnBlankLineFocus === true;

    const isCaretOnBlankNameLine = (el) => {
      const ctx = getLineTypeaheadContext(el);
      return ctx.mode === 'name' && !String(ctx.query || '').trim();
    };

    const attachCfg = {
      inputEl: textarea,
      getPool: async (el) => {
        const ctx = getLineTypeaheadContext(el);
        if (ctx.mode === 'variant') {
          return await resolveVariantPool(ctx.baseName);
        }
        const namePool = resolveNamePool();
        return Array.isArray(namePool) ? namePool : await namePool;
      },
      getQuery: (el) => String(getLineTypeaheadContext(el).query || ''),
      setValue: (picked, el) => {
        const canonical = String(picked || '').trim();
        const ctx = getLineTypeaheadContext(el);
        if (ctx.mode === 'variant') {
          const start = Number(ctx.tokenTextStartAbs);
          const end = Number(ctx.tokenEndAbs);
          const before = vSlice(el.value, 0, start);
          const after = vSlice(el.value, end, el.value.length);
          el.value = before + canonical + after;
          repairUnclosedParensOnActiveLine(el);
          const ctxAfter = getLineTypeaheadContext(el);
          const caretPos =
            ctxAfter.mode === 'variant'
              ? Number(ctxAfter.tokenTextStartAbs) + canonical.length
              : start + canonical.length;
          return { caretPos };
        }
        const before = vSlice(el.value, 0, ctx.lineStart);
        const after = vSlice(el.value, ctx.lineEnd, el.value.length);
        const lineText = vSlice(el.value, ctx.lineStart, ctx.lineEnd);
        const nextLine = useParsedName
          ? replaceNameInIngredientLine(lineText, canonical)
          : canonical;
        el.value = before + nextLine + after;
        return { caretPos: ctx.lineStart + nextLine.length };
      },
      allowSuggestionsWhenQueryEmpty: (el) => {
        const ctx = getLineTypeaheadContext(el);
        if (openOnBlankLineFocus && ctx.mode === 'name' && !ctx.query) {
          return true;
        }
        if (ctx.mode !== 'variant' || ctx.query) return false;
        const raw = getVariantPoolForBaseName(ctx.baseName);
        if (Array.isArray(raw)) return raw.length > 0;
        const key = lower(ctx.baseName);
        if (poolCache.variantsByName.has(key)) {
          return (poolCache.variantsByName.get(key) || []).length > 0;
        }
        return false;
      },
      closeOnEmptyQuery: true,
      openOnlyWhenQueryNonEmpty: true,
      ignoreInputTypes: ['insertFromPaste', 'insertFromDrop'],
      openOnArrowDownWhenClosed: false,
    };

    taTypeahead.attach(attachCfg);

    const maybeOpenTypeaheadOnBlankLine = (el, evt) => {
      if (!openOnBlankLineFocus || !el) return;
      if (evt && evt.isTrusted === false) return;
      window.setTimeout(() => {
        if (document.activeElement !== el) return;
        if (!isCaretOnBlankNameLine(el)) {
          try {
            if (typeof taTypeahead.close === 'function') taTypeahead.close();
          } catch (_) {}
          return;
        }
        try {
          el._typeaheadForceEmptyQueryOnce = true;
          if (
            typeof taTypeahead.openForInput === 'function'
          ) {
            taTypeahead.openForInput(el);
          }
        } catch (_) {}
      }, 0);
    };

    if (openOnBlankLineFocus) {
      textarea.addEventListener('focus', (e) => {
        maybeOpenTypeaheadOnBlankLine(textarea, e);
      });
      textarea.addEventListener('click', (e) => {
        maybeOpenTypeaheadOnBlankLine(textarea, e);
      });
      textarea.addEventListener('keyup', (e) => {
        const key = String(e?.key || '');
        if (
          key === 'ArrowUp' ||
          key === 'ArrowDown' ||
          key === 'ArrowLeft' ||
          key === 'ArrowRight' ||
          key === 'Home' ||
          key === 'End'
        ) {
          maybeOpenTypeaheadOnBlankLine(textarea, e);
        }
      });
    } else {
      textarea.addEventListener('click', () => {
        try {
          if (typeof taTypeahead.close === 'function') taTypeahead.close();
        } catch (_) {}
      });
    }

    const normalizeNamesOnBlur = options.normalizeIngredientNamesOnBlur !== false;

    textarea.addEventListener('blur', () => {
      repairUnclosedParensOnActiveLine(textarea);
      if (!normalizeNamesOnBlur) return;
      void (async () => {
        await normalizeMultilineIngredientTextareaNamesOnBlur(textarea, {
          useParsedName,
          resolveCanonicalName:
            typeof options.resolveCanonicalIngredientName === 'function'
              ? options.resolveCanonicalIngredientName
              : lookupCanonicalIngredientNameForMultilineBlur,
        });
      })();
    });

    return true;
  }

  // --- Multiline blur name helpers (tests extract this block) ---
  window.__typeaheadMultilineBlurHelpers = {
    replaceNameInIngredientLine,
    getParsedNameFromIngredientLine,
    canonicalizeMultilineIngredientLineText,
  };
  // --- End multiline blur name helpers ---

  // Public (for other pages in future)
  window.favoriteEatsTypeahead = {
    close: () => dropdown.close(),
    openForInput: (inputEl, opts = {}) => {
      if (!inputEl || !inputEl._typeaheadAttachConfig) return false;
      if (opts && opts.forceEmptyQuery) {
        inputEl._typeaheadForceEmptyQueryOnce = true;
      }
      dropdown.open(inputEl, inputEl._typeaheadAttachConfig);
      return true;
    },
    invalidate: invalidatePools,
    attach: (args) => attachTypeaheadToInput(args || {}),
    attachMultilineIngredientLineTypeahead,
    isOpenForInput,
    pickHighlightedIfOpenForInput,
    tryPickEnterForInput,
    getNamePool: async () => await getNamePool(),
    getVariantPoolForIngredientName: async (nameText) =>
      await getVariantPoolForName(nameText),
    canonicalizeVariantForIngredientName,
  };
})();
