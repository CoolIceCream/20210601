/* ============================================================
 * ui/diag.js · 真机自检 / 崩溃屏显
 *
 * 体验版没有控制台，出错时玩家（和开发者）只能看到「黑屏」或
 * 「停在背景」这种结果，完全无法定位。这里做两件事：
 *
 *   1. 不阻断：绘制分层都包一层 try/catch，某一层崩了不影响其他层
 *   2. 看得见：把环境信息 + 异常文本直接画在屏幕顶部
 *
 * 正常运行时 draw() 什么都不画，零开销。
 * ============================================================ */

var C = require('../render/canvas.js');

var MAX_KINDS = 5;      /* 最多记 5 类异常（同一类只累加次数） */
var MAX_MSG = 300;      /* 单条异常文本截断，避免撑爆屏幕 */

var diag = {
    kinds: [],
    count: 0,
    frames: 0,
    /* 想强制显示诊断条（排查用），可从调试面板置 true */
    forceShow: false
};

/* ---------------- 记录 ---------------- */

function textOf(e) {
    if (!e) return 'unknown';
    var s;
    if (e.stack) s = String(e.stack);
    else if (e.message) s = String(e.message);
    else s = String(e);
    /* 多行堆栈压成一行，屏幕按宽度自行折行 */
    s = s.replace(/\s*\n\s*/g, ' | ');
    return s.slice(0, MAX_MSG);
}

function record(label, e) {
    diag.count += 1;
    var msg = textOf(e);

    for (var i = 0; i < diag.kinds.length; i++) {
        if (diag.kinds[i].label === label && diag.kinds[i].msg === msg) {
            diag.kinds[i].times += 1;
            return;
        }
    }
    if (diag.kinds.length < MAX_KINDS) {
        diag.kinds.push({ label: label, msg: msg, times: 1 });
    }
}

/** 包一层：fn 抛错只记录，不向上传播 */
function guard(label, fn, fallback) {
    try {
        return fn();
    } catch (e) {
        record(label, e);
        return fallback;
    }
}

/* ---------------- 环境信息 ---------------- */

function wxInfo() {
    var api = (typeof wx !== 'undefined') ? wx : null;
    if (!api) return ['非微信环境'];
    var out = [];
    var si = null;
    try {
        si = api.getSystemInfoSync ? api.getSystemInfoSync() : null;
    } catch (e) {
        si = null;
    }
    if (si) {
        out.push('SDK ' + (si.SDKVersion || '?') +
            ' · 微 ' + (si.version || '?') +
            ' · ' + (si.platform || '?'));
        out.push((si.brand || '') + ' ' + (si.model || '') + ' · ' + (si.system || ''));
    } else {
        out.push('SDK ? · getSystemInfoSync 不可用');
    }
    out.push('画布 ' + C.W + 'x' + C.H + ' @' + C.DPR);
    return out;
}

/* ---------------- 绘制 ---------------- */

function wrap(ctx, text, maxW) {
    var out = [];
    var cur = '';
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ctx.measureText(cur + ch).width > maxW && cur) {
            out.push(cur);
            cur = ch;
        } else {
            cur += ch;
        }
    }
    if (cur) out.push(cur);
    return out;
}

function paint(ctx, state, session) {
    var W = C.W;
    var pad = 8;
    var cw = W - pad * 2;
    var y = Math.max(6, C.SB + 4);
    var lineH = 14;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 11px sans-serif';

    /* 先排内容，再按内容高度铺底，避免半透明底挡住一大片画面 */
    var rows = [];
    rows.push({
        t: diag.count
            ? '[!] 运行异常 ' + diag.count + ' 次 · 帧 ' + diag.frames
            : '[i] 自检 · 帧 ' + diag.frames + ' · 三指点屏关闭',
        c: diag.count ? '#ff9d9d' : '#9fe0b8',
        f: '600 11px sans-serif'
    });

    var env = wxInfo();
    for (var i = 0; i < env.length; i++) {
        rows.push({ t: env[i], c: '#c9dbe6', f: '400 10px sans-serif' });
    }

    {
        /* 贴图已彻底移除：这一行同时是版本信号，真机上一眼能确认跑的是哪一版 */
        rows.push({
            t: '绘制 Q版矢量 · 无贴图',
            c: '#9fe0b8',
            f: '400 10px sans-serif'
        });
    }

    /* 状态摘要：判断「画面是空的」到底缺了哪一块 */
    if (state && state.fish) {
        var coins = (state.coins && state.coins.fish) || 0;
        rows.push({
            t: '鱼 ' + state.fish.length + ' 条 · 余额 ' + Math.round(coins) +
                ' · 商店' + (session && session.sheetOpen ? '开' : '关') +
                ' · 弹窗' + (session && session.modal ? '开' : '关'),
            c: '#c9dbe6',
            f: '400 10px sans-serif'
        });
    }

    for (var k = 0; k < diag.kinds.length; k++) {
        var kd = diag.kinds[k];
        rows.push({ t: '· ' + kd.label + (kd.times > 1 ? ' ×' + kd.times : ''), c: '#ffd28a', f: '600 10px sans-serif' });
        var wrapped = wrap(ctx, kd.msg, cw - 6);
        for (var m = 0; m < wrapped.length && m < 6; m++) {
            rows.push({ t: wrapped[m], c: '#f0f4f7', f: '400 9px sans-serif' });
        }
        if (wrapped.length > 6) {
            rows.push({ t: '…（还有 ' + (wrapped.length - 6) + ' 行）', c: '#8fa6b4', f: '400 9px sans-serif' });
        }
    }

    /* 计算总高：按每行的字体行高累加 */
    var totalH = 0;
    for (var r = 0; r < rows.length; r++) {
        var lh = rows[r].f.indexOf('9px') >= 0 ? 12 : lineH;
        rows[r].h = lh;
        totalH += lh;
    }
    totalH += pad * 2;

    ctx.fillStyle = 'rgba(4,14,22,0.86)';
    ctx.fillRect(0, 0, W, y - 6 + totalH);
    ctx.strokeStyle = 'rgba(255,120,120,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y - 6 + totalH);
    ctx.lineTo(W, y - 6 + totalH);
    ctx.stroke();

    var cy = y;
    for (var q = 0; q < rows.length; q++) {
        ctx.font = rows[q].f;
        ctx.fillStyle = rows[q].c;
        ctx.fillText(rows[q].t, pad, cy);
        cy += rows[q].h;
    }

    ctx.restore();
}

/** 有异常才画；自己出错绝不能再抛出去 */
function draw(ctx, state, session) {
    if (!diag.count && !diag.forceShow) return;
    try {
        paint(ctx, state, session);
    } catch (e) {
        /* 诊断层自己挂了就算了，不能连累主循环 */
    }
}

/* ---------------- 全局兜底 ---------------- */

function install() {
    var api = (typeof wx !== 'undefined') ? wx : null;
    if (!api) return;
    if (api.onError) {
        api.onError(function (err) {
            record('global', err);
        });
    }
    if (api.onUnhandledRejection) {
        api.onUnhandledRejection(function (res) {
            record('promise', (res && res.reason) || res);
        });
    }
}

module.exports = {
    record: record,
    guard: guard,
    draw: draw,
    install: install,
    state: diag,
    reset: function () {
        diag.kinds.length = 0;
        diag.count = 0;
        diag.forceShow = false;
    }
};
