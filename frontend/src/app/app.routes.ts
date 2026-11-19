import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { DriverService } from './core/driver.service';

/** Pages of the app are only open while the driver is signed in. */
const signedIn: CanActivateFn = () =>
  inject(DriverService).signedIn() || inject(Router).createUrlTree(['/signed-out']);

// `title` is a translation key (see core/i18n/title.strategy.ts).
// Pages are lazy loaded: each one (and Leaflet) only downloads when it is opened.
export const routes: Routes = [
  {
    path: '',
    title: 'page.home',
    canActivate: [signedIn],
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'calendar',
    title: 'calPage.title',
    canActivate: [signedIn],
    loadComponent: () => import('./calendar/calendar-page.component').then((m) => m.CalendarPageComponent),
  },
  {
    path: 'settings',
    title: 'settings.title',
    canActivate: [signedIn],
    loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'signed-out',
    title: 'page.signedOut',
    loadComponent: () => import('./signed-out/signed-out.component').then((m) => m.SignedOutComponent),
  },
  {
    path: 'route-finder',
    title: 'page.routeFinder',
    canActivate: [signedIn],
    loadComponent: () => import('./route-finder/route-finder.component').then((m) => m.RouteFinderComponent),
  },
  { path: '**', redirectTo: '' },
];
