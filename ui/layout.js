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

/* ---- 图鉴页：第三个页签 ----
 * 两列 × N 行，10 条鱼（含隐藏款）刚好 5 行。
 * 卡片要放缩略图 + 名字 + 稀有度，比鱼卵卡扁一些。 */
var CODEX_COLS = 2;
var CODEX_CARD_H = 86;
var CODEX_GAP = 9;
var CODEX_TOP = 116;   /* 进度条在 88~108，卡片从 116 起，留出间距 */
var CODEX_ROWS = Math.ceil(cfg.species.length / CODEX_COLS);

/* ---- M9 鱼塘页（第 4 个页签）----
 * 上半是池塘插图，下半是等级/鱼饵信息和一颗大「抛竿」按钮。 */
var POND_TOP = 92;
var POND_SCENE_H = 196;
var POND_CAST_Y = POND_TOP + POND_SCENE_H + 58;
var POND_CAST_H = 56;

/* ---- M9 仓库页（第 5 个页签）----
 * 鱼篓：3 × 3 网格（最多显示 9 条），下面一行是道具（珍珠贝/珍珠/鱼饵），
 * 最底部一条操作栏，按选中的东西变（放缸 / 卖掉 / 打破 / 卖珍珠）。 */
var BAG_TOP = 92;
var BAG_COLS = 3;
var BAG_ROWS = 3;
var BAG_CELL_H = 76;
var BAG_GAP = 8;
var BAG_GRID_Y = BAG_TOP + 20;
var BAG_ITEM_Y = BAG_GRID_Y + BAG_ROWS * (BAG_CELL_H + BAG_GAP) + 6;
var BAG_ITEM_H = 72;
var BAG_ACTION_Y = BAG_ITEM_Y + BAG_ITEM_H + 12;
var BAG_ACTION_H = 48;

var TAB_H = 30;
var TAB_W = 64;   /* 5 个页签：18 + i*72，最后一个右边界 370，正好留 20 */

/* 面板底部留白：要容得下底部那行提示文字 + 安全区，
 * 留小了提示会直接压在最后一行卡片上 */
var BOTTOM_PAD = 72;

var itemsBottom = ITEM_TOP + cfg.items.length * (ITEM_H + ITEM_GAP) - ITEM_GAP;
var eggsBottom = EGG_TOP + EGG_ROWS * (EGG_H + EGG_GAP) - EGG_GAP;
var codexBottom = CODEX_TOP + CODEX_ROWS * (CODEX_CARD_H + CODEX_GAP) - CODEX_GAP;
var pondBottom = POND_CAST_Y + POND_CAST_H;
var bagBottom = BAG_ACTION_Y + BAG_ACTION_H;

var SHEET_H = Math.min(H * 0.9,
    Math.max(itemsBottom, eggsBottom, codexBottom, pondBottom, bagBottom) + BOTTOM_PAD);

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

/* 图鉴：进度条 + 两列卡片 */
function codexProgressRect(ease) {
    var top = sheetTop(ease);
    return { x: 18, y: top + 88, w: W - 36, h: 20 };
}

function codexRect(i, ease) {
    var top = sheetTop(ease);
    var col = i % CODEX_COLS;
    var row = Math.floor(i / CODEX_COLS);
    var gapX = 10;
    var cw = (W - 32 - gapX) / CODEX_COLS;
    return {
        x: 16 + col * (cw + gapX),
        y: top + CODEX_TOP + row * (CODEX_CARD_H + CODEX_GAP),
        w: cw,
        h: CODEX_CARD_H
    };
}

/* 缩略图圆框：贴卡片左边 */
function codexThumbRect(r) {
    var rad = 26;
    return { cx: r.x + 10 + rad, cy: r.y + r.h / 2, r: rad };
}

/* 详情浮层：屏幕居中的大卡 */
function codexDetailRect(ease) {
    var w = W - 44;
    var h = 390;
    return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
}

/* 大图放右上角，资料从左侧往下排，互不压字 */
function codexDetailThumb(d) {
    return { cx: d.x + d.w - 72, cy: d.y + 132, r: 42 };
}

function codexDetailClose(d) {
    var s = 34;
    return { x: d.x + d.w - s - 12, y: d.y + 12, w: s, h: s };
}

/* ---- 鱼塘页 ---- */
function pondSceneRect(ease) {
    var top = sheetTop(ease);
    return { x: 16, y: top + POND_TOP, w: W - 32, h: POND_SCENE_H };
}

function pondCastRect(ease) {
    var top = sheetTop(ease);
    return { x: 16, y: top + POND_CAST_Y, w: W - 32, h: POND_CAST_H };
}

/* ---- 仓库页：鱼网格 ---- */
function bagFishRect(i, ease) {
    var top = sheetTop(ease);
    var col = i % BAG_COLS;
    var row = Math.floor(i / BAG_COLS);
    var gapX = 8;
    var cw = (W - 32 - gapX * (BAG_COLS - 1)) / BAG_COLS;
    return {
        x: 16 + col * (cw + gapX),
        y: top + BAG_GRID_Y + row * (BAG_CELL_H + BAG_GAP),
        w: cw,
        h: BAG_CELL_H
    };
}

/* ---- 仓库页：道具行（0=珍珠贝 1=珍珠 2=鱼饵）---- */
function bagItemRect(i, ease) {
    var top = sheetTop(ease);
    var gapX = 8;
    var cw = (W - 32 - gapX * 2) / 3;
    return { x: 16 + i * (cw + gapX), y: top + BAG_ITEM_Y, w: cw, h: BAG_ITEM_H };
}

/* ---- 仓库页：底部操作栏（0=左 1=右）---- */
function bagActionRect(k, ease) {
    var top = sheetTop(ease);
    var gapX = 10;
    var bw = (W - 32 - gapX) / 2;
    return {
        x: 16 + k * (bw + gapX),
        y: top + BAG_ACTION_Y,
        w: bw,
        h: BAG_ACTION_H
    };
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
    CODEX_COLS: CODEX_COLS,
    CODEX_ROWS: CODEX_ROWS,
    codexProgressRect: codexProgressRect,
    codexRect: codexRect,
    codexThumbRect: codexThumbRect,
    codexDetailRect: codexDetailRect,
    codexDetailThumb: codexDetailThumb,
    codexDetailClose: codexDetailClose,
    POND_TOP: POND_TOP,
    POND_SCENE_H: POND_SCENE_H,
    POND_CAST_Y: POND_CAST_Y,
    POND_CAST_H: POND_CAST_H,
    pondSceneRect: pondSceneRect,
    pondCastRect: pondCastRect,
    BAG_TOP: BAG_TOP,
    BAG_COLS: BAG_COLS,
    BAG_ROWS: BAG_ROWS,
    BAG_CELL_H: BAG_CELL_H,
    BAG_GRID_Y: BAG_GRID_Y,
    BAG_ITEM_Y: BAG_ITEM_Y,
    BAG_ITEM_H: BAG_ITEM_H,
    BAG_ACTION_Y: BAG_ACTION_Y,
    BAG_ACTION_H: BAG_ACTION_H,
    bagFishRect: bagFishRect,
    bagItemRect: bagItemRect,
    bagActionRect: bagActionRect,
    SELL_BTN: SELL_BTN,
    sellBtnRect: sellBtnRect,
    closeRect: closeRect,
    coinPillRect: coinPillRect
};
