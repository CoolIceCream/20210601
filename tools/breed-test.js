/* ============================================================
 * tools/breed-test.js · 繁育专项测试（M12）
 *
 * 覆盖：
 *   性别：每条鱼都有 50/50 的 m/f、老档缺字段时随机补
 *   词条：分级结构、同鱼不重复、上限随稀有度、卖价按 Σlv
 *   校验：同一条 / 性别反 / 未成鱼 / 鲨鱼 / 槽满 / 缸满 / 缺钱 / 缺饵
 *   执行：扣钱扣饵扣饱食、产卵进槽、双亲进疲劳
 *   孵化：到期落进培育缸、缸满时留在槽里、子代定种跟随雌鱼
 *   遗传：同种升级率更高、等级不超上限、词条不重复
 *   词条联动：速繁缩时、双生产两条
 *   培育缸：放缸、卖出、容量
 *   存档：往返保留 sex / lv / hatchery / nursery，v5 老档可读
 *   渲染：繁育浮层 / 选鱼列表 / 子代详情整帧不报错
 *   触摸：打开浮层、选亲本、开始繁育、点培育缸
 *
 * 运行：node tools/breed-test.js
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
var breed = require('../core/breed.js');
var storage = require('../core/storage.js');
var save = require('../core/save.js');
var wallet = require('../core/wallet.js');
var sim = require('../core/sim.js');
var C = require('../render/canvas.js');
var L = require('../ui/layout.js');
var touch = require('../ui/touch.js');
var session = require('../ui/session.js');
var renderer = require('../render/index.js');

var vp = C.viewport;
var results = [];
function test(name, fn) { results.push({ name: name, fn: fn }); }
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function near(a, b, tol, msg) {
    if (Math.abs(a - b) > tol) throw new Error(msg + '（实际 ' + a + '，期望 ' + b + '±' + tol + '）');
}
function center(r) { return Math.round(r.x + r.w / 2); }
function cY(r) { return Math.round(r.y + r.h / 2); }

function resetSession() {
    session.sheetOpen = true;
    session.sheetEase = 1;
    session.sheetTab = 4;
    session.codexDetail = null;
    session.bagSels = [];
    session.modal = null;
    session.toast = null;
    session.sysOpen = false;
    session.sysArmed = 0;
    session.breedOpen = false;
    session.breedMother = '';
    session.breedFather = '';
    session.breedPick = '';
    session.nurseryDetail = '';
    session.debug.open = false;
}

function setup() {
    resetSession();
    var s = stateModule.create();
    s.coins.fish = 100000;
    s.bag.bait = 20;
    s.fish = [];
    s.caught = [];
    s.hatchery = [];
    s.nursery = [];
    s.shellLv = 0;
    return {
        state: s,
        session: session,
        viewport: vp,
        sim: sim,
        saveNow: function () {}
    };
}

/* 造一条成鱼并塞进指定容器 */
function adult(s, speciesId, sex, traits, zone) {
    var f = fishLib.create(speciesId, {
        growth: 100,
        sex: sex,
        traits: traits || [],
        hunger: 100,
        mood: 100
    });
    f.x = 120;
    f.y = 300;
    if (zone === 'bag') s.caught.push(f);
    else s.fish.push(f);
    return f;
}

/* ============================================================
 * 用例
 * ============================================================ */

test('性别：每条鱼都有 m/f，长期接近 50/50', function () {
    var n = 2000;
    var m = 0;
    var f = 0;
    for (var i = 0; i < n; i++) {
        var x = fishLib.create('gold_fish', { growth: 10 });
        assert(x.sex === 'm' || x.sex === 'f', '性别必须是 m 或 f，实际 ' + x.sex);
        if (x.sex === 'm') m += 1; else f += 1;
    }
    var rate = m / n;
    assert(rate > 0.44 && rate < 0.56, '公鱼比例应在 50% 附近，实际 ' + (rate * 100).toFixed(1) + '%');
    return '公 ' + m + ' / 母 ' + f;
});

