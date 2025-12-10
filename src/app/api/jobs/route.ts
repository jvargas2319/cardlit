import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { uploadToBlob } from '@/lib/storage/blob';
import { getPdfPageCount } from '@/lib/processing/pdf-converter';
import { getEpubChapterCount } from '@/lib/processing/epub-extractor';
import { isImageExtension, validateImageBuffer } from '@/lib/processing/image-validator';
import { canProcessPages, recordPageUsage } from '@/lib/subscription/usage';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for Pro plan

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'language';

    // Validate mode
    const extractionMode = mode === 'concept' ? 'concept' : 'language';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isEpub = fileName.endsWith('.epub');
    const isImage = isImageExtension(fileName);

    if (!isPdf && !isEpub && !isImage) {
      return NextResponse.json(
        { success: false, error: 'Only PDF, EPUB, and image files (PNG, JPG, WebP) are supported' },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // For images, validate using magic bytes
    if (isImage) {
      const validation = validateImageBuffer(fileBuffer);
      if (!validation.isValid) {
        return NextResponse.json(
          { success: false, error: validation.error || 'Invalid image file' },
          { status: 400 }
        );
      }
    }

    // Determine file type
    let fileType: 'pdf' | 'epub' | 'image';
    if (isPdf) fileType = 'pdf';
    else if (isEpub) fileType = 'epub';
    else fileType = 'image';

    // Get page/chapter count (images = 1 page)
    let totalPages: number;
    try {
      if (fileType === 'pdf') {
        totalPages = await getPdfPageCount(fileBuffer);
      } else if (fileType === 'epub') {
        totalPages = await getEpubChapterCount(fileBuffer);
      } else {
        totalPages = 1; // Single image = 1 page
      }
    } catch (error) {
      console.error('Failed to get page count:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to read file. Make sure it is a valid PDF or EPUB.' },
        { status: 400 }
      );
    }

    // Check subscription limits BEFORE uploading
    const limitCheck = await canProcessPages(userId, totalPages);

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'page_limit_exceeded',
          details: {
            requested: totalPages,
            remaining: limitCheck.remaining,
            tier: limitCheck.tier,
            message: limitCheck.message,
          },
        },
        { status: 402 } // Payment Required
      );
    }

    // Upload to Vercel Blob
    const { url: blobUrl } = await uploadToBlob(fileBuffer, `uploads/${file.name}`);

    // Create job record
    const job = await prisma.job.create({
      data: {
        userId,
        fileName: file.name,
        fileType,
        fileSize: file.size,
        totalPages,
        blobUrl,
        status: 'pending',
        currentPhase: 'uploaded',
        extractionMode,
        extractedText: [],
        vocabulary: [],
        concepts: [],
      },
    });

    // Record page usage after successful job creation
    await recordPageUsage(userId, totalPages);

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        totalPages,
        fileName: job.fileName,
        fileType: job.fileType,
      },
    });
  } catch (error) {
    console.error('Job creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create job' },
      { status: 500 }
    );
  }
}

// Get all jobs for the current user
export async function GET() {
  try {
    const userId = await getAuthUser();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const jobs = await prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        status: true,
        currentPhase: true,
        totalPages: true,
        pagesProcessed: true,
        vocabularyCount: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get jobs' },
      { status: 500 }
    );
  }
}
