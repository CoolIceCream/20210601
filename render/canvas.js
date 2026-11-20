/* ============================================================
 * render/canvas.js · 画布与视口
 *
 * 全工程唯一创建 canvas 的地方。竖屏游戏，尺寸在启动时确定。
 *
 * 竖向分三段（M4 起「做出鱼缸的样子」）：
 *   ┌──────────────┐ 0
 *   │  缸盖 · 信息行 │ HEAD_H = 状态栏 + 44
 *   ├──────────────┤ TANK_TOP
 *   │              │
 *   │   水体（玻璃） │   ← 鱼、水草、珊瑚、沙底都在这里面
 *   │              │
 *   ├──────────────┤ TANK_BOTTOM
 *   │  底座 · 按钮  │   ← 撒食 / 商店 / 卖掉
 *   └──────────────┘ H
 *
 * 这样按钮永远不会压到水草和珊瑚，顶部信息也有一条自己的横条，
 * 而不是浮在水面上的两个胶囊。
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

var BTN_H = 74;
var BTN_Y = H - SAFE_BOTTOM - 10 - BTN_H;      /* 按钮顶边 */
var TANK_TOP = HEAD_H;
var TANK_BOTTOM = BTN_Y - 18;                  /* 缸底 = 按钮带上方 18px */

/* 沙底：鱼贴着它游，水草珊瑚从这里长出来 */
var GROUND = TANK_BOTTOM - 58;

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
