/* ============================================================
 * tools/pond-test.js · 鱼塘 / 钓鱼 / 仓库专项测试
 *
 * 覆盖：
 *   配置：鱼塘三档且只开普通、鱼饵 10、珍珠 1 万、珍珠贝概率
 *   鱼饵：买（10/个、数量累加、钱不够拦截）、抛竿消耗 1、无饵拦截
 *   钓鱼：产出鱼或珍珠贝（概率区间）、鱼种属于 R 档、成长随机且偏小
 *   仓库：鱼进仓库、放缸（空位/满位）、直接卖（含贝壳加成）
 *   珍珠：打破珍珠贝 50%、珍珠卖 1 万
 *   存档：往返保留 pondLv/bag/caught、老档补默认
 *   渲染：鱼塘页 / 仓库页整帧不报错
 *
 * 运行：node tools/pond-test.js
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
var pond = require('../core/pond.js');
var shop = require('../core/shop.js');
var storage = require('../core/storage.js');
var save = require('../core/save.js');
var wallet = require('../core/wallet.js');
var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var sim = require('../core/sim.js');

var vp = C.viewport;
function center(r) { return Math.round(r.x + r.w / 2); }
function cY(r) { return Math.round(r.y + r.h / 2); }
function setup() {
    session.sheetOpen = false;
    session.sheetEase = 0;
    session.sheetTab = 0;
    session.codexDetail = null;
    session.modal = null;
    session.toast = null;
    session.bagSel = '';
    session.pondTapAt = 0;
    session.debug.open = false;
    session.debug.tapTimes.length = 0;
    var state = stateModule.bootstrapFresh();
    state.view.vp = vp;
    state.coins.fish = 1000000;
    sim.ensurePlacement(state, vp);
    return { state: state, session: session, viewport: vp, sim: sim, saveNow: function () {} };
}
/* 打开面板并切到指定页签（ease 直接置 1，跳过展开动画） */
function openTab(env, tab) {
    touch.tap(center(L.SHOP_BTN), cY(L.SHOP_BTN), env);
    env.session.sheetEase = 1;
    touch.tap(center(L.tabRect(tab, 1)), cY(L.tabRect(tab, 1)), env);
}

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
    s.coins.fish = 5000000;
    return s;
}

/* ---------------- 配置 ---------------- */

test('鱼塘三档且只开放普通', function () {
    var P = cfg.pond;
    assert(P.levels.length === 3, '应有 3 档鱼塘');
    assert(P.openMax === 1, 'openMax 应为 1');
    assert(P.levels[0].rarity === 'R', '第 1 档应为 R');
    return P.levels.map(function (l) { return l.lv + ':' + l.name; }).join(' ');
});

test('鱼饵 10 金币、珍珠 1 万', function () {
    assert(cfg.pond.bait.price === 10, '鱼饵应为 10 金币');
    assert(pond.baitPrice() === 10, 'baitPrice 应返回 10');
    assert(cfg.pond.pearlPrice === 10000, '珍珠应为 1 万');
    return '饵 10 / 珠 10000';
});

test('新档鱼塘 1 级、仓库空', function () {
    var s = fresh();
    assert(s.pondLv === 1, 'pondLv 应为 1');
    assert(pond.baitOf(s) === 0 && pond.oysterOf(s) === 0 && pond.pearlOf(s) === 0, 'bag 应全 0');
    assert(pond.caughtCount(s) === 0, 'caught 应为空');
    return 'pondLv=1 bag=0 caught=0';
});

/* ---------------- 鱼饵 ---------------- */

test('买鱼饵：10/个、数量累加', function () {
    var s = fresh();
    var before = s.coins.fish;
    var r = pond.buyBait(s, 3);
    assert(r.ok, '买鱼饵应成功');
    assert(pond.baitOf(s) === 3, '应有 3 个鱼饵，实际 ' + pond.baitOf(s));
    assert(before - s.coins.fish === 30, '应扣 30 金币，实际 ' + (before - s.coins.fish));
    return '3 个 / 扣 30';
});

test('钱不够买鱼饵被拦截', function () {
    var s = fresh();
    s.coins.fish = 5;
    var r = pond.buyBait(s, 1);
    assert(!r.ok && r.reason === 'poor', '余额不足应返回 poor');
    assert(pond.baitOf(s) === 0, '失败不应加鱼饵');
    return 'poor';
});

