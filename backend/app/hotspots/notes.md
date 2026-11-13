# Hotspots - notities

**Doel:** voorspellen waar een taxi in het komende venster (standaard 1 uur) best naartoe rijdt.

## Waarom geen XGBoost (nog)?
XGBoost is supervised en heeft labels nodig ("hier waren effectief X ritten"). Die hebben we niet,
enkel inputdata (treinen, events). Daarom: een **uitlegbaar scoremodel met gewichten** + unsupervised technieken.

## Hoe het werkt
1. **Bronnen -> punten** (`sources.py`)
   - Station: `crowdIndex` uit `irail/crowding.py` (aankomsten, IC, vertraging, schrappingen).
   - Event: bezoekers die naar buiten komen / 250 (1 punt = ongeveer 1 trein). Telt pas bij het **einde**
     (uitstroom gespreid over 45 min). Bezoekers = `expectedAttendance` -> venuecapaciteit -> standaard per categorie.
   - Dubbele events uit de scraper (zelfde show, andere titel/coordinaten) worden ontdubbeld.
2. **Heatmap = kernel density** (`model.heatmap`): elke bron verspreidt zijn punten met een Gauss-kern over
   een **H3-hexagongrid** (res 9, ~0,1 km2). Station sigma 250 m, event 400 m.
3. **Clustering** (`model.find_hotspots`): aaneengesloten cellen boven 25% van de drukste cel = 1 hotspot.
4. **Aanbod**: `score = 1 - e^(-(vraag / (taxi's in de buurt + 1)) / 20)` -> 0..1. Taxi's uit `driverPositions`.
5. **Drukker dan normaal**: z-score t.o.v. dezelfde weekdag en hetzelfde uur in de vorige 4 weken.
   `null` zolang er < 2 weken historiek is.

## Gebruik
```
GET /hotspots?from=now&to=+1h&history=4&save=false
```
Geeft `hotspots` (locatie, straal, score, level, zScore, `sources` = waarom) en `heatmap` (H3-cellen,
tekenen met `h3-js` in de frontend). `save=true` schrijft naar `hotspotPredictions` (TTL tot einde venster).

## Gewichten aanpassen
Alle constanten staan bovenaan `sources.py` en `model.py`. Ze zijn nu expertkeuzes (onderbouwen in het verslag, bv. met AHP).

## Volgende stap: gewichten leren
Feedback van chauffeurs loggen (klant binnen 15 min na aankomst op hotspot? ja/nee) = labels.
Daarmee de gewichten fitten (logistische regressie) of later toch XGBoost trainen met deze punten als features.

## Beperkingen
- Nog geen De Lijn of weer (toe te voegen als extra `Source`).
- Venuecapaciteiten zijn een korte handmatige lijst (Antwerpen).
- Scraper-coordinaten zijn soms fout: dat ligt bij de scraper, niet hier.
