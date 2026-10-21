/* NF.Game — 关卡生命周期 / 进度 / 桌面 HUD / 标题 / 结局 */
(function () {
  'use strict';
  window.NF = window.NF || {};

  var SAVE_KEY = 'nf.progress.v1';
  var MAX_LEVEL = 20;          // 第一幕 10 关 + 第四面墙 10 关
  var BREAK_LEVEL = 10;        // 第 10 关之后进入"第四面墙"幕
  var levels = {};
  var order = [];

  var Game = {
    levels: levels,
    MAX_LEVEL: MAX_LEVEL,
    BREAK_LEVEL: BREAK_LEVEL,
    progress: { completed: [], current: 1, finished: false },
    activeLevel: 0,
    activeCtx: null,
    started: false
  };
  NF.Game = Game;

  var os = null, fx = null, audio = null, icons = null;
  var taskbar = null, jarBtn = null, jarCount = null, hintBtn = null, muteBtn = null;
  var levelRoot = null, titleEl = null, introEl = null, endingLayer = null;
  var startMenu = null;
  var idleTimer = 0, autoHintTimer = 0, clockTimer = 0, endingFxTimer = 0;
  var transitionTimer = 0;   // 过关后切下一关/进结局的延时定时器（切关/reset 必须取消，避免覆盖标题）
  var levelCleanups = [];
  var completed = false;
  var levelActive = false;
  var hintFn = null;
  var ctx = null;
  var booted = false;

  /* ============================================================
     持久化
     ============================================================ */

  function loadProgress() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        Game.progress.completed = Array.isArray(data.completed) ? data.completed.filter(function (n) { return typeof n === 'number'; }) : [];
        Game.progress.current = Math.min(MAX_LEVEL, Math.max(1, Number(data.current) || 1));
        Game.progress.finished = !!data.finished;
        // v1 存档只有 10 关：旧玩家通关后继续第四面墙（从第 11 关开始）
        var maxDone = Game.progress.completed.reduce(function (a, b) { return Math.max(a, b); }, 0);
        if (Game.progress.finished && maxDone < MAX_LEVEL) {
          Game.progress.finished = false;
          Game.progress.current = Math.min(MAX_LEVEL, Math.max(BREAK_LEVEL + 1, maxDone + 1));
        }
      }
    } catch (err) { /* 忽略损坏存档 */ }
  }
  function saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        completed: Game.progress.completed,
        current: Game.progress.current,
        finished: Game.progress.finished,
        ts: Date.now()
      }));
    } catch (err) { /* 隐私模式等 */ }
  }

  /* ============================================================
     注册
     ============================================================ */

  Game.registerLevel = function (def) {
    if (!def || !def.id) throw new Error('level needs id');
    def.hint = def.hint || null;
    def.icon = def.icon || 'folder';
    levels[def.id] = def;
    if (order.indexOf(def.id) < 0) order.push(def.id);
    order.sort(function (a, b) { return a - b; });
  };

  /* ============================================================
     启动
     ============================================================ */

  Game.boot = function () {
    if (booted) return;
    booted = true;
    os = NF.OS; fx = NF.FX; audio = NF.Audio; icons = NF.icons;
    loadProgress();

    os.init();
    fx.init();

    taskbar = document.querySelector('[data-t="taskbar"]');
    jarBtn = document.getElementById('jar-btn');
    jarCount = document.getElementById('jar-count');
    hintBtn = document.getElementById('hint-btn');
    muteBtn = document.getElementById('mute-btn');
    levelRoot = document.getElementById('level-root');
    titleEl = document.getElementById('title-screen');
    introEl = document.getElementById('level-intro');
    endingLayer = document.getElementById('ending-layer');
    jarCount = document.getElementById('jar-count');

    buildWallpaper();
    buildDesktopIcons();
    buildTitle();
    wireTaskbar();
    wireAudioUnlock();
    updateJar();
    updateMuteIcon();
    startClock();
    document.body.classList.add('game-booted');

    // 标题页
    showTitle(true);
    bindGlobalActivity();

    NF.debug = {
      jump: function (id) { return Game.startLevel(Number(id)); },
      state: function () {
        return {
          level: Game.activeLevel,
          completed: Game.progress.completed.slice(),
          current: Game.progress.current,
          finished: Game.progress.finished,
          busy: levelActive,
          done: completed,
          hintPlaying: NF.Ghost.isPlaying(),
          hasMenu: NF.OS.hasOpenMenu()
        };
      },
      complete: function () { if (ctx) ctx.complete(); },
      hint: function () { playHint(true); },
      reset: function () {
        Game.progress = { completed: [], current: 1, finished: false };
        saveProgress();
        teardownLevel();
        hideEnding();
        showTitle(true);
        updateJar();
      },
      clearSave: function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
      showEnding: function () { showEnding(); },
      showTitle: function () { teardownLevel(); showTitle(true); }
    };

    // 失败兜底：出错不白屏
    window.addEventListener('error', function (ev) {
      console.error('[nf] uncaught', ev.error || ev.message);
    });
  };

  /* ============================================================
     壁纸装饰
     ============================================================ */

  function buildWallpaper() {
    var wrap = document.getElementById('wp-folders');
    if (!wrap) return;
    var tints = ['', 'tint-mint', 'tint-pink', 'tint-blue'];
    var layout = [
      [4, 12, 260, -16], [74, 6, 180, 12], [86, 42, 300, -8],
      [12, 64, 220, 14], [58, 72, 150, -22], [34, 30, 120, 8],
      [92, 84, 250, 10], [46, 82, 190, -12], [20, 40, 110, -6],
      [66, 28, 140, 18]
    ];
    layout.forEach(function (cfg, i) {
      var el = document.createElement('div');
      el.className = 'wp-folder ' + tints[i % tints.length];
      el.style.left = cfg[0] + '%';
      el.style.top = cfg[1] + '%';
      el.style.width = cfg[2] + 'px';
      el.style.height = (cfg[2] * 0.82) + 'px';
      el.style.setProperty('--rot', cfg[3] + 'deg');
      el.style.setProperty('--dur', (13 + (i % 5) * 3.4) + 's');
      el.style.setProperty('--delay', (-i * 1.7) + 's');
      el.innerHTML = icons.svg('folder');
      wrap.appendChild(el);
    });
  }

  /* ============================================================
     桌面图标（装饰，标题页 / 关卡背景）
     ============================================================ */

  function buildDesktopIcons() {
    var layer = document.getElementById('desktop-icons');
    if (!layer) return;
    var defs = [
      { icon: 'computer', label: '此电脑' },
      { icon: 'trash', label: '回收站' },
      { icon: 'fileText', label: '小夹.txt' },
      { icon: 'folderFace', label: '新建文件夹' }
    ];
    defs.forEach(function (d, i) {
      var ref = os.icon({
        parent: layer,
        icon: d.icon,
        label: d.label,
        x: 8,
        y: 6 + i * 102,
        locked: false
      });
      ref.el.style.position = 'absolute';
      ref.el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      ref.el.addEventListener('click', function () {
        var msg = ['这台电脑里只有一个文件夹。', '回收站里什么都没有，真的。', '小夹不想说话。', '它还没被创建出来。'][i];
        os.toast({ icon: ['computer', 'trash', 'fileText', 'folder'][i], title: msg, ms: 1600 });
        audio.play('deny', { volume: 0.4 });
      });
    });
  }

  /* ============================================================
     标题页
     ============================================================ */

  function buildTitle() {
    titleEl.innerHTML = '';
    var floats = [
      [6, 16, 210, -12, 'tint-pink'], [82, 10, 160, 9, 'tint-mint'],
      [88, 68, 190, 14, 'tint-blue'], [4, 70, 150, -8, ''], [30, 84, 120, 6, 'tint-pink']
    ];
    floats.forEach(function (f) {
      var d = document.createElement('div');
      d.className = 'ts-float';
      d.style.left = f[0] + '%';
      d.style.top = f[1] + '%';
      d.style.width = f[2] + 'px';
      d.style.height = (f[2] * 0.82) + 'px';
      d.style.setProperty('--rot', f[3] + 'deg');
      d.style.setProperty('--dur', (14 + Math.random() * 8) + 's');
      if (f[4]) d.style.filter = 'hue-rotate(' + (Math.random() * 360).toFixed(0) + 'deg)';
      d.innerHTML = icons.svg('folder');
      titleEl.appendChild(d);
    });

    var logo = document.createElement('div');
    logo.className = 'ts-logo';
    logo.innerHTML = icons.svg('folderFace');
    titleEl.appendChild(logo);

    var h1 = document.createElement('h1');
    h1.className = 'ts-title';
    h1.textContent = '新建文件夹';
    titleEl.appendChild(h1);

    var tag = document.createElement('div');
    tag.className = 'ts-tagline';
    tag.textContent = 'FOLDER SIMULATOR';
    titleEl.appendChild(tag);

    var start = document.createElement('div');
    start.className = 'ts-start';
    start.dataset.t = 'title-start';
    start.innerHTML = icons.svg('mouseLeft', '') ;
    var hint = document.createElement('div');
    hint.className = 'ts-start-hint';
    hint.innerHTML = '<div class="hint-dots"><i></i><i></i><i></i></div><span class="hint-bar"></span>';
    start.appendChild(hint);
    start.addEventListener('click', function (e) { e.stopPropagation(); beginGame(); });
    titleEl.appendChild(start);

    // 已收集进度：小文件夹
    var collected = document.createElement('div');
    collected.className = 'ts-collected';
    collected.dataset.t = 'title-progress';
    for (var i = 1; i <= MAX_LEVEL; i++) {
      var s = document.createElement('span');
      s.className = 'ts-collect-dot' + (Game.progress.completed.indexOf(i) >= 0 ? ' on' : '');
      collected.appendChild(s);
    }
    titleEl.appendChild(collected);

    var foot = document.createElement('div');
    foot.className = 'ts-footer';
    foot.innerHTML = '<span>RIGHT CLICK TO LIVE</span><span>·</span><span>v2.0</span>';
    titleEl.appendChild(foot);

    titleEl.addEventListener('click', function () { beginGame(); });
    document.addEventListener('keydown', function onTitleKey(e) {
      if (titleEl.classList.contains('hidden') || titleEl.classList.contains('leaving')) return;
      if (!Game.started && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        beginGame();
      }
    });

    // 标题页右键：一个打不开的菜单彩蛋
    titleEl.addEventListener('contextmenu', function (e) {
      if (Game.started) return;
      e.preventDefault();
      NF.OS.menu({
        x: e.clientX, y: e.clientY,
        items: [
          { id: 'view', label: '查看', icon: 'eye', disabled: true },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () {
            titleEl.style.transition = 'filter .2s';
            titleEl.style.filter = 'invert(1)';
            setTimeout(function () { titleEl.style.filter = ''; }, 90);
            NF.Audio.play('whoosh');
          } },
          { separator: true },
          { id: 'new', label: '新建', icon: 'folder', submenu: [
            { id: 'lock-folder', label: '文件夹', icon: 'folder', lockIcon: true, onSelect: function () {
              NF.Audio.play('deny');
              NF.OS.toast({ icon: 'lock', title: '权限不足', kind: 'error' });
            } }
          ] }
        ]
      });
    });
  }

  async function beginGame() {
    if (Game.started) return;
    // 在标题页右键菜单里点空白关菜单时，不要顺手把游戏点开了
    if (performance.now() - (NF.OS.lastMenuCloseTime || 0) < 280) return;
    Game.started = true;
    try { audio.init(); } catch (e) {}
    try { audio.startAmbient(); } catch (e) {}
    audio.play('levelup');
    titleEl.classList.add('leaving');
    NF.Ghost.cancel();
    setTimeout(function () { titleEl.classList.add('hidden'); }, 620);
    os.setIconLayerDim(true);
    await os.sleep(260);
    var startAt = Game.progress.finished ? 1 : Game.progress.current;
    Game.startLevel(Math.min(MAX_LEVEL, Math.max(1, startAt)));
  }

  function showTitle(immediate) {
    Game.started = false;
    clearTimeout(transitionTimer);
    transitionTimer = 0;
    hideEnding();
    if (endingFxTimer) { clearInterval(endingFxTimer); endingFxTimer = 0; }
    titleEl.classList.remove('hidden', 'leaving');
    os.setIconLayerDim(false);
    Game.activeLevel = 0;
    document.body.classList.remove('is-ending');
    // 刷新进度小点
    var collected = titleEl.querySelector('[data-t="title-progress"]');
    if (collected) {
      Array.prototype.forEach.call(collected.children, function (s, i) {
        s.className = 'ts-collect-dot' + (Game.progress.completed.indexOf(i + 1) >= 0 ? ' on' : '');
      });
    }
    if (immediate) titleEl.style.opacity = '';
    setTimeout(function () {
      if (!Game.started) NF.Audio.play('open', { volume: 0.25 });
    }, 500);
  }

  /* ============================================================
     任务栏
     ============================================================ */

  function wireTaskbar() {
    document.getElementById('start-btn').addEventListener('click', function () { toggleLevelMap('start'); });
    jarBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLevelMap('jar'); });
    hintBtn.addEventListener('click', function () { playHint(true); });
    muteBtn.addEventListener('click', function () {
      var m = audio.toggleMute();
      updateMuteIcon();
      if (!m) audio.play('click');
    });
    document.querySelectorAll('.tb-app').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.dataset.t;
        if (t === 'app-files') { toggleLevelMap('app'); return; }
        if (t === 'app-terminal') {
          os.toast({ icon: 'terminal', title: '终端正忙', kind: 'error', ms: 1600 });
          NF.Audio.play('deny');
          return;
        }
        if (t === 'app-trash') {
          NF.Audio.play('close');
          os.toast({ icon: 'trash', title: '回收站是空的', ms: 1600 });
          return;
        }
      });
    });
  }

  function updateMuteIcon() {
    var host = document.getElementById('mute-icon');
    if (!host) return;
    host.innerHTML = icons.svg(audio.isMuted() ? 'speakerOff' : 'speakerOn');
    muteBtn.classList.toggle('is-muted', audio.isMuted());
  }

  function updateJar(bump) {
    document.body.classList.toggle('act3', Game.progress.completed.indexOf(BREAK_LEVEL) >= 0);
    if (!jarCount) return;
    var n = Game.progress.completed.length;
    jarCount.textContent = String(n);
    jarCount.classList.remove('bump');
    if (bump) {
      void jarCount.offsetWidth;
      jarCount.classList.add('bump');
    }
    var mini = document.getElementById('jar-mini');
    if (mini) mini.innerHTML = icons.svg('jar');
  }

  function startClock() {
    function tick() {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      document.getElementById('clock-time').textContent = hh + ':' + mm;
      document.getElementById('clock-date').textContent = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    }
    tick();
    clockTimer = setInterval(tick, 15000);
  }

  /* ============================================================
     关卡地图
     ============================================================ */

  function toggleLevelMap(source) {
    if (startMenu) { closeLevelMap(); return; }
    NF.Audio.play('open');
    startMenu = document.createElement('div');
    startMenu.className = 'start-menu';
    startMenu.dataset.t = 'level-map';
    startMenu.dataset.keepMenu = '1';
    var head = document.createElement('div');
    head.className = 'start-menu-title';
    head.appendChild(icons.el('jar'));
    var sub = document.createElement('span');
    sub.textContent = '我的文件夹';
    head.appendChild(sub);
    startMenu.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'level-grid';
    order.forEach(function (id) {
      var def = levels[id];
      var cell = document.createElement('div');
      cell.className = 'level-cell';
      cell.dataset.t = 'level-cell-' + id;
      cell.dataset.level = String(id);
      var done = Game.progress.completed.indexOf(id) >= 0;
      var unlocked = done || id <= Game.progress.current || id === 1;
      if (done) cell.classList.add('is-done');
      if (!unlocked) cell.classList.add('is-locked');
      if (id === Game.progress.current) cell.classList.add('is-current');
      cell.innerHTML = icons.svg(def ? def.icon : 'folder');
      var num = document.createElement('span');
      num.className = 'lv-num';
      num.textContent = String(id).padStart(2, '0');
      cell.appendChild(num);
      cell.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!unlocked) { NF.Audio.play('deny'); NF.OS.pulse(cell, 'wiggle', 400); return; }
        closeLevelMap();
        Game.startLevel(id);
      });
      grid.appendChild(cell);
    });
    startMenu.appendChild(grid);
    os.uiLayer.appendChild(startMenu);

    var closeMap = function (e) {
      if (startMenu && !startMenu.contains(e.target) && !e.target.closest('[data-t="start"]') && !e.target.closest('[data-t="jar"]') && !e.target.closest('.tb-app')) {
        closeLevelMap();
      }
    };
    setTimeout(function () { document.addEventListener('pointerdown', closeMap, true); }, 0);
    startMenu._closeMap = closeMap;
  }

  function closeLevelMap() {
    if (!startMenu) return;
    if (startMenu._closeMap) document.removeEventListener('pointerdown', startMenu._closeMap, true);
    startMenu.remove();
    startMenu = null;
  }

  /* ============================================================
     音频解锁
     ============================================================ */

  function wireAudioUnlock() {
    function unlock() {
      try { audio.init(); } catch (e) {}
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  /* ============================================================
     关卡生命周期
     ============================================================ */

  Game.startLevel = async function (id) {
    id = Math.min(MAX_LEVEL, Math.max(1, Number(id) || 1));
    var def = levels[id];
    if (!def) {
      os.toast({ icon: 'error', title: '关卡迷路了', kind: 'error' });
      return;
    }
    animateLevelLeave();
    await os.sleep(120);
    teardownLevel();
    hideEnding();
    closeLevelMap();
    titleEl.classList.add('hidden');
    titleEl.classList.remove('leaving');
    Game.started = true;
    os.setIconLayerDim(true);
    Game.activeLevel = id;
    Game.progress.current = Math.max(Game.progress.current, id);
    saveProgress();
    completed = false;
    levelActive = true;
    hintFn = null;
    levelRoot.innerHTML = '';
    levelRoot.dataset.level = String(id);
    levelRoot.classList.remove('is-done');
    document.body.dataset.level = String(id);

    ctx = makeCtx(def);
    Game.activeCtx = ctx;

    try {
      if (typeof def.init === 'function') {
        var ret = def.init(ctx);
        if (typeof ret === 'function') ctx.onCleanup(ret);
      }
    } catch (err) {
      console.error('[level ' + id + '] init failed', err);
      os.toast({ icon: 'error', title: '系统抽风了', kind: 'error' });
    }

    // 优先级：关卡在 init 里用 ctx.hint(fn) 注册的演示 > 关卡定义上的 hint 字段
    if (!hintFn && typeof def.hint === 'function') hintFn = def.hint.bind(def, ctx);

    showIntro(id);
    resetIdle();
    clearTimeout(autoHintTimer);
    autoHintTimer = setTimeout(function () {
      if (levelActive && !completed) playHint(false);
    }, 1650);

    startClockIfNeeded();
  };

  function startClockIfNeeded() { if (!clockTimer) startClock(); }

  function teardownLevel() {
    levelActive = false;
    clearTimeout(idleTimer);
    clearTimeout(autoHintTimer);
    clearTimeout(transitionTimer);
    transitionTimer = 0;
    idleTimer = 0;
    autoHintTimer = 0;
    if (hintBtn) hintBtn.classList.remove('is-hot');
    try { NF.Ghost.cancel(); } catch (e) {}
    try { if (fx && typeof fx.clear === 'function') fx.clear(); } catch (e) {}
    for (var i = 0; i < levelCleanups.length; i++) {
      try { levelCleanups[i](); } catch (e) { console.warn('[cleanup]', e); }
    }
    levelCleanups = [];
    try { os.clearLevelUI(); } catch (e) {}
    document.querySelectorAll('style[data-level-style]').forEach(function (n) { n.remove(); });
    if (levelRoot) {
      levelRoot.innerHTML = '';
      levelRoot.classList.remove('is-done');
      delete levelRoot.dataset.level;
    }
    document.body.removeAttribute('data-level');
    ctx = null;
    Game.activeCtx = null;
    hintFn = null;
  }

  function animateLevelLeave() {
    if (levelRoot && levelRoot.children.length) {
      levelRoot.style.transition = 'opacity .12s ease';
      levelRoot.style.opacity = '0';
      setTimeout(function () { levelRoot.style.opacity = ''; levelRoot.style.transition = ''; }, 140);
    }
  }

  function showIntro(id) {
    if (!introEl) return;
    var def = levels[id];
    introEl.innerHTML = '';
    var stack = document.createElement('div');
    stack.className = 'intro-stack';
    var num = document.createElement('div');
    num.className = 'intro-num';
    num.textContent = String(id).padStart(2, '0');
    stack.appendChild(num);
    var ic = document.createElement('div');
    ic.className = 'intro-icon';
    ic.innerHTML = icons.svg(def ? def.icon : 'folder');
    stack.appendChild(ic);
    var pips = document.createElement('div');
    pips.className = 'intro-pips';
    for (var i = 1; i <= MAX_LEVEL; i++) {
      var p = document.createElement('i');
      if (Game.progress.completed.indexOf(i) >= 0) p.className = 'on';
      pips.appendChild(p);
    }
    if (id > BREAK_LEVEL) pips.classList.add('is-act3');
    if (id === BREAK_LEVEL + 1) pips.classList.add('is-breach');
    stack.appendChild(pips);
    introEl.appendChild(stack);
    introEl.classList.remove('show');
    void introEl.offsetWidth;
    introEl.classList.add('show');
    setTimeout(function () { introEl.classList.remove('show'); }, 1200);
  }

  /* ============================================================
     关卡上下文
     ============================================================ */

  function makeCtx(def) {
    var c = {};
    c.level = def;
    c.id = def.id;
    c.root = levelRoot;
    c.os = os; c.fx = fx; c.audio = audio; c.icons = icons; c.ghost = NF.Ghost;
    c.sleep = os.sleep;
    c.clamp = os.clamp;
    c.rand = os.rand;

    c.on = function (target, ev, fn, opts) {
      var off = os.on(target, ev, fn, opts);
      levelCleanups.push(off);
      return off;
    };
    c.timer = function (ms, fn) {
      var id = setTimeout(function () { try { fn(); } catch (e) { console.warn('[timer]', e); } }, ms);
      levelCleanups.push(function () { clearTimeout(id); });
      return id;
    };
    c.interval = function (ms, fn) {
      var id = setInterval(function () { try { fn(); } catch (e) { console.warn('[interval]', e); } }, ms);
      levelCleanups.push(function () { clearInterval(id); });
      return id;
    };
    c.raf = function (fn) {
      var stop = os.raf(fn);
      levelCleanups.push(stop);
      return stop;
    };
    c.onCleanup = function (fn) { levelCleanups.push(fn); };
    c.cleanup = teardownLevel;
    c.style = function (css) {
      var style = document.createElement('style');
      style.setAttribute('data-level-style', String(def.id));
      style.textContent = css;
      document.head.appendChild(style);
      levelCleanups.push(function () { style.remove(); });
      return style;
    };
    c.toast = function (opts) { return os.toast(opts); };
    c.complete = function (opts) { finishLevel(opts || {}); };
    // 同时兼容两种写法：ctx.hint = fn 与 ctx.hint(fn)
    var hintApi = function (fn) {
      if (typeof fn === 'function') hintFn = fn;
      return hintFn;
    };
    Object.defineProperty(c, 'hint', {
      enumerable: true,
      configurable: true,
      get: function () { return hintApi; },
      set: function (fn) { if (typeof fn === 'function') hintFn = fn; }
    });
    c.replayHint = function () { playHint(true); };
    c.createdFolder = function (opts) {
      opts = opts || {};
      var el = os.spawnDesktopFolder({
        x: opts.x, y: opts.y, label: opts.label, icon: opts.icon, testid: opts.testid || 'created-folder'
      });
      return el;
    };
    c.qa = function (name, el) { (el || levelRoot).dataset.qa = name; };
    c.folderRect = function (el) { return os.rect(el); };
    return c;
  }

  /* ============================================================
     提示
     ============================================================ */

  function playHint(manual) {
    if (!levelActive || !hintFn || completed) {
      if (manual && !levelActive) {
        // 标题页提示：演示"点开始"
        NF.Ghost.play([
          { target: '[data-t="title-start"]', click: 'left' }
        ]);
      }
      return;
    }
    NF.Ghost.cancel();
    if (manual) NF.Audio.play('select', { volume: 0.5 });
    var p;
    try { p = hintFn(ctx); } catch (e) { console.warn('[hint]', e); return; }
    Promise.resolve(p).catch(function (e) { console.warn('[hint]', e); }).finally(function () {
      if (hintBtn) hintBtn.classList.remove('is-hot');
    });
  }

  function resetIdle() {
    if (!levelActive) return;
    clearTimeout(idleTimer);
    if (hintBtn) hintBtn.classList.remove('is-hot');
    idleTimer = setTimeout(function () {
      if (!levelActive || completed) return;
      if (hintBtn) hintBtn.classList.add('is-hot');
      playHint(false);
    }, 12000);
  }

  function bindGlobalActivity() {
    var handler = function () {
      // 玩家一旦有操作，取消即将自动播放的演示（玩家真卡住时 15 秒后还会再演示）
      clearTimeout(autoHintTimer);
      if (NF.Ghost.isPlaying()) NF.Ghost.cancel();
      resetIdle();
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  /* ============================================================
     过关 / 结局
     ============================================================ */

  function finishLevel(opts) {
    if (completed || !levelActive) return;
    completed = true;
    levelActive = false;
    clearTimeout(idleTimer);
    clearTimeout(autoHintTimer);
    try { NF.Ghost.cancel(); } catch (e) {}
    try { os.closeMenus(); } catch (e) {}
    if (hintBtn) hintBtn.classList.remove('is-hot');
    levelRoot.classList.add('is-done');

    var origin = { x: innerWidth / 2, y: innerHeight / 2 };
    var fromRect = null;
    if (opts.el) {
      fromRect = os.rect(opts.el);
      origin = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
    } else if (opts.x != null) {
      origin = { x: opts.x, y: opts.y };
      fromRect = { left: opts.x - 40, top: opts.y - 34, width: 80, height: 68 };
    } else {
      fromRect = { left: origin.x - 40, top: origin.y - 34, width: 80, height: 68 };
    }

    var jarRect = os.rect(jarBtn);
    fx.burst(origin.x, origin.y, {
      count: 34,
      colors: ['#ffc94d', '#ffb020', '#ffe08a', '#ff6ba9', '#8a6cff', '#ffffff'],
      speed: 10, gravity: 0.32, shape: 'rect'
    });
    fx.confetti({ count: 90 });
    fx.ripple(origin.x, origin.y, { color: 'rgba(255,212,92,.9)', radius: 60 });
    fx.fly(fromRect, jarRect, {
      duration: 820,
      arc: -160,
      html: icons.svg('folder'),
      onDone: function () {
        fx.burst(jarRect.left + jarRect.width / 2, jarRect.top + jarRect.height / 2, {
          count: 16, colors: ['#ffc94d', '#fff3b0', '#ffffff'], speed: 6, gravity: 0.15
        });
        NF.Audio.play('sparkle', { volume: 0.8 });
      }
    });
    fx.shake(4, 220);
    audio.play('success');
    setTimeout(function () { audio.play('levelup', { volume: 0.85 }); }, 240);

    var id = Game.activeLevel;
    if (Game.progress.completed.indexOf(id) < 0) Game.progress.completed.push(id);
    Game.progress.completed.sort(function (a, b) { return a - b; });
    if (id >= MAX_LEVEL) Game.progress.finished = true;
    Game.progress.current = Math.min(MAX_LEVEL, Math.max(Game.progress.current, id + 1));
    saveProgress();
    updateJar(true);

    // 渡过第 10 关：进入"第四面墙"幕，给桌面留一点后遗症
    if (id === BREAK_LEVEL) {
      document.body.classList.add('act3');
      setTimeout(function () { audio.play('alarm', { volume: 0.22 }); }, 320);
    }

    var delay = opts.delay != null ? opts.delay : (id >= MAX_LEVEL ? 2100 : 1250);
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(function () {
      transitionTimer = 0;
      if (id >= MAX_LEVEL) showEnding();
      else Game.startLevel(Math.min(MAX_LEVEL, id + 1));
    }, delay);
  }

  /* ============================================================
     结局
     ============================================================ */

  function hideEnding() {
    if (!endingLayer) return;
    endingLayer.innerHTML = '';
  }

  function showEnding() {
    teardownLevel();
    hideEnding();
    closeLevelMap();
    titleEl.classList.add('hidden');
    document.body.classList.add('is-ending');
    document.body.removeAttribute('data-level');
    Game.activeLevel = 0;
    Game.progress.finished = true;
    Game.progress.current = MAX_LEVEL;
    saveProgress();
    os.setIconLayerDim(true);
    try { os.closeWindows(); } catch (e) {}

    var sky = document.createElement('div');
    sky.className = 'ending-sky';
    endingLayer.appendChild(sky);
    var stars = document.createElement('div');
    stars.className = 'ending-stars';
    endingLayer.appendChild(stars);

    var jar = document.createElement('div');
    jar.className = 'ending-jar';
    jar.dataset.t = 'ending';
    jar.innerHTML = icons.svg('jar');
    // 罐子里的 20 个文件夹（4 列 × 5 行）
    var inner = document.createElement('div');
    inner.className = 'ending-jar-folders is-full';
    for (var i = 0; i < MAX_LEVEL; i++) {
      var f = document.createElement('span');
      f.className = 'ending-mini-folder';
      f.style.left = (31 + (i % 4) * 10.5) + '%';
      f.style.bottom = (7 + Math.floor(i / 4) * 9.4) + '%';
      f.style.transform = 'rotate(' + ((i % 2 ? 1 : -1) * (3 + i * 0.4)) + 'deg)';
      f.innerHTML = icons.svg('folder');
      inner.appendChild(f);
    }
    jar.appendChild(inner);

    // 小夹从罐口探出头
    var peeker = document.createElement('div');
    peeker.className = 'ending-peeker';
    peeker.innerHTML = icons.svg('folderFace');
    jar.appendChild(peeker);
    jar.addEventListener('click', function () {
      var r = os.rect(jar);
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 50, speed: 12, gravity: 0.3 });
      audio.play('firework');
    });
    endingLayer.appendChild(jar);

    var title = document.createElement('div');
    title.className = 'ending-title';
    title.textContent = '新建文件夹';
    endingLayer.appendChild(title);
    var sub = document.createElement('div');
    sub.className = 'ending-sub';
    sub.textContent = MAX_LEVEL + ' / ' + MAX_LEVEL;
    endingLayer.appendChild(sub);

    var actions = document.createElement('div');
    actions.className = 'ending-actions';
    var restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'ending-btn';
    restart.dataset.t = 'ending-restart';
    restart.title = '再玩一次';
    restart.innerHTML = icons.svg('restart');
    restart.addEventListener('click', function () {
      audio.play('click');
      Game.progress = { completed: [], current: 1, finished: false };
      saveProgress();
      updateJar();
      hideEnding();
      showTitle(true);
      document.body.classList.remove('is-ending');
      if (endingFxTimer) { clearInterval(endingFxTimer); endingFxTimer = 0; }
    });
    actions.appendChild(restart);

    var home = document.createElement('button');
    home.type = 'button';
    home.className = 'ending-btn';
    home.dataset.t = 'ending-home';
    home.title = '回到桌面';
    home.innerHTML = icons.svg('computer');
    home.addEventListener('click', function () {
      audio.play('click');
      hideEnding();
      showTitle(true);
      document.body.classList.remove('is-ending');
      if (endingFxTimer) { clearInterval(endingFxTimer); endingFxTimer = 0; }
    });
    actions.appendChild(home);
    endingLayer.appendChild(actions);

    // 环绕的文件夹
    var orbit = document.createElement('div');
    orbit.className = 'ending-folder-orbit';
    orbit.style.left = '50%';
    orbit.style.top = '52%';
    for (var k = 0; k < 8; k++) {
      var arm = document.createElement('div');
      arm.className = 'ending-orbiter';
      arm.style.setProperty('--r', (0) + 'px');
      var inner2 = document.createElement('div');
      inner2.className = 'orbit-arm';
      inner2.style.width = (160 + (k % 3) * 46) + 'px';
      inner2.style.setProperty('--spin', (11 + (k % 4) * 3) + 's');
      inner2.style.animationDirection = (k % 2 ? 'reverse' : 'normal');
      inner2.style.transform = 'rotate(' + (k * 45) + 'deg)';
      var holder = document.createElement('div');
      holder.style.position = 'absolute';
      holder.style.right = '-27px';
      holder.style.top = '-27px';
      holder.innerHTML = icons.svg('folder');
      inner2.appendChild(holder);
      arm.appendChild(inner2);
      orbit.appendChild(arm);
    }
    endingLayer.appendChild(orbit);

    audio.play('win');
    fx.confetti({ count: 110 });
    setTimeout(function () { fx.burst(innerWidth / 2, innerHeight * 0.45, { count: 40, speed: 14, gravity: 0.1 }); }, 300);
    endingFxTimer = setInterval(function () {
      if (!document.body.classList.contains('is-ending')) return;
      var x = os.rand(innerWidth * 0.15, innerWidth * 0.85);
      var y = os.rand(innerHeight * 0.2, innerHeight * 0.6);
      fx.burst(x, y, { count: 26, colors: ['#ffc94d', '#ff6ba9', '#8a6cff', '#7ef0c0', '#ffffff'], speed: 9, gravity: 0.16 });
      if (Math.random() < 0.4) audio.play('firework', { volume: 0.4 });
    }, 1700);
  }

  /* ============================================================
     杂项
     ============================================================ */

  Game.showEnding = showEnding;
  Game.showTitle = showTitle;
  Game.updateJar = updateJar;

  // 页面加载完成后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Game.boot(); });
  } else {
    Game.boot();
  }
})();
