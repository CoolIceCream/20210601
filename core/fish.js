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

/* ---------------- 进化阶（M14 · 金鲤鱼化龙） ----------------
 * 只有带 evo 配置的鱼种（当前只有金鲤鱼）才有阶段。
 * evo 0 = 初始形态，每吞噬一条同族 +1，到 max 就是真龙。
 * 别的鱼 evo 恒为 0，下面这些函数对它们全是「不放大」。
 */
function evoCfgOf(sp) {
    return (sp && sp.evo) || null;
}

function maxEvoOf(sp) {
    var e = evoCfgOf(sp);
    return e ? (e.max || (e.stages ? e.stages.length - 1 : 0)) : 0;
}

function evoOf(f) {
    if (!f) return 0;
    var sp = speciesById(f.speciesId);
    var m = maxEvoOf(sp);
    var v = Math.floor(Number(f.evo) || 0);
    return v < 0 ? 0 : v > m ? m : v;
}

function evoStageOf(f) {
    var sp = speciesById(f.speciesId);
    var e = evoCfgOf(sp);
    if (!e || !e.stages) return null;
    return e.stages[evoOf(f)] || e.stages[0];
}

function evoStageName(f) {
    var st = evoStageOf(f);
    return st ? st.name : '';
}

function evoMulOf(f) {
    var st = evoStageOf(f);
    return st ? (st.mul || 1) : 1;
}

function evoSizeMulOf(f) {
    var st = evoStageOf(f);
    return st ? (st.sizeMul || 1) : 1;
}

/** 这条鱼是不是进化线（能吞噬同族的那种） */
function isEvolving(f) {
    if (!f) return false;
    return !!evoCfgOf(speciesById(f.speciesId));
}

/** 有没有某个词条（进化的钥匙是「龙鳞」） */
function hasTrait(f, id) {
    if (!f || !f.traits) return false;
    for (var i = 0; i < f.traits.length; i++) {
        if (f.traits[i] && f.traits[i].id === id) return true;
    }
    return false;
}

