/**
 * Named + auto saved plan sessions (plan + list overrides).
 * Save / Manage UI lives on Shopping List only.
 */
(function favoriteEatsPlanSessionModule(global) {
  if (!global) return;

  const SESSION_BASELINE_KEY =
    'favoriteEats.planSession.baselineFingerprint.v1';
  const SESSION_ACTIVE_KEY =
    'favoriteEats.planSession.activeNamedSnapshotId.v1';
  const SESSION_ACTIVE_NAME_KEY = 'favoriteEats.planSession.activeNamedName.v1';
  const SESSION_HAS_NAMED_KEY = 'favoriteEats.planSession.hasNamedSnapshot.v1';
  const SESSION_NAME_FIELD_LABEL = 'Save session as:';

  let baselineFingerprint = '';
  let activeNamedSnapshotId = null;
  let activeNamedName = '';
  let hasNamedSnapshot = false;
  let autoSaveInFlight = false;
  let autoSaveSuppressed = false;
  let autoSaveCaptureQueue = [];
  let sessionCommitBatchDepth = 0;
  let sessionCommitBatchPending = false;

  function sessionStorageGet(key) {
    try {
      return global.sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function sessionStorageSet(key, value) {
    try {
      if (value == null || value === '') {
        global.sessionStorage.removeItem(key);
      } else {
        global.sessionStorage.setItem(key, value);
      }
    } catch (_) {}
  }

  function persistSessionMirror() {
    sessionStorageSet(SESSION_BASELINE_KEY, baselineFingerprint || '');
    sessionStorageSet(
      SESSION_ACTIVE_KEY,
      activeNamedSnapshotId != null ? String(activeNamedSnapshotId) : '',
    );
    sessionStorageSet(SESSION_ACTIVE_NAME_KEY, activeNamedName || '');
    sessionStorageSet(SESSION_HAS_NAMED_KEY, hasNamedSnapshot ? '1' : '0');
  }

  function restoreSessionMirror() {
    baselineFingerprint = String(sessionStorageGet(SESSION_BASELINE_KEY) || '');
    const activeRaw = sessionStorageGet(SESSION_ACTIVE_KEY);
    activeNamedSnapshotId =
      activeRaw != null && String(activeRaw).trim() !== ''
        ? Number(activeRaw)
        : null;
    activeNamedSnapshotId =
      Number.isFinite(activeNamedSnapshotId) && activeNamedSnapshotId > 0
        ? activeNamedSnapshotId
        : null;
    activeNamedName = String(sessionStorageGet(SESSION_ACTIVE_NAME_KEY) || '');
    hasNamedSnapshot = sessionStorageGet(SESSION_HAS_NAMED_KEY) === '1';
  }

  restoreSessionMirror();

  function ensureDialogHost() {
    let host = document.getElementById('uiDialogHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'uiDialogHost';
      host.className = 'ui-dialog-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function shouldUseRemote() {
    return (
      typeof global.shouldUseRemoteShoppingState === 'function' &&
      global.shouldUseRemoteShoppingState()
    );
  }

  function formatSessionTimestamp(date = new Date()) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const day = date.getDate();
    const month = months[date.getMonth()] || 'Jan';
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${day} ${month} ${year} at ${hours}:${minutes}:${seconds} ${ampm}`;
  }

  function formatDefaultSessionName(date = new Date()) {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const day = date.getDate();
    const month = months[date.getMonth()] || 'January';
    return `Week of ${day} ${month}`;
  }

  function stableStringify(value) {
    return JSON.stringify(value);
  }

  function rowOverrideIsConfig(row, generated) {
    if (!row || typeof row !== 'object') return false;
    const sourceKey = String(row.sourceKey || '').trim();
    if (!sourceKey) return false;
    if (row.removed === true) return false;
    const overrideText = String(row.text || '').trim();
    const generatedText = String(
      (generated && generated.text) || row.sourceText || '',
    ).trim();
    const helpers = global.__shoppingListChecklistHelpers;
    const rowForCheck = {
      ...row,
      text: overrideText,
      sourceText: generatedText || String(row.sourceText || '').trim(),
    };
    if (
      helpers &&
      typeof helpers.doesShoppingListRowHaveUserOverride === 'function' &&
      helpers.doesShoppingListRowHaveUserOverride(rowForCheck)
    ) {
      return true;
    }
    const fields = [
      ['storeId', 'storeId'],
      ['storeLabel', 'storeLabel'],
      ['bucketLabel', 'bucketLabel'],
      ['aisleId', 'aisleId'],
      ['aisleSortOrder', 'aisleSortOrder'],
      ['order', 'order'],
    ];
    return fields.some(([rowKey, genKey]) => {
      const a = row[rowKey];
      const b = generated && generated[genKey];
      return String(a ?? '') !== String(b ?? '');
    });
  }

  function extractListOverridesState(listDoc) {
    const rows = Array.isArray(listDoc?.rows) ? listDoc.rows : [];
    const generatedByKey = new Map();
    rows.forEach((row) => {
      const key = String(row?.sourceKey || '').trim();
      if (!key) return;
      if (!generatedByKey.has(key)) {
        generatedByKey.set(key, {
          text: String(row.sourceText || row.text || ''),
          storeId: row.storeId,
          storeLabel: String(row.sourceStoreLabel || row.storeLabel || ''),
          bucketLabel: String(row.sourceBucketLabel || row.bucketLabel || ''),
          aisleId: row.aisleId,
          aisleSortOrder: row.aisleSortOrder,
          order: row.order,
        });
      }
    });
    const overrides = [];
    rows.forEach((row) => {
      const sourceKey = String(row?.sourceKey || '').trim();
      if (!sourceKey) return;
      const generated = generatedByKey.get(sourceKey) || null;
      if (!rowOverrideIsConfig(row, generated)) return;
      overrides.push({
        sourceKey,
        overrideText: String(row.text || '').trim() || undefined,
        userEdited: row.userEdited === true ? true : undefined,
        storeId: row.storeId,
        storeLabel: String(row.storeLabel || '').trim() || undefined,
        bucketLabel: String(row.bucketLabel || '').trim() || undefined,
        aisleId: row.aisleId,
        aisleSortOrder: row.aisleSortOrder,
        orderIndex: row.order,
      });
    });
    overrides.sort((a, b) =>
      String(a.sourceKey).localeCompare(String(b.sourceKey)),
    );
    return { version: 1, overrides };
  }

  function shoppingPlanHasContentSelections(plan) {
    const helper =
      global.__shoppingStateSaveGuardHelpers &&
      typeof global.__shoppingStateSaveGuardHelpers
        .shoppingPlanHasContentSelections === 'function'
        ? global.__shoppingStateSaveGuardHelpers.shoppingPlanHasContentSelections
        : null;
    if (helper) return helper(plan);
    const normalized = plan && typeof plan === 'object' ? plan : {};
    return (
      Object.keys(normalized.itemSelections || {}).length > 0 ||
      Object.keys(normalized.recipeSelections || {}).length > 0 ||
      Object.keys(normalized.recipeSelectionRoots || {}).length > 0
    );
  }

  function hasSaveablePlanContent() {
    const normalizeShoppingPlan =
      typeof global.normalizeShoppingPlan === 'function'
        ? global.normalizeShoppingPlan
        : (p) => p;
    const getShoppingPlan =
      typeof global.getShoppingPlan === 'function'
        ? global.getShoppingPlan
        : () => null;
    return shoppingPlanHasContentSelections(
      normalizeShoppingPlan(getShoppingPlan()),
    );
  }

  function computeLocalFingerprint() {
    const normalizeShoppingPlan =
      typeof global.normalizeShoppingPlan === 'function'
        ? global.normalizeShoppingPlan
        : (p) => p;
    const normalizeShoppingListDoc =
      typeof global.normalizeShoppingListDoc === 'function'
        ? global.normalizeShoppingListDoc
        : (d) => d;
    const getShoppingPlan =
      typeof global.getShoppingPlan === 'function'
        ? global.getShoppingPlan
        : () => null;
    const getAuthoritativeShoppingListDoc =
      typeof global.getAuthoritativeShoppingListDoc === 'function'
        ? global.getAuthoritativeShoppingListDoc
        : () => null;

    const plan = normalizeShoppingPlan(getShoppingPlan());
    const listDoc = normalizeShoppingListDoc(getAuthoritativeShoppingListDoc());
    const listOverrides = extractListOverridesState(listDoc);
    return stableStringify({ plan, listOverrides });
  }

  function isDirty() {
    if (!baselineFingerprint) {
      return (
        computeLocalFingerprint() !==
        stableStringify({
          plan: {
            version: 1,
            itemSelections: {},
            recipeSelections: {},
            recipeSelectionRoots: {},
            storeOrder: [],
            selectedStoreIds: [],
          },
          listOverrides: { version: 1, overrides: [] },
        })
      );
    }
    return computeLocalFingerprint() !== baselineFingerprint;
  }

  function setBaselineFromServer(result) {
    if (!result || typeof result !== 'object') return;
    if (result.activeNamedSnapshotId != null) {
      const id = Number(result.activeNamedSnapshotId);
      activeNamedSnapshotId =
        Number.isFinite(id) && id > 0 ? id : activeNamedSnapshotId;
    }
    if (result.name != null && String(result.name).trim()) {
      activeNamedName = String(result.name).trim();
    }
    if (result.snapshotName != null && String(result.snapshotName).trim()) {
      activeNamedName = String(result.snapshotName).trim();
    }
    if (result.hasNamedSnapshot != null) {
      hasNamedSnapshot = !!result.hasNamedSnapshot;
    } else if (result.activeNamedSnapshotId != null) {
      hasNamedSnapshot = true;
    }
    baselineFingerprint = computeLocalFingerprint();
    persistSessionMirror();
    syncShoppingListPlanSessionSaveButtonState();
  }

  function setBaselineFromCurrentLiveState() {
    baselineFingerprint = computeLocalFingerprint();
    persistSessionMirror();
    syncShoppingListPlanSessionSaveButtonState();
  }

  async function refreshCatalogFromServer() {
    if (
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.listPlanSessions !== 'function'
    ) {
      return;
    }
    try {
      global.dataService.useSupabase = true;
      const catalog = await global.dataService.listPlanSessions();
      if (!catalog || typeof catalog !== 'object') return;
      hasNamedSnapshot = !!catalog.hasNamedSnapshot;
      const activeId = Number(catalog.activeNamedSnapshotId);
      if (Number.isFinite(activeId) && activeId > 0) {
        activeNamedSnapshotId = activeId;
        const named = Array.isArray(catalog.named) ? catalog.named : [];
        const active = named.find((row) => Number(row?.id) === activeId);
        if (active && active.name) {
          activeNamedName = String(active.name);
        }
      }
      persistSessionMirror();
    } catch (err) {
      console.warn('listPlanSessions failed:', err);
    }
  }

  function suppressAutoSave() {
    autoSaveSuppressed = true;
  }

  function releaseAutoSave() {
    autoSaveSuppressed = false;
  }

  function beginSessionCommitBatch() {
    sessionCommitBatchDepth += 1;
  }

  function endSessionCommitBatch() {
    sessionCommitBatchDepth = Math.max(0, sessionCommitBatchDepth - 1);
    if (sessionCommitBatchDepth === 0 && sessionCommitBatchPending) {
      sessionCommitBatchPending = false;
      void runAutoSaveNow();
    }
  }

  function buildAutoSaveCapturePayload() {
    const normalizeShoppingPlan =
      typeof global.normalizeShoppingPlan === 'function'
        ? global.normalizeShoppingPlan
        : (p) => p;
    const normalizeShoppingListDoc =
      typeof global.normalizeShoppingListDoc === 'function'
        ? global.normalizeShoppingListDoc
        : (d) => d;
    const getShoppingPlan =
      typeof global.getShoppingPlan === 'function'
        ? global.getShoppingPlan
        : () => null;
    const getAuthoritativeShoppingListDoc =
      typeof global.getAuthoritativeShoppingListDoc === 'function'
        ? global.getAuthoritativeShoppingListDoc
        : () => null;

    const planState = normalizeShoppingPlan(getShoppingPlan());
    const listDoc = normalizeShoppingListDoc(getAuthoritativeShoppingListDoc());
    return {
      planState,
      listOverridesState: extractListOverridesState(listDoc),
    };
  }

  function enqueueAutoSaveCapture() {
    autoSaveCaptureQueue.push(buildAutoSaveCapturePayload());
  }

  async function drainAutoSaveCaptureQueue() {
    if (
      autoSaveSuppressed ||
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.createAutoPlanSession !== 'function'
    ) {
      autoSaveCaptureQueue.length = 0;
      return;
    }
    if (autoSaveInFlight) return;
    autoSaveInFlight = true;
    try {
      while (autoSaveCaptureQueue.length > 0) {
        const capture = autoSaveCaptureQueue.shift();
        try {
          global.dataService.useSupabase = true;
          await global.dataService.createAutoPlanSession(capture);
        } catch (err) {
          console.warn('createAutoPlanSession failed:', err);
        }
      }
    } finally {
      autoSaveInFlight = false;
      if (autoSaveCaptureQueue.length > 0) {
        void drainAutoSaveCaptureQueue();
      }
    }
  }

  async function runAutoSaveNow() {
    enqueueAutoSaveCapture();
    await drainAutoSaveCaptureQueue();
  }

  function onRemoteSessionCommit(options) {
    syncShoppingListPlanSessionSaveButtonState();
    const kind =
      options && typeof options === 'object' ? String(options.kind || '') : '';
    if (kind !== 'plan' && kind !== 'listConfig') return;
    if (
      autoSaveSuppressed ||
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.createAutoPlanSession !== 'function'
    ) {
      return;
    }
    if (sessionCommitBatchDepth > 0) {
      sessionCommitBatchPending = true;
      return;
    }
    void runAutoSaveNow();
  }

  async function resolveDirtyNamedSessionBeforeAction(actionPhrase) {
    if (!isDirty() || activeNamedSnapshotId == null) return true;
    const phrase = String(actionPhrase || '').trim();
    const sessionName = String(activeNamedName || '').trim();
    const unsavedMessage = sessionName
      ? 'The meal plan “' +
        sessionName +
        '” has unsaved changes. Would you like to save it before ' +
        phrase +
        '?'
      : 'This meal plan has unsaved changes. Would you like to save it before ' +
        phrase +
        '?';
    const ui = global.ui;
    if (!ui || typeof ui.dialogThreeChoice !== 'function') {
      return global.confirm(
        sessionName
          ? 'The meal plan “' +
              sessionName +
              '” has unsaved changes. Continue without saving?'
          : 'This meal plan has unsaved changes. Continue without saving?',
      );
    }
    const choice = await ui.dialogThreeChoice({
      title: 'Unsaved changes',
      message: unsavedMessage,
      fixText: 'Cancel',
      discardText: 'No, discard changes',
      createText: 'Yes, save first',
      dismissChoice: 'fix',
    });
    if (choice === 'fix') return false;
    if (choice === 'create') {
      if (!hasSaveablePlanContent()) return false;
      const nameToSave = String(activeNamedName || '').trim();
      if (!nameToSave) return false;
      const saved = await persistNamedSessionWithName(nameToSave);
      return saved === true;
    }
    baselineFingerprint = computeLocalFingerprint();
    persistSessionMirror();
    return true;
  }

  async function resolveDirtyBeforeLoadNamedSession() {
    return resolveDirtyNamedSessionBeforeAction('loading another meal plan');
  }

  async function resolveDirtyBeforeClearAllItems() {
    return resolveDirtyNamedSessionBeforeAction('clearing all items');
  }

  async function resolveDirtyBeforeCloseNamedSession() {
    return resolveDirtyNamedSessionBeforeAction('closing this session');
  }

  async function confirmReplaceExistingSession(sessionName) {
    const label = String(sessionName || '').trim();
    const message = label
      ? 'A session named “' + label + '” already exists.'
      : 'A session with this name already exists.';
    const ui = global.ui;
    if (ui && typeof ui.dialogThreeChoice === 'function') {
      const choice = await ui.dialogThreeChoice({
        title: 'Replace existing session?',
        message,
        fixText: 'Cancel',
        discardText: 'Go back',
        createText: 'Save',
        dismissChoice: 'fix',
      });
      if (choice === 'create') return 'overwrite';
      if (choice === 'discard') return 'go_back';
      return 'cancel';
    }
    if (ui && typeof ui.dialog === 'function') {
      const res = await ui.dialog({
        title: 'Replace existing session?',
        message,
        confirmText: 'Save',
        cancelText: 'Cancel',
        showCancel: true,
      });
      return res ? 'overwrite' : 'cancel';
    }
    const ok = global.confirm(message + ' Overwrite it?');
    return ok ? 'overwrite' : 'cancel';
  }

  function findNamedSessionByName(namedRows, name) {
    const needle = String(name || '').trim();
    if (!needle) return null;
    const rows = Array.isArray(namedRows) ? namedRows : [];
    return (
      rows.find((row) => String(row?.name || '').trim() === needle) || null
    );
  }

  async function loadNamedSessionCatalog() {
    await refreshCatalogFromServer();
    if (
      !global.dataService ||
      typeof global.dataService.listPlanSessions !== 'function'
    ) {
      return { named: [] };
    }
    global.dataService.useSupabase = true;
    const catalog = await global.dataService.listPlanSessions();
    return {
      named: Array.isArray(catalog?.named) ? catalog.named : [],
    };
  }

  async function finishNamedSessionSave(result, name) {
    const trimmed = String(name || '').trim();
    setBaselineFromServer({
      ...result,
      hasNamedSnapshot: true,
      name: trimmed,
    });
    hasNamedSnapshot = true;
    activeNamedName = trimmed;
    persistSessionMirror();
    if (typeof global.uiToast === 'function') {
      global.uiToast('Meal plan saved.');
    }
    return true;
  }

  async function persistNamedSessionWithName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    if (!hasSaveablePlanContent()) return false;
    const activeName = String(activeNamedName || '').trim();
    try {
      global.dataService.useSupabase = true;
      if (
        activeNamedSnapshotId != null &&
        activeName !== '' &&
        trimmed === activeName
      ) {
        const result = await global.dataService.updateNamedPlanSession(
          activeNamedSnapshotId,
          trimmed,
        );
        return finishNamedSessionSave(result, trimmed);
      }
      const { named } = await loadNamedSessionCatalog();
      const existing = findNamedSessionByName(named, trimmed);
      if (!existing) {
        const result = await global.dataService.createNamedPlanSession(trimmed);
        return finishNamedSessionSave(result, trimmed);
      }
      const collisionChoice = await confirmReplaceExistingSession(trimmed);
      if (collisionChoice === 'go_back') return 'go_back';
      if (collisionChoice !== 'overwrite') return false;
      const result = await global.dataService.updateNamedPlanSession(
        Number(existing.id),
        trimmed,
      );
      return finishNamedSessionSave(result, trimmed);
    } catch (err) {
      console.warn('named plan session save failed:', err);
      if (typeof global.uiToast === 'function') {
        global.uiToast('Could not save meal plan.');
      }
      return false;
    }
  }

  function planSessionSaveConfirmText(name) {
    const trimmed = String(name || '').trim();
    const activeName = String(activeNamedName || '').trim();
    if (
      activeNamedSnapshotId != null &&
      activeName !== '' &&
      trimmed === activeName
    ) {
      return 'Update';
    }
    return 'Save';
  }

  async function promptSessionName(options = {}) {
    const ui = global.ui;
    const initialValue =
      options.initialValue != null
        ? String(options.initialValue)
        : formatDefaultSessionName();
    const placeholder = formatDefaultSessionName();
    const normalizeName = (v) => String(v || '').trim();
    if (ui && typeof ui.prompt === 'function') {
      const name = await ui.prompt({
        title: 'Save meal plan',
        message: options.message || '',
        label: options.label || SESSION_NAME_FIELD_LABEL,
        value: initialValue,
        placeholder,
        confirmText: options.confirmText || 'Save',
        getConfirmText: (vals) =>
          planSessionSaveConfirmText(
            normalizeName(vals?.value != null ? vals.value : ''),
          ),
        cancelText: 'Cancel',
        required: true,
        normalize: normalizeName,
      });
      return name != null ? String(name).trim() : null;
    }
    const raw = global.prompt(
      options.message || SESSION_NAME_FIELD_LABEL,
      initialValue,
    );
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    return trimmed || null;
  }

  async function openSaveDialog() {
    if (
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.createNamedPlanSession !== 'function'
    ) {
      if (typeof global.uiToast === 'function') {
        global.uiToast('Saving sessions requires a connected account.');
      }
      return false;
    }
    if (!hasSaveablePlanContent()) return false;
    await refreshCatalogFromServer();

    let initialValue = activeNamedName || formatDefaultSessionName();
    const saveMessage = hasNamedSnapshot
      ? 'Saved sessions are kept until you delete them and can be loaded at any time.'
      : 'Save this meal plan? Saved sessions are kept until you delete them and can be loaded at any time.';

    while (true) {
      const name = await promptSessionName({
        message: saveMessage,
        initialValue,
      });
      if (!name) return false;
      initialValue = name;
      const result = await persistNamedSessionWithName(name);
      if (result === 'go_back') continue;
      return result === true;
    }
  }

  function formatSessionSavedAt(savedAt) {
    if (!savedAt) return '';
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) return String(savedAt);
    return formatSessionTimestamp(date);
  }

  function filterSessionsFromCatalog(catalog, sessions) {
    const removeIds = new Set(
      (Array.isArray(sessions) ? sessions : []).map((session) =>
        String(session.id),
      ),
    );
    return {
      named: (Array.isArray(catalog?.named) ? catalog.named : []).filter(
        (session) => !removeIds.has(String(session.id)),
      ),
      auto: (Array.isArray(catalog?.auto) ? catalog.auto : []).filter(
        (session) => !removeIds.has(String(session.id)),
      ),
    };
  }

  function catalogHasSessions(catalog) {
    const named = Array.isArray(catalog?.named) ? catalog.named : [];
    const auto = Array.isArray(catalog?.auto) ? catalog.auto : [];
    return named.length > 0 || auto.length > 0;
  }

  function createPlanSessionsModalSession() {
    const host = ensureDialogHost();
    const backdrop = document.createElement('div');
    backdrop.className = 'ui-dialog-backdrop';
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const prevFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let stepCleanups = [];
    let opened = false;

    const setPageInert = (inert) => {
      Array.from(document.body.children).forEach((el) => {
        if (el === host) return;
        if (inert) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
      });
    };

    const runStepCleanups = () => {
      stepCleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (_) {}
      });
      stepCleanups = [];
    };

    const prepareStep = () => {
      runStepCleanups();
      panel.replaceChildren();
    };

    const addStepCleanup = (cleanup) => {
      if (typeof cleanup === 'function') stepCleanups.push(cleanup);
    };

    const open = () => {
      if (opened) return;
      opened = true;
      backdrop.appendChild(panel);
      host.appendChild(backdrop);
      host.dataset.open = '1';
      setPageInert(true);
    };

    const close = () => {
      if (!opened) return;
      opened = false;
      runStepCleanups();
      panel.replaceChildren();
      backdrop.remove();
      host.dataset.open = '0';
      setPageInert(false);
      try {
        prevFocus?.focus?.();
      } catch (_) {}
    };

    return {
      host,
      backdrop,
      panel,
      open,
      close,
      prepareStep,
      addStepCleanup,
    };
  }

  function presentEmptyCatalogStep(modalSession) {
    return new Promise((resolve) => {
      const { panel, prepareStep, addStepCleanup } = modalSession;
      prepareStep();
      panel.className = 'ui-dialog-panel';
      panel.setAttribute('aria-label', 'No meal plan sessions yet');

      const titleEl = document.createElement('h2');
      titleEl.className = 'ui-dialog-title';
      titleEl.textContent = 'No meal plan sessions yet';
      panel.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'ui-dialog-body';
      bodyEl.textContent =
        'Save a meal plan session anytime to see it here, along with automatic backups.';
      panel.appendChild(bodyEl);

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'button-filled';
      closeBtn.textContent = 'Close';

      const finish = () => {
        resolve(true);
      };

      const onKeyDown = (event) => {
        if (!event) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish();
        }
      };

      closeBtn.addEventListener('click', finish);
      actions.appendChild(closeBtn);
      panel.appendChild(actions);
      addStepCleanup(() => {
        panel.removeEventListener('keydown', onKeyDown, true);
      });
      panel.addEventListener('keydown', onKeyDown, true);
      window.setTimeout(() => {
        try {
          closeBtn.focus();
        } catch (_) {}
      }, 0);
    });
  }

  function presentDeleteConfirmStep(modalSession, sessionCount = 1) {
    return new Promise((resolve) => {
      const { panel, prepareStep, addStepCleanup } = modalSession;
      prepareStep();
      panel.className = 'ui-dialog-panel';

      const count = Math.max(1, Number(sessionCount) || 1);
      const plural = count > 1;
      const title = plural ? 'Delete sessions?' : 'Delete session?';
      const message = plural
        ? `Are you sure you want to permanently delete ${count} saved sessions? This action cannot be undone.`
        : 'Are you sure you want to permanently delete this saved session? This action cannot be undone.';

      panel.setAttribute('aria-label', title);

      const titleEl = document.createElement('h2');
      titleEl.className = 'ui-dialog-title';
      titleEl.textContent = title;
      panel.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'ui-dialog-body';
      bodyEl.textContent = message;
      panel.appendChild(bodyEl);

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'button-filled button-filled--secondary';
      cancelBtn.textContent = 'Cancel';

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'button-filled button-filled--danger';
      confirmBtn.textContent = 'Delete forever';

      let settled = false;
      const finish = (confirmed) => {
        if (settled) return;
        settled = true;
        resolve(!!confirmed);
      };

      const onKeyDown = (event) => {
        if (!event) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      };

      cancelBtn.addEventListener('click', () => finish(false));
      confirmBtn.addEventListener('click', () => finish(true));
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      panel.appendChild(actions);
      addStepCleanup(() => {
        panel.removeEventListener('keydown', onKeyDown, true);
      });
      panel.addEventListener('keydown', onKeyDown, true);
      window.setTimeout(() => {
        try {
          confirmBtn.focus();
        } catch (_) {}
      }, 0);
    });
  }

  function presentSessionPickerStep(modalSession, catalog) {
    return new Promise((resolve) => {
      const { panel, backdrop, prepareStep, addStepCleanup } = modalSession;
      prepareStep();
      panel.className = 'ui-dialog-panel ui-dialog-panel--plan-sessions';
      panel.setAttribute('aria-label', 'Manage meal plan sessions');

      const named = Array.isArray(catalog?.named) ? catalog.named : [];
      const auto = Array.isArray(catalog?.auto) ? catalog.auto : [];

      const titleEl = document.createElement('h2');
      titleEl.className = 'ui-dialog-title';
      titleEl.textContent = 'Manage meal plan sessions';
      panel.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'ui-dialog-body';
      bodyEl.textContent =
        'Choose a meal plan to load, or choose one or more meal plan sessions to delete.';
      panel.appendChild(bodyEl);

      const listWrap = document.createElement('div');
      listWrap.className = 'ui-plan-session-list-wrap';
      const listEl = document.createElement('div');
      listEl.className = 'ui-plan-session-list';
      listEl.setAttribute('role', 'listbox');
      listEl.setAttribute('aria-multiselectable', 'true');

      const selectedSessions = new Map();
      const sessionById = new Map();
      const orderedSessionIds = [];
      let selectionAnchorId = null;

      const registerSession = (session) => {
        const sessionId = String(session.id);
        sessionById.set(sessionId, session);
        orderedSessionIds.push(sessionId);
      };

      const syncRowSelection = () => {
        listEl.querySelectorAll('.ui-plan-session-row').forEach((row) => {
          const sessionId = row.dataset.sessionId;
          const selected = selectedSessions.has(sessionId);
          row.classList.toggle('is-selected', selected);
          row.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };

      const selectOnly = (sessionId) => {
        const id = String(sessionId);
        selectedSessions.clear();
        const session = sessionById.get(id);
        if (session) selectedSessions.set(id, session);
        selectionAnchorId = id;
        syncRowSelection();
        syncActions();
      };

      const selectRange = (anchorId, targetId) => {
        const anchorIdx = orderedSessionIds.indexOf(String(anchorId));
        const targetIdx = orderedSessionIds.indexOf(String(targetId));
        if (anchorIdx < 0 || targetIdx < 0) {
          selectOnly(targetId);
          return;
        }
        const lo = Math.min(anchorIdx, targetIdx);
        const hi = Math.max(anchorIdx, targetIdx);
        selectedSessions.clear();
        for (let i = lo; i <= hi; i += 1) {
          const id = orderedSessionIds[i];
          const session = sessionById.get(id);
          if (session) selectedSessions.set(id, session);
        }
        syncRowSelection();
        syncActions();
      };

      const toggleSession = (sessionId) => {
        const id = String(sessionId);
        if (selectedSessions.has(id)) {
          selectedSessions.delete(id);
        } else {
          const session = sessionById.get(id);
          if (session) selectedSessions.set(id, session);
        }
        selectionAnchorId = id;
        syncRowSelection();
        syncActions();
      };

      const selectAllSessions = () => {
        selectedSessions.clear();
        orderedSessionIds.forEach((id) => {
          const session = sessionById.get(id);
          if (session) selectedSessions.set(id, session);
        });
        selectionAnchorId = orderedSessionIds[0] ?? null;
        syncRowSelection();
        syncActions();
      };

      const isSelectAllShortcut = (event) =>
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        String(event.key || '').toLowerCase() === 'a';

      const wireSessionRow = (btn, session) => {
        registerSession(session);
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', 'false');
        btn.addEventListener('click', (event) => {
          const sessionId = String(session.id);
          if (event.shiftKey && selectionAnchorId != null) {
            selectRange(selectionAnchorId, sessionId);
            return;
          }
          if (event.metaKey || event.ctrlKey) {
            toggleSession(sessionId);
            return;
          }
          selectOnly(sessionId);
        });
        listEl.appendChild(btn);
      };

      const renderNamedSessionRows = (sessions) => {
        sessions.forEach((session) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ui-plan-session-row ui-plan-session-row--named';
          btn.dataset.sessionId = String(session.id);
          const label = document.createElement('span');
          label.className = 'ui-plan-session-row-label';
          label.textContent = String(session.name || 'Untitled');
          const meta = document.createElement('span');
          meta.className = 'ui-plan-session-row-meta';
          meta.textContent = formatSessionSavedAt(session.savedAt);
          btn.appendChild(label);
          btn.appendChild(meta);
          wireSessionRow(btn, session);
        });
      };

      const renderAutoSessionRows = (sessions) => {
        sessions.forEach((session) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ui-plan-session-row ui-plan-session-row--auto';
          btn.dataset.sessionId = String(session.id);
          const label = document.createElement('span');
          label.className = 'ui-plan-session-row-label';
          const savedLabel =
            formatSessionSavedAt(session.savedAt) ||
            String(session.name || 'Untitled');
          label.textContent = savedLabel;
          btn.appendChild(label);
          wireSessionRow(btn, session);
        });
      };

      renderNamedSessionRows(named);
      if (auto.length) {
        if (named.length) {
          const divider = document.createElement('div');
          divider.className = 'ui-plan-session-divider';
          divider.setAttribute('role', 'separator');
          listEl.appendChild(divider);
        }
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'ui-plan-session-section-title';
        sectionTitle.textContent = 'Auto-Saved Sessions';
        listEl.appendChild(sectionTitle);
        renderAutoSessionRows(auto);
      }

      listWrap.appendChild(listEl);
      panel.appendChild(listWrap);

      const actions = document.createElement('div');
      actions.className =
        'ui-dialog-actions ui-dialog-actions--three ui-dialog-actions--plan-sessions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'button-filled button-filled--secondary';
      cancelBtn.textContent = 'Done';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'button-filled button-filled--secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.disabled = true;

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'button-filled';
      loadBtn.textContent = 'Load';
      loadBtn.disabled = true;

      const syncActions = () => {
        const count = selectedSessions.size;
        deleteBtn.disabled = count === 0;
        loadBtn.disabled = count !== 1;
        deleteBtn.textContent =
          count > 1 ? `Delete (${count})` : 'Delete';
      };

      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const onPanelKeyDown = (event) => {
        if (!event) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
          return;
        }
        if (isSelectAllShortcut(event)) {
          event.preventDefault();
          event.stopPropagation();
          selectAllSessions();
        }
      };

      const onDocumentKeyDown = (event) => {
        if (!event || !backdrop.isConnected) return;
        const path =
          typeof event.composedPath === 'function' ? event.composedPath() : null;
        const insidePanel = path
          ? path.includes(panel)
          : panel.contains(event.target);
        if (insidePanel) return;
        event.preventDefault();
        event.stopPropagation();
        if (isSelectAllShortcut(event)) {
          selectAllSessions();
        }
      };

      addStepCleanup(() => {
        document.removeEventListener('keydown', onDocumentKeyDown, true);
        panel.removeEventListener('keydown', onPanelKeyDown, true);
      });

      cancelBtn.addEventListener('click', () => finish(null));
      deleteBtn.addEventListener('click', () => {
        if (selectedSessions.size === 0) return;
        finish({
          action: 'delete',
          sessions: Array.from(selectedSessions.values()),
        });
      });
      loadBtn.addEventListener('click', () => {
        if (selectedSessions.size !== 1) return;
        finish({
          action: 'load',
          session: selectedSessions.values().next().value,
        });
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(deleteBtn);
      actions.appendChild(loadBtn);
      panel.appendChild(actions);

      listEl.tabIndex = 0;
      panel.addEventListener('keydown', onPanelKeyDown, true);
      document.addEventListener('keydown', onDocumentKeyDown, true);
      window.setTimeout(() => {
        try {
          listEl.focus();
        } catch (_) {}
      }, 0);
    });
  }

  async function fetchPlanSessionCatalog() {
    global.dataService.useSupabase = true;
    return global.dataService.listPlanSessions();
  }

  async function deletePlanSessionsWithFeedback(sessions) {
    let deletedCount = 0;
    let failed = false;
    let clearedActiveNamed = false;
    for (const session of sessions) {
      try {
        await global.dataService.deletePlanSession(session.id);
        deletedCount += 1;
        if (
          activeNamedSnapshotId != null &&
          Number(session.id) === Number(activeNamedSnapshotId)
        ) {
          activeNamedSnapshotId = null;
          activeNamedName = '';
          clearedActiveNamed = true;
        }
      } catch (err) {
        failed = true;
        console.warn('deletePlanSession failed:', err);
      }
    }
    if (clearedActiveNamed) {
      await refreshCatalogFromServer();
    }
    if (typeof global.uiToast === 'function') {
      if (failed && deletedCount === 0) {
        global.uiToast('Could not delete sessions.');
      } else if (failed) {
        global.uiToast(
          deletedCount === 1
            ? 'Deleted 1 session; some could not be removed.'
            : `Deleted ${deletedCount} sessions; some could not be removed.`,
        );
      } else {
        global.uiToast(
          deletedCount === 1
            ? 'Session deleted.'
            : `${deletedCount} sessions deleted.`,
        );
      }
    }
    return deletedCount;
  }

  async function loadManagedPlanSession(session) {
    const ok = await resolveDirtyBeforeLoadNamedSession();
    if (!ok) return false;
    try {
      suppressAutoSave();
      const result = await global.dataService.loadPlanSession(session.id);
      if (typeof global.favoriteEatsApplyLoadedPlanSession === 'function') {
        await global.favoriteEatsApplyLoadedPlanSession(result);
      }
      setBaselineFromServer({
        contentFingerprint: result.contentFingerprint,
        activeNamedSnapshotId: result.activeNamedSnapshotId,
        snapshotName: result.snapshotName,
        hasNamedSnapshot: !!result.activeNamedSnapshotId,
      });
      if (typeof global.uiToast === 'function') {
        global.uiToast('Meal plan loaded.');
      }
      return 'loaded';
    } catch (err) {
      console.warn('loadPlanSession failed:', err);
      if (typeof global.uiToast === 'function') {
        global.uiToast('Could not load session.');
      }
      return false;
    } finally {
      releaseAutoSave();
    }
  }

  async function openManageDialog() {
    if (
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.listPlanSessions !== 'function'
    ) {
      if (typeof global.uiToast === 'function') {
        global.uiToast('Manage sessions requires a connected account.');
      }
      return false;
    }

    let catalog;
    try {
      catalog = await fetchPlanSessionCatalog();
    } catch (err) {
      console.warn('listPlanSessions failed:', err);
      if (typeof global.uiToast === 'function') {
        global.uiToast('Could not load saved sessions.');
      }
      return false;
    }

    if (!catalogHasSessions(catalog)) {
      const ui = global.ui;
      if (ui && typeof ui.dialog === 'function') {
        await ui.dialog({
          title: 'No meal plan sessions yet',
          message:
            'Save a meal plan session anytime to see it here, along with automatic backups.',
          confirmText: 'Close',
          showCancel: false,
        });
      } else {
        global.alert(
          'No meal plan sessions yet\n\nSave a meal plan session anytime to see it here, along with automatic backups.',
        );
      }
      return false;
    }

    const modal = createPlanSessionsModalSession();
    modal.open();

    try {
      let picked = await presentSessionPickerStep(modal, catalog);

      while (picked) {
        if (!picked.action) {
          modal.close();
          return false;
        }

        if (picked.action === 'load') {
          const loadResult = await loadManagedPlanSession(picked.session);
          if (loadResult === 'loaded') {
            modal.close();
            return 'loaded';
          }
          picked = await presentSessionPickerStep(modal, catalog);
          continue;
        }

        if (picked.action === 'delete') {
          const sessions = Array.isArray(picked.sessions) ? picked.sessions : [];
          if (!sessions.length) {
            modal.close();
            return false;
          }

          const confirmed = await presentDeleteConfirmStep(modal, sessions.length);
          if (!confirmed) {
            picked = await presentSessionPickerStep(modal, catalog);
            continue;
          }

          catalog = filterSessionsFromCatalog(catalog, sessions);
          const deleteWork = deletePlanSessionsWithFeedback(sessions);

          if (!catalogHasSessions(catalog)) {
            await Promise.all([presentEmptyCatalogStep(modal), deleteWork]);
            modal.close();
            return false;
          }

          picked = await presentSessionPickerStep(modal, catalog);
          await deleteWork;
          try {
            catalog = await fetchPlanSessionCatalog();
          } catch (err) {
            console.warn('listPlanSessions failed:', err);
          }
          if (!picked) {
            modal.close();
            return false;
          }
          continue;
        }

        modal.close();
        return false;
      }

      modal.close();
      return false;
    } catch (err) {
      modal.close();
      throw err;
    }
  }

  function syncShoppingListPlanSessionSaveButtonState(saveBtn, options = {}) {
    const btn =
      saveBtn instanceof HTMLButtonElement
        ? saveBtn
        : document.getElementById('appBarSaveBtn');
    if (!(btn instanceof HTMLButtonElement)) return;
    const visible = options.visible !== false;
    if (!visible) {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
      return;
    }
    btn.style.display = 'inline-flex';
    btn.setAttribute('aria-hidden', 'false');
    const saveEnabled = hasSaveablePlanContent();
    btn.disabled = !saveEnabled;
    if (saveEnabled) {
      btn.removeAttribute('disabled');
    } else {
      btn.setAttribute('disabled', '');
    }
    btn.setAttribute('aria-disabled', saveEnabled ? 'false' : 'true');
    if (typeof global.setAppBarTextActionLabel === 'function') {
      global.setAppBarTextActionLabel(btn, 'Save');
    } else {
      const label = btn.querySelector('.app-bar-action-label');
      if (label) label.textContent = 'Save';
    }
  }

  function wireShoppingListSaveButton(saveBtn) {
    syncShoppingListPlanSessionSaveButtonState(saveBtn);
    const btn =
      saveBtn instanceof HTMLButtonElement
        ? saveBtn
        : document.getElementById('appBarSaveBtn');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (btn.dataset.planSessionSaveWired === '1') return;
    btn.dataset.planSessionSaveWired = '1';
    btn.addEventListener('click', () => {
      void openSaveDialog();
    });
  }

  function createManageMonogramButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'appBarMonogramManagePlanSessionsBtn';
    btn.className = 'bottom-nav-pill';
    btn.textContent = 'Manage sessions';
    btn.addEventListener('click', () => {
      void openManageDialog().then((result) => {
        if (result === 'loaded') {
          try {
            global.location.reload();
          } catch (_) {}
        }
      });
    });
    return btn;
  }

  async function closeActiveNamedSession() {
    if (
      !shouldUseRemote() ||
      !global.dataService ||
      typeof global.dataService.closeActivePlanSession !== 'function'
    ) {
      if (typeof global.uiToast === 'function') {
        global.uiToast('Closing sessions requires a connected account.');
      }
      return false;
    }
    if (activeNamedSnapshotId == null) return false;

    const dirtyOk = await resolveDirtyBeforeCloseNamedSession();
    if (!dirtyOk) return false;

    try {
      global.dataService.useSupabase = true;
      await global.dataService.closeActivePlanSession();
      activeNamedSnapshotId = null;
      activeNamedName = '';
      setBaselineFromCurrentLiveState();
      persistSessionMirror();
      if (typeof global.uiToast === 'function') {
        global.uiToast('Session closed.');
      }
      if (typeof global.favoriteEatsCloseMonogramAccountMenu === 'function') {
        global.favoriteEatsCloseMonogramAccountMenu();
      }
      return true;
    } catch (err) {
      console.warn('closeActivePlanSession failed:', err);
      if (typeof global.uiToast === 'function') {
        global.uiToast('Could not close session.');
      }
      return false;
    }
  }

  function syncPlanSessionMonogramButtonState(manageBtn, closeBtn) {
    if (manageBtn instanceof HTMLButtonElement) {
      manageBtn.disabled = false;
      manageBtn.setAttribute('aria-disabled', 'false');
    }
    if (closeBtn instanceof HTMLButtonElement) {
      const canClose = activeNamedSnapshotId != null;
      closeBtn.disabled = !canClose;
      closeBtn.setAttribute('aria-disabled', canClose ? 'false' : 'true');
    }
  }

  function createCloseSessionMonogramButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'appBarMonogramClosePlanSessionBtn';
    btn.className = 'bottom-nav-pill';
    btn.textContent = 'Close this session';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      void closeActiveNamedSession();
    });
    return btn;
  }

  global.favoriteEatsPlanSession = {
    refreshCatalogFromServer,
    openSaveDialog,
    openManageDialog,
    wireShoppingListSaveButton,
    syncShoppingListPlanSessionSaveButtonState,
    createManageMonogramButton,
    createCloseSessionMonogramButton,
    syncPlanSessionMonogramButtonState,
    closeActiveNamedSession,
    onRemoteSessionCommit,
    beginSessionCommitBatch,
    endSessionCommitBatch,
    setBaselineFromServer,
    setBaselineFromCurrentLiveState,
    suppressAutoSave,
    releaseAutoSave,
    isDirty,
    resolveDirtyBeforeClearAllItems,
    hasSaveablePlanContent,
    getHasNamedSnapshot: () => hasNamedSnapshot,
    getActiveNamedName: () => activeNamedName,
    getActiveNamedSnapshotId: () => activeNamedSnapshotId,
    formatDefaultSessionName,
  };
})(typeof window !== 'undefined' ? window : undefined);
