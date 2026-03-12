/**
 * APA 7th edition citation formatting helpers.
 * Works with BibTeX entryTags objects (keys are uppercase: AUTHOR, YEAR, TITLE, …).
 */

// LaTeX diacritic command → Unicode combining map
const LATEX_DIACRITICS = {
  '"': { a:'ä',e:'ë',i:'ï',o:'ö',u:'ü',y:'ÿ',A:'Ä',E:'Ë',I:'Ï',O:'Ö',U:'Ü',Y:'Ÿ' },
  "'": { a:'á',e:'é',i:'í',o:'ó',u:'ú',y:'ý',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú',Y:'Ý' },
  '`': { a:'à',e:'è',i:'ì',o:'ò',u:'ù',A:'À',E:'È',I:'Ì',O:'Ò',U:'Ù' },
  '^': { a:'â',e:'ê',i:'î',o:'ô',u:'û',A:'Â',E:'Ê',I:'Î',O:'Ô',U:'Û' },
  '~': { a:'ã',n:'ñ',o:'õ',A:'Ã',N:'Ñ',O:'Õ' },
  'c': { c:'ç',C:'Ç' },
  'v': { c:'č',s:'š',z:'ž',C:'Č',S:'Š',Z:'Ž' },
  'u': { a:'ă',A:'Ă' },
};

/**
 * Decode BibTeX/LaTeX encoding to plain Unicode.
 * Handles: {\"e}→ë, ---→—, --→–, {{…}}→…, {…}→…
 */
function decodeBibtex(str) {
  if (!str) return str;
  return str
    // LaTeX diacritics: {\"e}, {\'A}, {\^o}, etc.
    .replace(/\{\\([`'"^~cvuH])([a-zA-Z])\}/g, (_, cmd, letter) => {
      return LATEX_DIACRITICS[cmd]?.[letter] ?? letter;
    })
    // Also handle without braces: \"e, \'A
    .replace(/\\([`'"^~cvuH])([a-zA-Z])/g, (_, cmd, letter) => {
      return LATEX_DIACRITICS[cmd]?.[letter] ?? letter;
    })
    // Named commands: {\ss}→ß, {\ae}→æ, {\oe}→œ, {\aa}→å
    .replace(/\{\\ss\}/g, 'ß')
    .replace(/\{\\ae\}/gi, (m) => m[2] === 'A' ? 'Æ' : 'æ')
    .replace(/\{\\oe\}/gi, (m) => m[2] === 'O' ? 'Œ' : 'œ')
    .replace(/\{\\aa\}/gi, (m) => m[2] === 'A' ? 'Å' : 'å')
    // Em dash and en dash
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    // Strip remaining braces (including double-brace quoting {{…}})
    .replace(/[{}]/g, '');
}

/**
 * Parse a BibTeX AUTHOR string into an array of { last, initials } objects.
 * Handles both "Last, First and Last2, First2" and "First Last and First2 Last2".
 */
function parseAuthors(authorStr) {
  if (!authorStr) return [];
  return decodeBibtex(authorStr)
    .split(/\s+and\s+/i)
    .map(a => {
      a = a.trim();
      if (a.includes(',')) {
        // "Last, First Middle"
        const [last, rest] = a.split(',');
        const initials = (rest || '').trim().split(/\s+/)
          .map(n => n[0] ? n[0].toUpperCase() + '.' : '')
          .join(' ');
        return { last: last.trim(), initials };
      } else {
        // "First Last" — take last word as surname
        const parts = a.split(/\s+/);
        const last = parts.pop() || a;
        const initials = parts.map(n => n[0] ? n[0].toUpperCase() + '.' : '').join(' ');
        return { last, initials };
      }
    });
}

/**
 * APA 7th in-text citation: (Lakens, 2022) / (Lakens & Caldwell, 2022) / (Lakens et al., 2022)
 */
export function formatApaInText(entryTags) {
  const { AUTHOR, YEAR } = entryTags || {};
  const authors = parseAuthors(AUTHOR);
  const year = YEAR || 'n.d.';

  let authorPart;
  if (authors.length === 0) {
    authorPart = 'Unknown';
  } else if (authors.length === 1) {
    authorPart = authors[0].last;
  } else if (authors.length === 2) {
    authorPart = `${authors[0].last} & ${authors[1].last}`;
  } else {
    authorPart = `${authors[0].last} et al.`;
  }
  return `(${authorPart}, ${year})`;
}

/**
 * APA 7th full reference entry.
 * e.g.: Lakens, D. (2022). Improving your statistical inferences. PsyArXiv. https://doi.org/…
 */
export function formatApaReference(entryTags) {
  const { AUTHOR, YEAR, TITLE, JOURNAL, BOOKTITLE, VOLUME, NUMBER, PAGES, DOI, URL, PUBLISHER } = entryTags || {};
  const authors = parseAuthors(AUTHOR);
  const year = YEAR || 'n.d.';

  // Author list: Last, I., & Last2, I2.
  let authorStr = '';
  if (authors.length === 0) {
    authorStr = 'Unknown author';
  } else if (authors.length === 1) {
    authorStr = `${authors[0].last}, ${authors[0].initials}`;
  } else {
    const parts = authors.map((a, i) => {
      const name = `${a.last}, ${a.initials}`;
      return i === authors.length - 1 ? `& ${name}` : name;
    });
    authorStr = parts.join(', ');
  }

  const title = decodeBibtex(TITLE || '');
  const venue = decodeBibtex(JOURNAL || BOOKTITLE || '');

  let ref = `${authorStr} (${year}). ${title}.`;
  if (venue) {
    ref += ` <em>${venue}</em>`;
    if (VOLUME) ref += `, <em>${VOLUME}</em>`;
    if (NUMBER) ref += `(${NUMBER})`;
    if (PAGES) ref += `, ${PAGES.replace(/--/g, '–')}`;
    ref += '.';
  } else if (PUBLISHER) {
    ref += ` ${PUBLISHER}.`;
  }
  if (DOI) {
    ref += ` <a href="https://doi.org/${DOI}" target="_blank" rel="noopener">https://doi.org/${DOI}</a>`;
  } else if (URL) {
    ref += ` <a href="${URL}" target="_blank" rel="noopener">${URL}</a>`;
  }
  return ref;
}
