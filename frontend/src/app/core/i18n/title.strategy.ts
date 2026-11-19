import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18nService, TranslationKey } from './i18n.service';

/**
 * Browser tab title in the chosen language. The `title` of a route in app.routes.ts is a
 * translation key; the tab shows "TaxIntel · <translated title>" and follows language changes.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18nService);
  private key: TranslationKey | null = null;

  constructor() {
    super();
    effect(() => this.title.setTitle(this.key ? `TaxIntel · ${this.i18n.t(this.key)}` : 'TaxIntel'));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = (this.buildTitle(snapshot) as TranslationKey | undefined) ?? null;
    this.title.setTitle(this.key ? `TaxIntel · ${this.i18n.t(this.key)}` : 'TaxIntel');
  }
}
