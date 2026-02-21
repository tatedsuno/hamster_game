// ==========================================
// 畑システム
// ==========================================
let farmWorkerHamsters = [];
let farmFloatingTexts = [];

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 60; this.maxLife = 60;
    }
    update() { this.y -= 1.5; this.life--; }
    draw() {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}

class FarmWorkerHamster {
    constructor(startX, startY) {
        this.x = startX || canvas.width / 2 + (Math.random() - 0.5) * 200;
        this.y = startY || canvas.height / 2;
        this.groundY = this.y;
        this.size = 55;
        this.flip = false;
        this.hopOffset = Math.random() * Math.PI;
        this.baseSpeed = 3.5;
        this.speed = this.baseSpeed;
        this.vx = 0;
        this.vy = 0;

        this.state = 'wandering';
        this.targetX = 0;
        this.targetY = 0;
        this.targetPlotIdx = -1;
        this.targetAction = '';
        this.workTimer = 0;
        this.wanderVx = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
        this.idleTimer = 30 + Math.random() * 50;

        this.isDragging = false;
        this.isThrown = false;
        this.boosted = false;
        this.boostTimer = 0;
    }

    assignTask(plotIdx, action, tx, ty) {
        if (this.isDragging || this.isThrown) return;
        this.targetPlotIdx = plotIdx;
        this.targetAction = action;
        this.targetX = tx;
        this.targetY = ty + this.size * 0.55;
        this.state = 'moving_to_target';
    }

    hasTask() {
        if (this.isDragging || this.isThrown) return true;
        return this.state === 'moving_to_target' || this.state === 'working';
    }

    update() {
        if (this.isDragging) return;

        if (this.boosted) {
            this.boostTimer--;
            if (this.boostTimer <= 0) {
                this.boosted = false;
                this.speed = this.baseSpeed;
            }
        }

        if (this.isThrown) {
            this.vy += 0.5;
            this.x += this.vx;
            this.y += this.vy;
            if (this.y > this.groundY) {
                this.y = this.groundY;
                this.vy *= -0.5;
                this.vx *= 0.8;
                if (Math.abs(this.vy) < 1) {
                    this.isThrown = false;
                    this.vy = 0;
                    this.vx = 0;
                    this.state = 'idle';
                    this.idleTimer = 20 + Math.random() * 30;
                }
            }
            if (this.x < 0) { this.x = 0; this.vx *= -0.7; }
            if (this.x > canvas.width) { this.x = canvas.width; this.vx *= -0.7; }
            if (Math.abs(this.vx) > 1) this.flip = this.vx < 0;
            return;
        }

        if (this.state === 'working') {
            this.workTimer -= this.boosted ? 3 : 1;
            if (this.workTimer <= 0) {
                this.state = 'idle';
                this.idleTimer = 30 + Math.random() * 40;
                this.targetPlotIdx = -1;
            }
            return;
        }

        if (this.state === 'moving_to_target') {
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.doPlotAction();
                this.state = 'working';
                this.workTimer = 50;
            } else {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
                if (Math.abs(dx) > 1) this.flip = dx < 0;
            }
            return;
        }

