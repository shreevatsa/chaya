#!/usr/bin/env -S deno run --allow-read --allow-write

// A standalone script to inline the generated `main.js` in `ocr.htm` into `ocr.html`
// Could have been written in Python or any language; chose Deno for cross-platform
// reasons: https://matklad.github.io/2023/02/12/a-love-letter-to-deno.html
const jsCode = await Deno.readTextFile('main.js');
let htmlTemplate = await Deno.readTextFile('ocr.htm');
htmlTemplate = htmlTemplate.replace(
    `<script defer type="module" src="main.js"></script>`,
    `<script type="module">${jsCode}</script>`
);
await Deno.writeTextFile('ocr.html', htmlTemplate);
