// 启动与状态编排:图层/固定/悬停/选中/性别切换,把各模块接到 DOM 上。
// 对应原 demo App.tsx(去 React 化)。
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const OA = window.OA;

  // ---------- 状态 ----------
  const state = {
    sex: 'male',
    layers: Object.assign({}, OA.DEFAULT_LAYERS),
    pins: [                                   // 起始固定项(与原 demo 一致)
      { key: 'heart', items: ['固定示例 —— 点击任意结构即可固定'] },
      { key: 'lung_l', items: ['标注卡片会跟随视角转动'] },
      { key: 'knee_r', items: ['关节热点同样可以固定'] },
    ],
    hoveredKey: null,
    selected: OA.BY_KEY.heart,
  };

  const models = { male: null, female: null };
  let switching = false;

  const pinnedSet = function () { return new Set(state.pins.map(function (p) { return p.key; })); };
  const inBody = function (key) { return OA.inBody(key, state.sex); };
  const visiblePins = function () { return state.pins.filter(function (p) { return inBody(p.key); }); };
  const anchorKeys = function () { return visiblePins().map(function (p) { return p.key; }); };

  // ---------- 标注卡片(先于查看器创建:渲染循环首帧就会回调) ----------
  const callouts = OA.Callouts.create($('callout-layer'), $('callout-svg'), {
    hoveredKey: null,
    onSelect: handleSelect,
    onHover: setHovered,
  });

  // ---------- 旋转弧 ----------
  const arc = OA.RotateArc.create($('rotate-arc'), {
    onChange: function (angle) { viewer.setAzimuth(angle); },
  });

  // ---------- 查看器 ----------
  const viewer = OA.Viewer.create($('canvas-wrap'), {
    getModel: function () { return models[state.sex]; },
    getHovered: function () { return state.hoveredKey; },
    getPinned: function () { return pinnedSet(); },
    getAnchorKeys: anchorKeys,
    getLayers: function () { return state.layers; },
    onHover: setHovered,
    onSelect: handleSelect,
    onAnchors: function (anchors, w, h) { callouts.update(anchors, w, h); },
    onAzimuth: function (theta) { arc.syncFrom(theta); arc.position(); },
  });

  // ---------- 缩放 / 复位 ----------
  $('zoom-in').addEventListener('click', function () { viewer.dolly(1 / 1.18); });
  $('zoom-out').addEventListener('click', function () { viewer.dolly(1.18); });
  $('reset-view').addEventListener('click', function () { viewer.resetView(); });

  // ---------- 悬停 ----------
  function setHovered(key) {
    if (key && !inBody(key)) key = null;
    state.hoveredKey = key;
    callouts.setActive(key);
    $('canvas-wrap').classList.toggle('oa3d-canvas-pointer', !!key);
    const tag = $('hover-tag');
    if (key) {
      $('hover-name').textContent = OA.displayLabel(OA.BY_KEY[key]);
      tag.hidden = false;
    } else {
      tag.hidden = true;
    }
  }

  // ---------- 固定 / 选中 ----------
  function togglePin(s) {
    state.selected = s;
    const i = state.pins.findIndex(function (p) { return p.key === s.key; });
    if (i >= 0) state.pins.splice(i, 1);
    else state.pins.push({ key: s.key, items: [] });
    refreshPins();
    panel.setState({ selected: state.selected, pinnedSet: pinnedSet() });
    panel.updateClear(state.pins.length);
  }

  function handleSelect(key) {
    const s = OA.BY_KEY[key];
    if (s) togglePin(s);
  }

  function refreshPins() {
    callouts.setPins(visiblePins().map(function (p) {
      const info = OA.BY_KEY[p.key];
      return {
        key: p.key,
        title: OA.CATEGORY_LABELS_ZH[info.category] || info.category,
        subtitle: OA.displayLabel(info),
        items: p.items || [],
        color: OA.CATEGORY_COLORS[info.category] || '#d94f0b',
      };
    }));
  }

  // ---------- 图层开关 ----------
  function buildLayerToggles() {
    const wrap = $('layer-toggles');
    for (const system of OA.LAYER_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oa3d-layer' + (state.layers[system] ? ' oa3d-layer-on' : '');
      btn.setAttribute('aria-pressed', state.layers[system] ? 'true' : 'false');
      const swatch = document.createElement('span');
      swatch.className = 'oa3d-swatch oa3d-swatch-' + system;
      btn.appendChild(swatch);
      btn.appendChild(document.createTextNode(OA.SYSTEM_LABELS[system]));
      btn.addEventListener('click', function () {
        state.layers[system] = !state.layers[system];
        btn.classList.toggle('oa3d-layer-on', state.layers[system]);
        btn.setAttribute('aria-pressed', state.layers[system] ? 'true' : 'false');
        const model = models[state.sex];
        if (model) OA.applyLayers(model, state.layers);
      });
      wrap.appendChild(btn);
    }
  }

  // ---------- 性别切换 ----------
  function setSexUI(sex) {
    for (const btn of $('sex-toggle').querySelectorAll('.oa3d-sex-option')) {
      const on = btn.dataset.sex === sex;
      btn.classList.toggle('oa3d-sex-option-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    $('sex-thumb').classList.toggle('oa3d-sex-thumb-right', sex === 'female');
  }

  function loading(show, text, pct) {
    const el = $('loading');
    el.hidden = !show;
    if (text) $('loading-text').textContent = text;
    $('loading-fill').style.width = (pct === undefined ? 60 : Math.round(pct)) + '%';
  }

  async function switchSex(next) {
    if (next === state.sex || switching) return;
    switching = true;
    try {
      if (!models[next]) {
        loading(true, '正在准备' + OA.SEX_LABEL[next] + '躯体…', 55);
        models[next] = await OA.buildAnatomy(next);
      }
      const prev = models[state.sex];
      if (prev) viewer.removeModel(prev);
      state.sex = next;
      viewer.addModel(models[next]);
      OA.applyLayers(models[next], state.layers);
      setSexUI(next);
      setHovered(null);
      refreshPins();
      panel.setState({ sex: next, selected: state.selected, pinnedSet: pinnedSet() });
    } finally {
      switching = false;
      loading(false);
    }
  }

  for (const btn of $('sex-toggle').querySelectorAll('.oa3d-sex-option')) {
    btn.addEventListener('click', function () { switchSex(btn.dataset.sex); });
  }

  // ---------- 侧栏 ----------
  const panel = OA.Panel.create({
    statStructures: $('stat-structures'),
    selectedCard: $('selected-card'),
    selectedCategory: $('selected-category'),
    selectedZh: $('selected-zh'),
    selectedLabel: $('selected-label'),
    selectedKey: $('selected-key'),
    selectedSystem: $('selected-system'),
    selectedSex: $('selected-sex'),
    selectedPin: $('selected-pin'),
    clearPins: $('clear-pins'),
    search: $('search'),
    structureList: $('structure-list'),
  }, {
    onTogglePin: togglePin,
  });
  $('clear-pins').addEventListener('click', function () {
    state.pins = [];
    refreshPins();
    panel.setState({ selected: state.selected, pinnedSet: pinnedSet() });
    panel.updateClear(0);
  });

  // ---------- 其他 UI ----------
  $('attribution').textContent = OA.ATTRIBUTION;
  $('copy-snippet').addEventListener('click', async function () {
    const btn = $('copy-snippet');
    try {
      await navigator.clipboard.writeText($('snippet').textContent);
      btn.textContent = '已复制';
    } catch (e) {
      btn.textContent = '复制失败';
    }
    setTimeout(function () { btn.textContent = '复制'; }, 1600);
  });

  // ---------- 启动 ----------
  async function boot() {
    loading(true, '解码内置模型数据…', 30);
    models.male = await OA.buildAnatomy('male');
    viewer.addModel(models.male);
    OA.applyLayers(models.male, state.layers);
    loading(false);

    buildLayerToggles();
    refreshPins();
    panel.setState({ sex: state.sex, selected: state.selected, pinnedSet: pinnedSet() });
    panel.updateClear(state.pins.length);

    window.OA_BOOTED = true;
    $('boot-banner').hidden = true;

    // 空闲时预构建另一躯体,首次切换性别时即时呈现。
    const idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 1500); };
    idle(function () {
      if (!models.female) {
        OA.buildAnatomy('female').then(function (m) { models.female = m; }).catch(function () { /* 切换时会重试 */ });
      }
    });
  }

  boot().catch(function (err) {
    console.error('[open-anatomy-3d] 启动失败:', err);
    loading(false);
    $('boot-banner').hidden = false;
    $('loading-text').textContent = '启动失败:' + (err && err.message ? err.message : err);
    $('loading').hidden = false;
  });
})();
