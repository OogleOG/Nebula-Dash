(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('scoreVal');
  const bestEl = document.getElementById('bestVal');
  const startBtn = document.getElementById('startBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const toggleSfx = document.getElementById('toggleSfx');
  const toggleVfx = document.getElementById('toggleVfx');
  const toggleHighContrast = document.getElementById('toggleHighContrast');
  const closeSettings = document.getElementById('closeSettings');
  const overlay = document.getElementById('overlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const BASE_W = 800, BASE_H = 600;

  let W, H, scale;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw/BASE_W, vh/BASE_H);
    W = Math.floor(BASE_W * scale);
    H = Math.floor(BASE_H * scale);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  // Load assets
  const assets = {};
  const loadImage = (src) => new Promise((res, rej) => { const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });
  const assetList = [
    ['bg_sky', 'assets/bg_sky.png'],
    ['bg_stars', 'assets/bg_stars.png'],
    ['bg_hills', 'assets/bg_hills.png'],
    ['ship', 'assets/ship.png'],
    ['meteor', 'assets/meteor.png'],
    ['star', 'assets/star.png'],
    ['heart', 'assets/heart.png'],
    ['icon_shield','assets/icon_shield.png'],
    ['icon_magnet','assets/icon_magnet.png'],
    ['icon_time','assets/icon_time.png'],
  ];

  // Input
  const input = { left:false, right:false, pointerX:null, paused:false };
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.code === 'Space' || e.key === 'Enter') tryStart();
    if (e.key === 'Escape') { if (!settingsPanel.classList.contains('hidden')) { settingsPanel.classList.add('hidden'); e.preventDefault(); } }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  });

  // Touch buttons
  let leftHeld=false,rightHeld=false;
  const hold = (btn, setter) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); setter(true); });
    btn.addEventListener('pointerup',   e => { e.preventDefault(); setter(false); });
    btn.addEventListener('pointercancel', e => setter(false));
    btn.addEventListener('pointerleave', e => setter(false));
  };
  hold(btnLeft, v => { leftHeld=v; input.left=v; });
  hold(btnRight, v => { rightHeld=v; input.right=v; });

  canvas.addEventListener('pointerdown', e => {
    input.pointerX = e.clientX;
  });
  canvas.addEventListener('pointermove', e => {
    if (input.pointerX !== null) input.pointerX = e.clientX;
  });
  window.addEventListener('pointerup', () => { input.pointerX = null; });

  // Audio (simple bleeps via WebAudio)
  const audio = {
    ctx: null, enabled: true,
    init(){
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    },
    beep(freq=440, dur=0.08, type='sine', gain=0.04){
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t+dur);
    },
    star(){ this.beep(880, 0.06, 'triangle', 0.03); },
    hit(){ this.beep(140, 0.25, 'sawtooth', 0.05); },
    power(){ this.beep(520, 0.18, 'square', 0.04); }
  };

  // Game state
  let running = false;
  let score = 0;
  let best = parseInt(localStorage.getItem('nebula_best_plus') || '0', 10);
  bestEl.textContent = best;

  // Settings state
  const settings = {
    sfx: true, vfx: true, highContrast: false
  };
  toggleSfx.checked = settings.sfx;
  toggleVfx.checked = settings.vfx;
  toggleHighContrast.checked = settings.highContrast;

  toggleSfx.addEventListener('change', () => { settings.sfx = toggleSfx.checked; audio.enabled = settings.sfx; });
  toggleVfx.addEventListener('change', () => { settings.vfx = toggleVfx.checked; });
  toggleHighContrast.addEventListener('change', () => { settings.highContrast = toggleHighContrast.checked; });
  // ESC closes settings
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      settingsPanel.classList.add('hidden');
    }
  });
  // Clicking backdrop closes settings
  settingsPanel.addEventListener('click', e => {
    if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
  });


  settingsBtn.addEventListener('click', () => { settingsPanel.classList.remove('hidden'); });
  closeSettings.addEventListener('click', () => { settingsPanel.classList.add('hidden'); });
  resumeBtn.addEventListener('click', () => { togglePause(false); });

  function togglePause(force){
    if (state !== 'play') return;
    const to = typeof force === 'boolean' ? force : !input.paused;
    input.paused = to;
    overlay.classList.toggle('hidden', !to);
  }

  function tryStart(){
    if (state === 'menu' || state === 'over') startBtn.click();
  }

  class Parallax {
    constructor(img, speedY, alpha=1, scaleX=1, scaleY=1) {
      this.img = img; this.y = 0; this.speedY = speedY; this.alpha = alpha;
      this.scaleX = scaleX; this.scaleY = scaleY;
    }
    update(dt) { this.y += this.speedY * dt; this.y %= this.img.height * this.scaleY; }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      const imgH = this.img.height * this.scaleY;
      const imgW = this.img.width * this.scaleX;
      for (let y = -imgH; y < H+imgH; y += imgH) {
        for (let x = -imgW; x < W+imgW; x += imgW) {
          ctx.drawImage(this.img, x, y + this.y, imgW, imgH);
        }
      }
      ctx.restore();
    }
  }

  class Entity {
    constructor(x,y) { this.x=x; this.y=y; this.vx=0; this.vy=0; this.r=20; this.dead=false; this.angle=0; this.spin=0; this.scale=1; }
    update(dt) { this.x += this.vx*dt; this.y += this.vy*dt; this.angle += this.spin*dt; if (this.y > H+200) this.dead = true; }
    draw() {}
    collides(other) {
      const dx = this.x - other.x, dy = this.y - other.y;
      const rr = (this.r + other.r);
      return dx*dx + dy*dy < rr*rr;
    }
  }

  class Particle {
    constructor(x,y,vx,vy,life,size,color='rgba(255,180,80,1)') { this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.max=life; this.size=size; this.dead=false; this.color=color; }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead=true; this.x += this.vx*dt; this.y += this.vy*dt; }
    draw() {
      const t = Math.max(this.life/this.max,0);
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (0.5 + 0.5*t), 0, Math.PI*2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  const shake = { t:0, power:0 };
  function doShake(strength=6, duration=0.2){ if (!settings.vfx) return; shake.t = duration; shake.power = strength; }
  function applyShake(){
    if (shake.t > 0) {
      const s = shake.power * (shake.t);
      const dx = (Math.random()*2-1)*s;
      const dy = (Math.random()*2-1)*s;
      ctx.translate(dx, dy);
    }
  }

  class Player extends Entity {
    constructor() {
      super(W/2, H*0.8);
      this.r = 24; this.speed = 360;
      this.shield = 0;
      this.magnet = 0;
      this.slow = 0;
    }
    update(dt) {
      // keyboard
      let dir = 0;
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
      if (dir !== 0) this.vx = dir * this.speed; else this.vx = 0;
      // drag
      if (input.pointerX !== null) {
        const rect = canvas.getBoundingClientRect();
        const targetX = (input.pointerX - rect.left) / (rect.width) * W;
        this.vx = (targetX - this.x) * 8;
      }
      super.update(dt);
      this.y = Math.min(H*0.85, Math.max(H*0.15, this.y));
      this.x = Math.max(32, Math.min(W-32, this.x));

      // decay power-ups
      if (this.shield > 0) this.shield -= dt;
      if (this.magnet > 0) this.magnet -= dt;
      if (this.slow > 0) this.slow -= dt;

      // particles (thruster)
      for (let i=0;i<2;i++) {
        const p = new Particle(this.x + (Math.random()*8-4), this.y+28, (Math.random()*40-20), 140+Math.random()*60, 0.25+Math.random()*0.2, 3+Math.random()*3);
        particles.push(p);
      }
    }
    draw() {
      const img = assets.ship;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.vx * 0.0008);
      ctx.translate(-img.width*0.5*0.4, -img.height*0.5*0.4);
      ctx.drawImage(img, 0, 0, img.width*0.4, img.height*0.4);
      ctx.restore();

      // shield ring
      if (this.shield > 0) {
        ctx.save();
        ctx.globalAlpha = 0.6 * Math.max(0,Math.min(1, this.shield/8));
        ctx.beginPath();
        ctx.arc(this.x, this.y-4, 34, 0, Math.PI*2);
        ctx.strokeStyle = settings.highContrast ? '#7CFC00' : '#6ee7ff';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  class Meteor extends Entity {
    constructor() {
      super(Math.random()*W, -120);
      this.vy = 110 + Math.random()*140 + difficulty()*30;
      this.vx = (Math.random()*2-1) * 40;
      this.spin = (Math.random()*2-1) * 1.5;
      this.r = 26; this.scale = 0.45 + Math.random()*0.2;
    }
    draw() {
      const img = assets.meteor;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const w = img.width * this.scale, h = img.height * this.scale;
      ctx.drawImage(img, -w/2, -h/2, w, h);
      ctx.restore();
    }
  }

  class StarGem extends Entity {
    constructor() {
      super(Math.random()*W, -60);
      this.vy = 120 + Math.random()*80;
      this.r = 18; this.scale = 0.35 + Math.random()*0.1; this.bob = 0;
    }
    update(dt){
      super.update(dt); this.bob += dt*4;
      // magnet effect
      if (player && player.magnet > 0) {
        const dx = player.x - this.x, dy = player.y - this.y;
        const dist2 = dx*dx + dy*dy;
        if (dist2 < 220*220) {
          const d = Math.max(60, Math.sqrt(dist2));
          this.vx += (dx/d) * 200 * dt;
          this.vy += (dy/d) * 200 * dt;
        }
      }
    }
    draw() {
      const img = assets.star;
      ctx.save();
      ctx.translate(this.x, this.y + Math.sin(this.bob)*3);
      const w = img.width * this.scale, h = img.height * this.scale;
      ctx.drawImage(img, -w/2, -h/2, w, h);
      ctx.restore();
    }
  }

  class PowerUp extends Entity {
    constructor(kind){
      super(Math.random()*W, -50);
      this.kind = kind; // 'shield' or 'magnet' or 'slow'
      this.vy = 110;
      this.r = 18;
    }
    draw(){
      const img = this.kind==='shield'?assets.icon_shield:(this.kind==='magnet'?assets.icon_magnet:assets.icon_time);
      ctx.save();
      ctx.translate(this.x, this.y);
      const w = img.width*0.25, h = img.height*0.25;
      ctx.drawImage(img, -w/2, -h/2, w, h);
      ctx.restore();
    }
  }

  function spawnPattern() {
    const count = 2 + Math.floor(Math.random()*2);
    for (let i=0;i<count;i++) entities.push(new Meteor());
    if (Math.random() < 0.6) entities.push(new StarGem());
    if (Math.random() < 0.14) { const r=Math.random(); entities.push(new PowerUp(r<0.45?'shield':(r<0.8?'magnet':'slow'))); }
  }

  function difficulty() {
    return 1 + Math.min(10, Math.floor(score / 300));
  }

  function resetGame() {
    entities.length = 0;
    particles.length = 0;
    player = new Player();
    entities.push(player);
    score = 0;
    spawnTimer = 0;
    combo = 0;
  }

  let layers, entities = [], particles = [], player, spawnTimer = 0, state = 'menu';
  let combo = 0; // increases when collecting stars, decays slowly

  function drawParallax() {
    layers.bgSky.draw();
    layers.bgStars.draw();
    layers.bgHills.draw();
  }

  function updateParallax(dt) {
    layers.bgStars.update(dt * (18 + difficulty()*1.5));
    layers.bgHills.update(dt * (30 + difficulty()*3));
  }

  function loop(ts) {
    if (!prev) prev = ts;
    let dt = Math.min(0.033, (ts - prev)/1000);
    const gameDt = (player && player.slow>0) ? dt*0.55 : dt;
    prev = ts;

    // shake timer
    if (shake.t > 0) shake.t = Math.max(0, shake.t - dt);

    resize();
    ctx.save();
    applyShake();
    ctx.clearRect(0,0,W,H);
    drawParallax();
    if (player && player.slow>0) { ctx.save(); ctx.fillStyle='rgba(167,139,250,0.08)'; ctx.fillRect(0,0,W,H); ctx.restore(); }

    if (state === 'menu') {
      updateParallax(gameDt);
      drawTitle();
    } else if (state === 'play') {
      if (!input.paused) {
        updateParallax(gameDt);
        spawnTimer -= gameDt;
        if (spawnTimer <= 0) {
          spawnPattern();
          spawnTimer = Math.max(0.55, 1.15 - difficulty()*0.07);
        }
        // update
        entities.forEach(e => e.update(gameDt));
        particles.forEach(p => p.update(gameDt));
        // collisions
        for (const e of entities) {
          if (e !== player && !e.dead) {
            if (e instanceof Meteor && player.collides(e)) {
              if (player.shield > 0) {
                e.dead = true;
                player.shield = 0; // consume shield
                doShake(8, 0.2);
                if (settings.sfx) { audio.init(); audio.hit(); }
                for (let i=0;i<24;i++) particles.push(new Particle(e.x, e.y, (Math.random()*80-40), (Math.random()*-20), 0.3+Math.random()*0.6, 2+Math.random()*3, 'rgba(255,255,255,1)'));
              } else {
                boom(player.x, player.y);
                state = 'over';
                document.getElementById('centerUI').classList.remove('hidden');
                startBtn.textContent = 'Restart';
                break;
              }
            }
            if (e instanceof StarGem && player.collides(e)) {
              e.dead = true;
              combo = Math.min(10, combo+1);
              const mult = 1 + combo*0.1;
              score += 25 * mult;
              if (settings.sfx) { audio.init(); audio.star(); }
              for (let i=0;i<10;i++) particles.push(new Particle(e.x, e.y, (Math.random()*80-40), (Math.random()*-60), 0.4+Math.random()*0.4, 2+Math.random()*2));
            }
            if (e instanceof PowerUp && player.collides(e)) {
              e.dead = true;
              if (e.kind === 'shield') player.shield = 8; else if (e.kind === 'magnet') player.magnet = 8; else if (e.kind==='slow') player.slow = 6;
              if (settings.sfx) { audio.init(); audio.power(); }
              const col = e.kind==='shield'?'rgba(110,231,255,1)':(e.kind==='magnet'?'rgba(255,209,102,1)':'rgba(167,139,250,1)');
              for (let i=0;i<12;i++) particles.push(new Particle(e.x, e.y, (Math.random()*80-40), (Math.random()*-40), 0.4+Math.random()*0.6, 2+Math.random()*2, col));
            }
          }
        }
        // remove dead
        entities = entities.filter(e => !e.dead);
        particles = particles.filter(p => !p.dead);
        // increment score over time + small decay of combo
        score += gameDt * 20 * (1 + combo*0.02);
        combo = Math.max(0, combo - dt*0.6);
      }
      // draw
      entities.forEach(e => e.draw());
      particles.forEach(p => p.draw());
      drawHUD();
      drawPowerHUD();
    } else if (state === 'over') {
      updateParallax(gameDt);
      entities.forEach(e => e.draw());
      particles.forEach(p => p.draw());
      drawHUD(true);
      drawPowerHUD();
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }

  function drawTitle() {
    const ui = document.getElementById('centerUI');
    ui.classList.remove('hidden');
  }

  
  function drawPowerHUD(){
    const icons = [];
    if (player && player.shield>0) icons.push({img: assets.icon_shield, t: player.shield, T: 8});
    if (player && player.magnet>0) icons.push({img: assets.icon_magnet, t: player.magnet, T: 8});
    if (player && player.slow>0)   icons.push({img: assets.icon_time,   t: player.slow,   T: 6});

    if (icons.length===0) return;
    const size = 28;
    // Place near top-right, under the Best pill area:  W - 24 - i*(size+8)
    for (let i=0;i<icons.length;i++){
      const x = W - 24 - i*(size+10) - size/2;
      const y = 72; // roughly under the bar
      // icon
      ctx.save();
      ctx.translate(x, y);
      ctx.drawImage(icons[i].img, -size/2, -size/2, size, size);
      // ring
      const p = Math.max(0, Math.min(1, icons[i].t / icons[i].T));
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.arc(0, 0, size*0.45, -Math.PI/2, -Math.PI/2 + Math.PI*2*p);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHUD(showOver=false) {
    scoreEl.textContent = Math.floor(score);
    const s = Math.floor(score);
    if (showOver) {
      if (s > best) { best = s; localStorage.setItem('nebula_best_plus', String(best)); bestEl.textContent = best; }
    }
    // combo meter
    if (combo > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(14, H-30, 200, 16);
      ctx.fillStyle = settings.highContrast ? '#ffff00' : '#66ffbb';
      ctx.fillRect(14, H-30, 200 * Math.min(combo/10,1), 16);
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Combo x' + (1 + (combo|0)*0.1).toFixed(1), 18, H-18);
      ctx.restore();
    }
  }

  function boom(x,y) {
    doShake(10, 0.35);
    if (settings.sfx) { audio.init(); audio.hit(); }
    for (let i=0;i<48;i++) {
      const a = Math.random()*Math.PI*2;
      const sp = 60 + Math.random()*160;
      particles.push(new Particle(x, y, Math.cos(a)*sp, Math.sin(a)*sp, 0.6+Math.random()*0.8, 2+Math.random()*3));
    }
  }

  let prev = 0;

  // Start button
  startBtn.addEventListener('click', () => {
    if (state === 'menu' || state === 'over') {
      document.getElementById('centerUI').classList.add('hidden');
      overlay.classList.add('hidden');
      resetGame();
      state = 'play';
    }
  });

  // Load assets then init
  Promise.all(assetList.map(([k,src]) => loadImage(src).then(img => assets[k]=img)))
    .then(() => {
      resize();
      layers = {
        bgSky: new Parallax(assets.bg_sky, 0, 1, H/assets.bg_sky.height, H/assets.bg_sky.height),
        bgStars: new Parallax(assets.bg_stars, 20, 0.9, H/assets.bg_stars.height, H/assets.bg_stars.height),
        bgHills: new Parallax(assets.bg_hills, 40, 1, H/assets.bg_hills.height, H/assets.bg_hills.height),
      };
      requestAnimationFrame(loop);
    });

})();