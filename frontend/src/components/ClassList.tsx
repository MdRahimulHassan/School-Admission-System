import type { ClassInfo, Hold } from '../lib/api';
import { localizeDigits } from '../lib/format';
import type { Polled } from '../lib/hooks';
import { errorMessage, useLanguage } from '../lib/i18n';
import { InlineMessage } from './Feedback';

interface Props {
  classes: Polled<ClassInfo[]>;
  /** This student's applications, used to show "View application" instead of "Apply". */
  holds: Hold[] | undefined;
  studentId: string | null;
  applyingClassId: string | null;
  onApply: (classInfo: ClassInfo) => void;
  onOpenHold: (holdId: string) => void;
}

/** The student's application that currently occupies a seat in this class, if any. */
function activeHoldFor(classId: string, holds: Hold[] | undefined): Hold | undefined {
  return holds?.find(
    (hold) =>
      hold.classId === classId &&
      (hold.status === 'CONFIRMED' || (hold.status === 'HELD' && hold.deadline > Date.now())),
  );
}

export function ClassList({ classes, holds, studentId, applyingClassId, onApply, onOpenHold }: Props) {
  const { t, language } = useLanguage();
  const number = (value: number) => localizeDigits(value, language);

  return (
    <section aria-labelledby="classes-title">
      <div className="section-head">
        <h2 id="classes-title">{t('classes.title')}</h2>
        <p className="live-note">
          <span className="live-dot" aria-hidden="true" />
          {t('classes.live')}
        </p>
      </div>

      {!studentId && <InlineMessage kind="info">{t('classes.needStudent')}</InlineMessage>}

      {classes.data === undefined && classes.loading && <p className="muted">{t('classes.loading')}</p>}
      {classes.data === undefined && classes.error && (
        <InlineMessage kind="error">{errorMessage(t, classes.error)}</InlineMessage>
      )}
      {classes.data?.length === 0 && <p className="empty">{t('classes.empty')}</p>}

      <ul className="class-list">
        {classes.data?.map((item) => {
          const myHold = activeHoldFor(item.id, holds);
          const full = item.availableSeats <= 0;
          const applying = applyingClassId === item.id;
          const percent = (seats: number) => `${item.totalSeats > 0 ? (seats / item.totalSeats) * 100 : 0}%`;

          return (
            <li key={item.id} className="card class-card" data-testid={`class-${item.id}`}>
              <div className="class-main">
                <h3>{item.name}</h3>
                <dl className="stats">
                  <div className="stat">
                    <dt>{t('classes.total')}</dt>
                    <dd>{number(item.totalSeats)}</dd>
                  </div>
                  <div className="stat stat-held">
                    <dt>{t('classes.held')}</dt>
                    <dd>{number(item.heldSeats)}</dd>
                  </div>
                  <div className="stat stat-confirmed">
                    <dt>{t('classes.confirmed')}</dt>
                    <dd>{number(item.confirmedSeats)}</dd>
                  </div>
                  <div className={`stat stat-available ${full ? 'is-full' : ''}`}>
                    <dt>{t('classes.available')}</dt>
                    <dd>{number(item.availableSeats)}</dd>
                  </div>
                </dl>
                <div className="seat-bar" aria-hidden="true">
                  <span className="seat-bar-confirmed" style={{ width: percent(item.confirmedSeats) }} />
                  <span className="seat-bar-held" style={{ width: percent(item.heldSeats) }} />
                </div>
              </div>

              <div className="class-action">
                {myHold ? (
                  <>
                    <span className={`tag ${myHold.status === 'CONFIRMED' ? 'tag-confirmed' : 'tag-held'}`}>
                      {myHold.status === 'CONFIRMED' ? t('classes.admitted') : t('classes.pending')}
                    </span>
                    <button type="button" className="button button-secondary" onClick={() => onOpenHold(myHold.holdId)}>
                      {t('classes.viewApplication')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={!studentId || full || applyingClassId !== null}
                    onClick={() => onApply(item)}
                  >
                    {applying ? t('classes.applying') : full ? t('classes.full') : t('classes.apply')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
