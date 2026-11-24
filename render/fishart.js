/* ============================================================
 * render/fishart.js · Q 版小鱼（纯矢量，无贴图）
 *
 * 换成 Q 版界面后，水彩贴图和果冻按钮放一起太「写实」，
 * 这里用贝塞尔手绘一套卡通鱼：圆胖身体、大眼、腮红、小嘴、
 * 顶光高光、心形尾鳍 —— 和 theme.js 的果冻按钮同一种语言。
 *
 * 坐标约定：+x 是鱼头方向，原点在身体中心。
 * dir = -1 时整体水平镜像，tilt 也跟着镜像（和原来贴图一致）。
 *
 * 体型差异靠 LOOK 表参数化（半长/半高/尾长/尾型/花纹），
 * 九个物种共用一套画法，只改比例，包体几乎不增。
 * ============================================================ */

var U = require('./util.js');
var fishLib = require('../core/fish.js');

/* 9 套和风配色：[主色, 暗部色]，索引对应 config/species.js 的 palette。
 * 阴阳师方向：锦鲤红白、黄金、墨、绯、紫藤、青瓷 —— 形体仍是 Q 版。 */
var PALETTE = [
    ['#f2c15a', '#b8701f'],   /* 0 黄金（小金鱼） */
    ['#9fd8e8', '#2f7f9e'],   /* 1 青瓷蓝（蓝泡泡 / 幽蓝斗鱼） */
    ['#ffd2d8', '#d96a86'],   /* 2 樱粉（桃花鲤） */
    ['#f7d878', '#c08a1c'],   /* 3 金（金灯 / 金龙） */
    ['#c9b6ee', '#6f52b4'],   /* 4 紫藤（紫罗兰） */
    ['#a8e0c4', '#1f8f72'],   /* 5 青（备用） */
    ['#f4a08e', '#b83a2e'],   /* 6 绯红（朱锦鲤 / 红箭） */
    ['#eef2f4', '#8a9bab'],   /* 7 白（备用） */
    ['#b9c6d2', '#4a6276']    /* 8 鲨鱼墨灰 */
];

/* 每个物种的外形参数
 *   a/b    半长、半高（相对体型基准 L 的倍率）
 *   len    尾鳍长度系数
 *   spread 尾鳍张开度
 *   notch  尾鳍凹口深度（0 = 平尾，0.5 = 燕尾）
 *   pat    花纹：null / 'spot' / 'stripe'
 *   barbel 龙须
 */
var LOOK = {
    gold_fish: { a: 0.46, b: 0.40, len: 0.58, spread: 1.00, notch: 0.46, pat: null },
    blue_zebra: { a: 0.46, b: 0.40, len: 0.60, spread: 1.04, notch: 0.46, pat: 'stripe' },
    peach_koi: { a: 0.50, b: 0.36, len: 0.56, spread: 0.96, notch: 0.44, pat: 'spot' },
    gold_lamp: { a: 0.44, b: 0.43, len: 0.56, spread: 1.00, notch: 0.46, pat: null },
    violet: { a: 0.46, b: 0.41, len: 0.58, spread: 1.00, notch: 0.46, pat: null },
    jade: { a: 0.50, b: 0.37, len: 0.58, spread: 1.00, notch: 0.46, pat: 'spot' },
    dusk_betta: { a: 0.44, b: 0.44, len: 0.95, spread: 1.24, notch: 0.52, pat: null },
    red_arrow: { a: 0.54, b: 0.31, len: 0.64, spread: 0.76, notch: 0.30, pat: null },
    gold_dragon: { a: 0.56, b: 0.33, len: 0.92, spread: 1.10, notch: 0.50, pat: 'stripe', barbel: true },
    reef_shark: { a: 0.60, b: 0.31, len: 0.62, spread: 0.86, notch: 0.60, pat: null, shark: true }
};

var EYE_INK = '#3a2418';
var CREAM = '#fffdf3';

