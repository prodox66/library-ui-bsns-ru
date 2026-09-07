import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const PATHS = Object.freeze({
    index: 'index.html',
    runtime: 'runtime-config.js',
    window: 'NewUI/Library_Window.js',
    json: 'NewUI/windows/library_window.json',
    bridge: 'NewUI/windows/library_window.data.js',
    resourceLibrary: 'assets/resource-library-v2.js',
    lightbox: 'assets/lightbox.js',
});

// Function: repository contracts are read from the same files delivered by the static host.
async function sources() {
    return Object.fromEntries(await Promise.all(Object.entries(PATHS).map(async ([key, path]) => [
        key,
        await readFile(new URL(path, ROOT), 'utf8'),
    ])));
}

// Function: the generated bridge must represent the JSON byte-for-byte at the data level.
function bridgeConfiguration(source) {
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox);
    return JSON.parse(JSON.stringify(sandbox.window.BZNLibraryWindowConfiguration));
}

const code = await sources();
const configuration = JSON.parse(code.json);
assert.deepEqual(bridgeConfiguration(code.bridge), configuration);
assert.equal(configuration.layout.columns * configuration.layout.rows, 30);
assert.match(code.runtime, /https:\/\/library-api\.bsns\.ru\//);
assert.match(code.runtime, /https:\/\/masks\.bsns\.ru\//);
assert.match(code.runtime, /https:\/\/images\.bsns\.ru\//);
assert.match(code.runtime, /https:\/\/templates\.bsns\.ru\//);
assert.doesNotMatch(code.runtime, /webgpu/i);
assert.ok(code.index.indexOf('runtime-config.js') < code.index.indexOf('assets/lightbox.js'));
assert.ok(code.index.indexOf('assets/lightbox.js') < code.index.indexOf('assets/resource-library-v2.js'));
assert.match(code.window, /window\[MODULE_KEY\]/);
assert.match(code.window, /jsonUrl\.origin === location\.origin/);
assert.match(code.window, /return loadBridgeConfiguration\(\)/);
assert.match(code.resourceLibrary, /window\.BZNResourceLibrary/);
assert.match(code.lightbox, /window\.BZNLightbox/);

// Branch: this repository is static and must not accidentally acquire a server handler.
const rootEntries = await readdir(ROOT, { recursive: true });
assert.equal(rootEntries.some((entry) => /\.php$/i.test(entry)), false);
console.log('library-ui contract: OK');