        this.idleTimer--;
        if (this.idleTimer <= 0) {
            if (this.state === 'idle') {
                this.state = 'wandering';
                this.wanderVx = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
                this.idleTimer = 25 + Math.random() * 35;
            } else {
                this.state = 'idle';
                this.wanderVx = 0;
                this.idleTimer = 25 + Math.random() * 45;
            }
        }
        if (this.state === 'wandering') {
            this.x += this.wanderVx;
            if (this.x < 50) { this.x = 50; this.wanderVx *= -1; }
            if (this.x > canvas.width - 50) { this.x = canvas.width - 50; this.wanderVx *= -1; }
            if (this.wanderVx !== 0) this.flip = this.wanderVx < 0;
        }

    }

    doPlotAction() {
        if (this.targetPlotIdx < 0 || this.targetPlotIdx >= farmPlots.length) return;
        let plot = farmPlots[this.targetPlotIdx];
        let layout = getFarmGridLayout();
        let r = Math.floor(this.targetPlotIdx / layout.cols);
        let c = this.targetPlotIdx % layout.cols;
        let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
        let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;

        if (this.targetAction === 'water' && !plot.watered && plot.state !== 'empty' && plot.state !== 'harvestable') {
            plot.watered = true;
            let now = Date.now();
            let elapsed = now - plot.stageStartedAt;
            let remaining = FARM_CONFIG.growthTime - elapsed;
            if (remaining > 0) plot.stageStartedAt -= Math.floor(remaining * FARM_CONFIG.waterBoost);
            farmFloatingTexts.push(new FloatingText(cx, cy, '💧', '#3498db'));
        } else if (this.targetAction === 'plant' && plot.state === 'empty' && bankSeeds >= FARM_CONFIG.plantCost) {
            bankSeeds -= FARM_CONFIG.plantCost;
            plot.state = 'seeded';
            plot.stageStartedAt = Date.now();
            plot.watered = false;
            farmFloatingTexts.push(new FloatingText(cx, cy, '-' + FARM_CONFIG.plantCost, '#e74c3c'));
        }
        saveData();
        updateFarmUI();
    }

    draw() {
        let hopY = 0;
        if (!this.isDragging && !this.isThrown) {
            if (this.state === 'moving_to_target' || this.state === 'wandering') {
                hopY = Math.sin(Date.now() / 80 + this.hopOffset) * 3;
            } else if (this.state === 'working') {
                hopY = Math.sin(Date.now() / 40 + this.hopOffset) * 2;
            }
        }
        ctx.save();
        ctx.translate(this.x, this.y + hopY);
        if (this.isDragging) ctx.scale(1.1, 1.1);
        if (this.flip) ctx.scale(-1, 1);
        let isMoving = this.state === 'moving_to_target' || this.state === 'wandering';
        let img;
        if ((this.isThrown || this.isDragging) && sprites.fall.loaded) img = sprites.fall.img;
        else if (isMoving && sprites.run.loaded) img = sprites.run.img;
        else img = sprites.idle.loaded ? sprites.idle.img : null;
        if (img) ctx.drawImage(img, -this.size / 2, -this.size / 2, this.size, this.size);
        else { ctx.fillStyle = '#ff9f43'; ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size); }
        if (this.boosted) {
            ctx.fillStyle = '#f1c40f';
            let sparkle = Math.sin(Date.now() / 100 + this.hopOffset) * 3;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('✨', sparkle, -this.size / 2 - 5);
        }
        ctx.restore();
    }
}

function boostWorker(h) {
    h.boosted = true;
    h.boostTimer = 180;
    h.speed = h.baseSpeed * 2.5;
    if (!h.hasTask()) {
        let layout = getFarmGridLayout();
        for (let i = 0; i < farmPlots.length; i++) {
            let plot = farmPlots[i];
            if (plot.state !== 'empty' && plot.state !== 'harvestable' && !plot.watered) {
                if (farmWorkerHamsters.some(w => w !== h && w.hasTask() && w.targetPlotIdx === i)) continue;
                let r = Math.floor(i / layout.cols);
                let c = i % layout.cols;
                let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                h.assignTask(i, 'water', cx, cy);
                return;
            }
        }
        for (let i = 0; i < farmPlots.length; i++) {
            let plot = farmPlots[i];
            if (plot.state === 'empty' && bankSeeds >= FARM_CONFIG.plantCost) {
                if (farmWorkerHamsters.some(w => w !== h && w.hasTask() && w.targetPlotIdx === i)) continue;
                let r = Math.floor(i / layout.cols);
                let c = i % layout.cols;
                let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                h.assignTask(i, 'plant', cx, cy);
                return;
            }
        }
    }
}

function getFarmGridLayout() {
    let cols = FARM_CONFIG.initialCols;
    let rows = farmRows;
    let maxGridWidth = Math.min(canvas.width * 0.85, 800);
    let gap = 15;
    let cellSize = Math.floor((maxGridWidth - (cols - 1) * gap) / cols);
    if (cellSize > 120) cellSize = 120;
    if (cellSize < 60) cellSize = 60;

    if (rows < 5) {
        let safeBottom = getSafeBottomY();
        let topMargin = 100;
        let availableHeight = safeBottom - topMargin - 60;
        let neededHeight = rows * cellSize + (rows - 1) * gap;
        if (neededHeight > availableHeight && availableHeight > 0) {
            cellSize = Math.floor((availableHeight - (rows - 1) * gap) / rows);
            if (cellSize < 50) cellSize = 50;
        }
    }

    let gridWidth = cols * cellSize + (cols - 1) * gap;
    let gridHeight = rows * cellSize + (rows - 1) * gap;
    let offsetX = (canvas.width - gridWidth) / 2;
    let offsetY = 100;
    return { cols, rows, cellSize, gap, gridWidth, gridHeight, offsetX, offsetY };
}

