# Taxintel
AI for Business

Slimme app voor taxichauffeurs: events op de kaart, A*-route naar een event en AI-voorspelling van drukke plaatsen.

## Structuur

```
frontend/   Angular (Google Maps, kalender, opgeslagen data)
backend/    Python API (FastAPI) - één laag tussen app, AI-model, database en externe API's
database/   MongoDB init (validators + indexen) en SCHEMA.md
```

## Omgeving starten

Vereist: Docker Desktop.

```bash
cp .env.example .env              # wachtwoorden en API-keys invullen
docker compose up --build         # frontend, backend, mongo
docker compose --profile tools up # + mongo-express (DB bekijken)
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:8000 (docs: `/docs`) |
| MongoDB | `mongodb://localhost:27017` |
| mongo-express | http://localhost:8081 |

Zolang `frontend/package.json` of `backend/app/main.py` nog niet bestaan, blijven die containers wachten in plaats van te crashen.
Het Angular-project aanmaken kan vanuit de container:

```bash
docker compose run --rm frontend ng new taxintel --directory . --skip-git
```

De database wordt alleen bij de **eerste** start geïnitialiseerd. Schema gewijzigd? `docker compose down -v` (wist de data) en opnieuw `up`.
