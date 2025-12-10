/**
 * Vocabulary and Concept Deduplication
 * Merges and deduplicates vocabulary/concept entries from multiple chunks
 * Supports:
 * - Language mode: multilingual vocabulary with native script, romanization, and definition
 * - Concept mode: technical terms with definitions and categories
 *
 * Enhanced deduplication using:
 * - Multi-key matching (native script + romanization)
 * - Normalized comparisons (diacritics, transliteration variants)
 * - Improved short definition handling
 */

import type { VocabularyEntry, ConceptEntry } from '@/types';
import {
  normalizeArabic,
  normalizeRomanization,
  normalizeDefinition,
} from './normalizer';

interface DeduplicatedEntry extends VocabularyEntry {
  occurrenceCount: number;
  pageNumbers: number[];
  allDefinitions: string[];
}

/**
 * Generate multiple deduplication keys for an entry
 * Uses both native script and romanization for cross-matching
 */
function getDeduplicationKeys(entry: VocabularyEntry): string[] {
  const keys: string[] = [];

  // Primary key: Normalized native script (most reliable for same language)
  if (entry.nativeScript) {
    const normalizedNative = normalizeArabic(entry.nativeScript);
    if (normalizedNative) {
      keys.push(`native:${normalizedNative}`);
    }
  }

  // Secondary key: Normalized romanization (handles transliteration variants)
  if (entry.romanization) {
    const normalizedRoman = normalizeRomanization(entry.romanization);
    if (normalizedRoman) {
      keys.push(`roman:${normalizedRoman}`);
    }
  }

  // Fallback: Use term if no other identifiers
  if (keys.length === 0 && entry.term) {
    const normalizedTerm = entry.term.toLowerCase().trim();
    if (normalizedTerm) {
      keys.push(`term:${normalizedTerm}`);
    }
  }

  return keys;
}

/**
 * Calculate Jaccard similarity between two strings
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 0));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 0));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  return intersection.size / union.size;
}

/**
 * Enhanced definition similarity check
 * Handles short definitions better than pure Jaccard
 */
