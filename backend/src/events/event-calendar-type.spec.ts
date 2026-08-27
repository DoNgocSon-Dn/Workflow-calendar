import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventRow, toEventDto, toEventInsertRow, toEventUpdateRow } from './event.mapper';

/**
 * Cột `calendar_type` — 'solar' (Dương) mặc định, 'lunar' (Âm) khi client gửi.
 * Hàng cũ (trước migration 25) đọc ra `null` ⇒ coi như 'solar'.
 */
describe('event.mapper — calendar_type', () => {
  const baseDto: CreateEventDto = {
    calendarId: '11111111-1111-4111-8111-111111111111',
    title: 'Học Java',
    start: '2026-08-15T07:00:00.000Z',
    end: '2026-08-15T09:00:00.000Z',
    allDay: false,
  };

  it('toEventInsertRow mặc định calendar_type = solar', () => {
    expect(toEventInsertRow(baseDto, 'user-1')['calendar_type']).toBe('solar');
  });

  it('toEventInsertRow nhận lunar khi dto có calendarType', () => {
    expect(
      toEventInsertRow({ ...baseDto, calendarType: 'lunar' }, 'user-1')['calendar_type'],
    ).toBe('lunar');
  });

  it('toEventDto map null (hàng cũ) → solar', () => {
    const row = { calendar_type: null } as EventRow;
    expect(toEventDto({ ...stubRow(), ...row }).calendarType).toBe('solar');
  });

  it('toEventDto giữ nguyên lunar', () => {
    expect(toEventDto({ ...stubRow(), calendar_type: 'lunar' }).calendarType).toBe('lunar');
  });

  it('toEventUpdateRow chỉ set calendar_type khi có trong dto', () => {
    expect('calendar_type' in toEventUpdateRow({} as UpdateEventDto)).toBe(false);
    expect(toEventUpdateRow({ calendarType: 'lunar' } as UpdateEventDto)['calendar_type']).toBe(
      'lunar',
    );
  });
});

function stubRow(): EventRow {
  return {
    id: 'e1',
    calendar_id: 'c1',
    title: 'x',
    location: null,
    description: null,
    start_at: '2026-08-15T07:00:00.000Z',
    end_at: '2026-08-15T09:00:00.000Z',
    all_day: false,
    created_by: 'u1',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    meet_link: null,
    series_id: null,
    recurrence_rule: null,
    calendar_type: 'solar',
  };
}
