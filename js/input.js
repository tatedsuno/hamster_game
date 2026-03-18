// ==========================================
// 入力処理（タッチ/マウス）
// ==========================================
let touchStartX = 0; let touchStartY = 0;

let lastDragX = 0;
let lastDragY = 0;
let dragVelocityX = 0;
let dragVelocityY = 0;
const SWIPE_TRIGGER_X = 50;
const SWIPE_DOMINANCE_RATIO = 1.05;
const SWIPE_ESCAPE_FROM_SCROLL_X = 80;
const SWIPE_PREVIEW_START_X = 14;
const FARM_TAP_MOVE_THRESHOLD = 15;
const HUB_SCENE_ORDER = ['nest', 'farm'];

let farmTapStartInPlot = false;
let swipePreviewTarget = '';
let swipeTransitionLocked = false;
let activeSwipeRevealX = 0;
let activeSwipeDirection = 0;
let isGestureTracking = false;

const swipePreviewEl = document.getElementById('swipePreview');
const swipePreviewCanvasEl = document.getElementById('swipePreviewCanvas');
const swipePreviewLabelEl = document.getElementById('swipePreviewLabel');
const swipePreviewCtx = swipePreviewCanvasEl ? swipePreviewCanvasEl.getContext('2d') : null;

function getSceneElementIds(scene) {
    if (scene === 'nest') return { headerId: 'nestHeader', panelId: 'nestUI' };
    if (scene === 'farm') return { headerId: 'farmHeader', panelId: 'farmUI' };
    return { headerId: '', panelId: '' };
}

function setSceneSlideTransform(scene, offsetPx, transition) {
    let ids = getSceneElementIds(scene);
    if (!ids.headerId || !ids.panelId) return;
    let header = document.getElementById(ids.headerId);
    let panel = document.getElementById(ids.panelId);
    [header, panel].forEach(el => {
        if (!el || el.style.display === 'none') return;
        if (transition !== undefined) el.style.transition = transition;
        el.style.transform = `translateX(${offsetPx}px)`;
    });
}

function clearSceneSlideTransform(scene) {
    let ids = getSceneElementIds(scene);
    if (!ids.headerId || !ids.panelId) return;
    let header = document.getElementById(ids.headerId);
    let panel = document.getElementById(ids.panelId);
    [header, panel].forEach(el => {
        if (!el) return;
        el.style.transition = '';
        el.style.transform = 'translateX(0px)';
    });
}

function getCurrentSceneForSwipe() {
    if (gameState === 'nest' || gameState === 'farm') return gameState;
    return '';
}

function getHubSceneIndex(scene) {
    return HUB_SCENE_ORDER.indexOf(scene);
}

function getWrappedHubScene(scene, step) {
    let idx = getHubSceneIndex(scene);
    if (idx < 0 || HUB_SCENE_ORDER.length <= 0) return '';
    let nextIdx = (idx + step + HUB_SCENE_ORDER.length) % HUB_SCENE_ORDER.length;
    return HUB_SCENE_ORDER[nextIdx];
}

function isAnyHubModalOpen() {
    const modalIds = [
        'breedingModal',
        'breedingInfoModal',
        'hamsterEncyclopediaModal',
        'logModal',
        'pauseModal',
        'gameOverModal'
    ];
    for (let id of modalIds) {
        let el = document.getElementById(id);
        if (!el) continue;
        if (el.style.display === 'block') return true;
    }
    return false;
}

function stripIdsFromNode(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.id) root.removeAttribute('id');
    let nodes = root.querySelectorAll('[id]');
    nodes.forEach(n => n.removeAttribute('id'));
}

function createSwipeGhostFromElement(el, startX, zIndex) {
    if (!el) return null;
    let rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    let ghost = el.cloneNode(true);
    stripIdsFromNode(ghost);
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = '0';
    ghost.style.transform = `translateX(${startX}px)`;
    ghost.style.transition = 'transform 180ms ease-out';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = String(zIndex);
    return ghost;
}

function createSwipeGhostCanvas(startX) {
    let rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    let ghostCanvas = document.createElement('canvas');
    ghostCanvas.width = Math.max(1, Math.floor(rect.width));
    ghostCanvas.height = Math.max(1, Math.floor(rect.height));
    let gctx = ghostCanvas.getContext('2d');
    if (gctx) {
        gctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, ghostCanvas.width, ghostCanvas.height);
    }
    ghostCanvas.style.position = 'fixed';
    ghostCanvas.style.left = `${rect.left}px`;
    ghostCanvas.style.top = `${rect.top}px`;
    ghostCanvas.style.width = `${rect.width}px`;
    ghostCanvas.style.height = `${rect.height}px`;
    ghostCanvas.style.transform = `translateX(${startX}px)`;
    ghostCanvas.style.transition = 'transform 180ms ease-out';
    ghostCanvas.style.pointerEvents = 'none';
    ghostCanvas.style.zIndex = '115';
    return ghostCanvas;
}

