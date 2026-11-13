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
| `/` | `home/home.component` | Homepagina chauffeur: heatmap van drukke zones, locatie chauffeur, aanbevolen route, stadskalender (weekstrook). Via de filterknop: lagen aan/uit en kaartstijl (donker of licht). `?event=<id>` focust een evenement |
| `/calendar` | `calendar/calendar-page.component` | Maandkalender met stadsevenementen en eigen agendapunten (toevoegen/verwijderen). `?date=2026-11-13` opent op die dag. Bereikbaar via de titel "City calendar" |
| `/settings` | `settings/settings-page.component` | Profiel, taal, kaartstijl, afmelden |
| `/login` | `login/login-page.component` | Na afmelden (dummy-aanmelding) |
| `/route-finder` | `route-finder/route-finder.component` | Eerste routeplanner (prototype uit `main.html`) |

De pagina's worden lazy geladen (`app.routes.ts`): Leaflet wordt pas gedownload als een kaartpagina opent.
Alle pagina's behalve `/login` zitten achter `authGuard` (afgemeld → `/login`).

In de top bar: de **bel** opent de meldingen (klik op een melding = gelezen, het gele bolletje verdwijnt; "Mark all as
read" voor alles), het **accounticoon** opent naam, instellingen, taal (EN/NL/FR) en afmelden.

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
    │   ├── top-bar/            header + meldingenpaneel + accountmenu
    │   ├── i18n/               vertalingen (translations/en|nl|fr.ts), I18nService, `t`-pipe
    │   ├── settings/           SettingsService: taal en kaartstijl (localStorage)
    │   ├── auth/               AuthService (dummy) + authGuard
    │   ├── notifications/      NotificationService (dummy meldingen)
    │   ├── agenda/             AgendaService: eigen agendapunten (localStorage)
    │   ├── city-data/          CityDataService + modellen + dummy events/drukke zones
    │   ├── clock.service.ts    huidige tijd als signal
    │   └── driver.service.ts   ingelogde chauffeur (dummy)
    ├── shared/
    │   ├── leaflet/            Leaflet + plugins laden (zie "Leaflet-plugins")
    │   └── utils/              tijd, geo en wiskunde-hulpfuncties
    ├── events/events.service.ts  GET /api/events
    ├── route-finder/           routeplanner-prototype
    ├── calendar/               maandkalender (month-grid, agenda-form)
    ├── settings/               instellingenpagina
    ├── login/                  aanmeldpagina
    └── home/                   homepagina chauffeur
        ├── home.component.*    pagina-layout (begroeting, kaart, zijpaneel)
        ├── home.config.ts      instellingen (OSRM-url, startpositie, …)
        ├── models/             TypeScript-interfaces
        ├── logic/              vraagmodel en heatmap-punten (pure functies, getest)
        ├── state/home.store.ts toestand van de pagina (signals): gekozen dag, weekstrook, voorspelling, lagen
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
- **Kaartstijl**: de tegels per stijl staan bovenaan `demand-map.component.ts`.
- **Weekstrook** (stadskalender op de homepagina): standaard vandaag + de 6 volgende dagen. De pijl naar rechts toont
  de volgende weken, telkens van maandag tot zondag; terug kan tot de week van vandaag (logica: `HomeStore.shiftWeek`).
- **Opgeslagen per toestel** (`localStorage`): `taxintel.language`, `taxintel.mapTheme`, `taxintel.agenda`,
  `taxintel.signedIn`. Gaat later naar de backend.
- **Lettertype**: Manrope via `@fontsource/manrope` (zelf gehost, geen verzoek naar Google Fonts).

### Teksten en talen (EN / NL / FR)

Elke tekst staat als sleutel in `core/i18n/translations/en.ts`, met dezelfde sleutel in `nl.ts` en `fr.ts`
(ontbreekt er een, dan geeft TypeScript een fout). Datums volgen de taal (`en-GB`, `nl-BE`, `fr-BE`), net als de
route-instructies van OSRM.

```html
{{ 'cal.title' | t }}
{{ 'route.basis' | t: { day: 'Today', time: '22:00' } }}
```
```ts
readonly label = computed(() => this.i18n.t('toast.noEventsAt', { place }));  // in een computed: volgt de taal
```

Services die een tekst doorgeven (toasts, status) geven een `Translatable` (`{ key, params }`) door in plaats van een
string; de template vertaalt die pas bij het tonen, zodat hij meeverandert met de taal.

### Leaflet-plugins

`leaflet-routing-machine` en `leaflet.heat` zijn oudere scripts die een globale `L` verwachten. Importeer ze daarom
nooit rechtstreeks, maar altijd via `shared/leaflet/leaflet-plugins.ts`, dat Leaflet eerst laadt:

```ts
import * as L from 'leaflet';
import '../shared/leaflet/leaflet-plugins'; // L.Routing en L.heatLayer
```

## Van dummy data naar echte data

Alle dummy data zit in de services hieronder. De componenten hoeven niet te veranderen als je overschakelt.

| Bestand | Nu | Later |
|---|---|---|
| `core/city-data/city-data.service.ts` | `of(...)` met data uit `mock-city-data.ts` | `HttpClient`-calls naar de backend, gemapt naar de modellen in `core/city-data/city.models.ts` |
| `core/driver.service.ts` | vaste chauffeur "Sam Peeters" | profiel na inloggen |
| `core/auth/auth.service.ts` | aanmelden = vlag in `localStorage` | echte login (token) |
| `core/notifications/notification.service.ts` | vaste lijst meldingen | meldingen van de backend (drukte, iRail-storingen, nieuwe events) |
| `core/agenda/agenda.service.ts` | agendapunten in `localStorage` | agenda-API per chauffeur |

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
