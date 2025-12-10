/**
 * CSV Generator for Anki Import
 * Generates CSV files in Anki-compatible format
 * Supports:
 * - Language mode: multilingual vocabulary with native script, romanization, and definition
 * - Concept mode: technical terms with definitions and categories
 */

import type { VocabularyEntry, ConceptEntry, ChapterVocabulary } from '@/types';

/**
 * Escape a value for CSV
 */
function escapeForCsv(value: string, separator: string = ';'): string {
  // Check if value needs quoting
  const needsQuoting =
    value.includes(separator) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return value;
}

/**
 * Build the front of the card (native script + romanization)
 * Format: "你好 (nǐ hǎo)" or just "nǐ hǎo" if no native script
 */
function buildFront(entry: VocabularyEntry): string {
  const native = entry.nativeScript?.trim();
  const roman = entry.romanization?.trim();

  if (native && roman) {
    // Both: "你好 (nǐ hǎo)"
    return `${native} (${roman})`;
  } else if (native) {
    // Only native script
    return native;
  } else if (roman) {
    // Only romanization
    return roman;
  } else {
    // Fallback to term
    return entry.term;
  }
}

/**
 * Generate CSV content for Anki import
 * Format: front<TAB>back
 * - Front: Native script + romanization (e.g., "你好 (nǐ hǎo)")
 * - Back: Definition (e.g., "Hello")
 */
export function generateAnkiCsv(
  vocabulary: VocabularyEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  const { separator = ';', includeHeader = false } = options;

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(['front', 'back'].join(separator));
  }

  for (const entry of vocabulary) {
    const front = escapeForCsv(buildFront(entry), separator);
    const back = escapeForCsv(entry.definition, separator);
    lines.push(`${front}${separator}${back}`);
  }

  return lines.join('\n');
}

/**
 * Generate CSV with three separate columns for maximum flexibility
 * Format: native<TAB>romanization<TAB>definition
 * User can map these to any Anki fields during import
 */
export function generateAnkiCsvThreeColumn(
  vocabulary: VocabularyEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  const { separator = ';', includeHeader = false } = options;

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(['native', 'romanization', 'definition'].join(separator));
  }

  for (const entry of vocabulary) {
    const native = escapeForCsv(entry.nativeScript || '', separator);
    const roman = escapeForCsv(entry.romanization || '', separator);
    const definition = escapeForCsv(entry.definition, separator);
    lines.push(`${native}${separator}${roman}${separator}${definition}`);
  }

  return lines.join('\n');
}

/**
 * Generate CSV for Excel with tab separator
 * Uses tab delimiter for UTF-16LE compatibility (encoding done at download time)
 * This is the most reliable format for Arabic/non-ASCII characters in Excel
 */
export function generateAnkiCsvWithBom(
  vocabulary: VocabularyEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  // Use tab separator for UTF-16LE compatibility with Excel
  const csv = generateAnkiCsv(vocabulary, { ...options, separator: '\t' });
  return csv;
}

/**
 * Generate three-column CSV for Excel with tab separator
 * Uses tab delimiter for UTF-16LE compatibility (encoding done at download time)
 */
export function generateAnkiCsvThreeColumnWithBom(
  vocabulary: VocabularyEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  // Use tab separator for UTF-16LE compatibility with Excel
  const csv = generateAnkiCsvThreeColumn(vocabulary, { ...options, separator: '\t' });
  return csv;
}

/**
 * Generate CSV as a downloadable blob
 */
export function generateCsvBlob(
  vocabulary: VocabularyEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
    includeBom?: boolean;
    threeColumn?: boolean;
  } = {}
): Blob {
  const { includeBom = true, threeColumn = false, ...csvOptions } = options;

  let content: string;
  if (threeColumn) {
    content = includeBom
      ? generateAnkiCsvThreeColumnWithBom(vocabulary, csvOptions)
      : generateAnkiCsvThreeColumn(vocabulary, csvOptions);
  } else {
    content = includeBom
      ? generateAnkiCsvWithBom(vocabulary, csvOptions)
      : generateAnkiCsv(vocabulary, csvOptions);
  }

  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}

// ============================================================================
// CONCEPT CSV GENERATION (for textbook concepts)
// ============================================================================

