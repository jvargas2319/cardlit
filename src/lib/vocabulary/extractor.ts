/**
 * Vocabulary and Concept Extraction Service
 * Orchestrates LLM-based extraction from text
 * Supports two modes:
 * - language: Extract vocabulary with native script + romanization + definition
 * - concept: Extract key terms and definitions from textbooks
 */

import { getOpenRouterClient } from '@/lib/llm/openrouter';
import {
  SYSTEM_PROMPT,
  CONCEPT_SYSTEM_PROMPT,
  buildVocabularyPrompt,
  buildConceptPrompt,
  parseVocabularyResponse,
  parseConceptResponse,
} from '@/lib/llm/prompts';
import { chunkText, chunkPageTexts, type TextChunk } from './chunker';
import { deduplicateVocabulary, deduplicateConcepts } from './deduplicator';
import { validateExtractedVocabulary, validateExtractedConcepts, type ValidationStats } from './validator';
import type { VocabularyEntry, ConceptEntry, ExtractedPage, ExtractionMode } from '@/types';

export interface ExtractionResult {
  vocabulary: VocabularyEntry[];
  concepts: ConceptEntry[];
  mode: ExtractionMode;
  stats: {
    totalChunks: number;
    processedChunks: number;
    failedChunks: number;
    rawEntriesFound: number;
    deduplicatedEntries: number;
    // Validation stats
    validatedEntries: number;
    rejectedHallucinations: number;
    exactMatches: number;
    fuzzyMatches: number;
  };
  errors: string[];
}

/**
 * Extract vocabulary from a single text chunk (language mode)
 * Includes source text validation to filter out hallucinations
 */
async function extractVocabularyFromChunk(
  chunk: TextChunk,
  totalChunks: number
): Promise<{ vocabulary: VocabularyEntry[]; error?: string; validationStats?: ValidationStats }> {
  try {
    const client = getOpenRouterClient();

    const prompt = buildVocabularyPrompt(chunk.text, {
      current: chunk.index + 1,
      total: totalChunks,
    });

    const response = await client.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);

    const parsedVocabulary = parseVocabularyResponse(response);

    // Convert to VocabularyEntry type and add page numbers
    const rawVocabulary: VocabularyEntry[] = parsedVocabulary.map(v => ({
      ...v,
      pageNumber: chunk.startPage,
    }));

    // VALIDATION: Filter out hallucinated entries by checking against source text
    const { valid, rejected, stats } = validateExtractedVocabulary(
      rawVocabulary,
      chunk.text,
      {
        fuzzyThreshold: 0.7,   // Allow for OCR errors
        minMatchScore: 0.5,    // Be somewhat lenient given OCR quality
        logRejections: true,
      }
    );

    if (rejected.length > 0) {
      console.log(`[EXTRACT] Chunk ${chunk.index + 1}: Rejected ${rejected.length}/${rawVocabulary.length} entries as hallucinations`);
    }

    return { vocabulary: valid, validationStats: stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to extract vocabulary from chunk ${chunk.index}:`, errorMessage);
    return { vocabulary: [], error: errorMessage };
  }
}

/**
 * Extract concepts from a single text chunk (concept mode)
 * Includes source text validation to filter out hallucinations
 */
async function extractConceptsFromChunk(
  chunk: TextChunk,
  totalChunks: number
): Promise<{ concepts: ConceptEntry[]; error?: string; validationStats?: ValidationStats }> {
  try {
    const client = getOpenRouterClient();

    const prompt = buildConceptPrompt(chunk.text, {
      current: chunk.index + 1,
      total: totalChunks,
    });

    const response = await client.chat([
      { role: 'system', content: CONCEPT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);

    const parsedConcepts = parseConceptResponse(response);

    // Add page numbers
    const rawConcepts: ConceptEntry[] = parsedConcepts.map(c => ({
      ...c,
      pageNumber: chunk.startPage,
    }));

    // VALIDATION: Filter out hallucinated entries by checking against source text
    const { valid, rejected, stats } = validateExtractedConcepts(
      rawConcepts,
      chunk.text,
      {
        fuzzyThreshold: 0.7,   // Allow for OCR errors
        minMatchScore: 0.5,    // Be somewhat lenient given OCR quality
        logRejections: true,
      }
    );

    if (rejected.length > 0) {
      console.log(`[EXTRACT] Chunk ${chunk.index + 1}: Rejected ${rejected.length}/${rawConcepts.length} concepts as hallucinations`);
    }

    return { concepts: valid, validationStats: stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to extract concepts from chunk ${chunk.index}:`, errorMessage);
    return { concepts: [], error: errorMessage };
  }
}

