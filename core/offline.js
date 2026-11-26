/* ============================================================
 * core/offline.js · 离线结算（M3：结算成长，不结算金币）
 *
 * 鱼不再自动产币之后，离线能给的只有「时间」本身：
 *   鱼在缸里照常长大，回来一看能卖得更贵。
 *
 * 规则（配置在 config/economy.js · offline）：
 *   离开不足 minSeconds 不结算；
 *   超出「仓库等级对应的离线时长」的部分截断；
 *   有效秒数 = 时长 × growthEfficiency（默认 50%）；
 *   成长值 = 物种成熟耗时 → 每秒 100/matureSeconds 点；
 *   饱食度最多掉到 hungerFloor，鱼在缸里饿不死。
 *
 * 结算结果里带「全缸身价」（现在卖掉能得多少），
 * 弹窗用它把「长大」翻译成玩家真正关心的数字。
 * ============================================================ */

var cfg = require('../config/index.js');
var fishLib = require('./fish.js');
var storage = require('./storage.js');
var predation = require('./predation.js');
var breed = require('./breed.js');

/**
 * 结算离线成长并写回 state。
 * 返回 null（不结算）或结算明细。
 */
function settle(state, nowMs) {
    var last = state.lastSeenAt || nowMs;
    var rawSeconds = Math.max(0, (nowMs - last) / 1000);

    /* 先把时间推到现在，无论是否结算，避免重复领取 */
    state.lastSeenAt = nowMs;

    var O = cfg.economy.offline;
    if (rawSeconds < (O.minSeconds || 60)) return null;

    var capHours = storage.offlineHoursOf(state);
    var capSeconds = capHours * 3600;
    var seconds = Math.min(rawSeconds, capSeconds);
    var capped = rawSeconds > capSeconds;

    var eff = O.growthEfficiency == null ? 1 : O.growthEfficiency;
    var effective = seconds * eff;
    var floor = O.hungerFloor == null ? 0 : O.hungerFloor;
    var decay = cfg.economy.feeding.hungerDecay;

    var grown = 0;
    var adult = 0;
    var before = 0;
    var after = 0;

    /* 离开那一刻的全缸身价：等下被吃掉的鱼也要算在「之前」里，
     * 这样弹窗的涨跌才是真的，不会假装它们从来没出现过。 */
    for (var i = 0; i < state.fish.length; i++) {
        before += fishLib.sellPriceOf(state.fish[i], state.shellLv);
    }

    /* 捕食者离线也照样吃鱼，只是频率放慢（默认每 3 分钟一条）。
     * 它不吃鱼饵，所以离线不会因为它而少掉饲料。 */
    var P = cfg.economy.predator || {};
    var mealGap = P.offlineMealSeconds == null ? 180 : P.offlineMealSeconds;
    var meals = Math.max(0, Math.floor(seconds / Math.max(1, mealGap)));
    var hunters = [];
    for (i = 0; i < state.fish.length; i++) {
        if (predation.isPredator(state.fish[i])) hunters.push(state.fish[i]);
    }
    for (var h = 0; h < hunters.length; h++) {
        for (var m = 0; m < meals; m++) {
            var prey = predation.findPrey(state, hunters[h]);
            if (!prey) break;
            predation.eat(state, hunters[h], prey);
        }
    }
    var eaten = predation.removeEaten(state);

    for (i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        var sp = fishLib.speciesById(f.speciesId);

        if (f.growth < 100) {
            var perSec = 100 / Math.max(1, sp.matureSeconds || 120);
            var was = f.growth;
            f.growth = Math.min(100, was + perSec * effective);
            if (f.growth > was + 0.5) grown += 1;
            if (was < 100 && f.growth >= 100) adult += 1;
        }

        if (f.hunger > floor) {
            f.hunger = Math.max(floor, f.hunger - decay * seconds);
        }

        after += fishLib.sellPriceOf(f, state.shellLv);
    }

    /* 繁育：离线期间到点的蛋必须孵出来，不能等玩家回来才继续倒数。
     * 孵出的鱼苗直接进鱼篓（旧版的培育缸已在 M16 去掉）。 */
    var hatched = breed.tick(state, nowMs).length;

    /* 没有鱼长大、没有鱼被吃掉、也没有蛋孵出来，就不打扰玩家 */
    if (grown <= 0 && eaten <= 0 && hatched <= 0) return null;

    var result = {
        seconds: seconds,
        rawSeconds: rawSeconds,
        capped: capped,
        capHours: capHours,
        grown: grown,
        adult: adult,
        eaten: eaten,
        hatched: hatched,
        total: state.fish.length,
        before: before,
        after: after,
        gain: after - before
    };
    state.lastOffline = result;
    return result;
}

module.exports = {
    settle: settle
};
