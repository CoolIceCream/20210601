/* ============================================================
 * ui/layout.js · 布局常量与命中区域
 *
 * 所有"东西画在哪、点到哪算命中"都集中在这里，
 * 渲染和触摸用的是同一份坐标，不会出现画一处点另一处。
 *
 * 商店分两页：
 *   tab 0  道具（config/items.js，单列）
 *   tab 1  鱼卵（config/species.js，两列卡片）
 * 面板高度取两页的较大值，切页时不会跳动。
 * ============================================================ */

var C = require('../render/canvas.js');
var cfg = require('../config/index.js');

var W = C.W;
var H = C.H;

var TOP = C.SB + 10;

/* 按钮不再浮在水面上：位置由 render/canvas.js 的三段分区算出来，
 * 缸盖下面才是水，缸底以下才是底座，按钮永远落在底座上 */
/* 三个按钮平分底部那一条带：撒食 / 卖掉 / 商店。
 * M6 起按钮里多了一枚圆形图标徽章，所以从「扁条」变成「方块 +
 * 图标在上、文字在下」，尺寸也跟着长高。 */
var BTN_W = 108;
var BTN_H = C.BTN_H;
var BTN_Y = C.BTN_Y;
var BTN_GAP = 10;
var BTN_X0 = (W - (BTN_W * 3 + BTN_GAP * 2)) / 2;

var FEED_BTN = { x: BTN_X0, y: BTN_Y, w: BTN_W, h: BTN_H };
var SELL_BTN = { x: BTN_X0 + BTN_W + BTN_GAP, y: BTN_Y, w: BTN_W, h: BTN_H };
var SHOP_BTN = { x: BTN_X0 + (BTN_W + BTN_GAP) * 2, y: BTN_Y, w: BTN_W, h: BTN_H };

/* ---- 缸内缩放按钮（M8）----
 * 贴在玻璃右上角，不占顶部信息行和底部按钮带。
 * 文字提示卡片在画面正中，和这里不会撞。 */
var ZOOM_BTN = 28;
var ZOOM_GAP = 6;
var ZOOM_Y = C.TANK_TOP + 10;
var ZOOM_OUT = { x: W - 14 - ZOOM_BTN * 2 - ZOOM_GAP, y: ZOOM_Y, w: ZOOM_BTN, h: ZOOM_BTN };
var ZOOM_IN = { x: W - 14 - ZOOM_BTN, y: ZOOM_Y, w: ZOOM_BTN, h: ZOOM_BTN };

/* ---- 顶部：玩家卡 + 两个资源条 ----
 * 左边一张卡：头像 + 缸名 + 鱼位进度；右边两条胶囊：鱼币、鱼数。
 * 卡和胶囊之间那 86px 的缝正好够放 3 个缸号圆点（多缸时才出现）。 */
var CARD = { x: 14, y: TOP, w: 160, h: 58 };

var PILL_W = 116;
var PILL_H = 27;
var COIN_PILL = { x: W - 14 - PILL_W, y: TOP, w: PILL_W, h: PILL_H };
var FISH_PILL = { x: W - 14 - PILL_W, y: TOP + PILL_H + 4, w: PILL_W, h: PILL_H };

/* 头像：卡片左边那枚圆形 */
var AVATAR = { cx: CARD.x + 27, cy: CARD.y + CARD.h / 2, r: 19 };

/* 鱼位进度条：名字下面那一条 */
var BAR = {
    x: CARD.x + 66,      /* 和名字左对齐，不要贴着头像 */
    y: CARD.y + 36,
    w: CARD.w - 76,
    h: 10
};

/* ---- 鱼缸切换（M2，M6 改成圆点）----
 * 原来是一排 44×24 的胶囊，塞不进新顶部；改成三个小圆点，
 * 放在玩家卡和资源条之间的缝里。 */
var TANK_TAB_W = 22;
var TANK_TAB_H = 22;
var TANK_TAB_GAP = 5;
var TANK_TAB_Y = TOP + 17;

function tankTabRect(i, total) {
    var n = total || 1;
    var all = n * TANK_TAB_W + (n - 1) * TANK_TAB_GAP;
    var left = CARD.x + CARD.w;
    var span = COIN_PILL.x - left;
    return {
        x: left + (span - all) / 2 + i * (TANK_TAB_W + TANK_TAB_GAP),
        y: TANK_TAB_Y,
        w: TANK_TAB_W,
        h: TANK_TAB_H
    };
}

/* ---- 商店面板 ---- */
var ITEM_H = 70;
var ITEM_GAP = 9;
var ITEM_TOP = 92;          /* 标题 + tab 之下 */

