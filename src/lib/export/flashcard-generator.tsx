/**
 * Flashcard PDF Generator
 * Generates PDFs for printable flashcards with Arabic/Chinese support
 * Uses @react-pdf/renderer for serverless-compatible PDF generation
 * Supports:
 * - Language mode: vocabulary with native script + romanization + definition
 * - Concept mode: technical terms with definition + category badge
 */

import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import type { VocabularyEntry, ConceptEntry } from '@/types';

// Register fonts for multilingual support
// Using Google Fonts CDN URLs
Font.register({
  family: 'Noto Sans',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/notosans/v36/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/notosans/v36/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAjBN9d.ttf', fontWeight: 600 },
  ],
});

Font.register({
  family: 'Noto Sans Arabic',
  src: 'https://fonts.gstatic.com/s/notosansarabic/v28/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyG2vu3CBFQLaig.ttf',
});

Font.register({
  family: 'Noto Sans SC',
  src: 'https://fonts.gstatic.com/s/notosanssc/v36/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf',
});

Font.register({
  family: 'Noto Sans JP',
  src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf',
});

Font.register({
  family: 'Noto Sans KR',
  src: 'https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuozeLTq8H4hfeE.ttf',
});

// Styles for vocabulary flashcards
const vocabStyles = StyleSheet.create({
  page: {
    padding: 10,
    fontFamily: 'Noto Sans',
    backgroundColor: 'white',
  },
  header: {
    textAlign: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#666',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    width: '50%',
    height: 180,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bbb',
    position: 'relative',
  },
  cardFront: {
    height: '50%',
    backgroundColor: '#FFFEF5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  cardBack: {
    height: '50%',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  foldLine: {
    height: 0,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: '#999',
    position: 'relative',
  },
  foldText: {
    position: 'absolute',
    right: 8,
    top: -6,
    fontSize: 6,
    color: '#999',
    backgroundColor: 'white',
    paddingHorizontal: 2,
  },
  native: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  nativeArabic: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    fontFamily: 'Noto Sans Arabic',
  },
  nativeChinese: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    fontFamily: 'Noto Sans SC',
  },
  nativeJapanese: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    fontFamily: 'Noto Sans JP',
  },
  nativeKorean: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    fontFamily: 'Noto Sans KR',
  },
  romanization: {
    fontSize: 9,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  definition: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
  },
  cardNumber: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontSize: 7,
    color: '#bbb',
  },
});

// Styles for concept flashcards
const conceptStyles = StyleSheet.create({
  page: {
    padding: 10,
    fontFamily: 'Noto Sans',
    backgroundColor: 'white',
  },
  header: {
    textAlign: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#666',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    width: '50%',
    height: 180,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bbb',
    position: 'relative',
  },
  cardFront: {
    height: '50%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  cardBack: {
    height: '50%',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  foldLine: {
    height: 0,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: '#999',
  },
  foldText: {
    position: 'absolute',
    right: 8,
    top: -6,
    fontSize: 6,
    color: '#999',
    backgroundColor: 'white',
    paddingHorizontal: 2,
  },
  term: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 4,
  },
  categoryBadge: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  definition: {
    fontSize: 9,
    color: '#333',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  cardNumber: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontSize: 7,
    color: '#bbb',
  },
});

/**
 * Check if text contains Arabic characters
 */
function containsArabic(text: string): boolean {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicPattern.test(text);
}

/**
 * Check if text contains Chinese characters
 */
function containsChinese(text: string): boolean {
  const chinesePattern = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
  return chinesePattern.test(text);
}

/**
 * Check if text contains Japanese characters
 */
function containsJapanese(text: string): boolean {
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
  return japanesePattern.test(text);
}

/**
 * Check if text contains Korean characters (Hangul)
 */
function containsKorean(text: string): boolean {
  const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
  return koreanPattern.test(text);
}

/**
 * Get the appropriate style for native script text
 */
function getNativeStyle(text: string) {
  if (containsArabic(text)) return vocabStyles.nativeArabic;
  if (containsChinese(text)) return vocabStyles.nativeChinese;
  if (containsJapanese(text)) return vocabStyles.nativeJapanese;
  if (containsKorean(text)) return vocabStyles.nativeKorean;
  return vocabStyles.native;
}

/**
 * Get category badge colors
 */
function getCategoryColor(category?: string): { bg: string; text: string } {
  switch (category) {
    case 'concept':
      return { bg: '#E8F4FD', text: '#1565C0' };
    case 'term':
      return { bg: '#FFF3E0', text: '#E65100' };
    case 'tool':
      return { bg: '#E8F5E9', text: '#2E7D32' };
    case 'protocol':
      return { bg: '#F3E5F5', text: '#7B1FA2' };
    case 'technique':
      return { bg: '#FFEBEE', text: '#C62828' };
    case 'acronym':
      return { bg: '#E0F2F1', text: '#00695C' };
    default:
      return { bg: '#F5F5F5', text: '#616161' };
  }
}

