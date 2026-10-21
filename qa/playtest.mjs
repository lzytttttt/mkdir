#!/usr/bin/env node
/**
 * qa/playtest.mjs — 《新建文件夹》逐关通关自动化（20 关版）
 *
 * 无第三方依赖，复用 qa/cdp.mjs 的无头浏览器基建。
 * 依据 docs/ENGINE.md 与 docs/ACT3.md：
 *   - 通过 NF.debug.jump / NF.debug.state / NF.debug.reset / NF.debug.hint 测试钩子
 *   - 通过 [data-t] 选择器 + 真实鼠标键盘操作（click/rightClick/dblclick/drag/key/typeText/hold）
 *
 * 运行模式：
 *   node qa/playtest.mjs                     # 完整验收：preflight → 存档迁移 → 逐关独立 → 连续通关 1→20 → 附加检查
 *   node qa/playtest.mjs --preflight         # 只检查游戏是否可玩（退出码 0=就绪，2=未就绪）
 *   node qa/playtest.mjs --levels=1-10 --max-level=10   # 只回归前 10 关
 *   node qa/playtest.mjs --levels=11,12,19   # 只跑指定关卡的独立验证（调试用）
 *   node qa/playtest.mjs --continuous-only   # 只跑连续通关
 *
 * 覆盖：标题开始（20 点）、每关截图、进度存档、旧 10 关存档迁移、刷新续档、提示重播、静音按钮、
 *       关卡地图（20 格）、最终结局（20 文件夹 + 再玩一次）、每关完成断言、console 无异常、结构化摘要。
 *
 * 说明：L11-L19 作者尚未交付时是占位实现，占位关会被直接点过（见 solveLevel）；
 *       ACT3 规定的真实战斗 solver 已按文档写好，作者交付后自动切换。
 *
 * 退出码：0 全部通过；1 有失败；2 游戏尚未就绪（例如核心脚本缺失/加载报错）。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { launch, getFreePort } from './cdp.mjs';

/* ------------------------------- 常量 ------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(HERE, 'shots');
const REPORT_PATH = join(HERE, 'playtest-report.json');
const PROGRESS_KEY = 'nf.progress.v1';
const MAX_LEVEL = 20; // 第一幕 10 关 + 第四面墙 10 关
const BREAK_LEVEL = 10; // 旧 10 关存档的迁移边界（迁移后从 11 关继续）
const ALL_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
const PHASE_TIMEOUT = 45000; // 单关完成等待上限
const PLACEHOLDER_TIMEOUT = 12000; // 占位关（点击即过）完成等待上限

/* -------------------------------- CLI -------------------------------- */

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return fallback;
}
function hasFlag(name) {
  return argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));
}

const OPTIONS = {
  preflight: hasFlag('preflight'),
  browser: flag('browser', 'auto'),
  url: flag('url', null),
  browserPath: flag('browser-path', null),
  levels: parseLevels(flag('levels', null)),
  // 连续通关跑到第几关（默认 20；阶段回归可用 --max-level=10）
  maxLevel: clampLevel(Number(flag('max-level', String(MAX_LEVEL))) || MAX_LEVEL),
  independentOnly: hasFlag('independent-only'),
  continuousOnly: hasFlag('continuous-only'),
  // 默认把"标题/提示/静音/地图/结局"等附加检查计入总结果；--no-strict-checks 时只报告不判失败
  strictChecks: !hasFlag('no-strict-checks'),
};

function clampLevel(n) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(n)));
}

function parseLevels(text) {
  if (!text) return [...ALL_LEVELS];
  const out = new Set();
  for (const part of String(text).split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const range = piece.match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let i = Number(range[1]); i <= Number(range[2]); i++) out.add(i);
    } else if (/^\d+$/.test(piece)) {
      out.add(Number(piece));
    }
  }
  return [...out].filter((n) => n >= 1 && n <= MAX_LEVEL).sort((a, b) => a - b);
}

/* ------------------------------ 结果记录 ------------------------------ */

const report = {
  startedAt: new Date().toISOString(),
  browser: null,
  url: null,
  mode: OPTIONS.preflight ? 'preflight' : 'full',
  ok: false,
  phases: {},
  levels: [],
  checks: [],
  consoleErrors: [],
  failedRequests: [],
  screenshots: [],
  notes: [],
};

const screenshots = [];
const failedRequests = [];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function pngInfo(file) {
  assert(existsSync(file), `截图文件不存在：${file}`);
  const buf = readFileSync(file);
  assert(buf.length > 1000, `截图文件过小：${file}（${buf.length} 字节）`);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) assert(buf[i] === signature[i], `不是合法 PNG：${file}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/** 截图并登记（可断言是否成功、尺寸是否正常） */
async function shot(page, name) {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot(file);
  const info = pngInfo(file);
  screenshots.push({ name: `${name}.png`, path: file, ...info });
  return { file, name: `${name}.png`, ...info };
}

/* ---------------------------- 静态服务器 ---------------------------- */

async function startServer() {
  const port = await getFreePort();
  const serverPath = join(ROOT, 'server.mjs');
  const child = spawn(process.execPath, [serverPath, String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (buf) => {
    output += buf.toString();
  });
  child.stderr.on('data', (buf) => {
    output += buf.toString();
  });
  let exitInfo = null;
  const exited = new Promise((resolveExit) => {
    child.once('exit', (code, signal) => {
      exitInfo = { code, signal };
      resolveExit(exitInfo);
    });
  });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (exitInfo) throw new Error(`静态服务器提前退出：${JSON.stringify(exitInfo)}\n${output}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        await res.arrayBuffer();
        return {
          port,
          url,
          output: () => output,
          stop: async () => {
            if (exitInfo) return exitInfo;
            try {
              child.kill();
            } catch {
              /* ignore */
            }
            const result = await Promise.race([exited, sleep(3000).then(() => null)]);
            if (!result) {
              spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
              });
              await Promise.race([exited, sleep(2000)]);
            }
            return exitInfo || result;
          },
        };
      }
    } catch {
      /* 继续等 */
    }
    await sleep(100);
  }
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  throw new Error(`静态服务器启动超时：${url}\n${output}`);
}

/* --------------------------- 页面/游戏辅助 --------------------------- */

async function waitFirst(page, selectors, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        if (await page.exists(selector)) return selector;
      } catch (err) {
        lastError = err;
      }
    }
    await sleep(100);
  }
  throw new Error(
    `等待元素超时（${timeout}ms）：${selectors.join(' | ')}` +
      (lastError ? `；最后错误：${lastError.message}` : '')
  );
}

async function clickFirst(page, selectors, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        if (await page.exists(selector)) {
          await page.click(selector);
          return selector;
        }
      } catch (err) {
        lastError = err;
      }
    }
    await sleep(100);
  }
  throw new Error(
    `找不到可点击元素（${timeout}ms）：${selectors.join(' | ')}` +
      (lastError ? `；最后错误：${lastError.message}` : '')
  );
}

async function rectOfNth(page, selector, index = 0) {
  const rect = await page.evaluate(`(() => {
    const els = document.querySelectorAll(${JSON.stringify(selector)});
    const el = els[${index}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top };
  })()`);
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error(`元素不存在或尺寸为 0：${selector} #${index}`);
  }
  return rect;
}

async function gameState(page) {
  return page.evaluate(`(() => {
    try { return window.NF && NF.debug && NF.debug.state ? NF.debug.state() : null; }
    catch (err) { return { error: String(err && err.message || err) }; }
  })()`);
}

async function waitLevel(page, level, timeout = 12000) {
  await page.waitFor(
    `(() => { const s = window.NF && NF.debug && NF.debug.state(); return s && s.level === ${level}; })()`,
    timeout
  );
}

function isLevelComplete(state, level) {
  if (!state) return false;
  if (state.finished) return true;
  if (Array.isArray(state.completed) && state.completed.includes(level)) return true;
  if (typeof state.level === 'number' && state.level > level) return true;
  return false;
}

async function waitLevelComplete(page, level, timeout = PHASE_TIMEOUT) {
  await page.waitFor(
    `(() => {
      const s = window.NF && NF.debug && NF.debug.state();
      if (!s) return false;
      if (s.finished) return true;
      const done = Array.isArray(s.completed) ? s.completed : [];
      return done.includes(${level}) || (typeof s.level === 'number' && s.level > ${level});
    })()`,
    timeout
  );
}

async function readProgress(page) {
  return page.evaluate(`(() => {
    try { return JSON.parse(localStorage.getItem(${JSON.stringify(PROGRESS_KEY)})); }
    catch (err) { return null; }
  })()`);
}

async function waitTitleVisible(page, timeout = 12000) {
  await page.waitFor(
    `(() => {
      const el = document.querySelector('[data-t="title"]');
      if (!el) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity || 1) <= 0.1) return false;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.5 || r.height < innerHeight * 0.5) return false;
      // 真正可点：中心点命中的必须是标题层或其子元素（避免被结局层/遮罩挡住却"看起来可见"）
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return !!hit && (hit === el || el.contains(hit));
    })()`,
    timeout
  );
}

/** 从标题页开始游戏：多策略重试（标题开始元素 / 标题层 / Enter / Space） */
async function startFromTitle(page) {
  const waitStarted = (timeout) =>
    page.waitFor(
      `(() => { const s = window.NF && NF.debug && NF.debug.state(); return s && typeof s.level === 'number' && s.level >= 1; })()`,
      timeout
    );
  const attempts = [
    async () => {
      if (await page.exists('[data-t="title-start"]')) await page.click('[data-t="title-start"]');
      else await page.click('[data-t="title"]');
    },
    async () => {
      await page.click('[data-t="title"]');
    },
    async () => {
      await page.key('Enter');
    },
    async () => {
      await page.key('Space');
    },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      await attempt();
      await waitStarted(4000);
      return;
    } catch (err) {
      lastError = err;
      await sleep(200);
    }
  }
  throw new Error(`标题页无法开始游戏：${lastError ? lastError.message : '未知原因'}`);
}

