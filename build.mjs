/* 单文件打包：把 index.html 引用的 CSS / JS 全部内联成 dist/新建文件夹.html
   产物可直接双击用 file:// 游玩，也可以挂到任意静态服务器。 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

function escapeInlineScript(js) {
  // 防止脚本内容里出现 </script> 提前闭合
  return js.replace(/<\/script/gi, '<\\/script');
}

async function main() {
  const original = await read('index.html');
  let html = original;
  const cssCache = new Map();
  const jsCache = new Map();

  // 先在原始 HTML 上收集全部标签，再一次性替换（避免边替换边 exec 导致下标错位）
  const links = [];
  const scriptList = [];
  let m;
  const linkRe = /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi;
  while ((m = linkRe.exec(original))) links.push({ tag: m[0], href: m[1] });
  const scriptRe = /<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/gi;
  while ((m = scriptRe.exec(original))) scriptList.push({ tag: m[0], src: m[1] });

  // 内联样式表
  for (const l of links) {
    if (!cssCache.has(l.href)) cssCache.set(l.href, await read(l.href));
    html = html.split(l.tag).join('<style>\n/* ' + l.href + ' */\n' + cssCache.get(l.href) + '\n</style>');
  }

  // 内联脚本
  for (const s of scriptList) {
    if (!jsCache.has(s.src)) jsCache.set(s.src, await read(s.src));
    html = html.split(s.tag).join(
      '<script data-src="' + s.src + '">\n/* ' + s.src + ' */\n' + escapeInlineScript(jsCache.get(s.src)) + '\n</script>'
    );
  }

  // 去掉 dist 文档里不该残留的本地引用提示
  html = html.replace(
    '</head>',
    '<!-- 单文件构建产物：所有 CSS/JS 已内联，可直接双击运行。源码见项目根目录。 -->\n</head>'
  );
  html = html.replace(
    '</body>',
    '<script>try{console.log("%c新建文件夹 %cv"+(window.NF&&NF.version||"")+" %c单文件版",' +
      '"color:#ffc94d;font-weight:900;font-size:14px","color:#8a6cff","color:#8ea0cf")}catch(e){}</script>\n</body>'
  );

  const leftover = html.match(/<script\b[^>]*\ssrc=[^>]*>|<link\b[^>]*rel="stylesheet"[^>]*>/gi);
  if (leftover) {
    console.error('leftover:', leftover.slice(0, 5));
    throw new Error('仍有未内联的外部资源，请检查 index.html');
  }

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist', '新建文件夹.html');
  await writeFile(out, html, 'utf8');
  await writeFile(join(ROOT, 'dist', 'index.html'), html, 'utf8');
  const kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  console.log('built:', out, '(' + kb + ' KB)');
  console.log('built:', join(ROOT, 'dist', 'index.html'));
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exitCode = 1;
});
