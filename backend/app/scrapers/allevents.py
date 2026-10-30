"""Scraper voor allevents.in - alleen voor de demo, niet voor productie.

De lijstpagina (/antwerp/all?page=N) geeft per event een id, link en 'Interested'-aantal.
De detailpagina bevat schema.org JSON-LD met datum, venue, adres en coordinaten.

Gebruik:
    python -m app.scrapers.allevents --city antwerp --pages 2 --out events.json
    python -m app.scrapers.allevents --city antwerp --pages 2 --mongo   # upsert in db.events (MONGO_URI)
"""

import argparse
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx

BASE_URL = "https://allevents.in"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
}

# schema.org @type -> category in db.events
CATEGORIES = {
    "MusicEvent": "concert",
    "SportsEvent": "sport",
    "TheaterEvent": "theater",
    "ComedyEvent": "comedy",
    "DanceEvent": "dans",
    "Festival": "festival",
    "ExhibitionEvent": "expo",
    "BusinessEvent": "beurs",
    "FoodEvent": "food",
    "EducationEvent": "educatie",
    "SocialEvent": "sociaal",
}

# Geschatte duur als allevents geen (bruikbaar) einduur heeft
DEFAULT_DURATION = {
    "concert": timedelta(hours=3),
    "festival": timedelta(hours=8),
    "theater": timedelta(hours=2, minutes=30),
    "comedy": timedelta(hours=2),
    "sport": timedelta(hours=2, minutes=30),
}
FALLBACK_DURATION = timedelta(hours=3)
NIGHTLIFE_DURATION = timedelta(hours=6)  # start vanaf 22u: clubnacht tot de vroege ochtend

CARD_RE = re.compile(r'<li class="event-card event-card-link"[^>]*data-eid="(\d+)"[^>]*data-link="([^"]+)"')
INTERESTED_RE = re.compile(r"([\d.,]+)\+?\s*Interested")
LD_JSON_RE = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def scrape_listing(client: httpx.Client, city: str, page: int) -> list[dict]:
    """Event-ids, links en 'Interested'-aantal van een lijstpagina."""
    page_html = client.get(f"{BASE_URL}/{city}/all", params={"page": page} if page > 1 else None).text
    matches = list(CARD_RE.finditer(page_html))
    cards = []
    for i, m in enumerate(matches):
        # tekst van deze kaart tot de volgende kaart
        chunk = page_html[m.end() : matches[i + 1].start() if i + 1 < len(matches) else len(page_html)]
        interested = INTERESTED_RE.search(chunk)
        cards.append({
            "eid": m.group(1),
            "url": m.group(2).split("?")[0],
            "interested": int(re.sub(r"\D", "", interested.group(1))) if interested else None,
        })
    return cards


def scrape_detail(client: httpx.Client, url: str) -> dict | None:
    """Het schema.org Event-object uit de JSON-LD van een detailpagina."""
    page_html = client.get(url).text
    for block in LD_JSON_RE.findall(page_html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict) and "startDate" in item:
                return item
    return None


def to_event(card: dict, ld: dict, city: str) -> dict | None:
    """schema.org Event -> document volgens het events-schema (database/init/01-schema.js)."""
    place = ld.get("location") or {}
    if isinstance(place, list):
        place = place[0] if place else {}
    geo = place.get("geo") or {}
    try:
        lng, lat = float(geo["longitude"]), float(geo["latitude"])
    except (KeyError, TypeError, ValueError):
        return None  # zonder coordinaten geen pin op de kaart
    address = place.get("address") or {}
    if isinstance(address, str):
        address = {"streetAddress": address}

    category = CATEGORIES.get(ld.get("@type"), "overig")
    starts_at, ends_at, estimated = event_times(ld, category)

    event = {
        "source": "allevents",
        "externalId": card["eid"],
        "title": html.unescape(ld.get("name", "")).strip(),
        "description": html.unescape(ld.get("description", "")),
        "category": category,
        "startsAt": starts_at,
        "endsAt": ends_at,
        "endsAtEstimated": estimated,
        "venue": {
            "name": place.get("name") or "Onbekend",
            "address": address.get("streetAddress", ""),
            "city": address.get("addressLocality") or city,
            "location": {"type": "Point", "coordinates": [lng, lat]},
        },
        "url": card["url"],
        "raw": {"jsonld": ld, "interested": card["interested"]},
        "fetchedAt": datetime.now(timezone.utc),
    }
    return event


def event_times(ld: dict, category: str) -> tuple[datetime, datetime, bool]:
    """Begin, einde en of het einde geschat is.

    Ongeveer de helft van de events heeft geen endDate; allevents zet dan zelf einde = begin.
    In dat geval schatten we het einde op basis van de categorie en het startuur.
    """
    starts_at = datetime.fromisoformat(ld["startDate"])
    if ld.get("endDate"):
        ends_at = datetime.fromisoformat(ld["endDate"])
        if ends_at > starts_at:
            return starts_at, ends_at, False
    if starts_at.hour >= 22:
        duration = NIGHTLIFE_DURATION
    else:
        duration = DEFAULT_DURATION.get(category, FALLBACK_DURATION)
    return starts_at, starts_at + duration, True


def scrape(city: str, pages: int, delay: float) -> list[dict]:
    events = []
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=20) as client:
        cards = []
        for page in range(1, pages + 1):
            cards += scrape_listing(client, city, page)
            time.sleep(delay)
        cards = list({c["eid"]: c for c in cards}.values())  # featured events staan soms dubbel
        print(f"{len(cards)} events gevonden op {pages} pagina('s)")

        for i, card in enumerate(cards, 1):
            try:
                ld = scrape_detail(client, card["url"])
            except httpx.HTTPError as e:
                print(f"  [{i}/{len(cards)}] fout: {e}")
                continue
            event = to_event(card, ld, city) if ld else None
            print(f"  [{i}/{len(cards)}] {'ok ' if event else 'skip'} {card['url']}")
            if event:
                events.append(event)
            time.sleep(delay)
    return events


def save_mongo(events: list[dict]) -> None:
    from pymongo import MongoClient

    db = MongoClient(os.environ["MONGO_URI"])[os.environ.get("MONGO_DB", "taxintel")]
    for event in events:
        db.events.update_one(
            {"source": event["source"], "externalId": event["externalId"]},
            {"$set": event},
            upsert=True,
        )
    print(f"{len(events)} events ge-upsert in {db.name}.events")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape events van allevents.in (demo)")
    parser.add_argument("--city", default="antwerp", help="stad zoals in de URL, bv. antwerp, ghent, brussels")
    parser.add_argument("--pages", type=int, default=1, help="aantal lijstpagina's (~45 events per pagina)")
    parser.add_argument("--delay", type=float, default=1.5, help="seconden tussen requests")
    parser.add_argument("--out", help="schrijf naar JSON-bestand")
    parser.add_argument("--mongo", action="store_true", help="upsert in MongoDB (MONGO_URI)")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")  # Windows-console kan niet alle tekens uit titels tonen

    events = scrape(args.city, args.pages, args.delay)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2, default=str)
        print(f"{len(events)} events geschreven naar {args.out}")
    if args.mongo:
        save_mongo(events)


if __name__ == "__main__":
    main()
