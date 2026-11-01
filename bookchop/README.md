# Bookchop

The [application listing](index.html) provides two interfaces:

- [Mark and read](full/): imported from `bookchop` at `496aceb`, including its
  reactive-state refactor.
- [Marking workspace](markonly/): imported from `bookchop-markonly` at `dcb83ed`,
  which removes the reading view and placeholder editor.

Both branch histories are merged into `main`, with their files placed in these
subdirectories. Each application keeps its own dependencies, build configuration,
and tests. The original OCR application remains at the repository root.

Both Bookchop interfaces save ZIP-based `.chaya` packages containing
`manifest.json`, `document.pdf`, and `annotations.json`. They can exchange those
packages. The original OCR application uses a different JSON-based `.chaya`
format; the early `retry*.html` prototypes also use separate JSON formats.

## Build and serve

Run `make` from the repository root to build all three applications. This uses
Yarn 1 to install the locked dependencies for both Bookchop interfaces. Their
generated `dist/` directories and `node_modules/` are ignored by Git.

For one application, run `yarn --cwd bookchop/full install --frozen-lockfile`
and `yarn --cwd bookchop/full build`, substituting `markonly` as needed.

Serve the repository root with `python3 -m http.server 8000`, then visit
`http://localhost:8000/bookchop/`.

PDF.js and JSZip load from CDNs. AI annotation additionally requires the user's
Google Vision and Gemini API keys. Manual marking and package save/load do not
call those AI services.

## Verify integration

After `make`, run `yarn --cwd bookchop/full test:integration` to check navigation
from the OCR app, PDF region marking, reading, and saving/reopening a package
across the two interfaces. These browser tests use the included sample PDF and
do not call paid AI services.

Use `PLAYWRIGHT_CHANNEL=chrome` to run the integration tests with an installed
Google Chrome, or install the matching Playwright browser first.
