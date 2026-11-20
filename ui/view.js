/* ============================================================
 * ui/view.js · 鱼缸缩放 / 平移
 *
 * 只改变「看」的方式，不改鱼的坐标、成长和碰撞：
 *   screen = center + (world - center) * zoom + offset
 *   world  = center + (screen - center - offset) / zoom
 *
 * 变换只作用在玻璃里的那一层（水、水草、鱼、飘字、选中圈），
 * 顶部信息行和底部按钮永远保持原尺寸 —— 它们不是缸里的东西。
 * ============================================================ */

var C = require('../render/canvas.js');

var LEVELS = [1, 1.5, 2];
var MIN_ZOOM = 1;
var MAX_ZOOM = 2;

var X0 = C.FRAME_X;
var X1 = C.W - C.FRAME_X;
var Y0 = C.TANK_TOP;
var Y1 = C.TANK_BOTTOM;
var CX = (X0 + X1) / 2;
var CY = (Y0 + Y1) / 2;
var GLASS_W = X1 - X0;
var GLASS_H = Y1 - Y0;

var state = {
    zoom: 1,
    x: 0,
    y: 0
};

/* 浏览器自动化读状态用；小游戏里 window 不存在，这行自然跳过 */
if (typeof window !== 'undefined') window.__zoomState = state;

function clamp() {
    if (!(state.zoom > 0) || !isFinite(state.zoom)) state.zoom = 1;
    if (state.zoom < MIN_ZOOM) state.zoom = MIN_ZOOM;
    if (state.zoom > MAX_ZOOM) state.zoom = MAX_ZOOM;

    /* 放大后可视范围变小，偏移量最多到「多出来的那一半」，
     * 保证玻璃里不会出现没水的空白边。 */
    var mx = GLASS_W * (1 - 1 / state.zoom) / 2;
    var my = GLASS_H * (1 - 1 / state.zoom) / 2;
    if (state.x > mx) state.x = mx;
    if (state.x < -mx) state.x = -mx;
    if (state.y > my) state.y = my;
    if (state.y < -my) state.y = -my;
}

function setZoom(z) {
    state.zoom = z;
    clamp();
    return state.zoom;
}

function levelIndex() {
    var best = 0;
    var bestD = Infinity;
    for (var i = 0; i < LEVELS.length; i++) {
        var d = Math.abs(LEVELS[i] - state.zoom);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

/* 按钮：在 1x / 1.5x / 2x 之间跳 */
function step(dir) {
    var i = levelIndex();
    var next = i + dir;
    if (next < 0) next = 0;
    if (next >= LEVELS.length) next = LEVELS.length - 1;
    state.zoom = LEVELS[next];
    if (next === 0) { state.x = 0; state.y = 0; }
    clamp();
    return state.zoom;
}

/* 双指捏合：连续缩放，不受档位限制 */
function pinch(ratio) {
    if (!(ratio > 0) || !isFinite(ratio)) return state.zoom;
    state.zoom *= ratio;
    clamp();
    return state.zoom;
}

function pan(dx, dy) {
    if (!(dx === dx) || !(dy === dy)) return;
    state.x += dx;
    state.y += dy;
    clamp();
}

function reset() {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
}

function inGlass(x, y) {
    return x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
}

/* 画布变换：调用方先 clip 到玻璃，再调这个 */
function apply(ctx) {
    if (!ctx || !ctx.save) return;
    ctx.translate(CX + state.x, CY + state.y);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-CX, -CY);
}

function toWorld(x, y) {
    return {
        x: CX + (x - CX - state.x) / state.zoom,
        y: CY + (y - CY - state.y) / state.zoom
    };
}

function label() {
    return state.zoom === 1 ? '1×' : (Math.round(state.zoom * 100) / 100) + '×';
}

module.exports = {
    state: state,
    LEVELS: LEVELS,
    setZoom: setZoom,
    step: step,
    pinch: pinch,
    pan: pan,
    reset: reset,
    inGlass: inGlass,
    apply: apply,
    toWorld: toWorld,
    label: label,
    glass: { x0: X0, x1: X1, y0: Y0, y1: Y1, cx: CX, cy: CY }
};
