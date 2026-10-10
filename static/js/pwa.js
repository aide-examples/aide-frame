/**
 * PWA Manager for aide-frame applications.
 * Handles service worker registration and install prompt.
 *
 * Usage:
 *   <script src="/static/frame/js/pwa.js"></script>
 *   <script>
 *       PWA.init();  // Registers service worker
 *       // Install prompt is handled automatically via StatusWidget
 *   </script>
 */
const PWA = {
    installPrompt: null,
    isInstalled: false,

    /**
     * Initialize PWA - register service worker
     */
    init() {
        // PWA is a TOP-LEVEL-app concern. This module is bundled into frame.min.js,
        // which ACTION pages also load (for the global `i18n`) inside an iframe. In
        // that embedded context, skip everything: registering a service worker there
        // resolves the relative 'service-worker.js' against the iframe's own path
        // (e.g. /sys/<sys>/service-worker.js) → 404; and install-prompt capture /
        // standalone detection belong to the outer app, not the embedded page.
        if (typeof window !== 'undefined' && window.self !== window.top) return;

        // …and the same reasoning once more for the pages that load the bundle as the
        // TOPMOST document (aide-rap#340). The guard above catches the entity actions
        // opened in an iframe — but a LOGIN action in full-page mode REPLACES the
        // document, so it is `window.top` and looks like the app shell from here. The
        // documentation viewer (`viewer.html`) likewise. Both produced two console
        // errors on every call, because `service-worker.js` resolves against their own
        // location: scope ('…/sys/eltern/') → 404.
        //
        // The criterion is the MANIFEST LINK, not the path. A page carrying a
        // `<link rel="manifest">` declares, by the standard, that it is THE installable
        // application — which is exactly the question to be answered here. A path rule
        // (skip `/sys/…`) would be knowledge about aide-rap inside aide-frame, and would
        // not carry over to any other frame.
        //
        // Nothing is lost by it: without a manifest the browser offers no installation
        // anyway, so a worker would be useless there even if the file were in place.
        if (typeof document !== 'undefined' && !document.querySelector('link[rel="manifest"]')) return;

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] App is running in standalone mode (installed)');
        }

        // Register the service worker at the app root. Its scope is then `<basePath>/`
        // = start_url, which is what makes Chrome offer the install prompt; registering
        // `static/frame/service-worker.js` would scope it to that subdir and suppress
        // installability.
        //
        // ── RESOLVED AGAINST THE MANIFEST LINK, not against the page ──────────────────
        //
        // This read `register('service-worker.js')`, i.e. relative to the DOCUMENT. That is
        // right for an app shell, which carries a `<base href>` and therefore resolves to the
        // app root — and wrong for any other page that declares itself installable. aide-rap
        // calls the other arrangement Variant A: a full-page action with NO base href, where
        // the same line asks for `…/sys/<action>/service-worker.js` and gets a 404. Measured
        // 2026-10-10 on a kiosk page the moment it was given a manifest link: two console
        // errors, no worker, and therefore no installation offered anywhere — Chrome needs a
        // worker controlling the page before it offers anything, its own address-bar icon
        // included.
        //
        // The manifest LINK is the right base, and it costs nothing to use: the guard above
        // already treats it as the declaration of *"this page is the installable
        // application"*, and by convention the manifest and the worker live side by side at
        // the app root. So it resolves correctly under both arrangements and under a base
        // path, without this file learning anything about either consumer.
        //
        // **The resolution must not be able to kill this method.** `new URL` THROWS on a base
        // it cannot parse — a page built with `setContent`, an `about:blank` document, a link
        // whose href is empty. Caught, that costs the better path and nothing else; uncaught,
        // it takes the install-prompt capture below with it, and a PWA stops working because a
        // URL could not be parsed. Found by `aide-rap/app/tools/test-pwa-sw-scope.js`, whose
        // fixture is exactly such a document.
        if ('serviceWorker' in navigator) {
            let swUrl = 'service-worker.js';
            try {
                const mf = document.querySelector('link[rel="manifest"]');
                if (mf && mf.href) swUrl = new URL('service-worker.js', mf.href).pathname;
            } catch (e) {
                console.warn('[PWA] manifest href not usable as a base, registering relative:', e);
            }
            navigator.serviceWorker.register(swUrl)
                .then(reg => console.log('[PWA] Service worker registered, scope:', reg.scope))
                .catch(err => console.error('[PWA] SW registration failed:', err));
        }

        // Capture install prompt
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this.installPrompt = event;
            console.log('[PWA] Install prompt available');
            // Notify StatusWidget to show install link
            this.updateInstallUI(true);
        });

        // Handle successful installation
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App was installed');
            this.installPrompt = null;
            this.isInstalled = true;
            this.updateInstallUI(false);
        });
    },

    /**
     * Check if install is available
     */
    canInstall() {
        return this.installPrompt !== null && !this.isInstalled;
    },

    /**
     * Trigger install prompt
     */
    async install() {
        if (!this.installPrompt) {
            console.log('[PWA] No install prompt available');
            return false;
        }

        this.installPrompt.prompt();
        const { outcome } = await this.installPrompt.userChoice;
        console.log('[PWA] User choice:', outcome);

        if (outcome === 'accepted') {
            this.installPrompt = null;
        }
        return outcome === 'accepted';
    },

    /**
     * Update install UI (called by StatusWidget)
     */
    updateInstallUI(show) {
        const installLink = document.getElementById('sw-install-link');
        if (installLink) {
            installLink.style.display = show ? 'inline' : 'none';
        }
    }
};

// Self-initialize: register the SW + capture beforeinstallprompt as soon as
// this module loads. Nothing else calls PWA.init() (the StatusWidget only calls
// PWA.canInstall()/PWA.install()), and on prod the individual pwa.js source is
// excluded — only the bundled copy in frame.min.js runs. Without this line the
// service worker never registered on any deployed system, so the browser never
// offered a PWA install. Safe at parse time: init() touches no DOM.
PWA.init();
