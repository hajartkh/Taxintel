import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  NgZone,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import '../../../shared/leaflet/leaflet-plugins'; // adds L.heatLayer
import { CityEvent, EventCategory } from '../../../core/city-data/city.models';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MapTheme, SettingsService } from '../../../core/settings/settings.service';
import { formatTime } from '../../../shared/utils/time';
import { HOME_CONFIG } from '../../home.config';
import { DEMAND_LABEL, clusterHotspots, demandLevel, eventSize, peakPickupTime } from '../../logic/demand-model';
import { toHeatPoints } from '../../logic/heat-points';
import { Hotspot, MapFocus, PlannedRoute } from '../../models/home.models';
import { ToastService } from '../../services/toast.service';
import { TripFrame, TripService } from '../../services/trip.service';
import { HomeStore } from '../../state/home.store';
import { DriveControlsComponent } from '../drive-controls/drive-controls.component';
import { ForecastCardComponent } from '../forecast-card/forecast-card.component';
import { MapLegendComponent } from '../map-legend/map-legend.component';
import { MapToolbarComponent } from '../map-toolbar/map-toolbar.component';
import { NavBannerComponent } from '../nav-banner/nav-banner.component';
import { ToastComponent } from '../toast/toast.component';

// Basemaps (no API keys needed), each with a fallback if its tiles cannot be loaded:
//   dark  (default): Esri Dark Gray + street names  → fallback: OpenStreetMap darkened with a CSS filter
//   light:           OpenStreetMap standard (blue water, green parks, white streets, buildings)
//                    → fallback: Esri World Street Map
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_ATTRIBUTION = 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

/** Route line per theme: a soft glow on dark maps, a black casing for contrast on light maps. */
const ROUTE_CASING: Record<MapTheme, L.PolylineOptions> = {
  dark: { color: '#ffd400', weight: 16, opacity: 0.16 },
  light: { color: '#111111', weight: 10, opacity: 0.85 },
};

const HEAT_GRADIENT = { 0.1: '#4a3a00', 0.3: '#ffd400', 0.5: '#ffa800', 0.7: '#ff6a00', 0.9: '#ff2a2a' };

const CATEGORY_ICON: Record<EventCategory, string> = {
  concert: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  sports: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 5h-5L8 10Z"/>',
  culture: '<path d="M3 9a3 3 0 0 0 0 6v4h18v-4a3 3 0 0 0 0-6V5H3Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  nightlife: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  fair: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
};

/**
 * Leaflet map with the demand heatmap, events, the recommended route and the driver.
 * Leaflet runs outside the Angular zone; the map follows the store and trip signals through effects.
 */
