import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { chunkPageTexts } from '@/lib/vocabulary/chunker';
import type { ExtractedPage } from '@/types';

export const runtime = 'nodejs';

/**
 * Get the number of chunks for extraction
 * GET /api/jobs/[id]/chunks
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

    return NextResponse.json({
      success: true,
      data: {
        totalChunks: chunks.length,
        extractionMode: job.extractionMode || 'language',
      },
    });
  } catch (error) {
    console.error('Get chunks error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get chunk count' },
      { status: 500 }
    );
  }
}

