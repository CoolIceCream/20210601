/* ============================================================
 * ui/touch.js · 触摸分发
 *
 * 优先级：调试面板 > 弹窗 > 商店 > 底部按钮 > 撒食。
 * 只做路由，具体动作调 core/sim.js。
 * ============================================================ */

var C = require('../render/canvas.js');
var U = require('../render/util.js');
var L = require('./layout.js');
var modalRender = require('../render/modal.js');
var sellRender = require('../render/sell.js');
var debugPanel = require('./debug-panel.js');
var shop = require('../core/shop.js');
var pondCore = require('../core/pond.js');
var storage = require('../core/storage.js');
var fishLib = require('../core/fish.js');
var wallet = require('../core/wallet.js');
var platform = require('../platform.js');
var cfg = require('../config/index.js');
var view = require('./view.js');

/* 点到了哪条鱼：命中半径比视觉尺寸小一圈，避免点水面撒食时误选 */
function pickFish(state, x, y) {
    var act = state.activeTank || 0;
    var best = null;
    var bestD = 0;
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        if ((f.tank || 0) !== act) continue;
        var s = fishLib.sizeOf(f);
        var dx = x - f.x;
        var dy = y - f.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        /* 命中半径比视觉尺寸小一圈，避免点水面撒食时误选；
         * 鱼整体缩小一号后把系数从 0.62 提到 0.72，
         * 手指的实际可点面积基本保持不变。 */
        if (d > s * 0.72) continue;
        if (!best || d < bestD) {
            best = f;
            bestD = d;
        }
    }
    return best;
}

/**
 * 选中鱼。返回 true 表示这次点击已经被消费掉。
 * 点空白处返回 false，让后面的撒食逻辑继续跑。
 * 成交在底部那格「卖掉」按钮里（见下面的按钮区）。
 */
function handleSell(x, y, env) {
    var state = env.state;

    /* 底部那排按钮不是水面，先整体放行。
     * 少了这一段会出一个很隐蔽的 bug：点「卖掉」时既没点中鱼，
     * 下面的「点空白 = 取消选中」就把选中状态清掉了，
     * 于是按钮永远拿不到那条鱼，只会提示「先点一条鱼」。
     * 命中区永远从 ui/layout.js 取，别在这里手抄坐标。 */
    if (U.inRect(x, y, L.FEED_BTN) || U.inRect(x, y, L.SELL_BTN) || U.inRect(x, y, L.SHOP_BTN)) {
        return false;
    }

    var sel = sellRender.selectedOf(state);

    /* 命中要先把屏幕坐标换回鱼缸坐标：放大后鱼在屏幕上挪了位置，
     * 但它的 x/y 仍然是原始缸内坐标。 */
    var w = view.toWorld(x, y);
    var hit = pickFish(state, w.x, w.y);
    if (hit) {
        /* 再点同一条 = 取消选中 */
        state.view.selFish = state.view.selFish === hit.id ? '' : hit.id;
        return true;
    }

    /* 点水面空白：取消选中，并让撒食继续 */
    if (sel) state.view.selFish = '';
    return false;
}

