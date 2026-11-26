/* ============================================================
 * core/dragon.js · 金鲤鱼吞噬进化（M14）
 *
 * 规则（玩家侧一句话能说清）：
 *   带「龙鳞」词条的金鲤鱼，可以吃掉另一条金鲤鱼，升一阶。
 *   金鲤鱼 → 金纹鲤 → 蛟 → 真龙，吃完第三条就是龙。
 *
 * 为什么允许吃仓库里的鱼：
 *   金鲤鱼只从传奇鱼卵 10% 出，攒 4 条本来就很贵。
 *   如果只能吃缸里的，玩家还得先把鱼一条条放进本来就紧张的鱼位，
 *   等于给一条已经很长的链再加一道手续。
 *   所以吞噬优先吃仓库（不占鱼位、也不心疼），仓库没有才吃缸里的。
 *
 * 吃掉谁：同种、还没进化过（evo 0）的金鲤鱼，优先「成长最低」的那条。
 * 不做二次确认弹窗 —— 吞噬本身就是玩家主动点的按钮，
 * 而且只吃 evo 0 的同族，不会误吃已经养大的进化体。
 *
 * 这里只改数据，不碰 canvas / wx。
 * ============================================================ */

var fishLib = require('./fish.js');

var KOI = 'gold_koi';
var KEY_TRAIT = 'dragon_scale';

function inTank(state, fishId) {
    var act = state.activeTank || 0;
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if (f.id === fishId && (f.tank || 0) === act) return f;
    }
    return null;
}

function specOf(f) {
    return fishLib.speciesById(f.speciesId);
}

/** 这条鱼是不是「能进化的金鲤鱼」（带龙鳞 + 还没到顶阶） */
function isDragonLine(f) {
    if (!f || f.speciesId !== KOI) return false;
    return fishLib.hasTrait(f, KEY_TRAIT);
}

/** 还能不能继续吞（带龙鳞且没到顶） */
function canGrow(f) {
    if (!isDragonLine(f)) return false;
    return fishLib.evoOf(f) < fishLib.maxEvoOf(specOf(f));
}

/**
 * 可吞噬的猎物：缸内 + 仓库里所有 evo 0 的金鲤鱼（排除自己）。
 * 排序：仓库优先（不占鱼位）→ 成长从低到高（先吃最弱的）。
 */
function preyListOf(state, fishId) {
    var out = [];
    var i;
    var act = state.activeTank || 0;

    var caught = state.caught || [];
    for (i = 0; i < caught.length; i++) {
        var cf = caught[i];
        if (!cf || cf.speciesId !== KOI) continue;
        if (cf.id === fishId) continue;
        if (fishLib.evoOf(cf) > 0) continue;
        out.push({ fish: cf, where: 'caught' });
    }

    for (i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if (!f || (f.tank || 0) !== act) continue;
        if (f.id === fishId) continue;
        if (f.speciesId !== KOI) continue;
        if (fishLib.evoOf(f) > 0) continue;
        out.push({ fish: f, where: 'tank' });
    }

    out.sort(function (a, b) {
        /* 仓库的排前面：吃仓库里的不动鱼位，玩家更省心 */
        if (a.where !== b.where) return a.where === 'caught' ? -1 : 1;
        return (a.fish.growth || 0) - (b.fish.growth || 0);
    });
    return out;
}

/**
 * 当前状态：能不能吞、还差几条、下一阶叫什么。
 * UI 用它决定按钮文案与是否可点，不在渲染层重算规则。
 */
function statusOf(state, fishId) {
    var f = inTank(state, fishId);
    if (!f) return { ok: false, reason: 'gone' };
    if (f.speciesId !== KOI) return { ok: false, reason: 'not_koi' };
    if (!fishLib.hasTrait(f, KEY_TRAIT)) return { ok: false, reason: 'no_scale' };

    var sp = specOf(f);
    var max = fishLib.maxEvoOf(sp);
    var evo = fishLib.evoOf(f);
    if (evo >= max) {
        return {
            ok: false, reason: 'max', evo: evo, max: max,
            stage: fishLib.evoStageName(f),
            prey: 0
        };
    }

    var prey = preyListOf(state, fishId);
    var nextStage = (sp.evo.stages[evo + 1] || {}).name || '';
    return {
        ok: prey.length > 0,
        reason: prey.length ? '' : 'no_prey',
        evo: evo,
        max: max,
        stage: fishLib.evoStageName(f),
        nextStage: nextStage,
        prey: prey.length,
        /* 每条升一阶，所以「还差几条」= 剩余阶数 */
        need: max - evo
    };
}

/**
 * 吞一条同族。
 * 返回 { ok, evo, stage, becameDragon, preyName, eaten, need }
 */
function devour(state, fishId) {
    var st = statusOf(state, fishId);
    if (!st.ok) return st;

    var f = inTank(state, fishId);
    var list = preyListOf(state, fishId);
    var pick = list[0];
    if (!pick) return { ok: false, reason: 'no_prey' };

    var prey = pick.fish;
    var preyName = fishLib.speciesById(prey.speciesId).name;

    /* 从所在位置移除：仓库 splice caught，缸里 splice fish */
    if (pick.where === 'caught') {
        var ci = state.caught.indexOf(prey);
        if (ci >= 0) state.caught.splice(ci, 1);
    } else {
        var fi = state.fish.indexOf(prey);
        if (fi >= 0) state.fish.splice(fi, 1);
        /* 被吃的那条如果正被选中，顺手清掉选中态 */
        if (state.view && state.view.selFish === prey.id) state.view.selFish = '';
    }

    var max = fishLib.maxEvoOf(specOf(f));
    f.evo = Math.min(max, fishLib.evoOf(f) + 1);
    /* 吃一条鱼等于饱餐一顿：避免进化完立刻饿着 */
    f.hunger = Math.min(100, (f.hunger || 0) + 20);

    state.stats.devoured = (state.stats.devoured || 0) + 1;

    return {
        ok: true,
        evo: f.evo,
        max: max,
        stage: fishLib.evoStageName(f),
        becameDragon: f.evo >= max,
        preyName: preyName,
        eaten: 1,
        need: Math.max(0, max - f.evo)
    };
}

module.exports = {
    KEY_TRAIT: KEY_TRAIT,
    KOI: KOI,
    isDragonLine: isDragonLine,
    canGrow: canGrow,
    preyListOf: preyListOf,
    statusOf: statusOf,
    devour: devour
};
