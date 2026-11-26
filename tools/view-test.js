/* ============================================================
 * tools/view-test.js · 鱼缸缩放 / 平移测试
 *
 * 覆盖两件容易出错的事：
 *   1. view 的坐标变换和屏幕 ↔ 缸内互逆，放大后点鱼仍点得中
 *   2. attach 的手势分发：点按钮、拖动、双击还原、双指捏合
 *
 * 运行：node tools/view-test.js
 * ============================================================ */

var store = {};
var noop = function () {};
var handlers = { start: null, move: null, end: null };

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

global.wx = {
    getWindowInfo: function () {
        return {
            windowWidth: 390, windowHeight: 844, pixelRatio: 2, statusBarHeight: 20,
            safeArea: { top: 20, bottom: 810, left: 0, right: 390 }
        };
    },
    createCanvas: function () { return { getContext: function () { return makeCtx(); } }; },
    getStorageSync: function (k) { return store[k] === undefined ? '' : JSON.parse(JSON.stringify(store[k])); },
    setStorageSync: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    removeStorageSync: function (k) { delete store[k]; },
    onShow: noop,
    onHide: noop,
    onTouchStart: function (cb) { handlers.start = cb; },
    onTouchMove: function (cb) { handlers.move = cb; },
    onTouchEnd: function (cb) { handlers.end = cb; }
};

var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var view = require('../ui/view.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');

/* ---------------- 断言 ---------------- */

var results = [];

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function near(a, b, tol, msg) {
    if (Math.abs(a - b) > tol) throw new Error(msg + '（' + a + ' vs ' + b + '）');
}

function test(name, fn) {
    try {
        var note = fn();
        results.push({ ok: true, name: name, note: note || '' });
    } catch (e) {
        results.push({ ok: false, name: name, note: e.message });
    }
}

function setup() {
    view.reset();
    session.sheetOpen = false;
    session.sheetEase = 0;
    session.sheetTab = 0;
    session.modal = null;
    session.toast = null;
    session.debug.open = false;
    session.debug.tapTimes.length = 0;

    var state = stateModule.bootstrapFresh();
    state.view.vp = C.viewport;
    state.coins.fish = 600;
    sim.ensurePlacement(state, C.viewport);

    var env = {
        state: state, session: session, viewport: C.viewport,
        sim: sim, saveNow: function () {}
    };
    touch.attach(env);
    return env;
}

function pts(list) {
    return { touches: list.map(function (p) { return { clientX: p[0], clientY: p[1] }; }) };
}

function one(p) {
    return { touches: [{ clientX: p[0], clientY: p[1] }] };
}

/* 单指手势：start / move / end 都传 [x, y] */
function gesture(pStart, pMove, pEnd) {
    handlers.start(one(pStart));
    if (pMove) handlers.move(one(pMove));
    handlers.end(one(pEnd || pMove || pStart));
}

function zoomCenter(r) {
    return [r.x + r.w / 2, r.y + r.h / 2];
}

/* ---------------- 用例 ---------------- */

test('捏合缩放：1× 下限、2× 上限', function () {
    setup();
    assert(view.state.zoom === 1, '初始应为 1×');
    assert(view.pinch(1.5) === 1.5, '×1.5 应到 1.5×');
    assert(view.pinch(2) === 2, '再放大应封顶 2×');
    assert(view.pinch(5) === 2, '超过 2× 仍应停在 2×');
    assert(view.pinch(0.1) === 1, '缩小应停在下限 1×');
    return '1× ⇄ 2× 夹紧';
});

test('缩放按钮已移除，布局里不再留命中区', function () {
    setup();
    assert(L.ZOOM_IN === undefined && L.ZOOM_OUT === undefined, '不应再导出缩放按钮矩形');
    assert(typeof L.ZOOM_BADGE === 'object', '只保留只读倍率角标');
    return '仅双指缩放 / 单指滑动';
});

test('平移被限制在玻璃内，1× 时不能拖动', function () {
    setup();
    view.setZoom(2);
    view.pan(1000, -1000);
    var g = view.glass;
    var mx = (g.x1 - g.x0) * (1 - 1 / view.state.zoom) / 2;
    var my = (g.y1 - g.y0) * (1 - 1 / view.state.zoom) / 2;
    near(view.state.x, mx, 0.001, 'x 应被夹到上限');
    near(view.state.y, -my, 0.001, 'y 应被夹到下限');
    view.reset();
    view.pan(50, 50);
    assert(view.state.x === 0 && view.state.y === 0, '1× 不该有偏移');
    return 'x ≤ ' + mx.toFixed(1) + ' · |y| ≤ ' + my.toFixed(1);
});

test('屏幕 ↔ 缸内坐标互逆（含放大和平移）', function () {
    setup();
    view.setZoom(2);
    view.pan(40, -25);
    var g = view.glass;
    var world = { x: 180, y: 320 };
    var sx = g.cx + (world.x - g.cx) * view.state.zoom + view.state.x;
    var sy = g.cy + (world.y - g.cy) * view.state.zoom + view.state.y;
    var back = view.toWorld(sx, sy);
    near(back.x, world.x, 1e-6, 'x 逆变换');
    near(back.y, world.y, 1e-6, 'y 逆变换');
    return '(' + sx + ',' + sy + ') → (' + back.x + ',' + back.y + ')';
});

