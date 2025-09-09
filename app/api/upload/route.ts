import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { fileUploadService } from "@/lib/services/file-upload";
import { textExtractionService } from "@/lib/services/text-extraction";

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 10MB" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "text/plain",
      "application/pdf",
      "text/markdown",
      "application/json",
      "text/csv",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "File type not supported" }, { status: 400 });
    }

    // Upload file
    const uploadResult = await fileUploadService.uploadFile(file);

    // Extract text content from the file
    let extractedText = '';
    try {
      const extractionResult = await textExtractionService.extractText(file, file.type);
      extractedText = extractionResult.text;
    } catch (error) {
      console.warn('Text extraction failed during upload:', error);
    }

    // Analyze file content (this will use the extracted text if available)
    const analysis = await fileUploadService.analyzeFileContent(uploadResult);

    return NextResponse.json({
      success: true,
      file: {
        ...uploadResult,
        analysis: {
          ...analysis,
          extractedText: extractedText, // Include the raw extracted text
        },
      },
      analysis: {
        ...analysis,
        extractedText: extractedText,
      },
    });

  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { file } = await req.json();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    await fileUploadService.deleteFile(file);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("File deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
