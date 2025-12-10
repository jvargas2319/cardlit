/**
 * Chapter Detection for Vocabulary Organization
 * Detects chapter/section boundaries from OCR text using pattern matching
 * Organizes vocabulary by chapter for structured output
 */

import type { VocabularyEntry, ExtractedPage, Chapter, ChapterVocabulary } from '@/types';

/**
 * Patterns for detecting chapter headings in various languages
 */
const CHAPTER_PATTERNS: RegExp[] = [
  // English patterns
  /^(?:chapter|ch\.?)\s*(\d+|[ivxlcdm]+)(?:\s*[:\-–—.]\s*(.+))?$/im,
  /^(?:unit|lesson|module)\s*(\d+)(?:\s*[:\-–—.]\s*(.+))?$/im,
  /^(?:section|part)\s*(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:\-–—.]\s*(.+))?$/im,

  // Numbered headings like "1. Introduction" or "1 Introduction"
  /^(\d+)\.?\s+([A-Z][a-zA-Z\s]{3,40})$/m,

  // Arabic patterns
  /^(?:الفصل|الوحدة|الدرس)\s*(?:ال)?(\d+|[٠-٩]+)(?:\s*[:\-–—.]\s*(.+))?$/m,
  /^(?:الباب)\s*(?:ال)?(\d+|الأول|الثاني|الثالث|الرابع|الخامس)(?:\s*[:\-–—.]\s*(.+))?$/m,
  /^(?:الجزء)\s*(?:ال)?(\d+|الأول|الثاني|الثالث)(?:\s*[:\-–—.]\s*(.+))?$/m,

  // French patterns
  /^(?:chapitre|leçon|unité)\s*(\d+|[ivxlcdm]+)(?:\s*[:\-–—.]\s*(.+))?$/im,

  // Spanish patterns
  /^(?:capítulo|lección|unidad)\s*(\d+|[ivxlcdm]+)(?:\s*[:\-–—.]\s*(.+))?$/im,

  // German patterns
  /^(?:kapitel|lektion|einheit)\s*(\d+|[ivxlcdm]+)(?:\s*[:\-–—.]\s*(.+))?$/im,
];

/**
 * Convert Roman numerals to Arabic numerals
 */
function romanToArabic(roman: string): number {
  const romanNumerals: Record<string, number> = {
    i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
  };

  let result = 0;
  const lower = roman.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    const current = romanNumerals[lower[i]] || 0;
    const next = romanNumerals[lower[i + 1]] || 0;

    if (current < next) {
      result -= current;
    } else {
      result += current;
    }
  }

  return result || 1;
}

/**
 * Parse chapter number from various formats
 */
function parseChapterNumber(numberStr: string): number {
  // Check if it's Arabic numerals (Eastern Arabic)
  const easternArabicMap: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  let normalized = numberStr;
  for (const [eastern, western] of Object.entries(easternArabicMap)) {
    normalized = normalized.replace(new RegExp(eastern, 'g'), western);
  }

  // Try direct number parsing
  const directNum = parseInt(normalized, 10);
  if (!isNaN(directNum)) {
    return directNum;
  }

  // Check for Roman numerals
  if (/^[ivxlcdm]+$/i.test(numberStr)) {
    return romanToArabic(numberStr);
  }

  // Check for Arabic ordinals
  const arabicOrdinals: Record<string, number> = {
    'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
    'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
  };
  if (arabicOrdinals[numberStr]) {
    return arabicOrdinals[numberStr];
  }

  // Check for English ordinals
  const englishOrdinals: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  };
  if (englishOrdinals[numberStr.toLowerCase()]) {
    return englishOrdinals[numberStr.toLowerCase()];
  }

  return 1; // Default
}

/**
 * Check if a line looks like a chapter heading based on formatting cues
 */
function looksLikeHeading(line: string, lineIndex: number): boolean {
  const trimmed = line.trim();

  // Empty or very short lines are not headings
  if (trimmed.length < 3) return false;

  // Very long lines are probably not headings
  if (trimmed.length > 80) return false;

  // Lines that are all caps might be headings
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

  // Lines at the start of a page are more likely to be headings
  const isNearTop = lineIndex < 5;

  // Check for title case (most words capitalized)
  const words = trimmed.split(/\s+/);
  const capitalizedWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase());
  const isTitleCase = capitalizedWords.length >= words.length * 0.6;

  return (isAllCaps || (isNearTop && isTitleCase));
}