async function waitEnding(page, timeout = 20000) {
  // 注意：NF.Game.progress.finished 在 finishLevel 时立刻置 true，但结局 DOM 要等
  // 2.1~2.3s 后才由 showEnding() 建出来。若只看 finished 提前返回，之后残留的
  // showEnding 定时器会在下一阶段 reset 之后把结局又打开（进度/标题全被覆盖）。
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.exists('[data-t="ending"]')) return true;
    if (await page.exists('[data-t="ending-layer"]')) {
      const visible = await page.evaluate(`(() => {
        const el = document.querySelector('[data-t="ending-layer"]');
        if (!el) return false;
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0.1 && el.childElementCount > 0;
      })()`);
      if (visible) return true;
    }
    await sleep(200);
  }
  throw new Error(`等待结局 DOM 超时（${timeout}ms）`);
}

/* --------------------------- 菜单/对话框辅助 --------------------------- */

/** 在桌面空白处右键打开菜单（优先 data-t 容器，失败改用坐标） */
async function openDesktopMenu(page) {
  const points = [
    [900, 620],
    [720, 560],
    [1080, 720],
  ];
  const attempts = [];
  for (const point of points) {
    attempts.push(async () => {
      await page.rightClick(point);
      await page.waitForSelector('[data-t="menu"]', 1200);
    });
  }
  attempts.push(async () => {
    await page.rightClick('[data-t="desktop"]');
    await page.waitForSelector('[data-t="menu"]', 2000);
  });
  attempts.push(async () => {
    await page.rightClick('[data-t="level-root"]');
    await page.waitForSelector('[data-t="menu"]', 2000);
  });
  let lastError = null;
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (err) {
      lastError = err;
      await page.key('Escape').catch(() => {});
    }
  }
  throw new Error(`右键菜单没有打开：${lastError ? lastError.message : '未知原因'}`);
}

/** 键盘选择菜单项：↓ 选到 data-t=target 后 Enter 确认/展开。
 *  注意：子菜单的 .sel 嵌套在根菜单 DOM 内，取文档顺序最后一个才是"当前聚焦层"的选中项。 */
async function keyboardPickMenuItem(page, targetTestid, maxSteps = 10) {
  for (let step = 0; step < maxSteps; step++) {
    const selected = await page.evaluate(`(() => {
      const els = document.querySelectorAll('.nf-menu .sel');
      if (!els.length) return null;
      return els[els.length - 1].getAttribute('data-t');
    })()`);
    if (selected === targetTestid) {
      await page.key('Enter');
      return;
    }
    await page.key('ArrowDown');
    await sleep(90);
  }
  throw new Error(`键盘选择菜单项失败：${targetTestid}`);
}

/** 确认命名对话框（优先点确定，disabled 时尝试回车） */
async function confirmDialog(page) {
  await waitFirst(page, ['[data-t="dialog"]', '[data-t="name-input"]', '[data-t="dialog-ok"]'], 8000);
  const okState = await page.evaluate(`(() => {
    const btn = document.querySelector('[data-t="dialog-ok"]');
    return btn ? { exists: true, disabled: !!btn.disabled } : { exists: false };
  })()`);
  if (okState.exists && !okState.disabled) {
    await page.click('[data-t="dialog-ok"]');
    return;
  }
  await page.key('Enter');
}

/** 有些关卡直接生成文件夹不弹名字对话框：轮询一小段时间，有对话框才确认 */
async function maybeConfirmDialog(page, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hasDialog =
      (await page.exists('[data-t="name-input"]')) || (await page.exists('[data-t="dialog-ok"]'));
    if (hasDialog) {
      await confirmDialog(page);
      return true;
    }
    await sleep(80);
  }
  return false;
}

/** 等对话框 + 遮罩完全退场（OS.dialog 关闭动画 180ms）。
 *  L10 等关卡在对话框关闭后要马上拖拽文件夹，遮罩残留会挡住 pointerdown。 */
async function waitDialogGone(page, timeout = 4000) {
  await page.waitFor(
    `!document.querySelector('[data-t="name-dialog"]') &&
     !document.querySelector('[data-t="dialog"]') &&
     !document.querySelector('.nf-backdrop')`,
    timeout
  );
}

/** 标准"右键 → 新建 → 文件夹 → 确定"流程 */
async function createFolderViaMenu(page) {
  await openDesktopMenu(page);
  await clickFirst(page, ['[data-t="menu-item-new"]'], 4000);
  await sleep(150);
  if (await page.exists('[data-t="menu-item-folder"]')) {
    await page.click('[data-t="menu-item-folder"]');
  }
  await confirmDialog(page);
}

/** 等元素尺寸和位置都稳定（folder-pop / 掉落 transition / 弹跳之类的动画期间，
 *  算出来的点击点会落在元素外面导致 pointerdown 打空）。 */
