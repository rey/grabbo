'use strict';
// Runs the whole bookmarklet in node:vm against a tiny fake DOM, so the collector is tested end to end.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runGrabbo } = require('./load');

const BASE = 'https://e.com/dir/page.html';
const D = 'https://e.com/dir/';

// Fake elements. matchesPart() understands tag names, '*', [attr="v"] and [attr~="v"], which is all the collector uses.
let all = [];
const matchesPart = (e, part) => {
  const m = /^([a-z*]*)(?:\[([a-z-]+)(~?)="([^"]*)"\])?$/.exec(part.trim());
  if (!m) throw new Error('fake DOM cannot match ' + part);
  const [, tag, attr, word, value] = m;
  if (tag && tag !== '*' && tag !== e.tagName) return false;
  if (!attr) return true;
  const have = e.getAttribute(attr);
  return have !== null && (word ? have.split(/\s+/).includes(value) : have === value);
};
const select = (sel, list) => list.filter((e) => sel.split(',').some((part) => matchesPart(e, part)));
const abs = (u) => (u ? new URL(u, BASE).href : '');
const el = (tag, attrs = {}, parent = null, bg = 'none') => ({
  tagName: tag, attrs, parent, bg,
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
  get src() { return abs(this.attrs.src); },
  get currentSrc() { return abs(this.attrs.currentSrc); },
  get href() { return abs(this.attrs.href); },
  get content() { return this.attrs.content || ''; },
  closest(t) { let p = this.parent; while (p && p.tagName !== t) p = p.parent; return p; },
  querySelectorAll(t) { return select(t, all).filter((e) => e.closest(this.tagName) === this); },
});

// sizes: url -> [w, h] loads at that size; a url that is absent errors; opts.hang urls never answer;
// opts.delays: url -> milliseconds before it answers. Time is virtual: timers and image loads run in time order.
// Returns the URLs shown in the results page, in order, and the whole page.
async function run(elements, sizes, opts = {}) {
  all = elements;
  const hang = opts.hang || [];
  const delays = opts.delays || {};
  const queue = [];
  let now = 0;
  let nextId = 1;
  const schedule = (ms, fn) => { const ev = { id: nextId++, at: now + ms, fn }; queue.push(ev); return ev.id; };
  const alerts = [];
  const root = { style: { cursor: '' } };
  let cursorWhileLoading = null;
  let page = null;
  const { done } = runGrabbo({
    document: {
      baseURI: BASE,
      documentElement: root,
      title: opts.title === undefined ? 'The Title' : opts.title,
      querySelectorAll: (sel) => {
        if (opts.fail) throw new Error('boom');
        return select(sel, all);
      },
    },
    getComputedStyle: (e) => ({ backgroundImage: e.bg }),
    location: { get href() { return BASE; }, set href(v) { page = v; } },
    URL: Object.assign(class extends URL {}, { createObjectURL: (b) => b.parts.join('') }),
    Blob: class { constructor(parts) { this.parts = parts; } },
    alert: (m) => alerts.push(m),
    Image: class {
      set src(u) {
        cursorWhileLoading = root.style.cursor;
        if (hang.includes(u)) return;
        schedule(delays[u] || 0, () => {
          if (sizes[u]) { this.naturalWidth = sizes[u][0]; this.naturalHeight = sizes[u][1]; this.onload(); } else this.onerror();
        });
      }
    },
    setTimeout: (fn, ms) => schedule(ms, fn),
    clearTimeout: (id) => { const i = queue.findIndex((ev) => ev.id === id); if (i >= 0) queue.splice(i, 1); },
  });
  for (;;) {
    await new Promise((r) => setImmediate(r)); // let promise callbacks run between events
    if (!queue.length) break;
    queue.sort((a, b) => a.at - b.at || a.id - b.id);
    const ev = queue.shift();
    now = ev.at;
    ev.fn();
  }
  await done;
  const urls = page ? [...page.matchAll(/<input [^>]*value="([^"]*)"/g)].map((m) => m[1]) : [];
  return { urls, page, alerts, cursor: root.style.cursor, cursorWhileLoading };
}

const meta = (content) => el('meta', { property: 'og:image', content });
const icon = (href) => el('link', { rel: 'shortcut icon', href });

