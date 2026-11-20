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
    U.stop(g, 0, '#d9f6ff');
    U.stop(g, 0.55, '#4dc1ea');
    U.stop(g, 1, '#1b7ba3');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#12658a';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#eafaff';
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
        top: '#ffffff',
        bottom: '#f8ead1',
        deep: 'rgba(140,98,52,0.24)',
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
    ctx.fillStyle = '#fff6e2';
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
    ctx.fillStyle = '#ff9f3d';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 11px sans-serif';
    ctx.fillStyle = '#ffffff';
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
    ctx.fillStyle = perTank > 0 && here >= perTank ? '#c8441c' : TT.textSoft;
    ctx.fillText(perTank > 0 ? here + '/' + perTank : String(here), c.x + c.w - 10, c.y + 18);

    /* 鱼位进度：槽 + 填充 */
    var b = L.BAR;
    var p = perTank > 0 ? Math.min(1, here / perTank) : 0;

    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = 'rgba(140,98,52,0.32)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,98,52,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (p > 0) {
        var fw = Math.max(b.h, b.w * p);
        var g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        U.stop(g, 0, p >= 1 ? '#ffb35c' : '#a8ea74');
        U.stop(g, 1, p >= 1 ? '#ef7a24' : '#4cae30');
        roundRect(ctx, b.x, b.y, fw, b.h, b.h / 2);
        ctx.fillStyle = g;
        ctx.fill();

        /* 前半截一点白，才有「软糖」的厚度 */
        roundRect(ctx, b.x + 2, b.y + 2, Math.max(0, fw - 4), b.h * 0.34, b.h * 0.17);
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.fill();
    }
}

/* ---------------- 顶部：资源胶囊 ---------------- */

function pillBase(ctx, r) {
    Th.jelly(ctx, r.x, r.y, r.w, r.h, {
        top: '#ffffff',
        bottom: '#fff1d6',
        deep: 'rgba(150,105,50,0.24)',
        r: r.h / 2,
        depth: 2.5,
        ink: TT.ink,
        lw: 2.1,
        gloss: true
    });
}

function drawCoinPill(ctx, state) {
    var r = L.COIN_PILL;
    var cy = r.y + r.h / 2;
    pillBase(ctx, r);

    drawCoin(ctx, r.x + 15, cy, 9);

    var val = wallet.display(state, 'fish');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(wallet.format(val), r.x + 29, cy + 0.5);

    /* S 币极少出现，有余额才在右端冒一个小蓝章 */
    var s = wallet.display(state, 's');
    if (s > 0) {
        var st = wallet.format(s);
        ctx.textAlign = 'right';
        ctx.font = '800 11px sans-serif';
        ctx.fillStyle = '#12658a';
        ctx.fillText(st, r.x + r.w - 9, cy + 0.5);
        var sw = ctx.measureText(st).width;
        drawCoinBlue(ctx, r.x + r.w - 9 - sw - 8, cy, 7);
    }
}

function drawFishPill(ctx, state) {
    var r = L.FISH_PILL;
    var cy = r.y + r.h / 2;
    pillBase(ctx, r);

    /* 当前缸的鱼位进度已经在左边的玩家卡里了，
     * 这条胶囊读的是「所有缸加起来一共有几条鱼」。 */
    var total = (state.fish && state.fish.length) || 0;

    drawFishIcon(ctx, r.x + 16, cy, 8.5, '#38b06a');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(String(total), r.x + 29, cy + 0.5);

    ctx.font = '700 11px sans-serif';
    ctx.fillStyle = TT.textSoft;
    var nw = ctx.measureText(String(total)).width;
    ctx.fillText('条', r.x + 31 + nw, cy + 0.5);
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
            top: on ? '#c4f59a' : (owned ? '#ffffff' : '#e6dac4'),
            bottom: on ? '#5cc23f' : (owned ? '#f2e5c9' : '#cfc1a9'),
            ink: owned ? TT.ink : 'rgba(107,68,35,0.4)',
            lw: 2,
            gloss: on
        });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 10px sans-serif';
        ctx.fillStyle = on ? '#ffffff' : (owned ? TT.text : 'rgba(107,68,35,0.45)');
        ctx.fillText(String(i + 1), cx, cy + 0.5);
    }
    ctx.restore();
}

