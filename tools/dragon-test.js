/* ============================================================
 * tools/dragon-test.js · 金鲤鱼化龙专项测试（M14）
 *
 * 覆盖：
 *   产出：传奇卵 10% 出金鲤鱼、普通卵池/鱼塘池都排除它
 *   词条：龙鳞是金鲤鱼专属、普通鱼 roll 不到、金鲤约 55% 自带
 *   进化：无龙鳞不能吞、无猎物不能吞、吞一条升一阶、三阶成真龙
 *   目标：只吃 evo 0 的同族、仓库优先、自己不能吃自己
 *   数值：每一阶体型与卖价都放大，卵价基准不跟着涨
 *   存档：evo 往返保留，老档补 0
 *   捞出：缸 → 仓库，鱼位释放、选中清掉
 *   渲染 / 触摸：信息卡两颗按钮、点吞噬真的升阶
 *
 * 运行：node tools/dragon-test.js
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
var pond = require('../core/pond.js');
var dragon = require('../core/dragon.js');
var save = require('../core/save.js');
var sim = require('../core/sim.js');
var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var renderer = require('../render/index.js');
var sink = require('../render/sell.js');

var vp = C.viewport;
var results = [];
function test(name, fn) { results.push({ name: name, fn: fn }); }
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function center(r) { return Math.round(r.x + r.w / 2); }
function cY(r) { return Math.round(r.y + r.h / 2); }

var KOI = 'gold_koi';
var SCALE = dragon.KEY_TRAIT;

function resetSession() {
    session.sheetOpen = false;
    session.sheetEase = 0;
    session.sheetTab = 0;
    session.codexDetail = null;
    session.bagSels = [];
    session.modal = null;
    session.toast = null;
    session.sysOpen = false;
    session.sysArmed = 0;
    session.breedOpen = false;
    session.debug.open = false;
}

function setup() {
    resetSession();
    var s = stateModule.create();
    s.coins.fish = 500000;
    s.fish = [];
    s.caught = [];
    s.hatchery = [];
    s.eggs = [];
    s.shellLv = 0;
    s.view.selFish = '';
    return { state: s, session: session, viewport: vp, sim: sim, saveNow: noop };
}

/* 造一条金鲤鱼：默认成鱼、带龙鳞 L2 */
function makeKoi(opts) {
    opts = opts || {};
    var traits = opts.traits;
    if (!traits) traits = opts.scale === false ? [{ id: 'fast_grow', lv: 2 }] : [{ id: SCALE, lv: 2 }];
    var f = fishLib.create(KOI, {
        growth: opts.growth == null ? 100 : opts.growth,
        sex: opts.sex || 'f',
        traits: traits,
        tank: opts.tank || 0,
        evo: opts.evo || 0
    });
    if (opts.x != null) f.x = opts.x;
    if (opts.y != null) f.y = opts.y;
    return f;
}

/* ---------------- 产出 ---------------- */

test('金鲤鱼只从传奇卵出：普通 SSR 池与鱼塘池都不含它', function () {
    var pool = shop.rarityPool('SSR');
    for (var i = 0; i < pool.list.length; i++) {
        assert(pool.list[i].id !== KOI, '普通 SSR 池不该有金鲤鱼');
    }
    var s = setup().state;
    var pondPool = pond.poolOf(s);
    for (var k = 0; k < pondPool.length; k++) {
        assert(pondPool[k].id !== KOI, '鱼塘池不该有金鲤鱼');
    }
    /* 传奇卵的 2000 次里必须出过金鲤鱼 */
    var n = 0;
    for (var j = 0; j < 2000; j++) {
        if (shop.rollInRarity('LEGEND').id === KOI) n += 1;
    }
    assert(n > 100 && n < 300, '传奇卵 2000 次出金鲤应约 200 条，实际 ' + n);
    return '普通池 0 条 · 传奇卵 2000 次出 ' + n + ' 条';
});

test('鱼种表：金鲤鱼是 SSR / 传奇专属 / 三阶进化', function () {
    var sp = fishLib.speciesById(KOI);
    assert(sp.name === '金鲤鱼', '名字应为金鲤鱼，实际 ' + sp.name);
    assert(sp.rarity === 'SSR', '应为 SSR');
    assert(sp.legendOnly === true, '应标记为传奇卵专属');
    assert(sp.evo && sp.evo.stages.length === 4, '应有 4 个阶段（含初始）');
    assert(fishLib.maxEvoOf(sp) === 3, '最高进化阶应为 3');
    return sp.name + ' · 阶段 ' + sp.evo.stages.map(function (x) { return x.name; }).join(' → ');
});

/* ---------------- 词条 ---------------- */

