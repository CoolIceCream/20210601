/* ============================================================
 * render/sell.js · 选中鱼的光圈 + 鱼信息卡（M14）
 *
 * 沿革：
 *   M10 撤掉底栏的「卖掉」后，成交入口挪到鱼头顶的价签上（点一下就卖）。
 *   M14 把价签改成一张信息卡：
 *     · 鱼头顶不再挂东西，也不再有性别角标 —— 画面更干净
 *     · 点鱼 → 屏幕底部弹一张卡：名字 / 阶段 / 成长 / 饱食 / 词条 / 身价
 *     · 卡上只有「捞出到仓库」，金鲤鱼带龙鳞时多一枚「吞噬」
 *
 * 为什么不在卡上直接卖：
 *   点一下就成交的入口太容易误触（手指划水都能碰到）。
 *   统一走「捞出 → 仓库 → 卖」，多一步但不会被点掉一条鱼。
 *
 * 坐标：光圈在缸内坐标系（会被 view 缩放平移），
 *       信息卡在屏幕坐标系（固定底部，放大后也不会被裁）。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var Th = require('./theme.js');
var TT = Th.T;
var itemArt = require('./itemart.js');
var L = require('../ui/layout.js');
var fishLib = require('../core/fish.js');
var wallet = require('../core/wallet.js');
var dragon = require('../core/dragon.js');
var cfg = require('../config/index.js');

var W = C.W;
var rr = U.roundRect;

/* 当前选中的鱼；被卖掉/捞出/吃掉/切缸后自动失效 */
function selectedOf(state) {
    var id = state.view && state.view.selFish;
    if (!id) return null;
    var act = state.activeTank || 0;
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if (f.id === id && (f.tank || 0) === act) return f;
    }
    return null;
}

/**
 * 信息卡上的按钮。
 * 只有进化线（金鲤鱼）且确实带龙鳞时才多一枚「吞噬」——
 * 数量由鱼本身决定，不依赖「现在有没有猎物」，
 * 否则按钮会在「有猎物/没猎物」之间跳来跳去，命中区跟着漂。
 */
function buttonsOf(state, f) {
    var out = [{ key: 'dump', label: '捞出到仓库', enabled: true }];
    if (!f || !fishLib.isEvolving(f)) return out;
    if (!fishLib.hasTrait(f, dragon.KEY_TRAIT)) return out;

    var st = dragon.statusOf(state, f.id);
    if (st.reason === 'max') {
        out.push({ key: 'devour', label: '真龙 · 已满阶', enabled: false });
    } else if (st.reason === 'no_prey') {
        out.push({ key: 'devour', label: '缺同族金鲤', enabled: false });
    } else {
        out.push({ key: 'devour', label: '吞噬 → ' + (st.nextStage || '进化'), enabled: true });
    }
    return out;
}

/* 触摸层用：卡片矩形 + 每个按钮的屏幕矩形与可用状态 */
function cardHitOf(state) {
    var f = selectedOf(state);
    if (!f) return null;
    var list = buttonsOf(state, f);
    var out = [];
    for (var i = 0; i < list.length; i++) {
        out.push({
            key: list[i].key,
            label: list[i].label,
            enabled: !!list[i].enabled,
            rect: L.fishCardBtnRect(i, list.length)
        });
    }
    return { rect: L.fishCardRect(), buttons: out, fishId: f.id };
}

/* ---------------- 缸内：选中光圈 ---------------- */

/* 只画一圈金环，不画任何文字 —— 文字全搬到信息卡里了 */
function drawSelection(ctx, state) {
    var f = selectedOf(state);
    if (!f) return;

    var size = fishLib.sizeOf(f);
    var r = size * 0.82;
    var pulse = 0.75 + Math.sin((state.t || 0) * 4) * 0.18;

    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,214,110,0.16)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,198,70,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}

/* ---------------- 屏幕坐标：信息卡 ---------------- */

function chipW(ctx, name, lv) {
    ctx.font = '700 10px sans-serif';
    return ctx.measureText(name + ' L' + lv).width + 16;
}

function drawTraitChips(ctx, f, x, y) {
    var traits = f.traits || [];
    if (!traits.length) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 10px sans-serif';
        ctx.fillStyle = 'rgba(232,212,160,0.40)';
        ctx.fillText('无词条', x, y);
        return;
    }

    var cx = x;
    var h = 18;
    for (var i = 0; i < traits.length && i < 2; i++) {
        var def = fishLib.traitDef(traits[i].id);
        if (!def) continue;
        var lv = fishLib.traitLvOf(traits[i]);
        var w = chipW(ctx, def.name, lv);
        /* 龙鳞用赤金，和普通词条区分开：它是化龙的钥匙 */
        var isKey = def.id === dragon.KEY_TRAIT;
        rr(ctx, cx, y - h / 2, w, h, 9);
        ctx.fillStyle = isKey
            ? 'rgba(240,182,72,0.26)'
            : ((cfg.traits.lvBg || [])[lv] || 'rgba(200,164,92,0.14)');
        ctx.fill();
        ctx.strokeStyle = isKey ? 'rgba(255,214,120,0.72)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 10px sans-serif';
        ctx.fillStyle = isKey ? '#ffd980' : ((cfg.traits.lvColor || [])[lv] || TT.gold);
        ctx.fillText(def.name + ' L' + lv, cx + w / 2, y + 0.5);

        cx += w + 6;
    }
}

