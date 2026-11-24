/* ============================================================
 * core/fish.js · 鱼实体与派生属性
 *
 * 纯逻辑：不碰 canvas、不碰 wx。
 * 鱼的「数据」与「运行时位置」放在同一个对象里，
 * 但只有 core/sim.js 会改运行时字段，渲染层只读。
 *
 * 产出与成长公式都集中在这里，数值全部来自 config/。
 * ============================================================ */

var cfg = require('../config/index.js');

var SPECIES = cfg.species;
var SPECIES_MAP = {};
for (var i = 0; i < SPECIES.length; i++) SPECIES_MAP[SPECIES[i].id] = SPECIES[i];

/* 改过名的鱼种在这里留个别名，老存档读出来才不会掉成第一条鱼 */
var SPECIES_ALIAS = {
    silver_dragon: 'gold_dragon'
};
for (var alias in SPECIES_ALIAS) {
    if (SPECIES_MAP[SPECIES_ALIAS[alias]]) SPECIES_MAP[alias] = SPECIES_MAP[SPECIES_ALIAS[alias]];
}

var RARITY_RANK = { R: 0, SR: 1, SSR: 2 };
var RARITY_NAME = ['R', 'SR', 'SSR'];

var seq = 0;

function speciesById(id) {
    return SPECIES_MAP[id] || SPECIES[0];
}

function speciesByPalette(p) {
    for (var i = 0; i < SPECIES.length; i++) {
        if (SPECIES[i].palette === p) return SPECIES[i];
    }
    return SPECIES[0];
}

function rarityRank(sp) {
    var r = RARITY_RANK[sp.rarity];
    return r == null ? 0 : r;
}

/* 成长值 0-100 → 阶段 */
function stageOf(growth) {
    var st = cfg.economy.stage;
    if (growth >= st.adultAt) return 'adult';
    if (growth >= st.juvenileAt) return 'juvenile';
    return 'fry';
}

