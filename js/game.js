// ==========================================
// ゲームロジック（冒険パート）
// ==========================================
let isPlaying = false;
let score = 0;
let seedsCollected = 0;
let gravity = 0.6;
let baseSpeed = 7;
let speed = 7;
let isBoosted = false;
let sacrificeCount = 0;
let nextFriendScoreTarget = 1000;
let spawnFriendFlag = false;
let playerHistory = [];
let walls = [];
let wallSerial = 0;
let followerSerial = 0;
let nextWallScoreTarget = (WALL_CONFIG.debugFirstSpawnMeter || WALL_CONFIG.spawnIntervalMeter) * 10;
let wallEffects = [];
let cameraX = 0;
let cameraLeadPx = 180;
let worldFloorY = 0;
let pendingGameOverNestLog = null;
const FOLLOWER_DELAY_BASE = 9;
const FOLLOWER_SPACING_SCALE = 0.75;
const SLOPE_STICK_SNAP = 16;

function getMaxSeedCapacity() { return (1 + followers.length) * SEED_CAPACITY_PER_HAMSTER; }
function createFollower() {
    return {
        id: ++followerSerial,
        attachedWallId: null,
        wallState: 'none',
        wallRamCooldown: 0,
        isCollidingWall: false,
        collidingWallId: null,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        isGrounded: false,
        jumpCount: 0,
        approachPhase: 'run',
        approachX: 0,
        approachY: 0,
        approachVx: 0,
        approachVy: 0,
        lastRenderX: 0,
        lastRenderY: 0
    };
}
function ensureFollowerState(follower) {
    if (!follower || typeof follower !== 'object') return createFollower();
    if (follower.id === undefined) follower.id = ++followerSerial;
    if (follower.attachedWallId === undefined) follower.attachedWallId = null;
    if (follower.wallState === undefined) follower.wallState = 'none';
    if (follower.wallRamCooldown === undefined) follower.wallRamCooldown = 0;
    if (follower.isCollidingWall === undefined) follower.isCollidingWall = false;
    if (follower.collidingWallId === undefined) follower.collidingWallId = null;
    if (follower.x === undefined) follower.x = player.x;
    if (follower.y === undefined) follower.y = player.y;
    if (follower.prevX === undefined) follower.prevX = follower.x;
    if (follower.prevY === undefined) follower.prevY = follower.y;
    if (follower.vx === undefined) follower.vx = 0;
    if (follower.vy === undefined) follower.vy = 0;
    if (follower.isGrounded === undefined) follower.isGrounded = false;
    if (follower.jumpCount === undefined) follower.jumpCount = 0;
    if (follower.approachPhase === undefined) follower.approachPhase = 'run';
    if (follower.approachX === undefined) follower.approachX = 0;
    if (follower.approachY === undefined) follower.approachY = 0;
    if (follower.approachVx === undefined) follower.approachVx = 0;
    if (follower.approachVy === undefined) follower.approachVy = 0;
    if (follower.lastRenderX === undefined) follower.lastRenderX = 0;
    if (follower.lastRenderY === undefined) follower.lastRenderY = 0;
    return follower;
}

const player = {
    x: 150, y: 0, width: 68, height: 68, dy: 0, jumpPower: -13, color: '#ff3f34', isGrounded: false, jumpCount: 0, maxJumps: 2,
    isWallAttached: false,
    isCollidingWall: false,
    collidingWallId: null,
    wallRamCooldown: 0,
    vx: 0,
    prevX: 0,
    prevY: 0,
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
        this.prevX = this.x;
        this.prevY = this.y;
        if (this.vx <= 0) {
            this.vx += WALL_CONFIG.runAcceleration;
            if (this.vx > 0) this.vx = speed;
        } else {
            this.vx = speed;
        }
        this.x += this.vx;
        this.dy += gravity; this.y += this.dy;
        if (this.y > canvas.height) gameOver();
    },
    jump: function() {
        if (this.isGrounded || this.jumpCount < this.maxJumps) {
            // ジャンプ入力時は、壁反発による後退中でも通常前進速度へ復帰する。
            this.vx = speed;
            this.dy = this.jumpPower; this.jumpCount++; this.isGrounded = false;
            if (this.jumpCount === 2) this.dy = this.jumpPower * 0.9;
        } else if (followers.length > 0) {
            this.vx = speed;
            this.dy = this.jumpPower; this.isGrounded = false;
            followers.shift(); detachedFriends.push(new DetachedFriend(this.x, this.y + this.height));
            let currentMax = getMaxSeedCapacity(); if (seedsCollected > currentMax) seedsCollected = currentMax; updateSeedDisplay();
            sacrificeCount++;
            if (sacrificeCount >= 2) {
                isBoosted = true;
                speed = Math.min(speed + baseSpeed * 0.15, baseSpeed * 2.5);
            }
        }
    },
    land: function(y) {
        this.y = y - this.height; this.dy = 0; this.isGrounded = true; this.jumpCount = 0;
        if (isBoosted) {
            isBoosted = false;
        }
        sacrificeCount = 0;
    }
};

function getCameraRight() {
    return cameraX + canvas.width;
}

function updateCamera() {
    let lead = speed * 10 + cameraLeadPx;
    let targetX = player.x - (canvas.width * 0.35) + lead;
    if (targetX < 0) targetX = 0;
    cameraX += (targetX - cameraX) * 0.14;
}

