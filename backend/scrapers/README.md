# Event-scrapers voor Taxintel (Antwerpen)

Haalt events op uit meerdere bronnen, maakt de data schoon, ontdubbelt ze en zet ze in de MongoDB-collectie `events`
(zodat de kaart, de kalender en het hotspot-model ermee kunnen werken).

| Bron | Hoe | Opmerking |
|---|---|---|
| UiTinVlaanderen | scraper (`uit_scraper.py`) | respecteert `robots.txt`, 2 s pauze tussen pagina's |
| allevents.in | dezelfde lijst-aanroep als de "View More"-knop (`fetch_sources.py`) | interne endpoint, geen officiele API; gebruiksvoorwaarden niet gelezen |
| Ticketmaster | Discovery API v2 (`fetch_sources.py`) | heeft een eigen gratis API-sleutel nodig |
| Eventbrite | **niet gebruikt** | de zoek-API bestaat niet meer; het overzicht gaf vooral workshops en netwerkavonden |

Dit is een schoolproject: de code is niet bedoeld voor productie.

## Snel starten

Je hebt nodig: Docker Desktop (moet **openstaan**), Python 3.10+ en de repo.

### 1. Database starten
```
copy .env.example .env          # open .env en vul MONGO_ROOT_PASSWORD en MONGO_APP_PASSWORD in (alleen letters/cijfers)
docker compose up -d mongo      # wacht tot `docker compose ps` "healthy" toont
```

### 2. Schema bijwerken (eenmalig)
De validator van `events` laat standaard alleen `events_api` en `manual` toe als `source`. Voer de migratie uit
(PowerShell, vervang het wachtwoord door `MONGO_ROOT_PASSWORD` uit je `.env`):
```
Get-Content database\migrations\02-event-sources.js | docker compose exec -T mongo mongosh -u root -p JOUW_ROOT_WACHTWOORD --authenticationDatabase admin taxintel --quiet
```
Je ziet `events.source toegestaan: [...]` met `uitinvlaanderen`, `allevents`, `ticketmaster`, `eventbrite`.
(Bash/macOS/Linux: vervang `Get-Content ... |` door `... < database/migrations/02-event-sources.js`.)
Als het team de vier waarden in `database/init/01-schema.js` zet, is deze stap voor nieuwe databases niet meer nodig.

### 3. Data laden - kies een route

**Route A: dezelfde data als de rest, zonder sleutels.** In `backend/scrapers/seed/` staat een momentopname.
```
cd backend\scrapers
pip install tzdata pymongo
python load_mongo.py --input seed/events_seed.json
```
Let op: de seed is van de dag dat hij gemaakt is en veroudert snel (voorbije events blijven erin staan).

**Route B: zelf vers ophalen.** Maak een gratis account op developer.ticketmaster.com en zet je sleutel in `.env`:
```
TICKETMASTER_KEY=jouw_sleutel
```
```
cd backend\scrapers
pip install tzdata pymongo
python run_all.py --eenmalig
```
Reken op 10 tot 20 minuten (UiT en het opzoeken van adressen zijn traag). De voortgang staat in `data/run.log`.

### 4. Controleren
```
python -c "import load_mongo as l; from pymongo import MongoClient; db=MongoClient(l.mongo_uri()).get_default_database(default='taxintel'); print('totaal:', db.events.count_documents({})); print(list(db.events.aggregate([{'$group':{'_id':'$source','n':{'$sum':1}}}])))"
```
Of grafisch: `docker compose --profile tools up -d` en open `http://localhost:8081` (mongo-express), of MongoDB Compass met
`mongodb://taxintel_app:WACHTWOORD@localhost:27017/taxintel?authSource=taxintel`.

## Blijven ophalen
```
python run_all.py                 # lus: Ticketmaster elke 6 u, allevents elke 12 u, UiT elke 24 u
python run_all.py --ronde         # eenmaal controleren wat aan de beurt is (voor de Windows-taakplanner)
python run_all.py --status        # wat is wanneer voor het laatst gelopen
python run_all.py --droog         # test: niets ophalen, pipeline + load --dry-run
```
Een mislukte bron stopt de rest niet; dan geldt het vorige ruwe bestand in `data/`. Er draait nooit twee rondes tegelijk
(`data/run.lock`). Als taak plannen in Windows (draait alleen als de pc aanstaat), pas de paden aan:
```
schtasks /Create /SC HOURLY /TN "TaxintelEvents" /TR "cmd /c cd /d \"C:\pad\naar\Taxintel\backend\scrapers\" && \"C:\pad\naar\python.exe\" run_all.py --ronde"
```
Een permanente oplossing zou een server of een Docker-service zijn; die is niet toegevoegd.

