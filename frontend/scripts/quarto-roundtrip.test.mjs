import assert from 'node:assert/strict';
import { parseQmd, serializeQmd } from '../src/utils/quartoUtils.js';

const source = `---
title: Reliability Test
author: Daniel Lakens
---

Intro paragraph.

\`\`\`{r echo=FALSE}
summary(cars)
\`\`\`

Closing paragraph.
`;

const parsed = parseQmd(source);

assert.equal(parsed.cells.length, 4);
assert.equal(parsed.cells[0].type, 'raw');
assert.equal(parsed.cells[1].type, 'markdown');
assert.equal(parsed.cells[2].type, 'code');
assert.equal(parsed.cells[2].chunkHeader, 'r echo=FALSE');
assert.equal(parsed.cells[3].type, 'markdown');

const serialized = serializeQmd(parsed);
const reparsed = parseQmd(serialized);

const normalizeCell = (cell) => ({
  type: cell.type,
  content: typeof cell.content === 'string' ? cell.content.trim() : cell.content,
  chunkHeader: cell.chunkHeader,
  source: cell.source,
  isYamlHeader: cell.isYamlHeader,
});

assert.deepEqual(reparsed.cells.map(normalizeCell), parsed.cells.map(normalizeCell));

console.log('QMD round-trip test passed.');
