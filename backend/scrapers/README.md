# Event-scrapers voor Taxintel (alleen Antwerpen)

Bronnen: **UiTinVlaanderen** (scraper), **allevents.in** (lijst-aanroep), **Ticketmaster** (Discovery API), **Eventbrite** (API).

```
fetch_sources.py   ruwe events ophalen -> data/raw_<bron>.json   (ticketmaster | eventbrite | allevents)
uit_scraper.py     UiT-events ophalen -> uit_events.json          (+ uit_geocode.py voor coordinaten)
events_pipeline.py normaliseren + opschonen + ontdubbelen        -> events_clean.json, events_rejected.json, dedupe_report.csv
load_mongo.py      events_clean.json -> MongoDB `events` (upsert, geen dubbels)
02-event-sources.js  migratie: extra `source`-waarden toelaten in de validator
```

## Draaien
```
pip install tzdata pymongo            # tzdata alleen nodig op Windows
python fetch_sources.py ticketmaster allevents eventbrite
python uit_scraper.py --pages 30 --out uit_events   # zoals eerder
python events_pipeline.py --uit uit_events.json --allevents data/raw_allevents.json \
       --ticketmaster data/raw_ticketmaster.json --eventbrite data/raw_eventbrite.json --geocode
python load_mongo.py --dry-run && python load_mongo.py
```
Sleutels: `TICKETMASTER_KEY`, `EVENTBRITE_KEY` in `.env` (worden nooit geprint). Eerst de migratie `02-event-sources.js` uitvoeren.

## Wat de pipeline doet
* **Opschonen:** HTML-entiteiten, emoji en dubbele spaties weg; "uitverkocht / laatste tickets" uit de titel naar `flags`;
  adressen genormaliseerd ("Turnhoutsebaan 286, 2140 Antwerpen"); tijden naar UTC (UiT is lokale tijd, allevents unix);
  looptijden > 7 dagen (bv. Candlelight-reeksen) krijgen `flags: ["series"]` en geen `endsAt`; categorie naar een vaste lijst.
* **Locatie:** coordinaten van de bron; allevents' "stadscentrum"-coordinaat (51.2194, 4.4025) wordt vervangen via
  bekende venues; duidelijk foute venue-coordinaten worden rechtgezet; UiT-adressen via Geopunt (`--geocode`).
  Events zonder bruikbare locatie, geannuleerde, online en voorbije events gaan naar `events_rejected.json` (met reden).
* **Ontdubbelen** (ook binnen een bron): zelfde start (+-3 u) + vergelijkbare titel (genormaliseerd, zonder venue/stopwoorden)
  + zelfde venue (naam of <250 m) = dubbel -> 1 document. Twijfel (zelfde venue en tijd, titel deels gelijk) wordt **niet**
  samengevoegd maar gemarkeerd in `dedupe.possibleDuplicates` en `dedupe_report.csv`.
  Hoofdrecord: Ticketmaster > UiT > Eventbrite > allevents; allevents-kopieen van "aggregator"-accounts zakken naar onderen.
  Alle bronnen blijven bewaard in `sources[]`.

## Bekende beperkingen
* Eventbrite kan niet meer op stad zoeken (search-endpoint afgeschaft in 2020); je moet venue-/organisatie-ID's opgeven in `eventbrite_sources.json`.
* De Ticketmaster-, Eventbrite- en allevents-clients zijn niet getest tegen de live servers vanuit de ontwikkelomgeving.
* allevents.in: interne endpoint, gebruiksvoorwaarden niet gelezen.
* Venue-coordinaten van allevents zijn onbetrouwbaar (bv. Sportpaleis); Ticketmaster en Geopunt wegen zwaarder.
* Geen capaciteit/verwachte opkomst in de bronnen: `expectedAttendance` blijft leeg.
