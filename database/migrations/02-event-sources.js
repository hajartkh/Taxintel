// Migratie: laat extra `source`-waarden toe in de validator van `events`.
// De init-scripts in database/init/ draaien alleen bij het allereerste aanmaken van de database, dus een
// bestaande database moet bijgewerkt worden met collMod. Uitvoeren (als admin of eigenaar van de database):
//
//   docker compose exec mongo mongosh -u <admin> -p <wachtwoord> --authenticationDatabase admin taxintel \
//     --file /docker-entrypoint-initdb.d/../migrations/02-event-sources.js     (of plak het in mongosh)
//
// Voor een verse database: voeg dezelfde vier waarden toe aan de enum in database/init/01-schema.js.
const NEW_SOURCES = ["uitinvlaanderen", "allevents", "ticketmaster", "eventbrite"];

const info = db.getCollectionInfos({ name: "events" })[0];
if (!info) throw new Error("Collectie 'events' bestaat niet; draai eerst 01-schema.js");

const validator = info.options.validator;
const prop = validator.$jsonSchema.properties.source;
prop.enum = Array.from(new Set([...prop.enum, ...NEW_SOURCES]));

db.runCommand({
  collMod: "events",
  validator,
  validationLevel: info.options.validationLevel,
  validationAction: info.options.validationAction,
});
print("events.source toegestaan:", JSON.stringify(prop.enum));
