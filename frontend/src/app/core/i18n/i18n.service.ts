import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { daysBetween, weekdayShort } from '../../shared/utils/time';
import { Lang, Message, TRANSLATIONS, TranslationKey } from './translations';

export type { Lang, Message, TranslationKey } from './translations';

export const LANGUAGES: ReadonlyArray<{ code: Lang; short: string; label: string }> = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'nl', short: 'NL', label: 'Nederlands' },
  { code: 'fr', short: 'FR', label: 'Français' },
];

/** Locale for dates and numbers per language (Belgian formats). */
const LOCALES: Record<Lang, string> = { en: 'en-GB', nl: 'nl-BE', fr: 'fr-BE' };

const STORAGE_KEY = 'taxintel.lang';

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((l) => l.code === saved) ? (saved as Lang) : 'en';
  } catch {
    return 'en'; // storage unavailable (private mode, server rendering)
  }
}

/**
 * Language of the app. Components call `t('key')` in their template; because `t` reads the
 * `lang` signal, the text updates as soon as the driver picks another language.
 * Texts live in translations.ts.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<Lang>(loadLang());
  readonly locale = computed(() => LOCALES[this.lang()]);

  constructor() {
    this.document.documentElement.lang = this.lang();
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not remembered, but the language still changes
    }
  }

  /** Translated text; `{name}` placeholders are filled from `params`. */
  readonly t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const text = TRANSLATIONS[this.lang()][key] ?? TRANSLATIONS.en[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : text;
  };

  /** Translate a stored message (key + params). */
  readonly msg = (message: Message): string => this.t(message.key, message.params);

  /** Number in the chosen language: 1.6 → "1,6" in NL/FR. */
  number(value: number, fractionDigits = 0): string {
    return value.toLocaleString(this.locale(), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  }

  /** Distance: "350 m" or "1,6 km". */
  distance(meters: number): string {
    return meters < 1000 ? `${Math.max(0, Math.round(meters / 10) * 10)} m` : `${this.number(meters / 1000, 1)} km`;
  }

  /** "Today" / "Vandaag" / "Demain" / … or the short weekday. `capitalize: false` for use inside a sentence. */
  relativeDay(date: Date, now: Date = new Date(), capitalize = true): string {
    const diff = daysBetween(now, date);
    const text =
      Math.abs(diff) <= 1
        ? new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' }).format(diff, 'day')
        : weekdayShort(date, this.locale());
    return capitalize ? text.charAt(0).toLocaleUpperCase(this.locale()) + text.slice(1) : text;
  }

  /** "5 min ago", "2 uur geleden", "hier" … */
  relativeTime(date: Date, now: Date = new Date()): string {
    const rtf = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto', style: 'short' });
    const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
    if (Math.abs(minutes) < 1) return rtf.format(0, 'minute');
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
  }
}
