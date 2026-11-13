import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject } from '@angular/core';
import { daysBetween } from '../../shared/utils/time';
import { Language, SettingsService } from '../settings/settings.service';
import { EN, TranslationKey, Translations } from './translations/en';
import { FR } from './translations/fr';
import { NL } from './translations/nl';

export type TranslationParams = Record<string, string | number>;

/** A text that is translated when it is shown (so it follows a language switch). */
export interface Translatable {
  key: TranslationKey;
  params?: TranslationParams;
}

const DICTIONARIES: Record<Language, Translations> = { en: EN, nl: NL, fr: FR };
const LOCALES: Record<Language, string> = { en: 'en-GB', nl: 'nl-BE', fr: 'fr-BE' };

/**
 * Translations (EN / NL / FR) and locale-aware date formatting.
 * Templates use the `t` pipe; TypeScript code calls `t()` inside a computed signal,
 * so the text updates when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly settings = inject(SettingsService);
  private readonly document = inject(DOCUMENT);

  readonly language = this.settings.language.asReadonly();
  readonly locale = computed(() => LOCALES[this.language()]);
  private readonly dictionary = computed(() => DICTIONARIES[this.language()]);

  constructor() {
    effect(() => (this.document.documentElement.lang = this.language()));
  }

  setLanguage(language: Language): void {
    this.settings.language.set(language);
  }

  t(text: TranslationKey | Translatable, params?: TranslationParams): string {
    const key = typeof text === 'string' ? text : text.key;
    const values = typeof text === 'string' ? params : text.params;
    const template = this.dictionary()[key] ?? EN[key] ?? key;
    return values ? template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match)) : template;
  }

  // ---------- Dates ----------
  /** "Fri 13 Nov" / "vr 13 nov" */
  shortDate(d: Date): string {
    return d.toLocaleDateString(this.locale(), { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  }

  /** "Friday 13 November" */
  longDate(d: Date): string {
    return d.toLocaleDateString(this.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /** "November 2026" */
  monthYear(d: Date): string {
    return d.toLocaleDateString(this.locale(), { month: 'long', year: 'numeric' });
  }

  /** "Fri" / "vr" / "ven" */
  weekdayShort(d: Date): string {
    return d.toLocaleDateString(this.locale(), { weekday: 'short' }).replace(/\./g, '');
  }

  /** "Today", "Tomorrow", "Yesterday" or the short weekday. */
  relativeDay(d: Date, now: Date = new Date()): string {
    const diff = daysBetween(now, d);
    if (diff === 0) return this.t('common.today');
    if (diff === 1) return this.t('common.tomorrow');
    if (diff === -1) return this.t('common.yesterday');
    return this.weekdayShort(d);
  }

  /** "5 min ago" / "5 min geleden" / "il y a 5 min" */
  timeAgo(d: Date, now: Date = new Date()): string {
    const minutes = Math.round((d.getTime() - now.getTime()) / 60_000);
    const format = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto', style: 'short' });
    if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, 'hour');
    return format.format(Math.round(hours / 24), 'day');
  }

  greeting(d: Date, name: string): string {
    const h = d.getHours();
    const key: TranslationKey =
      h < 5 ? 'home.greeting.night' : h < 12 ? 'home.greeting.morning' : h < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening';
    return this.t(key, { name });
  }
}