test('商店里鱼饵固定价 10、购买 +1', function () {
    var s = fresh();
    var st = shop.statusOf(s, shop.itemById('bait'));
    assert(st.price === 10, '商店鱼饵价应为 10，实际 ' + st.price);
    assert(st.level === '×0', '徽标应显示 ×0，实际 ' + st.level);
    shop.buy(s, 'bait');
    assert(pond.baitOf(s) === 1, '买一次应 +1');
    var st2 = shop.statusOf(s, shop.itemById('bait'));
    assert(st2.price === 10, '再买价格仍应 10（不涨价）');
    return '价 10 · 买后 ×1';
});

/* ---------------- 抛竿 ---------------- */

test('抛竿消耗 1 个鱼饵', function () {
    var s = fresh();
    pond.buyBait(s, 2);
    var r = pond.cast(s);
    assert(r.ok, '有鱼饵应能抛竿');
    assert(pond.baitOf(s) === 1, '应剩 1 个鱼饵，实际 ' + pond.baitOf(s));
    return r.type === 'fish' ? '得鱼' : '得珍珠贝';
});

test('没鱼饵抛竿被拦截', function () {
    var s = fresh();
    var r = pond.cast(s);
    assert(!r.ok && r.reason === 'no_bait', '无鱼饵应返回 no_bait');
    return 'no_bait';
});

test('抛竿产出 鱼/珍珠贝，珍珠贝约 15%', function () {
    var s = fresh();
    s.coins.fish = 10000000;
    pond.buyBait(s, 400);

    var fishN = 0, oysterN = 0;
    for (var i = 0; i < 400; i++) {
        var r = pond.cast(s);
        assert(r.ok, '第 ' + i + ' 次抛竿应成功');
        if (r.type === 'fish') fishN += 1;
        else oysterN += 1;
    }
    assert(fishN > 0 && oysterN > 0, '两种产出都应出现');
    /* 期望 15%，400 次约 60；放宽到 10%~22% 以容忍随机波动 */
    var rate = oysterN / 400;
    assert(rate > 0.08 && rate < 0.24, '珍珠贝率应≈15%，实际 ' + (rate * 100).toFixed(1) + '%');
    return '鱼 ' + fishN + ' / 贝 ' + oysterN + '（' + (rate * 100).toFixed(1) + '%）';
});

test('钓到的鱼属于 R 档、进仓库、成长偏小', function () {
    var s = fresh();
    s.coins.fish = 10000000;
    pond.buyBait(s, 200);

    var growths = [];
    for (var i = 0; i < 200; i++) {
        var r = pond.cast(s);
        if (r.type !== 'fish') continue;
        assert(r.species.rarity === 'R', '普通塘只能钓 R 档，得到 ' + r.species.rarity);
        assert(r.fish.growth >= cfg.pond.growth.min - 0.01 &&
            r.fish.growth <= cfg.pond.growth.max + 0.01, '成长应在区间内');
        growths.push(r.fish.growth);
    }
    assert(growths.length > 20, '应钓到足够多的鱼采样');
    assert(pond.caughtCount(s) === growths.length, '钓到的鱼应全进仓库');

    growths.sort(function (a, b) { return a - b; });
    var median = growths[Math.floor(growths.length / 2)];
    assert(median < 55, '成长中位数应偏小（<55），实际 ' + median.toFixed(1));
    return '样本 ' + growths.length + ' · 中位 ' + median.toFixed(1);
});

/* ---------------- 仓库：放缸 / 卖 ---------------- */

test('仓库鱼放进鱼缸（有空位）', function () {
    var s = fresh();
    pond.buyBait(s, 1);
    var r = pond.cast(s);
    /* 若这次出的是珍珠贝，再钓一次拿鱼 */
    if (r.type !== 'fish') r = pond.cast(s);
    while (r.type !== 'fish') { pond.buyBait(s, 1); r = pond.cast(s); }

    var fishCountBefore = s.fish.length;
    var mv = pond.moveToTank(s, r.fish.id);
    assert(mv.ok, '有空位时应能放进鱼缸');
    assert(s.fish.length === fishCountBefore + 1, '鱼缸应多一条');
    assert(pond.caughtCount(s) === 0, '仓库应少一条');
    return '放入缸 ' + mv.tank + ' 号';
});

