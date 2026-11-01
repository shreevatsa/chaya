Scan companion.

Serving at https://chaya.shreevatsa.net/

`make` builds the original OCR application at `/` and both Bookchop applications
listed at [bookchop/index.html](bookchop/index.html):

- `/bookchop/full/`: region marking and a reading view, from the `bookchop` branch.
- `/bookchop/markonly/`: a single marking workspace, from `bookchop-markonly`.

See [bookchop/README.md](bookchop/README.md) for development details. The same
listing retains the early standalone `retry*.html` prototypes at their original
paths.

After building, serve the repository with `python3 -m http.server` and open
http://localhost:8000/bookchop/. The Bookchop pages require an internet connection
for PDF.js, JSZip, and optional AI services.

The original OCR application before this integration is preserved on branch
`v2024.04`, alongside the earlier stable versions listed at `/versions/`.
