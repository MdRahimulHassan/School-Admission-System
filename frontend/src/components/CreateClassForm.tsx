import { useState, type FormEvent } from 'react';
import { api, toApiError, type ApiError } from '../lib/api';
import { localizeDigits } from '../lib/format';
import { errorMessage, useLanguage, type MessageKey } from '../lib/i18n';
import { toAsciiDigits } from '../lib/studentId';
import { InlineMessage } from './Feedback';

const MAX_NAME_LENGTH = 200;
const MAX_SEATS = 100_000;

/** The school admin's screen: a class is a name plus a number of seats. */
export function CreateClassForm({ onCreated }: { onCreated: () => void }) {
  const { t, language } = useLanguage();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<MessageKey | ApiError | null>(null);
  const [created, setCreated] = useState<{ name: string; seats: number } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setCreated(null);

    // Check here first so the admin gets an answer instantly; the server checks again anyway.
    const trimmedName = name.trim();
    if (!trimmedName) return setProblem('admin.nameRequired');
    if (trimmedName.length > MAX_NAME_LENGTH) return setProblem('admin.nameTooLong');
    const seatsText = toAsciiDigits(seats).trim();
    const totalSeats = Number(seatsText);
    if (!/^\d+$/.test(seatsText) || totalSeats < 1 || totalSeats > MAX_SEATS) return setProblem('admin.seatsInvalid');

    setProblem(null);
    setSaving(true);
    try {
      const result = await api.createClass(trimmedName, totalSeats);
      setCreated({ name: result.name, seats: result.totalSeats });
      setName('');
      setSeats('');
      onCreated();
    } catch (error) {
      setProblem(toApiError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="admin-title">
      <div className="section-head">
        <h2 id="admin-title">{t('admin.title')}</h2>
      </div>
      <p className="muted">{t('admin.subtitle')}</p>

      <form className="card form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="class-name">{t('admin.name')}</label>
          <input
            id="class-name"
            className="input"
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH + 50}
            placeholder={t('admin.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field field-small">
          <label htmlFor="class-seats">{t('admin.seats')}</label>
          <input
            id="class-seats"
            className="input"
            type="text"
            inputMode="numeric"
            value={seats}
            placeholder={t('admin.seatsPlaceholder')}
            onChange={(event) => setSeats(event.target.value)}
          />
        </div>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? t('admin.creating') : t('admin.create')}
        </button>

        {problem && (
          <InlineMessage kind="error">{typeof problem === 'string' ? t(problem) : errorMessage(t, problem)}</InlineMessage>
        )}
        {created && (
          <p className="inline-message inline-success" role="status">
            ✓ {t('admin.created', { name: created.name, seats: localizeDigits(created.seats, language) })}
          </p>
        )}
      </form>
    </section>
  );
}
