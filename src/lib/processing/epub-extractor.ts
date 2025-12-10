/**
 * EPUB Text Extractor
 * Extracts text content from EPUB files
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface EPubChapter {
  id: string;
  title?: string;
}

interface EPubFlow {
  id: string;
  href?: string;
  title?: string;
}

interface EPubInstance {
  metadata: {
    title?: string;
    creator?: string;
  };
  flow: EPubFlow[];
  toc: EPubChapter[];
  getChapter: (id: string, callback: (err: Error | null, text: string) => void) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  parse: () => void;
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text from EPUB buffer
 * Returns array of chapter texts
 */
export async function extractTextFromEpub(buffer: Buffer): Promise<{
  chapters: Array<{ title: string; text: string; index: number }>;
  metadata: { title?: string; author?: string };
}> {
  // epub2 requires a file path
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `epub-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`);

  try {
    fs.writeFileSync(tempFile, buffer);

    const EPub = (await import('epub2')).default;

    return new Promise((resolve, reject) => {
      const epub = new EPub(tempFile) as EPubInstance;

      epub.on('end', async () => {
        const chapters: Array<{ title: string; text: string; index: number }> = [];

        // Process each chapter in the flow
        for (let i = 0; i < epub.flow.length; i++) {
          const chapter = epub.flow[i];

          try {
            const text = await new Promise<string>((res, rej) => {
              epub.getChapter(chapter.id, (err, content) => {
                if (err) rej(err);
                else res(stripHtml(content || ''));
              });
            });

            // Only include chapters with meaningful content
            if (text.length > 50) {
              chapters.push({
                title: chapter.title || `Chapter ${i + 1}`,
                text,
                index: i + 1,
              });
            }
          } catch (error) {
            console.error(`Error extracting chapter ${chapter.id}:`, error);
          }
        }

        resolve({
          chapters,
          metadata: {
            title: epub.metadata.title,
            author: epub.metadata.creator,
          },
        });
      });

      epub.on('error', reject);
      epub.parse();
    });
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract text from EPUB at URL
 */
export async function extractTextFromEpubUrl(url: string): Promise<{
  chapters: Array<{ title: string; text: string; index: number }>;
  metadata: { title?: string; author?: string };
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download EPUB: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractTextFromEpub(buffer);
}

/**
 * Get "page count" for EPUB (number of chapters)
 */
export async function getEpubChapterCount(buffer: Buffer): Promise<number> {
  const result = await extractTextFromEpub(buffer);
  return result.chapters.length;
}
