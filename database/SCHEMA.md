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
events, transitHubs ──> hotspotPredictions.factors
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
| `transitHubs` | Stations, luchthavens, haltes | De Lijn / ILine | Could | 2dsphere, `source+externalId` uniek |
| `driverPositions` | Recente GPS-posities | App | Could | 2dsphere, TTL 15 min |
| `apiCache` | Gecachte responses van externe API's | Backend | - | `source+key` uniek, TTL |

## Keuzes

- **Referenties i.p.v. embedden** voor events/locaties in lijsten: een event kan in veel lijsten staan en wordt door de Events API geüpdatet.
- **`factors` in hotspotPredictions**: bewaart *waarom* een plek druk is (welke events, welke hubs), zodat de kaart dat kan tonen.
- **TTL-indexen** ruimen automatisch op: oude voorspellingen, routes, en GPS-posities (AVG: posities niet langer bewaren dan nodig).
- **`validationLevel: moderate`**: bestaande documenten die (nog) niet aan het schema voldoen blokkeren updates niet; nieuwe inserts worden wel gevalideerd. Schema aanpassen kan later met `collMod`.
- **Aparte app-user** (`readWrite` op enkel de `taxintel` database); root wordt alleen door mongo-express gebruikt.
