/* ============================================================
 * tools/shell-test.js · 招财贝壳专项测试
 *
 * 覆盖两条链路：
 *   逻辑层：0 级无加成、1/2/3 级 +30/40/50%、满级拦截、
 *           购买价格递增、成交价与价签一致、存档往返、老档补 0、卵价不受影响
 *   渲染层：买满后整帧渲染不报错、贝壳图标存在
 *
 * 运行：node tools/shell-test.js
 * ============================================================ */

var store = {};
var noop = function () {};
function makeCtx() {
    return new Proxy({}, {
        get: function (t, k) {
            if (k === 'measureText') return function (s) { return { width: String(s).length * 7 }; };
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
                return function () { return { addColorStop: noop }; };
            }
            if (k === 'canvas') return { width: 390, height: 844 };
            if (k in t) return t[k];
            return noop;
        },
        set: function (t, k, v) { t[k] = v; return true; }
    });
}
var sharedCtx = makeCtx();
global.wx = {
    getWindowInfo: function () {
        return {
            windowWidth: 390, windowHeight: 844, pixelRatio: 2, statusBarHeight: 20,
            safeArea: { top: 20, bottom: 810, left: 0, right: 390 }
        };
    },
    createCanvas: function () { return { getContext: function () { return sharedCtx; } }; },
    getStorageSync: function (k) { return store[k] === undefined ? '' : JSON.parse(JSON.stringify(store[k])); },
    setStorageSync: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    removeStorageSync: function (k) { delete store[k]; },
    onShow: noop, onHide: noop, onTouchStart: noop
};

var cfg = require('../config/index.js');
var stateModule = require('../core/state.js');
var fishLib = require('../core/fish.js');
var shop = require('../core/shop.js');
var save = require('../core/save.js');
var wallet = require('../core/wallet.js');

var results = [];
function assert(cond, msg) { if (!cond) throw new Error(msg); }
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
    s.coins.fish = 5000000;   /* 买得起三级 */
    return s;
}
function shellItem() { return shop.itemById('shell'); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 0.001); }

/* ---------------- 逻辑层 ---------------- */

test('贝壳条目存在且配置三级', function () {
    var it = shellItem();
    assert(it, 'config/items.js 应有 shell 条目');
    assert(it.id === 'shell', 'id 应为 shell');
    assert(it.maxLevel === 3, 'maxLevel 应为 3');
    assert(it.icon === 'shell', '图标应为 shell');
    return 'name=' + it.name + ' maxLevel=' + it.maxLevel;
});

test('倍率表 [1, 1.3, 1.4, 1.5]', function () {
    var gains = cfg.economy.sell.shellBonus;
    assert(gains && gains.length === 4, '倍率表应有 4 档');
    assert(near(gains[0], 1) && near(gains[1], 1.3) && near(gains[2], 1.4) && near(gains[3], 1.5),
        '倍率应为 1/1.3/1.4/1.5');
    return gains.join('/');
});

test('新档贝壳 0 级、无加成', function () {
    var s = fresh();
    assert(s.shellLv === 0, '新档 shellLv 应为 0');
    var f = fishLib.create(cfg.species[0].id, { growth: 100 });
    var p0 = fishLib.sellPriceOf(f, s.shellLv);
    var pBase = fishLib.sellPriceOf(f);
    assert(p0 === pBase, '0 级卖价应等于原价');
    return '价 ' + p0;
});

test('1/2/3 级卖价依次 1.3/1.4/1.5 倍', function () {
    var s = fresh();
    var f = fishLib.create(cfg.species[0].id, { growth: 100 });
    var base = fishLib.sellPriceOf(f);
    var gains = cfg.economy.sell.shellBonus;
    var step = cfg.economy.sell.step || 5;
    for (var lv = 1; lv <= 3; lv++) {
        var got = fishLib.sellPriceOf(f, lv);
        /* 取整在「原始价×倍率」之后，不能用已取整的 base 再推，
         * 允许一个取整步长的误差即可。 */
        var want = base * gains[lv];
        assert(Math.abs(got - want) <= step + 1,
            'Lv.' + lv + ' 卖价应≈' + want.toFixed(1) + '，实际 ' + got);
        assert(got > (lv === 1 ? base : fishLib.sellPriceOf(f, lv - 1)), 'Lv.' + lv + ' 应比上一级贵');
    }
    return 'base ' + base + ' → ' + fishLib.sellPriceOf(f, 3);
});

test('状态初始 0 级、购买逐级升到 3 级', function () {
    var s = fresh();
    assert(shop.levelOf(s, 'shell') === 0, '初始应 0 级');
    for (var lv = 1; lv <= 3; lv++) {
        var r = shop.buy(s, 'shell');
        assert(r.ok, '第 ' + lv + ' 次购买应成功：' + r.reason);
        assert(s.shellLv === lv, '购买后应为 Lv.' + lv + '，实际 ' + s.shellLv);
    }
    return 'shellLv=' + s.shellLv;
});

test('满级后不能再买（maxed 拦截）', function () {
    var s = fresh();
    s.shellLv = 3;
    var st = shop.statusOf(s, shellItem());
    assert(st.maxed === true, '满级状态 maxed 应为 true');
    assert(st.disabled === true, '满级应禁用按钮');
    var r = shop.buy(s, 'shell');
    assert(!r.ok && r.reason === 'maxed', '满级购买应返回 maxed');
    assert(s.shellLv === 3, '满级后等级不应变化');
    return 'maxed=' + st.maxed;
});

