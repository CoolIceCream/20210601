/* ============================================================
 * render/codex.js · 鱼类图鉴（阴阳师 · 式神录风格）
 *
 * 视觉语言参考阴阳师的「式神录」：
 *   · 深墨底 + 描金细线，像翻开一卷夜色图录
 *   · 每格一张牌匾，已发现 = 彩鱼 + 名字，未发现 = 灰剪影 + ?
 *   · 稀有度用朱红/金/青分档 + 星数，不用字母角标
 *   · 点一格弹出详情卡：大图、介绍、成鱼身价、成熟时间、获取途径
 *
 * 只负责画。收录数据在 core/codex.js，命中区在 ui/layout.js。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var Th = require('./theme.js');
var TT = Th.T;
var art = require('./fishart.js');
var codex = require('../core/codex.js');
var wallet = require('../core/wallet.js');
var L = require('../ui/layout.js');

var W = C.W;
var H = C.H;
var rr = U.roundRect;

/* 式神录配色：深墨底 + 描金，庄重如夜庭图录 */
var CARD_TOP = TT.cardTop;
var CARD_BOTTOM = TT.cardBottom;
var INK = '#c8a45c';
var TEXT = '#e8d4a0';
var TEXT_SOFT = '#a4956e';
var GOLD = '#e0c170';
var GOLD_INK = '#4a3610';

/* 稀有度 → 颜色 + 星数（图鉴里不用字母） */
var RANK = {
    R:   { fill: '#2c4a44', ink: '#9fdcc0', star: 1 },
    SR:  { fill: '#3a3a5e', ink: '#c9b6ee', star: 2 },
    SSR: { fill: '#5a4030', ink: '#e0c170', star: 3 }
};

function rankOf(sp) {
    if (sp.secret) return { fill: '#5a2220', ink: '#f4a08e', star: 4 };
    return RANK[sp.rarity] || RANK.R;
}

/* ---------------- 装饰：星星 ---------------- */
function star(ctx, cx, cy, r, fill, ink, points) {
    var n = points || 5;
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / n;
        var rad = i % 2 === 0 ? r : r * 0.44;
        var px = cx + Math.cos(ang) * rad;
        var py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (ink) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

/* 背景星星：固定位置，不闪，避免整页闪瞎 */
function drawStars(ctx, top, t) {
    var pts = [
        [0.10, 0.10, 5], [0.22, 0.05, 3], [0.36, 0.13, 4], [0.52, 0.06, 3],
        [0.66, 0.11, 5], [0.80, 0.05, 3], [0.92, 0.14, 4], [0.06, 0.55, 3],
        [0.95, 0.62, 4], [0.15, 0.86, 3], [0.86, 0.90, 4]
    ];
    var area = H - top;
    for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var twinkle = 0.72 + 0.28 * Math.sin((t || 0) * 1.6 + i * 1.3);
        ctx.globalAlpha = 0.30 * twinkle;
        star(ctx, W * p[0], top + area * p[1], p[2], '#e8d4a0', null);
    }
    ctx.globalAlpha = 1;
}

