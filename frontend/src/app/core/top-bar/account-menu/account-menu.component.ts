import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { DriverService } from '../../driver.service';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { LANGUAGES } from '../../settings/settings.service';

/** Drop-down under the avatar: who is signed in, settings, language and sign out. */
@Component({
  selector: 'app-account-menu',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass' },
})
export class AccountMenuComponent {
  readonly driver = inject(DriverService).profile;
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly languages = LANGUAGES;
  /** Emitted when the menu should close (after navigating or signing out). */
  readonly closed = output<void>();

  signOut(): void {
    this.auth.signOut();
    this.closed.emit();
    void this.router.navigate(['/login']);
  }
}