function drawCard(ctx, state) {
    var f = selectedOf(state);
    if (!f) return;

    var r = L.fishCardRect();
    var t = state.t || 0;

    Th.card(ctx, r.x, r.y, r.w, r.h, { r: 18, depth: 4 });

    var sp = fishLib.speciesById(f.speciesId);
    var evo = fishLib.evoOf(f);
    var stage = fishLib.stageName(fishLib.stageOf(f.growth));
    /* 进化体用阶段名当标题（蛟 / 真龙），原始种用鱼种名 */
    var title = evo > 0 ? fishLib.evoStageName(f) : sp.name;
    var gold = evo > 0;

    /* ---- 第一行：名字 + 性别徽章 ………… 身价 ---- */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    var titleTxt = U.fitText(ctx, title, r.w - 190);
    ctx.fillStyle = gold ? '#ffd980' : TT.text;
    ctx.fillText(titleTxt, r.x + 16, r.y + 22);
    var nw = ctx.measureText(titleTxt).width;

    /* 性别：从鱼头顶挪到卡里，繁育时仍然一眼能看到 */
    var sx = r.x + 16 + nw + 12;
    ctx.beginPath();
    ctx.arc(sx, r.y + 21, 8, 0, 6.2832);
    ctx.fillStyle = f.sex === 'f' ? 'rgba(206,110,152,0.92)' : 'rgba(94,146,206,0.92)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '700 9px sans-serif';
    ctx.fillStyle = '#fff6ea';
    ctx.fillText(f.sex === 'f' ? '♀' : '♂', sx, r.y + 21.5);

    /* 身价：右上角 */
    var price = fishLib.sellPriceOf(f, state.shellLv);
    ctx.textAlign = 'right';
    ctx.font = '600 9.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('身价', r.x + r.w - 16, r.y + 14);
    ctx.font = '800 14px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(wallet.format(price), r.x + r.w - 16, r.y + 30);

    /* ---- 第二行：品质 · 阶段 · 成长 · 饱食（进化线额外显示阶数） ---- */
    ctx.textAlign = 'left';
    ctx.font = '600 10.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var line2 = sp.rarity + ' · ' + stage +
        ' · 成长 ' + Math.round(f.growth) + '%' +
        ' · 饱食 ' + Math.round(f.hunger);
    if (evo > 0) {
        line2 = '进化 ' + evo + '/' + fishLib.maxEvoOf(sp) + ' · ' + line2;
    }
    ctx.fillText(U.fitText(ctx, line2, r.w - 32), r.x + 16, r.y + 46);

    /* ---- 第三行：词条胶囊 ---- */
    drawTraitChips(ctx, f, r.x + 16, r.y + 74);

    /* ---- 按钮行 ---- */
    var list = buttonsOf(state, f);
    for (var i = 0; i < list.length; i++) {
        var b = L.fishCardBtnRect(i, list.length);
        var isDevour = list[i].key === 'devour';
        var on = list[i].enabled;

        if (!on) {
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: TT.greyTop, bottom: TT.greyBottom, deep: TT.greyDeep,
                r: 14, depth: 2, ink: 'rgba(200,164,92,0.26)', lw: 1.8, gloss: false
            });
        } else if (isDevour) {
            /* 吞噬用赤金：这是一条「不可逆」的操作，得比捞出更抢眼 */
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: '#e2a24a', bottom: '#a95f22', deep: '#7d4416',
                r: 14, depth: 3, ink: '#4a2610', lw: 2.2
            });
        } else {
            Th.jelly(ctx, b.x, b.y, b.w, b.h, {
                top: '#6c8cc4', bottom: '#2f4b80', deep: '#22375e',
                r: 14, depth: 3, ink: '#1b2b48', lw: 2.2
            });
        }

        /* 「捞出」按钮画一枚小箱图标，和仓库页的图标同族 */
        if (!isDevour) {
            itemArt.draw(ctx, 'warehouse', b.x + 26, b.y + b.h / 2, 20, '#2f4b80');
            ctx.textAlign = 'left';
            ctx.fillStyle = on ? '#f4f8ff' : TT.textSoft;
            ctx.font = '800 12.5px sans-serif';
            ctx.fillText(U.fitText(ctx, list[i].label, b.w - 46), b.x + 42, b.y + b.h / 2 + 1);
        } else {
            ctx.textAlign = 'center';
            ctx.fillStyle = on ? '#fff3d2' : TT.textSoft;
            ctx.font = '800 12.5px sans-serif';
            ctx.fillText(U.fitText(ctx, list[i].label, b.w - 16),
                b.x + b.w / 2, b.y + b.h / 2 + 1);
        }
    }

    /* 卡片顶上一条呼吸金线，提示「这条鱼是选中的」 */
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(t * 3) * 0.10;
    rr(ctx, r.x + 14, r.y + 1.5, r.w - 28, 2, 1);
    ctx.fillStyle = TT.gold;
    ctx.fill();
    ctx.restore();
}

module.exports = {
    selectedOf: selectedOf,
    buttonsOf: buttonsOf,
    cardHitOf: cardHitOf,
    drawSelection: drawSelection,
    drawCard: drawCard
};