async function waitElementSettled(page, selector, timeout = 3000, minSize = 20) {
  const deadline = Date.now() + timeout;
  let prev = null;
  while (Date.now() < deadline) {
    const rect = await page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: b.width, h: b.height, x: b.left, y: b.top };
    })()`);
    if (
      rect &&
      prev &&
      Math.abs(rect.w - prev.w) < 1 &&
      Math.abs(rect.h - prev.h) < 1 &&
      Math.abs(rect.x - prev.x) < 1 &&
      Math.abs(rect.y - prev.y) < 1 &&
      rect.w >= minSize
    ) {
      return rect;
    }
    prev = rect;
    await sleep(80);
  }
  return prev;
}

/** 找一个能命中"任意匹配元素"的点，并带上该元素的 --ox/--oy（L6 碎片用）。
 *  clip-path 裁切形状的碎片互相覆盖，外接矩形中心常点不到 → 先逐元素采样，再全屏网格兜底。 */
async function findHitPoints(page, selector) {
  const found = await page.evaluate(`(() => {
    const els = Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(selector)}));
    if (!els.length) return null;
    const fracs = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const ox = parseFloat(el.style.getPropertyValue('--ox')) || 0;
      const oy = parseFloat(el.style.getPropertyValue('--oy')) || 0;
      for (const fy of fracs) {
        for (const fx of fracs) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) return { x: x, y: y, ox: ox, oy: oy };
        }
      }
    }
    // 兜底：全屏网格扫描，命中任意匹配元素，取离其外接矩形中心最近的点
    let best = null;
    let bestDist = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ox = parseFloat(el.style.getPropertyValue('--ox')) || 0;
      const oy = parseFloat(el.style.getPropertyValue('--oy')) || 0;
      for (let y = 30; y < innerHeight - 30; y += 8) {
        for (let x = 30; x < innerWidth - 30; x += 8) {
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) {
            const d = Math.hypot(x - cx, y - cy);
            if (d < bestDist) { bestDist = d; best = { x: x, y: y, ox: ox, oy: oy }; }
          }
        }
      }
    }
    return best;
  })()`);
  if (!found) throw new Error(`找不到可拖拽命中点：${selector}`);
  return found;
}

/** 开始真实交互前清掉幽灵演示 / 菜单 / 对话框，并把文档滚动归零
 *（个别关卡测 offscreen 元素时历史版本可能把文档滚走，Input 坐标会整体错位） */
async function resetTransientUI(page) {
  await page.evaluate(`(() => {
    try { window.scrollTo(0, 0); } catch (e) {}
    try { document.documentElement.scrollTop = 0; document.documentElement.scrollLeft = 0; } catch (e) {}
    try { document.body.scrollTop = 0; document.body.scrollLeft = 0; } catch (e) {}
    try { if (window.NF && NF.Ghost) NF.Ghost.cancel(); } catch (e) {}
    try { if (window.NF && NF.OS) NF.OS.closeMenus(); } catch (e) {}
    try { if (window.NF && NF.OS) NF.OS.closeDialogs(); } catch (e) {}
  })()`);
}

/** 各关操作 ------------------------------ */
/* 说明：以下操作序列依据 docs/ENGINE.md 第 9、11 节编写；
 * 游戏实现完成后如与细节不符，在此校准（solver 只依赖 [data-t] 与 NF.debug）。 */

const LEVEL_SOLVERS = {
  1: async (page) => {
    // 实现见 js/levels/l01.js：右键 → 新建（展开子菜单）→ 文件夹 → 名称对话框 → 确定
    await openDesktopMenu(page);
    await page.click('[data-t="menu-item-new"]');
    await page.waitFor(
      `!!document.querySelector('.nf-submenu.open [data-t="menu-item-folder"]')`,
      4000
    );
    await page.click('[data-t="menu-item-folder"]');
    await waitFirst(page, ['[data-t="name-dialog"]', '[data-t="dialog-ok"]'], 8000);
    await page.click('[data-t="dialog-ok"]');
  },
  2: async (page) => {
    // 实现见 js/levels/l02.js：菜单项会躲鼠标，右键开菜单后只能用键盘
    await openDesktopMenu(page);
    await page.waitForSelector('[data-t="menu"]', 3000);
    await page.key('ArrowDown'); // 选中"新建"并展开子菜单
    await sleep(150);
    await page.key('Enter'); // 进入子菜单并选中"文件夹"
    await sleep(120);
    await page.key('Enter'); // 确认
  },
  3: async (page) => {
    // 实现见 js/levels/l03.js：右键"新建"被锁 → 必须 Ctrl+Shift+F
    await page.key('Ctrl+Shift+F');
  },
  4: async (page) => {
    // 实现见 js/levels/l04.js：Ctrl+Shift+F 打开命名对话框 → 全选清空 → 输入合法名称 → Enter
    await page.key('Ctrl+Shift+F');
    await page.waitForSelector('[data-t="name-input"]', 8000);
    await sleep(250); // 等 120ms 的 validate() 先跑一轮
    await page.click('[data-t="name-input"]');
    await page.key('Ctrl+A');
    await page.key('Backspace');
    await page.typeText('qa-folder');
    await page.waitFor(
      `(() => { const b = document.querySelector('[data-t="dialog-ok"]'); return !!b && !b.disabled; })()`,
      4000
    );
    await page.key('Enter');
  },
  5: async (page) => {
    // 实现见 js/levels/l05.js：两张纸拖到一起合成文件夹（merge-folder），再把第三张拖进去
    await page.waitForSelector('[data-t="file"]', 8000);
    for (let round = 0; round < 8; round++) {
      const state = await gameState(page);
      if (isLevelComplete(state, 5)) return;
      const count = await page.evaluate(`document.querySelectorAll('[data-t="file"]').length`);
      if (count < 2) break;
      const a = await rectOfNth(page, '[data-t="file"]', 0);
      const b = await rectOfNth(page, '[data-t="file"]', 1);
      await page.drag({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, {
        steps: 8,
        delay: 14,
        pressDelay: 30,
        releaseDelay: 30,
      });
      await sleep(800); // 等 mergeTwo 的收拢/闪白动画（210ms + 440ms）
    }
    for (let round = 0; round < 8; round++) {
      const state = await gameState(page);
      if (isLevelComplete(state, 5)) return;
      const count = await page.evaluate(`document.querySelectorAll('[data-t="file"]').length`);
      if (!count) break;
      const target = await waitFirst(page, ['[data-t="merge-folder"]'], 4000).catch(() => null);
      if (!target) break;
      const a = await rectOfNth(page, '[data-t="file"]', 0);
      const b = await page.rect(target);
      await page.drag({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, {
        steps: 8,
        delay: 14,
        pressDelay: 30,
        releaseDelay: 30,
      });
      await sleep(850);
    }
  },
  6: async (page) => {
    // 实现见 js/levels/l06.js：4 块 clip-path 碎片拖回虚线轮廓；拼好后一角崩飞，再拖回。
    // 碎片是裁切形状且互相覆盖，用 findHitPoints 找命中点，再按该碎片的 --ox/--oy 拖回原位
    //（l06 判定 rx = ox + st.dx / ry = oy + st.dy 是否接近 0）。
    await page.waitForSelector('[data-t="outline"]', 8000);
    for (let round = 0; round < 12; round++) {
      const state = await gameState(page);
      if (isLevelComplete(state, 6)) return;
      const pending = await page.evaluate(`(() => {
        const list = Array.prototype.slice.call(document.querySelectorAll('[data-t="shard"]')).filter(function (el) {
          return !el.classList.contains('lv6-placed') && !el.classList.contains('lv6-gone');
        });
        return list.length;
      })()`);
      if (!pending) break;
      const shard = await findHitPoints(
        page,
        '[data-t="shard"]:not(.lv6-placed):not(.lv6-gone)'
      );
      await page.drag(
        { x: shard.x, y: shard.y },
        { x: shard.x - shard.ox, y: shard.y - shard.oy },
        { steps: 8, delay: 14, pressDelay: 35, releaseDelay: 35 }
      );
      await sleep(520); // snapShard 330ms 后才标记 placed
    }
    // 拼合后 640ms 崩角、840ms 后角落可拖
    await page.waitForSelector('[data-t="corner-shard"]', 8000).catch(() => {});
    for (let i = 0; i < 40; i++) {
      const state = await gameState(page);
      if (isLevelComplete(state, 6)) return;
      const ready = await page.evaluate(
        `(() => { const el = document.querySelector('[data-t="corner-shard"]'); return !!el && el.classList.contains('lv6-corner-live'); })()`
      );
      if (ready) break;
      await sleep(200);
    }
    for (let round = 0; round < 6; round++) {
      const state = await gameState(page);
      if (isLevelComplete(state, 6)) return;
      const corner = await findHitPoints(page, '[data-t="corner-shard"]').catch(() => null);
      if (!corner) {
        await sleep(300);
        continue;
      }
      const outline = await page.rect('[data-t="outline"]');
      const cornerRect = await page.rect('[data-t="corner-shard"]');
      // 角落当前相对轮廓中心的位移；拖动反向位移即可触发 snapCorner
      const offset = { x: cornerRect.cx - outline.cx, y: cornerRect.cy - outline.cy };
      await page.drag(
        { x: corner.x, y: corner.y },
        { x: corner.x - offset.x, y: corner.y - offset.y },
        { steps: 8, delay: 16, pressDelay: 40, releaseDelay: 40 }
      );
      await sleep(600);
    }
  },
  7: async (page) => {
    // 实现见 js/levels/l07.js：双击终端图标 → 输入 mkdir → 回车
    await page.waitForSelector('[data-t="terminal-icon"]', 8000);
    await page.dblclick('[data-t="terminal-icon"]');
    await page.waitForSelector('[data-t="terminal-window"]', 8000);
    await page.waitForSelector('[data-t="terminal-input"]', 8000);
    await page.click('[data-t="terminal-input"]');
    await page.typeText('mkdir qa-folder');
    await page.key('Enter');
  },
  8: async (page) => {
    // 实现见 js/levels/l08.js（20 关加难版）：
    // 阶段1 拖前封面→后封面合上 → 阶段2 按 ←/→ 对齐卡扣（读 [data-t=d3-dial] 的 dataset.aligned）
    // → 再拖前封面→后封面合上 → 阶段3 在前封面上按住 1.5s（mouseDown→sleep→mouseUp）
    await page.waitForSelector('[data-t="d3-front"]', 8000);
    await page.waitForSelector('[data-t="d3-back"]', 8000);
    await sleep(400); // 等入场/浮动动画稳定
    const dragToBack = () =>
      page.drag('[data-t="d3-front"]', '[data-t="d3-back"]', {
        steps: 12,
        delay: 20,
        pressDelay: 40,
        releaseDelay: 40,
      });
    const dialAligned = () =>
      page.evaluate(
        `(() => { const d = document.querySelector('[data-t="d3-dial"]'); return !!d && d.dataset.aligned === '1'; })()`
      );
    const waitPhase = (phase, timeout = 15000) =>
      page.waitFor(
        `(() => { const d = document.querySelector('[data-t="d3-dial"]'); return !!d && d.dataset.phase === '${phase}'; })()`,
        timeout
      );
    // 阶段 1：合上 → 进入卡扣对齐
    await dragToBack();
    await waitPhase('2');
    // 阶段 2：目标角度是 15 的倍数（-60..60 随机）；先一路 ArrowRight，不行再反向兜底
    const rotateUntilAligned = async (key, times) => {
      for (let i = 0; i < times; i++) {
        if (await dialAligned()) return true;
        await page.key(key);
        await sleep(70);
      }
      return dialAligned();
    };
    if (!(await rotateUntilAligned('ArrowRight', 13))) {
      await rotateUntilAligned('ArrowLeft', 26);
    }
    assert(await dialAligned(), '卡扣未能对齐（d3-dial.dataset.aligned 仍为 0）');
    // 阶段 2 合上 → 阶段 3
    await dragToBack();
    await waitPhase('3');
    // 阶段 3：按住前封面 1.5s（实现里 dur=1500，留 200ms 余量）
    await page.mouseDown('[data-t="d3-front"]');
    await sleep(1700);
    await page.mouseUp('[data-t="d3-front"]');
  },
  9: async (page) => {
    // 实现见 js/levels/l09.js：建文件夹后立刻拖进安全罐，共 3 轮（机器人会抢）
    // 注意关卡实现：每轮保存后 950ms 的 startRound() 会把 folder 置空；
    // 若在那之前就建下一个文件夹会被清掉（l09.js 的竞态，已记录给 Lead）。
    // QA 侧用"罐子重新高亮"作为可以安全建下一轮的信号；
    // 第 3 个保存后走的是 950ms 后的 winLevel（不会再 startRound），要随时复查 completed。
    await page.waitForSelector('[data-t="jar-drop"]', 8000);
    for (let attempt = 0; attempt < 24; attempt++) {
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 9)) return;
      const hot = await page
        .waitForSelector('.lv9-jar.is-hot', 3000)
        .then(() => true)
        .catch(() => false);
      const afterWait = await gameState(page);
      if (!afterWait || isLevelComplete(afterWait, 9)) return;
      if (!hot) {
        await sleep(150);
        continue;
      }
      await page.key('Ctrl+Shift+F');
      try {
        await page.waitForSelector('[data-t="created-folder"]', 4000);
      } catch {
        await sleep(200);
        continue;
      }
      try {
        await page.drag('[data-t="created-folder"]', '[data-t="jar-drop"]', {
          steps: 5,
          delay: 8,
          pressDelay: 20,
          releaseDelay: 20,
        });
      } catch {
        await sleep(200);
        continue;
      }
      // 等本轮结算：保存成功（元素立刻移除）或被机器人吃掉（650ms 后移除）
      await page
        .waitFor(
          `(() => {
            const s = NF.debug && NF.debug.state();
            if (s && s.completed && s.completed.includes(9)) return true;
            return !document.querySelector('[data-t="created-folder"]');
          })()`,
          5000
        )
        .catch(() => {});
      await sleep(120);
    }
    const finalState = await gameState(page);
    if (!finalState || !isLevelComplete(finalState, 9)) {
      throw new Error('第 9 关多次尝试后仍未完成');
    }
  },
  10: async (page) => {
    // 实现见 js/levels/l10.js（20 关加难版）：
    // 建文件夹 → 拖到自己影子上触发递归 → 进入"游戏里的游戏"(meta-layer)
    // → 把文件夹拖进"真实窗口"里漂移的小罐子（meta-jar 实时 rect，拖拽中漂移减速到 22%）
    await page.key('Ctrl+Shift+F');
    await page.waitForSelector('[data-t="name-input"]', 8000);
    await sleep(250);
    await page.click('[data-t="dialog-ok"]');
    await waitDialogGone(page);
    await page.waitForSelector('[data-t="created-folder"]', 8000);
    await waitElementSettled(page, '[data-t="created-folder"]', 4000);
    // 阶段 2：拖到自身影子上触发递归（onStart 会生成 [data-t=folder-shadow]）
    const folder = await page.rect('[data-t="created-folder"]');
    const w = Math.max(24, Math.min(40, folder.width * 0.4));
    const h = Math.max(18, Math.min(28, folder.height * 0.35));
    await page.drag(
      { x: folder.left + w, y: folder.top + h },
      { x: folder.left + w + 26, y: folder.top + h + 9 },
      { steps: 8, delay: 20, pressDelay: 40, releaseDelay: 40 }
    );
    // 阶段 3：等迷你窗口出现，再投进真实窗口的小罐子
    await page.waitForSelector('[data-t="meta-layer"]', 25000);
    await page.waitForSelector('[data-t="meta-jar"]', 10000);
    await sleep(450); // 文件夹在 enterMeta 后 320ms 才重新绑定拖拽
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 10)) return;
      const jar = await page.evaluate(`(() => {
        const el = document.querySelector('[data-t="meta-jar"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      })()`);
      if (!jar) break;
      try {
        // 窗口在漂移（拖拽时减速）；多步移动 + 到点松手，判定阈值为中心距 <104px
        await page.drag('[data-t="created-folder"]', { x: jar.cx, y: jar.cy }, {
          steps: 14,
          delay: 16,
          pressDelay: 40,
          releaseDelay: 40,
        });
      } catch {
        await sleep(300);
      }
      await sleep(500);
    }
  },
  11: async (page) => {
    // ACT3 L11 幽灵出逃：点 rogue-ghost 满 3 次（dataset.hits）→ 拖 stolen-folder 到空白处
    await page.waitForSelector('[data-t="rogue-ghost"]', 8000);
    for (let attempt = 0; attempt < 30; attempt++) {
      const hits = await page.evaluate(`(() => {
        const el = document.querySelector('[data-t="rogue-ghost"]');
        return el ? Number(el.dataset.hits || 0) : -1;
      })()`);
      if (hits >= 3) break;
      const rect = await page.rect('[data-t="rogue-ghost"]');
      await page.click({ x: rect.cx, y: rect.cy });
      await sleep(120);
    }
    await page.waitForSelector('[data-t="stolen-folder"]', 10000);
    const card = await page.rect('[data-t="stolen-folder"]');
    await page.drag({ x: card.cx, y: card.cy }, { x: 1000, y: 600 }, {
      steps: 10,
      delay: 14,
      pressDelay: 40,
      releaseDelay: 40,
    });
  },
  12: async (page) => {
    // ACT3 L12 游戏里的游戏：迷你窗口内右键 → mini-item-new → 把 mini-folder 拖出窗口
    await page.waitForSelector('[data-t="mini-window"]', 8000);
    await sleep(400);
    const vw = await page.evaluate('innerWidth');
    const win = await page.rect('[data-t="mini-window"]');
    await page.rightClick({ x: win.cx, y: win.cy });
    await page.waitForSelector('[data-t="mini-menu"]', 5000);
    await page.click('[data-t="mini-item-new"]');
    await page.waitForSelector('[data-t="mini-folder"]', 5000);
    const mini = await page.rect('[data-t="mini-folder"]');
    const winNow = await page.rect('[data-t="mini-window"]');
    await page.drag(
      { x: mini.cx, y: mini.cy },
      { x: Math.min(vw - 100, winNow.x + winNow.width + 140), y: winNow.cy },
      { steps: 12, delay: 14, pressDelay: 40, releaseDelay: 40 }
    );
  },
  13: async (page) => {
    // ACT3 L13 任务栏抽屉：把 drawer-handle 向上拖 ≥130px（这里 230px）→ 点 drawer-folder
    await page.waitForSelector('[data-t="drawer-handle"]', 8000);
    const handle = await page.rect('[data-t="drawer-handle"]');
    await page.drag(
      { x: handle.cx, y: handle.cy },
      { x: handle.cx, y: handle.cy - 230 },
      { steps: 12, delay: 16, pressDelay: 40, releaseDelay: 40 }
    );
    await page.waitForSelector('[data-t="drawer-folder"]', 5000);
    await page.click('[data-t="drawer-folder"]');
  },
  14: async (page) => {
    // ACT3 L14 影子玩家（实现见 js/levels/l14.js）：
    // 右键建文件夹（直接生成，无名字框）→ rival 抢走后点它两次（rival 周围 120px 内都算命中）
    // → 3.4s 黄金窗口内把 created-folder 拖进 safe-zone（判定已放宽）。
    const t00 = Date.now();
    const dbg = process.env.QA_DEBUG_SOLVERS
      ? (...args) => console.log('[L14]', ((Date.now() - t00) / 1000).toFixed(1) + 's', ...args)
      : () => {};
    dbg('start');
    await openDesktopMenu(page);
    await clickFirst(page, ['[data-t="menu-item-new"]'], 4000);
    await page.waitForSelector('.nf-submenu.open [data-t="menu-item-folder"]', 4000);
    await page.click('[data-t="menu-item-folder"]');
    await page.waitForSelector('[data-t="created-folder"]', 10000);
    dbg('folder created');
    // 等 rival 抢到文件夹（phase 3 / carried=1）
    await page.waitFor(
      `(() => { const el = document.querySelector('[data-t="rival"]'); return !!el && el.dataset.carried === '1'; })()`,
      20000
    );
    dbg('rival carried');
    const rivalInfo = () =>
      page.evaluate(`(() => {
        const el = document.querySelector('[data-t="rival"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const scene = document.querySelector('[data-qa="l14"]');
        return {
          stunned: el.dataset.stunned === '1',
          hits: el.dataset.hits,
          phase: scene ? scene.dataset.phase : null,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        };
      })()`);
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 14)) return;
      const info = await rivalInfo();
      if (!info) {
        dbg('attempt', attempt, 'no rival');
        await sleep(120);
        continue;
      }
      if (!info.stunned) {
        // rival 周围 120px 内点击都算命中（20 关版已放宽）；用最小延迟点击追移动目标
        await page.click({ x: info.cx, y: info.cy }, { moveDelay: 0, delay: 4 });
        dbg('attempt', attempt, 'click', 'hits=' + info.hits, 'phase=' + info.phase);
        await sleep(70);
        continue;
      }
      // 已眩晕：等文件夹落地可拖（startStun 340ms 后绑定拖拽），再拖进安全区。
      // 注意：掉落到 dropHome 的 transition 约 420ms、随后还有弹跳动画；动画期间算出的
      // 拖拽起点会落在元素外导致 pointerdown 打空（多关连跑时曾被拖慢到 ~28s），
      // 因此先等位置稳定，再找文件夹未被 rival 遮挡的命中点。
      try {
        await page.waitFor(
          `(() => {
            const el = document.querySelector('[data-t="created-folder"]');
            return !!el && el.dataset.state === 'dropped';
          })()`,
          4000
        );
        await waitElementSettled(page, '[data-t="created-folder"]', 3000, 20);
        const folderPoint = await findHitPoints(page, '[data-t="created-folder"]');
        const safe = await page.rect('[data-t="safe-zone"]');
        dbg('drag start at', Math.round(folderPoint.x), Math.round(folderPoint.y), '→ safe', Math.round(safe.cx), Math.round(safe.cy));
        await page.drag(
          { x: folderPoint.x, y: folderPoint.y },
          { x: safe.cx, y: safe.cy },
          { steps: 8, delay: 6, pressDelay: 15, releaseDelay: 15 }
        );
        dbg('drag done');
      } catch (err) {
        dbg('drag failed:', err.message);
        /* 黄金窗口没赶上，会再次被抢，继续重试 */
      }
      const postDrag = await page.evaluate(`(() => {
        const f = document.querySelector('[data-t="created-folder"]');
        const s = document.querySelector('[data-t="safe-zone"]');
        const scene = document.querySelector('[data-qa="l14"]');
        if (!f || !s) return { missing: true, phase: scene ? scene.dataset.phase : null };
        const fr = f.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        const fc = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
        const sc = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
        return {
          phase: scene ? scene.dataset.phase : null,
          state: f.dataset.state,
          transform: f.style.transform || '',
          left: f.style.left,
          top: f.style.top,
          dist: Math.round(Math.hypot(fc.x - sc.x, fc.y - sc.y)),
          inExpanded: fc.x > sr.left - 40 && fc.x < sr.right + 40 && fc.y > sr.top - 40 && fc.y < sr.bottom + 40,
        };
      })()`);
      dbg('post-drag', JSON.stringify(postDrag));
      await page
        .waitFor(`(() => { const s = NF.debug && NF.debug.state(); return !!(s && (s.completed || []).includes(14)); })()`, 3000)
        .catch(() => {});
      dbg('after drag, completed=', JSON.stringify((await gameState(page)).completed));
      if (isLevelComplete(await gameState(page), 14)) return;
      await sleep(200);
    }
    const finalState = await gameState(page);
    if (!finalState || !isLevelComplete(finalState, 14)) throw new Error('第 14 关多次尝试后仍未完成');
  },
  15: async (page) => {
    // ACT3 L15 断电：点亮真图标（假图标只会有滑稽反馈）
    await page.waitForSelector('[data-t="power-icon-real"]', 10000);
    const rect = await page.rect('[data-t="power-icon-real"]');
    await page.click({ x: rect.cx, y: rect.cy });
  },
  16: async (page) => {
    // ACT3 L16 窗口大逃亡（实现见 js/levels/l16.js）：
    // 1) 从窗口可见处拖标题栏，让"窗口中心"落到屏幕中心（距离<190 吸附）
    // 2) 三窗口中把 real-window 从标题栏拖进 window-slot（窗口中心距中心<190）
    // 3) 真窗口就位后按 Enter 确认（确定按钮会躲鼠标）
    const view = await page.evaluate(`(() => {
      const root = document.getElementById('level-root');
      return { W: root.clientWidth || innerWidth, H: root.clientHeight || innerHeight };
    })()`);
    const center = { x: view.W / 2, y: view.H / 2 };
    await page.waitForSelector('[data-t="escape-titlebar"]', 10000);
    for (let attempt = 0; attempt < 4; attempt++) {
      const win = await page.rect('[data-t="escape-window"]');
      const bar = await page.rect('[data-t="escape-titlebar"]');
      // 窗口大半在屏幕外，必须从可见的标题栏区域起拖
      const from = { x: Math.min(Math.max(bar.left + 30, 12), view.W - 12), y: bar.top + 19 };
      const delta = { x: center.x - win.cx, y: center.y - win.cy };
      await page.drag(from, { x: from.x + delta.x, y: from.y + delta.y }, {
        steps: 12,
        delay: 12,
        pressDelay: 30,
        releaseDelay: 40,
      });
      await sleep(700);
      if (await page.exists('[data-t="real-window"]')) break;
    }
    await page.waitForSelector('[data-t="real-window"]', 10000);
    await page.waitForSelector('[data-t="window-slot"]', 8000);
    for (let attempt = 0; attempt < 4; attempt++) {
      const real = await page.rect('[data-t="real-window"]');
      const slot = await page.rect('[data-t="window-slot"]');
      const from = { x: real.left + Math.min(60, real.width / 2), y: real.top + 19 };
      const delta = { x: slot.cx - real.cx, y: slot.cy - real.cy };
      await page.drag(from, { x: from.x + delta.x, y: from.y + delta.y }, {
        steps: 12,
        delay: 12,
        pressDelay: 30,
        releaseDelay: 40,
      });
      await sleep(600);
      const enabled = await page.evaluate(
        `(() => { const b = document.querySelector('[data-t="dialog-ok"]'); return !!b && !b.disabled; })()`
      );
      if (enabled) break;
    }
    await page.key('Enter');
  },
  17: async (page) => {
    // ACT3 L17 小夹的凝视（实现见 js/levels/l17.js）：
    // 闭眼窗口内右键建文件夹（不弹名字框）；文件夹出现后强制闭眼 2.4s，立刻拖进 boss-jar。
    await page.waitForSelector('[data-t="mascot-boss"]', 10000);
    const waitClosed = () =>
      page.waitFor(
        `(() => { const el = document.querySelector('[data-t="mascot-boss"]'); return !!el && el.dataset.eyes === 'closed'; })()`,
        15000
      );
    const createFolder = async () => {
      await waitClosed();
      await openDesktopMenu(page);
      await clickFirst(page, ['[data-t="menu-item-new"]'], 4000);
      await page.waitForSelector('.nf-submenu.open [data-t="menu-item-folder"]', 4000);
      await page.click('[data-t="menu-item-folder"]');
      await page.waitForSelector('[data-t="created-folder"]', 6000);
    };
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 17)) return;
      const hasFolder = await page.exists('[data-t="created-folder"]');
      if (!hasFolder) {
        try {
          await createFolder();
        } catch {
          await sleep(250);
          continue;
        }
      }
      try {
        await page.waitForSelector('[data-t="boss-jar"]', 5000);
        await page.drag('[data-t="created-folder"]', '[data-t="boss-jar"]', {
          steps: 8,
          delay: 8,
          pressDelay: 20,
          releaseDelay: 20,
        });
      } catch {
        /* 被盯成灰则重试 */
      }
      await page
        .waitFor(`(() => { const s = NF.debug && NF.debug.state(); return !!(s && (s.completed || []).includes(17)); })()`, 5000)
        .catch(() => {});
      await sleep(250);
    }
    const finalState = await gameState(page);
    if (!finalState || !isLevelComplete(finalState, 17)) throw new Error('第 17 关多次尝试后仍未完成');
  },
  18: async (page) => {
    // ACT3 L18 假结局（实现见 js/levels/l18.js）：
    // 假结局层上 Ctrl+Shift+F → 确定 → 文件夹出现在假结局层上方
    // → 拖到标题中央裂缝 rewind-target（中心距<96 或重叠>0.18）。
    await page.waitForSelector('[data-t="fake-ending"]', 8000);
    await page.waitForSelector('[data-t="rewind-target"]', 8000);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.exists('[data-t="created-folder"]')) break;
      await page.key('Ctrl+Shift+F');
      try {
        await page.waitForSelector('[data-t="name-input"]', 4000);
      } catch {
        await sleep(300);
        continue;
      }
      await sleep(250);
      await confirmDialog(page);
      await page.waitForSelector('[data-t="created-folder"]', 6000).catch(() => {});
      await sleep(300);
    }
    await page.waitForSelector('[data-t="created-folder"]', 8000);
    await waitElementSettled(page, '[data-t="created-folder"]', 4000);
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = await page.rect('[data-t="rewind-target"]');
      await page.drag('[data-t="created-folder"]', { x: target.cx, y: target.cy }, {
        steps: 12,
        delay: 14,
        pressDelay: 40,
        releaseDelay: 40,
      });
      await sleep(500);
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 18)) return;
    }
  },
  19: async (page) => {
    // ACT3 L19 源代码：token-folder→slot-folder、token-play→slot-run，再点 run-btn
    await page.waitForSelector('[data-t="slot-folder"]', 8000);
    await page.waitForSelector('[data-t="token-folder"]', 8000);
    await page.drag('[data-t="token-folder"]', '[data-t="slot-folder"]', {
      steps: 10,
      delay: 14,
      pressDelay: 40,
      releaseDelay: 40,
    });
    await sleep(200);
    await page.drag('[data-t="token-play"]', '[data-t="slot-run"]', {
      steps: 10,
      delay: 14,
      pressDelay: 40,
      releaseDelay: 40,
    });
    await sleep(300);
    await page.click('[data-t="run-btn"]');
  },
  20: async (page) => {
    // L20 最终考试（Lead 实现见 js/levels/l20.js）：
    // 第 1 轮右键菜单建文件夹 → 第 2 轮 Ctrl+Shift+F → 第 3 轮双击终端 mkdir
    // → 裂缝终局：把 created-folder 拖到 crack-target。
    await page.waitForSelector('[data-t="exam-panel"]', 8000);
    const waitMethod = (name, timeout = 12000) =>
      page.waitFor(
        `(() => { const el = document.querySelector('[data-t="exam-method"]'); return !!el && el.dataset.method === '${name}'; })()`,
        timeout
      );
    // 第 1 轮：右键
    await waitMethod('mouse');
    await openDesktopMenu(page);
    await clickFirst(page, ['[data-t="menu-item-new"]'], 4000);
    await page.waitForSelector('.nf-submenu.open [data-t="menu-item-folder"]', 4000);
    await page.click('[data-t="menu-item-folder"]');
    // 第 2 轮：快捷键
    await waitMethod('keys');
    await page.key('Ctrl+Shift+F');
    // 第 3 轮：终端
    await waitMethod('terminal', 15000);
    await page.waitForSelector('[data-t="terminal-icon"]', 8000);
    await page.dblclick('[data-t="terminal-icon"]');
    await page.waitForSelector('[data-t="terminal-window"]', 8000);
    await page.waitForSelector('[data-t="terminal-input"]', 8000);
    await page.click('[data-t="terminal-input"]');
    await page.typeText('mkdir final');
    await page.key('Enter');
    // 终局：裂缝 + 最后的文件夹
    await page.waitForSelector('[data-t="crack-target"]', 15000);
    await page.waitForSelector('[data-t="created-folder"]', 12000);
    await waitElementSettled(page, '[data-t="created-folder"]', 4000);
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await gameState(page);
      if (!state || isLevelComplete(state, 20)) return;
      const crack = await page.rect('[data-t="crack-target"]');
      await page.drag('[data-t="created-folder"]', { x: crack.cx, y: crack.cy }, {
        steps: 12,
        delay: 14,
        pressDelay: 40,
        releaseDelay: 40,
      });
      await sleep(500);
    }
  },
};