/* ---------------- 颜色小工具 ---------------- */

function rgbOf(hex) {
    var s = hex.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/* c1 向 c2 混合，t=0 全 c1 */
function mix(c1, c2, t) {
    if (c1 === c2 || t <= 0) return c1;
    var x = rgbOf(c1);
    var y = rgbOf(c2);
    return 'rgb(' +
        Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
        Math.round(x[1] + (y[1] - x[1]) * t) + ',' +
        Math.round(x[2] + (y[2] - x[2]) * t) + ')';
}

/* 描边色：往深墨压暗，比纯黑柔和，和和风界面描边同一族 */
function inkOf(c) {
    return mix(c, '#1a1526', 0.66);
}

/* ---------------- 形状 ---------------- */

/* 蛋形鱼身：头在 +x，吻部竖直相切成圆头，尾根收成一小段竖面（被尾鳍盖住） */
function bodyPath(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.bezierCurveTo(a * 1.00, -b * 0.36, a * 0.84, -b * 0.88, a * 0.28, -b * 1.02);
    ctx.bezierCurveTo(-a * 0.26, -b * 1.02, -a * 0.76, -b * 0.52, -a * 0.86, -b * 0.08);
    ctx.lineTo(-a * 0.86, b * 0.08);
    ctx.bezierCurveTo(-a * 0.76, b * 0.52, -a * 0.26, b * 1.02, a * 0.28, b * 1.02);
    ctx.bezierCurveTo(a * 0.84, b * 0.88, a * 1.00, b * 0.36, a, 0);
    ctx.closePath();
}

/* 尾鳍：心形/燕尾，根深尖浅，叶尖随 wag 上下摆 */
function drawTail(ctx, a, b, lk, wag, c2, ink) {
    var len = lk.len;
    var sp = lk.spread;
    var x0 = -a * 0.50;
    var xTip = -a * (1 + len);
    var yTip = b * sp;
    var xN = -a * (1 + len * lk.notch);
    var w = wag;

    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(-a * 0.92, -b * 0.50 + w * 0.30, -a * (1 + len * 0.55), -yTip * 0.80 + w * 0.75, xTip + w * 0.45, -yTip + w);
    ctx.bezierCurveTo(xN + a * 0.10, -yTip * 0.52 + w * 0.70, xN + a * 0.14, -yTip * 0.18 + w * 0.45, xN, w * 0.30);
    ctx.bezierCurveTo(xN + a * 0.14, yTip * 0.18 + w * 0.45, xN + a * 0.10, yTip * 0.52 + w * 0.70, xTip + w * 0.45, yTip + w);
    ctx.bezierCurveTo(-a * (1 + len * 0.55), yTip * 0.80 + w * 0.75, -a * 0.92, b * 0.50 + w * 0.30, x0, 0);
    ctx.closePath();

    var tg = ctx.createLinearGradient(-a * 0.5, 0, xTip, 0);
    U.stop(tg, 0, c2);
    U.stop(tg, 0.5, mix(c2, '#ffffff', 0.20));
    U.stop(tg, 1, mix(c2, '#ffffff', 0.46));
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.4, a * 0.10);
    ctx.lineJoin = 'round';
    ctx.stroke();
}

/* 背鳍：矮而宽的圆扇形，长在背线中后段 */
function drawDorsal(ctx, a, b, wag, fill, ink) {
    ctx.beginPath();
    ctx.moveTo(-a * 0.02, -b * 0.99);
    ctx.bezierCurveTo(-a * 0.14, -b * 1.42 + wag * 0.2, -a * 0.42, -b * 1.36 + wag * 0.2, -a * 0.56, -b * 0.84);
    ctx.quadraticCurveTo(-a * 0.28, -b * 0.94, -a * 0.02, -b * 0.99);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.3, a * 0.075);
    ctx.lineJoin = 'round';
    ctx.stroke();
}

