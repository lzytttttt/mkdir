/* NF.OS — 伪操作系统：右键菜单 / 对话框 / 窗口 / 桌面图标 / 拖拽 / Toast */
(function () {
  'use strict';
  window.NF = window.NF || {};
  var OS = {};
  NF.OS = OS;

  var doc = document;
  var menus = [];
  var dialogs = [];
  var windows = [];
  var toastLayer = null;
  var menuKeyBound = false;

  /* ---------------- 基础工具 ---------------- */

  OS.$ = function (sel, root) { return (root || doc).querySelector(sel); };
  OS.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  OS.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  OS.rand = function (a, b) { return a + Math.random() * (b - a); };
  OS.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  OS.on = function (target, ev, fn, opts) {
    target.addEventListener(ev, fn, opts);
    return function () { target.removeEventListener(ev, fn, opts); };
  };
  OS.raf = function (fn) {
    var id = 0, alive = true;
    function tick(t) { if (!alive) return; fn(t); id = requestAnimationFrame(tick); }
    id = requestAnimationFrame(tick);
    return function () { alive = false; cancelAnimationFrame(id); };
  };
  OS.sleep = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
  OS.rect = function (el) {
    if (!el) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    return el.getBoundingClientRect();
  };
  OS.center = function (el) {
    var r = OS.rect(el);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  };
  OS.pointOf = function (target) {
    if (!target) return { x: innerWidth / 2, y: innerHeight / 2 };
    if (typeof target === 'string') {
      var el = doc.querySelector(target);
      if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
      var c = OS.center(el);
      return { x: c.x, y: c.y, el: el };
    }
    if (target instanceof Element) { var c2 = OS.center(target); return { x: c2.x, y: c2.y, el: target }; }
    if (Array.isArray(target)) return { x: target[0], y: target[1] };
    if (typeof target === 'object' && target.x != null) return target;
    return { x: innerWidth / 2, y: innerHeight / 2 };
  };
  OS.isEditable = function (el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  OS.preventSelection = function () {
    doc.body.style.userSelect = 'none';
  };
  OS.restoreSelection = function () {
    doc.body.style.userSelect = '';
  };

  /* 键盘组合键匹配：'Ctrl+Shift+N' / 'Enter' / 'ArrowDown' / 'Esc' */
  OS.matchCombo = function (e, combo) {
    var parts = combo.split('+').map(function (s) { return s.trim().toLowerCase(); });
    var key = parts[parts.length - 1];
    var needCtrl = parts.indexOf('ctrl') >= 0;
    var needShift = parts.indexOf('shift') >= 0;
    var needAlt = parts.indexOf('alt') >= 0;
    var needMeta = parts.indexOf('meta') >= 0;
    if (!!e.ctrlKey !== needCtrl) return false;
    if (!!e.shiftKey !== needShift) return false;
    if (!!e.altKey !== needAlt) return false;
    if (!!e.metaKey !== needMeta) return false;
    var ek = (e.key || '').toLowerCase();
    var code = (e.code || '').toLowerCase();
    if (key === 'esc' || key === 'escape') return ek === 'escape';
    if (key === 'enter' || key === 'return') return ek === 'enter';
    if (key === 'space' || key === ' ') return ek === ' ' || ek === 'spacebar';
    if (key === 'del' || key === 'delete') return ek === 'delete';
    if (key === 'backspace') return ek === 'backspace';
    if (key.indexOf('arrow') === 0) return ek === key;
    if (key.length === 1) return ek === key || code === 'key' + key;
    return ek === key;
  };

  OS.pulse = function (el, cls, ms) {
    if (!el) return;
    cls = cls || 'wiggle';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, ms || 500);
  };

  /* ---------------- 初始化 ---------------- */

  OS.init = function () {
    OS.desktopEl = doc.getElementById('os') || doc.querySelector('[data-t="desktop"]');
    OS.levelRoot = doc.getElementById('level-root');
    OS.windowLayer = doc.getElementById('window-layer');
    OS.uiLayer = doc.getElementById('ui-layer');

    // 全局：屏蔽默认右键菜单（输入框放行）
    OS.on(doc, 'contextmenu', function (e) {
      if (OS.isEditable(e.target)) return;
      e.preventDefault();
    });

    // 全局：点到菜单外面就关闭
    OS.on(doc, 'pointerdown', function (e) {
      if (!menus.length) return;
      var t = e.target;
      if (t.closest && (t.closest('.nf-menu') || t.closest('[data-keep-menu]'))) return;
      OS.closeMenus();
    }, true);

    OS.on(window, 'blur', function () { OS.closeMenus(); });
    OS.on(window, 'resize', function () { OS.closeMenus(); });

    if (!toastLayer) {
      toastLayer = doc.createElement('div');
      toastLayer.id = 'toast-layer';
      doc.body.appendChild(toastLayer);
    }
  };

  /* ============================================================
     右键菜单
     ============================================================ */

  function makeCtrl(items, parent, isRoot, level, extraClass) {
    var ctrl = {
      items: items || [],
      itemEls: [],
      subs: [],
      parent: parent || null,
      isRoot: !!isRoot,
      selectedIndex: -1,
      open: !!isRoot,
      el: null,
      wrap: null,
      level: level,
      extraClass: extraClass || '',
      onClose: null
    };
    ctrl.setSelected = function (i, o) { setMenuSelected(ctrl, i, o); };
    ctrl.openSub = function (item) { return openSub(ctrl, item); };
    ctrl.scheduleCloseSub = function (item, ms) { scheduleCloseSub(ctrl, item, ms); };
    ctrl.focusFirstChild = function (sc) { focusFirst(sc); };
    ctrl.rootCtrl = function () {
      var c = ctrl;
      while (c.parent) c = c.parent;
      return c;
    };
    return ctrl;
  }

  function buildMenu(items, ctrl, level) {
    var menuEl = doc.createElement('div');
    menuEl.className = 'nf-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.dataset.t = ctrl.isRoot ? 'menu' : 'submenu';
    if (ctrl.isRoot) menuEl.setAttribute('data-level-menu', String(level));
    if (ctrl.extraClass) menuEl.classList.add(ctrl.extraClass);

    items.forEach(function (item) {
      if (item.separator) {
        var sep = doc.createElement('div');
        sep.className = 'nf-menu-sep';
        menuEl.appendChild(sep);
        return;
      }
      var el = doc.createElement('div');
      el.className = 'nf-menu-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : '');
      el.setAttribute('role', 'menuitem');
      el.dataset.id = item.id;
      el.dataset.t = item.testid || ('menu-item-' + item.id);
      el.style.setProperty('--mi-rot', (Math.random() * 2 - 1).toFixed(2) + 'deg');

      if (item.icon) {
        el.appendChild(NF.icons.el(item.icon));
      } else {
        var spacer = doc.createElement('span');
        spacer.className = 'mi-icon-spacer';
        spacer.style.width = '19px';
        el.appendChild(spacer);
      }

      var label = doc.createElement('span');
      label.className = 'mi-label';
      if (item.labelHtml) label.innerHTML = item.label;
      else label.textContent = item.label || '';
      el.appendChild(label);

      if (item.lockIcon) {
        var lock = NF.icons.el('lock', 'mi-lock');
        el.appendChild(lock);
      }
      if (item.shortcut) {
        var sc = doc.createElement('span');
        sc.className = 'mi-shortcut';
        sc.textContent = item.shortcut;
        el.appendChild(sc);
      }
      if (item.submenu && item.submenu.length) {
        var arrow = doc.createElement('span');
        arrow.className = 'mi-arrow';
        arrow.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        el.appendChild(arrow);
      }

      var subCtrl = null;
      if (item.submenu && item.submenu.length) {
        var subWrap = doc.createElement('div');
        subWrap.className = 'nf-submenu';
        el.appendChild(subWrap);
        subCtrl = makeCtrl(item.submenu, ctrl, false, level, '');
        subCtrl.wrap = subWrap;
        subCtrl.item = item;
        ctrl.subs.push(subCtrl);
        buildMenuInto(subWrap, item.submenu, subCtrl, level);
      }

      el.addEventListener('mouseenter', function () {
        if (item.disabled) return;
        ctrl.setSelected(indexOfItem(ctrl, item), { silent: true });
        ctrl.openSub(item);
        if (item.onHover) item.onHover(ctrl, item);
        if (!item.dodge) NF.Audio.play('hover', { volume: 0.35 });
      });
      el.addEventListener('mouseleave', function () {
        if (!item.submenu) {
          // 子菜单延迟收起，允许鼠标移入
          ctrl.scheduleCloseSub(item, 260);
        }
      });
      el.addEventListener('click', function (e) {
        // 只处理属于自己这一层菜单的点击；嵌套子菜单里的点击交给子菜单
        var targetMenu = e.target && e.target.closest ? e.target.closest('.nf-menu') : null;
        if (targetMenu !== menuEl) return;
        if (item.disabled) { NF.Audio.play('deny'); return; }
        if (item.dodge) {
          // 逃跑项在被点中时依旧可以触发（运气/键盘）
        }
        if (item.submenu) {
          var openNow = ctrl.openSub(item);
          if (openNow) {
            NF.Audio.play('open', { volume: 0.4 });
            ctrl.focusFirstChild(subCtrl);
          }
          return;
        }
        NF.Audio.play('click');
        OS.pulse(el, 'wiggle', 240);
        if (item.onSelect) item.onSelect(ctrl, item);
        if (!item.keepOpen) OS.closeMenus();
      });

      if (item.dodge) setupDodge(el, item, ctrl);
      ctrl.itemEls.push({ item: item, el: el, subCtrl: subCtrl || null });
      menuEl.appendChild(el);
    });
    return menuEl;
  }

  function buildMenuInto(container, items, ctrl, level) {
    var el = buildMenu(items, ctrl, level);
    ctrl.el = el;
    container.appendChild(el);
  }

  OS.menu = function (opts) {
    opts = opts || {};
    var level = opts.level;
    var ctrl = makeCtrl(opts.items || [], null, true, level, opts.className || '');
    ctrl.onClose = opts.onClose || null;

    var rootWrap = doc.createElement('div');
    rootWrap.style.position = 'absolute';
    rootWrap.style.left = '0px';
    rootWrap.style.top = '0px';
    if (opts.testid) rootWrap.dataset.t = opts.testid;

    var menuEl = buildMenu(ctrl.items, ctrl, level);
    ctrl.el = menuEl;
    rootWrap.appendChild(menuEl);
    (OS.uiLayer || doc.body).appendChild(rootWrap);
    ctrl.wrap = rootWrap;

    // 定位 + 边界翻转
    var vw = innerWidth, vh = innerHeight;
    var w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    var x = OS.clamp(opts.x != null ? opts.x : (vw / 2 - w / 2), 8, vw - w - 8);
    var y = OS.clamp(opts.y != null ? opts.y : (vh / 2 - h / 2), 8, vh - 68 - h - 8);
    var flipX = (opts.x != null && opts.x + w + 210 > vw);
    var flipY = (opts.y != null && opts.y + h > vh - 64);
    rootWrap.style.left = x + 'px';
    rootWrap.style.top = y + 'px';
    if (flipX) { menuEl.classList.add('flip-right', 'nf-menu-flip-x'); }
    if (flipY) menuEl.classList.add('nf-menu-flip-y');

    ctrl.close = function () { closeMenuCtrl(ctrl); };
    ctrl.openSub = function (item) { return openSub(ctrl, item); };

    menus.push(ctrl);

    // 让菜单外框能收到键盘事件
    menuEl.tabIndex = -1;
    if (!OS.userNavigating) menuEl.focus({ preventScroll: true });
    bindMenuKeys();
    NF.Audio.play('open', { volume: 0.5 });

    // 让打开菜单的那一次右键不要立刻触发"点外面关闭"：用 macro task 延迟绑定
    setTimeout(function () { ctrl.ready = true; }, 0);

    return ctrl;
  };

  function setMenuSelected(ctrl, index, opts) {
    if (!ctrl) return;
    opts = opts || {};
    ctrl.selectedIndex = index;
    ctrl.itemEls.forEach(function (rec, i) {
      rec.el.classList.toggle('sel', i === index);
    });
    if (index >= 0 && ctrl.itemEls[index] && !opts.silent) {
      var rec = ctrl.itemEls[index];
      if (!rec.item.disabled && !rec.item.dodge) NF.Audio.play('hover', { volume: 0.3 });
    }
  }

  function indexOfItem(ctrl, item) {
    for (var i = 0; i < ctrl.itemEls.length; i++) {
      if (ctrl.itemEls[i].item === item) return i;
    }
    return -1;
  }

  function enabledIndices(ctrl) {
    var out = [];
    ctrl.itemEls.forEach(function (rec, i) { if (!rec.item.disabled) out.push(i); });
    return out;
  }

  function moveSelection(ctrl, dir) {
    var idxs = enabledIndices(ctrl);
    if (!idxs.length) return;
    var pos = idxs.indexOf(ctrl.selectedIndex);
    var next;
    if (pos < 0) next = idxs[dir > 0 ? 0 : idxs.length - 1];
    else next = idxs[(pos + dir + idxs.length) % idxs.length];
    setMenuSelected(ctrl, next);
    var rec = ctrl.itemEls[next];
    // 收起其它子菜单
    ctrl.subs.forEach(function (sc) { if (sc !== rec.subCtrl) hideSub(sc); });
    if (rec.subCtrl) openSub(ctrl, rec.item);
  }

  function focusFirst(ctrl) {
    if (!ctrl) return;
    var idxs = enabledIndices(ctrl);
    if (!idxs.length) return;
    setMenuSelected(ctrl, idxs[0], { silent: true });
  }

  function openSub(ctrl, item) {
    if (!item || !item.submenu) return false;
    var rec = null;
    ctrl.itemEls.forEach(function (r) { if (r.item === item) rec = r; });
    if (!rec) return false;
    if (!rec.subCtrl) return false;
    // 关闭其它子菜单
    ctrl.subs.forEach(function (sc) { if (sc !== rec.subCtrl) hideSub(sc); });
    clearTimeout(rec.subCtrl._hideTimer);
    if (!rec.subCtrl.open) {
      rec.subCtrl.open = true;
      rec.subCtrl.wrap.classList.add('open');
      NF.Audio.play('open', { volume: 0.3 });
    }
    return true;
  }

  function hideSub(sc) {
    if (!sc) return;
    sc.open = false;
    sc.wrap.classList.remove('open');
    sc.subs.forEach(hideSub);
    if (sc.selectedIndex >= 0) setMenuSelected(sc, -1);
  }

  function scheduleCloseSub(ctrl, item, ms) {
    var rec = null;
    ctrl.itemEls.forEach(function (r) { if (r.item === item) rec = r; });
    if (!rec || !rec.subCtrl) return;
    clearTimeout(rec.subCtrl._hideTimer);
    rec.subCtrl._hideTimer = setTimeout(function () {
      if (rec.el.matches(':hover')) return;
      hideSub(rec.subCtrl);
    }, ms);
  }

  function closeMenuCtrl(ctrl) {
    if (!ctrl) return;
    clearTimeout(ctrl._hideTimer);
    ctrl.subs.forEach(function (sc) {
      clearTimeout(sc._hideTimer);
      if (sc.el && sc.el.parentNode) sc.el.parentNode.classList.remove('open');
    });
    if (ctrl.wrap && ctrl.wrap.parentNode) ctrl.wrap.remove();
    ctrl.open = false;
    ctrl.ready = false;
    menus = menus.filter(function (m) { return m !== ctrl; });
    if (!menus.length && menuKeyBound) {
      doc.removeEventListener('keydown', onMenuKey, true);
      menuKeyBound = false;
    }
  }

  OS.closeMenus = function (reason) {
    if (menus.length) OS.lastMenuCloseTime = performance.now();
    menus.slice().forEach(function (ctrl) {
      if (ctrl.onClose) ctrl.onClose(reason || 'close');
      closeMenuCtrl(ctrl);
    });
    menus.length = 0;
  };
  OS.hasOpenMenu = function () { return menus.length > 0; };
  OS.rootMenu = function () { return menus[0] || null; };

  function bindMenuKeys() {
    if (menuKeyBound) return;
    menuKeyBound = true;
    doc.addEventListener('keydown', onMenuKey, true);
  }

  function topMenu() {
    var ctrl = menus[menus.length - 1];
    while (ctrl && ctrl.subs) {
      var deeper = null;
      ctrl.subs.forEach(function (sc) { if (sc.open && sc.el && sc.el.offsetParent) deeper = sc; });
      if (!deeper) break;
      ctrl = deeper;
    }
    return ctrl;
  }

  function onMenuKey(e) {
    var root = menus[menus.length - 1];
    if (!root) return;
    if (OS.isEditable(e.target)) return;
    var cur = topMenu() || root;
    var key = e.key;
    if (key === 'ArrowDown') { e.preventDefault(); moveSelection(cur, 1); return; }
    if (key === 'ArrowUp') { e.preventDefault(); moveSelection(cur, -1); return; }
    if (key === 'Enter') {
      if (cur.selectedIndex < 0) { e.preventDefault(); moveSelection(cur, 1); return; }
      var rec = cur.itemEls[cur.selectedIndex];
      if (!rec || rec.item.disabled) return;
      e.preventDefault();
      if (rec.item.submenu) {
        openSub(cur, rec.item);
        focusFirst(rec.subCtrl);
        return;
      }
      NF.Audio.play('click');
      if (rec.item.onSelect) rec.item.onSelect(cur, rec.item);
      if (!rec.item.keepOpen) OS.closeMenus();
      return;
    }
    if (key === 'ArrowRight') {
      if (cur.selectedIndex < 0) { e.preventDefault(); moveSelection(cur, 1); return; }
      var recR = cur.itemEls[cur.selectedIndex];
      if (recR && recR.item.submenu) {
        e.preventDefault();
        openSub(cur, recR.item);
        focusFirst(recR.subCtrl);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      if (cur !== root) {
        e.preventDefault();
        hideSub(cur);
        setMenuSelected(cur.parent, cur.parent.selectedIndex);
      }
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (cur !== root) { hideSub(cur); return; }
      OS.closeMenus();
      return;
    }
    // 键盘意外按键：逃跑菜单会嘲笑
    if (root._onStrayKey) root._onStrayKey(e);
  }

  /* 会逃跑的菜单项 —— 鼠标永远追不上，但键盘可以选 */
  function setupDodge(itemEl, item, ctrl) {
    var last = 0;
    var ox = 0, oy = 0;
    ctrl._dodgeLocked = ctrl._dodgeLocked || false;
    itemEl.classList.add('dodge-active');
    itemEl.addEventListener('pointermove', function (e) {
      if (ctrl._dodgeLocked) return;
      if (item._dodgeOff) return;
      var now = performance.now();
      if (now - last < 90) return;
      last = now;
      var r = itemEl.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = cx - e.clientX, dy = cy - e.clientY;
      var dist = Math.hypot(dx, dy);
      if (dist > Math.max(130, r.width * 0.85)) return;
      var ang = Math.atan2(dy, dx) + (Math.random() * 0.9 - 0.45);
      var step = OS.rand(34, 58);
      ox = OS.clamp(ox + Math.cos(ang) * step, -90, 90);
      oy = OS.clamp(oy + Math.sin(ang) * step, -34, 34);
      itemEl.style.transition = 'transform .26s cubic-bezier(.22,.8,.3,1)';
      itemEl.style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px) rotate(' + ((Math.random() * 2 - 1) * 2.2).toFixed(1) + 'deg)';
      if (item.onDodge) item.onDodge(ctrl, item);
      if (!ctrl._lastDodgeSound || now - ctrl._lastDodgeSound > 320) {
        ctrl._lastDodgeSound = now;
        NF.Audio.play('dodge', { volume: 0.65 });
      }
    });
  }

  /* ============================================================
     对话框
     ============================================================ */

  OS.dialog = function (opts) {
    opts = opts || {};
    var backdrop = doc.createElement('div');
    backdrop.className = 'nf-backdrop';
    if (opts.modal === false) backdrop.style.background = 'transparent';
    var el = doc.createElement('div');
    el.className = 'nf-dialog ' + (opts.className || '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.dataset.t = opts.testid || 'dialog';

    var title = doc.createElement('div');
    title.className = 'nf-dialog-title';
    if (opts.icon) title.appendChild(NF.icons.el(opts.icon));
    var titleText = doc.createElement('span');
    titleText.className = 'd-title-text';
    titleText.textContent = opts.title || '';
    title.appendChild(titleText);
    if (opts.titleExtra) title.appendChild(opts.titleExtra);
    el.appendChild(title);

    var body = doc.createElement('div');
    body.className = 'nf-dialog-body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body instanceof Node) body.appendChild(opts.body);
    el.appendChild(body);

    var buttonsWrap = doc.createElement('div');
    buttonsWrap.className = 'nf-dialog-buttons';
    el.appendChild(buttonsWrap);

    (OS.uiLayer || doc.body).appendChild(backdrop);
    (OS.uiLayer || doc.body).appendChild(el);

    var dlg = {
      el: el, body: body, backdrop: backdrop, buttons: {}, closed: false,
      opts: opts, _onClose: opts.onClose || null
    };

    function dismiss(how) {
      if (dlg.closed) return;
      dlg.closed = true;
      if (dlg._onClose) dlg._onClose(how);
      el.style.transition = 'opacity .16s ease, transform .16s ease';
      backdrop.style.transition = 'opacity .16s ease';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(.94)';
      backdrop.style.opacity = '0';
      setTimeout(function () {
        el.remove();
        backdrop.remove();
        dialogs = dialogs.filter(function (d) { return d !== dlg; });
      }, 180);
    }
    dlg.close = dismiss;
    dlg.shake = function () { OS.pulse(el, 'is-shaking', 420); NF.Audio.play('error', { volume: 0.7 }); };
    dlg.focus = function () {
      var f = el.querySelector('[autofocus], input, button.primary, button');
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    };

    (opts.buttons || []).forEach(function (b) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'nf-btn ' + (b.kind || '');
      btn.textContent = b.label || '';
      btn.dataset.t = b.testid || ('dialog-' + (b.id || 'btn'));
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', function (e) {
        if (dlg.closed) return;
        if (btn.disabled) { NF.Audio.play('deny'); return; }
        NF.Audio.play('click');
        if (b.onClick) {
          var r = b.onClick(dlg, e);
          if (r === false) return;
        }
        if (b.close !== false && !dlg._stayOpen) dismiss('button:' + (b.id || ''));
      });
      if (b.dodge) setupButtonDodge(btn);
      dlg.buttons[b.id || ('btn' + Object.keys(dlg.buttons).length)] = btn;
      buttonsWrap.appendChild(btn);
    });

    // Esc = 关闭（或触发 cancel 按钮）
    var onKey = function (e) {
      if (dlg.closed) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        var cancelBtn = el.querySelector('[data-t="dialog-cancel"]');
        if (cancelBtn) cancelBtn.click();
        else dismiss('escape');
        return;
      }
      if (e.key === 'Enter' && !OS.isEditable(e.target)) {
        var primary = el.querySelector('.nf-btn.primary') || el.querySelector('[data-t="dialog-ok"]');
        if (primary && !primary.disabled) {
          e.preventDefault();
          primary.click();
        }
      }
    };
    var offKey = OS.on(doc, 'keydown', onKey, true);
    var offBackdrop = OS.on(backdrop, 'pointerdown', function () {
      if (opts.backdropClose) dismiss('backdrop');
    });
    dlg._detach = function () { offKey(); offBackdrop(); };

    dialogs.push(dlg);
    setTimeout(function () { if (!dlg.closed && opts.autoFocus !== false) dlg.focus(); }, 60);
    return dlg;
  };

  function setupButtonDodge(btn) {
    var last = 0, ox = 0, oy = 0;
    btn.style.position = 'relative';
    btn.addEventListener('pointermove', function (e) {
      if (btn._dodgeOff) return;
      var now = performance.now();
      if (now - last < 80) return;
      var r = btn.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = cx - e.clientX, dy = cy - e.clientY;
      if (Math.hypot(dx, dy) > 110) return;
      last = now;
      var ang = Math.atan2(dy, dx) + (Math.random() * 0.8 - 0.4);
      ox = OS.clamp(ox + Math.cos(ang) * OS.rand(24, 42), -90, 90);
      oy = OS.clamp(oy + Math.sin(ang) * OS.rand(10, 22), -46, 46);
      btn.style.transition = 'transform .22s cubic-bezier(.22,.8,.3,1)';
      btn.style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)';
      NF.Audio.play('dodge', { volume: 0.5 });
    });
  }

  OS.nameDialog = function (opts) {
    opts = opts || {};
    var wrap = doc.createElement('div');
    var input = doc.createElement('input');
    input.className = 'nf-field';
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.dataset.t = opts.inputTestid || 'name-input';
    input.value = opts.value != null ? opts.value : '新建文件夹';
    wrap.appendChild(input);
    if (opts.helperIcon) {
      var helper = doc.createElement('div');
      helper.className = 'nf-helper';
      helper.appendChild(NF.icons.el(opts.helperIcon));
      var ht = doc.createElement('span');
      ht.textContent = opts.helperText || '';
      helper.appendChild(ht);
      wrap.appendChild(helper);
    }

    var ctrl;
    var buttons = [
      { id: 'cancel', label: opts.cancelLabel || '取消', kind: 'default', testid: opts.cancelTestid || 'dialog-cancel',
        onClick: function (d) { if (opts.onCancel) opts.onCancel(d); } },
      { id: 'ok', label: opts.okLabel || '确定', kind: 'primary', testid: opts.okTestid || 'dialog-ok', autoFocus: true,
        onClick: function (d) {
          var val = input.value;
          if (opts.onSubmit) {
            var r = opts.onSubmit(val, d);
            if (r === false) return false;
          }
          return true;
        } }
    ];
    if (opts.okDodge) buttons[1].dodge = true;
    if (opts.okDisabled) buttons[1].disabled = true;
    var dlg = OS.dialog({
      title: opts.title || '新建文件夹',
      icon: opts.icon || 'folder',
      body: wrap,
      buttons: buttons,
      testid: opts.testid || 'name-dialog',
      className: opts.className || '',
      onClose: opts.onClose || null,
      autoFocus: false
    });
    ctrl = dlg;
    ctrl.input = input;
    ctrl.okBtn = dlg.buttons.ok;
    ctrl.setOkEnabled = function (v) {
      ctrl.okBtn.disabled = !v;
      if (v) {
        ctrl.okBtn.classList.add('is-ready');
        ctrl.okBtn.style.transition = 'transform .2s ease, box-shadow .2s ease';
      }
    };
    ctrl.setOkDodge = function (on) { ctrl.okBtn.dodgeOn = !!on; };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!ctrl.okBtn.disabled) ctrl.okBtn.click();
        else { dlg.shake(); NF.Audio.play('deny'); }
      }
    });
    setTimeout(function () {
      try {
        input.focus({ preventScroll: true });
        if (opts.selectAll === false) {
          var pos = opts.caretAtEnd ? input.value.length : 0;
          input.setSelectionRange(pos, pos);
        } else {
          input.select();
        }
      } catch (err) {}
    }, 90);
    return ctrl;
  };

  OS.closeDialogs = function () {
    dialogs.slice().forEach(function (d) {
      if (d._detach) d._detach();
      d.close('force');
    });
    dialogs = [];
  };

  /* ============================================================
     窗口
     ============================================================ */

  OS.window = function (opts) {
    opts = opts || {};
    var el = doc.createElement('div');
    el.className = 'nf-window ' + (opts.className || '');
    el.dataset.t = opts.testid || 'window';
    var w = opts.w || 480, h = opts.h || 320;
    var x = opts.x != null ? opts.x : (innerWidth - w) / 2;
    var y = opts.y != null ? opts.y : (innerHeight - 60 - h) / 2;
    x = OS.clamp(x, 8, innerWidth - Math.min(w, innerWidth - 16) - 8);
    y = OS.clamp(y, 8, innerHeight - 64 - Math.min(h, innerHeight - 80) - 8);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = Math.min(w, innerWidth - 16) + 'px';
    el.style.height = Math.min(h, innerHeight - 80) + 'px';

    var bar = doc.createElement('div');
    bar.className = 'nf-win-titlebar';
    if (opts.icon) bar.appendChild(NF.icons.el(opts.icon));
    var t = doc.createElement('div');
    t.className = 'nf-win-title';
    t.textContent = opts.title || '';
    bar.appendChild(t);
    if (opts.closable !== false) {
      var closeBtn = doc.createElement('button');
      closeBtn.className = 'nf-win-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', '关闭');
      closeBtn.innerHTML = '&#10005;';
      closeBtn.dataset.t = 'window-close';
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        NF.Audio.play('close');
        win.close();
      });
      bar.appendChild(closeBtn);
    }
    el.appendChild(bar);

    var body = doc.createElement('div');
    body.className = 'nf-win-body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body instanceof Node) body.appendChild(opts.body);
    el.appendChild(body);
    (OS.windowLayer || doc.body).appendChild(el);

    var win = {
      el: el, body: body, closed: false,
      close: function () {
        if (win.closed) return;
        win.closed = true;
        if (opts.onClose) opts.onClose();
        el.style.transition = 'opacity .16s ease, transform .16s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(.96) translateY(6px)';
        setTimeout(function () { el.remove(); windows = windows.filter(function (x2) { return x2 !== win; }); }, 180);
      },
      focus: function () { focusWindow(win); },
      shake: function () { OS.pulse(el, 'wiggle', 420); NF.Audio.play('error', { volume: 0.6 }); }
    };

    // 拖动标题栏
    var drag = null;
    OS.on(bar, 'pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.nf-win-close')) return;
      drag = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop, pid: e.pointerId };
      bar.setPointerCapture(e.pointerId);
      focusWindow(win);
    });
    OS.on(bar, 'pointermove', function (e) {
      if (!drag) return;
      var nx = drag.left + e.clientX - drag.x;
      var ny = drag.top + e.clientY - drag.y;
      nx = OS.clamp(nx, -el.offsetWidth + 80, innerWidth - 80);
      ny = OS.clamp(ny, 0, innerHeight - 70);
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    });
    OS.on(bar, 'pointerup', function (e) { if (drag) { drag = null; try { bar.releasePointerCapture(e.pointerId); } catch (err) {} } });
    OS.on(el, 'pointerdown', function () { focusWindow(win); });

    windows.push(win);
    focusWindow(win);
    return win;
  };

  function focusWindow(win) {
    windows.forEach(function (w) { w.el.classList.toggle('is-active', w === win); });
    windows = windows.filter(function (w) { return w !== win; });
    windows.push(win);
    windows.forEach(function (w, i) { w.el.style.zIndex = String(32 + i); });
  }

  OS.closeWindows = function () {
    windows.slice().forEach(function (w) { if (w.close) w.close(); });
    windows = [];
  };

  /* ============================================================
     桌面图标
     ============================================================ */

  OS.icon = function (opts) {
    opts = opts || {};
    var el = doc.createElement('div');
    el.className = 'd-icon nf-os-icon ' + (opts.className || '');
    el.dataset.t = opts.testid || 'desktop-icon';
    el.style.position = 'absolute';
    el.style.left = (opts.x != null ? opts.x : 40) + 'px';
    el.style.top = (opts.y != null ? opts.y : 40) + 'px';
    el.style.width = (opts.size || 96) + 'px';
    el.style.minHeight = '0';
    el.style.cursor = 'default';
    if (opts.icon instanceof Node) {
      var wrap = doc.createElement('span');
      wrap.className = 'nf-ico-wrap';
      wrap.appendChild(opts.icon);
      el.appendChild(wrap);
    } else {
      el.appendChild(NF.icons.el(opts.icon || 'folder'));
    }
    if (opts.badge) {
      var b = doc.createElement('span');
      b.className = 'd-badge';
      b.textContent = String(opts.badge);
      el.appendChild(b);
    }
    if (opts.label) {
      var label = doc.createElement('div');
      label.className = 'd-label';
      label.textContent = opts.label;
      el.appendChild(label);
    }
    if (opts.locked) el.classList.add('is-locked');

    var clickTimer = 0;
    OS.on(el, 'pointerdown', function (e) {
      if (e.button === 0 && !opts.noSelect) {
        OS.$$('.d-icon.is-selected').forEach(function (i) { i.classList.remove('is-selected'); });
        el.classList.add('is-selected');
      }
    });
    if (opts.onClick) {
      OS.on(el, 'click', function (e) {
        if (e.detail > 1) return;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () { opts.onClick(e); }, 30);
      });
    }
    if (opts.onDblClick) {
      OS.on(el, 'dblclick', function (e) {
        clearTimeout(clickTimer);
        NF.Audio.play('open');
        opts.onDblClick(e);
      });
    }
    if (opts.onContextMenu) {
      OS.on(el, 'contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        opts.onContextMenu(e);
      });
    }
    var parent = opts.parent || OS.levelRoot || doc.body;
    parent.appendChild(el);
    return {
      el: el,
      remove: function () { el.remove(); },
      setLabel: function (s) { var l = el.querySelector('.d-label'); if (l) l.textContent = s; },
      setBadge: function (v) {
        var b = el.querySelector('.d-badge');
        if (!b) { b = doc.createElement('span'); b.className = 'd-badge'; el.appendChild(b); }
        b.textContent = String(v);
      }
    };
  };

  /* ============================================================
     拖拽
     ============================================================ */

  OS.makeDraggable = function (el, opts) {
    opts = opts || {};
    var threshold = opts.threshold != null ? opts.threshold : 4;
    var state = null;
    var handle = { el: el, locked: false, destroy: function () {} };

    function onDown(e) {
      if (handle.locked) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (opts.canStart && !opts.canStart(e)) return;
      state = {
        sx: e.clientX, sy: e.clientY, dx: 0, dy: 0,
        pid: e.pointerId, started: false, target: e.target
      };
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      e.stopPropagation();
    }
    function onMove(e) {
      if (!state) return;
      e.preventDefault();
      state.dx = e.clientX - state.sx;
      state.dy = e.clientY - state.sy;
      if (!state.started) {
        if (Math.hypot(state.dx, state.dy) < threshold) return;
        state.started = true;
        el.classList.add('dragging');
        OS.preventSelection();
        NF.Audio.play('paper', { volume: 0.55 });
        if (opts.onStart) opts.onStart(e, state);
      }
      if (opts.onMove) opts.onMove(e, state);
      else el.style.transform = 'translate(' + state.dx + 'px,' + state.dy + 'px)';
    }
    function onUp(e) {
      if (!state) return;
      var wasStarted = state.started;
      var st = state;
      state = null;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      el.classList.remove('dragging');
      OS.restoreSelection();
      if (wasStarted) {
        if (opts.snapBack) {
          el.classList.add('is-settling');
          el.style.transform = '';
          setTimeout(function () { el.classList.remove('is-settling'); }, 340);
        }
        if (opts.onEnd) opts.onEnd(e, st);
      } else if (opts.onTap) {
        opts.onTap(e);
      }
    }
    var offs = [
      OS.on(el, 'pointerdown', onDown),
      OS.on(el, 'pointermove', onMove),
      OS.on(el, 'pointerup', onUp),
      OS.on(el, 'pointercancel', onUp)
    ];
    el.classList.add('nf-draggable');
    handle.destroy = function () { offs.forEach(function (f) { f(); }); };
    handle.setState = function (s) { handle.locked = !!s; };
    return handle;
  };

  /* 把 transform 拖拽结果提交成 left/top 绝对定位 */
  OS.commitDrag = function (el, dx, dy, opts) {
    opts = opts || {};
    var baseLeft = parseFloat(el.dataset.baseLeft || el.style.left) || 0;
    var baseTop = parseFloat(el.dataset.baseTop || el.style.top) || 0;
    if (!el.dataset.baseLeft) el.dataset.baseLeft = String(baseLeft);
    if (!el.dataset.baseTop) el.dataset.baseTop = String(baseTop);
    var nx = baseLeft + dx, ny = baseTop + dy;
    nx = OS.clamp(nx, -40, (OS.levelRoot ? OS.levelRoot.clientWidth : innerWidth) - 50);
    ny = OS.clamp(ny, -20, (OS.levelRoot ? OS.levelRoot.clientHeight : innerHeight) - 60);
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    el.style.transform = '';
    el.dataset.baseLeft = String(nx);
    el.dataset.baseTop = String(ny);
    return { left: nx, top: ny };
  };

  OS.dragOffsetToElement = function (draggedEl, targetEl) {
    var a = OS.center(draggedEl), b = OS.center(targetEl);
    return { dx: b.x - a.x, dy: b.y - a.y, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  };

  OS.overlapRatio = function (a, b) {
    var ra = OS.rect(a), rb = OS.rect(b);
    var x = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
    var y = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
    var inter = x * y;
    if (!inter) return 0;
    return inter / Math.min(ra.width * ra.height || 1, rb.width * rb.height || 1);
  };

  /* ============================================================
     Toast
     ============================================================ */

  OS.toast = function (opts) {
    opts = opts || {};
    if (!toastLayer) {
      toastLayer = doc.createElement('div');
      toastLayer.id = 'toast-layer';
      doc.body.appendChild(toastLayer);
    }
    var el = doc.createElement('div');
    el.className = 'nf-toast kind-' + (opts.kind || 'info');
    el.dataset.t = opts.testid || 'toast';
    if (opts.icon) el.appendChild(NF.icons.el(opts.icon));
    var txt = doc.createElement('div');
    txt.className = 'toast-text';
    var t = doc.createElement('div');
    t.className = 'toast-title';
    t.textContent = opts.title || '';
    txt.appendChild(t);
    if (opts.msg) {
      var m = doc.createElement('div');
      m.className = 'toast-msg';
      m.textContent = opts.msg;
      txt.appendChild(m);
    }
    el.appendChild(txt);
    toastLayer.appendChild(el);
    while (toastLayer.children.length > 3) toastLayer.firstElementChild.remove();
    var ms = opts.ms != null ? opts.ms : 2600;
    var timer = setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 280);
    }, ms);
    el.addEventListener('click', function () { clearTimeout(timer); el.remove(); });
    return { el: el, remove: function () { clearTimeout(timer); el.remove(); } };
  };

  /* ============================================================
     杂项
     ============================================================ */

  OS.clearLevelUI = function () {
    OS.closeMenus();
    OS.closeDialogs();
    OS.closeWindows();
    if (OS.uiLayer) OS.uiLayer.querySelectorAll('.nf-backdrop').forEach(function (n) { n.remove(); });
  };

  OS.spawnDesktopFolder = function (opts) {
    opts = opts || {};
    var el = doc.createElement('div');
    el.className = 'nf-folder nf-created';
    el.dataset.t = opts.testid || 'created-folder';
    el.style.left = (opts.x != null ? opts.x : 200) + 'px';
    el.style.top = (opts.y != null ? opts.y : 200) + 'px';
    var iconWrap = document.createElement('div');
    iconWrap.className = 'nf-folder-icon';
    iconWrap.innerHTML = NF.icons.svg(opts.icon || 'folder');
    el.appendChild(iconWrap);
    if (opts.label) {
      var lab = document.createElement('div');
      lab.className = 'nf-folder-label';
      lab.textContent = opts.label;
      el.appendChild(lab);
    }
    var parent = opts.parent || OS.levelRoot || doc.body;
    parent.appendChild(el);
    setTimeout(function () { NF.FX.dust(OS.center(el).x, OS.center(el).y); }, 80);
    return el;
  };

  OS.setIconLayerDim = function (dim) {
    var layer = doc.getElementById('desktop-icons');
    if (layer) layer.classList.toggle('is-dim', !!dim);
  };

  OS.isReducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
})();