async function solveLevel(page, level) {
  // 作者尚未交付的关卡是占位实现：点一下占位符即过关（ACT3 交付期的临时策略，交付后自动走真实 solver）
  if (await page.exists(`[data-t="placeholder-${level}"]`)) {
    await page.click(`[data-t="placeholder-${level}"]`);
    return;
  }
  const solver = LEVEL_SOLVERS[level];
  if (!solver) throw new Error(`没有第 ${level} 关的操作序列`);
  await solver(page);
}

/* ------------------------------ 附加检查 ------------------------------ */

async function checkTitleStart(page, label = '标题开始', shotPrefix = 'pt-title') {
  const item = { name: label, ok: false, detail: '', screenshots: [] };
  try {
    await page.evaluate('NF.debug.reset()').catch(() => {});
    await waitTitleVisible(page, 12000);
    const titleDots = await page.evaluate(
      `document.querySelectorAll('[data-t="title-progress"] .ts-collect-dot').length`
    );
    assert(titleDots === MAX_LEVEL, `标题页进度点应为 ${MAX_LEVEL}，实际 ${titleDots}`);
    item.screenshots.push((await shot(page, shotPrefix)).name);
    await startFromTitle(page);
    await waitLevel(page, 1, 12000);
    item.ok = true;
  } catch (err) {
    item.detail = err.message;
    // 保留现场：标题/结局层/命中点诊断 + 失败截图
    try {
      const diag = await page.evaluate(`(() => {
        const t = document.querySelector('[data-t="title"]');
        const cs = t ? getComputedStyle(t) : null;
        const layers = {};
        ['title-screen', 'ending-layer', 'ui-layer', 'level-root', 'window-layer'].forEach(function (id) {
          const el = document.getElementById(id);
          if (!el) { layers[id] = 'missing'; return; }
          const c = getComputedStyle(el);
          layers[id] = {
            children: el.childElementCount, display: c.display, opacity: c.opacity,
            visibility: c.visibility, pointerEvents: c.pointerEvents, zIndex: c.zIndex
          };
        });
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return {
          gameStarted: !!(window.NF && NF.Game && NF.Game.started),
          state: window.NF && NF.debug ? NF.debug.state() : null,
          titleClass: t ? t.className : null,
          titleStyle: cs ? { display: cs.display, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex } : null,
          bodyClass: document.body.className,
          centerHit: hit ? hit.tagName + '#' + hit.id + '.' + String(hit.className).slice(0, 80) : null,
          layers: layers
        };
      })()`);
      item.diag = diag;
      report.notes.push(`标题开始失败诊断：${JSON.stringify(diag)}`);
    } catch {
      /* 诊断失败忽略 */
    }
    try {
      item.screenshots.push((await shot(page, `${shotPrefix}-fail`)).name);
    } catch {
      /* ignore */
    }
  }
  report.checks.push(item);
  return item;
}

