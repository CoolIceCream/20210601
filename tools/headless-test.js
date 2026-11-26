/* ============================================================
 * tools/headless-test.js · 无头逻辑测试
 *
 * 只 require core/*，完全加载不到 render/* 与 canvas。
 * 能跑通这组用例，就等于证明了：
 *   「关掉渲染，经济和成长依然正确推进」—— M0 分层验收点。
 *
 * 另外覆盖 M1 的数值曲线：产出公式、成长曲线、喂食衰减、
 * 抽卡档位、离线结算。
 *
 * 运行：node tools/headless-test.js
 * ============================================================ */

/* ---------------- wx 模拟（内存存储，不创建画布） ---------------- */

var store = {};
var canvasCreated = 0;

global.wx = {
    getWindowInfo: function () {
        return {
            windowWidth: 390,
            windowHeight: 844,
            pixelRatio: 2,
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 810, left: 0, right: 390 }
        };
    },
    createCanvas: function () {
        canvasCreated += 1;
        return { getContext: function () { return {}; } };
    },
    getStorageSync: function (k) {
        return store[k] === undefined ? '' : JSON.parse(JSON.stringify(store[k]));
    },
    setStorageSync: function (k, v) {
        store[k] = JSON.parse(JSON.stringify(v));
    },
    removeStorageSync: function (k) {
        delete store[k];
    },
    onShow: function () {},
    onHide: function () {},
    onTouchStart: function () {}
};

/* ---------------- 被测模块 ---------------- */

var cfg = require('../config/index.js');
var platform = require('../platform.js');
var stateModule = require('../core/state.js');
var fishLib = require('../core/fish.js');
var wallet = require('../core/wallet.js');
var storage = require('../core/storage.js');
var save = require('../core/save.js');
var offline = require('../core/offline.js');
var shop = require('../core/shop.js');
var sim = require('../core/sim.js');

var VP = { w: 390, h: 844, ground: 844 - Math.min(84, 844 * 0.15) };

/* ---------------- 断言工具 ---------------- */

var results = [];

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function near(actual, expect, tol, msg) {
    var d = Math.abs(actual - expect);
    if (d > tol) {
        throw new Error(msg + '（实际 ' + actual.toFixed(4) + '，期望 ' + expect.toFixed(4) + ' ±' + tol + '）');
    }
}

function test(name, fn) {
    try {
        var note = fn();
        results.push({ ok: true, name: name, note: note || '' });
    } catch (e) {
        results.push({ ok: false, name: name, note: e.message });
    }
}

function runSeconds(state, seconds, dtStep) {
    var step = dtStep || 0.05;
    var n = Math.round(seconds / step);
    for (var i = 0; i < n; i++) sim.step(state, step, VP);
}

/* 一条满状态的成鱼，用来测纯产出公式 */
function adultFish(speciesId) {
    var s = stateModule.bootstrapFresh();
    var f = s.fish[0];
    f.speciesId = speciesId || 'gold_fish';
    f.growth = 100;
    f.hunger = 100;
    f.mood = 100;
    return { state: s, fish: f };
}

/* ============================================================
 * 用例
 * ============================================================ */

test('开局：够买两颗 R 卵 / 1 条鱼 / 饲料 Lv.1', function () {
    var s = stateModule.bootstrapFresh();
    var start = cfg.economy.start.fishCoin;
    assert(wallet.display(s, 'fish') === start, '初始鱼币应为 ' + start);
    assert(s.fish.length === 1, '初始应 1 条鱼');
    assert(s.foodLv === 1, '饲料初始 Lv.1');
    var rPrice = shop.eggPriceOf('R');
    assert(start >= rPrice * 2, '开局至少买得起 2 颗 R 卵（' + start + ' vs ' + rPrice + '）');
    return start + ' 鱼币 · R 卵 ' + rPrice + ' · 1 条鱼';
});

test('产出公式：成鱼 = baseRate × 鱼种倍率 × 体型加成', function () {
    var a = adultFish('gold_fish');
    var sp = fishLib.speciesById('gold_fish');
    var expect = cfg.economy.production.baseRate * sp.incomeMul * fishLib.sizeMul(a.fish);
    near(fishLib.incomePerSecond(a.fish), expect, 1e-9, '成鱼产出应等于公式');
    return '小金鱼成鱼 ' + expect.toFixed(3) + ' /秒';
});

test('成长曲线：单调递增，0 → floor，100 → 100%', function () {
    var floor = cfg.economy.production.stageCurve.floor;
    near(fishLib.stageMul(0), floor, 1e-9, 'growth=0 应为 floor');
    near(fishLib.stageMul(100), 1, 1e-9, 'growth=100 应为 1');
    var prev = -1;
    for (var g = 0; g <= 100; g += 10) {
        var m = fishLib.stageMul(g);
        assert(m > prev, '曲线必须单调递增，growth=' + g);
        prev = m;
    }
    return 'floor ' + floor + ' · 中点 ' + fishLib.stageMul(50).toFixed(3);
});

test('逻辑推进 10 秒：鱼不再自动产币', function () {
    var a = adultFish('gold_fish');
    a.fish.growth = 40;                  /* 未成鱼，才看得出成长 */
    a.fish.hunger = 90;                  /* 饿了会停止成长 */
    var before = wallet.balance(a.state, 'fish');
    var g0 = a.fish.growth;

    runSeconds(a.state, 10);
    var got = wallet.balance(a.state, 'fish') - before;
    assert(got === 0, '不该自动涨金币，实际涨了 ' + got);
    assert(a.fish.growth > g0, '鱼应该继续长大');
    return '10 秒金币 +0 · 成长 ' + g0.toFixed(1) + ' → ' + a.fish.growth.toFixed(1);
});

