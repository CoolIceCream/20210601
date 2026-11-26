/* ============================================================
 * game.js · 小游戏入口（只做装配，不写业务）
 *
 * 目录约定：
 *   config/   纯数值，策划改这里
 *   core/     纯逻辑，不碰 canvas / wx，可单独跑测试
 *   render/   绘制，只读 state
 *   ui/       布局、触摸、界面状态、调试面板
 *   platform  环境适配（wx / 浏览器 / Node）
 *
 * 启动与主循环都包了 try/catch（ui/diag.js）：
 * 真机出错时不再是一片沉默的背景，异常会直接画在屏幕顶部。
 * ============================================================ */

var platform = require('./platform.js');
var cfg = require('./config/index.js');

/* 必须先引 canvas：它在模块加载时创建画布并确定视口 */
var screen = require('./render/canvas.js');

var stateModule = require('./core/state.js');
var save = require('./core/save.js');
var offline = require('./core/offline.js');
var sim = require('./core/sim.js');

var session = require('./ui/session.js');
var touch = require('./ui/touch.js');
var renderer = require('./render/index.js');
var diag = require('./ui/diag.js');

var vp = screen.viewport;

diag.install();

/* ---------------- 启动：读档 / 结算离线 / 摆鱼 ---------------- */

function bootState() {
    var loaded = save.load();
    var state;

    if (loaded) {
        state = loaded.state;
        /* 旧档迁移成功后立刻回写，避免每次启动都再迁一遍 */
        if (loaded.source !== 'current') save.save(state);
    } else {
        state = stateModule.bootstrapFresh();
    }

    sim.ensurePlacement(state, vp);
    sim.seedBubbles(state, vp, 14);
    return state;
}

/* 离线结算：启动时算一次「鱼长大了多少」 */
function settleOffline(state) {
    var r = offline.settle(state, platform.now());
    if (r && (r.grown > 0 || r.eaten > 0)) {
        session.modal = {
            type: 'offline',
            seconds: r.seconds,
            rawSeconds: r.rawSeconds,
            grown: r.grown,
            adult: r.adult,
            eaten: r.eaten,
            total: r.total,
            gain: r.gain,
            after: r.after,
            capped: r.capped,
            capHours: r.capHours
        };
    }
    return r;
}

var env = null;

/* ---------------- 主循环状态 ---------------- */

var lastStamp = 0;
var fpsAcc = 0;
var fpsFrames = 0;

function start() {
    var state = null;

    diag.guard('boot', function () { state = bootState(); });
    if (!state) {
        /* 存档读坏了：退回全新开局，别让玩家卡在启动 */
        diag.guard('boot:fresh', function () { state = stateModule.bootstrapFresh(); });
    }
    if (!state) {
        /* 连初始状态都造不出来，把异常画出来就停手，避免无限报错 */
        diag.state.forceShow = true;
        diag.draw(screen.ctx, env && env.state, session);
        return;
    }

    env = {
        state: state,
        session: session,
        viewport: vp,
        sim: sim,
        saveNow: function () {
            env.state.lastSeenAt = platform.now();
            save.save(env.state);
        },
        clearSave: function () {
            save.clear();
            env.state = stateModule.bootstrapFresh();
            sim.ensurePlacement(env.state, vp);
            sim.seedBubbles(env.state, vp, 10);
            session.sheetOpen = false;
            session.modal = null;
            session.debug.open = false;
            renderer.init(env.state);
            env.saveNow();
            session.showToast('已重置');
        }
    };

    diag.guard('offline', function () { settleOffline(env.state); });
    diag.guard('init', function () { renderer.init(env.state); });

    if (cfg.debug.startOpen) session.debug.open = true;

    diag.guard('touch', function () { touch.attach(env); });

    platform.onHide(function () {
        env.saveNow();
    });

    platform.onShow(function () {
        lastStamp = 0;
        diag.guard('offline', function () { settleOffline(env.state); });
    });

    platform.raf(loop);
}

function loop(ts) {
    platform.raf(loop);
    diag.state.frames += 1;

    if (!lastStamp) {
        lastStamp = ts;
        diag.draw(screen.ctx, env && env.state, session);
        return;
    }

    var dt = (ts - lastStamp) / 1000;
    lastStamp = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    /* 逻辑推进（与渲染无关，见 tools/headless-test.js） */
    var needSave = diag.guard('sim', function () {
        return sim.step(env.state, dt, vp);
    }, false);

    /* 界面动画 + 绘制 */
    diag.guard('hold', function () { touch.step(env, dt); });
    diag.guard('session', function () { renderer.stepSession(session, dt); });
    renderer.draw(env.state, session, dt);

    if (needSave) diag.guard('save', function () { env.saveNow(); });

    fpsAcc += dt;
    fpsFrames += 1;
    if (fpsAcc >= 0.5) {
        session.fps = fpsFrames / fpsAcc;
        fpsAcc = 0;
        fpsFrames = 0;
    }
}

start();
