import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DriverService } from '../core/driver.service';
import { I18nService, LANGUAGES } from '../core/i18n/i18n.service';

/** Settings of the driver: profile (read-only for now) and language. */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;
  readonly driver = inject(DriverService).profile;
  readonly languages = LANGUAGES;
}
