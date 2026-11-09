import type { Language } from './i18n';

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Shows digits in the reader's script: 120 -> "১২০" in Bangla, "120" in English. */
export function localizeDigits(text: string | number, language: Language): string {
  const value = String(text);
  return language === 'bn' ? value.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]) : value;
}

/** 125 seconds -> "02:05"; an hour or more -> "1:02:05". Never negative. */
export function formatCountdown(millisecondsLeft: number, language: Language): string {
  const totalSeconds = Math.max(0, Math.ceil(millisecondsLeft / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  const text = hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
  return localizeDigits(text, language);
}