/**
 * Extract vocabulary from plain text (language mode)
 */
export async function extractVocabularyFromText(
  text: string,
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  const { maxTokensPerChunk = 5000, onProgress } = options;

  const chunks = chunkText(text, { maxTokens: maxTokensPerChunk });
  const allVocabulary: VocabularyEntry[] = [];
  const errors: string[] = [];
  let processedChunks = 0;
  let failedChunks = 0;

  // Aggregate validation stats
  let totalValidated = 0;
  let totalRejected = 0;
  let totalExactMatches = 0;
  let totalFuzzyMatches = 0;

  for (const chunk of chunks) {
    onProgress?.(chunk.index + 1, chunks.length);

    const result = await extractVocabularyFromChunk(chunk, chunks.length);

    if (result.error) {
      errors.push(`Chunk ${chunk.index + 1}: ${result.error}`);
      failedChunks++;
    } else {
      allVocabulary.push(...result.vocabulary);
      processedChunks++;

      // Aggregate validation stats from this chunk
      if (result.validationStats) {
        totalValidated += result.validationStats.validated;
        totalRejected += result.validationStats.rejected;
        totalExactMatches += result.validationStats.exactMatches;
        totalFuzzyMatches += result.validationStats.fuzzyMatches;
      }
    }
  }

  const deduplicated = deduplicateVocabulary(allVocabulary);

  return {
    vocabulary: deduplicated,
    concepts: [],
    mode: 'language',
    stats: {
      totalChunks: chunks.length,
      processedChunks,
      failedChunks,
      rawEntriesFound: totalValidated + totalRejected, // Before validation
      deduplicatedEntries: deduplicated.length,
      validatedEntries: totalValidated,
      rejectedHallucinations: totalRejected,
      exactMatches: totalExactMatches,
      fuzzyMatches: totalFuzzyMatches,
    },
    errors,
  };
}

/**
 * Extract concepts from plain text (concept mode)
 */
export async function extractConceptsFromText(
  text: string,
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  const { maxTokensPerChunk = 5000, onProgress } = options;

  const chunks = chunkText(text, { maxTokens: maxTokensPerChunk });
  const allConcepts: ConceptEntry[] = [];
  const errors: string[] = [];
  let processedChunks = 0;
  let failedChunks = 0;

  // Aggregate validation stats
  let totalValidated = 0;
  let totalRejected = 0;
  let totalExactMatches = 0;
  let totalFuzzyMatches = 0;

  for (const chunk of chunks) {
    onProgress?.(chunk.index + 1, chunks.length);

    const result = await extractConceptsFromChunk(chunk, chunks.length);

    if (result.error) {
      errors.push(`Chunk ${chunk.index + 1}: ${result.error}`);
      failedChunks++;
    } else {
      allConcepts.push(...result.concepts);
      processedChunks++;

      // Aggregate validation stats from this chunk
      if (result.validationStats) {
        totalValidated += result.validationStats.validated;
        totalRejected += result.validationStats.rejected;
        totalExactMatches += result.validationStats.exactMatches;
        totalFuzzyMatches += result.validationStats.fuzzyMatches;
      }
    }
  }

  const deduplicated = deduplicateConcepts(allConcepts);

  return {
    vocabulary: [],
    concepts: deduplicated,
    mode: 'concept',
    stats: {
      totalChunks: chunks.length,
      processedChunks,
      failedChunks,
      rawEntriesFound: totalValidated + totalRejected, // Before validation
      deduplicatedEntries: deduplicated.length,
      validatedEntries: totalValidated,
      rejectedHallucinations: totalRejected,
      exactMatches: totalExactMatches,
      fuzzyMatches: totalFuzzyMatches,
    },
    errors,
  };
}

/**
 * Extract vocabulary from page-based text (OCR results) - language mode
 */
