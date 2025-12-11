/**
 * LLM Prompt Templates for Vocabulary and Concept Extraction
 * Uses delimiter-based format (|||) for reliable parsing
 * Supports:
 * - Language mode: NATIVE|||ROMANIZATION|||DEFINITION (for language learning)
 * - Concept mode: TERM|||DEFINITION|||CATEGORY (for textbook study)
 */

import type { ConceptEntry, ConceptCategory } from '@/types';

export const VOCABULARY_EXTRACTION_PROMPT = `Extract ALL vocabulary words that appear in this text. Be thorough - extract every vocabulary item you can find.

EXTRACTION GUIDELINES:
1. Extract ALL vocabulary pairs you can find (foreign word + definition/translation)
2. Include words even if the romanization format varies slightly
3. If a word appears but has no definition nearby, use "NEEDS_DEFINITION"
4. Extract multi-word phrases and expressions (e.g., greetings, common phrases)
5. Be inclusive - it's better to extract more and let validation filter

OUTPUT FORMAT:
NATIVE_SCRIPT|||ROMANIZATION|||ENGLISH_DEFINITION

COLUMN ORDER:
1. NATIVE_SCRIPT = Non-Latin characters as they appear in source (Arabic, Chinese, etc.)
2. ROMANIZATION = Latin pronunciation as written in source (may be in parentheses)
3. ENGLISH_DEFINITION = Translation/meaning from source, or "NEEDS_DEFINITION" if not visible

RULES:
- If you see Arabic text like "أهلاً" next to "(ahlan)" and "Hello", extract: أهلاً|||ahlan|||Hello
- If you see ONLY Arabic text "أب" with no romanization, use: أب|||EMPTY|||NEEDS_DEFINITION
- If you see ONLY romanization "baba" next to "father", use: EMPTY|||baba|||father
- Extract vocabulary from tables, lists, boxes, and running text
- Include greetings, phrases, and expressions - not just single words
- Copy romanizations exactly as shown (with or without diacritics)

WHAT TO EXTRACT:
- Foreign words with translations nearby
- Vocabulary lists and tables
- Greetings and common expressions
- Words in vocabulary boxes or highlighted sections
- Any word-definition pairs visible on the page

WHAT TO SKIP:
- Page numbers, headers, footers
- Instructions in English only
- Romanizations you would need to generate yourself

TEXT TO EXTRACT FROM:
"""
{text}
"""

Extract ALL vocabulary entries visible in the source:`;

export const SYSTEM_PROMPT = `You are a thorough vocabulary extraction assistant. Your goal is to extract ALL vocabulary items visible in the source text.

EXTRACTION PRINCIPLES:
- Extract every vocabulary pair you can find (foreign word + translation/definition)
- Include multi-word phrases and expressions
- Copy text exactly as it appears in the source
- If a field is missing from source, output EMPTY or NEEDS_DEFINITION
- Be thorough - extract more rather than less

Output format: NATIVE|||ROMAN|||ENGLISH

COLUMN ORDER:
1. NATIVE_SCRIPT = Foreign characters as seen in source
2. ROMANIZATION = Latin text as seen in source (often in parentheses)
3. ENGLISH_DEFINITION = English meaning from source, else NEEDS_DEFINITION

Use EMPTY for fields not present in source:
أهلاً|||ahlan|||Hello
أب|||EMPTY|||father (if no romanization in source)
EMPTY|||baba|||father (if no Arabic script in source)

PRIORITY: Extract all vocabulary. Validation will filter false positives.`;

/**
 * Build the prompt for vocabulary extraction
 */
export function buildVocabularyPrompt(text: string, chunkInfo?: { current: number; total: number }): string {
  let prompt = VOCABULARY_EXTRACTION_PROMPT.replace('{text}', text);

  if (chunkInfo) {
    prompt = prompt.replace(
      'TEXT TO EXTRACT FROM:',
      `TEXT TO EXTRACT FROM (Chunk ${chunkInfo.current} of ${chunkInfo.total}):`
    );
  }

  return prompt;
}

type VocabEntry = {
  nativeScript?: string;
  romanization?: string;
  definition: string;
  confidence: 'high' | 'medium' | 'low';
  term: string;  // Computed for backward compatibility
};

/**
 * Check if text contains non-Latin characters
 */
function containsNonLatinScript(text: string): boolean {
  // Detects Arabic, Chinese, Japanese, Korean, Thai, Hebrew, Cyrillic, etc.
  return /[^\u0000-\u007F]/.test(text);
}

