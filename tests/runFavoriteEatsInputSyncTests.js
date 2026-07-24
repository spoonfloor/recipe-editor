#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const modulePath = path.join(projectRoot, 'js', 'favoriteEatsInputSync.js');

function loadModule() {
  const source = fs.readFileSync(modulePath, 'utf8');
  let nextTimerId = 1;
  const timers = new Map();
  const context = {
    console,
    Date,
    setTimeout(fn) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'favoriteEatsInputSync.js' });
  return {
    api: context.favoriteEatsInputSync,
    runTimers() {
      const pending = Array.from(timers.entries());
      timers.clear();
      pending.forEach(([, fn]) => fn());
    },
  };
}

function fakeStorage(initial) {
  const map = new Map();
  if (initial && typeof initial === 'object') {
    Object.entries(initial).forEach(([k, v]) => map.set(k, v));
  }
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    snapshot() {
      const out = {};
      map.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    },
    sizeOf() {
      return map.size;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function testCoalescingAndOrdering() {
  const { api, runTimers } = loadModule();
  const applied = [];
  const flushed = [];
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 10,
    onLocalApply: (op) => applied.push(op),
    flushOp: async (op) => {
      flushed.push(op);
    },
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true, clientSeq: 1 });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: false, clientSeq: 2 });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true, clientSeq: 3 });

  assert(applied.length === 3, 'Local apply runs for every tap.');
  assert(queue.size() === 1, 'Repeated ops coalesce to one pending op.');
  assert(
    queue.getPendingOp({ surface: 'list', entityKey: 'milk', field: 'checked' }).value === true,
    'Latest visible intent is pending.',
  );

  runTimers();
  await flushMicrotasks();
  assert(flushed.length === 1, 'Only the latest coalesced op flushes.');
  assert(flushed[0].clientSeq === 3, 'Flushed op carries the latest clientSeq.');
  assert(flushed[0].value === true, 'Flushed op carries the latest value.');
}

async function testCrossSurfaceDoesNotCoalesce() {
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async () => {},
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: false });
  queue.enqueue({ surface: 'plan', entityKey: 'milk', field: 'quantity', value: 3 });
  assert(queue.size() === 2, 'Different surfaces/fields do not coalesce together.');
}

async function testRpcAckUpdatesServerVersion() {
  const { api, runTimers } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async (op) => {
      return { ok: true, updated_at: '2026-05-24T10:00:00.000+00:00' };
    },
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  runTimers();
  await flushMicrotasks();
  const state = queue.getKeyState({ surface: 'list', entityKey: 'milk', field: 'checked' });
  assert(
    state.lastAppliedServerUpdatedAt === '2026-05-24T10:00:00.000+00:00',
    'RPC ack should bump lastAppliedServerUpdatedAt from the response.',
  );
}

async function testEchoSkipPendingMidBurst() {
  // Charter K1 (queue-level shape): pending op for K means any echo for K is skipped.
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 60000,
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T10:00:00.000+00:00' }),
  });
  for (let i = 1; i <= 8; i += 1) {
    queue.enqueue({
      surface: 'plan',
      entityKey: 'apples',
      field: 'quantity',
      value: i,
      clientSeq: i,
    });
  }
  assert(queue.size() === 1, 'Eight stepper ops coalesce to one pending op.');
  assert(queue.getPendingOp({ surface: 'plan', entityKey: 'apples', field: 'quantity' }).value === 8);

  const echoArrivingMidBurst = {
    updated_at: '2026-05-24T10:00:00.000+00:00',
    value: 1,
  };
  assert(
    queue.shouldSkipEcho(
      { surface: 'plan', entityKey: 'apples', field: 'quantity' },
      echoArrivingMidBurst,
    ) === true,
    'Mid-burst echo must be skipped because a local op is pending for that key.',
  );

  // User clicks minus: consumer computes 8 - 1 = 7, enqueues 7.
  queue.enqueue({
    surface: 'plan',
    entityKey: 'apples',
    field: 'quantity',
    value: 7,
    clientSeq: 9,
  });
  assert(
    queue.getPendingOp({ surface: 'plan', entityKey: 'apples', field: 'quantity' }).value === 7,
    'After the minus tap, pending value is 7.',
  );
}

