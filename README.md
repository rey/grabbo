# Grabbo

## About

Grabbo is a bookmarklet for Safari and Chrome. It shows the best-quality version of every image on a web page, largest first.

## Install

Open <https://rey.github.io/grabbo/>. Drag the "Grabbo" link to your bookmarks bar. Open any web page and click it.

## How it works

Click the bookmark on a page. Grabbo collects image URLs from the page:

* `src`, `srcset` and `<picture>` sources, and common lazy-load attributes (for example `data-src`).
* A link around an image, when the link points to an image file.
* `og:image` and `twitter:image` meta tags, icons and CSS background images.

Grabbo loads each URL to measure its real size. It stops waiting when no image has finished loading for 8 seconds. For each picture, it keeps the largest image that loaded. If no size loads, it keeps the largest declared size and lists it after the others.

The results page opens in the same tab. Each image shows its dimensions, file name and URL, with a "Copy image link" button. The page title links back to the original page. "Copy page link" copies that link as HTML and as plain text.

### Limitations

* Grabbo finds only images that are in the page when you click. It does not find originals behind a script, such as a lightbox.
* It downloads every size it finds, so image-heavy pages use more data.
* It does not look inside frames, shadow DOM or inline SVG.
* A site with a strict Content Security Policy can block Grabbo, its results page or the copy buttons.
* The results page is a temporary `blob:` page. A reload can fail. Use the title link to go back.

## Privacy

Grabbo sends no data to its author. The results page loads only the images from the page you ran it on. Image hosts see requests for their images.
