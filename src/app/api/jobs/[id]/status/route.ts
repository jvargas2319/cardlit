import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Get job status for polling during extraction
 * GET /api/jobs/[id]/status
 * Returns: { phase, currentChunk, totalChunks, vocabularyCount, error }
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

    // Get job status - only select the fields we need for polling
    const job = await withRetry(() => prisma.job.findFirst({
      where: { id, userId },
      select: {
        currentPhase: true,
        currentChunk: true,
        totalChunks: true,
        vocabularyCount: true,
        pagesProcessed: true,
        totalPages: true,
        status: true,
        error: true,
      },
    }));

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        phase: job.currentPhase,
        currentChunk: job.currentChunk,
        totalChunks: job.totalChunks,
        vocabularyCount: job.vocabularyCount,
        pagesProcessed: job.pagesProcessed,
        totalPages: job.totalPages,
        status: job.status,
        error: job.error,
      },
    });
  } catch (error) {
    console.error('Get job status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}