function updateFarmGrowth() {
    let now = Date.now();
    let anyChanged = false;
    for (let plot of farmPlots) {
        if (plot.state === 'empty' || plot.state === 'harvestable') continue;
        let stageIndex = GROWTH_STAGES.indexOf(plot.state);
        if (stageIndex < 0) continue;
        let elapsed = now - plot.stageStartedAt;
        let stageTime = FARM_CONFIG.growthTime;
        let plotChanged = false;
        while (elapsed >= stageTime && stageIndex < GROWTH_STAGES.length - 1) {
            elapsed -= stageTime;
            stageIndex++;
            plot.watered = false;
            stageTime = FARM_CONFIG.growthTime;
            plotChanged = true;
        }
        if (plotChanged) {
            plot.state = GROWTH_STAGES[stageIndex];
            if (stageIndex < GROWTH_STAGES.length - 1) plot.stageStartedAt = now - elapsed;
            anyChanged = true;
        }
    }
    if (anyChanged) saveData();
}

function drawFarmPlot(cx, cy, cellSize, plot) {
    let s = cellSize;
    let half = s / 2;
    let pad = 4;
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(cx - half + pad, cy - half + pad, s - pad * 2, s - pad * 2);
    ctx.fillStyle = '#725510';
    ctx.fillRect(cx - half + pad, cy - half + pad, s - pad * 2, 4);

    if (plot.state === 'empty') return;
    let baseY = cy + half - 15;

    if (plot.state === 'seeded') {
        ctx.fillStyle = '#4a3500';
        ctx.beginPath(); ctx.arc(cx - 6, baseY - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 6, baseY - 5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, baseY - 8, 3, 0, Math.PI * 2); ctx.fill();
    } else if (plot.state === 'sprout') {
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, baseY - 22); ctx.stroke();
        ctx.fillStyle = '#2ecc71';
        ctx.save(); ctx.translate(cx - 8, baseY - 16); ctx.rotate(-0.5);
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.save(); ctx.translate(cx + 8, baseY - 18); ctx.rotate(0.5);
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
        let stemH = plot.state === 'growing' ? 35 : 50;
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, baseY - stemH); ctx.stroke();
        ctx.fillStyle = '#2ecc71';
        ctx.save(); ctx.translate(cx - 6, baseY - stemH * 0.4); ctx.rotate(-0.4);
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.save(); ctx.translate(cx + 6, baseY - stemH * 0.6); ctx.rotate(0.4);
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

        if (plot.state !== 'growing') {
            let flowerY = baseY - stemH - 5;
            let fSize = plot.state === 'harvestable' ? 16 : 12;
            if (plot.state === 'harvestable') {
                let pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
                ctx.globalAlpha = pulse * 0.3;
                ctx.fillStyle = '#f9e547';
                ctx.beginPath(); ctx.arc(cx, flowerY, fSize + 10, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = '#f1c40f';
            for (let i = 0; i < 10; i++) {
                let angle = (i / 10) * Math.PI * 2;
                let px = cx + Math.cos(angle) * fSize;
                let py = flowerY + Math.sin(angle) * fSize;
                ctx.beginPath(); ctx.ellipse(px, py, 7, 4, angle, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = '#6F4E37';
            ctx.beginPath(); ctx.arc(cx, flowerY, fSize * 0.55, 0, Math.PI * 2); ctx.fill();
        }
    }

    if (plot.state !== 'empty' && plot.state !== 'harvestable') {
        let elapsed = Date.now() - plot.stageStartedAt;
        let progress = Math.min(elapsed / FARM_CONFIG.growthTime, 1);
        let barW = s - 24;
        let barH = 5;
        let barX = cx - barW / 2;
        let barY = cy + half - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = plot.watered ? '#3498db' : '#2ecc71';
        ctx.fillRect(barX, barY, barW * progress, barH);
    }

    if (plot.watered && plot.state !== 'empty' && plot.state !== 'harvestable') {
        ctx.fillStyle = '#3498db';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💧', cx + half - 14, cy - half + 18);
    }
}

function initFarm() {
    gameState = 'farm';
    document.getElementById('farmUI').style.display = 'block';
    document.getElementById('nestUI').style.display = 'none';
    document.getElementById('gameUI').style.display = 'none';
    document.getElementById('gameOverModal').style.display = 'none';
    document.getElementById('pauseModal').style.display = 'none';
    document.getElementById('breedingModal').style.display = 'none';
    document.getElementById('instruction').style.display = 'none';
    cancelPendingDrag();
    simulateBackgroundWork();
    updateFarmGrowth();
    updateFarmUI();
    updatePageIndicator('farm');
    farmScrollY = 0;
    resize();
    farmWorkerHamsters = [];
    let maxDisplay = farmPlots.length;
    let displayW = Math.min(farmWorkers, maxDisplay);
    let fLayout = getFarmGridLayout();
    for (let i = 0; i < displayW; i++) {
        let plotIdx = i % farmPlots.length;
        let r = Math.floor(plotIdx / fLayout.cols);
        let c = plotIdx % fLayout.cols;
        let plotCx = fLayout.offsetX + c * (fLayout.cellSize + fLayout.gap) + fLayout.cellSize / 2;
        let plotCy = fLayout.offsetY + r * (fLayout.cellSize + fLayout.gap) + fLayout.cellSize / 2;
        let startX = plotCx + (Math.random() - 0.5) * fLayout.cellSize * 0.8;
        let startY = plotCy + fLayout.cellSize * 0.3 + Math.random() * 20;
        let w = new FarmWorkerHamster(startX, startY);
        w.groundY = startY;
        let rand = Math.random();
        let plot = farmPlots[plotIdx];
        if (rand < 0.35 && plot.state !== 'empty' && plot.state !== 'harvestable') {
            w.state = 'working';
            w.workTimer = 20 + Math.random() * 30;
            w.targetPlotIdx = plotIdx;
            w.x = plotCx + (Math.random() - 0.5) * 10;
            w.y = plotCy + w.size * 0.55;
        } else if (rand < 0.7) {
            let tIdx = Math.floor(Math.random() * farmPlots.length);
            let tr = Math.floor(tIdx / fLayout.cols);
            let tc = tIdx % fLayout.cols;
            w.targetX = fLayout.offsetX + tc * (fLayout.cellSize + fLayout.gap) + fLayout.cellSize / 2;
            w.targetY = fLayout.offsetY + tr * (fLayout.cellSize + fLayout.gap) + fLayout.cellSize / 2 + w.size * 0.55;
            w.targetPlotIdx = tIdx;
            w.targetAction = Math.random() < 0.5 ? 'water' : 'plant';
            w.state = 'moving_to_target';
        } else {
            w.state = 'wandering';
            w.wanderVx = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
        }
        farmWorkerHamsters.push(w);
    }
    lastWorkerAction = Date.now();
    farmFloatingTexts = [];
    farmLoop();
}

function updateFarmUI() {
    document.getElementById('farmBankSeeds').innerText = bankSeeds;
    let maxWorkers = farmPlots.length;
    if (farmWorkers > maxWorkers) {
        bankFriends += farmWorkers - maxWorkers;
        farmWorkers = maxWorkers;
        saveData();
    }
    document.getElementById('farmWorkerCount').innerText = farmWorkers;
    document.getElementById('farmWorkerMax').innerText = maxWorkers;
    let slider = document.getElementById('workerSlider');
    let totalAvailable = Math.min(farmWorkers + bankFriends, maxWorkers);
    slider.max = totalAvailable;
    slider.value = farmWorkers;
    document.getElementById('workerTakeCount').innerText = farmWorkers;
    let expandBtn = document.getElementById('expandBtn');
    if (farmRows >= FARM_CONFIG.maxRows) {
        expandBtn.disabled = true;
        expandBtn.innerText = '🔨 最大';
    } else {
        let cost = getExpansionCost();
        expandBtn.disabled = bankSeeds < cost;
        expandBtn.innerText = '🔨 拡張 (' + cost + ')';
    }
}

function farmLoop() {
    if (gameState !== 'farm') return;
    updateFarmGrowth();
    updateBreeding();
    cachedSafeBottomY = getSafeBottomY();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#7ec850';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6ab840';
    for (let i = 0; i < canvas.width; i += 50) {
        for (let j = 0; j < canvas.height; j += 50) {
            if ((Math.floor(i / 50) + Math.floor(j / 50)) % 2 === 0) ctx.fillRect(i, j, 50, 50);
        }
    }

    let layout = getFarmGridLayout();
    let contentBottom = layout.offsetY + layout.gridHeight + 120;
    let safeBottom = cachedSafeBottomY;
    farmMaxScrollY = Math.max(0, contentBottom - safeBottom);

    if (!isPointerDown && farmMaxScrollY > 0 && Math.abs(farmScrollVelocity) > 0.3) {
        farmScrollY += farmScrollVelocity;
        farmScrollVelocity *= 0.92;
        if (farmScrollY <= 0 || farmScrollY >= farmMaxScrollY) farmScrollVelocity = 0;
    } else if (!isPointerDown) {
        farmScrollVelocity = 0;
    }
    farmScrollY = Math.max(0, Math.min(farmScrollY, farmMaxScrollY));

    ctx.save();
    ctx.translate(0, -farmScrollY);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#333'; ctx.shadowBlur = 4;
    ctx.fillText('🌻 ひまわり畑', canvas.width / 2, 50);
    ctx.shadowBlur = 0;

    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
            let idx = r * layout.cols + c;
            if (idx >= farmPlots.length) continue;
            let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            drawFarmPlot(cx, cy, layout.cellSize, farmPlots[idx]);
        }
    }

    farmWorkerHamsters.forEach(w => { w.update(); w.draw(); });

    let now = Date.now();
    if (farmWorkers > 0 && now - lastWorkerAction > FARM_CONFIG.workerActionInterval) {
        lastWorkerAction = now;
        performWorkerActions();
    }

    for (let i = farmFloatingTexts.length - 1; i >= 0; i--) {
        farmFloatingTexts[i].update();
        farmFloatingTexts[i].draw();
        if (farmFloatingTexts[i].life <= 0) farmFloatingTexts.splice(i, 1);
    }

    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('→ スワイプで巣へ', canvas.width - 15, 20);

    if (farmMaxScrollY > 0) {
        let barH = Math.max(30, (safeBottom - 80) * (safeBottom / contentBottom));
        let barTop = 80 + (farmScrollY / farmMaxScrollY) * (safeBottom - 80 - barH);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(canvas.width - 20, barTop, 10, barH);
    }

    requestAnimationFrame(farmLoop);
}

