#!/usr/bin/env python3
"""Zet de adressen van uit_events.json om naar latitude/longitude.

Gebruik (naast uit_scraper.py in dezelfde map, alleen standaardbibliotheek):
    python uit_geocode.py                        # leest uit_events.json
    python uit_geocode.py uit_events_2026-10-30.json

Schrijft <naam>_geo.json en <naam>_geo.csv met extra kolommen:
    lat, lon           WGS84-coördinaten (zoals Google Maps en De Lijn die gebruiken)
    geo_precisie       huisnummer | straat | gemeente  (hoe nauwkeurig de treffer is)
    geo_adres          het adres zoals de geocoder het teruggaf

Bron: Geolocation-service van Digitaal Vlaanderen (Geopunt), gratis en zonder sleutel.
Vermeld de bron in je demo. Ik heb de gebruiksvoorwaarden niet gelezen; het script
doet daarom maximaal één aanvraag per 1,1 seconde en bewaart alle antwoorden in
geocode_cache.json, zodat elk adres maar één keer wordt opgevraagd.
"""
import argparse
import csv
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from uit_scraper import FIELDS

API = "https://geo.api.vlaanderen.be/geolocation/v4/Location"
UA = "Mozilla/5.0 (compatible; SchoolDemoGeocoder/1.0; studentenproject)"
CACHE_FILE = "geocode_cache.json"
EXTRA = ["lat", "lon", "geo_precisie", "geo_adres"]


def clean_address(straat, postcode, gemeente):
    """Rommelige invoer opschonen: dubbele postcode, huisnummerbereik, '(Antwerpen)', districtnummer."""
    s = (straat or "").strip()
    p = str(postcode or "").strip()
    if p:
        s = re.sub(rf"\s+{re.escape(p)}$", "", s)                      # 'Waalse kaai 14 2000' -> 'Waalse kaai 14'
    s = re.sub(r"(\d+[a-zA-Z]?)\s*-\s*\d+[a-zA-Z]?\b", r"\1", s)        # '28 - 30' -> '28'
    g = re.sub(r"\(.*?\)", "", gemeente or "")                          # 'Borgerhout (Antwerpen)' -> 'Borgerhout'
    g = re.sub(r"\s+\d+\s*$", "", g).strip()                            # 'Antwerpen 6' -> 'Antwerpen'
    return s, p, g


def strip_house_number(street):
    return re.sub(r"\s+\d+[a-zA-Z]?(\s*(bus|box)\s*\S+)?$", "", street, flags=re.I).strip()


def queries(straat, postcode, gemeente):
    """Van nauwkeurig naar grof: volledig adres, alleen de straat, alleen de gemeente."""
    s, p, g = clean_address(straat, postcode, gemeente)
    out = []
    if s:
        out.append(f"{s} {p} {g}")
        bare = strip_house_number(s)
        if bare and bare != s:
            out.append(f"{bare} {p} {g}")
    if p or g:
        out.append(f"{p} {g}")
    seen, uniq = set(), []
    for q in (re.sub(r"\s+", " ", x).strip() for x in out):
        if q and q not in seen:
            seen.add(q)
            uniq.append(q)
    return uniq, p


def lookup(q):
    url = f"{API}?c=1&q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode("utf-8"))
    res = (data.get("LocationResult") or [None])[0]
    time.sleep(lookup.delay)
    return res


lookup.delay = 1.1


def precision(location_type):
    t = (location_type or "").lower()
    if "huisnummer" in t:
        return "huisnummer"
    if "straat" in t:
        return "straat"
    return "gemeente"


def geocode(straat, postcode, gemeente):
    """Geeft een dict met lat/lon/geo_precisie/geo_adres, of None als er niets gevonden werd."""
    qs, p = queries(straat, postcode, gemeente)
    for q in qs:
        res = lookup(q)
        if not res:
            continue
        loc = res.get("Location") or {}
        if loc.get("Lat_WGS84") is None:
            continue
        # klopt de postcode? zo niet: toch bewaren, maar als twijfelgeval markeren
        prec = precision(res.get("LocationType"))
        if p and prec != "gemeente" and res.get("Zipcode") and res["Zipcode"] != p:
            prec += " (postcode wijkt af)"
        return {"lat": round(loc["Lat_WGS84"], 6), "lon": round(loc["Lon_WGS84"], 6),
                "geo_precisie": prec, "geo_adres": res.get("FormattedAddress")}
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("invoer", nargs="?", default="uit_events.json")
    ap.add_argument("--delay", type=float, default=1.1, help="seconden tussen aanvragen (min 1)")
    ap.add_argument("--opnieuw", action="store_true", help="adressen die eerder niets opleverden opnieuw proberen")
    args = ap.parse_args()
    lookup.delay = max(1.0, args.delay)

    src = pathlib.Path(args.invoer)
    if not src.exists():
        sys.exit(f"{src} niet gevonden. Draai eerst uit_scraper.py.")
    rows = json.loads(src.read_text(encoding="utf-8"))

    cache_path = pathlib.Path(CACHE_FILE)
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    def addr(r):
        return (r.get("straat") or "", str(r.get("postcode") or ""), r.get("gemeente") or "")

    def key(a):
        return "|".join(x.replace("|", " ") for x in a)

    unique = list(dict.fromkeys(addr(r) for r in rows))  # unieke adressen, volgorde behouden
    todo = [a for a in unique if key(a) not in cache or (args.opnieuw and cache[key(a)] is None)]
    print(f"{len(rows)} evenementen, {len(unique)} unieke adressen, {len(todo)} nog op te zoeken "
          f"(ongeveer {int(len(todo) * lookup.delay * 1.5)} seconden)")

    for i, a in enumerate(todo, 1):
        try:
            cache[key(a)] = geocode(*a)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(f"  netwerkfout bij {a}: {e}. Gestopt; draai opnieuw om verder te gaan.")
            break
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        g = cache[key(a)]
        print(f"  [{i}/{len(todo)}] {a[0]}, {a[1]} {a[2]} -> " + (f"{g['lat']}, {g['lon']} ({g['geo_precisie']})" if g else "niets gevonden"))

    found = 0
    for r in rows:
        g = cache.get(key(addr(r))) or {}
        for c in EXTRA:
            r[c] = g.get(c)
        found += bool(g)
    out = src.with_name(src.stem + "_geo")
    out.with_suffix(".json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(out.with_suffix(".csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS + EXTRA, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"\nKlaar: {found} van {len(rows)} evenementen hebben coördinaten.")
    print(f"Opgeslagen: {out.with_suffix('.json').name} en {out.with_suffix('.csv').name}")
    precisions = {}
    for r in rows:
        precisions[r["geo_precisie"]] = precisions.get(r["geo_precisie"], 0) + 1
    print("Nauwkeurigheid:", ", ".join(f"{k or 'geen'}: {v}" for k, v in sorted(precisions.items(), key=lambda x: str(x[0]))))


if __name__ == "__main__":
    main()
