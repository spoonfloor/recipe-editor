// Supabase adapter for the data service.
//
// Implements the data-service surface in js/data/index.js. Reads from Supabase
// via PostgREST and bundled writes via catalog RPCs where needed.
//
// Contracts live under js/data/contracts/.
//
// `opts.fetchImpl` is injectable for focused tests; defaults to window.fetch.
// `opts.url` and `opts.anonKey` are also injectable; defaults come from globals
// and localStorage.

(function initSupabaseAdapter(global) {
  if (!global) return;

  const DEFAULT_SUPABASE_URL = 'https://ysesmbcvxmaymtsqeipc.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY =
    'sb_publishable_gIYjmWOjcHtg5RRLbw8yLQ_AGWYQH2E';

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function readLocalStorage(key) {
    try {
      return global.localStorage && typeof global.localStorage.getItem === 'function'
        ? global.localStorage.getItem(key)
        : null;
    } catch (_) {
      return null;
    }
  }

  function getConfig(opts) {
    const url = trimStr(
      opts?.url ||
        global.__SUPABASE_URL__ ||
        readLocalStorage('favoriteEatsSupabaseUrl') ||
        DEFAULT_SUPABASE_URL,
    );
    const anonKey = trimStr(
      opts?.anonKey ||
        global.__SUPABASE_ANON_KEY__ ||
        readLocalStorage('favoriteEatsSupabaseAnonKey') ||
        DEFAULT_SUPABASE_ANON_KEY,
    );
    return { url, anonKey };
  }

  function toPositiveOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveShoppingPlanServingsMultiplier(recipe, contextServings, recipeId) {
    const rid = Math.trunc(Number(recipeId));
    const fromCtx = Number(contextServings);
    if (Number.isFinite(fromCtx) && fromCtx > 0) {
      const defRaw = Number(recipe?.servings?.default ?? recipe?.servingsDefault);
      const def = Number.isFinite(defRaw) && defRaw > 0 ? defRaw : 1;
      return fromCtx / def;
    }
    const api = global.favoriteEatsRecipePlannerServings;
    if (recipe && api && typeof api.getMultiplier === 'function') {
      const m = api.getMultiplier(recipe, {
        fallbackRecipeId: Number.isFinite(rid) && rid > 0 ? rid : null,
        scrubInvalid: true,
      });
      return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
    }
    return 1;
  }

  async function fetchRecipesWithTags(opts) {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error('listRecipes: missing Supabase URL or anon key.');
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('listRecipes: no fetch implementation available.');
    }

    const select = [
      'id',
      'title',
      'servings_default',
      'servings_min',
      'servings_max',
      'recipe_tag_map',
    ].join(',');

    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/recipe_list_rows?select=${encodeURIComponent(
      select,
    )}&order=title.asc`;

    const res = await fetchImpl(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Accept-Profile': 'catalog',
      },
    });
    if (!res || !res.ok) {
      const body =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`listRecipes: Supabase read failed (${status}): ${body}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  function buildTagListFromMappings(mappings) {
    const candidates = (Array.isArray(mappings) ? mappings : [])
      .filter((m) => m && m.tags && Number(m.tags.is_hidden || 0) === 0)
      .map((m) => ({
        sortOrder:
          m.sort_order == null || m.sort_order === ''
            ? null
            : Number(m.sort_order),
        mapId: Number(m.id),
        name: trimStr(m.tags.name),
      }))
      .filter((t) => t.name.length > 0);

    candidates.sort((a, b) => {
      const aSort = a.sortOrder == null ? Infinity : a.sortOrder;
      const bSort = b.sortOrder == null ? Infinity : b.sortOrder;
      if (aSort !== bSort) return aSort - bSort;
      if (Number.isFinite(a.mapId) && Number.isFinite(b.mapId)) {
        if (a.mapId !== b.mapId) return a.mapId - b.mapId;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const seen = new Set();
    const out = [];
    candidates.forEach((t) => {
      const key = t.name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t.name);
    });
    return out;
  }

  function normalizeRecipeTagMap(raw) {
    if (raw == null) return [];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  }

  function transformRecipeRow(row) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const def = toPositiveOrNull(row?.servings_default);
    return {
      id,
      title: row?.title == null ? '' : String(row.title),
      tags: buildTagListFromMappings(normalizeRecipeTagMap(row?.recipe_tag_map)),
      servingsDefault: def,
      servings: {
        default: def,
        min: toPositiveOrNull(row?.servings_min),
        max: toPositiveOrNull(row?.servings_max),
      },
    };
  }

  // Legacy ASCII case-folding (NOCASE-style): folds only A-Z to a-z (everything else passes through),
  // then compares byte-by-byte. JS localeCompare with sensitivity:'base' does
  // unicode-aware folding and locale ordering, which doesn't match — notably
  // it sorts the typographic apostrophe (U+2019) differently from that fold.
  function asciiNocaseFold(s) {
    return String(s).replace(/[A-Z]/g, (c) => c.toLowerCase());
  }
  function sortByTitleNocase(arr) {
    return arr.slice().sort((a, b) => {
      const la = asciiNocaseFold(a?.title || '');
      const lb = asciiNocaseFold(b?.title || '');
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
  }

  async function listRecipes(opts) {
    const rows = await fetchRecipesWithTags(opts);
    const transformed = rows
      .map((row) => transformRecipeRow(row))
      .filter((row) => row != null);
    // PostgREST sorts by title.asc (case-sensitive). Contract requires NOCASE
    // ordering, so re-sort client-side to guarantee parity.
    return sortByTitleNocase(transformed);
  }

  // ---- loadRecipeDetail ----------------------------------------------------
  //
  // Contract: js/data/contracts/loadRecipeDetail.md
  //
  // Five PostgREST queries, one per data slice. Kept as separate calls
  // (instead of one big embedded query) for clarity and easier mocking.

  async function pgGet(opts, pathWithQuery, label = 'loadRecipeDetail') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Accept-Profile': 'catalog',
      },
    });
    if (!res || !res.ok) {
      const body =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase read failed (${status}): ${body}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function pgPost(opts, pathWithQuery, body, label = 'write', postOpts = {}) {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const onConflictIgnore = postOpts.onConflictIgnore;
    let requestPath = pathWithQuery;
    let prefer = 'return=representation';
    if (Array.isArray(onConflictIgnore) && onConflictIgnore.length) {
      const conflictQuery = onConflictIgnore
        .map((col) => encodeURIComponent(String(col)))
        .join(',');
      requestPath += `${requestPath.includes('?') ? '&' : '?'}on_conflict=${conflictQuery}`;
      prefer = 'return=minimal,resolution=ignore-duplicates';
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${requestPath}`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Profile': 'catalog',
        Prefer: prefer,
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase write failed (${status}): ${responseBody}`);
    }
    const responseBody =
      res && typeof res.text === 'function'
        ? await res.text().catch(() => '')
        : '';
    if (!responseBody) return [];
    try {
      const rows = JSON.parse(responseBody);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async function pgDelete(opts, pathWithQuery, label = 'delete') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      method: 'DELETE',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Profile': 'catalog',
        Prefer: 'return=minimal',
      },
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase delete failed (${status}): ${responseBody}`);
    }
    return true;
  }

  async function pgPatch(opts, pathWithQuery, body, label = 'write') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${pathWithQuery}`;
    const res = await fetchImpl(endpoint, {
      method: 'PATCH',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Profile': 'catalog',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase update failed (${status}): ${responseBody}`);
    }
    return true;
  }

  async function pgRpc(opts, functionName, body, label = 'rpc', profile = 'catalog') {
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) {
      throw new Error(`${label}: missing Supabase URL or anon key.`);
    }
    const fetchImpl =
      (opts && opts.fetchImpl) ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error(`${label}: no fetch implementation available.`);
    }
    const schemaProfile = trimStr(profile) || 'catalog';
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/${functionName}`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': schemaProfile,
        'Content-Profile': schemaProfile,
      },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      const responseBody =
        res && typeof res.text === 'function'
          ? await res.text().catch(() => '')
          : '';
      const status = res ? res.status : 'no-response';
      throw new Error(`${label}: Supabase RPC failed (${status}): ${responseBody}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---- createRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/createRecipe.md

  async function createRecipe(opts, request = {}) {
    const title = trimStr(request?.title);
    if (!title) {
      throw new Error('createRecipe: title is required.');
    }
    const rows = await pgPost(
      opts,
      'recipes?select=id',
      { title, servings_min: 0.5, servings_max: 99 },
      'createRecipe',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createRecipe: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteRecipe --------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteRecipe.md

  async function deleteRecipe(opts, request = {}) {
    const id = Number(request?.id ?? request?.recipeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteRecipe: valid recipe id is required.');
    }
    await pgDelete(opts, `recipes?id=eq.${encodeURIComponent(String(id))}`, 'deleteRecipe');
    return { id };
  }

  function toBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    const n = Number(v);
    return Number.isFinite(n) && n !== 0;
  }

  function emptyIfNullish(v) {
    return v == null ? '' : String(v);
  }

  function trimOrEmpty(v) {
    return v == null ? '' : String(v).trim();
  }

  // PostgREST integer columns can come back as numbers or string-encoded
  // numbers depending on the column type. Normalize to a JS number when it
  // looks like one, otherwise keep the original (which may be null).
  function intOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeQuantity(rawQty) {
    if (rawQty == null) return null;
    if (typeof rawQty === 'number') return rawQty;
    if (typeof rawQty === 'string') {
      if (/^\s*\d+(\.\d+)?\s*$/.test(rawQty)) return parseFloat(rawQty);
      return rawQty;
    }
    return rawQty;
  }

  function buildTagListFromTagMapRows(rows) {
    return buildTagListFromMappings(rows);
  }

  function buildSteps(rawSteps) {
    return (Array.isArray(rawSteps) ? rawSteps : [])
      .map((s) => ({
        ID: intOrNull(s?.id),
        step_number: intOrNull(s?.step_number),
        instructions: s?.instructions == null ? '' : String(s.instructions),
        type: s?.type == null ? null : String(s.type),
      }))
      .sort((a, b) => {
        const aN = a.step_number == null ? Infinity : a.step_number;
        const bN = b.step_number == null ? Infinity : b.step_number;
        return aN - bN;
      });
  }

  // Mirrors bridge.loadRecipeFromDB's home_location subquery: pick the
  // ingredient's canonical variant (variant in ('','default'), with 'default'
  // preferred, then lowest id) and return its home_location lowercased. If
  // no canonical variant exists, return ''.
  function resolveLocationAtHome(ingredientVariants) {
    const candidates = (
      Array.isArray(ingredientVariants) ? ingredientVariants : []
    )
      .map((v) => ({
        variant: trimOrEmpty(v?.variant).toLowerCase(),
        home_location: v?.home_location == null ? null : String(v.home_location),
        id: intOrNull(v?.id),
      }))
      .filter((v) => v.variant === '' || v.variant === 'default');

    if (!candidates.length) return '';
    candidates.sort((a, b) => {
      const aRank = a.variant === 'default' ? 0 : 1;
      const bRank = b.variant === 'default' ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aId = a.id == null ? Infinity : a.id;
      const bId = b.id == null ? Infinity : b.id;
      return aId - bId;
    });
    const loc = candidates[0].home_location;
    if (loc == null) return '';
    return String(loc).toLowerCase();
  }

  // Mirrors bridge.loadRecipeFromDB's variant_deprecated subquery: find the
  // ingredient_variant whose variant string matches the rim's chosen variant
  // (case-insensitive trim) and return its is_deprecated. Default false.
  function resolveVariantDeprecated(ingredientVariants, chosenVariantRaw) {
    const chosen = trimOrEmpty(chosenVariantRaw).toLowerCase();
    const match = (Array.isArray(ingredientVariants) ? ingredientVariants : []).find(
      (v) => trimOrEmpty(v?.variant).toLowerCase() === chosen,
    );
    return toBool(match?.is_deprecated);
  }

  /** When the recipe names a variant (e.g. BAR), YWN should use that variant's home_location. */
  function resolveLocationAtHomeForChosenVariant(ingredientVariants, chosenVariantRaw) {
    const chosen = trimOrEmpty(chosenVariantRaw).toLowerCase();
    const list = Array.isArray(ingredientVariants) ? ingredientVariants : [];

    if (chosen) {
      const match = list.find(
        (v) => trimOrEmpty(v?.variant).toLowerCase() === chosen,
      );
      if (match && match.home_location != null) {
        const raw = trimStr(match.home_location);
        const loc = raw.toLowerCase();
        if (loc && loc !== 'none') return loc;
        // Blank, `none`, or whitespace-only → inherit canonical (''/default) base.
      }
    }

    return resolveLocationAtHome(list);
  }

  // Mirrors recipeDisplayNameSql in bridge: linked recipes show their linked
  // recipe title (or recipe_text override), non-recipe rows show display_name
  // when it's set and meaningfully different from the ingredient name.
  //
  // Bridge SQL is COALESCE(NULLIF(TRIM(rim.recipe_text), ''), lr.title, i.name, '')
  // for is_recipe=1 rows. Note: only recipe_text is trimmed; lr.title and
  // i.name are used raw. linkedRecipeTitle (a separate field) IS trimmed.
  function resolveDisplayName({ rim, ingredient, linkedRecipe }) {
    const isRecipeFlag = toBool(rim?.is_recipe);
    if (isRecipeFlag) {
      const rtTrimmed = trimOrEmpty(rim?.recipe_text);
      if (rtTrimmed) return rtTrimmed;
      if (linkedRecipe && linkedRecipe.title != null) {
        return String(linkedRecipe.title);
      }
      if (ingredient && ingredient.name != null) {
        return String(ingredient.name);
      }
      return '';
    }
    const display = rim?.display_name;
    const ingName = ingredient?.name;
    const displayTrim = trimOrEmpty(display);
    const ingNameTrim = trimOrEmpty(ingName);
    if (displayTrim && displayTrim.toLowerCase() !== ingNameTrim.toLowerCase()) {
      return display == null ? '' : String(display);
    }
    return ingName == null ? '' : String(ingName);
  }

  function transformRimRow(rim) {
    const ingredient = rim?.ingredients || null;
    const linkedRecipe = rim?.linked_recipe || null;
    const variants = ingredient?.ingredient_variants || [];

    const rimId = intOrNull(rim?.id);

    const chosenVariant =
      rim?.variant === undefined || rim?.variant === null
        ? ingredient?.variant || ''
        : rim.variant || '';
    const chosenSize =
      rim?.size === undefined || rim?.size === null
        ? ingredient?.size || ''
        : rim.size || '';

    const linkedRecipeId = intOrNull(rim?.linked_recipe_id);
    const linkedRecipeIdPositive =
      linkedRecipeId != null && linkedRecipeId > 0 ? linkedRecipeId : null;
    const isRecipe = toBool(rim?.is_recipe) && linkedRecipeIdPositive != null;

    const rawName = resolveDisplayName({ rim, ingredient, linkedRecipe });
    const name =
      typeof rawName === 'string' && rawName.trim() === 'Add an ingredient.'
        ? ''
        : rawName;

    return {
      rowType: 'ingredient',
      rimId: rimId,
      clientId: rimId == null ? null : `i-${rimId}`,
      sectionId: intOrNull(rim?.section_id),
      sortOrder: intOrNull(rim?.sort_order),
      quantity: normalizeQuantity(rim?.quantity),
      quantityMin: toPositiveOrNull(rim?.quantity_min),
      quantityMax: toPositiveOrNull(rim?.quantity_max),
      quantityIsApprox: toBool(rim?.quantity_is_approx),
      unit: emptyIfNullish(rim?.unit),
      name,
      variant: emptyIfNullish(chosenVariant),
      size: emptyIfNullish(chosenSize),
      lemma: emptyIfNullish(ingredient?.lemma),
      singularIfUnspecified:
        ingredient != null &&
        Object.prototype.hasOwnProperty.call(
          ingredient,
          'singular_if_unspecified',
        )
          ? toBool(ingredient.singular_if_unspecified)
          : false,
      isMassNoun: toBool(ingredient?.is_mass_noun),
      useMetric: toBool(ingredient?.use_metric),
      usePluralOverride:
        ingredient != null &&
        Object.prototype.hasOwnProperty.call(
          ingredient,
          'use_plural_override',
        )
          ? toBool(ingredient.use_plural_override)
          : !!trimStr(ingredient?.plural_override),
      pluralOverride:
        ingredient != null &&
        (Object.prototype.hasOwnProperty.call(
          ingredient,
          'use_plural_override',
        )
          ? toBool(ingredient.use_plural_override)
          : !!trimStr(ingredient?.plural_override))
          ? emptyIfNullish(ingredient?.plural_override)
          : '',
      prepNotes: emptyIfNullish(rim?.prep_notes),
      isOptional: toBool(rim?.is_optional),
      parentheticalNote:
        rim?.parenthetical_note != null
          ? String(rim.parenthetical_note)
          : ingredient?.parenthetical_note != null
            ? String(ingredient.parenthetical_note)
            : '',
      locationAtHome: resolveLocationAtHomeForChosenVariant(variants, chosenVariant),
      isRecipe,
      linkedRecipeId: linkedRecipeIdPositive,
      linkedRecipeTitle: trimOrEmpty(linkedRecipe?.title),
      recipeText: trimOrEmpty(rim?.recipe_text),
      isDeprecated: toBool(ingredient?.is_deprecated),
      variantDeprecated: resolveVariantDeprecated(variants, chosenVariant),
      isAlt: toBool(rim?.is_alt),
    };
  }

  function transformHeadingRow(row) {
    const headingId = intOrNull(row?.id);
    return {
      rowType: 'heading',
      headingId,
      headingClientId: headingId == null ? null : `h-${headingId}`,
      sectionId: intOrNull(row?.section_id),
      sortOrder: intOrNull(row?.sort_order),
      text: row?.heading_text == null ? '' : String(row.heading_text),
    };
  }

  function transformSubrecipeLinkRow(row) {
    const linkId = intOrNull(row?.id);
    const linkedRecipe = row?.linked_recipe || null;
    const linkedRecipeId = intOrNull(row?.linked_recipe_id);
    const linkedRecipeIdPositive =
      linkedRecipeId != null && linkedRecipeId > 0 ? linkedRecipeId : null;
    const recipeText = trimOrEmpty(row?.recipe_text);
    const linkedRecipeTitle = trimOrEmpty(linkedRecipe?.title);
    const name = recipeText || linkedRecipeTitle;

    return {
      rowType: 'ingredient',
      rimId: null,
      subrecipeLinkId: linkId,
      clientId: linkId == null ? null : `sr-${linkId}`,
      sectionId: intOrNull(row?.section_id),
      sortOrder: intOrNull(row?.sort_order),
      quantity: normalizeQuantity(row?.quantity),
      quantityMin: toPositiveOrNull(row?.quantity_min),
      quantityMax: toPositiveOrNull(row?.quantity_max),
      quantityIsApprox: toBool(row?.quantity_is_approx),
      unit: emptyIfNullish(row?.unit),
      name,
      variant: '',
      size: '',
      lemma: '',
      singularIfUnspecified: false,
      isMassNoun: false,
      pluralOverride: '',
      prepNotes: emptyIfNullish(row?.prep_notes),
      isOptional: toBool(row?.is_optional),
      parentheticalNote: emptyIfNullish(row?.parenthetical_note),
      locationAtHome: '',
      isRecipe: linkedRecipeIdPositive != null,
      linkedRecipeId: linkedRecipeIdPositive,
      linkedRecipeTitle,
      recipeText,
      isDeprecated: false,
      variantDeprecated: false,
      isAlt: toBool(row?.is_alt),
    };
  }

  function interleaveIngredientsAndHeadings(ingredientRows, headingRows) {
    const all = [...ingredientRows, ...headingRows];
    const sortKey = (row) =>
      row && row.sortOrder != null ? row.sortOrder : 999999;
    const typeRank = (row) => {
      if (!row) return 9;
      if (row.rowType === 'heading') return 0;
      if (row.rowType === 'ingredient') return 1;
      return 5;
    };
    const idOf = (row) =>
      row.rowType === 'heading'
        ? row.headingId == null
          ? 0
          : row.headingId
        : row.rimId != null
          ? row.rimId
          : row.subrecipeLinkId == null
            ? 0
            : row.subrecipeLinkId;
    all.sort((a, b) => {
      const sa = sortKey(a);
      const sb = sortKey(b);
      if (sa !== sb) return sa - sb;
      const ta = typeRank(a);
      const tb = typeRank(b);
      if (ta !== tb) return ta - tb;
      return idOf(a) - idOf(b);
    });
    return all;
  }

  function buildRecipeDetailFromRawRows(recipe, rawParts = {}) {
    const recipeIdValid = intOrNull(recipe?.id);
    if (recipeIdValid == null || recipeIdValid <= 0) return null;

    const tagMapRows = Array.isArray(rawParts.tagMapRows)
      ? rawParts.tagMapRows
      : [];
    const stepRows = Array.isArray(rawParts.stepRows) ? rawParts.stepRows : [];
    const headingRows = Array.isArray(rawParts.headingRows)
      ? rawParts.headingRows
      : [];
    const rimRows = Array.isArray(rawParts.rimRows) ? rawParts.rimRows : [];
    const subrecipeRows = Array.isArray(rawParts.subrecipeRows)
      ? rawParts.subrecipeRows
      : [];

    const tags = buildTagListFromTagMapRows(tagMapRows);
    const steps = buildSteps(stepRows);
    const ingredients = [
      ...(Array.isArray(rimRows) ? rimRows : []).map(transformRimRow),
      ...(Array.isArray(subrecipeRows) ? subrecipeRows : []).map(
        transformSubrecipeLinkRow,
      ),
    ];
    const headings = (Array.isArray(headingRows) ? headingRows : []).map(
      transformHeadingRow,
    );

    const interleaved = interleaveIngredientsAndHeadings(ingredients, headings);

    const hasContent = steps.length > 0 || interleaved.length > 0;
    const sections = hasContent
      ? [
          {
            ID: null,
            name: '(unnamed)',
            steps,
            ingredients: interleaved,
          },
        ]
      : [];

    const def = toPositiveOrNull(recipe?.servings_default);
    return {
      id: recipeIdValid,
      title: recipe?.title == null ? '' : String(recipe.title),
      summary: recipe?.summary == null ? '' : String(recipe.summary),
      servings: {
        default: def,
        min: toPositiveOrNull(recipe?.servings_min),
        max: toPositiveOrNull(recipe?.servings_max),
      },
      tags,
      sections,
    };
  }

  /** LRU-ish cap so navigations across many recipes do not grow without bound. */
  const RECIPE_DETAIL_CACHE_MAX = 128;
  const recipeDetailResolvedCache = new Map();
  const recipeDetailInflight = new Map();
  /** Bumped when catalog recipe composition changes; invalidates all recipe detail cache entries. */
  let recipeCompositionReadModelGeneration = 0;
  const recipeCatalogRealtimeChannels = new Map();

  function touchRecipeDetailCache(map, key, value) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > RECIPE_DETAIL_CACHE_MAX) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
  }

  async function loadRecipeDetailUncached(opts, recipeId, loadOpts = {}) {
    const forShoppingPlan = !!loadOpts.forShoppingPlan;
    const id = Number(recipeId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title,summary,servings_default,servings_min,servings_max&id=eq.${id}&limit=1`,
    );
    if (!recipeRows.length) return null;
    const recipe = recipeRows[0];
    const recipeIdValid = intOrNull(recipe?.id);
    if (recipeIdValid == null || recipeIdValid <= 0) return null;

    const tagMapSelect = encodeURIComponent('id,sort_order,tags(name,is_hidden)');
    const stepsSelect = encodeURIComponent('id,step_number,instructions,type');
    const headingsSelect = encodeURIComponent('id,section_id,sort_order,heading_text');
    const subrecipeSelect = encodeURIComponent(
      [
        'id',
        'section_id',
        'sort_order',
        'quantity',
        'quantity_min',
        'quantity_max',
        'quantity_is_approx',
        'unit',
        'prep_notes',
        'is_optional',
        'parenthetical_note',
        'linked_recipe_id',
        'recipe_text',
        'is_alt',
        'linked_recipe:recipes!recipe_subrecipe_links_linked_recipe_id_fkey(title)',
      ].join(','),
    );
    const rimSelect = encodeURIComponent(
      [
        'id',
        'section_id',
        'sort_order',
        'quantity',
        'quantity_min',
        'quantity_max',
        'quantity_is_approx',
        'unit',
        'variant',
        'size',
        'prep_notes',
        'is_optional',
        'parenthetical_note',
        'is_recipe',
        'linked_recipe_id',
        'recipe_text',
        'is_alt',
        'display_name',
        'ingredients(id,name,variant,size,parenthetical_note,lemma,singular_if_unspecified,is_mass_noun,plural_override,is_deprecated,use_metric,ingredient_variants(id,variant,home_location,is_deprecated))',
        'linked_recipe:recipes!linked_recipe_id(title)',
      ].join(','),
    );

    let tagMapRows;
    let stepRows;
    let headingRows;
    let rimRows;
    let subrecipeRows;

    if (forShoppingPlan) {
      [headingRows, rimRows, subrecipeRows] = await Promise.all([
        pgGet(
          opts,
          `recipe_ingredient_headings?recipe_id=eq.${id}&select=${headingsSelect}`,
        ),
        pgGet(opts, `recipe_ingredient_map?recipe_id=eq.${id}&select=${rimSelect}`),
        pgGet(
          opts,
          `recipe_subrecipe_links?recipe_id=eq.${id}&select=${subrecipeSelect}`,
        ),
      ]);
      tagMapRows = [];
      stepRows = [];
    } else {
      [tagMapRows, stepRows, headingRows, rimRows, subrecipeRows] = await Promise.all([
        pgGet(opts, `recipe_tag_map?recipe_id=eq.${id}&select=${tagMapSelect}`),
        pgGet(opts, `recipe_steps?recipe_id=eq.${id}&select=${stepsSelect}`),
        pgGet(
          opts,
          `recipe_ingredient_headings?recipe_id=eq.${id}&select=${headingsSelect}`,
        ),
        pgGet(opts, `recipe_ingredient_map?recipe_id=eq.${id}&select=${rimSelect}`),
        pgGet(
          opts,
          `recipe_subrecipe_links?recipe_id=eq.${id}&select=${subrecipeSelect}`,
        ),
      ]);
    }

    return buildRecipeDetailFromRawRows(recipe, {
      tagMapRows,
      stepRows,
      headingRows,
      rimRows,
      subrecipeRows,
    });
  }

  async function loadRecipeEditorScreen(opts, recipeId) {
    const id = Math.trunc(Number(recipeId));
    if (!Number.isFinite(id) || id <= 0) return null;
    const result = await pgRpc(
      opts,
      'load_recipe_editor',
      { p_recipe_id: id },
      'loadRecipeEditorScreen',
    );
    const obj = result && typeof result === 'object' ? result : null;
    if (!obj || !obj.recipe) return null;
    const recipe = buildRecipeDetailFromRawRows(obj.recipe, {
      tagMapRows: Array.isArray(obj.tagMap) ? obj.tagMap : [],
      stepRows: Array.isArray(obj.steps) ? obj.steps : [],
      headingRows: Array.isArray(obj.headings) ? obj.headings : [],
      rimRows: Array.isArray(obj.rim) ? obj.rim : [],
      subrecipeRows: Array.isArray(obj.subrecipeLinks) ? obj.subrecipeLinks : [],
    });
    if (recipe) {
      touchRecipeDetailCache(
        recipeDetailResolvedCache,
        `${id}:f`,
        recipe,
      );
    }
    return recipe;
  }

  async function loadRecipeDetail(opts, recipeId, loadOpts = {}) {
    const forShoppingPlan = !!loadOpts.forShoppingPlan;
    const bypassRecipeDetailCache = !!loadOpts.bypassRecipeDetailCache;
    const id = Number(recipeId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const cacheKey = `${id}:${forShoppingPlan ? 's' : 'f'}`;

    if (!bypassRecipeDetailCache && recipeDetailResolvedCache.has(cacheKey)) {
      const hit = recipeDetailResolvedCache.get(cacheKey);
      touchRecipeDetailCache(recipeDetailResolvedCache, cacheKey, hit);
      return hit;
    }
    if (forShoppingPlan && !bypassRecipeDetailCache) {
      const planCache =
        typeof globalThis !== 'undefined'
          ? globalThis.favoriteEatsPlanRecipeCache
          : null;
      if (planCache && typeof planCache.peek === 'function') {
        const sessionHit = planCache.peek(id);
        if (sessionHit) {
          touchRecipeDetailCache(
            recipeDetailResolvedCache,
            cacheKey,
            sessionHit,
          );
          return sessionHit;
        }
      }
    }
    if (recipeDetailInflight.has(cacheKey)) {
      return recipeDetailInflight.get(cacheKey);
    }
    const pending = loadRecipeDetailUncached(opts, id, loadOpts)
      .then((result) => {
        touchRecipeDetailCache(recipeDetailResolvedCache, cacheKey, result);
        if (
          forShoppingPlan &&
          result &&
          Array.isArray(result.sections)
        ) {
          const planCache =
            typeof globalThis !== 'undefined'
              ? globalThis.favoriteEatsPlanRecipeCache
              : null;
          if (planCache && typeof planCache.stash === 'function') {
            planCache.stash(id, result);
          }
        }
        return result;
      })
      .finally(() => {
        recipeDetailInflight.delete(cacheKey);
      });
    recipeDetailInflight.set(cacheKey, pending);
    return pending;
  }

  // ---- saveRecipe ----------------------------------------------------------
  //
  // Contract: js/data/contracts/saveRecipe.md

  function normalizeStepInstructions(raw) {
    if (raw == null) return '';
    let next = String(raw);
    next = next.replace(/[\u200B-\u200D\uFEFF]/g, '');
    next = next.replace(/\s+/g, ' ');
    next = next.trim();
    if (typeof global.normalizeTemperatureTokensInText === 'function') {
      next = global.normalizeTemperatureTokensInText(next);
    }
    next = next.replace(/\s+([.,!?:;])/g, '$1');
    next = next.replace(/([.,!?:;])\s+/g, '$1 ');
    next = next.trim();
    if (/^[.,!?:;]+$/.test(next)) return '';
    return next;
  }

  function normalizeSaveTags(rawTags) {
    const values = Array.isArray(rawTags)
      ? rawTags
      : String(rawTags == null ? '' : rawTags).split(/\r?\n|,/);
    const out = [];
    const seen = new Set();
    values.forEach((rawTag) => {
      const name = String(rawTag == null ? '' : rawTag)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 48)
        .trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out;
  }

  function deriveIngredientLemma(rawTitle) {
    const t = String(rawTitle || '').trim();
    if (!t) return '';
    if (/^tomatoes$/i.test(t)) return t.slice(0, -2);
    if (/^potatoes$/i.test(t)) return t.slice(0, -2);
    if (/ies$/i.test(t) && t.length > 3) return t.slice(0, -3) + 'y';
    if (/(ch|sh|s|x|z)es$/i.test(t) && t.length > 2) return t.slice(0, -2);
    if (/ses$/i.test(t) && t.length > 3) return t.slice(0, -2);
    if (/s$/i.test(t) && !/ss$/i.test(t) && t.length > 1) return t.slice(0, -1);
    return t;
  }

  function positiveNumberOrNull(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getRecipeIngredientAmountModel() {
    const model = global.favoriteEatsRecipeIngredientAmountModel;
    return model && typeof model === 'object' ? model : null;
  }

  function saveRowId(rawValue) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }

  function normalizeSaveSortOrder(rawValue, fallback) {
    const n = Number(rawValue);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  function isSaveHeadingRow(row) {
    if (!row) return false;
    if (row.rowType === 'heading') return true;
    if (row.headingId != null) return true;
    if (row.headingClientId && row.text != null && row.name == null) return true;
    return false;
  }

  function boolFromSaveRow(row, ...keys) {
    for (const key of keys) {
      if (row && row[key] !== undefined) {
        const value = row[key];
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
          if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
        }
        return toBool(value);
      }
    }
    return false;
  }

  function recipeIngredientAmountPayloadForSave(row) {
    const model = getRecipeIngredientAmountModel();
    if (model && typeof model.toDbPayload === 'function') {
      return model.toDbPayload(row);
    }

    const quantityRaw = row?.quantity;
    const quantityNum = Number(quantityRaw);
    const quantity =
      Number.isFinite(quantityNum) && quantityNum <= 0
        ? ''
        : String(quantityRaw == null ? '' : quantityRaw);
    const quantityFallback = positiveNumberOrNull(quantityRaw);
    return {
      quantity,
      quantity_min: quantityFallback,
      quantity_max: quantityFallback,
      quantity_is_approx: !!row?.quantityIsApprox,
    };
  }

  function buildStepsFromStepNodes(rawNodes) {
    return (Array.isArray(rawNodes) ? rawNodes : [])
      .slice()
      .sort((a, b) => {
        const ao = Number(a?.order);
        const bo = Number(b?.order);
        const aOrder = Number.isFinite(ao) ? ao : 0;
        const bOrder = Number.isFinite(bo) ? bo : 0;
        return aOrder - bOrder || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
      })
      .map((node, index) => ({
        step_number: index + 1,
        instructions: normalizeStepInstructions(node?.text),
        type: node?.type === 'heading' ? 'heading' : 'step',
      }))
      .filter((step) => !!step.instructions);
  }

  function buildSavePayload(recipe) {
    const id = Number(recipe?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('saveRecipe: valid recipe id is required.');
    }

    const sections = Array.isArray(recipe?.sections) ? recipe.sections : [];
    const stepNodesForSave =
      Array.isArray(recipe?.stepNodes) && recipe.stepNodes.length
        ? buildStepsFromStepNodes(recipe.stepNodes)
        : null;
    const steps = [];
    const headings = [];
    const ingredients = [];
    const subrecipes = [];

    if (stepNodesForSave) {
      steps.push(...stepNodesForSave);
    }

    sections.forEach((section) => {
      const sectionId = saveRowId(section?.ID ?? section?.id);
      if (!stepNodesForSave) {
        (Array.isArray(section?.steps) ? section.steps : []).forEach((step) => {
          const instructions = normalizeStepInstructions(step?.instructions);
          if (!instructions) return;
          steps.push({
            step_number: steps.length + 1,
            instructions,
            type: step?.type === 'heading' ? 'heading' : 'step',
          });
        });
      }

      let fallbackSort = 1;
      (Array.isArray(section?.ingredients) ? section.ingredients : []).forEach((row) => {
        if (!row || row.isPlaceholder) return;
        if (isSaveHeadingRow(row)) {
          const headingText = trimStr(row.text);
          if (!headingText) return;
          headings.push({
            id: saveRowId(row.headingId),
            section_id: sectionId,
            sort_order: normalizeSaveSortOrder(row.sortOrder, fallbackSort++),
            heading_text: headingText,
          });
          return;
        }

        const linkedRecipeId = saveRowId(row.linkedRecipeId);
        const linkedRecipeIsValid = !!(row.isRecipe && linkedRecipeId && linkedRecipeId !== id);
        const name = trimStr(row.name);
        if (!linkedRecipeIsValid && !name) return;

        const amountPayload = recipeIngredientAmountPayloadForSave(row);

        if (linkedRecipeIsValid) {
          subrecipes.push({
            id: saveRowId(row.subrecipeLinkId),
            section_id: sectionId,
            sort_order: normalizeSaveSortOrder(row.sortOrder, fallbackSort++),
            quantity: amountPayload.quantity,
            quantity_min: amountPayload.quantity_min,
            quantity_max: amountPayload.quantity_max,
            quantity_is_approx: !!amountPayload.quantity_is_approx,
            unit: trimStr(row.unit),
            prep_notes: trimStr(row.prepNotes),
            is_optional: !!row.isOptional,
            parenthetical_note: trimStr(row.parentheticalNote),
            linked_recipe_id: linkedRecipeId,
            recipe_text: trimStr(row.recipeText || row.name),
            is_alt: boolFromSaveRow(row, 'isAlt', 'is_alt', 'isalt'),
          });
          return;
        }

        ingredients.push({
          id: saveRowId(row.rimId),
          section_id: sectionId,
          sort_order: normalizeSaveSortOrder(row.sortOrder, fallbackSort++),
          quantity: amountPayload.quantity,
          quantity_min: amountPayload.quantity_min,
          quantity_max: amountPayload.quantity_max,
          quantity_is_approx: !!amountPayload.quantity_is_approx,
          unit: trimStr(row.unit),
          ingredient_name: name,
          ingredient_lemma: deriveIngredientLemma(name),
          variant: trimStr(row.variant),
          size: trimStr(row.size),
          prep_notes: trimStr(row.prepNotes),
          is_optional: !!row.isOptional,
          parenthetical_note: trimStr(row.parentheticalNote),
          is_recipe: false,
          linked_recipe_id: null,
          recipe_text: '',
          is_alt: boolFromSaveRow(row, 'isAlt', 'is_alt', 'isalt'),
        });
      });
    });

    return {
      id: Math.trunc(id),
      title: recipe?.title == null ? '' : String(recipe.title),
      summary: trimStr(recipe?.summary),
      servings: {
        default: recipe?.servings?.default ?? null,
        min: recipe?.servings?.min ?? null,
        max: recipe?.servings?.max ?? null,
      },
      tags: normalizeSaveTags(recipe?.tags),
      steps,
      headings,
      ingredients,
      subrecipes,
    };
  }

  function bumpRecipeCompositionReadModel() {
    recipeCompositionReadModelGeneration += 1;
    recipeDetailResolvedCache.clear();
    recipeDetailInflight.clear();
    const planCache =
      typeof globalThis !== 'undefined'
        ? globalThis.favoriteEatsPlanRecipeCache
        : null;
    if (planCache && typeof planCache.clearAll === 'function') {
      planCache.clearAll();
    }
    return recipeCompositionReadModelGeneration;
  }

  function getRecipeCompositionReadModelGeneration() {
    return recipeCompositionReadModelGeneration;
  }

  function invalidateRecipeDetailCache(recipeId) {
    bumpRecipeCompositionReadModel();
    void recipeId;
  }

  async function saveRecipe(opts, request = {}) {
    const recipe = request?.recipe || request;
    const payload = buildSavePayload(recipe);
    await pgRpc(
      opts,
      'save_recipe',
      { recipe_payload: payload },
      'saveRecipe',
    );
    // Cache was populated when the editor first loaded the recipe (often before
    // the user added rows). Without this, the read-back returns the stale entry
    // and the UI looks empty until a hard refresh.
    invalidateRecipeDetailCache(payload.id);
    const saved = await loadRecipeDetail(opts, payload.id);
    if (!saved) {
      throw new Error('saveRecipe: saved recipe could not be reloaded.');
    }
    return saved;
  }

  // ---- loadTypeaheadPools --------------------------------------------------
  //
  // Contract: js/data/contracts/loadTypeaheadPools.md

  function sortByAsciiNocaseText(arr) {
    return arr.slice().sort((a, b) => {
      const la = asciiNocaseFold(trimStr(a));
      const lb = asciiNocaseFold(trimStr(b));
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
  }

  function distinctTrimmedText(rows, field) {
    const seenRaw = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const raw = row ? row[field] : null;
      const rawKey = raw == null ? '__NULL__' : String(raw);
      if (seenRaw.has(rawKey)) return;
      seenRaw.add(rawKey);
      const trimmed = trimStr(raw);
      if (trimmed) out.push(trimmed);
    });
    return out;
  }

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

  function toSortOrderValue(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  // Known for recipe editor resolution + typeahead: not deprecated (hidden ok).
  function ingredientRowKnownForRecipeResolution(row) {
    if (!row) return false;
    if (trimStr(row.name).length === 0) return false;
    if (toBool(row.is_deprecated)) return false;
    return true;
  }

  async function loadTypeaheadPools(opts, options = {}) {
    const [ingredientRows, synonymRows, variantRows, unitRows, sizeRows] =
      await Promise.all([
        pgGet(
          opts,
          'ingredients?select=id,name,is_deprecated,is_hidden',
          'loadTypeaheadPools',
        ),
        pgGet(
          opts,
          'ingredient_synonyms?select=id,ingredient_id,synonym',
          'loadTypeaheadPools',
        ),
        pgGet(
          opts,
          'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated',
          'loadTypeaheadPools',
        ),
        pgGet(opts, 'units?select=code,sort_order,is_removed', 'loadTypeaheadPools'),
        pgGet(opts, 'sizes?select=id,name,sort_order,is_removed', 'loadTypeaheadPools'),
      ]);

    const visibleIngredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter(ingredientRowKnownForRecipeResolution)
      .map((row) => ({
        id: intOrNull(row.id ?? row.ID),
        name: row.name,
      }))
      .filter((row) => row.id != null && row.id > 0);

    const ingredientNames = sortByAsciiNocaseText(
      distinctTrimmedText(visibleIngredients, 'name'),
    );

    const unitCodes = (Array.isArray(unitRows) ? unitRows : [])
      .filter((row) => !toBool(row?.is_removed))
      .map((row) => ({
        code: trimStr(row?.code),
        sortOrder: toSortOrderValue(row?.sort_order),
      }))
      .filter((row) => row.code.length > 0)
      .sort((a, b) => {
        const aSort = a.sortOrder == null ? Infinity : a.sortOrder;
        const bSort = b.sortOrder == null ? Infinity : b.sortOrder;
        if (aSort !== bSort) return aSort - bSort;
        const la = asciiNocaseFold(a.code);
        const lb = asciiNocaseFold(b.code);
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      })
      .map((row) => row.code);

    const sizeNames = (Array.isArray(sizeRows) ? sizeRows : [])
      .filter((row) => !toBool(row?.is_removed))
      .map((row) => ({
        name: trimStr(row?.name),
        sortOrder: toSortOrderValue(row?.sort_order),
      }))
      .filter((row) => row.name.length > 0)
      .sort(compareSizeDisplayValues)
      .map((row) => row.name);

    const ingredientName = trimStr(options?.ingredientName);
    let variantNames = [];
    if (ingredientName) {
      const key = ingredientName.toLowerCase();
      const ingredientIds = [];
      const seenIds = new Set();
      const pushId = (idRaw) => {
        const id = intOrNull(idRaw);
        if (id == null || id <= 0 || seenIds.has(id)) return;
        seenIds.add(id);
        ingredientIds.push(id);
      };

      visibleIngredients.forEach((row) => {
        if (trimStr(row.name).toLowerCase() === key) pushId(row.id);
      });

      const visibleIdSet = new Set(visibleIngredients.map((row) => row.id));
      (Array.isArray(synonymRows) ? synonymRows : []).forEach((row) => {
        const id = intOrNull(row?.ingredient_id);
        if (!visibleIdSet.has(id)) return;
        if (trimStr(row?.synonym).toLowerCase() === key) pushId(id);
      });

      const idSet = new Set(ingredientIds);
      variantNames = sortByAsciiNocaseText(
        distinctTrimmedText(
          (Array.isArray(variantRows) ? variantRows : []).filter((row) => {
            const id = intOrNull(row?.ingredient_id);
            const variant = trimStr(row?.variant);
            return (
              idSet.has(id) &&
              variant.length > 0 &&
              variant.toLowerCase() !== 'default' &&
              !toBool(row?.is_deprecated)
            );
          }),
          'variant',
        ),
      );
    }

    return { ingredientNames, unitCodes, sizeNames, variantNames };
  }

  // ---- buildRecipeEditorPreflightHelpers -----------------------------------
  //
  // Loads ingredient/synonym/variant/unit/size/tag snapshots so recipe-editor Save
  // can resolve unknown names (dialogs + ensure missing catalog variants) via Supabase catalog reads.

  async function buildRecipeEditorPreflightHelpers(opts) {
    const [
      ingredientRows,
      synonymRows,
      variantRows,
      tagRows,
      unitList,
      sizeList,
    ] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated,is_hidden',
        'buildRecipeEditorPreflightHelpers',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'buildRecipeEditorPreflightHelpers',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated,home_location',
        'buildRecipeEditorPreflightHelpers',
      ),
      listTags(opts),
      listUnits(opts),
      listSizes(opts),
    ]);

    const visibleIngredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter(ingredientRowKnownForRecipeResolution)
      .map((row) => ({
        id: intOrNull(row.id ?? row.ID),
        name: row.name,
      }))
      .filter((row) => row.id != null && row.id > 0);

    const visibleIdSet = new Set(visibleIngredients.map((row) => row.id));
    const idToName = new Map();
    visibleIngredients.forEach((row) => {
      idToName.set(row.id, trimStr(row.name));
    });

    const nameToCanonicalId = new Map();
    visibleIngredients.forEach((row) => {
      const k = asciiNocaseFold(trimStr(row.name));
      if (!k) return;
      const id = row.id;
      const prev = nameToCanonicalId.get(k);
      if (prev == null || id < prev) nameToCanonicalId.set(k, id);
    });

    const synonymToId = new Map();
    (Array.isArray(synonymRows) ? synonymRows : []).forEach((syn) => {
      const id = intOrNull(syn.ingredient_id);
      if (!visibleIdSet.has(id)) return;
      const k = asciiNocaseFold(trimStr(syn.synonym));
      if (!k) return;
      const prev = synonymToId.get(k);
      if (prev == null || id < prev) synonymToId.set(k, id);
    });

    function getVisibleCanonicalId(name) {
      const k = asciiNocaseFold(trimStr(name));
      if (!k) return null;
      if (nameToCanonicalId.has(k)) return nameToCanonicalId.get(k);
      if (synonymToId.has(k)) return synonymToId.get(k);
      return null;
    }

    function anyIngredientNamed(name) {
      return getVisibleCanonicalId(name) != null;
    }

    const ingredientHelpers = { getVisibleCanonicalId, anyIngredientNamed };

    const variantRowsMutable = (Array.isArray(variantRows) ? variantRows : []).filter(
      (row) => visibleIdSet.has(intOrNull(row.ingredient_id)),
    );

    const variantPairKeys = new Set();
    variantRowsMutable.forEach((row) => {
      const iid = intOrNull(row.ingredient_id);
      const vv = trimStr(row.variant);
      if (!iid || !vv) return;
      variantPairKeys.add(`${iid}::${asciiNocaseFold(vv)}`);
    });

    const RECIPE_RESERVED_VARIANTS = new Set(['default', 'base', 'any']);

    function recipeVariantIsBaseOrReserved(rawVariant) {
      const n = asciiNocaseFold(trimStr(rawVariant));
      return !n || RECIPE_RESERVED_VARIANTS.has(n);
    }

    const hasVariantTable = true;

    function getIngredientNameById(ingredientId) {
      const iid = intOrNull(ingredientId);
      if (iid == null || iid <= 0) return '';
      return idToName.get(iid) || '';
    }

    function anyVariantForIngredient(ingredientId, variantName) {
      const iid = intOrNull(ingredientId);
      const vv = trimStr(variantName);
      if (iid == null || iid <= 0 || !vv) return false;
      if (recipeVariantIsBaseOrReserved(vv)) return true;
      return variantPairKeys.has(`${iid}::${asciiNocaseFold(vv)}`);
    }

    function getVisibleVariantPoolForIngredientId(ingredientId) {
      const iid = intOrNull(ingredientId);
      if (iid == null || iid <= 0) return [];
      const rows = variantRowsMutable
        .filter((row) => intOrNull(row.ingredient_id) === iid)
        .filter((row) => !toBool(row?.is_deprecated))
        .slice()
        .sort((a, b) => {
          const as = Number(a?.sort_order);
          const bs = Number(b?.sort_order);
          const ar = Number.isFinite(as) ? as : 999999;
          const br = Number.isFinite(bs) ? bs : 999999;
          if (ar !== br) return ar - br;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        });
      const out = [];
      const seen = new Set();
      rows.forEach((row) => {
        const value = trimStr(row?.variant);
        if (!value) return;
        const nk = asciiNocaseFold(value);
        if (!nk || nk === 'default' || seen.has(nk)) return;
        seen.add(nk);
        out.push(value);
      });
      return out;
    }

    async function ensureVariantForIngredient(ingredientId, variantName) {
      const iid = intOrNull(ingredientId);
      const vv = trimStr(variantName);
      if (iid == null || iid <= 0 || !vv) return false;
      if (recipeVariantIsBaseOrReserved(vv)) return false;
      if (anyVariantForIngredient(iid, vv)) return false;
      const rowsForIng = variantRowsMutable.filter(
        (row) => intOrNull(row.ingredient_id) === iid,
      );
      let maxSort = 0;
      rowsForIng.forEach((row) => {
        const n = Number(row.sort_order);
        if (Number.isFinite(n) && n > maxSort) maxSort = n;
      });
      const nextSort = maxSort + 1;
      const inserted = await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: iid,
          variant: vv,
          sort_order: nextSort,
          home_location: 'none',
          is_deprecated: false,
        },
        'buildRecipeEditorPreflightHelpers',
      );
      const newId = intOrNull(inserted[0]?.id);
      if (newId == null || newId <= 0) return false;
      variantRowsMutable.push({
        id: newId,
        ingredient_id: iid,
        variant: vv,
        sort_order: nextSort,
        is_deprecated: false,
      });
      variantPairKeys.add(`${iid}::${asciiNocaseFold(vv)}`);
      return true;
    }

    const variantHelpers = {
      hasVariantTable,
      getIngredientNameById,
      getVisibleVariantPoolForIngredientId,
      anyVariantForIngredient,
      ensureVariantForIngredient,
    };

    const unitCodesLower = new Set();
    (Array.isArray(unitList) ? unitList : []).forEach((row) => {
      if (row?.isRemoved) return;
      const code = trimStr(row?.code);
      if (!code) return;
      unitCodesLower.add(code.toLowerCase());
    });
    const unitHelpers = {
      anySelectableUnitCoded: (code) =>
        unitCodesLower.has(trimStr(code).toLowerCase()),
    };

    const sizeNamesLower = new Set();
    (Array.isArray(sizeList) ? sizeList : []).forEach((row) => {
      if (row?.isRemoved) return;
      const name = trimStr(row?.name);
      if (!name) return;
      sizeNamesLower.add(name.toLowerCase());
    });
    const sizeHelpers = {
      anySelectableSizeNamed: (name) =>
        sizeNamesLower.has(trimStr(name).toLowerCase()),
    };

    const tagNamesLower = new Set();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const name = trimStr(row?.name);
      if (!name) return;
      tagNamesLower.add(name.toLowerCase());
    });
    const tagHelpers = {
      anyVisibleTagNamed: (name) => tagNamesLower.has(trimStr(name).toLowerCase()),
    };

    return {
      ingredient: ingredientHelpers,
      variant: variantHelpers,
      unit: unitHelpers,
      size: sizeHelpers,
      tag: tagHelpers,
    };
  }

  // ---- listTags ------------------------------------------------------------
  //
  // Contract: js/data/contracts/listTags.md

  function normalizeIntendedUse(rawValue) {
    return trimStr(rawValue).toLowerCase() === 'ingredients'
      ? 'ingredients'
      : 'recipes';
  }

  function toTagSortOrder(rawValue) {
    if (rawValue == null || rawValue === '') return 999999;
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : 999999;
  }

  function compareTagRows(a, b) {
    const aSort = toTagSortOrder(a?.sort_order);
    const bSort = toTagSortOrder(b?.sort_order);
    if (aSort !== bSort) return aSort - bSort;
    const la = asciiNocaseFold(a?.name == null ? '' : String(a.name));
    const lb = asciiNocaseFold(b?.name == null ? '' : String(b.name));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listTags(opts) {
    const [tagRows, recipeTagMapRows, ingredientVariantTagMapRows] =
      await Promise.all([
        pgGet(
          opts,
          'tags?select=id,name,is_hidden,sort_order,intended_use',
          'listTags',
        ),
        pgGet(opts, 'recipe_tag_map?select=id,tag_id', 'listTags'),
        pgGet(opts, 'ingredient_variant_tag_map?select=id,tag_id', 'listTags'),
      ]);

    const recipeTagIds = new Set(
      (Array.isArray(recipeTagMapRows) ? recipeTagMapRows : [])
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );
    const ingredientTagIds = new Set(
      (Array.isArray(ingredientVariantTagMapRows)
        ? ingredientVariantTagMapRows
        : []
      )
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );

    return (Array.isArray(tagRows) ? tagRows : [])
      .filter((row) => !toBool(row?.is_hidden))
      .slice()
      .sort(compareTagRows)
      .map((row) => {
        const id = intOrNull(row?.id);
        return {
          id,
          name: row?.name == null ? '' : String(row.name),
          sortOrder: toTagSortOrder(row?.sort_order),
          intendedUse: normalizeIntendedUse(row?.intended_use),
          hasRecipeUsage: recipeTagIds.has(id),
          hasIngredientUsage: ingredientTagIds.has(id),
        };
      });
  }

  // ---- createTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/createTag.md

  async function createTag(opts, request = {}) {
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('createTag: name is required.');
    }
    const intendedUse = normalizeIntendedUse(request?.intendedUse ?? request?.useFor);
    const existingRows = await pgGet(opts, 'tags?select=sort_order', 'createTag');
    const nextSort =
      (Array.isArray(existingRows) ? existingRows : []).reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;

    const rows = await pgPost(
      opts,
      'tags?select=id',
      { name, sort_order: nextSort, intended_use: intendedUse, is_hidden: 0 },
      'createTag',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createTag: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteTag -----------------------------------------------------------
  //
  // Contract: js/data/contracts/deleteTag.md

  async function deleteTag(opts, request = {}) {
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteTag: valid tag id is required.');
    }
    const tagId = Math.trunc(id);
    const encodedId = encodeURIComponent(String(tagId));
    await pgDelete(opts, `recipe_tag_map?tag_id=eq.${encodedId}`, 'deleteTag');
    await pgDelete(
      opts,
      `ingredient_variant_tag_map?tag_id=eq.${encodedId}`,
      'deleteTag',
    );
    await pgDelete(opts, `tags?id=eq.${encodedId}`, 'deleteTag');
    return { id: tagId };
  }

  // ---- editTag -------------------------------------------------------------
  //
  // Contract: js/data/contracts/editTag.md

  async function editTag(opts, request = {}) {
    const id = Number(request?.id ?? request?.tagId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editTag: valid tag id is required.');
    }
    const name = trimStr(request?.name).slice(0, 48).trim();
    if (!name) {
      throw new Error('editTag: name is required.');
    }
    const tagId = Math.trunc(id);
    await pgPatch(
      opts,
      `tags?id=eq.${encodeURIComponent(String(tagId))}`,
      { name },
      'editTag',
    );
    return { id: tagId };
  }

  // ---- loadTagUsage --------------------------------------------------------
  //
  // Contract: js/data/contracts/loadTagUsage.md

  const TAG_USAGE_SIZE_VARIANT_TOKENS = new Set([
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
  ]);

  function emptyTagUsage(mode = 'recipes') {
    return {
      mode: mode === 'ingredients' ? 'ingredients' : 'recipes',
      recipes: [],
      ingredients: [],
    };
  }

  function normalizeTagUsageVariant(rawVariant) {
    const variant = trimStr(rawVariant);
    return variant.toLowerCase() === 'default' ? '' : variant;
  }

  function isTagUsageSizeVariant(rawVariant) {
    const normalized = trimStr(rawVariant).toLowerCase();
    return normalized ? TAG_USAGE_SIZE_VARIANT_TOKENS.has(normalized) : false;
  }

  function makeTagUsageIngredientLabel(name, variantName) {
    const cleanName = trimStr(name);
    const cleanVariant = normalizeTagUsageVariant(variantName);
    const labelVariant =
      cleanVariant && !isTagUsageSizeVariant(cleanVariant) ? cleanVariant : '';
    return [labelVariant, cleanName].filter(Boolean).join(' ').trim();
  }

  function compareTagUsageTitle(a, b) {
    const la = asciiNocaseFold(a?.title || '');
    const lb = asciiNocaseFold(b?.title || '');
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function compareTagUsageIngredient(a, b) {
    const aName = asciiNocaseFold(a?.ingredientName || '');
    const bName = asciiNocaseFold(b?.ingredientName || '');
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    const aVariant = asciiNocaseFold(a?.variantName || '');
    const bVariant = asciiNocaseFold(b?.variantName || '');
    if (aVariant < bVariant) return -1;
    if (aVariant > bVariant) return 1;
    return 0;
  }

  function positiveUniqueIds(rows, key) {
    const seen = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const id = intOrNull(row?.[key]);
      if (id == null || id <= 0 || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function inFilter(ids) {
    return `in.(${ids.map((id) => Math.trunc(Number(id))).join(',')})`;
  }

  async function loadTagUsage(opts, tagId) {
    const id = Number(tagId);
    if (!Number.isFinite(id) || id <= 0) return emptyTagUsage();
    const tagKey = Math.trunc(id);
    const tagRows = await pgGet(
      opts,
      `tags?select=id,intended_use&id=eq.${tagKey}&limit=1`,
      'loadTagUsage',
    );
    if (!Array.isArray(tagRows) || !tagRows.length) return emptyTagUsage();

    const mode = normalizeIntendedUse(tagRows[0]?.intended_use);
    if (mode !== 'ingredients') {
      const mapRows = await pgGet(
        opts,
        `recipe_tag_map?select=id,recipe_id&tag_id=eq.${tagKey}`,
        'loadTagUsage',
      );
      const recipeIds = positiveUniqueIds(mapRows, 'recipe_id');
      if (!recipeIds.length) return emptyTagUsage('recipes');
      const recipeRows = await pgGet(
        opts,
        `recipes?select=id,title&id=${inFilter(recipeIds)}`,
        'loadTagUsage',
      );
      const seen = new Set();
      const recipes = (Array.isArray(recipeRows) ? recipeRows : [])
        .map((row) => ({
          id: intOrNull(row?.id),
          title: row?.title == null ? '' : String(row.title),
        }))
        .filter((row) => {
          if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        })
        .sort(compareTagUsageTitle);
      return { mode: 'recipes', recipes, ingredients: [] };
    }

    const mapRows = await pgGet(
      opts,
      `ingredient_variant_tag_map?select=id,ingredient_variant_id&tag_id=eq.${tagKey}`,
      'loadTagUsage',
    );
    const variantIds = positiveUniqueIds(mapRows, 'ingredient_variant_id');
    if (!variantIds.length) return emptyTagUsage('ingredients');
    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&id=${inFilter(variantIds)}`,
      'loadTagUsage',
    );
    const ingredientIds = positiveUniqueIds(variantRows, 'ingredient_id');
    const ingredientRows = ingredientIds.length
      ? await pgGet(
          opts,
          `ingredients?select=id,name&id=${inFilter(ingredientIds)}`,
          'loadTagUsage',
        )
      : [];
    const ingredientById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.id);
      if (ingredientId != null && ingredientId > 0) ingredientById.set(ingredientId, row);
    });
    const seen = new Set();
    const ingredients = (Array.isArray(variantRows) ? variantRows : [])
      .map((variantRow) => {
        const variantId = intOrNull(variantRow?.id);
        const ingredientId = intOrNull(variantRow?.ingredient_id);
        const ingredientRow = ingredientById.get(ingredientId);
        if (
          variantId == null ||
          variantId <= 0 ||
          ingredientId == null ||
          ingredientId <= 0 ||
          !ingredientRow ||
          seen.has(variantId)
        ) {
          return null;
        }
        seen.add(variantId);
        const ingredientName = trimStr(ingredientRow?.name);
        const variantName = normalizeTagUsageVariant(variantRow?.variant);
        return {
          ingredientId,
          ingredientName,
          variantName,
          label: makeTagUsageIngredientLabel(ingredientName, variantName),
        };
      })
      .filter(Boolean)
      .sort(compareTagUsageIngredient);
    return { mode: 'ingredients', recipes: [], ingredients };
  }

  // ---- listUnits -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listUnits.md

  function compareUnitRows(a, b) {
    const aSort = toSortOrderValue(a?.sort_order);
    const bSort = toSortOrderValue(b?.sort_order);
    const aSortRank = aSort == null ? -Infinity : aSort;
    const bSortRank = bSort == null ? -Infinity : bSort;
    if (aSortRank !== bSortRank) return aSortRank - bSortRank;
    const la = asciiNocaseFold(a?.code == null ? '' : String(a.code));
    const lb = asciiNocaseFold(b?.code == null ? '' : String(b.code));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  function effectiveUnitPluralFromRow(row) {
    const singular =
      row?.name_singular == null ? '' : String(row.name_singular).trim();
    const useOv = toBool(row?.use_plural_override);
    const override = trimStr(row?.plural_override);
    const storedPlural =
      row?.name_plural == null ? '' : String(row.name_plural).trim();
    if (useOv && override) return override;
    if (useOv && storedPlural) return storedPlural;
    if (typeof globalThis.pluralizeEnglishNoun === 'function') {
      const auto = String(
        globalThis.pluralizeEnglishNoun(singular, '') || '',
      ).trim();
      if (auto) return auto;
    }
    return storedPlural;
  }

  const UNIT_QUANTITY_ROUNDING_FIXED_PRESETS = new Set([
    'nearest_eighth',
    'nearest_quarter',
    'nearest_half',
    'nearest_whole',
    'system_measured',
  ]);

  function normalizeQuantityRoundingPresetValue(raw) {
    const p = trimStr(raw).toLowerCase();
    if (!p) return 'nearest_eighth';
    if (p === 'custom') return 'custom';
    if (p === 'system_measured') return 'system_measured';
    if (UNIT_QUANTITY_ROUNDING_FIXED_PRESETS.has(p)) return p;
    return 'nearest_eighth';
  }

  function normalizeUnitlessQuantityPolicy(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const useSystemDefault = toBool(
      source.useSystemDefault ?? source.use_system_default ?? true,
    );
    const rawStep =
      source.quantityRoundingStepDenominator ??
      source.quantity_rounding_step_denominator;
    const step = Number(rawStep);
    return {
      useSystemDefault,
      quantityRoundingStepDenominator: [1, 2, 3, 4, 8, 12].includes(step)
        ? step
        : 8,
    };
  }

  async function loadUnitlessQuantityPolicy(opts) {
    const result = await pgRpc(
      opts,
      'load_unitless_quantity_policy',
      {},
      'loadUnitlessQuantityPolicy',
    );
    return normalizeUnitlessQuantityPolicy(result);
  }

  async function saveUnitlessQuantityPolicy(opts, request = {}) {
    const policy = normalizeUnitlessQuantityPolicy(request);
    const result = await pgRpc(
      opts,
      'save_unitless_quantity_policy',
      {
        request: {
          useSystemDefault: policy.useSystemDefault,
          quantityRoundingStepDenominator:
            policy.quantityRoundingStepDenominator,
        },
      },
      'saveUnitlessQuantityPolicy',
    );
    return normalizeUnitlessQuantityPolicy(result || policy);
  }

  async function listUnits(opts) {
    const rows = await pgGet(
      opts,
      'units?select=code,name_singular,name_plural,category,sort_order,is_hidden,is_removed,use_plural_override,plural_override,quantity_rounding_preset,quantity_rounding_step_denominator,quantity_rounding_mode',
      'listUnits',
    );

    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(compareUnitRows)
      .map((row) => ({
        code: row?.code == null ? '' : String(row.code),
        nameSingular:
          row?.name_singular == null ? '' : String(row.name_singular),
        namePlural: effectiveUnitPluralFromRow(row),
        pluralOverride: trimStr(row?.plural_override),
        usePluralOverride: toBool(row?.use_plural_override),
        category: row?.category == null ? '' : String(row.category),
        sortOrder: toSortOrderValue(row?.sort_order),
        isHidden: toBool(row?.is_hidden),
        isRemoved: toBool(row?.is_removed),
        quantityRoundingPreset: normalizeQuantityRoundingPresetValue(
          row?.quantity_rounding_preset,
        ),
        quantityRoundingStepDenominator: (() => {
          if (row?.quantity_rounding_step_denominator == null) return null;
          const n = Number(row.quantity_rounding_step_denominator);
          return Number.isFinite(n) ? n : null;
        })(),
        quantityRoundingMode: trimStr(row?.quantity_rounding_mode) || null,
      }));
  }

  // ---- createUnit ----------------------------------------------------------
  //
  // Contract: js/data/contracts/createUnit.md

  async function createUnit(opts, request = {}) {
    const nameSingular = trimStr(
      request?.nameSingular ?? request?.name_singular,
    );
    if (!nameSingular) {
      throw new Error('createUnit: singular name is required.');
    }
    const code = (trimStr(request?.code ?? request?.unitCode) || nameSingular).trim();
    if (!code) {
      throw new Error('createUnit: unit code is required.');
    }
    const rows = await pgGet(opts, 'units?select=sort_order', 'createUnit');
    const maxSort = (Array.isArray(rows) ? rows : []).reduce((max, row) => {
      const value = Number(row?.sort_order);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    await pgPost(
      opts,
      'units',
      {
        code,
        name_singular: nameSingular,
        name_plural: '',
        category: '',
        sort_order: maxSort + 1,
        is_hidden: 0,
        is_removed: 0,
        use_plural_override: false,
        plural_override: null,
        quantity_rounding_preset: 'nearest_eighth',
        quantity_rounding_step_denominator: null,
        quantity_rounding_mode: null,
      },
      'createUnit',
    );
    return { code };
  }

  // ---- editUnit ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editUnit.md

  async function patchUnitCodeMatches(opts, table, oldCode, newCode) {
    const rows = await pgGet(opts, `${table}?select=id,unit`, 'editUnit');
    const matches = (Array.isArray(rows) ? rows : []).filter(
      (row) => String(row?.unit ?? '') === oldCode,
    );
    for (const row of matches) {
      const rowId = intOrNull(row?.id);
      if (rowId == null || rowId <= 0) continue;
      await pgPatch(
        opts,
        `${table}?id=eq.${encodeURIComponent(String(rowId))}`,
        { unit: newCode },
        'editUnit',
      );
    }
  }

  async function editUnit(opts, request = {}) {
    const oldCode = trimStr(request?.oldCode ?? request?.old_code).toLowerCase();
    const code = trimStr(request?.code ?? request?.unitCode).toLowerCase();
    if (!oldCode) {
      throw new Error('editUnit: old unit code is required.');
    }
    if (!code) {
      throw new Error('editUnit: unit code is required.');
    }
    const nameSingular = trimStr(
      request?.nameSingular ?? request?.name_singular,
    );
    const namePlural = trimStr(request?.namePlural ?? request?.name_plural);
    const usePluralOverride = toBool(
      request?.usePluralOverride ?? request?.use_plural_override,
    );
    const pluralOverrideRaw = trimStr(
      request?.pluralOverride ?? request?.plural_override,
    );
    const quantityRoundingPreset = normalizeQuantityRoundingPresetValue(
      request?.quantityRoundingPreset ?? request?.quantity_rounding_preset,
    );
    let stepDenom = intOrNull(
      request?.quantityRoundingStepDenominator ??
        request?.quantity_rounding_step_denominator,
    );
    const modeRaw = trimStr(
      request?.quantityRoundingMode ?? request?.quantity_rounding_mode,
    ).toLowerCase();
    let quantityRoundingMode =
      modeRaw === 'up' || modeRaw === 'down' || modeRaw === 'nearest'
        ? modeRaw
        : null;
    if (quantityRoundingPreset === 'system_measured') {
      stepDenom = null;
      quantityRoundingMode = null;
    } else if (quantityRoundingPreset !== 'custom') {
      stepDenom = null;
      quantityRoundingMode = null;
    } else if (
      stepDenom == null ||
      !Number.isFinite(stepDenom) ||
      ![1, 2, 3, 4, 8, 12].includes(stepDenom) ||
      !quantityRoundingMode
    ) {
      throw new Error(
        'editUnit: custom quantity rounding requires step denominator (1,2,3,4,8,12) and mode (nearest, up, down).',
      );
    } else if (stepDenom === 12 && quantityRoundingMode !== 'nearest') {
      throw new Error(
        'editUnit: step denominator 12 (¼ & ⅓ grid) requires nearest rounding.',
      );
    }
    const pluralOverrideOut =
      usePluralOverride && pluralOverrideRaw ? pluralOverrideRaw : null;
    const isHidden = toBool(request?.isHidden ?? request?.is_hidden) ? 1 : 0;
    const isRemoved = toBool(request?.isRemoved ?? request?.is_removed) ? 1 : 0;

    if (code !== oldCode) {
      await patchUnitCodeMatches(opts, 'recipe_ingredient_map', oldCode, code);
      await patchUnitCodeMatches(
        opts,
        'recipe_ingredient_substitutes',
        oldCode,
        code,
      );
    }

    await pgPatch(
      opts,
      `units?code=eq.${encodeURIComponent(oldCode)}`,
      {
        code,
        name_singular: nameSingular,
        name_plural: namePlural,
        use_plural_override: !!usePluralOverride,
        plural_override: pluralOverrideOut,
        quantity_rounding_preset: quantityRoundingPreset,
        quantity_rounding_step_denominator: stepDenom,
        quantity_rounding_mode: quantityRoundingMode,
        is_hidden: isHidden,
        is_removed: isRemoved,
      },
      'editUnit',
    );
    return { code };
  }

  // ---- removeUnit ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeUnit.md

  async function removeUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) {
      throw new Error('removeUnit: unit code is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeUnit: action must be remove or delete.');
    }
    const encodedCode = encodeURIComponent(code);
    if (action === 'remove') {
      await pgPatch(opts, `units?code=eq.${encodedCode}`, { is_removed: 1 }, 'removeUnit');
    } else {
      await pgDelete(opts, `units?code=eq.${encodedCode}`, 'removeUnit');
    }
    return { code };
  }

  // ---- countRecipesUsingUnit / listRecipesUsingUnit ------------------------
  //
  // Distinct recipes referencing a unit on recipe lines or substitutes (matches
  // legacy lower(unit) semantics for the remove/delete confirmation).

  async function recipeIdSetForUnitCode(opts, rawCode, label) {
    const code = trimStr(rawCode);
    if (!code) return new Set();
    const codeKey = code.toLowerCase();

    const [rimRows, subRows] = await Promise.all([
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,unit',
        label,
      ),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=recipe_ingredient_id,unit',
        label,
      ),
    ]);

    const recipeIds = new Set();
    const recipeIdByRimId = new Map();

    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0 && recipeId != null && recipeId > 0) {
        recipeIdByRimId.set(rimId, recipeId);
      }
      const u = trimStr(row?.unit);
      if (u.toLowerCase() !== codeKey) return;
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    (Array.isArray(subRows) ? subRows : []).forEach((row) => {
      const u = trimStr(row?.unit);
      if (u.toLowerCase() !== codeKey) return;
      const recipeId = recipeIdByRimId.get(
        intOrNull(row?.recipe_ingredient_id),
      );
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    return recipeIds;
  }

  async function countRecipesUsingUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) return 0;
    const ids = await recipeIdSetForUnitCode(
      opts,
      code,
      'countRecipesUsingUnit',
    );
    return ids.size;
  }

  async function listRecipesUsingUnit(opts, request = {}) {
    const code = trimStr(request?.code ?? request?.unitCode);
    if (!code) return [];
    const recipeIds = await recipeIdSetForUnitCode(
      opts,
      code,
      'listRecipesUsingUnit',
    );
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listRecipesUsingUnit',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- countRecipesUsingSize / listRecipesUsingSize ------------------------
  //
  // Size usage across rim.size, legacy ingredients.size on the line, and
  // recipe_ingredient_substitutes.size (matches main.js size-usage unions).

  async function recipeIdSetForSizeNameMatch(opts, rawName, label) {
    const nameKey = trimStr(rawName).toLowerCase();
    if (!nameKey) return new Set();
    const norm = (v) => trimStr(v).toLowerCase();

    const [rimRows, ingRows, subRows] = await Promise.all([
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,ingredient_id,size',
        label,
      ),
      pgGet(opts, 'ingredients?select=id,size', label),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=recipe_ingredient_id,size',
        label,
      ),
    ]);

    const ingredientSizeById = new Map();
    (Array.isArray(ingRows) ? ingRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id != null && id > 0) ingredientSizeById.set(id, row?.size);
    });

    const recipeIds = new Set();
    const recipeIdByRimId = new Map();

    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0 && recipeId != null && recipeId > 0) {
        recipeIdByRimId.set(rimId, recipeId);
      }
      if (recipeId == null || recipeId <= 0) return;
      let hit = false;
      if (norm(row?.size) === nameKey) hit = true;
      else {
        const iid = intOrNull(row?.ingredient_id);
        const legacy = ingredientSizeById.get(iid);
        if (legacy != null && norm(legacy) === nameKey) hit = true;
      }
      if (hit) recipeIds.add(recipeId);
    });

    (Array.isArray(subRows) ? subRows : []).forEach((row) => {
      if (norm(row?.size) !== nameKey) return;
      const recipeId = recipeIdByRimId.get(
        intOrNull(row?.recipe_ingredient_id),
      );
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    return recipeIds;
  }

  async function countRecipesUsingSize(opts, request = {}) {
    const name = trimStr(request?.name ?? request?.sizeName);
    if (!name) return 0;
    const ids = await recipeIdSetForSizeNameMatch(
      opts,
      name,
      'countRecipesUsingSize',
    );
    return ids.size;
  }

  async function listRecipesUsingSize(opts, request = {}) {
    const name = trimStr(request?.name ?? request?.sizeName);
    if (!name) return [];
    const recipeIds = await recipeIdSetForSizeNameMatch(
      opts,
      name,
      'listRecipesUsingSize',
    );
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listRecipesUsingSize',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- listSizes -----------------------------------------------------------
  //
  // Contract: js/data/contracts/listSizes.md

  async function listSizes(opts) {
    const rows = await pgGet(
      opts,
      'sizes?select=id,name,sort_order,is_hidden,is_removed',
      'listSizes',
    );

    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: intOrNull(row?.id),
        name: row?.name == null ? '' : String(row.name),
        sortOrder: toTagSortOrder(row?.sort_order),
        isHidden: Number(row?.is_hidden || 0) === 1,
        isRemoved: Number(row?.is_removed || 0) === 1,
      }))
      .sort(compareSizeDisplayValues);
  }

  // ---- createSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/createSize.md

  async function createSize(opts, request = {}) {
    const name = trimStr(request?.name)
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) {
      throw new Error('createSize: name is required.');
    }

    const existingRows = await pgGet(opts, 'sizes?select=sort_order', 'createSize');
    const nextSort =
      (Array.isArray(existingRows) ? existingRows : []).reduce((max, row) => {
        const n = Number(row?.sort_order);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;

    const rows = await pgPost(
      opts,
      'sizes?select=id',
      { name, sort_order: nextSort, is_hidden: 0, is_removed: 0 },
      'createSize',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createSize: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- editSize ------------------------------------------------------------
  //
  // Contract: js/data/contracts/editSize.md

  function normalizeSizeMatch(value) {
    return trimStr(value).replace(/\s+/g, ' ').toLowerCase();
  }

  async function patchSizeTextMatches(opts, table, idColumn, oldName, newName) {
    const rows = await pgGet(opts, `${table}?select=${idColumn},size`, 'editSize');
    const oldKey = normalizeSizeMatch(oldName);
    const matches = (Array.isArray(rows) ? rows : []).filter(
      (row) => normalizeSizeMatch(row?.size) === oldKey,
    );
    for (const row of matches) {
      const rowId = intOrNull(row?.[idColumn]);
      if (rowId == null || rowId <= 0) continue;
      await pgPatch(
        opts,
        `${table}?${idColumn}=eq.${encodeURIComponent(String(rowId))}`,
        { size: newName },
        'editSize',
      );
    }
  }

  async function editSize(opts, request = {}) {
    const id = Number(request?.id ?? request?.sizeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editSize: valid size id is required.');
    }
    const name = trimStr(request?.name)
      .replace(/\s+/g, ' ')
      .slice(0, 64)
      .trim();
    if (!name) {
      throw new Error('editSize: name is required.');
    }
    const sizeId = Math.trunc(id);
    const isHidden = toBool(request?.isHidden ?? request?.is_hidden) ? 1 : 0;
    const isRemoved = toBool(request?.isRemoved ?? request?.is_removed) ? 1 : 0;
    await pgPatch(
      opts,
      `sizes?id=eq.${encodeURIComponent(String(sizeId))}`,
      { name, is_hidden: isHidden, is_removed: isRemoved },
      'editSize',
    );

    const oldName = trimStr(request?.oldName).replace(/\s+/g, ' ').trim();
    if (oldName && normalizeSizeMatch(oldName) !== normalizeSizeMatch(name)) {
      await patchSizeTextMatches(opts, 'ingredients', 'id', oldName, name);
      await patchSizeTextMatches(opts, 'ingredient_sizes', 'id', oldName, name);
      await patchSizeTextMatches(
        opts,
        'recipe_ingredient_substitutes',
        'id',
        oldName,
        name,
      );
    }
    return { id: sizeId };
  }

  // ---- removeSize ----------------------------------------------------------
  //
  // Contract: js/data/contracts/removeSize.md

  async function removeSize(opts, request = {}) {
    const id = Number(request?.id ?? request?.sizeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('removeSize: valid size id is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('removeSize: action must be remove or delete.');
    }
    const sizeId = Math.trunc(id);
    const encodedId = encodeURIComponent(String(sizeId));
    if (action === 'remove') {
      await pgPatch(opts, `sizes?id=eq.${encodedId}`, { is_removed: 1 }, 'removeSize');
    } else {
      await pgDelete(opts, `sizes?id=eq.${encodedId}`, 'removeSize');
    }
    return { id: sizeId };
  }

  // ---- deleteShoppingItem --------------------------------------------------
  //
  // Contract: js/data/contracts/deleteShoppingItem.md

  async function deleteShoppingItem(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('deleteShoppingItem: name is required.');
    }
    const action = trimStr(request?.action).toLowerCase();
    if (action !== 'remove' && action !== 'delete') {
      throw new Error('deleteShoppingItem: action must be remove or delete.');
    }

    const ingredientRows = await pgGet(
      opts,
      'ingredients?select=id,name',
      'deleteShoppingItem',
    );
    const needle = name.toLowerCase();
    const ids = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter((row) => trimStr(row?.name).toLowerCase() === needle)
      .map((row) => intOrNull(row?.id))
      .filter((id) => id != null && id > 0);

    if (!ids.length) {
      return { name };
    }

    const idFilter = postgrestInList(ids);
    if (action === 'remove') {
      await pgPatch(
        opts,
        `ingredients?id=in.${idFilter}`,
        { is_deprecated: 1 },
        'deleteShoppingItem',
      );
    } else {
      await pgDelete(
        opts,
        `ingredients?id=in.${idFilter}`,
        'deleteShoppingItem',
      );
    }
    bumpListShoppingItemsAggregateGeneration();
    return { name };
  }

  // ---- listStores ----------------------------------------------------------
  //
  // Contract: js/data/contracts/listStores.md

  function compareStoreRows(a, b) {
    const aChain = asciiNocaseFold(a?.chain_name == null ? '' : String(a.chain_name));
    const bChain = asciiNocaseFold(b?.chain_name == null ? '' : String(b.chain_name));
    if (aChain < bChain) return -1;
    if (aChain > bChain) return 1;
    const aLocation = asciiNocaseFold(
      a?.location_name == null ? '' : String(a.location_name),
    );
    const bLocation = asciiNocaseFold(
      b?.location_name == null ? '' : String(b.location_name),
    );
    if (aLocation < bLocation) return -1;
    if (aLocation > bLocation) return 1;
    return 0;
  }

  async function listStores(opts) {
    const rows = await pgGet(
      opts,
      'stores?select=id,chain_name,location_name',
      'listStores',
    );

    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(compareStoreRows)
      .map((row) => ({
        id: intOrNull(row?.id),
        chain: row?.chain_name == null ? '' : String(row.chain_name),
        location: row?.location_name == null ? '' : String(row.location_name),
      }));
  }

  // ---- createStore ---------------------------------------------------------

  async function createStore(opts, request = {}) {
    const chain = trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' ');
    if (!chain) {
      throw new Error('createStore: chain name is required.');
    }
    const location = trimStr(request?.location ?? request?.locationName).replace(
      /\s+/g,
      ' ',
    );
    const rows = await pgPost(
      opts,
      'stores?select=id',
      { chain_name: chain, location_name: location },
      'createStore',
    );
    const newId = Number(rows[0]?.id);
    if (!Number.isFinite(newId) || newId <= 0) {
      throw new Error('createStore: Supabase did not return a valid new id.');
    }
    return { id: newId };
  }

  // ---- deleteStore ---------------------------------------------------------

  async function deleteStore(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('deleteStore: valid store id is required.');
    }
    const storeId = Math.trunc(id);
    const encodedStoreId = encodeURIComponent(String(storeId));
    const locationRows = await pgGet(
      opts,
      `store_locations?select=id&store_id=eq.${encodedStoreId}`,
      'deleteStore',
    );
    const locationIds = (Array.isArray(locationRows) ? locationRows : [])
      .map((row) => intOrNull(row?.id))
      .filter((locationId) => locationId != null && locationId > 0);

    if (locationIds.length) {
      const locationFilter = postgrestInList(locationIds);
      await pgDelete(
        opts,
        `ingredient_store_location?store_location_id=in.${locationFilter}`,
        'deleteStore',
      );
      await pgDelete(
        opts,
        `ingredient_variant_store_location?store_location_id=in.${locationFilter}`,
        'deleteStore',
      );
    }

    await pgDelete(
      opts,
      `store_locations?store_id=eq.${encodedStoreId}`,
      'deleteStore',
    );
    await pgDelete(opts, `stores?id=eq.${encodedStoreId}`, 'deleteStore');
    return { id: storeId };
  }

  // ---- editStore -----------------------------------------------------------

  async function editStore(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('editStore: valid store id is required.');
    }
    const storeId = Math.trunc(id);
    const chain = trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' ');
    const location = trimStr(request?.location ?? request?.locationName).replace(
      /\s+/g,
      ' ',
    );
    await pgPatch(
      opts,
      `stores?id=eq.${encodeURIComponent(String(storeId))}`,
      { chain_name: chain, location_name: location },
      'editStore',
    );
    return { id: storeId };
  }

  function storeAisleSpecHasActiveNamedCatalogVariants(spec) {
    return (Array.isArray(spec?.knownVariants) ? spec.knownVariants : []).some(
      (variant) => {
        const name = trimStr(variant?.name);
        if (!name || toBool(variant?.isDeprecated)) return false;
        return isSupportedStoreVariantName(name);
      },
    );
  }

  function sanitizeStoreAisleSelectedVariantsForSave(spec) {
    const selected = (Array.isArray(spec?.selectedVariants)
      ? spec.selectedVariants
      : []
    )
      .map(trimStr)
      .filter(Boolean);
    if (storeAisleSpecHasActiveNamedCatalogVariants(spec)) {
      return selected;
    }
    return selected.filter((name) => {
      const key = normalizeStoreItemKey(name);
      return key !== 'any' && key !== 'all';
    });
  }

  async function saveStoreLayout(opts, request = {}) {
    const id = Number(request?.id ?? request?.storeId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('saveStoreLayout: valid store id is required.');
    }
    const payload = {
      id: Math.trunc(id),
      chain: trimStr(request?.chain ?? request?.chainName).replace(/\s+/g, ' '),
      location: trimStr(request?.location ?? request?.locationName).replace(/\s+/g, ' '),
      aisles: (Array.isArray(request?.aisles) ? request.aisles : [])
        .map((aisle, index) => {
          const aisleId = intOrNull(aisle?.id);
          const sortOrder = Number(aisle?.sortOrder ?? aisle?.sort_order);
          return {
            id: aisleId != null && aisleId > 0 ? aisleId : null,
            name: trimStr(aisle?.name) || 'Aisle',
            sort_order: Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : index + 1,
            item_specs: (Array.isArray(aisle?.itemSpecs) ? aisle.itemSpecs : [])
              .map((spec) => ({
                ingredient_id: intOrNull(spec?.ingredientId),
                base_name: trimStr(spec?.baseName ?? spec?.name),
                selected_variants: sanitizeStoreAisleSelectedVariantsForSave(spec),
              }))
              .filter((spec) => spec.ingredient_id || spec.base_name),
          };
        })
        .filter((aisle) => aisle.name),
    };

    await pgRpc(
      opts,
      'save_store_layout',
      { store_payload: payload },
      'saveStoreLayout',
    );
    return loadStoreDetail(opts, { storeId: payload.id });
  }

  // ---- loadStoreDetail -----------------------------------------------------
  //
  // Contract: js/data/contracts/loadStoreDetail.md

  function normalizeStoreItemKey(value) {
    return trimStr(value).toLowerCase();
  }

  function isSupportedStoreVariantName(value) {
    const v = trimStr(value);
    if (!v) return false;
    if (/[()]/.test(v)) return false;
    if (v.toLowerCase() === 'default') return false;
    return /[a-z0-9]/i.test(v);
  }

  function sortStoreDetailAisles(a, b) {
    const aSort = Number(a?.sort_order);
    const bSort = Number(b?.sort_order);
    const aRank = Number.isFinite(aSort) ? aSort : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(bSort) ? bSort : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function sortStoreCatalogIngredientRows(a, b) {
    const nameCompare = compareAsciiNocaseString(a?.name || '', b?.name || '');
    if (nameCompare !== 0) return nameCompare;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function sortStoreAisleItemSpecs(a, b) {
    const nameCompare = compareAsciiNocaseString(
      a?.baseName || '',
      b?.baseName || '',
    );
    if (nameCompare !== 0) return nameCompare;
    const aId = Number(a?.ingredientId) || 0;
    const bId = Number(b?.ingredientId) || 0;
    if (aId !== bId) return aId - bId;
    return compareAsciiNocaseString(a?.baseKey || '', b?.baseKey || '');
  }

  function sortStoreCatalogVariantRows(a, b) {
    const aIngredient = Number(a?.ingredient_id);
    const bIngredient = Number(b?.ingredient_id);
    if (aIngredient !== bIngredient) return aIngredient - bIngredient;
    const aSort = Number(a?.sort_order);
    const bSort = Number(b?.sort_order);
    const aRank = Number.isFinite(aSort) ? aSort : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(bSort) ? bSort : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }

  function buildStoreIngredientCatalogFromRows(ingredientRows, variantRows) {
    const byName = new Map();
    const byId = new Map();

    (Array.isArray(ingredientRows) ? ingredientRows : [])
      .slice()
      .sort(sortStoreCatalogIngredientRows)
      .forEach((row) => {
        const id = intOrNull(row?.id);
        const name = row?.name == null ? '' : String(row.name);
        const key = normalizeStoreItemKey(name);
        if (!id || !key || byName.has(key)) return;
        if (toBool(row?.is_deprecated) || toBool(row?.is_hidden)) {
          return;
        }
        const item = {
          ingredientId: id,
          name,
          baseKey: key,
          lemma: trimStr(row?.lemma),
          singularIfUnspecified:
            row?.singular_if_unspecified == null
              ? false
              : toBool(row.singular_if_unspecified),
          isMassNoun: toBool(row?.is_mass_noun),
          pluralOverride: trimStr(row?.plural_override),
          variants: [],
        };
        byName.set(key, item);
        byId.set(id, item);
      });

    (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort(sortStoreCatalogVariantRows)
      .forEach((row) => {
        const ingredientId = intOrNull(row?.ingredient_id);
        const id = intOrNull(row?.id);
        const name = row?.variant == null ? '' : String(row.variant);
        if (!ingredientId || !id || !isSupportedStoreVariantName(name)) return;
        const item = byId.get(ingredientId);
        if (!item) return;
        const variantKey = normalizeStoreItemKey(name);
        if (item.variants.some((v) => normalizeStoreItemKey(v.name) === variantKey)) {
          return;
        }
        item.variants.push({
          id,
          name,
          isDeprecated: toBool(row?.is_deprecated),
        });
      });

    return { byName, byId, items: Array.from(byName.values()) };
  }

  function storeKnownVariantsForCatalogItem(item) {
    return item && Array.isArray(item.variants)
      ? item.variants.map((v) => ({
          id: intOrNull(v.id),
          name: v?.name == null ? '' : String(v.name),
          isDeprecated: toBool(v?.isDeprecated),
        }))
      : [];
  }

  function makeStoreAisleItemSpec(ingredient, ingredientId = null) {
    if (!ingredient) return null;
    const numericIngredientId = intOrNull(ingredientId ?? ingredient.ingredientId);
    return {
      baseName: ingredient.name == null ? '' : String(ingredient.name),
      baseKey: ingredient.baseKey || normalizeStoreItemKey(ingredient.name),
      ingredientId: numericIngredientId,
      selectedVariants: [],
      knownVariants: storeKnownVariantsForCatalogItem(ingredient),
    };
  }

  function postgrestInList(values) {
    return `(${values.map((value) => encodeURIComponent(String(value))).join(',')})`;
  }

  async function loadStoreDetail(opts, request = {}) {
    const storeId = intOrNull(request?.storeId);
    if (!storeId) return null;

    const storeRows = await pgGet(
      opts,
      `stores?select=id,chain_name,location_name&id=eq.${encodeURIComponent(
        String(storeId),
      )}`,
      'loadStoreDetail',
    );
    if (!Array.isArray(storeRows) || !storeRows.length) return null;

    const store = storeRows[0] || {};
    const [aisleRows, ingredientRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        `store_locations?select=id,store_id,name,sort_order&store_id=eq.${encodeURIComponent(
          String(storeId),
        )}`,
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated,is_hidden,lemma,singular_if_unspecified,is_mass_noun,plural_override',
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,is_deprecated',
        'loadStoreDetail',
      ),
    ]);

    const catalog = buildStoreIngredientCatalogFromRows(ingredientRows, variantRows);
    const detail = {
      id: intOrNull(store.id),
      chain: store?.chain_name == null ? '' : String(store.chain_name),
      location: store?.location_name == null ? '' : String(store.location_name),
      aisles: (Array.isArray(aisleRows) ? aisleRows : [])
        .slice()
        .sort(sortStoreDetailAisles)
        .map((aisle) => ({
          id: intOrNull(aisle?.id),
          name: aisle?.name == null ? '' : String(aisle.name),
          itemSpecs: [],
        }))
        .filter((aisle) => aisle.id),
      ingredientCatalog: catalog.items.map((item) => ({
        ingredientId: item.ingredientId,
        name: item.name,
        baseKey: item.baseKey,
        lemma: item.lemma,
        singularIfUnspecified: item.singularIfUnspecified,
        isMassNoun: item.isMassNoun,
        pluralOverride: item.pluralOverride,
        variants: storeKnownVariantsForCatalogItem(item),
      })),
      hasVariantAisleTable: true,
    };

    const aisleIds = detail.aisles.map((aisle) => aisle.id);
    if (!aisleIds.length) return detail;

    const aisleById = new Map(detail.aisles.map((aisle) => [aisle.id, aisle]));
    const [baseLinks, variantLinks] = await Promise.all([
      pgGet(
        opts,
        `ingredient_store_location?select=id,store_location_id,ingredient_id,all_variants&store_location_id=in.${postgrestInList(
          aisleIds,
        )}`,
        'loadStoreDetail',
      ),
      pgGet(
        opts,
        `ingredient_variant_store_location?select=id,store_location_id,ingredient_variant_id&store_location_id=in.${postgrestInList(
          aisleIds,
        )}`,
        'loadStoreDetail',
      ),
    ]);

    const ingredientById = catalog.byId;
    const baseLinkKeysByAisleId = new Map();
    const allVariantsByAisleBase = new Map();
    (Array.isArray(baseLinks) ? baseLinks : [])
      .slice()
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))
      .forEach((link) => {
        const aisle = aisleById.get(intOrNull(link?.store_location_id));
        const ingredient = ingredientById.get(intOrNull(link?.ingredient_id));
        if (!aisle || !ingredient) return;
        if (!baseLinkKeysByAisleId.has(aisle.id)) {
          baseLinkKeysByAisleId.set(aisle.id, new Set());
        }
        baseLinkKeysByAisleId.get(aisle.id).add(ingredient.baseKey);
        if (toBool(link?.all_variants)) {
          allVariantsByAisleBase.set(`${aisle.id}:${ingredient.baseKey}`, true);
        }
        if (aisle.itemSpecs.some((spec) => spec.baseKey === ingredient.baseKey)) {
          return;
        }
        const spec = makeStoreAisleItemSpec(ingredient);
        if (spec) aisle.itemSpecs.push(spec);
      });

    const variantById = new Map();
    (Array.isArray(variantRows) ? variantRows : []).forEach((variant) => {
      const id = intOrNull(variant?.id);
      if (id) variantById.set(id, variant);
    });

    (Array.isArray(variantLinks) ? variantLinks : [])
      .slice()
      .sort((a, b) => {
        const aId = Number(a?.id) || 0;
        const bId = Number(b?.id) || 0;
        if (aId !== bId) return aId - bId;
        const aVariant = variantById.get(intOrNull(a?.ingredient_variant_id));
        const bVariant = variantById.get(intOrNull(b?.ingredient_variant_id));
        return sortStoreCatalogVariantRows(aVariant, bVariant);
      })
      .forEach((link) => {
        const aisle = aisleById.get(intOrNull(link?.store_location_id));
        const variant = variantById.get(intOrNull(link?.ingredient_variant_id));
        const ingredient = variant ? ingredientById.get(intOrNull(variant.ingredient_id)) : null;
        const variantName = variant?.variant == null ? '' : String(variant.variant);
        if (!aisle || !ingredient || !isSupportedStoreVariantName(variantName)) return;
        let spec = aisle.itemSpecs.find((item) => item.baseKey === ingredient.baseKey);
        if (!spec) {
          spec = makeStoreAisleItemSpec(ingredient);
          if (!spec) return;
          aisle.itemSpecs.push(spec);
        }
        const variantKey = normalizeStoreItemKey(variantName);
        if (
          !spec.selectedVariants.some(
            (name) => normalizeStoreItemKey(name) === variantKey,
          )
        ) {
          spec.selectedVariants.push(variantName);
        }
      });

    const STORE_AISLE_ANY_VARIANT_TOKEN = 'any';
    const STORE_AISLE_ALL_VARIANT_TOKEN = 'all';
    const isStoreAisleReservedVariantToken = (name) => {
      const key = normalizeStoreItemKey(name);
      return (
        key === STORE_AISLE_ANY_VARIANT_TOKEN ||
        key === STORE_AISLE_ALL_VARIANT_TOKEN
      );
    };
    detail.aisles.forEach((aisle) => {
      const baseKeys = baseLinkKeysByAisleId.get(aisle.id);
      aisle.itemSpecs.forEach((spec) => {
        const catalogItem = catalog.byName.get(spec.baseKey);
        const activeVariantNames = (catalogItem?.variants || [])
          .filter(
            (variant) =>
              !toBool(variant?.isDeprecated) &&
              isSupportedStoreVariantName(variant?.name),
          )
          .map((variant) => String(variant.name));
        const hasActiveNamedCatalogVariants = activeVariantNames.length > 0;
        if (!hasActiveNamedCatalogVariants) {
          spec.selectedVariants = (Array.isArray(spec.selectedVariants)
            ? spec.selectedVariants
            : []
          ).filter((name) => !isStoreAisleReservedVariantToken(name));
          return;
        }
        const hasBase = !!baseKeys?.has(spec.baseKey);
        const hasAllVariantsIntent = !!allVariantsByAisleBase.get(
          `${aisle.id}:${spec.baseKey}`,
        );
        if (hasAllVariantsIntent) {
          spec.selectedVariants = [STORE_AISLE_ALL_VARIANT_TOKEN];
          return;
        }
        if (
          !hasBase ||
          !Array.isArray(spec.selectedVariants) ||
          !spec.selectedVariants.length
        ) {
          return;
        }
        const hasAny = spec.selectedVariants.some(
          (name) =>
            normalizeStoreItemKey(name) === STORE_AISLE_ANY_VARIANT_TOKEN,
        );
        if (!hasAny) {
          spec.selectedVariants.unshift(STORE_AISLE_ANY_VARIANT_TOKEN);
        }
      });
      aisle.itemSpecs.sort(sortStoreAisleItemSpecs);
    });

    return detail;
  }

  // Legacy wire encoding: NUL was replaced with U+001F for Postgres; aggregate keys now use U+001E in-app.
  const SHOPPING_STATE_NUL_SENTINEL = '\u001f';

  function shoppingStateEncodeNulForPostgres(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.indexOf('\u0000') === -1
        ? value
        : value.replace(/\u0000/g, SHOPPING_STATE_NUL_SENTINEL);
    }
    if (Array.isArray(value)) {
      return value.map((v) => shoppingStateEncodeNulForPostgres(v));
    }
    if (typeof value === 'object') {
      const out = {};
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') continue;
        const encodedKey =
          key.indexOf('\u0000') === -1
            ? key
            : key.replace(/\u0000/g, SHOPPING_STATE_NUL_SENTINEL);
        out[encodedKey] = shoppingStateEncodeNulForPostgres(value[key]);
      }
      return out;
    }
    return value;
  }

  function shoppingStateDecodeNulFromPostgres(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.indexOf(SHOPPING_STATE_NUL_SENTINEL) === -1
        ? value
        : value.replace(/\u001f/g, '\u0000');
    }
    if (Array.isArray(value)) {
      return value.map((v) => shoppingStateDecodeNulFromPostgres(v));
    }
    if (typeof value === 'object') {
      const out = {};
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') continue;
        const decodedKey =
          key.indexOf(SHOPPING_STATE_NUL_SENTINEL) === -1
            ? key
            : key.replace(/\u001f/g, '\u0000');
        out[decodedKey] = shoppingStateDecodeNulFromPostgres(value[key]);
      }
      return out;
    }
    return value;
  }

  async function loadShoppingState(opts) {
    const state = await pgRpc(opts, 'load_shopping_state', {}, 'loadShoppingState');
    const obj = state && typeof state === 'object' ? state : {};
    return shoppingStateDecodeNulFromPostgres(obj);
  }

  function normalizeShoppingRevisionsPayload(rawRevisions) {
    const revisions =
      rawRevisions && typeof rawRevisions === 'object' ? rawRevisions : {};
    return {
      planUpdatedAt:
        revisions.planUpdatedAt != null ? String(revisions.planUpdatedAt) : null,
      listSessionUpdatedAt:
        revisions.listSessionUpdatedAt != null
          ? String(revisions.listSessionUpdatedAt)
          : null,
      catalogUpdatedAt:
        revisions.catalogUpdatedAt != null
          ? String(revisions.catalogUpdatedAt)
          : null,
    };
  }

  async function loadShoppingListScreen(opts) {
    const result = await pgRpc(
      opts,
      'load_shopping_list_screen',
      {},
      'loadShoppingListScreen',
    );
    const obj = result && typeof result === 'object' ? result : {};
    const state = {
      plan: obj.plan,
      shoppingListDoc: obj.shoppingListDoc,
    };
    const decoded = shoppingStateDecodeNulFromPostgres(state);
    return {
      revisions: normalizeShoppingRevisionsPayload(obj.revisions),
      plan: decoded.plan,
      shoppingListDoc: decoded.shoppingListDoc,
      recipeSummaries: Array.isArray(obj.recipeSummaries)
        ? obj.recipeSummaries
        : [],
    };
  }

  function seedListShoppingItemsAggregateCache(opts, rows) {
    if (!Array.isArray(rows)) return;
    listShoppingItemsLastRows = rows;
    listShoppingItemsLastMemoryHitAt = Date.now();
    listShoppingItemsLastServedRev = listShoppingItemsCatalogRev;
    tryWriteListShoppingItemsSession(opts, rows);
  }

  async function loadItemsScreen(opts, request = {}) {
    const includePlan =
      !request || request.includePlan == null
        ? true
        : request.includePlan !== false;
    const result = await pgRpc(
      opts,
      'load_items_screen',
      { p_include_plan: includePlan },
      'loadItemsScreen',
    );
    const obj = result && typeof result === 'object' ? result : {};
    const catalog =
      obj.catalog && typeof obj.catalog === 'object' ? obj.catalog : {};
    const items = buildListShoppingItemsFromCatalogTables({
      ingredientRows: catalog.ingredients,
      variantRows: catalog.ingredient_variants,
      tagRows: catalog.tags,
      mapRows: catalog.ingredient_variant_tag_map,
      rimRows: catalog.recipe_ingredient_map,
      substituteRows: catalog.recipe_ingredient_substitutes,
      itemAisleRows: catalog.ingredient_store_location,
      variantAisleRows: catalog.ingredient_variant_store_location,
    });
    seedListShoppingItemsAggregateCache(opts, items);
    const decoded = includePlan
      ? shoppingStateDecodeNulFromPostgres({
          plan: obj.plan,
          shoppingListDoc: obj.shoppingListDoc,
        })
      : { plan: null, shoppingListDoc: null };
    return {
      revisions: normalizeShoppingRevisionsPayload(obj.revisions),
      plan: decoded.plan,
      shoppingListDoc: decoded.shoppingListDoc,
      items,
      catalogBundle: catalog,
    };
  }

  async function loadRecipesScreen(opts, request = {}) {
    const includePlan =
      !request || request.includePlan == null
        ? true
        : request.includePlan !== false;
    const planUpdatedAt =
      includePlan && request && request.planUpdatedAt != null
        ? String(request.planUpdatedAt)
        : null;
    const result = await pgRpc(
      opts,
      'load_recipes_screen',
      { p_plan_updated_at: planUpdatedAt, p_include_plan: includePlan },
      'loadRecipesScreen',
    );
    const obj = result && typeof result === 'object' ? result : {};
    const rawRecipes = Array.isArray(obj.recipes) ? obj.recipes : [];
    const recipes = sortByTitleNocase(
      rawRecipes
        .map((row) => transformRecipeRow(row))
        .filter((row) => row != null),
    );
    const planUnchanged = includePlan && !!obj.planUnchanged;
    const state = planUnchanged
      ? {}
      : {
          plan: obj.plan,
          shoppingListDoc: obj.shoppingListDoc,
        };
    const decoded = shoppingStateDecodeNulFromPostgres(state);
    return {
      revisions: normalizeShoppingRevisionsPayload(obj.revisions),
      planUnchanged,
      recipes,
      plan: planUnchanged ? null : decoded.plan,
      shoppingListDoc: planUnchanged ? null : decoded.shoppingListDoc,
    };
  }

  let getShoppingRevisionsInflight = null;

  async function getShoppingRevisions(opts) {
    if (getShoppingRevisionsInflight) {
      return getShoppingRevisionsInflight;
    }
    getShoppingRevisionsInflight = (async () => {
      try {
        const result = await pgRpc(
          opts,
          'get_shopping_revisions',
          {},
          'getShoppingRevisions',
        );
        const obj = result && typeof result === 'object' ? result : {};
        return {
          planUpdatedAt:
            obj.planUpdatedAt != null ? String(obj.planUpdatedAt) : null,
          listSessionUpdatedAt:
            obj.listSessionUpdatedAt != null
              ? String(obj.listSessionUpdatedAt)
              : null,
          catalogUpdatedAt:
            obj.catalogUpdatedAt != null ? String(obj.catalogUpdatedAt) : null,
        };
      } finally {
        getShoppingRevisionsInflight = null;
      }
    })();
    return getShoppingRevisionsInflight;
  }

  async function saveShoppingState(opts, request = {}, saveOptions = {}) {
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(request, 'plan')) {
      payload.plan = request.plan;
    }
    if (Object.prototype.hasOwnProperty.call(request, 'shoppingListDoc')) {
      payload.shoppingListDoc = request.shoppingListDoc;
    }
    if (saveOptions.allowEmptyPlanRemoteSave) {
      payload.allowEmpty = true;
    }
    const state_payload = shoppingStateEncodeNulForPostgres(payload);
    return pgRpc(
      opts,
      'save_shopping_state',
      { state_payload },
      'saveShoppingState',
    );
  }

  async function saveShoppingPlan(opts, plan, saveOptions = {}) {
    const plan_payload = shoppingStateEncodeNulForPostgres(plan);
    const result = await pgRpc(
      opts,
      'save_shopping_plan',
      {
        plan_payload,
        allow_empty: !!saveOptions.allowEmptyPlanRemoteSave,
      },
      'saveShoppingPlan',
    );
    const obj = result && typeof result === 'object' ? result : {};
    const decoded = shoppingStateDecodeNulFromPostgres(obj);
    return {
      plan: decoded.plan,
      planUpdatedAt:
        decoded.planUpdatedAt != null ? String(decoded.planUpdatedAt) : null,
      planVersion:
        decoded.planVersion != null ? Number(decoded.planVersion) : null,
    };
  }

  async function listPlanSessions(opts) {
    const result = await pgRpc(opts, 'list_plan_sessions', {}, 'listPlanSessions');
    const obj = result && typeof result === 'object' ? result : {};
    return {
      named: Array.isArray(obj.named) ? obj.named : [],
      auto: Array.isArray(obj.auto) ? obj.auto : [],
      activeNamedSnapshotId:
        obj.activeNamedSnapshotId != null
          ? Number(obj.activeNamedSnapshotId)
          : null,
      hasNamedSnapshot: !!obj.hasNamedSnapshot,
    };
  }

  async function createNamedPlanSession(opts, name) {
    const result = await pgRpc(
      opts,
      'create_named_plan_session',
      { p_name: String(name || '') },
      'createNamedPlanSession',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function updateNamedPlanSession(opts, snapshotId, name) {
    const result = await pgRpc(
      opts,
      'update_named_plan_session',
      {
        p_snapshot_id: Number(snapshotId),
        p_name: name != null ? String(name) : null,
      },
      'updateNamedPlanSession',
    );
    return result && typeof result === 'object' ? result : {};
  }

  function isCreateAutoPlanSessionCaptureRpcMissing(err) {
    const msg = String(err && err.message ? err.message : err || '');
    return (
      msg.includes('PGRST202') ||
      msg.includes('create_auto_plan_session(p_list_overrides_state, p_plan_state)') ||
      msg.includes('create_auto_plan_session(p_plan_state, p_list_overrides_state)')
    );
  }

  async function createAutoPlanSession(opts, capture) {
    const body = {};
    if (capture && typeof capture === 'object') {
      if (capture.planState != null) {
        body.p_plan_state = shoppingStateEncodeNulForPostgres(capture.planState);
      }
      if (capture.listOverridesState != null) {
        body.p_list_overrides_state = shoppingStateEncodeNulForPostgres(
          capture.listOverridesState,
        );
      }
    }
    const hasCapturePayload =
      Object.prototype.hasOwnProperty.call(body, 'p_plan_state') ||
      Object.prototype.hasOwnProperty.call(body, 'p_list_overrides_state');
    try {
      const result = await pgRpc(
        opts,
        'create_auto_plan_session',
        body,
        'createAutoPlanSession',
      );
      return result && typeof result === 'object' ? result : {};
    } catch (err) {
      if (hasCapturePayload && isCreateAutoPlanSessionCaptureRpcMissing(err)) {
        const legacyResult = await pgRpc(
          opts,
          'create_auto_plan_session',
          {},
          'createAutoPlanSession',
        );
        return legacyResult && typeof legacyResult === 'object' ? legacyResult : {};
      }
      throw err;
    }
  }

  async function loadPlanSession(opts, snapshotId) {
    const result = await pgRpc(
      opts,
      'load_plan_session',
      { p_snapshot_id: Number(snapshotId) },
      'loadPlanSession',
    );
    const obj = result && typeof result === 'object' ? result : {};
    const decodedState =
      obj.shoppingState && typeof obj.shoppingState === 'object'
        ? shoppingStateDecodeNulFromPostgres(obj.shoppingState)
        : null;
    return {
      snapshotId:
        obj.snapshotId != null ? Number(obj.snapshotId) : Number(snapshotId),
      snapshotKind:
        obj.snapshotKind != null ? String(obj.snapshotKind) : null,
      snapshotName:
        obj.snapshotName != null ? String(obj.snapshotName) : null,
      activeNamedSnapshotId:
        obj.activeNamedSnapshotId != null
          ? Number(obj.activeNamedSnapshotId)
          : null,
      contentFingerprint:
        obj.contentFingerprint != null ? String(obj.contentFingerprint) : null,
      plan: obj.plan,
      planUpdatedAt:
        obj.planUpdatedAt != null ? String(obj.planUpdatedAt) : null,
      planVersion:
        obj.planVersion != null ? Number(obj.planVersion) : null,
      shoppingState: decodedState,
    };
  }

  async function deletePlanSession(opts, snapshotId) {
    const result = await pgRpc(
      opts,
      'delete_plan_session',
      { p_snapshot_id: Number(snapshotId) },
      'deletePlanSession',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function rewritePlanItemKeys(opts, request = {}) {
    const rewrites = Array.isArray(request?.rewrites) ? request.rewrites : [];
    const result = await pgRpc(
      opts,
      'rewrite_plan_item_keys',
      { rewrites },
      'rewritePlanItemKeys',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function patchShoppingListSourceKeys(opts, request = {}) {
    const keyMap =
      request?.keyMap && typeof request.keyMap === 'object'
        ? request.keyMap
        : {};
    const result = await pgRpc(
      opts,
      'patch_shopping_list_source_keys',
      { key_map: keyMap },
      'patchShoppingListSourceKeys',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function uncheckAllShoppingListRows(opts) {
    const result = await pgRpc(
      opts,
      'uncheck_all_shopping_list_rows',
      {},
      'uncheckAllShoppingListRows',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function applyShoppingListSourcedRowsSync(opts, request = {}) {
    const sourcedRows = Array.isArray(request?.sourcedRows)
      ? request.sourcedRows
      : [];
    const result = await pgRpc(
      opts,
      'apply_shopping_list_sourced_rows_sync',
      { sourced_rows: sourcedRows },
      'applyShoppingListSourcedRowsSync',
    );
    return result && typeof result === 'object' ? result : {};
  }

  async function restoreRemovedShoppingListRows(opts) {
    const result = await pgRpc(
      opts,
      'restore_removed_shopping_list_rows',
      {},
      'restoreRemovedShoppingListRows',
    );
    return result && typeof result === 'object' ? result : {};
  }

  // Per-row checkbox write. Updates exactly one shopping list row, instead of
  // delete-and-reinsert via save_shopping_state, so two devices toggling
  // different boxes can never wipe each other.
  async function setShoppingListRowChecked(opts, request = {}) {
    const rowId = String(request?.rowId || '').trim();
    if (!rowId) {
      throw new Error('setShoppingListRowChecked requires rowId');
    }
    const checked = !!request?.checked;
    return pgRpc(
      opts,
      'set_shopping_list_row_checked',
      { p_row_id: rowId, p_checked: checked },
      'setShoppingListRowChecked',
    );
  }

  // Per-row plan.selected_items quantity write (Items planner stepper).
  // Charter §E: returns { ok, updated_at } so the client can suppress same-
  // device echoes and drop stale realtime payloads per-key.
  async function setPlanItemQuantity(opts, request = {}) {
    const itemKey = String(request?.itemKey || '').trim();
    if (!itemKey) {
      throw new Error('setPlanItemQuantity requires itemKey');
    }
    const quantityRaw = Number(request?.quantity);
    const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
    const body = {
      p_item_key: itemKey,
      p_quantity: quantity,
      p_quantity_unspecified: request?.quantityUnspecified === true,
    };
    if (request && Object.prototype.hasOwnProperty.call(request, 'name')) {
      body.p_name = request.name == null ? null : String(request.name);
    }
    if (
      request &&
      Object.prototype.hasOwnProperty.call(request, 'variantName')
    ) {
      body.p_variant_name =
        request.variantName == null ? null : String(request.variantName);
    }
    if (
      request &&
      Object.prototype.hasOwnProperty.call(request, 'ingredientVariantId')
    ) {
      const raw = Number(request.ingredientVariantId);
      body.p_ingredient_variant_id =
        Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
    }
    return pgRpc(
      opts,
      'set_plan_item_quantity',
      body,
      'setPlanItemQuantity',
    );
  }

  // Per-row plan.selected_recipes.servings_override write (Recipes planner).
  // Charter §E: returns { ok, updated_at }. Does NOT add/remove recipes from
  // the plan; use catalog.save_shopping_plan for plan-membership changes.
  async function setPlanRecipeServingsOverride(opts, request = {}) {
    const recipeIdRaw = Number(request?.recipeId);
    if (!Number.isFinite(recipeIdRaw) || recipeIdRaw <= 0) {
      throw new Error('setPlanRecipeServingsOverride requires recipeId');
    }
    const overrideRaw = request?.servingsOverride;
    let p_servings_override = null;
    if (overrideRaw != null) {
      const n = Number(overrideRaw);
      p_servings_override = Number.isFinite(n) ? n : null;
    }
    return pgRpc(
      opts,
      'set_plan_recipe_servings_override',
      {
        p_recipe_id: Math.trunc(recipeIdRaw),
        p_servings_override,
      },
      'setPlanRecipeServingsOverride',
    );
  }

  // Per-row recipe root quantity write for Recipes planner remove/restore.
  async function setPlanRecipeQuantity(opts, request = {}) {
    const recipeIdRaw = Number(request?.recipeId);
    if (!Number.isFinite(recipeIdRaw) || recipeIdRaw <= 0) {
      throw new Error('setPlanRecipeQuantity requires recipeId');
    }
    const quantityRaw = Number(request?.quantity);
    const body = {
      p_recipe_id: Math.trunc(recipeIdRaw),
      p_quantity: Number.isFinite(quantityRaw) ? quantityRaw : 0,
    };
    if (request && Object.prototype.hasOwnProperty.call(request, 'title')) {
      body.p_title = request.title == null ? null : String(request.title);
    }
    if (
      request &&
      Object.prototype.hasOwnProperty.call(request, 'servingsOverride')
    ) {
      const raw = Number(request.servingsOverride);
      body.p_servings_override =
        Number.isFinite(raw) && raw > 0 ? raw : null;
    }
    return pgRpc(
      opts,
      'set_plan_recipe_quantity',
      body,
      'setPlanRecipeQuantity',
    );
  }

  // Per-row shopping list line text (generated override or list.manual_rows row).
  async function setShoppingListRowText(opts, request = {}) {
    const rowId = String(request?.rowId || '').trim();
    if (!rowId) {
      throw new Error('setShoppingListRowText requires rowId');
    }
    const text = request?.text != null ? String(request.text) : '';
    return pgRpc(
      opts,
      'set_shopping_list_row_text',
      { p_row_id: rowId, p_text: text },
      'setShoppingListRowText',
    );
  }

  // Per-row shopping list remove/restore placement.
  async function setShoppingListRowRemoved(opts, request = {}) {
    const rowId = String(request?.rowId || '').trim();
    if (!rowId) {
      throw new Error('setShoppingListRowRemoved requires rowId');
    }
    const removed = !!request?.removed;
    return pgRpc(
      opts,
      'set_shopping_list_row_removed',
      { p_row_id: rowId, p_removed: removed },
      'setShoppingListRowRemoved',
    );
  }

  // Per-row shopping list store/aisle/order placement override.
  async function setShoppingListRowPlacement(opts, request = {}) {
    const rowId = String(request?.rowId || '').trim();
    if (!rowId) {
      throw new Error('setShoppingListRowPlacement requires rowId');
    }
    const storeIdRaw = Math.trunc(Number(request?.storeId));
    const aisleIdRaw = Math.trunc(Number(request?.aisleId));
    const aisleSortOrderRaw = Number(request?.aisleSortOrder);
    const orderRaw = Number(request?.order);
    const body = {
      p_row_id: rowId,
      p_store_label: request?.storeLabel != null ? String(request.storeLabel) : '',
      p_bucket_label:
        request?.bucketLabel != null ? String(request.bucketLabel) : '',
    };
    if (
      request?.storeId != null &&
      String(request.storeId).trim() !== '' &&
      Number.isFinite(storeIdRaw) &&
      storeIdRaw > 0
    ) {
      body.p_store_id = storeIdRaw;
    } else {
      body.p_store_id = null;
    }
    if (
      request?.aisleId != null &&
      String(request.aisleId).trim() !== '' &&
      Number.isFinite(aisleIdRaw)
    ) {
      body.p_aisle_id = aisleIdRaw;
    } else {
      body.p_aisle_id = null;
    }
    if (
      request?.aisleSortOrder != null &&
      String(request.aisleSortOrder).trim() !== '' &&
      Number.isFinite(aisleSortOrderRaw)
    ) {
      body.p_aisle_sort_order = aisleSortOrderRaw;
    } else {
      body.p_aisle_sort_order = null;
    }
    if (
      request?.order != null &&
      String(request.order).trim() !== '' &&
      Number.isFinite(orderRaw)
    ) {
      body.p_order_index = Math.trunc(orderRaw);
    } else {
      body.p_order_index = null;
    }
    return pgRpc(
      opts,
      'set_shopping_list_row_placement',
      body,
      'setShoppingListRowPlacement',
    );
  }

  // Insert one list.manual_rows row without rewriting the whole list via save_shopping_state.
  async function appendManualShoppingListRow(opts, request = {}) {
    const text = String(request?.text || '').trim();
    if (!text) {
      throw new Error('appendManualShoppingListRow requires non-empty text');
    }
    const rowId = String(request?.rowId || '').trim();
    const body = { p_text: text };
    if (rowId) {
      body.p_row_id = rowId;
    }
    return pgRpc(
      opts,
      'append_manual_shopping_list_row',
      body,
      'appendManualShoppingListRow',
    );
  }

  // Pop one presence moniker from the cloud shoe (front door only).
  async function drawPresenceMoniker(opts, request = {}) {
    const scopeKey = trimStr(request?.scopeKey) || 'default';
    const freshDeck = Array.isArray(request?.freshDeck)
      ? request.freshDeck
          .map((entry) => String(entry == null ? '' : entry).trim())
          .filter((entry) => entry.length > 0)
      : [];
    const body = {
      p_scope: scopeKey,
      p_fresh_deck: freshDeck.length ? freshDeck : null,
    };
    const raw = await pgRpc(
      opts,
      'draw_moniker',
      body,
      'drawPresenceMoniker',
      'presence',
    );
    if (raw == null) return null;
    const moniker = String(raw).trim();
    return moniker || null;
  }

  // Browser Realtime: requires @supabase/supabase-js on the page (see recipes/shopping HTML).
  function getSupabaseRealtimeBrowserClient(opts) {
    const supabaseLib = global.supabase;
    if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
      return null;
    }
    const { url, anonKey } = getConfig(opts);
    if (!url || !anonKey) return null;
    const marker = `${url.replace(/\/+$/, '')}::realtime`;
    if (
      global.__favoriteEatsSupabaseBrowserClient &&
      global.__favoriteEatsSupabaseBrowserClientMarker === marker
    ) {
      return global.__favoriteEatsSupabaseBrowserClient;
    }
    const client = supabaseLib.createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    global.__favoriteEatsSupabaseBrowserClient = client;
    global.__favoriteEatsSupabaseBrowserClientMarker = marker;
    return client;
  }

  // Subscribe to plan.* row changes for multi-device shopping intent sync.
  function subscribePlanChanges(opts, handlers = {}) {
    const onChange =
      typeof handlers.onChange === 'function' ? handlers.onChange : () => {};
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const planHandler = (payload) => {
      try {
        onChange(payload);
      } catch (_) {}
    };
    const tables = [
      'documents',
      'selected_recipe_roots',
      'selected_recipes',
      'selected_items',
      'store_preferences',
    ];
    let channel = client.channel('favorite-eats-plan-realtime');
    for (let i = 0; i < tables.length; i += 1) {
      channel = channel.on('postgres_changes', {
        event: '*',
        schema: 'plan',
        table: tables[i],
      }, planHandler);
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribePlanChanges:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
    };
  }

  // Subscribe to list.* row changes for multi-device shopping checklist sync (checks, overrides, list.manual_rows).
  function subscribeListChanges(opts, handlers = {}) {
    const onChange =
      typeof handlers.onChange === 'function' ? handlers.onChange : () => {};
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const listHandler = (payload) => {
      try {
        onChange(payload);
      } catch (_) {}
    };
    const tables = [
      'sessions',
      'generated_rows',
      'row_overrides',
      'manual_rows',
      'conflicts',
    ];
    let channel = client.channel('favorite-eats-list-realtime');
    for (let i = 0; i < tables.length; i += 1) {
      channel = channel.on('postgres_changes', {
        event: '*',
        schema: 'list',
        table: tables[i],
      }, listHandler);
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribeListChanges:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
    };
  }

  // Live catalog recipe rows (create/update/delete) for multi-device recipe list sync.
  function subscribeRecipeCatalogChanges(opts, handlers = {}) {
    const onChange =
      typeof handlers.onChange === 'function' ? handlers.onChange : () => {};
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const channelKey =
      typeof handlers.channelKey === 'string' && handlers.channelKey.trim()
        ? handlers.channelKey.trim()
        : 'default';
    const catalogHandler = (payload) => {
      try {
        onChange(payload);
      } catch (_) {}
    };
    const channelName = `favorite-eats-catalog-recipes-realtime:${channelKey}`;
    const priorChannel = recipeCatalogRealtimeChannels.get(channelName);
    if (priorChannel) {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(priorChannel);
        } else if (typeof priorChannel.unsubscribe === 'function') {
          priorChannel.unsubscribe();
        }
      } catch (_) {}
      recipeCatalogRealtimeChannels.delete(channelName);
    }
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'catalog', table: 'recipes' },
        catalogHandler,
      );
    recipeCatalogRealtimeChannels.set(channelName, channel);
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribeRecipeCatalogChanges:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
      if (recipeCatalogRealtimeChannels.get(channelName) === channel) {
        recipeCatalogRealtimeChannels.delete(channelName);
      }
    };
  }

  // Live catalog reference data: shopping ingredients, stores, units, tags, sizes, and
  // join tables that affect listShoppingItems aggregates (tag maps, recipe links, aisles).
  // Excludes catalog.recipes (subscribeRecipeCatalogChanges) to avoid duplicate list refresh.
  function subscribeCatalogReferenceChanges(opts, handlers = {}) {
    const onChange =
      typeof handlers.onChange === 'function' ? handlers.onChange : () => {};
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const catalogRefHandler = (payload) => {
      try {
        bumpListShoppingItemsAggregateGeneration();
      } catch (_) {}
      try {
        onChange(payload);
      } catch (_) {}
    };
    const tables = [
      'ingredients',
      'ingredient_variants',
      'ingredient_synonyms',
      'stores',
      'units',
      'tags',
      'sizes',
      'ingredient_variant_tag_map',
      'recipe_tag_map',
      'recipe_ingredient_map',
      'recipe_ingredient_substitutes',
      'recipe_subrecipe_links',
      'ingredient_store_location',
      'ingredient_variant_store_location',
    ];
    let channel = client.channel('favorite-eats-catalog-reference-realtime');
    for (let i = 0; i < tables.length; i += 1) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'catalog',
          table: tables[i],
        },
        catalogRefHandler,
      );
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribeCatalogReferenceChanges:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
    };
  }

  /**
   * Ephemeral Realtime presence for the recipe editor (display-only monikers).
   * @param {object} handlers
   * @param {string} handlers.recipeId
   * @param {string} handlers.presenceKey stable id per browser tab
   * @param {string} handlers.loginSessionId stable id per splash login event
   * @param {string} handlers.moniker display label for this tab
   * @param {function(object): void} handlers.onState called with channel.presenceState()
   */
  function subscribeRecipePresence(opts, handlers = {}) {
    const onState =
      typeof handlers.onState === 'function' ? handlers.onState : () => {};
    const recipeId = handlers.recipeId != null ? String(handlers.recipeId) : '';
    const presenceKey =
      handlers.presenceKey != null ? String(handlers.presenceKey) : '';
    const loginSessionId =
      handlers.loginSessionId != null ? String(handlers.loginSessionId) : '';
    const moniker = handlers.moniker != null ? String(handlers.moniker) : '';
    if (!recipeId || !presenceKey) {
      return () => {};
    }
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const safeId = recipeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const topic = `presence_recipe_${safeId}`;
    const channel = client
      .channel(topic, {
        config: {
          presence: {
            key: presenceKey,
          },
        },
      })
      .on('presence', { event: 'sync' }, () => {
        try {
          onState(channel.presenceState());
        } catch (_) {}
      });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ moniker, loginSessionId, activeAt: Date.now() });
        } catch (err) {
          try {
            console.warn('subscribeRecipePresence track failed:', err);
          } catch (_) {}
        }
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribeRecipePresence:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
    };
  }

  /**
   * App-wide ephemeral activity presence channel (not recipe-scoped).
   * @param {object} handlers
   * @param {string} handlers.presenceKey stable id per browser tab
   * @param {string} handlers.loginSessionId stable id per splash login event
   * @param {string} handlers.moniker display label for this tab
   * @param {function(object): void} handlers.onState called with channel.presenceState()
   */
  function subscribeAppActivityPresence(opts, handlers = {}) {
    const onState =
      typeof handlers.onState === 'function' ? handlers.onState : () => {};
    const presenceKey =
      handlers.presenceKey != null ? String(handlers.presenceKey) : '';
    const loginSessionId =
      handlers.loginSessionId != null ? String(handlers.loginSessionId) : '';
    const moniker = handlers.moniker != null ? String(handlers.moniker) : '';
    if (!presenceKey) {
      return () => {};
    }
    const client = getSupabaseRealtimeBrowserClient(opts);
    if (!client || typeof client.channel !== 'function') {
      return () => {};
    }
    const channel = client
      .channel('presence_app_activity', {
        config: {
          presence: {
            key: presenceKey,
          },
        },
      })
      .on('presence', { event: 'sync' }, () => {
        try {
          onState(channel.presenceState());
        } catch (_) {}
      });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ moniker, loginSessionId, activeAt: Date.now() });
        } catch (err) {
          try {
            console.warn('subscribeAppActivityPresence track failed:', err);
          } catch (_) {}
        }
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        try {
          console.warn('subscribeAppActivityPresence:', status);
        } catch (_) {}
      }
    });
    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch (_) {}
    };
  }

  // Escape % and _ so PostgREST ilike matches the literal string (case-insensitive).
  function ilikeLiteralExact(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  function pickNameOrLemmaMatch(rows, needleLower) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => {
        const n = trimStr(row?.name).toLowerCase();
        const l = trimStr(row?.lemma).toLowerCase();
        return n === needleLower || (l && l === needleLower);
      })
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))[0];
  }

  function pickSynonymMatch(rows, needleLower) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => trimStr(row?.synonym).toLowerCase() === needleLower)
      .sort((a, b) => (Number(a?.ingredient_id) || 0) - (Number(b?.ingredient_id) || 0))[0];
  }

  // Extra lowercase needles so "tomatoes" (list/plural) finds rows stored as
  // "tomato" (singular name/lemma). Same situation as lemma vs title in the UI.
  function catalogLookupNeedleVariants(needleLc) {
    const out = [];
    if (needleLc) out.push(needleLc);
    if (needleLc.length >= 6 && needleLc.endsWith('oes')) {
      out.push(needleLc.slice(0, -2));
    }
    if (needleLc.length >= 5 && needleLc.endsWith('ies')) {
      out.push(needleLc.slice(0, -3) + 'y');
    }
    if (
      needleLc.length >= 2 &&
      needleLc.endsWith('s') &&
      !needleLc.endsWith('ss') &&
      !needleLc.endsWith('oes') &&
      !needleLc.endsWith('ies')
    ) {
      out.push(needleLc.slice(0, -1));
    }
    return [...new Set(out)];
  }

  async function tryFindIngredientByNeedleVariant(opts, needleLc) {
    const rows = await pgRpc(
      opts,
      'lookup_ingredient_by_needle',
      { p_needle: needleLc },
      'lookupShoppingItemByName',
    );
    const arr = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const row = arr[0];
    if (!row || row.id == null) return null;
    return pickNameOrLemmaMatch([row], needleLc) || null;
  }

  async function tryFindSynonymByNeedleVariant(opts, needleLc) {
    const enc = encodeURIComponent(needleLc);
    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(needleLc));
    const ilikeSubEnc = encodeURIComponent(
      `%${ilikeLiteralExact(needleLc)}%`,
    );

    let synHit = null;
    const synEq = await pgGet(
      opts,
      `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=eq.${enc}`,
      'lookupShoppingItemByName',
    );
    synHit = pickSynonymMatch(synEq, needleLc);
    if (!synHit) {
      const synIlike = await pgGet(
        opts,
        `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeEnc}`,
        'lookupShoppingItemByName',
      );
      synHit = pickSynonymMatch(synIlike, needleLc);
    }
    if (!synHit) {
      const synLoose = await pgGet(
        opts,
        `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeSubEnc}&limit=500`,
        'lookupShoppingItemByName',
      );
      synHit = pickSynonymMatch(synLoose, needleLc);
    }
    return synHit;
  }

  // ---- Shopping plan reconcile / prune (catalog reads) ---------------------
  //
  // Matches shopping reconcile helpers in js/main.js: canonical ingredient + variant rows
  // for rewriting shopping `itemSelections` keys against the live catalog.

  async function resolveCanonicalIngredientForShoppingReconcile(
    opts,
    request = {},
  ) {
    const baseLower = trimStr(request?.baseLower).toLowerCase();
    if (!baseLower) return null;

    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(baseLower));

    const ingRows = await pgGet(
      opts,
      `ingredients?select=id,name,lemma&or=(name.ilike.${ilikeEnc},lemma.ilike.${ilikeEnc})`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const hit = pickNameOrLemmaMatch(ingRows, baseLower);
    if (hit) {
      const id = intOrNull(hit.id);
      if (id != null && id > 0) {
        return { id, name: String(hit.name || '').trim() };
      }
    }

    const synRows = await pgGet(
      opts,
      `ingredient_synonyms?select=id,ingredient_id,synonym&synonym=ilike.${ilikeEnc}`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const synHit = pickSynonymMatch(synRows, baseLower);
    if (!synHit) return null;

    const ingId = intOrNull(synHit.ingredient_id);
    if (ingId == null || ingId <= 0) return null;

    const canonRows = await pgGet(
      opts,
      `ingredients?select=id,name&id=eq.${encodeURIComponent(String(ingId))}`,
      'resolveCanonicalIngredientForShoppingReconcile',
    );
    const canon = (Array.isArray(canonRows) ? canonRows : [])[0];
    const id = intOrNull(canon?.id ?? ingId);
    if (id == null || id <= 0) return null;
    return { id, name: String(canon?.name || '').trim() };
  }

  /**
   * Text aggregate keys embed an old base name; after a catalog rename,
   * {@link resolveCanonicalIngredientForShoppingReconcile} no longer resolves.
   * Check both normalized ingredient_variants and legacy ingredients.variant
   * because shopping rows can still be backed by either source.
   * When variant text is unique globally, or multiple hits disambiguate via
   * ingredient name/lemma vs stored key or entry name, return the live ingredient.
   */
  async function resolveIngredientForStaleShoppingAggregateKey(
    opts,
    request = {},
  ) {
    const keyBaseLower = trimStr(request?.keyBaseLower).toLowerCase();
    const entryNameLower = trimStr(request?.entryNameLower).toLowerCase();
    const variantNeedle =
      trimStr(
        request?.variantNeedle ||
          request?.variantPartLower ||
          request?.variantName ||
          '',
      ) || '';
    const vk = variantNeedle.toLowerCase();
    if (
      !variantNeedle ||
      !vk ||
      vk === 'default' ||
      vk === 'base' ||
      vk === 'any'
    ) {
      return null;
    }

    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(variantNeedle));
    const [vrRows, legacyIngredientRows] = await Promise.all([
      pgGet(
        opts,
        `ingredient_variants?select=id,ingredient_id,variant&variant=ilike.${ilikeEnc}`,
        'resolveIngredientForStaleShoppingAggregateKey',
      ),
      pgGet(
        opts,
        `ingredients?select=id,name,lemma,variant&variant=ilike.${ilikeEnc}`,
        'resolveIngredientForStaleShoppingAggregateKey',
      ),
    ]);
    const rows = Array.isArray(vrRows) ? vrRows : [];
    const legacyRows = Array.isArray(legacyIngredientRows)
      ? legacyIngredientRows
      : [];
    const ingredientIds = [
      ...new Set(
        rows
          .map((r) => intOrNull(r?.ingredient_id))
          .concat(legacyRows.map((r) => intOrNull(r?.id)))
          .filter((id) => id != null && id > 0)
          .map((id) => Math.trunc(Number(id))),
      ),
    ];
    if (!ingredientIds.length) return null;

    if (ingredientIds.length === 1) {
      const iid = ingredientIds[0];
      const ingRows = await pgGet(
        opts,
        `ingredients?id=eq.${encodeURIComponent(String(iid))}&select=id,name`,
        'resolveIngredientForStaleShoppingAggregateKey',
      );
      const hit = (Array.isArray(ingRows) ? ingRows : [])[0];
      const id = intOrNull(hit?.id ?? iid);
      if (id == null || id <= 0) return null;
      return { id, name: trimStr(hit?.name) };
    }

    const ingRows = await pgGet(
      opts,
      `ingredients?id=${inFilter(ingredientIds)}&select=id,name,lemma`,
      'resolveIngredientForStaleShoppingAggregateKey',
    );
    const ings = Array.isArray(ingRows) ? ingRows : [];
    const hits = ings.filter((ing) => {
      const nl = trimStr(ing?.name).toLowerCase();
      const ll = trimStr(ing?.lemma).toLowerCase();
      if (keyBaseLower && (nl === keyBaseLower || ll === keyBaseLower)) {
        return true;
      }
      if (entryNameLower && (nl === entryNameLower || ll === entryNameLower)) {
        return true;
      }
      return false;
    });
    if (hits.length !== 1) return null;
    const id = intOrNull(hits[0]?.id);
    if (id == null || id <= 0) return null;
    return { id, name: trimStr(hits[0]?.name) };
  }

  async function listIngredientVariantsWithIngredientsByIds(opts, request = {}) {
    const rawIds = request?.variantIds;
    const ids = [
      ...new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => Math.trunc(Number(id)))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) return [];
    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&id=${inFilter(ids)}`,
      'listIngredientVariantsWithIngredientsByIds',
    );
    const ingredientIds = [
      ...new Set(
        (Array.isArray(variantRows) ? variantRows : [])
          .map((r) => intOrNull(r?.ingredient_id))
          .filter((id) => id != null && id > 0),
      ),
    ];
    const ingredientRows = ingredientIds.length
      ? await pgGet(
          opts,
          `ingredients?select=id,name&id=${inFilter(ingredientIds)}`,
          'listIngredientVariantsWithIngredientsByIds',
        )
      : [];
    const ingById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      if (id != null && id > 0) ingById.set(id, row);
    });
    return (Array.isArray(variantRows) ? variantRows : [])
      .map((vr) => {
        const vid = intOrNull(vr?.id);
        const iid = intOrNull(vr?.ingredient_id);
        if (vid == null || vid <= 0 || iid == null || iid <= 0) return null;
        const ing = ingById.get(iid);
        return {
          id: vid,
          ingredient_id: iid,
          variant: vr?.variant == null ? '' : String(vr.variant).trim(),
          ingredientName: ing?.name == null ? '' : String(ing.name).trim(),
        };
      })
      .filter(Boolean);
  }

  async function listIngredientVariantsByIngredientIds(opts, request = {}) {
    const rawIds = request?.ingredientIds;
    const ids = [
      ...new Set(
        (Array.isArray(rawIds) ? rawIds : [])
          .map((id) => Math.trunc(Number(id)))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    if (!ids.length) return [];
    const rows = await pgGet(
      opts,
      `ingredient_variants?select=id,ingredient_id,variant&ingredient_id=${inFilter(ids)}`,
      'listIngredientVariantsByIngredientIds',
    );
    return Array.isArray(rows) ? rows : [];
  }

  // ---- lookupShoppingItemByName --------------------------------------------
  //
  // Contract: js/data/contracts/lookupShoppingItemByName.md
  //
  // Uses filtered PostgREST queries (not a full-table fetch). Unfiltered GETs
  // are capped (default 1000 rows) and miss matches, which caused duplicate
  // inserts in find-or-create flows.
  //
  // Matches name OR lemma, and tries plural→singular needles (tomatoes→tomato)
  // so list wording matches singular catalog rows.

  async function lookupShoppingItemByName(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) return null;

    const needle = name.toLowerCase();
    const variants = catalogLookupNeedleVariants(needle);

    for (const v of variants) {
      const direct = await tryFindIngredientByNeedleVariant(opts, v);
      if (direct) {
        const id = intOrNull(direct.id);
        if (id) {
          return {
            id,
            name: direct.name == null ? name : String(direct.name),
          };
        }
      }
    }

    for (const v of variants) {
      const synHit = await tryFindSynonymByNeedleVariant(opts, v);
      if (!synHit) continue;

      const ingId = intOrNull(synHit.ingredient_id);
      if (ingId == null || ingId <= 0) continue;

      const canonRows = await pgGet(
        opts,
        `ingredients?select=id,name&id=eq.${encodeURIComponent(String(ingId))}`,
        'lookupShoppingItemByName',
      );
      const canon = (Array.isArray(canonRows) ? canonRows : [])[0];
      const id = intOrNull(canon?.id ?? synHit.ingredient_id);
      if (id == null || id <= 0) continue;
      return {
        id,
        name: canon?.name == null ? name : String(canon.name),
      };
    }

    return null;
  }

  // ---- findOrCreateShoppingItem --------------------------------------------
  //
  // Items page "New Shopping Item": reuse catalog row by name/synonym (same
  // rules as lookupShoppingItemByName) or insert ingredients + default variant.

  async function findOrCreateShoppingItem(opts, request = {}) {
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('findOrCreateShoppingItem: name is required.');
    }
    const lemmaStr = trimStr(request?.lemma);
    const lemma = lemmaStr ? lemmaStr : null;

    const existing = await lookupShoppingItemByName(opts, { name });
    const existingId = intOrNull(existing?.id);
    if (existingId != null && existingId > 0) {
      return { id: existingId, created: false };
    }

    const body = { name };
    if (lemma) body.lemma = lemma;

    let ingRows;
    try {
      ingRows = await pgPost(
        opts,
        'ingredients?select=id',
        body,
        'findOrCreateShoppingItem',
      );
    } catch (err) {
      const text = err && err.message != null ? String(err.message) : '';
      if (/409|unique|23505|duplicate key/i.test(text)) {
        const again = await lookupShoppingItemByName(opts, { name });
        const rid = intOrNull(again?.id);
        if (rid != null && rid > 0) {
          bumpListShoppingItemsAggregateGeneration();
          return { id: rid, created: false };
        }
      }
      throw err;
    }
    const newId = intOrNull(ingRows[0]?.id);
    if (newId == null || newId <= 0) {
      throw new Error(
        'findOrCreateShoppingItem: Supabase did not return a valid new id.',
      );
    }

    try {
      await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: newId,
          variant: 'default',
          sort_order: 0,
          home_location: 'none',
          is_deprecated: false,
        },
        'findOrCreateShoppingItem',
      );
    } catch (err) {
      const text = err && err.message != null ? String(err.message) : '';
      if (/409|unique|23505|duplicate key/i.test(text)) {
        const again = await lookupShoppingItemByName(opts, { name });
        const rid = intOrNull(again?.id);
        if (rid != null && rid > 0) {
          bumpListShoppingItemsAggregateGeneration();
          return { id: rid, created: false };
        }
      }
      throw err;
    }

    bumpListShoppingItemsAggregateGeneration();
    return { id: newId, created: true };
  }

  // ---- pruneOrphanedIngredientSynonyms -------------------------------------
  //
  // Deletes ingredient_synonyms rows whose ingredient_id no longer exists in
  // ingredients (keeps the global-unique synonym namespace consistent).

  async function pruneOrphanedIngredientSynonyms(opts) {
    const raw = await pgRpc(
      opts,
      'prune_orphaned_ingredient_synonyms',
      {},
      'pruneOrphanedIngredientSynonyms',
    );
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  // ---- ensureIngredientBaseVariants -----------------------------------------
  //
  // Mirrors main.js ensureIngredientBaseVariantsInMain: each ingredient gets a
  // canonical base ingredient_variants row (`default`), legacy location_at_home
  // may migrate onto that row, then the legacy column is cleared.

  async function ensureIngredientBaseVariants(opts) {
    const BASE_VARIANT = 'default';

    function isBaseVariantNameMatch(variantText) {
      const v = trimStr(variantText).toLowerCase();
      return v === '' || v === BASE_VARIANT;
    }

    function compareBaseVariantCandidates(a, b) {
      const av = trimStr(a.variant).toLowerCase();
      const bv = trimStr(b.variant).toLowerCase();
      const rank = (x) =>
        x === BASE_VARIANT ? 0 : x === '' ? 1 : 2;
      const dr = rank(av) - rank(bv);
      if (dr !== 0) return dr;
      const as = Number(a.sort_order);
      const bs = Number(b.sort_order);
      const ar = Number.isFinite(as) ? as : 999999;
      const br = Number.isFinite(bs) ? bs : 999999;
      if (ar !== br) return ar - br;
      return (intOrNull(a.id) || 0) - (intOrNull(b.id) || 0);
    }

    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,location_at_home',
        'ensureIngredientBaseVariants',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location',
        'ensureIngredientBaseVariants',
      ),
    ]);

    const byIngredient = new Map();
    (Array.isArray(variantRows) ? variantRows : []).forEach((row) => {
      const iid = intOrNull(row.ingredient_id);
      if (iid == null || iid <= 0) return;
      if (!byIngredient.has(iid)) byIngredient.set(iid, []);
      byIngredient.get(iid).push(row);
    });

    let changedCount = 0;

    for (const ing of Array.isArray(ingredientRows) ? ingredientRows : []) {
      const ingredientId = intOrNull(ing.id ?? ing.ID);
      if (ingredientId == null || ingredientId <= 0) continue;

      const legacyHome = normalizeShoppingListHomeLocation(ing.location_at_home);

      const clearLegacyHomeIfNeeded = async () => {
        if (legacyHome === 'none') return false;
        await pgPatch(
          opts,
          `ingredients?id=eq.${encodeURIComponent(String(ingredientId))}`,
          { location_at_home: 'none' },
          'ensureIngredientBaseVariants',
        );
        return true;
      };

      const rowsForIng = (byIngredient.get(ingredientId) || []).filter((r) =>
        isBaseVariantNameMatch(r.variant),
      );
      rowsForIng.sort(compareBaseVariantCandidates);
      const baseRow = rowsForIng[0] || null;

      if (!baseRow) {
        await pgPost(
          opts,
          'ingredient_variants?select=id',
          {
            ingredient_id: ingredientId,
            variant: BASE_VARIANT,
            sort_order: 0,
            home_location: legacyHome,
            is_deprecated: false,
          },
          'ensureIngredientBaseVariants',
        );
        changedCount += (await clearLegacyHomeIfNeeded()) ? 2 : 1;
        continue;
      }

      const baseId = intOrNull(baseRow.id);
      if (baseId == null || baseId <= 0) continue;

      const currentHome = normalizeShoppingListHomeLocation(
        baseRow.home_location,
      );
      const nextHome = currentHome !== 'none' ? currentHome : legacyHome;

      const patch = {};
      if (trimStr(baseRow.variant).toLowerCase() !== BASE_VARIANT) {
        patch.variant = BASE_VARIANT;
      }
      if (Number(baseRow.sort_order) !== 0) {
        patch.sort_order = 0;
      }
      if (nextHome !== currentHome) {
        patch.home_location = nextHome;
      }

      const legacyCleared = await clearLegacyHomeIfNeeded();

      if (!Object.keys(patch).length && !legacyCleared) {
        continue;
      }

      if (Object.keys(patch).length) {
        await pgPatch(
          opts,
          `ingredient_variants?id=eq.${encodeURIComponent(String(baseId))}`,
          patch,
          'ensureIngredientBaseVariants',
        );
      }
      changedCount += legacyCleared ? 2 : 1;
    }

    return changedCount;
  }

  const CATALOG_BASE_VARIANT_KEYS = new Set(['default', 'base']);

  function isCatalogNamedVariantKey(rawKey) {
    const key = trimStr(rawKey).toLowerCase();
    return !!key && !CATALOG_BASE_VARIANT_KEYS.has(key) && key !== 'any';
  }

  async function snapshotVariantAislePlacementsForIngredient(
    opts,
    variantRowsExisting,
    label = 'snapshotVariantAislePlacementsForIngredient',
  ) {
    const variantIdToKey = new Map();
    (Array.isArray(variantRowsExisting) ? variantRowsExisting : []).forEach(
      (row) => {
        const id = intOrNull(row?.id);
        const key = trimStr(row?.variant).toLowerCase();
        if (id == null || id <= 0 || !isCatalogNamedVariantKey(key)) return;
        variantIdToKey.set(id, key);
      },
    );
    if (!variantIdToKey.size) return [];

    const linkRows = await pgGet(
      opts,
      `ingredient_variant_store_location?select=ingredient_variant_id,store_location_id&ingredient_variant_id=${inFilter(
        Array.from(variantIdToKey.keys()),
      )}`,
      label,
    );
    const seen = new Set();
    const placements = [];
    (Array.isArray(linkRows) ? linkRows : []).forEach((row) => {
      const vid = intOrNull(row?.ingredient_variant_id);
      const aisleId = intOrNull(row?.store_location_id);
      const variantKey = variantIdToKey.get(vid);
      if (!variantKey || aisleId == null || aisleId <= 0) return;
      const dedupeKey = `${aisleId}:${variantKey}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      placements.push({ aisleId, variantKey });
    });
    return placements;
  }

  async function restoreVariantAislePlacements(
    opts,
    placements,
    variantKeyToId,
    incomingNamedKeys,
    label = 'restoreVariantAislePlacements',
  ) {
    const seen = new Set();
    for (const placement of Array.isArray(placements) ? placements : []) {
      const variantKey = trimStr(placement?.variantKey).toLowerCase();
      if (!isCatalogNamedVariantKey(variantKey)) continue;
      if (!incomingNamedKeys.has(variantKey)) continue;
      const newVariantId = variantKeyToId.get(variantKey);
      if (newVariantId == null || newVariantId <= 0) continue;
      const aisleId = intOrNull(placement?.aisleId);
      if (aisleId == null || aisleId <= 0) continue;
      const dedupeKey = `${aisleId}:${newVariantId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      // Idempotent: all_variants store aisles auto-link new variants via DB trigger
      // (ingredient_variants_sync_all_variant_store_links) on insert.
      await pgPost(
        opts,
        'ingredient_variant_store_location?select=id',
        {
          ingredient_variant_id: newVariantId,
          store_location_id: aisleId,
        },
        label,
        {
          onConflictIgnore: [
            'ingredient_variant_id',
            'store_location_id',
          ],
        },
      );
    }
  }

  async function promoteVariantOnlyAislePlacementsToBase(
    opts,
    ingredientId,
    removedAisleLinkRows,
    label = 'promoteVariantOnlyAislePlacementsToBase',
    excludeVariantIds = [],
  ) {
    const aisleIds = new Set();
    for (const row of Array.isArray(removedAisleLinkRows) ? removedAisleLinkRows : []) {
      const aisleId = intOrNull(row?.store_location_id ?? row?.aisleId ?? row);
      if (aisleId != null && aisleId > 0) aisleIds.add(aisleId);
    }
    if (!aisleIds.size) return;

    const excludedVariantIds = new Set(
      (Array.isArray(excludeVariantIds) ? excludeVariantIds : [])
        .map((id) => intOrNull(id))
        .filter((id) => id != null && id > 0),
    );

    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id&ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      label,
    );
    const variantIds = (Array.isArray(variantRows) ? variantRows : [])
      .map((row) => intOrNull(row?.id))
      .filter((id) => id != null && id > 0);

    for (const aisleId of aisleIds) {
      const baseRows = await pgGet(
        opts,
        `ingredient_store_location?select=id&ingredient_id=eq.${encodeURIComponent(
          String(ingredientId),
        )}&store_location_id=eq.${encodeURIComponent(String(aisleId))}&limit=1`,
        label,
      );
      if (Array.isArray(baseRows) && baseRows.length) continue;

      const remainingVariantIds = variantIds.filter((id) => !excludedVariantIds.has(id));
      if (remainingVariantIds.length) {
        const variantFilter = inFilter(remainingVariantIds);
        const stillLinked = await pgGet(
          opts,
          `ingredient_variant_store_location?select=id&store_location_id=eq.${encodeURIComponent(
            String(aisleId),
          )}&ingredient_variant_id=${variantFilter}&limit=1`,
          label,
        );
        if (Array.isArray(stillLinked) && stillLinked.length) continue;
      }

      await pgPost(
        opts,
        'ingredient_store_location?select=id',
        {
          ingredient_id: ingredientId,
          store_location_id: aisleId,
          all_variants: false,
        },
        label,
      );
    }
  }

  async function deleteCatalogNamedVariantRecordsViaJsFallback(
    opts,
    ingredientId,
    variantName,
    label = 'deleteCatalogNamedVariantRecords',
    extraOpts = {},
  ) {
    const variantKey = trimStr(variantName).toLowerCase();
    if (
      !Number.isFinite(ingredientId) ||
      ingredientId <= 0 ||
      !isCatalogNamedVariantKey(variantKey)
    ) {
      return 0;
    }
    const variantRows = await pgGet(
      opts,
      `ingredient_variants?select=id,variant&ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      label,
    );
    const matchingIds = (Array.isArray(variantRows) ? variantRows : [])
      .filter((row) => trimStr(row?.variant).toLowerCase() === variantKey)
      .map((row) => intOrNull(row?.id))
      .filter((id) => id != null && id > 0);
    if (!matchingIds.length) return 0;
    const idFilter = inFilter(matchingIds);
    const removedAisleLinks = await pgGet(
      opts,
      `ingredient_variant_store_location?select=store_location_id,ingredient_variant_id&ingredient_variant_id=${idFilter}`,
      label,
    );
    const aisleIdsForPromotion = new Set(
      (Array.isArray(extraOpts?.extraAisleIds) ? extraOpts.extraAisleIds : [])
        .map((id) => intOrNull(id))
        .filter((id) => id != null && id > 0),
    );
    for (const row of Array.isArray(removedAisleLinks) ? removedAisleLinks : []) {
      const aisleId = intOrNull(row?.store_location_id);
      if (aisleId != null && aisleId > 0) aisleIdsForPromotion.add(aisleId);
    }
    await promoteVariantOnlyAislePlacementsToBase(
      opts,
      ingredientId,
      [...aisleIdsForPromotion].map((aisleId) => ({ store_location_id: aisleId })),
      label,
      matchingIds,
    );
    await pgDelete(
      opts,
      `ingredient_variant_store_location?ingredient_variant_id=${idFilter}`,
      label,
    );
    await pgDelete(
      opts,
      `ingredient_variant_tag_map?ingredient_variant_id=${idFilter}`,
      label,
    );
    await pgDelete(opts, `ingredient_variants?id=${idFilter}`, label);
    return matchingIds.length;
  }

  async function deleteCatalogNamedVariantRecords(
    opts,
    ingredientId,
    variantName,
    label = 'deleteCatalogNamedVariantRecords',
    extraOpts = {},
  ) {
    const variantKey = trimStr(variantName).toLowerCase();
    if (
      !Number.isFinite(ingredientId) ||
      ingredientId <= 0 ||
      !isCatalogNamedVariantKey(variantKey)
    ) {
      return 0;
    }

    const extraAisleIds = (Array.isArray(extraOpts?.extraAisleIds) ? extraOpts.extraAisleIds : [])
      .map((id) => intOrNull(id))
      .filter((id) => id != null && id > 0);

    try {
      const rpcResult = await pgRpc(
        opts,
        'delete_catalog_named_variant_with_aisle_promotion',
        {
          p_ingredient_id: ingredientId,
          p_variant_name: variantName,
          p_extra_aisle_ids: extraAisleIds.length ? extraAisleIds : null,
        },
        label,
      );
      const removed = intOrNull(rpcResult);
      return removed != null && removed >= 0 ? removed : 0;
    } catch (rpcErr) {
      console.warn(
        `${label}: delete_catalog_named_variant_with_aisle_promotion RPC unavailable; using JS fallback:`,
        rpcErr,
      );
      return deleteCatalogNamedVariantRecordsViaJsFallback(
        opts,
        ingredientId,
        variantName,
        label,
        extraOpts,
      );
    }
  }

  // ---- saveShoppingCatalogItem ---------------------------------------------
  //
  // Supabase shopping-item editor save path: replaces
  // ingredient_variants / sizes / synonyms / variant tags after PATCH on ingredients.

  async function saveShoppingCatalogItem(opts, request = {}) {
    const ingredientId = intOrNull(request?.ingredientId);
    if (ingredientId == null || ingredientId <= 0) {
      throw new Error('saveShoppingCatalogItem: ingredientId is required.');
    }
    const name = trimStr(request?.name);
    if (!name) {
      throw new Error('saveShoppingCatalogItem: name is required.');
    }

    const lemmaRaw = request?.lemma;
    const lemma =
      lemmaRaw == null || String(lemmaRaw).trim() === ''
        ? null
        : trimStr(lemmaRaw);

    const usePluralOverride = !!request?.usePluralOverride;
    const pluralOverrideRaw = usePluralOverride
      ? trimStr(request?.pluralOverride ?? '')
      : '';
    const singularIfUnspecified = !!request?.singularIfUnspecified;
    const isMassNoun = !!request?.isMassNoun;
    const isFood = request?.isFood !== false;
    const isDeprecated = !!request?.isDeprecated;
    const isHidden = !!request?.isHidden;
    const useMetric = !!request?.useMetric;

    const variantRowsIn = Array.isArray(request?.variantRows)
      ? request.variantRows
      : [];
    const sizesIn = Array.isArray(request?.sizes) ? request.sizes : [];
    const synonymsIn = Array.isArray(request?.synonyms) ? request.synonyms : [];
    const previousName = trimStr(request?.previousName);
    const synonymSet = new Set(
      synonymsIn
        .map((syn) => trimStr(syn).toLowerCase())
        .filter(Boolean),
    );
    if (
      previousName &&
      previousName.toLowerCase() !== name.toLowerCase() &&
      !synonymSet.has(previousName.toLowerCase())
    ) {
      synonymsIn.push(previousName);
      synonymSet.add(previousName.toLowerCase());
    }

    const ivExisting = await pgGet(
      opts,
      `ingredient_variants?select=id,variant&ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );

    const incomingNamedKeys = new Set();
    variantRowsIn.forEach((row) => {
      if (row?.isBase) return;
      const name = trimStr(row?.variant ?? row?.value ?? '');
      const key = name.toLowerCase();
      if (!key || key === 'default' || key === 'base' || key === 'any') return;
      incomingNamedKeys.add(key);
    });
    for (const row of Array.isArray(ivExisting) ? ivExisting : []) {
      const prevName = trimStr(row?.variant);
      const prevKey = prevName.toLowerCase();
      if (!prevKey || prevKey === 'default' || prevKey === 'base') continue;
      if (!incomingNamedKeys.has(prevKey)) {
        await purgeCatalogVariantReferences(opts, {
          ingredientId,
          variantName: prevName,
        });
      }
    }

    const aislePlacementsSnapshot = await snapshotVariantAislePlacementsForIngredient(
      opts,
      ivExisting,
      'saveShoppingCatalogItem',
    );

    const variantIds = positiveUniqueIds(ivExisting, 'id');
    if (variantIds.length) {
      const vf = inFilter(variantIds);
      await pgDelete(
        opts,
        `ingredient_variant_store_location?ingredient_variant_id=${vf}`,
        'saveShoppingCatalogItem',
      );
      await pgDelete(
        opts,
        `ingredient_variant_tag_map?ingredient_variant_id=${vf}`,
        'saveShoppingCatalogItem',
      );
    }

    await pgDelete(
      opts,
      `ingredient_variants?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );
    await pgDelete(
      opts,
      `ingredient_sizes?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );
    await pgDelete(
      opts,
      `ingredient_synonyms?ingredient_id=eq.${encodeURIComponent(
        String(ingredientId),
      )}`,
      'saveShoppingCatalogItem',
    );

    await pgPatch(
      opts,
      `ingredients?id=eq.${encodeURIComponent(String(ingredientId))}`,
      {
        name,
        lemma,
        plural_override: pluralOverrideRaw || null,
        use_plural_override: usePluralOverride,
        singular_if_unspecified: singularIfUnspecified,
        is_mass_noun: isMassNoun,
        is_food: isFood,
        is_deprecated: isDeprecated,
        is_hidden: isHidden,
        use_metric: useMetric,
        hide_from_shopping_list: false,
      },
      'saveShoppingCatalogItem',
    );

    const BASE_VARIANT = 'default';
    const variantRows =
      variantRowsIn.length > 0
        ? variantRowsIn
        : [
            {
              isBase: true,
              variant: BASE_VARIANT,
              homeLocation: 'none',
              isDeprecated: false,
              tags: [],
            },
          ];

    const tagRows = await pgGet(
      opts,
      'tags?select=id,name,is_hidden',
      'saveShoppingCatalogItem',
    );
    const tagByLower = new Map();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const tid = intOrNull(row?.id);
      const n = trimStr(row?.name);
      if (tid != null && tid > 0 && n) tagByLower.set(n.toLowerCase(), tid);
    });

    async function resolveTagId(tagName) {
      const n = trimStr(tagName);
      if (!n) return null;
      const k = n.toLowerCase();
      if (tagByLower.has(k)) return tagByLower.get(k);
      const created = await createTag(opts, {
        name: n,
        intendedUse: 'ingredients',
      });
      const tid = intOrNull(created?.id);
      if (tid != null && tid > 0) tagByLower.set(k, tid);
      return tid;
    }

    const variantKeyToNewId = new Map();

    for (let i = 0; i < variantRows.length; i += 1) {
      const row = variantRows[i];
      const isBase = !!row?.isBase;
      const variantName = isBase
        ? BASE_VARIANT
        : trimStr(row?.variant ?? row?.value ?? '');
      if (!isBase && !variantName) continue;

      const sortOrder = i === 0 ? 0 : i;
      const homeLocation =
        trimStr(row?.homeLocation ?? 'none') || 'none';
      const vDep = !!row?.isDeprecated;

      const inserted = await pgPost(
        opts,
        'ingredient_variants?select=id',
        {
          ingredient_id: ingredientId,
          variant: variantName,
          sort_order: sortOrder,
          home_location: homeLocation,
          is_deprecated: vDep,
        },
        'saveShoppingCatalogItem',
      );
      const newVid = intOrNull(inserted[0]?.id);
      if (newVid == null || newVid <= 0) continue;
      if (!isBase) {
        const namedKey = variantName.toLowerCase();
        if (isCatalogNamedVariantKey(namedKey)) {
          variantKeyToNewId.set(namedKey, newVid);
        }
      }

      const tags = Array.isArray(row?.tags) ? row.tags : [];
      let tagOrder = 1;
      for (let t = 0; t < tags.length; t += 1) {
        const tid = await resolveTagId(tags[t]);
        if (tid == null || tid <= 0) continue;
        await pgPost(
          opts,
          'ingredient_variant_tag_map?select=id',
          {
            ingredient_variant_id: newVid,
            tag_id: tid,
            sort_order: tagOrder,
          },
          'saveShoppingCatalogItem',
        );
        tagOrder += 1;
      }
    }

    await restoreVariantAislePlacements(
      opts,
      aislePlacementsSnapshot,
      variantKeyToNewId,
      incomingNamedKeys,
      'saveShoppingCatalogItem',
    );

    let szOrder = 1;
    for (let s = 0; s < sizesIn.length; s += 1) {
      const sz = trimStr(sizesIn[s]);
      if (!sz) continue;
      await pgPost(
        opts,
        'ingredient_sizes?select=id',
        {
          ingredient_id: ingredientId,
          size: sz,
          sort_order: szOrder,
        },
        'saveShoppingCatalogItem',
      );
      szOrder += 1;
    }

    for (let y = 0; y < synonymsIn.length; y += 1) {
      const syn = trimStr(synonymsIn[y]);
      if (!syn) continue;
      await pgPost(
        opts,
        'ingredient_synonyms?select=id',
        {
          ingredient_id: ingredientId,
          synonym: syn,
        },
        'saveShoppingCatalogItem',
      );
    }

    bumpListShoppingItemsAggregateGeneration();
    return { ingredientId };
  }

  // ---- lookupIngredientNameByLemma -----------------------------------------
  //
  // Contract: js/data/contracts/lookupIngredientNameByLemma.md

  async function lookupIngredientNameByLemma(opts, request = {}) {
    const lemma = trimStr(request?.lemma);
    if (!lemma) return null;

    const ingredientRows = await pgGet(
      opts,
      'ingredients?select=id,name,lemma',
      'lookupIngredientNameByLemma',
    );
    const needle = lemma.toLowerCase();
    const hit = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .filter((row) => trimStr(row?.lemma).toLowerCase() === needle)
      .sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))[0];
    if (!hit) return null;
    const n = hit.name == null ? '' : String(hit.name).trim();
    return n || null;
  }

  // ---- listIngredientTagNames ----------------------------------------------
  //
  // Contract: js/data/contracts/listIngredientTagNames.md

  function effectiveTagIntendedUseForIngredientPool(raw) {
    const t = trimStr(raw == null ? '' : String(raw));
    const lower = t.toLowerCase();
    return lower ? lower : 'recipes';
  }

  function compareAsciiNocaseString(a, b) {
    const la = asciiNocaseFold(String(a));
    const lb = asciiNocaseFold(String(b));
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listIngredientTagNames(opts) {
    const [tagRows, ivMapRows] = await Promise.all([
      pgGet(
        opts,
        'tags?select=id,name,is_hidden,intended_use',
        'listIngredientTagNames',
      ),
      pgGet(
        opts,
        'ingredient_variant_tag_map?select=id,tag_id',
        'listIngredientTagNames',
      ),
    ]);

    const ingredientUsageTagIds = new Set(
      (Array.isArray(ivMapRows) ? ivMapRows : [])
        .map((row) => intOrNull(row?.tag_id))
        .filter((id) => id != null && id > 0),
    );

    const names = new Set();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      if (Number(row?.is_hidden || 0) === 1) return;
      const trimmed = trimStr(row?.name == null ? '' : String(row.name));
      if (!trimmed) return;
      const id = intOrNull(row?.id);
      if (id == null || id <= 0) return;
      const intended = effectiveTagIntendedUseForIngredientPool(
        row?.intended_use,
      );
      const isIngredientUse = intended === 'ingredients';
      const hasIngredientLink = ingredientUsageTagIds.has(id);
      if (!isIngredientUse && !hasIngredientLink) return;
      names.add(trimmed);
    });

    return Array.from(names).sort(compareAsciiNocaseString);
  }

  // ---- listShoppingItems ---------------------------------------------------
  //
  // Contract: js/data/contracts/listShoppingItems.md

  function normalizeShoppingHomeLocation(raw) {
    const value = trimStr(raw);
    return value || 'none';
  }

  const SHOPPING_LIST_HOME_LOCATION_IDS = new Set([
    'fridge',
    'freezer',
    'above fridge',
    'cereal cabinet',
    'pantry',
    'spices',
    'fruit stand',
    'coffee bar',
    'none',
  ]);

  /** Matches main.js: RS (U+001E); NUL still accepted when splitting legacy keys. */
  const SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP = '\u001e';

  function normalizeShoppingListHomeLocation(raw) {
    const value = trimStr(raw).toLowerCase();
    if (!value || value === 'measures') return 'none';
    return SHOPPING_LIST_HOME_LOCATION_IDS.has(value) ? value : 'none';
  }

  function normalizeShoppingListSourceKeys(rawSourceKeys) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rawSourceKeys) ? rawSourceKeys : []).forEach((rawKey) => {
      const key = trimStr(rawKey).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  function splitShoppingListSourceKey(sourceKey) {
    const key = trimStr(sourceKey).toLowerCase();
    const iNul = key.indexOf('\u0000');
    const iRs = key.indexOf('\u001e');
    let sepIndex = -1;
    if (iNul >= 0 && iRs >= 0) sepIndex = Math.min(iNul, iRs);
    else sepIndex = iNul >= 0 ? iNul : iRs;
    if (sepIndex === -1) return { baseKey: key, variantKey: '' };
    return {
      baseKey: key.slice(0, sepIndex),
      variantKey: key.slice(sepIndex + 1),
    };
  }

  // ---- isIngredientVariantDeprecated --------------------------------------
  //
  // Contract: js/data/contracts/isIngredientVariantDeprecated.md

  async function isIngredientVariantDeprecated(opts, request) {
    const ingredientName = trimStr(request?.ingredientName);
    const variantText = trimStr(request?.variantText);
    if (!ingredientName || !variantText) return false;
    if (variantText.toLowerCase() === 'default') return false;

    const [ingredientRows, synonymRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,is_deprecated',
        'isIngredientVariantDeprecated',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'isIngredientVariantDeprecated',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,is_deprecated',
        'isIngredientVariantDeprecated',
      ),
    ]);

    const requestedNameKey = ingredientName.toLowerCase();
    const requestedVariantKey = variantText.toLowerCase();
    const activeIngredientById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id == null || id <= 0) return;
      if (toBool(row?.is_deprecated)) return;
      activeIngredientById.set(id, {
        id,
        nameKey: trimStr(row?.name).toLowerCase(),
      });
    });

    const matchingIngredientIds = new Set();
    activeIngredientById.forEach((row) => {
      if (row.nameKey && row.nameKey === requestedNameKey) {
        matchingIngredientIds.add(row.id);
      }
    });
    (Array.isArray(synonymRows) ? synonymRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      if (
        ingredientId == null ||
        !activeIngredientById.has(ingredientId) ||
        trimStr(row?.synonym).toLowerCase() !== requestedNameKey
      ) {
        return;
      }
      matchingIngredientIds.add(ingredientId);
    });

    if (!matchingIngredientIds.size) return false;
    return (Array.isArray(variantRows) ? variantRows : []).some((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      return (
        ingredientId != null &&
        matchingIngredientIds.has(ingredientId) &&
        trimStr(row?.variant).toLowerCase() === requestedVariantKey &&
        toBool(row?.is_deprecated)
      );
    });
  }

  function makeEmptyShoppingItem(row) {
    return {
      id: intOrNull(row?.id ?? row?.ID),
      name: row?.name == null ? '' : String(row.name),
      variants: [],
      /** Stable id for the `default` variant row (excluded from variantIdByName). */
      defaultVariantId: null,
      variantIdByName: {},
      removedVariants: [],
      locationAtHome: 'none',
      variantHomeLocations: [],
      isFood: true,
      isHidden: false,
      isRemoved: false,
      lemma: '',
      singularIfUnspecified: false,
      isMassNoun: false,
      useMetric: false,
      usePluralOverride: false,
      pluralOverride: '',
      tags: [],
      /** Lowercase variant key → tag names (`default` = base variant). */
      variantTagsByName: {},
      recipeUseCount: 0,
      aisleUseCount: 0,
      _variantTagsByName: {},
      _hiddenFlags: [],
      _removedFlags: [],
      _foodFlags: [],
      _lemmas: [],
      _singularIfUnspecifiedFlags: [],
      _isMassNounFlags: [],
      _useMetricFlags: [],
      _pluralOverrideEntries: [],
      _homeLocations: [],
      _variantSeen: new Set(),
      _removedVariantSet: new Set(),
    };
  }

  function finalizeShoppingItem(item) {
    item.locationAtHome =
      item._homeLocations.find(
        (value) => normalizeShoppingHomeLocation(value) !== 'none',
      ) || 'none';
    item.locationAtHome = normalizeShoppingHomeLocation(item.locationAtHome);
    item.isHidden = item._hiddenFlags.length
      ? item._hiddenFlags.every(Boolean)
      : false;
    item.isRemoved = item._removedFlags.length
      ? item._removedFlags.every(Boolean)
      : false;
    item.isFood = item._foodFlags.length ? item._foodFlags.some(Boolean) : true;
    item.lemma = trimStr(item._lemmas.find((value) => trimStr(value)) || '');
    item.singularIfUnspecified =
      item._singularIfUnspecifiedFlags.some(Boolean);
    item.isMassNoun = item._isMassNounFlags.some(Boolean);
    item.useMetric = item._useMetricFlags.some(Boolean);
    const engagedPlural = (Array.isArray(item._pluralOverrideEntries)
      ? item._pluralOverrideEntries
      : []
    ).find(
      (entry) => entry && entry.usePluralOverride && trimStr(entry.override),
    );
    item.usePluralOverride = !!engagedPlural;
    item.pluralOverride = engagedPlural
      ? trimStr(engagedPlural.override)
      : '';
    item.variantHomeLocations = item.variantHomeLocations.map((entry) => ({
      variant: entry.variant,
      homeLocation:
        normalizeShoppingHomeLocation(entry.homeLocation) === 'none' &&
        item.locationAtHome !== 'none'
          ? item.locationAtHome
          : normalizeShoppingHomeLocation(entry.homeLocation),
    }));
    item.removedVariants = item.variants.filter((variant) =>
      item._removedVariantSet.has(trimStr(variant).toLowerCase()),
    );
    item.variantTagsByName = {};
    Object.entries(item._variantTagsByName || {}).forEach(([variantKey, tagMap]) => {
      if (!tagMap || typeof tagMap.forEach !== 'function') return;
      item.variantTagsByName[variantKey] = Array.from(tagMap.values()).sort(
        compareAsciiNocaseString,
      );
    });
    delete item._hiddenFlags;
    delete item._removedFlags;
    delete item._foodFlags;
    delete item._lemmas;
    delete item._singularIfUnspecifiedFlags;
    delete item._isMassNounFlags;
    delete item._useMetricFlags;
    delete item._pluralOverrideEntries;
    delete item._homeLocations;
    delete item._variantSeen;
    delete item._removedVariantSet;
    delete item._variantTagsByName;
    return item;
  }

  function rowsByIngredientId(rows) {
    const byId = new Map();
    (Array.isArray(rows) ? rows : [])
      .slice()
      .sort((a, b) => {
        const ai = intOrNull(a?.ingredient_id);
        const bi = intOrNull(b?.ingredient_id);
        if ((ai || 0) !== (bi || 0)) return (ai || 0) - (bi || 0);
        const as = toTagSortOrder(a?.sort_order);
        const bs = toTagSortOrder(b?.sort_order);
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      })
      .forEach((row) => {
        const id = intOrNull(row?.ingredient_id);
        if (id == null || id <= 0) return;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(row);
      });
    return byId;
  }

  // listShoppingItems is expensive (many catalog reads). The Items page and
  // listShoppingListPlanRows both call it in one navigation; coalesce in-flight
  // work, reuse a short in-memory snapshot, and optionally reuse sessionStorage
  // across MPA navigations until catalog-reference realtime or a catalog write
  // bumps the generation.
  let listShoppingItemsInFlight = null;
  let listShoppingItemsLastRows = null;
  let listShoppingItemsLastMemoryHitAt = 0;
  let listShoppingItemsCatalogRev = 0;
  let listShoppingItemsLastServedRev = -1;
  const LIST_SHOPPING_ITEMS_MEMORY_TTL_MS = 5000;
  const LIST_SHOPPING_ITEMS_SESSION_TTL_MS = 90000;
  const LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY =
    'favoriteEats:listShoppingItemsCache:v1';

  function bumpListShoppingItemsAggregateGeneration() {
    listShoppingItemsCatalogRev += 1;
    listShoppingItemsLastRows = null;
    listShoppingItemsLastMemoryHitAt = 0;
    listShoppingItemsLastServedRev = -1;
    try {
      if (
        global.sessionStorage &&
        typeof global.sessionStorage.removeItem === 'function'
      ) {
        global.sessionStorage.removeItem(LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY);
      }
    } catch (_) {}
  }

  function listShoppingItemsConfigFingerprint(opts) {
    const { url, anonKey } = getConfig(opts);
    return `${trimStr(url)}|${trimStr(anonKey).slice(0, 12)}`;
  }

  function tryReadListShoppingItemsSession(opts) {
    try {
      if (
        !global.sessionStorage ||
        typeof global.sessionStorage.getItem !== 'function'
      ) {
        return null;
      }
      const raw = global.sessionStorage.getItem(
        LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY,
      );
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !Array.isArray(o.rows)) return null;
      const savedAt = Number(o.savedAt);
      const age = Date.now() - savedAt;
      if (!Number.isFinite(age) || age > LIST_SHOPPING_ITEMS_SESSION_TTL_MS) {
        global.sessionStorage.removeItem(LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY);
        return null;
      }
      if (Number(o.catalogRev) !== listShoppingItemsCatalogRev) return null;
      if (trimStr(o.configFp) !== listShoppingItemsConfigFingerprint(opts)) {
        return null;
      }
      return o.rows;
    } catch (_) {
      return null;
    }
  }

  function tryWriteListShoppingItemsSession(opts, rows) {
    try {
      if (
        !global.sessionStorage ||
        typeof global.sessionStorage.setItem !== 'function'
      ) {
        return;
      }
      global.sessionStorage.setItem(
        LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          catalogRev: listShoppingItemsCatalogRev,
          configFp: listShoppingItemsConfigFingerprint(opts),
          rows,
        }),
      );
    } catch (_) {
      try {
        global.sessionStorage.removeItem(LIST_SHOPPING_ITEMS_SESSION_STORAGE_KEY);
      } catch (_) {}
    }
  }

  function buildListShoppingItemsFromCatalogTables(tables) {
    const source =
      tables && typeof tables === 'object' ? tables : {};
    const ingredientRows = Array.isArray(source.ingredientRows)
      ? source.ingredientRows
      : [];
    const variantRows = Array.isArray(source.variantRows) ? source.variantRows : [];
    const tagRows = Array.isArray(source.tagRows) ? source.tagRows : null;
    const mapRows = Array.isArray(source.mapRows) ? source.mapRows : null;
    const rimRows = Array.isArray(source.rimRows) ? source.rimRows : null;
    const substituteRows = Array.isArray(source.substituteRows)
      ? source.substituteRows
      : null;
    const itemAisleRows = Array.isArray(source.itemAisleRows)
      ? source.itemAisleRows
      : null;
    const variantAisleRows = Array.isArray(source.variantAisleRows)
      ? source.variantAisleRows
      : null;

    const variantsByIngredientId = rowsByIngredientId(variantRows);
    const groups = new Map();

    ingredientRows
      .slice()
      .sort((a, b) => compareAsciiNocaseString(a?.name || '', b?.name || ''))
      .forEach((row) => {
        const key = trimStr(row?.name).toLowerCase();
        if (!key) return;
        const rowId = intOrNull(row?.id ?? row?.ID);
        if (!groups.has(key)) groups.set(key, makeEmptyShoppingItem(row));
        const item = groups.get(key);
        if (rowId != null && rowId > 0) {
          item.id = Math.max(Number(item.id) || 0, rowId);
        }
        item._removedFlags.push(toBool(row?.is_deprecated));
        item._hiddenFlags.push(toBool(row?.is_hidden));
        item._foodFlags.push(row?.is_food == null ? true : toBool(row.is_food));
        item._lemmas.push(row?.lemma);
        item._singularIfUnspecifiedFlags.push(
          row?.singular_if_unspecified == null
            ? false
            : toBool(row.singular_if_unspecified),
        );
        item._isMassNounFlags.push(toBool(row?.is_mass_noun));
        item._useMetricFlags.push(toBool(row?.use_metric));
        item._pluralOverrideEntries.push({
          usePluralOverride: toBool(row?.use_plural_override),
          override: row?.plural_override,
        });

        const variants = variantsByIngredientId.get(rowId) || [];
        const baseVariant = variants.find(
          (v) => trimStr(v?.variant).toLowerCase() === 'default',
        );
        item._homeLocations.push(
          baseVariant ? normalizeShoppingHomeLocation(baseVariant.home_location) : 'none',
        );
        const variantsToUse = variants.length
          ? variants
          : row?.variant
            ? [
                {
                  id: null,
                  variant: row.variant,
                  home_location: 'none',
                  is_deprecated: 0,
                },
              ]
            : [];
        variantsToUse.forEach((variantRow) => {
          const variantName = trimStr(variantRow?.variant);
          const variantKey = variantName.toLowerCase();
          if (!variantName) return;
          if (variantKey === 'default') {
            const defVid = intOrNull(variantRow?.id);
            if (defVid != null && defVid > 0) {
              item.defaultVariantId = defVid;
            }
            return;
          }
          if (item._variantSeen.has(variantKey)) {
            if (toBool(variantRow?.is_deprecated)) {
              item._removedVariantSet.add(variantKey);
            }
            return;
          }
          item._variantSeen.add(variantKey);
          item.variants.push(variantName);
          const variantId = intOrNull(variantRow?.id);
          if (variantId != null && variantId > 0) {
            item.variantIdByName[variantKey] = variantId;
          }
          if (toBool(variantRow?.is_deprecated)) {
            item._removedVariantSet.add(variantKey);
          }
          item.variantHomeLocations.push({
            variant: variantName,
            homeLocation: normalizeShoppingHomeLocation(variantRow?.home_location),
          });
        });
      });

    if (tagRows && mapRows) {
      try {
        const variantTagTargetById = new Map();
        variantRows.forEach((row) => {
          const id = intOrNull(row?.id);
          const ingredientId = intOrNull(row?.ingredient_id);
          if (id == null || id <= 0 || ingredientId == null) return;
          const variantName = trimStr(row?.variant);
          const variantKey = isBaseVariantName(variantName)
            ? 'default'
            : variantName.toLowerCase();
          if (!variantKey) return;
          variantTagTargetById.set(id, { ingredientId, variantKey });
        });
        const ingredientNameById = new Map();
        ingredientRows.forEach((row) => {
          const id = intOrNull(row?.id ?? row?.ID);
          const key = trimStr(row?.name).toLowerCase();
          if (id != null && id > 0 && key) ingredientNameById.set(id, key);
        });
        const visibleTags = new Map();
        tagRows.forEach((row) => {
          if (toBool(row?.is_hidden)) return;
          const id = intOrNull(row?.id);
          const name = trimStr(row?.name);
          if (id != null && id > 0 && name) visibleTags.set(id, name);
        });
        const tagsByNameKey = new Map();
        const appendTagForItemVariant = (nameKey, variantKey, tagName) => {
          if (!nameKey || !variantKey || !tagName) return;
          const item = groups.get(nameKey);
          if (!item) return;
          if (!tagsByNameKey.has(nameKey)) tagsByNameKey.set(nameKey, new Map());
          const unionMap = tagsByNameKey.get(nameKey);
          const lower = tagName.toLowerCase();
          if (!unionMap.has(lower)) unionMap.set(lower, tagName);
          if (!item._variantTagsByName[variantKey]) {
            item._variantTagsByName[variantKey] = new Map();
          }
          const variantMap = item._variantTagsByName[variantKey];
          if (!variantMap.has(lower)) variantMap.set(lower, tagName);
        };
        mapRows.forEach((row) => {
          const variantId = intOrNull(row?.ingredient_variant_id);
          const tagId = intOrNull(row?.tag_id);
          const target = variantTagTargetById.get(variantId);
          const nameKey = ingredientNameById.get(target?.ingredientId);
          const tagName = visibleTags.get(tagId);
          if (!nameKey || !tagName || !target?.variantKey) return;
          appendTagForItemVariant(nameKey, target.variantKey, tagName);
        });
        tagsByNameKey.forEach((tagMap, nameKey) => {
          const item = groups.get(nameKey);
          if (item) item.tags = Array.from(tagMap.values()).sort(compareAsciiNocaseString);
        });
      } catch (_) {}
    }

    if (rimRows && substituteRows) {
      try {
        const ingredientNameById = new Map();
        ingredientRows.forEach((row) => {
          const id = intOrNull(row?.id ?? row?.ID);
          const key = trimStr(row?.name).toLowerCase();
          if (id != null && id > 0 && key) ingredientNameById.set(id, key);
        });
        const recipeIdByRimId = new Map();
        const recipeIdsByNameKey = new Map();
        const addRecipeRef = (ingredientId, recipeId) => {
          const key = ingredientNameById.get(intOrNull(ingredientId));
          const rid = intOrNull(recipeId);
          if (!key || rid == null || rid <= 0) return;
          if (!recipeIdsByNameKey.has(key)) recipeIdsByNameKey.set(key, new Set());
          recipeIdsByNameKey.get(key).add(rid);
        };
        rimRows.forEach((row) => {
          const rimId = intOrNull(row?.id ?? row?.ID);
          const recipeId = intOrNull(row?.recipe_id);
          if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
          addRecipeRef(row?.ingredient_id, recipeId);
        });
        substituteRows.forEach((row) => {
          const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
          addRecipeRef(row?.ingredient_id, recipeId);
        });
        recipeIdsByNameKey.forEach((ids, key) => {
          const item = groups.get(key);
          if (item) item.recipeUseCount = ids.size;
        });
      } catch (_) {}
    }

    if (itemAisleRows && variantAisleRows) {
      try {
        const ingredientNameById = new Map();
        ingredientRows.forEach((row) => {
          const id = intOrNull(row?.id ?? row?.ID);
          const key = trimStr(row?.name).toLowerCase();
          if (id != null && id > 0 && key) ingredientNameById.set(id, key);
        });
        const variantsById = new Map();
        variantRows.forEach((row) => {
          const id = intOrNull(row?.id);
          const ingredientId = intOrNull(row?.ingredient_id);
          if (id != null && id > 0) variantsById.set(id, ingredientId);
        });
        const aisleIdsByNameKey = new Map();
        const addAisleRef = (ingredientId, aisleId) => {
          const key = ingredientNameById.get(intOrNull(ingredientId));
          const aid = intOrNull(aisleId);
          if (!key || aid == null || aid <= 0) return;
          if (!aisleIdsByNameKey.has(key)) aisleIdsByNameKey.set(key, new Set());
          aisleIdsByNameKey.get(key).add(aid);
        };
        itemAisleRows.forEach((row) => {
          addAisleRef(row?.ingredient_id, row?.store_location_id);
        });
        variantAisleRows.forEach((row) => {
          addAisleRef(
            variantsById.get(intOrNull(row?.ingredient_variant_id)),
            row?.store_location_id,
          );
        });
        aisleIdsByNameKey.forEach((ids, key) => {
          const item = groups.get(key);
          if (item) item.aisleUseCount = ids.size;
        });
      } catch (_) {}
    }

    return Array.from(groups.values())
      .map(finalizeShoppingItem)
      .sort((a, b) => compareAsciiNocaseString(a.name, b.name));
  }

  async function fetchListShoppingItemsUncached(opts) {
    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant,is_deprecated,is_hidden,is_food,lemma,singular_if_unspecified,is_mass_noun,plural_override,use_plural_override,use_metric',
        'listShoppingItems',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location,is_deprecated',
        'listShoppingItems',
      ),
    ]);

    let tagRows = null;
    let mapRows = null;
    let rimRows = null;
    let substituteRows = null;
    let itemAisleRows = null;
    let variantAisleRows = null;

    try {
      [tagRows, mapRows] = await Promise.all([
        pgGet(opts, 'tags?select=id,name,is_hidden', 'listShoppingItems'),
        pgGet(
          opts,
          'ingredient_variant_tag_map?select=id,ingredient_variant_id,tag_id',
          'listShoppingItems',
        ),
      ]);
    } catch (_) {}

    try {
      [rimRows, substituteRows] = await Promise.all([
        pgGet(
          opts,
          'recipe_ingredient_map?select=id,recipe_id,ingredient_id',
          'listShoppingItems',
        ),
        pgGet(
          opts,
          'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id',
          'listShoppingItems',
        ),
      ]);
    } catch (_) {}

    try {
      [itemAisleRows, variantAisleRows] = await Promise.all([
        pgGet(
          opts,
          'ingredient_store_location?select=id,ingredient_id,store_location_id',
          'listShoppingItems',
        ),
        pgGet(
          opts,
          'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
          'listShoppingItems',
        ),
      ]);
    } catch (_) {}

    return buildListShoppingItemsFromCatalogTables({
      ingredientRows,
      variantRows,
      tagRows,
      mapRows,
      rimRows,
      substituteRows,
      itemAisleRows,
      variantAisleRows,
    });
  }

  async function listShoppingItems(opts) {
    if (listShoppingItemsInFlight) {
      return listShoppingItemsInFlight;
    }
    const rev = listShoppingItemsCatalogRev;
    const now = Date.now();
    if (
      Array.isArray(listShoppingItemsLastRows) &&
      listShoppingItemsLastServedRev === rev &&
      now - listShoppingItemsLastMemoryHitAt < LIST_SHOPPING_ITEMS_MEMORY_TTL_MS
    ) {
      return listShoppingItemsLastRows;
    }
    const sessionRows = tryReadListShoppingItemsSession(opts);
    if (sessionRows) {
      listShoppingItemsLastRows = sessionRows;
      listShoppingItemsLastMemoryHitAt = now;
      listShoppingItemsLastServedRev = rev;
      return sessionRows;
    }
    listShoppingItemsInFlight = fetchListShoppingItemsUncached(opts)
      .then((rows) => {
        listShoppingItemsLastRows = rows;
        listShoppingItemsLastMemoryHitAt = Date.now();
        listShoppingItemsLastServedRev = listShoppingItemsCatalogRev;
        tryWriteListShoppingItemsSession(opts, rows);
        return rows;
      })
      .finally(() => {
        listShoppingItemsInFlight = null;
      });
    return listShoppingItemsInFlight;
  }

  // ---- loadShoppingItemDetail ---------------------------------------------
  //
  // Contract: js/data/contracts/loadShoppingItemDetail.md

  function objectHasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
  }

  function isBaseVariantName(value) {
    const key = trimStr(value).toLowerCase();
    return !key || key === 'default';
  }

  function dedupeTextInOrder(values) {
    const out = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const text = trimStr(value);
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function makeShoppingItemDetailBaseRow({
    homeLocation = 'none',
    tags = [],
    variantId = null,
    isDeprecated = false,
  } = {}) {
    return {
      isBase: true,
      value: '',
      homeLocation: normalizeShoppingListHomeLocation(homeLocation),
      tags: Array.isArray(tags) ? tags : [],
      variantId:
        intOrNull(variantId) != null && intOrNull(variantId) > 0
          ? intOrNull(variantId)
          : null,
      isDeprecated: !!isDeprecated,
    };
  }

  function buildDetailTagsByVariantId(tagRows, mapRows, variantIds) {
    const idSet = new Set(
      (Array.isArray(variantIds) ? variantIds : [])
        .map((id) => intOrNull(id))
        .filter((id) => id != null && id > 0),
    );
    const byVariantId = new Map(Array.from(idSet).map((id) => [id, []]));
    const visibleTags = new Map();
    (Array.isArray(tagRows) ? tagRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      const name = trimStr(row?.name);
      if (id != null && id > 0 && name && !toBool(row?.is_hidden)) {
        visibleTags.set(id, name);
      }
    });
    const seenByVariant = new Map();
    (Array.isArray(mapRows) ? mapRows : [])
      .slice()
      .sort((a, b) => {
        const av = intOrNull(a?.ingredient_variant_id) || 0;
        const bv = intOrNull(b?.ingredient_variant_id) || 0;
        if (av !== bv) return av - bv;
        const as = toTagSortOrder(a?.sort_order);
        const bs = toTagSortOrder(b?.sort_order);
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      })
      .forEach((row) => {
        const variantId = intOrNull(row?.ingredient_variant_id);
        const tagName = visibleTags.get(intOrNull(row?.tag_id));
        if (variantId == null || !idSet.has(variantId) || !tagName) return;
        if (!seenByVariant.has(variantId)) seenByVariant.set(variantId, new Set());
        const key = tagName.toLowerCase();
        if (seenByVariant.get(variantId).has(key)) return;
        seenByVariant.get(variantId).add(key);
        byVariantId.get(variantId).push(tagName);
      });
    return byVariantId;
  }

  async function loadShoppingItemDetail(opts, request = {}) {
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;

    const [
      ingredientRows,
      variantRows,
      tagRows,
      tagMapRows,
      sizeRows,
      synonymRows,
    ] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant,size,is_deprecated,is_hidden,is_food,plural_override,singular_if_unspecified,is_mass_noun,use_plural_override,use_metric,lemma',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location,is_deprecated',
        'loadShoppingItemDetail',
      ),
      pgGet(opts, 'tags?select=id,name,is_hidden', 'loadShoppingItemDetail'),
      pgGet(
        opts,
        'ingredient_variant_tag_map?select=id,ingredient_variant_id,tag_id,sort_order',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_sizes?select=id,ingredient_id,size,sort_order',
        'loadShoppingItemDetail',
      ),
      pgGet(
        opts,
        'ingredient_synonyms?select=id,ingredient_id,synonym',
        'loadShoppingItemDetail',
      ),
    ]);

    const requested = (Array.isArray(ingredientRows) ? ingredientRows : []).find(
      (row) => intOrNull(row?.id ?? row?.ID) === ingredientId,
    );
    if (!requested) return null;

    const targetIds = [];
    const seenTargetIds = new Set();
    const pushTargetId = (rawId) => {
      const id = intOrNull(rawId);
      if (id == null || id <= 0 || seenTargetIds.has(id)) return;
      seenTargetIds.add(id);
      targetIds.push(id);
    };
    pushTargetId(ingredientId);
    const itemName = trimStr(request?.itemName);
    if (itemName) {
      (Array.isArray(ingredientRows) ? ingredientRows : [])
        .slice()
        .sort((a, b) => (intOrNull(a?.id ?? a?.ID) || 0) - (intOrNull(b?.id ?? b?.ID) || 0))
        .forEach((row) => {
          if (trimStr(row?.name).toLowerCase() === itemName.toLowerCase()) {
            pushTargetId(row?.id ?? row?.ID);
          }
        });
    }

    const targetIdSet = new Set(targetIds);
    const rawVariantRows = (Array.isArray(variantRows) ? variantRows : [])
      .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
      .map((row) => ({
        id: intOrNull(row?.id),
        ingredientId: intOrNull(row?.ingredient_id),
        variant: trimStr(row?.variant),
        sortOrder: toTagSortOrder(row?.sort_order),
        homeLocation: normalizeShoppingListHomeLocation(row?.home_location),
        isDeprecated: toBool(row?.is_deprecated),
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return (a.id || 0) - (b.id || 0);
      });

    const tagsByVariantId = buildDetailTagsByVariantId(
      tagRows,
      tagMapRows,
      rawVariantRows.map((row) => row.id),
    );
    const firstBaseVariant = rawVariantRows.find((row) =>
      isBaseVariantName(row.variant),
    );
    const baseRow = makeShoppingItemDetailBaseRow({
      homeLocation: firstBaseVariant?.homeLocation || 'none',
      tags: firstBaseVariant ? tagsByVariantId.get(firstBaseVariant.id) || [] : [],
      variantId: firstBaseVariant?.id || null,
      isDeprecated: !!firstBaseVariant?.isDeprecated,
    });

    const detailVariantRows = [baseRow];
    const seenVariants = new Set();
    rawVariantRows.forEach((row) => {
      const value = trimStr(row.variant);
      const key = value.toLowerCase();
      if (!value || isBaseVariantName(value) || seenVariants.has(key)) return;
      seenVariants.add(key);
      detailVariantRows.push({
        isBase: false,
        value,
        homeLocation: normalizeShoppingListHomeLocation(row.homeLocation),
        tags: tagsByVariantId.get(row.id) || [],
        variantId: row.id != null && row.id > 0 ? row.id : null,
        isDeprecated: !!row.isDeprecated,
      });
    });

    if (!rawVariantRows.length) {
      dedupeTextInOrder(
        (Array.isArray(ingredientRows) ? ingredientRows : [])
          .filter((row) => targetIdSet.has(intOrNull(row?.id ?? row?.ID)))
          .map((row) => row?.variant),
      ).forEach((value) => {
        const key = value.toLowerCase();
        if (isBaseVariantName(value) || seenVariants.has(key)) return;
        seenVariants.add(key);
        detailVariantRows.push({
          isBase: false,
          value,
          homeLocation: 'none',
          tags: [],
          variantId: null,
          isDeprecated: false,
        });
      });
    }

    const sizesText = dedupeTextInOrder(
      (Array.isArray(sizeRows) ? sizeRows : [])
        .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
        .slice()
        .sort((a, b) => {
          const ai = targetIds.indexOf(intOrNull(a?.ingredient_id));
          const bi = targetIds.indexOf(intOrNull(b?.ingredient_id));
          if (ai !== bi) return ai - bi;
          const as = toTagSortOrder(a?.sort_order);
          const bs = toTagSortOrder(b?.sort_order);
          if (as !== bs) return as - bs;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        })
        .map((row) => row?.size),
    ).join('\n');
    const fallbackSizesText =
      sizesText ||
      dedupeTextInOrder(
        (Array.isArray(ingredientRows) ? ingredientRows : [])
          .filter((row) => targetIdSet.has(intOrNull(row?.id ?? row?.ID)))
          .map((row) => row?.size),
      ).join('\n');
    const synonymsText = dedupeTextInOrder(
      (Array.isArray(synonymRows) ? synonymRows : [])
        .filter((row) => targetIdSet.has(intOrNull(row?.ingredient_id)))
        .slice()
        .sort((a, b) => {
          const ai = targetIds.indexOf(intOrNull(a?.ingredient_id));
          const bi = targetIds.indexOf(intOrNull(b?.ingredient_id));
          if (ai !== bi) return ai - bi;
          return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
        })
        .map((row) => row?.synonym),
    ).join('\n');

    const hasIsDeprecated = objectHasOwn(requested, 'is_deprecated');
    const visibility = {
      showPluralOverride: objectHasOwn(requested, 'plural_override'),
      showSingularIfUnspecified: objectHasOwn(
        requested,
        'singular_if_unspecified',
      ),
      showIsMassNoun: objectHasOwn(requested, 'is_mass_noun'),
      showAnyOverrides:
        objectHasOwn(requested, 'plural_override') ||
        objectHasOwn(requested, 'singular_if_unspecified') ||
        objectHasOwn(requested, 'is_mass_noun'),
      showHiddenToggle: objectHasOwn(requested, 'is_hidden'),
    };

    const usePluralOverride = objectHasOwn(requested, 'use_plural_override')
      ? toBool(requested?.use_plural_override)
      : !!trimStr(requested?.plural_override);

    return {
      id: ingredientId,
      name: requested?.name == null ? '' : String(requested.name),
      lemma: trimStr(requested?.lemma),
      variantRows: detailVariantRows,
      synonymsText,
      sizesText: fallbackSizesText,
      homeLocation: baseRow.homeLocation,
      isFood: objectHasOwn(requested, 'is_food') ? toBool(requested.is_food) : true,
      isRemoved: hasIsDeprecated ? toBool(requested?.is_deprecated) : false,
      isHidden: toBool(requested?.is_hidden),
      pluralOverride: trimStr(requested?.plural_override),
      usePluralOverride,
      singularIfUnspecified: objectHasOwn(requested, 'singular_if_unspecified')
        ? toBool(requested?.singular_if_unspecified)
        : false,
      isMassNoun: toBool(requested?.is_mass_noun),
      useMetric: toBool(requested?.use_metric),
      visibility,
    };
  }

  // ---- listShoppingItemRecipeUsage ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingItemRecipeUsage.md

  function compareRecipeUsageRows(a, b) {
    const la = asciiNocaseFold(a?.title || '');
    const lb = asciiNocaseFold(b?.title || '');
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }

  async function listShoppingItemRecipeUsage(opts, itemName) {
    const name = trimStr(itemName);
    if (!name) return [];
    const nameKey = name.toLowerCase();

    const [ingredientRows, rimRows, substituteRows] = await Promise.all([
      pgGet(
        opts,
        'ingredients?select=id,name,variant',
        'listShoppingItemRecipeUsage',
      ),
      pgGet(
        opts,
        'recipe_ingredient_map?select=id,recipe_id,ingredient_id',
        'listShoppingItemRecipeUsage',
      ),
      pgGet(
        opts,
        'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id',
        'listShoppingItemRecipeUsage',
      ),
    ]);

    const matchingIngredientIds = new Set();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      if (id == null || id <= 0) return;
      if (trimStr(row?.name).toLowerCase() === nameKey) {
        matchingIngredientIds.add(id);
      }
    });
    if (!matchingIngredientIds.size) return [];

    const recipeIdByRimId = new Map();
    const recipeIds = new Set();
    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      const ingredientId = intOrNull(row?.ingredient_id);
      if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
      if (
        recipeId != null &&
        recipeId > 0 &&
        matchingIngredientIds.has(ingredientId)
      ) {
        recipeIds.add(recipeId);
      }
    });
    (Array.isArray(substituteRows) ? substituteRows : []).forEach((row) => {
      const ingredientId = intOrNull(row?.ingredient_id);
      if (!matchingIngredientIds.has(ingredientId)) return;
      const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });
    if (!recipeIds.size) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title&id=in.(${Array.from(recipeIds)
        .map((id) => Math.trunc(Number(id)))
        .join(',')})`,
      'listShoppingItemRecipeUsage',
    );
    const seen = new Set();
    return (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);
  }

  // ---- listShoppingListHomeLocations --------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListHomeLocations.md

  async function listShoppingListHomeLocations(opts, sourceKeys) {
    const keys = normalizeShoppingListSourceKeys(sourceKeys);
    const out = Object.fromEntries(keys.map((key) => [key, 'none']));
    if (!keys.length) return out;

    const baseKeys = [
      ...new Set(keys.map((key) => splitShoppingListSourceKey(key).baseKey).filter(Boolean)),
    ];
    if (!baseKeys.length) return out;

    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingListHomeLocations'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order,home_location',
        'listShoppingListHomeLocations',
      ),
    ]);

    const ingredients = (Array.isArray(ingredientRows) ? ingredientRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        nameKey: trimStr(row?.name).toLowerCase(),
      }))
      .filter(
        (row) =>
          row.id != null &&
          row.id > 0 &&
          row.nameKey &&
          baseKeys.includes(row.nameKey),
      )
      .sort((a, b) => a.id - b.id);
    const ingredientById = new Map();
    ingredients.forEach((row) => ingredientById.set(row.id, row));

    const variants = (Array.isArray(variantRows) ? variantRows : [])
      .map((row) => ({
        id: intOrNull(row?.id),
        ingredientId: intOrNull(row?.ingredient_id),
        variantKey: trimStr(row?.variant).toLowerCase(),
        sortOrder:
          row?.sort_order != null && Number.isFinite(Number(row.sort_order))
            ? Number(row.sort_order)
            : 999999,
        homeLocation: normalizeShoppingListHomeLocation(row?.home_location),
      }))
      .filter(
        (row) =>
          row.id != null &&
          row.id > 0 &&
          row.ingredientId != null &&
          ingredientById.has(row.ingredientId),
      )
      .sort((a, b) => {
        const ingredientDiff = a.ingredientId - b.ingredientId;
        if (ingredientDiff !== 0) return ingredientDiff;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      });

    const baseLocations = new Map();
    const variantLocations = new Map();
    variants.forEach((variant) => {
      const ingredient = ingredientById.get(variant.ingredientId);
      const nameKey = ingredient?.nameKey || '';
      if (!nameKey) return;
      if (!variant.variantKey || variant.variantKey === 'default') {
        if (!baseLocations.has(nameKey)) {
          baseLocations.set(nameKey, variant.homeLocation);
        }
        return;
      }
      const sourceKey = `${nameKey}${SHOPPING_LIST_SOURCE_KEY_VARIANT_SEP}${variant.variantKey}`;
      if (!variantLocations.has(sourceKey)) {
        variantLocations.set(sourceKey, variant.homeLocation);
      }
    });

    keys.forEach((sourceKey) => {
      const { baseKey, variantKey } = splitShoppingListSourceKey(sourceKey);
      const baseLocation = normalizeShoppingListHomeLocation(baseLocations.get(baseKey));
      if (!variantKey) {
        out[sourceKey] = baseLocation;
        return;
      }
      const variantLocation = normalizeShoppingListHomeLocation(
        variantLocations.get(sourceKey),
      );
      out[sourceKey] = variantLocation === 'none' ? baseLocation : variantLocation;
    });
    return out;
  }

  // ---- loadShoppingItemVariantUsage ---------------------------------------
  //
  // Contract: js/data/contracts/loadShoppingItemVariantUsage.md

  function emptyVariantUsage() {
    return { recipes: [], aislePlacements: [] };
  }

  function compareVariantUsageAisles(a, b) {
    const chainA = asciiNocaseFold(a?.chainName || '');
    const chainB = asciiNocaseFold(b?.chainName || '');
    if (chainA < chainB) return -1;
    if (chainA > chainB) return 1;
    const locA = asciiNocaseFold(a?.locationName || '');
    const locB = asciiNocaseFold(b?.locationName || '');
    if (locA < locB) return -1;
    if (locA > locB) return 1;
    const sortA = Number.isFinite(Number(a?._sortOrder))
      ? Number(a._sortOrder)
      : 999999;
    const sortB = Number.isFinite(Number(b?._sortOrder))
      ? Number(b._sortOrder)
      : 999999;
    if (sortA !== sortB) return sortA - sortB;
    return (Number(a?.aisleId) || 0) - (Number(b?.aisleId) || 0);
  }

  async function loadShoppingItemVariantUsage(opts, request = {}) {
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    const variantName = trimStr(request?.variantName);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantName) {
      return emptyVariantUsage();
    }
    const variantKey = variantName.toLowerCase();

    const [rimRows, substituteRows, variantRows, baseLocationRows] =
      await Promise.all([
        pgGet(
          opts,
          'recipe_ingredient_map?select=id,recipe_id,ingredient_id,variant',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id,variant',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'ingredient_variants?select=id,ingredient_id,variant,is_deprecated',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'ingredient_store_location?select=id,ingredient_id,store_location_id,all_variants',
          'loadShoppingItemVariantUsage',
        ),
      ]);

    const recipeIdByRimId = new Map();
    const recipeIds = new Set();
    (Array.isArray(rimRows) ? rimRows : []).forEach((row) => {
      const rimId = intOrNull(row?.id ?? row?.ID);
      const recipeId = intOrNull(row?.recipe_id);
      if (rimId != null && rimId > 0) recipeIdByRimId.set(rimId, recipeId);
      if (
        intOrNull(row?.ingredient_id) === ingredientId &&
        trimStr(row?.variant).toLowerCase() === variantKey &&
        recipeId != null &&
        recipeId > 0
      ) {
        recipeIds.add(recipeId);
      }
    });
    (Array.isArray(substituteRows) ? substituteRows : []).forEach((row) => {
      if (
        intOrNull(row?.ingredient_id) !== ingredientId ||
        trimStr(row?.variant).toLowerCase() !== variantKey
      ) {
        return;
      }
      const recipeId = recipeIdByRimId.get(intOrNull(row?.recipe_ingredient_id));
      if (recipeId != null && recipeId > 0) recipeIds.add(recipeId);
    });

    const recipeRows = recipeIds.size
      ? await pgGet(
          opts,
          `recipes?select=id,title&id=in.(${Array.from(recipeIds)
            .map((id) => Math.trunc(Number(id)))
            .join(',')})`,
          'loadShoppingItemVariantUsage',
        )
      : [];
    const seenRecipes = new Set();
    const recipes = (Array.isArray(recipeRows) ? recipeRows : [])
      .map((row) => ({
        id: intOrNull(row?.id ?? row?.ID),
        title: trimStr(row?.title),
      }))
      .filter((row) => {
        if (row.id == null || row.id <= 0 || seenRecipes.has(row.id)) return false;
        seenRecipes.add(row.id);
        return true;
      })
      .sort(compareRecipeUsageRows);

    const matchingVariantIds = new Set();
    (Array.isArray(variantRows) ? variantRows : []).forEach((row) => {
      const id = intOrNull(row?.id);
      if (
        id != null &&
        id > 0 &&
        intOrNull(row?.ingredient_id) === ingredientId &&
        trimStr(row?.variant).toLowerCase() === variantKey
      ) {
        matchingVariantIds.add(id);
      }
    });

    const allVariantsIntentByAisleIngredient = new Map();
    (Array.isArray(baseLocationRows) ? baseLocationRows : []).forEach((row) => {
      const aisleId = intOrNull(row?.store_location_id);
      const iid = intOrNull(row?.ingredient_id);
      if (aisleId == null || aisleId <= 0 || iid == null || iid <= 0) return;
      if (toBool(row?.all_variants)) {
        allVariantsIntentByAisleIngredient.set(`${aisleId}:${iid}`, true);
      }
    });

    const linkedVariantKeysByAisleIngredient = new Map();

    let aislePlacements = [];
    if (matchingVariantIds.size) {
      const [variantAisleRows, aisleRows, storeRows] = await Promise.all([
        pgGet(
          opts,
          'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'store_locations?select=id,store_id,name,sort_order',
          'loadShoppingItemVariantUsage',
        ),
        pgGet(
          opts,
          'stores?select=id,chain_name,location_name',
          'loadShoppingItemVariantUsage',
        ),
      ]);

      (Array.isArray(variantAisleRows) ? variantAisleRows : []).forEach((row) => {
        const variantId = intOrNull(row?.ingredient_variant_id);
        const aisleId = intOrNull(row?.store_location_id);
        if (!matchingVariantIds.has(variantId) || aisleId == null || aisleId <= 0) return;
        const variantRow = (Array.isArray(variantRows) ? variantRows : []).find(
          (v) => intOrNull(v?.id) === variantId,
        );
        const iid = intOrNull(variantRow?.ingredient_id);
        const key = normalizeStoreItemKey(variantRow?.variant);
        if (iid == null || iid <= 0 || !key) return;
        const mapKey = `${aisleId}:${iid}`;
        if (!linkedVariantKeysByAisleIngredient.has(mapKey)) {
          linkedVariantKeysByAisleIngredient.set(mapKey, new Set());
        }
        linkedVariantKeysByAisleIngredient.get(mapKey).add(key);
      });

      const aislesById = new Map();
      (Array.isArray(aisleRows) ? aisleRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        if (id != null && id > 0) aislesById.set(id, row);
      });
      const storesById = new Map();
      (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
        const id = intOrNull(row?.id ?? row?.ID);
        if (id != null && id > 0) storesById.set(id, row);
      });
      const seenAisles = new Set();
      aislePlacements = (Array.isArray(variantAisleRows) ? variantAisleRows : [])
        .map((row) => {
          const variantId = intOrNull(row?.ingredient_variant_id);
          const aisleId = intOrNull(row?.store_location_id);
          if (!matchingVariantIds.has(variantId) || aisleId == null || aisleId <= 0) {
            return null;
          }
          const variantRow = (Array.isArray(variantRows) ? variantRows : []).find(
            (v) => intOrNull(v?.id) === variantId,
          );
          const iid = intOrNull(variantRow?.ingredient_id);
          if (iid !== ingredientId) return null;
          const aisleIngredientKey = `${aisleId}:${iid}`;
          const linkedKeys =
            linkedVariantKeysByAisleIngredient.get(aisleIngredientKey) || new Set();
          const hasAllVariantsIntent = !!allVariantsIntentByAisleIngredient.get(
            aisleIngredientKey,
          );
          if (hasAllVariantsIntent) {
            return null;
          }
          if (!linkedKeys.has(variantKey)) {
            return null;
          }
          if (seenAisles.has(aisleId)) return null;
          const aisle = aislesById.get(aisleId);
          if (!aisle) return null;
          const storeId = intOrNull(aisle?.store_id);
          const store = storesById.get(storeId);
          if (storeId == null || storeId <= 0 || !store) return null;
          seenAisles.add(aisleId);
          return {
            storeId,
            chainName: trimStr(store?.chain_name),
            locationName: trimStr(store?.location_name),
            aisleId,
            aisleName: trimStr(aisle?.name),
            _sortOrder: intOrNull(aisle?.sort_order),
          };
        })
        .filter(Boolean)
        .sort(compareVariantUsageAisles)
        .map((row) => {
          const { _sortOrder, ...publicRow } = row;
          return publicRow;
        });
    }

    return { recipes, aislePlacements };
  }

  // ---- purgeCatalogVariantReferences ---------------------------------------
  //
  // Clears recipe/substitute variant text and removes the named catalog variant
  // row (aisle links, tags, ingredient_variants) when deleted from the editor.

  async function purgeCatalogVariantReferences(opts, request = {}) {
    const ingredientId = Math.trunc(Number(request?.ingredientId));
    const variantName = trimStr(request?.variantName);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0 || !variantName) {
      return { recipesUpdated: 0, substitutesUpdated: 0 };
    }
    const variantKey = variantName.toLowerCase();

    const [rimRows, substituteRows] = await Promise.all([
      pgGet(
        opts,
        `recipe_ingredient_map?select=id,recipe_id,ingredient_id,variant&ingredient_id=eq.${encodeURIComponent(
          String(ingredientId),
        )}`,
        'purgeCatalogVariantReferences',
      ),
      pgGet(
        opts,
        `recipe_ingredient_substitutes?select=id,recipe_ingredient_id,ingredient_id,variant&ingredient_id=eq.${encodeURIComponent(
          String(ingredientId),
        )}`,
        'purgeCatalogVariantReferences',
      ),
    ]);

    const recipeIdsTouched = new Set();
    let recipesUpdated = 0;
    for (const row of Array.isArray(rimRows) ? rimRows : []) {
      const rimId = intOrNull(row?.id ?? row?.ID);
      if (rimId == null || rimId <= 0) continue;
      if (trimStr(row?.variant).toLowerCase() !== variantKey) continue;
      await pgPatch(
        opts,
        `recipe_ingredient_map?id=eq.${encodeURIComponent(String(rimId))}`,
        { variant: '' },
        'purgeCatalogVariantReferences',
      );
      recipesUpdated += 1;
      const recipeId = intOrNull(row?.recipe_id);
      if (recipeId != null && recipeId > 0) recipeIdsTouched.add(recipeId);
    }

    let substitutesUpdated = 0;
    for (const row of Array.isArray(substituteRows) ? substituteRows : []) {
      const subId = intOrNull(row?.id ?? row?.ID);
      if (subId == null || subId <= 0) continue;
      if (trimStr(row?.variant).toLowerCase() !== variantKey) continue;
      await pgPatch(
        opts,
        `recipe_ingredient_substitutes?id=eq.${encodeURIComponent(String(subId))}`,
        { variant: '' },
        'purgeCatalogVariantReferences',
      );
      substitutesUpdated += 1;
    }

    let extraAisleIds = [];
    try {
      const usage = await loadShoppingItemVariantUsage(opts, {
        ingredientId,
        variantName,
      });
      extraAisleIds = (Array.isArray(usage?.aislePlacements) ? usage.aislePlacements : [])
        .map((row) => intOrNull(row?.aisleId))
        .filter((id) => id != null && id > 0);
    } catch (usageErr) {
      console.warn(
        'purgeCatalogVariantReferences: loadShoppingItemVariantUsage failed; continuing without extra aisle ids:',
        usageErr,
      );
    }

    const catalogVariantRowsRemoved = await deleteCatalogNamedVariantRecords(
      opts,
      ingredientId,
      variantName,
      'purgeCatalogVariantReferences',
      { extraAisleIds },
    );

    recipeIdsTouched.forEach((recipeId) => invalidateRecipeDetailCache(recipeId));
    if (
      recipesUpdated > 0 ||
      substitutesUpdated > 0 ||
      catalogVariantRowsRemoved > 0
    ) {
      bumpRecipeCompositionReadModel();
      bumpListShoppingItemsAggregateGeneration();
      const notify =
        typeof globalThis !== 'undefined'
          ? globalThis.favoriteEatsNotifyCatalogDependentSurfacesRefresh
          : null;
      if (typeof notify === 'function') {
        try {
          notify({
            source: 'purgeCatalogVariantReferences',
            catalogVariantPurged: {
              ingredientId,
              variantName,
              ingredientName: trimStr(request?.ingredientName),
            },
          });
        } catch (err) {
          console.warn(
            'favoriteEatsNotifyCatalogDependentSurfacesRefresh failed:',
            err,
          );
        }
      }
    }

    return {
      recipesUpdated,
      substitutesUpdated,
      aisleLinksRemoved: catalogVariantRowsRemoved,
      catalogVariantRowsRemoved,
    };
  }

  // ---- listShoppingPlanRecipeItems ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingPlanRecipeItems.md

  /** ASCII Record Separator — Postgres-safe (see main.js SHOPPING_PLAN_KEY_SEP). */
  const SHOPPING_PLAN_KEY_SEP = '\u001e';
  const SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX = 'iv:';
  const SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH = 2;
  const RESERVED_VARIANT_NAMES = new Set(['default', 'base', 'any']);

  function shoppingPlanAggregateKey(name, variantName = '') {
    const normalizedName = trimStr(name).toLowerCase();
    const normalizedVariant = trimStr(variantName).toLowerCase();
    if (!normalizedName) return '';
    if (!normalizedVariant || normalizedVariant === 'default') return normalizedName;
    return `${normalizedName}${SHOPPING_PLAN_KEY_SEP}${normalizedVariant}`;
  }

  /**
   * Stable shopping plan key after catalog writes: prefer iv:{variant row id}.
   * Aligned with main.js resolvePersistedShoppingItemKeyForDb.
   */
  async function resolvePersistedShoppingPlanItemKey(opts, request = {}) {
    const raw = trimStr(request?.name);
    if (!raw) return '';
    const vRaw = trimStr(request?.variantName);
    const baseLower = raw.toLowerCase();

    const row = await resolveCanonicalIngredientForShoppingReconcile(opts, {
      baseLower,
    });
    if (!row?.id) {
      return shoppingPlanAggregateKey(raw, vRaw);
    }
    const iid = intOrNull(row.id);
    const canonName = trimStr(row.name) || raw;
    const vk = vRaw.toLowerCase();
    const lookupVariant =
      !vRaw || RESERVED_VARIANT_NAMES.has(vk) ? 'default' : vRaw;
    const ilikeEnc = encodeURIComponent(ilikeLiteralExact(lookupVariant));
    try {
      const vr = await pgGet(
        opts,
        `ingredient_variants?select=id,variant&ingredient_id=eq.${encodeURIComponent(
          String(iid),
        )}&variant=ilike.${ilikeEnc}&limit=20`,
        'resolvePersistedShoppingPlanItemKey',
      );
      const rows = Array.isArray(vr) ? vr : [];
      const vLower = lookupVariant.toLowerCase();
      const exact =
        rows.find((r) => trimStr(r?.variant).toLowerCase() === vLower) ||
        rows[0];
      const vid = intOrNull(exact?.id);
      if (vid != null && vid > 0) {
        return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${vid}`;
      }
    } catch (_) {}
    if (!vRaw || RESERVED_VARIANT_NAMES.has(vk)) {
      return shoppingPlanAggregateKey(canonName, '');
    }
    return shoppingPlanAggregateKey(canonName, vRaw);
  }

  /** Set during listShoppingListPlanRows so labels can use catalog pluralization. */
  let planRowsCatalogByNameLc = null;

  /** One-shot seed from Items screen RPC to skip listShoppingItems in plan recipe walks. */
  let listShoppingPlanRecipeItemsCatalogSeed = null;

  function seedListShoppingPlanRecipeItemsCatalog(items) {
    if (!Array.isArray(items) || !items.length) return;
    const catalogByNameLc = new Map();
    items.forEach((item) => {
      const key = trimStr(item?.name).toLowerCase();
      if (key) catalogByNameLc.set(key, item);
    });
    if (catalogByNameLc.size > 0) {
      listShoppingPlanRecipeItemsCatalogSeed = catalogByNameLc;
    }
  }

  function pluralizedCatalogIngredientNoun(name, catalogItem) {
    const n = trimStr(name);
    if (!n) return '';
    const resolvedItem =
      catalogItem ||
      (planRowsCatalogByNameLc && typeof planRowsCatalogByNameLc.get === 'function'
        ? planRowsCatalogByNameLc.get(n.toLowerCase())
        : null);
    if (
      resolvedItem &&
      typeof globalThis.getShoppingCatalogItemDisplayName === 'function'
    ) {
      const display = trimStr(
        globalThis.getShoppingCatalogItemDisplayName({
          name: n,
          lemma: trimStr(resolvedItem.lemma),
          singularIfUnspecified: !!resolvedItem.singularIfUnspecified,
          isMassNoun: !!resolvedItem.isMassNoun,
          pluralOverride: trimStr(resolvedItem.pluralOverride),
          usePluralOverride: !!resolvedItem.usePluralOverride,
        }),
      );
      if (display) return display;
    }
    if (typeof globalThis.resolveFavoriteEatsCatalogGrammarForName === 'function') {
      const grammar = globalThis.resolveFavoriteEatsCatalogGrammarForName(n);
      if (
        grammar &&
        typeof globalThis.getShoppingCatalogItemDisplayName === 'function'
      ) {
        const display = trimStr(
          globalThis.getShoppingCatalogItemDisplayName(grammar),
        );
        if (display) return display;
      }
    }
    return n;
  }

  function shoppingPlanLabel(name, variantName = '') {
    const n = pluralizedCatalogIngredientNoun(name);
    const v = trimStr(variantName);
    if (!n) return '';
    if (!v || v.toLowerCase() === 'default') return n;
    return `${n} (${v})`;
  }

  function parseShoppingPlanQuantity(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') {
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    }
    const parseRich =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.parseNumericQuantityValue === 'function'
        ? globalThis.parseNumericQuantityValue
        : null;
    if (parseRich) {
      const parsed = parseRich(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      return null;
    }
    if (typeof raw === 'string' && /^\s*\d+(\.\d)?\s*$/.test(raw)) {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  }

  function isRecipeIngredientRangeQuantity(line) {
    if (line?.quantityIsApprox) return true;
    const min = positiveNumberOrNull(line?.quantityMin);
    const max = positiveNumberOrNull(line?.quantityMax);
    if (min != null && max != null && min !== max) return true;
    const parsed = parseShoppingPlanQuantity(line?.quantity);
    if (parsed == null && (min != null || max != null)) return true;
    return false;
  }

  function getRecipeIngredientShoppingQuantity(line) {
    const model = getRecipeIngredientAmountModel();
    if (model && typeof model.toShoppingQuantity === 'function') {
      return model.toShoppingQuantity(line);
    }

    const parsed = parseShoppingPlanQuantity(line?.quantity);
    if (isRecipeIngredientRangeQuantity(line)) {
      const max = Number(line?.quantityMax);
      if (Number.isFinite(max) && max > 0) return max;
      const min = Number(line?.quantityMin);
      if (Number.isFinite(min) && min > 0) return min;
      return parsed;
    }
    if (parsed != null && parsed > 0) return parsed;
    const max = Number(line?.quantityMax);
    if (Number.isFinite(max) && max > 0) return max;
    const min = Number(line?.quantityMin);
    if (Number.isFinite(min) && min > 0) return min;
    return null;
  }

  function normalizeShoppingPlanSelections(rawSelections) {
    const source = Array.isArray(rawSelections)
      ? rawSelections
      : rawSelections && typeof rawSelections === 'object'
        ? Object.values(rawSelections)
        : [];
    return source
      .map((entry) => {
        const rawInbound = Number(entry?.inboundLinkDepth);
        const inboundLinkDepth =
          Number.isFinite(rawInbound) && rawInbound >= 0
            ? Math.min(2, Math.trunc(rawInbound))
            : 0;
        const rawServings =
          entry?.servings != null
            ? Number(entry.servings)
            : entry?.servingsOverride != null
              ? Number(entry.servingsOverride)
              : entry?.servings_override != null
                ? Number(entry.servings_override)
                : NaN;
        return {
          recipeId: Math.trunc(Number(entry?.recipeId)),
          quantity: Number(entry?.quantity || 0),
          servings:
            Number.isFinite(rawServings) && rawServings > 0 ? rawServings : NaN,
          inboundLinkDepth,
        };
      })
      .filter(
        (entry) =>
          Number.isFinite(entry.recipeId) &&
          entry.recipeId > 0 &&
          Number.isFinite(entry.quantity) &&
          entry.quantity > 0,
      );
  }

  async function buildShoppingPlanKeyResolver(opts) {
    const [ingredientRows, variantRows] = await Promise.all([
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingPlanRecipeItems'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant',
        'listShoppingPlanRecipeItems',
      ),
    ]);
    const ingredientsByName = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : [])
      .slice()
      .sort((a, b) => (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0))
      .forEach((row) => {
        const key = trimStr(row?.name).toLowerCase();
        const id = intOrNull(row?.id);
        if (!key || id == null || id <= 0 || ingredientsByName.has(key)) return;
        ingredientsByName.set(key, { id, name: row?.name == null ? '' : String(row.name) });
      });
    const variantsByIngredientAndName = new Map();
    (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort((a, b) => (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0))
      .forEach((row) => {
        const ingredientId = intOrNull(row?.ingredient_id);
        const variant = trimStr(row?.variant);
        const id = intOrNull(row?.id);
        if (ingredientId == null || ingredientId <= 0 || !variant || id == null || id <= 0) {
          return;
        }
        const key = `${ingredientId}:${variant.toLowerCase()}`;
        if (!variantsByIngredientAndName.has(key)) {
          variantsByIngredientAndName.set(key, id);
        }
      });

    return function resolveShoppingPlanItemKey(name, variantName) {
      const rawName = trimStr(name);
      const rawVariant = trimStr(variantName);
      if (!rawName) return '';
      const ingredient = ingredientsByName.get(rawName.toLowerCase());
      if (!ingredient) return shoppingPlanAggregateKey(rawName, rawVariant);
      const variantKey = rawVariant.toLowerCase();
      if (!variantKey || RESERVED_VARIANT_NAMES.has(variantKey)) {
        const defaultVariantId = variantsByIngredientAndName.get(
          `${ingredient.id}:default`,
        );
        if (defaultVariantId != null && defaultVariantId > 0) {
          return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${Math.trunc(
            defaultVariantId,
          )}`;
        }
        return shoppingPlanAggregateKey(ingredient.name, '');
      }
      const variantId = variantsByIngredientAndName.get(
        `${ingredient.id}:${variantKey}`,
      );
      if (variantId != null && variantId > 0) {
        return `${SHOPPING_PLAN_VARIANT_ID_KEY_PREFIX}${Math.trunc(variantId)}`;
      }
      return shoppingPlanAggregateKey(ingredient.name, rawVariant);
    };
  }

  async function listShoppingPlanRecipeItems(opts, selectedRecipes = []) {
    const selections = normalizeShoppingPlanSelections(selectedRecipes);
    const mergedSelectedRecipeIds = new Set(
      selections
        .map((s) => Math.trunc(Number(s.recipeId)))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
    const resolveShoppingPlanItemKey = await buildShoppingPlanKeyResolver(opts);
    let catalogByNameLc = listShoppingPlanRecipeItemsCatalogSeed;
    listShoppingPlanRecipeItemsCatalogSeed = null;
    if (!catalogByNameLc || catalogByNameLc.size === 0) {
      catalogByNameLc = new Map();
      try {
        const itemRows = await listShoppingItems(opts);
        itemRows.forEach((item) => {
          const key = trimStr(item?.name).toLowerCase();
          if (key) catalogByNameLc.set(key, item);
        });
      } catch (_) {}
    }
    planRowsCatalogByNameLc = catalogByNameLc;
    const aggregate = new Map();
    const recipeCache = new Map();
    const loadRecipe = async (recipeId) => {
      const id = Math.trunc(Number(recipeId));
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!recipeCache.has(id)) {
        recipeCache.set(
          id,
          loadRecipeDetail(opts, id, {
            forShoppingPlan: true,
            bypassRecipeDetailCache: true,
          }).catch((err) => {
            recipeCache.delete(id);
            throw err;
          }),
        );
      }
      return recipeCache.get(id);
    };

    async function walkRecipe(recipe, context, visit) {
      if (!recipe || !Array.isArray(recipe.sections)) return;
      const normalizedRecipeId = Math.trunc(Number(context.recipeId));
      const normalizedMultiplier = Number(context.multiplier);
      const normalizedDepth = Math.max(0, Math.trunc(Number(context.depth) || 0));
      if (!Number.isFinite(normalizedMultiplier) || normalizedMultiplier <= 0) return;

      const ancestors = context.ancestors instanceof Set ? new Set(context.ancestors) : new Set();
      if (Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0) {
        ancestors.add(normalizedRecipeId);
      }

      const servingsMultiplier = resolveShoppingPlanServingsMultiplier(
        recipe,
        context.servings,
        normalizedRecipeId,
      );

      for (const section of recipe.sections) {
        const ingredients = Array.isArray(section?.ingredients)
          ? section.ingredients
          : [];
        for (const line of ingredients) {
          if (!line || line.rowType === 'heading') continue;
          const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
          if (line.isRecipe) {
            if (
              !Number.isFinite(linkedRecipeId) ||
              linkedRecipeId <= 0 ||
              normalizedDepth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
              ancestors.has(linkedRecipeId)
            ) {
              continue;
            }
            if (mergedSelectedRecipeIds.has(linkedRecipeId)) {
              continue;
            }
            const linkedRecipe = await loadRecipe(linkedRecipeId);
            if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) continue;
            const linkQty = getRecipeIngredientShoppingQuantity(line);
            const multiplier =
              Number.isFinite(linkQty) && linkQty > 0 ? linkQty : 1;
            await walkRecipe(
              linkedRecipe,
              {
                recipeId: linkedRecipeId,
                multiplier: normalizedMultiplier * servingsMultiplier * multiplier,
                depth: normalizedDepth + 1,
                ancestors,
                servings: null,
              },
              visit,
            );
            continue;
          }
          visit(line, {
            multiplier: normalizedMultiplier,
            servingsMultiplier,
          });
        }
      }
    }

    const selectedRecipeDetails = await Promise.all(
      selections.map(async (selection) => ({
        selection,
        recipe: await loadRecipe(selection.recipeId),
      })),
    );

    for (const { selection, recipe } of selectedRecipeDetails) {
      if (!recipe || !Array.isArray(recipe.sections)) continue;
      await walkRecipe(
        recipe,
        {
          recipeId: selection.recipeId,
          multiplier: selection.quantity,
          depth: Number(selection.inboundLinkDepth) || 0,
          ancestors: new Set(),
          servings: selection.servings,
        },
        (line, { multiplier, servingsMultiplier }) => {
          const name = trimStr(line?.name);
          if (!name) return;
          const variantName = trimStr(line?.variant);
          const key = resolveShoppingPlanItemKey(name, variantName);
          if (!key) return;
          const ingredientQty = getRecipeIngredientShoppingQuantity(line);
          if (!Number.isFinite(ingredientQty) || ingredientQty <= 0) return;
          const quantity = Number(
            (ingredientQty * servingsMultiplier * multiplier).toFixed(4),
          );
          if (!Number.isFinite(quantity) || quantity <= 0) return;
          const existing = aggregate.get(key);
          if (existing) {
            existing.quantity = Number((existing.quantity + quantity).toFixed(4));
            return;
          }
          aggregate.set(key, {
            key,
            name,
            variantName,
            label: shoppingPlanLabel(name, variantName),
            quantity,
          });
        },
      );
    }

    try {
      return Array.from(aggregate.values());
    } finally {
      planRowsCatalogByNameLc = null;
    }
  }

  // ---- listShoppingListAssignments ----------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListAssignments.md

  const SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME = 'default';
  const SHOPPING_LIST_UNKNOWN_AISLE_ID = -1;
  const SHOPPING_LIST_UNKNOWN_AISLE_LABEL = 'unknown';
  const SHOPPING_LIST_UNKNOWN_AISLE_SORT_ORDER = -1;

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

  function normalizeAssignmentStoreIds(storeOrder, selectedStoreIds) {
    const selectedSet = new Set();
    (Array.isArray(selectedStoreIds) ? selectedStoreIds : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (Number.isFinite(storeId) && storeId > 0) selectedSet.add(storeId);
    });
    const ordered = [];
    (Array.isArray(storeOrder) ? storeOrder : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (!selectedSet.has(storeId)) return;
      ordered.push(storeId);
      selectedSet.delete(storeId);
    });
    (Array.isArray(selectedStoreIds) ? selectedStoreIds : []).forEach((rawId) => {
      const storeId = Math.trunc(Number(rawId));
      if (!selectedSet.has(storeId)) return;
      ordered.push(storeId);
      selectedSet.delete(storeId);
    });
    return ordered;
  }

  function normalizeAssignmentItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        key: trimStr(item?.key),
        name: trimStr(item?.name),
        variantName: trimStr(item?.variantName),
        ingredientId: intOrNull(item?.ingredientId),
      }))
      .filter((item) => item.key && item.name);
  }

  function isShoppingListBasePlanVariantName(variantName) {
    const variantKey = trimStr(variantName).toLowerCase();
    return !variantKey || RESERVED_VARIANT_NAMES.has(variantKey);
  }

  function assignmentVariantKey(name, variantName = '') {
    const nameKey = trimStr(name).toLowerCase();
    const variantKey = trimStr(variantName).toLowerCase();
    if (!nameKey) return '';
    if (isShoppingListBasePlanVariantName(variantName)) {
      return nameKey;
    }
    return `${nameKey}${SHOPPING_PLAN_KEY_SEP}${variantKey}`;
  }

  function compareAssignmentCandidates(a, b) {
    const ar = Number.isFinite(Number(a?.variantRank)) ? Number(a.variantRank) : -1;
    const br = Number.isFinite(Number(b?.variantRank)) ? Number(b.variantRank) : -1;
    if (ar !== br) return ar - br;
    const as = Number.isFinite(Number(a?.aisleSortOrder))
      ? Number(a.aisleSortOrder)
      : 999999;
    const bs = Number.isFinite(Number(b?.aisleSortOrder))
      ? Number(b.aisleSortOrder)
      : 999999;
    if (as !== bs) return as - bs;
    const ai = Math.trunc(Number(a?.aisleId));
    const bi = Math.trunc(Number(b?.aisleId));
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return compareAsciiNocaseString(a?.aisleLabel || '', b?.aisleLabel || '');
  }

  function mergeAssignmentCandidates(...candidateLists) {
    const merged = [];
    const seen = new Map();
    candidateLists.forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((candidate) => {
        const storeId = Math.trunc(Number(candidate?.storeId));
        const aisleId = Math.trunc(Number(candidate?.aisleId));
        const aisleLabel = trimStr(candidate?.aisleLabel);
        if (!Number.isFinite(storeId) || !Number.isFinite(aisleId)) return;
        const dedupeKey =
          storeId > 0 && aisleId > 0
            ? `${storeId}:${aisleId}`
            : `${storeId}:${aisleId}:${aisleLabel.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
          const existingIndex = seen.get(dedupeKey);
          if (compareAssignmentCandidates(candidate, merged[existingIndex]) < 0) {
            merged[existingIndex] = candidate;
          }
          return;
        }
        seen.set(dedupeKey, merged.length);
        merged.push(candidate);
      });
    });
    return merged.sort(compareAssignmentCandidates);
  }

  function pushAssignment(map, key, candidate) {
    const normalizedKey = trimStr(key).toLowerCase();
    if (!normalizedKey) return;
    if (!map.has(normalizedKey)) map.set(normalizedKey, []);
    map.get(normalizedKey).push(candidate);
  }

  function assignmentCandidatesAtStore(candidates, storeId) {
    const normalizedStoreId = Math.trunc(Number(storeId));
    if (!Number.isFinite(normalizedStoreId) || normalizedStoreId <= 0) return [];
    return (Array.isArray(candidates) ? candidates : []).filter(
      (candidate) => Math.trunc(Number(candidate?.storeId)) === normalizedStoreId,
    );
  }

  function listPlausibleUnknownStoreIds(row, maps, selectedStoreIds = []) {
    const nameKey = trimStr(row?.name).toLowerCase();
    if (!nameKey) return [];
    const variantName = trimStr(row?.variantName);
    const isBasePlanRow = isShoppingListBasePlanVariantName(variantName);
    const storeIds = (Array.isArray(selectedStoreIds) ? selectedStoreIds : [])
      .map((rawId) => Math.trunc(Number(rawId)))
      .filter((storeId) => Number.isFinite(storeId) && storeId > 0);
    if (!storeIds.length) return [];

    if (isBasePlanRow) {
      const orderedVariants = Array.isArray(maps.variantOrderMap?.get(nameKey))
        ? maps.variantOrderMap.get(nameKey)
        : [];
      return storeIds.filter((storeId) =>
        orderedVariants.some((variantKey) => {
          const assignmentKey = assignmentVariantKey(nameKey, variantKey);
          if (!assignmentKey) return false;
          const variantCandidates =
            maps.variantAssignmentMap?.get(assignmentKey) || [];
          return (
            assignmentCandidatesAtStore(variantCandidates, storeId).length > 0
          );
        }),
      );
    }

    const baseCandidates = maps.baseAssignmentMap?.get(nameKey) || [];
    return storeIds.filter(
      (storeId) =>
        assignmentCandidatesAtStore(baseCandidates, storeId).length > 0,
    );
  }

  function chooseAssignmentCandidates(row, maps, selectedStoreIds = []) {
    const nameKey = trimStr(row?.name).toLowerCase();
    const variantName = trimStr(row?.variantName);
    const isBasePlanRow = isShoppingListBasePlanVariantName(variantName);
    if (!isBasePlanRow) {
      const exactKey = assignmentVariantKey(row.name, variantName);
      const exact = exactKey ? maps.variantAssignmentMap.get(exactKey) || [] : [];
      if (exact.length) return mergeAssignmentCandidates(exact);
      const allVariants = nameKey
        ? maps.allVariantsAssignmentMap?.get(nameKey) || []
        : [];
      if (allVariants.length) return mergeAssignmentCandidates(allVariants);
      const plausibleStoreIds = listPlausibleUnknownStoreIds(
        row,
        maps,
        selectedStoreIds,
      );
      if (plausibleStoreIds.length) {
        return buildShoppingListUnknownAisleCandidates(plausibleStoreIds);
      }
      return [];
    }
    const base = nameKey ? maps.baseAssignmentMap.get(nameKey) || [] : [];
    if (isBasePlanRow && nameKey) {
      if (base.length) return mergeAssignmentCandidates(base);
      const plausibleStoreIds = listPlausibleUnknownStoreIds(
        row,
        maps,
        selectedStoreIds,
      );
      if (plausibleStoreIds.length) {
        return buildShoppingListUnknownAisleCandidates(plausibleStoreIds);
      }
      return [];
    }
    return [];
  }

  async function listShoppingListAssignments(opts, request = {}) {
    const orderedStoreIds = normalizeAssignmentStoreIds(
      request?.storeOrder,
      request?.selectedStoreIds,
    );
    const items = normalizeAssignmentItems(request?.items);
    const assignmentsByKey = {};
    items.forEach((item) => {
      assignmentsByKey[item.key] = [];
    });
    if (!orderedStoreIds.length) {
      return { selectedStores: [], assignmentsByKey };
    }

    const [
      storeRows,
      storeLocationRows,
      ingredientRows,
      variantRows,
      itemLocationRows,
      variantLocationRows,
    ] = await Promise.all([
      pgGet(opts, 'stores?select=id,chain_name,location_name', 'listShoppingListAssignments'),
      pgGet(
        opts,
        'store_locations?select=id,store_id,name,sort_order',
        'listShoppingListAssignments',
      ),
      pgGet(opts, 'ingredients?select=id,name', 'listShoppingListAssignments'),
      pgGet(
        opts,
        'ingredient_variants?select=id,ingredient_id,variant,sort_order',
        'listShoppingListAssignments',
      ),
      pgGet(
        opts,
        'ingredient_store_location?select=id,ingredient_id,store_location_id,all_variants',
        'listShoppingListAssignments',
      ),
      pgGet(
        opts,
        'ingredient_variant_store_location?select=id,ingredient_variant_id,store_location_id',
        'listShoppingListAssignments',
      ),
    ]);

    const storeMeta = new Map();
    (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
      const storeId = intOrNull(row?.id ?? row?.ID);
      if (storeId == null || storeId <= 0) return;
      const chainName = trimStr(row?.chain_name);
      const locationName = trimStr(row?.location_name);
      storeMeta.set(storeId, {
        id: storeId,
        label: locationName ? `${chainName} (${locationName})` : chainName || `Store ${storeId}`,
      });
    });
    const selectedStores = orderedStoreIds
      .map((storeId) => storeMeta.get(storeId))
      .filter(Boolean);
    const effectiveStoreIds = new Set(selectedStores.map((store) => store.id));
    if (!items.length) return { selectedStores, assignmentsByKey };
    if (!effectiveStoreIds.size) return { selectedStores, assignmentsByKey };

    const itemNameKeys = new Set(
      items.map((item) => trimStr(item.name).toLowerCase()).filter(Boolean),
    );
    const itemIngredientIds = new Set(
      items
        .map((item) => intOrNull(item?.ingredientId))
        .filter((id) => id != null && id > 0)
        .map((id) => Math.trunc(Number(id))),
    );
    const ingredientsById = new Map();
    (Array.isArray(ingredientRows) ? ingredientRows : []).forEach((row) => {
      const id = intOrNull(row?.id ?? row?.ID);
      const nameKey = trimStr(row?.name).toLowerCase();
      if (id == null || id <= 0 || !nameKey) return;
      if (!itemNameKeys.has(nameKey) && !itemIngredientIds.has(id)) return;
      ingredientsById.set(id, { id, nameKey, displayName: trimStr(row?.name) });
    });

    const aisleById = new Map();
    (Array.isArray(storeLocationRows) ? storeLocationRows : []).forEach((row) => {
      const aisleId = intOrNull(row?.id ?? row?.ID);
      const storeId = intOrNull(row?.store_id);
      if (
        aisleId == null ||
        aisleId <= 0 ||
        storeId == null ||
        storeId <= 0 ||
        !effectiveStoreIds.has(storeId)
      ) {
        return;
      }
      aisleById.set(aisleId, {
        storeId,
        aisleId,
        aisleLabel: trimStr(row?.name) || `Aisle ${aisleId}`,
        aisleSortOrder:
          row?.sort_order != null && Number.isFinite(Number(row.sort_order))
          ? Number(row.sort_order)
          : 999999,
      });
    });

    const variantsById = new Map();
    const variantRowsSorted = (Array.isArray(variantRows) ? variantRows : [])
      .slice()
      .sort((a, b) => {
        const an = ingredientsById.get(intOrNull(a?.ingredient_id))?.nameKey || '';
        const bn = ingredientsById.get(intOrNull(b?.ingredient_id))?.nameKey || '';
        const nameDelta = compareAsciiNocaseString(an, bn);
        if (nameDelta) return nameDelta;
        const as =
          a?.sort_order != null && Number.isFinite(Number(a.sort_order))
            ? Number(a.sort_order)
            : 999999;
        const bs =
          b?.sort_order != null && Number.isFinite(Number(b.sort_order))
            ? Number(b.sort_order)
            : 999999;
        if (as !== bs) return as - bs;
        return (intOrNull(a?.id) || 0) - (intOrNull(b?.id) || 0);
      });

    const maps = {
      baseAssignmentMap: new Map(),
      variantAssignmentMap: new Map(),
      allVariantsAssignmentMap: new Map(),
      variantAnyAssignmentMap: new Map(),
      variantOrderMap: new Map(),
    };

    variantRowsSorted.forEach((row) => {
      const id = intOrNull(row?.id);
      const ingredient = ingredientsById.get(intOrNull(row?.ingredient_id));
      const variantKey = trimStr(row?.variant).toLowerCase();
      if (id == null || id <= 0 || !ingredient || !variantKey) return;
      variantsById.set(id, {
        id,
        ingredientId: ingredient.id,
        nameKey: ingredient.nameKey,
        variantKey,
      });
      if (variantKey === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME) return;
      if (!maps.variantOrderMap.has(ingredient.nameKey)) {
        maps.variantOrderMap.set(ingredient.nameKey, []);
      }
      maps.variantOrderMap.get(ingredient.nameKey).push(variantKey);
    });

    (Array.isArray(itemLocationRows) ? itemLocationRows : []).forEach((row) => {
      const ingredient = ingredientsById.get(intOrNull(row?.ingredient_id));
      const aisle = aisleById.get(intOrNull(row?.store_location_id));
      if (!ingredient || !aisle) return;
      if (toBool(row?.all_variants)) {
        pushAssignment(maps.allVariantsAssignmentMap, ingredient.nameKey, { ...aisle });
      }
      pushAssignment(maps.baseAssignmentMap, ingredient.nameKey, { ...aisle });
    });

    (Array.isArray(variantLocationRows) ? variantLocationRows : []).forEach((row) => {
      const variant = variantsById.get(intOrNull(row?.ingredient_variant_id));
      const aisle = aisleById.get(intOrNull(row?.store_location_id));
      if (
        !variant ||
        !aisle ||
        variant.variantKey === SHOPPING_LIST_GROUPING_BASE_VARIANT_NAME
      ) {
        return;
      }
      const candidate = { ...aisle };
      const assignmentKey = assignmentVariantKey(variant.nameKey, variant.variantKey);
      if (!assignmentKey) return;
      if (!maps.variantAssignmentMap.has(assignmentKey)) {
        maps.variantAssignmentMap.set(assignmentKey, []);
      }
      maps.variantAssignmentMap.get(assignmentKey).push(candidate);
    });

    items.forEach((item) => {
      let rowForAssignment = item;
      const iid = intOrNull(item?.ingredientId);
      if (iid != null && iid > 0) {
        const ing = ingredientsById.get(iid);
        if (ing && ing.displayName) {
          rowForAssignment = { ...item, name: ing.displayName };
        }
      }
      assignmentsByKey[item.key] = chooseAssignmentCandidates(
        rowForAssignment,
        maps,
        orderedStoreIds,
      );
    });

    return { selectedStores, assignmentsByKey };
  }

  // ---- listShoppingListRecipeSummaries ------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListRecipeSummaries.md

  function normalizeShoppingListRecipeSummarySelections(selectedRecipes) {
    const source = Array.isArray(selectedRecipes)
      ? selectedRecipes
      : selectedRecipes && typeof selectedRecipes === 'object'
        ? Object.values(selectedRecipes)
        : [];
    return source
      .map((entry) => {
        const rawServings =
          entry?.servings != null
            ? Number(entry.servings)
            : entry?.servingsOverride != null
              ? Number(entry.servingsOverride)
              : entry?.servings_override != null
                ? Number(entry.servings_override)
                : NaN;
        return {
          recipeId: Math.trunc(Number(entry?.recipeId)),
          title: trimStr(entry?.title),
          servings:
            Number.isFinite(rawServings) && rawServings > 0 ? rawServings : NaN,
        };
      })
      .filter((entry) => Number.isFinite(entry.recipeId) && entry.recipeId > 0);
  }

  function formatShoppingListRecipeSummaryServings(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    const text = Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
    return text ? `${text} svg` : '';
  }

  async function listShoppingListRecipeSummaries(opts, selectedRecipes = []) {
    const selections = normalizeShoppingListRecipeSummarySelections(selectedRecipes);
    if (!selections.length) return [];

    const recipeIds = Array.from(
      new Set(
        selections
          .map((entry) => Math.trunc(Number(entry.recipeId)))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (!recipeIds.length) return [];

    const recipeRows = await pgGet(
      opts,
      `recipes?select=id,title,servings_default&id=in.(${recipeIds.join(',')})`,
      'listShoppingListRecipeSummaries',
    );
    const recipesById = new Map();
    (Array.isArray(recipeRows) ? recipeRows : []).forEach((row) => {
      const recipeId = intOrNull(row?.id ?? row?.ID);
      if (recipeId == null || recipeId <= 0) return;
      recipesById.set(recipeId, {
        title: trimStr(row?.title),
        servingsDefault: Number(row?.servings_default),
      });
    });

    return selections
      .map((selection) => {
        const recipe = recipesById.get(selection.recipeId) || null;
        const selectedServings = Number(selection.servings);
        const defaultServings = Number(recipe?.servingsDefault);
        const servingsValue =
          Number.isFinite(selectedServings) && selectedServings > 0
            ? selectedServings
            : Number.isFinite(defaultServings) && defaultServings > 0
              ? defaultServings
              : null;
        return {
          recipeId: selection.recipeId,
          title:
            selection.title ||
            trimStr(recipe?.title) ||
            `Recipe ${selection.recipeId}`,
          servingsText: formatShoppingListRecipeSummaryServings(servingsValue),
        };
      })
      .sort((a, b) => {
        const titleDelta = compareAsciiNocaseString(a?.title || '', b?.title || '');
        if (titleDelta !== 0) return titleDelta;
        return Number(a?.recipeId || 0) - Number(b?.recipeId || 0);
      });
  }

  // ---- listShoppingListPlanRows -------------------------------------------
  //
  // Contract: js/data/contracts/listShoppingListPlanRows.md
  //
  // Product invariant: catalog ingredients marked hidden or removed must never appear on the
  // Shopping List checklist. Direct selections use visibleItems; recipe lines use catalogByNameLc.

  const SHOPPING_LIST_MEASURED_UNIT_META = Object.freeze({
    tsp: { family: 'volume', baseUnit: 'ml', factor: 4.92892159375 },
    tbsp: { family: 'volume', baseUnit: 'ml', factor: 14.78676478125 },
    cup: { family: 'volume', baseUnit: 'ml', factor: 236.5882365 },
    'fl oz': { family: 'volume', baseUnit: 'ml', factor: 29.5735295625 },
    pt: { family: 'volume', baseUnit: 'ml', factor: 473.176473 },
    qt: { family: 'volume', baseUnit: 'ml', factor: 946.352946 },
    gal: { family: 'volume', baseUnit: 'ml', factor: 3785.411784 },
    ml: { family: 'volume', baseUnit: 'ml', factor: 1 },
    l: { family: 'volume', baseUnit: 'ml', factor: 1000 },
    g: { family: 'mass', baseUnit: 'g', factor: 1 },
    kg: { family: 'mass', baseUnit: 'g', factor: 1000 },
    oz: { family: 'mass', baseUnit: 'g', factor: 28.349523125 },
    lb: { family: 'mass', baseUnit: 'g', factor: 453.59237 },
  });

  const SHOPPING_LIST_UNIT_ALIASES = Object.freeze({
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    c: 'cup',
    cups: 'cup',
    ounce: 'oz',
    ounces: 'oz',
    pound: 'lb',
    pounds: 'lb',
  });

  function normalizePlanRowsUnit(unitText) {
    const raw = trimStr(unitText).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    if (!raw) return '';
    if (Object.prototype.hasOwnProperty.call(SHOPPING_LIST_UNIT_ALIASES, raw)) {
      return SHOPPING_LIST_UNIT_ALIASES[raw];
    }
    if (raw.endsWith('ies') && raw.length > 3) return `${raw.slice(0, -3)}y`;
    if (/(ches|shes|xes|zes|ses)$/.test(raw)) return raw.slice(0, -2);
    if (raw.endsWith('s') && !raw.endsWith('ss')) return raw.slice(0, -1);
    return raw;
  }

  function formatPlanRowsQuantity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.decimalToFractionDisplay === 'function'
    ) {
      try {
        const formatted = globalThis.decimalToFractionDisplay(numeric);
        if (formatted) return String(formatted).trim();
      } catch (_) {}
    }
    return Number.isInteger(numeric)
      ? String(numeric)
      : String(Number(numeric.toFixed(2)));
  }

  function planRowsAggregateKey(name, variantName = '') {
    const nameKey = trimStr(name).toLowerCase();
    const variantKey = trimStr(variantName).toLowerCase();
    if (!nameKey) return '';
    if (!variantKey || variantKey === 'default') return nameKey;
    return `${nameKey}${SHOPPING_PLAN_KEY_SEP}${variantKey}`;
  }

  function planRowsLabel(name, variantName = '') {
    const n = pluralizedCatalogIngredientNoun(name);
    const v = trimStr(variantName);
    if (!n) return '';
    if (!v || v.toLowerCase() === 'default') return n;
    return `${v} ${n}`.trim();
  }

  function planRowsRecipeQuantity(line) {
    return getRecipeIngredientShoppingQuantity(line);
  }

  function makePlanRowsBucket({ quantity, unit = '', size = '', kind = '' }) {
    const q = Number(quantity);
    if (kind === 'unspecified') {
      return { key: 'unspecified', kind: 'unspecified', quantity: 1 };
    }
    if (!Number.isFinite(q) || q <= 0) return null;
    const normalizedUnit = normalizePlanRowsUnit(unit);
    const normalizedSize = trimStr(size);
    if (kind === 'selected') {
      return { key: 'selected', kind: 'selected', quantity: q };
    }
    const measuredMeta = SHOPPING_LIST_MEASURED_UNIT_META[normalizedUnit];
    if (measuredMeta) {
      return {
        key: `measured:${normalizedUnit}`,
        kind: 'measured',
        unit: normalizedUnit,
        family: measuredMeta.family,
        baseUnit: measuredMeta.baseUnit,
        baseQuantity: Number((q * measuredMeta.factor).toFixed(6)),
      };
    }
    if (normalizedUnit || normalizedSize) {
      return {
        key: `exact:${normalizedUnit}|${normalizedSize.toLowerCase()}`,
        kind: 'exact',
        quantity: q,
        unit: normalizedUnit,
        size: normalizedSize,
      };
    }
    return { key: 'count', kind: 'count', quantity: q };
  }

  function addPlanRowsBucket(target, bucket) {
    if (!target || !bucket || !bucket.key) return;
    if (!target.buckets.has(bucket.key)) {
      target.bucketOrder.push(bucket.key);
      target.buckets.set(bucket.key, { ...bucket });
      return;
    }
    const existing = target.buckets.get(bucket.key);
    if (!existing) return;
    if (bucket.kind === 'measured') {
      existing.baseQuantity = Number(
        (Number(existing.baseQuantity || 0) + Number(bucket.baseQuantity || 0)).toFixed(6),
      );
      return;
    }
    existing.quantity = Number(
      (Number(existing.quantity || 0) + Number(bucket.quantity || 0)).toFixed(4),
    );
  }

  function planRowsBucketSortPriority(bucket) {
    if (!bucket || typeof bucket !== 'object') return 99;
    if (bucket.kind === 'unspecified') return 0;
    if (bucket.kind === 'selected' || bucket.kind === 'count') return 1;
    return 2;
  }

  function planRowsMeasuredDisplay(family, baseQuantity, useMetric = false) {
    const numeric = Number(baseQuantity);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const api =
      typeof globalThis !== 'undefined' ? globalThis.favoriteEatsQuantityDisplayPolicy : null;
    if (api && typeof api.getShoppingListMeasuredDisplayFromBase === 'function') {
      try {
        const display = api.getShoppingListMeasuredDisplayFromBase(family, numeric, {
          useMetric: !!useMetric,
        });
        if (display) return display;
      } catch (_) {
        /* fall through to local fallback */
      }
    }
    if (useMetric) {
      return null;
    }
    if (family === 'mass') {
      const lb = numeric / SHOPPING_LIST_MEASURED_UNIT_META.lb.factor;
      if (lb < 1) {
        return {
          quantity: Math.max(1, Math.ceil(numeric / SHOPPING_LIST_MEASURED_UNIT_META.oz.factor)),
          unit: 'oz',
        };
      }
      return { quantity: Math.ceil(lb * 2) / 2, unit: 'lb' };
    }
    if (family === 'volume') {
      const cups = numeric / SHOPPING_LIST_MEASURED_UNIT_META.cup.factor;
      const gallons = numeric / SHOPPING_LIST_MEASURED_UNIT_META.gal.factor;
      let unit = 'tsp';
      if (gallons >= 0.5) unit = 'gal';
      else if (cups >= 0.25) unit = 'cup';
      else if (numeric / SHOPPING_LIST_MEASURED_UNIT_META.tbsp.factor >= 1) {
        unit = 'tbsp';
      }
      const rawQuantity = numeric / SHOPPING_LIST_MEASURED_UNIT_META[unit].factor;
      const step = unit === 'tsp' ? 0.5 : unit === 'cup' || unit === 'gal' ? 0.5 : 1;
      return { quantity: Math.ceil(rawQuantity / step) * step, unit };
    }
    return null;
  }

  function formatPlanRowsBucket(bucket, rowOptions = {}) {
    if (!bucket) return '';
    const helpers =
      typeof globalThis !== 'undefined' ? globalThis.__shoppingListAmountHelpers : null;
    if (helpers && typeof helpers.getShoppingListBucketLeadText === 'function') {
      try {
        const lead = helpers.getShoppingListBucketLeadText(bucket, {
          quantitySizePrefix: '',
          useMetric: !!rowOptions.useMetric,
        });
        if (lead) return lead;
      } catch (_) {
        /* fall through to legacy formatting */
      }
    }
    if (bucket.kind === 'unspecified') return 'some';
    if (bucket.kind === 'measured') {
      const display = planRowsMeasuredDisplay(
        bucket.family,
        bucket.baseQuantity,
        rowOptions.useMetric,
      );
      if (!display) return '';
      const displayLabel = trimStr(display.displayLabel);
      if (displayLabel) return displayLabel;
      return [formatPlanRowsQuantity(display.quantity), display.unit].filter(Boolean).join(' ');
    }
    const quantityText = formatPlanRowsQuantity(bucket.quantity);
    if (!quantityText) return '';
    if (bucket.kind === 'exact') {
      return [quantityText, bucket.size, bucket.unit].filter(Boolean).join(' ');
    }
    return quantityText;
  }

  function formatPlanRowsDetailText(buckets, rowOptions = {}) {
    const helpers =
      typeof globalThis !== 'undefined' ? globalThis.__shoppingListAmountHelpers : null;
    if (helpers && typeof helpers.formatShoppingListDisplayDetailText === 'function') {
      try {
        return helpers.formatShoppingListDisplayDetailText({
          variantName: rowOptions.variantName || '',
          buckets,
          useMetric: !!rowOptions.useMetric,
        });
      } catch (_) {
        /* fall through */
      }
    }
    return (Array.isArray(buckets) ? buckets : [])
      .filter(Boolean)
      .slice()
      .sort((a, b) => planRowsBucketSortPriority(a) - planRowsBucketSortPriority(b))
      .map((bucket) => formatPlanRowsBucket(bucket, rowOptions))
      .filter(Boolean)
      .join(' + ');
  }

  function planRowsSourceSortValue(buckets) {
    return (Array.isArray(buckets) ? buckets : []).reduce((sum, bucket) => {
      if (bucket?.kind === 'measured') {
        return sum + Math.max(0, Number(bucket.baseQuantity || 0));
      }
      return sum + Math.max(0, Number(bucket?.quantity || 0));
    }, 0);
  }

  function ensurePlanRowsSource(row, source) {
    const sourceType = trimStr(source?.sourceType) || 'recipe';
    const recipeId = Math.trunc(Number(source?.recipeId));
    const sourceKey =
      sourceType === 'manual'
        ? 'manual:selected'
        : `recipe:${Number.isFinite(recipeId) && recipeId > 0 ? recipeId : 0}`;
    if (!row.sources.has(sourceKey)) {
      row.sourceOrder.push(sourceKey);
      row.sources.set(sourceKey, {
        sourceType,
        sourceKey,
        recipeId:
          sourceType === 'recipe' && Number.isFinite(recipeId) && recipeId > 0
            ? recipeId
            : null,
        title: trimStr(source?.title) || (sourceType === 'manual' ? 'Directly added' : 'Recipe'),
        buckets: new Map(),
        bucketOrder: [],
      });
    }
    return row.sources.get(sourceKey);
  }

  function ensurePlanRowsRow(rowsByKey, { name, variantName, variantIsRemoved, ingredientId = null }) {
    const resolvedName = trimStr(name);
    const resolvedVariant = trimStr(variantName);
    const key = planRowsAggregateKey(resolvedName, resolvedVariant);
    if (!key) return null;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key,
        name: resolvedName,
        variantName: resolvedVariant,
        variantIsRemoved: !!variantIsRemoved,
        ingredientId: intOrNull(ingredientId),
        useMetric: false,
        label: planRowsLabel(resolvedName, resolvedVariant),
        buckets: new Map(),
        bucketOrder: [],
        sources: new Map(),
        sourceOrder: [],
      });
    }
    const row = rowsByKey.get(key);
    row.variantIsRemoved = row.variantIsRemoved || !!variantIsRemoved;
    const nextIngredientId = intOrNull(ingredientId);
    if (nextIngredientId != null && nextIngredientId > 0) {
      row.ingredientId = nextIngredientId;
    }
    return row;
  }

  function finalizePlanRowsRow(row) {
    const buckets = row.bucketOrder.map((key) => row.buckets.get(key)).filter(Boolean);
    const rowOptions = {
      useMetric: !!row.useMetric,
      variantName: row.variantName,
    };
    const detailText = formatPlanRowsDetailText(buckets, rowOptions);
    const text = detailText ? `${row.label} (${detailText})` : row.label;
    if (!trimStr(text)) return null;
    const contributionRows = row.sourceOrder
      .map((key) => row.sources.get(key))
      .filter(Boolean)
      .map((source) => {
        const sourceBuckets = source.bucketOrder
          .map((key) => source.buckets.get(key))
          .filter(Boolean);
        const sourceDetail = formatPlanRowsDetailText(sourceBuckets, rowOptions);
        if (!sourceDetail) return null;
        return {
          sourceType: source.sourceType,
          sourceKey: source.sourceKey,
          recipeId: source.recipeId,
          title: source.title,
          detailText: sourceDetail,
          sortValue: Number(planRowsSourceSortValue(sourceBuckets).toFixed(6)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.sourceType !== b.sourceType) return a.sourceType === 'recipe' ? -1 : 1;
        const sortDelta = Number(b.sortValue || 0) - Number(a.sortValue || 0);
        if (Math.abs(sortDelta) > 1e-9) return sortDelta;
        return compareAsciiNocaseString(a.title || '', b.title || '');
      });
    return {
      key: row.key,
      name: row.name,
      variantName: row.variantName,
      variantIsRemoved: !!row.variantIsRemoved,
      ingredientId:
        intOrNull(row.ingredientId) != null && intOrNull(row.ingredientId) > 0
          ? intOrNull(row.ingredientId)
          : null,
      label: row.label,
      buckets: buckets.map((bucket) => ({ ...bucket })),
      detailText,
      text,
      contributionRows,
    };
  }

  /** Same idea as main.js parseIngredientVariantIdFromShoppingPlanKey — keeps iv: rows when JSON omits ingredientVariantId. */
  function ingredientVariantIdFromPlanSelectionEntry(entry) {
    const direct = intOrNull(entry?.ingredientVariantId);
    if (direct != null && direct > 0) return direct;
    const keyStr = trimStr(entry?.key);
    const prefix = 'iv:';
    if (keyStr.length <= prefix.length) return null;
    if (keyStr.slice(0, prefix.length).toLowerCase() !== prefix) return null;
    const n = Math.trunc(Number(keyStr.slice(prefix.length)));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveCatalogItemSelectionFromVariantId(wantIv, itemRows) {
    const variantId = intOrNull(wantIv);
    if (variantId == null || variantId <= 0) return null;
    const rows = Array.isArray(itemRows) ? itemRows : [];
    for (let i = 0; i < rows.length; i += 1) {
      const item = rows[i];
      if (item.isHidden || item.isRemoved) continue;
      const vidMap = item.variantIdByName || {};
      const hitVariantLc = Object.keys(vidMap).find(
        (k) => intOrNull(vidMap[k]) === variantId,
      );
      const defVid = intOrNull(item.defaultVariantId);
      if (hitVariantLc != null) {
        const proper = (Array.isArray(item.variants) ? item.variants : []).find(
          (v) => trimStr(v).toLowerCase() === hitVariantLc,
        );
        return {
          visible: item,
          rowName: trimStr(item.name),
          rowVariant: proper != null ? trimStr(proper) : hitVariantLc,
        };
      }
      if (defVid === variantId) {
        return {
          visible: item,
          rowName: trimStr(item.name),
          rowVariant: 'default',
        };
      }
    }
    return null;
  }

  async function resolveCatalogItemForPlanSelection(
    opts,
    entry,
    visibleItems,
    catalogByIngredientId,
    itemRows,
  ) {
    let visible = visibleItems.get(trimStr(entry?.name).toLowerCase());
    let rowName = trimStr(entry?.name);
    let rowVariant = trimStr(entry?.variantName);
    const wantIv = intOrNull(entry?.ingredientVariantId);
    if (wantIv != null && wantIv > 0) {
      const resolved = resolveCatalogItemSelectionFromVariantId(wantIv, itemRows);
      if (resolved) {
        return resolved;
      }
    }
    if (visible) {
      return { visible, rowName, rowVariant };
    }
    const staleLower = trimStr(entry?.name).toLowerCase();
    if (!staleLower) return null;
    try {
      const canon = await resolveCanonicalIngredientForShoppingReconcile(opts, {
        baseLower: staleLower,
      });
      const cid = intOrNull(canon?.id);
      if (cid == null || cid <= 0) return null;
      const hit = catalogByIngredientId.get(cid);
      if (!hit || hit.isHidden || hit.isRemoved) return null;
      return {
        visible: hit,
        rowName: trimStr(canon?.name || hit.name),
        rowVariant,
      };
    } catch (_) {
      return null;
    }
  }

  async function resolveCatalogIngredientLineName(
    opts,
    rawName,
    visibleItems,
    catalogByIngredientId,
  ) {
    const name = trimStr(rawName);
    if (!name) return null;
    if (visibleItems.has(name.toLowerCase())) {
      return { name, visible: visibleItems.get(name.toLowerCase()) };
    }
    try {
      const canon = await resolveCanonicalIngredientForShoppingReconcile(opts, {
        baseLower: name.toLowerCase(),
      });
      const cid = intOrNull(canon?.id);
      if (cid == null || cid <= 0) return null;
      const hit = catalogByIngredientId.get(cid);
      if (!hit || hit.isHidden || hit.isRemoved) return null;
      return {
        name: trimStr(canon?.name || hit.name),
        visible: hit,
      };
    } catch (_) {
      return null;
    }
  }

  function normalizePlanRowsSelectedItems(selectedItems) {
    const source = Array.isArray(selectedItems)
      ? selectedItems
      : selectedItems && typeof selectedItems === 'object'
        ? Object.values(selectedItems)
        : [];
    return source
      .map((entry) => ({
        key: trimStr(entry?.key),
        name: trimStr(entry?.name),
        variantName: trimStr(entry?.variantName),
        quantity: Number(entry?.quantity),
        quantityUnspecified:
          entry?.quantityUnspecified === true ||
          entry?.quantity_unspecified === true,
        ingredientVariantId: ingredientVariantIdFromPlanSelectionEntry(entry),
      }))
      .filter((entry) => {
        if (entry.quantityUnspecified) {
          if (trimStr(entry.name)) return true;
          const iv = intOrNull(entry.ingredientVariantId);
          return iv != null && iv > 0;
        }
        const q = Number(entry.quantity);
        if (!Number.isFinite(q) || q <= 0) return false;
        if (trimStr(entry.name)) return true;
        const iv = intOrNull(entry.ingredientVariantId);
        return iv != null && iv > 0;
      });
  }

  async function listShoppingListPlanRows(opts, request = {}) {
    const selectedItems = normalizePlanRowsSelectedItems(request?.selectedItems);
    const selectedRecipes = normalizeShoppingPlanSelections(request?.selectedRecipes);
    if (!selectedItems.length && !selectedRecipes.length) return [];

    const mergedSelectedRecipeIds = new Set(
      selectedRecipes
        .map((s) => Math.trunc(Number(s.recipeId)))
        .filter((id) => Number.isFinite(id) && id > 0),
    );

    const rowsByKey = new Map();
    const itemRows = await listShoppingItems(opts);
    const catalogByNameLc = new Map();
    const visibleItems = new Map();
    const catalogByIngredientId = new Map();
    itemRows.forEach((item) => {
      const key = trimStr(item?.name).toLowerCase();
      if (!key) return;
      catalogByNameLc.set(key, item);
      const iid = intOrNull(item?.id);
      if (iid != null && iid > 0) {
        catalogByIngredientId.set(iid, item);
      }
      if (item.isHidden || item.isRemoved) return;
      visibleItems.set(key, item);
    });
    planRowsCatalogByNameLc = catalogByNameLc;

    for (let si = 0; si < selectedItems.length; si += 1) {
      const entry = selectedItems[si];
      const resolved = await resolveCatalogItemForPlanSelection(
        opts,
        entry,
        visibleItems,
        catalogByIngredientId,
        itemRows,
      );
      if (!resolved || !resolved.visible) continue;
      const visible = resolved.visible;
      const rowName = resolved.rowName;
      const rowVariant = resolved.rowVariant;
      const variantKey = rowVariant.toLowerCase();
      const row = ensurePlanRowsRow(rowsByKey, {
        name: rowName,
        variantName: rowVariant,
        ingredientId: intOrNull(visible?.id),
        variantIsRemoved:
          !!variantKey &&
          Array.isArray(visible.removedVariants) &&
          visible.removedVariants.some((v) => trimStr(v).toLowerCase() === variantKey),
      });
      if (!row) continue;
      row.useMetric = row.useMetric || !!visible.useMetric;
      const bucket = entry.quantityUnspecified
        ? makePlanRowsBucket({ kind: 'unspecified' })
        : makePlanRowsBucket({ kind: 'selected', quantity: entry.quantity });
      addPlanRowsBucket(row, bucket);
      const source = ensurePlanRowsSource(row, {
        sourceType: 'manual',
        title: 'Directly added',
      });
      addPlanRowsBucket(source, bucket);
    }

    const recipeCache = new Map();
    const loadRecipe = async (recipeId) => {
      const id = Math.trunc(Number(recipeId));
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!recipeCache.has(id)) {
        recipeCache.set(
          id,
          loadRecipeDetail(opts, id, {
            forShoppingPlan: true,
            bypassRecipeDetailCache: true,
          }).catch((err) => {
            recipeCache.delete(id);
            throw err;
          }),
        );
      }
      return recipeCache.get(id);
    };

    async function walkRecipe(recipe, context) {
      if (!recipe || !Array.isArray(recipe.sections)) return;
      const recipeId = Math.trunc(Number(context.recipeId));
      const multiplier = Number(context.multiplier);
      const depth = Math.max(0, Math.trunc(Number(context.depth) || 0));
      if (!Number.isFinite(multiplier) || multiplier <= 0) return;
      const ancestors = context.ancestors instanceof Set ? new Set(context.ancestors) : new Set();
      if (Number.isFinite(recipeId) && recipeId > 0) ancestors.add(recipeId);
      const servingsMultiplier = resolveShoppingPlanServingsMultiplier(
        recipe,
        context.servings,
        recipeId,
      );

      for (const section of recipe.sections) {
        const ingredients = Array.isArray(section?.ingredients) ? section.ingredients : [];
        for (const line of ingredients) {
          if (!line || line.rowType === 'heading') continue;
          const linkedRecipeId = Math.trunc(Number(line.linkedRecipeId));
          if (line.isRecipe) {
            if (
              !Number.isFinite(linkedRecipeId) ||
              linkedRecipeId <= 0 ||
              depth >= SHOPPING_PLAN_LINKED_RECIPE_MAX_DEPTH ||
              ancestors.has(linkedRecipeId)
            ) {
              continue;
            }
            if (mergedSelectedRecipeIds.has(linkedRecipeId)) {
              continue;
            }
            const linkedRecipe = await loadRecipe(linkedRecipeId);
            if (!linkedRecipe || !Array.isArray(linkedRecipe.sections)) continue;
            const linkQty = planRowsRecipeQuantity(line);
            await walkRecipe(linkedRecipe, {
              recipeId: linkedRecipeId,
              title:
                trimStr(linkedRecipe.title) ||
                trimStr(line.linkedRecipeTitle) ||
                `Recipe ${linkedRecipeId}`,
              multiplier:
                multiplier *
                servingsMultiplier *
                (Number.isFinite(linkQty) && linkQty > 0 ? linkQty : 1),
              depth: depth + 1,
              ancestors,
              servings: null,
            });
            continue;
          }

          let name = trimStr(line.name);
          if (!name) continue;
          const variantName = trimStr(line.variant);
          const variantKey = variantName.toLowerCase();
          let catalogItem = catalogByNameLc.get(name.toLowerCase());
          let visible = visibleItems.get(name.toLowerCase());
          if (!catalogItem || !visible) {
            const resolvedLine = await resolveCatalogIngredientLineName(
              opts,
              name,
              visibleItems,
              catalogByIngredientId,
            );
            if (resolvedLine) {
              name = resolvedLine.name;
              catalogItem =
                catalogByNameLc.get(name.toLowerCase()) || resolvedLine.visible;
              visible = visibleItems.get(name.toLowerCase()) || resolvedLine.visible;
            }
          }
          if (
            catalogItem &&
            (catalogItem.isHidden === true || catalogItem.isRemoved === true)
          ) {
            continue;
          }
          if (!visible) {
            visible = catalogItem;
          }
          const row = ensurePlanRowsRow(rowsByKey, {
            name,
            variantName,
            ingredientId: intOrNull(visible?.id ?? catalogItem?.id),
            variantIsRemoved:
              !!variantKey &&
              (line.variantDeprecated ||
                (visible &&
                  Array.isArray(visible.removedVariants) &&
                  visible.removedVariants.some(
                    (v) => trimStr(v).toLowerCase() === variantKey,
                  ))),
          });
          if (!row) continue;
          row.useMetric =
            row.useMetric ||
            !!line.useMetric ||
            !!(catalogItem && catalogItem.useMetric) ||
            !!(visible && visible.useMetric);
          const qty = planRowsRecipeQuantity(line);
          const bucket =
            Number.isFinite(qty) && qty > 0
              ? makePlanRowsBucket({
                  quantity: Number((qty * servingsMultiplier * multiplier).toFixed(4)),
                  unit: line.unit || '',
                  size: line.size || '',
                })
              : makePlanRowsBucket({ kind: 'unspecified' });
          addPlanRowsBucket(row, bucket);
          const source = ensurePlanRowsSource(row, {
            sourceType: 'recipe',
            recipeId,
            title: trimStr(context.title) || trimStr(recipe.title) || `Recipe ${recipeId}`,
          });
          addPlanRowsBucket(source, bucket);
        }
      }
    }

    const selectedRecipeDetails = await Promise.all(
      selectedRecipes.map(async (selection) => ({
        selection,
        recipe: await loadRecipe(selection.recipeId),
      })),
    );

    for (const { selection, recipe } of selectedRecipeDetails) {
      if (!recipe || !Array.isArray(recipe.sections)) continue;
      await walkRecipe(recipe, {
        recipeId: selection.recipeId,
        title: trimStr(selection.title) || trimStr(recipe.title) || `Recipe ${selection.recipeId}`,
        multiplier: selection.quantity,
        depth: Number(selection.inboundLinkDepth) || 0,
        ancestors: new Set(),
        servings: selection.servings,
      });
    }

    try {
      return Array.from(rowsByKey.values()).map(finalizePlanRowsRow).filter(Boolean);
    } finally {
      planRowsCatalogByNameLc = null;
    }
  }

  function createSupabaseAdapter(opts = {}) {
    return {
      createRecipe: (request) => createRecipe(opts, request),
      deleteRecipe: (request) => deleteRecipe(opts, request),
      listRecipes: () => listRecipes(opts),
      loadRecipeDetail: (recipeId, loadOpts) =>
        loadRecipeDetail(opts, recipeId, loadOpts || {}),
      saveRecipe: (request) => saveRecipe(opts, request),
      buildRecipeEditorPreflightHelpers: () =>
        buildRecipeEditorPreflightHelpers(opts),
      loadTagUsage: (tagId) => loadTagUsage(opts, tagId),
      loadTypeaheadPools: (options) => loadTypeaheadPools(opts, options),
      listTags: () => listTags(opts),
      loadUnitlessQuantityPolicy: () => loadUnitlessQuantityPolicy(opts),
      saveUnitlessQuantityPolicy: (request) =>
        saveUnitlessQuantityPolicy(opts, request),
      createTag: (request) => createTag(opts, request),
      deleteTag: (request) => deleteTag(opts, request),
      editTag: (request) => editTag(opts, request),
      listUnits: () => listUnits(opts),
      createUnit: (request) => createUnit(opts, request),
      editUnit: (request) => editUnit(opts, request),
      removeUnit: (request) => removeUnit(opts, request),
      countRecipesUsingUnit: (request) =>
        countRecipesUsingUnit(opts, request),
      listRecipesUsingUnit: (request) =>
        listRecipesUsingUnit(opts, request),
      listSizes: () => listSizes(opts),
      createSize: (request) => createSize(opts, request),
      editSize: (request) => editSize(opts, request),
      removeSize: (request) => removeSize(opts, request),
      countRecipesUsingSize: (request) =>
        countRecipesUsingSize(opts, request),
      listRecipesUsingSize: (request) =>
        listRecipesUsingSize(opts, request),
      listStores: () => listStores(opts),
      createStore: (request) => createStore(opts, request),
      deleteStore: (request) => deleteStore(opts, request),
      editStore: (request) => editStore(opts, request),
      saveStoreLayout: (request) => saveStoreLayout(opts, request),
      loadStoreDetail: (request) => loadStoreDetail(opts, request),
      loadShoppingState: () => loadShoppingState(opts),
      loadShoppingListScreen: () => loadShoppingListScreen(opts),
      loadItemsScreen: (request) => loadItemsScreen(opts, request),
      loadRecipesScreen: (request) => loadRecipesScreen(opts, request),
      loadRecipeEditorScreen: (recipeId) =>
        loadRecipeEditorScreen(opts, recipeId),
      getShoppingRevisions: () => getShoppingRevisions(opts),
      saveShoppingState: (request, saveOptions) =>
        saveShoppingState(opts, request, saveOptions),
      saveShoppingPlan: (plan, saveOptions) =>
        saveShoppingPlan(opts, plan, saveOptions),
      listPlanSessions: () => listPlanSessions(opts),
      createNamedPlanSession: (name) => createNamedPlanSession(opts, name),
      updateNamedPlanSession: (snapshotId, name) =>
        updateNamedPlanSession(opts, snapshotId, name),
      createAutoPlanSession: (capture) => createAutoPlanSession(opts, capture),
      loadPlanSession: (snapshotId) => loadPlanSession(opts, snapshotId),
      deletePlanSession: (snapshotId) => deletePlanSession(opts, snapshotId),
      rewritePlanItemKeys: (request) => rewritePlanItemKeys(opts, request),
      patchShoppingListSourceKeys: (request) =>
        patchShoppingListSourceKeys(opts, request),
      uncheckAllShoppingListRows: () => uncheckAllShoppingListRows(opts),
      applyShoppingListSourcedRowsSync: (request) =>
        applyShoppingListSourcedRowsSync(opts, request),
      restoreRemovedShoppingListRows: () => restoreRemovedShoppingListRows(opts),
      setShoppingListRowChecked: (request) =>
        setShoppingListRowChecked(opts, request),
      setPlanItemQuantity: (request) => setPlanItemQuantity(opts, request),
      setPlanRecipeServingsOverride: (request) =>
        setPlanRecipeServingsOverride(opts, request),
      setPlanRecipeQuantity: (request) => setPlanRecipeQuantity(opts, request),
      setShoppingListRowText: (request) =>
        setShoppingListRowText(opts, request),
      setShoppingListRowRemoved: (request) =>
        setShoppingListRowRemoved(opts, request),
      setShoppingListRowPlacement: (request) =>
        setShoppingListRowPlacement(opts, request),
      appendManualShoppingListRow: (request) =>
        appendManualShoppingListRow(opts, request),
      drawPresenceMoniker: (request) => drawPresenceMoniker(opts, request),
      subscribePlanChanges: (handlers) => subscribePlanChanges(opts, handlers),
      subscribeListChanges: (handlers) => subscribeListChanges(opts, handlers),
      subscribeRecipeCatalogChanges: (handlers) =>
        subscribeRecipeCatalogChanges(opts, handlers),
      subscribeCatalogReferenceChanges: (handlers) =>
        subscribeCatalogReferenceChanges(opts, handlers),
      bumpRecipeCompositionReadModel: () => bumpRecipeCompositionReadModel(),
      getRecipeCompositionReadModelGeneration: () =>
        getRecipeCompositionReadModelGeneration(),
      subscribeRecipePresence: (handlers) =>
        subscribeRecipePresence(opts, handlers),
      subscribeAppActivityPresence: (handlers) =>
        subscribeAppActivityPresence(opts, handlers),
      lookupShoppingItemByName: (request) =>
        lookupShoppingItemByName(opts, request),
      findOrCreateShoppingItem: (request) =>
        findOrCreateShoppingItem(opts, request),
      pruneOrphanedIngredientSynonyms: () =>
        pruneOrphanedIngredientSynonyms(opts),
      ensureIngredientBaseVariants: () => ensureIngredientBaseVariants(opts),
      saveShoppingCatalogItem: (request) =>
        saveShoppingCatalogItem(opts, request),
      lookupIngredientNameByLemma: (request) =>
        lookupIngredientNameByLemma(opts, request),
      listIngredientTagNames: () => listIngredientTagNames(opts),
      listShoppingItems: () => listShoppingItems(opts),
      loadShoppingItemDetail: (request) => loadShoppingItemDetail(opts, request),
      deleteShoppingItem: (request) => deleteShoppingItem(opts, request),
      listShoppingItemRecipeUsage: (itemName) =>
        listShoppingItemRecipeUsage(opts, itemName),
      listShoppingListHomeLocations: (sourceKeys) =>
        listShoppingListHomeLocations(opts, sourceKeys),
      isIngredientVariantDeprecated: (request) =>
        isIngredientVariantDeprecated(opts, request),
      loadShoppingItemVariantUsage: (request) =>
        loadShoppingItemVariantUsage(opts, request),
      purgeCatalogVariantReferences: (request) =>
        purgeCatalogVariantReferences(opts, request),
      listShoppingPlanRecipeItems: (selectedRecipes) =>
        listShoppingPlanRecipeItems(opts, selectedRecipes),
      seedListShoppingPlanRecipeItemsCatalog: (items) =>
        seedListShoppingPlanRecipeItemsCatalog(items),
      listShoppingListAssignments: (request) =>
        listShoppingListAssignments(opts, request),
      listShoppingListRecipeSummaries: (selectedRecipes) =>
        listShoppingListRecipeSummaries(opts, selectedRecipes),
      listShoppingListPlanRows: (request) => listShoppingListPlanRows(opts, request),
      resolveCanonicalIngredientForShoppingReconcile: (request) =>
        resolveCanonicalIngredientForShoppingReconcile(opts, request),
      resolveIngredientForStaleShoppingAggregateKey: (request) =>
        resolveIngredientForStaleShoppingAggregateKey(opts, request),
      listIngredientVariantsWithIngredientsByIds: (request) =>
        listIngredientVariantsWithIngredientsByIds(opts, request),
      listIngredientVariantsByIngredientIds: (request) =>
        listIngredientVariantsByIngredientIds(opts, request),
      resolvePersistedShoppingPlanItemKey: (request) =>
        resolvePersistedShoppingPlanItemKey(opts, request),
    };
  }

  global.createSupabaseAdapter = createSupabaseAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
