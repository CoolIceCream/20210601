/* ============================================================
 * render/breed.js · 繁育浮层（M12）
 *
 * 为什么是浮层而不是第 6 个页签：页签已经 5 个、宽度见底（68px），
 * 再塞一个就装不下四个字。繁育是「偶尔进来做一次」的操作，
 * 用一个盖在仓库页上的全屏卡片更合适，也方便把 6 格培育缸排开。
 *
 * 卡内信息层级：
 *   孵化槽（结果）→ 亲本槽（输入）→ 消耗预览 → 繁育按钮 → 培育缸（产物）
 * 玩家从上往下读一遍就知道「还差什么」，不用来回翻页。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var L = require('../ui/layout.js');
var cfg = require('../config/index.js');
var fishLib = require('../core/fish.js');
var breed = require('../core/breed.js');
var wallet = require('../core/wallet.js');
var art = require('./fishart.js');
var Th = require('./theme.js');
var TT = Th.T;

var W = C.W;
var H = C.H;

function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
}

/* 倒计时 mm:ss */
function clock(sec) {
    var s = Math.max(0, Math.ceil(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
}

function sexColor(sex) {
    return sex === 'f' ? '#d2799f' : '#6b9ad0';
}

function sexMark(sex) {
    return sex === 'f' ? '♀' : '♂';
}

/* 蛋：米白椭圆 + 金色描边，双生在右上角挂个 ×2 */
function drawEgg(ctx, cx, cy, w, h, ready, twin, t) {
    ctx.save();
    var pulse = ready ? 1 + Math.sin((t || 0) * 5) * 0.04 : 1;
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);

    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, ready ? '#fff6dc' : '#f2e6cc');
    g.addColorStop(1, ready ? '#e8cf96' : '#cbb287');
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = ready ? TT.gold : 'rgba(200,164,92,0.55)';
    ctx.lineWidth = ready ? 2 : 1.4;
    ctx.stroke();

    /* 两三颗斑点，避免读成一颗白蛋 */
    ctx.fillStyle = 'rgba(168,132,70,0.28)';
    ctx.beginPath();
    ctx.arc(-w * 0.16, -h * 0.12, w * 0.09, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.12, h * 0.14, w * 0.07, 0, 6.2832);
    ctx.fill();

    if (twin) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10px sans-serif';
        ctx.fillStyle = TT.gold;
        ctx.fillText('×2', w * 0.34, -h * 0.34);
    }
    ctx.restore();
}

function drawMask(ctx) {
    ctx.fillStyle = 'rgba(6,10,24,0.74)';
    ctx.fillRect(0, 0, W, H);
}

function drawCard(ctx, c) {
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,20,0.7)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    Th.jelly(ctx, c.x, c.y, c.w, c.h, {
        top: TT.cardTop, bottom: TT.cardBottom, deep: TT.cardDeep,
        r: 24, depth: 6, ink: TT.ink, lw: 3, gloss: false
    });
    ctx.restore();
}

