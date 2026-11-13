# Taxintel
AI for Business

Slimme app voor taxichauffeurs: events op de kaart, A*-route naar een event en AI-voorspelling van drukke plaatsen.

## Structuur

```
frontend/   Angular (Google Maps, kalender, opgeslagen data)
backend/    Python API (FastAPI) - één laag tussen app, AI-model, database en externe API's
database/   MongoDB init (validators + indexen) en SCHEMA.md
```

## Omgeving starten

Vereist: Docker Desktop.

```bash
cp .env.example .env              # wachtwoorden en API-keys invullen
docker compose up --build         # frontend, backend, mongo
docker compose --profile tools up # + mongo-express (DB bekijken)
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:8000 (docs: `/docs`) |
| MongoDB | `mongodb://localhost:27017` |
| mongo-express | http://localhost:8081 |

Zolang `frontend/package.json` of `backend/app/main.py` nog niet bestaan, blijven die containers wachten in plaats van te crashen.
Het Angular-project aanmaken kan vanuit de container:

```bash
docker compose run --rm frontend ng new taxintel --directory . --skip-git
```

De database wordt alleen bij de **eerste** start geïnitialiseerd. Schema gewijzigd? `docker compose down -v` (wist de data) en opnieuw `up`.

## Treindata (iRail) - drukte rond stations

