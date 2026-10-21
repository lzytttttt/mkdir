/* 第 10 关：递归裂缝（加难版 · 第四面墙的入口）
   1. 正常建出一个文件夹；
   2. 把它拖到自己的"影子"上 → 递归炸裂；
   3. 游戏被折叠进两个迷你游戏窗口，把大文件夹丢进"正确"那个窗口的玻璃罐里。
*/
(function () {
  'use strict';
  var ID = 10;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'crack',
    init: function (ctx) {
      var folder = null;
      var dlg = null;
      var shadow = null;
      var dragHandle = null;
      var recursionStarted = false;
      var metaActive = false;
      var completed = false;
      var stage = 1; // 1=未建 2=拖动影子 3=迷你窗口
      var demoFolder = null;
      var demoShadow = null;
      var meta = null;
      var frames = [];
      var rafStop = null;
      var jarReal = null;
      var jarFake = null;
      var folderHome = { x: 0, y: 0 };
      var realJarPos = { x: 0, y: 0 };
      var fakeJarPos = { x: 0, y: 0 };
      var phaseMove = 0;
      var metaDragging = false;

      ctx.style([
        '.lv10-glow{position:absolute;left:50%;top:42%;width:340px;height:340px;margin:-170px;border-radius:50%;pointer-events:none;',
        'background:radial-gradient(circle,rgba(255,201,77,.12),transparent 62%);animation:lv10-breathe 4s ease-in-out infinite;}',
        '@keyframes lv10-breathe{0%,100%{transform:scale(1);opacity:.7;}50%{transform:scale(1.12);opacity:1;}}',
        '.lv10-shadow{position:absolute;width:76px;pointer-events:none;z-index:25;opacity:.85;filter:drop-shadow(0 0 16px rgba(255,212,92,.5));',
        'animation:lv10-shadow-in .3s cubic-bezier(.34,1.56,.64,1) both;}',
        '.lv10-shadow svg{width:100%;height:auto;display:block;}',
        '.lv10-shadow::after{content:"";position:absolute;inset:-10px;border:2px dashed rgba(255,212,92,.75);border-radius:16px;animation:lv10-dash 6s linear infinite;}',
        '@keyframes lv10-shadow-in{from{opacity:0;transform:scale(.7);}to{opacity:.85;transform:scale(1);}}',
        '@keyframes lv10-dash{to{transform:rotate(360deg);}}',
        '.lv10-shadow.is-hot{filter:drop-shadow(0 0 30px rgba(255,212,92,.95));opacity:1;}',
        '.lv10-shadow.is-hot::after{border-color:#fff;box-shadow:0 0 30px rgba(255,212,92,.6);}',
        '.lv10-spark-ring{position:absolute;width:120px;height:120px;margin:-60px;border-radius:50%;border:2px solid rgba(255,212,92,.5);',
        'pointer-events:none;animation:lv10-ring 2.4s ease-out infinite;z-index:24;}',
        '@keyframes lv10-ring{0%{transform:scale(.5);opacity:.9;}100%{transform:scale(1.5);opacity:0;}}',
        '.lv10-demo{position:absolute;width:76px;pointer-events:none;z-index:44;filter:drop-shadow(0 12px 18px rgba(0,0,0,.5));}',
        '.lv10-demo svg{width:100%;height:auto;display:block;}',
        '.lv10-demo-shadow{position:absolute;width:76px;pointer-events:none;z-index:43;opacity:.55;filter:drop-shadow(0 0 11px rgba(255,212,92,.45));}',
        '.lv10-demo-shadow svg{width:100%;height:auto;display:block;}',
        '.lv10-vortex{position:absolute;inset:0;z-index:58;pointer-events:none;overflow:hidden;',
        'background:radial-gradient(circle at 50% 46%,rgba(255,212,92,.2),rgba(10,8,26,.2) 45%,transparent 70%);}',
        '.lv10-vortex::before{content:"";position:absolute;inset:-20%;background:conic-gradient(from 0deg,transparent,rgba(138,108,255,.16),transparent,rgba(255,107,169,.13),transparent);animation:lv10-spin 2.4s linear infinite;}',
        '@keyframes lv10-spin{to{transform:rotate(360deg);}}',
        '.lv10-layer{position:absolute;left:50%;top:46%;width:min(46vw,560px);height:min(31vw,330px);border-radius:14px;border:1px solid rgba(255,255,255,.22);',
        'background:rgba(16,14,38,.82);overflow:hidden;transform:translate(-50%,-50%) scale(var(--s));',
        'box-shadow:0 26px 60px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.05);',
        'animation:lv10-pulse var(--dur) ease-in-out infinite alternate;animation-delay:var(--d);}',
        '.lv10-layer .lv10-bar{height:22px;background:rgba(255,255,255,.08);display:flex;align-items:center;gap:5px;padding:0 8px;}',
        '.lv10-layer .lv10-bar i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.35);}',
        '.lv10-layer .lv10-body{height:calc(100% - 22px);display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 40% 20%,rgba(96,72,190,.35),transparent 60%);}',
        '.lv10-layer .lv10-body .nf-ico{width:100px;height:100px;filter:drop-shadow(0 12px 18px rgba(0,0,0,.45));}',
        '@keyframes lv10-pulse{from{filter:brightness(.88);}to{filter:brightness(1.14);}}',
        'body.lv10-glitch #os{animation:lv10-glitch .28s steps(2) infinite;}',
        '@keyframes lv10-glitch{0%{filter:hue-rotate(0) saturate(1);}50%{filter:hue-rotate(26deg) saturate(1.5);}100%{filter:hue-rotate(-12deg) saturate(.9);}}',
        '.lv10-folder-pop{animation:lv10-folder-pop .6s cubic-bezier(.34,1.56,.64,1) both !important;}',
        '@keyframes lv10-folder-pop{0%{transform:scale(.2) rotate(-8deg);opacity:0;}60%{transform:scale(1.12) rotate(3deg);opacity:1;}100%{transform:scale(1) rotate(0);}}',
        /* ===== 迷你游戏窗口（第四面墙） ===== */
        '.lv10-meta{position:absolute;inset:0;z-index:60;pointer-events:none;overflow:hidden;',
        'background:radial-gradient(ellipse at 50% 42%,rgba(28,20,64,.9),rgba(5,4,14,.97));}',
        '.lv10-meta::before{content:"";position:absolute;inset:0;background-image:radial-gradient(1px 1px at 20% 30%,rgba(255,255,255,.7),transparent 60%),',
        'radial-gradient(1.5px 1.5px at 70% 20%,rgba(255,255,255,.55),transparent 60%),',
        'radial-gradient(1px 1px at 40% 75%,rgba(255,255,255,.5),transparent 60%),',
        'radial-gradient(1.4px 1.4px at 85% 65%,rgba(255,255,255,.6),transparent 60%);opacity:.6;}',
        '.lv10-frame{position:absolute;width:320px;height:212px;border-radius:12px;background:rgba(20,18,48,.92);',
        'border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 60px rgba(0,0,0,.55);overflow:hidden;',
        'transform:translate(-50%,-50%) rotate(var(--rot,0deg));opacity:0;transition:opacity .5s ease;will-change:left,top,transform;}',
        '.lv10-frame.show{opacity:1;}',
        '.lv10-frame.lv10-decoy{border-color:rgba(255,255,255,.1);filter:saturate(.7) brightness(.92);}',
        '.lv10-frame-bar{height:24px;display:flex;align-items:center;gap:5px;padding:0 9px;background:rgba(255,255,255,.08);}',
        '.lv10-frame-bar i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.35);}',
        '.lv10-frame-bar span{margin-left:6px;font-size:9.5px;color:rgba(238,240,255,.55);letter-spacing:.08em;}',
        '.lv10-frame-body{position:relative;height:calc(100% - 24px);background:',
        'radial-gradient(ellipse at 30% 20%,rgba(98,74,200,.5),transparent 60%),linear-gradient(150deg,#191338,#111a33 70%,#0c1126);}',
        '.lv10-frame-icons{position:absolute;left:14px;top:14px;display:flex;flex-direction:column;gap:6px;}',
        '.lv10-frame-icons .nf-ico{width:34px;height:34px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.4));opacity:.9;}',
        '.lv10-frame-icons span{font-size:7.5px;color:rgba(255,255,255,.4);text-align:center;}',
        '.lv10-frame-taskbar{position:absolute;left:8px;right:8px;bottom:7px;height:32px;border-radius:8px;',
        'background:rgba(10,9,26,.75);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;gap:6px;padding:0 7px;}',
        '.lv10-frame-taskbar .nf-ico{width:22px;height:22px;}',
        '.lv10-frame-mascot{margin-left:auto;width:22px;height:22px;}',
        '.lv10-frame-mascot svg{width:100%;height:100%;}',
        '.lv10-frame-jar{position:relative;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;',
        'cursor:default;transition:transform .2s ease,box-shadow .3s ease;}',
        '.lv10-frame-jar svg{width:24px;height:24px;}',
        '.lv10-frame.is-real .lv10-frame-jar{box-shadow:0 0 0 1px rgba(255,212,92,.55),0 0 16px rgba(255,212,92,.55);animation:lv10-jar-pulse 1.6s ease-in-out infinite;}',
        '@keyframes lv10-jar-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}',
        '.lv10-frame.is-real .lv10-frame-mascot{filter:drop-shadow(0 0 6px rgba(255,201,77,.8));}',
        '.lv10-frame .lv10-frame-target{position:absolute;inset:auto 6px 5px 6px;height:36px;border-radius:8px;pointer-events:none;}',
        '.lv10-frame.is-real .lv10-frame-target{box-shadow:inset 0 0 0 1px rgba(255,212,92,.35);}',
        '.lv10-open-hint{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);text-align:center;color:rgba(238,240,255,.55);',
        'font-size:12px;letter-spacing:.2em;pointer-events:none;animation:fade-in .8s ease both;z-index:61;}',
        '.lv10-open-hint .nf-ico{width:30px;height:30px;display:block;margin:0 auto 6px;}',
        '.lv10-fake-glow{position:absolute;width:64px;height:64px;margin:-32px;border-radius:50%;pointer-events:none;',
        'background:radial-gradient(circle,rgba(255,93,122,.7),transparent 65%);animation:lv10-ring 1.6s ease-out infinite;}'
      ].join(''));

      var glow = document.createElement('div');
      glow.className = 'lv10-glow';
      ctx.root.appendChild(glow);

      function levelH() { return ctx.root.clientHeight || (innerHeight - 58); }

      function menuItems() {
        var canCreate = !folder && !recursionStarted;
        return [
          { id: 'view', label: '查看', icon: 'eye', disabled: true },
          { id: 'sort', label: '排序方式', icon: 'arrowDown', disabled: true },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
          { separator: true },
          {
            id: 'new', label: '新建', icon: 'folder',
            submenu: [
              { id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', disabled: !canCreate, onSelect: function () { openNameDialog(); } },
              { id: 'text', label: '文本文档', icon: 'fileText', onSelect: function () { NF.Audio.play('deny'); } }
            ]
          },
          { separator: true },
          { id: 'personalize', label: '个性化', icon: 'settings', onSelect: function () { NF.Audio.play('deny'); } }
        ];
      }

      function openMenuAt(x, y) {
        OS.closeMenus();
        OS.menu({ x: x, y: y, items: menuItems() });
      }

      function openNameDialog() {
        if (folder || dlg || recursionStarted) return;
        OS.closeMenus();
        dlg = OS.nameDialog({
          title: '新建文件夹',
          icon: 'folder',
          value: '新建文件夹',
          onSubmit: function (name) {
            dlg = null;
            makeFolder(name || '新建文件夹');
            return true;
          },
          onClose: function () { dlg = null; }
        });
      }

      /* ---------------- 阶段 1：建文件夹 ---------------- */
      function makeFolder(name) {
        if (folder || recursionStarted) return;
        stage = 2;
        folderHome.x = innerWidth / 2 - 38;
        folderHome.y = levelH() * 0.4 - 30;
        folder = ctx.createdFolder({ x: folderHome.x, y: folderHome.y, label: name, testid: 'created-folder' });
        folder.classList.add('lv10-folder-pop');
        NF.Audio.play('pop');
        NF.FX.burst(folderHome.x + 38, folderHome.y + 32, { count: 22, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 6, gravity: 0.18 });
        NF.FX.sparkle(folderHome.x + 38, folderHome.y + 32);

        var ring = document.createElement('div');
        ring.className = 'lv10-spark-ring';
        ring.style.left = (folderHome.x + 38) + 'px';
        ring.style.top = (folderHome.y + 34) + 'px';
        ctx.root.appendChild(ring);
        setTimeout(function () { if (ring.parentNode) ring.remove(); }, 5200);

        bindFolderDrag('shadow');
        ctx.timer(1000, function () { if (!recursionStarted) ctx.replayHint(); });
      }

      function bindFolderDrag(mode) {
        if (dragHandle) { try { dragHandle.destroy(); } catch (e) {} dragHandle = null; }
        dragHandle = OS.makeDraggable(folder, {
          threshold: 3,
          canStart: function () { return !completed && (mode === 'shadow' ? !recursionStarted : metaActive); },
          onStart: function () {
            NF.Audio.play('paper', { volume: 0.5 });
            if (mode === 'shadow') {
              NF.Audio.play('giggle', { volume: 0.3 });
              makeShadow();
            } else {
              folder.classList.add('lv10-big');
              metaDragging = true;
            }
          },
          onMove: function (e, st) {
            folder.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) scale(1.05) rotate(' + Math.max(-7, Math.min(7, st.dx * 0.03)) + 'deg)';
            if (mode === 'shadow' && shadow) {
              shadow.classList.toggle('is-hot', OS.overlapRatio(folder, shadow) > 0.18);
            } else if (mode === 'meta') {
              var real = jarReal.getBoundingClientRect();
              var fake = jarFake.getBoundingClientRect();
              var nearReal = Math.hypot(e.clientX - (real.left + real.width / 2), e.clientY - (real.top + real.height / 2)) < 110;
              var nearFake = Math.hypot(e.clientX - (fake.left + fake.width / 2), e.clientY - (fake.top + fake.height / 2)) < 110;
              folder.classList.toggle('lv10-over-jar', nearReal || nearFake);
              if (nearReal) jarReal.classList.add('lv10-hot');
              else jarReal.classList.remove('lv10-hot');
            }
          },
          onEnd: function (e, st) {
            if (mode === 'shadow') {
              if (shadow && OS.overlapRatio(folder, shadow) > 0.22) triggerRecursion();
              else {
                if (shadow) { shadow.remove(); shadow = null; }
                OS.commitDrag(folder, st.dx, st.dy);
                folder.style.transform = '';
                folderHome.x = parseFloat(folder.style.left) || folderHome.x;
                folderHome.y = parseFloat(folder.style.top) || folderHome.y;
                NF.Audio.play('thud', { volume: 0.4 });
              }
            } else {
              // 丢向迷你窗口的罐子
              var real = jarReal.getBoundingClientRect();
              var fake = jarFake.getBoundingClientRect();
              var dReal = Math.hypot(e.clientX - (real.left + real.width / 2), e.clientY - (real.top + real.height / 2));
              var dFake = Math.hypot(e.clientX - (fake.left + fake.width / 2), e.clientY - (fake.top + fake.height / 2));
              jarReal.classList.remove('lv10-hot');
              metaDragging = false;
              if (dReal < 104) metaSuccess();
              else if (dFake < 104) metaWrong();
              else {
                OS.commitDrag(folder, st.dx, st.dy);
                folder.style.transform = '';
                NF.Audio.play('thud', { volume: 0.35 });
              }
            }
          }
        });
      }

      function makeShadow() {
        if (shadow) { shadow.remove(); shadow = null; }
        shadow = document.createElement('div');
        shadow.className = 'lv10-shadow';
        shadow.dataset.t = 'folder-shadow';
        shadow.innerHTML = NF.icons.svg('folder');
        shadow.style.left = folder.style.left;
        shadow.style.top = folder.style.top;
        ctx.root.appendChild(shadow);
        var c = OS.center(shadow);
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,212,92,.55)', radius: 60 });
      }

      /* ---------------- 阶段 2：递归炸裂 ---------------- */
      function triggerRecursion() {
        if (recursionStarted || completed) return;
        recursionStarted = true;
        if (dragHandle) { dragHandle.destroy(); dragHandle = null; }
        if (shadow) { shadow.remove(); shadow = null; }
        folder.style.pointerEvents = 'none';
        folder.style.transition = 'transform .7s cubic-bezier(.34,1.56,.64,1),opacity .7s ease';
        folder.style.transform = 'scale(1.35) rotate(-5deg)';
        ctx.timer(650, function () { folder.style.opacity = '0'; });
        document.body.classList.add('lv10-glitch');
        NF.Audio.play('whoosh');
        NF.Audio.play('explode', { volume: 0.75 });
        ctx.timer(160, function () { NF.Audio.play('alarm', { volume: 0.35 }); });
        var vortex = buildVortex();
        NF.FX.flash('rgba(255,255,255,.5)', 180);
        NF.FX.shake(9, 600);
        var cx = innerWidth / 2, cy = levelH() * 0.42;
        NF.FX.confetti({ count: 60 });
        ctx.timer(900, function () {
          NF.FX.flash('rgba(255,247,220,.7)', 220);
          NF.FX.burst(cx, cy, { count: 60, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 14, gravity: -0.05 });
        });
        ctx.timer(1300, function () {
          if (vortex.parentNode) vortex.remove();
          enterMeta();
        });
      }

      function buildVortex() {
        var vortex = document.createElement('div');
        vortex.className = 'lv10-vortex';
        vortex.dataset.t = 'recursion-vortex';
        for (var i = 0; i < 9; i++) {
          var layer = document.createElement('div');
          layer.className = 'lv10-layer';
          var s = 1 - i * 0.085;
          layer.style.setProperty('--s', s.toFixed(3));
          layer.style.setProperty('--d', (i * 120) + 'ms');
          layer.style.setProperty('--dur', (1.4 + i * 0.15) + 's');
          layer.style.transform = 'translate(-50%,-50%) scale(' + s + ') rotate(' + ((i % 2 ? -1 : 1) * i * 0.5) + 'deg)';
          layer.innerHTML = '<div class="lv10-bar"><i></i><i></i><i></i></div><div class="lv10-body">' + NF.icons.svg(i % 3 === 0 ? 'folderFace' : 'folder') + '</div>';
          vortex.appendChild(layer);
        }
        ctx.root.appendChild(vortex);
        return vortex;
      }

      /* ---------------- 阶段 3：游戏里的游戏 ---------------- */
      function enterMeta() {
        if (completed) return;
        stage = 3;
        metaActive = true;
        document.body.classList.remove('lv10-glitch');
        if (folder) {
          folder.style.transition = 'opacity .3s ease, transform .3s ease';
          folder.style.opacity = '1';
          folder.style.transform = '';
          folder.style.left = (innerWidth / 2 - 38) + 'px';
          folder.style.top = (levelH() * 0.2) + 'px';
          folder.style.zIndex = '80';
          folderHome.x = innerWidth / 2 - 38;
          folderHome.y = levelH() * 0.2;
          ctx.timer(320, function () {
            folder.style.transition = '';
            folder.style.pointerEvents = 'auto';
            if (folder) bindFolderDrag('meta');
          });
        }

        meta = document.createElement('div');
        meta.className = 'lv10-meta';
        meta.dataset.t = 'meta-layer';
        var real = makeFrame(true);
        var fake = makeFrame(false);
        meta.appendChild(real);
        meta.appendChild(fake);
        frames = [real, fake];

        var hint = document.createElement('div');
        hint.className = 'lv10-open-hint';
        hint.innerHTML = NF.icons.svg('window');
        meta.appendChild(hint);

        ctx.root.appendChild(meta);
        jarReal = real.querySelector('[data-t="meta-jar"]');
        jarFake = fake.querySelector('[data-t="meta-jar-fake"]');
        real.classList.add('show');
        fake.classList.add('show');
        NF.Audio.play('open');
        NF.Audio.play('giggle', { volume: 0.4 });

        // 两个迷你窗口绕中心漂移
        var t0 = performance.now();
        function drift(now) {
          var t = (now - t0) / 1000;
          var tMove = t * (metaDragging ? 0.22 : 1);
          var cx = innerWidth / 2;
          var cy = levelH() * 0.55;
          var r1x = 225, r1y = 105, r2x = 270, r2y = 130;
          var ax = cx + Math.cos(tMove * 0.32) * r1x;
          var ay = cy + Math.sin(tMove * 0.42) * r1y;
          var bx = cx + Math.cos(tMove * 0.28 + Math.PI + 0.7) * r2x;
          var by = cy + Math.sin(tMove * 0.4 + Math.PI + 0.7) * r2y;
          ax = OS.clamp(ax, 180, innerWidth - 180);
          bx = OS.clamp(bx, 180, innerWidth - 180);
          ay = OS.clamp(ay, 150, levelH() - 130);
          by = OS.clamp(by, 150, levelH() - 130);
          real.style.left = ax + 'px';
          real.style.top = ay + 'px';
          real.style.setProperty('--rot', (Math.sin(t * 0.5) * 3).toFixed(2) + 'deg');
          fake.style.left = bx + 'px';
          fake.style.top = by + 'px';
          fake.style.setProperty('--rot', (Math.cos(t * 0.42) * 4).toFixed(2) + 'deg');
          real.classList.toggle('is-real', true);
          phaseMove = t;
        }
        rafStop = OS.raf(drift);
        ctx.onCleanup(function () { if (rafStop) rafStop(); });

        ctx.timer(900, function () { if (metaActive && !completed) ctx.replayHint(); });
      }

      function makeFrame(isReal) {
        var el = document.createElement('div');
        el.className = 'lv10-frame' + (isReal ? ' is-real' : ' lv10-decoy');
        el.dataset.t = isReal ? 'meta-window-real' : 'meta-window-fake';
        el.innerHTML = '<div class="lv10-frame-bar"><i></i><i></i><i></i><span>' +
          (isReal ? '新建文件夹.exe' : '新建文件夹(2).exe') + '</span></div>' +
          '<div class="lv10-frame-body">' +
          '<div class="lv10-frame-icons">' + NF.icons.svg('folder') + '<span>新建文件夹</span></div>' +
          '<div class="lv10-frame-taskbar">' +
          '<span class="lv10-frame-jar" data-t="' + (isReal ? 'meta-jar' : 'meta-jar-fake') + '">' + NF.icons.svg('jar') + '</span>' +
          '<div class="lv10-frame-mascot">' + NF.icons.svg(isReal ? 'folderFace' : 'robot') + '</div>' +
          '</div></div>';
        return el;
      }

      function metaWrong() {
        NF.Audio.play('error');
        NF.Audio.play('giggle', { volume: 0.5 });
        NF.FX.flash('rgba(255,93,122,.28)', 180);
        NF.FX.shake(7, 280);
        OS.toast({ icon: 'bug', title: '这个窗口里没有出口', kind: 'error', ms: 1400 });
        folder.style.transition = 'left .4s cubic-bezier(.34,1.56,.64,1),top .4s cubic-bezier(.34,1.56,.64,1)';
        folder.style.left = folderHome.x + 'px';
        folder.style.top = folderHome.y + 'px';
        folder.style.transform = '';
        ctx.timer(450, function () { if (folder) folder.style.transition = ''; });
      }

      function metaSuccess() {
        if (completed) return;
        completed = true;
        metaActive = false;
        if (dragHandle) { dragHandle.destroy(); dragHandle = null; }
        NF.Audio.play('snap');
        NF.Audio.play('sparkle', { volume: 0.9 });
        NF.Audio.play('alarm', { volume: 0.25 });
        var c = OS.rect(jarReal);
        var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
        folder.style.transition = 'transform .55s cubic-bezier(.34,1.56,.64,1),opacity .55s ease';
        folder.style.transform = 'scale(.12) translate(' + (cx - (OS.rect(folder).left + 38)) + 'px,' + (cy - (OS.rect(folder).top + 30)) + 'px)';
        folder.style.opacity = '0';
        NF.FX.burst(cx, cy, { count: 40, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 11, gravity: 0.2 });
        NF.FX.confetti({ count: 60 });
        ctx.timer(500, function () {
          ctx.root.querySelectorAll('.lv10-frame').forEach(function (f) {
            f.style.transition = 'opacity .5s ease, transform .7s ease';
            f.style.opacity = '0';
            f.style.transform += ' scale(.6)';
          });
          NF.FX.flash('rgba(255,247,220,.8)', 260);
          document.body.classList.add('lv10-glitch');
          NF.Audio.play('explode', { volume: 0.4 });
        });
        ctx.timer(1200, function () {
          document.body.classList.remove('lv10-glitch');
          if (meta) meta.style.opacity = '0';
        });
        ctx.complete({ x: cx, y: cy, delay: 1800 });
      }

      /* ---------------- 输入 ---------------- */
      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (recursionStarted || completed) return;
        openMenuAt(e.clientX, e.clientY);
      });

      ctx.on(window, 'keydown', function (e) {
        if (recursionStarted || completed) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          openNameDialog();
        }
      });

      /* ---------------- 幽灵演示 ---------------- */
      ctx.hint = async function () {
        if (completed) return;
        OS.closeMenus();
        if (stage <= 2 && !folder) {
          if (!dlg) {
            await NF.Ghost.play([
              { move: [innerWidth / 2, innerHeight * 0.55], dur: 350 },
              { keys: 'Ctrl+Shift+F', dur: 900 },
              { do: function () { openNameDialog(); } },
              { wait: 240 },
              { highlight: '[data-t="dialog-ok"]', dur: 650 }
            ]);
          } else {
            await NF.Ghost.play([
              { move: '[data-t="dialog-ok"]', dur: 450 },
              { highlight: '[data-t="dialog-ok"]', dur: 650 }
            ]);
          }
          return;
        }
        if (stage === 2 && folder && !recursionStarted) {
          if (demoFolder && demoFolder.parentNode) demoFolder.remove();
          if (demoShadow && demoShadow.parentNode) demoShadow.remove();
          var fRect = OS.rect(folder);
          await NF.Ghost.play([
            { highlight: '[data-t="created-folder"]', dur: 550 },
            {
              do: function () {
                demoFolder = document.createElement('div');
                demoFolder.className = 'lv10-demo';
                demoFolder.innerHTML = NF.icons.svg('folder');
                demoFolder.style.left = (fRect.left - 120) + 'px';
                demoFolder.style.top = (fRect.top + 60) + 'px';
                demoShadow = document.createElement('div');
                demoShadow.className = 'lv10-demo-shadow';
                demoShadow.dataset.t = 'folder-shadow';
                demoShadow.innerHTML = NF.icons.svg('folder');
                demoShadow.style.left = demoFolder.style.left;
                demoShadow.style.top = demoFolder.style.top;
                ctx.root.appendChild(demoShadow);
                ctx.root.appendChild(demoFolder);
              }
            },
            { highlight: '[data-t="folder-shadow"]', dur: 550 },
            { drag: { from: function () { return demoFolder; }, to: function () { return demoShadow; }, dur: 1000 } },
            { wait: 200 },
            {
              do: function () {
                if (demoFolder) { demoFolder.remove(); demoFolder = null; }
                if (demoShadow) { demoShadow.remove(); demoShadow = null; }
              }
            }
          ]);
          return;
        }
        if (stage === 3 && metaActive) {
          await NF.Ghost.play([
            { move: '[data-t="meta-window-real"]', dur: 500 },
            { highlight: '[data-t="meta-jar"]', dur: 700 },
            { move: '[data-t="created-folder"]', dur: 450 },
            { highlight: '[data-t="created-folder"]', dur: 500 },
            { drag: { from: '[data-t="created-folder"]', to: '[data-t="meta-jar"]', dur: 1100, after: 200 } },
            { wait: 150 }
          ]);
        }
      };

      ctx.onCleanup(function () {
        if (demoFolder && demoFolder.parentNode) demoFolder.remove();
        if (demoShadow && demoShadow.parentNode) demoShadow.remove();
        if (shadow && shadow.parentNode) shadow.remove();
        if (rafStop) rafStop();
        if (dlg) { try { dlg.close('cleanup'); } catch (e) {} dlg = null; }
        document.body.classList.remove('lv10-glitch');
        if (folder && folder.parentNode) folder.remove();
      });

      ctx.qa('l10', ctx.root);
    }
  });
})();



