/* ============================================================
 * render/fish.js · 缸里游动的鱼
 *
 * 只负责「把一条鱼的数据翻译成绘制参数」，
 * 具体长什么样在 render/fishart.js（Q 版矢量，和商店卡片共用）。
 *
 * 去掉贴图后不再有 assets.atlas.ready 的分支，
 * 首次进游戏也不用等图集加载，启动更快、包体更小。
 * ============================================================ */

var fishLib = require('../core/fish.js');
var art = require('./fishart.js');
var U = require('../render/util.js');

function drawOne(ctx, f, t) {
    var L = fishLib.sizeOf(f);
    var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);

    ctx.save();
    ctx.translate(f.x, f.y);
    art.draw(ctx, {
        speciesId: f.speciesId,
        L: L,
        t: t,
        phase: f.phase || 0,
        dir: f.vx >= 0 ? 1 : -1,
        tilt: U.clamp(f.vy / 130, -0.42, 0.42),
        /* 游得越快摆尾越开，停住时轻轻晃 */
        wag: 0.45 + Math.min(speed / 140, 0.85),
        belly: f.belly || 0,
        growth: f.growth,
        hunger: f.hunger,
        /* 进化阶：金鲤鱼 → 金纹鲤 → 蛟 → 真龙，外形在 fishart 里按它加分 */
        evo: fishLib.evoOf(f),
        /* 词条等级够了才发光：现在每条鱼都有词条，
         * 还用「有词条就发光」等于全场都亮，等于没有提示。 */
        glow: fishLib.traitSumOf(f) >= 4
    });
    ctx.restore();
}

/* 小鱼画在前面，大鱼压后，形成层次 */
function drawAll(ctx, state) {
    /* 一次只渲染一个缸：其他缸的鱼仍在产出，但不在画面上 */
    var act = state.activeTank || 0;
    var list = [];
    for (var k = 0; k < state.fish.length; k++) {
        if ((state.fish[k].tank || 0) === act) list.push(state.fish[k]);
    }
    list.sort(function (a, b) {
        return fishLib.sizeOf(a) - fishLib.sizeOf(b);
    });
    for (var i = 0; i < list.length; i++) drawOne(ctx, list[i], state.t);
}

module.exports = {
    drawAll: drawAll,
    drawOne: drawOne,
    paletteOf: function (f) {
        return art.paletteOf(f.speciesId);
    },
    PALETTE: art.PALETTE
};