function handleSheet(x, y, env) {
    var session = env.session;
    var state = env.state;
    var ease = session.sheetEase;

    /* 图鉴详情浮层：吞掉面板内的一切点击，直到关闭 */
    if (session.codexDetail != null) {
        var d = L.codexDetailRect(ease);
        if (U.inRect(x, y, L.codexDetailClose(d))) {
            session.codexDetail = null;
            return;
        }
        /* 点卡片外面也关掉；点卡片本体什么都不做 */
        if (!U.inRect(x, y, d)) session.codexDetail = null;
        return;
    }

    if (U.inRect(x, y, L.closeRect(ease))) {
        session.sheetOpen = false;
        return;
    }

    if (y < L.sheetTop(ease)) {
        session.sheetOpen = false;
        return;
    }

    /* 切换页签：商店 / 鱼卵 / 图鉴 / 鱼塘 / 仓库 */
    for (var t = 0; t < 5; t++) {
        if (U.inRect(x, y, L.tabRect(t, ease))) {
            session.sheetTab = t;
            session.codexDetail = null;
            session.bagSel = '';
            return;
        }
    }

    /* 鱼塘页：抛竿 */
    if (session.sheetTab === 3) {
        if (U.inRect(x, y, L.pondCastRect(ease))) {
            /* 连点冷却：cd 内直接吞掉，避免一划手指连钓十次 */
            var cd = ((cfg.pond.castCooldown || 0.5) * 1000);
            var now = platform.now();
            if (session.pondTapAt && now - session.pondTapAt < cd) return;
            session.pondTapAt = now;

            var cr = pondCore.cast(state);
            if (!cr.ok) {
                if (cr.reason === 'no_bait') session.showToast('鱼饵不足，去商店买');
                else session.showToast('这个鱼塘暂时没鱼可钓');
                return;
            }
            if (cr.type === 'oyster') {
                session.showToast('钓到珍珠贝！去仓库打破');
            } else {
                session.showToast('钓到 ' + cr.species.name + ' · ' + Math.round(cr.fish.growth) + '%');
            }
            return;
        }
        return;
    }

    /* 仓库页：道具行 → 操作栏 → 鱼格 */
    if (session.sheetTab === 4) {
        var bagSt = pondCore.statusOf(state);

        if (U.inRect(x, y, L.bagItemRect(0, ease))) {
            var br = pondCore.breakOyster(state);
            if (!br.ok) session.showToast('没有珍珠贝');
            else session.showToast(br.pearl ? '开出珍珠！' : '空壳，什么也没有');
            return;
        }
        if (U.inRect(x, y, L.bagItemRect(1, ease))) {
            var pr = pondCore.sellPearl(state);
            if (!pr.ok) session.showToast('没有珍珠');
            else session.showToast('珍珠卖出 +' + wallet.format(pr.price));
            return;
        }
        if (U.inRect(x, y, L.bagItemRect(2, ease))) {
            session.showToast('鱼饵 ×' + bagSt.bait + ' · 去商店补充');
            return;
        }

        if (session.bagSel) {
            if (U.inRect(x, y, L.bagActionRect(0, ease))) {
                var mv = pondCore.moveToTank(state, session.bagSel);
                if (!mv.ok) {
                    session.showToast(mv.reason === 'full' ? '鱼缸满了，先清出鱼位' : '这条鱼已经不在了');
                } else {
                    session.bagSel = '';
                    session.showToast('已放进鱼缸');
                }
                return;
            }
            if (U.inRect(x, y, L.bagActionRect(1, ease))) {
                var sc = pondCore.sellCaught(state, session.bagSel);
                if (!sc.ok) session.showToast('这条鱼已经不在了');
                else {
                    session.bagSel = '';
                    session.showToast('卖掉 +' + wallet.format(sc.price));
                }
                return;
            }
        }

        var cells = pondCore.caughtList(state);
        var maxShow = L.BAG_COLS * L.BAG_ROWS;
        for (var ci = 0; ci < cells.length && ci < maxShow; ci++) {
            if (U.inRect(x, y, L.bagFishRect(ci, ease))) {
                session.bagSel = session.bagSel === cells[ci].fish.id ? '' : cells[ci].fish.id;
                return;
            }
        }
        return;
    }

    /* 图鉴页：点任意格子看详情 */
    if (session.sheetTab === 2) {
        var entries = require('../core/codex.js').list(state);
        for (var c = 0; c < entries.length; c++) {
            if (U.inRect(x, y, L.codexRect(c, ease))) {
                session.codexDetail = c;
                return;
            }
        }
        return;
    }

    /* 鱼卵页：只卖三档品质，整张卡片都算买（点哪都是抽） */
    if (session.sheetTab === 1) {
        var eggs = shop.eggList(state);
        for (var i = 0; i < eggs.length; i++) {
            if (!U.inRect(x, y, L.eggRect(i, ease))) continue;
            var st = eggs[i];
            if (st.locked) {
                session.showToast('再养 ' + Math.max(1, st.need - state.fish.length) + ' 条鱼解锁');
                return;
            }
            state.view.vp = C.viewport;
            var re = env.sim.buyEgg(state, st.rarity);
            if (!re.ok) {
                if (re.reason === 'poor') session.showToast('鱼币不够');
                else if (re.reason === 'full') session.showToast('鱼位满了，去升仓库扩位');
            }
            return;
        }
        return;
    }

    /* 道具页：只在价格按钮上响应，避免误触整行 */
    var list = shop.list(state);
    for (var j = 0; j < list.length; j++) {
        if (!U.inRect(x, y, L.buyRect(j, ease))) continue;

        state.view.vp = C.viewport;
        var r = env.sim.buy(state, list[j].item.id);
        if (!r.ok) {
            if (r.reason === 'poor') session.showToast('鱼币不够');
            else if (r.reason === 'maxed') session.showToast('已经是最高等级');
            else if (r.reason === 'owned') session.showToast('已经拥有了');
            else if (r.reason === 'full') session.showToast('鱼位满了，去升仓库扩位');
        }
        return;
    }
}