function resetSwipePreview(keepCanvasTransform = false) {
    if (!swipePreviewEl || !swipePreviewLabelEl) return;
    swipePreviewTarget = '';
    swipePreviewEl.style.display = 'none';
    swipePreviewEl.style.opacity = '0';
    swipePreviewEl.style.transition = '';
    swipePreviewEl.style.justifyContent = 'center';
    swipePreviewLabelEl.textContent = '';
    swipePreviewLabelEl.style.marginLeft = '0';
    swipePreviewLabelEl.style.marginRight = '0';
    swipePreviewLabelEl.style.display = 'none';
    if (swipePreviewCanvasEl && swipePreviewCtx) {
        swipePreviewCanvasEl.width = 1;
        swipePreviewCanvasEl.height = 1;
    }
    canvas.style.transition = '';
    if (!keepCanvasTransform) {
        canvas.style.transform = 'translateX(0px)';
    }
    activeSwipeRevealX = 0;
    activeSwipeDirection = 0;
    clearSceneSlideTransform('nest');
    clearSceneSlideTransform('farm');
}

function renderSwipeTargetPreview(target) {
    if (!swipePreviewCanvasEl || !swipePreviewCtx || !swipePreviewLabelEl) return;
    let buffer = getScenePreviewBuffer(target);
    let hasBuffer = hasScenePreviewBuffer(target) && buffer;
    let cw = Math.max(1, Math.floor(canvas.clientWidth || canvas.getBoundingClientRect().width || 1));
    let ch = Math.max(1, Math.floor(canvas.clientHeight || canvas.getBoundingClientRect().height || 1));
    if (swipePreviewCanvasEl.width !== cw || swipePreviewCanvasEl.height !== ch) {
        swipePreviewCanvasEl.width = cw;
        swipePreviewCanvasEl.height = ch;
    }

    swipePreviewCtx.clearRect(0, 0, cw, ch);
    if (hasBuffer) {
        swipePreviewCtx.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, cw, ch);
        swipePreviewLabelEl.style.display = 'none';
    } else {
        swipePreviewCtx.fillStyle = target === 'farm' ? '#6fbf4a' : '#f4d678';
        swipePreviewCtx.fillRect(0, 0, cw, ch);
        swipePreviewLabelEl.style.display = 'block';
        swipePreviewLabelEl.textContent = target === 'farm' ? '🌻 ひまわり畑' : '🏠 ハムスターの巣';
    }
}

function updateSwipePreview(diffX, target) {
    if (!swipePreviewEl || !swipePreviewLabelEl) return;
    if (!target) {
        resetSwipePreview();
        return;
    }
    let direction = diffX < 0 ? 'left' : 'right';
    if (Math.abs(diffX) < SWIPE_PREVIEW_START_X) {
        resetSwipePreview();
        return;
    }

    let reveal = direction === 'left' ? Math.min(0, diffX) : Math.max(0, diffX);
    let canvasWidth = canvas.getBoundingClientRect().width || 1;
    let revealRatio = Math.min(Math.abs(reveal) / canvasWidth, 1);

    swipePreviewTarget = target;
    swipePreviewEl.style.display = 'flex';
    swipePreviewEl.style.opacity = String(Math.min(0.95, 0.25 + revealRatio * 0.7));
    swipePreviewEl.style.justifyContent = direction === 'left' ? 'flex-end' : 'flex-start';
    swipePreviewEl.style.background = 'transparent';
    renderSwipeTargetPreview(target);
    swipePreviewLabelEl.style.marginLeft = direction === 'left' ? '0' : '28px';
    swipePreviewLabelEl.style.marginRight = direction === 'left' ? '28px' : '0';

    canvas.style.transition = '';
    canvas.style.transform = `translateX(${reveal}px)`;
    activeSwipeRevealX = reveal;
    activeSwipeDirection = direction === 'left' ? -1 : 1;
    let currentScene = getCurrentSceneForSwipe();
    if (currentScene) setSceneSlideTransform(currentScene, reveal, '');
}

