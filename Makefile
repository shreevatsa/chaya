# Suggestion:
#     ls main.ts ocr.htm | entr make
all:
	date
	npx esbuild main.ts --outfile=main.js --metafile=meta.json --bundle --format=esm --minify --sourcemap
	python3 build-inline.py
	date

snapshot: all
	echo "VERSION='2024.??'"
	echo 'cp index.html versions/chaya-${VERSION}.html'
	echo 'Update schemaVersion default in main.ts'