@Component({
  selector: 'app-demand-map',
  standalone: true,
  imports: [MapToolbarComponent, ForecastCardComponent, NavBannerComponent, MapLegendComponent, DriveControlsComponent, ToastComponent],
  templateUrl: './demand-map.component.html',
  styleUrl: './demand-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fullscreen]': 'fullscreen()',
    '(document:fullscreenchange)': 'onFullscreenChange()',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class DemandMapComponent implements AfterViewInit {
  private readonly store = inject(HomeStore);
  private readonly settings = inject(SettingsService);
  private readonly i18n = inject(I18nService);
  private readonly trip = inject(TripService);
  private readonly toast = inject(ToastService);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly toolbar = viewChild.required(MapToolbarComponent);

  readonly fullscreen = signal(false);

  private map!: L.Map;
  private heat!: L.HeatLayer;
  private car!: L.Marker;
  private surge!: L.Marker;
  private routeGlow!: L.Polyline;
  private routeLine!: L.Polyline;
  private readonly areaLabels = L.layerGroup();
  private readonly eventLayer = L.layerGroup();
  private readonly routeLayer = L.layerGroup();
  private readonly stopLayer = L.layerGroup();
  private readonly eventMarkers = new Map<number, L.Marker>();
  private baseLayers: L.TileLayer[] = [];
  private hasFitted = false;
  private forecastWasOpen = false;

  ngAfterViewInit(): void {
    // Outside the zone: Leaflet's many DOM events must not trigger change detection.
    this.zone.runOutsideAngular(() => this.createMap());
    this.bindState();
    this.destroyRef.onDestroy(() => this.map.remove());
  }

  // ---------- Toolbar actions ----------
  locate(): void {
    this.map.flyTo(this.trip.currentPosition(), 15, { duration: 0.6 });
  }

  search(query: string): void {
    const q = query.toLowerCase();
    const places = this.store.places();
    const place = places.find((p) => p.name.toLowerCase() === q) ?? places.find((p) => p.name.toLowerCase().includes(q));
    if (!place) {
      this.toast.show('toast.noMatch');
      return;
    }
    this.toolbar().closeSearch();
    this.map.flyTo([place.lat, place.lng], 15, { duration: 0.8 });
    if (place.venueId) {
      const ev = this.store.dayEvents().find((e) => e.venue.id === place.venueId);
      if (ev) setTimeout(() => this.eventMarkers.get(ev.id)?.openPopup(), 850);
      else this.toast.show({ key: 'toast.noEventsAt', params: { place: place.name } });
    }
  }

  toggleFullscreen(): void {
    if (this.document.fullscreenElement) {
      void this.document.exitFullscreen();
    } else if (this.fullscreen()) {
      this.setFullscreen(false); // CSS-only mode (e.g. iPhone, no Fullscreen API)
    } else {
      this.setFullscreen(true);
      this.host.nativeElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  onFullscreenChange(): void {
    if (!this.document.fullscreenElement && this.fullscreen()) this.setFullscreen(false);
  }

  onEscape(): void {
    if (this.fullscreen() && !this.document.fullscreenElement) this.setFullscreen(false);
  }

  private setFullscreen(on: boolean): void {
    this.fullscreen.set(on);
    setTimeout(() => this.map.invalidateSize(), 60);
  }

  // ---------- Setup ----------
  private createMap(): void {
    const { mapCenter, mapZoom } = HOME_CONFIG;
    const map = (this.map = L.map(this.mapEl().nativeElement, { zoomControl: false }).setView(mapCenter, mapZoom));
    map.createPane('streetNames').style.zIndex = '420'; // street names above the heatmap
    map.createPane('labelPane').style.zIndex = '440';
    map.createPane('routePane').style.zIndex = '450';
    map.createPane('stopPane').style.zIndex = '650'; // numbered stops above event pins
    map.getPane('streetNames')!.style.pointerEvents = 'none';
    map.getPane('labelPane')!.style.pointerEvents = 'none';

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    this.heat = L.heatLayer([], { radius: 36, blur: 28, maxZoom: 14, max: 1, minOpacity: 0.04, gradient: HEAT_GRADIENT }).addTo(map);
    this.surge = L.marker(mapCenter, { pane: 'labelPane', interactive: false });

    this.routeGlow = L.polyline([], { pane: 'routePane', ...ROUTE_CASING.dark, interactive: false });
    this.routeLine = L.polyline([], { pane: 'routePane', color: '#ffd400', weight: 5, opacity: 0.95, lineJoin: 'round', interactive: false });
    this.routeLayer.addLayer(this.routeGlow).addLayer(this.routeLine).addLayer(this.stopLayer).addTo(map);
    this.eventLayer.addTo(map);
    this.areaLabels.addTo(map);

    this.car = L.marker(this.trip.driverPosition(), {
      icon: L.divIcon({
        className: '',
        html: `<div class="tx-driver"><span class="tx-driver-pulse"></span><div class="tx-driver-dot">
                 <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#000"/></svg>
               </div></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      zIndexOffset: 1000,
      interactive: false,
    }).addTo(map);

    map.on('zoomend', () => this.scaleHeat());
    this.scaleHeat();

    // Click the map = simulated GPS: move the driver there.
    map.on('click', (e: L.LeafletMouseEvent) => this.zone.run(() => this.trip.moveDriver(e.latlng)));

    // Slide the forecast away while an event popup is open, then bring it back.
    // Deferred: a popup can also close while an effect redraws the markers, and effects may not write signals.
    map.on('popupopen', () =>
      queueMicrotask(() =>
        this.zone.run(() => {
          this.forecastWasOpen = this.store.forecastOpen();
          this.store.forecastOpen.set(false);
        }),
      ),
    );
    map.on('popupclose', () =>
      queueMicrotask(() =>
        this.zone.run(() => {
          if (this.forecastWasOpen) this.store.forecastOpen.set(true);
          this.forecastWasOpen = false;
        }),
      ),
    );
  }

  /** Swap the base map for the chosen theme. */
  private applyTheme(theme: MapTheme): void {
    const el = this.mapEl().nativeElement;
    el.classList.toggle('theme-light', theme === 'light');
    el.classList.remove('osm-dark');
    this.routeGlow.setStyle(ROUTE_CASING[theme]);

    const esriOptions = { maxZoom: 19, maxNativeZoom: 16 };
    if (theme === 'dark') {
      this.setBaseLayers(
        [
          L.tileLayer(`${ESRI}Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { ...esriOptions, attribution: ESRI_ATTRIBUTION }),
          L.tileLayer(`${ESRI}Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { ...esriOptions, pane: 'streetNames', opacity: 0.8 }),
        ],
        () => {
          el.classList.add('osm-dark');
          return [L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION })];
        },
      );
    } else {
      this.setBaseLayers([L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION })], () => [
        L.tileLayer(`${ESRI}World_Street_Map/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: ESRI_ATTRIBUTION }),
      ]);
    }
  }

  /** Show `layers`; when the first of them fails before any tile loaded, switch to `fallback()`. */
  private setBaseLayers(layers: L.TileLayer[], fallback?: () => L.TileLayer[]): void {
    for (const layer of this.baseLayers) layer.remove();
    this.baseLayers = layers;
    layers.forEach((layer) => layer.addTo(this.map));
    if (!fallback) return;

    let loaded = false;
    let errors = 0;
    layers[0].on('tileload', () => (loaded = true));
    layers[0].on('tileerror', () => {
      if (!loaded && ++errors === 4 && this.baseLayers === layers) this.setBaseLayers(fallback());
    });
  }

  /** Re-render the map layers whenever the signals they depend on change. */
  private bindState(): void {
    const injector = this.injector;
    effect(() => this.applyTheme(this.settings.mapTheme()), { injector });
    effect(() => this.renderHeat(this.store.hotspots(), this.store.layers().heat), { injector });
    effect(() => this.renderEvents(this.store.dayEvents(), this.store.layers().events), { injector });
    effect(() => this.renderRoute(this.trip.route(), this.store.layers().route), { injector });
    effect(() => this.renderDriver(this.trip.driverPosition()), { injector });

    this.trip.frames$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((frame) => this.onFrame(frame));
    this.store.focus$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((focus) => this.focus(focus));
  }

  // ---------- Rendering ----------
  /** Zoomed in, the scattered points overlap less: lower the ceiling so hotspots keep their colour. */
  private scaleHeat(): void {
    const z = this.map.getZoom();
    this.heat.setOptions({ max: Math.min(1.6, Math.max(0.2, 0.6 ** (z - 13))), radius: z >= 15 ? 46 : 36, blur: z >= 15 ? 34 : 28 });
  }

  private renderHeat(hotspots: Hotspot[], visible: boolean): void {
    this.heat.setLatLngs(visible ? toHeatPoints(hotspots) : []);

    this.areaLabels.clearLayers();
    if (visible) {
      for (const area of this.store.busyAreas()) {
        L.marker([area.lat, area.lng], {
          pane: 'labelPane',
          interactive: false,
          icon: L.divIcon({ className: '', html: `<span class="tx-area-label">${escapeHtml(area.name.toUpperCase())}</span>`, iconSize: [0, 0] }),
        }).addTo(this.areaLabels);
      }
    }

    // Surge badge on the busiest place
    const top = clusterHotspots(hotspots)[0];
    if (visible && top && top.intensity >= 0.75) {
      const multiplier = (1 + Math.min(top.intensity, 1.6) * 0.9).toFixed(1);
      this.surge
        .setLatLng([top.lat, top.lng])
        .setIcon(L.divIcon({ className: '', html: `<span class="tx-surge">${escapeHtml(this.i18n.t('map.surge', { x: multiplier }))}</span>`, iconSize: [0, 0], iconAnchor: [0, 26] }))
        .addTo(this.map);
    } else {
      this.surge.remove();
    }
  }

  private renderEvents(events: CityEvent[], visible: boolean): void {
    this.eventLayer.clearLayers();
    this.eventMarkers.clear();
    if (visible) this.eventLayer.addTo(this.map);
    else this.eventLayer.remove();

    // One pin per venue: the biggest event of the day
    const byVenue = new Map<string, CityEvent[]>();
    for (const ev of events) byVenue.set(ev.venue.id, [...(byVenue.get(ev.venue.id) ?? []), ev]);

    for (const venueEvents of byVenue.values()) {
      const main = [...venueEvents].sort((a, b) => b.attendance - a.attendance)[0];
      const hot = demandLevel(eventSize(main)) === 'high';
      const marker = L.marker([main.venue.lat, main.venue.lng], {
        title: main.name,
        icon: L.divIcon({
          className: '',
          html: `<div class="tx-event-pin${hot ? ' hot' : ''}">${categoryIcon(main.category)}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -16],
        }),
      })
        .bindPopup(() => this.eventPopup(main), { autoPanPaddingTopLeft: [20, 70], autoPanPaddingBottomRight: [20, 20] })
        .addTo(this.eventLayer);
      for (const ev of venueEvents) this.eventMarkers.set(ev.id, marker);
    }
  }

  private renderRoute(route: PlannedRoute | null, visible: boolean): void {
    if (visible) this.routeLayer.addTo(this.map);
    else this.routeLayer.remove();

    const remaining = untracked(() => this.trip.remainingPath());
    this.routeGlow.setLatLngs(remaining);
    this.routeLine.setLatLngs(remaining);

    this.stopLayer.clearLayers();
    route?.stops.forEach((stop, i) => {
      L.marker([stop.lat, stop.lng], {
        pane: 'stopPane',
        title: stop.name,
        icon: L.divIcon({ className: '', html: `<div class="tx-stop-pin${stop.done ? ' done' : ''}">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      })
        .bindTooltip(`${escapeHtml(stop.name)} — ${escapeHtml(this.i18n.t(stop.reason))}`, { direction: 'top', offset: [0, -12] })
        .addTo(this.stopLayer);
    });

    // Show the whole recommendation once, together with the other busy places
    if (route && route.path.length > 1 && visible && !this.hasFitted && !untracked(this.trip.active)) {
      this.hasFitted = true;
      const busy = clusterHotspots(untracked(this.store.hotspots))
        .filter((c) => c.intensity >= 0.3)
        .map((c) => L.latLng(c.lat, c.lng));
      this.map.fitBounds(L.latLngBounds([...route.path, ...busy]), {
        paddingTopLeft: [40, 140],
        paddingBottomRight: [40, 90],
        maxZoom: 15,
      });
    }
  }

  private renderDriver(position: L.LatLng): void {
    this.car.setLatLng(position);
    if (!untracked(this.trip.active)) this.setHeading(0);
  }

  /** Called on every animation frame while driving (outside the Angular zone). */
  private onFrame(frame: TripFrame): void {
    this.car.setLatLng(frame.position);
    this.setHeading(frame.heading);
    if (this.trip.follow()) this.map.panTo(frame.position, { animate: false });
    if (frame.remaining) {
      this.routeGlow.setLatLngs(frame.remaining);
      this.routeLine.setLatLngs(frame.remaining);
    }
  }

  private setHeading(degrees: number): void {
    const dot = this.car.getElement()?.querySelector<HTMLElement>('.tx-driver-dot');
    if (dot) dot.style.transform = `rotate(${degrees}deg)`;
  }

  private focus(focus: MapFocus): void {
    if (!(this.trip.active() && this.trip.follow())) this.map.flyTo([focus.lat, focus.lng], 15, { duration: 0.8 });
    if (focus.openPopup && focus.eventId != null && this.store.layers().events) {
      const id = focus.eventId;
      setTimeout(() => this.eventMarkers.get(id)?.openPopup(), 850); // after the fly animation and the re-render
    }
  }

  /** Popup content, built with DOM APIs (no HTML strings with event data). */
  private eventPopup(ev: CityEvent): HTMLElement {
    const level = demandLevel(eventSize(ev));
    const peak = peakPickupTime(ev);
    const el = (tag: string, className: string, text = ''): HTMLElement => {
      const node = this.document.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    const row = (label: string, value: HTMLElement): HTMLElement => {
      const r = el('div', 'tx-popup-row');
      r.append(el('span', 'tx-popup-sub', label), value);
      return r;
    };

    const root = el('div', 'tx-popup');
    const button = el('button', 'tx-popup-btn', this.i18n.t('popup.showForecast', { time: formatTime(peak) })) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', () => {
      this.zone.run(() => this.store.focusEvent(ev, false));
      this.map.closePopup();
    });
    root.append(
      el('div', 'tx-popup-title', ev.name),
      el('div', 'tx-popup-sub', `${ev.venue.name} · ${this.i18n.relativeDay(ev.start)} ${formatTime(ev.start)}–${formatTime(ev.end)}`),
      row(this.i18n.t('popup.visitors'), el('b', '', `~${(ev.attendance / 1000).toFixed(1)}k`)),
      row(this.i18n.t('popup.peak'), el('b', '', formatTime(peak))),
      row(this.i18n.t('popup.demand'), el('span', `badge ${level}`, this.i18n.t(DEMAND_LABEL[level]))),
      button,
    );
    return root;
  }
}

function categoryIcon(category: EventCategory): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICON[category]}</svg>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
