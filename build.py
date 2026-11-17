#!/usr/bin/env python3
"""Build index.html with the bookmarklet link from grabbo.js."""
import html
import pathlib
import re

VERSION = "1.1.0"  # semver: bump on every change to grabbo.js
NAME = "Grabbo"
OUTPUT = "index.html"
# The rules the results page (grabbo.js) and this page share, so the two look alike.
SHARED_RULES = [
    "*{box-sizing:border-box;margin:0}",
    "a{color:royalblue}",
    "h1,h2{font-size:1rem}",
    "body{background:ghostwhite}",
]
# The rest of the base: the same font, colour, 640px column and rlh spacing, without the results page extras.
PAGE_RULES = [
    ":root{font:16px/1.5 system-ui,sans-serif;color:#202020}",
    "body{max-width:calc(640px + 1rlh);margin:0 auto;padding:.5rlh}",
    "body>*+*{margin-top:1rlh}",
    "body>h2{margin-top:1.5rlh}",
    "body>h1+*,body>h2+*{margin-top:.5rlh}",
]
STYLE = "".join(SHARED_RULES + PAGE_RULES)
ABOUT = "Grabbo is a bookmarklet for Safari and Chrome. It shows the best-quality version of every image on a web page, largest first."
INSTALL = 'Drag the "Grabbo" link to your bookmarks bar. Open any web page and click it.'
SOURCE_URL = "https://github.com/rey/grabbo"

ROOT = pathlib.Path(__file__).resolve().parent


def fill(src: str, version: str) -> str:
    return src.replace("__VERSION__", version)


def minify(src: str) -> str:
    """Drop indentation, blank lines and whole-line comments. Line breaks stay, so no statement merges."""
    lines = (ln.strip() for ln in src.splitlines())
    return "".join(ln + "\n" for ln in lines if ln and not ln.startswith("//"))


def bookmarklet_href(src: str, version: str) -> str:
    code = minify(fill(src, version))

    def enc(m):
        return "".join(f"%{b:02X}" for b in m.group(0).encode("utf-8"))

    return "javascript:" + re.sub(r'[%#"<>\s]|[^\x00-\x7f]', enc, code)


def render_page(href: str, version: str) -> str:
    title = f"{NAME} {version}"
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>{STYLE}</style>
<body>
<h1>{html.escape(title)}</h1>
<p>{html.escape(ABOUT)}</p>
<h2>Install</h2>
<p>{html.escape(INSTALL, quote=False)}</p>
<p><a href="{html.escape(href)}">{html.escape(title)}</a></p>
<p><a href="{html.escape(SOURCE_URL)}">Grabbo on GitHub</a></p>
</body>
</html>
"""


def main() -> None:
    src = (ROOT / "grabbo.js").read_text(encoding="utf-8")
    href = bookmarklet_href(src, VERSION)
    (ROOT / OUTPUT).write_text(render_page(href, VERSION), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Bookmarklet length: {len(href)}")


if __name__ == "__main__":
    main()
