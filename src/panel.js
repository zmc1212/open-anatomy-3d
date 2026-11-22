// 侧栏:统计、选中结构卡片、结构清单(搜索 + 按系统分组 + 固定开关)。
// 对应原 demo App.tsx 的 aside 部分;搜索额外支持中文译名匹配。
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  OA.Panel = {
    create: function (els, hooks) {
      // els: {statStructures, selectedCard, selectedCategory, selectedZh, selectedLabel,
      //       selectedKey, selectedSystem, selectedSex, selectedPin, clearPins,
      //       search, structureList}
      // hooks: {onTogglePin(structure)}

      let selected = null;
      let pinnedSet = new Set();
      let sex = 'male';

      function updateStats() {
        els.statStructures.textContent = String(OA.structuresFor(sex).length);
      }

      function updateSelected() {
        if (!selected) { els.selectedCard.hidden = true; return; }
        els.selectedCard.hidden = false;
        const color = OA.CATEGORY_COLORS[selected.category] || '#d94f0b';
        els.selectedCategory.textContent = (OA.CATEGORY_LABELS_ZH[selected.category] || selected.category);
        els.selectedCategory.style.color = color;
        els.selectedZh.textContent = OA.displayLabel(selected);
        els.selectedLabel.textContent = selected.label;
        els.selectedKey.textContent = selected.key;
        els.selectedSystem.textContent = OA.SYSTEM_LABELS[selected.system];
        els.selectedSex.textContent = selected.sex ? '仅' + OA.SEX_LABEL[selected.sex] : '两性通用';
        els.selectedPin.textContent = pinnedSet.has(selected.key) ? '取消固定' : '固定到模型';
      }

      function updateBrowser() {
        const q = els.search.value.trim().toLowerCase();
        const list = OA.structuresFor(sex).filter(function (s) {
          if (!q) return true;
          return (s.zh || '').toLowerCase().includes(q)
            || s.label.toLowerCase().includes(q)
            || s.key.includes(q)
            || s.category.toLowerCase().includes(q)
            || (OA.CATEGORY_LABELS_ZH[s.category] || '').includes(q)
            || OA.SYSTEM_LABELS[s.system].includes(q);
        });
        const groups = OA.BROWSER_ORDER.map(function (system) {
          return {
            system: system,
            items: list.filter(function (s) { return s.system === system; })
              .sort(function (a, b) { return a.label.localeCompare(b.label); }),
          };
        }).filter(function (g) { return g.items.length > 0; });

        els.structureList.innerHTML = '';
        for (const g of groups) {
          const h4 = document.createElement('h4');
          h4.textContent = OA.SYSTEM_LABELS[g.system] + ' ';
          const count = document.createElement('span');
          count.textContent = String(g.items.length);
          h4.appendChild(count);
          els.structureList.appendChild(h4);
          const ul = document.createElement('ul');
          for (const s of g.items) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('aria-pressed', pinnedSet.has(s.key) ? 'true' : 'false');
            if (pinnedSet.has(s.key)) btn.classList.add('on');
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = s.color;
            btn.appendChild(dot);
            btn.appendChild(document.createTextNode(OA.displayLabel(s)));
            btn.addEventListener('click', function () { hooks.onTogglePin(s); });
            li.appendChild(btn);
            ul.appendChild(li);
          }
          els.structureList.appendChild(ul);
        }
        if (!groups.length) {
          const p = document.createElement('p');
          p.className = 'empty';
          p.textContent = '没有匹配「' + els.search.value.trim() + '」的结构。';
          els.structureList.appendChild(p);
        }
      }

      function updateClear(count) {
        els.clearPins.hidden = count === 0;
        els.clearPins.textContent = '清除 ' + count + ' 个固定';
      }

      els.selectedPin.addEventListener('click', function () {
        if (selected) hooks.onTogglePin(selected);
      });
      els.search.addEventListener('input', updateBrowser);

      return {
        setState: function (next) {
          if (next.sex !== undefined) sex = next.sex;
          if (next.selected !== undefined) selected = next.selected;
          if (next.pinnedSet !== undefined) pinnedSet = next.pinnedSet;
          updateStats();
          updateSelected();
          updateBrowser();
        },
        refreshBrowser: updateBrowser,
        updateClear: updateClear,
      };
    },
  };
})();