test('龙鳞是金鲤鱼专属：普通鱼 roll 2000 次都抽不到', function () {
    var pool = [fishLib.speciesById('gold_fish'), fishLib.speciesById('gold_lamp'), fishLib.speciesById('gold_dragon')];
    for (var i = 0; i < 2000; i++) {
        var sp = pool[i % pool.length];
        var tr = fishLib.rollTraits(sp);
        for (var k = 0; k < tr.length; k++) {
            assert(tr[k].id !== SCALE, sp.id + ' 不该 roll 到龙鳞');
        }
    }
    return '3 种普通鱼 × 2000 次 · 龙鳞 0 条';
});

test('金鲤鱼约 55% 天生带龙鳞，且最多两个词条', function () {
    var sp = fishLib.speciesById(KOI);
    var withScale = 0;
    var N = 3000;
    for (var i = 0; i < N; i++) {
        var tr = fishLib.rollTraits(sp);
        assert(tr.length <= 2, '金鲤鱼最多 2 个词条，实际 ' + tr.length);
        var seen = {};
        for (var k = 0; k < tr.length; k++) {
            assert(!seen[tr[k].id], '同一条鱼不该重复词条');
            seen[tr[k].id] = 1;
            if (tr[k].id === SCALE) withScale += 1;
        }
    }
    var rate = withScale / N;
    assert(rate > 0.52 && rate < 0.58, '龙鳞概率应约 55%，实测 ' + (rate * 100).toFixed(1) + '%');
    return '3000 条金鲤鱼 · 带龙鳞 ' + (rate * 100).toFixed(1) + '%';
});

test('龙鳞也吃 Σlv 的卖价加成（不影响它是钥匙这件事）', function () {
    var withScale = makeKoi({ traits: [{ id: SCALE, lv: 3 }] });
    var plain = makeKoi({ traits: [{ id: 'fast_grow', lv: 3 }] });
    assert(fishLib.sellPriceOf(withScale, 0) === fishLib.sellPriceOf(plain, 0),
        '同等级的词条卖价应一致（都按 Σlv 算）');
    return 'Σlv 3 · 卖价 ' + fishLib.sellPriceOf(withScale, 0);
});

/* ---------------- 进化校验 ---------------- */

test('不带龙鳞的金鲤鱼不能吞：reason=no_scale', function () {
    var env = setup();
    var a = makeKoi({ scale: false });
    env.state.fish.push(a, makeKoi());
    var st = dragon.statusOf(env.state, a.id);
    assert(!st.ok && st.reason === 'no_scale', '应因缺龙鳞被拒，实际 ' + st.reason);
    var r = dragon.devour(env.state, a.id);
    assert(!r.ok && r.reason === 'no_scale', '吞噬也应被拒');
    assert(env.state.fish.length === 2, '不该吃掉任何鱼');
    return '缺龙鳞 · 鱼还是 ' + env.state.fish.length + ' 条';
});

test('带龙鳞但没同族：reason=no_prey，不会误吃别的鱼', function () {
    var env = setup();
    var a = makeKoi();
    env.state.fish.push(a, fishLib.create('gold_fish', { growth: 100, tank: 0 }));
    var st = dragon.statusOf(env.state, a.id);
    assert(!st.ok && st.reason === 'no_prey', '应因没猎物被拒，实际 ' + st.reason);
    var r = dragon.devour(env.state, a.id);
    assert(!r.ok, '不该成功');
    assert(env.state.fish.length === 2, '小金鱼不该被吃');
    return '无同族 · 小金鱼安全';
});

test('只有 evo 0 的同族能被吃：已进化的不吃', function () {
    var env = setup();
    var a = makeKoi();
    var b = makeKoi({ evo: 1 });
    env.state.fish.push(a, b);
    var list = dragon.preyListOf(env.state, a.id);
    assert(list.length === 0, '已进化的同族不该成为猎物，实际 ' + list.length);
    return 'evo1 的同胞不会被吃';
});

/* ---------------- 吞噬执行 ---------------- */

test('吞噬一次：吃掉仓库里最弱的一条、升到 evo 1', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ growth: 100 });
    s.fish.push(a);

    var weak = makeKoi({ growth: 12 });
    var strong = makeKoi({ growth: 60 });
    s.caught.push(strong, weak);

    var r = dragon.devour(s, a.id);
    assert(r.ok, '吞噬应成功：' + r.reason);
    assert(r.evo === 1, '应升到 evo 1，实际 ' + r.evo);
    assert(r.stage === '金纹鲤', '阶段名应为金纹鲤，实际 ' + r.stage);
    assert(!r.becameDragon, '一阶还不是龙');
    assert(a.evo === 1, '目标鱼的 evo 应为 1');
    assert(s.caught.length === 1, '仓库应少一条');
    assert(s.caught[0].id === strong.id, '应吃掉成长更低的那条');
    assert(s.fish.length === 1, '缸里只该剩目标鱼');
    return '吃掉 ' + r.preyName + ' · ' + r.stage + '（剩 ' + r.need + ' 阶）';
});

