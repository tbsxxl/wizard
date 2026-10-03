/* app.js — Wizard Punktezähler (ohne Abhängigkeiten, Spielstand lokal im Browser) */
(() => {
  "use strict";

  const R = window.WizardRules;
  const KEY = "wizard_state_v2";
  const OLD_KEY = "wizard.tracker.v1";
  const UNDO_KEY = "wizard_undo_v1";
  const PREFS_KEY = "wizard_prefs_v1";
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 6;
  const UNDO_LIMIT = 40;

  const $ = (id) => document.getElementById(id);
  const el = {
    subline: $("subline"), undoBtn: $("undoBtn"), tableBtn: $("tableBtn"), menuBtn: $("menuBtn"),
    setupView: $("setupView"), gameView: $("gameView"), endView: $("endView"),
    playerCount: $("playerCount"), setupPlayers: $("setupPlayers"), addForm: $("addForm"), addName: $("addName"),
    nameSuggestions: $("nameSuggestions"), recentNames: $("recentNames"),
    modeSeg: $("modeSeg"), modeHint: $("modeHint"), maxRow: $("maxRow"), maxHint: $("maxHint"),
    maxMinus: $("maxMinus"), maxPlus: $("maxPlus"), maxValue: $("maxValue"), ruleNoEven: $("ruleNoEven"),
    editBanner: $("editBanner"), editText: $("editText"), editCancel: $("editCancel"),
    handValue: $("handValue"), handLabel: $("handLabel"), handStepper: $("handStepper"),
    handMinus: $("handMinus"), handPlus: $("handPlus"),
    roundTitle: $("roundTitle"), dealerLine: $("dealerLine"), progress: $("progress"), sumLine: $("sumLine"),
    phaseBids: $("phaseBids"), phaseTricks: $("phaseTricks"), playerList: $("playerList"),
    winnerName: $("winnerName"), winnerScore: $("winnerScore"), finalList: $("finalList"),
    showTableBtn: $("showTableBtn"), continueBtn: $("continueBtn"),
    primaryBtn: $("primaryBtn"), toast: $("toast"), toastText: $("toastText"), toastUndo: $("toastUndo"),
    tableDialog: $("tableDialog"), tableWrap: $("tableWrap"),
    menuDialog: $("menuDialog"), rematchBtn: $("rematchBtn"), finishBtn: $("finishBtn"), newGameBtn: $("newGameBtn"),
    themeSeg: $("themeSeg"), wakeToggle: $("wakeToggle"), hapticToggle: $("hapticToggle"),
    exportBtn: $("exportBtn"), importBtn: $("importBtn"),
    ioDialog: $("ioDialog"), ioTitle: $("ioTitle"), ioText: $("ioText"), ioPrimary: $("ioPrimary"),
    randomDealer: $("randomDealer"),
    confirmDialog: $("confirmDialog"), confirmTitle: $("confirmTitle"), confirmText: $("confirmText"),
    confirmNo: $("confirmNo"), confirmYes: $("confirmYes"),
  };

  /* ---------- Zustand ---------- */

  const prefs = Object.assign({ theme: "system", wake: true, haptics: true, names: [] }, read(PREFS_KEY) || {});
  let state = loadState();
  let undoStack = (read(UNDO_KEY) || [])
    .map((e) => (typeof e === "string" ? { s: e, label: "" } : e))
    .filter((e) => e && typeof e.s === "string")
    .slice(-UNDO_LIMIT);

  function freshState(players = []) {
    return {
      version: 2, started: false, finished: false,
      players, dealerStart: 0,
      settings: { mode: "standard", maxHand: null, noEven: false },
      rounds: [], current: emptyDraft(), phase: "bids", editing: null, stash: null,
    };
  }
  function emptyDraft(hand = 1) { return { bids: {}, tricks: {}, hand }; }

  function loadState() {
    const s = normalize(read(KEY));
    if (s) return s;
    const old = migrateV1(read(OLD_KEY));   // Spielstand der Vorversion übernehmen
    return old || freshState();
  }

  function normalize(o) {
    if (!o || typeof o !== "object") return null;
    if (o.version !== 2) return migrateV1(o);
    const s = freshState();
    s.players = (Array.isArray(o.players) ? o.players : [])
      .filter((p) => p && p.id != null)
      .slice(0, MAX_PLAYERS)
      .map((p) => ({ id: String(p.id), name: String(p.name || "Spieler").slice(0, 20) }));
    const ids = s.players.map((p) => p.id);
    const intMap = (m, max) => {
      const out = {};
      for (const id of ids) { const v = m && m[id]; if (Number.isInteger(v) && v >= 0 && v <= max) out[id] = v; }
      return out;
    };
    const mode = ["standard", "updown", "manual"].includes(o.settings && o.settings.mode) ? o.settings.mode : "standard";
    s.settings = {
      mode,
      maxHand: Number.isInteger(o.settings && o.settings.maxHand) ? o.settings.maxHand : null,
      noEven: !!(o.settings && o.settings.noEven),
    };
    s.dealerStart = Number.isInteger(o.dealerStart) ? o.dealerStart : 0;
    s.rounds = (Array.isArray(o.rounds) ? o.rounds : []).map((r) => {
      const hand = clamp(r && r.hand, 1, R.DECK) || 1;
      return { hand, bids: intMap(r.bids, hand), tricks: intMap(r.tricks, hand), at: Number(r.at) || Date.now() };
    });
    const c = o.current || {};
    s.current = { bids: intMap(c.bids, R.DECK), tricks: intMap(c.tricks, R.DECK), hand: clamp(c.hand, 1, R.DECK) || 1 };
    s.started = !!o.started && s.players.length >= MIN_PLAYERS;
    s.finished = !!o.finished && s.started;
    s.phase = o.phase === "tricks" ? "tricks" : "bids";
    if (Number.isInteger(o.editing) && o.editing >= 0 && o.editing < s.rounds.length && o.stash) {
      s.editing = o.editing;
      s.stash = { bids: intMap(o.stash.bids, R.DECK), tricks: intMap(o.stash.tricks, R.DECK), hand: clamp(o.stash.hand, 1, R.DECK) || 1, phase: o.stash.phase === "tricks" ? "tricks" : "bids" };
    }
    return s;
  }

  /* Format der ersten Version: { players:[{id,name,total}], rounds:[{handSize, entry:{id:{bid,won}}}], settings:{mode,maxHand} } */
  function migrateV1(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.players)) return null;
    const s = freshState(o.players.slice(0, MAX_PLAYERS).map((p) => ({ id: String(p.id || uid()), name: String(p.name || "Spieler").slice(0, 20) })));
    const m = o.settings && o.settings.mode;
    s.settings.mode = m === "updown" ? "updown" : m === "manual" ? "manual" : "standard";
    const auto = R.maxHand(s.players.length);
    const mh = clamp(o.settings && o.settings.maxHand, 1, auto);
    s.settings.maxHand = mh && mh !== auto ? mh : null;
    s.rounds = (Array.isArray(o.rounds) ? o.rounds : []).slice().sort((a, b) => (a.index || 0) - (b.index || 0)).map((r) => {
      const bids = {}, tricks = {};
      for (const p of s.players) {
        const e = r.entry && r.entry[p.id];
        if (e && Number.isInteger(e.bid) && Number.isInteger(e.won)) { bids[p.id] = e.bid; tricks[p.id] = e.won; }
      }
      return { hand: clamp(r.handSize, 1, R.DECK) || 1, bids, tricks, at: Number(r.createdAt) || Date.now() };
    });
    s.started = s.rounds.length > 0 && s.players.length >= MIN_PLAYERS;
    const sch = s.started && schedFor(s);
    s.finished = !!(sch && s.rounds.length >= sch.length);
    s.current.hand = nextManualHand(s);
    return s;
  }

  function save() {
    write(KEY, state);
    write(UNDO_KEY, undoStack);
  }

  /* Jede Änderung läuft hierüber. undo: false = ohne Rückgängig-Schritt, Text = Beschriftung des Schritts. */
  function commit(fn, undo = "") {
    if (undo !== false) {
      undoStack.push({ s: JSON.stringify(state), label: undo || "" });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    fn();
    save();
    render();
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    state = normalize(JSON.parse(prev.s)) || state;
    save();
    render();
    toast(prev.label ? `Rückgängig: ${prev.label}` : "Rückgängig gemacht");
    haptic(15);
  }

  /* ---------- Abgeleitete Werte ---------- */

  const n = () => state.players.length;
  function maxFor(s) {
    const auto = R.maxHand(s.players.length);
    return clamp(s.settings.maxHand, 1, auto) || auto;
  }
  function schedFor(s) { return R.schedule(s.settings.mode, maxFor(s)); }
  const sched = () => schedFor(state);
  const totalRounds = () => { const sc = sched(); return sc ? sc.length : null; };
  const entryIndex = () => (state.editing != null ? state.editing : state.rounds.length);
  function entryHand() {
    if (state.editing != null || state.settings.mode === "manual") return state.current.hand;
    const sc = sched();
    return sc[Math.min(entryIndex(), sc.length - 1)];
  }
  function nextManualHand(s) {
    const last = s.rounds[s.rounds.length - 1];
    return last ? Math.min(last.hand + 1, R.maxHand(s.players.length)) : 1;
  }
  /* Spieler in Ansage-Reihenfolge der Runde: links vom Geber beginnend, Geber zuletzt. */
  function biddingOrder(idx) {
    const first = R.firstBidderOf(idx, state.dealerStart, n());
    return state.players.map((_, i) => state.players[(first + i) % n()]);
  }
  const dealerOf = (idx) => state.players[R.dealerOf(idx, state.dealerStart, n())];
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  const allSet = (m) => state.players.every((p) => Number.isInteger(m[p.id]));

  function forbiddenFor(pid) {
    if (!state.settings.noEven) return null;
    const dealer = dealerOf(entryIndex());
    if (!dealer || dealer.id !== pid) return null;
    const others = state.players.filter((p) => p.id !== pid).map((p) => state.current.bids[p.id]);
    if (!others.every(Number.isInteger)) return null;
    return R.forbiddenBid(entryHand(), others);
  }

  /* ---------- Aktionen ---------- */

  const findDup = (name, exceptId) => state.players.find((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
  const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, 20);

  function addPlayer(name) {
    name = cleanName(name);
    if (!name || state.started) return;
    if (n() >= MAX_PLAYERS) return toast(`Höchstens ${MAX_PLAYERS} Spieler`);
    if (findDup(name)) return toast(`„${name}" ist schon dabei`);
    commit(() => { state.players.push({ id: uid(), name }); }, false);
  }

  function renamePlayer(id, name) {
    name = cleanName(name);
    const p = state.players.find((x) => x.id === id);
    if (!p || name === p.name) return;
    if (!name || findDup(name, id)) {
      if (name) toast(`„${name}" ist schon dabei`);
      return render();
    }
    commit(() => { p.name = name; }, `${p.name} umbenannt`);
  }

  function removePlayer(id) {
    const p = state.players.find((x) => x.id === id);
    commit(() => {
      const i = state.players.indexOf(p);
      state.players.splice(i, 1);
      if (state.dealerStart >= n()) state.dealerStart = 0;
      else if (i < state.dealerStart) state.dealerStart--;
    }, `${p.name} entfernt`);
    toast(`${p.name} entfernt`, true);
  }

  function movePlayer(id, dir) {
    commit(() => {
      const i = state.players.findIndex((p) => p.id === id), j = i + dir;
      if (j < 0 || j >= n()) return;
      const dealerId = state.players[state.dealerStart].id;
      [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
      state.dealerStart = state.players.findIndex((p) => p.id === dealerId);
    }, false);
  }

  function drawDealer() {
    if (n() < 2) return;
    const i = Math.floor(Math.random() * n());
    commit(() => { state.dealerStart = i; }, false);
    haptic([8, 30, 8]);
    toast(`${state.players[i].name} gibt zuerst`);
  }

  function startGame() {
    if (n() < MIN_PLAYERS) return;
    rememberNames();
    commit(() => {
      state.started = true;
      state.finished = false;
      state.rounds = [];
      state.current = emptyDraft(1);
      state.phase = "bids";
    }, "Spielstart");
    requestWake();
  }

  function setValue(kind, pid, v) {
    const m = state.current[kind];
    const wasComplete = allSet(m);
    if (m[pid] === v) delete m[pid];  // erneutes Antippen hebt die Auswahl auf
    else m[pid] = v;
    haptic(8);
    let autoFilled = null;
    if (kind === "tricks" && m[pid] !== undefined) {
      // Letzter offener Spieler: Stiche ergeben sich aus der Kartenzahl
      const open = state.players.filter((p) => !Number.isInteger(m[p.id]));
      const rest = entryHand() - sum(m);
      if (open.length === 1 && rest >= 0) { m[open[0].id] = rest; autoFilled = open[0].id; }
    }
    // Alle Ansagen da → automatisch weiter zu den Stichen (nur beim Abschluss, nicht beim Korrigieren)
    const autoAdvance = kind === "bids" && !wasComplete && allSet(m) && state.editing == null;
    commit(() => {}, false);
    if (autoFilled) flash(autoFilled);
    else focusNext(kind, pid);
    if (autoAdvance) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => {
        if (state.phase !== "bids" || !allSet(state.current.bids)) return;
        commit(() => { state.phase = "tricks"; }, false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast("Ansagen komplett – nach der Runde Stiche eintragen");
      }, 650);
    }
  }
  let advanceTimer = 0;

  function nextPhase() {
    if (!allSet(state.current.bids)) return;
    clearTimeout(advanceTimer);
    commit(() => { state.phase = "tricks"; }, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRound() {
    const c = state.current, hand = entryHand();
    if (!allSet(c.bids) || !allSet(c.tricks)) return;
    const t = sum(c.tricks);
    if (t !== hand && !(await ask({
      title: "Stiche passen nicht",
      text: `Eingetragen sind ${t} Stiche, gespielt wurden ${hand} ${hand === 1 ? "Karte" : "Karten"}. Trotzdem speichern?`,
      yes: "Trotzdem speichern",
    }))) return;

    const round = { hand, bids: { ...c.bids }, tricks: { ...c.tricks }, at: Date.now() };
    if (state.editing != null) {
      const idx = state.editing;
      commit(() => {
        round.at = state.rounds[idx].at;
        state.rounds[idx] = round;
        restoreStash();
      }, `Runde ${idx + 1} korrigiert`);
      toast(`Runde ${idx + 1} korrigiert`, true);
      return;
    }
    const no = state.rounds.length + 1;
    commit(() => {
      state.rounds.push(round);
      const total = totalRounds();
      if (total && state.rounds.length >= total) state.finished = true;
      state.current = emptyDraft(nextManualHand(state));
      state.phase = "bids";
    }, `Runde ${no} gespeichert`);
    haptic([10, 40, 10]);
    toast(state.finished ? "Letzte Runde gespeichert" : `Runde ${no} gespeichert`, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(idx) {
    if (state.editing != null) return;
    const r = state.rounds[idx];
    commit(() => {
      state.stash = { ...state.current, phase: state.phase };
      state.current = { bids: { ...r.bids }, tricks: { ...r.tricks }, hand: r.hand };
      state.editing = idx;
      state.phase = "tricks";
    }, false);
    window.scrollTo({ top: 0 });
  }

  function restoreStash() {
    const st = state.stash || { ...emptyDraft(nextManualHand(state)), phase: "bids" };
    state.current = { bids: st.bids, tricks: st.tricks, hand: st.hand };
    state.phase = st.phase;
    state.editing = null;
    state.stash = null;
  }

  async function finishGame() {
    if (!state.rounds.length) return toast("Noch keine Runde gespielt");
    const total = totalRounds();
    if (total && state.rounds.length < total && !(await ask({
      title: "Spiel vorzeitig beenden?",
      text: `${state.rounds.length} von ${total} Runden gespielt. Du kannst danach weiterspielen.`,
      yes: "Beenden",
    }))) return;
    commit(() => { if (state.editing != null) restoreStash(); state.finished = true; }, "Spiel beendet");
  }

  function rematch() {
    if (n() < MIN_PLAYERS) return;
    commit(() => {
      const keep = { players: state.players, settings: state.settings };
      const next = (state.dealerStart + 1) % n();
      state = freshState(keep.players);
      state.settings = keep.settings;
      state.dealerStart = next;
      state.started = true;
    }, "Revanche");
    toast(`Revanche – ${dealerOf(0).name} gibt`, true);
  }

  function newGame() {
    commit(() => {
      const keep = { players: state.players, settings: state.settings, dealerStart: state.dealerStart };
      state = freshState(keep.players);
      state.settings = keep.settings;
      state.dealerStart = keep.dealerStart;
    }, "Neues Spiel");
  }

  function rememberNames() {
    const names = state.players.map((p) => p.name);
    prefs.names = names.concat(prefs.names.filter((x) => !names.some((y) => y.toLowerCase() === x.toLowerCase()))).slice(0, 16);
    write(PREFS_KEY, prefs);
  }

  /* Eigener Bestätigungsdialog statt confirm(). */
  function ask({ title, text, yes = "OK", danger = false }) {
    return new Promise((resolve) => {
      const d = el.confirmDialog;
      el.confirmTitle.textContent = title;
      el.confirmText.textContent = text;
      el.confirmYes.textContent = yes;
      el.confirmYes.classList.toggle("btn--danger", danger);
      const done = (v) => { d.onclose = null; if (d.open) d.close(); resolve(v); };
      el.confirmYes.onclick = () => done(true);
      el.confirmNo.onclick = () => done(false);
      d.onclose = () => done(false);
      openDialog(d);
      el.confirmYes.focus();
    });
  }

  /* ---------- Darstellung ---------- */

  function render() {
    const view = !state.started ? "setup" : state.editing != null ? "game" : state.finished ? "end" : "game";
    el.setupView.hidden = view !== "setup";
    el.gameView.hidden = view !== "game";
    el.endView.hidden = view !== "end";
    el.undoBtn.disabled = undoStack.length === 0;
    el.tableBtn.disabled = !state.rounds.length;
    el.finishBtn.hidden = !state.started || state.finished;
    el.rematchBtn.hidden = !state.started;

    if (view === "setup") renderSetup();
    else if (view === "game") renderGame();
    else renderEnd();
    if (el.tableDialog.open) renderTable();
  }

  function renderSetup() {
    el.subline.textContent = "Neues Spiel";
    el.playerCount.textContent = n() ? `${n()}/${MAX_PLAYERS}` : "";
    el.randomDealer.hidden = n() < 2;
    el.setupPlayers.replaceChildren(...state.players.map((p, i) => {
      const li = h("li", "setupPlayer");
      const isDealer = i === state.dealerStart;
      const name = document.createElement("input");
      name.className = "setupPlayer__name";
      name.value = p.name;
      name.maxLength = 20;
      name.enterKeyHint = "done";
      name.setAttribute("aria-label", `Name von Spieler ${i + 1}`);
      name.addEventListener("change", () => renamePlayer(p.id, name.value));
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });
      li.append(
        h("span", "seat", String(i + 1)),
        name,
        btn(isDealer ? "chipBtn chipBtn--on" : "chipBtn", "Geber", () => commit(() => { state.dealerStart = i; }, false), { "aria-pressed": String(isDealer), title: "Gibt in Runde 1" }),
        iconBtn("i-up", "Nach oben", () => movePlayer(p.id, -1), i === 0),
        iconBtn("i-down", "Nach unten", () => movePlayer(p.id, 1), i === n() - 1),
        iconBtn("i-close", `${p.name} entfernen`, () => removePlayer(p.id)),
      );
      return li;
    }));
    if (!n()) el.setupPlayers.append(h("li", "emptyHint", "Noch niemand dabei – Namen unten eintragen."));
    el.addName.disabled = n() >= MAX_PLAYERS;
    el.addName.placeholder = n() >= MAX_PLAYERS ? "Alle Plätze belegt" : `Spieler ${n() + 1}`;

    const recent = prefs.names.filter((x) => !state.players.some((p) => p.name.toLowerCase() === x.toLowerCase()));
    el.nameSuggestions.replaceChildren(...recent.map((x) => { const o = document.createElement("option"); o.value = x; return o; }));
    el.recentNames.replaceChildren(...(n() < MAX_PLAYERS ? recent.slice(0, 8) : []).map((x) => btn("chipBtn", `+ ${x}`, () => addPlayer(x))));

    const mode = state.settings.mode, max = maxFor(state), auto = R.maxHand(Math.max(n(), 3));
    for (const b of el.modeSeg.children) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    const rounds = mode === "updown" ? max * 2 - 1 : max;
    el.modeHint.textContent = mode === "manual"
      ? "Kartenzahl jede Runde selbst wählen. Das Spiel endet über das Menü."
      : mode === "updown"
        ? `Bis ${max} Karten und wieder zurück – ${rounds} Runden.`
        : `Jede Runde eine Karte mehr bis ${max} – ${rounds} Runden.`;
    el.maxRow.hidden = mode === "manual";
    el.maxValue.textContent = String(max);
    el.maxHint.textContent = n() >= MIN_PLAYERS
      ? (max === R.maxHand(n()) ? `Volles Spiel bei ${n()} Spielern (60 ÷ ${n()})` : `Kürzeres Spiel – voll wären ${R.maxHand(n())}`)
      : `Bei 3 Spielern 20, bei 4 15, bei 5 12, bei 6 10`;
    el.maxMinus.disabled = max <= 1;
    el.maxPlus.disabled = max >= (n() ? R.maxHand(n()) : auto);
    el.ruleNoEven.checked = state.settings.noEven;

    const ok = n() >= MIN_PLAYERS;
    el.primaryBtn.textContent = ok ? (n() === 2 ? "Spiel starten (Wizard ist für 3–6)" : "Spiel starten") : `Noch ${MIN_PLAYERS - n()} Spieler hinzufügen`;
    el.primaryBtn.disabled = !ok;
    el.primaryBtn.onclick = startGame;
  }

  function renderGame() {
    const idx = entryIndex(), hand = entryHand(), total = totalRounds();
    const editing = state.editing != null, manual = state.settings.mode === "manual";
    const c = state.current, phase = state.phase;
    const dealer = dealerOf(idx);

    el.subline.textContent = leaderText();
    el.editBanner.hidden = !editing;
    el.editText.textContent = `Runde ${idx + 1} bearbeiten`;

    el.handValue.textContent = String(hand);
    el.handLabel.textContent = hand === 1 ? "Karte" : "Karten";
    el.handStepper.hidden = !(manual || editing);
    el.handMinus.disabled = hand <= 1;
    el.handPlus.disabled = hand >= R.maxHand(n());

    el.roundTitle.textContent = total ? `Runde ${idx + 1} von ${total}` : `Runde ${idx + 1}`;
    el.dealerLine.replaceChildren(svgIcon("i-deal"), document.createTextNode(` ${dealer.name} gibt · ${biddingOrder(idx)[0].name} ${phase === "bids" ? "sagt zuerst an" : "spielt aus"}`));
    el.progress.hidden = !total;
    if (total) el.progress.firstElementChild.style.width = `${Math.round((Math.min(state.rounds.length, total) / total) * 100)}%`;

    // Summen: angesagt vs. Kartenzahl bzw. Stiche vs. Kartenzahl
    if (phase === "bids") {
      // Über-/unterboten erst bewerten, wenn alle angesagt haben (vorher ist nur „überboten" sicher)
      const b = sum(c.bids), d = b - hand, complete = allSet(c.bids);
      const msg = complete
        ? (d > 0 ? `${d} überboten` : d < 0 ? `${-d} unterboten` : `<span class="warn">geht genau auf</span>`)
        : d > 0 ? `schon ${d} überboten` : "";
      el.sumLine.innerHTML = `Angesagt <b>${b}</b> von ${hand}${msg ? ` · ${msg}` : ""}`;
    } else {
      const t = sum(c.tricks), d = hand - t;
      const msg = d > 0 ? `${d} offen` : d < 0 ? `<span class="bad">${-d} zu viel</span>` : `<span class="good">passt</span>`;
      el.sumLine.innerHTML = `Stiche <b>${t}</b> von ${hand} · ${msg}`;
    }

    const bidsDone = allSet(c.bids);
    el.phaseBids.setAttribute("aria-selected", String(phase === "bids"));
    el.phaseTricks.setAttribute("aria-selected", String(phase === "tricks"));
    el.phaseBids.classList.toggle("done", bidsDone);

    const st = R.standings(state.players, state.rounds);
    const rank = Object.fromEntries(st.map((p) => [p.id, p]));
    const leaderTotal = st.length ? st[0].total : 0;
    const order = biddingOrder(idx);
    const turn = order.find((p) => !Number.isInteger(c[phase][p.id]));
    const last = editing ? null : state.rounds[state.rounds.length - 1];
    el.playerList.replaceChildren(...order.map((p) => playerCard(p, rank[p.id], leaderTotal, dealer.id === p.id, hand, phase, turn && turn.id === p.id, last)));

    if (phase === "bids") {
      el.primaryBtn.textContent = bidsDone ? "Weiter zu den Stichen" : `Noch ${state.players.filter((p) => !Number.isInteger(c.bids[p.id])).length} Ansage(n) offen`;
      el.primaryBtn.disabled = !bidsDone;
      el.primaryBtn.onclick = nextPhase;
    } else {
      const done = bidsDone && allSet(c.tricks);
      const open = state.players.filter((p) => !Number.isInteger(c.tricks[p.id])).length;
      el.primaryBtn.textContent = done ? (editing ? "Änderung speichern" : total && idx + 1 >= total ? "Letzte Runde speichern" : "Runde speichern")
        : !bidsDone ? "Erst alle Ansagen eintragen" : `Noch ${open} Spieler offen`;
      el.primaryBtn.disabled = !done;
      el.primaryBtn.onclick = saveRound;
    }
  }

  function playerCard(p, standing, leaderTotal, isDealer, hand, phase, isTurn, lastRound) {
    const c = state.current;
    const bid = c.bids[p.id], tr = c.tricks[p.id];
    const card = h("article", "pCard");
    card.dataset.pid = p.id;
    const filled = Number.isInteger(phase === "bids" ? bid : tr);
    card.classList.toggle("pCard--done", filled);
    card.classList.toggle("pCard--turn", !!isTurn);

    const head = h("div", "pCard__head");
    const lead = standing.total === leaderTotal && state.rounds.length > 0;
    const name = h("div", "pCard__name");
    if (lead) name.append(svgIcon("i-crown", "crown"));
    name.append(document.createTextNode(p.name));
    if (isDealer) name.append(h("span", "tag", "Geber"));
    if (isTurn) name.append(h("span", "tag tag--turn", "dran"));
    const meta = h("div", "pCard__meta", `${standing.total} P · Platz ${standing.rank}`);
    if (lastRound && Number.isInteger(lastRound.bids[p.id]) && Number.isInteger(lastRound.tricks[p.id])) {
      const ls = R.score(lastRound.bids[p.id], lastRound.tricks[p.id]);
      meta.append(document.createTextNode(" · zuletzt "), h("span", ls >= 0 ? "good" : "bad", fmtDelta(ls)));
    }
    const left = h("div", "pCard__left");
    left.append(name, meta);
    head.append(left);

    if (phase === "tricks" && Number.isInteger(bid)) {
      const right = h("div", "pCard__right");
      right.append(h("div", "pCard__bid", `Ansage ${bid}`));
      if (Number.isInteger(tr)) {
        const s = R.score(bid, tr);
        right.append(h("div", `pCard__pts ${s >= 0 ? "good" : "bad"}`, fmtDelta(s)));
      }
      head.append(right);
    }
    card.append(head);

    const kind = phase === "bids" ? "bids" : "tricks";
    const chosen = kind === "bids" ? bid : tr;
    const forbidden = kind === "bids" ? forbiddenFor(p.id) : null;
    const chips = h("div", "chips");
    chips.setAttribute("role", "radiogroup");
    chips.setAttribute("aria-label", `${kind === "bids" ? "Ansage" : "Stiche"} ${p.name}`);
    for (let v = 0; v <= hand; v++) {
      const b = btn("chip", String(v), () => setValue(kind, p.id, v), { role: "radio", "aria-checked": String(chosen === v) });
      if (kind === "tricks" && v === bid) b.classList.add("chip--target");
      if (v === forbidden) {
        b.disabled = true;
        b.classList.add("chip--forbidden");
        b.title = "Nicht erlaubt: Ansagen würden aufgehen";
      }
      chips.append(b);
    }
    card.append(chips);
    return card;
  }

  function renderEnd() {
    const st = R.standings(state.players, state.rounds);
    const winners = st.filter((p) => p.rank === 1);
    el.subline.textContent = `Spielende nach ${state.rounds.length} ${state.rounds.length === 1 ? "Runde" : "Runden"}`;
    el.winnerName.textContent = winners.map((p) => p.name).join(" & ");
    el.winnerScore.textContent = `${fmtNum(winners[0].total)} Punkte${winners.length > 1 ? " · Gleichstand" : ""}`;
    el.finalList.replaceChildren(...st.map((p) => {
      const li = h("li", "finalRow");
      const played = state.rounds.filter((r) => Number.isInteger(r.bids[p.id]) && Number.isInteger(r.tricks[p.id]));
      const hits = played.filter((r) => r.bids[p.id] === r.tricks[p.id]).length;
      const best = played.length ? Math.max(...played.map((r) => R.score(r.bids[p.id], r.tricks[p.id]))) : 0;
      const info = h("span", "finalRow__info");
      info.append(h("span", "finalRow__name", p.name), h("span", "finalRow__stat", `${hits} von ${played.length} getroffen · beste Runde ${fmtDelta(best)}`));
      li.append(h("span", "seat", String(p.rank)), info, h("span", "finalRow__pts", fmtNum(p.total)));
      return li;
    }));
    const total = totalRounds();
    el.continueBtn.hidden = !(state.settings.mode === "manual" || (total && state.rounds.length < total));
    el.primaryBtn.textContent = "Revanche";
    el.primaryBtn.disabled = false;
    el.primaryBtn.onclick = rematch;
  }

  function renderTable() {
    const st = R.standings(state.players, state.rounds);
    const rank = Object.fromEntries(st.map((p) => [p.id, p.rank]));
    const t = h("table", "scoreTable");
    const thead = h("thead");
    const hr = h("tr");
    hr.append(h("th", "rcol", "#"), ...state.players.map((p) => h("th", "", p.name)));
    thead.append(hr);
    const tbody = h("tbody");
    const run = Object.fromEntries(state.players.map((p) => [p.id, 0]));
    state.rounds.forEach((r, i) => {
      const tr = h("tr", state.editing === i ? "editing" : "");
      tr.tabIndex = 0;
      tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", `Runde ${i + 1} bearbeiten`);
      const go = () => { el.tableDialog.close(); startEdit(i); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      const rc = h("td", "rcol");
      rc.append(h("b", "", String(i + 1)), h("small", "", `${r.hand} K.`));
      tr.append(rc);
      for (const p of state.players) {
        const b = r.bids[p.id], k = r.tricks[p.id];
        const td = h("td");
        if (Number.isInteger(b) && Number.isInteger(k)) {
          const s = R.score(b, k);
          run[p.id] += s;
          td.append(h("b", "", fmtNum(run[p.id])), h("small", s >= 0 ? "good" : "bad", `${b}/${k} · ${fmtDelta(s)}`));
        } else td.textContent = "–";
        tr.append(td);
      }
      tbody.append(tr);
    });
    const tfoot = h("tfoot");
    const fr = h("tr");
    fr.append(h("th", "rcol", "Σ"), ...state.players.map((p) => {
      const th = h("th", rank[p.id] === 1 ? "lead" : "");
      th.append(h("b", "", fmtNum(st.find((x) => x.id === p.id).total)), h("small", "", `Platz ${rank[p.id]}`));
      return th;
    }));
    tfoot.append(fr);
    t.append(thead, tbody, tfoot);
    el.tableWrap.replaceChildren(t);
  }

  const fmtDelta = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`;
  const fmtNum = (v) => (v < 0 ? `−${-v}` : String(v));

  function leaderText() {
    if (!state.rounds.length) return `${n()} Spieler · ${state.settings.mode === "updown" ? "Auf & Ab" : state.settings.mode === "manual" ? "freie Kartenzahl" : "1 → " + maxFor(state)}`;
    const st = R.standings(state.players, state.rounds);
    const top = st.filter((p) => p.rank === 1);
    if (top.length > 1) return `Gleichstand: ${top.map((p) => p.name).join(", ")} · ${fmtNum(top[0].total)}`;
    const gap = st[1] ? top[0].total - st[1].total : 0;
    return `${top[0].name} führt · ${fmtNum(top[0].total)} P${gap ? ` (+${gap})` : ""}`;
  }

  /* ---------- Rückmeldungen ---------- */

  let toastTimer = 0;
  function toast(text, withUndo = false) {
    el.toastText.textContent = text;
    el.toastUndo.hidden = !withUndo;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, withUndo ? 5000 : 2600);
  }
  function hideToast() { el.toast.classList.remove("show"); }

  function flash(pid) {
    const card = el.playerList.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (card) { card.classList.add("pCard--flash"); setTimeout(() => card.classList.remove("pCard--flash"), 700); }
  }

  /* Nach einer Auswahl die nächste offene Karte in den sichtbaren Bereich holen. */
  function focusNext(kind, pid) {
    if (!Number.isInteger(state.current[kind][pid])) return;
    const order = biddingOrder(entryIndex());
    const i = order.findIndex((p) => p.id === pid);
    const next = order.slice(i + 1).concat(order.slice(0, i)).find((p) => !Number.isInteger(state.current[kind][p.id]));
    if (!next) return;
    const card = el.playerList.querySelector(`[data-pid="${CSS.escape(next.id)}"]`);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const bottom = window.innerHeight - el.primaryBtn.parentElement.offsetHeight;
    if (r.bottom > bottom || r.top < 70) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function haptic(p) { if (prefs.haptics && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }

  /* ---------- Einstellungen: Theme, Wake Lock ---------- */

  const darkMq = matchMedia("(prefers-color-scheme: dark)");
  function applyTheme() {
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && darkMq.matches);
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]').content = dark ? "#15131c" : "#f7f4ee";
    for (const b of el.themeSeg.children) b.setAttribute("aria-checked", String(b.dataset.theme === prefs.theme));
  }
  darkMq.addEventListener("change", applyTheme);

  let wakeLock = null;
  async function requestWake() {
    if (!prefs.wake || !state.started || !("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  document.addEventListener("visibilitychange", requestWake);

  /* ---------- Dialoge ---------- */

  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  for (const d of [el.tableDialog, el.menuDialog, el.ioDialog, el.confirmDialog]) {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();  // Klick auf den Hintergrund schließt
    });
  }

  function openIO(mode) {
    el.menuDialog.close();
    el.ioTitle.textContent = mode === "export" ? "Export" : "Import";
    el.ioText.value = mode === "export" ? JSON.stringify(exportable(), null, 2) : "";
    el.ioText.readOnly = mode === "export";
    el.ioText.placeholder = mode === "import" ? "Exportierten Spielstand hier einfügen" : "";
    el.ioPrimary.textContent = mode === "export" ? "Kopieren" : "Importieren";
    el.ioPrimary.onclick = mode === "export" ? copyExport : doImport;
    openDialog(el.ioDialog);
    if (mode === "export") el.ioText.select(); else el.ioText.focus();
  }
  function exportable() {
    const { stash, editing, ...rest } = state;
    const s = JSON.parse(JSON.stringify(rest));
    if (state.editing != null) Object.assign(s, { current: { bids: stash.bids, tricks: stash.tricks, hand: stash.hand }, phase: stash.phase });
    return s;
  }
  async function copyExport() {
    try { await navigator.clipboard.writeText(el.ioText.value); el.ioPrimary.textContent = "Kopiert ✓"; }
    catch (e) { el.ioText.select(); el.ioPrimary.textContent = "Markiert – jetzt kopieren"; }
  }
  function doImport() {
    let parsed;
    try { parsed = JSON.parse(el.ioText.value.trim()); } catch (e) { return toast("Kein gültiges JSON"); }
    const s = normalize(parsed);
    if (!s) return toast("Spielstand nicht erkannt");
    commit(() => { state = s; });
    el.ioDialog.close();
    toast("Spielstand importiert", true);
  }

  /* ---------- Ereignisse ---------- */

  el.undoBtn.addEventListener("click", undo);
  el.toastUndo.addEventListener("click", undo);
  el.tableBtn.addEventListener("click", () => { renderTable(); openDialog(el.tableDialog); });
  el.showTableBtn.addEventListener("click", () => { renderTable(); openDialog(el.tableDialog); });
  el.menuBtn.addEventListener("click", () => {
    el.wakeToggle.checked = prefs.wake;
    el.hapticToggle.checked = prefs.haptics;
    applyTheme();
    openDialog(el.menuDialog);
  });

  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addPlayer(el.addName.value);
    el.addName.value = "";
    el.addName.focus();
  });
  el.modeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) commit(() => { state.settings.mode = b.dataset.mode; }, false);
  });
  const stepMax = (d) => commit(() => {
    const cap = R.maxHand(Math.max(n(), 1));
    const v = Math.min(cap, Math.max(1, maxFor(state) + d));
    state.settings.maxHand = v === R.maxHand(n()) ? null : v;
  }, false);
  el.maxMinus.addEventListener("click", () => stepMax(-1));
  el.maxPlus.addEventListener("click", () => stepMax(1));
  el.ruleNoEven.addEventListener("change", () => commit(() => { state.settings.noEven = el.ruleNoEven.checked; }, false));

  const stepHand = (d) => commit(() => {
    const c = state.current;
    c.hand = Math.min(R.maxHand(n()), Math.max(1, c.hand + d));
    for (const m of [c.bids, c.tricks]) for (const k of Object.keys(m)) if (m[k] > c.hand) delete m[k];
  }, false);
  el.handMinus.addEventListener("click", () => stepHand(-1));
  el.handPlus.addEventListener("click", () => stepHand(1));

  el.phaseBids.addEventListener("click", () => commit(() => { state.phase = "bids"; }, false));
  el.phaseTricks.addEventListener("click", () => commit(() => { state.phase = "tricks"; }, false));
  el.editCancel.addEventListener("click", () => commit(restoreStash, false));
  el.continueBtn.addEventListener("click", () => commit(() => { state.finished = false; }));

  el.rematchBtn.addEventListener("click", async () => {
    el.menuDialog.close();
    if (state.rounds.length && !state.finished && !(await ask({ title: "Revanche starten?", text: "Das laufende Spiel wird verworfen (lässt sich rückgängig machen).", yes: "Revanche", danger: true }))) return;
    rematch();
  });
  el.finishBtn.addEventListener("click", () => { el.menuDialog.close(); finishGame(); });
  el.newGameBtn.addEventListener("click", async () => {
    el.menuDialog.close();
    if (state.rounds.length && !state.finished && !(await ask({ title: "Neues Spiel?", text: "Das laufende Spiel wird verworfen (lässt sich rückgängig machen).", yes: "Neues Spiel", danger: true }))) return;
    newGame();
  });
  el.randomDealer.addEventListener("click", drawDealer);
  el.themeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme]");
    if (!b) return;
    prefs.theme = b.dataset.theme;
    write(PREFS_KEY, prefs);
    applyTheme();
  });
  el.wakeToggle.addEventListener("change", () => {
    prefs.wake = el.wakeToggle.checked;
    write(PREFS_KEY, prefs);
    if (prefs.wake) requestWake(); else releaseWake();
  });
  el.hapticToggle.addEventListener("change", () => { prefs.haptics = el.hapticToggle.checked; write(PREFS_KEY, prefs); });
  el.exportBtn.addEventListener("click", () => openIO("export"));
  el.importBtn.addEventListener("click", () => openIO("import"));

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.target.closest("input, textarea")) { e.preventDefault(); undo(); }
  });

  /* ---------- Hilfsfunktionen ---------- */

  function h(tag, cls, text) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }
  function btn(cls, text, onClick, attrs = {}) {
    const b = h("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
    return b;
  }
  function svgIcon(id, cls = "ico") {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", cls);
    s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", `#${id}`);
    s.append(u);
    return s;
  }
  function iconBtn(icon, label, onClick, disabled = false) {
    const b = btn("iconBtn iconBtn--flat iconBtn--small", null, onClick, { "aria-label": label, title: label });
    b.append(svgIcon(icon));
    b.disabled = disabled;
    return b;
  }
  function clamp(v, min, max) {
    const x = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.trunc(x))) : null;
  }
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- Start ---------- */

  applyTheme();
  save();
  render();
  requestWake();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
