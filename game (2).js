/* ==================================================
   SLIMERS — game.js
   GAME A: "PROTON PANIC"  — top-down ghost-busting arena
   GAME B: "ECTO RACER"    — Mario Kart-style haunted road race
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
  let currentGame = 'proton'; // 'proton' | 'ecto'

  const S = {
    scene: 'select',
    level: 1,
    score: 0,
    highScore: Number(localStorage.getItem('slimers_highscore_v1') || 0),
    highScoreEcto: Number(localStorage.getItem('slimers_highscore_ecto_v1') || 0),
    paused: false,
    muted: false,
    time: 0,
    frame: 0,
    flashText: null,
  };

  const hsEl = document.getElementById('hsValue');
  function updateHSDisplay() {
    if (!hsEl) return;
    hsEl.textContent = currentGame === 'proton' ? S.highScore : S.highScoreEcto;
  }
  updateHSDisplay();

  // ============ GAME PICKER ============
  const legendEl = document.getElementById('gameLegend');
  const LEGENDS = {
    proton: `
      <h3>HOW TO BUST</h3>
      <ul>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — MOVE</li>
        <li><kbd>SPACE</kbd> — PROTON STREAM</li>
        <li><kbd>M</kbd> — MUTE &nbsp; <kbd>P</kbd> — PAUSE</li>
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
    ecto: `
      <h3>HOW TO DRIVE</h3>
      <ul>
        <li><kbd>A</kbd><kbd>D</kbd> — STEER</li>
        <li><kbd>W</kbd> — GAS &nbsp;&nbsp; <kbd>S</kbd> — BRAKE</li>
        <li><kbd>SPACE</kbd> — PROTON PACK</li>
        <li><kbd>M</kbd> — MUTE &nbsp; <kbd>P</kbd> — PAUSE</li>
      </ul>
      <h3>POWER-UPS</h3>
      <ul class="pickups">
        <li><span class="pu">🔧</span> WRENCH — +2 HP</li>
        <li><span class="pu">⚡</span> NITRO — SPEED BOOST</li>
        <li><span class="pu">🛡️</span> SHIELD — 4s INVINCIBLE</li>
      </ul>
      <h3>HAZARDS</h3>
      <ul>
        <li>🧟 ZOMBIE CAR — slow &amp; tough</li>
        <li>👻 GHOST CAR — phases &amp; fades</li>
        <li>💀 GHOUL RACER — fast &amp; shoots</li>
        <li>🟩 SLIMER — drops slime on road</li>
      </ul>`
  };

  function setLegend(game) { if (legendEl) legendEl.innerHTML = LEGENDS[game] || ''; }
  setLegend('proton');

  document.querySelectorAll('.game-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (S.scene === 'play') return;
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
          if (S.scene === 'title') startGame(); else resetToTitle();
        }
        if ((k === 'enter' || k === ' ') && S.scene === 'level_clear') nextLevel();
        if ((k === 'enter' || k === ' ') && S.scene === 'select') { S.scene = 'title'; startMusic('title'); }
      }
    };
  }
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));

  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.getAttribute('data-key').toLowerCase();
    const press   = (e) => { e.preventDefault(); keys[k] = true;  handleSceneAdvance(k); };
    const release = (e) => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('touchstart',  press,   { passive: false });
    btn.addEventListener('touchend',    release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup',   release);
    btn.addEventListener('mouseleave',release);
  });

  function handleSceneAdvance(k) {
    if (k !== ' ' && k !== 'enter') return;
    if (S.scene === 'title') startGame();
    else if (S.scene === 'gameover' || S.scene === 'victory') resetToTitle();
    else if (S.scene === 'level_clear') nextLevel();
    else if (S.scene === 'select') { S.scene = 'title'; startMusic('title'); }
  }

  // ============ AUDIO ============
  let audioCtx = null, masterGain = null, musicTimer = null;
  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.15;
      masterGain.connect(audioCtx.destination);
    } catch(e){}
  }
  function toggleMute() {
    S.muted = !S.muted;
    if (masterGain) masterGain.gain.value = S.muted ? 0 : 0.15;
  }
  function beep(freq, duration=0.1, type='square', gainVal=0.2, slideTo=null) {
    if (!audioCtx || S.muted) return;
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), audioCtx.currentTime + duration);
    g.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(g).connect(masterGain); osc.start(); osc.stop(audioCtx.currentTime + duration + 0.02);
  }
  function noiseBurst(duration=0.1, gainVal=0.2) {
    if (!audioCtx || S.muted) return;
    const buf = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * duration)), audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    src.connect(g).connect(masterGain); src.start();
  }

  const SFX = {
    shoot()      { beep(880,0.06,'square',0.08); beep(600,0.08,'sawtooth',0.05,300); },
    hit()        { noiseBurst(0.08,0.15); beep(200,0.12,'square',0.1,80); },
    pickup()     { beep(660,0.08,'square',0.15); setTimeout(()=>beep(990,0.1,'square',0.15),60); setTimeout(()=>beep(1320,0.1,'square',0.15),120); },
    hurt()       { beep(160,0.2,'sawtooth',0.2,60); noiseBurst(0.1,0.1); },
    levelClear() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'square',0.18),i*90)); },
    gameover()   { [330,261,196,130].forEach((f,i)=>setTimeout(()=>beep(f,0.25,'sawtooth',0.2),i*150)); },
    victory()    { [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'square',0.2),i*110)); },
    boss()       { beep(90,0.4,'sawtooth',0.25); noiseBurst(0.3,0.1); },
    engine()     { beep(80+Math.random()*20,0.05,'sawtooth',0.03); },
    slimeSplat() { beep(120,0.15,'sine',0.1,60); noiseBurst(0.12,0.08); },
    nitro()      { beep(440,0.1,'square',0.1); beep(660,0.08,'square',0.1); },
    crash()      { noiseBurst(0.25,0.3); beep(100,0.3,'sawtooth',0.2,40); },
  };

  // 8-bit tracks. Each has: tempo, bass, lead, and optional drums (k=kick,s=snare,h=hat,_=rest).
  // Lead arrays are at 16th-note resolution (16 entries per loop).  Bass and drums sync to it.
  const TRACKS = {
    title:  {
      tempo: 140,
      bass: [196,196, 0, 233, 220,220, 0, 196, 196,196, 0, 233, 220,220, 0, 196],
      lead: [587, 0, 523, 0, 494, 0, 466, 440, 587, 0, 523, 0, 494, 0, 440, 392],
      drums:'k_s_k__sk_s_k_s_',
    },
    level1: {
      tempo: 170,
      bass: [220,220,330,220, 220,220,294,220, 220,220,330,220, 247,247,294,220],
      lead: [440,523,440,523, 587,523,494,440, 440,523,440,523, 659,587,523,440],
      drums:'k_s_k__sk_s_k_s_',
    },
    level2: {
      tempo: 185,
      bass: [196,220,247,220, 196,220,247,261, 196,220,247,220, 196,220,261,196],
      lead: [392,440,494,440, 392,440,494,523, 587,523,494,440, 392,440,494,523],
      drums:'k_s_k_s_k_sskks_',
    },
    boss:   {
      tempo: 205,
      bass: [110,110,110, 0, 110,147,147,165, 110,110,131, 0, 110,147,165,147],
      lead: [220, 0, 294,247, 220, 0, 294,330, 220, 0, 247,294, 330, 0, 294,247],
      drums:'kkskskskkksk_sks',
    },

    // ECTO RACER tracks — funky, surf-rock ghostbusters vibe, intensifying per stage
    // Stage 1 — driving groove, mid tempo, just bass + lead + simple beat
    race1:  {
      tempo: 156,
      bass: [165,  0,165,  0, 196,  0,165,  0, 165,  0,165,247, 220,  0,196,  0],
      lead: [330,  0,392,  0, 330,294,  0,330, 392,  0,330,  0, 294,  0,330,  0],
      drums:'k_s_k_s_k_s_k_s_',
    },
    // Stage 2 — pickup tempo, busier lead, harder beat
    race2:  {
      tempo: 178,
      bass: [147,  0,175,147, 165,175,196,175, 147,  0,175,147, 196,175,220,175],
      lead: [294,349,294,349, 392,349,294,262, 294,349,392,440, 392,349,294,262],
      drums:'k_s_k_skk_s_kssk',
    },
    // Stage 3 — full intensity, fastest tempo, dense drums for the boss showdown
    race3:  {
      tempo: 200,
      bass: [110,110,131,  0, 110,147,165,131, 110,110,131,165, 196,165,131,110],
      lead: [220,247,294,247, 220,  0,294,330, 392,330,294,247, 220,294,330,392],
      drums:'kksk_skskks_skks',
    },
    // Final boss reprise — even more aggressive, used when Slimer is on screen during stage 3
    rboss:  {
      tempo: 218,
      bass: [110,  0,110,131, 110,  0,131,147, 110,  0,110,131, 165,147,131,110],
      lead: [220,330,247,330, 220,294,247,330, 392,330,294,247, 440,392,330,294],
      drums:'kksks_kskskskskk',
    },
  };

  function startMusic(trackName) {
    stopMusic();
    if (!audioCtx || S.muted) return;
    const t = TRACKS[trackName]; if (!t) return;
    const stepLen = 60 / t.tempo / 2; let step = 0;   // 16th notes
    musicTimer = setInterval(() => {
      if (S.muted || S.paused) return;
      const bL = t.bass.length, lL = t.lead.length;
      const bass = t.bass[step % bL];
      const lead = t.lead[step % lL];
      if (bass) {
        // Rich bass: triangle + sub octave saw
        beep(bass,        stepLen*0.95, 'triangle', 0.10);
        beep(bass / 2,    stepLen*0.95, 'sawtooth', 0.04);
      }
      if (lead) {
        beep(lead, stepLen*0.85, 'square', 0.07);
      }
      // Drums
      if (t.drums) {
        const d = t.drums[step % t.drums.length];
        if (d === 'k') {
          // Kick: low triangle pitch sweep
          beep(120, 0.08, 'triangle', 0.18, 50);
        } else if (d === 's') {
          // Snare: short noise burst
          noiseBurst(0.06, 0.10);
          beep(220, 0.04, 'square', 0.04, 110);
        } else if (d === 'h') {
          // Hat: high noise tick
          noiseBurst(0.02, 0.04);
        }
      }
      step++;
    }, stepLen * 1000);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  // ============ HELPERS ============
  const rand  = (a,b) => Math.random()*(b-a)+a;
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const flash = (text,seconds) => { S.flashText = { text, until: S.time+seconds }; };
  const CHORUS = ['IF YOU SEE SOMETHING, SAY SOMETHING','PARTYING WITH SLIMER'];

  // ============ ROUTER ============
  function startGame() {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (currentGame === 'proton') startProtonPanic();
    else erStart();
  }
  function nextLevel() {
    if (currentGame === 'proton') nextLevelProton();
    else erNextStage();
  }
  function resetToTitle() {
    S.scene = 'title'; S.paused = false;
    stopMusic(); startMusic('title'); updateHSDisplay();
  }
  function win() {
    S.scene = 'victory';
    const key   = currentGame === 'proton' ? 'slimers_highscore_v1' : 'slimers_highscore_ecto_v1';
    const field = currentGame === 'proton' ? 'highScore' : 'highScoreEcto';
    if (S.score > S[field]) { S[field] = S.score; localStorage.setItem(key, S[field]); }
    updateHSDisplay(); flash('PARTYING WITH SLIMER', 3.0); stopMusic(); SFX.victory();
  }
  function gameOver() {
    S.scene = 'gameover';
    const key   = currentGame === 'proton' ? 'slimers_highscore_v1' : 'slimers_highscore_ecto_v1';
    const field = currentGame === 'proton' ? 'highScore' : 'highScoreEcto';
    if (S.score > S[field]) { S[field] = S.score; localStorage.setItem(key, S[field]); }
    updateHSDisplay(); stopMusic(); SFX.gameover();
  }

  // ================================================================
  //  GAME A — PROTON PANIC  (unchanged)
  // ================================================================
  let player, bullets, enemies, pickups, particles, boss, slimePuddles;

  function resetWorld() {
    player = { x:W/2, y:H/2, r:10, hp:6, maxHp:10, facingX:1, facingY:0,
      invincibleUntil:0, rapidFireUntil:0, shootCooldown:0, slimeSlowUntil:0, flashUntil:0 };
    bullets=[]; enemies=[]; pickups=[]; particles=[]; slimePuddles=[]; boss=null; S.flashText=null;
  }
  function makeEnemy(type,x,y) {
    const base={x,y,vx:0,vy:0,hp:1,type,r:10,anim:Math.random()*Math.PI*2};
    if(type==='ghost')    return{...base,hp:2,speed:0.6};
    if(type==='booger')   return{...base,hp:3,speed:0.9,r:12};
    if(type==='ghoul')    return{...base,hp:2,speed:1.7,r:9};
    if(type==='skeleton') return{...base,hp:5,speed:1.1,r:11};
    return base;
  }
  const makePU=(type,x,y)=>({x,y,r:12,type,anim:0});
  function spawnLevel(n) {
    resetWorld();
    if(n===1){
      for(let i=0;i<5;i++) enemies.push(makeEnemy('ghost',rand(40,W-40),rand(80,H-40)));
      for(let i=0;i<2;i++) enemies.push(makeEnemy('booger',rand(40,W-40),rand(80,H-40)));
      pickups.push(makePU('pizza',W*0.3,H*0.7));
    } else if(n===2){
      for(let i=0;i<3;i++) enemies.push(makeEnemy('ghost',rand(40,W-40),rand(80,H-40)));
      for(let i=0;i<3;i++) enemies.push(makeEnemy('booger',rand(40,W-40),rand(80,H-40)));
      for(let i=0;i<3;i++) enemies.push(makeEnemy('ghoul',rand(40,W-40),rand(80,H-40)));
      for(let i=0;i<5;i++) enemies.push(makeEnemy('skeleton',W*0.75+rand(-30,30),H*0.4+rand(-30,30)));
      pickups.push(makePU('beer',W*0.2,H*0.25)); pickups.push(makePU('snack',W*0.8,H*0.8));
    } else if(n===3){
      boss={x:W/2,y:110,r:40,hp:60,maxHp:60,phase:1,vx:2.4,vy:0.7,spitCooldown:1.0,anim:0};
      pickups.push(makePU('pizza',60,H-60)); pickups.push(makePU('beer',W-60,H-60)); pickups.push(makePU('snack',W/2,H-40));
    }
  }
  function startProtonPanic() {
    S.level=1; S.score=0; spawnLevel(1); S.scene='play'; S.paused=false;
    startMusic('level1'); canvas.focus(); flash('LEVEL 1 — GET SLIMED',1.5);
  }
  function nextLevelProton() {
    S.level++;
    if(S.level>3){win();return;}
    spawnLevel(S.level); S.scene='play';
    startMusic(S.level===3?'boss':'level2');
    flash(S.level===3?'LEVEL 3 — SLIMER AWAITS':`LEVEL ${S.level}`,1.5);
  }
  function updateProton(dt) {
    S.time+=dt; S.frame++;
    if(S.paused||S.scene!=='play') return;
    let ax=0,ay=0;
    if(keys['w'])ay-=1; if(keys['s'])ay+=1; if(keys['a'])ax-=1; if(keys['d'])ax+=1;
    if(ax||ay){
      const mag=Math.sqrt(ax*ax+ay*ay);
      player.facingX=ax/mag; player.facingY=ay/mag;
      let speed=160; if(S.time<player.slimeSlowUntil) speed*=0.4;
      player.x+=(ax/mag)*speed*dt; player.y+=(ay/mag)*speed*dt;
    }
    player.x=Math.max(player.r,Math.min(W-player.r,player.x));
    player.y=Math.max(player.r+44,Math.min(H-player.r,player.y));
    player.shootCooldown-=dt;
    const fireRate=S.time<player.rapidFireUntil?0.08:0.22;
    if(keys[' ']&&player.shootCooldown<=0){
      player.shootCooldown=fireRate;
      let dx=player.facingX,dy=player.facingY;
      if(dx===0&&dy===0) dx=1;
      bullets.push({x:player.x,y:player.y,vx:dx*420,vy:dy*420,life:0.8}); SFX.shoot();
    }
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i]; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H){bullets.splice(i,1);continue;}
      let hit=false;
      for(let j=enemies.length-1;j>=0;j--){
        const e=enemies[j]; if(e._spit) continue;
        if(Math.sqrt((b.x-e.x)**2+(b.y-e.y)**2)<e.r+3){
          e.hp--; particles.push({x:b.x,y:b.y,vx:rand(-50,50),vy:rand(-50,50),life:0.3,color:'#7bff3a'}); SFX.hit();
          if(e.hp<=0){
            S.score+=(e.type==='skeleton'?50:e.type==='ghoul'?30:e.type==='booger'?25:15);
            if(e.type==='booger') slimePuddles.push({x:e.x,y:e.y,r:22,life:4});
            for(let p=0;p<12;p++) particles.push({x:e.x,y:e.y,vx:rand(-120,120),vy:rand(-120,120),life:0.5,color:e.type==='booger'?'#7bff3a':'#fff'});
            enemies.splice(j,1);
          }
          hit=true; break;
        }
      }
      if(!hit&&boss&&Math.sqrt((b.x-boss.x)**2+(b.y-boss.y)**2)<boss.r+3){
        boss.hp--; particles.push({x:b.x,y:b.y,vx:rand(-60,60),vy:rand(-60,60),life:0.3,color:'#d1121b'}); SFX.hit(); hit=true;
        if(boss.hp<=0){
          S.score+=500;
          for(let p=0;p<60;p++) particles.push({x:boss.x+rand(-20,20),y:boss.y+rand(-20,20),vx:rand(-300,300),vy:rand(-300,300),life:1.2,color:'#7bff3a'});
          boss=null; flash('PARTYING WITH SLIMER',2.5); setTimeout(()=>win(),1500);
        } else if(boss.hp<boss.maxHp/2&&boss.phase===1){boss.phase=2;boss.vx*=1.4;SFX.boss();flash('SLIMER IS ENRAGED',1.5);}
      }
      if(hit) bullets.splice(i,1);
    }
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      if(e._spit){
        e.x+=e.vx*dt; e.y+=e.vy*dt;
        if(e.x<-20||e.x>W+20||e.y<20||e.y>H+20){enemies.splice(i,1);continue;}
        if(S.time>=player.invincibleUntil&&Math.sqrt((player.x-e.x)**2+(player.y-e.y)**2)<player.r+e.r){
          player.hp--; player.invincibleUntil=S.time+1.0; player.flashUntil=S.time+0.4; SFX.hurt(); enemies.splice(i,1);
          if(player.hp<=0){gameOver();return;}
        }
        continue;
      }
      e.anim+=dt*4;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      if(e.type==='skeleton'){e.x+=(dx/d)*e.speed*40*dt+Math.sin(S.time*3+e.anim)*20*dt;e.y+=(dy/d)*e.speed*40*dt+Math.cos(S.time*3+e.anim)*20*dt;}
      else{e.x+=(dx/d)*e.speed*50*dt;e.y+=(dy/d)*e.speed*50*dt;}
      if(S.time>=player.invincibleUntil&&Math.sqrt((player.x-e.x)**2+(player.y-e.y)**2)<player.r+e.r){
        player.hp--; player.invincibleUntil=S.time+1.0; player.flashUntil=S.time+0.4; SFX.hurt();
        player.x-=(dx/d)*20; player.y-=(dy/d)*20;
        if(player.hp<=0){gameOver();return;}
      }
    }
    if(boss){
      boss.anim+=dt; boss.x+=boss.vx; boss.y+=boss.vy;
      if(boss.x<boss.r+20||boss.x>W-boss.r-20) boss.vx*=-1;
      if(boss.y<boss.r+50||boss.y>H/2) boss.vy*=-1;
      boss.spitCooldown-=dt;
      if(boss.spitCooldown<=0){
        boss.spitCooldown=boss.phase===2?0.5:1.0;
        const bdx=player.x-boss.x,bdy=player.y-boss.y,spits=boss.phase===2?5:2;
        for(let k=0;k<spits;k++){
          const ang=Math.atan2(bdy,bdx)+(k-(spits-1)/2)*0.22;
          enemies.push({x:boss.x,y:boss.y+boss.r,vx:Math.cos(ang)*180,vy:Math.sin(ang)*180,hp:1,type:'spit',r:8,anim:0,_spit:true});
        }
      }
      if(S.time>=player.invincibleUntil&&Math.sqrt((player.x-boss.x)**2+(player.y-boss.y)**2)<player.r+boss.r){
        player.hp-=2; player.invincibleUntil=S.time+1.0; player.flashUntil=S.time+0.4; SFX.hurt();
        if(player.hp<=0){gameOver();return;}
      }
    }
    for(let i=slimePuddles.length-1;i>=0;i--){
      const p=slimePuddles[i]; p.life-=dt;
      if(Math.sqrt((player.x-p.x)**2+(player.y-p.y)**2)<player.r+p.r) player.slimeSlowUntil=Math.max(player.slimeSlowUntil,S.time+0.3);
      if(p.life<=0) slimePuddles.splice(i,1);
    }
    for(let i=pickups.length-1;i>=0;i--){
      const p=pickups[i]; p.anim+=dt*3;
      if(Math.sqrt((player.x-p.x)**2+(player.y-p.y)**2)<player.r+p.r){
        SFX.pickup();
        if(p.type==='pizza')      player.hp=Math.min(player.maxHp,player.hp+2);
        else if(p.type==='beer')  player.invincibleUntil=S.time+3.0;
        else if(p.type==='snack') player.rapidFireUntil=S.time+5.0;
        flash(CHORUS[Math.floor(Math.random()*CHORUS.length)],1.6); S.score+=20; pickups.splice(i,1);
      }
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life-=dt;
      if(p.life<=0) particles.splice(i,1);
    }
    if(S.level<3&&enemies.filter(e=>!e._spit).length===0){SFX.levelClear();S.scene='level_clear';stopMusic();}
  }


  // ================================================================
  //  GAME B — ECTO RACER  (simple 2D top-down highway racer)
  //
  //  Ecto-1 drives down a scrolling highway.
  //  A/D or LEFT/RIGHT to steer between 5 lanes.
  //  SPACE to fire proton pack forward.
  //  Dodge/shoot zombie cars, ghost cars, ghoul cars.
  //  Slimer flies in from the top, drops slime blobs.
  //  Collect power-ups.  Survive as long as possible.
  // ================================================================

  // Road layout constants
  const NUM_LANES  = 5;
  const LANE_W     = 80;           // px per lane
  const ROAD_LEFT  = (W - NUM_LANES * LANE_W) / 2;  // 80
  const ROAD_RIGHT = ROAD_LEFT + NUM_LANES * LANE_W; // 560
  function laneX(lane) { return ROAD_LEFT + lane * LANE_W + LANE_W / 2; }

  // Ecto Racer state
  let ER = {};

  function erInit() {
    ER = {
      // Player car
      car: {
        lane: 2,             // 0-4
        x: laneX(2),
        y: H - 80,
        w: 34, h: 56,
        hp: 6, maxHp: 6,
        invincUntil: 0,
        flashUntil: 0,
        nitroUntil: 0,
        shieldUntil: 0,
        slimedUntil: 0,
        moveCooldown: 0,     // lane-change debounce
        shootCooldown: 0,
      },
      // Scrolling road
      roadOffset: 0,
      // Enemies, pickups, hazards
      enemies:    [],
      bullets:    [],
      pickups:    [],
      slimeBlobs: [],        // on-road puddles
      slimeDrips: [],        // Slimer spit projectiles
      particles:  [],
      // Slimer boss
      slimer: null,
      // Spawning
      spawnTimer:   0,
      spawnRate:    1.15,
      pickupTimer:  0,
      pickupRate:   8,
      slimerTimer:  9,
      // Scoring / progression
      distance:  0,          // px scrolled = score base
      stage:     1,
      stageDist: 0,          // distance within current stage
      stageLen:  4200,       // px before next stage
      speed:     260,        // base scroll speed px/s
      gameTime:  0,
    };
  }

  function erStart() {
    S.level = 1; S.score = 0;
    erInit();
    S.scene = 'play'; S.paused = false;
    startMusic('race1');
    canvas.focus();
    flash('STAGE 1 — SPOOK ROAD', 2.0);
  }

  // Called when stage clear screen dismissed
  function erNextStage() {
    ER.stage++;
    if (ER.stage > 3) { win(); return; }
    // Keep car hp, reset spawn timers, increase speed
    ER.stageDist  = 0;
    ER.speed     += 80;
    ER.spawnRate  = Math.max(0.45, ER.spawnRate - 0.30);
    ER.enemies    = [];
    ER.slimeDrips = [];
    ER.slimeBlobs = [];
    ER.slimer     = null;
    ER.slimerTimer = ER.stage === 3 ? 5 : 8;   // boss appears earlier on final stage
    S.scene = 'play';
    // Each stage gets its own intensifying track
    const tracks = { 1:'race1', 2:'race2', 3:'race3' };
    startMusic(tracks[ER.stage] || 'race1');
    const names = ['','STAGE 1 — SPOOK ROAD','STAGE 2 — GRAVEYARD RUN','STAGE 3 — SLIMER SHOWDOWN'];
    flash(names[ER.stage] || `STAGE ${ER.stage}`, 2.0);
  }

  // ---- UPDATE ----
  function updateEcto(dt) {
    S.time += dt; S.frame++;
    if (S.paused || S.scene !== 'play') return;

    const car = ER.car;
    ER.gameTime += dt;

    // --- SCROLL ---
    const spd = S.time < car.nitroUntil ? ER.speed * 1.7
              : S.time < car.slimedUntil ? ER.speed * 0.45
              : ER.speed;
    ER.roadOffset  = (ER.roadOffset + spd * dt) % 80;
    ER.distance   += spd * dt;
    ER.stageDist  += spd * dt;

    // Stage progression
    if (ER.stageDist >= ER.stageLen) {
      ER.stageDist = 0;
      S.score += 500;
      SFX.levelClear();
      S.scene = 'level_clear';
      stopMusic();
      return;
    }

    // --- STEER ---
    car.moveCooldown -= dt;
    if (car.moveCooldown <= 0) {
      if ((keys['a'] || keys['arrowleft']) && car.lane > 0) {
        car.lane--; car.moveCooldown = 0.18;
      } else if ((keys['d'] || keys['arrowright']) && car.lane < NUM_LANES - 1) {
        car.lane++; car.moveCooldown = 0.18;
      }
    }
    // Smooth x toward lane center
    const targetX = laneX(car.lane);
    car.x += (targetX - car.x) * Math.min(1, dt * 14);

    // --- SHOOT ---
    car.shootCooldown -= dt;
    if (keys[' '] && car.shootCooldown <= 0) {
      car.shootCooldown = 0.25;
      ER.bullets.push({ x: car.x, y: car.y - car.h / 2 - 6, w: 6, h: 16, vy: -520 });
      SFX.shoot();
    }

    // --- BULLETS ---
    for (let i = ER.bullets.length - 1; i >= 0; i--) {
      const b = ER.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20) { ER.bullets.splice(i, 1); continue; }
      // Hit enemies
      let hit = false;
      for (let j = ER.enemies.length - 1; j >= 0; j--) {
        const e = ER.enemies[j];
        if (rectsOverlap(b.x - 3, b.y - 8, 6, 16, e.x - e.w/2, e.y - e.h/2, e.w, e.h)) {
          e.hp--;
          spawnParticles(b.x, b.y, 5, e.type === 'slimer_car' ? '#7bff3a' : '#fff');
          SFX.hit();
          if (e.hp <= 0) {
            const pts = { zombie: 50, ghost: 40, ghoul: 70, slimer_car: 200 };
            S.score += pts[e.type] || 30;
            spawnParticles(e.x, e.y, 14, e.type === 'slimer_car' ? '#7bff3a' : '#d1121b');
            ER.enemies.splice(j, 1);
          }
          hit = true; break;
        }
      }
      // Hit Slimer boss
      if (!hit && ER.slimer && ER.slimer.alive) {
        const sl = ER.slimer;
        if (rectsOverlap(b.x-3, b.y-8, 6, 16, sl.x-sl.r, sl.y-sl.r, sl.r*2, sl.r*2)) {
          sl.hp--;
          spawnParticles(b.x, b.y, 6, '#7bff3a');
          SFX.hit();
          if (sl.hp <= 0) {
            sl.alive = false;
            S.score += 400;
            spawnParticles(sl.x, sl.y, 30, '#7bff3a');
            flash('SLIMER BUSTED!', 2.0);
            SFX.boss();
          } else if (sl.hp < sl.maxHp / 2 && sl.phase === 1) {
            sl.phase = 2; sl.speed *= 1.7; sl.spitRate *= 0.45;
            sl.vx *= 1.4;
            flash('SLIMER ENRAGED!', 1.5); SFX.boss();
          }
          hit = true;
        }
      }
      if (hit) ER.bullets.splice(i, 1);
    }

    // --- SPAWN ENEMIES ---
    ER.spawnTimer -= dt;
    if (ER.spawnTimer <= 0) {
      ER.spawnTimer = ER.spawnRate * (0.7 + Math.random() * 0.6);
      spawnEnemy();
    }

    // --- SPAWN PICKUPS ---
    ER.pickupTimer -= dt;
    if (ER.pickupTimer <= 0) {
      ER.pickupTimer = ER.pickupRate * (0.8 + Math.random() * 0.4);
      const types = ['wrench','nitro','shield'];
      const lane = Math.floor(Math.random() * NUM_LANES);
      ER.pickups.push({ x: laneX(lane), y: -30, type: types[Math.floor(Math.random()*types.length)], anim: 0 });
    }

    // --- SPAWN SLIMER ---
    ER.slimerTimer -= dt;
    if (ER.slimerTimer <= 0 && (!ER.slimer || !ER.slimer.alive)) {
      // Slimer appears more often each stage
      ER.slimerTimer = ER.stage === 3 ? 10 + Math.random() * 4
                     : ER.stage === 2 ? 13 + Math.random() * 5
                     :                  16 + Math.random() * 6;
      // Boss HP scales hard with stage: 1=18, 2=28, 3=45
      const hp = ER.stage === 3 ? 45 : ER.stage === 2 ? 28 : 18;
      // Boss spit cadence also scales (lower = more frequent)
      const spitRate = ER.stage === 3 ? 1.0 : ER.stage === 2 ? 1.35 : 1.7;
      ER.slimer = {
        x: ROAD_LEFT + Math.random() * (ROAD_RIGHT - ROAD_LEFT),
        y: -60,
        r: 36, hp, maxHp: hp,
        vx: (Math.random() - 0.5) * (140 + ER.stage * 30),
        vy: 80,
        alive: true, phase: 1,
        spitTimer: 0, spitRate,
        bounceTimer: 0, targetY: 80 + Math.random() * 100,
        anim: 0,
        speed: 90 + ER.stage * 25,
      };
      // On stage 3, switch to the boss-reprise track when Slimer arrives
      if (ER.stage === 3) startMusic('rboss');
    }

    // --- UPDATE ENEMIES ---
    for (let i = ER.enemies.length - 1; i >= 0; i--) {
      const e = ER.enemies[i];
      e.y += (spd + e.relSpeed) * dt;
      e.anim += dt * 3;
      if (e.y > H + 60) { ER.enemies.splice(i, 1); continue; }

      // Ghoul weaves
      if (e.type === 'ghoul') {
        e.x += e.vx * dt;
        if (e.x < ROAD_LEFT + e.w/2 || e.x > ROAD_RIGHT - e.w/2) e.vx *= -1;
      }

      // Collision with player
      if (S.time >= car.invincUntil && S.time >= car.shieldUntil) {
        if (rectsOverlap(car.x-car.w/2+4, car.y-car.h/2+4, car.w-8, car.h-8,
                         e.x-e.w/2, e.y-e.h/2, e.w, e.h)) {
          car.hp--;
          car.invincUntil = S.time + 1.2;
          car.flashUntil  = S.time + 0.4;
          spawnParticles(car.x, car.y, 10, '#ff4444');
          SFX.crash(); SFX.hurt();
          ER.enemies.splice(i, 1);
          if (car.hp <= 0) { gameOver(); return; }
        }
      }
    }

    // --- UPDATE SLIMER ---
    if (ER.slimer && ER.slimer.alive) {
      const sl = ER.slimer;
      sl.anim += dt * 3;

      // Drift side to side, hover near top third
      sl.x += sl.vx * dt;
      if (sl.x < ROAD_LEFT + sl.r)  { sl.x = ROAD_LEFT + sl.r;  sl.vx = Math.abs(sl.vx); }
      if (sl.x > ROAD_RIGHT - sl.r) { sl.x = ROAD_RIGHT - sl.r; sl.vx = -Math.abs(sl.vx); }
      if (sl.y < sl.targetY) sl.y += sl.speed * dt;
      else sl.y += Math.sin(S.time * 2) * 25 * dt;  // hover bob

      // Spit slime blobs
      sl.spitTimer -= dt;
      if (sl.spitTimer <= 0) {
        sl.spitTimer = sl.spitRate;
        // More drips when enraged or on later stages
        const baseDrips = sl.phase === 2 ? 4 : 2;
        const numDrips = baseDrips + (ER.stage - 1);   // st1: 2/4, st2: 3/5, st3: 4/6
        for (let k = 0; k < numDrips; k++) {
          const ang = Math.PI/2 + (k - (numDrips-1)/2) * 0.32;
          ER.slimeDrips.push({
            x: sl.x + (Math.random()-0.5)*sl.r,
            y: sl.y + sl.r,
            vx: Math.cos(ang) * 70 + (Math.random()-0.5)*50,
            vy: Math.sin(ang) * 220 + 100,
          });
        }
        SFX.slimeSplat();
      }

      // Touch damage
      if (S.time >= car.invincUntil && S.time >= car.shieldUntil) {
        const dx = car.x - sl.x, dy = car.y - sl.y;
        if (Math.sqrt(dx*dx+dy*dy) < sl.r + 20) {
          car.hp -= 2;
          car.invincUntil = S.time + 1.5;
          car.flashUntil  = S.time + 0.5;
          SFX.hurt(); SFX.crash();
          if (car.hp <= 0) { gameOver(); return; }
        }
      }
    }

    // --- SLIME DRIPS (airborne) ---
    for (let i = ER.slimeDrips.length - 1; i >= 0; i--) {
      const d = ER.slimeDrips[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > H + 10) {
        // Land — become road puddle
        ER.slimeBlobs.push({ x: d.x, y: d.y, life: 6, r: 28 });
        ER.slimeDrips.splice(i, 1); continue;
      }
      // Hit player
      if (S.time >= car.invincUntil && S.time >= car.shieldUntil) {
        const dx = car.x - d.x, dy = car.y - d.y;
        if (Math.sqrt(dx*dx+dy*dy) < 20) {
          car.slimedUntil = S.time + 3.5;
          car.invincUntil = S.time + 0.5;
          flash('SLIMED! SPEED REDUCED!', 1.2);
          SFX.slimeSplat();
          ER.slimeDrips.splice(i, 1);
        }
      }
    }

    // --- SLIME BLOBS ON ROAD (scroll with road) ---
    for (let i = ER.slimeBlobs.length - 1; i >= 0; i--) {
      const b = ER.slimeBlobs[i];
      b.y += spd * dt;   // scroll down with road
      b.life -= dt;
      if (b.y > H + 40 || b.life <= 0) { ER.slimeBlobs.splice(i, 1); continue; }
      // Slow player if overlapping
      if (S.time >= car.slimedUntil) {
        const dx = car.x - b.x, dy = car.y - b.y;
        if (Math.sqrt(dx*dx+dy*dy) < b.r + 18) {
          car.slimedUntil = S.time + 2.5;
          flash('SLIMED!', 1.0);
          SFX.slimeSplat();
        }
      }
    }

    // --- PICKUPS ---
    for (let i = ER.pickups.length - 1; i >= 0; i--) {
      const pu = ER.pickups[i];
      pu.y += spd * dt;
      pu.anim += dt * 4;
      if (pu.y > H + 30) { ER.pickups.splice(i, 1); continue; }
      const dx = car.x - pu.x, dy = car.y - pu.y;
      if (Math.sqrt(dx*dx+dy*dy) < 30) {
        SFX.pickup();
        if (pu.type === 'wrench')  { car.hp = Math.min(car.maxHp, car.hp + 2); flash('WRENCH! +2 HP', 1.2); }
        if (pu.type === 'nitro')   { car.nitroUntil  = S.time + 4.0; flash('NITRO BOOST!', 1.2); SFX.nitro(); }
        if (pu.type === 'shield')  { car.shieldUntil = S.time + 4.0; flash('SHIELD ACTIVATED!', 1.2); }
        S.score += 30;
        ER.pickups.splice(i, 1);
      }
    }

    // --- PARTICLES ---
    for (let i = ER.particles.length - 1; i >= 0; i--) {
      const p = ER.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.88; p.vy *= 0.88; p.life -= dt;
      if (p.life <= 0) ER.particles.splice(i, 1);
    }

    // Score ticks up with distance
    S.score = Math.max(S.score, Math.floor(ER.distance / 10));
  }

  function spawnEnemy() {
    const stage = ER.stage;
    const pool = stage === 1 ? ['zombie','zombie','ghost','ghost','ghoul']
               : stage === 2 ? ['zombie','ghost','ghoul','ghoul','ghost']
               :               ['ghoul','ghoul','ghost','zombie','ghoul'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const lane = Math.floor(Math.random() * NUM_LANES);
    const base = {
      x: laneX(lane), y: -55,
      w: 34, h: 52,
      type, anim: Math.random() * Math.PI * 2,
    };
    if (type === 'zombie')     { ER.enemies.push({...base, hp:5, relSpeed: -50}); }
    else if (type === 'ghost') { ER.enemies.push({...base, hp:2, relSpeed:  35, w:30, h:46}); }
    else                       { ER.enemies.push({...base, hp:3, relSpeed: 110, vx: (Math.random()-0.5)*150}); }
  }

  function spawnParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      ER.particles.push({
        x, y,
        vx: (Math.random()-0.5)*150,
        vy: (Math.random()-0.5)*150,
        life: 0.4 + Math.random()*0.3,
        color,
      });
    }
  }

  function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh) {
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  }

  function erSFX_slimeSplat() { beep(120,0.15,'sine',0.1,60); noiseBurst(0.12,0.08); }
  function erSFX_nitro()      { beep(440,0.1,'square',0.1); beep(660,0.08,'square',0.1); }
  function erSFX_crash()      { noiseBurst(0.25,0.3); beep(100,0.3,'sawtooth',0.2,40); }
  // expose on SFX object
  SFX.slimeSplat = erSFX_slimeSplat;
  SFX.nitro      = erSFX_nitro;
  SFX.crash      = erSFX_crash;

  // ---- DRAW ----
  function drawEcto() {
    const car = ER.car;

    // --- ROAD BACKGROUND ---
    // Grass on sides
    ctx.fillStyle = '#0d1a08';
    ctx.fillRect(0, 0, W, H);

    // Road surface
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    // Road edge stripes
    ctx.fillStyle = '#c82020';
    ctx.fillRect(ROAD_LEFT,     0, 4, H);
    ctx.fillRect(ROAD_RIGHT - 4, 0, 4, H);

    // Scrolling lane dividers
    ctx.fillStyle = 'rgba(255,240,0,0.55)';
    for (let lane = 1; lane < NUM_LANES; lane++) {
      const lx = ROAD_LEFT + lane * LANE_W;
      for (let y = -80 + ER.roadOffset; y < H + 80; y += 80) {
        ctx.fillRect(lx - 1, y, 2, 44);
      }
    }

    // Scrolling center double-yellow
    const midX = ROAD_LEFT + (NUM_LANES * LANE_W) / 2;
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(midX - 2, 0, 2, H);
    ctx.fillRect(midX + 1, 0, 2, H);

    // Grass detail: trees/tombstones scrolling on sides
    ctx.fillStyle = '#1a2a0a';
    for (let i = 0; i < 6; i++) {
      const ty = ((i * 130 + ER.roadOffset * 1.5) % (H + 100)) - 60;
      // Left trees
      ctx.fillStyle = '#1a3a0a'; ctx.fillRect(8, ty, 22, 40);
      ctx.fillStyle = '#0d2a06'; ctx.fillRect(14, ty + 40, 10, 20);
      // Right trees
      ctx.fillStyle = '#1a3a0a'; ctx.fillRect(W - 30, ty + 20, 22, 40);
      ctx.fillStyle = '#0d2a06'; ctx.fillRect(W - 24, ty + 60, 10, 20);
      // Tombstones (stage 2+)
      if (ER.stage >= 2) {
        const ty2 = ((i * 110 + 60 + ER.roadOffset * 1.2) % (H + 100)) - 60;
        ctx.fillStyle = '#4a4a5a'; ctx.fillRect(44, ty2, 16, 22);
        ctx.fillStyle = '#3a3a4a'; ctx.fillRect(46, ty2 - 8, 12, 10);
        ctx.fillStyle = '#666'; ctx.fillRect(52, ty2 + 4, 2, 8);  // cross
        ctx.fillRect(49, ty2 + 8, 8, 2);
      }
    }

    // --- SLIME BLOBS ON ROAD ---
    for (const b of ER.slimeBlobs) {
      const alpha = Math.min(0.8, b.life / 4);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#7bff3a';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c5ff6b';
      ctx.beginPath(); ctx.ellipse(b.x - b.r*0.25, b.y - b.r*0.1, b.r*0.38, b.r*0.18, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- PICKUPS ---
    for (const pu of ER.pickups) {
      const bob = Math.sin(pu.anim) * 4;
      ctx.save(); ctx.translate(pu.x, pu.y + bob);
      if (pu.type === 'wrench') {
        ctx.fillStyle = '#aaaaaa'; ctx.fillRect(-5, -10, 10, 20);
        ctx.fillRect(-8, -12, 16, 5); ctx.fillRect(-8, 7, 16, 5);
      } else if (pu.type === 'nitro') {
        ctx.fillStyle = '#ffea00';
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff8800'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('⚡', 0, 5); ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = '#4488ff';
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#88ccff';
        ctx.beginPath(); ctx.arc(-5, -4, 5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // --- ENEMY CARS ---
    for (const e of ER.enemies) {
      drawEnemyCar(e);
    }

    // --- SLIME DRIPS (falling) ---
    for (const d of ER.slimeDrips) {
      ctx.fillStyle = '#7bff3a';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 7, 10, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#c5ff6b';
      ctx.beginPath(); ctx.arc(d.x-2, d.y-3, 3, 0, Math.PI*2); ctx.fill();
    }

    // --- SLIMER ---
    if (ER.slimer && ER.slimer.alive) {
      drawSlimer2D();
    }

    // --- PROTON BULLETS ---
    for (const b of ER.bullets) {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(b.x - 3, b.y - 8, 6, 16);
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 6, 2, 12);
      // glow
      ctx.fillStyle = 'rgba(255,234,0,0.3)';
      ctx.fillRect(b.x - 5, b.y - 10, 10, 20);
    }

    // --- PARTICLES ---
    for (const p of ER.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.color;
      const s = Math.max(2, p.life * 8);
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    ctx.globalAlpha = 1;

    // --- ECTO-1 ---
    drawEcto1_2D(car);

    // --- HUD ---
    drawHUD_Ecto2D(car);
    drawFlashText();

    // Slime tint
    if (S.time < car.slimedUntil) {
      ctx.fillStyle = `rgba(123,255,58,${0.10 + Math.sin(S.time*7)*0.04})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Hurt flash
    if (S.time < car.flashUntil) {
      ctx.fillStyle = 'rgba(209,18,27,0.28)';
      ctx.fillRect(0, 0, W, H);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // Pause
    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ffea00'; ctx.font = '24px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W/2, H/2);
      ctx.font = '10px "Press Start 2P", monospace'; ctx.fillText('PRESS [P] TO RESUME', W/2, H/2+30);
      ctx.textAlign = 'left';
    }
  }

  function drawEnemyCar(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    const w = e.w, h = e.h;
    if (e.type === 'zombie') {
      // Rusty brown wreck
      ctx.fillStyle = '#5a2a10'; ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#3a1008'; ctx.fillRect(-w/2+1, -h/2+1, w-2, h*0.3);
      ctx.fillStyle = '#7a4020'; ctx.fillRect(-w/2, h*0.05, w, h*0.12);
      // Zombie hand
      ctx.fillStyle = '#7a9a40'; ctx.fillRect(-w/2-10, -2, 12, 6);
      // Wheels
      ctx.fillStyle = '#111';
      ctx.fillRect(-w/2-5, -h/3, 5, 10); ctx.fillRect(w/2, -h/3, 5, 10);
      ctx.fillRect(-w/2-5, h/6, 5, 10);  ctx.fillRect(w/2, h/6, 5, 10);
      // Windshield
      ctx.fillStyle = '#5a7060'; ctx.fillRect(-w/2+3, -h/2+3, w-6, h*0.28);
    } else if (e.type === 'ghost') {
      // Translucent ethereal car
      ctx.globalAlpha = 0.55 + Math.sin(S.time * 4 + e.anim) * 0.25;
      ctx.fillStyle = '#c0b0e0'; ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#9070cc'; ctx.fillRect(-w/2+1, -h/2+1, w-2, h*0.3);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-w/4-2, -h/4, w*0.2, w*0.2);
      ctx.fillRect(w*0.05, -h/4, w*0.2, w*0.2);
      ctx.fillStyle = '#111';
      ctx.fillRect(-w/2-4, -h/3, 4, 9); ctx.fillRect(w/2, -h/3, 4, 9);
      ctx.fillRect(-w/2-4, h/6, 4, 9);  ctx.fillRect(w/2, h/6, 4, 9);
      ctx.globalAlpha = 1;
    } else {
      // Ghoul — purple speed racer
      ctx.fillStyle = '#5a0880'; ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = '#8810bb'; ctx.fillRect(-w/2+1, -h/2+1, w-2, h*0.3);
      ctx.fillStyle = '#ffea00'; ctx.fillRect(-w/2+3, -h/3, w-6, h*0.18);
      // Flame decals
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(-w/2+3, h/4, w*0.28, h*0.26);
      ctx.fillRect(w/2-w*0.28-3, h/4, w*0.28, h*0.26);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(-w/2+5, h/4, w*0.15, h*0.18);
      ctx.fillRect(w/2-w*0.15-3, h/4, w*0.15, h*0.18);
      ctx.fillStyle = '#111';
      ctx.fillRect(-w/2-5, -h/3, 5, 10); ctx.fillRect(w/2, -h/3, 5, 10);
      ctx.fillRect(-w/2-5, h/6, 5, 10);  ctx.fillRect(w/2, h/6, 5, 10);
    }
    ctx.restore();
  }

  function drawSlimer2D() {
    const sl = ER.slimer;
    const r = sl.r;
    const bob = Math.sin(sl.anim * 1.5) * 5;
    const enraged = sl.phase === 2;

    ctx.save(); ctx.translate(sl.x, sl.y + bob);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(3, r+4, r*0.8, r*0.22, 0, 0, Math.PI*2); ctx.fill();

    // Body
    const wobble = Math.sin(sl.anim * 3) * r * 0.06;
    ctx.fillStyle = '#0d4a2e';
    ctx.beginPath(); ctx.ellipse(3, 3, r+wobble+2, r+2, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = enraged ? '#c5ff6b' : '#7bff3a';
    ctx.beginPath(); ctx.ellipse(0, 0, r+wobble, r, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#dfff9a';
    ctx.beginPath(); ctx.ellipse(-r*0.28, -r*0.28, r*0.32, r*0.18, 0, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r*0.28, -r*0.1, r*0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( r*0.28, -r*0.1, r*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-r*0.22, -r*0.08, r*0.1, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( r*0.34, -r*0.08, r*0.1, 0, Math.PI*2); ctx.fill();

    // Grin
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(-r*0.3, r*0.18, r*0.6, r*0.18);

    // Dripping slime arms
    ctx.fillStyle = enraged ? '#c5ff6b' : '#7bff3a';
    ctx.beginPath(); ctx.arc(-r-4, r*0.1, 10, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( r+4, r*0.1, 10, 0, Math.PI*2); ctx.fill();

    // HP bar
    if (sl.hp < sl.maxHp) {
      const bw = r*2.5;
      ctx.fillStyle = '#111'; ctx.fillRect(-bw/2, -r-18, bw, 9);
      ctx.fillStyle = enraged ? '#c5ff6b' : '#d1121b';
      ctx.fillRect(-bw/2, -r-18, (sl.hp/sl.maxHp)*bw, 9);
      ctx.fillStyle = '#fff'; ctx.font = '6px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('SLIMER', 0, -r-22); ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  function drawEcto1_2D(car) {
    const cx = car.x, cy = car.y;
    const hurt    = S.time < car.flashUntil   && Math.floor(S.time * 18) % 2 === 0;
    const shielded= S.time < car.shieldUntil;
    const nitro   = S.time < car.nitroUntil;
    const slimed  = S.time < car.slimedUntil;

    ctx.save(); ctx.translate(cx, cy);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 30, 18, 7, 0, 0, Math.PI*2); ctx.fill();

    // Body
    ctx.fillStyle = hurt ? '#ff9999' : slimed ? '#aaffaa' : '#e8e6d4';
    ctx.fillRect(-17, -28, 34, 56);

    // Red livery stripe
    ctx.fillStyle = '#d1121b';
    ctx.fillRect(-17, -8, 34, 8);

    // Roof rack + equipment
    ctx.fillStyle = '#888'; ctx.fillRect(-13, -34, 26, 9);
    ctx.fillStyle = '#ffea00'; ctx.fillRect(-11,-33,4,2); ctx.fillRect(-2,-33,4,2); ctx.fillRect(7,-33,4,2);

    // Proton cannon (right side of roof)
    ctx.fillStyle = '#555'; ctx.fillRect(14, -30, 10, 5);
    ctx.fillStyle = '#ffea00'; ctx.fillRect(22, -29, 4, 3);

    // Windshield
    ctx.fillStyle = '#88aacc'; ctx.fillRect(-12,-26,24,14);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-10,-24,8,6);

    // Side windows
    ctx.fillStyle = '#6080a0';
    ctx.fillRect(-13, -2, 11, 11); ctx.fillRect(2, -2, 11, 11);

    // Wheels
    ctx.fillStyle = '#181818';
    ctx.fillRect(-22,-20,6,12); ctx.fillRect(16,-20,6,12);
    ctx.fillRect(-22, 10,6,12); ctx.fillRect(16, 10,6,12);
    ctx.fillStyle = '#777';
    ctx.fillRect(-20,-18,3,8); ctx.fillRect(17,-18,3,8);
    ctx.fillRect(-20,12,3,8);  ctx.fillRect(17,12,3,8);

    // Headlights
    ctx.fillStyle = '#ffffc0'; ctx.fillRect(-14,-30,8,5); ctx.fillRect(6,-30,8,5);

    // Taillights
    ctx.fillStyle = '#ff2200'; ctx.fillRect(-14,24,7,4); ctx.fillRect(7,24,7,4);

    // Plate
    ctx.fillStyle = '#ffea00'; ctx.font = '5px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText('ECTO-1', 0, 33); ctx.textAlign = 'left';

    // Shield aura
    if (shielded) {
      ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(S.time*8)*0.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 28, 36, 0, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nitro flames
    if (nitro) {
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(-10, 28, 6, 9  + Math.random()*7);
      ctx.fillRect(  4, 28, 6, 9  + Math.random()*7);
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(-9,  28, 3, 6  + Math.random()*4);
      ctx.fillRect(  5, 28, 3, 6  + Math.random()*4);
    }

    // Proton fire VFX
    if (keys[' '] && car.shootCooldown > 0.12) {
      ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -70); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -70); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawHUD_Ecto2D(car) {
    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#7bff3a'; ctx.fillRect(0, 40, W, 2);

    // HP
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#7bff3a'; ctx.textAlign = 'left';
    ctx.fillText('HP', 12, 25);
    for (let i = 0; i < car.maxHp; i++) {
      const filled = i < car.hp;
      ctx.fillStyle = filled ? '#d1121b' : '#333'; ctx.fillRect(44+i*12, 14, 9, 13);
      ctx.fillStyle = filled ? '#ff4444' : '#555'; ctx.fillRect(45+i*12, 15, 7, 4);
    }

    // Score
    ctx.fillStyle = '#ffea00'; ctx.textAlign = 'center';
    ctx.fillText(`SCORE ${String(S.score).padStart(6,'0')}`, W/2, 25);

    // Stage / distance
    ctx.textAlign = 'right'; ctx.fillStyle = '#7bff3a';
    ctx.fillText(`STG ${ER.stage}/3`, W-12, 25);

    // Stage progress bar
    const pct = Math.min(1, ER.stageDist / ER.stageLen);
    ctx.fillStyle = '#111'; ctx.fillRect(W-140, H-28, 128, 10);
    ctx.fillStyle = '#7bff3a'; ctx.fillRect(W-140, H-28, pct*128, 10);
    ctx.fillStyle = '#fff'; ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'right'; ctx.fillText('STAGE', W-144, H-20);

    // Status effects
    ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'left';
    let xOff = 12;
    if (S.time < car.nitroUntil)   { ctx.fillStyle='#ffea00'; ctx.fillText(`NITRO ${(car.nitroUntil-S.time).toFixed(1)}s`,xOff,H-14); xOff+=115; }
    if (S.time < car.shieldUntil)  { ctx.fillStyle='#4488ff'; ctx.fillText(`SHIELD ${(car.shieldUntil-S.time).toFixed(1)}s`,xOff,H-14); xOff+=125; }
    if (S.time < car.slimedUntil)  { ctx.fillStyle='#7bff3a'; ctx.fillText(`SLIMED ${(car.slimedUntil-S.time).toFixed(1)}s`,xOff,H-14); }

    ctx.textAlign = 'left';
  }


  // ================================================================
  //  PROTON PANIC SPRITE DRAWERS (unchanged)
  // ================================================================
  function drawGhost(x,y,anim){const w=Math.sin(anim)*2;ctx.fillStyle='#f4f2ea';ctx.beginPath();ctx.arc(x,y-4+w,10,Math.PI,0);ctx.lineTo(x+10,y+8+w);ctx.lineTo(x+6,y+4+w);ctx.lineTo(x+2,y+8+w);ctx.lineTo(x-2,y+4+w);ctx.lineTo(x-6,y+8+w);ctx.lineTo(x-10,y+4+w);ctx.closePath();ctx.fill();ctx.fillStyle='#000';ctx.fillRect(x-5,y-5+w,3,3);ctx.fillRect(x+2,y-5+w,3,3);}
  function drawBooger(x,y,anim){const w=Math.sin(anim*1.5)*3;ctx.fillStyle='#0d4a2e';ctx.beginPath();ctx.arc(x+2,y+2+w,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7bff3a';ctx.beginPath();ctx.arc(x,y+w,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c5ff6b';ctx.beginPath();ctx.arc(x-4,y-4+w,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.fillRect(x-4,y-2+w,2,2);ctx.fillRect(x+3,y-2+w,2,2);ctx.fillRect(x-3,y+3+w,6,1);}
  function drawGhoul(x,y,anim){const w=Math.abs(Math.sin(anim*2))*3;ctx.fillStyle='#6a0a6a';ctx.beginPath();ctx.arc(x,y,9,Math.PI,0);ctx.lineTo(x+9,y+9-w);ctx.lineTo(x+4,y+5);ctx.lineTo(x,y+9);ctx.lineTo(x-4,y+5);ctx.lineTo(x-9,y+9-w);ctx.closePath();ctx.fill();ctx.fillStyle='#ffea00';ctx.fillRect(x-5,y-4,3,3);ctx.fillRect(x+2,y-4,3,3);ctx.fillStyle='#fff';ctx.fillRect(x-3,y+2,1,2);ctx.fillRect(x-1,y+2,1,2);ctx.fillRect(x+1,y+2,1,2);ctx.fillRect(x+3,y+2,1,2);}
  function drawSkeleton(x,y,anim){const w=Math.sin(anim*2)*2;ctx.fillStyle='#d8d2c4';ctx.fillRect(x-4,y-8+w,8,10);ctx.fillRect(x-5,y-14+w,10,7);ctx.fillStyle='#000';ctx.fillRect(x-3,y-12+w,2,2);ctx.fillRect(x+1,y-12+w,2,2);ctx.fillRect(x-2,y-8+w,4,1);ctx.fillStyle='#d8d2c4';ctx.fillRect(x-8,y-6+w,3,2);ctx.fillRect(x+5,y-6+w,3,2);ctx.fillRect(x-3,y+2+w,2,4);ctx.fillRect(x+1,y+2+w,2,4);ctx.fillStyle='#7bff3a';ctx.fillRect(x-4,y-16+w,1,2);ctx.fillRect(x-1,y-16+w,1,2);ctx.fillRect(x+2,y-16+w,1,2);}
  function drawSpit(x,y){ctx.fillStyle='#7bff3a';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c5ff6b';ctx.beginPath();ctx.arc(x-1,y-1,2,0,Math.PI*2);ctx.fill();}
  function drawSlimer(x,y,r,color){ctx.fillStyle='#0d4a2e';ctx.beginPath();ctx.arc(x+3,y+3,r+2,0,Math.PI*2);ctx.fill();ctx.fillStyle=color||'#7bff3a';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c5ff6b';ctx.beginPath();ctx.arc(x-r*.3,y-r*.3,r*.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x-r*.3,y-r*.1,r*.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+r*.3,y-r*.1,r*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(x-r*.25,y-r*.1,r*.08,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+r*.35,y-r*.1,r*.08,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d1121b';ctx.fillRect(x-r*.3,y+r*.2,r*.6,r*.2);}
  function drawPizza(x,y){ctx.fillStyle='#e8b349';ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x+10,y+8);ctx.lineTo(x-10,y+8);ctx.closePath();ctx.fill();ctx.fillStyle='#d1121b';ctx.fillRect(x-4,y-2,3,3);ctx.fillRect(x+2,y+1,3,3);ctx.fillRect(x-2,y+4,3,3);}
  function drawBeer(x,y){ctx.fillStyle='#f5d76e';ctx.fillRect(x-7,y-8,14,18);ctx.fillStyle='#fff';ctx.fillRect(x-7,y-11,14,4);ctx.fillStyle='#000';ctx.fillRect(x-5,y-4,10,1);ctx.fillRect(x-5,y+2,10,1);ctx.fillStyle='#a8761d';ctx.fillRect(x+7,y-5,3,8);}
  function drawSnack(x,y){ctx.fillStyle='#d1121b';ctx.fillRect(x-7,y-9,14,18);ctx.fillStyle='#fff';ctx.fillRect(x-5,y-7,2,2);ctx.fillRect(x+1,y-4,2,2);ctx.fillRect(x-3,y+2,2,2);ctx.fillRect(x+3,y+5,2,2);ctx.fillStyle='#ffea00';ctx.fillRect(x-2,y-2,2,2);}
  function drawPlayer(){const hurt=S.time<player.flashUntil&&Math.floor(S.time*20)%2===0;const inv=S.time<player.invincibleUntil&&!hurt;const fx=player.x,fy=player.y;if(keys[' ']&&player.shootCooldown>0.1){ctx.strokeStyle='#ffea00';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx+player.facingX*30,fy+player.facingY*30);ctx.stroke();}ctx.fillStyle=hurt?'#ff4444':inv?'#ffea00':'#9b8b4f';ctx.fillRect(fx-6,fy-4,12,12);ctx.fillStyle='#f1c27d';ctx.fillRect(fx-5,fy-12,10,8);ctx.fillStyle='#d1121b';ctx.fillRect(fx-5,fy-12,10,2);ctx.fillStyle='#000';ctx.fillRect(fx-3,fy-8,2,2);ctx.fillRect(fx+1,fy-8,2,2);ctx.fillStyle='#333';ctx.fillRect(fx-7,fy-2,3,10);ctx.fillStyle='#ffea00';ctx.fillRect(fx-6,fy+1,1,1);ctx.fillRect(fx-6,fy+4,1,1);ctx.fillStyle='#9b8b4f';ctx.fillRect(fx-4,fy+8,3,4);ctx.fillRect(fx+1,fy+8,3,4);if(inv){ctx.strokeStyle='#ffea00';ctx.lineWidth=2;ctx.beginPath();ctx.arc(fx,fy,16+Math.sin(S.time*12)*2,0,Math.PI*2);ctx.stroke();}}
  function drawPPBoss(){if(!boss)return;const bob=Math.sin(boss.anim*2)*5;const en=boss.phase===2;ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(boss.x,boss.y+boss.r+4,boss.r,6,0,0,Math.PI*2);ctx.fill();drawSlimer(boss.x,boss.y+bob,boss.r,en?'#c5ff6b':'#7bff3a');ctx.fillStyle=en?'#c5ff6b':'#7bff3a';const a=Math.sin(boss.anim*4);ctx.fillRect(boss.x-boss.r-8,boss.y+bob+a*6,10,6);ctx.fillRect(boss.x+boss.r-2,boss.y+bob-a*6,10,6);}

  // ================================================================
  //  SHARED SCREEN DRAWERS
  // ================================================================
  function drawScanlines(){ctx.fillStyle='rgba(0,0,0,0.18)';for(let y=0;y<H;y+=3)ctx.fillRect(0,y,W,1);}

  function drawSelectScreen(){
    ctx.fillStyle='#04060f';ctx.fillRect(0,0,W,H);
    for(let i=0;i<40;i++){ctx.fillStyle=`rgba(123,255,58,${0.04+(i%4)*0.015})`;ctx.fillRect((i*67+S.time*15)%W,(i*37)%H,2,2);}
    drawScanlines();
    ctx.textAlign='center';
    ctx.fillStyle='#7bff3a';ctx.font='bold 28px "Press Start 2P", monospace';ctx.fillText('THE ARCADE',W/2,70);
    ctx.fillStyle='#fff';ctx.font='9px "Press Start 2P", monospace';ctx.fillText('SELECT A GAME ABOVE, THEN PRESS [SPACE]',W/2,100);
    // Card A
    ctx.fillStyle=currentGame==='proton'?'#1a3010':'#0f150f';ctx.fillRect(60,130,230,140);
    ctx.strokeStyle=currentGame==='proton'?'#7bff3a':'#3a5a3a';ctx.lineWidth=3;ctx.strokeRect(60,130,230,140);
    ctx.fillStyle='#7bff3a';ctx.font='8px "Press Start 2P", monospace';ctx.fillText('GAME A',175,155);
    ctx.fillStyle=currentGame==='proton'?'#ffea00':'#aaa';ctx.font='11px "Press Start 2P", monospace';ctx.fillText('PROTON PANIC',175,180);
    drawSlimer(175,220,18);
    ctx.fillStyle='#7bff3a';ctx.font='7px "Press Start 2P", monospace';ctx.fillText('TOP-DOWN ARENA',175,258);
    // Card B
    ctx.fillStyle=currentGame==='ecto'?'#080a18':'#060608';ctx.fillRect(350,130,230,140);
    ctx.strokeStyle=currentGame==='ecto'?'#7bff3a':'#222240';ctx.lineWidth=3;ctx.strokeRect(350,130,230,140);
    ctx.fillStyle='#7bff3a';ctx.font='8px "Press Start 2P", monospace';ctx.fillText('GAME B',465,155);
    ctx.fillStyle=currentGame==='ecto'?'#ffea00':'#aaa';ctx.font='11px "Press Start 2P", monospace';ctx.fillText('ECTO RACER',465,180);
    // Mini Ecto-1
    ctx.save();ctx.translate(465,218);ctx.scale(0.6,0.6);
    ctx.fillStyle='#e8e6d4';ctx.fillRect(-14,-22,28,44);ctx.fillStyle='#d1121b';ctx.fillRect(-14,-6,28,6);
    ctx.fillStyle='#888';ctx.fillRect(-10,-28,20,8);ctx.fillStyle='#a0c8ff';ctx.fillRect(-10,-20,20,12);
    ctx.fillStyle='#222';ctx.fillRect(-18,-18,6,10);ctx.fillRect(12,-18,6,10);ctx.fillRect(-18,10,6,10);ctx.fillRect(12,10,6,10);
    ctx.restore();
    ctx.fillStyle='#7bff3a';ctx.font='7px "Press Start 2P", monospace';ctx.fillText('HAUNTED KART RACING',465,258);
    // Prompt
    const pulse=Math.sin(S.time*4)>0;
    ctx.fillStyle=pulse?'#ffea00':'#7bff3a';ctx.font='10px "Press Start 2P", monospace';
    ctx.fillText(currentGame==='proton'?'PROTON PANIC SELECTED':'ECTO RACER SELECTED',W/2,306);
    ctx.fillStyle=pulse?'#fff':'#7bff3a';ctx.fillText('PRESS [SPACE] TO PLAY',W/2,336);
    ctx.fillStyle='#ffea00';ctx.font='9px "Press Start 2P", monospace';
    ctx.fillText(`HI: PP=${S.highScore}  ER=${S.highScoreEcto}`,W/2,372);
    ctx.textAlign='left';
  }

  function drawTitle(){
    ctx.fillStyle='#04060f';ctx.fillRect(0,0,W,H);
    for(let i=0;i<40;i++){ctx.fillStyle=`rgba(123,255,58,${0.05+(i%5)*0.02})`;ctx.fillRect((i*67+S.time*20)%W,(i*37)%H,2,2);}
    drawScanlines();
    if(currentGame==='proton'){
      ctx.fillStyle='#7bff3a';ctx.font='bold 38px "Press Start 2P", monospace';ctx.textAlign='center';
      ctx.fillText('PROTON',W/2,90);ctx.fillStyle='#d1121b';ctx.fillText('PANIC',W/2,140);
      ctx.fillStyle='#fff';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('A SLIMERS MINI-GAME',W/2,170);
      const p=Math.sin(S.time*4)>0;
      ctx.fillStyle=p?'#ffea00':'#7bff3a';ctx.font='14px "Press Start 2P", monospace';ctx.fillText('PRESS [SPACE] TO START',W/2,240);
      ctx.fillStyle='#7bff3a';ctx.font='8px "Press Start 2P", monospace';ctx.fillText('WASD MOVE · SPACE FIRE · P PAUSE · M MUTE',W/2,272);
      ctx.fillStyle='#ffea00';ctx.font='10px "Press Start 2P", monospace';ctx.fillText(`HI-SCORE: ${S.highScore}`,W/2,340);
      drawSlimer(W/2,378+Math.sin(S.time*3)*4,18);
    } else {
      ctx.fillStyle='#4488ff';ctx.font='bold 32px "Press Start 2P", monospace';ctx.textAlign='center';
      ctx.fillText('ECTO',W/2,80);ctx.fillStyle='#7bff3a';ctx.fillText('RACER',W/2,126);
      ctx.fillStyle='#d1121b';ctx.font='8px "Press Start 2P", monospace';ctx.fillText('A SLIMERS HAUNTED KART ADVENTURE',W/2,158);
      ctx.save();ctx.translate(W/2,218);ctx.scale(1.4,1.4);
      ctx.fillStyle='#e8e6d4';ctx.fillRect(-14,-22,28,44);ctx.fillStyle='#d1121b';ctx.fillRect(-14,-6,28,6);
      ctx.fillStyle='#888';ctx.fillRect(-10,-28,20,8);ctx.fillStyle='#a0c8ff';ctx.fillRect(-10,-20,20,12);
      ctx.fillStyle='#222';ctx.fillRect(-18,-18,6,10);ctx.fillRect(12,-18,6,10);ctx.fillRect(-18,10,6,10);ctx.fillRect(12,10,6,10);
      ctx.fillStyle='#ffffc0';ctx.fillRect(-12,-25,7,4);ctx.fillRect(5,-25,7,4);
      ctx.restore();
      const p=Math.sin(S.time*4)>0;
      ctx.fillStyle=p?'#ffea00':'#7bff3a';ctx.font='13px "Press Start 2P", monospace';ctx.fillText('PRESS [SPACE] TO RACE',W/2,286);
      ctx.fillStyle='#7bff3a';ctx.font='7px "Press Start 2P", monospace';ctx.fillText('AD STEER · W GAS · S BRAKE · SPACE FIRE',W/2,308);
      ctx.fillStyle='#fff';ctx.font='7px "Press Start 2P", monospace';ctx.fillText('3 STAGES · ZOMBIE CARS · GHOST CARS · SLIMER',W/2,328);
      ctx.fillStyle='#ffea00';ctx.font='10px "Press Start 2P", monospace';ctx.fillText(`HI-SCORE: ${S.highScoreEcto}`,W/2,356);
      ctx.font='20px monospace';ctx.fillText('🧟 👻 💀 🟩',W/2,388);
    }
    ctx.textAlign='left';
  }

  function drawLevelBG(){const t=S.level===1?'#1a1510':S.level===2?'#1a101a':'#2a0a0a';ctx.fillStyle=t;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(255,255,255,0.025)';for(let y=44;y<H;y+=32)for(let x=0;x<W;x+=32)if(((x/32)+(y/32))%2===0)ctx.fillRect(x,y,32,32);ctx.strokeStyle='#7bff3a';ctx.lineWidth=2;ctx.strokeRect(4,44,W-8,H-48);}
  function drawHUD(){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,40);ctx.fillStyle='#7bff3a';ctx.fillRect(0,40,W,2);ctx.font='12px "Press Start 2P", monospace';ctx.fillStyle='#7bff3a';ctx.textAlign='left';ctx.fillText('HP',12,25);for(let i=0;i<player.maxHp;i++){const f=i<player.hp;ctx.fillStyle=f?'#d1121b':'#333';ctx.fillRect(44+i*12,14,9,13);ctx.fillStyle=f?'#ff4444':'#555';ctx.fillRect(45+i*12,15,7,4);}ctx.fillStyle='#ffea00';ctx.textAlign='center';ctx.fillText(`SCORE ${String(S.score).padStart(6,'0')}`,W/2,25);ctx.textAlign='right';ctx.fillStyle='#7bff3a';ctx.fillText(`LV ${S.level}/3`,W-12,25);if(boss){const bw=300,bh=10,bx=W/2-bw/2,by=H-22;ctx.fillStyle='#000';ctx.fillRect(bx-2,by-2,bw+4,bh+4);ctx.fillStyle='#333';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle='#d1121b';ctx.fillRect(bx,by,(boss.hp/boss.maxHp)*bw,bh);ctx.fillStyle='#fff';ctx.font='8px "Press Start 2P", monospace';ctx.textAlign='center';ctx.fillText('SLIMER',W/2,by-4);}let px=12,py=H-18;ctx.font='8px "Press Start 2P", monospace';ctx.textAlign='left';if(S.time<player.invincibleUntil){ctx.fillStyle='#ffea00';ctx.fillText(`INVINC ${(player.invincibleUntil-S.time).toFixed(1)}s`,px,py);px+=120;}if(S.time<player.rapidFireUntil){ctx.fillStyle='#c5ff6b';ctx.fillText(`RAPID ${(player.rapidFireUntil-S.time).toFixed(1)}s`,px,py);}ctx.textAlign='left';}
  function drawFlashText(){if(!S.flashText||S.time>S.flashText.until){S.flashText=null;return;}const rem=S.flashText.until-S.time;const alpha=Math.min(1,rem*2);ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';ctx.fillStyle='#d1121b';ctx.fillRect(0,H/2-28,W,56);ctx.fillStyle='#ffea00';ctx.fillRect(0,H/2-30,W,2);ctx.fillRect(0,H/2+28,W,2);ctx.fillStyle='#fff';ctx.font='bold 16px "Press Start 2P", monospace';const txt=S.flashText.text;if(txt.length>20){const mid=Math.floor(txt.length/2);let sp=txt.indexOf(' ',mid-4);if(sp<0)sp=mid;ctx.fillText(txt.slice(0,sp),W/2,H/2-2);ctx.fillText(txt.slice(sp+1),W/2,H/2+18);}else ctx.fillText(txt,W/2,H/2+6);ctx.restore();ctx.textAlign='left';}
  function drawLevelClear(){ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#7bff3a';ctx.font='bold 28px "Press Start 2P", monospace';ctx.fillText(currentGame==='ecto'?'STAGE CLEAR!':'LEVEL CLEAR!',W/2,H/2-30);ctx.fillStyle='#ffea00';ctx.font='14px "Press Start 2P", monospace';ctx.fillText(`SCORE ${S.score}`,W/2,H/2+10);const p=Math.sin(S.time*4)>0;ctx.fillStyle=p?'#fff':'#7bff3a';ctx.font='12px "Press Start 2P", monospace';ctx.fillText('PRESS [SPACE] TO CONTINUE',W/2,H/2+50);ctx.textAlign='left';}
  function drawGameOver(){ctx.fillStyle='rgba(0,0,0,0.85)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#d1121b';ctx.font='bold 32px "Press Start 2P", monospace';ctx.fillText('GAME OVER',W/2,H/2-40);ctx.fillStyle='#fff';ctx.font='12px "Press Start 2P", monospace';ctx.fillText(currentGame==='ecto'?'WRECKED ON SPOOK ROAD':'YOU GOT SLIMED',W/2,H/2-10);ctx.fillStyle='#ffea00';ctx.font='14px "Press Start 2P", monospace';ctx.fillText(`FINAL SCORE ${S.score}`,W/2,H/2+20);const hf=currentGame==='proton'?'highScore':'highScoreEcto';ctx.fillStyle='#7bff3a';ctx.font='10px "Press Start 2P", monospace';ctx.fillText(`HI-SCORE ${S[hf]}`,W/2,H/2+44);const p=Math.sin(S.time*4)>0;ctx.fillStyle=p?'#fff':'#7bff3a';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('PRESS [SPACE] TO RESTART',W/2,H/2+80);ctx.textAlign='left';}
  function drawVictory(){const hs=(S.time*60)%360;ctx.fillStyle=`hsl(${hs},40%,10%)`;ctx.fillRect(0,0,W,H);for(let i=0;i<30;i++){const x=(i*83+S.time*60)%W,y=(i*47+S.time*120)%H;ctx.fillStyle=i%3===0?'#7bff3a':i%3===1?'#d1121b':'#ffea00';ctx.fillRect(x,y,4,4);}ctx.textAlign='center';ctx.fillStyle='#7bff3a';ctx.font='bold 24px "Press Start 2P", monospace';ctx.fillText(currentGame==='ecto'?'RACE COMPLETE!':'YOU BUSTED',W/2,100);ctx.fillText(currentGame==='ecto'?'SLIMER SMOKED!':'SLIMER!',W/2,140);ctx.fillStyle='#ffea00';ctx.font='12px "Press Start 2P", monospace';ctx.fillText('PARTYING WITH SLIMER',W/2,180);drawSlimer(W/2,240,30);ctx.fillStyle='#fff';ctx.font='12px "Press Start 2P", monospace';ctx.fillText(`FINAL SCORE ${S.score}`,W/2,300);const p=Math.sin(S.time*4)>0;ctx.fillStyle=p?'#fff':'#7bff3a';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('PRESS [SPACE] FOR TITLE',W/2,340);ctx.textAlign='left';}

  // ================================================================
  //  MAIN LOOP
  // ================================================================
  function update(dt){
    if(S.scene==='select'||S.scene==='title'||S.scene==='level_clear'||S.scene==='gameover'||S.scene==='victory'){S.time+=dt;return;}
    if(currentGame==='proton') updateProton(dt); else updateEcto(dt);
  }

  function draw(){
    if(S.scene==='select')  {drawSelectScreen();return;}
    if(S.scene==='title')   {drawTitle();return;}
    if(S.scene==='gameover'){drawGameOver();return;}
    if(S.scene==='victory') {drawVictory();return;}

    if(currentGame==='ecto'){
      drawEcto();
      if(S.scene==='level_clear') drawLevelClear();
      return;
    }

    // Proton Panic
    drawLevelBG();
    for(const p of slimePuddles){const a=Math.max(0,p.life/4);ctx.fillStyle=`rgba(13,74,46,${0.6*a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(123,255,58,${0.5*a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r*.65,0,Math.PI*2);ctx.fill();}
    for(const p of pickups){const by=Math.sin(p.anim)*3;if(p.type==='pizza')drawPizza(p.x,p.y+by);else if(p.type==='beer')drawBeer(p.x,p.y+by);else if(p.type==='snack')drawSnack(p.x,p.y+by);}
    for(const e of enemies){if(e._spit){drawSpit(e.x,e.y);continue;}if(e.type==='ghost')drawGhost(e.x,e.y,e.anim);else if(e.type==='booger')drawBooger(e.x,e.y,e.anim);else if(e.type==='ghoul')drawGhoul(e.x,e.y,e.anim);else if(e.type==='skeleton')drawSkeleton(e.x,e.y,e.anim);}
    drawPPBoss();
    for(const b of bullets){ctx.fillStyle='#ffea00';ctx.fillRect(b.x-2,b.y-2,4,4);ctx.fillStyle='#fff';ctx.fillRect(b.x-1,b.y-1,2,2);}
    drawPlayer();
    for(const p of particles){ctx.fillStyle=p.color;const s=Math.max(1,Math.floor(p.life*6));ctx.fillRect(p.x-s/2,p.y-s/2,s,s);}
    drawScanlines(); drawHUD(); drawFlashText();
    if(S.paused){ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ffea00';ctx.font='24px "Press Start 2P", monospace';ctx.textAlign='center';ctx.fillText('PAUSED',W/2,H/2);ctx.font='10px "Press Start 2P", monospace';ctx.fillText('PRESS [P] TO RESUME',W/2,H/2+30);ctx.textAlign='left';}
    if(S.scene==='level_clear') drawLevelClear();
  }

  // ================================================================
  //  LIFECYCLE
  // ================================================================
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.scene==='play')S.paused=true;});
  try{const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(!e.isIntersecting&&S.scene==='play')S.paused=true;});},{threshold:0.1});io.observe(canvas);}catch(e){}

  let lastTime=performance.now();
  function frame(now){
    const dt=Math.min(0.05,(now-lastTime)/1000);
    lastTime=now; update(dt); draw();
    requestAnimationFrame(frame);
  }

  S.scene='select';
  requestAnimationFrame(frame);

})();
