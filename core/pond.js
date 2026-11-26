/* ============================================================
 * core/pond.js · 鱼塘 / 钓鱼 / 仓库（纯逻辑，不碰 canvas）
 *
 * 一条完整的钓鱼线：
 *   商店买鱼饵（10/个） → 鱼塘抛竿（扣 1 鱼饵）
 *     ├─ 85% 出鱼（按鱼塘等级抽鱼种，成长随机，偏小）
 *     └─ 15% 出珍珠贝（进仓库）
 *   仓库里：鱼可以「放进鱼缸」或「直接卖掉」；
 *           珍珠贝「打破」50% 得珍珠；珍珠卖 1 万。
 *
 * 为什么钓上来的鱼不直接进缸：
 *   鱼缸有鱼位上限，钓到大鱼时如果缸满了会很扫兴，
 *   所以先落在仓库，玩家自己决定是放缸养大还是当场变现。
 *
 * 数值全部来自 config/pond.js，这里不写死。
 * ============================================================ */

var cfg = require('../config/index.js');
var wallet = require('./wallet.js');
var fishLib = require('./fish.js');
var storage = require('./storage.js');
var codex = require('./codex.js');

function P() { return cfg.pond; }

/* ---------------- 计数读取 ---------------- */

function baitOf(state) { return Math.max(0, (state.bag && state.bag.bait) || 0); }
function oysterOf(state) { return Math.max(0, (state.bag && state.bag.oyster) || 0); }
function pearlOf(state) { return Math.max(0, (state.bag && state.bag.pearl) || 0); }
function caughtCount(state) { return (state.caught || []).length; }

/* ---------------- 鱼塘等级 ---------------- */

function levelCfg(lv) {
    var list = P().levels || [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].lv === lv) return list[i];
    }
    return list[0] || { lv: 1, name: '普通鱼塘', rarity: 'R' };
}

function curLevel(state) {
    return levelCfg(state.pondLv || 1);
}

/* 该鱼塘能钓到的鱼池：同稀有度、排除秘密鱼（小鲨鱼只能开卵/传奇卵拿） */
function poolOf(state) {
    var L = curLevel(state);
    var out = [];
    for (var i = 0; i < cfg.species.length; i++) {
        var sp = cfg.species[i];
        if (sp.secret) continue;
        if (sp.rarity !== L.rarity) continue;
        out.push(sp);
    }
    return out;
}

/* 按权重从鱼池抽一条（档内加权，和买卵同一套权重） */
function rollFish(state) {
    var pool = poolOf(state);
    if (!pool.length) return null;
    var total = 0;
    var i;
    for (i = 0; i < pool.length; i++) total += pool[i].drawWeight || 1;
    var r = Math.random() * total;
    var acc = 0;
    for (i = 0; i < pool.length; i++) {
        acc += pool[i].drawWeight || 1;
        if (r <= acc) return pool[i];
    }
    return pool[pool.length - 1];
}

/* 随机成长：exp > 1 时偏小，大鱼稀有 */
function rollGrowth() {
    var G = P().growth || { min: 8, max: 100, exp: 1 };
    var t = Math.pow(Math.random(), G.exp);
    return G.min + (G.max - G.min) * t;
}

/* ---------------- 鱼饵 ---------------- */

function baitPrice() { return (P().bait && P().bait.price) || 10; }

/* 买 n 个鱼饵：一次性扣钱、一次性入库 */
function buyBait(state, n) {
    n = Math.max(1, Math.floor(n || 1));
    var cost = baitPrice() * n;
    if (!wallet.canAfford(state, 'fish', cost)) {
        return { ok: false, reason: 'poor', cost: cost };
    }
    wallet.spend(state, 'fish', cost, 'bait:' + n);
    state.bag.bait = baitOf(state) + n;
    return { ok: true, n: n, cost: cost, total: baitOf(state) };
}

/* ---------------- 抛竿 ---------------- */

/**
 * 钓一次。返回：
 *   { ok:false, reason:'no_bait' }              没鱼饵
 *   { ok:false, reason:'no_pool' }              该塘没有可钓的鱼
 *   { ok:true, type:'oyster', total }           钓到珍珠贝
 *   { ok:true, type:'fish', species, fish, total } 钓到鱼
 */
