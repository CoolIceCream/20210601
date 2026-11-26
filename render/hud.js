/* ============================================================
 * render/hud.js · 常驻界面（顶部信息、按钮、飘字、提示）
 *
 * M6 换风格：参考的是那种明亮的手游界面 ——
 *   · 顶部左边一张「玩家卡」（头像 + 缸名 + 鱼位进度条），
 *     右边上下两条白色资源胶囊（鱼币 / 鱼数）
 *   · 底部三个方形按钮，卡面浅米色，靠上面那枚彩色圆形
 *     徽章里的图标区分功能，文字在徽章下面
 * 形状与配色全部走 render/theme.js，这里只管布局。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var L = require('../ui/layout.js');
var wallet = require('../core/wallet.js');
var storage = require('../core/storage.js');
var Th = require('./theme.js');
var itemArt = require('./itemart.js');
var fishArt = require('./fishart.js');
var view = require('../ui/view.js');

var W = C.W;
var H = C.H;
var roundRect = U.roundRect;
var TT = Th.T;

/* ---------------- 小图标 ---------------- */

/* 币：金色圆片，带一圈深棕描边 */
function drawCoin(ctx, cx, cy, r) {
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r);
    U.stop(g, 0, '#fff3a8');
    U.stop(g, 0.55, '#f7c22c');
    U.stop(g, 1, '#d18f0c');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#a9740a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(cx - 1.1, cy - r * 0.45, 2.2, r * 0.9);
    ctx.fillRect(cx - r * 0.45, cy - 1.1, r * 0.9, 2.2);
}

function drawCoinBlue(ctx, cx, cy, r) {
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r);
    U.stop(g, 0, '#cfe4f2');
    U.stop(g, 0.55, '#6f9fc4');
    U.stop(g, 1, '#2c5677');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#24486a';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#e8f2fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 9px sans-serif';
    ctx.fillText('S', cx, cy + 0.5);
}

/* 小鱼图标：鱼数用它当标签。
 * 只有 8px 高的时候会糊成一个点，所以尾巴做缺口、眼睛留白点。 */
function drawFishIcon(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(-s * 0.7, 0);
    ctx.lineTo(-s * 2.0, -s * 0.85);
    ctx.lineTo(-s * 1.55, 0);
    ctx.lineTo(-s * 2.0, s * 0.85);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    U.ellipse(ctx, 0, 0, s, s * 0.74, 0);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(s * 0.42, -s * 0.16, s * 0.26, 0, 6.2832);
    ctx.fill();
    ctx.restore();
}

/* ---------------- 顶部：玩家卡 ---------------- */

function drawPlayerCard(ctx, state) {
    var c = L.CARD;

    Th.jelly(ctx, c.x, c.y, c.w, c.h, {
        top: TT.cardTop,
        bottom: TT.cardBottom,
        deep: TT.cardDeep,
        r: 18,
        depth: 3,
        ink: TT.ink,
        lw: 2.2,
        gloss: false
    });

    /* 头像：白圈 + 一条 Q 版小鱼，用圆形裁掉多余的部分 */
    var a = L.AVATAR;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, a.r + 3, 0, 6.2832);
    ctx.fillStyle = '#2a3352';
    ctx.fill();
    ctx.strokeStyle = TT.ink;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, a.r, 0, 6.2832);
    ctx.clip();
    /* 鱼尾巴比身体长，缩略图那个居中偏移在圆里会显得贴左边，
     * 这里自己再往右挪 2px 补回来 */
    var fs = a.r * 1.46;
    fishArt.drawThumb(ctx, 'gold_fish', a.cx - fs / 2 + 2, a.cy - fs / 2, fs, fs);
    ctx.restore();

    /* 缸号徽章：挂在头像右下角，形状照手游里那颗等级章 */
    var tk = storage.activeTankOf(state) + 1;
    ctx.beginPath();
    ctx.arc(a.cx + a.r - 3, a.cy + a.r - 3, 9, 0, 6.2832);
    ctx.fillStyle = TT.vermilion;
    ctx.fill();
    ctx.strokeStyle = TT.goldLight;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = '#fff3d2';
    ctx.fillText(String(tk), a.cx + a.r - 3, a.cy + a.r - 2.5);

    /* 名字 + 鱼位数字 */
    var act = storage.activeTankOf(state);
    var here = storage.fishCountInTank(state, act);
    var perTank = storage.slotsPerTank(state);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 12.5px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText('水族箱', c.x + 66, c.y + 18);

    ctx.textAlign = 'right';
    ctx.font = '800 10.5px sans-serif';
    ctx.fillStyle = perTank > 0 && here >= perTank ? '#e06a55' : TT.textSoft;
    ctx.fillText(perTank > 0 ? here + '/' + perTank : String(here), c.x + c.w - 10, c.y + 18);

    /* 鱼位进度：槽 + 填充 */
    var b = L.BAR;
    var p = perTank > 0 ? Math.min(1, here / perTank) : 0;

    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = 'rgba(6,10,24,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,92,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (p > 0) {
        var fw = Math.max(b.h, b.w * p);
        var g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        U.stop(g, 0, p >= 1 ? '#e07a55' : '#e0c170');
        U.stop(g, 1, p >= 1 ? '#a6332e' : '#9a7a35');
        roundRect(ctx, b.x, b.y, fw, b.h, b.h / 2);
        ctx.fillStyle = g;
        ctx.fill();

        /* 前半截一点淡金，做出牌匾的高光 */
        roundRect(ctx, b.x + 2, b.y + 2, Math.max(0, fw - 4), b.h * 0.34, b.h * 0.17);
        ctx.fillStyle = 'rgba(232,212,160,0.30)';
        ctx.fill();
    }
}

