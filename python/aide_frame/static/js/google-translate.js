/**
 * Google Translate Widget - Optional inline translator for aide-frame
 *
 * Usage:
 *   <script src="/static/frame/js/google-translate.js"></script>
 *   <script>
 *       GoogleTranslate.init('#my-container');
 *   </script>
 *
 * Or via HeaderWidget:
 *   HeaderWidget.init('#header', { showGoogleTranslate: true });
 */
const GoogleTranslate = {
    initialized: false,
    container: null,

    /**
     * Initialize Google Translate widget
     * @param {string|Element} selector - Container selector or element
     */
    init(selector) {
        if (this.initialized) return;

        this.container = typeof selector === 'string'
            ? document.querySelector(selector)
            : selector;

        if (!this.container) return;

        // Create container for Google Translate element
        const gtDiv = document.createElement('div');
        gtDiv.id = 'google_translate_element';
        gtDiv.className = 'gt-inline notranslate';
        this.container.appendChild(gtDiv);

        // Define callback for Google Translate
        window.googleTranslateElementInit = () => {
            new google.translate.TranslateElement({
                pageLanguage: 'en',
                includedLanguages: 'en,de,es,fr,it,pt,nl,pl,ru,zh-CN,ja,ko,ar',
                layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
                autoDisplay: false
            }, 'google_translate_element');
        };

        // Load Google Translate script
        const script = document.createElement('script');
        script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        script.async = true;
        document.head.appendChild(script);

        this.initialized = true;

        // Add minimal styling
        this.addStyles();
    },

    addStyles() {
        if (document.getElementById('gt-styles')) return;

        const style = document.createElement('style');
        style.id = 'gt-styles';
        style.textContent = `
            .gt-inline {
                display: inline-block;
                vertical-align: middle;
            }
            .gt-inline .goog-te-gadget {
                font-size: 0 !important;
            }
            .gt-inline .goog-te-gadget-simple {
                background: transparent !important;
                border: none !important;
                padding: 0 !important;
                font-size: 12px !important;
            }
            .gt-inline .goog-te-gadget-simple .goog-te-menu-value {
                color: #666 !important;
            }
            .gt-inline .goog-te-gadget-simple .goog-te-menu-value span:first-child {
                display: none;
            }
            .gt-inline .goog-te-gadget-icon {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
};
