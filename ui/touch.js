/* ============================================================
 * ui/touch.js · 触摸分发
 *
 * 优先级：弹窗 / 系统层 > 调试面板 > 面板 > 底栏五入口 > 点鱼 > 撒食。
 * 只做路由，具体动作调 core/sim.js。
 * ============================================================ */

var C = require('../render/canvas.js');
var U = require('../render/util.js');
var L = require('./layout.js');
var modalRender = require('../render/modal.js');
var sellRender = require('../render/sell.js');
var sheetRender = require('../render/sheet.js');
var debugPanel = require('./debug-panel.js');
var shop = require('../core/shop.js');
var pondCore = require('../core/pond.js');
var breedCore = require('../core/breed.js');
var dragonCore = require('../core/dragon.js');
var storage = require('../core/storage.js');
var fishLib = require('../core/fish.js');
var wallet = require('../core/wallet.js');
var platform = require('../platform.js');
var cfg = require('../config/index.js');
var view = require('./view.js');

/* ---- 长按连买（M10）----
 * 只在「商店 → 鱼饵」那一个购买键上生效：
 * 按住 320ms 开始，之后每 110ms 买一个，钱不够自动停。
 * 长按触发过就不再走普通点击，避免抬手时又多买一个。 */
var HOLD_MS = 320;
var HOLD_REPEAT_MS = 110;
var hold = null;   /* { x, y, at, last, active, fired } */

/* 当前页签下鱼饵购买键的矩形；不在商店/买不起/已满时返回 null */
function baitBuyRect(session, state) {
    if (!session.sheetOpen || session.sheetTab !== 0) return null;
    var list = shop.list(state);
    for (var i = 0; i < list.length; i++) {
        if (list[i].item.id !== 'bait') continue;
        if (list[i].disabled) return null;
        return L.buyRect(i, session.sheetEase);
    }
    return null;
}

function buyBaitOnce(env) {
    env.state.view.vp = C.viewport;
    var r = env.sim.buy(env.state, 'bait');
    if (!r.ok) {
        if (r.reason === 'poor') env.session.showToast('鱼币不够，停止购买');
        return false;
    }
    return true;
}

/**
 * 按下：只有落在鱼饵购买键上才进入长按待命状态。
 * 手势层和测试都走这里，保证测的是同一条路。
 */
function press(x, y, env) {
    var br = baitBuyRect(env.session, env.state);
    hold = (br && U.inRect(x, y, br))
        ? { ox: x, oy: y, x: x, y: y, at: platform.now(), last: 0, active: false, fired: false }
        : null;
}

/**
 * 抬手：返回 true 表示这次长按已经连买过，
 * 调用方应吞掉本次点击，避免又多买一个。
 */
function release() {
    var fired = !!(hold && hold.fired);
    hold = null;
    return fired;
}

/* 每帧由 boot.js 的主循环调用，负责长按的计时与连发 */
function step(env, dt) {
    if (!hold) return;

    var session = env.session;
    var state = env.state;
    var r = baitBuyRect(session, state);
    if (!r || !U.inRect(hold.x, hold.y, r)) { hold = null; return; }

    var now = platform.now();
    if (!hold.active) {
        if (now - hold.at < HOLD_MS) return;
        hold.active = true;
        hold.fired = true;
        hold.last = now;
        if (!buyBaitOnce(env)) { hold = null; return; }
        session.showToast('连续购买中 · 鱼饵 ×' + state.bag.bait);
        return;
    }

    if (now - hold.last >= HOLD_REPEAT_MS) {
        hold.last = now;
        if (!buyBaitOnce(env)) { hold = null; }
    }
}

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

/* 信息卡上的「捞出」：把鱼从缸里搬到仓库，鱼位立刻空出来 */
function doDump(env, fishId) {
    var r = pondCore.dumpToBag(env.state, fishId);
    if (!r.ok) {
        env.session.showToast('这条鱼已经不在了');
        return;
    }
    env.session.showToast('捞出 ' + r.name + ' · 已放进仓库');
}

