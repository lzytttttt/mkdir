/* 第 4 关：命名地狱 —— 输入框被塞爆，确定键还会躲鼠标 */
(function () {
  'use strict';
  var ID = 4;
  var OS = NF.OS;

  NF.Game.registerLevel({
    id: ID,
    icon: 'fileText',
    init: function (ctx) {
      var created = false;
      var dlg = null;

      ctx.style([
        '.nf-btn.is-ready{box-shadow:0 0 0 4px rgba(91,124,250,.22),0 6px 18px rgba(70,105,245,.45);}',
        '.lv4-dialog .nf-helper span{transition:color .2s ease;}',
        '.lv4-dialog .nf-helper.is-ok span{color:#1f9e6e;}',
        '.lv4-spark{position:absolute;pointer-events:none;font-size:22px;}'
      ].join(''));

      var helpIcon = null;

      function prankValue() {
        var s = '';
        for (var i = 0; i < 140; i++) s += '新建文件夹';
        return s;
      }

      function openDialog() {
        if (created || dlg) return;
        OS.closeMenus();
        dlg = OS.nameDialog({
          title: '新建文件夹',
          icon: 'folder',
          value: prankValue(),
          selectAll: false,
          caretAtEnd: true,
          okDisabled: true,
          okDodge: true,
          helperIcon: 'warning',
          helperText: '名称过长',
          className: 'lv4-dialog',
          onSubmit: function (name) {
            var v = String(name || '').trim();
            if (!v || v.length > 24) {
              dlg.shake();
              NF.Audio.play('deny');
              return false;
            }
            dlg = null;
            createFolder(v);
            return true;
          },
          onClose: function () { dlg = null; }
        });

        var input = dlg.input;
        var okBtn = dlg.okBtn;
        var helper = dlg.body.querySelector('.nf-helper');
        helpIcon = helper ? helper.querySelector('.nf-ico-wrap') : null;

        function validate() {
          var v = input.value.trim();
          var valid = v.length > 0 && v.length <= 24;
          dlg.setOkEnabled(valid);
          okBtn.style.transform = '';
          okBtn._dodgeOff = valid;
          if (helper) {
            helper.classList.toggle('is-ok', valid);
            var span = helper.querySelector('span:not(.nf-ico-wrap)');
            if (span) span.textContent = valid ? '' : '名称过长';
            if (helpIcon) helpIcon.innerHTML = NF.icons.svg(valid ? 'check' : 'warning');
          }
          input.classList.toggle('is-bad', !valid && input.value.length > 0);
          if (valid && !input.dataset.wasValid) {
            input.dataset.wasValid = '1';
            NF.Audio.play('sparkle', { volume: 0.55 });
            NF.FX.burst(OS.center(okBtn).x, OS.center(okBtn).y, { count: 14, colors: ['#5b7cfa', '#9cb0ff', '#ffffff'], speed: 5, gravity: 0.14 });
          }
          if (!valid) delete input.dataset.wasValid;
        }
        input.addEventListener('input', validate);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !okBtn.disabled) {
            e.preventDefault();
            okBtn.click();
          }
        });
        setTimeout(function () {
          validate();
          if (input.value.length > 40) {
            // 输入框巨大内容，光标停在最后
            try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
          }
        }, 120);
      }

      function createFolder(name) {
        if (created) return;
        created = true;
        OS.closeMenus();
        OS.closeDialogs();
        var x = innerWidth / 2 - 38, y = innerHeight * 0.38 - 26;
        var folder = ctx.createdFolder({ x: x, y: y, label: name, testid: 'created-folder' });
        NF.Audio.play('pop');
        NF.FX.burst(x + 38, y + 32, { count: 24, colors: ['#ffc94d', '#ffe08a', '#ffffff', '#8a6cff'], speed: 7, gravity: 0.2 });
        ctx.complete({ el: folder });
      }

      function items() {
        return [
          { id: 'view', label: '查看', icon: 'eye', disabled: true },
          { id: 'refresh', label: '刷新', icon: 'restart', onSelect: function () { NF.Audio.play('whoosh'); } },
          { separator: true },
          {
            id: 'new', label: '新建', icon: 'folder',
            submenu: [
              { id: 'folder', label: '文件夹', icon: 'folder', testid: 'menu-item-folder', onSelect: function () { openDialog(); } },
              { id: 'text', label: '文本文档', icon: 'fileText', onSelect: function () { NF.Audio.play('deny'); } }
            ]
          }
        ];
      }

      ctx.on(ctx.root, 'contextmenu', function (e) {
        e.preventDefault();
        if (created) return;
        OS.closeMenus();
        OS.menu({ x: e.clientX, y: e.clientY, items: items() });
      });

      ctx.on(window, 'keydown', function (e) {
        if (created) return;
        if (OS.matchCombo(e, 'Ctrl+Shift+F')) {
          e.preventDefault();
          openDialog();
        }
      });

      // ~~~~~~~~ 演示：打开对话框 → 全选删除 → 输入 → 回车 ~~~~~~~~
      ctx.hint = async function () {
        OS.closeMenus();
        if (dlg) { dlg.close('hint'); dlg = null; }
        var cx = innerWidth / 2, cy = innerHeight / 2;
        await NF.Ghost.play([
          { move: [cx, cy + 140], dur: 350 },
          { keys: 'Ctrl+Shift+F', dur: 900 },
          { do: function () { openDialog(); } },
          { wait: 350 },
          { move: '[data-t="name-input"]', dur: 500 },
          { highlight: '[data-t="name-input"]', dur: 700 },
          { keys: 'Ctrl+A', dur: 800 },
          { keys: 'Backspace', dur: 700 },
          { type: '我的文件夹', dur: 900 },
          { wait: 200 },
          { move: '[data-t="dialog-ok"]', dur: 550 },
          { highlight: '[data-t="dialog-ok"]', dur: 700 },
          {
            click: 'left', target: '[data-t="dialog-ok"]', after: 500,
            do: function () { if (dlg) { dlg.close('hint'); dlg = null; } }
          }
        ]);
      };
    }
  });
})();
