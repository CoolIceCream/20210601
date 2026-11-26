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
var U = require('../render/util.js');
var cfg = require('../config/index.js');

var W = C.W;
var H = C.H;

var TOP = C.SB + 10;

/* 按钮不再浮在水面上：位置由 render/canvas.js 的三段分区算出来，
 * 缸盖下面才是水，缸底以下才是底座，按钮永远落在底座上 */
/* ---- 底部悬浮按钮（M13：底栏木板删掉）----
 * 五个入口不再坐在一条底栏上，而是浮在水底：
 * 上面一枚圆形徽章（图标），下面压一张胶囊标签（文字）。
 * 槽位只用来算横向排布，画和点仍走同一份坐标。
 * 槽位之间的缝是水面，点那里照常撒食。 */
var BTN_GAP = 8;
var BTN_W = (W - 28 - BTN_GAP * 4) / 5;
var BTN_H = C.BTN_H;
var BTN_Y = C.BTN_Y;
var BTN_X0 = 14;

/* 圆形徽章半径 / 胶囊标签尺寸：窄屏按槽宽收，不会互相压到 */
var BTN_R = Math.min(25, (BTN_W - 8) / 2);
var DOCK_PILL_W = Math.min(58, BTN_W - 10);
var DOCK_PILL_H = 22;

function barBtn(i) {
    return { x: BTN_X0 + (BTN_W + BTN_GAP) * i, y: BTN_Y, w: BTN_W, h: BTN_H };
}

var STORE_BTN = barBtn(0);
var BAG_BTN = barBtn(1);
var POND_BTN = barBtn(2);
var CODEX_BTN = barBtn(3);
var SYS_BTN = barBtn(4);

/* 五枚按钮的命中区：触摸层用它判断「这点在按钮上，不算水面」 */
var DOCK_RECTS = [STORE_BTN, BAG_BTN, POND_BTN, CODEX_BTN, SYS_BTN];

function inDock(x, y) {
    for (var i = 0; i < DOCK_RECTS.length; i++) {
        if (U.inRect(x, y, DOCK_RECTS[i])) return true;
    }
    return false;
}

/* 胶囊标签：贴着自己那格居中，底边和槽位底边对齐 */
function dockPillRect(i) {
    var r = DOCK_RECTS[i] || STORE_BTN;
    return {
        x: r.x + (r.w - DOCK_PILL_W) / 2,
        y: r.y + r.h - DOCK_PILL_H,
        w: DOCK_PILL_W,
        h: DOCK_PILL_H
    };
}

/* ---- 选中鱼的信息卡（M14）----
 * 点鱼不再往头顶弹价签，改成屏幕底部一张固定卡：
 *   名字 · 阶段 · 性别 → 成长 / 饱食 / 卖价 → 词条胶囊 → 「捞出」按钮
 * 金鲤鱼带龙鳞时，按钮行多出第二枚「吞噬」。
 *
 * 为什么固定在屏幕坐标而不是跟着鱼：
 *   放大 2× 后鱼可能游到屏幕边缘，头顶价签会被裁掉；
 *   而且信息卡是「操作面板」，不是鱼的附属物，放底部更好点。
 * 卡片底边压在悬浮按钮上方 14px，两者不重叠。 */
var FISH_CARD_H = 156;

function fishCardRect() {
    var w = Math.min(W - 28, 364);
    return { x: (W - w) / 2, y: C.BTN_Y - 14 - FISH_CARD_H, w: w, h: FISH_CARD_H };
}

/* 卡片底部按钮：0 = 捞出，1 = 吞噬（只有金鲤鱼带龙鳞时才有） */
function fishCardBtnRect(k, count) {
    var c = fishCardRect();
    var n = Math.max(1, count || 1);
    var gap = 10;
    var bw = (c.w - 28 - gap * (n - 1)) / n;
    return { x: c.x + 14 + k * (bw + gap), y: c.y + c.h - 52, w: bw, h: 40 };
}

