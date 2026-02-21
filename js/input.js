// ==========================================
// 入力処理（タッチ/マウス）
// ==========================================
let touchStartX = 0; let touchStartY = 0;

let lastDragX = 0;
let lastDragY = 0;
let dragVelocityX = 0;
let dragVelocityY = 0;

function handleInputStart(e) {
    if (!gameStarted) return; 
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    isPointerDown = true;
    farmScrollVelocity = 0;
    
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
        if (farmMaxScrollY <= 0) {
            handleFarmTap(cx, contentCy);
        }
    }
    else if (gameState === 'playing') player.jump();
}

function handleInputMove(e) {
    if (gameState !== 'nest' && gameState !== 'farm') return;
    if (!isPointerDown) return;
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

    if (gameState === 'farm' && farmMaxScrollY > 0) {
        let deltaY = farmTouchStartCanvasY - gameY;
        if (Math.abs(deltaY) > 10 || farmTouchScrolling) {
            farmTouchScrolling = true;
            let newScrollY = Math.max(0, Math.min(farmScrollYAtTouchStart + deltaY, farmMaxScrollY));
            farmScrollVelocity = newScrollY - farmScrollY;
            farmScrollY = newScrollY;
        }
    }
}

function handleInputEnd(e) {
    isPointerDown = false;

    if (pendingDragHamster) {
        let tappedHamster = pendingDragHamster;
        pendingDragHamster = null;
        if (tappedHamster && gameState === 'farm' && !tappedHamster.isThrown) {
            boostWorker(tappedHamster);
        }
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
        return;
    }

    if (gameState === 'farm' && farmTouchScrolling) {
        farmTouchScrolling = false;
        return;
    }

    let touchEndX = 0; let touchEndY = 0;
    if(e.type === 'touchend') { touchEndX = e.changedTouches[0].clientX; touchEndY = e.changedTouches[0].clientY; }
    else { touchEndX = e.clientX; touchEndY = e.clientY; }
    let diffX = touchEndX - touchStartX; let diffY = touchEndY - touchStartY;

    if (gameState === 'nest') {
        if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY)) initFarm();
    } else if (gameState === 'farm') {
        if (Math.abs(diffX) < 15 && Math.abs(diffY) < 15 && farmMaxScrollY > 0) {
            let rect = canvas.getBoundingClientRect();
            let scaleX = canvas.width / rect.width;
            let scaleY = canvas.height / rect.height;
            let tapCx = (touchStartX - rect.left) * scaleX;
            let tapCy = (touchStartY - rect.top) * scaleY + farmScrollY;
            handleFarmTap(tapCx, tapCy);
        } else if (diffX > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            initNest();
        }
    } else if (gameState === 'playing') {
        if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY)) pauseGame();
    }
}

window.addEventListener('mousedown', handleInputStart);
window.addEventListener('mousemove', handleInputMove);
window.addEventListener('mouseup', handleInputEnd);

window.addEventListener('touchstart', handleInputStart, {passive: false});
window.addEventListener('touchmove', handleInputMove, {passive: false});
window.addEventListener('touchend', handleInputEnd);
