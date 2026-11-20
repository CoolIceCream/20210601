/* ============================================================
 * config/traits.js · 词条表（M1 · T1-8）
 *
 * 策划文档给了 5 类词条，但概率全是占位 `%`，效果也有依赖：
 *   高产  —— 产出倍率，M1 已实现，可掉落
 *   速繁  —— 缩短繁殖冷却，等 M3 繁殖系统
 *   双生  —— 产双鱼，同上依赖 M3
 *   变异  —— 产 S 币，等 S 币有产出/消耗闭环
 * 所以这里用 rollable 显式标出「现在能不能掉」，
 * 没实现的先摆着但不可 roll，避免掉出一堆没效果的词条。
 *
 * 掉落概率不写在这里，而在 core/fish.js · TRAIT_CHANCE，
 * 因为它是「按品质」的，跟着鱼走比跟着词条走更合理。
 * ============================================================ */

module.exports = {
    enabled: true,

    list: [
        {
            id: 'output_up',
            name: '高产',
            type: 'outputMul',      /* 产出倍率 */
            min: 1.5,
            max: 5.0,
            rollable: true,
            weight: 1,
            desc: '产出 1.5–5 倍'
        },
        {
            id: 'breed_fast',
            name: '速繁',
            type: 'breedCdMul',     /* 繁殖冷却缩短 */
            min: 0.8,
            max: 0.8,
            rollable: false,
            weight: 0,
            desc: '繁殖冷却 0.8 倍（待 M3）'
        },
        {
            id: 'mutation',
            name: '变异',
            type: 'mutation',       /* 可产 S 币 */
            min: 1,
            max: 1,
            rollable: false,
            weight: 0,
            desc: '产出 S 币（待 S 币闭环）'
        },
        {
            id: 'twin',
            name: '双生',
            type: 'twin',           /* 有几率产双鱼，仅雌鱼 */
            min: 1,
            max: 1,
            rollable: false,
            weight: 0,
            desc: '有几率产出双鱼（待 M3）'
        }
    ]
};
