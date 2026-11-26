/* ============================================================
 * render/canvas.js · 画布与视口
 *
 * 全工程唯一创建 canvas 的地方。竖屏游戏，尺寸在启动时确定。
 *
 * 竖向分两段（M13 去掉底栏）：
 *   ┌──────────────┐ 0
 *   │  缸盖 · 信息行 │ HEAD_H = 状态栏 + 74
 *   ├──────────────┤ TANK_TOP
 *   │              │
 *   │   水体（玻璃） │   ← 鱼、水草、珊瑚、沙底都在这里面
 *   │              │
 *   │  ⬤ ⬤ ⬤ ⬤ ⬤  │   ← 五个悬浮按钮（圆形图标 + 胶囊标签）
 *   └──────────────┘ TANK_BOTTOM = H
 *
 * 底栏那条木板已经删掉了：缸体一路延伸到屏幕底部，
 * 按钮变成浮在水底的圆形徽章，不再占掉一整条高度。
 * 鱼的可游范围仍按 ground 收口，不会钻到按钮后面去。
 * ============================================================ */

var platform = require('../platform.js');

var info = platform.viewport();

var DPR = Math.min(info.pixelRatio || 2, 3);
var W = info.windowWidth;
var H = info.windowHeight;
var SB = info.statusBarHeight || 20;
var SAFE_BOTTOM = info.safeAreaBottom || 0;

/* ---- 三段的高度 ----
 * M6 起顶部和底部都长高了：上面是「玩家卡 + 两个资源条」，
 * 下面是「图标 + 文字」的方形按钮，都比原来那行小字和扁按钮占地方。
 * 中间的玻璃相应变矮一点，仍然是最宽裕的一块。 */
var HEAD_H = SB + 74;

/* ---- 底部悬浮按钮（M13）----
 * BTN_H 是「圆形徽章 + 胶囊标签」这一整块的高度：
 * 圆半径约 25，标签 22 高，压在圆底部 10px 上。
 * 按钮底边离屏幕底留一点点安全距，剩下的全给鱼缸。 */
var BTN_H = 62;
var BTN_PAD = 12 + Math.min(SAFE_BOTTOM, 16);
var BTN_Y = H - BTN_PAD - BTN_H;                /* 按钮块顶边 */
var TANK_TOP = HEAD_H;
var TANK_BOTTOM = H - 1;                        /* 缸底 = 屏幕底（底栏已删） */

/* 沙底：鱼贴着它游，水草珊瑚从这里长出来。
 * 放在按钮上方一点，按钮就像「站在沙地上」，鱼也不会钻到按钮背后。 */
var GROUND = BTN_Y - 26;

/* 玻璃左右各留 8px 作为缸壁（细线勾出来的那种，不是厚框） */
var FRAME_X = 8;

var canvas = platform.createCanvas(W, H, DPR);
if (!canvas) {
    throw new Error('createCanvas() 返回空（W=' + W + ' H=' + H + ' DPR=' + DPR + '）');
}
var ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('getContext("2d") 返回空，该机型/基础库不支持 Canvas 2D');
}
ctx.scale(DPR, DPR);

module.exports = {
    canvas: canvas,
    FRAME_X: FRAME_X,
    ctx: ctx,
    W: W,
    H: H,
    SB: SB,
    SAFE_BOTTOM: SAFE_BOTTOM,
    /* 三段分区 */
    HEAD_H: HEAD_H,
    TANK_TOP: TANK_TOP,
    TANK_BOTTOM: TANK_BOTTOM,
    STAND_TOP: TANK_BOTTOM,     /* 旧名：缸底就是按钮带的顶边 */
    BTN_H: BTN_H,
    BTN_Y: BTN_Y,
    /* 沙底线（旧名 ground 保留，逻辑层都用它） */
    ground: GROUND,
    GROUND: GROUND,
    DPR: DPR,
    /* 逻辑层需要的视口描述：鱼的上下边界以水体为准，
     * h 用缸底而不是屏幕高，否则鱼会游到按钮底下 */
    viewport: { w: W, h: TANK_BOTTOM, top: TANK_TOP, x0: FRAME_X, ground: GROUND }
};
