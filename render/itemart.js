/* ============================================================
 * render/itemart.js · 商店道具图标（纯矢量手画）
 *
 * 原来图标是「一块色底 + 一个汉字」（料 / 珊 / 自 / 仓 / 缸）。
 * 问题有三个：
 *   1. 18px 的汉字在真机上笔画会糊成一坨，尤其「珊」「缸」；
 *   2. 汉字本身不带形状语义，玩家得先读一遍才知道是饲料还是鱼缸；
 *   3. 和 Q 版那套手绘小鱼不是一个语言（一个是字体，一个是贝塞尔）。
 * 所以改成和鱼同一套画法：色底块里放白色扁平造型 + 一条细墨线。
 *
 * 坐标约定：所有图形都在「图标边长 = 1」的本地坐标里画，
 * 原点在中心，范围约 -0.5 ~ 0.5。draw() 负责缩放到目标尺寸，
 * 于是 26px 的商店卡片和将来 80px 的大图用的是同一份路径。
 *
 * 注意：这里绝不改 globalAlpha —— 面板淡入时外层设了 globalAlpha，
 * 图标跟着一起淡才是对的；一旦写死 1 就会在打开动画里「先亮后暗」。
 * ============================================================ */

var U = require('./util.js');

var INK = '#3b2510';
var INK_SOFT = 'rgba(59,37,16,0.72)';

/* 统一描边：细到 26px 也不糊，但要足够压住白色块 */
function line(ctx, w) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
}

function white(ctx, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + (a === undefined ? 1 : a) + ')';
    ctx.fill();
}

/* ---------------- 五个图标 ---------------- */

/* 高级饲料：罐头（盖 + 标签带 + 三颗颗粒）
 * 试过「盖和罐身一样宽」的版本 —— 两个白方块叠在一起，27px 下读成一块芯片。
 * 罐身必须比盖窄、并且有一条深色标签带，才会被认成「容器」。 */
function feed(ctx) {
    /* 罐身 */
    U.roundRect(ctx, -0.35, -0.31, 0.70, 0.77, 0.14);
    white(ctx, 1);
    line(ctx, 0.075);

    /* 标签带：裁进罐身再铺，四角不会戳出来 */
    ctx.save();
    U.roundRect(ctx, -0.35, -0.31, 0.70, 0.77, 0.14);
    ctx.clip();
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(-0.40, 0.00, 0.80, 0.16);
    ctx.restore();

    /* 盖 */
    U.roundRect(ctx, -0.45, -0.47, 0.90, 0.19, 0.08);
    white(ctx, 1);
    line(ctx, 0.075);

    /* 三颗颗粒落在标签带上，错开摆才不会读成「三个点」 */
    var dots = [[-0.13, 0.08], [0.14, 0.08], [0.00, 0.08]];
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < dots.length; i++) {
        ctx.beginPath();
        ctx.arc(dots[i][0], dots[i][1], 0.062, 0, 6.2832);
        ctx.fill();
    }
}

/* 珊瑚摆件：礁石 + 三根粗细不同的圆头指枝
 * 这一格试错最多，记下来省得再走一遍：
 *   v1 三根细枝 → 读成字母「Y」；
 *   v2 三个圆球 + 礁石 → 读成雪人 / 熊猫头（球一叠就有眼睛的错觉）。
 * 结论：小尺寸要靠「粗细 + 高低差」，所以改成三根圆头柱，
 * 长短错开、宽窄错开，剪影就只可能是珊瑚丛。 */
function coral(ctx) {
    /* 每根从礁石里「长」出来：以根部为轴转一点角度，向外张开 */
    var arms = [
        [-0.26, 0.40, 0.165, -0.18],   /* 左矮，往左倒 */
        [0.24, 0.46, 0.160, 0.16],     /* 右中，往右倒 */
        [0.00, 0.70, 0.200, 0.00]      /* 中间最高最粗，直立 */
    ];
    for (var i = 0; i < arms.length; i++) {
        var a = arms[i];
        ctx.save();
        ctx.translate(a[0], 0.30);
        ctx.rotate(a[3]);
        U.roundRect(ctx, -a[2] / 2, -a[1], a[2], a[1] + 0.10, a[2] / 2);
        white(ctx, 1);
        line(ctx, 0.07);
        ctx.restore();
    }

    /* 礁石压在最下面，遮住枝根 */
    U.roundRect(ctx, -0.42, 0.27, 0.84, 0.21, 0.10);
    white(ctx, 0.95);
    line(ctx, 0.07);
}

/* 自动喂食器：齿轮（八齿 + 轴孔） */
function auto(ctx, bg) {
    for (var i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 4);
        U.roundRect(ctx, -0.10, -0.49, 0.20, 0.21, 0.05);
        white(ctx, 1);
        line(ctx, 0.06);
        ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 0.34, 0, 6.2832);
    white(ctx, 1);
    line(ctx, 0.075);

    /* 轴孔填底色才像「洞」；用半透明墨色在深色块上会发灰 */
    ctx.beginPath();
    ctx.arc(0, 0, 0.145, 0, 6.2832);
    ctx.fillStyle = bg || '#8a6d1f';
    ctx.fill();
}

/* 仓库扩容：木箱（外框 + 内框 + 交叉板条） */
function warehouse(ctx) {
    U.roundRect(ctx, -0.46, -0.42, 0.92, 0.85, 0.10);
    white(ctx, 1);
    line(ctx, 0.08);

    U.roundRect(ctx, -0.32, -0.28, 0.64, 0.57, 0.05);
    line(ctx, 0.062);

    ctx.beginPath();
    ctx.moveTo(-0.32, -0.28);
    ctx.lineTo(0.32, 0.29);
    ctx.moveTo(0.32, -0.28);
    ctx.lineTo(-0.32, 0.29);
    line(ctx, 0.062);
}

