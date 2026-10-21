/* 第 20 关：最终考试（真·终章 / 第四面墙）
   系统化身考官，连续三轮用不同方式"新建文件夹"：
   1. 右键菜单；2. 快捷键；3. 终端命令。每轮限时。
   三关都过之后，屏幕裂开——把最后的文件夹拖进裂缝，游戏结束。
*/
(function () {
  'use strict';
  var ID = 20;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'heart',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);
      var completed = false;
      var finalStage = false;
      var round = 1;
      var roundDone = false;
      var timerId = 0;
      var timerFill = null;
      var methodEl = null;
      var slotEls = [];
      var pipsEl = null;
      var finalFolder = null;
      var finalHandle = null;
      var crack = null;
      var termWin = null;
      var termInput = null;
      var termIcon = null;
      var demo = null;
      var wrongFlashTimer = 0;

      ctx.style([
        '.lv20-bgfx{position:absolute;inset:0;pointer-events:none;',
        'background:repeating-linear-gradient(180deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px);opacity:.6;}',
        '.lv20-panel{position:absolute;left:50%;top:26px;transform:translateX(-50%);z-index:46;',
        'display:flex;align-items:center;gap:22px;padding:14px 24px;border-radius:16px;',
        'background:rgba(16,14,38,.85);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.1);',
        'backdrop-filter:blur(20px);pointer-events:none;transition:border-color .3s ease,box-shadow .3s ease;}',
        '.lv20-panel.is-red{border-color:rgba(255,93,122,.8);box-shadow:0 0 40px rgba(255,93,122,.35),0 20px 50px rgba(0,0,0,.45);animation:lv20-shake .4s ease;}',
        '@keyframes lv20-shake{0%,100%{transform:translateX(-50%);}25%{transform:translate(calc(-50% - 7px));}75%{transform:translate(calc(-50% + 7px));}}',
        '.lv20-method{width:86px;height:86px;border-radius:18px;display:flex;align-items:center;justify-content:center;',
        'background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.12),rgba(10,8,26,.7));border:1px solid rgba(255,255,255,.14);',
        'box-shadow:inset 0 0 26px rgba(0,0,0,.5);transition:transform .2s cubic-bezier(.34,1.56,.64,1);}',
        '.lv20-method svg{width:58px;height:58px;filter:drop-shadow(0 6px 12px rgba(0,0,0,.5));}',
        '.lv20-method.pop{animation:lv20-pop .35s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv20-pop{0%{transform:scale(.7);}60%{transform:scale(1.12);}100%{transform:scale(1);}}',
        '.lv20-mid{display:flex;flex-direction:column;gap:9px;min-width:230px;}',
        '.lv20-timer{width:100%;height:8px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;}',
        '.lv20-timer i{display:block;height:100%;width:100%;border-radius:5px;background:linear-gradient(90deg,#ffd45c,#ffb020);}',
        '.lv20-slots{display:flex;gap:8px;justify-content:center;}',
        '.lv20-slot{width:44px;height:38px;border-radius:8px;border:2px dashed rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;',
        'background:rgba(255,255,255,.04);transition:all .3s ease;}',
        '.lv20-slot.filled{border-color:transparent;background:rgba(255,212,92,.1);box-shadow:0 0 16px rgba(255,212,92,.25);}',
        '.lv20-slot svg{width:36px;height:36px;animation:folder-pop .5s cubic-bezier(.34,1.56,.64,1) both;}',
        '.lv20-pips{display:flex;gap:6px;justify-content:center;}',
        '.lv20-pips i{width:8px;height:8px;border-radius:2px;background:rgba(255,255,255,.2);transition:all .25s ease;}',
        '.lv20-pips i.on{background:#ffd45c;box-shadow:0 0 8px rgba(255,212,92,.8);}',
        '.lv20-stage-note{position:absolute;left:50%;top:150px;transform:translateX(-50%);width:280px;height:34px;',
        'border-radius:9px;background:rgba(16,14,38,.55);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;gap:8px;',
        'pointer-events:none;z-index:45;opacity:0;transition:opacity .3s ease;color:rgba(238,240,255,.6);font-size:11px;letter-spacing:.16em;}',
        '.lv20-stage-note.show{opacity:1;}',
        '.lv20-stage-note .nf-ico{width:18px;height:18px;}',
        '.lv20-term-icon{position:absolute;z-index:35;}',
        '.lv20-term{position:absolute;inset:0;padding:14px 16px;font-family:var(--mono);font-size:13.5px;color:#cdd6ff;cursor:text;}',
        '.lv20-term-log{white-space:pre-wrap;line-height:1.55;color:rgba(205,214,255,.8);}',
        '.lv20-term-log .ok{color:#7ef0c0;}.lv20-term-log .bad{color:#ff8fa3;}',
        '.lv20-term-line{display:flex;align-items:center;gap:8px;margin-top:4px;color:#7ef0c0;}',
        '.lv20-term-prompt{color:#8fa2d6;white-space:nowrap;}',
        '.lv20-term-typed{color:#eef2ff;letter-spacing:.04em;}',
        '.lv20-caret{width:8px;height:15px;background:#7ef0c0;animation:blink 1s steps(1) infinite;display:inline-block;}',
        '.lv20-term-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;background:transparent;color:transparent;cursor:text;z-index:2;}',
        '.lv20-crack{position:absolute;left:50%;top:48%;width:120px;height:220px;margin:-110px 0 0 -60px;z-index:47;pointer-events:none;',
        'opacity:0;transform:scale(.2);transition:opacity .5s ease,transform .7s cubic-bezier(.34,1.56,.64,1);}',
        '.lv20-crack.show{opacity:1;transform:scale(1);}',
        '.lv20-crack::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(255,247,220,.95) 22%,rgba(255,212,92,.9) 50%,rgba(255,247,220,.95) 78%,transparent);',
        'clip-path:polygon(46% 0,58% 18%,46% 25%,62% 42%,44% 52%,58% 66%,42% 74%,56% 88%,48% 100%,34% 84%,44% 70%,30% 58%,46% 44%,32% 30%,44% 16%);',
        'filter:drop-shadow(0 0 18px rgba(255,212,92,.85));animation:lv20-crack-pulse 1.6s ease-in-out infinite alternate;}',
        '.lv20-crack::after{content:"";position:absolute;left:50%;top:20%;width:220px;height:220px;margin:-110px;border-radius:50%;',
        'background:radial-gradient(circle,rgba(255,212,92,.28),transparent 65%);filter:blur(12px);}',
        '@keyframes lv20-crack-pulse{from{filter:drop-shadow(0 2px 14px rgba(255,212,92,.6));}to{filter:drop-shadow(0 0 30px rgba(255,247,220,.95));}}',
        '.lv20-crack.is-hot::before{filter:drop-shadow(0 0 34px #fff);}',
        '.lv20-final-folder{position:absolute;z-index:48;}',
        '.lv20-shatter{position:absolute;inset:0;z-index:70;pointer-events:none;background:radial-gradient(circle at 50% 48%,rgba(255,255,255,.95),rgba(255,247,220,.4) 35%,transparent 70%);opacity:0;transition:opacity .4s ease;}',
        '.lv20-shatter.on{opacity:1;}'
      ].join(''));

      var bg = document.createElement('div');
      bg.className = 'lv20-bgfx';
      ctx.root.appendChild(bg);

      /* ---------------- 考官面板 ---------------- */
      var panel = document.createElement('div');
      panel.className = 'lv20-panel';
      panel.dataset.t = 'exam-panel';
      methodEl = document.createElement('div');
      methodEl.className = 'lv20-method';
      methodEl.dataset.t = 'exam-method';
      panel.appendChild(methodEl);
      var mid = document.createElement('div');
      mid.className = 'lv20-mid';
      var timer = document.createElement('div');
      timer.className = 'lv20-timer';
      timerFill = document.createElement('i');
      timer.appendChild(timerFill);
      mid.appendChild(timer);
      var slots = document.createElement('div');
      slots.className = 'lv20-slots';
      for (var i = 0; i < 3; i++) {
        var s = document.createElement('div');
        s.className = 'lv20-slot';
        s.dataset.t = 'exam-slot-' + (i + 1);
        slots.appendChild(s);
        slotEls.push(s);
      }
      mid.appendChild(slots);
      panel.appendChild(mid);
      ctx.root.appendChild(panel);

      pipsEl = document.createElement('div');
      pipsEl.className = 'lv20-pips';
      pipsEl.style.cssText = 'position:absolute;left:50%;top:132px;transform:translateX(-50%);z-index:46;pointer-events:none;';
      for (var p = 0; p < 3; p++) pipsEl.appendChild(document.createElement('i'));
      ctx.root.appendChild(pipsEl);

      var stageNote = document.createElement('div');
      stageNote.className = 'lv20-stage-note';
      stageNote.innerHTML = NF.icons.svg('eye') + '<span></span>';
      stageNote.style.display = 'none';
      ctx.root.appendChild(stageNote);

      function setMethod(method) {
        methodEl.dataset.method = method;
        methodEl.innerHTML = NF.icons.svg(method === 'mouse' ? 'mouseLeft' : method === 'keys' ? 'key' : method === 'crack' ? 'crack' : 'terminal');
        methodEl.classList.remove('pop');
        void methodEl.offsetWidth;
        methodEl.classList.add('pop');
      }

      function updatePips() {
        Array.prototype.forEach.call(pipsEl.children, function (el, i) {
          el.classList.toggle('on', i < round - 1 || (i === round - 1 && roundDone));
        });
      }

      /* ---------------- 计时 ---------------- */
      function startTimer(ms) {
        clearInterval(timerId);
        var end = performance.now() + ms;
        timerFill.style.width = '100%';
        timerFill.style.background = 'linear-gradient(90deg,#ffd45c,#ffb020)';
        timerId = ctx.interval(80, function () {
          if (completed || finalStage) return;
          var left = end - performance.now();
          var frac = Math.max(0, left / ms);
          timerFill.style.width = (frac * 100).toFixed(1) + '%';
          timerFill.style.background = frac < 0.28 ? 'linear-gradient(90deg,#ff5d7a,#ff2d50)' : 'linear-gradient(90deg,#ffd45c,#ffb020)';
          if (left <= 0) {
            clearInterval(timerId);
            roundTimeout();
          }
        });
      }

      function roundTimeout() {
        if (roundDone || completed || finalStage) return;
        NF.Audio.play('alarm', { volume: 0.7 });
        NF.Audio.play('giggle', { volume: 0.5 });
        panel.classList.remove('is-red');
        void panel.offsetWidth;
        panel.classList.add('is-red');
        clearTimeout(wrongFlashTimer);
        wrongFlashTimer = setTimeout(function () { panel.classList.remove('is-red'); }, 600);
        OS.toast({ icon: 'hourglass', title: '超时，重考一次', kind: 'error', ms: 1300 });
        ctx.timer(620, function () { if (!completed && !finalStage) startRound(round); });
      }

      /* ---------------- 轮次流程 ---------------- */
      function startRound(n) {
        if (completed || finalStage) return;
        round = n;
        roundDone = false;
        clearInterval(timerId);
        setMethod(n === 1 ? 'mouse' : n === 2 ? 'keys' : 'terminal');
        updatePips();
        stageNote.classList.add('show');
        stageNote.querySelector('span').textContent = n === 1 ? '请用鼠标' : n === 2 ? '请用键盘' : '请用终端';
        startTimer(n === 1 ? 16000 : 15000);
        if (n === 3) spawnTerminalIcon();
        NF.Audio.play('select', { volume: 0.4 });
        ctx.timer(700, function () { if (!completed && !finalStage) ctx.replayHint(); });
      }

      function advance() {
        if (completed || finalStage) return;
        if (round >= 3) { ctx.timer(450, startFinal); return; }
        ctx.timer(260, function () { startRound(round + 1); });
      }

      function createExamFolder(method) {
        if (completed || finalStage || roundDone) return false;
        if (round !== method) {
          NF.Audio.play('deny');
          OS.toast({ icon: 'warning', title: '这一轮不能用这种方式', kind: 'error', ms: 1200 });
          return false;
        }
        roundDone = true;
        clearInterval(timerId);
        updatePips();
        var f = OS.spawnDesktopFolder({
          x: W / 2 - 38 + OS.rand(-90, 90),
          y: H * 0.52,
          label: '新建文件夹',
          testid: 'exam-folder'
        });
        NF.Audio.play('pop');
        NF.FX.burst(W / 2, H * 0.55, { count: 16, colors: ['#ffc94d', '#ffffff'], speed: 5, gravity: 0.2 });
        var slot = slotEls[round - 1];
        ctx.timer(360, function () {
          if (!f.parentNode) return;
          var fr = OS.rect(f);
          var sr = OS.rect(slot);
          NF.FX.fly(fr, sr, {
            duration: 620, arc: -110, html: NF.icons.svg('folder'),
            onDone: function () {
              slot.classList.add('filled');
              slot.innerHTML = NF.icons.svg('folder');
              NF.FX.sparkle(sr.left + sr.width / 2, sr.top + sr.height / 2);
              NF.Audio.play('sparkle', { volume: 0.7 });
            }
          });
          f.remove();
        });
        NF.Audio.play('success', { volume: 0.65 });
        ctx.timer(950, advance);
        return true;
      }

      /* ---------------- 第 1 轮：右键菜单 ---------------- */
      function openMenuAt(x, y) {
        if (completed || finalStage) return;
        if (round !== 1 || roundDone) {
          NF.Audio.play('deny');
          OS.toast({ icon: 'warning', title: '这一轮不能用鼠标', kind: 'error', ms: 1100 });
          return;
        }
        OS.closeMenus();
        OS.menu({
          x: x, y: y,
          items: [
            { id: 'view', label: '查看', icon: 'eye', disabled: true },
            { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
            { separator: true },
            {
              id: 'new', label: '新建', icon: 'folder',
              submenu: [
                { id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', onSelect: function () { createExamFolder(1); } },
                { id: 'text', label: '文本文档', icon: 'fileText', onSelect: function () { NF.Audio.play('deny'); } }
              ]
            }
          ]
        });
      }

      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      });

      /* ---------------- 第 2 轮：快捷键 ---------------- */
      ctx.on(window, 'keydown', function (e) {
        if (completed || finalStage) return;
        if (OS.isEditable(e.target)) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          if (round === 2 && !roundDone) createExamFolder(2);
          else {
            NF.Audio.play('deny');
            OS.toast({ icon: 'warning', title: '这一轮不能用快捷键', kind: 'error', ms: 1100 });
          }
        }
      });

      /* ---------------- 第 3 轮：终端 ---------------- */
      function spawnTerminalIcon() {
        if (termIcon) return;
        var ref = OS.icon({
          icon: 'terminal',
          x: 48,
          y: H - 190,
          label: '终端',
          testid: 'terminal-icon',
          onDblClick: openTerminal
        });
        termIcon = ref.el;
        termIcon.classList.add('lv20-term-icon');
        termIcon.style.animation = 'folder-pop .5s cubic-bezier(.34,1.56,.64,1) both';
      }

      function openTerminal() {
        if (completed || finalStage) return;
        if (termWin) { try { termWin.focus(); } catch (e) {} return; }
        var body = document.createElement('div');
        body.className = 'lv20-term';
        body.innerHTML = '<div class="lv20-term-log"></div>' +
          '<div class="lv20-term-line"><span class="lv20-term-prompt">C:\\Users\\你\\Desktop&gt;</span>' +
          '<span class="lv20-term-typed"></span><span class="lv20-caret"></span></div>';
        var input = document.createElement('input');
        input.className = 'lv20-term-input';
        input.dataset.t = 'terminal-input';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        body.appendChild(input);
        var typed = body.querySelector('.lv20-term-typed');
        var logEl = body.querySelector('.lv20-term-log');
        body.addEventListener('pointerdown', function () { try { input.focus({ preventScroll: true }); } catch (e) {} });
        input.addEventListener('input', function () { typed.textContent = input.value; });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var v = input.value.trim();
            input.value = '';
            typed.textContent = '';
            if (!v) return;
            if (/^mkdir\s+\S+/i.test(v)) {
              logEl.insertAdjacentHTML('beforeend', '<div class="ok">已创建文件夹：' + escapeHtml(v.replace(/^mkdir\s+/i, '')) + '</div>');
              createExamFolder(3);
            } else if (/^(dir|ls)$/i.test(v)) {
              logEl.insertAdjacentHTML('beforeend', '<div>只有一个文件夹。</div>');
            } else if (/^cls$|^clear$/i.test(v)) {
              logEl.innerHTML = '';
            } else {
              logEl.insertAdjacentHTML('beforeend', '<div class="bad">命令不存在：' + escapeHtml(v) + '</div>');
              NF.Audio.play('error', { volume: 0.4 });
              if (termWin) termWin.shake();
            }
          } else if (e.key === 'Escape') {
            if (termWin) termWin.close();
          }
        });
        termWin = OS.window({
          title: '终端',
          icon: 'terminal',
          x: Math.max(24, W / 2 - 280),
          y: H * 0.3,
          w: 560,
          h: 300,
          body: body,
          testid: 'terminal-window',
          onClose: function () { termWin = null; termInput = null; }
        });
        termInput = input;
        setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 160);
      }

      function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      /* ---------------- 终局：裂缝 ---------------- */
      function startFinal() {
        if (completed) return;
        finalStage = true;
        clearInterval(timerId);
        updatePips();
        timerFill.style.width = '100%';
        timerFill.style.background = 'linear-gradient(90deg,#7ef0c0,#34d399)';
        setMethod('crack');
        stageNote.querySelector('span').textContent = '裂缝出现了';
        OS.closeMenus();
        NF.Audio.play('powerdown', { volume: 0.4 });
        NF.FX.flash('rgba(255,255,255,.35)', 220);
        crack = document.createElement('div');
        crack.className = 'lv20-crack';
        crack.dataset.t = 'crack-target';
        ctx.root.appendChild(crack);
        ctx.timer(120, function () { crack.classList.add('show'); });
        ctx.timer(400, function () { NF.Audio.play('alarm', { volume: 0.3 }); });

        ctx.timer(600, function () {
          if (completed) return;
          finalFolder = ctx.createdFolder({ x: W / 2 - 38, y: H * 0.72, label: '最后的文件夹', testid: 'created-folder' });
          finalFolder.classList.add('lv20-final-folder');
          NF.Audio.play('pop');
          NF.FX.burst(W / 2, H * 0.75, { count: 20, colors: ['#ffc94d', '#ffffff', '#ff6ba9'], speed: 7, gravity: 0.2 });
          makeFinalDraggable();
          ctx.replayHint();
        });
      }

      function makeFinalDraggable() {
        if (!finalFolder) return;
        if (finalHandle) { try { finalHandle.destroy(); } catch (e) {} }
        finalHandle = OS.makeDraggable(finalFolder, {
          threshold: 3,
          canStart: function () { return !completed; },
          onStart: function () { NF.Audio.play('paper', { volume: 0.4 }); },
          onMove: function (e, st) {
            finalFolder.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) scale(1.06) rotate(' + Math.max(-6, Math.min(6, st.dx * 0.03)) + 'deg)';
            if (crack) {
              var cr = OS.rect(crack);
              var near = Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2)) < 150;
              crack.classList.toggle('is-hot', near);
            }
          },
          onEnd: function (e, st) {
            if (completed) return;
            var cr = OS.rect(crack);
            var d = Math.hypot(e.clientX - (cr.left + cr.width / 2), e.clientY - (cr.top + cr.height / 2));
            if (d < 120) finishGame();
            else {
              OS.commitDrag(finalFolder, st.dx, st.dy);
              finalFolder.style.transform = '';
              NF.Audio.play('thud', { volume: 0.4 });
              crack.classList.remove('is-hot');
            }
          }
        });
      }

      function finishGame() {
        if (completed) return;
        completed = true;
        finalStage = false;
        clearInterval(timerId);
        if (finalHandle) { try { finalHandle.destroy(); } catch (e) {} finalHandle = null; }
        NF.Audio.play('explode', { volume: 0.8 });
        NF.Audio.play('win');
        var cr = OS.rect(crack);
        var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
        if (finalFolder) {
          finalFolder.style.transition = 'transform .6s cubic-bezier(.34,1.56,.64,1),opacity .6s ease';
          finalFolder.style.transform = 'scale(.1)';
          finalFolder.style.opacity = '0';
        }
        var shatter = document.createElement('div');
        shatter.className = 'lv20-shatter';
        ctx.root.appendChild(shatter);
        ctx.timer(200, function () { shatter.classList.add('on'); });
        NF.FX.flash('rgba(255,255,255,.85)', 380);
        NF.FX.shake(12, 700);
        NF.FX.confetti({ count: 150 });
        ctx.timer(300, function () {
          if (crack) crack.style.transform = 'scale(2.6)';
          NF.FX.burst(cx, cy, {
            count: 90, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 18, gravity: -0.04
          });
        });
        ctx.timer(700, function () { NF.Audio.play('levelup'); });
        ctx.timer(1600, function () { ctx.complete({ x: cx, y: cy, delay: 1600 }); });
      }

      /* ---------------- 幽灵演示 ---------------- */
      demo = async function () {
        if (completed) return;
        if (finalStage) {
          if (!finalFolder) return;
          await NF.Ghost.play([
            { move: '[data-t="crack-target"]', dur: 520 },
            { highlight: '[data-t="crack-target"]', dur: 700 },
            { move: '[data-t="created-folder"]', dur: 500 },
            { highlight: '[data-t="created-folder"]', dur: 520 },
            { drag: { from: '[data-t="created-folder"]', to: '[data-t="crack-target"]', dur: 1100, after: 220 } }
          ]);
          return;
        }
        if (round === 1 && !roundDone) {
          var cx = W / 2, cy = H * 0.55;
          await NF.Ghost.play([
            { move: [cx, cy], dur: 420 },
            { click: 'right', target: [cx, cy], after: 240, do: function () { openMenuAt(cx, cy); } },
            { move: '[data-t="menu-item-new"]', dur: 460 },
            { highlight: '[data-t="menu-item-new"]', dur: 520 },
            {
              click: 'left', target: '[data-t="menu-item-new"]',
              do: function () { var r = OS.rootMenu(); if (r) r.openSub(r.items.filter(function (i) { return i.id === 'new'; })[0]); }
            },
            { wait: 240 },
            { move: '[data-t="menu-item-folder"]', dur: 480 },
            { highlight: '[data-t="menu-item-folder"]', dur: 650 }
          ]);
        } else if (round === 2 && !roundDone) {
          await NF.Ghost.play([
            { move: [W / 2, H * 0.6], dur: 380 },
            { keys: 'Ctrl+Shift+F', dur: 1100 },
            { wait: 200 }
          ]);
        } else if (round === 3 && !roundDone) {
          await NF.Ghost.play([
            { move: '[data-t="terminal-icon"]', dur: 520 },
            { highlight: '[data-t="terminal-icon"]', dur: 600 },
            { click: 'left', target: '[data-t="terminal-icon"]', after: 180 },
            { click: 'left', target: '[data-t="terminal-icon"]', after: 420, do: function () { openTerminal(); } },
            { wait: 300 },
            { type: 'mkdir final', dur: 900 },
            { keys: 'Enter', dur: 800 }
          ]);
        }
      };
      ctx.hint(demo);

      ctx.onCleanup(function () {
        clearInterval(timerId);
        clearTimeout(wrongFlashTimer);
        if (finalHandle) { try { finalHandle.destroy(); } catch (e) {} }
        if (termWin) { try { termWin.close(); } catch (e) {} }
        try { OS.closeMenus(); } catch (e) {}
      });

      startRound(1);
      ctx.qa('l20', ctx.root);
    }
  });
})();
