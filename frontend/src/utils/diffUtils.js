import { diffWords } from 'diff';

// ── helpers ────────────────────────────────────────────────────────────────

function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripMarkers(s) {
  return s.replace(/\{\+|\+\}|\[-|-\]/g, '');
}

// Apply {+...+} / [-...-] markers to an already-HTML-escaped blob.
// Citations like [-@key-] are left untouched (negative lookahead).
function applySpans(s) {
  s = s.replace(/\{\+([\s\S]*?)\+\}/g, '<span class="ins">$1</span>');
  s = s.replace(/\[-(?!@)([\s\S]*?)-\]/g, '<span class="del">$1</span>');
  return s;
}

// Remove spurious bracket-swap artefacts around citations
function collapseBracketSwaps(s) {
  s = s.replace(/<span class="del">\(<\/span>\s*<span class="ins">\[<\/span>/g, '[');
  s = s.replace(/<span class="del">\)<\/span>\s*<span class="ins">\]<\/span>/g, ']');
  return s;
}

function applyInlineCode(s) {
  return s.replace(/`([^`]+)`/g, '<code class="icode">$1</code>');
}

function isFence(line)      { return /^\s*`{3,}(\{[^}]*\})?\s*$/.test(line); }
function isDiffMeta(line)   { return /^(diff --git|index\s|@@\s|---\s|\+\+\+\s)/.test(line); }
function isHeader(line)     { return /^\s*#{1,6}\s+\S/.test(line); }
function headerLevel(line)  { const m = line.match(/^\s*(#{1,6})\s/); return m ? m[1].length : 1; }

// ── core diff ──────────────────────────────────────────────────────────────

/**
 * Strip editor-internal HTML annotations (comment marks, track-change spans)
 * from a QMD string before diffing so they don't pollute the output.
 */
function stripEditorAnnotations(text) {
  // Remove <span data-...>…</span> wrappers but keep their text content.
  // These are comment/track-change marks injected by the editor serialiser.
  return text
    .replace(/<span\s+data-[^>]*>/gi, '')
    .replace(/<\/span>/gi, '');
}

/**
 * Build annotated diff text with {+added+} and [-removed-] markers.
 * Markers are split at every newline so they never span multiple lines —
 * this prevents the renderer from losing track of open spans across lines.
 */
function annotate(oldText, newText) {
  const parts = diffWords(oldText, newText);
  const result = [];

  for (const p of parts) {
    if (!p.added && !p.removed) {
      result.push(p.value);
      continue;
    }
    // Split across newlines: each non-empty sub-line gets its own marker
    const open  = p.added ? '{+' : '[-';
    const close = p.added ? '+}' : '-]';
    const sublines = p.value.split('\n');
    for (let i = 0; i < sublines.length; i++) {
      if (sublines[i]) result.push(open + sublines[i] + close);
      if (i < sublines.length - 1) result.push('\n');
    }
  }

  return result.join('');
}

// ── HTML renderer (JS port of the R render_qmd_worddiff_html function) ─────

export function renderDiffHtml(rawOldText, rawNewText, title = 'Document diff') {
  // Strip editor-internal spans before diffing
  const oldText   = stripEditorAnnotations(rawOldText);
  const newText   = stripEditorAnnotations(rawNewText);
  const annotated = annotate(oldText, newText);
  const rawLines  = annotated.split('\n');
  const n         = rawLines.length;

  // Because markers are now guaranteed not to span newlines, process line-by-line.
  const htmlLines = rawLines.map(l => collapseBracketSwaps(applySpans(htmlEscape(l))));

  const out     = [];
  let   inCode  = false;
  const codeBuf = [];

  const flushCode = () => {
    out.push('<pre class="codeblock">' + codeBuf.join('\n') + '</pre>');
    codeBuf.length = 0;
  };

  for (let i = 0; i < n; i++) {
    const clean = stripMarkers(rawLines[i]);
    const hline = htmlLines[i];

    // ── fenced code blocks ──────────────────────────────────────────────
    if (isFence(clean)) {
      if (!inCode) { inCode = true;  codeBuf.push(hline); }
      else         { codeBuf.push(hline); flushCode(); inCode = false; }
      continue;
    }
    if (inCode) { codeBuf.push(hline); continue; }

    // ── diff metadata lines (skip) ──────────────────────────────────────
    if (isDiffMeta(clean)) {
      out.push(`<div class="meta">${hline}</div>`);
      continue;
    }

    // ── markdown headers ────────────────────────────────────────────────
    if (isHeader(clean)) {
      const lvl        = headerLevel(clean);
      const headerRaw  = rawLines[i].replace(/^\s*#{1,6}\s+/, '');
      const headerHtml = collapseBracketSwaps(applySpans(htmlEscape(headerRaw)));
      out.push(`<h${lvl}>${headerHtml}</h${lvl}>`);
      continue;
    }

    // ── normal text line ────────────────────────────────────────────────
    out.push(`<div class="line">${applyInlineCode(hline)}</div>`);
  }

  if (inCode) flushCode();

  const css = `
:root{--ins:#eaffea;--del:#ffecec;--codebg:#f7f7f7;--metabg:#f3f3f3;--bdr:#e8e8e8;}
body{font-family:'Times New Roman',Times,serif;margin:1.2rem 1.8rem;max-width:1100px;}
h1,h2,h3,h4,h5,h6{margin:.9em 0 .4em;line-height:1.2;}
h1{font-size:2em;}h2{font-size:1.6em;}h3{font-size:1.35em;}
h4{font-size:1.2em;}h5{font-size:1.05em;}h6{font-size:1em;}
.line{white-space:pre-wrap;line-height:1.6;}
.meta{background:var(--metabg);border:1px solid var(--bdr);padding:4px 8px;border-radius:4px;margin:4px 0;font-size:.85em;}
.ins{background:var(--ins);}
.del{background:var(--del);text-decoration:line-through;}
pre.codeblock{white-space:pre-wrap;font-family:'Courier New',Courier,monospace;
  background:var(--codebg);border:1px solid var(--bdr);padding:10px 14px;
  margin:10px 0;border-radius:6px;line-height:1.35;}
code.icode{font-family:'Courier New',Courier,monospace;background:#f1f1f1;padding:0 3px;border-radius:3px;}
`;

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${htmlEscape(title)}</title>`,
    `<style>${css}</style></head><body>`,
    `<h1>${htmlEscape(title)}</h1>`,
    out.join('\n'),
    '</body></html>',
  ].join('');
}
