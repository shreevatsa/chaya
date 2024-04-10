# Build JS.
js-dev:
	npx esbuild main.ts --outfile=main.js --bundle --watch --format=esm

# Build JS for production.
js-prod:
	npx esbuild main.ts --outfile=main.js --bundle --minify --format=esm
