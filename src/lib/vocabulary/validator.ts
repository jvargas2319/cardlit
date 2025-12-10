/**
 * Source Text Validator for Vocabulary/Concept Extraction
 * Prevents LLM hallucinations by validating extracted entries against source text
 * Uses fuzzy matching to handle OCR errors
 */

import type { VocabularyEntry, ConceptEntry } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface SourceTokens {
  /** Arabic, Chinese, Japanese, Korean, etc. tokens */
  nonLatinTokens: string[];
  /** Latin/romanization tokens */
  latinTokens: string[];
  /** Normalized full text for substring matching */
  normalizedFull: string;
  /** Original source text */
  original: string;
}

export interface SourceMatch {
  field: 'nativeScript' | 'romanization' | 'term' | 'definition';
  matchedText: string;
  sourcePosition: number;
  similarity: number;
}

export interface ValidationResult {
  entry: VocabularyEntry | ConceptEntry;
  isValid: boolean;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'not_found';
  matchScore: number;
  sourceMatches: SourceMatch[];
  adjustedConfidence: 'high' | 'medium' | 'low';
}

export interface ValidationStats {
  total: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
  rejected: number;
}

export interface ValidationOptions {
  /** Fuzzy matching threshold (0.0-1.0), default 0.75 */
  fuzzyThreshold: number;
  /** If true, native script MUST be found in source */
  requireNativeMatch: boolean;
  /** If true, romanization MUST be found in source */
  requireRomanMatch: boolean;
  /** Minimum score to consider valid, default 0.6 */
  minMatchScore: number;
  /** Log rejected entries for debugging */
  logRejections: boolean;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  fuzzyThreshold: 0.75,
  requireNativeMatch: false,
  requireRomanMatch: false,
  minMatchScore: 0.6,
  logRejections: true,
};

// ============================================================================
// Levenshtein Distance & Similarity
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Returns edit distance (lower = more similar)
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0.0 to 1.0) between two strings
 */
export function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - (distance / maxLen);
}

// ============================================================================
// Token Extraction from Source
// ============================================================================

/**
 * Extract non-Latin tokens (Arabic, Chinese, Japanese, Korean, Cyrillic, etc.)
 */
function extractNonLatinTokens(text: string): string[] {
  // Comprehensive regex for non-Latin scripts
  const nonLatinRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0590-\u05FF\u0900-\u097F\u0980-\u09FF\u0E00-\u0E7F]+/g;
  const matches = text.match(nonLatinRegex) || [];
  // Normalize and deduplicate
  return [...new Set(matches.map(m => normalizeArabic(m)))];
}

/**
 * Extract Latin tokens (potential romanizations)
 */
function extractLatinTokens(text: string): string[] {
  // Latin words including accented characters
  const latinRegex = /[a-zA-Z\u0100-\u017F\u1E00-\u1EFF''-]+/g;
  const matches = text.match(latinRegex) || [];
  // Filter out very short tokens and common English words
  const filtered = matches.filter(m => m.length >= 2);
  return [...new Set(filtered.map(m => normalizeRomanization(m)))];
}

/**
 * Normalize Arabic text for matching
 * Removes diacritics, normalizes similar letters
 */
function normalizeArabic(text: string): string {
  return text
    // Remove Arabic diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize alef variants
    .replace(/[\u0622\u0623\u0625\u0627]/g, '\u0627')
    // Normalize taa marbuta
    .replace(/\u0629/g, '\u0647')
    // Normalize yaa variants
    .replace(/\u0649/g, '\u064A')
    .trim();
}

/**
 * Normalize romanization for matching
 */
