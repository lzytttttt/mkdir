/* 第 9 关：清理大师 —— 建好文件夹后，必须在机器人吸走它之前拖进安全罐，共 3 个 */
(function () {
  'use strict';
  var ID = 9;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'robot',
    init: function (ctx) {
      var saved = 0;
      var round = 0;           // 0..2
      var folder = null;
      var dragHandle = null;
      var robotState = 'patrol'; // patrol | hunt | dizzy | win
      var robotX = innerWidth - 180;
      var robotDir = -1;
      var targetX = 0;
      var huntSpeed = 190;
      var spotTimer = 0;
      var eatLocked = false;
      var finished = false;
      var demoFolder = null;

      var root = ctx.root;
      var jar = document.createElement('div');
      jar.className = 'lv9-jar';
      jar.dataset.t = 'jar-drop';
      jar.innerHTML = '<div class="lv9-jar-icon">' + NF.icons.svg('jar') + '</div>';
      var slotsWrap = document.createElement('div');
      slotsWrap.className = 'lv9-slots';
      for (var i = 0; i < 3; i++) {
        var slot = document.createElement('div');
        slot.className = 'lv9-slot';
        slot.dataset.t = 'slot-' + (i + 1);
        slotsWrap.appendChild(slot);
      }
      jar.appendChild(slotsWrap);
      root.appendChild(jar);

      var vignette = document.createElement('div');
      vignette.className = 'lv9-vignette';
      root.appendChild(vignette);

      var robot = document.createElement('div');
      robot.className = 'lv9-robot';
      robot.dataset.t = 'robot';
      robot.innerHTML = '<div class="lv9-beam"></div><div class="lv9-robot-body">' + NF.icons.svg('robot') + '</div><div class="lv9-robot-hint"></div>';
      root.appendChild(robot);

      var dust = document.createElement('div');
      dust.className = 'lv9-dust';
      root.appendChild(dust);

      var board = document.createElement('div');
      board.className = 'lv9-board';
      board.innerHTML = '<div class="lv9-board-title">' + NF.icons.svg('robot') + '<span class="lv9-pips"><i></i><i></i><i></i></span></div>';
      root.appendChild(board);
      var pips = board.querySelectorAll('.lv9-pips i');

      ctx.style([
        '.lv9-jar{position:absolute;right:46px;top:44px;width:150px;display:flex;flex-direction:column;align-items:center;gap:10px;z-index:42;transition:filter .25s ease;}',
        '.lv9-jar .lv9-jar-icon{width:116px;filter:drop-shadow(0 20px 28px rgba(0,0,0,.55));transition:transform .3s cubic-bezier(.34,1.56,.64,1);}',
        '.lv9-jar .lv9-jar-icon svg{width:100%;height:auto;display:block;}',
        '.lv9-jar.is-hot .lv9-jar-icon{animation:lv9-jar-hot 1.1s ease-in-out infinite;}',
        '@keyframes lv9-jar-hot{0%,100%{transform:scale(1);filter:drop-shadow(0 20px 28px rgba(0,0,0,.55));}50%{transform:scale(1.06);filter:drop-shadow(0 0 26px rgba(255,212,92,.55));}}',
        '.lv9-slots{display:flex;gap:8px;}',
        '.lv9-slot{width:36px;height:32px;border-radius:7px;border:2px dashed rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);transition:all .3s ease;}',
        '.lv9-slot .nf-ico{width:30px;height:30px;animation:folder-pop .45s cubic-bezier(.34,1.56,.64,1) both;}',
        '.lv9-slot.filled{border-color:transparent;background:rgba(255,212,92,.08);}',
        '.lv9-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 80%,transparent 45%,rgba(255,64,90,.22) 100%);transition:opacity .4s ease;z-index:34;}',
        '.lv9-vignette.on{opacity:1;}',
        '.lv9-robot{position:absolute;left:0;top:0;width:150px;z-index:38;pointer-events:none;will-change:transform;filter:drop-shadow(0 22px 26px rgba(0,0,0,.5));}',
        '.lv9-robot .lv9-robot-body{width:100%;animation:lv9-bob 1.6s ease-in-out infinite;}',
        '.lv9-robot .lv9-robot-body svg{width:100%;display:block;}',
        '@keyframes lv9-bob{0%,100%{transform:translateY(0) rotate(-1.2deg);}50%{transform:translateY(-5px) rotate(1.2deg);}}',
        '.lv9-beam{position:absolute;left:50%;bottom:42%;width:190px;height:220px;transform:translate(-50%,0) scaleY(.2);transform-origin:50% 100%;',
        'background:linear-gradient(0deg,rgba(126,240,192,.32),rgba(126,240,192,.02));clip-path:polygon(38% 100%,62% 100%,100% 0,0 0);',
        'opacity:0;transition:opacity .25s ease,transform .3s ease;filter:blur(2px);}',
        '.lv9-robot.is-hunting .lv9-beam{opacity:1;transform:translate(-50%,0) scaleY(1);animation:lv9-beam-flicker .6s ease-in-out infinite;}',
        '@keyframes lv9-beam-flicker{0%,100%{opacity:.55;}50%{opacity:.95;}}',
        '.lv9-robot.is-hunting .lv9-robot-body{animation:lv9-shake .16s linear infinite;}',
        '@keyframes lv9-shake{0%,100%{transform:translate(0,0);}25%{transform:translate(-2px,1px);}75%{transform:translate(2px,-1px);}}',
        '.lv9-robot.is-dizzy .lv9-robot-body{animation:lv9-dizzy 1s ease-in-out infinite;}',
        '@keyframes lv9-dizzy{0%,100%{transform:rotate(0);}25%{transform:rotate(-8deg) translateY(-4px);}75%{transform:rotate(8deg) translateY(-4px);}}',
        '.lv9-robot.is-win .lv9-robot-body{animation:lv9-win 1.2s ease-in-out infinite;}',
        '@keyframes lv9-win{0%,100%{transform:rotate(0) scale(1);}50%{transform:rotate(12deg) scale(1.04);}}',
        '.lv9-board{position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:10px 16px;border-radius:12px;',
        'background:rgba(16,14,36,.6);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(14px);display:flex;align-items:center;gap:10px;z-index:43;pointer-events:none;}',
        '.lv9-board .nf-ico{width:24px;height:24px;}',
        '.lv9-board-title{display:flex;align-items:center;gap:12px;}',
        '.lv9-pips{display:flex;gap:6px;}',
        '.lv9-pips i{width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.18);transition:all .3s ease;}',
        '.lv9-pips i.on{background:#ffc94d;box-shadow:0 0 10px rgba(255,201,77,.75);}',
        '.lv9-eat{animation:lv9-eat .6s cubic-bezier(.3,.7,.3,1) forwards !important;}',
        '@keyframes lv9-eat{0%{transform:scale(1) rotate(0);opacity:1;}60%{transform:scale(.6) rotate(35deg) translateY(10px);opacity:.9;}100%{transform:scale(.05) rotate(80deg) translateY(30px);opacity:0;}}',
        '.lv9-dust{position:absolute;right:150px;bottom:52px;width:220px;height:60px;pointer-events:none;opacity:0;transition:opacity .3s;}',
        '.lv9-dust.on{opacity:1;animation:lv9-dust 1.5s linear infinite;}',
        '@keyframes lv9-dust{0%{background:radial-gradient(circle at 10% 70%,rgba(255,255,255,.22),transparent 25%);}100%{background:radial-gradient(circle at 90% 30%,rgba(255,255,255,.12),transparent 25%);}}',
        '.lv9-demo{position:absolute;width:76px;pointer-events:none;z-index:44;filter:drop-shadow(0 12px 18px rgba(0,0,0,.5));}',
        '.lv9-demo svg{width:100%;height:auto;display:block;}'
      ].join(''));

      function jarRect() { return OS.rect(jar); }
      function levelH() { return root.clientHeight || innerHeight - 58; }
      function floorY() { return levelH() - 160; }

      function placeRobot() {
        robot.style.transform = 'translate3d(' + robotX.toFixed(1) + 'px,' + floorY().toFixed(1) + 'px,0)';
      }
      placeRobot();

      function playPips() {
        pips.forEach(function (p, i) { p.classList.toggle('on', i < saved); });
      }

      function openMenuAt(x, y) {
        OS.closeMenus();
        var canCreate = !folder && saved < 3 && !finished;
        OS.menu({
          x: x, y: y,
          items: [
            { id: 'view', label: '查看', icon: 'eye', disabled: true },
            { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
            { separator: true },
            {
              id: 'new', label: '新建', icon: 'folder', disabled: !canCreate,
              submenu: [
                {
                  id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', disabled: !canCreate,
                  onSelect: createFolder
                },
                { id: 'text', label: '文本文档', icon: 'fileText', onSelect: function () { NF.Audio.play('deny'); } }
              ]
            }
          ]
        });
      }

      function createFolder() {
        if (folder || saved >= 3 || finished) { NF.Audio.play('deny'); return; }
        OS.closeMenus();
        var x = OS.rand(innerWidth * 0.14, Math.min(innerWidth * 0.62, innerWidth - 220));
        var y = OS.rand(levelH() * 0.32, levelH() * 0.52);
        folder = ctx.createdFolder({ x: x, y: y, label: '新建文件夹', testid: 'created-folder' });
        NF.Audio.play('pop');
        NF.FX.burst(x + 38, y + 30, { count: 14, colors: ['#ffc94d', '#ffffff'], speed: 5, gravity: 0.2 });
        jar.classList.add('is-hot');
        dragHandle = OS.makeDraggable(folder, {
          threshold: 3,
          onStart: function () {
            NF.Audio.play('paper', { volume: 0.5 });
            folder.style.zIndex = '55';
          },
          onMove: function (e, st) {
            if (!folder) return;
            folder.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' + Math.max(-8, Math.min(8, st.dx * 0.04)) + 'deg)';
            var jr = jarRect();
            var over = e.clientX > jr.left - 30 && e.clientX < jr.right + 30 && e.clientY > jr.top - 30 && e.clientY < jr.bottom + 60;
            folder.classList.toggle('lv9-over-jar', over);
          },
          onEnd: function (e, st) {
            if (!folder) return;
            var jr = jarRect();
            var within = e.clientX >= jr.left - 20 && e.clientX <= jr.right + 20 && e.clientY >= jr.top - 20 && e.clientY <= jr.bottom + 70;
            if (within) saveFolder();
            else {
              OS.commitDrag(folder, st.dx, st.dy);
              folder.style.transform = '';
              NF.Audio.play('thud', { volume: 0.4 });
            }
          }
        });

        var spotDelay = [900, 680, 480][Math.min(round, 2)];
        spotTimer = ctx.timer(spotDelay, function () {
          if (!folder || finished) return;
          startHunt();
        });
      }

      function startHunt() {
        if (!folder || robotState === 'dizzy' || robotState === 'win') return;
        robotState = 'hunt';
        robot.classList.add('is-hunting');
        vignette.classList.add('on');
        dust.classList.add('on');
        NF.Audio.play('robot', { volume: 0.8 });
        targetX = OS.center(folder).x - 75;
      }

      function stopHunt() {
        robotState = 'patrol';
        robot.classList.remove('is-hunting');
        vignette.classList.remove('on');
        dust.classList.remove('on');
      }

      function eatFolder() {
        if (!folder) { stopHunt(); return; }
        if (folder.classList.contains('dragging') || eatLocked) return; // 等玩家松手再吃，避免拖拽状态卡死
        eatLocked = true;
        stopHunt();
        robotState = 'dizzy';
        robot.classList.add('is-dizzy');
        NF.Audio.play('slurp');
        NF.Audio.play('error', { volume: 0.6 });
        if (dragHandle) { try { dragHandle.destroy(); } catch (e) {} dragHandle = null; }
        var f = folder;
        folder = null;
        f.classList.add('lv9-eat');
        f.style.transform = '';
        NF.FX.shake(7, 260);
        OS.toast({ icon: 'robot', title: '文件夹被清理了', kind: 'error', ms: 1600 });
        ctx.timer(650, function () { if (f.parentNode) f.remove(); });
        ctx.timer(1250, function () {
          robot.classList.remove('is-dizzy');
          robotState = 'patrol';
          eatLocked = false;
          jar.classList.add('is-hot');
          NF.Audio.play('powerdown', { volume: 0.4 });
        });
      }

      function saveFolder() {
        if (!folder || finished) return;
        NF.Audio.play('snap');
        NF.Audio.play('sparkle');
        var f = folder;
        folder = null;
        jar.classList.remove('is-hot');
        if (dragHandle) { dragHandle.destroy(); dragHandle = null; }
        f.classList.remove('dragging');
        f.style.transform = '';
        var fr = OS.rect(f);
        var jr = jarRect();
        NF.FX.fly(fr, jr, {
          duration: 620, arc: -110, html: NF.icons.svg('folder'),
          onDone: function () {
            NF.FX.burst(jr.left + jr.width / 2, jr.top + jr.height / 2, {
              count: 20, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 6, gravity: 0.12
            });
          }
        });
        f.remove();
        saved++;
        playPips();
        var slot = jar.querySelectorAll('.lv9-slot')[saved - 1];
        if (slot) {
          slot.classList.add('filled');
          slot.innerHTML = NF.icons.svg('folder');
          NF.FX.sparkle(OS.center(slot).x, OS.center(slot).y);
        }
        stopHunt();
        robotState = 'dizzy';
        robot.classList.add('is-dizzy');
        ctx.timer(950, function () {
          robot.classList.remove('is-dizzy');
          robotState = 'patrol';
          if (saved >= 3) winLevel();
          else startRound();
        });
      }

      function startRound() {
        if (saved >= 3 || finished) return;
        round = Math.min(2, saved);
        // 不强制清空 folder：玩家可能在机器人晕眩的窗口期已经抢先建好了下一个
        robotState = 'patrol';
        jar.classList.add('is-hot');
        // 提示安全罐
        var jr = jarRect();
        NF.FX.ripple(jr.left + jr.width / 2, jr.top + jr.height / 2, { color: 'rgba(255,212,92,.5)', radius: 90 });
      }

      function winLevel() {
        if (finished) return;
        finished = true;
        robotState = 'win';
        robot.classList.add('is-win');
        stopHunt();
        jar.classList.remove('is-hot');
        NF.Audio.play('success');
        NF.Audio.play('explode', { volume: 0.5 });
        NF.FX.confetti({ count: 110 });
        NF.FX.shake(6, 300);
        var jr = jarRect();
        NF.FX.burst(jr.left + jr.width / 2, jr.top + jr.height / 2, {
          count: 50, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 11, gravity: 0.24
        });
        ctx.complete({ x: jr.left + jr.width / 2, y: jr.top + jr.height / 2, delay: 1500 });
      }

      // ---------------- 机器人巡检 ----------------
      var last = performance.now();
      ctx.raf(function (now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (finished) {
          robot.style.transform = 'translate3d(' + robotX.toFixed(1) + 'px,' + (floorY() - 8).toFixed(1) + 'px,0) rotate(-6deg)';
          return;
        }
        if (robotState === 'hunt') {
          var dx = targetX - robotX;
          var sp = [190, 235, 285][Math.min(round, 2)];
          if (Math.abs(dx) > 6) robotX += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
          robot.classList.toggle('is-hunting', true);
          if (folder && !folder.classList.contains('dragging') && Math.abs(robotX + 75 - OS.center(folder).x) < 105) {
            eatFolder();
          }
        } else if (robotState === 'patrol') {
          robotX += robotDir * 62 * dt;
          if (robotX < 260) { robotX = 260; robotDir = 1; }
          if (robotX > innerWidth - 300) { robotX = innerWidth - 300; robotDir = -1; }
        }
        placeRobot();
      });

      ctx.on(root, 'contextmenu', function (e) {
        e.preventDefault();
        if (finished) return;
        openMenuAt(e.clientX, e.clientY);
      });

      ctx.on(window, 'keydown', function (e) {
        if (finished) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          createFolder();
        }
      });

      startRound();
      ctx.hint = async function () {
        OS.closeMenus();
        if (demoFolder && demoFolder.parentNode) demoFolder.remove();
        var cx = innerWidth / 2, cy = levelH() * 0.44;
        await NF.Ghost.play([
          { move: [cx, cy], dur: 400 },
          {
            click: 'right', target: [cx, cy], after: 220,
            do: function () { openMenuAt(cx, cy); }
          },
          { move: '[data-t="menu-item-new"]', dur: 420 },
          {
            click: 'left', target: '[data-t="menu-item-new"]', after: 200,
            do: function () { var r = OS.rootMenu(); if (r) r.openSub(r.items.filter(function (i) { return i.id === 'new'; })[0]); }
          },
          { wait: 200 },
          { move: '[data-t="menu-item-folder"]', dur: 420 },
          { click: 'left', target: '[data-t="menu-item-folder"]', after: 220, do: function () { OS.closeMenus(); } },
          {
            do: function () {
              demoFolder = document.createElement('div');
              demoFolder.className = 'lv9-demo';
              demoFolder.innerHTML = NF.icons.svg('folder');
              demoFolder.style.left = (cx - 38) + 'px';
              demoFolder.style.top = (cy - 30) + 'px';
              root.appendChild(demoFolder);
              demoFolder.style.animation = 'folder-pop .5s cubic-bezier(.34,1.56,.64,1) both';
            }
          },
          { highlight: '[data-t="jar-drop"]', dur: 600 },
          { wait: 150 },
          {
            drag: {
              from: function () { return demoFolder; },
              to: '[data-t="jar-drop"]',
              dur: 1000
            }
          },
          { wait: 200 },
          {
            do: function () {
              if (demoFolder) { demoFolder.remove(); demoFolder = null; }
            }
          }
        ]);
      };
      ctx.onCleanup(function () { if (demoFolder && demoFolder.parentNode) demoFolder.remove(); });
    }
  });
})();
