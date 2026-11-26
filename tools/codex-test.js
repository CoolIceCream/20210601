/* ============================================================
 * tools/codex-test.js · 图鉴专项测试
 *
 * 覆盖两条链路：
 *   数据层：收录时机、存档往返、老档补录、列表展示
 *   交互层：切到图鉴页、点格子开详情、关闭详情、详情吞点击
 *
 * 运行：node tools/codex-test.js
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

var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');
var shop = require('../core/shop.js');
var save = require('../core/save.js');
var codex = require('../core/codex.js');
var cfg = require('../config/index.js');

var vp = C.viewport;
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
function setup() {
    session.sheetOpen = false;
    session.sheetEase = 0;
    session.sheetTab = 0;
    session.codexDetail = null;
    session.modal = null;
    session.toast = null;
    session.debug.open = false;
    session.debug.tapTimes.length = 0;
    var state = stateModule.bootstrapFresh();
    state.view.vp = vp;
    state.coins.fish = 1000000;
    sim.ensurePlacement(state, vp);
    return {
        state: state, session: session, viewport: vp, sim: sim,
        saveNow: function () {}
    };
}
function center(r) { return Math.round(r.x + r.w / 2); }
function cY(r) { return Math.round(r.y + r.h / 2); }
function openCodex(env) {
    touch.tap(center(L.STORE_BTN), cY(L.STORE_BTN), env);
    env.session.sheetEase = 1;
    touch.tap(center(L.tabRect(2, 1)), cY(L.tabRect(2, 1)), env);
}

/* ---------------- 数据层 ---------------- */

test('开局第一条鱼自动进图鉴', function () {
    var s = stateModule.bootstrapFresh();
    var p = codex.progress(s);
    assert(p.found === 1, '开局应收录 1 条，实际 ' + p.found);
    assert(p.total === cfg.species.length, '总数应等于鱼种数');
    assert(codex.isFound(s, cfg.species[0].id), '小金鱼应已发现');
    return '收录 ' + p.found + '/' + p.total;
});

test('买卵开出鱼会收录，重复不重复计数', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 10000000;
    var first = shop.buyEgg(s, 'R');
    assert(first.ok, '买卵应成功');
    assert(codex.isFound(s, first.species.id), '开出的鱼应收录');
    var before = codex.table(s)[first.species.id].n;
    var second = shop.buyEgg(s, 'R');
    assert(second.ok, '第二次买卵应成功');
    var after = codex.table(s)[first.species.id].n;
    assert(after >= before, '累计条数不该减少');
    return first.species.name + ' 累计 ' + after + ' 条';
});

test('传奇卵只出鲨鱼或金鲤鱼，两档都进图鉴', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 100000000;
    var shark = 0;
    var koi = 0;

    /* M14 起传奇卵是 90/10 两档，单抽一次断言「必出鲨鱼」会 10% 概率翻车。
     * 这里连续抽到两档都出现（40 次内几乎必然），顺便每次都验库存放。 */
    for (var i = 0; i < 40 && !(shark && koi); i++) {
        var r = shop.buyEgg(s, 'LEGEND');
        assert(r.ok, '传奇卵应买得起：' + (r.reason || ''));
        var f = s.fish[s.fish.length - 1];
        if (r.species.id === 'reef_shark') {
            shark += 1;
            assert(codex.isFound(s, 'reef_shark'), '鲨鱼应进图鉴');
        } else if (r.species.id === 'gold_koi') {
            koi += 1;
            assert(codex.isFound(s, 'gold_koi'), '金鲤鱼应进图鉴');
        } else {
            assert(false, '传奇卵不该开出 ' + r.species.id);
        }
        shop.sellFish(s, f.id);   /* 买完就卖，腾鱼位接着抽 */
    }
    assert(shark > 0 && koi > 0, '两档产出都该出现过');
    return '鲨鱼 ' + shark + ' · 金鲤 ' + koi;
});

test('卖掉鱼后图鉴仍保留收录', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 1000000;
    var r = shop.buyEgg(s, 'R');
    var id = r.species.id;
    assert(codex.isFound(s, id), '买来应先收录');
    var f = s.fish[s.fish.length - 1];
    shop.sellFish(s, f.id);
    assert(codex.isFound(s, id), '卖掉后仍应算发现过');
    return '卖掉后收录保留';
});

test('存档往返：discovered 不丢', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 1000000;
    shop.buyEgg(s, 'SR');
    var expect = codex.foundCount(s);
    var payload = save.serialize(s);
    assert(payload.discovered && Object.keys(payload.discovered).length === expect,
        '存档应带 discovered');
    /* 直接走反序列化内部路径：构造 raw 再读 */
    var raw = JSON.parse(JSON.stringify(payload));
    store[save.KEY] = raw;
    var loaded = save.load();
    assert(loaded && loaded.state, '应能读档');
    assert(codex.foundCount(loaded.state) === expect, '读档后收录数应一致');
    return '往返后 ' + expect + ' 条';
});

