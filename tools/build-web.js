/* ============================================================
 * tools/build-web.js · 把游戏打成可在浏览器直接打开的网页
 *
 * 网页版和小游戏是同一份源码，区别只在容器：
 *   · 小游戏由微信提供屏幕、触摸、存储
 *   · 网页由 tools/web-shell.html 提供（platform.js 里有对应的分支）
 *
 * 产物 web/index.html 是**单个文件**（脚本内联），
 * 双击能开，丢到任何静态托管也能开，不用管跨域和相对路径。
 *
 * 运行：node tools/build-web.js
 * ============================================================ */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var BUNDLE = path.join(ROOT, 'preview.bundle.js');
var SHELL = path.join(__dirname, 'web-shell.html');
var OUT_DIR = path.join(ROOT, 'web');
var OUT = path.join(OUT_DIR, 'index.html');

if (!fs.existsSync(BUNDLE)) {
    /* 没打包就先打一次，省得手动两步 */
    console.log('没有 preview.bundle.js，先打包……');
    require('./build-preview.js');
}

var bundle = fs.readFileSync(BUNDLE, 'utf8');

/* 内联脚本里出现 </script 会提前闭合标签。
 * 当前代码没有，但以后加了字符串常量就会踩，先防住。 */
bundle = bundle.replace(/<\/script/gi, '<\\/script');

var shell = fs.readFileSync(SHELL, 'utf8');
if (shell.indexOf('__BUNDLE__') < 0) {
    throw new Error('web-shell.html 里找不到 __BUNDLE__ 占位符');
}

var html = shell.replace('__BUNDLE__', bundle);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

/* 顺便把 bundle 单独留一份：调试时可以直接看未压缩的源码 */
fs.writeFileSync(OUT, html, 'utf8');

var kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('网页版 → web/index.html（' + kb + ' KB，单文件）');
