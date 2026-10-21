/**
 * qa/cdp.mjs — 零依赖的最小 Chrome DevTools Protocol 客户端（Node 22+）
 *
 * 依赖只有 Node 内置模块：
 *   - 内置 WebSocket（Node >= 22 全局可用）连接 CDP
 *   - 内置 fetch 轮询 http://127.0.0.1:<port>/json/version
 *   - node:child_process 启动无头 Edge / Chrome
 *
 * 用法：
 *   import { launch } from './cdp.mjs';
 *   const page = await launch({ width: 1440, height: 900 });
 *   await page.navigate('file:///.../index.html');
 *   await page.waitFor('window.NF && NF.Game');
 *   await page.click('[data-t="start"]');
 *   await page.key('Ctrl+Shift+N');
 *   await page.typeText('mkdir abc');
 *   await page.screenshot('qa/shots/level-01.png');
 *   await page.close();
 *
 * 设计要点：
 *   - /json/version 返回的是 browser 级 WebSocket；先 Target.attachToTarget
 *     （flatten: true）拿到 page sessionId，之后 Page / Runtime / Input 等
 *     域命令都带 sessionId 发送。
 *   - send() 带超时；页面异常（exceptionDetails）会以 Error 抛出，绝不静默。
 *   - collectConsole()：Runtime.consoleAPICalled + Runtime.exceptionThrown +
 *     Log.entryAdded 全部记录在 page.consoleLogs，consoleErrors() 过滤出错误。
 *   - close()：Browser.close → 等待进程退出 → taskkill /T /F 兜底 → 删除
 *     临时 user-data-dir，保证不留后台进程/临时目录。
 *
 * 环境变量：
 *   QA_DEBUG=1        打印 CDP 收发/浏览器 stderr 摘要
 *   QA_BROWSER=edge|chrome|auto（默认 auto：先 Edge 后 Chrome；也可传绝对路径）
 *   QA_BROWSER_PATH=<可执行文件路径>
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const DEBUG = process.env.QA_DEBUG === '1' || process.env.QA_DEBUG === 'true';
function dbg(...args) {
  if (DEBUG) console.error('[cdp]', ...args);
}

export { sleep };

/* ------------------------------------------------------------------ */
/* 浏览器可执行文件与端口                                              */
/* ------------------------------------------------------------------ */

const BROWSER_CANDIDATES = {
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env['PROGRAMFILES(X86)']
      ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : null,
    process.env.PROGRAMFILES
      ? join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : null,
  ].filter(Boolean),
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.PROGRAMFILES
      ? join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.env['PROGRAMFILES(X86)']
      ? join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
  ].filter(Boolean),
};

/**
 * 定位浏览器可执行文件。
 * @param {'auto'|'edge'|'chrome'|string} kind 'auto' 时先 Edge 后 Chrome；含路径分隔符时按路径处理
 * @returns {string} 绝对路径
 */
export function findBrowser(kind = process.env.QA_BROWSER || 'auto') {
  const explicit = process.env.QA_BROWSER_PATH;
  if (explicit) {
    const abs = resolve(explicit);
    if (existsSync(abs)) return abs;
    throw new Error(`QA_BROWSER_PATH 指向的浏览器不存在：${abs}`);
  }
  if (typeof kind === 'string' && (kind.includes('\\') || kind.includes('/'))) {
    const abs = resolve(kind);
    if (existsSync(abs)) return abs;
    throw new Error(`浏览器可执行文件不存在：${abs}`);
  }
  const wanted = String(kind || 'auto').toLowerCase();
  const kinds = wanted === 'auto' ? ['edge', 'chrome'] : [wanted];
  for (const name of kinds) {
    for (const candidate of BROWSER_CANDIDATES[name] || []) {
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    `找不到 ${kinds.join('/')} 浏览器；可用 QA_BROWSER=edge|chrome 或 QA_BROWSER_PATH=<exe> 指定`
  );
}

/**
 * 让操作系统分配一个当前空闲的 TCP 端口。
 * @returns {Promise<number>}
 */
export function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
  });
}

/* ------------------------------------------------------------------ */
/* 键位映射                                                            */
/* ------------------------------------------------------------------ */

const MOUSE_BUTTON_MASK = { left: 1, right: 2, middle: 4 };

const MODIFIER_TOKENS = {
  alt: 'alt',
  option: 'alt',
  ctrl: 'ctrl',
  control: 'ctrl',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  windows: 'meta',
  super: 'meta',
  shift: 'shift',
};

function buildModifiers(mods = {}) {
  let mask = 0;
  if (mods.alt) mask |= 1;
  if (mods.ctrl) mask |= 2;
  if (mods.meta) mask |= 4;
  if (mods.shift) mask |= 8;
  return mask;
}

const NAMED_KEYS = (() => {
  const defs = {
    enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
    return: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
    tab: { key: 'Tab', code: 'Tab', vk: 9 },
    escape: { key: 'Escape', code: 'Escape', vk: 27 },
    esc: { key: 'Escape', code: 'Escape', vk: 27 },
    backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
    delete: { key: 'Delete', code: 'Delete', vk: 46 },
    del: { key: 'Delete', code: 'Delete', vk: 46 },
    insert: { key: 'Insert', code: 'Insert', vk: 45 },
    space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
    spacebar: { key: ' ', code: 'Space', vk: 32, text: ' ' },
    arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
    down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
    left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
    arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
    right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
    home: { key: 'Home', code: 'Home', vk: 36 },
    end: { key: 'End', code: 'End', vk: 35 },
    pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
    pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
    capslock: { key: 'CapsLock', code: 'CapsLock', vk: 20 },
    printscreen: { key: 'PrintScreen', code: 'PrintScreen', vk: 44 },
    pause: { key: 'Pause', code: 'Pause', vk: 19 },
  };
  for (let i = 1; i <= 12; i++) defs['f' + i] = { key: 'F' + i, code: 'F' + i, vk: 111 + i };
  return defs;
})();