/* 鱼篓上限：配置值，但永远不小于当前条数 ——
 * 老存档里可能已经装了 40 条，不能一读档就再也钓不了鱼 */
function bagCapOf(state) {
    var cap = (cfg.economy && cfg.economy.bagCap) || 20;
    var n = caughtCount(state);
    return n > cap ? n : cap;
}

function isBagFull(state) {
    return caughtCount(state) >= bagCapOf(state);
}

function cast(state) {
    if (baitOf(state) < ((P().bait && P().bait.perCatch) || 1)) {
        return { ok: false, reason: 'no_bait' };
    }
    if (isBagFull(state)) {
        return { ok: false, reason: 'bag_full' };
    }
    var sp = rollFish(state);
    if (!sp) return { ok: false, reason: 'no_pool' };

    state.bag.bait = baitOf(state) - ((P().bait && P().bait.perCatch) || 1);

    /* 先判珍珠贝，剩下的都是鱼 */
    if (Math.random() < (P().oysterRate || 0)) {
        state.bag.oyster = oysterOf(state) + 1;
        return { ok: true, type: 'oyster', total: oysterOf(state) };
    }

    var f = fishLib.create(sp.id, { growth: rollGrowth(), rollTraits: true });
    state.caught.push(f);
    codex.mark(state, sp.id);   /* 钓到就算图鉴收录过 */
    return { ok: true, type: 'fish', species: sp, fish: f, total: caughtCount(state) };
}

/* ---------------- 珍珠贝 / 珍珠 ---------------- */

/* 打破一个珍珠贝：50% 出珍珠，否则空手（壳碎掉） */
function breakOyster(state) {
    if (oysterOf(state) <= 0) return { ok: false, reason: 'none' };
    state.bag.oyster = oysterOf(state) - 1;
    if (Math.random() < (P().oysterBreakRate || 0.5)) {
        state.bag.pearl = pearlOf(state) + 1;
        return { ok: true, pearl: true, pearls: pearlOf(state) };
    }
    return { ok: true, pearl: false, pearls: pearlOf(state) };
}

/* 卖一颗珍珠：固定 1 万 */
function sellPearl(state) {
    if (pearlOf(state) <= 0) return { ok: false, reason: 'none' };
    var price = P().pearlPrice || 10000;
    state.bag.pearl = pearlOf(state) - 1;
    wallet.add(state, 'fish', price, 'sell:pearl');
    return { ok: true, price: price };
}

/* ---------------- 仓库里的鱼 ---------------- */

/* ---------------- 缸里的鱼捞出到仓库（M14） ----------------
 * 主界面点鱼弹出的信息卡上只有一个「捞出」按钮：
 * 把这条鱼从当前缸搬到仓库，鱼位立刻空出来。
 * 仓库里可以再放回别的缸、直接卖、或者拿去繁育。
 *
 * 为什么把「卖出」从主界面撤掉：
 *   原来点鱼头顶的价签就直接成交，误触一次鱼就没了；
 *   现在统一走「捞出 → 仓库 → 卖」，多一步但不会被点掉。
 */
function dumpToBag(state, fishId) {
    var act = state.activeTank || 0;
    var idx = -1;
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if (f.id === fishId && (f.tank || 0) === act) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: 'gone' };

    var fish = state.fish.splice(idx, 1)[0];
    var sp = fishLib.speciesById(fish.speciesId);

    /* 仓库里的鱼没有位置概念，清掉坐标，放回缸时由 ensurePlacement 重新摆 */
    fish.tank = 0;
    fish.x = 0;
    fish.y = 0;
    state.caught.push(fish);

    if (state.view && state.view.selFish === fishId) state.view.selFish = '';

    return {
        ok: true,
        fish: fish,
        species: sp,
        name: sp.name,
        total: state.caught.length
    };
}

