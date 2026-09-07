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

// Function: a narrow static server reproduces the deployed origin and emits the required public CORS policy.
function staticServer() {
    return createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, 'http://127.0.0.1');
            const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\/+/, '');
            if (relativePath.includes('..')) throw new Error('Invalid path');
            const extension = relativePath.slice(relativePath.lastIndexOf('.'));
            const body = await readFile(new URL(relativePath, ROOT));
            response.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
            });
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end('Not found');
        }
    });
}

// Function: each cycle verifies first/last page geometry and an independently opened Lightbox.
async function verifyCycle(browser, address, cycle) {
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
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`library-ui browser cycle ${cycle}: OK`);
}

const server = staticServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: SETTINGS.browserPath, headless: true });
try {
    for (let cycle = 1; cycle <= SETTINGS.cycles; cycle += 1) await verifyCycle(browser, address, cycle);
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}