// 常见符号键：base / shift 两个字符对应同一个物理键（US 布局）
const SYMBOL_KEYS = (() => {
  const table = {};
  const defs = [
    ['`', '~', 'Backquote', 192],
    ['-', '_', 'Minus', 189],
    ['=', '+', 'Equal', 187],
    ['[', '{', 'BracketLeft', 219],
    [']', '}', 'BracketRight', 221],
    ['\\', '|', 'Backslash', 220],
    [';', ':', 'Semicolon', 186],
    ["'", '"', 'Quote', 222],
    [',', '<', 'Comma', 188],
    ['.', '>', 'Period', 190],
    ['/', '?', 'Slash', 191],
  ];
  for (const [plain, shifted, code, vk] of defs) {
    table[plain] = { plain, shifted, code, vk };
    table[shifted] = { plain, shifted, code, vk };
  }
  return table;
})();

const SHIFT_DIGITS = ')!@#$%^&*(';

/**
 * 解析一个组合键描述为 CDP dispatchKeyEvent 所需字段。
 * 支持：'Enter' / 'Escape' / 'ArrowDown' / 'Ctrl+Shift+N' / 'Shift+A' / 'Shift+?' / 'F5' ...
 */
function resolveKey(combo) {
  if (typeof combo !== 'string' || !combo.trim()) {
    throw new Error('key(combo): combo 必须是非空字符串，例如 "Ctrl+Shift+N"');
  }
  const raw = combo.trim();
  let parts;
  if (raw === '+') {
    parts = ['+'];
  } else if (raw.length > 1 && raw.endsWith('++')) {
    // 例如 "Ctrl++"：最后是加号键
    parts = raw.slice(0, -1).split('+').filter(Boolean);
    parts.push('+');
  } else {
    parts = raw.split('+').filter(Boolean);
  }
  const keyName = parts.pop();
  const mods = { alt: false, ctrl: false, meta: false, shift: false };
  for (const token of parts) {
    const mapped = MODIFIER_TOKENS[token.toLowerCase()];
    if (!mapped) throw new Error(`key(combo): 未知修饰键 "${token}"（组合："${combo}"）`);
    mods[mapped] = true;
  }
  return keyInfo(keyName, mods);
}

function keyInfo(name, mods) {
  const modifiers = buildModifiers(mods);
  const blocked = !!(mods.ctrl || mods.alt || mods.meta); // 带 Ctrl/Alt/Meta 时不产生文本
  const named = NAMED_KEYS[name.toLowerCase()];
  if (named) {
    return {
      key: named.key,
      code: named.code,
      vk: named.vk,
      text: blocked ? '' : named.text || '',
      modifiers,
    };
  }
  if (/^[a-z]$/i.test(name)) {
    const upper = name.toUpperCase();
    const actual = mods.shift ? upper : upper.toLowerCase();
    return {
      key: actual,
      code: 'Key' + upper,
      vk: upper.charCodeAt(0),
      text: blocked ? '' : actual,
      modifiers,
    };
  }
  if (/^[0-9]$/.test(name)) {
    const char = mods.shift ? SHIFT_DIGITS[Number(name)] : name;
    return {
      key: char,
      code: 'Digit' + name,
      vk: 48 + Number(name),
      text: blocked ? '' : char,
      modifiers,
    };
  }
  const sym = SYMBOL_KEYS[name];
  if (sym) {
    const shift = mods.shift || sym.shifted === name;
    const effective = buildModifiers({ ...mods, shift });
    const char = shift && sym.plain === name ? sym.shifted : name;
    return { key: char, code: sym.code, vk: sym.vk, text: blocked ? '' : char, modifiers: effective };
  }
  throw new Error(`key(combo): 不支持按键 "${name}"`);
}

/** typeText 用：单个可打印 ASCII 字符 → 键事件描述 */
function charKeyInfo(ch) {
  if (ch === ' ') return { key: ' ', code: 'Space', vk: 32, text: ' ', modifiers: 0 };
  if (/^[A-Z]$/.test(ch)) return { key: ch, code: 'Key' + ch, vk: ch.charCodeAt(0), text: ch, modifiers: 8 };
  if (/^[a-z]$/.test(ch)) {
    return { key: ch, code: 'Key' + ch.toUpperCase(), vk: ch.toUpperCase().charCodeAt(0), text: ch, modifiers: 0 };
  }
  if (/^[0-9]$/.test(ch)) return { key: ch, code: 'Digit' + ch, vk: 48 + Number(ch), text: ch, modifiers: 0 };
  const sym = SYMBOL_KEYS[ch];
  if (sym) {
    const shifted = sym.shifted === ch;
    return { key: ch, code: sym.code, vk: sym.vk, text: ch, modifiers: shifted ? 8 : 0 };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* RemoteObject → JS 值                                                */
/* ------------------------------------------------------------------ */

function remoteToValue(result) {
  if (!result) return undefined;
  if (result.type === 'undefined') return undefined;
  if (result.unserializableValue !== undefined) {
    const u = result.unserializableValue;
    if (u === 'NaN') return NaN;
    if (u === 'Infinity') return Infinity;
    if (u === '-Infinity') return -Infinity;
    if (u === '-0') return -0;
    return u;
  }
  if ('value' in result) return result.value;
  return undefined;
}

function argToText(arg) {
  if (!arg) return '';
  if (arg.type === 'string') return String(arg.value);
  if (arg.unserializableValue !== undefined) return arg.unserializableValue;
  if ('value' in arg) {
    const v = arg.value;
    if (v === null) return 'null';
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return '[object]';
      }
    }
    return String(v);
  }
  if (arg.description) return arg.description;
  return String(arg.type || 'unknown');
}

