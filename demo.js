// Standalone smoke page for the reusable library window and Lightbox.
(() => {
    'use strict';

    const DEMO = Object.freeze({
        pageSize: 30,
        total: 34,
        library: 'images',
        callerId: 'imageLibrary',
        contentType: 'Images',
        tabs: Object.freeze(['Images', 'Stock', 'Lib', 'ComfyHistory']),
    });

    // Function: a generated SVG keeps the standalone test independent from content repositories.
    function previewDataUrl(index) {
        const hue = (index * 37) % 360;
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
            <rect width="640" height="480" fill="hsl(${hue} 55% 22%)"/>
            <circle cx="320" cy="210" r="132" fill="hsl(${hue} 70% 48%)"/>
            <text x="320" y="410" text-anchor="middle" fill="white" font-family="sans-serif" font-size="44">${index}</text>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    }

    // Function: the demo provider exercises the same fixed 30-item pagination contract as remote sources.
    function providePage({ page, pageSize }) {
        const safePageSize = Number(pageSize) || DEMO.pageSize;
        const first = (Number(page) - 1) * safePageSize;
        const count = Math.max(0, Math.min(safePageSize, DEMO.total - first));
        const items = Array.from({ length: count }, (_, offset) => {
            const number = first + offset + 1;
            const url = previewDataUrl(number);
            return Object.freeze({
                name: `Demo image ${number}`,
                extension: 'svg',
                mime: 'image/svg+xml',
                preview: 'image',
                thumbnail_url: url,
                url,
            });
        });
        return Promise.resolve(Object.freeze({
            ok: true,
            page: Number(page),
            pages: Math.ceil(DEMO.total / safePageSize),
            total: DEMO.total,
            items,
        }));
    }

    // Function: all enabled demo tabs use isolated source descriptors and the same stateless provider.
    function sourceDescriptors() {
        return Object.freeze(Object.fromEntries(DEMO.tabs.map((tabId) => [tabId, Object.freeze({
            library: tabId === 'Images' ? DEMO.library : tabId.toLowerCase(),
            provider: providePage,
        })])));
    }

    // Function: the generic library can be opened without Canvas, PHP or a content repository.
    function openLibrary() {
        return window.BZNResourceLibrary.open({
            library: DEMO.library,
            callerId: DEMO.callerId,
            contentType: DEMO.contentType,
            provider: providePage,
            sources: sourceDescriptors(),
            labels: Object.freeze({ title: 'Проверка библиотеки', use: 'Использовать' }),
        });
    }

    // Function: Lightbox remains independently usable by any external application.
    function openLightbox() {
        window.BZNLightbox.open({
            contentType: DEMO.contentType,
            src: previewDataUrl(1),
            title: 'Проверка Lightbox',
            closeLabel: 'Закрыть',
            fitLabel: 'Вписать',
            actualSizeLabel: '100%',
        });
    }

    document.getElementById('openLibrary')?.addEventListener('click', () => void openLibrary());
    document.getElementById('openLightbox')?.addEventListener('click', openLightbox);
})();