function handleFarmTap(cx, cy) {
    let layout = getFarmGridLayout();
    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
            let idx = r * layout.cols + c;
            if (idx >= farmPlots.length) continue;
            let plot = farmPlots[idx];
            let px = layout.offsetX + c * (layout.cellSize + layout.gap);
            let py = layout.offsetY + r * (layout.cellSize + layout.gap);
            if (cx >= px && cx <= px + layout.cellSize && cy >= py && cy <= py + layout.cellSize) {
                let centerX = px + layout.cellSize / 2;
                let centerY = py + layout.cellSize / 2;
                if (plot.state === 'empty') {
                    if (bankSeeds >= FARM_CONFIG.plantCost) {
                        bankSeeds -= FARM_CONFIG.plantCost;
                        plot.state = 'seeded';
                        plot.stageStartedAt = Date.now();
                        plot.watered = false;
                        farmFloatingTexts.push(new FloatingText(centerX, centerY, '-' + FARM_CONFIG.plantCost, '#e74c3c'));
                        saveData();
                    }
                } else if (plot.state === 'harvestable') {
                    let yieldAmt = FARM_CONFIG.harvestYieldMin + Math.floor(Math.random() * (FARM_CONFIG.harvestYieldMax - FARM_CONFIG.harvestYieldMin + 1));
                    bankSeeds += yieldAmt;
                    plot.state = 'empty';
                    plot.stageStartedAt = 0;
                    plot.watered = false;
                    farmFloatingTexts.push(new FloatingText(centerX, centerY, '+' + yieldAmt, '#27ae60'));
                    saveData();
                } else if (!plot.watered) {
                    plot.watered = true;
                    let elapsed = Date.now() - plot.stageStartedAt;
                    let remaining = FARM_CONFIG.growthTime - elapsed;
                    if (remaining > 0) {
                        plot.stageStartedAt -= Math.floor(remaining * FARM_CONFIG.waterBoost);
                    }
                    farmFloatingTexts.push(new FloatingText(centerX, centerY, '💧', '#3498db'));
                    saveData();
                }
                updateFarmUI();
                return;
            }
        }
    }
}