/* ---- 鲨鱼的三个特征件：新月尾、尖背鳍、胸鳍 ----
 * 都在小鱼尺寸（L≈40）下画的，宁可形状夸张也别堆细节。 */
function drawSharkTail(ctx, a, b, lk, wag, c2, ink) {
    var x0 = -a * 0.48;
    var xt = -a * (1 + lk.len);
    var xn = -a * (1 + lk.len * 0.34);
    var top = -b * 1.62 + wag;
    var bot = b * 1.12 + wag * 0.7;

    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(-a * 0.90, -b * 0.52, xt, top);
    ctx.quadraticCurveTo(xn + a * 0.08, -b * 0.20 + wag * 0.25, xn, wag * 0.12);
    ctx.quadraticCurveTo(xn + a * 0.06, b * 0.38 + wag * 0.25, xt * 0.93, bot);
    ctx.quadraticCurveTo(-a * 0.90, b * 0.48, x0, 0);
    ctx.closePath();

    var g = ctx.createLinearGradient(x0, 0, xt, 0);
    U.stop(g, 0, c2);
    U.stop(g, 1, mix(c2, '#ffffff', 0.26));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.4, a * 0.085);
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawSharkDorsal(ctx, a, b, wag, fill, ink) {
    ctx.beginPath();
    ctx.moveTo(-a * 0.04, -b * 0.96);
    ctx.quadraticCurveTo(-a * 0.16, -b * 1.50 + wag * 0.16,
        -a * 0.42, -b * 1.92 + wag * 0.12);
    ctx.lineTo(-a * 0.60, -b * 0.86);
    ctx.quadraticCurveTo(-a * 0.32, -b * 0.96, -a * 0.04, -b * 0.96);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.3, a * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawSharkPectoral(ctx, a, b, wag, fill, ink) {
    ctx.beginPath();
    ctx.moveTo(a * 0.12, b * 0.30);
    ctx.lineTo(-a * 0.38, b * 1.46 + wag * 0.16);
    ctx.lineTo(-a * 0.12, b * 0.36);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.2, a * 0.065);
    ctx.lineJoin = 'round';
    ctx.stroke();
}

