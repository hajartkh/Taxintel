#!/usr/bin/env python3
"""Schooldemo: scraper voor de UiTinVlaanderen-agenda (standaard Antwerpen).

Hoe het werkt
-------------
De pagina https://www.uitinvlaanderen.be/agenda/alle/antwerpen wordt door de
server volledig opgebouwd (Nuxt/Vue). In de HTML zit een blok
<script id="__NUXT_DATA__"> met alle evenementen als gestructureerde JSON,
inclusief exacte start- en einddatum, locatie, prijs en leeftijd. We lezen dat
blok uit in plaats van de zichtbare tekst ("Vanavond", "Meerdere data") te
ontleden. Pagina's: ?page=2, ?page=3, ... (10 evenementen per pagina).

Gebruik (alleen standaardbibliotheek, Python 3.8+):
    python uit_scraper.py                      # 3 pagina's -> uit_events.csv/.json
    python uit_scraper.py --pages 10 --sqlite uit_events.db
    python uit_scraper.py --url /agenda/alle/gent --pages 2
    python uit_scraper.py --date 2026-10-30 --pages 20            # alles wat op die dag speelt
    python uit_scraper.py --date 2026-11-07 --tot 2026-11-08      # een weekend
    python uit_scraper.py --date 2026-10-30 --alleen-start        # zonder lopende tentoonstellingen

Wees netjes voor de site: vaste pauze tussen pagina's, kleine aantallen,
robots.txt wordt eerst gelezen. Dit is bedoeld voor een schooldemo. Voor
productie gebruik je de officiële UiTdatabank-API (sleutel aanvragen via publiq).
De gegevens zijn van UiTdatabank / de organisatoren: vermeld de bron.
"""
import argparse
import csv
import html as htmllib
import json
import re
import sqlite3
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime

BASE = "https://www.uitinvlaanderen.be"
DEFAULT_PATH = "/agenda/alle/antwerpen"
UA = "Mozilla/5.0 (compatible; SchoolDemoScraper/1.0; studentenproject)"
SPECIAL = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef"}

