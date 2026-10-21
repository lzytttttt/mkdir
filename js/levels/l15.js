/* 第 15 关：断电 —— 显示器电源被拔了，只剩鼠标周围一圈手电光。
   1. 全屏遮罩压暗桌面，鼠标周围 150px 是随鼠标平滑跟随的透明光斑；
   2. 桌上散落 6 个图标：1 个真·新建文件夹（有微弱金色呼吸光），5 个假图标（错位/单色/倒置）；
   3. 照亮并点中真图标 → 炸成光点，桌面中央点亮生成文件夹 → 过关；点假图标只有滑稽反馈并换位置；
   4. 右下角电量条 25 秒耗尽 → 全场闪三下变暗再亮起并回满，同时假图标全部换位置（循环，不失败）。
   方向键可以微调光斑。
*/
(function () {
  'use strict';
  var ID = 15;
  var OS = NF.OS;
  var demo = null;

  var BATTERY_MS = 25000;   // 手电电量：25 秒

  NF.Game.registerLevel({
    id: ID,
    icon: 'eyeClosed',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var scene = null;
      var darkness = null;
      var lamp = null;
      var flickerEl = null;
      var auraEl = null;
      var beaconEl = null;
      var powerBox = null;
      var powerFill = null;

      var icons = [];             // { el, x, y, real }
      var realIcon = null;
      var realPos = { x: 0, y: 0 };
      var completed = false;
      var powerMode = 'normal';   // normal | cycle
      var batteryLeft = BATTERY_MS;
      var batteryShown = -1;
      var powerCycles = 0;        // 断电循环次数（QA 读 data-cycles）

      var light = { x: W / 2, y: H / 2 };
      var lastMouse = { x: W / 2, y: H / 2 };
      var hintLight = null;
      var lastTs = 0;

      ctx.style([
        '.lv15-scene{position:absolute;inset:0;pointer-events:none;z-index:1;--lx:' + (W / 2) + 'px;--ly:' + (H / 2) + 'px;}',
        /* 手电光斑：透明圆 + 几乎全黑的遮罩 */
        '.lv15-darkness{position:absolute;inset:0;z-index:50;pointer-events:none;',
        ' background:radial-gradient(circle 150px at var(--lx) var(--ly),transparent 0,rgba(0,0,0,.985) 78%);}',
        '.lv15-darkness.lv15-blackout{background:#000;}',
        '.lv15-lamp{position:absolute;inset:0;z-index:51;pointer-events:none;',
        ' background:radial-gradient(circle 185px at var(--lx) var(--ly),rgba(255,240,200,.14),rgba(255,225,170,.04) 55%,transparent 72%);}',
        '.lv15-flicker{position:absolute;inset:0;z-index:54;pointer-events:none;opacity:0;',
        ' background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.4),rgba(255,255,255,.06) 60%,transparent);}',
        '.lv15-flicker.is-on{animation:lv15-flick3 .72s steps(1,end) both;}',
        '@keyframes lv15-flick3{0%{opacity:0;}8%{opacity:1;}17%{opacity:0;}28%{opacity:1;}37%{opacity:0;}',
        ' 48%{opacity:1;}60%{opacity:0;}100%{opacity:0;}}',
        '.lv15-flicker.is-flicker{animation:lv15-flick1 .22s ease-out both;}',
        '@keyframes lv15-flick1{0%{opacity:.55;}55%{opacity:.18;}100%{opacity:0;}}',
        /* 桌面图标 */
        '.lv15-icon{position:absolute;width:64px;height:64px;z-index:3;pointer-events:auto;cursor:pointer;line-height:0;}',
        '.lv15-icon-art{width:100%;height:100%;transition:transform .18s ease,filter .18s ease;}',
        '.lv15-icon-art svg{width:100%;height:100%;display:block;}',
        '.lv15-real .lv15-icon-art{filter:drop-shadow(0 0 10px rgba(255,201,77,.8)) saturate(1.1);}',
        '.lv15-real:hover .lv15-icon-art{transform:scale(1.14);}',
        '.lv15-fake:hover{filter:brightness(1.3);}',
        '.lv15-fake .lv15-icon-art{filter:grayscale(1) brightness(.72) contrast(1.15);}',
        '.lv15-icon.lv15-fake-hit{animation:lv15-fakehit .34s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv15-fakehit{0%{transform:scale(1);}35%{transform:scale(1.28) rotate(-12deg);}',
        ' 70%{transform:scale(.9) rotate(8deg);}100%{transform:scale(1);}}',
        '.lv15-icon.lv15-real-burst{animation:lv15-realburst .46s cubic-bezier(.3,.7,.4,1) forwards;}',
        '@keyframes lv15-realburst{0%{transform:scale(1);opacity:1;}55%{transform:scale(1.7) rotate(14deg);opacity:.9;}',
        ' 100%{transform:scale(.1) rotate(40deg);opacity:0;}}',
        /* 真图标自带的微弱金色呼吸光（在遮罩之下，只有手电光斑照到才看得清） */
        '.lv15-aura{position:absolute;width:150px;height:150px;border-radius:50%;z-index:2;pointer-events:none;',
        ' background:radial-gradient(circle,rgba(255,201,77,.4),rgba(255,201,77,.1) 55%,transparent 72%);',
        ' filter:blur(3px);animation:lv15-aura 2.6s ease-in-out infinite;}',
        '@keyframes lv15-aura{0%,100%{opacity:.35;transform:scale(.86);}50%{opacity:.95;transform:scale(1.08);}}',
        /* 幽灵演示时用来标出真图标位置的光标信标（演示结束就消失） */
        '.lv15-beacon{position:absolute;width:104px;height:104px;border-radius:50%;z-index:57;pointer-events:none;',
        ' border:2px dashed rgba(255,224,138,.92);box-shadow:0 0 36px rgba(255,212,92,.6),inset 0 0 22px rgba(255,212,92,.32);',
        ' animation:lv15-beacon 1.4s ease-in-out infinite;}',
        '@keyframes lv15-beacon{0%,100%{opacity:.4;transform:scale(.92);}50%{opacity:1;transform:scale(1.07);}}',
        /* 右下角电量条 */
        '.lv15-power{position:absolute;right:24px;bottom:20px;z-index:60;display:flex;align-items:center;gap:8px;',
        ' pointer-events:none;opacity:.96;}',
        '.lv15-power-ico{width:20px;height:20px;line-height:0;filter:drop-shadow(0 0 6px rgba(255,212,92,.6));}',
        '.lv15-power-ico svg{width:100%;height:100%;display:block;}',
        '.lv15-power-track{width:150px;height:8px;border-radius:5px;background:rgba(255,255,255,.15);overflow:hidden;',
        ' box-shadow:inset 0 0 6px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.12);}',
        '.lv15-power-fill{height:100%;width:100%;border-radius:5px;',
        ' background:linear-gradient(90deg,#7ef0c0,#ffd45c);',
        ' box-shadow:0 0 10px rgba(255,212,92,.5);transition:background .3s ease;}',
        '.lv15-power.is-low .lv15-power-fill{background:linear-gradient(90deg,#ff8a5c,#ff5d7a);',
        ' animation:lv15-lowblink .6s steps(1,end) infinite;}',
        '@keyframes lv15-lowblink{0%,100%{opacity:1;}50%{opacity:.42;}}',
        /* 点亮后的桌面 & 文件夹 */
        '.lv15-scene.lv15-reveal .lv15-darkness{opacity:.4;transition:opacity .55s ease;}',
        '.lv15-folder{filter:drop-shadow(0 0 30px rgba(255,212,92,.9)) drop-shadow(0 12px 18px rgba(0,0,0,.45));}'
      ].join(''));

      scene = document.createElement('div');
      scene.className = 'lv15-scene';
      scene.dataset.phase = 'search';
      scene.dataset.power = 'normal';
      scene.dataset.cycles = '0';
      scene.dataset.qa = 'l15';
      ctx.root.appendChild(scene);

      function rootRect() { return ctx.root.getBoundingClientRect(); }
      function toLocal(clientX, clientY) {
        var r = rootRect();
        return { x: clientX - r.left, y: clientY - r.top };
      }

      /* ---------------- 随机安全落点 ---------------- */
      function randomSpot(others, minDist, self) {
        var list = others.filter(function (o) { return o !== self; });
        for (var tries = 0; tries < 90; tries++) {
          var x = Math.round(OS.rand(120, Math.max(130, W - 120 - 64)));
          var y = Math.round(OS.rand(120, Math.max(130, H - 120 - 64)));
          var ok = true;
          for (var i = 0; i < list.length; i++) {
            if (Math.hypot(list[i].x - x, list[i].y - y) < minDist) { ok = false; break; }
          }
          if (ok) return { x: x, y: y };
        }
        return {
          x: Math.round(OS.rand(120, Math.max(130, W - 200))),
          y: Math.round(OS.rand(120, Math.max(130, H - 200)))
        };
      }

      /* ---------------- 图标 ---------------- */
      var FAKE_ICONS = ['file', 'gear', 'robot', 'trash', 'bug', 'disk', 'fileText', 'eyeClosed', 'cake', 'cloud'];

      function buildIcon(real, x, y, idx) {
        var el = document.createElement('div');
        el.className = 'lv15-icon ' + (real ? 'lv15-real' : 'lv15-fake');
        el.dataset.t = real ? 'power-icon-real' : 'power-icon-fake';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        var art = document.createElement('div');
        art.className = 'lv15-icon-art';
        var name = real ? 'folder' : FAKE_ICONS[idx % FAKE_ICONS.length];
        art.innerHTML = NF.icons.svg(name);
        if (!real) {
          // 错位 / 倒置 / 单色：每个假图标长得都不一样（内联 filter 会覆盖 CSS，所以写全）
          var rot = OS.rand(-16, 16);
          var mirror = Math.random() < 0.5 ? -1 : 1;
          var tint = Math.round(OS.rand(-40, 40));
          art.style.transform = 'rotate(' + rot.toFixed(1) + 'deg) scaleX(' + mirror + ')';
          art.style.filter = 'grayscale(1) sepia(.5) hue-rotate(' + tint + 'deg) brightness(.72) contrast(1.15)';
        }
        el.appendChild(art);
        var rec = { el: el, x: x, y: y, real: !!real };
        ctx.on(el, 'click', function (e) {
          e.stopPropagation();
          if (completed) return;
          if (real) finish();
          else fakeHit(rec);
        });
        scene.appendChild(el);
        return rec;
      }

      (function layoutIcons() {
        var placed = [];
        realPos = randomSpot(placed, 0, null);
        realIcon = buildIcon(true, realPos.x, realPos.y, 0);
        icons.push(realIcon);
        placed.push(realPos);
        for (var i = 0; i < 5; i++) {
          var spot = randomSpot(placed, 150, null);
          var rec = buildIcon(false, spot.x, spot.y, i);
          icons.push(rec);
          placed.push(spot);
        }
      })();

      /* ---------------- 遮罩 / 光斑 / 电量 ---------------- */
      darkness = document.createElement('div');
      darkness.className = 'lv15-darkness';
      darkness.dataset.t = 'darkness';
      scene.appendChild(darkness);

      lamp = document.createElement('div');
      lamp.className = 'lv15-lamp';
      scene.appendChild(lamp);

      flickerEl = document.createElement('div');
      flickerEl.className = 'lv15-flicker';
      scene.appendChild(flickerEl);

      auraEl = document.createElement('div');
      auraEl.className = 'lv15-aura';
      auraEl.style.left = (realPos.x + 32 - 75) + 'px';
      auraEl.style.top = (realPos.y + 32 - 75) + 'px';
      scene.appendChild(auraEl);

      powerBox = document.createElement('div');
      powerBox.className = 'lv15-power';
      powerBox.dataset.t = 'power-bar';
      var pIco = document.createElement('div');
      pIco.className = 'lv15-power-ico';
      pIco.innerHTML = NF.icons.svg('socket');
      powerBox.appendChild(pIco);
      var track = document.createElement('div');
      track.className = 'lv15-power-track';
      powerFill = document.createElement('div');
      powerFill.className = 'lv15-power-fill';
      track.appendChild(powerFill);
      powerBox.appendChild(track);
      scene.appendChild(powerBox);

      function updatePowerBar(force) {
        var pct = OS.clamp(batteryLeft / BATTERY_MS, 0, 1);
        var shown = Math.round(pct * 100);
        if (!force && shown === batteryShown) {
          if (pct < 0.25) powerBox.classList.add('is-low');
          return;
        }
        batteryShown = shown;
        powerFill.style.width = shown + '%';
        powerBox.dataset.pct = String(shown);
        powerBox.classList.toggle('is-low', pct < 0.25);
      }
      updatePowerBar(true);

      /* ---------------- 手电循环（电量耗尽，不失败） ---------------- */
      function drainBattery() {
        if (completed || powerMode === 'cycle') return;
        powerMode = 'cycle';
        scene.dataset.power = 'cycle';
        powerCycles += 1;
        scene.dataset.cycles = String(powerCycles);
        NF.Audio.play('powerdown', { volume: 0.85 });
        flickerEl.classList.remove('is-on');
        void flickerEl.offsetWidth;
        flickerEl.classList.add('is-on');
        darkness.classList.add('lv15-blackout');
        ctx.timer(240, function () { NF.Audio.play('alarm', { volume: 0.22 }); });
        ctx.timer(760, function () {
          if (completed) return;
          // 假图标全部换位置
          icons.forEach(function (rec) {
            if (rec.real) return;
            var spot = randomSpot(icons, 150, rec);
            rec.x = spot.x;
            rec.y = spot.y;
            rec.el.style.left = spot.x + 'px';
            rec.el.style.top = spot.y + 'px';
          });
          darkness.classList.remove('lv15-blackout');
          batteryLeft = BATTERY_MS;
          updatePowerBar(true);
          powerMode = 'normal';
          scene.dataset.power = 'normal';
          NF.Audio.play('sparkle', { volume: 0.45 });
        });
      }

      /* ---------------- 点中真图标 ---------------- */
      function finish() {
        if (completed) return;
        completed = true;
        scene.dataset.phase = 'done';
        batteryLeft = BATTERY_MS;
        updatePowerBar(true);
        NF.Audio.play('explode', { volume: 0.7 });
        NF.Audio.play('sparkle', { volume: 0.85 });
        var c = OS.center(realIcon.el);
        NF.FX.flash('rgba(255,244,205,.55)', 220);
        NF.FX.burst(c.x, c.y, {
          count: 46, colors: ['#ffc94d', '#ffe08a', '#ffb020', '#ffffff'], speed: 11, gravity: 0.24
        });
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,224,138,.95)', radius: 80 });
        realIcon.el.classList.add('lv15-real-burst');
        realIcon.el.style.pointerEvents = 'none';
        scene.classList.add('lv15-reveal');

        ctx.timer(420, function () {
          var fx = Math.round(W / 2 - 38);
          var fy = Math.round(H * 0.46);
          var folder = ctx.createdFolder({ x: fx, y: fy, label: '新建文件夹', testid: 'created-folder' });
          folder.classList.add('lv15-folder');
          folder.dataset.state = 'powered';
          var fc = OS.center(folder);
          NF.Audio.play('pop');
          NF.FX.flash('rgba(255,247,214,.5)', 260);
          NF.FX.sparkle(fc.x, fc.y, '#ffd45c');
          NF.FX.burst(fc.x, fc.y, {
            count: 34, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#7ef0c0'], speed: 8, gravity: 0.2
          });
          ctx.timer(560, function () { ctx.complete({ el: folder }); });
        });
      }

      /* ---------------- 点中假图标 ---------------- */
      function fakeHit(rec) {
        if (completed) return;
        NF.Audio.play('boing', { volume: 0.55, rate: 0.72 });
        NF.Audio.play('giggle', { volume: 0.35 });
        flickerEl.classList.remove('is-flicker');
        void flickerEl.offsetWidth;
        flickerEl.classList.add('is-flicker');
        var spot = randomSpot(icons, 150, rec);
        rec.x = spot.x;
        rec.y = spot.y;
        rec.el.style.left = spot.x + 'px';
        rec.el.style.top = spot.y + 'px';
        rec.el.classList.remove('lv15-fake-hit');
        void rec.el.offsetWidth;
        rec.el.classList.add('lv15-fake-hit');
        var c = OS.center(rec.el);
        NF.FX.dust(c.x, c.y);
        ctx.timer(360, function () { rec.el.classList.remove('lv15-fake-hit'); });
      }

      /* ---------------- 鼠标 / 键盘控制光斑 ---------------- */
      ctx.on(window, 'pointermove', function (e) {
        var p = toLocal(e.clientX, e.clientY);
        lastMouse = p;
        hintLight = null;
        hideBeacon();
      });

      function nudge(dx, dy) {
        if (completed) return;
        hintLight = null;
        hideBeacon();
        lastMouse.x = OS.clamp(lastMouse.x + dx, 0, W);
        lastMouse.y = OS.clamp(lastMouse.y + dy, 0, H);
      }
      ctx.on(window, 'keydown', function (e) {
        if (completed) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-26, 0); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(26, 0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -26); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, 26); }
      });

      /* ---------------- 主循环：光斑平滑跟随 + 电量消耗 ---------------- */
      function tick(now) {
        if (!lastTs) lastTs = now;
        var dt = Math.min(0.05, (now - lastTs) / 1000 || 0.016);
        lastTs = now;
        var goal = hintLight || lastMouse;
        var k = Math.min(1, dt * 10);
        light.x += (goal.x - light.x) * k;
        light.y += (goal.y - light.y) * k;
        scene.style.setProperty('--lx', light.x.toFixed(1) + 'px');
        scene.style.setProperty('--ly', light.y.toFixed(1) + 'px');

        if (!completed && powerMode === 'normal') {
          batteryLeft -= dt * 1000;
          if (batteryLeft <= 0) {
            batteryLeft = 0;
            updatePowerBar(true);
            drainBattery();
          } else {
            updatePowerBar(false);
          }
        }
      }
      ctx.raf(tick);

      /* ---------------- 幽灵演示：先把手电照到真图标上，再点它 ---------------- */
      function showBeacon() {
        if (beaconEl || completed) return;
        beaconEl = document.createElement('div');
        beaconEl.className = 'lv15-beacon';
        beaconEl.style.left = (realPos.x + 32 - 52) + 'px';
        beaconEl.style.top = (realPos.y + 32 - 52) + 'px';
        scene.appendChild(beaconEl);
        NF.Audio.play('sparkle', { volume: 0.3 });
      }
      function hideBeacon() {
        if (beaconEl) {
          if (beaconEl.parentNode) beaconEl.remove();
          beaconEl = null;
        }
      }

      demo = async function () {
        if (completed) return;
        if (powerMode === 'cycle') {
          await NF.Ghost.play([{ wait: 500 }]);
          return;
        }
        var rr = rootRect();
        var px = realPos.x + 32 + rr.left;
        var py = realPos.y + 32 + rr.top;
        hintLight = { x: realPos.x + 32, y: realPos.y + 32 };
        showBeacon();
        try {
          await NF.Ghost.play([
            { move: [px, py], dur: 820 },
            { highlight: '[data-t="power-icon-real"]', dur: 900 },
            { click: 'left', target: '[data-t="power-icon-real"]', after: 220 },
            { wait: 260 }
          ]);
        } finally {
          // 演示结束后稍等一会儿就把手电交还给鼠标，信标也收掉：
          // 玩家记住了大概位置，但仍要自己打着手电找过去。
          ctx.timer(650, function () {
            hintLight = null;
            hideBeacon();
          });
        }
      };
      ctx.hint(demo);

      ctx.onCleanup(function () {
        hideBeacon();
        hintLight = null;
        if (realIcon && realIcon.el.parentNode) realIcon.el.remove();
        icons.forEach(function (rec) { if (rec.el.parentNode) rec.el.remove(); });
        icons = [];
      });
    }
  });
})();