test('性别：指定 sex 时原样保留', function () {
    var a = fishLib.create('gold_fish', { growth: 10, sex: 'f' });
    var b = fishLib.create('gold_fish', { growth: 10, sex: 'm' });
    assert(a.sex === 'f' && b.sex === 'm', '指定性别应被保留');
    return 'f / m 均保留';
});

test('词条：新鱼按稀有度给槽位，等级不超上限，L5 不掉落', function () {
    var rMax = 0;
    var sMax = 0;
    for (var i = 0; i < 400; i++) {
        var r = fishLib.rollTraits(fishLib.speciesById('gold_fish'));
        assert(r.length === 1, 'R 应 1 槽，实际 ' + r.length);
        rMax = Math.max(rMax, r[0].lv);

        var s = fishLib.rollTraits(fishLib.speciesById('dusk_betta'));
        assert(s.length === 2, 'SSR 应 2 槽，实际 ' + s.length);
        assert(s[0].id !== s[1].id, '同一条鱼不该有两个相同词条');
        sMax = Math.max(sMax, s[0].lv, s[1].lv);
    }
    assert(rMax <= 3, 'R 上限 L3，实际 L' + rMax);
    assert(sMax <= 4, '自然掉落上限 L4，实际 L' + sMax);
    return 'R 上限 L' + rMax + ' · SSR 上限 L' + sMax;
});

test('词条：卖价 = 1 + 0.06 × Σlv', function () {
    var a = fishLib.create('gold_fish', { growth: 100, traits: [] });
    var b = fishLib.create('gold_fish', { growth: 100, traits: [{ id: 'gold_scale', lv: 3 }] });
    near(fishLib.sellPriceOf(b) / fishLib.sellPriceOf(a), 1.18, 0.02, 'L3 应 +18%');
    assert(fishLib.traitSumOf(b) === 3, 'Σlv 应为 3');
    return '×' + (fishLib.sellPriceOf(b) / fishLib.sellPriceOf(a)).toFixed(3);
});

test('校验：同一条鱼不能自己配', function () {
    var env = setup();
    var a = adult(env.state, 'gold_lamp', 'f');
    var r = breed.canBreed(env.state, a.id, a.id);
    assert(!r.ok && r.reason === 'same', '应判定为同一条，实际 ' + r.reason);
    return r.text;
});

test('校验：雌雄位置不能反', function () {
    var env = setup();
    var m = adult(env.state, 'gold_lamp', 'm');
    var f = adult(env.state, 'gold_lamp', 'f');
    var r = breed.canBreed(env.state, m.id, f.id);
    assert(!r.ok && r.reason === 'sex', '左边必须是雌鱼，实际 ' + r.reason);
    return r.text;
});

test('校验：未成鱼不能繁育', function () {
    var env = setup();
    var f = fishLib.create('gold_lamp', { growth: 60, sex: 'f' });
    var m = adult(env.state, 'gold_lamp', 'm');
    env.state.fish.push(f);
    var r = breed.canBreed(env.state, f.id, m.id);
    assert(!r.ok && r.reason === 'grow', '未成鱼应被拦，实际 ' + r.reason);
    return r.text;
});

test('校验：小鲨鱼不参与繁育', function () {
    var env = setup();
    var s = adult(env.state, 'reef_shark', 'f');
    var m = adult(env.state, 'gold_lamp', 'm');
    var r = breed.canBreed(env.state, s.id, m.id);
    assert(!r.ok && r.reason === 'predator', '鲨鱼应被拦，实际 ' + r.reason);
    return r.text;
});