/* ---- 缸内缩放（M10 去按钮）----
 * 原来贴在玻璃右上角的 +/− 两枚按钮已经删掉：
 * 玻璃整块都还给鱼，缩放只靠双指捏合、平移只靠单指滑动、双击还原。
 * 这里只剩一个只读的倍率角标位置，用来在放大时提示当前倍率。 */
var ZOOM_BADGE = { x: W - 60, y: C.TANK_TOP + 10, w: 46, h: 20 };

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

/* ---- M15 仓库页（第 5 个页签）----
 * 三个子页（鱼卵 / 道具 / 鱼）共用一套版式，照参考游戏改的：
 *
 *   子页签行（右端钉着「繁育」）
 *   容量行  鱼篓 12/60        [批量] [全选]
 *   ┌──┬──┬──┬──┬──┐  ← 5 列网格，格子带稀有度描边
 *   ├──┼──┼──┼──┼──┤
 *   └──┴──┴──┴──┴──┘
 *   详情卡：图标 + 名称 + 单价 + 一行说明 + 底部两枚按钮
 *
 * 行数跟着屏高走：大屏 4 行 20 格，小屏退到 3 行 / 2 行，
 * 格子高度也随之压缩，不会把详情卡挤出屏幕。
 * 以前是 3×3 只有 9 格，鱼一多就得翻。
 */
var BAG_TOP = 92;                  /* 子页签行（相对面板顶部） */
var BAG_SUB_H = 28;
var BAG_SUB_GAP = 7;
var BAG_BREED_W = 60;              /* 右侧「繁育」胶囊 */
var BAG_SUB_W = (W - 36 - BAG_BREED_W - 10 - BAG_SUB_GAP * 2) / 3;

var BAG_CONTENT_TOP = BAG_TOP + BAG_SUB_H + 12;

/* 容量行（「鱼篓 12/60」+ 批量 / 全选两枚小胶囊） */
var BAG_HDR_H = 24;
var BAG_HDR_Y = BAG_CONTENT_TOP;

var BAG_COLS = 5;
var BAG_GAP = 7;
var BAG_CELL_W = (W - 32 - BAG_GAP * (BAG_COLS - 1)) / BAG_COLS;
var BAG_GRID_Y = BAG_HDR_Y + BAG_HDR_H + 8;

/* 底部详情卡：图标、名称、单价、说明、两枚按钮 */
var BAG_DETAIL_H = 152;
var BAG_DETAIL_BTN_H = 40;

/* 网格能占多高 = 面板最多能多高 − 上下固定部分 */
var BAG_PANEL_MAX = Math.min(H * 0.92, H - 20);
var BAG_FIXED_H = BAG_GRID_Y + 12 + BAG_DETAIL_H + 22;
var BAG_ROOM = Math.max(96, BAG_PANEL_MAX - BAG_FIXED_H);

var BAG_ROWS = 4;
while (BAG_ROWS > 2 &&
    (BAG_ROOM - (BAG_ROWS - 1) * BAG_GAP) / BAG_ROWS < 62) {
    BAG_ROWS -= 1;
}

/* 格子别太瘦长：窄屏按宽度的 1.28 倍封顶 */
var BAG_CELL_H = Math.min(84, BAG_CELL_W * 1.28,
    (BAG_ROOM - (BAG_ROWS - 1) * BAG_GAP) / BAG_ROWS);
BAG_CELL_H = Math.max(52, BAG_CELL_H);

var BAG_GRID_H = BAG_ROWS * BAG_CELL_H + (BAG_ROWS - 1) * BAG_GAP;
var BAG_GRID_CAP = BAG_COLS * BAG_ROWS;
var BAG_DETAIL_Y = BAG_GRID_Y + BAG_GRID_H + 12;