test('鱼缸满时放缸被拦截', function () {
    var s = fresh();
    pond.buyBait(s, 10);
    var got = null;
    for (var i = 0; i < 40 && !got; i++) {
        var r = pond.cast(s);
        if (r.type === 'fish') got = r.fish;
    }
    assert(got, '应钓到一条鱼');

    /* 把鱼缸塞满 */
    while (storage.roomOf(s) > 0) {
        s.fish.push(fishLib.create(cfg.species[0].id, { growth: 50, tank: 0 }));
    }
    var mv = pond.moveToTank(s, got.id);
    assert(!mv.ok && mv.reason === 'full', '满缸应返回 full');
    assert(pond.caughtCount(s) === 1, '失败的鱼应留在仓库');
    return 'full';
});

test('仓库鱼直接卖，含招财贝壳加成', function () {
    var s = fresh();
    var f = fishLib.create(cfg.species[0].id, { growth: 100 });
    s.caught.push(f);

    s.shellLv = 0;
    var p0 = pond.caughtList(s)[0].price;
    s.shellLv = 3;
    var p3 = pond.caughtList(s)[0].price;
    assert(p3 > p0, '3 级贝壳时仓库卖价应更高：' + p0 + ' → ' + p3);

    var before = s.coins.fish;
    var r = pond.sellCaught(s, f.id);
    assert(r.ok, '卖仓库鱼应成功');
    assert(r.price === p3, '成交价应等于展示价 ' + p3 + '，实际 ' + r.price);
    assert(s.coins.fish === before + p3, '入账应等于成交价');
    assert(pond.caughtCount(s) === 0, '卖完仓库应为空');
    return '+' + p3;
});

/* ---------------- 珍珠 ---------------- */

test('打破珍珠贝约 50% 出珍珠', function () {
    var s = fresh();
    s.bag.oyster = 600;
    var pearls = 0;
    for (var i = 0; i < 600; i++) {
        var r = pond.breakOyster(s);
        assert(r.ok, '有贝壳时应能打破');
        if (r.pearl) pearls += 1;
    }
    var rate = pearls / 600;
    assert(rate > 0.42 && rate < 0.58, '出珠率应≈50%，实际 ' + (rate * 100).toFixed(1) + '%');
    assert(pond.oysterOf(s) === 0, '600 个应全部消耗完');
    return pearls + '/600（' + (rate * 100).toFixed(1) + '%）';
});

test('珍珠卖 1 万', function () {
    var s = fresh();
    s.bag.pearl = 1;
    var before = s.coins.fish;
    var r = pond.sellPearl(s);
    assert(r.ok, '有珍珠应能卖');
    assert(r.price === 10000, '单价应 1 万，实际 ' + r.price);
    assert(s.coins.fish - before === 10000, '应入账 1 万');
    assert(pond.pearlOf(s) === 0, '卖完珍珠应为 0');
    return '+10000';
});

test('没有珍珠时卖珍珠被拦截', function () {
    var s = fresh();
    var r = pond.sellPearl(s);
    assert(!r.ok && r.reason === 'none', '没珍珠应返回 none');
    return 'none';
});

/* ---------------- 存档 ---------------- */

test('存档往返保留 pondLv/bag/caught', function () {
    var s = fresh();
    s.pondLv = 1;
    s.bag.bait = 7;
    s.bag.oyster = 2;
    s.bag.pearl = 3;
    s.caught.push(fishLib.create(cfg.species[1].id, { growth: 64 }));

    save.save(s);
    var loaded = save.load();
    assert(loaded, '应能读档');
    var L = loaded.state;
    assert(L.pondLv === 1, 'pondLv 应保留');
    assert(pond.baitOf(L) === 7, 'bait 应保留 7，实际 ' + pond.baitOf(L));
    assert(pond.oysterOf(L) === 2, 'oyster 应保留 2');
    assert(pond.pearlOf(L) === 3, 'pearl 应保留 3');
    assert(pond.caughtCount(L) === 1, 'caught 应保留 1 条');
    assert(L.caught[0].growth > 60, '仓库鱼的成长值应保留');
    return '往返 OK';
});

test('老档无池塘字段补默认', function () {
    var raw = { v: 4, foodLv: 2, coins: { fish: 100, s: 0 }, fish: [] };
    store['aquarium_save'] = JSON.parse(JSON.stringify(raw));
    var loaded = save.load();
    assert(loaded, '老档应能读');
    var L = loaded.state;
    assert(L.pondLv === 1, '老档 pondLv 应补 1');
    assert(pond.baitOf(L) === 0 && pond.oysterOf(L) === 0 && pond.pearlOf(L) === 0, '老档 bag 应补 0');
    assert(pond.caughtCount(L) === 0, '老档 caught 应为空');
    return '补默认 OK';
});

