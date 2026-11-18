# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.2.1] - 2026-11-18

### Fixed

* The "N versions" toggle no longer adds extra space around itself. The gap above it is now the same as the other gaps in a picture, and the gap below it is the same for every picture.
* The title in the page header and the "Copy page link" button now share a text baseline.

## [1.2.0] - 2026-11-17

### Added

* A picture that has other loaded files now shows an "N versions" toggle under its URL field and copy button. The toggle opens the other files under the picture, largest first, each with its own URL and copy button. The browser loads them only when you open the toggle.

### Changed

* The copy buttons keep their width while they show "Copied!", so the URL field next to them does not move.

## [1.1.0] - 2026-11-17

### Changed

* When a JPG or PNG and a WebP or AVIF have the same size, it now lists the JPG or PNG, because it works in more places. A larger WebP or AVIF still wins, and so does a WebP or AVIF that is the only choice.

## [1.0.0] - 2026-11-14

### Added

* A bookmarklet that opens a results page listing the best-quality version of every image on a page, largest first, with its dimensions, file name and full URL.
* Image discovery from `src`, `srcset` and `<picture>` sources, common lazy-load attributes, a link around an image that points to an image file, `og:image` and `twitter:image` tags, icons and CSS background images. Only `http`, `https`, `data` and `blob` addresses are kept.
* Real sizes: Grabbo loads each candidate, keeps the largest that loaded for each picture, and lists pictures that have only a declared size last, and leaves out pictures with no size. It stops waiting when no image has finished for 8 seconds.
* On the results page: the page title as a link back to the original page, a "Copy page link" button (HTML and plain text), and for each image a read-only URL field that selects on click and a "Copy image link" button.
* An install page, `index.html`, built from `grabbo.js` by `build.py`.
* Tests for the pure logic, the whole bookmarklet against a fake page, the results page and the build.
