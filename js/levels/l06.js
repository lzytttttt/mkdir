/* 第 6 关：碎片重组 —— 4 块碎片拖回虚线轮廓拼成文件夹；拼好后一角崩飞，再追回来 */
(function () {
  'use strict';
  var ID = 6;
  var OS = NF.OS;
  var demo = null;

  var HOME_W = 280;
  var HOME_H = 200;

  /* 四块碎片（容器 0..1 占比坐标，四块刚好拼满整张文件夹图） */
  var PIECES = [
    [[0, 0], [0.5, 0], [0.57, 0.2], [0.5, 0.4], [0.58, 0.55], [0, 0.55]],
    [[0.5, 0], [1, 0], [1, 0.55], [0.58, 0.55], [0.5, 0.4], [0.57, 0.2]],
    [[0, 0.55], [0.58, 0.55], [0.64, 0.75], [0.5, 1], [0, 1]],
    [[0.58, 0.55], [1, 0.55], [1, 1], [0.5, 1], [0.64, 0.75]]
  ];
  /* 崩掉的一角 + 拼图上缺那一角时的保留区域 */
  var CORNER = [[0.06, 0], [0.34, 0], [0.26, 0.30], [0.06, 0.22]];
  var KEEP = [[0.34, 0], [1, 0], [1, 1], [0, 1], [0, 0], [0.06, 0], [0.06, 0.22], [0.26, 0.30]];

  function pct(poly) {
    return 'polygon(' + poly.map(function (p) {
      return (p[0] * 100).toFixed(2) + '% ' + (p[1] * 100).toFixed(2) + '%';
    }).join(',') + ')';
  }

  function svgPts(poly) {
    return poly.map(function (p) {
      return (p[0] * 140).toFixed(2) + ',' + (p[1] * 100).toFixed(2);
    }).join(' ');
  }

  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }

  /* 碎片/拼图共用的文件夹贴图（fill 用纯色，避免重复 id 的渐变） */
  function folderMarkup() {
    return '<svg class="lv6-face" viewBox="0 0 140 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#d99512" d="M12 34 Q12 24 22 24 H50 L62 34 H118 Q128 34 128 44 V86 Q128 96 118 96 H22 Q12 96 12 86 Z"/>' +
      '<path fill="#ffc94d" d="M12 42 Q12 34 20 34 H120 Q128 34 128 42 V86 Q128 96 118 96 H22 Q12 96 12 86 Z"/>' +
      '<path fill="#ffe08a" opacity=".85" d="M12 42 Q12 34 20 34 H120 Q128 34 128 42 V50 H12 Z"/>' +
      '<path d="M22 60 H116" stroke="#ffe9a8" stroke-width="1.6" opacity=".32" stroke-linecap="round"/>' +
      '<path d="M22 70 H96" stroke="#f0a81b" stroke-width="1.4" opacity=".35" stroke-linecap="round"/>' +
      '</svg>';
  }

  NF.Game.registerLevel({
    id: ID,
    icon: 'shard',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var homeX = Math.round((W - HOME_W) / 2);
      var homeY = Math.round(H * 0.46 - HOME_H / 2);

      var shards = [];
      var placedCount = 0;
      var fused = false;
      var busy = false;
      var completed = false;
      var cornerReady = false;
      var cornerHandle = null;
      var demoCornerEl = null;

      var cornerOffset = {
        x: Math.round(Math.min(320, W * 0.24)),
        y: Math.round(Math.min(180, H * 0.22)),
        rot: 14
      };

      var layouts = [
        { ox: -Math.min(330, W * 0.30), oy: -Math.min(160, H * 0.22), rot: -16, fd: '-0.4s' },
        { ox: Math.min(320, W * 0.30), oy: -Math.min(170, H * 0.23), rot: 13, fd: '-1.2s' },
        { ox: -Math.min(340, W * 0.31), oy: Math.min(150, H * 0.21), rot: 9, fd: '-2.0s' },
        { ox: Math.min(330, W * 0.30), oy: Math.min(160, H * 0.22), rot: -11, fd: '-0.8s' }
      ];

      ctx.style([
        '.lv6-halo{position:absolute;border-radius:50%;pointer-events:none;z-index:1;filter:blur(14px);',
        ' background:radial-gradient(ellipse,rgba(255,201,77,.2),transparent 70%);animation:lv6-halo 3.2s ease-in-out infinite alternate;}',
        '@keyframes lv6-halo{from{opacity:.35;transform:scale(.9);}to{opacity:.85;transform:scale(1.1);}}',
        '.lv6-outline{position:absolute;z-index:2;pointer-events:none;opacity:1;transition:opacity .35s ease;}',
        '.lv6-outline svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}',
        '.lv6-outline .lv6-dash{fill:rgba(255,201,77,.05);stroke:rgba(255,224,138,.8);stroke-width:1.6;',
        ' stroke-dasharray:6 5;animation:lv6-dash 16s linear infinite;transition:stroke .2s ease,stroke-width .2s ease;}',
        '@keyframes lv6-dash{to{stroke-dashoffset:-220;}}',
        '.lv6-outline.lv6-armed .lv6-dash{stroke:rgba(255,244,200,1);stroke-width:2.4;}',
        '.lv6-outline.lv6-outline-done{opacity:0;}',
        '.lv6-outline-glow{position:absolute;inset:-12%;border-radius:24px;',
        ' background:radial-gradient(ellipse at center,rgba(255,201,77,.16),transparent 66%);',
        ' animation:lv6-breathe 2.4s ease-in-out infinite alternate;}',
        '@keyframes lv6-breathe{from{opacity:.35;}to{opacity:.9;}}',
        /* 碎片 */
        '.lv6-shard{position:absolute;z-index:4;cursor:grab;touch-action:none;will-change:transform;',
        ' transform:translate(var(--ox,0px),var(--oy,0px)) rotate(var(--rot,0deg));}',
        '.lv6-shard.lv6-idle{animation:lv6-float 3.8s ease-in-out infinite alternate;animation-delay:var(--fd,0s);}',
        '@keyframes lv6-float{',
        ' 0%{transform:translate(var(--ox,0px),var(--oy,0px)) rotate(var(--rot,0deg));}',
        ' 100%{transform:translate(calc(var(--ox,0px) + 6px),calc(var(--oy,0px) - 8px)) rotate(calc(var(--rot,0deg) + 2.4deg));}}',
        '.lv6-shard .lv6-face,.lv6-body .lv6-face,.lv6-corner .lv6-face{position:absolute;inset:0;width:100%;height:100%;display:block;}',
        '.lv6-shard .lv6-edge,.lv6-corner .lv6-edge{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}',
        '.lv6-shard:hover{filter:brightness(1.1);}',
        '.lv6-shard.lv6-held{filter:brightness(1.16);}',
        '.lv6-shard.lv6-near{filter:drop-shadow(0 0 16px rgba(255,212,92,.9)) brightness(1.14);}',
        '.lv6-shard.lv6-settle{transition:transform .3s cubic-bezier(.34,1.56,.64,1);}',
        '.lv6-shard.lv6-placed{pointer-events:none;animation:lv6-place-flash .55s ease;}',
        '@keyframes lv6-place-flash{0%{filter:brightness(2.2);}100%{filter:brightness(1);}}',
        '.lv6-shard.lv6-gone{opacity:0;transition:opacity .28s ease;}',
        /* 拼好的文件夹 */
        '.lv6-body{position:absolute;z-index:5;opacity:0;pointer-events:none;}',
        '.lv6-body.lv6-on{opacity:1;transition:opacity .26s ease;animation:lv6-body-pop .55s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv6-body-pop{0%{transform:scale(.93);filter:brightness(1.9);}60%{transform:scale(1.02);}',
        ' 100%{transform:scale(1);filter:brightness(1);}}',
        '.lv6-label{position:absolute;text-align:center;font-size:13px;letter-spacing:.08em;color:#ffe9a8;',
        ' opacity:0;transition:opacity .4s ease;text-shadow:0 2px 10px rgba(0,0,0,.7);z-index:6;pointer-events:none;}',
        '.lv6-label.lv6-on{opacity:1;}',
        /* 崩掉的一角 */
        '.lv6-corner{position:absolute;z-index:7;opacity:0;pointer-events:none;will-change:transform;',
        ' transform:translate(0px,0px) rotate(0deg);}',
        '.lv6-corner.lv6-corner-live{pointer-events:auto;cursor:grab;',
        ' animation:lv6-corner-glow 1.5s ease-in-out infinite alternate;}',
        '@keyframes lv6-corner-glow{from{filter:drop-shadow(0 0 4px rgba(255,212,92,.45));}',
        ' to{filter:drop-shadow(0 0 18px rgba(255,212,92,.95)) brightness(1.12);}}',
        '.lv6-corner.lv6-held{filter:brightness(1.2);}',
        '.lv6-corner.lv6-settle{transition:transform .3s cubic-bezier(.34,1.56,.64,1);}',
        '.lv6-demo-corner{pointer-events:none;z-index:9;}',
        '.lv6-flash{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;',
        ' pointer-events:none;z-index:10;background:radial-gradient(circle,rgba(255,244,205,.95),rgba(255,201,77,.35) 46%,transparent 72%);',
        ' opacity:0;}',
        '.lv6-flash.on{animation:lv6-flash .55s ease-out;}',
        '@keyframes lv6-flash{0%{opacity:0;transform:scale(.18);}22%{opacity:1;}100%{opacity:0;transform:scale(2.2);}}'
      ].join(''));

      function setClip(el, poly) {
        el.style.clipPath = pct(poly);
        el.style.webkitClipPath = pct(poly);
      }

      function pieceScreen(el, poly) {
        var r = OS.rect(el);
        var c = centroid(poly);
        return { x: r.left + c[0] * r.width, y: r.top + c[1] * r.height };
      }

      function homeCornerPoint() {
        var r = OS.rect(outlineEl);
        var c = centroid(CORNER);
        return { x: r.left + c[0] * r.width, y: r.top + c[1] * r.height };
      }

      function cornerScreen() { return pieceScreen(cornerEl, CORNER); }

      function flashAt(x, y) {
        var f = document.createElement('div');
        f.className = 'lv6-flash';
        f.style.left = x + 'px';
        f.style.top = y + 'px';
        ctx.root.appendChild(f);
        void f.offsetWidth;
        f.classList.add('on');
        ctx.timer(650, function () { if (f.parentNode) f.remove(); });
      }

      /* ---------------- 场景 ---------------- */
      var halo = document.createElement('div');
      halo.className = 'lv6-halo';
      halo.style.left = (homeX + HOME_W / 2 - 200) + 'px';
      halo.style.top = (homeY + HOME_H / 2 - 160) + 'px';
      halo.style.width = '400px';
      halo.style.height = '320px';
      ctx.root.appendChild(halo);

      var outlineEl = document.createElement('div');
      outlineEl.className = 'lv6-outline';
      outlineEl.dataset.t = 'outline';
      outlineEl.style.left = homeX + 'px';
      outlineEl.style.top = homeY + 'px';
      outlineEl.style.width = HOME_W + 'px';
      outlineEl.style.height = HOME_H + 'px';
      outlineEl.innerHTML = '<div class="lv6-outline-glow"></div>' +
        '<svg viewBox="0 0 140 100" preserveAspectRatio="none">' +
        '<path class="lv6-dash" d="M12 32 Q12 22 22 22 H50 L62 32 H120 Q128 32 128 40 V86 Q128 96 118 96 H22 Q12 96 12 86 Z"/>' +
        '</svg>';
      ctx.root.appendChild(outlineEl);

      var bodyEl = document.createElement('div');
      bodyEl.className = 'lv6-body';
      bodyEl.style.left = homeX + 'px';
      bodyEl.style.top = homeY + 'px';
      bodyEl.style.width = HOME_W + 'px';
      bodyEl.style.height = HOME_H + 'px';
      bodyEl.innerHTML = folderMarkup();
      ctx.root.appendChild(bodyEl);
      bodyEl.dataset.qa = 'l06-body';

      var labelEl = document.createElement('div');
      labelEl.className = 'lv6-label';
      labelEl.style.left = homeX + 'px';
      labelEl.style.top = (homeY + HOME_H + 8) + 'px';
      labelEl.style.width = HOME_W + 'px';
      labelEl.textContent = '新建文件夹';
      ctx.root.appendChild(labelEl);

      var cornerEl = document.createElement('div');
      cornerEl.className = 'lv6-corner';
      cornerEl.dataset.t = 'corner-shard';
      cornerEl.style.left = homeX + 'px';
      cornerEl.style.top = homeY + 'px';
      cornerEl.style.width = HOME_W + 'px';
      cornerEl.style.height = HOME_H + 'px';
      setClip(cornerEl, CORNER);
      cornerEl.innerHTML = folderMarkup() +
        '<svg class="lv6-edge" viewBox="0 0 140 100" preserveAspectRatio="none">' +
        '<polygon points="' + svgPts(CORNER) + '" fill="none" stroke="rgba(255,240,190,.9)" stroke-width="1.2" stroke-linejoin="round"/>' +
        '</svg>';
      ctx.root.appendChild(cornerEl);

      /* ---------------- 碎片 ---------------- */
      function makeShard(idx) {
        var lay = layouts[idx];
        var el = document.createElement('div');
        el.className = 'lv6-shard';
        el.dataset.t = 'shard';
        el.dataset.idx = String(idx);
        el.style.left = homeX + 'px';
        el.style.top = homeY + 'px';
        el.style.width = HOME_W + 'px';
        el.style.height = HOME_H + 'px';
        el.style.setProperty('--ox', lay.ox + 'px');
        el.style.setProperty('--oy', lay.oy + 'px');
        el.style.setProperty('--rot', lay.rot + 'deg');
        el.style.setProperty('--fd', lay.fd);
        setClip(el, PIECES[idx]);
        el.innerHTML = folderMarkup() +
          '<svg class="lv6-edge" viewBox="0 0 140 100" preserveAspectRatio="none">' +
          '<polygon points="' + svgPts(PIECES[idx]) + '" fill="none" stroke="rgba(255,240,190,.38)" stroke-width="1" stroke-linejoin="round"/>' +
          '</svg>';
        if (!OS.isReducedMotion()) el.classList.add('lv6-idle');
        ctx.root.appendChild(el);

        var p = {
          el: el, idx: idx, ox: lay.ox, oy: lay.oy, rot: lay.rot,
          placed: false, handle: null
        };
        p.handle = OS.makeDraggable(el, {
          threshold: 3,
          canStart: function () { return !p.placed && !busy && !completed; },
          onStart: function () {
            el.classList.remove('lv6-idle');
            el.classList.add('lv6-held');
            NF.Audio.play('hover', { volume: 0.2 });
          },
          onMove: function (e, st) {
            var rx = p.ox + st.dx;
            var ry = p.oy + st.dy;
            var tilt = OS.clamp(st.dx * 0.02, -6, 6);
            el.style.transform = 'translate(' + rx + 'px,' + ry + 'px) rotate(' + (p.rot + tilt).toFixed(2) + 'deg)';
            var near = Math.hypot(rx, ry) < 140;
            el.classList.toggle('lv6-near', near);
            outlineEl.classList.toggle('lv6-armed', near);
          },
          onEnd: function (e, st) {
            el.classList.remove('lv6-held', 'lv6-near');
            outlineEl.classList.remove('lv6-armed');
            if (p.placed || completed) return;
            var rx = p.ox + st.dx;
            var ry = p.oy + st.dy;
            if (Math.hypot(rx, ry) < 110) snapShard(p);
            else failShard(p);
          }
        });
        shards.push(p);
      }

      for (var i = 0; i < 4; i++) makeShard(i);

      function snapShard(p) {
        p.placed = true;
        if (p.handle) p.handle.locked = true;
        p.el.classList.remove('lv6-idle', 'lv6-near');
        p.el.classList.add('lv6-settle');
        p.el.style.transform = 'translate(0px,0px) rotate(0deg)';
        NF.Audio.play('snap');
        var pt = pieceScreen(p.el, PIECES[p.idx]);
        NF.FX.sparkle(pt.x, pt.y, '#ffd45c');
        NF.FX.burst(pt.x, pt.y, {
          count: 14, colors: ['#ffc94d', '#ffe9a8', '#ffffff'], speed: 5, gravity: 0.18
        });
        ctx.timer(330, function () {
          p.el.classList.remove('lv6-settle');
          p.el.classList.add('lv6-placed');
          placedCount++;
          if (placedCount >= 4 && !fused) fuse();
        });
      }

      function failShard(p) {
        p.el.classList.add('lv6-settle');
        p.el.style.transform = 'translate(' + p.ox + 'px,' + p.oy + 'px) rotate(' + p.rot + 'deg)';
        NF.Audio.play('thud', { volume: 0.3 });
        NF.Audio.play('giggle', { volume: 0.16 });
        var c = OS.center(p.el);
        NF.FX.dust(c.x, c.y);
        ctx.timer(340, function () {
          p.el.classList.remove('lv6-settle');
          if (!OS.isReducedMotion()) p.el.classList.add('lv6-idle');
        });
      }

      /* ---------------- 拼合 / 崩角 ---------------- */
      function fuse() {
        fused = true;
        busy = true;
        outlineEl.classList.add('lv6-outline-done');
        bodyEl.classList.add('lv6-on');
        labelEl.classList.add('lv6-on');
        var oc = OS.center(bodyEl);
        NF.Audio.play('sparkle', { volume: 0.9 });
        NF.FX.burst(oc.x, oc.y, {
          count: 30, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#8a6cff'], speed: 8, gravity: 0.2
        });
        NF.FX.ripple(oc.x, oc.y, { color: 'rgba(255,212,92,.9)', radius: 80 });
        ctx.timer(240, function () {
          shards.forEach(function (p) { p.el.classList.add('lv6-gone'); });
        });
        ctx.timer(640, function () {
          if (!completed) popCorner();
        });
      }

      function popCorner() {
        bodyEl.style.clipPath = pct(KEEP);
        bodyEl.style.webkitClipPath = pct(KEEP);
        cornerEl.style.opacity = '1';
        cornerEl.style.transform = 'translate(0px,0px) rotate(0deg)';
        void cornerEl.offsetWidth;
        ctx.timer(60, function () {
          NF.Audio.play('boing', { volume: 0.85 });
          NF.Audio.play('paper', { volume: 0.35 });
          cornerEl.style.transition = 'transform .72s cubic-bezier(.18,.72,.26,1)';
          cornerEl.style.transform = 'translate(' + cornerOffset.x + 'px,' + cornerOffset.y + 'px) rotate(' + cornerOffset.rot + 'deg)';
        });
        ctx.timer(840, function () {
          if (completed) return;
          cornerEl.style.transition = '';
          cornerEl.classList.add('lv6-corner-live');
          cornerReady = true;
          busy = false;
          enableCornerDrag();
          NF.Audio.play('sparkle', { volume: 0.45 });
          var cp = cornerScreen();
          NF.FX.sparkle(cp.x, cp.y, '#ffd45c');
        });
      }

      function enableCornerDrag() {
        if (cornerHandle || completed) return;
        cornerHandle = OS.makeDraggable(cornerEl, {
          threshold: 3,
          canStart: function () { return !completed; },
          onStart: function () {
            cornerEl.style.transition = 'none';
            cornerEl.classList.add('lv6-held');
            NF.Audio.play('hover', { volume: 0.2 });
          },
          onMove: function (e, st) {
            var tilt = OS.clamp(st.dx * 0.03, -10, 10);
            cornerEl.style.transform = 'translate(' + (cornerOffset.x + st.dx) + 'px,' +
              (cornerOffset.y + st.dy) + 'px) rotate(' + (cornerOffset.rot + tilt).toFixed(2) + 'deg)';
          },
          onEnd: function (e, st) {
            cornerEl.style.transition = '';
            cornerEl.classList.remove('lv6-held');
            if (completed) return;
            var rx = cornerOffset.x + st.dx;
            var ry = cornerOffset.y + st.dy;
            if (Math.hypot(rx, ry) < 115) snapCorner();
            else failCorner();
          }
        });
      }

      function snapCorner() {
        if (completed) return;
        completed = true;
        if (cornerHandle) cornerHandle.locked = true;
        cornerEl.classList.remove('lv6-corner-live');
        cornerEl.style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1)';
        cornerEl.style.transform = 'translate(0px,0px) rotate(0deg)';
        NF.Audio.play('snap');
        ctx.timer(300, function () {
          bodyEl.style.clipPath = '';
          bodyEl.style.webkitClipPath = '';
          cornerEl.style.opacity = '0';
          var oc = OS.center(bodyEl);
          flashAt(oc.x, oc.y);
          NF.FX.flash('rgba(255,238,180,.4)', 220);
          NF.FX.burst(oc.x, oc.y, {
            count: 34, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#ff6ba9'], speed: 9, gravity: 0.22
          });
          NF.FX.sparkle(oc.x, oc.y, '#fff3b0');
          NF.FX.ripple(oc.x, oc.y, { color: 'rgba(255,212,92,.9)', radius: 90 });
          NF.Audio.play('sparkle');
          ctx.timer(320, function () { ctx.complete({ el: bodyEl }); });
        });
      }

      function failCorner() {
        cornerEl.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1)';
        cornerEl.style.transform = 'translate(' + cornerOffset.x + 'px,' + cornerOffset.y + 'px) rotate(' + cornerOffset.rot + 'deg)';
        NF.Audio.play('thud', { volume: 0.3 });
        var cp = cornerScreen();
        NF.FX.dust(cp.x, cp.y);
        ctx.timer(420, function () { cornerEl.style.transition = ''; });
      }

      /* ---------------- 幽灵演示 ---------------- */
      function showDemoCorner() {
        if (demoCornerEl) return;
        demoCornerEl = document.createElement('div');
        demoCornerEl.className = 'lv6-corner lv6-demo-corner';
        demoCornerEl.style.left = homeX + 'px';
        demoCornerEl.style.top = homeY + 'px';
        demoCornerEl.style.width = HOME_W + 'px';
        demoCornerEl.style.height = HOME_H + 'px';
        setClip(demoCornerEl, CORNER);
        demoCornerEl.innerHTML = folderMarkup();
        demoCornerEl.style.opacity = '0';
        ctx.root.appendChild(demoCornerEl);
        void demoCornerEl.offsetWidth;
        demoCornerEl.style.opacity = '0.72';
        demoCornerEl.style.transition = 'transform .6s cubic-bezier(.2,.72,.3,1),opacity .3s ease';
        demoCornerEl.style.transform = 'translate(' + cornerOffset.x + 'px,' + cornerOffset.y + 'px) rotate(' + cornerOffset.rot + 'deg)';
        NF.Audio.play('boing', { volume: 0.35 });
      }

      function returnDemoCorner() {
        if (!demoCornerEl) return;
        demoCornerEl.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1),opacity .4s ease';
        demoCornerEl.style.transform = 'translate(0px,0px) rotate(0deg)';
        NF.Audio.play('snap', { volume: 0.5 });
        NF.Audio.play('sparkle', { volume: 0.4 });
        var hp = homeCornerPoint();
        NF.FX.sparkle(hp.x, hp.y, '#ffd45c');
      }

      function clearDemoCorner() {
        if (demoCornerEl && demoCornerEl.parentNode) demoCornerEl.remove();
        demoCornerEl = null;
      }
      ctx.onCleanup(clearDemoCorner);

      /* 兜底：NF.Ghost.cancel() 在 sleep 中打断时 play() 可能永远不 resolve，
         所以玩家一动手就立刻清掉演示碎片，不依赖 Promise 的 finally。 */
      function onUserInterrupt() {
        if (demoCornerEl) clearDemoCorner();
      }
      ctx.on(document, 'pointerdown', onUserInterrupt, true);
      ctx.on(document, 'keydown', onUserInterrupt, true);

      demo = async function () {
        clearDemoCorner();
        if (completed) return;
        var steps = [];
        var or = OS.rect(outlineEl);
        var oc = { x: or.left + or.width / 2, y: or.top + or.height / 2 };
        var hp = homeCornerPoint();

        var unplaced = shards.filter(function (p) { return !p.placed; });
        if (unplaced.length) {
          var p = unplaced[0];
          var fp = pieceScreen(p.el, PIECES[p.idx]);
          steps.push({ move: [fp.x, fp.y], dur: 420 });
          steps.push({ highlight: p.el, dur: 600 });
          steps.push({ drag: { from: [fp.x, fp.y], to: [oc.x, oc.y], dur: 980, after: 240 } });
          steps.push({ ripple: [oc.x, oc.y] });
          steps.push({ highlight: '[data-t="outline"]', dur: 650 });
        }

        if (cornerReady) {
          var cp = cornerScreen();
          steps.push({ move: [cp.x, cp.y], dur: 380 });
          steps.push({ drag: { from: [cp.x, cp.y], to: [hp.x, hp.y], dur: 980, after: 240 } });
        } else {
          steps.push({ do: showDemoCorner });
          steps.push({ wait: 620 });
          steps.push({ drag: { from: '.lv6-demo-corner', to: [hp.x, hp.y], dur: 900, after: 220 } });
          steps.push({ do: returnDemoCorner });
          steps.push({ wait: 440 });
          steps.push({ do: clearDemoCorner });
        }

        try { await NF.Ghost.play(steps); } finally { clearDemoCorner(); }
      };
      ctx.hint(demo);

      ctx.qa('l06', ctx.root);
    }
  });
})();

