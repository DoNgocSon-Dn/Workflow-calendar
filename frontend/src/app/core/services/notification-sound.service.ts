import { Injectable, effect, signal } from '@angular/core';
import { AppNotification } from './notification.model';

const STORAGE_KEY = 'notification-sound';

const SOUND_URLS = {
  default: '/audio/notification_alert.mp3',
  chat: '/audio/chat-notification-sound.mp3',
  birthday: 'synth_birthday',
  important: 'synth_important',
} as const;

export type SoundKind = keyof typeof SOUND_URLS;

const MIN_SOUND_INTERVAL_MS = 1500;

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Phát âm báo khi có thông báo mới hoặc sự kiện đặc biệt (Sinh nhật, Sự kiện quan trọng).
 */
@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  readonly enabled = signal<boolean>(readStoredEnabled());
  readonly previewError = signal<string | null>(null);

  private readonly audioCache = new Map<string, HTMLAudioElement>();
  private unlocked = false;
  private lastPlayedAt = 0;
  private detachUnlockListeners: (() => void) | null = null;

  constructor() {
    effect(() => {
      const enabled = this.enabled();
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      } catch {
        // Ignored
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

  notify(notification: AppNotification): boolean {
    return this.notifyKind(this.resolveKind(notification));
  }

  notifyKind(kind: SoundKind = 'default'): boolean {
    if (!this.enabled() || !this.unlocked) return false;

    const now = Date.now();
    if (now - this.lastPlayedAt < MIN_SOUND_INTERVAL_MS && kind !== 'birthday') return false;

    this.play(kind);
    this.lastPlayedAt = now;
    return true;
  }

  async preview(kind: SoundKind = 'default'): Promise<void> {
    this.previewError.set(null);
    this.unlocked = true;

    try {
      if (kind === 'birthday') {
        this.playBirthdayFanfare();
        return;
      }
      if (kind === 'important') {
        this.playImportantEventChime();
        return;
      }
      const audio = this.ensureAudio(kind);
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'NotAllowedError') {
        this.previewError.set('Trình duyệt đang chặn âm thanh. Hãy bấm vào trang rồi thử lại.');
      } else if (name === 'NotSupportedError') {
        this.previewError.set('Không đọc được file âm thanh.');
      } else {
        this.previewError.set('Không phát được âm thanh.');
      }
    }
  }

  private resolveKind(notification: AppNotification): SoundKind {
    const title = (notification.title || '').toLowerCase();
    const body = (notification.message || '').toLowerCase();
    const text = title + ' ' + body;

    // 1. Kiểm tra từ khóa Sinh Nhật
    if (text.includes('sinh nhật') || text.includes('birthday') || text.includes('sinh nhat')) {
      return 'birthday';
    }

    // 2. Kiểm tra từ khóa Sự Kiện Quan Trọng / Ngày Lễ
    if (
      text.includes('quan trọng') ||
      text.includes('ngày lễ') ||
      text.includes('hạn chót') ||
      text.includes('khẩn cấp') ||
      text.includes('gấp') ||
      text.includes('important') ||
      text.includes('urgent') ||
      text.includes('deadline') ||
      notification.type === 'task'
    ) {
      return 'important';
    }

    // 3. Tin nhắn chat
    if (notification.type === 'message' || notification.type === 'mention') {
      return 'chat';
    }

    return 'default';
  }

  private play(kind: SoundKind): void {
    if (kind === 'birthday') {
      this.playBirthdayFanfare();
      return;
    }
    if (kind === 'important') {
      this.playImportantEventChime();
      return;
    }

    try {
      const audio = this.ensureAudio(kind);
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    } catch {
      // Ignored
    }
  }

  /**
   * Phát âm nhạc Chúc Mừng Sinh Nhật lung linh (Web Audio API Fanfare)
   */
  playBirthdayFanfare(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      // Happy Birthday Melody + Festive Sparkle Chimes
      const notes = [
        { freq: 261.63, duration: 0.25, delay: 0 },    // C4
        { freq: 261.63, duration: 0.25, delay: 0.26 }, // C4
        { freq: 293.66, duration: 0.45, delay: 0.52 }, // D4
        { freq: 261.63, duration: 0.45, delay: 1.00 }, // C4
        { freq: 349.23, duration: 0.45, delay: 1.48 }, // F4
        { freq: 329.63, duration: 0.80, delay: 1.95 }, // E4

        // Celebration Sparkles (C5 - E5 - G5 - C6 Arpeggio)
        { freq: 523.25, duration: 0.35, delay: 2.80 }, // C5
        { freq: 659.25, duration: 0.35, delay: 3.05 }, // E5
        { freq: 783.99, duration: 0.45, delay: 3.30 }, // G5
        { freq: 1046.50, duration: 1.0, delay: 3.60 }, // C6 Sparkling Bell
        { freq: 1318.51, duration: 1.2, delay: 3.80 }, // E6 High Diamond Tone
      ];

      notes.forEach(({ freq, duration, delay }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = freq > 800 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      });
    } catch {
      this.playFallbackAudio();
    }
  }

  /**
   * Phát âm chuông báo Sự Kiện Quan Trọng (Majestic Triumph Gold Chime)
   */
  playImportantEventChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      // 4-tone Royal Brass & Gold Chime (G4 -> C5 -> E5 -> G5 -> C6)
      const notes = [
        { freq: 392.00, duration: 0.22, delay: 0 },    // G4
        { freq: 523.25, duration: 0.22, delay: 0.18 }, // C5
        { freq: 659.25, duration: 0.30, delay: 0.36 }, // E5
        { freq: 783.99, duration: 0.60, delay: 0.58 }, // G5
        { freq: 1046.50, duration: 1.10, delay: 0.70 }, // C6 Triumph Gold
      ];

      notes.forEach(({ freq, duration, delay }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      });
    } catch {
      this.playFallbackAudio();
    }
  }

  private playFallbackAudio(): void {
    try {
      const audio = this.ensureAudio('default');
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    } catch {
      // Ignored
    }
  }

  private ensureAudio(kind: SoundKind): HTMLAudioElement {
    const cached = this.audioCache.get(kind);
    if (cached) return cached;

    const url = SOUND_URLS[kind as keyof typeof SOUND_URLS] || SOUND_URLS.default;
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 0.45;
    this.audioCache.set(kind, audio);
    return audio;
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

    this.detachUnlockListeners = () => {
      for (const name of events) document.removeEventListener(name, unlock);
    };
  }
}