/* ---------------- 图鉴格子 ---------------- */
function drawCard(ctx, item, r, t, ease) {
    var sp = item.sp;
    var rank = rankOf(sp);
    var found = item.found;

    /* 卡片底板 */
    if (found) {
        Th.jelly(ctx, r.x, r.y, r.w, r.h, {
            top: CARD_TOP, bottom: CARD_BOTTOM,
            deep: 'rgba(6,10,24,0.5)',
            r: 16, depth: 3, ink: 'rgba(200,164,92,0.6)', lw: 2
        });
    } else {
        Th.jelly(ctx, r.x, r.y, r.w, r.h, {
            top: '#1e2740', bottom: '#182035',
            deep: 'rgba(6,10,24,0.4)',
            r: 16, depth: 2, ink: 'rgba(200,164,92,0.3)', lw: 1.6, gloss: false
        });
    }

    /* 缩略图圆框 */
    var box = L.codexThumbRect(r);
    ctx.save();
    ctx.beginPath();
    ctx.arc(box.cx, box.cy, box.r, 0, Math.PI * 2);
    ctx.fillStyle = found ? '#141d33' : '#111828';
    ctx.fill();
    ctx.strokeStyle = found ? rank.ink : 'rgba(200,164,92,0.3)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.clip();

    if (found) {
        ctx.globalAlpha = ease;
        art.drawThumb(ctx, sp.id, box.cx - box.r, box.cy - box.r, box.r * 2, box.r * 2, {
            t: t || 0, phase: item.index * 1.7
        });
        ctx.globalAlpha = 1;
    } else {
        /* 未发现：灰鱼剪影 + 问号 */
        ctx.globalAlpha = 0.22;
        art.drawThumb(ctx, sp.id, box.cx - box.r, box.cy - box.r, box.r * 2, box.r * 2, {
            t: 0, phase: 0
        });
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        Th.textOutlined(ctx, '?', box.cx, box.cy + 1, 26, '#e8d4a0', '#1a1526', 3);
    }
    ctx.restore();

    /* 文字区 */
    var tx = r.x + 10 + box.r * 2 + 10;
    var tw = r.x + r.w - tx - 10;

    /* 编号 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 10px sans-serif';
    ctx.fillStyle = TEXT_SOFT;
    ctx.fillText('NO.' + (item.index < 10 ? '0' : '') + item.index, tx, r.y + 15);

    /* 名字：未发现打码，隐藏款发现后才露出 */
    ctx.font = '800 15px sans-serif';
    if (found) {
        Th.textOutlined(ctx, U.fitText(ctx, sp.name, tw), tx, r.y + 35, 15, TEXT, '#141d33', 3);
    } else {
        ctx.fillStyle = '#7a6e50';
        ctx.fillText('???', tx, r.y + 35);
    }

    /* 稀有度：色条 + 星数 */
    var barY = r.y + 50;
    rr(ctx, tx, barY, 46, 16, 8);
    ctx.fillStyle = found ? rank.fill : '#222b44';
    ctx.fill();
    ctx.fillStyle = found ? rank.ink : '#6f6448';
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(found ? starString(rank.star) : '???', tx + 23, barY + 8.5);

    /* 已获得次数：紧贴稀有度条右侧 */
    ctx.textAlign = 'left';
    ctx.font = '600 10.5px sans-serif';
    ctx.fillStyle = found ? TEXT_SOFT : '#6f6448';
    var tail = found ? '×' + item.count : (sp.secret ? '隐藏' : '');
    ctx.fillText(tail, tx + 54, barY + 8.5);

    /* 底行：发现才公开身价，未发现给一句提示 */
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = found ? '#e0c170' : '#6f6448';
    var bottom = found
        ? '成鱼 ' + wallet.format(Math.round(item.price))
        : (sp.secret ? '神秘彩蛋' : '待发现');
    ctx.fillText(U.fitText(ctx, bottom, tw), tx, r.y + 71);
}

function starString(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '★';
    return s;
}

/* ---------------- 图鉴主页 ---------------- */
function drawGrid(ctx, state, ease) {
    var t = state.t || 0;
    var list = codex.list(state);
    for (var i = 0; i < list.length; i++) {
        var r = L.codexRect(i, ease);
        drawCard(ctx, list[i], r, t, ease);
    }
}

