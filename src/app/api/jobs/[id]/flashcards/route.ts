import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { generateFlashcardPdf, generateConceptFlashcardPdf } from '@/lib/export/flashcard-generator';
import type { VocabularyEntry, ConceptEntry, ExtractionMode } from '@/types';

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
    const job = await withRetry(() => prisma.job.findFirst({
      where: { id, userId },
      select: {
        id: true,
        fileName: true,
        status: true,
        vocabulary: true,
        concepts: true,
        extractionMode: true,
      },
    }));

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
    let pdfBuffer: Buffer;

    if (extractionMode === 'concept') {
      // Concept mode - use concepts
      const concepts = job.concepts as unknown as ConceptEntry[] | null;

      if (!concepts || concepts.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No concepts found' },
          { status: 400 }
        );
      }

      pdfBuffer = await generateConceptFlashcardPdf(concepts);
    } else {
      // Language mode - use vocabulary
      const vocabulary = job.vocabulary as unknown as VocabularyEntry[] | null;

      if (!vocabulary || vocabulary.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No vocabulary found' },
          { status: 400 }
        );
      }

      pdfBuffer = await generateFlashcardPdf(vocabulary);
    }

    // Generate filename
    const baseName = job.fileName.replace(/\.(pdf|epub)$/i, '');
    const pdfFileName = `${baseName}_flashcards.pdf`;

    // Return PDF as download
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFileName}"`,
      },
    });
  } catch (error) {
    console.error('Flashcard generation error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to generate flashcards PDF' },
      { status: 500 }
    );
  }
}
