// @ts-check
'use strict';

/**
 * MdSections — the section arithmetic and the highlighting behind the plain-text
 * markdown editor.
 *
 * These three functions were written inline in `viewer.html` for the doc-viewer's
 * right-click-a-heading editor. They are PURE — no page state, no DOM — and that is why
 * they move here rather than being copied: aide-rap's media viewer edits `.aide-md` media
 * with the same gesture and the same editor, and a second copy of `extractSection` would
 * be a second definition of what "a section" means. The orchestration around them stays
 * per-consumer, because it genuinely differs: the doc viewer gates on a master password
 * and reloads a file, the media viewer PUTs a medium's content.
 *
 * No editor library. The gesture is: right-click a heading, edit plain markdown in a
 * `<textarea>` with `highlightMarkdown` painted underneath it as an overlay. For a
 * twenty-line description document that is the whole need, and it keeps ONE editing form
 * across the two places where markdown is edited (aide-rap#270).
 */
const MdSections = {

  /**
   * The section a heading opens: from its own line to the next heading of the same or a
   * higher level — its sub-headings belong to it.
   *
   * @param {string} markdown
   * @param {string} headingText  the heading's text, without the `#`s
   * @param {number} headingLevel 1..6
   * @returns {{start: number, end: number, content: string}|null} character indices, or
   *          null when no heading of that level carries that text
   */
  extractSection(markdown, headingText, headingLevel) {
    const lines = markdown.split('\n');
    const prefix = '#'.repeat(headingLevel) + ' ';
    let start = -1;
    let end = markdown.length;
    let charPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = charPos;
      charPos += line.length + 1; // +1 for newline

      if (start === -1) {
        if (line.startsWith(prefix) && line.substring(prefix.length).trim() === headingText.trim()) {
          start = lineStart;
        }
        continue;
      }

      if (line.match(/^#{1,6} /)) {
        const matchLevel = (line.match(/^(#+)/) || ['', ''])[1].length;
        if (matchLevel <= headingLevel) { end = lineStart; break; }
      }
    }

    if (start === -1) return null;
    return { start, end, content: markdown.substring(start, end) };
  },

  /**
   * @param {string} markdown @param {number} start @param {number} end @param {string} newContent
   * @returns {string} the whole document with the section replaced
   */
  replaceSection(markdown, start, end, newContent) {
    return markdown.substring(0, start) + newContent + markdown.substring(end);
  },

  /**
   * Markdown → HTML with `md-*` spans, for the overlay painted UNDER the textarea.
   *
   * Escapes first, so the result is safe to assign to `innerHTML`; the spans it then adds
   * are its own. Deliberately simple — it colours what a writer looks for while typing
   * (headings, emphasis, code, links, list markers) and does not attempt to be a parser.
   *
   * @param {string} text @returns {string}
   */
  highlightMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html
      .replace(/^(#{1,6} .*)$/gm, '<span class="md-heading">$1</span>')
      .replace(/(\*\*[^*]+\*\*)/g, '<span class="md-bold">$1</span>')
      .replace(/(\*[^*]+\*)/g, '<span class="md-italic">$1</span>')
      .replace(/(`[^`]+`)/g, '<span class="md-code">$1</span>')
      .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="md-link">$1</span>')
      .replace(/^(\s*[-*+] )/gm, '<span class="md-list">$1</span>')
      .replace(/^(\s*\d+\. )/gm, '<span class="md-list">$1</span>');

    return html;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MdSections;
} else if (typeof window !== 'undefined') {
  window.MdSections = MdSections;
}