/* ------------------------------------------------------------------ */
/* CDPPage                                                             */
/* ------------------------------------------------------------------ */

export class CDPPage {
  constructor(init) {
    this.browserPath = init.browserPath;
    this.port = init.port;
    this.profileDir = init.profileDir;
    this.wsUrl = init.wsUrl;
    this.child = init.child;
    this.exitPromise = init.exitPromise;
    this.getExitInfo = init.getExitInfo || (() => null);
    this.getStderr = init.getStderr || (() => '');
    this.defaultTimeout = init.defaultTimeout ?? 30000;
    this.ownedProfile = init.ownedProfile !== false;
    this.viewport = null;
    this.consoleLogs = [];
    this.sessionId = null;
    this.targetId = null;
    this.ws = null;
    this._nextId = 0;
    this._pending = new Map();
    this._listeners = new Map();
    this._closed = false;
    this._socketClosed = false;
    this._closePromise = null;
    this._exitInfo = null;
    this.exitPromise.then((info) => {
      this._exitInfo = info;
    });
  }

  /* -------------------------- 连接 / 事件 -------------------------- */

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('当前 Node 没有全局 WebSocket，需要 Node 22+（node -v 检查）');
    }
    await this._openSocket();

    const { targetInfos = [] } = await this._sendRaw('Target.getTargets', {});
    let target = targetInfos.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools://'));
    if (!target) {
      const created = await this._sendRaw('Target.createTarget', { url: 'about:blank' });
      target = { targetId: created.targetId };
      dbg('created page target', target.targetId);
    }
    this.targetId = target.targetId;
    const attached = await this._sendRaw('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;
    dbg('attached to page target', this.targetId, 'session', this.sessionId);

    // 先把事件监听接上，再 enable 域，避免漏掉早期 console。
    this.on('Runtime.consoleAPICalled', (params) => this._onConsole(params));
    this.on('Runtime.exceptionThrown', (params) => this._onException(params));
    this.on('Log.entryAdded', (params) => this._onLogEntry(params));

    await this.send('Runtime.enable', {});
    await this.send('Page.enable', {});
    await this.send('Log.enable', {}).catch((err) => dbg('Log.enable failed:', err.message));
    await this.send('Page.setLifecycleEventsEnabled', { enabled: true }).catch(() => {});
    // about:blank 初始页可能还在加载，这里不强制等待，由 navigate() 负责。
    await this.waitFor('document.readyState !== "loading"', 5000).catch(() => {});
    return this;
  }

  _openSocket() {
    return new Promise((resolveSocket, reject) => {
      let settled = false;
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`连接 DevTools WebSocket 超时（15s）：${this.wsUrl}`));
      }, 15000);
      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        dbg('websocket open', this.wsUrl);
        resolveSocket();
      });
      ws.addEventListener('message', (ev) => this._onMessage(ev.data));
      ws.addEventListener('error', (ev) => {
        const msg = (ev && (ev.message || (ev.error && ev.error.message))) || 'websocket error';
        dbg('websocket error', msg);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`DevTools WebSocket 连接失败：${msg}`));
        }
      });
      ws.addEventListener('close', (ev) => {
        dbg('websocket close', ev.code, ev.reason);
        this._socketClosed = true;
        this._rejectAllPending(new Error('CDP 连接已关闭'));
      });
    });
  }

  _onMessage(data) {
    if (typeof data === 'string') {
      this._handleMessage(data);
      return;
    }
    if (data && typeof data.text === 'function') {
      data
        .text()
        .then((text) => this._handleMessage(text))
        .catch(() => {});
      return;
    }
    if (data instanceof ArrayBuffer) {
      this._handleMessage(Buffer.from(data).toString('utf8'));
      return;
    }
    if (ArrayBuffer.isView(data)) {
      this._handleMessage(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
    }
  }

  _handleMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      dbg('cannot parse CDP message', String(text).slice(0, 200));
      return;
    }
    if (msg.id !== undefined) {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        const err = new Error(
          `CDP ${pending.method} 失败：${msg.error.message}` +
            (msg.error.data ? `（${msg.error.data}）` : '')
        );
        err.code = msg.error.code;
        err.data = msg.error.data;
        err.method = pending.method;
        pending.reject(err);
      } else {
        pending.resolve(msg.result || {});
      }
      return;
    }
    if (msg.method) this._emit(msg.method, msg.params || {}, msg.sessionId);
  }

  _rejectAllPending(err) {
    for (const [, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this._pending.clear();
  }

  _sendRaw(method, params = {}, opts = {}) {
    const { sessionId = undefined, timeout = this.defaultTimeout } = opts;
    if (this._socketClosed) return Promise.reject(new Error(`CDP 连接已关闭，无法发送 ${method}`));
    const id = ++this._nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolveCall, rejectCall) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        rejectCall(new Error(`CDP 命令超时（${timeout}ms）：${method}`));
      }, timeout);
      this._pending.set(id, { resolve: resolveCall, reject: rejectCall, timer, method });
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        rejectCall(err);
      }
    });
  }

  /** 发送页面域 CDP 命令（自动带 page sessionId）。 */
  send(method, params = {}, opts = {}) {
    const { sessionId = this.sessionId, timeout = this.defaultTimeout } = opts;
    return this._sendRaw(method, params, { sessionId, timeout });
  }

  /** 发送浏览器域 CDP 命令（不带 sessionId，例如 Target.* / Browser.*）。 */
  sendBrowser(method, params = {}, opts = {}) {
    const { timeout = this.defaultTimeout } = opts;
    return this._sendRaw(method, params, { sessionId: undefined, timeout });
  }

  /** 监听 CDP 事件，返回取消监听函数。 */
  on(method, handler) {
    let set = this._listeners.get(method);
    if (!set) {
      set = new Set();
      this._listeners.set(method, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this._listeners.delete(method);
    };
  }

  _emit(method, params, sessionId) {
    const set = this._listeners.get(method);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(params, sessionId);
      } catch (err) {
        dbg(`事件监听器异常 ${method}:`, err.message);
      }
    }
  }

  /** 等待一个 CDP 事件（一次）。 */
  onceEvent(method, timeout = 15000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const off = this.on(method, (params, sessionId) => {
        clearTimeout(timer);
        off();
        resolveEvent({ params, sessionId });
      });
      const timer = setTimeout(() => {
        off();
        rejectEvent(new Error(`等待 CDP 事件超时（${timeout}ms）：${method}`));
      }, timeout);
    });
  }

  /* --------------------------- 控制台采集 --------------------------- */

  _onConsole(params) {
    const args = params.args || [];
    const entry = {
      kind: 'console',
      type: params.type || 'log',
      text: args.map(argToText).join(' '),
      args: args.map((a) => (a.type === 'undefined' ? undefined : remoteToValue(a))),
      timestamp: params.timestamp,
      url: (params.stackTrace && params.stackTrace.callFrames && params.stackTrace.callFrames[0]
        ? params.stackTrace.callFrames[0].url
        : '') || '',
      line: (params.stackTrace && params.stackTrace.callFrames && params.stackTrace.callFrames[0]
        ? params.stackTrace.callFrames[0].lineNumber
        : -1),
    };
    this.consoleLogs.push(entry);
    if (DEBUG) dbg(`console.${entry.type}: ${entry.text}`);
  }

  _onException(params) {
    const details = params.exceptionDetails || {};
    const ex = details.exception || {};
    const text = ex.description || ex.value || details.text || 'Uncaught exception';
    this.consoleLogs.push({
      kind: 'exception',
      type: 'error',
      text: String(text),
      timestamp: params.timestamp,
      url: details.url || '',
      line: typeof details.lineNumber === 'number' ? details.lineNumber : -1,
      stackTrace: details.stackTrace || null,
    });
    if (DEBUG) dbg('exception:', text);
  }

  _onLogEntry(params) {
    const entry = params.entry || {};
    this.consoleLogs.push({
      kind: 'log',
      type: entry.level || 'info',
      text: entry.text || '',
      source: entry.source || '',
      url: entry.url || '',
      line: typeof entry.lineNumber === 'number' ? entry.lineNumber : -1,
      timestamp: entry.timestamp,
    });
    if (DEBUG) dbg(`log.${entry.level}: ${entry.text}`);
  }

  /** 返回已采集的控制台条目数组（引用，实时更新）。 */
  collectConsole() {
    return this.consoleLogs;
  }

  /** 清空已采集的控制台条目。 */
  clearConsole() {
    this.consoleLogs.length = 0;
    return this;
  }

  /** 过滤出真正的错误：console.error/assert、未捕获异常、浏览器 Log error。 */
  consoleErrors() {
    return this.consoleLogs.filter(
      (e) =>
        e.kind === 'exception' ||
        (e.kind === 'console' && (e.type === 'error' || e.type === 'assert')) ||
        (e.kind === 'log' && e.type === 'error')
    );
  }

  /* ------------------------------ 求值 ------------------------------ */

  /**
   * 在页面里求值。
   * @param {string|Function} expr 表达式字符串，或函数（会被立即调用）
   * @param {{awaitPromise?:boolean, returnByValue?:boolean, userGesture?:boolean, timeout?:number}} opts
   */
  async evaluate(expr, opts = {}) {
    const {
      awaitPromise = true,
      returnByValue = true,
      userGesture = false,
      timeout = this.defaultTimeout,
    } = opts;
    let expression;
    if (typeof expr === 'function') expression = `(${expr.toString()})()`;
    else if (typeof expr === 'string') expression = expr;
    else throw new Error('evaluate(expr)：expr 必须是字符串或函数');

    const result = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise,
        returnByValue,
        userGesture,
        allowUnsafeEvalBlockedByCSP: true,
      },
      { timeout }
    );
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const ex = details.exception || {};
      const desc = ex.description || ex.value || details.text || 'Unknown exception';
      const err = new Error(`页面求值抛异常：${desc}`);
      err.exceptionDetails = details;
      throw err;
    }
    return remoteToValue(result.result);
  }

  /**
   * 轮询等待表达式为真，返回该表达式的真值。
   * @param {string|Function} expr
   * @param {number|{timeout?:number,interval?:number}} [timeoutOrOpts]
   */
  async waitFor(expr, timeoutOrOpts = 5000) {
    let timeout = 5000;
    let interval = 50;
    if (typeof timeoutOrOpts === 'number') timeout = timeoutOrOpts;
    else if (timeoutOrOpts && typeof timeoutOrOpts === 'object') {
      timeout = timeoutOrOpts.timeout ?? 5000;
      interval = timeoutOrOpts.interval ?? 50;
    }
    const label = typeof expr === 'function' ? expr.toString().slice(0, 160) : String(expr);
    const start = Date.now();
    let lastError = null;
    for (;;) {
      const remaining = timeout - (Date.now() - start);
      if (remaining <= 0) break;
      try {
        const value = await this.evaluate(expr, {
          awaitPromise: false,
          timeout: Math.max(1000, Math.min(remaining + 500, this.defaultTimeout)),
        });
        if (value) return value;
        lastError = null;
      } catch (err) {
        lastError = err;
      }
      const wait = Math.min(interval, Math.max(0, timeout - (Date.now() - start)));
      if (wait > 0) await sleep(wait);
    }
    throw new Error(
      `waitFor 超时（${timeout}ms）：${label}` + (lastError ? `；最后一次错误：${lastError.message}` : '')
    );
  }

  /** waitFor 的别名。 */
  waitForFunction(expr, timeoutOrOpts) {
    return this.waitFor(expr, timeoutOrOpts);
  }

  async waitForSelector(selector, timeout = 5000) {
    return this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, timeout);
  }

  /** 元素是否存在（同步求值，不等待）。 */
  async exists(selector) {
    return this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
  }

  async text(selector) {
    return this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent : null; })()`
    );
  }

  async value(selector) {
    return this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.value : null; })()`
    );
  }

  /**
   * 元素矩形，返回 {x,y,left,top,width,height,cx,cy}。
   * 默认 **不滚动页面**：游戏元素都是绝对定位/全屏，scrollIntoView 会把"屏幕外的元素"
   * 所在文档滚走（例如 L16 露在屏幕右缘的逃亡窗口），导致后续 Input 坐标与视觉位置错位。
   * 需要滚动到视口时显式传 { scroll: true }。
   * @param {string} selector
   * @param {{scroll?: boolean}} [opts]
   * @returns {Promise<object>}
   */
  async rect(selector, opts = {}) {
    const doScroll = opts.scroll === true;
    const rect = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      if (${doScroll} && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center' });
      const b = el.getBoundingClientRect();
      return {
        x: b.x, y: b.y, left: b.left, top: b.top,
        width: b.width, height: b.height,
        cx: b.left + b.width / 2, cy: b.top + b.height / 2
      };
    })()`);
    if (!rect) throw new Error(`元素不存在：${selector}`);
    return rect;
  }

  /** 把选择器 / {x,y} / [x,y] 归一化成坐标点。 */
  async resolvePoint(target, label = 'target', opts = {}) {
    if (target && typeof target === 'object' && !Array.isArray(target)) {
      if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
        return { x: Number(target.x), y: Number(target.y) };
      }
    }
    if (Array.isArray(target) && target.length >= 2) {
      const x = Number(target[0]);
      const y = Number(target[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
    if (typeof target === 'string') {
      const rect = await this.rect(target, opts);
      if (rect.width <= 0 || rect.height <= 0) throw new Error(`元素尺寸为 0，无法点击：${target}`);
      return { x: rect.cx, y: rect.cy };
    }
    throw new Error(`${label} 不合法：${JSON.stringify(target)}`);
  }

  /* ------------------------------ 鼠标 ------------------------------ */

  async _dispatchMouse(type, params = {}) {
    const {
      x,
      y,
      button = 'none',
      buttons = 0,
      clickCount = 0,
      modifiers = 0,
    } = params;
    return this.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button,
      buttons,
      clickCount,
      modifiers,
      pointerType: 'mouse',
    });
  }

  /** 鼠标悬停到坐标（可带 steps 做移动轨迹）。 */
  async move(x, y, opts = {}) {
    const { steps = 1, delay = 0 } = opts;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('move(x, y) 需要有限数字坐标');
    if (steps <= 1) {
      await this._dispatchMouse('mouseMoved', { x, y, button: 'none', buttons: 0 });
      return { x, y };
    }
    const start = await this.evaluate('({x: window.__qa_lastMouseX || 0, y: window.__qa_lastMouseY || 0})');
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mx = start.x + (x - start.x) * t;
      const my = start.y + (y - start.y) * t;
      await this._dispatchMouse('mouseMoved', { x: mx, y: my, button: 'none', buttons: 0 });
      if (delay) await sleep(delay);
    }
    return { x, y };
  }

  /**
   * 左键/右键/中键单击；target 可以是选择器、{x,y} 或 [x,y]。
   * @param {string|{x:number,y:number}|[number,number]} target
   * @param {{button?:'left'|'right'|'middle', clickCount?:number, delay?:number, moveDelay?:number}} opts
   */
  async click(target, opts = {}) {
    const { button = 'left', clickCount = 1, delay = 12, moveDelay = 10 } = opts;
    const mask = MOUSE_BUTTON_MASK[button];
    if (!mask) throw new Error(`click：未知按键 "${button}"（left/right/middle）`);
    const point = await this.resolvePoint(target, 'click target', opts);
    await this._dispatchMouse('mouseMoved', { x: point.x, y: point.y, button: 'none', buttons: 0 });
    if (moveDelay) await sleep(moveDelay);
    await this._dispatchMouse('mousePressed', {
      x: point.x,
      y: point.y,
      button,
      buttons: mask,
      clickCount,
    });
    if (delay) await sleep(delay);
    await this._dispatchMouse('mouseReleased', {
      x: point.x,
      y: point.y,
      button,
      buttons: 0,
      clickCount,
    });
    return point;
  }

  async rightClick(target, opts = {}) {
    return this.click(target, { ...opts, button: 'right' });
  }

  async middleClick(target, opts = {}) {
    return this.click(target, { ...opts, button: 'middle' });
  }

  async dblclick(target, opts = {}) {
    const { delay = 20 } = opts;
    const point = await this.resolvePoint(target, 'dblclick target', opts);
    await this._dispatchMouse('mouseMoved', { x: point.x, y: point.y, button: 'none', buttons: 0 });
    await sleep(10);
    for (let clickCount = 1; clickCount <= 2; clickCount++) {
      await this._dispatchMouse('mousePressed', {
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 1,
        clickCount,
      });
      await sleep(delay);
      await this._dispatchMouse('mouseReleased', {
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 0,
        clickCount,
      });
      if (clickCount === 1) await sleep(40);
    }
    return point;
  }

  /** 按住左键（drag 的底层原语，也可用于自定义轨迹）。 */
  async mouseDown(target, opts = {}) {
    const { button = 'left' } = opts;
    const point = await this.resolvePoint(target, 'mouseDown target', opts);
    await this._dispatchMouse('mouseMoved', { x: point.x, y: point.y, button: 'none', buttons: 0 });
    await this._dispatchMouse('mousePressed', {
      x: point.x,
      y: point.y,
      button,
      buttons: MOUSE_BUTTON_MASK[button] || 1,
      clickCount: 1,
    });
    return point;
  }

  /** 松开左键。 */
  async mouseUp(target, opts = {}) {
    const { button = 'left' } = opts;
    const point = await this.resolvePoint(target, 'mouseUp target', opts);
    await this._dispatchMouse('mouseReleased', {
      x: point.x,
      y: point.y,
      button,
      buttons: 0,
      clickCount: 1,
    });
    return point;
  }

  /**
   * 真实拖拽：mousePressed → 多步 mouseMoved(buttons=1) → mouseReleased。
   * from/to 支持选择器、{x,y}、[x,y]。
   */
  async drag(from, to, opts = {}) {
    const {
      steps = 12,
      delay = 16,
      button = 'left',
      pressDelay = 40,
      releaseDelay = 40,
    } = opts;
    const mask = MOUSE_BUTTON_MASK[button] || 1;
    const start = await this.resolvePoint(from, 'drag from', opts);
    const end = await this.resolvePoint(to, 'drag to', opts);
    await this._dispatchMouse('mouseMoved', { x: start.x, y: start.y, button: 'none', buttons: 0 });
    await sleep(10);
    await this._dispatchMouse('mousePressed', {
      x: start.x,
      y: start.y,
      button,
      buttons: mask,
      clickCount: 1,
    });
    if (pressDelay) await sleep(pressDelay);
    const count = Math.max(2, Math.floor(steps));
    // 关键：按住时 mouseMoved 的 button 必须带按键（'left'）。
    // 若传 'none' 只带 buttons=1，Chromium 会在第一次移动时丢掉 pointer capture
    // （page 侧会收到 lostpointercapture），之后 pointerup 不会回到被拖元素。
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      await this._dispatchMouse('mouseMoved', { x, y, button, buttons: mask });
      if (delay) await sleep(delay);
    }
    await this._dispatchMouse('mouseMoved', { x: end.x, y: end.y, button, buttons: mask });
    if (releaseDelay) await sleep(releaseDelay);
    await this._dispatchMouse('mouseReleased', {
      x: end.x,
      y: end.y,
      button,
      buttons: 0,
      clickCount: 1,
    });
    return { from: start, to: end, steps: count };
  }

  /* ------------------------------ 键盘 ------------------------------ */

  /**
   * 按一次组合键：'Enter' / 'Escape' / 'ArrowDown' / 'Ctrl+Shift+N' / 'Shift+A' / 'F5'。
   * 对带 Ctrl/Alt/Meta 的组合发送 rawKeyDown（不产生文本），其余可打印键发 keyDown+text。
   */
  async key(combo, opts = {}) {
    const { delay = 10, hold = 0 } = opts;
    const desc = resolveKey(combo);
    // Chromium 会把 Ctrl+N / Ctrl+Shift+N / Ctrl+T 等当作浏览器级快捷键：
    // 事件会被浏览器进程吞掉（页面收不到 keydown，还会新建窗口）。
    // 把 nativeVirtualKeyCode 置 0 即可绕过浏览器加速器匹配；
    // 实测 DOM 事件仍然正确（e.key='N'、e.code='KeyN'、e.keyCode=78、ctrlKey/shiftKey 正确），
    // Ctrl+A / Ctrl+Z 等编辑命令也不受影响。
    const nativeVk = desc.modifiers & 0b111 ? 0 : desc.vk;
    const base = {
      key: desc.key,
      code: desc.code,
      windowsVirtualKeyCode: desc.vk,
      nativeVirtualKeyCode: nativeVk,
      modifiers: desc.modifiers,
      location: 0,
      autoRepeat: false,
      isKeypad: false,
      isSystemKey: false,
    };
    if (desc.text) {
      await this.send('Input.dispatchKeyEvent', {
        ...base,
        type: 'keyDown',
        text: desc.text,
        unmodifiedText: desc.text,
      });
    } else {
      await this.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
    }
    if (delay) await sleep(delay);
    if (hold) await sleep(hold);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: desc.key,
      code: desc.code,
      windowsVirtualKeyCode: desc.vk,
      nativeVirtualKeyCode: nativeVk,
      modifiers: desc.modifiers,
      location: 0,
    });
    return desc;
  }

  /**
   * 逐字符输入文本（模拟真实键盘）。ASCII 走 keyDown/keyUp（会触发 keydown/input），
   * 非 ASCII（中文等）走 Input.insertText；'\n' 发送 Enter。
   */
  async typeText(text, opts = {}) {
    const { delay = 8 } = opts;
    const str = String(text ?? '');
    if (!str) return;
    let pending = '';
    const flush = async () => {
      if (!pending) return;
      await this.send('Input.insertText', { text: pending });
      pending = '';
    };
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (ch === '\n' || ch === '\r') {
        await flush();
        await this.key('Enter', { delay });
        continue;
      }
      if (ch === '\t') {
        await flush();
        await this.key('Tab', { delay });
        continue;
      }
      const desc = cp >= 32 && cp <= 126 ? charKeyInfo(ch) : null;
      if (!desc) {
        pending += ch;
        continue;
      }
      await flush();
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: desc.key,
        code: desc.code,
        windowsVirtualKeyCode: desc.vk,
        nativeVirtualKeyCode: desc.vk,
        text: desc.text,
        unmodifiedText: desc.text,
        modifiers: desc.modifiers,
        location: 0,
        autoRepeat: false,
        isKeypad: false,
        isSystemKey: false,
      });
      if (delay) await sleep(delay);
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: desc.key,
        code: desc.code,
        windowsVirtualKeyCode: desc.vk,
        nativeVirtualKeyCode: desc.vk,
        modifiers: desc.modifiers,
        location: 0,
      });
      if (delay) await sleep(delay);
    }
    await flush();
  }

  /** 让元素获得焦点。 */
  async focus(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('元素不存在：' + ${JSON.stringify(selector)});
      el.focus();
      return document.activeElement === el;
    })()`);
  }

  /* ---------------------------- 导航 / 截图 --------------------------- */

  /** 统一 href：没有协议时按本地文件路径处理（中文路径会正确 percent-encode）。 */
  static normalizeUrl(url) {
    const s = String(url);
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return pathToFileURL(resolve(s)).href;
  }

  /**
   * 导航并等待 load 事件（附带 readyState 兜底）。
   */
  async navigate(url, opts = {}) {
    const { timeout = this.defaultTimeout } = opts;
    const target = CDPPage.normalizeUrl(url);
    const loadPromise = this.onceEvent('Page.loadEventFired', timeout).catch(() => null);
    const result = await this.send('Page.navigate', { url: target }, { timeout });
    if (result.errorText) throw new Error(`导航失败：${result.errorText}（${target}）`);
    await loadPromise;
    await this.waitFor('document.readyState === "complete"', Math.min(8000, timeout)).catch(() => {});
    return result;
  }

  /**
   * 截图保存为 PNG。相对路径按当前工作目录解析；自动创建目录。
   * @param {string} filePath
   * @param {{clip?:{x:number,y:number,width:number,height:number,scale?:number}}} opts
   */
  async screenshot(filePath, opts = {}) {
    const { clip = null } = opts;
    if (typeof filePath !== 'string' || !filePath) throw new Error('screenshot(path) 需要文件路径');
    const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    const params = {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    };
    if (clip) {
      params.clip = {
        x: Number(clip.x) || 0,
        y: Number(clip.y) || 0,
        width: Number(clip.width),
        height: Number(clip.height),
        scale: Number(clip.scale) || 1,
      };
    }
    const result = await this.send('Page.captureScreenshot', params);
    if (!result.data) throw new Error('Page.captureScreenshot 没有返回数据');
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, Buffer.from(result.data, 'base64'));
    return absolute;
  }

  /**
   * 设置视口尺寸（通过 Emulation.setDeviceMetricsOverride，窗口截图尺寸同步）。
   */
  async setViewport(opts = {}) {
    const { width, height, deviceScaleFactor = 1, mobile = false } = opts;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('setViewport 需要 { width, height }');
    }
    const w = Math.round(width);
    const h = Math.round(height);
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor,
      mobile,
      screenWidth: w,
      screenHeight: h,
    });
    this.viewport = { width: w, height: h, deviceScaleFactor };
    await sleep(60);
    return this.viewport;
  }

  /** 当前页面 URL。 */
  async url() {
    return this.evaluate('location.href');
  }

  /** 当前页面标题。 */
  async title() {
    return this.evaluate('document.title');
  }

  /* ------------------------------ 收尾 ------------------------------ */

  /** 浏览器进程是否已退出。 */
  get exitInfo() {
    return this._exitInfo;
  }

  get isClosed() {
    return this._closed;
  }

  /**
   * 关闭：Browser.close → 等退出 → taskkill /T /F 兜底 → 删临时 profile。
   * 幂等。
   */
  close() {
    if (this._closePromise) return this._closePromise;
    this._closePromise = this._doClose();
    return this._closePromise;
  }

  async _doClose() {
    // 1) 优雅关闭（浏览器域命令）
    try {
      await this._sendRaw('Browser.close', {}, { timeout: 1500 });
    } catch (err) {
      dbg('Browser.close 失败（忽略）：', err.message);
    }
    await Promise.race([this.exitPromise, sleep(2500)]);
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* ignore */
    }
    // 2) 兜底杀进程树
    if (!this._exitInfo) {
      killProcessTree(this.child && this.child.pid);
      await Promise.race([this.exitPromise, sleep(3000)]);
    }
    if (!this._exitInfo) {
      killProcessTree(this.child && this.child.pid);
      await Promise.race([this.exitPromise, sleep(1500)]);
    }
    // 3) 清理临时 user-data-dir（Edge 退出后可能短暂占用文件，重试）
    if (this.ownedProfile && this.profileDir) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await rm(this.profileDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
          break;
        } catch (err) {
          dbg(`删除 profile 重试 ${attempt + 1}:`, err.message);
          await sleep(200);
        }
      }
    }
    this._closed = true;
    this._rejectAllPending(new Error('CDP 连接已关闭'));
    return this._exitInfo;
  }
}

