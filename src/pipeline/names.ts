// Deterministic, locale-independent name normalization (DESIGN §27).
//
// `normalizeName` produces the canonical `name_normalized` string
// ("Kenneth Walker III" -> "kenneth walker"): lowercased, diacritics stripped,
// generational suffixes removed, punctuation collapsed, single-spaced. It is
// used for display-independent comparison and for detecting name collisions —
// it is NEVER used on its own to merge two players (DESIGN §27: name matching
// is a suggestion, never an auto-merge).
//
// `collisionKey` removes internal spaces so "A.J. Brown" and "AJ Brown"
// collapse to one key for collision REPORTING only.

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Explicit unicode range for combining diacritical marks (U+0300–U+036F),
// written without a literal control character so source stays ASCII-clean.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SUFFIXES.has(w))
    .join(' ');
}

export function collisionKey(name: string): string {
  return normalizeName(name).replace(/ /g, '');
}