test('校验：钱不够 / 鱼饵不够分别拦下', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f');   /* SR 雌 → 2000 金币 */
    var m = adult(env.state, 'gold_fish', 'm');
    env.state.coins.fish = 100;
    var r1 = breed.canBreed(env.state, f.id, m.id);
    assert(!r1.ok && r1.reason === 'poor', '钱不够应拦，实际 ' + r1.reason);

    env.state.coins.fish = 100000;
    env.state.bag.bait = 1;
    var r2 = breed.canBreed(env.state, f.id, m.id);
    assert(!r2.ok && r2.reason === 'bait', '鱼饵不够应拦，实际 ' + r2.reason);
    return 'poor / bait 都拦住';
});

test('校验：孵化槽满了不能再产卵', function () {
    var env = setup();
    var f = adult(env.state, 'gold_fish', 'f');
    var m = adult(env.state, 'gold_fish', 'm');
    for (var i = 0; i < cfg.breed.slots; i++) {
        env.state.hatchery.push({
            id: 'x' + i, speciesId: 'gold_fish', sex: 'f', traits: [],
            startAt: Date.now(), hatchAt: Date.now() + 999000, seconds: 180, twin: false
        });
    }
    var r = breed.canBreed(env.state, f.id, m.id);
    assert(!r.ok && r.reason === 'slots', '槽满应拦，实际 ' + r.reason);
    return r.text;
});

test('校验：培育缸满了不能开始孵化', function () {
    var env = setup();
    var f = adult(env.state, 'gold_fish', 'f');
    var m = adult(env.state, 'gold_fish', 'm');
    var slots = breed.nurserySlotsOf(env.state);
    for (var i = 0; i < slots; i++) {
        env.state.nursery.push(fishLib.create('gold_fish', { growth: 10, sex: 'f' }));
    }
    var r = breed.canBreed(env.state, f.id, m.id);
    assert(!r.ok && r.reason === 'nursery', '培育缸满应拦，实际 ' + r.reason);
    return r.text;
});

test('执行：扣钱、扣鱼饵、扣饱食，蛋进槽，双亲进疲劳', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f');    /* SR：2000 金币 */
    var m = adult(env.state, 'gold_fish', 'm');
    var coin0 = env.state.coins.fish;
    var bait0 = env.state.bag.bait;
    var hunger0 = f.hunger;

    var r = breed.breed(env.state, f.id, m.id);
    assert(r.ok, '应该能繁育：' + (r.text || ''));
    assert(env.state.coins.fish === coin0 - 2000, '应扣 2000，实际差 ' + (coin0 - env.state.coins.fish));
    assert(env.state.bag.bait === bait0 - cfg.breed.baitCost, '应扣鱼饵 ' + cfg.breed.baitCost);
    assert(f.hunger === hunger0 - cfg.breed.hungerCost, '雌鱼饱食应 −' + cfg.breed.hungerCost);
    assert(env.state.hatchery.length === 1, '孵化槽应有 1 颗蛋');
    assert(r.seconds >= 60 && r.seconds <= 180, '孵化时长应在合理区间，实际 ' + r.seconds);
    assert(breed.fatigueLeft(f) > 0 && breed.fatigueLeft(m) > 0, '两条亲本都应疲劳');
    return '金币 −2000 · 饵 −3 · 饱食 −40 · ' + r.seconds + 's';
});

test('执行：子代鱼种跟随雌鱼，性别随机', function () {
    var env = setup();
    var f = adult(env.state, 'peach_koi', 'f');
    var m = adult(env.state, 'gold_dragon', 'm');
    var r = breed.breed(env.state, f.id, m.id);
    assert(r.ok, '应该能繁育');
    assert(r.egg.speciesId === 'peach_koi', '子代应是雌鱼鱼种，实际 ' + r.egg.speciesId);
    assert(r.egg.sex === 'm' || r.egg.sex === 'f', '蛋里应带性别');
    return r.egg.speciesId + ' · ' + r.egg.sex;
});

