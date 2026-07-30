#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const quantityDisplayPolicyPath = path.join(
  projectRoot,
  'js',
  'quantityDisplayPolicy.js',
);
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

function loadPolicy() {
  const context = { window: {}, console };
  vm.createContext(context);
  installMeasuredUnitRegistry(context);
  vm.runInContext(fs.readFileSync(quantityDisplayPolicyPath, 'utf8'), context, {
    filename: 'quantityDisplayPolicy.js',
  });
  const pol = context.window.favoriteEatsQuantityDisplayPolicy;
  if (!pol) throw new Error('quantityDisplayPolicy not loaded');
  return pol;
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function run() {
  const pol = loadPolicy();
  const metric = { useMetric: true };

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 17.2, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 18,
      unit: 'g',
      displayLabel: '18 g',
    },
    'under 20 g: shopping ceils to whole grams',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 17.2, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 17,
      unit: 'g',
      displayLabel: '17 g',
    },
    'under 20 g: cooking rounds to whole grams',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 0.4, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 1,
      unit: 'g',
      displayLabel: '1 g',
    },
    'cooking whole-gram round clamps sub-gram to 1 g',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 450, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 450,
      unit: 'g',
      displayLabel: '450 g',
    },
    '20–999 g on 5 g grid: exact multiple unchanged',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 452, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 455,
      unit: 'g',
      displayLabel: '455 g',
    },
    '20–999 g: shopping ceils to next 5 g',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 452, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 450,
      unit: 'g',
      displayLabel: '450 g',
    },
    '20–999 g: cooking rounds to nearest 5 g',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 1050, 'cooking', undefined, metric),
    {
      family: 'mass',
      quantity: 1.1,
      unit: 'kg',
      displayLabel: '1.1 kg',
    },
    '1 kg and above: cooking rounds kg to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 1050, 'shopping', undefined, metric),
    {
      family: 'mass',
      quantity: 1.1,
      unit: 'kg',
      displayLabel: '1.1 kg',
    },
    '1 kg and above: shopping ceils kg to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 12.1, 'cooking', undefined, metric),
    {
      family: 'volume',
      quantity: 12,
      unit: 'ml',
      displayLabel: '12 ml',
    },
    'under 20 ml: cooking whole ml',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 88, 'shopping', undefined, metric),
    {
      family: 'volume',
      quantity: 90,
      unit: 'ml',
      displayLabel: '90 ml',
    },
    '20–999 ml: shopping ceil on 5 ml steps',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('volume', 1500, 'shopping', undefined, metric),
    {
      family: 'volume',
      quantity: 1.5,
      unit: 'l',
      displayLabel: '1.5 l',
    },
    '1 L and above: shopping liters ceil to 0.1',
  );

  assertDeepEqual(
    pol.getMeasuredDisplayFromBase('mass', 450, 'cooking', undefined, {
      useMetric: false,
    }),
    pol.getMeasuredDisplayFromBase('mass', 450, 'cooking'),
    'US ladder when useMetric false',
  );

  console.log('runMetricDisplayLadderTests: ok');
}

run();
