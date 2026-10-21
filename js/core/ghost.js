/* NF.Ghost — 幽灵鼠标教学：只演示，不替玩家通关 */
(function () {
  'use strict';
  window.NF = window.NF || {};

  var layer = null;
  var cursor = null;
  var token = 0;
  var playing = false;
  var pos = { x: -80, y: -80 };
  var zIndex = 960;
  var timers = [];
  var sleepers = [];   // 取消时要立刻 resolve 的挂起 sleep，避免 play() 永远 pending

  function ensureLayer() {
    if (layer) return layer;
    layer = document.getElementById('ghost-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'ghost-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  var ARROW = '<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M4.5 2.5l19.6 14.2-8.4 1.5 4.6 9.2-4.1 2-4.5-9.3-7.2 5.4z" fill="#ffffff" stroke="#1b1b2b" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  function ensureCursor() {
    ensureLayer();
    if (cursor && cursor.isConnected) return cursor;
    cursor = document.createElement('div');
    cursor.className = 'ghost-cursor';
    cursor.innerHTML = ARROW;
    cursor.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)';
    layer.appendChild(cursor);
    return cursor;
  }

  function hideCursor(immediate) {
    if (!cursor) return;
    var c = cursor;
    c.style.transition = 'opacity .3s ease, transform .3s ease';
    c.style.opacity = '0';
    setTimeout(function () {
      if (c.isConnected && !c._active) c.remove();
    }, immediate ? 0 : 320);
    cursor = null;
  }

  function showCursor() {
    ensureCursor();
    cursor._active = true;
    cursor.style.opacity = '1';
    cursor.style.transition = 'opacity .2s ease';
  }

  function setPressed(on) {
    if (!cursor) return;
    cursor.classList.toggle('is-pressed', !!on);
    if (on) {
      cursor.style.transform += '';
    }
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function resolvePoint(target) {
    if (typeof target === 'function') target = target();
    return NF.OS.pointOf(target);
  }

  function sleep(ms, tk) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      var id = setTimeout(function () {
        finish(tk === token);
      }, Math.max(0, ms));
      timers.push(id);
      sleepers.push(function () {
        try { clearTimeout(id); } catch (e) {}
        finish(false);
      });
    });
  }

  function moveTo(x, y, dur, tk) {
    return new Promise(function (resolve) {
      if (tk !== token) { resolve(false); return; }
      var from = { x: pos.x, y: pos.y };
      var dist = Math.hypot(x - from.x, y - from.y);
      if (dur == null) dur = Math.min(900, 260 + dist * 0.85);
      if (dur <= 0 || dist < 1) {
        pos.x = x; pos.y = y;
        if (cursor) cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        resolve(true);
        return;
      }
      var start = performance.now();
      var lastTrail = 0;
      function tick(now) {
        if (tk !== token) { resolve(false); return; }
        var t = Math.min(1, (now - start) / dur);
        var e = easeInOut(t);
        pos.x = from.x + (x - from.x) * e;
        pos.y = from.y + (y - from.y) * e;
        if (cursor) cursor.style.transform = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0)';
        if (now - lastTrail > 46 && dist > 60) {
          lastTrail = now;
          addTrail(pos.x, pos.y);
        }
        if (t < 1) requestAnimationFrame(tick);
        else resolve(true);
      }
      requestAnimationFrame(tick);
    });
  }

  function addTrail(x, y) {
    var d = document.createElement('div');
    d.className = 'ghost-trail';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    zIndex += 1;
    d.style.zIndex = String(zIndex);
    layer.appendChild(d);
    setTimeout(function () { d.remove(); }, 620);
  }

  function addRipple(x, y, isRight) {
    var r = document.createElement('div');
    r.className = 'ghost-ripple' + (isRight ? ' right' : '');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    zIndex += 1;
    r.style.zIndex = String(zIndex);
    layer.appendChild(r);
    setTimeout(function () { r.remove(); }, 600);
    NF.Audio.play(isRight ? 'click' : 'click', { volume: 0.4 });
  }

  function addHighlight(target, dur, tk) {
    var p = resolvePoint(target);
    var el = p.el || (typeof target === 'string' ? document.querySelector(target) : null);
    var r = el ? NF.OS.rect(el) : { left: p.x - 30, top: p.y - 30, width: 60, height: 60 };
    var box = document.createElement('div');
    box.className = 'ghost-highlight';
    box.style.left = (r.left - 5) + 'px';
    box.style.top = (r.top - 5) + 'px';
    box.style.width = (r.width + 10) + 'px';
    box.style.height = (r.height + 10) + 'px';
    layer.appendChild(box);
    return sleep(dur || 700, tk).then(function () { box.remove(); });
  }

  var KEY_LABELS = {
    ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Win',
    enter: 'Enter', return: 'Enter', esc: 'Esc', escape: 'Esc',
    space: 'Space', ' ': 'Space', tab: 'Tab', backspace: '⌫', delete: 'Del',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    equal: '=', minus: '-'
  };

  function keycapLabel(k) {
    var low = k.toLowerCase();
    if (KEY_LABELS[low]) return KEY_LABELS[low];
    if (low.length === 1) return k.toUpperCase();
    return k;
  }

  function showKeys(combo, dur, tk) {
    var parts = combo.split('+').map(function (s) { return s.trim(); }).filter(Boolean);
    var box = document.createElement('div');
    box.className = 'ghost-keys';
    box.style.left = pos.x + 'px';
    box.style.top = (pos.y - 22) + 'px';
    box.style.zIndex = String(++zIndex);
    layer.appendChild(box);
    var caps = [];
    parts.forEach(function (p, i) {
      if (i > 0) {
        var plus = document.createElement('span');
        plus.className = 'plus';
        plus.textContent = '+';
        box.appendChild(plus);
      }
      var cap = document.createElement('span');
      cap.className = 'ghost-keycap';
      cap.textContent = keycapLabel(p);
      cap.style.animationDelay = (i * 55) + 'ms';
      box.appendChild(cap);
      caps.push(cap);
    });
    var step = 170;
    var total = Math.max(dur || 0, caps.length * step + 500);
    caps.forEach(function (cap, i) {
      setTimeout(function () {
        if (tk !== token) return;
        cap.classList.add('keycap-press');
        NF.Audio.play('key', { volume: 0.4 });
        setTimeout(function () { cap.classList.remove('keycap-press'); }, 180);
      }, 260 + i * step);
    });
    return sleep(total, tk).then(function () {
      box.style.transition = 'opacity .25s ease';
      box.style.opacity = '0';
      setTimeout(function () { box.remove(); }, 280);
    });
  }

  function showType(text, tk) {
    return new Promise(function (resolve) {
      var bubble = document.createElement('div');
      bubble.className = 'ghost-type';
      bubble.style.left = pos.x + 'px';
      bubble.style.top = pos.y + 'px';
      bubble.style.zIndex = String(++zIndex);
      layer.appendChild(bubble);
      var i = 0;
      function step() {
        if (tk !== token) { bubble.remove(); resolve(false); return; }
        i++;
        bubble.innerHTML = escapeHtml(text.slice(0, i)) + '<span class="caret"></span>';
        if (i % 2 === 0) NF.Audio.play('type', { volume: 0.25 });
        if (i < text.length) setTimeout(step, 55);
        else {
          setTimeout(function () {
            if (tk !== token) { bubble.remove(); resolve(false); return; }
            bubble.style.transition = 'opacity .3s ease';
            bubble.style.opacity = '0';
            setTimeout(function () { bubble.remove(); }, 300);
            resolve(true);
          }, 700);
        }
      }
      step();
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function runStep(step, tk) {
    if (tk !== token) return false;
    if (step.wait) {
      var ok = await sleep(step.wait, tk);
      if (!ok || tk !== token) return false;
      if (!step.move && !step.click && !step.key && !step.keys && !step.type && !step.drag && !step.highlight && !step.do) return true;
    }
    if (step.move != null) {
      var p = resolvePoint(step.move);
      await moveTo(p.x, p.y, step.dur, tk);
      if (tk !== token) return false;
    }
    if (step.highlight != null) {
      await addHighlight(step.highlight, step.dur || 700, tk);
      if (tk !== token) return false;
    }
    if (step.key != null || step.keys != null) {
      await showKeys(step.key || step.keys, step.dur, tk);
      if (tk !== token) return false;
    }
    if (step.type != null) {
      await showType(step.type, tk);
      if (tk !== token) return false;
    }
    if (step.click != null) {
      var cp = step.target != null ? resolvePoint(step.target) : null;
      if (cp && Math.hypot(cp.x - pos.x, cp.y - pos.y) > 6) await moveTo(cp.x, cp.y, step.moveDur != null ? step.moveDur : 280, tk);
      else if (cp) { pos.x = cp.x; pos.y = cp.y; if (cursor) cursor.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)'; }
      if (tk !== token) return false;
      showCursor();
      setPressed(true);
      if (step.click === 'right') cursor.classList.add('is-right');
      await sleep(80, tk);
      if (tk !== token) return false;
      setPressed(false);
      addRipple(pos.x, pos.y, step.click === 'right');
      if (step.click === 'right') cursor.classList.remove('is-right');
      if (step.do && tk === token) {
        try { await step.do(); } catch (err) { console.warn('[ghost] do failed', err); }
      }
      await sleep(step.after != null ? step.after : 240, tk);
      if (tk !== token) return false;
    }
    if (step.drag != null && step.drag.from != null && step.drag.to != null) {
      var from = resolvePoint(step.drag.from);
      var to = resolvePoint(step.drag.to);
      await moveTo(from.x, from.y, step.drag.moveDur || 460, tk);
      if (tk !== token) return false;
      showCursor();
      setPressed(true);
      addRipple(pos.x, pos.y, false);
      await tuneSleep(120, tk);
      if (tk !== token) return false;
      await moveTo(to.x, to.y, step.drag.dur || step.dur || 900, tk);
      if (tk !== token) return false;
      setPressed(false);
      addRipple(pos.x, pos.y, false);
      await tuneSleep(step.drag.after != null ? step.drag.after : 260, tk);
      if (tk !== token) return false;
    }
    if (step.hold != null) {
      var hp = resolvePoint(step.hold);
      await moveTo(hp.x, hp.y, step.moveDur != null ? step.moveDur : 460, tk);
      if (tk !== token) return false;
      showCursor();
      setPressed(true);
      addRipple(pos.x, pos.y, false);
      NF.Audio.play('paper', { volume: 0.3 });
      var ring = document.createElement('div');
      ring.className = 'ghost-hold-ring';
      ring.style.left = pos.x + 'px';
      ring.style.top = pos.y + 'px';
      layer.appendChild(ring);
      var holdDur = step.dur != null ? step.dur : 1200;
      var t0 = performance.now();
      var held = await new Promise(function (resolve) {
        function tick(now) {
          if (tk !== token) { resolve(false); return; }
          var p = Math.min(1, (now - t0) / holdDur);
          ring.style.background = 'conic-gradient(rgba(255,212,92,.95) ' + (p * 100).toFixed(1) + '%, rgba(255,255,255,.12) 0)';
          if (p < 1) requestAnimationFrame(tick);
          else resolve(true);
        }
        requestAnimationFrame(tick);
      });
      setPressed(false);
      ring.remove();
      if (!held || tk !== token) return false;
      addRipple(pos.x, pos.y, false);
      NF.Audio.play('snap', { volume: 0.5 });
      await sleep(step.after != null ? step.after : 220, tk);
      if (tk !== token) return false;
    }
    if (step.do && tk === token) {
      try { await step.do(); } catch (err) { console.warn('[ghost] do failed', err); }
    }
    if (tk !== token) return false;
    return true;
  }

  function tuneSleep(ms, tk) { return sleep(ms, tk); }

  var Ghost = {
    isPlaying: function () { return playing; },
    position: function () { return { x: pos.x, y: pos.y }; },
    play: async function (steps) {
      ensureLayer();
      Ghost.cancel({ silent: true });
      sleepers.length = 0;
      var tk = token;
      playing = true;
      pos = { x: innerWidth * 0.5, y: innerHeight * 0.62 };
      showCursor();
      if (cursor) cursor.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)';
      try {
        for (var i = 0; i < steps.length; i++) {
          if (tk !== token) break;
          var keep = await runStep(steps[i], tk);
          if (!keep) break;
        }
      } finally {
        if (tk === token) {
          playing = false;
          hideCursor();
        }
      }
      return tk === token;
    },
    cancel: function (opts) {
      token++;
      playing = false;
      timers.forEach(function (t) { clearTimeout(t); });
      timers = [];
      var pending = sleepers.splice(0);
      pending.forEach(function (finish) {
        try { finish(); } catch (e) {}
      });
      if (layer) {
        Array.prototype.slice.call(layer.children).forEach(function (child) {
          if (child !== cursor) child.remove();
        });
      }
      if (!opts || !opts.silent) hideCursor(true);
    },
    hide: function () { hideCursor(true); },
    ensure: ensureCursor
  };

  NF.Ghost = Ghost;
})();
