#!/usr/bin/env python3
"""Haalt ruwe events op uit Ticketmaster, Eventbrite en allevents.in (alleen Antwerpen).

    python fetch_sources.py ticketmaster            # -> data/raw_ticketmaster.json
    python fetch_sources.py eventbrite              # -> data/raw_eventbrite.json
    python fetch_sources.py allevents               # -> data/raw_allevents.json
    python fetch_sources.py ticketmaster eventbrite --dagen 120

Sleutels staan in .env (TICKETMASTER_KEY, EVENTBRITE_KEY) of in omgevingsvariabelen. Ze worden nooit
geprint of opgeslagen. Waarschuwing: deze drie clients zijn geschreven naar de documentatie en het
gedrag van de sites, maar NIET getest tegen de live API's vanuit de ontwikkelomgeving.
"""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

UA = "TaxintelSchoolDemo/1.0 (studentenproject)"
OUT = pathlib.Path("data")
ANTWERPEN = (51.2194, 4.4025)


def load_key(name):
    """Omgevingsvariabele of .env (hier of in een bovenliggende map). Toont de waarde nooit."""
    if os.environ.get(name):
        return os.environ[name].strip()
    for d in [pathlib.Path.cwd(), *pathlib.Path(__file__).resolve().parents]:
        f = d / ".env"
        if f.is_file():
            for line in f.read_text(encoding="utf-8-sig").splitlines():
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"{name} niet gevonden (omgevingsvariabele of .env).")


def http_json(url, headers=None, data=None, retries=4):
    h = {"User-Agent": UA, "Accept": "application/json", **(headers or {})}
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    for attempt in range(retries):
        req = urllib.request.Request(url, headers=h, data=body)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(int(e.headers.get("Retry-After", 2 ** (attempt + 1))))
                continue
            # URL niet tonen: kan de sleutel bevatten
            raise SystemExit(f"HTTP {e.code} van {urllib.parse.urlsplit(url).netloc}: {e.read().decode('utf-8', 'replace')[:200]}")
    raise SystemExit("te veel pogingen")


