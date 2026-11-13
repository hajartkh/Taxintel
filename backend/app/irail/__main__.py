"""CLI voor de iRail-koppeling.

Gebruik (in de backend-container: docker compose exec backend python -m app.irail ...):
    python -m app.irail collect                      # 1 ophaalronde -> MongoDB
    python -m app.irail collect --hours 3 --every 15 # elke 15 min, telkens de komende 3 uur
    python -m app.irail collect --dry-run --out movements.json   # zonder MongoDB, enkel JSON
    python -m app.irail stations                     # stationslijst (opnieuw) in transitHubs zetten
    python -m app.irail export crowding --out crowding.json --bucket 30 --from -1h --to +3h
    python -m app.irail export movements --station BE.NMBS.008821006 --out antwerpen.json
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone

from .client import IRailClient
from .collector import collect, fetch_movements, fetch_stations, save_stations, tracked_stations
from .crowding import jsonable
from .export import KINDS, TIME_HELP, export, parse_time


def write(data, out: str | None) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"{len(data)} records geschreven naar {out}", file=sys.stderr)
    else:
        print(text)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.irail", description="iRail (NMBS) -> MongoDB / JSON")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("collect", help="liveboards + storingen ophalen")
    p.add_argument("--stations", help="komma-gescheiden station-ids (standaard IRAIL_STATIONS of de ingebouwde lijst)")
    p.add_argument("--hours", type=int, default=1, help="hoeveel uur vooruit (1 liveboard-call per uur per richting)")
    p.add_argument("--every", type=float, help="herhaal elke N minuten")
    p.add_argument("--dry-run", action="store_true", help="niet in MongoDB schrijven")
    p.add_argument("--out", help="schrijf opgehaalde treinbewegingen naar JSON (enkel met --dry-run)")

    p = sub.add_parser("stations", help="stationslijst in transitHubs zetten")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--out")

    p = sub.add_parser("export", help="data uit MongoDB als JSON")
    p.add_argument("kind", choices=KINDS)
    p.add_argument("--from", dest="start", type=parse_time, help=TIME_HELP)
    p.add_argument("--to", dest="end", type=parse_time, help=TIME_HELP)
    p.add_argument("--station", help="station-id, bv. BE.NMBS.008821006")
    p.add_argument("--bucket", type=int, default=60, help="minuten per tijdvenster (crowding)")
    p.add_argument("--limit", type=int, default=5000, help="max records (movements)")
    p.add_argument("--out")

    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    if args.cmd == "stations":
        with IRailClient() as client:
            hubs = fetch_stations(client)
        if args.dry_run:
            write(jsonable(hubs), args.out)
        else:
            from app.db import get_db

            save_stations(get_db(), hubs)
            print(f"{len(hubs)} stations in transitHubs", file=sys.stderr)

    elif args.cmd == "collect":
        station_ids = args.stations.split(",") if args.stations else tracked_stations()
        if args.dry_run:
            with IRailClient() as client:
                write(jsonable(fetch_movements(client, station_ids, args.hours)), args.out)
            return
        from app.db import get_db

        while True:
            try:
                stats = collect(get_db(), station_ids, args.hours)
                print(f"{datetime.now(timezone.utc):%H:%M:%S} {stats}", file=sys.stderr)
            except Exception as e:  # bij --every niet stoppen op een tijdelijke fout
                if not args.every:
                    raise
                print(f"fout: {e}", file=sys.stderr)
            if not args.every:
                break
            time.sleep(args.every * 60)

    elif args.cmd == "export":
        from app.db import get_db

        write(export(get_db(), args.kind, args.start, args.end, args.station, args.bucket, args.limit), args.out)


if __name__ == "__main__":
    main()
