#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNoTwelfthSlashDisplay(s, message) {
  const t = String(s);
  if (t.includes('/12') || /\b\d+\s*\/\s*12\b/.test(t)) {
    throw new Error(`${message}: must not show twelfths: ${JSON.stringify(t)}`);
  }
}

function run() {
  const context = { window: {}, console };
  vm.createContext(context);
  installMeasuredUnitRegistry(context);
  const unitPath = path.join(projectRoot, 'js', 'unitQuantityFormat.js');
  const ladderPath = path.join(projectRoot, 'js', 'cookingVolumeLadder.js');
  const policyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');
  vm.runInContext(fs.readFileSync(unitPath, 'utf8'), context, {
    filename: 'unitQuantityFormat.js',
  });
  vm.runInContext(fs.readFileSync(ladderPath, 'utf8'), context, {
    filename: 'cookingVolumeLadder.js',
  });
  vm.runInContext(fs.readFileSync(policyPath, 'utf8'), context, {
    filename: 'quantityDisplayPolicy.js',
  });

  const fmt = context.window.favoriteEatsUnitQuantityFormat;
  const pol = context.window.favoriteEatsQuantityDisplayPolicy;
  if (!fmt?.formatQuantityOnGridGlyphs) throw new Error('unitQuantityFormat not loaded');
  if (!pol?.buildUnitEditorExampleTotals) throw new Error('quantityDisplayPolicy not loaded');
  if (!pol?.buildUnitEditorDisplayPreviewChart) {
    throw new Error('buildUnitEditorDisplayPreviewChart missing');
  }

  assertEqual(
    fmt.divisibilityMinFractionLabel(12),
    '¼ & ⅓',
    'step 12 divisibility label avoids 1/12 wording',
  );

  const g12 = (v) => fmt.formatQuantityOnGridGlyphs(v, 12);
  const kitchenCases = [
    [1 / 12, '¼'],
    [7 / 12, '½'],
    [5.25, '5¼'],
    [1.75, '1¾'],
    [2 + 1 / 3, '2⅓'],
    [0.5, '½'],
  ];
  kitchenCases.forEach(([v, expected]) => {
    const out = g12(v);
    assertNoTwelfthSlashDisplay(out, `kitchen format(${v})`);
    assertEqual(out, expected, `kitchen format(${v})`);
  });

  assertEqual(g12(-0.25), '-¼', 'kitchen negative');

  const ex = pol.buildUnitEditorExampleTotals({
    stepDenominator: 12,
    singular: 'drop',
    plural: 'drops',
  });
  assertNoTwelfthSlashDisplay(ex.joined, 'unit editor example joined');
  assertNoTwelfthSlashDisplay(ex.sumGlyph, 'unit editor example sumGlyph');
  assertEqual(ex.joined, '¼ drop + 1¾ drops + 3¼ drops', 'kitchen example addends');
  assertEqual(ex.sumGlyph, '5¼', 'kitchen example total glyph');

  const chart = pol.buildUnitEditorDisplayPreviewChart({ stepDenominator: 12 });
  assertEqual(chart.rows.length, 6, 'preview chart row count');
  assertEqual(chart.rows[0].amount, '0.4', 'preview rows sorted ascending');
  assertEqual(chart.rows[1].amount, '0.667', 'preview amount max 3 decimals');
  assertEqual(chart.rows[2].amount, '1.111', 'preview keeps awkward decimals');
  assertEqual(chart.rows[2].recipe, '1', 'preview recipe 1.111 nearest on ¼∪⅓');
  assertEqual(chart.rows[2].shopping, '1¼', 'preview shopping 1.111 ceil on ¼∪⅓');
  assertEqual(chart.rows[0].recipe, '⅓', 'preview recipe 0.4 on ¼∪⅓');
  chart.rows.forEach((row) => {
    assertNoTwelfthSlashDisplay(row.recipe, `preview recipe ${row.amount}`);
    assertNoTwelfthSlashDisplay(row.shopping, `preview shopping ${row.amount}`);
  });

  assertEqual(
    fmt.formatQuantityOnGridGlyphs(1.125, 8),
    '1⅛',
    'non-12 grid still uses eighth ladder',
  );

  console.log('Unit quantity format tests passed.');
}

run();
