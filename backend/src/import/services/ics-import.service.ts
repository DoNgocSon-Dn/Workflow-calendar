import { Injectable, BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICAL = require('ical.js');

export interface ParsedImportEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  needsReview?: boolean;
}

@Injectable()
export class IcsImportService {
  parseIcs(content: string): ParsedImportEvent[] {
    try {
      const jcalData = ICAL.parse(content);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      return vevents.map((vevent) => {
        const event = new ICAL.Event(vevent);
        const title = event.summary || 'Sự kiện nhập từ ICS';
        const start = event.startDate ? event.startDate.toJSDate() : new Date();
        const end = event.endDate ? event.endDate.toJSDate() : new Date(start.getTime() + 3600000);
        const allDay = event.startDate ? event.startDate.isDate : false;
        const location = event.location || undefined;
        const description = event.description || undefined;

        return {
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay,
          location,
          description,
        };
      });
    } catch (err) {
      throw new BadRequestException('Không thể đọc file ICS. Vui lòng kiểm tra lại định dạng file.');
    }
  }

  parseCsv(content: string): ParsedImportEvent[] {
    try {
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) return [];

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      const events: ParsedImportEvent[] = [];

      const titleIdx = headers.findIndex((h) => h.includes('subject') || h.includes('title') || h.includes('tiêu đề') || h.includes('tên'));
      const startDateIdx = headers.findIndex((h) => h.includes('start date') || h.includes('start_date') || h.includes('bắt đầu'));
      const startTimeIdx = headers.findIndex((h) => h.includes('start time') || h.includes('start_time'));
      const endDateIdx = headers.findIndex((h) => h.includes('end date') || h.includes('end_date') || h.includes('kết thúc'));
      const endTimeIdx = headers.findIndex((h) => h.includes('end time') || h.includes('end_time'));
      const locationIdx = headers.findIndex((h) => h.includes('location') || h.includes('địa điểm'));
      const descIdx = headers.findIndex((h) => h.includes('description') || h.includes('mô tả'));

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const title = titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : `Sự kiện ${i}`;
        
        let startStr = startDateIdx !== -1 ? cols[startDateIdx] : '';
        if (startTimeIdx !== -1 && cols[startTimeIdx]) startStr += ' ' + cols[startTimeIdx];
        
        let endStr = endDateIdx !== -1 ? cols[endDateIdx] : '';
        if (endTimeIdx !== -1 && cols[endTimeIdx]) endStr += ' ' + cols[endTimeIdx];

        const startDate = startStr ? new Date(startStr) : new Date();
        const endDate = endStr ? new Date(endStr) : new Date(startDate.getTime() + 3600000);

        events.push({
          title,
          start: isNaN(startDate.getTime()) ? new Date().toISOString() : startDate.toISOString(),
          end: isNaN(endDate.getTime()) ? new Date(Date.now() + 3600000).toISOString() : endDate.toISOString(),
          allDay: false,
          location: locationIdx !== -1 ? cols[locationIdx] : undefined,
          description: descIdx !== -1 ? cols[descIdx] : undefined,
        });
      }

      return events;
    } catch (err) {
      throw new BadRequestException('Không thể đọc file CSV. Vui lòng kiểm tra lại cấu trúc file CSV.');
    }
  }
}
