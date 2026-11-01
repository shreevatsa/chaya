# Versions and experiments

[index.html](index.html) is the central application catalog:

- `/`: the current OCR editor.
- `/versions/chaya-2024.01.html` through `chaya-2024.04.html`: stable snapshots,
  fetched from their branch deployments by `functions/versions/[version].js`.
- [splitchunk/](splitchunk/): the unfinished chunk-splitting experiment from
  `88aa572`. Its history is merged into `main`, and its source is archived here.
- [bookchop/](bookchop/): Mark and Read, imported from `496aceb`, including the
  reactive-state refactor and subsequent reading-view fixes.
- [bookchop-markonly/](bookchop-markonly/): the marking-only interface from
  `dcb83ed`.
- [prototypes/](prototypes/): the early standalone `retry*.html` experiments.

All three experimental branch histories are included in `main`. Their archived
applications are built from the files in this directory. The earlier
`/bookchop/` URLs and root-level `retry*.html` URLs have been retired.

The OCR editor and split experiment use versioned JSON `.chaya` formats. Both
Bookchop interfaces use ZIP `.chaya` packages containing `manifest.json`,
`document.pdf`, and `annotations.json`, and can exchange those packages. The
early prototypes have their own annotation JSON formats.

## Build and serve

Run `make` from the repository root to build all four applications. The OCR
editor and split experiment share the root dependencies and `build-inline.py`.
Yarn 1 installs the locked dependencies for both Bookchop interfaces. Generated
application bundles and dependency directories are ignored by Git.

For one Bookchop interface, run `yarn --cwd versions/bookchop install --frozen-lockfile`
and `yarn --cwd versions/bookchop build`, substituting `bookchop-markonly` as needed.
Run `make splitchunk` to build only the split experiment.

Serve the repository root with `python3 -m http.server 8000`, then visit
`http://localhost:8000/versions/`. Snapshot URLs require the Cloudflare Pages
function; the catalog and experimental applications work on a plain static server.
`_routes.json` limits function execution to `/versions/chaya-*`, allowing the
experimental applications and their assets to be served directly.

PDF.js and JSZip load from CDNs in Bookchop. AI annotation additionally requires
the user's Google Vision and Gemini API keys. Manual marking and package
save/load do not call those AI services.

## Verify integration

After `make`, run `yarn --cwd versions/bookchop test:integration`. Browser checks
cover catalog navigation, the split preview, PDF marking and reading, and
exchanging packages between both Bookchop interfaces. They use the sample PDF
and do not call paid AI services.

Use `PLAYWRIGHT_CHANNEL=chrome` to run the integration tests with an installed
Google Chrome, or install the matching Playwright browser first.
