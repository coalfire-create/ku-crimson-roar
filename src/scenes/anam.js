import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import DATA from '../data/campus.json'
import { RunTiger } from './runTiger.js'
import WORLD from '../data/world.json'
// The main gate is a low stone arch, not a 16 m block.
for (const b of DATA.buildings) if (b.n === '고려대학교 정문') b.h = Math.min(b.h, 7)
import { loadAerial } from './aerial.js'
import { buildTrees } from './trees.js'
import { AER, AER_GLSL, NIGHT, buildingMaterial, STYLE as BST, offsetPoly, wallUV, slopeUV, tagB } from './materials.js'

// A flight over the whole Anam campus of Korea University, built only from
// free open data: OpenStreetMap footprints, land use and trees (© OSM
// contributors) on AWS Terrain Tiles elevation. Golden hour turning to dusk;
// the gothic granite halls get slate roofs and towers. Scroll drives the
// tour along a trail of glowing tiger pawprints; the pointer steers; a hall
// picked from the directory pulls the flight over to circle it.

export const TARGETS = [
  { key: 'gate', name: '정문', en: 'Main Gate', body: '안암로에서 올려다보이는 석조 정문. 고려대의 모든 이야기가 시작되는 곳.' },
  { key: 'tiger', name: '호상', en: 'Tiger Statue', body: '고려대의 상징, 호랑이. 캠퍼스 한가운데서 안암을 지킨다.' },
  { hall: '중앙도서관', name: '중앙도서관', en: 'Central Library', body: '밤늦도록 불이 꺼지지 않는 지성의 심장.' },
  { hall: '경영본관', name: '경영본관', en: 'Business School', body: '현대자동차경영관·LG-POSCO경영관과 함께 경영대학을 이루는 석조 건물.' },
  { hall: '백주년기념삼성관', name: '백주년기념삼성관', en: 'Centennial Samsung Hall', body: '개교 100주년을 기념해 세운 고딕 양식의 건물.' },
  { hall: '본관', name: '본관', en: 'Main Hall', body: '1934년 완공된 화강암 고딕 건물. 국가 사적으로 지정된 고려대의 얼굴.' },
  { hall: '인촌기념관', name: '인촌기념관', en: 'Inchon Memorial Hall', body: '고려대 발전의 기틀을 닦은 인촌 김성수를 기리는 건물. 입학식과 졸업식이 열린다.' },
  { hall: '하나과학관 A동', name: '하나과학관', en: 'Hana Science Hall', body: '애기능 너머 자연계 캠퍼스. 이공계 연구의 중심.' },
]

const T = WORLD.terrain
const X1 = T.x0 + (T.w - 1) * T.step
const Z1 = T.z0 + (T.h - 1) * T.step
const MOBILE = innerWidth < 760
// Scroll position (0..1 of the tour) where the tiger stops roaring and runs.
const TIGER_RUN = 0.03
const TOUR_END = 0.9 // the tiger reaches the end of the road; then the view rises
const CHASE = { back: 16, up: 8, ahead: 38, look: 0.5, wall: 7.5 }
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(235))
// 0 = golden hour, 1 = blue hour with the windows lit; the tour runs from one
// to the other.
const DUSK = {
  sun: [new THREE.Color('#ffc98f'), new THREE.Color('#ff7a45')],
  sky: [new THREE.Color('#d8b9a0'), new THREE.Color('#3a3260')],
  fog: [new THREE.Color('#b9a08e'), new THREE.Color('#2e2748')],
}

// Wall / roof look by style: s = style index, per-building seed, base and top.
// Halls that carry a tower over the roof.
const TOWERS = /^(본관|중앙도서관|인촌기념관)$/
const STYLE = { c: 0, g: 1, m: 2, h: 3, d: 4, t: 5 }

// Oriented bounding rectangle of a footprint (for gothic roofs and towers).
function obb(pts) {
  let best = null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])
    const c = Math.cos(a)
    const s = Math.sin(a)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, z] of pts) {
      const u = x * c + z * s
      const v = -x * s + z * c
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (!best || area < best.area) best = { area, a, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, L: u1 - u0, W: v1 - v0 }
  }
  const { a, cu, cv } = best
  return { ...best, cx: cu * Math.cos(a) - cv * Math.sin(a), cz: cu * Math.sin(a) + cv * Math.cos(a) }
}

// Hipped slate roof over an L x W rectangle (ridge along L), apex at rh.
function hipRoof(L, W, rh) {
  const l = L / 2
  const w = W / 2
  const r = Math.max(0, l - w)
  const v = [
    [-l, 0, -w], [l, 0, -w], [r, rh, 0], [-r, rh, 0], // side A
    [l, 0, w], [-l, 0, w], [-r, rh, 0], [r, rh, 0], // side B
  ]
  const pos = []
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  quad(v[0], v[3], v[2], v[1])
  quad(v[4], v[7], v[6], v[5])
  pos.push(...[l, 0, -w], ...[r, rh, 0], ...[l, 0, w]) // hip ends
  pos.push(...[-l, 0, w], ...[-r, rh, 0], ...[-l, 0, -w])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}


