/* 临时可视化：把小鲨鱼放进真实鱼缸场景，核对它在 HUD/水体里的观感。
 * 生成：PREVIEW_ENTRY=tools/shark-scene.js PREVIEW_OUT=tools/shark-scene.bundle.js node tools/build-preview.js
 * 打开：tools/shark-scene.html */
var screen = require('../render/canvas.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');
var session = require('../ui/session.js');
var renderer = require('../render/index.js');
var fishLib = require('../core/fish.js');

var s = stateModule.bootstrapFresh();
s.fish = [];
var ids = ['gold_fish', 'blue_zebra', 'peach_koi', 'gold_lamp', 'violet', 'jade'];
for (var i = 0; i < ids.length; i++) {
    s.fish.push(fishLib.create(ids[i], { growth: 55 + i * 6, tank: 0 }));
}
var shark = fishLib.create('reef_shark', { growth: 88, hunger: 76, tank: 0 });
s.fish.push(shark);

sim.ensurePlacement(s, screen.viewport);
s.view.vp = screen.viewport;
renderer.init(s);
renderer.draw(s, session, 0.016);