/* 词条鱼身后的金色光晕 */
function traitGlow(ctx, a) {
    var r = a * 1.75;
    var g = ctx.createRadialGradient(0, 0, a * 0.15, 0, 0, r);
    U.stop(g, 0, 'rgba(255,226,122,0.34)');
    U.stop(g, 0.55, 'rgba(255,214,106,0.15)');
    U.stop(g, 1, 'rgba(255,214,106,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
}

/* ---------------- 主绘制 ---------------- */

/**
 * opt:
 *   speciesId  物种 id
 *   L          体型基准（约等于鱼苗到成鱼的 38~68）
 *   t          全局时间（秒）
 *   phase      个体相位，避免整缸同步摆尾
 *   dir        1 朝右 / -1 朝左
 *   tilt       俯仰（弧度）
 *   wag        摆尾幅度 0~1.2
 *   belly      饱腹 0~1，越饱肚子越白
 *   growth     成长 0~100，越小眼睛越大
 *   hunger     饱食度，低于 20 显得没精神
 *   glow       词条光晕
 */
function draw(ctx, o) {
    var sp = fishLib.speciesById(o.speciesId);
    var lk = LOOK[sp.id] || LOOK.gold_fish;
    var pair = PALETTE[sp.palette] || PALETTE[0];
    var c1 = pair[0];
    var c2 = pair[1];
    var ink = inkOf(c2);

    var L = o.L || 44;
    var a = L * lk.a;
    var b = L * lk.b;
    var t = o.t || 0;
    var ph = o.phase || 0;
    var belly = U.clamp(o.belly == null ? 0.35 : o.belly, 0, 1);
    var growth = o.growth == null ? 100 : o.growth;
    var hungry = o.hunger != null && o.hunger < 20;

    /* 摆尾：幅度小一点，太快像抽筋 */
    var amp = (o.wag == null ? 0.55 : o.wag);
    var wag = Math.sin(t * 7.2 + ph) * b * 0.42 * amp;

    /* 鱼苗眼睛占比更大，更萌 */
    var eyeK = 1.16 - growth * 0.0016;

    ctx.save();
    ctx.globalAlpha = hungry ? 0.78 : 1;
    ctx.rotate((o.dir || 1) * (o.tilt || 0));
    ctx.scale(o.dir || 1, 1);

    if (o.glow) traitGlow(ctx, a);

    /* 1. 尾鳍 / 胸鳍 / 背鳍：都压在身体下面 */
    if (lk.shark) {
        drawSharkTail(ctx, a, b, lk, wag, c2, ink);
        drawSharkPectoral(ctx, a, b, wag, mix(c2, '#ffffff', 0.06), ink);
        drawSharkDorsal(ctx, a, b, wag, mix(c2, '#ffffff', 0.12), ink);
    } else {
        drawTail(ctx, a, b, lk, wag, c2, ink);
        drawDorsal(ctx, a, b, wag, mix(c2, '#ffffff', 0.12), ink);
    }

    /* 3. 身体 */
    var bg = ctx.createLinearGradient(0, -b * 1.12, 0, b * 1.12);
    U.stop(bg, 0, mix(c1, '#ffffff', 0.30));
    U.stop(bg, 0.46, c1);
    U.stop(bg, 1, c2);
    bodyPath(ctx, a, b);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = Math.max(1.8, L * 0.048);
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';
    ctx.stroke();

    /* 4. 肚子、高光、花纹：裁在身体里画，不会溢出轮廓 */
    ctx.save();
    bodyPath(ctx, a, b);
    ctx.clip();

    /* 奶白肚皮 */
    ctx.globalAlpha = 0.34 + belly * 0.40;
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    U.ellipse(ctx, a * 0.12, b * 0.68, a * 0.72, b * 0.44, 0);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* 鱼苗在缸里只有 40px 上下，花纹和高光点看不出来，按体型砍掉省绘制量 */
    var detail = o.detail == null ? L >= 46 : o.detail;

    /* 顶部果冻高光 */
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    U.ellipse(ctx, a * 0.12, -b * 0.62, a * 0.32, b * 0.18, -0.22);
    ctx.fill();
    if (detail) {
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.beginPath();
        U.ellipse(ctx, -a * 0.40, -b * 0.26, a * 0.13, b * 0.09, -0.5);
        ctx.fill();
    }

    /* 花纹 */
    if (detail && lk.pat === 'spot') {
        ctx.fillStyle = U.hexA(mix(c2, '#ffffff', 0.45), 0.62);
        var spots = [
            [a * 0.02, -b * 0.42, b * 0.21],
            [-a * 0.30, -b * 0.08, b * 0.17],
            [-a * 0.54, b * 0.30, b * 0.14]
        ];
        for (var i = 0; i < spots.length; i++) {
            ctx.beginPath();
            U.ellipse(ctx, spots[i][0], spots[i][1], spots[i][2], spots[i][2] * 0.82, 0);
            ctx.fill();
        }
    } else if (detail && lk.pat === 'stripe') {
        ctx.fillStyle = U.hexA(mix(c2, '#ffffff', 0.30), 0.34);
        for (var j = 0; j < 3; j++) {
            ctx.beginPath();
            U.ellipse(ctx, a * (0.10 - j * 0.26), 0, a * 0.05, b * 0.74, -0.10);
            ctx.fill();
        }
    }

    ctx.restore();

    /* 5. 留白：不再画鳃盖/胸鳍。
     * 试过鳃盖弧和胸鳍扇形，在这个体型下都会读成「裂口」或「口水泡」，
     * 眼睛 + 小嘴 + 腮红 + 背鳍的信息量已经够，干净反而更像 Q 版。 */

    /* 6. 腮红 */
    ctx.fillStyle = 'rgba(255,138,150,0.38)';
    ctx.beginPath();
    U.ellipse(ctx, a * 0.28, b * 0.32, a * 0.17, b * 0.11, -0.16);
    ctx.fill();

    /* 7. 眼睛：大眼白 + 大瞳 + 两点高光 */
    var ex = a * 0.40;
    var ey = -b * 0.24;
    var rb = b * 0.37 * eyeK;
    var pr = rb * (hungry ? 0.44 : 0.56);

    ctx.beginPath();
    ctx.arc(ex, ey, rb, 0, 6.2832);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = U.hexA(ink, 0.55);
    ctx.lineWidth = Math.max(1, L * 0.03);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ex + rb * 0.18, ey + rb * 0.06, pr, 0, 6.2832);
    ctx.fillStyle = EYE_INK;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + rb * 0.02, ey - rb * 0.14, pr * 0.42, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + rb * 0.40, ey + rb * 0.26, pr * 0.20, 0, 6.2832);
    ctx.fill();

    /* 8. 小嘴 */
    ctx.beginPath();
    ctx.moveTo(a * 0.74, b * 0.06);
    ctx.quadraticCurveTo(a * 0.84, b * 0.26, a * 0.96, b * 0.03);
    ctx.strokeStyle = U.hexA(ink, 0.80);
    ctx.lineWidth = Math.max(1.2, L * 0.036);
    ctx.lineCap = 'round';
    ctx.stroke();

    /* 鲨鱼的小尖牙：只有大图才画，缸里那点尺寸画了也是糊的 */
    if (lk.shark && detail) {
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        for (var ti = 0; ti < 3; ti++) {
            var tx = a * (0.76 + ti * 0.065);
            ctx.beginPath();
            ctx.moveTo(tx, b * 0.10);
            ctx.lineTo(tx + a * 0.032, b * 0.23);
            ctx.lineTo(tx + a * 0.064, b * 0.10);
            ctx.closePath();
            ctx.fill();
        }
    }

    /* 9. 龙须 */
    if (lk.barbel) {
        ctx.strokeStyle = U.hexA(ink, 0.55);
        ctx.lineWidth = Math.max(1, L * 0.022);
        ctx.beginPath();
        ctx.moveTo(a * 0.94, -b * 0.04);
        ctx.quadraticCurveTo(a * 1.26, b * 0.20, a * 1.16, b * 0.70);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a * 0.90, b * 0.16);
        ctx.quadraticCurveTo(a * 1.14, b * 0.42, a * 1.00, b * 0.86);
        ctx.stroke();
    }

    ctx.restore();
}