function cancelSwipePreviewWithAnimation() {
    let currentScene = getCurrentSceneForSwipe();
    if (!swipePreviewTarget) {
        resetSwipePreview();
        return;
    }
    canvas.style.transition = 'transform 170ms ease-out';
    canvas.style.transform = 'translateX(0px)';
    if (currentScene) setSceneSlideTransform(currentScene, 0, 'transform 170ms ease-out');
    swipePreviewEl.style.transition = 'opacity 170ms ease-out';
    swipePreviewEl.style.opacity = '0';
    setTimeout(() => {
        resetSwipePreview();
    }, 180);
}

function commitSwipeTransition(target, swipeDirection) {
    if (!target || swipeTransitionLocked) return;
    let currentScene = getCurrentSceneForSwipe();
    if (!currentScene) return;
    swipeTransitionLocked = true;
    let widthPx = canvas.getBoundingClientRect().width || 1;
    let direction = swipeDirection || activeSwipeDirection || -1;
    let endX = direction < 0 ? -widthPx : widthPx;
    let startX = activeSwipeRevealX;

    let ids = getSceneElementIds(currentScene);
    let currentHeader = ids.headerId ? document.getElementById(ids.headerId) : null;
    let currentPanel = ids.panelId ? document.getElementById(ids.panelId) : null;
    let ghostCanvas = createSwipeGhostCanvas(startX);
    let ghostHeader = createSwipeGhostFromElement(currentHeader, startX, 116);
    let ghostPanel = createSwipeGhostFromElement(currentPanel, startX, 116);
    if (ghostCanvas) document.body.appendChild(ghostCanvas);
    if (ghostHeader) document.body.appendChild(ghostHeader);
    if (ghostPanel) document.body.appendChild(ghostPanel);

    canvas.style.transition = '';
    canvas.style.transform = 'translateX(0px)';
    clearSceneSlideTransform(currentScene);

    if (target === 'farm') initFarm();
    else initNest();

    if (swipePreviewEl) {
        swipePreviewEl.style.display = 'none';
        swipePreviewEl.style.opacity = '0';
        swipePreviewEl.style.transition = '';
    }

    requestAnimationFrame(() => {
        if (ghostCanvas) ghostCanvas.style.transform = `translateX(${endX}px)`;
        if (ghostHeader) ghostHeader.style.transform = `translateX(${endX}px)`;
        if (ghostPanel) ghostPanel.style.transform = `translateX(${endX}px)`;
    });

    setTimeout(() => {
        if (ghostCanvas && ghostCanvas.parentNode) ghostCanvas.parentNode.removeChild(ghostCanvas);
        if (ghostHeader && ghostHeader.parentNode) ghostHeader.parentNode.removeChild(ghostHeader);
        if (ghostPanel && ghostPanel.parentNode) ghostPanel.parentNode.removeChild(ghostPanel);
        resetSwipePreview(true);
        canvas.style.transform = 'translateX(0px)';
        clearSceneSlideTransform(currentScene);
        clearSceneSlideTransform(target);
        swipeTransitionLocked = false;
    }, 200);
}

function getSwipeTarget(diffX, diffY, strictFromScroll) {
    let absX = Math.abs(diffX);
    let absY = Math.abs(diffY);
    if (absX < SWIPE_TRIGGER_X) return '';
    if (absX <= absY * SWIPE_DOMINANCE_RATIO) return '';
    if (strictFromScroll && absX < SWIPE_ESCAPE_FROM_SCROLL_X) return '';

    let currentScene = getCurrentSceneForSwipe();
    if (!currentScene) return '';
    let step = diffX < 0 ? 1 : -1;
    return getWrappedHubScene(currentScene, step);
}

