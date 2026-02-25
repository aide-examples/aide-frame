/**
 * Slideshow Presenter for aide-frame Docs Viewer
 *
 * Renders Markdown slide decks as fullscreen presentations.
 * Detection: first line contains <!-- slideshow -->
 * Slides: separated by --- (horizontal rule)
 * Speaker notes: blockquotes starting with > **Speaker Notes:** (hidden)
 *
 * Usage:
 *   if (Slideshow.isSlideshow(markdown)) {
 *       Slideshow.start(markdown);
 *   }
 */

// eslint-disable-next-line no-unused-vars
const Slideshow = (() => {

    // ── State ───────────────────────────────────────────────────────────

    let _slides = [];       // [{ content, notes }]
    let _current = 0;       // current slide index
    let _overlay = null;    // DOM element
    let _active = false;

    // ── Detection ───────────────────────────────────────────────────────

    function isSlideshow(markdown) {
        if (!markdown) return false;
        const firstLine = markdown.split('\n')[0].trim();
        return firstLine.includes('<!-- slideshow');
    }

    // ── Parsing ─────────────────────────────────────────────────────────

    function parseSlides(markdown) {
        // Split on --- (horizontal rule, surrounded by blank lines)
        const sections = markdown.split(/\n---\n/);

        // First section is the file header / metadata — skip it
        const slideRaw = sections.slice(1);

        return slideRaw.map(raw => {
            // Extract speaker notes: everything after > **Speaker Notes:**
            // until the next ### heading or end of slide
            const lines = raw.split('\n');
            const contentLines = [];
            const notesLines = [];
            let inNotes = false;

            for (const line of lines) {
                if (line.match(/^>\s*\*\*Speaker Notes?:\*\*/i)) {
                    inNotes = true;
                    const noteText = line.replace(/^>\s*\*\*Speaker Notes?:\*\*\s*/i, '');
                    if (noteText) notesLines.push(noteText);
                } else if (inNotes && (line.startsWith('>') || line.trim() === '')) {
                    // Blockquote continuation or blank line within notes
                    notesLines.push(line.replace(/^>\s?/, ''));
                } else {
                    inNotes = false;
                    contentLines.push(line);
                }
            }

            // Convert ## Slide N: Title → ### Title (visible heading)
            const content = contentLines.join('\n')
                .replace(/^##\s+Slide\s+\d+[A-Z]?\s*:\s*(.+)$/m, '### $1')
                .trim();

            return {
                content,
                notes: notesLines.join('\n').trim()
            };
        }).filter(s => s.content.length > 0);
    }

    // ── Rendering ───────────────────────────────────────────────────────

    function renderSlide(index) {
        if (!_overlay || index < 0 || index >= _slides.length) return;

        _hideTOC();
        _current = index;
        const slide = _slides[index];

        const slideEl = _overlay.querySelector('.slideshow-slide');
        // Split: first heading pinned to top, rest vertically centered
        const parsed = marked.parse(slide.content);
        const tmp = document.createElement('div');
        tmp.innerHTML = parsed;
        const heading = tmp.querySelector('h1, h2, h3');
        const titleHtml = heading ? heading.outerHTML : '';
        if (heading) heading.remove();
        slideEl.innerHTML =
            `<div class="slideshow-slide-title">${titleHtml}</div>` +
            `<div class="slideshow-slide-body"><div class="slideshow-slide-inner">${tmp.innerHTML}</div></div>`;

        // Rewrite relative image paths (same logic as viewer)
        slideEl.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
                // Use docs-assets prefix if available
                const prefix = window._slideshowAssetPrefix || 'docs-assets/';
                const dir = window._slideshowDocDir || '';
                const fullPath = dir ? dir + '/' + src : src;
                img.setAttribute('src', prefix + fullPath);
            }
        });

        // Update counter
        const counter = _overlay.querySelector('.slideshow-counter');
        if (counter) counter.textContent = `${index + 1} / ${_slides.length}`;

        // Update speaker notes (shown on footer hover)
        const notesEl = _overlay.querySelector('.slideshow-notes');
        if (notesEl) {
            notesEl.innerHTML = slide.notes ? marked.parse(slide.notes) : '';
            notesEl.dataset.hasNotes = slide.notes ? 'true' : 'false';
        }
    }

    // ── Navigation ──────────────────────────────────────────────────────

    function next() {
        if (_current < _slides.length - 1) renderSlide(_current + 1);
    }

    function prev() {
        if (_current > 0) renderSlide(_current - 1);
    }

    function goTo(index) {
        if (index >= 0 && index < _slides.length) renderSlide(index);
    }

    // ── Keyboard Handler ────────────────────────────────────────────────

    function _onKeyDown(e) {
        if (!_active) return;

        switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
            e.preventDefault();
            next();
            break;
        case 'ArrowLeft':
        case 'PageUp':
            e.preventDefault();
            prev();
            break;
        case 'Home':
            e.preventDefault();
            goTo(0);
            break;
        case 'End':
            e.preventDefault();
            goTo(_slides.length - 1);
            break;
        case 'Escape':
            e.preventDefault();
            stop();
            break;
        case 'p':
        case 'P':
            e.preventDefault();
            // Print from within presenter: exit fullscreen first, then print
            _exitFullscreen();
            printAll(window._slideshowMarkdown, {
                assetPrefix: window._slideshowAssetPrefix,
                docDir: window._slideshowDocDir
            });
            break;
        }
    }

    // ── Click navigation (left 20% = back, top 20% = TOC, rest = forward)

    function _onClick(e) {
        if (!_active) return;
        // Don't intercept clicks on links or interactive elements
        if (e.target.closest('a, button, input, select, textarea')) return;
        // Don't intercept clicks inside TOC
        if (e.target.closest('.slideshow-toc')) return;

        const slideEl = _overlay.querySelector('.slideshow-slide');
        const rect = slideEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (y < rect.height * 0.2) {
            // Top 20%: toggle TOC
            _toggleTOC();
        } else if (x < rect.width * 0.2) {
            // Left 20%: go back
            prev();
        } else {
            // Rest: go forward
            next();
        }
    }

    // ── Table of Contents ─────────────────────────────────────────────

    function _toggleTOC() {
        const existing = _overlay.querySelector('.slideshow-toc');
        if (existing) {
            existing.remove();
            return;
        }
        _showTOC();
    }

    function _showTOC() {
        const toc = document.createElement('div');
        toc.className = 'slideshow-toc';

        const items = _slides.map((slide, i) => {
            // Extract first heading as slide title
            const match = slide.content.match(/^#{1,3}\s+(.+)$/m);
            const title = match ? match[1].replace(/\*\*/g, '').replace(/`/g, '') : `Slide ${i + 1}`;
            const active = i === _current ? ' class="active"' : '';
            return `<li${active} data-index="${i}">${i + 1}. ${_escHtml(title)}</li>`;
        });

        toc.innerHTML = `<ul>${items.join('')}</ul>`;

        // Click on TOC item → jump to slide
        toc.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-index]');
            if (li) {
                goTo(Number(li.dataset.index));
                toc.remove();
            }
        });

        // Close on Escape (handled by main handler) or click outside
        _overlay.querySelector('.slideshow-slide').appendChild(toc);
    }

    function _hideTOC() {
        const toc = _overlay?.querySelector('.slideshow-toc');
        if (toc) toc.remove();
    }

    // ── Fullscreen ──────────────────────────────────────────────────────

    function _enterFullscreen() {
        const el = _overlay;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    function _exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen();
        }
    }

    function _onFullscreenChange() {
        // If user exits fullscreen via browser UI (not Escape key), stop the slideshow
        if (_active && !document.fullscreenElement && !document.webkitFullscreenElement) {
            _cleanup();
        }
    }

    // ── Start / Stop ────────────────────────────────────────────────────

    function _parseLogo(markdown, assetPrefix, docDir) {
        const first = markdown.split('\n')[0];
        const m = first.match(/logo:(\S+)/);
        if (!m) return '';
        const src = m[1];
        const fullPath = docDir ? docDir + '/' + src : src;
        return assetPrefix + fullPath;
    }

    function start(markdown, options = {}) {
        if (_active) stop();

        _slides = parseSlides(markdown);
        if (_slides.length === 0) return;

        // Store context for image resolution and print access
        window._slideshowMarkdown = markdown;
        window._slideshowAssetPrefix = options.assetPrefix || 'docs-assets/';
        window._slideshowDocDir = options.docDir || '';

        // Extract title from first slide for footer
        const titleMatch = markdown.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : '';

        // Resolve logo from <!-- slideshow logo:path --> directive
        const logoSrc = _parseLogo(markdown, window._slideshowAssetPrefix, window._slideshowDocDir);
        const logoHtml = logoSrc
            ? `<img class="slideshow-logo" src="${_escHtml(logoSrc)}" alt="">`
            : '';

        // Build overlay
        _overlay = document.createElement('div');
        _overlay.className = 'slideshow-overlay';
        _overlay.innerHTML = `
            <div class="slideshow-slide markdown-body"></div>
            ${logoHtml}
            <div class="slideshow-notes"></div>
            <div class="slideshow-footer">
                <span class="slideshow-title">${_escHtml(title)}</span>
                <span class="slideshow-counter">1 / ${_slides.length}</span>
            </div>
        `;
        document.body.appendChild(_overlay);

        _active = true;
        _current = 0;

        // Bind events
        document.addEventListener('keydown', _onKeyDown);
        _overlay.querySelector('.slideshow-slide').addEventListener('click', _onClick);
        document.addEventListener('fullscreenchange', _onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', _onFullscreenChange);

        // Render first slide
        renderSlide(0);

        // Enter fullscreen
        _enterFullscreen();
    }

    function stop() {
        _exitFullscreen();
        _cleanup();
    }

    function _cleanup() {
        _active = false;
        document.removeEventListener('keydown', _onKeyDown);
        document.removeEventListener('fullscreenchange', _onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', _onFullscreenChange);
        if (_overlay) {
            _overlay.remove();
            _overlay = null;
        }
        _slides = [];
        _current = 0;
    }

    // ── Print All Slides ────────────────────────────────────────────────

    function printAll(markdown, options = {}) {
        const slides = parseSlides(markdown || '');
        if (slides.length === 0) return;

        const assetPrefix = options.assetPrefix || 'docs-assets/';
        const docDir = options.docDir || '';

        // Extract title
        const titleMatch = (markdown || '').match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : '';

        // Resolve logo
        const logoSrc = _parseLogo(markdown || '', assetPrefix, docDir);

        // Build print container with ALL slides
        const container = document.createElement('div');
        container.className = 'slideshow-print';

        slides.forEach((slide, i) => {
            const page = document.createElement('div');
            page.className = 'slideshow-print-page markdown-body';

            // Split: heading at top, rest centered
            const parsed = marked.parse(slide.content);
            const tmp = document.createElement('div');
            tmp.innerHTML = parsed;
            const heading = tmp.querySelector('h1, h2, h3');
            const headingHtml = heading ? heading.outerHTML : '';
            if (heading) heading.remove();
            page.innerHTML =
                `<div class="slideshow-slide-title">${headingHtml}</div>` +
                `<div class="slideshow-slide-body"><div class="slideshow-slide-inner">${tmp.innerHTML}</div></div>`;

            // Rewrite image paths
            page.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
                    const fullPath = docDir ? docDir + '/' + src : src;
                    img.setAttribute('src', assetPrefix + fullPath);
                }
            });

            // Logo on each print page
            if (logoSrc) {
                const logo = document.createElement('img');
                logo.className = 'slideshow-logo';
                logo.src = logoSrc;
                logo.alt = '';
                page.appendChild(logo);
            }

            // Page footer with title and slide number
            const footer = document.createElement('div');
            footer.className = 'slideshow-print-footer';
            footer.innerHTML = `<span>${_escHtml(title)}</span><span>${i + 1} / ${slides.length}</span>`;
            page.appendChild(footer);

            container.appendChild(page);
        });

        document.body.appendChild(container);

        // Print and clean up
        window.print();

        // Remove after print dialog closes
        const cleanup = () => {
            container.remove();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        // Fallback: remove after 60s if afterprint doesn't fire
        setTimeout(() => container.remove(), 60000);
    }

    // ── Utility ─────────────────────────────────────────────────────────

    function _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Public API ──────────────────────────────────────────────────────

    return {
        isSlideshow,
        parseSlides,
        start,
        stop,
        next,
        prev,
        goTo,
        printAll
    };
})();
