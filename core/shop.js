/* ============================================================
 * core/shop.js · 商店（价格计算 / 可买性 / 购买执行）
 *
 * 两个货架：
 *   道具  config/items.js    —— 饲料、摆件、喂食器、仓库、鱼缸
 *   鱼卵  config/species.js  —— 按品质买，随机开出该品质的一条
 *
 * 鱼卵不再「指哪买哪」：只能选 R / SR / SSR，
 * 具体是哪条鱼靠抽。同一档里的卖价差好几倍，
 * 抽到贵的就赚得多 —— 这让「买卵」有赌的成分，
 * 但期望始终是正的（卵价 = 平均卖价 × 0.78）。
 *
 * M8 起多一款「传奇鱼卵」：固定 10 万金币，必出小鲨鱼，
 * 不受解锁条件影响；普通鱼卵里仍保留 0.1% 的彩蛋概率。
 *
 * 价格规则：
 *   道具  base × mul ^ 已购次数
 *   鱼卵  该品质平均成鱼卖价 × eggDiscount（不随购买次数上涨）
 * ============================================================ */

var cfg = require('../config/index.js');
var wallet = require('./wallet.js');
var fishLib = require('./fish.js');
var storage = require('./storage.js');

function itemById(id) {
    for (var i = 0; i < cfg.items.length; i++) {
        if (cfg.items[i].id === id) return cfg.items[i];
    }
    return null;
}

/* 当前等级（只有带 maxLevel 的条目才有意义） */
function levelOf(state, id) {
    if (id === 'feed') return state.foodLv;
    if (id === 'warehouse') return storage.levelOf(state);
    if (id === 'tank') return storage.tankCountOf(state);
    return 0;
}

/* 已购次数，用来算价格和判断满级 */
function purchaseCount(state, id) {
    if (id === 'feed') return Math.max(0, state.foodLv - 1);
    if (id === 'coral') return state.corals;
    if (id === 'auto') return state.auto ? 1 : 0;
    if (id === 'warehouse') return Math.max(0, storage.levelOf(state) - 1);
    if (id === 'tank') return Math.max(0, storage.tankCountOf(state) - 1);
    return 0;
}

function priceOf(state, item) {
    /* 鱼缸价格单独一张表：开第 N 个缸要多少钱，不看公式看配置 */
    if (item.id === 'tank') {
        var list = (cfg.economy.tanks && cfg.economy.tanks.price) || [];
        return list[storage.tankCountOf(state)] || 0;
    }
    var n = purchaseCount(state, item.id);
    var p = item.price.base * Math.pow(item.price.mul, n);
    var step = item.price.step || 1;
    return Math.round(p / step) * step;
}

/**
 * 新鱼放哪个缸：优先玩家正在看的那个，满了再顺延到还有空位的缸。
 * 全都满了返回 -1（调用方应该已经在 statusOf 里拦掉了）。
 */
function pickTankFor(state) {
    var act = storage.activeTankOf(state);
    if (storage.roomInTank(state, act) > 0) return act;
    return storage.firstRoomTank(state);
}

