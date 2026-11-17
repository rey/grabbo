'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo, plain } = require('./load');

const { declaredScore, pickBest, rankPictures, versionsOf, mergeEntry } = loadGrabbo();
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

const E = 'https://e.com/';
const pickUrl = (names, sizeMap = {}) => {
  const sizes = new Map(names.map((n) => [E + n, sizeMap[n] || [100, 100]]));
  return plain(pickBest(names.map((n) => [E + n, info()]), sizes)).url;
};

test('pickBest: tie prefers png over avif', () => {
  assert.strictEqual(pickUrl(['a.avif', 'a.png']), E + 'a.png');
});

test('pickBest: tie prefers png when it comes first', () => {
  assert.strictEqual(pickUrl(['a.png', 'a.avif']), E + 'a.png');
});

test('pickBest: tie prefers png over webp then avif', () => {
  assert.strictEqual(pickUrl(['a.webp', 'a.avif', 'a.png']), E + 'a.png');
});

test('pickBest: tie prefers jpg over webp', () => {
  assert.strictEqual(pickUrl(['a.webp', 'a.jpeg']), E + 'a.jpeg');
});

test('pickBest: extension is not case sensitive', () => {
  assert.strictEqual(pickUrl(['a.AVIF', 'a.PNG']), E + 'a.PNG');
});

test('pickBest: larger avif beats smaller png', () => {
  assert.strictEqual(pickUrl(['a.avif', 'a.png'], { 'a.avif': [200, 200] }), E + 'a.avif');
});

test('pickBest: jpg and png tie keeps the first', () => {
  assert.strictEqual(pickUrl(['a.png', 'a.jpg']), E + 'a.png');
  assert.strictEqual(pickUrl(['a.jpg', 'a.png']), E + 'a.jpg');
});

test('pickBest: the path decides, not the query or fragment', () => {
  assert.strictEqual(pickUrl(['a.avif', 'b.png?v=1']), E + 'b.png?v=1');
  assert.strictEqual(pickUrl(['b.webp', 'a.avif?fb=x.png']), E + 'b.webp');
  assert.strictEqual(pickUrl(['b.webp', 'a.avif#x.png']), E + 'b.webp');
});

test('pickBest: a url with no extension is neutral', () => {
  assert.strictEqual(pickUrl(['a.avif', 'img']), E + 'a.avif');
  assert.strictEqual(pickUrl(['img', 'a.png']), E + 'img');
});

test('pickBest: a url with no extension neither replaces nor is replaced, so order matters', () => {
  assert.strictEqual(pickUrl(['a.avif', 'img', 'a.png']), E + 'a.png');
  assert.strictEqual(pickUrl(['img', 'a.avif', 'a.png']), E + 'img');
});

test('pickBest: a data url is neutral', () => {
  const data = 'data:image/png;base64,AAAA';
  const sizes = new Map([[E + 'a.avif', [100, 100]], [data, [100, 100]]]);
  assert.strictEqual(plain(pickBest([[E + 'a.avif', info()], [data, info()]], sizes)).url, E + 'a.avif');
});

test('pickBest: unmeasured entries keep the first', () => {
  const r = plain(pickBest([[E + 'a.avif', info(0, 1)], [E + 'a.png', info(0, 1)]], new Map()));
  assert.strictEqual(r.url, E + 'a.avif');
});

test('pickBest: tie prefers jpg over avif', () => {
  assert.strictEqual(pickUrl(['a.avif', 'a.jpg']), E + 'a.jpg');
});

test('pickBest: an unmeasured png with the same declared score does not replace a measured avif', () => {
  // The png has no entry in sizes, so it is unmeasured. info(100) declares 100w, which scores 10000, as 100×100 does.
  const sizes = new Map([[E + 'a.avif', [100, 100]]]);
  const r = plain(pickBest([[E + 'a.avif', info()], [E + 'a.png', info(100)]], sizes));
  assert.strictEqual(r.url, E + 'a.avif');
});

test('pickBest: gif and svg are neutral', () => {
  assert.strictEqual(pickUrl(['a.webp', 'a.gif']), E + 'a.webp');
  assert.strictEqual(pickUrl(['a.gif', 'a.png']), E + 'a.gif');
  assert.strictEqual(pickUrl(['a.avif', 'a.svg']), E + 'a.avif');
});

