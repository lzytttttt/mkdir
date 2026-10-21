/* 启动入口：所有核心与关卡脚本已加载，由 game.js 在 DOMContentLoaded 后启动 */
(function () {
  'use strict';
  // 版本标记（便于 QA / 控制台确认）
  window.NF = window.NF || {};
  NF.version = '0.4.0';
  console.log('%c新建文件夹 %cv' + NF.version + ' %c— 一个假装是操作系统的游戏',
    'color:#ffc94d;font-weight:900;font-size:14px',
    'color:#8a6cff',
    'color:#8ea0cf');
})();
