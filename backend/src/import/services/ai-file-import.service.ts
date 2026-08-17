import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { ParsedImportEvent } from './ics-import.service';
import * as xlsx from 'xlsx';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';

@Injectable()
export class AiFileImportService {
  private readonly logger = new Logger(AiFileImportService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const filename = file.originalname.toLowerCase();
    try {
      if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        let fullText = '';
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          fullText += `--- Sheet: ${sheetName} ---\n`;
          fullText += xlsx.utils.sheet_to_csv(sheet) + '\n\n';
        }
        return fullText;
      } else if (filename.endsWith('.pdf')) {
        const pdfData = await pdfParse(file.buffer);
        return pdfData.text;
      } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
      } else {
        return file.buffer.toString('utf-8');
      }
    } catch (err) {
      this.logger.error(`Lỗi đọc file ${file.originalname}:`, err);
      throw new BadRequestException(`Không thể trích xuất nội dung văn bản từ file ${file.originalname}`);
    }
  }

  async parseEventsWithAi(rawText: string): Promise<ParsedImportEvent[]> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY', { infer: true });
    if (!apiKey) {
      this.logger.warn('Chưa cấu hình GEMINI_API_KEY, trả về fallback parser');
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
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

        if (!response.ok) {
          throw new Error(`Gemini API HTTP Error ${response.status}`);
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
