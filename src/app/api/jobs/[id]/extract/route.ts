import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { extractFromPages } from '@/lib/vocabulary/extractor';
import type { ExtractedPage, VocabularyEntry, ConceptEntry, ExtractionMode } from '@/types';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for Vercel Pro

/**
 * Extract vocabulary from accumulated text
 * POST /api/jobs/[id]/extract
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

    const extractedText = job.extractedText as unknown as ExtractedPage[] | null;

    if (!extractedText || extractedText.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No text has been extracted yet. Run OCR first.' },
        { status: 400 }
      );
    }

    // Get extraction mode from job
    const extractionMode = (job.extractionMode as ExtractionMode) || 'language';

    // Update job status
    await prisma.job.update({
      where: { id },
      data: {
        status: 'processing',
        currentPhase: 'extracting',
      },
    });

    // Start timing extraction
    const extractionStartTime = Date.now();

    // Extract based on mode using unified function with progress tracking
    const result = await extractFromPages(extractedText, extractionMode, {
      onProgress: async (current: number, total: number) => {
        // Update progress in database for polling
        await prisma.job.update({
          where: { id },
          data: {
            currentChunk: current,
            totalChunks: total,
          },
        });
      },
    });

    // Calculate extraction timing
    const extractionTimeMs = Date.now() - extractionStartTime;
    console.log(`[EXTRACT] Job ${id} - Extraction complete: ${result.stats.deduplicatedEntries} entries in ${(extractionTimeMs / 1000).toFixed(1)}s (${result.stats.totalChunks} chunks processed)`);

    if (extractionMode === 'concept') {
      // Concept mode - store concepts
      const existingConcepts = (job.concepts as unknown as ConceptEntry[]) || [];
      const allConcepts = [...existingConcepts, ...result.concepts];

      await prisma.job.update({
        where: { id },
        data: {
          concepts: allConcepts as unknown as Prisma.InputJsonValue,
          vocabularyCount: allConcepts.length, // Reuse vocabularyCount for total entries
          currentPhase: 'extraction_complete',
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          vocabularyCount: allConcepts.length,
          stats: result.stats,
          errors: result.errors,
          extractionTimeMs,
          chunksProcessed: result.stats.totalChunks,
        },
      });
    } else {
      // Language mode - store vocabulary
      const existingVocabulary = (job.vocabulary as unknown as VocabularyEntry[]) || [];
      const allVocabulary = [...existingVocabulary, ...result.vocabulary];

      await prisma.job.update({
        where: { id },
        data: {
          vocabulary: allVocabulary as unknown as Prisma.InputJsonValue,
          vocabularyCount: allVocabulary.length,
          currentPhase: 'extraction_complete',
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          vocabularyCount: allVocabulary.length,
          stats: result.stats,
          errors: result.errors,
          extractionTimeMs,
          chunksProcessed: result.stats.totalChunks,
        },
      });
    }
  } catch (error) {
    console.error('Extract vocabulary error:', error);

    // Try to update job with error status
    try {
      const { id } = await params;
      await prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Vocabulary extraction failed',
        },
      });
    } catch {
      // Ignore update errors
    }

    return NextResponse.json(
      { success: false, error: 'Failed to extract vocabulary' },
      { status: 500 }
    );
  }
}
