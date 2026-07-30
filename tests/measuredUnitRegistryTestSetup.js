'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const registryPath = path.join(__dirname, '..', 'js', 'favoriteEatsMeasuredUnitRegistry.js');

function installMeasuredUnitRegistry(context) {
  if (!context.window && context.globalThis) {
    context.window = context.globalThis;
  }
  if (!context.window) {
    context.window = context;
  }
  if (!context.globalThis) {
    context.globalThis = context.window;
  }
  const source = fs.readFileSync(registryPath, 'utf8');
  vm.runInContext(source, context, { filename: 'favoriteEatsMeasuredUnitRegistry.js' });
  return context.window.favoriteEatsMeasuredUnitRegistry;
}

module.exports = { installMeasuredUnitRegistry };
