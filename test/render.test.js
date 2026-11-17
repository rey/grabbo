'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo } = require('./load');

const { renderPage, esc, buildCopyPayload } = loadGrabbo();

const base = (over) => Object.assign({
  version: '1.0.0',
  title: 'Example',
  origin: 'https://e.com/page?a=1&b=2',
  items: [],
}, over);
const item = (url, size = null, versions = []) => ({ url, size, versions });

const count = (s, sub) => s.split(sub).length - 1;
const between = (s, open, close) => s.slice(s.indexOf(open), s.indexOf(close));
const style = (out) => between(out, '<style>', '</style>');

test('the page is a complete document with one inline script, no inline handlers and no external resources', () => {
  const out = renderPage(base({ items: [item('https://e.com/a.jpg')] }));
  assert.ok(out.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8">'));
  assert.ok(out.endsWith('</body></html>'));
  assert.equal(count(out, '<script'), 1);
  assert.ok(!/<[^>]*\son\w+=/i.test(out));
  assert.ok(!/<link|<script[^>]*\ssrc=|@import/i.test(out));
});

test('hostile titles, page addresses, image addresses and file names are escaped', () => {
  const url = 'https://e.com/a.jpg?q="x"&y=\'1\'';
  const out = renderPage(base({
    title: '</script><img src=x onerror=1>',
    origin: 'https://e.com/p?q="1"&r=\'2\'',
    items: [item(url), item('https://e.com/%3Cb%3E.png')],
  }));
  for (const raw of ['</script><img', url, 'q="1"', '<b>.png']) assert.ok(!out.includes(raw), raw);
  assert.equal(count(out, esc(url)), 3, 'input value, image source and copy button');
  assert.ok(out.includes('&#60;b&#62;.png'));
});

test('the h1 is the page title linked back to the page, with an arrow; an empty title falls back to the address', () => {
  const out = renderPage(base({ title: 'My Page', origin: 'https://e.com/p?a=1&b=2' }));
  const header = between(out, '<header>', '</header>');
  assert.ok(header.includes('<a href="' + esc('https://e.com/p?a=1&b=2') + '" data-action="back"><span aria-hidden="true">←</span> My Page</a>'));
  assert.equal(count(out, '<h1>'), 1);
  assert.ok(header.indexOf('</h1>') < header.indexOf('>Copy page link</button>'), 'the button follows the title in the same header');
  assert.ok(out.includes('<title>Grabbo: My Page</title>'));

  const blank = renderPage(base({ title: '  ', origin: 'https://e.com/p' }));
  assert.ok(blank.includes('</span> https://e.com/p</a>'));
  assert.ok(blank.includes('<title>Grabbo: https://e.com/p</title>'));
});

test('the page-link button carries the ready-made clipboard html and the plain address', () => {
  for (const [title, origin] of [['My page', 'https://e.com/a?x=1'], ['</script><b>&"', 'https://e.com/a?x="1"&y=\'2\''], ['', 'https://e.com/a'], ['  \n ', 'https://e.com/a?q=1&r=2']]) {
    const out = renderPage(base({ title, origin }));
    const want = buildCopyPayload(origin, title);
    assert.ok(out.includes('data-url="' + esc(origin) + '" data-html="' + esc(want.html) + '">Copy page link</button>'), title);
  }
});

test('the image count is an h2 at the start of main, singular for one image', () => {
  const heading = (items) => /<h2>([^<]*)<\/h2>/.exec(renderPage(base({ items })))[1];
  const a = item('https://e.com/a.jpg');
  assert.equal(heading([]), '0 images');
  assert.equal(heading([a]), '1 image');
  assert.equal(heading([a, a]), '2 images');
  assert.ok(renderPage(base({ items: [a] })).includes('<main><h2>'));
});

test('the page runs header, main (an ordered list of images), then footer, with a live status region', () => {
  const out = renderPage(base({ items: [item('https://e.com/a.jpg'), item('https://e.com/b.jpg')] }));
  const order = ['<header>', '</header>', '<main>', '<ol>', '</ol>', '</main>', '<footer>', '</footer>'].map((t) => out.indexOf(t));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.equal(count(out, '<li>'), 2);
  assert.match(out, /<div id="status"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('each image has its caption, picture, a read-only URL field, then a copy button, in that order', () => {
  const url = 'https://e.com/img/lol-cool-image.png?x=1&y=2';
  const out = renderPage(base({ items: [item(url, [1200, 800])] }));
  const li = between(out, '<li>', '</li>');
  const input = '<input type="text" readonly aria-label="Image URL" value="' + esc(url) + '">';
  assert.ok(li.includes('<figcaption id="cap-0">1200×800 · lol-cool-image.png</figcaption>'));
  assert.ok(li.includes('alt="lol-cool-image.png"'));
  assert.match(li, new RegExp('<img [^>]*src="' + esc(url).replace(/[?.]/g, '\\$&') + '"'));
  const at = ['<figcaption', '<img ', '</figure>', input, '>Copy image link</button>'].map((t) => li.indexOf(t));
  assert.ok(at.every((i) => i >= 0), 'all parts exist');
  assert.deepEqual(at, [...at].sort((x, y) => x - y));
});

test('the caption shows only the parts that exist, and the button is described by it only when it exists', () => {
  const cap = (it) => /<figcaption[^>]*>([^<]*)<\/figcaption>/.exec(renderPage(base({ items: [it] })))[1];
  assert.equal(cap(item('https://e.com/a.jpg')), 'a.jpg');
  assert.equal(cap(item('https://e.com/a.svg', [0, 0])), 'a.svg');
  assert.equal(cap(item('https://e.com/', [10, 20])), '10×20');
  assert.equal(cap(item('data:image/png;base64,AAAA')), '');

  const items = [item('https://e.com/a.jpg', [10, 10]), item('data:image/png;base64,AAAA'), item('https://e.com/c.jpg')];
  const out = renderPage(base({ items }));
  assert.equal(count(out, 'id="cap-'), 2);
  assert.ok(out.includes('aria-describedby="cap-0"') && out.includes('aria-describedby="cap-2"'));
  assert.equal(count(out, 'aria-describedby'), 2);
  assert.ok(renderPage(base({ items: [items[1]] })).includes('alt=""'));
});

test('the footer links the name and version to the project page, in a new tab so the results stay open', () => {
  const out = renderPage(base({ version: '1.2.3' }));
  assert.ok(out.includes('<footer><a href="https://rey.github.io/grabbo/" target="_blank" rel="noopener">Grabbo 1.2.3</a></footer>'));
});

test('the stylesheet: spacing in rlh, one font size, one column width', () => {
  const css = style(renderPage(base()));
  assert.ok(/margin-top:\d*\.?\d+rlh/.test(css));
  assert.ok(!/(margin|padding)[^;}]*\drem/.test(css), 'no rem in margins or padding');
  assert.deepEqual(css.match(/font-size:[^;}]*/g), ['font-size:1rem']);
  assert.ok(css.includes('body{background:ghostwhite}'));
  assert.equal(count(css, '--column:640px'), 1);
  assert.ok(!/\d+px/.test(css.replace('font:16px/1.5', '').replace('--column:640px', '')), 'no other fixed pixel widths');
});

const ver = (url, size) => ({ url, size });
const versionsHtml = (it) => between(renderPage(base({ items: [it] })), '<details>', '</details>');

test('a picture with no versions has no details block', () => {
  assert.ok(!renderPage(base({ items: [item('https://e.com/a.jpg', [10, 10])] })).includes('<details'));
});

test('the versions link counts the other sizes, singular for one, and sits after the main copy button', () => {
  const summary = (n) => /<summary>([^<]*)<\/summary>/.exec(renderPage(base({
    items: [item('https://e.com/a.jpg', [9, 9], Array.from({ length: n }, (_, i) => ver('https://e.com/v' + i + '.jpg', [1, 1])))],
  })))[1];
  assert.equal(summary(1), '1 version');
  assert.equal(summary(3), '3 versions');
  const out = renderPage(base({ items: [item('https://e.com/a.jpg', [9, 9], [ver('https://e.com/b.jpg', [1, 1])])] }));
  assert.ok(out.indexOf('>Copy image link</button>') < out.indexOf('<details>'));
  assert.ok(out.indexOf('</details></li>') > 0, 'the details block ends its picture');
  assert.ok(!/<summary[^>]*data-action/.test(out), 'the toggle is left to the browser');
});

test('each version has the same layout as an image, and the image count stays the number of pictures', () => {
  const url = 'https://e.com/img/small one.png?x=1&y=2';
  const out = renderPage(base({ items: [item('https://e.com/a.jpg', [9, 9], [ver(url, [320, 200])])] }));
  const li = between(versionsHtml(item('https://e.com/a.jpg', [9, 9], [ver(url, [320, 200])])), '<li>', '</li>');
  const input = '<input type="text" readonly aria-label="Image URL" value="' + esc(url) + '">';
  assert.ok(li.includes('>320×200 · small one.png</figcaption>'));
  const at = ['<figcaption', '<img ', '</figure>', input, '>Copy image link</button>'].map((t) => li.indexOf(t));
  assert.ok(at.every((i) => i >= 0), 'all parts exist');
  assert.deepEqual(at, [...at].sort((x, y) => x - y));
  assert.ok(out.includes('<h2>1 image</h2>'));
});

test('version images load lazily, with their size reserved; no size attributes for [0, 0] or an unknown size', () => {
  const img = (size) => /<img [^>]*>/.exec(versionsHtml(item('https://e.com/a.jpg', [9, 9], [ver('https://e.com/v.jpg', size)])))[0];
  assert.match(img([320, 200]), /loading="lazy" decoding="async" width="320" height="200"/);
  for (const size of [[0, 0], null]) {
    assert.match(img(size), /loading="lazy"/);
    assert.ok(!/width=|height=/.test(img(size)), String(size));
  }
  assert.ok(!/loading=/.test(/<img [^>]*>/.exec(renderPage(base({ items: [item('https://e.com/a.jpg', [9, 9])] })))[0]), 'the main image is not lazy');
});

test('caption ids stay unique and every described-by points to one, across pictures and versions', () => {
  const items = [
    item('https://e.com/a.jpg', [9, 9], [ver('https://e.com/a2.jpg', [1, 1]), ver('https://e.com/a3.jpg', [2, 2])]),
    item('https://e.com/b.jpg', [9, 9], [ver('https://e.com/b2.jpg', [1, 1])]),
  ];
  const out = renderPage(base({ items }));
  const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  const refs = [...out.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(refs.length, 5);
  for (const r of refs) assert.ok(ids.includes(r), r);
});

test('hostile version addresses are escaped', () => {
  const url = 'https://e.com/a.jpg?q="x"&y=\'1\'';
  const out = renderPage(base({ items: [item('https://e.com/m.jpg', [9, 9], [ver(url, [1, 1]), ver('https://e.com/%3Cb%3E.png', [1, 1])])] }));
  for (const raw of [url, '<b>.png']) assert.ok(!out.includes(raw), raw);
  assert.equal(count(out, esc(url)), 3);
});

test('the URL field and copy button share one row of equal height, and the versions link is a left-aligned summary under it', () => {
  const out = renderPage(base({ items: [item('https://e.com/a.jpg', [9, 9], [ver('https://e.com/b.jpg', [1, 1])])] }));
  assert.match(out, /<div><input [^>]*><button [^>]*>Copy image link<\/button><\/div><details>/);
  const css = style(out);
  assert.ok(css.includes('li>div{display:flex;gap:.5rlh}'), 'a flex row stretches the field and button to one height');
  assert.ok(css.includes('li>div>input{flex:1;min-width:0}') && css.includes('li>div>button{flex:none}'));
  assert.ok(css.includes('summary{display:inline-block;padding-block:.25rlh;color:royalblue;text-decoration:underline;cursor:pointer;list-style:none}'));
  assert.ok(css.includes('summary::-webkit-details-marker{display:none}'));
  assert.ok(css.includes('details>ol{margin-top:.5rlh;padding-inline-start:2rlh}'));
  assert.ok(css.includes('img{max-width:100%;height:auto}'));
  assert.ok(!/float|flow-root|grid|contents/.test(css));
});
