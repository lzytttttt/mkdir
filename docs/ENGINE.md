# 《新建文件夹》工程契约（所有协作者必读）

一个伪装成桌面操作系统的整蛊游戏：每一关的目标都是"新建一个文件夹"，但系统会越来越离谱地阻挠你。
**核心原则：少文字引导，非文字游戏。** 所有教学都必须用幽灵鼠标演示、高亮、音效、动画完成。
界面内的"新建 / 文件夹 / 确定 / 取消 / mkdir"等属于仿系统 UI 文案，允许；不要写教学句子。

目前状态：Lead 正在搭建核心，关卡作者只写自己负责的 level 文件。

## 1. 运行方式

纯静态、零依赖、经典 `<script>`（不用 ES module，保证 `file://` 双击也能玩）。

```bash
node server.mjs 4173        # 本地静态服务器，浏览器打开 http://127.0.0.1:4173/
node build.mjs              # 产出 dist/新建文件夹.html（单文件，可双击）
```

测试用无头 Edge/Chrome（机器上都有），QA 自动化在 `qa/`。

## 2. 目录与加载顺序

```
index.html
css/style.css            # 核心 OS 主题（Lead 独占）
js/core/icons.js         # NF.icons  SVG 图标（Lead）
js/core/audio.js         # NF.Audio  合成音效（audio-fx）
js/core/fx.js            # NF.FX     全屏 canvas 粒子/纸屑/震屏（audio-fx）
js/core/ghost.js         # NF.Ghost  幽灵鼠标教学（Lead）
js/core/os.js            # NF.OS     桌面/右键菜单/对话框/窗口/拖拽（Lead）
js/core/game.js          # NF.Game   关卡生命周期/进度/HUD/标题（Lead）
js/levels/l01.js ... l20.js   # 每关一个文件（第一幕 / 第三幕；第三幕规范见 docs/ACT3.md）
js/main.js               # 启动（Lead）
server.mjs / build.mjs   # 开发服务器 / 单文件打包（Lead）
qa/                      # QA 自动化（QA 独占）
```

`index.html` 加载顺序：icons → audio → fx → ghost → os → game → l01..l20 → main。

## 3. 全局命名空间

所有代码挂在 `window.NF` 上，不要污染其它全局。所有文件用 IIFE 包裹：

```js
(function () {
  'use strict';
  // ...
})();
```

## 4. NF.icons（Lead 提供）

```js
NF.icons.svg(name, className?)  // 返回 SVG 字符串
NF.icons.el(name, className?)   // 返回元素
```

可用名字（便于关卡/QA 统一）：
folder, folderOpen, folderFace, file, fileText, fileImage, terminal, trash, computer,
settings(齿轮), jar(玻璃罐), robot, shard, cursor, mouse, mouseLeft, mouseRight,
lightbulb, speakerOn, speakerOff, clock, lock, unlock, error, warning, check, star,
sparkle, key, enterKey, arrowUp, arrowDown, arrowRight, arrowLeft, restart, heart,
cake, cloud, paperclip, bomb, magnet, gear, disk.

## 5. NF.Audio（audio-fx 提供）

```js
NF.Audio.init()            // 首次用户手势时调用，解锁 AudioContext
NF.Audio.play(name, opts?) // opts: {volume?, rate?, pan?}
NF.Audio.setMuted(bool); NF.Audio.isMuted(); NF.Audio.toggleMute();
NF.Audio.startAmbient(); NF.Audio.stopAmbient(); // 极轻的 8-bit 氛围循环（可选）
```

必须实现的音效名（未知名字静默忽略，但不得报错）：

- UI：click, hover, open, close, tick
- 菜单：dodge（逃跑 whoosh）, deny（禁用 buzz）, error, select
- 键盘：key, type, backspace, enter
- 桌面：pop（文件夹出现）, paper（纸张）, snap（吸附）, whoosh, thud
- 成功：success（关卡完成小旋律）, sparkle, levelup
- 特殊：giggle（小夹偷笑）, boing, slurp（机器人吸走）, robot（嗡嗡）, alarm,
  explode, powerdown, win（结尾长旋律）
- 粒子：confetti, firework

要求：WebAudio 合成、无外部资源；连续快速调用不爆音；不抛异常；`prefers-reduced-motion` 不影响声音。

## 6. NF.FX（audio-fx 提供）