/* 容量行右侧两枚小胶囊 */
var BAG_CHIP_W = 54;
var BAG_CHIP_H = 22;
var BAG_CHIP_GAP = 8;

var TAB_H = 30;
/* 5 个页签按屏宽等分：原来写死 64，320 宽的老机型会把「仓库」顶出屏幕 */
var TAB_W = (W - 36 - 8 * 4) / 5;

/* 面板底部留白：要容得下底部那行提示文字 + 安全区，
 * 留小了提示会直接压在最后一行卡片上 */
var BOTTOM_PAD = 72;

var itemsBottom = ITEM_TOP + cfg.items.length * (ITEM_H + ITEM_GAP) - ITEM_GAP;
var eggsBottom = EGG_TOP + EGG_ROWS * (EGG_H + EGG_GAP) - EGG_GAP;
var codexBottom = CODEX_TOP + CODEX_ROWS * (CODEX_CARD_H + CODEX_GAP) - CODEX_GAP;
var pondBottom = POND_CAST_Y + POND_CAST_H;
var bagBottom = BAG_DETAIL_Y + BAG_DETAIL_H;

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

/* ---- 仓库页：5 列网格（三个子页共用）---- */
function bagCellRect(i, ease) {
    var top = sheetTop(ease);
    var col = i % BAG_COLS;
    var row = Math.floor(i / BAG_COLS);
    return {
        x: 16 + col * (BAG_CELL_W + BAG_GAP),
        y: top + BAG_GRID_Y + row * (BAG_CELL_H + BAG_GAP),
        w: BAG_CELL_W,
        h: BAG_CELL_H
    };
}

/* ---- 仓库页：子页签（0=鱼卵 1=道具 2=鱼）---- */
function bagTabRect(i, ease) {
    var top = sheetTop(ease);
    return {
        x: 18 + i * (BAG_SUB_W + BAG_SUB_GAP),
        y: top + BAG_TOP,
        w: BAG_SUB_W,
        h: BAG_SUB_H
    };
}

/* 容量行右侧两枚小胶囊：0 = 批量开关，1 = 全选 / 清空 */
function bagChipRect(k, ease) {
    var top = sheetTop(ease);
    var right = W - 16;
    return {
        x: right - (2 - k) * (BAG_CHIP_W + BAG_CHIP_GAP),
        y: top + BAG_HDR_Y + (BAG_HDR_H - BAG_CHIP_H) / 2,
        w: BAG_CHIP_W,
        h: BAG_CHIP_H
    };
}

/* ---- 仓库页：底部详情卡 ---- */
function bagDetailRect(ease) {
    var top = sheetTop(ease);
    return { x: 16, y: top + BAG_DETAIL_Y, w: W - 32, h: BAG_DETAIL_H };
}

/* 详情卡底部按钮：0..count-1 平分 */
function bagDetailBtnRect(k, count, ease) {
    var c = bagDetailRect(ease);
    var n = Math.max(1, count || 1);
    var gap = 10;
    var bw = (c.w - 28 - gap * (n - 1)) / n;
    return {
        x: c.x + 14 + k * (bw + gap),
        y: c.y + c.h - BAG_DETAIL_BTN_H - 12,
        w: bw,
        h: BAG_DETAIL_BTN_H
    };
}

/* 详情卡左侧的大图标框 */
function bagDetailIconRect(ease) {
    var c = bagDetailRect(ease);
    return { x: c.x + 14, y: c.y + 14, w: 64, h: 64 };
}

/* ---- 系统弹层（清档 / 关于）----
 * 底栏的「系统」按钮打开它。尺寸跟离线弹窗保持同一套比例，
 * 两个按钮并排放在卡片底部，左边危险操作、右边关闭。 */
var SYS_CARD_W = Math.min(W - 56, 320);
var SYS_CARD_H = 290;

function sysCardRect() {
    return { x: (W - SYS_CARD_W) / 2, y: H * 0.24, w: SYS_CARD_W, h: SYS_CARD_H };
}

