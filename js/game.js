// ==========================================
// ゲームロジック（冒険パート）
// ==========================================
let isPlaying = false;
let score = 0;
let seedsCollected = 0;
let gravity = 0.6;
let speed = 7;
let nextFriendScoreTarget = 1000;
let spawnFriendFlag = false;
let playerHistory = []; 

function getMaxSeedCapacity() { return (1 + followers.length) * SEED_CAPACITY_PER_HAMSTER; }

const player = {
    x: 150, y: 0, width: 68, height: 68, dy: 0, jumpPower: -13, color: '#ff3f34', isGrounded: false, jumpCount: 0, maxJumps: 2,
    draw: function() {
        let img = sprites.run.loaded ? sprites.run.img : null;
        let bobY = 0;
        if (!this.isGrounded) {
            if (this.jumpCount === 2) img = sprites.djump.loaded ? sprites.djump.img : img;
            else img = sprites.jump.loaded ? sprites.jump.img : img;
        } else {
            bobY = Math.sin(Date.now() / 13) * 1;
        }
        if(img) ctx.drawImage(img, this.x, this.y + bobY, this.width, this.height);
        else { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y + bobY, this.width, this.height); }
    },
    update: function() {
        this.dy += gravity; this.y += this.dy;
        if (this.y > canvas.height) gameOver();
    },
    jump: function() {
        if (this.isGrounded || this.jumpCount < this.maxJumps) {
            this.dy = this.jumpPower; this.jumpCount++; this.isGrounded = false;
            if (this.jumpCount === 2) this.dy = this.jumpPower * 0.9;
        } else if (followers.length > 0) {
            this.dy = this.jumpPower; this.isGrounded = false;
            followers.shift(); detachedFriends.push(new DetachedFriend(this.x, this.y + this.height));
            let currentMax = getMaxSeedCapacity(); if (seedsCollected > currentMax) seedsCollected = currentMax; updateSeedDisplay();
        }
    },
    land: function(y) { this.y = y - this.height; this.dy = 0; this.isGrounded = true; this.jumpCount = 0; }
};

class DetachedFriend {
    constructor(x, y) { this.x = x; this.y = y; this.width = 68; this.height = 68; this.dy = 5; this.isDead = false; }
    update() { this.dy += gravity; this.y += this.dy; this.x -= speed; }
    draw() {
        if (sprites.fall.loaded) {
            ctx.save(); ctx.translate(this.x + this.width/2, this.y + this.height/2); 
            ctx.rotate(Math.random()); 
            ctx.drawImage(sprites.fall.img, -this.width/2, -this.height/2, this.width, this.height); ctx.restore();
        } else { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(this.x, this.y, this.width, this.height); }
    }
}
let detachedFriends = [];

