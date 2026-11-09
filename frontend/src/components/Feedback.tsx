import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ApiError, HoldStatus } from '../lib/api';
import { errorMessage, translate, useLanguage, type Language, type MessageKey } from '../lib/i18n';

/** Something to tell the user after an action. Translated when shown, so it follows the language toggle. */
export type Notice =
  | { kind: 'success'; key: MessageKey; params?: Record<string, string | number> }
  | { kind: 'error'; error: ApiError };

export function NoticeBar({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { t } = useLanguage();
  const text = notice.kind === 'error' ? errorMessage(t, notice.error) : t(notice.key, notice.params);

  return (
    <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">
        {notice.kind === 'error' ? '!' : '✓'}
      </span>
      <p>{text}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label={t('notice.dismiss')}>
        ×
      </button>
    </div>
  );
}

/** Shown while the server cannot be reached. Disappears by itself when the connection returns. */
export function OfflineBanner() {
  const { t } = useLanguage();
  return (
    <div className="offline" role="alert">
      <span className="offline-dot" aria-hidden="true" />
      {t('offline.text')}
    </div>
  );
}

export function StatusBadge({ status }: { status: HoldStatus }) {
  const { t } = useLanguage();
  return (
    <span className={`badge badge-${status.toLowerCase()}`} data-status={status}>
      {t(`status.${status}` as MessageKey)}
      <span className="badge-code">{status}</span>
    </span>
  );
}

export function InlineMessage({ kind, children }: { kind: 'info' | 'error'; children: ReactNode }) {
  return (
    <p className={`inline-message inline-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </p>
  );
}

function savedLanguage(): Language {
  try {
    return localStorage.getItem('admission.language') === 'en' ? 'en' : 'bn';
  } catch {
    return 'bn';
  }
}

/** If a bug breaks rendering, show an explanation and a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The page crashed while rendering', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const language = savedLanguage();
    return (
      <div className="crash" role="alert">
        <h1>{translate(language, 'crash.title')}</h1>
        <p>{translate(language, 'crash.text')}</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          {translate(language, 'crash.reload')}
        </button>
      </div>
    );
  }
}
