# Suggestion:
#     ls main.ts ocr.htm | entr make
# Build JS. Add --minify if desired.
js:
	npx esbuild main.ts --outfile=main.js --bundle --format=esm --sourcemap
	python3 build-inline.py
