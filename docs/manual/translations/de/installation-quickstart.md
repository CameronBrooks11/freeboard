# Installation Schnellstart (DE)

- Source page: `docs/manual/installation.md`
- Source revision: `main` (in PRs durch Commit-SHA ersetzen)
- Translation last-updated: `2026-02-24`
- Review status: `needs-native-review`

## Voraussetzungen

1. Node.js `24.13.1` bis `<25`
2. npm `11.10.0` bis `<12`
3. Docker Engine `>=20.10`
4. Docker Compose v2

## Lokaler Schnellablauf

```bash
git clone https://github.com/CameronBrooks11/freeboard.git
cd freeboard
nvm use || nvm install
npm install
cp .env.dev .env
npm run dev
```

## Nutzliche Endpunkte

1. UI: `http://127.0.0.1:5173`
2. API: `http://127.0.0.1:4001/graphql`
3. Gateway: `http://127.0.0.1:8001`

## Kanonische Referenz

Fuer vollstaendige und aktuelle Details siehe Quellseite:

1. [Installation (English canonical)](/manual/installation)
