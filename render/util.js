/* ============================================================
 * render/util.js · 绘制小工具
 * ============================================================ */

function rand(a, b) {
    return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function hexA(hex, a) {
    var h = hex.replace('#', '');
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}

function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/**
 * 椭圆路径。
 * ctx.ellipse 不是 Canvas 2D 的「必选」API —— 部分安卓 X5 内核与老 iOS
 * 上根本不存在，直接调用会是 undefined is not a function，整帧绘制中断。
 * 这里探测一次，缺失时用 scale + arc 模拟（路径坐标在添加时就已落到
 * 用户空间，restore 不会影响已经建好的路径，所以 fill 依然正确）。
 */
var HAS_ELLIPSE = null;
function ellipse(ctx, x, y, rx, ry, rot) {
    if (HAS_ELLIPSE === null) {
        HAS_ELLIPSE = typeof ctx.ellipse === 'function';
    }
    if (HAS_ELLIPSE) {
        ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832);
        return;
    }
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(1, ry / (rx || 1));
    ctx.arc(0, 0, rx, 0, 6.2832);
    ctx.restore();
}

/**
 * HSL → rgb() 字符串。
 *
 * 不要直接写 'hsl(163.48, 52%, 16%)'：
 *   · Chrome 接受小数色相
 *   · iOS WebKit 的 addColorStop 会判成非法颜色并抛异常
 * 实测真机（iPhone / iOS）上这一句会让整层绘制中断。
 * 自己算成 rgb 三元组就没有任何解析歧义。
 */
function hsl(h, s, l) {
    var hh = ((h % 360) + 360) % 360 / 360;
    var ss = clamp(s, 0, 100) / 100;
    var ll = clamp(l, 0, 100) / 100;

    var q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    var p = 2 * ll - q;

    function channel(t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    var r = Math.round(channel(hh + 1 / 3) * 255);
    var g = Math.round(channel(hh) * 255);
    var b = Math.round(channel(hh - 1 / 3) * 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/**
 * 安全 addColorStop。
 * 坐标算出 NaN 时 createLinearGradient 可能返回 null，
 * 颜色字符串非法时会抛异常 —— 两者都不该让整帧停住。
 */
function stop(g, offset, color) {
    if (!g) return;
    try {
        g.addColorStop(offset, color);
    } catch (e) {
        /* 跳过这一档颜色，渐变仍然可用 */
    }
}

function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
}

module.exports = {
    rand: rand,
    clamp: clamp,
    lerp: lerp,
    hexA: hexA,
    roundRect: roundRect,
    ellipse: ellipse,
    hsl: hsl,
    stop: stop,
    inRect: inRect,
    fitText: fitText
};
