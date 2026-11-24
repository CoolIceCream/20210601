/* ============================================================
 * render/frame.js · 鱼缸的缸体（细线勾出来的那只缸）
 *
 * 造型按手绘稿走：一条外轮廓把整块屏幕框住，
 * 上面一条横带放读数，下面一条横带放按钮，
 * 中间是玻璃，玻璃两侧各一条竖线当缸壁 —— 两线之间的 7px
 * 就是缸壁的厚度，这就是「鱼缸」的全部视觉语言。
 *
 * 早前那版是厚奶油框 + 独立底座，像相框，不像缸：
 * 厚度一过 10px，框就会自己变成主体，把水挤成一张照片。
 * 所以这里只用线，不用块。
 *
 * 时间轴（见 render/canvas.js）：
 *   12 .. TANK_TOP      读数带
 *   TANK_TOP .. BOTTOM  水体（scene.js 负责，这里只补缸壁与暗影）
 *   BOTTOM .. H         按钮带
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');

var W = C.W;
var H = C.H;
var TOP = C.TANK_TOP;
var BOT = C.TANK_BOTTOM;
var FX = C.FRAME_X;

var WOOD = '#c8a45c';       /* 描金 */
var LINE = 'rgba(200,164,92,'; /* 金线前缀（和风描边） */
var CARD_X = 5;

/* ---------------- 外轮廓 ---------------- */

function drawCard(ctx) {
    var r = 22;
    ctx.beginPath();
    ctx.moveTo(CARD_X, H);
    ctx.lineTo(CARD_X, 12 + r);
    ctx.arcTo(CARD_X, 12, CARD_X + r, 12, r);
    ctx.lineTo(W - CARD_X - r, 12);
    ctx.arcTo(W - CARD_X, 12, W - CARD_X, 12 + r, r);
    ctx.lineTo(W - CARD_X, H);
    ctx.closePath();

    var g = ctx.createLinearGradient(0, 0, 0, H);
    U.stop(g, 0, '#202a48');
    U.stop(g, 0.5, '#18213c');
    U.stop(g, 1, '#111a30');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 2.4;
    ctx.stroke();
}

/* ---------------- 上下两条分隔线 ---------------- */

function hair(ctx, y, alpha) {
    ctx.beginPath();
    ctx.moveTo(CARD_X + 1, y);
    ctx.lineTo(W - CARD_X - 1, y);
    ctx.strokeStyle = LINE + alpha + ')';
    ctx.lineWidth = 1.7;
    ctx.stroke();
}

/* ---------------- 缸壁（玻璃两侧的竖线） ---------------- */

function drawWalls(ctx) {
    for (var s = 0; s < 2; s++) {
        var x = s === 0 ? FX : W - FX;
        ctx.beginPath();
        ctx.moveTo(x, TOP);
        ctx.lineTo(x, BOT);
        ctx.strokeStyle = LINE + '0.62)';
        ctx.lineWidth = 1.7;
        ctx.stroke();
    }
}

/* ---------------- 玻璃里的暗影 ---------------- */

/* 水面被缸盖压住、沙底被缸底托住，两道影让水看着是「装在里面」的 */
function drawGlassShade(ctx) {
    var g = ctx.createLinearGradient(0, TOP, 0, TOP + 14);
    U.stop(g, 0, 'rgba(6,10,28,0.30)');
    U.stop(g, 1, 'rgba(6,10,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(FX, TOP, W - FX * 2, 14);

    var g2 = ctx.createLinearGradient(0, BOT - 16, 0, BOT);
    U.stop(g2, 0, 'rgba(6,10,28,0)');
    U.stop(g2, 1, 'rgba(6,10,28,0.26)');
    ctx.fillStyle = g2;
    ctx.fillRect(FX, BOT - 16, W - FX * 2, 16);

    /* 贴着缸壁的一窄条暗，玻璃厚度就出来了 */
    var g3 = ctx.createLinearGradient(FX, 0, FX + 9, 0);
    U.stop(g3, 0, 'rgba(6,10,28,0.22)');
    U.stop(g3, 1, 'rgba(6,10,28,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(FX, TOP, 9, BOT - TOP);

    var g4 = ctx.createLinearGradient(W - FX, 0, W - FX - 9, 0);
    U.stop(g4, 0, 'rgba(6,10,28,0.22)');
    U.stop(g4, 1, 'rgba(6,10,28,0)');
    ctx.fillStyle = g4;
    ctx.fillRect(W - FX - 9, TOP, 9, BOT - TOP);
}

/* 一道很淡的斜反光：像手绘稿里玻璃上随手画的那道高光 */
function drawGlare(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(FX + 16, TOP);
    ctx.lineTo(FX + 44, TOP);
    ctx.lineTo(FX + 6, BOT);
    ctx.lineTo(FX - 22, BOT);
    ctx.closePath();
    var g = ctx.createLinearGradient(FX + 16, 0, FX + 44, 0);
    U.stop(g, 0, 'rgba(255,255,255,0)');
    U.stop(g, 0.5, 'rgba(255,255,255,0.16)');
    U.stop(g, 1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
}

/* 底色要先铺：水画在它上面，所以分成 base / draw 两步。
 * 外圈那道木色是必须的 —— 水面只画在玻璃里，
 * 屏幕边缘这几个像素不铺满，真机上会留下上一帧的残影。 */
function base(ctx) {
    var wall = ctx.createLinearGradient(0, 0, 0, H);
    U.stop(wall, 0, '#101830');
    U.stop(wall, 1, '#080d1e');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);

    drawCard(ctx);
}

function draw(ctx) {
    drawGlassShade(ctx);
    drawGlare(ctx);
    drawWalls(ctx);
    hair(ctx, TOP, 0.7);
    hair(ctx, BOT, 0.7);
}

module.exports = {
    base: base,
    draw: draw
};
