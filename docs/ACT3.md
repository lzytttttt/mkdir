# 第三幕 / 第四面墙（第 11-20 关）实现规范

> 背景：第 10 关玩家把文件夹拖进自己影子，游戏被折叠进"游戏里的游戏窗口"。
> 从第 11 关开始，伪操作系统逐渐意识到自己是个游戏：教程幽灵出逃、游戏窗口出现在桌面里、
> 任务栏藏了抽屉、另一个"玩家"来抢文件夹、屏幕被关掉、对话框逃出屏幕、小夹变成 Boss、
> 游戏提前播放假结局、露出源代码、最后是一场三连考试 + 真结局。
>
> **共同铁律**
> - 目标永远还是"新建文件夹"，但每关的路径必须不同；禁用文字教程，教学只靠 `ctx.hint` 里的幽灵演示。
> - 失败无惩罚、只有滑稽反馈；所有交互可无限重试。
> - 只写自己被分配的 `js/levels/lNN.js`；不碰核心/其他关卡/CSS 文件。
> - CSS 一律 `ctx.style()` 注入，类名带 `lvNN-` 前缀；所有定时器/监听必须走 `ctx.on/timer/interval/raf/onCleanup`。
> - 经典 script（无 import/export），IIFE + 'use strict'，中文注释。
> - 交互元素加 `data-t`（见每关）；需要给 QA 读状态的，挂 `data-*` 属性（如 `data-phase`、`data-aligned`）。
> - 图标只能用 `NF.icons` 里已有的名字（新增：window/code/play/socket/hourglass/bug/eyeClosed/hand/crack/tux 等）。
> - 每关 init 后自动 1.65s 播一次 hint；玩家 12s 无操作重播；阶段推进后主动 `ctx.replayHint()`。
> - 完成必须调用 `ctx.complete({ el: folder } )`（或 `{x,y}`）；不能直接改进度。

引擎能力速查见 `docs/ENGINE.md`；参考写法：`js/levels/l05.js`（拖拽）、`l07.js`（窗口/键盘）、`l08.js`（多阶段 + 长按）、`l10.js`（迷你窗口/漂移目标）。

---

## L11 幽灵出逃  `l11.js`（level-b）

**剧情**：教程幽灵失业了，它偷走了"新建文件夹"命令，在桌面到处乱窜。

**玩法**
1. 一个幽灵光标（白色箭头 + 发光尾迹，`data-t="rogue-ghost"`）在屏幕内快速瞬移：每 1.1-1.5s 用 0.25s 飞向随机点（避开屏幕边缘 80px），飞行时留下淡尾迹。
2. 点击幽灵：累计 3 次。每被抓一次：
   - 它尖叫一下，速度加快（间隔 -0.18s），并抛出 2 个半透明假幽灵（`data-t="ghost-decoy"`，800ms 后消失）；
   - 点到假幽灵：屏幕轻抖、`deny` 音、玩家被"眩晕"0.5s（禁用点击/不致命）。
3. 抓满 3 次后，幽灵原地掉下一张发光"文件夹卡片"（`data-t="stolen-folder"`，76px 文件夹图标、带光圈），然后逃出屏幕。
4. 把卡片拖到桌面中央（或任意空白处）松手 → 卡片变成真正的文件夹（`data-t="created-folder"`，带标签"新建文件夹"）→ `ctx.complete({el})`。

**hint**：幽灵鼠标飞向 rogue-ghost，做点击涟漪；再飞向 stolen-folder，把它拖到右下方。
**QA 钩子**：`rogue-ghost` 的 `dataset.hits`（0-3）；点击可用 `page.click`；最后拖 `[data-t=stolen-folder]` 到空白处。
**难度**：中低（热身，但比第 1-9 关多一层追逐）。

---

## L12 游戏里的游戏  `l12.js`（level-b）

**剧情**：玩家从第 10 关带出来的迷你游戏窗口现在真的在桌面上运行。

**玩法**
1. 屏幕中央偏上有一个迷你游戏窗口（约 440×300，内部用 `transform: scale(.55)` 缩放；`data-t="mini-window"`），里面有自己的迷你桌面、迷你任务栏、任务栏有个小罐子。
2. 在迷你窗口**内部**右键 → 弹出一个迷你右键菜单（`data-t="mini-menu"`；注意：不是 OS.menu，自己做一个小面板，因为 OS.menu 不缩放）。
   - 菜单项：`新建`（文件夹图标，`data-t="mini-item-new"`）与 `取消`（X 图标，`data-t="mini-item-cancel"`），只显示图标 + 极小字号，hover 高亮。
   - 点"新建" → 迷你窗口里出现一个迷你文件夹（`data-t="mini-folder"`，约 34px），菜单关闭。
