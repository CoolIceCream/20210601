/* ============================================================
 * render/sheet.js · 商店面板（两页）
 *
 *   道具页  数据来自 core/shop.js · list()（价格、满级、买得起吗）
 *   鱼卵页  数据来自 core/shop.js · eggList()（按品种定价、品质锁）
 *
 * 这一层只负责画，不判断能不能买 —— disable 状态由 core 给。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var art = require('./fishart.js');
var itemArt = require('./itemart.js');
var L = require('../ui/layout.js');
var cfg = require('../config/index.js');
var shop = require('../core/shop.js');
var wallet = require('../core/wallet.js');
var pond = require('../core/pond.js');
var storage = require('../core/storage.js');
var fishLib = require('../core/fish.js');
var breed = require('../core/breed.js');
var Th = require('./theme.js');
var TT = Th.T;
var codexRender = require('./codex.js');
/* 蛋的画法和倒计时和繁育浮层共用一份，不在仓库页重抄 */
var breedRender = require('./breed.js');

var W = C.W;
var H = C.H;
var roundRect = U.roundRect;

var RARITY = cfg.rarityColor;
var TAB_NAME = ['商店', '鱼卵', '图鉴', '鱼塘', '仓库'];
var TAB_TITLE = ['商店', '鱼卵', '鱼类图鉴', '鱼塘', '仓库'];

/* ---------------- 页签 ---------------- */

function drawTabs(ctx, session, ease) {
    for (var i = 0; i < TAB_NAME.length; i++) {
        var r = L.tabRect(i, ease);
        var on = session.sheetTab === i;
        var isCodex = i === 2;

        if (on) {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, isCodex ? {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
                r: 15, depth: 3, ink: '#5f1e18', lw: 2.4
            } : {
                top: TT.greenTop, bottom: TT.greenBottom,
                deep: TT.greenDeep,
                r: 15, depth: 3, ink: '#6f5220', lw: 2.4
            });
        } else {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: '#2c3858', bottom: '#202a44', deep: TT.cardDeep,
                r: 15, depth: 3, ink: 'rgba(200,164,92,0.45)', lw: 2, gloss: false
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        if (on) {
            Th.textOutlined(ctx, TAB_NAME[i], r.x + r.w / 2, r.y + r.h / 2 + 1, 14,
                '#fff3d2', isCodex ? '#5f1e18' : '#4a3610', 3);
        } else {
            ctx.font = '700 14px sans-serif';
            ctx.fillStyle = TT.textSoft;
            ctx.fillText(TAB_NAME[i], r.x + r.w / 2, r.y + r.h / 2 + 1);
        }
    }
}

/* ---------------- 道具页 ---------------- */