/* 商店卡片里画一条静止的展示鱼：自动缩放到外框内并居中 */
function drawThumb(ctx, speciesId, x, y, w, h, opt) {
    opt = opt || {};
    var sp = fishLib.speciesById(speciesId);
    var lk = LOOK[sp.id] || LOOK.gold_fish;
    /* 整鱼包围盒：头到 +a，尾到 -a*(1+len) */
    var half = lk.a * (2 + lk.len);
    var L = Math.min(w / half, h / (lk.b * 2.5));
    /* 尾巴比身体长，重心不在原点：整体右移 tail/2 才真的居中 */
    var shift = L * lk.a * lk.len * 0.5;
    ctx.save();
    ctx.translate(x + w * 0.5 + shift, y + h * 0.5);
    draw(ctx, {
        speciesId: speciesId,
        L: L,
        t: opt.t || 0,
        phase: opt.phase || 0,
        dir: 1,
        tilt: 0,
        wag: 0.25,
        belly: 0.7,
        growth: 100,
        detail: true,
        glow: !!opt.glow
    });
    ctx.restore();
}

module.exports = {
    draw: draw,
    drawThumb: drawThumb,
    LOOK: LOOK,
    PALETTE: PALETTE,
    paletteOf: function (speciesId) {
        var sp = fishLib.speciesById(speciesId);
        return PALETTE[sp.palette] || PALETTE[0];
    }
};