test('孵化：到期落进培育缸，成长 5%', function () {
    var env = setup();
    var f = adult(env.state, 'peach_koi', 'f');
    var m = adult(env.state, 'peach_koi', 'm');
    breed.breed(env.state, f.id, m.id);
    env.state.hatchery[0].hatchAt = Date.now() - 1;

    var born = breed.tick(env.state);
    assert(born.length === 1, '应孵出 1 条，实际 ' + born.length);
    assert(env.state.hatchery.length === 0, '蛋应从槽里移除');
    assert(env.state.nursery.length === 1, '子代应进培育缸');
    assert(born[0].growth === cfg.breed.babyGrowth, '鱼苗成长应为 ' + cfg.breed.babyGrowth);
    return 'nursery ' + env.state.nursery.length + ' · growth ' + born[0].growth;
});

test('孵化：培育缸满了蛋留在槽里，不丢不重复扣费', function () {
    var env = setup();
    var f = adult(env.state, 'gold_fish', 'f');
    var m = adult(env.state, 'gold_fish', 'm');
    breed.breed(env.state, f.id, m.id);
    env.state.hatchery[0].hatchAt = Date.now() - 1;

    var slots = breed.nurserySlotsOf(env.state);
    for (var i = 0; i < slots; i++) {
        env.state.nursery.push(fishLib.create('gold_fish', { growth: 10, sex: 'f' }));
    }
    var born = breed.tick(env.state);
    assert(born.length === 0, '缸满时不该硬塞');
    assert(env.state.hatchery.length === 1, '蛋应留在槽里等位置');

    /* 腾一格后立刻能落 */
    env.state.nursery.pop();
    var born2 = breed.tick(env.state);
    assert(born2.length === 1, '腾出位置后应落缸');
    assert(env.state.hatchery.length === 0, '落缸后蛋应移除');
    return '缸满等待 → 腾格即落';
});

test('遗传：同种繁育升级率更高（33% vs 25%）', function () {
    var n = 1200;
    function avgSum(fatherSp) {
        var mo = fishLib.create('gold_lamp', { growth: 100, sex: 'f', traits: [{ id: 'gold_scale', lv: 2 }, { id: 'fast_grow', lv: 2 }] });
        var fa = fishLib.create(fatherSp, { growth: 100, sex: 'm', traits: [{ id: 'gold_scale', lv: 2 }, { id: 'fast_grow', lv: 2 }] });
        var sum = 0;
        for (var i = 0; i < n; i++) sum += fishLib.traitSumOf({ traits: breed.inheritTraits(mo, fa, fishLib.speciesById('gold_lamp')) });
        return sum / n;
    }
    var same = avgSum('gold_lamp');
    var cross = avgSum('gold_fish');
    assert(same > cross, '同种平均 Σlv 应更高（' + same.toFixed(3) + ' vs ' + cross.toFixed(3) + '）');
    return '同种 ' + same.toFixed(2) + ' · 异种 ' + cross.toFixed(2);
});

test('遗传：词条不重复、等级不超雌方上限', function () {
    var mo = fishLib.create('gold_fish', { growth: 100, sex: 'f', traits: [{ id: 'gold_scale', lv: 3 }] });
    var fa = fishLib.create('dusk_betta', { growth: 100, sex: 'm', traits: [{ id: 'gold_scale', lv: 5 }, { id: 'breed_twin', lv: 5 }] });
    for (var i = 0; i < 600; i++) {
        var t = breed.inheritTraits(mo, fa, fishLib.speciesById('gold_fish'));
        assert(t.length <= 1, 'R 雌最多 1 槽，实际 ' + t.length);
        if (t.length) assert(t[0].lv <= 3, 'R 上限 L3，实际 L' + t[0].lv);
    }

    var mo2 = fishLib.create('dusk_betta', { growth: 100, sex: 'f', traits: [{ id: 'gold_scale', lv: 4 }, { id: 'fast_grow', lv: 4 }] });
    for (var k = 0; k < 600; k++) {
        var t2 = breed.inheritTraits(mo2, fa, fishLib.speciesById('dusk_betta'));
        assert(t2.length <= 2, 'SSR 最多 2 槽，实际 ' + t2.length);
        if (t2.length === 2) assert(t2[0].id !== t2[1].id, '同鱼不该重复词条');
        for (var j = 0; j < t2.length; j++) assert(t2[j].lv <= 5, 'SSR 上限 L5，实际 L' + t2[j].lv);
    }
    return '槽位与上限都夹住了';
});

