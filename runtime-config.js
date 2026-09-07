// Runtime configuration for the standalone library UI host.
(() => {
    'use strict';

    const CONFIGURATION_KEY = 'BZNLibraryRuntimeConfig';
    const ROOT_URL = new URL('./', document.baseURI).href;
    const API_ROOT_URL = 'https://library-api.bsns.ru/';
    const CONTENT_ROOTS = Object.freeze({
        masks: 'https://masks.bsns.ru/',
        images: 'https://images.bsns.ru/',
        templates: 'https://templates.bsns.ru/',
    });
    const INTERFACE_PATHS = Object.freeze({
        resourceLibraryScript: 'assets/resource-library-v2.js',
        resourceLibraryStylesheet: 'assets/resource-library.css',
        libraryWindowScript: 'NewUI/Library_Window.js',
        libraryWindowConfiguration: 'NewUI/windows/library_window.json',
        libraryWindowFileBridge: 'NewUI/windows/library_window.data.js',
        lightboxScript: 'assets/lightbox.js',
        lightboxStylesheet: 'assets/lightbox.css',
    });

    // Function: every standalone interface asset resolves from one host root.
    function resolveInterfaceUrl(path) {
        return new URL(path, ROOT_URL).href;
    }

    // Object: the host application may provide its own configuration before loading the library scripts.
    window[CONFIGURATION_KEY] = window[CONFIGURATION_KEY] || Object.freeze({
        baseUrls: Object.freeze({
            interface: ROOT_URL,
            api: API_ROOT_URL,
            content: CONTENT_ROOTS,
        }),
        interface: Object.freeze(Object.fromEntries(
            Object.entries(INTERFACE_PATHS).map(([key, path]) => [key, resolveInterfaceUrl(path)]),
        )),
        api: Object.freeze({
            resourceLibraryEndpoint: new URL('resource-library.php', API_ROOT_URL).href,
        }),
        content: CONTENT_ROOTS,
    });
})();