```js
NF.FX.init()                                   // 建全屏 canvas（#fx-canvas），rAF 循环
NF.FX.burst(x, y, {count=24, colors, speed=8, gravity=0.2, life=900, size, shape='rect'})
NF.FX.confetti({count=80, origin:{x?,y?} or 'top'})
NF.FX.sparkle(x, y, color?)
NF.FX.ripple(x, y, {color, radius=40, ms=500})
NF.FX.shake(intensity=8, ms=350)                // 震动 #os-wrap
NF.FX.flash(color='#fff', ms=250)               // 全屏闪
NF.FX.fly(fromRect, toRect, {html, duration=700, arc=-120, onDone}) // 用 DOM 克隆飞行动画
NF.FX.dust(x,y)                                 // 小灰尘
NF.FX.clear()                                   // 立即清空所有粒子/飞行/闪光/震屏（切关卡用）
```

要求：canvas `pointer-events:none`，z-index 90；粒子数量有上限（<500），对象池/数组清理；
不阻塞主线程；移动端窗口适配；reduced-motion 时减少粒子但保留反馈。

## 7. NF.Ghost（Lead 提供）— 关卡教学核心

```js
NF.Ghost.play(steps) -> Promise    // 依次播放幽灵鼠标演示
NF.Ghost.cancel()
```

step 原语：

```js
{ move: '[data-t="x"]' | [x, y], dur: 600 }
{ click: 'left' | 'right', target?: '[data-t="x"]' | [x,y] }   // 视觉点击 + 涟漪
{ keys: 'Ctrl+Shift+F', dur: 900 }                              // 显示键帽
{ type: 'mkdir abc' }                                           // 显示打字气泡
{ drag: { from: selOrPoint, to: selOrPoint, dur: 900 } }        // 视觉拖拽
{ hold: selOrPoint, dur: 1200 }                                 // 视觉长按（带进度环）
{ highlight: sel, dur: 700 }                                    // 元素高亮脉冲
{ ripple: [x,y], color? }
{ wait: 300 }
{ do: async () => {} }                                          // 真正操作 UI（谨慎：不能直接通关）
```

演示永远不替玩家完成核心动作，只展示路径。演示进行时不可阻挡用户操作。

## 8. NF.OS（Lead 提供）

```js
NF.OS.desktopEl, NF.OS.levelRoot, NF.OS.uiLayer, NF.OS.windowLayer
NF.OS.center(el) -> {x,y}; NF.OS.rect(el) -> DOMRect 对象
NF.OS.on(el, event, handler, opts) -> off()          // 自动随关卡清理？否，用 ctx.on
NF.OS.menu({ x, y, items, className?, testid? }) -> controller
NF.OS.dialog({ title, icon, body, buttons, modal=true, className?, testid? }) -> controller
NF.OS.nameDialog({ value='新建文件夹', onSubmit(name), onCancel }) -> controller
NF.OS.window({ title, icon, x, y, w, h, body, className?, testid? }) -> {el, body, close(), focus(), shake()}
NF.OS.toast({ icon, title, msg?, kind:'info'|'error'|'success', ms=2600 })
NF.OS.icon({ icon, label?, x, y, testid?, draggable?, onOpen?, onDblClick? }) -> {el, remove()}
NF.OS.makeDraggable(el, { onStart,onMove,onEnd, threshold=4, ghost?, testid? }) -> handle
NF.OS.dropHit(pointOrEl, targets)  // 命中矩形辅助
NF.OS.reset()                      // 清空窗口/菜单/图标，回桌面
NF.OS.lockCursor? // 不用
```

### menu items

```js
{
  id, label?, icon?, testid?, danger?, disabled?,
  submenu?: [item...],
  onSelect?(menu, item),
  dodge?: true,          // 鼠标靠近就逃跑（L2）
  onHover?(menu, item),
  keepOpen?: true        // 选择后不关闭
}
```

菜单支持键盘：↑↓ 选择、Enter 确认/展开子菜单、→ 展开、← 返回、Esc 关闭。
选中项 class `.sel`，菜单根 `[data-t="menu"]`，未指定 testid 的项自动 `data-t="menu-item-<id>"`。
带 dodge 的项在鼠标靠近时 translate 逃开并播放 dodge 音效，键盘仍可选中。
子菜单自动在右侧展开。

### dialog

```js
buttons: [{ id, label, kind:'default'|'primary'|'danger', testid?, dodge?, onClick?(dlg) }]
```

默认 `[data-t="dialog"]`、确定 `[data-t="dialog-ok"]`、取消 `[data-t="dialog-cancel"]`，除非 testid 覆盖。
返回 `{el, body, close(), shake()}`。Esc = 取消（如有）。

### icon

桌面图标：双击触发 `onDblClick`（内部 350ms 判定），单击选中。`draggable` 时由关卡自行调用 makeDraggable。
`[data-t="desktop-icon"]` + 自定义 testid。

### makeDraggable

pointer 事件实现；`onStart(e, offset)`, `onMove(e, pos)`, `onEnd(e, pos)`；
拖拽时元素加 `.dragging`，自动提升 z-index，支持 touch。位置相对 `#level-root`（position:absolute）。
返回 `{destroy()}`。

