'use client';

import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { useAuth, login, resetPassword, signup } from '@/lib/use-auth';

/**
 * 인증 게이트 — 3 모드 (로그인 / 계정 만들기 / 비밀번호 재설정).
 * jpkerp-v4 디자인 그대로 포팅.
 */
type Mode = 'login' | 'signup' | 'reset';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, background: '#f8f9fa', color: 'var(--text-sub)', fontSize: 12,
      }}>
        <CircleNotch size={14} className="auth-spin" style={{ color: 'var(--brand)' }} />
        <span>로딩 중...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {mode === 'login'  && <LoginScreen  onSignup={() => setMode('signup')} onReset={() => setMode('reset')} />}
        {mode === 'signup' && <SignupScreen onBack={() => setMode('login')} />}
        {mode === 'reset'  && <ResetScreen  onBack={() => setMode('login')} />}
      </>
    );
  }
  return <>{children}</>;
}

function Brand() {
  return (
    <div className="auth-brand">
      <span className="auth-brand__base">team</span>
      <span className="auth-brand__main">jpk</span>{' '}
      <span className="auth-brand__erp">ERP</span>
    </div>
  );
}

function Copyright() {
  return <div className="auth-copyright">&copy; {new Date().getFullYear()} teamjpk. All Rights Reserved.</div>;
}

function AuthLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent', border: 0, padding: 0,
        color: 'var(--brand)', cursor: 'pointer',
        textDecoration: 'underline', textUnderlineOffset: 3,
        fontFamily: 'inherit', fontSize: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function LoginScreen({ onSignup, onReset }: { onSignup: () => void; onReset: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('invalid') || msg.includes('wrong-password')
          ? '이메일 또는 비밀번호가 잘못되었습니다'
          : msg.includes('user-not-found')
            ? '등록되지 않은 계정입니다'
            : msg.includes('too-many-requests')
              ? '시도 너무 많음 — 잠시 후 다시 시도하세요'
              : msg,
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <Brand />
      <section className="auth-card" aria-label="로그인">
        <header className="auth-card__head">
          <h2 className="auth-card__title">로그인</h2>
          <p className="auth-card__sub">이메일과 비밀번호를 입력해주세요.</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-email">이메일</label>
            <input id="login-email" type="email" autoComplete="email"
              placeholder="name@company.com" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">비밀번호</label>
            <input id="login-password" type="password" autoComplete="current-password"
              placeholder="비밀번호 입력" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 접속 중...
              </span>
            ) : '로그인'}
          </button>
        </form>
        <div className="auth-guide" style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          <AuthLink onClick={onSignup}>계정 만들기</AuthLink>
          <span style={{ color: '#dadce0' }}>·</span>
          <AuthLink onClick={onReset}>비밀번호 재설정</AuthLink>
        </div>
      </section>
      <Copyright />
    </div>
  );
}

function SignupScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function validate(): string | null {
    if (!email.trim() || !email.includes('@')) return '올바른 이메일을 입력해주세요';
    if (password.length < 6) return '비밀번호는 6자 이상이어야 합니다';
    if (!displayName.trim()) return '이름을 입력해주세요';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      await signup({ email, password, displayName, phone, department });
      setInfo('가입 완료 — 자동으로 로그인되었습니다.');
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('email-already-in-use')
          ? '이미 가입된 이메일입니다'
          : msg.includes('weak-password')
            ? '비밀번호가 너무 약합니다 (6자 이상)'
            : msg.includes('invalid-email')
              ? '이메일 형식이 잘못되었습니다'
              : msg,
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <Brand />
      <section className="auth-card" aria-label="계정 만들기">
        <header className="auth-card__head">
          <h2 className="auth-card__title">계정 만들기</h2>
          <p className="auth-card__sub">jpkerp5 직원 계정을 만듭니다.</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="su-email">이메일</label>
            <input id="su-email" type="email" autoComplete="username"
              placeholder="name@company.com" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="su-pw">비밀번호</label>
            <input id="su-pw" type="password" autoComplete="new-password"
              placeholder="6자 이상" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="su-name">이름</label>
            <input id="su-name" type="text" placeholder="홍길동" required
              value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="su-phone">연락처 (선택)</label>
            <input id="su-phone" type="tel" placeholder="010-0000-0000"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="su-dept">부서/직책 (선택)</label>
            <input id="su-dept" type="text" placeholder="예: 운영팀"
              value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          {info && <p className="auth-message" style={{ color: '#137333' }}>{info}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 가입 중...
              </span>
            ) : '가입하기'}
          </button>
        </form>
        <div className="auth-guide" style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthLink onClick={onBack}>로그인으로 돌아가기</AuthLink>
        </div>
      </section>
      <Copyright />
    </div>
  );
}

function ResetScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!email.trim() || !email.includes('@')) {
      setError('올바른 이메일을 입력해주세요');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
      setInfo('재설정 메일을 보냈습니다. 메일함을 확인해주세요.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <Brand />
      <section className="auth-card" aria-label="비밀번호 재설정">
        <header className="auth-card__head">
          <h2 className="auth-card__title">비밀번호 재설정</h2>
          <p className="auth-card__sub">가입한 이메일로 재설정 링크를 보내드립니다.</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="rp-email">이메일</label>
            <input id="rp-email" type="email" autoComplete="username"
              placeholder="name@company.com" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          {info && <p className="auth-message" style={{ color: '#137333' }}>{info}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 전송 중...
              </span>
            ) : '재설정 메일 전송'}
          </button>
        </form>
        <div className="auth-guide" style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthLink onClick={onBack}>로그인으로 돌아가기</AuthLink>
        </div>
      </section>
      <Copyright />
    </div>
  );
}
