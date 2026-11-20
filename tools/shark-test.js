/* ============================================================
 * tools/shark-test.js · 小鲨鱼专项测试
 *
 * 覆盖四件事：
 *   1. R 卵里 1% 独立概率（不受权重表总和影响）
 *   2. 彩蛋鱼不进「可能出几种 / 卖价区间」的展示
 *   3. 鲨鱼完全不吃鱼饵，只按冷却吃同缸的鱼
 *   4. 托管缸、离线结算、存档也遵守同一套规则
 *
 * 运行：node tools/shark-test.js
 * ============================================================ */

/* ---------------- 环境模拟 ---------------- */

var store = {};
var noop = function () {};

global.wx = {
    getWindowInfo: function () {
        return {
            windowWidth: 390, windowHeight: 844, pixelRatio: 2, statusBarHeight: 20,
            safeArea: { top: 20, bottom: 810, left: 0, right: 390 }
        };
    },
    getStorageSync: function (k) { return store[k] === undefined ? '' : JSON.parse(JSON.stringify(store[k])); },
    setStorageSync: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    removeStorageSync: function (k) { delete store[k]; },
    onShow: noop, onHide: noop, onTouchStart: noop
};

var cfg = require('../config/index.js');
var fishLib = require('../core/fish.js');
var shop = require('../core/shop.js');
var sim = require('../core/sim.js');
var offline = require('../core/offline.js');
var save = require('../core/save.js');
var stateModule = require('../core/state.js');
var predation = require('../core/predation.js');

var VP = { w: 390, h: 708, top: 94, x0: 8, ground: 650 };
var SHARK = 'reef_shark';

/* ---------------- 断言 ---------------- */