function areSimilarDefinitions(def1: string, def2: string): boolean {
  const norm1 = normalizeDefinition(def1);
  const norm2 = normalizeDefinition(def2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // Empty check
  if (!norm1 || !norm2) return false;

  // One contains the other (e.g., "better" vs "better/best", "to eat" vs "eat")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Split into words
  const words1 = norm1.split(' ').filter(w => w.length > 1);
  const words2 = norm2.split(' ').filter(w => w.length > 1);

  // Short definition special handling (1-2 words)
  if (words1.length <= 2 || words2.length <= 2) {
    // For very short definitions, check if any significant word matches
    const significantWords1 = words1.filter(w => w.length > 2);
    const significantWords2 = words2.filter(w => w.length > 2);

    if (significantWords1.length === 0 || significantWords2.length === 0) {
      // Single short words - use looser matching
      return norm1[0] === norm2[0] && Math.abs(norm1.length - norm2.length) <= 3;
    }

    // Check for any overlapping significant words
    const overlap = significantWords1.filter(w => significantWords2.includes(w)).length;
    return overlap > 0;
  }

  // Standard Jaccard for longer definitions (lowered threshold)
  return jaccardSimilarity(def1, def2) >= 0.5;
}

/**
 * Count how many optional fields an entry has
 * Higher is better (more complete entry)
 */
function countFields(entry: VocabularyEntry): number {
  let count = 0;
  if (entry.nativeScript) count++;
  if (entry.romanization) count++;
  if (entry.definition) count++;
  return count;
}

/**
 * Merge definitions if they're complementary
 * Returns merged definition or the better one
 */
function mergeDefinitions(def1: string, def2: string): string {
  const norm1 = normalizeDefinition(def1);
  const norm2 = normalizeDefinition(def2);

  // Same after normalization - keep original (might have better formatting)
  if (norm1 === norm2) return def1.length >= def2.length ? def1 : def2;

  // One contains the other
  if (norm1.includes(norm2)) return def1;
  if (norm2.includes(norm1)) return def2;

  // Both short - combine them
  if (def1.length < 40 && def2.length < 40) {
    // Check if they're truly different meanings
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const overlap = Array.from(words1).filter(w => words2.has(w)).length;
    const totalUnique = new Set([...Array.from(words1), ...Array.from(words2)]).size;

    // If less than 50% overlap, combine
    if (overlap / totalUnique < 0.5) {
      return `${def1}, ${def2}`;
    }
  }

  // Return the longer/more complete definition
  return def1.length >= def2.length ? def1 : def2;
}

/**
 * Merge two entries, preferring the more complete one
 */
function mergeEntries(existing: DeduplicatedEntry, newEntry: VocabularyEntry): void {
  existing.occurrenceCount++;

  // Track page numbers
  if (newEntry.pageNumber && !existing.pageNumbers.includes(newEntry.pageNumber)) {
    existing.pageNumbers.push(newEntry.pageNumber);
  }

  // Track all definitions seen
  const normNewDef = normalizeDefinition(newEntry.definition);
  if (!existing.allDefinitions.some(d => normalizeDefinition(d) === normNewDef)) {
    existing.allDefinitions.push(newEntry.definition);
  }

  const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const existingConfidence = confidenceOrder[existing.confidence] || 0;
  const newConfidence = confidenceOrder[newEntry.confidence] || 0;

  // Fill in missing fields from new entry
  if (!existing.nativeScript && newEntry.nativeScript) {
    existing.nativeScript = newEntry.nativeScript;
  }
  if (!existing.romanization && newEntry.romanization) {
    existing.romanization = newEntry.romanization;
  }

  // Update term to match best available identifier
  existing.term = existing.romanization || existing.nativeScript || existing.term;

  // Merge or update definition based on confidence
  if (newConfidence > existingConfidence) {
    existing.definition = newEntry.definition;
    existing.confidence = newEntry.confidence;
  } else if (newConfidence === existingConfidence) {
    // Same confidence - merge definitions
    existing.definition = mergeDefinitions(existing.definition, newEntry.definition);

    // Prefer entry with more fields
    if (countFields(newEntry) > countFields(existing)) {
      if (newEntry.nativeScript) existing.nativeScript = newEntry.nativeScript;
      if (newEntry.romanization) existing.romanization = newEntry.romanization;
    }
  } else {
    // New has lower confidence - still try to merge definitions
    existing.definition = mergeDefinitions(existing.definition, newEntry.definition);
  }
}

/**
 * Create a deduplicated entry from a vocabulary entry
 */
function createDeduplicatedEntry(entry: VocabularyEntry): DeduplicatedEntry {
  return {
    ...entry,
    term: entry.romanization || entry.nativeScript || entry.term,
    occurrenceCount: 1,
    pageNumbers: entry.pageNumber ? [entry.pageNumber] : [],
    allDefinitions: [entry.definition],
  };
}

/**
 * Deduplicate vocabulary entries using multi-key matching
 */
export function deduplicateVocabulary(
  entries: VocabularyEntry[]
): VocabularyEntry[] {
  // Map: primary key -> deduplicated entry
  const keyToEntry = new Map<string, DeduplicatedEntry>();
  // Map: any key -> primary key (for cross-referencing)
  const keyToPrimaryKey = new Map<string, string>();

  for (const entry of entries) {
    const keys = getDeduplicationKeys(entry);
    if (keys.length === 0) continue;

    // Find if any key matches an existing entry
    let primaryKey: string | null = null;
    for (const key of keys) {
      if (keyToPrimaryKey.has(key)) {
        primaryKey = keyToPrimaryKey.get(key)!;
        break;
      }
    }

    if (primaryKey) {
      // Found matching entry - merge
      const existing = keyToEntry.get(primaryKey)!;

      // Verify definitions are similar enough (or just trust the key match)
      const defsSimilar = areSimilarDefinitions(existing.definition, entry.definition);

      if (defsSimilar) {
        mergeEntries(existing, entry);

        // Register all new keys to point to this primary key
        for (const key of keys) {
          if (!keyToPrimaryKey.has(key)) {
            keyToPrimaryKey.set(key, primaryKey);
          }
        }
      } else {
        // Same term but different meaning - check confidence
        const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        if ((confidenceOrder[entry.confidence] || 0) > (confidenceOrder[existing.confidence] || 0)) {
          // Higher confidence - update the entry
          mergeEntries(existing, entry);
        }
        // Otherwise keep existing (first-seen priority for equal/lower confidence)
      }
    } else {
      // New unique entry
      primaryKey = keys[0];
      keyToEntry.set(primaryKey, createDeduplicatedEntry(entry));

      // Register all keys to point to this primary key
      for (const key of keys) {
        keyToPrimaryKey.set(key, primaryKey);
      }
    }
  }

  // Convert back to array and sort
  return Array.from(keyToEntry.values())
    .map((deduped): VocabularyEntry => ({
      nativeScript: deduped.nativeScript,
      romanization: deduped.romanization,
      definition: deduped.definition,
      confidence: deduped.confidence,
      term: deduped.term,
      pageNumber: deduped.pageNumbers.length > 0 ? deduped.pageNumbers[0] : undefined,
    }))
    .sort((a, b) => {
      // Sort by romanization if available, otherwise by term
      const aSort = a.romanization || a.term || '';
      const bSort = b.romanization || b.term || '';
      return aSort.localeCompare(bSort);
    });
}

/**
 * Merge vocabulary from multiple extraction results
 */
export function mergeVocabulary(
  ...vocabularyArrays: VocabularyEntry[][]
): VocabularyEntry[] {
  const allEntries = vocabularyArrays.flat();
  return deduplicateVocabulary(allEntries);
}

// ============================================================================
// CONCEPT DEDUPLICATION (for textbook concepts)
// ============================================================================

interface DeduplicatedConcept extends ConceptEntry {
  occurrenceCount: number;
}

/**
 * Normalize a concept term for comparison
 */
function normalizeConceptTerm(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/i, '') // Remove articles
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Merge two concept entries, preferring the more complete one
 */
function mergeConceptEntries(existing: DeduplicatedConcept, newEntry: ConceptEntry): void {
  existing.occurrenceCount++;

  const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const existingConfidence = confidenceOrder[existing.confidence] || 0;
  const newConfidence = confidenceOrder[newEntry.confidence] || 0;

  // If new entry has category and existing doesn't, use new category
  if (!existing.category && newEntry.category) {
    existing.category = newEntry.category;
  }

  // If new entry has higher confidence, update definition
  if (newConfidence > existingConfidence) {
    existing.definition = newEntry.definition;
    existing.confidence = newEntry.confidence;
    if (newEntry.category) {
      existing.category = newEntry.category;
    }
  } else if (newConfidence === existingConfidence && newEntry.definition.length > existing.definition.length) {
    // Same confidence but longer definition - might be more complete
    existing.definition = newEntry.definition;
  }
}

/**
 * Deduplicate concept entries
 */
export function deduplicateConcepts(
  entries: ConceptEntry[]
): ConceptEntry[] {
  const termMap = new Map<string, DeduplicatedConcept>();

  for (const entry of entries) {
    const normalizedTerm = normalizeConceptTerm(entry.term);

    if (!normalizedTerm) continue; // Skip entries without terms

    if (termMap.has(normalizedTerm)) {
      const existing = termMap.get(normalizedTerm)!;

      // Check if definitions are similar enough to consider duplicate
      const isDuplicate = areSimilarDefinitions(
        existing.definition,
        entry.definition
      );

      if (isDuplicate) {
        // Merge entries
        mergeConceptEntries(existing, entry);
      } else {
        // Different definition - update if higher confidence
        const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        if ((confidenceOrder[entry.confidence] || 0) > (confidenceOrder[existing.confidence] || 0)) {
          mergeConceptEntries(existing, entry);
        }
      }
    } else {
      termMap.set(normalizedTerm, {
        ...entry,
        occurrenceCount: 1,
      });
    }
  }

  // Convert back to array and sort alphabetically by term
  return Array.from(termMap.values())
    .map((deduped): ConceptEntry => ({
      term: deduped.term,
      definition: deduped.definition,
      category: deduped.category,
      confidence: deduped.confidence,
      pageNumber: deduped.pageNumber,
    }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * Merge concepts from multiple extraction results
 */
export function mergeConcepts(
  ...conceptArrays: ConceptEntry[][]
): ConceptEntry[] {
  const allEntries = conceptArrays.flat();
  return deduplicateConcepts(allEntries);
}
