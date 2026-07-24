/**
 * Shared Plan/List input sync primitives.
 *
 * Charter: docs/spammable-input-charter.md.
 *
 * The queue applies local intent immediately, coalesces redundant ops per
 * `(surface, entityKey, field)` key, and flushes the latest intent to a
 * narrow RPC. Per-key version state powers the section F skip rule so
 * echoes and refresh hooks can drop stale or already-applied payloads
 * without leaning on time-window guards.
 */
(function favoriteEatsInputSyncModule(global) {
  if (!global) return;

  const DEFAULT_FLUSH_DELAY_MS = 120;

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function opKey(op) {
    if (!op || typeof op !== 'object') return '';
    const surface = normalizeText(op.surface);
    const entityKey = normalizeText(op.entityKey);
    const field = normalizeText(op.field);
    if (!surface || !entityKey || !field) return '';
    return `${surface}:${entityKey}:${field}`;
  }

  function cloneOp(op) {
    if (!op || typeof op !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(op));
    } catch (_) {
      return { ...op };
    }
  }

  function valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a !== 'object' && typeof b !== 'object') return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }

  // Compare two updated_at-like values. Returns -1 / 0 / 1 like a comparator,
  // or NaN if either side is unparseable. Accepts ISO strings, Dates, or epoch ms.
  function compareUpdatedAt(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    const ta = a instanceof Date ? a.getTime() : Date.parse(String(a));
    const tb = b instanceof Date ? b.getTime() : Date.parse(String(b));
    if (Number.isFinite(ta) && Number.isFinite(tb)) {
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    // Fallback to lexicographic compare on the raw string form (ISO 8601 sorts correctly).
    const sa = String(a);
    const sb = String(b);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  }

  function pickUpdatedAt(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.updated_at != null) return payload.updated_at;
    if (payload.updatedAt != null) return payload.updatedAt;
    return null;
  }

  function isStorageLike(storage) {
    return (
      storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function'
    );
  }

  function safeReadDurable(storage, storageKey) {
    if (!isStorageLike(storage) || !storageKey) return {};
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (_) {
      return {};
    }
  }

  function safeWriteDurable(storage, storageKey, mapObject) {
    if (!isStorageLike(storage) || !storageKey) return;
    try {
      const keys = Object.keys(mapObject || {});
      if (keys.length === 0) {
        storage.removeItem(storageKey);
        return;
      }
      storage.setItem(storageKey, JSON.stringify(mapObject));
    } catch (_) {
      // Swallow quota / serialization errors; durability is best-effort.
    }
  }

  function createCoalescedOpQueue(options = {}) {
    const flushDelayMs = Number.isFinite(Number(options.flushDelayMs))
      ? Math.max(0, Number(options.flushDelayMs))
      : DEFAULT_FLUSH_DELAY_MS;
    const setTimer =
      typeof options.setTimeout === 'function'
        ? options.setTimeout
        : global.setTimeout?.bind(global);
    const clearTimer =
      typeof options.clearTimeout === 'function'
        ? options.clearTimeout
        : global.clearTimeout?.bind(global);
    const flushOp =
      typeof options.flushOp === 'function' ? options.flushOp : async () => {};
    const onLocalApply =
      typeof options.onLocalApply === 'function'
        ? options.onLocalApply
        : () => {};
    const onFlushStart =
      typeof options.onFlushStart === 'function' ? options.onFlushStart : () => {};
    const onFlushSuccess =
      typeof options.onFlushSuccess === 'function'
        ? options.onFlushSuccess
        : () => {};
    const onFlushFailure =
      typeof options.onFlushFailure === 'function'
        ? options.onFlushFailure
        : () => {};

    const storageKey =
      typeof options.storageKey === 'string' && options.storageKey
        ? options.storageKey
        : null;
    const storage = isStorageLike(options.storage)
      ? options.storage
      : storageKey && isStorageLike(global.localStorage)
        ? global.localStorage
        : null;
    const durableEnabled = !!(storageKey && storage);

    /** @type {Map<string, object>} */
    const pending = new Map();
    /** @type {Map<string, object>} */
    const inFlight = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    const timers = new Map();
    /**
     * Per-key version state (charter §B′).
     * @type {Map<string, { lastAppliedServerUpdatedAt: string|null, lastLocalValue: unknown, hasLocalValue: boolean }>}
     */
    const keyState = new Map();

    function getOrCreateKeyState(key) {
      let state = keyState.get(key);
      if (!state) {
        state = {
          lastAppliedServerUpdatedAt: null,
          lastLocalValue: undefined,
          hasLocalValue: false,
          lastLocalQuantityUnspecified: false,
        };
        keyState.set(key, state);
      }
      return state;
    }

    function durableWriteSnapshot() {
      if (!durableEnabled) return;
      const snapshot = {};
      pending.forEach((op, key) => {
        snapshot[key] = op;
      });
      safeWriteDurable(storage, storageKey, snapshot);
    }

    function durableForgetKey(key) {
      if (!durableEnabled) return;
      const current = safeReadDurable(storage, storageKey);
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        delete current[key];
        safeWriteDurable(storage, storageKey, current);
      }
    }

    function clearScheduledFlush(key) {
      const timerId = timers.get(key);
      if (timerId && clearTimer) clearTimer(timerId);
      timers.delete(key);
    }

    function scheduleFlush(key) {
      if (!key || !setTimer) return;
      clearScheduledFlush(key);
      const timerId = setTimer(() => {
        timers.delete(key);
        void flushKey(key);
      }, flushDelayMs);
      timers.set(key, timerId);
    }

    async function flushKey(key) {
      if (!key || inFlight.has(key)) return false;
      const op = pending.get(key);
      if (!op) return false;
      pending.delete(key);
      inFlight.set(key, op);
      try {
        onFlushStart(cloneOp(op));
        const result = await flushOp(cloneOp(op));
        onFlushSuccess(cloneOp(op), result);
        // Capture server `updated_at` from RPC ack so same-device echoes
        // arriving later carry the same timestamp and get dropped by the
        // section F skip rule.
        const ackUpdatedAt = pickUpdatedAt(result);
        if (ackUpdatedAt != null) {
          const state = getOrCreateKeyState(key);
          if (
            state.lastAppliedServerUpdatedAt == null ||
            compareUpdatedAt(ackUpdatedAt, state.lastAppliedServerUpdatedAt) > 0
          ) {
            state.lastAppliedServerUpdatedAt = String(ackUpdatedAt);
          }
        }
        durableForgetKey(key);
      } catch (err) {
        onFlushFailure(cloneOp(op), err);
        // On failure leave the durable entry so a future boot/replay can
        // retry it. The pending in-memory op is intentionally NOT
        // re-enqueued here — the consumer can choose to revert + re-enqueue
        // via onFlushFailure.
      } finally {
        inFlight.delete(key);
        if (pending.has(key)) {
          scheduleFlush(key);
        }
      }
      return true;
    }

    function enqueue(op) {
      const key = opKey(op);
      if (!key) return false;
      const normalized = {
        ...cloneOp(op),
        key,
        clientSeq:
          Number.isFinite(Number(op.clientSeq)) && Number(op.clientSeq) > 0
            ? Number(op.clientSeq)
            : Date.now(),
        createdAt:
          Number.isFinite(Number(op.createdAt)) && Number(op.createdAt) > 0
            ? Number(op.createdAt)
            : Date.now(),
      };
      onLocalApply(cloneOp(normalized));
      pending.set(key, normalized);
      const state = getOrCreateKeyState(key);
      state.lastLocalValue = normalized.value;
      state.hasLocalValue = true;
      if (
        normalized.meta &&
        typeof normalized.meta === 'object' &&
        Object.prototype.hasOwnProperty.call(
          normalized.meta,
          'quantityUnspecified',
        )
      ) {
        state.lastLocalQuantityUnspecified =
          normalized.meta.quantityUnspecified === true;
      }
      if (durableEnabled) {
        const current = safeReadDurable(storage, storageKey);
        current[key] = normalized;
        safeWriteDurable(storage, storageKey, current);
      }
      scheduleFlush(key);
      return true;
    }

    function getPendingOp(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return key && pending.has(key) ? cloneOp(pending.get(key)) : null;
    }

    function hasPending(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return !!key && pending.has(key);
    }

    function getInFlightOp(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return key && inFlight.has(key) ? cloneOp(inFlight.get(key)) : null;
    }

    function hasInFlight(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      return !!key && inFlight.has(key);
    }

    // Snapshot of every key currently with a pending op. Used by per-key
    // merge helpers that need to override hydrate / refetch state for any
    // in-burst row (even one the server snapshot has not seen yet).
    function peekPendingKeys() {
      return Array.from(pending.keys());
    }

    function peekInFlightKeys() {
      return Array.from(inFlight.keys());
    }

    function flushAll() {
      const keys = Array.from(pending.keys()).filter((key) => !inFlight.has(key));
      keys.forEach(clearScheduledFlush);
      return Promise.all(keys.map((key) => flushKey(key)));
    }

    function size() {
      return pending.size;
    }

    // ──────────────────────────────────────────────────────────────────
    // Section F / G — per-key skip rule helpers
    // ──────────────────────────────────────────────────────────────────

    /**
     * Returns true if the consumer should DROP this echo / refresh patch
     * for the given key (charter §F.2).
     *
     * Skip conditions:
     *   1. A pending or in-flight local op exists for this key (mid-burst).
     *   2. The payload's updated_at is <= the last server timestamp the
     *      client already accepted for this key (stale / same-device echo).
     *   3. The payload's value already equals the rendered local value
     *      (no-op patch; nothing to do, don't churn the DOM).
     */
    function shouldSkipEcho(opLike, payload) {
      const key = typeof opLike === 'string' ? opLike : opKey(opLike || {});
      if (!key) return false;
      if (pending.has(key) || inFlight.has(key)) return true;
      const state = keyState.get(key);
      if (!state) return false;
      const payloadUpdatedAt = pickUpdatedAt(payload);
      if (
        payloadUpdatedAt != null &&
        state.lastAppliedServerUpdatedAt != null &&
        compareUpdatedAt(payloadUpdatedAt, state.lastAppliedServerUpdatedAt) <= 0
      ) {
        return true;
      }
      if (
        payload &&
        Object.prototype.hasOwnProperty.call(payload, 'value') &&
        state.hasLocalValue &&
        valuesEqual(payload.value, state.lastLocalValue)
      ) {
        return true;
      }
      return false;
    }

    /**
     * Record that the consumer applied this echo/refresh payload to the
     * canonical local container. Bumps per-key version state so future
     * echoes can be compared.
     */
    function recordEchoApplied(opLike, payload) {
      const key = typeof opLike === 'string' ? opLike : opKey(opLike || {});
      if (!key) return false;
      const state = getOrCreateKeyState(key);
      const payloadUpdatedAt = pickUpdatedAt(payload);
      if (payloadUpdatedAt != null) {
        if (
          state.lastAppliedServerUpdatedAt == null ||
          compareUpdatedAt(payloadUpdatedAt, state.lastAppliedServerUpdatedAt) >
            0
        ) {
          state.lastAppliedServerUpdatedAt = String(payloadUpdatedAt);
        }
      }
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'value')) {
        state.lastLocalValue = payload.value;
        state.hasLocalValue = true;
      }
      if (
        payload &&
        Object.prototype.hasOwnProperty.call(payload, 'quantityUnspecified')
      ) {
        state.lastLocalQuantityUnspecified =
          payload.quantityUnspecified === true;
      }
      return true;
    }

    /**
     * Seed per-key state from a boot/cold-start hydrate so the first
     * incoming echo for a key has something to compare against. Callers
     * should invoke this once per row/key after hydrating from
     * load_shopping_state or equivalent.
     */
    function seedKeyState(opLike, payload) {
      return recordEchoApplied(opLike, payload);
    }

    /** Session load / wholesale replace: drop per-key ack state so stale merges cannot splice rows back in. */
    function resetKeyStateForWholesaleApply() {
      keyState.clear();
    }

    /**
     * Wholesale plan replace (e.g. clear all): discard pending + durable ops
     * without flushing them, and drop per-key ack state so stale merges and
     * boot replay cannot resurrect rows the wholesale save removed.
     */
    function abortPendingForWholesaleApply() {
      pending.forEach((_, key) => clearScheduledFlush(key));
      pending.clear();
      if (durableEnabled) {
        safeWriteDurable(storage, storageKey, {});
      }
      keyState.clear();
    }

    /** Wait until in-flight narrow RPCs settle (best-effort, bounded). */
    async function awaitInFlightDrain(options = {}) {
      const timeoutMs = Number.isFinite(Number(options.timeoutMs))
        ? Math.max(0, Number(options.timeoutMs))
        : 10000;
      const pollMs = Number.isFinite(Number(options.pollMs))
        ? Math.max(1, Number(options.pollMs))
        : 16;
      const start = Date.now();
      while (inFlight.size > 0) {
        if (Date.now() - start >= timeoutMs) break;
        await new Promise((resolve) => {
          if (typeof global.setTimeout === 'function') {
            global.setTimeout(resolve, pollMs);
          } else {
            resolve();
          }
        });
      }
    }

    function getKeyState(keyOrOp) {
      const key =
        typeof keyOrOp === 'string' ? keyOrOp : opKey(keyOrOp || {});
      if (!key) return null;
      const state = keyState.get(key);
      if (!state) {
        return {
          lastAppliedServerUpdatedAt: null,
          lastLocalValue: undefined,
          hasLocalValue: false,
          lastLocalQuantityUnspecified: false,
          pending: false,
          inFlight: false,
        };
      }
      return {
        lastAppliedServerUpdatedAt: state.lastAppliedServerUpdatedAt,
        lastLocalValue: state.lastLocalValue,
        hasLocalValue: state.hasLocalValue,
        lastLocalQuantityUnspecified: state.lastLocalQuantityUnspecified === true,
        pending: pending.has(key),
        inFlight: inFlight.has(key),
      };
    }

    // ──────────────────────────────────────────────────────────────────
    // Section H — durable pending-op ring (pagehide resilience)
    // ──────────────────────────────────────────────────────────────────

    /**
     * Read whatever pending ops are sitting in durable storage from a
     * previous session. Does NOT mutate storage; callers should explicitly
     * re-enqueue via `enqueue(op)` and then either flush or trust the
     * normal flush timer.
     *
     * Returns ops in stable order (sorted by clientSeq, then createdAt).
     */
    function peekDurable() {
      if (!durableEnabled) return [];
      const map = safeReadDurable(storage, storageKey);
      const ops = Object.values(map).filter(
        (op) => op && typeof op === 'object',
      );
      ops.sort((a, b) => {
        const seqDelta = Number(a.clientSeq || 0) - Number(b.clientSeq || 0);
        if (seqDelta !== 0) return seqDelta;
        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      });
      return ops.map(cloneOp);
    }

    /**
     * Atomically read+clear durable storage. Returns the previously-stored
     * ops so the caller can replay them through `enqueue()`. Used once on
     * boot, before any user input is allowed to land on migrated keys.
     */
    function drainDurable() {
      const ops = peekDurable();
      if (durableEnabled) {
        try {
          storage.removeItem(storageKey);
        } catch (_) {
          // ignore
        }
      }
      return ops;
    }

    function isDurable() {
      return durableEnabled;
    }

    return {
      enqueue,
      flushAll,
      getPendingOp,
      hasPending,
      getInFlightOp,
      hasInFlight,
      opKey,
      size,
      shouldSkipEcho,
      recordEchoApplied,
      seedKeyState,
      resetKeyStateForWholesaleApply,
      abortPendingForWholesaleApply,
      awaitInFlightDrain,
      getKeyState,
      peekPendingKeys,
      peekInFlightKeys,
      peekDurable,
      drainDurable,
      isDurable,
      _flushKeyForTests: flushKey,
    };
  }

  global.favoriteEatsInputSync = {
    createCoalescedOpQueue,
    opKey,
    compareUpdatedAt,
    valuesEqual,
  };
})(typeof window !== 'undefined' ? window : globalThis);