function simulateBackgroundWork() {
    if (farmWorkers <= 0 || lastWorkerAction <= 0) return;
    let now = Date.now();
    let elapsed = now - lastWorkerAction;
    let cycles = Math.floor(elapsed / FARM_CONFIG.workerActionInterval);
    if (cycles <= 0) return;
    cycles = Math.min(cycles, 200);

    let workersAvailable = Math.min(farmWorkers, farmPlots.length);
    for (let c = 0; c < cycles; c++) {
        let cycleTime = lastWorkerAction + (c + 1) * FARM_CONFIG.workerActionInterval;
        let actions = 0;

        for (let plot of farmPlots) {
            if (plot.state === 'empty' || plot.state === 'harvestable') continue;
            let stageIndex = GROWTH_STAGES.indexOf(plot.state);
            if (stageIndex < 0) continue;
            let plotElapsed = cycleTime - plot.stageStartedAt;
            while (plotElapsed >= FARM_CONFIG.growthTime && stageIndex < GROWTH_STAGES.length - 1) {
                plotElapsed -= FARM_CONFIG.growthTime;
                stageIndex++;
                plot.watered = false;
            }
            plot.state = GROWTH_STAGES[stageIndex];
            if (stageIndex < GROWTH_STAGES.length - 1) plot.stageStartedAt = cycleTime - plotElapsed;
        }

        for (let i = 0; i < farmPlots.length && actions < workersAvailable; i++) {
            let plot = farmPlots[i];
            if (plot.state !== 'empty' && plot.state !== 'harvestable' && !plot.watered) {
                plot.watered = true;
                let rem = FARM_CONFIG.growthTime - (cycleTime - plot.stageStartedAt);
                if (rem > 0) plot.stageStartedAt -= Math.floor(rem * FARM_CONFIG.waterBoost);
                actions++;
            }
        }

        for (let i = 0; i < farmPlots.length && actions < workersAvailable; i++) {
            let plot = farmPlots[i];
            if (plot.state === 'empty' && bankSeeds >= FARM_CONFIG.plantCost) {
                bankSeeds -= FARM_CONFIG.plantCost;
                plot.state = 'seeded';
                plot.stageStartedAt = cycleTime;
                plot.watered = false;
                actions++;
            }
        }
    }

    lastWorkerAction = now;
    saveData();
}

