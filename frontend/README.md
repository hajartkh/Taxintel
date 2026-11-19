# Frontend – TaxIntel

Angular 18 (standalone components, signals) met Leaflet voor de kaart.

## Starten

| Wat | Commando | Resultaat |
|---|---|---|
| Lokaal, met hot reload | `npm install` en daarna `npm start` | http://localhost:4200 – `/api` gaat via `proxy.conf.json` naar de backend op `localhost:8000` |
| Via Docker | `docker compose up frontend` (vanuit de hoofdmap) | http://localhost:4200 |
| Productie-build | `npm run build` | `dist/frontend/browser/` |
| Unit tests | `npm test` (Karma + Jasmine, Chrome nodig) | |

## Pagina's

| Route | Component | Wat |
|---|---|---|
| `/` | `home/home.component` | Homepagina chauffeur: heatmap van drukke zones, locatie chauffeur, aanbevolen route, stadskalender. Via de filterknop: lagen aan/uit en kaartstijl (donker of licht) |
| `/calendar` | `calendar/calendar-page.component` | Maandkalender: stadsevents + eigen agendapunten (toevoegen/verwijderen). Te openen via de titel "City calendar" op de homepagina |
| `/settings` | `settings/settings.component` | Instellingen: profiel en taal. Via het accountmenu |
| `/signed-out` | `signed-out/signed-out.component` | Na "Afmelden" (placeholder tot er een echte login is) |
| `/route-finder` | `route-finder/route-finder.component` | Eerste routeplanner (prototype uit `main.html`) |

De pagina's worden lazy geladen (`app.routes.ts`): Leaflet wordt pas gedownload als een kaartpagina opent.

## Mappenstructuur

```
src/
├── index.html
├── styles.css                  globale stijlen: importeert enkel wat hieronder staat
├── styles/
│   ├── theme.css               kleuren (--tx-*), lettertype, basis-elementen
│   ├── utilities.css           gedeelde klassen: .label, .glass, .icon-btn, .badge
│   └── map.css                 Leaflet-thema + kaartmarkers (scoped op .tx-map)
└── app/
    ├── app.component.*         app-shell: top bar + <router-outlet>
    ├── app.routes.ts           routes (lazy loaded)
    ├── app.config.ts           providers (router, HttpClient)
    ├── core/                   app-breed, één instantie
    │   ├── top-bar/            header (logo, klok) + dropdowns meldingen en accountmenu
    │   ├── i18n/               taal (EN/NL/FR): I18nService + translations.ts
    │   ├── notifications/      meldingen van de chauffeur (dummy)
    │   ├── clock.service.ts    huidige tijd als signal
    │   └── driver.service.ts   ingelogde chauffeur (dummy) + aan/afmelden
    ├── shared/
    │   ├── leaflet/            Leaflet + plugins laden (zie "Leaflet-plugins")
    │   └── utils/              tijd, geo en wiskunde-hulpfuncties
    ├── events/events.service.ts  GET /api/events
    ├── calendar/               maandkalender + eigen agenda (AgendaService, localStorage)
    ├── settings/               instellingenpagina
    ├── signed-out/             pagina na afmelden
    ├── route-finder/           routeplanner-prototype
    └── home/                   homepagina chauffeur
        ├── home.component.*    pagina-layout (begroeting, kaart, zijpaneel)
        ├── home.config.ts      instellingen (OSRM-url, startpositie, …)
        ├── models/             TypeScript-interfaces
        ├── data/               CityDataService + dummy data
        ├── logic/              vraagmodel en heatmap-punten (pure functies, getest)
        ├── state/home.store.ts toestand van de pagina (signals)
        ├── services/           routeplanner (OSRM), rit-simulatie, toasts
        └── components/         kaart, overlays op de kaart, kalender, slimme route
```

## Afspraken

- **Componenten**: standalone, `ChangeDetectionStrategy.OnPush`, `input()`/`output()` en signals. Template, CSS en TypeScript in aparte bestanden naast elkaar.
- **CSS**: stijlen van een component staan in `<naam>.component.css` (scoped). Globaal komt enkel in `src/styles/`:
  wat meerdere componenten delen, of wat Leaflet buiten Angular aanmaakt (markers, popups). Gebruik altijd de
  CSS-variabelen uit `theme.css` (`var(--tx-yellow)`, …) in plaats van vaste kleuren. Budget: max. 4 kB per component.
