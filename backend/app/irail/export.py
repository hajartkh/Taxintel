"""iRail-data uit MongoDB als JSON (gedeeld door de CLI en de API)."""

import re
from datetime import datetime, timedelta, timezone

from pymongo.database import Database

from .collector import TZ
from .crowding import crowding, jsonable

KINDS = ("crowding", "movements", "stations", "disturbances")
RELATIVE_RE = re.compile(r"^([+-]?)\s*(\d+)\s*([mhd])$")
# een niet-ge-encodeerde '+' in een URL wordt een spatie: '...T17:00 01:00' -> '...T17:00+01:00'
URL_OFFSET_RE = re.compile(r"(t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?) (\d{2}:\d{2})$")
UNITS = {"m": "minutes", "h": "hours", "d": "days"}
TIME_HELP = "'now', relatief ('-1h', '3h' of '+3h', '-30m', '1d') of ISO 8601 ('2026-10-30T17:00', zonder tijdzone = Brusselse tijd)"


def parse_time(value: str) -> datetime:
    """'now', '-1h', '+30m', '1d' of een ISO-datum/tijd. Zonder tijdzone = Brusselse tijd."""
    value = value.strip().lower()
    if value == "now":
        return datetime.now(timezone.utc)
    if m := RELATIVE_RE.match(value):
        sign, amount, unit = m.groups()  # zonder teken = vooruit ('+3h' in een URL komt binnen als ' 3h')
        delta = timedelta(**{UNITS[unit]: int(amount)})
        return datetime.now(timezone.utc) + (-delta if sign == "-" else delta)
    try:
        dt = datetime.fromisoformat(URL_OFFSET_RE.sub(lambda m: f"{m[1]}+{m[2]}", value).upper())
    except ValueError:
        raise ValueError(f"ongeldige tijd '{value}', gebruik {TIME_HELP}") from None
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ)


def export(
    db: Database,
    kind: str,
    start: datetime | None = None,
    end: datetime | None = None,
    station_id: str | None = None,
    bucket_minutes: int = 60,
    limit: int = 5000,
) -> list[dict]:
    if kind == "crowding":
        docs = crowding(db, start, end, station_id, bucket_minutes)
    elif kind == "movements":
        query = {}
        if start or end:
            query["expectedAt"] = {k: v for k, v in (("$gte", start), ("$lt", end)) if v}
        if station_id:
            query["stationId"] = station_id
        docs = list(db.trainMovements.find(query, {"_id": 0}).sort("expectedAt", 1).limit(limit))
    elif kind == "stations":
        docs = list(db.transitHubs.find({"source": "irail"}, {"_id": 0}).sort("name", 1))
    elif kind == "disturbances":
        query = {"source": "irail", "active": True}
        if station_id:
            query["stationIds"] = station_id
        docs = list(db.transitDisturbances.find(query, {"_id": 0}).sort("publishedAt", -1))
    else:
        raise ValueError(f"onbekend type '{kind}', kies uit {KINDS}")
    return jsonable(docs)
