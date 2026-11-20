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

var KEY = 'aquarium_save';
var LEGACY_V2_KEY = 'aquarium_save_v2';
var LEGACY_V1_KEYS = ['aquarium_game_v1'];

/* ---------------- 序列化 ---------------- */

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
        auto: !!state.auto,
        corals: state.corals,
        storageLv: state.storageLv,
        tankCount: state.tankCount,
        activeTank: state.activeTank,
        stats: state.stats,
        fish: state.fish.map(function (f) {
            return {
                id: f.id,
                sp: f.speciesId,
                g: f.growth,
                h: f.hunger,
                m: f.mood,
                tr: f.traits || [],
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
            bornAt: it.b,
            /* 老档没有坐标时传 0，让 ensurePlacement 兜底重排 */
            x: it.x || 0,
            y: it.y || 0
        }));
    }
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
            mood: it.e
        }));
    }
    if (!s.fish.length) {
        s.fish.push(fishFactory.create(cfg.species[0].id, { growth: 6 }));
    }
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