/* ---------------- 详情浮层 ---------------- */
function drawDetail(ctx, state, session, ease) {
    var idx = session.codexDetail;
    if (idx == null) return;
    var list = codex.list(state);
    var item = list[idx];
    if (!item) return;
    var sp = item.sp;
    var rank = rankOf(sp);

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.fillStyle = 'rgba(6,10,24,0.72)';
    ctx.fillRect(0, 0, W, H);

    var d = L.codexDetailRect(ease);
    Th.jelly(ctx, d.x, d.y, d.w, d.h, {
        top: '#263150', bottom: '#161f38',
        deep: 'rgba(6,10,24,0.7)', r: 20, depth: 5,
        ink: INK, lw: 2.6
    });

    /* 顶部色带 */
    ctx.save();
    rr(ctx, d.x, d.y, d.w, 54, 20);
    ctx.fillStyle = foundFill(item, rank);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    Th.textOutlined(ctx, item.found ? sp.name : '???', d.x + d.w / 2, d.y + 30, 20,
        '#fff3d2', foundInk(item, rank), 3);

    /* 大图 */
    var box = L.codexDetailThumb(d);
    ctx.save();
    ctx.beginPath();
    ctx.arc(box.cx, box.cy, box.r, 0, Math.PI * 2);
    ctx.fillStyle = '#141d33';
    ctx.fill();
    ctx.clip();
    if (item.found) {
        art.drawThumb(ctx, sp.id, box.cx - box.r, box.cy - box.r, box.r * 2, box.r * 2, {
            t: state.t || 0, phase: idx * 1.7
        });
    } else {
        ctx.globalAlpha = 0.2;
        art.drawThumb(ctx, sp.id, box.cx - box.r, box.cy - box.r, box.r * 2, box.r * 2, { t: 0 });
        ctx.globalAlpha = 1;
        Th.textOutlined(ctx, '?', box.cx, box.cy + 1, 34, '#e8d4a0', '#1a1526', 4);
    }
    ctx.restore();

    /* 资料行 */
    var lines = item.found ? [
        ['稀有度', item.sp.secret ? '隐藏款' : item.sp.rarity + ' · ' + starString(rank.star)],
        ['成鱼身价', wallet.format(Math.round(item.price)) + ' 鱼币'],
        ['成熟时间', Math.round(item.mature / 60) + ' 分钟'],
        ['获得途径', item.source],
        ['累计收集', item.count + ' 条']
    ] : [
        ['稀有度', '???'],
        ['获得途径', item.sp.secret ? '隐藏款 · 继续探索' : item.source],
        ['提示', '开出这条鱼后自动解锁']
    ];

    var ly = d.y + 96;
    var labelW = 62;
    /* 前两行右侧有鱼图，值最多写到鱼图左边；后几行可以放宽 */
    var valueMaxWide = d.w - labelW - 48;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) {
        var rowY = ly + i * 26;
        /* 隔行淡底，像图鉴的资料表格 */
        if (i % 2 === 0) {
            rr(ctx, d.x + 16, rowY - 12, d.w - 32, 24, 8);
            ctx.fillStyle = 'rgba(200,164,92,0.10)';
            ctx.fill();
        }
        ctx.font = '700 12px sans-serif';
        ctx.fillStyle = TEXT_SOFT;
        ctx.fillText(lines[i][0], d.x + 26, rowY);
        ctx.font = '600 12px sans-serif';
        ctx.fillStyle = TEXT;
        /* 鱼图占右上角 y≈90~174，这几行把值限制在鱼图左侧 */
        var maxW = (i < 3) ? (d.w - labelW - 130) : valueMaxWide;
        ctx.fillText(U.fitText(ctx, lines[i][1], maxW), d.x + 26 + labelW, rowY);
    }

    /* 描述 */
    if (item.found && sp.desc) {
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = TEXT_SOFT;
        ctx.fillText(U.fitText(ctx, sp.desc, d.w - 48), d.x + 24, d.y + d.h - 62);
    }

    /* 关闭按钮 */
    var cr = L.codexDetailClose(d);
    Th.jelly(ctx, cr.x, cr.y, cr.w, cr.h, {
        top: '#2a3352', bottom: '#1a2340', deep: 'rgba(6,10,24,0.6)',
        r: cr.w / 2, depth: 2, ink: INK, lw: 2, gloss: false
    });
    ctx.textAlign = 'center';
    ctx.font = '800 18px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('×', cr.x + cr.w / 2, cr.y + cr.h / 2 + 1);

    ctx.restore();
}

function foundFill(item, rank) {
    if (!item.found) return '#2a3450';
    return rank.fill;
}
function foundInk(item, rank) {
    if (!item.found) return '#6f6448';
    return rank.ink;
}

/* ---------------- 入口 ---------------- */
function draw(ctx, state, session) {
    var ease = session.sheetEase;
    if (ease <= 0.001) return;
    var top = L.sheetTop(ease);

    ctx.save();
    ctx.globalAlpha = ease;

    /* 背景由 sheet.js 统一铺（蓝底），这里只画星星点缀。
     * 星星避开顶部标题/页签区（top + 96 以下）。 */
    drawStars(ctx, top + 96, state.t || 0);

    /* 收集进度条 */
    var pg = codex.progress(state);
    var bar = L.codexProgressRect(ease);
    rr(ctx, bar.x, bar.y, bar.w, bar.h, bar.h / 2);
    ctx.fillStyle = 'rgba(6,10,24,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,92,0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    var fillW = (bar.w - 96) * pg.percent;
    if (fillW > 0) {
        rr(ctx, bar.x + 3, bar.y + 3, Math.max(bar.h - 6, fillW), bar.h - 6, (bar.h - 6) / 2);
        ctx.fillStyle = '#c8a45c';
        ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 12px sans-serif';
    ctx.fillStyle = TEXT;
    ctx.fillText('收集进度', bar.x + 10, bar.y + bar.h / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillText(pg.found + ' / ' + pg.total, bar.x + bar.w - 10, bar.y + bar.h / 2 + 1);

    drawGrid(ctx, state, ease);
    ctx.restore();

    drawDetail(ctx, state, session, ease);
}

module.exports = {
    draw: draw,
    rankOf: rankOf
};
