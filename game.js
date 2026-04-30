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

  const TRACKS = {
    title:  { tempo:140, bass:[196,196,0,233,220,220,0,196],    lead:[587,0,523,0,494,0,466,440] },
    level1: { tempo:170, bass:[220,220,330,220,220,220,294,220], lead:[440,523,440,523,587,523,494,440] },
    level2: { tempo:185, bass:[196,220,247,220,196,220,247,261], lead:[392,440,494,440,392,440,494,523] },
    boss:   { tempo:200, bass:[110,110,110,0,110,147,147,165],   lead:[220,0,294,247,220,0,294,330] },
    race:   { tempo:160, bass:[165,165,196,165,165,165,220,185], lead:[330,0,392,0,330,294,0,330] },
    race2:  { tempo:180, bass:[147,147,175,147,147,147,196,165], lead:[294,0,349,0,294,262,0,294] },
    rboss:  { tempo:200, bass:[110,110,0,110,131,0,110,147],     lead:[220,0,262,247,220,0,247,261] },
  };

  function startMusic(trackName) {
    stopMusic();
    if (!audioCtx || S.muted) return;
    const t = TRACKS[trackName]; if (!t) return;
    const stepLen = 60 / t.tempo / 2; let step = 0;
    musicTimer = setInterval(() => {
      if (S.muted || S.paused) return;
      const bass = t.bass[step % t.bass.length];
      const lead = t.lead[step % t.lead.length];
      if (bass) beep(bass, stepLen*0.9, 'triangle', 0.08);
      if (lead) beep(lead, stepLen*0.8, 'square', 0.06);
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
    else startEctoRacer();
  }
  function nextLevel() {
    if (currentGame === 'proton') nextLevelProton();
    else nextStageEcto();
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
      boss={x:W/2,y:110,r:40,hp:40,maxHp:40,phase:1,vx:2,vy:0.6,spitCooldown:1.2,anim:0};
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
        boss.spitCooldown=boss.phase===2?0.7:1.3;
        const bdx=player.x-boss.x,bdy=player.y-boss.y,spits=boss.phase===2?3:1;
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
  //  GAME B — ECTO RACER
  //  Top-down kart racer with perspective road rendering.
  //  3 stages, each with 3 laps.  Enemy cars, slime hazards, power-ups.
  // ================================================================

  const TOTAL_STAGES = 3;
  const LAPS_PER_STAGE = 3;
  const ROAD_HALF = 200;   // half road width in world units
  const SHOULDER  = 55;

  // ---- TRACK GEOMETRY ----
  // A closed loop of Catmull-Rom waypoints in world space.
  function buildTrack(seed) {
    const pts = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const base = (i / n) * Math.PI * 2;
      const jx = Math.sin(seed * 1.7 + i * 2.9) * 320;
      const jy = Math.cos(seed * 1.1 + i * 3.3) * 220;
      pts.push({ x: Math.cos(base)*1800 + jx, y: Math.sin(base)*1200 + jy });
    }
    return pts;
  }

  function catmull(pts, t) {
    const n = pts.length;
    const raw = t * n;
    const i  = Math.floor(raw) % n;
    const f  = raw - Math.floor(raw);
    const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
    const t2 = f*f, t3 = t2*f;
    return {
      x: 0.5*((2*p1.x)+(-p0.x+p2.x)*f+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y: 0.5*((2*p1.y)+(-p0.y+p2.y)*f+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    };
  }

  function trackTangent(pts, t) {
    const d = 0.001;
    const a = catmull(pts, (t-d+1)%1), b = catmull(pts, (t+d)%1);
    const len = Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2)||1;
    return { x:(b.x-a.x)/len, y:(b.y-a.y)/len };
  }

  function closestT(pts, wx, wy) {
    let bestT=0, bestD=Infinity;
    const steps=160;
    for(let i=0;i<steps;i++){
      const t=i/steps, p=catmull(pts,t);
      const d=(p.x-wx)**2+(p.y-wy)**2;
      if(d<bestD){bestD=d;bestT=t;}
    }
    for(let r=0;r<4;r++){
      const dt=0.5/steps/(r+1);
      for(const delta of[-dt,dt]){
        const t2=(bestT+delta+1)%1, p2=catmull(pts,t2);
        const d2=(p2.x-wx)**2+(p2.y-wy)**2;
        if(d2<bestD){bestD=d2;bestT=t2;}
      }
    }
    return bestT;
  }

  // ---- RACE STATE ----
  let R = {};

  function makeCar(type, trackT, lateralOff) {
    const spd = type==='ghoul'?rand(230,310):type==='ghost'?rand(170,230):type==='zombie'?rand(90,150):rand(60,100);
    return {
      type, t: trackT, lat: lateralOff,
      wx:0, wy:0,  // world pos, computed each frame
      speed: spd,
      hp: type==='zombie'?4:type==='slimer'?10:2,
      maxHp: type==='zombie'?4:type==='slimer'?10:2,
      anim: rand(0,Math.PI*2),
      shootCooldown: rand(2,4),
      slimeCooldown: type==='slimer'?rand(1,2):999,
      alive: true,
      stunUntil: 0,
      phase: 1,
    };
  }

  function buildEnemies(stage) {
    const cars=[];
    const counts=[0,7,10,13];
    const n=counts[stage]||7;
    const typeTable={
      1:['zombie','zombie','ghost','ghost','ghost','ghoul','zombie'],
      2:['zombie','ghost','ghoul','ghoul','slimer','ghoul','ghost','zombie','ghoul','ghost'],
      3:['ghoul','ghoul','zombie','slimer','ghoul','ghost','ghoul','slimer','ghoul','zombie','ghoul','slimer','ghost'],
    };
    const tbl=typeTable[stage]||typeTable[1];
    for(let i=0;i<n;i++){
      const t=(0.08+i/n*0.88)%1;
      const lat=(Math.random()-0.5)*ROAD_HALF*1.5;
      cars.push(makeCar(tbl[i%tbl.length],t,lat));
    }
    return cars;
  }

  function buildPickups(pts) {
    const pus=[];
    const types=['wrench','nitro','shield','wrench','nitro','nitro'];
    for(let i=0;i<6;i++){
      const t=(i/6+0.04)%1;
      const p=catmull(pts,t), tang=trackTangent(pts,t);
      const perp={x:-tang.y,y:tang.x};
      const off=rand(-90,90);
      pus.push({x:p.x+perp.x*off,y:p.y+perp.y*off,type:types[i],anim:0,collected:false});
    }
    return pus;
  }

  function startEctoRacer(){
    S.level=1; S.score=0;
    initStage(1);
    S.scene='play'; S.paused=false;
    startMusic('race'); canvas.focus();
    flash('STAGE 1 — SPOOK ROAD',2.0);
  }

  function initStage(stage){
    const pts=buildTrack(stage*4.1);
    const sp=catmull(pts,0), st=trackTangent(pts,0);
    R={
      pts, stage,
      car:{
        x:sp.x, y:sp.y,
        angle:Math.atan2(st.y,st.x),
        speed:0,
        hp:6, maxHp:6,
        invincibleUntil:0, flashUntil:0,
        nitroUntil:0, shieldUntil:0,
        shootCooldown:0, slimedUntil:0,
        trackT:0, lastT:0, lapsCompleted:0,
      },
      enemies: buildEnemies(stage),
      pickups: buildPickups(pts),
      slimeBlobs:[],
      bullets:[],
      parts:[],
      engineTimer:0,
      countdown:3.6,
    };
    S.flashText=null;
  }

  function nextStageEcto(){
    const next=R.stage+1;
    if(next>TOTAL_STAGES){win();return;}
    initStage(next);
    S.scene='play';
    startMusic(next===TOTAL_STAGES?'rboss':'race2');
    const names={1:'STAGE 1 — SPOOK ROAD',2:'STAGE 2 — GRAVEYARD RUN',3:'STAGE 3 — SLIMER SHOWDOWN'};
    flash(names[next]||`STAGE ${next}`,2.0);
  }

  // ---- UPDATE ----
  function updateEcto(dt){
    S.time+=dt; S.frame++;
    if(S.paused||S.scene!=='play') return;
    const car=R.car;

    // Countdown
    if(R.countdown>0){ R.countdown-=dt; return; }

    // Engine sfx
    R.engineTimer-=dt;
    if(R.engineTimer<=0&&car.speed>20){ R.engineTimer=0.09; SFX.engine(); }

    // ---- DRIVE ----
    const maxSpd = S.time<car.nitroUntil ? 500 : 310;
    const accel=260, brakeF=400, drag=1.6, turnRate=2.3;

    if(keys['w'])      car.speed=Math.min(maxSpd, car.speed+accel*dt);
    else if(keys['s']) car.speed=Math.max(-80,    car.speed-brakeF*dt);
    else               car.speed*=Math.max(0,     1-drag*dt);

    const slimed=S.time<car.slimedUntil;
    const tm=slimed?0.35:1;
    if(keys['a']) car.angle-=turnRate*tm*dt*(car.speed>=0?1:-1);
    if(keys['d']) car.angle+=turnRate*tm*dt*(car.speed>=0?1:-1);

    car.x+=Math.cos(car.angle)*car.speed*dt;
    car.y+=Math.sin(car.angle)*car.speed*dt;

    // Soft track boundary
    const nt=closestT(R.pts,car.x,car.y);
    const np=catmull(R.pts,nt);
    const dTrack=Math.sqrt((car.x-np.x)**2+(car.y-np.y)**2);
    if(dTrack>ROAD_HALF+SHOULDER){
      const over=dTrack-(ROAD_HALF+SHOULDER);
      const pushX=(np.x-car.x)/(dTrack||1), pushY=(np.y-car.y)/(dTrack||1);
      car.x+=pushX*over*0.65; car.y+=pushY*over*0.65;
      car.speed*=0.65;
    }

    // Lap detection (crossing t≈0)
    if(car.lastT>0.88&&nt<0.12){
      car.lapsCompleted++;
      S.score+=200;
      flash(`LAP ${car.lapsCompleted}/${LAPS_PER_STAGE} DONE!`,1.8);
      SFX.levelClear();
      if(car.lapsCompleted>=LAPS_PER_STAGE){
        S.scene='level_clear'; stopMusic(); return;
      }
    }
    car.lastT=nt; car.trackT=nt;

    // ---- SHOOT ----
    car.shootCooldown-=dt;
    if(keys[' ']&&car.shootCooldown<=0){
      car.shootCooldown=0.28;
      R.bullets.push({x:car.x+Math.cos(car.angle)*32,y:car.y+Math.sin(car.angle)*32,vx:Math.cos(car.angle)*580,vy:Math.sin(car.angle)*580,life:1.1});
      SFX.shoot();
    }

    // ---- BULLETS ----
    for(let i=R.bullets.length-1;i>=0;i--){
      const b=R.bullets[i]; b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if(b.life<=0){R.bullets.splice(i,1);continue;}
      let hit=false;
      for(const e of R.enemies){
        if(!e.alive) continue;
        if(Math.sqrt((b.x-e.wx)**2+(b.y-e.wy)**2)<30){
          e.hp--;
          for(let p=0;p<7;p++) R.parts.push({x:b.x,y:b.y,vx:rand(-90,90),vy:rand(-90,90),life:0.45,color:e.type==='slimer'?'#7bff3a':'#fff'});
          SFX.hit();
          if(e.hp<=0){
            e.alive=false;
            const pts2={zombie:50,ghost:40,ghoul:70,slimer:200};
            S.score+=pts2[e.type]||30;
            for(let p=0;p<16;p++) R.parts.push({x:e.wx,y:e.wy,vx:rand(-140,140),vy:rand(-140,140),life:0.65,color:e.type==='slimer'?'#7bff3a':'#d1121b'});
            if(e.type==='slimer'&&e.phase===1&&R.stage===TOTAL_STAGES){
              // Last slimer on final stage = super enrage
              flash('SLIMER DESTROYED!',2.0);
            }
          }
          hit=true; break;
        }
      }
      if(hit){R.bullets.splice(i,1);continue;}
    }

    // ---- ENEMIES ----
    for(const e of R.enemies){
      if(!e.alive) continue;
      e.anim+=dt*3;
      if(S.time<e.stunUntil) continue;

      // Advance along track
      e.t=(e.t+e.speed/70000*dt*R.pts.length)%1;

      // Ghost car: on stage 3, if no enemies left except slimer, slimer becomes enraged
      if(e.type==='slimer'&&R.stage===TOTAL_STAGES){
        const others=R.enemies.filter(x=>x.alive&&x.type!=='slimer');
        if(others.length===0&&e.phase===1){
          e.phase=2; e.speed*=1.6; e.slimeCooldown*=0.4;
          SFX.boss(); flash('SLIMER ENRAGED!',1.5);
        }
      }

      // Lateral drift
      const tp=catmull(R.pts,e.t), tang=trackTangent(R.pts,e.t);
      const perp={x:-tang.y,y:tang.x};

      if(e.type==='slimer'){
        e.lat=Math.sin(S.time*1.8+e.anim)*ROAD_HALF*0.75;
      } else if(e.type==='ghost'||e.type==='ghoul'){
        // drift toward player laterally
        const ct=catmull(R.pts,car.trackT);
        const proj=(ct.x-tp.x)*perp.x+(ct.y-tp.y)*perp.y;
        e.lat=clamp(e.lat+Math.sign(proj)*50*dt,-ROAD_HALF*0.88,ROAD_HALF*0.88);
      }

      e.wx=tp.x+perp.x*e.lat;
      e.wy=tp.y+perp.y*e.lat;

      // Slimer drops slime
      e.slimeCooldown-=dt;
      if(e.type==='slimer'&&e.slimeCooldown<=0){
        e.slimeCooldown=rand(1.2,2.8);
        R.slimeBlobs.push({x:e.wx,y:e.wy,life:7,r:48,projectile:false});
        SFX.slimeSplat();
      }

      // Ghoul/ghost fire slime at player
      e.shootCooldown-=dt;
      if((e.type==='ghoul'||e.type==='ghost')&&e.shootCooldown<=0){
        const ddx=car.x-e.wx,ddy=car.y-e.wy,dd=Math.sqrt(ddx*ddx+ddy*ddy);
        if(dd<420){
          e.shootCooldown=rand(2,4);
          const ang=Math.atan2(ddy,ddx);
          R.slimeBlobs.push({x:e.wx,y:e.wy,vx:Math.cos(ang)*170,vy:Math.sin(ang)*170,life:2.8,r:16,projectile:true});
        }
      }

      // Collision with player
      if(S.time>=car.invincibleUntil&&S.time>=car.shieldUntil){
        const ddx=car.x-e.wx,ddy=car.y-e.wy;
        if(Math.sqrt(ddx*ddx+ddy*ddy)<38){
          car.hp--; car.invincibleUntil=S.time+1.3; car.flashUntil=S.time+0.45;
          car.speed*=-0.35; SFX.crash(); SFX.hurt();
          for(let p=0;p<10;p++) R.parts.push({x:car.x,y:car.y,vx:rand(-110,110),vy:rand(-110,110),life:0.5,color:'#ff4444'});
          if(car.hp<=0){gameOver();return;}
        }
      }
    }

    // ---- SLIME BLOBS ----
    for(let i=R.slimeBlobs.length-1;i>=0;i--){
      const b=R.slimeBlobs[i]; b.life-=dt;
      if(b.projectile){b.x+=b.vx*dt;b.y+=b.vy*dt;}
      if(b.life<=0){R.slimeBlobs.splice(i,1);continue;}
      const ddx=car.x-b.x,ddy=car.y-b.y;
      if(Math.sqrt(ddx*ddx+ddy*ddy)<b.r+20&&S.time>=car.invincibleUntil&&S.time>=car.shieldUntil){
        car.slimedUntil=S.time+3.2; car.invincibleUntil=S.time+0.5; SFX.slimeSplat();
        flash('SLIMED! HANDLING REDUCED!',1.2);
        if(b.projectile) R.slimeBlobs.splice(i,1);
      }
    }

    // ---- PICKUPS ----
    for(const pu of R.pickups){
      if(pu.collected) continue;
      pu.anim+=dt*3;
      const ddx=car.x-pu.x,ddy=car.y-pu.y;
      if(Math.sqrt(ddx*ddx+ddy*ddy)<34){
        pu.collected=true; SFX.pickup();
        if(pu.type==='wrench')  {car.hp=Math.min(car.maxHp,car.hp+2);flash('WRENCH! +2 HP',1.2);}
        if(pu.type==='nitro')   {car.nitroUntil=S.time+4.0;flash('NITRO BOOST!',1.2);SFX.nitro();}
        if(pu.type==='shield')  {car.shieldUntil=S.time+4.0;flash('SHIELD ACTIVATED!',1.2);}
        S.score+=30;
      }
    }

    // ---- PARTICLES ----
    for(let i=R.parts.length-1;i>=0;i--){
      const p=R.parts[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.88; p.vy*=0.88; p.life-=dt;
      if(p.life<=0) R.parts.splice(i,1);
    }
  }

  // ---- DRAW ----
  function drawEcto(){
    const car=R.car;

    // Camera follows behind car
    const camBack=150;
    const camX=car.x-Math.cos(car.angle)*camBack;
    const camY=car.y-Math.sin(car.angle)*camBack;
    const camA=car.angle;

    // World → screen projection
    function w2s(wx,wy){
      const dx=wx-camX, dy=wy-camY;
      const rx= dx*Math.cos(-camA)-dy*Math.sin(-camA);
      const ry= dx*Math.sin(-camA)+dy*Math.cos(-camA);
      const depth=ry+camBack;
      if(depth<8) return null;
      const sc=210/depth;
      return{sx:W/2+rx*sc, sy:H*0.70-(depth-camBack*0.2)*0.38, scale:sc, depth};
    }

    // --- SKY ---
    ctx.fillStyle='#04060f'; ctx.fillRect(0,0,W,H);
    // Stars
    for(let i=0;i<55;i++){
      const sx=((i*139+S.frame*0.25)%W), sy=((i*71)%(H*0.44));
      ctx.globalAlpha=0.3+((Math.sin(S.time*1.8+i)+1)*0.5)*0.4;
      ctx.fillStyle='#fff'; ctx.fillRect(sx,sy,1,1);
    }
    ctx.globalAlpha=1;
    // Moon
    ctx.fillStyle='#fffde0'; ctx.beginPath(); ctx.arc(W-75,46,26,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(210,220,160,0.28)'; ctx.beginPath(); ctx.arc(W-75,46,34,0,Math.PI*2); ctx.fill();
    // Horizon fog
    const fog=ctx.createLinearGradient(0,H*0.37,0,H*0.54);
    fog.addColorStop(0,'rgba(10,5,20,0)'); fog.addColorStop(1,'rgba(10,5,20,0.88)');
    ctx.fillStyle=fog; ctx.fillRect(0,H*0.37,W,H*0.17);

    // --- ROAD (far→near) ---
    const SEGS=72;
    const baseT=car.trackT;
    for(let i=SEGS;i>=0;i--){
      const t =(baseT+i*0.0085)%1;
      const t2=(baseT+(i+1)*0.0085)%1;
      const c =catmull(R.pts,t),  tang=trackTangent(R.pts,t),  perp={x:-tang.y,y:tang.x};
      const c2=catmull(R.pts,t2), tang2=trackTangent(R.pts,t2),perp2={x:-tang2.y,y:tang2.x};

      const RW=ROAD_HALF+SHOULDER;
      const corners=[
        w2s(c.x +perp.x*RW, c.y +perp.y*RW),
        w2s(c.x -perp.x*RW, c.y -perp.y*RW),
        w2s(c2.x-perp2.x*RW,c2.y-perp2.y*RW),
        w2s(c2.x+perp2.x*RW,c2.y+perp2.y*RW),
      ];
      const rCorners=[
        w2s(c.x +perp.x*ROAD_HALF, c.y +perp.y*ROAD_HALF),
        w2s(c.x -perp.x*ROAD_HALF, c.y -perp.y*ROAD_HALF),
        w2s(c2.x-perp2.x*ROAD_HALF,c2.y-perp2.y*ROAD_HALF),
        w2s(c2.x+perp2.x*ROAD_HALF,c2.y+perp2.y*ROAD_HALF),
      ];
      if(corners.some(x=>!x)) continue;
      const fogFrac=Math.min(1,i/SEGS);

      // Shoulder
      ctx.globalAlpha=1-fogFrac*0.62;
      ctx.beginPath();
      ctx.moveTo(corners[0].sx,corners[0].sy); ctx.lineTo(corners[1].sx,corners[1].sy);
      ctx.lineTo(corners[2].sx,corners[2].sy); ctx.lineTo(corners[3].sx,corners[3].sy);
      ctx.closePath();
      ctx.fillStyle=i%2===0?'#182208':'#121a06'; ctx.fill();

      // Road
      if(rCorners.every(x=>x)){
        const slimeNearby=R.slimeBlobs.some(b=>!b.projectile&&Math.sqrt((b.x-c.x)**2+(b.y-c.y)**2)<ROAD_HALF*1.4);
        ctx.beginPath();
        ctx.moveTo(rCorners[0].sx,rCorners[0].sy); ctx.lineTo(rCorners[1].sx,rCorners[1].sy);
        ctx.lineTo(rCorners[2].sx,rCorners[2].sy); ctx.lineTo(rCorners[3].sx,rCorners[3].sy);
        ctx.closePath();
        ctx.fillStyle=slimeNearby?(i%2===0?'#1c3a0a':'#162e06'):(i%2===0?'#2e2e2e':'#262626');
        ctx.fill();

        // Road edges
        ctx.strokeStyle=`rgba(255,50,50,${0.5*(1-fogFrac*0.9)})`;
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(rCorners[0].sx,rCorners[0].sy); ctx.lineTo(rCorners[3].sx,rCorners[3].sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rCorners[1].sx,rCorners[1].sy); ctx.lineTo(rCorners[2].sx,rCorners[2].sy); ctx.stroke();

        // Center dash
        const mid=w2s(c.x,c.y);
        if(mid&&i%6<3){
          ctx.fillStyle=`rgba(255,240,0,${0.7*(1-fogFrac*0.85)})`;
          ctx.fillRect(mid.sx-1,mid.sy-1,2,3);
        }
      }
      ctx.globalAlpha=1;
    }

    // --- SLIME PUDDLES ON ROAD ---
    for(const b of R.slimeBlobs){
      if(b.projectile) continue;
      const sp=w2s(b.x,b.y); if(!sp||sp.depth<8) continue;
      const r=b.r*sp.scale*0.75;
      ctx.globalAlpha=Math.min(0.72,b.life/4)*(1-Math.min(1,sp.depth/560));
      ctx.fillStyle='#7bff3a';
      ctx.beginPath(); ctx.ellipse(sp.sx,sp.sy,r,r*0.38,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#c5ff6b';
      ctx.beginPath(); ctx.ellipse(sp.sx-r*0.22,sp.sy-r*0.1,r*0.3,r*0.12,0,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }

    // --- PICKUPS ---
    for(const pu of R.pickups){
      if(pu.collected) continue;
      const sp=w2s(pu.x,pu.y); if(!sp||sp.depth<8||sp.depth>480) continue;
      const sz=10*sp.scale, bob=Math.sin(pu.anim+S.time*4)*2*sp.scale;
      ctx.globalAlpha=Math.max(0.2,1-sp.depth/480);
      if(pu.type==='wrench'){
        ctx.fillStyle='#bbbbbb'; ctx.fillRect(sp.sx-sz*0.4,sp.sy-sz+bob,sz*0.8,sz*1.6);
        ctx.fillStyle='#888'; ctx.fillRect(sp.sx-sz*0.7,sp.sy-sz*0.1+bob,sz*1.4,sz*0.4);
      } else if(pu.type==='nitro'){
        ctx.fillStyle='#ffea00'; ctx.beginPath(); ctx.arc(sp.sx,sp.sy+bob,sz*0.85,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ff8800'; ctx.font=`${Math.floor(sz*1.5)}px monospace`; ctx.textAlign='center';
        ctx.fillText('⚡',sp.sx,sp.sy+bob+sz*0.45); ctx.textAlign='left';
      } else {
        ctx.fillStyle='#4488ff'; ctx.beginPath(); ctx.arc(sp.sx,sp.sy+bob,sz*0.85,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#88aaff'; ctx.beginPath(); ctx.arc(sp.sx-sz*0.3,sp.sy-sz*0.3+bob,sz*0.3,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    // --- ENEMY CARS (far→near) ---
    const visE=R.enemies
      .filter(e=>e.alive&&e.wx!==undefined)
      .map(e=>{const sp=w2s(e.wx,e.wy);return{e,sp};})
      .filter(({sp})=>sp&&sp.depth>8&&sp.depth<660)
      .sort((a,b)=>b.sp.depth-a.sp.depth);

    for(const{e,sp} of visE){
      const sc=sp.scale, cw=30*sc, ch=48*sc, cx=sp.sx, cy=sp.sy;
      ctx.globalAlpha=Math.max(0.15,1-sp.depth/660);

      if(e.type==='ghost'){
        ctx.globalAlpha*=(0.55+Math.sin(S.time*4+e.anim)*0.25);
        ctx.fillStyle='#c0b8e0'; ctx.fillRect(cx-cw/2,cy-ch/2,cw,ch);
        ctx.fillStyle='#9880cc'; ctx.fillRect(cx-cw/2+1,cy-ch/2+1,cw-2,ch*0.34);
        ctx.fillStyle='rgba(0,0,0,0.65)';
        ctx.fillRect(cx-cw*0.22,cy-ch*0.32,cw*0.16,cw*0.16);
        ctx.fillRect(cx+cw*0.06,cy-ch*0.32,cw*0.16,cw*0.16);
      } else if(e.type==='zombie'){
        ctx.fillStyle='#5a3020'; ctx.fillRect(cx-cw/2,cy-ch/2,cw,ch);
        ctx.fillStyle='#3a180a'; ctx.fillRect(cx-cw/2+1,cy-ch/2+1,cw-2,ch*0.34);
        ctx.fillStyle='#7a4020'; ctx.fillRect(cx-cw/2,cy-ch*0.08,cw,ch*0.14);
        ctx.fillStyle='#7a9a40'; ctx.fillRect(cx-cw/2-cw*0.32,cy-ch*0.1,cw*0.3,cw*0.22);
        // rotting marks
        ctx.fillStyle='#2a0a00'; ctx.fillRect(cx-cw*0.2,cy,cw*0.1,cw*0.1); ctx.fillRect(cx+cw*0.1,cy-ch*0.2,cw*0.08,cw*0.08);
      } else if(e.type==='ghoul'){
        ctx.fillStyle='#5a0a8a'; ctx.fillRect(cx-cw/2,cy-ch/2,cw,ch);
        ctx.fillStyle='#8a20b8'; ctx.fillRect(cx-cw/2+1,cy-ch/2+1,cw-2,ch*0.34);
        ctx.fillStyle='#ffea00'; ctx.fillRect(cx-cw*0.3,cy-ch*0.36,cw*0.6,cw*0.2);
        // flame decals
        ctx.fillStyle='#ff5500';
        for(let fi=0;fi<3;fi++) ctx.fillRect(cx-cw*0.28+fi*cw*0.26,cy+ch*0.22,cw*0.14,ch*0.28);
        ctx.fillStyle='#ffaa00';
        for(let fi=0;fi<3;fi++) ctx.fillRect(cx-cw*0.24+fi*cw*0.26,cy+ch*0.22,cw*0.07,ch*0.18);
      } else {
        // Slimer blob car
        const bl=Math.sin(S.time*3+e.anim)*cw*0.1;
        const enraged=e.phase===2;
        ctx.fillStyle=enraged?'#1a6a1a':'#0d4a2e';
        ctx.beginPath(); ctx.ellipse(cx+2,cy+2,cw/2+bl,ch/2+bl*0.5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=enraged?'#c5ff6b':'#7bff3a';
        ctx.beginPath(); ctx.ellipse(cx,cy,cw/2+bl,ch/2+bl*0.5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#dfff9a';
        ctx.beginPath(); ctx.ellipse(cx-cw*0.22,cy-ch*0.22,cw*0.28,ch*0.13,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff';
        ctx.beginPath(); ctx.arc(cx-cw*0.2,cy-ch*0.1,cw*0.15,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx+cw*0.2,cy-ch*0.1,cw*0.15,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#000';
        ctx.beginPath(); ctx.arc(cx-cw*0.14,cy-ch*0.1,cw*0.08,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx+cw*0.26,cy-ch*0.1,cw*0.08,0,Math.PI*2); ctx.fill();
        if(e.hp<e.maxHp){
          const bw=Math.max(28,cw*2.2);
          ctx.fillStyle='#111'; ctx.fillRect(cx-bw/2,cy-ch/2-10*sc,bw,5*sc);
          ctx.fillStyle=enraged?'#c5ff6b':'#d1121b'; ctx.fillRect(cx-bw/2,cy-ch/2-10*sc,(e.hp/e.maxHp)*bw,5*sc);
        }
      }
      // Wheels
      ctx.fillStyle='#111';
      ctx.fillRect(cx-cw/2-cw*0.2,cy-ch*0.28,cw*0.2,cw*0.26);
      ctx.fillRect(cx+cw/2,        cy-ch*0.28,cw*0.2,cw*0.26);
      ctx.fillRect(cx-cw/2-cw*0.2, cy+ch*0.1, cw*0.2,cw*0.26);
      ctx.fillRect(cx+cw/2,         cy+ch*0.1, cw*0.2,cw*0.26);
      ctx.globalAlpha=1;
    }

    // --- AIRBORNE SLIME PROJECTILES ---
    for(const b of R.slimeBlobs){
      if(!b.projectile) continue;
      const sp=w2s(b.x,b.y); if(!sp||sp.depth>580) continue;
      const r=b.r*sp.scale;
      ctx.globalAlpha=Math.min(1,b.life*0.8);
      ctx.fillStyle='#7bff3a'; ctx.beginPath(); ctx.arc(sp.sx,sp.sy,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#c5ff6b'; ctx.beginPath(); ctx.arc(sp.sx-r*0.3,sp.sy-r*0.3,r*0.38,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }

    // --- PROTON BULLETS ---
    for(const b of R.bullets){
      const sp=w2s(b.x,b.y); if(!sp||sp.depth>580) continue;
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#ffea00'; ctx.beginPath(); ctx.arc(sp.sx,sp.sy,4*sp.scale,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff';    ctx.beginPath(); ctx.arc(sp.sx,sp.sy,2*sp.scale,0,Math.PI*2); ctx.fill();
      const back=w2s(b.x-Math.cos(car.angle)*45,b.y-Math.sin(car.angle)*45);
      if(back){ctx.strokeStyle='rgba(255,234,0,0.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sp.sx,sp.sy);ctx.lineTo(back.sx,back.sy);ctx.stroke();}
      ctx.globalAlpha=1;
    }

    // --- PARTICLES ---
    for(const p of R.parts){
      const sp=w2s(p.x,p.y); if(!sp||sp.depth>480) continue;
      const sz=Math.max(1,p.life*5*sp.scale);
      ctx.globalAlpha=Math.min(1,p.life*2); ctx.fillStyle=p.color;
      ctx.fillRect(sp.sx-sz/2,sp.sy-sz/2,sz,sz); ctx.globalAlpha=1;
    }

    // --- ECTO-1 (fixed screen position) ---
    drawEcto1(car);

    // --- HUD ---
    drawHUDEcto(car);
    drawFlashText();

    // Scanlines
    ctx.fillStyle='rgba(0,0,0,0.13)';
    for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);

    // Slime tint
    if(S.time<car.slimedUntil){
      ctx.fillStyle=`rgba(123,255,58,${0.11+Math.sin(S.time*8)*0.04})`;
      ctx.fillRect(0,0,W,H);
    }
    // Hurt flash
    if(S.time<car.flashUntil){
      ctx.fillStyle='rgba(209,18,27,0.3)'; ctx.fillRect(0,0,W,H);
    }

    // Countdown
    if(R.countdown>0){
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
      const n=Math.ceil(R.countdown);
      ctx.textAlign='center';
      ctx.fillStyle=n<=1?'#7bff3a':'#ffea00'; ctx.font='bold 80px "Press Start 2P", monospace';
      ctx.fillText(n>1?String(n-1):'GO!',W/2,H/2+24); ctx.textAlign='left';
    }

    if(S.paused){
      ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ffea00'; ctx.font='24px "Press Start 2P", monospace'; ctx.textAlign='center';
      ctx.fillText('PAUSED',W/2,H/2);
      ctx.font='10px "Press Start 2P", monospace'; ctx.fillText('PRESS [P] TO RESUME',W/2,H/2+30);
      ctx.textAlign='left';
    }
  }

  function drawEcto1(car){
    const cx=W/2, cy=H*0.77;
    const hurt=S.time<car.flashUntil&&Math.floor(S.time*20)%2===0;
    const shielded=S.time<car.shieldUntil;
    const slimed=S.time<car.slimedUntil;

    ctx.save(); ctx.translate(cx,cy);

    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2,7,22,8,0,0,Math.PI*2); ctx.fill();

    // Body
    ctx.fillStyle=hurt?'#ff9999':slimed?'#aaffaa':'#e8e6d4';
    ctx.fillRect(-14,-22,28,44);

    // Red stripe
    ctx.fillStyle='#d1121b'; ctx.fillRect(-14,-6,28,6);

    // Roof equipment
    ctx.fillStyle='#888'; ctx.fillRect(-10,-28,20,8);
    ctx.fillStyle='#ffea00';
    ctx.fillRect(-8,-27,4,2); ctx.fillRect(-1,-27,4,2); ctx.fillRect(6,-27,4,2);
    // Proton cannon barrel
    ctx.fillStyle='#555'; ctx.fillRect(12,-24,9,4);
    ctx.fillStyle='#ffea00'; ctx.fillRect(19,-23,3,2);

    // Windshield
    ctx.fillStyle='#a0c8ff'; ctx.fillRect(-10,-20,20,12);
    ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.fillRect(-8,-19,6,5);

    // Side windows
    ctx.fillStyle='#6080a0';
    ctx.fillRect(-11,-2,10,9); ctx.fillRect(1,-2,10,9);

    // Wheels
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect(-18,-18,6,10); ctx.fillRect(12,-18,6,10);
    ctx.fillRect(-18,10,6,10);  ctx.fillRect(12,10,6,10);
    ctx.fillStyle='#777';
    ctx.fillRect(-16,-16,3,6); ctx.fillRect(13,-16,3,6);
    ctx.fillRect(-16,12,3,6);  ctx.fillRect(13,12,3,6);

    // Headlights
    ctx.fillStyle='#ffffc0'; ctx.fillRect(-12,-25,7,4); ctx.fillRect(5,-25,7,4);
    // Taillights
    ctx.fillStyle='#ff2200'; ctx.fillRect(-12,20,6,3); ctx.fillRect(6,20,6,3);

    // ECTO-1 plate
    ctx.fillStyle='#ffea00'; ctx.font='5px "Press Start 2P", monospace'; ctx.textAlign='center';
    ctx.fillText('ECTO-1',0,27);

    // Shield aura
    if(shielded){
      ctx.strokeStyle='#4488ff'; ctx.lineWidth=2;
      ctx.globalAlpha=0.55+Math.sin(S.time*8)*0.25;
      ctx.beginPath(); ctx.ellipse(0,0,28,32,0,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1;
    }

    // Nitro flames
    if(S.time<car.nitroUntil){
      ctx.fillStyle='#ff5500'; ctx.fillRect(-8,22,5,8+Math.random()*6); ctx.fillRect(3,22,5,8+Math.random()*6);
      ctx.fillStyle='#ffea00'; ctx.fillRect(-7,22,3,5+Math.random()*4); ctx.fillRect(4,22,3,5+Math.random()*4);
    }

    // Proton stream firing
    if(keys[' ']&&R.car.shootCooldown>0.14){
      ctx.strokeStyle='#ffea00'; ctx.lineWidth=3; ctx.globalAlpha=0.8;
      ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,-62); ctx.stroke();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,-62); ctx.stroke();
      ctx.globalAlpha=1;
    }

    ctx.restore(); ctx.textAlign='left';
  }

  function drawHUDEcto(car){
    ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.fillRect(0,0,W,40);
    ctx.fillStyle='#7bff3a'; ctx.fillRect(0,40,W,2);

    ctx.font='12px "Press Start 2P", monospace'; ctx.fillStyle='#7bff3a'; ctx.textAlign='left';
    ctx.fillText('HP',12,25);
    for(let i=0;i<car.maxHp;i++){
      const f=i<car.hp;
      ctx.fillStyle=f?'#d1121b':'#333'; ctx.fillRect(44+i*12,14,9,13);
      ctx.fillStyle=f?'#ff4444':'#555'; ctx.fillRect(45+i*12,15,7,4);
    }

    ctx.fillStyle='#ffea00'; ctx.textAlign='center';
    ctx.fillText(`SCORE ${String(S.score).padStart(6,'0')}`,W/2,25);

    ctx.textAlign='right'; ctx.fillStyle='#7bff3a';
    ctx.fillText(`LAP ${car.lapsCompleted+1}/${LAPS_PER_STAGE}  STG ${R.stage}/${TOTAL_STAGES}`,W-12,25);

    // Status
    ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
    const alive=R.enemies.filter(e=>e.alive).length;
    ctx.fillStyle='#d1121b'; ctx.fillText(`ENEMIES: ${alive}`,12,H-22);

    let xOff=120;
    if(S.time<car.nitroUntil){ctx.fillStyle='#ffea00';ctx.fillText(`NITRO ${(car.nitroUntil-S.time).toFixed(1)}s`,xOff,H-22);xOff+=120;}
    if(S.time<car.shieldUntil){ctx.fillStyle='#4488ff';ctx.fillText(`SHIELD ${(car.shieldUntil-S.time).toFixed(1)}s`,xOff,H-22);xOff+=130;}
    if(S.time<car.slimedUntil){ctx.fillStyle='#7bff3a';ctx.fillText(`SLIMED ${(car.slimedUntil-S.time).toFixed(1)}s`,xOff,H-22);}

    // Speed bar
    const spdFrac=Math.abs(car.speed)/(S.time<car.nitroUntil?500:310);
    ctx.fillStyle='#111'; ctx.fillRect(W-92,H-32,82,11);
    ctx.fillStyle=spdFrac>0.82?'#ffea00':'#7bff3a'; ctx.fillRect(W-92,H-32,spdFrac*82,11);
    ctx.fillStyle='#fff'; ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='right';
    ctx.fillText('SPD',W-10,H-23); ctx.textAlign='left';
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