function drawHeader(ctx, c) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 17px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('繁育', c.x + 20, c.y + 28);

    ctx.font = '600 10.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('雌定鱼种 · 雄供词条', c.x + 68, c.y + 29);

    /* 关闭 */
    var r = L.breedCloseRect();
    Th.badge(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, {
        top: '#37436a', bottom: '#1f294a', ink: TT.ink, lw: 2
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('✕', r.x + r.w / 2, r.y + r.h / 2 + 0.5);
}

/* ---------------- 培育栏位 ----------------
 * M16：孵化槽 3 → 培育栏位 6，蛋不再自动孵，
 * 要在仓库里点「孵化」才进来倒数，所以这里只显示"正在孵的"。 */

function drawHatch(ctx, state, session, c) {
    var eggs = breed.hatchList(state);
    var total = breed.hatchSlotsOf(state);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('培育栏位 ' + eggs.length + '/' + total, c.x + 14, c.y + L.BR_SLOT_LABEL_Y);

    ctx.textAlign = 'right';
    ctx.font = '600 9.5px sans-serif';
    ctx.fillStyle = 'rgba(232,212,160,0.42)';
    ctx.fillText('到点自动进鱼篓', c.x + c.w - 14, c.y + L.BR_SLOT_LABEL_Y);

    for (var i = 0; i < total; i++) {
        var r = L.hatchSlotRect(i);
        var e = eggs[i];

        Th.card(ctx, r.x, r.y, r.w, r.h, {
            r: 12, depth: 2,
            ink: e && e.ready ? TT.gold : 'rgba(200,164,92,0.26)',
            lw: e && e.ready ? 2 : 1.5
        });

        if (!e) {
            /* 空位：虚线蛋轮廓 */
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(r.x + r.w / 2, r.y + 24, 10, 13, 0, 0, 6.2832);
            ctx.strokeStyle = 'rgba(200,164,92,0.2)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '600 9.5px sans-serif';
            ctx.fillStyle = 'rgba(232,212,160,0.3)';
            ctx.fillText('空位', r.x + r.w / 2, r.y + 48);
            continue;
        }

        drawEgg(ctx, r.x + r.w / 2, r.y + 24, 20, 25, e.ready, e.twin, state.t);

        /* 进度条：贴格子下沿 */
        var bw = r.w - 16;
        rr(ctx, r.x + 8, r.y + r.h - 8, bw, 3.5, 1.75);
        ctx.fillStyle = 'rgba(8,14,30,0.55)';
        ctx.fill();
        rr(ctx, r.x + 8, r.y + r.h - 8, Math.max(2, bw * e.progress), 3.5, 1.75);
        ctx.fillStyle = e.ready ? TT.gold : '#6f9fc4';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10px sans-serif';
        ctx.fillStyle = e.ready ? TT.goldLight : TT.text;
        ctx.fillText(e.ready ? '可孵' : clock(e.left), r.x + r.w / 2, r.y + 48);
    }
}

/* ---------------- 亲本槽 ---------------- */

function drawParentSlot(ctx, state, session, k, fishId) {
    var r = L.breedParentRect(k);
    var f = fishId ? breed.findFish(state, fishId) : null;
    var want = k === 0 ? 'f' : 'm';
    var fatigue = f ? breed.fatigueLeft(f) : 0;

    Th.card(ctx, r.x, r.y, r.w, r.h, {
        r: 16, depth: 3,
        ink: f ? (fatigue > 0 ? 'rgba(200,164,92,0.34)' : TT.gold) : 'rgba(200,164,92,0.26)',
        lw: f ? 2 : 1.6
    });

    /* 槽位标签 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 9.5px sans-serif';
    ctx.fillStyle = sexColor(want);
    ctx.fillText(k === 0 ? '♀ 雌鱼 · 定鱼种' : '♂ 雄鱼 · 供词条', r.x + 10, r.y + 12);

    if (!f) {
        /* 空槽：圆形虚线 + 提示 */
        ctx.beginPath();
        ctx.arc(r.x + 34, r.y + 52, 20, 0, 6.2832);
        ctx.strokeStyle = sexColor(want);
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 15px sans-serif';
        ctx.fillStyle = sexColor(want);
        ctx.globalAlpha = 0.55;
        ctx.fillText('+', r.x + 34, r.y + 52);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'left';
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('点此选' + (want === 'f' ? '雌' : '雄') + '鱼', r.x + 60, r.y + 52);
        return;
    }

    var sp = fishLib.speciesById(f.speciesId);

    /* 缩略图 */
    ctx.save();
    rr(ctx, r.x + 8, r.y + 24, 44, 44, 12);
    ctx.fillStyle = 'rgba(10,18,36,0.6)';
    ctx.fill();
    ctx.restore();
    art.drawThumb(ctx, sp.id, r.x + 10, r.y + 26, 40, 40, { t: state.t, phase: k * 1.7 });

    /* 名字 + 性别 + 稀有度 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 12px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(sp.name, r.x + 58, r.y + 34);

    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = sexColor(f.sex);
    ctx.fillText(sexMark(f.sex), r.x + 58, r.y + 50);

    ctx.font = '600 9.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText(sp.rarity + ' · Σlv ' + fishLib.traitSumOf(f), r.x + 70, r.y + 50);

    /* 成长 / 疲劳：320 宽时这张卡只有 131px，整行会溢出，按剩余宽度截断 */
    ctx.font = '600 9.5px sans-serif';
    var infoW = Math.max(30, r.w - 58 - 6);
    if (fatigue > 0) {
        ctx.fillStyle = '#e8a98e';
        ctx.fillText('疲劳 ' + clock(fatigue), r.x + 58, r.y + 62);
    } else {
        ctx.fillStyle = TT.textSoft;
        var gtxt = '成长 ' + Math.round(f.growth) + '%';
        var ftxt = gtxt + ' · 卖 ' + wallet.format(fishLib.sellPriceOf(f, state.shellLv));
        /* 窄屏放不下就连卖价一起省掉，只留成长 —— 卖价在选鱼列表和详情里都能看到 */
        ctx.fillText(ctx.measureText(ftxt).width <= infoW ? ftxt : gtxt, r.x + 58, r.y + 62);
    }

    /* 词条小条：最多两条，放得下就画 */
    var traits = f.traits || [];
    for (var i = 0; i < traits.length && i < 2; i++) {
        var def = fishLib.traitDef(traits[i].id);
        if (!def) continue;
        var lv = fishLib.traitLvOf(traits[i]);
        var tx = r.x + 58 + i * 54;
        var ty = r.y + r.h - 14;
        rr(ctx, tx, ty - 7, 50, 14, 7);
        ctx.fillStyle = (cfg.traits.lvBg || [])[lv] || 'rgba(200,164,92,0.14)';
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '700 9px sans-serif';
        ctx.fillStyle = (cfg.traits.lvColor || [])[lv] || TT.gold;
        ctx.fillText(def.name + ' L' + lv, tx + 25, ty);
    }
}

