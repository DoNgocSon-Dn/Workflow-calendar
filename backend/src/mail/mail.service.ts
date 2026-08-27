import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const { gmailUser, gmailAppPassword } = this.configService.get('mail', {
        infer: true,
      });
      if (!gmailUser || !gmailAppPassword) {
        throw new Error(
          'Thiếu GMAIL_USER/GMAIL_APP_PASSWORD trong .env — xem backend/.env.example.',
        );
      }
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailAppPassword },
      });
    }
    return this.transporter;
  }

  async sendMail(input: SendMailInput): Promise<void> {
    const { gmailUser } = this.configService.get('mail', { infer: true });
    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: `Workflow <${gmailUser}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  }

  async sendInviteEmail(params: {
    to: string;
    eventTitle: string;
    description?: string;
    startAt: string;
    endAt: string;
    location?: string;
    meetLink?: string;
    acceptUrl: string;
    declineUrl: string;
  }): Promise<void> {
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="color:#5f6368; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin:0 0 8px;">Lời mời từ Workflow</p>
        <h2 style="margin-bottom: 4px;">${escapeHtml(params.eventTitle)}</h2>
        <p>Bạn được mời tham gia sự kiện này trên Workflow.</p>
        <p><strong>Thời gian:</strong> ${formatRange(params.startAt, params.endAt)}</p>
        ${params.location ? `<p><strong>Địa điểm:</strong> ${escapeHtml(params.location)}</p>` : ''}
        ${params.meetLink ? `<p><strong>Link cuộc họp:</strong> <a href="${escapeHtml(params.meetLink)}">${escapeHtml(params.meetLink)}</a></p>` : ''}
        ${params.description ? `<p><strong>Mô tả:</strong> ${escapeHtml(params.description)}</p>` : ''}
        <div style="margin-top: 24px;">
          <a href="${params.acceptUrl}" style="background:#1a73e8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;margin-right:12px;display:inline-block;">Đồng ý</a>
          <a href="${params.declineUrl}" style="background:#d93025;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;">Từ chối</a>
        </div>
        <p style="color:#888; font-size:12px; margin-top:24px;">Link xác nhận có hiệu lực trong 7 ngày, chỉ dùng được 1 lần. Email này được gửi tự động từ ứng dụng Workflow.</p>
      </div>
    `;
    await this.sendMail({
      to: params.to,
      subject: `[Workflow] Lời mời tham gia: ${params.eventTitle}`,
      html,
    });
  }

  async sendReminderEmail(to: string, eventTitle: string, startAt: string): Promise<void> {
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Sắp tới: ${escapeHtml(eventTitle)}</h2>
        ${startAt ? `<p>${formatDateTime(startAt)}</p>` : ''}
      </div>
    `;
    await this.sendMail({
      to,
      subject: `Sắp tới: ${eventTitle}`,
      html,
    });
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'full', timeStyle: 'short' });
}

function formatRange(startIso: string, endIso: string): string {
  return `${formatDateTime(startIso)} - ${new Date(endIso).toLocaleTimeString('vi-VN', { timeStyle: 'short' })}`;
}
