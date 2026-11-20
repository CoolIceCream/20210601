/* 临时可视化：直接打开鱼卵页，核对 1% 隐藏款提示有没有挤坏卡片。 */
var screen = require('../render/canvas.js');
var stateModule = require('../core/state.js');
var sim = require('../core/sim.js');
var session = require('../ui/session.js');
var renderer = require('../render/index.js');

var s = stateModule.bootstrapFresh();
s.view.vp = screen.viewport;
sim.ensurePlacement(s, screen.viewport);
session.sheetOpen = true;
session.sheetEase = 1;
session.sheetTab = 1;
renderer.init(s);
renderer.draw(s, session, 0.016);
