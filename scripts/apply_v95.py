#!/usr/bin/env python3
"""v9.5 Campus theme applier — swaps style block, font, cache buster, strips h2 emojis."""
import re, sys

BASE = '/home/z/my-project/glbitm-attendance-system'
html_path = f'{BASE}/public/index.html'
appjs_path = f'{BASE}/public/app.js'
css_path = f'{BASE}/scripts/v95.css'

html = open(html_path, encoding='utf-8').read()
css = open(css_path, encoding='utf-8').read().strip()

# 1) Replace the entire <style> block
new_html, n = re.subn(r'<style>.*?</style>', '<style>\n' + css.replace('\\', '\\\\') + '\n</style>', html, count=1, flags=re.S)
assert n == 1, f'style block swap failed (n={n})'
html = new_html

# 2) Font: Inter -> Plus Jakarta Sans
old_font = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
new_font = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
assert old_font in html, 'old font link not found'
html = html.replace(old_font, new_font)

# 3) Cache buster v93 -> v94
assert 'app.js?v=93' in html, 'cache buster v93 not found'
html = html.replace('app.js?v=93', 'app.js?v=94')

open(html_path, 'w', encoding='utf-8').write(html)
print(f'[ok] index.html: style swapped ({len(css)} chars), font -> Plus Jakarta Sans, buster -> v94')

# 4) app.js: strip leading emojis from <h2> headings
js = open(appjs_path, encoding='utf-8').read()
# remove any leading run of emoji/pictographic chars (+ variation selectors / ZWJ) and following spaces after <h2>
pat = re.compile(r'<h2>[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3\U0001F1E6-\U0001F1FF]+ ?')
js2, cnt = pat.subn('<h2>', js)
open(appjs_path, 'w', encoding='utf-8').write(js2)
print(f'[ok] app.js: stripped emojis from {cnt} <h2> headings')