test('状态衰减：饿到 0 仍保留 floor 产出，不归零', function () {
    var a = adultFish('gold_fish');
    var fullRate = fishLib.incomePerSecond(a.fish);
    a.fish.hunger = 0;
    var hungryRate = fishLib.incomePerSecond(a.fish);
    var floor = cfg.economy.production.condition.hungerFloor;
    near(hungryRate / fullRate, floor, 1e-9, '饥饿产出应为 floor 倍');
    assert(hungryRate > 0, '不应直接停产');
    return '满饱 ' + fullRate.toFixed(2) + ' → 饥饿 ' + hungryRate.toFixed(2) + '（' + Math.round(floor * 100) + '%）';
});

test('喂食衰减：越接近成鱼，单粒成长越少', function () {
    var s = stateModule.bootstrapFresh();
    var f = s.fish[0];
    f.speciesId = 'gold_fish';
    f.growth = 0;
    var g0 = fishLib.feedGrowthPerPellet(f, 1);
    f.growth = 50;
    var g50 = fishLib.feedGrowthPerPellet(f, 1);
    f.growth = 90;
    var g90 = fishLib.feedGrowthPerPellet(f, 1);
    assert(g0 > g50 && g50 > g90, '单粒成长应随成长值递减');
    return 'g0 ' + g0.toFixed(2) + ' → g50 ' + g50.toFixed(2) + ' → g90 ' + g90.toFixed(2);
});

test('喂食：饱了也吃，多出的营养折成鱼币', function () {
    var a = adultFish('gold_fish');
    sim.feedAt(a.state, a.fish.x, a.fish.y, 1, VP);
    runSeconds(a.state, 4);
    assert(a.state.acc.fish + wallet.balance(a.state, 'fish') >= cfg.economy.feeding.overflowCoin,
        '吃饱后应折出鱼币');
    assert(a.fish.growth === 100, '成鱼不应再涨成长');
    return '折币 ' + a.state.acc.fish.toFixed(2);
});

test('自然成长：不喂食也会随时间长大', function () {
    var s = stateModule.bootstrapFresh();
    var f = s.fish[0];
    f.traits = [];          /* 排除「快长」词条的干扰，这条只验基础成长曲线 */
    f.growth = 10;
    f.hunger = 100;
    f.mood = 100;
    var g0 = f.growth;
    runSeconds(s, 30);
    var expect = 30 * 100 / fishLib.speciesById(f.speciesId).matureSeconds;
    near(f.growth - g0, expect, expect * 0.06, '30 秒自然成长应接近理论值');
    return '30 秒 +' + (f.growth - g0).toFixed(1) + '（理论 ' + expect.toFixed(1) + '）';
});

test('钱包：不能透支', function () {
    var s = stateModule.bootstrapFresh();
    var before = wallet.balance(s, 'fish');
    var ok = wallet.spend(s, 'fish', 999999, 'test');
    assert(ok === false, '余额不足应返回 false');
    near(wallet.balance(s, 'fish'), before, 1e-9, '失败的扣款不应改变余额');
    return '拒绝透支';
});

test('大数缩写：万 / 亿 边界不进位成 10000万', function () {
    assert(wallet.format(9999) === '9999', '四位数应原样显示');
    assert(wallet.format(12345) === '1.2万', '万位应缩写');
    assert(wallet.format(99999999) === '1亿', '实际 ' + wallet.format(99999999));
    assert(wallet.format(123456789) === '1.23亿', '实际 ' + wallet.format(123456789));
    assert(wallet.format(100000000) === '1亿', '整亿');
    return '12345 → 1.2万 · 99999999 → 1亿';
});

test('卖鱼：鱼消失、金币入账、鱼位空出来', function () {
    var s = stateModule.bootstrapFresh();
    var f = s.fish[0];
    f.growth = 100;                       /* 先养到成鱼 */
    var price = fishLib.sellPriceOf(f);
    var before = wallet.display(s, 'fish');
    var roomBefore = storage.roomOf(s);

    var r = shop.sellFish(s, f.id);
    assert(r.ok, '应能卖掉');
    assert(r.price === price, '卖价应与 sellPriceOf 一致');
    assert(s.fish.length === 0, '卖完缸里应少一条');
    assert(wallet.display(s, 'fish') === before + price, '金币应增加 ' + price);
    assert(storage.roomOf(s) === roomBefore + 1, '鱼位应空出一个');

    var again = shop.sellFish(s, f.id);
    assert(!again.ok && again.reason === 'gone', '再卖同一条应报 gone');
    return '成鱼卖 ' + price + ' 币 · ' + before + ' → ' + wallet.display(s, 'fish');
});

test('卖价：与成鱼耗时成正比，鱼苗只值两成', function () {
    var S = cfg.economy.sell;
    var ratios = [];
    for (var i = 0; i < fishLib.all.length; i++) {
        var sp = fishLib.all[i];
        var adult = fishLib.sellPriceOf(fishLib.create(sp.id, { growth: 100 }));
        var baby = fishLib.sellPriceOf(fishLib.create(sp.id, { growth: 0 }));
        var mint = fishLib.matureValueOf(sp);
        near(adult, Math.round(mint / S.step) * S.step, 1, sp.id + ' 成鱼卖价应等于成熟价值');
        assert(baby / adult <= S.minRatio + 0.02, sp.id + ' 鱼苗不该超过最低折价');
        ratios.push(baby / adult);
    }
    return '鱼苗约 ' + Math.round(ratios[0] * 100) + '% · 成鱼 100%';
});

