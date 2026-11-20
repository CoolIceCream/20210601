/* ============================================================
 * tools/economy-loop.js · 经济闭环体检（M3：卖鱼循环）
 *
 * M3 取消了自动产币，玩法变成：
 *   买卵 → 养到成鱼 → 卖掉 → 再买卵
 * 这个脚本跑一个「不太聪明但也不乱花」的机器人：
 *   - 饿了就撒食
 *   - 成鱼立刻卖（唯一收入来源）
 *   - 先买自动喂食器，再把饲料升到 Lv3
 *   - 鱼位满了就扩仓库 / 开新缸
 *   - 其余的钱从高到低买得起哪档卵就买哪档
 *
 * 输出把「累计支出 / 累计收入」当健康度：
 *   < 0.5  通胀（钱没地方花）
 *   0.5-0.8  健康
 *   > 0.9  通缩（一直很穷，体验压抑）
 *
 * 运行：node tools/economy-loop.js [天数]
 * ============================================================ */

/* 无头环境：给 platform 一个最小 wx（不建画布） */
var store = {};
global.wx = {
    getWindowInfo: function () {
        return { windowWidth: 390, windowHeight: 844, pixelRatio: 2, statusBarHeight: 20, safeArea: { bottom: 810 } };
    },
    getStorageSync: function (k) { return store[k] === undefined ? '' : store[k]; },
    setStorageSync: function (k, v) { store[k] = v; },
    removeStorageSync: function (k) { delete store[k]; },
    onShow: function () {},
    onHide: function () {},
    onTouchStart: function () {}
};

var cfg = require('../config/index.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');
var shop = require('../core/shop.js');
var storage = require('../core/storage.js');
var wallet = require('../core/wallet.js');

var VP = { w: 390, h: 844, ground: 844 - Math.min(84, 844 * 0.15) };

var DAYS = Number(process.argv[2] || 7);
var DT = 1;                       /* 1 秒一步，够准且够快 */
var TOTAL = Math.round(DAYS * 86400 / DT);

var state = stateModule.bootstrapFresh();
sim.ensurePlacement(state, VP);

var buys = { egg: 0, sell: 0, feed: 0, coral: 0, auto: 0, warehouse: 0, tank: 0 };

function avgHunger() {
    if (!state.fish.length) return 100;
    var s = 0;
    for (var i = 0; i < state.fish.length; i++) s += state.fish[i].hunger;
    return s / state.fish.length;
}

/* 一次购买尝试；买不起就跳过 */
function tryBuy(id, reserve) {
    var st = shop.statusOf(state, shop.itemById(id));
    if (st.maxed || st.owned) return false;
    if (!st.affordable) return false;
    if (wallet.display(state, 'fish') < st.price * reserve) return false;
    var r = shop.buy(state, id);
    if (r.ok) buys[id] += 1;
    return r.ok;
}

function bot() {
    /* 1. 喂食：平均饱食度低于 70 就撒一把（喂食不花钱，只看手感） */
    if (avgHunger() < 70) {
        sim.feedCenter(state, VP);
        return;
    }

    /* 2. 成鱼立刻卖：这是 M3 唯一的收入来源 */
    for (var i = state.fish.length - 1; i >= 0; i--) {
        if (state.fish[i].growth >= 100) {
            if (shop.sellFish(state, state.fish[i].id).ok) buys.sell += 1;
        }
    }

    /* 3. 设施：自动喂食器 → 饲料 Lv3 */
    if (!state.auto && tryBuy('auto', 1.2)) return;
    if (state.foodLv < 3 && tryBuy('feed', 3)) return;

    /* 4. 鱼位满了：先扩仓库（便宜），满级后开新缸 */
    if (storage.roomOf(state) <= 0) {
        if (tryBuy('warehouse', 1.05)) return;
        if (tryBuy('tank', 1.05)) return;
    }

    /* 5. 买卵：从高到低，买得起哪档买哪档（高稀有度收益更高） */
    var eggs = shop.eggList(state);
    for (var q = eggs.length - 1; q >= 0; q--) {
        var e = eggs[q];
        if (e.locked || e.full || !e.affordable) continue;
        if (wallet.display(state, 'fish') < e.price * 1.05) continue;
        if (shop.buyEgg(state, e.rarity).ok) { buys.egg += 1; return; }
    }

    /* 6. 还有余钱就买珊瑚（纯装饰） */
    if (wallet.display(state, 'fish') > 20000) tryBuy('coral', 4);
}

