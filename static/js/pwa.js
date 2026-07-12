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

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] App is running in standalone mode (installed)');
        }

        // Register service worker at the app root (resolves against <base href>
        // to `<basePath>/service-worker.js`, served by http-routes). Its default
        // scope is then `<basePath>/` = start_url, which is what makes Chrome
        // offer the install prompt. Registering `static/frame/service-worker.js`
        // would scope the SW to that subdir and suppress installability.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js')
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