var results = [];

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function near(actual, expect, tol, msg) {
    if (Math.abs(actual - expect) > tol) {
        throw new Error(msg + '（实际 ' + actual + '，期望 ' + expect + ' ±' + tol + '）');
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

function fresh() {
    var s = stateModule.bootstrapFresh();
    s.view.vp = VP;
    s.coins.fish = 100000;
    return s;
}

function sharkAt(state, x, y, hunger) {
    var sh = fishLib.create(SHARK, { growth: 50, hunger: hunger == null ? 30 : hunger, tank: 0 });
    sh.x = x;
    sh.y = y;
    sh.huntT = 0;
    state.fish.push(sh);
    return sh;
}

function preyAt(state, x, y, tank) {
    var p = fishLib.create('gold_fish', { growth: 50, hunger: 80, tank: tank || 0 });
    p.x = x;
    p.y = y;
    state.fish.push(p);
    return p;
}

function withRandom(fn, rng) {
    var original = Math.random;
    Math.random = rng;
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

function lcg(seed) {
    var s = seed >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/* ---------------- 用例 ---------------- */

test('R 池包含小鲨鱼，eggRate 正好 0.1%', function () {
    var sp = fishLib.speciesById(SHARK);
    assert(sp.rarity === 'R', '小鲨鱼应该是 R 级');
    assert(sp.predator === true, '小鲨鱼应该标记为捕食者');
    near(sp.eggRate, 0.001, 1e-9, 'eggRate');

    var sh = withRandom(function () { return shop.rollInRarity('R'); }, function () { return 0.0005; });
    var normal = withRandom(function () { return shop.rollInRarity('R'); }, function () { return 0.002; });
    assert(sh.id === SHARK, '低于 0.1% 应该抽中小鲨鱼');
    assert(normal.id !== SHARK, '高于 0.1% 不该抽中小鲨鱼');
    return '边界 0.0005 → 鲨鱼 · 0.002 → ' + normal.name;
});

test('大样本概率落在 0.1% 附近', function () {
    var rng = lcg(20261120);
    var n = 100000;
    var got = withRandom(function () {
        var c = 0;
        for (var i = 0; i < n; i++) {
            if (shop.rollInRarity('R').id === SHARK) c += 1;
        }
        return c;
    }, rng);
    var rate = got / n * 100;
    near(rate, 0.1, 0.2, '抽中率（%）');
    return got + ' / ' + n + ' = ' + rate.toFixed(3) + '%';
});

test('SR / SSR 卵抽不到小鲨鱼', function () {
    for (var i = 0; i < 2000; i++) {
        assert(shop.rollInRarity('SR').id !== SHARK, 'SR 卵不该出鲨鱼');
        assert(shop.rollInRarity('SSR').id !== SHARK, 'SSR 卵不该出鲨鱼');
    }
    return '各抽 2000 次，0 命中';
});

test('鱼卵卡展示隐藏彩蛋：仍显示 3 种，卖价区间不含鲨鱼', function () {
    var s = fresh();
    var st = shop.eggStatusOf(s, 'R');
    assert(st.count === 3, '展示的鱼种数应为 3，实际 ' + st.count);
    assert(st.names.indexOf('小鲨鱼') < 0, '展示名单不该剧透小鲨鱼');
    assert(st.secretHint === '0.1% 隐藏款', '应该提示有 0.1% 隐藏款，实际 ' + st.secretHint);
    assert(st.rep.id !== SHARK, '代言人不该换成鲨鱼');
    var koi = fishLib.speciesById('peach_koi');
    near(st.maxSell, fishLib.matureValueOf(koi), 0.001, 'R 档最高卖价');
    return st.count + ' 种 · ' + st.names.join('/');
});

test('R 卵定价仍把 0.1% 的鲨鱼期望算进去', function () {
    var S = cfg.economy.sell;
    var normal = [
        ['gold_fish', 20], ['blue_zebra', 20], ['peach_koi', 16]
    ];
    var sum = 0;
    var total = 0;
    for (var i = 0; i < normal.length; i++) {
        sum += normal[i][1] * fishLib.matureValueOf(fishLib.speciesById(normal[i][0]));
        total += normal[i][1];
    }
    var avg = sum / total;
    avg = avg * 0.999 + fishLib.matureValueOf(fishLib.speciesById(SHARK)) * 0.001;
    var expected = Math.max(S.step || 5, Math.round(avg * S.eggDiscount / (S.step || 5)) * (S.step || 5));
    assert(shop.eggPriceOf('R') === expected,
        '卵价应为 ' + expected + '，实际 ' + shop.eggPriceOf('R'));
    return 'R 卵 ' + expected + ' 鱼币';
});

test('买 R 卵能开出鲨鱼，飘字报出名字', function () {
    var s = fresh();
    var r = withRandom(function () {
        return sim.buyEgg(s, 'R');
    }, function () { return 0.0005; });
    assert(r.ok, '应该买得到');
    assert(r.species.id === SHARK, '应该开出小鲨鱼');
    assert(s.fish[s.fish.length - 1].speciesId === SHARK, '鲨鱼应该进缸');
    var last = s.view.floaters[s.view.floaters.length - 1];
    assert(last && last.text.indexOf('小鲨鱼') >= 0, '飘字应该显示小鲨鱼');
    return last.text;
});

test('传奇鱼卵：固定 10 万金币，无解锁门槛，必出小鲨鱼', function () {
    var s = fresh();
    s.coins.fish = 100000;
    var st = shop.eggStatusOf(s, 'LEGEND');
    assert(st.price === 100000, '价格应为 100000，实际 ' + st.price);
    assert(!st.locked && st.need === 0, '传奇卵不该锁');
    assert(st.count === 1 && st.rep.id === SHARK, '只该有一条代表鱼且是鲨鱼');
    assert(st.secretHint === '必出 小鲨鱼', '卡片该直说必出，实际 ' + st.secretHint);

    for (var i = 0; i < 50; i++) {
        assert(shop.rollInRarity('LEGEND').id === SHARK, '传奇卵必须开出鲨鱼');
    }

    var before = s.coins.fish;
    var r = shop.buyEgg(s, 'LEGEND');
    assert(r.ok, '买传奇卵应成功：' + r.reason);
    assert(r.species.id === SHARK, '应该开出小鲨鱼');
    assert(r.price === 100000, '应扣 10 万');
    assert(before - s.coins.fish === 100000, '余额应正好少 10 万');
    assert(s.fish[s.fish.length - 1].speciesId === SHARK, '鲨鱼应进缸');
    return '10 万 → ' + r.species.name + ' · 余额 ' + s.coins.fish;
});

test('鱼卵货架共四款，传奇卵排在最后', function () {
    var s = fresh();
    var list = shop.eggList(s);
    assert(list.length === 4, '应有四款卵，实际 ' + list.length);
    assert(list[3].rarity === 'LEGEND', '传奇卵应排第四');
    assert(list[0].count === 3 && list[0].names.indexOf('小鲨鱼') < 0, '普通卵仍不剧透鲨鱼');
    return list.map(function (e) { return e.rarity; }).join(' / ');
});

test('传奇卵鱼位满时不扣钱', function () {
    var s = fresh();
    s.coins.fish = 500000;
    var slots = require('../core/storage.js').slotsOf(s);
    while (s.fish.length < slots) s.fish.push(fishLib.create('gold_fish', { growth: 50 }));
    var before = s.coins.fish;
    var r = shop.buyEgg(s, 'LEGEND');
    assert(!r.ok && r.reason === 'full', '满缸应拒绝：' + r.reason);
    assert(s.coins.fish === before, '失败不该扣钱');
    return '鱼位 ' + slots + ' 满，余额不变';
});

test('鲨鱼不吃鱼饵：饲料沉在原地，饥饿照常下降', function () {
    var s = fresh();
    s.fish = [];
    var sh = sharkAt(s, 200, 300, 30);
    sh.huntT = 999;                       /* 关掉捕猎，只看它碰不碰鱼饵 */
    s.foods.push({ x: 200, y: 300, vx: 0, vy: 0, r: 3, rot: 0,
        settled: true, fade: 0, dead: false });

    sim.step(s, 0.016, VP);

    assert(s.foods.length === 1, '饲料不该被鲨鱼吃掉');
    assert(!s.foods[0].dead, '饲料不该被标记 dead');
    assert(sh.hunger < 30, '饥饿应该继续下降，而不是被饲料补回来');
    assert(!(s.stats.pelletsEaten > 0), '不该记一次吃食');
    return ' hunger ' + sh.hunger.toFixed(3) + ' · 饲料 1 粒';
});

test('鲨鱼吃鱼：猎物消失，饱食/成长上涨，选中态清掉', function () {
    var s = fresh();
    s.fish = [];
    var sh = sharkAt(s, 200, 300, 30);
    var p = preyAt(s, 200, 300, 0);
    s.view.selFish = p.id;

    sim.step(s, 0.016, VP);

    assert(s.fish.length === 1 && s.fish[0] === sh, '猎物应该被吃掉');
    assert(sh.hunger > 95, '吃完应该接近吃饱，实际 ' + sh.hunger);
    assert(sh.growth > 50, '吃完应该长大');
    assert(s.stats.fishEaten === 1, '应该记一次捕食');
    assert(s.view.selFish === '', '被吃掉的鱼如果正被选中，要清掉选中态');
    var hasFloat = false;
    for (var i = 0; i < s.view.floaters.length; i++) {
        if (s.view.floaters[i].text.indexOf('吃掉') >= 0) hasFloat = true;
    }
    assert(hasFloat, '应该有「吃掉 XX」的飘字');
    return '饥饿 ' + sh.hunger.toFixed(1) + ' · 成长 ' + sh.growth.toFixed(1);
});

test('吃饱后暂停捕猎，冷却期间也不连吃', function () {
    var s = fresh();
    s.fish = [];
    var sh = sharkAt(s, 200, 300, 96);
    var p = preyAt(s, 200, 300, 0);
    sim.step(s, 0.016, VP);
    assert(s.fish.length === 2, '吃饱时不该吃');

    /* 游动会把鱼推开，重新贴到嘴边再测第二次，避免距离造成的假阴性 */
    sh.hunger = 30;
    sh.x = p.x; sh.y = p.y;
    sim.step(s, 0.016, VP);
    assert(s.fish.length === 1, '饿了应该马上吃');
    assert(sh.huntT > 10, '吃完应该进入冷却');

    var p2 = preyAt(s, sh.x, sh.y, 0);
    sim.step(s, 0.016, VP);
    assert(s.fish.length === 2, '冷却期内不该连吃');
    return '冷却剩余 ' + sh.huntT.toFixed(1) + ' 秒';
});

test('两条鲨鱼不会互相吃', function () {
    var s = fresh();
    s.fish = [];
    sharkAt(s, 200, 300, 30);
    sharkAt(s, 205, 302, 30);
    sim.step(s, 0.016, VP);
    assert(s.fish.length === 2, '鲨鱼不应把鲨鱼当猎物');
    assert(!s.stats.fishEaten, '不该记捕食');
    return '两条都在';
});

test('非当前缸的鲨鱼也吃鱼，不吃托管饲料', function () {
    var s = fresh();
    s.tankCount = 2;
    s.activeTank = 0;
    s.fish = [];
    var sh = sharkAt(s, 200, 300, 30);
    sh.tank = 1;
    var p = preyAt(s, 200, 300, 1);

    sim.step(s, 0.016, VP);

    assert(s.fish.length === 1 && s.fish[0] === sh, '托管缸里的猎物也该被吃掉');
    assert(sh.hunger > 95, '托管缸鲨鱼靠吃鱼补饥饿');
    assert(p.eaten, '猎物应被标记');
    return '托管缸 ' + s.stats.fishEaten + ' 次捕食';
});

test('离线期间鲨鱼按 3 分钟一条吃鱼，结果里报告吃了几条', function () {
    var s = fresh();
    s.fish = [];
    var sh = sharkAt(s, 200, 300, 80);
    var sharkBefore = fishLib.sellPriceOf(sh);
    preyAt(s, 220, 300, 0);
    preyAt(s, 240, 300, 0);
    s.lastSeenAt = Date.now() - 10 * 60 * 1000;

    var r = offline.settle(s, Date.now());

    assert(r, '应该产生离线结算');
    assert(r.eaten === 2, '10 分钟最多吃 2 条（共 2 条猎物），实际 ' + r.eaten);
    assert(s.fish.length === 1 && s.fish[0] === sh, '猎物应该都消失了');
    assert(r.before > sharkBefore, '离开时的总身价要把后来被吃掉的鱼算进去');
    return '离线 10 分钟吃掉 ' + r.eaten + ' 条 · 身价 ' + r.before + ' → ' + r.after;
});

test('存档往返保留鲨鱼品种与捕食标记', function () {
    save.clear();
    var s = fresh();
    s.fish = [];
    sharkAt(s, 200, 300, 30);
    save.save(s);

    var loaded = save.load();
    assert(loaded && loaded.state.fish.length === 1, '读档应有一条鱼');
    var f = loaded.state.fish[0];
    assert(f.speciesId === SHARK, '品种应保留，实际 ' + f.speciesId);
    assert(predation.isPredator(f), '读档后仍应是捕食者');
    save.clear();
    return 'speciesId=' + f.speciesId;
});

test('鲨鱼大图 / 小图 / 缩略图都能画出来', function () {
    var ctx = new Proxy({}, {
        get: function (t, k) {
            if (k === 'measureText') return function (str) { return { width: String(str).length * 7 }; };
            if (k === 'createLinearGradient' || k === 'createRadialGradient') {
                return function () { return { addColorStop: noop }; };
            }
            if (k in t) return t[k];
            return noop;
        },
        set: function (t, k, v) { t[k] = v; return true; }
    });
    var art = require('../render/fishart.js');
    art.draw(ctx, { speciesId: SHARK, L: 122, t: 0.7, growth: 100, belly: 0.7, detail: true });
    art.draw(ctx, { speciesId: SHARK, L: 44, t: 0.7, growth: 60, dir: -1, detail: false });
    art.drawThumb(ctx, SHARK, 0, 0, 58, 58, {});
    return '三次绘制无异常';
});

/* ---------------- 汇总 ---------------- */

function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
}

console.log('');
console.log('小鲨鱼专项测试');
console.log('----------------------------------------------------------------');
var pass = 0;
var fail = 0;
for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.ok) pass += 1; else fail += 1;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + pad(i + 1, 3) + r.name);
    if (r.note) console.log('        ' + r.note);
}
console.log('----------------------------------------------------------------');
console.log('合计 ' + results.length + ' 项 · PASS ' + pass + ' · FAIL ' + fail);
console.log('');
if (fail) process.exitCode = 1;
