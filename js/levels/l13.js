/* 第 13 关：任务栏抽屉 —— 新建命令被封，最后一条掉进任务栏上沿的暗格里，把抽屉拉出来 */
(function () {
  'use strict';
  var ID = 13;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'menu',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var HANDLE_H = 18;
      var MAX_H = 260;
      var OPEN_H = 200;
      var THRESHOLD = 148;   // 拖过这个高度就保持打开

      var DRAWER_W = 460;
      var drawer = null;
      var handle = null;
      var tray = null;
      var folderEl = null;
      var createdEl = null;
      var height = HANDLE_H;
      var baseH = HANDLE_H;
      var drawerOpen = false;
      var completed = false;
      var retractTimer = 0;
      var handleDrag = null;
      var folderSt = null;

      ctx.style([
        '.lv13-drawer{position:absolute;bottom:0;width:' + DRAWER_W + 'px;overflow:hidden;z-index:14;',
        ' border-radius:16px 16px 0 0;border:1px solid rgba(160,150,255,.3);border-bottom:none;',
        ' background:linear-gradient(180deg,rgba(30,26,60,.97),rgba(13,11,30,.985));',
        ' box-shadow:0 -18px 40px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);',
        ' transition:height .32s cubic-bezier(.34,1.56,.64,1);will-change:height;}',
        '.lv13-drawer.lv13-dragging{transition:none;}',
        '.lv13-drawer.lv13-slow{transition:height 1.4s cubic-bezier(.4,0,.2,1);}',
        '.lv13-handle{position:absolute;left:0;right:0;top:0;height:' + HANDLE_H + 'px;z-index:2;',
        ' display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;',
        ' background:linear-gradient(180deg,rgba(255,240,190,.32),rgba(255,201,77,.14) 58%,rgba(12,10,28,0));}',
        '.lv13-handle:active{cursor:grabbing;}',
        '.lv13-handle::before{content:"";position:absolute;left:10px;right:10px;top:0;height:2px;border-radius:2px;',
        ' background:linear-gradient(90deg,transparent,rgba(255,224,138,.95),transparent);}',
        '.lv13-handle::after{content:"";position:absolute;inset:0;pointer-events:none;',
        ' background:linear-gradient(90deg,transparent,rgba(255,201,77,.2),transparent);',
        ' animation:lv13-shine 2.6s ease-in-out infinite;}',
        '@keyframes lv13-shine{0%,100%{opacity:.22;}50%{opacity:.85;}}',
        '.lv13-dots{display:grid;grid-template-columns:repeat(3,4px);gap:3px;pointer-events:none;opacity:.8;}',
        '.lv13-dots i{width:4px;height:4px;border-radius:50%;background:rgba(255,244,210,.95);',
        ' box-shadow:0 0 6px rgba(255,212,92,.85);}',
        '.lv13-chevron{position:absolute;right:12px;top:3px;width:12px;height:12px;opacity:.72;pointer-events:none;}',
        '.lv13-chevron svg{display:block;width:100%;height:100%;filter:drop-shadow(0 0 5px rgba(255,212,92,.8));}',
        '.lv13-tray{position:absolute;left:0;right:0;top:' + HANDLE_H + 'px;bottom:0;overflow:hidden;',
        ' background:radial-gradient(ellipse at 50% 100%,rgba(255,201,77,.13),transparent 62%),',
        ' linear-gradient(180deg,rgba(10,9,26,.6),rgba(6,5,18,.92));}',
        '.lv13-shelf{position:absolute;left:24px;right:24px;bottom:14px;height:2px;border-radius:2px;',
        ' background:linear-gradient(90deg,transparent,rgba(160,150,255,.35),transparent);}',
        '.lv13-tray-glow{position:absolute;left:50%;top:50%;width:260px;height:120px;margin:-60px 0 0 -130px;',
        ' border-radius:50%;pointer-events:none;filter:blur(6px);',
        ' background:radial-gradient(circle,rgba(255,201,77,.24),transparent 68%);',
        ' animation:lv13-breathe 2.4s ease-in-out infinite alternate;}',
        '@keyframes lv13-breathe{from{opacity:.5;transform:scale(.94);}to{opacity:1;transform:scale(1.06);}}',
        '.lv13-folder{position:absolute;left:50%;bottom:26px;width:80px;margin-left:-40px;z-index:2;',
        ' cursor:grab;touch-action:none;',
        ' filter:drop-shadow(0 0 18px rgba(255,212,92,.85)) drop-shadow(0 10px 14px rgba(0,0,0,.5));}',
        '.lv13-folder .lv13-folder-ico{width:76px;height:76px;margin:0 auto;',
        ' animation:lv13-folder-bob 1.6s ease-in-out infinite alternate;}',
        '.lv13-folder svg{display:block;width:100%;height:100%;}',
        '@keyframes lv13-folder-bob{from{transform:translateY(0) rotate(-2deg);}to{transform:translateY(-5px) rotate(2deg);}}',
        '.lv13-folder span{display:block;margin-top:4px;text-align:center;font-size:11px;color:#ffe9a8;',
        ' text-shadow:0 2px 6px rgba(0,0,0,.75);white-space:nowrap;}',
        '.lv13-folder.lv13-hot{filter:drop-shadow(0 0 26px rgba(255,212,92,1)) drop-shadow(0 12px 18px rgba(0,0,0,.55));}',
        '.lv13-folder.lv13-grabbed{cursor:grabbing;z-index:60;',
        ' filter:drop-shadow(0 0 24px rgba(255,212,92,1)) drop-shadow(0 14px 20px rgba(0,0,0,.6));}',
        '.lv13-folder.lv13-pop{animation:lv13-pop .45s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv13-pop{0%{transform:scale(1.5);opacity:.4;}100%{transform:scale(1);opacity:1;}}',
        '.lv13-folder.lv13-open{animation:lv13-open .36s ease-out forwards;}',
        '@keyframes lv13-open{0%{transform:scale(1);opacity:1;}55%{transform:scale(1.5) rotate(6deg);opacity:1;}',
        ' 100%{transform:scale(.2) rotate(-10deg);opacity:0;}}',
        '.lv13-born{filter:drop-shadow(0 0 26px rgba(255,212,92,.9)) drop-shadow(0 16px 20px rgba(0,0,0,.5));}',
        '.lv13-nudge{animation:lv13-nudge .35s ease;}',
        '@keyframes lv13-nudge{0%,100%{transform:translateX(0);}30%{transform:translateX(-4px);}',
        ' 60%{transform:translateX(4px);}}'
      ].join(''));

      /* ---------------- 抽屉本体 ---------------- */
      drawer = document.createElement('div');
      drawer.className = 'lv13-drawer';
      drawer.dataset.t = 'drawer';
      drawer.dataset.open = '0';
      drawer.style.left = Math.round(W / 2 - DRAWER_W / 2) + 'px';
      drawer.style.height = HANDLE_H + 'px';
      drawer.innerHTML =
        '<div class="lv13-tray">' +
        '<div class="lv13-tray-glow"></div>' +
        '<div class="lv13-shelf"></div>' +
        '<div class="lv13-folder" data-t="drawer-folder">' +
        '<div class="lv13-folder-ico">' + NF.icons.svg('folder') + '</div>' +
        '<span>新建文件夹</span>' +
        '</div>' +
        '</div>' +
        '<div class="lv13-handle" data-t="drawer-handle">' +
        '<span class="lv13-dots"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
        '<span class="lv13-chevron">' + NF.icons.svg('arrowUp') + '</span>' +
        '</div>';
      ctx.root.appendChild(drawer);
      tray = drawer.querySelector('.lv13-tray');
      handle = drawer.querySelector('[data-t="drawer-handle"]');
      folderEl = drawer.querySelector('[data-t="drawer-folder"]');

      ctx.qa('l13', ctx.root);

      function setHeight(h) {
        height = Math.max(HANDLE_H, Math.min(MAX_H, Math.round(h)));
        drawer.style.height = height + 'px';
      }

      function clearRetract() {
        if (retractTimer) { clearTimeout(retractTimer); retractTimer = 0; }
      }

      function resetRetract() {
        clearRetract();
        if (completed || !drawerOpen) return;
        retractTimer = ctx.timer(10000, autoRetract);
      }

      function openDrawer(byUser) {
        if (completed) return;
        drawerOpen = true;
        drawer.dataset.open = '1';
        if (height < OPEN_H) setHeight(OPEN_H);
        NF.Audio.play('open', { volume: 0.6 });
        NF.Audio.play('select', { volume: 0.45 });
        resetRetract();
        if (byUser) {
          ctx.timer(700, function () { if (!completed) ctx.replayHint(); });
        }
      }

      function autoRetract() {
        if (completed || !drawerOpen) return;
        drawerOpen = false;
        drawer.dataset.open = '0';
        drawer.classList.add('lv13-slow');
        setHeight(HANDLE_H);
        NF.Audio.play('close', { volume: 0.45 });
        ctx.timer(1500, function () { drawer.classList.remove('lv13-slow'); });
      }

      function springBack() {
        drawerOpen = false;
        drawer.dataset.open = '0';
        setHeight(HANDLE_H);
        NF.Audio.play('deny', { volume: 0.5 });
        NF.Audio.play('thud', { volume: 0.4 });
        var c = OS.center(drawer);
        NF.FX.dust(c.x, c.y);
      }

      /* ---------------- 按住把手向上拖 ---------------- */
      handleDrag = OS.makeDraggable(handle, {
        threshold: 2,
        canStart: function () { return !completed; },
        onStart: function () {
          baseH = height;
          clearRetract();
          drawer.classList.add('lv13-dragging');
          drawer.classList.remove('lv13-slow');
          NF.Audio.play('hover', { volume: 0.25 });
        },
        onMove: function (e, st) {
          var h = baseH - st.dy;
          if (h > MAX_H) h = MAX_H + (h - MAX_H) * 0.22;   // 拉过头有橡皮筋阻尼
          setHeight(h);
          drawer.dataset.open = height >= THRESHOLD ? '1' : '0';
        },
        onEnd: function () {
          drawer.classList.remove('lv13-dragging');
          if (completed) return;
          if (height >= THRESHOLD) openDrawer(true);
          else springBack();
        }
      });

      /* ---------------- 抽屉里的文件夹 ---------------- */
      function bindFolder() {
        ctx.on(folderEl, 'pointerdown', function (e) {
          if (e.button !== 0 || completed || !drawerOpen) return;
          if (height < THRESHOLD) return;
          e.preventDefault();
          e.stopPropagation();
          clearRetract();
          folderEl.classList.add('lv13-hot');

          var st = { sx: e.clientX, sy: e.clientY, moved: false, local: null };
          folderSt = st;
          var offMove = null;
          var offUp = null;

          function cleanup() {
            if (offMove) { offMove(); offMove = null; }
            if (offUp) { offUp(); offUp = null; }
            folderSt = null;
            if (folderEl) folderEl.classList.remove('lv13-hot');
          }

          function onMove(ev) {
            if (!folderEl) return;
            var dx = ev.clientX - st.sx;
            var dy = ev.clientY - st.sy;
            if (!st.moved) {
              if (Math.hypot(dx, dy) < 4) return;
              st.moved = true;
              beginFolderDrag(st);
            }
            if (!st.local) return;
            folderEl.style.left = (st.local.x + dx) + 'px';
            folderEl.style.top = (st.local.y + dy) + 'px';
            folderEl.style.transform = 'rotate(' + OS.clamp(dx * 0.03, -8, 8).toFixed(2) + 'deg) scale(1.05)';
          }

          function onUp(ev) {
            cleanup();
            if (!st) return;
            if (!st.moved) {
              successAt(OS.center(folderEl).x, OS.center(folderEl).y);
              return;
            }
            finishFolderDrag(ev);
          }

          offMove = ctx.on(document, 'pointermove', onMove, true);
          offUp = ctx.on(document, 'pointerup', onUp, true);
        });
      }

      function beginFolderDrag(st) {
        var r = folderEl.getBoundingClientRect();
        var rr = OS.rect(ctx.root);
        folderEl.style.left = Math.round(r.left - rr.left) + 'px';
        folderEl.style.top = Math.round(r.top - rr.top) + 'px';
        folderEl.style.bottom = 'auto';
        folderEl.style.marginLeft = '0';
        ctx.root.appendChild(folderEl);
        folderEl.classList.add('lv13-grabbed');
        st.local = {
          x: parseFloat(folderEl.style.left) || 0,
          y: parseFloat(folderEl.style.top) || 0
        };
        NF.Audio.play('paper', { volume: 0.55 });
        clearRetract();
      }

      function finishFolderDrag(ev) {
        if (!folderEl) return;
        var dr = OS.rect(drawer);
        if (ev.clientY < dr.top - 8) {
          var c = OS.center(folderEl);
          successAt(c.x, c.y);
        } else {
          returnFolder();
        }
      }

      function returnFolder() {
        if (!folderEl) return;
        folderEl.classList.remove('lv13-grabbed');
        folderEl.style.transform = '';
        folderEl.style.left = '';
        folderEl.style.top = '';
        folderEl.style.bottom = '';
        folderEl.style.marginLeft = '';
        tray.appendChild(folderEl);
        NF.Audio.play('thud', { volume: 0.4 });
        var c = OS.center(drawer);
        NF.FX.dust(c.x, c.y);
        folderEl.classList.add('lv13-pop');
        ctx.timer(480, function () { if (folderEl) folderEl.classList.remove('lv13-pop'); });
        resetRetract();
      }

      function successAt(cx, cy) {
        if (completed || !folderEl) return;
        completed = true;
        drawer.dataset.open = '1';
        clearRetract();
        folderEl.classList.remove('lv13-grabbed');
        folderEl.classList.add('lv13-open');
        var rr = OS.rect(ctx.root);
        NF.Audio.play('snap');
        NF.Audio.play('sparkle', { volume: 0.9 });
        NF.FX.flash('rgba(255,244,205,.5)', 220);
        NF.FX.burst(cx, cy, {
          count: 40, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#8a6cff'], speed: 11, gravity: 0.2
        });
        NF.FX.ripple(cx, cy, { color: 'rgba(255,212,92,.9)', radius: 70 });

        ctx.timer(380, function () {
          if (folderEl && folderEl.parentNode) folderEl.remove();
          folderEl = null;
          createdEl = ctx.createdFolder({
            x: Math.round(cx - rr.left - 38),
            y: Math.round(cy - rr.top - 32),
            label: '新建文件夹',
            testid: 'created-folder'
          });
          createdEl.classList.add('lv13-born');
          NF.Audio.play('pop');
          var c = OS.center(createdEl);
          NF.FX.sparkle(c.x, c.y, '#ffd45c');
          ctx.timer(560, function () { ctx.complete({ el: createdEl }); });
        });
      }

      bindFolder();

      /* ---------------- 被封死的右键 / 快捷键 ---------------- */
      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (completed) return;
        NF.Audio.play('deny');
        ctx.toast({ icon: 'lock', title: '新建已被锁定', kind: 'error', ms: 1400 });
        NF.OS.pulse(drawer, 'lv13-nudge', 380);
      });

      ctx.on(window, 'keydown', function (e) {
        if (completed) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          e.stopPropagation();
          NF.Audio.play('deny');
          ctx.toast({ icon: 'key', title: '快捷键已失效', kind: 'error', ms: 1400 });
          NF.OS.pulse(drawer, 'lv13-nudge', 380);
        }
      });

      /* ---------------- 幽灵演示 ---------------- */
      demo = async function () {
        if (completed) return;
        if (!drawerOpen || height < THRESHOLD) {
          var hr = OS.rect(handle);
          await NF.Ghost.play([
            { move: '[data-t="drawer-handle"]', dur: 560 },
            { highlight: '[data-t="drawer-handle"]', dur: 620 },
            {
              drag: {
                from: '[data-t="drawer-handle"]',
                to: [Math.round(hr.left + hr.width / 2), Math.round(hr.top + hr.height / 2 - 220)],
                dur: 1100, after: 260
              }
            },
            { do: function () { if (!drawerOpen) openDrawer(false); } },
            { wait: 280 },
            { highlight: '[data-t="drawer-folder"]', dur: 680 },
            { wait: 150 }
          ]);
        } else {
          await NF.Ghost.play([
            { highlight: '[data-t="drawer-folder"]', dur: 680 },
            { drag: { from: '[data-t="drawer-folder"]', to: [Math.round(W / 2), Math.round(H * 0.5)], dur: 1000, after: 200 } },
            { wait: 150 }
          ]);
        }
      };
      ctx.hint(demo);

      /* 让玩家先注意到底部抽屉 */
      ctx.timer(1000, function () {
        if (completed) return;
        var c = OS.center(handle);
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,212,92,.35)', radius: 46 });
      });
    }
  });
})();