test('卖价：词条让鱼更值钱', function () {
    var a = fishLib.create('gold_fish', { growth: 100 });
    var b = fishLib.create('gold_fish', { growth: 100, traits: [{ id: 'highYield', value: 2 }] });
    var pa = fishLib.sellPriceOf(a);
    var pb = fishLib.sellPriceOf(b);
    near(pb / pa, 1 + cfg.economy.sell.traitBonus, 0.02, '一条词条应加成 ' + cfg.economy.sell.traitBonus);
    return pa + ' → ' + pb;
});

test('抽卡：品质池按缸内鱼数解锁', function () {
    assert(fishLib.unlockedRank(0) === 0, '0 条鱼只应解锁 R');
    assert(fishLib.unlockedRank(4) === 0, '4 条鱼仍只有 R');
    assert(fishLib.unlockedRank(5) === 1, '5 条鱼解锁 SR');
    assert(fishLib.unlockedRank(10) === 2, '10 条鱼解锁 SSR');

    for (var i = 0; i < 300; i++) {
        var sp = fishLib.rollSpecies(0);
        assert(sp.rarity === 'R', 'R 池不应抽出 ' + sp.rarity);
    }
    var sawSr = false;
    for (var k = 0; k < 300; k++) {
        if (fishLib.rollSpecies(5).rarity !== 'R') sawSr = true;
    }
    assert(sawSr, 'SR 池 300 次都没出 SR+，权重配置有问题');
    return 'R / SR / SSR 在 0 / 5 / 10 条解锁';
});

test('买卵：随机开出该品质的鱼，且带品质与名字', function () {
    var s = stateModule.bootstrapFresh();
    s.fish = [];                     /* 清空，回到「0 条鱼」 */
    var r = shop.buyEgg(s, 'R');
    assert(r.ok, '应能买到 R 卵');
    assert(r.species && r.species.name, '应返回物种信息');
    assert(r.species.rarity === 'R', '买 R 卵不该开出 ' + r.species.rarity);
    assert(s.fish.length === 1, '应入缸一条');
    assert(fishLib.all.length === 11, '应有 11 条鱼种（含彩蛋小鲨鱼与传奇金鲤鱼）');

    /* 每条鱼都要有专属外形参数，否则会退化成小金鱼，缸里看着像同一种 */
    var art = require('../render/fishart.js');
    for (var i = 0; i < fishLib.all.length; i++) {
        var sp = fishLib.all[i];
        assert(!!art.LOOK[sp.id], sp.id + ' 在 render/fishart.js 的 LOOK 表里没有外形');
    }
    return '本次抽到 ' + r.species.rarity + ' ' + r.species.name;
});

test('撒食量：鱼越多撒越多，但有上限', function () {
    var s = stateModule.bootstrapFresh();
    var base = cfg.economy.feeding.pelletsTap;
    assert(sim.pelletsFor(s, base) === base, '1 条鱼时应为基础值');
    for (var i = 0; i < 30; i++) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    var many = sim.pelletsFor(s, base);
    assert(many > base, '鱼多时应撒更多');
    assert(many <= cfg.economy.feeding.pelletsMax, '不应超过上限');
    return base + ' → ' + many + ' 粒（上限 ' + cfg.economy.feeding.pelletsMax + '）';
});

test('存档：v3 写入后读回一致', function () {
    var s = stateModule.bootstrapFresh();
    s.fish[0].growth = 66;
    s.foodLv = 3;
    s.corals = 2;
    s.storageLv = 4;
    wallet.add(s, 'fish', 500, 'test');
    save.save(s);

    var loaded = save.load();
    assert(loaded && loaded.source === 'current', '应读到当前版本存档');
    assert(loaded.state.fish.length === 1, '鱼数应一致');
    assert(Math.abs(loaded.state.fish[0].growth - 66) < 0.001, '成长值应一致');
    assert(loaded.state.foodLv === 3 && loaded.state.corals === 2, '设施等级应一致');
    assert(loaded.state.storageLv === 4, '仓库等级应一致');
    assert(wallet.display(loaded.state, 'fish') === wallet.display(s, 'fish'), '鱼币应一致');
    return 'v3 往返一致（含仓库 Lv.4）';
});

test('存档迁移：v2 旧键位能升级到 v3', function () {
    delete store[save.KEY];
    store['aquarium_save_v2'] = {
        v: 2,
        coins: { fish: 500, s: 0 },
        foodLv: 2,
        auto: false,
        corals: 1,
        fish: [{ id: 'a', sp: 'gold_fish', g: 40, h: 60, m: 70, tr: [], b: 0 }]
    };
    var loaded = save.load();
    assert(loaded && loaded.source === 'migrated', '应识别为需要迁移的旧档');
    assert(wallet.display(loaded.state, 'fish') === 500, '鱼币应保留');
    assert(loaded.state.storageLv === 1, 'v2 档应补默认仓库等级 1');
    assert(loaded.state.fish.length === 1, '鱼数应保留');
    return 'v2 → v3，仓库补默认 1 级';
});