/* ---------------- 底部按钮 ----------------
 * 一拍三格：撒食 / 卖掉（sell.js）/ 商店。
 * 卡面统一浅米色，功能靠上面那枚彩色徽章区分 ——
 * 这是参考图的做法，比整块染成彩色更像一套按钮，也不会互相抢眼。
 */

function drawIconButton(ctx, r, o) {
    Th.jelly(ctx, r.x, r.y, r.w, r.h, {
        top: '#ffffff',
        bottom: '#fbeccf',
        deep: 'rgba(140,98,52,0.3)',
        r: 22,
        depth: 5,
        ink: TT.ink,
        lw: 2.6,
        gloss: false
    });

    var cx = r.x + r.w / 2;
    var cy = r.y + 27;

    Th.badge(ctx, cx, cy, 19, {
        top: o.top,
        bottom: o.bottom,
        ink: o.ink,
        lw: 2.4
    });

    itemArt.draw(ctx, o.icon, cx, cy, 28);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 13px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText(o.label, cx, r.y + 61);
}

function drawButtons(ctx) {
    drawIconButton(ctx, L.FEED_BTN, {
        icon: 'feed',
        label: '撒食',
        top: '#b6ec7d',
        bottom: '#57b93c',
        ink: '#2f7a25'
    });

    drawIconButton(ctx, L.SHOP_BTN, {
        icon: 'shop',
        label: '商店',
        top: '#9adaf8',
        bottom: '#3f9fd4',
        ink: '#1c6a94'
    });
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
        ctx.strokeStyle = 'rgba(90,58,26,0.7)';
        ctx.strokeText(fl.text, fl.x, y);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, fl.x, y);
    }
    ctx.restore();
}

function drawHint(ctx, state) {
    if (state.hint <= 0) return;

    var txt = '点鱼选中，再点「卖掉」换钱';
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
        top: 'rgba(255,255,255,0.92)',
        bottom: 'rgba(255,241,214,0.92)',
        deep: 'rgba(20,90,110,0.26)',
        r: 17,
        depth: 2.5,
        ink: 'rgba(107,68,35,0.55)',
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
        top: '#fffdf4',
        bottom: '#ffe7b8',
        deep: 'rgba(140,96,46,0.34)',
        r: 21,
        depth: 3,
        lw: 2.4
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TT.text;
    ctx.font = '700 14px sans-serif';
    ctx.fillText(session.toast.text, W / 2, H * 0.36 + 21.5);
    ctx.restore();
}

/* ---------------- 鱼缸缩放（M8） ---------------- */

function drawZoom(ctx) {
    var z = view.state.zoom;

    function one(r, txt, on) {
        var cx = r.x + r.w / 2;
        var cy = r.y + r.h / 2;
        Th.badge(ctx, cx, cy, r.w / 2, {
            top: on ? '#ffffff' : '#e8ddc7',
            bottom: on ? '#d7f3e2' : '#cbb99b',
            ink: on ? '#2b7a5a' : '#9b8a70',
            lw: 2,
            gloss: on
        });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 18px sans-serif';
        ctx.fillStyle = on ? '#216e50' : '#9b8a70';
        ctx.fillText(txt, cx, cy + 0.5);
    }

    one(L.ZOOM_OUT, '−', z > 1);
    one(L.ZOOM_IN, '+', z < 2);

    /* 档位读数放在两枚按钮下方，不写字幕挡鱼 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 10px sans-serif';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    var lx = (L.ZOOM_OUT.x + L.ZOOM_IN.x + L.ZOOM_IN.w) / 2;
    var ly = L.ZOOM_OUT.y + L.ZOOM_OUT.h + 9;
    ctx.strokeText(view.label(), lx, ly);
    ctx.fillStyle = '#2b6b76';
    ctx.fillText(view.label(), lx, ly);
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
