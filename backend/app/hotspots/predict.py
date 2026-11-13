"""Hotspots voorspellen voor een tijdvenster en (optioneel) opslaan in db.hotspotPredictions."""

from datetime import datetime, timedelta, timezone

import h3
from bson import ObjectId
from pymongo.database import Database

from . import model
from .sources import driver_cells, load_sources

MODEL_VERSION = "kde-v1"
MAX_SOURCES = 5  # top-bronnen per hotspot in de uitleg


def predict(
    db: Database,
    start: datetime | None = None,
    end: datetime | None = None,
    history_weeks: int = 4,
    save: bool = False,
) -> dict:
    start = start or datetime.now(timezone.utc)
    end = end or start + timedelta(hours=1)

    sources = load_sources(db, start, end)
    by_id = {s.id: s for s in sources}
    heat = model.heatmap(sources)
    spots = model.find_hotspots(heat)

    # Zelfde weekdag en uur in de vorige weken -> wat is "normaal" voor deze plek?
    past = [model.heatmap(load_sources(db, start - timedelta(weeks=w), end - timedelta(weeks=w)))
            for w in range(1, history_weeks + 1)]
    drivers = driver_cells(db)

    hotspots = []
    for spot in spots:
        area = {n for c in spot["cells"] for n in h3.grid_disk(c, 1)}  # taxi's net naast de hotspot tellen mee
        nearby = sum(drivers[c] for c in area)
        value = model.score(spot["demand"], nearby)
        z = model.z_score(spot["demand"], [model.cell_demand(h, spot["cells"]) for h in past])
        hotspots.append({
            "location": {"type": "Point", "coordinates": [round(spot["lng"], 6), round(spot["lat"], 6)]},
            "radiusM": spot["radiusM"],
            "cells": spot["cells"],
            "demand": round(spot["demand"], 2),
            "nearbyDrivers": nearby,
            "score": round(value, 3),
            "level": model.level(value),
            "zScore": z,
            "aboveNormal": z is not None and z >= model.ABOVE_NORMAL_Z,
            "sources": [
                {"kind": by_id[sid].kind, "id": sid, "name": by_id[sid].name, "share": round(part / spot["demand"], 2)}
                for sid, part in spot["sources"].most_common(MAX_SOURCES)
            ],
        })
    hotspots.sort(key=lambda h: h["score"], reverse=True)

    if save:
        _save(db, hotspots, start, end)
    return {
        "window": {"from": start, "to": end},
        "modelVersion": MODEL_VERSION,
        "hotspots": hotspots,
        "heatmap": [  # 1 gewogen punt per H3-cel (middelpunt), voor een heatmap-laag op de kaart
            {"cell": c, "lat": round(lat, 6), "lng": round(lng, 6), "demand": round(e["demand"], 2)}
            for c, e in heat.items() if e["demand"] >= model.MIN_CELL_DEMAND / 5
            for lat, lng in [h3.cell_to_latlng(c)]
        ],
    }


def _save(db: Database, hotspots: list[dict], start: datetime, end: datetime) -> None:
    """Vervangt eerdere voorspellingen voor hetzelfde venster; TTL ruimt ze op na het venster."""
    now = datetime.now(timezone.utc)
    db.hotspotPredictions.delete_many({"modelVersion": MODEL_VERSION, "window.from": start, "window.to": end})
    docs = [{
        "location": h["location"],
        "radiusM": h["radiusM"],
        "window": {"from": start, "to": end},
        "score": h["score"],
        "level": h["level"],
        "demand": h["demand"],
        "zScore": h["zScore"],
        "cells": h["cells"],
        "factors": {
            "eventIds": [ObjectId(s["id"]) for s in h["sources"] if s["kind"] == "event"],
            "stationIds": [s["id"] for s in h["sources"] if s["kind"] == "station"],
            "nearbyDrivers": h["nearbyDrivers"],
            "sources": h["sources"],
        },
        "modelVersion": MODEL_VERSION,
        "createdAt": now,
        "expiresAt": end,
    } for h in hotspots]
    if docs:
        db.hotspotPredictions.insert_many(docs)
