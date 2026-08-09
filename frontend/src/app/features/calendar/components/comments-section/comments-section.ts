import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../../core/auth/auth-store';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { CalendarStore } from '../../data/calendar-store';
import { EventComment } from '../../models/calendar.models';

interface CommentCreatedPayload {
  eventId: string;
  comment: { id: string; eventId: string; userId: string; content: string; createdAt: string };
}

interface CommentDeletedPayload {
  eventId: string;
  id: string;
}

@Component({
  selector: 'app-comments-section',
  templateUrl: './comments-section.html',
  styleUrl: './comments-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class CommentsSection {
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<string>();

  readonly comments = signal<EventComment[]>([]);
  readonly newComment = signal('');
  readonly sending = signal(false);
  readonly myUserId = computed(() => this.authStore.user()?.id ?? null);

  private readonly handleCreated = (payload: CommentCreatedPayload): void => {
    if (payload.eventId !== this.eventId()) return;
    const c = payload.comment;
    this.comments.update((list) => {
      if (list.some((existing) => existing.id === c.id)) return list;
      return [
        ...list,
        {
          id: c.id,
          eventId: c.eventId,
          userId: c.userId,
          content: c.content,
          createdAt: new Date(c.createdAt),
        },
      ];
    });
  };

  private readonly handleDeleted = (payload: CommentDeletedPayload): void => {
    if (payload.eventId !== this.eventId()) return;
    this.comments.update((list) => list.filter((c) => c.id !== payload.id));
  };

  constructor() {
    effect(() => {
      const id = this.eventId();
      this.comments.set([]);
      void this.load(id);
    });

    this.realtime.on<CommentCreatedPayload>('comment:created', this.handleCreated);
    this.realtime.on<CommentDeletedPayload>('comment:deleted', this.handleDeleted);
    this.destroyRef.onDestroy(() => {
      this.realtime.off<CommentCreatedPayload>('comment:created', this.handleCreated);
      this.realtime.off<CommentDeletedPayload>('comment:deleted', this.handleDeleted);
    });
  }

  private async load(eventId: string): Promise<void> {
    try {
      this.comments.set(await this.store.listComments(eventId));
    } catch {
      this.comments.set([]);
    }
  }

  async send(): Promise<void> {
    const content = this.newComment().trim();
    if (!content) return;
    this.sending.set(true);
    try {
      const comment = await this.store.addComment(this.eventId(), content);
      this.comments.update((list) => {
        if (list.some((existing) => existing.id === comment.id)) return list;
        return [...list, comment];
      });
      this.newComment.set('');
    } finally {
      this.sending.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    await this.store.deleteComment(id);
    this.comments.update((list) => list.filter((c) => c.id !== id));
  }
}
