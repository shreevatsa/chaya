# Suggestion:
#     ls main.ts ocr.htm | entr make
all:
	date
	npx esbuild main.ts --outfile=main.js --metafile=meta.json --bundle --format=esm --minify --sourcemap
	python3 build-inline.py
	date

snapshot: all
	echo "VERSION='2024.??'" "(Get from SCHEMA_VERSION in main.ts)"
	echo "git switch -c v${VERSION}"
	echo "git push --set-upstream origin "v${VERSION}"
	echo "git switch main"
	echo "Update schemaVersion default in main.ts"
	echo "Update versions/index.html and functions/versions/[version].js"
