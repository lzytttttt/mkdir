/* 第 11 关：幽灵出逃 —— 教程幽灵偷走了"新建文件夹"命令，抓住它 3 次，再把它掉落的卡片拖成文件夹 */
(function () {
  'use strict';
  var ID = 11;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'cursor',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var MAX_HITS = 3;
      var hits = 0;
      var completed = false;
      var escaped = false;
      var stunnedUntil = 0;
      var speedUp = 0;          // 每抓一次，瞬移间隔减少 180ms
      var card = null;
      var cardHandle = null;
      var createdEl = null;
      var rogueEl = null;
      var rafStop = null;

      var rogue = {
        x: W / 2, y: H * 0.4,
        flying: false, nextAt: 0,
        fromX: 0, fromY: 0, toX: 0, toY: 0, startT: 0, dur: 250,
        lastTrail: 0
      };

      ctx.style([
        '.lv11-veil{position:absolute;inset:0;pointer-events:none;z-index:1;',
        ' background:radial-gradient(ellipse at 50% 42%,transparent 42%,rgba(5,3,18,.4));}',
        '.lv11-rogue{position:absolute;left:0;top:0;width:64px;height:64px;z-index:6;cursor:pointer;',
        ' touch-action:none;will-change:transform;}',
        '.lv11-rogue .lv11-arrow{position:absolute;inset:9px;display:block;',
        ' filter:drop-shadow(0 0 12px rgba(255,212,92,.8)) drop-shadow(0 3px 6px rgba(0,0,0,.5));}',
        '.lv11-rogue .lv11-arrow svg{display:block;width:100%;height:100%;}',
        '.lv11-rogue .lv11-ring{position:absolute;inset:-6px;border-radius:50%;pointer-events:none;',
        ' background:radial-gradient(circle,rgba(255,212,92,.22),rgba(255,212,92,.05) 55%,transparent 70%);',
        ' animation:lv11-ring 1.4s ease-in-out infinite alternate;}',
        '@keyframes lv11-ring{from{opacity:.25;transform:scale(.86);}to{opacity:.85;transform:scale(1.08);}}',
        '.lv11-rogue.lv11-hit .lv11-arrow{animation:lv11-hit .32s ease;}',
        '@keyframes lv11-hit{0%,100%{filter:drop-shadow(0 0 10px rgba(255,255,255,.85));}',
        ' 35%{filter:drop-shadow(0 0 26px #fff) brightness(2.2);}}',
        '.lv11-rogue.lv11-scream .lv11-arrow{animation:lv11-scream .38s ease-in-out infinite;}',
        '@keyframes lv11-scream{0%,100%{transform:rotate(0);}25%{transform:rotate(-14deg) translateY(-5px);}',
        ' 75%{transform:rotate(14deg) translateY(-2px);}}',
        '.lv11-trail{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;z-index:4;',
        ' background:radial-gradient(circle,rgba(255,255,255,.95),rgba(255,255,255,0) 70%);',
        ' box-shadow:0 0 12px rgba(255,255,255,.55);animation:lv11-trail .55s ease-out forwards;}',
        '@keyframes lv11-trail{from{opacity:.9;transform:scale(1);}to{opacity:0;transform:scale(.15);}}',
        '.lv11-decoy{position:absolute;width:56px;height:56px;z-index:5;cursor:pointer;opacity:.42;',
        ' filter:hue-rotate(165deg) drop-shadow(0 0 10px rgba(140,220,255,.8));animation:lv11-decoy-in .18s ease both;}',
        '.lv11-decoy .lv11-arrow{position:absolute;inset:8px;display:block;}',
        '.lv11-decoy .lv11-arrow svg{display:block;width:100%;height:100%;}',
        '.lv11-decoy::after{content:"";position:absolute;inset:1px;border:1px dashed rgba(180,230,255,.55);border-radius:50%;',
        ' animation:lv11-spin 4.5s linear infinite;}',
        '@keyframes lv11-decoy-in{from{opacity:0;transform:scale(.4);}to{opacity:.42;transform:scale(1);}}',
        '@keyframes lv11-spin{to{transform:rotate(360deg);}}',
        '.lv11-stunfx{position:absolute;inset:0;pointer-events:none;z-index:9;',
        ' background:radial-gradient(circle at 50% 45%,transparent 26%,rgba(255,93,122,.34) 100%);',
        ' animation:lv11-stun .52s ease-out forwards;}',
        '@keyframes lv11-stun{0%{opacity:0;transform:scale(1.06);}25%{opacity:1;}100%{opacity:0;transform:scale(1);}}',
        '.lv11-card{position:absolute;width:76px;height:76px;z-index:7;cursor:grab;touch-action:none;',
        ' filter:drop-shadow(0 0 20px rgba(255,212,92,.85)) drop-shadow(0 14px 20px rgba(0,0,0,.45));',
        ' animation:lv11-card-bob 1.8s ease-in-out infinite alternate;}',
        '.lv11-card svg{display:block;width:100%;height:100%;}',
        '.lv11-card::before{content:"";position:absolute;inset:-14px;border-radius:50%;pointer-events:none;',
        ' border:2px dashed rgba(255,240,190,.8);animation:lv11-spin 7s linear infinite;}',
        '.lv11-card::after{content:"";position:absolute;inset:-22px;border-radius:50%;pointer-events:none;',
        ' background:radial-gradient(circle,rgba(255,212,92,.35),transparent 68%);',
        ' animation:lv11-pulse 1.4s ease-in-out infinite alternate;}',
        '@keyframes lv11-card-bob{from{transform:translateY(0) rotate(-3deg);}to{transform:translateY(-8px) rotate(3deg);}}',
        '@keyframes lv11-pulse{from{opacity:.35;transform:scale(.9);}to{opacity:.9;transform:scale(1.12);}}',
        '.lv11-card.lv11-grabbed{animation:none;cursor:grabbing;z-index:40;',
        ' filter:drop-shadow(0 0 32px rgba(255,212,92,1)) drop-shadow(0 18px 26px rgba(0,0,0,.55));}',
        '.lv11-card.lv11-settle{transition:transform .34s cubic-bezier(.34,1.56,.64,1);}',
        '.lv11-card.lv11-card-open{animation:lv11-card-open .38s ease-out forwards;}',
        '@keyframes lv11-card-open{0%{transform:scale(1);opacity:1;}55%{transform:scale(1.55) rotate(6deg);opacity:1;}',
        ' 100%{transform:scale(.2) rotate(-14deg);opacity:0;}}',
        '.lv11-born{filter:drop-shadow(0 0 26px rgba(255,212,92,.9)) drop-shadow(0 16px 20px rgba(0,0,0,.5));}'
      ].join(''));

      var veil = document.createElement('div');
      veil.className = 'lv11-veil';
      ctx.root.appendChild(veil);

      /* ---------------- 出逃的幽灵 ---------------- */
      rogueEl = document.createElement('div');
      rogueEl.className = 'lv11-rogue';
      rogueEl.dataset.t = 'rogue-ghost';
      rogueEl.dataset.hits = '0';
      rogueEl.innerHTML = '<span class="lv11-arrow">' + NF.icons.svg('cursor') + '</span>' +
        '<span class="lv11-ring"></span>';
      ctx.root.appendChild(rogueEl);

      function setRoguePos() {
        rogueEl.style.transform = 'translate3d(' + Math.round(rogue.x - 32) + 'px,' +
          Math.round(rogue.y - 32) + 'px,0)';
      }
      setRoguePos();

      function randPoint() {
        var m = 96;
        return {
          x: OS.rand(m, Math.max(m + 40, W - m)),
          y: OS.rand(m, Math.max(m + 40, H - m))
        };
      }

      function nextInterval() {
        return Math.max(500, OS.rand(1100, 1500) - speedUp);
      }

      function addTrail(x, y) {
        var t = document.createElement('i');
        t.className = 'lv11-trail';
        t.style.left = x + 'px';
        t.style.top = y + 'px';
        ctx.root.appendChild(t);
        t.addEventListener('animationend', function () { if (t.parentNode) t.remove(); });
      }

      function startFlight(now) {
        var p = randPoint();
        var guard = 0;
        while (Math.hypot(p.x - rogue.x, p.y - rogue.y) < 120 && guard++ < 8) p = randPoint();
        rogue.fromX = rogue.x;
        rogue.fromY = rogue.y;
        rogue.toX = p.x;
        rogue.toY = p.y;
        rogue.startT = now;
        rogue.dur = 250;
        rogue.flying = true;
      }

      rogue.nextAt = performance.now() + 650;
      rafStop = ctx.raf(function (now) {
        if (completed || escaped) return;
        if (rogue.flying) {
          var t = Math.min(1, (now - rogue.startT) / rogue.dur);
          var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          rogue.x = rogue.fromX + (rogue.toX - rogue.fromX) * e;
          rogue.y = rogue.fromY + (rogue.toY - rogue.fromY) * e;
          setRoguePos();
          if (t < 1) {
            if (now - rogue.lastTrail > 44) {
              rogue.lastTrail = now;
              addTrail(rogue.x, rogue.y);
            }
          } else {
            rogue.flying = false;
            rogue.nextAt = now + nextInterval();
          }
        } else if (now >= rogue.nextAt) {
          startFlight(now);
        }
      });

      /* ---------------- 抓幽灵 ---------------- */
      function onRogueDown(e) {
        if (e.button !== 0 || completed || escaped) return;
        if (performance.now() < stunnedUntil) {
          NF.Audio.play('deny', { volume: 0.3 });
          return;
        }
        hits++;
        speedUp = hits * 180;
        rogueEl.dataset.hits = String(hits);
        rogueEl.classList.remove('lv11-hit');
        void rogueEl.offsetWidth;
        rogueEl.classList.add('lv11-hit');
        ctx.timer(340, function () { rogueEl.classList.remove('lv11-hit'); });

        NF.Audio.play('giggle', { volume: 0.55 });
        NF.Audio.play('error', { volume: 0.32 });
        NF.FX.burst(rogue.x, rogue.y, {
          count: 18, colors: ['#ffffff', '#ffd45c', '#8a6cff'], speed: 7, gravity: 0.1
        });
        NF.FX.ripple(rogue.x, rogue.y, { color: 'rgba(255,255,255,.85)', radius: 46 });
        spawnDecoys(2);

        if (hits >= MAX_HITS) escapeWithCard();
      }
      ctx.on(rogueEl, 'pointerdown', onRogueDown);

      function spawnDecoys(n) {
        for (var i = 0; i < n; i++) {
          var d = document.createElement('div');
          d.className = 'lv11-decoy';
          d.dataset.t = 'ghost-decoy';
          d.innerHTML = '<span class="lv11-arrow">' + NF.icons.svg('cursor') + '</span>';
          var ang = OS.rand(0, Math.PI * 2);
          var dist = OS.rand(66, 124);
          var x = OS.clamp(rogue.x + Math.cos(ang) * dist, 52, W - 52);
          var y = OS.clamp(rogue.y + Math.sin(ang) * dist, 52, H - 52);
          d.style.left = (x - 28) + 'px';
          d.style.top = (y - 28) + 'px';
          ctx.root.appendChild(d);
          (function (el) {
            ctx.on(el, 'pointerdown', function (ev) {
              ev.stopPropagation();
              if (completed) return;
              if (performance.now() < stunnedUntil) return;
              decoyPunish(el);
            });
            ctx.timer(800, function () {
              if (el.parentNode && !el._poof) el.remove();
            });
          })(d);
        }
      }

      function decoyPunish(el) {
        el._poof = true;
        if (el.parentNode) el.remove();
        NF.Audio.play('deny');
        NF.Audio.play('error', { volume: 0.5 });
        NF.FX.shake(6, 260);
        NF.FX.flash('rgba(255,93,122,.18)', 180);
        stunnedUntil = performance.now() + 500;
        var stun = document.createElement('div');
        stun.className = 'lv11-stunfx';
        ctx.root.appendChild(stun);
        ctx.timer(540, function () { if (stun.parentNode) stun.remove(); });
        var c = OS.center(el);
        NF.FX.burst(c.x, c.y, {
          count: 12, colors: ['#ff7a90', '#ffffff'], speed: 5, gravity: 0.2
        });
      }

      /* ---------------- 抓满 3 次：掉卡片 + 逃跑 ---------------- */
      function escapeWithCard() {
        if (escaped) return;
        escaped = true;
        rogue.flying = false;
        rogueEl.style.pointerEvents = 'none';
        rogueEl.classList.add('lv11-scream');
        NF.Audio.play('boing', { volume: 0.9 });
        NF.Audio.play('giggle', { volume: 0.6 });
        NF.FX.shake(7, 320);
        NF.FX.flash('rgba(255,255,255,.25)', 160);
        var drop = { x: rogue.x, y: rogue.y };

        ctx.timer(380, function () {
          spawnCard(drop.x, drop.y);
          var fromX = Math.round(rogue.x - 32);
          var fromY = Math.round(rogue.y - 32);
          rogueEl.style.transition = 'transform .85s cubic-bezier(.4,0,.7,1),opacity .7s ease';
          rogueEl.style.transform = 'translate3d(' + (fromX - 220) + 'px,' + (fromY - 260) + 'px,0) ' +
            'rotate(-55deg) scale(.35)';
          rogueEl.style.opacity = '0';
          NF.Audio.play('whoosh', { volume: 0.7 });
        });
      }

      function spawnCard(x, y) {
        card = document.createElement('div');
        card.className = 'lv11-card';
        card.dataset.t = 'stolen-folder';
        card.innerHTML = NF.icons.svg('folder');
        card.style.left = Math.round(x - 38) + 'px';
        card.style.top = Math.round(y - 38) + 'px';
        ctx.root.appendChild(card);

        NF.Audio.play('select', { volume: 0.6 });
        NF.Audio.play('pop', { volume: 0.8 });
        NF.FX.sparkle(x, y, '#ffd45c');
        NF.FX.burst(x, y, {
          count: 26, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 8, gravity: 0.2
        });

        cardHandle = OS.makeDraggable(card, {
          threshold: 3,
          canStart: function () { return !completed; },
          onStart: function () {
            card.classList.add('lv11-grabbed');
            NF.Audio.play('hover', { volume: 0.2 });
          },
          onMove: function (e, st) {
            card.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' +
              OS.clamp(st.dx * 0.03, -8, 8).toFixed(2) + 'deg) scale(1.05)';
          },
          onEnd: function (e, st) {
            card.classList.remove('lv11-grabbed');
            if (completed) return;
            if (Math.hypot(st.dx, st.dy) < 18) {
              card.classList.add('lv11-settle');
              card.style.transform = '';
              NF.Audio.play('thud', { volume: 0.35 });
              ctx.timer(360, function () { card.classList.remove('lv11-settle'); });
              return;
            }
            cardSuccess();
          }
        });
        ctx.timer(900, function () { if (!completed) ctx.replayHint(); });
      }

      function cardSuccess() {
        if (completed || !card) return;
        completed = true;
        if (cardHandle) cardHandle.locked = true;
        var r = OS.rect(card);
        var rr = OS.rect(ctx.root);
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;

        card.classList.remove('lv11-grabbed');
        card.classList.add('lv11-card-open');
        NF.Audio.play('snap');
        NF.Audio.play('sparkle', { volume: 0.9 });
        NF.FX.flash('rgba(255,244,205,.5)', 220);
        NF.FX.burst(cx, cy, {
          count: 40, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#8a6cff'], speed: 11, gravity: 0.2
        });

        ctx.timer(380, function () {
          var left = Math.round(r.left - rr.left);
          var top = Math.round(r.top - rr.top);
          if (card && card.parentNode) card.remove();
          card = null;
          createdEl = ctx.createdFolder({
            x: left, y: top, label: '新建文件夹', testid: 'created-folder'
          });
          createdEl.classList.add('lv11-born');
          var c = OS.center(createdEl);
          NF.FX.sparkle(c.x, c.y, '#ffd45c');
          NF.Audio.play('pop');
          ctx.timer(560, function () { ctx.complete({ el: createdEl }); });
        });
      }

      /* ---------------- 幽灵演示 ---------------- */
      demo = async function () {
        if (completed) return;
        if (card) {
          var tx = Math.round(W * 0.72);
          var ty = Math.round(H * 0.62);
          await NF.Ghost.play([
            { move: '[data-t="stolen-folder"]', dur: 480 },
            { highlight: '[data-t="stolen-folder"]', dur: 680 },
            { drag: { from: '[data-t="stolen-folder"]', to: [tx, ty], dur: 1000, after: 240 } },
            { wait: 180 }
          ]);
        } else {
          await NF.Ghost.play([
            { move: function () { return [rogue.x, rogue.y]; }, dur: 520 },
            { click: 'left', target: function () { return [rogue.x, rogue.y]; }, after: 260 },
            { move: function () { return [rogue.x, rogue.y]; }, dur: 440 },
            { click: 'left', target: function () { return [rogue.x, rogue.y]; }, after: 260 },
            { wait: 180 }
          ]);
        }
      };
      ctx.hint(demo);

      ctx.qa('l11', ctx.root);
    }
  });
})();
