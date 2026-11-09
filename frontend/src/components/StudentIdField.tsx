import { localizeDigits } from '../lib/format';
import { useLanguage } from '../lib/i18n';
import { isValidStudentId, normalizeStudentId, STUDENT_ID_LENGTH } from '../lib/studentId';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * There is no login: this number is who the student is. It is remembered in the browser,
 * so the same applications are shown after a refresh or after closing the browser.
 */
export function StudentIdField({ value, onChange }: Props) {
  const { t, language } = useLanguage();
  const valid = isValidStudentId(value);

  const hint =
    value.length === 0
      ? t('student.empty')
      : valid
        ? t('student.ok')
        : t('student.progress', { count: localizeDigits(value.length, language) });

  return (
    <section className="identity">
      <label htmlFor="student-id">
        {t('student.label')}
      </label>
      <div className="identity-row">
        <input
          id="student-id"
          className={`input identity-input ${valid ? 'is-valid' : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={STUDENT_ID_LENGTH + 8}
          placeholder={t('student.placeholder')}
          value={value}
          // Bangla digits and stray spaces or dashes are accepted and cleaned up as the user types.
          onChange={(event) => onChange(normalizeStudentId(event.target.value))}
          aria-describedby="student-id-hint"
          aria-invalid={value.length > 0 && !valid}
        />
        {value.length > 0 && (
          <button type="button" className="button button-ghost" onClick={() => onChange('')}>
            {t('student.clear')}
          </button>
        )}
      </div>
      <p id="student-id-hint" className={`identity-hint ${valid ? 'is-valid' : ''}`}>
        {valid && <span aria-hidden="true">✓ </span>}
        {hint}
      </p>
    </section>
  );
}
