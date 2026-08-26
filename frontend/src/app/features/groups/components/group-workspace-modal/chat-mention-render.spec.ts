import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GroupMessageMention } from '../../models/group.models';
import { MessageSegment, splitMessageSegments } from '../../utils/mention.util';

/**
 * Chốt cách VIẾT template của phần tô màu mention trong tin nhắn.
 *
 * Angular gộp khoảng trắng thụt đầu dòng thành một dấu cách THẬT trong nội
 * dung. Nếu mỗi mảnh được bọc trong nhánh `@if/@else` viết xuống dòng cho dễ
 * đọc, tin nhắn hiển thị ra sẽ mọc thêm dấu cách quanh từng mention — sai lệch
 * so với nội dung người dùng đã gõ. Bài test này giữ cho markup luôn khít.
 *
 * Template dưới đây phải giống hệt đoạn trong group-workspace-modal.html.
 */
@Component({
  selector: 'app-chat-text-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="chat-text">@for (seg of segments(); track $index) {<span
      [class.chat-mention]="!!seg.mention"
      [class.chat-mention--all]="seg.mention?.type === 'all'"
    >{{ seg.text }}</span>}</p>`,
})
class ChatTextProbe {
  readonly segments = signal<MessageSegment[]>([]);
}

function render(text: string, mentions: GroupMessageMention[]): HTMLElement {
  const fixture = TestBed.createComponent(ChatTextProbe);
  fixture.componentInstance.segments.set(splitMessageSegments(text, mentions));
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('p') as HTMLElement;
}

describe('hiển thị mention trong tin nhắn', () => {
  const cuong: GroupMessageMention = {
    type: 'user',
    userId: 'u1',
    label: 'Quốc Cường',
  };
  const all: GroupMessageMention = { type: 'all', label: 'All' };

  it('nội dung hiển thị khớp từng ký tự với nội dung đã gửi', () => {
    const text = 'Chào @Quốc Cường nhé';
    expect(render(text, [cuong]).textContent).toBe(text);
  });

  it('không chèn khoảng trắng thừa khi mention đứng đầu tin nhắn', () => {
    const text = '@All họp lúc 3h';
    expect(render(text, [all]).textContent).toBe(text);
  });

  it('nhiều mention liên tiếp vẫn giữ nguyên nội dung', () => {
    const text = '@All và @Quốc Cường xem giúp';
    expect(render(text, [all, cuong]).textContent).toBe(text);
  });

  it('giữ nguyên ký tự xuống dòng', () => {
    const text = '@All\ndòng hai';
    expect(render(text, [all]).textContent).toBe(text);
  });

  it('mention được bọc trong span có class nhận diện', () => {
    const el = render('Chào @Quốc Cường', [cuong]);
    const marked = el.querySelectorAll('.chat-mention');
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toBe('@Quốc Cường');
  });

  it('@All có class riêng, khác với mention một người', () => {
    const el = render('@All và @Quốc Cường', [all, cuong]);
    expect(el.querySelectorAll('.chat-mention--all').length).toBe(1);
    expect(el.querySelectorAll('.chat-mention').length).toBe(2);
  });
});
