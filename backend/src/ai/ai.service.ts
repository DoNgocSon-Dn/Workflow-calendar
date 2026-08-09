import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export interface AiParsedIntent {
  intent: 'create_event' | 'unclear';
  title?: string;
  start_at?: string;
  end_at?: string;
  attendees?: string[];
  recurrence_rule?: string | null;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async parseEventFromText(userText: string): Promise<AiParsedIntent> {
    const { geminiApiKey } = this.configService.get('ai', { infer: true });
    if (!geminiApiKey) {
      throw new InternalServerErrorException(
        'Thiếu GEMINI_API_KEY trong .env — xem backend/.env.example.',
      );
    }

    // Không để AI trả lời tự do — bắt nó trả về JSON đúng schema, code parse
    // JSON đó rồi gọi thẳng EventsService.create() thật (không viết logic
    // tạo event riêng cho AI).
    const systemPrompt = `Bạn là bộ phân tích lịch. Nhận câu tiếng Việt của người dùng, trả về DUY NHẤT
một JSON object theo schema sau, không thêm text nào khác:
{
  "intent": "create_event" | "unclear",
  "title": string,
  "start_at": string (ISO 8601, suy luận từ ngày hôm nay: ${new Date().toISOString()}),
  "end_at": string (ISO 8601),
  "attendees": string[] (tên người được nhắc, nếu có),
  "recurrence_rule": string | null
}
Nếu không chắc chắn về thời gian, trả "intent": "unclear".`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `${systemPrompt}\n\nCâu người dùng: "${userText}"` }] },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new InternalServerErrorException(`Gemini API lỗi: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      throw new InternalServerErrorException('Gemini không trả về nội dung hợp lệ.');
    }

    try {
      return JSON.parse(rawJson) as AiParsedIntent;
    } catch {
      // Phòng trường hợp model không tuân schema — coi như không chắc chắn
      // thay vì crash cả request.
      return { intent: 'unclear' };
    }
  }
}
