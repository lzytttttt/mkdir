#!/usr/bin/env node
/**
 * qa/selftest.mjs — QA 基建自测（零依赖）
 *
 * 对 qa/fixture.html 跑一遍 CDPPage 的全部能力：
 *   启动无头 Edge / file:// 中文路径装载 / click / dblclick / rightClick /
 *   drag(pointer) / key / typeText(含中文) / canvas / waitFor / evaluate /
 *   console & exception 采集 / setViewport / screenshot(含 clip) / navigate /
 *   HTTP 静态服务器装载 / close 进程与临时目录清理。
 *
 * 用法：
 *   node qa/selftest.mjs                 # 默认 Edge
 *   node qa/selftest.mjs --browser=chrome
 *   QA_DEBUG=1 node qa/selftest.mjs      # 打印 CDP 细节
 *
 * 截图统一写到 qa/shots/fixture-*.png。
 * 退出码：0 = 全过，1 = 有失败。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { launch, getFreePort } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(HERE, 'shots');
const FIXTURE_PATH = join(HERE, 'fixture.html');
const FIXTURE_URL = pathToFileURL(FIXTURE_PATH).href;

/* ------------------------------- CLI ------------------------------- */

function readFlag(name, fallback = null) {
  const prefixed = args.find((a) => a.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}
const args = process.argv.slice(2);
const browserKind = readFlag('browser', 'auto');

/* ----------------------------- 测试框架 ----------------------------- */

let passed = 0;
const failures = [];
const shots = [];
let stepNo = 0;

async function check(name, fn, opts = {}) {
  stepNo += 1;
  const no = String(stepNo).padStart(2, '0');
  const started = Date.now();
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${no} ${name}  (${Date.now() - started}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    failures.push({ name, error });
    console.log(`FAIL  ${no} ${name}  (${Date.now() - started}ms)`);
    console.log(`      ${String(error.message).split('\n').join('\n      ')}`);
    if (opts.fatal) throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'assertEq'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`
    );
  }
}

async function expectReject(fn, pattern) {
  let error = null;
  try {
    await fn();
  } catch (err) {
    error = err;
  }
  assert(error, '期望抛错，但成功返回了');
  if (pattern) assert(pattern.test(String(error.message)), `错误信息不匹配 ${pattern}：${error.message}`);
  return error;
}

function pngInfo(file) {
  assert(existsSync(file), `截图文件不存在：${file}`);
  const buf = readFileSync(file);
  assert(buf.length > 1000, `截图文件过小（${buf.length} 字节）：${file}`);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    assert(buf[i] === signature[i], `不是合法 PNG：${file}`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/** 截图并登记尺寸，截图名统一 fixture-*.png */
async function shot(page, name) {
  const file = join(SHOTS, `fixture-${name}.png`);
  await page.screenshot(file);
  const info = pngInfo(file);
  shots.push({ name: `fixture-${name}.png`, file, ...info });
  return { file, ...info };
}

/* --------------------------- 静态服务器 --------------------------- */

async function startStaticServer() {
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
  const url = `http://127.0.0.1:${port}/qa/fixture.html`;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (exitInfo) throw new Error(`静态服务器提前退出：${JSON.stringify(exitInfo)}\n${output}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        await res.arrayBuffer();
        const stop = async () => {
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
        };
        return { port, url, child, output: () => output, stop };
      }
    } catch {
      /* 还没起来 */
    }
    await sleep(100);
  }
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  throw new Error(`静态服务器启动超时：${url}\n${output}`);
}

/* ------------------------------- 主流程 ------------------------------- */

