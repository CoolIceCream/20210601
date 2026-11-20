/* ============================================================
 * tools/icon-sheet.js · 道具图标对照表（只在浏览器里跑）
 *
 * 每个道具画三档：160px（看设计）、64px（卡片放大）、30px（商店实际尺寸），
 * 以及一张 1:1 的卡片预览。30px 才是真正的验收标准。
 * 生成：PREVIEW_ENTRY=tools/icon-sheet.js PREVIEW_OUT=icon-sheet.bundle.js node tools/build-preview.js
 * 打开：tools/icon-sheet.html
 * ============================================================ */

var itemArt = require('../render/itemart.js');
var U = require('../render/util.js');
var items = require('../config/items.js');

var CW = 250;
var CH = 300;
var PAD = 10;
var SIZES = [128, 56, 30];
var W = items.length * CW;
var H = CH;

var dpr = 2;
var cv = document.createElement('canvas');
cv.width = W * dpr;
cv.height = H * dpr;
cv.style.width = W + 'px';
cv.style.height = H + 'px';
document.body.appendChild(cv);

var ctx = cv.getContext('2d');
ctx.scale(dpr, dpr);

var bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#fffdf6');
bg.addColorStop(1, '#ffeed0');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

/* 图标必须垫色块 —— 白图形画在奶油底上等于隐身 */
function tiled(cx, cy, size, id, color) {
    var t = size + 14;
    U.roundRect(ctx, cx - t / 2, cy - t / 2, t, t, t * 0.31);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(107,68,35,0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    itemArt.draw(ctx, id, cx, cy, size, color);
}

for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cx = i * CW;

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(cx + PAD, PAD, CW - PAD * 2, H - PAD * 2);

    /* 尺寸越大越靠左，小的排右侧 */
    tiled(cx + 88, 92, SIZES[0], it.icon, it.iconBg);
    tiled(cx + 182, 78, SIZES[1], it.icon, it.iconBg);
    tiled(cx + 226, 78, SIZES[2], it.icon, it.iconBg);

    /* 1:1 还原商店卡片里的那一小块 */
    ctx.save();
    U.roundRect(ctx, cx + 40, 186, 42, 42, 13);
    ctx.fillStyle = it.iconBg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(107,68,35,0.5)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    itemArt.draw(ctx, it.icon, cx + 61, 207, 30, it.iconBg);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = '#5a3a1a';
    ctx.fillText(it.name, cx + 96, 192);
    ctx.font = '400 11px sans-serif';
    ctx.fillStyle = '#7d5c34';
    ctx.fillText(it.icon + ' · ' + it.iconBg, cx + 96, 214);
    ctx.fillText('140 / 64 / 30 px', cx + 40, 244);
}
