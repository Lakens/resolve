import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { extractProseText, resolveMatch, callHarper } from '../../utils/harperUtils';

export const harperKey = new PluginKey('harper');

export const HarperExtension = Extension.create({
  name: 'harper',

  addOptions() {
    return {
      onMatchClick: null,
      isEnabled: () => true,
    };
  },

  addProseMirrorPlugins() {
    const { onMatchClick, isEnabled } = this.options;

    return [
      new Plugin({
        key: harperKey,

        state: {
          init: () => ({ decorations: DecorationSet.empty, matches: [], enabled: true }),
          apply(tr, prev) {
            const meta = tr.getMeta(harperKey);
            if (meta) {
              return {
                decorations: meta.decorations ?? prev.decorations,
                matches: meta.matches ?? prev.matches,
                enabled: meta.enabled ?? prev.enabled,
              };
            }
            if (tr.docChanged) {
              return {
                decorations: prev.decorations.map(tr.mapping, tr.doc),
                matches: prev.matches,
                enabled: prev.enabled,
              };
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            return harperKey.getState(state).decorations;
          },
          handleClick(view, pos, event) {
            const { matches, enabled } = harperKey.getState(view.state);
            if (!enabled) return false;

            const hit = matches.find((match) => pos >= match.from && pos < match.to);
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

          const publishState = (payload) => {
            const tr = editorView.state.tr.setMeta(harperKey, payload);
            editorView.dispatch(tr);
          };

          const clearMatches = (enabled) => {
            publishState({
              decorations: DecorationSet.empty,
              matches: [],
              enabled,
            });
          };

          const runCheck = async () => {
            const enabled = Boolean(isEnabled?.());
            if (!enabled) {
              clearMatches(false);
              return;
            }

            const id = ++reqId;
            const { ltText, segments } = extractProseText(editorView.state.doc);
            if (!ltText.trim()) {
              clearMatches(true);
              return;
            }

            try {
              const result = await callHarper(ltText);
              if (id !== reqId) return;

              const matches = [];
              const decos = [];

              for (const match of result) {
                const pos = resolveMatch(match.offset, match.length, segments);
                if (!pos) continue;

                const resolved = { ...match, from: pos.from, to: pos.to };
                matches.push(resolved);
                decos.push(
                  Decoration.inline(pos.from, pos.to, {
                    class: `lt-mark lt-${match.category}`,
                    title: match.message,
                  })
                );
              }

              publishState({
                decorations: DecorationSet.create(editorView.state.doc, decos),
                matches,
                enabled: true,
              });
            } catch (error) {
              console.error('Harper spellcheck failed:', error);
              clearMatches(true);
            }
          };

          return {
            update(view, prevState) {
              const enabled = Boolean(isEnabled?.());
              const prevPluginState = harperKey.getState(prevState);
              const currentPluginState = harperKey.getState(view.state);
              const enabledChanged = prevPluginState?.enabled !== enabled || currentPluginState?.enabled !== enabled;

              if (enabledChanged) {
                clearTimeout(timer);
                timer = setTimeout(runCheck, enabled ? 250 : 0);
                return;
              }

              if (!enabled) return;

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