test('best size per picture: linked full-size image, picture sources, lazy attributes; shared URLs stay in the first group', async () => {
  const a = el('a', { href: 'big.jpg' });
  const pic = el('picture');
  const els = [
    a, el('img', { src: 'small.jpg' }, a),
    pic, el('source', { srcset: 'p1.jpg 1x, p2.jpg 2x' }, pic), el('img', {}, pic),
    el('img', { 'data-src': 'lazy.jpg' }),
    el('div', {}, null, 'url("' + D + 'small.jpg")'),
  ];
  const { urls } = await run(els, {
    [D + 'small.jpg']: [100, 100], [D + 'big.jpg']: [1000, 1000],
    [D + 'p1.jpg']: [200, 200], [D + 'p2.jpg']: [400, 400], [D + 'lazy.jpg']: [300, 300],
  });
  assert.deepEqual(urls, [D + 'big.jpg', D + 'p2.jpg', D + 'lazy.jpg']);
});

test('the source the browser chose and the src attribute are both candidates', async () => {
  const els = [el('img', { currentSrc: 'chosen.jpg', src: 'full.jpg' })];
  const { urls } = await run(els, { [D + 'chosen.jpg']: [100, 100], [D + 'full.jpg']: [900, 900] });
  assert.deepEqual(urls, [D + 'full.jpg']);
});

test('URLs with an unsafe scheme never reach the results page, from any source', async () => {
  const a = el('a', { href: 'javascript:alert(1)//.png' });
  const els = [
    a, el('img', { src: 'javascript:alert(2)//.png' }, a),
    el('img', { srcset: 'javascript:alert(3) 2x, vbscript:x 1x', 'data-src': 'file:///etc/passwd' }),
    el('div', {}, null, 'url("vbscript:x")'),
    el('img', { src: 'ok.jpg' }),
    meta('javascript:alert(4)'),
    icon('javascript:alert(5)'),
  ];
  const { urls, page } = await run(els, { [D + 'ok.jpg']: [10, 10] });
  assert.deepEqual(urls, [D + 'ok.jpg']);
  assert.ok(!/javascript:|vbscript:|file:/i.test(page.replace(/<script>[\s\S]*<\/script>/, '')));
});

test('http, https, data and blob URLs are kept', async () => {
  const urls = ['http://e.com/a.png', 'https://e.com/b.png', 'data:image/png;base64,AAAA', 'blob:https://e.com/0b8f'];
  const sizes = Object.fromEntries(urls.map((u, i) => [u, [10 + i, 10 + i]]));
  const { urls: shown } = await run(urls.map((src) => el('img', { src })), sizes);
  assert.deepEqual(shown.sort(), [...urls].sort());
});

test('a CSS background URL that contains a closing bracket is kept whole', async () => {
  const els = [el('div', {}, null, 'url("' + D + 'a(1).png")')];
  const { urls } = await run(els, { [D + 'a(1).png']: [50, 50] });
  assert.deepEqual(urls, [D + 'a(1).png']);
});

test('og:image and icons are collected as their own pictures', async () => {
  const els = [meta('/og.png'), icon('/favicon.png')];
  const { urls } = await run(els, { 'https://e.com/og.png': [1200, 630], 'https://e.com/favicon.png': [32, 32] });
  assert.deepEqual(urls, ['https://e.com/og.png', 'https://e.com/favicon.png']);
});

test('a candidate that never answers is given up on after 8 seconds and loses to one that loaded', async () => {
  const els = [el('img', { srcset: 'good.jpg 100w, slow.jpg 9999w' })];
  const { urls } = await run(els, { [D + 'good.jpg']: [100, 100] }, { hang: [D + 'slow.jpg'] });
  assert.deepEqual(urls, [D + 'good.jpg']);
});

test('the 8 second wait restarts whenever an image finishes, so a slow queue is not cut off', async () => {
  const els = [el('img', { srcset: 'a.jpg 100w, b.jpg 900w' })];
  const sizes = { [D + 'a.jpg']: [100, 100], [D + 'b.jpg']: [900, 900] };
  // b answers 12 s after the start, but a answered at 5 s, so b still has 8 s from then.
  const { urls } = await run(els, sizes, { delays: { [D + 'a.jpg']: 5000, [D + 'b.jpg']: 12000 } });
  assert.deepEqual(urls, [D + 'b.jpg']);
});

