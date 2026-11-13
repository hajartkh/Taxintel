import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import 'leaflet-routing-machine'; // must come after leaflet: it attaches itself to L.Routing

// Default marker icon fix (used by the draggable waypoint markers)
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
});

@Component({
  selector: 'app-route-finder',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './route-finder.component.html',
  styleUrl: './route-finder.component.css', // styleUrls: [...] on Angular < 17
})
export class RouteFinderComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  // ---- bound to the template ----
  info = 'Click the map to set the start (the driver).';
  startDisabled = true;
  speedKmh = 50;
  follow = true;
  pinMode = false;

  get buttonLabel() {
    return this.driving ? 'Pause' : this.tripActive ? 'Resume' : 'Start driving';
  }

  // ---- map objects ----
  private readonly REROUTE_MS = 30000;
  private map!: L.Map;
  private carMarker!: L.Marker;
  private routing!: L.Routing.Control;
  private pins = L.layerGroup();

  // ---- state ----
  private path: L.LatLng[] = [];
  private cum: number[] = [];
  private stops: number[] = [];
  private travelled = 0;
  private seg = 0;
  private tripActive = false;
  private driving = false;
  private rerouting = false;
  private rafId = 0;
  private lastFrame = 0;
  private lastReroute = 0;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement).setView([51.2194, 4.4025], 13); // Antwerp
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    // Driver marker (this IS the first waypoint)
    this.carMarker = L.marker([0, 0], {
      icon: L.divIcon({ className: '', html: '<div class="car">▲</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      zIndexOffset: 1000,
      interactive: false,
    });

    this.routing = L.Routing.control({
      waypoints: [],
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'driving',
      }),
      show: false,
      showAlternatives: false,
      routeWhileDragging: true,
      addWaypoints: false,
      fitSelectedRoutes: false,
      lineOptions: { styles: [{ color: '#2563eb', weight: 6, opacity: 0.85 }] },
      createMarker: (i: number, wp: L.Routing.Waypoint) =>
        i === 0 ? null : L.marker(wp.latLng, { draggable: true }),
    } as any).addTo(this.map);

    this.routing.on('routesfound', (e: L.Routing.RoutingResultEvent) => this.onRoutesFound(e));
    this.routing.on('routingerror', () => {
      this.rerouting = false;
      this.info = 'No route found. Try different points.';
    });

    this.pins.addTo(this.map);

    // TODO: get pins from eventAPI instead of hardcoded
    this.addPin([51.3211, 4.3997], 'AfterHours event');
    this.addPin([51.2211, 4.5997], 'Circe de solei');
    this.addPin([51.0311, 4.2997], 'Event3');
    this.addPin([51.1311, 4.1997], 'Bierfest idk');

    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    this.map?.remove();
  }

  // ---------- Template handlers ----------
  toggleDrive(): void {
    if (this.driving) {
      this.driving = false;
      cancelAnimationFrame(this.rafId);
    } else {
      this.tripActive = true;
      this.driving = true;
      this.lastFrame = this.lastReroute = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  reset(): void {
    this.stopTrip();
    this.setRoute([]);
    this.info = 'Click the map to set the start (the driver).';
  }

  // ---------- Helpers ----------
  private currentPoints(): L.LatLng[] {
    return this.routing.getWaypoints().filter((w) => w.latLng).map((w) => w.latLng);
  }

  private nearestIndex(latlng: L.LatLng, from = 0): number {
    let best = from, bestD = Infinity;
    for (let i = from; i < this.path.length; i++) {
      const d = latlng.distanceTo(this.path[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  private syncCar(): void {
    if (this.tripActive) return;
    const pts = this.currentPoints();
    if (!pts.length) { this.carMarker.remove(); return; }
    this.carMarker.setLatLng(pts[0]).addTo(this.map);
  }

  // Single entry point for changing the route. During a trip, waypoint 0 is
  // always replaced by the driver's live position.
  private setRoute(points: L.LatLng[]): void {
    if (this.tripActive && points.length) points = [this.carMarker.getLatLng(), ...points.slice(1)];
    if (points.length < 2) { this.path = []; this.stops = []; this.startDisabled = true; }
    this.routing.setWaypoints(points);
    this.syncCar();
  }

  private stopTrip(): void {
    this.driving = false;
    this.tripActive = false;
    cancelAnimationFrame(this.rafId);
  }

  private bearing(a: L.LatLng, b: L.LatLng): number {
    const r = Math.PI / 180, dLng = (b.lng - a.lng) * r;
    const y = Math.sin(dLng) * Math.cos(b.lat * r);
    const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) -
              Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLng);
    return (Math.atan2(y, x) / r + 360) % 360;
  }

  private posAt(d: number): { latlng: L.LatLng; heading: number } {
    while (this.seg < this.cum.length - 2 && this.cum[this.seg + 1] < d) this.seg++;
    const a = this.path[this.seg], b = this.path[this.seg + 1];
    const len = this.cum[this.seg + 1] - this.cum[this.seg] || 1;
    const f = Math.min(1, Math.max(0, (d - this.cum[this.seg]) / len));
    return {
      latlng: L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f),
      heading: this.bearing(a, b),
    };
  }

  // ---------- Route found ----------
  private onRoutesFound(e: L.Routing.RoutingResultEvent): void {
    this.rerouting = false;
    this.path = e.routes[0].coordinates as L.LatLng[];
    this.cum = [0];
    for (let i = 1; i < this.path.length; i++) {
      this.cum.push(this.cum[i - 1] + this.path[i - 1].distanceTo(this.path[i]));
    }
    this.seg = 0;
    this.startDisabled = false;

    let from = 0;
    this.stops = this.currentPoints().slice(1, -1).map((p) => {
      from = this.nearestIndex(p, from);
      return this.cum[from];
    });

    if (this.tripActive) {
      this.travelled = this.cum[this.nearestIndex(this.carMarker.getLatLng())];
    } else {
      this.travelled = 0;
      this.map.fitBounds(L.latLngBounds(this.path), { padding: [40, 40] });
      const s = e.routes[0].summary;
      if (s) {
        this.info = `Route: ${(s.totalDistance / 1000).toFixed(2)} km, about ${Math.round(s.totalTime / 60)} min. Press Start driving.`;
      }
    }
  }

  // ---------- Animation loop ----------
  private reroute(t: number): void {
    this.rerouting = true;
    this.lastReroute = t;
    const rest = this.currentPoints().slice(1);
    this.routing.setWaypoints([this.carMarker.getLatLng(), ...rest]);
  }

  private passStop(t: number): void {
    this.stops.shift();
    this.rerouting = true;
    this.lastReroute = t;
    this.routing.setWaypoints([this.carMarker.getLatLng(), ...this.currentPoints().slice(2)]);
  }

  private arrive(): void {
    const dest = this.currentPoints().pop()!;
    this.stopTrip();
    this.setRoute([dest]);
    this.info = 'Arrived. Click the map to pick a new destination.';
  }

  private tick = (t: number): void => {
    const dt = Math.min((t - this.lastFrame) / 1000, 0.25);
    this.lastFrame = t;

    const mps = this.speedKmh / 3.6;
    const total = this.cum[this.cum.length - 1];
    this.travelled += mps * dt;
    if (this.travelled >= total) return this.arrive();

    const { latlng, heading } = this.posAt(this.travelled);
    this.carMarker.setLatLng(latlng);
    const el = this.carMarker.getElement();
    if (el) (el.firstChild as HTMLElement).style.transform = `rotate(${heading}deg)`;
    if (this.follow) this.map.panTo(latlng, { animate: false });

    const left = total - this.travelled;
    this.info = `${(left / 1000).toFixed(2)} km to go, about ${Math.ceil(left / mps / 60)} min`;

    if (this.rerouting && t - this.lastReroute > 10000) this.rerouting = false;

    if (!this.rerouting) {
      if (this.stops.length && this.travelled >= this.stops[0] && this.currentPoints().length > 2) {
        this.passStop(t);
      } else if (t - this.lastReroute > this.REROUTE_MS) {
        this.reroute(t);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  // ---------- Pins ----------
  private addPin(latlng: L.LatLngExpression, label?: string): L.CircleMarker {
    const ll = L.latLng(latlng);
    const marker = L.circleMarker(ll, {
      radius: 8, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2,
    }).addTo(this.pins);

    const popup = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = label || 'Pin';
    popup.append(title, document.createElement('br'));

    const button = (text: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.margin = '4px 4px 0 0';
      b.addEventListener('click', () => { onClick(); marker.closePopup(); });
      popup.append(b);
    };

    button('Drive from here', () => {
      this.stopTrip();
      const pts = this.currentPoints();
      this.setRoute(pts.length > 1 ? [ll, pts[pts.length - 1]] : [ll]);
    });
    button('Drive to here', () => {
      const pts = this.currentPoints();
      this.setRoute(pts.length ? [pts[0], ll] : [ll]);
    });
    button('Add to waypoints', () => this.setRoute([...this.currentPoints(), ll]));
    button('Delete', () => this.pins.removeLayer(marker));

    marker.bindPopup(popup);
    return marker;
  }

  // ---------- Map clicks ----------
  private onMapClick(e: L.LeafletMouseEvent): void {
    if (this.pinMode) {
      this.addPin(e.latlng, `Pin at ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
      return;
    }
    if (this.tripActive) {
      this.setRoute([this.carMarker.getLatLng(), e.latlng]);
      return;
    }
    const pts = this.currentPoints();
    if (pts.length === 1) {
      this.info = 'Calculating route…';
      this.setRoute([pts[0], e.latlng]);
    } else {
      this.info = 'Now click the destination.';
      this.setRoute([e.latlng]);
    }
  }
}