async function main() {
  await mkdir(SHOTS, { recursive: true });
  console.log('== 《新建文件夹》QA 基建自测 ==');
  console.log(`node ${process.version} · browser=${browserKind} · fixture=${FIXTURE_PATH}`);
  console.log('');

  const startedAll = Date.now();
  let page = null;
  let fatalError = null;
  let closeInfo = null;

  try {
    /* ---------- 必需：启动 + file:// 装载 ---------- */
    await check(
      '启动无头浏览器并连接 CDP',
      async () => {
        page = await launch({ browser: browserKind, width: 1440, height: 900 });
        assert(page.sessionId, '未拿到 page sessionId');
        assert(Array.isArray(page.consoleLogs), 'console 采集未初始化');
        assert(page.port > 0, '没有 DevTools 端口');
      },
      { fatal: true }
    );

    await check(
      'file:// 中文路径装载 fixture',
      async () => {
        await page.navigate(FIXTURE_URL, { timeout: 20000 });
        await page.waitFor('window.__fixture && window.__fixture.ready === true', 10000);
        assertEq(await page.title(), 'QA Fixture · 新建文件夹', '页面标题');
        const href = await page.evaluate('decodeURI(location.href)');
        assert(href.includes('新建文件夹'), `file:// URL 中文路径丢失：${href}`);
        const size = await page.evaluate('({w: innerWidth, h: innerHeight, dpr: devicePixelRatio})');
        assertEq(size.w, 1440, '视口宽度');
        assertEq(size.h, 900, '视口高度');
        assertEq(size.dpr, 1, 'devicePixelRatio');
      },
      { fatal: true }
    );

    /* ---------- 控制台采集 ---------- */
    await check('collectConsole 在启动时已开启', async () => {
      assert(Array.isArray(page.collectConsole()), 'collectConsole 应返回数组');
      page.clearConsole();
      assertEq(page.consoleLogs.length, 0, 'clearConsole 后条目数');
      assertEq(page.consoleErrors().length, 0, '初始错误数');
    });

    /* ---------- 鼠标：click / dblclick / rightClick ---------- */
    await check('click(选择器) 触发真实点击', async () => {
      await page.click('[data-t="btn"]');
      await page.waitFor('__fixture.clicks === 1', 2000);
      const last = await page.evaluate('__fixture.lastClick');
      assertEq(last && last.button, 0, 'click 事件 button');
    });

    await check('screenshot 全窗口 1440x900', async () => {
      const info = await shot(page, '01-click');
      assertEq(info.width, 1440, '截图宽度');
      assertEq(info.height, 900, '截图高度');
    });

    await check('click({x,y}) / click([x,y]) 坐标点击', async () => {
      const rect = await page.rect('[data-t="btn"]');
      await page.click({ x: rect.cx, y: rect.cy });
      await page.waitFor('__fixture.clicks === 2', 2000);
      await page.click([rect.cx, rect.cy]);
      await page.waitFor('__fixture.clicks === 3', 2000);
    });

    await check('dblclick 触发 dblclick 事件', async () => {
      await page.dblclick('[data-t="dbl"]');
      await page.waitFor('__fixture.dblCount === 1', 2000);
    });

    await check('rightClick 打开自定义右键菜单', async () => {
      await page.rightClick('[data-t="ctx-area"]');
      await page.waitFor('__fixture.rightClicks === 1 && __fixture.ctxMenuVisible === true', 2000);
      const rect = await page.rect('#ctx-menu');
      assert(rect.width > 100, '右键菜单宽度异常');
      assert(rect.top > 0, '右键菜单位置异常');
      await page.click('[data-t="ctx-a"]');
      await page.waitFor('__fixture.ctxClicked === "ctx-a" && __fixture.ctxMenuVisible === false', 2000);
    });

    await check('drag 拖拽（pointer 事件路径）', async () => {
      await page.drag('[data-t="drag-src"]', '[data-t="drop-zone"]', { steps: 12 });
      await page.waitFor('__fixture.dropped === true', 3000);
      const moves = await page.evaluate('__fixture.dragMoves');
      assert(moves >= 8, `拖拽 pointermove 次数过少：${moves}`);
      const info = await shot(page, '02-drag');
      assertEq(info.width, 1440, '拖拽截图宽度');
    });

    /* ---------- 键盘 ---------- */
    await check('key: Enter / ArrowDown 命名键', async () => {
      await page.key('Enter');
      await page.waitFor('__fixture.enterCount === 1', 2000);
      await page.key('ArrowDown');
      await page.waitFor('__fixture.arrowDownCount === 1', 2000);
      const keys = await page.evaluate('__fixture.keys.map((k) => k.key)');
      assert(keys.includes('Enter'), 'keydown 未收到 Enter');
      assert(keys.includes('ArrowDown'), 'keydown 未收到 ArrowDown');
    });

    await check('key: Ctrl+Shift+N 组合键（modifiers/code）', async () => {
      await page.key('Ctrl+Shift+N');
      await page.waitFor('__fixture.combo === "Ctrl+Shift+N"', 2000);
      const last = await page.evaluate('__fixture.lastKey');
      assertEq(last.key, 'N', '组合键 key');
      assertEq(last.code, 'KeyN', '组合键 code');
      assertEq(last.ctrl, true, 'ctrlKey');
      assertEq(last.shift, true, 'shiftKey');
      assertEq(last.meta, false, 'metaKey');
    });

    await check('key: Shift+A 大写字母', async () => {
      await page.key('Shift+A');
      await page.waitFor(
        '__fixture.lastKey && __fixture.lastKey.key === "A" && __fixture.lastKey.shift === true && __fixture.lastKey.code === "KeyA"',
        2000
      );
    });

    /* ---------- 文本输入 ---------- */
    await check('typeText ASCII 输入并触发 input 事件', async () => {
      await page.click('[data-t="text-input"]');
      await page.typeText('Hello 123');
      await page.waitFor('document.querySelector("[data-t=text-input]").value === "Hello 123"', 3000);
      const events = await page.evaluate('__fixture.inputEvents');
      assert(events >= 9, `input 事件次数过少：${events}`);
    });

    await check('key: Ctrl+A 全选后输入替换 / Backspace', async () => {
      await page.key('Ctrl+A');
      await page.typeText('abc');
      await page.waitFor('document.querySelector("[data-t=text-input]").value === "abc"', 3000);
      await page.key('Backspace');
      await page.waitFor('document.querySelector("[data-t=text-input]").value === "ab"', 3000);
    });

    await check('typeText 中文（Input.insertText 路径）', async () => {
      await page.typeText('新建文件夹');
      await page.waitFor(
        'document.querySelector("[data-t=text-input]").value === "ab新建文件夹"',
        3000
      );
    });

    /* ---------- canvas ---------- */
    await check('canvas 点击坐标与像素渲染', async () => {
      await page.click('[data-t="canvas"]');
      await page.waitFor('__fixture.canvasClick !== null', 2000);
      const click = await page.evaluate('__fixture.canvasClick');
      assert(click.x >= 0 && click.x <= 180 && click.y >= 0 && click.y <= 100, `canvas 点击越界：${JSON.stringify(click)}`);
      const red = await page.evaluate(
        '(() => { const d = document.querySelector("[data-t=canvas]").getContext("2d").getImageData(10, 10, 1, 1).data; return Array.from(d); })()'
      );
      assertEq(JSON.stringify(red), JSON.stringify([255, 0, 0, 255]), 'canvas 红色像素');
      const green = await page.evaluate(
        '(() => { const d = document.querySelector("[data-t=canvas]").getContext("2d").getImageData(70, 10, 1, 1).data; return Array.from(d); })()'
      );
      assertEq(JSON.stringify(green), JSON.stringify([0, 255, 136, 255]), 'canvas 绿色像素');
      await shot(page, '03-canvas');
    });

    /* ---------- waitFor / evaluate ---------- */
    await check('waitFor 成功、waitForSelector、超时拒绝', async () => {
      const value = await page.waitFor('__fixture.clicks >= 2', { timeout: 1000 });
      assertEq(value, true, 'waitFor 返回值');
      await page.waitForSelector('[data-t="btn"]', 1000);
      const t0 = Date.now();
      await expectReject(() => page.waitFor('window.__never_true__ === true', 300), /waitFor 超时/);
      const elapsed = Date.now() - t0;
      assert(elapsed >= 200 && elapsed < 2500, `waitFor 超时时长异常：${elapsed}ms`);
    });

    await check('evaluate: Promise / 对象 / 异常传播', async () => {
      const promised = await page.evaluate('new Promise((resolve) => setTimeout(() => resolve(42), 30))');
      assertEq(promised, 42, 'awaitPromise 结果');
      const object = await page.evaluate('({a: 1, b: [2, 3], c: "x"})');
      assertEq(JSON.stringify(object), JSON.stringify({ a: 1, b: [2, 3], c: 'x' }), '对象序列化');
      const fn = await page.evaluate(function () {
        return 1 + 1;
      });
      assertEq(fn, 2, '函数形式求值');
      await expectReject(() => page.evaluate('throw new Error("boom-expected")'), /boom-expected/);
    });

    /* ---------- console / exception 采集 ---------- */
    await check('Runtime console.error 与未捕获异常采集', async () => {
      assertEq(page.consoleErrors().length, 0, '注入前不应有错误');
      await page.evaluate('console.error("selftest-expected-error")');
      await page.evaluate('setTimeout(function () { throw new Error("selftest-expected-exception"); }, 0)');
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const logs = page.collectConsole();
        const hasError = logs.some(
          (e) => e.kind === 'console' && e.type === 'error' && e.text.includes('selftest-expected-error')
        );
        const hasException = logs.some(
          (e) => e.kind === 'exception' && e.text.includes('selftest-expected-exception')
        );
        if (hasError && hasException) break;
        await sleep(50);
      }
      const logs = page.collectConsole();
      assert(
        logs.some((e) => e.kind === 'console' && e.type === 'error' && e.text.includes('selftest-expected-error')),
        'console.error 未被采集'
      );
      assert(
        logs.some((e) => e.kind === 'exception' && e.text.includes('selftest-expected-exception')),
        '未捕获异常未被采集'
      );
      assert(page.consoleErrors().length >= 2, 'consoleErrors() 未过滤出注入的错误');
      page.clearConsole();
      assertEq(page.consoleErrors().length, 0, 'clearConsole 后错误数');
    });

    /* ---------- 视口 / 截图 ---------- */
    await check('setViewport 800x600 并截图', async () => {
      await page.setViewport({ width: 800, height: 600 });
      const size = await page.evaluate('({w: innerWidth, h: innerHeight})');
      assertEq(size.w, 800, '800x600 视口宽度');
      assertEq(size.h, 600, '800x600 视口高度');
      const info = await shot(page, '04-800x600');
      assertEq(info.width, 800, '800x600 截图宽度');
      assertEq(info.height, 600, '800x600 截图高度');
    });

    await check('screenshot clip 裁剪尺寸', async () => {
      const file = join(SHOTS, 'fixture-05-clip.png');
      await page.screenshot(file, { clip: { x: 10, y: 20, width: 200, height: 100 } });
      const info = pngInfo(file);
      shots.push({ name: 'fixture-05-clip.png', file, ...info });
      assertEq(info.width, 200, 'clip 截图宽度');
      assertEq(info.height, 100, 'clip 截图高度');
    });

    await check('恢复 1440x900 全屏截图', async () => {
      await page.setViewport({ width: 1440, height: 900 });
      await sleep(100);
      const size = await page.evaluate('({w: innerWidth, h: innerHeight})');
      assertEq(size.w, 1440, '恢复视口宽度');
      assertEq(size.h, 900, '恢复视口高度');
      const info = await shot(page, '06-final');
      assertEq(info.width, 1440, '恢复截图宽度');
      assertEq(info.height, 900, '恢复截图高度');
    });

    /* ---------- navigate 重载 ---------- */
    await check('navigate 重新装载并重置状态', async () => {
      await page.navigate(`${FIXTURE_URL}?reload=1`, { timeout: 20000 });
      await page.waitFor('window.__fixture && window.__fixture.ready === true', 10000);
      const state = await page.evaluate('({clicks: __fixture.clicks, search: location.search})');
      assertEq(state.clicks, 0, '重载后 clicks 应归零');
      assertEq(state.search, '?reload=1', '重载后 location.search');
      assertEq(await page.title(), 'QA Fixture · 新建文件夹', '重载后标题');
    });

    /* ---------- HTTP 静态服务器 ---------- */
    await check('HTTP 静态服务器（node server.mjs）装载', async () => {
      const server = await startStaticServer();
      try {
        await page.navigate(server.url, { timeout: 20000 });
        await page.waitFor('window.__fixture && window.__fixture.ready === true', 10000);
        assertEq(await page.title(), 'QA Fixture · 新建文件夹', 'HTTP 页面标题');
        assertEq(await page.evaluate('__fixture.clicks'), 0, 'HTTP 页面 clicks');
        await shot(page, '07-http');
      } finally {
        const stopInfo = await server.stop();
        assert(stopInfo, '静态服务器未能停止');
      }
    });

    /* ---------- 全程控制台 ---------- */
    await check('全程无未预期的 console 报错', async () => {
      const errors = page.consoleErrors();
      if (errors.length) {
        const detail = errors
          .map((e) => `[${e.kind}/${e.type}] ${e.text}`)
          .join('\n')
          .split('\n')
          .map((line) => '      ' + line)
          .join('\n');
        throw new Error(`发现 ${errors.length} 条控制台错误：\n${detail}`);
      }
      assertEq(page.collectConsole().length, 0, '清理后不应再有控制台条目');
    });
  } catch (err) {
    fatalError = err;
    console.error('\nFATAL：', err && err.stack ? err.stack : err);
  } finally {
    if (page) {
      try {
        closeInfo = await page.close();
      } catch (err) {
        console.error('close() 出错：', err && err.message);
      }
    }
  }

  /* ---------- 收尾清理校验（在 close 之后） ---------- */
  if (page) {
    await check('close 杀掉浏览器进程并清理临时目录', async () => {
      assert(closeInfo, 'close() 未返回退出信息');
      assert(
        closeInfo && (typeof closeInfo.code !== 'undefined' || closeInfo.signal),
        `浏览器进程退出信息异常：${JSON.stringify(closeInfo)}`
      );
      assert(!existsSync(page.profileDir), `临时 user-data-dir 未清理：${page.profileDir}`);
      let devtoolsStillUp = false;
      try {
        const res = await fetch(`http://127.0.0.1:${page.port}/json/version`, {
          signal: AbortSignal.timeout(800),
        });
        devtoolsStillUp = res.ok;
      } catch {
        devtoolsStillUp = false;
      }
      assert(!devtoolsStillUp, `浏览器关闭后 DevTools 端口 ${page.port} 仍在响应`);
    });
  }

  /* ------------------------------ 摘要 ------------------------------ */
  const elapsed = ((Date.now() - startedAll) / 1000).toFixed(1);
  console.log('');
  console.log('──────────────────────────────────────────────');
  console.log(`结果：PASS ${passed} · FAIL ${failures.length}${fatalError ? ' · FATAL 1' : ''} · 耗时 ${elapsed}s`);
  console.log(`截图：${shots.length} 张 → ${SHOTS}`);
  for (const s of shots) {
    console.log(`  ${s.name.padEnd(20)} ${s.width}x${s.height}  ${(s.bytes / 1024).toFixed(1)} KB`);
  }
  if (page) {
    console.log(`浏览器：${page.browserPath}`);
    console.log(`CDP 端口：${page.port} · 退出：${JSON.stringify(closeInfo)}`);
    console.log(`控制台条目（清理后）：${page.collectConsole().length}`);
  }
  if (failures.length || fatalError) {
    console.log('');
    console.log('失败明细：');
    if (fatalError) console.log(`  FATAL ${fatalError.message}`);
    for (const failure of failures) {
      console.log(`  - ${failure.name}: ${failure.error.message}`);
    }
    if (page && page.collectConsole().length) {
      console.log('控制台尾部：');
      for (const entry of page.collectConsole().slice(-10)) {
        console.log(`  [${entry.kind}/${entry.type}] ${entry.text}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log('全部通过 ✅');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('自测脚本异常终止：', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