test('老档无 discovered：用现有鱼补录', function () {
    var s = stateModule.bootstrapFresh();
    s.coins.fish = 1000000;
    shop.buyEgg(s, 'SR');
    var payload = save.serialize(s);
    delete payload.discovered;   /* 模拟老版本存档 */
    store[save.KEY] = JSON.parse(JSON.stringify(payload));
    var loaded = save.load();
    var live = {};
    loaded.state.fish.forEach(function (f) { live[f.speciesId] = true; });
    Object.keys(live).forEach(function (id) {
        assert(codex.isFound(loaded.state, id), '老档里的 ' + id + ' 应补录');
    });
    return '补录 ' + Object.keys(live).length + ' 种';
});

test('图鉴列表：未发现的鱼占位且打码', function () {
    var s = stateModule.bootstrapFresh();
    var list = codex.list(s);
    assert(list.length === cfg.species.length, '条目数应等于鱼种数');
    var found = list.filter(function (x) { return x.found; });
    var hidden = list.filter(function (x) { return !x.found; });
    assert(found.length === 1 && hidden.length === list.length - 1, '开局应只发现 1 条');
    assert(hidden[0].price > 0, '未发现条目仍应有价格数据（内部展示用）');
    return '已发现 ' + found.length + ' · 未发现 ' + hidden.length;
});

/* ---------------- 交互层 ---------------- */

test('点商店→图鉴页签，进入图鉴', function () {
    var env = setup();
    openCodex(env);
    assert(env.session.sheetOpen, '商店应打开');
    assert(env.session.sheetTab === 2, '应在图鉴页');
    return 'sheetTab = ' + env.session.sheetTab;
});

test('点图鉴格子打开详情', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(0, 1);
    touch.tap(center(r), cY(r), env);
    assert(env.session.codexDetail === 0, '应打开第 0 条详情');
    return 'codexDetail = ' + env.session.codexDetail;
});

test('详情浮层吞点击：点资料区不会切页或买鱼', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(0, 1);
    touch.tap(center(r), cY(r), env);
    var coins = env.state.coins.fish;
    var d = L.codexDetailRect(1);
    touch.tap(center(d), cY(d), env);
    assert(env.session.codexDetail === 0, '点卡片内不该关闭');
    assert(env.session.sheetTab === 2, '不该切页');
    assert(env.state.coins.fish === coins, '不该花钱');
    return '点击被详情吞掉';
});

test('点关闭按钮退出详情', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(1, 1);
    touch.tap(center(r), cY(r), env);
    assert(env.session.codexDetail === 1, '应打开第 1 条');
    var d = L.codexDetailRect(1);
    var cr = L.codexDetailClose(d);
    touch.tap(center(cr), cY(cr), env);
    assert(env.session.codexDetail == null, '应关闭详情');
    return '详情已关闭';
});

test('点卡片外关闭详情', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(0, 1);
    touch.tap(center(r), cY(r), env);
    touch.tap(20, 300, env);   /* 浮层外的图鉴格子 */
    assert(env.session.codexDetail == null, '点外面应关闭');
    return '点外部关闭';
});

test('详情打开时页签被浮层吞掉，关闭后可切页', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(0, 1);
    touch.tap(center(r), cY(r), env);
    assert(env.session.codexDetail === 0, '详情应先打开');
    /* 浮层吞掉面板内的一切点击，包括页签 */
    touch.tap(center(L.tabRect(0, 1)), cY(L.tabRect(0, 1)), env);
    assert(env.session.sheetTab === 2, '详情打开时不该切页');
    /* 关掉详情后页签恢复可用。
     * 面板高度随道具条数变化，页签有可能落在详情卡外，
     * 那一下就把详情关掉了 —— 所以这里先确认状态再点关闭按钮，
     * 否则会点空、甚至误触到下面的图鉴格子又打开一张详情。 */
    if (env.session.codexDetail != null) {
        var d = L.codexDetailRect(1);
        var cr = L.codexDetailClose(d);
        touch.tap(center(cr), cY(cr), env);
    }
    assert(env.session.codexDetail == null, '详情应能关掉');
    touch.tap(center(L.tabRect(0, 1)), cY(L.tabRect(0, 1)), env);
    assert(env.session.sheetTab === 0, '关闭详情后应能切回道具页');
    return '浮层阻塞正确';
});

test('图鉴格子全部可点开详情', function () {
    var env = setup();
    openCodex(env);
    var n = codex.totalCount();
    for (var i = 0; i < n; i++) {
        var r = L.codexRect(i, 1);
        touch.tap(center(r), cY(r), env);
        assert(env.session.codexDetail === i, '第 ' + i + ' 格应打开对应详情');
        var d = L.codexDetailRect(1);
        var cr = L.codexDetailClose(d);
        touch.tap(center(cr), cY(cr), env);
        assert(env.session.codexDetail == null, '第 ' + i + ' 格详情应能关掉');
    }
    return '逐格点开 ' + n + ' 条';
});

test('图鉴整页渲染不报错', function () {
    var env = setup();
    openCodex(env);
    var r = L.codexRect(0, 1);
    touch.tap(center(r), cY(r), env);
    require('../render/index.js').draw(sharedCtx, env.state, env.session);
    return '整帧渲染通过';
});

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('图鉴专项测试');
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
