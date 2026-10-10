import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { TigerGait } from './tigerGait.js'

// A real tiger running the tour: it lands on the pawprint trail just ahead of
// the camera and gallops along the route, its stride matched to the flight's
// speed; when the scroll stops it slows, stands and looks around (the
// model's own idle clip). The white tiger model is recoloured into a Bengal
// tiger: orange coat, cream belly, throat and muzzle, stripes kept.
// Model: "White Tiger (rigged animated)" by MotionStreamStudios, CC BY 4.0.

// Fur length: opts.furLen (model units) times this.
const FUR_GAIN = 1.0
const SCALE = 0.045 // model is in centimetres; ~9 m long, large but still fits the roads

function bengal(material, box, { rim = 0.9, shell = null } = {}) {
  material.onBeforeCompile = (sh) => {
    // Positions may be quantized by compression: work in 0..1 of the model's bounds.
    sh.uniforms.uBMin = { value: box.min.clone() }
    sh.uniforms.uBSize = { value: box.getSize(new THREE.Vector3()) }
    sh.uniforms.uRim = { value: rim }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;\nvarying vec3 vObjN;\nuniform vec3 uBMin, uBSize;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = (position - uBMin) / uBSize;\nvObjN = normalize(objectNormal);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;\nvarying vec3 vObjN;\nuniform float uRim;\nfloat tgHead;')
      // Lights from behind the tiger only graze the head's outline; inside it
      // (the ruff's fur cards, under the jaw) the head would shade them.
      .replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
        void RE_Direct_Tiger(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          IncidentLight l = directLight;
          float back = smoothstep(0.05, -0.5, dot(l.direction, geometryViewDir));
          float inner = smoothstep(0.12, 0.4, dot(geometryNormal, geometryViewDir));
          l.color *= 1.0 - 0.88 * tgHead * back * inner;
          RE_Direct_Physical(l, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Tiger`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // Pale fur under the body and legs, on the throat and the muzzle.
          // Belly: the underside of the torso only (not the legs or tail).
          float band = smoothstep(0.6, 0.5, vBind.y) * smoothstep(0.36, 0.46, vBind.y);
          float mid = 1.0 - smoothstep(0.2, 0.34, abs(vBind.x - 0.5));
          float torso = smoothstep(0.22, 0.32, vBind.z) * smoothstep(0.86, 0.76, vBind.z);
          float belly = band * mid * torso;
          float face = smoothstep(0.83, 0.93, vBind.z) * smoothstep(0.84, 0.66, vBind.y);
          float paws = smoothstep(0.06, 0.015, vBind.y) * 0.7;
          // The face is pale, not white: only the muzzle and chin go cream.
          float pale = clamp(max(max(belly, face * 0.7), paws), 0.0, 1.0);
          // A real Bengal coat: deep rust along the spine, warmer and lighter
          // orange down the flanks, an off-white (never pure white) belly.
          vec3 orange = mix(vec3(0.6, 0.19, 0.035), vec3(0.38, 0.105, 0.018), smoothstep(0.62, 0.95, vBind.y));
          vec3 cream = vec3(0.78, 0.7, 0.56);
          // The texture is white fur with black stripes: keep the stripes dark.
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          vec3 coat = mix(orange, cream, pale) * smoothstep(0.08, 0.75, lum);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.25, coat, smoothstep(0.15, 0.55, lum));
        }`,
      )
      // A faint crimson rim so the tiger stands out against the campus at dusk.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.18, 0.08) * rim * uRim;`,
      )
      // Folds (under the jaw, behind the ruff) have smoothed normals that turn
      // away from the viewer; with no self-shadowing a back light there draws
      // a hard bright line. Such pixels are tucked in shadow: drop their direct
      // light, and mirror the normal back toward the eye for the rest.
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float tgFold;
        tgHead = smoothstep(0.72, 0.8, vBind.z);
        {
          // The normal map has hard edges along its UV island borders (around
          // the head, under the jaw): drop tilts that stray far from the surface.
          vec3 ng = normalize(vNormal);
          float dev = dot(normal, ng);
          normal = normalize(mix(ng, normal, smoothstep(0.55, 0.85, dev)));
          vec3 vd = normalize(vViewPosition);
          float nv = dot(normal, vd);
          tgFold = smoothstep(-0.18, 0.03, nv);
          if (nv < 0.0) normal = normalize(normal - 2.0 * nv * vd);
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // The model's packed map is a baked occlusion (dark in the mouth,
          // between the toes, in the folds of the neck): it shades direct light too.
          float tgAO = texture2D(roughnessMap, vRoughnessMapUv).g;
          // No self-shadowing: under the jaw and the ruff, and the back of the
          // head, face down or into the body, which would hide them from the
          // lights; lit, their edge reads as a hard line around the neck.
          float headBack = smoothstep(0.74, 0.8, vBind.z) * smoothstep(0.92, 0.86, vBind.z) * max(smoothstep(0.0, -0.3, vObjN.y), smoothstep(-0.05, -0.45, vObjN.z));
          float occ = tgFold * mix(1.0, smoothstep(0.15, 0.85, tgAO), 0.85) * (1.0 - 0.9 * headBack);
          reflectedLight.directDiffuse *= occ;
          reflectedLight.directSpecular *= occ;
          #ifdef USE_SHEEN
            // Sheen peaks at grazing angles; on the folds under the jaw that
            // drew the bright line. Keep it soft and off the folds.
            sheenSpecularDirect *= occ * smoothstep(0.02, 0.35, dot(geometryNormal, normalize(vViewPosition)));
          #endif
          reflectedLight.indirectDiffuse *= mix(1.0, tgAO, 0.6);
        }`,
      )
    if (shell) {
      // Fur shell: pushed out along the skinned normal and combed back and
      // down, so strands lie along the body. Each strand has its own height
      // and tapers to a point; roots are shaded, tips catch the light. The
      // ruff, cheeks and belly grow longer fur; paws and muzzle short.
      sh.uniforms.uShell = { value: shell.k }
      sh.uniforms.uLen = { value: shell.len }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uShell, uLen;\nvarying float vFur;')
        .replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>
          {
            float side = smoothstep(0.1, 0.22, abs(vBind.x - 0.5));
            float ruff = smoothstep(0.78, 0.86, vBind.z) * smoothstep(0.97, 0.9, vBind.z) * side * smoothstep(0.55, 0.68, vBind.y);
            float under = smoothstep(0.55, 0.42, vBind.y) * smoothstep(0.22, 0.32, vBind.z) * smoothstep(0.86, 0.76, vBind.z);
            float shortFur = max(smoothstep(0.12, 0.04, vBind.y), smoothstep(0.86, 0.93, vBind.z) * (1.0 - ruff));
            float lk = (1.0 + 0.8 * ruff + 0.5 * under) * (1.0 - 0.85 * shortFur);
            vec3 comb = vec3(0.0, -0.3, -0.7) * uShell * uShell;
            transformed += (normalize(objectNormal) * uShell + comb) * uLen * lk;
            vFur = lk;
          }`,
        )
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uShell;\nvarying float vFur;\nfloat furHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec2 cell = vMapUv * 820.0;
            vec2 id = floor(cell);
            float h = 0.35 + 0.65 * furHash(id);
            vec2 f = fract(cell) - 0.5 - (vec2(furHash(id + 17.1), furHash(id + 3.7)) - 0.5) * 0.7;
            float r = 0.42 * (1.0 - uShell / h);
            // Where strands are finer than a pixel only the inner shells stay,
            // a soft halo instead of shimmering noise.
            float px = length(fwidth(cell));
            // No shells over the bare face (eyes, nose, lips).
            if (vFur < 0.4 || uShell > h || (px > 1.6 && uShell > 0.4)) discard;
            // Each strand's edge is antialiased (alpha to coverage) rather than
            // cut, so the coat reads as soft hair instead of speckle.
            float d2 = dot(f, f);
            float aa = max(fwidth(d2) * 1.5, 1e-4);
            float cov = 1.0 - smoothstep(r * r - aa, r * r + aa, d2);
            if (cov < 0.02) discard;
            diffuseColor.a = cov;
            diffuseColor.rgb *= mix(0.62, 1.15, uShell);
          }`,
        )
        // Keep the stripes: the root's stripe mask carries up the strand, so
        // the coat recolour below cannot wash it out toward orange.
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float sl = dot(texture2D(map, vMapUv).rgb, vec3(0.333));
            float stripe = smoothstep(0.42, 0.18, sl);
            diffuseColor.rgb *= mix(1.0, 0.18, stripe);
          }`,
        )
    }
  }
  // The shells share one program (their height is a uniform), apart from the
  // base coat; without a key of their own they would reuse the base program.
  material.customProgramCacheKey = () => (shell ? 'tiger-shell' : 'tiger-coat')
  material.needsUpdate = true
}

