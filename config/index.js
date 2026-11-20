/* ============================================================
 * config/index.js · 配置汇总
 *
 * 业务代码只 require 这一个文件，改数值只改同目录下的分表。
 * ============================================================ */

var cfg = {
    economy: require('./economy.js'),
    species: require('./species.js'),
    traits: require('./traits.js'),
    items: require('./items.js'),

    /* 品质配色：core 的飘字和 render 的品质卡片共用一份，避免两边各写一遍 */
    rarityColor: {
        R: '#bfe6c8',
        SR: '#8fd0ff',
        SSR: '#ffd76a'
    },

    /* 版本号：改了存档结构要加 1，并在 core/save.js 补迁移
     * v4 = M2 多鱼缸（tankCount / activeTank / 每条鱼的 tk） */
    saveVersion: 4,

    /* 调试面板：true 时启动即打开（发布前置 false） */
    debug: {
        enabled: true,
        startOpen: false
    }
};

module.exports = cfg;
