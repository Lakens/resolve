/**
 * Harper integration utilities.
 * Runs locally in the browser/Electron process via harper.js and never sends
 * document text to an external service.
 */

import { WorkerLinter, binaryInlined, Dialect } from 'harper.js';

let harperLinterPromise = null;

export function extractProseText(doc) {
  const segments = [];
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

export function resolveMatch(offset, length, segments) {
  const end = offset + length;
  for (const seg of segments) {
    if (offset >= seg.ltStart && end <= seg.ltEnd) {
      return {
        from: seg.pmFrom + (offset - seg.ltStart),
        to: seg.pmFrom + (end - seg.ltStart),
      };
    }
  }
  return null;
}

function getHarperCategory(kind, prettyKind) {
  const raw = `${kind || ''} ${prettyKind || ''}`.toLowerCase();
  if (raw.includes('spell') || raw.includes('misspell')) return 'spelling';
  if (raw.includes('grammar') || raw.includes('capital') || raw.includes('agreement')) return 'grammar';
  return 'style';
}

async function getHarperLinter() {
  if (!harperLinterPromise) {
    const linter = new WorkerLinter({
      binary: binaryInlined,
      dialect: Dialect.American,
    });

    harperLinterPromise = linter.setup().then(() => linter).catch((error) => {
      harperLinterPromise = null;
      throw error;
    });
  }

  return harperLinterPromise;
}

export async function callHarper(text) {
  const linter = await getHarperLinter();
  const lints = await linter.lint(text, { language: 'plaintext' });

  return lints.map((lint) => {
    const span = lint.span();
    const suggestions = lint
      .suggestions()
      .map((suggestion) => ({ value: suggestion.get_replacement_text() }))
      .filter((suggestion, index, array) => (
        suggestion.value !== undefined &&
        suggestion.value !== null &&
        array.findIndex((candidate) => candidate.value === suggestion.value) === index
      ));

    return {
      offset: span.start,
      length: span.end - span.start,
      message: lint.message(),
      lintKind: lint.lint_kind(),
      lintKindPretty: lint.lint_kind_pretty(),
      replacements: suggestions,
      category: getHarperCategory(lint.lint_kind(), lint.lint_kind_pretty()),
    };
  });
}
