/* ============================================================
 * platform.js · 运行环境适配层
 *
 * 屏蔽三种环境的差异：微信小游戏 / 浏览器预览 / Node 单元测试。
 * 逻辑层（core/*）只通过本模块取时间和存档，不直接调用 wx.*，
 * 这样 core 可以在没有 wx、没有 canvas 的环境里独立跑起来。
 * ============================================================ */

var wxApi = (typeof wx !== 'undefined') ? wx : null;
var hasDom = (typeof document !== 'undefined') && !!document.createElement;

var memoryStore = {};

/* ---------------- 屏幕信息 ----------------
 * 这里以前只试 wx.getWindowInfo()，但它有两个坑：
 *   · 基础库低于 2.20.1 时压根没有这个方法
 *   · 个别机型上方法存在、却返回 undefined 或宽高为 0
 * 两种都会让「模块加载阶段」直接抛 TypeError，整套游戏连启动都走不到。
 * 所以改成三级兜底，任一级拿到合法宽高就用它。
 */

function normalize(info, fallbackStatusBar) {
    var safe = info.safeArea;
    return {
        windowWidth: info.windowWidth,
        windowHeight: info.windowHeight,
        pixelRatio: (info.pixelRatio > 0 && info.pixelRatio < 4) ? info.pixelRatio : 2,
        statusBarHeight: info.statusBarHeight || fallbackStatusBar || 20,
        safeAreaBottom: safe ? Math.max(0, info.windowHeight - safe.bottom) : 0
    };
}

function valid(info) {
    return !!info && info.windowWidth > 0 && info.windowHeight > 0;
}

/* ---------------- 网页版的「舞台」尺寸 ----------------
 * 小游戏里 window.innerWidth 就是屏幕宽，直接用没问题。
 * 但网页版要在桌面上摆一块手机大小的竖屏区域：外层容器固定
 * 390×844，再用 CSS transform 缩放适配窗口。这时 canvas 的
 * 显示尺寸和逻辑尺寸就不一样了，所以容器页会写一个
 * window.__stageSize，这里优先读它 —— 布局尺寸永远是逻辑尺寸，
 * 缩放到多大都不影响游戏内部排版。
 */
function stage() {
    if (typeof window === 'undefined') return null;
    var st = window.__stageSize;
    if (st && st.w > 0 && st.h > 0) return st;
    return null;
}

function viewport() {
    if (wxApi) {
        /* 1. 新接口 */
        try {
            if (wxApi.getWindowInfo) {
                var i = wxApi.getWindowInfo();
                if (valid(i)) return normalize(i, 20);
            }
        } catch (e0) { /* 落到下一级 */ }

        /* 2. 老接口（已废弃但几乎全版本可用） */
        try {
            if (wxApi.getSystemInfoSync) {
                var s = wxApi.getSystemInfoSync();
                if (valid(s)) return normalize(s, 20);
            }
        } catch (e1) { /* 落到下一级 */ }
    }

    if (hasDom) {
        var st = stage();
        /* 网页版没有状态栏，但顶部那条木栏留 20px 看着才不憋；
         * 底部留 34px：浏览器自己的工具栏已经占了屏幕外，
         * 这里是为了和手机上按钮离底边的距离保持一致。 */
        return {
            windowWidth: st ? st.w : window.innerWidth,
            windowHeight: st ? st.h : window.innerHeight,
            pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
            statusBarHeight: 20,
            safeAreaBottom: 34
        };
    }

    /* 3. 实在问不出来：按最常见竖屏手机尺寸兜底，总比崩掉强 */
    return {
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 2,
        statusBarHeight: 20,
        safeAreaBottom: 34
    };
}

/* ---------------- 画布 ---------------- */

