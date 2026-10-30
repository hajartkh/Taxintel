#!/usr/bin/env python3
"""Normaliseren, opschonen en ontdubbelen van events uit meerdere bronnen (alleen Antwerpen).

Bronnen:  uitinvlaanderen | allevents | ticketmaster | eventbrite
Invoer:   ruwe bestanden uit fetch_sources.py (en uit de UiT-scraper)
Uitvoer:  events_clean.json     documenten in het `events`-formaat van Taxintel (datums als ISO-tekst)
          events_rejected.json  events die niet bruikbaar zijn (bv. geen coordinaten) + reden
          dedupe_report.csv     welke events als dubbel (merged) of twijfelgeval (maybe) gezien zijn

Gebruik:
    python events_pipeline.py --uit uit_events.json --allevents data/raw_allevents.json \
        --ticketmaster data/raw_ticketmaster.json --eventbrite data/raw_eventbrite.json
    (elke bron is optioneel; --geocode zoekt ontbrekende UiT-coordinaten op via Geopunt)
"""
import argparse
import csv
import difflib
import html
import json
import math
import pathlib
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    BRU = ZoneInfo("Europe/Brussels")
except Exception:  # Windows zonder tzdata
    sys.exit("Tijdzonedata ontbreekt. Installeer met: pip install tzdata")

UTC = timezone.utc
GEO_FAIL = object()                # geocoder tijdelijk onbereikbaar: niets in de cache bewaren
CENTROID = (51.219448, 4.402464)   # allevents zet hier "Antwerpen als geheel" neer als het adres onbekend is
GENERIC = {"antwerp", "antwerpen", "belgium", "belgie", "be", "an"}
SRC_RANK = {"ticketmaster": 0, "uitinvlaanderen": 1, "eventbrite": 2, "allevents": 3}
# Automatisch gegenereerde "kopieen" op allevents (zelfde concert onder een andere uitgever)
AGGREGATORS = {"concert tracker", "beat curator", "melody mapper", "sound curator", "feverup events",
               "fever", "the pulse hub", "stage magic", "rewind festival ltd"}
VENUE_ALIAS = {"afas dome": "sportpaleis", "sportpalais arena": "sportpaleis", "bar trix": "trix",
               "arenbergschouwburg": "arenberg"}
STOP = set("""in at de het een the live tour tickets ticket concert show invites invite presents with met en and
op aan of van voor for from feat ft support by tba extra afas dome candlelight""".split())
STREET_SUFFIX = re.compile(r"(straat|laan|plein|plaats|kaai|weg|singel|rui|dok|markt|lei|steenweg)$", re.I)


# ----------------------------------------------------------------------------- tekst
def strip_diac(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def clean(s):
    s = html.unescape(str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) not in ("So", "Cf", "Cs", "Co", "Sk"))
    s = re.sub(r"\s+", " ", s)
    return s.strip(" -–—|•·,:")


FLAG_RX = [("soldOut", r"uitverkocht|sold[\s-]*out|ausverkauft"),
           ("lastTickets", r"laatste\s+tickets|last\s+tickets|few\s+tickets\s+left")]


def title_and_flags(raw):
    t, flags = clean(raw), []
    for name, pat in FLAG_RX:
        rx = re.compile(r"\s*[-–—|(\[]*\s*\b(?:%s)\b\s*[!)\]]*" % pat, re.I)
        if rx.search(t):
            flags.append(name)
            t = rx.sub(" ", t)
    t = re.sub(r"\s*[-–—]\s*tickets$", "", clean(t), flags=re.I)
    if re.search(r"extra\s+show", t, re.I):
        flags.append("extraShow")
    return clean(t), flags


def parts(s):
    out = []
    for p in re.split(r",|//", s or ""):
        p = clean(p)
        if p and strip_diac(p) not in GENERIC and not re.fullmatch(r"bus\s*\S+", p, re.I):
            out.append(p)
    return out


