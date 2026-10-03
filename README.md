# Wizard – Punktezähler

Offline-fähiger Punktezähler für das Kartenspiel **Wizard**: Ansagen und Stiche antippen, die Wertung
(richtig angesagt = 20 + 10 je Stich, sonst −10 je Stich Abweichung) läuft automatisch mit.

Läuft als statische Seite auf **Cloudflare Workers** (Static Assets, kein Server-Code) und lässt sich als App installieren.

## Funktionen

- Spieler in Sitzreihenfolge, ersten Geber wählen, Namen aus früheren Spielen als Vorschläge
- Spielart: 1 → Max, Auf & Ab (1 → Max → 1) oder frei; Rundenzahl automatisch nach 60 ÷ Spieler, kürzeres Spiel möglich
- Pro Runde zwei Schritte: erst Ansagen, dann Stiche – jeweils ein Tipp pro Spieler, in Ansage-Reihenfolge (links vom Geber)
- Geber wandert jede Runde weiter; Summe der Ansagen (über-/unterboten) und Stiche wird geprüft
- Stiche des letzten Spielers werden automatisch ergänzt
- Optionale Regel „Ansagen dürfen nicht aufgehen" (verbotene Ansage des Gebers wird gesperrt)
- Punktetabelle wie auf dem Block, vergangene Runden antippen und korrigieren
- Spielende mit Gewinner, Gleichstand, Trefferquote und Revanche
- Rückgängig für jede Aktion (bleibt auch nach Neuladen erhalten), Export/Import als JSON
- Hell / Dunkel / Auto, Bildschirm anlassen, Vibration, offline dank Service Worker
- Spielstand der Vorversion wird übernommen

## Aufbau

```
public/            statische Seite (index.html, styles.css, app.js, rules.js, sw.js, manifest, icons, _headers)
test/              Tests der Spielregeln (node test/rules.test.mjs)
wrangler.jsonc     Cloudflare-Konfiguration
```

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:8787
npm run check      # Syntax-Check + Regel-Tests
```

## Deployen (ohne lokale Installation)

1. Im [Cloudflare-Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Import a repository**.
2. GitHub verbinden und `tbsxxl/wizard` auswählen.
3. Einstellungen übernehmen (Cloudflare erkennt `wrangler.jsonc`; Deploy-Befehl `npx wrangler deploy`) → **Deploy**.

Danach deployt Cloudflare bei jedem Push auf den Produktions-Branch automatisch.
Die URL lautet `https://wizard.<dein-account>.workers.dev`; eigene Domain unter Worker → Settings → Domains & Routes.

Hinweis: Der Spielstand liegt im `localStorage` der jeweiligen Domain. Ein laufendes Spiel von einer anderen
Adresse vorher über **Menü → Export** sichern und auf der neuen Adresse importieren.