3. 把迷你文件夹从迷你窗口里**拖出去**：迷你窗口有 clipping；拖动时文件夹跟随鼠标；如果松手仍在窗口内 → 弹回窗口内（thud）。松手在窗口外 → 文件夹播放"逃出游戏"动画（从小到大 + 闪白）变成正常大小文件夹（`data-t="created-folder"`）→ `ctx.complete({el})`。
4. 迷你窗口自身每 9s 缓慢横移 ±40px（仅视觉/增加手感），不要让它跑出屏幕。

**hint**：幽灵右键迷你窗口（`do` 打开迷你菜单）→ 点击新建 → 出现迷你文件夹 → 从迷你窗口拖到右侧桌面。
**QA 钩子**：`mini-window`、`mini-menu`、`mini-item-new`、`mini-folder`、`created-folder`；`mini-folder` 的 rect 必须可拖。
**难度**：中（小目标 + 拖出边界）。

---

## L13 任务栏抽屉  `l13.js`（level-b）

**剧情**：所有新建入口都被系统封了；最后一条"新建"命令掉进了任务栏的暗格。

**玩法**
1. 屏幕底部任务栏上方出现一条发光把手（`data-t="drawer-handle"`，高 18px，贴住任务栏上沿，带六点抓握纹理）。
2. 右键桌面 / Ctrl+Shift+F 都被封：分别弹一个错误 toast（`lock` / `key` 图标）并播放 deny；不要生成任何菜单。
3. **按住把手向上拖**：抽屉跟着鼠标向上展开（最多 260px），展开时露出内部一个发光的"新建文件夹"图标（`data-t="drawer-folder"`）。松手时：
   - 拖动距离 < 130px → 抽屉弹回（deny/thud），可重试；
   - ≥ 130px → 抽屉保持打开（记住高度），播放 open/select。
4. 点一下 drawer-folder（或把它拖到桌面）→ 生成文件夹（`data-t="created-folder"`）→ `ctx.complete({el})`。
5. 抽屉打开后如果 10s 没操作，会自动缓缓收回，需要重新拉。任务栏本身不要被破坏：抽屉用自己的元素实现，清理时移除。

**hint**：幽灵光标移到 drawer-handle，向上拖 220px（用 ghost 的 drag 原语），highlight drawer-folder。
**QA 钩子**：`drawer-handle`（可拖动）、`drawer-folder`、`created-folder`；抽屉高度可读 `drawer.dataset.open`（"0"/"1"）。
**难度**：中（纵向拖拽 + 小目标）。

---

## L14 影子玩家  `l14.js`（level-c）

**剧情**：屏幕右下角冒出另一个"玩家"光标（蓝色幽灵手），它来抢你的文件夹。

**玩法**
1. 阶段 1：正常右键新建（可用 `OS.menu` + `OS.nameDialog`，或直接点菜单出文件夹，二选一；建议直接创建以节省时间）。生成 `data-t="created-folder"`。
2. 阶段 2：2 秒后蓝色 rival 光标（`data-t="rival"`，约 40px，蓝色鼠标图标 + 尾迹）从右下角冲向文件夹，把它"抢走"：文件夹吸附在 rival 下方跟着跑。rival 在桌面内随机漫游，鼠标靠近时加速逃开（保持 >140px），偶尔变向。
3. 玩家点击 rival（累计 2 次）：rival 旋转眩晕 2.2s，文件夹掉落（做一个小小的掉落 + 弹跳动画，落在桌面空白处）。
   - 眩晕期间必须把文件夹拖进右下角的"安全区"（`data-t="safe-zone"`，140×110 的虚线文件夹轮廓 + 微光；在任务栏上方）。
   - 如果 2.2s 内没送到，rival 恢复并再次抢走文件夹（无限重试）。
4. 拖进 safe-zone 松手 → 文件夹吸附、闪光、安全区合上 → `ctx.complete({el})`。

**hint**：阶段 1 演示右键新建；阶段 2 先点击 rival（visual click），再拖 created-folder 到 safe-zone。
**QA 钩子**：`rival`（`data-stunned="1"` 时），`created-folder`、`safe-zone`。
**难度**：中高（移动目标 + 点击 + 限时投递）。

---

## L15 断电  `l15.js`（level-c）

**剧情**：有人拔了显示器电源。只有鼠标周围一小圈手电光。