## Bestanden
```
run_all.py            alles in een keer: ophalen -> opschonen -> laden (eenmalig of als lus)
fetch_sources.py      ruwe data ophalen (ticketmaster | allevents | eventbrite) -> data/raw_<bron>.json
uit_scraper.py        UiT-events scrapen        uit_geocode.py   UiT-adressen omzetten naar coordinaten (Geopunt)
events_pipeline.py    normaliseren + opschonen + ontdubbelen -> events_clean.json (+ events_rejected.json, dedupe_report.csv)
load_mongo.py         events_clean.json of seed -> MongoDB (upsert, geen dubbels)
../../database/migrations/02-event-sources.js   migratie van de `source`-waarden
seed/events_seed.json momentopname om zonder sleutels mee te starten
tests/test_pipeline.py  rooktest met nagemaakte Ticketmaster/Eventbrite-antwoorden (python tests/test_pipeline.py)
```
`.env`-variabelen: `TICKETMASTER_KEY` (route B) en `MONGO_APP_USER`, `MONGO_APP_PASSWORD`, `MONGO_DB` (of `MONGO_URI`).
De scripts lezen sleutels zelf uit `.env` en tonen of loggen ze nooit.

## Wat de pipeline doet met de data
* **Opschonen:** HTML-entiteiten, emoji en dubbele spaties weg; "uitverkocht"/"laatste tickets" uit de titel naar `flags`;
  adressen genormaliseerd; tijden naar UTC opgeslagen (UiT is lokale tijd; de tijdstempels van allevents zijn lokale tijd
  die als UTC is opgeslagen en worden daarvoor gecorrigeerd); looptijden langer dan 7 dagen (reeksen) krijgen `flags: ["series"]`
  zonder `endsAt`; categorie naar een vaste lijst (`concert`, `theater`, `beurs`, `festival`, `uitgaan`, `sport`, ... en
  `kamp`/`cursus`/`rondleiding` voor kleine activiteiten die je voor hotspots wilt wegfilteren).
* **Locatie:** coordinaten van de bron (GeoJSON `[lng, lat]`); het "stadscentrum"-coordinaat van allevents wordt vervangen via
  bekende venues; foute venue-coordinaten worden rechtgezet; UiT-adressen via Geopunt. Events zonder bruikbare locatie, geannuleerde,
  online, voorbije en events buiten de regio gaan naar `events_rejected.json` met reden.
* **Ontdubbelen** (ook binnen een bron): zelfde start (+-3 u, of zelfde dag als een bron geen uur kent) + vergelijkbare titel + zelfde
  venue (naam of binnen 250 m) = een event. Twijfelgevallen worden **niet** samengevoegd maar gemarkeerd (`dedupe.possibleDuplicates`).
* **Meest volledige rij:** per veld de beste waarde uit alle bronnen (Ticketmaster > UiT > Eventbrite > allevents): starttijd van een bron die
  echt een uur kent, einde, adres met postcode, url, prijs, organisator, categorie. `dedupe.fieldSources` zegt waar elk veld vandaan komt,
  `sources[]` bewaart alle bronrecords, `dedupe.otherStartTimes` toont afwijkende starttijden.

Extra velden bovenop het schema (toegestaan door de validator): `sources`, `dedupe`, `flags`, `price`, `organizer`, `venue.district`.
`expectedAttendance` blijft leeg: geen enkele bron geeft capaciteit of opkomst.

## Veelvoorkomende problemen
| Melding | Oplossing |
|---|---|
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop is niet gestart |
| `Authentication failed` bij root/app-login | het wachtwoord is maar een keer ingesteld bij de eerste start; `docker compose down -v` wist de database en maakt hem opnieuw met de wachtwoorden uit `.env` |
| `The '<' operator is reserved` (PowerShell) | gebruik `Get-Content bestand \| docker compose exec -T ...` |
| `Document failed validation` | migratie (stap 2) niet uitgevoerd, of een veld met `null`; `load_mongo.py` laat lege velden al weg |
| `can't open file ...load_mongo.py` | je staat in de verkeerde map: `cd backend\scrapers` |
| `HTTP 401/403` van Ticketmaster | sleutel ontbreekt, is fout of is nog niet geactiveerd |
| allevents mislukt in `run_all.py` | de lijst-aanroep is alleen vanuit een browser getest; het vorige ruwe bestand blijft gelden |

## Beperkingen
* De clients voor Ticketmaster en allevents zijn niet getest vanuit de ontwikkelomgeving van de auteur; de eerste run bij jullie is de echte test.
* Events die bij een bron verdwijnen worden niet verwijderd. `fetchedAt` wordt elke ronde ververst: een toekomstig event met een oude `fetchedAt` is waarschijnlijk weg.
* Venue-coordinaten van allevents zijn onbetrouwbaar (bv. Sportpaleis); Ticketmaster en Geopunt wegen zwaarder.
* UiT toont max. 100 pagina's per zoekopdracht; `run_all.py` gebruikt drie periodes (0-13, 14-44 en 45-89 dagen vooruit).
