// ==========================================
// 巣の描画・UI
// ==========================================
let nestHamsters = []; let nestSeeds = [];
let nestEffects = [];
let nestInitialFrame = true;
let nestMainHamBottomY = 9999;

class NestEffect {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.particles = [];
        this.age = 0;
        this.maxAge = 60;

        let config = NestEffect.CONFIGS[type] || NestEffect.CONFIGS['default'];
        for (let i = 0; i < config.count; i++) {
            let angle = (Math.PI * 2 / config.count) * i + Math.random() * 0.5;
            let speed = config.speed + Math.random() * config.speedVar;
            this.particles.push({
                x: 0, y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - config.lift,
                char: config.chars[Math.floor(Math.random() * config.chars.length)],
                size: config.fontSize + Math.random() * 4,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2
            });
        }
    }

    update() {
        this.age++;
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.vx *= 0.98;
            p.rotation += p.rotSpeed;
        });
        return this.age < this.maxAge;
    }

    draw() {
        let alpha = 1 - (this.age / this.maxAge);
        ctx.save();
        ctx.globalAlpha = alpha;
        this.particles.forEach(p => {
            ctx.save();
            ctx.translate(this.x + p.x, this.y + p.y);
            ctx.rotate(p.rotation);
            ctx.font = `${p.size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.char, 0, 0);
            ctx.restore();
        });
        ctx.restore();
    }
}

NestEffect.CONFIGS = {
    pregnant: { chars: ['💖','💕','♥'], count: 3, speed: 2, speedVar: 1.5, lift: 1.5, fontSize: 14 },
    birth:    { chars: ['✨','🌟','👶'], count: 3, speed: 3, speedVar: 2, lift: 2, fontSize: 14 },
    grow:     { chars: ['✨','💫'], count: 3, speed: 1.5, speedVar: 1, lift: 1, fontSize: 12 },
    adult:    { chars: ['🎉','✨','🐹'], count: 3, speed: 2.5, speedVar: 2, lift: 2, fontSize: 16 },
    default:  { chars: ['✨'], count: 3, speed: 2, speedVar: 1, lift: 1, fontSize: 14 }
};

class PhysicsSeed {
    constructor(x, y) {
        this.x = x; this.y = y; this.physRadius = 5; this.drawRadius = 12; 
        this.vx = (Math.random() - 0.5) * 5; this.vy = Math.random() * 5;
        this.rotation = Math.random() * Math.PI * 2; this.sleeping = false; 
    }
    wakeUp() { this.sleeping = false; }
    update() {
        if (this.sleeping) return; 
        this.vy += 0.5; this.x += this.vx; this.y += this.vy;
        this.vx *= 0.95; this.vy *= 0.95;
        let floorY = canvas.height * NEST_FLOOR_RATIO;
        if (this.y + this.physRadius > floorY) { this.y = floorY - this.physRadius; this.vy *= -0.3; this.vx *= 0.7; }
        if (this.x - this.physRadius < 0) { this.x = this.physRadius; this.vx *= -0.5; }
        if (this.x + this.physRadius > canvas.width) { this.x = canvas.width - this.physRadius; this.vx *= -0.5; }
        if (Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.1 && this.y > floorY - this.physRadius - 5) { this.vx = 0; this.vy = 0; this.sleeping = true; }
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rotation + this.x * 0.1); 
        if (sprites.seed.loaded) ctx.drawImage(sprites.seed.img, -10, -12, 20, 25);
        else { ctx.fillStyle = '#6F4E37'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 12, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
    }
}

class NestHamster {
    constructor(stage = 0, breedingStartedAt = 0) { 
        this.stage = stage;
        this.breedingStartedAt = breedingStartedAt;
        this.x = Math.random() * canvas.width;

        if (this.stage === 3) {
            this.size = 95; this.state = 'pregnant';
        } else if (this.stage === 2) { 
            this.size = 40; this.state = 'newborn'; 
        } else if (this.stage === 1) { 
            this.size = 65; this.state = 'idle'; 
        } else { 
            this.size = 90; this.state = 'idle'; 
        }

        let floorTop = canvas.height * NEST_FLOOR_RATIO;
        let maxY = Math.min(canvas.height - this.size, nestMainHamBottomY);
        let depthRange = Math.max(50, maxY - floorTop);
        this.y = floorTop + Math.random() * depthRange; 
        this.groundY = this.y;

        this.timer = Math.random() * 60; 
        this.vx = 0; 
        this.vy = 0; 
        this.flip = false; 
        this.lastFlip = false;
        this.hopOffset = Math.random() * Math.PI;
        
        this.isDragging = false;
        this.isThrown = false; 
    }

    update() {
        if (this.isDragging) return;

        if (this.isThrown || this.y < this.groundY) {
            this.vy += 0.5; 
            this.x += this.vx;
            this.y += this.vy;

            let safeMaxY = Math.min(cachedSafeBottomY, nestMainHamBottomY);
            if (this.groundY > safeMaxY) this.groundY = safeMaxY;

            if (this.y > this.groundY) {
                this.y = this.groundY;
                this.vy *= -0.5; 
                this.vx *= 0.8;  
                if (Math.abs(this.vy) < 1) {
                    this.isThrown = false;
                    this.vy = 0;
                }
            }
            if (this.x < 0) { this.x = 0; this.vx *= -0.7; }
            if (this.x > canvas.width) { this.x = canvas.width; this.vx *= -0.7; }
            
            if(Math.abs(this.vx) > 1) this.flip = this.vx < 0;

            this.interactWithSeeds();
            return;
        }

        if (this.stage === 2 || this.stage === 3) return; 

        this.timer--;
        if (this.timer <= 0) {
            if (this.state === 'idle') {
                this.state = 'move'; this.timer = 10 + Math.random() * 30; 
                let baseSpeed = (this.stage === 1) ? 6 : 4; 
                let speed = baseSpeed + Math.random() * 3;
                this.vx = (Math.random() < 0.5) ? speed : -speed; 
            } else {
                this.state = 'idle'; this.timer = 20 + Math.random() * 60; this.vx = 0;
            }
        }
        this.x += this.vx;
        if (this.x < 0) { this.x = 0; this.vx *= -1; }
        if (this.x > canvas.width) { this.x = canvas.width; this.vx *= -1; }
        
        if (this.vx !== 0) {
            this.lastFlip = this.vx < 0; 
        }
        this.flip = this.lastFlip;

        if (this.state === 'move') {
            this.interactWithSeeds();
        }
    }

    interactWithSeeds() {
        let speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (speed < 1.0) return;

        for (let s of nestSeeds) {
            let dx = s.x - this.x; let dy = s.y - (this.y - this.size/2);
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < this.size * 0.6) { 
                s.wakeUp(); 
                let angle = Math.atan2(dy, dx); 
                let kickPower = speed * 0.3; 
                if (kickPower > 10) kickPower = 10;
                s.vx += Math.cos(angle) * kickPower; 
                s.vy += Math.sin(angle) * kickPower - 0.5; 
            }
        }
    }

    draw() {
        let hopY = 0;
        if (!this.isThrown && !this.isDragging) {
            if (this.stage === 2) {
                if (Math.random() < 0.02) hopY = -5; 
            } else if (this.stage === 3) {
                hopY = Math.sin(Date.now() / 600 + this.hopOffset) * 2;
            } else {
                hopY = (this.state === 'move') ? Math.sin(Date.now() / 20 + this.hopOffset) * 5 : 0; 
            }
        }
        
        ctx.save(); 
        ctx.translate(this.x, this.y - this.size/2 + hopY);
        if (this.isDragging) ctx.scale(1.1, 1.1);
        if (this.flip) ctx.scale(-1, 1);
        
        let img = sprites.idle.loaded ? sprites.idle.img : null;
        if (this.state === 'move' && !this.isDragging && !this.isThrown && sprites.run.loaded) img = sprites.run.img;
        if ((this.isThrown || this.isDragging) && sprites.fall.loaded) img = sprites.fall.img;
        if ((this.stage === 2 || this.stage === 3) && sprites.idle.loaded) img = sprites.idle.img;
        
        if (img) ctx.drawImage(img, -this.size/2, -this.size/2, this.size, this.size);
        else { ctx.fillStyle = this.stage === 2 ? '#fab1a0' : '#ff9f43'; ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size); }

        if (this.stage === 3 && this.breedingStartedAt > 0) {
            let progress = Math.min(1, (Date.now() - this.breedingStartedAt) / BREEDING_CONFIG.pregnancyTime);
            let barW = this.size * 0.7;
            let barH = 6;
            let barY = this.size / 2 + 4;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(-barW / 2, barY, barW, barH);
            ctx.fillStyle = '#fd79a8';
            ctx.fillRect(-barW / 2, barY, barW * progress, barH);
        }

        ctx.restore();
    }
}

function initNest() {
    gameState = 'nest';
    document.getElementById('nestUI').style.display = 'block';
    document.getElementById('farmUI').style.display = 'none';
    document.getElementById('gameUI').style.display = 'none';
    document.getElementById('gameOverModal').style.display = 'none';
    document.getElementById('pauseModal').style.display = 'none';
    document.getElementById('breedingModal').style.display = 'none';
    document.getElementById('instruction').style.display = 'none';
    cancelPendingDrag();
    simulateBackgroundWork();
    updateFarmGrowth();
    updatePageIndicator('nest');
    updateNestUI();
    resize();
    nestHamsters = [];
    nestEffects = [];
    nestInitialFrame = true;

    let initFloorY = canvas.height * NEST_FLOOR_RATIO;
    let initMyY = initFloorY + 100;
    let initSafeBottom = canvas.height;
    if (initMyY + 100 > initSafeBottom) initMyY = initSafeBottom - 110;
    nestMainHamBottomY = initMyY + 100;

    let displayAdults = Math.min(bankFriends, 30);
    for(let i=0; i<displayAdults; i++) nestHamsters.push(new NestHamster(0)); 
    
    breedingQueue.forEach(q => {
        if (q.type === 'pregnant') {
            for (let i = 0; i < q.count; i++) nestHamsters.push(new NestHamster(3, q.startedAt));
        } else if (q.type === 'baby') {
            let progress = (Date.now() - q.startedAt) / BREEDING_CONFIG.babyGrowthTime;
            let stage = progress < 0.5 ? 2 : 1;
            let count = Math.min(q.count, 20);
            for (let i = 0; i < count; i++) nestHamsters.push(new NestHamster(stage, q.startedAt));
        }
    });

    nestSeeds = [];
    let floorY = canvas.height * NEST_FLOOR_RATIO;
    let physicsCount = Math.min(bankSeeds, MAX_PHYSICS_SEEDS);
    for (let i = 0; i < physicsCount; i++) {
        let sx = 30 + Math.random() * (canvas.width - 60);
        let sy = floorY - 5 - Math.random() * 3;
        let s = new PhysicsSeed(sx, sy);
        s.vx = 0; s.vy = 0; s.sleeping = true;
        nestSeeds.push(s);
    }
    nestLoop();
}

function spawnEffect(x, y, type) {
    if (type === 'pregnant') nestEffects.push(new NestEffect(x, y, type));
}

function applyBreedingChanges(result, suppressEffects) {
    if (result.newBabiesTotal > 0) {
        for (let i = nestHamsters.length - 1; i >= 0; i--) {
            let h = nestHamsters[i];
            if (h.stage === 3) {
                if (!suppressEffects) spawnEffect(h.x, h.y - h.size / 2, 'birth');
                h.stage = 0;
                h.size = 90;
                h.state = 'idle';
                h.breedingStartedAt = 0;
                h.timer = 20 + Math.random() * 60;
            }
        }
        let newBabyQ = breedingQueue.find(q => q.type === 'baby');
        if (newBabyQ) {
            let count = Math.min(result.newBabiesTotal, 20);
            for (let i = 0; i < count; i++) {
                nestHamsters.push(new NestHamster(2, newBabyQ.startedAt));
            }
        }
    }
    if (result.newAdultsTotal > 0) {
        for (let i = nestHamsters.length - 1; i >= 0; i--) {
            let h = nestHamsters[i];
            if (h.stage === 1 || h.stage === 2) {
                if (!suppressEffects) spawnEffect(h.x, h.y - h.size / 2, 'adult');
                h.stage = 0;
                h.size = 90;
                h.state = 'idle';
                h.breedingStartedAt = 0;
                h.timer = 20 + Math.random() * 60;
            }
        }
    }
}

function formatTimeRemaining(ms) {
    if (ms <= 0) return 'まもなく';
    let sec = Math.ceil(ms / 1000);
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function updateNestUI() {
    document.getElementById('bankSeeds').innerText = bankSeeds;
    let babyCount = 0; let pregnantCount = 0;
    breedingQueue.forEach(q => { if (q.type === 'pregnant') pregnantCount += q.count; if (q.type === 'baby') babyCount += q.count; });
    document.getElementById('bankFriends').innerText = bankFriends;
    document.getElementById('babyCount').innerText = babyCount;
    document.getElementById('pregnantCount').innerText = pregnantCount;
    const slider = document.getElementById('friendSlider'); slider.max = bankFriends;
    if (parseInt(slider.value) > bankFriends) slider.value = bankFriends;
    updateSlider();
}

function nestLoop() {
    if (gameState !== 'nest') return;
    let suppressEffects = nestInitialFrame;
    nestInitialFrame = false;
    let breedResult = updateBreeding();
    if (breedResult.newBabiesTotal > 0 || breedResult.newAdultsTotal > 0) {
        applyBreedingChanges(breedResult, suppressEffects);
        updateNestUI();
    }
    let seedsBefore = bankSeeds;
    tickBackgroundFarm();
    if (bankSeeds !== seedsBefore) updateNestUI();
    let now = Date.now();
    nestHamsters.forEach(h => {
        if (h.stage === 2 && h.breedingStartedAt > 0) {
            let progress = (now - h.breedingStartedAt) / BREEDING_CONFIG.babyGrowthTime;
            if (progress >= 0.5) {
                h.stage = 1;
                h.size = 65;
                h.state = 'idle';
                h.timer = 20 + Math.random() * 60;
            }
        }
    });
    cachedSafeBottomY = getSafeBottomY();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffeaa7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let floorY = canvas.height * NEST_FLOOR_RATIO;
    ctx.fillStyle = '#fdcb6e'; ctx.fillRect(0, floorY, canvas.width, canvas.height - floorY);
    ctx.fillStyle = '#e1b12c'; ctx.fillRect(0, floorY, canvas.width, 10);

    let mySize = 200;
    let myY = floorY + 100;
    if (myY + mySize / 2 > cachedSafeBottomY) myY = cachedSafeBottomY - mySize / 2 - 10;
    nestMainHamBottomY = myY + mySize / 2;

    let excessSeeds = bankSeeds - nestSeeds.length;
    if (excessSeeds > 0) drawStaticSeedPile(canvas.width / 2, floorY, excessSeeds);
    nestSeeds.forEach(s => s.update()); solvePhysics(); nestSeeds.forEach(s => s.draw());
    
    nestHamsters.sort((a, b) => a.y - b.y);
    nestHamsters.forEach(h => { h.update(); h.draw(); });

    nestEffects = nestEffects.filter(e => e.update());
    nestEffects.forEach(e => e.draw());

    ctx.save(); ctx.translate(canvas.width/2 - mySize/2, myY - mySize/2);
    if (sprites.idle.loaded) ctx.drawImage(sprites.idle.img, 0, 0, mySize, mySize);
    else { ctx.fillStyle = '#ff3f34'; ctx.fillRect(0, 0, mySize, mySize); }
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('← 畑へスワイプ', 15, 20);

    requestAnimationFrame(nestLoop);
}

function drawStaticSeedPile(x, y, count) {
    let totalImages = Math.max(1, Math.ceil(count / 1000));
    let baseW = 240;
    let baseH = 120;
    if (sprites.seedMount.loaded) {
        let ratio = sprites.seedMount.img.naturalHeight / sprites.seedMount.img.naturalWidth;
        baseH = baseW * ratio;
    }

    let n = 1;
    while (n * (n + 1) / 2 < totalImages) n++;
    let layers = [];
    for (let i = 0; i < n; i++) layers.push(n - i);
    let excess = n * (n + 1) / 2 - totalImages;
    for (let i = layers.length - 1; i >= 0 && excess > 0; i--) {
        let remove = Math.min(layers[i], excess);
        layers[i] -= remove;
        excess -= remove;
    }
    layers = layers.filter(l => l > 0);

    let spacingX = baseW * 0.75;
    let spacingY = baseH * 0.1;

    for (let li = 0; li < layers.length; li++) {
        let num = layers[li];
        let rowW = (num - 1) * spacingX + baseW;
        let sx = x - rowW / 2;
        let sy = y - baseH + 15 - li * spacingY;
        for (let j = 0; j < num; j++) {
            let ix = sx + j * spacingX;
            if (sprites.seedMount.loaded) {
                ctx.drawImage(sprites.seedMount.img, ix, sy, baseW, baseH);
            } else {
                ctx.fillStyle = '#d4ac0d';
                ctx.beginPath();
                ctx.ellipse(ix + baseW / 2, sy + baseH * 0.7, baseW / 2, baseH / 2, 0, Math.PI, 0);
                ctx.fill();
            }
        }
    }

    let topY = y + 15 - baseH - (layers.length - 1) * spacingY;
    ctx.fillStyle = '#9a7d0a'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`+ ${count} Seeds`, x, topY - 5);
}

function solvePhysics() {
    let awake = nestSeeds.filter(s => !s.sleeping);
    if (awake.length === 0) return;
    const iter = 2;
    for (let k = 0; k < iter; k++) {
        for (let ai = 0; ai < awake.length; ai++) {
            let s1 = awake[ai];
            for (let j = 0; j < nestSeeds.length; j++) {
                let s2 = nestSeeds[j];
                if (s1 === s2) continue;
                let dx = s2.x - s1.x; let dy = s2.y - s1.y;
                let distSq = dx*dx + dy*dy;
                let minDist = s1.physRadius + s2.physRadius;
                if (distSq < minDist * minDist && distSq > 0) {
                    let dist = Math.sqrt(distSq); let overlap = minDist - dist;
                    let forceX = (dx / dist) * overlap * 0.5; let forceY = (dy / dist) * overlap * 0.5;
                    s1.x -= forceX; s1.y -= forceY; s2.x += forceX; s2.y += forceY;
                    if (s2.sleeping) { s2.sleeping = false; s2.vx = forceX * 0.5; s2.vy = forceY * 0.5; }
                    let avgVx = (s1.vx + s2.vx) * 0.5; let avgVy = (s1.vy + s2.vy) * 0.5;
                    s1.vx = s1.vx * 0.9 + avgVx * 0.1; s1.vy = s1.vy * 0.9 + avgVy * 0.1;
                    s2.vx = s2.vx * 0.9 + avgVx * 0.1; s2.vy = s2.vy * 0.9 + avgVy * 0.1;
                }
            }
        }
    }
}

function updateSlider() {
    const slider = document.getElementById('friendSlider');
    selectedFriendsCount = parseInt(slider.value);
    document.getElementById('takeCount').innerText = selectedFriendsCount;
}

function departFromNest() {
    bankFriends -= selectedFriendsCount; saveData();
    document.getElementById('nestUI').style.display = 'none'; document.getElementById('gameUI').style.display = 'block';
    document.getElementById('pageIndicator').style.display = 'none';
    resize();
    resetGame(selectedFriendsCount);
}