/* ------------------------------------------------------------------ */
/* 进程树终止                                                          */
/* ------------------------------------------------------------------ */

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    dbg('killProcessTree 失败：', err && err.message);
  }
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function waitForDevToolsEndpoint({ port, timeout, getExitInfo, getStderr }) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  while (Date.now() < deadline) {
    const exitInfo = getExitInfo();
    if (exitInfo) {
      throw new Error(
        `浏览器提前退出（code=${exitInfo.code}, signal=${exitInfo.signal}）\n--- 浏览器 stderr ---\n` +
          (getStderr() || '(空)')
      );
    }
    try {
      const res = await fetch(versionUrl, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        if (data.webSocketDebuggerUrl) return data;
        lastError = new Error('/json/version 缺少 webSocketDebuggerUrl');
      } else {
        lastError = new Error(`/json/version HTTP ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(120);
  }
  throw new Error(
    `等待 DevTools 端点超时（${timeout}ms）：${versionUrl}；最后错误：${
      lastError ? lastError.message : '未知'
    }\n--- 浏览器 stderr ---\n` + (getStderr() || '(空)')
  );
}

/**
 * 启动无头浏览器并连接，返回 CDPPage。
 *
 * @param {{
 *   browser?: 'auto'|'edge'|'chrome'|string,
 *   headless?: boolean,
 *   width?: number, height?: number,
 *   args?: string[],
 *   userDataDir?: string,
 *   startupTimeout?: number,
 *   defaultTimeout?: number,
 *   viewport?: boolean,
 * }} opts
 * @returns {Promise<CDPPage>}
 */
export async function launch(opts = {}) {
  const {
    browser = process.env.QA_BROWSER || 'auto',
    headless = true,
    width = 1440,
    height = 900,
    args: extraArgs = [],
    userDataDir = null,
    startupTimeout = 30000,
    defaultTimeout = 30000,
    viewport = true,
  } = opts;

  if (typeof WebSocket !== 'function') {
    throw new Error(`需要 Node 22+ 的全局 WebSocket（当前 ${process.version}）`);
  }
  const browserPath = findBrowser(browser);
  const port = await getFreePort();
  const profileDir = userDataDir || mkdtempSync(join(tmpdir(), 'nf-qa-'));
  const flags = [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',
    '--mute-audio',
    '--disable-search-engine-choice-screen',
    '--disable-features=msEdgeSidebarV2,msEdgeFirstRunExperience,Translate,MediaRouter',
    ...extraArgs,
    'about:blank',
  ];
  dbg('launching', browserPath, flags.join(' '));

  const child = spawn(browserPath, flags, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (buf) => {
    stderr = (stderr + buf.toString()).slice(-16000);
    if (DEBUG) dbg('browser stderr:', buf.toString().trim());
  });
  child.stdout.on('data', (buf) => {
    stdout = (stdout + buf.toString()).slice(-4000);
    if (DEBUG) dbg('browser stdout:', buf.toString().trim());
  });
  let earlyExitInfo = null;
  const exitPromise = new Promise((resolveExit) => {
    child.once('exit', (code, signal) => {
      earlyExitInfo = { code, signal };
      resolveExit(earlyExitInfo);
    });
  });
  child.on('error', (err) => {
    stderr += `\nspawn error: ${err.message}`;
  });

  const version = await waitForDevToolsEndpoint({
    port,
    timeout: startupTimeout,
    getExitInfo: () => earlyExitInfo,
    getStderr: () => stderr,
  });

  const page = new CDPPage({
    browserPath,
    port,
    profileDir,
    wsUrl: version.webSocketDebuggerUrl,
    child,
    exitPromise,
    getStderr: () => stderr + (stdout ? `\n--- stdout ---\n${stdout}` : ''),
    defaultTimeout,
    ownedProfile: !userDataDir,
  });

  try {
    await page.connect();
    if (viewport) await page.setViewport({ width, height });
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
  return page;
}

/** launchBrowser 是 launch 的别名。 */
export const launchBrowser = launch;
