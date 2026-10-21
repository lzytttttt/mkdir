/* 第 2 关：菜单大逃亡 —— 菜单项会躲鼠标，只能用方向键 + 回车 */
(function () {
  'use strict';
  var ID = 2;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'menu',
    init: function (ctx) {
      var created = false;
      var menuCtrl = null;

      ctx.style([
        '.lv2-mascot{position:absolute;right:26px;bottom:6px;width:76px;pointer-events:none;opacity:.95;',
        'transform-origin:bottom center;animation:lv2-peek 4.5s ease-in-out infinite;}',
        '.lv2-mascot .nf-ico{width:100%;height:auto;filter:drop-shadow(0 10px 14px rgba(0,0,0,.45));}',
        '@keyframes lv2-peek{0%,72%,100%{transform:translateY(26px) rotate(-4deg);}80%,92%{transform:translateY(0) rotate(3deg);}}',
        '.lv2-mascot.giggle{animation:lv2-giggle .45s ease;}',
        '@keyframes lv2-giggle{0%,100%{transform:translateY(0) rotate(0);}25%{transform:translateY(-6px) rotate(-7deg);}',
        '50%{transform:translateY(0) rotate(6deg);}75%{transform:translateY(-4px) rotate(-4deg);}}'
      ].join(''));

      var mascot = document.createElement('div');
      mascot.className = 'lv2-mascot';
      mascot.innerHTML = NF.icons.svg('folderFace');
      ctx.root.appendChild(mascot);

      function items() {
        var doodle = function (label, icon) {
          return {
            id: label, label: label, icon: icon, dodge: true,
            onSelect: function () { NF.Audio.play('deny'); }
          };
        };
        return [
          {
            id: 'new', label: '新建', icon: 'folder', dodge: true,
            submenu: [
              { id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', dodge: true, onSelect: createFolder },
              { id: 'shortcut', label: '快捷方式', icon: 'arrowRight', dodge: true, onSelect: function () { NF.Audio.play('deny'); } },
              { separator: true },
              { id: 'text', label: '文本文档', icon: 'fileText', dodge: true, onSelect: function () { NF.Audio.play('deny'); } }
            ]
          },
          doodle('查看', 'eye'),
          doodle('排序方式', 'arrowDown'),
          doodle('刷新', 'restart'),
          { separator: true },
          doodle('个性化', 'settings')
        ];
      }

      function openMenuAt(x, y) {
        OS.closeMenus();
        menuCtrl = OS.menu({
          x: x, y: y,
          items: items(),
          className: 'is-dodging',
          onClose: function () { menuCtrl = null; }
        });
        return menuCtrl;
      }

      function giggle() {
        mascot.classList.remove('giggle');
        void mascot.offsetWidth;
        mascot.classList.add('giggle');
        NF.Audio.play('giggle', { volume: 0.7 });
      }

      function createFolder() {
        if (created) return;
        created = true;
        OS.closeMenus();
        var x = innerWidth / 2 - 38, y = innerHeight * 0.36 - 30;
        var folder = ctx.createdFolder({ x: x, y: y, label: '新建文件夹', testid: 'created-folder' });
        NF.Audio.play('pop');
        NF.Audio.play('success', { volume: 0.5 });
        NF.FX.burst(x + 38, y + 34, { count: 22, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#ff6ba9'], speed: 7, gravity: 0.24 });
        giggle();
        ctx.complete({ el: folder, delay: 1000 });
      }

      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (created) return;
        openMenuAt(e.clientX, e.clientY);
        // 鼠标靠近时小夹会偷笑
        giggle();
      });

      // 玩家硬要用鼠标点时：菜单项会笑得更大声
      ctx.on(document, 'pointermove', function () {
        if (!menuCtrl) return;
      });

      // ~~~~~~~~ 演示：鼠标追不上 → 换键盘 ~~~~~~~~
      ctx.hint = async function () {
        OS.closeMenus();
        var cx = innerWidth / 2, cy = innerHeight / 2;
        await NF.Ghost.play([
          { move: [cx, cy], dur: 400 },
          {
            click: 'right', target: [cx, cy], after: 240,
            do: function () { openMenuAt(cx, cy); }
          },
          { wait: 200 },
          { move: '[data-t="menu-item-new"]', dur: 420 },
          { do: function () { scatter(); giggle(); } },
          { wait: 280 },
          {
            move: function () {
              var r = OS.rootMenu();
              if (!r) return [cx, cy];
              var item = r.itemEls[0] && r.itemEls[0].el;
              var rect = OS.rect(item);
              return [rect.left + 20, rect.top + 20];
            },
            dur: 350
          },
          { do: function () { scatter(); } },
          { wait: 220 },
          { move: '[data-t="menu-item-new"]', dur: 260 },
          { keys: 'ArrowDown', dur: 800 },
          {
            do: function () {
              var r = OS.rootMenu();
              if (r) r.setSelected(0);
            }
          },
          { keys: 'Enter', dur: 900 },
          {
            do: function () {
              var r = OS.rootMenu();
              if (!r) return;
              var item = r.items.filter(function (i) { return i.id === 'new'; })[0];
              r.openSub(item);
              var sc = r.subs[0];
              if (sc) sc.setSelected(0);
            }
          },
          { wait: 260 },
          { keys: 'ArrowDown', dur: 700 },
          {
            do: function () {
              var r = OS.rootMenu();
              if (r && r.subs[0]) r.subs[0].setSelected(0);
            }
          },
          { keys: 'Enter', dur: 900 },
          { highlight: '[data-t="menu-item-folder"]', dur: 800 },
          { do: function () { OS.closeMenus(); } },
          { wait: 200 }
        ]);
      };

      function scatter() {
        var r = OS.rootMenu();
        if (!r) return;
        r.itemEls.forEach(function (rec, i) {
          rec.el.style.transition = 'transform .28s cubic-bezier(.22,.8,.3,1)';
          rec.el.style.transform = 'translate(' + OS.rand(-26, 30).toFixed(0) + 'px,' + OS.rand(-12, 14).toFixed(0) + 'px) rotate(' + OS.rand(-3, 3).toFixed(1) + 'deg)';
        });
        if (r.subs[0]) {
          r.subs[0].itemEls.forEach(function (rec) {
            rec.el.style.transition = 'transform .28s cubic-bezier(.22,.8,.3,1)';
            rec.el.style.transform = 'translate(' + OS.rand(-14, 14).toFixed(0) + 'px,' + OS.rand(-8, 8).toFixed(0) + 'px)';
          });
        }
      }
    }
  });
})();
