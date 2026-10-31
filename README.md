Scan companion.

Serving at https://chaya.shreevatsa.net/

PDF region annotation and snippet-viewing experiments are listed at
[bookchop/index.html](bookchop/index.html). Start with the fit-to-width annotator,
export its annotations as JSON, then open the snippet viewer with the same PDF
and JSON. The original `retry.html` exports a different, canvas-coordinate format
that the viewer does not accept.

The experiments are standalone HTML files, separate from the OCR app generated
by `make`. Serve the repository with `python3 -m http.server` and open
http://localhost:8000/bookchop/ to browse them. The prototype pages require an
internet connection for their CDN dependencies.
