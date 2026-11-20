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
var Th = require('./theme.js');
var TT = Th.T;

var W = C.W;
var H = C.H;
var roundRect = U.roundRect;

var RARITY = cfg.rarityColor;
var TAB_NAME = ['道具', '鱼卵'];

/* ---------------- 页签 ---------------- */

function drawTabs(ctx, session, ease) {
    for (var i = 0; i < TAB_NAME.length; i++) {
        var r = L.tabRect(i, ease);
        var on = session.sheetTab === i;

        if (on) {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep,
                r: 15, depth: 3, ink: '#2f7a25', lw: 2.4
            });
        } else {
            Th.jelly(ctx, r.x, r.y, r.w, r.h, {
                top: TT.cardTop, bottom: '#f3e3c4', deep: 'rgba(150,110,60,0.22)',
                r: 15, depth: 3, ink: 'rgba(107,68,35,0.5)', lw: 2, gloss: false
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        if (on) {
            Th.textOutlined(ctx, TAB_NAME[i], r.x + r.w / 2, r.y + r.h / 2 + 1, 14, '#ffffff', '#2b6b20', 3);
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
        ctx.strokeStyle = 'rgba(107,68,35,0.5)';
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
            ctx.fillStyle = '#e4f6d4';
            ctx.fill();
            ctx.strokeStyle = 'rgba(70,140,50,0.45)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = '#3d7f2a';
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
                r: 12, depth: 2.5, ink: 'rgba(107,68,35,0.35)', lw: 2, gloss: false
            });
        } else {
            Th.jelly(ctx, br.x, br.y, br.w, 38, {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
                r: 12, depth: 3, ink: '#8a5a12', lw: 2.4
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 14px sans-serif';
        ctx.fillStyle = st.disabled ? '#a3906f' : '#6b4421';
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
                r: 16, depth: 2.5, top: '#f7f1e4', bottom: '#e8ddc6',
                deep: 'rgba(120,100,70,0.2)', ink: 'rgba(107,68,35,0.32)', lw: 2
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
            ctx.strokeStyle = '#a56a10';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '800 15px sans-serif';
        ctx.fillStyle = st.locked ? '#a2927a' : TT.text;
        ctx.fillText(EGG_NAME[st.rarity] || st.rarity,
            tx + (st.rarity === 'LEGEND' ? 20 : 0), r.y + 26);

        /* 副信息：这一档能开出哪些鱼，以及卖价区间 */
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = st.locked ? '#b3a58c' : TT.textSoft;
        var sub = st.locked
            ? '需 ' + st.need + ' 条鱼解锁'
            : st.rarity === 'LEGEND'
                ? '必出 ' + st.rep.name + ' · 只吃鱼不吃鱼饵'
                : st.count + ' 种' + (st.secretHint ? ' + ' + st.secretHint : '') +
                  ' · 卖 ' + wallet.format(Math.round(st.minSell)) + '~' +
                  wallet.format(Math.round(st.maxSell));
        ctx.fillText(U.fitText(ctx, sub, r.w - 176), tx, r.y + 48);

        /* 第三行：平均能卖多少，帮助判断值不值 */
        ctx.font = '600 10.5px sans-serif';
        ctx.fillStyle = st.locked ? '#bdb09a' : '#9a7a52';
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
                r: 12, depth: 2, ink: 'rgba(107,68,35,0.32)', lw: 1.8, gloss: false
            });
        } else {
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
                r: 12, depth: 3, ink: '#8a5a12', lw: 2.2
            });
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = st.disabled ? '#a3906f' : '#6b4421';
        ctx.fillText(st.locked ? '未解锁' : st.full ? '鱼位满' : st.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
}

/* ---------------- 入口 ---------------- */

function draw(ctx, state, session) {
    var ease = session.sheetEase;
    if (ease <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = ease;
    /* 遮罩用暖棕而不是纯黑，卡通风格下纯黑会显脏 */
    ctx.fillStyle = 'rgba(58,38,18,0.42)';
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
    var bgG = ctx.createLinearGradient(0, top, 0, H);
    U.stop(bgG, 0, '#fffdf6');
    U.stop(bgG, 1, '#ffeed0');
    ctx.fillStyle = bgG;
    ctx.fill();
    /* 木色描边 */
    ctx.strokeStyle = '#6b4423';
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
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    ctx.restore();

    /* 标题 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 19px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText('商店', 18, top + 34);

    /* 关闭按钮 */
    var cr = L.closeRect(ease);
    Th.jelly(ctx, cr.x, cr.y, 32, 32, {
        top: '#fff3d8', bottom: '#f0cf9a', deep: 'rgba(150,110,60,0.3)',
        r: 16, depth: 2, ink: TT.ink, lw: 2.2, gloss: false
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText('×', cr.x + 16, cr.y + 16.5);

    /* 两页 */
    drawTabs(ctx, session, ease);
    if (session.sheetTab === 1) drawEggs(ctx, state, ease);
    else drawItems(ctx, state, ease);

    /* 底部提示 */
    ctx.textAlign = 'center';
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var tip = session.sheetTab === 1
        ? '普通卵随机出鱼 · 传奇卵必出小鲨鱼'
        : '鱼位满了可以开新缸 · 仓库扩容加鱼位';
    ctx.fillText(tip, W / 2, H - C.SAFE_BOTTOM - 12);

    ctx.restore();
}

module.exports = {
    draw: draw
};