/**
 * Generate CSV for concepts (term + definition + category)
 * Format: TERM<TAB>DEFINITION<TAB>CATEGORY
 */
export function generateConceptCsv(
  concepts: ConceptEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  const { separator = ';', includeHeader = false } = options;

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(['term', 'definition', 'category'].join(separator));
  }

  for (const entry of concepts) {
    const term = escapeForCsv(entry.term, separator);
    const definition = escapeForCsv(entry.definition, separator);
    const category = escapeForCsv(entry.category || '', separator);
    lines.push(`${term}${separator}${definition}${separator}${category}`);
  }

  return lines.join('\n');
}

/**
 * Generate concept CSV with tab separator (for Excel/Anki compatibility)
 */
export function generateConceptCsvWithBom(
  concepts: ConceptEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  return generateConceptCsv(concepts, { ...options, separator: '\t' });
}

/**
 * Generate concept CSV as downloadable blob
 */
export function generateConceptCsvBlob(
  concepts: ConceptEntry[],
  options: {
    separator?: string;
    includeHeader?: boolean;
    includeBom?: boolean;
  } = {}
): Blob {
  const { includeBom = true, ...csvOptions } = options;

  const content = includeBom
    ? generateConceptCsvWithBom(concepts, csvOptions)
    : generateConceptCsv(concepts, csvOptions);

  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}

// ============================================================================
// CHAPTER-ORGANIZED CSV GENERATION
// ============================================================================

/**
 * Generate CSV organized by chapters with chapter headers as comments
 * Format:
 * # --- Chapter 1: Introduction (Pages 1-15) ---
 * 你好 (nǐ hǎo)\tHello
 * 再见 (zàijiàn)\tGoodbye
 *
 * # --- Chapter 2: Greetings (Pages 16-30) ---
 * ...
 */
export function generateChapterOrganizedCsv(
  chapterVocabulary: ChapterVocabulary[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  const { separator = '\t' } = options;

  const lines: string[] = [];

  for (const { chapter, vocabulary } of chapterVocabulary) {
    // Add chapter header as a comment
    const pageRange = chapter.endPage
      ? `Pages ${chapter.startPage}-${chapter.endPage}`
      : `Page ${chapter.startPage}+`;

    lines.push(`# --- ${chapter.title} (${pageRange}) ---`);

    // Add vocabulary entries for this chapter
    for (const entry of vocabulary) {
      const front = escapeForCsv(buildFront(entry), separator);
      const back = escapeForCsv(entry.definition, separator);
      lines.push(`${front}${separator}${back}`);
    }

    // Add empty line between chapters for readability
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate chapter-organized CSV with tab separator
 * Compatible with Excel and Anki import
 */
export function generateChapterOrganizedCsvWithBom(
  chapterVocabulary: ChapterVocabulary[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  return generateChapterOrganizedCsv(chapterVocabulary, { ...options, separator: '\t' });
}

/**
 * Generate three-column chapter-organized CSV
 * Format: native<TAB>romanization<TAB>definition with chapter headers
 */
export function generateChapterOrganizedCsvThreeColumn(
  chapterVocabulary: ChapterVocabulary[],
  options: {
    separator?: string;
    includeHeader?: boolean;
  } = {}
): string {
  const { separator = '\t', includeHeader = false } = options;

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(['native', 'romanization', 'definition'].join(separator));
  }

  for (const { chapter, vocabulary } of chapterVocabulary) {
    // Add chapter header as a comment
    const pageRange = chapter.endPage
      ? `Pages ${chapter.startPage}-${chapter.endPage}`
      : `Page ${chapter.startPage}+`;

    lines.push(`# --- ${chapter.title} (${pageRange}) ---`);

    // Add vocabulary entries for this chapter
    for (const entry of vocabulary) {
      const native = escapeForCsv(entry.nativeScript || '', separator);
      const roman = escapeForCsv(entry.romanization || '', separator);
      const definition = escapeForCsv(entry.definition, separator);
      lines.push(`${native}${separator}${roman}${separator}${definition}`);
    }

    // Add empty line between chapters
    lines.push('');
  }

  return lines.join('\n');
}
