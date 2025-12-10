/**
 * Text normalization utilities for vocabulary deduplication
 * Handles Arabic diacritics, romanization variants, and definition normalization
 */

/**
 * Normalize Arabic text by removing diacritical marks (harakat)
 * Removes: fatha, kasra, damma, sukun, shadda, tanwin, etc.
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';

  return text
    // Normalize Unicode (decompose)
    .normalize('NFD')
    // Remove Arabic diacritical marks (U+064B to U+0652)
    // fatha, kasra, damma, fathatan, kasratan, dammatan, sukun, shadda
    .replace(/[\u064B-\u0652]/g, '')
    // Remove tatweel/kashida (stretching character)
    .replace(/\u0640/g, '')
    // Remove superscript alef
    .replace(/\u0670/g, '')
    // Normalize alef variants to plain alef
    .replace(/[\u0622\u0623\u0625\u0627]/g, '\u0627')
    // Normalize teh marbuta to heh
    .replace(/\u0629/g, '\u0647')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize romanization by standardizing transliteration variants
 * Handles common academic transliteration marks and variations
 */
export function normalizeRomanization(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Normalize ayn and hamza marks
    .replace(/[ʿʾ''`'ʻʼ]/g, "'")
    // Normalize long vowels (macron, acute, circumflex, etc.)
    .replace(/[āáàâăǎ]/g, 'a')
    .replace(/[ēéèêĕě]/g, 'e')
    .replace(/[īíìîĭǐ]/g, 'i')
    .replace(/[ōóòôŏǒ]/g, 'o')
    .replace(/[ūúùûŭǔ]/g, 'u')
    // Normalize emphatic consonants (underdot, overdot, etc.)
    .replace(/[ḍḏđ]/g, 'd')
    .replace(/[ṣṡśş]/g, 's')
    .replace(/[ṭṯţ]/g, 't')
    .replace(/[ẓżź]/g, 'z')
    .replace(/[ḥħ]/g, 'h')
    .replace(/[ġğ]/g, 'gh')
    .replace(/[ṛŗ]/g, 'r')
    .replace(/[ñń]/g, 'n')
    // Normalize common digraph variations
    .replace(/kh/g, 'kh')
    .replace(/sh/g, 'sh')
    .replace(/th/g, 'th')
    .replace(/dh/g, 'dh')
    // Remove hyphens often used in transliteration
    .replace(/-/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize definition text for comparison
 * Removes punctuation and normalizes whitespace
 */
export function normalizeDefinition(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Remove content in parentheses (often alternate spellings)
    .replace(/\([^)]*\)/g, '')
    // Remove punctuation except apostrophes in contractions
    .replace(/[^\w\s']/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains non-Latin script (Arabic, Chinese, etc.)
 */
export function containsNonLatinScript(text: string): boolean {
  if (!text) return false;
  // Check for Arabic, Chinese, Japanese, Korean, Cyrillic, etc.
  return /[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0400-\u04FF]/.test(text);
}

/**
 * Check if text appears to be English/Latin script only
 */
export function isLikelyEnglish(text: string): boolean {
  if (!text) return false;
  // Remove common transliteration marks and check if mostly Latin
  const cleaned = text.replace(/[ʿʾ''`āīūḍṣṭẓḥġ]/g, '');
  // Should be mostly Latin letters, spaces, and basic punctuation
  return /^[a-zA-Z\s.,;:!?'"()-]+$/.test(cleaned);
}

/**
 * Extract the base form of a word by removing common prefixes/suffixes
 * Useful for grouping related vocabulary
 */
export function getWordStem(text: string): string {
  if (!text) return '';

  let word = text.toLowerCase().trim();

  // Remove English articles
  word = word.replace(/^(the|a|an)\s+/i, '');

  // Remove common Arabic prefixes (al-, wa-, bi-, li-, etc.)
  word = word.replace(/^(al-?|wa-?|bi-?|li-?|fi-?)/i, '');

  return word;
}
