import { Injectable, effect, signal } from '@angular/core';

export type Language = 'en' | 'nl' | 'fr';
/** Base map style: dark (default) or light with coloured water, parks, streets and buildings. */
export type MapTheme = 'dark' | 'light';

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'fr', label: 'Français' },
];

const STORAGE = { language: 'taxintel.language', mapTheme: 'taxintel.mapTheme' } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable (private mode, server rendering)
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered, but the setting still applies for this visit
  }
}

/** User preferences, remembered per device in localStorage. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly language = signal<Language>(LANGUAGES.some((l) => l.code === read(STORAGE.language)) ? (read(STORAGE.language) as Language) : 'en');
  readonly mapTheme = signal<MapTheme>(read(STORAGE.mapTheme) === 'light' ? 'light' : 'dark');

  constructor() {
    effect(() => write(STORAGE.language, this.language()));
    effect(() => write(STORAGE.mapTheme, this.mapTheme()));
  }
}