test('a page with no images still renders, with the original title and address', async () => {
  const { urls, page } = await run([], {}, { title: 'No Pictures' });
  assert.deepEqual(urls, []);
  assert.ok(page.includes('No Pictures'));
  assert.ok(page.includes(BASE));
});

test('the pointer shows progress while images load and is restored before the results page opens', async () => {
  const { cursor, cursorWhileLoading } = await run([el('img', { src: 'a.jpg' })], { [D + 'a.jpg']: [10, 10] });
  assert.equal(cursorWhileLoading, 'progress');
  assert.equal(cursor, '');
});

test('a failure is reported with an alert, the pointer is restored and no results page opens', async () => {
  const { page, alerts, cursor } = await run([], {}, { fail: true });
  assert.equal(page, null);
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].includes('boom'));
  assert.equal(cursor, '');
});

test('a DOM node under __grabboTest does not trigger the test hook, so the bookmarklet runs', async () => {
  // Past the guard the collector needs a DOM, which this bare context lacks.
  const { done } = runGrabbo({ __grabboTest: { nodeType: 1 } });
  await assert.rejects(done, (e) => e.name === 'ReferenceError' && /document/.test(e.message));
});

test('same size: the png wins over the avif the browser chose', async () => {
  const pic = el('picture');
  const els = [
    pic, el('source', { srcset: 'calendar.NPz69.webp 888w' }, pic),
    el('img', { currentSrc: 'calendar.Qai6i.avif', srcset: 'calendar.1G5uWf.png 888w' }, pic),
  ];
  const { urls } = await run(els, {
    [D + 'calendar.Qai6i.avif']: [888, 712], [D + 'calendar.1G5uWf.png']: [888, 712], [D + 'calendar.NPz69.webp']: [888, 712],
  });
  assert.deepEqual(urls, [D + 'calendar.1G5uWf.png']);
});

test('same size: a jpg src wins over the avif and webp sources', async () => {
  const pic = el('picture');
  const els = [
    pic, el('source', { srcset: 'x.avif 888w' }, pic), el('source', { srcset: 'x.webp 888w' }, pic),
    el('img', { currentSrc: 'x.avif', src: 'x.jpg', srcset: 'x.jpg 888w' }, pic),
  ];
  const { urls } = await run(els, { [D + 'x.avif']: [888, 712], [D + 'x.webp']: [888, 712], [D + 'x.jpg']: [888, 712] });
  assert.deepEqual(urls, [D + 'x.jpg']);
});

test('width descriptors: the largest png wins over the largest avif of the same size', async () => {
  const pic = el('picture');
  const els = [
    pic, el('source', { srcset: 'x.avif 888w, x@2x.avif 1776w' }, pic),
    el('img', { currentSrc: 'x@2x.avif', src: 'x.png', srcset: 'x.png 888w, x@2x.png 1776w' }, pic),
  ];
  const { urls } = await run(els, {
    [D + 'x.avif']: [888, 712], [D + 'x@2x.avif']: [1776, 1424], [D + 'x.png']: [888, 712], [D + 'x@2x.png']: [1776, 1424],
  });
  assert.deepEqual(urls, [D + 'x@2x.png']);
});

test('a file that two pictures share stays in the first picture, so the second keeps its own avif', async () => {
  const p1 = el('picture');
  const p2 = el('picture');
  const els = [
    p1, el('img', { currentSrc: 'a.avif', srcset: 'a.png 888w' }, p1),
    p2, el('img', { src: 'a.png', srcset: 'b.avif 888w' }, p2),
  ];
  const { urls } = await run(els, { [D + 'a.avif']: [888, 712], [D + 'a.png']: [888, 712], [D + 'b.avif']: [888, 712] });
  assert.deepEqual(urls, [D + 'a.png', D + 'b.avif']);
});

test('a larger avif beats a png of the same picture', async () => {
  const pic = el('picture');
  const els = [
    pic, el('source', { srcset: 'calendar.NPz69.webp 888w' }, pic),
    el('img', { currentSrc: 'calendar.Qai6i.avif', srcset: 'calendar.1G5uWf.png 888w' }, pic),
  ];
  const { urls } = await run(els, {
    [D + 'calendar.Qai6i.avif']: [1776, 1424], [D + 'calendar.1G5uWf.png']: [888, 712], [D + 'calendar.NPz69.webp']: [888, 712],
  });
  assert.deepEqual(urls, [D + 'calendar.Qai6i.avif']);
});
