// 3D 查看器:渲染器 / 相机 / 轨道控制 / 灯光 / 渲染循环 / 指针拾取 / 锚点投影。
// 对应原包 AnatomyViewer.tsx 的 <Canvas> 部分。hooks 由 main.js 注入:
//   getModel()      当前躯体实例 { sex, root, parts, systemGroups } 或 null
//   getHovered()    悬停 key 或 null
//   getPinned()     固定结构 Set
//   getAnchorKeys() 需要投影的固定结构 key 列表
//   getLayers()     图层可见性对象
//   onHover(key) / onSelect(key) / onAnchors(list, w, h) / onAzimuth(θ)
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  const TARGET = new THREE.Vector3(0, 0.92, 0);
  const DEFAULT_DISTANCE = 3.55;
  const MIN_DISTANCE = 0.6;
  const MAX_DISTANCE = 6;

  OA.Viewer = {
    create: function (wrap, hooks) {
      // 渲染器:r3f 默认管线 —— sRGB 输出 + ACES 色调映射,颜色按线性工作流管理。
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if (THREE.ColorManagement) {
        THREE.ColorManagement.enabled = true;
        if ('legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      }
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      wrap.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      camera.position.set(TARGET.x, TARGET.y + 0.1, DEFAULT_DISTANCE);

      // 灯光(与原版一致):半球环境 + 三盏方向光。
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a58f, 1.1));
      const d1 = new THREE.DirectionalLight(0xffffff, 1.8); d1.position.set(2, 4, 3);
      const d2 = new THREE.DirectionalLight(0xffffff, 0.7); d2.position.set(-3, 2, -2);
      const d3 = new THREE.DirectionalLight(0xffffff, 0.5); d3.position.set(0, 1, -4);
      scene.add(d1, d2, d3);

      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.target.copy(TARGET);
      controls.enableZoom = false;          // 普通滚轮留给页面滚动;Ctrl/⌘+滚轮由我们接管
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.screenSpacePanning = true;
      controls.minDistance = MIN_DISTANCE;
      controls.maxDistance = MAX_DISTANCE;
      controls.minPolarAngle = Math.PI * 0.12;
      controls.maxPolarAngle = Math.PI * 0.88;
      controls.rotateSpeed = 0.7;
      controls.update();

      // ---------- 尺寸 ----------
      function resize() {
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if (window.ResizeObserver) {
        new ResizeObserver(resize).observe(wrap);
      } else {
        window.addEventListener('resize', resize);
      }
      resize();

      // ---------- 拾取 ----------
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();

      function intersectAt(clientX, clientY) {
        const model = hooks.getModel();
        if (!model) return [];
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        return raycaster.intersectObjects(model.root.children, true);
      }

      // 悬停:pointermove 事件只记录坐标,每帧至多射线求交一次。
      let pendingMove = null;
      renderer.domElement.addEventListener('pointermove', function (e) {
        pendingMove = e;
      });
      renderer.domElement.addEventListener('pointerleave', function () {
        pendingMove = null;
        hooks.onHover(null);
      });
      renderer.domElement.addEventListener('pointerdown', function () {
        // 按下(开始拖转)期间不点亮扫过的结构。
        pendingMove = null;
        hooks.onHover(null);
      });

      // 点击选中:按下到抬起位移 < 5px 才算点击(忽略拖转结束的那一下)。
      let downPos = null;
      renderer.domElement.addEventListener('pointerdown', function (e) {
        downPos = { x: e.clientX, y: e.clientY };
      });
      renderer.domElement.addEventListener('pointerup', function (e) {
        if (!downPos) return;
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        downPos = null;
        if (moved > 5) return;
        const key = OA.pickStructure(intersectAt(e.clientX, e.clientY));
        if (key) hooks.onSelect(key);
      });

      // 缩放:Ctrl/⌘ + 滚轮或触控板捏合(事件带 ctrlKey)时以指数步进推拉。
      function dolly(factor) {
        const offset = camera.position.clone().sub(controls.target);
        const next = THREE.MathUtils.clamp(offset.length() * factor, MIN_DISTANCE, MAX_DISTANCE);
        camera.position.copy(controls.target).add(offset.setLength(next));
        controls.update();
      }
      wrap.addEventListener('wheel', function (e) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        dolly(Math.exp(e.deltaY * 0.0025));
      }, { passive: false });

      function resetView() {
        controls.target.copy(TARGET);
        camera.position.set(TARGET.x, TARGET.y + 0.1, TARGET.z + DEFAULT_DISTANCE);
        controls.update();
      }

      function setAzimuth(angle) {
        const offset = camera.position.clone().sub(controls.target);
        const s = new THREE.Spherical().setFromVector3(offset);
        s.theta = angle;
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
        controls.update();
      }

      // ---------- 锚点投影 ----------
      const _center = new THREE.Vector3();
      const _toPoint = new THREE.Vector3();
      const _camDir = new THREE.Vector3();
      function projectAnchors() {
        const model = hooks.getModel();
        const keys = hooks.getAnchorKeys();
        if (!model || !keys.length) return;
        const w = wrap.clientWidth, h = wrap.clientHeight;
        const layers = hooks.getLayers();
        camera.getWorldDirection(_camDir);
        const anchors = [];
        for (const key of keys) {
          const part = model.parts.get(key);
          if (!part) continue;
          _center.copy(part.center);
          model.root.localToWorld(_center);
          _toPoint.copy(_center).sub(camera.position);
          const inFront = _toPoint.dot(_camDir) > 0;
          _center.project(camera);
          anchors.push({
            key: key,
            x: (_center.x * 0.5 + 0.5) * w,
            y: (-_center.y * 0.5 + 0.5) * h,
            visible: inFront && !!layers[part.system],
          });
        }
        hooks.onAnchors(anchors, w, h);
      }

      // ---------- 渲染循环 ----------
      const clock = new THREE.Clock();
      function frame() {
        requestAnimationFrame(frame);

        if (pendingMove) {
          const e = pendingMove;
          pendingMove = null;
          if (e.buttons) {
            hooks.onHover(null);        // 拖转途中不点亮
          } else {
            hooks.onHover(OA.pickStructure(intersectAt(e.clientX, e.clientY)));
          }
        }

        controls.update();
        hooks.onAzimuth(controls.getAzimuthalAngle());

        const model = hooks.getModel();
        if (model) {
          OA.updateMaterials(model, hooks.getHovered(), hooks.getPinned(), clock.getElapsedTime());
        }
        projectAnchors();
        renderer.render(scene, camera);
      }
      frame();

      return {
        renderer: renderer,
        camera: camera,
        controls: controls,
        dolly: dolly,
        resetView: resetView,
        setAzimuth: setAzimuth,
        addModel: function (model) { scene.add(model.root); },
        removeModel: function (model) { scene.remove(model.root); },
        pickAt: function (clientX, clientY) {
          return OA.pickStructure(intersectAt(clientX, clientY));
        },
      };
    },
  };
})();
