import { describe, expect, it } from 'vitest';
import { formatCountdown, localizeDigits } from './format';
import { parseRoute, routeHref } from './hooks';
import { translate } from './i18n';
import { isValidStudentId, normalizeStudentId } from './studentId';

describe('birth registration number', () => {
  it('accepts exactly 17 digits', () => {
    expect(isValidStudentId('20152691234567890')).toBe(true);
    expect(isValidStudentId('2015269123456789')).toBe(false);
    expect(isValidStudentId('201526912345678901')).toBe(false);
    expect(isValidStudentId('2015269123456789X')).toBe(false);
  });

  it('cleans up what people really type: Bangla digits, spaces, dashes and extra digits', () => {
    expect(normalizeStudentId('২০১৫২৬৯১২৩৪৫৬৭৮৯০')).toBe('20152691234567890');
    expect(normalizeStudentId('2015-2691 2345 67890')).toBe('20152691234567890');
    expect(normalizeStudentId('201526912345678909999')).toBe('20152691234567890');
    expect(normalizeStudentId('abc')).toBe('');
  });
});

describe('number formatting', () => {
  it('shows digits in the script of the chosen language', () => {
    expect(localizeDigits(120, 'en')).toBe('120');
    expect(localizeDigits(120, 'bn')).toBe('১২০');
  });

  it('formats the countdown and never goes below zero', () => {
    expect(formatCountdown(600_000, 'en')).toBe('10:00');
    expect(formatCountdown(65_000, 'en')).toBe('01:05');
    expect(formatCountdown(400, 'en')).toBe('00:01');
    expect(formatCountdown(-5_000, 'en')).toBe('00:00');
    expect(formatCountdown(3_725_000, 'en')).toBe('1:02:05');
    expect(formatCountdown(65_000, 'bn')).toBe('০১:০৫');
  });
});

describe('routes', () => {
  it('reads the screen from the address', () => {
    expect(parseRoute('')).toEqual({ page: 'classes' });
    expect(parseRoute('#/applications')).toEqual({ page: 'applications' });
    expect(parseRoute('#/applications/h_abc')).toEqual({ page: 'application', holdId: 'h_abc' });
    expect(parseRoute('#/admin')).toEqual({ page: 'admin' });
    expect(parseRoute('#/anything-else')).toEqual({ page: 'classes' });
  });

  it('round-trips through the address', () => {
    const route = { page: 'application', holdId: 'h_abc' } as const;
    expect(parseRoute(routeHref(route))).toEqual(route);
  });
});

describe('translations', () => {
  it('fills in the placeholders', () => {
    expect(translate('en', 'admin.created', { name: 'Class 6', seats: 120 })).toBe('“Class 6” was created with 120 seats.');
    expect(translate('bn', 'pending.text', { className: 'Class 6' })).toBe('Class 6-এর ভর্তি ফি দেওয়া বাকি');
  });
});
