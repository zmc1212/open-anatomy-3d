// 底部旋转弧:拖动手柄左右滑动以旋转模型,手柄沿弧线跟踪当前方位角。
// 对应原包 open-anatomy-3d-react/src/RotateArcControl.tsx。
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  const SENSITIVITY = 0.012;      // 每像素弧度
  const ROTATION_RANGE = Math.PI; // 有界滑杆:满行程 ±180°(转到背面),中心为正面
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // 弧线端点/控制点,与下方 <path> 一致(viewBox 0 0 220 40)。
  const ARC_P0 = { x: 10, y: 36 };
  const ARC_P1 = { x: 110, y: -6 };
  const ARC_P2 = { x: 210, y: 36 };

  function pointOnArc(t) {
    const mt = 1 - t;
    return {
      x: mt * mt * ARC_P0.x + 2 * mt * t * ARC_P1.x + t * t * ARC_P2.x,
      y: mt * mt * ARC_P0.y + 2 * mt * t * ARC_P1.y + t * t * ARC_P2.y,
    };
  }

  function clampRotation(r) {
    return Math.max(-ROTATION_RANGE, Math.min(ROTATION_RANGE, r));
  }

  /** container: .oa3d-rotate;hooks: {onChange(θ), getRotation()} */
  OA.RotateArc = {
    create: function (container, hooks) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 220 40');
      svg.setAttribute('class', 'oa3d-rotate-svg');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M 10 36 Q 110 -6 210 36');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
      container.appendChild(svg);

      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'oa3d-rotate-handle';
      handle.setAttribute('aria-label', '左右拖动旋转模型');
      handle.innerHTML =
        '<svg viewBox="0 0 24 24" class="oa3d-rotate-icon" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 6l-5 6 5 6M15 6l5 6-5 6" /></svg>';
      container.appendChild(handle);

      let drag = null;      // { startX, startRotation }
      let rotation = 0;

      handle.addEventListener('pointerdown', function (e) {
        drag = { startX: e.clientX, startRotation: rotation };
        handle.classList.add('oa3d-rotate-handle-active');
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无活动指针 */ }
      });
      handle.addEventListener('pointermove', function (e) {
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        rotation = clampRotation(drag.startRotation + dx * SENSITIVITY);
        position();
        hooks.onChange(rotation);
      });
      handle.addEventListener('pointerup', function (e) {
        drag = null;
        handle.classList.remove('oa3d-rotate-handle-active');
        try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
      });
      handle.addEventListener('pointercancel', function () {
        drag = null;
        handle.classList.remove('oa3d-rotate-handle-active');
      });

      // 模型被拖转时反向同步手柄位置(从查看器每帧回调)。
      function syncFrom(angle) {
        if (drag) return;
        rotation = angle;
      }
      function position() {
        const t = (clampRotation(rotation) + ROTATION_RANGE) / (2 * ROTATION_RANGE);
        const p = pointOnArc(t);
        handle.style.left = p.x + 'px';
        handle.style.top = p.y + 'px';
      }
      position();

      return { syncFrom: syncFrom, position: position };
    },
  };
})();
