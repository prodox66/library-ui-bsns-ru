// BZN-CHECKPOINT-BIG-UI-Controls-Gallery-2026-09-07-09-55: Complete UI controls, text/image geometry, library sources and regression checks.
// BZN-FILE-PURPOSE-20260829: assets/resource-library-v2.js — загружает вторую версию библиотеки ресурсов.
// BZN-CHECKPOINT-NEWUI-PRE-STABLE-BIG-20260829: NewUI pre-stable online-test checkpoint; object controls, project storage, masks, and icon rendering stay linked.
// BZN-CHECKPOINT-CANVAS-COMMIT-ASSET-VERSION-20260829: The lazy resource-library stylesheet inherits the active Canvas build query.
(() => {
    'use strict';

    // BZN AI Design — BETA 2.0 CHECKPOINT — 2026-08-16. Keep together with tag Beta-2.0.
    // Universal resource picker. It knows logical library keys and MIME filters only;
    // physical directories stay server-side in resource-library.config.php.
    const scriptUrl = new URL(document.currentScript?.src || location.href, location.href);
    const assetDirectory = new URL('./', scriptUrl);
    const projectRoot = new URL('../', assetDirectory);
    const LIBRARY_RUNTIME_CONFIG_KEY = 'BZNLibraryRuntimeConfig';
    const libraryRuntimeConfig = window[LIBRARY_RUNTIME_CONFIG_KEY] || {};
    const runtimeQueryEntries = Object.freeze(
        Array.from(scriptUrl.searchParams.entries(), (entry) => Object.freeze(entry)),
    );
    const DEFAULT_ENDPOINT = libraryRuntimeConfig.api?.resourceLibraryEndpoint || new URL('resource-library.php', projectRoot).href;
    const DEFAULT_STYLESHEET_URL = libraryRuntimeConfig.interface?.resourceLibraryStylesheet || new URL('resource-library.css', assetDirectory).href;
    const LIBRARY_WINDOW_KEY = 'BZNNewUILibraryWindow';
    const LIBRARY_WINDOW_URL = libraryRuntimeConfig.interface?.libraryWindowScript || new URL('../NewUI/Library_Window.js', assetDirectory).href;
    const MODAL_LOCK_GLOBAL_KEY = 'BZNNewCanvasModalLock';

    // Function: a lazily requested presentation asset stays on the same commit as its owning script.
    function versionedAssetUrl(path) {
        const assetUrl = new URL(path, assetDirectory);
        runtimeQueryEntries.forEach(([key, value]) => assetUrl.searchParams.set(key, value));
        return assetUrl.href;
    }

    const state = {
        active: null,
        page: 1,
        pages: 1,
        total: 0,
        seed: '',
        requestId: 0,
        loading: false,
        openRequestId: 0,
        view: null,
        sources: null,
        previewInvocation: null,
    };
    let windowPromise = null;

    function isLoopbackHost(hostname) {
        const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
        return host === 'localhost' || host === '::1' || host.startsWith('127.');
    }

    function environment() {
        if (location.protocol === 'file:') return 'file';
        if (!/^https?:$/.test(location.protocol)) return 'unsupported';

        const config = window.BZNResourceLibraryConfig || {};
        const ports = Array.isArray(config.comfyPorts) ? config.comfyPorts.map(String) : ['8188'];
        const configuredMarkers = config.comfyPathMarkers || config.comfyPathSuffixes;
        const markers = Array.isArray(configuredMarkers)
            ? configuredMarkers.map((value) => String(value || '').toLowerCase()).filter(Boolean)
            : ['/bzn_ai-nodes/', '/extensions/', '/bzn_design/'];
        const path = String(location.pathname || '').toLowerCase();
        const local = isLoopbackHost(location.hostname);
        const comfyRoute = ports.includes(String(location.port)) || markers.some((marker) => path.includes(marker));

        return local && comfyRoute ? 'comfy' : 'server';
    }

    function loadStyles() {
        if (document.getElementById('bznResourceLibraryStyles')) return;
        const link = document.createElement('link');
        link.id = 'bznResourceLibraryStyles';
        link.rel = 'stylesheet';
        link.href = versionedAssetUrl(window.BZNResourceLibraryConfig?.stylesheet || DEFAULT_STYLESHEET_URL);
        document.head.appendChild(link);
    }

    function randomSeed() {
        if (globalThis.crypto?.getRandomValues) {
            const values = new Uint32Array(4);
            globalThis.crypto.getRandomValues(values);
            return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
        }
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    }

    // Function: all callers mount the same reusable Window primitive; data and callbacks remain in this service.
    async function createModal() {
        if (!windowPromise) windowPromise = (async () => {
            if (!window[LIBRARY_WINDOW_KEY]) await new Promise((resolve, reject) => {
                const script = document.createElement('script'); script.src = versionedAssetUrl(LIBRARY_WINDOW_URL);
                script.onload = () => { script.remove(); resolve(); };
                script.onerror = () => { script.remove(); reject(new Error('Library window is unavailable')); };
                document.head.appendChild(script);
            });
            state.view = await window[LIBRARY_WINDOW_KEY].create({ close, refresh, navigate, tab: activateTab });
            return state.view;
        })().catch(error => { windowPromise = null; throw error; });
        return windowPromise;
    }

    function textOption(name, fallback) {
        const value = state.active?.labels?.[name];
        return typeof value === 'string' && value.trim() ? value : state.view?.settings.labels[name] || fallback;
    }

    function renderStaticLabels() {
        const title = document.getElementById('bznResourceLibraryTitle');
        if (title) title.textContent = textOption('title', 'Library');
        state.view.label('bznResourceLibraryClose', '×', textOption('close', 'Close'));
        state.view.label('bznResourceLibraryRefresh', textOption('refresh', 'Обновить'));
        state.view.label('bznResourceLibraryPrev', textOption('previous', 'Previous'));
        state.view.label('bznResourceLibraryNext', textOption('next', 'Next'));
    }

    function syncPaginationControls() {
        const refreshButton = document.getElementById('bznResourceLibraryRefresh');
        const previousButton = document.getElementById('bznResourceLibraryPrev');
        const nextButton = document.getElementById('bznResourceLibraryNext');
        if (refreshButton) refreshButton.disabled = state.loading;
        if (previousButton) previousButton.disabled = state.loading || state.page <= 1;
        if (nextButton) nextButton.disabled = state.loading || state.page >= state.pages;
    }

    function navigate(delta) {
        if (!state.active || state.loading) return;
        const step = delta < 0 ? -1 : 1;
        const targetPage = Math.max(1, Math.min(state.pages, state.page + step));
        if (targetPage === state.page) return;
        void loadPage(targetPage);
    }

    function close() {
        // Branch: release the nested preview before the gallery's own modal lock.
        closeOwnedPreview();
        const modal = document.getElementById('bznResourceLibraryModal');
        if (modal) {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
        }
        // Branch: a nested picker returns interaction ownership to the editor that opened it.
        if (state.active?.modalLock) window[MODAL_LOCK_GLOBAL_KEY]?.release?.(modal);
        state.requestId += 1;
        state.openRequestId += 1;
        state.active = null;
        state.sources = null;
        state.loading = false;
    }

    // Function: a replacement caller cannot leave this gallery's obsolete preview above its new content.
    function closeOwnedPreview() {
        if (!state.previewInvocation) return;
        window.BZNLightbox?.close?.(); state.previewInvocation = null;
    }

    function endpointUrl() {
        return window.BZNResourceLibraryConfig?.endpoint || DEFAULT_ENDPOINT;
    }

    function acceptsItem(item) {
        const accept = state.active?.accept;
        if (!Array.isArray(accept) || !accept.length) return true;
        const extension = String(item.extension || '').toLowerCase();
        const mime = String(item.mime || '').toLowerCase();
        return accept.some((rule) => {
            const normalized = String(rule || '').trim().toLowerCase();
            if (!normalized) return false;
            if (normalized.startsWith('.')) return extension === normalized.slice(1);
            if (normalized.endsWith('/*')) return mime.startsWith(normalized.slice(0, -1));
            return mime === normalized || extension === normalized;
        });
    }

    function previewForItem(item) {
        const preview = document.createElement('div');
        preview.className = 'bzn-resource-library-preview';
        if (item.preview === 'image' || /^(jpg|jpeg|png|webp|gif|avif|svg)$/i.test(String(item.extension || ''))) {
            const image = document.createElement('img');
            image.loading = 'lazy';
            image.decoding = 'async';
            image.alt = item.name || '';
            image.src = item.thumbnail_url || item.url;
            preview.appendChild(image);
            return preview;
        }
        const icon = document.createElement('span');
        icon.className = 'bzn-resource-library-file-icon';
        icon.textContent = String(item.extension || 'FILE').slice(0, 5);
        preview.appendChild(icon);
        return preview;
    }

    async function useItem(item, invocation = state.active) {
        if (!invocation || invocation !== state.active) return false;
        const onSelect = invocation.onSelect;

        // "Use" is a modal-confirm action: both modal layers close immediately,
        // before a potentially slow full-size resource download begins.
        close();

        if (typeof onSelect !== 'function') return false;
        try {
            return await onSelect(item, invocation.invocation) !== false;
        } catch (error) {
            console.error('BZN resource apply failed:', error);
            return false;
        }
    }

    function openItemPreview(item) {
        const invocation = state.active;
        if (!window.BZNLightbox || !item?.url) {
            void useItem(item, invocation);
            return;
        }
        state.previewInvocation = invocation;
        window.BZNLightbox.open({
            contentType: state.view.activeContentType,
            src: item.url,
            alt: item.name || '',
            title: item.name || textOption('title', 'Preview'),
            useLabel: textOption('use', 'Использовать'),
            closeLabel: textOption('previewClose', textOption('close', 'Закрыть')),
            fitLabel: textOption('fit', 'Вписать'),
            actualSizeLabel: textOption('actualSize', '100%'),
            onUse: () => useItem(item, invocation),
        });
    }

    function renderItems(payload) {
        const grid = document.getElementById('bznResourceLibraryGrid');
        if (!grid) return;
        grid.classList.remove('is-loading', 'is-message');
        grid.textContent = '';

        const items = (Array.isArray(payload.items) ? payload.items : []).filter(acceptsItem).slice(0, state.view.pageSize);
        if (!items.length) {
            grid.classList.add('is-message');
            grid.textContent = textOption('empty', 'No files');
        } else {
            items.forEach((item) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'bzn-resource-library-item';
                button.title = item.name || '';
                const caption = document.createElement('span');
                caption.className = 'bzn-resource-library-caption';
                caption.textContent = item.name || '';
                button.append(previewForItem(item), caption);
                button.addEventListener('click', () => openItemPreview(item));
                grid.appendChild(button);
            });
        }

        state.page = Math.max(1, Number(payload.page) || 1);
        state.pages = Math.max(1, Number(payload.pages) || 1);
        state.total = Math.max(0, Number(payload.total) || 0);
        const pageLabel = document.getElementById('bznResourceLibraryPage');
        if (pageLabel) pageLabel.textContent = `${state.page} / ${state.pages} · ${state.total}`;
    }

    async function loadPage(page) {
        if (!state.active || state.loading) return;
        const requestedPage = Math.max(1, Math.min(state.pages, Number(page) || 1));
        const requestId = ++state.requestId;
        const grid = document.getElementById('bznResourceLibraryGrid');
        state.loading = true;
        syncPaginationControls();
        if (grid) {
            grid.classList.remove('is-message');
            grid.classList.add('is-loading');
            grid.textContent = textOption('loading', 'Loading…');
        }

        try {
            let payload = null;
            if (typeof state.active.provider === 'function') {
                // Branch: static UI libraries supply their own paged JS data without a server endpoint.
                payload = await state.active.provider(Object.freeze({ page: requestedPage, pageSize: state.active.pageSize,
                    callerId: state.active.invocation.callerId, contentType: state.active.invocation.contentType,
                    callerContext: state.active.invocation.context, tabId: state.view.activeTab }));
            } else {
                const url = new URL(endpointUrl(), location.href);
                url.searchParams.set('library', state.active.library);
                url.searchParams.set('page', String(requestedPage));
                url.searchParams.set('page_size', String(state.active.pageSize));
                if (state.active.shuffle) url.searchParams.set('seed', state.seed);
                // Unique URL + no-store guarantees a fresh server-side DirectoryIterator scan.
                url.searchParams.set('_scan', String(Date.now()));
                const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                payload = await response.json();
            }
            if (!payload?.ok) throw new Error(payload?.error || 'Invalid library response');
            if (requestId !== state.requestId || !state.active) return;
            if (payload.seed) state.seed = String(payload.seed);
            renderItems(payload);
        } catch (error) {
            if (requestId !== state.requestId || !state.active || !grid) return;
            grid.classList.remove('is-loading');
            grid.classList.add('is-message');
            grid.textContent = `${textOption('error', 'Library error')}: ${error.message || error}`;
        } finally {
            if (requestId === state.requestId && state.active) {
                state.loading = false;
                syncPaginationControls();
            }
        }
    }

    async function refresh() {
        if (!state.active || state.loading) return;
        // Server endpoint scans the physical folder on every request; no JSON index is required.
        state.page = 1;
        state.pages = 1;
        state.total = 0;
        state.seed = state.active.shuffle ? randomSeed() : '';
        await loadPage(1);
    }

    // Function: every compatible source inherits the original caller's defaults, never another tab's callback or labels.
    function captureSources(options, primary) {
        const sources = new Map();
        for (const [tabId, source] of Object.entries(options.sources || {})) {
            if (!source || primary.invocation.policy[tabId] !== 'enabled') continue;
            const library = String(source.library || primary.library).trim();
            const provider = typeof source.provider === 'function' ? source.provider : null;
            if (!/^[a-z0-9_-]+$/i.test(library) || (!provider && environment() !== 'server')) continue;
            sources.set(tabId, Object.freeze({ ...primary, library, provider,
                accept: Array.isArray(source.accept) ? [...source.accept] : primary.accept,
                shuffle: source.shuffle === undefined ? primary.shuffle : Boolean(source.shuffle),
                onSelect: typeof source.onSelect === 'function' ? source.onSelect : primary.onSelect,
                labels: Object.freeze({ ...primary.labels, ...source.labels }) }));
        }
        sources.set(primary.invocation.activeTab, primary);
        return sources;
    }

    // Function: a fresh invocation captures its original destination before any source starts loading.
    async function open(options = {}) {
        const openRequestId = ++state.openRequestId;
        const provider = typeof options.provider === 'function' ? options.provider : null;
        if (!provider && environment() !== 'server') {
            throw new Error(options.environmentError || 'Server library is available only in server mode.');
        }
        const library = String(options.library || '').trim();
        if (!/^[a-z0-9_-]+$/i.test(library)) throw new Error('Invalid library key.');

        loadStyles();
        const view = await createModal();
        if (openRequestId !== state.openRequestId) return false;
        const invocation = view.resolve(options);
        const primary = Object.freeze({
            library,
            accept: Array.isArray(options.accept) ? [...options.accept] : [],
            shuffle: Boolean(options.shuffle),
            pageSize: view.pageSize,
            labels: Object.freeze({ ...options.labels }),
            onSelect: typeof options.onSelect === 'function' ? options.onSelect : null,
            provider,
            modalLock: Boolean(options.modalLock),
            invocation,
        });
        const modal = view.element;
        closeOwnedPreview();
        // Branch: replacing a locked caller with an unlocked caller releases only this window's prior lock.
        if (state.active?.modalLock && !primary.modalLock) window[MODAL_LOCK_GLOBAL_KEY]?.release?.(modal);
        state.sources = captureSources(options, primary);
        view.configure(invocation, state.sources.keys());
        state.requestId += 1;
        state.active = primary;
        state.page = 1;
        state.pages = 1;
        state.total = 0;
        state.seed = state.active.shuffle ? randomSeed() : '';
        state.loading = false;
        renderStaticLabels();
        syncPaginationControls();
        // Presentation: refresh the logical library on every opening so shared thumbnails cannot retain a previous library's theme.
        modal.dataset.resourceLibrary = library;
        // Branch: nested galleries become the active modal without losing the caller's lock state.
        if (state.active.modalLock) window[MODAL_LOCK_GLOBAL_KEY]?.acquire?.(modal);
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        await loadPage(1);
    }

    // Function: tab changes keep the captured caller and invalidate pending responses from the previous source.
    async function activateTab(tabId) {
        const source = state.sources?.get(tabId);
        if (!source || !state.active) return false;
        state.requestId += 1; state.loading = false;
        // Each activation gets an identity so a preview from a previously visited tab cannot apply later.
        state.active = Object.freeze({ ...source });
        state.page = 1; state.pages = 1; state.total = 0;
        state.seed = state.active.shuffle ? randomSeed() : '';
        state.view.element.dataset.resourceLibrary = state.active.library;
        renderStaticLabels(); await loadPage(1); return true;
    }

    // Function: every server-backed resource consumer receives one Blob through the shared loading boundary.
    async function fetchBlob(item) {
        if (!item?.url) throw new Error('Resource URL is missing.');
        const resourceUrl = new URL(item.url, document.baseURI);
        const response = await fetch(resourceUrl.href, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
    }

    window.BZNResourceLibrary = Object.freeze({ open, close, refresh, environment, fetchBlob });
})();
// BZN-CHECKPOINT-NEW-UI-FULL-STATE-20260826
// Change: preserve the complete NewUI text-file state after unified object property windows and debug removal.
