/* ============================================================
 * ui/view.js · 鱼缸缩放 / 滑动
 *
 * 只改变「看」的方式，不改鱼的坐标、成长和碰撞：
 *   screen = center + (world - center) * zoom + offset
 *   world  = center + (screen - center - offset) / zoom
 *
 * M10 起不再有 +/− 按钮：
 *   双指捏合  → 连续缩放（1× ~ 2×）
 *   单指滑动  → 平移，抬手带惯性
 *   双击      → 还原 1×（见 ui/touch.js）
 *
 * 变换只作用在玻璃里的那一层（水、水草、鱼、飘字、选中圈），
 * 顶部信息行和底部按钮永远保持原尺寸 —— 它们不是缸里的东西。
 * ============================================================ */

var C = require('../render/canvas.js');

var MIN_ZOOM = 1;
var MAX_ZOOM = 2;

/* 惯性：抬手时的速度（px/s），按指数衰减；低于阈值直接停 */
var FRICTION = 6.2;
var MIN_SPEED = 6;

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

/* 滑动惯性速度，只存在于内存，不进存档 */
var vel = { x: 0, y: 0 };

/* 浏览器自动化读状态用；小游戏里 window 不存在，这行自然跳过 */
if (typeof window !== 'undefined') window.__zoomState = state;

function clamp() {
    if (!(state.zoom > 0) || !isFinite(state.zoom)) state.zoom = 1;
    if (state.zoom < MIN_ZOOM) state.zoom = MIN_ZOOM;
    if (state.zoom > MAX_ZOOM) state.zoom = MAX_ZOOM;

    /* 放大后可视范围变小，偏移量最多到「多出来的那一半」，
     * 保证玻璃里不会出现没水的空白边。
     * 贴边时把该方向的速度清零，否则会一直撞边「粘住」。 */
    var mx = GLASS_W * (1 - 1 / state.zoom) / 2;
    var my = GLASS_H * (1 - 1 / state.zoom) / 2;
    if (state.x > mx) { state.x = mx; if (vel.x > 0) vel.x = 0; }
    if (state.x < -mx) { state.x = -mx; if (vel.x < 0) vel.x = 0; }
    if (state.y > my) { state.y = my; if (vel.y > 0) vel.y = 0; }
    if (state.y < -my) { state.y = -my; if (vel.y < 0) vel.y = 0; }
}

function setZoom(z) {
    state.zoom = z;
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

/* 直接平移（拖动 / 双指移动都走这里），不产生惯性 */
function pan(dx, dy) {
    if (!(dx === dx) || !(dy === dy)) return;
    state.x += dx;
    state.y += dy;
    clamp();
}

/* 抬手：把最后一帧的速度交给惯性。速度单位是 px/s */
function fling(vx, vy) {
    if (!(vx === vx) || !(vy === vy)) { vel.x = vel.y = 0; return; }
    vel.x = vx;
    vel.y = vy;
    /* 1× 时无处可移，直接清空，省掉无意义的抖动 */
    if (state.zoom <= 1.001) vel.x = vel.y = 0;
}

function stop() {
    vel.x = vel.y = 0;
}

/* 每帧推进惯性，由 render/index.js 的 stepSession 调用 */
function update(dt) {
    if (!(dt > 0)) return;
    if (!vel.x && !vel.y) return;

    state.x += vel.x * dt;
    state.y += vel.y * dt;

    /* 指数衰减：一秒后只剩 e^-6.2 ≈ 0.2% */
    var k = Math.exp(-FRICTION * dt);
    vel.x *= k;
    vel.y *= k;

    if (Math.abs(vel.x) < MIN_SPEED) vel.x = 0;
    if (Math.abs(vel.y) < MIN_SPEED) vel.y = 0;
    clamp();
}

function reset() {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
    stop();
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

/* 是否处于「放大后可滑动」的状态（给提示文案用） */
function pannable() {
    return state.zoom > 1.001;
}

module.exports = {
    state: state,
    vel: vel,
    setZoom: setZoom,
    pinch: pinch,
    pan: pan,
    fling: fling,
    stop: stop,
    update: update,
    reset: reset,
    inGlass: inGlass,
    apply: apply,
    toWorld: toWorld,
    label: label,
    pannable: pannable,
    glass: { x0: X0, x1: X1, y0: Y0, y1: Y1, cx: CX, cy: CY }
};
