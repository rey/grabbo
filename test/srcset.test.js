'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo, plain } = require('./load');

const { parseDescriptor, parseSrcset } = loadGrabbo();
const c = (url, desc) => ({ url, desc });

test('parseSrcset: width candidates', () => {
  assert.deepStrictEqual(plain(parseSrcset('a.jpg 400w, b.jpg 800w')), [c('a.jpg', '400w'), c('b.jpg', '800w')]);
});

test('parseSrcset: no space after comma', () => {
  assert.deepStrictEqual(plain(parseSrcset('a.jpg 1x,b.jpg 2x')), [c('a.jpg', '1x'), c('b.jpg', '2x')]);
  assert.deepStrictEqual(plain(parseSrcset('a.jpg 400w,b.jpg 800w')), [c('a.jpg', '400w'), c('b.jpg', '800w')]);
});

test('parseSrcset: URLs containing commas', () => {
  const a = 'https://c.example/w_300,h_200/a.jpg';
  const b = 'https://c.example/w_600,h_400/a.jpg';
  assert.deepStrictEqual(plain(parseSrcset(`${a} 300w, ${b} 600w`)), [c(a, '300w'), c(b, '600w')]);
});

test('parseSrcset: whitespace, newline and trailing comma', () => {
  assert.deepStrictEqual(plain(parseSrcset('  a.jpg 1x ,\n b.jpg 2x ,')), [c('a.jpg', '1x'), c('b.jpg', '2x')]);
  assert.deepStrictEqual(plain(parseSrcset('a.jpg\n400w')), [c('a.jpg', '400w')]);
});

test('parseSrcset: no descriptor and empty input', () => {
  assert.deepStrictEqual(plain(parseSrcset('a.jpg')), [c('a.jpg', '')]);
  assert.deepStrictEqual(plain(parseSrcset('')), []);
  assert.deepStrictEqual(plain(parseSrcset(null)), []);
  assert.deepStrictEqual(plain(parseSrcset(undefined)), []);
});

test('parseDescriptor', () => {
  assert.deepStrictEqual(plain(parseDescriptor('400w')), { w: 400, x: 0 });
  assert.deepStrictEqual(plain(parseDescriptor('2x')), { w: 0, x: 2 });
  assert.deepStrictEqual(plain(parseDescriptor('1.5x')), { w: 0, x: 1.5 });
  assert.deepStrictEqual(plain(parseDescriptor('.5x')), { w: 0, x: 0.5 });
  assert.deepStrictEqual(plain(parseDescriptor('2X')), { w: 0, x: 2 });
  assert.deepStrictEqual(plain(parseDescriptor('')), { w: 0, x: 0 });
  assert.deepStrictEqual(plain(parseDescriptor('junk')), { w: 0, x: 0 });
});