/**
 * Detect chapters from extracted page text
 */
export function detectChapters(pages: ExtractedPage[]): Chapter[] {
  const chapters: Chapter[] = [];
  const seenTitles = new Set<string>();

  for (const page of pages) {
    // Check first 15 lines of each page
    const lines = page.text.split('\n').slice(0, 15);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmed = line.trim();

      // Skip empty or very short lines
      if (trimmed.length < 3 || trimmed.length > 100) continue;

      // Try each pattern
      for (const pattern of CHAPTER_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
          const chapterNum = parseChapterNumber(match[1] || '1');
          const title = match[2]?.trim() || `Chapter ${chapterNum}`;

          // Avoid duplicate chapters
          const titleKey = title.toLowerCase();
          if (seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);

          chapters.push({
            number: chapterNum,
            title: title,
            startPage: page.pageNumber,
          });
          break; // Found a match, move to next page
        }
      }

      // Also check for heading-like lines that might be chapters
      if (chapters.length === 0 && looksLikeHeading(trimmed, lineIndex)) {
        // Only add as chapter if it looks like a section start
        const isNumbered = /^\d+[\.\s]/.test(trimmed);
        if (isNumbered) {
          const numMatch = trimmed.match(/^(\d+)[\.\s]+(.+)/);
          if (numMatch) {
            const titleKey = numMatch[2].toLowerCase().trim();
            if (!seenTitles.has(titleKey)) {
              seenTitles.add(titleKey);
              chapters.push({
                number: parseInt(numMatch[1], 10),
                title: numMatch[2].trim(),
                startPage: page.pageNumber,
              });
            }
          }
        }
      }
    }
  }

  // Sort chapters by start page
  chapters.sort((a, b) => a.startPage - b.startPage);

  // Renumber chapters sequentially
  chapters.forEach((ch, i) => {
    ch.number = i + 1;
  });

  // Set end pages
  for (let i = 0; i < chapters.length - 1; i++) {
    chapters[i].endPage = chapters[i + 1].startPage - 1;
  }
  if (chapters.length > 0 && pages.length > 0) {
    chapters[chapters.length - 1].endPage = pages[pages.length - 1].pageNumber;
  }

  return chapters;
}

/**
 * Assign vocabulary entries to their respective chapters based on page numbers
 */
export function assignVocabularyToChapters(
  vocabulary: VocabularyEntry[],
  chapters: Chapter[]
): ChapterVocabulary[] {
  // If no chapters detected, return all vocabulary under a single "All Vocabulary" chapter
  if (chapters.length === 0) {
    return [{
      chapter: {
        number: 1,
        title: 'All Vocabulary',
        startPage: 1,
      },
      vocabulary: vocabulary,
    }];
  }

  // Initialize result with empty vocabulary arrays for each chapter
  const result: ChapterVocabulary[] = chapters.map(ch => ({
    chapter: ch,
    vocabulary: [],
  }));

  // Assign each vocabulary entry to a chapter
  for (const entry of vocabulary) {
    const pageNum = entry.pageNumber || 1;

    // Find which chapter this page belongs to
    let assignedIndex = -1;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const nextCh = chapters[i + 1];

      // Entry belongs to this chapter if:
      // - pageNum >= chapter's startPage
      // - AND (no next chapter OR pageNum < next chapter's startPage)
      if (pageNum >= ch.startPage && (!nextCh || pageNum < nextCh.startPage)) {
        assignedIndex = i;
        break;
      }
    }

    // If no chapter found, assign to last chapter
    if (assignedIndex === -1) {
      assignedIndex = result.length - 1;
    }

    result[assignedIndex].vocabulary.push(entry);
  }

  // Filter out chapters with no vocabulary
  return result.filter(cv => cv.vocabulary.length > 0);
}

/**
 * Get vocabulary for a specific chapter
 */
export function getVocabularyForChapter(
  vocabulary: VocabularyEntry[],
  chapter: Chapter
): VocabularyEntry[] {
  return vocabulary.filter(entry => {
    const pageNum = entry.pageNumber || 0;
    return pageNum >= chapter.startPage &&
           (!chapter.endPage || pageNum <= chapter.endPage);
  });
}
