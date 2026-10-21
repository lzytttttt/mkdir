/* 第 12 关：游戏里的游戏 —— 迷你游戏窗口在桌面上运行，从里面右键新建，再把迷你文件夹拖出游戏 */
(function () {
  'use strict';
  var ID = 12;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'window',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var WIN_W = 440;
      var WIN_H = 300;
      var SLOT = { x: 238, y: 96 };   // 迷你文件夹在窗口内的落点

      var winHome = { x: Math.round(W / 2 - WIN_W / 2), y: Math.round(H * 0.16) };
      var win = null;
      var bodyEl = null;
      var miniFolder = null;
      var miniMenu = null;
      var menuOff = null;
      var createdEl = null;

      var phase = 'idle';   // idle | folder | dragging | done
      var dragging = false;
      var completed = false;

      ctx.style([
        '.lv12-aura{position:absolute;left:50%;top:48%;width:640px;height:460px;margin:-320px 0 0 -230px;',
        ' border-radius:50%;pointer-events:none;z-index:2;filter:blur(30px);',
        ' background:radial-gradient(ellipse,rgba(120,90,240,.22),transparent 68%);',
        ' animation:lv12-aura 4.5s ease-in-out infinite alternate;}',
        '@keyframes lv12-aura{from{opacity:.4;transform:scale(.94);}to{opacity:.85;transform:scale(1.06);}}',
        /* 迷你游戏窗口 */
        '.lv12-window{position:absolute;width:' + WIN_W + 'px;height:' + WIN_H + 'px;z-index:8;overflow:hidden;',
        ' border-radius:12px;background:rgba(18,16,40,.95);border:1px solid rgba(160,150,255,.32);',
        ' box-shadow:0 30px 60px rgba(0,0,0,.58),0 0 40px rgba(120,90,240,.22),inset 0 0 0 1px rgba(255,255,255,.05);}',
        '.lv12-titlebar{height:26px;display:flex;align-items:center;gap:6px;padding:0 9px;',
        ' background:rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.08);}',
        '.lv12-titlebar i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.28);}',
        '.lv12-titlebar i:nth-child(1){background:#ff6b8a;}',
        '.lv12-titlebar i:nth-child(2){background:#ffc94d;}',
        '.lv12-titlebar i:nth-child(3){background:#7ef0c0;}',
        '.lv12-title{display:flex;align-items:center;gap:5px;margin-left:5px;font-size:10px;',
        ' color:rgba(238,240,255,.72);letter-spacing:.04em;}',
        '.lv12-title .nf-ico{width:14px;height:14px;}',
        '.lv12-title em{font-style:normal;}',
        '.lv12-win-x{margin-left:auto;font-size:13px;line-height:1;color:rgba(238,240,255,.4);}',
        '.lv12-body{position:relative;height:calc(100% - 26px);overflow:hidden;}',
        /* 被缩放的迷你桌面 */
        '.lv12-screen{position:absolute;left:0;top:0;width:800px;height:498px;transform:scale(.55);',
        ' transform-origin:top left;overflow:hidden;',
        ' background:linear-gradient(150deg,#191338,#111a33 70%,#0c1126);}',
        '.lv12-wall{position:absolute;inset:0;background:',
        ' radial-gradient(ellipse 45% 40% at 30% 22%,rgba(120,90,240,.5),transparent 62%),',
        ' radial-gradient(ellipse 40% 36% at 78% 70%,rgba(30,120,200,.42),transparent 62%);}',
        '.lv12-stars{position:absolute;inset:0;opacity:.6;background-image:',
        ' radial-gradient(2px 2px at 18% 28%,rgba(255,255,255,.8),transparent 60%),',
        ' radial-gradient(1px 1px at 42% 62%,rgba(220,230,255,.7),transparent 60%),',
        ' radial-gradient(1.5px 1.5px at 66% 22%,rgba(255,255,255,.6),transparent 60%),',
        ' radial-gradient(1px 1px at 86% 58%,rgba(200,220,255,.6),transparent 60%);}',
        '.lv12-icons{position:absolute;left:26px;top:28px;display:flex;flex-direction:column;gap:22px;}',
        '.lv12-icon{width:64px;text-align:center;}',
        '.lv12-icon .nf-ico{display:block;width:44px;height:44px;margin:0 auto;',
        ' filter:drop-shadow(0 5px 8px rgba(0,0,0,.45));}',
        '.lv12-icon span{display:block;margin-top:6px;font-size:11px;color:rgba(255,255,255,.55);}',
        '.lv12-task{position:absolute;left:20px;right:20px;bottom:18px;height:66px;border-radius:12px;',
        ' background:rgba(10,9,26,.82);border:1px solid rgba(255,255,255,.1);',
        ' display:flex;align-items:center;gap:16px;padding:0 16px;}',
        '.lv12-start{width:34px;height:34px;border-radius:8px;background:linear-gradient(140deg,#7cb2ff,#4f74ff);',
        ' box-shadow:0 0 14px rgba(91,124,250,.6);}',
        '.lv12-task svg{display:block;width:34px;height:34px;}',
        '.lv12-jar{position:relative;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;',
        ' justify-content:center;box-shadow:0 0 0 1px rgba(255,212,92,.5),0 0 14px rgba(255,212,92,.4);}',
        '.lv12-jar b{position:absolute;right:-5px;top:-5px;min-width:14px;height:14px;border-radius:7px;',
        ' background:#ffc94d;color:#4a2c00;font-size:8px;font-weight:800;display:flex;align-items:center;',
        ' justify-content:center;padding:0 3px;}',
        '.lv12-mascot{margin-left:auto;width:38px;height:38px;}',
        '.lv12-mascot svg{width:38px;height:38px;}',
        '.lv12-scan{position:absolute;inset:0;pointer-events:none;',
        ' background:repeating-linear-gradient(180deg,rgba(255,255,255,.04) 0 1px,transparent 1px 3px);}',
        '.lv12-glass{position:absolute;inset:0;pointer-events:none;border-radius:12px;',
        ' box-shadow:inset 0 0 40px rgba(120,90,240,.18);}',
        /* 被拉出来的迷你文件夹 */
        '.lv12-mini-folder{position:absolute;width:34px;height:34px;z-index:6;cursor:grab;touch-action:none;',
        ' filter:drop-shadow(0 0 10px rgba(255,212,92,.8)) drop-shadow(0 6px 8px rgba(0,0,0,.5));}',
        '.lv12-mini-folder svg{display:block;width:100%;height:100%;animation:lv12-bob .9s ease-in-out infinite alternate;}',
        '@keyframes lv12-bob{from{transform:translateY(0) rotate(-3deg);}to{transform:translateY(-3px) rotate(3deg);}}',
        '.lv12-mini-folder.lv12-pop{animation:lv12-pop .5s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv12-pop{0%{transform:scale(.2);opacity:0;}60%{transform:scale(1.2);opacity:1;}100%{transform:scale(1);}}',
        '.lv12-mini-folder.lv12-grabbed{z-index:60;cursor:grabbing;',
        ' filter:drop-shadow(0 0 20px rgba(255,212,92,1)) drop-shadow(0 12px 18px rgba(0,0,0,.6));}',
        '.lv12-mini-folder.lv12-back{animation:lv12-back .4s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv12-back{0%{transform:scale(1.25);}100%{transform:scale(1);}}',
        '.lv12-mini-folder.lv12-escape{animation:lv12-escape .44s ease-out forwards;}',
        '@keyframes lv12-escape{0%{transform:scale(1);opacity:1;}45%{transform:scale(2.2) rotate(8deg);opacity:1;}',
        ' 100%{transform:scale(2.9) rotate(-8deg);opacity:0;}}',
        '.lv12-born{filter:drop-shadow(0 0 26px rgba(255,212,92,.9)) drop-shadow(0 16px 20px rgba(0,0,0,.5));}',
        /* 迷你右键菜单 */
        '.lv12-menu{position:absolute;z-index:50;min-width:94px;padding:4px;border-radius:9px;',
        ' background:rgba(246,248,255,.95);color:#24273f;border:1px solid rgba(255,255,255,.85);',
        ' box-shadow:0 12px 28px rgba(0,0,0,.45);animation:lv12-menu-in .14s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv12-menu-in{from{opacity:0;transform:scale(.9) translateY(-3px);}to{opacity:1;transform:scale(1);}}',
        '.lv12-menu-item{display:flex;align-items:center;gap:7px;height:26px;padding:0 7px;border-radius:5px;',
        ' cursor:default;font-size:10px;white-space:nowrap;}',
        '.lv12-menu-item .nf-ico{width:15px;height:15px;}',
        '.lv12-menu-item:hover{background:rgba(91,124,250,.18);box-shadow:inset 0 0 0 1px rgba(91,124,250,.22);}',
        '.lv12-menu-item.lv12-cancel{color:#b83b52;opacity:.82;}'
      ].join(''));

      function miniIcon(name, label) {
        return '<div class="lv12-icon">' + NF.icons.svg(name) + '<span>' + label + '</span></div>';
      }

      /* ---------------- 迷你窗口 ---------------- */
      var aura = document.createElement('div');
      aura.className = 'lv12-aura';
      ctx.root.appendChild(aura);

      win = document.createElement('div');
      win.className = 'lv12-window';
      win.dataset.t = 'mini-window';
      win.dataset.phase = phase;
      win.style.left = winHome.x + 'px';
      win.style.top = winHome.y + 'px';
      win.innerHTML =
        '<div class="lv12-titlebar"><i></i><i></i><i></i>' +
        '<span class="lv12-title">' + NF.icons.svg('folder') + '<em>新建文件夹</em></span>' +
        '<span class="lv12-win-x">×</span></div>' +
        '<div class="lv12-body">' +
        '<div class="lv12-screen">' +
        '<div class="lv12-wall"></div><div class="lv12-stars"></div>' +
        '<div class="lv12-icons">' +
        miniIcon('folder', '新建文件夹') + miniIcon('fileText', '文档') + miniIcon('terminal', '终端') +
        '</div>' +
        '<div class="lv12-task">' +
        '<span class="lv12-start"></span>' +
        NF.icons.svg('folder') + NF.icons.svg('terminal') +
        '<span class="lv12-jar">' + NF.icons.svg('jar') + '<b>1</b></span>' +
        '<span class="lv12-mascot">' + NF.icons.svg('folderFace') + '</span>' +
        '</div>' +
        '<div class="lv12-scan"></div>' +
        '</div>' +
        '<div class="lv12-glass"></div>' +
        '</div>';
      ctx.root.appendChild(win);
      bodyEl = win.querySelector('.lv12-body');
      ctx.qa('l12', ctx.root);

      /* ---------------- 迷你右键菜单 ---------------- */
      function closeMiniMenu() {
        if (menuOff) { menuOff(); menuOff = null; }
        if (miniMenu && miniMenu.parentNode) miniMenu.remove();
        miniMenu = null;
      }
      ctx.onCleanup(closeMiniMenu);

      function openMiniMenu(x, y) {
        if (completed) return;
        closeMiniMenu();
        miniMenu = document.createElement('div');
        miniMenu.className = 'lv12-menu';
        miniMenu.dataset.t = 'mini-menu';
        miniMenu.style.left = Math.round(OS.clamp(x, 10, W - 120)) + 'px';
        miniMenu.style.top = Math.round(OS.clamp(y, 10, H - 90)) + 'px';
        miniMenu.innerHTML =
          '<div class="lv12-menu-item" data-t="mini-item-new">' + NF.icons.svg('folder') + '<span>新建</span></div>' +
          '<div class="lv12-menu-item lv12-cancel" data-t="mini-item-cancel">' + NF.icons.svg('error') + '<span>取消</span></div>';
        ctx.root.appendChild(miniMenu);

        var newItem = miniMenu.querySelector('[data-t="mini-item-new"]');
        var cancelItem = miniMenu.querySelector('[data-t="mini-item-cancel"]');
        ctx.on(newItem, 'click', function (e) {
          e.stopPropagation();
          if (!miniMenu) return;
          closeMiniMenu();
          createMiniFolder(false);
        });
        ctx.on(cancelItem, 'click', function (e) {
          e.stopPropagation();
          closeMiniMenu();
          NF.Audio.play('click', { volume: 0.5 });
        });
        NF.Audio.play('open', { volume: 0.45 });

        menuOff = ctx.on(document, 'pointerdown', function (e) {
          if (miniMenu && !miniMenu.contains(e.target)) closeMiniMenu();
        }, true);
      }

      ctx.on(win, 'contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (completed) return;
        var rr = OS.rect(ctx.root);
        openMiniMenu(e.clientX - rr.left, e.clientY - rr.top);
      });
      ctx.on(ctx.root, 'contextmenu', function (e) {
        if (win.contains(e.target)) return;
        e.preventDefault();
      });

      /* ---------------- 迷你文件夹 ---------------- */
      function createMiniFolder(fromDemo) {
        if (miniFolder || completed) return;
        phase = 'folder';
        win.dataset.phase = phase;
        miniFolder = document.createElement('div');
        miniFolder.className = 'lv12-mini-folder lv12-pop';
        miniFolder.dataset.t = 'mini-folder';
        miniFolder.innerHTML = NF.icons.svg('folder');
        miniFolder.style.left = SLOT.x + 'px';
        miniFolder.style.top = SLOT.y + 'px';
        bodyEl.appendChild(miniFolder);

        NF.Audio.play('pop');
        var c = OS.center(miniFolder);
        NF.FX.sparkle(c.x, c.y, '#ffd45c');
        NF.FX.burst(c.x, c.y, {
          count: 16, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 5, gravity: 0.18
        });
        ctx.timer(520, function () { if (miniFolder) miniFolder.classList.remove('lv12-pop'); });
        bindMiniFolderDrag();
        if (!fromDemo) {
          ctx.timer(900, function () { if (!completed) ctx.replayHint(); });
        }
      }

      function bindMiniFolderDrag() {
        ctx.on(miniFolder, 'pointerdown', function (e) {
          if (e.button !== 0 || completed || dragging || !miniFolder) return;
          e.preventDefault();
          e.stopPropagation();

          var st = { sx: e.clientX, sy: e.clientY, moved: false, el: miniFolder, local: null };
          var offMove = null;
          var offUp = null;

          function cleanup() {
            if (offMove) { offMove(); offMove = null; }
            if (offUp) { offUp(); offUp = null; }
          }

          function onMove(ev) {
            if (!st || !st.el) return;
            var dx = ev.clientX - st.sx;
            var dy = ev.clientY - st.sy;
            if (!st.moved) {
              if (Math.hypot(dx, dy) < 4) return;
              st.moved = true;
              beginDrag(st);
            }
            st.el.style.left = (st.local.x + dx) + 'px';
            st.el.style.top = (st.local.y + dy) + 'px';
            st.el.style.transform = 'rotate(' + OS.clamp(dx * 0.04, -9, 9).toFixed(2) + 'deg) scale(1.06)';
          }

          function onUp(ev) {
            cleanup();
            if (!st) return;
            var moved = st.moved;
            var mf = st.el;
            st = null;
            if (!moved || !mf) return;
            finishDrag(mf, ev);
          }

          offMove = ctx.on(document, 'pointermove', onMove, true);
          offUp = ctx.on(document, 'pointerup', onUp, true);
        });
      }

      function beginDrag(st) {
        dragging = true;
        phase = 'dragging';
        win.dataset.phase = phase;
        var r = miniFolder.getBoundingClientRect();
        var rr = OS.rect(ctx.root);
        miniFolder.style.position = 'absolute';
        miniFolder.style.left = Math.round(r.left - rr.left) + 'px';
        miniFolder.style.top = Math.round(r.top - rr.top) + 'px';
        ctx.root.appendChild(miniFolder);
        miniFolder.classList.add('lv12-grabbed');
        st.local = {
          x: parseFloat(miniFolder.style.left) || 0,
          y: parseFloat(miniFolder.style.top) || 0
        };
        NF.Audio.play('paper', { volume: 0.55 });
      }

      function finishDrag(el, ev) {
        dragging = false;
        var wr = OS.rect(win);
        var inside = ev.clientX >= wr.left && ev.clientX <= wr.right &&
          ev.clientY >= wr.top && ev.clientY <= wr.bottom;
        if (inside) returnToWindow(el);
        else escapeSuccess(el);
      }

      function returnToWindow(el) {
        phase = 'folder';
        win.dataset.phase = phase;
        el.classList.remove('lv12-grabbed');
        var bodyR = bodyEl.getBoundingClientRect();
        var rr = OS.rect(ctx.root);
        el.style.transition = 'left .3s cubic-bezier(.34,1.56,.64,1),top .3s cubic-bezier(.34,1.56,.64,1),transform .3s ease';
        el.style.left = Math.round(bodyR.left - rr.left + SLOT.x) + 'px';
        el.style.top = Math.round(bodyR.top - rr.top + SLOT.y) + 'px';
        el.style.transform = '';
        NF.Audio.play('thud', { volume: 0.4 });
        ctx.timer(330, function () {
          if (!el) return;
          el.style.transition = '';
          bodyEl.appendChild(el);
          el.style.left = SLOT.x + 'px';
          el.style.top = SLOT.y + 'px';
          el.style.transform = '';
          el.classList.add('lv12-back');
          ctx.timer(430, function () { if (el) el.classList.remove('lv12-back'); });
        });
      }

      function escapeSuccess(el) {
        if (completed) return;
        completed = true;
        phase = 'done';
        win.dataset.phase = phase;
        el.classList.remove('lv12-grabbed');
        var r = OS.rect(el);
        var rr = OS.rect(ctx.root);
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        el.classList.add('lv12-escape');
        NF.Audio.play('whoosh', { volume: 0.6 });
        NF.Audio.play('sparkle', { volume: 0.8 });
        NF.FX.flash('rgba(255,255,255,.55)', 220);
        NF.FX.burst(cx, cy, {
          count: 40, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#7ef0c0'], speed: 11, gravity: 0.2
        });
        ctx.timer(430, function () {
          if (el && el.parentNode) el.remove();
          miniFolder = null;
          createdEl = ctx.createdFolder({
            x: Math.round(cx - rr.left - 38),
            y: Math.round(cy - rr.top - 32),
            label: '新建文件夹',
            testid: 'created-folder'
          });
          createdEl.classList.add('lv12-born');
          NF.Audio.play('pop');
          var c = OS.center(createdEl);
          NF.FX.sparkle(c.x, c.y, '#ffd45c');
          ctx.timer(560, function () { ctx.complete({ el: createdEl }); });
        });
      }

      /* ---------------- 迷你窗口每 9 秒左右横移 ---------------- */
      ctx.interval(9000, function () {
        if (completed) return;
        closeMiniMenu();
        var nx = OS.clamp(winHome.x + OS.pick([-40, 40]) + OS.rand(-6, 6),
          16, Math.max(16, W - WIN_W - 16));
        win.style.transition = 'left 3.2s cubic-bezier(.4,0,.2,1)';
        win.style.left = Math.round(nx) + 'px';
      });

      /* ---------------- 幽灵演示 ---------------- */
      demo = async function () {
        if (completed || dragging) return;
        if (!miniFolder) {
          var wc = OS.center(win);
          var rr = OS.rect(ctx.root);
          await NF.Ghost.play([
            { move: '[data-t="mini-window"]', dur: 520 },
            { highlight: '[data-t="mini-window"]', dur: 620 },
            {
              click: 'right', target: [wc.x, wc.y], after: 240,
              do: function () { openMiniMenu(wc.x - rr.left, wc.y - rr.top); }
            },
            { move: '[data-t="mini-item-new"]', dur: 420 },
            { highlight: '[data-t="mini-item-new"]', dur: 560 },
            {
              click: 'left', target: '[data-t="mini-item-new"]', after: 280,
              do: function () { closeMiniMenu(); createMiniFolder(true); }
            },
            { move: '[data-t="mini-folder"]', dur: 420 },
            { highlight: '[data-t="mini-folder"]', dur: 620 },
            {
              drag: {
                from: '[data-t="mini-folder"]',
                to: [Math.round(W * 0.75), Math.round(H * 0.62)],
                dur: 1000, after: 200
              }
            },
            { wait: 180 }
          ]);
        } else {
          await NF.Ghost.play([
            { highlight: '[data-t="mini-folder"]', dur: 600 },
            {
              drag: {
                from: '[data-t="mini-folder"]',
                to: [Math.round(W * 0.75), Math.round(H * 0.62)],
                dur: 1000, after: 200
              }
            },
            { wait: 150 }
          ]);
        }
      };
      ctx.hint(demo);
    }
  });
})();
