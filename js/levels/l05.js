/* 第 5 关：拖拽合体 —— 两张纸拖到一起合成文件夹，再把第三张拖进去 */
(function () {
  'use strict';
  var ID = 5;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'file',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);
      var busy = false;          // 合成动画期间锁住拖拽
      var merged = false;        // 前两张纸是否已合成文件夹
      var completed = false;
      var folderEl = null;
      var glowEl = null;
      var pieces = [];           // { el, id, x, y, rot, locked, handle }
      var demoFolder = null;

      ctx.style([
        /* 纸张 */
        '.lv5-paper{position:absolute;width:112px;height:136px;border-radius:10px;z-index:3;cursor:grab;',
        ' touch-action:none;transform-origin:50% 72%;will-change:left,top,transform;padding:13px 12px 9px;',
        ' background:linear-gradient(158deg,#ffffff,#eef2fc 62%,#e2e9f8);',
        ' box-shadow:0 14px 26px rgba(0,0,0,.38),0 3px 8px rgba(0,0,0,.22),inset 0 0 0 1px rgba(255,255,255,.85);',
        ' display:flex;flex-direction:column;align-items:center;gap:8px;}',
        '.lv5-paper::before{content:"";position:absolute;right:0;top:0;border-style:solid;border-width:0 17px 17px 0;',
        ' border-color:transparent #cdd8ee transparent transparent;border-radius:0 10px 0 0;}',
        '.lv5-paper .lv5-paper-icon{width:38px;height:38px;flex:0 0 auto;filter:drop-shadow(0 3px 4px rgba(0,0,0,.16));}',
        '.lv5-paper .lv5-paper-lines{width:74%;display:flex;flex-direction:column;gap:5px;}',
        '.lv5-paper .lv5-paper-lines i{display:block;height:3px;border-radius:2px;background:#c9d4ea;}',
        '.lv5-paper .lv5-paper-lines i:nth-child(2){width:86%;}',
        '.lv5-paper .lv5-paper-lines i:nth-child(3){width:58%;background:#dbe3f5;}',
        '.lv5-paper .lv5-paper-label{font-size:10.5px;color:#5a6484;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lv5-paper:hover{filter:drop-shadow(0 16px 22px rgba(0,0,0,.45)) brightness(1.03);}',
        '.lv5-paper.lv5-settle{transition:left .32s cubic-bezier(.34,1.56,.64,1),top .32s cubic-bezier(.34,1.56,.64,1),',
        ' transform .32s cubic-bezier(.34,1.56,.64,1),opacity .3s ease;}',
        '.lv5-paper.lv5-vanish{transform:scale(.28) rotate(16deg)!important;opacity:0!important;}',
        '.lv5-paper.lv5-target{filter:drop-shadow(0 0 18px rgba(255,212,92,.9)) brightness(1.06);}',
        '.lv5-paper.lv5-target::after{content:"";position:absolute;inset:-9px;border:2px dashed rgba(255,212,92,.9);',
        ' border-radius:15px;animation:lv5-ring 1s ease-in-out infinite;pointer-events:none;}',
        '@keyframes lv5-ring{0%,100%{opacity:.4;transform:scale(1);}50%{opacity:1;transform:scale(1.035);}}',
        '.lv5-paper.lv5-remaining{animation:lv5-remain 1.7s ease-in-out infinite;}',
        '@keyframes lv5-remain{0%,100%{filter:drop-shadow(0 14px 22px rgba(0,0,0,.38));}',
        ' 50%{filter:drop-shadow(0 0 16px rgba(255,212,92,.6)) drop-shadow(0 14px 22px rgba(0,0,0,.38));}}',
        /* 合成后的文件夹 */
        '.lv5-merged-folder{width:84px;z-index:6;transition:width .42s cubic-bezier(.34,1.56,.64,1),filter .35s ease;',
        ' filter:drop-shadow(0 0 20px rgba(255,201,77,.5)) drop-shadow(0 12px 18px rgba(0,0,0,.45));}',
        '.lv5-merged-folder.lv5-full{width:108px;filter:drop-shadow(0 0 32px rgba(255,212,92,.85)) drop-shadow(0 16px 22px rgba(0,0,0,.5));}',
        '.lv5-merged-folder.lv5-target{filter:drop-shadow(0 0 28px rgba(255,212,92,.95)) brightness(1.06);}',
        '.lv5-folder-glow{position:absolute;width:150px;height:120px;border-radius:50%;pointer-events:none;z-index:2;',
        ' background:radial-gradient(circle,rgba(255,201,77,.4),rgba(255,201,77,.08) 55%,transparent 72%);',
        ' filter:blur(7px);animation:lv5-glow 2.2s ease-in-out infinite alternate;}',
        '@keyframes lv5-glow{from{opacity:.35;transform:scale(.88);}to{opacity:.85;transform:scale(1.12);}}',
        '.lv5-flash{position:absolute;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;pointer-events:none;z-index:9;',
        ' background:radial-gradient(circle,rgba(255,244,205,.95),rgba(255,201,77,.35) 46%,transparent 72%);opacity:0;}',
        '.lv5-flash.on{animation:lv5-flash .55s ease-out;}',
        '@keyframes lv5-flash{0%{opacity:0;transform:scale(.18);}22%{opacity:1;}100%{opacity:0;transform:scale(2.15);}}',
        /* 演示用的半透明文件夹 */
        '.lv5-demo-folder{position:absolute;width:84px;z-index:40;pointer-events:none;opacity:.72;',
        ' filter:drop-shadow(0 0 20px rgba(255,212,92,.85)) brightness(1.06);animation:lv5-demo-pulse 1.4s ease-in-out infinite;}',
        '.lv5-demo-folder svg{display:block;width:100%;height:auto;animation:lv5-demo-bob 1.1s ease-in-out infinite alternate;}',
        '.lv5-demo-folder.lv5-demo-pop{animation:lv5-demo-pop .3s ease-out forwards;}',
        '@keyframes lv5-demo-pulse{0%,100%{opacity:.55;}50%{opacity:.95;}}',
        '@keyframes lv5-demo-bob{from{transform:translateY(0) rotate(-2deg);}to{transform:translateY(-6px) rotate(2deg);}}',
        '@keyframes lv5-demo-pop{0%{opacity:.8;transform:scale(1);}100%{opacity:0;transform:scale(1.5);}}'
      ].join(''));

      function rootRect() { return ctx.root.getBoundingClientRect(); }

      function flashAt(x, y) {
        var f = document.createElement('div');
        f.className = 'lv5-flash';
        f.style.left = x + 'px';
        f.style.top = y + 'px';
        ctx.root.appendChild(f);
        void f.offsetWidth;
        f.classList.add('on');
        ctx.timer(650, function () { if (f.parentNode) f.remove(); });
      }

      function makePaper(cfg) {
        var el = document.createElement('div');
        el.className = 'lv5-paper';
        el.dataset.t = 'file';
        el.dataset.id = cfg.id;
        el.style.left = cfg.x + 'px';
        el.style.top = cfg.y + 'px';
        el.style.transform = 'rotate(' + cfg.rot + 'deg)';

        var icon = document.createElement('div');
        icon.className = 'lv5-paper-icon';
        icon.innerHTML = NF.icons.svg(cfg.icon);
        el.appendChild(icon);

        var lines = document.createElement('div');
        lines.className = 'lv5-paper-lines';
        lines.innerHTML = '<i></i><i></i><i></i>';
        el.appendChild(lines);

        var label = document.createElement('div');
        label.className = 'lv5-paper-label';
        label.textContent = cfg.label;
        el.appendChild(label);

        ctx.root.appendChild(el);

        var p = { el: el, id: cfg.id, x: cfg.x, y: cfg.y, rot: cfg.rot, locked: false, handle: null };
        p.handle = OS.makeDraggable(el, {
          threshold: 3,
          canStart: function () { return !p.locked && !busy && !completed; },
          onStart: function () {
            el.classList.remove('lv5-remaining');
            NF.Audio.play('hover', { volume: 0.2 });
          },
          onMove: function (e, st) {
            el.style.left = (p.x + st.dx) + 'px';
            el.style.top = (p.y + st.dy) + 'px';
            var tilt = OS.clamp(st.dx * 0.045, -11, 11);
            el.style.transform = 'rotate(' + (p.rot + tilt).toFixed(2) + 'deg)';
            updateHints(p);
          },
          onEnd: function () {
            clearTargets();
            if (completed || p.locked) return;
            handleDrop(p);
          }
        });
        pieces.push(p);
        return p;
      }

      /* 当前可吸附的目标（另一个文件 / 已合成的文件夹） */
      function findTarget(p) {
        var list = [];
        if (merged) {
          if (folderEl) list.push({ type: 'folder', el: folderEl });
        } else {
          pieces.forEach(function (o) {
            if (o !== p && !o.locked) list.push({ type: 'file', el: o.el, piece: o });
          });
        }
        var pc = OS.center(p.el);
        var best = null;
        var bestScore = -1;
        list.forEach(function (t) {
          var tc = OS.center(t.el);
          var d = Math.hypot(pc.x - tc.x, pc.y - tc.y);
          var ov = OS.overlapRatio(p.el, t.el);
          if (ov < 0.18 && d > 100) return;
          var score = ov + (1 - Math.min(1, d / 300));
          if (score > bestScore) { bestScore = score; best = t; }
        });
        return best;
      }

      function clearTargets() {
        pieces.forEach(function (p) { p.el.classList.remove('lv5-target'); });
        if (folderEl) folderEl.classList.remove('lv5-target');
      }

      function updateHints(p) {
        clearTargets();
        var t = findTarget(p);
        if (t) t.el.classList.add('lv5-target');
      }

      function snapBack(p) {
        p.el.classList.add('lv5-settle');
        p.el.style.left = p.x + 'px';
        p.el.style.top = p.y + 'px';
        p.el.style.transform = 'rotate(' + p.rot + 'deg)';
        NF.Audio.play('thud', { volume: 0.35 });
        var c = OS.center(p.el);
        NF.FX.dust(c.x, c.y);
        ctx.timer(380, function () { p.el.classList.remove('lv5-settle'); });
      }

      function spawnFolder(x, y) {
        folderEl = ctx.createdFolder({ x: x, y: y, label: '新建文件夹', testid: 'merge-folder' });
        folderEl.classList.add('lv5-merged-folder');
        folderEl.dataset.qa = 'l05-folder';

        glowEl = document.createElement('div');
        glowEl.className = 'lv5-folder-glow';
        glowEl.style.left = (x - 33) + 'px';
        glowEl.style.top = (y - 16) + 'px';
        ctx.root.appendChild(glowEl);

        NF.Audio.play('pop');
        var c = OS.center(folderEl);
        NF.FX.sparkle(c.x, c.y, '#ffd45c');
        NF.FX.burst(c.x, c.y, {
          count: 18, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 5, gravity: 0.18
        });
      }

      /* 两张纸拖到一起：向中点收拢、闪一下，变成文件夹 */
      function mergeTwo(a, b) {
        busy = true;
        a.locked = true;
        b.locked = true;
        clearTargets();

        var ra = OS.rect(a.el);
        var rb = OS.rect(b.el);
        var r = rootRect();
        var mx = (ra.left + ra.width / 2 + rb.left + rb.width / 2) / 2;
        var my = (ra.top + ra.height / 2 + rb.top + rb.height / 2) / 2;
        var fl = Math.round(mx - r.left - 42);
        var ft = Math.round(my - r.top - 40);

        a.el.classList.add('lv5-settle');
        b.el.classList.add('lv5-settle');
        a.el.style.left = (rb.left - r.left) + 'px';
        a.el.style.top = (rb.top - r.top) + 'px';
        a.el.style.transform = 'rotate(0deg) scale(.94)';
        b.el.style.transform = 'rotate(0deg) scale(.94)';
        NF.Audio.play('paper', { volume: 0.6 });

        ctx.timer(210, function () {
          NF.Audio.play('snap');
          a.el.classList.add('lv5-vanish');
          b.el.classList.add('lv5-vanish');
          flashAt(mx, my);
          NF.FX.burst(mx, my, {
            count: 24, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#8a6cff'], speed: 7, gravity: 0.22
          });
          spawnFolder(fl, ft);
          ctx.timer(440, function () {
            if (a.el.parentNode) a.el.remove();
            if (b.el.parentNode) b.el.remove();
            pieces = pieces.filter(function (o) { return o !== a && o !== b; });
            merged = true;
            busy = false;
            var rest = pieces[0];
            if (rest) rest.el.classList.add('lv5-remaining');
          });
        });
      }

      /* 第三张纸拖进文件夹：文件夹长大，过关 */
      function absorbFile(p) {
        busy = true;
        p.locked = true;
        clearTargets();
        var r = rootRect();
        var fc = OS.center(folderEl);

        p.el.classList.add('lv5-settle');
        p.el.style.left = (fc.x - r.left - 56) + 'px';
        p.el.style.top = (fc.y - r.top - 68) + 'px';
        p.el.style.transform = 'rotate(0deg) scale(.62)';
        NF.Audio.play('snap');

        ctx.timer(250, function () {
          p.el.classList.add('lv5-vanish');
          folderEl.classList.add('lv5-full');
          flashAt(fc.x - r.left, fc.y - r.top);
          NF.Audio.play('pop');
          NF.Audio.play('sparkle', { volume: 0.6 });
          NF.FX.burst(fc.x, fc.y, {
            count: 30, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#ff6ba9'], speed: 9, gravity: 0.22
          });
          NF.FX.ripple(fc.x, fc.y, { color: 'rgba(255,212,92,.9)', radius: 80 });
          if (glowEl) glowEl.style.opacity = '1';
          ctx.timer(340, function () {
            if (p.el.parentNode) p.el.remove();
            pieces = pieces.filter(function (o) { return o !== p; });
            completed = true;
            ctx.complete({ el: folderEl });
          });
        });
      }

      function handleDrop(p) {
        if (pieces.indexOf(p) < 0) return;
        var t = findTarget(p);
        if (!t) { snapBack(p); return; }
        if (t.type === 'file') mergeTwo(p, t.piece);
        else absorbFile(p);
      }

      /* ---------------- 幽灵演示 ---------------- */
      function showDemoFolder(a, b) {
        var ca = OS.center(a.el);
        var cb = OS.center(b.el);
        var r = rootRect();
        var mx = (ca.x + cb.x) / 2 - r.left;
        var my = (ca.y + cb.y) / 2 - r.top;
        demoFolder = document.createElement('div');
        demoFolder.className = 'lv5-demo-folder';
        demoFolder.style.left = (mx - 42) + 'px';
        demoFolder.style.top = (my - 40) + 'px';
        demoFolder.innerHTML = NF.icons.svg('folder');
        ctx.root.appendChild(demoFolder);
        NF.Audio.play('sparkle', { volume: 0.35 });
      }

      function popDemoFolder() {
        if (!demoFolder) return;
        var el = demoFolder;
        demoFolder = null;
        var c = OS.center(el);
        el.classList.add('lv5-demo-pop');
        NF.Audio.play('pop', { volume: 0.65 });
        NF.FX.burst(c.x, c.y, {
          count: 20, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 6, gravity: 0.2
        });
        ctx.timer(320, function () { if (el.parentNode) el.remove(); });
      }

      function clearDemo() {
        if (demoFolder && demoFolder.parentNode) demoFolder.remove();
        demoFolder = null;
      }
      ctx.onCleanup(clearDemo);

      /* 兜底：NF.Ghost.cancel() 在 sleep 中打断时 play() 可能永远不 resolve，
         所以玩家一动手就立刻清掉演示元素，不依赖 Promise 的 finally。 */
      function onUserInterrupt() {
        if (demoFolder) clearDemo();
      }
      ctx.on(document, 'pointerdown', onUserInterrupt, true);
      ctx.on(document, 'keydown', onUserInterrupt, true);

      demo = async function () {
        clearDemo();
        if (completed) return;
        var steps = [];
        if (!merged) {
          var a = pieces[0], b = pieces[1], c = pieces[2];
          if (!a || !b || !c) return;
          var pa = OS.center(a.el);
          steps = [
            { move: [pa.x, pa.y], dur: 420 },
            { highlight: a.el, dur: 640 },
            { drag: { from: a.el, to: b.el, dur: 950, after: 240 } },
            { do: function () { showDemoFolder(a, b); } },
            { wait: 220 },
            { highlight: '.lv5-demo-folder', dur: 620 },
            { drag: { from: c.el, to: '.lv5-demo-folder', dur: 900, after: 260 } },
            { do: popDemoFolder },
            { wait: 260 }
          ];
        } else if (folderEl && pieces[0]) {
          steps = [
            { highlight: folderEl, dur: 650 },
            { drag: { from: pieces[0].el, to: folderEl, dur: 950, after: 260 } },
            { highlight: folderEl, dur: 520 }
          ];
        } else {
          return;
        }
        try { await NF.Ghost.play(steps); } finally { clearDemo(); }
      };
      ctx.hint(demo);

      /* ---------------- 摆桌面 ---------------- */
      var bx = W / 2;
      var by = H * 0.5;
      makePaper({ id: 'a', icon: 'fileText', label: '报告.txt', x: bx - 330 + OS.rand(-14, 14), y: by - 150 + OS.rand(-12, 12), rot: -7 });
      makePaper({ id: 'b', icon: 'fileImage', label: '照片.png', x: bx - 20 + OS.rand(-14, 14), y: by - 10 + OS.rand(-12, 12), rot: 5 });
      makePaper({ id: 'c', icon: 'fileText', label: '清单.txt', x: bx + 240 + OS.rand(-14, 14), y: by - 185 + OS.rand(-12, 12), rot: -3 });

      ctx.timer(1000, function () {
        if (merged || completed || !pieces[1]) return;
        var c = OS.center(pieces[1].el);
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,212,92,.3)', radius: 70 });
      });

      ctx.qa('l05', ctx.root);
    }
  });
})();
