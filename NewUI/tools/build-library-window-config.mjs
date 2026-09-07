// Build-only bridge: library_window.json is the sole editable source; file: pages cannot fetch JSON in Chromium.
import { readFile, writeFile } from 'node:fs/promises';
const SOURCE = new URL('../windows/library_window.json', import.meta.url);
const TARGET = new URL('../windows/library_window.data.js', import.meta.url);
const GLOBAL_KEY = 'BZNLibraryWindowConfiguration';
const header = '// GENERATED from library_window.json; edit JSON and run NewUI/tools/build-library-window-config.mjs.\n';
const configuration = JSON.parse(await readFile(SOURCE, 'utf8'));
await writeFile(TARGET, `${header}window.${GLOBAL_KEY} = ${JSON.stringify(configuration, null, 2)};\n`, 'utf8');
console.log('Library window file-mode configuration generated from the canonical JSON.');
