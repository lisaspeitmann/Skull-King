/* Skull King Chronik – Oberfläche. Alle Daten bleiben lokal auf dem Gerät. */
(function () {
  'use strict';
  const SK = window.SK;
  const STORE_KEY = 'skullking.chronik.v1';
  const MEDALS = ['🥇', '🥈', '🥉'];

  let db = { games: [] };
  const ui = {
    tab: 'home',      // home | hof | stats | log | more
    screen: null,     // {type:'new'} | {type:'game',id} | {type:'finish',id} | {type:'logdetail',id}
    draft: null,
    draftError: '',
    edit: null,       // {gameId, r, data}
    editError: '',
    modal: null,      // 'cheat' | 'table' | 'edit' | 'confirm'
    confirm: null,
    tableId: null,
    openStat: null,
    toast: '',
    confetti: false
  };

  /* ---------- Speicher ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.games)) {
          db.games = d.games.filter((g) => g && Array.isArray(g.players) && Array.isArray(g.rounds));
        }
      }
    } catch (e) { /* Speicher nicht verfügbar – App läuft trotzdem */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, games: db.games }));
    } catch (e) { toast('Speichern nicht möglich – Browser-Speicher blockiert?'); }
  }

  /* ---------- Helfer ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getGame = (id) => db.games.find((g) => g.id === id);
  const fmtSigned = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
  const fmtDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtNum = (v, d) => v.toLocaleString('de-DE', { maximumFractionDigits: d == null ? 1 : d });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ordered = (g) => {
    const tot = SK.totals(g);
    const pl = SK.placesOf(tot);
    return g.players.map((p, i) => ({ i, p, total: tot[i], place: pl[i] })).sort((a, b) => b.total - a.total || a.i - b.i);
  };
  let toastTimer = null;
  function toast(msg) {
    ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = ''; render(); }, 2600);
    render();
  }
  function knownNames() {
    const seen = {};
    db.games.slice().sort((a, b) => a.createdAt - b.createdAt).forEach((g) => g.players.forEach((p) => { seen[SK.key(p.name)] = p.name; }));
    return Object.keys(seen).map((k) => seen[k]);
  }

  /* ---------- Bausteine ---------- */
  function chips(N, sel, action, p) {
    let h = '<div class="chips" role="group">';
    for (let v = 0; v <= N; v++) {
      h += '<button class="chip' + (sel === v ? ' on' : '') + '" data-a="' + action + '" data-p="' + p + '" data-v="' + v + '" aria-pressed="' + (sel === v) + '">' + v + '</button>';
    }
    return h + '</div>';
  }

  function podium(entries) {
    if (!entries.length) return '';
    const e = entries.slice(0, 3);
    const order = e.length === 1 ? [e[0]] : e.length === 2 ? [e[1], e[0]] : [e[1], e[0], e[2]];
    return '<div class="podium">' + order.map((x) => {
      const pl = Math.min(x.place || entries.indexOf(x) + 1, 3);
      return '<div class="pod p' + pl + '"><span class="av">' + esc(x.avatar) + '</span><span class="nm">' + esc(x.name) + '</span>' +
        '<span class="val">' + esc(x.value) + '</span><span class="sub">' + esc(x.sub || '') + '</span>' +
        '<div class="block">' + (x.place || entries.indexOf(x) + 1) + '</div></div>';
    }).join('') + '</div>';
  }

  function tableHtml(g, editable) {
    const done = SK.completedCount(g);
    const n = g.players.length;
    const tot = SK.totals(g);
    const pl = SK.placesOf(tot);
    let h = '<div class="tablewrap"><table class="score"><thead><tr><th>#</th>';
    g.players.forEach((p) => { h += '<th><span class="av">' + esc(p.avatar) + '</span><span class="n">' + esc(p.name) + '</span></th>'; });
    h += '</tr></thead><tbody>';
    for (let r = 1; r <= SK.ROUNDS; r++) {
      const isDone = r <= done;
      const tap = editable && isDone;
      h += '<tr class="' + (tap ? 'tap' : '') + (!isDone ? ' cur' : '') + '"' + (tap ? ' data-a="editround" data-r="' + r + '"' : '') + '><th>' + r + '</th>';
      const res = isDone ? SK.roundResults(g, r) : null;
      const rd = g.rounds[r - 1];
      for (let p = 0; p < n; p++) {
        if (!isDone) { h += '<td>–</td>'; continue; }
        const e = res[p];
        h += '<td><b class="' + cls(e.total) + '">' + fmtSigned(e.total) + '</b><small>' + rd.bids[p] + '/' + rd.tricks[p] + (e.bonus ? ' ★' : '') + '</small></td>';
      }
      h += '</tr>';
    }
    h += '</tbody><tfoot><tr><th>Σ</th>';
    tot.forEach((t, i) => { h += '<td>' + t + (done ? '<br><small>' + (MEDALS[pl[i] - 1] || pl[i] + '.') + '</small>' : '') + '</td>'; });
    h += '</tr></tfoot></table></div>';
    h += '<div class="tblhint">Je Zelle: Punkte · darunter Ansage/Stiche · ★ = Bonuspunkte' + (editable ? ' · Zeile antippen zum Korrigieren' : '') + '</div>';
    return h;
  }

  /* ---------- Ansichten ---------- */
  function viewHome() {
    const running = db.games.filter((g) => !g.done).sort((a, b) => b.createdAt - a.createdAt);
    const finished = db.games.filter((g) => g.done);
    let h = '<div class="hero"><div class="skull">☠️</div><h1>Skull King</h1><p>Die Chronik der sieben Meere</p></div>';
    h += '<button class="btn primary block" data-a="newgame">⚓ Neues Spiel starten</button><div style="height:14px"></div>';
    if (running.length) {
      h += '<div class="card"><h3>Angefangene Spiele</h3>';
      running.forEach((g) => {
        h += '<div class="list-item"><div class="grow clickable" data-a="open" data-id="' + g.id + '"><div>' + g.players.map((p) => esc(p.avatar)).join(' ') + '</div>' +
          '<b>' + g.players.map((p) => esc(p.name)).join(', ') + '</b><br><small>Runde ' + g.round + ' von ' + SK.ROUNDS + ' · gestartet ' + fmtDate(g.createdAt) + '</small></div>' +
          '<button class="btn small" data-a="open" data-id="' + g.id + '">Weiter</button>' +
          '<button class="icon-btn" data-a="delgame" data-id="' + g.id + '" aria-label="Spiel löschen">🗑️</button></div>';
      });
      h += '</div>';
    }
    h += '<div class="card"><h3>Auf einen Blick</h3><div class="kpis"><div class="kpi"><b>' + finished.length + '</b><span>Spiele beendet</span></div>' +
      '<div class="kpi"><b>' + Object.keys(SK.aggregate(db.games)).length + '</b><span>Seebären in der Chronik</span></div></div></div>';
    h += '<button class="btn block" data-a="cheat">📜 Spielregel-Spickzettel</button>';
    return h;
  }

  function newDraft() {
    return { n: 4, names: Array(6).fill(''), avatars: SK.randomAvatars(6), dealer: -1 };
  }

  function viewNew() {
    const d = ui.draft;
    let h = '<div class="view-head"><button class="icon-btn" data-a="cancelnew" aria-label="Zurück">←</button><h2>Neues Spiel</h2></div>';
    h += '<div class="card"><h3>Wie viele Piraten?</h3><div class="seg">';
    for (let n = SK.MIN_PLAYERS; n <= SK.MAX_PLAYERS; n++) h += '<button class="' + (d.n === n ? 'on' : '') + '" data-a="nplayers" data-n="' + n + '">' + n + '</button>';
    h += '</div>';
    for (let p = 0; p < d.n; p++) {
      h += '<div class="field"><button class="av" data-a="reroll" data-p="' + p + '" aria-label="Avatar würfeln">' + esc(d.avatars[p]) + '</button>' +
        '<input type="text" data-name="' + p + '" maxlength="16" placeholder="Name Spieler ' + (p + 1) + '" value="' + esc(d.names[p]) + '" autocomplete="off" autocapitalize="words" list="known"></div>';
    }
    h += '<datalist id="known">' + knownNames().map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    h += '<div class="lbl">Wer gibt zuerst?</div><select data-a="dealer" aria-label="Erster Geber"><option value="-1"' + (d.dealer === -1 ? ' selected' : '') + '>🎲 Zufällig</option>';
    for (let p = 0; p < d.n; p++) h += '<option value="' + p + '"' + (d.dealer === p ? ' selected' : '') + '>' + esc(d.names[p].trim() || 'Spieler ' + (p + 1)) + '</option>';
    h += '</select>';
    if (ui.draftError) h += '<div class="error">' + esc(ui.draftError) + '</div>';
    h += '<p class="muted" style="font-size:.85rem">Tipp: Gleiche Namen schreiben, damit Statistik und Hall of Fame die Spieler wiedererkennen. Avatar antippen = neu würfeln.</p></div>';
    h += '<div class="actionbar"><div class="inner"><button class="btn primary block" data-a="startgame">Leinen los! 🏴‍☠️</button></div></div>';
    return h;
  }

  function playerStrip(g) {
    return '<div class="strip">' + ordered(g).map((o) =>
      '<div class="pill"><span class="av">' + esc(o.p.avatar) + '</span><span class="nm">' + esc(o.p.name) + '</span><b class="' + cls(o.total) + '">' + o.total + '</b></div>').join('') + '</div>';
  }

  /** Eingabezeile für eine Runde; mode: 'bid' | 'result' | 'both' */
  function entryCard(g, r, rd, p, mode) {
    const N = r;
    const pl = g.players[p];
    const e = SK.scoreEntry(N, rd.bids[p], rd.tricks[p], rd.pirates[p], rd.mermaid[p]);
    const showRes = mode !== 'bid';
    const showBid = mode !== 'result';
    let h = '<div class="pcard"><div class="phead"><span class="av">' + esc(pl.avatar) + '</span><span class="nm">' + esc(pl.name) + '</span>';
    if (mode === 'result') h += '<span class="tag">Angesagt: <b>' + rd.bids[p] + '</b></span>';
    if (showRes && Number.isInteger(rd.tricks[p])) h += '<span class="pts ' + cls(e.total) + '">' + fmtSigned(e.total) + '</span>';
    h += '</div>';
    if (showBid) { h += '<div class="lbl">Ansage</div>' + chips(N, rd.bids[p], 'bid', p); }
    if (showRes) {
      h += '<div class="lbl">Gemachte Stiche</div>' + chips(N, rd.tricks[p], 'trick', p);
      if (rd.tricks[p] >= 1) {
        h += '<div class="bonus"><div class="row spread"><span>🗡️ Piraten gefangen <small>(je +' + SK.BONUS.pirate + ')</small></span>' +
          '<span class="stepper"><button data-a="pir" data-p="' + p + '" data-d="-1" aria-label="Weniger">−</button><output>' + rd.pirates[p] + '</output><button data-a="pir" data-p="' + p + '" data-d="1" aria-label="Mehr">+</button></span></div>' +
          '<div class="row spread"><span>🧜‍♀️ Skull King gefangen <small>(+' + SK.BONUS.mermaid + ')</small></span>' +
          '<button class="toggle' + (rd.mermaid[p] ? ' on' : '') + '" data-a="mer" data-p="' + p + '" aria-pressed="' + !!rd.mermaid[p] + '">' + (rd.mermaid[p] ? 'Ja' : 'Nein') + '</button></div>' +
          (e.bonusLost ? '<div class="warn">Bonus verfällt – Ansage wurde verfehlt.</div>' : '') + '</div>';
      }
    }
    return h + '</div>';
  }

  function viewGame(g) {
    const N = g.round;
    const rd = g.rounds[N - 1];
    const dealer = g.players[SK.dealerIndex(g, N)];
    const starter = g.players[SK.starterIndex(g, N)];
    const bidPhase = g.phase === 'bid';
    let h = '<div class="view-head"><button class="icon-btn" data-a="pause" aria-label="Pause">⏸</button><h2>Runde ' + N + ' von ' + SK.ROUNDS + '</h2>' +
      '<button class="icon-btn" data-a="table" aria-label="Tabelle">📊</button><button class="icon-btn" data-a="cheat" aria-label="Spickzettel">📜</button></div>';
    h += playerStrip(g);
    h += '<div class="infochips"><span class="infochip">🃏 ' + N + ' Karte' + (N > 1 ? 'n' : '') + ' pro Spieler</span><span class="infochip">Gibt: <b>' + esc(dealer.name) + '</b></span><span class="infochip">Beginnt: <b>' + esc(starter.name) + '</b></span></div>';
    h += '<div class="phase-title"><h3>' + (bidPhase ? '1 · Ansagen (alle gleichzeitig)' : '2 · Ergebnis der Runde') + '</h3></div>';
    g.players.forEach((_, p) => { h += entryCard(g, N, rd, p, bidPhase ? 'bid' : 'result'); });

    const errs = SK.validateRound(g, N, bidPhase ? 'bids' : 'full');
    const last = N === SK.ROUNDS;
    let hint;
    if (bidPhase) hint = errs.length ? errs[0] : 'Alle Ansagen sind erfasst.';
    else {
      const sum = rd.tricks.reduce((a, b) => a + (Number.isInteger(b) ? b : 0), 0);
      hint = errs.length ? errs[0] : 'Stiche: ' + sum + ' von ' + N + ' verteilt ✓';
    }
    h += '<div class="actionbar"><div class="inner"><div class="hint ' + (errs.length ? 'bad' : 'ok') + '">' + esc(hint) + '</div><div class="row">' +
      ((N > 1 || !bidPhase) ? '<button class="btn" data-a="undo" aria-label="Rückgängig">↩︎</button>' : '') +
      '<button class="btn primary grow" data-a="' + (bidPhase ? 'tobids' : 'finishround') + '"' + (errs.length ? ' disabled' : '') + '>' +
      (bidPhase ? 'Ansagen festhalten →' : last ? 'Spiel beenden ☠️' : 'Runde abschließen ✓') + '</button></div></div></div>';
    return h;
  }

  function titlesHtml(g) {
    const t = SK.titlesFor(g);
    if (!t.length) return '';
    return '<div class="card"><h3>Auszeichnungen</h3><div class="titles">' + t.map((x) =>
      '<div class="titlerow"><span class="ic">' + x.icon + '</span><div><b>' + esc(x.label) + '</b><br><small>' + esc(x.players.map((i) => g.players[i].name).join(' & ')) + ' · ' + esc(x.desc) + '</small></div></div>').join('') + '</div>';
  }

  function resultPodium(g) {
    const o = ordered(g);
    let h = podium(o.map((x) => ({ avatar: x.p.avatar, name: x.p.name, value: x.total + ' Pkt.', place: x.place })));
    const rest = o.filter((x, idx) => idx >= 3);
    if (rest.length) h += '<div class="rest">' + rest.map((x) => '<div class="r"><b>' + x.place + '.</b><span>' + esc(x.p.avatar) + '</span><span class="grow">' + esc(x.p.name) + '</span><b>' + x.total + '</b></div>').join('') + '</div>';
    return h;
  }

  function viewFinish(g) {
    const w = ordered(g).filter((x) => x.place === 1);
    let h = '<div class="view-head"><h2>Das Spiel ist aus!</h2></div>';
    h += '<div class="card"><p style="text-align:center;margin:0 0 6px;font-family:var(--serif)">👑 ' + (w.length > 1 ? 'Gemeinsame Kapitäne' : 'Kapitän') + ': <b>' + esc(w.map((x) => x.p.name).join(' & ')) + '</b></p>' + resultPodium(g) + '</div>';
    h += titlesHtml(g);
    h += '<div class="card"><h3>Punktetabelle</h3>' + tableHtml(g, false) + '</div>';
    h += '<div class="card"><div class="row wrap"><button class="btn grow" data-a="shareimg" data-id="' + g.id + '">🖼️ Als Bild teilen</button><button class="btn grow" data-a="sharetxt" data-id="' + g.id + '">💬 Als Text teilen</button></div></div>';
    h += '<div class="row wrap"><button class="btn grow" data-a="reopen" data-id="' + g.id + '">↩︎ Letzte Runde korrigieren</button><button class="btn primary grow" data-a="home">Fertig</button></div>';
    return h;
  }

  function viewHof() {
    const agg = SK.aggregate(db.games);
    const hof = SK.hallOfFame(agg);
    const cats = [
      { icon: '👑', title: 'Meiste Siege', desc: 'Wer hat am häufigsten die Krone getragen?', list: hof.wins, val: (x) => x.value + (x.value === 1 ? ' Sieg' : ' Siege'), sub: (x) => 'aus ' + x.games + (x.games === 1 ? ' Spiel' : ' Spielen') },
      { icon: '🔮', title: 'Beste Tipps', desc: 'Höchste Trefferquote bei den Ansagen (ab 10 gespielten Runden).', list: hof.tips, val: (x) => Math.round(x.value * 100) + ' %', sub: (x) => x.hits + ' von ' + x.rounds },
      { icon: '💰', title: 'Meiste Bonuspunkte', desc: 'Gesamtbeute aus Piraten- und Meerjungfrauen-Bonus.', list: hof.bonus, val: (x) => '+' + x.value, sub: (x) => 'aus ' + x.games + (x.games === 1 ? ' Spiel' : ' Spielen') },
      { icon: '🌊', title: 'Größter Absturz', desc: 'Die meisten Minuspunkte in einer einzigen Runde.', list: hof.crash, val: (x) => fmtSigned(x.value), sub: (x) => 'Runde ' + x.round + ' · ' + fmtDate(x.at) },
      { icon: '🔥', title: 'Comeback-König', desc: 'Größter Rückstand auf den Führenden, nach dem das Spiel doch gewonnen wurde.', list: hof.comeback, val: (x) => x.value + ' Pkt.', sub: (x) => 'nach Runde ' + x.round }
    ];
    let h = '<div class="view-head"><h2>🏆 Hall of Fame</h2></div>';
    if (!db.games.some((g) => g.done)) h += '<div class="card empty">Noch ist die Halle leer – spielt euer erstes Spiel zu Ende, um euch zu verewigen!</div>';
    cats.forEach((c) => {
      h += '<div class="card"><h3>' + c.icon + ' ' + c.title + '</h3><div class="hof-desc">' + c.desc + '</div>';
      h += c.list.length ? podium(c.list.map((x, i) => ({ avatar: x.avatar, name: x.name, value: c.val(x), sub: c.sub(x), place: i + 1 }))) : '<div class="empty">Noch keine Einträge.</div>';
      h += '</div>';
    });
    return h;
  }

  function viewStats() {
    const agg = SK.aggregate(db.games);
    const list = Object.keys(agg).map((k) => agg[k]).sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name));
    const fin = db.games.filter((g) => g.done);
    let h = '<div class="view-head"><h2>📈 Statistiken</h2></div>';
    if (!fin.length) return h + '<div class="card empty">Sobald das erste Spiel beendet ist, erscheinen hier die Statistiken.</div>';
    const best = list.reduce((m, a) => (a.bestScore && (!m || a.bestScore.value > m.bestScore.value) ? a : m), null);
    const worst = list.reduce((m, a) => (a.worstScore && (!m || a.worstScore.value < m.worstScore.value) ? a : m), null);
    const winAvg = fin.reduce((s, g) => s + Math.max.apply(null, SK.totals(g)), 0) / fin.length;
    h += '<div class="card"><h3>Alle Spiele</h3><div class="kpis">' +
      '<div class="kpi"><b>' + fin.length + '</b><span>Spiele</span></div>' +
      '<div class="kpi"><b>' + fin.length * SK.ROUNDS + '</b><span>Runden gespielt</span></div>' +
      '<div class="kpi"><b>' + fmtNum(winAvg, 0) + '</b><span>Ø Punkte des Siegers</span></div>' +
      '<div class="kpi"><b>' + (best ? best.bestScore.value : '–') + '</b><span>Höchste Punktzahl' + (best ? ' · ' + esc(best.name) : '') + '</span></div>' +
      '<div class="kpi"><b>' + (worst ? worst.worstScore.value : '–') + '</b><span>Tiefste Punktzahl' + (worst ? ' · ' + esc(worst.name) : '') + '</span></div></div></div>';
    list.forEach((a) => {
      const open = ui.openStat === a.key;
      const rate = a.hits / a.rounds;
      const tend = a.diff / a.rounds;
      let tendTxt = 'ausgewogen';
      if (tend > 0.15) tendTxt = 'Unterschätzer (holt mehr Stiche als angesagt)';
      else if (tend < -0.15) tendTxt = 'Überschätzer (sagt mehr an, als er holt)';
      h += '<div class="scard"><button data-a="stat" data-k="' + esc(a.key) + '" aria-expanded="' + open + '"><span class="av">' + esc(a.avatar) + '</span><span class="grow"><b style="font-family:var(--serif);font-size:1.1rem">' + esc(a.name) + '</b><br><span class="meta">' +
        a.games + ' Spiele · ' + a.wins + ' Siege · Ø ' + fmtNum(a.points / a.games, 0) + ' Pkt. · ' + Math.round(rate * 100) + ' % Treffer</span></span><span>' + (open ? '▾' : '▸') + '</span></button>';
      if (open) {
        h += '<div class="body"><div class="kpis">' +
          '<div class="kpi"><b>' + Math.round((a.wins / a.games) * 100) + ' %</b><span>Siegquote</span></div>' +
          '<div class="kpi"><b>' + fmtNum(a.points / a.games, 0) + '</b><span>Ø Punkte pro Spiel</span></div>' +
          '<div class="kpi"><b>' + Math.round(rate * 100) + ' %</b><span>Ansagetreffer (' + a.hits + '/' + a.rounds + ')</span></div>' +
          '<div class="kpi"><b>' + (tend > 0 ? '+' : '') + fmtNum(tend, 2) + '</b><span>Ø Stiche über/unter Ansage</span></div>' +
          '<div class="kpi"><b>' + a.bonus + '</b><span>Bonuspunkte gesamt</span></div>' +
          '<div class="kpi"><b>' + a.bestScore.value + '</b><span>Beste Partie</span></div></div>' +
          '<p style="margin:10px 0 0"><b>Tendenz:</b> ' + tendTxt + '</p>' +
          '<div class="lbl">Trefferquote je Runde</div><div class="bars">' +
          a.perRoundHits.map((v, i) => { const pc = a.perRoundN[i] ? Math.round((v / a.perRoundN[i]) * 100) : 0; return '<div title="Runde ' + (i + 1) + ': ' + pc + ' %"><i style="height:' + Math.max(2, pc * 0.5) + 'px"></i>' + (i + 1) + '</div>'; }).join('') + '</div>';
        const tk = Object.keys(a.titles);
        if (tk.length) h += '<div class="lbl">Titel</div>' + tk.map((k) => '<span class="titlechip">' + SK.TITLES[k].icon + ' ' + SK.TITLES[k].label + ' ×' + a.titles[k] + '</span>').join('');
        h += '</div>';
      }
      h += '</div>';
    });
    return h;
  }

  function viewLog() {
    const fin = db.games.filter((g) => g.done).sort((a, b) => b.finishedAt - a.finishedAt);
    let h = '<div class="view-head"><h2>📖 Logbuch</h2></div>';
    if (!fin.length) return h + '<div class="card empty">Noch keine beendeten Spiele.</div>';
    h += '<div class="card">';
    fin.forEach((g) => {
      const w = ordered(g).filter((x) => x.place === 1);
      h += '<div class="list-item clickable" data-a="logopen" data-id="' + g.id + '"><span class="av">' + esc(w[0].p.avatar) + '</span><div class="grow"><b>' + esc(w.map((x) => x.p.name).join(' & ')) + '</b> · ' + w[0].total + ' Pkt.<br><small>' +
        fmtDate(g.finishedAt || g.createdAt) + ' · ' + g.players.length + ' Spieler: ' + esc(g.players.map((p) => p.name).join(', ')) + '</small></div><span>›</span></div>';
    });
    return h + '</div>';
  }

  function viewLogDetail(g) {
    let h = '<div class="view-head"><button class="icon-btn" data-a="logback" aria-label="Zurück">←</button><h2>' + fmtDate(g.finishedAt || g.createdAt) + '</h2></div>';
    h += '<div class="card">' + resultPodium(g) + '</div>' + titlesHtml(g);
    h += '<div class="card"><h3>Punktetabelle</h3>' + tableHtml(g, true) + '</div>';
    h += '<div class="card"><div class="row wrap"><button class="btn grow" data-a="shareimg" data-id="' + g.id + '">🖼️ Bild</button><button class="btn grow" data-a="sharetxt" data-id="' + g.id + '">💬 Text</button>' +
      '<button class="btn danger grow" data-a="delgame" data-id="' + g.id + '">🗑️ Löschen</button></div></div>';
    return h;
  }

  function viewMore() {
    let h = '<div class="view-head"><h2>⚙️ Mehr</h2></div>';
    h += '<div class="card"><h3>Spielhilfe</h3><button class="btn block" data-a="cheat">📜 Spielregel-Spickzettel</button></div>';
    h += '<div class="card"><h3>Sicherung</h3><p class="muted" style="margin-top:0">Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig oder übertrage sie auf ein anderes Gerät.</p>' +
      '<div class="row wrap"><button class="btn grow" data-a="export">⬇️ Exportieren</button><label class="btn grow" for="importfile">⬆️ Importieren</label></div>' +
      '<input type="file" id="importfile" accept="application/json,.json" hidden></div>';
    h += '<div class="card"><h3>Gefahrenzone</h3><button class="btn danger block" data-a="wipe">Alle Daten löschen</button></div>';
    h += '<div class="card"><h3>Wertung (Schmidt-Ausgabe)</h3><p class="muted" style="margin:0">Richtig angesagt: 20 Pkt. je Stich. Daneben: −10 Pkt. je Stich Abweichung. Ansage 0: ±10 × Rundennummer. Bonus nur bei richtiger Ansage: +30 je Pirat (Skull King), +50 für den Skull King (Meerjungfrau).</p></div>';
    return h;
  }

  const CHEAT = '<div class="cheat">' +
    '<h4>Ablauf</h4><ol><li>10 Runden – in Runde N bekommt jeder N Karten.</li><li>Alle sagen gleichzeitig an, wie viele Stiche sie machen.</li><li>Ausspielen, Farbe bedienen, Stiche zählen, abrechnen.</li><li>Der Geber wechselt jede Runde; links vom Geber beginnt.</li></ol>' +
    '<h4>Kartenrang im Stich</h4><ol><li><b>Skull King</b> – schlägt alle Piraten …</li><li><b>Piraten</b> (5×, Scary Mary als Pirat) – schlagen Meerjungfrauen</li><li><b>Meerjungfrau</b> (2×) – schlägt Zahlen, <b>fängt aber den Skull King!</b></li><li><b>Schwarz</b> – Trumpf, schlägt die Farben</li><li><b>Farben</b> (1–13) – Ausspielfarbe zählt</li><li><b>Flucht</b> / Scary Mary als Flucht – verliert immer</li></ol>' +
    '<p>Mehrere gleiche Sonderkarten: die zuerst gespielte gewinnt. Scary Mary wählst du beim Ausspielen als Pirat oder Flucht.</p>' +
    '<h4>Punkte</h4><table><tr><td>Ansage richtig</td><td>+20 je Stich</td></tr><tr><td>Ansage falsch</td><td>−10 je Stich Differenz</td></tr><tr><td>Ansage 0 richtig</td><td>+10 × Runde</td></tr><tr><td>Ansage 0 falsch</td><td>−10 × Runde</td></tr></table>' +
    '<h4>Bonus (nur bei richtiger Ansage)</h4><table><tr><td>Skull King fängt einen Piraten (auch Scary Mary)</td><td>+30 je Pirat</td></tr><tr><td>Meerjungfrau fängt den Skull King</td><td>+50</td></tr></table>' +
    '<h4>Karten (66)</h4><ul><li>52 Farbkarten: 4 Farben à 1–13 (Schwarz = Trumpf)</li><li>5 Flucht · 5 Piraten · 2 Meerjungfrauen</li><li>1 Scary Mary · 1 Skull King</li></ul></div>';

  function modalHtml() {
    if (!ui.modal) return '';
    let title = '', body = '', foot = '', cls2 = '';
    if (ui.modal === 'cheat') { title = '📜 Spickzettel'; body = CHEAT; }
    else if (ui.modal === 'table') {
      const g = getGame(ui.tableId);
      title = '📊 Tabelle'; body = g ? tableHtml(g, true) : '';
    } else if (ui.modal === 'edit') {
      const g = getGame(ui.edit.gameId);
      title = 'Runde ' + ui.edit.r + ' korrigieren';
      body = g.players.map((_, p) => entryCard(g, ui.edit.r, ui.edit.data, p, 'both')).join('') + (ui.editError ? '<div class="error">' + esc(ui.editError) + '</div>' : '');
      foot = '<div class="row"><button class="btn grow" data-a="canceledit">Abbrechen</button><button class="btn primary grow" data-a="saveedit">Speichern</button></div>';
    } else if (ui.modal === 'confirm') {
      title = 'Sicher?'; body = '<p style="margin:0">' + esc(ui.confirm.text) + '</p>';
      foot = '<div class="row"><button class="btn grow" data-a="closemodal">Abbrechen</button><button class="btn danger grow" data-a="doconfirm">' + esc(ui.confirm.ok) + '</button></div>';
      cls2 = ' center';
    }
    return '<div class="overlay' + (cls2 ? ' mid' : '') + '" data-a="overlay"><div class="modal' + cls2 + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="modal-head"><h3>' + esc(title) + '</h3>' +
      (ui.modal === 'confirm' || ui.modal === 'edit' ? '' : '<button class="icon-btn" data-a="closemodal" aria-label="Schließen">✕</button>') + '</div><div class="modal-body">' + body + '</div>' + (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div></div>';
  }

  function tabsHtml() {
    const t = [['home', '⚓', 'Spiel'], ['hof', '🏆', 'Ruhmeshalle'], ['stats', '📈', 'Statistik'], ['log', '📖', 'Logbuch'], ['more', '⚙️', 'Mehr']];
    return '<nav class="tabs" aria-label="Hauptnavigation">' + t.map((x) => '<button class="' + (ui.tab === x[0] ? 'on' : '') + '" data-a="tab" data-t="' + x[0] + '"' + (ui.tab === x[0] ? ' aria-current="page"' : '') + '><span>' + x[1] + '</span>' + x[2] + '</button>').join('') + '</nav>';
  }

  /* ---------- Rendern ---------- */
  function render() {
    const app = document.getElementById('app');
    const sy = window.scrollY;
    const mb = document.querySelector('.modal-body');
    const ms = mb ? mb.scrollTop : 0;
    const scr = ui.screen;
    let html = '';
    let full = false;
    if (scr && scr.type === 'new') { html = viewNew(); full = true; }
    else if (scr && scr.type === 'game' && getGame(scr.id)) { html = viewGame(getGame(scr.id)); full = true; }
    else if (scr && scr.type === 'finish' && getGame(scr.id)) { html = viewFinish(getGame(scr.id)); }
    else if (scr && scr.type === 'logdetail' && getGame(scr.id)) { html = viewLogDetail(getGame(scr.id)); }
    else {
      ui.screen = null;
      html = { home: viewHome, hof: viewHof, stats: viewStats, log: viewLog, more: viewMore }[ui.tab]() + tabsHtml();
    }
    html += modalHtml();
    if (ui.toast) html += '<div class="toast" role="status">' + esc(ui.toast) + '</div>';
    app.className = full ? 'full' : '';
    app.innerHTML = html;
    window.scrollTo(0, sy);
    const nb = document.querySelector('.modal-body');
    if (nb) nb.scrollTop = ms;
    if (ui.confetti) { ui.confetti = false; launchConfetti(); }
  }

  function launchConfetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    document.body.appendChild(c);
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const ctx = c.getContext('2d');
    const colors = ['#f2d683', '#d9ac45', '#d2503f', '#f1e3bb', '#7cc06f'];
    const ps = Array.from({ length: 130 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.6, w: (6 + Math.random() * 8) * dpr, h: (8 + Math.random() * 10) * dpr, vy: (2 + Math.random() * 4) * dpr, vx: (Math.random() - 0.5) * 3 * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, col: colors[Math.floor(Math.random() * colors.length)] }));
    const t0 = performance.now();
    (function tick(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
      if (t - t0 < 3600) requestAnimationFrame(tick); else c.remove();
    })(t0);
  }

  /* ---------- Teilen / Export ---------- */
  function resultText(g) {
    const o = ordered(g);
    return '☠️ Skull King – ' + fmtDate(g.finishedAt || g.createdAt) + '\n' + o.map((x) => (MEDALS[x.place - 1] || x.place + '.') + ' ' + x.p.avatar + ' ' + x.p.name + ' – ' + x.total).join('\n');
  }

  function resultCanvas(g) {
    const o = ordered(g);
    const W = 1080, H = Math.max(1350, 520 + o.length * 130 + 160);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2c1c10'); bg.addColorStop(1, '#150d07');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < W; i += 135) x.fillRect(i, 0, 3, H);
    x.strokeStyle = '#d9ac45'; x.lineWidth = 6; x.strokeRect(36, 36, W - 72, H - 72);
    x.textAlign = 'center';
    x.font = '120px serif'; x.fillText('☠️', W / 2, 190);
    x.fillStyle = '#f2d683'; x.font = 'bold 110px Georgia, serif'; x.fillText('SKULL KING', W / 2, 330);
    x.fillStyle = '#b9a47a'; x.font = 'italic 40px Georgia, serif'; x.fillText(fmtDate(g.finishedAt || g.createdAt), W / 2, 395);
    o.forEach((r, i) => {
      const y = 520 + i * 130;
      x.fillStyle = r.place === 1 ? 'rgba(217,172,69,.22)' : 'rgba(0,0,0,.3)';
      x.fillRect(90, y - 75, W - 180, 110);
      x.textAlign = 'left'; x.fillStyle = '#f2d683'; x.font = '60px serif';
      x.fillText(MEDALS[r.place - 1] || r.place + '.', 110, y);
      x.font = '64px serif'; x.fillText(r.p.avatar, 230, y);
      x.fillStyle = '#f4e8c8'; x.font = 'bold 54px Georgia, serif'; x.fillText(r.p.name.slice(0, 14), 330, y);
      x.textAlign = 'right'; x.fillStyle = '#f2d683'; x.fillText(String(r.total), W - 120, y);
    });
    x.textAlign = 'center'; x.fillStyle = '#8f6b1d'; x.font = 'italic 34px Georgia, serif';
    x.fillText('Skull King Chronik', W / 2, H - 80);
    return c;
  }

  function deliver(blob, filename, text) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: text || '' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Datei gespeichert');
  }

  function shareText(g) {
    const t = resultText(g);
    if (navigator.share) { navigator.share({ text: t }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Ergebnis kopiert'), () => toast('Kopieren nicht möglich'));
    else toast('Teilen wird hier nicht unterstützt');
  }

  function exportData() {
    const d = { app: 'skull-king-chronik', version: 1, exportedAt: new Date().toISOString(), games: db.games };
    deliver(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), 'skull-king-backup-' + new Date().toISOString().slice(0, 10) + '.json');
  }

  function importData(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || d.app !== 'skull-king-chronik' || !Array.isArray(d.games)) throw new Error('format');
        const have = {};
        db.games.forEach((g) => { have[g.id] = true; });
        let added = 0, skipped = 0;
        d.games.forEach((g) => {
          if (SK.validateGameShape(g) && !have[g.id]) { db.games.push(g); have[g.id] = true; added++; } else skipped++;
        });
        save();
        toast(added + ' Spiel(e) importiert' + (skipped ? ', ' + skipped + ' übersprungen' : ''));
      } catch (e) { toast('Die Datei ist keine gültige Sicherung.'); }
    };
    rd.readAsText(file);
  }

  /* ---------- Aktionen ---------- */
  function ctx() {
    if (ui.edit) return { g: getGame(ui.edit.gameId), r: ui.edit.r, rd: ui.edit.data };
    const g = getGame(ui.screen.id);
    return { g, r: g.round, rd: g.rounds[g.round - 1] };
  }
  const closeModal = () => { ui.modal = null; ui.edit = null; ui.editError = ''; ui.confirm = null; };
  function askConfirm(text, ok, fn) { ui.confirm = { text, ok, fn }; ui.modal = 'confirm'; render(); }

  function startGame() {
    const d = ui.draft;
    const names = d.names.slice(0, d.n).map((s) => s.trim().replace(/\s+/g, ' '));
    if (names.some((n) => !n)) { ui.draftError = 'Bitte gib allen Spielern einen Namen.'; return render(); }
    if (new Set(names.map(SK.key)).size !== names.length) { ui.draftError = 'Jeder Name darf nur einmal vorkommen.'; return render(); }
    ui.draftError = '';
    const dealer = d.dealer >= 0 && d.dealer < d.n ? d.dealer : Math.floor(Math.random() * d.n);
    const g = SK.newGame(names.map((n, i) => ({ name: n, avatar: d.avatars[i] })), dealer, uid(), Date.now());
    db.games.push(g);
    save();
    ui.screen = { type: 'game', id: g.id };
    ui.draft = null;
    window.scrollTo(0, 0);
    render();
  }

  function finishRound() {
    const g = getGame(ui.screen.id);
    if (SK.validateRound(g, g.round, 'full').length) return;
    if (g.round < SK.ROUNDS) { g.round++; g.phase = 'bid'; save(); window.scrollTo(0, 0); return render(); }
    g.done = true; g.finishedAt = Date.now(); save();
    ui.screen = { type: 'finish', id: g.id }; ui.confetti = true;
    window.scrollTo(0, 0); render();
  }

  const actions = {
    tab(el) { ui.tab = el.dataset.t; ui.screen = null; window.scrollTo(0, 0); render(); },
    home() { ui.screen = null; ui.tab = 'home'; window.scrollTo(0, 0); render(); },
    newgame() { ui.draft = newDraft(); ui.draftError = ''; ui.screen = { type: 'new' }; window.scrollTo(0, 0); render(); },
    cancelnew() { ui.screen = null; ui.draft = null; render(); },
    nplayers(el) { ui.draft.n = +el.dataset.n; if (ui.draft.dealer >= ui.draft.n) ui.draft.dealer = -1; render(); },
    reroll(el) {
      const d = ui.draft; const p = +el.dataset.p;
      const used = d.avatars.slice(0, d.n);
      const free = SK.AVATARS.filter((a) => used.indexOf(a) < 0);
      d.avatars[p] = free.length ? free[Math.floor(Math.random() * free.length)] : d.avatars[p];
      render();
    },
    startgame: startGame,
    open(el) { ui.screen = { type: 'game', id: el.dataset.id }; window.scrollTo(0, 0); render(); },
    pause() { ui.screen = null; ui.tab = 'home'; window.scrollTo(0, 0); render(); toast('Spiel gespeichert – du kannst jederzeit weitermachen'); },
    delgame(el) {
      const id = el.dataset.id;
      askConfirm('Dieses Spiel endgültig löschen?', 'Löschen', () => {
        db.games = db.games.filter((g) => g.id !== id); save();
        if (ui.screen && ui.screen.id === id) ui.screen = null;
      });
    },
    bid(el) { const c = ctx(); c.rd.bids[+el.dataset.p] = +el.dataset.v; save(); render(); },
    trick(el) {
      const c = ctx(); const p = +el.dataset.p; const v = +el.dataset.v;
      c.rd.tricks[p] = v;
      if (v === 0) { c.rd.pirates[p] = 0; c.rd.mermaid[p] = 0; }
      if (!ui.edit) save();
      render();
    },
    pir(el) {
      const c = ctx(); const p = +el.dataset.p; const d = +el.dataset.d;
      const sum = c.rd.pirates.reduce((a, b) => a + b, 0);
      const nv = c.rd.pirates[p] + d;
      if (nv < 0 || (d > 0 && sum >= SK.MAX_PIRATES)) return;
      c.rd.pirates[p] = nv; if (!ui.edit) save(); render();
    },
    mer(el) {
      const c = ctx(); const p = +el.dataset.p;
      const nv = c.rd.mermaid[p] ? 0 : 1;
      c.rd.mermaid = c.rd.mermaid.map(() => 0);
      c.rd.mermaid[p] = nv; if (!ui.edit) save(); render();
    },
    tobids() { const g = getGame(ui.screen.id); if (!SK.validateRound(g, g.round, 'bids').length) { g.phase = 'result'; save(); window.scrollTo(0, 0); render(); } },
    finishround: finishRound,
    undo() {
      const g = getGame(ui.screen.id);
      if (g.phase === 'result') g.phase = 'bid';
      else if (g.round > 1) { g.round--; g.phase = 'result'; }
      save(); window.scrollTo(0, 0); render();
    },
    table() { ui.tableId = ui.screen.id; ui.modal = 'table'; render(); },
    editround(el) {
      const id = ui.modal === 'table' ? ui.tableId : ui.screen.id;
      const g = getGame(id); const r = +el.dataset.r;
      ui.edit = { gameId: id, r, data: JSON.parse(JSON.stringify(g.rounds[r - 1])) };
      ui.editError = ''; ui.modal = 'edit'; render();
    },
    saveedit() {
      const g = getGame(ui.edit.gameId); const r = ui.edit.r;
      const backup = g.rounds[r - 1];
      g.rounds[r - 1] = ui.edit.data;
      const errs = SK.validateRound(g, r, 'full');
      if (errs.length) { g.rounds[r - 1] = backup; ui.editError = errs[0]; return render(); }
      save(); closeModal(); toast('Runde ' + r + ' aktualisiert');
    },
    canceledit() { closeModal(); render(); },
    cheat() { ui.modal = 'cheat'; render(); },
    closemodal() { closeModal(); render(); },
    overlay(el, ev) { if (ev.target === el && ui.modal !== 'edit' && ui.modal !== 'confirm') { closeModal(); render(); } },
    doconfirm() { const f = ui.confirm.fn; closeModal(); f(); render(); },
    stat(el) { ui.openStat = ui.openStat === el.dataset.k ? null : el.dataset.k; render(); },
    logopen(el) { ui.screen = { type: 'logdetail', id: el.dataset.id }; window.scrollTo(0, 0); render(); },
    logback() { ui.screen = null; ui.tab = 'log'; render(); },
    reopen(el) {
      const g = getGame(el.dataset.id);
      g.done = false; g.finishedAt = null; g.round = SK.ROUNDS; g.phase = 'result'; save();
      ui.screen = { type: 'game', id: g.id }; window.scrollTo(0, 0); render();
    },
    shareimg(el) {
      const g = getGame(el.dataset.id);
      resultCanvas(g).toBlob((b) => { if (b) deliver(b, 'skull-king-ergebnis.png', resultText(g)); }, 'image/png');
    },
    sharetxt(el) { shareText(getGame(el.dataset.id)); },
    export: exportData,
    wipe() {
      askConfirm('Wirklich ALLE Spiele, Statistiken und Rekorde löschen? Das kann nicht rückgängig gemacht werden.', 'Alles löschen', () => { db.games = []; save(); toast('Alle Daten gelöscht'); });
    }
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el, ev);
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.name !== undefined && ui.draft) {
      ui.draft.names[+t.dataset.name] = t.value;
      ui.draftError = '';
    }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.a === 'dealer' && ui.draft) { ui.draft.dealer = +t.value; }
    if (t.id === 'importfile' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ui.modal && ui.modal !== 'edit' && ui.modal !== 'confirm') { closeModal(); render(); }
  });

  load();
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
