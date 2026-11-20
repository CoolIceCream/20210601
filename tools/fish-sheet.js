/* ============================================================
 * tools/fish-sheet.js · 鱼种图鉴（只在浏览器里跑，用来核对画风）
 *
 * 九条成年鱼按 3x3 排开，每条画两档：大图看细节，小图看缸里观感。
 * 生成：PREVIEW_ENTRY=tools/fish-sheet.js PREVIEW_OUT=fish-sheet.bundle.js node tools/build-preview.js
 * 打开：tools/fish-sheet.html
 * ============================================================ */

var art = require('../render/fishart.js');
var lib = require('../core/fish.js');
var cfg = require('../config/index.js');

var COLS = 3;
var CW = 250;
var CH = 300;
var PAD = 10;

var list = lib.all;
var rows = Math.ceil(list.length / COLS);
var W = COLS * CW;
var BOTTOM = 300;
var H = rows * CH + BOTTOM;

var dpr = 2;
var cv = document.createElement('canvas');
cv.width = W * dpr;
cv.height = H * dpr;
cv.style.width = W + 'px';
cv.style.height = H + 'px';
document.body.appendChild(cv);

var ctx = cv.getContext('2d');
ctx.scale(dpr, dpr);

/* 水色背景，和缸里同一个色系 */
var bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#a8e2f2');
bg.addColorStop(1, '#5fb6d8');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

for (var i = 0; i < list.length; i++) {
    var sp = list[i];
    var cx = (i % COLS) * CW;
    var cy = Math.floor(i / COLS) * CH;

    /* 卡片底 */
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(cx + PAD, cy + PAD, CW - PAD * 2, CH - PAD * 2);

    /* 大图：成年体 */
    ctx.save();
    ctx.translate(cx + CW * 0.5, cy + 118);
    art.draw(ctx, {
        speciesId: sp.id,
        L: 122,
        t: 0.7,
        phase: i * 1.3,
        dir: 1,
        tilt: 0,
        wag: 0.5,
        belly: 0.7,
        growth: 100,
        glow: sp.rarity === 'SSR'
    });
    ctx.restore();

    /* 小图：缸里的实际尺寸对比 */
    ctx.save();
    ctx.translate(cx + CW * 0.5 + 46, cy + 214);
    art.draw(ctx, {
        speciesId: sp.id,
        L: 44,
        t: 0.7,
        phase: i * 1.3,
        dir: -1,
        tilt: 0.1,
        wag: 0.8,
        belly: 0.5,
        growth: 70
    });
    ctx.restore();

    /* 文字 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = '#5a3a1a';
    ctx.fillText(sp.name, cx + PAD + 8, cy + CH - 56);
    ctx.font = '400 11px sans-serif';
    ctx.fillStyle = '#7d5c34';
    ctx.fillText(sp.rarity + ' · ' + sp.id, cx + PAD + 8, cy + CH - 36);
}

/* ---------------- 缸内实景：20 条鱼挤在一起的真实观感 ---------------- */

var top = rows * CH;
var pad = 12;
var bx = pad;
var by = top + pad;
var bw = W - pad * 2;
var bh = BOTTOM - pad * 2;

var water = ctx.createLinearGradient(0, by, 0, by + bh);
water.addColorStop(0, '#7fd0ea');
water.addColorStop(1, '#3f9dc4');
ctx.fillStyle = water;
ctx.fillRect(bx, by, bw, bh);

ctx.save();
ctx.beginPath();
ctx.rect(bx, by, bw, bh);
ctx.clip();

/* 确定性伪随机：每次打开位置一致，方便对比 */
var seed = 20120;
function rnd() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
}

for (var k = 0; k < 20; k++) {
    var sp2 = list[k % list.length];
    var px = bx + 40 + rnd() * (bw - 90);
    var py = by + 34 + rnd() * (bh - 68);
    var dir = rnd() > 0.5 ? 1 : -1;
    ctx.save();
    ctx.translate(px, py);
    art.draw(ctx, {
        speciesId: sp2.id,
        L: 40 + rnd() * 26,
        t: 1.1,
        phase: rnd() * 6.28,
        dir: dir,
        tilt: (rnd() - 0.5) * 0.3,
        wag: 0.5 + rnd() * 0.5,
        belly: 0.4 + rnd() * 0.4,
        growth: 20 + rnd() * 80,
        glow: sp2.rarity === 'SSR' && rnd() > 0.5
    });
    ctx.restore();
}

ctx.restore();

ctx.font = '700 14px sans-serif';
ctx.fillStyle = '#5a3a1a';
ctx.textAlign = 'left';
ctx.fillText('缸内实景 · 20 条', bx + 10, by + 8);
