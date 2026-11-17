(async () => {
  const VERSION = '__VERSION__';

  // '400w' -> {w:400,x:0}, '2x' -> {w:0,x:2}. Anything else -> zeros.
  const parseDescriptor = (desc) => {
    const m = /^(\d*\.?\d+)([wx])$/i.exec(desc || '');
    const unit = m && m[2].toLowerCase();
    return { w: unit === 'w' ? +m[1] : 0, x: unit === 'x' ? +m[1] : 0 };
  };

  // srcset, as the HTML spec reads it. URLs can contain commas, so a URL is a run of
  // non-whitespace; trailing commas end a candidate that has no descriptor.
  const parseSrcset = (set) => {
    const out = [];
    const s = set || '';
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (i >= s.length) break;
      let j = i;
      while (j < s.length && !/\s/.test(s[j])) j++;
      let url = s.slice(i, j);
      i = j;
      let desc = '';
      if (/,$/.test(url)) {
        url = url.replace(/,+$/, '');
      } else {
        j = i;
        while (j < s.length && s[j] !== ',') j++;
        desc = s.slice(i, j).trim();
        i = j;
      }
      if (url) out.push({ url, desc });
    }
    return out;
  };

  // Declared size as a score. 1x counts as 1000w (assumed 1000px base width).
  const declaredScore = (info) => {
    const w = (info && info.w) || 0;
    const x = (info && info.x) || 0;
    if (w) return w * w;
    if (x) return (x * 1000) ** 2;
    return 0;
  };

  // The part of a URL before the first ? or #.
  const pathOf = (url) => url.split(/[?#]/, 1)[0];
  const isDerived = (url) => /\.(?:webp|avif)$/i.test(pathOf(url));
  const isOriginal = (url) => /\.(?:jpe?g|png)$/i.test(pathOf(url));

  // Best candidate of one picture. Measured pixel area always beats a declared size.
  // On a tie, a JPG or PNG replaces a WebP or AVIF, because WebP and AVIF files are usually re-encodes of it.
  // Any other tie keeps the first entry.
  const pickBest = (entries, sizes) => {
    let best = null;
    for (const [url, info] of entries) {
      const size = sizes.get(url);
      const measured = !!size;
      const score = measured ? size[0] * size[1] : declaredScore(info);
      const tieToOriginal = measured && best && best.measured && score === best.score && isDerived(best.url) && isOriginal(url);
      if (!best || (measured && !best.measured) || (measured === best.measured && score > best.score) || tieToOriginal) {
        best = { url, info, score, measured };
      }
    }
    return best;
  };

  // One result per picture: measured first, then declared-only. Declared-only with no size is dropped.
  // Each result keeps the entries of its picture, so versionsOf can list the others.
  const rankPictures = (pictures, sizes) => {
    const best = pictures.map((g) => ({ ...pickBest(g, sizes), entries: g })).filter((b) => b.measured || b.score > 0);
    const byScore = (a, b) => b.score - a.score;
    return [...best.filter((b) => b.measured).sort(byScore), ...best.filter((b) => !b.measured).sort(byScore)];
  };

  // The other files of a picture that loaded, largest first. A tie keeps the page order.
  const versionsOf = (entries, sizes, bestUrl) => entries
    .filter(([url]) => url !== bestUrl && sizes.get(url))
    .map(([url]) => ({ url, size: sizes.get(url) }))
    .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1]);

  // Merge a later srcset descriptor into an existing entry for the same URL.
  // A non-zero declared value is never overwritten by zero.
  const mergeEntry = (entry, desc) => {
    const d = parseDescriptor(desc);
    return { ...entry, w: d.w || entry.w, x: d.x || entry.x };
  };

  // Escape a value for HTML text and attributes.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');

  // Clipboard forms of a link: HTML anchor and plain URL. Empty title -> URL as link text.
  const buildCopyPayload = (url, title) => {
    const label = String(title).trim() || url;
    return { html: '<a href="' + esc(url) + '">' + esc(label) + '</a>', text: url };
  };

  // Runs inside the results page. Embedded with pageScript.toString(), so it must not use anything
  // outside its own body.
  const pageScript = () => {
    // Fallback for browsers without async clipboard. Returns true when the copy command worked.
    const legacyCopy = (p) => {
      const ta = document.createElement('textarea');
      ta.value = p.text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const onCopy = (e) => {
        e.preventDefault();
        if (p.html) e.clipboardData.setData('text/html', p.html);
        e.clipboardData.setData('text/plain', p.text);
      };
      document.addEventListener('copy', onCopy);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.removeEventListener('copy', onCopy);
      ta.remove();
      return ok;
    };
    const copy = (btn, p) => {
      const done = (ok) => {
        const word = ok ? 'Copied!' : 'Failed';
        if (btn.dataset.label === undefined) {
          btn.dataset.label = btn.textContent;
          // Keep the width, so the label change does not move the other items in the row.
          btn.style.minWidth = btn.offsetWidth + 'px';
        }
        btn.textContent = word;
        const status = document.getElementById('status');
        if (status) status.textContent = word;
        clearTimeout(btn.grabboTimer);
        btn.grabboTimer = setTimeout(() => { btn.textContent = btn.dataset.label; if (status) status.textContent = ''; }, 2000);
      };
      // No await before write: Safari needs it inside the user gesture.
      let pending = null;
      try {
        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
          // HTML first, then plain text.
          const items = {};
          if (p.html) items['text/html'] = new Blob([p.html], { type: 'text/html' });
          items['text/plain'] = new Blob([p.text], { type: 'text/plain' });
          pending = navigator.clipboard.write([new ClipboardItem(items)]);
        }
      } catch (e) {
        pending = null;
      }
      if (pending) {
        Promise.resolve(pending).then(() => done(true), () => done(false));
      } else {
        done(legacyCopy(p));
      }
    };
    // Tab focus selects the whole URL. A mouse press selects it once, in mousedown, and cancels the
    // browser's own caret placement, which in Safari cleared the selection a moment later.
    // So a mouse press cannot place a caret or select part of the URL; the keyboard still can.
    const isUrlField = (e) => !!(e.target && e.target.matches && e.target.matches('input'));
    document.addEventListener('focusin', (e) => { if (isUrlField(e)) e.target.select(); });
    document.addEventListener('mousedown', (e) => {
      if (!isUrlField(e)) return;
      e.preventDefault();
      e.target.focus();
      e.target.select();
    });
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'back') {
        if (history.length > 1) { e.preventDefault(); history.back(); }
      } else if (action === 'copy') {
        copy(btn, { html: btn.dataset.html, text: btn.dataset.url });
      }
    });
  };

  // The results page's whole stylesheet. One --column value sets the width of the page; the image and the URL row fill it.
  // The links are the h1 title link and the footer link, the only input is the URL field, and the only div in a list item is the row
  // that holds the field and the copy button, so they are styled by element.
  const STYLE = [
    ':root{font:16px/1.5 system-ui,sans-serif;color:#202020;--column:640px}',
    '*{box-sizing:border-box;margin:0}',
    'a{color:royalblue}',
    'button,input{font:inherit;color:inherit}',
    'body{max-width:calc(var(--column) + 1rlh);margin:0 auto;padding:.5rlh;overflow-wrap:anywhere}',
    'main{margin-top:1.5rlh}',
    'h2+ol{margin-top:.5rlh}',
    'ol{list-style:none;padding:0}',
    'li+li{margin-top:4rlh}',
    'li>*+*{margin-top:.5rlh}',
    'figure>*+*{margin-top:.25rlh}',
    'header{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.5rlh 1rlh}',
    'h1{flex:1 1 10rem;min-width:0}',
    'header button{flex:none}',
    'h1,h2{font-size:1rem}',
    'body{background:ghostwhite}',
    'img,input{display:block}',
    'img{max-width:100%;height:auto}',
    'input{width:100%}',
    'button{padding:.25rlh .5rlh}',
    'li>div{display:flex;gap:.5rlh}',
    'li>div>input{flex:1;min-width:0}',
    'li>div>button{flex:none}',
    'summary{display:inline-block;padding-block:.25rlh;color:royalblue;text-decoration:underline;cursor:pointer;list-style:none}',
    'summary::-webkit-details-marker{display:none}',
    'details>ol{margin-top:.5rlh;padding-inline-start:2rlh}',
    'footer{margin-top:4rlh}',
    '.vh{position:absolute;clip-path:inset(50%)}',
  ].join('');

  // File name for the caption: the last path segment of an http(s) URL, decoded. Empty when there is none.
  const fileNameOf = (url) => {
    const m = /^https?:\/\/[^/?#]*([^?#]*)/i.exec(String(url));
    if (!m) return '';
    const last = m[1].split('/').pop();
    let name = last;
    try { name = decodeURIComponent(last); } catch (e) { /* keep the raw text */ }
    return name.replace(/[\p{Cc}\p{Cf}]/gu, '');
  };

  // One image of the results page: caption, picture, URL field and copy button. A version also gets
  // its size reserved and loads only when its block is opened.
  const renderResult = (it, capId, isVersion) => {
    const u = esc(it.url);
    const hasSize = it.size && it.size[0] && it.size[1];
    const dims = hasSize ? it.size[0] + '×' + it.size[1] : '';
    const cap = [dims, fileNameOf(it.url)].filter(Boolean).map(esc).join(' · ');
    const extra = isVersion ? ' loading="lazy" decoding="async"' + (hasSize ? ' width="' + +it.size[0] + '" height="' + +it.size[1] + '"' : '') : '';
    return '<figure><figcaption' + (cap ? ' id="' + capId + '"' : '') + '>' + cap + '</figcaption>' +
      '<img src="' + u + '" alt="' + esc(fileNameOf(it.url)) + '"' + extra + '>' +
      '</figure>' +
      '<div><input type="text" readonly aria-label="Image URL" value="' + u + '">' +
      '<button type="button"' + (cap ? ' aria-describedby="' + capId + '"' : '') + ' data-action="copy" data-url="' + u + '">Copy image link</button></div>';
  };

  // Builds the results page as a string. Every dynamic value goes through esc() or is a number.
  const renderPage = (d) => {
    const n = d.items.length;
    const figures = d.items.map((it, i) => {
      const vs = it.versions || [];
      const more = vs.length
        ? '<details><summary>' + vs.length + (vs.length === 1 ? ' version' : ' versions') + '</summary><ol>' +
          vs.map((v, j) => '<li>' + renderResult(v, 'cap-' + i + '-' + j, true) + '</li>').join('') + '</ol></details>'
        : '';
      return '<li>' + renderResult(it, 'cap-' + i, false) + more + '</li>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<title>Grabbo: ' + esc(String(d.title).trim() || d.origin) + '</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + STYLE + '</style>' +
      '</head><body>' +
      '<header>' +
      '<h1><a href="' + esc(d.origin) + '" data-action="back"><span aria-hidden="true">←</span> ' + esc(String(d.title).trim() || d.origin) + '</a></h1>' +
      '<button type="button" data-action="copy" data-url="' + esc(d.origin) + '" data-html="' + esc(buildCopyPayload(d.origin, d.title).html) + '">Copy page link</button>' +
      '</header>' +
      '<div id="status" class="vh" role="status" aria-live="polite"></div>' +
      '<main><h2>' + n + (n === 1 ? ' image' : ' images') + '</h2><ol>' + figures + '</ol></main>' +
      '<footer><a href="https://rey.github.io/grabbo/" target="_blank" rel="noopener">Grabbo ' + esc(d.version) + '</a></footer>' +
      '<script>(' + pageScript.toString() + ')()</script>' +
      '</body></html>';
  };

  const pure = { parseDescriptor, parseSrcset, declaredScore, pickBest, rankPictures, versionsOf, mergeEntry, esc, buildCopyPayload, pageScript, fileNameOf, renderPage };
  const hook = globalThis.__grabboTest;
  // A page element with id="__grabboTest" shows up on window; ignore DOM nodes.
  if (typeof hook === 'object' && hook !== null && !hook.nodeType) { Object.assign(hook, pure); return; }

  const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|#|$)/i;
  const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-full', 'data-large', 'data-zoom-image', 'data-hi-res', 'data-highres'];
  // The results page shares this page's origin, so only these schemes may reach it.
  const SAFE_PROTOCOLS = ['http:', 'https:', 'data:', 'blob:'];

  // Progress cursor until the results page opens; the catch at the end restores it on failure.
  const root = document.documentElement;
  root.style.cursor = 'progress';

  // Each group is ONE picture on the page, with every size we can find for it.
  const groups = [];
  const newGroup = () => { const g = new Map(); groups.push(g); return g; };
  const addTo = (g, raw, desc) => {
    if (!raw) return;
    let u;
    try { u = new URL(raw, document.baseURI); } catch (e) { return; }
    if (!SAFE_PROTOCOLS.includes(u.protocol)) return;
    const url = u.href;
    if (g.has(url)) {
      g.set(url, mergeEntry(g.get(url), desc));
      return;
    }
    g.set(url, parseDescriptor(desc));
  };
  const addSrcset = (g, set) => {
    for (const c of parseSrcset(set)) addTo(g, c.url, c.desc);
  };

  document.querySelectorAll('img').forEach((i) => {
    const g = newGroup();
    addTo(g, i.currentSrc || i.src);
    addTo(g, i.getAttribute('src'));
    addSrcset(g, i.getAttribute('srcset'));
    addSrcset(g, i.getAttribute('data-srcset'));
    for (const a of LAZY_ATTRS) addTo(g, i.getAttribute(a));
    const pic = i.closest('picture');
    if (pic) pic.querySelectorAll('source').forEach((s) => {
      addSrcset(g, s.getAttribute('srcset'));
      addSrcset(g, s.getAttribute('data-srcset'));
    });
    // A link straight to an image file is often the full-size version.
    const a = i.closest('a');
    if (a && IMG_EXT.test(a.href)) addTo(g, a.href);
  });
  document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach((m) => {
    addTo(newGroup(), m.content);
  });
  document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach((l) => {
    addTo(newGroup(), l.href);
  });
  document.querySelectorAll('*').forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') return;
    const g = newGroup();
    for (const m of bg.matchAll(/url\((["']?)(.*?)\1\)/g)) addTo(g, m[2]);
  });

  // A URL belongs to the first group that has it. Drop groups left empty.
  const seen = new Set();
  const pictures = [];
  for (const g of groups) {
    for (const u of [...g.keys()]) { if (seen.has(u)) g.delete(u); else seen.add(u); }
    if (g.size) pictures.push([...g.entries()]);
  }

  // Load every candidate to learn its real size: [w, h] when loaded ([0, 0] if it has no intrinsic
  // size), null on error. A browser fetches only a few files per host at a time, so the wait is one
  // shared timer that restarts whenever an image finishes. The images still waiting when no image has
  // finished for 8 seconds are given up on and have no entry.
  const sizes = new Map();
  await new Promise((resolve) => {
    let waiting = seen.size;
    let timer;
    const finish = () => { clearTimeout(timer); waiting = -1; resolve(); };
    const settle = (u, size) => {
      if (waiting < 0 || sizes.has(u)) return;
      sizes.set(u, size);
      waiting--;
      if (!waiting) { finish(); return; }
      clearTimeout(timer);
      timer = setTimeout(finish, 8000);
    };
    if (!waiting) { resolve(); return; }
    timer = setTimeout(finish, 8000);
    for (const u of seen) {
      const im = new Image();
      im.onload = () => settle(u, [im.naturalWidth, im.naturalHeight]);
      im.onerror = () => settle(u, null);
      im.src = u;
    }
  });

  const items = rankPictures(pictures, sizes).map((b) => ({ url: b.url, size: sizes.get(b.url) || null, versions: versionsOf(b.entries, sizes, b.url) }));
  const html = renderPage({
    version: VERSION,
    title: document.title,
    origin: location.href,
    items,
  });

  root.style.cursor = '';
  location.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
})().catch((e) => {
  document.documentElement.style.cursor = '';
  alert('Grabbo could not read this page: ' + (e && e.message ? e.message : e));
});
