/* גיבורי הזירה — original cartoon arena game. Kid-safe, no external assets. */
/* v5: visual overhaul, diamond fences, seasons */
(function () {
  "use strict";

  const UNIT_TYPES = {
    knight: {
      id: "knight",
      name: "אביר",
      say: "אביר!",
      cost: 4,
      hp: 190,
      dmg: 18,
      range: 0.055,
      speed: 0.085,
      atk: 0.8,
      splash: 0,
      flying: false,
    },
    archer: {
      id: "archer",
      name: "קשת",
      say: "קשת!",
      cost: 3,
      hp: 75,
      dmg: 15,
      range: 0.155,
      speed: 0.11,
      atk: 0.7,
      splash: 0,
      flying: false,
    },
    dragon: {
      id: "dragon",
      name: "דרקון קטן",
      say: "דרקון!",
      cost: 5,
      hp: 120,
      dmg: 16,
      range: 0.12,
      speed: 0.13,
      atk: 0.85,
      splash: 0.13,
      flying: true,
    },
    bigDragon: {
      id: "bigDragon",
      name: "דרקון גדול",
      say: "דרקון גדול!",
      cost: 7,
      hp: 260,
      dmg: 28,
      range: 0.15,
      speed: 0.08,
      atk: 1.05,
      splash: 0.2,
      flying: true,
    },
    cannon: {
      id: "cannon",
      name: "תותח",
      say: "תותח!",
      cost: 6,
      hp: 110,
      dmg: 42,
      range: 0.28,
      speed: 0.05,
      atk: 1.7,
      splash: 0,
      flying: false,
      projectile: "cannonball",
    },
  };

  const LANE_X = [0.2, 0.5, 0.8];
  const LANE_SPACING = 0.3;
  const PLAYER_SPAWN_Y = 0.78;
  const ENEMY_SPAWN_Y = 0.22;
  const ENEMY_CASTLE_Y = 0.1;
  const PLAYER_CASTLE_Y = 0.9;
  const CASTLE_RANGE = 0.1;
  const MAX_ENERGY = 10;
  const ROUND_TIME = 150;
  const STEP = 1 / 60;
  const MAX_UNITS = 24;
  const GUARD_POSTS = [
    { side: "player", slot: 0, x: 0.33, y: 0.835, lane: 0 },
    { side: "player", slot: 1, x: 0.67, y: 0.835, lane: 2 },
    { side: "ai", slot: 0, x: 0.33, y: 0.165, lane: 0 },
    { side: "ai", slot: 1, x: 0.67, y: 0.165, lane: 2 },
  ];
  const FENCE_Y = { player: 0.8, ai: 0.2 };
  const FENCE_STANDOFF = 0.05;

  const SEASON_ORDER = ["summer", "fall", "winter", "spring"];
  const SEASON_HE = { summer: "קיץ", fall: "סתיו", winter: "חורף", spring: "אביב" };
  const SEASON_ICON = { summer: "☀️", fall: "🍂", winter: "❄️", spring: "🌸" };
  const UNIT_SEASON = {
    knight: "winter",
    archer: "fall",
    dragon: "spring",
    bigDragon: "summer",
    cannon: "winter",
  };
  const SEASON_SECS = 30;
  const SEASON_OUT = 1.3;
  const SEASON_IN = 0.8;
  const MAX_FX = 80;
  const MAX_AMBIENT = 40;
  const MAX_FLOATERS = 24;

  const qa = /(?:\?|&)qa=1(?:&|$)/.test(location.search);

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    home: $("#screen-home"),
    play: $("#screen-play"),
    end: $("#screen-end"),
    canvas: $("#arena"),
    wrap: $("#arena-wrap"),
    timer: $("#timer"),
    hpEnemyFill: $("#hp-enemy-fill"),
    hpPlayerFill: $("#hp-player-fill"),
    hpEnemyTxt: $("#hp-enemy-txt"),
    hpPlayerTxt: $("#hp-player-txt"),
    energyTxt: $("#energy-txt"),
    energyPips: $("#energy-pips"),
    endTitle: $("#end-title"),
    endSub: $("#end-sub"),
    stars: $$("#stars .star"),
    mute: $("#btn-mute"),
    unitBtns: $$(".unit-btn"),
    seasonIcon: $("#season-icon"),
    seasonName: $("#season-name"),
    seasonCount: $("#season-count"),
    seasonBanner: $("#season-banner"),
    bannerIcon: $("#banner-icon"),
    bannerName: $("#banner-name"),
    confetti: $("#confetti"),
  };

  const ctx = els.canvas.getContext("2d");

  const state = {
    screen: "home",
    difficulty: "easy",
    selected: null,
    energy: 5,
    timeLeft: ROUND_TIME,
    playerMax: 600,
    enemyMax: 500,
    playerHp: 600,
    enemyHp: 500,
    units: [],
    fx: [],
    shots: [],
    castles: {
      player: { cd: 0, showRange: 0, flash: 0 },
      ai: { cd: 0, showRange: 0, flash: 0 },
    },
    t: 0,
    winner: null,
    stars: 0,
    nextId: 1,
    acc: 0,
    lastTs: 0,
    running: false,
    ai: { wait: 4, think: 0 },
    voiceOn: true,
    heVoice: null,
    shake: 0,
    lastLane: 1,
    guardTimers: {},
    fences: [],
    season: "summer",
    seasonLeft: SEASON_SECS,
    ambient: [],
    floaters: [],
    confettiBits: [],
    fps: 0,
    fpsFrames: 0,
    fpsTime: 0,
  };

  let audioCtx = null;

  function difficultySettings(diff) {
    if (diff === "hard") {
      return {
        playerMax: qa ? 180 : 700,
        enemyMax: qa ? 180 : 700,
        playerRegen: qa ? 2.4 : 0.55,
        enemyRegen: qa ? 2.2 : 0.55,
        aiFirst: 2,
        aiThink: 1.3,
        speedMul: qa ? 1.5 : 1,
        playerCastle: { range: 0.4, dmg: 18, interval: 1.3, shotSpeed: 0.7 },
        enemyCastle: { range: 0.4, dmg: 20, interval: 1.2, shotSpeed: 0.7 },
        playerGuard: { hp: 100, dmg: 14, range: 0.11, speed: 0.09, atk: 0.8, leash: 0.15, defendRange: 0.3, respawn: 15 },
        enemyGuard: { hp: 100, dmg: 14, range: 0.11, speed: 0.09, atk: 0.8, leash: 0.15, defendRange: 0.3, respawn: 15 },
        playerFence: { hp: 160, rebuild: 25 },
        enemyFence: { hp: 160, rebuild: 25 },
      };
    }
    return {
      playerMax: qa ? 200 : 600,
      enemyMax: qa ? 140 : 500,
      playerRegen: qa ? 2.6 : 0.55,
      enemyRegen: qa ? 1.2 : 0.32,
      aiFirst: 5,
      aiThink: 2.6,
      speedMul: qa ? 1.5 : 1,
      playerCastle: { range: 0.38, dmg: 16, interval: 1.5, shotSpeed: 0.7 },
      enemyCastle: { range: 0.34, dmg: 11, interval: 1.9, shotSpeed: 0.7 },
      playerGuard: { hp: 90, dmg: 12, range: 0.11, speed: 0.09, atk: 0.85, leash: 0.15, defendRange: 0.28, respawn: 15 },
      enemyGuard: { hp: 50, dmg: 7, range: 0.1, speed: 0.08, atk: 1.1, leash: 0.14, defendRange: 0.24, respawn: 16 },
      playerFence: { hp: 140, rebuild: 25 },
      enemyFence: { hp: 70, rebuild: 25 },
    };
  }

  /* ---------- speech & sound ---------- */

  function pickHebrewVoice() {
    if (!window.speechSynthesis) return null;
    const list = speechSynthesis.getVoices() || [];
    return (
      list.find((v) => /he-IL/i.test(v.lang)) ||
      list.find((v) => /^he\b/i.test(v.lang)) ||
      null
    );
  }

  function refreshVoice() {
    state.heVoice = pickHebrewVoice();
  }

  if (window.speechSynthesis) {
    refreshVoice();
    speechSynthesis.addEventListener("voiceschanged", refreshVoice);
  }

  function speak(text) {
    if (!state.voiceOn || !state.heVoice || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = state.heVoice;
      u.lang = state.heVoice.lang || "he-IL";
      u.rate = 0.95;
      u.pitch = 1.12;
      speechSynthesis.speak(u);
    } catch (_) {
      /* stay silent */
    }
  }

  function beep(freq, dur, type, gain) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = gain || 0.04;
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  /* ---------- sim ---------- */

  function resetMatch(diff) {
    const d = difficultySettings(diff || "easy");
    state.difficulty = diff || "easy";
    state.selected = null;
    state.energy = 5;
    state.timeLeft = ROUND_TIME;
    state.playerMax = d.playerMax;
    state.enemyMax = d.enemyMax;
    state.playerHp = d.playerMax;
    state.enemyHp = d.enemyMax;
    state.units = [];
    state.fx = [];
    state.shots = [];
    state.castles = {
      player: { cd: 0, showRange: 0, flash: 0 },
      ai: { cd: 0, showRange: 0, flash: 0 },
    };
    state.t = 0;
    state.winner = null;
    state.stars = 0;
    state.nextId = 1;
    state.acc = 0;
    state.ai = { wait: d.aiFirst, think: 0, energy: 5 };
    state.shake = 0;
    state.lastLane = 1;
    state.guardTimers = {};
    state.ambient = [];
    state.floaters = [];
    state.confettiBits = [];
    state.season = SEASON_ORDER[Math.floor(Math.random() * SEASON_ORDER.length)];
    state.seasonLeft = SEASON_SECS;
    state.settings = d;
    initFences();
    for (const post of GUARD_POSTS) spawnGuard(post);
    updateUnitButtons();
    updateHud();
    showSeasonBanner();
  }

  function startMatch(diff) {
    resetMatch(diff);
    showScreen("play");
    resize();
    speak("בוא נשחק!");
    beep(523, 0.12, "triangle", 0.05);
    setTimeout(() => beep(659, 0.14, "triangle", 0.05), 110);
    if (!state.running) {
      state.running = true;
      state.lastTs = 0;
      requestAnimationFrame(loop);
    }
  }

  function endMatch(winner) {
    if (state.winner) return;
    state.winner = winner;
    let stars = 0;
    if (winner === "player") {
      const ratio = state.playerHp / state.playerMax;
      stars = ratio >= 0.5 ? 3 : ratio >= 0.2 ? 2 : 1;
    }
    state.stars = stars;
    els.endTitle.textContent = winner === "player" ? "כל הכבוד!" : winner === "draw" ? "תיקו!" : "אוי…";
    els.endSub.textContent = winner === "player" ? "" : winner === "draw" ? "" : "ננסה שוב";
    els.stars.forEach((s, i) => s.classList.toggle("on", i < stars));
    showScreen("end");
    if (winner === "player") speak("כל הכבוד!");
    else if (winner === "ai") speak("ננסה שוב!");
    if (winner === "player") {
      startConfetti();
      beep(523, 0.15, "triangle", 0.06);
      setTimeout(() => beep(659, 0.15, "triangle", 0.06), 140);
      setTimeout(() => beep(784, 0.28, "triangle", 0.07), 280);
    } else {
      beep(330, 0.25, "sine", 0.05);
      setTimeout(() => beep(247, 0.35, "sine", 0.05), 200);
    }
  }

  function showScreen(name) {
    state.screen = name;
    els.home.classList.toggle("hidden", name !== "home");
    els.play.classList.toggle("hidden", name !== "play");
    els.end.classList.toggle("hidden", name !== "end");
  }

  function dist(a, b) {
    const dx = (a.lane - b.lane) * LANE_SPACING;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function initFences() {
    state.fences = [];
    for (const side of ["player", "ai"]) {
      const stats = side === "player" ? state.settings.playerFence : state.settings.enemyFence;
      for (let lane = 0; lane < 3; lane++) {
        state.fences.push({
          id: side + "-" + lane,
          side,
          lane,
          x: LANE_X[lane],
          y: FENCE_Y[side],
          hp: stats.hp,
          maxHp: stats.hp,
          rebuild: 0,
        });
      }
    }
  }

  function intactEnemyFence(lane, unitSide) {
    const enemy = unitSide === "player" ? "ai" : "player";
    return state.fences.find((f) => f.side === enemy && f.lane === lane && f.hp > 0) || null;
  }

  function unitBehindFence(attacker, other, fence) {
    const oy = other.wy != null ? other.wy : other.y;
    if (attacker.side === "player") return oy < fence.y - 0.01;
    return oy > fence.y + 0.01;
  }

  function fenceStopY(u, fence) {
    const gap = FENCE_STANDOFF;
    return u.side === "player" ? fence.y + gap : fence.y - gap;
  }

  function isSeasonHot(u) {
    return !!(u && !u.guard && !u.kind && UNIT_SEASON[u.type] && UNIT_SEASON[u.type] === state.season);
  }

  function outgoingDamage(attacker, base) {
    const n = Number(base) || 0;
    return isSeasonHot(attacker) ? Math.round(n * SEASON_OUT) : n;
  }

  function incomingDamage(target, dmg) {
    const n = Number(dmg) || 0;
    return isSeasonHot(target) ? Math.round(n * SEASON_IN) : n;
  }

  function calcDamage(attType, defType, base) {
    const attacker = attType ? { type: attType, guard: false } : null;
    const target = defType ? { type: defType, guard: false } : null;
    return incomingDamage(target, outgoingDamage(attacker, base));
  }

  function dealUnitDamage(attacker, target, base) {
    if (!target || target.hp <= 0) return 0;
    const dmg = incomingDamage(target, outgoingDamage(attacker, base));
    target.hp -= dmg;
    target.hitFlash = 1;
    const p = unitWorldPos(target);
    spawnFloater(p.x, p.y, dmg);
    return dmg;
  }

  function hitFence(f, dmg) {
    if (!f || f.hp <= 0) return;
    f.hp = Math.max(0, f.hp - dmg);
    spawnFx(f.x, f.y, "hit");
    spawnFloater(f.x, f.y - 0.02, dmg);
    if (f.hp <= 0) {
      const stats = f.side === "player" ? state.settings.playerFence : state.settings.enemyFence;
      f.rebuild = stats.rebuild;
      spawnFx(f.x, f.y, "shatter");
      beep(160, 0.1, "square", 0.035);
    }
  }

  function stepFences(dt) {
    if (!state.settings) return;
    for (const f of state.fences) {
      if (f.hp > 0) continue;
      f.rebuild -= dt;
      if (f.rebuild <= 0) {
        const stats = f.side === "player" ? state.settings.playerFence : state.settings.enemyFence;
        f.hp = stats.hp;
        f.maxHp = stats.hp;
        f.rebuild = 0;
        spawnFx(f.x, f.y, "spark");
      }
    }
  }

  function worldDist(a, b) {
    const pa = unitWorldPos(a);
    const pb = unitWorldPos(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }

  function reach(a, b) {
    return a.guard || b.guard ? worldDist(a, b) : dist(a, b);
  }

  function findGuardTarget(u) {
    let best = null;
    let bestD = 1e9;
    for (const o of state.units) {
      if (o.side === u.side || o.hp <= 0 || o.guard) continue;
      const d = worldDist(u, o);
      const inArea = distCastleToUnit(u.side, o) <= (u.defendRange || 0.26);
      const close = d <= u.range + 0.1;
      if ((inArea || close) && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  function findTarget(u) {
    if (u.guard) return findGuardTarget(u);
    const fence = !u.flying ? intactEnemyFence(u.lane, u.side) : null;
    let best = null;
    let bestD = 1e9;
    for (const o of state.units) {
      if (o.side === u.side || o.hp <= 0) continue;
      if (!u.splash && o.lane !== u.lane && !o.guard) continue;
      if (fence && unitBehindFence(u, o, fence)) continue;
      const d = reach(u, o);
      const aggro = u.range + (u.splash || 0) + 0.04;
      if (d < aggro && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (best) return best;
    if (fence && Math.abs(u.y - fence.y) <= u.range + FENCE_STANDOFF + 0.02) {
      return { kind: "fence", fence, x: fence.x, y: fence.y, lane: fence.lane, side: fence.side };
    }
    if (fence) return null;
    const castleY = u.side === "player" ? ENEMY_CASTLE_Y : PLAYER_CASTLE_Y;
    const toCastle = Math.abs(u.y - castleY);
    if (toCastle <= CASTLE_RANGE + u.range * 0.25) {
      return { kind: "castle", side: u.side === "player" ? "ai" : "player", y: castleY, lane: 1 };
    }
    return null;
  }

  function hitCastle(side, dmg, from) {
    if (side === "ai") {
      state.enemyHp = Math.max(0, state.enemyHp - dmg);
    } else {
      state.playerHp = Math.max(0, state.playerHp - dmg);
    }
    state.shake = Math.min(8, state.shake + (side === "player" ? 3 : 2));
    const hx = LANE_X[from && from.lane] || 0.5;
    const hy = side === "ai" ? ENEMY_CASTLE_Y : PLAYER_CASTLE_Y;
    spawnFx(hx, hy, "spark");
    spawnFloater(hx, hy - 0.04, dmg);
    if (state.castles[side]) state.castles[side].flash = 1;
    if (state.enemyHp <= 0) endMatch("player");
    else if (state.playerHp <= 0) endMatch("ai");
  }

  function attack(u, target) {
    const out = outgoingDamage(u, u.dmg);
    if (target.kind === "castle") {
      hitCastle(target.side, out, u);
      return;
    }
    if (target.kind === "fence") {
      hitFence(target.fence || target, out);
      return;
    }
    dealUnitDamage(u, target, u.dmg);
    const tp = unitWorldPos(target);
    spawnFx(tp.x, tp.y, "hit");
    if (u.flying && (u.type === "dragon" || u.type === "bigDragon")) {
      spawnFx(tp.x, tp.y, "fire");
    }
    if (u.splash) {
      for (const o of state.units) {
        if (o === target || o.side === u.side || o.hp <= 0) continue;
        if (dist(target, o) <= u.splash) dealUnitDamage(u, o, Math.round(u.dmg * 0.5));
      }
    }
  }

  function unitWorldPos(u) {
    if (u.wx != null) return { x: u.wx, y: u.wy != null ? u.wy : u.y };
    return { x: LANE_X[u.lane] + (u.xJitter || 0), y: u.y };
  }

  function castleWorldPos(side) {
    return { x: 0.5, y: side === "player" ? PLAYER_CASTLE_Y : ENEMY_CASTLE_Y };
  }

  function distCastleToUnit(side, u) {
    const c = castleWorldPos(side);
    const p = unitWorldPos(u);
    return Math.hypot(p.x - c.x, p.y - c.y);
  }

  function spawnShot(opts) {
    const travel = Math.hypot(opts.tx - opts.x, opts.ty - opts.y);
    state.shots.push({
      x: opts.x,
      y: opts.y,
      tx: opts.tx,
      ty: opts.ty,
      travel: Math.max(travel, 0.001),
      speed: opts.speed,
      dmg: opts.dmg,
      side: opts.side,
      kind: opts.kind || "cannonball",
      arc: opts.arc || 0,
      target: opts.target || null,
      targetCastle: opts.targetCastle || null,
      targetFence: opts.targetFence || null,
      fromCastle: !!opts.fromCastle,
      life: 0,
      maxLife: opts.maxLife || 2.2,
      hit: false,
    });
  }

  function fireCastleAt(side, unit) {
    const stats = side === "player" ? state.settings.playerCastle : state.settings.enemyCastle;
    const c = castleWorldPos(side);
    const p = unitWorldPos(unit);
    const dir = side === "player" ? -1 : 1;
    const mx = c.x;
    const my = c.y + dir * 0.05;
    spawnShot({
      x: mx,
      y: my,
      tx: p.x,
      ty: p.y,
      speed: stats.shotSpeed,
      dmg: stats.dmg,
      side,
      kind: "cannonball",
      arc: 0.07,
      target: unit,
      fromCastle: true,
    });
    const st = state.castles[side];
    st.flash = 1;
    st.cd = stats.interval;
    spawnFx(mx, my, "muzzle");
    beep(side === "player" ? 480 : 400, 0.07, "square", 0.035);
  }

  function fireCannonUnit(u, target) {
    const p = unitWorldPos(u);
    let tx;
    let ty;
    let targetCastle = null;
    let liveTarget = null;
    let targetFence = null;
    if (target.kind === "castle") {
      const cp = castleWorldPos(target.side);
      tx = cp.x;
      ty = cp.y;
      targetCastle = target.side;
    } else if (target.kind === "fence") {
      const f = target.fence || target;
      tx = f.x;
      ty = f.y;
      targetFence = f;
    } else {
      const q = unitWorldPos(target);
      tx = q.x;
      ty = q.y;
      liveTarget = target;
    }
    const dir = u.side === "player" ? -1 : 1;
    spawnShot({
      x: p.x,
      y: p.y + dir * 0.02,
      tx,
      ty,
      speed: 0.55,
      dmg: outgoingDamage(u, u.dmg),
      side: u.side,
      kind: "cannonball",
      arc: 0.12,
      target: liveTarget,
      targetCastle,
      targetFence,
      fromCastle: false,
    });
    spawnFx(p.x, p.y + dir * 0.03, "muzzle");
    beep(200, 0.08, "triangle", 0.04);
  }

  function applyShotHit(s) {
    spawnFx(s.x, s.y, "hit");
    if (s.targetCastle) {
      if (s.targetCastle === "ai" && state.enemyHp > 0) hitCastle("ai", s.dmg, { lane: 1 });
      else if (s.targetCastle === "player" && state.playerHp > 0) hitCastle("player", s.dmg, { lane: 1 });
      return;
    }
    if (s.targetFence && s.targetFence.hp > 0) {
      hitFence(s.targetFence, s.dmg);
      return;
    }
    if (s.target && s.target.hp > 0) {
      const dmg = incomingDamage(s.target, s.dmg);
      s.target.hp -= dmg;
      s.target.hitFlash = 1;
      const p = unitWorldPos(s.target);
      spawnFloater(p.x, p.y, dmg);
    }
  }

  function stepCastles(dt) {
    if (!state.settings) return;
    for (const side of ["player", "ai"]) {
      const st = state.castles[side];
      if (!st) continue;
      st.cd = Math.max(0, st.cd - dt);
      if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 5);
      const alive = side === "player" ? state.playerHp > 0 : state.enemyHp > 0;
      if (!alive) {
        st.showRange = 0;
        continue;
      }
      const stats = side === "player" ? state.settings.playerCastle : state.settings.enemyCastle;
      const enemy = side === "player" ? "ai" : "player";
      let best = null;
      let bestD = 1e9;
      for (const u of state.units) {
        if (u.side !== enemy || u.hp <= 0) continue;
        const d0 = distCastleToUnit(side, u);
        if (d0 <= stats.range && d0 < bestD) {
          best = u;
          bestD = d0;
        }
      }
      if (best) {
        st.showRange = Math.min(1, st.showRange + dt * 4);
        if (st.cd <= 0) fireCastleAt(side, best);
      } else {
        st.showRange = Math.max(0, st.showRange - dt * 2);
      }
    }
  }

  function stepShots(dt) {
    for (const s of state.shots) {
      s.life += dt;
      if (s.target && s.target.hp > 0) {
        const p = unitWorldPos(s.target);
        s.tx = p.x;
        s.ty = p.y;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (dist <= step || dist < 0.02) {
        s.x = s.tx;
        s.y = s.ty;
        s.hit = true;
        applyShotHit(s);
      } else {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      }
      if (s.life > s.maxLife) s.hit = true;
    }
    state.shots = state.shots.filter((s) => !s.hit);
  }

  function simulate(dt) {
    if (state.screen !== "play" || state.winner) return;
    const d = state.settings;
    state.t += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    state.energy = Math.min(MAX_ENERGY, state.energy + d.playerRegen * dt);
    state.ai.energy = Math.min(MAX_ENERGY, (state.ai.energy || 0) + d.enemyRegen * dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 14);
    stepSeason(dt);

    if (state.timeLeft <= 0) {
      if (state.playerHp > state.enemyHp) endMatch("player");
      else if (state.enemyHp > state.playerHp) endMatch("ai");
      else endMatch("draw");
      return;
    }

    for (const u of state.units) {
      if (u.hp <= 0) {
        u.deadT = (u.deadT || 0) + dt;
        continue;
      }
      if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 5);
      if (u.guard) {
        stepGuard(u, dt);
        continue;
      }
      u.bob += dt;
      const target = findTarget(u);
      const hitD = target && target.kind === "castle"
        ? Math.abs(u.y - target.y)
        : target && target.kind === "fence"
        ? Math.abs(u.y - target.y)
        : target
        ? reach(u, target)
        : 0;
      const inHit = target && (
        target.kind === "castle" ? Math.abs(u.y - target.y) <= CASTLE_RANGE
        : target.kind === "fence" ? Math.abs(u.y - target.y) <= u.range + FENCE_STANDOFF
        : hitD <= u.range
      );
      if (inHit) {
        u.atkCd -= dt;
        if (u.atkCd <= 0) {
          if (u.type === "cannon" || u.projectile) fireCannonUnit(u, target);
          else attack(u, target);
          u.atkCd = u.atk;
          u.swing = 1;
        }
      } else {
        const dir = u.side === "player" ? -1 : 1;
        const cap = u.side === "player" ? ENEMY_CASTLE_Y : PLAYER_CASTLE_Y;
        let next = u.y + dir * u.speed * d.speedMul * dt;
        const fence = !u.flying ? intactEnemyFence(u.lane, u.side) : null;
        if (fence) {
          const stop = fenceStopY(u, fence);
          if (dir < 0) next = Math.max(next, stop);
          else next = Math.min(next, stop);
        }
        if (dir < 0) u.y = Math.max(cap, next);
        else u.y = Math.min(cap, next);
      }
      if (u.swing > 0) u.swing = Math.max(0, u.swing - dt * 4);
      if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 5);
    }

    stepCastles(dt);
    stepShots(dt);
    stepGuardRespawns(dt);
    stepFences(dt);

    for (const u of state.units) {
      if (u.hp <= 0 && !u.popped) {
        u.popped = true;
        const p = unitWorldPos(u);
        spawnFx(p.x, p.y, "pop");
        beep(u.side === "player" ? 240 : 360, 0.08, "square", 0.03);
        if (u.guard) {
          const stats = u.side === "player" ? state.settings.playerGuard : state.settings.enemyGuard;
          state.guardTimers[u.side + "-" + u.guardSlot] = stats.respawn;
        }
      }
    }
    state.units = state.units.filter((u) => !(u.hp <= 0 && (u.deadT || 0) > 0.35));
    state.fx = state.fx.filter((f) => {
      f.life -= dt;
      if (f.kind === "shard") {
        f.x += (f.vx || 0) * dt;
        f.y += (f.vy || 0) * dt;
        f.vy = (f.vy || 0) + dt * 0.45;
        f.rot = (f.rot || 0) + (f.spin || 0) * dt;
      } else if (f.kind === "fire" || f.kind === "smoke") {
        f.x += (f.vx || 0) * dt;
        f.y += (f.vy || 0) * dt;
      } else {
        f.y -= dt * 0.08;
      }
      return f.life > 0;
    });
    state.floaters = (state.floaters || []).filter((f) => {
      f.life -= dt;
      f.y -= dt * 0.14;
      return f.life > 0;
    });

    stepAi(dt);
    updateHud();
  }

  function trimFx() {
    if (state.fx.length > MAX_FX) state.fx.splice(0, state.fx.length - MAX_FX);
  }

  function spawnFx(x, y, kind) {
    if (kind === "shatter") {
      for (let i = 0; i < 10; i++) {
        state.fx.push({
          x,
          y,
          kind: "shard",
          life: 0.45 + Math.random() * 0.2,
          max: 0.65,
          vx: (Math.random() - 0.5) * 0.38,
          vy: (Math.random() - 0.55) * 0.4,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 10,
          size: 0.28 + Math.random() * 0.5,
        });
      }
      trimFx();
      return;
    }
    if (kind === "fire") {
      for (let i = 0; i < 4; i++) {
        state.fx.push({
          x: x + (Math.random() - 0.5) * 0.03,
          y: y + (Math.random() - 0.5) * 0.03,
          kind: "fire",
          life: 0.28 + Math.random() * 0.12,
          max: 0.4,
          vx: (Math.random() - 0.5) * 0.08,
          vy: -0.08 - Math.random() * 0.08,
        });
      }
      trimFx();
      return;
    }
    const life = kind === "muzzle" ? 0.22 : kind === "smoke" ? 0.4 : 0.35;
    state.fx.push({ x, y, kind, life, max: life });
    if (kind === "muzzle") {
      state.fx.push({
        x,
        y,
        kind: "smoke",
        life: 0.4,
        max: 0.4,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.04,
      });
    }
    trimFx();
  }

  function spawnFloater(x, y, text) {
    state.floaters = state.floaters || [];
    state.floaters.push({ x, y, text: String(text), life: 0.7, max: 0.7 });
    if (state.floaters.length > MAX_FLOATERS) {
      state.floaters.splice(0, state.floaters.length - MAX_FLOATERS);
    }
  }

  function showSeasonBanner() {
    const el = els.seasonBanner;
    if (!el) return;
    if (els.bannerIcon) els.bannerIcon.textContent = SEASON_ICON[state.season] || "";
    if (els.bannerName) els.bannerName.textContent = SEASON_HE[state.season] || "";
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    speak(SEASON_HE[state.season] + "!");
  }

  function stepSeason(dt) {
    state.seasonLeft -= dt;
    if (state.seasonLeft <= 0) {
      const i = Math.max(0, SEASON_ORDER.indexOf(state.season));
      state.season = SEASON_ORDER[(i + 1) % SEASON_ORDER.length];
      state.seasonLeft += SEASON_SECS;
      if (state.seasonLeft <= 0) state.seasonLeft = SEASON_SECS;
      state.ambient = [];
      showSeasonBanner();
    }
    stepAmbient(dt);
  }

  function stepAmbient(dt) {
    const list = state.ambient || (state.ambient = []);
    for (const p of list) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
    }
    state.ambient = list.filter((p) => p.life > 0);
    const want = state.season === "summer" ? 16 : 28;
    let guard = 0;
    while (state.ambient.length < want && guard++ < 8) spawnAmbient();
    if (state.ambient.length > MAX_AMBIENT) state.ambient.length = MAX_AMBIENT;
  }

  function spawnAmbient() {
    const s = state.season;
    const p = {
      x: Math.random(),
      y: Math.random(),
      vx: 0,
      vy: 0,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 3,
      life: 2.5 + Math.random() * 3.5,
      size: 0.4 + Math.random() * 0.7,
      kind: s,
    };
    if (s === "winter") {
      p.vy = 0.08 + Math.random() * 0.1;
      p.vx = (Math.random() - 0.5) * 0.06;
      p.size = 0.25 + Math.random() * 0.45;
    } else if (s === "fall") {
      p.vy = 0.07 + Math.random() * 0.1;
      p.vx = 0.04 + Math.random() * 0.08;
      p.hue = 18 + Math.random() * 28;
    } else if (s === "spring") {
      p.vy = 0.05 + Math.random() * 0.08;
      p.vx = (Math.random() - 0.5) * 0.08;
      p.hue = 330 + Math.random() * 40;
    } else {
      p.y = 0.2 + Math.random() * 0.7;
      p.vy = -0.06 - Math.random() * 0.05;
      p.vx = (Math.random() - 0.5) * 0.03;
      p.life = 1.2 + Math.random() * 1.4;
    }
    state.ambient.push(p);
  }

  function guardKey(side, slot) {
    return side + "-" + slot;
  }

  function spawnGuard(post) {
    if (state.winner) return;
    if (state.units.some((u) => u.guard && u.side === post.side && u.guardSlot === post.slot && u.hp > 0)) return;
    const stats = post.side === "player" ? state.settings.playerGuard : state.settings.enemyGuard;
    const u = {
      id: state.nextId++,
      type: "guard",
      guard: true,
      guardSlot: post.slot,
      side: post.side,
      lane: post.lane,
      xJitter: 0,
      wx: post.x,
      wy: post.y,
      y: post.y,
      homeX: post.x,
      homeY: post.y,
      hp: stats.hp,
      maxHp: stats.hp,
      dmg: stats.dmg,
      range: stats.range,
      speed: stats.speed,
      atk: stats.atk,
      splash: 0,
      flying: false,
      leash: stats.leash,
      defendRange: stats.defendRange,
      atkCd: 0.2,
      bob: Math.random() * 10,
      swing: 0,
    };
    state.units.push(u);
    state.guardTimers[guardKey(post.side, post.slot)] = 0;
    spawnFx(post.x, post.y, "spark");
  }

  function stepGuard(u, dt) {
    u.bob += dt;
    const target = findGuardTarget(u);
    if (target && worldDist(u, target) <= u.range) {
      u.atkCd -= dt;
      if (u.atkCd <= 0) {
        attack(u, target);
        u.atkCd = u.atk;
        u.swing = 1;
      }
    } else {
      let tx = u.homeX;
      let ty = u.homeY;
      if (target) {
        const p = unitWorldPos(target);
        tx = p.x;
        ty = p.y;
      }
      const dx = tx - u.wx;
      const dy = ty - u.wy;
      const dist0 = Math.hypot(dx, dy);
      if (dist0 > 0.006) {
        const step = u.speed * (state.settings.speedMul || 1) * dt;
        let nx = u.wx + (dx / dist0) * Math.min(step, dist0);
        let ny = u.wy + (dy / dist0) * Math.min(step, dist0);
        const hx = nx - u.homeX;
        const hy = ny - u.homeY;
        const hd = Math.hypot(hx, hy);
        const leash = u.leash || 0.14;
        if (hd > leash) {
          nx = u.homeX + (hx / hd) * leash;
          ny = u.homeY + (hy / hd) * leash;
        }
        u.wx = nx;
        u.wy = ny;
        u.y = u.wy;
        u.lane = u.wx < 1 / 3 ? 0 : u.wx < 2 / 3 ? 1 : 2;
      }
    }
    if (u.swing > 0) u.swing = Math.max(0, u.swing - dt * 4);
  }

  function stepGuardRespawns(dt) {
    if (!state.settings) return;
    for (const post of GUARD_POSTS) {
      const key = guardKey(post.side, post.slot);
      const alive = state.units.some((u) => u.guard && u.side === post.side && u.guardSlot === post.slot && (u.hp > 0 || (u.deadT || 0) <= 0.35));
      if (alive) continue;
      if (!(state.guardTimers[key] > 0)) {
        const stats = post.side === "player" ? state.settings.playerGuard : state.settings.enemyGuard;
        state.guardTimers[key] = stats.respawn;
      }
      state.guardTimers[key] -= dt;
      if (state.guardTimers[key] <= 0) spawnGuard(post);
    }
  }

  function canDeploy(side, typeId) {
    const typ = UNIT_TYPES[typeId];
    if (!typ) return false;
    if (state.units.filter((u) => !u.guard).length >= MAX_UNITS) return false;
    const pool = side === "player" ? state.energy : state.ai.energy;
    return pool + 1e-6 >= typ.cost;
  }

  function deploy(side, typeId, lane) {
    if (state.screen !== "play" || state.winner) return false;
    const typ = UNIT_TYPES[typeId];
    if (!typ) return false;
    lane = Math.max(0, Math.min(2, lane | 0));
    if (!canDeploy(side, typeId)) return false;
    if (side === "player") state.energy -= typ.cost;
    else state.ai.energy -= typ.cost;
    const u = {
      id: state.nextId++,
      type: typ.id,
      side,
      lane,
      xJitter: (Math.random() - 0.5) * 0.03,
      y: side === "player" ? PLAYER_SPAWN_Y : ENEMY_SPAWN_Y,
      hp: typ.hp,
      maxHp: typ.hp,
      dmg: typ.dmg,
      range: typ.range,
      speed: typ.speed,
      atk: typ.atk,
      splash: typ.splash,
      flying: typ.flying,
      projectile: typ.projectile || null,
      atkCd: 0.15,
      bob: Math.random() * 10,
      swing: 0,
    };
    state.units.push(u);
    if (side === "player") {
      state.lastLane = lane;
      spawnFx(LANE_X[lane], u.y, "spark");
      beep(440 + typ.cost * 40, 0.08, "triangle", 0.05);
    }
    updateUnitButtons();
    return true;
  }

  function stepAi(dt) {
    const ai = state.ai;
    const d = state.settings;
    if (ai.wait > 0) {
      ai.wait -= dt;
      return;
    }
    ai.think -= dt;
    if (ai.think > 0) return;
    ai.think = d.aiThink * (0.75 + Math.random() * 0.5);

    const affordable = Object.values(UNIT_TYPES).filter((t) => ai.energy >= t.cost);
    if (!affordable.length) return;

    let typ;
    if (state.difficulty === "hard") {
      const threats = state.units.filter((u) => u.side === "player" && u.hp > 0 && !u.guard);
      const kinds = threats.reduce((m, u) => ((m[u.type] = (m[u.type] || 0) + 1), m), {});
      if ((kinds.knight || 0) >= (kinds.archer || 0) && (kinds.knight || 0) >= (kinds.dragon || 0) && ai.energy >= UNIT_TYPES.dragon.cost) typ = UNIT_TYPES.dragon;
      else if ((kinds.dragon || 0) > 0 && ai.energy >= UNIT_TYPES.archer.cost) typ = UNIT_TYPES.archer;
      else if ((kinds.archer || 0) > 0 && ai.energy >= UNIT_TYPES.knight.cost) typ = UNIT_TYPES.knight;
    }
    if (!typ) {
      const hard = state.difficulty === "hard";
      const weights = affordable.map((t) => {
        if (t.id === "archer") return 3;
        if (t.id === "knight") return 2;
        if (t.id === "dragon") return 2;
        if (t.id === "cannon") return hard ? 1.2 : 0.55;
        if (t.id === "bigDragon") return hard ? 1 : 0.4;
        return 1;
      });
      const sum = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum;
      typ = affordable[0];
      for (let i = 0; i < affordable.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          typ = affordable[i];
          break;
        }
      }
    }

    let lane = Math.floor(Math.random() * 3);
    if (state.difficulty === "hard" || Math.random() < 0.4) {
      const counts = [0, 0, 0];
      for (const u of state.units) {
        if (u.hp <= 0) continue;
        counts[u.lane] += u.side === "player" ? 2 : -1;
      }
      let best = 0;
      for (let i = 1; i < 3; i++) if (counts[i] > counts[best]) best = i;
      if (counts[best] > 0) lane = best;
      else if (Math.random() < 0.5) lane = state.lastLane;
    }
    deploy("ai", typ.id, lane);
  }

  /* ---------- hud ---------- */

  function updateHud() {
    const pe = Math.max(0, state.playerHp / state.playerMax);
    const ee = Math.max(0, state.enemyHp / state.enemyMax);
    els.hpPlayerFill.style.width = (pe * 100).toFixed(1) + "%";
    els.hpEnemyFill.style.width = (ee * 100).toFixed(1) + "%";
    els.hpPlayerTxt.textContent = String(Math.ceil(state.playerHp));
    els.hpEnemyTxt.textContent = String(Math.ceil(state.enemyHp));
    const e = state.energy;
    els.energyTxt.textContent = String(Math.floor(e));
    const pips = els.energyPips.children;
    if (pips.length !== MAX_ENERGY) {
      els.energyPips.innerHTML = "";
      for (let i = 0; i < MAX_ENERGY; i++) els.energyPips.appendChild(document.createElement("span"));
    }
    Array.from(els.energyPips.children).forEach((pip, i) => {
      pip.className = e >= i + 1 ? "on" : e > i ? "half" : "";
    });
    const t = Math.ceil(state.timeLeft);
    const m = Math.floor(t / 60);
    const s = t % 60;
    els.timer.textContent = m + ":" + String(s).padStart(2, "0");
    if (els.seasonIcon) els.seasonIcon.textContent = SEASON_ICON[state.season] || "";
    if (els.seasonName) els.seasonName.textContent = SEASON_HE[state.season] || "";
    if (els.seasonCount) els.seasonCount.textContent = String(Math.max(0, Math.ceil(state.seasonLeft || 0)));
    updateUnitButtons();
  }

  function updateUnitButtons() {
    els.unitBtns.forEach((btn) => {
      const id = btn.getAttribute("data-unit");
      const typ = UNIT_TYPES[id];
      btn.classList.toggle("selected", state.selected === id && state.screen === "play");
      btn.classList.toggle("disabled", !!(typ && state.screen === "play" && state.energy < typ.cost));
      btn.classList.toggle("season-hot", !!(typ && state.screen === "play" && UNIT_SEASON[id] === state.season));
    });
  }

  /* ---------- render ---------- */

  const tex = { key: "", grass: null, dirt: null, brick: null, vignette: null, water: null };

  function mulberry(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function ensureTextures(cw, ch) {
    const key = (cw | 0) + "x" + (ch | 0);
    if (tex.key === key && tex.grass) return;
    const needTiles = !tex.grass;
    tex.key = key;

    if (needTiles) {
      const grass = makeCanvas(256, 256);
      const g = grass.getContext("2d");
      const rnd = mulberry(0x51a55e);
      g.fillStyle = "#4caf55";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = rnd() > 0.5 ? "rgba(28,110,40,.16)" : "rgba(210,255,160,.14)";
        g.beginPath();
        g.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 7 + rnd() * 18, rnd() * 6, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "rgba(30,90,30,.2)";
      g.lineWidth = 1.2;
      for (let i = 0; i < 260; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (rnd() - 0.5) * 4, y - 4, x + (rnd() - 0.5) * 5, y - 8 - rnd() * 7);
        g.stroke();
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = "rgba(90,80,50,.28)";
        g.beginPath();
        g.ellipse(rnd() * 256, rnd() * 256, 1.2 + rnd() * 2, 1 + rnd(), 0, 0, Math.PI * 2);
        g.fill();
      }
      tex.grass = grass;

      const dirt = makeCanvas(256, 256);
      const d = dirt.getContext("2d");
      const rd = mulberry(0x61d17);
      const dg = d.createLinearGradient(0, 0, 256, 0);
      dg.addColorStop(0, "#8a6238");
      dg.addColorStop(0.5, "#b07a45");
      dg.addColorStop(1, "#8a6238");
      d.fillStyle = dg;
      d.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 80; i++) {
        d.fillStyle = rd() > 0.5 ? "rgba(60,35,16,.18)" : "rgba(230,200,140,.16)";
        d.beginPath();
        d.ellipse(rd() * 256, rd() * 256, 8 + rd() * 22, 4 + rd() * 10, rd() * 4, 0, Math.PI * 2);
        d.fill();
      }
      for (let i = 0; i < 70; i++) {
        const px = rd() * 256;
        const py = rd() * 256;
        const rr = 1.5 + rd() * 3.2;
        d.fillStyle = rd() > 0.5 ? "#7a6a58" : "#c9b49a";
        d.beginPath();
        d.ellipse(px, py, rr, rr * 0.7, rd() * 3, 0, Math.PI * 2);
        d.fill();
      }
      d.strokeStyle = "rgba(50,30,12,.12)";
      d.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        d.beginPath();
        d.moveTo(20 + rd() * 200, 0);
        d.bezierCurveTo(rd() * 256, 80, rd() * 256, 160, 20 + rd() * 200, 256);
        d.stroke();
      }
      tex.dirt = dirt;

      const brick = makeCanvas(128, 128);
      const b = brick.getContext("2d");
      const rb = mulberry(0xb71c);
      b.fillStyle = "#6a6e78";
      b.fillRect(0, 0, 128, 128);
      const bw = 32;
      const bh = 16;
      for (let y = 0, row = 0; y < 140; y += bh, row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < 140; x += bw) {
          const shade = 0.78 + rb() * 0.28;
          const base = 150 + Math.floor(rb() * 30);
          b.fillStyle = "rgb(" + Math.floor(base * shade) + "," + Math.floor((base - 8) * shade) + "," + Math.floor((base - 16) * shade) + ")";
          b.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
          b.fillStyle = "rgba(255,255,255,.12)";
          b.fillRect(x + off + 2, y + 1, bw - 4, 3);
        }
      }
      tex.brick = brick;

      const water = makeCanvas(256, 64);
      const w = water.getContext("2d");
      const wg = w.createLinearGradient(0, 0, 0, 64);
      wg.addColorStop(0, "#7ec8e8");
      wg.addColorStop(0.5, "#4aa0d0");
      wg.addColorStop(1, "#3a88b8");
      w.fillStyle = wg;
      w.fillRect(0, 0, 256, 64);
      w.strokeStyle = "rgba(255,255,255,.28)";
      w.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        w.beginPath();
        w.moveTo(0, 10 + i * 9);
        for (let x = 0; x <= 256; x += 16) w.quadraticCurveTo(x + 8, 6 + i * 9 + ((i % 2) ? 4 : -4), x + 16, 10 + i * 9);
        w.stroke();
      }
      tex.water = water;
    }

    const vig = makeCanvas(cw, ch);
    const v = vig.getContext("2d");
    const rg = v.createRadialGradient(cw * 0.5, ch * 0.45, Math.min(cw, ch) * 0.2, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.72);
    rg.addColorStop(0, "rgba(0,0,0,0)");
    rg.addColorStop(0.65, "rgba(20,40,10,.08)");
    rg.addColorStop(1, "rgba(10,20,8,.38)");
    v.fillStyle = rg;
    v.fillRect(0, 0, cw, ch);
    tex.vignette = vig;
  }

  function resize() {
    const r = els.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (els.canvas.width !== w) els.canvas.width = w;
    if (els.canvas.height !== h) els.canvas.height = h;
  }

  function toPx(x, y) {
    const cw = els.canvas.width;
    const ch = els.canvas.height;
    const padX = cw * 0.05;
    const padY = ch * 0.03;
    return { x: padX + x * (cw - padX * 2), y: padY + y * (ch - padY * 2) };
  }

  function unitScale() {
    return Math.min(els.canvas.width, els.canvas.height) * 0.072;
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function seasonSky() {
    const s = state.season;
    if (s === "winter") return { top: "#c5d8ef", bot: "#e8f2fa", sun: "#f4f8ff", glow: "rgba(220,235,255,.55)" };
    if (s === "fall") return { top: "#f0b070", bot: "#f7d9a0", sun: "#ffd089", glow: "rgba(255,180,80,.45)" };
    if (s === "spring") return { top: "#8ed4ff", bot: "#d8f4c8", sun: "#fff6c8", glow: "rgba(255,200,220,.35)" };
    return { top: "#6ec0ff", bot: "#ffe7a0", sun: "#fff3a8", glow: "rgba(255,210,80,.5)" };
  }

  function drawSkyGrass(c, cw, ch) {
    ensureTextures(cw, ch);
    const sky = seasonSky();
    const g = c.createLinearGradient(0, 0, 0, ch * 0.26);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bot);
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch * 0.26);
    const sunX = cw * (state.season === "winter" ? 0.78 : 0.16);
    const sunY = ch * 0.07;
    const rad = c.createRadialGradient(sunX, sunY, 4, sunX, sunY, ch * 0.22);
    rad.addColorStop(0, sky.sun);
    rad.addColorStop(0.25, sky.glow);
    rad.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rad;
    c.fillRect(0, 0, cw, ch * 0.3);
    c.fillStyle = sky.sun;
    c.beginPath();
    c.arc(sunX, sunY, ch * 0.035, 0, Math.PI * 2);
    c.fill();
    // soft clouds
    c.globalAlpha = state.season === "winter" ? 0.7 : 0.55;
    drawCloud(c, cw * 0.42, ch * 0.06, cw * 0.08);
    drawCloud(c, cw * 0.7, ch * 0.09, cw * 0.06);
    c.globalAlpha = 1;
    const grassY = ch * 0.18;
    const pat = c.createPattern(tex.grass, "repeat");
    c.fillStyle = pat || "#5ec86a";
    c.fillRect(0, grassY, cw, ch - grassY);
    // season grass tint
    if (state.season === "fall") {
      c.fillStyle = "rgba(210,130,40,.18)";
      c.fillRect(0, grassY, cw, ch - grassY);
    } else if (state.season === "winter") {
      c.fillStyle = "rgba(220,235,250,.28)";
      c.fillRect(0, grassY, cw, ch - grassY);
    } else if (state.season === "spring") {
      c.fillStyle = "rgba(120,210,90,.12)";
      c.fillRect(0, grassY, cw, ch - grassY);
    } else {
      c.fillStyle = "rgba(255,200,60,.08)";
      c.fillRect(0, grassY, cw, ch - grassY);
    }
  }

  function drawCloud(c, x, y, s) {
    c.fillStyle = "rgba(255,255,255,.9)";
    c.beginPath();
    c.arc(x - s * 0.6, y, s * 0.45, 0, Math.PI * 2);
    c.arc(x, y - s * 0.15, s * 0.55, 0, Math.PI * 2);
    c.arc(x + s * 0.55, y, s * 0.42, 0, Math.PI * 2);
    c.fill();
  }

  function drawCreek(c) {
    const left = toPx(0, 0.5);
    const right = toPx(1, 0.5);
    const sc = unitScale();
    const y = left.y;
    const h = sc * 0.85;
    c.save();
    c.beginPath();
    c.moveTo(left.x - sc, y - h * 0.45);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = left.x + (right.x - left.x) * t;
      const wave = Math.sin(t * 8 + state.t * 1.4) * h * 0.08;
      c.lineTo(x, y - h * 0.4 + wave);
    }
    c.lineTo(right.x + sc, y + h * 0.45);
    for (let i = 12; i >= 0; i--) {
      const t = i / 12;
      const x = left.x + (right.x - left.x) * t;
      const wave = Math.sin(t * 8 + state.t * 1.4 + 1) * h * 0.08;
      c.lineTo(x, y + h * 0.4 + wave);
    }
    c.closePath();
    const wg = c.createLinearGradient(0, y - h, 0, y + h);
    wg.addColorStop(0, "rgba(140,210,230,.85)");
    wg.addColorStop(0.5, "rgba(60,150,200,.9)");
    wg.addColorStop(1, "rgba(40,110,160,.85)");
    c.fillStyle = wg;
    c.fill();
    c.strokeStyle = "rgba(255,255,255,.35)";
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = left.x + (right.x - left.x) * t;
      const yy = y - h * 0.12 + Math.sin(t * 10 + state.t * 2) * h * 0.1;
      if (i === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
    c.restore();
    // stone banks
    for (let i = 0; i < 10; i++) {
      const t = (i + 0.5) / 10;
      const x = left.x + (right.x - left.x) * t;
      c.fillStyle = i % 2 ? "#8a8a80" : "#a9a898";
      c.beginPath();
      c.ellipse(x, y - h * 0.48, sc * 0.16, sc * 0.1, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(x + sc * 0.1, y + h * 0.48, sc * 0.14, sc * 0.09, 0, 0, Math.PI * 2);
      c.fill();
    }
    // bridges on lanes
    for (let i = 0; i < 3; i++) {
      const p = toPx(LANE_X[i], 0.5);
      c.save();
      c.translate(p.x, p.y);
      c.fillStyle = "rgba(40,50,30,.22)";
      c.beginPath();
      c.ellipse(0, h * 0.2, sc * 0.7, sc * 0.18, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9a8060";
      roundRect(c, -sc * 0.62, -h * 0.55, sc * 1.24, h * 1.1, 6);
      c.fill();
      c.fillStyle = "#c4a078";
      roundRect(c, -sc * 0.55, -h * 0.48, sc * 1.1, h * 0.96, 5);
      c.fill();
      c.strokeStyle = "rgba(70,50,30,.35)";
      c.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        c.beginPath();
        c.moveTo(-sc * 0.5, k * h * 0.16);
        c.lineTo(sc * 0.5, k * h * 0.16);
        c.stroke();
      }
      c.restore();
    }
  }

  function drawPaths(c) {
    const pat = tex.dirt ? c.createPattern(tex.dirt, "repeat") : null;
    const w = unitScale() * 1.15;
    for (let i = 0; i < 3; i++) {
      const a = toPx(LANE_X[i], 0.14);
      const b = toPx(LANE_X[i], 0.86);
      c.save();
      c.lineCap = "round";
      // edge stones
      c.strokeStyle = "rgba(80,70,55,.55)";
      c.lineWidth = w + unitScale() * 0.28;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.strokeStyle = pat || "#b07a45";
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.restore();
    }
  }

  function drawSeasonMood(c, cw, ch) {
    const s = state.season;
    if (s === "summer") {
      const g = c.createRadialGradient(cw * 0.16, ch * 0.08, 10, cw * 0.3, ch * 0.3, ch);
      g.addColorStop(0, "rgba(255,210,80,.16)");
      g.addColorStop(1, "rgba(255,140,40,.04)");
      c.fillStyle = g;
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = "rgba(255,255,255,.08)";
      c.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        const y = ((state.t * 40 + i * 90) % (ch * 0.8)) + ch * 0.15;
        c.beginPath();
        for (let x = 0; x < cw; x += 16) {
          const yy = y + Math.sin(x * 0.04 + state.t * 6 + i) * 8;
          if (x === 0) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      }
    } else if (s === "winter") {
      c.fillStyle = "rgba(180,210,235,.18)";
      c.fillRect(0, 0, cw, ch);
    } else if (s === "fall") {
      const g = c.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(255,160,60,.1)");
      g.addColorStop(1, "rgba(180,70,20,.08)");
      c.fillStyle = g;
      c.fillRect(0, 0, cw, ch);
    } else {
      const g = c.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(255,200,230,.08)");
      g.addColorStop(1, "rgba(140,220,140,.08)");
      c.fillStyle = g;
      c.fillRect(0, 0, cw, ch);
    }
  }

  function drawAmbient(c) {
    const sc = unitScale();
    for (const p of state.ambient || []) {
      const pos = toPx(p.x, p.y);
      const a = Math.max(0, Math.min(1, p.life / 1.2));
      c.save();
      c.translate(pos.x, pos.y);
      c.rotate(p.rot || 0);
      c.globalAlpha = 0.35 + 0.55 * a;
      const sz = sc * 0.22 * (p.size || 1);
      if (p.kind === "winter") {
        c.fillStyle = "#fff";
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          c.moveTo(0, 0);
          c.lineTo(Math.cos(ang) * sz, Math.sin(ang) * sz);
        }
        c.strokeStyle = "rgba(255,255,255,.95)";
        c.lineWidth = 1.4;
        c.stroke();
        c.beginPath();
        c.arc(0, 0, sz * 0.28, 0, Math.PI * 2);
        c.fill();
      } else if (p.kind === "fall") {
        c.fillStyle = "hsl(" + (p.hue || 25) + ",80%,50%)";
        c.beginPath();
        c.ellipse(0, 0, sz, sz * 0.55, 0.4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "rgba(80,40,10,.4)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-sz, 0);
        c.lineTo(sz, 0);
        c.stroke();
      } else if (p.kind === "spring") {
        c.fillStyle = "hsl(" + (p.hue || 340) + ",80%,75%)";
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          c.beginPath();
          c.ellipse(Math.cos(ang) * sz * 0.45, Math.sin(ang) * sz * 0.45, sz * 0.38, sz * 0.22, ang, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "#ffe27a";
        c.beginPath();
        c.arc(0, 0, sz * 0.2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = "rgba(255,230,140,.7)";
        c.beginPath();
        c.ellipse(0, 0, sz * 0.35, sz * 0.9, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  function drawCastle(c, side) {
    const p = toPx(0.5, side === "player" ? PLAYER_CASTLE_Y : ENEMY_CASTLE_Y);
    const s = unitScale();
    const team = side === "player";
    const hp = team ? state.playerHp : state.enemyHp;
    const max = team ? state.playerMax : state.enemyMax;
    const ratio = max ? Math.max(0, hp / max) : 1;
    const flash = (state.castles[side] && state.castles[side].flash) || 0;
    const stone = team ? "#6d7fa0" : "#a06a68";
    const stoneDk = team ? "#3d4f70" : "#6e3836";
    const trim = team ? "#3d7cff" : "#e23b3b";
    const roof = team ? "#2a4a8c" : "#9a2020";
    c.save();
    c.translate(p.x, p.y);
    // soft shadow
    c.fillStyle = "rgba(20,40,20,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.7, s * 1.7, s * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    const bw = s * 2.35;
    const bh = s * 1.55;
    const x0 = -bw / 2;
    const y0 = -bh * 0.85;
    // keep / body
    c.fillStyle = stoneDk;
    roundRect(c, x0 - 4, y0 + 8, bw + 8, bh + 8, 8);
    c.fill();
    c.fillStyle = stone;
    roundRect(c, x0, y0, bw, bh, 8);
    c.fill();
    if (tex.brick) {
      c.save();
      roundRect(c, x0, y0, bw, bh, 8);
      c.clip();
      c.globalAlpha = 0.45;
      c.fillStyle = c.createPattern(tex.brick, "repeat");
      c.fillRect(x0 - 20, y0 - 20, bw + 40, bh + 40);
      c.restore();
    }
    // team banner stripe
    c.fillStyle = trim;
    c.globalAlpha = 0.35;
    c.fillRect(x0, y0 + bh * 0.25, bw, bh * 0.18);
    c.globalAlpha = 1;
    // crenellations
    const merlon = s * 0.22;
    for (let i = 0; i < 6; i++) {
      const mx = x0 + 4 + i * ((bw - 8) / 6);
      c.fillStyle = i % 2 ? stone : stoneDk;
      roundRect(c, mx, y0 - merlon, (bw - 8) / 6 - 3, merlon + 2, 2);
      c.fill();
    }
    // side towers
    for (const dir of [-1, 1]) {
      const tx = dir * (bw / 2 + s * 0.02);
      c.fillStyle = stoneDk;
      roundRect(c, tx - s * 0.32, y0 - s * 0.15, s * 0.64, bh + s * 0.25, 6);
      c.fill();
      c.fillStyle = stone;
      roundRect(c, tx - s * 0.28, y0 - s * 0.1, s * 0.56, bh + s * 0.15, 5);
      c.fill();
      c.fillStyle = roof;
      c.beginPath();
      c.moveTo(tx - s * 0.36, y0 - s * 0.08);
      c.lineTo(tx, y0 - s * 0.55);
      c.lineTo(tx + s * 0.36, y0 - s * 0.08);
      c.closePath();
      c.fill();
      c.fillStyle = "#1a1a1a";
      roundRect(c, tx - s * 0.1, y0 + s * 0.25, s * 0.2, s * 0.28, 3);
      c.fill();
    }
    // gate
    c.fillStyle = "#2a2418";
    c.beginPath();
    c.moveTo(-s * 0.32, y0 + bh);
    c.lineTo(-s * 0.32, y0 + bh * 0.45);
    c.quadraticCurveTo(0, y0 + bh * 0.22, s * 0.32, y0 + bh * 0.45);
    c.lineTo(s * 0.32, y0 + bh);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(255,210,80,.35)";
    c.lineWidth = 2;
    c.stroke();
    // windows
    c.fillStyle = "#ffe9a0";
    for (const wx of [-s * 0.55, s * 0.55]) {
      roundRect(c, wx - s * 0.1, y0 + s * 0.35, s * 0.2, s * 0.26, 3);
      c.fill();
    }
    // flag
    const wave = Math.sin(state.t * 3.2) * s * 0.12;
    const fx = s * 0.15;
    const fy = y0 - merlon - s * 0.15;
    c.strokeStyle = "#d8c9a0";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(fx, fy + s * 0.7);
    c.lineTo(fx, fy - s * 0.15);
    c.stroke();
    c.fillStyle = trim;
    c.beginPath();
    c.moveTo(fx, fy - s * 0.12);
    c.lineTo(fx + s * 0.7 + wave, fy + s * 0.08);
    c.lineTo(fx, fy + s * 0.28);
    c.closePath();
    c.fill();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(fx + s * 0.28 + wave * 0.4, fy + s * 0.08, s * 0.07, 0, Math.PI * 2);
    c.fill();
    // damage cracks + smoke
    if (ratio < 0.6) {
      c.strokeStyle = "rgba(20,15,10,.7)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-s * 0.2, y0 + s * 0.2);
      c.lineTo(-s * 0.05, y0 + s * 0.55);
      c.lineTo(-s * 0.22, y0 + s * 0.9);
      if (ratio < 0.4) {
        c.moveTo(s * 0.15, y0 + s * 0.15);
        c.lineTo(s * 0.3, y0 + s * 0.5);
        c.lineTo(s * 0.12, y0 + s * 0.95);
      }
      c.stroke();
    }
    if (ratio < 0.35) {
      for (let i = 0; i < 3; i++) {
        const sy = y0 - s * 0.2 - Math.abs(Math.sin(state.t * 1.5 + i)) * s * 0.35;
        c.fillStyle = "rgba(80,80,80," + (0.22 + 0.12 * Math.sin(state.t * 2 + i)) + ")";
        c.beginPath();
        c.ellipse((-0.4 + i * 0.4) * s, sy, s * (0.22 + i * 0.06), s * 0.14, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (flash > 0) {
      c.fillStyle = "rgba(255,255,200," + (0.35 * flash) + ")";
      roundRect(c, x0 - 6, y0 - merlon - 4, bw + 12, bh + merlon + 12, 10);
      c.fill();
    }
    // health bar
    const barW = s * 2.1;
    const barY = y0 - merlon - s * 0.42;
    c.fillStyle = "rgba(0,0,0,.4)";
    roundRect(c, -barW / 2, barY, barW, s * 0.16, 5);
    c.fill();
    const col = ratio > 0.45 ? (team ? "#4f8aff" : "#ff6a3d") : "#ff5a3a";
    c.fillStyle = col;
    roundRect(c, -barW / 2, barY, barW * ratio, s * 0.16, 5);
    c.fill();
    c.fillStyle = "rgba(255,255,255,.35)";
    roundRect(c, -barW / 2, barY, barW * ratio, s * 0.06, 5);
    c.fill();
    c.restore();
  }

  function drawSeasonAura(c, s, type, t) {
    const season = UNIT_SEASON[type];
    if (!season || season !== state.season) return;
    c.save();
    if (season === "winter") {
      const g = c.createRadialGradient(0, -s * 0.2, s * 0.1, 0, 0, s * 1.15);
      g.addColorStop(0, "rgba(180,230,255,.35)");
      g.addColorStop(1, "rgba(180,230,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, -s * 0.15, s * 1.15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(200,240,255,.7)";
      c.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ang = t * 1.6 + i * (Math.PI / 3);
        const r = s * 0.85;
        c.beginPath();
        c.moveTo(Math.cos(ang) * r * 0.7, Math.sin(ang) * r * 0.7 - s * 0.1);
        c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r - s * 0.1);
        c.stroke();
      }
    } else if (season === "fall") {
      for (let i = 0; i < 5; i++) {
        const ang = t * 2 + i * 1.25;
        const r = s * (0.55 + 0.15 * Math.sin(t * 3 + i));
        c.fillStyle = "hsla(" + (18 + i * 10) + ",85%,55%,.75)";
        c.beginPath();
        c.ellipse(Math.cos(ang) * r, Math.sin(ang) * r * 0.7 - s * 0.15, s * 0.1, s * 0.06, ang, 0, Math.PI * 2);
        c.fill();
      }
    } else if (season === "spring") {
      for (let i = 0; i < 7; i++) {
        const ang = t * 2.4 + i * 0.9;
        const r = s * (0.5 + (i % 3) * 0.15);
        c.fillStyle = "rgba(255,180,210,.8)";
        c.beginPath();
        c.arc(Math.cos(ang) * r, Math.sin(ang) * r * 0.8 - s * 0.2, s * 0.07, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const ang = -t * 3 + i * 1.05;
        const r = s * (0.4 + (i % 2) * 0.2);
        const g = c.createRadialGradient(Math.cos(ang) * r, Math.sin(ang) * r * 0.5 - s * 0.3, 0, Math.cos(ang) * r, Math.sin(ang) * r * 0.5 - s * 0.3, s * 0.22);
        g.addColorStop(0, "rgba(255,230,120,.8)");
        g.addColorStop(1, "rgba(255,80,0,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(Math.cos(ang) * r, Math.sin(ang) * r * 0.5 - s * 0.3, s * 0.22, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  function drawKnight(c, s, flip, swing, bob) {
    const b = Math.sin((bob || 0) * 6) * s * 0.03;
    c.save();
    c.scale(flip, 1);
    c.translate(0, b);
    c.fillStyle = "rgba(30,50,20,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.62, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    // legs
    c.fillStyle = "#2c3a58";
    roundRect(c, -s * 0.22, s * 0.18, s * 0.16, s * 0.38, 5);
    c.fill();
    roundRect(c, s * 0.06, s * 0.18, s * 0.16, s * 0.38, 5);
    c.fill();
    c.fillStyle = "#3a2a18";
    roundRect(c, -s * 0.24, s * 0.48, s * 0.2, s * 0.12, 4);
    c.fill();
    roundRect(c, s * 0.04, s * 0.48, s * 0.2, s * 0.12, 4);
    c.fill();
    // body
    const body = c.createLinearGradient(-s * 0.3, -s * 0.2, s * 0.3, s * 0.3);
    body.addColorStop(0, "#7aa0ff");
    body.addColorStop(0.5, "#3d6eef");
    body.addColorStop(1, "#2a4ec0");
    c.fillStyle = body;
    roundRect(c, -s * 0.3, -s * 0.2, s * 0.6, s * 0.5, 8);
    c.fill();
    c.fillStyle = "rgba(255,255,255,.22)";
    roundRect(c, -s * 0.22, -s * 0.16, s * 0.18, s * 0.16, 4);
    c.fill();
    c.fillStyle = "#ffd24a";
    roundRect(c, -s * 0.3, s * 0.08, s * 0.6, s * 0.08, 3);
    c.fill();
    // shield
    c.fillStyle = "#dce6f8";
    c.beginPath();
    c.moveTo(-s * 0.55, -s * 0.05);
    c.lineTo(-s * 0.18, -s * 0.12);
    c.lineTo(-s * 0.18, s * 0.28);
    c.quadraticCurveTo(-s * 0.38, s * 0.42, -s * 0.55, s * 0.28);
    c.closePath();
    c.fill();
    c.strokeStyle = "#ffd24a";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#3d7cff";
    c.beginPath();
    c.arc(-s * 0.36, s * 0.08, s * 0.08, 0, Math.PI * 2);
    c.fill();
    // sword arm
    c.save();
    c.translate(s * 0.28, -s * 0.02);
    c.rotate(-0.4 - (swing || 0) * 1.1);
    c.fillStyle = "#f3c79a";
    roundRect(c, 0, -s * 0.07, s * 0.28, s * 0.14, 6);
    c.fill();
    c.fillStyle = "#ffd24a";
    roundRect(c, s * 0.22, -s * 0.1, s * 0.08, s * 0.2, 2);
    c.fill();
    c.fillStyle = "#d8e2f0";
    roundRect(c, s * 0.28, -s * 0.06, s * 0.55, s * 0.1, 3);
    c.fill();
    c.restore();
    // head + helmet
    c.fillStyle = "#f3c79a";
    c.beginPath();
    c.arc(0, -s * 0.38, s * 0.22, 0, Math.PI * 2);
    c.fill();
    const helm = c.createLinearGradient(-s * 0.22, -s * 0.7, s * 0.22, -s * 0.2);
    helm.addColorStop(0, "#c8d4e8");
    helm.addColorStop(1, "#5a6a80");
    c.fillStyle = helm;
    c.beginPath();
    c.arc(0, -s * 0.42, s * 0.24, Math.PI, 0);
    c.lineTo(s * 0.22, -s * 0.32);
    c.lineTo(-s * 0.22, -s * 0.32);
    c.closePath();
    c.fill();
    c.fillStyle = "#1a2230";
    roundRect(c, -s * 0.16, -s * 0.42, s * 0.32, s * 0.08, 3);
    c.fill();
    c.fillStyle = "#e23b3b";
    c.beginPath();
    c.moveTo(0, -s * 0.66);
    c.quadraticCurveTo(s * 0.16, -s * 0.85, 0, -s * 0.72);
    c.quadraticCurveTo(-s * 0.08, -s * 0.68, 0, -s * 0.66);
    c.fill();
    c.restore();
  }

  function drawArcher(c, s, flip, swing, bob) {
    const b = Math.sin((bob || 0) * 7) * s * 0.03;
    c.save();
    c.scale(flip, 1);
    c.translate(0, b);
    c.fillStyle = "rgba(30,50,20,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.6, s * 0.36, s * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a5a28";
    roundRect(c, -s * 0.18, s * 0.16, s * 0.14, s * 0.36, 5);
    c.fill();
    roundRect(c, s * 0.04, s * 0.16, s * 0.14, s * 0.36, 5);
    c.fill();
    const tunic = c.createLinearGradient(0, -s * 0.2, 0, s * 0.3);
    tunic.addColorStop(0, "#6ee08a");
    tunic.addColorStop(1, "#2e8a4a");
    c.fillStyle = tunic;
    roundRect(c, -s * 0.24, -s * 0.18, s * 0.48, s * 0.46, 8);
    c.fill();
    c.fillStyle = "#8a5a2b";
    roundRect(c, -s * 0.24, s * 0.06, s * 0.48, s * 0.07, 3);
    c.fill();
    // quiver
    c.fillStyle = "#6a3a18";
    roundRect(c, -s * 0.4, -s * 0.1, s * 0.14, s * 0.34, 4);
    c.fill();
    c.fillStyle = "#c47a3a";
    c.fillRect(-s * 0.38, -s * 0.18, 3, s * 0.14);
    c.fillRect(-s * 0.32, -s * 0.2, 3, s * 0.16);
    // bow
    c.save();
    c.translate(s * 0.22, 0);
    c.strokeStyle = "#8a5a2b";
    c.lineWidth = 4;
    c.lineCap = "round";
    c.beginPath();
    c.arc(0, 0, s * 0.38, -1.15, 1.15);
    c.stroke();
    c.strokeStyle = "#eadcc0";
    c.lineWidth = 1.5;
    const pull = 0.12 + (swing || 0) * 0.2;
    c.beginPath();
    c.moveTo(s * 0.05, -s * 0.36);
    c.lineTo(-s * pull, 0);
    c.lineTo(s * 0.05, s * 0.36);
    c.stroke();
    if (swing > 0.2) {
      c.fillStyle = "#c9a06a";
      c.fillRect(-s * 0.05, -s * 0.03, s * 0.42, s * 0.06);
    }
    c.restore();
    // head + cap
    c.fillStyle = "#f3c79a";
    c.beginPath();
    c.arc(0, -s * 0.36, s * 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2e8a4a";
    c.beginPath();
    c.arc(0, -s * 0.4, s * 0.22, Math.PI, 0);
    c.lineTo(s * 0.22, -s * 0.28);
    c.quadraticCurveTo(0, -s * 0.18, -s * 0.22, -s * 0.28);
    c.closePath();
    c.fill();
    c.fillStyle = "#1e5a30";
    c.beginPath();
    c.moveTo(s * 0.2, -s * 0.4);
    c.lineTo(s * 0.38, -s * 0.32);
    c.lineTo(s * 0.18, -s * 0.3);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawDragonBody(c, s, flip, swing, bob, big) {
    const flap = Math.sin((bob || 0) * 10) * (big ? 0.35 : 0.42);
    const b = Math.sin((bob || 0) * 5) * s * 0.04;
    c.save();
    c.scale(flip, 1);
    c.translate(0, b - (big ? s * 0.1 : 0));
    c.fillStyle = "rgba(30,50,20,.22)";
    c.beginPath();
    c.ellipse(0, s * (big ? 0.95 : 0.75), s * (big ? 0.7 : 0.5), s * 0.14, 0, 0, Math.PI * 2);
    c.fill();
    const main = big ? "#e85a4a" : "#8a6aff";
    const light = big ? "#ff8a6a" : "#b49bff";
    const belly = big ? "#ffd0a0" : "#e6d8ff";
    // wings
    for (const dir of [-1, 1]) {
      c.save();
      c.translate(dir * s * 0.05, -s * 0.1);
      c.rotate(dir * (0.15 + flap));
      c.fillStyle = light;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(dir * s * (big ? 1.1 : 0.85), -s * 0.7, dir * s * (big ? 0.3 : 0.2), s * 0.2);
      c.quadraticCurveTo(dir * s * 0.15, s * 0.05, 0, 0);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.35)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(dir * s * (big ? 0.85 : 0.6), -s * 0.4);
      c.stroke();
      c.restore();
    }
    // body
    const grd = c.createLinearGradient(-s * 0.4, -s * 0.3, s * 0.4, s * 0.4);
    grd.addColorStop(0, light);
    grd.addColorStop(1, main);
    c.fillStyle = grd;
    c.beginPath();
    c.ellipse(0, s * 0.08, s * (big ? 0.55 : 0.4), s * (big ? 0.42 : 0.32), 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = belly;
    c.beginPath();
    c.ellipse(0, s * 0.16, s * (big ? 0.32 : 0.22), s * (big ? 0.22 : 0.16), 0, 0, Math.PI * 2);
    c.fill();
    // head
    c.fillStyle = light;
    c.beginPath();
    c.ellipse(s * 0.38, -s * 0.12, s * (big ? 0.32 : 0.24), s * (big ? 0.26 : 0.2), -0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(s * 0.48, -s * 0.2, s * (big ? 0.08 : 0.06), 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a2418";
    c.beginPath();
    c.arc(s * 0.5, -s * 0.2, s * (big ? 0.04 : 0.03), 0, Math.PI * 2);
    c.fill();
    c.fillStyle = main;
    c.beginPath();
    c.moveTo(s * 0.2, -s * 0.28);
    c.lineTo(s * 0.28, -s * (big ? 0.62 : 0.48));
    c.lineTo(s * 0.4, -s * 0.28);
    c.closePath();
    c.fill();
    if (big) {
      c.fillStyle = "#ffd24a";
      c.beginPath();
      c.moveTo(s * 0.3, -s * 0.4);
      c.lineTo(s * 0.38, -s * 0.78);
      c.lineTo(s * 0.48, -s * 0.4);
      c.closePath();
      c.fill();
      // extra horns / spikes
      c.fillStyle = "#ffd24a";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(-s * 0.2 + i * s * 0.16, -s * 0.2);
        c.lineTo(-s * 0.12 + i * s * 0.16, -s * 0.48);
        c.lineTo(-s * 0.04 + i * s * 0.16, -s * 0.2);
        c.fill();
      }
    }
    // tail
    c.strokeStyle = main;
    c.lineWidth = s * (big ? 0.12 : 0.08);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-s * 0.4, s * 0.1);
    c.quadraticCurveTo(-s * 0.8, s * 0.05, -s * 0.9, -s * 0.2 + Math.sin((bob || 0) * 6) * s * 0.1);
    c.stroke();
    if (swing > 0.3) {
      const gx = c.createRadialGradient(s * 0.7, 0, 0, s * 0.7, 0, s * 0.55);
      gx.addColorStop(0, "rgba(255,240,160,.9)");
      gx.addColorStop(0.4, "rgba(255,140,40,.65)");
      gx.addColorStop(1, "rgba(255,80,0,0)");
      c.fillStyle = gx;
      c.beginPath();
      c.arc(s * 0.7, 0, s * 0.55, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawDragon(c, s, flip, swing, bob) {
    drawDragonBody(c, s, flip, swing, bob, false);
  }

  function drawBigDragon(c, s, flip, swing, bob) {
    drawDragonBody(c, s * 1.2, flip, swing, bob, true);
  }

  function drawCannon(c, s, flip, swing, bob) {
    const recoil = (swing || 0) * s * 0.12;
    c.save();
    c.scale(flip, 1);
    c.translate(-recoil, 0);
    c.fillStyle = "rgba(30,50,20,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.52, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    // wheels
    for (const wx of [-s * 0.28, s * 0.32]) {
      c.fillStyle = "#5a3a18";
      c.beginPath();
      c.arc(wx, s * 0.32, s * 0.22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#c49a62";
      c.beginPath();
      c.arc(wx, s * 0.32, s * 0.14, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#3a2410";
      c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + (bob || 0);
        c.beginPath();
        c.moveTo(wx, s * 0.32);
        c.lineTo(wx + Math.cos(ang) * s * 0.2, s * 0.32 + Math.sin(ang) * s * 0.2);
        c.stroke();
      }
    }
    // carriage
    c.fillStyle = "#a36a32";
    roundRect(c, -s * 0.4, s * 0.02, s * 0.75, s * 0.22, 5);
    c.fill();
    c.fillStyle = "rgba(255,220,160,.25)";
    roundRect(c, -s * 0.36, s * 0.04, s * 0.3, s * 0.08, 3);
    c.fill();
    // barrel
    const barrel = c.createLinearGradient(0, -s * 0.35, 0, s * 0.15);
    barrel.addColorStop(0, "#8a96a8");
    barrel.addColorStop(0.5, "#4a5568");
    barrel.addColorStop(1, "#2a3344");
    c.fillStyle = barrel;
    roundRect(c, -s * 0.12, -s * 0.42, s * 0.28, s * 0.6, 8);
    c.fill();
    c.fillStyle = "#1a1f28";
    c.beginPath();
    c.arc(s * 0.02, -s * 0.44, s * 0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c9d2e0";
    c.beginPath();
    c.arc(s * 0.02, -s * 0.44, s * 0.06, 0, Math.PI * 2);
    c.fill();
    if (swing > 0.4) {
      const gx = c.createRadialGradient(s * 0.02, -s * 0.6, 0, s * 0.02, -s * 0.6, s * 0.35);
      gx.addColorStop(0, "rgba(255,240,180,.9)");
      gx.addColorStop(1, "rgba(255,120,40,0)");
      c.fillStyle = gx;
      c.beginPath();
      c.arc(s * 0.02, -s * 0.65, s * 0.35, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawGuard(c, s0, flip, swing, bob, side) {
    const s = s0 * 0.82;
    const b = Math.sin((bob || 0) * 6) * s * 0.03;
    const team = side === "player";
    const coat = team ? "#3d7cff" : "#e23b3b";
    const coatDk = team ? "#244a9a" : "#9a2020";
    c.save();
    c.scale(flip, 1);
    c.translate(0, b);
    c.fillStyle = "rgba(30,50,20,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.58, s * 0.32, s * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = coatDk;
    roundRect(c, -s * 0.16, s * 0.14, s * 0.12, s * 0.32, 4);
    c.fill();
    roundRect(c, s * 0.04, s * 0.14, s * 0.12, s * 0.32, 4);
    c.fill();
    c.fillStyle = coat;
    roundRect(c, -s * 0.22, -s * 0.16, s * 0.44, s * 0.4, 7);
    c.fill();
    c.fillStyle = "rgba(255,255,255,.2)";
    roundRect(c, -s * 0.16, -s * 0.12, s * 0.14, s * 0.12, 3);
    c.fill();
    // spear
    c.save();
    c.translate(s * 0.22, -s * 0.05);
    c.rotate(-0.5 - (swing || 0) * 0.9);
    c.fillStyle = "#8a5a2b";
    roundRect(c, 0, -s * 0.05, s * 0.7, s * 0.08, 2);
    c.fill();
    c.fillStyle = "#d8e2f0";
    c.beginPath();
    c.moveTo(s * 0.68, -s * 0.12);
    c.lineTo(s * 0.92, 0);
    c.lineTo(s * 0.68, s * 0.12);
    c.closePath();
    c.fill();
    c.restore();
    c.fillStyle = "#f3c79a";
    c.beginPath();
    c.arc(0, -s * 0.32, s * 0.16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c8d4e8";
    c.beginPath();
    c.arc(0, -s * 0.36, s * 0.17, Math.PI, 0);
    c.fill();
    c.fillStyle = coat;
    c.fillRect(-s * 0.17, -s * 0.36, s * 0.34, s * 0.06);
    c.restore();
  }

  function drawUnit(c, u) {
    const w = unitWorldPos(u);
    const p = toPx(w.x, w.y);
    const s = unitScale();
    const flip = u.side === "player" ? 1 : -1;
    c.save();
    c.translate(p.x, p.y);
    if (u.hp <= 0) c.globalAlpha = Math.max(0, 1 - (u.deadT || 0) / 0.35);
    if (!u.guard) drawSeasonAura(c, s, u.type, state.t + (u.id || 0));
    if (u.type === "knight") drawKnight(c, s, flip, u.swing, u.bob);
    else if (u.type === "archer") drawArcher(c, s, flip, u.swing, u.bob);
    else if (u.type === "bigDragon") drawBigDragon(c, s, flip, u.swing, u.bob);
    else if (u.type === "cannon") drawCannon(c, s, flip, u.swing, u.bob);
    else if (u.type === "guard") drawGuard(c, s, flip, u.swing, u.bob, u.side);
    else drawDragon(c, s, flip, u.swing, u.bob);
    if (u.hitFlash > 0) {
      c.save();
      c.globalAlpha = 0.55 * u.hitFlash;
      c.fillStyle = "#fff";
      c.beginPath();
      c.ellipse(0, 0, s * 0.45, s * 0.6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    if (u.hp > 0 && u.hp < u.maxHp) {
      const bw = s * (u.type === "bigDragon" ? 1 : 0.8);
      const barY = u.type === "bigDragon" ? -s * 1.35 : u.type === "guard" ? -s * 0.95 : -s * 1.05;
      c.fillStyle = "rgba(0,0,0,.4)";
      roundRect(c, -bw / 2, barY, bw, s * 0.12, 4);
      c.fill();
      c.fillStyle = u.side === "player" ? "#4aa3ff" : "#ff6a3d";
      roundRect(c, -bw / 2, barY, bw * (u.hp / u.maxHp), s * 0.12, 4);
      c.fill();
      c.fillStyle = "rgba(255,255,255,.35)";
      roundRect(c, -bw / 2, barY, bw * (u.hp / u.maxHp), s * 0.05, 4);
      c.fill();
    }
    c.restore();
  }

  function drawLaneHints(c) {
    if (!state.selected || state.screen !== "play" || state.winner) return;
    const pulse = 0.35 + 0.2 * Math.sin(state.t * 6);
    for (let i = 0; i < 3; i++) {
      const a = toPx(LANE_X[i], 0.55);
      const b = toPx(LANE_X[i], 0.78);
      c.fillStyle = "rgba(255,210,74," + pulse + ")";
      c.beginPath();
      c.moveTo(a.x, a.y - unitScale() * 0.3);
      c.lineTo(a.x - unitScale() * 0.28, a.y + unitScale() * 0.15);
      c.lineTo(a.x + unitScale() * 0.28, a.y + unitScale() * 0.15);
      c.closePath();
      c.fill();
      c.globalAlpha = pulse + 0.2;
      c.strokeStyle = "rgba(255,210,74,.7)";
      c.lineWidth = unitScale() * 1.2;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  function drawFx(c) {
    for (const f of state.fx) {
      const p = toPx(f.x, f.y);
      const a = Math.max(0, f.life / (f.max || 0.35));
      const sc = unitScale();
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      if (f.kind === "shard") {
        c.rotate(f.rot || 0);
        c.fillStyle = "#c8f4ff";
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        const sz = sc * 0.22 * (f.size || 1);
        c.beginPath();
        c.moveTo(0, -sz);
        c.lineTo(sz * 0.7, 0);
        c.lineTo(0, sz);
        c.lineTo(-sz * 0.7, 0);
        c.closePath();
        c.fill();
        c.stroke();
      } else if (f.kind === "fire") {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, sc * 0.28);
        g.addColorStop(0, "#fff3a0");
        g.addColorStop(0.4, "#ff8a3a");
        g.addColorStop(1, "rgba(255,40,0,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, sc * 0.28 * (1.1 - a * 0.3), 0, Math.PI * 2);
        c.fill();
      } else if (f.kind === "smoke") {
        c.fillStyle = "rgba(80,80,80,.55)";
        c.beginPath();
        c.arc(0, 0, sc * 0.28 * (1.4 - a), 0, Math.PI * 2);
        c.fill();
      } else if (f.kind === "hit") {
        c.fillStyle = "#fff3a0";
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const r = 14 * (1 - a);
          c.beginPath();
          c.arc(Math.cos(ang) * r, Math.sin(ang) * r, 3.5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "rgba(180,160,120,.5)";
        c.beginPath();
        c.ellipse(0, sc * 0.1, sc * 0.25 * (1.2 - a), sc * 0.1, 0, 0, Math.PI * 2);
        c.fill();
      } else if (f.kind === "pop") {
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(0, 0, sc * 0.4 * (1.2 - a), 0, Math.PI * 2);
        c.fill();
      } else if (f.kind === "muzzle") {
        c.fillStyle = "#ffe27a";
        c.beginPath();
        c.arc(0, 0, sc * 0.38 * (1.15 - a), 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#ff8a3a";
        c.beginPath();
        c.arc(0, 0, sc * 0.18 * (1.15 - a), 0, Math.PI * 2);
        c.fill();
      } else if (f.kind === "spark") {
        c.fillStyle = "#c8f4ff";
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + state.t;
          c.beginPath();
          c.arc(Math.cos(ang) * 10 * (1 - a), Math.sin(ang) * 10 * (1 - a), 3, 0, Math.PI * 2);
          c.fill();
        }
      } else {
        c.fillStyle = "#ffe27a";
        c.beginPath();
        c.arc(0, 0, sc * 0.25 * (1.4 - a), 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  function drawFloaters(c) {
    const sc = unitScale();
    for (const f of state.floaters || []) {
      const p = toPx(f.x, f.y);
      const a = Math.max(0, f.life / (f.max || 0.7));
      c.save();
      c.globalAlpha = a;
      c.font = "bold " + Math.round(sc * 0.32) + "px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 3;
      c.strokeStyle = "rgba(30,20,10,.55)";
      c.fillStyle = "#fff8e0";
      c.strokeText(f.text, p.x, p.y);
      c.fillText(f.text, p.x, p.y);
      c.restore();
    }
  }

  function worldScale() {
    const a = toPx(0, 0);
    const b = toPx(1, 1);
    return { x: b.x - a.x, y: b.y - a.y };
  }

  function drawCastleRanges(c) {
    if (!state.settings) return;
    const sc = worldScale();
    for (const side of ["player", "ai"]) {
      const st = state.castles[side];
      if (!st || st.showRange <= 0) continue;
      const stats = side === "player" ? state.settings.playerCastle : state.settings.enemyCastle;
      const p = toPx(0.5, side === "player" ? PLAYER_CASTLE_Y : ENEMY_CASTLE_Y);
      const a = 0.16 * st.showRange;
      c.save();
      c.beginPath();
      c.ellipse(p.x, p.y, stats.range * sc.x, stats.range * sc.y, 0, 0, Math.PI * 2);
      c.fillStyle = side === "player" ? "rgba(61,124,255," + a + ")" : "rgba(255,106,61," + a + ")";
      c.fill();
      c.strokeStyle = side === "player" ? "rgba(61,124,255," + (a * 2) + ")" : "rgba(255,106,61," + (a * 2) + ")";
      c.lineWidth = 2;
      c.setLineDash([8, 8]);
      c.stroke();
      c.restore();
    }
  }

  function shotVisual(s) {
    const remain = Math.hypot(s.tx - s.x, s.ty - s.y);
    const total = Math.max(s.travel || remain, 0.001);
    const prog = Math.max(0, Math.min(1, 1 - remain / total));
    return { x: s.x, y: s.y - Math.sin(prog * Math.PI) * (s.arc || 0), prog };
  }

  function drawShots(c) {
    const sc = unitScale();
    for (const s of state.shots) {
      const v = shotVisual(s);
      const p = toPx(v.x, v.y);
      const glow = s.fromCastle
        ? (s.side === "player" ? "#7eb0ff" : "#ffb08a")
        : "#c9a06a";
      // trail along the arc
      c.save();
      for (let i = 1; i <= 6; i++) {
        const t = Math.max(0, v.prog - i * 0.05);
        const remain = (1 - t) * Math.max(s.travel || 0.001, 0.001);
        const ang = Math.atan2(s.ty - (s.y || 0), s.tx - (s.x || 0));
        const ox = s.x + Math.cos(ang) * (s.travel - remain);
        const oy = s.y + Math.sin(ang) * (s.travel - remain) - Math.sin(t * Math.PI) * (s.arc || 0);
        const q = toPx(ox, oy);
        c.globalAlpha = 0.12 * (7 - i);
        c.fillStyle = glow;
        c.beginPath();
        c.arc(q.x, q.y, sc * 0.12, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      c.save();
      c.translate(p.x, p.y);
      c.fillStyle = glow;
      c.globalAlpha = 0.55;
      c.beginPath();
      c.arc(0, 0, sc * 0.22, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = "#2a1c14";
      c.beginPath();
      c.arc(0, 0, sc * 0.16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#d8c2a0";
      c.beginPath();
      c.arc(-sc * 0.05, -sc * 0.05, sc * 0.06, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  function drawDiamond(c, x, y, w, h) {
    c.beginPath();
    c.moveTo(x, y - h / 2);
    c.lineTo(x + w / 2, y);
    c.lineTo(x, y + h / 2);
    c.lineTo(x - w / 2, y);
    c.closePath();
  }

  function drawFences(c) {
    const s = unitScale();
    for (const f of state.fences) {
      const p = toPx(f.x, f.y);
      const w = s * 1.55;
      const h = s * 0.85;
      const broken = f.hp <= 0;
      const ratio = f.maxHp ? f.hp / f.maxHp : 0;
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(state.t * 4 + f.lane * 1.7 + (f.side === "player" ? 0 : 2)));
      c.save();
      c.translate(p.x, p.y);
      c.fillStyle = "rgba(40,80,30,.2)";
      c.beginPath();
      c.ellipse(0, h * 0.45, w * 0.55, s * 0.1, 0, 0, Math.PI * 2);
      c.fill();
      if (broken) {
        c.globalAlpha = 0.55;
        // broken crystal stumps
        for (const dir of [-1, 1]) {
          c.fillStyle = "#8ec8e0";
          drawDiamond(c, dir * w * 0.42, s * 0.05, s * 0.2, s * 0.35);
          c.fill();
        }
        c.fillStyle = "rgba(200,240,255,.35)";
        drawDiamond(c, 0, s * 0.12, s * 0.28, s * 0.18);
        c.fill();
        c.restore();
        continue;
      }
      // glow
      const glow = c.createRadialGradient(0, 0, s * 0.1, 0, 0, w * 0.7);
      glow.addColorStop(0, "rgba(180,240,255," + (0.18 * twinkle) + ")");
      glow.addColorStop(1, "rgba(180,240,255,0)");
      c.fillStyle = glow;
      c.beginPath();
      c.arc(0, 0, w * 0.7, 0, Math.PI * 2);
      c.fill();
      // posts
      for (const dir of [-1, 1]) {
        const px = dir * (w / 2 - s * 0.06);
        const pg = c.createLinearGradient(px, -h * 0.7, px, h * 0.35);
        pg.addColorStop(0, "#f4ffff");
        pg.addColorStop(0.4, "#b8f0ff");
        pg.addColorStop(1, "#7ab8d8");
        c.fillStyle = pg;
        drawDiamond(c, px, -h * 0.1, s * 0.22, h * 1.15);
        c.fill();
        c.strokeStyle = "rgba(255,255,255,.7)";
        c.lineWidth = 1.2;
        c.stroke();
      }
      // faceted panels
      for (let i = 0; i < 3; i++) {
        const px = -w * 0.28 + i * (w * 0.28);
        const pg = c.createLinearGradient(px - s * 0.2, -h * 0.5, px + s * 0.2, h * 0.3);
        pg.addColorStop(0, "rgba(255,255,255,.72)");
        pg.addColorStop(0.35, "rgba(190,240,255,.62)");
        pg.addColorStop(0.7, "rgba(120,200,230,.5)");
        pg.addColorStop(1, "rgba(80,160,210,.4)");
        c.fillStyle = pg;
        drawDiamond(c, px, -h * 0.08, s * 0.42, h * 0.85);
        c.fill();
        c.strokeStyle = "rgba(255,255,255,.75)";
        c.lineWidth = 1.2;
        c.stroke();
        // facet lines
        c.strokeStyle = "rgba(255,255,255,.35)";
        c.beginPath();
        c.moveTo(px, -h * 0.5);
        c.lineTo(px - s * 0.08, -h * 0.08);
        c.lineTo(px, h * 0.34);
        c.stroke();
      }
      // twinkle glints
      c.fillStyle = "rgba(255,255,255," + twinkle + ")";
      c.beginPath();
      c.arc(-w * 0.18, -h * 0.28, 2.2, 0, Math.PI * 2);
      c.arc(w * 0.12, -h * 0.05, 1.8, 0, Math.PI * 2);
      c.arc(w * 0.3, -h * 0.32, 2.4 * twinkle, 0, Math.PI * 2);
      c.fill();
      // fracture lines grow with damage
      if (ratio < 0.99) {
        c.strokeStyle = "rgba(40,80,110," + (0.55 + (1 - ratio) * 0.4) + ")";
        c.lineWidth = 1.6;
        c.beginPath();
        if (ratio < 0.85) {
          c.moveTo(-w * 0.22, -h * 0.28);
          c.lineTo(-w * 0.05, -h * 0.02);
          c.lineTo(-w * 0.18, h * 0.22);
        }
        if (ratio < 0.55) {
          c.moveTo(w * 0.08, -h * 0.32);
          c.lineTo(w * 0.2, -h * 0.02);
          c.lineTo(w * 0.06, h * 0.24);
          c.moveTo(-w * 0.02, -h * 0.35);
          c.lineTo(w * 0.1, h * 0.1);
        }
        if (ratio < 0.3) {
          c.moveTo(-w * 0.3, -h * 0.1);
          c.lineTo(w * 0.28, h * 0.05);
          c.moveTo(w * 0.22, -h * 0.35);
          c.lineTo(w * 0.05, h * 0.3);
        }
        c.stroke();
        const bw = w * 0.7;
        const barY = -h * 0.95;
        c.fillStyle = "rgba(0,0,0,.35)";
        roundRect(c, -bw / 2, barY, bw, s * 0.1, 3);
        c.fill();
        c.fillStyle = ratio > 0.45 ? "#7ec8ff" : "#ff6a3d";
        roundRect(c, -bw / 2, barY, bw * ratio, s * 0.1, 3);
        c.fill();
      }
      c.restore();
    }
  }

  function render() {
    if (state.screen !== "play") return;
    resize();
    const c = ctx;
    const cw = els.canvas.width;
    const ch = els.canvas.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (state.shake > 0) {
      c.translate((Math.random() - 0.5) * state.shake * 2, (Math.random() - 0.5) * state.shake * 2);
    }
    c.fillStyle = "#5ec86a";
    c.fillRect(0, 0, cw, ch);
    c.save();
    drawSkyGrass(c, cw, ch);
    drawPaths(c);
    drawCreek(c);
    drawSeasonMood(c, cw, ch);
    drawCastle(c, "ai");
    drawCastle(c, "player");
    drawFences(c);
    drawCastleRanges(c);
    drawLaneHints(c);
    const list = state.units.slice().sort((a, b) => a.y - b.y || (a.flying ? 1 : 0) - (b.flying ? 1 : 0));
    for (const u of list) drawUnit(c, u);
    drawAmbient(c);
    drawShots(c);
    drawFx(c);
    drawFloaters(c);
    if (tex.vignette) c.drawImage(tex.vignette, 0, 0, cw, ch);
    c.restore();
  }

  function startConfetti() {
    const bits = [];
    const colors = ["#ffd24a", "#ff6a3d", "#4f8aff", "#7c5cff", "#3cbf6a", "#fff", "#ff8ad8"];
    for (let i = 0; i < 90; i++) {
      bits.push({
        x: Math.random(),
        y: -0.15 - Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.28,
        vy: 0.18 + Math.random() * 0.38,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 8,
        w: 6 + Math.random() * 8,
        h: 8 + Math.random() * 10,
        color: colors[i % colors.length],
      });
    }
    state.confettiBits = bits;
  }

  function stepConfetti(dt) {
    for (const b of state.confettiBits || []) {
      b.vy += dt * 0.35;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      if (b.y > 1.15) {
        b.y = -0.08;
        b.vy = 0.18 + Math.random() * 0.3;
        b.x = Math.random();
      }
    }
  }

  function drawConfetti() {
    const canvas = els.confetti;
    if (!canvas || state.screen !== "end") return;
    const parent = canvas.parentElement || document.body;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(parent.clientWidth * dpr));
    const h = Math.max(1, Math.floor(parent.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const c = canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    for (const b of state.confettiBits || []) {
      c.save();
      c.translate(b.x * w, b.y * h);
      c.rotate(b.rot);
      c.fillStyle = b.color;
      c.fillRect(-b.w * dpr * 0.4, -b.h * dpr * 0.4, b.w * dpr * 0.8, b.h * dpr * 0.8);
      c.restore();
    }
  }

  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    let raw = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    if (raw > 0 && raw < 2) {
      state.fpsTime += raw;
      state.fpsFrames += 1;
      if (state.fpsTime >= 0.8) {
        state.fps = state.fpsFrames / state.fpsTime;
        state.fpsFrames = 0;
        state.fpsTime = 0;
      }
    }
    let dt = raw;
    if (dt > 0.08) dt = 0.08;
    state.acc += dt;
    while (state.acc >= STEP) {
      if (state.screen === "play" && !state.winner) simulate(STEP);
      if (state.screen === "end") stepConfetti(STEP);
      state.acc -= STEP;
    }
    render();
    if (state.screen === "end") drawConfetti();
    requestAnimationFrame(loop);
  }

  /* ---------- input ---------- */

  function selectUnit(id) {
    if (state.screen !== "play" || state.winner) return;
    const typ = UNIT_TYPES[id];
    if (!typ) return;
    if (state.energy < typ.cost) {
      beep(180, 0.08, "square", 0.04);
      return;
    }
    state.selected = state.selected === id ? id : id;
    state.selected = id;
    updateUnitButtons();
    speak(typ.say);
    beep(620, 0.06, "sine", 0.04);
  }

  function pointerToLane(e) {
    const r = els.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (y < 0 || y > 1 || x < 0 || x > 1) return null;
    if (x < 1 / 3) return 0;
    if (x < 2 / 3) return 1;
    return 2;
  }

  function onArenaPointer(e) {
    if (state.screen !== "play" || state.winner) return;
    if (!state.selected) return;
    const lane = pointerToLane(e);
    if (lane == null) return;
    if (deploy("player", state.selected, lane)) {
      // keep selection so a kid can send several in a row
    } else {
      beep(180, 0.08, "square", 0.04);
    }
  }

  function warmupAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (_) {}
    if (window.speechSynthesis && state.voiceOn) {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
        speechSynthesis.cancel();
      } catch (_) {}
    }
  }

  /* ---------- wiring ---------- */

  $("#btn-easy").addEventListener("click", () => {
    warmupAudio();
    startMatch("easy");
  });
  $("#btn-hard").addEventListener("click", () => {
    warmupAudio();
    startMatch("hard");
  });
  $("#btn-again").addEventListener("click", () => {
    warmupAudio();
    startMatch(state.difficulty || "easy");
  });
  $("#btn-home").addEventListener("click", () => {
    showScreen("home");
  });
  els.mute.addEventListener("click", () => {
    state.voiceOn = !state.voiceOn;
    els.mute.classList.toggle("muted", !state.voiceOn);
    els.mute.textContent = state.voiceOn ? "🔊" : "🔇";
    els.mute.setAttribute("aria-label", state.voiceOn ? "קול פועל" : "קול כבוי");
    if (!state.voiceOn && window.speechSynthesis) speechSynthesis.cancel();
    else warmupAudio();
  });

  els.unitBtns.forEach((btn) => {
    btn.addEventListener("click", () => selectUnit(btn.getAttribute("data-unit")));
  });

  els.canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onArenaPointer(e);
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  window.addEventListener("keydown", (e) => {
    if (state.screen !== "play") return;
    if (e.key === "1") selectUnit("knight");
    else if (e.key === "2") selectUnit("archer");
    else if (e.key === "3") selectUnit("dragon");
    else if (e.key === "4") selectUnit("bigDragon");
    else if (e.key === "5") selectUnit("cannon");
    else if (e.key === "q" || e.key === "a" || e.key === "ArrowLeft") {
      if (state.selected) deploy("player", state.selected, 0);
    } else if (e.key === "w" || e.key === "s" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (state.selected) deploy("player", state.selected, 1);
    } else if (e.key === "e" || e.key === "d" || e.key === "ArrowRight") {
      if (state.selected) deploy("player", state.selected, 2);
    }
  });

  // Build energy pips once
  updateHud();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  /* ---------- test hooks ---------- */
  function getState() {
    return {
      screen: state.screen,
      difficulty: state.difficulty,
      selected: state.selected,
      energy: state.energy,
      timeLeft: state.timeLeft,
      playerHp: state.playerHp,
      enemyHp: state.enemyHp,
      playerMax: state.playerMax,
      enemyMax: state.enemyMax,
      units: state.units.map((u) => ({
        id: u.id,
        type: u.type,
        side: u.side,
        lane: u.lane,
        y: u.y,
        x: u.wx != null ? u.wx : LANE_X[u.lane] + (u.xJitter || 0),
        hp: u.hp,
        maxHp: u.maxHp,
        guard: !!u.guard,
        swing: u.swing || 0,
      })),
      guardTimers: { ...state.guardTimers },
      fences: state.fences.map((f) => ({
        id: f.id,
        side: f.side,
        lane: f.lane,
        x: f.x,
        y: f.y,
        hp: f.hp,
        maxHp: f.maxHp,
        rebuild: f.rebuild,
      })),
      winner: state.winner,
      stars: state.stars,
      aiEnergy: state.ai.energy,
      shots: state.shots.map((s) => ({
        x: s.x,
        y: s.y,
        side: s.side,
        fromCastle: !!s.fromCastle,
        kind: s.kind,
      })),
      castle: {
        player: { ...(state.settings && state.settings.playerCastle), cd: state.castles.player.cd, showRange: state.castles.player.showRange },
        ai: { ...(state.settings && state.settings.enemyCastle), cd: state.castles.ai.cd, showRange: state.castles.ai.showRange },
      },
      season: state.season,
      seasonLeft: state.seasonLeft,
      fps: state.fps,
    };
  }

  function tick(seconds) {
    const n = Math.max(0, Number(seconds) || 0);
    const steps = Math.ceil(n / STEP);
    for (let i = 0; i < steps; i++) {
      if (state.winner) break;
      simulate(STEP);
    }
    render();
    updateHud();
    return getState();
  }

  window.__arena = {
    getState,
    start: startMatch,
    select: selectUnit,
    deploy: (type, lane) => deploy("player", type, lane),
    deployAi: (type, lane) => deploy("ai", type, lane),
    setEnergy: (n) => {
      state.energy = Math.max(0, Math.min(MAX_ENERGY, n));
      updateUnitButtons();
      updateHud();
    },
    setHp: (side, hp) => {
      if (side === "player" || side === "ai") {
        if (side === "player") state.playerHp = Math.max(0, hp);
        else state.enemyHp = Math.max(0, hp);
        if (state.enemyHp <= 0) endMatch("player");
        else if (state.playerHp <= 0) endMatch("ai");
        updateHud();
      }
    },
    setTime: (s) => {
      state.timeLeft = Math.max(0, s);
      updateHud();
    },
    tick,
    types: UNIT_TYPES,
    calcDamage,
    setSeason: (id) => {
      if (!SEASON_ORDER.includes(id)) return;
      state.season = id;
      state.seasonLeft = SEASON_SECS;
      state.ambient = [];
      if (els.seasonBanner) els.seasonBanner.classList.remove("show");
      updateHud();
    },
    setSeasonLeft: (n) => {
      state.seasonLeft = Math.max(0, Number(n) || 0);
      updateHud();
    },
    place: (type, lane, y, side) => {
      const who = side || "player";
      const ok = deploy(who, type, lane);
      if (ok && typeof y === "number") {
        const u = state.units[state.units.length - 1];
        u.y = y;
      }
      return ok;
    },
  };
})();
