/* ============================================================
 * core/sim.js · 玩法模拟（逻辑层核心）
 *
 * 这一层完全不碰 canvas / ctx，只吃 dt 和视口尺寸。
 * 也就是说：把渲染关掉，只要一直喂 dt，经济和成长依然会推进
 * —— 这是 M0 分层的关键验收点（见 tools/headless-test.js）。
 *
 * 视口对象 vp 需要 { w, h, ground }，由入口在启动时传入。
 * ============================================================ */

var cfg = require('../config/index.js');
var fishLib = require('./fish.js');
var shop = require('./shop.js');
var storage = require('./storage.js');
var predation = require('./predation.js');
var breed = require('./breed.js');

var E = cfg.economy;
var P = E.predator || {};

function rand(a, b) {
    return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/* 水体的上边界：M4 之后屏幕顶部是缸盖，鱼不能游进去。
 * 旧调用方（测试脚本）传的 vp 没有 top，按 0 处理，行为不变。 */
function topOf(vp) {
    return vp && vp.top ? vp.top : 0;
}

/* 缸壁厚度：鱼要留在这条线里面，否则会被玻璃裁掉半个身子 */
function sideOf(vp) {
    return vp && vp.x0 ? vp.x0 : 0;
}

/* ---------------- 视图事件 ---------------- */

function spawnBubble(state, x, y, vp) {
    state.view.bubbles.push({
        x: x == null ? rand(0, vp.w) : x,
        y: y == null ? vp.ground + 6 : y,
        r: rand(1.6, 5.2),
        vy: rand(26, 62),
        sway: rand(0, 6.28),
        amp: rand(4, 16)
    });
}

function addFloat(state, x, y, text, color) {
    state.view.floaters.push({
        x: x,
        y: y,
        text: text,
        color: color || '#ffe27a',
        life: 1.25,
        t: 0
    });
}

/* ---------------- 初始化 ---------------- */

/* 给没有位置的鱼分配随机位置（读档后的鱼只有数据没有坐标） */
function ensurePlacement(state, vp) {
    for (var i = 0; i < state.fish.length; i++) {
        var f = state.fish[i];
        /* 坐标缺失、为 0、或者超出当前屏幕（换设备/转屏）都重排 */
        var bad = f.x == null || f.y == null ||
            !(f.x > 0) || !(f.y > 0) ||
            f.x > vp.w || f.y > vp.h;
        if (bad) {
            var t0 = topOf(vp);
            var xa = sideOf(vp);
            f.x = rand(xa + (vp.w - xa * 2) * 0.12, vp.w - xa - (vp.w - xa * 2) * 0.12);
            f.y = rand(t0 + (vp.h - t0) * 0.16, vp.ground - 64);
        }
    }
}

function seedBubbles(state, vp, n) {
    for (var i = 0; i < (n || 10); i++) {
        spawnBubble(state, rand(0, vp.w), rand(0, vp.h), vp);
    }
}

/* ---------------- 操作 ---------------- */

function feedAt(state, x, y, count, vp) {
    if (state.foods.length > 150) return 0;
    state.hint = 0;
    for (var i = 0; i < count; i++) {
        state.foods.push({
            x: x + rand(-46, 46),
            y: y + rand(-26, 26),
            vx: rand(-26, 26),
            vy: rand(4, 18),
            r: rand(2.2, 3.6),
            rot: rand(0, 6.28),
            settled: false,
            fade: 0,
            dead: false
        });
    }
    for (var k = 0; k < 4; k++) spawnBubble(state, x + rand(-24, 24), y + rand(-10, 10), vp);
    state.stats.feedCount += 1;
    return count;
}

/* 本次撒几粒：鱼越多撒越多，保证喂得过来 */
function pelletsFor(state, base) {
    var f = E.feeding;
    /* 只喂当前缸：撒多了会沉底浪费，撒少了远处的鱼抢不到 */
    var here = storage.fishCountInTank(state, storage.activeTankOf(state));
    var n = base + Math.floor(here / (f.pelletsPerFish || 3));
    return Math.min(f.pelletsMax || 24, n);
}

/* 玩家撒食（带冷却）。返回是否真的撒出去了 */
function feed(state, x, y, count, vp) {
    if (state.feedCd > 0) return false;
    state.feedCd = E.feeding.cooldown;
    feedAt(state, x, y, count, vp);
    return true;
}

/* 点按钮撒食：落在水面上方中间区域 */
function feedCenter(state, vp) {
    return feed(state, vp.w / 2 + rand(-vp.w * 0.14, vp.w * 0.14), vp.h * 0.18, pelletsFor(state, E.feeding.pelletsButton), vp);
}

/* 品质配色（飘字用，与商店卡片共用 config/rarityColor） */
function rarityColor(rarity) {
    return cfg.rarityColor[rarity] || '#8fe9ff';
}

/* 购买道具，返回 shop.buy 的结果，附带飘字 */
function buy(state, id) {
    var r = shop.buy(state, id);
    if (r.ok) {
        ensurePlacement(state, state.view.vp || { w: 390, h: 844 });
        var label = r.species ? (r.species.rarity + ' · ' + r.species.name) : r.name;
        var color = r.species ? rarityColor(r.species.rarity) : '#8fe9ff';
        addFloat(state, (state.view.vp ? state.view.vp.w : 195) / 2, (state.view.vp ? state.view.vp.h : 844) * 0.42, label, color);
    }
    return r;
}

/* 买鱼卵：按品质买，开出哪条靠抽 —— 所以提示要报出「中了什么」 */
function buyEgg(state, rarity) {
    var r = shop.buyEgg(state, rarity);
    if (r.ok) {
        ensurePlacement(state, state.view.vp || { w: 390, h: 844 });
        var vp = state.view.vp || { w: 390, h: 844 };
        /* 不显示 R/SR/SSR 字母，只报鱼名（M8 起货架也去掉了字母角标） */
        addFloat(state, vp.w / 2, vp.h * 0.42,
            r.species.name, rarityColor(r.species.rarity));
    }
    return r;
}

/* 卖鱼：金币入账，飘一条「+N」给玩家确认成交 */
function sellFish(state, fishId) {
    var r = shop.sellFish(state, fishId);
    if (r.ok) {
        var vp = state.view.vp || { w: 390, h: 844 };
        addFloat(state, vp.w / 2, vp.h * 0.42, '+' + r.price, '#ffd166');
    }
    return r;
}

/* ---------------- 单条鱼的更新 ---------------- */

function updateFish(state, f, dt, vp) {
    var size = fishLib.sizeOf(f);
    var speedBase = 24 + f.growth * 0.13;
    var pred = predation.isPredator(f);
    var prey = null;

    /* 捕食者不吃鱼饵：连找都不找。饿到阈值以下才去追同缸的鱼。 */
    if (pred) {
        var canHunt = predation.tickCooldown(f, dt) &&
            f.hunger < (P.huntBelow == null ? 72 : P.huntBelow);
        if (canHunt) prey = predation.findPrey(state, f);
    }

    /* 找最近的食物（只有普通鱼走这条） */
    var target = null;
    var bestD = Infinity;
    if (!pred) {
        for (var i = 0; i < state.foods.length; i++) {
            var fd = state.foods[i];
            if (fd.dead) continue;
            var fdx = fd.x - f.x;
            var fdy = fd.y - f.y;
            var d2 = fdx * fdx + fdy * fdy;
            if (d2 < bestD) {
                bestD = d2;
                target = fd;
            }
        }
    }

    var wantX, wantY, speed;
    var chaseRange = vp.w + vp.h;   /* 全缸都能看到食物，避免远处的鱼饿死 */

    if (pred && prey) {
        var pdx = prey.x - f.x;
        var pdy = prey.y - f.y;
        var pdd = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        wantX = pdx / pdd;
        wantY = pdy / pdd;
        speed = speedBase * (P.chaseSpeedMul == null ? 2.1 : P.chaseSpeedMul) +
            (P.chaseSpeedBonus == null ? 34 : P.chaseSpeedBonus);
    } else if (!pred && target && bestD < chaseRange * chaseRange) {
        var dx = target.x - f.x;
        var dy = target.y - f.y;
        var dd = Math.sqrt(dx * dx + dy * dy) || 1;
        wantX = dx / dd;
        wantY = dy / dd;
        /* 已经吃饱的鱼抢食不积极，把饲料让给饿的鱼（不然一条鱼能吃光全缸） */
        speed = (speedBase * 1.9 + 26) * (f.hunger >= 88 ? 0.42 : 1);
    } else {
        f.headingT -= dt;
        if (f.headingT <= 0) {
            f.headingT = rand(1.6, 3.6);
            var a = rand(-0.75, 0.75);
            f.tx = Math.cos(a) * (f.vx >= 0 ? 1 : -1);
            f.ty = Math.sin(a) * 0.55;
        }
        var m = 46 + size;
        var x0 = sideOf(vp);
        if (f.x < x0 + m) f.tx = Math.abs(f.tx);
        if (f.x > vp.w - x0 - m) f.tx = -Math.abs(f.tx);
        if (f.y < topOf(vp) + m * 0.9) f.ty = Math.abs(f.ty);
        if (f.y > vp.ground - m * 0.7) f.ty = -Math.abs(f.ty);
        var m2 = Math.sqrt(f.tx * f.tx + f.ty * f.ty) || 1;
        wantX = f.tx / m2;
        wantY = f.ty / m2;
        speed = speedBase * (f.hunger < 25 ? 0.6 : 1);
    }

    /* 鱼群分离：所有鱼都冲向同一粒饲料时会叠成一坨，
     * 这里给每个同伴加一点排斥，抢食时也要保持各自的位置 */
    var sepX = 0;
    var sepY = 0;
    for (var q = 0; q < state.fish.length; q++) {
        var other = state.fish[q];
        if (other === f || other.eaten) continue;
        /* 追猎物时别把自己推开，否则 shark 永远咬不到 */
        if (pred && other === prey) continue;
        var ox = f.x - other.x;
        var oy = f.y - other.y;
        var od2 = ox * ox + oy * oy;
        var minD = (size + fishLib.sizeOf(other)) * 0.62;
        if (od2 < minD * minD && od2 > 0.01) {
            var od = Math.sqrt(od2);
            var push = 1 - od / minD;
            sepX += (ox / od) * push;
            sepY += (oy / od) * push;
        }
    }
    var sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
    if (sepLen > 0.001) {
        /* 保留原目标方向，叠加排斥，再归一化。
         * 排斥强度随「挤在一起的同伴数」增长（sepLen 是各邻居推力的叠加），
         * 否则 15 条鱼抢同一粒饲料时会变成一坨，只靠方向归一化推不开。 */
        var sepMag = Math.min(1.9, 0.7 + sepLen * 0.5);
        var wx = wantX * 0.5 + (sepX / sepLen) * sepMag;
        var wy = wantY * 0.5 + (sepY / sepLen) * sepMag;
        var wl = Math.sqrt(wx * wx + wy * wy) || 1;
        wantX = wx / wl;
        wantY = wy / wl;
    }

    var k = 1 - Math.pow(0.0015, dt);
    f.vx = lerp(f.vx, wantX * speed, k);
    f.vy = lerp(f.vy, wantY * speed, k);

    f.x += f.vx * dt;
    f.y += f.vy * dt + Math.sin(state.t * 1.6 + f.phase) * 7 * dt;

    var pr = size * 0.5;
    var xl = sideOf(vp) + pr;
    var xr = vp.w - sideOf(vp) - pr;
    if (f.x < xl) { f.x = xl; f.vx = Math.abs(f.vx); f.tx = Math.abs(f.tx); }
    if (f.x > xr) { f.x = xr; f.vx = -Math.abs(f.vx); f.tx = -Math.abs(f.tx); }
    if (f.y < topOf(vp) + pr) { f.y = topOf(vp) + pr; f.vy = Math.abs(f.vy); f.ty = Math.abs(f.ty); }
    if (f.y > vp.ground - pr) { f.y = vp.ground - pr; f.vy = -Math.abs(f.vy); f.ty = -Math.abs(f.ty); }

    /* 捕食者咬到猎物：标记掉，帧末统一移除 */
    if (pred && prey && !prey.eaten) {
        var er = (size + fishLib.sizeOf(prey)) * (P.eatRadiusMul == null ? 0.42 : P.eatRadiusMul);
        var pex = prey.x - f.x;
        var pey = prey.y - f.y;
        if (pex * pex + pey * pey < er * er) {
            var meal = predation.eat(state, f, prey);
            if (meal) {
                addFloat(state, f.x, f.y - size * 0.95, '吃掉 ' + meal.name, '#ff9e94');
                for (var sb = 0; sb < 5; sb++) spawnBubble(state, meal.x, meal.y, vp);
            }
        }
    }

    /* 吃鱼饵：只有普通鱼走这条。
     * 捕食者连找都不找，饲料从它嘴边沉下去也不会被吃掉。 */
    var F = E.feeding;
    if (!pred) {
        var eatR = size * 0.52 + 7;
        for (var j = 0; j < state.foods.length; j++) {
            var food = state.foods[j];
            if (food.dead) continue;
            /* 已经吃饱的鱼不去抢还在下落的饲料，只吃沉底的剩料（折成鱼币） */
            if (f.hunger >= 92 && !food.settled) continue;
            var ex = food.x - f.x;
            var ey = food.y - f.y;
            if (ex * ex + ey * ey < eatR * eatR) {
                food.dead = true;
                state.stats.pelletsEaten = (state.stats.pelletsEaten || 0) + 1;
                var wasFull = f.hunger >= 95;
                var wasMax = f.growth >= 100;

                f.hunger = Math.min(100, f.hunger + F.hungerPerPellet + state.foodLv * F.hungerPerLevel);
                if (!wasFull) {
                    /* 没吃饱：按成长曲线吃，越接近成鱼单粒收益越低 */
                    f.growth = Math.min(100, f.growth + fishLib.feedGrowthPerPellet(f, state.foodLv));
                } else if (!wasMax) {
                    /* 饱了但还没长成：只长一点点，主要为了不浪费饲料 */
                    f.growth = Math.min(100, f.growth + F.growthWhenFull);
                }
                f.belly = Math.min(1, f.belly + 0.5);

                if (wasFull || wasMax) {
                    state.acc.fish += F.overflowCoin;
                    f.feedCoin += F.overflowCoin;
                    if (f.feedCoin >= 1) {
                        var n = Math.floor(f.feedCoin);
                        f.feedCoin -= n;
                        addFloat(state, f.x, f.y - size * 0.85, '+' + n);
                    }
                }

                for (var b = 0; b < 3; b++) spawnBubble(state, food.x, food.y, vp);
                break;
            }
        }
    }

    /* 「易养」词条：饱食消耗按比例降低，最低保留 45%（再低就等于不用喂了） */
    var feedMul = Math.max(0.45, 1 - fishLib.traitEffect(f, 'feed') / 100);
    f.hunger = Math.max(0, f.hunger - F.hungerDecay * feedMul *
        (pred ? (P.hungerDecayMul == null ? 1 : P.hungerDecayMul) : 1) * dt);

    /* 自然成长：不喂食也会长大，喂食只是加速 */
    if (f.growth < 100) {
        var pg = fishLib.passiveGrowthPerSecond(f);
        if (pg > 0) f.growth = Math.min(100, f.growth + pg * dt);
    }

    /* 刚长成：给一次反馈，让「养成」有个节点感 */
    if (!f.adultMark && f.growth >= 100) {
        f.adultMark = true;
        addFloat(state, f.x, f.y - size * 1.1, '成鱼啦', '#7fe3c0');
    }

    /* 心情：向「由饱食度算出的目标值」平滑靠拢 */
    var MT = F.mood;
    var mt = clamp((f.hunger - MT.lowAt) / Math.max(1, MT.highAt - MT.lowAt), 0, 1);
    var moodTarget = MT.base + (MT.full - MT.base) * mt;
    f.mood += (moodTarget - f.mood) * (1 - Math.pow(MT.ease, dt));
    f.belly = Math.max(0, f.belly - 0.22 * dt);
}

/**
 * 非当前缸的鱼：玩家看不到，所以不做游动/吃食的物理模拟。
 * 但饥饿、成长、心情必须继续推进，否则切过去会看到一缸快饿死的鱼。
 * 普通鱼按「托管喂养」处理 —— 饥饿稳定在 80 附近；
 * 捕食者不能蹭这份托管饲料，只能按同样的冷却吃同缸的鱼。
 */
function updateFishManaged(state, f, dt) {
    var F = E.feeding;
    var pred = predation.isPredator(f);

    if (pred) {
        if (predation.tickCooldown(f, dt) &&
            f.hunger < (P.huntBelow == null ? 72 : P.huntBelow)) {
            var prey = predation.findPrey(state, f);
            if (prey) predation.eat(state, f, prey);
        }
        f.hunger = Math.max(0, f.hunger - F.hungerDecay *
            (P.hungerDecayMul == null ? 1 : P.hungerDecayMul) * dt);
    } else if (f.hunger < 80) {
        f.hunger = Math.min(80, f.hunger + 2.6 * dt);
    } else {
        f.hunger = Math.max(80, f.hunger - F.hungerDecay * 0.6 * dt);
    }

    if (f.growth < 100) {
        var pg = fishLib.passiveGrowthPerSecond(f);
        if (pg > 0) f.growth = Math.min(100, f.growth + pg * dt);
    }
    /* 不在屏幕上的缸不飘字，直接标记 */
    if (!f.adultMark && f.growth >= 100) f.adultMark = true;

    var MT = F.mood;
    var mt = clamp((f.hunger - MT.lowAt) / Math.max(1, MT.highAt - MT.lowAt), 0, 1);
    var moodTarget = MT.base + (MT.full - MT.base) * mt;
    f.mood += (moodTarget - f.mood) * (1 - Math.pow(MT.ease, dt));
    f.belly = Math.max(0, f.belly - 0.22 * dt);
}

/**
 * 切缸。清掉旧缸的食物/气泡/飘字，给新缸的鱼重排位置。
 * 返回是否真的切了（点同一个缸返回 false）。
 */
function setActiveTank(state, idx, vp) {
    var n = storage.tankCountOf(state);
    var i = Math.floor(idx || 0);
    if (i < 0) i = 0;
    if (i > n - 1) i = n - 1;
    if (i === storage.activeTankOf(state)) return false;

    state.activeTank = i;
    state.foods.length = 0;
    state.view.bubbles.length = 0;
    state.view.floaters.length = 0;
    state.feedCd = 0;

    if (vp) {
        for (var k = 0; k < state.fish.length; k++) {
            var f = state.fish[k];
            if ((f.tank || 0) !== i) continue;
            var t1 = topOf(vp);
            var xb = sideOf(vp);
            f.x = rand(xb + (vp.w - xb * 2) * 0.12, vp.w - xb - (vp.w - xb * 2) * 0.12);
            f.y = rand(t1 + (vp.h - t1) * 0.2, vp.ground - 60);
        }
        seedBubbles(state, vp, 10);
    }
    return true;
}

/* ---------------- 主步进 ---------------- */

/**
 * 推进 dt 秒。返回 true 表示这一帧到了存档点（由入口执行落盘）。
 */
function step(state, dt, vp) {
    if (!(dt > 0)) return false;

    state.view.vp = vp;
    /* 兜底：任何没有坐标的鱼（新建、读档、外部直接调用 shop.buy）先放到缸里，
     * 否则 f.x + vx*dt 会变成 NaN，这条鱼就永远吃不到东西。 */
    ensurePlacement(state, vp);
    state.t += dt;
    state.stats.playSeconds += dt;

    if (state.feedCd > 0) state.feedCd -= dt;

    /* 自动喂食器 */
    if (state.auto) {
        state.autoT -= dt;
        if (state.autoT <= 0) {
            state.autoT = E.autoFeeder.interval;
            feedAt(state, rand(vp.w * 0.2, vp.w * 0.8), rand(vp.h * 0.12, vp.h * 0.3), pelletsFor(state, E.autoFeeder.pellets), vp);
        }
    }

    /* 气泡 */
    state.spawnBubbleT -= dt;
    if (state.spawnBubbleT <= 0) {
        state.spawnBubbleT = rand(0.16, 0.5);
        spawnBubble(state, null, null, vp);
    }
    for (var i = state.view.bubbles.length - 1; i >= 0; i--) {
        var bb = state.view.bubbles[i];
        bb.y -= bb.vy * dt;
        bb.sway += dt * 2.6;
        if (bb.y < -20) state.view.bubbles.splice(i, 1);
    }

    /* 食物 */
    for (var fi = 0; fi < state.foods.length; fi++) {
        var fd = state.foods[fi];
        if (fd.dead) continue;
        if (fd.settled) {
            fd.fade += dt;
            if (fd.fade > 14) fd.dead = true;
        } else {
            fd.vy = Math.min(fd.vy + 58 * dt, 44);
            fd.x += fd.vx * dt + Math.sin(state.t * 2 + fd.rot) * 7 * dt;
            fd.y += fd.vy * dt;
            fd.vx *= 1 - Math.min(1, 1.1 * dt);
            if (fd.y >= vp.ground - 5) {
                fd.y = vp.ground - 5;
                fd.settled = true;
            }
        }
    }

    /* 鱼：只模拟玩家看到的那一缸，其余缸走托管 */
    var actTank = storage.activeTankOf(state);
    for (var f = 0; f < state.fish.length; f++) {
        var one = state.fish[f];
        /* 这条鱼可能已经被别的鲨鱼在这一帧吃掉了 */
        if (one.eaten) continue;
        if ((one.tank || 0) === actTank) updateFish(state, one, dt, vp);
        else updateFishManaged(state, one, dt);
    }
    predation.removeEaten(state);

    /* M12 繁育：到点的蛋落进培育缸，子代在培育缸里按同一条成长曲线长大。
     * 培育缸满了就留在孵化槽里等位置，不会凭空消失。 */
    var bornNow = breed.tick(state);
    for (var bi = 0; bi < bornNow.length; bi++) {
        addFloat(state, vp.w / 2, vp.h * 0.34, '孵化完成', '#a8e0c4');
    }
    breed.growNursery(state, dt);

    var maxX = vp.w + 60;
    state.foods = state.foods.filter(function (x) {
        return !x.dead && x.x > -60 && x.x < maxX;
    });

    /* M3：鱼不再自动产币。
     * 金币的唯一来源是「卖鱼」（core/shop.js · sellFish），
     * 所以这里既没有 income 结算，也没有「仓库满了停止入账」这回事。
     * 鱼的产出属性仍然保留 —— 它现在决定「这条鱼值多少钱」。 */

    /* 飘字 */
    for (var q = state.view.floaters.length - 1; q >= 0; q--) {
        var fl = state.view.floaters[q];
        fl.t += dt;
        if (fl.t > fl.life) state.view.floaters.splice(q, 1);
    }

    if (state.hint > 0) state.hint = Math.max(0, state.hint - dt * 0.08);

    state.saveT += dt;
    if (state.saveT > E.save.intervalSeconds) {
        state.saveT = 0;
        return true;
    }
    return false;
}

module.exports = {
    step: step,
    feed: feed,
    feedAt: feedAt,
    feedCenter: feedCenter,
    pelletsFor: pelletsFor,
    buy: buy,
    buyEgg: buyEgg,
    sellFish: sellFish,
    ensurePlacement: ensurePlacement,
    setActiveTank: setActiveTank,
    updateFishManaged: updateFishManaged,
    seedBubbles: seedBubbles,
    addFloat: addFloat,
    spawnBubble: spawnBubble
};
