import { Injectable, effect, signal } from '@angular/core';
import { AppNotification } from './notification.model';

const STORAGE_KEY = 'notification-sound';
const SOUND_URL = '/audio/notification_alert.mp3';

/** Nhiều thông báo ập tới cùng lúc (vd. lúc mở app quét deadline) thì chỉ kêu
 *  một tiếng — kêu liên tiếp nghe như máy bị lỗi. */
const MIN_SOUND_INTERVAL_MS = 2000;

function readStoredEnabled(): boolean {
  try {
    // Mặc định BẬT; chỉ tắt khi người dùng đã chủ động tắt.
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Phát âm báo khi có thông báo mới.
 *
 * Nguyên tắc xuyên suốt: âm thanh là thứ PHỤ. Mọi lỗi ở đây (thiếu file, trình
 * duyệt chặn, thiết bị không có loa) đều bị nuốt gọn, không được phép làm hỏng
 * hay chặn luồng thông báo.
 */
@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  readonly enabled = signal<boolean>(readStoredEnabled());

  /** Lý do lần nghe thử gần nhất thất bại — chỉ dùng cho nút "Nghe thử" trong
   *  Settings. Luồng thông báo thật vẫn im lặng nuốt lỗi như cũ. */
  readonly previewError = signal<string | null>(null);

  private audio: HTMLAudioElement | null = null;
  /** Trình duyệt chỉ cho phát tiếng SAU khi người dùng đã tương tác với trang.
   *  Thông báo lại đến từ socket, không do người dùng bấm, nên phải tự theo dõi
   *  mốc này thay vì cứ gọi play() rồi ăn lỗi. */
  private unlocked = false;
  private lastPlayedAt = 0;
  private detachUnlockListeners: (() => void) | null = null;

  constructor() {
    effect(() => {
      const enabled = this.enabled();
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      } catch {
        // Chế độ riêng tư chặn localStorage — vẫn chạy, chỉ không nhớ lựa chọn.
      }
    });

    this.listenForFirstInteraction();
  }

  toggle(): void {
    this.enabled.update((on) => !on);
  }

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  /**
   * Kêu khi có thông báo mới, BẤT KỂ tab đang mở hay ẩn — chỉ còn toggle,
   * trạng thái mở khoá autoplay và cooldown là ba điều kiện lọc.
   * Trả về `true` nếu thực sự phát; người gọi không cần quan tâm.
   */
  notify(): boolean {
    if (!this.enabled() || !this.unlocked) return false;

    const now = Date.now();
    if (now - this.lastPlayedAt < MIN_SOUND_INTERVAL_MS) return false;

    this.play();
    this.lastPlayedAt = now;
    return true;
  }

  /**
   * Phát ngay để người dùng nghe thử. Cố tình BỎ QUA toggle, cooldown và
   * document.hidden: đây là hành động chủ động, không phải thông báo tự đến.
   * Khác với luồng thật, lỗi ở đây được BÁO RA để còn biết đường sửa.
   */
  async preview(): Promise<void> {
    this.previewError.set(null);
    // Cú click gọi hàm này chính là tương tác hợp lệ để mở khoá autoplay.
    this.unlocked = true;

    try {
      const audio = this.ensureAudio();
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'NotAllowedError') {
        this.previewError.set('Trình duyệt đang chặn âm thanh. Hãy bấm vào trang rồi thử lại.');
      } else if (name === 'NotSupportedError') {
        this.previewError.set('Không đọc được file âm thanh — kiểm tra public/audio/.');
      } else {
        this.previewError.set('Không phát được âm thanh.');
      }
    }
  }

  private play(): void {
    try {
      const audio = this.ensureAudio();
      // Dùng lại một instance duy nhất: tua về đầu thay vì đẻ Audio mới mỗi
      // lần, tránh vừa tốn object vừa chồng tiếng lên nhau.
      audio.currentTime = 0;
      // play() trả Promise và SẼ reject khi bị chặn hoặc thiếu file — nuốt
      // lặng, không để rơi thành unhandled rejection.
      void audio.play().catch(() => undefined);
    } catch {
      // Thiết bị/trình duyệt không hỗ trợ Audio — bỏ qua.
    }
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio(SOUND_URL);
      this.audio.preload = 'auto';
      this.audio.volume = 0.45;
    }
    return this.audio;
  }

  private listenForFirstInteraction(): void {
    if (typeof document === 'undefined') return;

    const unlock = (): void => {
      this.unlocked = true;
      this.detachUnlockListeners?.();
      this.detachUnlockListeners = null;
    };

    const events: readonly string[] = ['pointerdown', 'click', 'keydown'];
    for (const name of events) {
      document.addEventListener(name, unlock, { once: true, passive: true });
    }

    // Gỡ hết ngay khi đã mở khoá — giữ listener lại chẳng để làm gì.
    this.detachUnlockListeners = () => {
      for (const name of events) document.removeEventListener(name, unlock);
    };
  }
}