async function testEchoSkipInFlightLocalIntent() {
  // Charter §B′/§F: once a pending op starts flushing, it remains local
  // intent until ack/failure resolves. Echoes for that key must still skip.
  const { api, runTimers } = loadModule();
  let resolveFlush;
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: () =>
      new Promise((resolve) => {
        resolveFlush = resolve;
      }),
  });
  queue.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: true,
  });
  runTimers();
  await flushMicrotasks();

  const state = queue.getKeyState({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
  });
  assert(state.pending === false, 'Flush start moves op out of pending.');
  assert(state.inFlight === true, 'Flush start marks key as in-flight.');
  assert(
    queue.hasInFlight({
      surface: 'list',
      entityKey: 'milk',
      field: 'checked',
    }) === true,
    'hasInFlight should expose in-flight local intent.',
  );
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      { updated_at: '2026-05-24T10:00:00.000+00:00', value: false },
    ) === true,
    'Echo during in-flight local intent must be skipped.',
  );

  resolveFlush({ ok: true, updated_at: '2026-05-24T10:01:00.000+00:00' });
  await flushMicrotasks();
  const afterAck = queue.getKeyState({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
  });
  assert(afterAck.inFlight === false, 'Ack clears in-flight state.');
  assert(
    afterAck.lastAppliedServerUpdatedAt === '2026-05-24T10:01:00.000+00:00',
    'Ack still records server updated_at after in-flight state clears.',
  );
}

async function testEchoSkipStaleUpdatedAt() {
  const { api, runTimers } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:00:00.000+00:00' }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  runTimers();
  await flushMicrotasks();

  // After ack, server is at 12:00. A stale echo carrying 11:59 must be skipped.
  const stale = {
    updated_at: '2026-05-24T11:59:00.000+00:00',
    value: false,
  };
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      stale,
    ) === true,
    'Echo older than lastAppliedServerUpdatedAt must be dropped.',
  );

  // A newer echo from a peer (different value, later timestamp) should NOT be skipped.
  const peer = {
    updated_at: '2026-05-24T12:01:00.000+00:00',
    value: false,
  };
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      peer,
    ) === false,
    'Newer peer echo with a different value must NOT be skipped.',
  );
}

async function testEchoSkipSameDeviceFanout() {
  // Charter K8: after a successful narrow RPC for K, the matching Realtime
  // fanout (same updated_at, same value) does not change the local container.
  const { api, runTimers } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:00:00.000+00:00' }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  runTimers();
  await flushMicrotasks();

  const sameDeviceEcho = {
    updated_at: '2026-05-24T12:00:00.000+00:00',
    value: true,
  };
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      sameDeviceEcho,
    ) === true,
    'Same-device fanout (matching updated_at) must be skipped.',
  );
}

async function testEchoSkipEqualValueNoOp() {
  // Charter §F.2: equal-value patch is a no-op; skip even if timestamps disagree.
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async () => ({ ok: true }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  // No flush yet; pending. Should skip via pending rule anyway, but verify the
  // equal-value branch after we drain pending.
  await flushMicrotasks();
  // Drain pending so the only skip signal is value equality.
  queue.flushAll();
  await flushMicrotasks();

  const equalValue = {
    updated_at: '2030-01-01T00:00:00.000+00:00', // arbitrarily fresh
    value: true,
  };
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      equalValue,
    ) === true,
    'Echo whose value equals the rendered local value must be skipped (no-op patch).',
  );
}

async function testRefreshSkipIsPerKey() {
  // Charter K5: a pending op for K must not block patches to other keys J.
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 60000,
    flushOp: async () => ({ ok: true }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  queue.seedKeyState(
    { surface: 'list', entityKey: 'bread', field: 'checked' },
    { updated_at: '2026-05-24T09:00:00.000+00:00', value: false },
  );

  // For K = milk: pending op exists → skip.
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'milk', field: 'checked' },
      { updated_at: '2026-05-24T10:00:00.000+00:00', value: false },
    ) === true,
    'Per-key K with pending op is skipped.',
  );

  // For J = bread: no pending, fresher updated_at, different value → applies.
  assert(
    queue.shouldSkipEcho(
      { surface: 'list', entityKey: 'bread', field: 'checked' },
      { updated_at: '2026-05-24T10:00:00.000+00:00', value: true },
    ) === false,
    'Per-key J with no pending op and fresher updated_at is NOT skipped.',
  );
}

async function testRecordEchoAppliedBumpsState() {
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async () => ({ ok: true }),
  });
  queue.recordEchoApplied(
    { surface: 'list', entityKey: 'milk', field: 'checked' },
    { updated_at: '2026-05-24T10:00:00.000+00:00', value: true },
  );
  const state = queue.getKeyState({ surface: 'list', entityKey: 'milk', field: 'checked' });
  assert(state.lastAppliedServerUpdatedAt === '2026-05-24T10:00:00.000+00:00');
  assert(state.lastLocalValue === true);
  assert(state.hasLocalValue === true);

  // A later peer echo should bump.
  queue.recordEchoApplied(
    { surface: 'list', entityKey: 'milk', field: 'checked' },
    { updated_at: '2026-05-24T10:01:00.000+00:00', value: false },
  );
  const next = queue.getKeyState({ surface: 'list', entityKey: 'milk', field: 'checked' });
  assert(next.lastAppliedServerUpdatedAt === '2026-05-24T10:01:00.000+00:00');
  assert(next.lastLocalValue === false);
}

