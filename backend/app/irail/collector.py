"""iRail-data ophalen, omzetten naar documenten volgens database/init/01-schema.js en opslaan.

- stations       -> db.transitHubs        (source "irail", kind "train")
- liveboards     -> db.trainMovements     (1 doc per trein per station per richting, vertraging wordt bijgewerkt)
- disturbances   -> db.transitDisturbances (storingen en geplande werken)

Een aankomende trein = mensen die uitstappen = mogelijke taxiklanten. Uit trainMovements
berekent crowding.py per station en tijdvenster hoe druk het is.
"""

import hashlib
import os
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pymongo import UpdateOne
from pymongo.database import Database

from .client import IRailClient

TZ = ZoneInfo("Europe/Brussels")

# Grote stations rond Antwerpen + de belangrijkste knooppunten. Overschrijfbaar met IRAIL_STATIONS (komma-gescheiden ids).
DEFAULT_STATIONS = [
    "BE.NMBS.008821006",  # Antwerpen-Centraal
    "BE.NMBS.008821121",  # Antwerpen-Berchem
    "BE.NMBS.008821196",  # Antwerpen-Zuid
    "BE.NMBS.008822004",  # Mechelen
    "BE.NMBS.008814001",  # Brussel-Zuid
    "BE.NMBS.008813003",  # Brussel-Centraal
    "BE.NMBS.008812005",  # Brussel-Noord
    "BE.NMBS.008819406",  # Brussels Airport - Zaventem
    "BE.NMBS.008892007",  # Gent-Sint-Pieters
    "BE.NMBS.008833001",  # Leuven
]

# Treintypes met veel reizigers per trein (IC, internationaal); gebruikt als gewicht in crowding.py
LONG_DISTANCE_TYPES = {"IC", "EC", "ICE", "EUR", "THA", "TGV", "ECD", "NJ", "EXTRA"}


def tracked_stations() -> list[str]:
    env = os.environ.get("IRAIL_STATIONS", "").strip()
    return [s.strip() for s in env.split(",") if s.strip()] if env else DEFAULT_STATIONS


def _point(info: dict) -> dict:
    return {"type": "Point", "coordinates": [float(info["locationX"]), float(info["locationY"])]}


def _utc(epoch: str) -> datetime:
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc)


# ---------- stations ----------

def to_hub(station: dict, fetched_at: datetime) -> dict:
    return {
        "kind": "train",
        "source": "irail",
        "externalId": station["id"],
        "name": station["name"],
        "standardName": station["standardname"],
        "location": _point(station),
        "fetchedAt": fetched_at,
    }


def fetch_stations(client: IRailClient, belgian_only: bool = True) -> list[dict]:
    now = datetime.now(timezone.utc)
    stations = client.stations()
    if belgian_only:  # NMBS-ids van Belgische stations beginnen met 0088
        stations = [s for s in stations if s["id"].startswith("BE.NMBS.0088")]
    return [to_hub(s, now) for s in stations]


def save_stations(db: Database, hubs: list[dict]) -> int:
    ops = [UpdateOne({"source": "irail", "externalId": h["externalId"]}, {"$set": h}, upsert=True) for h in hubs]
    return db.transitHubs.bulk_write(ops).upserted_count if ops else 0


# ---------- liveboards ----------

def to_movement(entry: dict, station: dict, direction: str, fetched_at: datetime) -> dict:
    """Een liveboard-regel -> trainMovements-document."""
    scheduled = _utc(entry["time"])
    delay_s = int(entry.get("delay") or 0)
    expected = scheduled + timedelta(seconds=delay_s)
    local = expected.astimezone(TZ)
    vehicle = entry["vehicleinfo"]
    other = entry["stationinfo"]
    movement = {
        "stationId": station["id"],
        "stationName": station["name"],
        "location": _point(station),
        "direction": direction,
        "vehicle": entry["vehicle"].removeprefix("BE.NMBS."),
        "vehicleType": vehicle.get("type", ""),
        "longDistance": vehicle.get("type", "") in LONG_DISTANCE_TYPES,
        "otherStation": {"id": other["id"], "name": other["name"]},  # herkomst (aankomst) of bestemming (vertrek)
        "scheduledAt": scheduled,
        "expectedAt": expected,
        "delayS": delay_s,
        "canceled": entry.get("canceled") == "1",
        "isExtra": entry.get("isExtra") == "1",
        "passed": entry.get("arrived" if direction == "arrival" else "left") == "1",
        "platform": entry.get("platform", ""),
        "platformChanged": entry.get("platforminfo", {}).get("normal") == "0",
        # features voor het AI-model (lokale tijd)
        "localHour": local.hour,
        "weekday": local.weekday(),  # 0 = maandag
        "lastSeenAt": fetched_at,
    }
    if direction == "departure":  # iRail geeft bezetting enkel bij vertrekken
        movement["occupancy"] = entry.get("occupancy", {}).get("name", "unknown")
    return movement


