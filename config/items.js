/* ============================================================
 * config/items.js · 商店条目（纯数据）
 *
 * price 用参数描述，实际价格由 core/shop.js 计算：
 *   base * mul ^ 已购次数，再按 step 取整
 * 购买效果由 core/shop.js 按 id 分发，配置里不写函数，
 * 这样配置可以整体序列化 / 热更。
 * ============================================================ */

module.exports = [
    /* 鱼类不再放在道具页：所有鱼都从「鱼卵」页按品质购买（随机出该品质的一条） */

    /* 鱼饵：消耗品，按个买、钓一次扣一个。consumable 让 shop 走
     * 「固定价、不封顶、显示持有数」的分支，而不是等级制。 */
    {
        id: 'bait',
        icon: 'bait',
        iconBg: '#3d5a2f',
        name: '鱼饵',
        desc: '钓鱼必备 · 每次消耗 1 个',
        consumable: true,
        price: { base: 10, mul: 1, step: 1 }
    },
    {
        id: 'feed',
        icon: 'feed',
        iconBg: '#2f6348',
        name: '高级饲料',
        desc: '每粒营养更高，长得更快',
        maxLevel: 5,
        price: { base: 160, mul: 2, step: 1 }
    },
    {
        id: 'shell',
        icon: 'shell',
        iconBg: '#2f5a72',
        name: '招财贝壳',
        desc: '卖鱼价格 +30%，可升级',
        maxLevel: 3,
        price: { base: 6000, mul: 3, step: 100 }
    },
    {
        id: 'coral',
        icon: 'coral',
        iconBg: '#7e3049',
        name: '珊瑚摆件',
        desc: '给水族箱添一株彩色珊瑚',
        price: { base: 180, mul: 1.65, step: 10 }
    },
    {
        id: 'auto',
        icon: 'auto',
        iconBg: '#8a6d2f',
        name: '自动喂食器',
        desc: '每 15 秒自动撒一次食',
        price: { base: 900, mul: 1, step: 1 }
    },
    {
        id: 'warehouse',
        icon: 'warehouse',
        iconBg: '#3f5285',
        name: '仓库扩容',
        desc: '鱼位 +3，离线结算也能存更久',
        maxLevel: 6,
        price: { base: 8000, mul: 2.5, step: 100 }
    },
    {
        id: 'tank',
        icon: 'tank',
        iconBg: '#2f5f72',
        name: '新鱼缸',
        desc: '多一个缸，鱼位直接相加',
        maxLevel: 3,
        /* 真实价格由 economy.tanks.price 决定，这里只是占位 */
        price: { base: 1, mul: 1, step: 1 }
    }
];
