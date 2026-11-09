import { useEffect, useRef, useState } from 'react';
import type { Hold, HoldStatus } from '../lib/api';
import { formatCountdown } from '../lib/format';
import { routeHref, useNow } from '../lib/hooks';
import { useLanguage, type MessageKey } from '../lib/i18n';
import { StatusBadge } from './Feedback';

export type HoldAction = 'pay' | 'cancel';

interface Props {
  hold: Hold;
  /** False when we are only viewing (the entered birth registration number is not the owner's). */
  canAct: boolean;
  busy: HoldAction | null;
  onPay: (hold: Hold) => void;
  onCancel: (hold: Hold) => void;
  /** Called once, the moment the countdown reaches zero, so fresh data can be fetched. */
  onExpired?: () => void;
  /** Show an "Open" link to the application's own page (used in the list). */
  showOpenLink?: boolean;
}

/**
 * What the user should see right now. The server reports EXPIRED once the deadline passes;
 * between two refreshes the countdown gets there first, so the card flips by itself, without a reload.
 */
export function effectiveStatus(hold: Hold, now: number): HoldStatus {
  return hold.status === 'HELD' && hold.deadline <= now ? 'EXPIRED' : hold.status;
}

export function ApplicationCard({ hold, canAct, busy, onPay, onCancel, onExpired, showOpenLink }: Props) {
  const { t, language } = useLanguage();
  const now = useNow(1000);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const status = effectiveStatus(hold, now);
  const millisecondsLeft = hold.deadline - now;
  const canPay = status === 'HELD' && canAct && busy === null;

  // Tell the parent exactly once when a HELD application runs out of time.
  const reportedExpiry = useRef(false);
  useEffect(() => {
    if (hold.status === 'HELD' && status === 'EXPIRED' && !reportedExpiry.current) {
      reportedExpiry.current = true;
      setConfirmingCancel(false);
      onExpired?.();
    }
    if (status === 'HELD') reportedExpiry.current = false;
  }, [hold.status, status, onExpired]);

  return (
    <article className={`card application application-${status.toLowerCase()}`} data-testid={`hold-${hold.holdId}`}>
      <header className="application-head">
        <div>
          <h3>{hold.className ?? hold.classId}</h3>
          <p className="application-id">
            {t('application.id')} <code>{hold.holdId}</code>
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      <p className="application-detail">{t(`status.${status}.detail` as MessageKey)}</p>

      {status === 'HELD' && (
        <div className={`countdown ${millisecondsLeft <= 60_000 ? 'is-urgent' : ''}`}>
          <span className="countdown-label">{t('application.timeLeft')}</span>
          <span className="countdown-value" role="timer" aria-live="off" data-testid="countdown">
            {formatCountdown(millisecondsLeft, language)}
          </span>
        </div>
      )}

      {(status === 'HELD' || status === 'EXPIRED') && (
        <div className="application-actions">
          {confirmingCancel && status === 'HELD' ? (
            <div className="confirm-cancel" role="group" aria-label={t('application.cancelQuestion')}>
              <p>{t('application.cancelQuestion')}</p>
              <button
                type="button"
                className="button button-danger"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmingCancel(false);
                  onCancel(hold);
                }}
              >
                {t('application.cancelYes')}
              </button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmingCancel(false)}>
                {t('application.cancelNo')}
              </button>
            </div>
          ) : (
            <>
              {/* Stays visible but switched off after expiry, so it is obvious that paying is no longer possible. */}
              <button type="button" className="button button-primary" disabled={!canPay} onClick={() => onPay(hold)}>
                {busy === 'pay' ? t('application.paying') : t('application.pay')}
              </button>
              {status === 'HELD' && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!canAct || busy !== null}
                  onClick={() => setConfirmingCancel(true)}
                >
                  {busy === 'cancel' ? t('application.cancelling') : t('application.cancel')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!canAct && status === 'HELD' && <p className="muted small">{t('application.otherStudent')}</p>}

      <footer className="application-foot">
        {showOpenLink && (
          <a className="link" href={routeHref({ page: 'application', holdId: hold.holdId })}>
            {t('application.open')} →
          </a>
        )}
        {(status === 'EXPIRED' || status === 'CANCELLED') && (
          <a className="link" href={routeHref({ page: 'classes' })}>
            {t('application.applyAgain')} →
          </a>
        )}
      </footer>
    </article>
  );
}
