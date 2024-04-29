# Suggestion:
#     ls main.ts ocr.htm | entr make
all:
	date
	npx esbuild main.ts --outfile=main.js --metafile=meta.json --bundle --format=esm --minify --sourcemap
	python3 build-inline.py
	date
