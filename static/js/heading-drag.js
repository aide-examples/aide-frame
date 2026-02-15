/**
 * HeadingDragReorder — Drag-to-reorder markdown sections in the viewer.
 *
 * Usage:
 *   const hdr = new HeadingDragReorder({
 *       container,                        // DOM element containing rendered markdown
 *       getMarkdown: () => currentMarkdown,
 *       onReorder: async (newMarkdown, scrollToHeading) => { ... }
 *   });
 *   hdr.attach();   // after each loadDoc()
 *   hdr.detach();   // before next loadDoc()
 *
 * Interaction: SHIFT+Click+Drag on a heading to reorder within same-level siblings.
 */
class HeadingDragReorder {
    constructor({ container, getMarkdown, onReorder }) {
        this.container = container;
        this.getMarkdown = getMarkdown;
        this.onReorder = onReorder;

        // Drag state
        this._drag = null; // { heading, level, headingText, siblingIndex, siblings, ghost, indicators, activeIdx }

        // Bound handlers (for cleanup)
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseUp = this._handleMouseUp.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp = this._handleKeyUp.bind(this);

        // Track headings we attached to
        this._headings = [];
    }

    /**
     * Attach drag handlers to all content headings.
     */
    attach() {
        const headings = this.container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
            if (h.closest('.toc-container')) return;
            h.addEventListener('mousedown', this._onMouseDown);
            this._headings.push(h);
        });

        // Global SHIFT tracking for visual hints
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    /**
     * Remove all handlers and clean up.
     */
    detach() {
        this._cleanup();
        this._headings.forEach(h => {
            h.removeEventListener('mousedown', this._onMouseDown);
            h.classList.remove('heading-drag-ready');
        });
        this._headings = [];
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
    }

    // =========================================================================
    // SHIFT key visual hints
    // =========================================================================

    _handleKeyDown(e) {
        if (e.key === 'Shift' && !this._drag) {
            this._headings.forEach(h => {
                // Only show drag-ready if heading has siblings
                const siblings = this._findSiblings(h);
                if (siblings.length > 1) {
                    h.classList.add('heading-drag-ready');
                }
            });
        }
        if (e.key === 'Escape' && this._drag) {
            this._cleanup();
        }
    }

    _handleKeyUp(e) {
        if (e.key === 'Shift') {
            if (this._drag) {
                // SHIFT released during drag → cancel
                this._cleanup();
            } else {
                this._headings.forEach(h => h.classList.remove('heading-drag-ready'));
            }
        }
    }

    // =========================================================================
    // Drag lifecycle
    // =========================================================================

    _handleMouseDown(e) {
        if (!e.shiftKey) return;

        const heading = e.target.closest('h1, h2, h3, h4, h5, h6');
        if (!heading) return;

        const level = parseInt(heading.tagName.substring(1));
        const siblings = this._findSiblings(heading);

        // Need at least 2 siblings to reorder
        if (siblings.length < 2) return;

        e.preventDefault();

        const siblingIndex = siblings.indexOf(heading);

        // Create ghost
        const ghost = document.createElement('div');
        ghost.className = 'heading-drag-ghost';
        ghost.textContent = heading.textContent;
        ghost.style.left = (e.clientX + 12) + 'px';
        ghost.style.top = (e.clientY - 12) + 'px';
        document.body.appendChild(ghost);

        // Dim source heading
        heading.classList.add('heading-dragging');

        // Create drop indicators
        const indicators = this._createDropIndicators(siblings, siblingIndex);

        this._drag = {
            heading,
            level,
            headingText: heading.textContent,
            siblingIndex,
            siblings,
            ghost,
            indicators,
            activeIdx: -1
        };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _handleMouseMove(e) {
        if (!this._drag) return;

        // Move ghost
        this._drag.ghost.style.left = (e.clientX + 12) + 'px';
        this._drag.ghost.style.top = (e.clientY - 12) + 'px';

        // Find closest drop indicator
        const mouseY = e.clientY;
        let closestIdx = -1;
        let closestDist = Infinity;

        this._drag.indicators.forEach((ind, i) => {
            const rect = ind.el.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const dist = Math.abs(mouseY - centerY);
            if (dist < closestDist && dist < 60) {
                closestDist = dist;
                closestIdx = i;
            }
        });

        // Update active indicator
        if (closestIdx !== this._drag.activeIdx) {
            this._drag.indicators.forEach(ind => ind.el.classList.remove('active'));
            if (closestIdx >= 0) {
                this._drag.indicators[closestIdx].el.classList.add('active');
            }
            this._drag.activeIdx = closestIdx;
        }
    }

    _handleMouseUp(e) {
        if (!this._drag) return;

        const { activeIdx, siblingIndex } = this._drag;

        if (activeIdx >= 0) {
            const targetIdx = this._drag.indicators[activeIdx].targetIdx;
            if (targetIdx !== siblingIndex) {
                this._performMove(targetIdx);
                return; // cleanup happens after save
            }
        }

        this._cleanup();
    }

    // =========================================================================
    // DOM helpers
    // =========================================================================

    /**
     * Find all same-level sibling headings within the same parent section.
     */
    _findSiblings(heading) {
        const level = parseInt(heading.tagName.substring(1));
        const allHeadings = Array.from(
            this.container.querySelectorAll('h1, h2, h3, h4, h5, h6')
        ).filter(h => !h.closest('.toc-container'));

        const idx = allHeadings.indexOf(heading);
        if (idx === -1) return [];

        // Find parent boundary: walk backward to find heading with level < current
        let parentStartIdx = 0;
        for (let i = idx - 1; i >= 0; i--) {
            const hLevel = parseInt(allHeadings[i].tagName.substring(1));
            if (hLevel < level) {
                parentStartIdx = i + 1;
                break;
            }
        }

        // Find parent end: walk forward to find heading with level < current
        let parentEndIdx = allHeadings.length;
        for (let i = idx + 1; i < allHeadings.length; i++) {
            const hLevel = parseInt(allHeadings[i].tagName.substring(1));
            if (hLevel < level) {
                parentEndIdx = i;
                break;
            }
        }

        // Collect all headings at same level within parent
        const siblings = [];
        for (let i = parentStartIdx; i < parentEndIdx; i++) {
            const hLevel = parseInt(allHeadings[i].tagName.substring(1));
            if (hLevel === level) {
                siblings.push(allHeadings[i]);
            }
        }

        return siblings;
    }

    /**
     * Create drop indicator elements between sibling headings.
     * Returns array of { el, targetIdx } where targetIdx is the position
     * in the siblings array where the dragged item would land.
     */
    _createDropIndicators(siblings, dragIdx) {
        const indicators = [];

        for (let i = 0; i <= siblings.length; i++) {
            // Skip positions adjacent to current (no-op moves)
            if (i === dragIdx || i === dragIdx + 1) continue;

            const indicator = document.createElement('div');
            indicator.className = 'heading-drop-indicator';

            if (i < siblings.length) {
                // Insert before sibling[i]
                siblings[i].parentNode.insertBefore(indicator, siblings[i]);
            } else {
                // Insert after last sibling's section
                // Find the end of the last sibling's section content
                const lastSibling = siblings[siblings.length - 1];
                const nextElement = this._findSectionEnd(lastSibling);
                if (nextElement) {
                    nextElement.parentNode.insertBefore(indicator, nextElement);
                } else {
                    this.container.appendChild(indicator);
                }
            }

            // Calculate the target index in the *original* array after move
            const targetIdx = i > dragIdx ? i - 1 : i;
            indicators.push({ el: indicator, targetIdx });
        }

        return indicators;
    }

    /**
     * Find the DOM element that follows the end of a heading's section.
     * A section ends at the next heading of same or higher (lower number) level.
     */
    _findSectionEnd(heading) {
        const level = parseInt(heading.tagName.substring(1));
        let el = heading.nextElementSibling;
        while (el) {
            if (el.matches && el.matches('h1, h2, h3, h4, h5, h6')) {
                const elLevel = parseInt(el.tagName.substring(1));
                if (elLevel <= level) return el;
            }
            el = el.nextElementSibling;
        }
        return null; // end of content
    }

    // =========================================================================
    // Markdown manipulation
    // =========================================================================

    /**
     * Extract all sections at a given heading level within a character range
     * of the markdown source.
     */
    _extractSiblingSections(markdown, level, parentStart, parentEnd) {
        const lines = markdown.split('\n');
        const prefix = '#'.repeat(level) + ' ';
        const sections = [];
        let currentSection = null;
        let charPos = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineStart = charPos;
            charPos += line.length + 1; // +1 for newline

            if (lineStart < parentStart) continue;
            if (lineStart >= parentEnd) {
                // Past parent boundary
                if (currentSection) {
                    currentSection.end = lineStart;
                    sections.push(currentSection);
                    currentSection = null;
                }
                break;
            }

            if (line.match(/^#{1,6} /)) {
                const matchLevel = line.match(/^(#+)/)[1].length;

                if (matchLevel === level) {
                    if (currentSection) {
                        currentSection.end = lineStart;
                        sections.push(currentSection);
                    }
                    currentSection = {
                        start: lineStart,
                        headingText: line.substring(prefix.length).trim(),
                        end: null
                    };
                } else if (matchLevel < level) {
                    // Hit a higher-level heading — end of parent
                    if (currentSection) {
                        currentSection.end = lineStart;
                        sections.push(currentSection);
                        currentSection = null;
                    }
                    break;
                }
            }
        }

        // Close last section
        if (currentSection) {
            currentSection.end = Math.min(charPos, parentEnd);
            sections.push(currentSection);
        }

        // Add content to each section
        sections.forEach(s => s.content = markdown.substring(s.start, s.end));

        return sections;
    }

    /**
     * Find the parent section boundaries in the markdown for a given heading.
     * Returns { parentStart, parentEnd } character positions.
     */
    _findParentBounds(markdown, headingText, level) {
        const lines = markdown.split('\n');
        const prefix = '#'.repeat(level) + ' ';
        let targetLineStart = -1;
        let charPos = 0;

        // Find the target heading's position
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineStart = charPos;
            charPos += line.length + 1;

            if (line.startsWith(prefix) && line.substring(prefix.length).trim() === headingText.trim()) {
                targetLineStart = lineStart;
                break;
            }
        }

        if (targetLineStart === -1) return null;

        // Find parent start: walk backward from target to find heading with level < current
        let parentStart = 0;
        charPos = 0;
        let lastParentHeadingEnd = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineStart = charPos;
            charPos += line.length + 1;

            if (lineStart >= targetLineStart) break;

            if (line.match(/^#{1,6} /)) {
                const matchLevel = line.match(/^(#+)/)[1].length;
                if (matchLevel < level) {
                    // This heading is a potential parent
                    // The siblings start after this heading's line
                    parentStart = charPos; // character after this heading line
                }
            }
        }

        // Find parent end: walk forward from target to find heading with level < current
        let parentEnd = markdown.length;
        charPos = 0;
        let pastTarget = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineStart = charPos;
            charPos += line.length + 1;

            if (lineStart === targetLineStart) {
                pastTarget = true;
                continue;
            }

            if (pastTarget && line.match(/^#{1,6} /)) {
                const matchLevel = line.match(/^(#+)/)[1].length;
                if (matchLevel < level) {
                    parentEnd = lineStart;
                    break;
                }
            }
        }

        return { parentStart, parentEnd };
    }

    /**
     * Perform the section move and trigger save.
     */
    async _performMove(targetIdx) {
        const { heading, level, siblingIndex, siblings } = this._drag;

        const markdown = this.getMarkdown();
        const headingText = heading.textContent;

        // Find parent bounds by matching the first sibling
        // Use the DOM siblings to get heading texts and find bounds
        const bounds = this._findParentBounds(markdown, headingText, level);
        if (!bounds) {
            console.error('Could not find parent bounds for:', headingText);
            this._cleanup();
            return;
        }

        // Extract all sibling sections from markdown
        const sections = this._extractSiblingSections(markdown, level, bounds.parentStart, bounds.parentEnd);

        if (sections.length < 2) {
            console.error('Found fewer than 2 sections');
            this._cleanup();
            return;
        }

        // Match DOM siblings to markdown sections by heading text and order
        // Build index mapping: DOM heading index → markdown section index
        let mdIdx = -1;
        for (let i = 0; i < sections.length; i++) {
            if (sections[i].headingText === headingText.trim()) {
                // If multiple matches, count by order
                if (mdIdx === -1 || i === siblingIndex) {
                    mdIdx = i;
                    if (i === siblingIndex) break;
                }
            }
        }

        if (mdIdx === -1) mdIdx = siblingIndex; // fallback

        // Reorder: remove from mdIdx, insert at targetIdx
        const rangeStart = sections[0].start;
        const rangeEnd = sections[sections.length - 1].end;

        const removed = sections.splice(mdIdx, 1)[0];
        sections.splice(targetIdx, 0, removed);

        // Reconstruct
        const newRange = sections.map(s => s.content).join('');
        const newMarkdown = markdown.substring(0, rangeStart) + newRange + markdown.substring(rangeEnd);

        this._cleanup();

        try {
            await this.onReorder(newMarkdown, headingText);
        } catch (e) {
            alert('Error saving: ' + e.message);
        }
    }

    // =========================================================================
    // Cleanup
    // =========================================================================

    _cleanup() {
        if (this._drag) {
            // Remove ghost
            if (this._drag.ghost && this._drag.ghost.parentNode) {
                this._drag.ghost.parentNode.removeChild(this._drag.ghost);
            }

            // Remove drop indicators
            if (this._drag.indicators) {
                this._drag.indicators.forEach(ind => {
                    if (ind.el.parentNode) ind.el.parentNode.removeChild(ind.el);
                });
            }

            // Restore source heading
            this._drag.heading.classList.remove('heading-dragging');

            this._drag = null;
        }

        // Remove global move/up listeners
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        // Remove drag-ready from all headings
        this._headings.forEach(h => h.classList.remove('heading-drag-ready'));
    }
}
