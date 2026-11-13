import { TestBed } from '@angular/core/testing';
import { addDays } from '../../shared/utils/time';
import { SettingsService } from '../settings/settings.service';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.clear();
    i18n = TestBed.inject(I18nService);
  });

  it('translates in the chosen language', () => {
    expect(i18n.t('cal.title')).toBe('City calendar');
    TestBed.inject(SettingsService).language.set('nl');
    expect(i18n.t('cal.title')).toBe('Stadskalender');
    i18n.setLanguage('fr');
    expect(i18n.t('cal.title')).toBe('Agenda de la ville');
  });

  it('fills in parameters', () => {
    expect(i18n.t('toast.hotspotReached', { name: 'Zuid' })).toBe('Hotspot reached: Zuid');
    expect(i18n.t({ key: 'month.more', params: { count: 3 } })).toBe('+3 more');
  });

  it('labels today and tomorrow', () => {
    const now = new Date();
    expect(i18n.relativeDay(now, now)).toBe('Today');
    i18n.setLanguage('nl');
    expect(i18n.relativeDay(addDays(now, 1), now)).toBe('Morgen');
  });
});
