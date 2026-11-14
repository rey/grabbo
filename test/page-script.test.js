'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadGrabbo } = require('./load');

const { pageScript } = loadGrabbo();
const LINK = { url: 'https://e.com/', html: '<a href="https://e.com/">T</a>' };
const SRC = pageScript.toString();
const tick = () => new Promise((r) => setImmediate(r));

// A fake element with the few things the page script uses. matches() knows tag names and [data-action].
const el = (tag, dataset = {}, parent = null) => ({
  tag, dataset, parent, textContent: tag === 'button' ? 'Copy' : '', calls: [],
  matches(sel) { return sel === this.tag || (sel === '[data-action]' && 'action' in this.dataset); },
  closest(sel) { for (let n = this; n; n = n.parent) if (n.matches(sel)) return n; return null; },
  focus() { this.calls.push('focus'); },
  select() { this.calls.push('select'); },
});

// Run the page script in a vm context with browser stubs.
// opts.clipboard: 'ok' | 'reject' | 'throw' | 'none'. opts.exec: 'ok' | 'false' | 'throw'.
function setup(opts = {}) {
  const mode = opts.clipboard || 'ok';
  const env = { writes: [], exec: [], setData: [], timers: [], backs: 0, status: { textContent: '' }, listeners: {} };
  const fire = (type, ev) => { for (const fn of [...(env.listeners[type] || [])]) fn(ev); };
  class ClipboardItem { constructor(arg) { this.items = arg; } }
  class Blob { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } }
  const document = {
    addEventListener(type, fn) { (env.listeners[type] = env.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { env.listeners[type] = (env.listeners[type] || []).filter((f) => f !== fn); },
    getElementById: (id) => (id === 'status' ? env.status : null),
    createElement: (tag) => ({ ...el(tag), style: {}, remove() {} }),
    body: { appendChild() {} },
    execCommand(cmd) {
      env.exec.push(cmd);
      if (opts.exec === 'throw') throw new Error('exec');
      fire('copy', { preventDefault() {}, clipboardData: { setData: (t, v) => env.setData.push([t, v]) } });
      return opts.exec !== 'false';
    },
  };
  const navigator = {};
  if (mode !== 'none') {
    navigator.clipboard = {
      write(items) {
        env.writes.push(items);
        if (mode === 'throw') throw new Error('sync');
        return mode === 'reject' ? Promise.reject(new Error('async')) : Promise.resolve();
      },
    };
  }
  const ctx = vm.createContext({
    document, navigator, ClipboardItem, Blob, Promise,
    history: { length: opts.historyLength === undefined ? 2 : opts.historyLength, back() { env.backs++; } },
    setTimeout: (fn, ms) => { env.timers.push({ fn, ms, cleared: false }); return env.timers.length; },
    clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].cleared = true; },
  });
  vm.runInContext('(' + SRC + ')()', ctx);
  env.fire = (type, target) => {
    const ev = { prevented: false, target, preventDefault() { this.prevented = true; } };
    fire(type, ev);
    return ev;
  };
  // Click a child of a button, as a real click lands on the text inside it.
  env.click = async (action, data = {}, existing) => {
    const btn = existing || el('button', { action, ...data });
    const ev = env.fire('click', el('span', {}, btn));
    await tick();
    return { btn, ev };
  };
  return env;
}

test('source has no script-closing or comment-opening text', () => {
  assert.ok(!SRC.includes('</script'));
  assert.ok(!SRC.includes('<!--'));
});

test('copy writes html first and plain text second, exactly as the button gives them, then says Copied! for 2 seconds', async () => {
  const env = setup();
  const html = '<a href="https://e.com/a?x=&#34;1&#34;">&#60;b&#62;</a>';
  const { btn } = await env.click('copy', { url: 'https://e.com/a?x="1"', html });
  assert.equal(env.writes.length, 1);
  const items = env.writes[0][0].items;
  assert.deepEqual(Object.keys(items), ['text/html', 'text/plain']);
  assert.equal(items['text/html'].parts[0], html);
  assert.equal(items['text/html'].type, 'text/html');
  assert.equal(items['text/plain'].parts[0], 'https://e.com/a?x="1"');
  assert.equal(items['text/plain'].type, 'text/plain');
  assert.equal(btn.textContent, 'Copied!');
  assert.equal(env.status.textContent, 'Copied!');
  assert.deepEqual(env.timers.map((t) => t.ms), [2000]);
});

