import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';

// Pages are lazy loaded: each one (and Leaflet) only downloads when it is opened.
export const routes: Routes = [
  {
    path: '',
    title: 'TaxIntel',
    canActivate: [authGuard],
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'calendar',
    title: 'TaxIntel · Calendar',
    canActivate: [authGuard],
    loadComponent: () => import('./calendar/calendar-page.component').then((m) => m.CalendarPageComponent),
  },
  {
    path: 'settings',
    title: 'TaxIntel · Settings',
    canActivate: [authGuard],
    loadComponent: () => import('./settings/settings-page.component').then((m) => m.SettingsPageComponent),
  },
  {
    path: 'route-finder',
    title: 'TaxIntel · Route finder',
    canActivate: [authGuard],
    loadComponent: () => import('./route-finder/route-finder.component').then((m) => m.RouteFinderComponent),
  },
  {
    path: 'login',
    title: 'TaxIntel · Sign in',
    // Already signed in? Go to the home page.
    canActivate: [() => !inject(AuthService).signedIn() || inject(Router).createUrlTree(['/'])],
    loadComponent: () => import('./login/login-page.component').then((m) => m.LoginPageComponent),
  },
  { path: '**', redirectTo: '' },
];
