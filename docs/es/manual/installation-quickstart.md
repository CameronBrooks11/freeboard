---
translationOf: docs/manual/installation.md
sourceSha: 47e5f8028680
translationUpdated: 2026-03-02
translationStatus: needs-native-review
alternateLocales:
  en: /manual/installation
  fr: /fr/manual/installation-quickstart
  es: /es/manual/installation-quickstart
  de: /de/manual/installation-quickstart
---

# Instalacion Rapida (ES)

## Requisitos

1. Node.js `24.13.1` a `<25`
2. npm `11.10.0` a `<12`
3. Docker Engine `>=20.10`
4. Docker Compose v2

## Flujo rapido local

```bash
git clone https://github.com/CameronBrooks11/freeboard.git
cd freeboard
nvm use || nvm install
npm install
cp .env.dev .env
npm run dev
```

## Endpoints utiles

1. UI: `http://127.0.0.1:5173`
2. API: `http://127.0.0.1:4001/graphql`
3. Gateway: `http://127.0.0.1:8001`

## Referencia canonica

1. [Installation (ingles)](/manual/installation)