function tickBackgroundFarm() {
    if (farmWorkers <= 0 || lastWorkerAction <= 0) return;
    let now = Date.now();
    let elapsed = now - lastWorkerAction;
    if (elapsed < FARM_CONFIG.workerActionInterval) return;
    let cycles = Math.floor(elapsed / FARM_CONFIG.workerActionInterval);
    cycles = Math.min(cycles, 5);
    let workersAvailable = Math.min(farmWorkers, farmPlots.length);

    for (let c = 0; c < cycles; c++) {
        let cycleTime = lastWorkerAction + (c + 1) * FARM_CONFIG.workerActionInterval;
        let actions = 0;

        for (let plot of farmPlots) {
            if (plot.state === 'empty' || plot.state === 'harvestable') continue;
            let si = GROWTH_STAGES.indexOf(plot.state);
            if (si < 0) continue;
            let pe = cycleTime - plot.stageStartedAt;
            while (pe >= FARM_CONFIG.growthTime && si < GROWTH_STAGES.length - 1) {
                pe -= FARM_CONFIG.growthTime; si++; plot.watered = false;
            }
            plot.state = GROWTH_STAGES[si];
            if (si < GROWTH_STAGES.length - 1) plot.stageStartedAt = cycleTime - pe;
        }

        for (let i = 0; i < farmPlots.length && actions < workersAvailable; i++) {
            let plot = farmPlots[i];
            if (plot.state !== 'empty' && plot.state !== 'harvestable' && !plot.watered) {
                plot.watered = true;
                let rem = FARM_CONFIG.growthTime - (cycleTime - plot.stageStartedAt);
                if (rem > 0) plot.stageStartedAt -= Math.floor(rem * FARM_CONFIG.waterBoost);
                actions++;
            }
        }

        for (let i = 0; i < farmPlots.length && actions < workersAvailable; i++) {
            let plot = farmPlots[i];
            if (plot.state === 'empty' && bankSeeds >= FARM_CONFIG.plantCost) {
                bankSeeds -= FARM_CONFIG.plantCost;
                plot.state = 'seeded';
                plot.stageStartedAt = cycleTime;
                plot.watered = false;
                actions++;
            }
        }
    }

    lastWorkerAction = lastWorkerAction + cycles * FARM_CONFIG.workerActionInterval;
    saveData();
}