async function checkHint(page) {
  const item = { name: '提示重播', ok: false, detail: '', screenshots: [] };
  try {
    await page.clearConsole();
    await page.click('[data-t="hint"]');
    let active = false;
    let how = '';
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const info = await page.evaluate(`(() => ({
        playing: !!(window.NF && NF.Ghost && NF.Ghost.isPlaying()),
        hintPlaying: !!(window.NF && NF.debug && NF.debug.state && NF.debug.state().hintPlaying),
        ghostEls: (document.querySelector('#ghost-layer') || { childElementCount: 0 }).childElementCount,
      }))()`);
      if (info.playing || info.hintPlaying) {
        active = true;
        how = 'Ghost.isPlaying()';
        break;
      }
      if (info.ghostEls > 0) {
        active = true;
        how = `ghost-layer ${info.ghostEls} 个元素`;
        break;
      }
      await sleep(80);
    }
    await sleep(200);
    assert(
      active,
      '点击 [data-t="hint"] 后 3s 内没有幽灵演示活动（Ghost.isPlaying / hintPlaying / #ghost-layer 皆空）；' +
        '若该关提示无效，检查是否用 ctx.hint(fn) 或 level.hint 绑定（直接给 ctx.hint 赋值会把方法覆盖掉）'
    );
    const errors = page.consoleErrors();
    assert(
      errors.length === 0,
      `提示重播期间出现 console 错误：${dedupeConsoleErrors(page).map((e) => e.text).join(' | ')}`
    );
    item.ok = true;
    item.detail = how;
  } catch (err) {
    item.detail = err.message;
  }
  report.checks.push(item);
  if (!item.ok) report.notes.push(`提示重播失败：${item.detail}`);
  return item;
}

