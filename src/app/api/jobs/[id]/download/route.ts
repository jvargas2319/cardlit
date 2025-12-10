import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

/**
 * Convert string to UTF-16LE with BOM
 * This encoding is the most reliable for Excel with Arabic/non-ASCII characters
 */
function stringToUtf16LE(str: string): Uint8Array {
  // UTF-16LE BOM: FF FE
  const bom = new Uint8Array([0xFF, 0xFE]);

  // Convert string to UTF-16LE (2 bytes per character)
  const utf16 = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    utf16[i * 2] = code & 0xFF;           // Low byte
    utf16[i * 2 + 1] = (code >> 8) & 0xFF; // High byte
  }

  // Combine BOM + content
  const result = new Uint8Array(bom.length + utf16.length);
  result.set(bom, 0);
  result.set(utf16, bom.length);

  return result;
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
    const job = await prisma.job.findFirst({
      where: { id, userId },
      select: {
        id: true,
        fileName: true,
        status: true,
        resultCsv: true,
      },
    });

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
    const baseName = job.fileName.replace(/\.(pdf|epub)$/i, '');
    const csvFileName = `${baseName}_vocabulary.csv`;

    if (format === 'excel') {
      // UTF-16LE with BOM for Excel compatibility with Arabic/Chinese characters
      const csvBytes = stringToUtf16LE(job.resultCsv);
      return new NextResponse(Buffer.from(csvBytes), {
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
