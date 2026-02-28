import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

/**
 * Convert string to UTF-16LE with BOM
 * This encoding is the most reliable for Excel with Arabic/non-ASCII characters
 */
function stringToUtf16LE(str: string): Buffer {
  // Use Node.js Buffer for proper UTF-16LE encoding
  // This correctly handles all Unicode characters including Arabic
  const bom = Buffer.from([0xFF, 0xFE]); // UTF-16LE BOM
  const content = Buffer.from(str, 'utf16le');
  return Buffer.concat([bom, content]);
}

/**
 * Download CSV file
 * GET /api/jobs/[id]/download
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
      select: {
        id: true,
        fileName: true,
        status: true,
        resultCsv: true,
      },
    }));

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'complete' || !job.resultCsv) {
      return NextResponse.json(
        { success: false, error: 'CSV not ready. Job must be completed first.' },
        { status: 400 }
      );
    }

    // Get format from query parameter (default to anki for UTF-8)
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'anki';

    // Generate filename
    const baseName = job.fileName.replace(/\.pdf$/i, '');
    const csvFileName = `${baseName}_vocabulary.csv`;

    if (format === 'excel') {
      // UTF-16LE with BOM for Excel compatibility with Arabic/Chinese characters
      const csvBytes = stringToUtf16LE(job.resultCsv);
      return new NextResponse(new Uint8Array(csvBytes), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-16le',
          'Content-Disposition': `attachment; filename="${csvFileName}"`,
        },
      });
    } else {
      // UTF-8 for Anki with separator header
      const ankiCsv = '#separator:Tab\n' + job.resultCsv;
      return new NextResponse(ankiCsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${csvFileName}"`,
        },
      });
    }
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download CSV' },
      { status: 500 }
    );
  }
}
