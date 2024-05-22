# In 'ocr.htm', inline `main.js`, to produce `ocr.html`
js_code = open('main.js', 'r', encoding='utf-8').read()
css_code = open('main.css', 'r', encoding='utf-8').read()
html_template = open('ocr.htm', 'r', encoding='utf-8').read()
html_inlined = html_template.replace(
    r'<script defer type="module" src="main.js"></script>',
    f'<script type="module">{js_code}</script>',
)
html_inlined = html_inlined.replace(
    r'<link rel="stylesheet" type="text/css" href="main.css" />',
    f'<style>{css_code}</style>',
)
open('index.html', 'w', encoding='utf-8').write(html_inlined)
