import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Mốc nhắc mặc định — phút TRƯỚC giờ bắt đầu (0 = đúng giờ diễn ra).
 *  Áp dụng khi người dùng ĐỒNG Ý một lời mời tham gia sự kiện. */
export const DEFAULT_REMINDER_OFFSETS = [30, 15, 5, 0];

@Injectable({ providedIn: 'root' })
export class ReminderPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/reminder-preferences`;

  readonly offsets = signal<number[]>([...DEFAULT_REMINDER_OFFSETS]);
  private loaded = false;

  /** Tải một lần (mở Settings hoặc lúc khởi động). Lỗi thì giữ mặc định. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const res = await firstValueFrom(this.http.get<{ offsets: number[] }>(this.url));
      if (Array.isArray(res?.offsets)) this.offsets.set(res.offsets);
    } catch {
      // giữ mặc định
    }
  }

  async save(offsets: number[]): Promise<void> {
    const clean = [...new Set(offsets.map((n) => Math.round(n)).filter((n) => n >= 0))].sort(
      (a, b) => b - a,
    );
    this.offsets.set(clean); // optimistic
    const res = await firstValueFrom(
      this.http.put<{ offsets: number[] }>(this.url, { offsets: clean }),
    );
    if (Array.isArray(res?.offsets)) this.offsets.set(res.offsets);
  }

  toggle(offset: number): void {
    const cur = this.offsets();
    const next = cur.includes(offset)
      ? cur.filter((o) => o !== offset)
      : [...cur, offset];
    void this.save(next);
  }
}