/* 鱼卵页：普通 / 稀有 / 传说 / 传奇，竖排四张宽卡。
 * 每张卡要放下「文字名 + 可能开出哪些鱼 + 卖价区间 + 买按钮」，
 * 3 列小卡塞不下，所以改成整行卡片。 */
var EGG_ROWS = 4;
var EGG_H = 104;
var EGG_GAP = 10;
var EGG_TOP = 92;

var TAB_H = 30;
var TAB_W = 84;

/* 面板底部留白：要容得下底部那行提示文字 + 安全区，
 * 留小了提示会直接压在最后一行卡片上 */
var BOTTOM_PAD = 72;

var itemsBottom = ITEM_TOP + cfg.items.length * (ITEM_H + ITEM_GAP) - ITEM_GAP;
var eggsBottom = EGG_TOP + EGG_ROWS * (EGG_H + EGG_GAP) - EGG_GAP;

var SHEET_H = Math.min(H * 0.9, Math.max(itemsBottom, eggsBottom) + BOTTOM_PAD);

function sheetTop(ease) {
    return H - SHEET_H * ease;
}

function tabRect(i, ease) {
    var top = sheetTop(ease);
    return { x: 18 + i * (TAB_W + 8), y: top + 52, w: TAB_W, h: TAB_H };
}

function itemRect(i, ease) {
    var top = sheetTop(ease);
    return { x: 16, y: top + ITEM_TOP + i * (ITEM_H + ITEM_GAP), w: W - 32, h: ITEM_H };
}

function buyRect(i, ease) {
    var r = itemRect(i, ease);
    return { x: r.x + r.w - 88, y: r.y + 16, w: 78, h: 38 };
}

function eggRect(i, ease) {
    var top = sheetTop(ease);
    return {
        x: 16,
        y: top + EGG_TOP + i * (EGG_H + EGG_GAP),
        w: W - 32,
        h: EGG_H
    };
}

function eggBuyRect(i, ease) {
    var r = eggRect(i, ease);
    return { x: r.x + r.w - 100, y: r.y + (EGG_H - 40) / 2, w: 88, h: 40 };
}

/* 卡片左侧的「代表鱼」缩略图（该档卖价最高的那条） */
function eggThumbRect(i, ease) {
    var r = eggRect(i, ease);
    var s = 58;
    return { x: r.x + 10, y: r.y + (EGG_H - s) / 2, w: s, h: s };
}

function sellBtnRect() {
    return SELL_BTN;
}

function closeRect(ease) {
    var top = sheetTop(ease);
    return { x: W - 48, y: top + 16, w: 32, h: 32 };
}

/* 顶部资源条（调试手势要用到） */
function coinPillRect() {
    return COIN_PILL;
}

module.exports = {
    W: W,
    H: H,
    TOP: TOP,
    BTN_W: BTN_W,
    BTN_H: BTN_H,
    BTN_Y: BTN_Y,
    FEED_BTN: FEED_BTN,
    SHOP_BTN: SHOP_BTN,
    ZOOM_IN: ZOOM_IN,
    ZOOM_OUT: ZOOM_OUT,
    ZOOM_BTN: ZOOM_BTN,
    CARD: CARD,
    PILL_W: PILL_W,
    PILL_H: PILL_H,
    COIN_PILL: COIN_PILL,
    FISH_PILL: FISH_PILL,
    AVATAR: AVATAR,
    BAR: BAR,
    TANK_TAB_W: TANK_TAB_W,
    TANK_TAB_H: TANK_TAB_H,
    TANK_TAB_Y: TANK_TAB_Y,
    tankTabRect: tankTabRect,
    ITEM_H: ITEM_H,
    ITEM_GAP: ITEM_GAP,
    ITEM_TOP: ITEM_TOP,
    EGG_ROWS: EGG_ROWS,
    EGG_H: EGG_H,
    EGG_GAP: EGG_GAP,
    EGG_TOP: EGG_TOP,
    TAB_H: TAB_H,
    TAB_W: TAB_W,
    SHEET_H: SHEET_H,
    sheetTop: sheetTop,
    tabRect: tabRect,
    itemRect: itemRect,
    buyRect: buyRect,
    eggRect: eggRect,
    eggBuyRect: eggBuyRect,
    eggThumbRect: eggThumbRect,
    SELL_BTN: SELL_BTN,
    sellBtnRect: sellBtnRect,
    closeRect: closeRect,
    coinPillRect: coinPillRect
};
