import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { extractProseText, resolveMatch, matchCategory, callLanguageTool } from '../../utils/languageToolUtils';

export const languageToolKey = new PluginKey('languageTool');

export const LanguageToolExtension = Extension.create({
  name: 'languageTool',

  addOptions() {
    return { onMatchClick: null };
  },

  addProseMirrorPlugins() {
    const { onMatchClick } = this.options;

    return [
      new Plugin({
        key: languageToolKey,

        state: {
          init: () => ({ decorations: DecorationSet.empty, matches: [] }),
          apply(tr, prev) {
            const meta = tr.getMeta(languageToolKey);
            if (meta) return meta;
            // Keep decorations mapped to doc changes
            if (tr.docChanged) {
              return { decorations: prev.decorations.map(tr.mapping, tr.doc), matches: prev.matches };
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            return languageToolKey.getState(state).decorations;
          },
          handleClick(view, pos, event) {
            const { matches } = languageToolKey.getState(view.state);
            const hit = matches.find(m => pos >= m.from && pos < m.to);
            if (hit && onMatchClick) {
              onMatchClick(hit, event);
              return true;
            }
            return false;
          },
        },

        view(editorView) {
          let timer = null;
          let reqId = 0;

          const runCheck = async () => {
            const id = ++reqId;
            const { ltText, segments } = extractProseText(editorView.state.doc);
            if (!ltText.trim()) return;

            try {
              const result = await callLanguageTool(ltText);
              if (id !== reqId) return; // stale — a newer check is running

              const matches = [];
              const decos = [];

              for (const m of result.matches) {
                const pos = resolveMatch(m.offset, m.length, segments);
                if (!pos) continue;
                const cat = matchCategory(m);
                matches.push({ ...m, from: pos.from, to: pos.to, category: cat });
                decos.push(
                  Decoration.inline(pos.from, pos.to, {
                    class: `lt-mark lt-${cat}`,
                    title: m.message,
                  })
                );
              }

              const tr = editorView.state.tr.setMeta(languageToolKey, {
                decorations: DecorationSet.create(editorView.state.doc, decos),
                matches,
              });
              editorView.dispatch(tr);
            } catch (_) {
              // silently ignore network / API errors
            }
          };

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                clearTimeout(timer);
                timer = setTimeout(runCheck, 1500);
              }
            },
            destroy() {
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