/* ---------------- 顶部：资源胶囊 ---------------- */

function pillBase(ctx, r) {
    Th.jelly(ctx, r.x, r.y, r.w, r.h, {
        top: TT.cardTop,
        bottom: TT.cardBottom,
        deep: TT.cardDeep,
        r: r.h / 2,
        depth: 2.5,
        ink: TT.ink,
        lw: 2.1,
        gloss: true
    });
}

/* 胶囊的左右内边距：图标贴左、数值贴右，两端各留 10px，
 * 不靠「左对齐 + 目测留白」—— 数值位数一变就会歪。 */
var PILL_PAD = 10;

function drawCoinPill(ctx, state) {
    var r = L.COIN_PILL;
    var cy = r.y + r.h / 2;
    pillBase(ctx, r);

    /* 金币半径 8，圆心离左内边距 8 → 左边缘正好落在 pad 上，
     * 27 高的胶囊里上下也各有 5.5 的空间，不会顶到描边。 */
    drawCoin(ctx, r.x + PILL_PAD + 8, cy, 8);

    var val = wallet.display(state, 'fish');
    var s = wallet.display(state, 's');

    ctx.textBaseline = 'middle';
    var right = r.x + r.w - PILL_PAD;

    /* S 币极少出现，有余额时才在最右端占一小块，主数值往左让位 */
    if (s > 0) {
        var st = wallet.format(s);
        ctx.textAlign = 'right';
        ctx.font = '800 11px sans-serif';
        ctx.fillStyle = TT.sky;
        ctx.fillText(st, right, cy + 0.5);
        var sw = ctx.measureText(st).width;
        drawCoinBlue(ctx, right - sw - 7, cy, 6.5);
        right = right - sw - 16;
    }

    ctx.textAlign = 'right';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(wallet.format(val), right, cy + 0.5);
}

function drawFishPill(ctx, state) {
    var r = L.FISH_PILL;
    var cy = r.y + r.h / 2;
    pillBase(ctx, r);

    /* 当前缸的鱼位进度已经在左边的玩家卡里了，
     * 这条胶囊读的是「所有缸加起来一共有几条鱼」。 */
    var total = (state.fish && state.fish.length) || 0;

    /* 鱼形尾巴向左伸到 -2.0s，所以 s 必须收小、圆心必须右移：
     * s=6.5 / 圆心在 pad+9 时，左边缘 = pad + 9 - 13 = pad - 4，
     * 仍可能碰到圆角描边，于是再往里推 4px。 */
    drawFishIcon(ctx, r.x + PILL_PAD + 13, cy, 6.5, '#6fbf9e');

    var right = r.x + r.w - PILL_PAD;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('条', right, cy + 1);
    var uw = ctx.measureText('条').width;

    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(String(total), right - uw - 2, cy + 0.5);
}

function drawTopBar(ctx, state) {
    drawPlayerCard(ctx, state);
    drawCoinPill(ctx, state);
    drawFishPill(ctx, state);
}

/* ---------------- 鱼缸切换（圆点） ---------------- */