test('pickBest: the extension must end the path and follow a dot', () => {
  assert.strictEqual(pickUrl(['a.webp', 'a.png.webp']), E + 'a.webp');
  assert.strictEqual(pickUrl(['a.jpg.webp', 'a.jpg']), E + 'a.jpg');
  assert.strictEqual(pickUrl(['a.avif', 'apng']), E + 'a.avif');
});

test('pickBest: a webp that follows a png only in the fragment is not a webp', () => {
  assert.strictEqual(pickUrl(['a.png#x.webp', 'b.png']), E + 'a.png#x.webp');
});

test('pickBest: a tie at [0, 0] (loaded, no intrinsic size) still prefers the png', () => {
  assert.strictEqual(pickUrl(['a.avif', 'a.png'], { 'a.avif': [0, 0], 'a.png': [0, 0] }), E + 'a.png');
});

test('pickBest: three tied entries give the png or jpg in every useful order', () => {
  assert.strictEqual(pickUrl(['a.png', 'a.webp', 'a.avif']), E + 'a.png');
  assert.strictEqual(pickUrl(['a.avif', 'a.png', 'a.jpg']), E + 'a.png');
});

test('rankPictures: each result keeps the entries of its picture', () => {
  const group = [['a', info()], ['b', info()]];
  const r = rankPictures([group], new Map([['a', [10, 10]], ['b', [20, 20]]]));
  assert.deepStrictEqual(plain(r[0].entries), plain(group));
});

test('versionsOf: the other loaded sizes, largest first, with their sizes', () => {
  const sizes = new Map([['a', [100, 100]], ['b', [300, 200]], ['c', [50, 50]]]);
  const entries = ['a', 'b', 'c'].map((u) => [u, info()]);
  assert.deepStrictEqual(plain(versionsOf(entries, sizes, 'b')), [{ url: 'a', size: [100, 100] }, { url: 'c', size: [50, 50] }]);
});

test('versionsOf: leaves out the best, failed, unmeasured and hung candidates', () => {
  const sizes = new Map([['best', [100, 100]], ['bad', null], ['ok', [10, 10]]]);
  const entries = ['best', 'bad', 'ok', 'hung'].map((u) => [u, info(500)]);
  assert.deepStrictEqual(plain(versionsOf(entries, sizes, 'best')).map((v) => v.url), ['ok']);
});

test('versionsOf: a same-size WebP is a version, in page order; [0, 0] is kept', () => {
  const sizes = new Map([['a.jpg', [100, 100]], ['a.webp', [100, 100]], ['a.avif', [100, 100]], ['s.svg', [0, 0]]]);
  const entries = ['a.jpg', 'a.webp', 'a.avif', 's.svg'].map((u) => [u, info()]);
  assert.deepStrictEqual(plain(versionsOf(entries, sizes, 'a.jpg')).map((v) => v.url), ['a.webp', 'a.avif', 's.svg']);
});

test('versionsOf: none for a single candidate, or when the best is only declared', () => {
  assert.deepStrictEqual(plain(versionsOf([['a', info()]], new Map([['a', [1, 1]]]), 'a')), []);
  assert.deepStrictEqual(plain(versionsOf([['a', info(900)], ['b', info(400)]], new Map(), 'a')), []);
});

test('rankPictures: ranking reorders pictures and each keeps its own entries, so versions stay with their picture', () => {
  const small = [['s0', info()], ['s1', info()]];
  const large = [['l0', info()], ['l1', info()]];
  const sizes = new Map([['s0', [10, 10]], ['s1', [20, 20]], ['l0', [100, 100]], ['l1', [200, 200]]]);
  const r = plain(rankPictures([small, large], sizes));
  assert.deepStrictEqual(r.map((p) => p.url), ['l1', 's1']);
  assert.deepStrictEqual(r.map((p) => p.entries.map(([u]) => u)), [['l0', 'l1'], ['s0', 's1']]);
  assert.deepStrictEqual(plain(versionsOf(r[0].entries, sizes, r[0].url)), [{ url: 'l0', size: [100, 100] }]);
  assert.deepStrictEqual(plain(versionsOf(r[1].entries, sizes, r[1].url)), [{ url: 's0', size: [10, 10] }]);
});