function sizeOf(f) {
    var sp = speciesById(f.speciesId);
    var base = cfg.economy.size.base + f.growth * cfg.economy.size.perGrowth * (sp.sizeScale || 1);
    /* 进化体（金鲤鱼 → 龙）体型按阶段放大，观感和 hit 面积一起变 */
    return base * evoSizeMulOf(f);
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

/* ---------------- 词条（M12 · 分级） ----------------
 * 数据结构：{ id, lv }，lv 1–5。
 * 老档只有 { id, value }（浮点倍率），normalizeTraits 会把它翻成 lv。
 * `value` 一律不再存盘 —— 效果由 lv 查表，改数值不用迁移存档。
 */

var TRAIT_MAP = {};
for (var ti = 0; ti < cfg.traits.list.length; ti++) {
    TRAIT_MAP[cfg.traits.list[ti].id] = cfg.traits.list[ti];
}

/* 老档里的词条 id：高产改成金鳞（保留"值钱"的语义），
 * 变异/双生/速繁都是当年不可掉落的占位，统一折成对应词条的 L1。 */
var LEGACY_TRAIT_ID = {
    output_up: 'gold_scale',
    mutation: 'breed_kin',
    twin: 'breed_twin',
    breed_fast: 'breed_fast'
};

function traitDef(id) {
    return TRAIT_MAP[id] || null;
}

/* 老「高产」的 value 是 1.5–5.0 倍率，三等分成 L1–L3（1.5–2.67 / 2.67–3.83 / 3.83–5.0） */
function legacyLv(value) {
    var v = Number(value) || 1.5;
    if (v >= 3.83) return 3;
    if (v >= 2.67) return 2;
    return 1;
}

/** 词条等级（容错：没有 lv 就用老 value 反推，未知词条给 1） */
function traitLvOf(t) {
    if (!t) return 1;
    var lv = Number(t.lv);
    if (lv > 0) return Math.max(1, Math.min(5, Math.round(lv)));
    if (t.value != null) return legacyLv(t.value);
    return 1;
}

/** 某稀有度能带几个词条槽 */
function traitSlotsOf(sp) {
    var slots = cfg.traits.slots || {};
    var n = slots[sp && sp.rarity];
    return n == null ? 1 : n;
}

/** 该稀有度的词条等级上限 */
function traitMaxLvOf(sp) {
    var m = cfg.traits.maxLv || {};
    var n = m[sp && sp.rarity];
    return n == null ? 3 : n;
}

/** Σ词条等级：卖价与"这条鱼养得怎么样"的唯一读数 */
function traitSumOf(f) {
    if (!cfg.traits.enabled || !f.traits || !f.traits.length) return 0;
    var sum = 0;
    for (var i = 0; i < f.traits.length; i++) sum += traitLvOf(f.traits[i]);
    return sum;
}

/** 卖价倍率 = 1 + sellPerLv × Σlv（不看词条种类） */
function traitSellMul(f) {
    var per = cfg.traits.sellPerLv;
    if (per == null) per = 0.06;
    return 1 + per * traitSumOf(f);
}

/**
 * 取某类词条的加成总和（单位：百分点）。
 * 同一条鱼不会有两个同 id 词条，所以这里直接相加就是全部。
 */
function traitEffect(f, type) {
    if (!cfg.traits.enabled || !f.traits || !f.traits.length) return 0;
    var sum = 0;
    for (var i = 0; i < f.traits.length; i++) {
        var def = traitDef(f.traits[i].id);
        if (!def || def.type !== type) continue;
        var lv = traitLvOf(f.traits[i]);
        var v = def.values[Math.max(0, Math.min(def.values.length - 1, lv - 1))];
        sum += (v || 0);
    }
    return sum;
}

/** 词条的展示文案：desc 里的 {v} 换成当前等级数值 */
function traitText(t) {
    var def = traitDef(t.id);
    if (!def) return '';
    var lv = traitLvOf(t);
    var v = def.values[Math.max(0, Math.min(def.values.length - 1, lv - 1))] || 0;
    return def.desc.replace('{v}', v);
}

/** 把任意来源的词条数组规范化成 [{id, lv}]，并截到该鱼种的槽位数 */
function normalizeTraits(list, sp) {
    var out = [];
    if (!list || !list.length) return out;
    var maxSlots = sp ? traitSlotsOf(sp) : 2;
    var maxLv = sp ? traitMaxLvOf(sp) : 5;
    var used = {};
    for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        var id = LEGACY_TRAIT_ID[it.id] || it.id;
        var def = traitDef(id);
        if (!def || used[id]) continue;
        used[id] = 1;
        out.push({ id: id, lv: Math.max(1, Math.min(maxLv, traitLvOf(it))) });
        if (out.length >= maxSlots) break;
    }
    return out;
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
        conditionMul(f) * evoMulOf(f);
}

/* 自然成长：每秒涨多少成长值（「快长」词条在这里生效） */
function passiveGrowthPerSecond(f) {
    var G = cfg.economy.growth;
    if (!G.passive) return 0;
    if (f.growth >= 100) return 0;
    if (f.hunger <= G.starveBelow) return 0;
    var sp = speciesById(f.speciesId);
    var growMul = 1 + traitEffect(f, 'grow') / 100;
    return (100 / Math.max(1, sp.matureSeconds || 120)) * growMul;
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
        /* 彩蛋 / 传奇专属鱼不参与常规权重池 */
        if (SPECIES[i].secret) continue;
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

/* ---------------- 词条生成 ---------------- */

/* 自然掉落最高 L4：L5 只能靠繁育，这是繁育的独占价值（见 config/traits.js） */
function rollTraitLv(maxLv) {
    var dist = cfg.traits.rollLv || [{ lv: 1, p: 1 }];
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < dist.length; i++) {
        acc += dist[i].p;
        if (r <= acc) return Math.max(1, Math.min(maxLv, dist[i].lv));
    }
    return Math.max(1, Math.min(maxLv, dist[dist.length - 1].lv));
}

