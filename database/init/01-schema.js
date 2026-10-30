// TaxIntel - MongoDB initialisatie
// Draait automatisch bij de eerste start van de mongo-container (lege data-volume).
// Opnieuw draaien: docker compose down -v && docker compose up
// EERSTE VOORSTEL: schema's worden nog besproken en aangepast. Uitleg per collectie: database/SCHEMA.md

const dbName = process.env.MONGO_DB || "taxintel";
db = db.getSiblingDB(dbName);

// ---------- App-gebruiker (backend verbindt hiermee, niet met root) ----------
db.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: "readWrite", db: dbName }],
});

// ---------- Herbruikbare schema-blokken ----------
const point = {
  bsonType: "object",
  required: ["type", "coordinates"],
  properties: {
    type: { enum: ["Point"] },
    coordinates: { bsonType: "array", minItems: 2, maxItems: 2, items: { bsonType: ["double", "int"] } }, // [lng, lat]
  },
};

const create = (name, schema, options = {}) =>
  db.createCollection(name, {
    validator: { $jsonSchema: schema },
    validationLevel: "moderate",
    validationAction: "error",
    ...options,
  });

// ---------- drivers: de chauffeurs (gebruikers van de app) ----------
create("drivers", {
  bsonType: "object",
  required: ["email", "displayName", "createdAt"],
  properties: {
    email: { bsonType: "string", pattern: "^.+@.+$" },
    passwordHash: { bsonType: "string" },
    displayName: { bsonType: "string" },
    homeLocation: point,
    preferences: {
      bsonType: "object",
      properties: {
        language: { enum: ["nl", "fr", "en"] },
        eventCategories: { bsonType: "array", items: { bsonType: "string" } },
        maxDistanceKm: { bsonType: ["int", "double"], minimum: 0 },
        shareLocation: { bsonType: "bool" }, // nodig voor 'andere drivers'-hotspotweights (Could have)
      },
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
});
db.drivers.createIndex({ email: 1 }, { unique: true });

// ---------- events: ingelezen eventdata (Events API) + handmatige events ----------
create("events", {
  bsonType: "object",
  required: ["source", "title", "startsAt", "venue"],
  properties: {
    source: { enum: ["events_api", "allevents", "manual"] }, // allevents = scraper (demo)
    externalId: { bsonType: "string" },
    title: { bsonType: "string" },
    description: { bsonType: "string" },
    category: { bsonType: "string" }, // concert, sport, beurs, ...
    startsAt: { bsonType: "date" },
    endsAt: { bsonType: "date" },
    endsAtEstimated: { bsonType: "bool" }, // true = einduur geschat (bron gaf geen einduur)
    expectedAttendance: { bsonType: ["int", "long"], minimum: 0 },
    venue: {
      bsonType: "object",
      required: ["name", "location"],
      properties: {
        name: { bsonType: "string" },
        address: { bsonType: "string" },
        city: { bsonType: "string" },
        location: point,
      },
    },
    url: { bsonType: "string" },
    raw: { bsonType: "object" }, // originele API-response, handig voor debuggen
    fetchedAt: { bsonType: "date" },
  },
});
db.events.createIndex({ "venue.location": "2dsphere" });                  // event-pins op de kaart (#6)
db.events.createIndex({ startsAt: 1 });                                   // kalender (#4)
db.events.createIndex({ source: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $exists: true } } });

// ---------- savedLocations: bewaarde locaties van een chauffeur ----------
create("savedLocations", {
  bsonType: "object",
  required: ["driverId", "name", "location", "createdAt"],
  properties: {
    driverId: { bsonType: "objectId" },
    name: { bsonType: "string" },
    note: { bsonType: "string" },
    location: point,
    tags: { bsonType: "array", items: { bsonType: "string" } },
    createdAt: { bsonType: "date" },
  },
});
db.savedLocations.createIndex({ driverId: 1, createdAt: -1 });
db.savedLocations.createIndex({ location: "2dsphere" });

