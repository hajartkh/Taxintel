"""Bronnen uit MongoDB omzetten naar model.Source: treinen (trainMovements), events en taxi-posities."""

import re
from collections import Counter
from datetime import datetime, timedelta, timezone

import h3
from pymongo.database import Database

from app.irail.crowding import crowding
from app.scrapers.allevents import DEFAULT_DURATION, FALLBACK_DURATION

from .model import RESOLUTION, Source

# ---------- gewichten (expertkeuze, zie notes.md) ----------
STATION_SIGMA_M = 250  # reizigers blijven dicht bij de stationsuitgang
EVENT_SIGMA_M = 400  # grote venues: bezoekers verspreiden zich verder
ARRIVAL_LEAD = timedelta(minutes=10)  # reizigers van net voor het venster staan nog aan de taxistand
EVENT_EXIT = timedelta(minutes=45)  # bezoekers verlaten het event gespreid over 45 min na het einde
PEOPLE_PER_POINT = 250  # 250 bezoekers die naar buiten komen = 1 punt (= 1 aankomende trein)

# Capaciteit van bekende venues (deel van de naam, kleine letters). Events hebben zelden een bezoekersaantal.
VENUE_CAPACITY = {
    "sportpaleis": 23000,
    "afas dome": 23000,
    "lotto arena": 8000,
    "antwerp expo": 10000,
    "bosuil": 12000,
    "koningin elisabethzaal": 2000,
    "de roma": 1800,
    "trix": 1200,
    "ampere": 800,
}
CATEGORY_ATTENDANCE = {"festival": 5000, "sport": 5000, "concert": 1000, "theater": 800}
DEFAULT_ATTENDANCE = 300


def station_sources(db: Database, start: datetime, end: datetime) -> list[Source]:
    """1 bron per station; punten = crowdIndex (aankomsten, IC, vertraging, schrappingen) uit crowding.py."""
    stations: dict[str, Source] = {}
    for row in crowding(db, start - ARRIVAL_LEAD, end, bucket_minutes=60):
        sid = row["stationId"]
        if sid not in stations:
            lng, lat = row["location"]["coordinates"]
            stations[sid] = Source("station", sid, row["stationName"], lng, lat, 0.0, STATION_SIGMA_M)
        stations[sid].points += row["crowdIndex"]
    return list(stations.values())


def attendance(event: dict) -> int:
    if event.get("expectedAttendance"):
        return event["expectedAttendance"]
    venue = event["venue"]["name"].lower()
    for name, capacity in VENUE_CAPACITY.items():
        if name in venue:
            return capacity
    return CATEGORY_ATTENDANCE.get(event.get("category"), DEFAULT_ATTENDANCE)


def event_end(event: dict) -> datetime:
    return event.get("endsAt") or event["startsAt"] + DEFAULT_DURATION.get(event.get("category"), FALLBACK_DURATION)


def event_sources(db: Database, start: datetime, end: datetime) -> list[Source]:
    """1 bron per event dat in het venster leegloopt; punten = bezoekers x deel van de uitstroom in het venster.

    Hetzelfde event staat soms meermaals in de bron (andere titel of zelfs andere coordinaten):
    per (starttijd + eerste 2 woorden van de titel) en per (venue + dag) houden we enkel het grootste over.
    """
    candidates = []
    for ev in db.events.find({"startsAt": {"$gte": start - timedelta(days=1), "$lt": end}}):
        exit_from = event_end(ev)
        exit_to = exit_from + EVENT_EXIT
        overlap = (min(end, exit_to) - max(start, exit_from)) / EVENT_EXIT
        if overlap <= 0:
            continue
        lng, lat = ev["venue"]["location"]["coordinates"]
        points = attendance(ev) / PEOPLE_PER_POINT * min(overlap, 1.0)
        source = Source("event", str(ev["_id"]), ev["title"], lng, lat, points, EVENT_SIGMA_M)
        title = " ".join(re.findall(r"[a-z0-9]+", ev["title"].lower())[:2])  # meestal de artiest
        candidates.append((source, (ev["startsAt"], title), (h3.latlng_to_cell(lat, lng, RESOLUTION), ev["startsAt"].date())))

    candidates.sort(key=lambda c: c[0].points, reverse=True)  # grootste eerst (bekende venue = hoogste capaciteit)
    result, seen = [], set()
    for source, *keys in candidates:
        if not seen.intersection(keys):
            result.append(source)
        seen.update(keys)
    return result


def load_sources(db: Database, start: datetime, end: datetime) -> list[Source]:
    return station_sources(db, start, end) + event_sources(db, start, end)


def driver_cells(db: Database, minutes: int = 10) -> Counter:
    """Aantal taxi's per H3-cel (laatste positie per chauffeur van de laatste N minuten)."""
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    pipeline = [
        {"$match": {"recordedAt": {"$gte": since}}},
        {"$sort": {"recordedAt": -1}},
        {"$group": {"_id": "$driverId", "location": {"$first": "$location"}}},
    ]
    cells = Counter()
    for pos in db.driverPositions.aggregate(pipeline):
        lng, lat = pos["location"]["coordinates"]
        cells[h3.latlng_to_cell(lat, lng, RESOLUTION)] += 1
    return cells
