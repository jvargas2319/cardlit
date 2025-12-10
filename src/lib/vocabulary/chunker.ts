/**
 * Text Chunking for LLM Processing
 * Splits text into manageable chunks while respecting boundaries
 */

export interface TextChunk {
  index: number;
  text: string;
  tokenEstimate: number;
  startPage?: number;
  endPage?: number;
}

/**
 * Estimate token count (rough approximation: 1 token ~= 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text into smaller pieces for LLM processing
 */
export function chunkText(
  text: string,
  options: {
    maxTokens?: number;
    overlapTokens?: number;
  } = {}
): TextChunk[] {
  const { maxTokens = 5000, overlapTokens = 500 } = options;

  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks: TextChunk[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChars;

    // If we're not at the end, try to break at a paragraph or sentence
    if (endIndex < text.length) {
      // Look for paragraph break within last 20% of chunk
      const searchStart = startIndex + Math.floor(maxChars * 0.8);
      const searchRegion = text.substring(searchStart, endIndex);

      const paragraphBreak = searchRegion.lastIndexOf('\n\n');
      if (paragraphBreak !== -1) {
        endIndex = searchStart + paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = searchRegion.lastIndexOf('. ');
        if (sentenceBreak !== -1) {
          endIndex = searchStart + sentenceBreak + 2;
        }
      }
    }

    const chunkText = text.substring(startIndex, endIndex).trim();

    if (chunkText.length > 0) {
      chunks.push({
        index: chunks.length,
        text: chunkText,
        tokenEstimate: estimateTokens(chunkText),
      });
    }

    // Move start with overlap
    startIndex = endIndex - overlapChars;

    // Make sure we're making progress
    if (startIndex <= chunks[chunks.length - 1]?.index || 0) {
      startIndex = endIndex;
    }
  }

  return chunks;
}

/**
 * Chunk page-based text (from OCR results)
 */
export function chunkPageTexts(
  pages: Array<{ pageNumber: number; text: string }>,
  options: {
    maxTokens?: number;
    overlapTokens?: number;
  } = {}
): TextChunk[] {
  const { maxTokens = 5000 } = options;

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startPage = pages[0]?.pageNumber || 1;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageTokens = estimateTokens(page.text);

    // Check if adding this page would exceed limit
    if (currentTokens + pageTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        index: chunks.length,
        text: currentChunk.join('\n\n'),
        tokenEstimate: currentTokens,
        startPage,
        endPage: pages[i - 1]?.pageNumber || startPage,
      });

      // Start new chunk with overlap from last 2 pages
      const overlapPages = currentChunk.slice(-2);
      currentChunk = [...overlapPages];
      currentTokens = overlapPages.reduce((sum, p) => sum + estimateTokens(p), 0);
      startPage = Math.max(1, (pages[i - 1]?.pageNumber || 1) - 1);
    }

    currentChunk.push(page.text);
    currentTokens += pageTokens;
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunks.length,
      text: currentChunk.join('\n\n'),
      tokenEstimate: currentTokens,
      startPage,
      endPage: pages[pages.length - 1]?.pageNumber || startPage,
    });
  }

  return chunks;
}
