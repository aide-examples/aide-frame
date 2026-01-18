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
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] App is running in standalone mode (installed)');
        }

        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/static/frame/service-worker.js')
                .then(reg => console.log('[PWA] Service worker registered'))
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