function harvestAll() {
    let total = 0;
    let layout = getFarmGridLayout();
    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
            let idx = r * layout.cols + c;
            if (idx >= farmPlots.length) continue;
            let plot = farmPlots[idx];
            if (plot.state === 'harvestable') {
                let yieldAmt = FARM_CONFIG.harvestYieldMin + Math.floor(Math.random() * (FARM_CONFIG.harvestYieldMax - FARM_CONFIG.harvestYieldMin + 1));
                total += yieldAmt;
                plot.state = 'empty';
                plot.stageStartedAt = 0;
                plot.watered = false;
                let centerX = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                let centerY = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                farmFloatingTexts.push(new FloatingText(centerX, centerY, '+', '#27ae60'));
            }
        }
    }
    if (total > 0) {
        bankSeeds += total;
        farmFloatingTexts.push(new FloatingText(canvas.width / 2, canvas.height / 2, '+' + total + ' 🌻', '#f39c12'));
        saveData();
        updateFarmUI();
    }
}

function getExpansionCost() {
    let timesExpanded = farmRows - FARM_CONFIG.initialRows;
    return Math.floor(FARM_CONFIG.expansionCost * Math.pow(1.2, timesExpanded));
}

function expandFarm() {
    let cost = getExpansionCost();
    if (farmRows >= FARM_CONFIG.maxRows || bankSeeds < cost) return;
    bankSeeds -= cost;
    farmRows++;
    for (let i = 0; i < FARM_CONFIG.initialCols; i++) {
        farmPlots.push({ state: 'empty', stageStartedAt: 0, watered: false });
    }
    saveData();
    updateFarmUI();
}

function updateWorkerSlider() {
    let slider = document.getElementById('workerSlider');
    let newCount = parseInt(slider.value);
    let maxWorkers = farmPlots.length;
    let totalPool = farmWorkers + bankFriends;
    if (newCount > maxWorkers) newCount = maxWorkers;
    if (newCount > totalPool) newCount = totalPool;
    bankFriends = totalPool - newCount;
    farmWorkers = newCount;
    document.getElementById('workerTakeCount').innerText = farmWorkers;
    let wLayout = getFarmGridLayout();
    let maxDisplay = farmPlots.length;
    while (farmWorkerHamsters.length < Math.min(farmWorkers, maxDisplay)) {
        let plotIdx = farmWorkerHamsters.length % farmPlots.length;
        let r = Math.floor(plotIdx / wLayout.cols);
        let c = plotIdx % wLayout.cols;
        let cx = wLayout.offsetX + c * (wLayout.cellSize + wLayout.gap) + wLayout.cellSize / 2;
        let cy = wLayout.offsetY + r * (wLayout.cellSize + wLayout.gap) + wLayout.cellSize / 2;
        let nw = new FarmWorkerHamster(cx + (Math.random() - 0.5) * 40, cy + wLayout.cellSize * 0.4);
        nw.groundY = nw.y;
        farmWorkerHamsters.push(nw);
    }
    while (farmWorkerHamsters.length > Math.min(farmWorkers, maxDisplay)) farmWorkerHamsters.pop();
    saveData();
    updateFarmUI();
}

function performWorkerActions() {
    let layout = getFarmGridLayout();
    let available = farmWorkerHamsters.filter(w => !w.hasTask());
    if (available.length === 0) return;
    let wi = 0;

    for (let i = 0; i < farmPlots.length && wi < available.length; i++) {
        let plot = farmPlots[i];
        if (plot.state !== 'empty' && plot.state !== 'harvestable' && !plot.watered) {
            if (farmWorkerHamsters.some(w => w.hasTask() && w.targetPlotIdx === i)) continue;
            let r = Math.floor(i / layout.cols);
            let c = i % layout.cols;
            let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            available[wi].assignTask(i, 'water', cx, cy);
            wi++;
        }
    }

    for (let i = 0; i < farmPlots.length && wi < available.length; i++) {
        let plot = farmPlots[i];
        if (plot.state === 'empty' && bankSeeds >= FARM_CONFIG.plantCost) {
            if (farmWorkerHamsters.some(w => w.hasTask() && w.targetPlotIdx === i)) continue;
            let r = Math.floor(i / layout.cols);
            let c = i % layout.cols;
            let cx = layout.offsetX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            let cy = layout.offsetY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            available[wi].assignTask(i, 'plant', cx, cy);
            wi++;
        }
    }
}
