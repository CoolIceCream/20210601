/* ============================================================
 * config/species.js · 鱼种表
 *
 * 一条鱼的全部数值都在这张表里，core 层只读不写。
 *
 * 字段说明
 *   palette       配色序号（0-7，对应 render/fishart.js 的 PALETTE）
 *                 外形另在 render/fishart.js 的 LOOK 表里按 id 取（圆胖/长身/大尾）
 *   rarity        品质：R / SR / SSR，决定解锁阶段与抽中权重
 *   sizeScale     体型系数，同时影响观感尺寸与产出（越大越能赚）
 *   incomeMul     成鱼期的产出倍率，1.0 = 全缸基准
 *   matureSeconds 从鱼苗长到成鱼的自然耗时（秒），不喂食也会长
 *   feedMul       喂食加速效率，越稀有越低（成鱼越难靠喂食速成）
 *   drawWeight    抽取权重，同品质内可调，总量决定稀有度概率
 *   eggRate       隐藏彩蛋：不参与常规权重，每颗该品质卵独立按这个概率出
 *   secret        展示时不列入「可能出几种 / 卖价区间」，保留惊喜
 *   predator      捕食者：见 config/economy.js 的 predator
 *   （卵价不写死在这里：由 incomeMul × 品质回收时间算出，见 config/economy.js 的 egg）
 *
 * 曲线设计（放置类通用做法）
 *   R   ：几分钟成鱼，产出低，用来跑通现金流
 *   SR  ：7-11 分钟成鱼，产出约 R 的 3-5 倍，中期主力
 *   SSR ：20-35 分钟成鱼，产出约 R 的 15-25 倍，长线目标
 *   产出倍率 ÷ 成鱼耗时 保持逐档上升，稀有鱼才是真正的收益来源。
 * ============================================================ */

module.exports = [
    /* ---------- R · 入门（成鱼 1-3 分钟） ---------- */
    {
        id: 'gold_fish', name: '小金鱼', rarity: 'R', palette: 0,
        sizeScale: 0.92, incomeMul: 1.6, matureSeconds: 75, feedMul: 1.0,
        drawWeight: 20,
        desc: '最常见的入门鱼，长得快、性子稳'
    },
    {
        id: 'blue_zebra', name: '蓝泡泡', rarity: 'R', palette: 1,
        sizeScale: 0.96, incomeMul: 2.2, matureSeconds: 110, feedMul: 0.95,
        drawWeight: 20,
        desc: '通身透明蓝，游过去身后会带一串小气泡'
    },
    {
        id: 'peach_koi', name: '桃花鲤', rarity: 'R', palette: 2,
        sizeScale: 1.00, incomeMul: 3.0, matureSeconds: 150, feedMul: 0.90,
        drawWeight: 16,
        desc: '粉白鳞片，R 品质里最能赚的一条，成鱼慢一点'
    },
    {
        /* 0.1% 彩蛋：不按权重抽，也不出现在鱼卵卡的「可能出几种」里。
         * 不吃饲料，靠吃缸里别的鱼长大 —— 养它要留神。
         * 想稳定拿到它可以直接买「传奇鱼卵」。 */
        id: 'reef_shark', name: '小鲨鱼', rarity: 'R', palette: 8,
        sizeScale: 1.45, incomeMul: 6.0, matureSeconds: 300, feedMul: 0,
        drawWeight: 0, eggRate: 0.001, secret: true, predator: true,
        desc: '普通鱼卵里 0.1% 的意外之喜，只吃鱼、不吃鱼饵'
    },

    /* ---------- SR · 中期（成鱼 7-11 分钟） ---------- */
    {
        id: 'gold_lamp', name: '金灯鱼', rarity: 'SR', palette: 3,
        sizeScale: 1.06, incomeMul: 8.0, matureSeconds: 420, feedMul: 0.60,
        drawWeight: 3.2,
        desc: '圆滚滚一条，通体流金，成鱼后是稳定的现金牛'
    },
    {
        id: 'violet', name: '紫罗兰', rarity: 'SR', palette: 4,
        sizeScale: 1.10, incomeMul: 11.0, matureSeconds: 540, feedMul: 0.55,
        drawWeight: 2.8,
        desc: '紫得像一块软糖，产出比同缸的 R 鱼高一个档'
    },
    {
        id: 'jade', name: '朱锦鲤', rarity: 'SR', palette: 6,
        sizeScale: 1.14, incomeMul: 15.0, matureSeconds: 660, feedMul: 0.50,
        drawWeight: 2.4,
        desc: '红白分明，SR 顶配，成鱼后一条顶五条小金鱼'
    },

    /* ---------- SSR · 长线（成鱼 20-35 分钟） ---------- */
    {
        id: 'dusk_betta', name: '幽蓝斗鱼', rarity: 'SSR', palette: 1,
        sizeScale: 1.18, incomeMul: 44.0, matureSeconds: 1200, feedMul: 0.36,
        drawWeight: 0.55,
        desc: '尾鳍拖得像一匹绸缎，养熟了会自己转圈'
    },
    {
        id: 'red_arrow', name: '红箭鱼', rarity: 'SSR', palette: 6,
        sizeScale: 1.26, incomeMul: 62.0, matureSeconds: 1500, feedMul: 0.32,
        drawWeight: 0.34,
        desc: '爆发型高产出，成鱼需要耐心'
    },
    {
        id: 'gold_dragon', name: '金龙鱼', rarity: 'SSR', palette: 3,
        sizeScale: 1.34, incomeMul: 85.0, matureSeconds: 2100, feedMul: 0.28,
        drawWeight: 0.22,
        desc: '缸里的顶级收藏，产出是全缸基准的八十五倍'
    },

    /* ---------- 传奇 · 金鲤鱼（M14） ----------
     * 只从「传奇鱼卵」里 10% 掉出，不进任何普通卵池、也钓不到。
     * 它身上可能带专属词条「龙鳞」：带龙鳞的金鲤鱼能吞噬同族，
     * 每吞一条升一阶，第三阶化龙。
     *
     * evo 字段就是进化阶梯：
     *   mul      卖价 / 产出倍率（卵价不吃这一层，只影响成体）
     *   sizeMul  体型倍率（观感 + sizeOf）
     * 数值定得比金龙鱼高一档 —— 它是「传奇」，也是四条传奇卵才养得起的产物。 */
    {
        id: 'gold_koi', name: '金鲤鱼', rarity: 'SSR', palette: 3,
        sizeScale: 1.32, incomeMul: 150.0, matureSeconds: 2700, feedMul: 0.26,
        drawWeight: 0, eggRate: 0, secret: true, legendOnly: true,
        desc: '传奇鱼卵 10% 的稀客 · 带「龙鳞」的可吞噬同族，三阶化龙',
        evo: {
            stages: [
                { name: '金鲤鱼', mul: 1.0, sizeMul: 1.0 },
                { name: '金纹鲤', mul: 1.6, sizeMul: 1.10 },
                { name: '蛟', mul: 2.5, sizeMul: 1.22 },
                { name: '真龙', mul: 4.2, sizeMul: 1.38 }
            ],
            /* 每阶要吃几条同族金鲤鱼（第三阶吃完就是真龙） */
            need: 1,
            max: 3
        }
    }
];
