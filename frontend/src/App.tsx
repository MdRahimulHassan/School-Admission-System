import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HoldAction } from './components/ApplicationCard';
import { ApplicationPage, MyApplications, PendingPaymentBanner, type HoldActions } from './components/Applications';
import { ClassList } from './components/ClassList';
import { CreateClassForm } from './components/CreateClassForm';
import { NoticeBar, OfflineBanner, type Notice } from './components/Feedback';
import { StudentIdField } from './components/StudentIdField';
import { api, toApiError, type ClassInfo, type Hold } from './lib/api';
import { POLL_INTERVAL_MS } from './lib/config';
import { routeHref, usePolling, useRoute, useStoredString, type Route } from './lib/hooks';
import { useLanguage, type Language, type MessageKey } from './lib/i18n';
import { isValidStudentId } from './lib/studentId';

const SUCCESS_NOTICE_MS = 6000;

const NAV: { page: Route['page']; label: MessageKey }[] = [
  { page: 'classes', label: 'nav.classes' },
  { page: 'applications', label: 'nav.applications' },
  { page: 'admin', label: 'nav.admin' },
];

export default function App() {
  const { t, language, setLanguage } = useLanguage();
  const [route, navigate] = useRoute();

  // The birth registration number is the student's identity; keep it across refreshes and restarts.
  const [studentIdInput, setStudentIdInput] = useStoredString('admission.studentId');
  const studentId = isValidStudentId(studentIdInput) ? studentIdInput : null;

  // Both lists refresh on their own every few seconds, so nothing on screen needs a page reload.
  const classes = usePolling(api.listClasses, POLL_INTERVAL_MS, 'classes');
  const fetchMyHolds = useMemo(() => (studentId ? () => api.myHolds(studentId) : null), [studentId]);
  const holds = usePolling(fetchMyHolds, POLL_INTERVAL_MS, studentId ?? 'none');

  const [notice, setNotice] = useState<Notice | null>(null);
  const [applyingClassId, setApplyingClassId] = useState<string | null>(null);
  const [busyHold, setBusyHold] = useState<{ holdId: string; action: HoldAction } | null>(null);

  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timer = setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const refreshClasses = classes.refresh;
  const refreshHolds = holds.refresh;
  const refreshAll = useCallback(() => Promise.all([refreshClasses(), refreshHolds()]), [refreshClasses, refreshHolds]);

  async function apply(classInfo: ClassInfo) {
    if (!studentId || applyingClassId) return;
    setApplyingClassId(classInfo.id);
    try {
      const hold = await api.apply(classInfo.id, studentId);
      await refreshAll();
      setNotice({ kind: 'success', key: 'notice.applied', params: { className: classInfo.name } });
      navigate({ page: 'application', holdId: hold.holdId });
    } catch (error) {
      setNotice({ kind: 'error', error: toApiError(error) });
      void refreshAll(); // e.g. the last seat was just taken: show the real numbers straight away
    } finally {
      setApplyingClassId(null);
    }
  }

  async function actOnHold(hold: Hold, action: HoldAction) {
    if (!studentId || busyHold) return;
    setBusyHold({ holdId: hold.holdId, action });
    const className = hold.className ?? hold.classId;
    try {
      if (action === 'pay') {
        // No real payment gateway: pressing the button means the payment succeeded.
        await api.confirm(hold.holdId, studentId);
        setNotice({ kind: 'success', key: 'notice.confirmed', params: { className } });
      } else {
        await api.cancel(hold.holdId, studentId);
        setNotice({ kind: 'success', key: 'notice.cancelled', params: { className } });
      }
    } catch (error) {
      setNotice({ kind: 'error', error: toApiError(error) });
    } finally {
      await refreshAll();
      setBusyHold(null);
    }
  }

  const holdActions: HoldActions = {
    busy: busyHold,
    onPay: (hold) => void actOnHold(hold, 'pay'),
    onCancel: (hold) => void actOnHold(hold, 'cancel'),
    onExpired: () => void refreshAll(),
  };

  const serverUnreachable = Boolean(classes.error?.isNetworkError || holds.error?.isNetworkError);
  const activeTab: Route['page'] = route.page === 'application' ? 'applications' : route.page;

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={routeHref({ page: 'classes' })}>
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="26" height="26">
                <path d="M32 12 6 25l26 13 20-10v16h4V25z" fill="currentColor" />
                <path d="M17 36v10c0 3 7 7 15 7s15-4 15-7V36l-15 8z" fill="currentColor" opacity=".8" />
              </svg>
            </span>
            <span>
              <span className="brand-title">{t('app.title')}</span>
              <span className="brand-tagline">{t('app.tagline')}</span>
            </span>
          </a>

          <div className="language" role="group" aria-label={t('app.language')}>
            {(['bn', 'en'] as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                className={`language-option ${language === code ? 'is-active' : ''}`}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {code === 'bn' ? 'বাংলা' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="container">
        <StudentIdField value={studentIdInput} onChange={setStudentIdInput} />

        <nav className="tabs" aria-label={t('app.title')}>
          {NAV.map((item) => (
            <a
              key={item.page}
              href={routeHref({ page: item.page } as Route)}
              className={`tab ${activeTab === item.page ? 'is-active' : ''}`}
              aria-current={activeTab === item.page ? 'page' : undefined}
            >
              {t(item.label)}
            </a>
          ))}
        </nav>

        <div className="messages" aria-live="polite">
          {serverUnreachable && <OfflineBanner />}
          {notice && <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />}
          {studentId && (
            <PendingPaymentBanner
              holds={holds.data}
              hiddenForHoldId={route.page === 'application' ? route.holdId : undefined}
            />
          )}
        </div>

        <main>
          {route.page === 'classes' && (
            <ClassList
              classes={classes}
              holds={studentId ? holds.data : undefined}
              studentId={studentId}
              applyingClassId={applyingClassId}
              onApply={(classInfo) => void apply(classInfo)}
              onOpenHold={(holdId) => navigate({ page: 'application', holdId })}
            />
          )}
          {route.page === 'applications' && <MyApplications holds={holds} studentId={studentId} actions={holdActions} />}
          {route.page === 'application' && (
            <ApplicationPage holdId={route.holdId} holds={holds} studentId={studentId} actions={holdActions} />
          )}
          {route.page === 'admin' && <CreateClassForm onCreated={() => void refreshClasses()} />}
        </main>
      </div>
    </div>
  );
}
