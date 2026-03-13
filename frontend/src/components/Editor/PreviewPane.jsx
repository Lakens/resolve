import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { tiptapDocToQmd } from '../../utils/quartoConversionUtils';
import { parseQmd } from '../../utils/quartoUtils';
import { markdownToHtml } from '../../utils/markdownConverter';
import { formatApaInText, formatApaReference } from '../../utils/apaUtils';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCellOutput(output) {
  if (output.output_type === 'stream') {
    const text = Array.isArray(output.text) ? output.text.join('') : output.text;
    if (output.name === 'stderr') return ''; // hide warnings/messages in preview
    if (/<[a-zA-Z]/.test(text)) {
      return `<div class="preview-output-html">${text}</div>`;
    }
    return `<pre class="preview-output-text">${escapeHtml(text)}</pre>`;
  }
  if (output.data?.['image/png']) {
    return `<figure class="preview-output-figure"><img src="data:image/png;base64,${output.data['image/png']}" alt="R output" style="max-width:100%" /></figure>`;
  }
  if (output.data?.['text/html']) {
    const html = Array.isArray(output.data['text/html']) ? output.data['text/html'].join('') : output.data['text/html'];
    return `<div class="preview-output-html">${html}</div>`;
  }
  if (output.data?.['text/plain']) {
    const text = Array.isArray(output.data['text/plain']) ? output.data['text/plain'].join('') : output.data['text/plain'];
    return `<pre class="preview-output-text">${escapeHtml(text)}</pre>`;
  }
  return '';
}

/**
 * Replace [@key] and [@key1; @key2] citation patterns in HTML with APA in-text citations.
 * Returns { html, citedKeys } where citedKeys is the ordered set of cited keys.
 */
function applyCitations(html, refMap) {
  const citedKeys = [];
  const replaced = html.replace(/\[@([^\]]+)\]/g, (match, inner) => {
    const keys = inner.split(';').map(k => k.trim().replace(/^@/, ''));
    const parts = keys.map(key => {
      const entry = refMap[key];
      if (!entry) return `(${key})`;
      if (!citedKeys.includes(key)) citedKeys.push(key);
      return formatApaInText(entry);
    });
    // Merge multi-key: (Smith, 2020; Jones, 2021) — strip outer parens and rejoin
    if (parts.length === 1) return parts[0];
    const inner2 = parts.map(p => p.replace(/^\(|\)$/g, '')).join('; ');
    return `(${inner2})`;
  });
  return { html: replaced, citedKeys };
}

/**
 * Replace `r expr` inline R patterns in a markdown text string with
 * evaluated values from the cache, before the text is converted to HTML.
 */
function applyInlineR(text, cache) {
  if (!cache || cache.size === 0) return text;
  return text.replace(/`r\s+([^`]+?)`/g, (match, expr) => {
    const cached = cache.get(expr.trim());
    if (!cached) return match;
    if (cached.error) return `[R error: ${cached.error}]`;
    return cached.value ?? match;
  });
}

function buildPreviewHtml(cells, codeCellOutputs, refMap, inlineRCache) {
  let html = '';
  let codeIndex = 0;
  const allCitedKeys = [];
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
      // Apply inline R and citations on raw markdown BEFORE markdownToHtml,
      // so markdown-it doesn't consume [@key] tokens before applyCitations sees them.
      let content = inlineRCache ? applyInlineR(cell.content, inlineRCache) : cell.content;
      const { html: cited, citedKeys: cellCitedKeys } = applyCitations(content, refMap);
      cellCitedKeys.forEach(k => { if (!allCitedKeys.includes(k)) allCitedKeys.push(k); });
      html += markdownToHtml(cited);
    } else if (cell.type === 'code') {
      const outputs = codeCellOutputs[codeIndex] || [];
      codeIndex++;
      const outputHtml = outputs.map(renderCellOutput).join('');
      if (outputHtml) {
        html += `<div class="preview-cell-output">${outputHtml}</div>`;
      }
    }
  }

  // Append APA reference list if any citations were found
  let refHtml = '';
  if (allCitedKeys.length > 0) {
    refHtml = '<hr class="preview-refs-divider"><h2 class="preview-refs-heading">References</h2><div class="preview-refs-list">';
    for (const key of allCitedKeys) {
      const entry = refMap[key];
      if (entry) {
        refHtml += `<p class="preview-ref-entry">${formatApaReference(entry)}</p>`;
      }
    }
    refHtml += '</div>';
  }

  return html + refHtml;
}

export function PreviewPane({ editor, references, inlineRCache, filePath }) {
  const containerRef = useRef(null);
  const [html, setHtml] = useState('');

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `preview-${(filePath || 'document').replace(/\//g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!editor) return;

    const doUpdate = () => {
      try {
        const qmd = tiptapDocToQmd(editor);
        const { cells } = parseQmd(qmd);

        // Collect stored outputs from codeCell nodes in document order.
        const codeCellOutputs = [];
        editor.state.doc.descendants(node => {
          if (node.type.name === 'codeCell') {
            codeCellOutputs.push(node.attrs.outputs || []);
          }
        });

        // Build a map from citationKey → entryTags for fast lookup
        const refMap = {};
        if (references) {
          for (const ref of references) {
            if (ref.citationKey) refMap[ref.citationKey] = ref.entryTags || {};
          }
        }

        setHtml(buildPreviewHtml(cells, codeCellOutputs, refMap, inlineRCache));
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
    doUpdate();

    return () => {
      editor.off('update', handler);
      clearTimeout(timeout);
    };
  }, [editor, references, inlineRCache]);

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
    <div className="preview-pane-wrapper">
      <div className="preview-pane-toolbar">
        {html && (
          <button className="diff-download-btn" onClick={downloadHtml}>
            ↓ Download HTML
          </button>
        )}
      </div>
      <div
        className="preview-pane"
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