def place(loc, street):
    """Haal (venue_naam, adres, postcode) uit rommelige locatievelden."""
    name = addr = pc = None
    for src, s in (("loc", loc), ("street", street)):
        for p in parts(s):
            m = re.fullmatch(r"(\d{4})(?:\s+\D+)?", p)
            if m:
                pc = pc or m.group(1)
                continue
            if re.search(r"\d", p):
                m2 = re.search(r"\s(\d{4})(?:\s+\D+)?$", p)
                if m2:
                    pc = pc or m2.group(1)
                    p = p[:m2.start()]
                addr = addr or p
            elif src == "loc" and name is None:
                if STREET_SUFFIX.search(p):
                    addr = addr or p        # "Theaterplein" is een straat, geen zaalnaam
                else:
                    name = p
    if name and not vkey(name):
        name = None
    full = f"{addr}, {pc} Antwerpen" if addr and pc else addr
    return name, full, pc


def vkey(name):
    toks = [t for t in re.findall(r"[a-z0-9]+", strip_diac(name)) if t not in GENERIC]
    k = " ".join(toks)
    return VENUE_ALIAS.get(k, k)


def ttoks(title, venue):
    vt = set(vkey(venue).split())
    seen, out = set(), []
    for w in re.findall(r"[a-z0-9]+", strip_diac(title)):
        if w in STOP or w in GENERIC or w.isdigit() or len(w) < 2 or w in vt or w in seen:
            continue
        seen.add(w)
        out.append(w)
    return tuple(out)


def haversine_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def iso(dt):
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


# ----------------------------------------------------------------------------- categorie
def cat_from_allevents(cats, title):
    c = {strip_diac(x) for x in cats or []}
    if re.search(r"\b(beurs|fair|markt)\b", strip_diac(title)):
        return "beurs"
    for out, keys in (("uitgaan", {"raves", "parties", "dance", "halloween-parties"}),
                      ("beurs", {"exhibitions"}),
                      ("concert", {"concerts", "music", "live-music", "candlelight-concerts", "pop", "jazz"}),
                      ("theater", {"theatre", "comedy", "performances", "storytelling", "arts & theatre"}),
                      ("festival", {"festivals"}), ("familie", {"kids"}), ("film", {"film"})):
        if c & keys:
            return out
    return "overig"


UIT_CAT = {"concert": "concert", "festival": "festival", "festiviteit": "festival", "beurs": "beurs",
           "theatervoorstelling": "theater", "dansvoorstelling": "theater", "film": "film",
           "tentoonstelling": "expo", "sportactiviteit": "sport", "sportwedstrijd": "sport",
           "lezing of congres": "lezing", "kamp of vakantie": "kamp", "cursus met open sessies": "cursus",
           "lessenreeks": "cursus", "begeleide uitstap of rondleiding": "rondleiding", "spel of quiz": "spel"}
TM_CAT = {"music": "concert", "sports": "sport", "arts & theatre": "theater", "film": "film", "miscellaneous": "overig"}


# ----------------------------------------------------------------------------- bron -> intern record
class Rec:
    def __init__(self, **kw):
        self.flags = []
        self.price = None
        self.organizer = None
        self.district = None
        self.address = None
        self.end = None
        self.lat = self.lon = None
        self.precise = False
        self.venue = None
        self.locsrc = None
        self.time_known = True
        self.__dict__.update(kw)

    @property
    def org_key(self):
        return strip_diac(self.organizer or "")


