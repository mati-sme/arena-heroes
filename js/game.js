/* גיבורי הזירה — original cartoon arena game. Kid-safe, no external assets. */
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
    state.t = 0;
    state.winner = null;
    state.stars = 0;
    state.nextId = 1;
    state.acc = 0;
    state.ai = { wait: d.aiFirst, think: 0, energy: 5 };
    state.shake = 0;
    state.lastLane = 1;
    state.settings = d;
    updateUnitButtons();
    updateHud();
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

  function findTarget(u) {
    let best = null;
    let bestD = 1e9;
    for (const o of state.units) {
      if (o.side === u.side || o.hp <= 0) continue;
      if (!u.splash && o.lane !== u.lane) continue;
      const d = dist(u, o);
      const aggro = u.range + (u.splash || 0) + 0.04;
      if (d < aggro && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (best) return best;
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
      state.shake = Math.min(8, state.shake + 3);
    }
    spawnFx(LANE_X[from.lane] || 0.5, side === "ai" ? ENEMY_CASTLE_Y : PLAYER_CASTLE_Y, "spark");
    if (state.enemyHp <= 0) endMatch("player");
    else if (state.playerHp <= 0) endMatch("ai");
  }

  function attack(u, target) {
    if (target.kind === "castle") {
      hitCastle(target.side, u.dmg, u);
      return;
    }
    target.hp -= u.dmg;
    spawnFx(LANE_X[target.lane], target.y, "hit");
    if (u.splash) {
      for (const o of state.units) {
        if (o === target || o.side === u.side || o.hp <= 0) continue;
        if (dist(target, o) <= u.splash) o.hp -= Math.round(u.dmg * 0.5);
      }
    }
  }

  function simulate(dt) {
    if (state.screen !== "play" || state.winner) return;
    const d = state.settings;
    state.t += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    state.energy = Math.min(MAX_ENERGY, state.energy + d.playerRegen * dt);
    state.ai.energy = Math.min(MAX_ENERGY, (state.ai.energy || 0) + d.enemyRegen * dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 14);

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
      u.bob += dt;
      const target = findTarget(u);
      const inRange = target && (target.kind === "castle" ? Math.abs(u.y - target.y) <= CASTLE_RANGE + u.range * 0.15 : dist(u, target) <= u.range + (target.kind === "castle" ? 0 : 0));
      if (target && (target.kind === "castle" ? Math.abs(u.y - target.y) <= CASTLE_RANGE : dist(u, target) <= u.range)) {
        u.atkCd -= dt;
        if (u.atkCd <= 0) {
          attack(u, target);
          u.atkCd = u.atk;
          u.swing = 1;
        }
      } else {
        const dir = u.side === "player" ? -1 : 1;
        const cap = u.side === "player" ? ENEMY_CASTLE_Y : PLAYER_CASTLE_Y;
        u.y += dir * u.speed * d.speedMul * dt;
        if (dir < 0) u.y = Math.max(cap, u.y);
        else u.y = Math.min(cap, u.y);
      }
      if (u.swing > 0) u.swing = Math.max(0, u.swing - dt * 4);
    }

    for (const u of state.units) {
      if (u.hp <= 0 && !u.popped) {
        u.popped = true;
        spawnFx(LANE_X[u.lane], u.y, "pop");
        beep(u.side === "player" ? 240 : 360, 0.08, "square", 0.03);
      }
    }
    state.units = state.units.filter((u) => !(u.hp <= 0 && (u.deadT || 0) > 0.35));
    state.fx = state.fx.filter((f) => {
      f.life -= dt;
      f.y -= dt * 0.08;
      return f.life > 0;
    });

    stepAi(dt);
    updateHud();
  }

  function spawnFx(x, y, kind) {
    state.fx.push({ x, y, kind, life: 0.35, max: 0.35 });
  }

  function canDeploy(side, typeId) {
    const typ = UNIT_TYPES[typeId];
    if (!typ) return false;
    if (state.units.length >= MAX_UNITS) return false;
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
      const threats = state.units.filter((u) => u.side === "player" && u.hp > 0);
      const kinds = threats.reduce((m, u) => ((m[u.type] = (m[u.type] || 0) + 1), m), {});
      if ((kinds.knight || 0) >= (kinds.archer || 0) && (kinds.knight || 0) >= (kinds.dragon || 0) && ai.energy >= UNIT_TYPES.dragon.cost) typ = UNIT_TYPES.dragon;
      else if ((kinds.dragon || 0) > 0 && ai.energy >= UNIT_TYPES.archer.cost) typ = UNIT_TYPES.archer;
      else if ((kinds.archer || 0) > 0 && ai.energy >= UNIT_TYPES.knight.cost) typ = UNIT_TYPES.knight;
    }
    if (!typ) {
      const weights = affordable.map((t) => (t.id === "archer" ? 3 : t.id === "knight" ? 2 : 1));
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
    updateUnitButtons();
  }

  function updateUnitButtons() {
    els.unitBtns.forEach((btn) => {
      const id = btn.getAttribute("data-unit");
      const typ = UNIT_TYPES[id];
      btn.classList.toggle("selected", state.selected === id && state.screen === "play");
      btn.classList.toggle("disabled", !!(typ && state.screen === "play" && state.energy < typ.cost));
    });
  }

  /* ---------- render ---------- */

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

  function drawSkyGrass(c, cw, ch) {
    const g = c.createLinearGradient(0, 0, 0, ch * 0.22);
    g.addColorStop(0, "#7ec8ff");
    g.addColorStop(1, "#c8e8ff");
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch * 0.22);
    c.fillStyle = "#6ed36a";
    c.fillRect(0, ch * 0.18, cw, ch);
    c.fillStyle = "#5fc25c";
    for (let i = 0; i < 18; i++) {
      const x = ((i * 97) % cw);
      const y = ch * 0.22 + ((i * 53) % (ch * 0.7));
      c.beginPath();
      c.ellipse(x, y, cw * 0.08, ch * 0.03, 0, 0, Math.PI * 2);
      c.fill();
    }
    // clouds
    c.fillStyle = "rgba(255,255,255,.85)";
    drawCloud(c, cw * 0.18, ch * 0.07, cw * 0.08);
    drawCloud(c, cw * 0.7, ch * 0.05, cw * 0.1);
    drawCloud(c, cw * 0.45, ch * 0.1, cw * 0.06);
  }

  function drawCloud(c, x, y, s) {
    c.beginPath();
    c.arc(x - s * 0.6, y, s * 0.55, 0, Math.PI * 2);
    c.arc(x, y - s * 0.25, s * 0.7, 0, Math.PI * 2);
    c.arc(x + s * 0.65, y, s * 0.55, 0, Math.PI * 2);
    c.fill();
  }

  function drawPaths(c) {
    for (let i = 0; i < 3; i++) {
      const a = toPx(LANE_X[i], 0.16);
      const b = toPx(LANE_X[i], 0.84);
      const w = unitScale() * 1.35;
      c.strokeStyle = "#e8d4a0";
      c.lineWidth = w;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.strokeStyle = "#d2bc82";
      c.lineWidth = w * 0.15;
      c.beginPath();
      c.moveTo(a.x - w * 0.4, a.y);
      c.lineTo(b.x - w * 0.4, b.y);
      c.stroke();
      c.beginPath();
      c.moveTo(a.x + w * 0.4, a.y);
      c.lineTo(b.x + w * 0.4, b.y);
      c.stroke();
    }
  }

  function drawCastle(c, side) {
    const y = side === "player" ? PLAYER_CASTLE_Y : ENEMY_CASTLE_Y;
    const p = toPx(0.5, y);
    const s = unitScale() * 2.4;
    const roof = side === "player" ? "#3d7cff" : "#ff6a3d";
    const roofDark = side === "player" ? "#2a5fd0" : "#d44a20";
    c.save();
    c.translate(p.x, p.y);
    // shadow
    c.fillStyle = "rgba(40,80,30,.25)";
    c.beginPath();
    c.ellipse(0, s * 0.55, s * 0.7, s * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    // body
    c.fillStyle = "#efe4cf";
    roundRect(c, -s * 0.7, -s * 0.15, s * 1.4, s * 0.7, s * 0.08);
    c.fill();
    c.fillStyle = "#e0d2b4";
    roundRect(c, -s * 0.95, -s * 0.05, s * 0.3, s * 0.6, s * 0.06);
    c.fill();
    roundRect(c, s * 0.65, -s * 0.05, s * 0.3, s * 0.6, s * 0.06);
    c.fill();
    // door
    c.fillStyle = "#8a5a2b";
    roundRect(c, -s * 0.16, s * 0.18, s * 0.32, s * 0.36, s * 0.08);
    c.fill();
    // windows
    c.fillStyle = "#7ec8ff";
    c.fillRect(-s * 0.48, s * 0.08, s * 0.16, s * 0.16);
    c.fillRect(s * 0.32, s * 0.08, s * 0.16, s * 0.16);
    // roof
    c.fillStyle = roof;
    c.beginPath();
    c.moveTo(-s * 0.85, -s * 0.12);
    c.lineTo(0, -s * 0.7);
    c.lineTo(s * 0.85, -s * 0.12);
    c.closePath();
    c.fill();
    c.fillStyle = roofDark;
    c.beginPath();
    c.moveTo(0, -s * 0.7);
    c.lineTo(s * 0.85, -s * 0.12);
    c.lineTo(s * 0.2, -s * 0.12);
    c.closePath();
    c.fill();
    // flag
    const wave = Math.sin(state.t * 4) * s * 0.06;
    c.strokeStyle = "#5a4630";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -s * 0.7);
    c.lineTo(0, -s * 1.05);
    c.stroke();
    c.fillStyle = roof;
    c.beginPath();
    c.moveTo(0, -s * 1.05);
    c.lineTo(s * 0.32 + wave, -s * 0.96);
    c.lineTo(0, -s * 0.86);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawKnight(c, s, flip, swing, bob) {
    c.save();
    c.scale(flip, 1);
    c.translate(0, Math.sin(bob * 8) * s * 0.04);
    const arm = Math.sin(swing * Math.PI) * 0.6;
    // shadow
    c.fillStyle = "rgba(40,80,30,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.72, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    // legs
    c.fillStyle = "#3d6ef0";
    roundRect(c, -s * 0.22, s * 0.28, s * 0.18, s * 0.38, 6);
    c.fill();
    roundRect(c, s * 0.04, s * 0.28, s * 0.18, s * 0.38, 6);
    c.fill();
    // body
    c.fillStyle = "#5b8cff";
    roundRect(c, -s * 0.32, -s * 0.05, s * 0.64, s * 0.48, 10);
    c.fill();
    c.fillStyle = "#3d6ef0";
    roundRect(c, -s * 0.32, -s * 0.05, s * 0.64, s * 0.16, 8);
    c.fill();
    // shield
    c.fillStyle = "#dce6f8";
    c.beginPath();
    c.ellipse(-s * 0.42, s * 0.16, s * 0.2, s * 0.26, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffd24a";
    c.lineWidth = 3;
    c.stroke();
    // sword
    c.save();
    c.translate(s * 0.34, s * 0.05);
    c.rotate(-0.4 - arm);
    c.fillStyle = "#ffd24a";
    roundRect(c, -s * 0.06, -s * 0.08, s * 0.12, s * 0.2, 3);
    c.fill();
    c.fillStyle = "#e8eef8";
    roundRect(c, -s * 0.05, -s * 0.62, s * 0.1, s * 0.58, 3);
    c.fill();
    c.restore();
    // head
    c.fillStyle = "#f8d7b0";
    c.beginPath();
    c.arc(0, -s * 0.22, s * 0.26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8a9bb0";
    c.beginPath();
    c.arc(0, -s * 0.28, s * 0.28, Math.PI, 0);
    c.fill();
    c.fillStyle = "#2c3548";
    roundRect(c, -s * 0.16, -s * 0.28, s * 0.32, s * 0.1, 3);
    c.fill();
    c.fillStyle = "#e05050";
    c.beginPath();
    c.moveTo(s * 0.06, -s * 0.54);
    c.quadraticCurveTo(s * 0.28, -s * 0.72, s * 0.1, -s * 0.4);
    c.fill();
    c.restore();
  }

  function drawArcher(c, s, flip, swing, bob) {
    c.save();
    c.scale(flip, 1);
    c.translate(0, Math.sin(bob * 9) * s * 0.04);
    c.fillStyle = "rgba(40,80,30,.28)";
    c.beginPath();
    c.ellipse(0, s * 0.72, s * 0.38, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2e8a4a";
    roundRect(c, -s * 0.18, s * 0.3, s * 0.14, s * 0.36, 6);
    c.fill();
    roundRect(c, s * 0.04, s * 0.3, s * 0.14, s * 0.36, 6);
    c.fill();
    c.fillStyle = "#3cbf6a";
    roundRect(c, -s * 0.26, 0, s * 0.52, s * 0.42, 10);
    c.fill();
    // bow
    c.strokeStyle = "#8a5a2b";
    c.lineWidth = 5;
    c.beginPath();
    c.arc(s * 0.38, s * 0.1, s * 0.42, -1.1, 1.1);
    c.stroke();
    c.strokeStyle = "#e8d8a8";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(s * 0.2, s * 0.1 - s * 0.4);
    c.lineTo(s * 0.2 + swing * s * 0.2, s * 0.1);
    c.lineTo(s * 0.2, s * 0.1 + s * 0.4);
    c.stroke();
    // head
    c.fillStyle = "#f3c79a";
    c.beginPath();
    c.arc(0, -s * 0.2, s * 0.24, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2e8a4a";
    c.beginPath();
    c.ellipse(0, -s * 0.28, s * 0.26, s * 0.22, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = "#2a2418";
    c.beginPath();
    c.arc(-s * 0.08, -s * 0.2, s * 0.04, 0, Math.PI * 2);
    c.arc(s * 0.08, -s * 0.2, s * 0.04, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#c86a5a";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, -s * 0.1, s * 0.08, 0.2, Math.PI - 0.2);
    c.stroke();
    c.restore();
  }

  function drawDragon(c, s, flip, swing, bob) {
    c.save();
    c.scale(flip, 1);
    const flap = Math.sin(bob * 10) * 0.35;
    c.translate(0, Math.sin(bob * 6) * s * 0.08 - s * 0.15);
    c.fillStyle = "rgba(40,80,30,.22)";
    c.beginPath();
    c.ellipse(0, s * 0.85, s * 0.4, s * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    // wings
    c.fillStyle = "#7b5cff";
    c.save();
    c.rotate(-0.3 - flap);
    c.beginPath();
    c.ellipse(-s * 0.45, -s * 0.1, s * 0.42, s * 0.22, -0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = "#9a7dff";
    c.save();
    c.rotate(0.3 + flap);
    c.beginPath();
    c.ellipse(s * 0.45, -s * 0.1, s * 0.42, s * 0.22, 0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // body
    c.fillStyle = "#8a6aff";
    c.beginPath();
    c.ellipse(0, s * 0.12, s * 0.38, s * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    // tail
    c.strokeStyle = "#6c4ee0";
    c.lineWidth = s * 0.12;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-s * 0.3, s * 0.2);
    c.quadraticCurveTo(-s * 0.7, s * 0.4, -s * 0.5, s * 0.55);
    c.stroke();
    // head
    c.fillStyle = "#9d80ff";
    c.beginPath();
    c.arc(s * 0.22, -s * 0.12, s * 0.26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(s * 0.3, -s * 0.18, s * 0.08, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a2418";
    c.beginPath();
    c.arc(s * 0.32, -s * 0.18, s * 0.04, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ff9ec8";
    c.beginPath();
    c.ellipse(s * 0.44, -s * 0.04, s * 0.12, s * 0.08, 0.2, 0, Math.PI * 2);
    c.fill();
    if (swing > 0.3) {
      c.fillStyle = "rgba(255,180,60,.85)";
      c.beginPath();
      c.ellipse(s * 0.7, 0, s * 0.22 * swing, s * 0.12, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawUnit(c, u) {
    const p = toPx(LANE_X[u.lane] + u.xJitter, u.y);
    const s = unitScale();
    const flip = u.side === "player" ? 1 : -1;
    c.save();
    c.translate(p.x, p.y);
    if (u.hp <= 0) c.globalAlpha = Math.max(0, 1 - (u.deadT || 0) / 0.35);
    if (u.type === "knight") drawKnight(c, s, flip, u.swing, u.bob);
    else if (u.type === "archer") drawArcher(c, s, flip, u.swing, u.bob);
    else drawDragon(c, s, flip, u.swing, u.bob);
    if (u.hp > 0 && u.hp < u.maxHp) {
      const bw = s * 0.8;
      c.fillStyle = "rgba(0,0,0,.35)";
      roundRect(c, -bw / 2, -s * 1.05, bw, s * 0.12, 4);
      c.fill();
      c.fillStyle = u.side === "player" ? "#4aa3ff" : "#ff6a3d";
      roundRect(c, -bw / 2, -s * 1.05, bw * (u.hp / u.maxHp), s * 0.12, 4);
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
      c.fillStyle = `rgba(255,210,74,${pulse})`;
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
      const a = Math.max(0, f.life / f.max);
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      if (f.kind === "hit") {
        c.fillStyle = "#fff3a0";
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          c.beginPath();
          c.arc(Math.cos(ang) * 12 * (1 - a), Math.sin(ang) * 12 * (1 - a), 4, 0, Math.PI * 2);
          c.fill();
        }
      } else if (f.kind === "pop") {
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(0, 0, unitScale() * 0.4 * (1.2 - a), 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = "#ffe27a";
        c.beginPath();
        c.arc(0, 0, unitScale() * 0.25 * (1.4 - a), 0, Math.PI * 2);
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
    c.fillStyle = "#6ed36a";
    c.fillRect(0, 0, cw, ch);
    // rounded clip
    c.save();
    drawSkyGrass(c, cw, ch);
    drawPaths(c);
    drawCastle(c, "ai");
    drawCastle(c, "player");
    drawLaneHints(c);
    const list = state.units.slice().sort((a, b) => a.y - b.y || (a.flying ? 1 : 0) - (b.flying ? 1 : 0));
    for (const u of list) drawUnit(c, u);
    drawFx(c);
    c.restore();
  }

  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    if (dt > 0.08) dt = 0.08;
    state.acc += dt;
    while (state.acc >= STEP) {
      if (state.screen === "play" && !state.winner) simulate(STEP);
      state.acc -= STEP;
    }
    render();
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
        hp: u.hp,
      })),
      winner: state.winner,
      stars: state.stars,
      aiEnergy: state.ai.energy,
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
  };
})();
