import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService, TranslationKey } from '../../../core/i18n/i18n.service';
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
  readonly t = inject(I18nService).t;

  readonly layerOptions: ReadonlyArray<{ key: MapLayer; label: TranslationKey }> = [
    { key: 'ai', label: 'layers.ai' },
    { key: 'heat', label: 'layers.heat' },
    { key: 'events', label: 'layers.events' },
    { key: 'route', label: 'layers.route' },
  ];

  readonly themeOptions: ReadonlyArray<{ key: MapTheme; label: TranslationKey }> = [
    { key: 'dark', label: 'layers.dark' },
    { key: 'light', label: 'layers.light' },
  ];
}
