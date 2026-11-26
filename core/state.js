/* ============================================================
 * core/state.js · 游戏状态
 *
 * 这里是唯一的权威数据源。约定：
 *   - 存档字段写在 serializable 区（core/save.js 负责映射）
 *   - view.* 是「视图事件」，由逻辑层产生、渲染层消费，不存盘
 *   - 运行时字段（位置、速度）不存盘
 * ============================================================ */

var cfg = require('../config/index.js');
var platform = require('../platform.js');
var fishFactory = require('./fish.js');
var codex = require('./codex.js');

function create() {
    return {
        /* ---- 元信息 ---- */
        version: cfg.saveVersion,
        createdAt: platform.now(),
        lastSeenAt: platform.now(),

        /* ---- 核心数值 ---- */
        coins: {
            fish: cfg.economy.start.fishCoin,
            s: cfg.economy.start.sCoin
        },
        ledger: [],

        /* ---- 养成 / 设施 ---- */
        foodLv: 1,
        shellLv: 0,         /* 招财贝壳等级 0-3：卖鱼价 +30/40/50% */
        auto: false,
        corals: 0,
        storageLv: 1,       /* 仓库等级：决定存储上限与离线结算时长 */
        tankCount: 1,       /* 已拥有的鱼缸数（M2）：鱼位与产出按缸叠加 */
        activeTank: 0,      /* 当前查看的缸（0 基）。纯界面状态，但存盘免得每次跳回 1 号 */

        /* ---- 实体 ---- */
        fish: [],
        foods: [],

        /* ---- M9 鱼塘 / 仓库 ----
         * pondLv  鱼塘等级（1=普通，当前只开这一档）
         * bag     仓库里的道具计数：鱼饵 / 珍珠贝 / 珍珠
         * caught  钓到但还没放进鱼缸的鱼（完整鱼对象，tank 无意义） */
        pondLv: 1,
        bag: {
            bait: 0,
            oyster: 0,
            pearl: 0
        },
        caught: [],

        /* ---- M12 繁育 ----
         * hatchery  孵化槽队列：{ id, speciesId, sex, traits, motherId, fatherId,
         *                        startAt, hatchAt, seconds, twin }
         * nursery   培育缸：子代落点，结构与 fish 同构（含 traits / sex）
         * nurseryLv 培育缸等级（1=普通，6 格）
         * breedSeq  子代编号用的自增数 */
        hatchery: [],
        nursery: [],
        nurseryLv: 1,
        breedSeq: 0,

        /* ---- 图鉴收录：曾经拥有过的鱼种（卖掉/被吃也算） ----
         * { speciesId: { n: 累计条数, t: 首次获得时间 } } */
        discovered: {},

        /* ---- 收益累加器：不足 1 枚的零头先攒着，攒够再入账 ---- */
        acc: {
            fish: 0
        },

        /* ---- 视图事件（不存盘） ---- */
        view: {
            bubbles: [],
            floaters: [],
            selFish: ''     /* 当前选中的鱼 id：点一下选中，再点「卖掉」才成交 */
        },

        /* ---- 运行时计时 ---- */
        t: 0,
        feedCd: 0,
        autoT: 0,
        saveT: 0,
        hint: 1,
        spawnBubbleT: 0,
        fullWarnT: 0,

        /* ---- 统计 ---- */
        stats: {
            earned_fish: 0,
            earned_s: 0,
            spent_fish: 0,
            spent_s: 0,
            feedCount: 0,
            fishEaten: 0,   /* 被鲨鱼吃掉的同伴数 */
            playSeconds: 0
        },

        /* ---- 离线结算结果（供弹窗读取） ---- */
        lastOffline: null
    };
}

/* 开局：一条鱼 */
function bootstrapFresh() {
    var s = create();
    var f = fishFactory.create(cfg.species[0].id, { growth: 6, rollTraits: true });
    f.x = 195;
    f.y = 300;
    s.fish.push(f);
    codex.mark(s, f.speciesId);   /* 开局那条鱼也要进图鉴 */
    return s;
}

module.exports = {
    create: create,
    bootstrapFresh: bootstrapFresh
};
