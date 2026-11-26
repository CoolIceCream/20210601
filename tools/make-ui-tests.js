/* 生成交互测试页：node tools/make-ui-tests.js
 *
 * 每个 case 一个 HTML，坐标与 ui/layout.js 保持一致
 * （改布局时这里要同步，否则截图对不上命中区）。
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OUTDIR = path.join(__dirname, '_pages');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

var shim = `
(function () {
  var cv = null;
  window.wx = {
    getWindowInfo: function () {
      /* 固定成真机竖屏尺寸：headless 的 --window-size 会被浏览器改写，
       * 只有把视口写死，截图才和微信里看到的布局一致 */
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 2,
        statusBarHeight: 20, safeArea: { top: 20, bottom: 810, left: 0, right: 390 } };
    },
    createCanvas: function () { if (!cv) { cv = document.createElement('canvas'); document.body.appendChild(cv); } return cv; },
    getStorageSync: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : ''; } catch (e) { return ''; } },
    setStorageSync: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    removeStorageSync: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    onTouchStart: function (cb) {
      window.__previewTap = function (x, y) { cb({ touches: [{ clientX: x, clientY: y }] }); };
      /* 多指：用来触发三指点屏的诊断条 */
      window.__previewTouch = function (n) {
        var arr = [];
        for (var i = 0; i < n; i++) arr.push({ clientX: 60 + i * 40, clientY: 400 });
        cb({ touches: arr });
      };
    },
    onShow: function () {}, onHide: function () {}
  };
  window.addEventListener('pointerdown', function (e) { if (window.__previewTap) window.__previewTap(e.clientX, e.clientY); }, { passive: true });
})();
`;

/* ---------------- 与 ui/layout.js 同步的常量 ---------------- */
var helper = `
  /* 与 shim 的 getWindowInfo 保持一致：headless 的真实视口不是 390x844，
   * 但游戏按 390x844 布局，所以这里也写死 */
  var W = 390, H = 844;
  var SB = 20, TOP = SB + 10;
  /* 底部安全区 = 844 - 810 = 34，按钮贴在上方 */
  var SAFE_BOTTOM = 34, BTN_H = 74;
  /* M4：按钮落在缸底以下的底座里，位置与 render/canvas.js 一致 */
  var BTN_Y = H - SAFE_BOTTOM - 10 - BTN_H;

  /* 条目数要和 config/items.js 一致（M2 加到 6 条：多了「新鱼缸」） */
  /* 道具页 5 条（M3 去掉了「新成员」盲盒）；卵页三档竖排 */
  var ITEM_H = 70, ITEM_GAP = 9, ITEM_TOP = 92, ITEM_N = 5;
  var EGG_ROWS = 4, EGG_H = 104, EGG_GAP = 10, EGG_TOP = 92;
  var ITEMS_BOTTOM = ITEM_TOP + ITEM_N * (ITEM_H + ITEM_GAP) - ITEM_GAP;
  var EGGS_BOTTOM = EGG_TOP + EGG_ROWS * (EGG_H + EGG_GAP) - EGG_GAP;
  var SHEET_H = Math.min(H * 0.9, Math.max(ITEMS_BOTTOM, EGGS_BOTTOM) + 72);
  var ST = H - SHEET_H;              /* 面板顶部 */
  var EGG_W = W - 32;

  function tap(x, y) { if (window.__previewTap) window.__previewTap(x, y); }
  /* 五个入口平分（见 ui/layout.js）：商店 / 仓库 / 鱼塘 / 图鉴 / 系统 */
  var BTN_GAP = 8, BTN_W = (W - 28 - BTN_GAP * 4) / 5, BTN_X0 = 14;
  function tapBar(i) { tap(BTN_X0 + (BTN_W + BTN_GAP) * i + BTN_W / 2, BTN_Y + 37); }
  function tapShop() { tapBar(0); }
  function tapTab(i) { tap(18 + i * 92 + 42, ST + 52 + 15); }
  function tapBuy(i) { tap(W - 104 + 39, ST + ITEM_TOP + i * (ITEM_H + ITEM_GAP) + 16 + 19); }
  function tapEgg(i) {
    tap(W / 2, ST + EGG_TOP + i * (EGG_H + EGG_GAP) + EGG_H / 2);
  }
  function tapFeed() { tap(W / 2, BTN_Y - 120); }   /* 撒食改为点水面 */
