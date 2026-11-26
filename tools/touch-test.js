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
    session.sysOpen = false;
    session.sysArmed = 0;
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
        saveNow: function () {},
        cleared: 0,
        clearSave: function () { env.cleared += 1; }
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

test('底栏「商店」：打开面板并对准商店页', function () {
    var env = setup();
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    var b = btnCenter(L.STORE_BTN);
    touch.tap(b.x, b.y, env);

    assert(session.sheetOpen === true, '商店面板应该打开');
    assert(session.sheetTab === 0, '应停在商店页，实际 ' + session.sheetTab);
    assert(env.state.view.selFish === t.f.id, '开面板不该把选中状态弄丢');
    return 'sheetOpen=' + session.sheetOpen + ' · tab=' + session.sheetTab;
});

test('底栏「仓库 / 鱼塘 / 图鉴」：各自对准页签', function () {
    var cases = [
        { r: L.BAG_BTN, tab: 4, name: '仓库' },
        { r: L.POND_BTN, tab: 3, name: '鱼塘' },
        { r: L.CODEX_BTN, tab: 2, name: '图鉴' }
    ];
    var notes = [];
    for (var i = 0; i < cases.length; i++) {
        var env = setup();
        var b = btnCenter(cases[i].r);
        touch.tap(b.x, b.y, env);
        assert(session.sheetOpen, cases[i].name + ' 应该打开面板');
        assert(session.sheetTab === cases[i].tab,
            cases[i].name + ' 应停在 ' + cases[i].tab + ' 页，实际 ' + session.sheetTab);
        notes.push(cases[i].name + '=' + session.sheetTab);
    }
    return notes.join(' · ');
});

test('底栏「系统」：打开系统层，不打开商店面板', function () {
    var env = setup();
    var b = btnCenter(L.SYS_BTN);
    touch.tap(b.x, b.y, env);

    assert(session.sysOpen === true, '系统层应该打开');
    assert(session.sheetOpen === false, '不该顺手打开商店面板');
    return 'sysOpen=' + session.sysOpen;
});

test('系统层：清档要点两次，点关闭不执行', function () {
    var env = setup();
    var b = btnCenter(L.SYS_BTN);
    touch.tap(b.x, b.y, env);

    var danger = btnCenter(L.sysBtnRect(0));
    touch.tap(danger.x, danger.y, env);
    assert(env.cleared === 0, '第一次点击只上膛，不该清档');
    assert(session.sysArmed > 0, '应进入上膛状态');
    assert(session.toast && session.toast.text.indexOf('再点一次') === 0, '应提示再点一次');

    touch.tap(danger.x, danger.y, env);
    assert(env.cleared === 1, '第二次点击应执行清档，实际 ' + env.cleared);
    assert(session.sysOpen === false, '清档后系统层应关闭');

    /* 关闭按钮：不触发清档 */
    env.session.sysOpen = true;
    env.session.sysArmed = 0;
    var close = btnCenter(L.sysBtnRect(1));
    touch.tap(close.x, close.y, env);
    assert(session.sysOpen === false, '关闭按钮应关掉系统层');
    assert(env.cleared === 1, '关闭不该清档');
    return 'cleared=' + env.cleared;
});

test('底栏没有「卖掉」：点鱼只选中，鱼和余额都不动', function () {
    var env = setup();
    var t = fishAt(env);
    var before = env.state.coins.fish;

    touch.tap(t.x, t.y, env);
    /* 原来卖掉的坐标现在归「仓库」按钮，点了只会开仓库页 */
    var b = btnCenter(L.BAG_BTN);
    touch.tap(b.x, b.y, env);

    assert(env.state.coins.fish === before, '不该进账');
    assert(env.state.fish.length === 1, '鱼不该消失');
    assert(session.sheetTab === 4, '应该打开仓库页');
    return '余额 ' + env.state.coins.fish + ' · 鱼 ' + env.state.fish.length;
});

test('点鱼 → 信息卡 → 捞出：鱼进仓库、缸里清空、选中清掉', function () {
    var env = setup();
    var sink = require('../render/sell.js');

    var t = fishAt(env);
    touch.tap(t.x, t.y, env);
    assert(env.state.view.selFish === t.f.id, '点鱼应先选中并弹卡');

    var info = sink.cardHitOf(env.state);
    assert(info && info.buttons.length >= 1, '应该有一张信息卡');
    var dump = info.buttons[0];
    assert(dump.key === 'dump' && dump.enabled, '第一个按钮应是「捞出到仓库」');

    var bx = Math.round(dump.rect.x + dump.rect.w / 2);
    var by = Math.round(dump.rect.y + dump.rect.h / 2);
    touch.tap(bx, by, env);

    assert(env.state.fish.length === 0, '缸里应该空出来');
    assert(env.state.caught.length === 1, '仓库里应该多一条');
    assert(env.state.caught[0].id === t.f.id, '捞出的应该是选中的那条');
    assert(env.state.view.selFish === '', '捞出后应清掉选中');
    return '鱼缸 → 仓库 · 仓库存 ' + env.state.caught.length + ' 条';
});

test('点信息卡空白：不清选中，也不撒食', function () {
    var env = setup();
    var sink = require('../render/sell.js');

    var t = fishAt(env);
    touch.tap(t.x, t.y, env);

    var info = sink.cardHitOf(env.state);
    var before = env.state.foods.length;
    /* 卡片左上角内 8px：明确在按钮之外、又还在卡面上 */
    touch.tap(info.rect.x + 8, info.rect.y + 8, env);

    assert(env.state.view.selFish === t.f.id, '卡面点击不该清选中');
    assert(env.state.foods.length === before, '卡上不该撒食');
    assert(env.state.fish.length === 1, '也不该动鱼');
    return '选中保留 · 饲料 ' + env.state.foods.length + ' 颗';
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

test('点按钮之间的缝（底栏已删，缝也是水）：照样撒食', function () {
    var env = setup();
    var t = fishAt(env);
    touch.tap(t.x, t.y, env);

    /* M13 把底栏那条木板删掉了，鱼缸一直延伸到底部：
     * 两枚悬浮按钮之间就是水面，点下去应该撒食，而不是被当成底座吞掉。 */
    var x = Math.round((L.STORE_BTN.x + L.STORE_BTN.w + L.BAG_BTN.x) / 2);
    var y = Math.round(C.BTN_Y + 24);
    touch.tap(x, y, env);

    assert(env.state.foods.length > 0, '按钮之间的缝应该算水面，实际 0 颗饲料');
    assert(session.sheetOpen === false, '不该误开面板');
    return 'x=' + x + ' · 饲料 ' + env.state.foods.length + ' 颗';
});

test('选中态整帧渲染不报错（光圈 + 信息卡 + 五格底栏）', function () {
    var env = setup();
    var renderer = require('../render/index.js');
    var t = fishAt(env);

    touch.tap(t.x, t.y, env);
    assert(env.state.view.selFish === t.f.id, '前置条件：应该已经选中');

    /* 画两帧：选中光圈、信息卡和五格底栏都在这个分支里，
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
