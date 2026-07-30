#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const cookingVolumeLadderPath = path.join(projectRoot, 'js', 'cookingVolumeLadder.js');
const quantityDisplayPolicyPath = path.join(projectRoot, 'js', 'quantityDisplayPolicy.js');
const { installMeasuredUnitRegistry } = require('./measuredUnitRegistryTestSetup');

const ML_PER_TSP = 4.92892159375;
const ML_PER_TBSP = 14.78676478125;
const ML_PER_CUP = 236.5882365;
const ML_PER_GAL = 3785.411784;

function loadPolicy() {
  const context = { window: {}, console };
  vm.createContext(context);
  installMeasuredUnitRegistry(context);
  vm.runInContext(fs.readFileSync(cookingVolumeLadderPath, 'utf8'), context, {
    filename: 'cookingVolumeLadder.js',
  });
  vm.runInContext(fs.readFileSync(quantityDisplayPolicyPath, 'utf8'), context, {
    filename: 'quantityDisplayPolicy.js',
  });
  const pol = context.window.favoriteEatsQuantityDisplayPolicy;
  const ladder = context.window.favoriteEatsCookingVolumeLadder;
  if (!pol || !ladder) throw new Error('policy or ladder not loaded');
  return { pol, ladder };
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e} but got ${a}`);
  }
}

function mlFromTsp(t) {
  return t * ML_PER_TSP;
}
function mlFromTbsp(b) {
  return b * ML_PER_TBSP;
}
function mlFromCup(c) {
  return c * ML_PER_CUP;
}
function mlFromGal(g) {
  return g * ML_PER_GAL;
}

function run() {
  const { pol } = loadPolicy();

  const cooking = (ml, sourceUnit) =>
    pol.getMeasuredDisplayFromBase('volume', ml, 'cooking', sourceUnit);
  const shopping = (ml, sourceUnit) =>
    pol.getMeasuredDisplayFromBase('volume', ml, 'shopping', sourceUnit);

  assertDeepEqual(
    cooking(mlFromTsp(0.1)),
    { family: 'volume', quantity: 0.125, unit: 'tsp' },
    'below ⅛ tsp → ⅛ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.2)),
    { family: 'volume', quantity: 0.25, unit: 'tsp' },
    '0.2 tsp → nearest ¼ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.25)),
    { family: 'volume', quantity: 0.25, unit: 'tsp' },
    '¼ tsp stays ¼ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(0.5)),
    { family: 'volume', quantity: 0.5, unit: 'tsp' },
    '½ tsp stays ½ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTsp(2.5)),
    { family: 'volume', quantity: 2.5, unit: 'tsp' },
    '2½ tsp stays on ladder',
  );
  assertDeepEqual(
    cooking(mlFromTsp(4), 'tsp'),
    {
      family: 'volume',
      quantity: 4,
      unit: 'tsp',
      displayLabel: '1 tbsp + 1 tsp',
    },
    '4 tsp → 1 tbsp + 1 tsp rung',
  );
  assertDeepEqual(
    cooking(mlFromTsp(3.75)),
    {
      family: 'volume',
      quantity: 3.75,
      unit: 'tsp',
      displayLabel: '1 tbsp + ¾ tsp',
    },
    '3.75 tsp → 1 tbsp + ¾ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(1.5), 'tbsp'),
    { family: 'volume', quantity: 1.5, unit: 'tbsp' },
    '1½ tbsp rung (not compound)',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(1.25)),
    {
      family: 'volume',
      quantity: 3.75,
      unit: 'tsp',
      displayLabel: '1 tbsp + ¾ tsp',
    },
    '1.25 tbsp → 1 tbsp + ¾ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(2.25)),
    {
      family: 'volume',
      quantity: 6.75,
      unit: 'tsp',
      displayLabel: '2 tbsp + ¾ tsp',
    },
    '2.25 tbsp → 2 tbsp + ¾ tsp',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(3.5)),
    { family: 'volume', quantity: 3.5, unit: 'tbsp' },
    '3½ tbsp rung',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10 + 2 / 3), 'tbsp'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '10⅔ tbsp → ⅔ cup',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(10.67), 'tbsp'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '10.67 tbsp → ⅔ cup',
  );
  assertDeepEqual(
    cooking(mlFromTbsp(16.01), 'tbsp'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '16.01 tbsp cooking → nearest 1 cup',
  );
  assertDeepEqual(
    shopping(mlFromTbsp(16.01), 'tbsp'),
    { family: 'volume', quantity: 1.25, unit: 'cup' },
    '16.01 tbsp shopping → ceil 1¼ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.55), 'cup'),
    { family: 'volume', quantity: 0.5, unit: 'cup' },
    '0.55 cup → nearest ½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.65), 'cup'),
    { family: 'volume', quantity: Number((2 / 3).toFixed(6)), unit: 'cup' },
    '0.65 cup → nearest ⅔ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(0.5), 'cup'),
    { family: 'volume', quantity: 0.5, unit: 'cup' },
    '½ cup stays ½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.05), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '1.05 cup → nearest 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    'exactly 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.1), 'cup'),
    { family: 'volume', quantity: 1, unit: 'cup' },
    '1.1 cup → nearest 1 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(1.4), 'cup'),
    { family: 'volume', quantity: Number((1 + 1 / 3).toFixed(6)), unit: 'cup' },
    '1.4 cup → nearest 1⅓ cup',
  );
  assertDeepEqual(
    shopping(mlFromCup(1.4), 'cup'),
    { family: 'volume', quantity: 1.5, unit: 'cup' },
    '1.4 cup shopping → ceil 1½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(2.5), 'cup'),
    { family: 'volume', quantity: 2.5, unit: 'cup' },
    '2.5 cup → 2½ cup rung',
  );
  assertDeepEqual(
    cooking(mlFromCup(4.1), 'cup'),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '4.1 cup → nearest 4 cup',
  );
  assertDeepEqual(
    shopping(mlFromCup(4.1), 'cup'),
    { family: 'volume', quantity: 4.5, unit: 'cup' },
    '4.1 cup shopping → ceil 4½ cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(8), 'cup'),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '8 cups stays 8 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(8.1), 'cup'),
    { family: 'volume', quantity: 8, unit: 'cup' },
    '8.1 cup → nearest 8 cup',
  );
  assertDeepEqual(
    cooking(mlFromCup(10), 'cup'),
    { family: 'volume', quantity: 10, unit: 'cup' },
    '10 cups stays 10 cups',
  );
  assertDeepEqual(
    cooking(mlFromCup(16), 'cup'),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '16 cups → 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.2)),
    { family: 'volume', quantity: 1, unit: 'gal' },
    '1.2 gal → nearest 1 gal',
  );
  assertDeepEqual(
    cooking(mlFromGal(1.6)),
    { family: 'volume', quantity: 1.5, unit: 'gal' },
    '1.6 gal → nearest 1½ gal',
  );
  assertDeepEqual(
    shopping(mlFromGal(1.6)),
    { family: 'volume', quantity: 2, unit: 'gal' },
    '1.6 gal shopping → ceil 2 gal',
  );
  assertDeepEqual(
    cooking(950),
    { family: 'volume', quantity: 4, unit: 'cup' },
    '950 ml cooking → nearest 4 cups',
  );
  assertDeepEqual(
    shopping(950),
    { family: 'volume', quantity: 4.5, unit: 'cup' },
    '950 ml shopping → ceil 4½ cups',
  );

  console.log('runCookingVolumeLadderTests: all passed');
}

run();