def save(name, items, note):
    OUT.mkdir(exist_ok=True)
    p = OUT / f"raw_{name}.json"
    p.write_text(json.dumps({"items": items, "bron": note, "opgehaald_op": datetime.now(timezone.utc).isoformat(),
                             "aantal": len(items)}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}: {len(items)} events -> {p}")


# ---------------------------------------------------------------- Ticketmaster Discovery API v2
def fetch_ticketmaster(dagen):
    """Max 5 aanvragen/s en 5000/dag. Discovery staat diep bladeren niet toe (size*page < 1000),
    daarom splitsen we de periode op in blokken van 14 dagen."""
    key = load_key("TICKETMASTER_KEY")
    start = datetime.now(timezone.utc).replace(microsecond=0)
    items, seen = [], set()
    block = timedelta(days=14)
    t = start
    while t < start + timedelta(days=dagen):
        t2 = min(t + block, start + timedelta(days=dagen))
        page = 0
        while True:
            q = {"apikey": key, "latlong": f"{ANTWERPEN[0]},{ANTWERPEN[1]}", "radius": 15, "unit": "km",
                 "countryCode": "BE", "size": 100, "page": page, "sort": "date,asc", "locale": "*",
                 "startDateTime": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "endDateTime": t2.strftime("%Y-%m-%dT%H:%M:%SZ")}
            j = http_json("https://app.ticketmaster.com/discovery/v2/events.json?" + urllib.parse.urlencode(q))
            for e in (j.get("_embedded") or {}).get("events", []):
                if e["id"] not in seen:
                    seen.add(e["id"])
                    items.append(e)
            pg = j.get("page") or {}
            page += 1
            if page >= pg.get("totalPages", 0) or page * 100 >= 1000:
                break
            time.sleep(0.3)
        time.sleep(0.3)
        t = t2
    save("ticketmaster", items, "Ticketmaster Discovery API v2, radius 15 km rond Antwerpen")


# ---------------------------------------------------------------- Eventbrite
def fetch_eventbrite():
    """Eventbrite heeft zijn zoekfunctie (/events/search) in 2020 afgeschaft: je kunt niet meer op stad zoeken.
    Wel mogelijk: events van een venue of organisatie ophalen. Zet die ID's in eventbrite_sources.json:
        {"venue_ids": ["12345"], "organization_ids": ["67890"]}
    Dit is een lijst die jullie zelf samenstellen (bv. de grote Antwerpse zalen/organisatoren)."""
    token = load_key("EVENTBRITE_KEY")          # moet het persoonlijke OAuth-token (private token) zijn
    cfg_path = pathlib.Path("eventbrite_sources.json")
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    targets = [("venues", v) for v in cfg.get("venue_ids", [])] + [("organizations", o) for o in cfg.get("organization_ids", [])]
    if not targets:
        cfg_path.write_text(json.dumps({"venue_ids": [], "organization_ids": []}, indent=1), encoding="utf-8")
        print("Eventbrite: geen venue- of organisatie-ID's ingesteld (zie eventbrite_sources.json). Niets opgehaald.")
        return
    items, seen = [], set()
    for kind, tid in targets:
        cont = None
        while True:
            q = {"status": "live", "expand": "venue,category,ticket_availability"}
            if cont:
                q["continuation"] = cont
            j = http_json(f"https://www.eventbriteapi.com/v3/{kind}/{tid}/events/?" + urllib.parse.urlencode(q),
                          headers={"Authorization": f"Bearer {token}"})
            for e in j.get("events", []):
                if e["id"] not in seen:
                    seen.add(e["id"])
                    items.append(e)
            pg = j.get("pagination") or {}
            cont = pg.get("continuation")
            if not pg.get("has_more_items") or not cont:
                break
            time.sleep(0.5)
    save("eventbrite", items, "Eventbrite v3 events per venue/organisatie")


# ---------------------------------------------------------------- allevents.in
def fetch_allevents(paginas):
    """Roept dezelfde lijst-aanroep aan als de 'View More'-knop op allevents.in/antwerp/all.
    Het is een interne endpoint van de site (geen officiele API) en alleen vanuit de browser getest.
    Controleer de gebruiksvoorwaarden van allevents.in voor je dit structureel draait."""
    items, seen = [], set()
    for page in range(1, paginas + 1):
        payload = {"venue": 0, "page": page, "rows": 46 if page <= 2 else 15, "tag_type": 0, "sdate": 0, "edate": 0,
                   "city": "antwerp", "keywords": "0", "category": ["all"], "formats": 0, "sort_by_score_only": True}
        j = http_json("https://allevents.in/api/index.php/categorization/web/v1/list",
                      headers={"Referer": "https://allevents.in/antwerp/all"}, data=payload)
        got = (j or {}).get("item") or []
        for e in got:
            if e["event_id"] not in seen:
                seen.add(e["event_id"])
                items.append(e)
        if len(got) < 15:
            break
        time.sleep(5)                       # vriendelijk blijven: robots.txt vraagt crawl-delay voor bots
    save("allevents", items, "allevents.in lijst-aanroep voor Antwerpen")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bronnen", nargs="+", choices=["ticketmaster", "eventbrite", "allevents"])
    ap.add_argument("--dagen", type=int, default=120, help="Ticketmaster: hoeveel dagen vooruit")
    ap.add_argument("--paginas", type=int, default=12, help="allevents: aantal pagina's")
    a = ap.parse_args()
    for b in a.bronnen:
        {"ticketmaster": lambda: fetch_ticketmaster(a.dagen), "eventbrite": fetch_eventbrite,
         "allevents": lambda: fetch_allevents(a.paginas)}[b]()


if __name__ == "__main__":
    main()
