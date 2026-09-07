import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = new URL('../', import.meta.url);
const SETTINGS = Object.freeze({
    cycles: 3,
    expectedFirstPage: 30,
    expectedLastPage: 4,
    browserPath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const MIME_TYPES = Object.freeze({ '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' });

// Function: a narrow static server can reproduce hosts both with and without a public CORS policy.
function staticServer({ cors = true } = {}) {
    return createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, 'http://127.0.0.1');
            const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\/+/, '');
            if (relativePath.includes('..')) throw new Error('Invalid path');
            const extension = relativePath.slice(relativePath.lastIndexOf('.'));
            const body = await readFile(new URL(relativePath, ROOT));
            const headers = { 'Content-Type': MIME_TYPES[extension] || 'application/octet-stream' };
            if (cors) headers['Access-Control-Allow-Origin'] = '*';
            response.writeHead(200, headers);
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end('Not found');
        }
    });
}

// Function: a separate application origin imports only the public scripts and explicit interface URLs.
function applicationServer(assetAddress) {
    const interfacePaths = Object.freeze({
        resourceLibraryStylesheet: 'assets/resource-library.css',
        libraryWindowScript: 'NewUI/Library_Window.js',
        libraryWindowConfiguration: 'NewUI/windows/library_window.json',
        libraryWindowFileBridge: 'NewUI/windows/library_window.data.js',
        lightboxStylesheet: 'assets/lightbox.css',
    });
    const resolvedInterface = Object.fromEntries(Object.entries(interfacePaths)
        .map(([key, path]) => [key, new URL(path, assetAddress).href]));
    const configuration = JSON.stringify({ interface: resolvedInterface, api: {}, content: {} });
    const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${assetAddress}demo.css"></head>
        <body><main class="demo-panel"><button id="openLibrary">Open</button><button id="openLightbox">Lightbox</button></main>
        <script>window.BZNLibraryRuntimeConfig=${configuration};</script>
        <script src="${assetAddress}assets/lightbox.js"></script><script src="${assetAddress}assets/resource-library-v2.js"></script>
        <script src="${assetAddress}demo.js"></script></body></html>`;
    return createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(page);
    });
}

// Function: each cycle verifies first/last page geometry and an independently opened Lightbox.
async function verifyCycle(browser, address, cycle, { crossOrigin = false } = {}) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(address, { waitUntil: 'networkidle' });
    await page.locator('#openLibrary').click();
    const grid = page.locator('#bznResourceLibraryGrid');
    await grid.locator('.bzn-resource-library-item').first().waitFor();
    assert.equal(await grid.locator('.bzn-resource-library-item').count(), SETTINGS.expectedFirstPage);
    const firstGeometry = await page.locator('.bzn-resource-library-window').boundingBox();
    await grid.locator('.bzn-resource-library-item').first().click();
    await page.locator('#bznLightbox:not([hidden])').waitFor();
    assert.equal(await page.locator('#bznLightboxStage img').count(), 1);
    await page.locator('#bznLightboxClose').click();
    await page.locator('#bznResourceLibraryNext').click();
    await page.locator('#bznResourceLibraryPage').filter({ hasText: '2 / 2' }).waitFor();
    assert.equal(await grid.locator('.bzn-resource-library-item').count(), SETTINGS.expectedLastPage);
    const lastGeometry = await page.locator('.bzn-resource-library-window').boundingBox();
    assert.deepEqual(lastGeometry, firstGeometry);
    if (crossOrigin) {
        const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
        assert.equal(resources.some((url) => url.includes('library_window.data.js')), true);
        assert.equal(resources.some((url) => url.includes('library_window.json')), false);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`library-ui browser cycle ${cycle}: OK`);
}

const sameOriginServer = staticServer();
const assetServer = staticServer({ cors: false });
await new Promise((resolve) => sameOriginServer.listen(0, '127.0.0.1', resolve));
await new Promise((resolve) => assetServer.listen(0, '127.0.0.1', resolve));
const sameOriginAddress = `http://127.0.0.1:${sameOriginServer.address().port}/`;
const assetAddress = `http://127.0.0.1:${assetServer.address().port}/`;
const hostServer = applicationServer(assetAddress);
await new Promise((resolve) => hostServer.listen(0, '127.0.0.1', resolve));
const hostAddress = `http://127.0.0.1:${hostServer.address().port}/`;
const browser = await chromium.launch({ executablePath: SETTINGS.browserPath, headless: true });
try {
    for (let cycle = 1; cycle <= SETTINGS.cycles; cycle += 1) await verifyCycle(browser, sameOriginAddress, cycle);
    for (let cycle = 1; cycle <= SETTINGS.cycles; cycle += 1) {
        await verifyCycle(browser, hostAddress, `cross-origin ${cycle}`, { crossOrigin: true });
    }
} finally {
    await browser.close();
    await Promise.all([sameOriginServer, assetServer, hostServer]
        .map((server) => new Promise((resolve) => server.close(resolve))));
}
