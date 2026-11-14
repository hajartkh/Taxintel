import { Routes } from '@angular/router';

// Pages are lazy loaded: each one (and Leaflet) only downloads when it is opened.
export const routes: Routes = [
  {
    path: '',
    title: 'TaxIntel · Driver home',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'route-finder',
    title: 'TaxIntel · Route finder',
    loadComponent: () => import('./route-finder/route-finder.component').then((m) => m.RouteFinderComponent),
  },
  { path: '**', redirectTo: '' },
];
