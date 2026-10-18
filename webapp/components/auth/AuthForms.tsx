'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { AuthState, continueWithGoogle, logIn, requestPasswordReset, signUp, updatePassword } from '@/app/auth/actions';
import { useT } from '@/lib/i18n/client';

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn primary auth-submit" disabled={pending}>{pending ? busy : label}</button>;
}
const Msg = ({ state }: { state: AuthState }) => state && <p className={`form-msg ${state.ok ? 'ok' : 'err'}`} role="status">{state.message}</p>;

export function GoogleButton({ next, bare = false }: { next: string; bare?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AuthState>(null);
  const t = useT();
  return (
    <>
      <button type="button" className="btn auth-google" disabled={pending} data-track="signup_cta_clicked" data-placement="auth" data-cta="google"
        onClick={() => start(async () => {
          try {
            const id = sessionStorage.getItem('tt_flow') || crypto.randomUUID();
            sessionStorage.setItem('tt_flow', id);
            document.cookie = `tt_flow=${id}; path=/; max-age=86400; samesite=lax`;
          } catch { /* the server still records the attempt */ }
          const r = await continueWithGoogle(next); if (r) setMsg(r);
        })}>
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" /></svg>
        {t('Continue with Google')}
      </button>
      <Msg state={msg} />
      {!bare && <div className="auth-or"><span>{t('or')}</span></div>}
    </>
  );
}

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const t = useT();
  const [state, action] = useFormState<AuthState, FormData>(logIn, error === 'link' ? { ok: false, message: t('That link has expired or was already used — try again.') } : null);
  return (
    <>
      <GoogleButton next={next} />
      <form action={action} className="auth-form">
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>{t('Email')}</span><input name="email" type="email" autoComplete="email" required /></label>
        <label className="field"><span>{t('Password')}</span><input name="password" type="password" autoComplete="current-password" required /></label>
        <Link className="auth-aside" href="/forgot-password">{t('Forgot password?')}</Link>
        <Msg state={state} />
        <Submit label={t('Log in')} busy={t('Logging in…')} />
      </form>
      <p className="auth-switch">{t('New to Tender Town?')} <Link href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('Sign up')}</Link></p>
    </>
  );
}

export function SignupForm({ next }: { next: string }) {
  const t = useT();
  const [state, action] = useFormState<AuthState, FormData>(signUp, null);
  return (
    <>
      <GoogleButton next={next} />
      <form action={action} className="auth-form" data-signup="email">
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>{t('Email')}</span><input name="email" type="email" autoComplete="email" required /></label>
        <label className="field">
          <span>{t('Username')} <em>{t('— shown as u/name')}</em></span>
          <input name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}"
            title={t('3–24 letters, numbers or underscores')} />
        </label>
        <label className="field"><span>{t('Password')} <em>{t('— at least 8 characters')}</em></span><input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
        <label className="field"><span>{t('Confirm password')}</span><input name="confirm" type="password" autoComplete="new-password" required minLength={8} /></label>
        <p className="auth-legal">{t('By signing up you agree to our')} <Link href="/terms">{t('Terms & Conditions')}</Link> {t('and')} <Link href="/privacy">{t('Privacy Policy')}</Link>.</p>
        <Msg state={state} />
        <Submit label={t('Sign up')} busy={t('Creating your account…')} />
      </form>
      <p className="auth-switch">{t('Already have an account?')} <Link href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('Log in')}</Link></p>
    </>
  );
}

export function ForgotForm() {
  const t = useT();
  const [state, action] = useFormState<AuthState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="auth-form">
      <label className="field"><span>{t('Email')}</span><input name="email" type="email" autoComplete="email" required /></label>
      <Msg state={state} />
      <Submit label={t('Send reset link')} busy={t('Sending…')} />
      <p className="auth-switch"><Link href="/login">{t('Back to log in')}</Link></p>
    </form>
  );
}

export function NewPasswordForm({ then }: { then?: 'home' }) {
  const t = useT();
  const [state, action] = useFormState<AuthState, FormData>(updatePassword, null);
  return (
    <form action={action} className="auth-form">
      {then && <input type="hidden" name="then" value={then} />}
      <label className="field"><span>{t('New password')}</span><input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label className="field"><span>{t('Confirm new password')}</span><input name="confirm" type="password" autoComplete="new-password" required minLength={8} /></label>
      <Msg state={state} />
      <Submit label={t('Save password')} busy={t('Saving…')} />
    </form>
  );
}
