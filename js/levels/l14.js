/* 第 14 关：影子玩家 —— 另一个"玩家"抢走了新建文件夹。
   流程：
   1. 正常右键 → 新建 → 文件夹（直接建出，不弹命名框）；
   2. 2 秒后蓝色 rival 光标从右下角冲进来，把文件夹抢走并在桌面乱窜（鼠标靠近会加速逃开）；
   3. 点 rival 两下把它敲晕 3.4 秒，文件夹掉在桌上；
   4. 眩晕期间把文件夹拖进右下角安全区 → 过关。没送到 rival 会爬起来重新抢走，可无限重试。
*/
(function () {
  'use strict';
  var ID = 14;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'mouse',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var scene = null;
      var folder = null;
      var rival = null;
      var rivalIco = null;
      var safeZone = null;

      var phase = 1;              // 1 等待右键新建 / 2 rival 冲进来（含等待）/ 3 抢走漫游 / 4 眩晕掉落 / 5 完成
      var completed = false;
      var hits = 0;               // 本轮累计点击 rival 次数
      var stunned = false;
      var carried = false;
      var draggingFolder = false;
      var dragHandle = null;
      var menuByHint = false;
      var fleeBoostUntil = 0;

      var pos = { x: W + 80, y: H + 80 };  // rival 中心（相对 level-root）
      var targetPt = { x: W * 0.5, y: H * 0.5 };
      var targetAt = 0;
      var targetTtl = 900;
      var lastTs = 0;
      var lastMouse = { x: -9999, y: -9999 };
      var trailNodes = [];
      var trailLast = 0;
      var stunTimer = 0;

      ctx.style([
        '.lv14-scene{position:absolute;inset:0;pointer-events:none;z-index:1;}',
        /* rival：蓝色幽灵鼠标 + 尾迹 */
        '.lv14-rival{position:absolute;left:0;top:0;width:72px;height:72px;z-index:40;pointer-events:auto;',
        ' cursor:pointer;touch-action:none;will-change:transform;display:flex;align-items:center;justify-content:center;}',
        '.lv14-rival-ico{position:relative;width:40px;height:40px;line-height:0;will-change:transform;',
        ' filter:drop-shadow(0 0 7px rgba(120,180,255,.95)) drop-shadow(0 0 20px rgba(91,124,250,.65));',
        ' transition:filter .2s ease;}',
        '.lv14-rival-ico svg{width:100%;height:100%;display:block;}',
        '.lv14-rival-ico svg path{fill:#8ec4ff;stroke:#12204a;}',
        '.lv14-rival-ico.lv14-hit{animation:lv14-hit .3s ease;}',
        '@keyframes lv14-hit{0%{transform:scale(1);}35%{transform:scale(1.45) rotate(-16deg);}',
        ' 70%{transform:scale(.88) rotate(9deg);}100%{transform:scale(1);}}',
        '.lv14-rival.lv14-stunned .lv14-rival-ico{animation:lv14-dizzy .42s linear infinite;}',
        '@keyframes lv14-dizzy{0%{transform:rotate(0) scale(1);}25%{transform:rotate(-24deg) scale(1.18);}',
        ' 75%{transform:rotate(24deg) scale(.88);}100%{transform:rotate(0) scale(1);}}',
        '.lv14-stars{position:absolute;left:50%;top:-2px;transform:translateX(-50%);display:none;',
        ' font-size:12px;letter-spacing:3px;color:#ffd45c;white-space:nowrap;pointer-events:none;',
        ' text-shadow:0 0 10px rgba(255,212,92,.95);animation:lv14-stars 1s linear infinite;}',
        '.lv14-rival.lv14-stunned .lv14-stars{display:block;}',
        '@keyframes lv14-stars{0%{transform:translateX(-50%) rotate(-8deg);}50%{transform:translateX(-50%) rotate(8deg);}',
        ' 100%{transform:translateX(-50%) rotate(-8deg);}}',
        '.lv14-trail{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;',
        ' pointer-events:none;z-index:38;background:radial-gradient(circle,rgba(160,205,255,.95),',
        ' rgba(91,124,250,.28) 58%,transparent 76%);animation:lv14-trail .62s ease-out forwards;}',
        '@keyframes lv14-trail{0%{opacity:.95;transform:scale(1);}100%{opacity:0;transform:scale(.2);}}',
        /* 安全区：右下角虚线文件夹轮廓 */
        '.lv14-safe{position:absolute;right:30px;bottom:24px;width:190px;height:150px;border-radius:22px;',
        ' border:2.5px dashed rgba(126,240,192,.82);z-index:26;pointer-events:none;display:flex;',
        ' align-items:center;justify-content:center;background:radial-gradient(circle at 50% 46%,',
        ' rgba(126,240,192,.17),transparent 72%);box-shadow:0 0 26px rgba(126,240,192,.16),',
        ' inset 0 0 24px rgba(126,240,192,.1);',
        ' animation:lv14-safe-in .42s cubic-bezier(.34,1.56,.64,1) both,lv14-safe-pulse 2.2s ease-in-out infinite;}',
        '.lv14-safe .lv14-safe-ico{width:90px;height:90px;opacity:.46;filter:drop-shadow(0 0 14px rgba(126,240,192,.5));}',
        '@keyframes lv14-safe-in{from{opacity:0;transform:scale(.72) rotate(-8deg);}to{opacity:1;transform:scale(1) rotate(0);}}',
        '@keyframes lv14-safe-pulse{0%,100%{box-shadow:0 0 20px rgba(126,240,192,.14),inset 0 0 20px rgba(126,240,192,.08);}',
        ' 50%{box-shadow:0 0 36px rgba(126,240,192,.3),inset 0 0 30px rgba(126,240,192,.16);}}',
        '.lv14-safe.is-hot{border-color:rgba(126,240,192,1);border-style:solid;',
        ' box-shadow:0 0 46px rgba(126,240,192,.55),inset 0 0 34px rgba(126,240,192,.3);transform:scale(1.05);}',
        '.lv14-safe.is-sealed{animation:lv14-seal .55s cubic-bezier(.34,1.56,.64,1) forwards;}',
        '@keyframes lv14-seal{0%{opacity:1;transform:scale(1);}55%{opacity:1;transform:scale(1.16);}',
        ' 100%{opacity:0;transform:scale(.5) rotate(9deg);}}',
        /* 文件夹状态 */
        '.lv14-created{filter:drop-shadow(0 0 20px rgba(255,201,77,.5)) drop-shadow(0 10px 16px rgba(0,0,0,.42));}',
        '.lv14-carried{filter:drop-shadow(0 0 14px rgba(120,180,255,.75)) drop-shadow(0 10px 16px rgba(0,0,0,.42));}',
        '.lv14-bounce{animation:lv14-bounce .5s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv14-bounce{0%{transform:scale(1.24) rotate(8deg) translateY(-10px);}',
        ' 42%{transform:scale(.9) rotate(-5deg) translateY(3px);}',
        ' 74%{transform:scale(1.05) rotate(2deg) translateY(-1px);}100%{transform:scale(1) rotate(0);}}',
        '.lv14-grab{filter:drop-shadow(0 0 22px rgba(255,212,92,.9)) brightness(1.08);}'
      ].join(''));

      scene = document.createElement('div');
      scene.className = 'lv14-scene';
      scene.dataset.phase = '1';
      scene.dataset.qa = 'l14';
      ctx.root.appendChild(scene);

      function rootRect() { return ctx.root.getBoundingClientRect(); }
      function toLocal(clientX, clientY) {
        var r = rootRect();
        return { x: clientX - r.left, y: clientY - r.top };
      }
      function clampPt(x, y) {
        return {
          x: OS.clamp(x, 84, W - 84),
          y: OS.clamp(y, 96, H - 116)
        };
      }
      function setPhase(p) {
        phase = p;
        scene.dataset.phase = String(p);
      }

      /* ---------------- 阶段 1：右键新建 ---------------- */
      function openMenuAt(x, y) {
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
                {
                  id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder',
                  onSelect: function () { createFolder(); }
                }
              ]
            },
            { separator: true },
            { id: 'personalize', label: '个性化', icon: 'gear', onSelect: function () { NF.Audio.play('deny'); } }
          ]
        });
      }

      function createFolder() {
        if (folder || completed) return;
        OS.closeMenus();
        var fx = Math.round(W / 2 - 38 + OS.rand(-26, 26));
        var fy = Math.round(H * 0.42 - 44 + OS.rand(-18, 18));
        folder = ctx.createdFolder({ x: fx, y: fy, label: '新建文件夹', testid: 'created-folder' });
        folder.classList.add('lv14-created');
        folder.dataset.state = 'idle';
        // 注意：.nf-folder 自带的 folder-pop 动画是 fill:both，会一直覆盖拖拽时的内联 transform，
        // 出场动画结束后必须清掉，否则后面拖不动（视觉上不跟手）。
        ctx.timer(560, function () { if (folder) folder.style.animation = 'none'; });
        NF.Audio.play('pop');
        var c = OS.center(folder);
        NF.FX.burst(c.x, c.y, {
          count: 22, colors: ['#ffc94d', '#ffe08a', '#ffffff'], speed: 6, gravity: 0.18
        });
        NF.FX.sparkle(c.x, c.y);
        setPhase(2);
        ctx.timer(1900, startRival);
      }

      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (completed || folder) return;
        openMenuAt(e.clientX, e.clientY);
      });

      /* ---------------- 阶段 2：rival 冲进来抢走 ---------------- */
      function buildRival() {
        if (rival) return;
        rival = document.createElement('div');
        rival.className = 'lv14-rival';
        rival.dataset.t = 'rival';
        rival.dataset.hits = '0';
        rival.dataset.stunned = '0';
        rival.dataset.carried = '0';

        rivalIco = document.createElement('div');
        rivalIco.className = 'lv14-rival-ico';
        rivalIco.innerHTML = NF.icons.svg('cursor');
        rival.appendChild(rivalIco);

        var stars = document.createElement('div');
        stars.className = 'lv14-stars';
        stars.textContent = '✦ ✧ ✦';
        rival.appendChild(stars);

        scene.appendChild(rival);
      }

      function buildSafeZone() {
        if (safeZone) return;
        safeZone = document.createElement('div');
        safeZone.className = 'lv14-safe';
        safeZone.dataset.t = 'safe-zone';
        var ico = document.createElement('div');
        ico.className = 'lv14-safe-ico';
        ico.innerHTML = NF.icons.svg('folder');
        safeZone.appendChild(ico);
        scene.appendChild(safeZone);
      }

      function startRival() {
        if (completed || phase !== 2 || !folder) return;
        buildRival();
        buildSafeZone();
        pos = { x: W + 70, y: H + 70 };
        rival.style.transform = 'translate3d(' + (pos.x - 36) + 'px,' + (pos.y - 36) + 'px,0)';
        var rr = rootRect();
        var fr = OS.rect(folder);
        targetPt = { x: fr.left - rr.left + fr.width / 2, y: fr.top - rr.top + fr.height / 2 };
        targetAt = performance.now();
        NF.Audio.play('alarm', { volume: 0.24 });
        NF.Audio.play('whoosh', { volume: 0.6 });
        NF.FX.ripple(W - 60, H - 50, { color: 'rgba(120,180,255,.5)', radius: 80 });
        setPhase(2);
      }

      function grabFolder() {
        if (completed || carried || !folder) return;
        carried = true;
        stunned = false;
        hits = 0;
        rival.dataset.hits = '0';
        rival.dataset.stunned = '0';
        rival.dataset.carried = '1';
        folder.dataset.state = 'carried';
        folder.classList.remove('lv14-created');
        folder.classList.add('lv14-carried');
        folder.style.pointerEvents = 'none';
        NF.Audio.play('whoosh', { volume: 0.5 });
        NF.Audio.play('giggle', { volume: 0.32 });
        var c = OS.center(folder);
        NF.FX.sparkle(c.x, c.y, '#8ec4ff');
        setPhase(3);
        targetAt = 0;
        ctx.timer(750, function () { if (!completed && carried) ctx.replayHint(); });
      }

      /* ---------------- rival 运动 ---------------- */
      function placeRival(now, vx, vy) {
        rival.style.transform = 'translate3d(' + (pos.x - 36) + 'px,' + (pos.y - 36) + 'px,0)';
        rivalIco.style.transform = 'scaleX(' + (vx < -24 ? -1 : 1) + ') rotate(' +
          OS.clamp(vy * 0.022, -14, 14).toFixed(1) + 'deg)';
        if (now - trailLast > 62 && Math.hypot(vx, vy) > 130) {
          trailLast = now;
          var t = document.createElement('div');
          t.className = 'lv14-trail';
          t.style.left = pos.x + 'px';
          t.style.top = pos.y + 'px';
          scene.appendChild(t);
          trailNodes.push({ el: t, t: now });
          if (trailNodes.length > 26) {
            var old = trailNodes.shift();
            if (old.el.parentNode) old.el.remove();
          }
        }
      }

      function followFolder() {
        if (!folder || !carried) return;
        var fx = OS.clamp(pos.x - 38, 4, W - 88);
        var fy = OS.clamp(pos.y + 14, 4, H - 122);
        folder.style.left = fx + 'px';
        folder.style.top = fy + 'px';
        folder.style.transform = 'rotate(' + OS.clamp((targetPt.x - pos.x) * 0.018, -10, 10).toFixed(1) + 'deg)';
      }

      function tick(now) {
        if (!lastTs) lastTs = now;
        var dt = Math.min(0.05, (now - lastTs) / 1000 || 0.016);
        lastTs = now;
        if (!rival || completed || stunned) return;

        if (phase === 2) {
          var rdx = targetPt.x - pos.x;
          var rdy = targetPt.y - pos.y;
          var rd = Math.hypot(rdx, rdy) || 1;
          if (rd < 58) { grabFolder(); return; }
          var rsp = 1000;
          pos.x += rdx / rd * rsp * dt;
          pos.y += rdy / rd * rsp * dt;
          placeRival(now, rdx / rd * rsp, rdy / rd * rsp);
          return;
        }

        if (phase === 3 && carried) {
          var mx = lastMouse.x - pos.x;
          var my = lastMouse.y - pos.y;
          var md = Math.hypot(mx, my);
          var speed = 150;
          if (performance.now() < fleeBoostUntil) speed += 140;
          if (md < 120) {
            // 玩家靠近：稍微加速逃开，但不会像以前那样瞬间弹射
            speed = Math.max(speed, 360);
            var ang = Math.atan2(pos.y - lastMouse.y, pos.x - lastMouse.x) + OS.rand(-0.42, 0.42);
            targetPt = clampPt(pos.x + Math.cos(ang) * 250, pos.y + Math.sin(ang) * 250);
            targetAt = now;
          } else if (!targetAt || now - targetAt > targetTtl) {
            targetPt = clampPt(OS.rand(110, W - 110), OS.rand(120, H - 150));
            targetAt = now;
            targetTtl = OS.rand(900, 1800);
          }
          var dx = targetPt.x - pos.x;
          var dy = targetPt.y - pos.y;
          var d = Math.hypot(dx, dy) || 1;
          var vx = dx / d * speed;
          var vy = dy / d * speed;
          pos.x = OS.clamp(pos.x + vx * dt, 76, W - 76);
          pos.y = OS.clamp(pos.y + vy * dt, 100, H - 112);
          placeRival(now, vx, vy);
          followFolder();
        }
      }
      ctx.raf(tick);

      /* 尾迹节点定期清理（rAF 里已经限量，这里再兜底） */
      ctx.interval(420, function () {
        var now = performance.now();
        trailNodes = trailNodes.filter(function (t) {
          if (now - t.t > 700) {
            if (t.el.parentNode) t.el.remove();
            return false;
          }
          return true;
        });
      });

      /* ---------------- 点击 rival：敲晕（放宽：rival 周围 120px 都算命中） ---------------- */
      function onRootDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (completed || phase !== 3 || stunned || !carried || !rival) return;
        var c = OS.center(rival);
        if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > 120) return;
        e.stopPropagation();
        registerHit();
      }
      ctx.on(ctx.root, 'pointerdown', onRootDown);

      function registerHit() {
        if (completed || phase !== 3 || stunned || !carried) return;
        hits += 1;
        rival.dataset.hits = String(hits);
        if (hits >= 2) { startStun(); return; }
        // 第一下只把它吓一跳：尖叫 + 短时间加速逃跑
        fleeBoostUntil = performance.now() + 520;
        NF.Audio.play('boing', { volume: 0.6 });
        NF.Audio.play('giggle', { volume: 0.3 });
        rivalIco.classList.remove('lv14-hit');
        void rivalIco.offsetWidth;
        rivalIco.classList.add('lv14-hit');
        var c = OS.center(rival);
        NF.FX.burst(c.x, c.y, {
          count: 10, colors: ['#8ec4ff', '#ffffff'], speed: 4, gravity: 0.1, life: 460
        });
        ctx.timer(320, function () { if (rivalIco) rivalIco.classList.remove('lv14-hit'); });
      }

      function startStun() {
        if (completed || stunned) return;
        stunned = true;
        carried = false;
        rival.dataset.stunned = '1';
        rival.classList.add('lv14-stunned');
        // 眩晕时别让 rival 挡住掉在地上的文件夹（它正好在文件落点上时也一样）
        rival.style.pointerEvents = 'none';
        NF.Audio.play('error', { volume: 0.6 });
        NF.Audio.play('robot', { volume: 0.4 });
        var c = OS.center(rival);
        NF.FX.burst(c.x, c.y, {
          count: 24, colors: ['#8ec4ff', '#ffffff', '#ffd45c'], speed: 8, gravity: 0.24
        });
        NF.FX.shake(4, 220);

        // 文件夹掉到桌面空白处（带一点弹跳），顺便避开 rival 的位置
        var dropHome = null;
        for (var tries = 0; tries < 24; tries++) {
          var cand = {
            x: Math.round(OS.rand(W * 0.26, W * 0.6)),
            y: Math.round(OS.rand(H * 0.18, H * 0.5))
          };
          if (Math.hypot(cand.x + 38 - pos.x, cand.y + 44 - pos.y) > 150) { dropHome = cand; break; }
        }
        if (!dropHome) dropHome = { x: Math.round(W * 0.3), y: Math.round(H * 0.3) };
        if (folder) {
          folder.dataset.state = 'dropping';
          folder.classList.remove('lv14-carried');
          folder.style.pointerEvents = 'none';
          folder.style.transform = '';
          folder.style.transition = 'left .42s cubic-bezier(.34,1.56,.64,1),top .42s cubic-bezier(.34,1.56,.64,1)';
          folder.style.left = dropHome.x + 'px';
          folder.style.top = dropHome.y + 'px';
        }
        setPhase(4);
        NF.Audio.play('thud', { volume: 0.55 });

        ctx.timer(340, function () {
          if (completed || !folder || phase !== 4) return;
          folder.style.transition = '';
          folder.classList.add('lv14-bounce');
          folder.dataset.state = 'dropped';
          ctx.timer(520, function () { if (folder) folder.classList.remove('lv14-bounce'); });
          folder.style.pointerEvents = 'auto';
          folder.style.zIndex = '42';   // 眩晕期间文件夹盖在 rival 上方，保证能拖
          var fc = OS.center(folder);
          NF.FX.dust(fc.x, fc.y);
          bindFolderDrag();
          // 从"真的可以拖"开始算 3.4 秒的黄金时间
          stunTimer = ctx.timer(3400, recoverRival);
        });
      }

      function recoverRival() {
        if (completed || phase !== 4) return;
        stunned = false;
        carried = true;
        hits = 0;
        rival.classList.remove('lv14-stunned');
        rival.dataset.stunned = '0';
        rival.dataset.hits = '0';
        rival.dataset.carried = '1';
        rival.style.pointerEvents = '';
        if (folder) {
          folder.dataset.state = 'carried';
          folder.classList.remove('lv14-grab');
          folder.classList.add('lv14-carried');
          folder.style.zIndex = '';
          folder.style.transition = '';
          folder.style.transform = '';
        }
        targetAt = 0;
        setPhase(3);
        NF.Audio.play('whoosh', { volume: 0.5 });
        NF.Audio.play('giggle', { volume: 0.3 });
        followFolder();
        ctx.timer(900, function () { if (!completed && carried) ctx.replayHint(); });
      }

      /* ---------------- 阶段 4：拖文件夹进安全区 ---------------- */
      function bindFolderDrag() {
        if (dragHandle || !folder) return;
        dragHandle = OS.makeDraggable(folder, {
          threshold: 3,
          canStart: function () { return phase === 4 && !completed; },
          onStart: function () {
            draggingFolder = true;
            folder.style.transition = '';
            folder.style.animation = 'none';
            folder.classList.remove('lv14-bounce');
            folder.classList.add('lv14-grab');
            NF.Audio.play('paper', { volume: 0.45 });
          },
          onMove: function (e, st) {
            folder.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' +
              OS.clamp(st.dx * 0.04, -9, 9).toFixed(1) + 'deg)';
            if (safeZone) {
              var hot = OS.overlapRatio(folder, safeZone) > 0.16;
              safeZone.classList.toggle('is-hot', hot);
            }
          },
          onEnd: function (e, st) {
            draggingFolder = false;
            if (!folder) return;
            folder.classList.remove('lv14-grab');
            if (safeZone) safeZone.classList.remove('is-hot');
            if (completed || phase !== 4) return;
            var fc = OS.center(folder);
            var sr = OS.rect(safeZone);
            // 放宽判定：中心进入安全区外扩 40px / 重叠 18% / 离安全区中心 140px 内都算送达
            var inside = fc.x > sr.left - 40 && fc.x < sr.right + 40 && fc.y > sr.top - 40 && fc.y < sr.bottom + 40;
            var ov = safeZone ? OS.overlapRatio(folder, safeZone) : 0;
            var centerDist = Math.hypot(fc.x - (sr.left + sr.width / 2), fc.y - (sr.top + sr.height / 2));
            if (inside || ov > 0.18 || centerDist < 140) { deliver(); return; }
            // 没放进去：留在原地继续尝试
            var nx = (parseFloat(folder.style.left) || 0) + st.dx;
            var ny = (parseFloat(folder.style.top) || 0) + st.dy;
            folder.style.left = OS.clamp(nx, 2, W - 92) + 'px';
            folder.style.top = OS.clamp(ny, 2, H - 126) + 'px';
            folder.style.transform = '';
            var c2 = OS.center(folder);
            NF.Audio.play('thud', { volume: 0.4 });
            NF.FX.dust(c2.x, c2.y);
          }
        });
      }

      function deliver() {
        if (completed) return;
        completed = true;
        setPhase(5);
        clearTimeout(stunTimer);
        if (dragHandle) { dragHandle.destroy(); dragHandle = null; }
        if (folder) {
          folder.style.pointerEvents = 'none';
          folder.classList.remove('lv14-grab');
          var sc = OS.center(safeZone);
          var rr = rootRect();
          folder.style.transition = 'left .42s cubic-bezier(.34,1.56,.64,1),top .42s cubic-bezier(.34,1.56,.64,1),transform .42s cubic-bezier(.34,1.56,.64,1)';
          folder.style.left = Math.round(sc.x - rr.left - 38) + 'px';
          folder.style.top = Math.round(sc.y - rr.top - 42) + 'px';
          folder.style.transform = 'scale(.78)';
        }
        safeZone.classList.add('is-sealed');
        NF.Audio.play('snap', { volume: 0.9 });
        NF.Audio.play('sparkle', { volume: 0.9 });
        NF.FX.flash('rgba(255,247,214,.4)', 220);
        var sc2 = OS.center(safeZone);
        NF.FX.burst(sc2.x, sc2.y, {
          count: 40, colors: ['#7ef0c0', '#ffd45c', '#ffffff', '#8ec4ff'], speed: 10, gravity: 0.22
        });
        NF.FX.confetti({ count: 70 });

        // rival 被弹飞
        if (rival) {
          rival.classList.remove('lv14-stunned');
          rival.dataset.stunned = '0';
          rival.style.transition = 'transform .7s ease, opacity .7s ease';
          rival.style.transform = 'translate3d(' + (pos.x - 36) + 'px,' + (pos.y - 216) + 'px,0) scale(.36) rotate(540deg)';
          rival.style.opacity = '0';
          rival.style.pointerEvents = 'none';
        }
        ctx.timer(620, function () { ctx.complete({ el: folder }); });
      }

      /* ---------------- 鼠标位置（rival 的"玩家靠近"判定） ---------------- */
      ctx.on(window, 'pointermove', function (e) {
        lastMouse = toLocal(e.clientX, e.clientY);
      });

      /* ---------------- 幽灵演示 ---------------- */
      demo = async function () {
        if (completed) return;
        OS.closeMenus();
        if (phase === 1) {
          var px = Math.round(W * 0.54);
          var py = Math.round(H * 0.4);
          menuByHint = true;
          try {
            await NF.Ghost.play([
              { move: [px, py], dur: 420 },
              {
                click: 'right', target: [px, py],
                do: function () { if (!completed && !folder) openMenuAt(px, py); }
              },
              { wait: 260 },
              { move: '[data-t="menu-item-new"]', dur: 520 },
              { highlight: '[data-t="menu-item-new"]', dur: 560 },
              {
                do: function () {
                  var root = OS.rootMenu();
                  if (!root) return;
                  for (var i = 0; i < root.itemEls.length; i++) {
                    if (root.itemEls[i].item.id === 'new') { root.openSub(root.itemEls[i].item); return; }
                  }
                }
              },
              { wait: 200 },
              { highlight: '[data-t="menu-item-folder"]', dur: 720 },
              { click: 'left', target: '[data-t="menu-item-folder"]' },
              { wait: 160 }
            ]);
          } finally {
            if (menuByHint) { OS.closeMenus(); menuByHint = false; }
          }
          return;
        }
        if (phase === 2) {
          await NF.Ghost.play([
            { move: '[data-t="rival"]', dur: 420 },
            { highlight: '[data-t="rival"]', dur: 640 }
          ]);
          return;
        }
        if (phase === 3) {
          await NF.Ghost.play([
            { move: '[data-t="rival"]', dur: 460 },
            { highlight: '[data-t="rival"]', dur: 620 },
            { click: 'left', target: '[data-t="rival"]', after: 320 },
            { click: 'left', target: '[data-t="rival"]', after: 280 },
            { wait: 200 },
            { move: '[data-t="safe-zone"]', dur: 520 },
            { highlight: '[data-t="safe-zone"]', dur: 780 }
          ]);
          return;
        }
        if (phase === 4) {
          await NF.Ghost.play([
            { highlight: '[data-t="created-folder"]', dur: 460 },
            { drag: { from: '[data-t="created-folder"]', to: '[data-t="safe-zone"]', dur: 900, after: 180 } },
            { highlight: '[data-t="safe-zone"]', dur: 560 }
          ]);
        }
      };
      ctx.hint(demo);

      ctx.onCleanup(function () {
        OS.closeMenus();
        if (dragHandle) { try { dragHandle.destroy(); } catch (e) {} dragHandle = null; }
        clearTimeout(stunTimer);
        trailNodes.forEach(function (t) { if (t.el.parentNode) t.el.remove(); });
        trailNodes = [];
        if (folder && folder.parentNode) folder.remove();
        if (rival && rival.parentNode) rival.remove();
        if (safeZone && safeZone.parentNode) safeZone.remove();
      });
    }
  });
})();