class Seed {
    constructor(x, y) { this.x = x; this.y = y; this.width = 22; this.height = 28; this.collected = false; }
    draw() {
        if (this.collected) return;
        if (seedThumb) ctx.drawImage(seedThumb, this.x, this.y, this.width, this.height);
        else if (sprites.seed.loaded) ctx.drawImage(sprites.seed.img, this.x, this.y, this.width, this.height);
        else { ctx.fillStyle = '#6F4E37'; ctx.beginPath(); ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/2, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    update() { this.x -= speed; }
}
let seeds = [];

class Collectible {
    constructor(x, y) { this.x = x; this.y = y; this.width = 68; this.height = 68; }
    draw() {
        ctx.globalAlpha = 1.0;
        if (sprites.idle.loaded) ctx.drawImage(sprites.idle.img, this.x, this.y, this.width, this.height);
        else { ctx.fillStyle = '#feca57'; ctx.fillRect(this.x, this.y, this.width, this.height); }
    }
    update() { this.x -= speed; }
}
let collectibles = []; let followers = []; let platforms = [];

function getRandomPattern() {
    let totalWeight = 0; for (let key in SPAWN_PATTERNS) totalWeight += SPAWN_PATTERNS[key].weight;
    let random = Math.random() * totalWeight; let currentWeight = 0;
    for (let key in SPAWN_PATTERNS) { currentWeight += SPAWN_PATTERNS[key].weight; if (random < currentWeight) return SPAWN_PATTERNS[key]; }
    return SPAWN_PATTERNS.normal;
}

class SlopePlatform {
    constructor(x, y, width, slopeType) {
        this.x = x; this.y = y; this.width = width; this.slopeType = slopeType;
        const heightDiff = width * 0.5;
        if (slopeType === 1) { this.endY = this.y - heightDiff; this.slopeFactor = -heightDiff / width; }
        else if (slopeType === -1) { this.endY = this.y + heightDiff; this.slopeFactor = heightDiff / width; }
        else { this.endY = this.y; this.slopeFactor = 0; }
        this.pillars = []; let currentX = 0;
        while (currentX < this.width) {
            let w = PILLAR_CONFIG.minWidth + Math.random() * (PILLAR_CONFIG.maxWidth - PILLAR_CONFIG.minWidth);
            let g = PILLAR_CONFIG.minGap + Math.random() * (PILLAR_CONFIG.maxGap - PILLAR_CONFIG.minGap);
            if (currentX + w > this.width) w = this.width - currentX;
            let pillarTopY = this.y + (currentX * this.slopeFactor);
            this.pillars.push({ relX: currentX, endRelX: currentX + w, y: pillarTopY, w: w }); currentX += w + g;
        }
    }
    getPillarHeightAt(targetX) {
        let relX = targetX - this.x; if (relX < 0 || relX > this.width) return null;
        for (let p of this.pillars) { if (relX >= p.relX && relX <= p.endRelX) return p.y; } return null;
    }
    draw() {
        ctx.fillStyle = PILLAR_CONFIG.baseColor;
        for (let p of this.pillars) {
            let drawX = this.x + p.relX; if (drawX > canvas.width || drawX + p.w < 0) continue;
            ctx.fillRect(drawX, p.y, p.w, canvas.height - p.y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.width, this.endY); ctx.stroke();
    }
    update() { this.x -= speed; }
}

function addPlatform(x, pattern) {
    const width = pattern.width.min + Math.random() * (pattern.width.max - pattern.width.min);
    let lastEndY = platforms.length > 0 ? platforms[platforms.length - 1].endY : canvas.height / 2;
    let startY = lastEndY + (Math.random() * 200 - 100); 
    if (startY < 150) startY = 150; if (startY > canvas.height - 150) startY = canvas.height - 150;
    const r = Math.random(); let type = 0;
    if (r < 0.4) type = 1; else if (r < 0.7) type = -1; else type = 0;
    if (startY < 200) type = -1; if (startY > canvas.height - 200) type = 1;
    const newPlatform = new SlopePlatform(x, startY, width, type); platforms.push(newPlatform);
    let seedInterval = 60; let currentSeedX = 30;
    while (currentSeedX < width - 30) {
        if (Math.random() < 0.7) {
            let isAir = Math.random() < 0.3;
            let groundY = newPlatform.y + (currentSeedX * newPlatform.slopeFactor);
            let seedY = isAir ? groundY - 100 - (Math.random() * 50) : groundY - 25; 
            let seedX = newPlatform.x + currentSeedX; seeds.push(new Seed(seedX, seedY));
        }
        currentSeedX += seedInterval;
    }
    if (spawnFriendFlag) {
        let centerX = width / 2; let centerY = newPlatform.y + (centerX * newPlatform.slopeFactor);
        let itemY = centerY - 45; 
        let itemX = x + centerX;
        collectibles.push(new Collectible(itemX, itemY)); spawnFriendFlag = false;
    }
}

function gameLoop() {
    if (gameState !== 'playing') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.update();
    playerHistory.unshift({ footY: player.y + player.height, isGrounded: player.isGrounded, jumpCount: player.jumpCount }); 
    let maxHistory = (followers.length + 1) * 15; if (playerHistory.length > maxHistory + 100) playerHistory.length = maxHistory + 100;
    if (score >= nextFriendScoreTarget) { spawnFriendFlag = true; nextFriendScoreTarget += (FRIEND_INTERVAL_METER * 10); }
    if (platforms.length === 0 || platforms[platforms.length - 1].x < canvas.width - 50) {
        if (platforms.length === 0) addPlatform(0, SPAWN_PATTERNS.normal);
        else {
            let pattern = getRandomPattern();
            let gap = pattern.gap.min + Math.random() * (pattern.gap.max - pattern.gap.min);
            let lastPlatform = platforms[platforms.length - 1];
            let spawnX = lastPlatform.x + lastPlatform.width + gap;
            addPlatform(spawnX, pattern);
        }
    }
    player.isGrounded = false;
    for (let i = 0; i < platforms.length; i++) {
        let plat = platforms[i]; plat.update(); plat.draw();
        if (player.x + player.width > plat.x && player.x < plat.x + plat.width) {
            let footX = player.x + player.width / 2; let pillarY = plat.getPillarHeightAt(footX);
            if (pillarY !== null) { if (player.y + player.height >= pillarY - 10 && player.y + player.height <= pillarY + 30 && player.dy >= 0) player.land(pillarY); }
        }
        for (let j = 0; j < detachedFriends.length; j++) {
            let df = detachedFriends[j];
            if (!df.isDead && df.x + df.width > plat.x && df.x < plat.x + plat.width) {
                let dfFootX = df.x + df.width / 2; let dfPillarY = plat.getPillarHeightAt(dfFootX);
                if (dfPillarY !== null) {
                    if (df.y + df.height >= dfPillarY - 10 && df.y + df.height <= dfPillarY + 30 && df.dy >= 0) { 
                        followers.push({}); 
                        df.isDead = true; 
                        updateSeedDisplay(); 
                    }
                }
            }
        }
        if (plat.x + plat.width < 0) { platforms.splice(i, 1); i--; }
    }
    for (let i = 0; i < detachedFriends.length; i++) {
        let df = detachedFriends[i]; df.update(); df.draw();
        if (df.y > canvas.height || df.x + df.width < 0 || df.isDead) { detachedFriends.splice(i, 1); i--; }
    }
    for (let i = 0; i < seeds.length; i++) {
        let seed = seeds[i]; seed.update(); seed.draw();
        if (!seed.collected && player.x < seed.x + seed.width && player.x + player.width > seed.x && player.y < seed.y + seed.height && player.y + player.height > seed.y) {
            let currentMax = getMaxSeedCapacity();
            if (seedsCollected < currentMax) { seed.collected = true; seedsCollected++; updateSeedDisplay(); }
        }
        if (seed.x + seed.width < 0 || (seed.collected && seed.x < player.x - 200)) { seeds.splice(i, 1); i--; }
    }
    for (let i = 0; i < collectibles.length; i++) {
        let item = collectibles[i]; item.update(); item.draw();
        if (player.x < item.x + item.width && player.x + player.width > item.x && player.y < item.y + item.height && player.y + player.height > item.y) {
            followers.push({}); collectibles.splice(i, 1); i--; updateSeedDisplay();
        } else if (item.x + item.width < 0) { collectibles.splice(i, 1); i--; }
    }
    for (let i = 0; i < followers.length; i++) {
        let delayFrame = 7 * (i + 1);
        let size = 68;
        let pastState = playerHistory[delayFrame] || playerHistory[playerHistory.length-1];
        
        if (pastState) {
            let followX = player.x - (delayFrame * speed);
            let drawY = pastState.footY - size;
            let bobY = 0;

            if (followX > -100) {
                let img = sprites.run.loaded ? sprites.run.img : null;
                if (!pastState.isGrounded) {
                    if (pastState.jumpCount === 2) img = sprites.djump.loaded ? sprites.djump.img : img;
                    else img = sprites.jump.loaded ? sprites.jump.img : img;
                } else {
                    bobY = Math.sin(Date.now() / 13 + (i + 1) * 1.2) * 1;
                }
                if(img) ctx.drawImage(img, followX, drawY + bobY, size, size);
                else { ctx.fillStyle = '#ff9f43'; ctx.fillRect(followX, drawY + bobY, size, size); }
            }
        } else {
            let followX = player.x - ((i + 1) * 50);
            let bobY = Math.sin(Date.now() / 13 + (i + 1) * 1.2) * 1;
            if(sprites.run.loaded) ctx.drawImage(sprites.run.img, followX, player.y + bobY, size, size);
            else { ctx.fillStyle = '#ff9f43'; ctx.fillRect(followX, player.y + bobY, size, size); }
        }
    }
    player.draw(); score++; document.getElementById('score').innerText = 'Distance: ' + Math.floor(score / 10) + 'm';
    requestAnimationFrame(gameLoop);
}

function updateSeedDisplay() {
    let currentMax = getMaxSeedCapacity();
    document.getElementById('seedCount').innerText = `Seeds: ${seedsCollected} / ${currentMax}`;
}

function pauseGame() { if (gameState !== 'playing') return; gameState = 'paused'; document.getElementById('pauseModal').style.display = 'block'; }

function confirmGoHome() { 
    gameState = 'nest'; 
    let log = processTimePassage(seedsCollected, followers.length);
    document.getElementById('logContent').innerHTML = log.join('<br>');
    document.getElementById('logModal').style.display = 'block';
    document.getElementById('pauseModal').style.display = 'none'; 
    initNest(); 
}
function closeLog() { document.getElementById('logModal').style.display = 'none'; }
function cancelGoHome() { gameState = 'playing'; document.getElementById('pauseModal').style.display = 'none'; gameLoop(); }

function gameOver() {
    gameState = 'gameover'; 
    saveData();
    const modal = document.getElementById('gameOverModal');
    const text = document.getElementById('overlayText');
    text.innerHTML = `<h2>Game Over</h2><p>Distance: ${Math.floor(score / 10)}m</p><p>種ロスト: ${seedsCollected}</p><p style="font-size:14px; color:#aaa;">仲間とはぐれてしまった...</p>`;
    modal.style.display = 'block';
}

function resetGame(initialFollowersCount = 0) {
    gameState = 'playing';
    document.getElementById('gameOverModal').style.display = 'none'; document.getElementById('pauseModal').style.display = 'none'; document.getElementById('instruction').style.display = 'none';
    platforms = []; seeds = []; collectibles = []; followers = []; detachedFriends = []; playerHistory = [];
    player.x = 150; player.y = canvas.height / 2; player.width = 68; player.height = 68; player.dy = 0; player.jumpCount = 0; player.color = '#ff3f34';
    for(let i=0; i<initialFollowersCount; i++){ 
        followers.push({}); 
        for(let j=0; j<15; j++) playerHistory.push({footY: player.y + player.height, isGrounded:true, jumpCount:0}); 
    }
    spawnFriendFlag = false; nextFriendScoreTarget = 1000; seedsCollected = 0; 
    updateSeedDisplay();
    platforms.push(new SlopePlatform(0, canvas.height / 2 + 100, canvas.width, 0));
    score = 0; document.getElementById('score').innerText = 'Distance: 0m';
    gameLoop();
}
