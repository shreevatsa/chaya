Scan companion.

Serving at https://chaya.shreevatsa.net/

`make` builds the original OCR application at `/`, the archived split-chunk
experiment, and both Bookchop interfaces. All snapshots and experiments are
listed at [versions/index.html](versions/index.html).

See [versions/README.md](versions/README.md) for the application paths, file
formats, build instructions, and browser checks. The former `/bookchop/` listing
and root-level prototypes have moved under `/versions/`.

After building, serve the repository with `python3 -m http.server` and open
http://localhost:8000/versions/. The Bookchop pages require an internet connection
for PDF.js, JSZip, and optional AI services.

The original OCR application before this integration is preserved on branch
`v2024.04`, alongside the earlier stable versions listed at `/versions/`.