test('速繁：L5 速繁把孵化时长压到 72 秒', function () {
    /* 必须用 SSR：R/SR 的上限只有 L3/L4，L5 会被 normalizeTraits 夹下去 */
    var f = fishLib.create('dusk_betta', { growth: 100, sex: 'f', traits: [{ id: 'breed_fast', lv: 5 }] });
    var sec = breed.hatchSecondsOf(f);
    near(sec, Math.round(180 * 0.4), 1, 'L5 速繁应缩到 40%');
    assert(sec >= 72, '不应低于 40% 下限');
    return sec + 's';
});

test('双生：L5 双生的概率 28%，孵化一次给两条', function () {
    var env = setup();
    var f = adult(env.state, 'dusk_betta', 'f', [{ id: 'breed_twin', lv: 5 }]);
    var m = adult(env.state, 'gold_fish', 'm');
    near(breed.twinChanceOf(f), 0.28, 1e-9, 'L5 双生概率应为 28%');

    var r = breed.breed(env.state, f.id, m.id);
    env.state.hatchery[0].twin = true;
    env.state.hatchery[0].hatchAt = Date.now() - 1;
    var born = breed.tick(env.state);
    assert(born.length === 2, '双生应孵出 2 条，实际 ' + born.length);
    return '概率 28% · 孵出 ' + born.length + ' 条';
});

test('培育缸：放缸与卖出，卖价含贝壳加成', function () {
    var env = setup();
    var baby = fishLib.create('gold_fish', { growth: 100, sex: 'f', traits: [{ id: 'gold_scale', lv: 2 }] });
    env.state.nursery.push(baby);
    env.state.shellLv = 1;

    var expect = fishLib.sellPriceOf(baby, 1);
    var r = breed.sellNursery(env.state, baby.id);
    assert(r.ok && r.price === expect, '卖价应为 ' + expect + '，实际 ' + r.price);
    assert(env.state.nursery.length === 0, '卖完应移出培育缸');

    var baby2 = fishLib.create('gold_fish', { growth: 30, sex: 'm' });
    env.state.nursery.push(baby2);
    var before = env.state.fish.length;
    var mv = breed.moveToTank(env.state, baby2.id);
    assert(mv.ok, '放缸应成功');
    assert(env.state.fish.length === before + 1, '主缸应多一条');
    assert(env.state.nursery.length === 0, '培育缸应少一条');
    return '卖 ' + r.price + ' · 放缸 +1';
});

test('存档：往返保留性别、词条等级、孵化槽与培育缸', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f', [{ id: 'gold_scale', lv: 3 }]);
    var m = adult(env.state, 'gold_fish', 'm', [{ id: 'fast_grow', lv: 2 }]);
    breed.breed(env.state, f.id, m.id);
    env.state.nursery.push(fishLib.create('peach_koi', { growth: 22, sex: 'm', traits: [{ id: 'breed_twin', lv: 4 }] }));
    env.state.breedSeq = 7;

    var raw = save.serialize(env.state);
    store['aquarium_save'] = raw;   /* load() 读的是 storage，serialize 只产出对象 */
    assert(raw.v === cfg.saveVersion, '存档版本应为 ' + cfg.saveVersion);
    assert(raw.fish[0].sx === 'f', '主缸鱼应存性别');
    assert(raw.nursery[0].sx === 'm', '培育缸鱼应存性别');
    assert(raw.hatchery.length === 1, '孵化槽应存档');

    var back = save.load();
    assert(back && back.state, '应能读回存档');
    var s2 = back.state;
    assert(s2.fish[0].sex === 'f', '读回应保留雌鱼性别');
    assert(s2.fish[0].traits[0].lv === 3, '读回应保留词条等级，实际 ' + JSON.stringify(s2.fish[0].traits));
    assert(s2.nursery.length === 1 && s2.nursery[0].sex === 'm', '培育缸应读回');
    assert(s2.hatchery.length === 1, '孵化槽应读回');
    assert(s2.breedSeq === 7, 'breedSeq 应读回');
    return 'v' + raw.v + ' · 缸 ' + s2.fish.length + ' · 苗 ' + s2.nursery.length + ' · 蛋 ' + s2.hatchery.length;
});

