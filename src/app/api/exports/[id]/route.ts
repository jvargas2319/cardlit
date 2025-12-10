import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { downloadFromBlob, deleteFromBlob } from '@/lib/storage/blob';

// GET - Download a saved export
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

    // Get the export
    const savedExport = await prisma.savedExport.findFirst({
      where: { id, userId },
    });

    if (!savedExport) {
      return NextResponse.json(
        { success: false, error: 'Export not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (savedExport.expiresAt && savedExport.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Export has expired' },
        { status: 410 }
      );
    }

    // Download from blob storage
    const fileBuffer = await downloadFromBlob(savedExport.fileUrl);

    // Determine content type and filename
    let contentType: string;
    let extension: string;

    switch (savedExport.type) {
      case 'flashcards_pdf':
        contentType = 'application/pdf';
        extension = 'pdf';
        break;
      case 'csv_excel':
      case 'csv_anki':
      default:
        contentType = 'text/csv';
        extension = 'csv';
        break;
    }

    // Generate filename
    const fileName = `${savedExport.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.${extension}`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': savedExport.fileSize.toString(),
      },
    });
  } catch (error) {
    console.error('Download export error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download export' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a saved export
export async function DELETE(
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

    // Get the export
    const savedExport = await prisma.savedExport.findFirst({
      where: { id, userId },
    });

    if (!savedExport) {
      return NextResponse.json(
        { success: false, error: 'Export not found' },
        { status: 404 }
      );
    }

    // Delete from blob storage
    await deleteFromBlob(savedExport.fileUrl);

    // Delete from database
    await prisma.savedExport.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete export error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete export' },
      { status: 500 }
    );
  }
}
