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

/* ---------------- 孵化槽 ---------------- */

function drawHatch(ctx, state, session, c) {
    var eggs = breed.hatchList(state);
    var total = cfg.breed.slots || 3;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('孵化槽 ' + eggs.length + '/' + total, c.x + 14, c.y + L.BR_HATCH_Y - 9);

    for (var i = 0; i < total; i++) {
        var r = L.hatchSlotRect(i);
        var e = eggs[i];

        Th.card(ctx, r.x, r.y, r.w, r.h, {
            r: 14, depth: 2,
            ink: e && e.ready ? TT.gold : 'rgba(200,164,92,0.30)',
            lw: e && e.ready ? 2 : 1.6
        });

        if (!e) {
            /* 空槽：虚线蛋轮廓 */
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(r.x + r.w / 2, r.y + 20, 11, 14, 0, 0, 6.2832);
            ctx.strokeStyle = 'rgba(200,164,92,0.22)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '600 10px sans-serif';
            ctx.fillStyle = 'rgba(232,212,160,0.34)';
            ctx.fillText('空槽', r.x + r.w / 2, r.y + 46);
            continue;
        }

        drawEgg(ctx, r.x + r.w / 2, r.y + 20, 21, 26, e.ready, e.twin, state.t);

        /* 进度条 */
        var bw = r.w - 20;
        rr(ctx, r.x + 10, r.y + r.h - 12, bw, 5, 2.5);
        ctx.fillStyle = 'rgba(8,14,30,0.55)';
        ctx.fill();
        rr(ctx, r.x + 10, r.y + r.h - 12, Math.max(2, bw * e.progress), 5, 2.5);
        ctx.fillStyle = e.ready ? TT.gold : '#6f9fc4';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10.5px sans-serif';
        ctx.fillStyle = e.ready ? TT.goldLight : TT.text;
        ctx.fillText(e.ready ? '可孵化' : clock(e.left), r.x + r.w / 2, r.y + 45);
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

    /* 成长 / 疲劳 */
    ctx.font = '600 9.5px sans-serif';
    if (fatigue > 0) {
        ctx.fillStyle = '#e8a98e';
        ctx.fillText('疲劳 ' + clock(fatigue), r.x + 58, r.y + 66);
    } else {
        ctx.fillStyle = TT.textSoft;
        ctx.fillText('成长 ' + Math.round(f.growth) + '% · 卖 ' + wallet.format(fishLib.sellPriceOf(f, state.shellLv)),
            r.x + 58, r.y + 66);
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

    ctx.textAlign = 'left';
    ctx.font = '800 11.5px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('预计 ' + sp.name, r.x + 12, r.y + r.h / 2);

    ctx.font = '600 10.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText(slots + ' 槽 · 上限 L' + maxLv + ' · ' + chk.seconds + 's', r.x + 12 + 74, r.y + r.h / 2);

    /* 右端消耗 */
    var coinTxt = chk.cost.coin > 0 ? wallet.format(chk.cost.coin) : '免费';
    ctx.textAlign = 'right';
    ctx.font = '700 10.5px sans-serif';
    ctx.fillStyle = chk.cost.coin > 0 ? TT.goldLight : TT.textSoft;
    ctx.fillText(coinTxt + ' · 鱼饵×' + chk.cost.bait, r.x + r.w - 12, r.y + r.h / 2);
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

/* ---------------- 培育缸 ---------------- */

function drawNursery(ctx, state, session, c) {
    var slots = breed.nurserySlotsOf(state);
    var list = breed.nurseryList(state);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('培育缸 ' + list.length + '/' + slots, c.x + 14, c.y + L.BR_NURSERY_LABEL_Y);

    ctx.textAlign = 'right';
    ctx.font = '600 9.5px sans-serif';
    ctx.fillStyle = 'rgba(232,212,160,0.42)';
    ctx.fillText('子代落点 · 点开看词条', c.x + c.w - 14, c.y + L.BR_NURSERY_LABEL_Y);

    for (var i = 0; i < slots; i++) {
        var r = L.nurseryCellRect(i);
        var cell = list[i];

        if (!cell) {
            rr(ctx, r.x, r.y, r.w, r.h, 12);
            ctx.strokeStyle = 'rgba(200,164,92,0.16)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            continue;
        }

        Th.card(ctx, r.x, r.y, r.w, r.h, { r: 12, depth: 2 });

        art.drawThumb(ctx, cell.species.id, r.x + 4, r.y + 3, r.w - 8, 42, {
            t: state.t, phase: i * 1.1
        });

        /* 性别角标 */
        var bx = r.x + r.w - 13;
        var by = r.y + 12;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, 6.2832);
        ctx.fillStyle = sexColor(cell.fish.sex);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 8.5px sans-serif';
        ctx.fillStyle = '#fff6ea';
        ctx.fillText(sexMark(cell.fish.sex), bx, by + 0.5);

        ctx.textAlign = 'center';
        ctx.font = '700 9.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText(cell.growth + '% · Σ' + fishLib.traitSumOf(cell.fish), r.x + r.w / 2, r.y + r.h - 20);

        ctx.font = '800 11px sans-serif';
        ctx.fillStyle = TT.goldLight;
        ctx.fillText(wallet.format(cell.price), r.x + r.w / 2, r.y + r.h - 7);
    }
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

/* ---------------- 子代详情 ---------------- */

function drawDetail(ctx, state, session) {
    var id = session.nurseryDetail;
    if (!id) return;

    var list = state.nursery || [];
    var f = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) f = list[i];
    if (!f) { session.nurseryDetail = ''; return; }

    var c = L.detailCardRect((f.traits || []).length);
    var sp = fishLib.speciesById(f.speciesId);

    drawMask(ctx);
    drawCard(ctx, c);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(sp.name, c.x + 16, c.y + 26);

    ctx.font = '800 13px sans-serif';
    ctx.fillStyle = sexColor(f.sex);
    ctx.fillText(sexMark(f.sex), c.x + 16 + ctx.measureText(sp.name).width + 40, c.y + 26);

    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText(sp.rarity + ' · ' + fishLib.stageName(fishLib.stageOf(f.growth)) + ' · 成长 ' +
        Math.round(f.growth) + '%', c.x + 16, c.y + 46);

    /* 卖价放在第二行右端：第一行右上是关闭按钮，数字放那儿会被盖住 */
    ctx.textAlign = 'right';
    ctx.font = '800 12.5px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('卖 ' + wallet.format(fishLib.sellPriceOf(f, state.shellLv)), c.x + c.w - 18, c.y + 47);

    /* 词条列表 */
    var traits = f.traits || [];
    ctx.textAlign = 'left';
    ctx.font = '700 10px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('词条 ' + traits.length + '/' + fishLib.traitSlotsOf(sp), c.x + 16, c.y + 74);

    for (var k = 0; k < traits.length; k++) {
        var def = fishLib.traitDef(traits[k].id);
        if (!def) continue;
        var lv = fishLib.traitLvOf(traits[k]);
        var ry = c.y + 96 + k * 32;

        rr(ctx, c.x + 16, ry - 11, c.w - 32, 26, 10);
        ctx.fillStyle = (cfg.traits.lvBg || [])[lv] || 'rgba(200,164,92,0.14)';
        ctx.fill();

        /* 等级徽章 */
        rr(ctx, c.x + 22, ry - 8, 30, 20, 8);
        ctx.fillStyle = (cfg.traits.lvColor || [])[lv] || TT.gold;
        ctx.globalAlpha = 0.24;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10.5px sans-serif';
        ctx.fillStyle = (cfg.traits.lvColor || [])[lv] || TT.gold;
        ctx.fillText('L' + lv, c.x + 37, ry + 2);

        ctx.textAlign = 'left';
        ctx.font = '800 11.5px sans-serif';
        ctx.fillStyle = TT.text;
        ctx.fillText(def.name, c.x + 58, ry + 2);

        ctx.textAlign = 'right';
        ctx.font = '600 10.5px sans-serif';
        ctx.fillStyle = TT.textSoft;
        ctx.fillText(fishLib.traitText(traits[k]), c.x + c.w - 22, ry + 2);
    }

    /* 规则说明：放在词条和按钮之间，既不空也顺手教一遍规则 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = 'rgba(232,212,160,0.46)';
    ctx.fillText('子代鱼种跟随雌鱼 · 性别 50/50 · L5 只能靠繁育', c.x + 16, c.y + c.h - 78);

    /* 两个动作 */
    var b0 = L.pickBtnRect(0, c);
    var b1 = L.pickBtnRect(1, c);

    Th.jelly(ctx, b0.x, b0.y, b0.w, b0.h, {
        top: TT.greenTop, bottom: TT.greenBottom, deep: TT.greenDeep,
        r: 16, depth: 3, ink: '#2f6b45', lw: 2
    });
    Th.textOutlined(ctx, '放入鱼缸', b0.x + b0.w / 2, b0.y + b0.h / 2, 13, '#eafff2', '#2f6b45', 3);

    Th.jelly(ctx, b1.x, b1.y, b1.w, b1.h, {
        top: TT.yellowTop, bottom: TT.yellowBottom, deep: TT.yellowDeep,
        r: 16, depth: 3, ink: '#5f1e18', lw: 2
    });
    Th.textOutlined(ctx, '卖掉 +' + wallet.format(fishLib.sellPriceOf(f, state.shellLv)),
        b1.x + b1.w / 2, b1.y + b1.h / 2, 12.5, '#fff3d2', '#5f1e18', 3);

    /* 关闭：右上角小 ✕ */
    var xr = { x: c.x + c.w - 38, y: c.y + 10, w: 28, h: 28 };
    Th.badge(ctx, xr.x + xr.w / 2, xr.y + xr.h / 2, 14, {
        top: '#37436a', bottom: '#1f294a', ink: TT.ink, lw: 2
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 13px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText('✕', xr.x + xr.w / 2, xr.y + xr.h / 2);
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
    drawNursery(ctx, state, session, c);

    if (session.breedPick) drawPicker(ctx, state, session);
    if (session.nurseryDetail) drawDetail(ctx, state, session);
}

module.exports = {
    draw: draw,
    drawDetailRect: L.pickCardRect,
    /* 仓库「鱼卵」子页也要画同一颗蛋，别在那边再抄一份路径 */
    drawEgg: drawEgg,
    clock: clock
};