function stageName(stage) {
    if (stage === 'adult') return '成鱼';
    if (stage === 'juvenile') return '幼鱼';
    return '鱼苗';
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sizeOf(f) {
    var sp = speciesById(f.speciesId);
    return cfg.economy.size.base + f.growth * cfg.economy.size.perGrowth * (sp.sizeScale || 1);
}

/* 成长曲线：growth 0-100 → 产出比例 */
function stageMul(growth) {
    var sc = cfg.economy.production.stageCurve;
    var g = growth / 100;
    if (g < 0) g = 0;
    if (g > 1) g = 1;
    return sc.floor + (1 - sc.floor) * Math.pow(g, sc.exp);
}

/* 体型加成：比基准体型越大，产出越高 */
function sizeMul(f) {
    var bonus = cfg.economy.production.sizeCurve.bonus;
    return 1 + (sizeOf(f) / cfg.economy.size.base - 1) * bonus;
}

/* 词条产出倍率；词条系统未开启时恒为 1 */
function traitOutputMul(f) {
    if (!cfg.traits.enabled || !f.traits || !f.traits.length) return 1;
    var mul = 1;
    for (var i = 0; i < f.traits.length; i++) {
        var def = null;
        for (var k = 0; k < cfg.traits.list.length; k++) {
            if (cfg.traits.list[k].id === f.traits[i].id) def = cfg.traits.list[k];
        }
        if (def && def.type === 'outputMul') mul *= f.traits[i].value || def.min;
    }
    return mul;
}

/* 状态衰减：饱食 / 心情不满时按比例减产，最低保留 floor */
function conditionMul(f) {
    var c = cfg.economy.production.condition;
    var h = clamp01(f.hunger / Math.max(1, c.hungerFullAt));
    var m = clamp01(f.mood / Math.max(1, c.moodFullAt));
    var hMul = c.hungerFloor + (1 - c.hungerFloor) * h;
    var mMul = c.moodFloor + (1 - c.moodFloor) * m;
    return hMul * mMul;
}

/**
 * 每秒产出（鱼币）
 *   baseRate × 鱼种倍率 × 成长曲线 × 体型加成 × 状态 × 词条倍率
 */
function incomePerSecond(f) {
    var p = cfg.economy.production;
    if (p.adultOnly && stageOf(f.growth) !== 'adult') return 0;

    var sp = speciesById(f.speciesId);
    return p.baseRate * (sp.incomeMul || 1) * stageMul(f.growth) * sizeMul(f) *
        conditionMul(f) * traitOutputMul(f);
}

/* 自然成长：每秒涨多少成长值 */
function passiveGrowthPerSecond(f) {
    var G = cfg.economy.growth;
    if (!G.passive) return 0;
    if (f.growth >= 100) return 0;
    if (f.hunger <= G.starveBelow) return 0;
    var sp = speciesById(f.speciesId);
    return 100 / Math.max(1, sp.matureSeconds || 120);
}

/* 吃一粒饲料涨多少成长值（越接近成鱼越少） */
function feedGrowthPerPellet(f, foodLv) {
    var G = cfg.economy.growth;
    var sp = speciesById(f.speciesId);
    var remain = 1 - f.growth / 100;
    if (remain <= 0) return 0;
    if (remain > 1) remain = 1;
    var lvMul = 1 + Math.max(0, (foodLv || 1) - 1) * G.foodLvBonus;
    return G.feedBase * (sp.feedMul || 1) * lvMul * Math.pow(remain, G.feedExp);
}

/* 饱食度低于阈值 → 停止成长（渲染层用来提示） */
function isStarving(f) {
    return f.hunger <= cfg.economy.growth.starveBelow;
}

/* ---------------- 抽取 ---------------- */

/* 当前缸内鱼数 → 已解锁的最高品质档位 */
function unlockedRank(fishCount) {
    var at = cfg.economy.gacha.unlockAt || [0];
    var rank = 0;
    for (var i = 0; i < at.length; i++) {
        if (fishCount >= at[i]) rank = i;
    }
    return Math.min(rank, RARITY_NAME.length - 1);
}

/* 在原权重表里按上限档位筛选 */
function poolOf(maxRank) {
    var pool = [];
    var total = 0;
    for (var i = 0; i < SPECIES.length; i++) {
        var rank = rarityRank(SPECIES[i]);
        if (rank > maxRank) continue;
        pool.push(SPECIES[i]);
        total += SPECIES[i].drawWeight || 1;
    }
    if (!pool.length) return { list: [SPECIES[0]], total: 1 };
    return { list: pool, total: total };
}

/**
 * 按权重抽一条鱼。
 * maxRank 传 null 表示按缸内鱼数自动决定（见 unlockedRank）。
 */
function rollSpecies(fishCount, maxRank) {
    var rank = maxRank == null ? unlockedRank(fishCount || 0) : maxRank;
    var pool = poolOf(rank);
    var r = Math.random() * pool.total;
    var acc = 0;
    for (var i = 0; i < pool.list.length; i++) {
        acc += pool.list[i].drawWeight || 1;
        if (r <= acc) return pool.list[i];
    }
    return pool.list[pool.list.length - 1];
}

/* 兼容旧调用：无参随机（全池均匀），仅存档迁移/测试用 */
function randomSpecies(rarity) {
    var pool = SPECIES;
    if (rarity) {
        pool = [];
        for (var i = 0; i < SPECIES.length; i++) {
            if (SPECIES[i].rarity === rarity) pool.push(SPECIES[i]);
        }
        if (!pool.length) pool = SPECIES;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

/* 某档位及以下的加权平均产出倍率（用于调平衡 / 调试面板显示） */
function expectedIncomeMul(maxRank) {
    var pool = poolOf(maxRank == null ? 2 : maxRank);
    var sum = 0;
    for (var i = 0; i < pool.list.length; i++) {
        sum += (pool.list[i].drawWeight || 1) * pool.list[i].incomeMul;
    }
    return sum / pool.total;
}

/* ---------------- 词条 ---------------- */

/* 出生时掉词条的概率，按品质走：越稀有越可能带词条 */
var TRAIT_CHANCE = { R: 0.06, SR: 0.18, SSR: 0.40 };

/**
 * 给新鱼 roll 一条词条。只 roll config 里 rollable !== false 的，
 * 也就是「效果已经实现」的那几类（当前只有高产）。
 * 速繁 / 双生 要等繁殖系统（M3），变异要等 S 币产出，暂时不可 roll。
 */
function rollTraits(sp) {
    var T = cfg.traits;
    if (!T.enabled) return [];

    var chance = TRAIT_CHANCE[sp.rarity] || 0;
    if (!(chance > 0) || Math.random() >= chance) return [];

    var pool = [];
    for (var i = 0; i < T.list.length; i++) {
        if (T.list[i].rollable === false) continue;
        pool.push(T.list[i]);
    }
    if (!pool.length) return [];

    var def = pool[Math.floor(Math.random() * pool.length)];
    var value = def.max;
    if (def.max > def.min) value = def.min + Math.random() * (def.max - def.min);

    /* 倍率留两位小数，存档不臃肿 */
    return [{ id: def.id, value: Math.round(value * 100) / 100 }];
}

/* ---------------- 卖价（M3） ---------------- */

/* 成鱼（growth=100）能卖多少钱：baseRate × incomeMul × 成鱼耗时 × factor */
function matureValueOf(sp) {
    var S = cfg.economy.sell;
    return cfg.economy.production.baseRate * (sp.incomeMul || 1) *
        Math.max(1, sp.matureSeconds || 120) * S.factor;
}

/**
 * 一条鱼现在能卖多少钱。
 *   matureValue × 成长折价 × 词条加成 × 招财贝壳加成
 * 故意不看饱食/心情：饿鱼只是长得慢，不该按「状态不好」再砍一刀，
 * 否则玩家会觉得「我离线一趟回来鱼就贬值了」。
 *
 * shellLv 可选（0-3，默认 0）：招财贝壳的卖价倍率。
 * 只在「卖鱼」这一端乘，matureValueOf / avgSellOf（卵价基准）不碰，
 * 否则卵价会跟着水涨船高，加成等于白给。调用方不传就是原价，
 * 老代码与测试全部保持原样。
 */
function sellPriceOf(f, shellLv) {
    var S = cfg.economy.sell;
    var sp = speciesById(f.speciesId);
    var g = clamp01((f.growth || 0) / 100);
    var ratio = S.minRatio + (1 - S.minRatio) * Math.pow(g, S.curveExp);
    var traits = (f.traits && f.traits.length) ? 1 + S.traitBonus * f.traits.length : 1;
    var bonusList = S.shellBonus || [1];
    var lv = Math.max(0, Math.min(bonusList.length - 1, shellLv || 0));
    var shell = bonusList[lv] || 1;
    var p = matureValueOf(sp) * ratio * traits * shell;
    var step = S.step || 5;
    return Math.max(step, Math.round(p / step) * step);
}

/* 当前贝壳等级对应的卖价倍率（UI 显示「+30%」用） */
function shellMulOf(shellLv) {
    var list = (cfg.economy.sell.shellBonus || [1]);
    var lv = Math.max(0, Math.min(list.length - 1, shellLv || 0));
    return list[lv] || 1;
}

/* 新建一条鱼（带运行时字段） */
function create(speciesId, opts) {
    opts = opts || {};
    var sp = speciesById(speciesId || SPECIES[0].id);
    seq += 1;
    var growth = opts.growth == null ? 4 : opts.growth;
    var traits = opts.traits || (opts.rollTraits ? rollTraits(sp) : []);
    return {
        /* ---- 存档字段 ---- */
        id: opts.id || ('f' + Date.now().toString(36) + '_' + seq),
        speciesId: sp.id,
        growth: growth,
        hunger: opts.hunger == null ? 78 : opts.hunger,
        mood: opts.mood == null ? 82 : opts.mood,
        traits: traits,
        bornAt: opts.bornAt || 0,
        tank: opts.tank || 0,   /* 这条鱼养在第几个缸（M2） */

        /* ---- 运行时字段（不存盘） ---- */
        x: opts.x, y: opts.y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 18),
        vy: -8 + Math.random() * 16,
        tx: 0, ty: 0,
        headingT: 0,
        phase: Math.random() * 6.28,
        coinT: 2 + Math.random() * 3,
        belly: 0,
        feedCoin: 0,
        /* 捕食者的下次捕猎倒计时，普通鱼恒为 0 */
        huntT: sp.predator ? 3 + Math.random() * 3 : 0,
        /* 读档时成鱼直接标记，避免一进游戏满缸飘「成鱼啦」 */
        adultMark: growth >= 100
    };
}

module.exports = {
    all: SPECIES,
    RARITY_NAME: RARITY_NAME,
    speciesById: speciesById,
    speciesByPalette: speciesByPalette,
    rarityRank: rarityRank,
    randomSpecies: randomSpecies,
    rollSpecies: rollSpecies,
    unlockedRank: unlockedRank,
    expectedIncomeMul: expectedIncomeMul,
    stageOf: stageOf,
    stageName: stageName,
    sizeOf: sizeOf,
    stageMul: stageMul,
    sizeMul: sizeMul,
    conditionMul: conditionMul,
    incomePerSecond: incomePerSecond,
    matureValueOf: matureValueOf,
    sellPriceOf: sellPriceOf,
    shellMulOf: shellMulOf,
    passiveGrowthPerSecond: passiveGrowthPerSecond,
    feedGrowthPerPellet: feedGrowthPerPellet,
    isStarving: isStarving,
    traitOutputMul: traitOutputMul,
    rollTraits: rollTraits,
    create: create
};