test('存档迁移：v1 旧档能升级成 v3', function () {
    delete store[save.KEY];
    delete store['aquarium_save_v2'];
    store['aquarium_game_v1'] = {
        gold: 500,
        foodLv: 3,
        auto: true,
        corals: 2,
        fish: [{ g: 50, h: 60, e: 70, p: 2 }]
    };
    var loaded = save.load();
    assert(loaded && loaded.source === 'migrated', '应识别为 v1 存档');
    assert(wallet.display(loaded.state, 'fish') === 500, '金币应迁移为鱼币');
    assert(loaded.state.fish.length === 1, '鱼数应一致');
    assert(loaded.state.fish[0].speciesId === fishLib.speciesByPalette(2).id, 'pal=2 应映射到对应物种');
    assert(loaded.state.auto === true && loaded.state.corals === 2, '设施应迁移');
    return 'gold 500 → 鱼币 500，pal 2 → ' + loaded.state.fish[0].speciesId;
});

test('离线结算：2 小时后鱼长大了，但不给金币', function () {
    var a = adultFish('gold_fish');
    a.fish.growth = 10;
    a.state.storageLv = 4;               /* 4 小时离线上限，先排除截断 */
    a.state.lastSeenAt = platform.now() - 2 * 3600 * 1000;
    var coinsBefore = wallet.balance(a.state, 'fish');
    var r = offline.settle(a.state, platform.now());

    assert(r && r.grown >= 1, '2 小时应该有鱼长大');
    near(r.seconds, 7200, 2, '有效时长应为 7200 秒');
    assert(wallet.balance(a.state, 'fish') === coinsBefore, '离线不该直接给金币');
    assert(a.fish.growth > 10, '成长值应增加');

    var sp = fishLib.speciesById(a.fish.speciesId);
    var per = 100 / sp.matureSeconds;
    var expectG = Math.min(100, 10 + per * 7200 * cfg.economy.offline.growthEfficiency);
    near(a.fish.growth, expectG, 0.2, '成长量应按成熟耗时 × 效率');
    assert(r.after > r.before, '身价应随成长变高');
    return '2 小时成长 10 → ' + a.fish.growth.toFixed(1) + ' · 金币 +0';
});

test('离线封顶：12 小时按仓库等级对应的时长截断', function () {
    var a = adultFish('gold_fish');
    a.fish.growth = 0;
    a.state.storageLv = 1;
    a.state.lastSeenAt = platform.now() - 12 * 3600 * 1000;
    var r = offline.settle(a.state, platform.now());
    assert(r && r.capped === true, '应标记为已封顶');
    near(r.seconds, cfg.economy.storage.offlineHours[0] * 3600, 2, 'Lv1 应截到 4 小时');
    return '12h → 按 ' + cfg.economy.storage.offlineHours[0] + 'h 结算，capped=true';
});

test('离线门槛：不足 1 分钟不结算', function () {
    var s = stateModule.bootstrapFresh();
    s.lastSeenAt = platform.now() - 30 * 1000;
    var r = offline.settle(s, platform.now());
    assert(r === null, '30 秒应不结算');
    return '30 秒不弹窗';
});

test('离线：成鱼不会越长越怪，成长封顶 100', function () {
    var a = adultFish('gold_fish');
    a.state.lastSeenAt = platform.now() - 8 * 3600 * 1000;
    offline.settle(a.state, platform.now());
    assert(a.fish.growth === 100, '成鱼应停在 100，实际 ' + a.fish.growth);
    return '成鱼保持 100';
});

/* ---------------- M1：仓库 ---------------- */

test('仓库等级：提升鱼位与离线时长，不再管金币容量', function () {
    var s = stateModule.bootstrapFresh();
    var slots = cfg.economy.storage.slots || [];
    var hours = cfg.economy.storage.offlineHours || [];

    s.storageLv = 1;
    assert(storage.slotsPerTank(s) === slots[0], 'Lv1 鱼位应为 ' + slots[0]);
    assert(storage.offlineHoursOf(s) === hours[0], 'Lv1 离线时长应为 ' + hours[0] + 'h');

    s.storageLv = 3;
    assert(storage.slotsPerTank(s) === slots[2], 'Lv3 鱼位应提升到 ' + slots[2]);
    assert(storage.offlineHoursOf(s) === hours[2], 'Lv3 离线时长应为 ' + hours[2] + 'h');

    s.storageLv = 99;
    assert(storage.levelOf(s) === storage.maxLevel(), '脏存档应夹到最高级');
    return 'Lv1 ' + slots[0] + ' 位/' + hours[0] + 'h → Lv3 ' + slots[2] + ' 位/' + hours[2] + 'h';
});

test('仓库扩容描述：只说鱼位和离线时长', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 1e9;
    var st = shop.statusOf(s, shop.itemById('warehouse'));
    assert(st.desc.indexOf('鱼位') >= 0, '描述应提到鱼位，实际：' + st.desc);
    assert(st.desc.indexOf('离线') >= 0, '描述应提到离线时长，实际：' + st.desc);
    return st.desc;
});

/* ---------------- M3：按品质买卵 ---------------- */

