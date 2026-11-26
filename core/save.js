/* ============================================================
 * core/save.js · 存档读写与版本迁移
 *
 * 存档结构带版本号，读档时先认版本再解析：
 *   v4  当前格式（M2：多鱼缸 tankCount / activeTank / 鱼的 tk）
 *   v3  M1 格式（加仓库等级）
 *   v2  M0 格式（无 storageLv，读进来补默认值即可）
 *   v1  旧版单文件原型（{gold, foodLv, auto, corals, fish:[{g,h,e,p}]}）
 * 以后加字段：saveVersion +1，在这里补一段迁移，老玩家档不丢。
 *
 * 存储键不跟版本走（KEY 里不带版本号），否则每升一版玩家档就丢一次。
 * ============================================================ */

var cfg = require('../config/index.js');
var platform = require('../platform.js');
var fishFactory = require('./fish.js');
var stateModule = require('./state.js');
var storage = require('./storage.js');
var codex = require('./codex.js');

var KEY = 'aquarium_save';
var LEGACY_V2_KEY = 'aquarium_save_v2';
var LEGACY_V1_KEYS = ['aquarium_game_v1'];

/* ---------------- 序列化 ---------------- */

/* 仓库里的鱼结构一致：不存坐标，放进缸时由 ensurePlacement 兜底 */
function packFish(f) {
    return {
        id: f.id,
        sp: f.speciesId,
        g: f.growth,
        h: f.hunger,
        m: f.mood,
        tr: f.traits || [],
        sx: f.sex,
        /* 进化阶（M14）：只有金鲤鱼会 >0，别的鱼写 0 也不占地 */
        ev: f.evo || 0,
        b: f.bornAt || 0
    };
}

/* 鱼卵：仓库里的（无计时）和培育栏位里的（有计时）共用一套字段 */
function packEgg(e) {
    var o = {
        id: e.id,
        sp: e.speciesId,
        sx: e.sex,
        tr: e.traits || [],
        mid: e.motherId || '',
        fid: e.fatherId || '',
        tw: e.twin ? 1 : 0,
        sec: e.seconds || 0,
        bt: e.bornAt || 0
    };
    /* 有 hatchAt 才写计时字段：仓库里的蛋不该凭空带一个倒计时 */
    if (e.hatchAt) {
        o.st = e.startAt || 0;
        o.ht = e.hatchAt;
    }
    return o;
}

function serialize(state) {
    return {
        v: cfg.saveVersion,
        savedAt: platform.now(),
        lastSeenAt: state.lastSeenAt,
        t: state.t,
        coins: {
            fish: state.coins.fish,
            s: state.coins.s
        },
        acc: state.acc.fish,
        foodLv: state.foodLv,
        shellLv: state.shellLv || 0,
        auto: !!state.auto,
        corals: state.corals,
        storageLv: state.storageLv,
        tankCount: state.tankCount,
        activeTank: state.activeTank,
        stats: state.stats,
        discovered: codex.table(state),

        /* M9 鱼塘 / 仓库 */
        pondLv: state.pondLv || 1,
        bag: {
            bait: (state.bag && state.bag.bait) || 0,
            oyster: (state.bag && state.bag.oyster) || 0,
            pearl: (state.bag && state.bag.pearl) || 0
        },
        /* 仓库里的鱼还没进缸，不存坐标，放进去时由 ensurePlacement 兜底 */
        caught: (state.caught || []).map(packFish),

        /* M12 繁育 / M16：eggs = 仓库鱼卵（等玩家孵），hatchery = 培育栏位（在倒数） */
        eggs: (state.eggs || []).map(packEgg),
        hatchery: (state.hatchery || []).map(packEgg),
        breedSeq: state.breedSeq || 0,

        fish: state.fish.map(function (f) {
            return {
                id: f.id,
                sp: f.speciesId,
                g: f.growth,
                h: f.hunger,
                m: f.mood,
                tr: f.traits || [],
                sx: f.sex,
                ev: f.evo || 0,
                b: f.bornAt || 0,
                /* 坐标也存下来，重开游戏时鱼不会全挤到中间重新随机 */
                x: Math.round(f.x || 0),
                y: Math.round(f.y || 0),
                tk: f.tank || 0
            };
        })
    };
}

function save(state) {
    var payload = serialize(state);
    platform.setStorage(KEY, payload);
    return payload;
}

/* ---------------- 反序列化 ---------------- */

