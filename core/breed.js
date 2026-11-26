/* ============================================================
 * core/breed.js · 繁育（M12 / M16）
 *
 * 一句话规则：**雌方定种，雄方供词条，每个槽独立继承。**
 *   · 子代鱼种 = 雌鱼鱼种，性别 50/50
 *   · 词条按槽继承：母 40% / 父 40% / 全新 20%
 *   · 继承后等级会动：+1（25%，同种 33%，「亲缘」再加）、−1（8%）
 *
 * 产物去哪儿（M16 改）：
 *   配一次种 → 蛋进**仓库鱼卵**（state.eggs），不带倒计时，想囤就囤
 *   在仓库点「孵化」 → 蛋进**培育栏位**（state.hatchery）开始倒数
 *   到点 → 鱼苗直接进**鱼篓**（state.caught）
 * 以前那颗「培育缸」是死胡同：鱼苗孵出来只能放缸或卖，
 * 现在干脆去掉，孵出来跟钓上来的鱼走同一条路。
 *
 * 为什么成本按「雌方稀有度」：SSR 雌 + R 雄能出 SSR 鱼苗，
 * 若只收 30 金币鱼饵就是千倍套利，所以 SSR 收 2.5 万。
 *
 * 纯逻辑：不碰 canvas、不碰 wx，时间一律从 platform.now() 拿。
 * ============================================================ */

var cfg = require('../config/index.js');
var platform = require('../platform.js');
var fishLib = require('./fish.js');
var wallet = require('./wallet.js');
var codex = require('./codex.js');

var B = cfg.breed;

function nowMs() {
    return platform.now();
}

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

/* ---------------- 容器 ---------------- */

/** 培育栏位总数（繁育页里能同时孵几颗） */
function hatchSlotsOf(state) {
    var list = B.hatchSlots || [6];
    var lv = clamp(Math.floor(state.hatchLv || 1), 1, list.length);
    return list[lv - 1];
}

function hatchRoom(state) {
    return Math.max(0, hatchSlotsOf(state) - ((state.hatchery && state.hatchery.length) || 0));
}

/** 仓库鱼卵上限：跟鱼篓一样「不小于当前数量」，老档不会被锁死 */
function eggCapOf(state) {
    var cap = B.eggCap || 24;
    var n = (state.eggs || []).length;
    return n > cap ? n : cap;
}

function eggRoom(state) {
    return Math.max(0, eggCapOf(state) - ((state.eggs || []).length));
}

function eggFull(state) {
    return eggRoom(state) <= 0;
}

/** 鱼篓还能装几条：孵出的鱼苗落这里，跟钓到的鱼同一个容器 */
function bagRoom(state) {
    var cap = (cfg.economy && cfg.economy.bagCap) || 20;
    var n = (state.caught || []).length;
    return Math.max(0, (n > cap ? n : cap) - n);
}

/** 主缸 + 仓库里能当亲本的鱼（成鱼、非捕食者） */
function findFish(state, id) {
    if (!id) return null;
    var i;
    var list = state.fish || [];
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    var bag = state.caught || [];
    for (i = 0; i < bag.length; i++) if (bag[i].id === id) return bag[i];
    return null;
}

function zoneOf(state, id) {
    var i;
    for (i = 0; i < (state.fish || []).length; i++) if (state.fish[i].id === id) return 'tank';
    for (i = 0; i < (state.caught || []).length; i++) if (state.caught[i].id === id) return 'bag';
    return '';
}

function breedableOf(f) {
    if (!f) return false;
    if (fishLib.speciesById(f.speciesId).predator) return false;
    return (f.growth || 0) >= (B.minGrowth || 100);
}

/** 疲劳剩余秒数（0 = 可繁育） */
function fatigueLeft(f, now) {
    var until = (f && f.breedAt) ? f.breedAt : 0;
    var t = now == null ? nowMs() : now;
    return Math.max(0, Math.ceil((until - t) / 1000));
}

function candidatesOf(state) {
    var out = [];
    var i;
    var tanks = state.fish || [];
    for (i = 0; i < tanks.length; i++) {
        var f = tanks[i];
        if (fishLib.speciesById(f.speciesId).predator) continue;
        if (!breedableOf(f)) continue;
        out.push({ fish: f, zone: 'tank', fatigue: fatigueLeft(f) });
    }
    var bag = state.caught || [];
    for (i = 0; i < bag.length; i++) {
        var b = bag[i];
        if (fishLib.speciesById(b.speciesId).predator) continue;
        if (!breedableOf(b)) continue;
        out.push({ fish: b, zone: 'bag', fatigue: fatigueLeft(b) });
    }
    return out;
}