function createCanvas(w, h, dpr) {
    var cv = null;
    if (wxApi && wxApi.createCanvas) {
        cv = wxApi.createCanvas();
    } else if (hasDom) {
        cv = document.createElement('canvas');
        /* 相对容器铺满：容器可以被 CSS 缩放，canvas 跟着缩，
         * 逻辑尺寸仍由 width/height 属性决定。 */
        cv.style.cssText = 'display:block;position:absolute;left:0;top:0;' +
            'width:100%;height:100%;touch-action:none;' +
            'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none';
        (document.getElementById('stage') || document.body).appendChild(cv);
    }
    if (!cv) return null;
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    return cv;
}

/* ---------------- 图片 ----------------
 * 微信小游戏用 wx.createImage()，浏览器用 new Image()。
 * Node 测试环境没有图片解码能力，返回 null，调用方走矢量降级。
 */
function createImage() {
    if (wxApi && wxApi.createImage) return wxApi.createImage();
    if (hasDom && typeof Image !== 'undefined') return new Image();
    return null;
}

/* ---------------- 存储 ---------------- */

function getStorage(key) {
    if (wxApi && wxApi.getStorageSync) {
        try {
            var v = wxApi.getStorageSync(key);
            return v === '' || v === undefined ? null : v;
        } catch (e) {
            return null;
        }
    }
    if (hasDom && window.localStorage) {
        try {
            var s = window.localStorage.getItem(key);
            return s ? JSON.parse(s) : null;
        } catch (e2) {
            return null;
        }
    }
    return memoryStore[key] || null;
}

function setStorage(key, value) {
    if (wxApi && wxApi.setStorageSync) {
        try {
            wxApi.setStorageSync(key, value);
        } catch (e) {
            /* 存储写失败（超额/隐私模式）不应中断游戏 */
        }
        return;
    }
    if (hasDom && window.localStorage) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (e2) {
            /* 同上 */
        }
        return;
    }
    memoryStore[key] = value;
}

function removeStorage(key) {
    if (wxApi && wxApi.removeStorageSync) {
        try {
            wxApi.removeStorageSync(key);
        } catch (e) { /* 忽略 */ }
        return;
    }
    if (hasDom && window.localStorage) {
        try {
            window.localStorage.removeItem(key);
        } catch (e2) { /* 忽略 */ }
        return;
    }
    delete memoryStore[key];
}

/* ---------------- 时间 ---------------- */

/* 游戏内时间统一用毫秒时间戳，便于离线和跨设备校验 */
function now() {
    return Date.now();
}

/* ---------------- 帧循环 / 生命周期 / 触摸 ---------------- */

function raf(cb) {
    if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(cb);
    }
    return setTimeout(function () {
        cb(Date.now());
    }, 16);
}

function onShow(cb) {
    if (wxApi && wxApi.onShow) {
        wxApi.onShow(cb);
        return;
    }
    /* 网页版：切回标签页等于小游戏的 onShow。
     * 少了这一条，网页版永远不结算离线成长。 */
    if (hasDom) {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) cb();
        });
    }
}

function onHide(cb) {
    if (wxApi && wxApi.onHide) {
        wxApi.onHide(cb);
        return;
    }
    if (hasDom) {
        var run = function () { cb(); };
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) run();
        });
        /* 手机关标签页 / 切到别的 App 时 pagehide 更可靠 */
        window.addEventListener('pagehide', run);
    }
}

/* 把屏幕坐标换成 canvas 的逻辑坐标。
 * 网页版容器可能被 CSS 缩放过（桌面），clientX 是屏幕像素，
 * 不能直接当逻辑坐标用 —— 否则屏幕上点在按钮中间，逻辑层收到的是偏的。
 */
function toLogical(e) {
    var st = stage();
    var lw = st ? st.w : window.innerWidth;
    var lh = st ? st.h : window.innerHeight;

    var t = e && e.target;
    var r = (t && t.getBoundingClientRect) ? t.getBoundingClientRect() : null;
    if (!r || !(r.width > 0) || !(r.height > 0)) return { x: e.clientX, y: e.clientY };

    return {
        x: (e.clientX - r.left) * lw / r.width,
        y: (e.clientY - r.top) * lh / r.height
    };
}