/* 新鱼缸：圆口玻璃缸（水 + 一条小鱼 + 缸口 + 底座）
 * 方缸试了两版都读成「显示器」—— 方框 + 一条横的水位线，
 * 和屏幕太像了。换成金鱼缸的圆肚剪影，一眼就不会认错。 */
function tank(ctx) {
    var R = 0.38;          /* 缸肚半径 */
    var CY = 0.02;         /* 缸肚中心 */

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, CY, R, 0, 6.2832);
    ctx.clip();

    /* 水面：两条反向二次曲线，才是「晃着的水」 */
    ctx.beginPath();
    ctx.moveTo(-R - 0.02, CY - 0.04);
    ctx.quadraticCurveTo(-R * 0.42, CY - 0.12, 0, CY - 0.04);
    ctx.quadraticCurveTo(R * 0.42, CY + 0.04, R + 0.02, CY - 0.05);
    ctx.lineTo(R + 0.02, CY + R + 0.05);
    ctx.lineTo(-R - 0.02, CY + R + 0.05);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    /* 小鱼：缸里唯一的深色块，视线先落这儿 */
    ctx.fillStyle = INK_SOFT;
    ctx.beginPath();
    U.ellipse(ctx, 0.05, CY + 0.19, 0.135, 0.09, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.05, CY + 0.19);
    ctx.lineTo(-0.20, CY + 0.10);
    ctx.lineTo(-0.20, CY + 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    /* 缸肚轮廓 */
    ctx.beginPath();
    ctx.arc(0, CY, R, 0, 6.2832);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.085;
    ctx.stroke();

    /* 缸口：一圈扁椭圆，缸才「开口」了 */
    ctx.beginPath();
    U.ellipse(ctx, 0, CY - R * 0.80, R * 0.86, 0.072, 0);
    white(ctx, 0.9);
    line(ctx, 0.065);

    /* 冒到水面上的两颗气泡 */
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0.19, CY - 0.14, 0.05, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.09, CY - 0.24, 0.034, 0, 6.2832);
    ctx.fill();

    /* 底座 */
    U.roundRect(ctx, -0.25, CY + R - 0.06, 0.50, 0.15, 0.06);
    white(ctx, 1);
    line(ctx, 0.065);
}

/* 金币：唯一一个「不白」的图标 —— 白圆加内圈在 28px 下会读成靶心，
 * 金币本身就该是金的，干脆直接上金色渐变，放在任何色底上都成立。 */
function coin(ctx) {
    var g = ctx.createLinearGradient(0, -0.4, 0, 0.4);
    g.addColorStop(0, '#ffe680');
    g.addColorStop(0.55, '#f8c62e');
    g.addColorStop(1, '#e09a12');

    ctx.beginPath();
    ctx.arc(0, 0, 0.40, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    line(ctx, 0.075);

    ctx.beginPath();
    ctx.arc(0, 0, 0.255, 0, 6.2832);
    ctx.strokeStyle = 'rgba(140,84,6,0.6)';
    ctx.lineWidth = 0.05;
    ctx.stroke();

    ctx.beginPath();
    var R = 0.155, r = 0.05;
    for (var i = 0; i < 8; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 4;
        var rad = (i % 2 === 0) ? R : r;
        var px = Math.cos(a) * rad;
        var py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,90,8,0.85)';
    ctx.fill();

    /* 左上角一点高光，金色才有金属感 */
    ctx.beginPath();
    ctx.arc(-0.13, -0.15, 0.075, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
}

/* 商店：遮阳棚 + 店面 + 门
 * 棚上两条深色条纹是必需的 —— 没有条纹，梯形会被读成「屋顶」。 */
function shop(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.46, -0.44);
    ctx.lineTo(0.46, -0.44);
    ctx.lineTo(0.40, -0.16);
    ctx.lineTo(-0.40, -0.16);
    ctx.closePath();
    white(ctx, 1);
    line(ctx, 0.07);

    /* 条纹裁进棚里，四角不会戳出来 */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-0.46, -0.44);
    ctx.lineTo(0.46, -0.44);
    ctx.lineTo(0.40, -0.16);
    ctx.lineTo(-0.40, -0.16);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(-0.13, -0.46, 0.10, 0.32);
    ctx.fillRect(0.15, -0.46, 0.10, 0.32);
    ctx.restore();

    U.roundRect(ctx, -0.36, -0.13, 0.72, 0.55, 0.08);
    white(ctx, 1);
    line(ctx, 0.075);

    U.roundRect(ctx, -0.13, 0.10, 0.26, 0.32, 0.05);
    ctx.fillStyle = INK_SOFT;
    ctx.fill();
}

var ART = {
    feed: feed,
    coral: coral,
    auto: auto,
    warehouse: warehouse,
    tank: tank,
    coin: coin,
    shop: shop
};

/* ---------------- 入口 ---------------- */

/**
 * 在 (cx, cy) 画一个边长 size 的图标。
 * bg 是所在色块的底色，只在「需要挖洞」的图标（齿轮轴孔）里用到。
 */
function draw(ctx, id, cx, cy, size, bg) {
    var fn = ART[id] || ART.feed;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(size, size);
    fn(ctx, bg);
    ctx.restore();
}

module.exports = {
    draw: draw
};