def fetch_movements(client: IRailClient, station_ids: list[str], hours: int = 1) -> list[dict]:
    """Aankomsten en vertrekken voor de komende `hours` uur in elk station.

    Een liveboard-call geeft ongeveer een uur; voor meerdere uren vragen we per uur een venster op.
    """
    now = datetime.now(timezone.utc)
    start = datetime.now(TZ).replace(second=0, microsecond=0)
    movements: dict[tuple, dict] = {}
    for station_id in station_ids:
        for direction in ("arrival", "departure"):
            for h in range(hours):
                board = client.liveboard(station_id, direction, at=start + timedelta(hours=h) if h else None)
                station = board.get("stationinfo")
                entries = (board.get(f"{direction}s") or {}).get(direction, [])
                for entry in entries:
                    m = to_movement(entry, station, direction, now)
                    movements[(m["stationId"], direction, m["vehicle"], m["scheduledAt"])] = m  # vensters overlappen
    return list(movements.values())


def save_movements(db: Database, movements: list[dict]) -> tuple[int, int]:
    ops = [
        UpdateOne(
            {k: m[k] for k in ("stationId", "direction", "vehicle", "scheduledAt")},
            {"$set": m, "$setOnInsert": {"firstSeenAt": m["lastSeenAt"]}},
            upsert=True,
        )
        for m in movements
    ]
    if not ops:
        return 0, 0
    result = db.trainMovements.bulk_write(ops, ordered=False)
    return result.upserted_count, result.modified_count


# ---------- disturbances ----------

def _station_patterns(hubs: list[dict]) -> list[tuple[re.Pattern, str]]:
    patterns = []
    for h in hubs:
        names = {h["name"], *h["standardName"].split("/")}
        for name in names:
            if len(name) >= 4:
                patterns.append((re.compile(rf"(?<![\w-]){re.escape(name)}(?![\w-])", re.I), h["externalId"]))
    return patterns


def to_disturbance(d: dict, patterns: list[tuple[re.Pattern, str]], fetched_at: datetime) -> dict:
    title = d.get("title", "")
    return {
        "source": "irail",
        "externalId": hashlib.sha1(f"{title}|{d.get('link', '')}".encode()).hexdigest()[:16],
        "type": d.get("type", "disturbance"),  # "disturbance" (onverwacht) of "planned" (werken)
        "title": title,
        "description": d.get("description", ""),
        "link": d.get("link", ""),
        "publishedAt": _utc(d["timestamp"]),
        # stations die in de titel vernoemd worden, bv. "Landen - Luik-Guillemins"
        "stationIds": sorted({sid for pattern, sid in patterns if pattern.search(title)}),
        "active": True,
        "lastSeenAt": fetched_at,
    }


def fetch_disturbances(client: IRailClient, hubs: list[dict], fetched_at: datetime) -> list[dict]:
    patterns = _station_patterns(hubs)
    return [to_disturbance(d, patterns, fetched_at) for d in client.disturbances()]


def save_disturbances(db: Database, disturbances: list[dict], fetched_at: datetime) -> int:
    ops = [
        UpdateOne(
            {"source": "irail", "externalId": d["externalId"]},
            {"$set": d, "$setOnInsert": {"firstSeenAt": d["lastSeenAt"]}},
            upsert=True,
        )
        for d in disturbances
    ]
    if ops:
        db.transitDisturbances.bulk_write(ops, ordered=False)
    # alles wat niet meer in de feed staat is opgelost
    db.transitDisturbances.update_many(
        {"source": "irail", "active": True, "lastSeenAt": {"$lt": fetched_at}}, {"$set": {"active": False}}
    )
    return len(ops)


# ---------- alles samen (CLI / API) ----------

def collect(db: Database, station_ids: list[str] | None = None, hours: int = 1) -> dict:
    """Een volledige ophaalronde: stations (eerste keer), liveboards en storingen."""
    station_ids = station_ids or tracked_stations()
    with IRailClient() as client:
        hubs = list(db.transitHubs.find({"source": "irail"}, {"_id": 0}))
        if not hubs:
            hubs = fetch_stations(client)
            save_stations(db, hubs)
        movements = fetch_movements(client, station_ids, hours)
        inserted, updated = save_movements(db, movements)
        fetched_at = datetime.now(timezone.utc)
        disturbances = fetch_disturbances(client, hubs, fetched_at)
        save_disturbances(db, disturbances, fetched_at)
    return {
        "stations": len(station_ids),
        "movements": len(movements),
        "movementsInserted": inserted,
        "movementsUpdated": updated,
        "disturbances": len(disturbances),
    }
