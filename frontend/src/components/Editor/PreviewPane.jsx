import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { tiptapDocToQmd } from '../../utils/quartoConversionUtils';
import { parseQmd } from '../../utils/quartoUtils';
import { markdownToHtml } from '../../utils/markdownConverter';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPreviewHtml(cells) {
  let html = '';
  for (const cell of cells) {
    if (cell.type === 'raw' && cell.isYamlHeader) {
      const meta = cell.parsedYaml || {};
      if (meta.title) {
        html += `<h1 class="preview-title">${escapeHtml(meta.title)}</h1>`;
      }
      if (meta.author) {
        const authors = Array.isArray(meta.author) ? meta.author : [meta.author];
        const names = authors.map(a =>
          typeof a === 'object' ? escapeHtml(a.name || '') : escapeHtml(a)
        );
        html += `<p class="preview-authors">${names.join(', ')}</p>`;
      }
      if (meta.abstract) {
        html += `<div class="preview-abstract"><strong>Abstract</strong><p>${escapeHtml(meta.abstract)}</p></div>`;
      }
    } else if (cell.type === 'markdown') {
      html += markdownToHtml(cell.content);
    } else if (cell.type === 'code') {
      const lang = cell.language || 'r';
      const source = Array.isArray(cell.source)
        ? cell.source.join('')
        : (cell.source || '');
      html += `<div class="preview-code-block"><div class="preview-code-label">${escapeHtml(lang)}</div><pre><code>${escapeHtml(source)}</code></pre></div>`;
    }
  }
  return html;
}

export function PreviewPane({ editor }) {
  const containerRef = useRef(null);
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!editor) return;

    const doUpdate = () => {
      try {
        const qmd = tiptapDocToQmd(editor);
        const { cells } = parseQmd(qmd);
        setHtml(buildPreviewHtml(cells));
      } catch (_) {
        // silently ignore preview errors — the editor content may be mid-edit
      }
    };

    let timeout;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(doUpdate, 400);
    };

    editor.on('update', handler);
    doUpdate(); // render current content immediately on mount

    return () => {
      editor.off('update', handler);
      clearTimeout(timeout);
    };
  }, [editor]);

  // After React sets the HTML, post-process math tokens with KaTeX
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.block-math').forEach(el => {
      try { katex.render(el.textContent, el, { displayMode: true, throwOnError: false }); }
      catch (_) {}
    });
    container.querySelectorAll('.inline-math').forEach(el => {
      try { katex.render(el.textContent, el, { displayMode: false, throwOnError: false }); }
      catch (_) {}
    });
  }, [html]);

  return (
    <div
      className="preview-pane"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
