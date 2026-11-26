/* ============================================================
 * core/predation.js · 捕食者规则（当前只有小鲨鱼）
 *
 * 鱼饵和猎物是两条完全独立的路径：
 *   · 普通鱼：追饲料、吃饲料、饱食度与成长都从饲料来
 *   · 捕食者：不追也不吃饲料，只按冷却追同缸的其他鱼
 *
 * 被吃掉的鱼先打 eaten 标记，等这一帧所有鱼都更新完再统一移除。
 * 直接 splice 会在遍历 state.fish 时把后面那条鱼跳过去。
 * ============================================================ */

var cfg = require('../config/index.js');
var fishLib = require('./fish.js');

var P = cfg.economy.predator || {};

function isPredator(f) {
    if (!f) return false;
    return !!fishLib.speciesById(f.speciesId).predator;
}

/* 默认第一次捕猎等 3~6 秒，别刚买回来就当场清场 */
function initCooldown(f) {
    /* 只在第一次初始化；倒计时走成负数表示「可以捕猎了」，
     * 不能再重置成 3~6 秒，否则鲨鱼会一直错过猎物。 */
    if (f.huntT == null || !isFinite(f.huntT)) f.huntT = 3 + Math.random() * 3;
    return f.huntT;
}

function tickCooldown(f, dt) {
    initCooldown(f);
    f.huntT -= dt;
    return f.huntT <= 0;
}

/**
 * 找同缸里最近的一条猎物。鲨鱼不吃鲨鱼。
 * 非当前缸没有屏幕坐标也照样能选：退回按fish数组顺序取第一条。
 */
function findPrey(state, hunter) {
    var best = null;
    var bestD = Infinity;
    var hx = hunter.x;
    var hy = hunter.y;
    var hasPos = isFinite(hx) && isFinite(hy);

    for (var i = 0; i < state.fish.length; i++) {
        var o = state.fish[i];
        if (o === hunter || o.eaten) continue;
        if ((o.tank || 0) !== (hunter.tank || 0)) continue;
        if (isPredator(o)) continue;
        /* 带龙鳞的金鲤鱼是化龙的种子（传奇卵 10% + 55% 才凑齐），
         * 被 AI 一口吞掉太伤，直接列为不可捕食。普通金鲤鱼照吃。 */
        if (o.speciesId === 'gold_koi' && fishLib.hasTrait(o, 'dragon_scale')) continue;

        if (!hasPos || !isFinite(o.x) || !isFinite(o.y)) {
            if (!best) best = o;
            continue;
        }
        var dx = o.x - hx;
        var dy = o.y - hy;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
            bestD = d2;
            best = o;
        }
    }
    return best;
}

/**
 * 吃掉一条鱼。返回被吃那条的信息，调用方决定要不要飘字。
 */
function eat(state, hunter, prey) {
    if (!prey || prey.eaten) return null;
    prey.eaten = true;

    hunter.hunger = Math.min(100, hunter.hunger + (P.mealHunger == null ? 70 : P.mealHunger));
    hunter.growth = Math.min(100, hunter.growth + (P.mealGrowth == null ? 14 : P.mealGrowth));
    hunter.belly = 1;
    hunter.huntT = P.cooldown == null ? 12 : P.cooldown;
    if (hunter.growth >= 100) hunter.adultMark = true;

    state.stats.fishEaten = (state.stats.fishEaten || 0) + 1;
    if (state.view && state.view.selFish === prey.id) state.view.selFish = '';

    return {
        id: prey.id,
        name: fishLib.speciesById(prey.speciesId).name,
        x: prey.x,
        y: prey.y
    };
}

/* 统一移除这一帧被吃掉的鱼，返回条数 */
function removeEaten(state) {
    var before = state.fish.length;
    state.fish = state.fish.filter(function (f) { return !f.eaten; });
    return before - state.fish.length;
}

module.exports = {
    isPredator: isPredator,
    initCooldown: initCooldown,
    tickCooldown: tickCooldown,
    findPrey: findPrey,
    eat: eat,
    removeEaten: removeEaten
};
