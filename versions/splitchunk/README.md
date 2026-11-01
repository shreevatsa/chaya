# Split chunk experiment

This is the OCR application from `splitchunk` at `88aa572`. Its branch history
is merged into `main`; the original `main.ts` and `ocr.htm` are preserved here,
with a navigation link and a notice explaining the unfinished behavior.

The split dialog previews horizontal and vertical divisions. Done displays the
chosen direction and percentage, then closes the dialog. It does not update the
ProseMirror document. This version uses the `2024.03` saved-file schema.

Run `make splitchunk` from the repository root. It uses the shared OCR
dependencies and `build-inline.py` to generate this directory's self-contained
`index.html`. Serve the repository root and visit `/versions/splitchunk/`.
