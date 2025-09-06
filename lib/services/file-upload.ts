import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface FileUploadResult {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  cloudinaryUrl?: string;
  preview?: string;
  uploadcareId?: string;
}

export interface FileContentAnalysis {
  text?: string;
  extractedData?: any;
  summary?: string;
}

class FileUploadService {
  /**
   * Upload file to Uploadcare and then to Cloudinary
   */
  async uploadFile(file: File): Promise<FileUploadResult> {
    // Check if Uploadcare is configured and enabled
    if (!process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || process.env.DISABLE_UPLOADCARE === 'true') {
      return await this.uploadDirectlyToCloudinary(file);
    }

    // Try Uploadcare first, with better error handling
    try {
      const uploadcareResult = await this.uploadToUploadcare(file);
      
      // Then upload to Cloudinary for storage and delivery
      const cloudinaryResult = await this.uploadToCloudinary(uploadcareResult.url, file.name, file.type);
      
      return {
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        url: cloudinaryResult.secure_url,
        cloudinaryUrl: cloudinaryResult.secure_url,
        uploadcareId: uploadcareResult.id,
        preview: this.generatePreviewUrl(cloudinaryResult.secure_url, file.type),
      };
    } catch (uploadcareError) {
      // Only log as warning if it's not a configuration issue
      if (uploadcareError instanceof Error && uploadcareError.message.includes('Forbidden')) {
        // Uploadcare not properly configured, falling back to direct Cloudinary upload
      } else {
        console.warn('Uploadcare upload failed, falling back to direct Cloudinary upload:', uploadcareError);
      }
      
      // Fallback to direct Cloudinary upload
      try {
        return await this.uploadDirectlyToCloudinary(file);
      } catch (fallbackError) {
        console.error('Both Uploadcare and Cloudinary uploads failed:', fallbackError);
        throw new Error(`File upload failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Upload file directly to Cloudinary (fallback method)
   */
  private async uploadDirectlyToCloudinary(file: File): Promise<FileUploadResult> {
    try {
      // Convert file to base64 for Cloudinary upload
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;

      const result = await cloudinary.uploader.upload(dataUrl, {
        public_id: `chatgpt-clone/${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}`,
        resource_type: this.getCloudinaryResourceType(file.type),
        folder: 'chatgpt-clone',
        use_filename: true,
        unique_filename: true,
      } as any);

      return {
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        url: result.secure_url,
        cloudinaryUrl: result.secure_url,
        preview: this.generatePreviewUrl(result.secure_url, file.type),
      };
    } catch (error) {
      console.error('Direct Cloudinary upload error:', error);
      throw error;
    }
  }

  /**
   * Upload file to Uploadcare
   */
  private async uploadToUploadcare(file: File): Promise<{ id: string; url: string }> {
    // Double-check configuration before attempting upload
    if (!process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY) {
      throw new Error('Uploadcare not configured - missing public key');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('UPLOADCARE_PUBLIC_KEY', process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('https://upload.uploadcare.com/base/', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        
        // Provide more specific error messages
        if (response.status === 403) {
          throw new Error('Uploadcare upload failed: Forbidden (403) - Check your public key configuration');
        } else if (response.status === 502) {
          throw new Error('Uploadcare service temporarily unavailable (502 Bad Gateway)');
        } else if (response.status === 413) {
          throw new Error('File too large for upload');
        } else if (response.status === 400) {
          throw new Error('Invalid file format or upload request');
        } else {
          throw new Error(`Uploadcare upload failed: ${response.statusText} (${response.status})`);
        }
      }

      const result = await response.text();
      const fileId = result.trim();
      
      if (!fileId) {
        throw new Error('Uploadcare returned empty file ID');
      }
      
      return {
        id: fileId,
        url: `https://ucarecdn.com/${fileId}/`,
      };
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Uploadcare upload timed out (30 seconds)');
        }
        throw error;
      }
      
      throw new Error('Unknown upload error occurred');
    }
  }

  /**
   * Upload file from Uploadcare to Cloudinary
   */
  private async uploadToCloudinary(uploadcareUrl: string, fileName: string, fileType: string): Promise<any> {
    try {
      const result = await cloudinary.uploader.upload(uploadcareUrl, {
        public_id: `chatgpt-clone/${Date.now()}_${fileName.replace(/\.[^/.]+$/, '')}`,
        resource_type: this.getCloudinaryResourceType(fileType),
        folder: 'chatgpt-clone',
        use_filename: true,
        unique_filename: true,
      } as any);

      return result;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }

  /**
   * Get Cloudinary resource type based on file type
   */
  private getCloudinaryResourceType(fileType: string): string {
    if (fileType.startsWith('image/')) {
      return 'image';
    } else if (fileType.startsWith('video/')) {
      return 'video';
    } else if (fileType.startsWith('audio/')) {
      return 'video'; // Cloudinary uses 'video' for audio
    } else if (fileType === 'application/pdf') {
      return 'raw';
    } else {
      return 'raw';
    }
  }

  /**
   * Generate preview URL for images
   */
  private generatePreviewUrl(cloudinaryUrl: string, fileType: string): string | undefined {
    if (fileType.startsWith('image/')) {
      // Generate a thumbnail version
      const url = new URL(cloudinaryUrl);
      const pathParts = url.pathname.split('/');
      const publicId = pathParts.slice(7).join('/').replace(/\.[^/.]+$/, '');
      
      return cloudinary.url(publicId, {
        width: 200,
        height: 200,
        crop: 'fill',
        quality: 'auto',
        format: 'auto',
      });
    }
    return undefined;
  }

  /**
   * Analyze file content for AI processing
   */
  async analyzeFileContent(file: FileUploadResult): Promise<FileContentAnalysis> {
    try {
      if (file.type.startsWith('image/')) {
        return await this.analyzeImageContent(file);
      } else if (file.type === 'application/pdf') {
        return await this.analyzePdfContent(file);
      } else if (file.type.startsWith('text/')) {
        return await this.analyzeTextContent(file);
      } else {
        return {
          summary: `File: ${file.name} (${file.type})`,
        };
      }
    } catch (error) {
      console.error('File analysis error:', error);
      return {
        summary: `File: ${file.name} - Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Analyze image content using Cloudinary AI and external vision API
   */
  private async analyzeImageContent(file: FileUploadResult): Promise<FileContentAnalysis> {
    try {
      // Extract public ID from Cloudinary URL
      const url = new URL(file.cloudinaryUrl!);
      const pathParts = url.pathname.split('/');
      const publicId = pathParts.slice(7).join('/').replace(/\.[^/.]+$/, '');

      // Use Cloudinary's AI features to analyze the image
      const result = await cloudinary.api.resource(publicId, {
        image_metadata: true,
        colors: true,
        faces: true,
        quality_analysis: true,
      });

      let summary = `Image: ${file.name}\n`;
      
      if (result.image_metadata) {
        summary += `Dimensions: ${result.width}x${result.height}\n`;
        summary += `Format: ${result.format}\n`;
      }

      if (result.colors && result.colors.length > 0) {
        summary += `Dominant colors: ${result.colors.slice(0, 3).map((c: any) => c[0]).join(', ')}\n`;
      }

      if (result.faces && result.faces.length > 0) {
        summary += `Faces detected: ${result.faces.length}\n`;
      }

      // Try to get a more detailed description using external vision API
      try {
        const visionDescription = await this.getImageDescription(file.url);
        if (visionDescription) {
          summary += `\nDescription: ${visionDescription}`;
        }
      } catch (visionError) {
        // Vision API not available, using basic analysis
      }

      return {
        summary,
        extractedData: result,
      };
    } catch (error) {
      console.error('Image analysis error:', error);
      return {
        summary: `Image: ${file.name} - Could not analyze content`,
      };
    }
  }

  /**
   * Get detailed image description using Google Gemini API
   */
  private async getImageDescription(imageUrl: string): Promise<string | null> {
    try {
      return await this.analyzeDocumentWithGemini(imageUrl, 'image', 'image');
    } catch (error) {
      console.error('Image analysis error:', error);
      return null;
    }
  }

  /**
   * Analyze document content using Google Gemini API
   */
  private async analyzeDocumentWithGemini(url: string, fileName: string, fileType: string): Promise<string> {
    try {
      
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OpenRouter API key not configured');
      }

      // For images, we need to convert URL to base64
      let content;
      if (fileType === 'image') {
        try {
          const imageResponse = await fetch(url);
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString('base64');
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
          
          content = [
            {
              type: 'text',
              text: 'Analyze this image in detail. Describe what you see, including any text, objects, people, settings, or activities visible. Be specific and thorough.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ];
        } catch (imageError) {
          console.error('Error processing image:', imageError);
          // Fallback to URL-based analysis
          content = [
            {
              type: 'text',
              text: 'Analyze this image in detail. Describe what you see, including any text, objects, people, settings, or activities visible. Be specific and thorough.'
            },
            {
              type: 'image_url',
              image_url: {
                url: url
              }
            }
          ];
        }
      } else if (fileType === 'pdf') {
        // For PDFs, we need to use a different approach
        // Try to fetch as binary and convert to base64 for Gemini
        try {
          const fileResponse = await fetch(url);
          const fileBuffer = await fileResponse.arrayBuffer();
          const base64 = Buffer.from(fileBuffer).toString('base64');
          
          content = [
            {
              type: 'text',
              text: `Analyze this PDF document: ${fileName}. Extract and summarize the key information, including any text content, important details, and main topics. Be comprehensive and detailed.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64}`
              }
            }
          ];
        } catch (pdfError) {
          console.error('Error processing PDF:', pdfError);
          // Fallback to basic analysis
          content = [
            {
              type: 'text',
              text: `Analyze this PDF document: ${fileName}. Extract and summarize the key information, including any text content, important details, and main topics. Be comprehensive and detailed.`
            }
          ];
        }
      } else {
        // For text files, fetch the content and analyze it
        try {
          const fileResponse = await fetch(url);
          const fileContent = await fileResponse.text();
          
          content = [
            {
              type: 'text',
              text: `Analyze this ${fileType} document. Extract and summarize the key information, including any text content, important details, and main topics. Be comprehensive and detailed.\n\nDocument content:\n${fileContent}`
            }
          ];
        } catch (fileError) {
          console.error('Error processing file:', fileError);
          // Fallback to basic analysis
          content = [
            {
              type: 'text',
              text: `Analyze this ${fileType} document: ${fileName}. Extract and summarize the key information, including any text content, important details, and main topics. Be comprehensive and detailed.`
            }
          ];
        }
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'ChatGPT Clone',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          messages: [
            {
              role: 'user',
              content: content
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || `Could not analyze ${fileType} content`;
    } catch (error) {
      console.error('Gemini analysis error:', error);
      throw error;
    }
  }

  /**
   * Analyze PDF content using external API
   */
  private async analyzePdfContent(file: FileUploadResult): Promise<FileContentAnalysis> {
    try {
      // For PDFs, we need to use a different approach since they can't be read as text directly
      // We'll use the URL and let Gemini handle it as a document
      const analysis = await this.analyzeDocumentWithGemini(file.url, file.name, 'pdf');
      return {
        summary: analysis,
        text: analysis,
      };
    } catch (error) {
      console.error('PDF analysis error:', error);
      return {
        summary: `PDF document: ${file.name} - Could not analyze content`,
      };
    }
  }

  /**
   * Analyze text content
   */
  private async analyzeTextContent(file: FileUploadResult): Promise<FileContentAnalysis> {
    try {
      const response = await fetch(file.url);
      const text = await response.text();
      
      // Use Gemini to analyze text content for better insights
      try {
        const analysis = await this.analyzeDocumentWithGemini(file.url, file.name, 'text');
        return {
          text,
          summary: `Text file: ${file.name}\n\nAnalysis: ${analysis}`,
        };
      } catch (geminiError) {
        // Gemini analysis failed, using basic text analysis
        return {
          text,
          summary: `Text file: ${file.name}\nContent preview: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`,
        };
      }
    } catch (error) {
      console.error('Text analysis error:', error);
      return {
        summary: `Text file: ${file.name} - Could not read content`,
      };
    }
  }

  /**
   * Delete file from both Uploadcare and Cloudinary
   */
  async deleteFile(file: FileUploadResult): Promise<void> {
    try {
      // Delete from Cloudinary
      if (file.cloudinaryUrl) {
        const url = new URL(file.cloudinaryUrl);
        const pathParts = url.pathname.split('/');
        const publicId = pathParts.slice(7).join('/').replace(/\.[^/.]+$/, '');
        
        await cloudinary.uploader.destroy(publicId);
      }

      // Delete from Uploadcare (only if configured and file has uploadcareId)
      if (file.uploadcareId && process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY && process.env.UPLOADCARE_SECRET_KEY) {
        try {
          await fetch(`https://api.uploadcare.com/files/${file.uploadcareId}/`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Uploadcare.Simple ${process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY}:${process.env.UPLOADCARE_SECRET_KEY}`,
            },
          });
        } catch (error) {
          console.error('Uploadcare deletion error:', error);
        }
      }
    } catch (error) {
      console.error('File deletion error:', error);
      // Don't throw - file deletion is not critical
    }
  }

  /**
   * Get optimized delivery URL for Cloudinary
   */
  getOptimizedUrl(cloudinaryUrl: string, options: {
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
  } = {}): string {
    try {
      const url = new URL(cloudinaryUrl);
      const pathParts = url.pathname.split('/');
      const publicId = pathParts.slice(7).join('/').replace(/\.[^/.]+$/, '');

      return cloudinary.url(publicId, {
        width: options.width,
        height: options.height,
        quality: options.quality || 'auto',
        format: options.format || 'auto',
        crop: options.width && options.height ? 'fill' : 'scale',
      });
    } catch (error) {
      console.error('URL optimization error:', error);
      return cloudinaryUrl;
    }
  }
}

export const fileUploadService = new FileUploadService();
