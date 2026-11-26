/* ============================================================
 * render/sysmenu.js · 系统弹层（底栏「系统」按钮打开）
 *
 * 原来底栏那枚 menu 按钮直接开商店面板，名字却叫「系统」，
 * 玩家找不到存档 / 清档这些真正的系统操作。
 * 现在商店有自己的按钮，这枚就只做系统的事：
 *   版本号、存档说明、收集进度、清档重开。
 *
 * 清档是危险操作，所以做二次确认：第一次点击只是「上膛」，
 * 按钮变红并在 3 秒内再点一次才会执行。
 * ============================================================ */

var C = require('./canvas.js');
var L = require('../ui/layout.js');
var cfg = require('../config/index.js');
var storage = require('../core/storage.js');
var codexLib = require('../core/codex.js');
var Th = require('./theme.js');
var TT = Th.T;

var W = C.W;
var H = C.H;

function line(ctx, x0, y0, x1, y1, color) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
}

function row(ctx, c, y, label, value, color) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText(label, c.x + 26, y);

    ctx.textAlign = 'right';
    ctx.font = '800 12.5px sans-serif';
    ctx.fillStyle = color || TT.text;
    ctx.fillText(value, c.x + c.w - 26, y);
}

function draw(ctx, state, session) {
    if (!session.sysOpen) return;

    ctx.save();

    /* 遮罩：点外面也能关，所以整屏都要拦光 */
    ctx.fillStyle = 'rgba(6,10,24,0.72)';
    ctx.fillRect(0, 0, W, H);

    var c = L.sysCardRect();

    /* 牌匾：深墨 + 描金，跟离线弹窗同一套 */
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,20,0.7)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    Th.jelly(ctx, c.x, c.y, c.w, c.h, {
        top: TT.cardTop, bottom: TT.cardBottom, deep: TT.cardDeep,
        r: 24, depth: 6, ink: TT.ink, lw: 3, gloss: false
    });
    ctx.restore();

    /* 标题 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 19px sans-serif';
    ctx.fillStyle = TT.text;
    ctx.fillText('系统', c.x + c.w / 2, c.y + 38);

    ctx.font = '600 11.5px sans-serif';
    ctx.fillStyle = TT.textSoft;
    ctx.fillText('和风鱼缸 · 自动存档', c.x + c.w / 2, c.y + 62);

    line(ctx, c.x + 26, c.y + 84, c.x + c.w - 26, c.y + 84, 'rgba(200,164,92,0.22)');

    /* 三行状态 */
    var seen = codexLib.foundCount(state);
    var fishN = (state.fish || []).length;
    row(ctx, c, c.y + 106, '版本', 'v' + (cfg.version || '0.12.0'), TT.goldLight);
    row(ctx, c, c.y + 134, '缸内鱼数', fishN + ' / ' + storage.slotsOf(state));
    row(ctx, c, c.y + 162, '图鉴收集', seen + ' / ' + cfg.species.length, TT.goldLight);

    /* 危险操作说明 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = session.sysArmed > 0 ? '#f0a08e' : 'rgba(232,212,160,0.55)';
    ctx.fillText(session.sysArmed > 0 ? '再点一次「确认清档」将立即清空' : '清档会清空金币、鱼与图鉴，无法恢复',
        c.x + c.w / 2, c.y + 198);

    /* 按钮：左危险，右关闭 */
    var b0 = L.sysBtnRect(0);
    var b1 = L.sysBtnRect(1);
    var armed = session.sysArmed > 0;

    Th.jelly(ctx, b0.x, b0.y, b0.w, b0.h, {
        top: armed ? '#c0503f' : '#8e3b33',
        bottom: armed ? '#8e2f28' : '#5f1e18',
        deep: '#43110d',
        r: 20, depth: 4, ink: '#3a0d09', lw: 2.4
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 13.5px sans-serif';
    ctx.fillStyle = '#ffe9dc';
    ctx.fillText(armed ? '确认清档' : '清档重开', b0.x + b0.w / 2, b0.y + b0.h / 2);

    Th.jelly(ctx, b1.x, b1.y, b1.w, b1.h, {
        top: '#37436a', bottom: '#1f294a', deep: TT.cardDeep,
        r: 20, depth: 4, ink: TT.ink, lw: 2.4
    });
    Th.textOutlined(ctx, '关闭', b1.x + b1.w / 2, b1.y + b1.h / 2, 14, TT.goldLight, '#232c48', 3);

    ctx.restore();
}

module.exports = {
    draw: draw
};
