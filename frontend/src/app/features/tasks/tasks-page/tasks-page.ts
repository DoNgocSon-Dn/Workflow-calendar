import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { CalendarStore } from '../../calendar/data/calendar-store';
import { Todo, TodoList } from '../../calendar/models/calendar.models';
import { BrandLogo } from '../../../shared/components/brand-logo/brand-logo';
import { Icon } from '../../../shared/components/icon/icon';
import { SettingsModal } from '../../calendar/components/settings-modal/settings-modal';

const HIDDEN_LISTS_STORAGE_KEY = 'tasks-hidden-lists';

function readStoredHiddenLists(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_LISTS_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Bỏ qua storage lỗi/không khả dụng — mặc định không ẩn danh sách nào.
  }
  return new Set();
}

/**
 * Trang "Việc cần làm" đầy đủ — nhiều danh sách hiển thị song song thành các
 * cột, tách biệt hẳn với trang Lịch (chuyển qua lại bằng nút ở góc phải trên).
 * Widget nhanh trong bong bóng nổi (FloatingHub) vẫn còn cho thêm việc nhanh,
 * nhưng quản lý nhiều danh sách thì phải ở đây.
 */
@Component({
  selector: 'app-tasks-page',
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandLogo, Icon, RouterLink, DatePipe, SettingsModal],
})
export class TasksPage {
  protected readonly store = inject(CalendarStore);
  protected readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly userEmail = computed(() => this.authStore.user()?.email ?? '');
  protected readonly displayName = computed(() => this.authStore.displayName() ?? this.userEmail());
  protected readonly userInitial = computed(() => this.displayName().charAt(0).toUpperCase() || '?');
  protected readonly userMenuOpen = signal(false);
  protected readonly settingsModalOpen = signal(false);

  protected readonly sidebarOpen = signal(true);
  // Đọc thẳng từ CalendarStore — KHÔNG giữ bản sao riêng — để trang này luôn
  // khớp với bong bóng nổi (FloatingHub) và modal tạo sự kiện, không cần tải lại.
  protected readonly loading = computed(() => !this.store.todosLoaded());
  protected readonly lists = this.store.todoLists;
  protected readonly todos = this.store.todos;
  protected readonly hiddenListIds = signal<Set<string>>(readStoredHiddenLists());

  protected readonly visibleLists = computed(() =>
    this.lists().filter((l) => !this.hiddenListIds().has(l.id)),
  );

  /** "Tất cả việc cần làm" = bảng nhiều cột như bình thường; "Có gắn dấu sao"
   *  = một danh sách gộp duy nhất, xuyên suốt mọi danh sách (kể cả đang ẩn). */
  protected readonly viewFilter = signal<'all' | 'starred'>('all');
  protected readonly starredPending = computed(() =>
    this.todos().filter((t) => t.starred && !t.done),
  );
  protected readonly starredDone = computed(() => this.todos().filter((t) => t.starred && t.done));

  protected readonly newListName = signal('');
  protected readonly creatingList = signal(false);
  protected readonly renamingListId = signal<string | null>(null);
  protected readonly renameDraft = signal('');

  private readonly newTodoDrafts = signal<Record<string, string>>({});
  protected readonly savingTodoListId = signal<string | null>(null);
  protected readonly editingTodoId = signal<string | null>(null);
  protected readonly editingTodoContent = signal('');

  protected pendingTodosForList(listId: string): Todo[] {
    return this.todos().filter((t) => t.listId === listId && !t.done);
  }

  protected doneTodosForList(listId: string): Todo[] {
    return this.todos().filter((t) => t.listId === listId && t.done);
  }

  protected hasTodos(listId: string): boolean {
    return this.todos().some((t) => t.listId === listId);
  }

  async clearAllTodos(list: TodoList): Promise<void> {
    const ids = this.todos()
      .filter((t) => t.listId === list.id)
      .map((t) => t.id);
    if (ids.length === 0) return;
    if (!confirm(`Xoá toàn bộ ${ids.length} việc cần làm trong "${list.name}"?`)) return;

    await Promise.all(ids.map((id) => this.store.deleteTodo(id)));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  isListHidden(id: string): boolean {
    return this.hiddenListIds().has(id);
  }

  toggleListVisibility(id: string): void {
    this.hiddenListIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_LISTS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Không chặn UI nếu ghi storage lỗi — trạng thái ẩn/hiện chỉ mất khi tải lại.
      }
      return next;
    });
  }

  async createList(): Promise<void> {
    const name = this.newListName().trim();
    if (!name || this.creatingList()) return;
    this.creatingList.set(true);
    try {
      await this.store.createTodoList(name);
      this.newListName.set('');
    } finally {
      this.creatingList.set(false);
    }
  }

  startRenameList(list: TodoList): void {
    this.renamingListId.set(list.id);
    this.renameDraft.set(list.name);
  }

  cancelRenameList(): void {
    this.renamingListId.set(null);
    this.renameDraft.set('');
  }

  async saveRenameList(id: string): Promise<void> {
    const name = this.renameDraft().trim();
    if (!name) {
      this.cancelRenameList();
      return;
    }
    await this.store.renameTodoList(id, name);
    this.cancelRenameList();
  }

  async removeList(list: TodoList): Promise<void> {
    if (this.lists().length <= 1) {
      alert('Không thể xoá danh sách cuối cùng.');
      return;
    }
    if (!confirm(`Xoá danh sách "${list.name}" và toàn bộ việc cần làm trong đó?`)) return;
    try {
      await this.store.deleteTodoList(list.id);
    } catch (err: any) {
      alert(err?.error?.message || 'Không thể xoá danh sách.');
    }
  }

  todoDraft(listId: string): string {
    return this.newTodoDrafts()[listId] ?? '';
  }

  setTodoDraft(listId: string, value: string): void {
    this.newTodoDrafts.update((m) => ({ ...m, [listId]: value }));
  }

  async addTodo(listId: string): Promise<void> {
    const content = this.todoDraft(listId).trim();
    if (!content || this.savingTodoListId()) return;
    this.savingTodoListId.set(listId);
    try {
      await this.store.createTodo(content, listId);
      this.setTodoDraft(listId, '');
    } finally {
      this.savingTodoListId.set(null);
    }
  }

  async toggleTodo(todo: Todo): Promise<void> {
    await this.store.updateTodo(todo.id, { done: !todo.done });
  }

  async toggleStar(todo: Todo): Promise<void> {
    await this.store.updateTodo(todo.id, { starred: !todo.starred });
  }

  listNameFor(listId: string): string {
    return this.lists().find((l) => l.id === listId)?.name ?? '';
  }

  startEditTodo(todo: Todo): void {
    this.editingTodoId.set(todo.id);
    this.editingTodoContent.set(todo.content);
  }

  cancelEditTodo(): void {
    this.editingTodoId.set(null);
    this.editingTodoContent.set('');
  }

  async saveEditTodo(id: string): Promise<void> {
    const content = this.editingTodoContent().trim();
    if (!content) {
      this.cancelEditTodo();
      return;
    }
    await this.store.updateTodo(id, { content });
    this.cancelEditTodo();
  }

  async removeTodo(id: string): Promise<void> {
    await this.store.deleteTodo(id);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  openSettingsFromMenu(): void {
    this.closeUserMenu();
    this.settingsModalOpen.set(true);
  }

  async logout(): Promise<void> {
    this.closeUserMenu();
    await this.authStore.signOut();
    await this.router.navigate(['/login']);
  }
}
