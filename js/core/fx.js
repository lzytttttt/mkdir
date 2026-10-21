/* NF.FX — 全屏 Canvas 粒子 / 纸屑 / 涟漪 / 震屏 / 闪白 / 飞行动画
 * 契约：docs/ENGINE.md 第 6 节
 * - 全屏 #fx-canvas（pointer-events:none, z-index:90, DPR 适配）
 * - 对象池 + 粒子上限 480（<500）；rAF 循环按需运行，闲置时自动停止
 * - prefers-reduced-motion 时减少粒子数量，但保留反馈
 * - 经典 script（非 ES module），挂载在 window.NF 命名空间
 */
(function () {
  'use strict';

  window.NF = window.NF || {};

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 480;      // 粒子硬上限（契约要求 < 500）
  var MAX_RIPPLES = 24;
  var MAX_FLIGHTS = 16;
  var MAX_DPR = 2.5;

  /* 主题色板：文件夹金黄 + 强调蓝 / 青 / 粉 + 白 */
  var PALETTE = ['#ffc94d', '#ffb020', '#ffe08a', '#5b7cfa', '#8fb3ff', '#7ef0c0', '#ff6ba9', '#ffffff', '#c9d4ec'];
  var WARM = ['#ffc94d', '#ffb020', '#ffe08a', '#fff7cc', '#ffffff'];
  var DUST_COLORS = ['#c9d4ec', '#9fb4dd', '#e6ecfa', '#b9c6e6'];

  var canvas = null;
  var g = null;
  var dpr = 1;
  var W = 1;
  var H = 1;

  var inited = false;
  var running = false;
  var rafId = 0;
  var lastT = 0;
  var reduced = false;

  var particles = [];
  var pool = [];
  var ripples = [];
  var flashes = [];
  var flights = [];
  var shakeState = null;
  var errorLog = [];

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function numOr(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function nowMs() {
    try {
      if (window.performance && typeof performance.now === 'function') return performance.now();
    } catch (e) {}
    return Date.now();
  }

  function logError(e) {
    try {
      errorLog.push(String((e && e.message) || e));
      if (errorLog.length > 20) errorLog.shift();
    } catch (e2) {}
  }

  /* 统一安全包裹：对外方法永不抛异常 */
  function safe(fn) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (e) {
        logError(e);
        return undefined;
      }
    };
  }

  function normalizeColors(c) {
    if (!c) return null;
    if (typeof c === 'string') return [c];
    if (Object.prototype.toString.call(c) === '[object Array]') {
      var out = [];
      for (var i = 0; i < c.length; i++) {
        if (typeof c[i] === 'string') out.push(c[i]);
      }
      return out.length ? out : null;
    }
    return null;
  }

  /* 兼容 DOMRect / Element / {x,y,w,h} / {x,y,width,height} */
  function boxOf(r) {
    if (!r) return { x: 0, y: 0, w: 0, h: 0 };
    try {
      if (typeof r.getBoundingClientRect === 'function') {
        var b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
      }
    } catch (e) {}
    var w = r.width != null ? r.width : (r.w != null ? r.w : 0);
    var h = r.height != null ? r.height : (r.h != null ? r.h : 0);
    var x = r.x != null ? r.x : (r.left != null ? r.left : 0);
    var y = r.y != null ? r.y : (r.top != null ? r.top : 0);
    return { x: numOr(x, 0), y: numOr(y, 0), w: numOr(w, 0), h: numOr(h, 0) };
  }

  /* ------------------------------------------------------------------ *
   * 初始化 / 尺寸
   * ------------------------------------------------------------------ */

  function styleCanvas(c) {
    var s = c.style;
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.display = 'block';
    s.pointerEvents = 'none';
    s.zIndex = '90';
    s.background = 'transparent';
  }

  function setupReducedMotion() {
    try {
      if (!window.matchMedia) return;
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced = !!mq.matches;
      var handler = function (e) {
        reduced = !!e.matches;
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
      else if (typeof mq.addListener === 'function') mq.addListener(handler);
    } catch (e) {}
  }

  function initFx() {
    if (inited) {
      if (canvas && canvas.parentNode !== document.body) {
        try { document.body.appendChild(canvas); } catch (e) {}
      }
      return;
    }
    if (!document.body) return;
    var c = document.getElementById('fx-canvas');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'fx-canvas';
      try { c.setAttribute('aria-hidden', 'true'); } catch (e) {}
      document.body.appendChild(c);
    }
    canvas = c;
    try {
      g = typeof c.getContext === 'function' ? c.getContext('2d') : null;
    } catch (e) {
      g = null;
    }
    styleCanvas(c);
    inited = true;
    try {
      window.addEventListener('resize', onResize, false);
      window.addEventListener('orientationchange', onResize, false);
    } catch (e) {}
    setupReducedMotion();
    onResize();
  }

  function onResize() {
    if (!canvas) return;
    W = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    H = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    dpr = clamp(numOr(window.devicePixelRatio, 1), 1, MAX_DPR);
    try {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    } catch (e) {}
    if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) clearCanvas();
  }

  function clearCanvas() {
    if (!g) return;
    try {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
    } catch (e) {}
  }

  function ready() {
    if (!inited) initFx();
    return inited;
  }

  /* ------------------------------------------------------------------ *
   * 粒子对象池
   * ------------------------------------------------------------------ */

  function spawn(o) {
    if (particles.length >= MAX_PARTICLES) return null;   // 达上限：丢弃新粒子，不报错
    var p = pool.pop();
    if (!p) {
      p = {
        x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1, age: 0, life: 1000,
        size: 3, rot: 0, vr: 0, color: '#fff', shape: 'rect',
        alpha: 1, fade: 1, add: false, seed: 0, wobble: 0
      };
    }
    p.x = numOr(o.x, 0);
    p.y = numOr(o.y, 0);
    p.vx = numOr(o.vx, 0);
    p.vy = numOr(o.vy, 0);
    p.g = numOr(o.g, 0);
    p.drag = o.drag == null ? 1 : numOr(o.drag, 1);
    p.age = 0;
    p.life = Math.max(60, numOr(o.life, 900));
    p.size = Math.max(0.5, numOr(o.size, 3));
    p.rot = numOr(o.rot, 0);
    p.vr = numOr(o.vr, 0);
    p.color = o.color || '#fff';
    p.shape = o.shape || 'rect';
    p.alpha = o.alpha == null ? 1 : numOr(o.alpha, 1);
    p.fade = 1;
    p.add = !!o.add;
    p.seed = numOr(o.seed, 0);
    p.wobble = numOr(o.wobble, 0);
    particles.push(p);
    return p;
  }

  function killAt(i) {
    var last = particles.length - 1;
    var p = particles[i];
    if (i !== last) particles[i] = particles[last];
    particles.pop();
    if (pool.length < MAX_PARTICLES) pool.push(p);
  }

  function updateParticles(dt, f) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        killAt(i);
        continue;
      }
      if (p.g) p.vy += p.g * f;
      if (p.drag !== 1) {
        var dr = Math.pow(p.drag, f);
        p.vx *= dr;
        p.vy *= dr;
      }
      p.x += p.vx * f;
      p.y += p.vy * f;
      if (p.wobble) p.x += Math.sin(p.age * 0.006 + p.seed) * p.wobble * f;
      p.rot += p.vr * f;
      var k = p.age / p.life;
      p.fade = k > 0.72 ? (1 - k) / 0.28 : 1;
      if (p.y > H + 120 || p.y < -320 || p.x < -100 || p.x > W + 100) {
        killAt(i);
        continue;
      }
    }
  }

  function drawStar(x, y, r, rot, points) {
    var n = points || 5;
    var inner = r * 0.42;
    g.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? inner : r;
      var a = rot + (i * Math.PI) / n - Math.PI / 2;
      var px = x + Math.cos(a) * rr;
      var py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = p.alpha * p.fade;
      if (a <= 0.012) continue;
      g.globalAlpha = Math.min(1, a);
      g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      g.fillStyle = p.color;
      if (p.shape === 'circle') {
        g.beginPath();
        g.arc(p.x, p.y, p.size * 0.5, 0, TAU);
        g.fill();
      } else if (p.shape === 'star') {
        drawStar(p.x, p.y, p.size * 0.75, p.rot, p.add ? 4 : 5);
      } else if (p.shape === 'line') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.size * 0.5, -p.size * 0.09, p.size, p.size * 0.18);
        g.restore();
      } else {
        g.save();
        g.translate(p.x, p.y);
        if (p.rot) g.rotate(p.rot);
        g.fillRect(-p.size * 0.5, -p.size * 0.27, p.size, p.size * 0.54);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ *
   * 涟漪
   * ------------------------------------------------------------------ */

  function addRipple(x, y, opt) {
    opt = opt || {};
    var color = typeof opt.color === 'string' ? opt.color : '#ffffff';
    var maxR = Math.max(6, numOr(opt.radius, 40));
    var ms = Math.max(80, numOr(opt.ms, 500));
    ripples.push({ x: numOr(x, W / 2), y: numOr(y, H / 2), color: color, max: maxR, ms: ms, age: 0 });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  }

  function updateRipples(dt) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age >= ripples[i].ms) ripples.splice(i, 1);
    }
  }

  function drawRipples() {
    for (var i = 0; i < ripples.length; i++) {
      var rp = ripples[i];
      var k = rp.age / rp.ms;
      var ease = 1 - Math.pow(1 - k, 3);
      var rad = rp.max * ease;
      var alpha = (1 - k) * 0.8;
      g.globalAlpha = alpha;
      g.strokeStyle = rp.color;
      g.lineWidth = Math.max(0.8, 2.6 * (1 - k));
      g.beginPath();
      g.arc(rp.x, rp.y, rad, 0, TAU);
      g.stroke();
      g.globalAlpha = alpha * 0.35;
      g.lineWidth = Math.max(0.6, 1.6 * (1 - k));
      g.beginPath();
      g.arc(rp.x, rp.y, rad * 1.6, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * 全屏闪白
   * ------------------------------------------------------------------ */

  function addFlash(color, ms) {
    var c = typeof color === 'string' && color ? color : '#fff';
    var dur = Math.max(60, numOr(ms, 250));
    flashes.push({ color: c, ms: dur, age: 0, alpha: reduced ? 0.55 : 0.9 });
    if (flashes.length > 4) flashes.shift();
  }

  function updateFlashes(dt) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += dt;
      if (flashes[i].age >= flashes[i].ms) flashes.splice(i, 1);
    }
  }

  function drawFlashes() {
    for (var i = 0; i < flashes.length; i++) {
      var fl = flashes[i];
      var k = fl.age / fl.ms;
      g.globalAlpha = (1 - k) * fl.alpha;
      g.fillStyle = fl.color;
      g.fillRect(0, 0, W, H);
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * 震屏：#os-wrap 的 transform（叠加已有 transform，结束恢复）
   * ------------------------------------------------------------------ */

  function targetShakeEl() {
    return document.getElementById('os-wrap') || document.body || document.documentElement;
  }

  function endShake() {
    if (!shakeState) return;
    try {
      if (shakeState.el && shakeState.el.style) {
        shakeState.el.style.transform = shakeState.prev || '';
        shakeState.el.style.willChange = shakeState.willChange || '';
        shakeState.el.style.transition = shakeState.transition || '';
      }
    } catch (e) {}
    shakeState = null;
  }

  function startShake(intensity, ms) {
    var amp = clamp(numOr(intensity, 8), 0.5, 40);
    var dur = Math.max(80, numOr(ms, 350));
    if (reduced) amp *= 0.5;
    var el = targetShakeEl();
    if (!el) return;

    if (shakeState && shakeState.el === el) {
      shakeState.intensity = Math.max(shakeState.intensity, amp);
      shakeState.dur = dur;
      shakeState.age = 0;
      return;
    }
    endShake();
    var prev = '';
    var willChange = '';
    var transition = '';
    try {
      prev = el.style.transform || '';
      willChange = el.style.willChange || '';
      transition = el.style.transition || '';
    } catch (e) {}
    var base = prev;
    if (!base) {
      try {
        var cs = window.getComputedStyle(el);
        if (cs && cs.transform && cs.transform !== 'none') base = cs.transform;
      } catch (e) {}
    }
    shakeState = {
      el: el,
      prev: prev,
      willChange: willChange,
      transition: transition,
      base: base,
      intensity: amp,
      dur: dur,
      age: 0
    };
    try {
      el.style.willChange = 'transform';
      el.style.transition = 'none';   // 避免 CSS 过渡把抖动拖慢
    } catch (e) {}
  }

  function updateShake(dt) {
    if (!shakeState) return;
    shakeState.age += dt;
    if (shakeState.age >= shakeState.dur) {
      endShake();
      return;
    }
    try {
      var a = shakeState.age;
      var k = 1 - a / shakeState.dur;
      var amp = shakeState.intensity * k;
      var dx = (Math.sin(a * 0.085) + 0.5 * Math.sin(a * 0.21 + 1.7)) * amp * 0.55;
      var dy = (Math.cos(a * 0.13 + 0.6) + 0.5 * Math.sin(a * 0.17)) * amp * 0.35;
      var move = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
      shakeState.el.style.transform = shakeState.base ? shakeState.base + ' ' + move : move;
    } catch (e) {
      endShake();
    }
  }

  /* ------------------------------------------------------------------ *
   * 飞行动画：DOM 克隆沿抛物线飞行
   * ------------------------------------------------------------------ */

  function makeFlyContent(el, content) {
    if (typeof content === 'string') {
      el.innerHTML = content;
      return;
    }
    if (content && content.nodeType === 1) {
      var clone = content.cloneNode(true);
      try {
        clone.style.position = 'relative';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
      } catch (e) {}
      el.appendChild(clone);
      return;
    }
    var svg = '';
    try {
      if (window.NF && NF.icons && typeof NF.icons.svg === 'function') svg = NF.icons.svg('folder', '');
    } catch (e) {}
    if (svg) el.innerHTML = svg;
    else {
      var box = document.createElement('div');
      box.style.cssText = 'width:100%;height:100%;border-radius:8px;background:#ffc94d;box-shadow:inset 0 -6px 0 rgba(0,0,0,.12);';
      el.appendChild(box);
    }
  }

  function addFly(fromRect, toRect, opt) {
    if (!ready()) return null;
    opt = opt || {};
    var from = boxOf(fromRect);
    var to = boxOf(toRect);
    var dur = Math.max(80, numOr(opt.duration, 700));
    if (reduced) dur = Math.max(120, Math.round(dur * 0.75));

    var el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    var s = el.style;
    s.position = 'fixed';
    s.left = from.x + 'px';
    s.top = from.y + 'px';
    s.width = Math.max(1, from.w) + 'px';
    s.height = Math.max(1, from.h) + 'px';
    s.display = 'flex';
    s.alignItems = 'center';
    s.justifyContent = 'center';
    s.pointerEvents = 'none';
    s.zIndex = '96';
    s.transformOrigin = '50% 50%';
    s.willChange = 'transform,opacity';
    s.filter = 'drop-shadow(0 10px 18px rgba(8,6,24,.35))';

    var content = null;
    if (opt.html != null) content = opt.html;
    else if (opt.el && opt.el.nodeType === 1) content = opt.el;
    else if (fromRect && fromRect.nodeType === 1) content = fromRect;
    try {
      makeFlyContent(el, content);
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i];
        try {
          kid.style.width = '100%';
          kid.style.height = '100%';
          if (kid.tagName && String(kid.tagName).toLowerCase() === 'svg') {
            kid.setAttribute('width', '100%');
            kid.setAttribute('height', '100%');
            kid.style.display = 'block';
          }
        } catch (e) {}
      }
    } catch (e) {
      logError(e);
    }

    try {
      document.body.appendChild(el);
    } catch (e) {
      return null;
    }

    flights.push({
      el: el,
      from: from,
      to: to,
      dur: dur,
      arc: numOr(opt.arc, -120),
      age: 0,
      done: false,
      onDone: typeof opt.onDone === 'function' ? opt.onDone : null,
      fade: opt.fade !== false,
      rot: rand(-5, 5)
    });
    if (flights.length > MAX_FLIGHTS) {
      var old = flights.shift();
      try { if (old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el); } catch (e) {}
    }
    wake();
    return el;
  }

  function updateFlights(dt) {
    for (var i = flights.length - 1; i >= 0; i--) {
      var fl = flights[i];
      fl.age += dt;
      var k = fl.age / fl.dur;
      if (k >= 1) {
        flights.splice(i, 1);
        try {
          if (fl.el && fl.el.parentNode) fl.el.parentNode.removeChild(fl.el);
        } catch (e) {}
        if (!fl.done) {
          fl.done = true;
          if (fl.onDone) {
            try { fl.onDone(); } catch (e) { logError(e); }
          }
        }
        continue;
      }
      try {
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;  // easeInOutQuad
        var x0 = fl.from.x + fl.from.w * 0.5;
        var y0 = fl.from.y + fl.from.h * 0.5;
        var x1 = fl.to.x + fl.to.w * 0.5;
        var y1 = fl.to.y + fl.to.h * 0.5;
        var cx = x0 + (x1 - x0) * e;
        var cy = y0 + (y1 - y0) * e;
        var lift = fl.arc * Math.sin(Math.PI * k);
        var scale = 1;
        if (fl.from.w > 4 && fl.to.w > 0) scale = fl.to.w / fl.from.w;
        scale = clamp(scale, 0.15, 1.6);
        var sc = 1 + (scale - 1) * e;
        var rot = fl.rot * Math.sin(Math.PI * k);
        var op = 1;
        if (fl.fade && k > 0.8) op = Math.max(0, 1 - (k - 0.8) / 0.2);
        fl.el.style.transform = 'translate3d(' + (cx - x0).toFixed(2) + 'px,' + (cy + lift - y0).toFixed(2) + 'px,0) scale(' + sc.toFixed(3) + ') rotate(' + rot.toFixed(2) + 'deg)';
        fl.el.style.opacity = op.toFixed(3);
      } catch (e) {
        flights.splice(i, 1);
        try {
          if (fl.el && fl.el.parentNode) fl.el.parentNode.removeChild(fl.el);
        } catch (e2) {}
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 主循环：有活才跑，空闲即停
   * ------------------------------------------------------------------ */

  function hasWork() {
    return particles.length > 0 || ripples.length > 0 || flashes.length > 0 || flights.length > 0 || !!shakeState;
  }

  function wake() {
    if (!inited || running) return;
    running = true;
    lastT = 0;
    try {
      rafId = requestAnimationFrame(tick);
    } catch (e) {
      running = false;
    }
  }

  function tick(ts) {
    if (!running) return;
    rafId = 0;
    if (!lastT) lastT = ts;
    var dt = ts - lastT;
    lastT = ts;
    if (!(dt >= 0)) dt = 16.7;
    if (dt > 50) dt = 50;              // 切后台回来时避免爆帧
    var f = dt / 16.6667;

    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
    }

    updateShake(dt);
    updateFlights(dt);
    updateParticles(dt, f);
    updateRipples(dt);
    updateFlashes(dt);

    if (g) {
      drawParticles();
      drawRipples();
      drawFlashes();
    }

    if (hasWork()) {
      try {
        rafId = requestAnimationFrame(tick);
      } catch (e) {
        running = false;
      }
    } else {
      running = false;
      lastT = 0;
      clearCanvas();
    }
  }

  /* ------------------------------------------------------------------ *
   * 对外效果
   * ------------------------------------------------------------------ */

  function doBurst(x, y, opt) {
    if (!ready()) return;
    opt = opt || {};
    var px = numOr(x, W / 2);
    var py = numOr(y, H / 2);
    var count = Math.round(Math.max(1, numOr(opt.count, 24)) * (reduced ? 0.45 : 1));
    var colors = normalizeColors(opt.colors) || PALETTE;
    var baseSpeed = numOr(opt.speed, 8);
    var gravity = numOr(opt.gravity, 0.2);
    var life = Math.max(120, numOr(opt.life, 900));
    var shapeOpt = opt.shape || 'rect';
    var shapes = Object.prototype.toString.call(shapeOpt) === '[object Array]' ? shapeOpt : [shapeOpt];
    var sizeOpt = opt.size;

    for (var i = 0; i < count; i++) {
      var ang = rand(0, TAU);
      var spd = baseSpeed * rand(0.35, 1.15);
      var size;
      if (sizeOpt == null) size = rand(3, 6);
      else if (Object.prototype.toString.call(sizeOpt) === '[object Array]') size = rand(numOr(sizeOpt[0], 3), numOr(sizeOpt[1], 6));
      else size = numOr(sizeOpt, 4);
      var shape = pick(shapes);
      spawn({
        x: px,
        y: py,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - baseSpeed * 0.12,
        g: gravity,
        drag: 0.99,
        life: life * rand(0.7, 1.15),
        size: size,
        color: pick(colors),
        shape: shape,
        rot: rand(0, TAU),
        vr: rand(-0.35, 0.35),
        alpha: 1
      });
    }
    wake();
  }

  function doConfetti(opt) {
    if (!ready()) return;
    if (typeof opt === 'string') opt = { origin: opt };
    opt = opt || {};
    var count = Math.round(Math.max(1, numOr(opt.count, 80)) * (reduced ? 0.35 : 1));
    var colors = normalizeColors(opt.colors) || PALETTE;
    var origin = opt.origin;
    var hasPoint = origin && typeof origin === 'object';

    for (var i = 0; i < count; i++) {
      var ox;
      var oy;
      if (hasPoint) {
        ox = numOr(origin.x, W / 2) + rand(-10, 10);
        oy = numOr(origin.y, -20) + rand(-10, 10);
      } else {
        ox = rand(-10, W + 10);
        oy = rand(-40, -8);
      }
      var r = Math.random();
      var shape = r < 0.55 ? 'rect' : (r < 0.8 ? 'circle' : 'star');
      spawn({
        x: ox,
        y: oy,
        vx: rand(-1.6, 1.6),
        vy: rand(2.2, 5.6),
        g: 0.055,
        drag: 0.995,
        life: rand(2800, 4600),
        size: rand(4, 9),
        color: pick(colors),
        shape: shape,
        rot: rand(0, TAU),
        vr: rand(-0.28, 0.28),
        alpha: 1,
        wobble: rand(0.4, 1.4),
        seed: rand(0, TAU)
      });
    }
    wake();
  }

  function doSparkle(x, y, color) {
    if (!ready()) return;
    var px = numOr(x, W / 2);
    var py = numOr(y, H / 2);
    var n = reduced ? 4 : 8;
    var cols = typeof color === 'string' && color ? [color] : ['#ffe08a', '#fff7cc', '#ffc94d', '#9ed2f5', '#ffffff'];
    for (var i = 0; i < n; i++) {
      var ang = rand(0, TAU);
      var spd = rand(1.2, 4.6);
      spawn({
        x: px,
        y: py,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(0.6, 1.8),
        g: 0.02,
        drag: 0.94,
        life: rand(420, 800),
        size: rand(3, 7),
        color: pick(cols),
        shape: 'star',
        rot: rand(0, TAU),
        vr: rand(-0.2, 0.2),
        alpha: 1,
        add: true
      });
    }
    // 中心的一颗大闪光
    spawn({
      x: px, y: py, vx: 0, vy: 0, g: 0, drag: 1,
      life: 220, size: 14, color: '#ffffff', shape: 'star',
      rot: 0, vr: 0, alpha: 0.9, add: true
    });
    wake();
  }

  function doRipple(x, y, opt) {
    if (!ready()) return;
    addRipple(x, y, opt);
    wake();
  }

  function doShake(intensity, ms) {
    if (!ready()) return;
    startShake(intensity, ms);
    wake();
  }

  function doFlash(color, ms) {
    if (!ready()) return;
    addFlash(color, ms);
    wake();
  }

  function doFly(fromRect, toRect, opt) {
    return addFly(fromRect, toRect, opt);
  }

  function doDust(x, y) {
    if (!ready()) return;
    var px = numOr(x, W / 2);
    var py = numOr(y, H / 2);
    var n = reduced ? 4 : 7;
    for (var i = 0; i < n; i++) {
      spawn({
        x: px + rand(-6, 6),
        y: py + rand(-6, 6),
        vx: rand(-1.6, 1.6),
        vy: rand(-1.8, -0.2),
        g: 0.04,
        drag: 0.94,
        life: rand(320, 620),
        size: rand(1.6, 3.6),
        color: pick(DUST_COLORS),
        shape: 'circle',
        alpha: 0.55
      });
    }
    wake();
  }

  /* 立即清空所有粒子/飞行/闪屏/抖动（切关卡时用，避免上一关的庆祝特效残留） */
  function doClear() {
    try {
      particles.length = 0;
      ripples.length = 0;
      flashes.length = 0;
      for (var i = 0; i < flights.length; i++) {
        var fl = flights[i];
        try { if (fl.el && fl.el.parentNode) fl.el.parentNode.removeChild(fl.el); } catch (e) {}
      }
      flights.length = 0;
      if (shakeState) endShake();
      clearCanvas();
    } catch (e) { logError(e); }
  }

  /* ------------------------------------------------------------------ *
   * 挂载 API（严格按契约名字）
   * ------------------------------------------------------------------ */

  NF.FX = {
    clear: safe(doClear),
    init: safe(function () { initFx(); }),
    burst: safe(doBurst),
    confetti: safe(doConfetti),
    sparkle: safe(doSparkle),
    ripple: safe(doRipple),
    shake: safe(doShake),
    flash: safe(doFlash),
    fly: safe(doFly),
    dust: safe(doDust),
    /* 内部调试信息（自测 / QA 用，不属于契约 API） */
    _state: function () {
      try {
        return {
          inited: inited,
          running: running,
          canvas: !!canvas,
          width: W,
          height: H,
          dpr: dpr,
          reduced: reduced,
          particles: particles.length,
          pool: pool.length,
          ripples: ripples.length,
          flashes: flashes.length,
          flights: flights.length,
          shaking: !!shakeState,
          errors: errorLog.slice(0, 10)
        };
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
    }
  };

})();
