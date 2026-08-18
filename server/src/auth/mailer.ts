import nodemailer from 'nodemailer';
import { config, isProduction } from '../config';
import { serviceError } from '../errors';
import type { VerificationMailer } from './types';

export class SmtpVerificationMailer implements VerificationMailer {
  private transporter: nodemailer.Transporter | null = null;

  async sendVerificationCode({ to, code, purpose }: { to: string; code: string; purpose: 'REGISTER' | 'LOGIN' }): Promise<void> {
    if (config.mail.transport === 'console') {
      if (isProduction) throw serviceError('TEMPORARY_FAILURE', '生产环境必须配置 SMTP 邮件服务');
      console.info(`[mail:console] ${purpose} verification to ${to}: ${code}`);
      return;
    }

    if (config.mail.smtpUser.length === 0 || config.mail.smtpPass.length === 0 || config.mail.from.length === 0) {
      throw serviceError('TEMPORARY_FAILURE', '邮件服务尚未配置，请联系管理员');
    }

    try {
      const action = purpose === 'REGISTER' ? '注册云帆志愿' : '登录云帆志愿';
      await this.getTransporter().sendMail({
        from: config.mail.from,
        to,
        subject: `【云帆志愿】${action}验证码`,
        text: `你的${action}验证码是 ${code}，5 分钟内有效。请勿将验证码告诉他人。`,
        html: `<p>你的${action}验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 5 分钟内有效。请勿将验证码告诉他人。</p>`,
      });
    } catch (error) {
      console.error('[mail] 验证码发送失败:', error);
      throw serviceError('TEMPORARY_FAILURE', '验证码发送失败，请稍后重试');
    }
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter !== null) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: config.mail.smtpHost,
      port: config.mail.smtpPort,
      secure: config.mail.smtpSecure,
      auth: { user: config.mail.smtpUser, pass: config.mail.smtpPass },
    });
    return this.transporter;
  }
}
