import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { chunkPageTexts } from '@/lib/vocabulary/chunker';
import { extractVocabularyFromChunk, extractConceptsFromChunk } from '@/lib/vocabulary/extractor';
import { deduplicateVocabulary, deduplicateConcepts } from '@/lib/vocabulary/deduplicator';
import type { ExtractedPage, VocabularyEntry, ConceptEntry, ExtractionMode } from '@/types';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max per chunk

/**
 * Extract vocabulary/concepts from a single chunk
 * POST /api/jobs/[id]/extract-chunk
 * Body: { chunkIndex: number }
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
    const { chunkIndex } = body;

    if (typeof chunkIndex !== 'number' || chunkIndex < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid chunk index' },
        { status: 400 }
      );
    }

    // Get job
    const job = await withRetry(() => prisma.job.findFirst({
      where: { id, userId },
    }));

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

    // Calculate chunks
    const chunks = chunkPageTexts(extractedText, { maxTokens: 5000 });
    const totalChunks = chunks.length;

    if (chunkIndex >= totalChunks) {
      return NextResponse.json(
        { success: false, error: `Chunk index ${chunkIndex} out of range (total: ${totalChunks})` },
        { status: 400 }
      );
    }

    const chunk = chunks[chunkIndex];
    const extractionMode = (job.extractionMode as ExtractionMode) || 'language';

    // Update job status
    await withRetry(() => prisma.job.update({
      where: { id },
      data: {
        status: 'processing',
        currentPhase: 'extracting',
        currentChunk: chunkIndex + 1,
        totalChunks,
      },
    }));

    // Start timing
    const startTime = Date.now();

    let newEntries: VocabularyEntry[] | ConceptEntry[] = [];
    let error: string | undefined;

    if (extractionMode === 'concept') {
      const result = await extractConceptsFromChunk(chunk, totalChunks);
      if (result.error) {
        error = result.error;
      } else {
        newEntries = result.concepts;
      }
    } else {
      const result = await extractVocabularyFromChunk(chunk, totalChunks);
      if (result.error) {
        error = result.error;
      } else {
        newEntries = result.vocabulary;
      }
    }

    const chunkTimeMs = Date.now() - startTime;
    console.log(`[EXTRACT] Job ${id} - Chunk ${chunkIndex + 1}/${totalChunks} completed in ${(chunkTimeMs / 1000).toFixed(1)}s with ${newEntries.length} entries`);

    // Get existing entries and append
    if (extractionMode === 'concept') {
      const existingConcepts = (job.concepts as unknown as ConceptEntry[]) || [];
      const allConcepts = [...existingConcepts, ...(newEntries as ConceptEntry[])];
      
      // Deduplicate on the fly
      const deduplicated = deduplicateConcepts(allConcepts);

      await withRetry(() => prisma.job.update({
        where: { id },
        data: {
          concepts: deduplicated as unknown as Prisma.InputJsonValue,
          vocabularyCount: deduplicated.length,
          currentPhase: chunkIndex + 1 >= totalChunks ? 'extraction_complete' : 'extracting',
        },
      }));

      return NextResponse.json({
        success: true,
        data: {
          chunkIndex,
          totalChunks,
          entriesFound: newEntries.length,
          totalEntries: deduplicated.length,
          chunkTimeMs,
          isComplete: chunkIndex + 1 >= totalChunks,
          error,
        },
      });
    } else {
      const existingVocabulary = (job.vocabulary as unknown as VocabularyEntry[]) || [];
      const allVocabulary = [...existingVocabulary, ...(newEntries as VocabularyEntry[])];
      
      // Deduplicate on the fly
      const deduplicated = deduplicateVocabulary(allVocabulary);

      await withRetry(() => prisma.job.update({
        where: { id },
        data: {
          vocabulary: deduplicated as unknown as Prisma.InputJsonValue,
          vocabularyCount: deduplicated.length,
          currentPhase: chunkIndex + 1 >= totalChunks ? 'extraction_complete' : 'extracting',
        },
      }));

      return NextResponse.json({
        success: true,
        data: {
          chunkIndex,
          totalChunks,
          entriesFound: newEntries.length,
          totalEntries: deduplicated.length,
          chunkTimeMs,
          isComplete: chunkIndex + 1 >= totalChunks,
          error,
        },
      });
    }
  } catch (error) {
    console.error('Extract chunk error:', error);

    // Try to update job with error status
    try {
      const { id } = await params;
      await withRetry(() => prisma.job.update({
        where: { id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Chunk extraction failed',
        },
      }));
    } catch {
      // Ignore update errors
    }

    return NextResponse.json(
      { success: false, error: 'Failed to extract chunk' },
      { status: 500 }
    );
  }
}

