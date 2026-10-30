"""REST-endpoints voor de iRail-data (JSON)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.db import get_db
from app.irail.collector import collect, tracked_stations
from app.irail.export import TIME_HELP, export, parse_time

router = APIRouter(prefix="/irail", tags=["iRail (NMBS)"])


def _time(value: str | None, name: str) -> datetime | None:
    if value is None or not value.strip():
        return None
    try:
        return parse_time(value)
    except ValueError as e:
        raise HTTPException(422, f"'{name}': {e}")


@router.get("/crowding")
def get_crowding(
    start: str | None = Query(None, alias="from", description=f"{TIME_HELP}. Weglaten = 1 uur geleden (-1h)"),
    end: str | None = Query(None, alias="to", description=f"{TIME_HELP}. Weglaten = binnen 3 uur (+3h)"),
    station: str | None = Query(None, description="station-id, bv. BE.NMBS.008821006"),
    bucket: int = Query(60, ge=5, le=1440, description="minuten per tijdvenster"),
):
    """Drukte per station per tijdvenster (aankomsten, vertraging, schrappingen, bezetting, score 0..1)."""
    return export(get_db(), "crowding", _time(start, "from"), _time(end, "to"), station, bucket)


@router.get("/movements")
def get_movements(
    start: str | None = Query(None, alias="from", description=f"{TIME_HELP}. Weglaten = geen ondergrens"),
    end: str | None = Query(None, alias="to", description=f"{TIME_HELP}. Weglaten = geen bovengrens"),
    station: str | None = None,
    limit: int = Query(1000, ge=1, le=20000),
):
    """Ruwe treinbewegingen (1 record per trein per station per richting) - trainingsdata voor het AI-model."""
    return export(get_db(), "movements", _time(start, "from"), _time(end, "to"), station, limit=limit)


@router.get("/stations")
def get_stations(tracked: bool = Query(False, description="enkel de stations die we opvolgen")):
    stations = export(get_db(), "stations")
    if tracked:
        ids = set(tracked_stations())
        stations = [s for s in stations if s["externalId"] in ids]
    return stations


@router.get("/disturbances")
def get_disturbances(station: str | None = None):
    """Actieve storingen en geplande werken."""
    return export(get_db(), "disturbances", station_id=station)


@router.post("/collect")
def post_collect(hours: int = Query(1, ge=1, le=6)):
    """Nu een ophaalronde draaien (liveboards van de opgevolgde stations + storingen)."""
    try:
        return collect(get_db(), hours=hours)
    except Exception as e:
        raise HTTPException(502, f"iRail ophalen mislukt: {e}")
