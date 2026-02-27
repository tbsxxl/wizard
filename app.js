/* Wizard – Score Tracker
   Local-first, no dependencies.
   Storage key: wizard.tracker.v1
*/
(() => {
  const STORAGE_KEY = "wizard.tracker.v1";

  /** @type {import('./types').State | any} */
  let state = loadState() || freshState();

  // Elements
  const el = {
    empty: byId("emptyState"),
    players: byId("playersContainer"),
    roundBadge: byId("roundBadge"),
    handBadge: byId("handBadge"),
    modeBadge: byId("modeBadge"),
    leaderName: byId("leaderName"),
    leaderScore: byId("leaderScore"),

    modeSelect: byId("modeSelect"),
    maxHandInput: byId("maxHandInput"),
    manageBtn: byId("manageBtn"),

    saveRoundBtn: byId("saveRoundBtn"),

    toolsBtn: byId("toolsBtn"),
    toolsMenu: byId("toolsMenu"),
    newGameBtn: byId("newGameBtn"),
    exportBtn: byId("exportBtn"),
    importBtn: byId("importBtn"),

    historyBtn: byId("historyBtn"),
    historyPanel: byId("historyPanel"),

    sheetOverlay: byId("sheetOverlay"),
    sheet: byId("sheet"),
    sheetCloseBtn: byId("sheetCloseBtn"),
    sheetPlayersList: byId("sheetPlayersList"),
    addName: byId("addName"),
    addBtn: byId("addBtn"),

    toast: byId("toast"),
    undoBtn: byId("undoBtn"),

    dialogOverlay: byId("dialogOverlay"),
    dialog: byId("dialog"),
    dialogTitle: byId("dialogTitle"),
    dialogCloseBtn: byId("dialogCloseBtn"),
    dialogText: byId("dialogText"),
    dialogPrimaryBtn: byId("dialogPrimaryBtn"),
    dialogSecondaryBtn: byId("dialogSecondaryBtn"),
  };

  // Wire base UI
  el.modeSelect.value = state.settings.mode;
  el.maxHandInput.value = String(state.settings.maxHand || "");
  el.modeSelect.addEventListener("change", () => {
    state.settings.mode = el.modeSelect.value;
    saveState();
    render();
  });

  el.maxHandInput.addEventListener("change", () => {
    const v = clampInt(parseInt(el.maxHandInput.value, 10), 1, 60);
    state.settings.maxHand = isFinite(v) ? v : autoMaxHand();
    el.maxHandInput.value = String(state.settings.maxHand);
    saveState();
    render();
  });

  el.manageBtn.addEventListener("click", () => openSheet());
  el.sheetCloseBtn.addEventListener("click", () => closeSheet());
  el.sheetOverlay.addEventListener("click", () => closeSheet());

  el.addBtn.addEventListener("click", () => addPlayerFromInput());
  el.addName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPlayerFromInput();
  });

  el.saveRoundBtn.addEventListener("click", () => saveRound());

  el.undoBtn.addEventListener("click", () => undoLastRoundFromToast());

  el.toolsBtn.addEventListener("click", () => toggleToolsMenu());
  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest("#toolsMenu") && !target.closest("#toolsBtn")) closeToolsMenu();
  });

  el.newGameBtn.addEventListener("click", () => {
    closeToolsMenu();
    if (!confirm("Neues Spiel starten? Alle Daten werden gelöscht.")) return;
    state = freshState();
    saveState();
    render();
  });

  el.exportBtn.addEventListener("click", () => {
    closeToolsMenu();
    openDialog("Export (JSON)", JSON.stringify(state, null, 2), "Kopieren", () => copyDialogText());
  });

  el.importBtn.addEventListener("click", () => {
    closeToolsMenu();
    openDialog("Import (JSON)", "", "Importieren", () => importFromDialog());
  });

  el.historyBtn.addEventListener("click", () => toggleHistory());

  el.dialogCloseBtn.addEventListener("click", closeDialog);
  el.dialogSecondaryBtn.addEventListener("click", closeDialog);
  el.dialogOverlay.addEventListener("click", closeDialog);

  // Initial normalization
  if (!state.settings.maxHand) state.settings.maxHand = autoMaxHand();
  el.maxHandInput.value = String(state.settings.maxHand);

  // Render
  render();

  // ---------- core logic ----------

  function saveRound() {
    if (state.players.length < 2) return;

    const handSize = currentHandSize();
    if (!handSize) {
      alert("Handgröße ist nicht gesetzt (Modus: Manuell).");
      return;
    }

    // Validate inputs
    const entry = {};
    for (const p of state.players) {
      const bid = clampInt(state.currentInputs[p.id]?.bid, 0, 60);
      const won = clampInt(state.currentInputs[p.id]?.won, 0, 60);
      if (bid === null || won === null) {
        alert("Bitte Ansage und Stiche für alle Spieler eintragen.");
        return;
      }
      if (bid > handSize || won > handSize) {
        alert(`Ansage/Stiche dürfen in dieser Runde max. ${handSize} sein.`);
        return;
      }
      entry[p.id] = { bid, won };
    }

    const scores = {};
    for (const p of state.players) {
      const { bid, won } = entry[p.id];
      scores[p.id] = scoreRound(bid, won);
    }

    const round = {
      id: uid(),
      index: state.rounds.length + 1,
      handSize,
      mode: state.settings.mode,
      entry,
      scores,
      createdAt: Date.now()
    };

    // Apply totals
    for (const p of state.players) {
      p.total += scores[p.id];
    }

    state.rounds.push(round);

    // Clear current inputs
    state.currentInputs = freshInputs();

    saveState();
    render();

    showToast(round.id);
  }

  function scoreRound(bid, won) {
    if (bid === won) return 20 + 10 * won;
    return -10 * Math.abs(bid - won);
  }

  function undoLastRoundFromToast() {
    const rid = state.ui?.lastSavedRoundId;
    if (!rid) return;
    undoRoundById(rid);
    hideToast();
  }

  function undoRoundById(roundId) {
    const idx = state.rounds.findIndex(r => r.id === roundId);
    if (idx < 0) return;

    const round = state.rounds[idx];

    // Revert totals
    for (const p of state.players) {
      p.total -= (round.scores[p.id] || 0);
    }

    state.rounds.splice(idx, 1);

    // Renumber
    state.rounds.forEach((r, i) => r.index = i + 1);

    saveState();
    render();
  }

  function currentHandSize() {
    const mode = state.settings.mode;
    if (mode === "manual") {
      // manual: user sets hand size via maxHandInput per round (abuse as "hand this round")
      const v = clampInt(parseInt(el.maxHandInput.value, 10), 1, 60);
      return v || null;
    }

    const max = clampInt(state.settings.maxHand, 1, 60) || autoMaxHand();
    const n = state.rounds.length; // already completed rounds
    if (mode === "up") return clampInt(n + 1, 1, max);

    // updown
    const seq = buildUpDownSequence(max);
    return seq[n] ?? null;
  }

  function buildUpDownSequence(max) {
    // 1..max..1 (without duplicating endpoints)
    const up = Array.from({ length: max }, (_, i) => i + 1);
    const down = Array.from({ length: max - 1 }, (_, i) => max - 1 - i);
    return up.concat(down);
  }

  function autoMaxHand() {
    // Common table rule: max hand = floor(60 / players)
    const n = Math.max(1, state.players.length);
    return Math.max(1, Math.floor(60 / n));
  }

  // ---------- render ----------

  function render() {
    // Settings availability
    const hasRounds = state.rounds.length > 0;
    const lockPlayers = hasRounds;

    // Auto max update (if player count changed and no rounds yet)
    if (!hasRounds) {
      state.settings.maxHand = clampInt(state.settings.maxHand, 1, 60) || autoMaxHand();
      el.maxHandInput.value = String(state.settings.mode === "manual" ? (state.settings.maxHand || 1) : state.settings.maxHand);
    }

    el.modeSelect.value = state.settings.mode;

    // Badges
    const currentRound = state.rounds.length + 1;
    el.roundBadge.textContent = `Runde: ${currentRound}`;
    const orb = document.getElementById('orbRound');
    if (orb) orb.textContent = String(currentRound);

    const hs = currentHandSize();
    el.handBadge.textContent = `Hand: ${hs ? hs : "–"}`;

    const modeLabel = state.settings.mode === "up" ? "1→Max" : state.settings.mode === "updown" ? "Up/Down" : "Manuell";
    el.modeBadge.textContent = `Modus: ${modeLabel}`;

    // Total rounds are constrained by Wizard deck size (60 cards incl. Wizards/Jesters)
        // Many official score sheets cap the maximum hand at 20.
        const DECK_SIZE = 60;
        const SHEET_CAP = 20;
    
        const playerCount = state.players.length || 0;
        const maxDealable = playerCount > 0 ? Math.floor(DECK_SIZE / playerCount) : 0;
        const recommendedMax = maxDealable > 0 ? Math.min(SHEET_CAP, maxDealable) : 0;
    
        let maxHand = state.settings.maxHand || 0;
        if (state.settings.mode !== 'manual') {
          // For auto modes, never exceed dealable cards per player and sheet cap
          if (recommendedMax > 0) maxHand = Math.min(maxHand, recommendedMax);
        }
    
        let totalRounds = 0;
        if (state.settings.mode === 'up') {
          totalRounds = maxHand;
        } else if (state.settings.mode === 'updown') {
          totalRounds = maxHand > 0 ? (maxHand * 2 - 1) : 0;
        } else {
          totalRounds = 0; // manual: not predetermined
        }
    
        const totalEl = document.getElementById('totalRoundsBadge');

    // Leader
    if (state.players.length === 0) {
      el.leaderName.textContent = "Noch keine Spieler";
      el.leaderScore.textContent = "";
    } else {
      const sorted = [...state.players].sort((a,b) => b.total - a.total);
      const top = sorted[0];
      el.leaderName.textContent = top.name;
      el.leaderScore.textContent = `${top.total} P`;
    }

    // Empty state
    el.empty.style.display = state.players.length ? "none" : "block";

    // Players grid
    el.players.innerHTML = "";
    for (const p of state.players) {
      el.players.appendChild(renderPlayerCard(p, hs));
    }

    // Save button state
    const canSave = state.players.length >= 2 && hs !== null;
    el.saveRoundBtn.disabled = !canSave;

    // Sheet content
    renderSheetPlayers(lockPlayers);

    // History
    renderHistoryPanel();

    // Ensure tools/history buttons aria-expanded reflect visibility
    el.toolsBtn.setAttribute("aria-expanded", String(el.toolsMenu.style.display === "block"));
    el.historyBtn.setAttribute("aria-expanded", String(el.historyPanel.style.display === "block"));

    saveState(); // keep derived changes (e.g., auto max) consistent
  }

  function renderPlayerCard(player, handSize) {
    const wrap = div("playerCard");

    const top = div("pTop");
    const left = div();
    const name = div("pName");
    name.textContent = player.name;
    const total = div("pTotal");
    total.textContent = `${player.total} Punkte`;
    left.appendChild(name);
    left.appendChild(total);

    const right = div();
    right.innerHTML = `<span class="badge">#${rankOf(player.id)}</span>`;
    top.appendChild(left);
    top.appendChild(right);

    const inputs = div("pInputs");

    const bidField = div("field");
    bidField.innerHTML = `<div class="label">Ansage</div>`;
    const bidInput = document.createElement("input");
    bidInput.type = "number";
    bidInput.min = "0";
    bidInput.step = "1";
    bidInput.inputMode = "numeric";
    bidInput.value = String(state.currentInputs[player.id]?.bid ?? "");
    bidInput.placeholder = "0";
    bidInput.addEventListener("input", () => {
      const v = parseInt(bidInput.value, 10);
      state.currentInputs[player.id] = state.currentInputs[player.id] || {};
      state.currentInputs[player.id].bid = isFinite(v) ? v : null;
      // live round score preview
      render();
    });
    bidField.appendChild(bidInput);

    const wonField = div("field");
    wonField.innerHTML = `<div class="label">Stiche</div>`;
    const wonInput = document.createElement("input");
    wonInput.type = "number";
    wonInput.min = "0";
    wonInput.step = "1";
    wonInput.inputMode = "numeric";
    wonInput.value = String(state.currentInputs[player.id]?.won ?? "");
    wonInput.placeholder = "0";
    wonInput.addEventListener("input", () => {
      const v = parseInt(wonInput.value, 10);
      state.currentInputs[player.id] = state.currentInputs[player.id] || {};
      state.currentInputs[player.id].won = isFinite(v) ? v : null;
      render();
    });
    wonField.appendChild(wonInput);

    inputs.appendChild(bidField);
    inputs.appendChild(wonField);

    const rs = div("pRoundScore");
    const rsL = div();
    rsL.innerHTML = `<div class="rsLabel">Rundenpunkte (Preview)</div>`;
    const rsV = div("rsValue");

    const bid = state.currentInputs[player.id]?.bid;
    const won = state.currentInputs[player.id]?.won;
    let preview = "–";
    if (isFinite(bid) && isFinite(won)) {
      if (handSize && (bid > handSize || won > handSize)) preview = "⚠︎";
      else preview = String(scoreRound(bid, won));
    }
    rsV.textContent = preview;

    rs.appendChild(rsL);
    rs.appendChild(rsV);

    wrap.appendChild(top);
    wrap.appendChild(inputs);
    wrap.appendChild(rs);

    return wrap;
  }

  function rankOf(pid) {
    const sorted = [...state.players].sort((a,b) => b.total - a.total);
    return sorted.findIndex(p => p.id === pid) + 1;
  }

  function renderSheetPlayers(lockPlayers) {
    el.sheetPlayersList.innerHTML = "";

    if (state.players.length === 0) {
      const p = document.createElement("div");
      p.className = "hint";
      p.textContent = "Noch keine Spieler.";
      el.sheetPlayersList.appendChild(p);
    }

    for (const p of state.players) {
      const pill = div("pill");
      const name = div("pillName");
      name.textContent = p.name;
      pill.appendChild(name);

      const btn = document.createElement("button");
      btn.className = "pillBtn";
      btn.type = "button";
      btn.textContent = "✕";
      btn.title = "Entfernen";
      btn.disabled = lockPlayers;
      btn.addEventListener("click", () => {
        if (lockPlayers) return;
        removePlayer(p.id);
      });
      pill.appendChild(btn);

      el.sheetPlayersList.appendChild(pill);
    }

    el.addBtn.disabled = lockPlayers;
    el.addName.disabled = lockPlayers;
  }

  function renderHistoryPanel() {
    // Show panel only if toggled open
    if (el.historyPanel.style.display !== "block") return;

    el.historyPanel.innerHTML = "";

    if (state.rounds.length === 0) {
      const row = div("hRow");
      row.innerHTML = `<div class="hLeft"><div class="hTitle">Noch kein Verlauf</div><div class="hMeta">Speichere die erste Runde.</div></div>`;
      el.historyPanel.appendChild(row);
      return;
    }

    // latest first
    const rounds = [...state.rounds].sort((a,b) => b.index - a.index);

    for (const r of rounds) {
      const row = div("hRow");
      const left = div("hLeft");
      const title = div("hTitle");
      title.textContent = `Runde ${r.index}`;
      const meta = div("hMeta");
      meta.textContent = `Hand ${r.handSize} · ${new Date(r.createdAt).toLocaleString("de-DE")}`;

      // compact per-player summary
      const ps = div("hPlayers");
      ps.textContent = state.players.map(p => {
        const e = r.entry[p.id];
        const s = r.scores[p.id];
        if (!e) return `${p.name}: –`;
        return `${p.name}: ${e.bid}/${e.won} (${s >= 0 ? "+" : ""}${s})`;
      }).join(" · ");

      left.appendChild(title);
      left.appendChild(meta);
      left.appendChild(ps);

      const right = div("hRight");
      const del = document.createElement("button");
      del.className = "hBtn danger";
      del.type = "button";
      del.textContent = "Undo";
      del.addEventListener("click", () => undoRoundById(r.id));

      right.appendChild(del);

      row.appendChild(left);
      row.appendChild(right);
      el.historyPanel.appendChild(row);
    }
  }

  // ---------- players ----------

  function addPlayerFromInput() {
    const name = (el.addName.value || "").trim();
    if (!name) return;
    if (state.rounds.length > 0) return;

    if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      alert("Spielername existiert bereits.");
      return;
    }

    state.players.push({ id: uid(), name, total: 0 });
    state.currentInputs = freshInputs();
    el.addName.value = "";
    // auto max hand update
    state.settings.maxHand = autoMaxHand();
    el.maxHandInput.value = String(state.settings.maxHand);

    saveState();
    render();
  }

  function removePlayer(pid) {
    if (state.rounds.length > 0) return;
    state.players = state.players.filter(p => p.id !== pid);
    delete state.currentInputs[pid];

    state.settings.maxHand = autoMaxHand();
    el.maxHandInput.value = String(state.settings.maxHand);

    saveState();
    render();
  }

  // ---------- menus / overlays ----------

  function toggleToolsMenu() {
    const open = el.toolsMenu.style.display === "block";
    if (open) closeToolsMenu();
    else {
      el.toolsMenu.style.display = "block";
      el.toolsBtn.setAttribute("aria-expanded", "true");
    }
  }
  function closeToolsMenu() {
    el.toolsMenu.style.display = "none";
    el.toolsBtn.setAttribute("aria-expanded", "false");
  }

  function toggleHistory() {
    const open = el.historyPanel.style.display === "block";
    el.historyPanel.style.display = open ? "none" : "block";
    el.historyBtn.setAttribute("aria-expanded", String(!open));
    if (!open) renderHistoryPanel();
  }

  function openSheet() {
    el.sheetOverlay.classList.add("show");
    el.sheet.classList.add("show");
    el.sheet.setAttribute("aria-hidden", "false");
    // focus
    setTimeout(() => el.addName.focus(), 50);
  }
  function closeSheet() {
    el.sheetOverlay.classList.remove("show");
    el.sheet.classList.remove("show");
    el.sheet.setAttribute("aria-hidden", "true");
  }

  function showToast(lastRoundId) {
    state.ui = state.ui || {};
    state.ui.lastSavedRoundId = lastRoundId;
    el.toast.classList.add("show");
    saveState();
    // auto-hide after 6s
    clearTimeout(state.ui.toastTimer);
    state.ui.toastTimer = setTimeout(() => hideToast(), 6000);
  }
  function hideToast() {
    el.toast.classList.remove("show");
  }

  // Dialog
  function openDialog(title, text, primaryLabel, primaryAction) {
    el.dialogTitle.textContent = title;
    el.dialogText.value = text;
    el.dialogPrimaryBtn.textContent = primaryLabel;
    el.dialogPrimaryBtn.onclick = primaryAction;
    el.dialogOverlay.classList.add("show");
    el.dialog.classList.add("show");
    setTimeout(() => el.dialogText.focus(), 40);
  }
  function closeDialog() {
    el.dialogOverlay.classList.remove("show");
    el.dialog.classList.remove("show");
  }
  async function copyDialogText() {
    try {
      await navigator.clipboard.writeText(el.dialogText.value);
      el.dialogPrimaryBtn.textContent = "Kopiert";
      setTimeout(() => (el.dialogPrimaryBtn.textContent = "Kopieren"), 1200);
    } catch {
      alert("Kopieren nicht möglich. Bitte manuell markieren und kopieren.");
    }
  }
  function importFromDialog() {
    const raw = el.dialogText.value.trim();
    if (!raw) return;
    let obj;
    try { obj = JSON.parse(raw); }
    catch { alert("Ungültiges JSON."); return; }

    const migrated = migrate(obj);
    if (!migrated) { alert("Import fehlgeschlagen (Schema)."); return; }

    state = migrated;
    saveState();
    closeDialog();
    render();
  }

  // ---------- persistence ----------

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return migrate(obj);
    } catch {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function migrate(obj) {
    // v1 schema (very tolerant)
    if (!obj || typeof obj !== "object") return null;

    const v = obj.version || 1;

    if (v !== 1) {
      // unknown future versions: attempt best-effort
    }

    const s = {
      version: 1,
      settings: {
        mode: (obj.settings?.mode === "up" || obj.settings?.mode === "updown" || obj.settings?.mode === "manual") ? obj.settings.mode : "updown",
        maxHand: clampInt(obj.settings?.maxHand, 1, 60) || null,
      },
      players: Array.isArray(obj.players) ? obj.players.map(p => ({
        id: String(p.id || uid()),
        name: String(p.name || "Spieler"),
        total: clampInt(p.total, -999999, 999999) || 0,
      })) : [],
      rounds: Array.isArray(obj.rounds) ? obj.rounds.map((r, i) => ({
        id: String(r.id || uid()),
        index: clampInt(r.index, 1, 9999) || (i + 1),
        handSize: clampInt(r.handSize, 1, 60) || 1,
        mode: r.mode || "updown",
        entry: r.entry || {},
        scores: r.scores || {},
        createdAt: r.createdAt || Date.now(),
      })) : [],
      currentInputs: obj.currentInputs && typeof obj.currentInputs === "object" ? obj.currentInputs : {},
      ui: obj.ui && typeof obj.ui === "object" ? obj.ui : {},
    };

    // Ensure input map contains keys
    s.currentInputs = {};
    for (const p of s.players) {
      const i = obj.currentInputs?.[p.id] || {};
      s.currentInputs[p.id] = {
        bid: isFinite(i.bid) ? i.bid : null,
        won: isFinite(i.won) ? i.won : null,
      };
    }

    // If totals inconsistent with rounds, recompute once (safety)
    const recomputed = s.players.map(p => ({ ...p, total: 0 }));
    const map = new Map(recomputed.map(p => [p.id, p]));
    for (const r of s.rounds.sort((a,b)=>a.index-b.index)) {
      for (const pid of Object.keys(r.scores || {})) {
        const p = map.get(pid);
        if (p) p.total += (r.scores[pid] || 0);
      }
    }
    s.players = recomputed;

    // Normalize maxHand
    if (!s.settings.maxHand) s.settings.maxHand = Math.max(1, Math.floor(60 / Math.max(1, s.players.length)));

    return s;
  }

  function freshState() {
    return {
      version: 1,
      settings: { mode: "updown", maxHand: null },
      players: [],
      rounds: [],
      currentInputs: {},
      ui: {}
    };
  }

  function freshInputs() {
    const o = {};
    for (const p of state.players) o[p.id] = { bid: null, won: null };
    return o;
  }

  // ---------- helpers ----------
  function byId(id){ return document.getElementById(id); }
  function div(cls){
    const d = document.createElement("div");
    if (cls) d.className = cls;
    return d;
  }
  function uid(){
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
  function clampInt(v, min, max){
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (!isFinite(n)) return null;
    const k = Math.trunc(n);
    return Math.min(max, Math.max(min, k));
  }
})(); 
