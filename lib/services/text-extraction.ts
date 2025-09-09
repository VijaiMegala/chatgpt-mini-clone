import PDFParser from 'pdf2json';

export interface TextExtractionResult {
  text: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    language?: string;
    confidence?: number;
  };
}

export interface MultimodalContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export class TextExtractionService {
  /**
   * Extract text from any supported file type
   */
  async extractText(file: File, fileType: string): Promise<TextExtractionResult> {
    try {
      if (fileType === 'application/pdf') {
        return await this.extractFromPDF(file);
      } else if (fileType.startsWith('text/')) {
        return await this.extractFromText(file);
      } else if (fileType.startsWith('image/')) {
        return await this.extractFromImage(file);
      } else {
        return {
          text: `File: ${file.name}\nType: ${fileType}\nSize: ${(file.size / 1024).toFixed(2)} KB\n\nThis file has been uploaded and can be referenced in the conversation.`,
          metadata: { wordCount: 0 }
        };
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      return {
        text: `File: ${file.name}\nType: ${fileType}\nSize: ${(file.size / 1024).toFixed(2)} KB\n\nText extraction failed, but the file has been uploaded and can be referenced in the conversation.`,
        metadata: { wordCount: 0 }
      };
    }
  }

  /**
   * Extract text from images using OCR
   */
  private async extractFromImage(file: File): Promise<TextExtractionResult> {
    try {
      // Convert file to base64 for OCR processing
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = file.type;
      
      // Use OpenRouter with Gemini for OCR
      const ocrText = await this.performOCR(`data:${mimeType};base64,${base64}`);
      
      return {
        text: ocrText || `Image: ${file.name}\nType: ${mimeType}\nSize: ${(file.size / 1024).toFixed(2)} KB\n\nThis image has been uploaded and can be referenced in the conversation.`,
        metadata: { 
          wordCount: ocrText ? ocrText.split(/\s+/).length : 0,
          confidence: ocrText ? 0.8 : 0
        }
      };
    } catch (error) {
      console.error('Image OCR error:', error);
      return {
        text: `Image: ${file.name}\nType: ${file.type}\nSize: ${(file.size / 1024).toFixed(2)} KB\n\nThis image has been uploaded and can be referenced in the conversation.`,
        metadata: { wordCount: 0 }
      };
    }
  }

  /**
   * Perform OCR using OpenRouter with Gemini
   */
  private async performOCR(imageDataUrl: string): Promise<string | null> {
    try {
      if (!process.env.OPENROUTER_API_KEY) {
        console.warn('OpenRouter API key not configured for OCR');
        return null;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'ChatGPT Clone OCR',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. If there is no text, respond with "No text found in image."'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OCR API error:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || null;
    } catch (error) {
      console.error('OCR processing error:', error);
      return null;
    }
  }

  /**
   * Extract text from PDF files using pdf2json
   */
  private async extractFromPDF(file: File): Promise<TextExtractionResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataError', (errData: any) => {
          console.error('PDF parsing error:', errData);
          reject(new Error(`Failed to parse PDF: ${errData.parserError}`));
        });
        
        pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
          try {
            let fullText = '';
            let pageCount = 0;
            
            if (pdfData.Pages) {
              pageCount = pdfData.Pages.length;
              for (const page of pdfData.Pages) {
                if (page.Texts) {
                  for (const text of page.Texts) {
                    if (text.R) {
                      for (const r of text.R) {
                        if (r.T) {
                          fullText += decodeURIComponent(r.T) + ' ';
                        }
                      }
                    }
                  }
                }
              }
            }
            
            resolve({
              text: fullText.trim(),
              metadata: {
                pageCount: pageCount,
                wordCount: fullText.split(/\s+/).length,
              }
            });
          } catch (error) {
            reject(error);
          }
        });
        
        pdfParser.parseBuffer(buffer);
      });
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Extract text from plain text files
   */
  private async extractFromText(file: File): Promise<TextExtractionResult> {
    try {
      const text = await file.text();
      
      return {
        text: text,
        metadata: {
          wordCount: text.split(/\s+/).length,
        }
      };
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(`Failed to extract text from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a file URL (for already uploaded files)
   */
  async extractTextFromUrl(url: string, fileName: string, fileType: string): Promise<TextExtractionResult> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const file = new File([arrayBuffer], fileName, { type: fileType });
      
      return await this.extractText(file, fileType);
    } catch (error) {
      console.error('URL text extraction error:', error);
      return {
        text: `File: ${fileName}\nType: ${fileType}\n\nThis file has been uploaded and can be referenced in the conversation.`,
        metadata: { wordCount: 0 }
      };
    }
  }
}

export const textExtractionService = new TextExtractionService();
