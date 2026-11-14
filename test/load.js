'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run grabbo.js in a bare vm context and return the exported pure functions.
function loadGrabbo() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'grabbo.js'), 'utf8');
  const ctx = vm.createContext({ __grabboTest: {} });
  vm.runInContext(src, ctx);
  return ctx.__grabboTest;
}

// Run the whole bookmarklet in a vm context with the given browser globals. Returns the promise
// from the async IIFE, and the context.
function runGrabbo(globals) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'grabbo.js'), 'utf8');
  const ctx = vm.createContext(globals);
  return { done: vm.runInContext(src, ctx), ctx };
}

// Objects made inside vm have another prototype. Plain-copy them before deepStrictEqual.
const plain = (x) => JSON.parse(JSON.stringify(x));

module.exports = { loadGrabbo, runGrabbo, plain };
