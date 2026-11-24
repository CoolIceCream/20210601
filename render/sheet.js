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
var Th = require('./theme.js');
var TT = Th.T;
var codexRender = require('./codex.js');

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
                ? '必出 ' + st.rep.name + ' · 只吃鱼不吃鱼饵'
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

/* ---------------- 仓库页 ---------------- */

function drawBag(ctx, state, ease, session) {
    var list = pond.caughtList(state);
    var st = pond.statusOf(state);
    var top = L.sheetTop(ease);
    var t = state.t || 0;

    /* 小标题：鱼篓 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('鱼篓 · ' + list.length + ' 条', 18, top + L.BAG_TOP + 6);

    /* 鱼网格 3×3 */
    var maxShow = L.BAG_COLS * L.BAG_ROWS;
    for (var i = 0; i < maxShow; i++) {
        var r = L.bagFishRect(i, ease);
        var cell = list[i];
        if (cell) {
            var sel = session.bagSel === cell.fish.id;
            Th.card(ctx, r.x, r.y, r.w, r.h, sel ? {
                r: 14, depth: 3, top: '#3d3122', bottom: '#2b2318',
                ink: TT.gold, lw: 2.2
            } : { r: 14, depth: 2 });

            art.drawThumb(ctx, cell.species.id, r.x + 5, r.y + 4, r.w - 10, 46, {
                t: t, phase: i * 1.3
            });

            ctx.textAlign = 'center';
            ctx.font = '700 10px sans-serif';
            ctx.fillStyle = TT.textSoft;
            ctx.fillText(cell.stage + ' ' + cell.growth + '%', r.x + r.w / 2, r.y + r.h - 22);
            ctx.font = '800 12px sans-serif';
            ctx.fillStyle = TT.goldLight;
            ctx.fillText(wallet.format(cell.price), r.x + r.w / 2, r.y + r.h - 8);
        } else {
            roundRect(ctx, r.x, r.y, r.w, r.h, 14);
            ctx.strokeStyle = 'rgba(200,164,92,0.16)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    /* 超出 9 条的提示 */
    if (list.length > maxShow) {
        ctx.textAlign = 'right';
        ctx.font = '600 10.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('还有 ' + (list.length - maxShow) + ' 条未显示',
            W - 18, top + L.BAG_GRID_Y + L.BAG_ROWS * (L.BAG_CELL_H + 8) - 10);
    }

    /* 道具行：珍珠贝 / 珍珠 / 鱼饵 */
    var items = [
        { icon: 'oyster', name: '珍珠贝', n: st.oyster, act: '打破', on: st.oyster > 0, bg: '#3a3358' },
        { icon: 'pearl', name: '珍珠', n: st.pearl, act: '卖 1万', on: st.pearl > 0, bg: '#2f5a72' },
        { icon: 'bait', name: '鱼饵', n: st.bait, act: '钓具', on: false, bg: '#3d5a2f' }
    ];
    for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var ir = L.bagItemRect(k, ease);
        Th.card(ctx, ir.x, ir.y, ir.w, ir.h, { r: 14, depth: 2 });

        /* 图标块 */
        roundRect(ctx, ir.x + 8, ir.y + 10, 40, 40, 12);
        ctx.fillStyle = it.bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,212,160,0.45)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        itemArt.draw(ctx, it.icon, ir.x + 28, ir.y + 30, 28, it.bg);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '800 12px sans-serif';
        ctx.fillStyle = TT.text;
        ctx.fillText(it.name, ir.x + 54, ir.y + 24);

        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = it.n > 0 ? TT.goldLight : TT.textSoft;
        ctx.fillText('×' + it.n, ir.x + 54, ir.y + 42);

        ctx.textAlign = 'center';
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = it.on ? TT.gold : TT.textSoft;
        ctx.fillText(it.act, ir.x + ir.w / 2, ir.y + ir.h - 9);
    }

    /* 底部操作栏：只服务选中的鱼 */
    var a0 = L.bagActionRect(0, ease);
    var a1 = L.bagActionRect(1, ease);
    var pick = null;
    for (var s = 0; s < list.length; s++) {
        if (list[s].fish.id === session.bagSel) { pick = list[s]; break; }
    }

    if (pick) {
        /* 左：放进鱼缸 */
        Th.jelly(ctx, a0.x, a0.y, a0.w, a0.h, {
            top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep,
            r: 14, depth: 3, ink: '#2f6b45', lw: 2.2
        });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 15px sans-serif';
        ctx.fillStyle = '#eafff2';
        ctx.fillText('放入鱼缸', a0.x + a0.w / 2, a0.y + a0.h / 2);

        /* 右：卖掉 */
        Th.jelly(ctx, a1.x, a1.y, a1.w, a1.h, {
            top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
            r: 14, depth: 3, ink: '#5f1e18', lw: 2.2
        });
        ctx.font = '800 15px sans-serif';
        ctx.fillStyle = '#fff3d2';
        ctx.fillText('卖 +' + wallet.format(pick.price), a1.x + a1.w / 2, a1.y + a1.h / 2);
    } else {
        Th.jelly(ctx, a0.x, a0.y, W - 32, a0.h, {
            top: '#2a3352', bottom: '#1a2340', deep: TT.cardDeep,
            r: 14, depth: 2, ink: 'rgba(200,164,92,0.28)', lw: 1.8, gloss: false
        });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 12px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('点一条鱼选中，再选择放缸或卖掉', a0.x + (W - 32) / 2, a0.y + a0.h / 2);
    }
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
        '鱼位满了可以开新缸 · 仓库扩容加鱼位',
        '普通卵随机出鱼 · 传奇卵必出小鲨鱼',
        '点开任意一条鱼查看资料 · 卖掉也会保留收录',
        '钓上来的鱼先进仓库 · 放缸养大更值钱',
        '点鱼选中 · 可放缸也可直接卖'
    ];
    ctx.fillText(tips[session.sheetTab] || tips[0], W / 2, H - C.SAFE_BOTTOM - 12);

    ctx.restore();
}

module.exports = {
    draw: draw
};
