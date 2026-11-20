/* ============================================================
 * tools/touch-test.js · 触摸链路测试（真点，不是只测 core）
 *
 * 为什么单独有这一组：
 *   经济公式在 headless-test 里都验过了，但「点一下能不能真的
 *   成交」是另一回事 —— 中间隔着命中判定、按钮放行、选中状态
 *   的清理时机。前面就栽过一次：点「卖掉」时先被当成「点了空白」
 *   把选中清掉了，钱一分没进，单测却全绿。
 *
 * 这组把 render/canvas.js 用 stub 顶起来，直接调 ui/touch.js 的
 * tap()，走的就是真机那条路。
 *
 * 运行：node tools/touch-test.js
 * ============================================================ */

/* ---------------- 环境模拟 ---------------- */

var store = {};
var noop = function () {};

/* canvas 2d 上下文的桩：真的按属性/方法被调用，但不画任何东西。
 * measureText / 渐变要返回对象，否则调用方一取 .width 就炸。 */
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
    onShow: noop,
    onHide: noop,
    onTouchStart: noop
};

var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');
var fishLib = require('../core/fish.js');

var vp = C.viewport;

/* ---------------- 断言 ---------------- */

var results = [];

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function test(name, fn) {
    try {
        var note = fn();
        results.push({ ok: true, name: name, note: note || '' });
    } catch (e) {
        results.push({ ok: false, name: name, note: e.message });
    }
}

/* 每个用例一套干净的状态 + 会话 */
function setup() {
    session.sheetOpen = false;
    session.sheetEase = 0;
    session.sheetTab = 0;
    session.modal = null;
    session.toast = null;
    session.debug.open = false;
    session.debug.tapTimes.length = 0;

    var state = stateModule.bootstrapFresh();
    state.view.vp = vp;
    state.coins.fish = 600;
    sim.ensurePlacement(state, vp);

    var env = {
        state: state,
        session: session,
        viewport: vp,
        sim: sim,
        saveNow: function () {}
    };
    return env;
}

function btnCenter(r) {
    return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
}

function fishAt(env) {
    var f = env.state.fish[0];
    return { f: f, x: Math.round(f.x), y: Math.round(f.y) };
}

/* ---------------- 用例 ---------------- */

test('点鱼：选中它，还没成交', function () {
    var env = setup();
    var t = fishAt(env);
    var before = env.state.coins.fish;

    touch.tap(t.x, t.y, env);

    assert(env.state.view.selFish === t.f.id, 'selFish 没指向这条鱼');
    assert(env.state.coins.fish === before, '只是选中，不应该进账');
    assert(env.state.fish.length === 1, '只是选中，鱼不该消失');
    return 'selFish=' + env.state.view.selFish;
});

test('点「卖掉」：进账 + 鱼消失 + 清掉选中', function () {
    var env = setup();
    var t = fishAt(env);
    var price = fishLib.sellPriceOf(t.f);
    var before = env.state.coins.fish;

    touch.tap(t.x, t.y, env);
    var b = btnCenter(L.SELL_BTN);
    touch.tap(b.x, b.y, env);

    assert(env.state.coins.fish === before + price,
        '余额应该 +' + price + '，实际 ' + before + ' → ' + env.state.coins.fish);
    assert(env.state.fish.length === 0, '鱼应该被卖掉了');
    assert(env.state.view.selFish === '', '卖完要清掉选中，否则光圈会留在原地');
    assert(session.toast && session.toast.text.indexOf('卖掉') === 0, '应该有成交提示');
    return before + ' → ' + env.state.coins.fish + ' · ' + session.toast.text;
});

test('没选鱼就点「卖掉」：只提示，余额和鱼都不动', function () {
    var env = setup();
    var before = env.state.coins.fish;

    var b = btnCenter(L.SELL_BTN);
    touch.tap(b.x, b.y, env);

    assert(env.state.coins.fish === before, '不该动余额');
    assert(env.state.fish.length === 1, '不该动鱼');
    assert(session.toast && session.toast.text.indexOf('先点一条鱼') === 0, '应该提示先点鱼');
    return session.toast.text;
});