test('鱼卵：四款卵（含传奇），前三档价 = 平均卖价 × 折扣', function () {
    var s = stateModule.bootstrapFresh();
    var E = cfg.economy.sell;
    var list = shop.eggList(s);
    assert(list.length === 4, '应有四款卵，实际 ' + list.length);
    assert(list[0].rarity === 'R' && list[1].rarity === 'SR' &&
        list[2].rarity === 'SSR' && list[3].rarity === 'LEGEND', '档位顺序不对');

    for (var i = 0; i < 3; i++) {
        var st = list[i];
        var expect = Math.round(st.avgSell * E.eggDiscount / E.step) * E.step;
        assert(st.price === expect, st.rarity + ' 卵价不符：' + st.price + ' vs ' + expect);
        assert(st.minSell < st.avgSell && st.avgSell < st.maxSell, st.rarity + ' 档内卖价区间不合理');
        assert(st.price < st.avgSell, st.rarity + ' 卵价必须低于平均卖价，否则养大反而亏');
        assert(st.count >= 1 && st.rep && st.rep.name, st.rarity + ' 应给出代表鱼');
    }
    assert(list[0].price < list[1].price && list[1].price < list[2].price, '档位越高越贵');
    assert(list[3].price === 100000, '传奇卵应固定 10 万金币');
    assert(!list[3].locked, '传奇卵不该有鱼数解锁门槛');
    return 'R ' + list[0].price + ' / SR ' + list[1].price + ' / SSR ' +
        list[2].price + ' / 传奇 ' + list[3].price;
});

test('鱼卵：品质未解锁时拒绝购买', function () {
    var s = stateModule.bootstrapFresh();
    var r = shop.buyEgg(s, 'SSR');
    assert(!r.ok && r.reason === 'locked', 'SSR 应锁定');
    assert(r.need === cfg.economy.gacha.unlockAt[2], '解锁条件应取 gacha.unlockAt');

    /* 凑够 10 条后解锁 */
    for (var i = 0; i < 9; i++) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    var eggs = shop.eggList(s);
    assert(!eggs[2].locked, '10 条鱼后 SSR 应解锁');

    /* 老存档里的 silver_dragon 要能解析到改名后的金龙鱼 */
    assert(fishLib.speciesById('silver_dragon').id === 'gold_dragon', '旧鱼种 id 别名失效');
    return '锁定到 ' + r.need + ' 条鱼，之后可买';
});

test('鱼卵：买到的鱼必属于该品质、入缸并有坐标兜底', function () {
    var s = stateModule.bootstrapFresh();
    s.storageLv = 6;
    wallet.add(s, 'fish', 200000, 'test');
    /* SR 要 5 条鱼才解锁 */
    for (var i = 0; i < 4; i++) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    var r = shop.buyEgg(s, 'SR');
    assert(r.ok, '应买到 SR 卵');
    assert(r.species.rarity === 'SR', 'SR 卵开出了 ' + r.species.rarity);
    sim.step(s, 0.05, VP);
    var last = s.fish[s.fish.length - 1];
    assert(isFinite(last.x) && isFinite(last.y), '新鱼坐标应被兜底');
    return '开出 ' + r.species.rarity + ' ' + r.species.name + ' · 坐标 ' +
        Math.round(last.x) + ',' + Math.round(last.y);
});

/* ---------------- M1：鱼位上限 ---------------- */

test('鱼位：由仓库等级决定，满缸时买卵拒绝', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 1000000;

    var slots = storage.slotsOf(s);
    assert(slots === cfg.economy.storage.slots[0], 'Lv1 鱼位应取配置首档');

    while (s.fish.length < slots) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    assert(storage.roomOf(s) === 0, '填满后余位应为 0');

    var e = shop.buyEgg(s, 'R');
    assert(!e.ok && e.reason === 'full', '满缸时鱼卵应被拒绝（实际 ' + e.reason + '）');

    /* 升一级仓库，鱼位跟着涨，立刻能再买 */
    s.storageLv = 2;
    assert(storage.slotsOf(s) > slots, '升仓库后鱼位应变多');
    assert(storage.roomOf(s) > 0, '升仓库后应有余位');
    var r2 = shop.buyEgg(s, 'R');
    assert(r2.ok, '有余位时应能买');
    return 'Lv1 ' + slots + ' 位 → Lv2 ' + storage.slotsOf(s) + ' 位';
});

test('老档兼容：鱼比鱼位多时，读档自动补仓库等级', function () {
    var s = stateModule.bootstrapFresh();
    s.storageLv = 1;
    for (var i = 0; i < 24; i++) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    save.save(s);

    var loaded = save.load();
    assert(loaded.state.fish.length === 25, '鱼应该原样读回');
    assert(storage.slotsOf(loaded.state) >= 25, '读档后鱼位应装得下（实际 ' + storage.slotsOf(loaded.state) + '）');
    save.clear();
    return '25 条鱼 → 仓库自动升到 Lv' + loaded.state.storageLv + '（' + storage.slotsOf(loaded.state) + ' 位）';
});

