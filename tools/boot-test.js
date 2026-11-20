/* ============================================================
 * tools/boot-test.js · 启动链冒烟测试
 *
 * 用假的 wx 环境把 game.js 完整跑起来（跑到第 3 帧），
 * 目的是在没有手机的情况下验证：
 *   1. 所有模块能加载、没有 require 断裂
 *   2. 视口探测在「接口缺失 / 返回 undefined」时仍能兜住
 *   3. 模块加载期抛错时，fatal 错误页能画出来且自身不再抛
 *
 * 运行：node tools/boot-test.js
 * ============================================================ */

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var ENTRY = path.join(ROOT, 'game.js');

var results = [];

function clearCache() {
    Object.keys(require.cache).forEach(function (k) {
        if (k.indexOf(ROOT) === 0) delete require.cache[k];
    });
}

/* ---------------- 假 canvas / ctx ---------------- */

function fakeCtx(sink) {
    var store = {};
    return new Proxy({}, {
        get: function (t, k) {
            if (k in store) return store[k];
            if (k === 'measureText') return function (s) { return { width: (s ? s.length : 0) * 5 }; };
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
                return function () { return { addColorStop: function () {} }; };
            }
            return function () { sink.push(String(k)); };
        },
        set: function (t, k, v) { store[k] = v; return true; }
    });
}

function makeEnv(opts) {
    var sink = [];
    var store = {};
    var cv = {
        width: 0,
        height: 0,
        getContext: function () { return fakeCtx(sink); }
    };

    var api = {
        createCanvas: function () { return cv; },
        getStorageSync: function (k) { return store[k] === undefined ? '' : store[k]; },
        setStorageSync: function (k, v) { store[k] = v; },
        removeStorageSync: function (k) { delete store[k]; },
        onShow: function () {},
        onHide: function () {},
        onTouchStart: function () {},
        onError: function () {},
        onUnhandledRejection: function () {}
    };

    if (opts.windowInfo !== false) {
        api.getWindowInfo = opts.windowInfo || function () {
            return {
                windowWidth: 390, windowHeight: 844, pixelRatio: 3,
                statusBarHeight: 44, safeArea: { top: 44, bottom: 810, left: 0, right: 390 }
            };
        };
    }
    if (opts.systemInfo !== false) {
        api.getSystemInfoSync = opts.systemInfo || function () {
            return {
                windowWidth: 375, windowHeight: 667, pixelRatio: 2,
                statusBarHeight: 20, safeArea: { top: 20, bottom: 647, left: 0, right: 375 }
            };
        };
    }

    return { api: api, sink: sink, cv: cv, store: store };
}

/* 把 raf 换成只跑 N 帧的同步调度 */
function runFrames(n) {
    var count = 0;
    global.requestAnimationFrame = function (cb) {
        if (count >= n) return 0;
        count += 1;
        setTimeout(function () {
            try {
                cb(Date.now());
            } catch (e) {
                /* 抛到外面没意义，交给调用方统计 */
                throw e;
            }
        }, 0);
        return count;
    };
    return function () { return count; };
}

function bootOnce(name, opts, done) {
    clearCache();

    var env = makeEnv(opts || {});
    global.wx = env.api;
    global.performance = global.performance || { now: Date.now };

    runFrames(3);

    var err = null;
    try {
        require(ENTRY);
    } catch (e) {
        err = e;
    }

    /* fatal 页会往 ctx 上写字，用 fillText 是否被调用判断 */
    setTimeout(function () {
        var drew = env.sink.indexOf('fillText') >= 0;
        done({ name: name, err: err, drew: drew, sink: env.sink });
    }, 60);
}

/* ---------------- 场景 ---------------- */

var scenarios = [
    { name: '标准基础库（getWindowInfo 正常）', opts: {} },
    {
        name: '老基础库（无 getWindowInfo，只有 getSystemInfoSync）',
        opts: { windowInfo: false }
    },
    {
        name: '异常机型（getWindowInfo 返回 undefined）',
        opts: { windowInfo: function () { return undefined; } }
    },
    {
        name: '异常机型（getWindowInfo 返回空宽高）',
        opts: { windowInfo: function () { return { windowWidth: 0, windowHeight: 0 }; } }
    },
    {
        name: '极端：两个接口都没有',
        opts: { windowInfo: false, systemInfo: false }
    },
    {
        name: '极端：getWindowInfo 直接抛错',
        opts: { windowInfo: function () { throw new Error('boom'); } }
    }
];

function next(i) {
    if (i >= scenarios.length) return report();
    bootOnce(scenarios[i].name, scenarios[i].opts, function (r) {
        results.push(r);
        next(i + 1);
    });
}

function report() {
    console.log('');
    console.log('启动链冒烟测试');
    console.log('-'.repeat(64));
    var fail = 0;
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var ok = !r.err;
        if (!ok) fail += 1;
        console.log((ok ? 'PASS  ' : 'FAIL  ') + r.name);
        if (!ok) console.log('        ' + (r.err && (r.err.stack || r.err.message) || r.err));
    }
    console.log('-'.repeat(64));
    console.log('合计 ' + results.length + ' 项 · PASS ' + (results.length - fail) + ' · FAIL ' + fail);
    process.exit(fail ? 1 : 0);
}

next(0);
