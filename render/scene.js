/* ============================================================
 * render/scene.js · 水下场景绘制
 *
 * 只读 state，不修改任何游戏数据（气泡/食物/飘字的位置
 * 在逻辑层更新，这里只负责画）。
 * ============================================================ */

var C = require('./canvas.js');
var U = require('./util.js');
var fishRender = require('./fish.js');

var W = C.W;
var H = C.H;
var ground = C.ground;
var TOP = C.TANK_TOP;
var BOT = C.TANK_BOTTOM;

/* 水面贴着缸盖下沿，不再从屏幕顶端 0 开始 */
function drawSurface(ctx, t) {
    var h = 30;
    var g = ctx.createLinearGradient(0, TOP, 0, TOP + h * 1.9);
    U.stop(g, 0, 'rgba(255,255,255,0.34)');
    U.stop(g, 0.45, 'rgba(255,255,255,0.12)');
    U.stop(g, 1, 'rgba(200,248,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, TOP - 2);
    ctx.lineTo(W, TOP - 2);
    ctx.lineTo(W, TOP + h);
    for (var x = W; x >= 0; x -= 16) {
        ctx.lineTo(x, TOP + h + Math.sin(x * 0.021 + t * 1.7) * 4.5 + Math.sin(x * 0.047 - t * 1.15) * 2.4);
    }
    ctx.closePath();
    ctx.fill();

    /* 波峰那条亮线：没有它，水像是直接糊在缸盖上 */
    ctx.save();
    ctx.beginPath();
    for (var x2 = 0; x2 <= W; x2 += 12) {
        var y2 = TOP + h + Math.sin(x2 * 0.021 + t * 1.7) * 4.5 + Math.sin(x2 * 0.047 - t * 1.15) * 2.4;
        if (x2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    for (var i = 0; i < 9; i++) {
        var y = TOP + 5 + i * 3.4;
        var x0 = ((i * 137 + t * (14 + i * 3)) % (W + 120)) - 60;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + 26 + (i % 3) * 10, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawLightBeams(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
        var cx = W * (0.14 + i * 0.32) + Math.sin(t * 0.14 + i * 1.9) * 30;
        for (var k = -2; k <= 2; k++) {
            var width = 30;
            var fade = 1 - Math.abs(k) * 0.34;
            var x = cx + k * width * 0.9;
            var g = ctx.createLinearGradient(x, TOP, x + 110, BOT);
            U.stop(g, 0, 'rgba(255,255,255,' + 0.075 * fade + ')');
            U.stop(g, 0.5, 'rgba(255,255,255,' + 0.035 * fade + ')');
            U.stop(g, 1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x - width * 0.6, TOP);
            ctx.lineTo(x + width * 0.6, TOP);
            ctx.lineTo(x + 110 + width * 0.6, BOT + 20);
            ctx.lineTo(x + 110 - width * 0.6, BOT + 20);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawMotes(ctx, decor) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < decor.motes.length; i++) {
        var m = decor.motes[i];
        ctx.globalAlpha = m.a;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 6.2832);
        ctx.fill();
    }
    ctx.restore();
}

function drawPlants(ctx, decor, t, layer) {
    for (var i = 0; i < decor.plants.length; i++) {
        var p = decor.plants[i];
        if (p.layer !== layer) continue;

        var sway = Math.sin(t * p.spd + p.sway);
        var sway2 = Math.sin(t * p.spd * 0.8 + p.sway + 0.9);
        var tipX = p.x + sway * p.h * 0.34;
        var alpha = layer === 0 ? 0.28 : 0.72;

        ctx.save();
        ctx.globalAlpha = alpha;

        var g = ctx.createLinearGradient(0, ground, 0, ground - p.h);
        U.stop(g, 0, U.hsl(p.hue, 66, 34));
        U.stop(g, 1, U.hsl(p.hue, 84, 58));
        ctx.fillStyle = g || U.hsl(p.hue, 70, 42);

        ctx.beginPath();
        ctx.moveTo(p.x - p.w * 0.5, ground + 2);
        ctx.quadraticCurveTo(p.x - p.w * 0.35 + sway * p.h * 0.12, ground - p.h * 0.55, tipX, ground - p.h);
        ctx.quadraticCurveTo(p.x + p.w * 0.35 + sway * p.h * 0.12, ground - p.h * 0.55, p.x + p.w * 0.5, ground + 2);
        ctx.closePath();
        ctx.fill();
        /* 深绿细描边：卡通风格靠描边立住轮廓 */
        ctx.strokeStyle = 'rgba(26,88,48,0.55)';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x + 1, ground + 2);
        ctx.quadraticCurveTo(p.x + 6 + sway2 * p.h * 0.16, ground - p.h * 0.45, p.x + sway2 * p.h * 0.42 + 6, ground - p.h * 0.86);
        ctx.quadraticCurveTo(p.x + 12 + sway2 * p.h * 0.1, ground - p.h * 0.42, p.x + p.w * 0.4, ground + 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function drawGround(ctx, decor) {
    var g = ctx.createLinearGradient(0, ground - 20, 0, BOT);
    U.stop(g, 0, '#fff0c6');
    U.stop(g, 0.35, '#f3dca6');
    U.stop(g, 1, '#dbb97c');
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.moveTo(0, ground + 8);
    for (var x = 0; x <= W; x += 28) {
        ctx.lineTo(x, ground + Math.sin(x * 0.011) * 7 + Math.sin(x * 0.031 + 1.4) * 3);
    }
    ctx.lineTo(W, BOT + 2);
    ctx.lineTo(0, BOT + 2);
    ctx.closePath();
    ctx.fill();

    for (var i = 0; i < decor.pebbles.length; i++) {
        var p = decor.pebbles[i];
        ctx.save();
        ctx.globalAlpha = 0.85;
        var gg = ctx.createLinearGradient(p.x, ground + p.dy - p.r, p.x, ground + p.dy + p.r);
        U.stop(gg, 0, '#fff3d4');
        U.stop(gg, 1, '#c2a06a');
        ctx.fillStyle = gg;
        ctx.beginPath();
        U.ellipse(ctx, p.x, ground + p.dy + 3, p.r, p.r * 0.62, 0);
        ctx.fill();

        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        U.ellipse(ctx, p.x - p.r * 0.24, ground + p.dy - p.r * 0.1, p.r * 0.4, p.r * 0.22, -0.3);
        ctx.fill();
        ctx.restore();
    }
}

function drawCorals(ctx, decor, t) {
    for (var i = 0; i < decor.corals.length; i++) {
        var c = decor.corals[i];
        ctx.save();
        ctx.translate(c.x, ground + 4);
        ctx.scale(c.s, c.s);
        ctx.lineCap = 'round';

        for (var j = 0; j < c.br.length; j++) {
            var b = c.br[j];
            var sway = Math.sin(t * 0.9 + c.x * 0.01 + b.a * 3) * 0.055;
            var a = b.a + sway;
            var ex = Math.cos(a) * b.len;
            var ey = Math.sin(a) * b.len;

            ctx.strokeStyle = U.hsl(c.hue, 68, 56);
            ctx.lineWidth = b.w;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(ex * 0.35, ey * 0.62, ex, ey);
            ctx.stroke();

            ctx.fillStyle = U.hsl(c.hue, 78, 70);
            ctx.beginPath();
            ctx.arc(ex, ey, b.w * 0.62, 0, 6.2832);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawFoods(ctx, state) {
    for (var i = 0; i < state.foods.length; i++) {
        var fd = state.foods[i];
        if (fd.dead) continue;
        var a = fd.settled ? Math.max(0, 1 - fd.fade / 7) : 1;
        ctx.save();
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = '#c9873f';
        ctx.beginPath();
        ctx.arc(fd.x, fd.y, fd.r, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,225,175,0.75)';
        ctx.beginPath();
        ctx.arc(fd.x - fd.r * 0.3, fd.y - fd.r * 0.32, fd.r * 0.38, 0, 6.2832);
        ctx.fill();
        ctx.restore();
    }
}

function drawBubbles(ctx, state) {
    ctx.save();
    for (var i = 0; i < state.view.bubbles.length; i++) {
        var b = state.view.bubbles[i];
        var x = b.x + Math.sin(b.sway) * b.amp;
        var alpha = U.clamp((b.y - TOP) / ((BOT - TOP) * 0.35), 0, 1) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, 6.2832);
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(x - b.r * 0.32, b.y - b.r * 0.34, b.r * 0.3, 0, 6.2832);
        ctx.fill();
    }
    ctx.restore();
}

/* 三个缸各自一套背景色调，切缸时一眼能看出换了地方。
 * 差异克制在「同一个水族馆的不同缸」，不做成三个画风。 */
var TANK_THEME = [
    ['#d7f9ff', '#8fe4f4', '#41c1da', '#2589a6'],
    ['#d3fbf0', '#8ce4d2', '#3fb9ba', '#238a99'],
    ['#dcf3ff', '#94d8f4', '#4cb4e0', '#2680aa']
];

/* 场景总绘：按深度顺序铺一遍 */
function draw(ctx, state, decor) {
    var t = state.t;

    var theme = TANK_THEME[(state.activeTank || 0) % TANK_THEME.length] || TANK_THEME[0];

    /* 只在玻璃里面画水：外面是缸盖和底座 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(C.FRAME_X, TOP, W - C.FRAME_X * 2, BOT - TOP);
    ctx.clip();

    var g = ctx.createLinearGradient(0, TOP, 0, BOT);
    U.stop(g, 0, theme[0]);
    U.stop(g, 0.3, theme[1]);
    U.stop(g, 0.62, theme[2]);
    U.stop(g, 1, theme[3]);
    ctx.fillStyle = g;
    ctx.fillRect(C.FRAME_X, TOP, W - C.FRAME_X * 2, BOT - TOP);

    drawSurface(ctx, t);
    drawLightBeams(ctx, t);
    drawMotes(ctx, decor);
    drawPlants(ctx, decor, t, 0);
    drawGround(ctx, decor);
    drawCorals(ctx, decor, t);
    drawPlants(ctx, decor, t, 1);
    drawFoods(ctx, state);
    fishRender.drawAll(ctx, state);
    drawBubbles(ctx, state);

    ctx.restore();
}

module.exports = {
    draw: draw,
    drawFoods: drawFoods,
    drawBubbles: drawBubbles
};