/* ---------------- 鱼卵读写 ---------------- */

function findEggIndex(state, id) {
    var list = state.eggs || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
}

function findEgg(state, id) {
    var i = findEggIndex(state, id);
    return i < 0 ? null : state.eggs[i];
}

/** 仓库鱼卵列表：渲染和计数都用它，别在别处再抄一遍字段 */
function storedList(state) {
    var list = state.eggs || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        out.push({
            egg: e,
            species: fishLib.speciesById(e.speciesId),
            traits: e.traits || [],
            twin: !!e.twin,
            seconds: e.seconds || B.hatchSeconds || 180
        });
    }
    return out;
}

/* ---------------- 成本与时长 ---------------- */

function costOf(mother) {
    if (!mother) return { coin: 0, bait: 0, hunger: 0 };
    var sp = fishLib.speciesById(mother.speciesId);
    var coin = (B.costByRarity && B.costByRarity[sp.rarity]) || 0;
    return {
        coin: coin,
        bait: B.baitCost || 0,
        hunger: B.hungerCost || 0
    };
}

/** 孵化时长：受雌鱼「速繁」缩短，最低保留 hatchFloor。
 *  蛋里存下来，之后亲本卖掉也不影响这颗蛋的时长。 */
function hatchSecondsOf(mother) {
    var fast = fishLib.traitEffect(mother, 'hatch');
    var mul = Math.max(B.hatchFloor || 0.4, 1 - fast / 100);
    return Math.max(10, Math.round((B.hatchSeconds || 180) * mul));
}

/** 双生概率：母方「双生」词条 */
function twinChanceOf(mother) {
    return clamp(fishLib.traitEffect(mother, 'twin') / 100, 0, 1);
}

/* ---------------- 遗传 ---------------- */

/** 三选一：母方该槽 / 父方该槽 / 全新随机（权重按可用项归一化） */
function pickSource(mt, ft) {
    var I = B.inherit;
    var total = (mt ? I.mother : 0) + (ft ? I.father : 0) + I.fresh;
    var r = Math.random() * total;
    if (mt) {
        if (r < I.mother) return mt;
        r -= I.mother;
    }
    if (ft) {
        if (r < I.father) return ft;
    }
    return null;
}

function freshLv(maxLv) {
    var dist = cfg.traits.rollLv || [{ lv: 1, p: 1 }];
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < dist.length; i++) {
        acc += dist[i].p;
        if (r <= acc) return clamp(dist[i].lv, 1, maxLv);
    }
    return 1;
}

/**
 * 子代词条：按雌方的槽位数与等级上限算（母方定种，也定"容器大小"）。
 * 逐槽独立判定，同一条鱼不出现两个相同词条。
 */
function inheritTraits(mother, father, species) {
    var slots = fishLib.traitSlotsOf(species);
    var maxLv = fishLib.traitMaxLvOf(species);
    var I = B.inherit;
    var same = mother.speciesId === father.speciesId;
    var kin = (fishLib.traitEffect(mother, 'kin') + fishLib.traitEffect(father, 'kin')) / 100;
    var upP = (same ? I.upSame : I.up) + kin;

    var out = [];
    var used = {};

    for (var i = 0; i < slots; i++) {
        var mt = (mother.traits || [])[i];
        var ft = (father.traits || [])[i];
        var src = pickSource(mt, ft);
        var id;
        var lv;

        if (src) {
            id = src.id;
            lv = fishLib.traitLvOf(src);
            var r = Math.random();
            if (r < upP) lv += 1;
            else if (r > 1 - I.down) lv -= 1;
        } else {
            /* 全新随机：从还没用过的词条里挑一个，避免同鱼重复 */
            var pool = [];
            for (var k = 0; k < cfg.traits.list.length; k++) {
                if (!used[cfg.traits.list[k].id]) pool.push(cfg.traits.list[k]);
            }
            if (!pool.length) break;
            var def = pool[Math.floor(Math.random() * pool.length)];
            id = def.id;
            lv = freshLv(maxLv);
        }

        if (used[id]) continue;
        used[id] = 1;
        out.push({ id: id, lv: clamp(lv, 1, maxLv) });
    }
    return out;
}

