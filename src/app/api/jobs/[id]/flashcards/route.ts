import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { generateFlashcardHtml, generateConceptFlashcardHtml } from '@/lib/export/flashcard-generator';
import type { VocabularyEntry, ConceptEntry, ExtractionMode } from '@/types';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Generate printable flashcards PDF
 * GET /api/jobs/[id]/flashcards
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let browser = null;

  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Get job with vocabulary/concepts
    const job = await prisma.job.findFirst({
      where: { id, userId },
      select: {
        id: true,
        fileName: true,
        status: true,
        vocabulary: true,
        concepts: true,
        extractionMode: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'complete') {
      return NextResponse.json(
        { success: false, error: 'Job must be completed first' },
        { status: 400 }
      );
    }

    // Get extraction mode
    const extractionMode = (job.extractionMode as ExtractionMode) || 'language';
    let html: string;

    if (extractionMode === 'concept') {
      // Concept mode - use concepts
      const concepts = job.concepts as unknown as ConceptEntry[] | null;

      if (!concepts || concepts.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No concepts found' },
          { status: 400 }
        );
      }

      html = generateConceptFlashcardHtml(concepts);
    } else {
      // Language mode - use vocabulary
      const vocabulary = job.vocabulary as unknown as VocabularyEntry[] | null;

      if (!vocabulary || vocabulary.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No vocabulary found' },
          { status: 400 }
        );
      }

      html = generateFlashcardHtml(vocabulary);
    }

    // Launch Puppeteer and generate PDF
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Set content and wait for fonts to load
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    // Wait for fonts to be ready
    await page.evaluateHandle('document.fonts.ready');

    // Generate PDF
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

    await browser.close();
    browser = null;

    // Generate filename
    const baseName = job.fileName.replace(/\.(pdf|epub)$/i, '');
    const pdfFileName = `${baseName}_flashcards.pdf`;

    // Return PDF as download
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFileName}"`,
      },
    });
  } catch (error) {
    console.error('Flashcard generation error:', error);

    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate flashcards PDF' },
      { status: 500 }
    );
  }
}