- **Toestand**: de homepagina heeft een eigen `HomeStore`, `TripService` en `ToastService`, aangeboden in
  `providers` van `HomeComponent`. Zo leeft de toestand even lang als de pagina, en componenten lezen ze met `inject()`.
- **Leaflet** draait buiten de Angular-zone (`NgZone.runOutsideAngular`), zodat kaartbewegingen geen change detection
  veroorzaken. De kaart volgt de signals via `effect()`.
- **Kaartstijl**: de keuze van de chauffeur wordt per toestel onthouden in `localStorage` (`taxintel.mapTheme`).
  De tegels per stijl staan bovenaan `demand-map.component.ts`.
- **Lettertype**: Manrope via `@fontsource/manrope` (zelf gehost, geen verzoek naar Google Fonts).

### Vertalingen

De taal kies je in het accountmenu of op `/settings` en wordt per toestel onthouden (`localStorage`, `taxintel.lang`).
Teksten staan in `core/i18n/translations.ts`: Engels is de bron, NL en FR moeten elke sleutel vertalen (TypeScript
controleert dat). In een component:

```ts
readonly t = inject(I18nService).t;      // template: {{ t('cal.title') }} of {{ t('notif.unread', { count: 3 }) }}
formatLongDate(date, i18n.locale())      // datums in de gekozen taal
```

Alles is vertaald: pagina's, kaart (toolbar, lagen, legende, popups, tooltips), prognose, slimme route,
meldingen, toasts, tab-titels (`core/i18n/title.strategy.ts`; de `title` van een route is een vertaalsleutel) en
getallen (`1,6 km` in NL/FR). De afslag-instructies tijdens het rijden komen van OSRM in de gekozen taal; bij een
taalwissel wordt de route opnieuw berekend. Niet vertaald: namen van events en locaties (die komen uit de bronnen).

Tekst die in de toestand blijft staan (statusregel, reden van een hotspot) bewaar je als `Message`
(`{ key, params }`) en vertaal je pas in de template met `i18n.msg(...)`, zodat ze meeverandert met de taal.

### Leaflet-plugins

`leaflet-routing-machine` en `leaflet.heat` zijn oudere scripts die een globale `L` verwachten. Importeer ze daarom
nooit rechtstreeks, maar altijd via `shared/leaflet/leaflet-plugins.ts`, dat Leaflet eerst laadt:

```ts
import * as L from 'leaflet';
import '../shared/leaflet/leaflet-plugins'; // L.Routing en L.heatLayer
```

## Van dummy data naar echte data

Alle dummy data zit op twee plaatsen. De componenten hoeven niet te veranderen als je overschakelt.

| Bestand | Nu | Later |
|---|---|---|
| `home/data/city-data.service.ts` | `of(...)` met data uit `mock-city-data.ts` | `HttpClient`-calls naar de backend, gemapt naar de modellen in `home/models/home.models.ts` |
| `core/driver.service.ts` | vaste chauffeur "Sam Peeters" | profiel na inloggen |
| `core/notifications/notification.service.ts` | vier vaste meldingen (gelezen-status enkel in het geheugen) | meldingen van de backend (zelfde vorm: vertaalsleutel + parameters) |
| `calendar/agenda.service.ts` | eigen agendapunten in `localStorage` (`taxintel.agenda`) | endpoint voor agendapunten per chauffeur |

Koppeling met de databronnen:

| Methode | Endpoint | Bron |
|---|---|---|
| `getEvents()` | `GET /api/events` | UiTdatabank, Ticketmaster, AllEvents |
| `getBusyAreas()` | `GET /irail/crowding` | iRail (later ook De Lijn) |

Het vraagmodel (`home/logic/demand-model.ts`) is een tijdelijke schatting. Vervang het door de voorspellingen
van het AI-model; de heatmap en de aanbevolen route gebruiken enkel de uitkomst (`Hotspot[]`).

## Externe diensten

| Dienst | Gebruikt voor | Opmerking |
|---|---|---|
| Esri World Dark Gray | kaartstijl **donker** (standaard) | geen API-key; valt automatisch terug op OpenStreetMap-tegels met een donkere filter |
| OpenStreetMap standaard | kaartstijl **licht** (water blauw, parken groen, straten wit, gebouwen zichtbaar) en de route finder | valt bij de lichte stijl terug op Esri World Street Map |
| OSRM demo-server (`router.project-osrm.org`) | routes over de straten | enkel voor demo's, niet voor productie; url in `home/home.config.ts` |
