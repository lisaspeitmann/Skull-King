/* Skull King Chronik – Spiellogik (ohne DOM, auch in Node testbar) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROUNDS = 10;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 6;
  const MAX_PIRATES = 6; // 5 Piraten + Scary Mary (zählt immer als Pirat)
  const BONUS = { pirate: 30, mermaid: 50 };
  const AVATARS = ['🏴‍☠️', '🦜', '🐙', '🦈', '🐳', '🧜‍♀️', '🦑', '⚓', '🗡️', '💀', '🐊', '🦀', '🐚', '🧭', '👑', '🍺', '🐬', '🦭', '🐢', '🌴'];

  const TITLES = {
    kapitaen: { icon: '👑', label: 'Kapitän', desc: 'Spiel gewonnen' },
    schiffbruechig: { icon: '🏝️', label: 'Schiffbrüchiger', desc: 'Letzter Platz' },
    meerjungfrau: { icon: '🧜‍♀️', label: 'Meerjungfrauen-Flüsterer', desc: 'Skull King mit der Meerjungfrau gefangen' },
    piratenschreck: { icon: '🗡️', label: 'Piratenschreck', desc: 'Meiste Piraten mit dem Skull King gefangen' },
    wahrsager: { icon: '🔮', label: 'Wahrsager', desc: 'Meiste richtige Ansagen' },
    geisterschiff: { icon: '👻', label: 'Geisterschiff', desc: 'Meiste geglückte Null-Ansagen (mind. 2)' }
  };

  const key = (name) => String(name).trim().replace(/\s+/g, ' ').toLowerCase();

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const randomAvatars = (k) => shuffle(AVATARS).slice(0, k);

  function newRound(n) {
    return {
      bids: Array(n).fill(null),
      tricks: Array(n).fill(null),
      pirates: Array(n).fill(0),
      mermaid: Array(n).fill(0)
    };
  }

  function newGame(players, startDealer, id, now) {
    const n = players.length;
    return {
      id: id,
      createdAt: now,
      finishedAt: null,
      done: false,
      players: players.map((p) => ({ name: p.name, avatar: p.avatar })),
      startDealer: startDealer,
      round: 1,
      phase: 'bid',
      rounds: Array.from({ length: ROUNDS }, () => newRound(n))
    };
  }

  const dealerIndex = (g, r) => (g.startDealer + r - 1) % g.players.length;
  const starterIndex = (g, r) => (dealerIndex(g, r) + 1) % g.players.length;
  const completedCount = (g) => (g.done ? ROUNDS : g.round - 1);

  /** Wertung eines Spielers in einer Runde N. Bonus zählt nur bei richtiger Ansage. */
  function scoreEntry(N, bid, tricks, pirates, mermaid) {
    if (!Number.isInteger(bid) || !Number.isInteger(tricks)) {
      return { base: 0, bonus: 0, total: 0, hit: false, bonusLost: false };
    }
    const hit = bid === tricks;
    let base;
    if (bid === 0) base = hit ? 10 * N : -10 * N;
    else base = hit ? 20 * bid : -10 * Math.abs(bid - tricks);
    const rawBonus = (pirates || 0) * BONUS.pirate + (mermaid || 0) * BONUS.mermaid;
    const bonus = hit ? rawBonus : 0;
    return { base: base, bonus: bonus, total: base + bonus, hit: hit, bonusLost: !hit && rawBonus > 0 };
  }

  function roundResults(g, r) {
    const rd = g.rounds[r - 1];
    return rd.bids.map((b, p) => scoreEntry(r, b, rd.tricks[p], rd.pirates[p], rd.mermaid[p]));
  }

  /** cum[k][p] = Punktestand von Spieler p nach Runde k+1 */
  function cumulative(g) {
    const n = g.players.length;
    const cum = [];
    let run = Array(n).fill(0);
    for (let r = 1; r <= completedCount(g); r++) {
      const res = roundResults(g, r);
      run = run.map((v, p) => v + res[p].total);
      cum.push(run.slice());
    }
    return cum;
  }

  function totals(g) {
    const c = cumulative(g);
    return c.length ? c[c.length - 1] : Array(g.players.length).fill(0);
  }

  /** Wettkampf-Platzierung: gleiche Punkte = gleicher Platz */
  function placesOf(tot) {
    return tot.map((t) => 1 + tot.filter((o) => o > t).length);
  }

  const winnersOf = (g) => {
    const pl = placesOf(totals(g));
    return pl.map((p, i) => (p === 1 ? i : -1)).filter((i) => i >= 0);
  };

  function validateRound(g, r, stage) {
    const N = r;
    const rd = g.rounds[r - 1];
    const errs = [];
    const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    if (rd.bids.some((b) => !isInt(b, 0, N))) errs.push('Es fehlen Ansagen.');
    if (stage === 'bids') return errs;
    if (rd.tricks.some((t) => !isInt(t, 0, N))) {
      errs.push('Bei allen Spielern muss die Zahl der Stiche gewählt sein.');
    } else {
      const sum = rd.tricks.reduce((a, b) => a + b, 0);
      if (sum !== N) errs.push('Es müssen genau ' + N + ' Stiche verteilt werden (aktuell ' + sum + ').');
    }
    if (rd.pirates.some((x) => !isInt(x, 0, MAX_PIRATES)) || rd.pirates.reduce((a, b) => a + b, 0) > MAX_PIRATES) {
      errs.push('Es gibt höchstens ' + MAX_PIRATES + ' Piraten (inkl. Scary Mary).');
    }
    if (rd.mermaid.some((x) => x !== 0 && x !== 1) || rd.mermaid.reduce((a, b) => a + b, 0) > 1) {
      errs.push('Der Skull King kann nur einmal pro Runde gefangen werden.');
    }
    g.players.forEach((pl, p) => {
      if ((rd.pirates[p] > 0 || rd.mermaid[p] > 0) && !(rd.tricks[p] >= 1)) {
        errs.push(pl.name + ': Bonus ist nur mit mindestens einem Stich möglich.');
      }
    });
    return errs;
  }

  function gameStats(g) {
    const n = g.players.length;
    const out = g.players.map(() => ({
      total: 0, hits: 0, bonus: 0, diff: 0, piratesCaught: 0, kingCaught: 0, zeroHits: 0,
      perRoundHit: Array(ROUNDS).fill(0), worstRound: 0, worstRoundNo: 0
    }));
    for (let r = 1; r <= completedCount(g); r++) {
      const rd = g.rounds[r - 1];
      const res = roundResults(g, r);
      for (let p = 0; p < n; p++) {
        const s = out[p];
        const e = res[p];
        s.total += e.total;
        s.bonus += e.bonus;
        s.diff += rd.tricks[p] - rd.bids[p];
        if (e.hit) {
          s.hits++;
          s.perRoundHit[r - 1] = 1;
          if (rd.bids[p] === 0) s.zeroHits++;
          s.piratesCaught += rd.pirates[p];
          s.kingCaught += rd.mermaid[p];
        }
        if (e.total < s.worstRound) { s.worstRound = e.total; s.worstRoundNo = r; }
      }
    }
    return out;
  }

  /** Größter Rückstand auf den Führenden nach einer Runde */
  function maxDeficit(g, p) {
    const cum = cumulative(g);
    let best = { deficit: 0, round: 0 };
    cum.forEach((row, k) => {
      const d = Math.max.apply(null, row) - row[p];
      if (d > best.deficit) best = { deficit: d, round: k + 1 };
    });
    return best;
  }

  function titlesFor(g) {
    if (!g.done) return [];
    const st = gameStats(g);
    const tot = st.map((s) => s.total);
    const out = [];
    const places = placesOf(tot);
    out.push({ key: 'kapitaen', players: places.map((p, i) => (p === 1 ? i : -1)).filter((i) => i >= 0) });
    const min = Math.min.apply(null, tot);
    const max = Math.max.apply(null, tot);
    if (min < max) out.push({ key: 'schiffbruechig', players: tot.map((t, i) => (t === min ? i : -1)).filter((i) => i >= 0) });
    const most = (field, minVal, k) => {
      const vals = st.map((s) => s[field]);
      const m = Math.max.apply(null, vals);
      if (m >= minVal) out.push({ key: k, players: vals.map((v, i) => (v === m ? i : -1)).filter((i) => i >= 0) });
    };
    most('kingCaught', 1, 'meerjungfrau');
    most('piratesCaught', 1, 'piratenschreck');
    most('hits', 1, 'wahrsager');
    most('zeroHits', 2, 'geisterschiff');
    return out.map((t) => Object.assign({}, TITLES[t.key], t));
  }

  /** Aggregation über alle beendeten Spiele, Schlüssel = Name (ohne Groß/Klein) */
  function aggregate(games) {
    const agg = {};
    games
      .filter((g) => g.done)
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((g) => {
        const st = gameStats(g);
        const places = placesOf(st.map((s) => s.total));
        const titles = titlesFor(g);
        g.players.forEach((pl, p) => {
          const k = key(pl.name);
          const a = (agg[k] = agg[k] || {
            key: k, name: pl.name, avatar: pl.avatar, games: 0, wins: 0, points: 0, rounds: 0, hits: 0,
            bonus: 0, diff: 0, piratesCaught: 0, kingCaught: 0, zeroHits: 0,
            perRoundHits: Array(ROUNDS).fill(0), perRoundN: Array(ROUNDS).fill(0),
            bestScore: null, worstScore: null, worstRound: null, comeback: null, titles: {}
          });
          const s = st[p];
          a.name = pl.name;
          a.avatar = pl.avatar;
          a.games++;
          if (places[p] === 1) a.wins++;
          a.points += s.total;
          a.rounds += ROUNDS;
          a.hits += s.hits;
          a.bonus += s.bonus;
          a.diff += s.diff;
          a.piratesCaught += s.piratesCaught;
          a.kingCaught += s.kingCaught;
          a.zeroHits += s.zeroHits;
          for (let r = 0; r < ROUNDS; r++) { a.perRoundHits[r] += s.perRoundHit[r]; a.perRoundN[r]++; }
          if (!a.bestScore || s.total > a.bestScore.value) a.bestScore = { value: s.total, gameId: g.id, at: g.createdAt };
          if (!a.worstScore || s.total < a.worstScore.value) a.worstScore = { value: s.total, gameId: g.id, at: g.createdAt };
          if (s.worstRound < 0 && (!a.worstRound || s.worstRound < a.worstRound.value)) {
            a.worstRound = { value: s.worstRound, round: s.worstRoundNo, gameId: g.id, at: g.createdAt };
          }
          if (places[p] === 1) {
            const d = maxDeficit(g, p);
            if (d.deficit > 0 && (!a.comeback || d.deficit > a.comeback.deficit)) {
              a.comeback = { deficit: d.deficit, round: d.round, gameId: g.id, at: g.createdAt };
            }
          }
          titles.forEach((t) => { if (t.players.indexOf(p) >= 0) a.titles[t.key] = (a.titles[t.key] || 0) + 1; });
        });
      });
    return agg;
  }

  function hallOfFame(agg) {
    const list = Object.keys(agg).map((k) => agg[k]);
    const top = (arr, cmp, map) => arr.sort(cmp).slice(0, 3).map(map);
    return {
      wins: top(list.filter((a) => a.wins > 0),
        (x, y) => y.wins - x.wins || (y.wins / y.games) - (x.wins / x.games) || x.games - y.games,
        (a) => ({ name: a.name, avatar: a.avatar, value: a.wins, games: a.games })),
      tips: top(list.filter((a) => a.rounds >= ROUNDS),
        (x, y) => (y.hits / y.rounds) - (x.hits / x.rounds) || y.rounds - x.rounds,
        (a) => ({ name: a.name, avatar: a.avatar, value: a.hits / a.rounds, hits: a.hits, rounds: a.rounds })),
      bonus: top(list.filter((a) => a.bonus > 0),
        (x, y) => y.bonus - x.bonus,
        (a) => ({ name: a.name, avatar: a.avatar, value: a.bonus, games: a.games })),
      crash: top(list.filter((a) => a.worstRound),
        (x, y) => x.worstRound.value - y.worstRound.value,
        (a) => ({ name: a.name, avatar: a.avatar, value: a.worstRound.value, round: a.worstRound.round, at: a.worstRound.at })),
      comeback: top(list.filter((a) => a.comeback),
        (x, y) => y.comeback.deficit - x.comeback.deficit,
        (a) => ({ name: a.name, avatar: a.avatar, value: a.comeback.deficit, round: a.comeback.round, at: a.comeback.at }))
    };
  }

  /** Strenge Prüfung für importierte Spiele */
  function validateGameShape(g) {
    try {
      if (!g || typeof g !== 'object') return false;
      if (typeof g.id !== 'string' || !g.id || g.id.length > 64) return false;
      if (!Number.isFinite(g.createdAt)) return false;
      if (!Array.isArray(g.players) || g.players.length < MIN_PLAYERS || g.players.length > MAX_PLAYERS) return false;
      const n = g.players.length;
      if (!g.players.every((p) => p && typeof p.name === 'string' && p.name.trim() && p.name.length <= 40 && typeof p.avatar === 'string' && p.avatar.length <= 16)) return false;
      if (!Number.isInteger(g.startDealer) || g.startDealer < 0 || g.startDealer >= n) return false;
      if (!Number.isInteger(g.round) || g.round < 1 || g.round > ROUNDS) return false;
      if (g.phase !== 'bid' && g.phase !== 'result') return false;
      if (typeof g.done !== 'boolean') return false;
      if (!Array.isArray(g.rounds) || g.rounds.length !== ROUNDS) return false;
      const okArr = (a) => Array.isArray(a) && a.length === n;
      if (!g.rounds.every((r) => r && okArr(r.bids) && okArr(r.tricks) && okArr(r.pirates) && okArr(r.mermaid))) return false;
      if (g.done) {
        for (let r = 1; r <= ROUNDS; r++) if (validateRound(g, r, 'full').length) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    ROUNDS, MIN_PLAYERS, MAX_PLAYERS, MAX_PIRATES, BONUS, AVATARS, TITLES,
    key, shuffle, randomAvatars, newRound, newGame, dealerIndex, starterIndex, completedCount,
    scoreEntry, roundResults, cumulative, totals, placesOf, winnersOf, validateRound,
    gameStats, maxDeficit, titlesFor, aggregate, hallOfFame, validateGameShape
  };
});
