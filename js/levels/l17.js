/* 第 17 关：小夹的凝视
   —— 小夹长成了巨型 Boss，盯着谁谁就不能动。
   1. 睁眼时全局 capture 吞掉所有点击（红色闪烁 + deny），菜单/对话被强制关闭；
   2. 闭眼窗口（1.3-1.9s）里右键 → 新建 → 文件夹（直接生成，不弹命名框）；
   3. 文件夹一出现，Boss 强制闭眼 2.4s：必须在它睁眼前把文件夹拖进右下角玻璃罐；
   4. 睁眼时文件夹还在外面 → 被盯成灰烬，无限重试。 */
(function () {
  'use strict';
  var ID = 17;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'folderFace',
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var DASH_MS = 2400;          // 文件夹出现后的闭眼抢跑窗口
      var OPEN_MS = 2400;          // 每轮睁眼持续
      var completed = false;
      var winning = false;         // 文件夹已安全入罐
      var eyesOpen = false;
      var eyeTimer = 0;
      var dashTimer = 0;
      var lastGazeAt = 0;
      var folder = null;
      var folderDrag = null;
      var demoMenu = null;
      var boss = null;
      var jar = null;
      var dashBar = null;
      var gazeFlash = null;

      ctx.style([
        /* ---------- 场景 ---------- */
        '.lv17-vignette{position:absolute;inset:0;pointer-events:none;z-index:0;',
        ' background:radial-gradient(ellipse 58% 46% at 50% 30%,rgba(255,60,90,.10),transparent 62%),',
        ' radial-gradient(ellipse 90% 70% at 50% 108%,rgba(0,0,0,.5),transparent 64%);}',

        /* ---------- Boss ---------- */
        '.lv17-boss{position:absolute;left:50%;top:46px;width:360px;height:360px;margin-left:-180px;z-index:30;',
        ' pointer-events:none;filter:drop-shadow(0 34px 60px rgba(0,0,0,.55));',
        ' animation:lv17-bob 4.6s ease-in-out infinite alternate;transition:filter .25s ease;}',
        '@keyframes lv17-bob{from{transform:translateY(0) rotate(-.7deg);}to{transform:translateY(-12px) rotate(.7deg);}}',
        '.lv17-face{position:absolute;inset:0;}',
        '.lv17-face svg{width:100%;height:100%;display:block;}',
        /* 闭眼时藏掉眼白与瞳孔（folderFace 里第 1、2 个 ellipse 是眼睛，circle 全是瞳孔/高光） */
        '.lv17-boss[data-eyes="closed"] .lv17-face svg ellipse:nth-of-type(1),',
        '.lv17-boss[data-eyes="closed"] .lv17-face svg ellipse:nth-of-type(2),',
        '.lv17-boss[data-eyes="closed"] .lv17-face svg circle{opacity:0;}',
        /* 闭眼的眼皮弧线 */
        '.lv17-lid{position:absolute;width:78px;height:24px;top:184px;border-radius:0 0 62% 62%/0 0 100% 100%;',
        ' border-bottom:7px solid #8a5a12;opacity:0;transition:opacity .1s ease;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25));}',
        '.lv17-lid-l{left:90px;}',
        '.lv17-lid-r{left:192px;}',
        '.lv17-boss[data-eyes="closed"] .lv17-lid{opacity:1;}',
        /* 睁眼的气场 + 眼神红光 */
        '.lv17-aura{position:absolute;inset:-46px;border-radius:50%;pointer-events:none;opacity:0;filter:blur(8px);',
        ' background:radial-gradient(circle at 50% 54%,rgba(255,54,84,.26),rgba(255,54,84,.07) 46%,transparent 68%);',
        ' transition:opacity .3s ease;}',
        '.lv17-boss[data-eyes="open"] .lv17-aura{opacity:1;animation:lv17-aura 2.4s ease-in-out infinite;}',
        '@keyframes lv17-aura{0%,100%{transform:scale(.95);opacity:.55;}50%{transform:scale(1.05);opacity:1;}}',
        '.lv17-glare{position:absolute;inset:0;pointer-events:none;opacity:0;mix-blend-mode:screen;transition:opacity .2s ease;',
        ' background:radial-gradient(circle 44px at 36% 54.7%,rgba(255,54,84,.6),transparent 70%),',
        ' radial-gradient(circle 44px at 64% 54.7%,rgba(255,54,84,.6),transparent 70%);}',
        '.lv17-boss[data-eyes="open"] .lv17-glare{opacity:1;animation:lv17-glare 1.2s ease-in-out infinite;}',
        '@keyframes lv17-glare{0%,100%{filter:brightness(1);}50%{filter:brightness(1.7);}}',
        '.lv17-boss.is-glaring{filter:drop-shadow(0 0 46px rgba(255,54,84,.85)) drop-shadow(0 30px 60px rgba(0,0,0,.55));}',
        /* 闭眼时飘 zZ */
        '.lv17-zzz{position:absolute;right:26px;top:48px;font-family:var(--mono);font-size:26px;font-weight:900;',
        ' letter-spacing:7px;color:rgba(205,228,255,.85);text-shadow:0 4px 16px rgba(0,0,0,.55);opacity:0;transition:opacity .2s ease;}',
        '.lv17-boss[data-eyes="closed"] .lv17-zzz{opacity:.9;animation:lv17-zzz 2.2s ease-in-out infinite;}',
        '@keyframes lv17-zzz{0%,100%{transform:translate(0,4px) scale(.9);opacity:.5;}50%{transform:translate(5px,-9px) scale(1.06);opacity:.95;}}',
        /* 入罐后晕眩 */
        '.lv17-boss.is-dizzy{animation:lv17-dizzy 1s ease-in-out infinite !important;',
        ' filter:drop-shadow(0 0 34px rgba(255,212,92,.8)) drop-shadow(0 30px 60px rgba(0,0,0,.5));}',
        '@keyframes lv17-dizzy{0%,100%{transform:rotate(-3.5deg) translateY(0);}50%{transform:rotate(3.5deg) translateY(-8px);}}',
        '.lv17-dizzy-stars{position:absolute;left:50%;top:6%;transform:translateX(-50%);font-size:26px;letter-spacing:12px;',
        ' color:#ffd45c;opacity:0;text-shadow:0 0 16px rgba(255,212,92,.9);pointer-events:none;}',
        '.lv17-boss.is-dizzy .lv17-dizzy-stars{opacity:1;animation:lv17-stars 1.2s ease-in-out infinite;}',
        '@keyframes lv17-stars{0%,100%{transform:translate(-50%,-4px) rotate(-6deg);}50%{transform:translate(-50%,4px) rotate(6deg);}}',

        /* ---------- 睁眼全屏红闪 ---------- */
        '.lv17-gaze-flash{position:absolute;inset:0;z-index:70;pointer-events:none;opacity:0;',
        ' background:radial-gradient(ellipse at 50% 42%,rgba(255,32,64,.34),rgba(150,0,32,.18) 46%,transparent 74%),',
        ' linear-gradient(rgba(255,40,70,.1),rgba(255,40,70,.1));}',
        '.lv17-gaze-flash.on{animation:lv17-gaze .34s ease-out;}',
        '@keyframes lv17-gaze{0%{opacity:0;}16%{opacity:1;}100%{opacity:0;}}',

        /* ---------- 抢跑倒计时条 ---------- */
        '.lv17-dash{position:absolute;left:50%;top:424px;width:300px;height:8px;margin-left:-150px;border-radius:6px;',
        ' background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);overflow:hidden;z-index:32;',
        ' opacity:0;transition:opacity .18s ease;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.35);}',
        '.lv17-dash.show{opacity:1;}',
        '.lv17-dash i{display:block;height:100%;width:100%;transform-origin:0 50%;',
        ' background:linear-gradient(90deg,#ffd45c,#ff8a5c,#ff5d7a);box-shadow:0 0 14px rgba(255,150,90,.85);',
        ' animation:lv17-dash-run 2400ms linear forwards;}',
        '@keyframes lv17-dash-run{from{transform:scaleX(1);}to{transform:scaleX(0);}}',

        /* ---------- 右下角玻璃罐 ---------- */
        '.lv17-jar{position:absolute;right:64px;bottom:38px;width:174px;display:flex;align-items:flex-end;justify-content:center;',
        ' z-index:34;transition:filter .25s ease;}',
        '.lv17-jar-ring{position:absolute;left:50%;bottom:2px;width:158px;height:158px;margin-left:-79px;border-radius:50%;',
        ' border:2px dashed rgba(255,212,92,.38);opacity:.55;pointer-events:none;animation:lv17-ring 9s linear infinite;}',
        '@keyframes lv17-ring{to{transform:rotate(360deg);}}',
        '.lv17-jar-icon{position:relative;width:128px;z-index:1;filter:drop-shadow(0 22px 30px rgba(0,0,0,.55));',
        ' transition:transform .25s cubic-bezier(.34,1.56,.64,1),filter .25s ease;}',
        '.lv17-jar-icon svg{display:block;width:100%;height:auto;}',
        '.lv17-jar.is-hot .lv17-jar-icon{animation:lv17-jar-hot 1s ease-in-out infinite;}',
        '@keyframes lv17-jar-hot{0%,100%{transform:scale(1);filter:drop-shadow(0 22px 30px rgba(0,0,0,.55));}',
        ' 50%{transform:scale(1.08);filter:drop-shadow(0 0 30px rgba(255,212,92,.9));}}',
        '.lv17-jar.is-fed .lv17-jar-icon{filter:drop-shadow(0 0 40px rgba(255,212,92,.95)) drop-shadow(0 20px 28px rgba(0,0,0,.5));',
        ' animation:lv17-jar-fed 1.1s ease-in-out infinite;}',
        '@keyframes lv17-jar-fed{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px) scale(1.03);}}',

        /* ---------- 桌面文件夹 ---------- */
        /* 关掉 .nf-folder 的 folder-pop 动画：它的 fill-mode 会覆盖拖拽用的 inline transform */
        '.lv17-folder{z-index:44;cursor:grab;animation:none;',
        ' filter:drop-shadow(0 14px 22px rgba(0,0,0,.5)) drop-shadow(0 0 16px rgba(255,212,92,.32));}',
        '.lv17-folder.lv17-folder-grab{filter:drop-shadow(0 18px 28px rgba(0,0,0,.55)) drop-shadow(0 0 26px rgba(255,212,92,.6));}',
        '.lv17-folder.lv17-burn{animation:lv17-burn .62s ease-in forwards;pointer-events:none;}',
        '@keyframes lv17-burn{0%{filter:grayscale(0) brightness(1);opacity:1;}',
        ' 28%{filter:grayscale(1) brightness(.72) contrast(1.5);}',
        ' 100%{filter:grayscale(1) brightness(.15);transform:scale(.2) translateY(-170px) rotate(26deg);opacity:0;}}',

        /* ---------- 幽灵演示用的假菜单 ---------- */
        '.lv17-demo-menu{position:absolute;width:206px;padding:6px;border-radius:11px;z-index:52;pointer-events:none;',
        ' background:rgba(249,250,255,.94);color:#262941;border:1px solid rgba(255,255,255,.9);',
        ' box-shadow:0 18px 42px rgba(0,0,0,.42);font-size:13px;animation:lv17-menu-in .18s ease both;}',
        '@keyframes lv17-menu-in{from{opacity:0;transform:scale(.94) translateY(-4px);}to{opacity:1;transform:scale(1) translateY(0);}}',
        '.lv17-demo-row{display:flex;align-items:center;gap:9px;height:32px;padding:0 8px;border-radius:6px;transition:background .16s ease;}',
        '.lv17-demo-row span{flex:1 1 auto;}',
        '.lv17-demo-row .nf-ico{width:18px;height:18px;flex:0 0 auto;}',
        '.lv17-demo-row.sub{padding-left:30px;}',
        '.lv17-demo-row.on{background:rgba(91,124,250,.2);box-shadow:inset 0 0 0 1px rgba(91,124,250,.24);}',
        '.lv17-demo-arrow{flex:0 0 auto !important;width:12px;color:rgba(38,41,65,.5);text-align:right;}'
      ].join(''));

      /* ============================================================
         骨架：暗角 / Boss / 倒计时条 / 罐子 / 红闪
         ============================================================ */

      var vignette = document.createElement('div');
      vignette.className = 'lv17-vignette';
      ctx.root.appendChild(vignette);

      boss = document.createElement('div');
      boss.className = 'lv17-boss';
      boss.dataset.t = 'mascot-boss';
      boss.dataset.eyes = 'closed';
      boss.dataset.phase = 'build';
      boss.innerHTML = '<div class="lv17-aura"></div>' +
        '<div class="lv17-face">' + NF.icons.svg('folderFace') + '</div>' +
        '<div class="lv17-glare"></div>' +
        '<div class="lv17-lid lv17-lid-l"></div>' +
        '<div class="lv17-lid lv17-lid-r"></div>' +
        '<div class="lv17-zzz">zZ</div>' +
        '<div class="lv17-dizzy-stars">✦ ✦ ✦</div>';
      ctx.root.appendChild(boss);

      dashBar = document.createElement('div');
      dashBar.className = 'lv17-dash';
      dashBar.dataset.t = 'dash-bar';
      dashBar.innerHTML = '<i></i>';
      ctx.root.appendChild(dashBar);

      jar = document.createElement('div');
      jar.className = 'lv17-jar';
      jar.dataset.t = 'boss-jar';
      jar.innerHTML = '<div class="lv17-jar-ring"></div>' +
        '<div class="lv17-jar-icon">' + NF.icons.svg('jar') + '</div>';
      ctx.root.appendChild(jar);

      gazeFlash = document.createElement('div');
      gazeFlash.className = 'lv17-gaze-flash';
      ctx.root.appendChild(gazeFlash);

      /* ============================================================
         眼睛状态机
         ============================================================ */

      function scheduleEyes(ms, fn) {
        clearTimeout(eyeTimer);
        eyeTimer = ctx.timer(ms, fn);
      }

      function applyEyes(open, opts) {
        opts = opts || {};
        eyesOpen = !!open;
        clearTimeout(eyeTimer);
        eyeTimer = 0;
        if (boss) {
          boss.dataset.eyes = eyesOpen ? 'open' : 'closed';
          boss.dataset.phase = winning ? 'dizzy' : (folder ? 'dash' : 'build');
        }
        if (completed || winning) return;
        if (eyesOpen) {
          // 睁眼：收起所有菜单/对话，开始凝视
          try { OS.closeMenus(); } catch (e) { /* 忽略 */ }
          if (typeof OS.closeDialogs === 'function') {
            try { OS.closeDialogs(); } catch (e2) { /* 忽略 */ }
          }
          flashGaze();
          NF.Audio.play('robot', { volume: 0.14 });
          if (folder) ctx.timer(170, burnIfSeen);
          scheduleEyes(OPEN_MS, function () {
            if (!completed && !winning) applyEyes(false);
          });
        } else if (!opts.hold) {
          // 闭眼：随机 1.3 - 1.9 秒后睁开
          scheduleEyes(OS.rand(1300, 1900), function () {
            if (!completed && !winning) applyEyes(true);
          });
        }
      }

      function flashGaze() {
        if (!gazeFlash) return;
        gazeFlash.classList.remove('on');
        void gazeFlash.offsetWidth;
        gazeFlash.classList.add('on');
      }

      function gazeLocked() {
        return eyesOpen && !completed && !winning;
      }

      /* 睁眼时被点：拒绝 + 红闪 + 抖动 + 涟漪 */
      function gazeFeedback(x, y) {
        var now = performance.now();
        if (now - lastGazeAt < 240) return;
        lastGazeAt = now;
        NF.Audio.play('deny', { volume: 0.5 });
        flashGaze();
        if (boss) {
          boss.classList.add('is-glaring');
          ctx.timer(260, function () { if (boss) boss.classList.remove('is-glaring'); });
        }
        NF.FX.ripple(x, y, { color: 'rgba(255,72,96,.55)', radius: 48 });
        NF.FX.shake(3, 160);
      }

      function onGazePointer(e) {
        if (!gazeLocked()) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        gazeFeedback(e.clientX, e.clientY);
      }

      function onGazeSilent(e) {
        if (!gazeLocked()) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }

      // capture 阶段吞掉全局点击：闭眼窗口里完全放行
      ctx.on(document, 'pointerdown', onGazePointer, true);
      ctx.on(document, 'click', onGazeSilent, true);
      ctx.on(document, 'dblclick', onGazeSilent, true);
      ctx.on(document, 'contextmenu', onGazeSilent, true);

      /* ============================================================
         右键菜单 / 建文件夹
         ============================================================ */

      function menuItems() {
        var canCreate = !folder && !winning && !completed && !eyesOpen;
        return [
          { id: 'view', label: '查看', icon: 'eye', disabled: true },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh', { volume: 0.5 }); } },
          { separator: true },
          {
            id: 'new', label: '新建', icon: 'folder', disabled: !canCreate,
            submenu: [
              {
                id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder',
                disabled: !canCreate, onSelect: createFolder
              },
              {
                id: 'text', label: '文本文档', icon: 'fileText',
                onSelect: function () { NF.Audio.play('deny', { volume: 0.4 }); }
              }
            ]
          }
        ];
      }

      function openMenuAt(x, y) {
        if (eyesOpen || completed || winning) return;
        OS.closeMenus();
        OS.menu({ x: x, y: y, items: menuItems() });
      }

      function createFolder() {
        if (completed || winning || folder) return;
        if (eyesOpen) { NF.Audio.play('deny', { volume: 0.4 }); return; }
        OS.closeMenus();
        var fx = OS.clamp(Math.round(W * 0.5 - 38 + OS.rand(-80, 80)), 40, Math.max(40, W - 170));
        var fy = OS.clamp(Math.round(H * 0.56 + OS.rand(-26, 26)), 300, Math.max(300, H - 190));
        folder = ctx.createdFolder({ x: fx, y: fy, label: '新建文件夹', testid: 'created-folder' });
        folder.classList.add('lv17-folder');
        folder.dataset.qa = 'l17-folder';
        NF.Audio.play('pop');
        NF.Audio.play('sparkle', { volume: 0.35 });
        var c = OS.center(folder);
        NF.FX.burst(c.x, c.y, {
          count: 20, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 6, gravity: 0.2
        });
        bindFolderDrag();
        enterDash();
      }

      function pointInJar(x, y) {
        var r = OS.rect(jar);
        return x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 40;
      }

      function bindFolderDrag() {
        if (!folder) return;
        if (folderDrag) { try { folderDrag.destroy(); } catch (e) { /* 忽略 */ } folderDrag = null; }
        var el = folder;
        var base = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };

        folderDrag = OS.makeDraggable(el, {
          threshold: 3,
          canStart: function () { return !completed && !winning; },
          onStart: function () {
            el.style.zIndex = '52';
            el.classList.add('lv17-folder-grab');
            NF.Audio.play('paper', { volume: 0.5 });
          },
          onMove: function (e, st) {
            el.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' +
              OS.clamp(st.dx * 0.03, -7, 7).toFixed(2) + 'deg)';
            var hot = pointInJar(e.clientX, e.clientY) || OS.overlapRatio(el, jar) > 0.16;
            jar.classList.toggle('is-hot', hot);
          },
          onEnd: function (e, st) {
            el.classList.remove('lv17-folder-grab');
            if (completed || winning) return;
            var hot = pointInJar(e.clientX, e.clientY) || OS.overlapRatio(el, jar) > 0.18;
            jar.classList.remove('is-hot');
            OS.commitDrag(el, st.dx, st.dy);
            el.style.transform = '';
            base.x = parseFloat(el.style.left) || base.x;
            base.y = parseFloat(el.style.top) || base.y;
            if (hot) saveFolder();
            else {
              NF.Audio.play('thud', { volume: 0.4 });
              NF.FX.dust(OS.center(el).x, OS.center(el).y);
            }
          }
        });
      }

      /* 文件夹出现后：强制闭眼 2.4s 抢跑 */
      function enterDash() {
        dashBar.innerHTML = '<i style="animation-duration:' + DASH_MS + 'ms"></i>';
        dashBar.classList.add('show');
        clearTimeout(dashTimer);
        clearTimeout(eyeTimer);
        applyEyes(false, { hold: true });
        boss.dataset.phase = 'dash';
        NF.Audio.play('alarm', { volume: 0.18 });
        dashTimer = ctx.timer(DASH_MS, function () {
          dashBar.classList.remove('show');
          if (completed || winning || !folder) return;
          applyEyes(true);
        });
        ctx.timer(480, function () {
          if (!completed && !winning && folder) ctx.replayHint();
        });
      }

      /* 睁眼时文件夹还在外面：被盯成灰烬 */
      function burnIfSeen() {
        if (completed || winning || !folder || !eyesOpen) return;
        var f = folder;
        folder = null;
        if (folderDrag) { try { folderDrag.destroy(); } catch (e) { /* 忽略 */ } folderDrag = null; }
        var fr = OS.rect(f);
        f.style.pointerEvents = 'none';
        f.style.transform = '';
        f.classList.add('lv17-burn');
        boss.classList.add('is-glaring');
        boss.dataset.phase = 'build';
        dashBar.classList.remove('show');
        NF.Audio.play('explode', { volume: 0.34 });
        NF.Audio.play('error', { volume: 0.55 });
        NF.Audio.play('giggle', { volume: 0.3 });
        NF.FX.flash('rgba(255,54,84,.18)', 220);
        NF.FX.shake(6, 280);
        NF.FX.ripple(fr.left + fr.width / 2, fr.top + fr.height / 2, {
          color: 'rgba(255,92,112,.55)', radius: 72
        });
        ctx.timer(240, function () {
          NF.FX.burst(fr.left + fr.width / 2, fr.top + fr.height / 2, {
            count: 30, colors: ['#8e8a9e', '#c9c4d6', '#5c5868'], speed: 8, gravity: -0.05
          });
        });
        ctx.timer(420, function () { boss.classList.remove('is-glaring'); });
        ctx.timer(640, function () { if (f.parentNode) f.remove(); });
        ctx.toast({ icon: 'eye', title: '被盯上了', kind: 'error', ms: 1400 });
        ctx.timer(760, function () {
          if (!completed && !winning && !folder) ctx.replayHint();
        });
      }

      /* 成功入罐：罐子发光，Boss 晕眩，过关 */
      function saveFolder() {
        if (completed || winning || !folder) return;
        winning = true;
        clearTimeout(eyeTimer);
        clearTimeout(dashTimer);
        eyeTimer = 0;
        dashTimer = 0;
        dashBar.classList.remove('show');
        if (folderDrag) { try { folderDrag.destroy(); } catch (e) { /* 忽略 */ } folderDrag = null; }

        var f = folder;
        folder = null;
        jar.classList.remove('is-hot');
        jar.classList.add('is-fed');
        boss.dataset.eyes = 'closed';
        boss.dataset.phase = 'dizzy';
        boss.classList.add('is-dizzy');

        var jr = OS.rect(jar);
        var fr = OS.rect(f);
        var dx = (jr.left + jr.width / 2) - (fr.left + fr.width / 2);
        var dy = (jr.top + jr.height * 0.62) - (fr.top + fr.height / 2);
        f.style.zIndex = '45';
        f.style.transition = 'left .42s cubic-bezier(.34,1.56,.64,1),top .42s cubic-bezier(.34,1.56,.64,1),' +
          'transform .42s cubic-bezier(.34,1.56,.64,1),opacity .3s ease';
        f.style.left = ((parseFloat(f.style.left) || 0) + dx) + 'px';
        f.style.top = ((parseFloat(f.style.top) || 0) + dy) + 'px';
        f.style.transform = 'scale(.42) rotate(-8deg)';
        NF.Audio.play('snap', { volume: 0.9 });
        NF.Audio.play('sparkle', { volume: 0.8 });

        ctx.timer(430, function () {
          f.style.opacity = '0.92';
          NF.FX.flash('rgba(255,240,190,.5)', 240);
          NF.FX.burst(jr.left + jr.width / 2, jr.top + jr.height / 2, {
            count: 44, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#ff6ba9'], speed: 10, gravity: 0.18
          });
          NF.FX.confetti({ count: 60 });
          NF.Audio.play('explode', { volume: 0.4 });
          NF.Audio.play('giggle', { volume: 0.2 });
        });
        ctx.timer(1100, function () {
          if (completed) return;
          ctx.complete({ el: f, delay: 1400 });
        });
      }

      /* ============================================================
         幽灵演示（假菜单 + 拖拽路径，不替玩家操作）
         ============================================================ */

      function removeDemoMenu() {
        if (demoMenu && demoMenu.parentNode) demoMenu.remove();
        demoMenu = null;
      }

      function markDemo(testid, cls) {
        if (!demoMenu) return;
        var row = demoMenu.querySelector('[data-t="' + testid + '"]');
        if (row) row.classList.add(cls || 'on');
      }

      function showDemoMenu() {
        removeDemoMenu();
        var px = OS.clamp(Math.round(W * 0.5 - 104), 28, Math.max(28, W - 250));
        var py = OS.clamp(Math.round(H * 0.70), 80, Math.max(80, H - 210));
        demoMenu = document.createElement('div');
        demoMenu.className = 'lv17-demo-menu';
        demoMenu.dataset.t = 'lv17-demo-menu';
        demoMenu.style.left = px + 'px';
        demoMenu.style.top = py + 'px';
        demoMenu.innerHTML =
          '<div class="lv17-demo-row" data-t="lv17-demo-refresh">' + NF.icons.svg('restart') + '<span>刷新</span></div>' +
          '<div class="lv17-demo-row" data-t="lv17-demo-new">' + NF.icons.svg('folder') + '<span>新建</span><span class="lv17-demo-arrow">▸</span></div>' +
          '<div class="lv17-demo-row sub" data-t="lv17-demo-folder">' + NF.icons.svg('folder') + '<span>文件夹</span></div>';
        ctx.root.appendChild(demoMenu);
        NF.Audio.play('open', { volume: 0.35 });
      }

      function waitClosed(maxMs) {
        return new Promise(function (resolve) {
          var t0 = performance.now();
          (function poll() {
            if (!eyesOpen || completed || winning) { resolve(true); return; }
            if (performance.now() - t0 >= maxMs) { resolve(false); return; }
            setTimeout(poll, 70);
          })();
        });
      }

      function buildDemoSteps() {
        var cx = Math.round(W * 0.5);
        var cy = Math.round(H * 0.66);
        return [
          { move: '[data-t="mascot-boss"]', dur: 380 },
          { highlight: '[data-t="mascot-boss"]', dur: 560 },
          { do: function () { return waitClosed(3200); } },
          { move: [cx, cy], dur: 320 },
          { click: 'right', target: [cx, cy], after: 140 },
          { do: showDemoMenu },
          { move: '[data-t="lv17-demo-new"]', dur: 300 },
          { click: 'left', target: '[data-t="lv17-demo-new"]', after: 160 },
          { do: function () { markDemo('lv17-demo-new'); } },
          { move: '[data-t="lv17-demo-folder"]', dur: 240 },
          { click: 'left', target: '[data-t="lv17-demo-folder"]', after: 160 },
          { do: function () { markDemo('lv17-demo-folder'); } },
          { wait: 140 },
          { do: removeDemoMenu },
          { move: '[data-t="boss-jar"]', dur: 520 },
          { highlight: '[data-t="boss-jar"]', dur: 560 }
        ];
      }

      function dashDemoSteps() {
        return [
          { move: '[data-t="created-folder"]', dur: 420 },
          { highlight: '[data-t="created-folder"]', dur: 520 },
          { drag: { from: '[data-t="created-folder"]', to: '[data-t="boss-jar"]', dur: 900, after: 200 } },
          { highlight: '[data-t="boss-jar"]', dur: 560 }
        ];
      }

      var demo = async function () {
        if (completed || winning) return;
        removeDemoMenu();
        try {
          await NF.Ghost.play(folder ? dashDemoSteps() : buildDemoSteps());
        } finally {
          removeDemoMenu();
        }
      };
      ctx.hint(demo);

      /* ============================================================
         输入
         ============================================================ */

      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (gazeLocked() || completed || winning) return;
        openMenuAt(e.clientX, e.clientY);
      });

      ctx.timer(900, function () {
        if (completed || winning) return;
        var c = OS.center(jar);
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,212,92,.35)', radius: 84 });
      });

      /* ============================================================
         清理 & 启动
         ============================================================ */

      ctx.onCleanup(function () {
        removeDemoMenu();
        clearTimeout(eyeTimer);
        clearTimeout(dashTimer);
        eyeTimer = 0;
        dashTimer = 0;
        if (folderDrag) { try { folderDrag.destroy(); } catch (e) { /* 忽略 */ } folderDrag = null; }
        if (gazeFlash) gazeFlash.classList.remove('on');
        folder = null;
      });

      applyEyes(false); // 开局先闭眼一个窗口，给玩家缓冲
      ctx.qa('l17', ctx.root);
    }
  });
})();
