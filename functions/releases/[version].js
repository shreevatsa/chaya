export function onRequest(context) {
    const version = context.params.version;
    console.log(version);
    const versionMap = {
        'chaya-2024.01.html': 'v2024.01',
    };
    const subdomain = versionMap[version];
    if (subdomain) {
        const newUrl = `https://${subdomain}.scan-cobbler.pages.dev`;
        return fetch(newUrl);
    }
}
