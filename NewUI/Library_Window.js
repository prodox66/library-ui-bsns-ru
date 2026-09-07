// Reusable library window: one DOM and one declarative geometry/caller/tab policy; providers remain outside this primitive.
(() => {
    'use strict';
    const MODULE_KEY = 'BZNNewUILibraryWindow';
    const DATA_KEY = 'BZNLibraryWindowConfiguration';
    const LIBRARY_RUNTIME_CONFIG_KEY = 'BZNLibraryRuntimeConfig';
    const TAB_STATE = Object.freeze({ ENABLED: 'enabled', DISABLED: 'disabled', HIDDEN: 'hidden' });
    const TOOLTIP_ATTRIBUTE = 'data-bzn-ui-v2-tooltip';
    const LAYOUT_KEYS = Object.freeze(['columns', 'rows', 'thumbnailWidth', 'thumbnailHeight', 'gap', 'padding', 'border',
        'headerHeight', 'tabsHeight', 'footerHeight', 'navigationHeight', 'navigationFontSize', 'captionHeight', 'tabFontSize']);
    const METRICS = Object.freeze({ minimum: 1, twoEdges: 2, first: 0, previous: -1, next: 1 });
    const SOURCE_URL = new URL(document.currentScript.src, document.baseURI);
    const libraryInterfaceConfig = window[LIBRARY_RUNTIME_CONFIG_KEY]?.interface || {};
    const CONFIGURATION = Object.freeze({
        json: libraryInterfaceConfig.libraryWindowConfiguration || new URL('windows/library_window.json', SOURCE_URL).href,
        script: libraryInterfaceConfig.libraryWindowFileBridge || new URL('windows/library_window.data.js', SOURCE_URL).href,
    });
    const IDS = Object.freeze({ modal: 'bznResourceLibraryModal', title: 'bznResourceLibraryTitle', close: 'bznResourceLibraryClose',
        tabs: 'bznResourceLibraryTabs', grid: 'bznResourceLibraryGrid', refresh: 'bznResourceLibraryRefresh',
        previous: 'bznResourceLibraryPrev', next: 'bznResourceLibraryNext', page: 'bznResourceLibraryPage' });
    let configurationPromise = null;

    // Function: lazy JSON/data requests follow the same runtime version as their owning module.
    function assetUrl(path) {
        const url = new URL(path, SOURCE_URL);
        SOURCE_URL.searchParams.forEach((value, key) => url.searchParams.set(key, value));
        return url.href;
    }
    // Function: immutable JSON and cloned invocation data cannot drift while a provider is awaiting a response.
    function freezeTree(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(child => freezeTree(child));
        return Object.freeze(value);
    }
    // Function: malformed layout or routing fails before the active library is changed.
    function validate(configuration) {
        const layout = configuration?.layout || {};
        for (const key of LAYOUT_KEYS) {
            const value = layout[key];
            if (!Number.isFinite(value) || value < METRICS.minimum) throw new Error(`Library layout: ${key}`);
        }
        const tabs = new Map((configuration.tabs || []).map(tab => [tab.id, tab]));
        if (!tabs.size || tabs.size !== configuration.tabs.length || !Number.isInteger(layout.columns) || !Number.isInteger(layout.rows)) throw new Error('Invalid library grid');
        for (const [id, profile] of Object.entries(configuration.profiles || {})) {
            for (const [tab, state] of Object.entries(profile)) {
                if (!tabs.has(tab) || !Object.values(TAB_STATE).includes(state)) throw new Error(`Library tab policy: ${id}/${tab}`);
            }
        }
        for (const [id, caller] of Object.entries(configuration.callers || {})) {
            const profile = configuration.profiles?.[caller.profile];
            const policy = { ...profile, ...caller.tabs };
            if (!profile || tabs.get(caller.activeTab)?.contentType !== caller.contentType || policy[caller.activeTab] !== TAB_STATE.ENABLED) throw new Error(`Library caller: ${id}`);
            for (const [tab, state] of Object.entries(policy)) {
                if (!tabs.has(tab) || !Object.values(TAB_STATE).includes(state)) throw new Error(`Library tab policy: ${id}/${tab}`);
            }
        }
        if (!configuration.callers?.[configuration.defaults?.caller] || !Object.values(TAB_STATE).includes(configuration.defaults.inactiveTabState)) throw new Error('Invalid library defaults');
        for (const callerId of Object.values(configuration.libraryCallers || {})) {
            if (!configuration.callers[callerId]) throw new Error(`Library route: ${callerId}`);
        }
        return freezeTree(configuration);
    }
    // Function: cross-origin and file consumers load the generated script bridge without requiring JSON CORS headers.
    async function loadBridgeConfiguration() {
        if (!window[DATA_KEY]) await new Promise((resolve, reject) => {
            const script = document.createElement('script'); script.src = assetUrl(CONFIGURATION.script);
            script.onload = () => { script.remove(); resolve(); };
            script.onerror = () => { script.remove(); reject(new Error('Library configuration is unavailable')); };
            document.head.appendChild(script);
        });
        return validate(window[DATA_KEY]);
    }
    // Function: same-origin HTTP keeps editable JSON, while remote hosts use its generated script representation.
    function configuration() {
        if (!configurationPromise) configurationPromise = (async () => {
            const jsonUrl = new URL(assetUrl(CONFIGURATION.json));
            const sameOriginHttp = location.protocol !== 'file:' && jsonUrl.origin === location.origin;
            if (sameOriginHttp) {
                const response = await fetch(assetUrl(CONFIGURATION.json), { cache: 'no-cache', credentials: 'same-origin' });
                if (!response.ok) throw new Error(`Library configuration: HTTP ${response.status}`);
                return validate(await response.json());
            }
            return loadBridgeConfiguration();
        })().catch(error => { configurationPromise = null; throw error; });
        return configurationPromise;
    }

    // Class: the existing resource service supplies callbacks; this reusable view owns only window/control presentation.
    class LibraryWindow {
        constructor(settings, callbacks = {}) {
            this.settings = settings; this.callbacks = callbacks; this.invocation = null; this.tabs = new Map(); this.controls = new Map();
            this.buttonFactory = window.BZNNewUIButton ? new window.BZNNewUIButton.Controller() : null;
            this.create(); this.applyLayout();
        }
        get pageSize() { return this.settings.layout.columns * this.settings.layout.rows; }
        // Presentation: previews use the active tab's declared content type, not the filename or original caller's previous tab.
        get activeContentType() { return this.settings.tabs.find(tab => tab.id === this.activeTab)?.contentType; }
        // Function: reuse the shared Button when available; legacy resource consumers retain native-button compatibility.
        button(parent, id, label, handler) {
            const component = this.buttonFactory?.create({ key: id, text: label, variant: 'text', context: 'window', className: 'bzn-new-ui-button--action' });
            const button = component?.button || document.createElement('button');
            button.type = 'button'; button.id = id;
            if (!component) button.textContent = label;
            parent.appendChild(component?.element || button);
            button.addEventListener('click', handler);
            const record = { button, component, element: component?.element || button };
            this.controls.set(id, record); return record;
        }
        // Function: refreshing a label preserves the Button primitive's own text node and tooltip boundary.
        label(id, text, accessible = text) {
            const record = this.controls.get(id);
            if (!record) return;
            const label = record.button.querySelector('.bzn-new-ui-button-text') || record.button;
            label.textContent = text; record.button.setAttribute('aria-label', accessible);
            record.button.setAttribute(TOOLTIP_ATTRIBUTE, accessible); record.element.setAttribute(TOOLTIP_ATTRIBUTE, accessible);
        }
        // Function: one stable modal keeps old public IDs for gallery, pagination and modal-lock consumers.
        create() {
            this.element = document.createElement('div'); this.element.id = IDS.modal;
            this.element.className = 'bzn-resource-library-modal'; this.element.hidden = true;
            this.element.setAttribute('aria-hidden', 'true');
            this.element.innerHTML = `<div class="bzn-resource-library-window" role="dialog" aria-modal="true" aria-labelledby="${IDS.title}">
                <div class="bzn-resource-library-header"><strong class="bzn-resource-library-title" id="${IDS.title}"></strong></div>
                <div class="bzn-resource-library-tabs" id="${IDS.tabs}" role="tablist"></div>
                <div class="bzn-resource-library-grid" id="${IDS.grid}" role="tabpanel" tabindex="0"></div>
                <div class="bzn-resource-library-footer"><span class="bzn-resource-library-page" id="${IDS.page}"></span></div></div>`;
            const find = selector => this.element.querySelector(selector);
            this.button(find('.bzn-resource-library-header'), IDS.close, '×', () => this.callbacks.close?.());
            const footer = find('.bzn-resource-library-footer');
            this.button(footer, IDS.refresh, this.settings.labels.refresh, () => this.callbacks.refresh?.());
            this.button(footer, IDS.previous, this.settings.labels.previous, () => this.callbacks.navigate?.(METRICS.previous));
            footer.appendChild(find(`#${IDS.page}`));
            this.button(footer, IDS.next, this.settings.labels.next, () => this.callbacks.navigate?.(METRICS.next));
            const tablist = find(`#${IDS.tabs}`); tablist.setAttribute('aria-label', this.settings.labels.tabs);
            for (const tab of this.settings.tabs) {
                const id = `${IDS.tabs}-${tab.id}`;
                const record = this.button(tablist, id, tab.label, () => this.selectTab(tab.id));
                record.button.dataset.libraryTab = tab.id; record.button.setAttribute('role', 'tab');
                record.button.setAttribute('aria-controls', IDS.grid); this.tabs.set(tab.id, record);
            }
            tablist.addEventListener('keydown', event => this.tabKeyboard(event));
            this.element.addEventListener('pointerdown', event => { if (event.target === this.element) this.callbacks.close?.(); });
            document.body.appendChild(this.element);
        }
        // Function: geometry is computed once from the JSON; short last pages cannot resize the viewport or window.
        applyLayout() {
            const layout = this.settings.layout;
            const gridWidth = layout.columns * layout.thumbnailWidth + (layout.columns - METRICS.minimum) * layout.gap + METRICS.twoEdges * layout.padding;
            const gridHeight = layout.rows * layout.thumbnailHeight + (layout.rows - METRICS.minimum) * layout.gap + METRICS.twoEdges * layout.padding;
            const values = { ...layout, width: gridWidth + METRICS.twoEdges * layout.border,
                height: gridHeight + layout.headerHeight + layout.tabsHeight + layout.footerHeight + METRICS.twoEdges * layout.border };
            for (const [name, value] of Object.entries(values)) {
                const property = name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
                const unit = ['columns', 'rows'].includes(name) ? '' : 'px';
                this.element.style.setProperty(`--bzn-library-${property}`, `${value}${unit}`);
            }
        }
        // Function: the caller and compatible tabs come exclusively from JSON; supplied sources only determine availability.
        resolve(options) {
            const callerId = options.callerId || this.settings.libraryCallers[options.library] || this.settings.defaults.caller;
            const caller = this.settings.callers[callerId];
            if (!caller || (options.contentType && options.contentType !== caller.contentType)) throw new Error(`Unknown/incompatible library caller: ${callerId}`);
            const context = freezeTree(structuredClone(options.callerContext || {}));
            return Object.freeze({ callerId, contentType: caller.contentType, activeTab: caller.activeTab,
                context: Object.freeze(context), policy: Object.freeze({ ...this.settings.profiles[caller.profile], ...caller.tabs }) });
        }
        // Function: a fresh invocation always selects the caller's tab instead of leaking the last caller's choice.
        configure(invocation, availableTabs) {
            this.invocation = invocation; this.availableTabs = new Set(availableTabs); this.activeTab = invocation.activeTab;
            this.element.dataset.libraryCaller = invocation.callerId; this.element.dataset.libraryContentType = invocation.contentType;
            this.updateTabs();
        }
        // Function: disabled and hidden are independent presentation states and never destroy a tab's DOM owner.
        updateTabs() {
            for (const [id, record] of this.tabs) {
                const state = this.invocation.policy[id] || this.settings.defaults.inactiveTabState;
                record.element.hidden = state === TAB_STATE.HIDDEN;
                record.button.disabled = state !== TAB_STATE.ENABLED || !this.availableTabs.has(id);
                const selected = id === this.activeTab;
                if (record.component) this.buttonFactory.setActivation(record.component, selected);
                record.button.setAttribute('aria-selected', String(selected)); record.button.tabIndex = selected ? METRICS.first : METRICS.previous;
                record.button.title = record.button.disabled ? this.settings.labels.unavailable : this.settings.tabs.find(tab => tab.id === id).label;
                record.button.setAttribute(TOOLTIP_ATTRIBUTE, record.button.title); record.element.setAttribute(TOOLTIP_ATTRIBUTE, record.button.title);
            }
            this.element.dataset.libraryActiveTab = this.activeTab;
            this.element.querySelector(`#${IDS.grid}`).setAttribute('aria-labelledby', `${IDS.tabs}-${this.activeTab}`);
        }
        // Function: hidden/disabled sources never emit an action or start a network request.
        selectTab(id) {
            const record = this.tabs.get(id);
            if (!record || record.element.hidden || record.button.disabled || id === this.activeTab) return false;
            this.activeTab = id; this.updateTabs(); this.callbacks.tab?.(id); return true;
        }
        // Function: arrow navigation skips incompatible/unavailable tabs and retains a single tab stop.
        tabKeyboard(event) {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const enabled = [...this.tabs].filter(([, record]) => !record.element.hidden && !record.button.disabled);
            if (!enabled.length) return;
            const current = enabled.findIndex(([id]) => id === this.activeTab);
            const step = event.key === 'ArrowLeft' ? METRICS.previous : METRICS.next;
            const next = event.key === 'Home' ? METRICS.first : event.key === 'End' ? enabled.length - METRICS.minimum
                : (current + step + enabled.length) % enabled.length;
            event.preventDefault(); this.selectTab(enabled[next][METRICS.first]); enabled[next][METRICS.minimum].button.focus();
        }
    }
    window[MODULE_KEY] = Object.freeze({ configuration, validate,
        pageSize: async () => { const settings = await configuration(); return settings.layout.columns * settings.layout.rows; },
        create: async callbacks => new LibraryWindow(await configuration(), callbacks) });
})();
