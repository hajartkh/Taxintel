"""Dunne client voor de iRail API (https://docs.irail.be/) - live NMBS-treindata.

iRail vraagt een herkenbare User-Agent en max ~3 requests/seconde.
"""

import os
import time
from datetime import datetime

import httpx

BASE_URL = "https://api.irail.be/v1"
USER_AGENT = os.environ.get("IRAIL_USER_AGENT") or "TaxIntel/0.1 (AP Hogeschool - AI for Business)"
MIN_INTERVAL = 0.35  # seconden tussen requests (rate limit 3/s)


class IRailClient:
    def __init__(self, lang: str = "nl", timeout: float = 20):
        self.lang = lang
        self._http = httpx.Client(
            base_url=BASE_URL,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=timeout,
            follow_redirects=True,
        )
        self._last_request = 0.0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._http.close()

    def _get(self, path: str, **params) -> dict:
        params = {"format": "json", "lang": self.lang, **{k: v for k, v in params.items() if v is not None}}
        for attempt in range(3):
            wait = MIN_INTERVAL - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            self._last_request = time.monotonic()
            response = self._http.get(path, params=params)
            if response.status_code == 429:  # rate limited: even wachten en opnieuw
                time.sleep(2 * (attempt + 1))
                continue
            response.raise_for_status()
            return response.json()
        response.raise_for_status()
        return response.json()

    def stations(self) -> list[dict]:
        return self._get("/stations/")["station"]

    def liveboard(self, station_id: str, arrdep: str = "departure", at: datetime | None = None) -> dict:
        """Aankomsten of vertrekken in een station vanaf `at` (lokale Belgische tijd), standaard nu.

        Een 404 betekent meestal 'geen treinen in dit venster' (bv. 's nachts) -> lege lijst.
        """
        try:
            return self._get(
                "/liveboard/",
                id=station_id,
                arrdep=arrdep,
                date=at.strftime("%d%m%y") if at else None,
                time=at.strftime("%H%M") if at else None,
                alerts="false",
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return {}
            raise

    def disturbances(self) -> list[dict]:
        return self._get("/disturbances/", lineBreakCharacter="\n").get("disturbance", [])
