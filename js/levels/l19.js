/* 第 19 关：源代码
   —— 游戏露出了自己"新建文件夹"的源代码，可创建文件夹的那行代码坏了。
   1. 编辑器窗口里有两个空槽：slot-folder（第 2 行）与 slot-run（运行键上方）；
   2. 下方零件托盘里 3 个可拖动 token：token-folder / token-play（正确）与 token-bug（干扰）；
   3. 把正确 token 拖进对应槽（吸附），错误 token → 槽抖动 + error + 弹回；
   4. 两个槽都正确后运行键亮起，点击运行 → 绿色扫描线 + createFolder() 色块滚过 → 生成文件夹。 */
(function () {
  'use strict';
  var ID = 19;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'code',
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var EW = Math.min(760, Math.max(560, W - 140));
      var EH = 386;
      var EX = Math.round((W - EW) / 2);
      var EY = Math.max(48, Math.round(H * 0.08));
      var TW = 560;
      var TH = 122;
      var TX = Math.round((W - TW) / 2);
      var TY = EY + EH + 30;

      var completed = false;
      var running = false;
      var folderPlaced = false;
      var playPlaced = false;
      var folder = null;

      var editor = null;
      var tray = null;
      var runBtn = null;
      var slotFolder = null;
      var slotRun = null;
      var tokenFolder = null;
      var tokenPlay = null;
      var tokenBug = null;

      ctx.style([
        /* ---------- 背景光晕 ---------- */
        '.lv19-glow{position:absolute;left:50%;top:38%;width:900px;height:520px;margin:-260px 0 0 -450px;',
        ' pointer-events:none;z-index:0;border-radius:50%;filter:blur(30px);',
        ' background:radial-gradient(ellipse 50% 42% at 50% 45%,rgba(126,240,192,.10),transparent 66%),',
        ' radial-gradient(ellipse 46% 40% at 34% 62%,rgba(91,124,250,.14),transparent 68%);}',

        /* ---------- 代码编辑器窗口 ---------- */
        '.lv19-editor{position:absolute;z-index:12;border-radius:14px;overflow:hidden;',
        ' background:linear-gradient(165deg,rgba(15,20,38,.985),rgba(9,12,26,.99));',
        ' border:1px solid rgba(126,240,192,.22);',
        ' box-shadow:0 34px 74px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04),inset 0 0 60px rgba(0,0,0,.4);',
        ' transition:border-color .25s ease,box-shadow .25s ease;}',
        '.lv19-editor.is-running{border-color:rgba(126,240,192,.6);',
        ' box-shadow:0 34px 74px rgba(0,0,0,.6),0 0 46px rgba(126,240,192,.3),inset 0 0 60px rgba(0,0,0,.4);}',
        '.lv19-editor.is-done{border-color:rgba(126,240,192,.95);}',
        '.lv19-bar{position:relative;display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;',
        ' background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.06);}',
        '.lv19-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}',
        '.lv19-dot-r{background:#ff6b8a;}',
        '.lv19-dot-y{background:#ffd45c;}',
        '.lv19-dot-g{background:#7ef0c0;}',
        '.lv19-filename{margin-left:10px;font-family:var(--mono);font-size:12px;color:rgba(226,236,255,.62);letter-spacing:.06em;}',
        '.lv19-dirty{margin-left:auto;width:7px;height:7px;border-radius:50%;background:rgba(255,212,92,.75);',
        ' box-shadow:0 0 8px rgba(255,212,92,.7);}',
        '.lv19-code{position:relative;padding:20px 16px 18px;font-family:var(--mono);font-size:15px;',
        ' color:#dfe7ff;overflow:hidden;height:calc(100% - 34px);}',
        /* 编辑器空白处的抽象代码行（纯装饰，营造"源代码"质感） */
        '.lv19-code::before{content:"";position:absolute;left:52px;right:130px;top:196px;bottom:24px;',
        ' pointer-events:none;opacity:.07;z-index:1;',
        ' background:repeating-linear-gradient(180deg,rgba(190,214,255,.95) 0 7px,transparent 7px 26px);',
        ' -webkit-mask-image:linear-gradient(90deg,#000 8%,rgba(0,0,0,.35) 62%,transparent);',
        ' mask-image:linear-gradient(90deg,#000 8%,rgba(0,0,0,.35) 62%,transparent);}',
        '.lv19-line{display:flex;align-items:center;gap:9px;min-height:58px;position:relative;z-index:2;}',
        '.lv19-ln{width:22px;flex:0 0 auto;text-align:right;font-size:11px;color:rgba(160,175,215,.38);user-select:none;}',
        '.lv19-kw{color:#c792ea;font-weight:700;letter-spacing:.03em;}',
        '.lv19-kw.lv19-ret{color:#ff9db5;}',
        '.lv19-punct{color:rgba(200,214,255,.5);}',
        '.lv19-chip{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:9px;',
        ' font-size:14px;font-weight:700;letter-spacing:.04em;white-space:nowrap;}',
        '.lv19-chip-ico{width:20px;height:20px;display:inline-flex;}',
        '.lv19-chip-ico svg{width:100%;height:100%;}',
        '.lv19-chip-name{background:linear-gradient(160deg,rgba(255,201,77,.24),rgba(255,176,32,.12));',
        ' border:1px solid rgba(255,201,77,.42);color:#ffe3a0;box-shadow:0 0 22px rgba(255,201,77,.12);}',
        '.lv19-chip-ret{background:rgba(255,157,181,.1);border:1px solid rgba(255,157,181,.3);color:#ffc2d2;height:32px;padding:0 9px;}',
        '.lv19-chip-ret .nf-ico{width:19px;height:19px;}',
        /* 空槽 */
        '.lv19-slot{position:relative;display:inline-flex;align-items:center;justify-content:center;',
        ' border:2px dashed rgba(126,240,192,.42);border-radius:10px;background:rgba(126,240,192,.045);',
        ' transition:border-color .2s ease,box-shadow .2s ease,background .2s ease,transform .2s ease;}',
        '.lv19-slot-folder{width:76px;height:52px;}',
        /* 文件夹形状：左上角加一个虚线小夹舌 */
        '.lv19-slot-folder::before{content:"";position:absolute;left:10px;top:-9px;width:28px;height:11px;pointer-events:none;',
        ' border:2px dashed rgba(126,240,192,.42);border-bottom:none;border-radius:7px 7px 0 0;background:rgba(126,240,192,.05);}',
        '.lv19-slot-folder.is-filled::before{border-color:rgba(126,240,192,.85);border-style:solid;border-bottom:none;',
        ' background:rgba(126,240,192,.12);}',
        '.lv19-slot-folder.is-wrong::before{border-color:rgba(255,93,122,.9);background:rgba(255,93,122,.14);}',
        '.lv19-slot-run-slot{width:66px;height:52px;border-radius:13px;}',
        '.lv19-slot .lv19-slot-ghost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.22;}',
        '.lv19-slot .lv19-slot-ghost svg{width:36px;height:36px;}',
        '.lv19-slot .lv19-slot-hint{font-style:normal;font-size:19px;font-weight:900;color:rgba(126,240,192,.35);}',
        '.lv19-slot.is-filled{border-style:solid;border-color:rgba(126,240,192,.85);background:rgba(126,240,192,.12);',
        ' box-shadow:0 0 22px rgba(126,240,192,.35),inset 0 0 14px rgba(126,240,192,.12);}',
        '.lv19-slot.is-filled svg{width:40px;height:40px;animation:lv19-slot-pop .34s cubic-bezier(.34,1.56,.64,1) both;}',
        '.lv19-slot.is-wrong{border-color:rgba(255,93,122,.9);background:rgba(255,93,122,.14);',
        ' animation:lv19-wrong .34s ease;}',
        '@keyframes lv19-slot-pop{0%{transform:scale(.2) rotate(-8deg);opacity:0;}70%{transform:scale(1.12);opacity:1;}100%{transform:scale(1);}}',
        '@keyframes lv19-wrong{0%,100%{transform:translateX(0);}20%{transform:translateX(-5px) rotate(-1deg);}',
        ' 45%{transform:translateX(5px) rotate(1deg);}70%{transform:translateX(-3px);}}',
        '.lv19-slot.is-hover{border-color:#7ef0c0;box-shadow:0 0 26px rgba(126,240,192,.55);transform:scale(1.04);}',
        /* 运行键 + 槽 */
        '.lv19-run-col{position:absolute;right:22px;bottom:18px;z-index:3;display:flex;flex-direction:column;align-items:center;gap:9px;}',
        '.lv19-run-btn{position:relative;width:68px;height:68px;border-radius:50%;border:1px solid rgba(126,240,192,.3);',
        ' background:radial-gradient(circle at 38% 30%,rgba(52,211,153,.22),rgba(12,18,32,.96) 64%);',
        ' color:#a9f7d4;cursor:pointer;display:flex;align-items:center;justify-content:center;',
        ' opacity:.5;filter:grayscale(.7);transition:opacity .25s ease,filter .25s ease,transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .3s ease;}',
        '.lv19-run-btn svg{width:34px;height:34px;}',
        '.lv19-run-btn:hover{transform:scale(1.05);}',
        '.lv19-run-btn:active{transform:scale(.94);}',
        '.lv19-run-btn.is-ready{opacity:1;filter:none;border-color:rgba(126,240,192,.85);',
        ' box-shadow:0 0 30px rgba(126,240,192,.55),inset 0 0 22px rgba(126,240,192,.2);',
        ' animation:lv19-ready .9s ease-in-out infinite;}',
        '@keyframes lv19-ready{0%,100%{transform:translateY(0) rotate(-2deg);}50%{transform:translateY(-4px) rotate(2deg);}}',
        '.lv19-run-btn.is-running{pointer-events:none;opacity:1;filter:none;animation:lv19-running-btn .5s linear infinite;}',
        '@keyframes lv19-running-btn{0%,100%{box-shadow:0 0 20px rgba(126,240,192,.4);}50%{box-shadow:0 0 44px rgba(126,240,192,.9);}}',
        '.lv19-run-btn.is-denied{animation:lv19-wrong .34s ease;}',
        /* 扫描线 / 运行代码块 */
        '.lv19-scan{position:absolute;left:12px;right:12px;top:0;height:3px;border-radius:3px;z-index:4;opacity:0;pointer-events:none;',
        ' background:linear-gradient(90deg,transparent,#7ef0c0 24%,#e6fff5 50%,#7ef0c0 76%,transparent);',
        ' box-shadow:0 0 22px rgba(126,240,192,.9);}',
        '.lv19-editor.is-running .lv19-scan{opacity:1;animation:lv19-scan 1s cubic-bezier(.3,.7,.4,1) forwards;}',
        '@keyframes lv19-scan{0%{top:34px;opacity:0;}12%{opacity:1;}88%{opacity:1;}100%{top:calc(100% - 6px);opacity:0;}}',
        '.lv19-run-chip{position:absolute;left:96px;top:96px;z-index:5;pointer-events:none;opacity:0;}',
        '.lv19-run-chip.show{animation:lv19-runchip 1s ease-out forwards;}',
        '.lv19-run-chip .lv19-chip{background:rgba(126,240,192,.16);border:1px solid rgba(126,240,192,.5);color:#c8ffe9;',
        ' box-shadow:0 0 24px rgba(126,240,192,.35);font-family:var(--mono);}',
        '@keyframes lv19-runchip{0%{opacity:0;transform:translateX(-40px) scale(.86);}',
        ' 16%{opacity:1;transform:translateX(0) scale(1);}80%{opacity:1;transform:translateX(150px);}',
        ' 100%{opacity:0;transform:translateX(210px) scale(.92);}}',
        /* ---------- 零件托盘 ---------- */
        '.lv19-tray{position:absolute;z-index:10;border-radius:14px;display:flex;align-items:center;justify-content:center;',
        ' gap:40px;background:linear-gradient(170deg,rgba(24,28,52,.78),rgba(13,16,32,.86));',
        ' border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 48px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06);}',
        '.lv19-token{position:relative;width:86px;height:86px;border-radius:16px;cursor:grab;touch-action:none;',
        ' display:flex;align-items:center;justify-content:center;',
        ' background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02));',
        ' border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 24px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.12);',
        ' transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease,border-color .25s ease,filter .2s ease,opacity .2s ease;}',
        '.lv19-token:hover{transform:translateY(-4px) scale(1.03);box-shadow:0 18px 30px rgba(0,0,0,.46);}',
        '.lv19-token svg{width:52px;height:52px;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4));}',
        '.lv19-token-folder{border-color:rgba(255,201,77,.42);background:linear-gradient(160deg,rgba(255,201,77,.16),rgba(255,176,32,.04));}',
        '.lv19-token-play{border-color:rgba(126,240,192,.44);background:linear-gradient(160deg,rgba(126,240,192,.15),rgba(52,211,153,.04));}',
        '.lv19-token-bug{border-color:rgba(138,108,255,.5);background:linear-gradient(160deg,rgba(138,108,255,.18),rgba(91,63,208,.05));}',
        '.lv19-token.is-hover{border-color:#7ef0c0;box-shadow:0 0 30px rgba(126,240,192,.55);}',
        '.lv19-token.is-wrong{animation:lv19-wrong .34s ease;border-color:#ff5d7a;filter:saturate(2) hue-rotate(-38deg);}',
        '.lv19-token.is-settling{transition:transform .3s cubic-bezier(.34,1.56,.64,1);}',
        '.lv19-token.is-gone{opacity:0;pointer-events:none;}',
        '.lv19-tray::before{content:"";position:absolute;left:18px;right:18px;top:-1px;height:1px;',
        ' background:linear-gradient(90deg,transparent,rgba(126,240,192,.5),transparent);}',
        /* 生成的文件夹 */
        '.lv19-folder{z-index:44;filter:drop-shadow(0 14px 22px rgba(0,0,0,.5)) drop-shadow(0 0 18px rgba(126,240,192,.5));}'
      ].join(''));

      /* ============================================================
         场景
         ============================================================ */

      var glow = document.createElement('div');
      glow.className = 'lv19-glow';
      ctx.root.appendChild(glow);

      function makeEditor() {
        editor = document.createElement('div');
        editor.className = 'lv19-editor';
        editor.dataset.t = 'code-window';
        editor.style.left = EX + 'px';
        editor.style.top = EY + 'px';
        editor.style.width = EW + 'px';
        editor.style.height = EH + 'px';

        var bar = document.createElement('div');
        bar.className = 'lv19-bar';
        bar.innerHTML = '<span class="lv19-dot lv19-dot-r"></span>' +
          '<span class="lv19-dot lv19-dot-y"></span>' +
          '<span class="lv19-dot lv19-dot-g"></span>' +
          '<span class="lv19-filename">新建文件夹.js</span>' +
          '<span class="lv19-dirty"></span>';
        editor.appendChild(bar);

        var code = document.createElement('div');
        code.className = 'lv19-code';

        // 行 1：function + 新建文件夹色块
        var l1 = document.createElement('div');
        l1.className = 'lv19-line';
        l1.innerHTML = '<span class="lv19-ln">1</span>' +
          '<span class="lv19-kw">function</span>' +
          '<span class="lv19-chip lv19-chip-name"><span class="lv19-chip-ico">' +
          NF.icons.svg('folder') + '</span>新建文件夹</span>' +
          '<span class="lv19-punct">() {</span>';
        code.appendChild(l1);

        // 行 2：虚线空槽（文件夹形状）
        var l2 = document.createElement('div');
        l2.className = 'lv19-line';
        var ln2 = document.createElement('span');
        ln2.className = 'lv19-ln';
        ln2.textContent = '2';
        l2.appendChild(ln2);
        var indent = document.createElement('span');
        indent.className = 'lv19-punct';
        indent.textContent = '  ';
        l2.appendChild(indent);
        slotFolder = document.createElement('span');
        slotFolder.className = 'lv19-slot lv19-slot-folder';
        slotFolder.dataset.t = 'slot-folder';
        slotFolder.dataset.filled = '0';
        slotFolder.innerHTML = '<span class="lv19-slot-ghost">' + NF.icons.svg('folder') + '</span>' +
          '<span class="lv19-slot-hint">?</span>';
        l2.appendChild(slotFolder);
        var semi = document.createElement('span');
        semi.className = 'lv19-punct';
        semi.textContent = ';';
        l2.appendChild(semi);
        code.appendChild(l2);

        // 行 3：return 图标
        var l3 = document.createElement('div');
        l3.className = 'lv19-line';
        l3.innerHTML = '<span class="lv19-ln">3</span>' +
          '<span class="lv19-kw lv19-ret">return</span>' +
          '<span class="lv19-chip lv19-chip-ret">' + NF.icons.svg('enterKey') + '</span>' +
          '<span class="lv19-punct">;</span>';
        code.appendChild(l3);

        // 右下角：空槽 + 运行键
        var runCol = document.createElement('div');
        runCol.className = 'lv19-run-col';
        slotRun = document.createElement('span');
        slotRun.className = 'lv19-slot lv19-slot-run-slot';
        slotRun.dataset.t = 'slot-run';
        slotRun.dataset.filled = '0';
        slotRun.innerHTML = '<span class="lv19-slot-ghost">' + NF.icons.svg('play') + '</span>' +
          '<span class="lv19-slot-hint">?</span>';
        runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'lv19-run-btn';
        runBtn.dataset.t = 'run-btn';
        runBtn.dataset.ready = '0';
        runBtn.setAttribute('aria-label', '运行');
        runBtn.innerHTML = NF.icons.svg('play');
        runCol.appendChild(slotRun);
        runCol.appendChild(runBtn);
        code.appendChild(runCol);

        var scan = document.createElement('div');
        scan.className = 'lv19-scan';
        code.appendChild(scan);

        editor.appendChild(code);
        ctx.root.appendChild(editor);
      }

      function makeTray() {
        tray = document.createElement('div');
        tray.className = 'lv19-tray';
        tray.dataset.t = 'token-tray';
        tray.style.left = TX + 'px';
        tray.style.top = TY + 'px';
        tray.style.width = TW + 'px';
        tray.style.height = TH + 'px';

        tokenFolder = makeToken('token-folder', 'folder', 'lv19-token-folder');
        tokenPlay = makeToken('token-play', 'play', 'lv19-token-play');
        tokenBug = makeToken('token-bug', 'bug', 'lv19-token-bug');
        tray.appendChild(tokenFolder);
        tray.appendChild(tokenPlay);
        tray.appendChild(tokenBug);
        ctx.root.appendChild(tray);
      }

      function makeToken(testid, icon, extraCls) {
        var el = document.createElement('div');
        el.className = 'lv19-token ' + extraCls;
        el.dataset.t = testid;
        el.dataset.kind = testid.replace('token-', '');
        el.innerHTML = NF.icons.svg(icon);
        return el;
      }

      /* ============================================================
         拖拽 token → 槽
         ============================================================ */

      function bindToken(token, kind) {
        var dragHandle = OS.makeDraggable(token, {
          threshold: 3,
          canStart: function () {
            return !completed && !running && !token.classList.contains('is-gone');
          },
          onStart: function () {
            token.style.zIndex = '60';
            NF.Audio.play('paper', { volume: 0.5 });
            NF.Audio.play('select', { volume: 0.35 });
          },
          onMove: function (e, st) {
            token.style.transform = 'translate(' + st.dx + 'px,' + st.dy + 'px) rotate(' +
              OS.clamp(st.dx * 0.04, -8, 8).toFixed(2) + 'deg) scale(1.04)';
            var slot = hoverSlot(e.clientX, e.clientY, token);
            [slotFolder, slotRun].forEach(function (s) {
              if (s) s.classList.toggle('is-hover', s === slot && !s.classList.contains('is-filled'));
            });
          },
          onEnd: function (e) {
            token.style.zIndex = '';
            [slotFolder, slotRun].forEach(function (s) { if (s) s.classList.remove('is-hover'); });
            if (completed || running || token.classList.contains('is-gone')) return;
            var slot = hoverSlot(e.clientX, e.clientY, token);
            if (!slot) {
              settleToken(token);
              return;
            }
            if (isCorrect(kind, slot)) snapToken(token, slot, kind);
            else wrongDrop(token, slot);
          }
        });
        ctx.onCleanup(function () { try { dragHandle.destroy(); } catch (e) { /* 忽略 */ } });
      }

      /* 槽命中：指针落在槽附近，或 token 与槽有明显重叠（吸附判定） */
      function hoverSlot(x, y, token) {
        var list = [slotFolder, slotRun];
        var pad = 26;
        for (var i = 0; i < list.length; i++) {
          if (!list[i]) continue;
          var r = OS.rect(list[i]);
          if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return list[i];
          if (token && OS.overlapRatio(token, list[i]) > 0.2) return list[i];
        }
        return null;
      }

      function isCorrect(kind, slot) {
        if (kind === 'bug') return false;
        if (slot === slotFolder) return kind === 'folder';
        if (slot === slotRun) return kind === 'play';
        return false;
      }

      /* 错误：槽抖动 + error + token 弹回 */
      function wrongDrop(token, slot) {
        NF.Audio.play('error', { volume: 0.8 });
        NF.Audio.play('deny', { volume: 0.5 });
        NF.Audio.play('giggle', { volume: 0.18 });
        slot.classList.remove('is-wrong');
        void slot.offsetWidth;
        slot.classList.add('is-wrong');
        token.classList.add('is-wrong');
        NF.FX.shake(5, 220);
        var sc = OS.center(slot);
        NF.FX.ripple(sc.x, sc.y, { color: 'rgba(255,93,122,.6)', radius: 46 });
        ctx.timer(460, function () {
          if (slot) slot.classList.remove('is-wrong');
          if (token) token.classList.remove('is-wrong');
        });
        settleToken(token);
      }

      /* 弹回托盘原位 */
      function settleToken(token) {
        token.style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1)';
        token.style.transform = 'translate(0px,0px) rotate(0deg) scale(1)';
        ctx.timer(340, function () {
          if (!token) return;
          token.style.transition = '';
          token.style.transform = '';
        });
      }

      /* 正确：吸附进槽 */
      function snapToken(token, slot, kind) {
        token.classList.add('is-gone');
        // 清掉拖拽 transform 后按槽中心算吸附终点（元素已透明，不会看到跳变）
        token.style.transform = '';
        var tc = OS.center(token);
        var sc = OS.center(slot);
        token.style.transition = 'transform .2s ease';
        token.style.transform = 'translate(' + (sc.x - tc.x) + 'px,' + (sc.y - tc.y) + 'px) scale(.62)';
        NF.Audio.play('snap', { volume: 0.9 });
        [slotFolder, slotRun].forEach(function (s) { if (s) s.classList.remove('is-hover'); });
        ctx.timer(190, function () {
          slot.classList.add('is-filled');
          slot.dataset.filled = '1';
          slot.innerHTML = NF.icons.svg(kind === 'folder' ? 'folder' : 'play');
          if (kind === 'folder') folderPlaced = true;
          else playPlaced = true;
          var c = OS.center(slot);
          NF.Audio.play('sparkle', { volume: 0.55 });
          NF.FX.burst(c.x, c.y, {
            count: 16, colors: ['#ffc94d', '#7ef0c0', '#ffffff'], speed: 6, gravity: 0.14
          });
          NF.FX.ripple(c.x, c.y, { color: 'rgba(126,240,192,.55)', radius: 52 });
          updateRunReady();
          ctx.timer(320, function () {
            if (!completed && !running) ctx.replayHint();
          });
        });
      }

      function updateRunReady() {
        if (!runBtn || running || completed) return;
        if (folderPlaced && playPlaced) {
          runBtn.classList.add('is-ready');
          runBtn.dataset.ready = '1';
          NF.Audio.play('select', { volume: 0.5 });
          NF.Audio.play('sparkle', { volume: 0.35 });
          var c = OS.center(runBtn);
          NF.FX.ripple(c.x, c.y, { color: 'rgba(126,240,192,.6)', radius: 46 });
        } else {
          runBtn.dataset.ready = '0';
        }
      }

      /* ============================================================
         运行
         ============================================================ */

      function onRunClick() {
        if (completed || running) return;
        if (!(folderPlaced && playPlaced)) {
          NF.Audio.play('deny', { volume: 0.7 });
          runBtn.classList.remove('is-denied');
          void runBtn.offsetWidth;
          runBtn.classList.add('is-denied');
          ctx.timer(420, function () { if (runBtn) runBtn.classList.remove('is-denied'); });
          return;
        }
        runCode();
      }

      function runCode() {
        running = true;
        runBtn.classList.remove('is-ready');
        runBtn.classList.add('is-running');
        runBtn.dataset.ready = '0';
        editor.classList.add('is-running');
        NF.Audio.play('enter', { volume: 0.7 });
        NF.Audio.play('click', { volume: 0.6 });

        // createFolder() 色块从编辑器里滚过
        var chip = document.createElement('div');
        chip.className = 'lv19-run-chip';
        chip.innerHTML = '<span class="lv19-chip"><span class="lv19-chip-ico">' +
          NF.icons.svg('folder') + '</span>createFolder()</span>';
        var codeEl = editor.querySelector('.lv19-code');
        codeEl.appendChild(chip);
        void chip.offsetWidth;
        chip.classList.add('show');
        NF.Audio.play('type', { volume: 0.35 });

        ctx.timer(420, function () {
          var c = OS.center(slotFolder);
          NF.FX.burst(c.x, c.y, {
            count: 18, colors: ['#7ef0c0', '#e6fff5', '#ffffff'], speed: 7, gravity: 0.12
          });
        });
        ctx.timer(760, function () {
          NF.FX.flash('rgba(126,240,192,.42)', 220);
          NF.Audio.play('sparkle', { volume: 0.7 });
          if (editor) editor.classList.add('is-done');
        });
        ctx.timer(930, function () {
          if (chip.parentNode) chip.remove();
          spawnFolder();
        });
      }

      function spawnFolder() {
        if (completed) return;
        completed = true;
        var fx = OS.clamp(Math.round(W / 2 - 38 + OS.rand(-40, 40)), 40, W - 140);
        var fy = OS.clamp(Math.round(Math.min(H - 150, TY + TH + 34)), 40, Math.max(40, H - 160));
        folder = ctx.createdFolder({ x: fx, y: fy, label: '新建文件夹', testid: 'created-folder' });
        folder.classList.add('lv19-folder');
        folder.dataset.qa = 'l19-folder';
        NF.Audio.play('pop');
        NF.Audio.play('sparkle', { volume: 0.6 });
        var c = OS.center(folder);
        NF.FX.burst(c.x, c.y, {
          count: 30, colors: ['#ffc94d', '#7ef0c0', '#ffffff'], speed: 9, gravity: 0.2
        });
        NF.FX.ripple(c.x, c.y, { color: 'rgba(255,212,92,.8)', radius: 70 });
        ctx.timer(560, function () {
          if (completed) ctx.complete({ el: folder, delay: 1400 });
        });
      }

      /* ============================================================
         幽灵演示
         ============================================================ */

      function tokenSteps(token, tokenId, slotId) {
        if (!token || token.classList.contains('is-gone')) return [];
        return [
          { move: '[data-t="' + tokenId + '"]', dur: 420 },
          { highlight: '[data-t="' + tokenId + '"]', dur: 520 },
          { drag: { from: '[data-t="' + tokenId + '"]', to: '[data-t="' + slotId + '"]', dur: 820, after: 200 } }
        ];
      }

      var demo = async function () {
        if (completed || running) return;
        var steps = [];
        if (!folderPlaced) steps = steps.concat(tokenSteps(tokenFolder, 'token-folder', 'slot-folder'));
        if (!playPlaced) steps = steps.concat(tokenSteps(tokenPlay, 'token-play', 'slot-run'));
        if (folderPlaced && playPlaced) {
          steps = steps.concat([
            { move: '[data-t="run-btn"]', dur: 380 },
            { highlight: '[data-t="run-btn"]', dur: 620 },
            { click: 'left', target: '[data-t="run-btn"]', after: 240 }
          ]);
        }
        if (!steps.length) steps = [{ highlight: '[data-t="run-btn"]', dur: 600 }];
        try { await NF.Ghost.play(steps); } catch (err) { /* 忽略 */ }
      };
      ctx.hint(demo);

      /* ============================================================
         启动 & 清理
         ============================================================ */

      makeEditor();
      makeTray();
      bindToken(tokenFolder, 'folder');
      bindToken(tokenPlay, 'play');
      bindToken(tokenBug, 'bug');
      ctx.on(runBtn, 'click', onRunClick);

      ctx.timer(900, function () {
        if (completed || running) return;
        var c = OS.center(tray);
        NF.FX.ripple(c.x, c.y, { color: 'rgba(126,240,192,.28)', radius: 90 });
      });

      ctx.onCleanup(function () {
        completed = true;
        running = false;
        folder = null;
        tokenFolder = tokenPlay = tokenBug = null;
        slotFolder = slotRun = null;
        editor = null;
        tray = null;
        runBtn = null;
      });

      ctx.qa('l19', ctx.root);
    }
  });
})();
