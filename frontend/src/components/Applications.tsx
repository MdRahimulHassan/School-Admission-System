import { api, type Hold } from '../lib/api';
import { POLL_INTERVAL_MS } from '../lib/config';
import { formatCountdown } from '../lib/format';
import { routeHref, useNow, usePolling, type Polled } from '../lib/hooks';
import { errorMessage, useLanguage } from '../lib/i18n';
import { ApplicationCard, effectiveStatus, type HoldAction } from './ApplicationCard';
import { InlineMessage } from './Feedback';

export interface HoldActions {
  /** Which application is being paid for or cancelled right now, if any. */
  busy: { holdId: string; action: HoldAction } | null;
  onPay: (hold: Hold) => void;
  onCancel: (hold: Hold) => void;
  onExpired: () => void;
}

const busyFor = (actions: HoldActions, holdId: string) =>
  actions.busy?.holdId === holdId ? actions.busy.action : null;

/** "My applications": every application of this student with its current state. */
export function MyApplications({
  holds,
  studentId,
  actions,
}: {
  holds: Polled<Hold[]>;
  studentId: string | null;
  actions: HoldActions;
}) {
  const { t } = useLanguage();

  return (
    <section aria-labelledby="applications-title">
      <div className="section-head">
        <h2 id="applications-title">{t('applications.title')}</h2>
      </div>

      {!studentId && <InlineMessage kind="info">{t('applications.needStudent')}</InlineMessage>}
      {studentId && holds.data === undefined && holds.loading && <p className="muted">{t('applications.loading')}</p>}
      {studentId && holds.data === undefined && holds.error && (
        <InlineMessage kind="error">{errorMessage(t, holds.error)}</InlineMessage>
      )}
      {studentId && holds.data?.length === 0 && (
        <p className="empty">
          {t('applications.empty')}{' '}
          <a className="link" href={routeHref({ page: 'classes' })}>
            {t('nav.classes')} →
          </a>
        </p>
      )}

      <div className="application-list">
        {studentId &&
          holds.data?.map((hold) => (
            <ApplicationCard
              key={hold.holdId}
              hold={hold}
              canAct
              busy={busyFor(actions, hold.holdId)}
              onPay={actions.onPay}
              onCancel={actions.onCancel}
              onExpired={actions.onExpired}
              showOpenLink
            />
          ))}
      </div>
    </section>
  );
}

/** The "Application" screen: one application with its countdown and the pay / cancel buttons. */
export function ApplicationPage({
  holdId,
  holds,
  studentId,
  actions,
}: {
  holdId: string;
  holds: Polled<Hold[]>;
  studentId: string | null;
  actions: HoldActions;
}) {
  const { t } = useLanguage();
  const mine = studentId ? holds.data?.find((hold) => hold.holdId === holdId) : undefined;

  // Opened without the owner's number (e.g. from a shared link): still show its state, read-only.
  const waitingForMine = studentId !== null && holds.data === undefined && holds.loading;
  const lookUp = !mine && !waitingForMine;
  const fetched = usePolling(lookUp ? () => api.getHold(holdId) : null, POLL_INTERVAL_MS, lookUp ? holdId : 'off');

  const hold = mine ?? fetched.data;
  const notFound = !hold && fetched.error?.code === 'HOLD_NOT_FOUND';

  return (
    <section aria-labelledby="application-title">
      <div className="section-head">
        <h2 id="application-title">{t('application.title')}</h2>
        <a className="link" href={routeHref({ page: 'applications' })}>
          ← {t('application.back')}
        </a>
      </div>

      {!hold && !notFound && !fetched.error && <p className="muted">{t('application.loading')}</p>}
      {notFound && <InlineMessage kind="error">{t('application.notFound')}</InlineMessage>}
      {!hold && fetched.error && !notFound && <InlineMessage kind="error">{errorMessage(t, fetched.error)}</InlineMessage>}

      {hold && (
        <ApplicationCard
          hold={hold}
          canAct={mine !== undefined}
          busy={busyFor(actions, hold.holdId)}
          onPay={actions.onPay}
          onCancel={actions.onCancel}
          onExpired={() => {
            actions.onExpired();
            void fetched.refresh();
          }}
        />
      )}
    </section>
  );
}

/**
 * A reminder shown on every screen while a seat is waiting for payment, so a student who
 * refreshes the page or reopens the browser sees the running application straight away.
 */
export function PendingPaymentBanner({ holds, hiddenForHoldId }: { holds: Hold[] | undefined; hiddenForHoldId?: string }) {
  const { t, language } = useLanguage();
  const now = useNow(1000);

  const pending = holds
    ?.filter((hold) => effectiveStatus(hold, now) === 'HELD' && hold.holdId !== hiddenForHoldId)
    .sort((a, b) => a.deadline - b.deadline)[0];
  if (!pending) return null;

  return (
    <a className="pending" href={routeHref({ page: 'application', holdId: pending.holdId })} data-testid="pending-banner">
      <span className="pending-text">{t('pending.text', { className: pending.className ?? pending.classId })}</span>
      <span className="pending-time">{formatCountdown(pending.deadline - now, language)}</span>
      <span className="pending-go">{t('application.open')} →</span>
    </a>
  );
}