test('仓库没有同族时吃缸里的，且不会吃自己', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ growth: 100 });
    var b = makeKoi({ growth: 40, sex: 'm' });
    s.fish.push(a, b);

    var list = dragon.preyListOf(s, a.id);
    assert(list.length === 1 && list[0].fish.id === b.id, '唯一猎物应是缸里另一条');

    var r = dragon.devour(s, a.id);
    assert(r.ok, '应成功');
    assert(s.fish.length === 1 && s.fish[0].id === a.id, '只剩目标鱼，吃掉的不是自己');
    return '吃掉同缸金鲤 · 剩 ' + s.fish.length + ' 条';
});

test('连吞三条化龙：真龙、卖价与体型都放大', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi();
    s.fish.push(a);
    for (var i = 0; i < 3; i++) s.caught.push(makeKoi({ growth: 20 + i }));

    var basePrice = fishLib.sellPriceOf(a, 0);
    var baseSize = fishLib.sizeOf(a);

    var r1 = dragon.devour(s, a.id);
    var r2 = dragon.devour(s, a.id);
    var r3 = dragon.devour(s, a.id);
    assert(r1.ok && r2.ok && r3.ok, '三次吞噬都应成功');
    assert(r3.becameDragon, '第三次应化龙');
    assert(r3.stage === '真龙', '阶段名应为真龙，实际 ' + r3.stage);
    assert(r3.evo === 3, '应到 evo 3');

    var sp = fishLib.speciesById(KOI);
    var mul = sp.evo.stages[3].mul;
    var got = fishLib.sellPriceOf(a, 0);
    var want = basePrice * mul;
    assert(Math.abs(got - want) / want < 0.01,
        '真龙卖价应约为初始的 ' + mul + ' 倍（' + basePrice + ' → ' + got + '）');
    assert(fishLib.sizeOf(a) > baseSize, '真龙体型应更大');
    assert(a.hunger > 0, '吞噬后应补饱食');
    return '卖 ' + basePrice + ' → ' + fishLib.sellPriceOf(a, 0) +
        ' · 体型 ' + baseSize.toFixed(0) + ' → ' + fishLib.sizeOf(a).toFixed(0);
});

test('到顶后不能再吞：reason=max，按钮置灰', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ evo: 3 });
    s.fish.push(a, makeKoi());
    var st = dragon.statusOf(s, a.id);
    assert(!st.ok && st.reason === 'max', '应到顶，实际 ' + st.reason);
    s.view.selFish = a.id;
    var btns = sink.buttonsOf(s, a);
    assert(btns.length === 2 && btns[1].key === 'devour' && !btns[1].enabled,
        '真龙的第二颗按钮应置灰');
    return '真龙 · 已满阶';
});

test('卵价基准不吃进化：eggValueOf 与 evo 无关', function () {
    var sp = fishLib.speciesById(KOI);
    var base = fishLib.eggValueOf(sp);
    var a = makeKoi({ evo: 3 });
    /* 鱼本身的卖价变贵，但卵价基准是鱼种属性，不该被某条鱼的状态影响 */
    assert(fishLib.eggValueOf(sp) === base, '卵价基准应稳定');
    assert(fishLib.sellPriceOf(a, 0) > fishLib.sellPriceOf(makeKoi({ evo: 0 }), 0),
        '进化体比初始形态值钱');
    return '卵价 ' + Math.round(base) + ' · 真龙卖 ' + fishLib.sellPriceOf(a, 0);
});

/* ---------------- 存档 ---------------- */

test('存档往返：evo 保留，老档（无 ev）读成 0', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ evo: 2 });
    s.fish.push(a);
    save.save(s);

    var loaded = save.load();
    assert(loaded && loaded.state, '应能读回存档');
    var f = loaded.state.fish[0];
    assert(f && f.evo === 2, 'evo 应为 2，实际 ' + (f && f.evo));
    assert(fishLib.evoStageName(f) === '蛟', '读回后阶段名应为蛟');

    /* 模拟 v6 老档：把 ev 字段删掉，读回来应是 0 */
    var raw = save.serialize(s);
    delete raw.fish[0].ev;
    store['aquarium_save'] = raw;
    var old = save.load();
    assert(old && old.state.fish[0].evo === 0, '老档应补成 evo 0');
    return 'evo 2 往返一致 · 老档补 0';
});