// ---------- driverLists: eigen lijsten (mix van events en locaties) ----------
create("driverLists", {
  bsonType: "object",
  required: ["driverId", "name", "items", "createdAt"],
  properties: {
    driverId: { bsonType: "objectId" },
    name: { bsonType: "string" },
    items: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["kind", "refId", "addedAt"],
        properties: {
          kind: { enum: ["event", "location"] },
          refId: { bsonType: "objectId" }, // -> events._id of savedLocations._id
          addedAt: { bsonType: "date" },
        },
      },
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
});
db.driverLists.createIndex({ driverId: 1, name: 1 }, { unique: true });

// ---------- hotspotPredictions: output van het AI-model (#3) ----------
create("hotspotPredictions", {
  bsonType: "object",
  required: ["location", "window", "score", "modelVersion", "createdAt", "expiresAt"],
  properties: {
    location: point,
    radiusM: { bsonType: ["int", "double"], minimum: 0 },
    window: {
      bsonType: "object",
      required: ["from", "to"],
      properties: { from: { bsonType: "date" }, to: { bsonType: "date" } },
    },
    score: { bsonType: ["double", "int"], minimum: 0, maximum: 1 }, // verwachte drukte 0..1
    factors: {
      bsonType: "object", // waarom is het hier druk? (uitlegbaarheid op de kaart)
      properties: {
        eventIds: { bsonType: "array", items: { bsonType: "objectId" } },
        transitHubIds: { bsonType: "array", items: { bsonType: "objectId" } },
        stationIds: { bsonType: "array", items: { bsonType: "string" } }, // iRail-stations (trainMovements.stationId)
        weather: { bsonType: "string" },
        nearbyDrivers: { bsonType: "int" },
      },
    },
    modelVersion: { bsonType: "string" },
    createdAt: { bsonType: "date" },
    expiresAt: { bsonType: "date" },
  },
});
db.hotspotPredictions.createIndex({ location: "2dsphere" });
db.hotspotPredictions.createIndex({ "window.from": 1, "window.to": 1 });
db.hotspotPredictions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // verouderde voorspellingen opruimen

// ---------- routes: berekende A*-routes naar een event (#2) ----------
create("routes", {
  bsonType: "object",
  required: ["driverId", "origin", "destination", "algorithm", "computedAt"],
  properties: {
    driverId: { bsonType: "objectId" },
    eventId: { bsonType: "objectId" },
    origin: point,
    destination: point,
    algorithm: { enum: ["astar", "google_directions"] },
    path: {
      bsonType: "object", // GeoJSON LineString voor op de kaart
      required: ["type", "coordinates"],
      properties: {
        type: { enum: ["LineString"] },
        coordinates: { bsonType: "array", items: { bsonType: "array" } },
      },
    },
    distanceM: { bsonType: ["int", "double"] },
    durationS: { bsonType: ["int", "double"] },
    trafficFactor: { bsonType: "double" },
    computedAt: { bsonType: "date" },
  },
});
db.routes.createIndex({ driverId: 1, computedAt: -1 });
db.routes.createIndex({ computedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // 7 dagen bewaren

// ---------- transitHubs: stations, luchthavens, haltes (De Lijn / ILine / NMBS via iRail) ----------
create("transitHubs", {
  bsonType: "object",
  required: ["kind", "name", "location", "source"],
  properties: {
    kind: { enum: ["train", "airport", "bus", "tram"] },
    name: { bsonType: "string" },
    standardName: { bsonType: "string" }, // iRail: officiele (tweetalige) naam
    location: point,
    source: { enum: ["delijn", "iline", "irail", "manual"] },
    externalId: { bsonType: "string" }, // iRail: BE.NMBS.008821006
    fetchedAt: { bsonType: "date" },
  },
});
db.transitHubs.createIndex({ location: "2dsphere" });
db.transitHubs.createIndex({ source: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $exists: true } } });

