import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { DriverService } from '../core/driver.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LANGUAGES, MapTheme, SettingsService } from '../core/settings/settings.service';

/** Profile, language, map style and sign out. */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {
  readonly driver = inject(DriverService).profile;
  readonly settings = inject(SettingsService);
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly languages = LANGUAGES;
  readonly themes: ReadonlyArray<{ key: MapTheme; label: TranslationKey }> = [
    { key: 'dark', label: 'theme.dark' },
    { key: 'light', label: 'theme.light' },
  ];

  signOut(): void {
    this.auth.signOut();
    void this.router.navigate(['/login']);
  }
}