`;

/* ---------------- 存档种子 ---------------- */
/* 时间戳不能在生成 HTML 时写死：页面可能是几分钟后才打开的，
 * 那样每次都会误触发离线结算。用占位符，在浏览器里执行时再换成真实时间。 */
function save(obj, opts) {
    opts = opts || {};
    var payload = Object.assign({
        v: 4, savedAt: '__NOW__', lastSeenAt: '__NOW__', t: 0,
        coins: { fish: 500, s: 0 }, acc: 0,
        foodLv: 1, auto: false, corals: 0, storageLv: 1,
        stats: { earned_fish: 0, earned_s: 0, spent_fish: 0, spent_s: 0, feedCount: 0, playSeconds: 0 },
        fish: []
    }, obj);

    if (opts.awaySeconds) {
        payload.lastSeenAt = '__AWAY__';
        payload.savedAt = '__AWAY__';
    }

    /* 占位符出现两次（savedAt / lastSeenAt），必须全量替换 */
    var json = JSON.stringify(payload)
        .split('"__NOW__"').join('Date.now()')
        .split('"__AWAY__"').join('(Date.now()-' + (opts.awaySeconds * 1000) + ')');

    return "localStorage.setItem('aquarium_save', JSON.stringify(" + json + "));";
}

var cases = {
    /* 主界面：什么都不点，只看缸体框架与三段分区 */
    main: {
        body: '',
        pre: save({
            coins: { fish: 600, s: 0 }, foodLv: 1, storageLv: 1, corals: 1,
            fish: [
                { id: 'm1', sp: 'gold_fish', g: 100, h: 92, m: 92, tr: [], b: 0, x: 120, y: 320 },
                { id: 'm2', sp: 'peach_koi', g: 70, h: 86, m: 86, tr: [], b: 0, x: 268, y: 440 },
                { id: 'm3', sp: 'blue_zebra', g: 46, h: 90, m: 90, tr: [], b: 0, x: 186, y: 210 }
            ]
        })
    },

    /* 贴图验证：9 种鱼各一条，坐标摊开，方便逐条核对朝向/画风/比例 */
    sprites: {
        body: '',
        pre: save({
            coins: { fish: 1200, s: 0 }, foodLv: 2, auto: false, corals: 2, storageLv: 3,
            fish: [
                { id: 's1', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 190 },
                { id: 's2', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 285, y: 190 },
                { id: 's3', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 320 },
                { id: 's4', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 285, y: 320 },
                { id: 's5', sp: 'violet', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 450 },
                { id: 's6', sp: 'jade', g: 100, h: 96, m: 96, tr: [], b: 0, x: 285, y: 450 },
                { id: 's7', sp: 'dusk_betta', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 580 },
                { id: 's8', sp: 'red_arrow', g: 100, h: 96, m: 96, tr: [], b: 0, x: 285, y: 580 },
                { id: 's9', sp: 'gold_dragon', g: 100, h: 96, m: 96, tr: [], b: 0, x: 195, y: 680 }
            ]
        })
    },

    /* 卖鱼：点成鱼选中，底部浮出「卖掉」，确认光圈与价签 */
    sell: {
        body: `
      /* 只跑到第 50 帧就停，免得鱼游走导致截图和点击坐标对不上 */
      var __n = 0, __orig = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
          __n++;
          if (__n > 50) return 0;
          return __orig(cb);
      };
      setTimeout(function () { tap(195, 420); }, 260);
    `,
        pre: save({
            coins: { fish: 3200, s: 0 }, foodLv: 2, storageLv: 2,
            fish: [
                { id: 'x1', sp: 'gold_lamp', g: 100, h: 94, m: 94, tr: [], b: 0, x: 195, y: 420 },
                { id: 'x2', sp: 'gold_fish', g: 62, h: 88, m: 88, tr: [], b: 0, x: 300, y: 540 }
            ]
        })
    },

    feed: {
        body: `
      setTimeout(function () { tap(W / 2, H * 0.36); }, 500);
      setTimeout(function () { tap(W * 0.42, H * 0.4); }, 900);
    `
    },

    shop: {
        body: `setTimeout(function () { tapShop(); }, 500);`
    },

    /* 多缸：3 个缸各 4 条鱼，验证顶部标签与分缸渲染 */
    tanks: {
        body: '',
        pre: save({
            tankCount: 3,
            activeTank: 0,
            storageLv: 3,
            coins: { fish: 128000, s: 0 },
            fish: [
                { id: 't0', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 60, y: 240, tk: 0 },
                { id: 't1', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 150, y: 300, tk: 0 },
                { id: 't2', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 250, y: 220, tk: 0 },
                { id: 't3', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 320, y: 340, tk: 0 },
                { id: 't4', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 90, y: 430, tk: 1 },
                { id: 't5', sp: 'violet', g: 100, h: 96, m: 96, tr: [], b: 0, x: 200, y: 470, tk: 1 },
                { id: 't6', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 300, y: 560, tk: 1 },
                { id: 't7', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 70, y: 600, tk: 1 },
                { id: 't8', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 160, y: 660, tk: 2 },
                { id: 't9', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 260, y: 420, tk: 2 },
                { id: 't10', sp: 'violet', g: 100, h: 96, m: 96, tr: [], b: 0, x: 330, y: 300, tk: 2 },
                { id: 't11', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 320, tk: 2 },
                { id: 't12', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 60, y: 240, tk: 2 },
                { id: 't13', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 150, y: 300, tk: 2 },
                { id: 't14', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 250, y: 220, tk: 2 },
                { id: 't15', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 320, y: 340, tk: 2 }
            ]
        })
    },

    tanks2: {
        body: `
      /* 点第 2 个鱼缸标签：x = 14 + 1*(44+7) + 22，y = TOP + 54 + 12 */
      setTimeout(function () { tap(14 + 51 + 22, 30 + 54 + 12); }, 600);
    `,
        pre: save({
            tankCount: 3,
            activeTank: 0,
            storageLv: 3,
            coins: { fish: 128000, s: 0 },
            fish: [
                { id: 't0', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 60, y: 240, tk: 0 },
                { id: 't1', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 150, y: 300, tk: 0 },
                { id: 't2', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 250, y: 220, tk: 0 },
                { id: 't3', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 320, y: 340, tk: 0 },
                { id: 't4', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 90, y: 430, tk: 1 },
                { id: 't5', sp: 'violet', g: 100, h: 96, m: 96, tr: [], b: 0, x: 200, y: 470, tk: 1 },
                { id: 't6', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 300, y: 560, tk: 1 },
                { id: 't7', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 70, y: 600, tk: 1 },
                { id: 't8', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 160, y: 660, tk: 2 },
                { id: 't9', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 260, y: 420, tk: 2 },
                { id: 't10', sp: 'violet', g: 100, h: 96, m: 96, tr: [], b: 0, x: 330, y: 300, tk: 2 },
                { id: 't11', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 110, y: 320, tk: 2 },
                { id: 't12', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0, x: 60, y: 240, tk: 2 },
                { id: 't13', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0, x: 150, y: 300, tk: 2 },
                { id: 't14', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0, x: 250, y: 220, tk: 2 },
                { id: 't15', sp: 'gold_lamp', g: 100, h: 96, m: 96, tr: [], b: 0, x: 320, y: 340, tk: 2 }
            ]
        })
    },

    /* 三指点屏调出诊断条：检查真机/浏览器上的排版是否可读 */
    diag: {
        body: `
      setTimeout(function () { if (window.__previewTouch) window.__previewTouch(3); }, 900);
    `,
        pre: save({
            coins: { fish: 1280, s: 0 },
            fish: [
                { id: 'f1', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f2', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0 }
            ]
        })
    },

    buy: {
        body: `
      setTimeout(function () { tapShop(); }, 400);
      setTimeout(function () { tapBuy(0); }, 900);
      setTimeout(function () { tapBuy(1); }, 1300);
    `,
        pre: save({ coins: { fish: 4000, s: 0 }, fish: [{ id: 'f1', sp: 'gold_fish', g: 70, h: 96, m: 96, tr: [], b: 0 }] })
    },

    eggs: {
        body: `
      setTimeout(function () { tapShop(); }, 400);
      setTimeout(function () { tapTab(1); }, 900);
    `,
        pre: save({
            coins: { fish: 400000, s: 0 },
            fish: [
                { id: 'f1', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f2', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f3', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f4', sp: 'gold_lamp', g: 90, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f5', sp: 'violet', g: 80, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f6', sp: 'gold_fish', g: 60, h: 96, m: 96, tr: [], b: 0 }
            ]
        })
    },

    /* 鱼位满：道具页「新成员」应显示 15/15 与「缸满」，仓库描述带鱼位升级 */
    tankfull: {
        body: `setTimeout(function () { tapShop(); }, 500);`,
        pre: save({
            coins: { fish: 60000, s: 0 }, storageLv: 1,
            fish: ['gold_fish', 'blue_zebra', 'peach_koi', 'gold_lamp', 'violet', 'jade',
                'gold_fish', 'blue_zebra', 'peach_koi', 'gold_lamp', 'violet', 'jade',
                'gold_fish', 'blue_zebra', 'peach_koi'
            ].map(function (sp, i) {
                return { id: 't' + i, sp: sp, g: 100, h: 96, m: 96, tr: [], b: 0 };
            })
        })
    },

    eggbuy: {
        body: `
      setTimeout(function () { tapShop(); }, 400);
      setTimeout(function () { tapTab(1); }, 800);
      setTimeout(function () { tapEgg(1); }, 1300);
    `,
        pre: save({
            coins: { fish: 9000, s: 0 },
            fish: [
                { id: 'f1', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f2', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f3', sp: 'peach_koi', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f4', sp: 'gold_lamp', g: 90, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f5', sp: 'violet', g: 80, h: 96, m: 96, tr: [], b: 0 },
                { id: 'f6', sp: 'gold_fish', g: 60, h: 96, m: 96, tr: [], b: 0 }
            ]
        })
    },

    rich: {
        body: '',
        pre: save({
            coins: { fish: 123456, s: 320 }, foodLv: 3, auto: true, corals: 3, storageLv: 4,
            fish: [
                ['gold_fish', 100, 2.3], ['blue_zebra', 100, 0], ['peach_koi', 88, 0],
                ['gold_lamp', 64, 0], ['violet', 40, 1.8], ['jade', 92, 0],
                ['red_arrow', 30, 0], ['silver_dragon', 12, 0], ['gold_fish', 100, 0],
                ['blue_zebra', 76, 0], ['peach_koi', 20, 0], ['violet', 55, 0]
            ].map(function (x, i) {
                return {
                    id: 'r' + i, sp: x[0], g: x[1], h: 95, m: 95, b: 0,
                    tr: x[2] ? [{ id: 'output_up', value: x[2] }] : []
                };
            })
        })
    },

    stored: {
        body: '',
        pre: save({
            coins: { fish: 90000, s: 0 }, storageLv: 1,
            fish: [
                { id: 'g1', sp: 'gold_fish', g: 100, h: 96, m: 96, tr: [], b: 0 },
                { id: 'g2', sp: 'blue_zebra', g: 100, h: 96, m: 96, tr: [], b: 0 }
            ]
        })
    },

    offline: {
        body: '',
        pre: save({
            coins: { fish: 240, s: 0 }, foodLv: 2, corals: 1, storageLv: 3,
            fish: [
                { id: 'f1', sp: 'gold_fish', g: 62, h: 90, m: 90, tr: [], b: 0 },
                { id: 'f2', sp: 'blue_zebra', g: 96, h: 90, m: 90, tr: [], b: 0 }
            ]
        }, { awaySeconds: 7200 })
    },

    offlinefull: {
        body: '',
        pre: save({
            coins: { fish: 99999999, s: 0 }, storageLv: 1,
            fish: [
                { id: 'f1', sp: 'gold_fish', g: 100, h: 90, m: 90, tr: [], b: 0 }
            ]
        }, { awaySeconds: 8 * 3600 })
    },

    debugskip: {
        body: `
      setTimeout(function () {
        for (var i = 0; i < 5; i++) tap(60, TOP + 18);
      }, 400);
      setTimeout(function () {
        /* 调试面板第 4 个按钮「快进 1 小时」：2 列布局，索引 3 */
        var PW = Math.min(W - 40, 336), PX = (W - PW) / 2, PY = H * 0.2;
        var bw = (PW - 24 - 12) / 2;
        tap(PX + 12 + (bw + 12) + bw / 2, PY + 56 + (44 + 10) + 22);
      }, 900);
    `
    }
};

function page(name, body, pre) {
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
        '<title>M1 · ' + name + '</title>' +
        '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden;background:#04141f}' +
        'canvas{display:block;width:390px;height:844px;touch-action:none}</style></head><body>' +
        '<script>window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };</script>' +
        '<script>' + shim + '</script>' +
        (pre ? '<script>' + pre + '</script>' : '') +
        '<script src="../../preview.bundle.js"></script>' +
        '<script>' + helper + (body || '') + '</script>' +
        '</body></html>';
}

Object.keys(cases).forEach(function (name) {
    var c = cases[name];
    fs.writeFileSync(path.join(OUTDIR, name + '.html'), page(name, c.body, c.pre), 'utf8');
    console.log('生成 tools/_pages/' + name + '.html');
});
