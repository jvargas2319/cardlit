import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { convertPdfFromUrlToImages } from '@/lib/processing/pdf-converter';
import { preprocessImages } from '@/lib/processing/preprocessor';
import { getVisionClient } from '@/lib/processing/openrouter-vision';
import { extractTextFromEpubUrl } from '@/lib/processing/epub-extractor';
import { downloadFromBlob } from '@/lib/storage/blob';
import type { ExtractedPage, PageImage } from '@/types';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface JobRecord {
  id: string;
  blobUrl: string | null;
  fileType: string;
  totalPages: number;
  pagesProcessed: number;
  extractedText: unknown;
}

/**
 * Run OCR batch in the background. Updates the DB when done.
 * Runs detached from the HTTP request lifecycle.
 */
async function runOcrBatch(
  id: string,
  job: JobRecord,
  startPage: number,
  endPage: number,
  languages: string[]
) {
  const batchStartTime = Date.now();
  let newPages: ExtractedPage[] = [];

  if (job.fileType === 'pdf') {
    const images = await convertPdfFromUrlToImages(job.blobUrl!, {
      startPage,
      endPage,
      dpi: 300,
    });

    const processedImages = await preprocessImages(images);
    const vision = await getVisionClient(languages);
    const ocrResults = await vision.processImagesBatch(processedImages);

    console.log('[OCR DEBUG] Extracted text from PDF pages:');
    for (const result of ocrResults) {
      console.log(`  Page ${result.pageNumber} (confidence: ${result.confidence?.toFixed(1) || 'N/A'}%):`);
      console.log(`  Text preview: ${result.text.substring(0, 300).replace(/\n/g, ' ')}...`);
    }

    newPages = ocrResults.map(result => ({
      pageNumber: result.pageNumber,
      text: result.text,
    }));
  } else if (job.fileType === 'epub') {
    const epubResult = await extractTextFromEpubUrl(job.blobUrl!);
    newPages = epubResult.chapters
      .filter(ch => ch.index >= startPage && ch.index <= endPage)
      .map(ch => ({
        pageNumber: ch.index,
        text: ch.text,
      }));
  } else if (job.fileType === 'image') {
    const imageBuffer = await downloadFromBlob(job.blobUrl!);
    const images: PageImage[] = [{ pageNumber: 1, buffer: imageBuffer }];
    const processedImages = await preprocessImages(images);
    const vision = await getVisionClient(languages);
    const ocrResults = await vision.processImagesBatch(processedImages);

    console.log('[OCR DEBUG] Extracted text from image:');
    for (const result of ocrResults) {
      console.log(`  Page ${result.pageNumber} (confidence: ${result.confidence?.toFixed(1) || 'N/A'}%):`);
      console.log(`  Text preview: ${result.text.substring(0, 300).replace(/\n/g, ' ')}...`);
    }

    newPages = ocrResults.map(result => ({
      pageNumber: result.pageNumber,
      text: result.text,
    }));
  }

  // Re-read job to get latest state (avoids race conditions with concurrent batches)
  const freshJob = await withRetry(() => prisma.job.findUnique({ where: { id } }));

  // If the job was already finalized (e.g. user stopped early), don't overwrite it
  if (freshJob?.status === 'complete') return;

  const existingText = (freshJob?.extractedText as unknown as ExtractedPage[]) || [];
  const updatedText = [...existingText, ...newPages];

  const pagesProcessed = Math.max(freshJob?.pagesProcessed ?? 0, endPage);

  const batchTimeMs = Date.now() - batchStartTime;
  const pagesInBatch = endPage - startPage + 1;
  const avgPageTimeMs = Math.round(batchTimeMs / pagesInBatch);
  const totalBatches = Math.ceil(job.totalPages / pagesInBatch);
  const currentBatch = Math.ceil(endPage / pagesInBatch);

  console.log(`[PROCESS] Job ${id} - OCR Batch ${currentBatch}/${totalBatches} (pages ${startPage}-${endPage}) completed in ${(batchTimeMs / 1000).toFixed(1)}s (${avgPageTimeMs}ms/page)`);

  await withRetry(() => prisma.job.update({
    where: { id },
    data: {
      extractedText: updatedText as unknown as Prisma.InputJsonValue,
      pagesProcessed,
      currentPhase: pagesProcessed >= job.totalPages ? 'ocr_complete' : 'ocr',
    },
  }));
}

/**
 * Process a batch of pages (OCR) - fire-and-forget
 * POST /api/jobs/[id]/process
 * Body: { startPage: number, endPage: number, languages?: string[] }
 *
 * Returns 202 immediately. OCR runs in the background.
 * Client polls GET /api/jobs/[id]/status to track progress.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { startPage, endPage, languages = ['ar', 'en'] } = body;

    if (!startPage || !endPage || startPage > endPage) {
      return NextResponse.json(
        { success: false, error: 'Invalid page range' },
        { status: 400 }
      );
    }

    const job = await withRetry(() => prisma.job.findFirst({
      where: { id, userId },
    }));

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (!job.blobUrl) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded for this job' },
        { status: 400 }
      );
    }

    await withRetry(() => prisma.job.update({
      where: { id },
      data: {
        status: 'processing',
        currentPhase: 'ocr',
      },
    }));

    // Kick off OCR in background (no await)
    runOcrBatch(id, job, startPage, endPage, languages).catch(async (error) => {
      console.error('Background OCR error:', error);
      try {
        const currentJob = await prisma.job.findUnique({ where: { id }, select: { status: true } });
        if (currentJob?.status === 'complete') return;
        await withRetry(() => prisma.job.update({
          where: { id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Processing failed',
          },
        }));
      } catch {
        // Ignore update errors
      }
    });

    return NextResponse.json(
      {
        success: true,
        data: { status: 'accepted', startPage, endPage },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Process batch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start batch processing' },
      { status: 500 }
    );
  }
}