/* ---------------- 校验 ---------------- */

function fail(reason, text) {
    return { ok: false, reason: reason, text: text };
}

function canBreed(state, motherId, fatherId) {
    if (!motherId || !fatherId) return fail('empty', '先选两条亲本');
    if (motherId === fatherId) return fail('same', '不能用同一条鱼');

    var m = findFish(state, motherId);
    var f = findFish(state, fatherId);
    if (!m || !f) return fail('missing', '亲本已经不在了');

    var mSp = fishLib.speciesById(m.speciesId);
    var fSp = fishLib.speciesById(f.speciesId);
    if (mSp.predator || fSp.predator) return fail('predator', '小鲨鱼不能参与繁育');
    if (m.sex !== 'f') return fail('sex', '左边要选雌鱼');
    if (f.sex !== 'm') return fail('sex', '右边要选雄鱼');

    if (!breedableOf(m) || !breedableOf(f)) {
        return fail('grow', '两条都要养到成鱼（成长 100）');
    }

    var now = nowMs();
    if (fatigueLeft(m, now) > 0) return fail('fatigue', '雌鱼还在疲劳，' + fatigueLeft(m, now) + ' 秒后可再繁育');
    if (fatigueLeft(f, now) > 0) return fail('fatigue', '雄鱼还在疲劳，' + fatigueLeft(f, now) + ' 秒后可再繁育');

    if (eggFull(state)) return fail('eggs', '鱼卵仓库满了（' + eggCapOf(state) + ' 颗），先去孵几颗');

    var cost = costOf(m);
    if (!wallet.canAfford(state, 'fish', cost.coin)) {
        return fail('poor', '鱼币不够，需要 ' + wallet.format(cost.coin));
    }
    var bag = state.bag || {};
    if ((bag.bait || 0) < cost.bait) {
        return fail('bait', '鱼饵不够，需要 ' + cost.bait + ' 个');
    }

    return {
        ok: true,
        mother: m,
        father: f,
        species: mSp,
        cost: cost,
        seconds: hatchSecondsOf(m),
        twinChance: twinChanceOf(m)
    };
}

/* ---------------- 执行：配种 ---------------- */

var seq = 0;

/** 配一次种：扣钱扣饵扣饱食，蛋直接进**仓库**，不进培育栏位 */
function breed(state, motherId, fatherId) {
    var chk = canBreed(state, motherId, fatherId);
    if (!chk.ok) return chk;

    var m = chk.mother;
    var f = chk.father;
    var now = nowMs();

    if (chk.cost.coin > 0) wallet.spend(state, 'fish', chk.cost.coin, 'breed');
    state.bag.bait = Math.max(0, (state.bag.bait || 0) - chk.cost.bait);
    m.hunger = Math.max(0, (m.hunger || 0) - chk.cost.hunger);

    /* 软冷却：两条亲本都疲劳，到点自动恢复 */
    var until = now + (B.fatigueSeconds || 300) * 1000;
    m.breedAt = until;
    f.breedAt = until;

    /* 先算遗传结果，蛋里存的是「已经定下来的子代」，
     * 这样孵化期间改概率/改配置也不会让玩家手里的蛋变结果。 */
    var traits = inheritTraits(m, f, chk.species);
    var twin = Math.random() < chk.twinChance;
    seq += 1;

    var egg = {
        id: 'g' + now.toString(36) + '_' + seq,
        speciesId: chk.species.id,
        sex: Math.random() < 0.5 ? 'm' : 'f',
        traits: traits,
        motherId: m.id,
        fatherId: f.id,
        twin: twin,
        /* 时长在产卵时定，孵化时直接用 —— 亲本卖掉也不影响 */
        seconds: chk.seconds,
        bornAt: now
    };
    state.eggs.push(egg);

    return {
        ok: true,
        egg: egg,
        cost: chk.cost,
        seconds: chk.seconds,
        twin: twin,
        traits: traits,
        stored: state.eggs.length
    };
}

/* ---------------- 执行：孵化 ---------------- */

/**
 * 把仓库里的蛋放进培育栏位开始倒数（单颗 / 批量共用）。
 * 栏位满了就只孵得下的那几颗，剩下的留在仓库，不报错也不吞蛋。
 */