function tap(x, y, env) {
    var session = env.session;
    var state = env.state;

    /* 1. 弹窗：阻塞一切，优先于调试面板 */
    if (session.modal) {
        if (U.inRect(x, y, modalRender.btnRect(session.modal))) {
            session.modal = null;
            env.saveNow();
        }
        return;
    }

    /* 2. 调试面板 */
    if (debugPanel.tap(x, y, session, env)) return;

    /* 3. 连点金币胶囊开调试面板 */
    debugPanel.registerTap(x, y, session, L);

    /* 4. 缸内缩放按钮：点在玻璃上，但不属于水面，先拦下来 */
    if (U.inRect(x, y, L.ZOOM_IN)) {
        var zin = view.step(1);
        session.showToast(zin === 2 ? '鱼缸已放大 2×' : '鱼缸已放大 ' + view.label());
        return;
    }
    if (U.inRect(x, y, L.ZOOM_OUT)) {
        var zout = view.step(-1);
        session.showToast(zout === 1 ? '鱼缸已还原' : '鱼缸已缩到 ' + view.label());
        return;
    }

    /* 5. 鱼缸切换：标签在顶部，商店面板挡不到，所以放在商店之前 */
    var tankN = storage.tankCountOf(state);
    var tankMax = storage.maxTanks();
    if (tankMax > 1) {
        for (var ti = 0; ti < tankMax; ti++) {
            if (!U.inRect(x, y, L.tankTabRect(ti, tankMax))) continue;
            if (ti >= tankN) {
                session.showToast('还没有这个缸 · 去商店开一个');
                return;
            }
            env.sim.setActiveTank(state, ti, C.viewport);
            return;
        }
    }

    /* 5. 商店 */
    if (session.sheetOpen || session.sheetEase > 0.05) {
        /* 开合动画的第一帧 ease 还是 0，此时 sheetTop() 等于整屏高，
         * 任何点击都会被当成「点在面板外面」而把刚打开的面板关掉。
         * 极快连点时遇到过，这里直接吞掉动画中的点击。 */
        if (session.sheetOpen && session.sheetEase < 0.05) return;
        handleSheet(x, y, env);
        return;
    }

    /* 6. 选中鱼 / 卖鱼：点鱼高亮，点「卖掉」才成交 */
    if (handleSell(x, y, env)) return;

    /* 7. 底部按钮：撒食 / 卖掉 / 商店 */
    if (U.inRect(x, y, L.FEED_BTN)) {
        env.sim.feedCenter(state, C.viewport);
        return;
    }
    if (U.inRect(x, y, L.SELL_BTN)) {
        var sel = sellRender.selectedOf(state);
        if (!sel) {
            session.showToast('先点一条鱼，再点卖掉');
            return;
        }
        var r = env.sim.sellFish(state, sel.id);
        state.view.selFish = '';
        if (r && r.ok) session.showToast('卖掉 ' + r.name + ' +' + wallet.format(r.price));
        return;
    }
    if (U.inRect(x, y, L.SHOP_BTN)) {
        session.sheetOpen = true;
        session.codexDetail = null;
        session.bagSel = '';
        return;
    }

    /* 8. 点水面撒食。
     * 缸盖和底座不是水，点在上面的空白处不该凭空掉饲料。 */
    if (y < C.TANK_TOP || y > C.TANK_BOTTOM) return;
    var fw = view.toWorld(x, y);
    env.sim.feed(state, fw.x, Math.min(fw.y, C.ground - 40), env.sim.pelletsFor(state, require('../config/index.js').economy.feeding.pelletsTap), C.viewport);
}

