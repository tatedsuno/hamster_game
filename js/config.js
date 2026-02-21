const ZOOM_SCALE = 0.6; 
const FRIEND_INTERVAL_METER = 200; 
const NEST_FLOOR_RATIO = 0.70;
const MAX_PHYSICS_SEEDS = 80;
const SEED_CAPACITY_PER_HAMSTER = 100;
const BREEDING_COST_SEEDS = 600;
const BABIES_PER_BIRTH = 6;

const BREEDING_CONFIG = {
    pregnancyTime: 120000,
    babyGrowthTime: 180000
};

const FARM_CONFIG = {
    initialRows: 3,
    initialCols: 4,
    plantCost: 5,
    harvestYieldMin: 20,
    harvestYieldMax: 30,
    growthTime: 15000,
    waterBoost: 0.5,
    workerCostPerTrip: 2,
    expansionCost: 200,
    maxRows: 25,
    workerActionInterval: 3000
};
const GROWTH_STAGES = ['empty', 'seeded', 'sprout', 'growing', 'blooming', 'harvestable'];

const PILLAR_CONFIG = { minWidth: 10, maxWidth: 10, minGap: 0, maxGap: 0, baseColor: '#0be881' };
const SPAWN_PATTERNS = {
    normal: { name: "基本モード", weight: 60, width: { min: 300, max: 600 }, gap: { min: 50, max: 150 } },
    rapid: { name: "連打モード", weight: 30, width: { min: 30, max: 150 }, gap: { min: 30, max: 80 } },
    longJump: { name: "大ジャンプモード", weight: 10, width: { min: 200, max: 400 }, gap: { min: 180, max: 500 } }
};

const DRAG_START_THRESHOLD = 10;
