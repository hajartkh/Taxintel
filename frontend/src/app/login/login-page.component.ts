import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { DriverService } from '../core/driver.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LANGUAGES } from '../core/settings/settings.service';

/** Shown after signing out. Dummy sign-in until there is a real login. */
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  readonly driver = inject(DriverService).profile;
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly languages = LANGUAGES;

  signIn(): void {
    this.auth.signIn();
    void this.router.navigate(['/']);
  }
}
