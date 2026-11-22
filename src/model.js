// 模型构建:Base64 GLB → GLTFLoader.parse → 按系统重建材质、结构部件与关节热点。
// 对应原包 open-anatomy-3d-react/src/AnatomyModel.tsx(去 React 化)。
(function () {
  'use strict';

  const OA = (window.OA = window.OA || {});

  // 各系统材质参数(原版 SYSTEM_MATERIAL):关节默认全透明,悬停/固定时点亮。
  const SYSTEM_MATERIAL = {
    joints:   { color: '#ff9a3c', opacity: 0,    roughness: 0.4 },
    skeleton: { color: '#efe6d2', opacity: 0.55, roughness: 0.7 },
    muscles:  { color: '#b5463d', opacity: 0.85, roughness: 0.6 },
    organs:   { color: '#c96f5d', opacity: 1,    roughness: 0.45 },
    vessels:  { color: '#c0392b', opacity: 1,    roughness: 0.35 },
    nerves:   { color: '#f2c14e', opacity: 1,    roughness: 0.5 },
  };

  // 拾取优先级(原版 PICK_PRIORITY):关节与器官即使被更近的网格挡住也优先命中
  // ——关节热点藏在肌肉里,肋骨挡在心肺前面,没有人指着胸口时想选中的是"肋骨"。
  const PICK_PRIORITY = { joints: 4, organs: 3, muscles: 2, vessels: 1, nerves: 1, skeleton: 0, skin: -1 };
  const JOINT_RADIUS = 0.038;
  const MESH_GROUPS = ['skin', 'skeleton', 'muscles', 'organs', 'vessels', 'nerves'];

  // 半透明"医学插画"皮肤着色器(原版 makeSkinMaterial):正对镜头近乎全透,
  // 掠射角密度渐增,轮廓呈柔玻璃感,内部器官透过皮肤清晰可见。
  function makeSkinMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color('#e9b596') },
        uRim: { value: new THREE.Color('#d98c6a') },
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vView = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform vec3 uRim;',
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main() {',
        '  float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));',
        '  float rim = pow(f, 2.2);',
        '  vec3 col = mix(uColor, uRim, rim);',
        '  float light = 0.75 + 0.25 * max(dot(normalize(vNormal), normalize(vec3(0.3, 0.6, 0.8))), 0.0);',
        '  gl_FragColor = vec4(col * light, 0.07 + 0.5 * rim);',
        '}',
      ].join('\n'),
    });
  }

  function base64ToArrayBuffer(b64) {
    const bin = window.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function loadGltf(sex) {
    return new Promise(function (resolve, reject) {
      const b64 = (window.OA_MODELS || {})[sex];
      if (!b64) { reject(new Error('缺少模型数据 models/anatomy-' + sex + '.glb.js')); return; }
      const buffer = base64ToArrayBuffer(b64);
      const loader = new THREE.GLTFLoader();
      loader.setMeshoptDecoder(window.MeshoptDecoder);
      loader.parse(buffer, '', function (gltf) { resolve(gltf.scene); }, reject);
    });
  }

  /**
   * 解析并准备一具躯体:遍历 glTF 场景,为每个网格向上找到目录 key 的祖先节点,
   * 重建材质并登记为部件;joints 不在 GLB 里,按目录 anchor 补建球体热点。
   * 返回 { sex, root, parts, systemGroups }。
   */
  OA.buildAnatomy = async function buildAnatomy(sex, onStage) {
    const scene = await loadGltf(sex);
    if (onStage) onStage('构建材质与部件…');

    const root = scene;
    const parts = new Map();
    const systemGroups = new Map();
    const skinMaterial = makeSkinMaterial();
    const noRaycast = function () {};

    root.traverse(function (obj) {
      // 根的直接子节点是各系统组;注意不能跳过恰好也是目录 key 的名字(skin 组里就是 skin 网格)。
      if (obj.parent === root && MESH_GROUPS.includes(obj.name)) {
        systemGroups.set(obj.name, obj);
      }
      if (!(obj instanceof THREE.Mesh)) return;
      // 一个结构可能拆成多个 primitive——向上找到最近的名字为目录 key 的祖先。
      let owner = obj;
      while (owner && !OA.BY_KEY[owner.name]) owner = owner.parent;
      if (!owner) return;
      const info = OA.BY_KEY[owner.name];
      obj.userData.anatomyKey = info.key;
      obj.userData.system = info.system;
      if (info.system === 'skin') {
        obj.material = skinMaterial;
        obj.raycast = noRaycast;      // 皮肤不参与拾取
        obj.renderOrder = 10;
        return;
      }
      const base = SYSTEM_MATERIAL[info.system];
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(info.color || base.color),
        roughness: base.roughness,
        metalness: 0,
        transparent: base.opacity < 1,
        opacity: base.opacity,
        depthWrite: base.opacity >= 1,
      });
      obj.material = mat;
      obj.userData.originalRaycast = obj.raycast;
      let part = parts.get(info.key);
      if (!part) {
        part = { key: info.key, system: info.system, meshes: [], materials: [], center: new THREE.Vector3() };
        parts.set(info.key, part);
      }
      part.meshes.push(obj);
      part.materials.push(mat);
    });

    // 关节热点:BodyParts3D 没有关节囊,构建期按骨端几何算出关节中心,这里补球体。
    const joints = new THREE.Group();
    joints.name = 'joints';
    root.add(joints);
    systemGroups.set('joints', joints);
    const jointGeometry = new THREE.SphereGeometry(JOINT_RADIUS, 24, 16);
    for (const s of OA.STRUCTURES) {
      const anchor = OA.jointAnchor(s, sex);
      if (s.system !== 'joints' || !anchor) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.color), transparent: true, opacity: 0, depthWrite: false, roughness: 0.4,
      });
      const mesh = new THREE.Mesh(jointGeometry, mat);
      mesh.position.set(anchor[0], anchor[1], anchor[2]);
      mesh.renderOrder = 5;
      mesh.userData.anatomyKey = s.key;
      mesh.userData.system = 'joints';
      mesh.userData.originalRaycast = mesh.raycast;
      joints.add(mesh);
      parts.set(s.key, { key: s.key, system: 'joints', meshes: [mesh], materials: [mat], center: mesh.position.clone() });
    }

    // 每个部件的包围盒中心(标注卡片锚点)。
    const box = new THREE.Box3();
    root.updateMatrixWorld(true);
    for (const part of parts.values()) {
      if (part.system === 'joints') continue;
      box.makeEmpty();
      for (const m of part.meshes) box.expandByObject(m);
      box.getCenter(part.center);
      root.worldToLocal(part.center);
    }

    return { sex: sex, root: root, parts: parts, systemGroups: systemGroups };
  };

  /** 应用图层可见性:隐藏整组并禁用其网格拾取(与原版 layers useEffect 一致)。 */
  OA.applyLayers = function applyLayers(model, layers) {
    for (const [system, group] of model.systemGroups) group.visible = !!layers[system];
    for (const part of model.parts.values()) {
      const on = !!layers[part.system];
      for (const m of part.meshes) m.raycast = on ? m.userData.originalRaycast : (function () {});
    }
  };

  /**
   * 拾取:命中列表按距离排序后按优先级提升器官/关节(与原版 pick 一致)。
   */
  OA.pickStructure = function pickStructure(intersections) {
    let best = null;
    for (const hit of intersections) {
      const system = hit.object.userData.system;
      if (!system || system === 'skin' || !hit.object.visible) continue;
      if (!best) { best = hit; continue; }
      const pb = PICK_PRIORITY[best.object.userData.system];
      const ph = PICK_PRIORITY[system];
      if (ph > pb && (system === 'organs' || system === 'joints')) best = hit;
    }
    return best ? best.object.userData.anatomyKey || null : null;
  };

  /**
   * 逐帧材质状态:悬停 → 恒定高亮;固定 → 脉冲呼吸;关节命中时 0.55 半透明。
   * 返回值供渲染循环调用;hover/flag 颜色与原版一致(#ff7a2f / #e5391b)。
   */
  OA.updateMaterials = function updateMaterials(model, hoveredKey, pinnedSet, elapsed) {
    const pulse = 0.35 + 0.25 * Math.sin(elapsed * 3);
    const hover = OA._hoverColor || (OA._hoverColor = new THREE.Color('#ff7a2f'));
    const flag = OA._flagColor || (OA._flagColor = new THREE.Color('#e5391b'));
    for (const part of model.parts.values()) {
      const hovered = part.key === hoveredKey;
      const flagged = pinnedSet.has(part.key);
      for (const mat of part.materials) {
        if (hovered) {
          mat.emissive.copy(hover);
          mat.emissiveIntensity = 0.75;
        } else if (flagged) {
          mat.emissive.copy(flag);
          mat.emissiveIntensity = pulse;
        } else {
          mat.emissiveIntensity = 0;
        }
        const baseOpacity = SYSTEM_MATERIAL[part.system].opacity;
        const lit = part.system === 'joints' ? 0.55 : 1;
        const wantOpacity = hovered || flagged ? lit : baseOpacity;
        if (mat.opacity !== wantOpacity) {
          mat.opacity = wantOpacity;
          mat.transparent = wantOpacity < 1;
          mat.depthWrite = wantOpacity >= 1 && part.system !== 'joints';
          mat.needsUpdate = true;
        }
      }
    }
  };
})();
