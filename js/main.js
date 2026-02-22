const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const sprites = {
    idle: { img: new Image(), loaded: false },
    run: { img: new Image(), loaded: false },
    jump: { img: new Image(), loaded: false },
    djump: { img: new Image(), loaded: false },
    fall: { img: new Image(), loaded: false },
    seed: { img: new Image(), loaded: false },
    seedMount: { img: new Image(), loaded: false }
};

sprites.idle.img.src = 'ham.idle.png';
sprites.run.img.src = 'ham.run.png';
sprites.jump.img.src = 'ham.jump.png';
sprites.djump.img.src = 'ham.djump.png';
sprites.fall.img.src = 'ham.fall.png';
sprites.seed.img.src = 'seed.png';
sprites.seedMount.img.src = 'seed_mount.png';

let seedThumb = null;

let imagesLoadedCount = 0;
const totalImages = Object.keys(sprites).length;
let gameStarted = false;

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
    if (localStorage.getItem('ham_seeds')) initNest(); else initNest();
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

for (let key in sprites) {
    sprites[key].img.onload = function() {
        sprites[key].loaded = true;
        if (key === 'seed') createSeedThumbnail();
        checkAllImagesLoaded();
    };
    sprites[key].img.onerror = function() {
        console.warn("Image load failed: " + sprites[key].img.src);
        sprites[key].loaded = false; 
        checkAllImagesLoaded(); 
    };
}

setTimeout(() => {
    if (!gameStarted) {
        console.warn("Loading timeout. Force start.");
        startGame();
    }
}, 3000);

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
