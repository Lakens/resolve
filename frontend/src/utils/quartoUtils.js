import yaml from 'js-yaml';

/**
 * Parse a .qmd string into a structured cell array.
 * Returns { yaml: Object, cells: Array }
 *
 * Cell types:
 *   { type: 'raw', content, isYamlHeader, parsedYaml, isAcademicArticle }
 *   { type: 'markdown', content }
 *   { type: 'code', language, source: string[], outputs: [] }
 */
export function parseQmd(qmdString) {
  if (!qmdString) return { yaml: {}, cells: [] };

  const lines = qmdString.split('\n');
  let yamlObj = {};
  const cells = [];
  let i = 0;

  // Check for YAML front matter (--- ... ---)
  if (lines[0] === '---') {
    let yamlEnd = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j] === '---' || lines[j] === '...') {
        yamlEnd = j;
        break;
      }
    }

    if (yamlEnd !== -1) {
      const yamlContent = lines.slice(1, yamlEnd).join('\n');
      try {
        yamlObj = yaml.load(yamlContent) || {};
      } catch (e) {
        console.error('Failed to parse YAML front matter:', e);
      }

      const rawContent = `---\n${yamlContent}\n---`;
      cells.push({
        type: 'raw',
        content: rawContent,
        isYamlHeader: true,
        parsedYaml: yamlObj,
        isAcademicArticle: !!(yamlObj && yamlObj.title)
      });

      i = yamlEnd + 1;
    }
  }

  // Parse remaining content
  let currentMarkdownLines = [];

  while (i < lines.length) {
    const line = lines[i];

    // Match code chunk opener: ```{lang} or ```{lang options}
    const codeChunkMatch = line.match(/^```\{(\w+)(.*?)?\}\s*$/);

    if (codeChunkMatch) {
      // Flush accumulated markdown
      if (currentMarkdownLines.length > 0) {
        const content = currentMarkdownLines.join('\n').trimEnd();
        if (content.trim()) {
          cells.push({ type: 'markdown', content });
        }
        currentMarkdownLines = [];
      }

      const language = codeChunkMatch[1];
      const chunkHeader = codeChunkMatch[1] + (codeChunkMatch[2] || '');
      const codeLines = [];
      i++;

      // Collect lines until closing ```
      while (i < lines.length && lines[i] !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      // i now points to closing ```, will be incremented below

      cells.push({
        type: 'code',
        language,
        chunkHeader,
        source: codeLines.length > 0 ? codeLines.map(l => l + '\n') : [],
        outputs: []
      });
    } else {
      currentMarkdownLines.push(line);
    }

    i++;
  }

  // Flush remaining markdown
  if (currentMarkdownLines.length > 0) {
    const content = currentMarkdownLines.join('\n').trimEnd();
    if (content.trim()) {
      cells.push({ type: 'markdown', content });
    }
  }

  return { yaml: yamlObj, cells };
}

/**
 * Serialize cells back to a .qmd string.
 * Input: { yaml: Object, cells: Array }
 * Output: string
 */
export function serializeQmd({ yaml: yamlObj, cells }) {
  const parts = [];

  for (const cell of cells) {
    if (cell.type === 'raw' && cell.isYamlHeader) {
      const yamlData = cell.parsedYaml || yamlObj;
      if (yamlData && Object.keys(yamlData).length > 0) {
        const yamlStr = yaml.dump(yamlData, {
          lineWidth: -1,
          noRefs: true,
          indent: 2,
          flowLevel: -1
        });
        parts.push(`---\n${yamlStr}---`);
      } else {
        parts.push(cell.content || '');
      }
    } else if (cell.type === 'markdown') {
      parts.push(cell.content);
    } else if (cell.type === 'code') {
      const language = cell.language || 'r';
      const sourceLines = Array.isArray(cell.source)
        ? cell.source.map(l => l.replace(/\n$/, ''))
        : (cell.source || '').split('\n');
      // Remove trailing empty line if present
      while (sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === '') {
        sourceLines.pop();
      }
      const header = cell.chunkHeader !== undefined ? cell.chunkHeader : language;
      parts.push(`\`\`\`{${header}}\n${sourceLines.join('\n')}\n\`\`\``);
    }
  }

  return parts.join('\n\n') + '\n';
}
