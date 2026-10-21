/* 第 18 关：假结局
   —— 游戏提前播放了自己的结局页，试图骗玩家"已经通关"。
   1. 全屏假结局层（暗夜、星空、3 个文件夹的玻璃罐、滚动字幕、会躲的"再玩一次"）；
   2. 唯一可行的操作：Ctrl+Shift+F 调出 OS 命名对话框（在 ui-layer，会盖在假结局上）→ 确定；
   3. 文件夹出现在假结局层上方；把它拖到标题中央的发光裂缝（rewind-target）；
   4. 松手 → 屏幕倒带撕裂 → 假结局碎裂消失，露出真实桌面 → 过关。 */
(function () {
  'use strict';
  var ID = 18;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'star',
    init: function (ctx) {
      var VW = innerWidth;
      var VH = innerHeight;
      var LW = ctx.root.clientWidth || VW;
      var LH = ctx.root.clientHeight || (VH - 58);

      var completed = false;
      var folder = null;
      var drag = null;
      var dlg = null;
      var fake = null;
      var fakeTitle = null;
      var jarEl = null;
      var restartBtn = null;
      var target = null;
      var tauntEl = null;
      var tauntTimer = 0;
      var dodge = { x: 0, y: 0 };
      var lastDodgeAt = 0;

      ctx.style([
        /* ---------- 假结局层（挂到 #os 上，z 75：盖住任务栏但低于 ui-layer 的对话框） ---------- */
        '.lv18-fake-ending{position:absolute;inset:0;z-index:75;overflow:hidden;pointer-events:auto;',
        ' background:radial-gradient(ellipse 46% 38% at 50% 58%,rgba(255,176,32,.10),transparent 70%),',
        ' radial-gradient(ellipse 62% 60% at 50% 112%,rgba(70,56,160,.5),transparent 70%),',
        ' linear-gradient(180deg,#0a0a1a,#161331 55%,#241a4d 100%);',
        ' filter:saturate(.72) brightness(.94);transition:opacity .42s ease,transform .48s ease,filter .2s ease;}',
        '.lv18-fake-ending.lv18-gone{opacity:0;transform:scale(1.07) rotate(.5deg);',
        ' filter:invert(1) hue-rotate(160deg);pointer-events:none;}',
        /* 撕裂光条 */
        '.lv18-fake-ending::before,.lv18-fake-ending::after{content:"";position:absolute;left:0;right:0;height:2px;',
        ' background:rgba(255,255,255,.9);opacity:0;pointer-events:none;z-index:30;box-shadow:0 0 22px rgba(255,255,255,.8);}',
        '.lv18-fake-ending.lv18-rewind::before{top:31%;opacity:.9;animation:lv18-tear .28s steps(2) infinite;}',
        '.lv18-fake-ending.lv18-rewind::after{top:64%;opacity:.75;animation:lv18-tear .22s steps(2) infinite reverse;}',
        '@keyframes lv18-tear{0%{transform:translateX(-14px) scaleY(1);}50%{transform:translateX(10px) scaleY(3);}100%{transform:translateX(-4px) scaleY(.6);}}',
        /* 星空 */
        '.lv18-stars{position:absolute;inset:0;pointer-events:none;opacity:.55;',
        ' background-image:radial-gradient(1.5px 1.5px at 12% 22%,#fff,transparent 60%),',
        ' radial-gradient(1px 1px at 28% 64%,#dfe8ff,transparent 60%),',
        ' radial-gradient(2px 2px at 45% 18%,#fff,transparent 60%),',
        ' radial-gradient(1px 1px at 61% 76%,#e6dcff,transparent 60%),',
        ' radial-gradient(1.5px 1.5px at 76% 34%,#fff,transparent 60%),',
        ' radial-gradient(1px 1px at 88% 58%,#d6eeff,transparent 60%),',
        ' radial-gradient(1.5px 1.5px at 36% 88%,#fff,transparent 60%),',
        ' radial-gradient(1px 1px at 8% 82%,#ffe6c8,transparent 60%);',
        ' animation:lv18-twinkle 5s ease-in-out infinite alternate;}',
        '@keyframes lv18-twinkle{from{opacity:.3;}to{opacity:.6;}}',
        /* 标题（假） */
        '.lv18-title{position:absolute;left:50%;top:15%;transform:translateX(-50%);font-size:48px;font-weight:900;',
        ' letter-spacing:.34em;padding-left:.34em;white-space:nowrap;',
        ' background:linear-gradient(180deg,#d9d9e4,#a9a3b8 58%,#7d7590);-webkit-background-clip:text;background-clip:text;',
        ' color:transparent;filter:drop-shadow(0 8px 26px rgba(140,120,200,.25));',
        ' animation:lv18-fake-flicker 7s steps(1) infinite;}',
        '@keyframes lv18-fake-flicker{0%,93%,100%{opacity:.95;}94%{opacity:.5;transform:translateX(-50%) skewX(2deg);}',
        ' 95%{opacity:.95;transform:translateX(-50%);}97%{opacity:.7;transform:translateX(-50%) translateY(1px);}}',
        '.lv18-sub{position:absolute;left:50%;top:calc(15% + 74px);transform:translateX(-50%);font-size:13px;',
        ' letter-spacing:.42em;color:rgba(214,210,236,.38);white-space:nowrap;}',
        /* 假玻璃罐：里面只有 3 个文件夹 */
        '.lv18-jar{position:absolute;left:50%;top:44%;width:214px;margin-left:-107px;pointer-events:auto;cursor:default;',
        ' filter:grayscale(.25) brightness(.9);transition:transform .2s ease,filter .2s ease;}',
        '.lv18-jar svg{display:block;width:100%;height:auto;filter:drop-shadow(0 26px 38px rgba(0,0,0,.55));}',
        '.lv18-jar-folders{position:absolute;left:0;right:0;bottom:13%;height:38%;pointer-events:none;}',
        '.lv18-jar-folders span{position:absolute;width:38px;height:32px;filter:brightness(.92);}',
        '.lv18-jar-folders span svg{width:100%;height:100%;}',
        '.lv18-jar-folders span:nth-child(1){left:29%;bottom:8%;transform:rotate(-9deg);}',
        '.lv18-jar-folders span:nth-child(2){left:41%;bottom:22%;transform:rotate(3deg);}',
        '.lv18-jar-folders span:nth-child(3){left:53%;bottom:6%;transform:rotate(11deg);}',
        '.lv18-jar.lv18-jar-taunt{animation:lv18-jar-taunt .5s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv18-jar-taunt{0%,100%{transform:rotate(0);}30%{transform:rotate(-4deg) scale(1.03);}70%{transform:rotate(3deg);}}',
        /* 标题中央的裂缝目标 */
        '.lv18-crack-target{position:absolute;width:40px;height:80px;z-index:20;pointer-events:none;border-radius:12px;',
        ' filter:drop-shadow(0 0 16px rgba(255,212,92,.85));animation:lv18-crack-breathe 1.5s ease-in-out infinite;}',
        '.lv18-crack-target svg{display:block;width:100%;height:100%;opacity:.95;}',
        '.lv18-crack-target::after{content:"";position:absolute;inset:-14px;border-radius:50%;',
        ' background:radial-gradient(circle,rgba(255,212,92,.34),transparent 68%);}',
        '@keyframes lv18-crack-breathe{0%,100%{transform:scale(1);opacity:.85;}50%{transform:scale(1.12);opacity:1;}}',
        /* 字幕条 */
        '.lv18-credits{position:absolute;left:0;right:0;bottom:26px;height:34px;overflow:hidden;pointer-events:none;',
        ' -webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);',
        ' mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);}',
        '.lv18-credits-track{position:absolute;left:100%;top:0;display:flex;align-items:center;gap:64px;height:100%;',
        ' white-space:nowrap;color:rgba(222,218,242,.4);font-size:12px;letter-spacing:.28em;',
        ' animation:lv18-credits 26s linear infinite;}',
        '@keyframes lv18-credits{from{transform:translateX(0);}to{transform:translateX(calc(-100% - 100vw));}}',
        '.lv18-credits-track span{display:flex;align-items:center;gap:10px;}',
        '.lv18-credits-track .nf-ico{width:16px;height:16px;opacity:.6;}',
        /* 会躲的"再玩一次" */
        '.lv18-restart{position:absolute;right:84px;bottom:98px;z-index:22;display:flex;align-items:center;gap:10px;',
        ' padding:12px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.24);',
        ' background:rgba(34,30,64,.72);color:#cfcae8;font-size:13px;font-weight:700;letter-spacing:.1em;',
        ' cursor:pointer;backdrop-filter:blur(10px);box-shadow:0 16px 36px rgba(0,0,0,.4);',
        ' transition:transform .2s cubic-bezier(.22,.8,.3,1),box-shadow .2s ease,opacity .2s ease;}',
        '.lv18-restart .nf-ico{width:20px;height:20px;opacity:.8;}',
        '.lv18-restart:hover{box-shadow:0 18px 40px rgba(0,0,0,.5);}',
        /* 嘲讽气泡 */
        '.lv18-taunt{position:absolute;left:50%;top:calc(44% - 34px);transform:translate(-50%,0) scale(.8);z-index:24;',
        ' padding:8px 16px;border-radius:10px;background:rgba(18,15,36,.92);color:#d8d2ef;font-size:12.5px;',
        ' letter-spacing:.08em;border:1px solid rgba(255,255,255,.16);opacity:0;pointer-events:none;',
        ' box-shadow:0 12px 30px rgba(0,0,0,.45);transition:opacity .18s ease,transform .24s cubic-bezier(.34,1.56,.64,1);}',
        '.lv18-taunt.show{opacity:1;transform:translate(-50%,-14px) scale(1);}',
        /* 回到真实桌面后的文件夹 */
        /* 关掉 .nf-folder 的 folder-pop 动画：它的 fill-mode 会覆盖拖拽用的 inline transform */
        '.lv18-folder{z-index:12;animation:none;',
        ' filter:drop-shadow(0 14px 22px rgba(0,0,0,.5)) drop-shadow(0 0 18px rgba(255,212,92,.45));}',
        '.lv18-folder.is-target-hot{filter:drop-shadow(0 0 26px rgba(255,212,92,.95)) brightness(1.08);}',
        '.lv18-folder.is-rewinding{pointer-events:none;}'
      ].join(''));

      /* ============================================================
         假结局层
         ============================================================ */

      var host = document.getElementById('os') || ctx.root;

      function buildFakeEnding() {
        fake = document.createElement('div');
        fake.className = 'lv18-fake-ending';
        fake.dataset.t = 'fake-ending';

        var stars = document.createElement('div');
        stars.className = 'lv18-stars';
        fake.appendChild(stars);

        fakeTitle = document.createElement('div');
        fakeTitle.className = 'lv18-title';
        fakeTitle.dataset.t = 'fake-ending-title';
        fakeTitle.textContent = '新建文件夹';
        fake.appendChild(fakeTitle);

        var sub = document.createElement('div');
        sub.className = 'lv18-sub';
        sub.textContent = '20 / 20';
        fake.appendChild(sub);

        jarEl = document.createElement('div');
        jarEl.className = 'lv18-jar';
        jarEl.dataset.t = 'fake-ending-jar';
        jarEl.innerHTML = NF.icons.svg('jar') +
          '<div class="lv18-jar-folders"><span>' + NF.icons.svg('folder') + '</span>' +
          '<span>' + NF.icons.svg('folder') + '</span>' +
          '<span>' + NF.icons.svg('folder') + '</span></div>';
        fake.appendChild(jarEl);

        target = document.createElement('div');
        target.className = 'lv18-crack-target';
        target.dataset.t = 'rewind-target';
        target.innerHTML = NF.icons.svg('crack');
        fake.appendChild(target);

        var credits = document.createElement('div');
        credits.className = 'lv18-credits';
        var track = document.createElement('div');
        track.className = 'lv18-credits-track';
        ['STAFF', '小夹', '美术', '音乐', '特别感谢', '你', '再见'].forEach(function (word, i) {
          var span = document.createElement('span');
          span.appendChild(NF.icons.el(i % 2 ? 'folder' : 'sparkle'));
          var txt = document.createElement('i');
          txt.style.fontStyle = 'normal';
          txt.textContent = word;
          span.appendChild(txt);
          track.appendChild(span);
        });
        credits.appendChild(track);
        fake.appendChild(credits);

        restartBtn = document.createElement('div');
        restartBtn.className = 'lv18-restart';
        restartBtn.dataset.t = 'fake-restart';
        restartBtn.setAttribute('role', 'button');
        restartBtn.innerHTML = NF.icons.svg('restart') + '<span>再玩一次</span>';
        fake.appendChild(restartBtn);

        tauntEl = document.createElement('div');
        tauntEl.className = 'lv18-taunt';
        tauntEl.dataset.t = 'fake-taunt';
        fake.appendChild(tauntEl);

        host.appendChild(fake);

        placeTarget();
        if (typeof ResizeObserver === 'function') {
          try {
            var ro = new ResizeObserver(function () { placeTarget(); });
            ro.observe(fake);
            ctx.onCleanup(function () { try { ro.disconnect(); } catch (e) { /* 忽略 */ } });
          } catch (e) { /* 旧浏览器忽略 */ }
        } else {
          ctx.on(window, 'resize', placeTarget);
        }
        wireFakeActions();
      }

      /* 把裂缝对准标题中央 */
      function placeTarget() {
        if (!fake || !target || !fakeTitle) return;
        var fr = OS.rect(fake);
        var tr = OS.rect(fakeTitle);
        target.style.left = Math.round(tr.left - fr.left + tr.width / 2 - 20) + 'px';
        target.style.top = Math.round(tr.top - fr.top + tr.height / 2 - 40) + 'px';
      }

      function showTaunt(text) {
        if (!tauntEl) return;
        tauntEl.textContent = text;
        tauntEl.classList.add('show');
        clearTimeout(tauntTimer);
        tauntTimer = ctx.timer(1300, function () {
          if (tauntEl) tauntEl.classList.remove('show');
        });
      }

      /* 假结局上的一切按钮/罐子都只有嘲讽 */
      function wireFakeActions() {
        var tauntWords = ['已经通关了', '别点了', '真的结束了', '你来得太早了'];

        if (jarEl) {
          ctx.on(jarEl, 'click', function (e) {
            e.stopPropagation();
            NF.Audio.play('giggle', { volume: 0.5 });
            NF.Audio.play('deny', { volume: 0.3 });
            jarEl.classList.remove('lv18-jar-taunt');
            void jarEl.offsetWidth;
            jarEl.classList.add('lv18-jar-taunt');
            showTaunt(tauntWords[Math.floor(Math.random() * tauntWords.length)]);
          });
        }

        if (restartBtn) {
          // 鼠标靠近就躲
          ctx.on(restartBtn, 'pointermove', function (e) {
            var now = performance.now();
            if (now - lastDodgeAt < 90) return;
            lastDodgeAt = now;
            var r = OS.rect(restartBtn);
            var cx = r.left + r.width / 2;
            var cy = r.top + r.height / 2;
            var dx = cx - e.clientX;
            var dy = cy - e.clientY;
            if (Math.hypot(dx, dy) > 130) return;
            var ang = Math.atan2(dy, dx) + (Math.random() * 0.9 - 0.45);
            dodge.x = OS.clamp(dodge.x + Math.cos(ang) * OS.rand(40, 70), -190, 40);
            dodge.y = OS.clamp(dodge.y + Math.sin(ang) * OS.rand(18, 40), -90, 30);
            restartBtn.style.transform = 'translate(' + dodge.x.toFixed(1) + 'px,' + dodge.y.toFixed(1) + 'px) rotate(' +
              ((Math.random() * 2 - 1) * 3).toFixed(1) + 'deg)';
            NF.Audio.play('dodge', { volume: 0.6 });
          });
          ctx.on(restartBtn, 'click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            NF.Audio.play('giggle', { volume: 0.7 });
            showTaunt('想得美');
            dodge.x = OS.rand(-160, 30);
            dodge.y = OS.rand(-80, 20);
            restartBtn.style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1)';
            restartBtn.style.transform = 'translate(' + dodge.x.toFixed(1) + 'px,' + dodge.y.toFixed(1) + 'px) rotate(-4deg)';
          });
        }

        ctx.on(fake, 'contextmenu', function (e) { e.preventDefault(); });
      }

      /* ============================================================
         Ctrl+Shift+F → 命名对话框 → 文件夹
         ============================================================ */

      function openNameDialog() {
        if (completed) return;
        if (dlg && !dlg.closed) { dlg.shake(); return; }
        NF.Audio.play('open', { volume: 0.4 });
        dlg = OS.nameDialog({
          title: '新建文件夹',
          icon: 'folder',
          value: '新建文件夹',
          onSubmit: function (name) {
            dlg = null;
            spawnFolder(name || '新建文件夹');
            return true;
          },
          onClose: function () { dlg = null; }
        });
      }

      function spawnFolder(name) {
        if (completed || folder || !fake) return;
        var fx = OS.clamp(Math.round(VW * 0.5 - 38 + 170), 40, VW - 180);
        var fy = OS.clamp(Math.round(VH * 0.60), 80, VH - 150);
        folder = ctx.createdFolder({ x: fx, y: fy, label: String(name).slice(0, 24), testid: 'created-folder' });
        folder.classList.add('lv18-folder');
        folder.dataset.qa = 'l18-folder';
        // 假结局层在 #os 上（z 75），文件夹必须是它的子元素才能出现在最上面
        if (folder.parentNode) folder.parentNode.removeChild(folder);
        fake.appendChild(folder);
        folder.style.zIndex = '12';
        NF.Audio.play('pop');
        NF.Audio.play('sparkle', { volume: 0.5 });
        var c = OS.center(folder);
        NF.FX.burst(c.x, c.y, { count: 24, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 7, gravity: 0.2 });
        bindFolderDrag();
        ctx.timer(420, function () {
          if (!completed && folder) ctx.replayHint();
        });
      }

      function nearTarget() {
        if (!folder || !target) return false;
        var fc = OS.center(folder);
        var tc = OS.center(target);
        if (Math.hypot(fc.x - tc.x, fc.y - tc.y) < 96) return true;
        return OS.overlapRatio(folder, target) > 0.18;
      }

      function bindFolderDrag() {
        if (!folder) return;
        if (drag) { try { drag.destroy(); } catch (e) { /* 忽略 */ } drag = null; }
        var el = folder;
        var base = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
        drag = OS.makeDraggable(el, {
          threshold: 3,
          canStart: function () { return !completed; },
          onStart: function () {
            el.style.zIndex = '18';
            el.classList.add('is-target-hot');
            NF.Audio.play('paper', { volume: 0.5 });
          },
          onMove: function (e, st) {
            el.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' +
              OS.clamp(st.dx * 0.03, -7, 7).toFixed(2) + 'deg)';
            el.classList.toggle('is-target-hot', nearTarget());
          },
          onEnd: function (e, st) {
            if (completed) return;
            el.classList.remove('is-target-hot');
            if (nearTarget()) {
              rewind(el);
              return;
            }
            base.x = OS.clamp(base.x + st.dx, 16, VW - 110);
            base.y = OS.clamp(base.y + st.dy, 16, VH - 130);
            el.style.left = base.x + 'px';
            el.style.top = base.y + 'px';
            el.style.transform = '';
            NF.Audio.play('thud', { volume: 0.4 });
            NF.FX.dust(OS.center(el).x, OS.center(el).y);
          }
        });
      }

      /* ============================================================
         倒带：假结局碎裂，露出真实桌面
         ============================================================ */

      function rewind(el) {
        if (completed) return;
        completed = true;
        if (drag) { try { drag.destroy(); } catch (e) { /* 忽略 */ } drag = null; }
        folder = null;
        el.classList.add('is-rewinding');

        var fr = OS.rect(el);
        var tr = OS.rect(target);
        var jc = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };

        NF.Audio.play('whoosh');
        NF.Audio.play('powerdown');
        NF.Audio.play('explode', { volume: 0.34 });
        NF.FX.flash('rgba(255,255,255,.85)', 300);
        NF.FX.shake(9, 520);
        NF.FX.ripple(jc.x, jc.y, { color: 'rgba(255,212,92,.9)', radius: 110 });

        // 文件夹被吸进裂缝
        el.style.transition = 'transform .34s cubic-bezier(.5,0,.8,.4),opacity .34s ease';
        el.style.transform = 'translate(' + (jc.x - (fr.left + fr.width / 2)) + 'px,' +
          (jc.y - (fr.top + fr.height / 2)) + 'px) scale(.16) rotate(200deg)';
        el.style.opacity = '0.15';

        // 屏幕倒带撕裂
        if (fake) fake.classList.add('lv18-rewind');
        ctx.timer(120, function () {
          NF.FX.flash('rgba(255,255,255,.55)', 180);
          NF.FX.burst(jc.x, jc.y, {
            count: 46, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 13, gravity: 0.05
          });
        });

        // 把文件夹搬回真实桌面（坐标原点相同），再滑到桌面中央
        ctx.timer(340, function () {
          if (el.parentNode) el.parentNode.removeChild(el);
          el.style.transition = 'none';
          el.style.transform = '';
          el.style.opacity = '0';
          el.style.left = Math.round(VW / 2 - 38) + 'px';
          el.style.top = Math.round(VH * 0.56) + 'px';
          ctx.root.appendChild(el);
          void el.offsetWidth;
          el.style.transition = 'left .5s cubic-bezier(.34,1.56,.64,1),top .5s cubic-bezier(.34,1.56,.64,1),opacity .32s ease';
          el.style.left = Math.round(VW / 2 - 38) + 'px';
          el.style.top = Math.round(VH * 0.5 - 38) + 'px';
          el.style.opacity = '1';
        });

        // 假结局退场
        ctx.timer(360, function () {
          if (!fake) return;
          fake.classList.add('lv18-gone');
        });
        ctx.timer(820, function () {
          if (fake && fake.parentNode) fake.parentNode.removeChild(fake);
          fake = null;
          jarEl = null;
          restartBtn = null;
          target = null;
          fakeTitle = null;
          NF.Audio.play('sparkle', { volume: 0.8 });
          var c = OS.center(el);
          NF.FX.burst(c.x, c.y, {
            count: 30, colors: ['#ffc94d', '#ffe08a', '#7ef0c0', '#ffffff'], speed: 8, gravity: 0.16
          });
        });
        ctx.timer(1080, function () {
          if (completed) ctx.complete({ el: el, delay: 1400 });
        });
      }

      /* ============================================================
         幽灵演示
         ============================================================ */

      function demoForFolder() {
        return [
          { move: '[data-t="created-folder"]', dur: 420 },
          { highlight: '[data-t="created-folder"]', dur: 540 },
          { drag: { from: '[data-t="created-folder"]', to: '[data-t="rewind-target"]', dur: 1000, after: 200 } },
          { highlight: '[data-t="rewind-target"]', dur: 620 }
        ];
      }

      function demoForDialog() {
        return [
          { move: [Math.round(VW / 2), Math.round(VH * 0.5)], dur: 340 },
          { keys: 'Ctrl+Shift+F', dur: 1050 },
          { do: function () { if (!dlg || dlg.closed) openNameDialog(); } },
          { wait: 420 },
          { move: '[data-t="dialog-ok"]', dur: 520 },
          { highlight: '[data-t="dialog-ok"]', dur: 720 }
        ];
      }

      var demo = async function () {
        if (completed) return;
        try {
          await NF.Ghost.play(folder ? demoForFolder() : demoForDialog());
        } catch (err) { /* 演示失败无所谓 */ }
      };
      ctx.hint(demo);

      /* ============================================================
         输入 & 清理
         ============================================================ */

      ctx.on(window, 'keydown', function (e) {
        if (completed) return;
        if (!OS.matchCombo(e, 'Ctrl+Shift+F')) return;
        e.preventDefault();
        e.stopPropagation();
        openNameDialog();
      });

      ctx.onCleanup(function () {
        clearTimeout(tauntTimer);
        if (drag) { try { drag.destroy(); } catch (e) { /* 忽略 */ } drag = null; }
        if (dlg && !dlg.closed) {
          try { dlg.close('cleanup'); } catch (e2) { /* 忽略 */ }
        }
        dlg = null;
        if (fake && fake.parentNode) fake.remove();
        fake = null;
        folder = null;
      });

      buildFakeEnding();
      NF.Audio.play('giggle', { volume: 0.4 });
      ctx.qa('l18', ctx.root);
    }
  });
})();