/**
 * 给新鱼 roll 词条。
 * 槽位数与等级上限都由稀有度决定（R 1 槽 L3 / SR 2 槽 L4 / SSR 2 槽 L5），
 * 同一条鱼不会出现两个相同词条。
 * 捕食者（小鲨鱼）不参与词条系统：它是彩蛋，不能繁育也不能靠词条抬价。
 *
 * M14：带 only 的词条（龙鳞）只进对应鱼种的池子；
 * 金鲤鱼第一槽按 koiDragonRate 直接给龙鳞，否则和普通鱼一样随机抽。
 */
function traitPoolFor(sp) {
    var T = cfg.traits;
    var pool = [];
    for (var i = 0; i < T.list.length; i++) {
        var def = T.list[i];
        if (def.only && def.only.indexOf(sp.id) < 0) continue;
        pool.push(def);
    }
    return pool;
}

function rollTraits(sp) {
    var T = cfg.traits;
    if (!T.enabled) return [];
    if (!sp || sp.predator) return [];

    var slots = traitSlotsOf(sp);
    var maxLv = traitMaxLvOf(sp);
    if (slots <= 0) return [];

    var pool = traitPoolFor(sp);
    if (!pool.length) return [];

    var out = [];
    var i;

    /* 金鲤鱼：先按 koiDragonRate 决定「这条鱼带不带龙鳞」，
     * 带 → 第一槽给龙鳞；不带 → 把龙鳞从池子里摘掉，保证这概率是精确值。
     * （如果只是「保底一次 + 剩下随机」，实际概率会被第二槽再顶高一截。） */
    if (sp.id === 'gold_koi') {
        var withScale = Math.random() < (T.koiDragonRate || 0);
        var di = -1;
        for (i = 0; i < pool.length; i++) {
            if (pool[i].id === 'dragon_scale') { di = i; break; }
        }
        if (di >= 0) {
            if (withScale) out.push({ id: 'dragon_scale', lv: rollTraitLv(maxLv) });
            pool.splice(di, 1);
        }
    }

    while (out.length < slots && pool.length) {
        var k = Math.floor(Math.random() * pool.length);
        var def = pool.splice(k, 1)[0];
        out.push({ id: def.id, lv: rollTraitLv(maxLv) });
    }
    return out;
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
 * 词条加成只看 Σ等级（1 + 0.06 × Σlv），不看词条种类：
 * 玩家一眼能判断「这条值多少」，也不用记六套公式。
 * 故意不看饱食/心情：饿鱼只是长得慢，不该按「状态不好」再砍一刀。
 *
 * shellLv 可选（0-3，默认 0）：招财贝壳的卖价倍率。
 * 只在「卖鱼」这一端乘，matureValueOf / avgSellOf（卵价基准）不碰，
 * 否则卵价会跟着水涨船高，加成等于白给。
 */
function sellPriceOf(f, shellLv) {
    var S = cfg.economy.sell;
    var sp = speciesById(f.speciesId);
    var g = clamp01((f.growth || 0) / 100);
    var ratio = S.minRatio + (1 - S.minRatio) * Math.pow(g, S.curveExp);
    var traits = traitSellMul(f);
    var bonusList = S.shellBonus || [1];
    var lv = Math.max(0, Math.min(bonusList.length - 1, shellLv || 0));
    var shell = bonusList[lv] || 1;
    var p = matureValueOf(sp) * ratio * traits * shell * evoMulOf(f);
    var step = S.step || 5;
    return Math.max(step, Math.round(p / step) * step);
}

/* 当前贝壳等级对应的卖价倍率（UI 显示「+30%」用） */
function shellMulOf(shellLv) {
    var list = (cfg.economy.sell.shellBonus || [1]);
    var lv = Math.max(0, Math.min(list.length - 1, shellLv || 0));
    return list[lv] || 1;
}

/* ---------------- 卵价的词条期望（M12） ----------------
 * 「每条鱼都带词条」之后，卵价必须把词条的期望加成算进去，
 * 否则「买卵 → 养大 → 卖」会变成 105% 的无风险套利（实测）。
 * 期望 = 槽位数 × E[等级]，E[等级] 按 config/traits.js 的 rollLv 分布算。
 */
function expectedTraitSum(rarity) {
    var fake = { rarity: rarity };
    var slots = traitSlotsOf(fake);
    var maxLv = traitMaxLvOf(fake);
    var dist = cfg.traits.rollLv || [{ lv: 1, p: 1 }];
    var e = 0;
    for (var i = 0; i < dist.length; i++) {
        e += (dist[i].p || 0) * Math.min(maxLv, dist[i].lv);
    }
    return slots * e;
}

/** 该鱼种在「平均词条」下的卖价倍率；捕食者不带词条，恒为 1 */
function traitExpectMulOf(sp) {
    if (!cfg.traits.enabled) return 1;
    if (sp && sp.predator) return 1;
    var per = cfg.traits.sellPerLv;
    if (per == null) per = 0.06;
    return 1 + per * expectedTraitSum(sp && sp.rarity);
}

/** 卵价基准：成鱼价 × 平均词条期望 */
function eggValueOf(sp) {
    return matureValueOf(sp) * traitExpectMulOf(sp);
}

/* 新建一条鱼（带运行时字段） */
function create(speciesId, opts) {
    opts = opts || {};
    var sp = speciesById(speciesId || SPECIES[0].id);
    seq += 1;
    var growth = opts.growth == null ? 4 : opts.growth;

    /* 读档走 opts.traits（含老格式 {id,value}），新鱼走 rollTraits。
     * 两条路都过一遍 normalizeTraits：截到槽位数、补 lv、丢掉未知 id。 */
    var traits = normalizeTraits(opts.traits, sp);
    if (!traits.length && opts.rollTraits) traits = rollTraits(sp);

    /* 性别：50/50，只影响「能不能当雌方」，不影响任何属性 */
    var sex = opts.sex;
    if (sex !== 'm' && sex !== 'f') sex = Math.random() < 0.5 ? 'm' : 'f';

    return {
        /* ---- 存档字段 ---- */
        id: opts.id || ('f' + Date.now().toString(36) + '_' + seq),
        speciesId: sp.id,
        growth: growth,
        hunger: opts.hunger == null ? 78 : opts.hunger,
        mood: opts.mood == null ? 82 : opts.mood,
        traits: traits,
        sex: sex,
        /* 进化阶（M14）：只有金鲤鱼会 >0，别的鱼恒 0 */
        evo: Math.max(0, Math.min(maxEvoOf(sp), Math.floor(opts.evo || 0))),
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
    expectedTraitSum: expectedTraitSum,
    traitExpectMulOf: traitExpectMulOf,
    eggValueOf: eggValueOf,
    passiveGrowthPerSecond: passiveGrowthPerSecond,
    feedGrowthPerPellet: feedGrowthPerPellet,
    isStarving: isStarving,
    traitDef: traitDef,
    traitLvOf: traitLvOf,
    traitSlotsOf: traitSlotsOf,
    traitMaxLvOf: traitMaxLvOf,
    traitSumOf: traitSumOf,
    traitSellMul: traitSellMul,
    traitEffect: traitEffect,
    traitText: traitText,
    hasTrait: hasTrait,
    normalizeTraits: normalizeTraits,
    evoOf: evoOf,
    evoStageOf: evoStageOf,
    evoStageName: evoStageName,
    evoMulOf: evoMulOf,
    evoSizeMulOf: evoSizeMulOf,
    maxEvoOf: maxEvoOf,
    isEvolving: isEvolving,
    rollTraits: rollTraits,
    create: create
};