// The head is a separate UV island whose border vertices are split from the
// neck's, and their normals disagree: under a back light that seam shows as a
// thin bright line around the jaw. Average the normals of coincident vertices.
function weldNormals(geo) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const groups = new Map()
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
    let g = groups.get(k)
    if (!g) groups.set(k, (g = []))
    g.push(i)
  }
  const out = new Float32Array(pos.count * 3)
  const n = new THREE.Vector3()
  const m = new THREE.Vector3()
  for (const g of groups.values()) {
    n.set(0, 0, 0)
    for (const i of g) n.add(m.fromBufferAttribute(nor, i).normalize())
    n.normalize()
    for (const i of g) out.set([n.x, n.y, n.z], i * 3)
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3))
  return [...groups.values()].filter((g) => g.length > 1).length
}

// Fur: several shells of the same skinned mesh, bound to the same skeleton.
function addFur(mesh, box, { shells = 8, len = 1.4, rim = 0.9 } = {}) {
  len *= FUR_GAIN
  for (let i = 1; i <= shells; i++) {
    const k = i / shells
    const mat = mesh.material.clone()
    mat.transparent = false
    mat.alphaToCoverage = true
    bengal(mat, box, { rim: rim * k, shell: { k, len } })
    const s = new THREE.SkinnedMesh(mesh.geometry, mat)
    s.bind(mesh.skeleton, mesh.bindMatrix)
    s.frustumCulled = false
    s.userData.shell = k
    s.castShadow = false
    mesh.parent.add(s)
    s.position.copy(mesh.position)
    s.quaternion.copy(mesh.quaternion)
    s.scale.copy(mesh.scale)
  }
}