/* 检查点：1h / 3h / 6h / 12h / 1d / 2d / 3d / 5d / 7d */
var marks = [3600, 10800, 21600, 43200, 86400, 172800, 259200, 432000, 604800]
    .filter(function (s) { return s <= DAYS * 86400; });
var rows = [];
var mi = 0;

var t0 = Date.now();

for (var i = 0; i < TOTAL; i++) {
    sim.step(state, DT, VP);
    if (i % 2 === 0) bot();     /* 每 2 秒决策一次，够快 */

    var elapsed = (i + 1) * DT;
    if (mi < marks.length && elapsed >= marks[mi]) {
        rows.push(snapshot(elapsed));
        mi += 1;
    }
}

function snapshot(sec) {
    var bal = wallet.display(state, 'fish');
    var value = 0;
    for (var i = 0; i < state.fish.length; i++) value += require('../core/fish.js').sellPriceOf(state.fish[i]);
    return {
        t: sec,
        fish: state.fish.length,
        value: value,
        bal: bal,
        lv: storage.levelOf(state),
        tanks: storage.tankCountOf(state),
        earned: Math.floor(state.stats.earned_fish),
        spent: Math.floor(state.stats.spent_fish),
        egg: shop.eggPriceOf('R')
    };
}

/* ---------------- 输出 ---------------- */

function dur(sec) {
    if (sec < 86400) return (sec / 3600).toFixed(0) + 'h';
    return (sec / 86400).toFixed(0) + 'd';
}

function pad(s, n) {
    s = String(s);
    while (s.length < n) s = ' ' + s;
    return s;
}

console.log('M3 经济闭环体检 · 卖鱼循环 · 机器人玩家 · ' + DAYS + ' 天（' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
console.log('');
console.log('时间   鱼数  缸   全缸身价      余额      仓库     累计收入     累计支出   支出率   R卵价');
console.log('------------------------------------------------------------------------------------------');
rows.forEach(function (r) {
    var ratio = r.earned > 0 ? r.spent / r.earned : 0;
    console.log(
        pad(dur(r.t), 5) + pad(r.fish, 6) + pad(r.tanks, 4) +
        pad(wallet.format(r.value), 12) + pad(wallet.format(r.bal), 12) + pad('Lv' + r.lv, 8) +
        pad(wallet.format(r.earned), 12) + pad(wallet.format(r.spent), 12) +
        pad((ratio * 100).toFixed(0) + '%', 7) + pad(wallet.format(r.egg), 8)
    );
});

var last = rows[rows.length - 1];
var ratio = last.earned > 0 ? last.spent / last.earned : 0;

console.log('');
console.log('购买决策：' + Object.keys(buys).map(function (k) {
    var nm = k === 'egg' ? '鱼卵' : k === 'sell' ? '卖鱼' : ((shop.itemById(k) || {}).name || k);
    return nm + ' ×' + buys[k];
}).join(' · '));
console.log('末期收支比：' + (ratio * 100).toFixed(0) + '%  ' +
    (ratio < 0.5 ? '→ 通胀（钱没地方去）' : ratio > 0.9 ? '→ 通缩（玩家一直很穷）' : '→ 健康'));
console.log('末期余额 ' + wallet.format(last.bal) + ' · 缸里 ' + last.fish + ' 条全卖可得 ' +
    wallet.format(last.value) + '（合计 ' + wallet.format(last.bal + last.value) + '）；' +
    '仓库 Lv' + last.lv + ' · ' + last.tanks + ' 缸 · 鱼位 ' + storage.slotsOf(state) + '（空 ' + storage.roomOf(state) + '）');
