/**
 * Flashcard PDF Generator
 * Generates HTML for printable flashcards with Arabic/Chinese support
 * Design based on best practices from Quizard, Canva, and FluentU
 * Supports:
 * - Language mode: vocabulary with native script + romanization + definition
 * - Concept mode: technical terms with definition + category badge
 */

import type { VocabularyEntry, ConceptEntry } from '@/types';

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
 * Generate complete HTML document for flashcards
 */
export function generateFlashcardHtml(vocabulary: VocabularyEntry[]): string {
  const cards = vocabulary.map((entry, index) => generateCardHtml(entry, index)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vocabulary Flashcards</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&family=Noto+Sans+Arabic:wght@400;600&family=Noto+Sans+SC:wght@400;600&family=Noto+Sans+JP:wght@400;600&family=Noto+Sans+Devanagari:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A4;
      margin: 10mm;
    }

    body {
      font-family: 'Noto Sans', 'Noto Sans Arabic', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans Devanagari', sans-serif;
      background: white;
      color: #1a1a1a;
      line-height: 1.4;
    }

    /* Instructions header */
    .instructions {
      text-align: center;
      padding: 4mm 5mm;
      margin-bottom: 3mm;
      border-bottom: 1px solid #e0e0e0;
    }

    .instructions h1 {
      font-size: 14pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 1mm;
    }

    .instructions p {
      font-size: 9pt;
      color: #666;
    }

    /* Cards grid - 2 columns */
    .cards-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0;
      width: 100%;
    }

    /* Individual card */
    .card {
      border: 1px dashed #bbb;
      height: 65mm;
      display: flex;
      flex-direction: column;
      position: relative;
      background: linear-gradient(to bottom, #FFFEF5 50%, #ffffff 50%);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Front section (word + romanization) */
    .card-front {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 4mm;
      text-align: center;
    }

    .native {
      font-size: 26pt;
      font-weight: 600;
      color: #1a1a1a;
      word-wrap: break-word;
      max-width: 100%;
      line-height: 1.2;
    }

    .romanization {
      font-size: 10pt;
      color: #666;
      font-style: italic;
      margin-top: 2mm;
    }

    /* Fold line separator */
    .fold-line {
      width: 100%;
      height: 0;
      border-top: 1px dashed #999;
      position: relative;
    }

    .fold-text {
      position: absolute;
      right: 3mm;
      top: -2.5mm;
      font-size: 6pt;
      color: #999;
      background: white;
      padding: 0 1mm;
    }

    /* Back section (definition) */
    .card-back {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4mm;
      text-align: center;
    }

    .definition {
      font-size: 12pt;
      color: #333;
      word-wrap: break-word;
      max-width: 100%;
      line-height: 1.3;
    }

    /* Card number */
    .card-number {
      position: absolute;
      bottom: 2mm;
      right: 3mm;
      font-size: 7pt;
      color: #bbb;
    }

    /* Corner cut marks */
    .card::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      width: 4mm;
      height: 4mm;
      border-top: 1px solid #ccc;
      border-left: 1px solid #ccc;
    }

    .card::after {
      content: '';
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 4mm;
      height: 4mm;
      border-bottom: 1px solid #ccc;
      border-right: 1px solid #ccc;
    }

    /* Print-specific styles */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .cards-container {
        page-break-after: auto;
      }

      .card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="instructions">
    <h1>Vocabulary Flashcards</h1>
    <p>Cut along dashed lines, then fold each card in half. Word on front, definition on back.</p>
  </div>
  <div class="cards-container">
    ${cards}
  </div>
</body>
</html>`;
}

/**
 * Generate flashcard HTML for a subset of vocabulary (for pagination)
 */
export function generateFlashcardPage(
  vocabulary: VocabularyEntry[],
  startIndex: number,
  cardsPerPage: number = 8
): string {
  const pageVocab = vocabulary.slice(startIndex, startIndex + cardsPerPage);
  return generateFlashcardHtml(pageVocab);
}

// ============================================================================
// CONCEPT FLASHCARD GENERATION (for textbook concepts)
// ============================================================================

/**
 * Get category badge color based on category type
 */
function getCategoryColor(category?: string): { bg: string; text: string } {
  switch (category) {
    case 'concept':
      return { bg: '#E8F4FD', text: '#1565C0' }; // Blue
    case 'term':
      return { bg: '#FFF3E0', text: '#E65100' }; // Orange
    case 'tool':
      return { bg: '#E8F5E9', text: '#2E7D32' }; // Green
    case 'protocol':
      return { bg: '#F3E5F5', text: '#7B1FA2' }; // Purple
    case 'technique':
      return { bg: '#FFEBEE', text: '#C62828' }; // Red
    case 'acronym':
      return { bg: '#E0F2F1', text: '#00695C' }; // Teal
    default:
      return { bg: '#F5F5F5', text: '#616161' }; // Grey
  }
}

/**
 * Generate a single concept flashcard HTML with card number
 */
function generateConceptCardHtml(entry: ConceptEntry, index: number): string {
  const term = escapeHtml(entry.term);
  const definition = escapeHtml(entry.definition);
  const cardNumber = index + 1;
  const categoryColor = getCategoryColor(entry.category);

  return `
    <div class="card">
      <div class="card-front">
        <span class="term">${term}</span>
        ${entry.category ? `<span class="category-badge" style="background: ${categoryColor.bg}; color: ${categoryColor.text};">${escapeHtml(entry.category)}</span>` : ''}
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
 * Generate complete HTML document for concept flashcards
 */
export function generateConceptFlashcardHtml(concepts: ConceptEntry[]): string {
  const cards = concepts.map((entry, index) => generateConceptCardHtml(entry, index)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Study Flashcards</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A4;
      margin: 10mm;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: white;
      color: #1a1a1a;
      line-height: 1.4;
    }

    /* Instructions header */
    .instructions {
      text-align: center;
      padding: 4mm 5mm;
      margin-bottom: 3mm;
      border-bottom: 1px solid #e0e0e0;
    }

    .instructions h1 {
      font-size: 14pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 1mm;
    }

    .instructions p {
      font-size: 9pt;
      color: #666;
    }

    /* Cards grid - 2 columns */
    .cards-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0;
      width: 100%;
    }

    /* Individual card */
    .card {
      border: 1px dashed #bbb;
      height: 65mm;
      display: flex;
      flex-direction: column;
      position: relative;
      background: linear-gradient(to bottom, #F8FAFC 50%, #ffffff 50%);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Front section (term + category badge) */
    .card-front {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 4mm;
      text-align: center;
      gap: 2mm;
    }

    .term {
      font-size: 16pt;
      font-weight: 600;
      color: #1a1a1a;
      word-wrap: break-word;
      max-width: 100%;
      line-height: 1.2;
    }

    .category-badge {
      font-size: 8pt;
      font-weight: 500;
      padding: 1mm 3mm;
      border-radius: 3mm;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
    }

    /* Fold line separator */
    .fold-line {
      width: 100%;
      height: 0;
      border-top: 1px dashed #999;
      position: relative;
    }

    .fold-text {
      position: absolute;
      right: 3mm;
      top: -2.5mm;
      font-size: 6pt;
      color: #999;
      background: white;
      padding: 0 1mm;
    }

    /* Back section (definition) */
    .card-back {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4mm;
      text-align: center;
    }

    .definition {
      font-size: 10pt;
      color: #333;
      word-wrap: break-word;
      max-width: 100%;
      line-height: 1.4;
    }

    /* Card number */
    .card-number {
      position: absolute;
      bottom: 2mm;
      right: 3mm;
      font-size: 7pt;
      color: #bbb;
    }

    /* Corner cut marks */
    .card::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      width: 4mm;
      height: 4mm;
      border-top: 1px solid #ccc;
      border-left: 1px solid #ccc;
    }

    .card::after {
      content: '';
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 4mm;
      height: 4mm;
      border-bottom: 1px solid #ccc;
      border-right: 1px solid #ccc;
    }

    /* Print-specific styles */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .cards-container {
        page-break-after: auto;
      }

      .card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="instructions">
    <h1>Study Flashcards</h1>
    <p>Cut along dashed lines, then fold each card in half. Term on front, definition on back.</p>
  </div>
  <div class="cards-container">
    ${cards}
  </div>
</body>
</html>`;
}

/**
 * Generate concept flashcard HTML for a subset (for pagination)
 */
export function generateConceptFlashcardPage(
  concepts: ConceptEntry[],
  startIndex: number,
  cardsPerPage: number = 8
): string {
  const pageConcepts = concepts.slice(startIndex, startIndex + cardsPerPage);
  return generateConceptFlashcardHtml(pageConcepts);
}

/**
 * Generate flashcard PDF buffer using Puppeteer
 */
export async function generateFlashcardPdf(vocabulary: VocabularyEntry[]): Promise<Buffer> {
  const puppeteer = await import('puppeteer');

  const html = generateFlashcardHtml(vocabulary);

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Generate concept flashcard PDF buffer using Puppeteer
 */
export async function generateConceptFlashcardPdf(concepts: ConceptEntry[]): Promise<Buffer> {
  const puppeteer = await import('puppeteer');

  const html = generateConceptFlashcardHtml(concepts);

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
