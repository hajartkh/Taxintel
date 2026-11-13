"""Rooktest met NAGEMAAKTE Ticketmaster/Eventbrite-antwoorden (formaat volgens de documentatie).
Het zijn geen echte events; ze staan alleen hier om de parsers en de ontdubbeling te controleren.
Draaien vanuit de map taxintel_scrapers:  python tests/test_pipeline.py"""
import json, pathlib, subprocess, sys, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
tm = {"items": [
 {"id": "TM1", "name": "Niall Horan: Dinner Party Live On Tour", "url": "https://www.ticketmaster.be/event/TM1",
  "dates": {"start": {"dateTime": "2026-11-05T18:30:00Z"}, "status": {"code": "onsale"}},
  "classifications": [{"segment": {"name": "Music"}}], "priceRanges": [{"min": 59.5, "max": 149.0, "currency": "EUR"}],
  "_embedded": {"venues": [{"name": "Sportpaleis", "address": {"line1": "Schijnpoortweg 119"}, "postalCode": "2170",
                             "city": {"name": "Antwerpen"}, "location": {"latitude": "51.2305", "longitude": "4.4418"}}]}},
 {"id": "TM2", "name": "Geannuleerde show", "dates": {"start": {"localDate": "2026-11-20", "localTime": "20:00:00"},
  "status": {"code": "cancelled"}}, "_embedded": {"venues": [{"name": "Lotto Arena", "location": {"latitude": "51.2299", "longitude": "4.4420"}}]}},
 {"id": "TM3", "name": "Alleen lokale datum", "dates": {"start": {"localDate": "2026-11-21"}, "status": {"code": "onsale"}},
  "_embedded": {"venues": [{"name": "Lotto Arena", "location": {"latitude": "51.2299", "longitude": "4.4420"}}]}},
 {"id": "TM4", "name": "Zonder venue-locatie", "dates": {"start": {"dateTime": "2026-11-22T19:00:00Z"}}}]}
eb = {"items": [
 {"id": "EB1", "name": {"text": "Workshop &amp; borrel 🎉"}, "url": "https://eventbrite.be/e/EB1",
  "start": {"utc": "2026-11-12T17:00:00Z"}, "end": {"utc": "2026-11-12T20:00:00Z"}, "status": "live", "online_event": False,
  "venue": {"name": "Zaal X", "address": {"address_1": "Meir 1", "postal_code": "2000", "city": "Antwerpen", "latitude": "51.2183", "longitude": "4.4094"}},
  "ticket_availability": {"minimum_ticket_price": {"major_value": "12.50", "currency": "EUR"}}, "category": {"name": "Business"}},
 {"id": "EB2", "name": {"text": "Online webinar"}, "start": {"utc": "2026-11-13T17:00:00Z"}, "online_event": True}]}
d = pathlib.Path(tempfile.mkdtemp())
(d / "tm.json").write_text(json.dumps(tm)); (d / "eb.json").write_text(json.dumps(eb))
cmd = [sys.executable, str(root / "events_pipeline.py"), "--ticketmaster", str(d / "tm.json"), "--eventbrite", str(d / "eb.json"),
       "--allevents", str(root / "data/raw_allevents.json"), "--now", "2026-10-30T15:00:00Z", "--geocode-cache", "/nonexistent",
       "--out", str(d / "o.json"), "--rejected", str(d / "r.json"), "--report", str(d / "rep.csv")]
print(subprocess.run(cmd, capture_output=True, text=True).stdout)
out = json.loads((d / "o.json").read_text()); rej = json.loads((d / "r.json").read_text())
by = {x["externalId"]: x for x in out}
niall = next(x for x in out if "Niall Horan" in x["title"])
assert niall["source"] == "ticketmaster" and niall["dedupe"]["clusterSize"] >= 2, niall["sources"]
assert niall["price"]["min"] == 59.5 and niall["venue"]["location"]["coordinates"] == [4.4418, 51.2305]
assert "TM2" not in by and any(r["reden"] == "geannuleerd" for r in rej)
assert by["TM3"]["startsAt"] == "2026-11-20T23:00:00Z" or by["TM3"]["startsAt"] == "2026-11-20T23:00:00Z"
assert by["EB1"]["title"] == "Workshop & borrel" and by["EB1"]["price"]["min"] == 12.5
assert "EB2" not in by and "TM4" not in by
# bron zonder tijdstip (Ticketmaster timeTBA) + bron met tijdstip (allevents) = 1 event met het tijdstip erbij
tm2 = {"items": [{"id": "T9", "name": "Testconcert Alpha", "url": "https://tm/T9", "dates": {"start": {"localDate": "2026-12-05", "timeTBA": True}, "status": {"code": "onsale"}},
  "priceRanges": [{"min": 30, "max": 60, "currency": "EUR"}], "_embedded": {"venues": [{"name": "Lotto Arena", "address": {"line1": "Schijnpoortweg 119"}, "postalCode": "2170", "city": {"name": "Antwerpen"}, "location": {"latitude": "51.2299", "longitude": "4.4420"}}]}}]}
ae2 = {"items": [{"event_id": "A9", "eventname_raw": "Testconcert Alpha in Antwerpen", "start_time": "1796500800", "end_time": "1796508000", "location_raw": "Lotto Arena",
  "venue": {"street": "Schijnpoortweg 119,Antwerp, Belgium", "latitude": "51.2299", "longitude": "4.4420"}, "organizer": {"name": "X"}, "categories": ["concerts"]}]}
(d / "tm2.json").write_text(json.dumps(tm2)); (d / "ae2.json").write_text(json.dumps(ae2))
subprocess.run([sys.executable, str(root / "events_pipeline.py"), "--ticketmaster", str(d / "tm2.json"), "--allevents", str(d / "ae2.json"), "--now", "2026-10-30T15:00:00Z",
  "--geocode-cache", "/nonexistent", "--out", str(d / "o2.json"), "--rejected", str(d / "r2.json"), "--report", str(d / "c2.csv")], capture_output=True, text=True)
m = json.loads((d / "o2.json").read_text())
assert len(m) == 1, m
x = m[0]
assert x["source"] == "ticketmaster" and x["startsAt"] == "2026-12-05T19:00:00Z" and x["endsAt"] == "2026-12-05T21:00:00Z", x
assert x["price"]["min"] == 30 and "timeUnknown" not in x["flags"] and x["dedupe"]["fieldSources"]["startsAt"] == "allevents"
print("OK: tijdstip van allevents aangevuld bij Ticketmaster zonder tijd")
print("OK:", len(out), "events; Niall Horan samengevoegd uit", [s["source"] for s in niall["sources"]])
