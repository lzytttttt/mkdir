# qa/ — 《新建文件夹》无头浏览器自动化

零第三方依赖：只用 Node 22 内置 `WebSocket` / `fetch` / `child_process`。
无头 Edge/Chrome 通过 Chrome DevTools Protocol 以真实鼠标键盘事件驱动游戏。

## 快速开始

```bash
node qa/selftest.mjs                  # 基建自测（默认 Edge）
node qa/selftest.mjs --browser=chrome # 用 Chrome
QA_DEBUG=1 node qa/selftest.mjs       # 打印 CDP / 浏览器 stderr 细节
```

自测退出码 0 = 全部通过。截图输出到 `qa/shots/fixture-*.png`（要求 1440x900 视口，自测里含 800x600 与 clip 裁剪用例）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `cdp.mjs` | 最小 CDP 客户端：启动无头浏览器、连接 page session、输入/截图/求值/控制台采集、进程与临时目录清理 |
| `fixture.html` | 独立测试页：按钮 / 右键菜单 / 拖拽 / 键盘 / canvas，页面状态挂在 `window.__fixture` |
| `selftest.mjs` | 对 fixture 验证全部能力并断言，打印 PASS/FAIL 摘要 |
| `shots/` | 截图输出目录 |

## cdp.mjs API

```js
import { launch, getFreePort } from './cdp.mjs';

const page = await launch({ width: 1440, height: 900 }); // 默认 Edge；auto → Edge 优先
await page.navigate('file:///.../index.html');           // 也接受本地路径（自动 encodeURI，支持中文）
await page.waitFor('window.NF && NF.Game', 10000);       // 轮询表达式/函数直到真值
await page.click('[data-t="start"]');                    // 选择器 / {x,y} / [x,y]
await page.rightClick('[data-t="menu-item-new"]');
await page.dblclick('[data-t="desktop-icon"]');
await page.drag('[data-t="file"]', '[data-t="merge-folder"]', { steps: 12 }); // 真实 pointer 拖拽
await page.key('Ctrl+Shift+N');                          // 组合键（完整 keyDown/keyUp + code/vk/modifiers）
await page.typeText('mkdir 新建文件夹');                  // ASCII 走键事件，中文走 Input.insertText
await page.setViewport({ width: 800, height: 600 });
await page.screenshot('qa/shots/level-01.png');          // 可传 {clip:{x,y,width,height}}
const state = await page.evaluate('NF.debug.state()');   // 页面求值（默认 awaitPromise，异常会抛出）
const errs = page.consoleErrors();                       // Runtime.consoleAPICalled + exceptionThrown + Log
page.clearConsole();
await page.close();                                      // Browser.close → taskkill /T /F → 删临时 profile
```

其它：`page.rect(sel)`、`page.waitForSelector(sel)`、`page.exists/text/value(sel)`、`page.focus(sel)`、
`page.move(x,y)`、`page.mouseDown/mouseUp`、`page.on(cdpEvent, fn)`、`page.send(method, params)`、
`page.sendBrowser(...)`、`page.url()/title()`、`page.exitInfo/isClosed`。

## 已知的 Chromium/CDP 坑（已在 cdp.mjs 内处理）

1. **浏览器快捷键劫持**：`Ctrl+N`、`Ctrl+Shift+N` 等会被 Chromium 当成浏览器加速器，
   页面收不到 `keydown`（headless 下还会新建窗口）。`key()` 对带 Ctrl/Alt/Meta 的组合发送
   `nativeVirtualKeyCode: 0` 绕过加速器；DOM 事件仍正确（`e.key='N'`、`e.code='KeyN'`、`e.keyCode=78`、
   `ctrlKey/shiftKey` 正确），`Ctrl+A`/`Ctrl+Z` 等编辑命令不受影响。
2. **拖拽丢 pointer capture**：按住鼠标移动时 `Input.dispatchMouseEvent` 的 `mouseMoved` 必须带
   `button:'left'`（只带 `buttons:1` 会在第一次移动时触发 `lostpointercapture`，`pointerup` 不再回到被拖元素）。
   `drag()` 已按此实现。