test('经济闭环：养大就卖、有钱就买，30 分钟不失控', function () {
    var s = stateModule.bootstrapFresh();
    sim.ensurePlacement(s, VP);

    function avgHunger() {
        var t = 0;
        for (var i = 0; i < s.fish.length; i++) t += s.fish[i].hunger;
        return s.fish.length ? t / s.fish.length : 100;
    }

    for (var i = 0; i < 1800; i++) {
        sim.step(s, 1, VP);
        if (i % 2) continue;

        /* 成鱼就卖：这是新循环里玩家唯一的收入动作 */
        for (var k = s.fish.length - 1; k >= 0; k--) {
            if (s.fish[k].growth >= 100) shop.sellFish(s, s.fish[k].id);
        }
        if (avgHunger() < 70) { sim.feedCenter(s, VP); continue; }

        /* 有钱先补设施，再从高到低买得起哪档买哪档 */
        if (!s.auto && shop.statusOf(s, shop.itemById('auto')).affordable) { shop.buy(s, 'auto'); continue; }
        if (s.foodLv < 3 && shop.statusOf(s, shop.itemById('feed')).affordable) { shop.buy(s, 'feed'); continue; }
        if (shop.statusOf(s, shop.itemById('warehouse')).affordable &&
            storage.roomOf(s) === 0) { shop.buy(s, 'warehouse'); continue; }

        var eggs = shop.eggList(s);
        for (var q = eggs.length - 1; q >= 0; q--) {
            var e = eggs[q];
            if (e.locked || e.full || !e.affordable) continue;
            if (shop.buyEgg(s, e.rarity).ok) break;
        }
    }

    var value = 0;
    for (var v = 0; v < s.fish.length; v++) value += fishLib.sellPriceOf(s.fish[v]);

    assert(s.fish.length <= storage.slotsOf(s), '鱼数不应超过鱼位');
    assert(wallet.display(s, 'fish') >= 0, '余额不能为负');
    assert(wallet.display(s, 'fish') < 5000000, '30 分钟余额不该上百万级（实际 ' + wallet.display(s, 'fish') + '）');
    return s.fish.length + '/' + storage.slotsOf(s) + ' 条 · 余额 ' +
        wallet.format(wallet.display(s, 'fish')) + ' · 全卖 ' + wallet.format(value);
});

/* ---------------- M1：词条 ---------------- */

test('词条：卖价按 Σ等级 提升（1 + 0.06 × Σlv）', function () {
    var per = cfg.traits.sellPerLv;
    var a = fishLib.create('gold_fish', { growth: 100, traits: [] });
    var b = fishLib.create('gold_fish', { growth: 100, traits: [{ id: 'gold_scale', lv: 3 }] });
    near(fishLib.sellPriceOf(b) / fishLib.sellPriceOf(a), 1 + per * 3, 0.02, 'L3 应加成 18%');

    /* 两条词条按总和算，不看种类：SSR 2 槽 × L2 = Σ4 */
    var base = fishLib.sellPriceOf(fishLib.create('dusk_betta', { growth: 100, traits: [] }));
    var two = fishLib.sellPriceOf(fishLib.create('dusk_betta', {
        growth: 100,
        traits: [{ id: 'gold_scale', lv: 2 }, { id: 'fast_grow', lv: 2 }]
    }));
    near(two / base, 1 + per * 4, 0.02, 'Σlv=4 应加成 24%');

    /* 老档 {id,value} 也要能读：3.2 倍率折算成 L2（1.5–2.67 / 2.67–3.83 / 3.83–5） */
    var old = fishLib.create('gold_fish', { growth: 100, traits: [{ id: 'output_up', value: 3.2 }] });
    assert(old.traits[0].id === 'gold_scale', '老「高产」应迁移成金鳞');
    assert(old.traits[0].lv === 2, '倍率 3.2 应折算成 L2，实际 ' + old.traits[0].lv);
    return 'L3 +18% · Σ4 +24% · 老档折 L2';
});

test('词条：每条鱼都有槽位，上限随稀有度，L5 只能靠繁育', function () {
    assert(cfg.traits.enabled, '词条系统应已开启');
    var n = 600;
    var rSp = fishLib.speciesById('gold_fish');
    var sSp = fishLib.speciesById('dusk_betta');
    var rMax = 0;
    var sMax = 0;
    for (var i = 0; i < n; i++) {
        var rt = fishLib.rollTraits(rSp);
        assert(rt.length === 1, 'R 应正好 1 个槽，实际 ' + rt.length);
        rMax = Math.max(rMax, rt[0].lv);

        var st = fishLib.rollTraits(sSp);
        assert(st.length === 2, 'SSR 应正好 2 个槽，实际 ' + st.length);
        assert(st[0].id !== st[1].id, '同一条鱼不该有两个相同词条');
        sMax = Math.max(sMax, st[0].lv, st[1].lv);
    }
    assert(rMax <= 3, 'R 等级不应超过 L3，实际 L' + rMax);
    assert(sMax <= 4, '自然掉落不该出现 L5，实际 L' + sMax);

    /* 捕食者是彩蛋：不参与词条，也不能繁育 */
    assert(fishLib.rollTraits(fishLib.speciesById('reef_shark')).length === 0, '鲨鱼不该有词条');
    return 'R 1槽上限 L' + rMax + ' · SSR 2槽上限 L' + sMax;
});

test('长时间步进：3600 帧不崩，坐标不出现 NaN', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 200000;
    for (var i = 0; i < 3600; i++) {
        if (i % 90 === 0) sim.feedAt(s, 200, 200, 6, VP);
        if (i % 400 === 0 && i > 0) shop.buyEgg(s, 'R');
        sim.step(s, 0.0166, VP);
    }
    for (var k = 0; k < s.fish.length; k++) {
        assert(isFinite(s.fish[k].x) && isFinite(s.fish[k].y),
            '第 ' + k + ' 条鱼坐标异常：' + s.fish[k].x + ',' + s.fish[k].y);
    }
    assert(s.fish.length > 1, '应该买到了新鱼');
    assert(s.view.bubbles.length < 400, '气泡不应无限增长，实际 ' + s.view.bubbles.length);
    assert(isFinite(wallet.balance(s, 'fish')), '余额应为有限数');
    return '60 秒 / 3600 帧 / ' + s.fish.length + ' 条鱼，气泡 ' + s.view.bubbles.length + ' 个';
});