Via de [iRail API](https://docs.irail.be/) (live NMBS-data, gratis, geen API-key) volgt de backend aankomsten en vertrekken
in de stations op. Elke aankomende trein = reizigers die uitstappen = mogelijke taxiklanten. Vertragingen en geschrapte
treinen maken dat nog sterker (gestrande reizigers). Daaruit berekent de backend per station en tijdvenster hoe druk het is.

Wat er in MongoDB komt (details: [`database/SCHEMA.md`](database/SCHEMA.md)):

| Collectie | Inhoud |
|---|---|
| `transitHubs` | Alle Belgische stations met locatie (`source: "irail"`, `externalId` = station-id) |
| `trainMovements` | 1 document per trein per station per richting: gepland/verwacht uur, vertraging, geschrapt, treintype, bezetting, uur en weekdag (features voor het AI-model) |
| `transitDisturbances` | Storingen en geplande werken, gekoppeld aan de stations die erin vernoemd worden |

### Instellen (`.env`)

```env
# Station-ids om op te volgen, komma-gescheiden, zonder spaties. Leeg = ingebouwde lijst (Antwerpen, Brussel, Gent, ...)
IRAIL_STATIONS=BE.NMBS.008821006,BE.NMBS.008821121,BE.NMBS.008821196,BE.NMBS.008821063,BE.NMBS.008821089,BE.NMBS.008894839
# Elke N minuten automatisch de komende 2 uur ophalen (0 = uit)
IRAIL_COLLECT_EVERY_MIN=15
# Optioneel: User-Agent met contactinfo (vraagt iRail)
IRAIL_USER_AGENT=
```

We werken momenteel enkel in **Antwerpen stad**:

| Station-id | Station |
|---|---|
| `BE.NMBS.008821006` | Antwerpen-Centraal |
| `BE.NMBS.008821121` | Antwerpen-Berchem |
| `BE.NMBS.008821196` | Antwerpen-Zuid |
| `BE.NMBS.008821063` | Antwerpen-Luchtbal |
| `BE.NMBS.008821089` | Antwerpen-Noorderdokken |
| `BE.NMBS.008894839` | Antwerpen-Linkeroever |
| `BE.NMBS.008821071` | Ekeren (district, optioneel) |
| `BE.NMBS.008824158` | Hoboken-Polder (district, optioneel) |

Antwerpen-Dam, -Oost en -Haven laten we weg: daar komen (bijna) geen reizigerstreinen. Andere ids opzoeken: `GET /irail/stations`.
Na een wijziging in `.env`: `docker compose up -d backend`.

### Endpoints

Interactieve documentatie (alles uitproberen): http://localhost:8000/docs

| Methode | Endpoint | Wat |
|---|---|---|
| `GET` | `/health` | Backend en database bereikbaar? |
| `GET` | `/irail/crowding` | Drukte per station per tijdvenster (zie hieronder) |
| `GET` | `/irail/movements` | Ruwe treinbewegingen (trainingsdata voor het AI-model) |
| `GET` | `/irail/stations` | Stations met locatie; `?tracked=true` = enkel de opgevolgde stations |
| `GET` | `/irail/disturbances` | Actieve storingen en geplande werken; `?station=<id>` om te filteren |
| `POST` | `/irail/collect` | Nu meteen een ophaalronde draaien; `?hours=1..6` = hoeveel uur vooruit. **Niet via de adresbalk** (dat is een GET → `Method Not Allowed`), wel via `/docs` → *Try it out* of `curl -X POST "http://localhost:8000/irail/collect?hours=1"` |

Parameters van `/irail/crowding` en `/irail/movements`:

Alle parameters zijn optioneel. Laat je er een weg, dan geldt de waarde in de laatste kolom.

| Parameter | Geldige waarden | Als je hem weglaat |
|---|---|---|
| `from` | een tijd (zie hieronder) | crowding: `-1h` (1 uur geleden), movements: geen ondergrens |
| `to` | een tijd (zie hieronder) | crowding: `3h` (binnen 3 uur), movements: geen bovengrens |
| `station` | station-id, bv. `BE.NMBS.008821006` | alle stations |
| `bucket` | minuten per tijdvenster, `5`..`1440` (enkel crowding) | `60` |
| `limit` | max aantal records, `1`..`20000` (enkel movements) | `1000` |

Een tijd (`from`, `to`) schrijf je als:

| Vorm | Voorbeeld | Betekenis |
|---|---|---|
| `now` | `now` | nu |
| relatief | `-1h`, `-30m`, `3h`, `1d` | 1 uur geleden, 30 min geleden, binnen 3 uur, binnen 1 dag (`m`/`h`/`d`; zonder teken = in de toekomst) |
| datum/tijd | `2026-10-30T17:00` | 30 oktober 17:00, Brusselse tijd |
| datum/tijd met tijdzone | `2026-10-30T17:00%2B01:00` | idem; in een URL moet `+` als `%2B` (of laat de tijdzone gewoon weg) |
| datum | `2026-10-30` | 30 oktober 00:00, Brusselse tijd |

Tekst zoals `1 uur geleden` werkt niet en geeft een `422` met uitleg.

Voorbeelden:

```
http://localhost:8000/irail/crowding
http://localhost:8000/irail/crowding?station=BE.NMBS.008821006&bucket=30
http://localhost:8000/irail/crowding?from=-1h&to=3h&station=BE.NMBS.008821006&bucket=60
http://localhost:8000/irail/crowding?from=2026-10-30T17:00&to=2026-10-30T23:00&bucket=15
http://localhost:8000/irail/movements?station=BE.NMBS.008821121&limit=200
http://localhost:8000/irail/stations?tracked=true
```

Een record van `/irail/crowding`:

```json
{
  "stationId": "BE.NMBS.008821006",
  "stationName": "Antwerpen-Centraal",
  "location": { "type": "Point", "coordinates": [4.421101, 51.2172] },
  "bucketStart": "2026-10-30T16:00:00+01:00",
  "bucketEnd": "2026-10-30T17:00:00+01:00",
  "arrivals": 29,
  "departures": 28,
  "longDistanceArrivals": 14,
  "delayedArrivals": 1,
  "canceled": 0,
  "highOccupancyDepartures": 3,
  "mediumOccupancyDepartures": 5,
  "avgDelayS": 42,
  "maxDelayS": 720,
  "disturbances": [],
  "crowdIndex": 41.75,
  "score": 0.443,
  "level": "medium"
}
```

`crowdIndex` is een eenvoudige, uitlegbare formule (aankomsten, extra gewicht voor IC/internationale treinen, vertragingen
van 10 min of meer, schrappingen, bezetting; zie `backend/app/irail/crowding.py`). `score` (0..1) is **relatief** t.o.v.
het drukste venster in hetzelfde resultaat; `level` is `low` / `medium` / `high`. Zolang er weinig historiek is, zijn de
eerste en laatste vensters onvolledig.

### Command line (ophalen en exporteren naar JSON)

```bash
docker compose exec backend python -m app.irail collect --hours 3                  # 1 ophaalronde
docker compose exec backend python -m app.irail export crowding --bucket 30 --out crowding.json
docker compose exec backend python -m app.irail export movements --station BE.NMBS.008821006 --out centraal.json
docker compose exec backend python -m app.irail export stations --out stations.json
docker compose exec backend python -m app.irail export disturbances --out storingen.json
docker compose exec backend python -m app.irail collect --dry-run --out test.json  # zonder database, test van de API
```

`export` kent ook `--from`, `--to` en `--station`, met dezelfde tijden als de API. Gebruik bij een min-teken
een `=`: `--from=-1h --to=3h` (`--from -1h` ziet argparse als een optie). De JSON-bestanden komen in `backend/` (bind mount).
