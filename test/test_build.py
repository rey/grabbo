import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import build  # noqa: E402

SRC = (pathlib.Path(build.__file__).parent / "grabbo.js").read_text()


class BookmarkletHref(unittest.TestCase):
    def test_href_shape(self):
        href = build.bookmarklet_href(SRC, "9.9.9")
        self.assertTrue(href.startswith("javascript:"))
        decoded = urllib.parse.unquote(href[len("javascript:"):])
        self.assertIn("9.9.9", decoded)
        self.assertNotIn("__VERSION__", decoded)
        self.assertEqual(decoded, build.minify(build.fill(SRC, "9.9.9")))

    def test_only_needed_characters_encoded(self):
        href = build.bookmarklet_href('a "b" #c <d> é\n%41', "1.0.0")
        body = href[len("javascript:"):]
        for bad in ('"', "#", "<", ">", " ", "\n", "é"):
            self.assertNotIn(bad, body)
        self.assertEqual(urllib.parse.unquote(body), 'a "b" #c <d> é\n%41\n')


class Minify(unittest.TestCase):
    def test_drops_indentation_blank_lines_and_comment_lines(self):
        self.assertEqual(build.minify("a {\n    // note\n\n    b;\n}\n"), "a {\nb;\n}\n")

    def test_result_is_still_valid_javascript(self):
        mini = build.minify(build.fill(SRC, "1.0.0"))
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / "m.js"
            f.write_text(mini)
            subprocess.run(["node", "--check", str(f)], check=True)


class InstallPage(unittest.TestCase):
    def page(self):
        return build.render_page(build.bookmarklet_href(SRC, build.VERSION), build.VERSION)

    def test_all_text_is_1rem(self):
        sizes = re.findall(r"font-size:[^;}]*", self.page())
        self.assertTrue(sizes)
        self.assertEqual(set(sizes), {"font-size:1rem"})

    def test_shares_the_base_rules_of_the_results_page(self):
        css = re.search(r"<style>(.*?)</style>", self.page(), re.S).group(1)
        for rule in build.SHARED_RULES:
            self.assertIn(rule, SRC, "the results page has the rule")
            self.assertIn(rule, css, "the install page has the rule")
        for rule in build.PAGE_RULES:
            self.assertIn(rule, css)
        self.assertNotIn("style=", re.search(r"<body[^>]*>", self.page()).group(0))

    def test_sections_follow_the_readme(self):
        page = self.page()
        readme = (pathlib.Path(build.__file__).parent / "README.md").read_text()
        self.assertIn(build.ABOUT, readme)
        self.assertIn(build.INSTALL, readme)
        self.assertIn(build.INSTALL, page)
        self.assertLess(page.index(build.ABOUT), page.index("<h2>Install</h2>"))
        self.assertLess(page.index("<h2>Install</h2>"), page.index("javascript:"))

    def test_page_has_a_language(self):
        self.assertIn('<html lang="en">', self.page())

    def test_source_link_says_grabbo_on_github(self):
        self.assertIn(f'<a href="{build.SOURCE_URL}">Grabbo on GitHub</a>', self.page())


class Generated(unittest.TestCase):
    def test_committed_index_html_is_current(self):
        root = pathlib.Path(build.__file__).parent
        want = build.render_page(build.bookmarklet_href(SRC, build.VERSION), build.VERSION)
        self.assertEqual((root / "index.html").read_text(encoding="utf-8"), want, "run python3 build.py")


class Versioning(unittest.TestCase):
    def test_top_changelog_entry_is_the_build_version(self):
        changelog = (pathlib.Path(build.__file__).parent / "CHANGELOG.md").read_text()
        m = re.search(r"^## \[(\d+\.\d+\.\d+)\]", changelog, re.M)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), build.VERSION)


if __name__ == "__main__":
    unittest.main()
