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
    {
        id: 'feed',
        icon: 'feed',
        iconBg: '#2c7a4b',
        name: '高级饲料',
        desc: '每粒营养更高，长得更快',
        maxLevel: 5,
        price: { base: 160, mul: 2, step: 1 }
    },
    {
        id: 'coral',
        icon: 'coral',
        iconBg: '#8c3b5a',
        name: '珊瑚摆件',
        desc: '给水族箱添一株彩色珊瑚',
        price: { base: 180, mul: 1.65, step: 10 }
    },
    {
        id: 'auto',
        icon: 'auto',
        iconBg: '#8a6d1f',
        name: '自动喂食器',
        desc: '每 15 秒自动撒一次食',
        price: { base: 900, mul: 1, step: 1 }
    },
    {
        id: 'warehouse',
        icon: 'warehouse',
        iconBg: '#3f5f8a',
        name: '仓库扩容',
        desc: '鱼位 +3，离线结算也能存更久',
        maxLevel: 6,
        price: { base: 8000, mul: 2.5, step: 100 }
    },
    {
        id: 'tank',
        icon: 'tank',
        iconBg: '#2f6f7a',
        name: '新鱼缸',
        desc: '多一个缸，鱼位直接相加',
        maxLevel: 3,
        /* 真实价格由 economy.tanks.price 决定，这里只是占位 */
        price: { base: 1, mul: 1, step: 1 }
    }
];
