import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    '(window:scroll)': 'onWindowScroll()',
  },
})
export class LandingPage implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private revealObserver: IntersectionObserver | null = null;

  protected readonly navScrolled = signal(false);

  onWindowScroll(): void {
    this.navScrolled.set(window.scrollY > 8);
  }

  protected readonly features: Feature[] = [
    {
      icon: '📅',
      title: 'Lịch cá nhân & nhiều lịch',
      description:
        'Tạo bao nhiêu lịch tùy thích, gắn màu riêng cho từng lịch, xem theo tuần/tháng/ngày/agenda và mời bạn bè cùng chỉnh sửa.',
    },
    {
      icon: '👥',
      title: 'Nhóm làm việc (Workspaces)',
      description:
        'Mỗi nhóm có lịch, bảng task Kanban và khung chat real-time riêng — mời thành viên, phân quyền owner/admin/member chỉ trong vài giây.',
    },
    {
      icon: '✨',
      title: 'Trợ lý AI tích hợp',
      description:
        'Hỏi trợ lý AI ngay trong lịch để tạo sự kiện, tóm tắt lịch trình hoặc trả lời nhanh mà không cần rời khỏi màn hình.',
    },
    {
      icon: '🏮',
      title: 'Lịch âm & ngày lễ Việt Nam',
      description:
        'Ngày âm lịch hiển thị song song ngày dương trên mọi lưới lịch, kèm popup giới thiệu các ngày lễ lớn trong năm.',
    },
    {
      icon: '🔔',
      title: 'Nhắc nhở & lời mời',
      description:
        'Nhận thông báo nhắc việc đúng lúc, quản lý lời mời tham gia lịch/nhóm và không bao giờ bỏ lỡ sự kiện quan trọng.',
    },
    {
      icon: '🎨',
      title: '4 giao diện thương hiệu',
      description:
        'Chọn theme Airbnb, Mintlify, Supabase hoặc Vercel — cộng thêm chế độ Sáng/Tối, đổi giao diện theo đúng gu của bạn.',
    },
  ];

  protected readonly steps: Step[] = [
    {
      number: '01',
      title: 'Đăng nhập không mật khẩu',
      description: 'Chỉ cần Gmail hoặc email — không cần nhớ thêm một mật khẩu nào nữa.',
    },
    {
      number: '02',
      title: 'Tạo lịch & mời nhóm',
      description: 'Dựng lịch cá nhân hoặc mở một Nhóm làm việc, mời đồng đội tham gia ngay.',
    },
    {
      number: '03',
      title: 'Cộng tác theo thời gian thực',
      description: 'Task, chat và sự kiện đồng bộ tức thì cho mọi thành viên trong nhóm.',
    },
  ];

  protected readonly faqs = signal<FaqItem[]>([
    {
      question: 'Workflow có miễn phí không?',
      answer:
        'Có. Toàn bộ tính năng lịch cá nhân, nhóm làm việc và trợ lý AI đều dùng miễn phí — không cần thẻ thanh toán để bắt đầu.',
    },
    {
      question: 'Tôi có cần cài đặt phần mềm gì không?',
      answer:
        'Không. Workflow chạy hoàn toàn trên trình duyệt, hoạt động tốt trên cả máy tính lẫn điện thoại, không cần tải ứng dụng riêng.',
    },
    {
      question: 'Dữ liệu lịch của tôi có an toàn không?',
      answer:
        'Có. Mỗi lịch và nhóm làm việc chỉ hiển thị cho đúng người bạn mời, và bạn có thể thu hồi quyền truy cập bất kỳ lúc nào.',
    },
    {
      question: 'Tôi đang dùng lịch khác, chuyển sang Workflow có mất công không?',
      answer:
        'Không — Workflow hỗ trợ nhập (import) file lịch sẵn có, và sự kiện xoá nhầm vẫn nằm trong Thùng rác để khôi phục lại.',
    },
    {
      question: 'Trợ lý AI hoạt động như thế nào?',
      answer:
        'Trợ lý AI nằm ngay trong màn hình lịch — chỉ cần mô tả việc cần làm bằng ngôn ngữ tự nhiên, AI sẽ giúp bạn tạo hoặc tra cứu sự kiện.',
    },
  ]);

  protected readonly openFaqIndex = signal<number | null>(0);
  protected readonly currentYear = new Date().getFullYear();

  toggleFaq(index: number): void {
    this.openFaqIndex.update((current) => (current === index ? null : index));
  }

  ngAfterViewInit(): void {
    this.initScrollReveal();
    this.destroyRef.onDestroy(() => this.revealObserver?.disconnect());
  }

  /**
   * Scroll-triggered reveal for everything below the hero (which animates
   * on load instead). Reduced-motion users just see every section already
   * in place — no observer needed for them.
   */
  private initScrollReveal(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = this.host.nativeElement.querySelectorAll('[data-reveal]') as NodeListOf<HTMLElement>;
    if (!targets.length) return;

    this.revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    targets.forEach((el) => this.revealObserver!.observe(el));
  }
}