function drawTankTabs(ctx, state) {
    /* 只有一个缸时不显示：新手期少一个视觉噪点 */
    var n = storage.tankCountOf(state);
    if (n <= 1) return;
    var total = storage.maxTanks();
    var act = storage.activeTankOf(state);

    ctx.save();
    for (var i = 0; i < total; i++) {
        var r = L.tankTabRect(i, total);
        var cx = r.x + r.w / 2;
        var cy = r.y + r.h / 2;
        var owned = i < n;
        var on = i === act;

        Th.badge(ctx, cx, cy, 9.5, {
            top: on ? '#e0c170' : (owned ? TT.cardTop : '#232c46'),
            bottom: on ? '#a8802f' : (owned ? TT.cardBottom : '#1a2238'),
            ink: owned ? TT.ink : 'rgba(200,164,92,0.3)',
            lw: 2,
            gloss: on
        });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10px sans-serif';
        ctx.fillStyle = on ? '#fff3d2' : (owned ? TT.text : 'rgba(200,164,92,0.4)');
        ctx.fillText(String(i + 1), cx, cy + 0.5);
    }
    ctx.restore();
}

/* ---------------- 底部悬浮按钮 ----------------
 * M13 换了一版造型（照玩家给的参考图）：
 *   上面一枚厚木圈的圆形徽章，奶油底 + 手画图标；
 *   下面压一张胶囊标签，木棕色底 + 浅木色描边 + 奶油字。
 * 原来那条底栏木板删掉了，五枚按钮直接浮在水底，
 * 鱼缸一路延伸到底部，按钮像「站在沙地上」的路牌。
 */

var DOCK_DEFS = [
    { key: 'STORE_BTN', icon: 'shop', label: '商店' },
    { key: 'BAG_BTN', icon: 'warehouse', label: '仓库' },
    { key: 'POND_BTN', icon: 'tank', label: '鱼塘' },
    { key: 'CODEX_BTN', icon: 'book', label: '图鉴' },
    { key: 'SYS_BTN', icon: 'menu', label: '系统' }
];

/* 木色系（和描金主线同族，但更暖，压得住水底那层深蓝） */
var DOCK_INK = '#43280f';       /* 木框描边 */
var DOCK_RING_TOP = '#f4dfb9';
var DOCK_RING_BOT = '#c9a067';
var DOCK_FACE_TOP = '#fffbea';
var DOCK_FACE_BOT = '#ecd0a2';
var DOCK_PILL_TOP = '#c47e42';
var DOCK_PILL_BOT = '#8c5124';
var DOCK_PILL_EDGE = '#f7e2bd';
var DOCK_ICON = '#8d5a2b';      /* 奶油底上的图标色：木棕 */

var DOCK_TXT = '#fff8ea';

function drawDockButton(ctx, i, r, o) {
    var rad = L.BTN_R;
    var cx = r.x + r.w / 2;
    var cy = r.y + rad + 1;

    /* 投影：按钮是浮在水上的，底下压一团软阴影才不飘 */
    ctx.beginPath();
    ctx.arc(cx, cy + 4, rad + 3, 0, 6.2832);
    ctx.fillStyle = 'rgba(4,8,20,0.42)';
    ctx.fill();

    /* 外圈：厚木环 */
    var rg = ctx.createLinearGradient(cx, cy - rad - 3, cx, cy + rad + 3);
    U.stop(rg, 0, DOCK_RING_TOP);
    U.stop(rg, 1, DOCK_RING_BOT);
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 2.5, 0, 6.2832);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = DOCK_INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    /* 里圈：奶油底，图标画在上面 */
    var fg = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.45, 2, cx, cy, rad);
    U.stop(fg, 0, DOCK_FACE_TOP);
    U.stop(fg, 1, DOCK_FACE_BOT);
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 3.4, 0, 6.2832);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,82,38,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    /* 图标：往上抬 3px，给下面的胶囊让位。
     * 奶油底上不能用白图标（会糊掉），切成木棕色，和参考图一致。 */
    itemArt.draw(ctx, o.icon, cx, cy - 3, rad * 1.12, null, DOCK_ICON);

    /* 胶囊标签：压在圆底上，像挂在徽章下面的木牌 */
    var p = L.dockPillRect(i);

    U.roundRect(ctx, p.x, p.y + 2.5, p.w, p.h, p.h / 2);
    ctx.fillStyle = 'rgba(48,24,6,0.42)';
    ctx.fill();

    var pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    U.stop(pg, 0, DOCK_PILL_TOP);
    U.stop(pg, 1, DOCK_PILL_BOT);
    U.roundRect(ctx, p.x, p.y, p.w, p.h, p.h / 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = DOCK_PILL_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();

    /* 牌子上沿一点高光，木牌才有厚度 */
    U.roundRect(ctx, p.x + 4, p.y + 2.5, p.w - 8, p.h * 0.32, p.h * 0.16);
    ctx.fillStyle = 'rgba(255,240,210,0.22)';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + (p.w < 50 ? 11 : 12) + 'px sans-serif';
    ctx.fillStyle = DOCK_TXT;
    ctx.fillText(o.label, p.x + p.w / 2, p.y + p.h / 2 + 0.5);
}

