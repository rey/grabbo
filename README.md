# Grabbo

## About

Grabbo is a bookmarklet for Safari and Chrome. It shows the best-quality version of every image on a web page, largest first.

## Install

Visit [https://rey.github.io/grabbo/](https://rey.github.io/grabbo/). Drag the "Grabbo" link to your bookmarks bar. Open any web page and click it.

## How it works

Click the bookmark on a page. Grabbo collects image URLs from the page:

* `src`, `srcset` and `<picture>` sources, and common lazy-load attributes (for example `data-src`).
* A link around an image, when the link points to an image file.
* `og:image` and `twitter:image` meta tags, icons and CSS background images.

Grabbo loads each URL to measure its real size. It stops waiting when no image has finished loading for 8 seconds. For each picture, it keeps the largest image that loaded. Size comes first. When two images have the same size, it prefers a JPG or PNG over a WebP or AVIF. If no size loads, it keeps the largest declared size and lists it after the others.

The results page opens in the same tab. Each image shows its dimensions, file name and URL, with a "Copy image link" button. The page title links back to the original page. "Copy page link" copies that link as HTML and as plain text.

### Limitations

* Grabbo finds only images that are in the page when you click. It does not find originals behind a script, such as a lightbox.
* It downloads every size it finds, so image-heavy pages use more data.
* It does not look inside frames, shadow DOM or inline SVG.
* A site with a strict Content Security Policy can block Grabbo, its results page or the copy buttons.
* A site can send WebP at a `.jpg` address, based on the browser's `Accept` header. Grabbo does not fix this. A Safari extension that edits that header (for example ChangeTheHeaders) can fix it.
* The results page is a temporary `blob:` page. A reload can fail. Use the title link to go back.

## Privacy

Grabbo sends no data to its author. The results page loads only the images from the page you ran it on. Image hosts see requests for their images.

## Development

1. Make a branch such as `feature/<description>` or `bug/<description>`.
2. Make the change test-first.
3. Bump `VERSION` in `build.py` and add a CHANGELOG entry.
4. Run `python3 build.py`, then both test suites: `node --test test/*.test.js` and `python3 -m unittest discover -s test`.
5. To try it in a browser, run `bash go.sh`. It serves the install page and `test/fixture.html` on `localhost:8000`.
6. Open a pull request.