function drawItems(ctx, state, ease) {
    var list = shop.list(state);

    for (var i = 0; i < list.length; i++) {
        var st = list[i];
        var item = st.item;
        var r = L.itemRect(i, ease);

        Th.card(ctx, r.x, r.y, r.w, L.ITEM_H, { r: 16, depth: 2.5 });

        /* 图标块：色底 + 手画小图标（原来这里写的是一个汉字，见 render/itemart.js） */
        var bg = item.iconBg || '#8a6d1f';
        roundRect(ctx, r.x + 12, r.y + 14, 42, 42, 13);
        ctx.fillStyle = bg;
        ctx.globalAlpha = ease;
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,212,160,0.5)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        itemArt.draw(ctx, item.icon || item.id, r.x + 33, r.y + 35, 30, bg);

        /* 名称 */
        ctx.textAlign = 'left';
        /* 名称要给右侧价格按钮让路：先用价格按钮左边界算出可用宽度，
         * 不然字重一加宽（Q 版用 800）就会钻到按钮底下 */
        var btnLeft = L.buyRect(i, ease).x;
        var nameMax = btnLeft - (r.x + 66) - 12;
        ctx.font = '800 15px sans-serif';
        var nameTxt = U.fitText(ctx, item.name, nameMax);
        ctx.fillStyle = TT.text;
        ctx.fillText(nameTxt, r.x + 66, r.y + 26);

        /* 等级 / 数量徽标：贴着名字往右排，空间不够就右对齐到按钮前 */
        if (st.level) {
            var nw = ctx.measureText(nameTxt).width;
            ctx.font = '700 11px sans-serif';
            var lw = ctx.measureText(st.level).width + 14;
            var bwX = r.x + 66 + nw + 8;
            if (bwX + lw > btnLeft - 8) bwX = Math.max(r.x + 66, btnLeft - 8 - lw);

            roundRect(ctx, bwX, r.y + 18, lw, 16, 7);
            ctx.fillStyle = '#2c4a44';
            ctx.fill();
            ctx.strokeStyle = 'rgba(111,191,158,0.5)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = '#9fdcc0';
            ctx.font = '700 11px sans-serif';
            ctx.fillText(st.level, bwX + 7, r.y + 26.5);
        }

        /* 描述 */
        ctx.font = '600 12px sans-serif';
        ctx.fillStyle = TT.textSoft;
        var maxDescW = r.w - 66 - 98;
        ctx.fillText(U.fitText(ctx, st.desc, maxDescW), r.x + 66, r.y + 47);

        /* 价格按钮 */
        var br = L.buyRect(i, ease);
        if (st.disabled) {
            Th.jelly(ctx, br.x, br.y, br.w, 38, {
                top: TT.greyTop, bottom: TT.greyBottom, deep: TT.greyDeep,
                r: 12, depth: 2.5, ink: 'rgba(200,164,92,0.3)', lw: 2, gloss: false
            });
        } else {
            Th.jelly(ctx, br.x, br.y, br.w, 38, {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
                r: 12, depth: 3, ink: '#5f1e18', lw: 2.4
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 14px sans-serif';
        ctx.fillStyle = st.disabled ? TT.textSoft : '#fff3d2';
        ctx.fillText(st.label, br.x + br.w / 2, br.y + 19.5);
    }
}

/* ---------------- 鱼卵页 ---------------- */

/* 四种卵都只写中文名，不再显示 R / SR / SSR 字母角标 */
var EGG_NAME = {
    R: '普通鱼卵',
    SR: '稀有鱼卵',
    SSR: '传说鱼卵',
    LEGEND: '传奇鱼卵'
};

function drawEggs(ctx, state, ease) {
    var list = shop.eggList(state);

    for (var i = 0; i < list.length; i++) {
        var st = list[i];
        var r = L.eggRect(i, ease);

        /* 卡片 */
        if (st.locked) {
            Th.card(ctx, r.x, r.y, r.w, r.h, {
                r: 16, depth: 2.5, top: '#202a44', bottom: '#1a2238',
                deep: 'rgba(6,10,24,0.4)', ink: 'rgba(200,164,92,0.28)', lw: 2
            });
        } else {
            Th.card(ctx, r.x, r.y, r.w, r.h, { r: 16, depth: 2.5 });
        }

        /* 左侧：该档卖价最高的那条鱼当「代言人」 */
        var th = L.eggThumbRect(i, ease);
        ctx.globalAlpha = ease * (st.locked ? 0.30 : 1);
        art.drawThumb(ctx, st.rep.id, th.x, th.y - 1, th.w, th.h + 2, {
            t: state.t || 0,
            phase: i * 1.7
        });
        ctx.globalAlpha = ease;

        var tx = r.x + 78;

        /* 标题：只留中文文字名，不再画 R / SR / SSR 字母角标。
         * 传奇卵用一枚小星点做视觉区分，但同样是图形不是字母。 */
        if (st.rarity === 'LEGEND') {
            ctx.save();
            ctx.translate(tx + 6, r.y + 21);
            ctx.fillStyle = '#f5b822';
            ctx.beginPath();
            for (var k = 0; k < 10; k++) {
                var ang = -Math.PI / 2 + k * Math.PI / 5;
                var rr = k % 2 === 0 ? 8 : 3.4;
                var px = Math.cos(ang) * rr;
                var py = Math.sin(ang) * rr;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#5f1e18';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '800 15px sans-serif';
        ctx.fillStyle = st.locked ? 'rgba(164,149,110,0.55)' : TT.text;
        ctx.fillText(EGG_NAME[st.rarity] || st.rarity,
            tx + (st.rarity === 'LEGEND' ? 20 : 0), r.y + 26);

        /* 副信息：这一档能开出哪些鱼，以及卖价区间 */
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = st.locked ? 'rgba(164,149,110,0.5)' : TT.textSoft;
        var sub = st.locked
            ? '需 ' + st.need + ' 条鱼解锁'
            : st.rarity === 'LEGEND'
                ? st.secretHint
                : st.count + ' 种' + (st.secretHint ? ' + ' + st.secretHint : '') +
                  ' · 卖 ' + wallet.format(Math.round(st.minSell)) + '~' +
                  wallet.format(Math.round(st.maxSell));
        ctx.fillText(U.fitText(ctx, sub, r.w - 176), tx, r.y + 48);

        /* 第三行：平均能卖多少，帮助判断值不值 */
        ctx.font = '600 10.5px sans-serif';
        ctx.fillStyle = st.locked ? 'rgba(164,149,110,0.45)' : TT.textSoft;
        var tip = st.locked
            ? '鱼越多解锁越快'
            : st.rarity === 'LEGEND'
                ? '固定价 · 成鱼卖 ' + wallet.format(Math.round(st.avgSell))
                : '平均卖 ' + wallet.format(Math.round(st.avgSell)) + ' · 卵价打 ' +
                  Math.round((st.price / Math.max(1, st.avgSell)) * 100) + ' 折';
        ctx.fillText(U.fitText(ctx, tip, r.w - 176), tx, r.y + 74);

        /* 价格按钮 */
        var b = L.eggBuyRect(i, ease);
        if (st.disabled) {
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: TT.greyTop, bottom: TT.greyBottom, deep: TT.greyDeep,
                r: 12, depth: 2, ink: 'rgba(200,164,92,0.28)', lw: 1.8, gloss: false
            });
        } else {
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
                r: 12, depth: 3, ink: '#5f1e18', lw: 2.2
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = st.disabled ? TT.textSoft : '#fff3d2';
        ctx.fillText(st.locked ? '未解锁' : st.full ? '鱼位满' : st.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
}

/* ---------------- 入口 ---------------- */

/* ---------------- 鱼塘页 ---------------- */

function rarityName(r) {
    return r === 'SR' ? '稀有' : r === 'SSR' ? '传说' : r === 'LEGEND' ? '传奇' : '普通';
}

function drawPond(ctx, state, ease) {
    var st = pond.statusOf(state);
    var scene = L.pondSceneRect(ease);
    var t = state.t || 0;

    /* 池塘：圆角裁剪内画水、波纹、荷叶、鱼影 */
    ctx.save();
    roundRect(ctx, scene.x, scene.y, scene.w, scene.h, 18);
    ctx.clip();

    var g = ctx.createLinearGradient(0, scene.y, 0, scene.y + scene.h);
    U.stop(g, 0, '#1b3350');
    U.stop(g, 1, '#0e2038');
    ctx.fillStyle = g;
    ctx.fillRect(scene.x, scene.y, scene.w, scene.h);

    /* 水面波纹：几条缓慢起伏的横线 */
    ctx.strokeStyle = 'rgba(200,220,255,0.14)';
    ctx.lineWidth = 1.6;
    for (var w = 0; w < 4; w++) {
        var wy = scene.y + 30 + w * 44;
        ctx.beginPath();
        for (var x = 0; x <= scene.w; x += 8) {
            var yy = wy + Math.sin(x / scene.w * 9.42 + t * 1.1 + w) * 4;
            if (x === 0) ctx.moveTo(scene.x + x, yy);
            else ctx.lineTo(scene.x + x, yy);
        }
        ctx.stroke();
    }

    /* 荷叶：三片深绿椭圆，大小错开，不宜过大否则盖住水面 */
    var pads = [[0.18, 0.26, 21], [0.78, 0.50, 15], [0.44, 0.79, 13]];
    for (var p = 0; p < pads.length; p++) {
        var px = scene.x + scene.w * pads[p][0];
        var py = scene.y + scene.h * pads[p][1];
        var pr = pads[p][2];
        ctx.beginPath();
        U.ellipse(ctx, px, py, pr, pr * 0.52, -0.15);
        ctx.fillStyle = 'rgba(38,92,66,0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(111,191,158,0.5)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }

    /* 鱼影：三条剪影慢慢横穿水面 */
    for (var k = 0; k < 3; k++) {
        var span = scene.w + 80;
        var fx = scene.x - 40 + ((t * (14 + k * 6) + k * 150) % span);
        var fy = scene.y + 56 + k * 36 + Math.sin(t * 1.4 + k) * 5;
        /* 池底本身就深，鱼影要比背景更黑才看得见 */
        ctx.fillStyle = 'rgba(2,6,14,0.62)';
        ctx.beginPath();
        U.ellipse(ctx, fx, fy, 17, 9, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(fx - 15, fy);
        ctx.lineTo(fx - 26, fy - 8);
        ctx.lineTo(fx - 26, fy + 8);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    /* 池塘边框 */
    roundRect(ctx, scene.x, scene.y, scene.w, scene.h, 18);
    ctx.strokeStyle = 'rgba(200,164,92,0.5)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    /* 信息行：塘名 + 可钓鱼种；右侧鱼饵余量 */
    var iy = scene.y + scene.h + 18;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(st.name, 18, iy);
    ctx.font = '600 11.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('可钓 ' + st.poolCount + ' 种' + rarityName(st.rarity) + '鱼', 18, iy + 21);

    itemArt.draw(ctx, 'bait', W - 84, iy + 2, 22);
    ctx.textAlign = 'right';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = st.bait > 0 ? TT.text : '#e0847a';
    ctx.fillText('×' + st.bait, W - 18, iy + 3);

    /* 抛竿按钮 */
    var b = L.pondCastRect(ease);
    var on = st.canCast;
    Th.jelly(ctx, b.x, b.y, b.w, b.h, on ? {
        top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
        r: 18, depth: 4, ink: '#5f1e18', lw: 2.6
    } : {
        top: TT.greyTop, bottom: TT.greyBottom, deep: TT.greyDeep,
        r: 18, depth: 3, ink: 'rgba(200,164,92,0.3)', lw: 2, gloss: false
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 18px sans-serif';
    ctx.fillStyle = on ? '#fff3d2' : TT.textSoft;
    ctx.fillText('抛竿钓鱼', b.x + b.w / 2, b.y + b.h / 2 - 7);
    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = on ? 'rgba(255,243,210,0.78)' : TT.textSoft;
    ctx.fillText(on ? '消耗鱼饵 ×1' : '鱼饵不足 · 去商店买', b.x + b.w / 2, b.y + b.h / 2 + 13);

    /* 概率小字 */
    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('约 ' + Math.round((1 - st.oysterRate) * 100) + '% 出鱼 · ' +
        Math.round(st.oysterRate * 100) + '% 出珍珠贝', b.x + b.w / 2, b.y + b.h + 15);
}

/* ---------------- 仓库页（M15 重排） ----------------
 * 照参考游戏改成「网格 + 底部详情卡」：
 *
 *   子页签行（右端钉着「繁育」）
 *   鱼篓 12/20            [批量] [全选]
 *   ┌──┬──┬──┬──┬──┐
 *   ├──┼──┼──┼──┼──┤
 *   └──┴──┴──┴──┴──┘
 *   ┌──────────────────────────────┐
 *   │ [图] 名字 ♀         ¥ 62,000 │
 *   │      说明两行                │
 *   │      [词条][词条][词条]      │
 *   │      [ 放进鱼缸 ] [ 卖出 ]   │
 *   └──────────────────────────────┘
 *
 * 为什么换成这个结构：
 *   以前 3×3 只有 9 格，钓两次就满；而且每条鱼都要在格子里塞
 *   名字 + 阶段 + 成长 + 价格四行，字挤成一团。现在格子里只留
 *   「图 + 价 + 成长」，详情全搬到下面那张卡里，两边都松快了。
 */

var BAG_SUBS = ['鱼卵', '道具', '鱼'];

/* 道具在网格里的固定顺序；key 同时用作选中标识 */
var PROP_DEFS = [
    { key: 'item:oyster', icon: 'oyster', name: '珍珠贝', bg: '#3a3358', color: '#9a8fc4' },
    { key: 'item:pearl', icon: 'pearl', name: '珍珠', bg: '#2f5a72', color: '#7fc2dc' },
    { key: 'item:bait', icon: 'bait', name: '鱼饵', bg: '#3d5a2f', color: '#9cc47a' }
];

/* ---------------- 小零件 ---------------- */

/* 详情卡里的标签胶囊，返回宽度 */
function chipW(ctx, txt, size) {
    return ctx.measureText(txt).width + (size || 9) * 2;
}

function drawChip(ctx, x, y, txt, color, h) {
    h = h || 16;
    ctx.font = '700 9.5px sans-serif';
    var w = Math.min(96, chipW(ctx, txt, 7));
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = U.hexA(color, 0.20);
    ctx.fill();
    ctx.strokeStyle = U.hexA(color, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(U.fitText(ctx, txt, w - 10), x + w / 2, y + h / 2 + 0.5);
    return w;
}

/* 小金币：格子里价格前的那个圆点 */
function coinDot(ctx, cx, cy, rad) {
    var g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.4, rad * 0.2, cx, cy, rad);
    U.stop(g, 0, '#ffe9ae');
    U.stop(g, 1, '#c08a2c');
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,34,8,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

/* 格子底：选中是金框，平时是稀有度彩线 + 暗金细框 */
function cellFrame(ctx, r, opt) {
    opt = opt || {};
    if (opt.sel) {
        Th.card(ctx, r.x, r.y, r.w, r.h, {
            r: 12, depth: 2.5,
            top: '#3a2f1e', bottom: '#241c12',
            ink: TT.gold, lw: 2.2
        });
        return;
    }
    Th.card(ctx, r.x, r.y, r.w, r.h, {
        r: 12, depth: 1.6,
        ink: opt.ink || 'rgba(200,164,92,0.20)',
        lw: 1.4
    });
    if (opt.line) {
        roundRect(ctx, r.x + 1.2, r.y + 1.2, r.w - 2.4, r.h - 2.4, 10.8);
        ctx.strokeStyle = opt.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

/* 空格子：只画一圈虚线感的淡框，让网格看得出「还有格子」 */
function emptyCell(ctx, r) {
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.strokeStyle = 'rgba(200,164,92,0.13)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
}

/* 选中角标：批量模式下写序号，单选写一枚小勾 */
function selBadge(ctx, r, n) {
    var bx = r.x + r.w - 11;
    var by = r.y + 11;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, 6.2832);
    ctx.fillStyle = TT.gold;
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,10,24,0.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a2110';
    if (n > 0) {
        ctx.font = '800 10.5px sans-serif';
        ctx.fillText(String(n), bx, by + 0.5);
    } else {
        ctx.font = '800 12px sans-serif';
        ctx.fillText('✓', bx, by + 0.5);
    }
}

/* ---------------- 顶部：子页签 + 容量行 ---------------- */

function drawBagTabs(ctx, session, ease) {
    for (var i = 0; i < BAG_SUBS.length; i++) {
        var r = L.bagTabRect(i, ease);
        var on = (session.bagTab || 0) === i;

        if (on) {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep,
                r: 14, depth: 2.5, ink: '#6f5220', lw: 2
            });
        } else {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: '#2c3858', bottom: '#202a44', deep: TT.cardDeep,
                r: 14, depth: 2.5, ink: 'rgba(200,164,92,0.4)', lw: 1.8, gloss: false
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (on) {
            Th.textOutlined(ctx, BAG_SUBS[i], r.x + r.w / 2, r.y + r.h / 2 + 1, 12.5,
                '#fff3d2', '#4a3610', 3);
        } else {
            ctx.font = '700 12.5px sans-serif';
            ctx.fillStyle = TT.textSoft;
            ctx.fillText(BAG_SUBS[i], r.x + r.w / 2, r.y + r.h / 2 + 1);
        }
    }

    /* 繁育：不在页签里，是「进去做一件事」的入口，所以用朱红区分 */
    var br = L.bagBreedRect(ease);
    Th.jelly(ctx, br.x, br.y, br.w, br.h, {
        top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
        r: 14, depth: 2.5, ink: '#5f1e18', lw: 2
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 12.5px sans-serif';
    ctx.fillStyle = '#fff3d2';
    ctx.fillText('繁育', br.x + br.w / 2, br.y + br.h / 2 + 0.5);
}

/* 容量行：「鱼篓 12/20」+ 批量 / 全选两枚小胶囊 */
function drawBagHeader(ctx, session, ease, capText, total, selCount) {
    var top = L.sheetTop(ease);
    var cy = top + L.BAG_HDR_Y + L.BAG_HDR_H / 2;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText(capText, 18, cy);

    if (selCount > 0) {
        var w = ctx.measureText(capText).width;
        ctx.font = '800 12px sans-serif';
        ctx.fillStyle = TT.goldLight;
        ctx.fillText(' · 选中 ' + selCount, 18 + w, cy);
    }

    /* 批量开关 */
    var c0 = L.bagChipRect(0, ease);
    var mode = !!session.bagMode;
    Th.jelly(ctx, c0.x, c0.y, c0.w, c0.h, mode ? {
        top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
        r: 11, depth: 2, ink: '#5f1e18', lw: 1.8, gloss: true
    } : {
        top: '#2c3858', bottom: '#202a44', deep: TT.cardDeep,
        r: 11, depth: 2, ink: 'rgba(200,164,92,0.42)', lw: 1.6, gloss: false
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = mode ? '#fff3d2' : TT.textSoft;
    ctx.fillText(mode ? '批量中' : '批量', c0.x + c0.w / 2, c0.y + c0.h / 2 + 0.5);

    /* 全选 / 清空：只在有东西可选的时候亮起来 */
    var c1 = L.bagChipRect(1, ease);
    var allOn = total > 0 && selCount >= total;
    var can = total > 0;
    Th.jelly(ctx, c1.x, c1.y, c1.w, c1.h, (allOn || (mode && can)) ? {
        top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep,
        r: 11, depth: 2, ink: '#6f5220', lw: 1.8, gloss: true
    } : {
        top: '#2c3858', bottom: '#202a44', deep: TT.cardDeep,
        r: 11, depth: 2, ink: 'rgba(200,164,92,0.3)', lw: 1.6, gloss: false
    });
    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = can ? '#fff3d2' : TT.textSoft;
    ctx.fillText(allOn ? '清空' : '全选', c1.x + c1.w / 2, c1.y + c1.h / 2 + 0.5);
}

/* ---------------- 详情卡（三页共用同一套版式） ----------------
 * d = {
 *   draw: function(ctx, box) { … }   左侧 64×64 图标框里的画法
 *   name, sub, price, desc: [行1, 行2]
 *   tags: [{txt, color}]
 *   buttons: [{label, sub, on, kind}]
 * }
 * kind: 'green' 主操作（放缸/使用）· 'red' 卖出 · 'grey' 不可用
 */
function drawBagDetail(ctx, d, ease) {
    var c = L.bagDetailRect(ease);
    Th.card(ctx, c.x, c.y, c.w, c.h, { r: 16, depth: 2.5, ink: 'rgba(200,164,92,0.34)', lw: 1.8 });

    var ib = L.bagDetailIconRect(ease);
    roundRect(ctx, ib.x, ib.y, ib.w, ib.h, 14);
    ctx.fillStyle = 'rgba(10,16,32,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,92,0.3)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (d.draw) d.draw(ctx, ib);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    /* 名字 */
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(U.fitText(ctx, d.name || '', c.w - 90 - 90), c.x + 90, c.y + 26);
    var nw = Math.min(c.w - 90 - 90, ctx.measureText(d.name || '').width);

    if (d.sub) {
        ctx.font = '800 11.5px sans-serif';
        ctx.fillStyle = d.subColor || TT.textSoft;
        ctx.fillText(d.sub, c.x + 90 + nw + 8, c.y + 26);
    }

    /* 单价：右上角，金币 + 数字 */
    if (d.price) {
        ctx.textAlign = 'right';
        ctx.font = '800 15px sans-serif';
        var pw = ctx.measureText(d.price).width;
        ctx.fillStyle = TT.goldLight;
        ctx.fillText(d.price, c.x + c.w - 16, c.y + 26);
        coinDot(ctx, c.x + c.w - 16 - pw - 10, c.y + 26, 6);
        ctx.textAlign = 'left';
    }

    /* 说明两行 */
    if (d.desc) {
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = TT.textSoft;
        for (var i = 0; i < d.desc.length && i < 2; i++) {
            ctx.fillText(U.fitText(ctx, d.desc[i], c.w - 104), c.x + 90, c.y + 48 + i * 18);
        }
    }

    /* 标签行 */
    if (d.tags && d.tags.length) {
        var tx = c.x + 14;
        var ty = c.y + 84;
        for (var k = 0; k < d.tags.length; k++) {
            var tg = d.tags[k];
            ctx.font = '700 9.5px sans-serif';
            var w = Math.min(96, chipW(ctx, tg.txt, 7));
            if (tx + w > c.x + c.w - 14) break;
            drawChip(ctx, tx, ty, tg.txt, tg.color || TT.gold, 16);
            tx += w + 6;
        }
    }

    /* 按钮行 */
    var n = d.buttons ? d.buttons.length : 0;
    for (var b = 0; b < n; b++) {
        var btn = d.buttons[b];
        var r = L.bagDetailBtnRect(b, n, ease);
        if (btn.on) {
            var scheme = btn.kind === 'red' ? {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep, ink: '#5f1e18'
            } : {
                top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep, ink: '#6f5220'
            };
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: scheme.top, bottom: scheme.bottom, deep: scheme.deep,
                r: 14, depth: 3, ink: scheme.ink, lw: 2.2
            });
        } else {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: TT.greyTop, bottom: TT.greyBottom, deep: TT.greyDeep,
                r: 14, depth: 2, ink: 'rgba(200,164,92,0.28)', lw: 1.6, gloss: false
            });
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 14px sans-serif';
        ctx.fillStyle = btn.on ? (btn.kind === 'red' ? '#ffe9d0' : '#eafff2') : TT.textSoft;
        ctx.fillText(btn.label, r.x + r.w / 2, r.y + r.h / 2 + (btn.sub ? -5 : 0.5));
        if (btn.sub) {
            ctx.font = '600 9.5px sans-serif';
            ctx.fillStyle = btn.on ? 'rgba(255,255,255,0.72)' : TT.textSoft;
            ctx.fillText(btn.sub, r.x + r.w / 2, r.y + r.h / 2 + 9);
        }
    }
}

/* 没选中任何东西时的空详情卡：给个虚线圆占住图标位，别留一块黑洞 */
function drawBagEmptyDetail(ctx, ease, text) {
    drawBagDetail(ctx, {
        draw: function (c, box) {
            var cx = box.x + box.w / 2;
            var cy = box.y + box.h / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 17, 0, 6.2832);
            ctx.strokeStyle = 'rgba(200,164,92,0.35)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '800 16px sans-serif';
            ctx.fillStyle = 'rgba(200,164,92,0.5)';
            ctx.fillText('?', cx, cy + 0.5);
        },
        name: '还没有选中',
        desc: [text],
        buttons: []
    }, ease);
}

/* ---------------- 子页一：鱼（最常用，所以放在最后一位） ---- */

function fishCells(state) {
    var list = pond.caughtList(state);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ key: list[i].fish.id, kind: 'fish', cell: list[i] });
    return out;
}

/* 道具格 */
function propCells(state) {
    var st = pond.statusOf(state);
    var counts = { 'item:oyster': st.oyster, 'item:pearl': st.pearl, 'item:bait': st.bait };
    var out = [];
    for (var i = 0; i < PROP_DEFS.length; i++) {
        out.push({ key: PROP_DEFS[i].key, kind: 'prop', def: PROP_DEFS[i], n: counts[PROP_DEFS[i].key] || 0 });
    }
    return out;
}

/* 鱼卵格：先「正在孵」的（培育栏位），再仓库里囤着的蛋。
 * 空培育位不在这一页占格子 —— 那是繁育页的事，
 * 摆一排空位只会把真正的鱼卵挤出首屏。 */
function eggCells(state) {
    var out = [];
    var i;
    var live = breed.hatchList(state);
    for (i = 0; i < live.length; i++) {
        out.push({ key: 'hatch:' + live[i].egg.id, kind: 'incubating', egg: live[i] });
    }
    var stored = breed.storedList(state);
    for (i = 0; i < stored.length; i++) {
        out.push({ key: 'egg:' + stored[i].egg.id, kind: 'egg', egg: stored[i] });
    }
    return out;
}

/* 当前子页的格子数据：渲染和触摸共用一份，避免两边各写一套顺序 */
function bagCellsOf(state, session) {
    var tab = session.bagTab || 0;
    if (tab === 0) return eggCells(state);
    if (tab === 1) return propCells(state);
    return fishCells(state);
}

/* 当前子页能选的 key（全选按钮用）。在孵的蛋不可选 —— 它已经在孵了 */
function bagKeysOf(state, session) {
    var cells = bagCellsOf(state, session);
    var out = [];
    for (var i = 0; i < cells.length && out.length < L.BAG_GRID_CAP; i++) {
        if (cells[i].kind === 'empty' || cells[i].kind === 'incubating') continue;
        out.push(cells[i].key);
    }
    return out;
}

/* 详情卡上的按钮：渲染照着画，触摸照着执行，只有这一份真相 */
function bagActionsOf(state, session) {
    var tab = session.bagTab || 0;
    var sels = session.bagSels || [];
    var mode = !!session.bagMode;

    if (!sels.length) return [];

    if (tab === 0) {
        /* 选中的只可能是仓库鱼卵（在孵的蛋不进 sels），所以按钮就是「孵化」 */
        var room = breed.hatchRoom(state);
        if (sels.length === 1) {
            return [{
                key: 'hatch', label: '孵化',
                sub: room > 0 ? '占 1 个培育位' : '培育位已满',
                on: room > 0, kind: 'green'
            }];
        }
        var k = Math.min(sels.length, room);
        return [{
            key: 'hatchMany', label: '批量孵化',
            sub: k > 0 ? '孵 ' + k + ' 颗 · 空位 ' + room : '培育位已满',
            on: k > 0, kind: 'green'
        }];
    }

    if (tab === 1) {
        var st = pond.statusOf(state);
        var pearlPrice = wallet.format(cfg.pond.pearlPrice || 10000);
        if (sels[0] === 'item:oyster') {
            return [{
                key: 'break', label: '打破一枚', sub: '剩 ' + st.oyster + ' 个',
                on: st.oyster > 0, kind: 'green'
            }];
        }
        if (sels[0] === 'item:pearl') {
            return [{
                key: 'sellPearl', label: '卖一颗', sub: '+' + pearlPrice,
                on: st.pearl > 0, kind: 'red'
            }];
        }
        return [{
            key: 'shop', label: '去商店买', sub: '鱼饵 ×' + st.bait,
            on: true, kind: 'green'
        }];
    }

    var room = storage.roomOf(state);
    var roomText = room === Infinity ? '鱼位无限' : (room > 0 ? '还有 ' + room + ' 个鱼位' : '鱼缸已满');

    if (sels.length === 1 && !mode) {
        var list = pond.caughtList(state);
        var one = null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].fish.id === sels[0]) { one = list[i]; break; }
        }
        if (!one) return [];
        return [
            { key: 'tank', label: '放进鱼缸', sub: roomText, on: room > 0, kind: 'green' },
            { key: 'sell', label: '卖出', sub: '+' + wallet.format(one.price), on: true, kind: 'red' }
        ];
    }

    var all = pond.caughtList(state);
    var total = 0;
    var count = 0;
    for (var k = 0; k < all.length; k++) {
        if (sels.indexOf(all[k].fish.id) >= 0) { total += all[k].price; count += 1; }
    }
    return [
        { key: 'tankMany', label: '批量放缸', sub: '放 ' + count + ' 条', on: count > 0 && room > 0, kind: 'green' },
        { key: 'sellMany', label: '批量卖出', sub: '+' + wallet.format(total), on: count > 0, kind: 'red' }
    ];
}

function drawBagFish(ctx, state, ease, session) {
    var cells = fishCells(state);
    var all = cells.length;
    var sels = session.bagSels || [];
    var cap = pond.bagCapOf ? pond.bagCapOf(state) : 20;
    var mode = !!session.bagMode;

    drawBagHeader(ctx, session, ease, '鱼篓 ' + all + '/' + cap,
        Math.min(all, L.BAG_GRID_CAP), sels.length);

    var maxShow = L.BAG_GRID_CAP;
    for (var i = 0; i < maxShow; i++) {
        var r = L.bagCellRect(i, ease);
        var item = cells[i];
        if (!item) { emptyCell(ctx, r); continue; }

        var at = sels.indexOf(item.key);
        var sel = at >= 0;
        var c = item.cell;
        var rc = RARITY[c.species.rarity] || TT.gold;

        cellFrame(ctx, r, { sel: sel, line: U.hexA(rc, 0.5) });

        art.drawThumb(ctx, c.species.id, r.x + 3, r.y + 2, r.w - 6, r.h - 20, {
            t: state.t || 0, phase: i * 1.1, evo: fishLib.evoOf(c.fish)
        });

        /* 性别：左上角小圆，繁育挑鱼时一眼分公母 */
        if (c.fish.sex) {
            var sx = r.x + 10;
            var sy = r.y + 10;
            ctx.beginPath();
            ctx.arc(sx, sy, 6.5, 0, 6.2832);
            ctx.fillStyle = c.fish.sex === 'f' ? 'rgba(206,110,152,0.95)' : 'rgba(94,146,206,0.95)';
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 8px sans-serif';
            ctx.fillStyle = '#fff6ea';
            ctx.fillText(c.fish.sex === 'f' ? '♀' : '♂', sx, sy + 0.5);
        }

        /* 成长做成缩略图右下角的小字：
         * 66px 宽的格子放不下「价格 + 成长」并排一行，
         * 挤在一起会读成 6850.0% 这种鬼东西。 */
        /* 成鱼不标成长（满级是常态，标了反而满屏噪声），鱼苗才标 */
        if (c.growth < 100) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = '800 8.5px sans-serif';
            ctx.fillStyle = 'rgba(12,18,34,0.55)';
            ctx.fillText(c.growth + '%', r.x + r.w - 4.4, r.y + r.h - 25.4);
            ctx.fillStyle = 'rgba(232,212,160,0.92)';
            ctx.fillText(c.growth + '%', r.x + r.w - 5, r.y + r.h - 26);
        }

        /* 底行只留价钱 */
        var by = r.y + r.h - 11;
        coinDot(ctx, r.x + 8, by, 4.5);
        ctx.textAlign = 'left';
        ctx.font = '800 10px sans-serif';
        ctx.fillStyle = TT.goldLight;
        ctx.fillText(wallet.format(c.price), r.x + 15, by + 0.5);

        if (sel) selBadge(ctx, r, mode ? at + 1 : 0);
    }

    if (all > maxShow) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('还有 ' + (all - maxShow) + ' 条装不下 · 卖几条腾地方',
            W - 18, L.bagDetailRect(ease).y - 8);
    }

    /* ---- 详情卡 ---- */
    if (!sels.length) {
        drawBagEmptyDetail(ctx, ease, '点格子选中 · 开「批量」可多选后一起放缸或卖出');
        return;
    }

    if (sels.length === 1 && !mode) {
        var one = null;
        for (var q = 0; q < cells.length; q++) {
            if (cells[q].key === sels[0]) { one = cells[q]; break; }
        }
        if (!one) { drawBagEmptyDetail(ctx, ease, '这条鱼已经不在了'); return; }

        var f = one.cell.fish;
        var sp = one.cell.species;
        var tags = [];
        var tr = f.traits || [];
        for (var k = 0; k < tr.length && k < 3; k++) {
            var def = fishLib.traitDef(tr[k].id);
            if (def) tags.push({ txt: def.name + ' L' + fishLib.traitLvOf(tr[k]), color: TT.gold });
        }
        if (fishLib.evoOf(f) > 0) {
            tags.unshift({ txt: fishLib.evoStageName(f), color: '#f0a86a' });
        }

        drawBagDetail(ctx, {
            draw: function (c2, box) {
                art.drawThumb(ctx, sp.id, box.x, box.y, box.w, box.h, {
                    t: state.t || 0, evo: fishLib.evoOf(f)
                });
            },
            name: sp.name,
            sub: f.sex === 'f' ? '♀' : '♂',
            subColor: f.sex === 'f' ? '#d2799f' : '#6b9ad0',
            price: wallet.format(one.cell.price),
            desc: [
                sp.rarity + ' · ' + one.cell.stage + ' · 成长 ' + one.cell.growth + '%',
                '饱食 ' + Math.round(f.hunger || 0) + '% · 心情 ' + Math.round(f.mood || 0) + '%'
            ],
            tags: tags,
            buttons: bagActionsOf(state, session)
        }, ease);
        return;
    }

    /* 批量汇总 */
    var total = 0;
    var count = 0;
    for (var s2 = 0; s2 < cells.length; s2++) {
        if (sels.indexOf(cells[s2].key) >= 0) { total += cells[s2].cell.price; count += 1; }
    }
    var room2 = storage.roomOf(state);
    drawBagDetail(ctx, {
        draw: function (c3, box) {
            art.drawThumb(ctx, cells[0].cell.species.id, box.x + 4, box.y + 4, box.w - 8, box.h - 8, {
                t: state.t || 0
            });
        },
        name: '已选 ' + count + ' 条',
        price: wallet.format(total),
        desc: [
            '鱼缸还剩 ' + (room2 === Infinity ? '∞' : room2) + ' 个鱼位',
            '批量卖出按单条身价合计，不打折'
        ],
        tags: [],
        buttons: bagActionsOf(state, session)
    }, ease);
}

/* 整段孵化时长，写成 3:00 这种 */
function allClock(sec) {
    var v = Math.max(0, Math.round(sec || 0));
    return Math.floor(v / 60) + ':' + (v % 60 < 10 ? '0' : '') + (v % 60);
}

/* ---------------- 子页二：道具 ---------------- */

function drawBagProps(ctx, state, ease, session) {
    var st = pond.statusOf(state);
    var sels = session.bagSels || [];
    var cells = propCells(state);

    var totalItems = 0;
    for (var q = 0; q < cells.length; q++) {
        if (cells[q].n > 0) totalItems += 1;
    }

    drawBagHeader(ctx, session, ease, '道具 ' + totalItems + '/' + cells.length, totalItems, sels.length);

    for (var i = 0; i < L.BAG_GRID_CAP; i++) {
        var r = L.bagCellRect(i, ease);
        if (i >= cells.length) { emptyCell(ctx, r); continue; }

        var d = cells[i].def;
        var n = cells[i].n;
        var sel = sels.indexOf(cells[i].key) >= 0;

        cellFrame(ctx, r, { sel: sel, line: n > 0 ? U.hexA(d.color, 0.55) : null });

        roundRect(ctx, r.x + 8, r.y + 8, r.w - 16, r.w - 16, 12);
        ctx.fillStyle = n > 0 ? d.bg : 'rgba(10,16,32,0.5)';
        ctx.fill();
        itemArt.draw(ctx, d.icon, r.x + r.w / 2, r.y + 8 + (r.w - 16) / 2, 30, n > 0 ? d.bg : '#2a3352');

        /* 数量角标（右下），没货就压成 0 */
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '800 11px sans-serif';
        ctx.fillStyle = n > 0 ? TT.goldLight : TT.textSoft;
        ctx.fillText('×' + n, r.x + r.w - 5, r.y + r.h - 13);

        ctx.textAlign = 'left';
        ctx.font = '700 9.5px sans-serif';
        ctx.fillStyle = n > 0 ? TT.text : TT.textSoft;
        ctx.fillText(d.name, r.x + 6, r.y + r.h - 13);

        if (sel) selBadge(ctx, r, 0);
    }

    /* 详情卡 */
    var pick = null;
    for (var s = 0; s < PROP_DEFS.length; s++) {
        if (sels.indexOf(PROP_DEFS[s].key) >= 0) { pick = PROP_DEFS[s]; break; }
    }
    if (!pick) {
        drawBagEmptyDetail(ctx, ease, '点道具看说明 · 珍珠贝打破有概率出珍珠');
        return;
    }

    var pearlPrice = wallet.format(cfg.pond.pearlPrice || 10000);
    if (pick.key === 'item:oyster') {
        drawBagDetail(ctx, {
            draw: function (c2, box) {
                itemArt.draw(ctx, 'oyster', box.x + box.w / 2, box.y + box.h / 2, 40, '#3a3358');
            },
            name: '珍珠贝',
            sub: '×' + st.oyster,
            price: pearlPrice,
            desc: [
                '打破后有 ' + Math.round((cfg.pond.oysterBreakRate || 0.5) * 100) + '% 开出一颗珍珠',
                '空壳也照样碎掉，一枚只博一次'
            ],
            tags: [{ txt: '每颗约 ' + pearlPrice + ' 期望', color: '#9a8fc4' }],
            buttons: bagActionsOf(state, session)
        }, ease);
    } else if (pick.key === 'item:pearl') {
        drawBagDetail(ctx, {
            draw: function (c2, box) {
                itemArt.draw(ctx, 'pearl', box.x + box.w / 2, box.y + box.h / 2, 40, '#2f5a72');
            },
            name: '珍珠',
            sub: '×' + st.pearl,
            price: pearlPrice,
            desc: ['每颗固定卖 ' + pearlPrice + ' 金币', '从珍珠贝里开出来，不会自己长'],
            tags: [{ txt: '共 ' + wallet.format(st.pearl * (cfg.pond.pearlPrice || 10000)), color: '#7fc2dc' }],
            buttons: bagActionsOf(state, session)
        }, ease);
    } else {
        drawBagDetail(ctx, {
            draw: function (c2, box) {
                itemArt.draw(ctx, 'bait', box.x + box.w / 2, box.y + box.h / 2, 40, '#3d5a2f');
            },
            name: '鱼饵',
            sub: '×' + st.bait,
            price: wallet.format(cfg.pond.bait.price) + '/个',
            desc: ['抛竿一次用 1 个', '鱼饵见底时去商店补，买多有折扣'],
            tags: [{ txt: '够抛 ' + st.bait + ' 次', color: '#9cc47a' }],
            buttons: bagActionsOf(state, session)
        }, ease);
    }
}

/* ---------------- 子页三：鱼卵（仓库囤着的 + 培育栏位里在孵的） ----------------
 * M16：蛋不再自动孵。产卵后先进这一页，点「孵化」才占一个培育位，
 * 到点鱼苗直接进鱼篓 —— 所以这一页既是仓库也是孵化台。 */

function drawBagEggs(ctx, state, ease, session) {
    var live = breed.hatchList(state);
    var slots = breed.hatchSlotsOf(state);
    var stored = breed.storedList(state);
    var t = state.t || 0;
    var sels = session.bagSels || [];

    var cells = eggCells(state);
    var storedN = stored.length;

    drawBagHeader(ctx, session, ease,
        '鱼卵 ' + storedN + '/' + breed.eggCapOf(state) + ' · 在孵 ' + live.length + '/' + slots,
        storedN, sels.length);

    if (!cells.length) {
        var er = L.bagCellRect(0, ease);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 11.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('还没有鱼卵 · 点右上「繁育」配一窝', W / 2, er.y + 42);
        drawBagEmptyDetail(ctx, ease, '配好的蛋会放到这里，再点「孵化」才开始倒数');
        return;
    }

    for (var k = 0; k < L.BAG_GRID_CAP && k < cells.length; k++) {
        var r = L.bagCellRect(k, ease);
        var cell = cells[k];
        var e = cell.egg;
        var sel = sels.indexOf(cell.key) >= 0;

        if (cell.kind === 'incubating') {
            /* 在孵：金边 + 进度条，一眼区分于"还在仓库里等着"的蛋 */
            cellFrame(ctx, r, { sel: false, line: U.hexA(TT.gold, 0.5) });
            breedRender.drawEgg(ctx, r.x + r.w / 2 - 12, r.y + 6, 24, 29, e.ready, e.twin, t);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '800 9px sans-serif';
            ctx.fillStyle = e.ready ? TT.goldLight : '#cfe0ef';
            ctx.fillText(e.ready ? '可孵' : breedRender.clock(e.left), r.x + 5, r.y + r.h - 12);

            ctx.textAlign = 'right';
            ctx.font = '700 9px sans-serif';
            ctx.fillStyle = TT.textSoft;
            ctx.fillText('在孵', r.x + r.w - 5, r.y + r.h - 12);

            roundRect(ctx, r.x + 5, r.y + r.h - 4, r.w - 10, 2.5, 1.25);
            ctx.fillStyle = 'rgba(8,14,30,0.6)';
            ctx.fill();
            roundRect(ctx, r.x + 5, r.y + r.h - 4, Math.max(2, (r.w - 10) * e.progress), 2.5, 1.25);
            ctx.fillStyle = e.ready ? TT.gold : '#6f9fc4';
            ctx.fill();
            continue;
        }

        /* 仓库里的蛋：选中后详情卡给「孵化」 */
        cellFrame(ctx, r, { sel: sel, line: U.hexA(TT.goldLight, 0.45) });
        breedRender.drawEgg(ctx, r.x + r.w / 2 - 12, r.y + 6, 24, 29, false, e.twin, t);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '700 9px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('待孵', r.x + 5, r.y + r.h - 12);

        ctx.textAlign = 'right';
        ctx.font = '700 9px sans-serif';
        ctx.fillStyle = e.egg.sex === 'f' ? '#d2799f' : '#6b9ad0';
        ctx.fillText(e.egg.sex === 'f' ? '♀' : '♂', r.x + r.w - 5, r.y + r.h - 12);

        if (sel) selBadge(ctx, r, 0);
    }

    if (cells.length > L.BAG_GRID_CAP) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('还有 ' + (cells.length - L.BAG_GRID_CAP) + ' 颗未显示 · 孵掉几颗再看',
            W - 18, L.bagDetailRect(ease).y - 8);
    }

    /* ---- 详情卡 ---- */
    var pick = null;
    for (var p = 0; p < cells.length; p++) {
        if (sels.indexOf(cells[p].key) >= 0) { pick = cells[p]; break; }
    }
    if (!pick) {
        drawBagEmptyDetail(ctx, ease, '点鱼卵 → 详情卡「孵化」 · 右上「繁育」配新一窝');
        return;
    }

    var room = breed.hatchRoom(state);

    if (sels.length > 1) {
        drawBagDetail(ctx, {
            draw: function (c3, box) {
                breedRender.drawEgg(ctx, box.x + box.w / 2 - 14, box.y + 7, 28, 34, false, false, t);
            },
            name: '已选 ' + sels.length + ' 颗蛋',
            price: '',
            desc: [
                '空培育位 ' + room + ' 个 · 装不下的留在仓库',
                '孵出的鱼苗直接进鱼篓'
            ],
            tags: [],
            buttons: bagActionsOf(state, session)
        }, ease);
        return;
    }

    var eg = pick.egg;
    var tags = [];
    var trs = eg.traits || [];
    for (var q = 0; q < trs.length && q < 3; q++) {
        var def = fishLib.traitDef(trs[q].id);
        if (def) tags.push({ txt: def.name + ' L' + fishLib.traitLvOf(trs[q]), color: TT.gold });
    }
    if (eg.twin) tags.unshift({ txt: '双生', color: '#c99ae8' });

    drawBagDetail(ctx, {
        draw: function (c2, box) {
            breedRender.drawEgg(ctx, box.x + box.w / 2 - 14, box.y + 7, 28, 34, false, eg.twin, t);
        },
        name: eg.species.name + ' 的蛋',
        sub: eg.egg.sex === 'f' ? '♀' : '♂',
        subColor: eg.egg.sex === 'f' ? '#d2799f' : '#6b9ad0',
        price: '',
        desc: [
            '孵 ' + allClock(eg.seconds) + ' · 鱼苗直接进鱼篓',
            eg.traits.length ? '带 ' + eg.traits.length + ' 条词条，孵出即成' : '没有词条，孵出是白板'
        ],
        tags: tags,
        buttons: bagActionsOf(state, session)
    }, ease);
}


/* 仓库入口：子页签固定在最上面，内容按 session.bagTab 分发 */
function drawBag(ctx, state, ease, session) {
    drawBagTabs(ctx, session, ease);

    var tab = session.bagTab || 0;
    if (tab === 0) drawBagEggs(ctx, state, ease, session);
    else if (tab === 1) drawBagProps(ctx, state, ease, session);
    else drawBagFish(ctx, state, ease, session);
}


function draw(ctx, state, session) {
    var ease = session.sheetEase;
    if (ease <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = ease;
    /* 遮罩用深墨而非纯黑，和风夜色下更自然 */
    ctx.fillStyle = 'rgba(6,10,24,0.66)';
    ctx.fillRect(0, 0, W, H);

    var top = L.sheetTop(ease);

    /* 圆角面板 */
    ctx.beginPath();
    ctx.moveTo(0, top + 24);
    ctx.arcTo(0, top, 24, top, 24);
    ctx.lineTo(W - 24, top);
    ctx.arcTo(W, top, W, top + 24, 24);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    var isCodex = session.sheetTab === 2;
    var bgG = ctx.createLinearGradient(0, top, 0, H);
    if (isCodex) {
        U.stop(bgG, 0, '#1e2a46');
        U.stop(bgG, 1, '#121a30');
    } else {
        U.stop(bgG, 0, '#263150');
        U.stop(bgG, 1, '#161f38');
    }
    ctx.fillStyle = bgG;
    ctx.fill();
    /* 描边：三页统一描金 */
    ctx.strokeStyle = '#c8a45c';
    ctx.lineWidth = 3;
    ctx.stroke();

    /* 顶部一道浅色高光，像纸板的边缘 */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, top + 26);
    ctx.arcTo(0, top, 26, top, 26);
    ctx.lineTo(W - 26, top);
    ctx.arcTo(W, top, W, top + 26, 26);
    ctx.lineTo(W, top + 30);
    ctx.lineTo(0, top + 30);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,212,160,0.10)';
    ctx.fill();
    ctx.restore();

    /* 标题 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 19px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(TAB_TITLE[session.sheetTab] || '系统', 18, top + 34);

    /* 关闭按钮 */
    var cr = L.closeRect(ease);
    Th.jelly(ctx, cr.x, cr.y, 32, 32, {
        top: '#2a3352', bottom: '#1a2340', deep: TT.cardDeep,
        r: 16, depth: 2, ink: TT.ink, lw: 2.2, gloss: false
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('×', cr.x + 16, cr.y + 16.5);

    /* 五页 */
    drawTabs(ctx, session, ease);
    if (session.sheetTab === 2) codexRender.draw(ctx, state, session);
    else if (session.sheetTab === 1) drawEggs(ctx, state, ease);
    else if (session.sheetTab === 3) drawPond(ctx, state, ease);
    else if (session.sheetTab === 4) drawBag(ctx, state, ease, session);
    else drawItems(ctx, state, ease);

    /* 底部提示 */
    ctx.textAlign = 'center';
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var tips = [
        '鱼饵 10 金币 · 长按购买键可连续买',
        '传奇卵 10% 出金鲤鱼 · 带「龙鳞」可吞噬同族化龙',
        '点开任意一条鱼查看资料 · 卖掉也会保留收录',
        '钓上来的鱼先进仓库 · 放缸养大更值钱',
        '点格子选中 · 鱼卵可孵化 · 鱼可放缸或卖出 · 右上角进繁育'
    ];
    ctx.fillText(tips[session.sheetTab] || tips[0], W / 2, H - C.SAFE_BOTTOM - 12);

    ctx.restore();
}

module.exports = {
    draw: draw,
    bagCellsOf: bagCellsOf,
    bagKeysOf: bagKeysOf,
    bagActionsOf: bagActionsOf
};
