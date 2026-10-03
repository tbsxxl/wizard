# Wizard – Score Tracker

Punktezähler für das Stichspiel **Wizard**: Ansagen und Stiche je Runde eintragen, die Wertung
(exakt getroffen = 20 + 10 × Stiche, sonst −10 × Abweichung) wird automatisch gerechnet.
Der Spielstand bleibt lokal im Browser gespeichert.

Läuft als statische Seite auf **Cloudflare Workers** (Static Assets, kein Server-Code).

## Aufbau

```
public/            statische Seite (index.html, styles.css, app.js, favicon.png, _headers)
wrangler.jsonc     Cloudflare-Konfiguration
```

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:8787
npm run check      # Syntax-Check
```

## Deployen (ohne lokale Installation)

1. Im [Cloudflare-Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Import a repository**.
2. GitHub verbinden und `tbsxxl/wizard` auswählen.
3. Einstellungen übernehmen (Cloudflare erkennt `wrangler.jsonc`; Deploy-Befehl `npx wrangler deploy`) → **Deploy**.

Danach deployt Cloudflare bei jedem Push auf den Produktions-Branch automatisch.
Die URL lautet `https://wizard.<dein-account>.workers.dev`; eigene Domain unter Worker → Settings → Domains & Routes.

Hinweis: Der Spielstand liegt im `localStorage` der jeweiligen Domain. Ein laufendes Spiel von der bisherigen
Adresse (z. B. GitHub Pages) vorher über **⋯ → Export (JSON)** sichern und auf der neuen Adresse importieren.
