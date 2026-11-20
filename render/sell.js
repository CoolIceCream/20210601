/* ============================================================
 * render/sell.js · 选中鱼与「卖掉」按钮（M3）
 *
 * 为什么不「点一下就卖」：
 *   点水面是撒食，是最高频的操作。鱼又总在手指底下游，
 *   一次误触就把养了十分钟的成鱼卖掉，玩家会砸手机。
 *
 * 所以拆成两步：点鱼 → 高亮选中（鱼身光圈 + 头顶价签），
 * 底部浮出「卖掉 +350」，点这个按钮才成交。
 * 点空白处取消选中，顺便撒食，两个操作互不干扰。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var L = require('../ui/layout.js');
var Th = require('./theme.js');
var TT = Th.T;
var itemArt = require('./itemart.js');
var fishLib = require('../core/fish.js');
var wallet = require('../core/wallet.js');

var W = C.W;

/* 当前选中的鱼；被卖掉/切缸后自动失效 */
function selectedOf(state) {
    var id = state.view && state.view.selFish;
    if (!id) return null;
    var act = state.activeTank || 0;
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if (f.id === id && (f.tank || 0) === act) return f;
    }
    return null;
}

/* 光圈 + 头顶价签 */
function drawSelection(ctx, state) {
    var f = selectedOf(state);
    if (!f) return;

    var size = fishLib.sizeOf(f);
    var r = size * 0.82;
    var pulse = 0.75 + Math.sin((state.t || 0) * 4) * 0.18;

    /* 选中光圈：一圈金色，外带一层柔光，别用虚线（部分机型 lineDash 支持不稳） */
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,214,110,0.16)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,198,70,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    /* 价签 */
    var sp = fishLib.speciesById(f.speciesId);
    var price = fishLib.sellPriceOf(f);
    var txt = sp.name + ' · 卖 ' + wallet.format(price);

    ctx.save();
    ctx.font = '800 12px sans-serif';
    var tw = ctx.measureText(txt).width;
    var bw = Math.min(W - 20, tw + 24);
    var bx = U.clamp(f.x - bw / 2, 8, W - 8 - bw);
    var by = f.y - r - 32;

    Th.jelly(ctx, bx, by, bw, 24, {
        top: '#fffdf6', bottom: '#ffe6b0',
        deep: 'rgba(150,100,40,0.30)',
        r: 12, depth: 2, ink: TT.ink, lw: 2, gloss: false
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TT.text;
    ctx.font = '800 12px sans-serif';
    ctx.fillText(U.fitText(ctx, txt, bw - 12), bx + bw / 2, by + 12.5);
    ctx.restore();
}

/* 底部中间那格：「卖掉」常驻，颜色跟选中状态走。
 * 卡面跟着 M6 那套按钮走（浅米卡面 + 圆形徽章），
 * 没选鱼时整颗徽章是灰的、点了给一句提示；
 * 选中后卡面转暖橙、徽章里的金币亮起来，标签直接换成价格。 */
function drawSellButton(ctx, state) {
    var b = L.SELL_BTN;
    var f = selectedOf(state);
    var cx = b.x + b.w / 2;
    var cy = b.y + 27;

    if (!f) {
        Th.jelly(ctx, b.x, b.y, b.w, b.h, {
            top: '#fbf7ee',
            bottom: '#efe5d2',
            deep: 'rgba(140,98,52,0.2)',
            r: 22,
            depth: 5,
            ink: 'rgba(107,68,35,0.32)',
            lw: 2.4,
            gloss: false
        });

        Th.badge(ctx, cx, cy, 19, {
            top: '#f3ebdb',
            bottom: '#d9cbb2',
            ink: 'rgba(107,68,35,0.34)',
            lw: 2.2,
            gloss: false
        });

        itemArt.draw(ctx, 'coin', cx, cy, 28);

        /* 金币是金色的，放在灰徽章里会跳出来破坏「不可用」的感觉。
         * 用一层同色蒙版压暗，比调 globalAlpha 稳（那只影响透明度，会透出底色）。 */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 18.4, 0, 6.2832);
        ctx.clip();
        ctx.fillStyle = 'rgba(244,238,226,0.74)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = '#b6a486';
        ctx.fillText('卖掉', cx, b.y + 61);
        ctx.restore();
        return;
    }

    var price = fishLib.sellPriceOf(f);

    Th.jelly(ctx, b.x, b.y, b.w, b.h, {
        top: '#ffe6a8',
        bottom: '#ffc266',
        deep: 'rgba(160,88,10,0.38)',
        r: 22,
        depth: 5,
        ink: '#8a4a10',
        lw: 2.6,
        gloss: false
    });

    /* 徽章用浅米底而不是橙色：金色金币压在橙底上会糊成一团，
     * 换成浅底，金币的轮廓和中间的星才立得住。 */
    Th.badge(ctx, cx, cy, 19, {
        top: '#fffdf2',
        bottom: '#ffe7b8',
        ink: '#8a4a10',
        lw: 2.4
    });

    itemArt.draw(ctx, 'coin', cx, cy, 28);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 14px sans-serif';
    ctx.fillStyle = '#7d3f08';
    ctx.fillText('+' + wallet.format(price), cx, b.y + 61);
    ctx.restore();
}

module.exports = {
    selectedOf: selectedOf,
    drawSelection: drawSelection,
    drawSellButton: drawSellButton
};
