/* 第 16 关：窗口大逃亡 —— "新建文件夹"对话框不想出现，它躲到屏幕外去了。
   流程：
   1. 屏幕右缘只露出 90px 的窗口，会慢慢往外滑，鼠标靠近标题栏还会小幅躲闪；
      把标题栏拖到屏幕中央（距离中心 < 190px）→ 吸附到正中；
   2. 窗口一分为三：一个真窗口（标题栏是文件夹图标）+ 两个假窗口（齿轮 / 机器人），
      三个窗口会乱序交换位置，把真窗口拖进中央的虚线槽里（错窗口会抖动弹开）；
   3. 真窗口就位后点"确定"（按钮会躲鼠标）或按 Enter → 文件夹从窗口里飞出来 → 过关。
*/
(function () {
  'use strict';
  var ID = 16;
  var OS = NF.OS;
  var demo = null;

  var WIN_W = 420;
  var WIN_H = 260;

  NF.Game.registerLevel({
    id: ID,
    icon: 'window',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);
      var CENTER = { x: W / 2, y: H / 2 };

      var scene = null;
      var slotEl = null;
      var escapeWin = null;
      var escBar = null;
      var escHandle = null;
      var escHome = { x: Math.max(60, W - 90), y: Math.round(H * 0.32) };
      var escPos = { x: escHome.x, y: escHome.y };
      var escDodge = 0;
      var escDragging = false;
      var escSnapping = false;
      var escReturning = false;

      var phase = 1;            // 1 屏幕边缘逃亡 / 2 三窗口 / 3 真窗口就位 / 4 完成
      var completed = false;
      var wins = [];
      var dragWin = null;
      var dockedWin = null;
      var swapTimer = 0;
      var swapFlip = 0;
      var lastMouse = { x: -9999, y: -9999 };
      var lastTs = 0;

      ctx.style([
        '.lv16-scene{position:absolute;inset:0;pointer-events:none;z-index:1;}',
        /* 仿系统窗口 */
        '.lv16-win{position:absolute;width:' + WIN_W + 'px;height:' + WIN_H + 'px;border-radius:12px;overflow:hidden;',
        ' z-index:30;pointer-events:auto;border:1px solid rgba(255,255,255,.16);',
        ' background:linear-gradient(165deg,rgba(32,28,66,.97),rgba(17,15,38,.97));',
        ' box-shadow:0 26px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);',
        ' animation:lv16-win-in .32s cubic-bezier(.34,1.56,.64,1) both;will-change:left,top,transform;}',
        '.lv16-win.lv16-anim-done{animation:none;}',
        '@keyframes lv16-win-in{from{opacity:0;transform:scale(.86) translateY(12px);}to{opacity:1;transform:none;}}',
        '.lv16-bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 10px 0 12px;cursor:grab;',
        ' touch-action:none;background:rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.09);',
        ' user-select:none;-webkit-user-select:none;}',
        '.lv16-bar:active{cursor:grabbing;}',
        '.lv16-tb-ico{width:18px;height:18px;line-height:0;flex:0 0 auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));}',
        '.lv16-tb-ico svg{width:100%;height:100%;display:block;}',
        '.lv16-tb-title{flex:1;min-width:0;font-size:12.5px;font-weight:700;letter-spacing:.02em;',
        ' color:rgba(238,240,255,.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lv16-dots{display:flex;gap:4px;flex:0 0 auto;}',
        '.lv16-dots i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.26);}',
        '.lv16-x{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;',
        ' font-size:10px;color:rgba(255,255,255,.45);flex:0 0 auto;}',
        '.lv16-body{position:absolute;left:0;right:0;top:38px;bottom:0;display:flex;align-items:center;',
        ' justify-content:center;background:radial-gradient(ellipse at 30% 0%,rgba(96,72,190,.24),transparent 64%);}',
        '.lv16-dialog{width:302px;display:flex;flex-direction:column;gap:14px;padding:18px;border-radius:10px;',
        ' background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);',
        ' box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}',
        '.lv16-field{height:40px;border-radius:8px;background:rgba(8,10,24,.72);border:1px solid rgba(255,255,255,.18);',
        ' display:flex;align-items:center;padding:0 12px;gap:6px;font-size:14px;color:#eef2ff;}',
        '.lv16-caret{width:2px;height:16px;background:#8ec4ff;animation:lv16-blink 1s steps(1) infinite;}',
        '@keyframes lv16-blink{50%{opacity:0;}}',
        '.lv16-btns{display:flex;justify-content:flex-end;gap:10px;}',
        '.lv16-btn{height:32px;min-width:80px;padding:0 14px;border-radius:7px;font-size:12.5px;',
        ' display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.2);',
        ' background:rgba(255,255,255,.1);color:#eef2ff;cursor:default;font-family:inherit;}',
        '.lv16-btn.is-primary{background:linear-gradient(180deg,#5c7efc,#3f63e8);border-color:transparent;',
        ' color:#fff;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(70,105,245,.35);',
        ' transition:filter .15s ease,box-shadow .2s ease;}',
        '.lv16-btn.is-primary:hover{filter:brightness(1.1);}',
        '.lv16-btn.is-primary:disabled{opacity:.38;filter:saturate(.35);pointer-events:none;box-shadow:none;}',
        '.lv16-btn.is-ready{box-shadow:0 0 0 2px rgba(255,224,138,.55),0 4px 18px rgba(255,201,77,.45);}',
        '.lv16-btn.lv16-tired{outline:2px dashed rgba(255,212,92,.75);outline-offset:2px;}',
        '.lv16-btn.is-ghost{opacity:.5;}',
        /* 状态类 */
        '.lv16-win.lv16-grabbing{transition:none!important;z-index:44!important;',
        ' border-color:rgba(140,168,255,.55);box-shadow:0 34px 80px rgba(0,0,0,.6),0 0 34px rgba(120,150,255,.28);}',
        '.lv16-win.lv16-over{border-color:rgba(255,212,92,.7);}',
        '.lv16-win.lv16-wrong{animation:lv16-wrong .42s ease;}',
        '@keyframes lv16-wrong{0%,100%{transform:none;}20%{transform:translateX(-9px) rotate(-.6deg);}',
        ' 45%{transform:translateX(8px) rotate(.5deg);}70%{transform:translateX(-5px);}}',
        '.lv16-win.lv16-docked{z-index:45;border-color:rgba(255,224,138,.75);',
        ' box-shadow:0 30px 70px rgba(0,0,0,.55),0 0 46px rgba(255,212,92,.38);}',
        '.lv16-win.lv16-ready{border-color:rgba(255,238,180,.9);}',
        '.lv16-win.lv16-lose{animation:none!important;opacity:0!important;pointer-events:none!important;',
        ' transform:scale(.8) translateY(26px)!important;transition:opacity .5s ease,transform .5s ease!important;}',
        '.lv16-win.lv16-split{animation:lv16-split .3s ease forwards!important;}',
        '@keyframes lv16-split{0%{opacity:1;transform:scale(1);filter:brightness(1);}',
        ' 45%{opacity:1;transform:scale(1.04);filter:brightness(1.7);}',
        ' 100%{opacity:0;transform:scale(.9);filter:brightness(2.4);}}',
        '.lv16-win.lv16-swap{border-color:rgba(180,200,255,.5);filter:brightness(1.1);}',
        '.lv16-win.lv16-confirmed{filter:brightness(1.5);}',
        /* 中央虚线槽 */
        '.lv16-slot{position:absolute;width:300px;height:190px;border-radius:26px;z-index:5;pointer-events:none;',
        ' border:2.5px dashed rgba(255,212,92,.55);display:flex;align-items:center;justify-content:center;',
        ' background:radial-gradient(circle at 50% 50%,rgba(255,201,77,.13),transparent 72%);',
        ' box-shadow:inset 0 0 30px rgba(255,201,77,.1);animation:lv16-slot-pulse 2.4s ease-in-out infinite;}',
        '.lv16-slot svg{width:64px;height:64px;opacity:.28;}',
        '@keyframes lv16-slot-pulse{0%,100%{transform:scale(1);border-color:rgba(255,212,92,.45);}',
        ' 50%{transform:scale(1.015);border-color:rgba(255,224,138,.75);}}',
        '.lv16-slot.lv16-near{border-style:solid;border-color:rgba(255,224,138,.95);',
        ' box-shadow:0 0 40px rgba(255,212,92,.4),inset 0 0 30px rgba(255,212,92,.18);}',
        '.lv16-slot.lv16-deny{animation:lv16-deny .42s ease!important;}',
        '@keyframes lv16-deny{0%,100%{border-color:rgba(255,93,122,.9);}50%{border-color:rgba(255,93,122,1);',
        ' box-shadow:0 0 40px rgba(255,93,122,.4);}}',
        '.lv16-slot.lv16-filled{border-style:solid;border-color:rgba(126,240,192,.9);',
        ' box-shadow:0 0 52px rgba(126,240,192,.4),inset 0 0 34px rgba(126,240,192,.2);}',
        /* 飞出来的文件夹 */
        '.lv16-folder-out{filter:drop-shadow(0 0 26px rgba(255,212,92,.85)) drop-shadow(0 12px 18px rgba(0,0,0,.45));}'
      ].join(''));

      scene = document.createElement('div');
      scene.className = 'lv16-scene';
      scene.dataset.phase = '1';
      scene.dataset.qa = 'l16';
      ctx.root.appendChild(scene);

      function rootRect() { return ctx.root.getBoundingClientRect(); }
      function setPhase(p) {
        phase = p;
        scene.dataset.phase = String(p);
      }

      /* ---------------- 通用窗口骨架 ---------------- */
      function dialogBody(real) {
        return '<div class="lv16-dialog">' +
          '<div class="lv16-field"><span class="lv16-caret"></span><span>新建文件夹</span></div>' +
          '<div class="lv16-btns">' +
          '<span class="lv16-btn">取消</span>' +
          (real
            ? '<button type="button" class="lv16-btn is-primary" data-t="dialog-ok" disabled>确定</button>'
            : '<span class="lv16-btn is-ghost">确定</span>') +
          '</div></div>';
      }

      function makeWindow(cfg) {
        var el = document.createElement('div');
        el.className = 'lv16-win' + (cfg.cls ? ' ' + cfg.cls : '');
        el.dataset.t = cfg.testid;
        el.style.left = cfg.x + 'px';
        el.style.top = cfg.y + 'px';

        var bar = document.createElement('div');
        bar.className = 'lv16-bar';
        if (cfg.bartestid) bar.dataset.t = cfg.bartestid;
        if (cfg.icon) {
          var ic = document.createElement('span');
          ic.className = 'lv16-tb-ico';
          ic.innerHTML = NF.icons.svg(cfg.icon);
          bar.appendChild(ic);
        }
        var ti = document.createElement('span');
        ti.className = 'lv16-tb-title';
        ti.textContent = cfg.title || '新建文件夹';
        bar.appendChild(ti);
        var dots = document.createElement('span');
        dots.className = 'lv16-dots';
        dots.innerHTML = '<i></i><i></i><i></i>';
        bar.appendChild(dots);
        var x = document.createElement('span');
        x.className = 'lv16-x';
        x.textContent = '✕';
        bar.appendChild(x);
        el.appendChild(bar);

        var body = document.createElement('div');
        body.className = 'lv16-body';
        body.innerHTML = cfg.body || '';
        el.appendChild(body);

        scene.appendChild(el);
        var rec = {
          el: el, bar: bar, body: body,
          x: cfg.x, y: cfg.y,
          homeX: cfg.x, homeY: cfg.y,
          isReal: !!cfg.real, dragging: false,
          okBtn: null, barHandle: null
        };
        rec.okBtn = body.querySelector('[data-t="dialog-ok"]');
        ctx.timer(420, function () { el.classList.add('lv16-anim-done'); });
        return rec;
      }

      /* ---------------- 阶段 1：屏幕边缘的逃亡窗口 ---------------- */
      function buildEscape() {
        escapeWin = makeWindow({
          testid: 'escape-window',
          bartestid: 'escape-titlebar',
          icon: 'folder',
          title: '新建文件夹',
          body: dialogBody(false),
          x: escPos.x, y: escPos.y,
          cls: 'lv16-escape'
        });
        escBar = escapeWin.bar;
        escHandle = OS.makeDraggable(escBar, {
          threshold: 3,
          canStart: function () { return !completed && phase === 1 && !escSnapping && !escReturning; },
          onStart: function () {
            escDragging = true;
            escPos.x = parseFloat(escapeWin.el.style.left);
            escPos.y = parseFloat(escapeWin.el.style.top);
            if (!isFinite(escPos.x)) escPos.x = escHome.x;
            if (!isFinite(escPos.y)) escPos.y = escHome.y;
            escapeWin.el.style.transition = 'none';
            escapeWin.el.classList.add('lv16-grabbing');
            NF.Audio.play('paper', { volume: 0.45 });
          },
          onMove: function (e, st) {
            var nx = OS.clamp(escPos.x + st.dx, -WIN_W + 70, W - 70);
            var ny = OS.clamp(escPos.y + st.dy, -16, H - 90);
            escapeWin.el.style.left = nx + 'px';
            escapeWin.el.style.top = ny + 'px';
          },
          onEnd: function () {
            escDragging = false;
            escapeWin.el.classList.remove('lv16-grabbing');
            if (completed || phase !== 1) return;
            var nx = parseFloat(escapeWin.el.style.left) || escPos.x;
            var ny = parseFloat(escapeWin.el.style.top) || escPos.y;
            escPos.x = nx;
            escPos.y = ny;
            escapeWin.x = nx;
            escapeWin.y = ny;
            if (Math.hypot(nx + WIN_W / 2 - CENTER.x, ny + WIN_H / 2 - CENTER.y) < 150) {
              snapCenter();
              return;
            }
            returnToEdge();
          }
        });
      }

      /* 没拖到中央：窗口又溜回屏幕边缘 */
      function returnToEdge() {
        if (completed || phase !== 1) return;
        escReturning = true;
        escPos.x = escHome.x;
        escPos.y = escHome.y;
        escapeWin.el.style.transition = 'left .42s cubic-bezier(.34,1.56,.64,1),top .42s cubic-bezier(.34,1.56,.64,1)';
        escapeWin.el.style.left = escPos.x + 'px';
        escapeWin.el.style.top = escPos.y + 'px';
        NF.Audio.play('dodge', { volume: 0.55 });
        ctx.timer(450, function () { escReturning = false; });
      }

      function snapCenter() {
        if (completed || phase !== 1) return;
        escSnapping = true;
        setPhase(2);
        escPos.x = Math.round(CENTER.x - WIN_W / 2);
        escPos.y = Math.round(CENTER.y - WIN_H / 2);
        escapeWin.el.style.transition = 'left .34s cubic-bezier(.34,1.56,.64,1),top .34s cubic-bezier(.34,1.56,.64,1)';
        escapeWin.el.style.left = escPos.x + 'px';
        escapeWin.el.style.top = escPos.y + 'px';
        NF.Audio.play('snap', { volume: 0.9 });
        NF.Audio.play('sparkle', { volume: 0.7 });
        NF.FX.flash('rgba(255,240,190,.32)', 190);
        NF.FX.ripple(CENTER.x, CENTER.y, { color: 'rgba(255,224,138,.85)', radius: 90 });
        NF.FX.shake(3, 200);
        ctx.timer(420, splitWindows);
      }

      /* 窗口一分为三 */
      function splitWindows() {
        if (completed) return;
        escapeWin.el.classList.add('lv16-split');
        NF.Audio.play('whoosh', { volume: 0.7 });
        NF.Audio.play('open', { volume: 0.6 });
        NF.FX.flash('rgba(255,255,255,.5)', 200);
        ctx.timer(320, function () {
          if (completed) return;
          escapeWin.el.style.display = 'none';
          buildSlot();
          buildThree();
          setPhase(2);
          NF.Audio.play('giggle', { volume: 0.4 });
          ctx.timer(1000, function () { if (!completed) ctx.replayHint(); });
        });
      }

      function buildSlot() {
        if (slotEl) return;
        slotEl = document.createElement('div');
        slotEl.className = 'lv16-slot';
        slotEl.dataset.t = 'window-slot';
        slotEl.style.left = Math.round(CENTER.x - 150) + 'px';
        slotEl.style.top = Math.round(CENTER.y - 95) + 'px';
        slotEl.innerHTML = NF.icons.svg('folder');
        scene.appendChild(slotEl);
      }

      function buildThree() {
        var spots = [
          { x: Math.round(W * 0.09), y: Math.round(H * 0.1) },
          { x: Math.round(W - WIN_W - Math.max(56, W * 0.06)), y: Math.round(H * 0.08) },
          { x: Math.round(W * 0.34), y: Math.round(H - WIN_H - 44) }
        ];
        var defs = [
          { real: true, icon: 'folder', title: '新建文件夹' },
          { real: false, icon: 'gear', title: '新建文件夹 (2)' },
          { real: false, icon: 'robot', title: '新建文件夹 (3)' }
        ];
        // 打乱：真窗口每次出现在不同的位置
        shuffle(defs);
        shuffle(spots);
        for (var i = 0; i < 3; i++) {
          var rec = makeWindow({
            testid: defs[i].real ? 'real-window' : 'decoy-window',
            icon: defs[i].icon,
            title: defs[i].title,
            body: dialogBody(defs[i].real),
            x: spots[i].x,
            y: spots[i].y,
            real: defs[i].real,
            cls: defs[i].real ? 'lv16-real' : 'lv16-decoy'
          });
          rec.dropped = false;
          wins.push(rec);
          bindWinDrag(rec);
          if (defs[i].real) setupOkDodge(rec);
        }
        // 每 4.2s 交换一次位置（拖拽时暂停）
        swapTimer = ctx.interval(4200, function () {
          if (phase !== 2 || completed || dragWin || wins.length < 3) return;
          var i = swapFlip % 3;
          swapFlip++;
          var j = (i + 1 + Math.floor(Math.random() * 2)) % 3;
          if (i === j) return;
          swapTwo(wins[i], wins[j]);
        });
      }

      function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = arr[i];
          arr[i] = arr[j];
          arr[j] = t;
        }
      }

      function nearSlot(cx, cy) {
        if (!slotEl) return false;
        return Math.hypot(cx - CENTER.x, cy - CENTER.y) < 190;
      }

      function bindWinDrag(w) {
        w.barHandle = OS.makeDraggable(w.bar, {
          threshold: 3,
          canStart: function () { return phase === 2 && !completed; },
          onStart: function () {
            dragWin = w;
            w.dragging = true;
            w.el.style.transition = 'none';
            w.el.classList.add('lv16-grabbing');
            w.x = parseFloat(w.el.style.left) || w.x;
            w.y = parseFloat(w.el.style.top) || w.y;
            NF.Audio.play('paper', { volume: 0.4 });
          },
          onMove: function (e, st) {
            var nx = OS.clamp(w.x + st.dx, -120, W - 160);
            var ny = OS.clamp(w.y + st.dy, 0, H - 110);
            w.el.style.left = nx + 'px';
            w.el.style.top = ny + 'px';
            if (slotEl) {
              var near = nearSlot(nx + WIN_W / 2, ny + WIN_H / 2);
              slotEl.classList.toggle('lv16-near', near && w.isReal);
              w.el.classList.toggle('lv16-over', near);
            }
          },
          onEnd: function () {
            w.dragging = false;
            dragWin = null;
            w.el.classList.remove('lv16-grabbing', 'lv16-over');
            if (slotEl) slotEl.classList.remove('lv16-near');
            if (completed || phase !== 2) return;
            var nx = parseFloat(w.el.style.left) || w.x;
            var ny = parseFloat(w.el.style.top) || w.y;
            w.x = nx;
            w.y = ny;
            var near = nearSlot(nx + WIN_W / 2, ny + WIN_H / 2);
            if (near && w.isReal) { dockReal(w); return; }
            if (near && !w.isReal) { wrongWindow(w); return; }
            w.homeX = nx;
            w.homeY = ny;
          }
        });
      }

      function swapTwo(a, b) {
        if (!a || !b || a.dragging || b.dragging || a === b) return;
        var ax = a.x;
        var ay = a.y;
        a.x = b.x;
        a.y = b.y;
        b.x = ax;
        b.y = ay;
        [a, b].forEach(function (w) {
          w.el.classList.toggle('lv16-swap', true);
          w.el.style.transition = 'left .35s cubic-bezier(.34,1.56,.64,1),top .35s cubic-bezier(.34,1.56,.64,1)';
          w.el.style.left = w.x + 'px';
          w.el.style.top = w.y + 'px';
        });
        NF.Audio.play('whoosh', { volume: 0.22 });
        ctx.timer(430, function () {
          [a, b].forEach(function (w) {
            w.el.style.transition = '';
            w.el.classList.remove('lv16-swap');
            w.homeX = w.x;
            w.homeY = w.y;
          });
        });
      }

      function wrongWindow(w) {
        NF.Audio.play('deny', { volume: 0.85 });
        NF.Audio.play('giggle', { volume: 0.38 });
        NF.FX.shake(5, 220);
        if (slotEl) {
          slotEl.classList.add('lv16-deny');
          ctx.timer(460, function () { slotEl.classList.remove('lv16-deny'); });
        }
        w.el.classList.add('lv16-wrong');
        ctx.timer(380, function () { w.el.classList.remove('lv16-wrong'); });
        // 弹回原位
        w.el.style.transition = 'left .38s cubic-bezier(.34,1.56,.64,1),top .38s cubic-bezier(.34,1.56,.64,1)';
        w.el.style.left = w.homeX + 'px';
        w.el.style.top = w.homeY + 'px';
        w.x = w.homeX;
        w.y = w.homeY;
        ctx.timer(430, function () { w.el.style.transition = ''; });
      }

      /* ---------------- 阶段 3：真窗口就位 ---------------- */
      function dockReal(w) {
        if (completed || phase !== 2) return;
        setPhase(3);
        dockedWin = w;
        if (swapTimer) { clearInterval(swapTimer); swapTimer = 0; }
        if (slotEl) {
          slotEl.classList.add('lv16-filled');
          slotEl.classList.remove('lv16-near');
        }
        wins.forEach(function (o) {
          if (o === w) return;
          if (o.barHandle) o.barHandle.locked = true;
          o.el.style.transition = '';
          o.el.classList.add('lv16-lose');
        });
        if (w.barHandle) w.barHandle.locked = true;
        w.el.style.animation = 'none';
        w.el.style.transition = 'left .4s cubic-bezier(.34,1.56,.64,1),top .4s cubic-bezier(.34,1.56,.64,1),transform .4s cubic-bezier(.34,1.56,.64,1)';
        w.el.classList.add('lv16-docked');
        w.el.style.left = Math.round(CENTER.x - WIN_W / 2) + 'px';
        w.el.style.top = Math.round(CENTER.y - WIN_H / 2) + 'px';
        w.el.style.transform = 'scale(.86)';
        w.x = CENTER.x - WIN_W / 2;
        w.y = CENTER.y - WIN_H / 2;
        NF.Audio.play('snap', { volume: 1 });
        NF.Audio.play('sparkle', { volume: 0.8 });
        NF.FX.flash('rgba(255,240,190,.4)', 220);
        var c = OS.center(w.el);
        NF.FX.burst(c.x, c.y, {
          count: 40, colors: ['#ffc94d', '#7ef0c0', '#ffffff', '#ffe08a'], speed: 9, gravity: 0.2
        });
        ctx.timer(480, function () {
          if (completed) return;
          w.el.classList.add('lv16-ready');
          if (w.okBtn) {
            w.okBtn.disabled = false;
            w.okBtn.classList.add('is-ready');
          }
          NF.Audio.play('select', { volume: 0.4 });
          if (!completed) ctx.replayHint();
        });
      }

      /* "确定"按钮会躲鼠标（躲三次会喘口气，给玩家一点机会） */
      function setupOkDodge(w) {
        var ok = w.okBtn;
        if (!ok) return;
        ctx.on(ok, 'click', function (e) {
          e.stopPropagation();
          if (phase === 3 && !completed) confirmReal();
        });
        var dodgeCount = 0;
        var lastDodgeAt = 0;
        var tiredUntil = 0;
        var dx = 0;
        var dy = 0;
        ctx.on(ok, 'pointermove', function (e) {
          if (phase !== 3 || completed) return;
          var now = performance.now();
          if (now < tiredUntil || now - lastDodgeAt < 90) return;
          var r = OS.rect(ok);
          var cx = r.left + r.width / 2;
          var cy = r.top + r.height / 2;
          if (Math.hypot(cx - e.clientX, cy - e.clientY) > 115) return;
          lastDodgeAt = now;
          dodgeCount += 1;
          dx = OS.clamp(dx + OS.rand(-64, 64), -84, 84);
          dy = OS.clamp(dy + OS.rand(-30, 30), -36, 36);
          ok.style.transition = 'transform .2s cubic-bezier(.22,.8,.3,1)';
          ok.style.transform = 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px)';
          NF.Audio.play('dodge', { volume: 0.5 });
          if (dodgeCount % 3 === 0) {
            tiredUntil = now + 1200;
            ok.classList.add('lv16-tired');
            ctx.timer(1300, function () { ok.classList.remove('lv16-tired'); });
          }
        });
      }

      /* ---------------- 完成：文件夹从窗口里飞出来 ---------------- */
      function confirmReal() {
        if (completed || phase !== 3 || !dockedWin) return;
        completed = true;
        setPhase(4);
        var w = dockedWin;
        w.el.classList.add('lv16-confirmed');
        NF.Audio.play('enter', { volume: 0.7 });
        NF.Audio.play('sparkle', { volume: 0.85 });
        NF.FX.flash('rgba(255,247,220,.55)', 240);

        var lx = Math.round(W / 2 - 38);
        var ly = Math.round(H * 0.74);
        var folder = ctx.createdFolder({ x: lx, y: ly, label: '新建文件夹', testid: 'created-folder' });
        folder.classList.add('lv16-folder-out');
        folder.dataset.state = 'out';
        var wr = OS.rect(w.el);
        var fc = OS.center(folder);
        NF.FX.fly(
          { left: wr.left + wr.width / 2 - 34, top: wr.top + wr.height / 2 - 34, width: 68, height: 68 },
          { left: lx + 4, top: ly + 4, width: 68, height: 68 },
          {
            html: NF.icons.svg('folder'), duration: 620, arc: -150,
            onDone: function () { NF.FX.sparkle(fc.x, fc.y, '#ffd45c'); }
          }
        );
        NF.FX.burst(fc.x, fc.y, {
          count: 38, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#7ef0c0'], speed: 9, gravity: 0.2
        });
        NF.FX.confetti({ count: 70 });
        ctx.timer(720, function () { ctx.complete({ el: folder }); });
      }

      /* ---------------- 主循环：边缘缓慢外滑 + 靠近标题栏时躲闪 ---------------- */
      function tick(now) {
        if (!lastTs) lastTs = now;
        var dt = Math.min(0.05, (now - lastTs) / 1000 || 0.016);
        lastTs = now;
        if (phase !== 1 || completed || escDragging || escSnapping || escReturning) return;
        // 慢慢滑出屏幕
        escPos.x = Math.min(escPos.x + 3 * dt, W - 36);
        // 鼠标靠近标题栏就在屏幕内小幅躲闪
        var nearX = OS.clamp(lastMouse.x, escPos.x + escDodge, escPos.x + WIN_W + escDodge);
        var nearY = OS.clamp(lastMouse.y, escPos.y, escPos.y + 38);
        var near = Math.hypot(lastMouse.x - nearX, lastMouse.y - nearY) < 130;
        var want = near ? 16 : 0;
        escDodge += (want - escDodge) * Math.min(1, dt * 7);
        escapeWin.el.style.left = (escPos.x + escDodge).toFixed(1) + 'px';
        escapeWin.el.style.top = escPos.y + 'px';
      }
      ctx.raf(tick);

      ctx.on(window, 'pointermove', function (e) {
        var r = rootRect();
        lastMouse.x = e.clientX - r.left;
        lastMouse.y = e.clientY - r.top;
      });

      ctx.on(document, 'keydown', function (e) {
        if (completed || phase !== 3) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmReal();
        }
      });

      /* ---------------- 幽灵演示（按阶段切换） ---------------- */
      demo = async function () {
        if (completed) return;
        if (phase === 1) {
          var r = OS.rect(escBar);
          var from = {
            x: OS.clamp(r.left + 26, 18, W - 18),
            y: OS.clamp(r.top + r.height / 2, 18, H - 18)
          };
          await NF.Ghost.play([
            { move: from, dur: 520 },
            { highlight: '[data-t="escape-titlebar"]', dur: 720 },
            { drag: { from: from, to: [CENTER.x, CENTER.y], dur: 980, after: 220 } },
            { wait: 200 }
          ]);
          return;
        }
        if (phase === 2) {
          var rw = null;
          wins.forEach(function (w) { if (w.isReal) rw = w; });
          if (!rw) return;
          await NF.Ghost.play([
            { move: '[data-t="real-window"]', dur: 520 },
            { highlight: '[data-t="real-window"]', dur: 820 },
            {
              drag: {
                from: function () {
                  var b = OS.rect(rw.bar);
                  return { x: b.left + 60, y: b.top + 19 };
                },
                to: '[data-t="window-slot"]',
                dur: 1000, after: 220
              }
            },
            { wait: 160 }
          ]);
          return;
        }
        if (phase === 3) {
          await NF.Ghost.play([
            { move: '[data-t="dialog-ok"]', dur: 460 },
            { highlight: '[data-t="dialog-ok"]', dur: 700 },
            { keys: 'Enter', dur: 900 },
            { wait: 150 }
          ]);
        }
      };
      ctx.hint(demo);

      /* 兜底：一张隐形纸片帮助玩家理解"往中间拖"，不显示文字 */
      ctx.onCleanup(function () {
        if (swapTimer) { clearInterval(swapTimer); swapTimer = 0; }
        if (escHandle) { try { escHandle.destroy(); } catch (e) {} escHandle = null; }
        wins.forEach(function (w) {
          if (w.barHandle) { try { w.barHandle.destroy(); } catch (e) {} w.barHandle = null; }
        });
        wins = [];
      });

      buildEscape();
    }
  });
})();
