import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItEmoji from 'markdown-it-emoji';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItIns from 'markdown-it-ins';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';
import TurndownService from 'turndown';
import { tables, strikethrough } from 'turndown-plugin-gfm';

function markdownItCitations(md) {
  // Regular expressions for citation patterns
  const citationRegex = /@([a-zA-Z0-9_][a-zA-Z0-9_:.#$%&\-+?<>~/]*|\{[^}]+\})/;
  const locatorTerms = /\b(p|pp|page|pages|chapter|chap|section|sec|paragraph|para|figure|fig|volume|vol)\b\.?\s+([0-9]+(?:\s*[-–]\s*[0-9]+)?)/i;

  // Helper function to parse a single citation
  function parseCitation(text, state) {
    const match = text.match(citationRegex);
    if (!match) return null;

    let citationKey = match[1];
    if (citationKey.startsWith('{') && citationKey.endsWith('}')) {
      citationKey = citationKey.slice(1, -1);
    }

    const parts = text.slice(match[0].length).split(',');
    const prefix = parts.length > 1 ? parts[0].trim() : '';
    const remainder = parts.slice(1).join(',').trim();

    const locatorMatch = remainder.match(locatorTerms);
    const locator = locatorMatch ? locatorMatch[0] : '';
    const suffix = locatorMatch ? remainder.replace(locatorMatch[0], '').trim() : remainder;

    // Get reference details from the editor's reference manager
    let referenceDetails = null;
    if (state.env.referenceManager) {
      const reference = state.env.referenceManager.getReference(citationKey);
      if (reference && reference.entryTags) {
        const { AUTHOR, YEAR, TITLE, JOURNAL } = reference.entryTags;
        referenceDetails = JSON.stringify({ AUTHOR, YEAR, TITLE, JOURNAL });
      }
    }

    return { citationKey, prefix, locator, suffix, referenceDetails };
  }

  // Rule for standalone citations (@key)
  md.inline.ruler.before('emphasis', 'standalone_citation', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '@') {
      return false;
    }

    const match = state.src.slice(start).match(citationRegex);
    if (!match) {
      return false;
    }

    if (!silent) {
      const citation = parseCitation(state.src.slice(start), state);
      if (citation) {
        const token = state.push('citation_open', 'span', 1);
        token.attrs = [
          ['class', 'citation'],
          ['data-citation-key', citation.citationKey],
          ['data-prefix', citation.prefix],
          ['data-suffix', citation.suffix],
          ['data-locator', citation.locator],
          ['data-in-brackets', 'false']
        ];
        
        if (citation.referenceDetails) {
          token.attrs.push(['data-reference-details', citation.referenceDetails]);
        }

        state.push('text', '', 0).content = '@' + citation.citationKey;
        state.push('citation_close', 'span', -1);
      }
    }

    state.pos += match[0].length;
    return true;
  });

  // Rule for bracketed citations [@key] or [see @key, p. 23]
  md.inline.ruler.before('emphasis', 'bracketed_citations', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '[') {
      return false;
    }

    const end = state.src.indexOf(']', start);
    if (end === -1) {
      return false;
    }

    const content = state.src.slice(start + 1, end);
    const citations = content.split(';').map(part => part.trim());
    
    let anyCitations = false;
    for (const citation of citations) {
      const match = citation.match(citationRegex);
      if (match) {
        anyCitations = true;
        break;
      }
    }

    if (!anyCitations) {
      return false;
    }

    if (!silent) {
      for (let i = 0; i < citations.length; i++) {
        const citation = parseCitation(citations[i], state);
        if (citation) {
          if (i > 0) {
            state.push('text', '', 0).content = '; ';
          }

          const token = state.push('citation_open', 'span', 1);
          token.attrs = [
            ['class', 'citation citation-bracketed'],
            ['data-citation-key', citation.citationKey],
            ['data-prefix', citation.prefix],
            ['data-suffix', citation.suffix],
            ['data-locator', citation.locator],
            ['data-in-brackets', 'true']
          ];

          if (citation.referenceDetails) {
            token.attrs.push(['data-reference-details', citation.referenceDetails]);
          }

          if (citation.prefix) {
            state.push('text', '', 0).content = citation.prefix + ' ';
          }
          state.push('text', '', 0).content = '@' + citation.citationKey;
          if (citation.locator) {
            state.push('text', '', 0).content = ', ' + citation.locator;
          }
          if (citation.suffix) {
            state.push('text', '', 0).content = ' ' + citation.suffix;
          }
          state.push('citation_close', 'span', -1);
        }
      }
    }

    state.pos = end + 1;
    return true;
  });
}

// Initialize markdown-it with plugins to support <ins> tags and tables
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})
.use(markdownItAnchor)
.use(markdownItEmoji)
.use(markdownItFootnote)
.use(markdownItIns)
.use(markdownItSub)
.use(markdownItSup)
.use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true })
.use(markdownItCitations);

