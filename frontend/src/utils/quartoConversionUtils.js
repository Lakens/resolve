import { generateJSON } from '@tiptap/core';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Mathematics from 'tiptap-math';
import InlineMath from './InlineMath/inlineMath';

import { parseQmd, serializeQmd } from './quartoUtils';
import { markdownToHtml, htmlToMarkdown } from './markdownConverter';
import { CodeCell } from '../cells/codeCell';
import { RawCell } from '../cells/rawCell';
import { TrackChangeExtension } from './TrackChanges';
import { CommentMark } from './CommentMark';
import { CitationMark } from '../components/Citation/CitationMark';

// Shared extension list used for both parsing and serializing markdown
const tiptapExtensions = [
  StarterKit,
  RawCell,
  CodeCell,
  Underline,
  Highlight,
  TrackChangeExtension,
  CommentMark,
  Mathematics.configure({
    preserveBackslashes: true,
    HTMLAttributes: {
      'data-type': 'math',
      'data-latex': '{{ node.attrs.content }}'
    }
  }),
  InlineMath,
  CitationMark,
  Table,
  TableRow,
  TableCell,
  TableHeader
];

/**
 * Load a .qmd string into the TipTap editor.
 */
export function qmdToTiptapDoc(qmdContent, editor) {
  const trackChangeExtension = editor.extensionManager.extensions.find(
    ext => ext.name === 'trackchange'
  );
  const wasEnabled = trackChangeExtension?.options.enabled;
  if (wasEnabled) {
    editor.commands.setTrackChangeStatus(false);
  }

  const qmdString = typeof qmdContent === 'string' ? qmdContent : '';
  const { cells } = parseQmd(qmdString);

  const docNodes = [];

  for (const cell of cells) {
    if (cell.type === 'raw') {
      const rawNode = {
        type: 'rawCell',
        attrs: {
          content: cell.content || '',
          isYamlHeader: cell.isYamlHeader || false,
          parsedYaml: cell.parsedYaml || null,
          isAcademicArticle: cell.isAcademicArticle || false,
          formattedYaml: cell.formattedYaml || null
        }
      };

      if (cell.isYamlHeader && cell.isAcademicArticle) {
        const yamlData = cell.parsedYaml || {};
        if (!yamlData.title) yamlData.title = '';
        rawNode.attrs.parsedYaml = yamlData;
      }

      docNodes.push(rawNode);
    } else if (cell.type === 'markdown') {
      const html = markdownToHtml(cell.content);
      const json = generateJSON(html, tiptapExtensions);
      docNodes.push(...json.content);
    } else if (cell.type === 'code') {
      docNodes.push({
        type: 'codeCell',
        attrs: {
          source: cell.source,
          outputs: [],
          executionCount: null,
          metadata: { language: cell.language || 'r', chunkHeader: cell.chunkHeader || null }
        }
      });
    }
  }

  // Ensure document is never empty
  if (docNodes.length === 0) {
    docNodes.push({ type: 'paragraph', content: [] });
  }

  const doc = { type: 'doc', content: docNodes };

  const tr = editor.state.tr;
  tr.setMeta('trackManualChanged', true);
  tr.setMeta('loading', true);
  tr.replaceWith(0, editor.state.doc.content.size, editor.schema.nodeFromJSON(doc));
  editor.view.dispatch(tr);

  if (wasEnabled) {
    editor.commands.setTrackChangeStatus(true);
  }

  return doc;
}

/**
 * Serialize the current TipTap editor content back to a .qmd string.
 */
export function tiptapDocToQmd(editor) {
  const editorContent = editor.getJSON();
  const cells = [];
  let currentMarkdownNodes = [];

  const flushMarkdownCell = () => {
    if (currentMarkdownNodes.length === 0) return;

    const processedContent = currentMarkdownNodes.map(node => {
      if (node.type === 'table') {
        const rows = node.content.map(row => {
          const cells = row.content.map(cell => {
            const cellContent = cell.content?.[0]?.content?.[0]?.text || '';
            return ` ${cellContent.trim()} `;
          });
          return `|${cells.join('|')}|`;
        });
        const headerSeparator = `|${Array(rows[0].split('|').length - 2).fill(' --- ').join('|')}|`;
        rows.splice(1, 0, headerSeparator);
        return rows.join('\n');
      }

      const html = generateHTML({ type: 'doc', content: [node] }, tiptapExtensions);
      return htmlToMarkdown(html);
    }).join('\n\n');

    cells.push({ type: 'markdown', content: processedContent });
    currentMarkdownNodes = [];
  };

  editorContent.content.forEach(node => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'table') {
      currentMarkdownNodes.push(node);
    } else if (node.type === 'rawCell') {
      flushMarkdownCell();

      let content = node.attrs.content || '';
      if (node.attrs.isYamlHeader && node.attrs.formattedYaml) {
        content = `---\n${node.attrs.formattedYaml}---`;
      }

      cells.push({
        type: 'raw',
        content,
        isYamlHeader: node.attrs.isYamlHeader || false,
        parsedYaml: node.attrs.parsedYaml || null,
        isAcademicArticle: node.attrs.isAcademicArticle || false
      });
    } else if (node.type === 'codeCell') {
      flushMarkdownCell();

      const { source, metadata } = node.attrs;
      cells.push({
        type: 'code',
        language: metadata?.language || 'r',
        chunkHeader: metadata?.chunkHeader || null,
        source: Array.isArray(source) ? source : (source || '').split('\n').map(l => l + '\n'),
        outputs: []
      });
    } else {
      currentMarkdownNodes.push(node);
    }
  });

  flushMarkdownCell();

  return serializeQmd({ yaml: {}, cells });
}
