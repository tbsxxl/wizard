/* rules.js — Wizard Spielregeln (ohne DOM, auch in Node testbar) */
(function (root) {
  "use strict";

  const DECK = 60;        // 52 Farbkarten + 4 Zauberer + 4 Narren
  const SHEET_CAP = 20;   // offizieller Block: höchstens 20 Runden

  /* Höchste Kartenzahl pro Spieler: 60 / Spieler (3 → 20, 4 → 15, 5 → 12, 6 → 10). */
  function maxHand(players) {
    const n = Math.max(1, players | 0);
    return Math.max(1, Math.min(SHEET_CAP, Math.floor(DECK / n)));
  }

  /* Kartenzahl je Runde. standard: 1 … max, updown: 1 … max … 1, manual: frei (null). */
  function schedule(mode, max) {
    const m = Math.max(1, max | 0);
    const up = Array.from({ length: m }, (_, i) => i + 1);
    if (mode === "updown") return up.concat(up.slice(0, -1).reverse());
    if (mode === "manual") return null;
    return up;
  }

  /* Richtig angesagt: 20 + 10 je Stich. Daneben: −10 je Stich Abweichung. */
  function score(bid, tricks) {
    if (bid === tricks) return 20 + 10 * tricks;
    return -10 * Math.abs(bid - tricks);
  }

  /* Variante „Ansagen dürfen nicht aufgehen": Der Geber (sagt als Letzter an) darf die Ansage nicht so wählen,
     dass die Summe genau der Kartenzahl entspricht. Liefert die verbotene Zahl oder null. */
  function forbiddenBid(hand, otherBids) {
    const sum = otherBids.reduce((a, b) => a + b, 0);
    const f = hand - sum;
    return f >= 0 && f <= hand ? f : null;
  }

  /* Geber in Runde i (0-basiert) und wer zuerst ansagt (links vom Geber). */
  function dealerOf(roundIndex, start, players) {
    return players > 0 ? (((start + roundIndex) % players) + players) % players : 0;
  }
  function firstBidderOf(roundIndex, start, players) {
    return players > 0 ? (dealerOf(roundIndex, start, players) + 1) % players : 0;
  }

  /* Gesamtpunkte je Spieler-ID aus allen Runden. */
  function totals(players, rounds) {
    const t = {};
    for (const p of players) t[p.id] = 0;
    for (const r of rounds) {
      for (const p of players) {
        const b = r.bids[p.id], k = r.tricks[p.id];
        if (Number.isInteger(b) && Number.isInteger(k)) t[p.id] += score(b, k);
      }
    }
    return t;
  }

  /* Rangliste mit geteilten Plätzen (1, 1, 3 …). */
  function standings(players, rounds) {
    const t = totals(players, rounds);
    const list = players.map((p, seat) => ({ ...p, seat, total: t[p.id] }));
    list.sort((a, b) => b.total - a.total || a.seat - b.seat);
    let rank = 0;
    list.forEach((p, i) => { if (i === 0 || p.total !== list[i - 1].total) rank = i + 1; p.rank = rank; });
    return list;
  }

  root.WizardRules = { DECK, SHEET_CAP, maxHand, schedule, score, forbiddenBid, dealerOf, firstBidderOf, totals, standings };
})(typeof globalThis !== "undefined" ? globalThis : this);
