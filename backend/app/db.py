"""MongoDB-verbinding (MONGO_URI / MONGO_DB uit docker-compose of .env)."""

import os
from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database


@lru_cache
def get_db() -> Database:
    client = MongoClient(os.environ["MONGO_URI"], tz_aware=True)
    return client[os.environ.get("MONGO_DB", "taxintel")]
