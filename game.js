/* ==================================================
   SLIMERS — game.js
   GAME A: "PROTON PANIC"   — top-down ghost-busting arena
   GAME B: "HAUNTED HOUSE"  — first-person ghost hunter
   ================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;   // 640
  const H = canvas.height;  // 400

  // ============ SHARED STATE ============
  let currentGame = 'proton'; // 'proton' | 'haunted'

  const S = {
    scene: 'select',   // 'select' | 'title' | 'play' | 'gameover' | 'victory' | 'level_clear'
    level: 1,
    score: 0,
    highScore: Number(localStorage.getItem('slimers_highscore_v1') || 0),
    highScoreHaunted: Number(localStorage.getItem('slimers_highscore_haunted_v1') || 0),
    paused: false,
    muted: false,
    time: 0,
    frame: 0,
    flashText: null,
  };

  const hsEl = document.getElementById('hsValue');
  function updateHSDisplay() {
    if (!hsEl) return;
    hsEl.textContent = currentGame === 'proton' ? S.highScore : S.highScoreHaunted;
  }
  updateHSDisplay();

  // ============ GAME PICKER (HTML buttons) ============
  const legendEl = document.getElementById('gameLegend');

  const LEGENDS = {
    proton: `
      <h3>HOW TO BUST</h3>
      <ul>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — MOVE</li>
        <li><kbd>SPACE</kbd> — PROTON STREAM</li>
        <li><kbd>M</kbd> — MUTE</li>
        <li><kbd>P</kbd> — PAUSE</li>
      </ul>
      <h3>PICK UPS</h3>
      <ul class="pickups">
        <li><span class="pu">🍕</span> PIZZA — +2 HP</li>
        <li><span class="pu">🍺</span> BEER — 3s INVINCIBLE</li>
        <li><span class="pu">🍿</span> SNACKS — RAPID FIRE</li>
      </ul>
      <h3>ENEMIES</h3>
      <ul>
        <li>👻 GHOSTS — slow</li>
        <li>🟢 BOOGERS — leave slime</li>
        <li>💀 GHOULS — fast</li>
        <li>🎸 SKELETON MOSH PIT</li>
        <li>🟩 SLIMER — <em>THE BOSS</em></li>
      </ul>`,
    haunted: `
      <h3>HOW TO HUNT</h3>
      <ul>
        <li><kbd>W</kbd><kbd>S</kbd> — MOVE FWD/BACK</li>
        <li><kbd>A</kbd><kbd>D</kbd> — TURN LEFT/RIGHT</li>
        <li><kbd>SPACE</kbd> — FIRE PROTON STREAM</li>
        <li><kbd>M</kbd> — MUTE</li>
        <li><kbd>P</kbd> — PAUSE</li>
      </ul>
      <h3>OBJECTIVES</h3>
      <ul>
        <li>🔑 Find keys to unlock rooms</li>
        <li>👻 Clear all ghosts to advance</li>
        <li>🌀 Reach the portal to escape</li>
      </ul>
      <h3>ENEMIES</h3>
      <ul>
        <li>👻 WRAITH — drifts toward you</li>
        <li>🟢 SLIME BLOB — leaves puddles</li>
        <li>💀 BANSHEE — fast &amp; screams</li>
        <li>🟩 SLIMER — <em>FINAL BOSS</em></li>
      </ul>`
  };

  function setLegend(game) {
    if (legendEl) legendEl.innerHTML = LEGENDS[game] || '';
  }
  setLegend('proton');

  // Wire up HTML picker buttons
  document.querySelectorAll('.game-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (S.scene === 'play') return; // don't switch mid-game
      const game = btn.getAttribute('data-game');
      currentGame = game;
      document.querySelectorAll('.game-option').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      setLegend(game);
      updateHSDisplay();
      S.scene = 'title';
      stopMusic();
      startMusic('title');
      canvas.focus();
    });
  });

  // ============ INPUT ============
  const keys = Object.create(null);
  function onKey(down) {
    return (e) => {
      const k = e.key.toLowerCase();
      const activeIsCanvas = document.activeElement === canvas;
      if (activeIsCanvas && ['w','a','s','d',' ','p','m'].includes(k)) e.preventDefault();
      keys[k] = down;
      if (down) {
        if (k === 'p' && S.scene === 'play') S.paused = !S.paused;
        if (k === 'm') toggleMute();
        if ((k === 'enter' || k === ' ') && (S.scene === 'title' || S.scene === 'gameover' || S.scene === 'victory')) {
          if (S.scene === 'title') startGame();
          else resetToTitle();
        }
        if ((k === 'enter' || k === ' ') && S.scene === 'level_clear') nextLevel();
        if ((k === 'enter' || k === ' ') && S.scene === 'select') {
          S.scene = 'title';
          startMusic('title');
        }
      }
    };
  }
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));

  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.getAttribute('data-key').toLowerCase();
    const press = (e) => { e.preventDefault(); keys[k] = true; handleSceneAdvance(k); };
    const release = (e) => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  });

  function handleSceneAdvance(k) {
    if (k !== ' ' && k !== 'enter') return;
    if (S.scene === 'title') startGame();
    else if (S.scene === 'gameover' || S.scene === 'victory') resetToTitle();
    else if (S.scene === 'level_clear') nextLevel();
    else if (S.scene === 'select') { S.scene = 'title'; startMusic('title'); }
  }

  // ============ AUDIO ============
  let audioCtx = null;
  let masterGain = null;
  let musicTimer = null;

  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.15;
      masterGain.connect(audioCtx.destination);
    } catch (e) { /* no audio */ }
  }
  function toggleMute() {
    S.muted = !S.muted;
    if (masterGain) masterGain.gain.value = S.muted ? 0 : 0.15;
  }
  function beep(freq, duration = 0.1, type = 'square', gainVal = 0.2, slideTo = null) {
    if (!audioCtx || S.muted) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), audioCtx.currentTime + duration);
    g.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(g).connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + duration + 0.02);
  }
  function noiseBurst(duration = 0.1, gainVal = 0.2) {
    if (!audioCtx || S.muted) return;
    const buf = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * duration)), audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    src.connect(g).connect(masterGain);
    src.start();
  }

  const SFX = {
    shoot()      { beep(880, 0.06, 'square', 0.08); beep(600, 0.08, 'sawtooth', 0.05, 300); },
    hit()        { noiseBurst(0.08, 0.15); beep(200, 0.12, 'square', 0.1, 80); },
    pickup()     { beep(660, 0.08, 'square', 0.15); setTimeout(() => beep(990, 0.1, 'square', 0.15), 60); setTimeout(() => beep(1320, 0.1, 'square', 0.15), 120); },
    hurt()       { beep(160, 0.2, 'sawtooth', 0.2, 60); noiseBurst(0.1, 0.1); },
    levelClear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'square', 0.18), i * 90)); },
    gameover()   { [330, 261, 196, 130].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.2), i * 150)); },
    victory()    { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'square', 0.2), i * 110)); },
    boss()       { beep(90, 0.4, 'sawtooth', 0.25); noiseBurst(0.3, 0.1); },
    door()       { beep(300, 0.05, 'square', 0.1); beep(400, 0.05, 'square', 0.1); },
    ambient()    { beep(55 + Math.random() * 20, 0.4, 'sine', 0.04); },
  };

  const TRACKS = {
    title:   { tempo: 140, bass: [196,196,0,233,220,220,0,196],    lead: [587,0,523,0,494,0,466,440] },
    level1:  { tempo: 170, bass: [220,220,330,220,220,220,294,220], lead: [440,523,440,523,587,523,494,440] },
    level2:  { tempo: 185, bass: [196,220,247,220,196,220,247,261], lead: [392,440,494,440,392,440,494,523] },
    boss:    { tempo: 200, bass: [110,110,110,0,110,147,147,165],   lead: [220,0,294,247,220,0,294,330] },
    haunted: { tempo: 100, bass: [98,0,110,0,98,0,110,123],         lead: [196,0,0,220,0,185,0,196] },
    hboss:   { tempo: 130, bass: [82,82,0,82,98,0,82,110],          lead: [164,0,196,185,164,0,196,220] },
  };

  function startMusic(trackName) {
    stopMusic();
    if (!audioCtx || S.muted) return;
    const t = TRACKS[trackName];
    if (!t) return;
    const stepLen = 60 / t.tempo / 2;
    let step = 0;
    musicTimer = setInterval(() => {
      if (S.muted || S.paused) return;
      const bass = t.bass[step % t.bass.length];
      const lead = t.lead[step % t.lead.length];
      if (bass) beep(bass, stepLen * 0.9, 'triangle', 0.08);
      if (lead) beep(lead, stepLen * 0.8, 'square', 0.06);
      step++;
    }, stepLen * 1000);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ============ SHARED HELPERS ============
  const rand = (a, b) => Math.random() * (b - a) + a;
  const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy); };
  const flash = (text, seconds) => { S.flashText = { text, until: S.time + seconds }; };
  const CHORUS_LINES = ['IF YOU SEE SOMETHING, SAY SOMETHING', 'PARTYING WITH SLIMER'];

  // ============ GAME ROUTER ============
  function startGame() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (currentGame === 'proton') startProtonPanic();
    else startHauntedHouse();
  }

  function nextLevel() {
    if (currentGame === 'proton') nextLevelProton();
    else nextRoomHaunted();
  }

  function resetToTitle() {
    S.scene = 'title'; S.paused = false;
    stopMusic();
    startMusic('title');
    updateHSDisplay();
  }

  function win() {
    S.scene = 'victory';
    const hsKey = currentGame === 'proton' ? 'slimers_highscore_v1' : 'slimers_highscore_haunted_v1';
    const hsField = currentGame === 'proton' ? 'highScore' : 'highScoreHaunted';
    if (S.score > S[hsField]) {
      S[hsField] = S.score;
      localStorage.setItem(hsKey, S[hsField]);
    }
    updateHSDisplay();
    flash('PARTYING WITH SLIMER', 3.0);
    stopMusic();
    SFX.victory();
  }

  function gameOver() {
    S.scene = 'gameover';
    const hsKey = currentGame === 'proton' ? 'slimers_highscore_v1' : 'slimers_highscore_haunted_v1';
    const hsField = currentGame === 'proton' ? 'highScore' : 'highScoreHaunted';
    if (S.score > S[hsField]) {
      S[hsField] = S.score;
      localStorage.setItem(hsKey, S[hsField]);
    }
    updateHSDisplay();
    stopMusic();
    SFX.gameover();
  }

  // ================================================================
  //  GAME A — PROTON PANIC (original top-down game, fully preserved)
  // ================================================================
  let player, bullets, enemies, pickups, particles, boss, slimePuddles;

  function resetWorld() {
    player = {
      x: W/2, y: H/2, r: 10, hp: 6, maxHp: 10,
      facingX: 1, facingY: 0,
      invincibleUntil: 0, rapidFireUntil: 0, shootCooldown: 0, slimeSlowUntil: 0, flashUntil: 0,
    };
    bullets = []; enemies = []; pickups = []; particles = []; slimePuddles = []; boss = null;
    S.flashText = null;
  }

  function makeEnemy(type, x, y) {
    const base = { x, y, vx: 0, vy: 0, hp: 1, type, r: 10, anim: Math.random() * Math.PI * 2 };
    if (type === 'ghost')    return { ...base, hp: 2, speed: 0.6 };
    if (type === 'booger')   return { ...base, hp: 3, speed: 0.9, r: 12 };
    if (type === 'ghoul')    return { ...base, hp: 2, speed: 1.7, r: 9 };
    if (type === 'skeleton') return { ...base, hp: 5, speed: 1.1, r: 11 };
    return base;
  }
  const makePickup = (type, x, y) => ({ x, y, r: 12, type, anim: 0 });

  function spawnLevel(n) {
    resetWorld();
    if (n === 1) {
      for (let i = 0; i < 5; i++) enemies.push(makeEnemy('ghost', rand(40, W-40), rand(80, H-40)));
      for (let i = 0; i < 2; i++) enemies.push(makeEnemy('booger', rand(40, W-40), rand(80, H-40)));
      pickups.push(makePickup('pizza', W*0.3, H*0.7));
    } else if (n === 2) {
      for (let i = 0; i < 3; i++) enemies.push(makeEnemy('ghost', rand(40, W-40), rand(80, H-40)));
      for (let i = 0; i < 3; i++) enemies.push(makeEnemy('booger', rand(40, W-40), rand(80, H-40)));
      for (let i = 0; i < 3; i++) enemies.push(makeEnemy('ghoul', rand(40, W-40), rand(80, H-40)));
      for (let i = 0; i < 5; i++) enemies.push(makeEnemy('skeleton', W*0.75 + rand(-30,30), H*0.4 + rand(-30,30)));
      pickups.push(makePickup('beer', W*0.2, H*0.25));
      pickups.push(makePickup('snack', W*0.8, H*0.8));
    } else if (n === 3) {
      boss = { x: W/2, y: 110, r: 40, hp: 40, maxHp: 40, phase: 1, vx: 2, vy: 0.6, spitCooldown: 1.2, anim: 0 };
      pickups.push(makePickup('pizza', 60, H - 60));
      pickups.push(makePickup('beer', W - 60, H - 60));
      pickups.push(makePickup('snack', W/2, H - 40));
    }
  }

  function startProtonPanic() {
    S.level = 1; S.score = 0;
    spawnLevel(1);
    S.scene = 'play'; S.paused = false;
    startMusic('level1');
    canvas.focus();
    flash('LEVEL 1 — GET SLIMED', 1.5);
  }

  function nextLevelProton() {
    S.level++;
    if (S.level > 3) { win(); return; }
    spawnLevel(S.level);
    S.scene = 'play';
    startMusic(S.level === 3 ? 'boss' : 'level2');
    flash(S.level === 3 ? 'LEVEL 3 — SLIMER AWAITS' : `LEVEL ${S.level}`, 1.5);
  }

  function updateProton(dt) {
    S.time += dt; S.frame++;
    if (S.paused || S.scene !== 'play') return;

    // Player movement
    let ax = 0, ay = 0;
    if (keys['w']) ay -= 1;
    if (keys['s']) ay += 1;
    if (keys['a']) ax -= 1;
    if (keys['d']) ax += 1;
    if (ax || ay) {
      const mag = Math.sqrt(ax*ax + ay*ay);
      player.facingX = ax / mag; player.facingY = ay / mag;
      let speed = 160;
      if (S.time < player.slimeSlowUntil) speed *= 0.4;
      player.x += (ax / mag) * speed * dt;
      player.y += (ay / mag) * speed * dt;
    }
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r + 44, Math.min(H - player.r, player.y));

    // Shoot
    player.shootCooldown -= dt;
    const fireRate = S.time < player.rapidFireUntil ? 0.08 : 0.22;
    if (keys[' '] && player.shootCooldown <= 0) {
      player.shootCooldown = fireRate;
      let dx = player.facingX, dy = player.facingY;
      if (dx === 0 && dy === 0) dx = 1;
      bullets.push({ x: player.x, y: player.y, vx: dx * 420, vy: dy * 420, life: 0.8 });
      SFX.shoot();
    }

    // Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > W || b.y < 0 || b.y > H) { bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e._spit) continue;
        if (dist(b, e) < e.r + 3) {
          e.hp--;
          particles.push({ x: b.x, y: b.y, vx: rand(-50,50), vy: rand(-50,50), life: 0.3, color: '#7bff3a' });
          SFX.hit();
          if (e.hp <= 0) {
            S.score += (e.type === 'skeleton' ? 50 : e.type === 'ghoul' ? 30 : e.type === 'booger' ? 25 : 15);
            if (e.type === 'booger') slimePuddles.push({ x: e.x, y: e.y, r: 22, life: 4 });
            for (let p = 0; p < 12; p++) particles.push({ x: e.x, y: e.y, vx: rand(-120,120), vy: rand(-120,120), life: 0.5, color: e.type === 'booger' ? '#7bff3a' : '#ffffff' });
            enemies.splice(j, 1);
          }
          hit = true; break;
        }
      }
      if (!hit && boss && dist(b, boss) < boss.r + 3) {
        boss.hp--;
        particles.push({ x: b.x, y: b.y, vx: rand(-60,60), vy: rand(-60,60), life: 0.3, color: '#d1121b' });
        SFX.hit();
        hit = true;
        if (boss.hp <= 0) {
          S.score += 500;
          for (let p = 0; p < 60; p++) particles.push({ x: boss.x + rand(-20,20), y: boss.y + rand(-20,20), vx: rand(-300,300), vy: rand(-300,300), life: 1.2, color: '#7bff3a' });
          boss = null;
          flash('PARTYING WITH SLIMER', 2.5);
          setTimeout(() => win(), 1500);
        } else if (boss.hp < boss.maxHp / 2 && boss.phase === 1) {
          boss.phase = 2; boss.vx *= 1.4;
          SFX.boss();
          flash('SLIMER IS ENRAGED', 1.5);
        }
      }
      if (hit) bullets.splice(i, 1);
    }

    // Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e._spit) {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.x < -20 || e.x > W + 20 || e.y < 20 || e.y > H + 20) { enemies.splice(i, 1); continue; }
        if (S.time >= player.invincibleUntil && dist(player, e) < player.r + e.r) {
          player.hp--; player.invincibleUntil = S.time + 1.0; player.flashUntil = S.time + 0.4;
          SFX.hurt();
          enemies.splice(i, 1);
          if (player.hp <= 0) { gameOver(); return; }
        }
        continue;
      }
      e.anim += dt * 4;
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      if (e.type === 'skeleton') {
        e.x += (dx / d) * e.speed * 40 * dt + Math.sin(S.time * 3 + e.anim) * 20 * dt;
        e.y += (dy / d) * e.speed * 40 * dt + Math.cos(S.time * 3 + e.anim) * 20 * dt;
      } else {
        e.x += (dx / d) * e.speed * 50 * dt;
        e.y += (dy / d) * e.speed * 50 * dt;
      }
      if (S.time >= player.invincibleUntil && dist(player, e) < player.r + e.r) {
        player.hp--; player.invincibleUntil = S.time + 1.0; player.flashUntil = S.time + 0.4;
        SFX.hurt();
        player.x -= (dx / d) * 20; player.y -= (dy / d) * 20;
        if (player.hp <= 0) { gameOver(); return; }
      }
    }

    // Boss
    if (boss) {
      boss.anim += dt;
      boss.x += boss.vx; boss.y += boss.vy;
      if (boss.x < boss.r + 20 || boss.x > W - boss.r - 20) boss.vx *= -1;
      if (boss.y < boss.r + 50 || boss.y > H/2) boss.vy *= -1;
      boss.spitCooldown -= dt;
      if (boss.spitCooldown <= 0) {
        boss.spitCooldown = boss.phase === 2 ? 0.7 : 1.3;
        const bdx = player.x - boss.x, bdy = player.y - boss.y;
        const spits = boss.phase === 2 ? 3 : 1;
        for (let k = 0; k < spits; k++) {
          const ang = Math.atan2(bdy, bdx) + (k - (spits-1)/2) * 0.22;
          enemies.push({ x: boss.x, y: boss.y + boss.r, vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180, hp: 1, type: 'spit', r: 8, anim: 0, _spit: true });
        }
      }
      if (S.time >= player.invincibleUntil && dist(player, boss) < player.r + boss.r) {
        player.hp -= 2; player.invincibleUntil = S.time + 1.0; player.flashUntil = S.time + 0.4;
        SFX.hurt();
        if (player.hp <= 0) { gameOver(); return; }
      }
    }

    // Slime puddles
    for (let i = slimePuddles.length - 1; i >= 0; i--) {
      const p = slimePuddles[i];
      p.life -= dt;
      if (dist(player, p) < player.r + p.r) player.slimeSlowUntil = Math.max(player.slimeSlowUntil, S.time + 0.3);
      if (p.life <= 0) slimePuddles.splice(i, 1);
    }

    // Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.anim += dt * 3;
      if (dist(player, p) < player.r + p.r) {
        SFX.pickup();
        if (p.type === 'pizza')      player.hp = Math.min(player.maxHp, player.hp + 2);
        else if (p.type === 'beer')  player.invincibleUntil = S.time + 3.0;
        else if (p.type === 'snack') player.rapidFireUntil = S.time + 5.0;
        flash(CHORUS_LINES[Math.floor(Math.random() * CHORUS_LINES.length)], 1.6);
        S.score += 20;
        pickups.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Level clear
    if (S.level < 3 && enemies.filter(e => !e._spit).length === 0) {
      SFX.levelClear();
      S.scene = 'level_clear';
      stopMusic();
    }
  }

  // ================================================================
  //  GAME B — HAUNTED HOUSE  (pseudo-3D raycaster, Half-Life style)
  // ================================================================

  // ---- MAP DEFINITION ----
  // 0=floor, 1=wall, 2=door(locked), 3=door(open), 4=key, 5=portal
  const MAPS = [
    // Room 1 — Entry Hall
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1],
    ],
    // Room 2 — The Crypt
    [
      [1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
      [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
      [1,0,0,0,0,1,1,0,0,1,1,0,0,0,0,1],
      [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
      [1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1],
    ],
    // Room 3 — Boss Chamber
    [
      [1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,5,5,5,5,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  ];

  const TILE = 1.0;
  const MAP_W = 16;
  const MAP_H = 13;

  // FPS state
  let fps = {};

  function makeGhost3D(type, mx, my) {
    // mx, my in map tile coords
    return {
      x: (mx + 0.5) * TILE,
      y: (my + 0.5) * TILE,
      type,   // 'wraith' | 'blob' | 'banshee' | 'boss'
      hp: type === 'boss' ? 60 : type === 'banshee' ? 3 : type === 'blob' ? 4 : 2,
      maxHp: type === 'boss' ? 60 : type === 'banshee' ? 3 : type === 'blob' ? 4 : 2,
      speed: type === 'banshee' ? 2.8 : type === 'boss' ? 1.5 : 1.4,
      anim: Math.random() * Math.PI * 2,
      attackCooldown: 0,
      phase: 1,
      // blob spit
      spitCooldown: type === 'boss' ? 1.2 : 0,
      alive: true,
    };
  }

  const ROOM_SPAWNS = [
    // Room 1
    [ {type:'wraith',mx:3,my:2}, {type:'wraith',mx:11,my:3}, {type:'blob',mx:7,my:5},
      {type:'wraith',mx:2,my:8}, {type:'blob',mx:12,my:9},  {type:'wraith',mx:6,my:10} ],
    // Room 2
    [ {type:'banshee',mx:3,my:3}, {type:'blob',mx:12,my:3}, {type:'wraith',mx:7,my:5},
      {type:'banshee',mx:2,my:8}, {type:'blob',mx:11,my:7},  {type:'banshee',mx:8,my:10},
      {type:'wraith',mx:4,my:10} ],
    // Room 3 — boss room
    [ {type:'boss',mx:8,my:6} ],
  ];

  const KEY_POSITIONS = [
    { mx: 13, my: 1 },   // Room 1 key
    { mx: 13, my: 10 },  // Room 2 key
  ];

  function startHauntedHouse() {
    S.level = 1; S.score = 0;
    initRoom(0);
    S.scene = 'play'; S.paused = false;
    startMusic('haunted');
    canvas.focus();
    flash('ROOM 1 — ENTRY HALL', 2.0);
  }

  function initRoom(roomIdx) {
    const map = MAPS[roomIdx];
    // deep-copy map so we can mutate it
    fps = {
      roomIdx,
      map: map.map(row => [...row]),
      px: 8.5, py: 1.5,    // player position in tile units
      pAngle: Math.PI / 2, // looking "down" (south)
      hp: 6, maxHp: 6,
      invincibleUntil: 0, flashUntil: 0,
      shootCooldown: 0,
      hasKey: false,
      keyCollected: false,
      ghosts: ROOM_SPAWNS[roomIdx].map(s => makeGhost3D(s.type, s.mx, s.my)),
      spits: [],       // projectiles from boss
      slimePuddles: [],
      keyPos: roomIdx < 2 ? { x: (KEY_POSITIONS[roomIdx].mx + 0.5), y: (KEY_POSITIONS[roomIdx].my + 0.5) } : null,
      particles3d: [],
      bossDefeated: false,
      portalActive: roomIdx === 2,
      ambientTimer: 0,
    };
    S.flashText = null;
  }

  function nextRoomHaunted() {
    const next = fps.roomIdx + 1;
    if (next >= MAPS.length) { win(); return; }
    initRoom(next);
    S.scene = 'play';
    startMusic(next === 2 ? 'hboss' : 'haunted');
    const names = ['ROOM 1 — ENTRY HALL', 'ROOM 2 — THE CRYPT', 'ROOM 3 — BOSS CHAMBER'];
    flash(names[next] || `ROOM ${next + 1}`, 2.0);
  }

  // ---- RAYCASTING ----
  function castRay(angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    let x = fps.px, y = fps.py;
    const stepSize = 0.02;
    let dist = 0;
    for (let i = 0; i < 800; i++) {
      x += cosA * stepSize;
      y += sinA * stepSize;
      dist += stepSize;
      const mx = Math.floor(x), my = Math.floor(y);
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return { dist, hit: 1, isNS: false };
      const cell = fps.map[my][mx];
      if (cell === 1) return { dist, hit: 1, isNS: isNSWall(angle), cell };
      if (cell === 2) return { dist, hit: 2, isNS: isNSWall(angle), cell }; // locked door
      if (cell === 3) continue; // open door — pass through
    }
    return { dist: 800, hit: 0, isNS: false, cell: 0 };
  }

  function isNSWall(angle) {
    const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return norm < Math.PI * 0.25 || norm > Math.PI * 1.75 || (norm > Math.PI * 0.75 && norm < Math.PI * 1.25);
  }

  function mapIsPassable(mx, my) {
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return false;
    const c = fps.map[my][mx];
    return c === 0 || c === 3 || c === 4 || c === 5;
  }

  function tryMove(nx, ny) {
    const margin = 0.25;
    const mx = Math.floor(nx), my = Math.floor(ny);
    if (mapIsPassable(mx, my) &&
        mapIsPassable(Math.floor(nx + margin), my) &&
        mapIsPassable(Math.floor(nx - margin), my) &&
        mapIsPassable(mx, Math.floor(ny + margin)) &&
        mapIsPassable(mx, Math.floor(ny - margin))) {
      fps.px = nx; fps.py = ny;
      return true;
    }
    return false;
  }

  function updateHaunted(dt) {
    S.time += dt; S.frame++;
    if (S.paused || S.scene !== 'play') return;

    const f = fps;
    const turnSpeed = 2.2;
    const moveSpeed = 3.0;

    // Turn
    if (keys['a']) f.pAngle -= turnSpeed * dt;
    if (keys['d']) f.pAngle += turnSpeed * dt;

    // Move forward/back
    if (keys['w']) {
      tryMove(f.px + Math.cos(f.pAngle) * moveSpeed * dt,
              f.py + Math.sin(f.pAngle) * moveSpeed * dt);
    }
    if (keys['s']) {
      tryMove(f.px - Math.cos(f.pAngle) * moveSpeed * dt,
              f.py - Math.sin(f.pAngle) * moveSpeed * dt);
    }

    // Shoot
    f.shootCooldown -= dt;
    if (keys[' '] && f.shootCooldown <= 0) {
      f.shootCooldown = 0.35;
      SFX.shoot();
      // Shoot: check closest ghost in crosshair cone
      const FOV = Math.PI / 3;
      let bestDist = 999, bestGhost = null;
      for (const g of f.ghosts) {
        if (!g.alive) continue;
        const dx = g.x - f.px, dy = g.y - f.py;
        const d = Math.sqrt(dx*dx + dy*dy);
        const angleToGhost = Math.atan2(dy, dx);
        let diff = angleToGhost - f.pAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < FOV * 0.35 && d < bestDist) {
          bestDist = d; bestGhost = g;
        }
      }
      if (bestGhost) {
        bestGhost.hp--;
        SFX.hit();
        for (let p = 0; p < 6; p++) {
          f.particles3d.push({ x: bestGhost.x, y: bestGhost.y, vx: rand(-1,1), vy: rand(-1,1), life: 0.5 });
        }
        if (bestGhost.hp <= 0) {
          bestGhost.alive = false;
          S.score += bestGhost.type === 'boss' ? 500 : bestGhost.type === 'banshee' ? 60 : bestGhost.type === 'blob' ? 40 : 25;
          if (bestGhost.type === 'boss') {
            flash('SLIMER DEFEATED!', 2.5);
            f.bossDefeated = true;
            f.portalActive = true;
            setTimeout(() => win(), 1800);
          }
        } else if (bestGhost.type === 'boss' && bestGhost.hp < bestGhost.maxHp / 2 && bestGhost.phase === 1) {
          bestGhost.phase = 2;
          bestGhost.speed *= 1.5;
          bestGhost.spitCooldown = 0.8;
          SFX.boss();
          flash('SLIMER IS ENRAGED!', 1.5);
        }
      }
    }

    // Ghost AI
    for (const g of f.ghosts) {
      if (!g.alive) continue;
      g.anim += dt * 3;
      const dx = f.px - g.x, dy = f.py - g.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const spd = g.speed * TILE * dt;

      // Move toward player if not blocked
      const nx = g.x + (dx/d) * spd;
      const ny = g.y + (dy/d) * spd;
      const gmx = Math.floor(nx), gmy = Math.floor(ny);
      if (mapIsPassable(gmx, gmy)) { g.x = nx; g.y = ny; }

      // Boss spit
      if (g.type === 'boss') {
        g.spitCooldown -= dt;
        if (g.spitCooldown <= 0) {
          g.spitCooldown = g.phase === 2 ? 0.9 : 1.6;
          const ang = Math.atan2(dy, dx);
          const spits = g.phase === 2 ? 3 : 1;
          for (let k = 0; k < spits; k++) {
            const a = ang + (k - (spits-1)/2) * 0.3;
            f.spits.push({ x: g.x, y: g.y, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5, life: 1.5 });
          }
        }
      }

      // Blob leaves slime trail
      if (g.type === 'blob' && Math.random() < 0.02) {
        f.slimePuddles.push({ x: g.x, y: g.y, life: 5 });
      }

      // Banshee scream flash
      if (g.type === 'banshee' && d < 2 && Math.random() < 0.005) {
        flash('BANSHEE SCREAM!', 0.4);
        beep(900, 0.3, 'sawtooth', 0.12);
      }

      // Touch damage
      g.attackCooldown -= dt;
      if (d < 0.7 && g.attackCooldown <= 0 && S.time >= f.invincibleUntil) {
        const dmg = g.type === 'boss' ? 2 : 1;
        f.hp -= dmg;
        f.invincibleUntil = S.time + 0.8;
        f.flashUntil = S.time + 0.3;
        g.attackCooldown = 0.8;
        SFX.hurt();
        if (f.hp <= 0) { gameOver(); return; }
      }
    }

    // Spit projectiles
    for (let i = f.spits.length - 1; i >= 0; i--) {
      const sp = f.spits[i];
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life -= dt;
      if (sp.life <= 0) { f.spits.splice(i, 1); continue; }
      const smx = Math.floor(sp.x), smy = Math.floor(sp.y);
      if (!mapIsPassable(smx, smy)) { f.spits.splice(i, 1); continue; }
      const ddx = sp.x - f.px, ddy = sp.y - f.py;
      if (Math.sqrt(ddx*ddx + ddy*ddy) < 0.5 && S.time >= f.invincibleUntil) {
        f.hp--; f.invincibleUntil = S.time + 0.8; f.flashUntil = S.time + 0.3;
        SFX.hurt();
        f.spits.splice(i, 1);
        if (f.hp <= 0) { gameOver(); return; }
      }
    }

    // Slime puddles (slow player)
    for (let i = f.slimePuddles.length - 1; i >= 0; i--) {
      f.slimePuddles[i].life -= dt;
      if (f.slimePuddles[i].life <= 0) { f.slimePuddles.splice(i, 1); }
    }

    // Particles
    for (let i = f.particles3d.length - 1; i >= 0; i--) {
      const p = f.particles3d[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) f.particles3d.splice(i, 1);
    }

    // Key pickup
    if (f.keyPos && !f.hasKey) {
      const kx = f.keyPos.x - f.px, ky = f.keyPos.y - f.py;
      if (Math.sqrt(kx*kx + ky*ky) < 0.7) {
        f.hasKey = true;
        f.keyCollected = true;
        SFX.pickup();
        flash('KEY FOUND! DOOR UNLOCKED!', 2.0);
        S.score += 50;
        // Unlock the door on the map
        for (let my = 0; my < MAP_H; my++) {
          for (let mx2 = 0; mx2 < MAP_W; mx2++) {
            if (f.map[my][mx2] === 2) f.map[my][mx2] = 3;
          }
        }
        SFX.door();
      }
    }

    // Portal (room clear or boss room)
    if (f.portalActive && !f.bossDefeated) {
      const aliveGhosts = f.ghosts.filter(g => g.alive).length;
      if (aliveGhosts === 0 && f.roomIdx < 2) {
        // check if player is near portal tile (row 12, col 7-8)
        const nearPortalX = Math.abs(f.px - 8.0) < 1.2;
        const nearPortalY = Math.abs(f.py - 11.5) < 1.0;
        if (nearPortalX && nearPortalY && (f.roomIdx === 0 ? f.hasKey : true)) {
          SFX.levelClear();
          S.scene = 'level_clear';
          stopMusic();
        }
      }
    }

    // Boss room portal (exit to win handled via bossDefeated timer)
    if (f.roomIdx === 2 && f.bossDefeated) {
      // win() called from timeout, nothing else needed
    }

    // Ambient sound
    f.ambientTimer -= dt;
    if (f.ambientTimer <= 0) {
      f.ambientTimer = rand(3, 8);
      SFX.ambient();
    }
  }

  // ---- FPS RENDERER ----
  function drawHaunted() {
    const f = fps;
    const FOV = Math.PI / 3;
    const NUM_RAYS = W;
    const HALF_H = H / 2;

    // Sky (dark purple/black)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HALF_H);
    skyGrad.addColorStop(0, '#0a0010');
    skyGrad.addColorStop(1, '#1a0a2a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, HALF_H);

    // Floor
    const floorGrad = ctx.createLinearGradient(0, HALF_H, 0, H);
    floorGrad.addColorStop(0, '#1a1210');
    floorGrad.addColorStop(1, '#0a0808');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, HALF_H, W, HALF_H);

    // Depth buffer for sprite sorting
    const zBuffer = new Float32Array(W);

    // Walls
    for (let col = 0; col < NUM_RAYS; col++) {
      const rayAngle = f.pAngle - FOV / 2 + (col / NUM_RAYS) * FOV;
      const { dist: rawDist, hit, isNS } = castRay(rayAngle);
      const dist2 = rawDist * Math.cos(rayAngle - f.pAngle); // fisheye fix
      zBuffer[col] = dist2;

      if (!hit) continue;
      const wallH = Math.min(H * 2, (TILE / dist2) * (W / 1.3));
      const wallTop = HALF_H - wallH / 2;

      // Wall color based on hit type and NS/EW face
      let wallColor;
      if (hit === 2) {
        // Locked door — red/brown
        wallColor = isNS ? '#6a1010' : '#4a0a0a';
      } else {
        // Regular wall — stone shades
        wallColor = isNS ? '#3a2a4a' : '#2a1a3a';
      }

      // Distance fog
      const fog = Math.min(1, dist2 / 9);
      ctx.fillStyle = wallColor;
      ctx.globalAlpha = 1 - fog * 0.7;
      ctx.fillRect(col, wallTop, 1, wallH);
      ctx.globalAlpha = 1;
    }

    // ---- Sprites (ghosts, key, portal) ----
    // Collect all sprites
    const sprites = [];

    // Ghosts
    for (const g of f.ghosts) {
      if (!g.alive) continue;
      sprites.push({ x: g.x, y: g.y, type: 'ghost', ghost: g });
    }
    // Spit projectiles
    for (const sp of f.spits) {
      sprites.push({ x: sp.x, y: sp.y, type: 'spit' });
    }
    // Key
    if (f.keyPos && !f.hasKey) {
      sprites.push({ x: f.keyPos.x, y: f.keyPos.y, type: 'key' });
    }
    // Slime puddles (draw as floor decal — simplified)
    // Portal
    if (f.portalActive && f.roomIdx < 2) {
      sprites.push({ x: 8.0, y: 11.5, type: 'portal' });
    }

    // Sort far to near
    sprites.sort((a, b) => {
      const dA = (a.x-f.px)**2 + (a.y-f.py)**2;
      const dB = (b.x-f.px)**2 + (b.y-f.py)**2;
      return dB - dA;
    });

    const FOV_HALF = FOV / 2;

    for (const sp of sprites) {
      const dx = sp.x - f.px, dy = sp.y - f.py;
      const spriteDist = Math.sqrt(dx*dx + dy*dy);
      if (spriteDist < 0.1) continue;

      const spriteAngle = Math.atan2(dy, dx);
      let angleDiff = spriteAngle - f.pAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) > FOV_HALF + 0.1) continue;

      const screenX = (0.5 + angleDiff / FOV) * W;
      const spriteH = Math.min(H * 1.5, (TILE / spriteDist) * (W / 1.3));
      const spriteW = spriteH;
      const spriteTop = HALF_H - spriteH / 2;
      const spriteLeft = screenX - spriteW / 2;
      const fog = Math.min(1, spriteDist / 9);

      ctx.globalAlpha = Math.max(0.1, 1 - fog * 0.8);

      // Only draw columns not occluded by closer walls
      const startCol = Math.max(0, Math.floor(spriteLeft));
      const endCol   = Math.min(W - 1, Math.floor(spriteLeft + spriteW));

      if (sp.type === 'ghost') {
        const g = sp.ghost;
        // Draw ghost sprite using simple pixel art scaled up
        drawGhostSprite(g, screenX, spriteTop, spriteW, spriteH, spriteDist, startCol, endCol, zBuffer);
      } else if (sp.type === 'spit') {
        ctx.fillStyle = '#7bff3a';
        for (let col2 = startCol; col2 <= endCol; col2++) {
          if (spriteDist < zBuffer[col2]) {
            ctx.fillRect(col2, spriteTop + spriteH * 0.3, 1, spriteH * 0.4);
          }
        }
      } else if (sp.type === 'key') {
        const bob = Math.sin(S.time * 3) * spriteH * 0.05;
        ctx.fillStyle = '#ffea00';
        for (let col2 = startCol; col2 <= endCol; col2++) {
          if (spriteDist < zBuffer[col2]) {
            const t = (col2 - spriteLeft) / spriteW;
            if (t > 0.3 && t < 0.7) ctx.fillRect(col2, spriteTop + spriteH * 0.3 + bob, 1, spriteH * 0.4);
          }
        }
      } else if (sp.type === 'portal') {
        const pulse = Math.sin(S.time * 5) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(123,255,58,${pulse})`;
        for (let col2 = startCol; col2 <= endCol; col2++) {
          if (spriteDist < zBuffer[col2]) {
            ctx.fillRect(col2, spriteTop, 1, spriteH);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---- HUD ----
    drawHUD_FPS();

    // Hurt flash
    if (S.time < f.flashUntil) {
      ctx.fillStyle = 'rgba(209,18,27,0.35)';
      ctx.fillRect(0, 0, W, H);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // Crosshair
    ctx.strokeStyle = '#7bff3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W/2 - 8, H/2); ctx.lineTo(W/2 + 8, H/2);
    ctx.moveTo(W/2, H/2 - 8); ctx.lineTo(W/2, H/2 + 8);
    ctx.stroke();

    drawFlashText();

    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffea00';
      ctx.font = '24px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W/2, H/2);
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText('PRESS [P] TO RESUME', W/2, H/2 + 30);
      ctx.textAlign = 'left';
    }
  }

  function drawGhostSprite(g, cx, top, sw, sh, dist2, startCol, endCol, zBuffer) {
    const isEnraged = g.type === 'boss' && g.phase === 2;
    const wobble = Math.sin(g.anim) * sh * 0.04;

    for (let col = startCol; col <= endCol; col++) {
      if (dist2 >= zBuffer[col]) continue;
      const t = (col - (cx - sw/2)) / sw; // 0..1 across sprite width
      // Ghost silhouette: bell curve top half, wiggly bottom
      const rowMid = top + sh/2 + wobble;
      const bodyTop = rowMid - sh * 0.45;
      const bodyBot = rowMid + sh * 0.45;
      const bodyH = bodyBot - bodyTop;

      // Choose color
      let baseColor;
      if (g.type === 'boss') baseColor = isEnraged ? '#c5ff6b' : '#7bff3a';
      else if (g.type === 'blob') baseColor = '#2a8a2a';
      else if (g.type === 'banshee') baseColor = '#9933cc';
      else baseColor = '#d8d4ee'; // wraith

      // Draw column strip as ghost shape
      // Top dome
      if (t > 0.1 && t < 0.9) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(col, bodyTop, 1, bodyH * 0.7);
      }
      // Wavy bottom fringe
      const fringe = bodyH * 0.3;
      const fringeWave = Math.abs(Math.sin(t * Math.PI * 3 + S.time * 4));
      if (t > 0.05 && t < 0.95) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(col, bodyTop + bodyH * 0.7, 1, fringe * fringeWave);
      }
      // Eyes
      if ((t > 0.2 && t < 0.35) || (t > 0.65 && t < 0.8)) {
        ctx.fillStyle = g.type === 'banshee' ? '#ffea00' : '#000';
        ctx.fillRect(col, bodyTop + bodyH * 0.2, 1, bodyH * 0.12);
      }
    }

    // Boss HP bar above head
    if (g.type === 'boss') {
      const barW = Math.min(200, sw * 1.2);
      const barX = cx - barW / 2;
      const barY = top - 14;
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = isEnraged ? '#c5ff6b' : '#d1121b';
      ctx.fillRect(barX, barY, (g.hp / g.maxHp) * barW, 8);
      ctx.fillStyle = '#fff';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SLIMER', cx, barY - 2);
      ctx.textAlign = 'left';
    }
  }

  function drawHUD_FPS() {
    const f = fps;
    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#7bff3a';
    ctx.fillRect(0, 40, W, 2);

    // HP
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#7bff3a';
    ctx.textAlign = 'left';
    ctx.fillText('HP', 12, 25);
    for (let i = 0; i < f.maxHp; i++) {
      const filled = i < f.hp;
      ctx.fillStyle = filled ? '#d1121b' : '#333';
      ctx.fillRect(44 + i * 12, 14, 9, 13);
      ctx.fillStyle = filled ? '#ff4444' : '#555';
      ctx.fillRect(45 + i * 12, 15, 7, 4);
    }

    // Score
    ctx.fillStyle = '#ffea00';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE ${String(S.score).padStart(6, '0')}`, W/2, 25);

    // Room / key status
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7bff3a';
    ctx.fillText(`ROOM ${f.roomIdx + 1}/3`, W - 12, 25);

    // Key indicator
    if (!f.hasKey && f.keyPos) {
      ctx.fillStyle = '#ffea00';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔑 FIND THE KEY', W/2, H - 12);
    } else if (f.hasKey && f.ghosts.some(g => g.alive)) {
      const alive = f.ghosts.filter(g => g.alive).length;
      ctx.fillStyle = '#d1121b';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`GHOSTS REMAINING: ${alive}`, W/2, H - 12);
    } else if (f.ghosts.filter(g => g.alive).length === 0 && f.roomIdx < 2) {
      ctx.fillStyle = '#7bff3a';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE TO EXIT PORTAL ▼', W/2, H - 12);
    }

    // Minimap (bottom-left)
    drawMinimap();

    ctx.textAlign = 'left';
  }

  function drawMinimap() {
    const f = fps;
    const ts = 5; // tile size in pixels
    const ox = 8, oy = H - MAP_H * ts - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ox - 2, oy - 2, MAP_W * ts + 4, MAP_H * ts + 4);
    for (let my = 0; my < MAP_H; my++) {
      for (let mx = 0; mx < MAP_W; mx++) {
        const cell = f.map[my][mx];
        if (cell === 1)      ctx.fillStyle = '#3a2a4a';
        else if (cell === 2) ctx.fillStyle = '#6a1010';
        else if (cell === 3) ctx.fillStyle = '#4a3030';
        else                 ctx.fillStyle = '#1a1520';
        ctx.fillRect(ox + mx * ts, oy + my * ts, ts - 1, ts - 1);
      }
    }
    // Ghosts on minimap
    for (const g of f.ghosts) {
      if (!g.alive) continue;
      ctx.fillStyle = '#d1121b';
      ctx.fillRect(ox + (g.x / TILE) * ts - 1, oy + (g.y / TILE) * ts - 1, 3, 3);
    }
    // Key
    if (f.keyPos && !f.hasKey) {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(ox + f.keyPos.x * ts - 1, oy + f.keyPos.y * ts - 1, 3, 3);
    }
    // Player
    ctx.fillStyle = '#7bff3a';
    ctx.fillRect(ox + f.px * ts - 2, oy + f.py * ts - 2, 4, 4);
    // Direction arrow
    ctx.strokeStyle = '#7bff3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + f.px * ts, oy + f.py * ts);
    ctx.lineTo(ox + f.px * ts + Math.cos(f.pAngle) * 6, oy + f.py * ts + Math.sin(f.pAngle) * 6);
    ctx.stroke();
  }

  // ================================================================
  //  SHARED SPRITE DRAWERS (used by Proton Panic top-down)
  // ================================================================
  function drawGhost(x, y, anim) {
    const wob = Math.sin(anim) * 2;
    ctx.fillStyle = '#f4f2ea';
    ctx.beginPath();
    ctx.arc(x, y - 4 + wob, 10, Math.PI, 0);
    ctx.lineTo(x + 10, y + 8 + wob);
    ctx.lineTo(x + 6, y + 4 + wob); ctx.lineTo(x + 2, y + 8 + wob);
    ctx.lineTo(x - 2, y + 4 + wob); ctx.lineTo(x - 6, y + 8 + wob);
    ctx.lineTo(x - 10, y + 4 + wob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 5, y - 5 + wob, 3, 3);
    ctx.fillRect(x + 2, y - 5 + wob, 3, 3);
  }
  function drawBooger(x, y, anim) {
    const wob = Math.sin(anim * 1.5) * 3;
    ctx.fillStyle = '#0d4a2e';
    ctx.beginPath(); ctx.arc(x + 2, y + 2 + wob, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7bff3a';
    ctx.beginPath(); ctx.arc(x, y + wob, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5ff6b';
    ctx.beginPath(); ctx.arc(x - 4, y - 4 + wob, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 4, y - 2 + wob, 2, 2); ctx.fillRect(x + 3, y - 2 + wob, 2, 2);
    ctx.fillRect(x - 3, y + 3 + wob, 6, 1);
  }
  function drawGhoul(x, y, anim) {
    const wob = Math.abs(Math.sin(anim * 2)) * 3;
    ctx.fillStyle = '#6a0a6a';
    ctx.beginPath();
    ctx.arc(x, y, 9, Math.PI, 0);
    ctx.lineTo(x + 9, y + 9 - wob); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x, y + 9);
    ctx.lineTo(x - 4, y + 5); ctx.lineTo(x - 9, y + 9 - wob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(x - 5, y - 4, 3, 3); ctx.fillRect(x + 2, y - 4, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 3, y + 2, 1, 2); ctx.fillRect(x - 1, y + 2, 1, 2);
    ctx.fillRect(x + 1, y + 2, 1, 2); ctx.fillRect(x + 3, y + 2, 1, 2);
  }
  function drawSkeleton(x, y, anim) {
    const wob = Math.sin(anim * 2) * 2;
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 4, y - 8 + wob, 8, 10);
    ctx.fillRect(x - 5, y - 14 + wob, 10, 7);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 12 + wob, 2, 2); ctx.fillRect(x + 1, y - 12 + wob, 2, 2);
    ctx.fillRect(x - 2, y - 8 + wob, 4, 1);
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 8, y - 6 + wob, 3, 2); ctx.fillRect(x + 5, y - 6 + wob, 3, 2);
    ctx.fillRect(x - 3, y + 2 + wob, 2, 4); ctx.fillRect(x + 1, y + 2 + wob, 2, 4);
    ctx.fillStyle = '#7bff3a';
    ctx.fillRect(x - 4, y - 16 + wob, 1, 2); ctx.fillRect(x - 1, y - 16 + wob, 1, 2);
    ctx.fillRect(x + 2, y - 16 + wob, 1, 2);
  }
  function drawSpit(x, y) {
    ctx.fillStyle = '#7bff3a';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5ff6b';
    ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawSlimer(x, y, r, color) {
    ctx.fillStyle = '#0d4a2e';
    ctx.beginPath(); ctx.arc(x + 3, y + 3, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color || '#7bff3a';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5ff6b';
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.3, r*0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.1, r*0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r*0.3, y - r*0.1, r*0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - r*0.25, y - r*0.1, r*0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r*0.35, y - r*0.1, r*0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(x - r*0.3, y + r*0.2, r*0.6, r*0.2);
  }
  function drawPizza(x, y) {
    ctx.fillStyle = '#e8b349';
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x - 10, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(x - 4, y - 2, 3, 3); ctx.fillRect(x + 2, y + 1, 3, 3); ctx.fillRect(x - 2, y + 4, 3, 3);
  }
  function drawBeer(x, y) {
    ctx.fillStyle = '#f5d76e'; ctx.fillRect(x - 7, y - 8, 14, 18);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 7, y - 11, 14, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 5, y - 4, 10, 1); ctx.fillRect(x - 5, y + 2, 10, 1);
    ctx.fillStyle = '#a8761d'; ctx.fillRect(x + 7, y - 5, 3, 8);
  }
  function drawSnack(x, y) {
    ctx.fillStyle = '#d1121b'; ctx.fillRect(x - 7, y - 9, 14, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 5, y - 7, 2, 2); ctx.fillRect(x + 1, y - 4, 2, 2);
    ctx.fillRect(x - 3, y + 2, 2, 2); ctx.fillRect(x + 3, y + 5, 2, 2);
    ctx.fillStyle = '#ffea00'; ctx.fillRect(x - 2, y - 2, 2, 2);
  }
  function drawPlayer() {
    const hurt = S.time < player.flashUntil && Math.floor(S.time * 20) % 2 === 0;
    const invinc = S.time < player.invincibleUntil && !hurt;
    const fx = player.x, fy = player.y;
    if (keys[' '] && player.shootCooldown > 0.1) {
      ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx, fy);
      ctx.lineTo(fx + player.facingX * 30, fy + player.facingY * 30); ctx.stroke();
    }
    ctx.fillStyle = hurt ? '#ff4444' : (invinc ? '#ffea00' : '#9b8b4f');
    ctx.fillRect(fx - 6, fy - 4, 12, 12);
    ctx.fillStyle = '#f1c27d'; ctx.fillRect(fx - 5, fy - 12, 10, 8);
    ctx.fillStyle = '#d1121b'; ctx.fillRect(fx - 5, fy - 12, 10, 2);
    ctx.fillStyle = '#000'; ctx.fillRect(fx - 3, fy - 8, 2, 2); ctx.fillRect(fx + 1, fy - 8, 2, 2);
    ctx.fillStyle = '#333'; ctx.fillRect(fx - 7, fy - 2, 3, 10);
    ctx.fillStyle = '#ffea00'; ctx.fillRect(fx - 6, fy + 1, 1, 1); ctx.fillRect(fx - 6, fy + 4, 1, 1);
    ctx.fillStyle = '#9b8b4f'; ctx.fillRect(fx - 4, fy + 8, 3, 4); ctx.fillRect(fx + 1, fy + 8, 3, 4);
    if (invinc) {
      ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx, fy, 16 + Math.sin(S.time * 12) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function drawBoss() {
    if (!boss) return;
    const bob = Math.sin(boss.anim * 2) * 5;
    const isEnraged = boss.phase === 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(boss.x, boss.y + boss.r + 4, boss.r, 6, 0, 0, Math.PI * 2); ctx.fill();
    drawSlimer(boss.x, boss.y + bob, boss.r, isEnraged ? '#c5ff6b' : '#7bff3a');
    ctx.fillStyle = isEnraged ? '#c5ff6b' : '#7bff3a';
    const armAng = Math.sin(boss.anim * 4);
    ctx.fillRect(boss.x - boss.r - 8, boss.y + bob + armAng * 6, 10, 6);
    ctx.fillRect(boss.x + boss.r - 2, boss.y + bob - armAng * 6, 10, 6);
  }

  // ================================================================
  //  SHARED SCREEN DRAWERS
  // ================================================================
  function drawScanlines() {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }

  function drawSelectScreen() {
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(123,255,58,${0.04 + (i % 4) * 0.015})`;
      ctx.fillRect((i * 67 + S.time * 15) % W, (i * 37) % H, 2, 2);
    }
    drawScanlines();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7bff3a';
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillText('THE ARCADE', W/2, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('SELECT A GAME ABOVE, THEN PRESS [SPACE]', W/2, 100);
    // Game A card
    ctx.fillStyle = currentGame === 'proton' ? '#1a3010' : '#0f150f';
    ctx.fillRect(60, 130, 230, 140);
    ctx.strokeStyle = currentGame === 'proton' ? '#7bff3a' : '#3a5a3a';
    ctx.lineWidth = 3; ctx.strokeRect(60, 130, 230, 140);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('GAME A', 175, 155);
    ctx.fillStyle = currentGame === 'proton' ? '#ffea00' : '#aaa';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('PROTON PANIC', 175, 180);
    drawSlimer(175, 220, 18);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('TOP-DOWN ARENA', 175, 258);
    // Game B card
    ctx.fillStyle = currentGame === 'haunted' ? '#10102a' : '#0e0e18';
    ctx.fillRect(350, 130, 230, 140);
    ctx.strokeStyle = currentGame === 'haunted' ? '#7bff3a' : '#2a2a5a';
    ctx.lineWidth = 3; ctx.strokeRect(350, 130, 230, 140);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('GAME B', 465, 155);
    ctx.fillStyle = currentGame === 'haunted' ? '#ffea00' : '#aaa';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('HAUNTED HOUSE', 465, 180);
    ctx.fillStyle = '#9933cc';
    ctx.font = '30px monospace';
    ctx.fillText('👻', 465, 230);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('FIRST-PERSON HORROR', 465, 258);
    // prompt
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#ffea00' : '#7bff3a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(currentGame === 'proton' ? 'PROTON PANIC SELECTED' : 'HAUNTED HOUSE SELECTED', W/2, 306);
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a';
    ctx.fillText('PRESS [SPACE] TO PLAY', W/2, 336);
    ctx.fillStyle = '#ffea00';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(`HI: PP=${S.highScore}  HH=${S.highScoreHaunted}`, W/2, 372);
    ctx.textAlign = 'left';
  }

  function drawTitle() {
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(123,255,58,${0.05 + (i % 5) * 0.02})`;
      ctx.fillRect((i * 67 + S.time * 20) % W, (i * 37) % H, 2, 2);
    }
    drawScanlines();

    if (currentGame === 'proton') {
      ctx.fillStyle = '#7bff3a'; ctx.font = 'bold 38px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('PROTON', W/2, 90);
      ctx.fillStyle = '#d1121b'; ctx.fillText('PANIC', W/2, 140);
      ctx.fillStyle = '#ffffff'; ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText('A SLIMERS MINI-GAME', W/2, 170);
      const pulse = Math.sin(S.time * 4) > 0;
      ctx.fillStyle = pulse ? '#ffea00' : '#7bff3a'; ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillText('PRESS [SPACE] TO START', W/2, 240);
      ctx.fillStyle = '#7bff3a'; ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('WASD MOVE · SPACE FIRE · P PAUSE · M MUTE', W/2, 272);
      if (document.body.classList.contains('touch-device')) {
        ctx.fillStyle = '#fff'; ctx.font = '8px "Press Start 2P", monospace'; ctx.fillText('TAP FIRE TO START', W/2, 298);
      }
      ctx.fillStyle = '#ffea00'; ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`HI-SCORE: ${S.highScore}`, W/2, 340);
      drawSlimer(W/2, 378 + Math.sin(S.time * 3) * 4, 18);
    } else {
      // Haunted House title
      ctx.fillStyle = '#9933cc'; ctx.font = 'bold 28px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('HAUNTED', W/2, 90);
      ctx.fillStyle = '#d1121b'; ctx.fillText('HOUSE', W/2, 130);
      ctx.fillStyle = '#7bff3a'; ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText('A SLIMERS GHOST-HUNTING ADVENTURE', W/2, 162);
      ctx.fillStyle = '#ffffff'; ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('3 ROOMS · KEYS · BOSS · ESCAPE', W/2, 185);
      const pulse = Math.sin(S.time * 4) > 0;
      ctx.fillStyle = pulse ? '#ffea00' : '#7bff3a'; ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillText('PRESS [SPACE] TO ENTER', W/2, 240);
      ctx.fillStyle = '#7bff3a'; ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText('WS MOVE · AD TURN · SPACE FIRE · P PAUSE', W/2, 264);
      ctx.fillStyle = '#fff'; ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText('FIND KEYS · CLEAR GHOSTS · REACH THE PORTAL', W/2, 284);
      ctx.fillStyle = '#ffea00'; ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`HI-SCORE: ${S.highScoreHaunted}`, W/2, 330);
      // spooky ghost emoji
      ctx.font = '40px monospace';
      ctx.fillText('👻', W/2, 378 + Math.sin(S.time * 3) * 4);
    }
    ctx.textAlign = 'left';
  }

  function drawLevelBG() {
    const tint = S.level === 1 ? '#1a1510' : S.level === 2 ? '#1a101a' : '#2a0a0a';
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    const ts = 32;
    for (let y = 44; y < H; y += ts) {
      for (let x = 0; x < W; x += ts) {
        if (((x / ts) + (y / ts)) % 2 === 0) ctx.fillRect(x, y, ts, ts);
      }
    }
    ctx.strokeStyle = '#7bff3a'; ctx.lineWidth = 2; ctx.strokeRect(4, 44, W - 8, H - 48);
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#7bff3a'; ctx.fillRect(0, 40, W, 2);
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#7bff3a'; ctx.textAlign = 'left'; ctx.fillText('HP', 12, 25);
    for (let i = 0; i < player.maxHp; i++) {
      const filled = i < player.hp;
      ctx.fillStyle = filled ? '#d1121b' : '#333'; ctx.fillRect(44 + i * 12, 14, 9, 13);
      ctx.fillStyle = filled ? '#ff4444' : '#555'; ctx.fillRect(45 + i * 12, 15, 7, 4);
    }
    ctx.fillStyle = '#ffea00'; ctx.textAlign = 'center';
    ctx.fillText(`SCORE ${String(S.score).padStart(6, '0')}`, W/2, 25);
    ctx.textAlign = 'right'; ctx.fillStyle = '#7bff3a';
    ctx.fillText(`LV ${S.level}/3`, W - 12, 25);
    if (boss) {
      const bw = 300, bh = 10, bx = W/2 - bw/2, by = H - 22;
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#d1121b'; ctx.fillRect(bx, by, (boss.hp / boss.maxHp) * bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = '8px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('SLIMER', W/2, by - 4);
    }
    let px = 12, py = H - 18;
    ctx.font = '8px "Press Start 2P", monospace'; ctx.textAlign = 'left';
    if (S.time < player.invincibleUntil) { ctx.fillStyle = '#ffea00'; ctx.fillText(`INVINC ${(player.invincibleUntil - S.time).toFixed(1)}s`, px, py); px += 120; }
    if (S.time < player.rapidFireUntil) { ctx.fillStyle = '#c5ff6b'; ctx.fillText(`RAPID ${(player.rapidFireUntil - S.time).toFixed(1)}s`, px, py); }
    ctx.textAlign = 'left';
  }

  function drawFlashText() {
    if (!S.flashText || S.time > S.flashText.until) { S.flashText = null; return; }
    const remaining = S.flashText.until - S.time;
    const alpha = Math.min(1, remaining * 2);
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center';
    ctx.fillStyle = '#d1121b'; ctx.fillRect(0, H/2 - 28, W, 56);
    ctx.fillStyle = '#ffea00'; ctx.fillRect(0, H/2 - 30, W, 2); ctx.fillRect(0, H/2 + 28, W, 2);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Press Start 2P", monospace';
    const txt = S.flashText.text;
    if (txt.length > 20) {
      const mid = Math.floor(txt.length / 2);
      let split = txt.indexOf(' ', mid - 4);
      if (split < 0) split = mid;
      ctx.fillText(txt.slice(0, split), W/2, H/2 - 2);
      ctx.fillText(txt.slice(split + 1), W/2, H/2 + 18);
    } else {
      ctx.fillText(txt, W/2, H/2 + 6);
    }
    ctx.restore(); ctx.textAlign = 'left';
  }

  function drawLevelClear() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7bff3a'; ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillText(currentGame === 'haunted' ? 'ROOM CLEARED!' : 'LEVEL CLEAR!', W/2, H/2 - 30);
    ctx.fillStyle = '#ffea00'; ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`SCORE ${S.score}`, W/2, H/2 + 10);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] TO CONTINUE', W/2, H/2 + 50);
    ctx.textAlign = 'left';
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d1121b'; ctx.font = 'bold 32px "Press Start 2P", monospace';
    ctx.fillText('GAME OVER', W/2, H/2 - 40);
    ctx.fillStyle = '#fff'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(currentGame === 'haunted' ? 'THE GHOSTS GOT YOU' : 'YOU GOT SLIMED', W/2, H/2 - 10);
    ctx.fillStyle = '#ffea00'; ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`FINAL SCORE ${S.score}`, W/2, H/2 + 20);
    const hsField = currentGame === 'proton' ? 'highScore' : 'highScoreHaunted';
    ctx.fillStyle = '#7bff3a'; ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`HI-SCORE ${S[hsField]}`, W/2, H/2 + 44);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a'; ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] TO RESTART', W/2, H/2 + 80);
    ctx.textAlign = 'left';
  }

  function drawVictory() {
    const hueShift = (S.time * 60) % 360;
    ctx.fillStyle = `hsl(${hueShift}, 40%, 10%)`; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const x = (i * 83 + S.time * 60) % W, y = (i * 47 + S.time * 120) % H;
      ctx.fillStyle = i % 3 === 0 ? '#7bff3a' : i % 3 === 1 ? '#d1121b' : '#ffea00';
      ctx.fillRect(x, y, 4, 4);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7bff3a'; ctx.font = 'bold 24px "Press Start 2P", monospace';
    ctx.fillText(currentGame === 'haunted' ? 'YOU ESCAPED!' : 'YOU BUSTED', W/2, 100);
    ctx.fillText(currentGame === 'haunted' ? 'THE HAUNTING!' : 'SLIMER!', W/2, 140);
    ctx.fillStyle = '#ffea00'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('PARTYING WITH SLIMER', W/2, 180);
    drawSlimer(W/2, 240, 30);
    ctx.fillStyle = '#fff'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`FINAL SCORE ${S.score}`, W/2, 300);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a'; ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] FOR TITLE', W/2, 340);
    ctx.textAlign = 'left';
  }

  // ================================================================
  //  MAIN LOOP
  // ================================================================
  function update(dt) {
    if (S.scene === 'select') { S.time += dt; return; }
    if (S.scene === 'title')  { S.time += dt; return; }
    if (S.scene === 'level_clear' || S.scene === 'gameover' || S.scene === 'victory') { S.time += dt; return; }

    if (currentGame === 'proton') updateProton(dt);
    else updateHaunted(dt);
  }

  function draw() {
    if (S.scene === 'select')  { drawSelectScreen(); return; }
    if (S.scene === 'title')   { drawTitle(); return; }
    if (S.scene === 'gameover') { drawGameOver(); return; }
    if (S.scene === 'victory')  { drawVictory(); return; }

    if (currentGame === 'haunted') {
      drawHaunted();
      if (S.scene === 'level_clear') drawLevelClear();
      return;
    }

    // Proton Panic draw
    drawLevelBG();
    for (const p of slimePuddles) {
      const a = Math.max(0, p.life / 4);
      ctx.fillStyle = `rgba(13,74,46,${0.6*a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(123,255,58,${0.5*a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r*0.65, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of pickups) {
      const by = Math.sin(p.anim) * 3;
      if (p.type === 'pizza') drawPizza(p.x, p.y + by);
      else if (p.type === 'beer') drawBeer(p.x, p.y + by);
      else if (p.type === 'snack') drawSnack(p.x, p.y + by);
    }
    for (const e of enemies) {
      if (e._spit) { drawSpit(e.x, e.y); continue; }
      if (e.type === 'ghost') drawGhost(e.x, e.y, e.anim);
      else if (e.type === 'booger') drawBooger(e.x, e.y, e.anim);
      else if (e.type === 'ghoul') drawGhoul(e.x, e.y, e.anim);
      else if (e.type === 'skeleton') drawSkeleton(e.x, e.y, e.anim);
    }
    drawBoss();
    for (const b of bullets) {
      ctx.fillStyle = '#ffea00'; ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
      ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    }
    drawPlayer();
    for (const p of particles) {
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.floor(p.life * 6));
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    drawScanlines();
    drawHUD();
    drawFlashText();
    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffea00'; ctx.font = '24px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W/2, H/2);
      ctx.font = '10px "Press Start 2P", monospace'; ctx.fillText('PRESS [P] TO RESUME', W/2, H/2 + 30);
      ctx.textAlign = 'left';
    }
    if (S.scene === 'level_clear') drawLevelClear();
  }

  // ================================================================
  //  LIFECYCLE & BOOT
  // ================================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.scene === 'play') S.paused = true;
  });
  try {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (!entry.isIntersecting && S.scene === 'play') S.paused = true; });
    }, { threshold: 0.1 });
    io.observe(canvas);
  } catch (e) { /* older browser */ }

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Start on select screen — or title if a game is already chosen via HTML picker
  S.scene = 'select';
  requestAnimationFrame(frame);

})();