## 9. NF.Game / 关卡契约（Lead 提供）

每个 level 文件末尾：

```js
NF.Game.registerLevel({
  id: 5,
  icon: 'file',                 // 关卡地图里用的图标
  hint: async (ctx) => {},      // 可选：默认使用 ctx.hint
  init: (ctx) => { /* 建 UI、绑交互 */ return () => { /* 可选清理 */ }; },
});
```

`ctx`：

```js
ctx.root           // 本关专用容器（绝对定位铺满桌面，z-index 20）
ctx.level          // 关卡定义对象
ctx.os, ctx.fx, ctx.audio, ctx.icons, ctx.ghost
ctx.style(cssText) // 注入本关 <style>（自动清理）。所有类名加 lvN- 前缀！
ctx.on(target, ev, fn, opts)   // 自动清理的监听
ctx.timer(ms, fn)              // setTimeout，自动清理；返回 id
ctx.interval(ms, fn)           // 自动清理
ctx.raf(fn)                    // 自动清理的 rAF 循环（fn 收到时间戳）
ctx.onCleanup(fn)
ctx.cleanup()                  // 立即清理（一般不用调）
ctx.toast(opts)                // = NF.OS.toast
ctx.complete({ x, y }?)        // 完成关卡：文件夹飞进玻璃罐 → 下一关。可传文件夹出现位置
ctx.hint(fn?)                  // 设置/重播本关幽灵演示（默认 init 后约 1.6s 自动播一次、卡关 12s 重播）
ctx.createdFolder({ x, y, icon?, onDragEnd? }) // 生成"已创建"文件夹元素 + 返回 el，内部不含通关逻辑
ctx.qa(name)                   // 标记 data-qa，便于测试
```

**完成条件**必须是玩家真的"新建文件夹"成功。`ctx.complete()` 会锁输入、播放庆祝、存档、过关。

关卡根节点自动带 `data-level="<id>"`。关闭/切换关卡时 ctx 资源自动清空，不要依赖全局单例。

约定 testid（用 `data-t`）：

- 通用：`created-folder`（建成的文件夹）、`dialog-ok`、`dialog-cancel`、`name-input`、`menu`、`menu-item-new`、`menu-item-folder`
- L5：`file`（可拖动文件，多个）、`merge-folder`
- L6：`shard`、`outline`
- L7：`terminal-icon`、`terminal-window`、`terminal-input`
- L8：`d3-back`、`d3-front`、`d3-dial`（`data-phase` / `data-angle` / `data-target` / `data-aligned`）、`d3-hold`
- L9：机器人 `robot`、安全罐投放区 `jar-drop`
- L10：`created-folder` 自拖 / 影子 `folder-shadow`；迷你窗口 `meta-layer`、`meta-window-real`、`meta-window-fake`、`meta-jar`、`meta-jar-fake`；结尾 `ending`
- L11-20：见 docs/ACT3.md 每关的 data-t 清单

## 10. 进度 / HUD / 测试钩子

- localStorage key：`nf.progress.v1`；字段 `{completed:[1..], current:1, muted:false, finished:false}`
- `NF.Game` 启动：标题页（点击/回车开始）→ 从 current 继续。
- 完成任务栏玻璃罐（`[data-t="jar"]`）里增加一个小文件夹；点击打开关卡地图窗口（`[data-t="level-map"]`）。
- 任务栏：开始按钮（[data-t="start"]，打开关卡地图）、提示灯泡（[data-t="hint"]，重播演示）、静音（[data-t="mute"]）、时钟。
- 调试钩子（QA 用，必须实现）：

```js
NF.debug.jump(id)          // 立即切到第 id 关（已解锁/不校验）
NF.debug.state() -> { level, completed:[], finished, busy }
NF.debug.complete()        // 调用当前关 ctx.complete()（冒烟测试用）
NF.debug.reset()           // 清进度回标题
NF.debug.hint()            // 重播当前关演示
NF.debug.qa(selector, fn)  // 不安全，不用
```

## 11. 关卡设计清单

> 目标：每关都是"新建文件夹"，但路径/交互完全不同；难度递增；全程几乎无文字。
> 每关开场约 1.65s 后自动播放幽灵演示；玩家 12s 无有效操作会再自动演示一次。
> 当前关卡总数 **20**（`NF.Game.MAX_LEVEL`），第 10 关后进入"第四面墙"幕（`BREAK_LEVEL`），第 20 关后才进真结局。
> 第 11-20 关的完整设计见 **docs/ACT3.md**（含各关 testid / hint / QA 钩子）。