function statusOf(state, item) {
    var cur = levelOf(state, item.id);
    var maxed = item.maxLevel != null && cur >= item.maxLevel;
    var owned = item.id === 'auto' && state.auto;
    var price = priceOf(state, item);
    var affordable = wallet.canAfford(state, 'fish', price);

    var label;
    if (maxed) label = '已满级';
    else if (owned) label = '已拥有';
    /* 上万之后用「5万 / 200万」，7 位数塞不进 78px 的按钮 */
    else label = price >= 10000 ? wallet.format(price) : String(price);

    var desc = item.desc;
    if (item.id === 'feed' && maxed) desc = '已经是最高等级';
    if (item.id === 'auto' && owned) desc = '运行中：每 ' + cfg.economy.autoFeeder.interval + ' 秒撒一次食';
    if (item.id === 'tank') {
        var tanks = storage.tankCountOf(state);
        var maxTanks = storage.maxTanks();
        if (maxed) {
            desc = '已经有 ' + maxTanks + ' 个缸，鱼位 ' + storage.slotsOf(state) + ' 个';
        } else {
            desc = '鱼位 +' + storage.slotsPerTank(state) + '，可再养一缸';
        }
    }
    if (item.id === 'warehouse') {
        /* 不产币之后「容量」已经没有意义，仓库只剩两个作用：
         * 每个缸能养几条（鱼位）+ 离线能存多久（离线时长）。 */
        var slotList = cfg.economy.storage.slots || [];
        var hourList = cfg.economy.storage.offlineHours || [];
        if (maxed) {
            desc = '鱼位 ' + storage.slotsOf(state) + ' · 已满级';
        } else {
            var nextPer = slotList[Math.min(slotList.length - 1, cur)] || storage.slotsPerTank(state);
            var nextSlots = nextPer * storage.tankCountOf(state);
            var nextHour = hourList[Math.min(hourList.length - 1, cur)] || storage.offlineHoursOf(state);
            desc = '鱼位 +' + (nextSlots - storage.slotsOf(state)) + ' · 离线 ' + nextHour + ' 小时';
        }
    }

    var level = '';
    if (item.id === 'feed') level = maxed ? 'MAX' : 'Lv.' + state.foodLv;
    if (item.id === 'warehouse') {
        level = (maxed ? 'MAX' : 'Lv.' + storage.levelOf(state) + '/' + storage.maxLevel()) +
            ' · ' + storage.offlineHoursOf(state) + 'h';
    }
    if (item.id === 'coral' && state.corals) level = '×' + state.corals;
    if (item.id === 'auto' && state.auto) level = '已开启';
    if (item.id === 'tank') {
        level = '缸 ' + storage.tankCountOf(state) + '/' + storage.maxTanks();
    }

    return {
        item: item,
        price: price,
        maxed: !!maxed,
        owned: !!owned,
        full: false,
        affordable: affordable,
        disabled: !!(maxed || owned || !affordable),
        label: label,
        desc: desc,
        level: level
    };
}

function list(state) {
    var out = [];
    for (var i = 0; i < cfg.items.length; i++) out.push(statusOf(state, cfg.items[i]));
    return out;
}

/**
 * 购买道具。返回 { ok, reason, name }
 * reason: 'maxed' | 'owned' | 'poor' | 'full' | ''
 */
function buy(state, id) {
    var item = itemById(id);
    if (!item) return { ok: false, reason: 'unknown' };

    var st = statusOf(state, item);
    if (st.maxed) return { ok: false, reason: 'maxed', name: item.name };
    if (st.owned) return { ok: false, reason: 'owned', name: item.name };

    if (!wallet.spend(state, 'fish', st.price, 'buy:' + id)) {
        return { ok: false, reason: 'poor', name: item.name, price: st.price };
    }

    if (id === 'tank') {
        state.tankCount = Math.min(storage.maxTanks(), storage.tankCountOf(state) + 1);
        /* 开缸后把视图切过去：让玩家立刻看到空缸，而不是以为买了个寂寞 */
        state.activeTank = state.tankCount - 1;
    } else if (id === 'feed') {
        state.foodLv = Math.min(item.maxLevel, state.foodLv + 1);
    } else if (id === 'coral') {
        state.corals += 1;
    } else if (id === 'auto') {
        state.auto = true;
    } else if (id === 'warehouse') {
        state.storageLv = Math.min(item.maxLevel, storage.levelOf(state) + 1);
    }

    return { ok: true, reason: '', name: item.name, price: st.price };
}

/* ---------------- 鱼卵：按品质买，随机出该品质的一条 ---------------- */

var RARITY_LIST = ['R', 'SR', 'SSR', 'LEGEND'];
var LEGEND = 'LEGEND';

function legendCfg() {
    return cfg.economy.legendEgg || { id: LEGEND, name: '传奇鱼卵', price: 100000, speciesId: 'reef_shark' };
}

function isLegend(rarity) {
    return rarity === LEGEND;
}

/* 缸里养了几条某品种（图鉴/调试用） */
function ownedCount(state, speciesId) {
    var n = 0;
    for (var i = 0; i < state.fish.length; i++) {
        if (state.fish[i].speciesId === speciesId) n += 1;
    }
    return n;
}

function rankOfRarity(r) {
    if (isLegend(r)) return fishLib.RARITY_NAME.length;
    var i = fishLib.RARITY_NAME.indexOf(r);
    return i < 0 ? 0 : i;
}

/* 某品质的鱼池（保留抽取权重，档内也是加权随机）。
 * secret 的彩蛋鱼不在这里：它不走权重，由 eggRate 单独判定。 */
function rarityPool(rarity) {
    var list = [];
    var total = 0;
    for (var i = 0; i < cfg.species.length; i++) {
        var sp = cfg.species[i];
        if (sp.rarity !== rarity || sp.secret) continue;
        list.push(sp);
        total += sp.drawWeight || 1;
    }
    return { list: list, total: total };
}

