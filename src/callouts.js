// 固定结构的标注卡片:躯体两侧分列,虚线引到锚点,每帧直接改 DOM 跟随视角。
// 对应原包 open-anatomy-3d-react/src/CalloutOverlay.tsx(去 React 化)。
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  const CARD_W = 168;
  const CARD_W_MIN = 108;
  const CARD_GAP = 10;
  const EDGE_PAD = 10;
  const ELBOW = 26;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 单列一维排布:按锚点高度排序,自上而下推卡片避免重叠;溢出时整体上收回压。
  function layoutColumn(items, height) {
    items.sort(function (a, b) { return a.ay - b.ay; });
    let cursor = EDGE_PAD;
    for (const it of items) {
      const top = Math.max(cursor, it.ay - it.h / 2);
      it.cy = top + it.h / 2;
      cursor = top + it.h + CARD_GAP;
    }
    let overflow = cursor - CARD_GAP - (height - EDGE_PAD);
    for (let i = items.length - 1; i >= 0 && overflow > 0; i--) {
      const it = items[i];
      const room = i === 0
        ? it.cy - it.h / 2 - EDGE_PAD
        : it.cy - it.h / 2 - (items[i - 1].cy + items[i - 1].h / 2 + CARD_GAP);
      const shift = Math.min(overflow, Math.max(0, room));
      for (let j = i; j < items.length; j++) items[j].cy -= shift;
      overflow -= shift;
    }
  }

  OA.Callouts = {
    /** layer: .oa3d-callout-layer 容器;svg: 引线图层;hooks: {onSelect, onHover} */
    create: function (layer, svg, hooks) {
      const cards = new Map();   // key → card 元素
      const lines = new Map();   // key → polyline
      const dots = new Map();    // key → circle
      let current = [];

      function setPins(callouts) {
        for (const [, el] of cards) el.remove();
        for (const [, el] of lines) el.parentNode.remove();
        cards.clear(); lines.clear(); dots.clear();
        current = callouts;
        for (const c of callouts) {
          const g = document.createElementNS(SVG_NS, 'g');
          if (hooks.hoveredKey === c.key) g.setAttribute('class', 'oa3d-callout-line-active');
          const line = document.createElementNS(SVG_NS, 'polyline');
          line.setAttribute('fill', 'none');
          line.setAttribute('stroke', c.color);
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('stroke-dasharray', '3 3');
          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('r', '6');
          dot.setAttribute('fill', '#ffffff');
          dot.setAttribute('stroke', c.color);
          dot.setAttribute('stroke-width', '3');
          g.appendChild(line); g.appendChild(dot);
          svg.appendChild(g);
          lines.set(c.key, line); dots.set(c.key, dot);

          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'oa3d-callout-card';
          card.style.width = CARD_W + 'px';
          card.style.opacity = '0';
          card.style.borderLeftColor = c.color;
          const t = document.createElement('span');
          t.className = 'oa3d-callout-title';
          t.style.color = c.color;
          t.textContent = c.title;
          const s = document.createElement('span');
          s.className = 'oa3d-callout-subtitle';
          s.textContent = c.subtitle;
          card.appendChild(t); card.appendChild(s);
          if (c.items && c.items.length) {
            const it = document.createElement('span');
            it.className = 'oa3d-callout-items';
            it.textContent = c.items.join(', ');
            card.appendChild(it);
          }
          card.addEventListener('click', function () { hooks.onSelect(c.key); });
          card.addEventListener('mouseenter', function () { hooks.onHover(c.key); });
          card.addEventListener('mouseleave', function () { hooks.onHover(null); });
          layer.appendChild(card);
          cards.set(c.key, card);
        }
      }

      function setActive(key) {
        for (const c of current) {
          const g = lines.get(c.key);
          if (!g) continue;
          const active = c.key === key;
          // g 是 polyline 的父 <g>;hover 时加粗整组
          const group = g.parentNode;
          if (group) group.setAttribute('class', active ? 'oa3d-callout-line-active' : '');
        }
      }

      /** 每帧调用:anchors 由查看器投影得到。 */
      function update(anchors, width, height) {
        const byKey = new Map();
        for (const a of anchors) byKey.set(a.key, a);
        // 窄容器(手机)压缩卡片宽度,避免盖住躯体。
        const cardW = width < 520 ? Math.max(CARD_W_MIN, Math.round(width * 0.3)) : CARD_W;
        const left = [], right = [];
        for (const c of current) {
          const a = byKey.get(c.key);
          const card = cards.get(c.key);
          if (!a || !card) continue;
          const placed = {
            key: c.key,
            side: a.x < width / 2 ? 'left' : 'right',
            ax: a.x, ay: a.y, cy: 0,
            h: card.offsetHeight || 56,
          };
          (placed.side === 'left' ? left : right).push(placed);
        }
        layoutColumn(left, height);
        layoutColumn(right, height);

        for (const p of left.concat(right)) {
          const card = cards.get(p.key);
          const line = lines.get(p.key);
          const dot = dots.get(p.key);
          const cardX = p.side === 'left' ? EDGE_PAD : width - cardW - EDGE_PAD;
          if (card.style.width !== cardW + 'px') card.style.width = cardW + 'px';
          card.style.transform = 'translate(' + cardX + 'px, ' + (p.cy - p.h / 2) + 'px)';
          card.style.opacity = '1';
          const edgeX = p.side === 'left' ? cardX + cardW : cardX;
          const elbowX = p.side === 'left' ? edgeX + ELBOW : edgeX - ELBOW;
          line.setAttribute('points', edgeX + ',' + p.cy + ' ' + elbowX + ',' + p.cy + ' ' + p.ax + ',' + p.ay);
          dot.setAttribute('cx', String(p.ax));
          dot.setAttribute('cy', String(p.ay));
        }
        for (const c of current) {
          const a = byKey.get(c.key);
          const hidden = !a || !a.visible;
          const card = cards.get(c.key);
          if (card) card.style.opacity = hidden ? '0' : '1';
          if (lines.get(c.key)) lines.get(c.key).style.opacity = hidden ? '0' : '1';
          if (dots.get(c.key)) dots.get(c.key).style.opacity = hidden ? '0' : '1';
        }
      }

      return { setPins: setPins, update: update, setActive: setActive };
    },
  };
})();
