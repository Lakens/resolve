/**
 * InlineRDecoration — TipTap extension that highlights `r expr` inline R
 * expressions in the editor with a styled decoration and a hover tooltip
 * showing the last evaluated value.
 *
 * The underlying text is never modified, so round-trip QMD fidelity is
 * guaranteed.  After calling evaluateInlineExpressions() dispatch a transaction
 * with setMeta('inlineRUpdated', true) to force the decorations to refresh.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getInlineRCache } from '../../utils/webRSingleton';

export const INLINE_R_KEY = new PluginKey('inlineR');

// Matches `r expr` — the backtick-r-space pattern used by Quarto / R Markdown
const INLINE_R_RE = /`r\s+([^`]+?)`/g;

function buildDecorations(doc) {
  const cache = getInlineRCache();
  const decorations = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text;
    INLINE_R_RE.lastIndex = 0;
    let m;
    while ((m = INLINE_R_RE.exec(text)) !== null) {
      const from = pos + m.index;
      const to = from + m[0].length;
      const expr = m[1].trim();
      const cached = cache.get(expr);

      let cls = 'inline-r-expr';
      let title;
      if (!cached) {
        title = 'Inline R — click "Render R" in the toolbar to evaluate';
      } else if (cached.error) {
        cls += ' inline-r-expr--error';
        title = `Error: ${cached.error}`;
      } else {
        cls += ' inline-r-expr--evaluated';
        title = `= ${cached.value}`;
      }

      decorations.push(
        Decoration.inline(from, to, { class: cls, title, 'data-expr': expr })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const InlineRExtension = Extension.create({
  name: 'inlineRDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: INLINE_R_KEY,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, old, _, newState) {
            if (tr.docChanged || tr.getMeta('inlineRUpdated')) {
              return buildDecorations(newState.doc);
            }
            return old;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