**玩法**
1. 进入关卡后整个桌面被一块全屏遮罩压暗（遮罩 `data-t="darkness"`，`pointer-events:none`），鼠标周围 150px 是透明光斑，随鼠标移动（用 `radial-gradient(circle 150px at x y, transparent 0, rgba(0,0,0,.985) 78%)`），平滑跟随（lerp）。
2. 桌面上随机散落 6 个 64px 图标：其中 1 个是真·新建文件夹图标（`data-t="power-icon-real"`，微弱金色呼吸光，光斑照到才看得清），另外 5 个是假图标（`data-t="power-icon-fake"`，错位/倒置/单色）。
3. 点真图标 → 图标炸成小光点，然后在桌面中央"点亮"生成文件夹（`data-t="created-folder"`）→ `ctx.complete({el})`。点假图标 → 手电闪一下、怪声、图标位移（不惩罚）。
4. 手电电量条（右下角细长条，`data-t="power-bar"`）25s 内从满到空；空了之后全场闪三下变暗再亮起并回满（循环，不失败），同时所有假图标换位置。
5. 玩家可以用方向键微调光斑（可选，不强制）。

**hint**：幽灵光标先"照亮"真图标（用高亮脉冲/移动），再点击。
**QA 钩子**：真图标 `data-t="power-icon-real"`，遮罩 `data-t="darkness"`，`power-bar`；图标位置每局随机但都在安全区（距边 120px 内）。
**难度**：高（低可视度搜索）。

---

## L16 窗口大逃亡  `l16.js`（level-c）

**剧情**：新建文件夹的对话框不愿意出现，它躲到屏幕外去了。

**玩法**
1. 屏幕右缘只露出半个窗口（`data-t="escape-window"`，宽 420、高 260，标题栏"新建文件夹"，只露出约 90px）。窗口会缓慢向屏幕外滑，鼠标靠近标题栏时会小幅躲闪（但拖动时正常）。
2. 拖住它的标题栏（`data-t="escape-titlebar"`）把它拉到屏幕中央（距离中心 < 150px 时吸附到中央，播放 snap）。
3. 吸附后窗口一分为三：一个真窗口（标题栏有文件夹小图标，`data-t="real-window"`）和两个假的（`data-t="decoy-window"`，标题栏是齿轮/机器人图标），三个窗口在屏幕上乱序闪烁/交换位置（用 CSS 过渡 0.35s；不要真的高速迷惑，玩家可点击任意窗口把它拖到中央）。
4. 把真窗口拖到中央的虚线框（`data-t="window-slot"`，圆形/圆角虚线目标）里；错窗口会抖动并弹开。
5. 真窗口就位后，点它的"确定"按钮（按钮会躲鼠标，`data-t="dialog-ok"`）或按 Enter → 生成文件夹（`data-t="created-folder"`，从窗口里飞出来）→ `ctx.complete({el})`。

**hint**：阶段 1 拖 escape-titlebar 到中央；阶段 2 highlight real-window，拖到 window-slot，再按 Enter。
**QA 钩子**：`escape-titlebar`、`real-window`、`decoy-window`、`window-slot`、`dialog-ok`、`created-folder`。
**难度**：高（窗口管理 + 识别 + 拖拽精度）。

---

## L17 小夹的凝视  `l17.js`（level-d）

**剧情**：小夹（folderFace）长成了屏幕中央的巨型 Boss，盯谁谁不能动。

**玩法**
1. 屏幕中央偏上出现巨大蛋糕（?）不，小夹 Boss：`data-t="mascot-boss"`，直径约 360px 的 folderFace SVG，带"睁眼/闭眼"两种状态 `data-eyes="open"|"closed"`。
2. **睁眼时**：全局 `pointerdown` 捕获（capture 阶段），任何点击都被"吃掉"——播放 deny + 屏幕红闪 + Boss 眼睛发光 + 一个小"被注视"抖动；菜单/对话也会被关闭。**闭眼时**：一切正常。
3. 闭眼循环：闭眼 1.6s → 睁眼 2.4s → 闭眼 1.6s …（每轮闭眼时间随机 1.3-1.9s）。
4. 玩家必须在闭眼窗口内完成"新建文件夹"：右键 → 新建 → 文件夹（**直接生成文件夹，不弹名字对话框**；这样 1.6s 内可完成）。生成 `data-t="created-folder"` 后，Boss 会在 2.4s 后睁眼；必须在睁眼前把文件夹拖到右下角的安全罐（`data-t="boss-jar"`，大玻璃罐，120px）。
5. 成功投进罐子 → 罐子发光、Boss 眼睛变成惊讶 `zzz`/晕眩 2s → `ctx.complete({el})`。若 Boss 睁眼时文件夹还没进罐 → 文件夹被"盯"成灰烬（吸气动画 + 失败音），重试（Boss 不会因此加速，保持节奏）。
6. Boss 睁眼时不允许打开菜单（点击被吃）；闭眼时菜单正常。

**hint**：阶段 1：Boss 闭眼时幽灵展示右键→新建→文件夹；阶段 2：幽灵拖 demo 文件夹到 boss-jar。
**QA 钩子**：`mascot-boss` 的 `data-eyes`；`created-folder`、`boss-jar`。QA 需要轮询 `data-eyes="closed"` 再操作。
**难度**：高（时机 + Boss 压力）。