test('分层验收：core 未触碰画布', function () {
    assert(canvasCreated === 0, 'core 层不应创建画布，实际调用 ' + canvasCreated + ' 次');
    return 'createCanvas 调用 0 次';
});

/* ---------------- M2：多鱼缸 ---------------- */

test('多缸：鱼位 = 单缸鱼位 × 缸数', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;

    var per = storage.slotsPerTank(s);
    assert(storage.slotsOf(s) === per, '1 个缸时总鱼位应等于单缸鱼位');

    shop.buy(s, 'tank');
    assert(storage.tankCountOf(s) === 2, '应拥有 2 个缸');
    assert(storage.slotsOf(s) === per * 2, '2 个缸的总鱼位应翻倍');
    assert(storage.slotsOf(s) === storage.slotsPerTank(s) * 2, '总鱼位公式不符');

    shop.buy(s, 'tank');
    assert(storage.slotsOf(s) === per * 3, '3 个缸的总鱼位应是 3 倍');

    /* 到顶了不能再买 */
    var r = shop.buy(s, 'tank');
    assert(!r.ok && r.reason === 'maxed', '超过上限应拒绝，实际 ' + JSON.stringify(r));
    return per + ' 位/缸 → ' + storage.slotsOf(s) + ' 位（3 缸）';
});

test('多缸：买缸价格按配置递增', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;
    var list = cfg.economy.tanks.price;

    var p2 = shop.statusOf(s, shop.itemById('tank')).price;
    assert(p2 === list[1], '第 2 缸价格应取配置第 2 项，实际 ' + p2);

    shop.buy(s, 'tank');
    var p3 = shop.statusOf(s, shop.itemById('tank')).price;
    assert(p3 === list[2], '第 3 缸价格应取配置第 3 项，实际 ' + p3);
    assert(p3 > p2, '第 3 缸应比第 2 缸贵');
    return p2 + ' → ' + p3;
});

test('多缸：鱼位按缸相加，新卵优先落当前缸', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;
    sim.ensurePlacement(s, VP);

    shop.buy(s, 'tank');
    shop.buy(s, 'tank');
    assert(storage.slotsOf(s) === storage.slotsPerTank(s) * 3, '三个缸的鱼位应相加');

    /* 每个缸各买 2 颗卵 */
    for (var t = 0; t < 3; t++) {
        s.activeTank = t;
        shop.buyEgg(s, 'R');
        shop.buyEgg(s, 'R');
    }

    var cnt = [0, 0, 0];
    for (var i = 0; i < s.fish.length; i++) cnt[s.fish[i].tank] += 1;
    assert(cnt[0] > 0 && cnt[1] > 0 && cnt[2] > 0, '三个缸都应该有鱼，实际 ' + cnt.join('/'));

    /* 新卵落在当前缸 */
    s.activeTank = 1;
    var before = storage.fishCountInTank(s, 1);
    shop.buyEgg(s, 'R');
    assert(storage.fishCountInTank(s, 1) === before + 1, '新鱼应落在当前查看的缸');
    return cnt.join(' / ') + ' 条 · 总鱼位 ' + storage.slotsOf(s);
});

test('多缸：非当前缸委托管理，鱼不会饿死', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;
    sim.ensurePlacement(s, VP);

    shop.buy(s, 'tank');
    s.activeTank = 1;
    shop.buyEgg(s, 'R');
    shop.buyEgg(s, 'R');

    /* 只盯着 0 号缸跑 5 分钟，完全不喂 */
    s.activeTank = 0;
    for (var i = 0; i < 300; i++) sim.step(s, 1, VP);

    var idle = [];
    for (var k = 0; k < s.fish.length; k++) {
        if (s.fish[k].tank === 1) idle.push(s.fish[k].hunger);
    }
    assert(idle.length > 0, '2 号缸应该有鱼');
    for (var j = 0; j < idle.length; j++) {
        assert(idle[j] >= 70, '托管缸的鱼不应挨饿，实际饥饿 ' + idle[j].toFixed(1));
    }
    return '5 分钟后托管缸饥饿 ' + idle.map(function (h) { return h.toFixed(0); }).join(' / ');
});

test('多缸：切缸会清掉旧缸的食物，不会跟着漂过去', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;
    sim.ensurePlacement(s, VP);
    shop.buy(s, 'tank');

    s.activeTank = 0;
    sim.feedCenter(s, VP);
    assert(s.foods.length > 0, '应该撒出了饲料');

    sim.setActiveTank(s, 1, VP);
    assert(s.foods.length === 0, '切缸后旧缸的饲料不应留在新缸');
    assert(storage.activeTankOf(s) === 1, 'activeTank 应切到 1');
    return '饲料 ' + s.foods.length + ' 粒 · 缸 2';
});

test('多缸：存档往返保留缸数与每条鱼的归属', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 50000000;
    sim.ensurePlacement(s, VP);
    shop.buy(s, 'tank');
    shop.buy(s, 'tank');
    s.activeTank = 2;
    for (var t = 0; t < 3; t++) { s.activeTank = t; shop.buy(s, 'fish'); }

    var before = {};
    for (var i = 0; i < s.fish.length; i++) {
        before[s.fish[i].id] = s.fish[i].tank;
    }

    save.save(s);
    var loaded = save.load();
    save.clear();

    assert(loaded.state.tankCount === 3, '缸数应读回 3，实际 ' + loaded.state.tankCount);
    assert(loaded.state.activeTank === 2, '当前缸应读回 2，实际 ' + loaded.state.activeTank);
    for (var k = 0; k < loaded.state.fish.length; k++) {
        var f = loaded.state.fish[k];
        assert(before[f.id] === f.tank, '鱼 ' + f.id + ' 的缸归属丢了');
    }
    return loaded.state.fish.length + ' 条鱼 · 3 缸';
});

