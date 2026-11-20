/* ============================================================
 * game.js · 小游戏入口（唯一职责：兜住启动异常）
 *
 * 真正装配逻辑全在 boot.js 里。为什么要多这一层？
 *
 * 因为「模块加载阶段」抛出的异常，boot.js 内部的 try/catch 是
 * 管不到的 —— require 链上一旦有东西炸了，后面的代码一行都不会
 * 执行，屏幕上就是一片沉默的背景，连个错误都没有。
 *
 * 这个文件只用最原始的 wx API 画错误页，不 require 任何业务模块，
 * 保证「即使整个世界都崩了，它还能写字」。
 * ============================================================ */

(function () {
    try {
        require('./boot.js');
    } catch (e) {
        fatal(e);
    }
})();

/** 把堆栈压成「函数名:行号」，去掉又长又没用的绝对路径 */
function shortStack(e) {
    if (!e || !e.stack) return '';
    var lines = String(e.stack).split('\n');
    var out = [];
    for (var i = 0; i < lines.length && out.length < 8; i++) {
        var l = lines[i].replace(/^\s+/, '');
        if (!l || l.indexOf('at ') !== 0) continue;
        /* at http://... (game.js:12:5) → at game.js:12:5 */
        l = l.replace(/\(([^()]*)\)$/, function (m, inner) {
            var tail = inner.split('/').pop();
            return '(' + tail + ')';
        });
        out.push(l);
    }
    return out.join('\n');
}

function fatal(e) {
    var text = e ? (String(e.message || e)) : '未知错误';
    var stack = shortStack(e);

    /* 控制台也留一份，方便真机调试时复制 */
    try {
        if (typeof console !== 'undefined' && console.error) console.error(text);
    } catch (e0) { /* 忽略 */ }

    try {
        var api = (typeof wx !== 'undefined') ? wx : null;
        if (!api || !api.createCanvas) return;

        /* 屏幕画布此前若已被创建，这里拿到的就是同一张 */
        var cv = api.createCanvas();
        if (!cv) return;
        var ctx = cv.getContext('2d');
        if (!ctx) return;

        /* 崩在 canvas 初始化之前时，画布还是 300x150 的默认尺寸。
         * 这里自己问一次屏幕大小并重设，保证错误页能铺满整屏。
         * 注意：设置 width/height 会重置画布状态（含之前的 scale），正合适。 */
        var info = null;
        try {
            if (api.getWindowInfo) info = api.getWindowInfo();
        } catch (eA) { info = null; }
        if (!info || !(info.windowWidth > 0)) {
            try {
                if (api.getSystemInfoSync) info = api.getSystemInfoSync();
            } catch (eB) { info = null; }
        }

        var lw = (info && info.windowWidth > 0) ? info.windowWidth : 375;
        var lh = (info && info.windowHeight > 0) ? info.windowHeight : 667;
        var dpr = (info && info.pixelRatio > 0) ? Math.min(info.pixelRatio, 3) : 2;

        cv.width = Math.floor(lw * dpr);
        cv.height = Math.floor(lh * dpr);

        var cw = cv.width;
        var ch = cv.height;
        var s = lw / 375;                 /* 以 375 逻辑宽为基准换算字号 */
        if (!(s > 0.5 && s < 4)) s = 1;

        ctx.fillStyle = '#061a26';
        ctx.fillRect(0, 0, cw, ch);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.fillStyle = '#ff8f8f';
        ctx.font = 'bold ' + Math.round(14 * s * dpr) + 'px sans-serif';
        ctx.fillText('启动失败 · 请截图给开发者', 12 * s * dpr, 18 * s * dpr);

        /* 第一段：错误消息（最能说明问题的就是这一行） */
        ctx.fillStyle = '#ffd08a';
        ctx.font = Math.round(11 * s * dpr) + 'px sans-serif';

        var x0 = 12 * s * dpr;
        var wMax = cw - 24 * s * dpr;
        var lineH = 15 * s * dpr;
        var y = 46 * s * dpr;
        var maxLines = Math.floor((ch - y - 12) / lineH);

        y = drawWrapped(ctx, text, x0, y, wMax, lineH, Math.min(maxLines, 8));

        /* 第二段：堆栈（函数名 + 行号），帮开发者定位到具体位置 */
        if (stack) {
            ctx.fillStyle = '#8fa6b4';
            ctx.font = Math.round(9 * s * dpr) + 'px sans-serif';
            var lh2 = 12 * s * dpr;
            var left = Math.floor((ch - y - 12) / lh2);
            if (left > 0) drawWrapped(ctx, stack, x0, y + 6 * s * dpr, wMax, lh2, left);
        }
    } catch (e2) {
        /* 连带错误页都画不出来，只能听天由命 */
    }
}

/** 按宽度自动换行绘制，返回绘制结束后的 y */
function drawWrapped(ctx, str, x, y, maxW, lineH, maxLines) {
    var lines = String(str).split('\n');
    var n = 0;

    for (var s = 0; s < lines.length && n < maxLines; s++) {
        var src = lines[s];
        var line = '';
        for (var i = 0; i < src.length; i++) {
            var c = src.charAt(i);
            if (ctx.measureText(line + c).width > maxW && line) {
                ctx.fillText(line, x, y + n * lineH);
                n += 1;
                line = c;
                if (n >= maxLines) {
                    ctx.fillText('…', x, y + n * lineH);
                    return y + (n + 1) * lineH;
                }
            } else {
                line += c;
            }
        }
        if (line) {
            ctx.fillText(line, x, y + n * lineH);
            n += 1;
        }
    }
    return y + n * lineH;
}
