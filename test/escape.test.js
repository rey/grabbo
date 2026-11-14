'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo, plain } = require('./load');

const { esc, buildCopyPayload } = loadGrabbo();

test('esc replaces & < > " \' with numeric entities', () => {
  assert.strictEqual(esc('<a href="x">&\''), '&#60;a href=&#34;x&#34;&#62;&#38;&#39;');
});

test('esc converts non-strings', () => {
  assert.strictEqual(esc(5), '5');
});

test('buildCopyPayload escapes url and title, keeps fragment in text', () => {
  const url = 'https://e.com/a?x=1&y="2"#f';
  assert.deepStrictEqual(plain(buildCopyPayload(url, 'My <b> page')), {
    html: '<a href="https://e.com/a?x=1&#38;y=&#34;2&#34;#f">My &#60;b&#62; page</a>',
    text: url,
  });
});

test('buildCopyPayload uses the url as link text for empty or blank titles', () => {
  const url = 'https://e.com/a?x=1&y=2';
  const want = '<a href="https://e.com/a?x=1&#38;y=2">https://e.com/a?x=1&#38;y=2</a>';
  assert.strictEqual(buildCopyPayload(url, '').html, want);
  assert.strictEqual(buildCopyPayload(url, '  ').html, want);
});
