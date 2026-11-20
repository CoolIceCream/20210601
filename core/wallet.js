/* ============================================================
 * core/wallet.js · 双货币账本
 *
 * 所有加减币都必须走这里，不允许业务代码直接改 state.coins，
 * 这样才能保证：不会出现负数、上限生效、每一笔都有流水可查。
 * ============================================================ */

var platform = require('../platform.js');

var LEDGER_MAX = 60;

/* M3 起金币不再有存储上限。
 * 取消了自动产币之后，收入全靠卖鱼，一条金龙鱼就值 20 万；
 * 任何「产出 × 秒数」的上限都会把卖鱼的钱直接吞掉。 */
function capOf() {
    return 0;
}

function balance(state, currency) {
    var v = state.coins[currency];
    return v > 0 ? v : 0;
}

/* 显示用：向下取整，避免出现 119.999 这种 */
function display(state, currency) {
    return Math.floor(balance(state, currency));
}

/* 大数缩写，放置类必备：12345 → 1.2万 */
function trimZero(s) {
    return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

function format(n) {
    var v = Math.floor(n || 0);
    if (v < 10000) return String(v);
    if (v < 100000000) {
        var w = v / 10000;
        /* 9999.96 万这种会被四舍五入成 10000万，得进位成 1亿 */
        if (w >= 9999.95) return trimZero((v / 100000000).toFixed(2)) + '亿';
        return trimZero(w.toFixed(1)) + '万';
    }
    return trimZero((v / 100000000).toFixed(2)) + '亿';
}

function pushLedger(state, currency, amount, reason) {
    state.ledger.push({
        at: platform.now(),
        cur: currency,
        amount: amount,
        reason: reason || ''
    });
    while (state.ledger.length > LEDGER_MAX) state.ledger.shift();
}

/**
 * 加钱。返回实际入账数量（当前无上限，恒等于 amount）。
 */
function add(state, currency, amount, reason) {
    if (!(amount > 0)) return 0;

    var cap = capOf(state, currency);
    var cur = balance(state, currency);
    var real = amount;

    if (cap > 0 && cur + amount > cap) {
        real = cap - cur;
        if (real < 0) real = 0;
    }

    if (real > 0) {
        state.coins[currency] = cur + real;
        state.stats['earned_' + currency] = (state.stats['earned_' + currency] || 0) + real;
        pushLedger(state, currency, real, reason);
    }
    return real;
}

/**
 * 扣钱。余额不足返回 false，且不产生任何改动。
 * 判断用整数部分（鱼币有小数累加器，不能花掉半枚）。
 */
function spend(state, currency, amount, reason) {
    if (!(amount > 0)) return true;
    if (display(state, currency) < amount) return false;
    state.coins[currency] = balance(state, currency) - amount;
    state.stats['spent_' + currency] = (state.stats['spent_' + currency] || 0) + amount;
    pushLedger(state, currency, -amount, reason);
    return true;
}

function canAfford(state, currency, amount) {
    return display(state, currency) >= amount;
}

module.exports = {
    add: add,
    spend: spend,
    balance: balance,
    display: display,
    format: format,
    canAfford: canAfford,
    capOf: capOf
};