test('copy without html writes only plain text', async () => {
  const env = setup();
  await env.click('copy', { url: 'https://e.com/i.jpg' });
  const items = env.writes[0][0].items;
  assert.deepEqual(Object.keys(items), ['text/plain']);
  assert.equal(items['text/plain'].parts[0], 'https://e.com/i.jpg');
});

test('no navigator.clipboard: the execCommand fallback sets both types', async () => {
  const env = setup({ clipboard: 'none' });
  const { btn } = await env.click('copy', LINK);
  assert.deepEqual(env.exec, ['copy']);
  assert.deepEqual(env.setData, [['text/html', '<a href="https://e.com/">T</a>'], ['text/plain', 'https://e.com/']]);
  assert.equal(btn.textContent, 'Copied!');
});

test('write throwing synchronously falls back to execCommand', async () => {
  const env = setup({ clipboard: 'throw' });
  const { btn } = await env.click('copy', { url: 'https://e.com/i.jpg' });
  assert.deepEqual(env.exec, ['copy']);
  assert.equal(btn.textContent, 'Copied!');
});

test('the fallback says Failed when execCommand returns false or throws', async () => {
  for (const exec of ['false', 'throw']) {
    const env = setup({ clipboard: 'none', exec });
    const { btn } = await env.click('copy', LINK);
    assert.equal(btn.textContent, 'Failed', exec);
    assert.equal(env.status.textContent, 'Failed', exec);
  }
});

test('write rejecting asynchronously gives Failed and no fallback', async () => {
  const env = setup({ clipboard: 'reject' });
  const { btn } = await env.click('copy', LINK);
  assert.equal(btn.textContent, 'Failed');
  assert.equal(env.status.textContent, 'Failed');
  assert.equal(env.exec.length, 0);
});

test('back calls preventDefault and history.back when there is history', async () => {
  const env = setup();
  const { ev } = await env.click('back');
  assert.equal(ev.prevented, true);
  assert.equal(env.backs, 1);
});

test('back does nothing when history is empty', async () => {
  const env = setup({ historyLength: 1 });
  const { ev } = await env.click('back');
  assert.equal(ev.prevented, false);
  assert.equal(env.backs, 0);
});

test('second click within 2s: label returns to the original after all timers run', async () => {
  const env = setup();
  const { btn } = await env.click('copy', LINK);
  await env.click('copy', LINK, btn);
  assert.equal(btn.textContent, 'Copied!');
  for (const t of env.timers) if (!t.cleared) t.fn();
  assert.equal(btn.textContent, 'Copy');
});

test('the status message is cleared when the label resets, so a repeat copy is announced again', async () => {
  const env = setup();
  const { btn } = await env.click('copy', { url: 'https://e.com/a.jpg' });
  assert.equal(env.status.textContent, 'Copied!');
  env.timers[0].fn();
  assert.equal(btn.textContent, 'Copy');
  assert.equal(env.status.textContent, '');
});

test('pressing the mouse on a URL field focuses and selects it once, and cancels the caret placement', () => {
  const env = setup();
  const field = el('input');
  const ev = env.fire('mousedown', field);
  assert.equal(ev.prevented, true);
  assert.deepEqual(field.calls, ['focus', 'select']);
});

test('focusing a URL field, for example with Tab, selects all of its text', () => {
  const env = setup();
  const field = el('input');
  env.fire('focusin', field);
  assert.deepEqual(field.calls, ['select']);
});

test('pressing or focusing something else does not select or cancel the press', () => {
  const env = setup();
  const other = el('button');
  env.fire('focusin', other);
  const ev = env.fire('mousedown', other);
  assert.equal(ev.prevented, false);
  assert.deepEqual(other.calls, []);
});
