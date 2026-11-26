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
    bagTab: 2,          /* 仓库子页：0=鱼卵 1=道具 2=鱼（默认落在鱼） */
    bagSels: [],        /* 仓库页选中的 key 列表（鱼 id / item:xxx / egg:n） */
    bagMode: false,     /* 仓库批量模式：点格子是「加选」而不是「换选」 */
    pondTapAt: 0,       /* 上次抛竿时间戳，用来做连点冷却 */

    /* M12 繁育浮层 */
    breedOpen: false,
    breedMother: '',    /* 选中的雌鱼 id */
    breedFather: '',    /* 选中的雄鱼 id */
    breedPick: '',      /* 正在选亲本的槽：'mother' / 'father' / '' */
    nurseryDetail: '',  /* 培育缸里点开的子代 id（详情小卡） */

    /* 模态弹窗：{ type:'offline', seconds, gain, capped } */
    modal: null,

    /* 系统弹层（底栏「系统」按钮）：sysArmed > 0 表示清档已上膛，倒计时到 0 解除 */
    sysOpen: false,
    sysArmed: 0,

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
