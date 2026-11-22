// 数据 API:常量、目录索引与助手。对应原包 open-anatomy-3d/src/index.ts。
// 全部挂在 window.OA 下(经典脚本共享命名空间,无模块系统)。
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  /** 躯体系统。每个结构恰属一个;模型里除 joints(热点)外都是独立顶层组。 */
  OA.SYSTEMS = ['skin', 'skeleton', 'joints', 'muscles', 'organs', 'vessels', 'nerves'];

  /** 图层开关的展示顺序(与原版 AnatomyViewer LAYER_ORDER 一致)。 */
  OA.LAYER_ORDER = ['skin', 'muscles', 'skeleton', 'joints', 'organs', 'vessels', 'nerves'];

  /** 侧栏结构清单的分组顺序(与原版 demo SYSTEM_ORDER 一致)。 */
  OA.BROWSER_ORDER = ['organs', 'skeleton', 'joints', 'muscles', 'vessels', 'nerves', 'skin'];

  OA.SYSTEM_LABELS = {
    skin: '皮肤', skeleton: '骨骼', joints: '关节',
    muscles: '肌肉', organs: '器官', vessels: '血管', nerves: '神经',
  };

  /** 类别配色:标签、图例与标注卡片使用(原版 CATEGORY_COLORS)。 */
  OA.CATEGORY_COLORS = {
    'Cardiovascular': '#e5391b',
    'Respiratory': '#2f86c9',
    'Digestive': '#d97b0b',
    'Endocrine': '#b7791f',
    'Renal / Urinary': '#1f9d8b',
    'Musculoskeletal': '#5b6b86',
    'Neurological': '#8e5bd6',
    'Eye / Sensory': '#0f8fb3',
    'Reproductive': '#d14d72',
    'Oral / ENT': '#b35c44',
    'Immune / Lymphatic': '#3a9a4f',
    'Skin': '#c9825e',
  };

  /** 类别中文(本站补充,仅用于展示)。 */
  OA.CATEGORY_LABELS_ZH = {
    'Cardiovascular': '心血管',
    'Respiratory': '呼吸',
    'Digestive': '消化',
    'Endocrine': '内分泌',
    'Renal / Urinary': '泌尿',
    'Musculoskeletal': '肌骨',
    'Neurological': '神经',
    'Eye / Sensory': '眼与感官',
    'Reproductive': '生殖',
    'Oral / ENT': '口耳鼻喉',
    'Immune / Lymphatic': '免疫与淋巴',
    'Skin': '皮肤',
  };

  /** 各系统默认显示(原版 DEFAULT_LAYERS:肌肉默认关闭)。 */
  OA.DEFAULT_LAYERS = {
    skin: true, muscles: false, skeleton: true,
    joints: true, organs: true, vessels: true, nerves: true,
  };

  /** 全部 147 个结构(135 网格 + 12 关节热点)。 */
  OA.STRUCTURES = window.OA_CATALOG;

  OA.BY_KEY = Object.fromEntries(OA.STRUCTURES.map(function (s) { return [s.key, s]; }));

  /** 指定躯体存在的结构(去掉另一性别的专属器官)。 */
  OA.structuresFor = function (sex) {
    return OA.STRUCTURES.filter(function (s) { return !s.sex || s.sex === sex; });
  };

  /** 关节热点的中心坐标(男性用 anchor,女性用 anchorFemale)。 */
  OA.jointAnchor = function (structure, sex) {
    return sex === 'female' ? structure.anchorFemale : structure.anchor;
  };

  /** 结构在当前躯体里是否存在(用于隐藏另一躯体的标注)。 */
  OA.inBody = function (key, sex) {
    const info = OA.BY_KEY[key];
    return !!info && (!info.sex || info.sex === sex);
  };

  /** 展示名:优先中文译名。 */
  OA.displayLabel = function (structure) {
    return structure.zh || structure.label;
  };

  /** CC BY 4.0 要求的署名文本(逐字沿用原版 ATTRIBUTION,展示模型处必须可见)。 */
  OA.ATTRIBUTION =
    'Anatomy: BodyParts3D © The Database Center for Life Science (CC BY 4.0); ' +
    'female organs: Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0); ' +
    'female body: MakeHuman (CC0). Modified by open-anatomy-3d ' +
    '(https://github.com/MervinR07/open-anatomy-3d), CC BY 4.0.';

  OA.SEX_LABEL = { male: '男性', female: '女性' };
})();