/**
 * Parse the LLM response to extract vocabulary
 * Primary: three-field delimiter format (|||)
 * Fallback: two-field format, JSON format
 */
export function parseVocabularyResponse(response: string): VocabEntry[] {
  // First, try three-field delimiter-based parsing (|||)
  const threeFieldEntries = parseThreeFieldFormat(response);
  if (threeFieldEntries.length > 0) {
    return threeFieldEntries;
  }

  // Fallback: try two-field delimiter parsing
  const twoFieldEntries = parseTwoFieldFormat(response);
  if (twoFieldEntries.length > 0) {
    return twoFieldEntries;
  }

  // Fallback: try JSON parsing
  const jsonEntries = parseJsonFormat(response);
  if (jsonEntries.length > 0) {
    return cleanVocabularyEntries(jsonEntries);
  }

  // Last resort: regex fallback
  const fallbackEntries = extractVocabularyFallback(response);
  return cleanVocabularyEntries(fallbackEntries);
}

/**
 * Check if text contains ONLY English/Latin characters and basic punctuation
 * Returns true if the text appears to be English
 */
function isLikelyEnglish(text: string): boolean {
  // Remove common punctuation and check if remaining is ASCII
  const cleaned = text.replace(/[\s\-'.,!?()]/g, '');
  // English words typically contain only a-z, A-Z, 0-9
  return /^[a-zA-Z0-9]+$/.test(cleaned) && cleaned.length > 0;
}

/**
 * Parse three-field format: NATIVE|||ROMANIZATION|||DEFINITION
 * Also validates and corrects field order if LLM got it wrong
 */
function parseThreeFieldFormat(response: string): VocabEntry[] {
  const entries: VocabEntry[] = [];
  const lines = response.split('\n');

  for (const line of lines) {
    if (!line.includes('|||')) continue;

    const parts = line.split('|||');
    if (parts.length >= 3) {
      const nativeRaw = parts[0].trim();
      const romanRaw = parts[1].trim();
      let definition = parts.slice(2).join('|||').trim();

      // Handle EMPTY placeholders
      let nativeScript = (nativeRaw && nativeRaw !== 'EMPTY' && nativeRaw.length >= 1) ? nativeRaw : undefined;
      let romanization = (romanRaw && romanRaw !== 'EMPTY' && romanRaw.length >= 1) ? romanRaw : undefined;

      // VALIDATION: nativeScript should contain non-Latin characters
      // If nativeScript is Latin-only text, it's actually romanization, not native script
      if (nativeScript && !containsNonLatinScript(nativeScript)) {
        // nativeScript is Latin text - it's not a native script
        if (!romanization) {
          // Move it to romanization if romanization is empty
          romanization = nativeScript;
        }
        // Clear nativeScript since it doesn't contain actual native characters
        nativeScript = undefined;
      }

      // VALIDATION: Check if fields are in wrong order
      // If position 1 (nativeScript) looks like English AND position 3 (definition) looks like non-Latin script
      // Then the LLM reversed the order - swap them!
      if (nativeScript && definition) {
        const firstIsEnglish = isLikelyEnglish(nativeScript);
        const lastIsNonLatin = containsNonLatinScript(definition);

        if (firstIsEnglish && lastIsNonLatin) {
          // Swap: definition becomes nativeScript, nativeScript becomes definition
          const temp = nativeScript;
          nativeScript = definition;
          definition = temp;
        }
      }

      // Also check if romanization accidentally got the English definition
      if (romanization && !definition) {
        if (isLikelyEnglish(romanization)) {
          definition = romanization;
          romanization = undefined;
        }
      }

      // Must have definition and at least one identifier
      if (definition && definition.length >= 1 && (nativeScript || romanization)) {
        // Compute term for backward compatibility
        const term = romanization || nativeScript || '';

        entries.push({
          nativeScript,
          romanization,
          definition,
          confidence: 'high',
          term,
        });
      }
    }
  }

  return entries;
}

/**
 * Parse two-field format: TERM|||DEFINITION (backward compatibility)
 */
function parseTwoFieldFormat(response: string): VocabEntry[] {
  const entries: VocabEntry[] = [];
  const lines = response.split('\n');

  for (const line of lines) {
    if (!line.includes('|||')) continue;

    const parts = line.split('|||');
    // Only process if exactly 2 parts (not 3+)
    if (parts.length === 2) {
      const term = parts[0].trim();
      const definition = parts[1].trim();

      if (term && definition && term.length >= 1 && definition.length >= 1) {
        // Use heuristic to detect if term is native script or romanization
        const hasNonLatin = containsNonLatinScript(term);

        entries.push({
          nativeScript: hasNonLatin ? term : undefined,
          romanization: hasNonLatin ? undefined : term,
          definition,
          confidence: 'medium',
          term,
        });
      }
    }
  }

  return entries;
}

/**
 * Parse JSON format (fallback)
 */
function parseJsonFormat(response: string): VocabEntry[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.vocabulary || !Array.isArray(parsed.vocabulary)) {
      return [];
    }

    return parsed.vocabulary
      .filter((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return false;
        const e = entry as Record<string, unknown>;
        return typeof e.term === 'string' || typeof e.nativeScript === 'string' || typeof e.romanization === 'string';
      })
      .map((entry: { term?: string; nativeScript?: string; romanization?: string; definition?: string; confidence?: string }) => {
        const term = entry.term || entry.romanization || entry.nativeScript || '';
        const hasNonLatin = containsNonLatinScript(term);

        return {
          nativeScript: entry.nativeScript || (hasNonLatin ? term : undefined),
          romanization: entry.romanization || (hasNonLatin ? undefined : term),
          definition: (entry.definition || '').trim(),
          confidence: (['high', 'medium', 'low'].includes(entry.confidence || '')
            ? entry.confidence
            : 'medium') as 'high' | 'medium' | 'low',
          term: term.trim(),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Clean vocabulary entries by detecting and fixing malformed entries
 * where term and definition have been concatenated together.
 */
function cleanVocabularyEntries(entries: VocabEntry[]): VocabEntry[] {
  return entries.map(entry => {
    // If definition is empty or very short, try to split the term
    if (!entry.definition || entry.definition.trim().length < 2) {
      // Look for uppercase start of English word
      const splitMatch = entry.term.match(/^(.+?)([A-Z][a-z].*)$/);
      if (splitMatch && splitMatch[1].length >= 2 && splitMatch[2].length >= 2) {
        const newTerm = splitMatch[1].trim();
        const hasNonLatin = containsNonLatinScript(newTerm);
        return {
          nativeScript: hasNonLatin ? newTerm : undefined,
          romanization: hasNonLatin ? undefined : newTerm,
          definition: splitMatch[2].trim(),
          confidence: 'medium' as const,
          term: newTerm,
        };
      }

      // Check for common separators in the term
      const separatorMatch = entry.term.match(/^(.+?)\s*[=\-–—:]\s*(.+)$/);
      if (separatorMatch && separatorMatch[1].length >= 2 && separatorMatch[2].length >= 2) {
        const newTerm = separatorMatch[1].trim();
        const hasNonLatin = containsNonLatinScript(newTerm);
        return {
          nativeScript: hasNonLatin ? newTerm : undefined,
          romanization: hasNonLatin ? undefined : newTerm,
          definition: separatorMatch[2].trim(),
          confidence: 'medium' as const,
          term: newTerm,
        };
      }
    }

    return entry;
  }).filter(e => e.term && e.term.trim().length > 0 && e.definition && e.definition.trim().length > 0);
}

/**
 * Fallback extraction using regex for JSON-like patterns
 */
function extractVocabularyFallback(response: string): VocabEntry[] {
  const entries: VocabEntry[] = [];

  // Look for "term": "...", "definition": "..." patterns
  const termDefPattern = /"term"\s*:\s*"([^"]+)"[^}]*"definition"\s*:\s*"([^"]+)"/g;
  let match;

  while ((match = termDefPattern.exec(response)) !== null) {
    const term = match[1].trim();
    const hasNonLatin = containsNonLatinScript(term);

    entries.push({
      nativeScript: hasNonLatin ? term : undefined,
      romanization: hasNonLatin ? undefined : term,
      definition: match[2].trim(),
      confidence: 'low',
      term,
    });
  }

  return entries;
}

// ============================================================================
// CONCEPT EXTRACTION (for textbooks, technical documents)
// ============================================================================

export const CONCEPT_EXTRACTION_PROMPT = `Extract concepts, terms, and definitions that EXPLICITLY appear in this text. Only extract what you can DIRECTLY see.

CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY extract terms that LITERALLY appear in the source text below
2. DO NOT infer, guess, or fabricate ANY terms or definitions
3. DO NOT add concepts you think "should" be there
4. ONLY use definitions that are EXPLICITLY written in the source
5. When uncertain, SKIP IT - your output will be VALIDATED
6. False negatives are acceptable; hallucinations are NOT

OUTPUT FORMAT:
TERM|||DEFINITION|||CATEGORY

CATEGORIES:
- concept: Ideas, theories, principles explicitly defined in text
- term: Technical terminology with definition in text
- definition: Dictionary-style definitions explicitly written
- formula: Equations/formulas EXACTLY as written in source
- theorem: Theorems/laws with their statements from source
- rule: Rules/patterns explicitly stated
- example: Examples explicitly given in text
- technique: Methods explicitly described
- acronym: Abbreviations with their meaning in text
- event: Events with dates from the source
- person: People mentioned with descriptions
- process: Procedures described in source

EXTRACTION RULES:
- The TERM must appear in the source text
- The DEFINITION must come from the source text (don't write your own)
- If you see "X - means Y" or "X: Y" in the source, extract it
- If a term appears but has no definition, SKIP IT
- DO NOT add general knowledge definitions not in the source

WHAT TO EXTRACT:
- Terms with their definitions explicitly written nearby
- Formulas with explanations in the source
- Concepts that are defined in the text
- Rules/patterns that are stated in the text

WHAT TO SKIP:
- Terms without explicit definitions in the source
- Concepts you would need to define yourself
- Anything not LITERALLY in the source text

TEXT TO EXTRACT FROM:
"""
{text}
"""

Output ONLY entries that LITERALLY appear in the source:`;

export const CONCEPT_SYSTEM_PROMPT = `You are a STRICT concept extraction assistant. Your PRIMARY DIRECTIVE is to ONLY output terms and definitions that LITERALLY appear in the source text.

ANTI-HALLUCINATION RULES - CRITICAL:
- NEVER generate terms that do not appear in the source
- NEVER write definitions yourself - only copy definitions from the source
- NEVER add general knowledge not in the source text
- If a term has no definition in the source, SKIP IT
- When uncertain about any entry, SKIP IT ENTIRELY
- Your output will be VALIDATED against the source text

You work with all subjects but ONLY extract what is explicitly written.

Output format: TERM|||DEFINITION|||CATEGORY

Categories: concept, term, definition, formula, theorem, rule, example, technique, acronym, event, person, place, date, process

RULES:
- TERM must be copied from source text
- DEFINITION must be copied from source text (not your own words)
- If no definition exists in source, DO NOT INCLUDE the entry

CRITICAL: False negatives (missing valid entries) are acceptable. False positives (hallucinated entries) are NOT acceptable.`;

/**
 * Build the prompt for concept extraction
 */
export function buildConceptPrompt(text: string, chunkInfo?: { current: number; total: number }): string {
  let prompt = CONCEPT_EXTRACTION_PROMPT.replace('{text}', text);

  if (chunkInfo) {
    prompt = prompt.replace(
      'TEXT TO EXTRACT FROM:',
      `TEXT TO EXTRACT FROM (Chunk ${chunkInfo.current} of ${chunkInfo.total}):`
    );
  }

  return prompt;
}

const VALID_CATEGORIES: ConceptCategory[] = [
  'concept', 'term', 'definition', 'formula', 'theorem',
  'rule', 'example', 'technique', 'acronym',
  'event', 'person', 'place', 'date', 'process',
  'tool', 'protocol'
];

/**
 * Parse the LLM response to extract concepts
 * Format: TERM|||DEFINITION|||CATEGORY
 */
export function parseConceptResponse(response: string): ConceptEntry[] {
  const entries: ConceptEntry[] = [];
  const lines = response.split('\n');

  for (const line of lines) {
    if (!line.includes('|||')) continue;

    const parts = line.split('|||');
    if (parts.length >= 2) {
      const term = parts[0].trim();
      const definition = parts[1].trim();
      const categoryRaw = parts[2]?.trim().toLowerCase() || '';

      if (term && definition && term.length >= 1 && definition.length >= 3) {
        // Validate category
        const category = VALID_CATEGORIES.includes(categoryRaw as ConceptCategory)
          ? (categoryRaw as ConceptCategory)
          : undefined;

        entries.push({
          term,
          definition,
          category,
          confidence: 'high',
        });
      }
    }
  }

  return entries;
}