test('存档：v5 老档（无 sex、词条是 value）能升级', function () {
    var raw = {
        v: 5, savedAt: Date.now(), lastSeenAt: Date.now(), t: 10,
        coins: { fish: 5000, s: 0 }, acc: 0, foodLv: 1, shellLv: 0,
        auto: false, corals: 0, storageLv: 1, tankCount: 1, activeTank: 0,
        stats: {}, discovered: {},
        pondLv: 1, bag: { bait: 0, oyster: 0, pearl: 0 }, caught: [],
        fish: [{
            id: 'old1', sp: 'gold_fish', g: 80, h: 70, m: 60,
            tr: [{ id: 'output_up', value: 3.5 }], b: 0, x: 100, y: 300, tk: 0
        }]
    };
    store['aquarium_save'] = raw;
    var res = save.load();
    assert(res && res.source === 'migrated', 'v5 应被识别为需要迁移');
    var f = res.state.fish[0];
    assert(f.sex === 'm' || f.sex === 'f', '老档鱼应补上性别，实际 ' + f.sex);
    assert(f.traits[0].id === 'gold_scale', '老「高产」应变成金鳞');
    assert(f.traits[0].lv >= 1 && f.traits[0].lv <= 3, '等级应在 1–3，实际 ' + f.traits[0].lv);
    assert(res.state.nursery.length === 0 && res.state.hatchery.length === 0, '老档繁育容器应为空');
    return 'sex=' + f.sex + ' · ' + f.traits[0].id + ' L' + f.traits[0].lv;
});

test('渲染：繁育浮层 / 选鱼列表 / 子代详情整帧不报错', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f', [{ id: 'gold_scale', lv: 2 }]);
    var m = adult(env.state, 'gold_fish', 'm', [{ id: 'fast_grow', lv: 3 }]);
    env.state.nursery.push(fishLib.create('peach_koi', { growth: 40, sex: 'f', traits: [{ id: 'breed_twin', lv: 2 }] }));
    env.state.hatchery.push({
        id: 'h1', speciesId: 'peach_koi', sex: 'f', traits: [],
        startAt: Date.now() - 30000, hatchAt: Date.now() + 150000, seconds: 180, twin: true
    });
    renderer.init(env.state);

    session.breedOpen = true;
    session.breedMother = f.id;
    session.breedFather = m.id;
    renderer.draw(env.state, session, 0.016);

    session.breedPick = 'mother';
    renderer.draw(env.state, session, 0.016);

    session.breedPick = '';
    session.nurseryDetail = env.state.nursery[0].id;
    renderer.draw(env.state, session, 0.016);

    return '三态各画一帧无异常';
});

test('触摸：仓库页点「繁育」打开浮层，并自动挑好一公一母', function () {
    var env = setup();
    adult(env.state, 'gold_lamp', 'f');
    adult(env.state, 'gold_fish', 'm');

    var r = L.bagBreedRect(session.sheetEase);
    touch.tap(center(r), cY(r), env);

    assert(session.breedOpen === true, '繁育浮层应打开');
    assert(session.breedMother, '应自动选中雌鱼，实际 "' + session.breedMother + '"');
    assert(session.breedFather, '应自动选中雄鱼，实际 "' + session.breedFather + '"');
    return 'mother=' + session.breedMother + ' · father=' + session.breedFather;
});

