import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React, { useState, useRef, useEffect } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faChevronDown, faPlay, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';

import { getWebR, getWebRStatus, imageBitmapToBase64 } from '../utils/webRSingleton';

export const CodeCell = Node.create({
  name: 'codeCell',
  group: 'block',
  atom: true,
  isolating: true,

  addAttributes() {
    return {
      source: {
        default: [],
        parseHTML: element => {
          const source = element.getAttribute('data-source');
          return source ? source.split('\n').map(line => line + '\n') : [];
        },
        renderHTML: attributes => {
          const source = Array.isArray(attributes.source) ? attributes.source.join('') : attributes.source;
          return { 'data-source': source };
        }
      },
      outputs: { default: [] },
      executionCount: { default: null },
      metadata: {
        default: {
          collapsed: true,
          scrolled: false
        }
      },
      folded: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="code-cell"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'code-cell', contenteditable: false }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeCellNodeView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        const posBefore = $from.pos - 2;
        const prevNode = posBefore >= 0 ? state.doc.nodeAt(posBefore) : null;
        if (prevNode?.type.name === 'codeCell') {
          editor.commands.setTextSelection(posBefore);
          return true;
        }
        return false;
      },

      Delete: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        const posAfter = $from.pos + 1;
        const nextNode = posAfter < state.doc.content.size ? state.doc.nodeAt(posAfter) : null;
        if (nextNode?.type.name === 'codeCell') {
          editor.commands.setTextSelection(posAfter + 1);
          return true;
        }
        return false;
      },
    };
  }
});

function CodeCellNodeView({ node, editor, getPos }) {
  const { source, outputs, folded, metadata } = node.attrs;
  const [showCode, setShowCode] = useState(!folded);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const textareaRef = useRef(null);

  // Attach native (non-React) keyboard listeners directly on the textarea so
  // they fire at the source element during bubble, before ProseMirror's
  // listener on the editor div gets a chance to swallow the events.
  // React 17+ synthetic events are delegated to the React root, which is
  // higher in the DOM than the ProseMirror element — so they fire too late.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('keydown', stop);
    el.addEventListener('keyup', stop);
    el.addEventListener('keypress', stop);
    return () => {
      el.removeEventListener('keydown', stop);
      el.removeEventListener('keyup', stop);
      el.removeEventListener('keypress', stop);
    };
  }, [showCode]);

  const handleDelete = () => {
    const pos = getPos();
    if (typeof pos === 'number') {
      editor.view.dispatch(
        editor.view.state.tr.delete(pos, pos + node.nodeSize)
      );
    }
  };

  const toggleCode = () => {
    setShowCode((prev) => !prev);
    const pos = getPos();
    if (typeof pos === 'number') {
      editor.chain()
        .setTextSelection(pos)
        .updateAttributes('codeCell', {
          folded: !showCode,
          metadata: { ...metadata, collapsed: !showCode }
        })
        .run();
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setRunError(null);

    try {
      const webR = await getWebR();
      const shelter = await new webR.Shelter();

      try {
        const code = Array.isArray(source) ? source.join('') : (source || '');

        const { output } = await shelter.captureR(code, {
          withAutoprint: true,
          captureStreams: true,
          captureConditions: false,
        });

        // Collect any canvas (plot) messages queued during evaluation
        const pendingMessages = await webR.flush();

        // Build Jupyter-compatible output array
        const newOutputs = [];

        // --- Text output ---
        let stdoutText = '';
        let stderrText = '';
        for (const item of output) {
          if (item.type === 'stdout') stdoutText += item.data;
          else if (item.type === 'stderr') stderrText += item.data;
        }
        if (stdoutText) {
          newOutputs.push({ output_type: 'stream', name: 'stdout', text: stdoutText });
        }
        if (stderrText) {
          newOutputs.push({ output_type: 'stream', name: 'stderr', text: stderrText });
        }

        // --- Plot output ---
        for (const msg of pendingMessages) {
          if (msg.type === 'canvas' && msg.data?.event === 'canvasImage') {
            try {
              const base64 = imageBitmapToBase64(msg.data.image);
              newOutputs.push({
                output_type: 'display_data',
                data: { 'image/png': base64 },
                metadata: {}
              });
            } catch (_) {
              // If image conversion fails, silently skip the plot
            }
          }
        }

        // Persist outputs back onto the TipTap node
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              outputs: newOutputs,
            })
          );
        }
      } finally {
        await shelter.purge();
      }
    } catch (err) {
      setRunError(err.message || 'R execution failed');
    } finally {
      setRunning(false);
    }
  };

  const lang = metadata?.language || 'r';

  return (
    <NodeViewWrapper as="div" data-type="code-cell" className="code-cell">
      <div className="code-cell-header">
        <button
          onClick={toggleCode}
          className="code-cell-toggle"
          title={showCode ? 'Hide Code' : 'Show Code'}
        >
          <FontAwesomeIcon icon={showCode ? faChevronUp : faChevronDown} />
          <span className="code-cell-toggle-text">{lang}</span>
        </button>

        <button
          onClick={handleRun}
          className={`code-cell-run-btn${running ? ' code-cell-run-btn--running' : ''}`}
          disabled={running}
          title={running ? 'Running…' : 'Run chunk'}
        >
          <FontAwesomeIcon icon={running ? faSpinner : faPlay} spin={running} />
          <span>{running
            ? (getWebRStatus() === 'loading' ? 'Starting R…' : 'Running…')
            : 'Run'
          }</span>
        </button>

        <button
          onClick={handleDelete}
          className="code-cell-delete-btn"
          title="Delete chunk"
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>

      {showCode && (
        <textarea
          className="code-cell-content code-cell-textarea"
          value={Array.isArray(source) ? source.join('') : (source || '')}
          onChange={(e) => {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  source: e.target.value,
                })
              );
            }
          }}
          ref={textareaRef}
          spellCheck={false}
          rows={Math.max(3, (Array.isArray(source) ? source.join('') : (source || '')).split('\n').length)}
        />
      )}

      {runError && (
        <div className="code-cell-run-error">
          <strong>Error:</strong> {runError}
        </div>
      )}

      {outputs && outputs.map((out, i) => renderOutput(out, i))}
    </NodeViewWrapper>
  );
}

function renderOutput(output, index) {
  if (output.output_type === 'stream') {
    const isErr = output.name === 'stderr';
    return (
      <pre key={index} className={`code-cell-output-stream${isErr ? ' code-cell-output-stderr' : ''}`}>
        <code>{Array.isArray(output.text) ? output.text.join('') : output.text}</code>
      </pre>
    );
  }

  if (output.data) {
    if (output.data['text/html']) {
      const htmlContent = Array.isArray(output.data['text/html'])
        ? output.data['text/html'].join('')
        : output.data['text/html'];
      return (
        <div
          key={index}
          className="code-cell-output-html"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    }

    if (output.data['image/png']) {
      return (
        <div key={index} className="code-cell-output-image">
          <img src={`data:image/png;base64,${output.data['image/png']}`} alt="R output" />
        </div>
      );
    }

    if (output.data['text/plain']) {
      return (
        <pre key={index} className="code-cell-output-text">
          <code>
            {Array.isArray(output.data['text/plain'])
              ? output.data['text/plain'].join('')
              : output.data['text/plain']}
          </code>
        </pre>
      );
    }
  }

  return (
    <pre key={index} className="code-cell-output-json">
      <code>{JSON.stringify(output, null, 2)}</code>
    </pre>
  );
}
