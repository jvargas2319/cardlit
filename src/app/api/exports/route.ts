import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma, withRetry } from '@/lib/db';
import { uploadToBlob } from '@/lib/storage/blob';
import { canUserSaveExport, recordExportSaved, calculateExpirationDate, getExportUsage } from '@/lib/subscription/exports';
import { isValidTier, TierName } from '@/lib/subscription/tiers';
import { generateAnkiCsvWithBom, generateConceptCsvWithBom } from '@/lib/export/csv-generator';
import { generateFlashcardPdf, generateConceptFlashcardPdf } from '@/lib/export/flashcard-generator';
import type { SavedExportType, VocabularyEntry, ConceptEntry } from '@/types';

// GET - List user's saved exports
export async function GET() {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const exports = await withRetry(() => prisma.savedExport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: {
            fileName: true,
            extractionMode: true,
          },
        },
      },
    }));

    const usage = await getExportUsage(userId);

    return NextResponse.json({
      success: true,
      data: {
        exports: exports.map(exp => ({
          id: exp.id,
          name: exp.name,
          type: exp.type,
          fileSize: exp.fileSize,
          itemCount: exp.itemCount,
          expiresAt: exp.expiresAt?.toISOString() || null,
          createdAt: exp.createdAt.toISOString(),
          jobFileName: exp.job?.fileName || 'Unknown',
          extractionMode: exp.job?.extractionMode || 'language',
        })),
        usage,
      },
    });
  } catch (error) {
    console.error('List exports error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list exports' },
      { status: 500 }
    );
  }
}

// POST - Save a new export
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId, type, name } = body as {
      jobId: string;
      type: SavedExportType;
      name?: string;
    };

    // Validate inputs
    if (!jobId || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const validTypes: SavedExportType[] = ['csv_anki', 'csv_excel', 'flashcards_pdf'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid export type' },
        { status: 400 }
      );
    }

    // Check if user can save exports
    const canSave = await canUserSaveExport(userId);
    if (!canSave.allowed) {
      return NextResponse.json(
        { success: false, error: canSave.reason },
        { status: 402 }
      );
    }

    // Get the job
    const job = await withRetry(() => prisma.job.findFirst({
      where: { id: jobId, userId },
    }));

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'complete') {
      return NextResponse.json(
        { success: false, error: 'Job is not complete' },
        { status: 400 }
      );
    }

    // Generate the export file
    let fileBuffer: Buffer;
    let fileName: string;
    let _contentType: string;

    const isConceptMode = job.extractionMode === 'concept';
    const vocabulary = (job.vocabulary as unknown as VocabularyEntry[]) || [];
    const concepts = (job.concepts as unknown as ConceptEntry[]) || [];
    const itemCount = isConceptMode ? concepts.length : vocabulary.length;

    if (type === 'csv_anki' || type === 'csv_excel') {
      // Generate CSV
      let csvContent: string;
      if (isConceptMode) {
        csvContent = generateConceptCsvWithBom(concepts);
      } else {
        csvContent = generateAnkiCsvWithBom(vocabulary);
      }

      // For Excel, use UTF-16LE encoding
      if (type === 'csv_excel') {
        fileBuffer = Buffer.from('\ufeff' + csvContent, 'utf16le');
      } else {
        fileBuffer = Buffer.from(csvContent, 'utf-8');
      }

      fileName = `${job.fileName.replace(/\.[^/.]+$/, '')}_${type === 'csv_excel' ? 'excel' : 'anki'}.csv`;
      _contentType = 'text/csv';
    } else {
      // Generate PDF flashcards
      if (isConceptMode) {
        fileBuffer = await generateConceptFlashcardPdf(concepts);
      } else {
        fileBuffer = await generateFlashcardPdf(vocabulary);
      }
      fileName = `${job.fileName.replace(/\.[^/.]+$/, '')}_flashcards.pdf`;
      _contentType = 'application/pdf';
    }

    // Silence unused variable warning
    void _contentType;

    // Upload to blob storage
    const { url } = await uploadToBlob(fileBuffer, fileName);

    // Get user's tier for expiration calculation
    const subscription = await withRetry(() => prisma.subscription.findUnique({
      where: { userId },
    }));
    const tier: TierName = subscription?.tier && isValidTier(subscription.tier)
      ? subscription.tier as TierName
      : 'trial';
    const expiresAt = calculateExpirationDate(tier);

    // Create the saved export record
    const exportName = name || `${job.fileName} - ${type === 'flashcards_pdf' ? 'Flashcards' : type === 'csv_anki' ? 'Anki CSV' : 'Excel CSV'}`;

    const savedExport = await withRetry(() => prisma.savedExport.create({
      data: {
        userId,
        jobId,
        name: exportName,
        type,
        fileUrl: url,
        fileSize: fileBuffer.length,
        itemCount,
        expiresAt,
      },
    }));

    // Record the export usage
    await recordExportSaved(userId);

    // Get updated usage
    const usage = await getExportUsage(userId);

    return NextResponse.json({
      success: true,
      data: {
        export: {
          id: savedExport.id,
          name: savedExport.name,
          type: savedExport.type,
          fileSize: savedExport.fileSize,
          itemCount: savedExport.itemCount,
          expiresAt: savedExport.expiresAt?.toISOString() || null,
          createdAt: savedExport.createdAt.toISOString(),
        },
        usage,
      },
    });
  } catch (error) {
    console.error('Save export error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save export' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