function deserializeV2(raw) {
    var s = stateModule.create();
    s.coins.fish = Number(raw.coins && raw.coins.fish) || 0;
    s.coins.s = Number(raw.coins && raw.coins.s) || 0;
    s.acc.fish = Number(raw.acc) || 0;
    s.foodLv = Math.max(1, Math.min(5, raw.foodLv || 1));
    /* 招财贝壳：老档没有这个字段，读成 0 就等于没买过 */
    var maxShell = (cfg.economy.sell.shellBonus || [1]).length - 1;
    s.shellLv = Math.max(0, Math.min(maxShell, Math.floor(raw.shellLv || 0)));
    s.auto = !!raw.auto;
    s.corals = Math.max(0, raw.corals || 0);
    /* v2 没有这个字段，补默认值就等于完成迁移 */
    var maxLv = (cfg.economy.storage.slots || []).length || 1;
    s.storageLv = Math.max(1, Math.min(maxLv, Math.floor(raw.storageLv || 1)));
    s.t = raw.t || 0;
    s.lastSeenAt = raw.lastSeenAt || raw.savedAt || platform.now();
    if (raw.stats) {
        for (var k in raw.stats) {
            if (Object.prototype.hasOwnProperty.call(raw.stats, k)) s.stats[k] = raw.stats[k];
        }
    }
    /* v2/v3 没有多缸字段：补默认值就等于完成迁移（全部鱼回 1 号缸） */
    var maxTanks = (cfg.economy.tanks && cfg.economy.tanks.max) || 1;
    s.tankCount = Math.max(1, Math.min(maxTanks, Math.floor(raw.tankCount || 1)));
    s.activeTank = Math.max(0, Math.min(s.tankCount - 1, Math.floor(raw.activeTank || 0)));

    var list = raw.fish || [];
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        s.fish.push(fishFactory.create(it.sp, {
            id: it.id,
            tank: Math.max(0, Math.min(s.tankCount - 1, Math.floor(it.tk || 0))),
            growth: it.g,
            hunger: it.h,
            mood: it.m,
            traits: it.tr,
            sex: it.sx,
            evo: it.ev || 0,
            bornAt: it.b,
            /* 老档没有坐标时传 0，让 ensurePlacement 兜底重排 */
            x: it.x || 0,
            y: it.y || 0
        }));
    }
    /* 图鉴：新档读 discovered；老档没有则从现有鱼补录 */
    if (raw.discovered && typeof raw.discovered === 'object') {
        s.discovered = raw.discovered;
    }
    codex.syncFromFish(s);

    /* M9 鱼塘 / 仓库：老档没有这些字段，补默认值就等于迁移 */
    var pondMax = Math.max(1, cfg.pond.openMax || 1);
    s.pondLv = Math.max(1, Math.min(pondMax, Math.floor(raw.pondLv || 1)));
    var rawBag = raw.bag || {};
    s.bag = {
        bait: Math.max(0, Math.floor(rawBag.bait || 0)),
        oyster: Math.max(0, Math.floor(rawBag.oyster || 0)),
        pearl: Math.max(0, Math.floor(rawBag.pearl || 0))
    };
    var caughtList = raw.caught || [];
    for (var ci = 0; ci < caughtList.length; ci++) {
        var cf = caughtList[ci];
        s.caught.push(fishFactory.create(cf.sp, {
            id: cf.id,
            growth: cf.g,
            hunger: cf.h,
            mood: cf.m,
            traits: cf.tr,
            sex: cf.sx,
            evo: cf.ev || 0,
            bornAt: cf.b
        }));
    }

    /* M12 繁育 / M16 改造：老档没有这些字段，读成空数组就等于迁移。
     * 老档里的鱼没有 sx，create 会按 50/50 随机补 —— 不会让老玩家全变公鱼。 */
    function readEgg(e, timed) {
        if (!e || !e.id) return null;
        var egg = {
            id: e.id,
            speciesId: e.sp,
            sex: e.sx === 'm' || e.sx === 'f' ? e.sx : 'f',
            traits: fishFactory.normalizeTraits(e.tr),
            motherId: e.mid || '',
            fatherId: e.fid || '',
            twin: !!e.tw,
            seconds: Number(e.sec) || 0,
            bornAt: Number(e.bt) || 0
        };
        if (timed) {
            egg.startAt = Number(e.st) || 0;
            egg.hatchAt = Number(e.ht) || 0;
        }
        return egg;
    }

    var eggList = raw.eggs || [];
    for (var ei = 0; ei < eggList.length; ei++) {
        var se = readEgg(eggList[ei], true);
        if (!se) continue;
        /* 带 hatchAt 的按「正在孵」处理，其余是仓库里等孵的蛋 */
        if (se.hatchAt) s.hatchery.push(se);
        else s.eggs.push(se);
    }

    var hatchList = raw.hatchery || [];
    for (var hi = 0; hi < hatchList.length; hi++) {
        var he = readEgg(hatchList[hi], true);
        if (!he) continue;
        /* 老档没有时间字段时给一个完整时长，别读成"立刻孵好" */
        if (!he.hatchAt) {
            he.startAt = platform.now();
            he.hatchAt = he.startAt + (he.seconds || (cfg.breed && cfg.breed.hatchSeconds) || 180) * 1000;
        }
        s.hatchery.push(he);
    }

    /* v8 之前繁育出的鱼苗住在「培育缸」里，那个容器已经删了：
     * 全部并进鱼篓，老玩家不会白丢子代。 */
    var nurseryList = raw.nursery || [];
    for (var ni = 0; ni < nurseryList.length; ni++) {
        var nf = nurseryList[ni];
        if (!nf || !nf.sp) continue;
        s.caught.push(fishFactory.create(nf.sp, {
            id: nf.id,
            growth: nf.g,
            hunger: nf.h,
            mood: nf.m,
            traits: nf.tr,
            sex: nf.sx,
            evo: nf.ev || 0,
            bornAt: nf.b
        }));
    }

    s.breedSeq = Math.max(0, Math.floor(raw.breedSeq || 0));

    return s;
}

