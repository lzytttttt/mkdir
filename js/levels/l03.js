/* 第 3 关：快捷键 —— 右键"新建"被锁，只能用 Ctrl+Shift+F；屏幕上的 N 键帽会逃跑 */
(function () {
  'use strict';
  var ID = 3;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'key',
    init: function (ctx) {
      var created = false;
      var menuCtrl = null;
      var pranked = false;

      ctx.style([
        '.lv3-lock-note{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;}',
        '.lv3-key{position:absolute;z-index:70;min-width:52px;height:46px;padding:0 14px;border-radius:10px;',
        'background:linear-gradient(180deg,#fff,#d7def5);color:#20233a;font-weight:800;font-size:20px;',
        'display:flex;align-items:center;justify-content:center;box-shadow:0 5px 0 #8e98c2,0 14px 26px rgba(0,0,0,.45);',
        'pointer-events:none;animation:lv3-key-flee 1.25s cubic-bezier(.3,.7,.4,1) forwards;}',
        '@keyframes lv3-key-flee{0%{transform:translate(0,0) rotate(0);opacity:1;}',
        '18%{transform:translate(0,-26px) rotate(-8deg);}',
        '100%{transform:translate(46vw,-40vh) rotate(760deg);opacity:0;}}',
        '.lv3-lock-glow{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px;border-radius:50%;',
        'pointer-events:none;background:radial-gradient(circle,rgba(255,201,77,.25),transparent 70%);opacity:0;}',
        '.lv3-lock-glow.on{animation:lv3-glow 1.2s ease-out;}',
        '@keyframes lv3-glow{0%{opacity:0;transform:scale(.4);}30%{opacity:1;}100%{opacity:0;transform:scale(1.6);}}'
      ].join(''));

      function items() {
        return [
          { id: 'view', label: '查看', icon: 'eye', submenu: [{ id: 'v-large', label: '大图标', icon: 'grid' }, { id: 'v-small', label: '小图标', icon: 'grid' }] },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
          { separator: true },
          {
            id: 'new', label: '新建', icon: 'folder', lockIcon: true,
            shortcut: 'Ctrl+Shift+F',
            onSelect: function () {
              NF.Audio.play('deny');
              OS.toast({ icon: 'lock', title: '此功能已被锁定', kind: 'error', ms: 2200 });
              flashLock();
            }
          },
          { separator: true },
          { id: 'display', label: '显示设置', icon: 'computer', onSelect: function () { NF.Audio.play('deny'); } }
        ];
      }

      function flashLock() {
        var glow = document.createElement('div');
        glow.className = 'lv3-lock-glow';
        ctx.root.appendChild(glow);
        void glow.offsetWidth;
        glow.classList.add('on');
        setTimeout(function () { glow.remove(); }, 1200);
      }

      function openMenuAt(x, y) {
        OS.closeMenus();
        menuCtrl = OS.menu({ x: x, y: y, items: items(), onClose: function () { menuCtrl = null; } });
      }
      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (created) return;
        openMenuAt(e.clientX, e.clientY);
        NF.Audio.play('giggle', { volume: 0.35 });
      });

      // ~~~~~~~~ 真正的解法：Ctrl+Shift+F ~~~~~~~~
      ctx.on(window, 'keydown', function (e) {
        if (created) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          e.stopPropagation();
          createFolder();
        }
      });

      function createFolder() {
        if (created) return;
        created = true;
        OS.closeMenus();
        OS.closeDialogs();
        var x = innerWidth / 2 - 38, y = innerHeight * 0.4 - 30;
        var folder = ctx.createdFolder({ x: x, y: y, label: '新建文件夹', testid: 'created-folder' });

        // 屏幕上的键帽逃跑：纯表演
        if (!pranked) {
          pranked = true;
          var key = document.createElement('div');
          key.className = 'lv3-key';
          key.textContent = 'F';
          key.style.left = (innerWidth / 2 - 26) + 'px';
          key.style.top = (innerHeight * 0.66) + 'px';
          ctx.root.appendChild(key);
          setTimeout(function () { if (key.parentNode) key.remove(); }, 1400);
          NF.Audio.play('giggle');
          NF.Audio.play('boing');
        }
        NF.Audio.play('pop');
        NF.FX.burst(x + 38, y + 34, { count: 24, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 7, gravity: 0.22 });
        NF.FX.sparkle(x + 38, y + 34);
        ctx.complete({ el: folder, delay: 1050 });
      }

      // ~~~~~~~~ 演示：先展示右键被锁 → 再展示快捷键 ~~~~~~~~
      ctx.hint = async function () {
        OS.closeMenus();
        var cx = innerWidth / 2, cy = innerHeight / 2;
        await NF.Ghost.play([
          { move: [cx, cy], dur: 400 },
          {
            click: 'right', target: [cx, cy], after: 220,
            do: function () { openMenuAt(cx, cy); }
          },
          { move: '[data-t="menu-item-new"]', dur: 450 },
          {
            click: 'left', target: '[data-t="menu-item-new"]', after: 620,
            do: function () {
              NF.Audio.play('deny');
              OS.toast({ icon: 'lock', title: '此功能已被锁定', kind: 'error', ms: 1600 });
              flashLock();
            }
          },
          { do: function () { OS.closeMenus(); } },
          { wait: 240 },
          { move: [cx, cy + 120], dur: 350 },
          { keys: 'Ctrl+Shift+F', dur: 1300 },
          { wait: 200 },
          { highlight: [cx, cy], dur: 700 }
        ]);
      };
    }
  });
})();