/* ---------------- 渲染 ---------------- */

test('鱼塘页整帧渲染不报错', function () {
    var session = require('../ui/session.js');
    var C = require('../render/canvas.js');
    var s = fresh();
    s.view.vp = C.viewport;
    s.bag.bait = 5;
    s.caught.push(fishLib.create(cfg.species[0].id, { growth: 42 }));
    session.sheetOpen = true;
    session.sheetEase = 1;
    session.sheetTab = 3;
    session.codexDetail = null;
    session.modal = null;
    session.bagSel = '';
    require('../render/index.js').draw(sharedCtx, s, session);
    return '整帧渲染通过';
});

test('仓库页整帧渲染不报错（含选中鱼）', function () {
    var session = require('../ui/session.js');
    var C = require('../render/canvas.js');
    var s = fresh();
    s.view.vp = C.viewport;
    s.bag.oyster = 2;
    s.bag.pearl = 1;
    s.bag.bait = 4;
    var f = fishLib.create(cfg.species[2].id, { growth: 88 });
    s.caught.push(f);
    s.caught.push(fishLib.create(cfg.species[0].id, { growth: 20 }));
    session.sheetOpen = true;
    session.sheetEase = 1;
    session.sheetTab = 4;
    session.codexDetail = null;
    session.modal = null;
    session.bagSel = f.id;
    require('../render/index.js').draw(sharedCtx, s, session);
    return '整帧渲染通过';
});

/* ---------------- 触摸 ---------------- */

test('触摸：切到鱼塘页并点抛竿，扣 1 鱼饵', function () {
    var env = setup();
    env.state.bag.bait = 2;
    openTab(env, 3);
    assert(env.session.sheetTab === 3, '应切到鱼塘页，实际 ' + env.session.sheetTab);

    var b = L.pondCastRect(1);
    touch.tap(center(b), cY(b), env);
    assert(env.state.bag.bait === 1, '抛竿后应剩 1 个鱼饵，实际 ' + env.state.bag.bait);
    return 'bait 2 → 1';
});

test('触摸：无鱼饵点抛竿只提示、不扣', function () {
    var env = setup();
    env.state.bag.bait = 0;
    openTab(env, 3);
    var b = L.pondCastRect(1);
    touch.tap(center(b), cY(b), env);
    assert(env.state.bag.bait === 0, '不应变成负数');
    assert(env.session.toast && env.session.toast.text.indexOf('鱼饵') >= 0,
        '应提示鱼饵不足');
    return '提示 ' + (env.session.toast ? env.session.toast.text : '');
});

test('触摸：仓库点鱼选中', function () {
    var env = setup();
    var f = fishLib.create(cfg.species[0].id, { growth: 50 });
    env.state.caught.push(f);
    openTab(env, 4);
    assert(env.session.sheetTab === 4, '应切到仓库页');

    var r = L.bagFishRect(0, 1);
    touch.tap(center(r), cY(r), env);
    assert(env.session.bagSel === f.id, '应选中这条鱼，实际 ' + env.session.bagSel);
    return '选中 ' + f.id;
});

test('触摸：选中后点放入鱼缸', function () {
    var env = setup();
    var f = fishLib.create(cfg.species[0].id, { growth: 50 });
    env.state.caught.push(f);
    openTab(env, 4);

    var r = L.bagFishRect(0, 1);
    touch.tap(center(r), cY(r), env);
    var a = L.bagActionRect(0, 1);
    touch.tap(center(a), cY(a), env);

    assert(env.state.caught.length === 0, '仓库应变空');
    assert(env.state.fish.length === 2, '鱼缸应变 2 条（开局 1 + 放入 1），实际 ' + env.state.fish.length);
    assert(env.session.bagSel === '', '放入后应清空选中');
    return '进缸 OK';
});

test('触摸：点珍珠贝卡打破消耗一个', function () {
    var env = setup();
    env.state.bag.oyster = 1;
    openTab(env, 4);
    var r = L.bagItemRect(0, 1);
    touch.tap(center(r), cY(r), env);
    assert(env.state.bag.oyster === 0, '打破后珍珠贝应归 0，实际 ' + env.state.bag.oyster);
    return 'oyster 1 → 0';
});

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('鱼塘 / 仓库专项测试');
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
