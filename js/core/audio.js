/* NF.Audio — WebAudio 实时合成音效引擎
 * 契约：docs/ENGINE.md 第 5 节
 * - 所有音效均由 OscillatorNode / 噪声 buffer / BiquadFilter 现场合成，无外部资源
 * - 首次用户手势后才创建 / 恢复 AudioContext；AudioContext 不可用时全部方法静默降级
 * - 静音状态持久化在 localStorage('nf.muted')，setMuted 对已排程声音立即生效
 * - 经典 script（非 ES module），挂载在 window.NF 命名空间
 */
(function () {
  'use strict';

  window.NF = window.NF || {};

  var LS_MUTED = 'nf.muted';
  var MAX_SOURCES = 72;        // 同时存活的发声源上限，超出后丢弃新音效（防 CPU 过载 / 爆音）
  var MASTER_VOLUME = 0.82;    // 总输出音量（之后进压缩器）
  var NOISE_SECONDS = 2;       // 噪声 buffer 长度（复用）

  var AC = window.AudioContext || window.webkitAudioContext || null;
  var ctx = null;
  var masterIn = null;         // 所有声音的汇入点
  var compressor = null;       // 总线压缩 / 限幅
  var masterVol = null;
  var muteGain = null;
  var noiseBuffer = null;
  var broken = false;          // AudioContext 完全不可用
  var sourceList = [];         // 正在发声的源节点（静音时立即停止用）
  var errorLog = [];
  var muted = readMuted();
  var initialized = false;

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */

  function noop() {}

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function numOr(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function readMuted() {
    try {
      return localStorage.getItem(LS_MUTED) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeMuted(v) {
    try {
      localStorage.setItem(LS_MUTED, v ? '1' : '0');
    } catch (e) { /* 隐私模式 / file:// 下可能不可用，忽略 */ }
  }

  function logError(e) {
    try {
      errorLog.push(String((e && e.message) || e));
      if (errorLog.length > 20) errorLog.shift();
    } catch (e2) {}
  }

  function track(node) {
    sourceList.push(node);
    node.onended = function () {
      var i = sourceList.indexOf(node);
      if (i >= 0) sourceList.splice(i, 1);
    };
    return node;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  /* ------------------------------------------------------------------ *
   * AudioContext / 总线
   * ------------------------------------------------------------------ */

  function ensureCtx() {
    if (broken) return null;
    if (ctx) return ctx;
    if (!AC) {
      broken = true;
      return null;
    }
    try {
      ctx = new AC({ latencyHint: 'interactive' });

      // 音效总线：源 → masterIn → compressor（限幅）→ masterVol → muteGain → 输出
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 24;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.25;

      masterIn = ctx.createGain();
      masterIn.gain.value = 0.9;

      masterVol = ctx.createGain();
      masterVol.gain.value = MASTER_VOLUME;

      muteGain = ctx.createGain();
      muteGain.gain.value = muted ? 0 : 1;

      masterIn.connect(compressor);
      compressor.connect(masterVol);
      masterVol.connect(muteGain);
      muteGain.connect(ctx.destination);
      return ctx;
    } catch (e) {
      broken = true;
      ctx = null;
      return null;
    }
  }

  function ensureNoise() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    try {
      var len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      noiseBuffer = null;
      logError(e);
    }
    return noiseBuffer;
  }

  /* 创建一个带声像控制的增益节点，返回 GainNode；来源连接到它即可。 */
  function bus(peak, pan, dest) {
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    var tail = g;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      var p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      tail = p;
    }
    tail.connect(dest || masterIn);
    return g;
  }

  /* 一次性振荡器音：o = {t,type,f0,f1,dur,g,a,pan,linear,glide,detune} */
  function tone(o) {
    var t = o.t;
    var dur = Math.max(0.02, numOr(o.dur, 0.1));
    var peak = Math.max(0.0002, numOr(o.g, 0.1));
    var a = Math.min(Math.max(0.0008, numOr(o.a, 0.004)), dur * 0.6);
    var g = bus(peak, o.pan);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    var f0 = Math.max(1, numOr(o.f0, 440));
    var f1 = o.f1 == null ? null : Math.max(1, numOr(o.f1, f0));
    var glide = numOr(o.glide, dur);
    osc.frequency.setValueAtTime(f0, t);
    if (f1 != null) {
      if (o.linear) osc.frequency.linearRampToValueAtTime(f1, t + glide);
      else osc.frequency.exponentialRampToValueAtTime(f1, t + glide);
    }
    if (o.detune) osc.detune.value = o.detune;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.04);
    track(osc);
    return { osc: osc, gain: g };
  }

  /* 噪声音：o = {t,dur,g,a,pan,type,f0,f1,q,glide,rate,highpass} */
  function noiseHit(o) {
    var t = o.t;
    var dur = Math.max(0.015, numOr(o.dur, 0.08));
    var peak = Math.max(0.0002, numOr(o.g, 0.05));
    var a = Math.min(Math.max(0.0008, numOr(o.a, 0.003)), dur * 0.6);
    var buf = ensureNoise();
    if (!buf) return null;

    var g = bus(peak, o.pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = numOr(o.rate, 1);

    var filter = ctx.createBiquadFilter();
    filter.type = o.type || 'bandpass';
    filter.Q.value = numOr(o.q, 1);
    var f0 = Math.max(20, numOr(o.f0, 1200));
    filter.frequency.setValueAtTime(f0, t);
    if (o.f1 != null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, numOr(o.f1, f0)), t + numOr(o.glide, dur));
    }

    var tail = filter;
    if (o.highpass) {
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.highpass;
      filter.connect(hp);
      tail = hp;
    }
    src.connect(filter);
    tail.connect(g);
    try {
      src.start(t, Math.random() * (NOISE_SECONDS * 0.8));
    } catch (e) {
      src.start(t);
    }
    src.stop(t + dur + 0.06);
    track(src);
    return src;
  }

  /* 把低频振荡器接到某个 AudioParam 上（颤音 / 弹簧 / 机械振动） */
  function lfoTo(param, rate, depth, t, dur) {
    try {
      var l = ctx.createOscillator();
      l.type = 'sine';
      l.frequency.value = Math.max(0.1, rate);
      var g = ctx.createGain();
      g.gain.value = depth;
      l.connect(g);
      g.connect(param);
      l.start(t);
      l.stop(t + dur + 0.03);
      track(l);
    } catch (e) {
      logError(e);
    }
  }

  /* ------------------------------------------------------------------ *
   * 音效库：全部为 30-600ms 的短音（win 结尾长旋律例外）
   * 每个函数收到 {t:起始时间, v:音量系数, r:音高系数, p:声像}
   * ------------------------------------------------------------------ */

  var SOUNDS = {

    /* ------------------------- 基础 UI ------------------------- */

    click: function (o) {
      tone({ t: o.t, type: 'triangle', f0: 960 * o.r, f1: 520 * o.r, dur: 0.055, g: 0.16 * o.v, a: 0.002, pan: o.p });
      noiseHit({ t: o.t, type: 'highpass', f0: 2600, q: 0.8, dur: 0.02, g: 0.05 * o.v, a: 0.001, pan: o.p });
    },

    hover: function (o) {
      tone({ t: o.t, type: 'sine', f0: 1180 * o.r, f1: 1320 * o.r, dur: 0.04, g: 0.045 * o.v, a: 0.003, pan: o.p });
      tone({ t: o.t + 0.03, type: 'sine', f0: 1560 * o.r, f1: 1500 * o.r, dur: 0.035, g: 0.026 * o.v, a: 0.003, pan: o.p + 0.15 });
    },

    open: function (o) {
      tone({ t: o.t, type: 'triangle', f0: 300 * o.r, f1: 620 * o.r, dur: 0.14, g: 0.09 * o.v, a: 0.004, pan: o.p });
      tone({ t: o.t + 0.05, type: 'sine', f0: 620 * o.r, f1: 980 * o.r, dur: 0.12, g: 0.05 * o.v, a: 0.004, pan: o.p });
      noiseHit({ t: o.t, type: 'bandpass', f0: 900 * o.r, f1: 2600 * o.r, q: 0.9, dur: 0.12, g: 0.045 * o.v, a: 0.01, pan: o.p });
    },

    close: function (o) {
      tone({ t: o.t, type: 'triangle', f0: 560 * o.r, f1: 250 * o.r, dur: 0.13, g: 0.09 * o.v, a: 0.003, pan: o.p });
      noiseHit({ t: o.t, type: 'lowpass', f0: 1800, f1: 420, q: 0.9, dur: 0.1, g: 0.04 * o.v, a: 0.004, pan: o.p });
    },

    tick: function (o) {
      tone({ t: o.t, type: 'sine', f0: 2100 * o.r, dur: 0.025, g: 0.05 * o.v, a: 0.001, pan: o.p });
      noiseHit({ t: o.t, type: 'highpass', f0: 4000, q: 0.7, dur: 0.012, g: 0.024 * o.v, a: 0.001, pan: o.p });
    },

    /* ------------------------- 菜单 / 失败 ------------------------- */

    /* 菜单项逃跑：空气感 whoosh + 上滑音 */
    dodge: function (o) {
      noiseHit({ t: o.t, type: 'bandpass', f0: 520 * o.r, f1: 3200 * o.r, q: 1.6, dur: 0.13, g: 0.085 * o.v, a: 0.012, pan: o.p, glide: 0.11 });
      noiseHit({ t: o.t + 0.055, type: 'bandpass', f0: 3000 * o.r, f1: 600 * o.r, q: 1.2, dur: 0.12, g: 0.055 * o.v, a: 0.01, pan: o.p });
      tone({ t: o.t, type: 'sine', f0: 440 * o.r, f1: 1200 * o.r, dur: 0.14, g: 0.028 * o.v, a: 0.012, pan: o.p });
    },

    /* 禁用项：低沉的两段 buzz */
    deny: function (o) {
      tone({ t: o.t, type: 'square', f0: 112 * o.r, f1: 98 * o.r, dur: 0.17, g: 0.075 * o.v, a: 0.005, pan: o.p });
      tone({ t: o.t, type: 'sawtooth', f0: 84 * o.r, f1: 76 * o.r, dur: 0.17, g: 0.045 * o.v, a: 0.005, pan: o.p, detune: 9 });
      tone({ t: o.t + 0.18, type: 'square', f0: 92 * o.r, f1: 80 * o.r, dur: 0.16, g: 0.055 * o.v, a: 0.005, pan: o.p });
      noiseHit({ t: o.t, type: 'lowpass', f0: 520, q: 0.8, dur: 0.18, g: 0.02 * o.v, a: 0.006, pan: o.p });
    },

    /* 经典"叮—咚"下行报错音 */
    error: function (o) {
      tone({ t: o.t, type: 'sine', f0: 466 * o.r, f1: 440 * o.r, dur: 0.13, g: 0.09 * o.v, a: 0.004, pan: o.p });
      tone({ t: o.t, type: 'triangle', f0: 233 * o.r, dur: 0.13, g: 0.03 * o.v, a: 0.004, pan: o.p });
      tone({ t: o.t + 0.15, type: 'sine', f0: 349 * o.r, f1: 311 * o.r, dur: 0.2, g: 0.09 * o.v, a: 0.004, pan: o.p });
      tone({ t: o.t + 0.15, type: 'triangle', f0: 175 * o.r, dur: 0.2, g: 0.03 * o.v, a: 0.004, pan: o.p });
    },

    /* 菜单项选中：轻快的两连音 */
    select: function (o) {
      tone({ t: o.t, type: 'triangle', f0: 880 * o.r, f1: 900 * o.r, dur: 0.06, g: 0.07 * o.v, a: 0.002, pan: o.p });
      tone({ t: o.t + 0.055, type: 'sine', f0: 1320 * o.r, dur: 0.09, g: 0.05 * o.v, a: 0.003, pan: o.p });
    },

    /* ------------------------- 键盘 ------------------------- */

    key: function (o) {
      noiseHit({ t: o.t, type: 'highpass', f0: 1700, q: 0.9, dur: 0.028, g: 0.08 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'square', f0: 230 * o.r, f1: 180 * o.r, dur: 0.035, g: 0.045 * o.v, a: 0.001, pan: o.p });
    },

    type: function (o) {
      var j = 0.9 + Math.random() * 0.25;
      noiseHit({ t: o.t, type: 'bandpass', f0: 1200 * o.r * j, q: 1.1, dur: 0.03, g: 0.06 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'triangle', f0: 320 * o.r * j, dur: 0.025, g: 0.022 * o.v, a: 0.001, pan: o.p });
    },

    backspace: function (o) {
      noiseHit({ t: o.t, type: 'highpass', f0: 1500, q: 0.9, dur: 0.022, g: 0.06 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'square', f0: 520 * o.r, f1: 330 * o.r, dur: 0.05, g: 0.055 * o.v, a: 0.001, pan: o.p });
    },

    enter: function (o) {
      noiseHit({ t: o.t, type: 'highpass', f0: 1400, q: 0.8, dur: 0.03, g: 0.08 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'square', f0: 170 * o.r, f1: 130 * o.r, dur: 0.06, g: 0.07 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t + 0.04, type: 'sine', f0: 640 * o.r, dur: 0.08, g: 0.04 * o.v, a: 0.003, pan: o.p });
    },

    /* ------------------------- 桌面 ------------------------- */

    /* 文件夹"啵"地出现 */
    pop: function (o) {
      tone({ t: o.t, type: 'sine', f0: 900 * o.r, f1: 180 * o.r, dur: 0.12, g: 0.2 * o.v, a: 0.003, pan: o.p });
      tone({ t: o.t, type: 'triangle', f0: 620 * o.r, f1: 120 * o.r, dur: 0.1, g: 0.06 * o.v, a: 0.003, pan: o.p });
      noiseHit({ t: o.t, type: 'highpass', f0: 2000, q: 0.8, dur: 0.015, g: 0.04 * o.v, a: 0.001, pan: o.p });
    },

    /* 纸张翻动：多层滤噪颗粒 */
    paper: function (o) {
      var t = o.t;
      for (var i = 0; i < 5; i++) {
        noiseHit({
          t: t + i * 0.032,
          type: 'bandpass',
          f0: (1800 + Math.random() * 1800) * o.r,
          f1: (900 + Math.random() * 900) * o.r,
          q: 1.4,
          dur: 0.05 + Math.random() * 0.04,
          g: 0.035 * o.v,
          a: 0.004,
          pan: o.p + (Math.random() - 0.5) * 0.3
        });
      }
      noiseHit({ t: t, type: 'lowpass', f0: 3200, f1: 1200, q: 0.7, dur: 0.2, g: 0.03 * o.v, a: 0.01, pan: o.p });
    },

    /* 磁吸吸附：清脆"咔" */
    snap: function (o) {
      noiseHit({ t: o.t, type: 'highpass', f0: 3000, q: 0.9, dur: 0.018, g: 0.11 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'triangle', f0: 340 * o.r, f1: 300 * o.r, dur: 0.06, g: 0.08 * o.v, a: 0.001, pan: o.p });
      tone({ t: o.t, type: 'sine', f0: 680 * o.r, dur: 0.04, g: 0.04 * o.v, a: 0.001, pan: o.p });
    },

    /* 通用空气 whoosh */
    whoosh: function (o) {
      noiseHit({ t: o.t, type: 'bandpass', f0: 260 * o.r, f1: 2600 * o.r, q: 0.9, dur: 0.3, g: 0.085 * o.v, a: 0.03, pan: o.p });
      noiseHit({ t: o.t + 0.12, type: 'bandpass', f0: 2200 * o.r, f1: 400 * o.r, q: 0.8, dur: 0.22, g: 0.05 * o.v, a: 0.02, pan: o.p });
      tone({ t: o.t, type: 'sine', f0: 220 * o.r, f1: 440 * o.r, dur: 0.25, g: 0.02 * o.v, a: 0.03, pan: o.p });
    },

    /* 落地闷响 */
    thud: function (o) {
      tone({ t: o.t, type: 'sine', f0: 170 * o.r, f1: 55 * o.r, dur: 0.14, g: 0.18 * o.v, a: 0.002, pan: o.p });
      noiseHit({ t: o.t, type: 'lowpass', f0: 320, f1: 120, q: 0.8, dur: 0.09, g: 0.07 * o.v, a: 0.002, pan: o.p });
    },

    /* ------------------------- 成功 ------------------------- */

    /* 关卡完成小旋律：C-E-G-C 上行 + 尾音闪光 */
    success: function (o) {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var t = o.t;
      for (var i = 0; i < notes.length; i++) {
        var tt = t + i * 0.08;
        tone({ t: tt, type: 'triangle', f0: notes[i] * o.r, dur: 0.2, g: 0.075 * o.v, a: 0.004, pan: o.p });
        tone({ t: tt, type: 'sine', f0: notes[i] * 2 * o.r, dur: 0.12, g: 0.018 * o.v, a: 0.004, pan: o.p });
      }
      tone({ t: t + 0.3, type: 'sine', f0: 1567.98 * o.r, dur: 0.24, g: 0.03 * o.v, a: 0.008, pan: o.p });
      tone({ t: t + 0.36, type: 'sine', f0: 2093 * o.r, dur: 0.2, g: 0.022 * o.v, a: 0.008, pan: o.p });
    },

    /* 高频闪粉颗粒 */
    sparkle: function (o) {
      var t = o.t;
      for (var i = 0; i < 5; i++) {
        var f = (1700 + Math.random() * 1800) * o.r;
        tone({
          t: t + i * 0.028 + Math.random() * 0.012,
          type: 'sine',
          f0: f,
          f1: f * 1.06,
          dur: 0.07 + Math.random() * 0.05,
          g: 0.03 * o.v,
          a: 0.002,
          pan: o.p + (Math.random() - 0.5) * 0.7
        });
      }
    },

    /* 升级 arpeggio */
    levelup: function (o) {
      var notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1396.91];
      var t = o.t;
      for (var i = 0; i < notes.length; i++) {
        var tt = t + i * 0.065;
        tone({ t: tt, type: 'triangle', f0: notes[i] * o.r, dur: 0.19, g: 0.07 * o.v, a: 0.003, pan: o.p });
        tone({ t: tt, type: 'square', f0: notes[i] * o.r, dur: 0.08, g: 0.011 * o.v, a: 0.003, pan: o.p });
      }
      tone({ t: t + 0.34, type: 'sine', f0: 1046.5 * o.r, dur: 0.24, g: 0.028 * o.v, a: 0.01, pan: o.p });
    },

    /* ------------------------- 特殊 ------------------------- */

    /* 小夹偷笑：三声"嘿嘿嘿"（上扬带颤音） */
    giggle: function (o) {
      var t = o.t;
      var bases = [880, 960, 1020];
      for (var i = 0; i < 3; i++) {
        var b = bases[i] * o.r;
        var s = tone({ t: t + i * 0.082, type: 'triangle', f0: b * 1.1, f1: b * 0.92, dur: 0.075, g: 0.055 * o.v, a: 0.004, pan: o.p + (i - 1) * 0.1 });
        lfoTo(s.osc.frequency, 24, b * 0.08, t + i * 0.082, 0.08);
        noiseHit({ t: t + i * 0.082, type: 'bandpass', f0: 1800 * o.r, q: 1.4, dur: 0.03, g: 0.012 * o.v, a: 0.002, pan: o.p });
      }
    },

    /* 弹簧 boing */
    boing: function (o) {
      var t = o.t;
      var s = tone({ t: t, type: 'sine', f0: 180 * o.r, dur: 0.4, g: 0.16 * o.v, a: 0.003, pan: o.p });
      s.osc.frequency.exponentialRampToValueAtTime(560 * o.r, t + 0.09);
      s.osc.frequency.exponentialRampToValueAtTime(120 * o.r, t + 0.38);
      lfoTo(s.osc.frequency, 11, 42 * o.r, t + 0.02, 0.4);
      tone({ t: t, type: 'triangle', f0: 360 * o.r, f1: 240 * o.r, dur: 0.18, g: 0.035 * o.v, a: 0.002, pan: o.p });
    },

    /* 机器人吸走：下滑的吸溜声 */
    slurp: function (o) {
      var t = o.t;
      noiseHit({ t: t, type: 'bandpass', f0: 2600 * o.r, f1: 200 * o.r, q: 5, dur: 0.32, g: 0.09 * o.v, a: 0.02, pan: o.p });
      var s = tone({ t: t, type: 'sawtooth', f0: 900 * o.r, f1: 110 * o.r, dur: 0.32, g: 0.06 * o.v, a: 0.01, pan: o.p });
      lfoTo(s.gain.gain, 18, 0.012, t + 0.05, 0.24);
      noiseHit({ t: t + 0.26, type: 'bandpass', f0: 400 * o.r, f1: 120 * o.r, q: 2, dur: 0.1, g: 0.05 * o.v, a: 0.005, pan: o.p });
    },

    /* 机器人嗡嗡 + 电子短鸣 */
    robot: function (o) {
      var t = o.t;
      var s = tone({ t: t, type: 'sawtooth', f0: 110 * o.r, f1: 96 * o.r, dur: 0.38, g: 0.05 * o.v, a: 0.01, pan: o.p });
      lfoTo(s.osc.frequency, 26, 9, t, 0.38);
      tone({ t: t + 0.08, type: 'square', f0: 1200 * o.r, dur: 0.06, g: 0.018 * o.v, a: 0.003, pan: o.p });
      tone({ t: t + 0.22, type: 'square', f0: 900 * o.r, dur: 0.05, g: 0.014 * o.v, a: 0.003, pan: o.p });
      noiseHit({ t: t, type: 'lowpass', f0: 600, q: 0.7, dur: 0.38, g: 0.015 * o.v, a: 0.02, pan: o.p });
    },

    /* 警报：两音交替 */
    alarm: function (o) {
      var t = o.t;
      for (var i = 0; i < 4; i++) {
        var f = (i % 2 === 0 ? 820 : 620) * o.r;
        tone({ t: t + i * 0.105, type: 'square', f0: f, f1: f, dur: 0.09, g: 0.05 * o.v, a: 0.004, pan: o.p });
        tone({ t: t + i * 0.105, type: 'sawtooth', f0: f * 0.5, dur: 0.09, g: 0.02 * o.v, a: 0.004, pan: o.p });
      }
    },

    /* 爆炸 */
    explode: function (o) {
      var t = o.t;
      noiseHit({ t: t, type: 'lowpass', f0: 3200, f1: 110, q: 0.8, dur: 0.5, g: 0.2 * o.v, a: 0.002, pan: o.p });
      tone({ t: t, type: 'sine', f0: 120 * o.r, f1: 36 * o.r, dur: 0.38, g: 0.18 * o.v, a: 0.002, pan: o.p });
      noiseHit({ t: t + 0.02, type: 'highpass', f0: 2000, q: 0.8, dur: 0.25, g: 0.05 * o.v, a: 0.005, pan: o.p + (Math.random() - 0.5) * 0.4 });
      tone({ t: t + 0.04, type: 'triangle', f0: 240 * o.r, f1: 60 * o.r, dur: 0.2, g: 0.05 * o.v, a: 0.003, pan: o.p });
    },

    /* 关机：一切电源被拔掉的滑落声 */
    powerdown: function (o) {
      var t = o.t;
      tone({ t: t, type: 'sawtooth', f0: 760 * o.r, f1: 45 * o.r, dur: 0.52, g: 0.09 * o.v, a: 0.01, pan: o.p });
      tone({ t: t, type: 'sine', f0: 220 * o.r, f1: 32 * o.r, dur: 0.55, g: 0.08 * o.v, a: 0.005, pan: o.p });
      noiseHit({ t: t, type: 'lowpass', f0: 2000, f1: 80, q: 0.7, dur: 0.5, g: 0.02 * o.v, a: 0.02, pan: o.p });
      noiseHit({ t: t + 0.58, type: 'highpass', f0: 1200, q: 0.8, dur: 0.03, g: 0.03 * o.v, a: 0.001, pan: o.p });
    },

    /* 通关长旋律（约 3.5s）：温暖的 C 大调琶音 + 和弦铺底 + 闪粉 */
    win: function (o) {
      var t = o.t;
      var r = o.r;
      var v = o.v;
      var p = o.p;
      var melody = [
        [0.00, 523.25, 0.20], [0.16, 659.25, 0.20], [0.32, 783.99, 0.24], [0.50, 1046.50, 0.32],
        [0.78, 880.00, 0.20], [0.94, 1046.50, 0.24], [1.12, 1318.51, 0.36],
        [1.42, 783.99, 0.20], [1.58, 987.77, 0.20], [1.74, 1174.66, 0.26], [1.94, 1567.98, 0.55]
      ];
      var i;
      for (i = 0; i < melody.length; i++) {
        var m = melody[i];
        tone({ t: t + m[0], type: 'triangle', f0: m[1] * r, dur: m[2], g: 0.065 * v, a: 0.01, pan: p });
        tone({ t: t + m[0], type: 'sine', f0: m[1] * 2 * r, dur: m[2] * 0.7, g: 0.018 * v, a: 0.01, pan: p });
      }
      var chords = [
        [0.0, [261.63, 329.63, 392.00], 1.0],
        [1.0, [220.00, 261.63, 329.63], 0.9],
        [1.9, [261.63, 329.63, 392.00, 523.25], 1.5]
      ];
      for (var c = 0; c < chords.length; c++) {
        var ch = chords[c];
        for (var j = 0; j < ch[1].length; j++) {
          tone({ t: t + ch[0], type: 'sine', f0: ch[1][j] * r, dur: ch[2], g: 0.021 * v, a: 0.2, pan: p + (j - 1) * 0.15 });
        }
      }
      for (var k = 0; k < 8; k++) {
        tone({
          t: t + 0.5 + Math.random() * 2.2,
          type: 'sine',
          f0: (1800 + Math.random() * 1600) * r,
          dur: 0.12,
          g: 0.014 * v,
          a: 0.005,
          pan: p + (Math.random() - 0.5) * 0.8
        });
      }
    },

    /* ------------------------- 粒子 ------------------------- */

    /* 纸屑喷洒 */
    confetti: function (o) {
      var t = o.t;
      noiseHit({ t: t, type: 'bandpass', f0: 1400, f1: 600, q: 1.2, dur: 0.28, g: 0.04 * o.v, a: 0.01, pan: o.p });
      for (var i = 0; i < 5; i++) {
        var f = (1500 + Math.random() * 1800) * o.r;
        tone({
          t: t + Math.random() * 0.12,
          type: 'triangle',
          f0: f,
          f1: f * 1.2,
          dur: 0.08,
          g: 0.022 * o.v,
          a: 0.003,
          pan: o.p + (Math.random() - 0.5) * 0.6
        });
      }
      noiseHit({ t: t + 0.1, type: 'highpass', f0: 3000, q: 0.8, dur: 0.18, g: 0.02 * o.v, a: 0.02, pan: o.p });
    },

    /* 烟花：先"咚"再噼里啪啦 */
    firework: function (o) {
      var t = o.t;
      tone({ t: t, type: 'sine', f0: 150 * o.r, f1: 50 * o.r, dur: 0.13, g: 0.14 * o.v, a: 0.002, pan: o.p });
      noiseHit({ t: t, type: 'lowpass', f0: 900, f1: 150, q: 0.7, dur: 0.14, g: 0.08 * o.v, a: 0.002, pan: o.p });
      for (var i = 0; i < 9; i++) {
        var tt = t + 0.14 + Math.random() * 0.36;
        noiseHit({
          t: tt,
          type: 'highpass',
          f0: 2200 + Math.random() * 2500,
          q: 1.5,
          dur: 0.03 + Math.random() * 0.03,
          g: (0.02 + Math.random() * 0.025) * o.v,
          a: 0.001,
          pan: o.p + (Math.random() - 0.5) * 0.9
        });
        if (i % 3 === 0) {
          tone({ t: tt, type: 'sine', f0: (1200 + Math.random() * 1600) * o.r, dur: 0.05, g: 0.012 * o.v, a: 0.001, pan: o.p });
        }
      }
    }
  };

  var NAMES = Object.keys(SOUNDS);

  /* ------------------------------------------------------------------ *
   * 对外 API
   * ------------------------------------------------------------------ */

  function play(name, opts) {
    if (muted) return;
    var fn = SOUNDS[name];
    if (typeof fn !== 'function') return;   // 未知音效名：静默忽略
    try {
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') {
        var pr = ctx.resume();
        if (pr && typeof pr.catch === 'function') pr.catch(noop);
      }
      if (sourceList.length >= MAX_SOURCES) return;
      opts = opts || {};
      var t = ctx.currentTime + 0.004;
      fn({
        t: t,
        v: clamp(numOr(opts.volume, 1), 0, 2),
        r: clamp(numOr(opts.rate, 1), 0.5, 2),
        p: clamp(numOr(opts.pan, 0), -1, 1)
      });
    } catch (e) {
      logError(e);
    }
  }

  function stopAllVoices(delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (numOr(delay, 0.05));
    for (var i = sourceList.length - 1; i >= 0; i--) {
      try {
        sourceList[i].stop(t);
      } catch (e) { /* 已结束的源 */ }
    }
  }

  function setMuted(v) {
    v = !!v;
    muted = v;
    writeMuted(v);
    try {
      if (muteGain && ctx) {
        var t = ctx.currentTime;
        var g = muteGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(v ? 0 : 1, t + 0.03);
      }
      if (v) stopAllVoices(0.05);
    } catch (e) {
      logError(e);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function init() {
    initialized = true;
    try {
      var c = ensureCtx();
      if (c && c.state === 'suspended') {
        var pr = c.resume();
        if (pr && typeof pr.catch === 'function') pr.catch(noop);
      }
    } catch (e) {
      logError(e);
    }
    return NF.Audio;
  }

  /* ------------------------------------------------------------------ *
   * 极轻的 8-bit 氛围循环（可选功能；ctx 不可用时静默空转）
   * ------------------------------------------------------------------ */

  var AMB = { on: false, timer: null, bus: null, step: 0, next: 0 };
  var AMB_STEP = 0.2;                                  // 每步 200ms
  var AMB_SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25]; // D 大调五声
  var AMB_PATTERN = [0, -1, 2, 4, 3, -1, 1, -1, 2, -1, 5, 3, 1, -1, 0, -1];
  var AMB_BASS = [146.83, 123.47];                     // D3 / B2

  function ambientTick() {
    try {
      if (!AMB.on || !ctx) return;
      if (ctx.state !== 'running') {
        AMB.next = ctx.currentTime + AMB_STEP;
        return;
      }
      var horizon = ctx.currentTime + 0.35;
      var guard = 0;
      while (AMB.next < horizon && guard++ < 8) {
        var s = AMB.step;
        var t = AMB.next;
        var idx = AMB_PATTERN[s % 16];
        if (!muted && idx >= 0) {
          var f = AMB_SCALE[idx];
          var g = bus(0.05, ((s % 4) - 1.5) * 0.22, AMB.bus);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
          var o1 = ctx.createOscillator();
          o1.type = 'triangle';
          o1.frequency.value = f;
          o1.connect(g);
          o1.start(t);
          o1.stop(t + 0.3);
          track(o1);
          var o2 = ctx.createOscillator();
          o2.type = 'sine';
          o2.frequency.value = f * 2;
          var g2 = ctx.createGain();
          g2.gain.value = 0.28;
          o2.connect(g2);
          g2.connect(g);
          o2.start(t);
          o2.stop(t + 0.24);
          track(o2);
        }
        if (!muted && s % 16 === 0) {
          var bf = AMB_BASS[(Math.floor(s / 16)) % 2];
          var bg = bus(0.035, 0, AMB.bus);
          bg.gain.setValueAtTime(0.0001, t);
          bg.gain.linearRampToValueAtTime(0.035, t + 0.12);
          bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          var bo = ctx.createOscillator();
          bo.type = 'triangle';
          bo.frequency.value = bf;
          bo.connect(bg);
          bo.start(t);
          bo.stop(t + 0.95);
          track(bo);
        }
        AMB.next += AMB_STEP;
        AMB.step = s + 1;
      }
    } catch (e) {
      logError(e);
    }
  }

  function startAmbient() {
    try {
      if (AMB.on) return;
      if (!ensureCtx()) return;          // 无音频支持：静默降级
      AMB.on = true;
      AMB.step = 0;
      AMB.next = ctx.currentTime + 0.12;
      if (!AMB.bus) {
        AMB.bus = ctx.createGain();
        AMB.bus.gain.value = 0.0001;
        AMB.bus.connect(masterIn);
      }
      var t = ctx.currentTime;
      AMB.bus.gain.cancelScheduledValues(t);
      AMB.bus.gain.setValueAtTime(Math.max(0.0001, AMB.bus.gain.value), t);
      AMB.bus.gain.exponentialRampToValueAtTime(0.5, t + 1.2);
      AMB.timer = setInterval(ambientTick, 160);
      ambientTick();
    } catch (e) {
      AMB.on = false;
      logError(e);
    }
  }

  function stopAmbient() {
    try {
      if (AMB.timer) {
        clearInterval(AMB.timer);
        AMB.timer = null;
      }
      AMB.on = false;
      var b = AMB.bus;
      AMB.bus = null;
      if (b && ctx) {
        var t = ctx.currentTime;
        b.gain.cancelScheduledValues(t);
        b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), t);
        b.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        setTimeout(function () {
          try { b.disconnect(); } catch (e) {}
        }, 500);
      }
    } catch (e) {
      logError(e);
    }
  }

  /* ------------------------------------------------------------------ *
   * 首次用户手势解锁（自己监听一次，也允许外部调用 init）
   * ------------------------------------------------------------------ */

  function unlock() {
    init();
  }

  try {
    window.addEventListener('pointerdown', unlock, { capture: true, once: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
  } catch (e) {
    try {
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
    } catch (e2) {}
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && ctx && ctx.state === 'suspended') init();
    });
  } catch (e) {}

  /* 内部调试信息（自测 / QA 用，不属于契约 API） */
  function debugInfo() {
    return {
      muted: muted,
      context: ctx ? ctx.state : 'none',
      sources: sourceList.length,
      ambient: AMB.on,
      broken: broken,
      initialized: initialized,
      errors: errorLog.slice(0, 10),
      names: NAMES.slice()
    };
  }

  NF.Audio = {
    init: init,
    play: play,
    setMuted: setMuted,
    isMuted: isMuted,
    toggleMute: toggleMute,
    startAmbient: startAmbient,
    stopAmbient: stopAmbient,
    names: NAMES.slice(),
    _debug: debugInfo,
    /* 内部调试句柄（仅自测 / QA 用，不属于契约 API） */
    _ctx: function () { return ctx; },
    _out: function () { return muteGain; },
    _clearActive: function () { sourceList.length = 0; }  // 离线性测试用：节点不会 onended 时清空计数
  };

})();
