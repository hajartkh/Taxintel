import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslationKey } from '../../../core/i18n/translations/en';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MapTheme, SettingsService } from '../../../core/settings/settings.service';
import { MapLayer } from '../../models/home.models';
import { HomeStore } from '../../state/home.store';

/** Filter menu: which layers are shown, and the map style (dark / light). */
@Component({
  selector: 'app-map-layers-menu',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './map-layers-menu.component.html',
  styleUrl: './map-layers-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLayersMenuComponent {
  readonly store = inject(HomeStore);
  readonly settings = inject(SettingsService);

  readonly layerOptions: ReadonlyArray<{ key: MapLayer; label: TranslationKey }> = [
    { key: 'heat', label: 'layers.heat' },
    { key: 'events', label: 'layers.events' },
    { key: 'route', label: 'layers.route' },
  ];

  readonly themeOptions: ReadonlyArray<{ key: MapTheme; label: TranslationKey }> = [
    { key: 'dark', label: 'theme.dark' },
    { key: 'light', label: 'theme.light' },
  ];
}
