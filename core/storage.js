/* ============================================================
 * core/storage.js · 仓库 / 鱼位 / 鱼缸
 *
 * M3 取消了自动产币，仓库不再管「金币能存多少」（钱包已经不设上限），
 * 只剩两件事：
 *   · 鱼位：每个缸能养几条（slots）
 *   · 离线时长：回来时最多按多久结算成长（offlineHours）
 *
 * 纯逻辑：不碰 canvas / wx，可被 core 与 render 同时引用。
 * ============================================================ */

var cfg = require('../config/index.js');
var fishLib = require('./fish.js');

function conf() {
    return cfg.economy.storage;
}

/* 仓库等级：夹在 1..max 之间，脏存档也能兜住 */
function levelOf(state) {
    var list = conf().slots || [1];
    var lv = Math.floor(state.storageLv || 1);
    if (!(lv >= 1)) lv = 1;
    return Math.min(lv, list.length);
}

function maxLevel() {
    return (conf().slots || []).length;
}

/* 当前全缸每秒产出（离线结算、容量、调试面板共用） */
function rateOf(state) {
    var sum = 0;
    for (var i = 0; i < state.fish.length; i++) {
        sum += fishLib.incomePerSecond(state.fish[i]);
    }
    return sum;
}

/* 离线结算时长（小时），由仓库等级决定 */
function offlineHoursOf(state) {
    var list = conf().offlineHours || [];
    return list[levelOf(state) - 1] || 4;
}

/* ---------------- 鱼缸 ---------------- */

function maxTanks() {
    return (cfg.economy.tanks && cfg.economy.tanks.max) || 1;
}

/* 已拥有的缸数，脏存档也夹在 1..max */
function tankCountOf(state) {
    var n = Math.floor(state.tankCount || 1);
    if (!(n >= 1)) n = 1;
    return Math.min(n, maxTanks());
}

/* 当前查看的缸，永远落在已拥有的范围内 */
function activeTankOf(state) {
    var n = Math.floor(state.activeTank || 0);
    if (!(n >= 0)) n = 0;
    var last = tankCountOf(state) - 1;
    return n > last ? last : n;
}

/* 单个缸的鱼位（跟着仓库等级走） */
function slotsPerTank(state) {
    var list = conf().slots || [];
    return list[levelOf(state) - 1] || 0;
}

/* 总鱼位 = 单缸鱼位 × 缸数。买鱼/买卵都看这个数 */
function slotsOf(state) {
    return slotsPerTank(state) * tankCountOf(state);
}

function fishCountInTank(state, idx) {
    var n = 0;
    for (var i = 0; i < state.fish.length; i++) {
        if ((state.fish[i].tank || 0) === idx) n += 1;
    }
    return n;
}

/* 某个缸还剩几个位置 */
function roomInTank(state, idx) {
    var per = slotsPerTank(state);
    if (per <= 0) return Infinity;
    return Math.max(0, per - fishCountInTank(state, idx));
}

/* 还能再养几条；0 = 全部缸都满了 */
function roomOf(state) {
    var slots = slotsOf(state);
    if (slots <= 0) return Infinity;
    return Math.max(0, slots - state.fish.length);
}

/* 找一个还有空位的缸，返回下标；全满返回 -1 */
function firstRoomTank(state) {
    var n = tankCountOf(state);
    for (var i = 0; i < n; i++) {
        if (roomInTank(state, i) > 0) return i;
    }
    return -1;
}

module.exports = {
    levelOf: levelOf,
    maxLevel: maxLevel,
    rateOf: rateOf,
    offlineHoursOf: offlineHoursOf,
    slotsOf: slotsOf,
    slotsPerTank: slotsPerTank,
    roomOf: roomOf,
    roomInTank: roomInTank,
    fishCountInTank: fishCountInTank,
    firstRoomTank: firstRoomTank,
    maxTanks: maxTanks,
    tankCountOf: tankCountOf,
    activeTankOf: activeTankOf,
};