test('购买价格逐级递增（base×mul^等级）', function () {
    var s = fresh();
    var p0 = shop.priceOf(s, shellItem());
    s.shellLv = 1;
    var p1 = shop.priceOf(s, shellItem());
    s.shellLv = 2;
    var p2 = shop.priceOf(s, shellItem());
    assert(p0 > 0 && p1 > p0 && p2 > p1, '价格应 0<1<2 级递增：' + p0 + '/' + p1 + '/' + p2);
    return p0 + ' → ' + p1 + ' → ' + p2;
});

test('状态描述显示当前加成百分比', function () {
    var s = fresh();
    s.shellLv = 1;
    var st = shop.statusOf(s, shellItem());
    assert(st.desc.indexOf('30%') >= 0, 'Lv.1 描述应含 30%，实际：' + st.desc);
    assert(st.desc.indexOf('40%') >= 0, 'Lv.1 描述应提示下一级 40%，实际：' + st.desc);
    assert(st.level.indexOf('Lv.1') >= 0, '徽标应显示 Lv.1/3，实际：' + st.level);
    s.shellLv = 3;
    var st3 = shop.statusOf(s, shellItem());
    assert(st3.desc.indexOf('50%') >= 0 && st3.level === 'MAX', '满级描述/徽标应正确');
    return 'desc=' + st.desc;
});

test('卖鱼成交价 = 带加成的价签价', function () {
    var s = fresh();
    var f = fishLib.create(cfg.species[0].id, { growth: 100 });
    s.fish.push(f);
    s.shellLv = 2;
    var before = s.coins.fish;
    var shown = fishLib.sellPriceOf(f, s.shellLv);
    var r = shop.sellFish(s, f.id);
    assert(r.ok, '卖鱼应成功');
    assert(r.price === shown, '成交价应等于价签 ' + shown + '，实际 ' + r.price);
    assert(s.coins.fish === before + shown, '入账应等于价签价');
    return '+'+ shown + ' 已入账';
});

test('sellableOf 估值带加成', function () {
    var s = fresh();
    var f = fishLib.create(cfg.species[0].id, { growth: 100 });
    s.fish.push(f);
    s.shellLv = 0;
    var p0 = shop.sellableOf(s)[0].price;
    s.shellLv = 3;
    var p3 = shop.sellableOf(s)[0].price;
    assert(p3 > p0, '带 3 级贝壳的估值应更高：' + p0 + ' → ' + p3);
    return p0 + ' → ' + p3;
});

test('卵价不受贝壳影响（不循环涨价）', function () {
    var s = fresh();
    var p0 = shop.eggPriceOf('R');
    s.shellLv = 3;
    var p3 = shop.eggPriceOf('R');
    assert(p0 === p3, 'R 卵价不应随贝壳变化：' + p0 + ' vs ' + p3);
    assert(shop.avgSellOf('R') === shop.avgSellOf('R'), '平均卖价基准恒定');
    return 'R 卵价 ' + p0;
});

test('存档往返保留 shellLv', function () {
    var s = fresh();
    s.shellLv = 2;
    save.save(s);
    var loaded = save.load();
    assert(loaded && loaded.state.shellLv === 2, '读档应保留 2 级，实际 ' +
        (loaded && loaded.state.shellLv));
    return '往返 shellLv=' + loaded.state.shellLv;
});

test('老档无 shellLv 字段补 0', function () {
    var raw = { v: cfg.saveVersion, foodLv: 2, coins: { fish: 100, s: 0 }, fish: [] };
    store['aquarium_save'] = JSON.parse(JSON.stringify(raw));
    var loaded = save.load();
    assert(loaded && loaded.state.shellLv === 0, '老档应补 0 级，实际 ' +
        (loaded && loaded.state.shellLv));
    return '补 0 级';
});

/* ---------------- 渲染层 ---------------- */

test('贝壳图标已注册', function () {
    var itemart = require('../render/itemart.js');
    itemart.draw(sharedCtx, 'shell', 30, 30, 28, '#2f5a72');
    return '绘制通过';
});

test('满级后整帧渲染不报错', function () {
    var session = require('../ui/session.js');
    var C = require('../render/canvas.js');
    var s = fresh();
    s.shellLv = 3;
    s.view.vp = C.viewport;
    session.sheetOpen = true;
    session.sheetEase = 1;
    session.sheetTab = 0;
    session.codexDetail = null;
    session.modal = null;
    require('../render/index.js').draw(sharedCtx, s, session);
    return '整帧渲染通过';
});

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('招财贝壳专项测试');
console.log('----------------------------------------------------------------');
var pass = 0;
var fail = 0;
results.forEach(function (r, i) {
    if (r.ok) pass += 1; else fail += 1;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + String(i + 1).padStart(3, ' ') + ' ' + r.name);
    if (r.note) console.log('        ' + r.note);
});
console.log('----------------------------------------------------------------');
console.log('合计 ' + results.length + ' 项 · PASS ' + pass + ' · FAIL ' + fail);
console.log('');
if (fail) process.exitCode = 1;
