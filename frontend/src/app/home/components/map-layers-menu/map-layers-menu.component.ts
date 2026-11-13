import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MapLayer, MapTheme } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';

/** Filter menu: which layers are shown, and the map style (dark / light). */
@Component({
  selector: 'app-map-layers-menu',
  standalone: true,
  templateUrl: './map-layers-menu.component.html',
  styleUrl: './map-layers-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLayersMenuComponent {
  readonly store = inject(HomeStore);

  readonly layerOptions: ReadonlyArray<{ key: MapLayer; label: string }> = [
    { key: 'heat', label: 'Heatmap' },
    { key: 'events', label: 'Events' },
    { key: 'route', label: 'Recommended route' },
  ];

  readonly themeOptions: ReadonlyArray<{ key: MapTheme; label: string }> = [
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
  ];
}
