/* ============================================================
 * core/codex.js · 鱼类图鉴（收录状态）
 *
 * 图鉴记住的是「曾经拥有过」：鱼卖掉、被鲨鱼吃掉之后，
 * 条目仍然算已发现。这和缸里现有的鱼是两回事。
 *
 * state.discovered 结构：
 *   { speciesId: { n: 累计获得条数, t: 首次获得时间戳 } }
 *
 * 收录时机：
 *   - 买卵开出鱼   → shop.buyEgg 调 mark()
 *   - 开局第一条鱼 → bootstrapFresh 调 mark()
 *   - 老档读进来   → save.deserialize 调 syncFromFish() 补录
 * ============================================================ */

var cfg = require('../config/index.js');
var fishLib = require('./fish.js');
var platform = require('../platform.js');

function table(state) {
    if (!state.discovered || typeof state.discovered !== 'object') {
        state.discovered = {};
    }
    return state.discovered;
}

/* 收录一条鱼。返回 true 表示是新发现（首次），false 表示之前已有 */
function mark(state, speciesId) {
    if (!speciesId) return false;
    var t = table(state);
    var rec = t[speciesId];
    if (!rec) {
        t[speciesId] = { n: 1, t: platform.now() };
        return true;
    }
    rec.n = (rec.n || 0) + 1;
    return false;
}

/* 用当前缸里的鱼补录（读档兼容：老版本没有 discovered 字段） */
function syncFromFish(state) {
    var added = 0;
    for (var i = 0; i < state.fish.length; i++) {
        if (mark(state, state.fish[i].speciesId)) added += 1;
    }
    return added;
}

function isFound(state, speciesId) {
    return !!table(state)[speciesId];
}

function foundCount(state) {
    var n = 0;
    var t = table(state);
    for (var i = 0; i < cfg.species.length; i++) {
        if (t[cfg.species[i].id]) n += 1;
    }
    return n;
}

function totalCount() {
    return cfg.species.length;
}

/* 图鉴条目。未发现的鱼也占位，但名字和资料打码，只留剪影 */
function list(state) {
    var t = table(state);
    var out = [];
    for (var i = 0; i < cfg.species.length; i++) {
        var sp = cfg.species[i];
        var rec = t[sp.id];
        out.push({
            sp: sp,
            index: i + 1,
            found: !!rec,
            count: rec ? (rec.n || 0) : 0,
            firstAt: rec ? rec.t : 0,
            price: fishLib.matureValueOf(sp),
            mature: sp.matureSeconds || 120,
            source: sourceOf(sp)
        });
    }
    return out;
}

function sourceOf(sp) {
    if (sp.secret) return '普通鱼卵 0.1% · 传奇鱼卵必出';
    if (sp.rarity === 'R') return '普通鱼卵';
    if (sp.rarity === 'SR') return '稀有鱼卵';
    if (sp.rarity === 'SSR') return '传说鱼卵';
    return '鱼卵';
}

function progress(state) {
    var total = totalCount();
    var found = foundCount(state);
    return { found: found, total: total, percent: total ? found / total : 0 };
}

module.exports = {
    table: table,
    mark: mark,
    syncFromFish: syncFromFish,
    isFound: isFound,
    foundCount: foundCount,
    totalCount: totalCount,
    list: list,
    progress: progress,
    sourceOf: sourceOf
};
