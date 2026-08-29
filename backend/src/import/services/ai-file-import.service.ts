import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { GEMINI_MODELS, looksLikeGeminiApiKey } from '../../ai/gemini.constants';
import { ParsedImportEvent } from './ics-import.service';
// pdf-parse v2 KHÔNG còn xuất ra một hàm gọi thẳng như v1 — nó xuất lớp
// PDFParse. Code cũ gọi pdfParse(buffer) nên ném TypeError với MỌI file PDF,
// và lỗi đó bị catch bên dưới nuốt thành một câu chung chung.
import { PDFParse } from 'pdf-parse';
import { getPath } from 'pdf-parse/worker';
import { pathToFileURL } from 'url';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// Khởi tạo worker path cho pdf-parse v2 tương thích trên môi trường Windows / Node ESM
try {
  PDFParse.setWorker(pathToFileURL(getPath()).href);
} catch (err) {
  // Bỏ qua nếu worker đã được khởi tạo trước đó
}

@Injectable()
export class AiFileImportService {
  private readonly logger = new Logger(AiFileImportService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /**
   * Lấy chữ trong file để đưa cho AI đọc.
   *
   * - `.pdf`   → giải nén qua pdf.js
   * - `.docx`  → mammoth trích văn bản thô (bỏ định dạng)
   * - `.xlsx`/`.xls` → xlsx đọc từng sheet, quy về CSV
   * - còn lại (`.ics`, `.csv`, text) → đọc thẳng UTF-8
   */
  async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const filename = file.originalname.toLowerCase();
    try {
      if (filename.endsWith('.pdf')) {
        return await this.extractPdfText(file.buffer);
      }
      if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
      }
      if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        return this.extractSpreadsheetText(file.buffer);
      }
      return file.buffer.toString('utf-8');
    } catch (err) {
      this.logger.error(`Lỗi đọc file ${file.originalname}:`, err);
      throw new BadRequestException(
        `Không thể trích xuất nội dung văn bản từ file ${file.originalname}. ` +
          'File có thể bị hỏng, đặt mật khẩu, hoặc là bản scan chỉ có ảnh chứ không có chữ.',
      );
    }
  }

  /** Mỗi sheet → một khối CSV có nhãn, ghép lại để AI đọc như một tài liệu. */
  private extractSpreadsheetText(buffer: Buffer): string {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map((name) => {
      const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[name]);
      return `--- Sheet: ${name} ---\n${csv}`;
    })
      .join('\n\n')
      .trim();
  }

  /**
   * Đọc chữ trong file PDF.
   *
   * Tách riêng vì phải giải phóng tài nguyên: mỗi lần parse dựng một document
   * pdf.js giữ buffer và worker, không destroy thì rò rỉ dần qua từng lần
   * người dùng gửi file.
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  async parseEventsWithAi(rawText: string): Promise<ParsedImportEvent[]> {
    // Config được nạp lồng trong khoá 'ai' (xem config/configuration.ts).
    // Đọc thẳng 'GEMINI_API_KEY' luôn trả undefined nên nhánh AI chưa từng chạy.
    const apiKey = this.configService.get('ai', { infer: true }).geminiApiKey?.trim();
    if (!apiKey) {
      this.logger.warn('Chưa cấu hình GEMINI_API_KEY, trả về fallback parser');
      return this.fallbackTextParse(rawText);
    }
    if (!looksLikeGeminiApiKey(apiKey)) {
      this.logger.warn(
        'GEMINI_API_KEY trống hoặc là giá trị giữ chỗ — Smart Import AI dùng ' +
          'fallback parser. Lấy key tại https://aistudio.google.com/app/apikey',
      );
      return this.fallbackTextParse(rawText);
    }

    // Chunking text if longer than 3000 chars to avoid prompt token limit
    const chunks = this.chunkText(rawText, 3000);
    const allEvents: ParsedImportEvent[] = [];

    const nowIso = new Date().toISOString();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const systemPrompt = `
Bạn là chuyên gia phân tích dữ liệu lịch trình từ tài liệu (Excel, Word, PDF).
Hãy đọc đoạn văn bản bên dưới và trích xuất TOÀN BỘ các sự kiện/lịch hẹn/thời khóa biểu.
Yêu cầu:
1. Ngày giờ hiện tại là: ${nowIso}. Hãy suy luận ngày giờ chính xác dạng ISO 8601 string (VD: 2026-08-15T09:00:00.000Z).
2. Nếu sự kiện cả ngày, đặt allDay: true.
3. Trả về DUY NHẤT một JSON array chứa các object theo schema:
[
  {
    "title": "Tên sự kiện",
    "start": "ISO 8601 string",
    "end": "ISO 8601 string",
    "allDay": boolean,
    "location": "Địa điểm nếu có",
    "description": "Mô tả chi tiết nếu có",
    "needsReview": boolean
  }
]
Không trả về văn bản khác ngoài JSON.
`;

      try {
        let response: Response | null = null;
        for (const model of GEMINI_MODELS) {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: `${systemPrompt}\n\nNội dung file (Đoạn ${i + 1}/${chunks.length}):\n"${chunk}"` }],
                  },
                ],
                generationConfig: { responseMimeType: 'application/json' },
              }),
            },
          );
          if (response.ok || response.status !== 404) break;
        }

        if (!response || !response.ok) {
          throw new Error(`Gemini API HTTP Error ${response?.status ?? 'no response'}`);
        }

        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText) as ParsedImportEvent[];
          if (Array.isArray(parsed)) {
            allEvents.push(...parsed);
          }
        }
      } catch (err) {
        this.logger.error(`Lỗi Smart Import AI ở chunk ${i + 1}:`, err);
      }
    }

    if (allEvents.length === 0) {
      return this.fallbackTextParse(rawText);
    }

    return allEvents;
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.substring(i, i + chunkSize));
      i += chunkSize - 200; // 200 char overlap
    }
    return chunks.length > 0 ? chunks : [text];
  }

  private fallbackTextParse(text: string): ParsedImportEvent[] {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const events: ParsedImportEvent[] = [];
    const now = new Date();

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      if (line.length > 3 && !line.startsWith('---')) {
        const start = new Date(now.getTime() + i * 3600000);
        const end = new Date(start.getTime() + 3600000);
        events.push({
          title: line.substring(0, 50),
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          description: line,
          needsReview: true,
        });
      }
    }
    return events;
  }
}