| # | 主题 | 玩法/整蛊 | 完成条件 |
|---|------|-----------|----------|
| 1 | 右键入门 | 右键 → 新建 → 文件夹 → 确定（演示完整展示，菜单/对话框正常） | 建出默认名文件夹 |
| 2 | 菜单大逃亡 | 右键菜单项会躲鼠标（dodge），只能 ↑↓ + Enter 键盘选择；演示先展示鼠标失败再展示键盘 | 键盘建出文件夹 |
| 3 | 快捷键 | 右键"新建"被挂锁，点了报错；必须 Ctrl+Shift+F；屏幕上的 F 键帽会逃跑（纯表演） | 快捷键建出文件夹 |
| 4 | 命名地狱 | 对话框输入框预填大量字符，确定按钮 disabled 且按钮会躲鼠标；Ctrl+A/删除清空后输入任意名，回车确定 | 修改名称后确定 |
| 5 | 拖拽合体 | 桌面上 3 个文件，把文件拖到文件上合成文件夹，再把第三个拖进去 | 合成含 3 文件的文件夹 |
| 6 | 碎片重组 | 新建文件夹命令碎成 4 块，拖进虚线轮廓拼回来；拼好后一角崩开，再拖回 | 拼完后补上崩掉的一角 |
| 7 | 命令行 | 双击终端图标开窗，输入 `mkdir 任意名` 回车；输入错误会滑稽报错（不惩罚） | 终端成功执行 mkdir |
| 8 | 三维折叠（加难） | 桌面进入 CSS 3D：先把前封面拖到摇摆的后封面上 → 用 ←/→ 旋转卡扣对齐缺口 → 再合上 → 按住前封面 1.5s 压住它 | 3 阶段全部完成 |
| 9 | 清理大师 | BOSS：扫地机器人巡逻吸走文件夹。右键建文件夹后必须在机器人吸走前拖进玻璃罐，共 3 轮，一轮比一轮快 | 3 个文件夹安全入罐 |
| 10 | 递归裂缝（加难） | 建出文件夹后拖到自己的影子 → 递归炸裂 → 游戏被折叠成两个迷你游戏窗口，把大文件夹丢进正确的罐子 | 丢进真·迷你窗口的罐子 |
| 11-20 | 第四面墙 | 幽灵出逃 / 游戏里的游戏 / 任务栏抽屉 / 影子玩家 / 断电 / 窗口大逃亡 / 小夹的凝视 / 假结局 / 源代码 / 最终考试 | 详见 docs/ACT3.md |

### 每关的调性

- 失败不惩罚：只有滑稽反馈（抖动、机器人打嗝、小夹偷笑），可无限重试。
- 第 1-3 关建立"右键 / 键盘 / 快捷键"三种操作语言；第 4 关引入输入法；
  第 5-8 关引入拖拽、拼装、命令行、3D；第 9 关节奏紧张；第 10 关折叠游戏；
  第 11-20 关系统逐渐 self-aware，第 20 关是三种方法限时三连考试 + 真结局。
- 小夹（folderFace 图标）是捣蛋鬼：偶尔从边缘探头、失败时偷笑、成功时鼓掌。不要说话。

## 12. 视觉规范

- 壁纸：深夜紫蓝渐变 (#171233 → #2a1e5c → #101a38) + 漂浮半透明彩色文件夹（字符/背光），
  柔和光斑，轻微视差；整体"高级但有点不正常"。
- 仿 Windows 11：白色半透明亚克力面板、8-12px 圆角、柔和阴影、蓝色强调 #5b7cfa；
  文件夹主色 #ffc94d / #ffb020（带高光）。
- UI 字体：Microsoft YaHei / PingFang SC，标题 900 字重。
- 动画要 Q 弹：cubic-bezier(.34,1.56,.64,1)；一切可点元素有 hover/active 反馈 + 音效。
- 关键帧/时长：过关庆祝 1100ms；菜单弹出 140ms；对话框弹出 220ms。
- 不使用外部图片/字体/网络资源；SVG/emoji 除外（优先 SVG）。

## 13. 协作规则

- 只写自己 scope 的文件；关卡 CSS 用 `ctx.style()` 注入，类名带 `lvN-` 前缀。
- 提交前自检：`node --check <file>` 语法、无 console 报错。
- 不要动 index.html 的加载顺序（需要新增文件先告诉 Lead）。
- 单文件打包会自动内联所有 `<script src>` 和 `<link rel=stylesheet>`，不要把资源写成 fetch。
- `.nf-folder` 的入场动画使用 `animation-fill-mode: backwards`，不要改成 `both/forwards`：否则动画会永久覆盖拖拽时的 inline `transform`（历史坑，L9/L10/L14/L20 都受影响）。`.nf-folder.dragging` 已强制取消动画。

