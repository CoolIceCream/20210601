/* ============================================================
 * render/index.js · 渲染总入口
 *
 * 按固定顺序铺一层：场景 → 飘字/提示 → 暗角 → 常驻界面
 * → 商店 → 弹窗 → 调试面板 → 轻提示。
 * 只在 draw() 里花钱，不在别处偷偷画东西。
 * ============================================================ */

var C = require('./canvas.js');
var decorLib = require('./decor.js');
var scene = require('./scene.js');
var frame = require('./frame.js');
var hud = require('./hud.js');
var sheet = require('./sheet.js');
var sell = require('./sell.js');
var modal = require('./modal.js');
var sysmenu = require('./sysmenu.js');
var breedRender = require('./breed.js');
var debugPanel = require('../ui/debug-panel.js');
var diag = require('../ui/diag.js');
var view = require('../ui/view.js');

var decor = null;

function init(state) {
    decor = decorLib.build(C.W, C.H, C.ground, state.corals, C.TANK_TOP);
}

/* 珊瑚数量变化时重建（购买后） */
function syncCorals(state) {
    if (decor.corals.length !== state.corals) {
        decor.corals = decorLib.buildCorals(C.W, state.corals);
    }
}

/* 面板开合动画放渲染层，逻辑层不管这种纯视觉过渡 */
function stepSession(session, dt) {
    var target = session.sheetOpen ? 1 : 0;
    session.sheetEase += (target - session.sheetEase) * Math.min(1, dt * 14);
    if (Math.abs(session.sheetEase - target) < 0.002) session.sheetEase = target;

    /* 滑动惯性：抬手后的余速在这里衰减，和面板动画同一帧推进 */
    diag.guard('view', function () { view.update(dt); });

    if (session.toast) {
        session.toast.t -= dt;
        if (session.toast.t <= 0) session.toast = null;
    }

    /* 清档「上膛」只保留 3 秒，超时自动解除，避免误点 */
    if (session.sysArmed > 0) {
        session.sysArmed = Math.max(0, session.sysArmed - dt);
    }
}

/* 每一层单独兜住异常：
 * 某层崩了（比如某台机型缺某个 Canvas API）只丢这一层，
 * 后面的血条/按钮/弹窗照常画，玩家不会看到一个死界面。 */
function draw(state, session, dt) {
    if (!decor) diag.guard('init', function () { init(state); });

    diag.guard('decor', function () {
        decorLib.updateMotes(decor, dt, C.W, C.H, C.TANK_TOP);
        syncCorals(state);
    });

    var ctx = C.ctx;
    /* 先把缸的底色铺满，水再画在玻璃里 */
    diag.guard('framebase', function () { frame.base(ctx); });
    /* 缸里的东西统一在玻璃范围内缩放：水、鱼、飘字、选中圈。
     * 1x 时也走同一条路径，只是 transform 是恒等变换，便于测试覆盖。 */
    diag.guard('scene', function () {
        ctx.save();
        ctx.beginPath();
        ctx.rect(C.FRAME_X, C.TANK_TOP, C.W - C.FRAME_X * 2, C.TANK_BOTTOM - C.TANK_TOP);
        ctx.clip();
        view.apply(ctx);
        scene.draw(ctx, state, decor);
        hud.drawFloaters(ctx, state);
        sell.drawSelection(ctx, state);
        ctx.restore();
    });
    /* 缸盖 / 底座 / 玻璃压条：压在水面之上，把画面框成一只鱼缸 */
    diag.guard('frame', function () { frame.draw(ctx); });
    diag.guard('zoom', function () { hud.drawZoom(ctx); });
    diag.guard('hint', function () { hud.drawHint(ctx, state); });
    diag.guard('vignette', function () { hud.drawVignette(ctx); });
    diag.guard('topbar', function () { hud.drawTopBar(ctx, state); });
    diag.guard('tanktabs', function () { hud.drawTankTabs(ctx, state); });
    diag.guard('buttons', function () { hud.drawButtons(ctx); });
    /* 选中鱼的信息卡：屏幕坐标，压在按钮之上、面板之下。
     * 面板一开始升起（even 一点）就收起来，避免和半透明的面板叠在一起。 */
    diag.guard('fishcard', function () {
        if (session.sheetEase > 0.02) return;
        sell.drawCard(ctx, state);
    });

    diag.guard('sheet', function () { sheet.draw(ctx, state, session); });
    diag.guard('debug', function () { debugPanel.draw(ctx, session, state); });
    /* 弹窗画在调试面板之上：它需要阻塞操作，不能被工具面板挡住 */
    diag.guard('modal', function () { modal.draw(ctx, session.modal); });
    /* 繁育浮层盖在商店面板之上：它是「进去做一件事」的工作台 */
    diag.guard('breed', function () { breedRender.draw(ctx, state, session); });
    /* 系统弹层排在离线弹窗之后：两者同时出现时，系统层在最上面 */
    diag.guard('sysmenu', function () { sysmenu.draw(ctx, state, session); });
    diag.guard('toast', function () { hud.drawToast(ctx, session); });

    /* 诊断条永远在最上面：上面的层全崩了，它也得能被看见 */
    diag.draw(ctx, state, session);
}

module.exports = {
    init: init,
    draw: draw,
    stepSession: stepSession
};
