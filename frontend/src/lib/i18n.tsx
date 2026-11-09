import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiError } from './api';

export type Language = 'bn' | 'en';

const en = {
  'app.title': 'School Admission',
  'app.tagline': 'First come, first served',
  'app.language': 'Language',

  'student.label': "Student's birth registration number",
  'student.placeholder': '17-digit number',
  'student.empty': 'Enter the 17-digit number to apply and to see your applications.',
  'student.progress': '{count} of 17 digits entered',
  'student.ok': 'Number accepted',
  'student.clear': 'Clear',

  'nav.classes': 'Classes',
  'nav.applications': 'My applications',
  'nav.admin': 'Create class',

  'classes.title': 'Classes',
  'classes.live': 'Seat numbers update automatically every few seconds.',
  'classes.empty': 'No classes yet. A school admin can add one from “Create class”.',
  'classes.loading': 'Loading classes…',
  'classes.total': 'Total',
  'classes.held': 'On hold',
  'classes.confirmed': 'Confirmed',
  'classes.available': 'Available',
  'classes.apply': 'Apply',
  'classes.applying': 'Applying…',
  'classes.full': 'No seats',
  'classes.needStudent': 'Enter the birth registration number above to apply.',
  'classes.viewApplication': 'View application',
  'classes.admitted': 'Admitted',
  'classes.pending': 'Payment pending',

  'application.title': 'Application',
  'application.back': 'All my applications',
  'application.timeLeft': 'Time left to pay',
  'application.pay': 'Pay admission fee',
  'application.paying': 'Paying…',
  'application.cancel': 'Cancel',
  'application.cancelling': 'Cancelling…',
  'application.cancelQuestion': 'Cancel this application? The seat will be given up.',
  'application.cancelYes': 'Yes, cancel it',
  'application.cancelNo': 'No, keep it',
  'application.open': 'Open',
  'application.applyAgain': 'See classes',
  'application.notFound': 'This application could not be found.',
  'application.loading': 'Loading application…',
  'application.otherStudent':
    'To pay or cancel, enter the birth registration number this application was made with.',
  'application.id': 'Application no.',

  'status.HELD': 'Waiting for payment',
  'status.CONFIRMED': 'Admission confirmed',
  'status.EXPIRED': 'Time ran out',
  'status.CANCELLED': 'Cancelled',
  'status.HELD.detail': 'A seat is being held for you. Pay the admission fee before the time runs out.',
  'status.CONFIRMED.detail': 'The fee has been received and the admission is confirmed.',
  'status.EXPIRED.detail':
    'The fee was not paid in time, so the seat was released. You can apply again if seats are left.',
  'status.CANCELLED.detail': 'This application was cancelled and the seat was released.',

  'applications.title': 'My applications',
  'applications.empty': 'No applications yet. Choose a class and press “Apply”.',
  'applications.needStudent': 'Enter the birth registration number above to see the applications.',
  'applications.loading': 'Loading applications…',

  'pending.text': 'Payment pending for {className}',

  'admin.title': 'Create a class',
  'admin.subtitle': 'For the school admin. Each shift is its own class, for example “Class 6 – Morning Shift”.',
  'admin.name': 'Class name',
  'admin.namePlaceholder': 'Class 6 – Morning Shift',
  'admin.seats': 'Number of seats',
  'admin.seatsPlaceholder': '120',
  'admin.create': 'Create class',
  'admin.creating': 'Creating…',
  'admin.created': '“{name}” was created with {seats} seats.',
  'admin.nameRequired': 'Write the class name.',
  'admin.nameTooLong': 'The class name can be at most 200 characters.',
  'admin.seatsInvalid': 'Seats must be a whole number from 1 to 100,000.',

  'notice.applied': 'Seat held for {className}. Pay the fee before the time runs out.',
  'notice.confirmed': 'Admission confirmed for {className}.',
  'notice.cancelled': 'The application for {className} was cancelled.',
  'notice.dismiss': 'Close',

  'offline.text': 'Cannot reach the server. The numbers shown may be out of date. Trying again…',

  'error.NETWORK_ERROR': 'Cannot reach the server. Check your internet connection and try again.',
  'error.SERVICE_UNAVAILABLE': 'The service is not available right now. Please try again in a moment.',
  'error.NO_SEATS_AVAILABLE': 'Sorry, every seat in this class is taken right now.',
  'error.ALREADY_APPLIED': 'This student already has an application or a confirmed admission in this class.',
  'error.HOLD_EXPIRED': 'The time to pay has run out and the seat was released. Please apply again.',
  'error.HOLD_CANCELLED': 'This application was cancelled, so it cannot be paid for.',
  'error.HOLD_ALREADY_CONFIRMED': 'This admission is already confirmed and cannot be cancelled here.',
  'error.NOT_YOUR_HOLD': 'This application belongs to a different birth registration number.',
  'error.CLASS_NOT_FOUND': 'This class no longer exists.',
  'error.HOLD_NOT_FOUND': 'This application could not be found.',
  'error.STUDENT_ID_REQUIRED': 'Enter the 17-digit birth registration number first.',
  'error.STUDENT_ID_INVALID': 'The birth registration number must be exactly 17 digits.',
  'error.NAME_REQUIRED': 'Write the class name.',
  'error.NAME_INVALID': 'The class name can be at most 200 characters.',
  'error.TOTAL_SEATS_INVALID': 'Seats must be a whole number from 1 to 100,000.',
  'error.UNKNOWN': 'Something went wrong. Please try again.',

  'crash.title': 'Something went wrong on this page',
  'crash.text': 'Your applications are safe. Reload the page to continue.',
  'crash.reload': 'Reload',
};