/* ---------------- 预览 + 繁育按钮 ---------------- */

function drawPreview(ctx, state, session, c, chk) {
    var r = L.breedPreviewRect();
    rr(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = 'rgba(10,18,36,0.42)';
    ctx.fill();

    ctx.textBaseline = 'middle';

    if (!chk.ok) {
        ctx.textAlign = 'left';
        ctx.font = '700 11px sans-serif';
        ctx.fillStyle = '#e8a98e';
        ctx.fillText(chk.text || '还不能繁育', r.x + 12, r.y + r.h / 2);
        return;
    }

    var sp = chk.species;
    var slots = fishLib.traitSlotsOf(sp);
    var maxLv = fishLib.traitMaxLvOf(sp);
    var cy2 = r.y + r.h / 2;

    /* 右端消耗先量宽度，左边再按剩余空间截断 ——
     * 320 宽的机器上「上限 L3 · 180s」和「鱼饵×3」原来会撞在一起。 */
    var coinTxt = chk.cost.coin > 0 ? wallet.format(chk.cost.coin) : '免费';
    var rightTxt = coinTxt + ' · 鱼饵×' + chk.cost.bait;
    ctx.font = '700 10.5px sans-serif';
    var rightW = ctx.measureText(rightTxt).width;

    ctx.textAlign = 'left';
    ctx.font = '800 11.5px sans-serif';
    ctx.fillStyle = TT.goldLight;
    var nameTxt = '预计 ' + sp.name;
    ctx.fillText(nameTxt, r.x + 12, cy2);
    var nameW = ctx.measureText(nameTxt).width;

    ctx.font = '600 10.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var avail = Math.max(24, r.w - 24 - rightW - nameW - 16);
    var subFull = slots + ' 槽 · 上限 L' + maxLv + ' · ' + chk.seconds + 's';
    var subShort = slots + ' 槽 · ≤L' + maxLv + ' · ' + chk.seconds + 's';
    var subTxt = ctx.measureText(subFull).width <= avail ? subFull
        : (ctx.measureText(subShort).width <= avail ? subShort : U.fitText(ctx, subFull, avail));
    ctx.fillText(subTxt, r.x + 12 + nameW + 8, cy2);

    ctx.textAlign = 'right';
    ctx.font = '700 10.5px sans-serif';
    ctx.fillStyle = chk.cost.coin > 0 ? TT.goldLight : TT.textSoft;
    ctx.fillText(rightTxt, r.x + r.w - 12, cy2);
}

function drawGo(ctx, session, c, chk) {
    var r = L.breedGoRect();
    var on = chk.ok;

    Th.jelly(ctx, r.x, r.y, r.w, r.h, {
        top: on ? '#e0c170' : '#2a3352',
        bottom: on ? '#a8802f' : '#1a2340',
        deep: on ? '#7d5c18' : TT.cardDeep,
        r: 18, depth: on ? 4 : 2,
        ink: on ? '#6f5220' : 'rgba(200,164,92,0.24)',
        lw: 2.2, gloss: on
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 14px sans-serif';
    ctx.fillStyle = on ? '#fff3d2' : 'rgba(232,212,160,0.4)';
    ctx.fillText(on ? '开始繁育' : (chk.text || '还不能繁育'), r.x + r.w / 2, r.y + r.h / 2 + 0.5);
}

/* ---------------- 选亲本浮层 ---------------- */

function drawPicker(ctx, state, session) {
    var want = session.breedPick === 'mother' ? 'f' : 'm';
    var otherId = session.breedPick === 'mother' ? session.breedFather : session.breedMother;

    var all = breed.candidatesOf(state);
    var pool = [];
    for (var i = 0; i < all.length; i++) {
        var f = all[i].fish;
        if (f.sex !== want) continue;
        if (f.id === otherId) continue;
        pool.push(all[i]);
    }

    /* 卡片高度跟候选条数走 */
    var c = L.pickCardRect(Math.max(1, Math.min(6, pool.length)));

    drawMask(ctx);
    drawCard(ctx, c);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(want === 'f' ? '选雌鱼（定鱼种）' : '选雄鱼（供词条）', c.x + 16, c.y + 26);

    if (!pool.length) {
        ctx.textAlign = 'center';
        ctx.font = '600 11.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText(want === 'f' ? '没有可用的雌鱼 · 去仓库看看' : '没有可用的雄鱼 · 去仓库看看',
            c.x + c.w / 2, c.y + c.h / 2);
        var b = L.pickBtnRect(0, c);
        Th.jelly(ctx, b.x, b.y, b.w * 2 + 10, b.h, {
            top: '#37436a', bottom: '#1f294a', deep: TT.cardDeep,
            r: 16, depth: 3, ink: TT.ink, lw: 2
        });
        Th.textOutlined(ctx, '关闭', b.x + b.w + 5, b.y + b.h / 2, 13, TT.goldLight, '#232c48', 3);
        return;
    }

    var maxShow = 6;
    var n = Math.min(maxShow, pool.length);
    for (var k = 0; k < n; k++) {
        var it = pool[k];
        var fr = L.pickRowRect(k);
        var sp = fishLib.speciesById(it.fish.speciesId);

        Th.card(ctx, fr.x, fr.y, fr.w, fr.h, { r: 12, depth: 2 });

        art.drawThumb(ctx, sp.id, fr.x + 4, fr.y + 3, 40, 40, { t: state.t, phase: k });

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '800 12px sans-serif';
        ctx.fillStyle = TT.text;
        ctx.fillText(sp.name, fr.x + 52, fr.y + 15);

        ctx.font = '600 9.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText(sexMark(it.fish.sex) + ' · ' + sp.rarity + ' · Σlv ' + fishLib.traitSumOf(it.fish) +
            ' · ' + (it.zone === 'tank' ? '缸内' : '仓库'), fr.x + 52, fr.y + 31);

        /* 右端：疲劳或卖价 */
        ctx.textAlign = 'right';
        ctx.font = '700 10px sans-serif';
        if (it.fatigue > 0) {
            ctx.fillStyle = '#e8a98e';
            ctx.fillText('疲劳 ' + clock(it.fatigue), fr.x + fr.w - 10, fr.y + fr.h / 2);
        } else {
            ctx.fillStyle = TT.goldLight;
            ctx.fillText(wallet.format(fishLib.sellPriceOf(it.fish, state.shellLv)),
                fr.x + fr.w - 10, fr.y + fr.h / 2);
        }
    }

    if (pool.length > maxShow) {
        ctx.textAlign = 'center';
        ctx.font = '600 9.5px sans-serif';
        ctx.fillStyle = 'rgba(232,212,160,0.5)';
        ctx.fillText('还有 ' + (pool.length - maxShow) + ' 条未显示', c.x + c.w / 2,
            L.pickRowRect(n - 1).y + 58);
    }

    ctx.textAlign = 'center';
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = 'rgba(232,212,160,0.46)';
    ctx.fillText('Σlv 越高越值钱 · 同种繁育升级率 33%', c.x + c.w / 2, c.y + c.h - 78);

    /* 底部关闭 */
    var b = L.pickBtnRect(0, c);
    Th.jelly(ctx, b.x, b.y, b.w * 2 + 10, b.h, {
        top: '#37436a', bottom: '#1f294a', deep: TT.cardDeep,
        r: 16, depth: 3, ink: TT.ink, lw: 2
    });
    Th.textOutlined(ctx, '取消', b.x + b.w + 5, b.y + b.h / 2, 13, TT.goldLight, '#232c48', 3);
}

/* ---------------- 入口 ---------------- */

function draw(ctx, state, session) {
    if (!session.breedOpen) return;

    var c = L.breedCardRect();
    drawMask(ctx);
    drawCard(ctx, c);
    drawHeader(ctx, c);

    drawHatch(ctx, state, session, c);
    drawParentSlot(ctx, state, session, 0, session.breedMother);
    drawParentSlot(ctx, state, session, 1, session.breedFather);

    var chk = breed.canBreed(state, session.breedMother, session.breedFather);
    drawPreview(ctx, state, session, c, chk);
    drawGo(ctx, session, c, chk);

    /* 底部一行规则提示：把「蛋去哪儿了」说清楚，省得玩家以为蛋丢了 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = 'rgba(232,212,160,0.46)';
    ctx.fillText('产出的蛋进仓库鱼卵 · 在仓库点「孵化」才占培育位',
        c.x + c.w / 2, c.y + L.BR_HINT_Y);

    if (session.breedPick) drawPicker(ctx, state, session);
}

module.exports = {
    draw: draw,
    /* 仓库「鱼卵」子页也要画同一颗蛋，别在那边再抄一份路径 */
    drawEgg: drawEgg,
    clock: clock
};