// Shortest paths over the road/footpath network between consecutive tour
// waypoints, resampled every few metres and lightly smoothed.
// cost(ax, az, bx, bz): optional extra weight per edge (e.g. hugging a wall).
function roadTour(tour, paths, cost = null) {
  const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`
  const nodes = new Map()
  const node = (x, z) => {
    const k = key(x, z)
    let n = nodes.get(k)
    if (!n) nodes.set(k, (n = { x, z, edges: [] }))
    return n
  }
  for (const w of paths) {
    if (w.k !== 'r' && w.k !== 'f' && w.k !== 'p') continue
    for (let i = 0; i < w.p.length - 1; i++) {
      const a = node(...w.p[i])
      const b = node(...w.p[i + 1])
      const d = Math.hypot(a.x - b.x, a.z - b.z) * (w.k === 'f' ? 1.6 : 1) * (cost ? cost(a.x, a.z, b.x, b.z) : 1) // prefer roads
      a.edges.push([b, d])
      b.edges.push([a, d])
    }
  }
  const all = [...nodes.values()]
  const nearest = (x, z) => all.reduce((best, n) => ((n.x - x) ** 2 + (n.z - z) ** 2 < (best.x - x) ** 2 + (best.z - z) ** 2 ? n : best), all[0])
  const shortest = (from, to) => {
    const dist = new Map([[from, 0]])
    const prev = new Map()
    // Binary min-heap of [distance, node].
    const heap = [[0, from]]
    const push = (e) => {
      heap.push(e)
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p][0] <= heap[i][0]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }
    const done = new Set()
    while (heap.length) {
      const [d, n] = pop()
      if (done.has(n)) continue
      done.add(n)
      if (n === to) break
      for (const [m, w] of n.edges) {
        const nd = d + w
        if (nd < (dist.get(m) ?? Infinity)) (dist.set(m, nd), prev.set(m, n), push([nd, m]))
      }
    }
    if (!prev.has(to) && from !== to) return null
    const out = [to]
    while (out[0] !== from) out.unshift(prev.get(out[0]))
    return out
  }
  let line = []
  for (let i = 0; i < tour.length - 1; i++) {
    const a = nearest(tour[i][0], tour[i][1])
    const b = nearest(tour[i + 1][0], tour[i + 1][1])
    const leg = shortest(a, b) ?? [a, b]
    for (const n of leg) {
      const last = line[line.length - 1]
      if (!last || last[0] !== n.x || last[1] !== n.z) line.push([n.x, n.z])
    }
  }
  // Resample every 6 m, then a light moving average to round the corners.
  const res = [line[0]]
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]
    const [bx, bz] = line[i]
    const L = Math.hypot(bx - ax, bz - az)
    let t = 6 - carry
    while (t <= L) (res.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]), (t += 6))
    carry = L - (t - 6)
  }
  res.push(line[line.length - 1])
  const smooth = res.map((p, i) => {
    let x = 0, z = 0, n = 0
    for (let k = -2; k <= 2; k++) {
      const q = res[Math.min(res.length - 1, Math.max(0, i + k))]
      x += q[0]
      z += q[1]
      n++
    }
    return [x / n, z / n]
  })
  return smooth
}

export class AnamFlight {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.6))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.6
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(58, 1, 2, 6000)
    this.progress = 0
    this.boost = 0
    this.speed = 0 // camera speed, m/s
    this.rush = 0 // 0..1, how fast it feels
    this.sunDir = SUN.clone()
    this.lightDir = SUN.clone()
    this.mouse = new THREE.Vector2()
    this.time = 0
    this.heights = null

    this.#buildSky()
    this.#buildGround()
    this.#buildBuildings()
    this.#buildRoute()
    // No crowns over the tiger's road: the low camera would fly through them.
    {
      const C = 4
      const cells = new Map()
      const L = this.route.getLength()
      for (let k = 0, n = Math.ceil(L / 2); k <= n; k++) {
        const q = this.route.getPointAt(k / n)
        const key = `${Math.floor(q.x / C)},${Math.floor(q.z / C)}`
        if (!cells.has(key)) cells.set(key, [])
        cells.get(key).push(q.x, q.z)
      }
      const clear = (x, z, s) => {
        const r = 3.2 * s + 1.5
        const R = Math.ceil(r / C)
        const cx = Math.floor(x / C)
        const cz = Math.floor(z / C)
        for (let i = -R; i <= R; i++)
          for (let j = -R; j <= R; j++) {
            const pts = cells.get(`${cx + i},${cz + j}`)
            if (pts) for (let k = 0; k < pts.length; k += 2) if (Math.hypot(pts[k] - x, pts[k + 1] - z) < r) return false
          }
        return true
      }
      this.trees = buildTrees(this.scene, MOBILE, clear)
    }
    this.#buildHalls()
    this.#buildStatue()
    this.#loadTerrain()

    // The tiger itself, running at the head of its pawprint trail.
    this.tiger = new RunTiger(this.scene, undefined, { scale: 0.024, fur: MOBILE ? 3 : 6 })

    // Bloom: lit windows and the pawprint trail glow as dusk falls.
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.28, 2.6)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    canvas.addEventListener('pointerenter', () => (this.hover = true))
    canvas.addEventListener('pointerleave', () => (this.hover = false))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // Ground height (scene y) at x, z from the heightmap; 0 until it loads.
  groundAt(x, z) {
    const h = this.heights
    if (!h) return 0
    const fx = THREE.MathUtils.clamp((x - T.x0) / T.step, 0, T.w - 1.001)
    const fz = THREE.MathUtils.clamp((z - T.z0) / T.step, 0, T.h - 1.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const a = h[j * T.w + i] * (1 - tx) + h[j * T.w + i + 1] * tx
    const b = h[(j + 1) * T.w + i] * (1 - tx) + h[(j + 1) * T.w + i + 1] * tx
    return a * (1 - tz) + b * tz
  }

  #buildSky() {
    const sky = new Sky()
    sky.scale.setScalar(20000)
    const u = sky.material.uniforms
    u.turbidity.value = 7
    u.rayleigh.value = 2.2
    // Less forward scatter: the low sun no longer bleaches the frame.
    u.mieCoefficient.value = 0.0012
    u.mieDirectionalG.value = 0.6
    // A dim disc: at road level the sun sits in frame and would bleach it.
    u.showSunDisc.value = 0.05
    u.sunPosition.value.copy(SUN)
    this.sky = sky
    this.scene.add(sky)
    // Reflections from the same sky.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    envScene.add(sky.clone())
    this.scene.environment = pmrem.fromScene(envScene, 0, 1, 30000).texture
    this.scene.environmentIntensity = 0.35
    pmrem.dispose()
    this.scene.fog = new THREE.Fog('#b9a08e', 900, 3800)

    this.sun = new THREE.DirectionalLight('#ffc98f', 3.2)
    this.sun.castShadow = true
    const sm = MOBILE ? 1024 : 2048
    this.sun.shadow.mapSize.set(sm, sm)
    const c = this.sun.shadow.camera
    c.left = c.bottom = -330
    c.right = c.top = 330
    c.near = 10
    c.far = 1600
    c.updateProjectionMatrix()
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.6
    this.hemi = new THREE.HemisphereLight('#d8b9a0', '#5a4235', 0.55)
    this.scene.add(this.sun, this.sun.target, this.hemi)
  }

  // Ground texture painted from OSM land areas and streets; relief from DEM.
  #buildGround() {
    const W = X1 - T.x0
    const D = Z1 - T.z0
    const CW = MOBILE ? 2048 : 4096
    const CH = Math.round((CW * D) / W)
    const cv = document.createElement('canvas')
    cv.width = CW
    cv.height = CH
    const ctx = cv.getContext('2d')
    const sx = CW / W
    const P = (x, z) => [(x - T.x0) * sx, (z - T.z0) * sx]
    ctx.fillStyle = '#7b7b78'
    ctx.fillRect(0, 0, CW, CH)
    // Grain so large areas never look flat.
    for (let i = 0; i < CW * CH * 0.004; i++) {
      const v = 120 + Math.random() * 40
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`
      ctx.fillRect(Math.random() * CW, Math.random() * CH, 2 + Math.random() * 3, 2 + Math.random() * 3)
    }
    const FILL = { urban: '#807e79', campus: '#9d978a', dirt: '#9b8a6b', grass: '#6f8a47', wood: '#3f5a2e', parking: '#77736d', pitch: '#4f8a3c', track: '#a8553f', water: '#4c6f86', rock: '#8a857b' }
    for (const a of WORLD.areas) {
      ctx.beginPath()
      a.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x, z)) : ctx.moveTo(...P(x, z))))
      ctx.closePath()
      ctx.fillStyle = FILL[a.k]
      ctx.fill()
      if (a.k === 'wood' || a.k === 'grass') {
        // Mottled canopy / lawn.
        ctx.save()
        ctx.clip()
        const xs = a.p.map((p) => P(...p)[0])
        const ys = a.p.map((p) => P(...p)[1])
        const [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        const n = Math.min(4000, ((maxx - minx) * (maxy - miny)) / (a.k === 'wood' ? 60 : 140))
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = a.k === 'wood' ? `rgba(${30 + Math.random() * 40},${60 + Math.random() * 40},${25 + Math.random() * 20},0.55)` : `rgba(${100 + Math.random() * 30},${130 + Math.random() * 30},${60 + Math.random() * 20},0.35)`
          const r = (a.k === 'wood' ? 3 : 2) * sx * (1 + Math.random() * 2)
          ctx.beginPath()
          ctx.arc(minx + Math.random() * (maxx - minx), miny + Math.random() * (maxy - miny), r, 0, 7)
          ctx.fill()
        }
        ctx.restore()
      }
      if (a.k === 'pitch') {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 0.4 * sx
        ctx.stroke()
      }
    }
    // Streets: asphalt with a lighter edge; walks in pale paving.
    const WID = { w: 14, r: 7, p: 9, f: 3 }
    const COL = { w: '#4a4a4c', r: '#57575a', p: '#b8ad9c', f: '#c2b7a5' }
    for (const k of ['w', 'r', 'p', 'f']) {
      for (const pass of [0, 1]) {
        for (const s of DATA.paths) {
          if (s.k !== k) continue
          ctx.beginPath()
          s.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x, z)) : ctx.moveTo(...P(x, z))))
          ctx.strokeStyle = pass ? COL[k] : 'rgba(40,38,34,0.35)'
          ctx.lineWidth = (WID[k] + (pass ? 0 : 1.2)) * sx
          ctx.lineCap = ctx.lineJoin = 'round'
          ctx.stroke()
        }
      }
    }
    // Building contact shadows (ambient occlusion at the walls' feet).
    ctx.fillStyle = 'rgba(30,26,22,0.35)'
    for (const b of DATA.buildings) {
      ctx.beginPath()
      b.p.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x + 1, z + 1)) : ctx.moveTo(...P(x + 1, z + 1))))
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const seg = MOBILE ? 2 : 1
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / (10 * seg)), Math.round(D / (10 * seg)))
    geo.rotateX(-Math.PI / 2)
    geo.translate(T.x0 + W / 2, 0, T.z0 + D / 2)
    const gmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    // Close-up detail under the aerial photo (Poly Haven, CC0): asphalt on
    // the dark roads, paving on the light walks, leaf litter on green ground,
    // each with its normal map. Tree crowns and their shadows baked into the
    // photo are swapped for plausible ground near the eye (the 3D trees and
    // their real shadows stand there instead); far away the photo is kept.
    const detail = {}
    for (const [k, f] of [['uAsph', 'asphalt_02'], ['uPave', 'patterned_paving_02'], ['uSoil', 'forrest_ground_01']]) {
      for (const [kk, ff, srgb] of [[k, f, true], [k + 'N', f + '_nor', false]]) {
        const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${ff}.jpg`)
        if (srgb) t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        detail[kk] = { value: t }
      }
    }
    gmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, AER, detail)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vXZ;
          uniform sampler2D uAsph, uPave, uSoil, uAsphN, uPaveN, uSoilN;
          ${AER_GLSL}
          const vec3 LUMW = vec3(0.299, 0.587, 0.114);
          // The photo blurred over a few metres: the neighbourhood's colour.
          vec3 aerialBlur(vec2 xz, float b){
            vec2 uc = xz * uCoreX.xy + uCoreX.zw;
            vec2 ub = xz * uBaseX.xy + uBaseX.zw;
            vec2 e = smoothstep(0.0, 0.03, uc) * smoothstep(1.0, 0.97, uc);
            return mix(texture2D(uBase, ub, b - 2.0).rgb, texture2D(uCore, uc, b).rgb, e.x * e.y);
          }
          float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + 1.0), f.x), f.y); }
          // Two scales of one detail texture, as grain around 1 (texture over its own average).
          vec3 grain(sampler2D t, vec2 xz, float s1, float s2, float k){
            vec2 a = xz / s1, b = mat2(0.8, -0.6, 0.6, 0.8) * xz / s2;
            vec3 g1 = texture2D(t, a).rgb / max(texture2D(t, a, 12.0).rgb, vec3(0.02));
            vec3 g2 = texture2D(t, b).rgb / max(texture2D(t, b, 12.0).rgb, vec3(0.02));
            return mix(g1, g2, k);
          }
          vec3 bump(sampler2D t, vec2 xz, float s1, float s2, float k){
            vec2 a = xz / s1, b = mat2(0.8, -0.6, 0.6, 0.8) * xz / s2;
            vec3 n1 = texture2D(t, a).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(t, b).xyz * 2.0 - 1.0;
            n2.xy = mat2(0.8, 0.6, -0.6, 0.8) * n2.xy;
            return mix(n1, n2, k);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec3 gN = vec3(0.0, 0.0, 1.0);
          float gW = 0.0;
          if (uAerOn > 0.5) {
            float dist = length(vViewPosition);
            vec3 raw = aerialAt(vXZ);
            float rl = dot(raw, LUMW);
            // Canopy and its shadow in the photo: very dark, or dark and green.
            float dg = clamp((raw.g - max(raw.r, raw.b)) * 25.0, 0.0, 1.0);
            float canopy = max(smoothstep(0.075, 0.035, rl), dg * smoothstep(0.13, 0.07, rl));
            float swap = canopy * (1.0 - smoothstep(70.0, 280.0, dist));
            // What lies under it: paving in built-up areas, grass and soil in green ones.
            vec3 hood = aerialBlur(vXZ, 6.0);
            float hoodGreen = clamp((hood.g - max(hood.r, hood.b)) * 30.0, 0.0, 1.0);
            float big = gNoise(vXZ / 23.0);
            vec3 under = mix(vec3(0.15, 0.14, 0.12), mix(vec3(0.085, 0.1, 0.045), vec3(0.12, 0.1, 0.07), big), hoodGreen);
            // A little of the neighbourhood's own hue.
            under = mix(under, hood / max(dot(hood, LUMW), 0.01) * dot(under, LUMW), 0.35);
            raw = mix(raw, under, swap);
            vec3 aer = raw * 1.2;
            // The photo's baked shadows are deeper than the scene's own: lift them.
            aer = aer * (1.0 + 1.3 * (1.0 - smoothstep(0.0, 0.2, dot(aer, LUMW)))) + vec3(0.025, 0.024, 0.02);
            aer = pow(aer, vec3(0.85)) * 1.1;
            // Broad, gentle variation so nothing reads as a repeat.
            aer *= mix(1.0, 0.92 + 0.16 * gNoise(vXZ / 41.0 + 7.0), 1.0 - smoothstep(150.0, 500.0, dist));
            float near = 1.0 - smoothstep(40.0, 220.0, dist);
            if (near > 0.0) {
              float lum = dot(aer, LUMW);
              float green = max(clamp((aer.g - max(aer.r, aer.b)) * 10.0, 0.0, 1.0), swap * hoodGreen);
              float paved = smoothstep(0.1, 0.22, lum) * (1.0 - green);
              float k = smoothstep(0.3, 0.7, gNoise(vXZ / 17.0));
              vec3 da = grain(uAsph, vXZ, 1.7, 5.3, k);
              vec3 dp = grain(uPave, vXZ, 2.0, 2.0, 0.0);
              vec3 ds = grain(uSoil, vXZ, 1.9, 6.1, k);
              vec3 d = mix(mix(da, mix(da, dp, 0.7), paved), ds, green);
              d = clamp(d, 0.3, 2.0);
              aer *= mix(vec3(1.0), d, near);
              vec3 na = bump(uAsphN, vXZ, 1.7, 5.3, k);
              vec3 np = bump(uPaveN, vXZ, 2.0, 2.0, 0.0);
              vec3 ns = bump(uSoilN, vXZ, 1.9, 6.1, k);
              gN = mix(mix(na, mix(na, np, 0.7), paved), ns, green);
              gW = near;
            }
            diffuseColor.rgb = aer;
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (gW > 0.0) {
            // Ground tangent frame: u along +x, v along +z, up +y.
            vec3 nw = vec3(gN.x * 1.4, 0.0, gN.y * 1.4);
            normal = normalize(normal + (viewMatrix * vec4(nw, 0.0)).xyz * gW);
          }`,
        )
    }
    this.ground = new THREE.Mesh(geo, gmat)
    this.ground.receiveShadow = true
    this.scene.add(this.ground)
    this.#loadAerial()
  }

  // Swap the drawn map for the real photograph once enough of it has arrived.
  #loadAerial() {
    const origin = DATA.origin
    const base = loadAerial({ origin, x0: T.x0, x1: X1, z0: T.z0, z1: Z1, zoom: 17, maxSize: MOBILE ? 2048 : 4096 })
    const core = loadAerial({ origin, x0: -850, x1: 450, z0: -400, z1: 650, zoom: MOBILE ? 18 : 19, maxSize: MOBILE ? 4096 : 6144 })
    for (const [t, x, l] of [[base.texture, 'uBaseX', 'uBase'], [core.texture, 'uCoreX', 'uCore']]) {
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
      AER[l].value = t
    }
    AER.uBaseX.value.copy(base.xform)
    AER.uCoreX.value.copy(core.xform)
    Promise.all([base.ready, core.ready]).then(([a, b]) => {
      if (a.ok && b.ok) AER.uAerOn.value = 1
    })
  }

  async #loadTerrain() {
    const img = new Image()
    img.src = '/terrain.png'
    await img.decode()
    const c = document.createElement('canvas')
    c.width = T.w
    c.height = T.h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, T.w, T.h).data
    const h = new Float32Array(T.w * T.h)
    for (let i = 0; i < h.length; i++) h[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 100 + T.hmin
    this.heights = h
    const pos = this.ground.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundAt(pos.getX(i), pos.getZ(i)) - 0.3)
    pos.needsUpdate = true
    this.ground.geometry.computeVertexNormals()
    // Things placed on the ground follow the relief.
    for (const t of this.targets) if (t.key) t.anchor.y = this.groundAt(t.anchor.x, t.anchor.z) + t.lift
    if (this.statue) this.statue.position.y = this.groundAt(this.statue.position.x, this.statue.position.z)
    this.#buildClearance()
    this.#buildCameraPath()
    this.#buildPaws()
  }

  // Safe-height map: the highest thing (ground, roof, tower, tree, statue) in
  // each 10 m cell, grown by 30 m so anything flying keeps its distance.
  #buildClearance() {
    const C = 10
    const gw = Math.ceil((X1 - T.x0) / C) + 1
    const gh = Math.ceil((Z1 - T.z0) / C) + 1
    const top = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const x = T.x0 + i * C
        const z = T.z0 + j * C
        top[j * gw + i] = Math.max(this.groundAt(x, z), this.groundAt(x + C, z), this.groundAt(x, z + C), this.groundAt(x + C, z + C))
      }
    const raise = (x0, x1, z0, z1, y) => {
      const i0 = Math.max(0, Math.floor((x0 - T.x0) / C))
      const i1 = Math.min(gw - 1, Math.floor((x1 - T.x0) / C))
      const j0 = Math.max(0, Math.floor((z0 - T.z0) / C))
      const j1 = Math.min(gh - 1, Math.floor((z1 - T.z0) / C))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) top[j * gw + i] = Math.max(top[j * gw + i], y)
    }
    DATA.buildings.forEach((b, k) => {
      const xs = b.p.map((p) => p[0])
      const zs = b.p.map((p) => p[1])
      const tower = TOWERS.test(b.n || '') && WORLD.styles[k] === 'g'
      raise(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), WORLD.bases[k] + b.h * (tower ? 1.8 : 1) + (WORLD.styles[k] === 'g' ? 9 : 0))
    })
    for (let k = 0; k < WORLD.trees.length; k += 4) {
      const [x, z, y, sc] = WORLD.trees.slice(k, k + 4)
      raise(x - 4, x + 4, z - 4, z + 4, y + 11 * sc)
    }
    const [ex, ez] = DATA.landmarks.tiger
    raise(ex - 5, ex + 5, ez - 5, ez + 5, this.groundAt(ex, ez) + 8)
    // Grow by R cells (separable max filter).
    const R = 3
    const tmp = new Float32Array(top.length)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        let m = -1e9
        for (let d = -R; d <= R; d++) m = Math.max(m, top[j * gw + Math.min(gw - 1, Math.max(0, i + d))])
        tmp[j * gw + i] = m
      }
    const out = new Float32Array(top.length)
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        let m = -1e9
        for (let d = -R; d <= R; d++) m = Math.max(m, tmp[Math.min(gh - 1, Math.max(0, j + d)) * gw + i])
        out[j * gw + i] = m
      }
    this.clear = { data: out, gw, gh, C }
  }

  // Highest obstacle within ~30 m of x, z (ground if unknown).
  clearAt(x, z) {
    const c = this.clear
    if (!c) return this.groundAt(x, z)
    const i = THREE.MathUtils.clamp(Math.floor((x - T.x0) / c.C), 0, c.gw - 2)
    const j = THREE.MathUtils.clamp(Math.floor((z - T.z0) / c.C), 0, c.gh - 2)
    const d = c.data
    return Math.max(d[j * c.gw + i], d[j * c.gw + i + 1], d[(j + 1) * c.gw + i], d[(j + 1) * c.gw + i + 1])
  }

  // The whole scroll flight, precomputed: sampled along the tour, lifted over
  // every obstacle, then smoothed
  // so it glides with no kinks or swings.
  // Tiger's-eye view: the camera runs low on the road a few metres behind the
  // tiger and looks down the road past it; route parameter t is the tiger's.
  #routeT(u) {
    const T0 = 0.0005 // at the very start: no trail behind it yet
    return u < TIGER_RUN ? T0 : Math.min(0.999, T0 + ((u - TIGER_RUN) / (TOUR_END - TIGER_RUN)) * (1 - T0))
  }

  // Distance (m) from any point near the tour to the nearest building wall,
  // on a 1 m grid: footprints rasterised, then a two-pass chamfer transform.
  #wallField() {
    const x0 = -900, z0 = -450, W = 1400, H = 1150
    const g = new Float32Array(W * H).fill(1e4)
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    // Red marks a footprint; green and blue carry its roof height (0.1 m steps from -40 m).
    ctx.imageSmoothingEnabled = false
    DATA.buildings.forEach((b, k) => {
      const top = Math.round((WORLD.bases[k] + b.h + 40) * 10)
      ctx.fillStyle = `rgb(255,${(top >> 8) & 255},${top & 255})`
      ctx.beginPath()
      b.p.forEach(([x, z], i) => (i ? ctx.lineTo(x - x0, z - z0) : ctx.moveTo(x - x0, z - z0)))
      ctx.fill()
    })
    const px = ctx.getImageData(0, 0, W, H).data
    const tops = new Float32Array(W * H).fill(-1e4)
    for (let i = 0; i < W * H; i++)
      if (px[i * 4] > 250 && px[i * 4 + 3] > 250) ((g[i] = 0), (tops[i] = (px[i * 4 + 1] * 256 + px[i * 4 + 2]) / 10 - 40))
    const D1 = 1
    const D2 = Math.SQRT2
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        const i = z * W + x
        let v = g[i]
        if (x > 0) v = Math.min(v, g[i - 1] + D1)
        if (z > 0) {
          v = Math.min(v, g[i - W] + D1)
          if (x > 0) v = Math.min(v, g[i - W - 1] + D2)
          if (x < W - 1) v = Math.min(v, g[i - W + 1] + D2)
        }
        g[i] = v
      }
    for (let z = H - 1; z >= 0; z--)
      for (let x = W - 1; x >= 0; x--) {
        const i = z * W + x
        let v = g[i]
        if (x < W - 1) v = Math.min(v, g[i + 1] + D1)
        if (z < H - 1) {
          v = Math.min(v, g[i + W] + D1)
          if (x < W - 1) v = Math.min(v, g[i + W + 1] + D2)
          if (x > 0) v = Math.min(v, g[i + W - 1] + D2)
        }
        g[i] = v
      }
    const at = (x, z) => {
      const i = Math.round(x - x0)
      const j = Math.round(z - z0)
      if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) return 1e4
      return g[j * W + i]
    }
    return {
      top: (x, z) => {
        const i = Math.round(x - x0)
        const j = Math.round(z - z0)
        return i < 0 || j < 0 || i >= W || j >= H ? -1e4 : tops[j * W + i]
      },
      dist: at,
      grad: (x, z) => {
        const gx = at(x + 1, z) - at(x - 1, z)
        const gz = at(x, z + 1) - at(x, z - 1)
        const l = Math.hypot(gx, gz) || 1
        return [gx / l, gz / l]
      },
    }
  }

  #buildCameraPath() {
    const N = 1600
    const A = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), lx: new Float32Array(N), ly: new Float32Array(N), lz: new Float32Array(N) }
    const L = this.route.getLength()
    // Keep the eye off the walls (footpaths often hug a building) and keep
    // the tiger in sight: try the full chase distance first, pushed out of
    // any wall, and close in when a building would stand between them.
    const F = this.wallF ?? this.#wallField()
    const clearOf = (c) => {
      for (let it = 0; it < 6; it++) {
        const d = F.dist(c.x, c.z)
        if (d >= CHASE.wall) break
        const [gx, gz] = F.grad(c.x, c.z)
        c.x += gx * (CHASE.wall - d + 0.3)
        c.z += gz * (CHASE.wall - d + 0.3)
      }
      return c
    }
    // Clear line from the eye to the tiger: no wall and no rise of ground.
    const eyeY = (c, p) => Math.max(this.groundAt(p.x, p.z) + CHASE.up, this.groundAt(c.x, c.z) + 1.5)
    const sees = (c, p) => {
      const n = Math.ceil(Math.hypot(p.x - c.x, p.z - c.z))
      const y0 = eyeY(c, p)
      const y1 = this.groundAt(p.x, p.z) + 1.2
      for (let k = 1; k < n - 2; k++) {
        const f = k / n
        const x = c.x + (p.x - c.x) * f
        const z = c.z + (p.z - c.z) * f
        const line = y0 + (y1 - y0) * f
        if ((F.dist(x, z) < 0.6 && F.top(x, z) > line - 2) || this.groundAt(x, z) > line - 0.4) return false
      }
      return y0 - y1 < CHASE.up * 1.6
    }
    const blur = (arr, r, passes = 3) => {
      const t = new Float32Array(arr.length)
      for (let p = 0; p < passes; p++) {
        for (let i = 0; i < arr.length; i++) {
          let s = 0
          let n = 0
          for (let d = -r; d <= r; d++) {
            const k = Math.min(arr.length - 1, Math.max(0, i + d))
            s += arr[k]
            n++
          }
          t[i] = s / n
        }
        arr.set(t)
      }
    }
    // Pass 1, where the eye stands: the longest chase distance that keeps
    // the tiger in sight, pushed off the walls.
    const TP = []
    const cx = new Float32Array(N)
    const cz = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const t = this.#routeT(i / (N - 1))
      const tp = this.route.getPointAt(t)
      TP.push(tp)
      let c = null
      for (const back of [CHASE.back, 13, 10, 7, 5]) {
        const tryC = clearOf(this.route.getPointAt(Math.max(0, t - back / L)))
        if (sees(tryC, tp)) {
          c = tryC
          break
        }
      }
      c ??= this.route.getPointAt(Math.max(0, t - 5 / L))
      cx[i] = c.x
      cz[i] = c.z
    }
    // Pass 2: smooth it, keep it off the walls, and wherever smoothing has
    // put something between eye and tiger, slide the eye along that line
    // toward the tiger until it sees it again.
    blur(cx, 4)
    blur(cz, 4)
    const v = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      clearOf(v.set(cx[i], 0, cz[i]))
      const tp = TP[i]
      for (let k = 0; k < 8 && !sees(v, tp); k++) v.lerp(new THREE.Vector3(tp.x, 0, tp.z), 0.2)
      cx[i] = v.x
      cz[i] = v.z
    }
    // Pass 3: height and aim from the final eye position.
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      const t = this.#routeT(u)
      const tp = TP[i]
      const q = this.route.getPointAt(Math.min(1, t + CHASE.ahead / L))
      const up = THREE.MathUtils.smoothstep(u, TOUR_END, 1)
      const ground = this.groundAt(tp.x, tp.z)
      const c = { x: cx[i], z: cz[i] }
      A.x[i] = c.x
      A.z[i] = c.z + up * 420
      // Height above the tiger's own ground, never into the slope under the eye.
      const camY = Math.max(ground + CHASE.up, this.groundAt(c.x, c.z) + 1.5)
      A.y[i] = camY + up * 520
      // Aim down the road, but never so far off the tiger (round a bend, or
      // looking out over it from a rise) that it leaves the frame.
      const dT = Math.hypot(tp.x - c.x, tp.z - c.z)
      const yawT = Math.atan2(tp.x - c.x, tp.z - c.z)
      let dy = Math.atan2(q.x - c.x, q.z - c.z) - yawT
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      const yaw = yawT + THREE.MathUtils.clamp(dy, -0.22, 0.22)
      const r = Math.max(20, Math.hypot(q.x - c.x, q.z - c.z))
      const pitchT = Math.atan2(ground + 1.2 - camY, Math.max(1, dT))
      const pitchQ = Math.atan2(Math.max(this.groundAt(q.x, q.z), ground) + CHASE.look - camY, r)
      const pitch = THREE.MathUtils.clamp(pitchQ, pitchT - 0.05, pitchT + 0.32)
      A.lx[i] = THREE.MathUtils.lerp(c.x + Math.sin(yaw) * r, 60, up)
      A.lz[i] = THREE.MathUtils.lerp(c.z + Math.cos(yaw) * r, -380, up)
      A.ly[i] = THREE.MathUtils.lerp(camY + Math.tan(pitch) * r, 0, up)
    }
    blur(A.y, 3)
    for (const k of ['lx', 'lz', 'ly']) blur(A[k], 6)
    const R = A
    this.path = { ...R, N }
    // Lock-ons peak when the aim passes closest to each landmark.
    for (const tg of this.targets) {
      let best = 0
      let bd = Infinity
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(R.lx[i] - tg.anchor.x, R.lz[i] - tg.anchor.z)
        if (d < bd) (bd = d), (best = i)
      }
      tg.u = best / (N - 1)
    }
    this.#buildPace()
  }

  // Scroll -> path position. The path itself runs at an even speed; here the
  // flight eases off at the gate and at every landmark (more scroll per
  // metre, so it lingers) and rushes through the stretches in between.
  #buildPace() {
    const N = 800
    const cum = new Float32Array(N)
    let acc = 0
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      let d = 0.55 + 1.6 * Math.exp(-((u / 0.04) ** 2))
      for (const t of this.targets) if (t.u !== undefined) d += 2.4 * Math.exp(-(((u - t.u) / 0.02) ** 2))
      cum[i] = acc
      acc += d
    }
    this.pace = (s) => {
      const want = THREE.MathUtils.clamp(s, 0, 1) * cum[N - 1]
      let lo = 0
      let hi = N - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (cum[mid] < want) lo = mid
        else hi = mid
      }
      const t = (want - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo])
      return (lo + THREE.MathUtils.clamp(t, 0, 1)) / (N - 1)
    }
  }

  #setNight(n) {
    NIGHT.value = n
    const u = this.sky.material.uniforms
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - THREE.MathUtils.lerp(11, 0.6, n)), THREE.MathUtils.degToRad(235 + n * 12))
    u.sunPosition.value.copy(this.sunDir)
    u.rayleigh.value = 1.9 + n * 2.2
    u.turbidity.value = 7 - n * 4
    // The light itself never drops below the horizon.
    this.lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - THREE.MathUtils.lerp(11, 4, n)), THREE.MathUtils.degToRad(235 + n * 12))
    this.sun.intensity = THREE.MathUtils.lerp(3.2, 0.45, n)
    this.sun.color.lerpColors(...DUSK.sun, n)
    this.hemi.intensity = THREE.MathUtils.lerp(0.55, 0.32, n)
    this.hemi.color.lerpColors(...DUSK.sky, n)
    this.scene.fog.color.lerpColors(...DUSK.fog, n)
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.35, 0.12, n)
  }

  #buildBuildings() {
    // Every footprint becomes a real-looking block: walls with bays centred on
    // each wall, a parapet with coping on flat roofs, a dressed-stone plinth and
    // cornice on the stone halls, slate roofs (hipped or mansard) on the gothic
    // halls, and towers with battlements and pinnacles on the three great halls.
    const geos = []
    const add = (geo, style, seed, base, top, poly) => {
      geo = geo.index ? geo.toNonIndexed() : geo
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
      if (!geo.attributes.normal) geo.computeVertexNormals()
      if (style === BST.slate) slopeUV(geo)
      else wallUV(geo, poly)
      geos.push(tagB(geo, style, seed, base, top))
    }
    const prism = (poly, y0, y1) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: y1 - y0, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      g.translate(0, y0, 0)
      return g
    }
    const ring = (poly, inset, y0, y1) => {
      const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
      shape.holes.push(new THREE.Path(offsetPoly(poly, -inset).map(([x, z]) => new THREE.Vector2(x, -z))))
      const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      g.translate(0, y0, 0)
      return g
    }
    // Sloped band from the footprint edge up to an inset ring, flat inside.
    const mansard = (poly, inset, y0, rh) => {
      const inner = offsetPoly(poly, -inset)
      const outer = offsetPoly(poly, 0.45) // eaves
      const pos = []
      const tri = (p, q, r) => {
        const n = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p))
        if (n.y < 0) pos.push(...p.toArray(), ...r.toArray(), ...q.toArray())
        else pos.push(...p.toArray(), ...q.toArray(), ...r.toArray())
      }
      for (let i = 0; i < outer.length - 1; i++) {
        const o0 = new THREE.Vector3(outer[i][0], y0, outer[i][1])
        const o1 = new THREE.Vector3(outer[i + 1][0], y0, outer[i + 1][1])
        const i0 = new THREE.Vector3(inner[i][0], y0 + rh, inner[i][1])
        const i1 = new THREE.Vector3(inner[i + 1][0], y0 + rh, inner[i + 1][1])
        tri(o0, o1, i1)
        tri(o0, i1, i0)
      }
      const slope = new THREE.BufferGeometry()
      slope.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      slope.computeVertexNormals()
      const cap = new THREE.ShapeGeometry(new THREE.Shape(inner.map(([x, z]) => new THREE.Vector2(x, -z))))
      cap.rotateX(-Math.PI / 2)
      cap.translate(0, y0 + rh, 0)
      return { slope, cap, inner }
    }
    // An inset of a concave footprint can fold over itself and throw a roof
    // plane across the sky: only use it when every inset corner and edge
    // midpoint stays inside the footprint and the area shrinks sensibly.
    const inPoly = (x, z, poly) => {
      let r = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]
        const [xj, zj] = poly[j]
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r
      }
      return r
    }
    const insetOk = (poly, inset) => {
      const inner = offsetPoly(poly, -inset)
      for (let i = 0; i < inner.length - 1; i++) {
        const [x0, z0] = inner[i]
        const [x1, z1] = inner[i + 1]
        if (!inPoly(x0, z0, poly) || !inPoly((x0 + x1) / 2, (z0 + z1) / 2, poly)) return false
        if (Math.hypot(x1 - x0, z1 - z0) > 400) return false
      }
      const k = area(inner) / Math.max(1, area(poly))
      return k > 0.15 && k < 0.97
    }
    const area = (poly) => {
      let a = 0
      for (let i = 0; i < poly.length - 1; i++) a += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1]
      return Math.abs(a / 2)
    }

    // Road points, for turning each hall's entrance to the street.
    const roadPts = []
    for (const w of DATA.paths) for (const q of w.p) roadPts.push(q)
    const roadDist = (x, z) => {
      let d = Infinity
      for (const [rx, rz] of roadPts) d = Math.min(d, (rx - x) ** 2 + (rz - z) ** 2)
      return Math.sqrt(d)
    }
    // Main entrance of a stone hall: a projecting stone frontispiece with a
    // pointed-arch doorway (gothic) or a round arch, an oak door and three steps,
    // on the longest wall that faces the nearest road.
    const entrance = (P, base, top, seed, gothic) => {
      let area2 = 0
      for (let k = 0; k < P.length - 1; k++) area2 += P[k][0] * P[k + 1][1] - P[k + 1][0] * P[k][1]
      const sgn = area2 > 0 ? 1 : -1
      const edges = []
      for (let k = 0; k < P.length - 1; k++) {
        const [x0, z0] = P[k]
        const [x1, z1] = P[k + 1]
        const len = Math.hypot(x1 - x0, z1 - z0)
        if (len < 9) continue
        const tx = (x1 - x0) / len
        const tz = (z1 - z0) / len
        edges.push({ len, tx, tz, nx: tz * sgn, nz: -tx * sgn, mx: (x0 + x1) / 2, mz: (z0 + z1) / 2 })
      }
      if (!edges.length) return
      const maxL = Math.max(...edges.map((e) => e.len))
      let best = null
      for (const e of edges) {
        if (e.len < maxL * 0.55) continue
        const d = roadDist(e.mx + e.nx * 4, e.mz + e.nz * 4)
        const score = d - e.len * 0.15
        if (!best || score < best.score) best = { ...e, score }
      }
      const e = best
      const W = Math.min(6.4, e.len * 0.3)
      const ow = W * 0.42 // opening width
      const sill = 0.5
      const oh = Math.min(4.6, (top - base) * 0.45) // opening height to the apex
      const ph = Math.min(top - base - 1, oh + 2.2)
      const depth = 1.1
      // Outline in local x (along the wall), y (up); gabled top on gothic halls.
      const sh = new THREE.Shape()
      sh.moveTo(-W / 2, 0)
      sh.lineTo(W / 2, 0)
      sh.lineTo(W / 2, ph)
      if (gothic) sh.lineTo(0, ph + W * 0.32)
      sh.lineTo(-W / 2, ph)
      sh.closePath()
      const hole = new THREE.Path()
      const r = ow / 2
      const y0 = sill + oh - (gothic ? r * 1.732 : r)
      hole.moveTo(-r, sill)
      hole.lineTo(r, sill)
      hole.lineTo(r, y0)
      if (gothic) {
        // Equilateral pointed arch: arcs of radius 2r about the opposite springers.
        for (let k = 1; k <= 8; k++) {
          const t = (k / 8) * (Math.PI / 3)
          hole.lineTo(-r + 2 * r * Math.cos(t), y0 + 2 * r * Math.sin(t))
        }
        for (let k = 7; k >= 0; k--) {
          const t = (k / 8) * (Math.PI / 3)
          hole.lineTo(r - 2 * r * Math.cos(t), y0 + 2 * r * Math.sin(t))
        }
      } else {
        for (let k = 1; k <= 12; k++) {
          const t = (k / 12) * Math.PI
          hole.lineTo(r * Math.cos(t), y0 + r * Math.sin(t))
        }
      }
      hole.lineTo(-r, sill)
      sh.holes.push(hole)
      const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(e.tx, 0, e.tz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(e.nx, 0, e.nz))
      M.setPosition(e.mx, base, e.mz)
      const place = (g) => g.applyMatrix4(M)
      const front = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false })
      front.translate(0, 0, -0.2)
      const fp = [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, depth], [-W / 2, depth], [-W / 2, -0.2]].map(([x, z]) => {
        const v = new THREE.Vector3(x, 0, z).applyMatrix4(M)
        return [v.x, v.z]
      })
      add(place(front), BST.trim, seed, base, top, fp)
      // Deep reveal behind the arch, then the door set back in it.
      const door = new THREE.PlaneGeometry(ow, oh)
      door.translate(0, sill + oh / 2, 0.15)
      add(place(door), BST.door, seed, base, top, fp)
      // Three steps up to the sill, wider than the doorway.
      for (let k = 0; k < 3; k++) {
        const st = new THREE.BoxGeometry(ow + 1.6 - k * 0.3, (sill * (3 - k)) / 3, 0.42)
        st.translate(0, (sill * (3 - k)) / 6, depth + 0.21 + (2 - k) * 0.42)
        add(place(st), BST.trim, seed, base, top, fp)
      }
    }

    DATA.buildings.forEach((b, i) => {
      const base = WORLD.bases[i]
      const s = STYLE[WORLD.styles[i]]
      const seed = ((i * 0.6180339) % 1 + 1) % 1
      const top = base + b.h
      const P = b.p
      const o = obb(P)
      const fill = area(P) / Math.max(1, o.L * o.W)
      add(prism(P, base - 1, top), s, seed, base, top, P)
      const stone = s === STYLE.g || s === STYLE.c
      if (stone && b.c) {
        // Plinth (base course) and cornice in dressed granite.
        const pl = offsetPoly(P, 0.22)
        add(prism(pl, base - 1, base + 1.1), BST.trim, seed, base, top, pl)
        const co = offsetPoly(P, 0.32)
        add(prism(co, top - 0.55, top - 0.1), BST.trim, seed, base, top, co)
      }
      if (stone && b.c && b.h >= 8) entrance(P, base, top, seed, s === STYLE.g)
      if (s === STYLE.g) {
        // Slate roof: hipped over simple blocks, mansard over wings and courts.
        const rh = Math.min(7.5, o.W * 0.38)
        if (fill > 0.86) {
          const roof = hipRoof(o.L + 1.0, o.W + 1.0, rh)
          roof.rotateY(-o.a)
          roof.translate(o.cx, top, o.cz)
          add(roof, BST.slate, seed, base, top, P)
        } else if (o.W > 7 && insetOk(P, Math.min(4.5, o.W * 0.3))) {
          const m = mansard(P, Math.min(4.5, o.W * 0.3), top, Math.min(4, rh))
          add(m.slope, BST.slate, seed, base, top, P)
          add(m.cap, s, seed, base, top, m.inner)
        }
        if (TOWERS.test(b.n)) {
          const tw = Math.min(11, o.W * 0.7)
          const tTop = base + b.h * 1.75
          const m = new THREE.Matrix4().makeRotationY(-o.a).setPosition(o.cx, 0, o.cz)
          const sq = (h) => {
            const pts = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(m))
            return pts.map((v) => [v.x, v.z])
          }
          const shaft = sq(tw / 2)
          add(prism(shaft, top - 1, tTop), STYLE.g, seed, base, tTop, shaft)
          const band = offsetPoly(shaft, 0.3)
          add(prism(band, tTop - 0.2, tTop + 0.35), BST.trim, seed, base, tTop, band)
          if (b.n === '본관') {
            // The clock tower's steep slate spire.
            const spire = new THREE.ConeGeometry(tw * 0.74, tw * 1.25, 4, 1)
            spire.rotateY(Math.PI / 4)
            spire.translate(0, tTop + 0.35 + tw * 0.625, 0)
            spire.applyMatrix4(m)
            add(spire, BST.slate, seed, base, tTop, shaft)
          } else {
            // Battlements: a parapet with merlons, and a pinnacle at each corner.
            add(ring(band, 0.55, tTop + 0.35, tTop + 1.5), BST.trim, seed, base, tTop, band)
            const h = tw / 2 + 0.3
            const nM = Math.max(3, Math.round(tw / 1.4))
            for (let side = 0; side < 4; side++) {
              for (let q = 1; q < nM; q++) {
                const t = -h + (2 * h * q) / nM
                const [x, z] = side === 0 ? [t, -h] : side === 1 ? [h, t] : side === 2 ? [-t, h] : [-h, -t]
                const mer = new THREE.BoxGeometry(0.75, 0.9, 0.55)
                if (side % 2) mer.rotateY(Math.PI / 2)
                mer.translate(x, tTop + 1.95, z)
                mer.applyMatrix4(m)
                add(mer, BST.trim, seed, base, tTop, band)
              }
            }
            for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
              const post = new THREE.BoxGeometry(1.1, 3.4, 1.1)
              post.translate(x, tTop + 2.05, z)
              post.applyMatrix4(m)
              add(post, BST.trim, seed, base, tTop, band)
              const cap = new THREE.ConeGeometry(0.85, 2.2, 4, 1)
              cap.rotateY(Math.PI / 4)
              cap.translate(x, tTop + 3.75 + 1.1, z)
              cap.applyMatrix4(m)
              add(cap, BST.slate, seed, base, tTop, band)
            }
          }
        }
      } else if (o.W > 4) {
        // Flat roof: parapet, with metal or stone coping on the campus blocks.
        const ph = s === STYLE.t ? 0.6 : 0.95
        add(ring(P, 0.3, top, top + ph), s, seed, base, top, P)
        if (b.c && s !== STYLE.t) {
          const cp = offsetPoly(P, 0.06)
          add(ring(cp, 0.42, top + ph, top + ph + 0.12), s === STYLE.c ? BST.trim : BST.coping, seed, base, top, cp)
        }
      }
    })
    this.buildings = new THREE.Mesh(mergeGeometries(geos), buildingMaterial())
    this.buildings.castShadow = this.buildings.receiveShadow = true
    this.scene.add(this.buildings)
  }


  #buildRoute() {
    // The tour follows real roads and footpaths: each leg between landmarks
    // is the shortest way along the OSM network, so the tiger (and the trail
    // and camera above it) never cut through a building.
    // Open roads over lanes squeezed between buildings: an edge costs up to
    // five times its length when it runs within 8 m of a wall.
    this.wallF = this.#wallField()
    const F = this.wallF
    const nearWall = (x, z) => Math.max(0, 1 - F.dist(x, z) / 8)
    const cost = (ax, az, bx, bz) => 1 + 4 * Math.max(nearWall(ax, az), nearWall(bx, bz), nearWall((ax + bx) / 2, (az + bz) / 2))
    // Tour waypoints that sit against a wall move out into open ground, so
    // the leg passes a landmark at a distance instead of brushing it.
    const tour = WORLD.tour.map(([x, z, ...rest]) => {
      for (let it = 0; it < 30 && F.dist(x, z) < 16; it++) {
        const [gx, gz] = F.grad(x, z)
        x += gx
        z += gz
      }
      return [x, z, ...rest]
    })
    const pts = roadTour(tour, DATA.paths, cost).map(([x, z]) => new THREE.Vector3(x, 0, z))
    this.route = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)

    const hallOf = (name) => {
      let best = null
      DATA.buildings.forEach((b, i) => {
        if (b.n !== name) return
        const xs = b.p.map((p) => p[0])
        const zs = b.p.map((p) => p[1])
        const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))
        if (!best || size > best.size) best = { b, i, xs, zs, size }
      })
      return best
    }
    this.targets = TARGETS.map((t) => {
      let anchor
      let box = null
      let lift = 0
      if (t.key) {
        const [x, z] = DATA.landmarks[t.key]
        lift = t.key === 'tiger' ? 8 : 12
        anchor = new THREE.Vector3(x, lift, z)
      } else {
        const { b, i, xs, zs } = hallOf(t.hall)
        const base = WORLD.bases[i]
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2
        const cz = (Math.max(...zs) + Math.min(...zs)) / 2
        anchor = new THREE.Vector3(cx, base + b.h + 6, cz)
        box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(...xs) - Math.min(...xs) + 6, b.h + 6, Math.max(...zs) - Math.min(...zs) + 6)),
          new THREE.LineBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0, fog: false }),
        )
        box.position.set(cx, base + (b.h + 6) / 2, cz)
        this.scene.add(box)
      }
      let bestU = 0
      let bestD = Infinity
      for (let k = 0; k <= 400; k++) {
        const q = this.route.getPointAt(k / 400)
        const d = Math.hypot(q.x - anchor.x, q.z - anchor.z)
        if (d < bestD) (bestD = d), (bestU = k / 400)
      }
      return { ...t, anchor, box, lift, u: bestU }
    })
  }

  // Every named campus building gets a name tag (one per name, on its largest
  // footprint); lock-on targets keep their reticles instead.
  #buildHalls() {
    const locked = new Set(TARGETS.map((t) => t.hall).filter(Boolean))
    const best = new Map()
    DATA.buildings.forEach((b, i) => {
      if (!b.c || !b.n || locked.has(b.n)) return
      let area = 0
      let cx = 0
      let cz = 0
      b.p.forEach(([x, z], k) => {
        const [x2, z2] = b.p[(k + 1) % b.p.length]
        area += x * z2 - x2 * z
        cx += x
        cz += z
      })
      area = Math.abs(area / 2)
      if ((best.get(b.n)?.area ?? -1) < area)
        best.set(b.n, { name: b.n, code: b.code, lv: b.lv, style: WORLD.styles[i], area, size: Math.sqrt(area), anchor: new THREE.Vector3(cx / b.p.length, WORLD.bases[i] + b.h + 3, cz / b.p.length) })
    })
    this.halls = [...best.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    // Directory: every named hall, lock-on ones included.
    this.directory = [
      ...this.halls,
      ...this.targets.filter((t) => t.hall).map((t) => ({ name: t.name, code: t.code, en: t.en, body: t.body, anchor: t.anchor, size: 60 })),
      ...this.targets.filter((t) => t.key && t.key !== 'gate').map((t) => ({ name: t.name, en: t.en, body: t.body, anchor: t.anchor, size: 40, key: t.key })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  // 호상: a granite plinth with a crimson beacon marking the tiger statue.
  #buildStatue() {
    const [x, z] = DATA.landmarks.tiger
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const stone = new THREE.MeshStandardMaterial({ color: '#8f8a84', roughness: 0.85 })
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), stone)
    plinth.position.y = 1.5
    plinth.castShadow = true
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.6, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    beacon.position.y = 23
    g.add(plinth, beacon)
    this.beacon = beacon
    this.statue = g
    this.scene.add(g)
  }

  // Tiger pawprints along the tour, left and right in turn, left behind by
  // the running tiger and glowing hottest just behind it.
  #buildPaws() {
    const prints = []
    const L = this.route.getLength()
    const n = Math.floor(L / 4.2)
    for (let k = 1; k < n; k++) {
      const t = k / n
      const p = this.route.getPointAt(t)
      const d = this.route.getTangentAt(t).setY(0).normalize()
      const side = k % 2 ? 0.7 : -0.7
      const x = p.x - d.z * side
      const z = p.z + d.x * side
      // Its place on the route: it lights once the tiger has run past it.
      prints.push({ x, z, a: Math.atan2(d.x, d.z), u: t })
    }
    // One paw: a heel pad and four toes, 3 m long, in the XZ plane.
    const parts = [[0, -0.35, 0.62, 0.5]]
    for (const [tx, tz] of [[-0.55, 0.35], [-0.2, 0.62], [0.2, 0.62], [0.55, 0.35]]) parts.push([tx, tz, 0.2, 0.26])
    const geos = parts.map(([px, pz, rx, rz]) => {
      const c = new THREE.CircleGeometry(1, 20)
      c.scale(rx, rz, 1)
      c.rotateX(-Math.PI / 2)
      c.translate(px, 0, -pz)
      return c
    })
    const paw = mergeGeometries(geos)
    paw.scale(0.9, 1, 0.9)
    const mesh = new THREE.InstancedMesh(
      paw,
      new THREE.ShaderMaterial({
        uniforms: { uHead: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `attribute float aU; varying float vU;
          void main(){ vU = aU; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uHead; uniform float uTime; varying float vU;
          void main(){
            float on = step(vU, uHead);
            float hot = exp(-max(uHead - vU, 0.0) * 60.0);
            float a = on * (0.1 + 0.6 * hot) * (0.85 + 0.15 * sin(uTime * 6.0 + vU * 300.0));
            gl_FragColor = vec4(vec3(1.0, 0.16 + hot * 0.35, 0.08) * (0.8 + hot * 1.6), a);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
      prints.length,
    )
    const aU = new Float32Array(prints.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    prints.forEach((pr, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pr.a)
      m.compose(new THREE.Vector3(pr.x, this.groundAt(pr.x, pr.z) + 0.06, pr.z), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m)
      aU[i] = pr.u
    })
    mesh.geometry.setAttribute('aU', new THREE.InstancedBufferAttribute(aU, 1))
    mesh.frustumCulled = false
    this.paws = mesh
    this.scene.add(mesh)
  }


  // Directory: fly over to circle a hall; scrolling hands control back.
  flyTo(h) {
    this.free = { hall: h, t: 0, from: this.camera.position.clone(), fromLook: this.look.clone(), progress: this.progress, ang: Math.atan2(this.camera.position.x - h.anchor.x, this.camera.position.z - h.anchor.z) }
  }

  exitFree() {
    if (!this.free) return
    this.blend = { t: 0, pos: this.camera.position.clone(), look: this.look.clone() }
    this.free = null
    this.onExitFree?.()
  }

  // Slow device: step the render resolution down (and back up when there is
  // headroom), judged over two seconds of frames.
  #adapt(dt) {
    const A = (this.adaptive ??= { t: 0, n: 0, sum: 0, scale: 1 })
    A.t += dt
    A.n++
    A.sum += dt
    if (A.t < 2) return
    const avg = A.sum / A.n
    A.t = A.n = A.sum = 0
    const next = avg > 1 / 40 ? Math.max(0.55, A.scale - 0.15) : avg < 1 / 57 ? Math.min(1, A.scale + 0.1) : A.scale
    if (next === A.scale) return
    A.scale = next
    const pr = Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.6) * next
    this.renderer.setPixelRatio(pr)
    this.composer.setPixelRatio(pr)
    this.resize()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 74 : 58
    this.camera.updateProjectionMatrix()
  }

  // A still of the campus (used to bake the hero and finale backdrops):
  // the statue and lock-on boxes are left out.
  still(pos, look, { w = 2400, h = 1500, fov = 50, statue = false } = {}) {
    const keep = this.statue.visible
    this.statue.visible = statue
    for (const t of this.targets) if (t.box) t.box.visible = false
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
    this.camera.position.set(...pos)
    this.camera.lookAt(...look)
    this.sun.target.position.set(...look)
    this.sun.position.set(...look).addScaledVector(this.lightDir, 900)
    this.renderer.render(this.scene, this.camera)
    const url = this.canvas.toDataURL('image/jpeg', 0.88)
    this.statue.visible = keep
    for (const t of this.targets) if (t.box) t.box.visible = true
    this.resize()
    return url
  }

  // Screen position of a world point, or null if behind the camera.
  screen(v) {
    const p = v.clone().project(this.camera)
    if (p.z > 1) return null
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight }
  }

  #tourPose(u) {
    const up = THREE.MathUtils.smoothstep(u, TOUR_END, 1)
    this.overview = up
    const P = this.path
    const pos = new THREE.Vector3()
    const look = new THREE.Vector3()
    if (P) {
      const f = u * (P.N - 1)
      const i = Math.min(P.N - 2, Math.floor(f))
      const t = f - i
      const L = (a) => a[i] + (a[i + 1] - a[i]) * t
      pos.set(L(P.x), L(P.y), L(P.z))
      look.set(L(P.lx), L(P.ly), L(P.lz))
    } else {
      // Terrain still loading: hold high over the main gate.
      const [gx, gz] = DATA.landmarks.gate
      pos.set(gx, 200, gz + 260)
      look.set(gx, 0, gz - 100)
    }
    // Gentle pointer steer, never into anything.
    const side = new THREE.Vector3(look.z - pos.z, 0, pos.x - look.x).normalize()
    pos.addScaledVector(side, -this.mouse.x * 1.5 * (1 - up))
    pos.y += this.mouse.y * 0.8 * (1 - up)
    // Passing a landmark, the tiger's gaze turns to it and the eye lifts a little.
    if (this.targets && !up) {
      let w = 0
      const at = new THREE.Vector3()
      // Only landmarks standing back from the road: a wall right beside it
      // would fill the frame.
      for (const t of this.targets) if (t.near > w && Math.hypot(t.anchor.x - pos.x, t.anchor.z - pos.z) > 30) (w = t.near), at.copy(t.anchor)
      w = THREE.MathUtils.smootherstep(w, 0, 1)
      if (w > 0) {
        // Turn toward it, but never more than ~35° off the road, and tilt up
        // to take in the facade; the tiger stays in frame.
        const road = Math.atan2(look.x - pos.x, look.z - pos.z)
        let off = Math.atan2(at.x - pos.x, at.z - pos.z) - road
        off = Math.atan2(Math.sin(off), Math.cos(off))
        const yaw = road + THREE.MathUtils.clamp(off, -0.15, 0.15) * w
        const r = Math.hypot(look.x - pos.x, look.z - pos.z)
        pos.y += w * 4
        look.set(pos.x + Math.sin(yaw) * r, look.y + w * 3, pos.z + Math.cos(yaw) * r)
      }
    }
    pos.y = Math.max(pos.y, THREE.MathUtils.lerp(this.groundAt(pos.x, pos.z) + 1.5, this.clearAt(pos.x, pos.z) + 22, up))
    // Portrait screens see more sky, so they look further down.
    look.y -= this.portrait ? 2 + up * 170 : 0
    // A tall screen is narrow: keep the aim within a few degrees of the tiger.
    if (this.portrait && this.tiger?.ready && up < 1 && !this.free) {
      const T = this.tiger.group.position
      const yT = Math.atan2(T.x - pos.x, T.z - pos.z)
      const r = Math.hypot(look.x - pos.x, look.z - pos.z)
      let d = Math.atan2(look.x - pos.x, look.z - pos.z) - yT
      d = Math.atan2(Math.sin(d), Math.cos(d))
      const yaw = yT + THREE.MathUtils.lerp(THREE.MathUtils.clamp(d, -0.12, 0.12), d, up)
      look.x = pos.x + Math.sin(yaw) * r
      look.z = pos.z + Math.cos(yaw) * r
    }
    return { pos, look }
  }

  render(dt) {
    this.time += dt
    this.boost += ((this.hover && !this.free ? 0.03 : 0) - this.boost) * Math.min(1, dt * 2)
    const s = this.pace ? this.pace(this.progress) : this.progress
    const u = Math.min(1, s + this.boost * (1 - s))
    // Critically damped follow of the scroll position.
    this.u = this.u === undefined ? u : this.u + (u - this.u) * (1 - Math.exp(-dt * 2.6))
    this.look ??= new THREE.Vector3()

    let pose = this.#tourPose(this.u)
    if (this.route && !this.free && this.u < 0.12) {
      const { p, d } = this.#tigerAt(this.u)
      // Beside it and a little ahead, so the roar is seen three-quarter on
      // and the tiger crosses the frame as it sets off.
      const T = this.#tigerAt(0).p
      const d0 = this.route.getTangentAt(0.001).setY(0).normalize()
      const s0 = new THREE.Vector3(-d0.z, 0, d0.x)
      const close = {
        pos: T.clone().addScaledVector(d0, 7).addScaledVector(s0, 15).setY(T.y + 3.8),
        look: p.clone().addScaledVector(d, 2).setY(p.y + 2.2),
      }
      // The camera climbs away first; its eyes stay on the running tiger a
      // little longer before turning to the road ahead.
      const k = THREE.MathUtils.smootherstep(this.u, 0.03, 0.06)
      const kl = THREE.MathUtils.smootherstep(this.u, 0.03, 0.055)
      pose = { pos: close.pos.lerp(pose.pos, k), look: close.look.lerp(pose.look, kl) }
    }
    if (this.free && Math.abs(this.progress - this.free.progress) > 0.004) this.exitFree()
    if (this.free) {
      const f = this.free
      const h = f.hall
      f.t += dt
      f.ang += dt * 0.1
      const r = Math.max(80, h.size * 1.9)
      const orbit = new THREE.Vector3(h.anchor.x + Math.sin(f.ang) * r, 0, h.anchor.z + Math.cos(f.ang) * r)
      orbit.y = Math.max(h.anchor.y + 30 + r * 0.3, this.clearAt(orbit.x, orbit.z) + 30)
      const k = THREE.MathUtils.smootherstep(f.t, 0, 3.2)
      // Up and over on the way, clear of every roof.
      const mid = f.from.clone().lerp(orbit, k)
      mid.y = Math.max(mid.y + Math.sin(k * Math.PI) * 70, this.clearAt(mid.x, mid.z) + 30)
      pose = { pos: mid, look: f.fromLook.clone().lerp(h.anchor, THREE.MathUtils.smootherstep(f.t, 0, 2.4)) }
      this.overview = 0
    } else if (this.blend) {
      this.blend.t += dt
      const k = THREE.MathUtils.smootherstep(this.blend.t, 0, 2)
      const p = this.blend.pos.clone().lerp(pose.pos, k)
      p.y = Math.max(p.y + Math.sin(k * Math.PI) * 40, this.clearAt(p.x, p.z) + 25)
      pose = { pos: p, look: this.blend.look.clone().lerp(pose.look, k) }
      if (k >= 1) this.blend = null
    }
    // Arriving from the opening: start high in the sky and drop in.
    const intro = this.intro ?? 0
    if (intro > 0.001) {
      pose = { pos: pose.pos.clone().add(new THREE.Vector3(0, intro * intro * 420, intro * 160)), look: pose.look }
      this.placed = false
    }
    // Low-pass the pose so nothing snaps: position, aim and roll.
    const a = 1 - Math.exp(-dt * 6)
    if (!this.placed) {
      this.camera.position.copy(pose.pos)
      this.look.copy(pose.look)
      this.placed = true
    }
    this.camera.position.lerp(pose.pos, a)
    this.look.lerp(pose.look, a)
    this.aim ??= new THREE.PerspectiveCamera() // camera lookAt convention (-z forward)
    this.aim.position.copy(this.camera.position)
    this.aim.lookAt(this.look)
    this.camQ ??= this.aim.quaternion.clone()
    this.camQ.slerp(this.aim.quaternion, 1 - Math.exp(-dt * 5))
    this.roll = (this.roll ?? 0) + ((this.free ? 0 : -this.mouse.x * 0.06) - (this.roll ?? 0)) * (1 - Math.exp(-dt * 3))
    // Speed: the view widens and shivers as the flight rushes.
    const moved = this.lastPos ? this.camera.position.distanceTo(this.lastPos) : 0
    ;(this.lastPos ??= new THREE.Vector3()).copy(this.camera.position)
    this.speed += (Math.min(600, moved / Math.max(dt, 1e-3)) - this.speed) * (1 - Math.exp(-dt * 4))
    this.rush = THREE.MathUtils.clamp((this.speed - 20) / 200, 0, 1)
    const shiver = Math.sin(this.time * 31) * Math.sin(this.time * 17) * 0.006 * this.rush
    this.camera.quaternion.copy(this.camQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll + shiver))
    const fov = (this.portrait ? 74 : 58) + this.rush * 16
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    const night = THREE.MathUtils.smoothstep(this.u, 0.35, 0.96)
    if (this.sky && Math.abs(night - NIGHT.value) > 0.002) this.#setNight(night)

    // Sun and its shadow box follow what we look at.
    this.sun.target.position.copy(this.look)
    this.sun.position.copy(this.look).addScaledVector(this.lightDir, 900)
    // Sharp shadows at road level, a wide box for the overview.
    const box = Math.round(THREE.MathUtils.lerp(120, 330, Math.max(this.overview ?? 0, this.free ? 1 : 0)) / 10) * 10
    const sc = this.sun.shadow.camera
    if (sc.right !== box) ((sc.left = sc.bottom = -box), (sc.right = sc.top = box), sc.updateProjectionMatrix())

    this.#updatePaws(dt)
    this.#updateTiger(dt)
    for (const t of this.targets) {
      const d = t.u - this.u
      t.near = this.free ? 0 : Math.max(0, d >= 0 ? 1 - d / 0.08 : 1 + d / 0.03)
      if (t.box) t.box.material.opacity = t.near * 0.9
    }
    this.bloom.strength = 0.25 + NIGHT.value * 0.55
    this.#adapt(dt)
    this.composer.render()
  }

  // The opening: the camera waits beside the tiger at the main gate; the
  // first scroll makes it roar, then it bolts up the road and the camera
  // follows, climbing into the flight. After that it leads the way just
  // ahead of the camera, on its own pawprint trail.
  #tigerAt(u) {
    const t = this.#routeT(u)
    const p = this.route.getPointAt(Math.min(0.999, t))
    const d = this.route.getTangentAt(Math.min(0.999, t)).setY(0).normalize()
    p.y = this.groundAt(p.x, p.z)
    return { t, p, d }
  }

  #updateTiger(dt) {
    if (!this.route || this.free) return this.tiger.update(dt, this.tiger.group.position, this.tigerDir ?? new THREE.Vector3(0, 0, 1), 0)
    const { t, p, d } = this.#tigerAt(this.u)
    this.tigerDir = d
    const roar = THREE.MathUtils.smoothstep(this.u, 0.006, 0.012) * (1 - THREE.MathUtils.smoothstep(this.u, 0.022, TIGER_RUN))
    // The roar sounds once each time the scroll carries past it.
    if (roar > 0.6 && !this.roared) ((this.roared = true), this.onRoar?.())
    if (this.u < 0.004) this.roared = false
    // Running speed follows how fast the route is being covered.
    const pace = this.lastTigerT === undefined ? 0 : (Math.abs(t - this.lastTigerT) * this.route.getLength()) / Math.max(dt, 1e-3)
    this.lastTigerT = t
    this.tigerPace = (this.tigerPace ?? 0) + (pace - (this.tigerPace ?? 0)) * Math.min(1, dt * 3)
    this.tiger.update(dt, p, d, this.tigerPace, roar)
  }

  #updatePaws(dt) {
    if (this.beacon) this.beacon.material.opacity = 0.25 + 0.12 * Math.sin(this.time * 2.4)
    if (!this.paws) return
    const m = this.paws.material.uniforms
    m.uTime.value = this.time
    m.uHead.value = this.free ? 1 : this.route ? this.#tigerAt(this.u).t : 0
  }
}
