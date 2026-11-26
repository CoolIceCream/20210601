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
    pond: require('./pond.js'),
    breed: require('./breed.js'),

    /* 品质配色：core 的飘字和 render 的品质卡片共用一份，避免两边各写一遍 */
    rarityColor: {
        R: '#a8e0c4',
        SR: '#e8d4a0',
        SSR: '#f4a08e'
    },

    /* 对外展示的版本号（系统弹层里显示） */
    version: '0.17.0',

    /* 版本号：改了存档结构要加 1，并在 core/save.js 补迁移
     * v4 = M2 多鱼缸（tankCount / activeTank / 每条鱼的 tk）
     * v5 = M9 鱼塘/仓库（pondLv / bag / caught）
     * v6 = M12 繁育（鱼的 sex、词条 {id,lv}、hatchery / nursery / nurseryLv）
     * v7 = M14 金鲤鱼进化（鱼的 evo 进化阶、龙鳞词条）
     * v8 = M16 删培育缸（hatchery 改成培育栏位、新增 eggs 仓库鱼卵、
     *      nursery / nurseryLv 作废，老档里的子代并入鱼篓） */
    saveVersion: 8,

    /* 调试面板：true 时启动即打开（发布前置 false） */
    debug: {
        enabled: true,
        startOpen: false
    }
};

module.exports = cfg;
