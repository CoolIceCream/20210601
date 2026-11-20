/* ============================================================
 * render/theme.js · Q 版视觉规范（M2 换肤）
 *
 * 参考 QQ 农场那一类微信小游戏的观感：
 *   · 米白/奶油底 + 深棕描边，不用冷色玻璃
 *   · 按钮是「果冻块」：底部有厚度、顶部有高光、边缘有 2~3px 深色描边
 *   · 数字和标题用描边字，远看也清楚
 *
 * 所有界面都只从这里取色、取形状，改风格只改这一个文件。
 * ============================================================ */

var T = {
    /* 线条与文字 */
    ink: '#6b4423',
    inkLight: '#a9845a',
    text: '#5a3a1a',
    textSoft: '#9a7a52',
    textOnDark: '#fffdf5',

    /* 卡片：奶油白 */
    cardTop: '#fffdf6',
    cardBottom: '#ffefd2',
    cardDeep: 'rgba(140,98,52,0.28)',

    /* 主按钮：蜂蜜黄 */
    yellowTop: '#ffe977',
    yellowBottom: '#ffb524',
    yellowDeep: 'rgba(176,105,20,0.42)',

    /* 次按钮：草绿 */
    greenTop: '#a5e97a',
    greenBottom: '#57b93c',
    greenDeep: 'rgba(38,104,30,0.4)',

    /* 禁用 / 未解锁 */
    greyTop: '#efe6d2',
    greyBottom: '#d8c9ab',
    greyDeep: 'rgba(120,98,66,0.22)',

    /* 强调色 */
    mint: '#3fb98a',
    coral: '#ff8a5c',
    sky: '#54c9ef',

    /* M6：参考手游那种明快感 —— 外圈从木色换成天空色，
     * 资源条和按钮改用「白底 + 深棕描边」，靠彩色徽章区分功能 */
    skyTop: '#eaf9ff',
    skyBottom: '#bee4f6',
    badgeInk: '#8a5a2a'
};

function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r == null ? 16 : r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

/**
 * 果冻块。opt:
 *   top/bottom  渐变色
 *   deep        底部厚度色
 *   r           圆角
 *   depth       底部厚度（0 表示不要）
 *   ink         描边色（传 null 不描边）
 *   lw          描边宽度
 *   gloss       false 关掉顶部高光
 */
function jelly(ctx, x, y, w, h, opt) {
    opt = opt || {};
    var r = opt.r == null ? Math.min(h * 0.44, 18) : opt.r;
    var depth = opt.depth == null ? Math.max(3, Math.round(h * 0.1)) : opt.depth;

    /* 底部厚度：整体下移一点画一层深色，主体压在上面 */
    if (depth > 0) {
        rr(ctx, x, y + depth, w, h, r);
        ctx.fillStyle = opt.deep || T.cardDeep;
        ctx.fill();
    }

    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opt.top || T.cardTop);
    g.addColorStop(1, opt.bottom || T.cardBottom);
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();

    if (opt.ink !== null) {
        ctx.strokeStyle = opt.ink || T.ink;
        ctx.lineWidth = opt.lw || 2.4;
        ctx.stroke();
    }

    if (opt.gloss !== false && h >= 26) {
        ctx.save();
        rr(ctx, x + w * 0.09, y + h * 0.1, w * 0.82, Math.max(6, h * 0.3), Math.min(h * 0.16, 9));
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
        ctx.restore();
    }
}

/* 卡片：比按钮薄一点的立体感，不带高光 */
function card(ctx, x, y, w, h, opt) {
    opt = opt || {};
    jelly(ctx, x, y, w, h, {
        r: opt.r == null ? 18 : opt.r,
        depth: opt.depth == null ? 3 : opt.depth,
        top: opt.top || T.cardTop,
        bottom: opt.bottom || T.cardBottom,
        deep: opt.deep || T.cardDeep,
        ink: opt.ink === undefined ? T.ink : opt.ink,
        lw: opt.lw || 2.2,
        gloss: false
    });
}

/* 圆形徽章：底部按钮和顶部头像都用它。
 * 和果冻块的区别是「圆 + 一圈顶部高光」，这是手游图标位的标准画法。 */
function badge(ctx, cx, cy, r, opt) {
    opt = opt || {};

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, opt.top || T.cardTop);
    g.addColorStop(1, opt.bottom || T.cardBottom);
    ctx.fillStyle = g;
    ctx.fill();

    if (opt.ink !== null) {
        ctx.strokeStyle = opt.ink || T.ink;
        ctx.lineWidth = opt.lw || 2.4;
        ctx.stroke();
    }

    if (opt.gloss !== false) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.2, r * 0.7, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = Math.max(2, r * 0.2);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }
}

/* 描边字：Q 版标题常用，白字 + 深棕边 */
function textOutlined(ctx, txt, x, y, size, fill, ink, lw) {
    ctx.font = '800 ' + size + 'px sans-serif';
    if (ink !== null) {
        ctx.lineWidth = lw || Math.max(2, size * 0.18);
        ctx.strokeStyle = ink || T.ink;
        ctx.lineJoin = 'round';
        ctx.strokeText(txt, x, y);
    }
    ctx.fillStyle = fill || T.textOnDark;
    ctx.fillText(txt, x, y);
}

/* 普通正文（不带描边，深棕） */
function text(ctx, txt, x, y, size, color, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px sans-serif';
    ctx.fillStyle = color || T.text;
    ctx.fillText(txt, x, y);
}

module.exports = {
    T: T,
    rr: rr,
    jelly: jelly,
    badge: badge,
    card: card,
    textOutlined: textOutlined,
    text: text
};