function hatchEggs(state, ids) {
    if (!ids || !ids.length) return { ok: false, reason: 'empty', count: 0 };
    var room = hatchRoom(state);
    if (room <= 0) return { ok: false, reason: 'slots', count: 0, room: 0 };

    var now = nowMs();
    var moved = 0;
    var last = null;

    for (var i = 0; i < ids.length && moved < room; i++) {
        var idx = findEggIndex(state, ids[i]);
        if (idx < 0) continue;
        var egg = state.eggs.splice(idx, 1)[0];
        var seconds = Math.max(10, Math.round(egg.seconds || B.hatchSeconds || 180));

        egg.startAt = now;
        egg.hatchAt = now + seconds * 1000;
        egg.seconds = seconds;
        state.hatchery.push(egg);
        last = egg;
        moved += 1;
    }

    if (!moved) return { ok: false, reason: 'gone', count: 0, room: room };
    return {
        ok: true,
        count: moved,
        room: room - moved,
        blocked: Math.max(0, ids.length - moved),
        seconds: last.seconds,
        egg: last
    };
}

function hatchEgg(state, eggId) {
    return hatchEggs(state, [eggId]);
}

/* ---------------- 孵化进度 ---------------- */

function hatchList(state, now) {
    var t = now == null ? nowMs() : now;
    var out = [];
    var list = state.hatchery || [];
    for (var i = 0; i < list.length; i++) {
        var h = list[i];
        var left = Math.max(0, Math.ceil((h.hatchAt - t) / 1000));
        var span = Math.max(1, h.seconds);
        out.push({
            egg: h,
            left: left,
            ready: left <= 0,
            progress: clamp(1 - left / span, 0, 1),
            species: fishLib.speciesById(h.speciesId),
            traits: h.traits || [],
            twin: !!h.twin
        });
    }
    return out;
}

/**
 * 推进孵化：到点且鱼篓还有位置才落篓。
 * 鱼篓满了就先留在栏位里等（不丢、不重复计时），UI 会提示「鱼篓满了」。
 * 返回本帧新孵出的鱼，供飘字 / 提示使用。
 */
function tick(state, now) {
    var t = now == null ? nowMs() : now;
    var born = [];
    var list = state.hatchery || [];
    for (var i = list.length - 1; i >= 0; i--) {
        var h = list[i];
        if (t < h.hatchAt) continue;
        var need = h.twin ? 2 : 1;
        if (bagRoom(state) < need) continue;   /* 等玩家腾鱼篓 */

        for (var k = 0; k < need; k++) {
            var baby = fishLib.create(h.speciesId, {
                growth: B.babyGrowth || 5,
                traits: h.traits,
                sex: k === 0 ? h.sex : (Math.random() < 0.5 ? 'm' : 'f'),
                hunger: 86,
                mood: 90
            });
            baby.tank = 0;
            baby.x = 0;
            baby.y = 0;
            state.caught.push(baby);
            codex.mark(state, baby.speciesId);   /* 繁育产出的新鱼种也算收录 */
            born.push(baby);
        }
        list.splice(i, 1);
    }
    return born;
}

/* 繁育页头部要的全部读数 */
function statusOf(state) {
    var now = nowMs();
    return {
        hatchSlots: hatchSlotsOf(state),
        hatchUsed: (state.hatchery || []).length,
        hatchRoom: hatchRoom(state),
        eggCap: eggCapOf(state),
        eggCount: (state.eggs || []).length,
        stored: storedList(state),
        candidates: candidatesOf(state),
        eggs: hatchList(state, now),
        bait: (state.bag && state.bag.bait) || 0
    };
}

module.exports = {
    hatchSecondsOf: hatchSecondsOf,
    twinChanceOf: twinChanceOf,
    costOf: costOf,
    fatigueLeft: fatigueLeft,
    hatchSlotsOf: hatchSlotsOf,
    hatchRoom: hatchRoom,
    eggCapOf: eggCapOf,
    eggRoom: eggRoom,
    eggFull: eggFull,
    bagRoom: bagRoom,
    candidatesOf: candidatesOf,
    findFish: findFish,
    zoneOf: zoneOf,
    findEgg: findEgg,
    findEggIndex: findEggIndex,
    storedList: storedList,
    inheritTraits: inheritTraits,
    canBreed: canBreed,
    breed: breed,
    hatchEgg: hatchEgg,
    hatchEggs: hatchEggs,
    hatchList: hatchList,
    tick: tick,
    statusOf: statusOf
};
