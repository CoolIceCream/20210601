/* ============================================================
 * render/modal.js · 弹窗（目前只有离线收益）
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var cfg = require('../config/index.js');
var Th = require('./theme.js');
var TT = Th.T;
var wallet = require('../core/wallet.js');

var W = C.W;
var H = C.H;
var roundRect = U.roundRect;

var CARD_W = Math.min(W - 56, 320);
var CARD_H = 268;       /* 无说明文字时的基础高度 */

/* 说明文字最多两行，卡片跟着长高，避免按钮下面空一大块 */
function noteCount(modal) {
    var n = 0;
    if (!modal) return 0;
    if (modal.eaten > 0) n += 1;
    if (modal.capped) n += 1;
    if (modal.adult > 0) n += 1;
    return Math.min(2, n);
}

function cardH(modal) {
    return CARD_H + noteCount(modal) * 19;
}

function cardRect(modal) {
    return { x: (W - CARD_W) / 2, y: H * 0.28, w: CARD_W, h: cardH(modal) };
}

function btnRect(modal) {
    var c = cardRect(modal);
    return { x: c.x + 26, y: c.y + c.h - 66, w: CARD_W - 52, h: 48 };
}

/* 把秒数说成人话 */
function formatDuration(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分钟';
    return Math.floor(sec) + ' 秒';
}

/**
 * 离线结算弹窗（M3：报「长了几条 + 现在值多少」）
 * 不再报金币 —— 金币必须靠卖鱼，凭空多出来的数字会自相矛盾。
 */
function draw(ctx, modal) {
    if (!modal) return;

    ctx.save();
    ctx.fillStyle = 'rgba(6,10,24,0.68)';
    ctx.fillRect(0, 0, W, H);

    var c = cardRect(modal);

    /* 卡片：深墨牌匾 + 描金边 + 柔和投影 */
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,20,0.7)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, c.x, c.y, c.w, c.h, 24);
    var g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    U.stop(g, 0, TT.cardTop);
    U.stop(g, 1, TT.cardBottom);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = TT.ink;
    ctx.lineWidth = 3;
    roundRect(ctx, c.x, c.y, c.w, c.h, 24);
    ctx.stroke();

    /* 标题 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 19px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(modal.eaten > 0 && modal.grown <= 0 ? '鲨鱼开饭了' : '鱼长大了', W / 2, c.y + 40);

    /* 离开时长 */
    ctx.font = '600 13px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var away = modal.rawSeconds || modal.seconds;
    ctx.fillText('你离开了 ' + formatDuration(away), W / 2, c.y + 68);

    /* 大字：长了几条 */
    var big = '+' + modal.grown + ' 条';
    ctx.lineJoin = 'round';
    ctx.font = '800 42px sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(6,10,24,0.9)';
    ctx.strokeText(big, W / 2, c.y + 112);
    var gg = ctx.createLinearGradient(0, c.y + 86, 0, c.y + 134);
    U.stop(gg, 0, '#f0d99a');
    U.stop(gg, 1, '#c8a45c');
    ctx.fillStyle = gg;
    ctx.fillText(big, W / 2, c.y + 112);

    /* 成鱼提示 */
    ctx.font = '700 13px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var sub = modal.adult > 0
        ? '其中 ' + modal.adult + ' 条长成了成鱼'
        : modal.eaten > 0 ? '不过有同伴被鲨鱼吃了' : '都在悄悄长大';
    ctx.fillText(sub, W / 2, c.y + 146);

    /* 身价：把「长大」翻译成金币 */
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText('现在全卖可得 ' + wallet.format(Math.floor(modal.after || 0)) + ' 鱼币', W / 2, c.y + 172);

    var notes = [];
    if (modal.eaten > 0) notes.push('有 ' + modal.eaten + ' 条鱼被鲨鱼吃掉');
    if (modal.gain > 0) notes.push('较离线前涨了 ' + wallet.format(Math.floor(modal.gain)) + ' 鱼币');
    if (modal.capped) notes.push('离线时长已达 ' + (modal.capHours || 4) + ' 小时上限');

    ctx.font = '600 11.5px sans-serif';
    for (var i = 0; i < notes.length && i < 2; i++) {
        ctx.fillStyle = modal.eaten > 0 && i === 0 ? '#e06a55'
            : (modal.gain > 0 ? '#e0bb6a' : TT.textSoft);
        ctx.fillText(notes[i], W / 2, c.y + 194 + i * 17);
    }

    /* 收下按钮 */
    var b = btnRect(modal);
    Th.jelly(ctx, b.x, b.y, b.w, b.h, {
        top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
        r: 24, depth: 5, ink: '#5f1e18', lw: 2.8
    });
    ctx.lineJoin = 'round';
    Th.textOutlined(ctx, '知道了', b.x + b.w / 2, b.y + b.h / 2, 17, '#fff3d2', '#5f1e18', 3.2);

    ctx.restore();
}

module.exports = {
    draw: draw,
    cardRect: cardRect,
    btnRect: btnRect,
    formatDuration: formatDuration
};