function handleInputStart(e) {
    if (!gameStarted) return; 
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
        isGestureTracking = false;
        return;
    }
    if (swipeTransitionLocked) return;
    if ((gameState === 'nest' || gameState === 'farm') && isAnyHubModalOpen()) {
        isGestureTracking = false;
        return;
    }
    isGestureTracking = true;
    isPointerDown = true;
    farmScrollVelocity = 0;
    resetSwipePreview();
    farmTapStartInPlot = false;
    
    let cx, cy;
    if(e.type === 'touchstart') { 
        e.preventDefault(); 
        touchStartX = e.touches[0].clientX; 
        touchStartY = e.touches[0].clientY; 
    } else { 
        touchStartX = e.clientX; 
        touchStartY = e.clientY; 
    }
    
    let rect = canvas.getBoundingClientRect();
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;
    cx = (touchStartX - rect.left) * scaleX;
    cy = (touchStartY - rect.top) * scaleY;

    if (gameState === 'nest') {
        for(let h of nestHamsters) {
            let dx = h.x - cx; 
            let dy = (h.y - h.size/2) - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < h.size) {
                pendingDragHamster = h;
                pendingDragCx = cx;
                pendingDragCy = cy;
                pendingDragIsNest = true;
                return;
            }
        }

        for(let s of nestSeeds) {
            let dx = s.x - cx; let dy = s.y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
                let force = (100 - dist) * 0.2; s.wakeUp();
                s.vx += (dx/dist) * force + (Math.random()-0.5)*5; s.vy -= force * 0.5 + Math.random()*5;
            }
        }
    }
    else if (gameState === 'farm') {
        let contentCy = cy + farmScrollY;
        for (let h of farmWorkerHamsters) {
            let dx = h.x - cx;
            let dy = h.y - contentCy;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < h.size) {
                pendingDragHamster = h;
                pendingDragCx = cx;
                pendingDragCy = cy;
                pendingDragIsNest = false;
                return;
            }
        }
        farmTouchScrolling = false;
        farmTouchStartCanvasY = cy;
        farmScrollYAtTouchStart = farmScrollY;
        farmTapStartInPlot = isPointInsideFarmPlot(cx, contentCy);
        if (farmMaxScrollY <= 0) {
            handleFarmTap(cx, contentCy);
        }
    }
    else if (gameState === 'playing') player.jump();
}