function dist(a, b) {
    var dx = a.clientX - b.clientX;
    var dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function mid(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

function attach(env) {
    var platform = require('../platform.js');
    var pending = null;   /* 还没决定是「点」还是「拖」 */
    var drag = null;
    var pinch = null;
    var lastTap = null;

    platform.onTouchStart(function (e) {
        var ts = e.touches && e.touches.length ? e.touches : [];

        /* 三指同时点屏：切换诊断条。正常游戏里不可能误触 */
        if (ts.length >= 3) {
            var diag = require('./diag.js');
            diag.state.forceShow = !diag.state.forceShow;
            pending = drag = pinch = null;
            return;
        }

        if (ts.length >= 2) {
            var m = mid(ts[0], ts[1]);
            pinch = { d: dist(ts[0], ts[1]), x: m.x, y: m.y };
            pending = null;
            drag = null;
            return;
        }

        if (ts.length === 1) {
            pending = { x: ts[0].clientX, y: ts[0].clientY };
            drag = { x: ts[0].clientX, y: ts[0].clientY };
        }
    });

    platform.onTouchMove(function (e) {
        var ts = e.touches && e.touches.length ? e.touches : [];

        if (pinch) {
            if (ts.length < 2) return;
            var d = dist(ts[0], ts[1]);
            if (pinch.d > 0) view.pinch(d / pinch.d);
            var c = mid(ts[0], ts[1]);
            view.pan(c.x - pinch.x, c.y - pinch.y);
            pinch.d = d;
            pinch.x = c.x;
            pinch.y = c.y;
            return;
        }

        if (!pending || !drag || !ts.length) return;
        var p = ts[0];
        var moved = dist(p, { clientX: drag.x, clientY: drag.y });
        if (moved < 8) return;

        /* 放大后拖动缸内画面；按钮区不参与平移。
         * 一旦判定为拖动，这次抬手就不再当成点击（不会误撒食/误卖鱼）。 */
        var canPan = view.state.zoom > 1 && view.inGlass(drag.x, drag.y) &&
            !U.inRect(drag.x, drag.y, L.ZOOM_IN) &&
            !U.inRect(drag.x, drag.y, L.ZOOM_OUT);
        if (canPan) view.pan(p.clientX - drag.x, p.clientY - drag.y);
        drag.x = p.clientX;
        drag.y = p.clientY;
        pending = null;
    });

    platform.onTouchEnd(function (e) {
        if (pinch) {
            if (!(e.touches && e.touches.length >= 2)) pinch = null;
            pending = null;
            drag = null;
            return;
        }
        if (!pending) { drag = null; return; }

        var p = pending;
        pending = null;
        drag = null;

        /* 放大状态下双击鱼缸还原；未放大时仍走正常点击，不影响连续撒食。
         * 连点 +/− 按钮不算双击，否则想从 1× 点到 2× 会被还原回去。 */
        var onZoomBtn = U.inRect(p.x, p.y, L.ZOOM_IN) || U.inRect(p.x, p.y, L.ZOOM_OUT);
        var nowT = Date.now();
        if (!onZoomBtn && view.state.zoom > 1 && lastTap && nowT - lastTap.t < 350 &&
            Math.abs(p.x - lastTap.x) < 28 && Math.abs(p.y - lastTap.y) < 28) {
            lastTap = null;
            view.reset();
            env.session.showToast('鱼缸已还原');
            return;
        }
        lastTap = { x: p.x, y: p.y, t: nowT };
        tap(p.x, p.y, env);
    });
}

module.exports = {
    attach: attach,
    tap: tap
};