export class RunTiger {
  // opts: scale (model units to scene), fur shells, rim glow strength.
  constructor(scene, url = `${import.meta.env.BASE_URL}models/tiger.glb`, opts = {}) {
    const { scale = SCALE, fur = 6, furLen = 1.4, rim = 0.5 } = opts
    this.group = new THREE.Group()
    this.group.visible = false
    scene.add(this.group)
    this.speed = 0
    this.scale = scale
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(url, (g) => {
      const m = g.scene
      m.scale.setScalar(scale)
      const skins = []
      m.traverse((o) => {
        if (!o.isMesh) return
        o.castShadow = true
        o.frustumCulled = false
        o.geometry.computeBoundingBox()
        weldNormals(o.geometry)
        // A soft sheen across the coat, the way fur catches light.
        const base = o.material
        const phys = new THREE.MeshPhysicalMaterial({ map: base.map, normalMap: base.normalMap, roughnessMap: base.roughnessMap, metalnessMap: base.metalnessMap, roughness: 0.85, metalness: 0, sheen: 0.45, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffd2a0') })
        o.material = phys
        bengal(phys, o.geometry.boundingBox, { rim })
        if (o.isSkinnedMesh) skins.push(o)
      })
      if (fur > 0) for (const o of skins) addFur(o, o.geometry.boundingBox, { shells: fur, len: furLen, rim })
      this.group.add(m)
      this.mixer = new THREE.AnimationMixer(m)
      if (g.animations[0]) this.mixer.clipAction(g.animations[0]).play()
      this.gait = new TigerGait(m)
      // Body length in model units, so strides scale with the animal.
      const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
      this.gait.bodyLen = Math.max(size.x, size.z) / scale
      this.size = size // world-space extent, for whoever rides it
      this.ready = true
      this.onReady?.()
    })
  }

  // pos: ground point; dir: heading on the ground plane; speed: m/s of the flight.
  update(dt, pos, dir, speed, roar = 0) {
    if (!this.ready) return
    this.group.visible = true
    // Ground speed in m/s, eased so a sudden stop slows through a few steps.
    this.speed += (Math.min(speed, 40) - this.speed) * Math.min(1, dt * 3)
    this.group.position.copy(pos)
    const yaw = Math.atan2(dir.x, dir.z)
    let d = yaw - this.group.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.group.rotation.y += d * Math.min(1, dt * 5)
    this.mixer.update(dt)
    // Standing still it breathes in its idle clip; moving, the gait takes over.
    const moving = THREE.MathUtils.smoothstep(this.speed, 0.1, 0.5)
    this.gait.mix = moving
    if (moving > 0.001) this.gait.update(dt, this.speed / this.scale)
    this.gait.roar(roar)
  }
}
