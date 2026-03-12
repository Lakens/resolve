import { Mark } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';

export const CitationMark = Mark.create({
  name: 'citation',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      citationKey: { default: null },
      prefix: { default: null },
      suffix: { default: null },
      locator: { default: null },
      isInBrackets: { default: false },
      referenceDetails: { default: null }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-citation-key]',
        getAttrs: element => ({
          citationKey: element.getAttribute('data-citation-key'),
          prefix: element.getAttribute('data-prefix'),
          suffix: element.getAttribute('data-suffix'),
          locator: element.getAttribute('data-locator'),
          isInBrackets: element.getAttribute('data-in-brackets') === 'true',
          referenceDetails: element.getAttribute('data-reference-details')
        })
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = {
      class: 'citation',
      'data-citation-key': HTMLAttributes.citationKey,
      'data-reference-details': HTMLAttributes.referenceDetails
    };

    if (HTMLAttributes.prefix) {
      attrs['data-prefix'] = HTMLAttributes.prefix;
    }
    if (HTMLAttributes.suffix) {
      attrs['data-suffix'] = HTMLAttributes.suffix;
    }
    if (HTMLAttributes.locator) {
      attrs['data-locator'] = HTMLAttributes.locator;
    }
    if (HTMLAttributes.isInBrackets) {
      attrs['data-in-brackets'] = 'true';
      attrs.class += ' citation-bracketed';
    }

    return ['span', attrs, 0]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('citation-tooltip'),
        view(editorView) {
          // Lazily create tooltips on hover via event delegation.
          // This avoids the MutationObserver → tippy DOM mutation → ProseMirror re-render loop.
          const tippyInstances = new WeakMap();

          const buildContent = (element) => {
            const referenceDetails = element.getAttribute('data-reference-details');
            let refData;
            if (referenceDetails) {
              try { refData = JSON.parse(referenceDetails); } catch (e) {}
            }
            if (!refData) {
              const citationKey = element.getAttribute('data-citation-key');
              const reference = editorView.state.schema.cached.referenceManager?.getReference(citationKey);
              if (reference) refData = reference.entryTags;
            }
            if (!refData) return 'Reference details not available';
            const { AUTHOR, YEAR, TITLE, JOURNAL } = refData;
            const authors = AUTHOR ? AUTHOR.replace(/[{}]/g, '') : '';
            const parts = [];
            if (authors) parts.push(authors);
            if (YEAR) parts.push(`(${YEAR})`);
            if (TITLE) parts.push(TITLE.replace(/[{}]/g, ''));
            if (JOURNAL) parts.push(`<em>${JOURNAL.replace(/[{}]/g, '')}</em>`);
            return `<div class="citation-tooltip">${parts.join(', ')}</div>`;
          };

          const handleMouseEnter = (e) => {
            const element = e.target.closest('.citation');
            if (!element) return;

            if (!tippyInstances.has(element)) {
              const instance = tippy(element, {
                content: buildContent(element),
                allowHTML: true,
                delay: [200, 0],
                placement: 'top',
                arrow: true,
                theme: 'light-border',
                interactive: true,
                appendTo: document.body,
                aria: { content: null, expanded: false },
              });
              tippyInstances.set(element, instance);
            }
          };

          editorView.dom.addEventListener('mouseenter', handleMouseEnter, true);

          return {
            update() {},
            destroy() {
              editorView.dom.removeEventListener('mouseenter', handleMouseEnter, true);
            }
          };
        }
      })
    ];
  },

  // Regular expressions for citation patterns
  citationRegex: /^@([a-zA-Z0-9_][a-zA-Z0-9_:.#$%&\-+?<>~/]*|\{[^}]+\})/,
  locatorTerms: /\b(p|pp|page|pages|chapter|chap|section|sec|paragraph|para|figure|fig|volume|vol)\b\.?\s+([0-9]+(?:\s*[-–]\s*[0-9]+)?)/i,

  // Helper method to parse citation text
  parseCitationText(text) {
    const match = text.match(this.citationRegex);
    if (!match) return null;

    let citationKey = match[1];
    if (citationKey.startsWith('{') && citationKey.endsWith('}')) {
      citationKey = citationKey.slice(1, -1);
    }

    const parts = text.slice(match[0].length).split(',');
    const prefix = parts.length > 1 ? parts[0].trim() : '';
    const remainder = parts.slice(1).join(',').trim();

    const locatorMatch = remainder.match(this.locatorTerms);
    const locator = locatorMatch ? locatorMatch[0] : '';
    const suffix = locatorMatch ? remainder.replace(locatorMatch[0], '').trim() : remainder;

    return {
      citationKey,
      prefix,
      locator,
      suffix,
      isInBrackets: text.startsWith('[') && text.endsWith(']')
    };
  }
});