function handleInputMove(e) {
    if (gameState !== 'nest' && gameState !== 'farm') return;
    if (!isGestureTracking) return;
    if (!isPointerDown) return;
    if (swipeTransitionLocked) return;
    if (isAnyHubModalOpen()) {
        cancelSwipePreviewWithAnimation();
        return;
    }
    e.preventDefault();

    let cx, cy;
    if(e.type === 'touchmove') {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    let rect = canvas.getBoundingClientRect();
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;
    let gameX = (cx - rect.left) * scaleX;
    let gameY = (cy - rect.top) * scaleY;
    let diffX = cx - touchStartX;
    let diffY = cy - touchStartY;

    if (pendingDragHamster && !draggedHamster) {
        let moveDist = Math.sqrt((gameX - pendingDragCx) ** 2 + (gameY - pendingDragCy) ** 2);
        if (moveDist > DRAG_START_THRESHOLD) {
            let h = pendingDragHamster;
            h.isDragging = true;
            h.isThrown = false;
            h.vx = 0; h.vy = 0;
            if (gameState === 'farm') {
                h.state = 'idle';
                h.targetPlotIdx = -1;
            }
            draggedHamster = h;
            dragOffsetX = h.x - pendingDragCx;
            if (pendingDragIsNest) {
                dragOffsetY = (h.y - h.size / 2) - pendingDragCy;
            } else {
                dragOffsetY = h.y - (pendingDragCy + farmScrollY);
            }
            lastDragX = gameX;
            lastDragY = pendingDragIsNest ? gameY : (gameY + farmScrollY);
            dragVelocityX = 0;
            dragVelocityY = 0;
            pendingDragHamster = null;
        }
        return;
    }

    if (draggedHamster) {
        if (gameState === 'farm') {
            let contentGameY = gameY + farmScrollY;
            draggedHamster.x = gameX + dragOffsetX;
            draggedHamster.y = contentGameY + dragOffsetY;
            dragVelocityX = (gameX - lastDragX) * 0.5;
            dragVelocityY = (contentGameY - lastDragY) * 0.5;
            lastDragX = gameX;
            lastDragY = contentGameY;
        } else {
            draggedHamster.x = gameX + dragOffsetX;
            draggedHamster.y = gameY + dragOffsetY + draggedHamster.size / 2;
            dragVelocityX = (gameX - lastDragX) * 0.5;
            dragVelocityY = (gameY - lastDragY) * 0.5;
            lastDragX = gameX;
            lastDragY = gameY;
        }
        return;
    }

    let targetWhileMoving = getSwipeTarget(diffX, diffY, farmTouchScrolling);
    let allowHorizontalSwipeNow = targetWhileMoving !== '';

    if (gameState === 'farm' && farmMaxScrollY > 0) {
        let deltaY = farmTouchStartCanvasY - gameY;
        if (!allowHorizontalSwipeNow && (Math.abs(deltaY) > 10 || farmTouchScrolling)) {
            farmTouchScrolling = true;
            let newScrollY = Math.max(0, Math.min(farmScrollYAtTouchStart + deltaY, farmMaxScrollY));
            farmScrollVelocity = newScrollY - farmScrollY;
            farmScrollY = newScrollY;
        } else if (allowHorizontalSwipeNow) {
            farmTouchScrolling = false;
        }
    }

    updateSwipePreview(diffX, targetWhileMoving);
}

function handleInputEnd(e) {
    if (!isGestureTracking) {
        isPointerDown = false;
        return;
    }
    isGestureTracking = false;
    isPointerDown = false;
    if (swipeTransitionLocked) return;
    if ((gameState === 'nest' || gameState === 'farm') && isAnyHubModalOpen()) {
        cancelSwipePreviewWithAnimation();
        return;
    }

    if (pendingDragHamster) {
        let tappedHamster = pendingDragHamster;
        pendingDragHamster = null;
        if (tappedHamster && gameState === 'farm' && !tappedHamster.isThrown) {
            boostWorker(tappedHamster);
        }
        cancelSwipePreviewWithAnimation();
        return;
    }

    if ((gameState === 'nest' || gameState === 'farm') && draggedHamster) {
        draggedHamster.isDragging = false;
        draggedHamster.isThrown = true;
        let releaseY = draggedHamster.y;
        if (gameState === 'nest') {
            let floorTop = canvas.height * NEST_FLOOR_RATIO;
            let safeMax = cachedSafeBottomY - draggedHamster.size;
            draggedHamster.groundY = Math.max(floorTop, Math.min(releaseY, safeMax));
        } else {
            draggedHamster.groundY = Math.max(100, releaseY);
        }
        draggedHamster.vx = Math.max(-20, Math.min(20, dragVelocityX));
        draggedHamster.vy = Math.max(-20, Math.min(20, dragVelocityY));
        draggedHamster = null;
        cancelSwipePreviewWithAnimation();
        return;
    }

    let touchEndX = 0; let touchEndY = 0;
    if(e.type === 'touchend') { touchEndX = e.changedTouches[0].clientX; touchEndY = e.changedTouches[0].clientY; }
    else { touchEndX = e.clientX; touchEndY = e.clientY; }
    let diffX = touchEndX - touchStartX; let diffY = touchEndY - touchStartY;
    let wasFarmTouchScrolling = farmTouchScrolling;
    farmTouchScrolling = false;

    if (gameState === 'farm' && farmMaxScrollY > 0 && Math.abs(diffX) < FARM_TAP_MOVE_THRESHOLD && Math.abs(diffY) < FARM_TAP_MOVE_THRESHOLD) {
        let rect = canvas.getBoundingClientRect();
        let scaleX = canvas.width / rect.width;
        let scaleY = canvas.height / rect.height;
        let startCx = (touchStartX - rect.left) * scaleX;
        let startCy = (touchStartY - rect.top) * scaleY + farmScrollYAtTouchStart;
        let endCx = (touchEndX - rect.left) * scaleX;
        let endCy = (touchEndY - rect.top) * scaleY + farmScrollY;
        let startInPlot = farmTapStartInPlot || isPointInsideFarmPlot(startCx, startCy);
        let endInPlot = isPointInsideFarmPlot(endCx, endCy);
        if (startInPlot && endInPlot) {
            handleFarmTap(endCx, endCy);
            cancelSwipePreviewWithAnimation();
            return;
        }
    }

    let swipeTarget = getSwipeTarget(diffX, diffY, wasFarmTouchScrolling);

    if (gameState === 'nest' || gameState === 'farm') {
        if (swipeTarget) {
            commitSwipeTransition(swipeTarget, diffX < 0 ? -1 : 1);
            return;
        }
        if (gameState === 'farm' && wasFarmTouchScrolling) {
            cancelSwipePreviewWithAnimation();
            return;
        }
    } else if (gameState === 'playing') {
        if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY)) pauseGame();
    }

    cancelSwipePreviewWithAnimation();
}

window.addEventListener('mousedown', handleInputStart);
window.addEventListener('mousemove', handleInputMove);
window.addEventListener('mouseup', handleInputEnd);

window.addEventListener('touchstart', handleInputStart, {passive: false});
window.addEventListener('touchmove', handleInputMove, {passive: false});
window.addEventListener('touchend', handleInputEnd);
window.addEventListener('touchcancel', () => {
    isGestureTracking = false;
    isPointerDown = false;
    farmTouchScrolling = false;
    pendingDragHamster = null;
    if (draggedHamster) draggedHamster.isDragging = false;
    draggedHamster = null;
    resetSwipePreview();
});