/* v1：旧原型存档，gold → 鱼币，pal → 物种 */
function migrateV1(raw) {
    var s = stateModule.create();
    s.coins.fish = Number(raw.gold) || 0;
    s.coins.s = 0;
    s.foodLv = Math.max(1, Math.min(5, raw.foodLv || 1));
    s.auto = !!raw.auto;
    s.corals = Math.max(0, raw.corals || 0);
    s.lastSeenAt = platform.now();

    var list = raw.fish || [];
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var sp = fishFactory.speciesByPalette(it.p == null ? 0 : it.p);
        s.fish.push(fishFactory.create(sp.id, {
            growth: it.g,
            hunger: it.h,
            mood: it.e,
            rollTraits: true
        }));
    }
    if (!s.fish.length) {
        s.fish.push(fishFactory.create(cfg.species[0].id, { growth: 6, rollTraits: true }));
    }
    codex.syncFromFish(s);
    return s;
}

/**
 * 读档。返回 { state, source } 或 null（无档）。
 * source: 'current'（当前版本，直接用）
 *       | 'migrated'（旧版本，已升级，调用方应立即回写）
 */
/**
 * 鱼位是 M1 才加的规则，老档里可能鱼比鱼位多。
 * 读档时自动把仓库补到装得下，避免出现「25/15 条」这种自相矛盾的界面。
 */
function fitTank(state) {
    var guard = 0;
    while (state.fish.length > storage.slotsOf(state) && state.storageLv < storage.maxLevel() && guard < 12) {
        state.storageLv += 1;
        guard += 1;
    }
    return state;
}

function loadRaw() {
    var raw = platform.getStorage(KEY);
    if (raw && raw.v >= 2 && raw.v <= cfg.saveVersion) {
        return {
            state: deserializeV2(raw),
            source: raw.v === cfg.saveVersion ? 'current' : 'migrated'
        };
    }
    if (raw && raw.v === 1) {
        return { state: migrateV1(raw), source: 'migrated' };
    }

    /* 旧键位：M0 时代存档在 aquarium_save_v2 里 */
    var old2 = platform.getStorage(LEGACY_V2_KEY);
    if (old2 && old2.v === 2) {
        return { state: deserializeV2(old2), source: 'migrated' };
    }

    for (var i = 0; i < LEGACY_V1_KEYS.length; i++) {
        var old = platform.getStorage(LEGACY_V1_KEYS[i]);
        if (old && (old.fish || old.gold != null)) {
            return { state: migrateV1(old), source: 'migrated' };
        }
    }
    return null;
}

function load() {
    var res = loadRaw();
    if (res) fitTank(res.state);
    return res;
}

function clear() {
    platform.removeStorage(KEY);
    platform.removeStorage(LEGACY_V2_KEY);
    for (var i = 0; i < LEGACY_V1_KEYS.length; i++) {
        platform.removeStorage(LEGACY_V1_KEYS[i]);
    }
}

module.exports = {
    KEY: KEY,
    save: save,
    load: load,
    clear: clear,
    serialize: serialize
};