class DetachedFriend {
    constructor(x, y) { this.x = x; this.y = y; this.width = 68; this.height = 68; this.dy = 5; this.isDead = false; }
    update() { this.dy += gravity; this.y += this.dy; this.x -= 1.2; }
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
    constructor(x, y, falling = false) {
        this.x = x;
        this.y = y;
        this.width = 22;
        this.height = 28;
        this.collected = false;
        this.magnet = false;
        this.value = 1;
        this.isFalling = !!falling;
        this.fallVx = falling ? ((Math.random() - 0.5) * 2.2) : 0;
        this.fallVy = falling ? (1.5 + Math.random() * 2.5) : 0;
    }
    draw() {
        if (this.collected) return;
        if (seedThumb) ctx.drawImage(seedThumb, this.x, this.y, this.width, this.height);
        else if (sprites.seed.loaded) ctx.drawImage(sprites.seed.img, this.x, this.y, this.width, this.height);
        else { ctx.fillStyle = '#6F4E37'; ctx.beginPath(); ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/2, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    update() {
        if (this.isFalling && !this.collected) {
            this.fallVy += gravity * 0.45;
            this.x += this.fallVx;
            this.y += this.fallVy;
            this.fallVx *= 0.98;
            let groundY = getGroundYAt(this.x + this.width / 2);
            if (groundY !== null && this.y + this.height >= groundY) {
                this.y = groundY - this.height;
                this.fallVx = 0;
                this.fallVy = 0;
                this.isFalling = false;
            }
        }
        if (this.magnet && !this.collected) {
            if (this.mx === undefined) { this.mx = 0; this.my = 0; }
            this.mx *= 0.85;
            this.my *= 0.85;
            let dx = (player.x + player.width / 2) - (this.x + this.width / 2);
            let dy = (player.y + player.height / 2) - (this.y + this.height / 2);
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                this.mx += dx / dist * 3;
                this.my += dy / dist * 3;
                let spd = Math.sqrt(this.mx * this.mx + this.my * this.my);
                if (spd > 35) { this.mx *= 35 / spd; this.my *= 35 / spd; }
                this.x += this.mx;
                this.y += this.my;
            }
        }
    }
}
let seeds = [];

class Collectible {
    constructor(x, y, falling = false) {
        this.x = x;
        this.y = y;
        this.width = 68;
        this.height = 68;
        this.magnet = false;
        this.isFalling = !!falling;
        this.fallVx = falling ? ((Math.random() - 0.5) * 1.8) : 0;
        this.fallVy = falling ? (1.2 + Math.random() * 2.0) : 0;
    }
    draw() {
        ctx.globalAlpha = 1.0;
        if (sprites.idle.loaded) ctx.drawImage(sprites.idle.img, this.x, this.y, this.width, this.height);
        else { ctx.fillStyle = '#feca57'; ctx.fillRect(this.x, this.y, this.width, this.height); }
    }
    update() {
        if (this.isFalling) {
            this.fallVy += gravity * 0.45;
            this.x += this.fallVx;
            this.y += this.fallVy;
            this.fallVx *= 0.98;
            let groundY = getGroundYAt(this.x + this.width / 2);
            if (groundY !== null && this.y + this.height >= groundY) {
                this.y = groundY - this.height;
                this.fallVx = 0;
                this.fallVy = 0;
                this.isFalling = false;
            }
        }
        if (this.magnet) {
            if (this.mx === undefined) { this.mx = 0; this.my = 0; }
            this.mx *= 0.85;
            this.my *= 0.85;
            let dx = (player.x + player.width / 2) - (this.x + this.width / 2);
            let dy = (player.y + player.height / 2) - (this.y + this.height / 2);
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                this.mx += dx / dist * 3;
                this.my += dy / dist * 3;
                let spd = Math.sqrt(this.mx * this.mx + this.my * this.my);
                if (spd > 35) { this.mx *= 35 / spd; this.my *= 35 / spd; }
                this.x += this.mx;
                this.y += this.my;
            }
        }
    }
}
let collectibles = []; let followers = []; let platforms = [];

function spawnWallBreakRewards(wall) {
    if (!wall) return;
    let wallHpOnBreak = Math.max(1, Math.floor(wall.maxHp || 1));
    let seedDropCount = wallHpOnBreak;
    let friendDropCount = Math.max(1, Math.floor(wallHpOnBreak / 100));
    let dropCenterX = cameraX + canvas.width * 0.75;
    let dropSpread = Math.max(120, wall.width * 2.4);

    for (let i = 0; i < seedDropCount; i++) {
        let sx = dropCenterX + (Math.random() - 0.5) * dropSpread;
        let sy = -20 - Math.random() * 220;
        seeds.push(new Seed(sx, sy, true));
    }
    for (let i = 0; i < friendDropCount; i++) {
        let ix = dropCenterX + (Math.random() - 0.5) * (dropSpread * 0.75);
        let iy = -40 - Math.random() * 260;
        collectibles.push(new Collectible(ix, iy, true));
    }
}

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
            let drawX = this.x + p.relX; if (drawX > getCameraRight() + 80 || drawX + p.w < cameraX - 80) continue;
            ctx.fillRect(drawX, p.y, p.w, canvas.height - p.y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.width, this.endY); ctx.stroke();
    }
    update() {}
}

class BreakableWall {
    constructor(x, groundY, hp) {
        this.id = ++wallSerial;
        this.x = x;
        this.width = WALL_CONFIG.width;
        this.height = canvas.height;
        this.y = 0;
        this.hp = hp;
        this.maxHp = hp;
        this.engaged = false;
        this.destroyed = false;
        this.pendingDamage = 0;
        this.recentHitFrames = 0;
        this.attackers = [];
        this.attackerKeys = new Set();
    }
    update() {
        if (this.destroyed) return;
        this.engaged = this.recentHitFrames > 0;
        if (this.recentHitFrames > 0) this.recentHitFrames--;
    }
    draw() {
        if (this.destroyed) return;
        this.height = canvas.height;
        this.y = 0;
        ctx.fillStyle = '#7f5a3f';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#5f412c';
        ctx.fillRect(this.x + this.width - 10, this.y, 10, this.height);

        let hpRatio = Math.max(0, this.hp) / this.maxHp;
        let barH = Math.max(120, Math.floor(canvas.height * 0.34));
        let barW = 8;
        let barX = this.x + this.width * 0.5 - barW * 0.5;
        let barY = this.y + canvas.height * 0.33 - barH * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#2f3640';
        ctx.fillRect(barX, barY, barW, barH);
        let fillH = barH * hpRatio;
        let fillY = barY + (barH - fillH);
        ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : (hpRatio > 0.25 ? '#f39c12' : '#ff4757');
        ctx.fillRect(barX, fillY, barW, fillH);
    }
}

