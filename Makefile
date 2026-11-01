# Suggestion:
#     ls main.ts ocr.htm | entr make
.PHONY: all ocr bookchop splitchunk snapshot

all: ocr bookchop splitchunk

ocr:
	date
	npx esbuild main.ts --outfile=main.js --metafile=meta.json --bundle --format=esm --minify --sourcemap
	python3 build-inline.py
	date

bookchop:
	yarn --cwd versions/bookchop install --frozen-lockfile --non-interactive
	yarn --cwd versions/bookchop build
	yarn --cwd versions/bookchop-markonly install --frozen-lockfile --non-interactive
	yarn --cwd versions/bookchop-markonly build

splitchunk:
	npx esbuild versions/splitchunk/main.ts --outfile=versions/splitchunk/main.js --metafile=versions/splitchunk/meta.json --bundle --format=esm --minify --sourcemap
	cd versions/splitchunk && python3 ../../build-inline.py

snapshot: ocr
	echo "VERSION='2024.??'" "(Get from SCHEMA_VERSION in main.ts)"
	echo "git switch -c v${VERSION}"
	echo "git push --set-upstream origin "v${VERSION}"
	echo "git switch main"
	echo "Update schemaVersion default in main.ts"
	echo "Update versions/index.html and functions/versions/[version].js"