// Custom rule for display math ($$...$$)
md.block.ruler.before('paragraph', 'math_block', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const line = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]);
  
  
  // Match complete math expression: $$...$$
  const mathMatch = line.match(/^\$\$(.*?)\$\$$/);
  if (!mathMatch) return false;
  
  const content = mathMatch[1];
  
  if (!silent) {
    const token = state.push('math_block', 'math', 0);
    token.content = content;
    token.block = true;
    token.meta = { type: 'math' }; // Add metadata to help identify this as math
  }
  
  state.line = startLine + 1;
  return true;
});

// Custom rule for inline math ($...$)
md.inline.ruler.before('emphasis', 'math_inline', (state, silent) => {
  if (state.src[state.pos] !== '$') return false;

  let pos = state.pos + 1;
  let found = false;

  // Find the closing $
  while (pos < state.src.length) {
    if (state.src[pos] === '$') {
      found = true;
      break;
    }
    pos++;
  }

  if (!found) return false;

  const content = state.src.slice(state.pos + 1, pos);
  if (!content) return false;

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = content;
    token.markup = '$';
    token.meta = { type: 'inlineMath' };
  }

  state.pos = pos + 1;
  return true;
});

// Render rules for math
md.renderer.rules.math_block = function(tokens, idx) {
  return `<div class="block-math">${tokens[idx].content}</div>`;
};

md.renderer.rules.math_inline = function(tokens, idx) {
  return `<span class="inline-math">${tokens[idx].content}</span>`;
};

// Initialize Turndown with options to preserve tags
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Use specific GFM plugins for better table support
turndownService.use([tables, strikethrough]);

// Preserve <ins> and <del> tags during Turndown conversion
turndownService.keep(['ins', 'del']);

// Preserve comment marks as inline HTML spans so they round-trip through QMD files.
// markdown-it (html:true) passes the span through on load; CommentMark.parseHTML()
// recognises span[data-comment-id] and restores the TipTap mark.
turndownService.addRule('commentMark', {
  filter: (node) => node.nodeName === 'SPAN' && node.hasAttribute('data-comment-id'),
  replacement: (content, node) => {
    const enc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    const id        = enc(node.getAttribute('data-comment-id'));
    const username  = enc(node.getAttribute('data-username'));
    const avatarUrl = enc(node.getAttribute('data-avatar-url'));
    const text      = enc(node.getAttribute('data-text'));
    const timestamp = enc(node.getAttribute('data-timestamp'));
    const resolved  = node.getAttribute('data-resolved') || 'false';
    return `<span data-comment-id="${id}" data-username="${username}" data-avatar-url="${avatarUrl}" data-text="${text}" data-timestamp="${timestamp}" data-resolved="${resolved}">${content}</span>`;
  }
});

// After initializing turndownService add rule for refs
turndownService.addRule('bibMention', {
  filter: (node, options) => {
    return (
      node.nodeName === 'SPAN' && 
      node.classList && node.classList.contains('bib-mention')
    );
  },
  replacement: (content, node, options) => {
    const key = node.getAttribute('data-bib-key') || '';
    // If your plugin produces prefix/suffix inside the content, handle them here:
    const text = content.trim(); // might contain prefix/suffix
    // Construct the citation format:
    // If you have prefix/suffix logic, you can reconstruct something like:
    // [see @Smith2015, pp. 33-35; also @Wickham2015, chap. 1]
    // For simplicity, assume just a single citation:
    return `[@${key}${text ? ' ' + text : ''}]`;
  }
});

// Add custom HTML to Markdown conversion rules
turndownService.addRule('math', {
  filter: node => 
    (node.tagName === 'DIV' && node.classList.contains('block-math')) ||
    (node.tagName === 'SPAN' && node.classList.contains('inline-math')),
  replacement: (content, node) => {
    if (node.classList.contains('block-math')) {
      return `\n\n$$${content}$$\n\n`;
    } else {
      return `$${content}$`;
    }
  }
});

// Add custom HTML to Markdown conversion rules for citations
turndownService.addRule('citation', {
  filter: node => 
    node.tagName === 'SPAN' && node.classList.contains('citation'),
  replacement: (content, node) => {
    const citationKey = node.getAttribute('data-citation-key') || '';
    const prefix = node.getAttribute('data-prefix') || '';
    const locator = node.getAttribute('data-locator') || '';
    const suffix = node.getAttribute('data-suffix') || '';
    const inBrackets = node.getAttribute('data-in-brackets') === 'true';
    const referenceDetails = node.getAttribute('data-reference-details') || '';

    if (inBrackets) {
      return `[${prefix ? prefix + ' ' : ''}@${citationKey}${locator ? `, ${locator}` : ''}${suffix ? ` ${suffix}` : ''}]`;
    } else {
      return `@${citationKey}`;
    }
  }
});

export function markdownToHtml(markdown) {  
  const html = md.render(markdown);
  return html;
}

export function htmlToMarkdown(html) {
  const markdown = turndownService.turndown(html);
  return markdown;
}