---

## L18 假结局  `l18.js`（level-d）

**剧情**：游戏提前播放了自己的结局页，试图骗你"已经通关"。

**玩法**
1. 进入关卡后，桌面被一个假结局层覆盖（`data-t="fake-ending"`，全屏、暗夜渐变 + 星空 + 居中玻璃罐 + 大标题"新建文件夹" + 滚动字幕条），复制真结局的视觉但更假（颜色偏灰、jar 里只有 3 个 folder、有"再玩一次"按钮但点击会躲避并 giggle）。
2. 假结局层上面的按钮/罐子都不可用（点了只有嘲讽）。唯一可行的操作：按 `Ctrl+Shift+F` 打开名字对话框（OS 对话框在 ui-layer，会盖在假结局上）→ 输入任意名 → 确定 → 一个文件夹出现在假结局层上方（`data-t="created-folder"`）。
3. 把文件夹拖到假结局标题上的"裂缝"目标（`data-t="rewind-target"`，标题中央的发光裂缝，40×80，呼吸动画）。
4. 松手 → 屏幕倒带（radial wipe / 横向撕裂 + 反相闪白 + 倒放风声）→ 假结局碎裂消失，露出真实桌面；文件夹保留并对齐到桌面中央 → `ctx.complete({el})`。
5. 假结局必须能被清理干净（ctx.onCleanup）。

**hint**：keys Ctrl+Shift+F → highlight dialog-ok → 幽灵拖文件夹到 rewind-target。
**QA 钩子**：`fake-ending`、`rewind-target`、`created-folder`、`dialog-ok`。
**难度**：高（反直觉：在结局里继续操作）。

---

## L19 源代码  `l19.js`（level-d）

**剧情**：游戏露出了自己的源代码——创建文件夹的那行代码坏了。

**玩法**
1. 屏幕中央一个代码编辑器窗口（`data-t="code-window"`，深色、行号、语法高亮色块；内容用抽象色块 + 图标表示，避免长篇文字）：
   - 行 1：`function` 图标 + `新建文件夹` 色块；
   - 行 2：一个虚线空槽（`data-t="slot-folder"`，文件夹形状）；
   - 行 3：`return` 图标；
   - 右下角"运行"按钮（`data-t="run-btn"`，play 图标）上面有个空槽（`data-t="slot-run"`）。
2. 窗口下方是零件托盘（`data-t="token-tray"`）：3 个可拖动 token：
   - `data-t="token-folder"`（文件夹图标，正确）；
   - `data-t="token-play"`（play 图标，正确）；
   - `data-t="token-bug"`（bug 图标，干扰项，拖到任何槽都会报错 + 抖动 + 变红）。
3. 把 token-folder 拖进 slot-folder、token-play 拖进 slot-run（吸附，snap 音）；错误 token → 槽抖动、error 音、token 弹回。
4. 两个槽都正确后，run-btn 亮起并自己抖动；点击 run-btn → 编辑器里滚过一行 `createFolder()` 色块动画、绿色扫描线、闪白 → 桌面上生成文件夹（`data-t="created-folder"`）→ `ctx.complete({el})`。
5. 可加一点幽默：run 第一次失败（"缺少分号"），自动补一个分号飞入后第二次运行成功——但不要真的让玩家读字；用图标动画表达即可，可选。为保证 QA 稳定，建议不做必败步骤。

**hint**：拖 token-folder 到 slot-folder，token-play 到 slot-run，点击 run-btn。
**QA 钩子**：`token-folder`、`token-play`、`slot-folder`、`slot-run`、`run-btn`、`created-folder`。
**难度**：高（拼装 + 精确拖拽 + 识别干扰项）。

---

## L20 最终考试（Lead 自己实现）  `l20.js`

三连考试（右键 / 快捷键 / 终端）+ 裂缝终局，Lead 负责，其他作者不用碰。

---

## 交付与自测要求

1. 完成文件后 `node --check js/levels/lNN.js` 通过。
2. 起本地服：`node server.mjs 4200`（用 4200 等不冲突端口），用 `qa/cdp.mjs`（`launch/navigate/evaluate/click/drag/key/screenshot`）自测：
   - 用 `NF.debug.jump(NN)` 跳关、截图检查布局在 1440×900 内；
   - 真实鼠标键盘走通至少一次 → `NF.debug.state().completed` 应包含 NN、自动进入下一关；
   - 全程 console 无错误；刷新/重玩不残留 DOM（可 `NF.debug.jump(11)`→`jump(12)` 来回跳两次验证清理）。
3. 汇报格式：每关实现要点、data-t 清单、已验证内容、已知问题。简短。
4. 不要修改 `docs/ACT3.md`、`docs/ENGINE.md`、核心文件或别人的关卡；如果必须加引擎能力，先在汇报里提出。