3. **截图尺寸**：`Emulation.setDeviceMetricsOverride` 设置视口后，`Page.captureScreenshot` 的 PNG 尺寸与之一致。
4. 浏览器退出时兜底 `taskkill /T /F`，进程树与 `%TEMP%/nf-qa-*` 目录都会清理干净。

## 约定

- 只写 `qa/` 目录，不改 `index.html` / `css/` / `js/` / `docs/`。
- 游戏测试钩子见 `docs/ENGINE.md` 第 9、10 节（`NF.debug.jump/state/complete/reset/hint`、`[data-t]` 选择器）。

## 阶段 2：qa/playtest.mjs（20 关逐关 + 连续通关）

```bash
node qa/playtest.mjs                          # 完整验收：preflight → 存档迁移 → 逐关独立 1-20 → 连续通关 1→20 → 附加检查
node qa/playtest.mjs --preflight              # 只检查游戏是否可加载 / 20 关是否注册 / 无 console 报错（就绪=0，未就绪=2）
node qa/playtest.mjs --independent-only       # 只跑 NF.debug.jump(id) 逐关独立验证
node qa/playtest.mjs --continuous-only        # 只跑从标题连续通关到结局
node qa/playtest.mjs --levels=1-10 --max-level=10   # 只回归前 10 关（第二幕作者交付前用）
node qa/playtest.mjs --levels=11,12,19        # 只跑指定关卡的独立验证（调试用）
node qa/playtest.mjs --browser=chrome --no-strict-checks
```

- 输出：控制台结构化摘要 + `qa/playtest-report.json`（各关 PASS/FAIL、失败原因、console 异常、截图清单）。
- 截图：`qa/shots/pt-<关号>-start.png` / `pt-<关号>-done.png`、`pt-title-*.png`、`pt-level-map.png`、
  `pt-ending.png`、`pt-ending-restart.png`、`pt-restart-level1.png` 等（1440x900）。
- 覆盖：标题开始（20 个进度点）、每关真实鼠标/键盘通关、每关存档断言、L4 后与 L10 幕边界刷新续档、
  旧 10 关存档迁移（finished -> 第 11 关）、提示重播、静音、20 格关卡地图、结局（20/20）与再玩一次。
- 第二幕（L11-L19）真实实现已按下表校准（2026-10-21）：
  L11 点幽灵×3→拖卡片；L12 迷你窗口右键建文件夹→拖出窗口；L13 上拖任务栏抽屉→点文件夹；
  L14 建房→等 rival 抢走→极速点两次眩晕→拖进 safe-zone（用 elementFromPoint 躲遮挡）；
  L15 点真图标；L16 从屏幕外窗口可见标题栏起拖（按窗口中心算 delta）→真窗口入槽→Enter；
  L17 等 boss 闭眼建房→2.4s 窗口内拖进罐；L18 假结局 Ctrl+Shift+F→确定→拖到 rewind-target；
  L19 token→槽位→run-btn。
  L20（Lead 实现）solver 已按 `exam-panel` / `exam-method` / `terminal-icon` / `crack-target` 写好，
  等 L20 的 init bug 修复后即可跑通。
- `cdp.mjs` 的 `rect()` 默认**不滚动页面**：游戏元素全屏绝对定位，off-screen 元素（如 L16 屏幕边缘窗口）
  若被 `scrollIntoView` 会滚走整个文档、导致 Input 坐标错位；需要滚动时显式传 `{ scroll: true }`。
- 占位关（作者未交付时）：`solveLevel` 会检测 `[data-t="placeholder-<N>"]` 直接点过；
  作者交付真实实现后自动切换为 ACT3 规范的 solver。
- `--no-strict-checks`：附加检查失败只记录、不计入总结果（用于隔离游戏逻辑问题）。
- 已知游戏侧问题（未改游戏代码）：L9 每轮保存后 950ms 的 `startRound()` 会无条件清空 `folder`，
  玩家若在窗口期内创建下一轮文件夹会被静默吞掉；QA 侧以"安全罐重新高亮"作为安全创建信号。
- HTTP 静态服务器优先（`node server.mjs <随机端口>`），file:// 兜底；结束时清理浏览器进程树与临时 profile。

