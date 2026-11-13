"""Hotspot-model (pure functies, geen database): bronnen -> heatmap op H3-grid -> clusters -> score.

Uitleg en keuzes: notes.md
"""

from collections import Counter
from dataclasses import dataclass
from math import asin, ceil, cos, exp, radians, sin, sqrt

import h3

RESOLUTION = 9  # H3-cel van ~0,1 km2 (rand ~175 m)
CELL_SPACING_M = sqrt(3) * h3.average_hexagon_edge_length(RESOLUTION, "m")  # afstand tussen buurcellen
THRESHOLD = 0.25  # cel hoort bij een hotspot vanaf 25% van de drukste cel...
MIN_CELL_DEMAND = 0.5  # ...en minstens zoveel punten
SCORE_SCALE = 20.0  # score = 1 - e^(-vraag/20): 20 punten ~ 0.63, 60 punten ~ 0.95
ABOVE_NORMAL_Z = 1.5


@dataclass
class Source:
    kind: str  # "station" | "event"
    id: str
    name: str
    lng: float
    lat: float
    points: float  # verwachte vraag in punten (zie sources.py)
    sigma_m: float  # hoe ver de reizigers/bezoekers zich verspreiden


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine-afstand in meter."""
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(a))


def heatmap(sources: list[Source]) -> dict[str, dict]:
    """Kernel density: elke bron verdeelt haar punten over de cellen rond zich met een Gauss-kern.

    De gewichten worden genormaliseerd, dus de som over alle cellen = de punten van de bron.
    Resultaat: cel -> {"demand": float, "sources": {bron-id: bijdrage}}
    """
    heat: dict[str, dict] = {}
    for s in sources:
        if s.points <= 0:
            continue
        center = h3.latlng_to_cell(s.lat, s.lng, RESOLUTION)
        k = max(1, ceil(3 * s.sigma_m / CELL_SPACING_M))  # tot 3 sigma
        weights = {}
        for cell in h3.grid_disk(center, k):
            d = distance_m(s.lat, s.lng, *h3.cell_to_latlng(cell))
            weights[cell] = exp(-0.5 * (d / s.sigma_m) ** 2)
        total = sum(weights.values())
        for cell, w in weights.items():
            part = s.points * w / total
            entry = heat.setdefault(cell, {"demand": 0.0, "sources": Counter()})
            entry["demand"] += part
            entry["sources"][s.id] += part
    return heat


def find_hotspots(heat: dict[str, dict]) -> list[dict]:
    """Clustering: aaneengesloten 'hete' cellen vormen samen 1 hotspot (flood fill over H3-buren)."""
    if not heat:
        return []
    top = max(e["demand"] for e in heat.values())
    hot = {c for c, e in heat.items() if e["demand"] >= max(THRESHOLD * top, MIN_CELL_DEMAND)}

    spots, seen = [], set()
    for start in hot:
        if start in seen:
            continue
        cells, todo = [], [start]
        seen.add(start)
        while todo:
            cell = todo.pop()
            cells.append(cell)
            for n in h3.grid_ring(cell, 1):
                if n in hot and n not in seen:
                    seen.add(n)
                    todo.append(n)
        spots.append(_summarize(cells, heat))
    return sorted(spots, key=lambda s: s["demand"], reverse=True)


def _summarize(cells: list[str], heat: dict[str, dict]) -> dict:
    demand = sum(heat[c]["demand"] for c in cells)
    sources = sum((heat[c]["sources"] for c in cells), Counter())
    centers = {c: h3.cell_to_latlng(c) for c in cells}
    lat = sum(centers[c][0] * heat[c]["demand"] for c in cells) / demand  # zwaartepunt van de vraag
    lng = sum(centers[c][1] * heat[c]["demand"] for c in cells) / demand
    radius = max(distance_m(lat, lng, *p) for p in centers.values()) + CELL_SPACING_M / 2
    return {"cells": cells, "lat": lat, "lng": lng, "radiusM": round(radius), "demand": demand, "sources": sources}


def cell_demand(heat: dict[str, dict], cells: list[str]) -> float:
    return sum(heat[c]["demand"] for c in cells if c in heat)


def score(demand: float, drivers: int) -> float:
    """Vraag gedeeld door het aanbod (taxi's die er al staan), afgevlakt naar 0..1."""
    return 1 - exp(-(demand / (drivers + 1)) / SCORE_SCALE)


def level(value: float) -> str:
    return "high" if value >= 0.66 else "medium" if value >= 0.33 else "low"


def z_score(current: float, history: list[float]) -> float | None:
    """Hoeveel drukker dan normaal (zelfde weekdag en uur, vorige weken)? None = te weinig historiek."""
    if sum(1 for h in history if h > 0) < 2:
        return None
    mean = sum(history) / len(history)
    std = sqrt(sum((h - mean) ** 2 for h in history) / len(history))
    return round((current - mean) / max(std, 1.0), 2)  # std >= 1 punt: geen extreme z bij bijna-constante historiek
