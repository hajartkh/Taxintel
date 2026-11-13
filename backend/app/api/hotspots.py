"""REST-endpoint voor de hotspot-voorspelling."""

from fastapi import APIRouter, HTTPException, Query

from app.db import get_db
from app.hotspots import predict
from app.irail.crowding import jsonable
from app.irail.export import TIME_HELP, parse_time

router = APIRouter(prefix="/hotspots", tags=["Hotspots (AI)"])


@router.get("")
def get_hotspots(
    start: str = Query("now", alias="from", description=TIME_HELP),
    end: str = Query("+1h", alias="to", description=TIME_HELP),
    history: int = Query(4, ge=0, le=12, description="aantal vorige weken voor 'drukker dan normaal'"),
    save: bool = Query(False, description="opslaan in hotspotPredictions"),
):
    """Hotspots in het venster: score 0..1 (vraag / aanbod), uitleg per bron, en een heatmap per H3-cel."""
    try:
        start_dt, end_dt = parse_time(start), parse_time(end)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if end_dt <= start_dt:
        raise HTTPException(422, "'to' moet na 'from' liggen")
    return jsonable(predict(get_db(), start_dt, end_dt, history, save))