test('apply() 只做 translate / scale / translate，不改其它状态', function () {
    setup();
    view.setZoom(1.5);
    view.pan(10, -10);
    var ops = [];
    var ctx = new Proxy({}, {
        get: function (t, k) {
            if (k === 'translate' || k === 'scale') {
                return function () {
                    var args = Array.prototype.slice.call(arguments);
                    ops.push([k].concat(args));
                };
            }
            if (k in t) return t[k];
            return noop;
        },
        set: function (t, k, v) { t[k] = v; return true; }
    });
    view.apply(ctx);
    assert(ops.length === 3, '应有三次变换调用，实际 ' + ops.length);
    assert(ops[0][0] === 'translate' && ops[1][0] === 'scale' && ops[2][0] === 'translate', '顺序不对');
    near(ops[1][1], 1.5, 1e-9, '缩放值');
    return ops.map(function (o) { return o.join(','); }).join(' | ');
});

test('单指滑动平移并带惯性，抬手不算点击', function () {
    var env = setup();
    view.setZoom(2);
    var foodsBefore = env.state.foods.length;
    var x0 = view.state.x;

    gesture([200, 300], [280, 340], [280, 340]);

    assert(view.state.x !== x0, '滑动应产生平移，实际 ' + view.state.x);
    assert(env.state.foods.length === foodsBefore, '滑动不该掉饲料');
    assert(!env.state.view.selFish, '滑动不该选中鱼');
    return 'offset=' + view.state.x.toFixed(0) + ',' + view.state.y.toFixed(0);
});

test('惯性：抬手后继续滑一段并逐渐衰减', function () {
    setup();
    view.setZoom(2);
    view.pan(10, 0);
    var x0 = view.state.x;
    view.fling(400, 0);
    view.update(0.05);
    assert(view.state.x > x0, '惯性应继续向前，实际 ' + view.state.x + ' vs ' + x0);
    assert(view.vel.x < 400 && view.vel.x > 0, '速度应衰减但不归零，实际 ' + view.vel.x);
    for (var i = 0; i < 60; i++) view.update(0.016);
    assert(view.vel.x === 0, '一秒后惯性应停下');
    var xEnd = view.state.x;
    view.reset();
    return 'x ' + x0.toFixed(1) + ' → ' + xEnd.toFixed(1);
});

test('1× 时滑动不会留下偏移（没有可移动空间）', function () {
    var env = setup();
    gesture([200, 300], [280, 340], [280, 340]);
    assert(view.state.x === 0 && view.state.y === 0, '1× 不该有偏移');
    assert(view.vel.x === 0 && view.vel.y === 0, '1× 不该保留惯性');
    return '偏移被夹紧到 0';
});

test('放大后拖动只平移，不撒食也不选中', function () {
    var env = setup();
    view.setZoom(2);
    var foodsBefore = env.state.foods.length;
    gesture([200, 300], [260, 330], [260, 330]);
    assert(view.state.x !== 0 || view.state.y !== 0, '拖动应产生平移');
    assert(env.state.foods.length === foodsBefore, '拖动不该掉饲料');
    assert(!env.state.view.selFish, '拖动不该选中鱼');
    return 'offset=' + view.state.x.toFixed(0) + ',' + view.state.y.toFixed(0);
});

test('放大后双击还原 1×，且偏移清零', function () {
    setup();
    view.setZoom(2);
    view.pan(60, 40);
    gesture([200, 320]);
    gesture([200, 320]);
    assert(view.state.zoom === 1, '双击应还原，实际 ' + view.state.zoom);
    assert(view.state.x === 0 && view.state.y === 0, '偏移应清零');
    return 'zoom=' + view.state.zoom;
});

test('双指捏合能连续放大，抬手后不再触发点击', function () {
    var env = setup();
    var foodsBefore = env.state.foods.length;
    handlers.start(pts([[170, 350], [270, 350]]));
    handlers.move(pts([[120, 350], [320, 350]]));
    handlers.end(pts([[320, 350]]));
    assert(view.state.zoom === 2, '距离翻倍应到 2×，实际 ' + view.state.zoom);
    assert(env.state.foods.length === foodsBefore, '捏合不该撒食');
    return 'zoom=' + view.state.zoom;
});

test('放大平移后点鱼仍能选中（命中走逆变换）', function () {
    var env = setup();
    view.setZoom(2);
    view.pan(40, -20);
    var f = env.state.fish[0];
    f.x = 160;
    f.y = 330;
    var g = view.glass;
    var sx = g.cx + (f.x - g.cx) * view.state.zoom + view.state.x;
    var sy = g.cy + (f.y - g.cy) * view.state.zoom + view.state.y;
    gesture([sx, sy]);
    assert(env.state.view.selFish === f.id,
        '放大后点鱼应选中，实际 ' + env.state.view.selFish);
    return '屏幕 (' + sx + ',' + sy + ') → 鱼 ' + f.id;
});

/* ---------------- 汇总 ---------------- */

console.log('');
console.log('鱼缸缩放专项测试');
console.log('----------------------------------------------------------------');
var pass = 0;
var fail = 0;
for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.ok) pass += 1; else fail += 1;
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + String(i + 1).padStart(3, ' ') + r.name);
    if (r.note) console.log('        ' + r.note);
}
console.log('----------------------------------------------------------------');
console.log('合计 ' + results.length + ' 项 · PASS ' + pass + ' · FAIL ' + fail);
console.log('');
if (fail) process.exitCode = 1;