def parse_utc(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


def fix_end(start, end, rec_flags):
    if not end or end <= start:
        return None
    if end - start > timedelta(days=7):      # looptijd van maanden = reeks, geen enkel event
        rec_flags.append("series")
        return None
    return end


def from_uit(r):
    start = datetime.strptime(r["start"], "%Y-%m-%d %H:%M").replace(tzinfo=BRU).astimezone(UTC)
    title, flags = title_and_flags(r["naam"])
    loc = clean(r.get("locatie"))
    name = loc.split(" - ", 1)[1] if " - " in loc else loc
    gem = r.get("gemeente") or ""
    district = None
    m = re.match(r"(.+?)\s*\((.+)\)", gem)
    if m:
        district, city = re.sub(r"\s+\d+$", "", m.group(1)).strip(), m.group(2)
    else:
        city = re.sub(r"\s+\d+$", "", gem).strip()
    straat = clean(r.get("straat"))
    if r.get("postcode"):
        straat = re.sub(r"\s+%s$" % re.escape(str(r["postcode"])), "", straat)
    straat = re.sub(r"(\d+[a-zA-Z]?)\s*-\s*\d+[a-zA-Z]?\b", r"\1", straat)
    end = fix_end(start, datetime.strptime(r["einde"], "%Y-%m-%d %H:%M").replace(tzinfo=BRU).astimezone(UTC)
                  if r.get("einde") else None, flags)
    if district and strip_diac(district) in GENERIC:
        district = None
    rec = Rec(source="uitinvlaanderen", id=str(r["id"]), title=title, start=start, end=end,
              venue=clean(name) or None, address=f"{straat}, {r.get('postcode')} {city}" if straat else None,
              city=city or "Antwerpen", district=district, organizer=clean(r.get("organisator")) or None,
              category=UIT_CAT.get(strip_diac(r.get("type")), "overig"), url=(r.get("url") or "").split("?")[0] or None, raw=r)
    rec.flags += flags
    rec.time_known = start.astimezone(BRU).strftime("%H:%M") != "00:00"
    if r.get("online"):
        rec.flags.append("online")
    if r.get("beschikbaarheid") == "soldout" or r.get("status") == "SoldOut":
        rec.flags.append("soldOut")
    if r.get("prijs_eur") is not None:
        rec.price = {"min": r["prijs_eur"], "currency": "EUR"}
    rec.uit_addr = (r.get("straat") or "", str(r.get("postcode") or ""), r.get("gemeente") or "")
    if r.get("lat") and r.get("lon"):
        rec.lat, rec.lon, rec.precise, rec.locsrc = float(r["lat"]), float(r["lon"]), True, "bron"
    return rec


def ae_time(ts):
    """allevents toont de UTC-uren van zijn tijdstempel als lokale tijd ("06:30 PM" = 18:30 UTC). De stempel is dus
    lokale kloktijd die als UTC is opgeslagen; vastgesteld door ze te vergelijken met UiT (altijd precies 1 uur verschil)."""
    return datetime.fromtimestamp(int(ts), UTC).replace(tzinfo=None).replace(tzinfo=BRU).astimezone(UTC)


def from_allevents(it):
    start = ae_time(it["start_time"])
    title, flags = title_and_flags(it.get("eventname_raw") or it.get("eventname"))
    ven = it.get("venue") or {}
    name, addr, pc = place(it.get("location_raw") or it.get("location"), ven.get("street"))
    end = fix_end(start, ae_time(it["end_time"]) if it.get("end_time") else None, flags)
    rec = Rec(source="allevents", id=str(it["event_id"]), title=title, start=start, end=end, venue=name,
              address=addr, city="Antwerpen", organizer=clean((it.get("organizer") or {}).get("name")) or None,
              category=cat_from_allevents(it.get("categories"), title),
              url=it.get("event_url") or f"https://allevents.in/antwerp/{it['event_id']}", raw=it)
    rec.flags += flags
    rec.time_known = start.astimezone(BRU).strftime("%H:%M") != "00:00"
    try:
        lat, lon = float(ven.get("latitude")), float(ven.get("longitude"))
        if lat and lon:
            rec.lat, rec.lon = lat, lon
            rec.precise = haversine_m((lat, lon), CENTROID) > 30
            rec.locsrc = "bron" if rec.precise else "stadscentrum"
    except (TypeError, ValueError):
        pass
    return rec


def from_ticketmaster(e):
    d = e.get("dates") or {}
    st = d.get("start") or {}
    if st.get("dateTime"):
        start = parse_utc(st["dateTime"])
    elif st.get("localDate"):
        start = datetime.strptime(f"{st['localDate']} {st.get('localTime') or '00:00:00'}",
                                  "%Y-%m-%d %H:%M:%S").replace(tzinfo=BRU).astimezone(UTC)
    else:
        return None
    title, flags = title_and_flags(e.get("name"))
    v = ((e.get("_embedded") or {}).get("venues") or [{}])[0]
    loc = v.get("location") or {}
    cl = (e.get("classifications") or [{}])[0]
    seg = strip_diac((cl.get("segment") or {}).get("name"))
    pr = (e.get("priceRanges") or [{}])[0]
    code = strip_diac((d.get("status") or {}).get("code"))
    end = fix_end(start, parse_utc(d["end"]["dateTime"]) if (d.get("end") or {}).get("dateTime") else None, flags)
    street = (v.get("address") or {}).get("line1")
    pc = v.get("postalCode")
    rec = Rec(source="ticketmaster", id=str(e["id"]), title=title, start=start, end=end, venue=clean(v.get("name")) or None,
              address=f"{clean(street)}, {pc} Antwerpen" if street and pc else clean(street) or None,
              city=clean((v.get("city") or {}).get("name")) or "Antwerpen", url=e.get("url"),
              category=TM_CAT.get(seg, "overig"), raw=e,
              organizer=clean(((e.get("promoter") or {}).get("name"))) or None)
    rec.flags += flags
    rec.time_known = not (st.get("timeTBA") or st.get("noSpecificTime") or st.get("dateTime") is None and not st.get("localTime"))
    if code == "cancelled":
        rec.flags.append("cancelled")
    elif code == "offsale":
        rec.flags.append("soldOut")
    if pr.get("min") is not None:
        rec.price = {"min": pr.get("min"), "max": pr.get("max"), "currency": pr.get("currency", "EUR")}
    try:
        rec.lat, rec.lon, rec.precise, rec.locsrc = float(loc["latitude"]), float(loc["longitude"]), True, "bron"
    except (KeyError, TypeError, ValueError):
        pass
    return rec


def from_eventbrite(e):
    """Twee vormen: API (start.utc, venue) of de website-lijst (start_date + start_time lokaal, primary_venue)."""
    web = "start_date" in e
    if web:
        tz = ZoneInfo(e.get("timezone") or "Europe/Brussels")
        loc = lambda d, t: datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M").replace(tzinfo=tz).astimezone(UTC)
        start = loc(e["start_date"], e["start_time"])
        end_raw = loc(e["end_date"], e["end_time"]) if e.get("end_date") and e.get("end_time") else None
        title, flags = title_and_flags(e.get("name"))
        v = e.get("primary_venue") or {}
    else:
        s = e.get("start") or {}
        if not s.get("utc"):
            return None
        start = parse_utc(s["utc"])
        end_raw = parse_utc(e["end"]["utc"]) if (e.get("end") or {}).get("utc") else None
        title, flags = title_and_flags((e.get("name") or {}).get("text"))
        v = e.get("venue") or {}
    a = v.get("address") or {}
    end = fix_end(start, end_raw, flags)
    street, pc = a.get("address_1"), a.get("postal_code")
    rec = Rec(source="eventbrite", id=str(e["id"]), title=title, start=start, end=end, venue=clean(v.get("name")) or None,
              address=f"{clean(street)}, {pc} {clean(a.get('city')) or 'Antwerpen'}" if street and pc else clean(street) or None,
              city=clean(a.get("city")) or "Antwerpen", url=e.get("url"),
              category=cat_from_allevents([(e.get("category") or {}).get("name", "")], title), raw=e)
    rec.flags += flags
    if e.get("online_event"):
        rec.flags.append("online")
    if e.get("status") in ("canceled", "cancelled"):
        rec.flags.append("cancelled")
    mp = ((e.get("ticket_availability") or {}).get("minimum_ticket_price") or {})
    if mp.get("major_value") is not None:
        rec.price = {"min": float(mp["major_value"]), "currency": mp.get("currency", "EUR")}
    elif e.get("is_free"):
        rec.price = {"min": 0.0, "currency": "EUR"}
    try:
        rec.lat, rec.lon, rec.precise, rec.locsrc = float(a["latitude"]), float(a["longitude"]), True, "bron"
    except (KeyError, TypeError, ValueError):
        pass
    return rec


# ----------------------------------------------------------------------------- locatie aanvullen
def resolve_locations(recs, cache, geocode_fn=None):
    """Venuenaam <-> coordinaten aanvullen met wat andere (precieze) records weten."""
    by_name, by_cell = {}, {}
    for r in recs:
        if r.precise and r.lat:
            cell = (round(r.lat, 3), round(r.lon, 3))
            if r.venue:
                w = 5 if r.source in ("ticketmaster", "eventbrite") else 1   # API-bronnen wegen zwaarder
                by_name.setdefault(vkey(r.venue), Counter())[(round(r.lat, 5), round(r.lon, 5))] += w
                by_cell.setdefault(cell, Counter())[r.venue] += 1
    for r in recs:                      # duidelijk foute coordinaten bij een bekende venue rechtzetten
        k = vkey(r.venue or "")
        if r.precise and r.lat and k in by_name and r.source not in ("ticketmaster", "eventbrite"):
            best, _ = by_name[k].most_common(1)[0]
            if sum(by_name[k].values()) >= 3 and haversine_m((r.lat, r.lon), best) > 400:
                r.lat, r.lon, r.locsrc = best[0], best[1], "venue-gecorrigeerd"
    for r in recs:
        if r.precise and r.lat and not r.venue:                    # naam via naburige coordinaten
            c = by_cell.get((round(r.lat, 3), round(r.lon, 3)))
            if c:
                r.venue = c.most_common(1)[0][0]
        if not r.precise:                                          # coordinaten via naam of adres
            k = vkey(r.venue or "")
            if k in by_name:
                r.lat, r.lon = by_name[k].most_common(1)[0][0]
                r.precise, r.locsrc = True, "venue-bekend"
            elif r.source == "uitinvlaanderen":
                key = "|".join(x.replace("|", " ") for x in r.uit_addr)
                g = cache.get(key)
                if g is None and key not in cache and geocode_fn:
                    res = geocode_fn(*r.uit_addr)
                    if res is not GEO_FAIL:
                        g = cache[key] = res
                if g and g.get("lat") and not str(g.get("geo_precisie", "")).startswith("gemeente"):
                    r.lat, r.lon, r.precise, r.locsrc = g["lat"], g["lon"], True, "geocoder"
        if not r.venue:
            r.venue = (r.address or "").split(",")[0] or None


# ----------------------------------------------------------------------------- ontdubbelen
def same_venue(a, b):
    ka, kb = vkey(a.venue or ""), vkey(b.venue or "")
    if ka and ka == kb:
        return True
    if a.precise and b.precise and a.lat and b.lat:
        return haversine_m((a.lat, a.lon), (b.lat, b.lon)) <= 250
    return False


def tsim(a, b):
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    s, l = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    if s <= l and (len(s) >= 2 or sum(map(len, s)) >= 6):
        return 1.0
    j = len(sa & sb) / len(sa | sb)
    r = difflib.SequenceMatcher(None, " ".join(sorted(sa)), " ".join(sorted(sb))).ratio() * 0.95
    sim = max(j, r)
    if a[0] == b[0] and len(a[0]) >= 4:
        sim = max(sim, 0.5)                                       # zelfde hoofdnaam, rest verschilt
    return sim


def compare(a, b):
    if a.time_known and b.time_known:
        if abs((a.start - b.start).total_seconds()) > 180 * 60:
            return None
    elif a.start.astimezone(BRU).date() != b.start.astimezone(BRU).date():   # een van beide kent het uur niet: zelfde dag volstaat
        return None
    ts = tsim(a.tt, b.tt)
    vs = same_venue(a, b)
    head = bool(a.tt and b.tt and a.tt[0] == b.tt[0] and len(a.tt[0]) >= 4)
    if ts >= 0.75 and (vs or ts >= 0.95):
        return "dup", ts
    if vs and (ts >= 0.65 or head):
        return "maybe", ts
    return None


def quality(r):
    venue_listing = bool(r.organizer) and vkey(r.organizer) == vkey(r.venue or "x")
    return (SRC_RANK[r.source], r.org_key in AGGREGATORS, not venue_listing, not r.precise, -len(r.title), r.id)


def dedupe(recs):
    recs = sorted(recs, key=lambda r: r.start)
    parent = list(range(len(recs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    maybes = []
    for i, a in enumerate(recs):
        for j in range(i + 1, len(recs)):
            b = recs[j]
            if (b.start - a.start).total_seconds() > 36 * 3600:
                break
            res = compare(a, b)
            if not res:
                continue
            if res[0] == "dup":
                parent[find(j)] = find(i)
            else:
                maybes.append((i, j, res[1]))
    clusters = {}
    for i in range(len(recs)):
        clusters.setdefault(find(i), []).append(recs[i])
    return list(clusters.values()), maybes, recs


LOC_TRUST = ("bron", "geocoder")


def to_doc(cluster, now):
    """Eén document per echt event. Per veld wordt de beste beschikbare waarde uit ALLE bronnen genomen,
    niet alleen uit het hoofdrecord. dedupe.fieldSources zegt waar elk veld vandaan komt."""
    cluster = sorted(cluster, key=quality)
    p = cluster[0]
    from_ = {}

    def first(attr, ok=lambda v: bool(v), label=None):
        for r in cluster:
            v = getattr(r, attr)
            if ok(v):
                from_[label or attr] = r.source
                return v, r
        return None, None

    # starttijd: bij voorkeur van een bron die echt een tijdstip kent (niet "00:00" / "tijd nog niet bekend")
    st_rec = next((r for r in cluster if r.time_known), p)
    start = st_rec.start
    from_["startsAt"] = st_rec.source
    # einde: eerst van dezelfde bron als de start, anders van een andere bron, maar altijd na de start
    end = None
    for r in [st_rec] + [x for x in cluster if x is not st_rec]:
        if r.end and r.end > start and r.end - start <= timedelta(days=7):
            end, from_["endsAt"] = r.end, r.source
            break
    addr, _ = first("address", lambda v: bool(v) and re.search(r"\b\d{4}\b", v), "venue.address")
    if not addr:
        addr, _ = first("address", label="venue.address")
    loc_rec = next((r for r in cluster if r.locsrc in LOC_TRUST), p)
    from_["venue.location"] = loc_rec.source
    cat, _ = first("category", lambda v: v and v != "overig")
    url, _ = first("url")
    price, _ = first("price")
    org, _ = first("organizer")
    flags = sorted({f for r in cluster for f in r.flags})
    if not any(r.time_known for r in cluster):
        flags.append("timeUnknown")
    venue = {"name": p.venue or "Onbekend", "city": p.city,
             "location": {"type": "Point", "coordinates": [loc_rec.lon, loc_rec.lat]}}
    if addr:
        venue["address"] = addr
    if p.district:
        venue["district"] = p.district
    doc = {"source": p.source, "externalId": p.id, "title": p.title, "category": cat or p.category,
           "startsAt": iso(start), "venue": venue, "flags": flags, "fetchedAt": iso(now),
           "sources": [{"source": r.source, "externalId": r.id, "url": r.url, "title": r.title,
                        "startsAt": iso(r.start), "timeKnown": r.time_known} for r in cluster],
           "dedupe": {"clusterSize": len(cluster), "locationSource": loc_rec.locsrc, "fieldSources": from_},
           "raw": p.raw}
    if url:
        doc["url"] = url
    if end:
        doc["endsAt"] = iso(end)
    if price:
        doc["price"] = price
    if org:
        doc["organizer"] = org
    gaps = sorted({iso(r.start) for r in cluster if abs((r.start - start).total_seconds()) > 0 and r.time_known})
    if gaps:
        doc["dedupe"]["otherStartTimes"] = gaps
    return doc


# ----------------------------------------------------------------------------- hoofdprogramma
def load_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def items_of(raw):
    """raw_*.json mag een lijst zijn of {'items': [...]}."""
    return raw["items"] if isinstance(raw, dict) and "items" in raw else raw


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uit")
    ap.add_argument("--allevents")
    ap.add_argument("--ticketmaster")
    ap.add_argument("--eventbrite")
    ap.add_argument("--geocode", action="store_true", help="ontbrekende UiT-coordinaten opzoeken via Geopunt (traag, 1 per 1,1 s)")
    ap.add_argument("--geocode-cache", default="geocode_cache.json")
    ap.add_argument("--include-past", action="store_true")
    ap.add_argument("--now", help="ISO-tijdstip i.p.v. nu (voor tests)")
    ap.add_argument("--out", default="events_clean.json")
    ap.add_argument("--rejected", default="events_rejected.json")
    ap.add_argument("--report", default="dedupe_report.csv")
    a = ap.parse_args()
    now = parse_utc(a.now) if a.now else datetime.now(UTC)

    recs, rejected, counts = [], [], Counter()
    for path, fn in ((a.uit, from_uit), (a.allevents, from_allevents),
                     (a.ticketmaster, from_ticketmaster), (a.eventbrite, from_eventbrite)):
        if not path:
            continue
        for it in items_of(load_json(path)):
            try:
                r = fn(it)
            except Exception as e:                                # een kapot record mag de run niet stoppen
                rejected.append({"reden": f"onleesbaar: {e}", "bron": fn.__name__, "raw": it})
                continue
            if r:
                counts[r.source] += 1
                recs.append(r)

    cache_path = pathlib.Path(a.geocode_cache)
    cache = load_json(cache_path) if cache_path.exists() else {}
    geocode_fn = None
    if a.geocode:
        sys.path.insert(0, str(pathlib.Path(__file__).parent))
        from uit_geocode import geocode as _geo
        fails = [0]

        def geocode_fn(*addr):
            """Netwerkfouten stoppen de run niet; na 3 opeenvolgende fouten wordt geocoderen uitgezet."""
            if fails[0] >= 3:
                return GEO_FAIL
            try:
                g = _geo(*addr)
                fails[0] = 0
                return g
            except Exception as e:
                fails[0] += 1
                print(f"  geocoder niet bereikbaar ({type(e).__name__}); {addr[0]} blijft zonder coordinaten", file=sys.stderr)
                return GEO_FAIL
    resolve_locations(recs, cache, geocode_fn)
    if a.geocode:
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    good = []
    for r in recs:
        why = None
        if "cancelled" in r.flags:
            why = "geannuleerd"
        elif "online" in r.flags:
            why = "online event"
        elif r.lat and not (51.10 < r.lat < 51.36 and 4.20 < r.lon < 4.62):
            why = "buiten de regio Antwerpen"
        elif not r.venue and not r.address:
            why = "geen venue of adres (alleen 'Antwerpen')"
        elif not r.precise or not r.lat:
            why = "geen bruikbare coordinaten"
        elif not a.include_past and (r.end or r.start + timedelta(hours=3)) < now:
            why = "voorbij"
        if why:
            rejected.append({"reden": why, "bron": r.source, "externalId": r.id, "title": r.title, "startsAt": iso(r.start)})
        else:
            r.tt = ttoks(r.title, r.venue)
            good.append(r)

    clusters, maybes, ordered = dedupe(good)
    docs = [to_doc(c, now) for c in clusters]
    doc_of = {id(r): d for c, d in zip(clusters, docs) for r in c}
    for i, j, score in maybes:
        x, y = doc_of[id(ordered[i])], doc_of[id(ordered[j])]
        if x is y:
            continue
        for me, other in ((x, y), (y, x)):
            me["dedupe"].setdefault("possibleDuplicates", []).append(
                {"source": other["source"], "externalId": other["externalId"], "score": round(score, 2)})
    docs.sort(key=lambda d: d["startsAt"])

    pathlib.Path(a.out).write_text(json.dumps(docs, ensure_ascii=False, indent=1), encoding="utf-8")
    pathlib.Path(a.rejected).write_text(json.dumps(rejected, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(a.report, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["soort", "start", "venue", "score", "bronnen", "titels"])
        for d in docs:
            if d["dedupe"]["clusterSize"] > 1:
                w.writerow(["merged", d["startsAt"], d["venue"]["name"], "",
                            " + ".join(s["source"] for s in d["sources"]), " || ".join(s["title"] for s in d["sources"])])
        seen = set()
        for d in docs:
            for pdp in d["dedupe"].get("possibleDuplicates", []):
                k = frozenset([(d["source"], d["externalId"]), (pdp["source"], pdp["externalId"])])
                if k not in seen:
                    seen.add(k)
                    other = next(x for x in docs if (x["source"], x["externalId"]) == (pdp["source"], pdp["externalId"]))
                    w.writerow(["maybe", d["startsAt"], d["venue"]["name"], pdp["score"],
                                f"{d['source']} / {other['source']}", f"{d['title']} || {other['title']}"])
    merged = sum(d["dedupe"]["clusterSize"] - 1 for d in docs)
    print("Ingelezen:", dict(counts))
    print(f"Afgewezen: {len(rejected)}  ({dict(Counter(x['reden'] for x in rejected))})")
    print(f"Samengevoegde dubbels: {merged}   Twijfelgevallen: {len(seen) if maybes else 0}")
    print(f"Resultaat: {len(docs)} unieke events -> {a.out}")
    print("Per bron (hoofdrecord):", dict(Counter(d["source"] for d in docs)))


if __name__ == "__main__":
    main()