async function checkMute(page) {
  const item = { name: '静音按钮', ok: false, detail: '', screenshots: [] };
  try {
    const before = await page.evaluate('NF.Audio.isMuted()');
    await page.click('[data-t="mute"]');
    await page.waitFor(`NF.Audio.isMuted() === ${!before}`, 3000);
    // 静音状态持久化在 localStorage('nf.muted')（见 js/core/audio.js）
    const savedMuted = await page.evaluate(`localStorage.getItem('nf.muted')`);
    assert(savedMuted === (!before ? '1' : '0'), `localStorage['nf.muted'] 未同步：${savedMuted}`);
    const iconMuted = await page.evaluate(
      `document.querySelector('[data-t="mute"]').classList.contains('is-muted')`
    );
    assert(iconMuted === !before, '静音按钮 is-muted 状态未同步');
    // 恢复原状
    await page.click('[data-t="mute"]');
    await page.waitFor(`NF.Audio.isMuted() === ${before}`, 3000);
    item.ok = true;
  } catch (err) {
    item.detail = err.message;
  }
  report.checks.push(item);
  return item;
}

async function checkLevelMap(page) {
  const item = { name: '关卡地图', ok: false, detail: '', screenshots: [] };
  try {
    const mapInfo = () =>
      page.evaluate(`(() => {
        const map = document.querySelector('[data-t="level-map"]');
        if (!map) return null;
        return {
          mode: map.dataset.mode || null,
          cells: map.querySelectorAll('[data-t^="level-cell-"]').length,
          locked: map.querySelectorAll('.level-cell.is-locked').length,
          tabs: {
            progress: !!map.querySelector('[data-t="map-tab-progress"]'),
            free: !!map.querySelector('[data-t="map-tab-free"]'),
          },
        };
      })()`);
    const waitMode = (mode) =>
      page.waitFor(
        `(() => { const m = document.querySelector('[data-t="level-map"]'); return !!m && m.dataset.mode === '${mode}'; })()`,
        4000
      );
    // 1) 开始按钮 → 选关模式：全部解锁、无 .is-locked
    await page.click('[data-t="start"]');
    await page.waitForSelector('[data-t="level-map"]', 5000);
    let info = await mapInfo();
    assert(info && info.cells === MAX_LEVEL, `关卡地图格子数应为 ${MAX_LEVEL}，实际 ${info && info.cells}`);
    assert(info.mode === 'free', `开始按钮打开应为 free 模式，实际 ${info.mode}`);
    assert(info.locked === 0, `选关模式不应有锁定关卡，实际 ${info.locked} 个 .is-locked`);
    assert(info.tabs.progress && info.tabs.free, '缺少 map-tab-progress / map-tab-free 标签');
    item.screenshots.push((await shot(page, 'pt-level-map-free')).name);

    // 2) 切到"进度"标签 → mode=progress，未解锁关卡带 .is-locked
    await page.click('[data-t="map-tab-progress"]');
    await waitMode('progress');
    info = await mapInfo();
    assert(info.mode === 'progress', `切进度标签后 mode 应为 progress，实际 ${info.mode}`);
    assert(info.cells === MAX_LEVEL, `进度模式格子数应为 ${MAX_LEVEL}，实际 ${info.cells}`);
    assert(info.locked > 0, `进度模式应存在锁定关卡（当前已完成部分关卡），实际 ${info.locked}`);
    item.screenshots.push((await shot(page, 'pt-level-map-progress')).name);

    // 3) 切回"选关"标签 → 20 关全部解锁
    await page.click('[data-t="map-tab-free"]');
    await waitMode('free');
    info = await mapInfo();
    assert(
      info.mode === 'free' && info.locked === 0,
      `切回选关后应无锁定（mode=${info.mode}, locked=${info.locked}）`
    );

    // 4) 再点开始按钮关闭
    await page.click('[data-t="start"]');
    await page.waitFor(`!document.querySelector('[data-t="level-map"]')`, 3000);

    // 5) 玻璃罐打开 = 进度模式（锁定逻辑生效）
    await page.click('[data-t="jar"]');
    await page.waitForSelector('[data-t="level-map"]', 5000);
    info = await mapInfo();
    assert(info.mode === 'progress', `玻璃罐打开应为 progress 模式，实际 ${info.mode}`);
    assert(info.locked > 0, `玻璃罐进度模式应存在锁定关卡，实际 ${info.locked}`);
    item.screenshots.push((await shot(page, 'pt-level-map-jar')).name);
    await page.click('[data-t="jar"]');
    await page.waitFor(`!document.querySelector('[data-t="level-map"]')`, 3000);
    item.ok = true;
  } catch (err) {
    item.detail = err.message;
  }
  report.checks.push(item);
  return item;
}

/** 结局 → 再玩一次 → 回到第 1 关 */
async function checkEndingReplay(page) {
  const item = { name: '结局与再玩一次', ok: false, detail: '', screenshots: [] };
  try {
    await waitEnding(page, 20000);
    item.screenshots.push((await shot(page, 'pt-ending')).name);
    const endingState = await gameState(page);
    assert(endingState && endingState.finished === true, '结局出现后 NF.debug.state().finished 应为 true');
    // 20 关版结局：罐里 20 个小文件夹、"20 / 20"
    const endingInfo = await page.evaluate(`(() => ({
      sub: ((document.querySelector('.ending-sub') || {}).textContent || '').trim(),
      folders: document.querySelectorAll('.ending-mini-folder').length,
    }))()`);
    assert(
      endingInfo.sub === `${MAX_LEVEL} / ${MAX_LEVEL}`,
      `结局进度文案应为 "${MAX_LEVEL} / ${MAX_LEVEL}"，实际 "${endingInfo.sub}"`
    );
    assert(endingInfo.folders === MAX_LEVEL, `结局罐内文件夹应为 ${MAX_LEVEL}，实际 ${endingInfo.folders}`);
    assert(await page.exists('[data-t="ending-restart"]'), '结局页缺少 [data-t="ending-restart"]');
    // 点"再玩一次"：进度清空、回标题
    await page.click('[data-t="ending-restart"]');
    await waitTitleVisible(page, 10000);
    const saved = await readProgress(page);
    assert(
      saved && Array.isArray(saved.completed) && saved.completed.length === 0,
      `再玩一次后进度未清空：${JSON.stringify(saved)}`
    );
    assert(saved.current === 1 && saved.finished === false, '再玩一次后 current/finished 未重置');
    item.screenshots.push((await shot(page, 'pt-ending-restart')).name);
    // 标题开始 → 应从第 1 关重新玩
    await startFromTitle(page);
    await waitLevel(page, 1, 12000);
    item.screenshots.push((await shot(page, 'pt-restart-level1')).name);
    item.ok = true;
  } catch (err) {
    item.detail = err.message;
  }
  report.checks.push(item);
  if (!item.ok) report.notes.push(`结局/再玩一次失败：${item.detail}`);
  return item;
}

