import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pages behind this guard need a signed-in driver; otherwise go to /login. */
export const authGuard: CanActivateFn = () => {
  return inject(AuthService).signedIn() || inject(Router).createUrlTree(['/login']);
};
