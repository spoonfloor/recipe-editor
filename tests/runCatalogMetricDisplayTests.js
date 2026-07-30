#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

function loadIngredientDisplay() {
  const utilsSource = fs.readFileSync(path.join(projectRoot, 'js', 'utils.js'), 'utf8');
  const start = utilsSource.indexOf('function decimalToFractionDisplay(');
  const end = utilsSource.indexOf('function showUndoToastGlobal(');
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  installMeasuredUnitRegistry(ctx);
  vm.runInContext(utilsSource.slice(start, end), ctx, { filename: 'utils-snippet.js' });
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'unitQuantityFormat.js'), 'utf8'),
    ctx,
    { filename: 'unitQuantityFormat.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'favoriteEatsAmountKit.js'), 'utf8'),
    ctx,
    { filename: 'favoriteEatsAmountKit.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'cookingVolumeLadder.js'), 'utf8'),
    ctx,
    { filename: 'cookingVolumeLadder.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'quantityDisplayPolicy.js'), 'utf8'),
    ctx,
    { filename: 'quantityDisplayPolicy.js' },
  );
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'ingredientDisplay.js'), 'utf8'),
    ctx,
    { filename: 'ingredientDisplay.js' },
  );
  return ctx.window;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}" but got "${actual}"`);
  }
}

function run() {
  const win = loadIngredientDisplay();
  const map = new Map([['noodles', true], ['noodle', true]]);
  win.favoriteEatsCatalogLineUsesMetric = (line) => {
    const name = String(line?.name || '').trim().toLowerCase();
    return map.has(name);
  };

  const line = {
    quantityMin: 3,
    quantityMax: 3,
    unit: 'lb',
    name: 'noodles',
    pluralOverride: 'noodles',
  };

  assertEqual(
    win.formatIngredientText(line),
    '1.4 kg noodles',
    'catalog map alone drives metric display when line.useMetric is unset',
  );

  assertEqual(
    win.formatNeedLineText(line),
    'noodles (1.4 kg)',
    'YWN-style line uses catalog metric via resolveIngredientLineUsesMetric',
  );

  console.log('runCatalogMetricDisplayTests: ok');
}

run();
