/* ==================================================
   SLIMERS — game.js
   "PROTON PANIC" — top-down ghost-busting arena
   ================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;   // 640
  const H = canvas.height;  // 400

  // ============ STATE ============
  const S = {
    scene: 'title',
    level: 1,
    score: 0,
    highScore: Number(localStorage.getItem('slimers_highscore_v1') || 0),
    paused: false,
    muted: false,
    time: 0,
    frame: 0,
    flashText: null,
  };

  // Update HUD high score on load
  const hsEl = document.getElementById('hsValue');
  if (hsEl) hsEl.textContent = S.highScore;

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
    } catch (e) { /* no audio available */ }
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
    shoot()  { beep(880, 0.06, 'square', 0.08); beep(600, 0.08, 'sawtooth', 0.05, 300); },
    hit()    { noiseBurst(0.08, 0.15); beep(200, 0.12, 'square', 0.1, 80); },
    pickup() { beep(660, 0.08, 'square', 0.15); setTimeout(() => beep(990, 0.1, 'square', 0.15), 60); setTimeout(() => beep(1320, 0.1, 'square', 0.15), 120); },
    hurt()   { beep(160, 0.2, 'sawtooth', 0.2, 60); noiseBurst(0.1, 0.1); },
    levelClear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'square', 0.18), i * 90)); },
    gameover()   { [330, 261, 196, 130].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.2), i * 150)); },
    victory()    { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'square', 0.2), i * 110)); },
    boss()       { beep(90, 0.4, 'sawtooth', 0.25); noiseBurst(0.3, 0.1); },
  };

  const TRACKS = {
    title:  { tempo: 140, bass: [196,196,0,233,220,220,0,196], lead: [587,0,523,0,494,0,466,440] },
    level1: { tempo: 170, bass: [220,220,330,220,220,220,294,220], lead: [440,523,440,523,587,523,494,440] },
    level2: { tempo: 185, bass: [196,220,247,220,196,220,247,261], lead: [392,440,494,440,392,440,494,523] },
    boss:   { tempo: 200, bass: [110,110,110,0,110,147,147,165], lead: [220,0,294,247,220,0,294,330] },
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

  // ============ ENTITIES ============
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
      for (let i = 0; i < 5; i++) enemies.push(makeEnemy('skeleton', W*0.75 + rand(-30, 30), H*0.4 + rand(-30, 30)));
      pickups.push(makePickup('beer', W*0.2, H*0.25));
      pickups.push(makePickup('snack', W*0.8, H*0.8));
    } else if (n === 3) {
      boss = { x: W/2, y: 110, r: 40, hp: 40, maxHp: 40, phase: 1, vx: 2, vy: 0.6, spitCooldown: 1.2, anim: 0 };
      pickups.push(makePickup('pizza', 60, H - 60));
      pickups.push(makePickup('beer', W - 60, H - 60));
      pickups.push(makePickup('snack', W/2, H - 40));
    }
  }

  function startGame() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    S.level = 1; S.score = 0;
    spawnLevel(1);
    S.scene = 'play'; S.paused = false;
    startMusic('level1');
    canvas.focus();
    flash('LEVEL 1 — GET SLIMED', 1.5);
  }

  function nextLevel() {
    S.level++;
    if (S.level > 3) { win(); return; }
    spawnLevel(S.level);
    S.scene = 'play';
    startMusic(S.level === 3 ? 'boss' : 'level2');
    flash(S.level === 3 ? 'LEVEL 3 — SLIMER AWAITS' : `LEVEL ${S.level}`, 1.5);
  }

  function resetToTitle() {
    S.scene = 'title'; S.paused = false;
    stopMusic();
    startMusic('title');
  }

  function win() {
    S.scene = 'victory';
    if (S.score > S.highScore) {
      S.highScore = S.score;
      localStorage.setItem('slimers_highscore_v1', S.highScore);
      if (hsEl) hsEl.textContent = S.highScore;
    }
    flash('PARTYING WITH SLIMER', 3.0);
    stopMusic();
    SFX.victory();
  }

  function gameOver() {
    S.scene = 'gameover';
    if (S.score > S.highScore) {
      S.highScore = S.score;
      localStorage.setItem('slimers_highscore_v1', S.highScore);
      if (hsEl) hsEl.textContent = S.highScore;
    }
    stopMusic();
    SFX.gameover();
  }

  const rand = (a, b) => Math.random() * (b - a) + a;
  const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy); };
  const flash = (text, seconds) => { S.flashText = { text, until: S.time + seconds }; };

  const CHORUS_LINES = ['IF YOU SEE SOMETHING, SAY SOMETHING', 'PARTYING WITH SLIMER'];

  // ============ UPDATE ============
  function update(dt) {
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

  // ============ SPRITE DRAWING ============
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
    ctx.fillRect(x - 4, y - 2 + wob, 2, 2);
    ctx.fillRect(x + 3, y - 2 + wob, 2, 2);
    ctx.fillStyle = '#000';
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
    ctx.fillRect(x - 5, y - 4, 3, 3);
    ctx.fillRect(x + 2, y - 4, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 3, y + 2, 1, 2);
    ctx.fillRect(x - 1, y + 2, 1, 2);
    ctx.fillRect(x + 1, y + 2, 1, 2);
    ctx.fillRect(x + 3, y + 2, 1, 2);
  }
  function drawSkeleton(x, y, anim) {
    const wob = Math.sin(anim * 2) * 2;
    // body
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 4, y - 8 + wob, 8, 10);
    // head
    ctx.fillRect(x - 5, y - 14 + wob, 10, 7);
    // eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 12 + wob, 2, 2);
    ctx.fillRect(x + 1, y - 12 + wob, 2, 2);
    // mouth
    ctx.fillRect(x - 2, y - 8 + wob, 4, 1);
    // arms — stretched out, "moshing"
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 8, y - 6 + wob, 3, 2);
    ctx.fillRect(x + 5, y - 6 + wob, 3, 2);
    // legs
    ctx.fillRect(x - 3, y + 2 + wob, 2, 4);
    ctx.fillRect(x + 1, y + 2 + wob, 2, 4);
    // punk spikes
    ctx.fillStyle = '#7bff3a';
    ctx.fillRect(x - 4, y - 16 + wob, 1, 2);
    ctx.fillRect(x - 1, y - 16 + wob, 1, 2);
    ctx.fillRect(x + 2, y - 16 + wob, 1, 2);
  }
  function drawSpit(x, y) {
    ctx.fillStyle = '#7bff3a';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5ff6b';
    ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawSlimer(x, y, r, color) {
    // big slimer blob
    ctx.fillStyle = '#0d4a2e';
    ctx.beginPath(); ctx.arc(x + 3, y + 3, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color || '#7bff3a';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // highlight
    ctx.fillStyle = '#c5ff6b';
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.3, r*0.3, 0, Math.PI * 2); ctx.fill();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.1, r*0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r*0.3, y - r*0.1, r*0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - r*0.25, y - r*0.1, r*0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r*0.35, y - r*0.1, r*0.08, 0, Math.PI * 2); ctx.fill();
    // tongue / mouth
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(x - r*0.3, y + r*0.2, r*0.6, r*0.2);
  }
  function drawPizza(x, y) {
    ctx.fillStyle = '#e8b349';
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x - 10, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(x - 4, y - 2, 3, 3);
    ctx.fillRect(x + 2, y + 1, 3, 3);
    ctx.fillRect(x - 2, y + 4, 3, 3);
  }
  function drawBeer(x, y) {
    ctx.fillStyle = '#f5d76e';
    ctx.fillRect(x - 7, y - 8, 14, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 7, y - 11, 14, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 5, y - 4, 10, 1);
    ctx.fillRect(x - 5, y + 2, 10, 1);
    ctx.fillStyle = '#a8761d';
    ctx.fillRect(x + 7, y - 5, 3, 8);
  }
  function drawSnack(x, y) {
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(x - 7, y - 9, 14, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 5, y - 7, 2, 2);
    ctx.fillRect(x + 1, y - 4, 2, 2);
    ctx.fillRect(x - 3, y + 2, 2, 2);
    ctx.fillRect(x + 3, y + 5, 2, 2);
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(x - 2, y - 2, 2, 2);
  }
  function drawPlayer() {
    const hurt = S.time < player.flashUntil && Math.floor(S.time * 20) % 2 === 0;
    const invinc = S.time < player.invincibleUntil && !hurt;
    const fx = player.x, fy = player.y;

    // proton stream line if firing
    if (keys[' '] && player.shootCooldown > 0.1) {
      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + player.facingX * 30, fy + player.facingY * 30);
      ctx.stroke();
    }

    // body (khaki uniform)
    ctx.fillStyle = hurt ? '#ff4444' : (invinc ? '#ffea00' : '#9b8b4f');
    ctx.fillRect(fx - 6, fy - 4, 12, 12);
    // head
    ctx.fillStyle = '#f1c27d';
    ctx.fillRect(fx - 5, fy - 12, 10, 8);
    // helmet band
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(fx - 5, fy - 12, 10, 2);
    // eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(fx - 3, fy - 8, 2, 2);
    ctx.fillRect(fx + 1, fy - 8, 2, 2);
    // proton pack
    ctx.fillStyle = '#333';
    ctx.fillRect(fx - 7, fy - 2, 3, 10);
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(fx - 6, fy + 1, 1, 1);
    ctx.fillRect(fx - 6, fy + 4, 1, 1);
    // legs
    ctx.fillStyle = '#9b8b4f';
    ctx.fillRect(fx - 4, fy + 8, 3, 4);
    ctx.fillRect(fx + 1, fy + 8, 3, 4);

    // invincibility ring
    if (invinc) {
      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx, fy, 16 + Math.sin(S.time * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawBoss() {
    if (!boss) return;
    const bob = Math.sin(boss.anim * 2) * 5;
    const isEnraged = boss.phase === 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(boss.x, boss.y + boss.r + 4, boss.r, 6, 0, 0, Math.PI * 2); ctx.fill();
    drawSlimer(boss.x, boss.y + bob, boss.r, isEnraged ? '#c5ff6b' : '#7bff3a');
    // angry arms waving
    ctx.fillStyle = isEnraged ? '#c5ff6b' : '#7bff3a';
    const armAng = Math.sin(boss.anim * 4);
    ctx.fillRect(boss.x - boss.r - 8, boss.y + bob + armAng * 6, 10, 6);
    ctx.fillRect(boss.x + boss.r - 2, boss.y + bob - armAng * 6, 10, 6);
  }

  // ============ DRAW ============
  function drawScanlines() {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }

  function drawTitle() {
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, W, H);
    // subtle bg dots
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(123,255,58,${0.05 + (i % 5) * 0.02})`;
      const px = (i * 67 + S.time * 20) % W;
      const py = (i * 37) % H;
      ctx.fillRect(px, py, 2, 2);
    }
    drawScanlines();

    ctx.fillStyle = '#7bff3a';
    ctx.font = 'bold 38px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PROTON', W/2, 90);
    ctx.fillStyle = '#d1121b';
    ctx.fillText('PANIC', W/2, 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('A SLIMERS MINI-GAME', W/2, 170);

    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#ffea00' : '#7bff3a';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] TO START', W/2, 240);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('WASD MOVE · SPACE FIRE · P PAUSE · M MUTE', W/2, 272);

    if (document.body.classList.contains('touch-device')) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('TAP FIRE TO START', W/2, 298);
    }

    ctx.fillStyle = '#ffea00';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`HI-SCORE: ${S.highScore}`, W/2, 340);

    drawSlimer(W/2, 378 + Math.sin(S.time * 3) * 4, 18);
    ctx.textAlign = 'left';
  }

  function drawLevelBG() {
    const tint = S.level === 1 ? '#1a1510' : S.level === 2 ? '#1a101a' : '#2a0a0a';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    const ts = 32;
    for (let y = 44; y < H; y += ts) {
      for (let x = 0; x < W; x += ts) {
        if (((x / ts) + (y / ts)) % 2 === 0) ctx.fillRect(x, y, ts, ts);
      }
    }
    ctx.strokeStyle = '#7bff3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 44, W - 8, H - 48);
  }

  function drawHUD() {
    // top bar
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#7bff3a';
    ctx.fillRect(0, 40, W, 2);

    // HP hearts
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#7bff3a';
    ctx.textAlign = 'left';
    ctx.fillText('HP', 12, 25);
    for (let i = 0; i < player.maxHp; i++) {
      const filled = i < player.hp;
      ctx.fillStyle = filled ? '#d1121b' : '#333';
      ctx.fillRect(44 + i * 12, 14, 9, 13);
      ctx.fillStyle = filled ? '#ff4444' : '#555';
      ctx.fillRect(45 + i * 12, 15, 7, 4);
    }

    // Score
    ctx.fillStyle = '#ffea00';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE ${String(S.score).padStart(6, '0')}`, W/2, 25);

    // Level
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7bff3a';
    ctx.fillText(`LV ${S.level}/3`, W - 12, 25);

    // Boss HP bar
    if (boss) {
      const bw = 300, bh = 10;
      const bx = W/2 - bw/2, by = H - 22;
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#d1121b';
      ctx.fillRect(bx, by, (boss.hp / boss.maxHp) * bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SLIMER', W/2, by - 4);
    }

    // Power-up indicators
    let px = 12, py = H - 18;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    if (S.time < player.invincibleUntil) {
      const rem = player.invincibleUntil - S.time;
      ctx.fillStyle = '#ffea00';
      ctx.fillText(`INVINC ${rem.toFixed(1)}s`, px, py);
      px += 120;
    }
    if (S.time < player.rapidFireUntil) {
      const rem = player.rapidFireUntil - S.time;
      ctx.fillStyle = '#c5ff6b';
      ctx.fillText(`RAPID ${rem.toFixed(1)}s`, px, py);
    }
  }

  function drawFlashText() {
    if (!S.flashText || S.time > S.flashText.until) { S.flashText = null; return; }
    const remaining = S.flashText.until - S.time;
    const alpha = Math.min(1, remaining * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    // bg bar
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(0, H/2 - 28, W, 56);
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(0, H/2 - 30, W, 2);
    ctx.fillRect(0, H/2 + 28, W, 2);
    // text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    // wrap if too long
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
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawLevelClear() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7bff3a';
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillText('LEVEL CLEAR!', W/2, H/2 - 30);
    ctx.fillStyle = '#ffea00';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`SCORE ${S.score}`, W/2, H/2 + 10);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] TO CONTINUE', W/2, H/2 + 50);
    ctx.textAlign = 'left';
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d1121b';
    ctx.font = 'bold 32px "Press Start 2P", monospace';
    ctx.fillText('GAME OVER', W/2, H/2 - 40);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('YOU GOT SLIMED', W/2, H/2 - 10);
    ctx.fillStyle = '#ffea00';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`FINAL SCORE ${S.score}`, W/2, H/2 + 20);
    ctx.fillStyle = '#7bff3a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`HI-SCORE ${S.highScore}`, W/2, H/2 + 44);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] TO RESTART', W/2, H/2 + 80);
    ctx.textAlign = 'left';
  }

  function drawVictory() {
    // rainbow-ish party background
    const hueShift = (S.time * 60) % 360;
    ctx.fillStyle = `hsl(${hueShift}, 40%, 10%)`;
    ctx.fillRect(0, 0, W, H);
    // confetti slime
    for (let i = 0; i < 30; i++) {
      const x = (i * 83 + S.time * 60) % W;
      const y = (i * 47 + S.time * 120) % H;
      ctx.fillStyle = i % 3 === 0 ? '#7bff3a' : i % 3 === 1 ? '#d1121b' : '#ffea00';
      ctx.fillRect(x, y, 4, 4);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7bff3a';
    ctx.font = 'bold 24px "Press Start 2P", monospace';
    ctx.fillText('YOU BUSTED', W/2, 100);
    ctx.fillText('SLIMER!', W/2, 140);
    ctx.fillStyle = '#ffea00';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('PARTYING WITH SLIMER', W/2, 180);
    drawSlimer(W/2, 240, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`FINAL SCORE ${S.score}`, W/2, 300);
    const pulse = Math.sin(S.time * 4) > 0;
    ctx.fillStyle = pulse ? '#fff' : '#7bff3a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PRESS [SPACE] FOR TITLE', W/2, 340);
    ctx.textAlign = 'left';
  }

  function draw() {
    if (S.scene === 'title') {
      drawTitle();
      return;
    }

    drawLevelBG();

    // slime puddles
    for (const p of slimePuddles) {
      const a = Math.max(0, p.life / 4);
      ctx.fillStyle = `rgba(13,74,46,${0.6 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(123,255,58,${0.5 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.65, 0, Math.PI * 2); ctx.fill();
    }

    // pickups
    for (const p of pickups) {
      const by = Math.sin(p.anim) * 3;
      if (p.type === 'pizza')      drawPizza(p.x, p.y + by);
      else if (p.type === 'beer')  drawBeer(p.x, p.y + by);
      else if (p.type === 'snack') drawSnack(p.x, p.y + by);
    }

    // enemies
    for (const e of enemies) {
      if (e._spit) { drawSpit(e.x, e.y); continue; }
      if (e.type === 'ghost')    drawGhost(e.x, e.y, e.anim);
      else if (e.type === 'booger')  drawBooger(e.x, e.y, e.anim);
      else if (e.type === 'ghoul')   drawGhoul(e.x, e.y, e.anim);
      else if (e.type === 'skeleton')drawSkeleton(e.x, e.y, e.anim);
    }

    // boss
    drawBoss();

    // bullets (proton particles)
    for (const b of bullets) {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    }

    // player
    drawPlayer();

    // particles
    for (const p of particles) {
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.floor(p.life * 6));
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }

    drawScanlines();
    drawHUD();
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

    if (S.scene === 'level_clear') drawLevelClear();
    if (S.scene === 'gameover') drawGameOver();
    if (S.scene === 'victory') drawVictory();
  }

  // ============ MAIN LOOP ============
  let lastTime = performance.now();
  let running = true;

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.scene === 'play') S.paused = true;
  });

  // Pause game when section scrolls out of view
  try {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting && S.scene === 'play') S.paused = true;
      });
    }, { threshold: 0.1 });
    io.observe(canvas);
  } catch (e) { /* older browser */ }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    if (running) requestAnimationFrame(frame);
  }

  // Start on title screen
  resetToTitle();
  requestAnimationFrame(frame);

})();