/* 信息卡上的「吞噬」：吃掉一条同族金鲤鱼，升一阶 */
function doDevour(env, fishId) {
    var r = dragonCore.devour(env.state, fishId);
    if (!r.ok) {
        if (r.reason === 'no_prey') env.session.showToast('缸里和仓库都没有同族金鲤');
        else if (r.reason === 'max') env.session.showToast('已经是真龙了');
        else env.session.showToast('这条鱼还不能进化');
        return;
    }
    if (r.becameDragon) env.session.showToast('吞噬 ' + r.preyName + ' · 化龙！');
    else env.session.showToast('吞噬 ' + r.preyName + ' · 进化到 ' + r.stage);
}

/**
 * 点鱼：选中并弹出信息卡。
 * 返回 true 表示这次点击已经被消费掉，点空白处返回 false 让撒食继续。
 *
 * 优先级：
 *   信息卡按钮（屏幕坐标） > 信息卡空白 > 鱼（缸内坐标） > 水面
 * 卡在屏幕坐标、鱼在缸内坐标，所以卡片判定不做 toWorld。
 */
function handleFish(x, y, env) {
    var state = env.state;

    /* 底部那五枚悬浮按钮不是水面，先整体放行。
     * 少了这一段会出一个很隐蔽的 bug：点按钮时既没点中鱼，
     * 下面的「点空白 = 取消选中」就把选中状态清掉了。
     * 命中区永远从 ui/layout.js 取，别在这里手抄坐标。 */
    if (L.inDock(x, y)) {
        return false;
    }

    var sel = sellRender.selectedOf(state);

    /* 信息卡：先按钮，再整块卡。
     * 点在卡上（哪怕是没字的地方）都不该撒食、也不该清选中 ——
     * 否则「去点捞出」的路上先点空了一次，卡就没了。 */
    var info = sellRender.cardHitOf(state);
    if (info) {
        for (var i = 0; i < info.buttons.length; i++) {
            var btn = info.buttons[i];
            if (!btn.enabled) continue;
            if (!U.inRect(x, y, btn.rect)) continue;
            if (btn.key === 'dump') doDump(env, info.fishId);
            else if (btn.key === 'devour') doDevour(env, info.fishId);
            return true;
        }
        if (U.inRect(x, y, info.rect)) return true;
    }

    /* 命中要先把屏幕坐标换回鱼缸坐标：放大后鱼在屏幕上挪了位置，
     * 但它的 x/y 仍然是原始缸内坐标。 */
    var w = view.toWorld(x, y);
    var hit = pickFish(state, w.x, w.y);
    if (hit) {
        /* 再点同一条 = 取消选中（连卡一起收起来） */
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
            /* 换页 / 换子页都清空选择：鱼的 id 和道具 key 不能混着用 */
            session.bagSels = [];
            session.bagMode = false;
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
                else if (cr.reason === 'bag_full') {
                    session.showToast('鱼篓满了（' + pondCore.bagCapOf(state) +
                        ' 条）· 去仓库放缸或卖几条');
                } else session.showToast('这个鱼塘暂时没鱼可钓');
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

    /* 仓库页：子页签 → 内容。繁育入口钉在子页签行右边，三页都能点 */
    if (session.sheetTab === 4) {
        for (var bt = 0; bt < 3; bt++) {
            if (!U.inRect(x, y, L.bagTabRect(bt, ease))) continue;
            session.bagTab = bt;
            session.bagSels = [];
            session.bagMode = false;
            return;
        }

        if (U.inRect(x, y, L.bagBreedRect(ease))) {
            openBreed(env);
            return;
        }

        handleBag(x, y, env);
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

/* ---------------- 仓库（M15：网格 + 详情卡） ----------------
 * 交互只有三步：
 *   1. 点格子选中（单选模式点第二条会换过去；批量模式是加选）
 *   2. 详情卡上出现该物品的操作按钮
 *   3. 点按钮执行
 * 命中区、格子顺序、按钮文案全部从 render/sheet.js 那把「唯一真相」取，
 * 不在这一层重抄一遍坐标或文案。
 */

/* 执行详情卡上的按钮 */
function runBagAction(env, key) {
    var session = env.session;
    var state = env.state;

    if (key === 'breed') {
        openBreed(env);
        return;
    }

    /* 仓库鱼卵 → 培育栏位：这才是"开始孵化"的那一下。
     * 格子 key 是 'egg:<id>'，孵化用的是纯 id，前缀在这里剥掉。 */
    if (key === 'hatch' || key === 'hatchMany') {
        var ids = [];
        for (var si = 0; si < session.bagSels.length; si++) {
            var k = session.bagSels[si];
            if (k.indexOf('egg:') === 0) ids.push(k.slice(4));
        }
        var hr = breedCore.hatchEggs(state, ids);
        if (!hr.ok) {
            session.showToast(hr.reason === 'slots' ? '培育位满了 · 等一颗孵出来' : '这颗蛋已经不在了');
            return;
        }
        session.bagSels = [];
        var hmsg = '开始孵化 ' + hr.count + ' 颗 · ' + hr.seconds + ' 秒';
        if (hr.blocked > 0) hmsg += ' · ' + hr.blocked + ' 颗装不下';
        session.showToast(hmsg);
        if (env.saveNow) env.saveNow();
        return;
    }

    if (key === 'break') {
        var br = pondCore.breakOyster(state);
        if (!br.ok) session.showToast('没有珍珠贝');
        else session.showToast(br.pearl ? '开出珍珠！' : '空壳，什么也没有');
        return;
    }

    if (key === 'sellPearl') {
        var pr = pondCore.sellPearl(state);
        if (!pr.ok) session.showToast('没有珍珠');
        else session.showToast('珍珠卖出 +' + wallet.format(pr.price));
        return;
    }

    if (key === 'shop') {
        session.sheetTab = 0;
        session.bagSels = [];
        return;
    }

    if (key === 'tank') {
        var id = session.bagSels[0];
        var mv = pondCore.moveToTank(state, id);
        if (!mv.ok) session.showToast('鱼缸满了，先清出鱼位');
        else {
            session.bagSels = [];
            session.showToast('放进鱼缸 · 点鱼可查看');
        }
        return;
    }

    if (key === 'sell') {
        var sid = session.bagSels[0];
        var sc = pondCore.sellCaught(state, sid);
        session.bagSels = [];
        if (!sc.ok) session.showToast('这条鱼已经不在了');
        else session.showToast('卖掉 +' + wallet.format(sc.price));
        return;
    }

    if (key === 'tankMany') {
        var mm = pondCore.moveManyToTank(state, session.bagSels);
        if (!mm.ok) {
            session.showToast('鱼缸满了，先清出鱼位');
        } else if (mm.full > 0) {
            session.bagSels = [];
            session.showToast('放入 ' + mm.moved + ' 条 · 鱼缸满，剩 ' + mm.full + ' 条在仓库');
        } else {
            session.bagSels = [];
            session.showToast('放入鱼缸 ' + mm.moved + ' 条');
        }
        return;
    }

    if (key === 'sellMany') {
        var ms = pondCore.sellManyCaught(state, session.bagSels);
        session.bagSels = [];
        if (!ms.ok) session.showToast('这些鱼已经不在了');
        else session.showToast('卖掉 ' + ms.count + ' 条 +' + wallet.format(ms.total));
    }
}

/* 仓库整页的点击分发 */
function handleBag(x, y, env) {
    var session = env.session;
    var state = env.state;
    var ease = session.sheetEase;
    if (!session.bagSels) session.bagSels = [];

    /* 繁育入口：盖在这页之上的独立浮层 */
    if (U.inRect(x, y, L.bagBreedRect(ease))) {
        openBreed(env);
        return;
    }

    /* 批量开关：退出批量时把多选一起清掉，免得下次进来还挂着 */
    if (U.inRect(x, y, L.bagChipRect(0, ease))) {
        session.bagMode = !session.bagMode;
        if (!session.bagMode) session.bagSels = [];
        return;
    }

    /* 全选 / 清空 */
    if (U.inRect(x, y, L.bagChipRect(1, ease))) {
        var keys = sheetRender.bagKeysOf(state, session);
        if (!keys.length) return;
        if (session.bagSels.length >= keys.length) {
            session.bagSels = [];
        } else {
            session.bagSels = keys;
            session.bagMode = true;
        }
        return;
    }

    /* 详情卡按钮 */
    var actions = sheetRender.bagActionsOf(state, session);
    for (var a = 0; a < actions.length; a++) {
        if (!U.inRect(x, y, L.bagDetailBtnRect(a, actions.length, ease))) continue;
        if (actions[a].on) runBagAction(env, actions[a].key);
        else if (actions[a].key === 'hatch' || actions[a].key === 'hatchMany') {
            session.showToast('培育位满了 · 等一颗孵出来再孵');
        } else if (actions[a].key === 'tank' || actions[a].key === 'tankMany') {
            session.showToast('鱼缸满了，先升仓库等级');
        }
        return;
    }

    /* 点在卡片上（不是按钮）：吞掉。
     * 少了这一行，手指落在卡片空白处会穿透成「点空白」，把选中清掉。 */
    if (U.inRect(x, y, L.bagDetailRect(ease))) return;

    /* 格子：顺序与渲染完全一致 */
    var cells = sheetRender.bagCellsOf(state, session);
    var maxShow = Math.min(L.BAG_GRID_CAP, cells.length);
    for (var i = 0; i < maxShow; i++) {
        if (!U.inRect(x, y, L.bagCellRect(i, ease))) continue;
        var c = cells[i];
        /* 空格子没得点；在孵的蛋已经在孵了，选中它也没有按钮可给 */
        if (c.kind === 'empty' || c.kind === 'incubating') return;

        var at = session.bagSels.indexOf(c.key);
        if (session.bagMode) {
            if (at >= 0) session.bagSels.splice(at, 1);
            else session.bagSels.push(c.key);
        } else {
            session.bagSels = at >= 0 ? [] : [c.key];
        }
        return;
    }
}

/* 系统弹层：清档 / 关闭 / 点外面关。
 * 清档要连点两次（第一次只是「上膛」，3 秒内有效），避免误触。 */
function handleSys(x, y, env) {
    var session = env.session;

    if (U.inRect(x, y, L.sysBtnRect(1)) || !U.inRect(x, y, L.sysCardRect())) {
        session.sysOpen = false;
        session.sysArmed = 0;
        return;
    }

    if (U.inRect(x, y, L.sysBtnRect(0))) {
        if (session.sysArmed > 0) {
            session.sysOpen = false;
            session.sysArmed = 0;
            env.clearSave();
            return;
        }
        session.sysArmed = 3;
        session.showToast('再点一次「确认清档」');
    }
}

/* ---------------- 繁育浮层（M12） ---------------- */

/** 打开繁育：顺手把「上次选的那条」校验一遍，没选就自动挑第一条合性别的成鱼 */
function openBreed(env) {
    var session = env.session;
    var state = env.state;

    session.breedOpen = true;
    session.breedPick = '';

    var cands = breedCore.candidatesOf(state);
    var i;

    var m = session.breedMother ? breedCore.findFish(state, session.breedMother) : null;
    if (!m || m.sex !== 'f') session.breedMother = '';
    var f = session.breedFather ? breedCore.findFish(state, session.breedFather) : null;
    if (!f || f.sex !== 'm') session.breedFather = '';

    for (i = 0; i < cands.length; i++) {
        if (!session.breedMother && cands[i].fish.sex === 'f') session.breedMother = cands[i].fish.id;
        if (!session.breedFather && cands[i].fish.sex === 'm') session.breedFather = cands[i].fish.id;
    }
}

function handleBreed(x, y, env) {
    var session = env.session;
    var state = env.state;

    /* 最上层：选亲本列表 */
    if (session.breedPick) {
        var want = session.breedPick === 'mother' ? 'f' : 'm';
        var otherId = session.breedPick === 'mother' ? session.breedFather : session.breedMother;
        var all = breedCore.candidatesOf(state);
        var pool = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].fish.sex !== want || all[i].fish.id === otherId) continue;
            pool.push(all[i]);
        }
        var pc = L.pickCardRect(Math.max(1, Math.min(6, pool.length)));
        var n = Math.min(6, pool.length);
        for (var k = 0; k < n; k++) {
            if (!U.inRect(x, y, L.pickRowRect(k))) continue;
            if (session.breedPick === 'mother') session.breedMother = pool[k].fish.id;
            else session.breedFather = pool[k].fish.id;
            session.breedPick = '';
            return;
        }
        /* 取消按钮是「两个按钮宽」那一整条 */
        var cb = L.pickBtnRect(0, pc);
        if (U.inRect(x, y, { x: cb.x, y: cb.y, w: cb.w * 2 + 10, h: cb.h })) {
            session.breedPick = '';
            return;
        }
        if (!U.inRect(x, y, pc)) session.breedPick = '';
        return;
    }

    /* 关闭 */
    if (U.inRect(x, y, L.breedCloseRect())) {
        session.breedOpen = false;
        return;
    }

    /* 亲本槽 */
    if (U.inRect(x, y, L.breedParentRect(0))) {
        session.breedPick = 'mother';
        return;
    }
    if (U.inRect(x, y, L.breedParentRect(1))) {
        session.breedPick = 'father';
        return;
    }

    /* 开始繁育 */
    if (U.inRect(x, y, L.breedGoRect())) {
        var r = breedCore.breed(state, session.breedMother, session.breedFather);
        if (!r.ok) {
            session.showToast(r.text || '还不能繁育');
        } else {
            session.showToast('产卵成功 · 已放进仓库鱼卵' + (r.twin ? ' · 双生！' : ''));
            if (env.saveNow) env.saveNow();
        }
        return;
    }

    /* 培育栏位：只做提示，真正的落篓在 sim 每帧的 tick 里 */
    var total = breedCore.hatchSlotsOf(state);
    for (var h = 0; h < total; h++) {
        if (!U.inRect(x, y, L.hatchSlotRect(h))) continue;
        var eggs = breedCore.hatchList(state);
        var e = eggs[h];
        if (!e) session.showToast('空位 · 去仓库鱼卵页点「孵化」占位');
        else if (e.ready) session.showToast(breedCore.bagRoom(state) >= (e.twin ? 2 : 1) ? '正在进鱼篓' : '鱼篓满了，先卖几条');
        else session.showToast('还要 ' + e.left + ' 秒');
        return;
    }

    /* 点卡片外面 = 关掉 */
    if (!U.inRect(x, y, L.breedCardRect())) session.breedOpen = false;
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

    /* 1.5 系统弹层：同样阻塞一切 */
    if (session.sysOpen) {
        handleSys(x, y, env);
        return;
    }

    /* 1.6 繁育浮层：盖在面板之上，进来之后先吃点击 */
    if (session.breedOpen) {
        handleBreed(x, y, env);
        return;
    }

    /* 2. 调试面板 */
    if (debugPanel.tap(x, y, session, env)) return;

    /* 3. 连点金币胶囊开调试面板 */
    debugPanel.registerTap(x, y, session, L);

    /* 4. 缸内不再有缩放按钮：缩放靠双指、平移靠滑动，这里直接放行。
     *    （M10 删掉了原来的 +/− 命中区，玻璃整块还给鱼） */

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

    /* 6. 点鱼：选中并弹出信息卡（捞出 / 吞噬都在卡上） */
    if (handleFish(x, y, env)) return;

    /* 7. 底栏五入口：商店 / 仓库 / 鱼塘 / 图鉴 / 系统。
     *    前四个直接打开面板并对准页签，省掉「先开面板再点页签」的一步；
     *    「系统」开自己的弹层，不再借商店面板当系统入口。 */
    var bar = [
        { r: L.STORE_BTN, tab: 0 },
        { r: L.BAG_BTN, tab: 4 },
        { r: L.POND_BTN, tab: 3 },
        { r: L.CODEX_BTN, tab: 2 }
    ];
    for (var bi = 0; bi < bar.length; bi++) {
        if (!U.inRect(x, y, bar[bi].r)) continue;
        session.sheetOpen = true;
        session.sheetTab = bar[bi].tab;
        session.codexDetail = null;
        session.bagSels = [];
        return;
    }
    if (U.inRect(x, y, L.SYS_BTN)) {
        session.sysOpen = true;
        session.sysArmed = 0;
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

    function nowMs() { return platform.now(); }

    platform.onTouchStart(function (e) {
        var ts = e.touches && e.touches.length ? e.touches : [];

        /* 三指同时点屏：切换诊断条。正常游戏里不可能误触 */
        if (ts.length >= 3) {
            var diag = require('./diag.js');
            diag.state.forceShow = !diag.state.forceShow;
            pending = drag = pinch = null;
            hold = null;
            return;
        }

        if (ts.length >= 2) {
            var m = mid(ts[0], ts[1]);
            pinch = { d: dist(ts[0], ts[1]), x: m.x, y: m.y };
            pending = null;
            drag = null;
            hold = null;
            view.stop();
            return;
        }

        if (ts.length === 1) {
            var x = ts[0].clientX;
            var y = ts[0].clientY;
            pending = { x: x, y: y };
            drag = { x: x, y: y, t: nowMs(), lastMoveAt: 0, vx: 0, vy: 0 };

            /* 按住鱼饵购买键 = 准备连买，计时由 step() 推进 */
            press(x, y, env);
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

        if (!drag || !ts.length) return;
        var p = ts[0];

        /* 长按中手指滑出按钮太远：取消这次长按，交给普通拖动 */
        if (hold) {
            hold.x = p.clientX;
            hold.y = p.clientY;
            if (Math.abs(p.clientX - hold.ox) > 14 || Math.abs(p.clientY - hold.oy) > 14) hold = null;
        }

        var moved = dist(p, { clientX: drag.x, clientY: drag.y });
        if (moved < 8) return;

        /* 单指在玻璃里滑动 = 平移（放大后才有实际位移，clamp 会兜住）。
         * 一旦判定为拖动，这次抬手就不再当成点击（不会误撒食/误卖鱼）。 */
        var dx = p.clientX - drag.x;
        var dy = p.clientY - drag.y;
        var canPan = view.inGlass(drag.x, drag.y);
        if (canPan) view.pan(dx, dy);

        /* 记录速度给抬手后的惯性用，做一次平滑免得单帧抖动把画面甩飞 */
        var t = nowMs();
        var dms = Math.max(1, t - drag.t);
        drag.vx = drag.vx * 0.3 + (dx / dms * 1000) * 0.7;
        drag.vy = drag.vy * 0.3 + (dy / dms * 1000) * 0.7;
        drag.t = t;
        drag.lastMoveAt = t;
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

        /* 长按连买已经出过手：这次抬手不再当成一次点击，避免多买一个 */
        if (release()) {
            pending = null;
            drag = null;
            return;
        }

        if (!pending) {
            /* 这是一次拖动：把最后的余速交给惯性，让画面再滑一小段 */
            if (drag && drag.lastMoveAt && nowMs() - drag.lastMoveAt < 140) {
                var cap = 2400;
                var vx = Math.max(-cap, Math.min(cap, drag.vx));
                var vy = Math.max(-cap, Math.min(cap, drag.vy));
                if (Math.abs(vx) > 120 || Math.abs(vy) > 120) view.fling(vx, vy);
            }
            drag = null;
            return;
        }

        var p = pending;
        pending = null;
        drag = null;

        /* 放大状态下双击鱼缸还原；未放大时仍走正常点击，不影响连续撒食。 */
        var nowT = Date.now();
        if (view.state.zoom > 1.001 && lastTap && nowT - lastTap.t < 350 &&
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
    tap: tap,
    step: step,
    press: press,
    release: release
};
