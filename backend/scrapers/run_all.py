#!/usr/bin/env python3
"""Haalt alle bronnen op, maakt de data schoon en zet ze in MongoDB. Eenmalig of als lus.

    python run_all.py --eenmalig            # alles nu ophalen (UiT, allevents, Ticketmaster), opschonen, laden
    python run_all.py                       # blijft draaien; elke bron op zijn eigen tempo
    python run_all.py --ronde               # eenmaal controleren wat aan de beurt is (voor de taakplanner)
    python run_all.py --status              # wat is wanneer voor het laatst gelopen
    python run_all.py --droog               # niets ophalen; pipeline op bestaande ruwe data + laden als test
    python run_all.py --eenmalig --alleen ticketmaster

Tempo per bron (aanpasbaar met --elke-uit/--elke-allevents/--elke-ticketmaster, in uren):
    Ticketmaster elke 6 u, allevents elke 12 u, UiT elke 24 u (dat zijn ~100 aanvragen per ronde, dus spaarzaam).

Een mislukte bron stopt de rest niet: dan blijft het vorige ruwe bestand in data/ gelden. Alles wordt gelogd
in data/run.log. Er draait nooit twee keer tegelijk (lockbestand). Sleutels komen uit .env en worden niet gelogd.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    BRU = ZoneInfo("Europe/Brussels")
except Exception:
    sys.exit("Installeer tzdata: pip install tzdata")

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
STATE = DATA / "state.json"
LOCK = DATA / "run.lock"
LOGFILE = DATA / "run.log"
PY = sys.executable
UIT_WINDOWS = [(0, 13), (14, 44), (45, 89)]       # dagen vanaf vandaag; elk venster max 60 pagina's x 10 events


def log(msg):
    line = f"{datetime.now(BRU):%Y-%m-%d %H:%M:%S}  {msg}"
    print(line, flush=True)
    DATA.mkdir(exist_ok=True)
    with open(LOGFILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(args, timeout):
    """Subproces draaien; geeft (returncode, laatste regels uitvoer)."""
    try:
        r = subprocess.run([PY, *map(str, args)], cwd=HERE, capture_output=True, text=True, timeout=timeout,
                           encoding="utf-8", errors="replace")
        tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-6:])
        return r.returncode, tail
    except subprocess.TimeoutExpired:
        return 124, "time-out"


# ----------------------------------------------------------------------------- bronnen
def fetch_ticketmaster():
    return run(["fetch_sources.py", "ticketmaster", "--dagen", "120"], 900)


def fetch_allevents():
    return run(["fetch_sources.py", "allevents", "--paginas", "20"], 900)


def fetch_uit():
    today = datetime.now(BRU).date()
    rows, last = {}, (0, "")
    for a, b in UIT_WINDOWS:
        out = DATA / f"uit_{a}_{b}"
        rc, tail = run(["uit_scraper.py", "--date", str(today + timedelta(a)), "--tot", str(today + timedelta(b)),
                        "--alleen-start", "--pages", "60", "--delay", "2", "--out", str(out)], 1800)
        last = (rc, tail)
        f = out.with_suffix(".json")
        if rc == 0 and f.exists():
            for r in json.loads(f.read_text(encoding="utf-8")):
                rows[r["id"]] = r
        else:
            log(f"  UiT venster {a}-{b} mislukt: {tail.splitlines()[-1] if tail else rc}")
    if not rows:
        return 1, last[1]
    (DATA / "raw_uit.json").write_text(json.dumps(list(rows.values()), ensure_ascii=False, indent=1), encoding="utf-8")
    return 0, f"{len(rows)} unieke UiT-events"


SOURCES = {"ticketmaster": (fetch_ticketmaster, 6), "allevents": (fetch_allevents, 12), "uit": (fetch_uit, 24)}


# ----------------------------------------------------------------------------- hoofdrun
def load_state():
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(s):
    DATA.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(s, indent=1), encoding="utf-8")


def lock():
    DATA.mkdir(exist_ok=True)
    if LOCK.exists() and time.time() - LOCK.stat().st_mtime < 3 * 3600:
        return False
    LOCK.write_text(str(os.getpid()))
    return True


def process_and_load(droog):
    args = ["events_pipeline.py"] + ([] if droog else ["--geocode"])
    for flag, name in (("--uit", "raw_uit.json"), ("--allevents", "raw_allevents.json"), ("--ticketmaster", "raw_ticketmaster.json")):
        if (DATA / name).exists():
            args += [flag, f"data/{name}"]
    if not any(x.startswith("data/") for x in args):
        log("Geen ruwe data aanwezig; niets te verwerken.")
        return False
    rc, tail = run(args, 3600)
    log("Pipeline: " + " | ".join(tail.splitlines()[-4:]).replace("\n", " "))
    if rc != 0:
        log("Pipeline mislukt; niets geladen.")
        return False
    rc, tail = run(["load_mongo.py", *(["--dry-run"] if droog else [])], 900)
    log("Laden: " + tail.splitlines()[-1] if tail else f"Laden rc={rc}")
    return rc == 0


def ronde(only=None, force=False, droog=False, intervals=None):
    if not lock():
        log("Er draait al een ronde (lockbestand jonger dan 3 u); overgeslagen.")
        return
    try:
        state, now, changed = load_state(), time.time(), False
        for name, (fn, hours) in SOURCES.items():
            if only and name != only:
                continue
            every = (intervals or {}).get(name, hours) * 3600
            if droog or not (force or now - state.get(name, 0) >= every):
                continue
            log(f"Ophalen: {name}")
            rc, tail = fn()
            if rc == 0:
                state[name] = time.time()
                changed = True
                log(f"  {name} gelukt: {tail.splitlines()[-1] if tail else ''}")
            else:
                log(f"  {name} MISLUKT (rc={rc}): {' / '.join(tail.splitlines()[-2:])}")
            save_state(state)
        if changed or droog or not (HERE / "events_clean.json").exists():
            process_and_load(droog)
        else:
            log("Niets was aan de beurt.")
    finally:
        LOCK.unlink(missing_ok=True)


def status():
    s = load_state()
    for name, (_, hours) in SOURCES.items():
        t = s.get(name)
        print(f"{name:13} " + (f"laatst {datetime.fromtimestamp(t, BRU):%Y-%m-%d %H:%M}  (elke {hours} u)" if t else "nog nooit"))
    for n in ("raw_uit.json", "raw_allevents.json", "raw_ticketmaster.json"):
        f = DATA / n
        if f.exists():
            print(f"  {n:24} {datetime.fromtimestamp(f.stat().st_mtime, BRU):%Y-%m-%d %H:%M}  {f.stat().st_size // 1024} kB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eenmalig", action="store_true", help="eenmaal alles ophalen en laden, dan stoppen")
    ap.add_argument("--alleen", choices=list(SOURCES), help="alleen deze bron ophalen")
    ap.add_argument("--ronde", action="store_true", help="eenmaal controleren wat aan de beurt is (voor de Windows-taakplanner)")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--droog", action="store_true", help="niets ophalen; pipeline + load --dry-run")
    ap.add_argument("--check-elke", type=int, default=10, help="minuten tussen controles in de lus")
    for n, (_, h) in SOURCES.items():
        ap.add_argument(f"--elke-{n}", type=float, default=h, help=f"uren tussen {n}-rondes (standaard {h})")
    a = ap.parse_args()
    if a.status:
        return status()
    intervals = {n: getattr(a, f"elke_{n}") for n in SOURCES}
    if a.ronde:
        return ronde(a.alleen, intervals=intervals)
    if a.eenmalig or a.droog:
        return ronde(a.alleen, force=True, droog=a.droog, intervals=intervals)
    log("Lus gestart (Ctrl+C om te stoppen).")
    try:
        while True:
            ronde(a.alleen, intervals=intervals)
            time.sleep(a.check_elke * 60)
    except KeyboardInterrupt:
        log("Gestopt.")


if __name__ == "__main__":
    main()