test('选中后点「撒食」：选中保留，饲料照撒', function () {
    var env = setup();
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    var b = btnCenter(L.FEED_BTN);
    touch.tap(b.x, b.y, env);

    assert(env.state.view.selFish === t.f.id, '撒食不该把选中状态弄丢');
    assert(env.state.foods.length > 0, '应该掉下饲料');
    return '饲料 ' + env.state.foods.length + ' 颗 · 选中仍在';
});

test('选中后点「商店」：面板打开，选中保留', function () {
    var env = setup();
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    var b = btnCenter(L.SHOP_BTN);
    touch.tap(b.x, b.y, env);

    assert(session.sheetOpen === true, '商店面板应该打开');
    assert(env.state.view.selFish === t.f.id, '开商店不该把选中状态弄丢');
    return 'sheetOpen=' + session.sheetOpen;
});

test('再点同一条鱼：取消选中', function () {
    var env = setup();
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    touch.tap(t.x, t.y, env);

    assert(env.state.view.selFish === '', '再点一次应该取消选中');
    return 'selFish 已清空';
});

test('点水面空白：取消选中 + 撒食', function () {
    var env = setup();
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    /* 水里找一个离鱼足够远的点 */
    var px = 40;
    var py = Math.round((C.TANK_TOP + C.TANK_BOTTOM) / 2);
    var d = Math.sqrt(Math.pow(px - t.f.x, 2) + Math.pow(py - t.f.y, 2));
    assert(d > fishLib.sizeOf(t.f) * 0.62, '探针点太靠近鱼了，测试自身有问题');

    touch.tap(px, py, env);

    assert(env.state.view.selFish === '', '点空白应该取消选中');
    assert(env.state.foods.length > 0, '点水面应该撒食');
    return '取消选中 + 饲料 ' + env.state.foods.length + ' 颗';
});

test('点缸盖（水面上方）：不撒食', function () {
    var env = setup();
    var y = Math.round(C.TANK_TOP / 2);
    touch.tap(40, y, env);
    assert(env.state.foods.length === 0, '缸盖不是水面，不该掉饲料');
    return 'y=' + y + ' · 饲料 0 颗';
});

test('点底座空白（按钮之间那条缝）：不撒食、不清选中', function () {
    var env = setup();
    var t = fishAt(env);
    touch.tap(t.x, t.y, env);

    var x = Math.round(L.FEED_BTN.x + L.FEED_BTN.w / 2);
    var y = Math.round(C.BTN_Y - 9);          /* 缸底和按钮之间的 18px 缝 */
    touch.tap(x, y, env);

    assert(env.state.foods.length === 0, '底座不是水面，不该掉饲料');
    return 'y=' + y + ' · 饲料 0 颗';
});

test('连续卖两条：余额按两条身价累加', function () {
    var env = setup();
    env.state.fish.push(fishLib.create('gold_fish', { growth: 100, tank: 0 }));
    env.state.fish[1].x = 120;
    env.state.fish[1].y = 400;
    env.state.fish[0].x = 260;
    env.state.fish[0].y = 300;

    var before = env.state.coins.fish;
    var p0 = fishLib.sellPriceOf(env.state.fish[0]);
    var p1 = fishLib.sellPriceOf(env.state.fish[1]);

    touch.tap(260, 300, env);
    var b = btnCenter(L.SELL_BTN);
    touch.tap(b.x, b.y, env);

    touch.tap(120, 400, env);
    touch.tap(b.x, b.y, env);

    assert(env.state.fish.length === 0, '两条都该卖掉');
    assert(env.state.coins.fish === before + p0 + p1,
        '余额应为 ' + (before + p0 + p1) + '，实际 ' + env.state.coins.fish);
    return '+' + (p0 + p1) + ' → ' + env.state.coins.fish;
});

test('选中态整帧渲染不报错（光圈 + 橙色卖掉按钮）', function () {
    var env = setup();
    var renderer = require('../render/index.js');
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    assert(env.state.view.selFish === t.f.id, '前置条件：应该已经选中');

    /* 画两帧：选中光圈和加价按钮都在这个分支里，
     * 有未定义变量/错参数会在这里直接抛出来 */
    renderer.init(env.state);
    renderer.draw(env.state, session, 0.016);
    renderer.draw(env.state, session, 0.016);
    return '渲染两帧通过';
});

/* ---------------- 汇总 ---------------- */

function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
}

console.log('');
console.log('触摸链路测试');
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
