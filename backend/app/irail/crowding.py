"""Drukte per station per tijdvenster, berekend uit db.trainMovements.

crowdIndex is een eenvoudige, uitlegbare heuristiek (baseline voor het AI-model):
  + 1    per aankomende trein          (reizigers stappen uit)
  + 0.5  extra per IC/internationale trein (meer reizigers per trein)
  + 0.5  per aankomst met >= 10 min vertraging (reizigers zoeken alternatief)
  + 1    per geschrapte trein          (gestrande reizigers)
  + 0.5 / 0.25 per vertrek met hoge / middelmatige bezetting (druk station)
score = crowdIndex / hoogste crowdIndex in het resultaat (0..1), zoals hotspotPredictions.score.
"""

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo.database import Database

from .collector import TZ

WEIGHTS = {
    "arrivals": 1.0,
    "longDistanceArrivals": 0.5,
    "delayedArrivals": 0.5,
    "canceled": 1.0,
    "highOccupancyDepartures": 0.5,
    "mediumOccupancyDepartures": 0.25,
}
DELAYED_S = 600


def _count(*conditions) -> dict:
    return {"$sum": {"$cond": [{"$and": list(conditions)}, 1, 0]}}


ARRIVAL = {"$eq": ["$direction", "arrival"]}
DEPARTURE = {"$eq": ["$direction", "departure"]}
RUNS = {"$eq": ["$canceled", False]}


def crowding(
    db: Database,
    start: datetime | None = None,
    end: datetime | None = None,
    station_id: str | None = None,
    bucket_minutes: int = 60,
) -> list[dict]:
    now = datetime.now(timezone.utc)
    start = start or now - timedelta(hours=1)
    end = end or now + timedelta(hours=3)
    match = {"expectedAt": {"$gte": start, "$lt": end}}
    if station_id:
        match["stationId"] = station_id

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": {
                    "stationId": "$stationId",
                    "bucketStart": {
                        "$dateTrunc": {
                            "date": "$expectedAt",
                            "unit": "minute",
                            "binSize": bucket_minutes,
                            "timezone": "Europe/Brussels",
                        }
                    },
                },
                "stationName": {"$first": "$stationName"},
                "location": {"$first": "$location"},
                "arrivals": _count(ARRIVAL, RUNS),
                "departures": _count(DEPARTURE, RUNS),
                "longDistanceArrivals": _count(ARRIVAL, RUNS, "$longDistance"),
                "delayedArrivals": _count(ARRIVAL, RUNS, {"$gte": ["$delayS", DELAYED_S]}),
                "canceled": _count({"$eq": ["$canceled", True]}),
                "highOccupancyDepartures": _count(DEPARTURE, {"$eq": ["$occupancy", "high"]}),
                "mediumOccupancyDepartures": _count(DEPARTURE, {"$eq": ["$occupancy", "medium"]}),
                "avgDelayS": {"$avg": {"$cond": [RUNS, "$delayS", None]}},
                "maxDelayS": {"$max": "$delayS"},
            }
        },
        {"$sort": {"_id.bucketStart": 1, "_id.stationId": 1}},
    ]
    rows = list(db.trainMovements.aggregate(pipeline))

    disturbed = {}  # stationId -> titels van actieve storingen
    for d in db.transitDisturbances.find({"active": True, "stationIds.0": {"$exists": True}}, {"title": 1, "type": 1, "stationIds": 1}):
        for sid in d["stationIds"]:
            disturbed.setdefault(sid, []).append({"title": d["title"], "type": d["type"]})

    result = []
    for row in rows:
        key = row.pop("_id")
        bucket_start = key["bucketStart"].astimezone(TZ)  # Brusselse tijd, leesbaarder in de app
        index = sum(row[k] * w for k, w in WEIGHTS.items())
        result.append({
            "stationId": key["stationId"],
            "bucketStart": bucket_start,
            "bucketEnd": bucket_start + timedelta(minutes=bucket_minutes),
            **row,
            "avgDelayS": round(row["avgDelayS"] or 0),
            "disturbances": disturbed.get(key["stationId"], []),
            "crowdIndex": round(index, 2),
        })

    top = max((r["crowdIndex"] for r in result), default=0) or 1
    for r in result:
        r["score"] = round(r["crowdIndex"] / top, 3)
        r["level"] = "high" if r["score"] >= 0.66 else "medium" if r["score"] >= 0.33 else "low"
    return result


def jsonable(value):
    """Mongo-documenten -> JSON (datums als ISO 8601, ObjectId als string)."""
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    return value
