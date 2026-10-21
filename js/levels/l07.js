/* 第 7 关：命令行 —— 双击终端图标开窗，敲 mkdir 建文件夹；输错只有滑稽报错 */
(function () {
  'use strict';
  var ID = 7;
  var OS = NF.OS;
  var demo = null;

  /* 终端提示符（仿 Windows 路径） */
  var PROMPT = 'C:\\Users\\你\\Desktop>';

  NF.Game.registerLevel({
    id: ID,
    icon: 'terminal',
    hint: function () { if (demo) return demo(); },
    init: function (ctx) {
      var W = ctx.root.clientWidth || innerWidth;
      var H = ctx.root.clientHeight || (innerHeight - 58);

      var win = null;
      var input = null;
      var logEl = null;
      var promptline = null;
      var history = [];
      var histIndex = 0;
      var created = false;
      var completed = false;

      ctx.style([
        '.lv7-term-win{background:rgba(8,13,24,.965);border-color:rgba(126,240,192,.22);}',
        '.lv7-term-win.is-active{border-color:rgba(126,240,192,.42);',
        ' box-shadow:0 0 0 1px rgba(126,240,192,.14),0 28px 70px rgba(0,0,0,.55);}',
        '.lv7-term{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;padding:10px 12px 8px;',
        ' font-family:var(--mono);font-size:13px;color:#cfe8d8;letter-spacing:.01em;',
        ' background:radial-gradient(ellipse at 28% 0%,rgba(126,240,192,.06),transparent 62%),#080d18;}',
        '.lv7-log{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;line-height:1.55;',
        ' white-space:pre-wrap;word-break:break-word;padding-right:4px;scrollbar-width:thin;}',
        '.lv7-log::-webkit-scrollbar{width:6px;}',
        '.lv7-log::-webkit-scrollbar-thumb{background:rgba(126,240,192,.25);border-radius:3px;}',
        '.lv7-line{white-space:pre-wrap;}',
        '.lv7-line.lv7-cmd{color:#e6f2ff;}',
        '.lv7-line.ok{color:#7ef0c0;text-shadow:0 0 10px rgba(126,240,192,.35);}',
        '.lv7-line.err{color:#ff8198;}',
        '.lv7-line.art{color:#ff6b8a;opacity:.9;line-height:1.32;}',
        '.lv7-line.dim{color:rgba(160,190,180,.55);}',
        '.lv7-line.out{color:rgba(200,225,215,.85);}',
        '.lv7-ps{color:#7ef0c0;white-space:pre;flex:0 0 auto;}',
        '.lv7-promptline{display:flex;align-items:center;gap:6px;padding-top:5px;flex:0 0 auto;',
        ' border-top:1px solid rgba(126,240,192,.12);}',
        '.lv7-input{flex:1 1 auto;min-width:0;background:transparent;border:none;outline:none;',
        ' color:#e8fff2;font-family:var(--mono);font-size:13px;line-height:1.5;padding:2px 0;',
        ' caret-color:#7ef0c0;user-select:text;-webkit-user-select:text;letter-spacing:.02em;}',
        '.lv7-input::selection{background:rgba(126,240,192,.3);}',
        '.lv7-created{filter:drop-shadow(0 0 22px rgba(126,240,192,.55)) drop-shadow(0 12px 18px rgba(0,0,0,.45));}',
        '@keyframes lv7-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-5px);}',
        ' 40%{transform:translateX(5px);}60%{transform:translateX(-3px);}80%{transform:translateX(2px);}}'
      ].join(''));

      /* ---------------- 终端窗口 ---------------- */
      function focusInput() {
        if (!input) return;
        try { input.focus({ preventScroll: true }); } catch (e) {
          try { input.focus(); } catch (e2) { /* 忽略 */ }
        }
      }

      function scrollLog() {
        if (!logEl) return;
        try { logEl.scrollTop = logEl.scrollHeight; } catch (e) { /* 忽略 */ }
      }

      function trimLog() {
        if (!logEl) return;
        while (logEl.children.length > 80) logEl.removeChild(logEl.firstElementChild);
      }

      function appendLine(text, cls) {
        if (!logEl) return null;
        var line = document.createElement('div');
        line.className = 'lv7-line' + (cls ? ' ' + cls : '');
        line.textContent = text;
        logEl.appendChild(line);
        trimLog();
        scrollLog();
        return line;
      }

      function echoCommand(cmd) {
        if (!logEl) return;
        var line = document.createElement('div');
        line.className = 'lv7-line lv7-cmd';
        var ps = document.createElement('span');
        ps.className = 'lv7-ps';
        ps.textContent = PROMPT;
        line.appendChild(ps);
        line.appendChild(document.createTextNode(' ' + cmd));
        logEl.appendChild(line);
        trimLog();
        scrollLog();
      }

      function printError(msg) {
        appendLine(msg, 'err');
        appendLine('  (\\_/)\n  ( •_•)  < 咦？\n  /   > >', 'err art');
        if (win && !win.closed) win.shake();
      }

      function printDir() {
        appendLine(' 目录: C:\\Users\\你\\Desktop', 'dim');
        appendLine(' 2026/10/21  10:46    <DIR>          新建文件夹', 'out');
        appendLine(' 2026/10/21  10:46                 0 文档.txt', 'out');
        NF.Audio.play('giggle', { volume: 0.28 });
      }

      function mkdirSuccess(name) {
        created = true;
        appendLine('已创建文件夹: ' + name, 'ok');
        NF.Audio.play('sparkle', { volume: 0.65 });
        ctx.timer(330, function () {
          // 即使玩家在这 0.33 秒内把窗口关了，也照样把文件夹放到桌面上（避免卡死）
          var wr = (win && !win.closed)
            ? OS.rect(win.el)
            : { left: Math.round(W * 0.5), top: Math.round(H * 0.4) };
          var rr = OS.rect(ctx.root);
          var fx = OS.clamp(Math.round(wr.left - rr.left - 172), 20, Math.max(20, W - 140));
          var fy = OS.clamp(Math.round(wr.top - rr.top + 74), 20, Math.max(20, H - 160));
          var folder = ctx.createdFolder({
            x: fx, y: fy, label: name.slice(0, 24), testid: 'created-folder'
          });
          folder.classList.add('lv7-created');
          folder.dataset.qa = 'l07-folder';
          NF.Audio.play('pop');
          var c = OS.center(folder);
          NF.FX.burst(c.x, c.y, {
            count: 26, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#7ef0c0'], speed: 7, gravity: 0.22
          });
          NF.FX.sparkle(c.x, c.y, '#7ef0c0');
          ctx.timer(640, function () {
            if (completed) return;
            completed = true;
            ctx.complete({ el: folder });
          });
        });
      }

      function runCommand(raw) {
        if (!input) return;
        var text = String(raw == null ? '' : raw).replace(/\s+$/, '');
        if (!text.trim()) return;
        echoCommand(text);
        history.push(text);
        histIndex = history.length;
        var cmd = text.trim();

        var m = cmd.match(/^mkdir(?:\s+([\s\S]+))?$/i);
        if (m) {
          var name = (m[1] || '').trim().replace(/^["']+|["']+$/g, '').trim();
          if (!name) { printError('mkdir: 缺少名称'); return; }
          if (created) { printError('文件夹已存在'); return; }
          mkdirSuccess(name);
          return;
        }
        if (/^(cls|clear)$/i.test(cmd)) { logEl.innerHTML = ''; NF.Audio.play('whoosh', { volume: 0.35 }); return; }
        if (/^(dir|ls)$/i.test(cmd)) { printDir(); return; }
        if (/^exit$/i.test(cmd)) {
          appendLine('bye', 'dim');
          var w = win;
          setTimeout(function () { try { if (w && !w.closed) w.close(); } catch (e) { /* 忽略 */ } }, 220);
          return;
        }
        var em = cmd.match(/^echo\s+([\s\S]*)$/i);
        if (em) { appendLine(em[1], 'out'); return; }
        printError("'" + cmd.split(/\s+/)[0] + "' 不是可执行命令");
      }

      function onInputKey(e) {
        if (!input) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          NF.Audio.play('enter', { volume: 0.5 });
          var raw = input.value;
          input.value = '';
          runCommand(raw);
          focusInput();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!history.length) return;
          histIndex = Math.max(0, histIndex - 1);
          input.value = history[histIndex] || '';
          try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!history.length) return;
          histIndex = Math.min(history.length, histIndex + 1);
          input.value = history[histIndex] || '';
          try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
          return;
        }
        if (e.key === 'Tab') { e.preventDefault(); }
      }

      function openTerminal() {
        if (win && !win.closed) {
          win.focus();
          focusInput();
          return;
        }
        var winW = Math.min(640, Math.max(420, W - 80));
        var winH = Math.min(392, Math.max(260, H - 110));
        var wx = OS.clamp(Math.round(W * 0.5 - winW * 0.4), 16, Math.max(16, W - winW - 16));
        var wy = OS.clamp(Math.round(H * 0.16), 12, Math.max(12, H - winH - 16));

        var wrap = document.createElement('div');
        wrap.className = 'lv7-term';
        var log = document.createElement('div');
        log.className = 'lv7-log';
        log.dataset.t = 'terminal-log';
        var pl = document.createElement('div');
        pl.className = 'lv7-promptline';
        var ps = document.createElement('span');
        ps.className = 'lv7-ps';
        ps.textContent = PROMPT;
        var inp = document.createElement('input');
        inp.className = 'lv7-input';
        inp.dataset.t = 'terminal-input';
        inp.type = 'text';
        inp.spellcheck = false;
        inp.autocomplete = 'off';
        inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('aria-label', '终端输入');
        pl.appendChild(ps);
        pl.appendChild(inp);
        wrap.appendChild(log);
        wrap.appendChild(pl);

        win = OS.window({
          title: '终端',
          icon: 'terminal',
          x: wx,
          y: wy,
          w: winW,
          h: winH,
          body: wrap,
          testid: 'terminal-window',
          className: 'lv7-term-win',
          onClose: function () {
            win = null;
            input = null;
            logEl = null;
            promptline = null;
          }
        });
        input = win.el.querySelector('[data-t="terminal-input"]');
        logEl = win.el.querySelector('.lv7-log');
        promptline = win.el.querySelector('.lv7-promptline');
        ctx.on(win.el, 'pointerdown', function (e) {
          if (e.target && e.target.closest && e.target.closest('.nf-win-close')) return;
          setTimeout(focusInput, 0);
        });
        ctx.on(input, 'keydown', onInputKey);
        setTimeout(focusInput, 80);
        NF.Audio.play('open', { volume: 0.4 });
      }

      function closeTerminal() {
        if (win && !win.closed) win.close();
      }

      /* Esc 关窗（焦点不在输入框时也能关） */
      ctx.on(document, 'keydown', function (e) {
        if (!win || win.closed) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeTerminal();
        }
      });

      /* ---------------- 桌面图标 ---------------- */
      OS.icon({
        icon: 'terminal',
        label: '终端',
        x: 64,
        y: 54,
        testid: 'terminal-icon',
        onDblClick: openTerminal
      });

      ctx.on(ctx.root, 'contextmenu', function (e) { e.preventDefault(); });

      /* ---------------- 幽灵演示：双击图标 → 打字 → 回车 ---------------- */
      demo = async function () {
        if (completed) return;
        var steps = [
          { move: '[data-t="terminal-icon"]', dur: 620 },
          { highlight: '[data-t="terminal-icon"]', dur: 700 },
          { click: 'left', target: '[data-t="terminal-icon"]', after: 90 },
          {
            click: 'left', target: '[data-t="terminal-icon"]', after: 140,
            do: function () { if (!win || win.closed) openTerminal(); else focusInput(); }
          },
          { wait: 480 },
          { move: '[data-t="terminal-input"]', dur: 720 },
          { highlight: '[data-t="terminal-input"]', dur: 720 },
          { type: 'mkdir abc' },
          { keys: 'Enter', dur: 900 },
          { wait: 340 }
        ];
        try { await NF.Ghost.play(steps); } finally { /* 终端保持打开，玩家可以直接输入 */ }
      };
      ctx.hint(demo);

      ctx.timer(1100, function () {
        if (completed || win) return;
        NF.FX.ripple(112, 106, { color: 'rgba(126,240,192,.28)', radius: 60 });
      });

      ctx.qa('l07', ctx.root);
    }
  });
})();
