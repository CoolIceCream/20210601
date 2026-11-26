/* ============================================================
 * ui/debug-panel.js · 调试面板（M0 交付项 T0-5）
 *
 * 打开方式：连续点左上角金币胶囊 5 次。
 * 作用：不靠反复玩就能验数值 —— 加币、加鱼、快进时间、清档。
 * 发布前把 config.debug.enabled 设为 false 即整体失效。
 * ============================================================ */

var C = require('../render/canvas.js');
var U = require('../render/util.js');
var cfg = require('../config/index.js');
var wallet = require('../core/wallet.js');
var fishLib = require('../core/fish.js');
var storage = require('../core/storage.js');
var offline = require('../core/offline.js');
var platform = require('../platform.js');

var W = C.W;
var H = C.H;
var roundRect = U.roundRect;

var PW = Math.min(W - 40, 336);
var PX = (W - PW) / 2;
var PY = H * 0.2;
var BTN_H = 44;
var BTN_GAP = 10;
var COLS = 2;

var ITEMS = [
    { id: 'coin', label: '+1000 鱼币' },
    { id: 'sc', label: '+100 S币' },
    { id: 'fish', label: '加一条鱼' },
    { id: 'skip', label: '快进 1 小时' },
    { id: 'save', label: '立即存档' },
    { id: 'clear', label: '清档重开' }
];

var ROWS = Math.ceil(ITEMS.length / COLS);
var PH = 66 + ROWS * (BTN_H + BTN_GAP) + 24;

function panelRect() {
    return { x: PX, y: PY, w: PW, h: PH };
}

function btnRect(i) {
    var col = i % COLS;
    var row = Math.floor(i / COLS);
    var gapX = 12;
    var bw = (PW - 24 - gapX) / 2;
    return {
        x: PX + 12 + col * (bw + gapX),
        y: PY + 56 + row * (BTN_H + BTN_GAP),
        w: bw,
        h: BTN_H
    };
}

function closeRect() {
    return { x: PX + PW - 42, y: PY + 12, w: 30, h: 30 };
}

function draw(ctx, session, state) {
    if (!session.debug.open) return;

    var p = panelRect();
    roundRect(ctx, p.x, p.y, p.w, p.h, 18);
    ctx.fillStyle = 'rgba(6,24,36,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,220,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* 标题 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText('调试面板', p.x + 14, p.y + 27);

    ctx.font = '400 11px sans-serif';
    ctx.fillStyle = '#6d94a6';
    var tag = 'FPS ' + session.fps.toFixed(0) + ' · Q版';
    ctx.fillText(tag, p.x + 88, p.y + 28);

    /* 关闭 */
    var cr = closeRect();
    ctx.textAlign = 'center';
    ctx.font = '400 18px sans-serif';
    ctx.fillStyle = '#a9d6ea';
    ctx.fillText('×', cr.x + 15, cr.y + 15);

    /* 按钮 */
    for (var i = 0; i < ITEMS.length; i++) {
        var b = btnRect(i);
        roundRect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,220,255,0.12)';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 13px sans-serif';
        ctx.fillStyle = '#cfeeff';

        var label = ITEMS[i].label;
        if (ITEMS[i].id === 'skip') {
            label = '快进 1 小时';
        }
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }

    /* 状态行 */
    ctx.textAlign = 'left';
    ctx.font = '400 11px sans-serif';
    ctx.fillStyle = '#5f8497';
    var value = 0;
    for (var i = 0; i < state.fish.length; i++) value += fishLib.sellPriceOf(state.fish[i], state.shellLv);
    ctx.fillText('全缸身价 ' + wallet.format(value) + ' · 鱼 ' + state.fish.length +
        ' 条 · 账本 ' + state.ledger.length + ' 条', p.x + 14, p.y + PH - 12);
}

/* 返回 true 表示这次点击被面板吃掉了 */
function tap(x, y, session, env) {
    if (!session.debug.open) return false;

    var p = panelRect();
    if (!U.inRect(x, y, p)) {
        session.debug.open = false;
        return true;
    }

    if (U.inRect(x, y, closeRect())) {
        session.debug.open = false;
        return true;
    }

    for (var i = 0; i < ITEMS.length; i++) {
        if (!U.inRect(x, y, btnRect(i))) continue;
        run(ITEMS[i].id, session, env);
        return true;
    }
    return true;
}

function run(id, session, env) {
    var state = env.state;

    if (id === 'coin') {
        wallet.add(state, 'fish', 1000, 'debug');
        session.showToast('鱼币 +1000');
    } else if (id === 'sc') {
        wallet.add(state, 's', 100, 'debug');
        session.showToast('S币 +100');
    } else if (id === 'fish') {
        /* 调试加鱼也守鱼位，否则会造出 16/15 这种自相矛盾的界面 */
        if (storage.roomOf(state) <= 0) {
            session.showToast('鱼位满了');
            return;
        }
        var sp = fishLib.randomSpecies();
        state.fish.push(fishLib.create(sp.id, { growth: 30, tank: storage.activeTankOf(state), rollTraits: true }));
        env.sim.ensurePlacement(state, env.viewport);
        session.showToast('加了一条 ' + sp.name);
    } else if (id === 'skip') {
        state.lastSeenAt -= 3600 * 1000;
        var r = offline.settle(state, platform.now());
        if (r && r.grown > 0) {
            session.modal = {
                type: 'offline',
                seconds: r.seconds,
                rawSeconds: r.rawSeconds,
                grown: r.grown,
                adult: r.adult,
                total: r.total,
                gain: r.gain,
                after: r.after,
                capped: r.capped,
                capHours: r.capHours
            };
        } else {
            session.showToast('这一小时没有变化（鱼都已经成年了）');
        }
    } else if (id === 'save') {
        env.saveNow();
        session.showToast('已存档');
    } else if (id === 'clear') {
        env.clearSave();
    }
}

/* 金币胶囊连点 5 次打开 */
function registerTap(x, y, session, layout) {
    if (!cfg.debug.enabled) return;

    var r = layout.coinPillRect(30);
    r.w = 120;
    if (!U.inRect(x, y, r)) {
        session.debug.tapTimes.length = 0;
        return;
    }

    var now = platform.now();
    var times = session.debug.tapTimes;
    times.push(now);
    while (times.length && now - times[0] > 2500) times.shift();
    if (times.length >= 5) {
        times.length = 0;
        session.debug.open = !session.debug.open;
    }
}

module.exports = {
    draw: draw,
    tap: tap,
    registerTap: registerTap,
    panelRect: panelRect,
    btnRect: btnRect,
    closeRect: closeRect
};
