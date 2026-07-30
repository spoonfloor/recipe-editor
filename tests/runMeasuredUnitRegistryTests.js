#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const registryPath = path.join(projectRoot, 'js', 'favoriteEatsMeasuredUnitRegistry.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
}

function loadRegistry() {
  const source = fs.readFileSync(registryPath, 'utf8');
  const context = { console, globalThis: {}, window: {} };
  context.window = context.globalThis;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'favoriteEatsMeasuredUnitRegistry.js' });
  const reg = context.globalThis.favoriteEatsMeasuredUnitRegistry;
  if (!reg) throw new Error('favoriteEatsMeasuredUnitRegistry missing');
  return reg;
}

function run() {
  const reg = loadRegistry();

  assertEqual(reg.normalizeMeasuredUnit('oz'), 'oz', 'oz stays mass code');
  assertEqual(reg.normalizeMeasuredUnit('Ounce'), 'oz', 'ounce aliases to mass oz');
  assertEqual(reg.normalizeMeasuredUnit('fluid ounces'), 'fl oz', 'fluid ounces alias');
  assertEqual(reg.normalizeMeasuredUnit('floz'), 'fl oz', 'floz alias');
  assertEqual(reg.normalizeMeasuredUnit('fl.oz'), 'fl oz', 'fl.oz strips dot then aliases');

  assertDeepEqual(
    reg.getMeasuredUnitMeta('oz'),
    { family: 'mass', baseUnit: 'g', factor: 28.349523125 },
    'oz meta is mass',
  );
  assertDeepEqual(
    reg.getMeasuredUnitMeta('floz'),
    { family: 'volume', baseUnit: 'ml', factor: 29.5735295625 },
    'floz meta is volume',
  );

  assertDeepEqual(
    reg.convertQuantityToMeasuredBase(8, 'oz'),
    {
      unit: 'oz',
      family: 'mass',
      baseUnit: 'g',
      baseQuantity: 226.796185,
    },
    '8 oz mushrooms pattern converts to grams',
  );
  assertDeepEqual(
    reg.convertQuantityToMeasuredBase(4, 'floz'),
    {
      unit: 'fl oz',
      family: 'volume',
      baseUnit: 'ml',
      baseQuantity: 118.294118,
    },
    '4 floz converts to ml',
  );

  assertDeepEqual(
    reg.getMagnitudeMeta('oz'),
    { family: 'mass', baseAmount: 28.349523125 },
    'magnitude meta for catalog sort',
  );
  assertDeepEqual(
    reg.getMagnitudeMeta('floz'),
    { family: 'volume', baseAmount: 29.5735295625 },
    'floz magnitude meta',
  );

  assertEqual(reg.formatUnitTypeaheadLabel('oz'), 'oz (weight)', 'oz typeahead label');
  assertEqual(reg.formatUnitTypeaheadLabel('floz'), 'floz', 'floz typeahead unchanged');
  assertEqual(reg.getUnitCatalogListHint('oz'), '(weight)', 'oz catalog list hint');
  assertEqual(reg.getUnitCatalogListHint('floz'), '', 'floz catalog list hint empty');

  console.log('Measured unit registry tests passed.');
}

run();
