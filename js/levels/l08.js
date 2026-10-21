/* 第 8 关：三维折叠（加难版）
   三个阶段：
   1. 把发光前封面拖到摇摆的后封面上；
   2. 用 ←/→ 旋转前封面，把卡扣对准后封面上的缺口，再合上；
   3. 文件夹会自己弹开，按住前封面 1.5 秒把它压住。
*/
(function () {
  'use strict';
  var ID = 8;
  var OS = NF.OS;
  var demo = null;

  NF.Game.registerLevel({
    id: ID,
    icon: 'folder',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);
      var reduced = OS.isReducedMotion();

      var FW = 280;
      var FH = 204;
      var GW = 300;
      var GH = 220;

      var phase = 1;
      var busy = false;
      var completed = false;
      var holding = false;
      var holdTimer = 0;
      var holdRaf = 0;
      var angle = 0;
      var targetAngle = 0;
      var aligned = false;
      var frontHome = { x: 0, y: 0 };
      var frontHandle = null;
      var group = null;
      var bob = null;
      var back = null;
      var front = null;
      var stage = null;
      var dial = null;
      var holdRing = null;

      ctx.style([
        '.lv8-stage{position:absolute;inset:0;overflow:hidden;perspective:1200px;',
        ' perspective-origin:calc(50% + var(--px,0px)) calc(44% + var(--py,0px));}',
        '.lv8-dim{position:absolute;inset:0;z-index:0;pointer-events:none;',
        ' background:radial-gradient(ellipse 72% 62% at 50% 44%,rgba(10,8,26,.16),rgba(5,3,14,.84));}',
        '.lv8-floor{position:absolute;left:-30%;width:160%;bottom:-16%;height:72%;z-index:0;pointer-events:none;',
        ' background-image:linear-gradient(rgba(140,168,255,.35) 1px,transparent 1px),',
        ' linear-gradient(90deg,rgba(140,168,255,.35) 1px,transparent 1px);background-size:64px 64px;',
        ' transform:perspective(520px) rotateX(62deg);transform-origin:50% 100%;opacity:.14;',
        ' -webkit-mask-image:linear-gradient(180deg,transparent,#000 48%);mask-image:linear-gradient(180deg,transparent,#000 48%);}',
        '.lv8-aura{position:absolute;z-index:1;border-radius:50%;pointer-events:none;filter:blur(26px);',
        ' background:radial-gradient(circle,rgba(255,201,77,.22),transparent 68%);',
        ' animation:lv8-aura 4.2s ease-in-out infinite alternate;}',
        '@keyframes lv8-aura{from{opacity:.4;transform:scale(.92);}to{opacity:.9;transform:scale(1.1);}}',
        /* 3D 文件夹本体（后封面） */
        '.lv8-group{position:absolute;width:' + GW + 'px;height:' + GH + 'px;z-index:2;transform-style:preserve-3d;',
        ' transform:rotateX(var(--rx,-10deg)) rotateY(var(--ry,16deg));transition:transform .25s ease-out;will-change:transform;}',
        '.lv8-bob{position:absolute;inset:0;transform-style:preserve-3d;animation:lv8-bob 7s ease-in-out infinite alternate;}',
        '@keyframes lv8-bob{from{transform:translate3d(0,0,0) rotateZ(-1.1deg);}to{transform:translate3d(0,-16px,0) rotateZ(1.1deg);}}',
        '.lv8-shadow{position:absolute;left:50%;bottom:-46px;width:260px;height:44px;margin-left:-130px;border-radius:50%;',
        ' background:radial-gradient(ellipse,rgba(0,0,0,.62),transparent 70%);filter:blur(8px);transform:translateZ(-30px);}',
        '.lv8-back{position:absolute;inset:0;transform-style:preserve-3d;}',
        '.lv8-sway{position:absolute;inset:0;transform-style:preserve-3d;animation:lv8-sway 5.2s ease-in-out infinite alternate;}',
        '@keyframes lv8-sway{from{transform:rotateY(-11deg);}to{transform:rotateY(11deg);}}',
        '.lv8-tab{position:absolute;left:16px;top:-24px;width:132px;height:32px;border-radius:12px 12px 0 0;',
        ' background:linear-gradient(180deg,#ffe08a,#e8a21a 72%,#d99512);',
        ' box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 -6px 16px rgba(0,0,0,.25);}',
        '.lv8-back-face{position:absolute;inset:0;border-radius:20px;border:1px solid rgba(255,235,180,.55);',
        ' background:linear-gradient(165deg,#f7c64a,#e8a21a 46%,#c9870f);',
        ' box-shadow:0 32px 60px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,240,190,.6),inset 0 -26px 60px rgba(120,70,0,.45);',
        ' transition:box-shadow .3s ease;}',
        '.lv8-back-inner{position:absolute;left:16px;right:16px;top:20px;bottom:16px;border-radius:12px;',
        ' border:1px solid rgba(255,230,160,.28);background:linear-gradient(180deg,rgba(120,70,0,.2),rgba(90,50,0,.4));',
        ' box-shadow:inset 0 4px 18px rgba(60,30,0,.5);}',
        '.lv8-back-label{position:absolute;left:50%;bottom:40px;transform:translateX(-50%);font-size:15px;font-weight:800;',
        ' letter-spacing:.14em;color:rgba(86,50,0,.78);white-space:nowrap;text-shadow:0 1px 0 rgba(255,240,190,.5);}',
        '.lv8-back.lv8-target .lv8-back-face{box-shadow:0 0 0 3px rgba(255,244,200,.85),0 0 64px rgba(255,212,92,.8),',
        ' 0 32px 60px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,240,190,.7);}',
        '.lv8-back.lv8-closed .lv8-back-face{box-shadow:0 0 0 3px rgba(255,248,220,.9),0 0 78px rgba(255,212,92,.9),',
        ' 0 32px 60px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,240,190,.8);}',
        /* 发光的前封面 */
        '.lv8-front{position:absolute;z-index:3;width:' + FW + 'px;height:' + FH + 'px;cursor:grab;touch-action:none;',
        ' will-change:left,top,transform;}',
        '.lv8-front.is-idle{animation:lv8-front-float 5.2s ease-in-out infinite alternate;}',
        '@keyframes lv8-front-float{from{transform:translate3d(0,0,0) rotateZ(-1.5deg);}',
        ' to{transform:translate3d(0,-13px,0) rotateZ(1.5deg);}}',
        '.lv8-front-face{position:absolute;inset:0;border-radius:18px;overflow:hidden;',
        ' border:2px solid rgba(255,246,210,.85);',
        ' background:linear-gradient(150deg,rgba(255,232,150,.96),rgba(255,201,77,.84) 48%,rgba(233,164,30,.92));',
        ' box-shadow:0 26px 60px rgba(0,0,0,.5),0 0 44px rgba(255,201,77,.35),inset 0 0 30px rgba(255,255,255,.4);',
        ' transform:perspective(1000px) rotateY(-20deg) rotateX(8deg) translateZ(30px);',
        ' transition:transform .35s cubic-bezier(.34,1.56,.64,1),box-shadow .3s ease;}',
        '.lv8-front.lv8-dragging{cursor:grabbing;z-index:6;}',
        '.lv8-front.lv8-dragging .lv8-front-face{transform:perspective(1000px) rotateY(-8deg) rotateX(4deg) translateZ(90px) scale(1.05);',
        ' box-shadow:0 42px 80px rgba(0,0,0,.58),0 0 70px rgba(255,212,92,.7),inset 0 0 42px rgba(255,255,255,.55);}',
        '.lv8-front.lv8-near .lv8-front-face{box-shadow:0 0 0 3px rgba(255,244,200,.9),0 0 70px rgba(255,212,92,.85),',
        ' 0 30px 64px rgba(0,0,0,.5),inset 0 0 34px rgba(255,255,255,.5);}',
        '.lv8-front.lv8-settle{transition:left .34s cubic-bezier(.34,1.56,.64,1),top .34s cubic-bezier(.34,1.56,.64,1);}',
        '.lv8-front.lv8-settle .lv8-front-face{transition:transform .5s cubic-bezier(.34,1.56,.64,1),box-shadow .4s ease;',
        ' transform:perspective(1000px) rotateY(0deg) rotateX(0deg) translateZ(4px) scale(.97);',
        ' box-shadow:0 0 0 2px rgba(255,248,220,.7),0 0 50px rgba(255,212,92,.55),0 20px 46px rgba(0,0,0,.45),',
        ' inset 0 0 26px rgba(255,255,255,.45);}',
        '.lv8-front-ico{position:absolute;left:50%;top:26px;width:88px;height:88px;margin-left:-44px;opacity:.32;',
        ' filter:drop-shadow(0 4px 8px rgba(120,70,0,.3));}',
        '.lv8-front-ico svg{display:block;width:100%;height:100%;}',
        '.lv8-front-label{position:absolute;left:0;right:0;bottom:26px;text-align:center;font-size:16px;font-weight:800;',
        ' letter-spacing:.16em;color:rgba(90,52,0,.82);text-shadow:0 1px 0 rgba(255,250,220,.6);}',
        '.lv8-front-shine{position:absolute;inset:-30% -10%;',
        ' background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.5) 47%,transparent 62%);',
        ' animation:lv8-shine 3.8s ease-in-out infinite;}',
        '@keyframes lv8-shine{0%{transform:translateX(-70%);}55%,100%{transform:translateX(70%);}}',
        /* 第二阶段的卡扣转盘 */
        '.lv8-dial{position:absolute;left:50%;top:50%;width:190px;height:190px;margin:-95px 0 0 -95px;z-index:7;',
        ' pointer-events:none;opacity:0;transition:opacity .3s ease;}',
        '.lv8-dial.show{opacity:1;}',
        '.lv8-dial .lv8-dial-ring{position:absolute;inset:0;border-radius:50%;border:2px dashed rgba(255,240,190,.5);',
        ' background:conic-gradient(from calc(var(--target) - 9deg),rgba(255,212,92,.55) 0 18deg,transparent 18deg 360deg);',
        ' box-shadow:0 0 30px rgba(0,0,0,.4),inset 0 0 24px rgba(120,70,0,.4);}',
        '.lv8-dial .lv8-dial-needle{position:absolute;left:50%;top:50%;width:6px;height:78px;margin:-78px 0 0 -3px;',
        ' transform-origin:50% 100%;transform:rotate(var(--angle,0deg));border-radius:3px;',
        ' background:linear-gradient(180deg,#fff8dc,#ffc94d);box-shadow:0 0 12px rgba(255,212,92,.9);transition:transform .16s ease-out;}',
        '.lv8-dial .lv8-dial-knob{position:absolute;left:50%;top:50%;width:78px;height:78px;margin:-39px 0 0 -39px;border-radius:50%;',
        ' border:2px solid rgba(255,248,220,.75);background:rgba(60,35,0,.5);box-shadow:inset 0 0 18px rgba(0,0,0,.5);}',
        '.lv8-dial .lv8-dial-notch{position:absolute;left:50%;top:-7px;width:14px;height:14px;margin-left:-7px;border-radius:3px;',
        ' background:#fff3b0;box-shadow:0 0 12px rgba(255,244,200,.9);transform-origin:7px 102px;transform:rotate(var(--target,0deg));}',
        '.lv8-dial.is-aligned .lv8-dial-ring{border-color:rgba(126,240,192,.9);box-shadow:0 0 26px rgba(126,240,192,.45),inset 0 0 24px rgba(120,70,0,.4);}',
        '.lv8-stage.lv8-aligned .lv8-front-face{box-shadow:0 0 0 3px rgba(126,240,192,.9),0 0 70px rgba(126,240,192,.6),',
        ' 0 26px 60px rgba(0,0,0,.5),inset 0 0 34px rgba(255,255,255,.55);}',
        /* 第三阶段：长按 */
        '.lv8-hold{position:absolute;left:50%;top:50%;width:210px;height:210px;margin:-105px 0 0 -105px;z-index:8;',
        ' pointer-events:none;opacity:0;transition:opacity .2s ease;}',
        '.lv8-hold.show{opacity:1;}',
        '.lv8-hold svg{width:100%;height:100%;transform:rotate(-90deg);}',
        '.lv8-hold .bg{fill:none;stroke:rgba(255,255,255,.18);stroke-width:8;}',
        '.lv8-hold .fg{fill:none;stroke:#ffd45c;stroke-width:8;stroke-linecap:round;',
        ' stroke-dasharray:552;stroke-dashoffset:552;filter:drop-shadow(0 0 8px rgba(255,212,92,.8));}',
        '.lv8-hold-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:30px;font-weight:900;',
        ' color:rgba(255,246,210,.92);text-shadow:0 4px 18px rgba(0,0,0,.6);pointer-events:none;}',
        '.lv8-front.lv8-ajar{animation:lv8-ajar .5s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes lv8-ajar{0%,100%{transform:rotate(0);}35%{transform:rotate(-5deg) translateY(-8px);}70%{transform:rotate(2deg);}}',
        '.lv8-front.lv8-wobble .lv8-front-face{animation:lv8-wobble .45s ease-in-out infinite;}',
        '@keyframes lv8-wobble{0%,100%{transform:perspective(1000px) rotateY(-2deg) rotateX(1deg);}',
        ' 50%{transform:perspective(1000px) rotateY(2.5deg) rotateX(-1.4deg);}}',
        /* 收起飞走 */
        '.lv8-front.lv8-fly{animation:lv8-front-fly .72s cubic-bezier(.3,.7,.4,1) forwards;}',
        '@keyframes lv8-front-fly{0%{opacity:1;transform:translate3d(0,0,0) scale(1) rotateZ(0);}',
        ' 100%{opacity:0;transform:translate3d(0,-56px,0) scale(.12) rotateZ(18deg);}}',
        '.lv8-group.lv8-fly{animation:lv8-group-fly .78s cubic-bezier(.3,.7,.4,1) forwards;}',
        '@keyframes lv8-group-fly{0%{opacity:1;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) scale(1);}',
        ' 100%{opacity:0;transform:rotateX(calc(var(--rx,0deg) + 24deg)) rotateY(calc(var(--ry,0deg) + 46deg))',
        ' translateY(-70px) scale(.12);}}',
        '.lv8-pips{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;gap:8px;z-index:9;}',
        '.lv8-pips i{width:9px;height:9px;border-radius:3px;background:rgba(255,255,255,.22);transition:all .3s ease;}',
        '.lv8-pips i.on{background:#ffd45c;box-shadow:0 0 10px rgba(255,212,92,.8);}'
      ].join(''));

      /* ---------------- 场景 ---------------- */
      stage = document.createElement('div');
      stage.className = 'lv8-stage';

      var dim = document.createElement('div');
      dim.className = 'lv8-dim';
      stage.appendChild(dim);

      var floor = document.createElement('div');
      floor.className = 'lv8-floor';
      stage.appendChild(floor);

      var gx = Math.round((W - 450) / 2);
      var gy = Math.round(H * 0.5 - 150);
      frontHome.x = gx + 170;
      frontHome.y = gy + 95;

      var aura = document.createElement('div');
      aura.className = 'lv8-aura';
      aura.style.left = (gx + GW / 2 - 210) + 'px';
      aura.style.top = (gy + GH / 2 - 190) + 'px';
      aura.style.width = '420px';
      aura.style.height = '380px';
      stage.appendChild(aura);

      group = document.createElement('div');
      group.className = 'lv8-group';
      group.style.left = gx + 'px';
      group.style.top = gy + 'px';

      bob = document.createElement('div');
      bob.className = 'lv8-bob';

      var shadow = document.createElement('div');
      shadow.className = 'lv8-shadow';
      bob.appendChild(shadow);

      var sway = document.createElement('div');
      sway.className = 'lv8-sway';

      back = document.createElement('div');
      back.className = 'lv8-back';
      back.dataset.t = 'd3-back';
      back.innerHTML = '<div class="lv8-tab"></div>' +
        '<div class="lv8-back-face"><div class="lv8-back-inner"></div>' +
        '<div class="lv8-back-label">新建文件夹</div></div>';
      sway.appendChild(back);
      bob.appendChild(sway);
      group.appendChild(bob);
      stage.appendChild(group);

      // 卡扣转盘（阶段 2 才显示）
      dial = document.createElement('div');
      dial.className = 'lv8-dial';
      dial.dataset.t = 'd3-dial';
      dial.dataset.phase = '1';
      dial.innerHTML = '<div class="lv8-dial-ring"></div><div class="lv8-dial-notch"></div>' +
        '<div class="lv8-dial-needle"></div><div class="lv8-dial-knob"></div>';
      stage.appendChild(dial);

      front = document.createElement('div');
      front.className = 'lv8-front is-idle';
      front.dataset.t = 'd3-front';
      front.style.left = frontHome.x + 'px';
      front.style.top = frontHome.y + 'px';
      front.innerHTML = '<div class="lv8-front-face">' +
        '<div class="lv8-front-ico">' + NF.icons.svg('folder') + '</div>' +
        '<div class="lv8-front-label">新建文件夹</div>' +
        '<div class="lv8-front-shine"></div>' +
        '</div>';
      stage.appendChild(front);

      // 长按进度
      holdRing = document.createElement('div');
      holdRing.className = 'lv8-hold';
      holdRing.dataset.t = 'd3-hold';
      holdRing.innerHTML = '<svg viewBox="0 0 200 200"><circle class="bg" cx="100" cy="100" r="88"/>' +
        '<circle class="fg" cx="100" cy="100" r="88"/></svg><div class="lv8-hold-label">✊</div>';
      stage.appendChild(holdRing);

      // 阶段指示（三颗小灯）
      var pips = document.createElement('div');
      pips.className = 'lv8-pips';
      pips.innerHTML = '<i class="on"></i><i></i><i></i>';
      stage.appendChild(pips);
      function setPips() {
        Array.prototype.forEach.call(pips.children, function (p, i) {
          p.classList.toggle('on', i < phase);
        });
      }

      ctx.root.appendChild(stage);
      back.dataset.qa = 'l08-back';
      front.dataset.qa = 'l08-front';

      /* ---------------- 视差 ---------------- */
      function onPointer(e) {
        if (reduced || completed) return;
        var nx = (e.clientX / innerWidth - 0.5) * 2;
        var ny = (e.clientY / innerHeight - 0.5) * 2;
        group.style.setProperty('--rx', (-10 - ny * 6).toFixed(2) + 'deg');
        group.style.setProperty('--ry', (16 + nx * 9).toFixed(2) + 'deg');
        stage.style.setProperty('--px', (nx * 26).toFixed(1) + 'px');
        stage.style.setProperty('--py', (ny * 18).toFixed(1) + 'px');
      }
      ctx.on(document, 'pointermove', onPointer);

      /* ---------------- 基础动作 ---------------- */
      function distToBack() {
        var a = OS.center(front);
        var b = OS.center(back);
        return Math.hypot(a.x - b.x, a.y - b.y);
      }
      function overBack() {
        return OS.overlapRatio(front, back);
      }
      function backCenterLocal() {
        var bc = OS.center(back);
        var rr = OS.rect(ctx.root);
        return { x: bc.x - rr.left, y: bc.y - rr.top };
      }

      function springBack(msg) {
        front.classList.remove('lv8-near');
        back.classList.remove('lv8-target');
        front.classList.add('lv8-settle');
        front.style.left = frontHome.x + 'px';
        front.style.top = frontHome.y + 'px';
        if (msg !== false) NF.Audio.play('thud', { volume: 0.4 });
        NF.Audio.play('giggle', { volume: 0.16 });
        var c = OS.center(back);
        NF.FX.dust(c.x, c.y);
        ctx.timer(430, function () {
          front.classList.remove('lv8-settle');
          if (!completed && !busy) front.classList.add('is-idle');
        });
      }

      function settleToBack() {
        busy = true;
        if (frontHandle) frontHandle.locked = true;
        front.classList.remove('is-idle', 'lv8-near', 'lv8-dragging');
        back.classList.remove('lv8-target');
        front.classList.add('lv8-settle');
        var p = backCenterLocal();
        front.style.left = Math.round(p.x - FW / 2) + 'px';
        front.style.top = Math.round(p.y - FH / 2) + 'px';
        NF.Audio.play('snap', { volume: 0.85 });
      }

      function unlockDrag() {
        busy = false;
        if (frontHandle) frontHandle.locked = false;
        front.classList.remove('lv8-settle', 'is-idle');
        if (phase <= 2) front.classList.add('is-idle');
      }

      /* ---------------- 阶段 1：合上前封面 ---------------- */
      function snapPhase1() {
        settleToBack();
        ctx.timer(360, function () {
          back.classList.add('lv8-closed');
          var c = OS.center(back);
          NF.Audio.play('sparkle', { volume: 0.8 });
          NF.FX.flash('rgba(255,238,180,.35)', 220);
          NF.FX.burst(c.x, c.y, {
            count: 26, colors: ['#ffc94d', '#ffe08a', '#fff', '#8a6cff'], speed: 7, gravity: 0.18
          });
          ctx.timer(420, function () {
            // 又弹开了：进入卡扣对齐阶段
            back.classList.remove('lv8-closed');
            phase = 2;
            dial.dataset.phase = '2';
            setPips();
            targetAngle = OS.pick([-60, -45, -30, -15, 15, 30, 45, 60]);
            angle = 0;
            dial.style.setProperty('--target', targetAngle + 'deg');
            dial.style.setProperty('--angle', angle + 'deg');
            dial.classList.add('show');
            front.classList.remove('lv8-settle');
            front.style.left = frontHome.x + 'px';
            front.style.top = frontHome.y + 'px';
            front.classList.add('is-idle');
            NF.Audio.play('boing');
            NF.Audio.play('giggle', { volume: 0.35 });
            unlockDrag();
            ctx.timer(900, function () { if (!completed) ctx.replayHint(); });
          });
        });
      }

      /* ---------------- 阶段 2：对齐卡扣 ---------------- */
      function updateAlign() {
        aligned = Math.abs(angle - targetAngle) < 1;
        dial.classList.toggle('is-aligned', aligned);
        stage.classList.toggle('lv8-aligned', aligned);
        dial.dataset.aligned = aligned ? '1' : '0';
        dial.dataset.angle = String(angle);
        dial.dataset.target = String(targetAngle);
        dial.style.setProperty('--angle', angle + 'deg');
        if (aligned) NF.Audio.play('tick', { volume: 0.4 });
        else NF.Audio.play('hover', { volume: 0.18 });
      }

      function rotateBy(step) {
        if (phase !== 2 || busy || completed) return;
        angle = OS.clamp(angle + step, -90, 90);
        updateAlign();
      }

      ctx.on(window, 'keydown', function (e) {
        if (phase !== 2 || completed) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          rotateBy(-15);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          rotateBy(15);
        }
      });

      function snapPhase2() {
        settleToBack();
        ctx.timer(380, function () {
          back.classList.add('lv8-closed');
          var c = OS.center(back);
          NF.Audio.play('snap', { volume: 0.95 });
          NF.Audio.play('sparkle', { volume: 0.7 });
          NF.FX.flash('rgba(126,240,192,.32)', 220);
          NF.FX.burst(c.x, c.y, {
            count: 30, colors: ['#7ef0c0', '#ffd45c', '#ffffff'], speed: 8, gravity: 0.16
          });
          ctx.timer(520, function () {
            // 第三阶段：它想自己弹开
            phase = 3;
            dial.dataset.phase = '3';
            dial.classList.remove('show');
            setPips();
            back.classList.remove('lv8-closed');
            front.classList.remove('lv8-settle');
            front.classList.add('lv8-ajar');
            ctx.timer(420, function () { front.classList.remove('lv8-ajar'); });
            NF.Audio.play('boing', { volume: 0.9 });
            NF.Audio.play('giggle', { volume: 0.4 });
            showHold();
            unlockDrag();
            ctx.timer(700, function () { if (!completed) ctx.replayHint(); });
          });
        });
      }

      /* ---------------- 阶段 3：按住它 ---------------- */
      function showHold() {
        holdRing.classList.add('show');
        NF.Audio.play('select', { volume: 0.4 });
      }

      function startHold(e) {
        if (phase !== 3 || busy || completed || holding) return;
        if (e.button !== undefined && e.button !== 0) return;
        holding = true;
        var p = backCenterLocal();
        holdRing.style.left = p.x + 'px';
        holdRing.style.top = p.y + 'px';
        holdRing.classList.add('show');
        front.classList.add('lv8-wobble');
        var fg = holdRing.querySelector('.fg');
        var dur = 1500;
        var t0 = performance.now();
        NF.Audio.play('paper', { volume: 0.4 });
        function tick(now) {
          if (!holding) return;
          var pgs = Math.min(1, (now - t0) / dur);
          fg.style.strokeDashoffset = String(552 * (1 - pgs));
          if (pgs < 1) {
            holdRaf = requestAnimationFrame(tick);
          } else {
            finishHold();
          }
        }
        holdRaf = requestAnimationFrame(tick);
      }

      function cancelHold() {
        if (!holding) return;
        holding = false;
        cancelAnimationFrame(holdRaf);
        front.classList.remove('lv8-wobble');
        var fg = holdRing.querySelector('.fg');
        fg.style.strokeDashoffset = '552';
        holdRing.classList.remove('show');
        if (completed) return;
        front.classList.add('lv8-ajar');
        NF.Audio.play('boing', { volume: 0.8 });
        NF.Audio.play('deny', { volume: 0.4 });
        ctx.timer(500, function () { front.classList.remove('lv8-ajar'); });
        ctx.timer(250, function () { if (phase === 3 && !completed) holdRing.classList.add('show'); });
      }

      function finishHold() {
        if (!holding) return;
        holding = false;
        busy = true;
        completed = true;
        cancelAnimationFrame(holdRaf);
        front.classList.remove('lv8-wobble');
        holdRing.classList.remove('show');
        front.classList.add('lv8-settle');
        NF.Audio.play('snap', { volume: 1 });
        var c = OS.center(back);
        NF.FX.flash('rgba(255,238,180,.55)', 280);
        NF.FX.shake(7, 300);
        NF.FX.confetti({ count: 70 });
        ctx.timer(320, function () {
          NF.FX.sparkle(c.x, c.y);
          NF.Audio.play('success');
          group.classList.add('lv8-fly');
          front.classList.add('lv8-fly');
          ctx.timer(480, function () {
            ctx.complete({ el: back, delay: 1200 });
          });
        });
      }

      ctx.on(front, 'pointerdown', startHold);
      ctx.on(window, 'pointerup', cancelHold);

      /* ---------------- 拖拽 ---------------- */
      frontHandle = OS.makeDraggable(front, {
        threshold: 3,
        canStart: function () { return (phase === 1 || phase === 2) && !busy && !completed; },
        onStart: function () {
          front.classList.remove('is-idle');
          front.classList.add('lv8-dragging');
          NF.Audio.play('hover', { volume: 0.2 });
        },
        onMove: function (e, st) {
          front.style.left = (frontHome.x + st.dx) + 'px';
          front.style.top = (frontHome.y + st.dy) + 'px';
          var near = distToBack() < 210;
          front.classList.toggle('lv8-near', near);
          back.classList.toggle('lv8-target', near);
        },
        onEnd: function () {
          front.classList.remove('lv8-dragging');
          if (completed || busy) return;
          var d = distToBack();
          var ov = overBack();
          if (phase === 1) {
            if (d < 140 || ov > 0.42) snapPhase1();
            else springBack();
          } else if (phase === 2) {
            if (d < 125 || ov > 0.36) {
              if (aligned) snapPhase2();
              else {
                NF.Audio.play('deny');
                dial.classList.add('is-wrong');
                ctx.timer(400, function () { dial.classList.remove('is-wrong'); });
                springBack();
              }
            } else {
              springBack();
            }
          }
        }
      });

      /* ---------------- 幽灵演示（按阶段切换） ---------------- */
      demo = async function () {
        if (completed || busy) return;
        if (phase === 1) {
          await NF.Ghost.play([
            { move: '[data-t="d3-back"]', dur: 540 },
            { highlight: '[data-t="d3-back"]', dur: 650 },
            { move: '[data-t="d3-front"]', dur: 540 },
            { highlight: '[data-t="d3-front"]', dur: 620 },
            { drag: { from: '[data-t="d3-front"]', to: '[data-t="d3-back"]', dur: 950, after: 260 } },
            { wait: 200 }
          ]);
        } else if (phase === 2) {
          await NF.Ghost.play([
            { move: '[data-t="d3-dial"]', dur: 460 },
            { highlight: '[data-t="d3-dial"]', dur: 780 },
            { keys: 'ArrowLeft', dur: 700 },
            { keys: 'ArrowRight', dur: 700 },
            { wait: 150 },
            { drag: { from: '[data-t="d3-front"]', to: '[data-t="d3-back"]', dur: 900, after: 240 } },
            { wait: 150 }
          ]);
        } else {
          holdRing.classList.add('show');
          await NF.Ghost.play([
            { move: '[data-t="d3-back"]', dur: 420 },
            { highlight: '[data-t="d3-hold"]', dur: 620 },
            { hold: '[data-t="d3-back"]', dur: 1500 },
            { wait: 150 }
          ]);
          holdRing.classList.remove('show');
        }
      };
      ctx.hint(demo);

      setPips();
      ctx.qa('l08', ctx.root);
    }
  });
})();
