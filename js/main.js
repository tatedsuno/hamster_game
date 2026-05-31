const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const HAMSTER_POSES = ['idle', 'run', 'jump', 'djump', 'fall'];
let hamsterSprites = {};
const sprites = {
    seed: { img: new Image(), loaded: false },
    seedMount: { img: new Image(), loaded: false }
};

let seedThumb = null;

let imagesLoadedCount = 0;
let totalImages = 0;
let gameStarted = false;
let assetsInitialized = false;

function bindImageLoad(entry, onLoadExtra) {
    entry.img.onload = function() {
        entry.loaded = true;
        if (onLoadExtra) onLoadExtra();
        checkAllImagesLoaded();
    };
    entry.img.onerror = function() {
        console.warn("Image load failed: " + entry.img.src);
        entry.loaded = false;
        checkAllImagesLoaded();
    };
}

function initAllAssets() {
    if (assetsInitialized) return;
    assetsInitialized = true;
    totalImages = HAMSTER_COLLECTION.length * HAMSTER_POSES.length + 2;
    imagesLoadedCount = 0;

    bindImageLoad(sprites.seed, createSeedThumbnail);
    bindImageLoad(sprites.seedMount);
    sprites.seed.img.src = 'seed.png';
    sprites.seedMount.img.src = 'seed_mount.png';

    for (let name of HAMSTER_COLLECTION) {
        hamsterSprites[name] = {};
        for (let pose of HAMSTER_POSES) {
            let entry = { img: new Image(), loaded: false };
            hamsterSprites[name][pose] = entry;
            bindImageLoad(entry);
            entry.img.src = getHamsterSpritePath(name, pose);
        }
    }
}

function getHamsterImage(speciesName, pose) {
    let name = resolveHamsterSpeciesName(speciesName);
    let bucket = hamsterSprites[name];
    if (!bucket) return null;
    let poseOrder = [pose, 'idle', 'run', 'jump', 'djump', 'fall'];
    for (let p of poseOrder) {
        let sp = bucket[p];
        if (sp && sp.loaded) return sp.img;
    }
    return null;
}

function drawHamsterSprite(speciesName, pose, x, y, w, h, options = {}) {
    let img = getHamsterImage(speciesName, pose);
    let scale = getHamsterDrawScale(speciesName);
    let dw = w * scale;
    let dh = h * scale;
    let anchor = options.anchor || 'topleft';
    let dx, dy;

    if (anchor === 'center') {
        dx = x - dw / 2;
        dy = y - dh / 2;
    } else if (anchor === 'bottom-center') {
        dx = x - dw / 2;
        dy = y - dh;
    } else {
        dx = x + (w - dw) / 2;
        dy = y + (h - dh);
    }

    let rotation = options.rotation || 0;
    if (rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.translate(-x, -y);
    }

    if (img) ctx.drawImage(img, dx, dy, dw, dh);
    else if (options.fallbackColor) {
        ctx.fillStyle = options.fallbackColor;
        if (anchor === 'bottom-center') {
            ctx.fillRect(x - w / 2, y - h, w, h);
        } else if (anchor === 'center') {
            ctx.fillRect(x - w / 2, y - h / 2, w, h);
        } else {
            ctx.fillRect(x, y, w, h);
        }
    }

    if (rotation) ctx.restore();
}

function resolveHamsterPose({ isFall, isGrounded, jumpCount, isMoving }) {
    if (isFall) return 'fall';
    if (isGrounded === false) return (jumpCount >= 2) ? 'djump' : 'jump';
    return isMoving ? 'run' : 'idle';
}

function checkAllImagesLoaded() {
    imagesLoadedCount++;
    if (imagesLoadedCount >= totalImages) {
        startGame();
    }
}

function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    document.getElementById('loading').style.display = 'none';
    initNest();
}

function createSeedThumbnail() {
    if (!sprites.seed.loaded) return;
    let thumbW = 44, thumbH = 56;
    let offCanvas = document.createElement('canvas');
    offCanvas.width = thumbW;
    offCanvas.height = thumbH;
    let offCtx = offCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(sprites.seed.img, 0, 0, thumbW, thumbH);
    seedThumb = offCanvas;
}

setTimeout(() => {
    if (!gameStarted) {
        console.warn("Loading timeout. Force start.");
        startGame();
    }
}, 5000);

function resize() {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width / ZOOM_SCALE;
    canvas.height = rect.height / ZOOM_SCALE;
}
window.addEventListener('resize', resize);
resize();

if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(document.getElementById('canvasContainer'));
}