export type MessageKey = keyof typeof en;

const bn: Record<MessageKey, string> = {
  'app.title': 'স্কুল ভর্তি',
  'app.tagline': 'আগে আবেদন করলে আগে পাবেন',
  'app.language': 'ভাষা',

  'student.label': 'শিক্ষার্থীর জন্ম নিবন্ধন নম্বর',
  'student.placeholder': '১৭ অঙ্কের নম্বর',
  'student.empty': 'আবেদন করতে ও নিজের আবেদন দেখতে ১৭ অঙ্কের নম্বরটি লিখুন।',
  'student.progress': '১৭ অঙ্কের মধ্যে {count}টি লেখা হয়েছে',
  'student.ok': 'নম্বর ঠিক আছে',
  'student.clear': 'মুছুন',

  'nav.classes': 'ক্লাস তালিকা',
  'nav.applications': 'আমার আবেদন',
  'nav.admin': 'ক্লাস তৈরি',

  'classes.title': 'ক্লাস তালিকা',
  'classes.live': 'সিটের সংখ্যা কয়েক সেকেন্ড পরপর নিজে থেকেই হালনাগাদ হয়।',
  'classes.empty': 'এখনো কোনো ক্লাস নেই। স্কুল অ্যাডমিন “ক্লাস তৈরি” থেকে ক্লাস যোগ করতে পারেন।',
  'classes.loading': 'ক্লাসের তালিকা আনা হচ্ছে…',
  'classes.total': 'মোট',
  'classes.held': 'হোল্ডে',
  'classes.confirmed': 'নিশ্চিত',
  'classes.available': 'খালি',
  'classes.apply': 'আবেদন করুন',
  'classes.applying': 'আবেদন হচ্ছে…',
  'classes.full': 'সিট নেই',
  'classes.needStudent': 'আবেদন করতে উপরে জন্ম নিবন্ধন নম্বর লিখুন।',
  'classes.viewApplication': 'আবেদন দেখুন',
  'classes.admitted': 'ভর্তি নিশ্চিত',
  'classes.pending': 'ফি বাকি',

  'application.title': 'আবেদন',
  'application.back': 'আমার সব আবেদন',
  'application.timeLeft': 'ফি দেওয়ার সময় বাকি',
  'application.pay': 'ভর্তি ফি দিন',
  'application.paying': 'ফি জমা হচ্ছে…',
  'application.cancel': 'বাতিল',
  'application.cancelling': 'বাতিল হচ্ছে…',
  'application.cancelQuestion': 'আবেদনটি বাতিল করবেন? সিটটি ছেড়ে দেওয়া হবে।',
  'application.cancelYes': 'হ্যাঁ, বাতিল করুন',
  'application.cancelNo': 'না, রেখে দিন',
  'application.open': 'খুলুন',
  'application.applyAgain': 'ক্লাস তালিকা দেখুন',
  'application.notFound': 'এই আবেদনটি খুঁজে পাওয়া যায়নি।',
  'application.loading': 'আবেদন আনা হচ্ছে…',
  'application.otherStudent': 'ফি দিতে বা বাতিল করতে, যে জন্ম নিবন্ধন নম্বর দিয়ে আবেদন করা হয়েছিল সেটি উপরে লিখুন।',
  'application.id': 'আবেদন নং',

  'status.HELD': 'ফি জমার অপেক্ষায়',
  'status.CONFIRMED': 'ভর্তি নিশ্চিত',
  'status.EXPIRED': 'মেয়াদ শেষ',
  'status.CANCELLED': 'বাতিল',
  'status.HELD.detail': 'আপনার জন্য একটি সিট ধরে রাখা হয়েছে। সময় শেষ হওয়ার আগে ভর্তি ফি দিন।',
  'status.CONFIRMED.detail': 'ফি জমা হয়েছে, ভর্তি নিশ্চিত।',
  'status.EXPIRED.detail': 'সময়ের মধ্যে ফি জমা হয়নি, তাই সিটটি ছেড়ে দেওয়া হয়েছে। সিট খালি থাকলে আবার আবেদন করতে পারেন।',
  'status.CANCELLED.detail': 'এই আবেদনটি বাতিল করা হয়েছে এবং সিটটি ছেড়ে দেওয়া হয়েছে।',

  'applications.title': 'আমার আবেদন',
  'applications.empty': 'এখনো কোনো আবেদন নেই। একটি ক্লাস বেছে “আবেদন করুন” চাপুন।',
  'applications.needStudent': 'আবেদন দেখতে উপরে জন্ম নিবন্ধন নম্বর লিখুন।',
  'applications.loading': 'আবেদনগুলো আনা হচ্ছে…',

  'pending.text': '{className}-এর ভর্তি ফি দেওয়া বাকি',

  'admin.title': 'নতুন ক্লাস তৈরি',
  'admin.subtitle': 'স্কুল অ্যাডমিনের জন্য। প্রতিটি shift আলাদা একটি ক্লাস, যেমন “Class 6 – Morning Shift”।',
  'admin.name': 'ক্লাসের নাম',
  'admin.namePlaceholder': 'Class 6 – Morning Shift',
  'admin.seats': 'সিট সংখ্যা',
  'admin.seatsPlaceholder': '১২০',
  'admin.create': 'ক্লাস তৈরি করুন',
  'admin.creating': 'তৈরি হচ্ছে…',
  'admin.created': '“{name}” তৈরি হয়েছে, সিট {seats}টি।',
  'admin.nameRequired': 'ক্লাসের নাম লিখুন।',
  'admin.nameTooLong': 'ক্লাসের নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।',
  'admin.seatsInvalid': 'সিট সংখ্যা ১ থেকে ১,০০,০০০-এর মধ্যে একটি পূর্ণ সংখ্যা হতে হবে।',

  'notice.applied': '{className}-এ আপনার সিট ধরে রাখা হয়েছে। সময় শেষ হওয়ার আগে ফি দিন।',
  'notice.confirmed': '{className}-এ ভর্তি নিশ্চিত হয়েছে।',
  'notice.cancelled': '{className}-এর আবেদন বাতিল করা হয়েছে।',
  'notice.dismiss': 'বন্ধ করুন',

  'offline.text': 'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। দেখানো সংখ্যা পুরোনো হতে পারে। আবার চেষ্টা করা হচ্ছে…',

  'error.NETWORK_ERROR': 'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
  'error.SERVICE_UNAVAILABLE': 'সেবাটি এই মুহূর্তে বন্ধ আছে। একটু পরে আবার চেষ্টা করুন।',
  'error.NO_SEATS_AVAILABLE': 'দুঃখিত, এই ক্লাসের সব সিট এই মুহূর্তে শেষ।',
  'error.ALREADY_APPLIED': 'এই শিক্ষার্থীর এই ক্লাসে আগে থেকেই একটি আবেদন বা নিশ্চিত ভর্তি আছে।',
  'error.HOLD_EXPIRED': 'ফি দেওয়ার সময় শেষ হয়ে গেছে, সিটটি ছেড়ে দেওয়া হয়েছে। আবার আবেদন করুন।',
  'error.HOLD_CANCELLED': 'এই আবেদনটি বাতিল করা হয়েছে, তাই ফি দেওয়া যাবে না।',
  'error.HOLD_ALREADY_CONFIRMED': 'এই ভর্তি আগেই নিশ্চিত হয়েছে, এখান থেকে বাতিল করা যাবে না।',
  'error.NOT_YOUR_HOLD': 'এই আবেদনটি অন্য একটি জন্ম নিবন্ধন নম্বরের।',
  'error.CLASS_NOT_FOUND': 'এই ক্লাসটি আর নেই।',
  'error.HOLD_NOT_FOUND': 'এই আবেদনটি খুঁজে পাওয়া যায়নি।',
  'error.STUDENT_ID_REQUIRED': 'আগে ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।',
  'error.STUDENT_ID_INVALID': 'জন্ম নিবন্ধন নম্বর ঠিক ১৭ অঙ্কের হতে হবে।',
  'error.NAME_REQUIRED': 'ক্লাসের নাম লিখুন।',
  'error.NAME_INVALID': 'ক্লাসের নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।',
  'error.TOTAL_SEATS_INVALID': 'সিট সংখ্যা ১ থেকে ১,০০,০০০-এর মধ্যে একটি পূর্ণ সংখ্যা হতে হবে।',
  'error.UNKNOWN': 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',

  'crash.title': 'এই পাতায় একটি সমস্যা হয়েছে',
  'crash.text': 'আপনার আবেদনগুলো নিরাপদ আছে। চালিয়ে যেতে পাতাটি আবার লোড করুন।',
  'crash.reload': 'আবার লোড করুন',
};

const messages: Record<Language, Record<MessageKey, string>> = { en, bn };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translate(language: Language, key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[language][key] ?? messages.en[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : template;
}

/** Turns any API failure into a sentence the user can act on, in their language. */
export function errorMessage(t: Translate, error: ApiError): string {
  const key = `error.${error.code}` as MessageKey;
  return key in en ? t(key) : t('error.UNKNOWN');
}

const STORAGE_KEY = 'admission.language';

/** Bangla first: the system is built for guardians in Bangladesh. English is one tap away. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'bn' || saved === 'en') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall through to the default.
  }
  return 'bn';
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'bn',
  setLanguage: () => {},
  t: (key, params) => translate('bn', key, params),
});

export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => initial ?? initialLanguage());

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth interrupting the user for.
    }
  }, []);

  // Tell the browser and screen readers which language the page is in.
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'app.title');
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t: (key, params) => translate(language, key, params) }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
