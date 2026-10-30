# TaxIntel - databaseschema (MongoDB)

> **Let op: dit is een eerste voorstel.** De collecties, velden en indexen hieronder zijn een startpunt op basis van de huidige architectuur en het Priority board. Ze worden nog besproken met het team en aangepast zodra de backend, het AI-model en de koppelingen met de externe API's concreet worden.

Voorstel op basis van de architectuur (Kaart, Kalender, Opgeslagen, AI-model, externe API's) en het Priority board.
De validators en indexen staan in [`init/01-schema.js`](init/01-schema.js) en worden bij de eerste start van de container aangemaakt.

Alle locaties zijn **GeoJSON Points** (`{ type: "Point", coordinates: [lng, lat] }`) met een `2dsphere`-index,
zodat de backend `$near` / `$geoWithin` kan doen ("events binnen 5 km van mijn positie").

```
drivers ──< savedLocations
   │  └──< driverLists ──> (events | savedLocations)
   ├──< routes ──> events
   └──< driverPositions
transitHubs (irail) ──< trainMovements      transitDisturbances.stationIds ──> transitHubs
events, transitHubs, trainMovements ──> hotspotPredictions.factors
apiCache  (los, cache van externe API's)
```

| Collectie | Wat | Bron | Board | Belangrijkste indexen |
|---|---|---|---|---|
| `drivers` | Chauffeurs + voorkeuren | App | - | `email` uniek |
| `events` | Events met datum, uur, locatie | Events API / manueel | #4, #6 | `venue.location` 2dsphere, `startsAt`, `source+externalId` uniek |
| `savedLocations` | Bewaarde locaties van een chauffeur | App | Could | `driverId+createdAt`, 2dsphere |
| `driverLists` | Eigen lijsten (events + locaties) | App | Opgeslagen | `driverId+name` uniek |
| `hotspotPredictions` | AI: waar wordt het straks druk (score 0..1 per tijdvenster) | AI-model | #3 | 2dsphere, `window`, TTL op `expiresAt` |
| `routes` | Berekende A*-routes naar een event (GeoJSON LineString) | AI-model | #2 | `driverId+computedAt`, TTL 7 dagen |
| `transitHubs` | Stations, luchthavens, haltes | De Lijn / ILine / iRail | Could | 2dsphere, `source+externalId` uniek |
| `trainMovements` | Aankomsten/vertrekken per station (vertraging, schrapping, bezetting) | iRail liveboards | #3 | `stationId+direction+vehicle+scheduledAt` uniek, `expectedAt`, 2dsphere, TTL 180 dagen |
| `transitDisturbances` | Storingen en geplande werken op het spoor | iRail | #3 | `source+externalId` uniek, `active+stationIds` |
| `driverPositions` | Recente GPS-posities | App | Could | 2dsphere, TTL 15 min |
| `apiCache` | Gecachte responses van externe API's | Backend | - | `source+key` uniek, TTL |

## Keuzes

- **Referenties i.p.v. embedden** voor events/locaties in lijsten: een event kan in veel lijsten staan en wordt door de Events API geüpdatet.
- **`factors` in hotspotPredictions**: bewaart *waarom* een plek druk is (welke events, welke hubs), zodat de kaart dat kan tonen.
- **TTL-indexen** ruimen automatisch op: oude voorspellingen, routes, en GPS-posities (AVG: posities niet langer bewaren dan nodig).
- **`validationLevel: moderate`**: bestaande documenten die (nog) niet aan het schema voldoen blokkeren updates niet; nieuwe inserts worden wel gevalideerd. Schema aanpassen kan later met `collMod`.
- **Aparte app-user** (`readWrite` op enkel de `taxintel` database); root wordt alleen door mongo-express gebruikt.

## iRail (NMBS-treinen) - drukte rond stations

Bron: [iRail API](https://docs.irail.be/) (gratis, geen key, max ~3 requests/s). Code: `backend/app/irail/`.

**Waarom?** Elke aankomende trein = reizigers die uitstappen = mogelijke taxiklanten. Vertragingen en geschrapte treinen
maken dat nog sterker (gestrande reizigers). Daarom bewaren we per station elke trein als apart document in `trainMovements`.

| Veld | Uitleg |
|---|---|
| `stationId`, `stationName`, `location` | Station (`transitHubs.externalId`), met GeoJSON-punt voor `$near` |
| `direction` | `arrival` of `departure` |
| `vehicle`, `vehicleType`, `longDistance` | bv. `IC2037`, `IC`, `true` (IC/internationaal = meer reizigers) |
| `otherStation` | Herkomst (bij aankomst) of bestemming (bij vertrek) |
| `scheduledAt`, `expectedAt`, `delayS` | Geplande tijd, verwachte tijd (incl. vertraging), vertraging in seconden |
| `canceled`, `isExtra`, `passed` | Geschrapt / extra trein (bv. bij grote events) / al aangekomen of vertrokken |
| `occupancy` | `low` / `medium` / `high` / `unknown` - enkel bij vertrekken (iRail geeft dit niet voor aankomsten) |
| `localHour`, `weekday` | Features voor het AI-model (Brusselse tijd, 0 = maandag) |
| `firstSeenAt`, `lastSeenAt` | Elke ophaalronde werkt dezelfde trein bij (laatste vertraging) i.p.v. een nieuw document |

**Drukte** (`GET /irail/crowding`) wordt niet opgeslagen maar berekend uit `trainMovements` (aggregatie per station per
tijdvenster): aantal aankomsten/vertrekken, IC-aankomsten, vertraagde aankomsten (>= 10 min), schrappingen, bezetting,
actieve storingen, en een `crowdIndex` + `score` (0..1, relatief t.o.v. het drukste venster in het resultaat) + `level`.
De formule staat in `backend/app/irail/crowding.py` en is een eerste, uitlegbare baseline voor het AI-model.
Let op: vensters aan de rand van de opgehaalde periode zijn onvolledig zolang er nog geen historiek is.

### Ophalen en exporteren

```bash
# automatisch: IRAIL_COLLECT_EVERY_MIN=15 in .env -> backend haalt elke 15 min de komende 2 uur op
docker compose exec backend python -m app.irail collect --hours 3             # 1 ronde, manueel
docker compose exec backend python -m app.irail export crowding --bucket 30 --out crowding.json
docker compose exec backend python -m app.irail export movements --station BE.NMBS.008821006 --out antwerpen.json
docker compose exec backend python -m app.irail collect --dry-run --out test.json  # zonder database
```

| Endpoint | Wat |
|---|---|
| `GET /irail/crowding?from=&to=&station=&bucket=60` | Drukte per station per venster (standaard: -1u tot +3u) |
| `GET /irail/movements?from=&to=&station=&limit=` | Ruwe treinbewegingen (trainingsdata) |
| `GET /irail/stations?tracked=true` | Stations (alle Belgische, of enkel de opgevolgde) |
| `GET /irail/disturbances?station=` | Actieve storingen / werken |
| `POST /irail/collect?hours=1` | Nu een ophaalronde draaien |

Opgevolgde stations: `IRAIL_STATIONS` in `.env` (komma-gescheiden ids, bv. `BE.NMBS.008821006`), standaard
Antwerpen-Centraal/-Berchem/-Zuid, Mechelen, Brussel-Zuid/-Centraal/-Noord, Brussels Airport, Gent-Sint-Pieters en Leuven.
Ids opzoeken: `GET /irail/stations`.

Bestaande database? De nieuwe collecties en validators komen er pas na `docker compose down -v && docker compose up`
(wist de data; events opnieuw scrapen).
