# In 'ocr.htm', inline `main.js`, to produce `ocr.html`
js_code = open('main.js', 'r', encoding='utf-8').read()
html_template = open('ocr.htm', 'r', encoding='utf-8').read()
html_inlined = html_template.replace(
    r'<script defer type="module" src="main.js"></script>',
    f'<script type="module">{js_code}</script>',
)
open('index.html', 'w', encoding='utf-8').write(html_inlined)