/**
 * Vocabulary Flashcard Component
 */
interface VocabCardProps {
  entry: VocabularyEntry;
  index: number;
}

const VocabCard: React.FC<VocabCardProps> = ({ entry, index }) => {
  const native = entry.nativeScript?.trim() || '';
  const romanization = entry.romanization?.trim() || '';
  const definition = entry.definition || '';

  return (
    <View style={vocabStyles.card}>
      <View style={vocabStyles.cardFront}>
        {native && <Text style={getNativeStyle(native)}>{native}</Text>}
        {romanization && <Text style={vocabStyles.romanization}>({romanization})</Text>}
      </View>
      <View style={vocabStyles.foldLine}>
        <Text style={vocabStyles.foldText}>fold here</Text>
      </View>
      <View style={vocabStyles.cardBack}>
        <Text style={vocabStyles.definition}>{definition}</Text>
      </View>
      <Text style={vocabStyles.cardNumber}>#{index + 1}</Text>
    </View>
  );
};

/**
 * Vocabulary Document Component
 */
interface VocabDocumentProps {
  vocabulary: VocabularyEntry[];
}

const VocabDocument: React.FC<VocabDocumentProps> = ({ vocabulary }) => {
  // Split into pages of 8 cards (4 rows x 2 columns)
  const cardsPerPage = 8;
  const pages: VocabularyEntry[][] = [];

  for (let i = 0; i < vocabulary.length; i += cardsPerPage) {
    pages.push(vocabulary.slice(i, i + cardsPerPage));
  }

  return (
    <Document>
      {pages.map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={vocabStyles.page}>
          {pageIndex === 0 && (
            <View style={vocabStyles.header}>
              <Text style={vocabStyles.headerTitle}>Vocabulary Flashcards</Text>
              <Text style={vocabStyles.headerSubtitle}>
                Cut along dashed lines, then fold each card in half. Word on front, definition on back.
              </Text>
            </View>
          )}
          <View style={vocabStyles.cardsContainer}>
            {pageCards.map((entry, i) => (
              <VocabCard
                key={i}
                entry={entry}
                index={pageIndex * cardsPerPage + i}
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
};

/**
 * Concept Flashcard Component
 */
interface ConceptCardProps {
  entry: ConceptEntry;
  index: number;
}

const ConceptCard: React.FC<ConceptCardProps> = ({ entry, index }) => {
  const colors = getCategoryColor(entry.category);

  return (
    <View style={conceptStyles.card}>
      <View style={conceptStyles.cardFront}>
        <Text style={conceptStyles.term}>{entry.term}</Text>
        {entry.category && (
          <Text
            style={[
              conceptStyles.categoryBadge,
              { backgroundColor: colors.bg, color: colors.text },
            ]}
          >
            {entry.category}
          </Text>
        )}
      </View>
      <View style={conceptStyles.foldLine}>
        <Text style={conceptStyles.foldText}>fold here</Text>
      </View>
      <View style={conceptStyles.cardBack}>
        <Text style={conceptStyles.definition}>{entry.definition}</Text>
      </View>
      <Text style={conceptStyles.cardNumber}>#{index + 1}</Text>
    </View>
  );
};

/**
 * Concept Document Component
 */
interface ConceptDocumentProps {
  concepts: ConceptEntry[];
}

const ConceptDocument: React.FC<ConceptDocumentProps> = ({ concepts }) => {
  // Split into pages of 8 cards (4 rows x 2 columns)
  const cardsPerPage = 8;
  const pages: ConceptEntry[][] = [];

  for (let i = 0; i < concepts.length; i += cardsPerPage) {
    pages.push(concepts.slice(i, i + cardsPerPage));
  }

  return (
    <Document>
      {pages.map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={conceptStyles.page}>
          {pageIndex === 0 && (
            <View style={conceptStyles.header}>
              <Text style={conceptStyles.headerTitle}>Study Flashcards</Text>
              <Text style={conceptStyles.headerSubtitle}>
                Cut along dashed lines, then fold each card in half. Term on front, definition on back.
              </Text>
            </View>
          )}
          <View style={conceptStyles.cardsContainer}>
            {pageCards.map((entry, i) => (
              <ConceptCard
                key={i}
                entry={entry}
                index={pageIndex * cardsPerPage + i}
              />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
};

/**
 * Generate flashcard PDF buffer for vocabulary
 */
export async function generateFlashcardPdf(vocabulary: VocabularyEntry[]): Promise<Buffer> {
  const buffer = await renderToBuffer(<VocabDocument vocabulary={vocabulary} />);
  return Buffer.from(buffer);
}

/**
 * Generate flashcard PDF buffer for concepts
 */
export async function generateConceptFlashcardPdf(concepts: ConceptEntry[]): Promise<Buffer> {
  const buffer = await renderToBuffer(<ConceptDocument concepts={concepts} />);
  return Buffer.from(buffer);
}

// ============================================================================
// HTML Generation functions (kept for potential future use / preview)
// ============================================================================

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Check if text contains RTL characters (Arabic, Hebrew, etc.)
 */
function containsRtl(text: string): boolean {
  const rtlPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
  return rtlPattern.test(text);
}

/**
 * Build the front text for a flashcard
 */
function buildFrontText(entry: VocabularyEntry): { native: string; romanization: string } {
  const native = entry.nativeScript?.trim() || '';
  const romanization = entry.romanization?.trim() || '';
  return { native, romanization };
}

/**
 * Generate a single flashcard HTML with card number
 */
function generateCardHtml(entry: VocabularyEntry, index: number): string {
  const { native, romanization } = buildFrontText(entry);
  const definition = escapeHtml(entry.definition);
  const isRtl = containsRtl(native);
  const cardNumber = index + 1;

  return `
    <div class="card">
      <div class="card-front">
        ${native ? `<span class="native" ${isRtl ? 'dir="rtl"' : ''}>${escapeHtml(native)}</span>` : ''}
        ${romanization ? `<span class="romanization">(${escapeHtml(romanization)})</span>` : ''}
      </div>
      <div class="fold-line">
        <span class="fold-text">fold here</span>
      </div>
      <div class="card-back">
        <span class="definition">${definition}</span>
      </div>
      <span class="card-number">#${cardNumber}</span>
    </div>
  `;
}

/**
 * Generate complete HTML document for flashcards (for preview)
 */
export function generateFlashcardHtml(vocabulary: VocabularyEntry[]): string {
  const cards = vocabulary.map((entry, index) => generateCardHtml(entry, index)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vocabulary Flashcards</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: white; color: #1a1a1a; }
    .instructions { text-align: center; padding: 16px; border-bottom: 1px solid #e0e0e0; }
    .instructions h1 { font-size: 18px; margin-bottom: 4px; }
    .instructions p { font-size: 12px; color: #666; }
    .cards-container { display: grid; grid-template-columns: repeat(2, 1fr); }
    .card { border: 1px dashed #bbb; height: 180px; display: flex; flex-direction: column; position: relative; }
    .card-front { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #FFFEF5; padding: 8px; }
    .card-back { flex: 1; display: flex; justify-content: center; align-items: center; padding: 8px; }
    .fold-line { border-top: 1px dashed #999; }
    .native { font-size: 24px; font-weight: 600; }
    .romanization { font-size: 12px; color: #666; font-style: italic; }
    .definition { font-size: 14px; text-align: center; }
    .card-number { position: absolute; bottom: 4px; right: 8px; font-size: 10px; color: #bbb; }
  </style>
</head>
<body>
  <div class="instructions">
    <h1>Vocabulary Flashcards</h1>
    <p>Cut along dashed lines, then fold each card in half.</p>
  </div>
  <div class="cards-container">${cards}</div>
</body>
</html>`;
}

/**
 * Generate concept flashcard HTML (for preview)
 */
export function generateConceptFlashcardHtml(concepts: ConceptEntry[]): string {
  const cards = concepts.map((entry, index) => {
    const colors = getCategoryColor(entry.category);
    return `
      <div class="card">
        <div class="card-front">
          <span class="term">${escapeHtml(entry.term)}</span>
          ${entry.category ? `<span class="badge" style="background:${colors.bg};color:${colors.text}">${escapeHtml(entry.category)}</span>` : ''}
        </div>
        <div class="fold-line"></div>
        <div class="card-back">
          <span class="definition">${escapeHtml(entry.definition)}</span>
        </div>
        <span class="card-number">#${index + 1}</span>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Study Flashcards</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: white; }
    .instructions { text-align: center; padding: 16px; border-bottom: 1px solid #e0e0e0; }
    .instructions h1 { font-size: 18px; margin-bottom: 4px; }
    .instructions p { font-size: 12px; color: #666; }
    .cards-container { display: grid; grid-template-columns: repeat(2, 1fr); }
    .card { border: 1px dashed #bbb; height: 180px; display: flex; flex-direction: column; position: relative; }
    .card-front { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #F8FAFC; padding: 8px; gap: 4px; }
    .card-back { flex: 1; display: flex; justify-content: center; align-items: center; padding: 8px; }
    .fold-line { border-top: 1px dashed #999; }
    .term { font-size: 16px; font-weight: 600; }
    .badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
    .definition { font-size: 12px; text-align: center; }
    .card-number { position: absolute; bottom: 4px; right: 8px; font-size: 10px; color: #bbb; }
  </style>
</head>
<body>
  <div class="instructions">
    <h1>Study Flashcards</h1>
    <p>Cut along dashed lines, then fold each card in half.</p>
  </div>
  <div class="cards-container">${cards}</div>
</body>
</html>`;
}
