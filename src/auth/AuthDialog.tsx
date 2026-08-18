import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Mail, Phone, ShieldCheck, X } from 'lucide-react';
import { authApi } from './api';
import type { AuthUser, VerificationChannel } from './types';
import styles from './AuthDialog.module.css';

type AuthMode = 'LOGIN' | 'REGISTER';

interface AuthDialogProps {
  onAuthenticated(user: AuthUser): void;
  onClose(): void;
}

export function AuthDialog({ onAuthenticated, onClose }: AuthDialogProps): JSX.Element {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [channel, setChannel] = useState<VerificationChannel>('EMAIL');
  const [contact, setContact] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstControl = useRef<HTMLInputElement>(null);

  useEffect(() => { firstControl.current?.focus(); }, []);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  function switchMode(next: AuthMode): void {
    setMode(next); setCode(''); setSent(false); setError(null); setRemaining(0);
  }

  function switchChannel(next: VerificationChannel): void {
    setChannel(next); setContact(''); setCode(''); setSent(false); setError(null); setRemaining(0);
  }

  async function sendCode(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const result = await authApi.sendCode(channel, contact, mode);
      setSent(true); setRemaining(result.resendInSeconds);
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sent) { await sendCode(); return; }
    setBusy(true); setError(null);
    try {
      const user = mode === 'REGISTER'
        ? await authApi.register(channel, contact, code, displayName)
        : await authApi.login(channel, contact, code);
      onAuthenticated(user);
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }

  const contactLabel = channel === 'EMAIL' ? '邮箱' : '手机号';
  const contactPlaceholder = channel === 'EMAIL' ? 'name@example.com' : '13800138000';
  const codeLabel = channel === 'EMAIL' ? '邮箱验证码' : '短信验证码';

  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className={styles.close} type="button" onClick={onClose} aria-label="关闭登录窗口"><X size={20} /></button>
      <div className={styles.icon}><ShieldCheck aria-hidden="true" /></div>
      <h1 id="auth-title">{mode === 'LOGIN' ? '登录云帆志愿' : '注册云帆志愿'}</h1>
      <p className={styles.lead}>{mode === 'LOGIN' ? '登录后自动恢复你已填写的信息与志愿表。' : '注册后，填报信息会安全保存到你的账户。'}</p>
      <div className={styles.tabs} role="tablist" aria-label="账户操作">
        <button type="button" role="tab" aria-selected={mode === 'LOGIN'} onClick={() => switchMode('LOGIN')}>登录</button>
        <button type="button" role="tab" aria-selected={mode === 'REGISTER'} onClick={() => switchMode('REGISTER')}>注册</button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className={styles.channelTabs} role="tablist" aria-label="验证方式">
          <button type="button" role="tab" aria-selected={channel === 'EMAIL'} onClick={() => switchChannel('EMAIL')}><Mail size={16} aria-hidden="true" />邮箱</button>
          <button type="button" role="tab" aria-selected={channel === 'SMS'} onClick={() => switchChannel('SMS')}><Phone size={16} aria-hidden="true" />手机</button>
        </div>
        {mode === 'REGISTER' && <label><span>昵称</span><input value={displayName} maxLength={40} required onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：小云" /></label>}
        <label><span>{contactLabel}</span><div className={styles.inputWithIcon}><span className={styles.inputIcon}>{channel === 'EMAIL' ? <Mail size={18} aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}</span><input ref={firstControl} type={channel === 'EMAIL' ? 'email' : 'tel'} inputMode={channel === 'EMAIL' ? 'email' : 'numeric'} value={contact} required onChange={(event) => setContact(channel === 'SMS' ? event.target.value.replace(/[^\d+]/g, '') : event.target.value)} placeholder={contactPlaceholder} autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} /></div></label>
        <label><span>{codeLabel}</span><div className={styles.codeRow}><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} required={sent} disabled={!sent} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6 位验证码" autoComplete="one-time-code" /><button type="button" onClick={() => void sendCode()} disabled={busy || remaining > 0 || contact.trim().length === 0}>{remaining > 0 ? `${remaining}s 后重发` : sent ? '重新发送' : '获取验证码'}</button></div></label>
        {error !== null && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} type="submit" disabled={busy}>{busy ? '请稍候…' : sent ? (mode === 'LOGIN' ? '登录并恢复资料' : '注册并开始填报') : '发送验证码'}</button>
      </form>
      <p className={styles.note}>{channel === 'EMAIL' ? '验证码 5 分钟内有效。我们不会向你索取邮箱密码。' : '验证码 5 分钟内有效，将通过短信发送至你的手机。'}</p>
    </section>
  </div>;
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : '操作失败，请稍后重试';
}