/* ---------------- 触摸：按下 / 移动 / 抬起 ----------------
 * 缩放需要拖动和多指捏合，所以不能只在 pointerdown 里做全部交互。
 * 浏览器侧自己维护一张「当前按下的指针」表：Pointer Events 下
 * 每个 pointer 只上报自己，不合并成 touches 数组，得在这里拼出来；
 * 旧 iOS 没有 Pointer Events，退回 touchstart/move/end。 */
var activePointers = {};

function allPointerPoints() {
    var out = [];
    for (var id in activePointers) {
        var p = activePointers[id];
        var q = toLogical({ clientX: p.clientX, clientY: p.clientY, target: p.target });
        /* 维持和 wx.onTouchStart 相同的字段形状，交互层只读 clientX/clientY */
        out.push({ clientX: q.x, clientY: q.y });
    }
    return out;
}

function emitTouch(cb, touches, changed) {
    cb({ touches: touches || [], changedTouches: changed || touches || [] });
}

function bindDomTouch(cb, kind) {
    if (!hasDom) return;
    var evs = kind === 'start' ? ['pointerdown']
        : kind === 'move' ? ['pointermove']
            : ['pointerup', 'pointercancel'];

    if (window.PointerEvent) {
        for (var i = 0; i < evs.length; i++) {
            (function (name) {
                document.addEventListener(name, function (e) {
                    if (e.cancelable) e.preventDefault();
                    var id = e.pointerId == null ? 0 : e.pointerId;
                    if (name === 'pointerup' || name === 'pointercancel') {
                        var q = toLogical({ clientX: e.clientX, clientY: e.clientY, target: e.target });
                        var changed = [{ clientX: q.x, clientY: q.y }];
                        delete activePointers[id];
                        emitTouch(cb, allPointerPoints(), changed);
                        return;
                    }
                    activePointers[id] = {
                        clientX: e.clientX, clientY: e.clientY, target: e.target
                    };
                    emitTouch(cb, allPointerPoints());
                }, { passive: false });
            })(evs[i]);
        }
        return;
    }

    var names = kind === 'start' ? ['touchstart']
        : kind === 'move' ? ['touchmove']
            : ['touchend', 'touchcancel'];
    for (var k = 0; k < names.length; k++) {
        (function (name) {
            document.addEventListener(name, function (e) {
                if (e.cancelable) e.preventDefault();
                var src = (name === 'touchend' || name === 'touchcancel')
                    ? e.changedTouches : e.touches;
                var pts = [];
                for (var j = 0; src && j < src.length; j++) {
                    var q = toLogical({
                        clientX: src[j].clientX, clientY: src[j].clientY, target: e.target
                    });
                    pts.push({ clientX: q.x, clientY: q.y });
                }
                emitTouch(cb, pts);
            }, { passive: false });
        })(names[k]);
    }
}

function onTouchStart(cb) {
    if (wxApi && wxApi.onTouchStart) {
        wxApi.onTouchStart(cb);
        return;
    }
    bindDomTouch(cb, 'start');
}

function onTouchMove(cb) {
    if (wxApi && wxApi.onTouchMove) {
        wxApi.onTouchMove(cb);
        return;
    }
    bindDomTouch(cb, 'move');
}

function onTouchEnd(cb) {
    if (wxApi && wxApi.onTouchEnd) {
        wxApi.onTouchEnd(cb);
        return;
    }
    bindDomTouch(cb, 'end');
}

module.exports = {
    viewport: viewport,
    createCanvas: createCanvas,
    createImage: createImage,
    getStorage: getStorage,
    setStorage: setStorage,
    removeStorage: removeStorage,
    now: now,
    raf: raf,
    onShow: onShow,
    onHide: onHide,
    onTouchStart: onTouchStart,
    onTouchMove: onTouchMove,
    onTouchEnd: onTouchEnd,
    isWeapp: !!wxApi,
    hasDom: hasDom
};
