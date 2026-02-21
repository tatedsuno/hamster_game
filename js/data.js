// ==========================================
// 共有状態・ユーティリティ
// ==========================================
let cachedSafeBottomY = 9999;
let farmScrollY = 0;
let farmMaxScrollY = 0;
let farmTouchScrolling = false;
let farmTouchStartCanvasY = 0;
let farmScrollYAtTouchStart = 0;

function getSafeBottomY() {
    return canvas.height;
}

// ==========================================
// 状態・データ管理
// ==========================================
let gameState = 'loading';
let bankSeeds = parseInt(localStorage.getItem('ham_seeds') || '0');
let bankFriends = parseInt(localStorage.getItem('ham_friends') || '0');
let breedingQueue = JSON.parse(localStorage.getItem('ham_breeding') || '[]');
breedingQueue.forEach(q => {
    if (q.tripsRemaining !== undefined && q.startedAt === undefined) {
        q.startedAt = Date.now();
        delete q.tripsRemaining;
    }
});
let selectedFriendsCount = 0; 

let farmWorkers = parseInt(localStorage.getItem('ham_farm_workers') || '0');
let farmRows = parseInt(localStorage.getItem('ham_farm_rows') || String(FARM_CONFIG.initialRows));
let farmPlots = JSON.parse(localStorage.getItem('ham_farm_plots') || 'null');
if (!farmPlots) {
    farmPlots = [];
    for (let i = 0; i < FARM_CONFIG.initialRows * FARM_CONFIG.initialCols; i++) {
        farmPlots.push({ state: 'empty', stageStartedAt: 0, watered: false });
    }
}

let lastWorkerAction = parseInt(localStorage.getItem('ham_last_worker_action') || '0');

let draggedHamster = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isPointerDown = false;

let pendingDragHamster = null;
let pendingDragCx = 0;
let pendingDragCy = 0;
let pendingDragIsNest = false;

let farmScrollVelocity = 0;

function cancelPendingDrag() {
    pendingDragHamster = null;
}

function saveData() {
    localStorage.setItem('ham_seeds', bankSeeds);
    localStorage.setItem('ham_friends', bankFriends);
    localStorage.setItem('ham_breeding', JSON.stringify(breedingQueue));
    localStorage.setItem('ham_farm_plots', JSON.stringify(farmPlots));
    localStorage.setItem('ham_farm_workers', farmWorkers);
    localStorage.setItem('ham_farm_rows', farmRows);
    localStorage.setItem('ham_last_worker_action', lastWorkerAction);
}

// ==========================================
// 繁殖・消費システム
// ==========================================
function startBreedingCheck() {
    let hasSeeds = bankSeeds >= BREEDING_COST_SEEDS;
    let hasFriends = bankFriends >= 1;

    let html = '';
    html += `<span style="color:${hasSeeds ? '#feca57' : '#e74c3c'}">🌻 種: ${bankSeeds} / ${BREEDING_COST_SEEDS}個 ${hasSeeds ? '✔' : '✘'}</span><br>`;
    html += `<span style="color:${hasFriends ? '#ff9f43' : '#e74c3c'}">🐹 親: ${bankFriends} / 1匹 ${hasFriends ? '✔' : '✘'}</span><br>`;
    html += `<span style="font-size:12px; color:#aaa;">※親は育児のため冒険に出られなくなります</span>`;
    document.getElementById('breedingConditions').innerHTML = html;

    let btn = document.getElementById('breedConfirmBtn');
    if (hasSeeds && hasFriends) {
        btn.disabled = false; btn.style.opacity = 1;
    } else {
        btn.disabled = true; btn.style.opacity = 0.5;
    }
    document.getElementById('breedingModal').style.display = 'block';
}

function confirmBreeding() {
    if (bankSeeds >= BREEDING_COST_SEEDS && bankFriends >= 1) {
        bankSeeds -= BREEDING_COST_SEEDS;
        bankFriends -= 1;
        let startedAt = Date.now();
        breedingQueue.push({ type: 'pregnant', startedAt: startedAt, count: 1 });
        saveData(); updateNestUI();
        nestSeeds.splice(0, Math.min(nestSeeds.length, 50));
        let converted = false;
        for (let h of nestHamsters) {
            if (h.stage === 0 && !h.isDragging && !h.isThrown) {
                h.stage = 3;
                h.size = 95;
                h.state = 'pregnant';
                h.breedingStartedAt = startedAt;
                h.vx = 0;
                converted = true;
                spawnEffect(h.x, h.y - h.size / 2, 'pregnant');
                break;
            }
        }
        if (!converted) {
            nestHamsters.push(new NestHamster(3, startedAt));
        }
    }
    closeBreedingModal();
}

function cancelBreeding() { closeBreedingModal(); }
function closeBreedingModal() { document.getElementById('breedingModal').style.display = 'none'; }

function updateBreeding() {
    let now = Date.now();
    let anyChanged = false;
    let newBabiesTotal = 0;
    let newAdultsTotal = 0;
    for (let i = 0; i < breedingQueue.length; i++) {
        let q = breedingQueue[i];
        if (q.type === 'pregnant') {
            if (now - q.startedAt >= BREEDING_CONFIG.pregnancyTime) {
                bankFriends += q.count;
                let babies = q.count * BABIES_PER_BIRTH;
                newBabiesTotal += babies;
                q.type = 'baby';
                q.count = babies;
                q.startedAt = now;
                anyChanged = true;
            }
        } else if (q.type === 'baby') {
            if (now - q.startedAt >= BREEDING_CONFIG.babyGrowthTime) {
                newAdultsTotal += q.count;
                bankFriends += q.count;
                q.done = true;
                anyChanged = true;
            }
        }
    }
    if (anyChanged) {
        breedingQueue = breedingQueue.filter(q => !q.done);
        saveData();
    }
    return { newBabiesTotal, newAdultsTotal };
}