function drawButtons(ctx) {
    for (var i = 0; i < DOCK_DEFS.length; i++) {
        var d = DOCK_DEFS[i];
        drawDockButton(ctx, i, L[d.key], d);
    }
}

/* ---------------- 其它 ---------------- */

function drawFloaters(ctx, state) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 16px sans-serif';
    ctx.lineJoin = 'round';
    var list = state.view.floaters;
    for (var i = 0; i < list.length; i++) {
        var fl = list[i];
        var p = fl.t / fl.life;
        var y = fl.y - 42 * p;
        ctx.globalAlpha = Math.max(0, 1 - p * p);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(6,10,24,0.8)';
        ctx.strokeText(fl.text, fl.x, y);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, fl.x, y);
    }
    ctx.restore();
}

function drawHint(ctx, state) {
    if (state.hint <= 0) return;

    var txt = '点鱼查看 · 捞出到仓库';
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.hint);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 13px sans-serif';

    /* 直接压白字在水里，鱼游过来就糊成一团；
     * 做成一张浮在水里的半透明小卡片，和底部按钮是同一套语言 */
    var tw = ctx.measureText(txt).width;
    var bw = tw + 34;
    var by = C.TANK_TOP + 26;

    Th.jelly(ctx, (W - bw) / 2, by, bw, 34, {
        top: 'rgba(38,49,80,0.92)',
        bottom: 'rgba(26,35,64,0.92)',
        deep: 'rgba(6,10,24,0.5)',
        r: 17,
        depth: 2.5,
        ink: 'rgba(200,164,92,0.6)',
        lw: 1.8,
        gloss: false
    });

    ctx.fillStyle = TT.text;
    ctx.fillText(txt, W / 2, by + 17.5);
    ctx.restore();
}

/* Q 版不要暗角，保留函数让调用方不用改 */
function drawVignette() {
    /* 有意留空：卡通风格压暗会显脏 */
}

function drawToast(ctx, session) {
    if (!session.toast) return;
    ctx.save();
    var a = Math.min(1, session.toast.t * 3);
    ctx.globalAlpha = a;
    ctx.font = '700 14px sans-serif';
    var tw = ctx.measureText(session.toast.text).width + 36;

    Th.jelly(ctx, (W - tw) / 2, H * 0.36, tw, 42, {
        top: '#263150',
        bottom: '#1a2340',
        deep: TT.cardDeep,
        r: 21,
        depth: 3,
        ink: TT.ink,
        lw: 2.4
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TT.text;
    ctx.font = '700 14px sans-serif';
    ctx.fillText(session.toast.text, W / 2, H * 0.36 + 21.5);
    ctx.restore();
}

/* ---------------- 鱼缸缩放（M10：只留倍率角标） ----------------
 * +/− 按钮已删除，玻璃整块还给鱼。放大后只在右上角留一个
 * 小角标显示当前倍率，顺便提醒「双击还原」，不拦截任何点击。 */
function drawZoom(ctx) {
    var z = view.state.zoom;
    if (!(z > 1.001)) return;

    var r = L.ZOOM_BADGE;
    Th.jelly(ctx, r.x, r.y, r.w, r.h, {
        top: 'rgba(38,49,80,0.86)',
        bottom: 'rgba(26,35,64,0.86)',
        deep: 'rgba(6,10,24,0.45)',
        r: 10,
        depth: 2,
        ink: 'rgba(200,164,92,0.5)',
        lw: 1.6,
        gloss: false
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = TT.goldLight;
    ctx.fillText(view.label(), r.x + r.w / 2, r.y + r.h / 2 + 0.5);
}

module.exports = {
    drawTopBar: drawTopBar,
    drawTankTabs: drawTankTabs,
    drawButtons: drawButtons,
    drawZoom: drawZoom,
    drawFloaters: drawFloaters,
    drawHint: drawHint,
    drawVignette: drawVignette,
    drawToast: drawToast
};
