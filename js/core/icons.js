/* NF.icons — 全部界面图标（内联 SVG，无外部资源） */
(function () {
  'use strict';
  window.NF = window.NF || {};

  var FOLDER_BACK = '#e8a21a';
  var FOLDER_FRONT = '#ffc94d';
  var FOLDER_LIGHT = '#ffe08a';

  var paths = {
    folder:
      '<path fill="' + FOLDER_BACK + '" d="M6 15a7 7 0 0 1 7-7h12.5l6.4 7H51a7 7 0 0 1 7 7v27a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7z"/>' +
      '<path fill="' + FOLDER_FRONT + '" d="M6 22a7 7 0 0 1 7-7h38a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7z"/>' +
      '<path fill="' + FOLDER_LIGHT + '" d="M13 17h24l4 4H13z" opacity=".85"/>',
    folderOpen:
      '<path fill="' + FOLDER_BACK + '" d="M6 15a7 7 0 0 1 7-7h12.5l6.4 7H51a7 7 0 0 1 7 7v8H6z"/>' +
      '<path fill="#f6b62a" d="M6 26h52l-7 26a6 6 0 0 1-6 5H13a6 6 0 0 1-6-6z"/>' +
      '<path fill="' + FOLDER_FRONT + '" d="M6 26h52l-6 21a6 6 0 0 1-5.8 4.6H12A6 6 0 0 1 6 46z"/>',
    folderFace:
      '<path fill="' + FOLDER_BACK + '" d="M6 15a7 7 0 0 1 7-7h12.5l6.4 7H51a7 7 0 0 1 7 7v27a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7z"/>' +
      '<path fill="' + FOLDER_FRONT + '" d="M6 22a7 7 0 0 1 7-7h38a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7z"/>' +
      '<ellipse cx="23" cy="35" rx="6" ry="7.2" fill="#fff"/><ellipse cx="41" cy="35" rx="6" ry="7.2" fill="#fff"/>' +
      '<circle cx="24.4" cy="36.2" r="3.1" fill="#2a2140"/><circle cx="39.6" cy="36.2" r="3.1" fill="#2a2140"/>' +
      '<circle cx="25.6" cy="34.8" r="1.1" fill="#fff"/><circle cx="40.8" cy="34.8" r="1.1" fill="#fff"/>' +
      '<path d="M25 46c3.8 4.2 10.2 4.2 14 0" fill="none" stroke="#8a5a12" stroke-width="3.2" stroke-linecap="round"/>' +
      '<ellipse cx="17" cy="46" rx="3.4" ry="2" fill="#ff9db5" opacity=".75"/><ellipse cx="47" cy="46" rx="3.4" ry="2" fill="#ff9db5" opacity=".75"/>',
    file:
      '<path fill="#f4f7ff" d="M14 7h24l12 12v38a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z"/>' +
      '<path fill="#c9d4ec" d="M38 7v12h12z"/>' +
      '<path fill="#dfe7f8" d="M18 26h24v3H18zm0 7h24v3H18zm0 7h16v3H18z"/>',
    fileText:
      '<path fill="#f4f7ff" d="M14 7h24l12 12v38a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z"/>' +
      '<path fill="#9fb4dd" d="M38 7v12h12z"/>' +
      '<path fill="#6f8cc4" d="M18 25h20v3H18zm0 7h24v3H18zm0 7h24v3H18zm0 7h14v3H18z"/>',
    fileImage:
      '<path fill="#f4f7ff" d="M14 7h24l12 12v38a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z"/>' +
      '<path fill="#9fb4dd" d="M38 7v12h12z"/>' +
      '<rect x="17" y="28" width="26" height="20" rx="2.5" fill="#cfe3ff"/>' +
      '<circle cx="24" cy="34" r="3" fill="#ffcf4d"/>' +
      '<path fill="#78a6f0" d="M17 47l8-9 6 6 4-4 8 7v1H17z"/>',
    terminal:
      '<rect x="4" y="9" width="56" height="46" rx="8" fill="#222741"/>' +
      '<rect x="9" y="15" width="46" height="34" rx="4" fill="#121529"/>' +
      '<path d="M16 25l7 6-7 6" fill="none" stroke="#7ef0c0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M28 38h14" stroke="#7ef0c0" stroke-width="4" stroke-linecap="round"/>',
    trash:
      '<path fill="#c3cdea" d="M18 20h28l-2.6 34.2A4 4 0 0 1 39.4 58H24.6a4 4 0 0 1-4-3.8z"/>' +
      '<rect x="15" y="14" width="34" height="7" rx="3" fill="#dde6fa"/>' +
      '<path stroke="#93a6d4" stroke-width="3" stroke-linecap="round" d="M26 28v22M32 28v22M38 28v22"/>' +
      '<path stroke="#dde6fa" stroke-width="4" stroke-linecap="round" d="M27 10h10"/>',
    computer:
      '<rect x="5" y="12" width="54" height="34" rx="5" fill="#3c4a78"/>' +
      '<rect x="9" y="16" width="46" height="26" rx="2.5" fill="#8fd4ff"/>' +
      '<path fill="#2b3354" d="M23 46h18v8H23z"/><rect x="14" y="52" width="36" height="5" rx="2.5" fill="#2b3354"/>' +
      '<path fill="#c7f0ff" opacity=".55" d="M13 20h20l-14 18H13z"/>',
    gear:
      '<g fill="#aebfe4"><path d="M28 5h8l1.4 7.1 5-2 5.6 5.6-2 5 7.1 1.4v8l-7.1 1.4 2 5-5.6 5.6-5-2L36 59h-8l-1.4-7.1-5 2-5.6-5.6 2-5L11 41.9v-8l7.1-1.4-2-5 5.6-5.6 5 2z"/></g>' +
      '<circle cx="32" cy="32" r="10" fill="#465682"/><circle cx="32" cy="32" r="4.6" fill="#1d2440"/>',
    jar:
      '<path fill="#cfe8ff" opacity=".26" d="M17 16h30v36a8 8 0 0 1-8 8H25a8 8 0 0 1-8-8z"/>' +
      '<path fill="none" stroke="#b9e1ff" stroke-width="3" d="M17 16h30v36a8 8 0 0 1-8 8H25a8 8 0 0 1-8-8z"/>' +
      '<rect x="14" y="9" width="36" height="9" rx="4.5" fill="#9ed2f5"/>' +
      '<path fill="none" stroke="#e8f7ff" stroke-width="2.4" stroke-linecap="round" d="M23 25v22" opacity=".7"/>' +
      '<path fill="' + FOLDER_FRONT + '" d="M24 44h16v8a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/>' +
      '<path fill="' + FOLDER_LIGHT + '" d="M24 44h16v2H24z"/>',
    robot:
      '<ellipse cx="32" cy="50" rx="24" ry="8" fill="#1a2140" opacity=".45"/>' +
      '<path fill="#cfd8f5" d="M8 38a24 24 0 0 1 48 0v6a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"/>' +
      '<path fill="#8ea0cf" d="M8 38a24 24 0 0 1 48 0v3H8z"/>' +
      '<rect x="16" y="22" width="32" height="16" rx="8" fill="#2a3357"/>' +
      '<circle cx="26" cy="30" r="4" fill="#7ef0c0"/><circle cx="38" cy="30" r="4" fill="#ff6ba9"/>' +
      '<path stroke="#8ea0cf" stroke-width="3" stroke-linecap="round" d="M32 20V13"/><circle cx="32" cy="10" r="3" fill="#ffd45c"/>' +
      '<path stroke="#6f7fb0" stroke-width="4" stroke-linecap="round" d="M14 50h-5M50 50h5"/>',
    shard:
      '<path fill="' + FOLDER_FRONT + '" stroke="#a76d0c" stroke-width="2" d="M8 18L30 8l10 18-16 12z"/>' +
      '<path fill="' + FOLDER_LIGHT + '" d="M12 18l14-6 4 8-14 6z" opacity=".8"/>',
    cursor:
      '<path d="M10 6l34 24-14 2.4 7.6 15.4-7 3.4-7.6-15.6L10 44z" fill="#fff" stroke="#1c1c28" stroke-width="3.2" stroke-linejoin="round"/>',
    mouse:
      '<rect x="17" y="6" width="30" height="50" rx="15" fill="#f3f6ff" stroke="#8a94b8" stroke-width="3"/>' +
      '<path stroke="#8a94b8" stroke-width="3" d="M32 7v20M18 27h28"/>' +
      '<rect x="20" y="9" width="11" height="14" rx="5.5" fill="#5b7cfa"/>',
    mouseLeft:
      '<rect x="17" y="6" width="30" height="50" rx="15" fill="#f3f6ff" stroke="#8a94b8" stroke-width="3"/>' +
      '<path stroke="#8a94b8" stroke-width="3" d="M32 7v20M18 27h28"/>' +
      '<rect x="20" y="9" width="11" height="14" rx="5.5" fill="#ff6ba9"/>',
    mouseRight:
      '<rect x="17" y="6" width="30" height="50" rx="15" fill="#f3f6ff" stroke="#8a94b8" stroke-width="3"/>' +
      '<path stroke="#8a94b8" stroke-width="3" d="M32 7v20M18 27h28"/>' +
      '<rect x="33" y="9" width="11" height="14" rx="5.5" fill="#ff6ba9"/>',
    lightbulb:
      '<path fill="#ffd45c" stroke="#c98d0a" stroke-width="2.4" d="M32 6a17 17 0 0 1 10 30.6c-1.7 1.3-2.6 2.9-2.8 5.4H24.8c-.2-2.5-1.1-4.1-2.8-5.4A17 17 0 0 1 32 6z"/>' +
      '<path fill="none" stroke="#c98d0a" stroke-width="2.8" stroke-linecap="round" d="M25 43h14M26.5 50h11M30 55h4"/>' +
      '<path fill="none" stroke="#fff3b0" stroke-width="3" stroke-linecap="round" d="M25 19a9 9 0 0 1 7-5"/>',
    speakerOn:
      '<path fill="#e8eeff" d="M8 25h10l14-12v38L18 39H8z"/>' +
      '<path fill="none" stroke="#8fa2d6" stroke-width="4" stroke-linecap="round" d="M40 23a13 13 0 0 1 0 18M46 16a22 22 0 0 1 0 32"/>',
    speakerOff:
      '<path fill="#e8eeff" d="M8 25h10l14-12v38L18 39H8z"/>' +
      '<path fill="none" stroke="#ff6b8a" stroke-width="4" stroke-linecap="round" d="M40 24l14 16M54 24L40 40"/>',
    lock:
      '<path fill="#aebfe4" d="M18 28h28a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V33a5 5 0 0 1 5-5z"/>' +
      '<path fill="none" stroke="#8ea0cf" stroke-width="6" d="M22 28v-7a10 10 0 0 1 20 0v7"/>' +
      '<circle cx="32" cy="41" r="4" fill="#3d4a74"/><path stroke="#3d4a74" stroke-width="3" stroke-linecap="round" d="M32 44v5"/>',
    unlock:
      '<path fill="#aebfe4" d="M18 28h28a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V33a5 5 0 0 1 5-5z"/>' +
      '<path fill="none" stroke="#8ea0cf" stroke-width="6" d="M22 28v-7a10 10 0 0 1 19-4.4"/>' +
      '<circle cx="32" cy="41" r="4" fill="#3d4a74"/><path stroke="#3d4a74" stroke-width="3" stroke-linecap="round" d="M32 44v5"/>',
    error:
      '<circle cx="32" cy="32" r="26" fill="#ff5d7a"/><path stroke="#fff" stroke-width="6" stroke-linecap="round" d="M22 22l20 20M42 22L22 42"/>',
    warning:
      '<path fill="#ffc94d" stroke="#c98d0a" stroke-width="3" stroke-linejoin="round" d="M32 6L60 55H4z"/>' +
      '<path stroke="#5c3d00" stroke-width="5" stroke-linecap="round" d="M32 22v16"/><circle cx="32" cy="47" r="3.4" fill="#5c3d00"/>',
    check:
      '<circle cx="32" cy="32" r="26" fill="#34d399"/><path fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" d="M19 33l9 9 18-19"/>',
    star:
      '<path fill="#ffd45c" stroke="#c98d0a" stroke-width="2.6" stroke-linejoin="round" d="M32 5l8.3 17.2 18.7 2.5-13.7 13 3.5 18.6L32 47.4 15.2 56.3l3.5-18.6L5 24.7l18.7-2.5z"/>',
    sparkle:
      '<path fill="#fff3b0" d="M32 2l5.6 19.4L57 27l-19.4 5.6L32 52l-5.6-19.4L7 27l19.4-5.6z"/>' +
      '<path fill="#ffd45c" d="M50 38l2.6 8.4L61 49l-8.4 2.6L50 60l-2.6-8.4L39 49l8.4-2.6z"/>',
    key:
      '<circle cx="20" cy="42" r="11" fill="none" stroke="#aebfe4" stroke-width="6"/>' +
      '<path stroke="#aebfe4" stroke-width="6" stroke-linecap="round" d="M28 34l22-22M43 19l7 7M38 24l7 7"/>',
    enterKey:
      '<rect x="5" y="17" width="54" height="30" rx="7" fill="#eef2ff" stroke="#8ea0cf" stroke-width="3"/>' +
      '<path fill="none" stroke="#5b7cfa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M42 25v11H20m0 0l6-6m-6 6l6 6"/>',
    arrowUp: '<path fill="none" stroke="#eef2ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M32 52V14M14 32l18-18 18 18"/>',
    arrowDown: '<path fill="none" stroke="#eef2ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M32 12v38M14 32l18 18 18-18"/>',
    arrowRight: '<path fill="none" stroke="#eef2ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M12 32h38M32 14l18 18-18 18"/>',
    arrowLeft: '<path fill="none" stroke="#eef2ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M52 32H14M32 14L14 32l18 18"/>',
    restart:
      '<path fill="none" stroke="#eef2ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M14 32a18 18 0 1 0 5.3-12.7"/>' +
      '<path fill="#eef2ff" d="M6 10l16 6-14 11z"/>',
    heart:
      '<path fill="#ff6ba9" d="M32 56C16 44 5 34 5 22.5A12.5 12.5 0 0 1 30 15l2 3 2-3a12.5 12.5 0 0 1 25 7.5C59 34 48 44 32 56z"/>',
    cake:
      '<path fill="#ffb3c9" d="M8 32h48v18a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"/>' +
      '<path fill="#fff0f5" d="M8 32c4-6 8 0 12-2s8 2 12 0 8 2 12 0 8 4 12 2v7H8z"/>' +
      '<path fill="none" stroke="#ff6ba9" stroke-width="3" stroke-linecap="round" d="M18 24v-9M32 22v-10M46 24v-9"/>' +
      '<circle cx="18" cy="12" r="3" fill="#ffd45c"/><circle cx="32" cy="9" r="3" fill="#ffd45c"/><circle cx="46" cy="12" r="3" fill="#ffd45c"/>',
    cloud:
      '<path fill="#dbe7ff" d="M18 48a12 12 0 0 1-1-23.9A16 16 0 0 1 48 22a12 12 0 0 1 2 26z"/>',
    paperclip:
      '<path fill="none" stroke="#9fb4dd" stroke-width="7" stroke-linecap="round" d="M22 40V18a10 10 0 0 1 20 0v26a16 16 0 0 1-32 0V24"/>',
    bomb:
      '<circle cx="30" cy="38" r="18" fill="#3c4466"/><path stroke="#8ea0cf" stroke-width="4" stroke-linecap="round" d="M38 22l8-8M46 14l4-4"/>' +
      '<circle cx="52" cy="12" r="5" fill="#ffd45c"/>' +
      '<circle cx="23" cy="31" r="5" fill="#5d6a99" opacity=".7"/>',
    magnet:
      '<path fill="none" stroke="#ff5d7a" stroke-width="12" stroke-linecap="round" d="M16 42V28a16 16 0 0 1 32 0v14"/>' +
      '<path fill="#eef2ff" d="M10 42h12v12H10zM42 42h12v12H42z"/>',
    disk:
      '<rect x="8" y="8" width="48" height="48" rx="8" fill="#5b7cfa"/><rect x="20" y="10" width="24" height="18" rx="3" fill="#dfe7ff"/>' +
      '<rect x="38" y="13" width="4" height="10" fill="#5b7cfa"/><rect x="16" y="38" width="32" height="14" rx="3" fill="#dfe7ff"/>',
    grid:
      '<g fill="#aebfe4"><rect x="8" y="8" width="20" height="20" rx="5"/><rect x="36" y="8" width="20" height="20" rx="5"/><rect x="8" y="36" width="20" height="20" rx="5"/><rect x="36" y="36" width="20" height="20" rx="5"/></g>',
    menu:
      '<g stroke="#5b7cfa" stroke-width="6" stroke-linecap="round"><path d="M12 18h40M12 32h40M12 46h40"/></g>',
    eye:
      '<path fill="#eef2ff" d="M4 32s10-16 28-16 28 16 28 16-10 16-28 16S4 32 4 32z"/>' +
      '<circle cx="32" cy="32" r="10" fill="#5b7cfa"/><circle cx="35" cy="28" r="3.4" fill="#fff"/>'
  };

  /* 第四面墙 / 新关卡用图标 */
  Object.assign(paths, {
    code:
      '<rect x="4" y="9" width="56" height="46" rx="8" fill="#1b2140"/>' +
      '<path d="M25 24l-9 8 9 8M39 24l9 8-9 8" fill="none" stroke="#7ef0c0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M34 18l-4 28" stroke="#8ea0cf" stroke-width="3" stroke-linecap="round"/>',
    play:
      '<circle cx="32" cy="32" r="26" fill="#34d399"/>' +
      '<path fill="#ffffff" d="M26 20l20 12-20 12z"/>',
    window:
      '<rect x="5" y="10" width="54" height="44" rx="7" fill="#e8eeff"/>' +
      '<path fill="#5b7cfa" d="M5 17a7 7 0 0 1 7-7h40a7 7 0 0 1 7 7v5H5z"/>' +
      '<circle cx="13" cy="16" r="2.2" fill="#fff"/><circle cx="20" cy="16" r="2.2" fill="#fff"/>' +
      '<path fill="#c9d4ec" d="M12 30h26v4H12zm0 8h18v4H12z"/>',
    socket:
      '<rect x="10" y="8" width="44" height="48" rx="10" fill="#dfe7f8"/>' +
      '<circle cx="24" cy="28" r="5" fill="#3c4466"/><circle cx="40" cy="28" r="5" fill="#3c4466"/>' +
      '<path fill="#8ea0cf" d="M27 40h10v6a5 5 0 0 1-10 0z"/>',
    hourglass:
      '<path fill="#e8eeff" d="M14 6h36v6H14zM14 52h36v6H14z"/>' +
      '<path fill="#ffd45c" d="M18 12h28v6c0 8-10 12-10 14s10 6 10 14v6H18v-6c0-8 10-12 10-14s-10-6-10-14z"/>' +
      '<path fill="#8ea0cf" d="M18 12h28v2H18z"/>',
    bug:
      '<ellipse cx="32" cy="36" rx="14" ry="18" fill="#8a6cff"/>' +
      '<circle cx="32" cy="18" r="8" fill="#5b3fd0"/>' +
      '<path stroke="#5b3fd0" stroke-width="3" stroke-linecap="round" d="M18 30l-10-4M18 40l-11 2M18 50l-9 8M46 30l10-4M46 40l11 2M46 50l9 8M32 14V6"/>' +
      '<circle cx="27" cy="16" r="2.2" fill="#fff"/><circle cx="37" cy="16" r="2.2" fill="#fff"/>',
    eyeClosed:
      '<path fill="#eef2ff" d="M4 30s10-14 28-14 28 14 28 14-10 14-28 14S4 30 4 30z"/>' +
      '<path fill="none" stroke="#5b7cfa" stroke-width="5" stroke-linecap="round" d="M12 35c10 9 30 9 40 0"/>' +
      '<path stroke="#5b7cfa" stroke-width="3.5" stroke-linecap="round" d="M14 46l4-6M50 46l-4-6M32 52v-7"/>',
    hand:
      '<path fill="#ffd9b8" stroke="#c98d6a" stroke-width="2" d="M22 54V30a4 4 0 0 1 8 0V18a4 4 0 0 1 8 0v10a4 4 0 0 1 8 0v6a4 4 0 0 1 8 0v14a10 10 0 0 1-10 10H30a12 12 0 0 1-12-12V36"/>',
    crack:
      '<path fill="#171233" stroke="#ffd45c" stroke-width="3" stroke-linejoin="round" d="M32 3l5 14-9 6 10 7-8 8 12 6-9 9 10 8-4 15-4-14-9-8 8-9-11-6 7-8-9-8 9-6z"/>',
    tux:
      '<path fill="#5b7cfa" d="M6 14a6 6 0 0 1 6-6h16l6 7h18a6 6 0 0 1 6 6v4H6z"/>' +
      '<path fill="#8a6cff" d="M6 25h52v26a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z"/>' +
      '<path fill="#fff" opacity=".85" d="M24 34l6 6-6 6M34 46h10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
  });

  var ns = 'http://www.w3.org/2000/svg';
  var cache = Object.create(null);

  function svg(name, cls) {
    var body = paths[name];
    if (!body) body = paths.file;
    return '<svg class="nf-ico ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false" xmlns="' + ns + '">' + body + '</svg>';
  }

  function el(name, cls) {
    var span = document.createElement('span');
    span.className = 'nf-ico-wrap ' + (cls || '');
    span.innerHTML = svg(name, '');
    return span;
  }

  function fragment(name, cls) {
    var tpl = document.createElement('template');
    tpl.innerHTML = svg(name, cls);
    return tpl.content.firstChild;
  }

  NF.icons = {
    names: Object.keys(paths),
    svg: svg,
    el: el,
    fragment: fragment,
    folderFaceSvg: function (extra) { return svg('folderFace', extra || ''); }
  };
})();
