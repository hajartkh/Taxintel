#!/usr/bin/env python3
"""Schrijft events_clean.json naar de `events`-collectie van Taxintel (upsert, geen dubbels).

    python load_mongo.py --dry-run                     # toont wat er zou gebeuren
    python load_mongo.py                               # MONGO_URI uit omgeving of .env
    python load_mongo.py --uri "mongodb://user:pass@localhost:27017/taxintel?authSource=taxintel"

Voorwaarde: voer eerst database/migrations/02-event-sources.js uit, anders weigert de validator de nieuwe
`source`-waarden. Lokaal draai je buiten Docker: gebruik host `localhost` (poort 27017 staat open op 127.0.0.1);
binnen de backend-container is het `mongo`.

Werking per document:
  * upsert op (source, externalId) - de unieke index van het schema
  * als een event vroeger los is opgeslagen en nu als dubbel in een ander event is opgegaan, wordt het losse
    document verwijderd (anders krijg je alsnog dubbels in de kaart/kalender)
"""
import argparse
import json
import os
import pathlib
import sys
from datetime import datetime, timezone

DATE_FIELDS = ("startsAt", "endsAt", "fetchedAt")


def mongo_uri():
    if os.environ.get("MONGO_URI"):
        return os.environ["MONGO_URI"]
    for d in [pathlib.Path.cwd(), *pathlib.Path(__file__).resolve().parents]:
        f = d / ".env"
        if f.is_file():
            env = {}
            for line in f.read_text(encoding="utf-8-sig").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
            if env.get("MONGO_URI"):
                return env["MONGO_URI"]
            if env.get("MONGO_APP_USER") and env.get("MONGO_APP_PASSWORD"):
                from urllib.parse import quote_plus
                db = env.get("MONGO_DB", "taxintel")
                return (f"mongodb://{quote_plus(env['MONGO_APP_USER'])}:{quote_plus(env['MONGO_APP_PASSWORD'])}"
                        f"@localhost:27017/{db}?authSource={db}")
    sys.exit("Geen MONGO_URI gevonden (omgevingsvariabele, .env of --uri).")


def to_mongo(doc):
    d = {k: v for k, v in doc.items() if v is not None}          # null mag niet bij velden met een vast type
    d["sources"] = [{k: v for k, v in s.items() if v is not None} for s in d.get("sources", [])]
    for k in DATE_FIELDS:
        if d.get(k):
            d[k] = datetime.fromisoformat(d[k].replace("Z", "+00:00")).astimezone(timezone.utc)
    d["venue"]["location"]["coordinates"] = [float(x) for x in d["venue"]["location"]["coordinates"]]
    d["raw"] = {str(k): v for k, v in (d.get("raw") or {}).items()}
    return d


def plan(docs):
    """-> (upserts, verouderde (source, externalId) die nu als dubbel opgaan in een ander document)."""
    primaries = {(d["source"], d["externalId"]) for d in docs}
    absorbed = {(s["source"], s["externalId"]) for d in docs for s in d["sources"]} - primaries
    return [to_mongo(d) for d in docs], absorbed


def load(collection, docs, dry_run=False):
    ups, absorbed = plan(docs)
    if dry_run:
        return {"upserts": len(ups), "te_verwijderen_dubbels": len(absorbed)}
    from pymongo import UpdateOne
    res = collection.bulk_write([UpdateOne({"source": d["source"], "externalId": d["externalId"]}, {"$set": d}, upsert=True)
                                 for d in ups], ordered=False)
    deleted = 0
    if absorbed:
        deleted = collection.delete_many({"$or": [{"source": s, "externalId": i} for s, i in absorbed]}).deleted_count
    return {"nieuw": res.upserted_count, "bijgewerkt": res.modified_count, "dubbels_opgeruimd": deleted}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default="events_clean.json")
    ap.add_argument("--uri")
    ap.add_argument("--collection", default="events")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    docs = json.loads(pathlib.Path(a.input).read_text(encoding="utf-8"))
    if a.dry_run:
        print(load(None, docs, dry_run=True))
        return
    from pymongo import MongoClient
    client = MongoClient(a.uri or mongo_uri(), serverSelectionTimeoutMS=8000)
    db = client.get_default_database(default="taxintel")
    print(f"{len(docs)} events -> {db.name}.{a.collection}")
    print(load(db[a.collection], docs))


if __name__ == "__main__":
    main()