NUXT_RE = re.compile(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', re.S)
CARD_RE = re.compile(r'<a\b[^>]*data-testid="event-search-card-link"[^>]*>')
HREF_RE = re.compile(r'href="([^"]+)"')
UUID_RE = re.compile(r"/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?]|$)")
TAG_RE = re.compile(r"<[^>]+>")

FIELDS = [
    "id", "naam", "type", "reeks", "start", "einde", "wanneer", "aantal_data",
    "locatie", "straat", "postcode", "gemeente", "organisator",
    "prijs_eur", "gratis", "leeftijd_min", "leeftijd_max",
    "status", "beschikbaarheid", "online", "url", "afbeelding", "opgehaald_op",
]


# --------------------------------------------------------------------------
# Ophalen
# --------------------------------------------------------------------------
def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "nl-BE,nl;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse_robots(text, agent="schooldemoscraper"):
    """Geeft de toepasselijke (allow/disallow, patroon)-regels volgens RFC 9309.

    Waarom niet urllib.robotparser? Die haalt het '?' weg uit 'Disallow: /agenda?'
    waardoor alles onder /agenda ten onrechte geblokkeerd lijkt. Volgens de
    standaard geldt die regel alleen voor adressen die met '/agenda?' beginnen.
    """
    groups, agents, rules, in_rules = [], [], [], False
    for line in text.splitlines():
        line = line.split("#")[0].strip()
        if ":" not in line:
            continue
        key, value = (x.strip() for x in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if in_rules:
                groups.append((agents, rules))
                agents, rules, in_rules = [], [], False
            agents.append(value.lower())
        elif key in ("allow", "disallow"):
            in_rules = True
            rules.append((key, value))
    if agents:
        groups.append((agents, rules))
    specific = [r for a, r in groups if any(x != "*" and x in agent for x in a)]
    star = [r for a, r in groups if "*" in a]
    return [rule for group in (specific or star) for rule in group]


def robots_allows(rules, path_and_query):
    """Langste overeenkomende regel wint; bij gelijkspel wint 'allow'. '*' en '$' worden ondersteund."""
    best = None  # (lengte, toegestaan)
    for kind, pattern in rules:
        if not pattern:  # lege Disallow = alles toegestaan
            continue
        rx = re.escape(pattern).replace(r"\*", ".*")
        if rx.endswith(r"\$"):
            rx = rx[:-2] + "$"
        if re.match(rx, path_and_query):
            cand = (len(pattern), kind == "allow")
            if best is None or cand[0] > best[0] or (cand[0] == best[0] and cand[1]):
                best = cand
    return True if best is None else best[1]


def load_robots():
    text = fetch(BASE + "/robots.txt")  # zelf ophalen met onze User-Agent
    return parse_robots(text), text


# --------------------------------------------------------------------------
# Het __NUXT_DATA__-blok uitpakken (devalue-formaat: een platte lijst waarin
# objecten naar elkaar verwijzen met een index)
# --------------------------------------------------------------------------
def revive(arr):
    """Pakt het devalue-formaat uit. Tolerant: onbekende types geven None of de ruwe waarde,
    nooit een fout."""
    sys.setrecursionlimit(20000)
    memo = {}
    special_numbers = {-3: float("nan"), -4: float("inf"), -5: float("-inf"), -6: -0.0}

    def tagged(v):
        """Lijst waarvan het eerste element een tekst is: ['Set', 3, 4], ['Date', '2026-..'], ..."""
        tag, rest = v[0], v[1:]
        if tag in SPECIAL or tag in ("Object", "NuxtError"):
            return r(rest[0]) if rest else None
        if tag in ("Date", "BigInt", "URL", "URLSearchParams", "RegExp"):
            return rest[0] if rest else None
        if tag == "Set":
            return [r(j) for j in rest]
        if tag == "Map":
            pairs = [(r(rest[k]), r(rest[k + 1])) for k in range(0, len(rest) - 1, 2)]
            try:
                return dict(pairs)
            except TypeError:
                return pairs
        if tag == "null":  # object zonder prototype: ['null', 'sleutel', index, ...]
            return {rest[k]: r(rest[k + 1]) for k in range(0, len(rest) - 1, 2)}
        return rest[0] if len(rest) == 1 else rest  # onbekend type: ruwe waarde

    def r(i):
        if not isinstance(i, int) or isinstance(i, bool):
            return i  # geen index maar een waarde
        if i in (-1, -2):  # undefined / gat
            return None
        if i < 0:
            return special_numbers.get(i)
        if i >= len(arr):
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str):
                out = tagged(v)
            else:
                out = []
                memo[i] = out
                for j in v:
                    out.append(r(j))
                return out
        elif isinstance(v, dict):
            out = {}
            memo[i] = out
            for k, j in v.items():
                out[k] = r(j)
            return out
        else:
            out = v
        memo[i] = out
        return out

    return r(0)


def unresolved(v):
    """True voor een Apollo-verwijzing ({'__ref': 'Place:123'}) of een lijst daarvan."""
    if isinstance(v, dict):
        return "__ref" in v
    if isinstance(v, list):
        return bool(v) and all(isinstance(x, dict) and "__ref" in x for x in v)
    return False


def is_empty(v):
    return v is None or v == [] or v == {} or v == ""


def find_events(root):
    """Alle objecten met __typename == 'Event', samengevoegd per id.

    Elk evenement staat meerdere keren in de data: een volledige kopie (zoekresultaat)
    en een kopie uit de Apollo-cache waar locatie, type en organisator alleen als
    verwijzing staan. We nemen de kopie met de minste verwijzingen als basis en vullen
    lege of onopgeloste velden aan vanuit de andere kopieën.
    """
    copies, seen, stack = {}, set(), [root]
    while stack:
        o = stack.pop()
        if isinstance(o, (dict, list)):
            if id(o) in seen:
                continue
            seen.add(id(o))
        if isinstance(o, dict):
            if o.get("__typename") == "Event" and o.get("id"):
                copies.setdefault(o["id"], []).append(o)
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
    found = {}
    for eid, group in copies.items():
        group.sort(key=lambda c: sum(1 for v in c.values() if unresolved(v)))
        base = dict(group[0])
        for other in group[1:]:
            for k, v in other.items():
                if (is_empty(base.get(k)) or unresolved(base.get(k))) and not is_empty(v) and not unresolved(v):
                    base[k] = v
        found[eid] = base
    return found


def card_links(page_html):
    """id -> relatieve url, in de volgorde van de kaartjes op de pagina."""
    links = {}
    for tag in CARD_RE.findall(page_html):
        m = HREF_RE.search(tag)
        if not m:
            continue
        href = htmllib.unescape(m.group(1))
        u = UUID_RE.search(href.split("?")[0])
        if u:
            links.setdefault(u.group(1), href)
    return links


# --------------------------------------------------------------------------
# Omzetten naar een platte rij
# --------------------------------------------------------------------------
def local_time(iso):
    """ISO-tijd -> 'YYYY-MM-DD HH:MM' in de tijdzone van je computer."""
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return iso


def get(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def to_row(e, href):
    prices = [p for p in (e.get("prices") or []) if isinstance(p, dict) and p.get("value") is not None]
    base = next((p["value"] for p in prices if p.get("category") == "base"), None)
    if base is None and prices:
        base = min(p["value"] for p in prices)
    prod = e.get("production")
    cal = e.get("calendar") or {}
    summary = TAG_RE.sub("", get(cal, "summary", "small") or "")
    images = e.get("images") or []
    main_img = next((i.get("url") for i in images if isinstance(i, dict) and i.get("isMain")), None)
    if not main_img and images and isinstance(images[0], dict):
        main_img = images[0].get("url")
    return {
        "id": e.get("id"),
        "naam": e.get("name"),
        "type": ", ".join(t.get("name", "") for t in (e.get("types") or []) if isinstance(t, dict)),
        "reeks": (prod.get("name") or prod.get("title") or "") if isinstance(prod, dict) else "",
        "start": local_time(cal.get("startDate")),
        "einde": local_time(cal.get("endDate")),
        "wanneer": summary,
        "aantal_data": len(e.get("subEvent") or []),
        "locatie": get(e, "location", "name"),
        "straat": (get(e, "location", "address", "streetAddress") or "").strip(),
        "postcode": get(e, "location", "address", "postalCode"),
        "gemeente": get(e, "location", "address", "locality"),
        "organisator": get(e, "organizer", "name"),
        "prijs_eur": base,
        "gratis": (base == 0) if base is not None else None,
        "leeftijd_min": get(e, "typicalAgeRange", "minimum"),
        "leeftijd_max": get(e, "typicalAgeRange", "maximum"),
        "status": get(e, "status", "type"),
        "beschikbaarheid": e.get("bookingAvailability"),
        "online": e.get("isOnline"),
        "url": (BASE + href) if href else "",
        "afbeelding": main_img,
        "opgehaald_op": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def parse_page(page_html):
    m = NUXT_RE.search(page_html)
    if not m:
        raise ValueError("geen __NUXT_DATA__ gevonden (pagina anders opgebouwd of toegang geweigerd)")
    root = revive(json.loads(m.group(1)))
    events = find_events(root)
    links = card_links(page_html)
    # volgorde van de kaartjes aanhouden; reeksen/overige achteraan
    ordered = [i for i in links if i in events] + [i for i in events if i not in links]
    return [to_row(events[i], links.get(i)) for i in ordered]


# --------------------------------------------------------------------------
# Opslaan
# --------------------------------------------------------------------------
def page_path(base_path, date_from, date_to, page):
    """Pad met het datumfilter van de site (?dateFrom=...&dateTo=...) en de paginanummer (&page=N)."""
    params = []
    if date_from:
        params += [f"dateFrom={date_from}", f"dateTo={date_to or date_from}"]
    if page > 1:
        params.append(f"page={page}")
    return base_path + ("?" + "&".join(params) if params else "")


def check_date(value, name):
    if value is None:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        sys.exit(f"{name} moet de vorm JJJJ-MM-DD hebben, bijvoorbeeld 2026-10-30.")
    return value


def save_csv(rows, path):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: Excel toont accenten goed
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter=";")
        w.writeheader()
        w.writerows(rows)


def save_json(rows, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)


def save_sqlite(rows, path):
    con = sqlite3.connect(path)
    cols = ", ".join(f'"{c}"' + (" TEXT PRIMARY KEY" if c == "id" else "") for c in FIELDS)
    con.execute(f"CREATE TABLE IF NOT EXISTS events ({cols})")
    ph = ", ".join("?" for _ in FIELDS)
    con.executemany(f"INSERT OR REPLACE INTO events VALUES ({ph})",
                    [tuple(r[c] for c in FIELDS) for r in rows])
    con.commit()
    n = con.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    con.close()
    return n


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=DEFAULT_PATH, help=f"pad op de site (standaard {DEFAULT_PATH})")
    ap.add_argument("--pages", type=int, default=3, help="aantal pagina's (10 evenementen per pagina, max 100)")
    ap.add_argument("--date", metavar="JJJJ-MM-DD", help="alleen evenementen die op deze dag lopen")
    ap.add_argument("--tot", metavar="JJJJ-MM-DD", help="einddatum van een periode (samen met --date)")
    ap.add_argument("--alleen-start", action="store_true",
                    help="bewaar alleen evenementen waarvan de startdatum in de gekozen dag/periode valt")
    ap.add_argument("--delay", type=float, default=2.0, help="seconden pauze tussen pagina's (min 1)")
    ap.add_argument("--out", default="uit_events", help="bestandsnaam zonder extensie")
    ap.add_argument("--sqlite", metavar="BESTAND", help="bewaar ook in een SQLite-database")
    ap.add_argument("--debug", action="store_true", help="toon fout-details en bewaar de ruwe pagina bij een fout")
    args = ap.parse_args()
    args.pages = max(1, min(args.pages, 100))
    args.delay = max(1.0, args.delay)
    date_from = check_date(args.date, "--date")
    date_to = check_date(args.tot, "--tot")
    if date_to and not date_from:
        sys.exit("--tot werkt alleen samen met --date.")
    if date_from and date_to and date_to < date_from:
        sys.exit("--tot mag niet vóór --date liggen.")
    if args.alleen_start and not date_from:
        sys.exit("--alleen-start werkt alleen samen met --date.")
    if date_from and args.out == "uit_events":
        args.out = f"uit_events_{date_from}" + (f"_tot_{date_to}" if date_to else "")

    try:
        rules, robots_text = load_robots()
    except Exception as e:
        sys.exit(f"robots.txt kon niet gelezen worden ({e}). Ik stop liever dan te raden.")

    rows, seen = [], set()
    for p in range(1, args.pages + 1):
        path = page_path(args.url, date_from, date_to, p)
        url = BASE + path
        if not robots_allows(rules, path):
            print(f"robots.txt verbiedt {path}, gestopt.")
            print("\nDit is de robots.txt zoals ons script die ontvangt:\n" + "-" * 40)
            print(robots_text[:2500])
            print("-" * 40)
            break
        page = None
        try:
            page = fetch(url)
            found = parse_page(page)
        except urllib.error.HTTPError as e:
            print(f"Pagina {p}: HTTP {e.code} voor {url}, gestopt.")
            break
        except Exception as e:
            print(f"Pagina {p}: {e}, gestopt.")
            if args.debug:
                traceback.print_exc()
                if page:
                    with open("uit_debug_pagina.html", "w", encoding="utf-8") as f:
                        f.write(page)
                    print("Ruwe pagina bewaard als uit_debug_pagina.html")
            break
        new = [r for r in found if r["id"] not in seen]
        if not new:
            print(f"Pagina {p}: geen nieuwe evenementen, einde van de lijst.")
            break
        seen.update(r["id"] for r in new)
        rows.extend(new)
        print(f"Pagina {p}: {len(new)} evenementen (totaal {len(rows)})")
        if p < args.pages:
            time.sleep(args.delay)

    if rows and args.alleen_start:
        last = date_to or date_from
        before = len(rows)
        rows = [r for r in rows if date_from <= (r["start"] or "")[:10] <= last]
        print(f"--alleen-start: {len(rows)} van {before} evenementen beginnen in die periode")
    if not rows:
        sys.exit("Niets opgehaald.")
    save_csv(rows, args.out + ".csv")
    save_json(rows, args.out + ".json")
    print(f"Opgeslagen: {args.out}.csv en {args.out}.json ({len(rows)} rijen)")
    if args.sqlite:
        print(f"SQLite: {args.sqlite} bevat nu {save_sqlite(rows, args.sqlite)} evenementen")
    print("\nVoorbeeld:")
    for r in rows[:3]:
        print(f"  {r['start']}  {r['naam']}  @ {r['locatie']}, {r['gemeente']}  ({r['prijs_eur']} EUR)")


if __name__ == "__main__":
    main()
