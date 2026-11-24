/* ============================================================
 * render/theme.js · 和风视觉规范（阴阳师方向）
 *
 * 深墨蓝底 + 描金细线 + 朱红印章 + 樱花点缀，
 * 参考阴阳师的「夜庭院 / 探索」配色。所有界面都只从这里取色、
 * 取形状，改风格只改这一个文件（其余模块写死的少量颜色同步改）。
 *
 * 接口保持向后兼容：T 上原有的字段名全部保留，只是换成和风色值，
 * 这样 hud/sheet/codex/sell/modal 不用改结构就能整体换肤。
 * ============================================================ */

var T = {
    /* 线条与文字 —— 描金与浅金 */
    ink: '#c8a45c',          /* 主描边：金 */
    inkLight: '#8a6f3c',     /* 次级描边：暗金 */
    text: '#e8d4a0',         /* 正文：浅金 */
    textSoft: '#a4956e',     /* 次要文字：暗金 */
    textOnDark: '#fff3d2',   /* 深底上的强调字 */

    /* 卡片：深墨牌匾（原奶油白） */
    cardTop: '#263150',
    cardBottom: '#1a2340',
    cardDeep: 'rgba(6,10,24,0.55)',

    /* 主按钮：朱红印章（原蜂蜜黄） */
    yellowTop: '#c55342',
    yellowBottom: '#8f2f27',
    yellowDeep: 'rgba(74,18,14,0.55)',

    /* 次按钮：描金（原草绿） */
    greenTop: '#d8b96e',
    greenBottom: '#a8802f',
    greenDeep: 'rgba(74,54,16,0.5)',

    /* 禁用 / 未解锁：冷墨灰 */
    greyTop: '#303a58',
    greyBottom: '#232c46',
    greyDeep: 'rgba(6,10,24,0.42)',

    /* 强调色 */
    mint: '#6fbf9e',
    coral: '#c55342',
    sky: '#7aa8cf',

    /* 和风专用 */
    gold: '#c8a45c',
    goldLight: '#e8d4a0',
    goldDeep: '#8a6f3c',
    vermilion: '#a6332e',    /* 朱红印章 */
    sakura: '#e8b8c4',       /* 樱花粉 */
    night: '#141d33',        /* 深墨夜底 */
    nightDeep: '#0e1426',    /* 更深的墨 */

    /* 面板底色（原天空蓝） */
    skyTop: '#263150',
    skyBottom: '#1a2340',
    badgeInk: '#c8a45c'
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
 * 牌匾块（原果冻块）。深底 + 金描边 + 淡金顶光。opt:
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
        ctx.fillStyle = 'rgba(232,212,160,0.14)';
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
 * 深底上改成「金圈 + 淡金顶光」 */
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
        ctx.strokeStyle = 'rgba(232,212,160,0.34)';
        ctx.lineWidth = Math.max(2, r * 0.2);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }
}

/* 描边字：深底上用浅金字 + 深墨描边 */
function textOutlined(ctx, txt, x, y, size, fill, ink, lw) {
    ctx.font = '800 ' + size + 'px sans-serif';
    if (ink !== null) {
        ctx.lineWidth = lw || Math.max(2, size * 0.18);
        ctx.strokeStyle = ink || T.nightDeep;
        ctx.lineJoin = 'round';
        ctx.strokeText(txt, x, y);
    }
    ctx.fillStyle = fill || T.textOnDark;
    ctx.fillText(txt, x, y);
}

/* 普通正文（不带描边，浅金） */
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
