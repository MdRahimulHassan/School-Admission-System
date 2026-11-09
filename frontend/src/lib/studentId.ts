export const STUDENT_ID_LENGTH = 17;

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** "২০১৫" -> "2015". People in Bangladesh often type numbers with a Bangla keyboard. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}

/** Keeps only digits (Bangla or English), as English digits, at most 17 of them. */
export function normalizeStudentId(input: string): string {
  return toAsciiDigits(input).replace(/\D/g, '').slice(0, STUDENT_ID_LENGTH);
}

export function isValidStudentId(value: string): boolean {
  return /^\d{17}$/.test(value);
}
