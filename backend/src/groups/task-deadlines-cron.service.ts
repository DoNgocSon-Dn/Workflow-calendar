import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';

export type DeadlinePhase = 'upcoming' | 'due' | 'overdue';

interface DueTaskRow {
  id: string;
  group_id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  groups: { name: string } | null;
}

/** "Sắp đến hạn" khi còn <= 24h. */
const UPCOMING_MS = 24 * 60 * 60 * 1000;
/** "Đến hạn" khi nằm trong khoảng +/- 5 phút quanh mốc dueDate. */
const DUE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Cron phát thông báo deadline cho task nhóm.
 *
 * Dùng lại đúng hạ tầng của `RemindersCronService`: @nestjs/schedule +
 * RealtimeGateway.emitToUser. Chống gửi trùng bằng bảng
 * `task_deadline_notifications` (unique task_id + user_id + phase), nên một
 * task quá hạn KHÔNG bị bắn lại mỗi phút.
 */
@Injectable()
export class TaskDeadlinesCronService {
  private readonly logger = new Logger(TaskDeadlinesCronService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleTaskDeadlines(): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();
    const now = Date.now();
    const horizonIso = new Date(now + UPCOMING_MS).toISOString();

    const { data, error } = await supabase
      .from('group_tasks')
      .select('id, group_id, title, status, assigned_to, due_date, groups(name)')
      .not('assigned_to', 'is', null)
      .not('due_date', 'is', null)
      .neq('status', 'done')
      .lte('due_date', horizonIso)
      .returns<DueTaskRow[]>();

    if (error) {
      this.logger.error(`Failed to fetch task deadlines: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    for (const task of data) {
      try {
        await this.dispatch(supabase, task, now);
      } catch (err) {
        this.logger.error(
          `Failed to dispatch deadline for task ${task.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async dispatch(
    supabase: SupabaseClient,
    task: DueTaskRow,
    now: number,
  ): Promise<void> {
    if (!task.assigned_to || !task.due_date) return;

    const due = new Date(task.due_date).getTime();
    if (Number.isNaN(due)) return;

    const phase = this.resolvePhase(due, now);
    if (!phase) return;

    // Bảng có unique(task_id, user_id, phase): insert trùng sẽ lỗi 23505 và ta
    // hiểu là "mốc này đã bắn rồi" → bỏ qua, không emit lại.
    const { error: markError } = await supabase
      .from('task_deadline_notifications')
      .insert({ task_id: task.id, user_id: task.assigned_to, phase });

    if (markError) {
      if (markError.code === '23505') return;
      throw new Error(markError.message);
    }

    this.realtimeGateway.emitToUser(task.assigned_to, 'task:deadline', {
      taskId: task.id,
      groupId: task.group_id,
      groupName: task.groups?.name ?? null,
      title: task.title,
      dueDate: task.due_date,
      phase,
    });
  }

  private resolvePhase(due: number, now: number): DeadlinePhase | null {
    if (due < now - DUE_WINDOW_MS) return 'overdue';
    if (Math.abs(due - now) <= DUE_WINDOW_MS) return 'due';
    if (due - now <= UPCOMING_MS) return 'upcoming';
    return null;
  }
}
