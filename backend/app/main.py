"""TaxIntel API."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.api import irail
from app.db import get_db
from app.irail.collector import collect

log = logging.getLogger("uvicorn.error")
IRAIL_EVERY_MIN = float(os.environ.get("IRAIL_COLLECT_EVERY_MIN", "0"))  # 0 = geen automatische ophaling


async def irail_loop() -> None:
    """Haalt periodiek iRail-data op zodat trainMovements een historiek opbouwt."""
    while True:
        try:
            stats = await run_in_threadpool(collect, get_db(), None, 2)
            log.info("iRail: %s", stats)
        except Exception as e:
            log.warning("iRail ophalen mislukt: %s", e)
        await asyncio.sleep(IRAIL_EVERY_MIN * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(irail_loop()) if IRAIL_EVERY_MIN > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="TaxIntel API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:4200").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(irail.router)


@app.get("/health")
def health():
    get_db().command("ping")
    return {"status": "ok"}
