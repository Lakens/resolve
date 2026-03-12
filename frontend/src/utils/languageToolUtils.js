/**
 * LanguageTool integration utilities.
 * Handles text extraction (skipping code/raw cells), API calls, and
 * offset mapping between LT character positions and ProseMirror positions.
 */

const LT_API = 'https://api.languagetoolplus.com/v2/check';

/**
 * Walk the ProseMirror doc and extract prose text only (no codeCell / rawCell).
 * Returns the plain text and a segments array for mapping LT offsets → PM positions.
 */
export function extractProseText(doc) {
  const segments = []; // { ltStart, ltEnd, pmFrom }
  let ltText = '';

  doc.descendants((node, pos) => {
    if (node.type.name === 'codeCell' || node.type.name === 'rawCell') return false;
    if (node.isText) {
      segments.push({ ltStart: ltText.length, ltEnd: ltText.length + node.text.length, pmFrom: pos });
      ltText += node.text;
    } else if (node.isBlock && ltText.length > 0 && !ltText.endsWith('\n')) {
      ltText += '\n\n';
    }
  });

  return { ltText, segments };
}

/**
 * Map a LanguageTool match (offset + length) to { from, to } ProseMirror positions.
 * Returns null if the match spans a paragraph break or can't be resolved.
 */
export function resolveMatch(offset, length, segments) {
  const end = offset + length;
  for (const seg of segments) {
    if (offset >= seg.ltStart && end <= seg.ltEnd) {
      return {
        from: seg.pmFrom + (offset - seg.ltStart),
        to:   seg.pmFrom + (end   - seg.ltStart),
      };
    }
  }
  return null;
}

/**
 * Map a LanguageTool rule/category to a CSS class suffix.
 */
export function matchCategory(match) {
  const cat = match.rule?.category?.id || '';
  const type = match.rule?.issueType || '';
  if (type === 'misspelling' || cat === 'TYPOS') return 'spelling';
  if (type === 'grammar'     || cat === 'GRAMMAR') return 'grammar';
  return 'style';
}

/**
 * POST prose text to LanguageTool public API.
 * Returns the parsed JSON response (or throws on network/API error).
 */
export async function callLanguageTool(text, language = 'en-US') {
  const body = new URLSearchParams({ text, language });
  const res = await fetch(LT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`LanguageTool ${res.status}`);
  return res.json();
}
