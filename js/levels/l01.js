/* 第 1 关：右键入门 —— 右键 → 新建 → 文件夹 → 确定 */
(function () {
  'use strict';
  var ID = 1;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'folder',
    init: function (ctx) {
      var created = false;
      var menuCtrl = null;
      var dlg = null;

      function items() {
        return [
          {
            id: 'view', label: '查看', icon: 'eye',
            submenu: [
              { id: 'v-large', label: '大图标', icon: 'grid' },
              { id: 'v-medium', label: '中等图标', icon: 'grid' },
              { id: 'v-small', label: '小图标', icon: 'grid' }
            ]
          },
          {
            id: 'sort', label: '排序方式', icon: 'arrowDown',
            submenu: [
              { id: 's-name', label: '名称', icon: 'fileText' },
              { id: 's-size', label: '大小', icon: 'file' },
              { id: 's-date', label: '修改日期', icon: 'clock' }
            ]
          },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
          { separator: true },
          {
            id: 'new', label: '新建', icon: 'folder',
            submenu: [
              { id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', onSelect: function () { openNameDialog(); } },
              { id: 'shortcut', label: '快捷方式', icon: 'arrowRight' },
              { separator: true },
              { id: 'text', label: '文本文档', icon: 'fileText' },
              { id: 'image', label: '图片', icon: 'fileImage' }
            ]
          },
          { separator: true },
          { id: 'display', label: '显示设置', icon: 'computer', onSelect: function () { NF.Audio.play('deny'); } },
          { id: 'personalize', label: '个性化', icon: 'settings', onSelect: function () { NF.Audio.play('deny'); } }
        ];
      }

      function openMenuAt(x, y) {
        OS.closeMenus();
        menuCtrl = OS.menu({
          x: x, y: y,
          items: items(),
          onClose: function () { menuCtrl = null; }
        });
        return menuCtrl;
      }

      function openNameDialog() {
        if (created || dlg) return;
        OS.closeMenus();
        dlg = OS.nameDialog({
          title: '新建文件夹',
          icon: 'folder',
          value: '新建文件夹',
          selectAll: false,
          caretAtEnd: true,
          onSubmit: function (name) {
            dlg = null;
            createFolder(name || '新建文件夹');
            return true;
          },
          onClose: function () { dlg = null; }
        });
      }

      function createFolder(name) {
        if (created) { return; }
        created = true;
        var cx = innerWidth / 2 - 38 + OS.rand(-90, 90);
        var cy = innerHeight * 0.38 - 30 + OS.rand(-36, 36);
        var folder = ctx.createdFolder({ x: cx, y: cy, label: name, testid: 'created-folder' });
        folder.style.animation = 'folder-pop .55s cubic-bezier(.34,1.56,.64,1) both';
        NF.Audio.play('pop');
        NF.FX.burst(cx + 38, cy + 30, { count: 16, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 5, gravity: 0.2 });
        ctx.complete({ el: folder });
      }

      // 桌面右键
      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (created) return;
        openMenuAt(e.clientX, e.clientY);
      });

      // 键盘也能用（无障碍）
      ctx.on(window, 'keydown', function (e) {
        if (created) return;
        if (e.key === 'F10' && e.shiftKey) { openMenuAt(innerWidth / 2, innerHeight / 2); }
      });

      // ~~~~~~~~ 幽灵演示：完整走一遍右键 → 新建 → 文件夹 → 确定 ~~~~~~~~
      ctx.hint = async function () {
        OS.closeMenus();
        if (dlg) { dlg.close('hint'); dlg = null; }
        var cx = innerWidth / 2, cy = innerHeight / 2;
        await NF.Ghost.play([
          { move: [cx, cy], dur: 500 },
          {
            click: 'right', target: [cx, cy], after: 260,
            do: function () { openMenuAt(cx, cy); }
          },
          { move: '[data-t="menu-item-new"]', dur: 520 },
          { highlight: '[data-t="menu-item-new"]', dur: 650 },
          {
            click: 'left', target: '[data-t="menu-item-new"]',
            do: function () { var r = OS.rootMenu(); if (r) r.openSub(r.items.filter(function (i) { return i.id === 'new'; })[0]); }
          },
          { wait: 260 },
          { move: '[data-t="menu-item-folder"]', dur: 540 },
          { highlight: '[data-t="menu-item-folder"]', dur: 650 },
          {
            click: 'left', target: '[data-t="menu-item-folder"]',
            do: function () { OS.closeMenus(); openNameDialog(); }
          },
          { wait: 380 },
          { move: '[data-t="dialog-ok"]', dur: 600 },
          { highlight: '[data-t="dialog-ok"]', dur: 700 },
          {
            click: 'left', target: '[data-t="dialog-ok"]',
            do: function () { if (dlg) { dlg.close('hint'); dlg = null; } }
          },
          { wait: 200 }
        ]);
      };

      // 开场 1.2 秒后先眨一下桌面，吸引注意
      ctx.timer(900, function () {
        if (!created && !OS.hasOpenMenu()) {
          NF.FX.ripple(innerWidth / 2, innerHeight / 2, { color: 'rgba(255,255,255,.18)', radius: 90 });
        }
      });
    }
  });
})();
