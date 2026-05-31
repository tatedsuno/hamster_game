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
const HAMSTER_COLLECTION = [
    'ジャガリアン',
    'ゴールデン',
    'ブルーサファイアジャンガリアン',
    'パールホワイトジャンガリアン',
    'ロボロフスキー',
    'プディングジャンガリアン',
    'キンクマ'
];
const MAIN_HAMSTER_DEFAULT = 'ジャガリアン';
const LEGACY_SPECIES_NAME_MAP = {
    'ジャガリアンハムスター': 'ジャガリアン',
    'ゴールデンハムスター': 'ゴールデン',
    'ブルーサファイアジャンガリアンハムスター': 'ブルーサファイアジャンガリアン',
    'パールホワイトジャンガリアンハムスター': 'パールホワイトジャンガリアン',
    'ロボロフスキーハムスター': 'ロボロフスキー',
    'プディングジャンガリアンハムスター': 'プディングジャンガリアン'
};
const HAMSTER_SPRITE_KEYS = {
    'ブルーサファイアジャンガリアン': '',
    'ゴールデン': 'golden',
    'キンクマ': 'kinkuma',
    'ジャガリアン': 'jungarian',
    'パールホワイトジャンガリアン': 'pearl_white',
    'プディングジャンガリアン': 'pudding',
    'ロボロフスキー': 'roborovski'
};
const HAMSTER_DRAW_SCALES = {
    'ゴールデン': 1.2,
    'キンクマ': 1.2
};
const HAMSTER_UNLOCK_DISTANCE_STEP = 500;
const GAME_SAVE_KEYS = [
    'ham_seeds',
    'ham_friends',
    'ham_breeding',
    'ham_farm_plots',
    'ham_farm_workers',
    'ham_farm_rows',
    'ham_last_worker_action',
    'ham_main_species',
    'ham_best_distance',
    'ham_encyclopedia_complete'
];
const RESET_SPECIES_PICKER_FLAG = 'ham_show_reset_species_picker';
const RESET_SPECIES_SESSION_KEY = 'ham_reset_unlocked_species';
const RESET_SPECIES_INITIAL_KEY = 'ham_reset_initial_species';
function migrateSpeciesName(speciesName) {
    if (!speciesName) return speciesName;
    if (HAMSTER_COLLECTION.includes(speciesName)) return speciesName;
    return LEGACY_SPECIES_NAME_MAP[speciesName] || speciesName;
}

let mainHamsterName = sessionStorage.getItem(RESET_SPECIES_PICKER_FLAG) === '1'
    ? null
    : migrateSpeciesName(localStorage.getItem('ham_main_species') || MAIN_HAMSTER_DEFAULT);
