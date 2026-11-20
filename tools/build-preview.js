/* ============================================================
 * tools/build-preview.js · 把 CommonJS 模块打成浏览器可用的单文件
 *
 * 微信小游戏原生支持 require/module.exports，浏览器不支持。
 * 这个脚本从 game.js 出发递归解析 require，把每个模块包进
 * 一个函数，配一个 20 行的模块加载器，输出 preview.bundle.js。
 *
 * 运行：node tools/build-preview.js
 * ============================================================ */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
/* 默认打包游戏本体；PREVIEW_ENTRY 可指向任意入口（如鱼种图鉴页） */
var ENTRY = process.env.PREVIEW_ENTRY || 'game.js';
var OUT = path.join(ROOT, process.env.PREVIEW_OUT || 'preview.bundle.js');

var modules = {};
var order = [];

/* 相对路径归一化：core/../config/x.js → config/x.js */
function normalize(p) {
    var parts = p.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (seg === '' || seg === '.') continue;
        if (seg === '..') out.pop();
        else out.push(seg);
    }
    return out.join('/');
}

function dirOf(id) {
    var i = id.lastIndexOf('/');
    return i < 0 ? '' : id.slice(0, i);
}

function load(id) {
    if (modules[id]) return;
    var abs = path.join(ROOT, id);
    if (!fs.existsSync(abs)) throw new Error('找不到模块：' + id);

    var src = fs.readFileSync(abs, 'utf8');
    modules[id] = { src: src };

    var re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(src))) {
        var req = m[1];
        if (req.charAt(0) !== '.') continue; /* 内置模块不处理 */
        load(normalize(dirOf(id) + '/' + req));
    }
    order.push(id);
}

load(ENTRY);

/* 鱼已改成纯矢量绘制（render/fishart.js），没有二进制资源要内联。
 * 以后再加 png 时，在这里转成 data URI 塞进对应模块的常量即可。
 */

/* ---------------- 生成 ---------------- */

var out = [];
out.push('/* 自动生成，请勿手改：node tools/build-preview.js */');
out.push('(function () {');
out.push('  var defs = {};');
out.push('  var cache = {};');
out.push('');
out.push('  function norm(p) {');
out.push('    var parts = p.split("/"), out = [];');
out.push('    for (var i = 0; i < parts.length; i++) {');
out.push('      var s = parts[i];');
out.push('      if (s === "" || s === ".") continue;');
out.push('      if (s === "..") out.pop(); else out.push(s);');
out.push('    }');
out.push('    return out.join("/");');
out.push('  }');
out.push('');
out.push('  function req(id) {');
out.push('    if (cache[id]) return cache[id].exports;');
out.push('    var m = { exports: {} };');
out.push('    cache[id] = m;');
out.push('    var dir = id.indexOf("/") >= 0 ? id.slice(0, id.lastIndexOf("/")) : "";');
out.push('    defs[id](m, m.exports, function (p) { return req(norm(dir ? dir + "/" + p : p)); });');
out.push('    return m.exports;');
out.push('  }');
out.push('');

var order2 = order.slice();
for (var i = 0; i < order2.length; i++) {
    var id = order2[i];
    out.push('  defs["' + id + '"] = function (module, exports, require) {');
    out.push(modules[id].src);
    out.push('  };');
    out.push('');
}

out.push('  req("' + ENTRY + '");');
out.push('})();');

fs.writeFileSync(OUT, out.join('\n'), 'utf8');

var kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('模块 ' + order2.length + ' 个 → ' + path.basename(OUT) + '（' + kb + ' KB）');
console.log(order2.join('\n'));
