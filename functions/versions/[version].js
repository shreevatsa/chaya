export async function onRequest(context) {
    try {
        const version = context.params.version;
        console.log(version);
        const versionMap = {
            'chaya-2024.01.html': 'v2024-01',
            'chaya-2024.02.html': 'v2024-02',
            'chaya-2024.03.html': 'v2024-03',
        };
        const subdomain = versionMap[version];
        if (subdomain) {
            const newUrl = `https://${subdomain}.scan-cobbler.pages.dev/index.html`;
            console.log(`Fetching from ${newUrl}`);
            return fetch(newUrl);
        }
        // Return 404 here
        const notFoundResponse = await fetch(new URL('/404.html', context.request.url).toString());
        const notFoundContent = await notFoundResponse.text();
        return new Response(notFoundContent, {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
        });
    } catch (error) {
        // https://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
        return new Response(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
}