async function testDurableMirrorOnEnqueueAndAck() {
  // Charter K7: pending ops must be mirrored to durable storage so a forced
  // reload mid-burst replays them on next boot.
  const { api } = loadModule();
  const storage = fakeStorage();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 60000,
    storage,
    storageKey: 'fe:test',
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:00:00.000+00:00' }),
  });
  assert(queue.isDurable() === true, 'Queue with storage + storageKey is durable.');

  queue.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: true,
    clientSeq: 42,
  });
  const mirrored = JSON.parse(storage.getItem('fe:test') || '{}');
  const keys = Object.keys(mirrored);
  assert(keys.length === 1, 'Durable mirror has one entry after enqueue.');
  assert(
    mirrored[keys[0]].value === true && mirrored[keys[0]].clientSeq === 42,
    'Mirrored op carries the latest value + clientSeq.',
  );

  // Simulate the page dying before flush: new queue, same storage.
  const reborn = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    storage,
    storageKey: 'fe:test',
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:01:00.000+00:00' }),
  });
  const drained = reborn.drainDurable();
  assert(drained.length === 1, 'drainDurable returns the one pending op.');
  assert(
    drained[0].value === true && drained[0].entityKey === 'milk',
    'Drained op preserves payload.',
  );
  assert(storage.sizeOf() === 0, 'drainDurable clears storage.');
}

async function testDurableForgetOnFlushSuccess() {
  const { api, runTimers } = loadModule();
  const storage = fakeStorage();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    storage,
    storageKey: 'fe:test',
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:00:00.000+00:00' }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  assert(storage.sizeOf() === 1, 'Storage has the pending op.');
  runTimers();
  await flushMicrotasks();
  // After successful ack, storage should be clear for this key.
  const remaining = JSON.parse(storage.getItem('fe:test') || '{}');
  assert(Object.keys(remaining).length === 0, 'Durable mirror cleared after RPC ack.');
}

async function testDurableSurvivesFlushFailure() {
  const { api, runTimers } = loadModule();
  const storage = fakeStorage();
  let attempts = 0;
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    storage,
    storageKey: 'fe:test',
    flushOp: async () => {
      attempts += 1;
      throw new Error('network down');
    },
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  runTimers();
  await flushMicrotasks();
  await flushMicrotasks();
  assert(attempts >= 1, 'flushOp was attempted.');
  const remaining = JSON.parse(storage.getItem('fe:test') || '{}');
  assert(
    Object.keys(remaining).length === 1,
    'Durable mirror is preserved across flush failure for boot replay.',
  );
}

async function testEnqueueSeedsLastLocalValue() {
  const { api } = loadModule();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 60000,
    flushOp: async () => ({ ok: true }),
  });
  queue.enqueue({ surface: 'list', entityKey: 'milk', field: 'checked', value: true });
  const state = queue.getKeyState({ surface: 'list', entityKey: 'milk', field: 'checked' });
  assert(state.lastLocalValue === true, 'Enqueue records lastLocalValue.');
  assert(state.hasLocalValue === true, 'Enqueue sets hasLocalValue.');
  assert(state.pending === true, 'Enqueue marks key as pending.');
  assert(state.inFlight === false, 'Enqueue does not mark key as in-flight.');
}

async function testAbortPendingForWholesaleApply() {
  const { api } = loadModule();
  const storage = fakeStorage();
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 60000,
    storage,
    storageKey: 'fe:test',
    flushOp: async () => ({ ok: true, updated_at: '2026-05-24T12:00:00.000+00:00' }),
  });
  queue.enqueue({
    surface: 'plan',
    entityKey: 'milk',
    field: 'quantity',
    value: 0,
    meta: { quantityUnspecified: true },
  });
  assert(queue.size() === 1, 'Pending op exists before abort.');
  assert(storage.sizeOf() === 1, 'Durable mirror exists before abort.');
  queue.abortPendingForWholesaleApply();
  assert(queue.size() === 0, 'Abort clears pending ops.');
  assert(storage.sizeOf() === 0, 'Abort clears durable mirror.');
  const state = queue.getKeyState({
    surface: 'plan',
    entityKey: 'milk',
    field: 'quantity',
  });
  assert(state.hasLocalValue === false, 'Abort clears per-key ack state.');
}

async function run() {
  await testCoalescingAndOrdering();
  await testCrossSurfaceDoesNotCoalesce();
  await testRpcAckUpdatesServerVersion();
  await testEchoSkipPendingMidBurst();
  await testEchoSkipInFlightLocalIntent();
  await testEchoSkipStaleUpdatedAt();
  await testEchoSkipSameDeviceFanout();
  await testEchoSkipEqualValueNoOp();
  await testRefreshSkipIsPerKey();
  await testRecordEchoAppliedBumpsState();
  await testDurableMirrorOnEnqueueAndAck();
  await testDurableForgetOnFlushSuccess();
  await testDurableSurvivesFlushFailure();
  await testEnqueueSeedsLastLocalValue();
  await testAbortPendingForWholesaleApply();
  console.log('favoriteEatsInputSync tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