let bestDistanceMeters = parseInt(localStorage.getItem('ham_best_distance') || '0');
let breedingQueue = JSON.parse(localStorage.getItem('ham_breeding') || '[]');
breedingQueue.forEach(q => {
    if (q.tripsRemaining !== undefined && q.startedAt === undefined) {
        q.startedAt = Date.now();
        delete q.tripsRemaining;
    }
    q.speciesName = migrateSpeciesName(q.speciesName);
    if (!q.speciesName || !HAMSTER_COLLECTION.includes(q.speciesName)) {
        q.speciesName = MAIN_HAMSTER_DEFAULT;
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

let scenePreviewBuffers = {
    nest: document.createElement('canvas'),
    farm: document.createElement('canvas')
};
let scenePreviewReady = {
    nest: false,
    farm: false
};
let scenePreviewLastCaptureAt = {
    nest: 0,
    farm: 0
};

function updateScenePreviewBuffer(scene) {
    let buffer = scenePreviewBuffers[scene];
    if (!buffer || !canvas) return;
    let now = Date.now();
    if (now - scenePreviewLastCaptureAt[scene] < 120) return;
    scenePreviewLastCaptureAt[scene] = now;
    if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
        buffer.width = canvas.width;
        buffer.height = canvas.height;
    }
    let bctx = buffer.getContext('2d');
    if (!bctx) return;
    bctx.clearRect(0, 0, buffer.width, buffer.height);
    bctx.drawImage(canvas, 0, 0);
    scenePreviewReady[scene] = true;
}

function getScenePreviewBuffer(scene) {
    return scenePreviewBuffers[scene] || null;
}

function hasScenePreviewBuffer(scene) {
    return !!scenePreviewReady[scene];
}

function isAwaitingResetSpeciesSelection() {
    return sessionStorage.getItem(RESET_SPECIES_PICKER_FLAG) === '1';
}

if (mainHamsterName && !HAMSTER_COLLECTION.includes(mainHamsterName)) {
    mainHamsterName = MAIN_HAMSTER_DEFAULT;
}
if (!Number.isFinite(bestDistanceMeters) || bestDistanceMeters < 0) {
    bestDistanceMeters = 0;
}
let selectedBreedingSpecies = mainHamsterName || MAIN_HAMSTER_DEFAULT;
let pendingResetUnlockedSpecies = [];
let pendingResetInitialSpecies = MAIN_HAMSTER_DEFAULT;

function cancelPendingDrag() {
    pendingDragHamster = null;
    pendingMainHamsterTap = false;
}

function saveData() {
    localStorage.setItem('ham_seeds', bankSeeds);
    localStorage.setItem('ham_friends', bankFriends);
    localStorage.setItem('ham_breeding', JSON.stringify(breedingQueue));
    localStorage.setItem('ham_farm_plots', JSON.stringify(farmPlots));
    localStorage.setItem('ham_farm_workers', farmWorkers);
    localStorage.setItem('ham_farm_rows', farmRows);
    localStorage.setItem('ham_last_worker_action', lastWorkerAction);
    if (mainHamsterName) {
        localStorage.setItem('ham_main_species', mainHamsterName);
    }
    localStorage.setItem('ham_best_distance', bestDistanceMeters);
}

function migrateLegacySpeciesSaveIfNeeded() {
    let needSave = false;
    let storedMain = localStorage.getItem('ham_main_species');
    if (storedMain) {
        let migratedMain = migrateSpeciesName(storedMain);
        if (migratedMain !== storedMain && HAMSTER_COLLECTION.includes(migratedMain)) {
            needSave = true;
        }
    }
    let rawBreeding = localStorage.getItem('ham_breeding');
    if (rawBreeding) {
        try {
            let parsed = JSON.parse(rawBreeding);
            for (let q of parsed) {
                if (migrateSpeciesName(q.speciesName) !== q.speciesName) {
                    needSave = true;
                    break;
                }
            }
        } catch (_) {}
    }
    if (needSave) saveData();
}

migrateLegacySpeciesSaveIfNeeded();

function showNestSettings() {
    let modal = document.getElementById('nestSettingsModal');
    if (modal) modal.style.display = 'block';
}

function closeNestSettings() {
    let modal = document.getElementById('nestSettingsModal');
    if (modal) modal.style.display = 'none';
}

function requestGameReset() {
    closeNestSettings();
    let modal = document.getElementById('resetConfirmModal');
    if (modal) modal.style.display = 'block';
}

function cancelGameReset() {
    let modal = document.getElementById('resetConfirmModal');
    if (modal) modal.style.display = 'none';
}

/** 初期種を先頭に、500mごとの新種が初期種と被らない解放順 */
function getDistanceUnlockSequence(mainSpecies) {
    let main = resolveHamsterSpeciesName(mainSpecies || mainHamsterName);
    let sequence = [main];
    for (let name of HAMSTER_COLLECTION) {
        if (name !== main) sequence.push(name);
    }
    return sequence;
}

function getEncyclopediaUnlockedSpeciesAtDistance(distanceMeters) {
    let count = getUnlockedHamsterCount(distanceMeters);
    let sequence = getDistanceUnlockSequence(mainHamsterName);
    return sequence.slice(0, count);
}

function getUnlockedHamstersAtDistance(distanceMeters) {
    return getEncyclopediaUnlockedSpeciesAtDistance(distanceMeters);
}

/** 図鑑・繁殖・リセット時の選択肢に使う解放済み種一覧 */
function getEncyclopediaUnlockedSpecies() {
    if (isAwaitingResetSpeciesSelection()) {
        return [];
    }
    return getEncyclopediaUnlockedSpeciesAtDistance(getEffectiveUnlockDistanceMeters());
}

function getEncyclopediaUnlockedSpeciesBeforeReset() {
    return getEncyclopediaUnlockedSpeciesAtDistance(bestDistanceMeters);
}

function getEncyclopediaDisplayOrder() {
    return getDistanceUnlockSequence(mainHamsterName);
}

function renderResetSpeciesPicker() {
    let container = document.getElementById('resetSpeciesPicker');
    if (!container) return;
    let html = '<div class="breeding-species-list">';
    pendingResetUnlockedSpecies.forEach((name, i) => {
        let sel = name === pendingResetInitialSpecies;
        html += `<button type="button" class="breed-species-btn${sel ? ' selected' : ''}" onclick="selectResetInitialSpeciesByIndex(${i})">${name}</button>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function selectResetInitialSpeciesByIndex(index) {
    if (index < 0 || index >= pendingResetUnlockedSpecies.length) return;
    pendingResetInitialSpecies = pendingResetUnlockedSpecies[index];
    renderResetSpeciesPicker();
}

function persistResetSpeciesPickerSession(unlockedSpecies, initialSpecies) {
    sessionStorage.setItem(RESET_SPECIES_SESSION_KEY, JSON.stringify(unlockedSpecies));
    sessionStorage.setItem(RESET_SPECIES_INITIAL_KEY, initialSpecies);
    sessionStorage.setItem(RESET_SPECIES_PICKER_FLAG, '1');
}

function clearResetSpeciesPickerSession() {
    sessionStorage.removeItem(RESET_SPECIES_SESSION_KEY);
    sessionStorage.removeItem(RESET_SPECIES_INITIAL_KEY);
    sessionStorage.removeItem(RESET_SPECIES_PICKER_FLAG);
}

function confirmGameReset() {
    cancelGameReset();
    let unlocked = getEncyclopediaUnlockedSpeciesBeforeReset();
    if (!unlocked.length) {
        unlocked = [MAIN_HAMSTER_DEFAULT];
    }
    let initial = unlocked.includes(mainHamsterName) ? mainHamsterName : unlocked[0];
    persistResetSpeciesPickerSession(unlocked, initial);
    GAME_SAVE_KEYS.forEach(key => localStorage.removeItem(key));
    location.reload();
}

function showPostResetSpeciesPickerIfNeeded() {
    if (sessionStorage.getItem(RESET_SPECIES_PICKER_FLAG) !== '1') return;
    try {
        pendingResetUnlockedSpecies = JSON.parse(sessionStorage.getItem(RESET_SPECIES_SESSION_KEY) || '[]');
    } catch (_) {
        pendingResetUnlockedSpecies = [];
    }
    pendingResetUnlockedSpecies = pendingResetUnlockedSpecies
        .map(migrateSpeciesName)
        .filter(name => HAMSTER_COLLECTION.includes(name));
    if (!pendingResetUnlockedSpecies.length) {
        pendingResetUnlockedSpecies = [MAIN_HAMSTER_DEFAULT];
    }
    let savedInitial = migrateSpeciesName(sessionStorage.getItem(RESET_SPECIES_INITIAL_KEY));
    pendingResetInitialSpecies = pendingResetUnlockedSpecies.includes(savedInitial)
        ? savedInitial
        : pendingResetUnlockedSpecies[0];
    renderResetSpeciesPicker();
    let modal = document.getElementById('resetSpeciesModal');
    if (modal) modal.style.display = 'block';
}

function cancelResetSpeciesPicker() {
    if (sessionStorage.getItem(RESET_SPECIES_PICKER_FLAG) === '1') {
        finalizeGameReset();
        return;
    }
    let modal = document.getElementById('resetSpeciesModal');
    if (modal) modal.style.display = 'none';
    pendingResetUnlockedSpecies = [];
}

function finalizeGameReset() {
    let species = resolveHamsterSpeciesName(pendingResetInitialSpecies);
    mainHamsterName = species;
    selectedBreedingSpecies = species;
    bestDistanceMeters = 0;
    clearResetSpeciesPickerSession();
    pendingResetUnlockedSpecies = [];
    saveData();
    let modal = document.getElementById('resetSpeciesModal');
    if (modal) modal.style.display = 'none';
    if (typeof initNest === 'function') initNest();
}

function getUnlockedHamsterCount(distanceMeters) {
    let unlocked = 1 + Math.floor(distanceMeters / HAMSTER_UNLOCK_DISTANCE_STEP);
    return Math.max(1, Math.min(HAMSTER_COLLECTION.length, unlocked));
}

function getEffectiveUnlockDistanceMeters() {
    if (typeof score === 'number' && (gameState === 'playing' || gameState === 'paused')) {
        return Math.max(bestDistanceMeters, Math.max(0, Math.floor(score / 10)));
    }
    return bestDistanceMeters;
}

function getUnlockedHamsters() {
    return getEncyclopediaUnlockedSpecies();
}

function isNewHamsterSpeciesForEncyclopedia(speciesName) {
    let name = resolveHamsterSpeciesName(speciesName);
    return !getEncyclopediaUnlockedSpeciesAtDistance(bestDistanceMeters).includes(name);
}

function resolveHamsterSpeciesName(speciesName) {
    let name = migrateSpeciesName(speciesName);
    if (name && HAMSTER_COLLECTION.includes(name)) return name;
    return MAIN_HAMSTER_DEFAULT;
}

function getHamsterToastDisplayName(speciesName) {
    return resolveHamsterSpeciesName(speciesName);
}

function pickHamsterSpecies(index = 0) {
    let unlocked = getUnlockedHamsters();
    if (!unlocked.length) return MAIN_HAMSTER_DEFAULT;
    let i = ((index % unlocked.length) + unlocked.length) % unlocked.length;
    return unlocked[i];
}

function getWallRewardHamsterSpecies(distanceMeters) {
    let distance = Math.max(0, Math.floor(distanceMeters || 0));
    let tier = Math.min(
        HAMSTER_COLLECTION.length - 1,
        Math.floor(distance / HAMSTER_UNLOCK_DISTANCE_STEP)
    );
    let sequence = getDistanceUnlockSequence(mainHamsterName);
    return sequence[tier];
}

function cycleMainHamsterSpecies() {
    let unlocked = getUnlockedHamsters();
    if (unlocked.length <= 1) return mainHamsterName;
    let idx = unlocked.indexOf(mainHamsterName);
    if (idx < 0) idx = 0;
    mainHamsterName = unlocked[(idx + 1) % unlocked.length];
    saveData();
    updateNestUI();
    return mainHamsterName;
}

function getHamsterSpritePath(speciesName, pose) {
    let name = resolveHamsterSpeciesName(speciesName);
    let key = HAMSTER_SPRITE_KEYS[name];
    if (key === undefined || key === '') return `ham.${pose}.png`;
    return `ham.${key}.${pose}.png`;
}

function getHamsterDrawScale(speciesName) {
    let name = resolveHamsterSpeciesName(speciesName);
    return HAMSTER_DRAW_SCALES[name] || 1;
}

function updateHamsterCollectionByDistance(distanceMeters) {
    let distance = Math.max(0, Math.floor(distanceMeters || 0));
    let previousBest = bestDistanceMeters;
    let previousUnlockedCount = getUnlockedHamsterCount(previousBest);
    if (distance > bestDistanceMeters) {
        bestDistanceMeters = distance;
    }
    let unlockedCount = getUnlockedHamsterCount(bestDistanceMeters);
    let sequence = getDistanceUnlockSequence(mainHamsterName);
    let newlyUnlocked = sequence.slice(previousUnlockedCount, unlockedCount);
    saveData();
    return {
        distance,
        previousBest,
        bestDistanceMeters,
        newlyUnlocked,
        unlockedCount
    };
}

function renderHamsterEncyclopedia() {
    let unlockedSpecies = getEncyclopediaUnlockedSpecies();
    let unlockedSet = new Set(unlockedSpecies);
    let unlockedCount = unlockedSpecies.length;
    let content = document.getElementById('hamsterEncyclopediaContent');
    let progress = document.getElementById('encyclopediaProgress');
    let progressInline = document.getElementById('encyclopediaProgressInline');
    let best = document.getElementById('encyclopediaBestDistance');
    if (progress) progress.innerText = `${unlockedCount} / ${HAMSTER_COLLECTION.length}`;
    if (progressInline) progressInline.innerText = `${unlockedCount} / ${HAMSTER_COLLECTION.length}`;
    if (best) best.innerText = `${bestDistanceMeters}m`;
    if (!content) return;
    let html = '';
    for (let speciesName of getEncyclopediaDisplayOrder()) {
        let unlocked = unlockedSet.has(speciesName);
        let name = unlocked ? speciesName : '？？？？？';
        let icon = unlocked ? '🐹' : '🔒';
        html += `<div class="encyclopedia-row ${unlocked ? 'unlocked' : 'locked'}">${icon} ${name}</div>`;
    }
    content.innerHTML = html;
}

function showHamsterEncyclopedia() {
    renderHamsterEncyclopedia();
    let modal = document.getElementById('hamsterEncyclopediaModal');
    if (modal) modal.style.display = 'block';
}

function closeHamsterEncyclopedia() {
    let modal = document.getElementById('hamsterEncyclopediaModal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// 繁殖・消費システム
// ==========================================
function getBreedingQueueSpecies(q) {
    return resolveHamsterSpeciesName(q && q.speciesName);
}

function selectBreedingSpeciesByIndex(index) {
    let unlocked = getUnlockedHamsters();
    if (index < 0 || index >= unlocked.length) return;
    selectedBreedingSpecies = unlocked[index];
    renderBreedingModalContent();
}

function renderBreedingModalContent() {
    let unlocked = getUnlockedHamsters();
    if (!unlocked.includes(selectedBreedingSpecies)) {
        selectedBreedingSpecies = unlocked[0] || MAIN_HAMSTER_DEFAULT;
    }

    let hasSeeds = bankSeeds >= BREEDING_COST_SEEDS;
    let hasFriends = bankFriends >= 1;

    let html = '';
    html += `<span style="color:${hasSeeds ? '#feca57' : '#e74c3c'}">🌻 種: ${bankSeeds} / ${BREEDING_COST_SEEDS}個 ${hasSeeds ? '✔' : '✘'}</span><br>`;
    html += `<span style="color:${hasFriends ? '#ff9f43' : '#e74c3c'}">🐹 親: ${bankFriends} / 1匹 ${hasFriends ? '✔' : '✘'}</span><br>`;
    html += `<span style="font-size:12px; color:#aaa;">※親は育児のため冒険に出られなくなります</span>`;
    document.getElementById('breedingConditions').innerHTML = html;

    let picker = document.getElementById('breedingSpeciesPicker');
    if (picker) {
        let pickerHtml = '<div style="margin:10px 0 6px; font-size:13px; font-weight:bold; color:#ffeaa7;">育てるハムスターの種類</div>';
        pickerHtml += '<div class="breeding-species-list">';
        unlocked.forEach((name, i) => {
            let sel = name === selectedBreedingSpecies;
            pickerHtml += `<button type="button" class="breed-species-btn${sel ? ' selected' : ''}" onclick="selectBreedingSpeciesByIndex(${i})">${name}</button>`;
        });
        pickerHtml += '</div>';
        picker.innerHTML = pickerHtml;
    }

    let btn = document.getElementById('breedConfirmBtn');
    if (hasSeeds && hasFriends) {
        btn.disabled = false; btn.style.opacity = 1;
    } else {
        btn.disabled = true; btn.style.opacity = 0.5;
    }
}

function startBreedingCheck() {
    selectedBreedingSpecies = mainHamsterName;
    renderBreedingModalContent();
    document.getElementById('breedingModal').style.display = 'block';
}

function confirmBreeding() {
    let species = resolveHamsterSpeciesName(selectedBreedingSpecies);
    if (bankSeeds >= BREEDING_COST_SEEDS && bankFriends >= 1) {
        bankSeeds -= BREEDING_COST_SEEDS;
        bankFriends -= 1;
        let startedAt = Date.now();
        breedingQueue.push({ type: 'pregnant', startedAt: startedAt, count: 1, speciesName: species });
        saveData(); updateNestUI();
        nestSeeds.splice(0, Math.min(nestSeeds.length, 50));
        let converted = false;
        for (let h of nestHamsters) {
            if (h.stage === 0 && !h.isDragging && !h.isThrown) {
                h.stage = 3;
                h.size = 95;
                h.state = 'pregnant';
                h.speciesName = species;
                h.breedingStartedAt = startedAt;
                h.vx = 0;
                converted = true;
                spawnEffect(h.x, h.y - h.size / 2, 'pregnant');
                break;
            }
        }
        if (!converted) {
            nestHamsters.push(new NestHamster(3, startedAt, species));
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
    let friendDelta = returnedFriendsCount - selectedFriendsCount;
    if (friendDelta > 0) {
        bankFriends += friendDelta;
        log.push(`🐹 仲間が ${friendDelta} 匹ふえました。`);
    } else if (friendDelta < 0) {
        bankFriends = Math.max(0, bankFriends + friendDelta);
        log.push(`💥 仲間が ${Math.abs(friendDelta)} 匹へりました。`);
    } else {
        log.push('🐹 仲間の増減はありませんでした。');
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
            html += `<div style="margin-bottom:8px;">🤰 妊娠中 (${getBreedingQueueSpecies(q)}) — ${timeStr}<br>`;
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
            html += `<div style="margin-bottom:8px;">👶 ${stageLabel} (${getBreedingQueueSpecies(q)}・${q.count}匹) — ${timeStr}<br>`;
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

if (typeof initAllAssets === 'function') initAllAssets();