/* 该品质里按独立概率出的彩蛋鱼（当前只有小鲨鱼） */
function secretPool(rarity) {
    var list = [];
    for (var i = 0; i < cfg.species.length; i++) {
        var sp = cfg.species[i];
        if (sp.rarity === rarity && sp.secret && sp.eggRate > 0) list.push(sp);
    }
    return list;
}

/* 该品质的平均成鱼卖价 —— 卵价的基准。
 * 彩蛋鱼虽然不在常规池里，期望价值仍要算进去，
 * 否则 1% 的高价鱼会变成白送的漏洞。 */
function avgSellOf(rarity) {
    if (isLegend(rarity)) {
        return fishLib.matureValueOf(fishLib.speciesById(legendCfg().speciesId));
    }
    var pool = rarityPool(rarity);
    if (!pool.total) return 0;
    var sum = 0;
    for (var i = 0; i < pool.list.length; i++) {
        sum += (pool.list[i].drawWeight || 1) * fishLib.matureValueOf(pool.list[i]);
    }
    var avg = sum / pool.total;

    var secrets = secretPool(rarity);
    var used = 0;
    for (var k = 0; k < secrets.length; k++) {
        var rate = Math.min(1 - used, secrets[k].eggRate);
        avg = avg * (1 - rate) + fishLib.matureValueOf(secrets[k]) * rate;
        used += rate;
    }
    return avg;
}

/**
 * 卵价 = 该品质平均卖价 × eggDiscount
 * 不随购买次数上涨：限制玩家的是鱼位，不是价格。
 * 价格通胀只会让低品质卵迅速失效，把玩家卡在「买不起下一档」的死角。
 */
function eggPriceOf(rarity) {
    if (isLegend(rarity)) return legendCfg().price;
    var S = cfg.economy.sell;
    var p = avgSellOf(rarity) * S.eggDiscount;
    var step = S.step || 5;
    return Math.max(step, Math.round(p / step) * step);
}

/* 该品质需要多少条鱼才解锁（传奇卵恒为 0） */
function eggUnlockAt(rarity) {
    if (isLegend(rarity)) return 0;
    var at = cfg.economy.gacha.unlockAt || [0];
    var i = rankOfRarity(rarity);
    return at[i] == null ? 0 : at[i];
}

function eggStatusOf(state, rarity) {
    if (isLegend(rarity)) {
        var L = legendCfg();
        var sp = fishLib.speciesById(L.speciesId);
        var val = fishLib.matureValueOf(sp);
        var price = eggPriceOf(rarity);
        var full = storage.roomOf(state) <= 0;
        var affordable = !full && wallet.canAfford(state, 'fish', price);
        return {
            rarity: rarity,
            price: price,
            avgSell: val,
            minSell: val,
            maxSell: val,
            rep: sp,
            count: 1,
            names: [sp.name],
            secretRate: 0,
            secretHint: '必出 ' + sp.name,
            locked: false,
            full: full,
            need: 0,
            affordable: affordable,
            disabled: full || !affordable,
            label: full ? '鱼位满' : price >= 10000 ? wallet.format(price) : String(price)
        };
    }

    var rank = rankOfRarity(rarity);
    var maxRank = fishLib.unlockedRank(state.fish.length);
    var locked = rank > maxRank;
    var price = eggPriceOf(rarity);
    var pool = rarityPool(rarity);
    var full = storage.roomOf(state) <= 0;
    var affordable = !locked && !full && wallet.canAfford(state, 'fish', price);
    var secrets = secretPool(rarity);
    var secretRate = 0;
    for (var k = 0; k < secrets.length; k++) secretRate += secrets[k].eggRate;

    /* 档内卖价区间：让玩家一眼看出「抽到好的能赚多少」 */
    var minSell = Infinity;
    var maxSell = 0;
    var rep = pool.list[0];
    for (var i = 0; i < pool.list.length; i++) {
        var v = fishLib.matureValueOf(pool.list[i]);
        if (v < minSell) minSell = v;
        if (v > maxSell) { maxSell = v; rep = pool.list[i]; }
    }

    return {
        rarity: rarity,
        price: price,
        avgSell: avgSellOf(rarity),
        minSell: minSell === Infinity ? 0 : minSell,
        maxSell: maxSell,
        rep: rep,
        count: pool.list.length,
        names: pool.list.map(function (s) { return s.name; }),
        /* 只告诉玩家有 0.1% 隐藏款，不剧透是哪条鱼。
         * 原来用 Math.round(rate*100)，0.1% 会被显示成 0%，所以改成保留一位小数。 */
        secretRate: secretRate,
        secretHint: secretRate > 0
            ? (+(secretRate * 100).toFixed(1)) + '% 隐藏款' : '',
        locked: locked,
        full: full,
        need: locked ? eggUnlockAt(rarity) : 0,
        affordable: affordable,
        disabled: locked || full || !affordable,
        label: locked ? '未解锁' : full ? '鱼位满' : price >= 10000 ? wallet.format(price) : String(price)
    };
}