function processTimePassage(collectedSeeds, returnedFriendsCount) {
    let log = [];
    bankSeeds += collectedSeeds;
    log.push(`種を ${collectedSeeds} 個持ち帰りました。`);
    
    if (returnedFriendsCount > 0) {
        bankFriends += returnedFriendsCount;
        log.push(`仲間 ${returnedFriendsCount} 匹が無事に帰還しました！`);
    }

    let babyCount = 0; let pregnantCount = 0;
    breedingQueue.forEach(q => { if (q.type === 'pregnant') pregnantCount += q.count; if (q.type === 'baby') babyCount += q.count; });
    let totalMouths = bankFriends + farmWorkers + pregnantCount + babyCount;
    let workerExtraCost = farmWorkers * FARM_CONFIG.workerCostPerTrip;
    let consumption = totalMouths * 1 + workerExtraCost; 
    log.push(`全 ${totalMouths} 匹が種を ${consumption} 個食べました。`);
    if (farmWorkers > 0) log.push(`(畑ワーカー ${farmWorkers} 匹の追加コスト: ${workerExtraCost})`);

    if (bankSeeds >= consumption) { bankSeeds -= consumption; } else {
        let survivors = bankSeeds; let casualties = totalMouths - survivors;
        bankSeeds = 0; 
        log.push(`<span style="color:red">種が足りない！ ${casualties} 匹が餓死しました...</span>`);
        for (let i = breedingQueue.length - 1; i >= 0; i--) {
            if (casualties <= 0) break; let group = breedingQueue[i];
            if (group.count <= casualties) { casualties -= group.count; breedingQueue.splice(i, 1); }
            else { group.count -= casualties; casualties = 0; }
        }
        if (casualties > 0) { bankFriends = Math.max(0, bankFriends - casualties); }
    }

    let breeding = updateBreeding();
    if (breeding.newBabiesTotal > 0) log.push(`👶 <span style="color:#fd79a8">赤ちゃんが ${breeding.newBabiesTotal} 匹生まれました！</span>`);
    if (breeding.newAdultsTotal > 0) log.push(`🐹 <span style="color:#00cec9">子ハム ${breeding.newAdultsTotal} 匹が大人になりました！</span>`);
    
    saveData(); return log;
}

let breedingInfoTimer = null;

function renderBreedingInfoContent() {
    let now = Date.now();
    let html = '';
    breedingQueue.forEach(q => {
        if (q.type === 'pregnant') {
            let elapsed = now - q.startedAt;
            let progress = Math.min(1, elapsed / BREEDING_CONFIG.pregnancyTime);
            let remaining = Math.max(0, BREEDING_CONFIG.pregnancyTime - elapsed);
            let pct = Math.floor(progress * 100);
            let timeStr = formatTimeRemaining(remaining);
            html += `<div style="margin-bottom:8px;">🤰 妊娠中 (${q.count}匹) — ${timeStr}<br>`;
            html += `<div style="background:rgba(0,0,0,0.15);border-radius:4px;height:10px;margin-top:3px;">`;
            html += `<div style="background:#fd79a8;width:${pct}%;height:100%;border-radius:4px;transition:width 0.5s;"></div></div></div>`;
        }
    });
    breedingQueue.forEach(q => {
        if (q.type === 'baby') {
            let elapsed = now - q.startedAt;
            let progress = Math.min(1, elapsed / BREEDING_CONFIG.babyGrowthTime);
            let remaining = Math.max(0, BREEDING_CONFIG.babyGrowthTime - elapsed);
            let pct = Math.floor(progress * 100);
            let timeStr = formatTimeRemaining(remaining);
            let stageLabel = progress < 0.5 ? '赤ちゃん' : 'もうすぐ大人';
            html += `<div style="margin-bottom:8px;">👶 ${stageLabel} (${q.count}匹) — ${timeStr}<br>`;
            html += `<div style="background:rgba(0,0,0,0.15);border-radius:4px;height:10px;margin-top:3px;">`;
            html += `<div style="background:#00cec9;width:${pct}%;height:100%;border-radius:4px;transition:width 0.5s;"></div></div></div>`;
        }
    });
    if (!html) html = '<div style="color:#aaa; text-align:center;">妊娠・成長中のハムスターはいません</div>';
    document.getElementById('breedingInfoContent').innerHTML = html;
}

function showBreedingInfo() {
    renderBreedingInfoContent();
    document.getElementById('breedingInfoModal').style.display = 'block';
    if (breedingInfoTimer) clearInterval(breedingInfoTimer);
    breedingInfoTimer = setInterval(renderBreedingInfoContent, 1000);
}

function closeBreedingInfo() {
    document.getElementById('breedingInfoModal').style.display = 'none';
    if (breedingInfoTimer) { clearInterval(breedingInfoTimer); breedingInfoTimer = null; }
}

function updatePageIndicator(page) {
    let indicator = document.getElementById('pageIndicator');
    indicator.style.display = 'flex';
    document.getElementById('dotNest').className = 'page-dot' + (page === 'nest' ? ' active' : '');
    document.getElementById('dotFarm').className = 'page-dot' + (page === 'farm' ? ' active' : '');
}
