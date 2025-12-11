import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { convertPdfFromUrlToImages } from '@/lib/processing/pdf-converter';
import { preprocessImages } from '@/lib/processing/preprocessor';
import { getVisionClient } from '@/lib/processing/google-vision';
import { extractTextFromEpubUrl } from '@/lib/processing/epub-extractor';
import { downloadFromBlob } from '@/lib/storage/blob';
import type { ExtractedPage, PageImage } from '@/types';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for Vercel Pro

/**
 * Process a batch of pages (OCR)
 * POST /api/jobs/[id]/process
 * Body: { startPage: number, endPage: number, languages?: string[] }
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
    const { startPage, endPage, languages = ['ar', 'en'] } = body;  // Default to Arabic+English for multilingual support

    // Validate input
    if (!startPage || !endPage || startPage > endPage) {
      return NextResponse.json(
        { success: false, error: 'Invalid page range' },
        { status: 400 }
      );
    }

    // Get job
    const job = await prisma.job.findFirst({
      where: { id, userId },
    });

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

    // Update job status
    await prisma.job.update({
      where: { id },
      data: {
        status: 'processing',
        currentPhase: 'ocr',
      },
    });

    // Start timing this batch
    const batchStartTime = Date.now();
    let newPages: ExtractedPage[] = [];

    if (job.fileType === 'pdf') {
      // Convert PDF pages to images
      const images = await convertPdfFromUrlToImages(job.blobUrl, {
        startPage,
        endPage,
        dpi: 300,
      });

      // Preprocess images for better OCR
      const processedImages = await preprocessImages(images);

      // Run OCR
      const vision = await getVisionClient(languages);
      const ocrResults = await vision.processImagesBatch(processedImages);

      // Debug: Log OCR output to help diagnose extraction issues
      console.log('[OCR DEBUG] Extracted text from PDF pages:');
      for (const result of ocrResults) {
        console.log(`  Page ${result.pageNumber} (confidence: ${result.confidence?.toFixed(1) || 'N/A'}%):`);
        // Log first 300 chars to see what OCR captured (especially from colored regions)
        console.log(`  Text preview: ${result.text.substring(0, 300).replace(/\n/g, ' ')}...`);
      }

      // Convert to ExtractedPage format
      newPages = ocrResults.map(result => ({
        pageNumber: result.pageNumber,
        text: result.text,
      }));
    } else if (job.fileType === 'epub') {
      // For EPUB, extract text directly (no OCR needed for most EPUBs)
      const epubResult = await extractTextFromEpubUrl(job.blobUrl);

      // Map chapters to pages (startPage/endPage refer to chapter indices)
      newPages = epubResult.chapters
        .filter(ch => ch.index >= startPage && ch.index <= endPage)
        .map(ch => ({
          pageNumber: ch.index,
          text: ch.text,
        }));
    } else if (job.fileType === 'image') {
      // For images, download and process directly through OCR
      const imageBuffer = await downloadFromBlob(job.blobUrl);

      // Create PageImage array (single image = page 1)
      const images: PageImage[] = [{
        pageNumber: 1,
        buffer: imageBuffer,
      }];

      // Preprocess image for better OCR
      const processedImages = await preprocessImages(images);

      // Run OCR
      const vision = await getVisionClient(languages);
      const ocrResults = await vision.processImagesBatch(processedImages);

      // Debug: Log OCR output to help diagnose extraction issues
      console.log('[OCR DEBUG] Extracted text from image:');
      for (const result of ocrResults) {
        console.log(`  Page ${result.pageNumber} (confidence: ${result.confidence?.toFixed(1) || 'N/A'}%):`);
        console.log(`  Text preview: ${result.text.substring(0, 300).replace(/\n/g, ' ')}...`);
      }

      // Convert to ExtractedPage format
      newPages = ocrResults.map(result => ({
        pageNumber: result.pageNumber,
        text: result.text,
      }));
    }

    // Get existing extracted text and append
    const existingText = (job.extractedText as unknown as ExtractedPage[]) || [];
    const updatedText = [...existingText, ...newPages];

    // Calculate pages processed
    const pagesProcessed = Math.max(
      job.pagesProcessed,
      endPage
    );

    // Calculate timing
    const batchTimeMs = Date.now() - batchStartTime;
    const pagesInBatch = endPage - startPage + 1;
    const avgPageTimeMs = Math.round(batchTimeMs / pagesInBatch);
    const totalBatches = Math.ceil(job.totalPages / (endPage - startPage + 1));
    const currentBatch = Math.ceil(endPage / (endPage - startPage + 1));

    // Log timing for debugging
    console.log(`[PROCESS] Job ${id} - OCR Batch ${currentBatch}/${totalBatches} (pages ${startPage}-${endPage}) completed in ${(batchTimeMs / 1000).toFixed(1)}s (${avgPageTimeMs}ms/page)`);

    // Update job with new text
    await prisma.job.update({
      where: { id },
      data: {
        extractedText: updatedText as unknown as Prisma.InputJsonValue,
        pagesProcessed,
        currentPhase: pagesProcessed >= job.totalPages ? 'ocr_complete' : 'ocr',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        pagesProcessed,
        totalPages: job.totalPages,
        newPagesCount: newPages.length,
        status: pagesProcessed >= job.totalPages ? 'ocr_complete' : 'processing',
        // Timing data
        batchTimeMs,
        avgPageTimeMs,
        currentBatch,
        totalBatches,
      },
    });
  } catch (error) {
    console.error('Process batch error:', error);

    // Try to update job with error status
    try {
      const { id } = await params;
      await prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Processing failed',
        },
      });
    } catch {
      // Ignore update errors
    }

    return NextResponse.json(
      { success: false, error: 'Failed to process batch' },
      { status: 500 }
    );
  }
}