// ---------- trainMovements: aankomsten/vertrekken per station (iRail liveboards) ----------
// 1 document per trein per station per richting; bij elke ophaalronde worden vertraging/schrapping bijgewerkt.
// Basis voor de drukte per station (GET /irail/crowding) en trainingsdata voor het AI-model.
create("trainMovements", {
  bsonType: "object",
  required: ["stationId", "stationName", "location", "direction", "vehicle", "scheduledAt", "expectedAt", "delayS", "canceled", "lastSeenAt"],
  properties: {
    stationId: { bsonType: "string" }, // -> transitHubs.externalId
    stationName: { bsonType: "string" },
    location: point, // locatie van het station
    direction: { enum: ["arrival", "departure"] },
    vehicle: { bsonType: "string" }, // bv. IC2037
    vehicleType: { bsonType: "string" }, // IC, S1, L, P, EC, EUR, ...
    longDistance: { bsonType: "bool" }, // IC/internationaal: meer reizigers per trein
    otherStation: {
      bsonType: "object", // herkomst (aankomst) of bestemming (vertrek)
      properties: { id: { bsonType: "string" }, name: { bsonType: "string" } },
    },
    scheduledAt: { bsonType: "date" },
    expectedAt: { bsonType: "date" }, // scheduledAt + vertraging
    delayS: { bsonType: ["int", "long"] },
    canceled: { bsonType: "bool" },
    isExtra: { bsonType: "bool" }, // extra trein (bv. bij grote events)
    passed: { bsonType: "bool" }, // trein is al aangekomen/vertrokken
    platform: { bsonType: "string" },
    platformChanged: { bsonType: "bool" },
    occupancy: { enum: ["low", "medium", "high", "unknown"] }, // enkel bij vertrekken
    localHour: { bsonType: "int", minimum: 0, maximum: 23 }, // features voor het AI-model (Brusselse tijd)
    weekday: { bsonType: "int", minimum: 0, maximum: 6 }, // 0 = maandag
    firstSeenAt: { bsonType: "date" },
    lastSeenAt: { bsonType: "date" },
  },
});
db.trainMovements.createIndex({ stationId: 1, direction: 1, vehicle: 1, scheduledAt: 1 }, { unique: true });
db.trainMovements.createIndex({ expectedAt: 1, stationId: 1 }); // drukte per tijdvenster
db.trainMovements.createIndex({ location: "2dsphere" });
db.trainMovements.createIndex({ scheduledAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }); // 180 dagen historiek

// ---------- transitDisturbances: storingen en geplande werken (iRail) ----------
create("transitDisturbances", {
  bsonType: "object",
  required: ["source", "externalId", "type", "title", "active", "lastSeenAt"],
  properties: {
    source: { enum: ["irail"] },
    externalId: { bsonType: "string" }, // hash van titel + link
    type: { enum: ["disturbance", "planned"] }, // onverwacht of geplande werken
    title: { bsonType: "string" },
    description: { bsonType: "string" },
    link: { bsonType: "string" },
    stationIds: { bsonType: "array", items: { bsonType: "string" } }, // stations die in de titel vernoemd worden
    active: { bsonType: "bool" }, // false = niet meer in de feed
    publishedAt: { bsonType: "date" },
    firstSeenAt: { bsonType: "date" },
    lastSeenAt: { bsonType: "date" },
  },
});
db.transitDisturbances.createIndex({ source: 1, externalId: 1 }, { unique: true });
db.transitDisturbances.createIndex({ active: 1, stationIds: 1 });

// ---------- driverPositions: recente GPS-posities (Could have: andere drivers) ----------
create("driverPositions", {
  bsonType: "object",
  required: ["driverId", "location", "recordedAt"],
  properties: {
    driverId: { bsonType: "objectId" },
    location: point,
    speedKmh: { bsonType: ["int", "double"] },
    recordedAt: { bsonType: "date" },
  },
});
db.driverPositions.createIndex({ location: "2dsphere" });
db.driverPositions.createIndex({ driverId: 1, recordedAt: -1 });
db.driverPositions.createIndex({ recordedAt: 1 }, { expireAfterSeconds: 60 * 15 }); // privacy (AVG): na 15 min weg

// ---------- apiCache: responses van externe API's (rate limits / kosten) ----------
create("apiCache", {
  bsonType: "object",
  required: ["source", "key", "payload", "expiresAt"],
  properties: {
    source: { enum: ["google_maps", "events_api", "delijn", "iline", "irail"] },
    key: { bsonType: "string" }, // bv. hash van URL + params
    payload: {},
    fetchedAt: { bsonType: "date" },
    expiresAt: { bsonType: "date" },
  },
});
db.apiCache.createIndex({ source: 1, key: 1 }, { unique: true });
db.apiCache.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

print(`TaxIntel: database '${dbName}' geinitialiseerd.`);