function sysBtnRect(k) {
    var c = sysCardRect();
    var gap = 10;
    var bw = (c.w - 44 - gap) / 2;
    return { x: c.x + 22 + k * (bw + gap), y: c.y + c.h - 62, w: bw, h: 44 };
}

/* ---- M12 繁育浮层 ----
 * 不进页签（页签已经 5 个、宽度见底），做成盖在仓库页上的全屏卡片。
 * 入口是仓库页标题行右侧的「繁育」小按钮。
 *
 * 卡内从上到下：培育栏位 ×6 → 亲本槽 ×2 → 消耗预览 → 繁育按钮 → 一行提示。
 * 所有纵坐标都相对卡片顶部，卡片整体居中，小屏也不会顶到刘海。 */
var BREED_CARD_W = Math.min(W - 24, 366);
var BREED_CARD_H = Math.min(H * 0.9, 432);

function breedCardRect() {
    var h = BREED_CARD_H;
    var y = (H - h) / 2;
    if (y < TOP + 6) y = TOP + 6;
    return { x: (W - BREED_CARD_W) / 2, y: y, w: BREED_CARD_W, h: h };
}

function breedCloseRect() {
    var c = breedCardRect();
    return { x: c.x + c.w - 40, y: c.y + 10, w: 30, h: 30 };
}

/* 卡内纵坐标（相对卡片顶部）
 * M16：删掉「培育缸」，原来那条 3 格的孵化槽扩成 6 个「培育栏位」（3×2），
 * 卡片也从 566 缩到 432 —— 少了 6 格培育缸，不需要那么高了。 */
var BR_SLOT_LABEL_Y = 46;
var BR_SLOT_Y = 58;
var BR_SLOT_H = 68;
var BR_SLOT_GAP = 8;
var BR_PARENT_Y = 212;
var BR_PARENT_H = 92;
var BR_PREVIEW_Y = 316;
var BR_PREVIEW_H = 36;
var BR_GO_Y = 358;
var BR_GO_H = 46;
var BR_HINT_Y = 418;

function hatchSlotRect(i) {
    var c = breedCardRect();
    var cols = 3;
    var gap = BR_SLOT_GAP;
    var cw = (c.w - 24 - gap * 2) / 3;
    var col = i % cols;
    var row = Math.floor(i / cols);
    return {
        x: c.x + 12 + col * (cw + gap),
        y: c.y + BR_SLOT_Y + row * (BR_SLOT_H + gap),
        w: cw,
        h: BR_SLOT_H
    };
}

function breedParentRect(k) {
    var c = breedCardRect();
    var gap = 10;
    var cw = (c.w - 24 - gap) / 2;
    return { x: c.x + 12 + k * (cw + gap), y: c.y + BR_PARENT_Y, w: cw, h: BR_PARENT_H };
}

function breedPreviewRect() {
    var c = breedCardRect();
    return { x: c.x + 12, y: c.y + BR_PREVIEW_Y, w: c.w - 24, h: BR_PREVIEW_H };
}

function breedGoRect() {
    var c = breedCardRect();
    return { x: c.x + 12, y: c.y + BR_GO_Y, w: c.w - 24, h: BR_GO_H };
}

/* 动作按钮：默认贴在「选鱼卡」底部，也可以传入别的卡片矩形复用 */
function pickBtnRect(k, card) {
    var c = card || pickCardRect();
    var gap = 10;
    var bw = (c.w - 32 - gap) / 2;
    return { x: c.x + 16 + k * (bw + gap), y: c.y + c.h - 56, w: bw, h: 42 };
}

/* 选亲本的浮层：盖在繁育卡之上的一列鱼，点一条就选中。
 * 高度按候选条数自适应 —— 只有 2 条可选时不该摆一张 420 高的大空卡。 */
