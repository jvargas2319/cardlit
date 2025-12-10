import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { deduplicateVocabulary, deduplicateConcepts } from '@/lib/vocabulary/deduplicator';
import { detectChapters, assignVocabularyToChapters } from '@/lib/vocabulary/chapter-detector';
import {
  generateAnkiCsvWithBom,
  generateConceptCsvWithBom,
  generateChapterOrganizedCsvWithBom,
} from '@/lib/export/csv-generator';
import { deleteFromBlob } from '@/lib/storage/blob';
import type { VocabularyEntry, ConceptEntry, ExtractionMode, ExtractedPage, Chapter } from '@/types';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Finalize job - deduplicate vocabulary and generate CSV
 * POST /api/jobs/[id]/finalize
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

    // Get extraction mode from job
    const extractionMode = (job.extractionMode as ExtractionMode) || 'language';

    // Update job status
    await prisma.job.update({
      where: { id },
      data: {
        currentPhase: 'finalizing',
      },
    });

    // Start timing finalization
    const finalizeStartTime = Date.now();

    let csv: string;
    let count: number;

    if (extractionMode === 'concept') {
      // Concept mode
      const concepts = job.concepts as unknown as ConceptEntry[] | null;

      if (!concepts || concepts.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No concepts have been extracted yet.' },
          { status: 400 }
        );
      }

      // Deduplicate concepts
      const deduplicated = deduplicateConcepts(concepts);
      count = deduplicated.length;

      // Generate CSV for concepts
      csv = generateConceptCsvWithBom(deduplicated);

      // Clean up blob storage
      if (job.blobUrl) {
        await deleteFromBlob(job.blobUrl);
      }

      // Update job with final results
      await prisma.job.update({
        where: { id },
        data: {
          concepts: deduplicated as unknown as Prisma.InputJsonValue,
          vocabularyCount: count,
          resultCsv: csv,
          status: 'complete',
          currentPhase: 'complete',
          completedAt: new Date(),
          blobUrl: null,
        },
      });
    } else {
      // Language mode
      const vocabulary = job.vocabulary as unknown as VocabularyEntry[] | null;

      if (!vocabulary || vocabulary.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No vocabulary has been extracted yet.' },
          { status: 400 }
        );
      }

      // Deduplicate vocabulary
      const deduplicated = deduplicateVocabulary(vocabulary);
      count = deduplicated.length;

      // Detect chapters from extracted text
      const extractedText = job.extractedText as unknown as ExtractedPage[] | null;
      let chapters: Chapter[] = [];

      if (extractedText && extractedText.length > 0) {
        chapters = detectChapters(extractedText);
        console.log(`[FINALIZE] Job ${id} - Detected ${chapters.length} chapters`);
      }

      // Generate CSV (chapter-organized if chapters detected)
      if (chapters.length > 0) {
        const chapterVocabulary = assignVocabularyToChapters(deduplicated, chapters);
        csv = generateChapterOrganizedCsvWithBom(chapterVocabulary);
      } else {
        csv = generateAnkiCsvWithBom(deduplicated);
      }

      // Clean up blob storage
      if (job.blobUrl) {
        await deleteFromBlob(job.blobUrl);
      }

      // Update job with final results
      await prisma.job.update({
        where: { id },
        data: {
          vocabulary: deduplicated as unknown as Prisma.InputJsonValue,
          vocabularyCount: count,
          chapters: chapters.length > 0 ? (chapters as unknown as Prisma.InputJsonValue) : undefined,
          resultCsv: csv,
          status: 'complete',
          currentPhase: 'complete',
          completedAt: new Date(),
          blobUrl: null,
        },
      });
    }

    // Calculate finalization timing
    const finalizeTimeMs = Date.now() - finalizeStartTime;

    // Calculate total processing time
    const totalTimeMs = job.createdAt ? Date.now() - new Date(job.createdAt).getTime() : 0;
    const totalTimeSec = (totalTimeMs / 1000).toFixed(1);
    const totalTimeFormatted = totalTimeMs >= 60000
      ? `${Math.floor(totalTimeMs / 60000)}m ${Math.round((totalTimeMs % 60000) / 1000)}s`
      : `${totalTimeSec}s`;

    console.log(`[FINALIZE] Job ${id} - CSV generated in ${(finalizeTimeMs / 1000).toFixed(1)}s`);
    console.log(`[COMPLETE] Job ${id} - Total processing time: ${totalTimeFormatted} (${count} entries)`);

    return NextResponse.json({
      success: true,
      data: {
        vocabularyCount: count,
        csvReady: true,
        finalizeTimeMs,
        totalTimeMs,
        totalTimeFormatted,
      },
    });
  } catch (error) {
    console.error('Finalize job error:', error);

    // Try to update job with error status
    try {
      const { id } = await params;
      await prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Finalization failed',
        },
      });
    } catch {
      // Ignore update errors
    }

    return NextResponse.json(
      { success: false, error: 'Failed to finalize job' },
      { status: 500 }
    );
  }
}