/* 三档卵，固定的先后顺序 */
function eggList(state) {
    var out = [];
    for (var i = 0; i < RARITY_LIST.length; i++) out.push(eggStatusOf(state, RARITY_LIST[i]));
    return out;
}

/* 在该品质池里抽一条：先判彩蛋，再按权重抽常规鱼。
 * 彩蛋用独立概率，不受 drawWeight 总和变化影响 —— 想调 1% 就改 eggRate。 */
function rollInRarity(rarity) {
    if (isLegend(rarity)) return fishLib.speciesById(legendCfg().speciesId);
    var secrets = secretPool(rarity);
    for (var s = 0; s < secrets.length; s++) {
        if (Math.random() < secrets[s].eggRate) return secrets[s];
    }

    var pool = rarityPool(rarity);
    if (!pool.list.length) return fishLib.speciesById(cfg.species[0].id);
    var r = Math.random() * pool.total;
    var acc = 0;
    for (var i = 0; i < pool.list.length; i++) {
        acc += pool.list[i].drawWeight || 1;
        if (r <= acc) return pool.list[i];
    }
    return pool.list[pool.list.length - 1];
}

/**
 * 买一颗卵：付该品质的钱，随机得到该品质里的一条鱼。
 * 返回 { ok, reason, species, price, need, tank }
 * reason: 'locked' | 'full' | 'poor' | 'unknown' | ''
 */
function buyEgg(state, rarity) {
    if (RARITY_LIST.indexOf(rarity) < 0) return { ok: false, reason: 'unknown' };

    var st = eggStatusOf(state, rarity);
    if (st.locked) return { ok: false, reason: 'locked', rarity: rarity, need: st.need };
    if (st.full) return { ok: false, reason: 'full', rarity: rarity };

    /* 先确认放得下，再扣钱：否则会出现「扣了钱鱼没进来」 */
    var slot = pickTankFor(state);
    if (slot < 0) return { ok: false, reason: 'full', rarity: rarity };

    if (!wallet.spend(state, 'fish', st.price, 'egg:' + rarity)) {
        return { ok: false, reason: 'poor', rarity: rarity, price: st.price };
    }

    var sp = rollInRarity(rarity);
    state.fish.push(fishLib.create(sp.id, { growth: 2, rollTraits: true, tank: slot }));
    return { ok: true, reason: '', species: sp, rarity: rarity, price: st.price, tank: slot };
}

/* ---------------- 卖鱼 ---------------- */

/**
 * 卖掉一条鱼，换回它现在的身价。
 * 卖完鱼位立刻空出来，可以再去买卵 —— 这就是 M3 的主循环。
 */
function sellFish(state, fishId) {
    var idx = -1;
    for (var i = 0; i < state.fish.length; i++) {
        if (state.fish[i].id === fishId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: 'gone' };

    var f = state.fish[idx];
    var sp = fishLib.speciesById(f.speciesId);
    var price = fishLib.sellPriceOf(f);

    state.fish.splice(idx, 1);
    wallet.add(state, 'fish', price, 'sell:' + sp.id);
    return { ok: true, reason: '', price: price, species: sp, name: sp.name };
}

/* 缸里所有鱼的可卖价，供 UI 计算「全卖能得多少」 */
function sellableOf(state) {
    var out = [];
    for (var i = 0; i < state.fish.length; i++) {
        out.push({ fish: state.fish[i], price: fishLib.sellPriceOf(state.fish[i]) });
    }
    return out;
}

module.exports = {
    itemById: itemById,
    priceOf: priceOf,
    statusOf: statusOf,
    list: list,
    buy: buy,
    ownedCount: ownedCount,
    rarityPool: rarityPool,
    rollInRarity: rollInRarity,
    avgSellOf: avgSellOf,
    eggPriceOf: eggPriceOf,
    eggStatusOf: eggStatusOf,
    eggList: eggList,
    buyEgg: buyEgg,
    sellFish: sellFish,
    sellableOf: sellableOf
};
