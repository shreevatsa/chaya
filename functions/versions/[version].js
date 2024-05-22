export function onRequest(context) {
    try {
        const version = context.params.version;
        console.log(version);
        const versionMap = {
            'chaya-2024.01.html': 'v2024-01',
            'chaya-2024.02.html': 'v2024-02',
        };
        const subdomain = versionMap[version];
        if (subdomain) {
            const newUrl = `https://${subdomain}.scan-cobbler.pages.dev/index.html`;
            console.log(`Fetching from ${newUrl}`);
            return fetch(newUrl);
        }
    } catch (error) {
        // https://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
        return new Response(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
}