/** 旧 10 关存档迁移：{completed:1-10, current:10, finished:true} 刷新后应 finished=false、current=11 */
async function checkSaveMigration(page, url) {
  const item = { name: '旧 10 关存档迁移', ok: false, detail: '', screenshots: [] };
  try {
    await page.evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(PROGRESS_KEY)}, JSON.stringify({
        completed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        current: 10,
        finished: true,
        ts: Date.now()
      }));
    })()`);
    await page.navigate(url, { timeout: 20000 });
    await page.waitFor('window.NF && NF.debug && NF.debug.state', 15000);
    await sleep(400);
    const state = await page.evaluate('NF.debug.state()');
    assert(state && state.finished === false, `迁移后 finished 应为 false，实际 ${state && state.finished}`);
    assert(state && state.current === BREAK_LEVEL + 1, `迁移后 current 应为 ${BREAK_LEVEL + 1}，实际 ${state && state.current}`);
    assert(
      Array.isArray(state.completed) && state.completed.includes(BREAK_LEVEL),
      '迁移后 completed 应保留 1-10 关记录'
    );
    item.ok = true;
  } catch (err) {
    item.detail = err.message;
  }
  report.checks.push(item);
  if (!item.ok) report.notes.push(`旧存档迁移失败：${item.detail}`);
  return item;
}

/* ------------------------------ 运行阶段 ------------------------------ */

function levelResult(level, phaseLabel) {
  return {
    level,
    phase: phaseLabel,
    ok: false,
    durationMs: 0,
    error: null,
    consoleErrors: [],
    screenshots: [],
  };
}

/** 控制台错误去重（同一异常会同时出现在 console 与 exception 里，避免报告刷屏） */
function dedupeConsoleErrors(page, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const entry of page.consoleErrors()) {
    const firstLine = String(entry.text || '').split('\n')[0].slice(0, 300);
    if (seen.has(firstLine)) continue;
    seen.add(firstLine);
    out.push({ kind: entry.kind, type: entry.type, text: firstLine });
    if (out.length >= limit) break;
  }
  return out;
}

function assertConsoleClean(page, level) {
  const errors = page.consoleErrors();
  if (!errors.length) return;
  const lines = dedupeConsoleErrors(page, 6).map((e) => e.text);
  throw new Error(`第 ${level} 关出现 ${errors.length} 条 console 错误：${lines.join(' | ')}`);
}

async function failLevel(page, result, message) {
  result.error = message;
  result.consoleErrors = page.consoleErrors().map((e) => ({ type: e.type, text: e.text }));
}

/** 关卡完成后等游戏自身的"自动进入下一关"计时器走完，避免下一轮 reset/jump 被旧计时器干扰 */
async function settleTransition(page, level) {
  if (level >= MAX_LEVEL) return;
  const state = await gameState(page);
  if (!state || !Array.isArray(state.completed) || !state.completed.includes(level)) return;
  await page
    .waitFor(`(() => { const s = NF.debug && NF.debug.state(); return s && s.level === ${level + 1}; })()`, 12000)
    .catch(() => {});
  await sleep(120);
}

/** 阶段 A：NF.debug.jump(id) 逐关独立验证 */
async function runIndependentPhase(page, url) {
  const phase = { name: 'independent', ok: true, levels: [], durationMs: 0 };
  const started = Date.now();
  // 先验证标题页开始（此时游戏在标题）
  await checkTitleStart(page, '标题开始（独立阶段）', 'pt-title-independent');
  for (const level of OPTIONS.levels) {
    const result = levelResult(level, 'independent');
    const t0 = Date.now();
    page.clearConsole();
    try {
      await page.evaluate('NF.debug.reset()');
      await page.evaluate(`NF.debug.jump(${level})`);
      await waitLevel(page, level, 12000);
      await sleep(500); // 等关卡入场/幽灵演示起步
      result.screenshots.push((await shot(page, `pt-${pad2(level)}-start`)).name);
      await resetTransientUI(page);
      await solveLevel(page, level);
      if (level === MAX_LEVEL) {
        await waitEnding(page, PHASE_TIMEOUT);
      } else {
        await waitLevelComplete(page, level, PHASE_TIMEOUT);
      }
      result.screenshots.push((await shot(page, `pt-${pad2(level)}-done`)).name);
      const saved = await readProgress(page);
      if (level === MAX_LEVEL) {
        assert(
          saved && (saved.finished === true || (Array.isArray(saved.completed) && saved.completed.includes(MAX_LEVEL))),
          `第 ${MAX_LEVEL} 关存档缺少 finished`
        );
      } else {
        assert(saved && Array.isArray(saved.completed) && saved.completed.includes(level), `存档 completed 未包含第 ${level} 关`);
      }
      assertConsoleClean(page, level);
      result.ok = true;
    } catch (err) {
      result.error = err.message;
      result.consoleErrors = dedupeConsoleErrors(page);
      phase.ok = false;
      try {
        result.screenshots.push((await shot(page, `pt-${pad2(level)}-fail`)).name);
      } catch {
        /* 截图失败忽略 */
      }
    }
    await settleTransition(page, level);
    result.durationMs = Date.now() - t0;
    phase.levels.push(result);
    report.levels.push(result);
    console.log(
      `${phase.ok ? '' : ''}${result.ok ? 'PASS' : 'FAIL'} 独立 L${pad2(level)}  ${(result.durationMs / 1000).toFixed(1)}s` +
        (result.error ? `  ← ${result.error}` : '')
    );
  }
  phase.durationMs = Date.now() - started;
  return phase;
}

/** 阶段 B：从标题页连续通关 1→20（或 --max-level），含刷新续档、提示/静音/地图检查 */
async function runContinuousPhase(page, url) {
  const phase = { name: 'continuous', ok: true, levels: [], durationMs: 0 };
  const started = Date.now();
  page.clearConsole();
  try {
    // 从独立阶段（可能停在结局页）回到标题：reset 后等结局层/退场动画收尾
    await page.evaluate('NF.debug.reset()');
    await sleep(400);
    await page.waitFor(
      `(() => {
        const s = window.NF && NF.debug && NF.debug.state();
        return s && s.level === 0 && !s.busy &&
          !document.body.classList.contains('is-ending') &&
          !document.querySelector('[data-t="ending"]');
      })()`,
      8000
    ).catch(() => {});
    const titleCheck = await checkTitleStart(page, '标题开始（连续通关）', 'pt-title-run');
    if (!titleCheck.ok) throw new Error(`标题开始失败：${titleCheck.detail}`);

    const levelsToRun = ALL_LEVELS.filter((l) => l <= OPTIONS.maxLevel);
    for (const level of levelsToRun) {
      const result = levelResult(level, 'continuous');
      const t0 = Date.now();
      page.clearConsole();
      try {
        await waitLevel(page, level, 20000);
        await sleep(400);
        if (level === 1) {
          result.screenshots.push((await shot(page, 'pt-run-01-hint')).name);
          // 提示无效时不中断连续通关：失败细节进 checks，最终计入总结果
          await checkHint(page);
        }
        if (level === 2) await checkMute(page);
        if (level === 3) await checkLevelMap(page);
        result.screenshots.push((await shot(page, `pt-run-${pad2(level)}-start`)).name);
        await resetTransientUI(page);
        await solveLevel(page, level);
        const isFinal = level === MAX_LEVEL && OPTIONS.maxLevel >= MAX_LEVEL;
        if (isFinal) {
          await waitEnding(page, PHASE_TIMEOUT);
        } else {
          await waitLevelComplete(page, level, PHASE_TIMEOUT);
        }
        result.screenshots.push((await shot(page, `pt-run-${pad2(level)}-done`)).name);

        const saved = await readProgress(page);
        if (isFinal) {
          assert(saved && saved.finished === true, '连续通关后存档 finished 不为 true');
          assert(saved.current === MAX_LEVEL, `存档 current 应为 ${MAX_LEVEL}，实际 ${saved.current}`);
        } else {
          assert(saved && Array.isArray(saved.completed) && saved.completed.includes(level), `存档 completed 未包含第 ${level} 关`);
          assert(saved.current === level + 1, `存档 current 应为 ${level + 1}，实际 ${saved.current}`);
        }
        assertConsoleClean(page, level);
        // 刷新续档：第 4 关后 → 第 5 关（幕内）；第 10 关（幕边界）后 → 第 11 关
        const reloadTarget = level === 4 ? 5 : level === BREAK_LEVEL ? BREAK_LEVEL + 1 : null;
        if (reloadTarget) {
          await page.navigate(url, { timeout: 20000 });
          await waitTitleVisible(page, 20000);
          const afterReload = await readProgress(page);
          assert(
            afterReload &&
              afterReload.current === reloadTarget &&
              Array.isArray(afterReload.completed) &&
              afterReload.completed.includes(level),
            `刷新后续档数据异常（期望 current=${reloadTarget}、completed 含 ${level}）：${JSON.stringify(afterReload)}`
          );
          await startFromTitle(page);
          await waitLevel(page, reloadTarget, 20000);
        }
        result.ok = true;
      } catch (err) {
        result.error = err.message;
        result.consoleErrors = dedupeConsoleErrors(page);
        phase.ok = false;
        try {
          result.screenshots.push((await shot(page, `pt-run-${pad2(level)}-fail`)).name);
        } catch {
          /* ignore */
        }
      }
      result.durationMs = Date.now() - t0;
      phase.levels.push(result);
      report.levels.push(result);
      console.log(
        `${result.ok ? 'PASS' : 'FAIL'} 连续 L${pad2(level)}  ${(result.durationMs / 1000).toFixed(1)}s` +
          (result.error ? `  ← ${result.error}` : '')
      );
      if (!result.ok) break; // 连续通关一旦失败，后续没有意义
    }
    if (phase.ok) {
      phase.maxLevel = OPTIONS.maxLevel;
      if (OPTIONS.maxLevel >= MAX_LEVEL) {
        // 最终结局 + 再玩一次 + 回到第 1 关
        const state = await gameState(page);
        assert(state && state.finished === true, '连续通关结束后 NF.debug.state().finished 应为 true');
        await checkEndingReplay(page);
      } else {
        phase.partial = true; // --max-level 部分回归：不要求出现结局
      }
    }
  } catch (err) {
    phase.ok = false;
    phase.error = err.message;
    console.log(`FAIL 连续通关阶段：${err.message}`);
  }
  phase.durationMs = Date.now() - started;
  return phase;
}

/* ------------------------------ preflight ------------------------------ */

async function runPreflight(page, url) {
  page.clearConsole();
  failedRequests.length = 0;
  await page.navigate(url, { timeout: 20000 });
  await sleep(1500); // 给脚本加载/初始化留时间
  const info = await page.evaluate(`(() => {
    const NF = window.NF || {};
    const keys = ['icons', 'Audio', 'FX', 'Ghost', 'OS', 'Game', 'debug'];
    const present = {};
    for (const key of keys) present[key] = typeof NF[key] !== 'undefined';
    const Game = NF.Game || null;
    return {
      hasNF: !!window.NF,
      present,
      game: Game ? {
        maxLevel: Game.MAX_LEVEL,
        registered: Object.keys(Game.levels || {}).length,
      } : null,
      title: document.title,
      href: location.href,
      readyState: document.readyState,
      bodyChildren: document.body ? document.body.childElementCount : 0,
    };
  })()`).catch(() => ({ hasNF: false, present: {}, game: null, title: '', href: url }));

  const missing = Object.entries(info.present || {})
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  const consoleErrors = page.consoleErrors().map((e) => ({ kind: e.kind, type: e.type, text: e.text }));
  const bad = failedRequests.slice();

  report.preflight = { info, missing, consoleErrors, failedRequests: bad };
  console.log('== preflight：游戏就绪检查 ==');
  console.log(`URL: ${url}`);
  console.log(`NF: ${info.hasNF ? '存在' : '缺失'} · title: ${JSON.stringify(info.title)} · readyState: ${info.readyState}`);
  console.log(`NF 全局：${JSON.stringify(info.present)}`);
  console.log(
    `关卡：MAX_LEVEL=${info.game ? info.game.maxLevel : '缺失'} · 已注册 ${info.game ? info.game.registered : 0} 关（期望 ${MAX_LEVEL}）`
  );
  if (bad.length) {
    console.log(`HTTP 失败资源（${bad.length}）：`);
    for (const req of bad.slice(0, 20)) console.log(`  ${req.status || req.error}  ${req.url}`);
  }
  if (consoleErrors.length) {
    console.log(`console 错误（${consoleErrors.length}）：`);
    for (const err of consoleErrors.slice(0, 20)) console.log(`  [${err.kind}/${err.type}] ${err.text}`);
  }
  const levelsReady = !!info.game && info.game.maxLevel >= MAX_LEVEL && info.game.registered >= MAX_LEVEL;
  const ready = info.hasNF && missing.length === 0 && bad.length === 0 && consoleErrors.length === 0 && levelsReady;
  if (ready) {
    console.log('游戏已就绪 ✅');
    return 0;
  }
  console.log(
    `游戏尚未就绪 ❌${missing.length ? `（缺失：${missing.join(', ')}）` : ''}` +
      (levelsReady ? '' : `（关卡未注册满 ${MAX_LEVEL} 关）`)
  );
  return 2;
}

/* -------------------------------- 主流程 -------------------------------- */

async function main() {
  await mkdir(SHOTS, { recursive: true });
  report.maxLevel = MAX_LEVEL;
  report.levelsRequested = OPTIONS.levels;
  report.continuousMaxLevel = OPTIONS.maxLevel;
  console.log('== 《新建文件夹》playtest（20 关版） ==');
  console.log(
    `node ${process.version} · browser=${OPTIONS.browser} · mode=${OPTIONS.preflight ? 'preflight' : 'full'} · ` +
      `独立关卡=${OPTIONS.levels.length} 关 · 连续通关到 L${OPTIONS.maxLevel}`
  );

  let page = null;
  let server = null;
  let child = null;
  let exited = null;
  let serverExit = null;
  let url = OPTIONS.url;
  const startedAll = Date.now();

  try {
    if (!url) {
      server = await startServer();
      url = server.url;
      console.log(`静态服务器：${url}`);
    } else {
      console.log(`使用已有 URL：${url}`);
    }
    report.url = url;

    if (OPTIONS.browserPath) process.env.QA_BROWSER_PATH = OPTIONS.browserPath;
    page = await launch({ browser: OPTIONS.browser, width: 1440, height: 900 });
    report.browser = page.browserPath;

    // 网络/控制台监控
    await page.send('Network.enable', {}).catch(() => {});
    page.on('Network.responseReceived', (params) => {
      const response = params && params.response;
      if (response && Number(response.status) >= 400) {
        failedRequests.push({ url: response.url, status: response.status });
      }
    });
    page.on('Network.loadingFailed', (params) => {
      if (params && params.errorText) {
        failedRequests.push({ url: params.requestId || '(unknown)', error: params.errorText });
      }
    });

    if (OPTIONS.preflight) {
      const code = await runPreflight(page, url);
      report.ok = code === 0;
      report.consoleErrors = page.consoleErrors().map((e) => ({ kind: e.kind, type: e.type, text: e.text }));
      report.failedRequests = failedRequests.slice();
      process.exitCode = code;
      return;
    }

    /* ---------- 阶段 0：就绪检查 ---------- */
    const preflightCode = await runPreflight(page, url);
    if (preflightCode !== 0) {
      report.ok = false;
      report.consoleErrors = page.consoleErrors().map((e) => ({ kind: e.kind, type: e.type, text: e.text }));
      report.failedRequests = failedRequests.slice();
      console.log('\n游戏尚未就绪，跳过通关测试。');
      process.exitCode = 2;
      return;
    }
    failedRequests.length = 0; // preflight 的失败已在上面报告；正式测试重新计数
    page.clearConsole();

    /* ---------- 存档迁移检查（旧 10 关存档 → 第四面墙从 11 关继续） ---------- */
    const migrationCheck = await checkSaveMigration(page, url);
    page.clearConsole();

    /* ---------- 阶段 A：逐关独立验证 ---------- */
    if (!OPTIONS.continuousOnly) {
      const independent = await runIndependentPhase(page, url);
      report.phases.independent = independent;
    }

    /* ---------- 阶段 B：连续通关 ---------- */
    if (!OPTIONS.independentOnly) {
      if (!report.phases.independent || report.phases.independent.ok) {
        const continuous = await runContinuousPhase(page, url);
        report.phases.continuous = continuous;
      } else {
        report.phases.continuous = { name: 'continuous', ok: false, skipped: true, reason: 'independent 阶段失败，跳过连续通关' };
      }
    }

    /* ---------- 汇总 ---------- */
    report.consoleErrors = page.consoleErrors().map((e) => ({ kind: e.kind, type: e.type, text: e.text }));
    report.failedRequests = failedRequests.slice();
    report.screenshots = screenshots.slice(0, 200);
    const independentOk = !report.phases.independent || report.phases.independent.ok;
    const continuousOk = !report.phases.continuous || report.phases.continuous.ok;
    const checksOk = report.checks.every((c) => c.ok);
    report.checksOk = checksOk;
    report.strictChecks = OPTIONS.strictChecks;
    report.ok = independentOk && continuousOk && (!OPTIONS.strictChecks || checksOk);
    if (!OPTIONS.strictChecks && !checksOk) {
      report.notes.push('--no-strict-checks：附加检查失败只记录，未计入总结果');
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (err) {
    report.ok = false;
    report.error = err && err.stack ? err.stack : String(err);
    console.error('playtest 异常：', report.error);
    process.exitCode = 1;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (err) {
        console.error('关闭浏览器失败：', err.message);
      }
    }
    if (server) {
      try {
        await server.stop();
      } catch (err) {
        console.error('停止静态服务器失败：', err.message);
      }
    }
    report.durationMs = Date.now() - startedAll;
    report.finishedAt = new Date().toISOString();
    try {
      writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    } catch (err) {
      console.error('写报告失败：', err.message);
    }
    printSummary();
  }
}

function printSummary() {
  console.log('');
  console.log('────────────────────────────── playtest 摘要 ──────────────────────────────');
  console.log(`结果：${report.ok ? 'PASS' : 'FAIL'} · 耗时 ${((report.durationMs || 0) / 1000).toFixed(1)}s · 报告：${REPORT_PATH}`);
  if (report.phases.independent) {
    const phase = report.phases.independent;
    const done = phase.levels.filter((l) => l.ok).length;
    console.log(`独立验证：${done}/${phase.levels.length} 关通过${phase.ok ? '' : ' ❌'}`);
    for (const level of phase.levels) {
      console.log(`  L${pad2(level.level)} ${level.ok ? 'PASS' : 'FAIL'} ${(level.durationMs / 1000).toFixed(1)}s ${level.error ? '← ' + level.error : ''}`);
    }
  }
  if (report.phases.continuous) {
    const phase = report.phases.continuous;
    if (phase.skipped) {
      console.log(`连续通关：跳过（${phase.reason}）`);
    } else {
      const done = phase.levels.filter((l) => l.ok).length;
      const suffix = phase.partial ? `（--max-level=${phase.maxLevel}，部分回归）` : '';
      console.log(`连续通关：${done}/${phase.levels.length} 关通过${suffix}${phase.ok ? '' : ' ❌'}`);
      for (const level of phase.levels) {
        console.log(`  L${pad2(level.level)} ${level.ok ? 'PASS' : 'FAIL'} ${(level.durationMs / 1000).toFixed(1)}s ${level.error ? '← ' + level.error : ''}`);
      }
    }
  }
  for (const check of report.checks) {
    console.log(`检查 ${check.name}：${check.ok ? 'PASS' : 'FAIL'}${check.detail ? '  ' + check.detail : ''}`);
  }
  if (report.checks.length) {
    console.log(`附加检查：${report.checksOk === false ? 'FAIL' : 'PASS'}${report.strictChecks === false ? '（--no-strict-checks，未计入总结果）' : ''}`);
  }
  console.log(`console 错误：${report.consoleErrors.length} · HTTP 失败：${report.failedRequests.length} · 截图：${report.screenshots.length} 张`);
  if (report.screenshots.length) {
    for (const shotInfo of report.screenshots.slice(0, 12)) {
      console.log(`  ${shotInfo.name.padEnd(24)} ${shotInfo.width}x${shotInfo.height}`);
    }
    if (report.screenshots.length > 12) console.log(`  … 其余见 ${REPORT_PATH}`);
  }
  if (report.error) console.log(`错误：${report.error}`);
}

main().catch((err) => {
  console.error('playtest 未捕获异常：', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