class BiteParticle {
    constructor(x, y, burst = false) {
        this.x = x;
        this.y = y;
        if (burst) {
            this.vx = (Math.random() - 0.5) * 8.5;
            this.vy = (Math.random() - 0.5) * 8.5;
        } else {
            this.vx = -2.8 - Math.random() * 2.4;
            this.vy = (Math.random() - 0.5) * 2.4;
        }
        this.size = 2 + Math.random() * 2.5;
        this.life = WALL_CONFIG.particleLifeMin + Math.random() * (WALL_CONFIG.particleLifeMax - WALL_CONFIG.particleLifeMin);
        this.maxLife = this.life;
        this.color = Math.random() < 0.5 ? '#c9a57a' : '#9f764f';
        this.burst = burst;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.burst) this.vy += 0.12;
        this.vx *= this.burst ? 0.97 : 0.95;
        this.vy *= this.burst ? 0.97 : 0.95;
        this.life -= 1;
        return this.life > 0;
    }
    draw() {
        let alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

function hasEngagedWall() {
    return false;
}

function getGroundYAt(targetX) {
    for (let i = platforms.length - 1; i >= 0; i--) {
        let p = platforms[i];
        if (targetX >= p.x && targetX <= p.x + p.width) {
            let y = p.getPillarHeightAt(targetX);
            if (y !== null) return y;
        }
    }
    return null;
}

function spawnBreakableWall() {
    let spawnX = prepareWallSpawnX();
    let groundY = 0;
    let distanceMeters = Math.max(0, (spawnX - 150) / WALL_CONFIG.pxPerMeter);
    let hp = Math.max(1, Math.floor(distanceMeters / 10));
    walls.push(new BreakableWall(spawnX, groundY, hp));
}

function hasGroundCoverage(startX, endX) {
    let sx = Math.min(startX, endX);
    let ex = Math.max(startX, endX);
    for (let x = sx; x <= ex; x += 20) {
        if (getGroundYAt(x) === null) return false;
    }
    return true;
}

function prepareWallSpawnX() {
    let runupMeters = WALL_CONFIG.safeRunupMeterMin + Math.random() * (WALL_CONFIG.safeRunupMeterMax - WALL_CONFIG.safeRunupMeterMin);
    let runupPx = runupMeters * WALL_CONFIG.pxPerMeter;
    let postRunPx = Math.max(0, (WALL_CONFIG.safeAfterWallMeter || 0) * WALL_CONFIG.pxPerMeter);
    let desiredX = getCameraRight() + WALL_CONFIG.spawnAheadX;
    let lastPlatform = platforms.length > 0 ? platforms[platforms.length - 1] : null;
    let runStartX = lastPlatform ? (lastPlatform.x + lastPlatform.width) : desiredX;
    let runY = lastPlatform ? lastPlatform.endY : (worldFloorY || (canvas.height * 0.75));

    // 既存床の末端から連続した長い床を生成してから壁を置く。
    let wallX = Math.max(desiredX, runStartX + runupPx);
    let runEndX = wallX + WALL_CONFIG.width + 30 + postRunPx;
    let safeMinY = 170;
    let safeMaxY = canvas.height - 170;
    let targetRunY = Math.max(safeMinY, Math.min(safeMaxY, runY));
    let cursorX = runStartX;
    let cursorY = runY;

    // 高低差が大きい場合は、平坦の長距離床の前に上り/下りで安全帯へ戻す。
    let deltaY = targetRunY - cursorY;
    if (Math.abs(deltaY) > 2) {
        let slopeType = deltaY < 0 ? 1 : -1;
        let slopeWidth = Math.max(24, Math.abs(deltaY) * 2);
        platforms.push(new SlopePlatform(cursorX, cursorY, slopeWidth, slopeType));
        cursorX += slopeWidth;
        cursorY = targetRunY;
    }

    let runWidth = Math.max(180, runEndX - cursorX);
    platforms.push(new SlopePlatform(cursorX, cursorY, runWidth, 0));
    return wallX;
}

function isHamsterOverlappingWall(hamsterX, hamsterY, size, wall) {
    return hamsterX < wall.x + wall.width &&
           hamsterX + size > wall.x;
}

function getBodyCollider(body, width, height) {
    return {
        x: body.x,
        y: body.y,
        width: width,
        height: height
    };
}

function getWallCollider(wall) {
    // 描画は画面内の高さのまま、衝突判定だけ上方向へ十分拡張して
    // ジャンプで壁上を越えられないようにする。
    const collisionTop = -200000;
    const collisionBottom = canvas.height + 200000;
    return {
        x: wall.x,
        y: collisionTop,
        width: wall.width,
        height: collisionBottom - collisionTop
    };
}

function intersectsAabb(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function resolveBodyWallCollision(body, bodyWidth, bodyHeight, wall) {
    let bodyCol = getBodyCollider(body, bodyWidth, bodyHeight);
    let wallCol = getWallCollider(wall);
    if (!intersectsAabb(bodyCol, wallCol)) return null;

    let overlapLeft = (bodyCol.x + bodyCol.width) - wallCol.x;
    let overlapRight = (wallCol.x + wallCol.width) - bodyCol.x;
    let overlapTop = (bodyCol.y + bodyCol.height) - wallCol.y;
    let overlapBottom = (wallCol.y + wallCol.height) - bodyCol.y;
    let minX = Math.min(overlapLeft, overlapRight);
    let minY = Math.min(overlapTop, overlapBottom);
    let prevX = body.prevX !== undefined ? body.prevX : body.x;
    let deltaX = body.x - prevX;
    let prevRight = prevX + bodyWidth;
    let cameFromLeft = prevRight <= wallCol.x + 1 && body.vx >= 0;
    let cameFromRight = prevX >= wallCol.x + wallCol.width - 1 && body.vx <= 0;
    let preferHorizontal = cameFromLeft || cameFromRight;
    let impactVx = Math.max(body.vx || 0, deltaX, 0);

    if (preferHorizontal || minX <= minY) {
        if (overlapLeft <= overlapRight) body.x -= overlapLeft + 0.1;
        else body.x += overlapRight + 0.1;
        let bounceSpeed = Math.max(0, impactVx);
        body.vx = -bounceSpeed;
        body.isGrounded = false;
        return { normal: 'x', impactSpeed: Math.max(0, impactVx) };
    }

    if (overlapTop <= overlapBottom) {
        body.y -= overlapTop + 0.1;
        if (body.dy !== undefined) body.dy = Math.min(0, body.dy);
        if (body.vy !== undefined) body.vy = Math.min(0, body.vy);
    } else {
        body.y += overlapBottom + 0.1;
        if (body.dy !== undefined) body.dy = Math.max(0, body.dy);
        if (body.vy !== undefined) body.vy = Math.max(0, body.vy);
    }
    return { normal: 'y', impactSpeed: 0 };
}

function resetWallCollisionFlags() {
    player.isCollidingWall = false;
    player.collidingWallId = null;
    for (let i = 0; i < followers.length; i++) {
        let f = ensureFollowerState(followers[i]);
        f.isCollidingWall = false;
        f.collidingWallId = null;
    }
}

function markHamsterCollisionState(hamsterObj, wall) {
    hamsterObj.isCollidingWall = true;
    hamsterObj.collidingWallId = wall.id;
}

function getAttackerBounds(attacker) {
    let size = attacker.size || player.width;
    return {
        x: attacker.biteX || attacker.fromX || 0,
        y: attacker.biteY || attacker.fromY || 0,
        size
    };
}

function resolveWallBitePosition(wall, baseX, baseY, size) {
    let faceX = Math.min(baseX, wall.x - size + 6);
    let candidates = [];
    candidates.push({ x: faceX, y: baseY });
    for (let step = 1; step <= 6; step++) {
        let dy = step * 14;
        candidates.push({ x: faceX, y: baseY - dy });
        candidates.push({ x: faceX, y: baseY + dy });
    }

    for (let i = 0; i < candidates.length; i++) {
        let c = candidates[i];
        let clampedY = Math.max(wall.y - 8, Math.min(wall.y + wall.height - size + 8, c.y));
        let overlap = false;
        for (let j = 0; j < wall.attackers.length; j++) {
            let other = getAttackerBounds(wall.attackers[j]);
            if (Math.abs(c.x - other.x) < size * 0.6 && Math.abs(clampedY - other.y) < size * 0.6) {
                overlap = true;
                break;
            }
        }
        if (!overlap) return { x: c.x, y: clampedY };
    }
    return { x: faceX, y: Math.max(wall.y, Math.min(wall.y + wall.height - size, baseY)) };
}

function attachAttackerToWall(wall, type, followerRef = null, startX = 0, startY = 0) {
    let key = type === 'player' ? 'player' : ('f:' + wall.id + ':' + wall.attackers.length);
    if (type === 'follower') key = 'f:' + (followerRef ? followerRef.id : 'none');
    if (wall.attackerKeys.has(key)) return;
    wall.attackerKeys.add(key);
    let size = type === 'player' ? player.width : 68;
    let pos = resolveWallBitePosition(wall, startX, startY, size);
    let slotIndex = wall.attackers.length;
    wall.attackers.push({
        type,
        followerRef,
        slotIndex,
        joinProgress: 1,
        fromX: startX,
        fromY: startY,
        biteX: pos.x,
        biteY: pos.y,
        size
    });
    wall.engaged = true;
    if (type === 'player') player.isWallAttached = true;
    if (type === 'follower' && followerRef) {
        followerRef.attachedWallId = wall.id;
        followerRef.wallState = 'biting';
    }
}

function releaseWallAttackers(wall) {
    if (!wall) return;
    wall.attackers.forEach(attacker => {
        if (attacker.type === 'player') player.isWallAttached = false;
        if (attacker.type === 'follower' && attacker.followerRef) {
            attacker.followerRef.attachedWallId = null;
            attacker.followerRef.wallState = 'none';
        }
    });
    wall.attackers = [];
    wall.attackerKeys.clear();
    wall.engaged = false;
}

function getFollowerRenderState(index, follower) {
    let size = 68;
    let followX = follower.x;
    let drawY = follower.y;
    follower.lastRenderX = followX;
    follower.lastRenderY = drawY;
    return { follower, size, followX, drawY, pastState: { isGrounded: follower.isGrounded, jumpCount: follower.jumpCount } };
}

function addWallEffect(x, y, burst = false) {
    if (wallEffects.length > 280) wallEffects.splice(0, wallEffects.length - 280);
    wallEffects.push(new BiteParticle(x, y, burst));
}

function tryApplyRamDamage(wall, body, bodyType, impactSpeed, damageScale = 1) {
    if (!wall || wall.destroyed) return;
    if (!body) return;
    if ((body.wallRamCooldown || 0) > 0) return;

    body.wallRamCooldown = WALL_CONFIG.ramCooldownFrames;
    wall.recentHitFrames = Math.max(wall.recentHitFrames, WALL_CONFIG.ramCooldownFrames + 2);

    // 基本1ダメージ、ジャンプ中ヒットは2ダメージ
    let baseDamage = body.isGrounded ? 1 : 2;
    wall.pendingDamage += baseDamage * Math.max(1, damageScale || 1);

    let fx = wall.x + 2 + Math.random() * 2;
    let fy = body.y + 12 + Math.random() * Math.max(16, (body.height || 68) - 20);
    addWallEffect(fx, fy);
}

function tryApplyFollowerNearWallDamage(wall, follower, size, followerOrderIndex = 0) {
    if (!wall || wall.destroyed || !follower) return false;
    if ((follower.wallRamCooldown || 0) > 0) return false;
    let ahead = Math.max(0, WALL_CONFIG.followerDamageAheadX || 0);
    if (ahead <= 0) return false;

    let left = follower.x;
    let right = follower.x + size;
    let nearStartX = wall.x - ahead;
    let inNearX = right >= nearStartX && left < wall.x;
    if (!inNearX) return false;

    let top = follower.y;
    let bottom = follower.y + size;
    let inY = bottom > wall.y && top < wall.y + wall.height;
    if (!inY) return false;

    let deltaX = follower.x - (follower.prevX !== undefined ? follower.prevX : follower.x);
    let impact = Math.max(0, follower.vx || 0, deltaX);
    if (impact <= 0) return false;

    let chainScale = Math.pow(1.1, Math.max(1, followerOrderIndex + 1));
    tryApplyRamDamage(wall, follower, 'follower', impact, chainScale);
    return true;
}

function drawWallAttackers(wall) {
    for (let i = 0; i < wall.attackers.length; i++) {
        let attacker = wall.attackers[i];
        let size = attacker.size || player.width;
        let baseX = attacker.biteX;
        let baseY = attacker.biteY;
        let phase = Date.now() / 70 + i * 0.8;
        let biteOffset = Math.sin(phase) * 2.2;
        let drawX = baseX + biteOffset;
        let drawY = baseY + Math.sin(phase * 0.7) * 1.2;
        let img = sprites.run.loaded ? sprites.run.img : null;
        if (img) ctx.drawImage(img, drawX, drawY, size, size);
        else {
            ctx.fillStyle = attacker.type === 'player' ? '#ff3f34' : '#ff9f43';
            ctx.fillRect(drawX, drawY, size, size);
        }
        if (Math.random() < 0.35) {
            let fx = wall.x + 2 + (Math.random() * 3 - 1.5);
            let fy = drawY + size * (0.25 + Math.random() * 0.5);
            addWallEffect(fx, fy);
        }
    }
}

function processWallCombat(wall) {
    if (!wall || wall.destroyed) return;
    if (wall.pendingDamage <= 0) return;
    let burstDamage = wall.pendingDamage;
    wall.pendingDamage = 0;

    let particleChance = Math.min(0.95, burstDamage / 24);
    if (Math.random() < particleChance) {
        let px = wall.x + 2 + Math.random() * 2;
        let py = wall.y + 10 + Math.random() * (wall.height - 20);
        addWallEffect(px, py);
    }
    wall.hp -= burstDamage;
    if (wall.hp <= 0) {
        wall.hp = 0;
        wall.destroyed = true;
        spawnWallBreakRewards(wall);
        for (let i = 0; i < 140; i++) {
            let px = wall.x + Math.random() * wall.width;
            let py = wall.y + 8 + Math.random() * (wall.height - 16);
            addWallEffect(px, py, true);
        }
        releaseWallAttackers(wall);
    }
}

function beginFollowerApproachToWall(follower, followX, followY) {
    if (!follower || follower.wallState !== 'none') return;
    follower.wallState = 'approaching';
    follower.approachPhase = 'run';
    follower.approachX = followX;
    follower.approachY = followY;
    follower.approachVx = 0;
    follower.approachVy = 0;
}

function updateFollowerApproachToWall(wall, follower) {
    if (!wall || !follower || follower.wallState !== 'approaching') return;
    const size = 68;

    if (follower.approachPhase === 'run') {
        let runTargetX = wall.x - size - WALL_CONFIG.jumpTriggerOffsetX;
        let groundY = getGroundYAt(follower.approachX + size / 2);
        let isGrounded = false;
        if (groundY === null) {
            follower.approachVy += gravity;
            follower.approachY += follower.approachVy;
        } else {
            if (follower.approachY + size >= groundY) {
                follower.approachY = groundY - size;
                follower.approachVy = 0;
                isGrounded = true;
            } else {
                follower.approachVy += gravity;
                follower.approachY += follower.approachVy;
            }
        }

        // 壁接触中は後続が立ち止まらないよう、常に前進する。
        follower.approachX += WALL_CONFIG.approachSpeed;

        if (follower.approachX >= runTargetX - 0.5 && isGrounded) {
            follower.approachPhase = 'jump';
            follower.approachVy = player.jumpPower * WALL_CONFIG.leapVyScale;
            let jumpTargetX = wall.x - size + 8;
            let vx = (jumpTargetX - follower.approachX) / Math.max(1, WALL_CONFIG.leapTargetFrames);
            follower.approachVx = Math.max(WALL_CONFIG.leapVxMin, Math.min(WALL_CONFIG.leapVxMax, vx));
        }
        return;
    }

    follower.approachVy += gravity;
    follower.approachX += follower.approachVx;
    follower.approachY += follower.approachVy;

    if (follower.approachVy < 0 && isHamsterOverlappingWall(follower.approachX, follower.approachY, size, wall)) {
        markHamsterCollisionState(follower, wall);
    }
    if (follower.approachVy < 0 && follower.isCollidingWall && follower.collidingWallId === wall.id) {
        attachAttackerToWall(wall, 'follower', follower, follower.approachX, follower.approachY);
        return;
    }

    let groundY = getGroundYAt(follower.approachX + size / 2);
    if (groundY !== null && follower.approachY + size >= groundY && follower.approachVy > 0) {
        follower.approachY = groundY - size;
        follower.approachVy = 0;
        follower.approachVx = 0;
        follower.approachPhase = 'run';
    }
}

function resolveBodyGroundCollision(body, bodyWidth = 68, bodyHeight = 68) {
    let footInset = Math.max(6, bodyWidth * 0.22);
    let leftFootX = body.x + footInset;
    let rightFootX = body.x + bodyWidth - footInset;
    let leftGroundY = getGroundYAt(leftFootX);
    let rightGroundY = getGroundYAt(rightFootX);
    let supportYs = [];
    if (leftGroundY !== null) supportYs.push(leftGroundY);
    if (rightGroundY !== null) supportYs.push(rightGroundY);
    if (supportYs.length > 0) {
        // 2点接地: 左右どちらかが拾えば着地可能。
        // 交差面へめり込まないよう高い側(小さいY)を支持面にする。
        let groundY = Math.min(...supportYs);
        let prevY = body.prevY !== undefined ? body.prevY : body.y;
        let prevBottom = prevY + bodyHeight;
        let footY = body.y + bodyHeight;
        // 高速落下時のトンネリング対策:
        // 1フレームで地面を深く貫通しても「上から来た」判定を許容する。
        let dynamicLandingTol = 8 + Math.max(0, Math.abs(body.vy || 0) * 1.5);
        let comingFromAbove = prevBottom <= groundY + dynamicLandingTol;
        let canSnap = body.isGrounded && body.vy >= 0 && footY >= groundY - SLOPE_STICK_SNAP;
        if (comingFromAbove && ((footY >= groundY - 1 && body.vy >= 0) || canSnap)) {
            body.y = groundY - bodyHeight;
            body.vy = 0;
            body.isGrounded = true;
            body.jumpCount = 0;
            return;
        }
    }
    body.isGrounded = false;
}

function updateFollowerPhysics(follower, targetX, targetY) {
    if (follower.wallState !== 'none') return;
    follower.prevX = follower.x;
    follower.prevY = follower.y;
    let followForce = 0.14;
    follower.vx += (targetX - follower.x) * followForce;
    follower.vx *= 0.82;
    if (follower.vx > 8) follower.vx = 8;
    if (follower.vx < -8) follower.vx = -8;
    follower.x += follower.vx;

    follower.vy += gravity;
    follower.y += follower.vy;
    if (follower.isGrounded && targetY < follower.y - 14) {
        follower.vy = player.jumpPower * 0.88;
        follower.isGrounded = false;
        follower.jumpCount = Math.max(1, follower.jumpCount);
    }
    follower.jumpCount = follower.vy < -2 ? 1 : follower.jumpCount;
    resolveBodyGroundCollision(follower, 68, 68);

    if (follower.isGrounded) {
        follower.y += (targetY - follower.y) * 0.08;
    }
}

function updateFollowerFromLeaderHistory(follower, index) {
    let delayFrame = Math.max(1, Math.round(FOLLOWER_DELAY_BASE * FOLLOWER_SPACING_SCALE * (index + 1)));
    let past = playerHistory[delayFrame] || playerHistory[playerHistory.length - 1];
    if (!past) return;
    follower.prevX = follower.x;
    follower.prevY = follower.y;
    follower.x = past.x - 6;
    follower.y = past.y;
    follower.vx = past.vx || 0;
    follower.vy = past.vy || 0;
    follower.isGrounded = !!past.isGrounded;
    follower.jumpCount = past.jumpCount || 0;
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

    if (!isBoosted && speed > baseSpeed) {
        speed += (baseSpeed - speed) * 0.05;
        if (speed - baseSpeed < 0.1) speed = baseSpeed;
    }
    if (speed < baseSpeed) {
        speed += (baseSpeed - speed) * 0.06;
        if (baseSpeed - speed < 0.3) speed = baseSpeed;
    }

    if (player.wallRamCooldown > 0) player.wallRamCooldown--;
    let wasGrounded = !!player.isGrounded;
    player.update();
    player.vy = player.dy;
    resolveBodyGroundCollision(player, player.width, player.height);
    player.dy = player.vy;
    if (!wasGrounded && player.isGrounded) {
        isBoosted = false;
        speed = baseSpeed;
        sacrificeCount = 0;
    }
    playerHistory.unshift({
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        footY: player.y + player.height,
        isGrounded: player.isGrounded,
        jumpCount: player.jumpCount
    });
    let maxHistory = (followers.length + 1) * 20;
    if (playerHistory.length > maxHistory + 120) playerHistory.length = maxHistory + 120;

    if (score >= nextFriendScoreTarget) { spawnFriendFlag = true; nextFriendScoreTarget += (FRIEND_INTERVAL_METER * 10); }
    if (score >= nextWallScoreTarget && !walls.some(w => !w.destroyed && w.x > player.x + 120)) {
        spawnBreakableWall();
        nextWallScoreTarget += (WALL_CONFIG.spawnIntervalMeter * 10);
    }

    if (platforms.length === 0 || (platforms[platforms.length - 1].x + platforms[platforms.length - 1].width) < getCameraRight() + 200) {
        if (platforms.length === 0) addPlatform(0, SPAWN_PATTERNS.normal);
        else {
            let pattern = getRandomPattern();
            let gap = pattern.gap.min + Math.random() * (pattern.gap.max - pattern.gap.min);
            let lastPlatform = platforms[platforms.length - 1];
            let spawnX = lastPlatform.x + lastPlatform.width + gap;
            addPlatform(spawnX, pattern);
        }
    }

    let followerStates = [];
    for (let i = 0; i < followers.length; i++) {
        followers[i] = ensureFollowerState(followers[i]);
        if (followers[i].wallRamCooldown > 0) followers[i].wallRamCooldown--;
        updateFollowerFromLeaderHistory(followers[i], i);
        followerStates.push(getFollowerRenderState(i, followers[i]));
    }

    resetWallCollisionFlags();
    for (let i = 0; i < walls.length; i++) {
        let wall = walls[i];
        if (wall.destroyed) {
            walls.splice(i, 1);
            i--;
            continue;
        }
        wall.update();
        wall.y = 0;
        wall.height = canvas.height;

        let playerHit = resolveBodyWallCollision(player, player.width, player.height, wall);
        if (playerHit && playerHit.normal === 'x') {
            markHamsterCollisionState(player, wall);
            tryApplyRamDamage(wall, player, 'player', playerHit.impactSpeed);
        }

        for (let j = 0; j < followerStates.length; j++) {
            let st = followerStates[j];
            let chainScale = Math.pow(1.1, j + 1);
            let hit = resolveBodyWallCollision(st.follower, st.size, st.size, wall);
            if (hit && hit.normal === 'x') {
                markHamsterCollisionState(st.follower, wall);
                tryApplyRamDamage(wall, st.follower, 'follower', hit.impactSpeed, chainScale);
                continue;
            }
            tryApplyFollowerNearWallDamage(wall, st.follower, st.size, j);
        }

        processWallCombat(wall);
    }

    for (let i = 0; i < detachedFriends.length; i++) {
        let df = detachedFriends[i]; df.update();
        let groundY = getGroundYAt(df.x + df.width / 2);
        if (!df.isDead && groundY !== null && df.y + df.height >= groundY && df.dy >= 0) {
            let f = createFollower();
            f.x = df.x;
            f.y = groundY - 68;
            f.isGrounded = true;
            followers.push(f);
            df.isDead = true;
            updateSeedDisplay();
        }
        if (df.y > canvas.height + 400 || df.x + df.width < cameraX - 400 || df.isDead) { detachedFriends.splice(i, 1); i--; }
    }
    for (let i = 0; i < seeds.length; i++) {
        let seed = seeds[i]; seed.update();
        if (!seed.collected && player.x < seed.x + seed.width && player.x + player.width > seed.x && player.y < seed.y + seed.height && player.y + player.height > seed.y) {
            let currentMax = getMaxSeedCapacity();
            if (seedsCollected < currentMax) { seed.collected = true; seedsCollected += (seed.value || 1); if (seedsCollected > currentMax) seedsCollected = currentMax; updateSeedDisplay(); }
        }
        if (seed.x + seed.width < cameraX - 250 || seed.x > getCameraRight() + 1200 || (seed.collected && seed.x < player.x - 250)) { seeds.splice(i, 1); i--; }
    }
    for (let i = 0; i < collectibles.length; i++) {
        let item = collectibles[i]; item.update();
        if (player.x < item.x + item.width && player.x + player.width > item.x && player.y < item.y + item.height && player.y + player.height > item.y) {
            let f = createFollower();
            f.x = player.x - 72 * (followers.length + 1);
            f.y = player.y;
            followers.push(f);
            collectibles.splice(i, 1); i--; updateSeedDisplay();
        } else if (item.x + item.width < cameraX - 220) { collectibles.splice(i, 1); i--; }
    }

    for (let i = 0; i < wallEffects.length; i++) {
        let effect = wallEffects[i];
        if (!effect.update()) { wallEffects.splice(i, 1); i--; }
    }

    updateCamera();
    ctx.save();
    ctx.translate(-cameraX, 0);

    for (let i = 0; i < platforms.length; i++) {
        let plat = platforms[i];
        plat.draw();
        if (plat.x + plat.width < cameraX - 500) { platforms.splice(i, 1); i--; }
    }
    for (let i = 0; i < walls.length; i++) {
        let wall = walls[i];
        wall.draw();
        if (wall.engaged && wall.attackers.length > 0) drawWallAttackers(wall);
        if (wall.x + wall.width < cameraX - 300) { releaseWallAttackers(wall); walls.splice(i, 1); i--; }
    }
    for (let df of detachedFriends) df.draw();
    for (let seed of seeds) seed.draw();
    for (let item of collectibles) item.draw();
    for (let effect of wallEffects) effect.draw();

    for (let i = 0; i < followerStates.length; i++) {
        let st = followerStates[i];
        if (st.follower.attachedWallId !== null) continue;
        if (st.follower.wallState === 'approaching') {
            let imgA = sprites.run.loaded ? sprites.run.img : null;
            if (st.follower.approachPhase === 'jump') imgA = sprites.jump.loaded ? sprites.jump.img : imgA;
            let bobA = st.follower.approachPhase === 'jump' ? 0 : Math.sin(Date.now() / 18 + i * 0.7) * 1.1;
            if (imgA) ctx.drawImage(imgA, st.follower.approachX, st.follower.approachY + bobA, st.size, st.size);
            else { ctx.fillStyle = '#ff9f43'; ctx.fillRect(st.follower.approachX, st.follower.approachY + bobA, st.size, st.size); }
            continue;
        }
        let bobY = st.pastState && st.pastState.isGrounded ? Math.sin(Date.now() / 13 + (i + 1) * 1.2) * 1 : 0;
        let img = sprites.run.loaded ? sprites.run.img : null;
        if (st.pastState && !st.pastState.isGrounded) {
            if (st.pastState.jumpCount >= 2) img = sprites.djump.loaded ? sprites.djump.img : img;
            else img = sprites.jump.loaded ? sprites.jump.img : img;
        }
        if (img) ctx.drawImage(img, st.followX, st.drawY + bobY, st.size, st.size);
        else { ctx.fillStyle = '#ff9f43'; ctx.fillRect(st.followX, st.drawY + bobY, st.size, st.size); }
    }
    player.draw();
    ctx.restore();

    if (speed > baseSpeed) {
        let boostAlpha = Math.min(0.5, (speed - baseSpeed) / baseSpeed);
        ctx.globalAlpha = boostAlpha;
        ctx.fillStyle = '#f39c12';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🔥 BOOST!', 15, canvas.height - 20);
        ctx.globalAlpha = 1;
    }

    score = Math.max(0, (player.x - 150) * 0.2);
    document.getElementById('score').innerText = 'Distance: ' + Math.floor(score / 10) + 'm';
    requestAnimationFrame(gameLoop);
}

function updateSeedDisplay() {
    let currentMax = getMaxSeedCapacity();
    document.getElementById('seedCount').innerText = `Seeds: ${seedsCollected} / ${currentMax}`;
}

function appendCollectionUnlockLog(log, distanceMeters) {
    let result = updateHamsterCollectionByDistance(distanceMeters);
    if (result.bestDistanceMeters > result.previousBest) {
        log.push(`🏁 最長到達距離を更新: ${result.bestDistanceMeters}m`);
    }
    if (result.newlyUnlocked.length > 0) {
        result.newlyUnlocked.forEach(name => {
            log.push(`📘 新しいハムスターを発見: ${name}`);
        });
    }
    return result;
}

function buildFoundHamsterResultText(newlyUnlockedHamsters) {
    if (!newlyUnlockedHamsters || newlyUnlockedHamsters.length === 0) {
        return '';
    }
    return `<p>種類: ${newlyUnlockedHamsters.join(' / ')}</p>`;
}

function pauseGame() { if (gameState !== 'playing') return; gameState = 'paused'; document.getElementById('pauseModal').style.display = 'block'; }

function confirmGoHome() { 
    gameState = 'nest'; 
    let log = processTimePassage(seedsCollected, followers.length);
    appendCollectionUnlockLog(log, Math.floor(score / 10));
    document.getElementById('logContent').innerHTML = log.join('<br>');
    document.getElementById('logModal').style.display = 'block';
    document.getElementById('pauseModal').style.display = 'none'; 
    initNest(); 
}
function closeLog() { document.getElementById('logModal').style.display = 'none'; }
function cancelGoHome() { gameState = 'playing'; document.getElementById('pauseModal').style.display = 'none'; gameLoop(); }

function returnToNestFromGameOver() {
    let log = pendingGameOverNestLog && pendingGameOverNestLog.length > 0
        ? pendingGameOverNestLog.slice()
        : ['ゲームオーバーで巣に戻りました。'];
    pendingGameOverNestLog = null;
    initNest();
    document.getElementById('logContent').innerHTML = log.join('<br>');
    document.getElementById('logModal').style.display = 'block';
}

function gameOver() {
    gameState = 'gameover'; 
    let distanceMeters = Math.floor(score / 10);
    let savedSeeds = 0;
    let carriedFriends = followers.length;
    let survivedFriends = 0;
    let gameOverDiaryLog = processTimePassage(savedSeeds, survivedFriends);
    let diaryBaseLen = gameOverDiaryLog.length;
    let collectionResult = appendCollectionUnlockLog(gameOverDiaryLog, distanceMeters);
    let resultCollectionLog = gameOverDiaryLog.slice(diaryBaseLen);
    pendingGameOverNestLog = gameOverDiaryLog.slice();
    saveData();
    const modal = document.getElementById('gameOverModal');
    const text = document.getElementById('overlayText');
    let foundHamsterText = buildFoundHamsterResultText(collectionResult.newlyUnlocked);
    let unlockText = resultCollectionLog.length > 0
        ? `<p style="font-size:14px; color:#ffeaa7;">${resultCollectionLog.join('<br>')}</p>`
        : '';
    let lostFriendsText = `<p style="font-size:14px; color:#aaa;">種と仲間を失いました...</p>`;
    text.innerHTML = `<h2>Game Over</h2><p>Distance: ${distanceMeters}m</p><p>連れていた仲間の数: ${carriedFriends}匹</p>${foundHamsterText}${unlockText}${lostFriendsText}`;
    modal.style.display = 'block';
}

function resetGame(initialFollowersCount = 0) {
    pendingGameOverNestLog = null;
    gameState = 'playing';
    document.body.classList.remove('hub-mode');
    document.body.classList.add('play-mode');
    document.getElementById('nestHeader').style.display = 'none';
    document.getElementById('farmHeader').style.display = 'none';
    document.getElementById('gameOverModal').style.display = 'none'; document.getElementById('pauseModal').style.display = 'none'; document.getElementById('instruction').style.display = 'none';
    platforms = []; seeds = []; collectibles = []; followers = []; detachedFriends = []; playerHistory = []; walls = []; wallEffects = [];
    speed = baseSpeed; isBoosted = false; sacrificeCount = 0;
    worldFloorY = canvas.height / 2 + 100;
    cameraX = 0;
    player.x = 150; player.y = worldFloorY - 68; player.width = 68; player.height = 68; player.dy = 0; player.vy = 0; player.vx = 0; player.jumpCount = 0; player.color = '#ff3f34'; player.isWallAttached = false; player.isGrounded = true;
    for(let i=0; i<initialFollowersCount; i++){ 
        let f = createFollower();
        f.x = player.x - 72 * (i + 1);
        f.y = player.y;
        f.isGrounded = true;
        followers.push(f); 
        for(let j=0; j<20; j++) playerHistory.push({
            x: player.x,
            y: player.y,
            vx: 0,
            vy: 0,
            footY: player.y + player.height,
            isGrounded: true,
            jumpCount: 0
        }); 
    }
    spawnFriendFlag = false; nextFriendScoreTarget = 1000; nextWallScoreTarget = (WALL_CONFIG.debugFirstSpawnMeter || WALL_CONFIG.spawnIntervalMeter) * 10; seedsCollected = 0; 
    updateSeedDisplay();
    platforms.push(new SlopePlatform(-300, worldFloorY, canvas.width + 1200, 0));
    score = 0; document.getElementById('score').innerText = 'Distance: 0m';
    gameLoop();
}
