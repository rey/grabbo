'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo, plain } = require('./load');

const { declaredScore, pickBest, rankPictures, mergeEntry } = loadGrabbo();
const info = (w = 0, x = 0) => ({ w, x });

test('pickBest: measured largest area wins', () => {
  const sizes = new Map([['a', [100, 100]], ['b', [300, 200]]]);
  const r = plain(pickBest([['a', info()], ['b', info()]], sizes));
  assert.strictEqual(r.url, 'b');
  assert.strictEqual(r.score, 60000);
  assert.strictEqual(r.measured, true);
});

test('pickBest: unmeasured loses to measured', () => {
  const sizes = new Map([['a', null], ['b', [10, 10]]]);
  const r = plain(pickBest([['a', info(5000)], ['b', info()]], sizes));
  assert.strictEqual(r.url, 'b');
  assert.strictEqual(r.measured, true);
});

test('pickBest: all unmeasured uses declared size', () => {
  const sizes = new Map();
  let r = plain(pickBest([['a', info(400)], ['b', info(800)]], sizes));
  assert.strictEqual(r.url, 'b');
  assert.strictEqual(r.measured, false);
  r = plain(pickBest([['a', info(0, 1)], ['b', info(0, 2)]], sizes));
  assert.strictEqual(r.url, 'b');
  assert.strictEqual(r.measured, false);
});

test('declaredScore: 1x equals 1000w', () => {
  assert.strictEqual(declaredScore(info(0, 1)), declaredScore(info(1000, 0)));
  assert.strictEqual(declaredScore({}), 0);
});

test('rankPictures: descending score', () => {
  const sizes = new Map([['a', [10, 10]], ['b', [100, 100]], ['c', [50, 50]]]);
  const r = plain(rankPictures([[['a', info()]], [['b', info()]], [['c', info()]]], sizes));
  assert.deepStrictEqual(r.map((p) => p.url), ['b', 'c', 'a']);
});

test('rankPictures: declared size never outranks a measurement', () => {
  const sizes = new Map([['m', [1000, 1000]], ['f', null]]);
  const r = plain(rankPictures([[['f', info(5000)]], [['m', info()]]], sizes));
  assert.deepStrictEqual(r.map((p) => p.url), ['m', 'f']);
});

test('rankPictures: all-failed picture with no declared size is dropped', () => {
  const sizes = new Map([['f', null]]);
  assert.deepStrictEqual(plain(rankPictures([[['f', info()]]], sizes)), []);
});

test('rankPictures: empty input', () => {
  assert.deepStrictEqual(plain(rankPictures([], new Map())), []);
});

test('mergeEntry: later descriptor fills zeros, never overwrites non-zero', () => {
  assert.deepStrictEqual(plain(mergeEntry(info(), '900w')), { w: 900, x: 0 });
  assert.deepStrictEqual(plain(mergeEntry(info(0, 2), '900w')), { w: 900, x: 2 });
  assert.deepStrictEqual(plain(mergeEntry(info(400), '')), { w: 400, x: 0 });
  assert.deepStrictEqual(plain(mergeEntry(info(400), 'junk')), { w: 400, x: 0 });
  // a src entry merged with its srcset descriptor keeps that declared size when the load fails
  const merged = mergeEntry(info(), '900w');
  assert.deepStrictEqual(plain(rankPictures([[['a', merged]]], new Map([['a', null]]))).map((p) => p.url), ['a']);
});

test('rankPictures: [0,0] (loaded, no intrinsic size) is kept, after measured, before unmeasured', () => {
  const sizes = new Map([['s', [0, 0]], ['m', [10, 10]], ['d', null]]);
  const r = plain(rankPictures([[['d', info(5000)]], [['s', info()]], [['m', info()]]], sizes));
  assert.deepStrictEqual(r.map((p) => p.url), ['m', 's', 'd']);
  assert.strictEqual(r[1].measured, true);
});
