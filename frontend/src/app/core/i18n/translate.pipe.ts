import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService, Translatable, TranslationParams } from './i18n.service';
import { TranslationKey } from './translations/en';

/**
 * Translates a key (or a Translatable) in templates:
 *   {{ 'cal.title' | t }}
 *   {{ 'route.basis' | t: { day: d, time: t } }}
 * Not pure: it must run again when the language changes, even if the key stays the same.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(text: TranslationKey | Translatable | null | undefined, params?: TranslationParams): string {
    return text ? this.i18n.t(text, params) : '';
  }
}