test('多缸：老档（v3）读进来全部落到 1 号缸', function () {
    /* 手工造一份 v3 存档：没有 tankCount / activeTank / tk */
    var legacy = {
        v: 3,
        savedAt: platform.now(),
        lastSeenAt: platform.now(),
        t: 100,
        coins: { fish: 5000, s: 0 },
        acc: 0,
        foodLv: 2,
        auto: false,
        corals: 1,
        storageLv: 3,
        stats: {},
        fish: [
            { id: 'a', sp: 'gold_fish', g: 100, h: 90, m: 90, tr: [], b: 0, x: 100, y: 300 },
            { id: 'b', sp: 'blue_zebra', g: 80, h: 90, m: 90, tr: [], b: 0, x: 200, y: 400 }
        ]
    };
    store[save.KEY] = legacy;

    var loaded = save.load();
    save.clear();

    assert(loaded.state.tankCount === 1, 'v3 存档应只有 1 个缸');
    assert(loaded.state.activeTank === 0, 'v3 存档的当前缸应是 0');
    for (var i = 0; i < loaded.state.fish.length; i++) {
        assert(loaded.state.fish[i].tank === 0, 'v3 的鱼应全部落在 1 号缸');
    }
    assert(loaded.state.coins.fish === 5000, '余额不应在迁移中丢失');
    return '2 条鱼 → 全部 1 号缸，余额 ' + wallet.format(loaded.state.coins.fish);
});

/* ---------------- 真机兼容回归 ----------------
 * 2026-11-20 真机（iPhone / iOS）事故：水草用 'hsl(163.48211, ...)' 拼字符串，
 * Chrome 接受、iOS WebKit 的 addColorStop 判成非法颜色直接抛，
 * 导致 scene 层每帧中断，玩家只看到一片背景。
 * 这两项测试就是防止同类写法再溜进来。
 */

test('颜色兼容：HSL 必须自己转成 rgb()，不能拼 hsl() 字符串', function () {
    var U = require('../render/util.js');

    var c = U.hsl(163.48211, 52, 16);
    assert(/^rgb\(\d+,\d+,\d+\)$/.test(c), '应输出 rgb(r,g,b)，实际：' + c);

    /* 小数色相不能透传成小数（真凶就是它） */
    assert(c.indexOf('.') < 0, '输出里不能出现小数点：' + c);

    /* 边界值不能算出 NaN */
    var edge = U.hsl(-30, 100, 50) + U.hsl(400, 0, 0) + U.hsl(0, 0, 100);
    assert(edge.indexOf('NaN') < 0, '边界色相/饱和度不应产生 NaN：' + edge);

    var green = U.hsl(160, 55, 24);
    assert(green !== c, '不同参数应得到不同颜色');
    return c + ' · ' + green;
});

test('颜色兼容：渲染层不再出现 hsl( 字符串拼接', function () {
    var fs = require('fs');
    var path = require('path');
    var dir = path.resolve(__dirname, '..', 'render');
    var files = fs.readdirSync(dir).filter(function (f) { return f.slice(-3) === '.js'; });
    var bad = [];

    for (var i = 0; i < files.length; i++) {
        if (files[i] === 'util.js') continue;
        var src = fs.readFileSync(path.join(dir, files[i]), 'utf8');
        if (src.indexOf("'hsl('") >= 0 || src.indexOf('\'hsl(\'') >= 0) bad.push(files[i]);
    }
    assert(bad.length === 0, '这些文件还在拼 hsl()：' + bad.join(', '));
    return '扫描 ' + (files.length - 1) + ' 个渲染文件，全部干净';
});

test('体型缩小一号：观感尺寸变小，但体型加成与卖价不动', function () {
    var f = { speciesId: 'gold_fish', growth: 100, hunger: 90, mood: 90, traits: [] };
    var size = fishLib.sizeOf(f);
    assert(size > 50 && size < 60, '小金鱼成鱼尺寸应约 55，实际 ' + size);
    var mul = fishLib.sizeMul(f);
    assert(mul > 1.13 && mul < 1.16, '体型加成应和缩小前接近，实际 ' + mul);
    var value = fishLib.sellPriceOf(f);
    assert(value === 135, '卖价不该受观感尺寸影响，实际 ' + value);
    return '尺寸 ' + size.toFixed(1) + ' · 加成 ' + mul.toFixed(3) + ' · 卖价 ' + value;
});

/* ---------------- 输出 ---------------- */

var pass = 0;
var fail = 0;
console.log('');
console.log('逻辑验收 · 无头测试');
console.log('------------------------------------------------------------');
for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.ok) pass += 1;
    else fail += 1;
    console.log(
        (r.ok ? 'PASS' : 'FAIL') + '  ' +
        (i + 1 < 10 ? '0' : '') + (i + 1) + '  ' +
        r.name
    );
    if (r.note) console.log('        ' + r.note);
}
console.log('------------------------------------------------------------');
console.log('合计 ' + results.length + ' 项 · PASS ' + pass + ' · FAIL ' + fail);
console.log('');

process.exit(fail === 0 ? 0 : 1);
