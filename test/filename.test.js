'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGrabbo } = require('./load');

const { fileNameOf } = loadGrabbo();

test('fileNameOf: the last path segment', () => {
  assert.strictEqual(fileNameOf('https://e.com/a/lol-cool-image.png'), 'lol-cool-image.png');
});

test('fileNameOf: ignores the query string and fragment', () => {
  assert.strictEqual(fileNameOf('https://e.com/a/b.jpg?w=100&h=2#top'), 'b.jpg');
});

test('fileNameOf: decodes percent escapes, and keeps a malformed one as it is', () => {
  assert.strictEqual(fileNameOf('https://e.com/my%20pic.png'), 'my pic.png');
  assert.strictEqual(fileNameOf('https://e.com/100%.png'), '100%.png');
});

test('fileNameOf: empty when there is no file name', () => {
  assert.strictEqual(fileNameOf('https://e.com/a/'), '');
  assert.strictEqual(fileNameOf('https://e.com'), '');
  assert.strictEqual(fileNameOf('https://e.com?x=1/y'), '');
  assert.strictEqual(fileNameOf('data:image/png;base64,AAAA'), '');
  assert.strictEqual(fileNameOf('blob:https://e.com/0b8f'), '');
});

test('fileNameOf: strips control and bidirectional characters', () => {
  assert.strictEqual(fileNameOf('https://e.com/gpj.%E2%80%AEexe.png'), 'gpj.exe.png');
  assert.strictEqual(fileNameOf('https://e.com/a%0Ab%09c.png'), 'abc.png');
});

test('fileNameOf: keeps an encoded slash as part of the name', () => {
  assert.strictEqual(fileNameOf('https://e.com/a%2Fb.png'), 'a/b.png');
});