test('触摸：点亲本槽开列表，点一行就选中', function () {
    var env = setup();
    var f1 = adult(env.state, 'gold_fish', 'f');
    var f2 = adult(env.state, 'peach_koi', 'f');
    var m = adult(env.state, 'gold_fish', 'm');

    session.breedOpen = true;
    session.breedMother = '';
    session.breedFather = m.id;

    var p0 = L.breedParentRect(0);
    touch.tap(center(p0), cY(p0), env);
    assert(session.breedPick === 'mother', '应打开选雌鱼列表，实际 ' + session.breedPick);

    var row1 = L.pickRowRect(1);
    touch.tap(center(row1), cY(row1), env);
    assert(session.breedPick === '', '选完应关闭列表');
    assert(session.breedMother === f2.id, '第二行应是桃花鲤，实际 ' + session.breedMother);
    return '选中 ' + session.breedMother;
});

test('触摸：点「开始繁育」产卵，槽里出现一颗蛋', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f');
    var m = adult(env.state, 'gold_fish', 'm');
    session.breedOpen = true;
    session.breedMother = f.id;
    session.breedFather = m.id;

    var g = L.breedGoRect();
    touch.tap(center(g), cY(g), env);

    assert(env.state.hatchery.length === 1, '应有 1 颗蛋，实际 ' + env.state.hatchery.length);
    assert(session.toast && session.toast.text.indexOf('产卵成功') === 0, '应提示产卵成功，实际 ' + (session.toast && session.toast.text));
    return session.toast.text;
});

test('触摸：点培育缸格子开详情，点「放入鱼缸」进主缸', function () {
    var env = setup();
    var baby = fishLib.create('gold_fish', { growth: 70, sex: 'f', traits: [{ id: 'gold_scale', lv: 2 }] });
    env.state.nursery.push(baby);
    session.breedOpen = true;

    var cell = L.nurseryCellRect(0);
    touch.tap(center(cell), cY(cell), env);
    assert(session.nurseryDetail === baby.id, '应打开子代详情，实际 ' + session.nurseryDetail);

    var b0 = L.pickBtnRect(0, L.detailCardRect(1));
    touch.tap(center(b0), cY(b0), env);
    assert(env.state.fish.length === 1, '应进主缸');
    assert(env.state.nursery.length === 0, '培育缸应清空');
    assert(session.nurseryDetail === '', '详情应关闭');
    return '放缸成功 · 主缸 ' + env.state.fish.length;
});

test('触摸：点卡片外关闭浮层', function () {
    var env = setup();
    session.breedOpen = true;
    touch.tap(4, 4, env);
    assert(session.breedOpen === false, '点卡片外应关闭');
    return '已关闭';
});

test('主循环：sim.step 会推进孵化并让培育缸里的鱼长大', function () {
    var env = setup();
    var f = adult(env.state, 'gold_lamp', 'f');
    var m = adult(env.state, 'gold_fish', 'm');
    breed.breed(env.state, f.id, m.id);
    env.state.hatchery[0].hatchAt = Date.now() - 1;

    sim.step(env.state, 0.016, vp);
    assert(env.state.nursery.length === 1, 'sim 一帧应把蛋落缸，实际 ' + env.state.nursery.length);

    var g0 = env.state.nursery[0].growth;
    for (var i = 0; i < 600; i++) sim.step(env.state, 0.016, vp);
    assert(env.state.nursery[0].growth > g0, '培育缸里的鱼应长大（' + g0 + ' → ' + env.state.nursery[0].growth + '）');
    return 'growth ' + g0.toFixed(1) + ' → ' + env.state.nursery[0].growth.toFixed(1);
});

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('繁育专项测试');
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
