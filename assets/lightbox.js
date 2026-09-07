// BZN-FILE-PURPOSE-20260829: assets/lightbox.js — открывает предпросмотр изображений в lightbox.
// BZN-CHECKPOINT-NEWUI-PRE-STABLE-BIG-20260829: NewUI pre-stable online-test checkpoint; object controls, project storage, masks, and icon rendering stay linked.
(() => {
    'use strict';

    // BZN AI Design — BETA 2.0 CHECKPOINT — 2026-08-16. Keep together with tag Beta-2.0.
    const STYLE_ID = 'bznLightboxStyles';
    const MODAL_ID = 'bznLightbox';
    const MODAL_LOCK_GLOBAL_KEY = 'BZNNewCanvasModalLock';
    const CONTENT_TYPES = Object.freeze({ IMAGE: 'Images', MASK: 'masks' });
    const MIN_ZOOM = 0.05;
    const MAX_ZOOM = 8;
    const WHEEL_ZOOM_FACTOR = 1.12;
    const scriptUrl = new URL(document.currentScript?.src || location.href, location.href);
    const assetDirectory = new URL('./', scriptUrl);
    const LIBRARY_RUNTIME_CONFIG_KEY = 'BZNLibraryRuntimeConfig';
    const libraryInterfaceConfig = window[LIBRARY_RUNTIME_CONFIG_KEY]?.interface || {};
    const runtimeQueryEntries = Object.freeze(Array.from(scriptUrl.searchParams.entries(), entry => Object.freeze(entry)));
    const DEFAULT_STYLESHEET_URL = new URL('lightbox.css', assetDirectory).href;
    let active = null;
    let view = null;

    function assetUrl(name) {
        const url = new URL(name, assetDirectory);
        runtimeQueryEntries.forEach(([key, value]) => url.searchParams.set(key, value));
        return url.href;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const link = document.createElement('link');
        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = assetUrl(libraryInterfaceConfig.lightboxStylesheet || DEFAULT_STYLESHEET_URL);
        document.head.appendChild(link);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // Function: an explicit mask context changes only the preview underlay; all other/legacy callers retain the normal background.
    function syncContentType(modal, contentType = CONTENT_TYPES.IMAGE) {
        modal.dataset.lightboxContentType = contentType === CONTENT_TYPES.MASK ? CONTENT_TYPES.MASK : CONTENT_TYPES.IMAGE;
    }

    function close() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        syncContentType(modal);
        // Branch: closing a nested preview restores the resource gallery as interaction owner.
        window[MODAL_LOCK_GLOBAL_KEY]?.release?.(modal);
        active = null;
        view = null;
    }

    function updateZoomLabel() {
        if (!view?.zoomLabel || !view.image) return;
        let scale = view.zoom;
        if (view.fit && view.image.naturalWidth > 0) {
            scale = view.image.getBoundingClientRect().width / view.image.naturalWidth;
        }
        view.zoomLabel.textContent = `${Math.max(1, Math.round(scale * 100))}%`;
    }

    function fitImage() {
        if (!view?.image || !view.stage) return;
        view.fit = true;
        view.stage.classList.remove('is-zoomed');
        view.image.style.width = '';
        view.image.style.height = '';
        view.image.style.maxWidth = '';
        view.image.style.maxHeight = '';
        view.stage.scrollLeft = 0;
        view.stage.scrollTop = 0;
        requestAnimationFrame(updateZoomLabel);
    }

    function setZoom(scale, { center = true } = {}) {
        if (!view?.image || !view.stage || !view.image.naturalWidth || !view.image.naturalHeight) return;
        const stage = view.stage;
        const oldWidth = view.image.getBoundingClientRect().width;
        const oldHeight = view.image.getBoundingClientRect().height;
        const oldCenterX = stage.scrollLeft + stage.clientWidth / 2;
        const oldCenterY = stage.scrollTop + stage.clientHeight / 2;
        const oldContentWidth = Math.max(stage.scrollWidth, oldWidth);
        const oldContentHeight = Math.max(stage.scrollHeight, oldHeight);
        const centerRatioX = oldContentWidth > 0 ? oldCenterX / oldContentWidth : 0.5;
        const centerRatioY = oldContentHeight > 0 ? oldCenterY / oldContentHeight : 0.5;

        view.fit = false;
        view.zoom = clamp(Number(scale) || 1, MIN_ZOOM, MAX_ZOOM);
        stage.classList.add('is-zoomed');
        view.image.style.maxWidth = 'none';
        view.image.style.maxHeight = 'none';
        view.image.style.width = `${Math.max(1, Math.round(view.image.naturalWidth * view.zoom))}px`;
        view.image.style.height = `${Math.max(1, Math.round(view.image.naturalHeight * view.zoom))}px`;
        updateZoomLabel();

        if (center) {
            requestAnimationFrame(() => {
                stage.scrollLeft = Math.max(0, stage.scrollWidth * centerRatioX - stage.clientWidth / 2);
                stage.scrollTop = Math.max(0, stage.scrollHeight * centerRatioY - stage.clientHeight / 2);
            });
        }
    }

    function actualSize() {
        setZoom(1);
    }

    function handleWheel(event) {
        if (!view?.image || !view.image.complete || !view.image.naturalWidth) return;
        event.preventDefault();
        const currentScale = view.fit
            ? view.image.getBoundingClientRect().width / view.image.naturalWidth
            : view.zoom;
        const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
        setZoom(currentScale * factor);
    }

    function ensureModal() {
        ensureStyles();
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'bzn-lightbox';
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="bzn-lightbox-window" role="dialog" aria-modal="true" aria-labelledby="bznLightboxTitle">
                <div class="bzn-lightbox-header">
                    <strong id="bznLightboxTitle" class="bzn-lightbox-title"></strong>
                    <button id="bznLightboxClose" class="bzn-lightbox-close" type="button" aria-label="Закрыть">×</button>
                </div>
                <div class="bzn-lightbox-stage" id="bznLightboxStage"></div>
                <div class="bzn-lightbox-footer" id="bznLightboxFooter"></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('pointerdown', (event) => {
            if (event.target === modal) close();
        });
        document.getElementById('bznLightboxClose')?.addEventListener('click', close);
        document.getElementById('bznLightboxStage')?.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !modal.hidden) close();
        });
        window.addEventListener('resize', () => {
            if (view?.fit) requestAnimationFrame(updateZoomLabel);
        });
        return modal;
    }

    function open(options = {}) {
        const modal = ensureModal();
        const stage = document.getElementById('bznLightboxStage');
        const footer = document.getElementById('bznLightboxFooter');
        const title = document.getElementById('bznLightboxTitle');
        if (!stage || !footer || !title) return;

        // Branch: a lightbox opened from another modal becomes the top interaction owner.
        window[MODAL_LOCK_GLOBAL_KEY]?.acquire?.(modal);

        active = options;
        syncContentType(modal, options.contentType);
        stage.textContent = '';
        stage.classList.remove('is-zoomed');
        footer.textContent = '';
        title.textContent = String(options.title || options.alt || 'Просмотр');

        const image = document.createElement('img');
        image.className = 'bzn-lightbox-image';
        image.alt = String(options.alt || options.title || '');
        image.decoding = 'async';
        image.src = String(options.src || '');
        stage.appendChild(image);

        const fitButton = document.createElement('button');
        fitButton.type = 'button';
        fitButton.className = 'bzn-lightbox-view-button';
        fitButton.textContent = String(options.fitLabel || 'Вписать');
        fitButton.addEventListener('click', fitImage);
        footer.appendChild(fitButton);

        const actualButton = document.createElement('button');
        actualButton.type = 'button';
        actualButton.className = 'bzn-lightbox-view-button';
        actualButton.textContent = String(options.actualSizeLabel || '100%');
        actualButton.addEventListener('click', actualSize);
        footer.appendChild(actualButton);

        const zoomLabel = document.createElement('span');
        zoomLabel.className = 'bzn-lightbox-zoom-value';
        zoomLabel.textContent = '—';
        footer.appendChild(zoomLabel);

        const secondary = document.createElement('button');
        secondary.type = 'button';
        secondary.className = 'bzn-lightbox-secondary';
        secondary.textContent = String(options.closeLabel || 'Закрыть');
        secondary.addEventListener('click', close);
        footer.appendChild(secondary);

        if (typeof options.onUse === 'function') {
            const primary = document.createElement('button');
            primary.type = 'button';
            primary.className = 'bzn-lightbox-primary';
            primary.textContent = String(options.useLabel || 'Использовать');
            primary.addEventListener('click', async () => {
                if (!active || primary.disabled) return;
                primary.disabled = true;
                try {
                    const shouldClose = await options.onUse();
                    if (shouldClose !== false) close();
                } finally {
                    if (document.body.contains(primary)) primary.disabled = false;
                }
            });
            footer.appendChild(primary);
        }

        view = {
            image,
            stage,
            zoomLabel,
            fit: true,
            zoom: 1,
        };
        image.addEventListener('load', fitImage, { once: true });

        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
    }

    window.BZNLightbox = Object.freeze({ open, close, fit: fitImage, actualSize, setZoom });
})();
// BZN-CHECKPOINT-NEW-UI-FULL-STATE-20260826
// Change: preserve the complete NewUI text-file state after unified object property windows and debug removal.
