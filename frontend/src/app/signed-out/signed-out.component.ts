import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DriverService } from '../core/driver.service';
import { I18nService } from '../core/i18n/i18n.service';

/** Shown after "Sign out". Placeholder until there is a real login page. */
@Component({
  selector: 'app-signed-out',
  standalone: true,
  template: `
    <div class="card">
      <span class="logo" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </span>
      <h1>{{ t('signedOut.title') }}</h1>
      <p>{{ t('signedOut.text') }}</p>
      <button type="button" (click)="signIn()">{{ t('signedOut.signIn') }}</button>
    </div>
  `,
  styles: `
    :host { flex: 1; display: grid; place-items: center; padding: 40px 20px; }
    .card { width: 100%; max-width: 360px; padding: 32px 24px; border: 1px solid var(--tx-line); border-radius: 16px; background: var(--tx-panel); text-align: center; }
    .logo { width: 52px; height: 52px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 13px; background: var(--tx-yellow); }
    h1 { margin: 0; font-size: 22px; font-weight: 800; }
    p { margin: 6px 0 22px; color: var(--tx-muted); }
    button { width: 100%; padding: 13px; border: 0; border-radius: var(--tx-radius); background: var(--tx-yellow); color: #000; font-weight: 800; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignedOutComponent {
  private readonly driver = inject(DriverService);
  private readonly router = inject(Router);
  readonly t = inject(I18nService).t;

  signIn(): void {
    this.driver.signIn();
    this.router.navigateByUrl('/');
  }
}