/* 仓库鱼 → 鱼缸：找得到空位才搬，找不到返回 full */
function moveToTank(state, fishId) {
    var idx = -1;
    var i;
    for (i = 0; i < state.caught.length; i++) {
        if (state.caught[i].id === fishId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: 'gone' };

    var slot = storage.firstRoomTank(state);
    if (slot < 0) return { ok: false, reason: 'full' };

    var f = state.caught.splice(idx, 1)[0];
    f.tank = slot;
    /* 仓库里的鱼没有坐标，进缸后交给 ensurePlacement 摆位 */
    f.x = 0;
    f.y = 0;
    state.fish.push(f);
    return { ok: true, tank: slot };
}

/* 仓库鱼直接卖：和缸里卖鱼同价（含招财贝壳加成） */function sellCaught(state, fishId) {
    var idx = -1;
    for (var i = 0; i < state.caught.length; i++) {
        if (state.caught[i].id === fishId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: 'gone' };

    var f = state.caught.splice(idx, 1)[0];
    var price = fishLib.sellPriceOf(f, state.shellLv);
    wallet.add(state, 'fish', price, 'sell:' + f.speciesId);
    return { ok: true, price: price };
}

/* 仓库鱼列表（带卖价、名字、大小标签） */
function caughtList(state) {
    var out = [];
    var list = state.caught || [];
    for (var i = 0; i < list.length; i++) {
        var f = list[i];
        var sp = fishLib.speciesById(f.speciesId);
        out.push({
            fish: f,
            species: sp,
            price: fishLib.sellPriceOf(f, state.shellLv),
            stage: fishLib.stageName(fishLib.stageOf(f.growth)),
            growth: Math.round(f.growth)
        });
    }
    return out;
}

/* ---------------- 批量操作（仓库多选） ----------------
 * 单条和批量走同一套底层函数，避免「单选一个价、批量另一个价」。
 * 鱼位不够时能搬几条搬几条，剩下的仍留在仓库，不做半途回滚。 */

function moveManyToTank(state, ids) {
    var moved = 0;
    var full = 0;
    var gone = 0;
    for (var i = 0; i < ids.length; i++) {
        var r = moveToTank(state, ids[i]);
        if (r.ok) {
            moved += 1;
        } else if (r.reason === 'full') {
            /* 鱼位是按缸算的，一旦满了后面的也都放不下，直接停手 */
            full = ids.length - i;
            break;
        } else {
            gone += 1;
        }
    }
    return { ok: moved > 0, moved: moved, full: full, gone: gone };
}

function sellManyCaught(state, ids) {
    var count = 0;
    var total = 0;
    var gone = 0;
    for (var i = 0; i < ids.length; i++) {
        var r = sellCaught(state, ids[i]);
        if (r.ok) {
            count += 1;
            total += r.price;
        } else {
            gone += 1;
        }
    }
    return { ok: count > 0, count: count, total: total, gone: gone };
}

/* 鱼塘页要展示的全部状态 */
function statusOf(state) {
    var L = curLevel(state);
    var bait = baitOf(state);
    var pool = poolOf(state);
    return {
        lv: state.pondLv || 1,
        name: L.name,
        rarity: L.rarity,
        poolCount: pool.length,
        bait: bait,
        canCast: bait > 0 && pool.length > 0,
        oysterRate: P().oysterRate || 0,
        pearlPrice: P().pearlPrice || 10000,
        caught: caughtCount(state),
        oyster: oysterOf(state),
        pearl: pearlOf(state)
    };
}

module.exports = {
    baitOf: baitOf,
    bagCapOf: bagCapOf,
    isBagFull: isBagFull,
    oysterOf: oysterOf,
    pearlOf: pearlOf,
    caughtCount: caughtCount,
    levelCfg: levelCfg,
    curLevel: curLevel,
    poolOf: poolOf,
    baitPrice: baitPrice,
    buyBait: buyBait,
    cast: cast,
    breakOyster: breakOyster,
    sellPearl: sellPearl,
    dumpToBag: dumpToBag,
    moveToTank: moveToTank,
    sellCaught: sellCaught,
    moveManyToTank: moveManyToTank,
    sellManyCaught: sellManyCaught,
    caughtList: caughtList,
    statusOf: statusOf
};