function normalizeRomanization(text: string): string {
  return text
    .toLowerCase()
    // Remove common transliteration markers
    .replace(/[''ʿʾ`]/g, '')
    // Normalize common variations
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .trim();
}

/**
 * Extract all meaningful tokens from source text for matching
 */
export function extractSourceTokens(sourceText: string): SourceTokens {
  return {
    nonLatinTokens: extractNonLatinTokens(sourceText),
    latinTokens: extractLatinTokens(sourceText),
    normalizedFull: sourceText.toLowerCase().replace(/\s+/g, ' ').trim(),
    original: sourceText,
  };
}

// ============================================================================
// Matching Functions
// ============================================================================

interface MatchResult {
  matchedToken: string;
  score: number;
}

/**
 * Find best matching token in array using fuzzy matching
 */
function findBestMatch(
  needle: string,
  haystack: string[],
  threshold: number
): MatchResult {
  let bestMatch: MatchResult = { matchedToken: '', score: 0 };

  for (const token of haystack) {
    // Exact match
    if (token === needle) {
      return { matchedToken: token, score: 1.0 };
    }

    // Fuzzy match
    const score = similarityScore(needle, token);
    if (score > bestMatch.score && score >= threshold) {
      bestMatch = { matchedToken: token, score };
    }
  }

  return bestMatch;
}

/**
 * Check if needle exists as substring in source (for multi-word terms)
 */
function findSubstringMatch(needle: string, source: string, threshold: number): MatchResult {
  const normalizedNeedle = needle.toLowerCase().trim();
  const normalizedSource = source.toLowerCase();

  // Exact substring match
  if (normalizedSource.includes(normalizedNeedle)) {
    return { matchedToken: needle, score: 1.0 };
  }

  // Try fuzzy matching against sliding window
  const words = normalizedSource.split(/\s+/);
  const needleWordCount = normalizedNeedle.split(/\s+/).length;

  for (let i = 0; i <= words.length - needleWordCount; i++) {
    const windowPhrase = words.slice(i, i + needleWordCount).join(' ');
    const score = similarityScore(normalizedNeedle, windowPhrase);
    if (score >= threshold) {
      return { matchedToken: windowPhrase, score };
    }
  }

  return { matchedToken: '', score: 0 };
}

// ============================================================================
// Entry Validation
// ============================================================================

/**
 * Validate a single vocabulary entry against source text
 */
export function validateVocabularyEntry(
  entry: VocabularyEntry,
  sourceTokens: SourceTokens,
  options: ValidationOptions = DEFAULT_OPTIONS
): ValidationResult {
  const matches: SourceMatch[] = [];
  let totalScore = 0;
  let fieldCount = 0;

  // Validate native script
  if (entry.nativeScript && entry.nativeScript !== 'EMPTY') {
    const normalizedNative = normalizeArabic(entry.nativeScript);
    const nativeMatch = findBestMatch(
      normalizedNative,
      sourceTokens.nonLatinTokens,
      options.fuzzyThreshold
    );

    if (nativeMatch.score > 0) {
      matches.push({
        field: 'nativeScript',
        matchedText: nativeMatch.matchedToken,
        sourcePosition: sourceTokens.original.indexOf(nativeMatch.matchedToken),
        similarity: nativeMatch.score,
      });
      totalScore += nativeMatch.score;
    } else if (options.requireNativeMatch) {
      return createInvalidResult(entry, matches);
    }
    fieldCount++;
  }

  // Validate romanization
  if (entry.romanization && entry.romanization !== 'EMPTY') {
    const normalizedRoman = normalizeRomanization(entry.romanization);
    const romanMatch = findBestMatch(
      normalizedRoman,
      sourceTokens.latinTokens,
      options.fuzzyThreshold
    );

    if (romanMatch.score > 0) {
      matches.push({
        field: 'romanization',
        matchedText: romanMatch.matchedToken,
        sourcePosition: sourceTokens.original.toLowerCase().indexOf(romanMatch.matchedToken.toLowerCase()),
        similarity: romanMatch.score,
      });
      totalScore += romanMatch.score;
    } else if (options.requireRomanMatch) {
      return createInvalidResult(entry, matches);
    }
    fieldCount++;
  }

  // If no fields to validate, check the term field
  if (fieldCount === 0 && entry.term) {
    const termMatch = findSubstringMatch(entry.term, sourceTokens.normalizedFull, options.fuzzyThreshold);
    if (termMatch.score > 0) {
      matches.push({
        field: 'term',
        matchedText: termMatch.matchedToken,
        sourcePosition: sourceTokens.normalizedFull.indexOf(termMatch.matchedToken.toLowerCase()),
        similarity: termMatch.score,
      });
      totalScore = termMatch.score;
      fieldCount = 1;
    }
  }

  // Calculate average score
  const avgScore = fieldCount > 0 ? totalScore / fieldCount : 0;
  const isValid = avgScore >= options.minMatchScore && matches.length > 0;

  // Determine match type
  let matchType: ValidationResult['matchType'] = 'not_found';
  if (matches.length > 0) {
    const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;
    if (avgSimilarity >= 0.95) matchType = 'exact';
    else if (avgSimilarity >= options.fuzzyThreshold) matchType = 'fuzzy';
    else matchType = 'partial';
  }

  // Adjust confidence based on match quality
  const adjustedConfidence = calculateAdjustedConfidence(entry.confidence, avgScore);

  return {
    entry,
    isValid,
    matchType,
    matchScore: avgScore,
    sourceMatches: matches,
    adjustedConfidence,
  };
}

/**
 * Validate a single concept entry against source text
 */
export function validateConceptEntry(
  entry: ConceptEntry,
  sourceTokens: SourceTokens,
  options: ValidationOptions = DEFAULT_OPTIONS
): ValidationResult {
  const matches: SourceMatch[] = [];

  // Check if term appears in source
  const termMatch = findSubstringMatch(entry.term, sourceTokens.normalizedFull, options.fuzzyThreshold);

  if (termMatch.score > 0) {
    matches.push({
      field: 'term',
      matchedText: termMatch.matchedToken,
      sourcePosition: sourceTokens.normalizedFull.indexOf(termMatch.matchedToken.toLowerCase()),
      similarity: termMatch.score,
    });
  }

  // Also check in non-Latin tokens (for Arabic/foreign terms)
  if (matches.length === 0) {
    const nonLatinMatch = findBestMatch(
      normalizeArabic(entry.term),
      sourceTokens.nonLatinTokens,
      options.fuzzyThreshold
    );
    if (nonLatinMatch.score > 0) {
      matches.push({
        field: 'term',
        matchedText: nonLatinMatch.matchedToken,
        sourcePosition: sourceTokens.original.indexOf(nonLatinMatch.matchedToken),
        similarity: nonLatinMatch.score,
      });
    }
  }

  // Also check in Latin tokens
  if (matches.length === 0) {
    const latinMatch = findBestMatch(
      normalizeRomanization(entry.term),
      sourceTokens.latinTokens,
      options.fuzzyThreshold
    );
    if (latinMatch.score > 0) {
      matches.push({
        field: 'term',
        matchedText: latinMatch.matchedToken,
        sourcePosition: sourceTokens.original.toLowerCase().indexOf(latinMatch.matchedToken.toLowerCase()),
        similarity: latinMatch.score,
      });
    }
  }

  const isValid = matches.length > 0 && matches[0].similarity >= options.minMatchScore;
  const matchScore = matches.length > 0 ? matches[0].similarity : 0;

  let matchType: ValidationResult['matchType'] = 'not_found';
  if (matches.length > 0) {
    if (matchScore >= 0.95) matchType = 'exact';
    else if (matchScore >= options.fuzzyThreshold) matchType = 'fuzzy';
    else matchType = 'partial';
  }

  const adjustedConfidence = calculateAdjustedConfidence(entry.confidence, matchScore);

  return {
    entry,
    isValid,
    matchType,
    matchScore,
    sourceMatches: matches,
    adjustedConfidence,
  };
}

function createInvalidResult(entry: VocabularyEntry | ConceptEntry, matches: SourceMatch[]): ValidationResult {
  return {
    entry,
    isValid: false,
    matchType: 'not_found',
    matchScore: 0,
    sourceMatches: matches,
    adjustedConfidence: 'low',
  };
}

function calculateAdjustedConfidence(
  original: 'high' | 'medium' | 'low',
  matchScore: number
): 'high' | 'medium' | 'low' {
  // Downgrade confidence if match is poor
  if (matchScore < 0.7) return 'low';
  if (matchScore < 0.85) {
    if (original === 'high') return 'medium';
    return original;
  }
  return original;
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validate all extracted vocabulary entries against source text
 * Returns only valid entries with adjusted confidence
 */
export function validateExtractedVocabulary(
  entries: VocabularyEntry[],
  sourceText: string,
  options: Partial<ValidationOptions> = {}
): {
  valid: VocabularyEntry[];
  rejected: VocabularyEntry[];
  stats: ValidationStats;
} {
  const opts: ValidationOptions = { ...DEFAULT_OPTIONS, ...options };
  const sourceTokens = extractSourceTokens(sourceText);

  const valid: VocabularyEntry[] = [];
  const rejected: VocabularyEntry[] = [];
  const stats: ValidationStats = {
    total: entries.length,
    exactMatches: 0,
    fuzzyMatches: 0,
    partialMatches: 0,
    rejected: 0,
  };

  for (const entry of entries) {
    const result = validateVocabularyEntry(entry, sourceTokens, opts);

    if (result.isValid) {
      // Update entry with adjusted confidence
      valid.push({
        ...entry,
        confidence: result.adjustedConfidence,
      });

      // Update stats
      if (result.matchType === 'exact') stats.exactMatches++;
      else if (result.matchType === 'fuzzy') stats.fuzzyMatches++;
      else stats.partialMatches++;
    } else {
      rejected.push(entry);
      stats.rejected++;

      // Log rejected entries for debugging
      if (opts.logRejections) {
        const identifier = entry.nativeScript || entry.romanization || entry.term || 'unknown';
        console.log(`[VALIDATOR] Rejected vocabulary: "${identifier}" (${result.matchType}, score: ${result.matchScore.toFixed(2)})`);
      }
    }
  }

  return { valid, rejected, stats };
}

/**
 * Validate all extracted concept entries against source text
 * Returns only valid entries with adjusted confidence
 */
export function validateExtractedConcepts(
  entries: ConceptEntry[],
  sourceText: string,
  options: Partial<ValidationOptions> = {}
): {
  valid: ConceptEntry[];
  rejected: ConceptEntry[];
  stats: ValidationStats;
} {
  const opts: ValidationOptions = { ...DEFAULT_OPTIONS, ...options };
  const sourceTokens = extractSourceTokens(sourceText);

  const valid: ConceptEntry[] = [];
  const rejected: ConceptEntry[] = [];
  const stats: ValidationStats = {
    total: entries.length,
    exactMatches: 0,
    fuzzyMatches: 0,
    partialMatches: 0,
    rejected: 0,
  };

  for (const entry of entries) {
    const result = validateConceptEntry(entry, sourceTokens, opts);

    if (result.isValid) {
      valid.push({
        ...entry,
        confidence: result.adjustedConfidence,
      });

      if (result.matchType === 'exact') stats.exactMatches++;
      else if (result.matchType === 'fuzzy') stats.fuzzyMatches++;
      else stats.partialMatches++;
    } else {
      rejected.push(entry);
      stats.rejected++;

      if (opts.logRejections) {
        console.log(`[VALIDATOR] Rejected concept: "${entry.term}" (${result.matchType}, score: ${result.matchScore.toFixed(2)})`);
      }
    }
  }

  return { valid, rejected, stats };
}
