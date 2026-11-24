/* ============================================================
 * ui/session.js · 界面瞬时状态
 *
 * 只存在于内存、不存盘的东西：面板开合、弹窗、飘提示、调试开关。
 * 渲染层读它，交互层写它。
 * ============================================================ */

module.exports = {
    /* 浏览器自动化读界面状态用；小游戏里 window 不存在，这行自然跳过 */
    /* 商店 */
    sheetOpen: false,
    sheetEase: 0,
    sheetTab: 0,        /* 0=商店 1=鱼卵 2=图鉴 3=鱼塘 4=仓库 */
    codexDetail: null,  /* 图鉴详情条目的序号（0 基），null = 不显示 */
    bagSel: '',         /* 仓库页当前选中的鱼 id，'' = 没选 */
    pondTapAt: 0,       /* 上次抛竿时间戳，用来做连点冷却 */

    /* 模态弹窗：{ type:'offline', seconds, gain, capped } */
    modal: null,

    /* 轻提示：{ text, t } */
    toast: null,

    /* 调试面板 */
    debug: {
        open: false,
        tapTimes: []
    },

    /* 帧率（调试面板显示用） */
    fps: 0,

    showToast: function (text) {
        this.toast = { text: text, t: 1.4 };
    }
};

if (typeof window !== 'undefined') window.__sheetState = module.exports;
