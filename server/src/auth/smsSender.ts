import { config, isProduction } from '../config';
import { serviceError } from '../errors';
import type { VerificationSmsSender } from './types';

/**
 * 短信验证码发送器（开发模式）。
 *
 * 国内短信服务（阿里云/腾讯云）均要求企业实名、短信签名与模板审核，且按条计费，没有免费通道。
 * 开发期使用 console 模式把验证码打印到后端日志，便于本地联调；上线前需将 SMS_TRANSPORT 改为
 * provider 并配置服务商密钥、签名与模板（见 config.ts 的 sms 配置块）。
 */
export class ConsoleSmsSender implements VerificationSmsSender {
  async sendVerificationCode({ to, code, purpose }: { to: string; code: string; purpose: 'REGISTER' | 'LOGIN' }): Promise<void> {
    if (config.sms.transport === 'console') {
      if (isProduction) throw serviceError('TEMPORARY_FAILURE', '生产环境必须配置短信服务商');
      console.info(`[sms:console] ${purpose} verification to ${to}: ${code}`);
      return;
    }

    // 真实短信服务商接入点（预留）：根据 config.sms.provider 调用阿里云/腾讯云 SDK。
    // 需要 SMS_ACCESS_KEY_ID、SMS_ACCESS_KEY_SECRET、SMS_SIGN_NAME、SMS_TEMPLATE_CODE 均已配置，
    // 并使用服务商提供的 6 位验证码模板变量下发 code。未配置时直接报错，避免静默发送失败。
    void config.sms.provider;
    throw serviceError('TEMPORARY_FAILURE', '短信服务尚未配置，请联系管理员');
  }
}