/* ---------------- 捞出 ---------------- */

test('捞出到仓库：鱼位释放、仓库多一条、坐标清零', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi();
    a.x = 120;
    a.y = 300;
    s.fish.push(a);
    s.view.selFish = a.id;

    var r = pond.dumpToBag(s, a.id);
    assert(r.ok, '捞出应成功：' + r.reason);
    assert(s.fish.length === 0, '缸里应该空出来');
    assert(s.caught.length === 1 && s.caught[0].id === a.id, '仓库应多一条');
    assert(s.caught[0].x === 0 && s.caught[0].y === 0, '仓库里的鱼坐标应清零');
    assert(s.view.selFish === '', '选中应被清掉');
    return r.name + ' 进仓库 · 鱼缸 ' + s.fish.length + ' 条';
});

test('捞出后能原样放回鱼缸（位置由 ensurePlacement 重排）', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ evo: 1 });
    s.fish.push(a);
    pond.dumpToBag(s, a.id);
    var back = pond.moveToTank(s, a.id);
    assert(back.ok, '应能放回：' + back.reason);
    assert(s.fish.length === 1 && s.fish[0].id === a.id, '应回到缸里');
    assert(s.fish[0].evo === 1, '进化阶不该在搬运中丢失');
    return '往返一致 · evo ' + s.fish[0].evo;
});

/* ---------------- 渲染 / 触摸 ---------------- */

test('渲染：选中金鲤鱼整帧不报错，卡片两颗按钮', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ evo: 2 });
    a.x = 200;
    a.y = 400;
    s.fish.push(a, makeKoi({ growth: 40 }));
    s.view.selFish = a.id;

    renderer.init(s);
    for (var i = 0; i < 3; i++) renderer.draw(s, session, 0.016);

    var info = sink.cardHitOf(s);
    assert(info, '应有一张信息卡');
    assert(info.buttons.length === 2, '进化线应有 2 颗按钮，实际 ' + info.buttons.length);
    assert(info.buttons[1].key === 'devour' && info.buttons[1].enabled, '吞噬按钮应可用');
    return '蛟 · 按钮 ' + info.buttons.map(function (b) { return b.label; }).join(' / ');
});

test('触摸：点信息卡「吞噬」真的升阶并吃掉一条', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi({ growth: 100 });
    a.x = 200;
    a.y = 380;
    s.fish.push(a);
    s.caught.push(makeKoi({ growth: 30 }));

    touch.tap(a.x, a.y, env);           /* 选中 → 弹卡 */
    assert(s.view.selFish === a.id, '应先选中');

    var info = sink.cardHitOf(s);
    var btn = info.buttons[1];
    assert(btn && btn.key === 'devour' && btn.enabled, '吞噬按钮应可点');

    touch.tap(center(btn.rect), cY(btn.rect), env);

    assert(a.evo === 1, '点完 evo 应为 1，实际 ' + a.evo);
    assert(s.caught.length === 0, '仓库里的同族应被吃掉');
    assert(session.toast && /进化/.test(session.toast.text), '应飘出进化提示');
    return '点一下 · ' + a.evo + ' 阶 · ' + session.toast.text;
});

test('触摸：点「捞出」把鱼送进仓库', function () {
    var env = setup();
    var s = env.state;
    var a = makeKoi();
    a.x = 200;
    a.y = 360;
    s.fish.push(a);

    touch.tap(a.x, a.y, env);
    var info = sink.cardHitOf(s);
    var dump = info.buttons[0];
    assert(dump.key === 'dump', '第一颗按钮应是捞出');
    touch.tap(center(dump.rect), cY(dump.rect), env);

    assert(s.fish.length === 0, '缸里应空');
    assert(s.caught.length === 1, '仓库应有一条');
    assert(s.view.selFish === '', '选中应清掉');
    return '捞出一气呵成 · 仓库 ' + s.caught.length + ' 条';
});

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('金鲤鱼化龙专项测试');
console.log('----------------------------------------------------------------');
var pass = 0;
var fail = 0;
results.forEach(function (r, i) {
    var ok = true;
    var note = '';
    try {
        note = r.fn();
    } catch (e) {
        ok = false;
        note = e.message;
    }
    if (ok) pass += 1; else fail += 1;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + String(i + 1).padStart(3, ' ') + ' ' + r.name);
    if (note) console.log('        ' + note);
});
console.log('----------------------------------------------------------------');
console.log('合计 ' + results.length + ' 项 · PASS ' + pass + ' · FAIL ' + fail);
console.log('');
if (fail) process.exitCode = 1;