function pickCardRect(n) {
    var c = breedCardRect();
    var rows = Math.max(1, Math.min(6, n || 6));
    var h = Math.min(c.h - 40, 138 + rows * 52);
    return { x: c.x + 10, y: c.y + (c.h - h) / 2, w: c.w - 20, h: h };
}

function pickRowRect(i) {    var c = pickCardRect();
    return { x: c.x + 10, y: c.y + 46 + i * 52, w: c.w - 20, h: 46 };
}

/* 仓库页：繁育入口固定在子页签行最右，三个子页都能点 */
function bagBreedRect(ease) {
    var top = sheetTop(ease);
    return {
        x: W - 18 - BAG_BREED_W,
        y: top + BAG_TOP,
        w: BAG_BREED_W,
        h: BAG_SUB_H
    };
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
    BTN_R: BTN_R,
    DOCK_PILL_W: DOCK_PILL_W,
    DOCK_PILL_H: DOCK_PILL_H,
    DOCK_RECTS: DOCK_RECTS,
    inDock: inDock,
    dockPillRect: dockPillRect,
    STORE_BTN: STORE_BTN,
    BAG_BTN: BAG_BTN,
    POND_BTN: POND_BTN,
    CODEX_BTN: CODEX_BTN,
    SYS_BTN: SYS_BTN,
    SYS_CARD_W: SYS_CARD_W,
    SYS_CARD_H: SYS_CARD_H,
    sysCardRect: sysCardRect,
    sysBtnRect: sysBtnRect,
    ZOOM_BADGE: ZOOM_BADGE,
    FISH_CARD_H: FISH_CARD_H,
    fishCardRect: fishCardRect,
    fishCardBtnRect: fishCardBtnRect,
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
    BAG_SUB_H: BAG_SUB_H,
    BAG_SUB_W: BAG_SUB_W,
    BAG_CONTENT_TOP: BAG_CONTENT_TOP,
    BAG_HDR_Y: BAG_HDR_Y,
    BAG_HDR_H: BAG_HDR_H,
    BAG_COLS: BAG_COLS,
    BAG_ROWS: BAG_ROWS,
    BAG_CELL_W: BAG_CELL_W,
    BAG_CELL_H: BAG_CELL_H,
    BAG_GAP: BAG_GAP,
    BAG_GRID_Y: BAG_GRID_Y,
    BAG_GRID_CAP: BAG_GRID_CAP,
    BAG_DETAIL_Y: BAG_DETAIL_Y,
    BAG_DETAIL_H: BAG_DETAIL_H,
    BAG_DETAIL_BTN_H: BAG_DETAIL_BTN_H,
    bagTabRect: bagTabRect,
    bagCellRect: bagCellRect,
    bagChipRect: bagChipRect,
    BAG_CHIP_W: BAG_CHIP_W,
    BAG_CHIP_H: BAG_CHIP_H,
    bagDetailRect: bagDetailRect,
    bagDetailBtnRect: bagDetailBtnRect,
    bagDetailIconRect: bagDetailIconRect,
    closeRect: closeRect,
    coinPillRect: coinPillRect,

    /* M12 繁育 */
    BREED_CARD_W: BREED_CARD_W,
    BREED_CARD_H: BREED_CARD_H,
    BR_SLOT_LABEL_Y: BR_SLOT_LABEL_Y,
    BR_SLOT_Y: BR_SLOT_Y,
    BR_SLOT_H: BR_SLOT_H,
    BR_HINT_Y: BR_HINT_Y,
    breedCardRect: breedCardRect,
    breedCloseRect: breedCloseRect,
    hatchSlotRect: hatchSlotRect,
    breedParentRect: breedParentRect,
    breedPreviewRect: breedPreviewRect,
    breedGoRect: breedGoRect,
    pickCardRect: pickCardRect,
    pickRowRect: pickRowRect,
    pickBtnRect: pickBtnRect,
    bagBreedRect: bagBreedRect,
    BAG_BREED_W: BAG_BREED_W
};
