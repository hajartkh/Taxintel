import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DriverService } from '../../driver.service';
import { I18nService, LANGUAGES } from '../../i18n/i18n.service';

/** Dropdown under the avatar: name, settings, language and sign out. */
@Component({
  selector: 'app-account-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass', role: 'dialog', '[attr.aria-label]': 't("topbar.account")' },
})
export class AccountMenuComponent {
  private readonly driverService = inject(DriverService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;
  readonly driver = this.driverService.profile;
  readonly languages = LANGUAGES;

  /** Asks the top bar to close the menu. */
  readonly done = output<void>();

  signOut(): void {
    this.driverService.signOut();
    this.done.emit();
    this.router.navigateByUrl('/signed-out');
  }
}
