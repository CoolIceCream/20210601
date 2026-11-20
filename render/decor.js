/* ============================================================
 * render/decor.js · 场景装饰（纯视觉，不参与玩法）
 *
 * 水草、碎石、悬浮微粒、珊瑚。这些都是「看起来怎样」的东西，
 * 全部放在渲染层，逻辑层完全不感知。
 * ============================================================ */

var U = require('./util.js');

function makeCoral(x, hue) {
    var n = 4 + Math.floor(Math.random() * 3);
    var br = [];
    for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.44;
        br.push({ a: a, len: U.rand(22, 46), w: U.rand(4, 7) });
    }
    return { x: x, hue: hue, br: br, s: U.rand(0.85, 1.2) };
}

function build(W, H, ground, corals, top) {
    var d = { plants: [], pebbles: [], motes: [], corals: [] };

    var n = Math.round(W / 38) + 10;
    for (var i = 0; i < n; i++) {
        var front = Math.random() > 0.42;
        d.plants.push({
            x: (i + U.rand(0.1, 0.9)) * (W / n),
            /* Q 版水草要粗一点、胖一点，细长条在明亮背景上会显得脏 */
            h: front ? U.rand(90, 190) : U.rand(60, 135),
            w: front ? U.rand(12, 22) : U.rand(7, 12),
            sway: U.rand(0, 6.28),
            spd: U.rand(0.5, 1.05),
            layer: front ? 1 : 0,
            hue: U.rand(150, 180) + (front ? 0 : 10)
        });
    }

    for (var p = 0; p < 18; p++) {
        d.pebbles.push({ x: U.rand(0, W), r: U.rand(9, 26), dy: U.rand(-2, 12) });
    }

    /* 微粒只在玻璃里面飘：缸盖和底座上面不该有小白点 */
    var mTop = top || 0;
    for (var m = 0; m < 34; m++) {
        d.motes.push({
            x: U.rand(0, W),
            y: U.rand(mTop, H),
            r: U.rand(0.6, 2.1),
            vy: U.rand(-6, -1.5),
            vx: U.rand(-4, 4),
            a: U.rand(0.05, 0.22)
        });
    }

    d.corals = buildCorals(W, corals);
    return d;
}

function buildCorals(W, corals) {
    var list = [];
    for (var i = 0; i < corals; i++) {
        var hue = 8 + i * 47;
        list.push(makeCoral(W * ((i + 0.6) / (corals + 0.6)) + U.rand(-20, 20), hue));
    }
    return list;
}

/* 微粒缓慢上浮，纯视觉效果 */
function updateMotes(d, dt, W, H, top) {
    var mTop = top || 0;
    for (var i = 0; i < d.motes.length; i++) {
        var m = d.motes[i];
        m.y += m.vy * dt;
        m.x += m.vx * dt + Math.sin(m.r * 9 + m.y * 0.01) * 2.6 * dt;
        if (m.y < mTop - 12) {
            m.y = H + 12;
            m.x = U.rand(0, W);
        }
        if (m.x < -12) m.x = W + 12;
        if (m.x > W + 12) m.x = -12;
    }
}

module.exports = {
    build: build,
    buildCorals: buildCorals,
    updateMotes: updateMotes
};