export async function extractVocabularyFromPages(
  pages: ExtractedPage[],
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  const { maxTokensPerChunk = 5000, onProgress } = options;

  const chunks = chunkPageTexts(pages, { maxTokens: maxTokensPerChunk });
  const allVocabulary: VocabularyEntry[] = [];
  const errors: string[] = [];
  let processedChunks = 0;
  let failedChunks = 0;

  // Aggregate validation stats
  let totalValidated = 0;
  let totalRejected = 0;
  let totalExactMatches = 0;
  let totalFuzzyMatches = 0;

  for (const chunk of chunks) {
    onProgress?.(chunk.index + 1, chunks.length);

    const result = await extractVocabularyFromChunk(chunk, chunks.length);

    if (result.error) {
      errors.push(`Chunk ${chunk.index + 1} (pages ${chunk.startPage}-${chunk.endPage}): ${result.error}`);
      failedChunks++;
    } else {
      allVocabulary.push(...result.vocabulary);
      processedChunks++;

      // Aggregate validation stats from this chunk
      if (result.validationStats) {
        totalValidated += result.validationStats.validated;
        totalRejected += result.validationStats.rejected;
        totalExactMatches += result.validationStats.exactMatches;
        totalFuzzyMatches += result.validationStats.fuzzyMatches;
      }
    }
  }

  const deduplicated = deduplicateVocabulary(allVocabulary);

  return {
    vocabulary: deduplicated,
    concepts: [],
    mode: 'language',
    stats: {
      totalChunks: chunks.length,
      processedChunks,
      failedChunks,
      rawEntriesFound: totalValidated + totalRejected, // Before validation
      deduplicatedEntries: deduplicated.length,
      validatedEntries: totalValidated,
      rejectedHallucinations: totalRejected,
      exactMatches: totalExactMatches,
      fuzzyMatches: totalFuzzyMatches,
    },
    errors,
  };
}

/**
 * Extract concepts from page-based text (OCR results) - concept mode
 */
export async function extractConceptsFromPages(
  pages: ExtractedPage[],
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  const { maxTokensPerChunk = 5000, onProgress } = options;

  const chunks = chunkPageTexts(pages, { maxTokens: maxTokensPerChunk });
  const allConcepts: ConceptEntry[] = [];
  const errors: string[] = [];
  let processedChunks = 0;
  let failedChunks = 0;

  // Aggregate validation stats
  let totalValidated = 0;
  let totalRejected = 0;
  let totalExactMatches = 0;
  let totalFuzzyMatches = 0;

  for (const chunk of chunks) {
    onProgress?.(chunk.index + 1, chunks.length);

    const result = await extractConceptsFromChunk(chunk, chunks.length);

    if (result.error) {
      errors.push(`Chunk ${chunk.index + 1} (pages ${chunk.startPage}-${chunk.endPage}): ${result.error}`);
      failedChunks++;
    } else {
      allConcepts.push(...result.concepts);
      processedChunks++;

      // Aggregate validation stats from this chunk
      if (result.validationStats) {
        totalValidated += result.validationStats.validated;
        totalRejected += result.validationStats.rejected;
        totalExactMatches += result.validationStats.exactMatches;
        totalFuzzyMatches += result.validationStats.fuzzyMatches;
      }
    }
  }

  const deduplicated = deduplicateConcepts(allConcepts);

  return {
    vocabulary: [],
    concepts: deduplicated,
    mode: 'concept',
    stats: {
      totalChunks: chunks.length,
      processedChunks,
      failedChunks,
      rawEntriesFound: totalValidated + totalRejected, // Before validation
      deduplicatedEntries: deduplicated.length,
      validatedEntries: totalValidated,
      rejectedHallucinations: totalRejected,
      exactMatches: totalExactMatches,
      fuzzyMatches: totalFuzzyMatches,
    },
    errors,
  };
}

/**
 * Unified extraction function - extracts based on mode
 */
export async function extractFromText(
  text: string,
  mode: ExtractionMode = 'language',
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  if (mode === 'concept') {
    return extractConceptsFromText(text, options);
  }
  return extractVocabularyFromText(text, options);
}

/**
 * Unified extraction function for pages - extracts based on mode
 */
export async function extractFromPages(
  pages: ExtractedPage[],
  mode: ExtractionMode = 'language',
  options: {
    maxTokensPerChunk?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractionResult> {
  if (mode === 'concept') {
    return extractConceptsFromPages(pages, options);
  }
  return extractVocabularyFromPages(pages, options);
}
