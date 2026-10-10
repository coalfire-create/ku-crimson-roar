import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import DATA from '../data/campus.json'
import { RunTiger } from './runTiger.js'
import WORLD from '../data/world.json'
// The main gate is a low stone arch, not a 16 m block.
// The main gate is drawn as its own stone gateway (below), not a block.
for (const b of DATA.buildings) if (b.n === '고려대학교 정문') ((b.h = Math.min(b.h, 7)), (b.gate = true), (b.flat = true))
// 중앙광장 is a lawn over the underground library, but OSM maps it as a 16 m
// building: keep it as open ground (no walls, nothing for the tour to dodge).
{
  const ring = DATA.landmarks.plazaRing
  for (const b of DATA.buildings) if (b.p.length === ring.length && b.p[0][0] === ring[0][0] && b.p[0][1] === ring[0][1]) b.flat = true
}
import { loadAerial } from './aerial.js'
import { AnimeSky, DepthRenderPass, InkPass, Students } from './anime.js'
import { buildTrees } from './trees.js'
import { AER, AER_GLSL, NIGHT, FOCUS, buildingMaterial, STYLE as BST, offsetPoly, wallUV, slopeUV, tagB } from './materials.js'

// A flight over the whole Anam campus of Korea University, built only from
// free open data: OpenStreetMap footprints, land use and trees (© OSM
// contributors) on AWS Terrain Tiles elevation. Golden hour turning to dusk;
// the gothic granite halls get slate roofs and towers. Scroll drives the
// tour along a trail of glowing tiger pawprints; the pointer steers; a hall
// picked from the directory pulls the flight over to circle it.

export const TARGETS = [
  { key: 'gate', name: '정문', en: 'Main Gate', body: '안암로에서 올려다보이는 석조 정문. 고려대의 모든 이야기가 시작되는 곳.' },
  { key: 'tiger', name: '호상', en: 'Tiger Statue', body: '지구 위에 선 백색 화강암 호랑이. 세계로 뻗어 나가는 고대의 기상을 상징한다.' },
  { hall: '중앙도서관', name: '중앙도서관', en: 'Central Library', body: '밤늦도록 불이 꺼지지 않는 지성의 심장. 앞 중앙광장 잔디 아래엔 지하 열람실이 있다.' },
  { hall: '경영본관', name: '경영본관', en: 'Business School', body: '현대자동차경영관·LG-POSCO경영관과 함께 경영대학을 이루는 석조 건물.' },
  { hall: '백주년기념삼성관', name: '백주년기념삼성관', en: 'Centennial Samsung Hall', body: '개교 100주년을 기념해 세운 고딕 양식의 건물.' },
  { hall: '본관', name: '본관', en: 'Main Hall', body: '1934년 완공된 화강암 고딕 건물. 국가 사적으로 지정된 고려대의 얼굴.' },
  { hall: '인촌기념관', name: '인촌기념관', en: 'Inchon Memorial Hall', body: '인촌의 묘소가 있던 자리에 탄생 100주년(1991)을 맞아 세운 기념관. 입학식과 졸업식이 열린다.' },
  { hall: '하나과학관 A동', name: '하나과학관', en: 'Hana Science Hall', body: '\'애기능 캠퍼스\'라 불리는 자연계 캠퍼스. 정조의 후궁 원빈 홍씨의 능 터에서 이름이 왔다.' },
]

const T = WORLD.terrain
const X1 = T.x0 + (T.w - 1) * T.step
const Z1 = T.z0 + (T.h - 1) * T.step
const MOBILE = innerWidth < 760
// Scroll layout (0..1 of the section), cut like a short animated film:
// first the whole campus from above, drawn like an illustrated map with a
// numbered pin on every stop; then one shot per landmark, each its own
// camera move (a crane up from the lawn, a slow push in, an arc round the
// hall), joined by quick dips to black; then the camera rises over the
// whole campus at dusk. The tiger is the film's mascot, waiting in shot.
const SHOWS_START = 0.1
// Camera move per shot, in landmark order.
const MOVES = ['crane', 'orbit', 'dolly', 'orbit', 'crane', 'dolly', 'orbit', 'crane']
const TOUR_END = 0.9
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 11), THREE.MathUtils.degToRad(235))
// 0 = golden hour, 1 = blue hour with the windows lit; the tour runs from one
// to the other.
// Day to night: at full night the "sun" is a cool moon, the sky light deep
// blue, the haze a dark indigo that lamps and windows glow against.
const DUSK = {
  sun: [new THREE.Color('#ffc98f'), new THREE.Color('#9fb6ff')],
  sky: [new THREE.Color('#aac6ea'), new THREE.Color('#40528f')],
  fog: [new THREE.Color('#bcd5e8'), new THREE.Color('#141a38')],
}

// A painterly grade, like a frame from an animated film: richer colour,
// warm light and gently lifted, cool shadows, a soft vignette. Runs on the
// linear image before tone mapping.
// The storybook finish, like a page from an illustrated fairy tale: a
// miniature's focus (the top and bottom of the frame drift softly out of
// focus, the hall in the middle stays sharp), a dreamy glow spreading from
// the bright parts, pastel lavender shadows and warm golden light, and a
// soft warm vignette. uStory fades it in for the building shots.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uStory: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uStory; varying vec2 vUv;
    vec3 blur(vec2 uv, float r){
      vec3 acc = vec3(0.0);
      float w = 0.0;
      for (int i = -3; i <= 3; i++)
        for (int j = -3; j <= 3; j++) {
          vec2 o = vec2(float(i), float(j));
          float k = exp(-dot(o, o) / 8.0);
          acc += texture2D(tDiffuse, uv + o * r / uRes).rgb * k;
          w += k;
        }
      return acc / w;
    }
    void main(){
      // Clamped to display range first: an over-bright sun would otherwise
      // turn the screen-blended glow into a rainbow ring.
      vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      // Miniature focus: sharp in a band through the middle.
      float tilt = smoothstep(0.16, 0.48, abs(vUv.y - 0.52)) * uStory;
      vec3 soft = clamp(blur(vUv, 1.0 + tilt * 3.2), 0.0, 1.0);
      c = mix(c, soft, tilt);
      // Dreamy glow from the highlights.
      vec3 halo = clamp(blur(vUv, 5.0), 0.0, 1.0);
      float hl = dot(halo, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, 1.0 - (1.0 - c) * (1.0 - halo * smoothstep(0.35, 0.9, hl) * 0.55), uStory);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, 1.05), 0.0);
      float hi = smoothstep(0.05, 0.6, l);
      c *= mix(vec3(0.94, 0.98, 1.08), vec3(1.07, 1.0, 0.9), hi);
      c += vec3(0.006, 0.008, 0.014) * (1.0 - hi);
      // Storybook palette: lavender in the shadows, honey in the light.
      vec3 tale = c * mix(vec3(0.96, 0.92, 1.06), vec3(1.06, 1.0, 0.88), hi) + vec3(0.035, 0.025, 0.05) * (1.0 - hi);
      c = mix(c, tale, uStory);
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.25, 0.75, dot(q, q) * 2.2);
      c *= 1.0 - mix(0.35, 0.28, uStory) * vig;
      c += vec3(0.05, 0.025, 0.0) * vig * uStory;
      gl_FragColor = vec4(c, 1.0);
    }`,
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

// Nudge a resampled route out of every footprint until each point stands at
// least `min` metres from a wall, re-smoothing between passes so the pushes
// never leave a kink. F is the wall field (dist / grad).
function keepOffWalls(pts, F, min) {
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (const p of pts) {
      for (let it = 0; it < 12; it++) {
        const d = F.dist(p[0], p[1])
        if (d >= min) break
        const [gx, gz] = F.grad(p[0], p[1])
        p[0] += gx * (min - d + 0.25)
        p[1] += gz * (min - d + 0.25)
        moved = true
      }
    }
    if (!moved) break
    const copy = pts.map((p) => [...p])
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i][0] = (copy[i - 1][0] + 2 * copy[i][0] + copy[i + 1][0]) / 4
      pts[i][1] = (copy[i - 1][1] + 2 * copy[i][1] + copy[i + 1][1]) / 4
    }
  }
  return pts
}

export class AnamFlight {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5))
    // Neutral tone mapping keeps colours clean and saturated, as painted.
    this.renderer.toneMapping = THREE.NeutralToneMapping
    // Bright and airy, like a painted anime background.
    this.renderer.toneMappingExposure = 0.95
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene = new THREE.Scene()
    // Near enough for close shots on the lawn, far enough for the whole city.
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 4000)
    this.progress = 0
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
    this.#buildHalls()
    this.#buildStatue()
    this.#buildGate()
    this.#buildLamps()
    this.#buildSparkles()
    // Resolves once the relief and everything placed on it are in.
    this.terrainReady = this.#loadTerrain()

    // The tiger itself, running at the head of its pawprint trail.
    // Drawn like the rest of the anime campus: clean coat, no fur shells.
    this.tiger = new RunTiger(this.scene, undefined, { scale: 0.03, fur: 0 })

    // Bloom: lit windows and the pawprint trail glow as dusk falls.
    // The scene renders with its depth kept, for the ink outlines.
    // A plain (single-sample) target with a 24-bit depth texture: it works
    // the same in every browser (Safari garbles a multisampled float depth).
    // Edges are smoothed by SMAA at the end instead.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    rt.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    this.composer = new EffectComposer(this.renderer, rt)
    const scenePass = new DepthRenderPass(this.scene, this.camera)
    this.composer.addPass(scenePass)
    // Ink straight after the scene, while it still reads that frame's depth
    // and writes to the other buffer (sampling the depth of the buffer being
    // drawn into would feed back).
    this.ink = new InkPass(this.camera, scenePass)
    this.composer.addPass(this.ink)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.28, 2.6)
    this.composer.addPass(this.bloom)
    this.grade = new ShaderPass(GRADE)
    this.grade.setSize = (w, h) => this.grade.uniforms.uRes.value.set(w, h)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())
    this.composer.addPass(new SMAAPass())

    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
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
    // The physical sky only lights the reflections; what you see is painted.
    this.sky = sky
    this.animeSky = new AnimeSky(this.scene)
    // Reflections from the same sky.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    envScene.add(sky.clone())
    this.scene.environment = pmrem.fromScene(envScene, 0, 1, 30000).texture
    this.scene.environmentIntensity = 0.35
    pmrem.dispose()
    this.scene.fog = new THREE.Fog('#bcd5e8', 700, 3600)
    // Opaque behind everything, whatever the browser does with the sky dome.
    this.scene.background = new THREE.Color('#bcd5e8')

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
    this.hemi = new THREE.HemisphereLight('#aac6ea', '#6a6450', 1.25)
    this.scene.add(this.sun, this.sun.target, this.hemi)
  }

  // Ground: what each spot is made of, from OSM (roads, walks, lawns and
  // woods, everything else paved), drawn as a mask; relief from the DEM.
  // Near the eye each surface gets its own photographed material at its real
  // size; the aerial photograph takes over in the distance, where it reads
  // as the real campus and its flattened cars and shadows no longer show.
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
    const trace = (pts) => {
      ctx.beginPath()
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(...P(x, z)) : ctx.moveTo(...P(x, z))))
    }
    // Mask channels: red asphalt, green planted ground, blue paving; black is
    // plain concrete (plazas, yards, the city's pavements).
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CW, CH)
    const MASK = { grass: '#00ff00', wood: '#00ff00', pitch: '#00ff00', dirt: '#00ff00', parking: '#ff0000' }
    for (const a of WORLD.areas) {
      if (!MASK[a.k]) continue
      trace(a.p)
      ctx.closePath()
      ctx.fillStyle = MASK[a.k]
      ctx.fill()
    }
    ctx.lineCap = ctx.lineJoin = 'round'
    const WID = { w: 14, r: 7, p: 9, f: 3 }
    for (const k of ['f', 'p', 'r', 'w']) {
      ctx.strokeStyle = k === 'r' || k === 'w' ? '#ff0000' : '#0000ff'
      for (const s of DATA.paths) {
        if (s.k !== k) continue
        trace(s.p)
        ctx.lineWidth = WID[k] * sx
        ctx.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const seg = MOBILE ? 2 : 1
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / (10 * seg)), Math.round(D / (10 * seg)))
    geo.rotateX(-Math.PI / 2)
    geo.translate(T.x0 + W / 2, 0, T.z0 + D / 2)
    const gmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    // Photographed surfaces (Poly Haven, CC0), each with its normal map.
    const detail = {}
    for (const [k, f] of [['uAsph', 'asphalt_02'], ['uPave', 'patterned_paving_02'], ['uGrass', 'leafy_grass'], ['uConc', 'concrete_floor_02']]) {
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
          uniform sampler2D uAsph, uPave, uGrass, uConc, uAsphN, uPaveN, uGrassN, uConcN;
          ${AER_GLSL}
          const vec3 LUMW = vec3(0.299, 0.587, 0.114);
          float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + 1.0), f.x), f.y); }
          // One texture at two scales and angles, mixed by a slow noise, so a
          // tile never repeats visibly; s is the texture's real size in metres.
          const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
          vec3 surf(sampler2D t, vec2 xz, float s, float k){
            return mix(texture2D(t, xz / s).rgb, texture2D(t, ROT * xz / (s * 1.37)).rgb, k);
          }
          vec3 surfN(sampler2D t, vec2 xz, float s, float k){
            vec3 a = texture2D(t, xz / s).xyz * 2.0 - 1.0;
            vec3 b = texture2D(t, ROT * xz / (s * 1.37)).xyz * 2.0 - 1.0;
            b.xy = mat2(0.8, 0.6, -0.6, 0.8) * b.xy;
            return mix(a, b, k);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `vec3 gN = vec3(0.0, 0.0, 1.0);
          float gW = 0.0;
          {
            float dist = length(vViewPosition);
            vec4 m = texture2D(map, vMapUv);
            // The same mask a few metres blurred: where it differs we are at a
            // kerb or the edge of a lawn, darkened a little like a real one.
            vec4 mb = texture2D(map, vMapUv, 3.0);
            float k = smoothstep(0.3, 0.7, gNoise(vXZ / 13.0));
            float road = m.r;
            float green = m.g * (1.0 - road);
            float walk = m.b * (1.0 - road) * (1.0 - green);
            vec3 aer = vec3(0.0);
            if (uAerOn > 0.5) {
              aer = aerialAt(vXZ);
              // Lawns the map leaves out still read green in the photograph.
              float pg = clamp((aer.g - max(aer.r, aer.b)) * 18.0, 0.0, 1.0) * (1.0 - road) * (1.0 - walk);
              green = max(green, pg);
            }
            float conc = max(0.0, 1.0 - road - green - walk);
            // Clean and tidy, like a well-kept campus in an animated film:
            // even tones, no blotches. Lawns are mown in broad stripes; walks
            // are pale stone laid in a neat grid; roads a smooth slate
            // asphalt; plazas light granite. Only a breath of large-scale
            // variation keeps big areas from looking flat.
            float soft = 0.97 + 0.06 * gNoise(vXZ / 40.0);
            // Asphalt: even slate with a faint fine grain.
            float gA = dot(surf(uAsph, vXZ, 4.0, k), LUMW) / max(dot(texture2D(uAsph, vXZ / 4.0, 10.0).rgb, LUMW), 0.02);
            vec3 cA = vec3(0.21, 0.23, 0.27) * mix(1.0, gA, 0.06) * soft;
            // Walks: pale stone slabs, 1.2 m, with thin joints.
            vec2 sl = abs(fract(vXZ / 1.2) - 0.5);
            float joint = smoothstep(0.47, 0.49, max(sl.x, sl.y));
            float slab = 0.97 + 0.05 * gHash(floor(vXZ / 1.2));
            vec3 cP = vec3(0.7, 0.63, 0.52) * slab * (1.0 - 0.18 * joint) * soft;
            // Lawns: fresh green in mown stripes, 3 m wide, along the x axis.
            float stripe = step(0.5, fract(vXZ.x / 6.0));
            vec3 cG = mix(vec3(0.215, 0.44, 0.14), vec3(0.24, 0.475, 0.155), stripe) * soft;
            // Plazas: light granite.
            vec3 cC = vec3(0.6, 0.58, 0.54) * soft;
            vec3 near = cA * road + cP * walk + cG * green + cC * conc;
            float edge = clamp(abs(m.r - mb.r) * 2.2 + abs(m.g - mb.g) * 1.2, 0.0, 1.0);
            // A crisp kerb line where one surface meets another.
            near *= 1.0 - 0.22 * edge;
            // Far: the aerial photograph, its baked shadows lifted and its
            // blue haze taken out so it meets the near ground in tone.
            vec3 far = near;
            float kNear = 1.0;
            if (uAerOn > 0.5) {
              // Far: the photograph's layout, repainted in the same palette.
              far = aer * 1.15;
              far = far * (1.0 + 1.1 * (1.0 - smoothstep(0.0, 0.2, dot(far, LUMW)))) + vec3(0.02, 0.019, 0.016);
              far = mix(vec3(dot(far, LUMW)), far, 1.3);
              far = mix(far, near, 0.45);
              kNear = 1.0 - smoothstep(110.0, 380.0, dist);
            }
            diffuseColor.rgb = mix(far, near, kNear);
            if (kNear > 0.0) {
              gN = surfN(uAsphN, vXZ, 4.0, k) * road + surfN(uPaveN, vXZ, 2.4, 0.0) * walk + surfN(uGrassN, vXZ, 2.2, k) * green + surfN(uConcN, vXZ, 3.0, k) * conc;
              gW = kNear;
            }
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (gW > 0.0) {
            // Ground tangent frame: u along +x, v along +z, up +y.
            vec3 nw = vec3(gN.x * 0.35, 0.0, gN.y * 0.35); // only a hint of relief: clean surfaces
            normal = normalize(normal + (viewMatrix * vec4(nw, 0.0)).xyz * gW);
          }`,
        )
    }
    // Beyond the terrain, a wide skirt of the city's own grey-green, so the
    // map and the finale never look over the edge of the world.
    const skirt = new THREE.Mesh(new THREE.RingGeometry(Math.min(W, D) * 0.48, 12000, 64, 1), new THREE.MeshStandardMaterial({ color: '#5d6458', roughness: 1 }))
    skirt.rotation.x = -Math.PI / 2
    skirt.position.set(T.x0 + W / 2, T.hmin - 2, T.z0 + D / 2)
    this.scene.add(skirt)
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
    // The rest is spread over several frames, so the page never stalls
    // (this lands while the opening is still playing).
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    await frame()
    // Things placed on the ground follow the relief.
    for (const t of this.targets) if (t.key) t.anchor.y = this.groundAt(t.anchor.x, t.anchor.z) + t.lift
    if (this.statue) this.statue.position.y = this.groundAt(this.statue.position.x, this.statue.position.z)
    if (this.gate) this.gate.position.y = this.groundAt(this.gate.position.x, this.gate.position.z)
    this.#placeLamps()
    this.#placeBronze()
    this.#buildClearance()
    await frame()
    this.#planShots()
    this.#clearAxis()
    await frame()
    this.#plantTrees()
    await frame()
    this.#populate()
    await frame()
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
      if (b.flat) return
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
      if (b.flat) return
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

  // One showcase shot per landmark, in the order the road reaches them: a
  // slow arc around it at a three-quarter view, from the side the road runs
  // past (so the waiting tiger stands in the foreground), at the nearest
  // angle where nothing stands between the eye and the facade. Close and low
  // first, then wider and higher until the view is clear.
  #planShots() {
    const F = this.wallF
    const SWEEP = 0.5 // radians of arc per shot
    const view = (s, a, R, hc) => {
      const cam = new THREE.Vector3(s.cx + Math.sin(a) * R, 0, s.cz + Math.cos(a) * R)
      cam.y = Math.max(s.base + hc, this.groundAt(cam.x, cam.z) + 3)
      return cam
    }
    const clearView = (s, cam) => {
      if (F.dist(cam.x, cam.z) < 4 && F.top(cam.x, cam.z) > cam.y - 3) return false
      const ly = s.base + s.hl
      const n = Math.ceil(Math.hypot(s.cx - cam.x, s.cz - cam.z) / 2)
      for (let k = 1; k < n; k++) {
        const f = k / n
        const x = cam.x + (s.cx - cam.x) * f
        const z = cam.z + (s.cz - cam.z) * f
        if (x > s.x0 - 2 && x < s.x1 + 2 && z > s.z0 - 2 && z < s.z1 + 2) break // reached the subject
        const y = cam.y + (ly - cam.y) * f
        if (this.groundAt(x, z) > y - 1 || (F.dist(x, z) < 0.8 && F.top(x, z) > y - 2)) return false
      }
      return true
    }
    this.sight = []
    this.shows = [...this.targets].sort((a, b) => a.routeU - b.routeU)
    this.shows.forEach((t, n) => {
      const f = t.foot
      const cx = (f.x0 + f.x1) / 2
      const cz = (f.z0 + f.z1) / 2
      const span = Math.max(f.x1 - f.x0, f.z1 - f.z0)
      const s = { cx, cz, x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, base: f.base ?? this.groundAt(cx, cz), hl: t.key === 'tiger' ? 6 : f.h * 0.45 }
      const spot = this.route.getPointAt(t.routeU)
      // The gate is shot from outside, looking in: the campus behind it.
      const pref = t.key === 'gate' && this.gateIn ? Math.atan2(-this.gateIn.x, -this.gateIn.z) : Math.atan2(spot.x - cx, spot.z - cz)
      // Framed close enough that the hall fills the shot.
      const R0 = t.key === 'tiger' ? 23 : t.key === 'gate' ? 50 : t.key ? 30 : THREE.MathUtils.clamp(span * 0.72 + 24, 40, 135)
      const h0 = t.key === 'gate' ? 5 : t.key ? 4 : f.h * 0.3 + R0 * 0.16
      let pick = null
      for (const [kr, kh] of [[1, 1], [1.3, 1.8], [1.6, 2.8], [2, 4]]) {
        for (let m = 0; m <= 36 && !pick; m++) {
          const a = pref + (m % 2 ? 1 : -1) * Math.ceil(m / 2) * (Math.PI / 36)
          if ([-SWEEP / 2, 0, SWEEP / 2].every((o) => clearView(s, view(s, a + o, R0 * kr, h0 * kh)))) pick = { a, R: R0 * kr, hc: h0 * kh }
        }
        if (pick) break
      }
      pick ??= { a: pref, R: R0 * 2, hc: h0 * 4 }
      // Alternate the direction of the arc from one landmark to the next.
      const dir = n % 2 ? 1 : -1
      t.shot = { ...s, R: pick.R, hc: pick.hc, a0: pick.a - (dir * SWEEP) / 2, a1: pick.a + (dir * SWEEP) / 2 }
      // The bronze tiger turns to face the camera that shows it (three-quarter on).
      if (t.key === 'tiger' && this.statue) ((this.statue.rotation.y = pick.a - 1.25), this.#placeBronze())
      // Sight lines to keep free of tree crowns: the near 70% of each.
      for (const o of [0, 0.5, 1]) {
        const cam = view(s, t.shot.a0 + (t.shot.a1 - t.shot.a0) * o, pick.R, pick.hc)
        const L = Math.hypot(cx - cam.x, cz - cam.z)
        for (let d = 0; d < L * 0.7; d += 3) this.sight.push([cam.x + ((cx - cam.x) * d) / L, cam.z + ((cz - cam.z) * d) / L])
      }
    })
  }

  // The axis 정문 – 중앙광장 – 본관 stays open, as it is: no trees on the
  // sightline from the road outside the gate to 본관.
  #clearAxis() {
    const mh = DATA.buildings.filter((x) => x.n === '본관').map((x) => obb(x.p))[0]
    if (!this.gateAt || !mh) return
    const from = this.gateAt.clone().addScaledVector(this.gateIn, -70)
    const L = Math.hypot(mh.cx - from.x, mh.cz - from.z)
    for (let d = 0; d < L - 10; d += 3) {
      const f = d / L
      const x = from.x + (mh.cx - from.x) * f
      const z = from.z + (mh.cz - from.z) * f
      // A corridor as wide as the gap between the gatehouses.
      for (const off of [-9, -4.5, 0, 4.5, 9]) this.sight.push([x - this.gateIn.z * off, z + this.gateIn.x * off])
    }
  }

  // Trees everywhere but across the tiger's road (it would run through the
  // trunks) and the near part of every showcase view.
  #plantTrees() {
    const C = 4
    const cells = new Map()
    const add = (x, z, pad) => {
      const key = `${Math.floor(x / C)},${Math.floor(z / C)}`
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(x, z, pad)
    }
    const L = this.route.getLength()
    for (let k = 0, n = Math.ceil(L / 2); k <= n; k++) {
      const q = this.route.getPointAt(k / n)
      add(q.x, q.z, 1.5)
    }
    for (const [x, z] of this.sight) add(x, z, 3)
    const keep = (x, z, s) => {
      const r = 3.2 * s + 3
      const R = Math.ceil(r / C)
      const cx = Math.floor(x / C)
      const cz = Math.floor(z / C)
      for (let i = -R; i <= R; i++)
        for (let j = -R; j <= R; j++) {
          const pts = cells.get(`${cx + i},${cz + j}`)
          if (pts) for (let k = 0; k < pts.length; k += 3) if (Math.hypot(pts[k] - x, pts[k + 1] - z) < 3.2 * s + pts[k + 2]) return false
        }
      return true
    }
    this.trees = buildTrees(this.scene, MOBILE, keep)
  }

  // Students: walking the campus paths and sitting in groups on the lawns.
  #populate() {
    const inBox = ([x, z]) => x > -800 && x < 320 && z > -340 && z < 560
    const polylines = DATA.paths.filter((w) => w.k !== 'w' && w.p.every(inBox) && (w.k !== 'r' || Math.random() < 0.5)).map((w) => w.p)
    const polyIn = (poly) => (x, z) => {
      let r = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]
        const [xj, zj] = poly[j]
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r
      }
      return r
    }
    const lawn = (poly) => {
      const xs = poly.map((q) => q[0])
      const zs = poly.map((q) => q[1])
      return { box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], inside: polyIn(poly) }
    }
    const lawns = [lawn(DATA.landmarks.plazaRing), lawn(DATA.landmarks.plazaRing), ...WORLD.areas.filter((a) => a.k === 'grass' && a.p.every(inBox)).map((a) => lawn(a.p))]
    this.students = new Students(this.scene, { polylines, lawns, clear: (x, z) => this.wallF.dist(x, z), groundAt: (x, z) => this.groundAt(x, z), walkers: MOBILE ? 240 : 650, sitters: MOBILE ? 90 : 260, near: (this.shows || this.targets || []).map((t) => (t.shot ? [t.shot.cx, t.shot.cz] : [t.anchor.x, t.anchor.z])), extra: MOBILE ? 120 : 320 })
  }

  // Where the film is: the map (before the first shot), which shot and how
  // far through it, how dark the cut is, and the finale's rise.
  #schedule(u) {
    const up = THREE.MathUtils.smoothstep(u, TOUR_END, 1)
    const n = this.shows?.length ?? 1
    const slot = (TOUR_END - SHOWS_START) / n
    const f = THREE.MathUtils.clamp((u - SHOWS_START) / slot, 0, n - 1e-6)
    const i = Math.floor(f)
    // A dip to black either side of every cut (none into the finale's rise).
    const edge = Math.min(Math.abs(u - (SHOWS_START + i * slot)), i === n - 1 ? 1 : Math.abs(u - (SHOWS_START + (i + 1) * slot)))
    const cut = u < SHOWS_START - 0.015 ? 0 : 1 - THREE.MathUtils.smoothstep(edge, 0.002, 0.012)
    return { up, i, k: f - i, cut, map: u < SHOWS_START }
  }

  // Shot i at k (0..1): the camera move for that landmark.
  #shotPose(t, k, move) {
    const s = t.shot
    if (t.key === 'gate' && this.gateAt) {
      // As in the photograph: from the road outside, square on and at eye
      // level, both gatehouses filling the frame and 본관 framed between
      // them at the end of the lawn; a slow walk in toward the gate.
      const e = THREE.MathUtils.smootherstep(k, 0, 1)
      const g = this.gateAt
      // Framed as the photograph: on a 36° lens the 27 m gate spans the lower
      // half of the frame (top ~37%, foot ~92%), sky above.
      const D = THREE.MathUtils.lerp(this.portrait ? 78 : 84, this.portrait ? 68 : 74, e)
      const pos = g.clone().addScaledVector(this.gateIn, -D)
      pos.y = Math.max(this.groundAt(g.x, g.z), this.groundAt(pos.x, pos.z)) + 1.8
      const look = g.clone()
      look.y = this.groundAt(g.x, g.z) + 19
      return { pos, look, a: Math.atan2(-this.gateIn.x, -this.gateIn.z) }
    }
    const e = THREE.MathUtils.smootherstep(k, 0, 1)
    const mid = (s.a0 + s.a1) / 2
    let a = mid
    let R = s.R
    let h = s.hc
    let ly = s.hl
    if (move === 'orbit') {
      a = s.a0 + (s.a1 - s.a0) * e
      R = s.R * (1 - 0.08 * e)
    } else if (move === 'crane') {
      // From eye level on the lawn up to look out over the hall.
      R = s.R * 0.9
      h = THREE.MathUtils.lerp(2.2, s.hc * 1.7, e)
      ly = THREE.MathUtils.lerp(s.hl * 0.8, s.hl * 1.05, e)
      a = mid + (s.a1 - s.a0) * 0.15 * (e - 0.5)
    } else {
      // Dolly: a slow push in toward the entrance front.
      R = THREE.MathUtils.lerp(s.R * 1.3, s.R * 0.78, e)
      h = s.hc * 0.75
    }
    const pos = new THREE.Vector3(s.cx + Math.sin(a) * R, s.base + h, s.cz + Math.cos(a) * R)
    pos.y = Math.max(pos.y, this.groundAt(pos.x, pos.z) + 2)
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))
    const look = new THREE.Vector3(s.cx, s.base + ly, s.cz).addScaledVector(right, this.portrait ? 0 : -R * 0.12)
    return { pos, look, a }
  }

  // The map view: high over the middle of the tour, tipped a little to the
  // north so the halls read as buildings, not just roofs.
  #mapPose() {
    if (!this.mapAt) {
      const xs = this.shows.map((t) => t.shot.cx)
      const zs = this.shows.map((t) => t.shot.cz)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2
      const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...zs) - Math.min(...zs)) * (this.camera.aspect || 1.6))
      const H = span * (this.portrait ? 1.45 : 0.78)
      // On a phone the chapter's words fill the top: the campus sits lower.
      const dz = this.portrait ? -span * 0.28 : 0
      this.mapAt = { look: new THREE.Vector3(cx, 0, cz + dz), pos: new THREE.Vector3(cx, H, cz + dz + H * 0.42) }
    }
    return { pos: this.mapAt.pos.clone(), look: this.mapAt.look.clone() }
  }

  #setNight(n) {
    NIGHT.value = n
    const u = this.sky.material.uniforms
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - THREE.MathUtils.lerp(11, 0.6, n)), THREE.MathUtils.degToRad(235 + n * 12))
    u.sunPosition.value.copy(this.sunDir)
    u.rayleigh.value = 1.9 + n * 2.2
    u.turbidity.value = 7 - n * 4
    // The light itself never drops below the horizon.
    // At night it is the moon: higher, so its shadows stay short and soft.
    this.lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - THREE.MathUtils.lerp(11, 36, n)), THREE.MathUtils.degToRad(235 + n * 12))
    this.sunDir.lerp(this.lightDir, n).normalize()
    this.sun.intensity = THREE.MathUtils.lerp(3.2, 1.0, n)
    this.sun.color.lerpColors(...DUSK.sun, n)
    // Anime shadows are light and blue, never black.
    this.hemi.intensity = THREE.MathUtils.lerp(1.25, 0.8, n)
    this.hemi.color.lerpColors(...DUSK.sky, n)
    this.scene.fog.color.lerpColors(...DUSK.fog, n)
    this.scene.background.copy(this.scene.fog.color)
    if (this.lampMat) this.lampMat.opacity = n
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.35, 0.12, n)
  }

  #buildBuildings() {
    // Every footprint becomes a real-looking block: walls with bays centred on
    // each wall, a parapet with coping on flat roofs, a dressed-stone plinth and
    // cornice on the stone halls, slate roofs (hipped or mansard) on the gothic
    // halls, and towers with battlements and pinnacles on the three great halls.
    const geos = []
    let campusNow = 1
    const add = (geo, style, seed, base, top, poly) => {
      geo = geo.index ? geo.toNonIndexed() : geo
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
      if (!geo.attributes.normal) geo.computeVertexNormals()
      if (style === BST.slate) slopeUV(geo)
      else wallUV(geo, poly)
      geos.push(tagB(geo, style, seed, base, top, campusNow))
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
      if (b.flat) return
      campusNow = b.c ? 1 : 0
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
          {
            // Battlements, as on the real towers (본관's clock tower included,
            // which has no spire): a parapet with merlons, a pinnacle at each corner.
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
    // OSM also maps passages through arcades and lobbies: an edge that enters a
    // footprint costs sixty times its length, so it is a last resort only.
    const nearWall = (x, z) => Math.max(0, 1 - F.dist(x, z) / 8)
    const inside = (ax, az, bx, bz) => {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az))
      for (let s = 0; s <= n; s++) if (F.dist(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n) < 1) return true
      return false
    }
    const cost = (ax, az, bx, bz) => (inside(ax, az, bx, bz) ? 60 : 1) * (1 + 4 * Math.max(nearWall(ax, az), nearWall(bx, bz), nearWall((ax + bx) / 2, (az + bz) / 2)))
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
    // The tiger is ~5 m long and swings its head: keep 3.5 m from any wall.
    const pts = keepOffWalls(roadTour(tour, DATA.paths, cost), F, 3.5).map(([x, z]) => new THREE.Vector3(x, 0, z))
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
      let foot = null
      let lift = 0
      if (t.key) {
        const [x, z] = DATA.landmarks[t.key]
        lift = t.key === 'tiger' ? 11 : 12
        anchor = new THREE.Vector3(x, lift, z)
        const r = t.key === 'tiger' ? 6 : 10
        foot = { x0: x - r, x1: x + r, z0: z - r, z1: z + r, base: null, h: t.key === 'tiger' ? 9 : 11 }
      } else {
        const { b, i, xs, zs } = hallOf(t.hall)
        const base = WORLD.bases[i]
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2
        const cz = (Math.max(...zs) + Math.min(...zs)) / 2
        anchor = new THREE.Vector3(cx, base + b.h + 6, cz)
        foot = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), base, h: TOWERS.test(b.n) ? b.h * 1.4 : b.h }
      }
      let bestU = 0
      let bestD = Infinity
      for (let k = 0; k <= 400; k++) {
        const q = this.route.getPointAt(k / 400)
        const d = Math.hypot(q.x - anchor.x, q.z - anchor.z)
        if (d < bestD) (bestD = d), (bestU = k / 400)
      }
      return { ...t, anchor, foot, lift, routeU: bestU, near: 0 }
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

  // Golden motes drifting in the air about the hall in shot, like light in
  // an illustrated tale.
  #buildSparkles() {
    const n = MOBILE ? 220 : 520
    const p = new Float32Array(n * 3)
    const sd = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      p.set([(Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2], i * 3)
      sd[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1))
    this.sparkU = { uTime: { value: 0 }, uC: { value: new THREE.Vector3() }, uR: { value: 60 }, uH: { value: 30 }, uA: { value: 0 }, uPx: { value: 1 } }
    this.sparkles = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.sparkU,
        vertexShader: `attribute float aSeed; uniform float uTime, uR, uH, uPx; uniform vec3 uC; varying float vTw;
          void main(){
            vec3 p = uC + vec3(position.x * uR, position.y * uH, position.z * uR);
            p.y += mod(uTime * (0.6 + aSeed * 0.8) + aSeed * uH, uH) - position.y * uH * 0.0;
            p.x += sin(uTime * 0.5 + aSeed * 30.0) * 2.0;
            p.z += cos(uTime * 0.4 + aSeed * 20.0) * 2.0;
            vTw = 0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 50.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uPx * (2.0 + aSeed * 3.0) * 60.0 / -mv.z;
          }`,
        fragmentShader: `uniform float uA; varying float vTw;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * (0.8 + vTw), a * a * uA * (0.4 + 0.6 * vTw));
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.sparkles.frustumCulled = false
    this.scene.add(this.sparkles)
  }

  // 정문, as it stands on 안암로: two mirrored granite gatehouses either side
  // of an open road (no beam across it). Each has a tall crenellated tower on
  // the road side, its faces ribbed with buttresses capped by little gables,
  // then a wall pierced by a great arch with a lion's-head keystone, then a
  // lower outer tower. Tall sliding iron gates stand folded open at the
  // towers, round planters sit across the road, and 본관 is framed between.
  #buildGate() {
    const b = DATA.buildings.find((x) => x.gate)
    if (!b) return
    const o = obb(b.p)
    let best = 0
    let bd = Infinity
    for (let k = 0; k <= 600; k++) {
      const q = this.route.getPointAt(k / 600)
      const d = Math.hypot(q.x - o.cx, q.z - o.cz)
      if (d < bd) ((bd = d), (best = k / 600))
    }
    const at = this.route.getPointAt(best)
    // Square to the axis 정문 – 중앙광장 – 본관, as the real gate stands:
    // local z runs from outside in toward 본관, local x across the road.
    const mainHall = DATA.buildings.filter((x) => x.n === '본관').map((x) => obb(x.p))[0]
    const tan = mainHall ? new THREE.Vector3(mainHall.cx - at.x, 0, mainHall.cz - at.z).normalize() : this.route.getTangentAt(best).setY(0).normalize()
    const g = new THREE.Group()
    g.position.set(at.x, 0, at.z)
    g.rotation.y = -Math.atan2(tan.x, -tan.z)

    // Rock-faced grey granite: coursed blocks, each a different grey.
    const rubble = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 512
      const x = c.getContext('2d')
      let seed = 23
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      const rows = 10
      const rh = 512 / rows
      for (let r = 0; r < rows; r++) {
        let cx = -rnd() * 60
        while (cx < 512) {
          const w = 50 + rnd() * 70
          const v = 150 + rnd() * 45
          x.fillStyle = `rgb(${v - 4},${v},${v + 4})`
          x.fillRect(cx, r * rh, w, rh)
          // Rock face: a lit upper edge, a shadowed lower one, pitting.
          x.fillStyle = 'rgba(255,255,255,0.12)'
          x.fillRect(cx + 3, r * rh + 3, w - 6, 5)
          x.fillStyle = 'rgba(0,0,0,0.16)'
          x.fillRect(cx + 3, r * rh + rh - 9, w - 6, 6)
          for (let k = 0; k < 30; k++) {
            x.fillStyle = `rgba(40,40,44,${rnd() * 0.18})`
            x.fillRect(cx + rnd() * w, r * rh + rnd() * rh, 3, 3)
          }
          x.fillStyle = 'rgba(55,55,60,0.7)'
          x.fillRect(cx, r * rh, 3, rh)
          cx += w
        }
        x.fillStyle = 'rgba(55,55,60,0.7)'
        x.fillRect(0, r * rh, 512, 3)
      }
      const t = new THREE.CanvasTexture(c)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return t
    })()
    // Floodlit at night: the stone carries a warm glow of its own (its own
    // texture as the glow), so the gate is the brightest thing in its shot.
    const stoneM = new THREE.MeshStandardMaterial({ map: rubble, color: '#c9cbcc', roughness: 0.92, emissive: '#ffcf9a', emissiveMap: rubble, emissiveIntensity: 0.32 })
    const trimM = new THREE.MeshStandardMaterial({ color: '#9fa1a3', roughness: 0.88, emissive: '#ffcf9a', emissiveIntensity: 0.22 })
    const stoneGeos = []
    const trimGeos = []
    const worldUV = (geo) => {
      const p = geo.attributes.position
      const n = geo.attributes.normal
      const uv = geo.attributes.uv
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i))
        const ay = Math.abs(n.getY(i))
        uv.setXY(i, (ay > 0.5 ? p.getX(i) : ax > 0.5 ? p.getZ(i) : p.getX(i)) / 4, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / 4)
      }
      return geo
    }
    const box = (w, h, d, x, y, z, trim = false) => (trim ? trimGeos : stoneGeos).push(worldUV(new THREE.BoxGeometry(w, h, d).translate(x, y, z)).toNonIndexed())
    // A little gable cap (a pinnacle's roof) on a buttress.
    const gablet = (w, d, h, x, y, z) => {
      h *= 1.6 // tall, sharp caps, as on the real buttresses
      const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])
      const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
      geo.translate(x, y, z - d / 2)
      trimGeos.push(geo.toNonIndexed())
    }
    // A buttress strip up a face: steps in, gabled at each set-off.
    const buttress = (x, z, h, w, d) => {
      box(w, h * 0.55, d, x, h * 0.275, z)
      gablet(w, d, 0.7, x, h * 0.55, z)
      box(w * 0.8, h * 0.4, d * 0.8, x, h * 0.55 + h * 0.2, z)
      gablet(w * 0.8, d * 0.8, 0.9, x, h * 0.95, z)
    }
    // Crenellations along the top edge of a block (both long faces).
    const crenels = (cx, y, w, d, n, h = 0.9) => {
      for (let k = 0; k < n; k++) {
        const t = -w / 2 + (w / n) * (k + 0.5)
        box((w / n) * 0.55, h, 0.5, cx + t, y + h / 2, d / 2 - 0.25)
        box((w / n) * 0.55, h, 0.5, cx + t, y + h / 2, -d / 2 + 0.25)
      }
      for (let k = 0; k < Math.max(2, Math.round(n * (d / w))); k++) {
        const m = Math.max(2, Math.round(n * (d / w)))
        const t = -d / 2 + (d / m) * (k + 0.5)
        box(0.5, h, (d / m) * 0.55, cx - w / 2 + 0.25, y + h / 2, t)
        box(0.5, h, (d / m) * 0.55, cx + w / 2 - 0.25, y + h / 2, t)
      }
    }
    // A wall slab with an arch hole, in the local x-y plane.
    const archWall = (x0, x1, y1, d, aw, spring, apex) => {
      const sh = new THREE.Shape()
      sh.moveTo(x0, 0)
      sh.lineTo(x1, 0)
      sh.lineTo(x1, y1)
      sh.lineTo(x0, y1)
      sh.closePath()
      const m = (x0 + x1) / 2
      const r = aw / 2
      const hole = new THREE.Path()
      hole.moveTo(m - r, 0)
      hole.lineTo(m - r, spring)
      // A slightly pointed (four-centred) arch, nearly round.
      hole.bezierCurveTo(m - r, spring + (apex - spring) * 0.75, m - r * 0.45, apex, m, apex)
      hole.bezierCurveTo(m + r * 0.45, apex, m + r, spring + (apex - spring) * 0.75, m + r, spring)
      hole.lineTo(m + r, 0)
      hole.closePath()
      sh.holes = [hole]
      const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 20 })
      geo.translate(0, 0, -d / 2)
      stoneGeos.push(worldUV(geo.toNonIndexed()))
      // The arch ring: a moulded band round the opening on both faces.
      for (const f of [1, -1]) {
        const ring = new THREE.Shape()
        const R = r + 0.55
        const A = apex + 0.5
        ring.moveTo(m - R, spring - 0.3)
        ring.bezierCurveTo(m - R, spring + (A - spring) * 0.75, m - R * 0.45, A, m, A)
        ring.bezierCurveTo(m + R * 0.45, A, m + R, spring + (A - spring) * 0.75, m + R, spring - 0.3)
        ring.lineTo(m + r, spring - 0.3)
        ring.lineTo(m + r, spring)
        ring.bezierCurveTo(m + r, spring + (apex - spring) * 0.75, m + r * 0.45, apex, m, apex)
        ring.bezierCurveTo(m - r * 0.45, apex, m - r, spring + (apex - spring) * 0.75, m - r, spring)
        ring.lineTo(m - r, spring - 0.3)
        ring.closePath()
        const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.25, bevelEnabled: false, curveSegments: 20 })
        rg.translate(0, 0, f > 0 ? d / 2 : -d / 2 - 0.25)
        trimGeos.push(rg.toNonIndexed())
        // The lion's head on the keystone.
        const lion = new THREE.SphereGeometry(0.42, 12, 10).scale(1, 1.1, 0.6).translate(m, apex + 0.15, f * (d / 2 + 0.3))
        trimGeos.push(lion.toNonIndexed())
      }
    }
    const iron = (this.#ironMat ??= this.#makeIron())

    // Proportions taken off the photograph: each gatehouse ~17 m wide, the
    // tall tower a little higher than that, the road between ~1.2x wider.
    const span = THREE.MathUtils.clamp(o.L * 1.1, 18, 22)
    const TW = 4.2 // tall tower, across
    const TD = 4.8 // and along the road
    const TH = 20
    const WL = 9.4 // arch wall length
    const WH = 12.5
    const WD = 3.0
    const OW = 3.6 // outer tower
    const OH = 15.5
    for (const s of [-1, 1]) {
      const tx = s * (span / 2 + TW / 2)
      // Tall tower: base course, shaft, parapet with battlements.
      box(TW + 0.5, 0.9, TD + 0.5, tx, 0.45, 0, true)
      box(TW, TH, TD, tx, TH / 2, 0)
      box(TW + 0.5, 0.45, TD + 0.5, tx, TH + 0.2, 0, true)
      crenels(tx, TH + 0.4, TW + 0.5, TD + 0.5, 4)
      // Buttresses on every corner and up the middle of the road faces.
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) buttress(tx + cx * (TW / 2 + 0.1), cz * (TD / 2 + 0.1), TH * 1.06, 1.1, 1.1)
      for (const cz of [-1, 1]) for (const dx of [-0.75, 0.75]) buttress(tx + dx, cz * (TD / 2 + 0.3), TH * 0.97, 0.55, 0.6)
      buttress(tx - s * (TW / 2 + 0.3), 0, TH * 0.97, 0.6, 0.8)
      // Arch wall, then the outer tower.
      const w0 = s * (span / 2 + TW)
      const x0 = Math.min(w0, w0 + s * WL)
      const x1 = Math.max(w0, w0 + s * WL)
      archWall(x0, x1, WH, WD, 5.8, 6.2, 9.4)
      box(WL, 0.4, WD + 0.4, (x0 + x1) / 2, WH + 0.2, 0, true)
      crenels((x0 + x1) / 2, WH + 0.4, WL, WD + 0.4, 6, 0.7)
      const ox = w0 + s * (WL + OW / 2)
      box(OW + 0.4, 0.8, 3.8 + 0.4, ox, 0.4, 0, true)
      box(OW, OH, 3.8, ox, OH / 2, 0)
      box(OW + 0.4, 0.4, 4.2, ox, OH + 0.2, 0, true)
      crenels(ox, OH + 0.4, OW + 0.4, 4.2, 3)
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) buttress(ox + cx * (OW / 2 + 0.02), cz * 1.92, OH * 1.02, 0.6, 0.6)
      // Iron: the tall sliding gate folded open into the road at the tower,
      // and a small gate standing open in the arch.
      for (const f of [1, -1]) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.2), iron)
        leaf.position.set(tx - s * (TW / 2 + 2.4), 3.6, f * 1.6)
        leaf.rotation.y = Math.PI / 2 + s * f * 0.12
        g.add(leaf)
      }
      const small = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.6), iron)
      small.position.set((x0 + x1) / 2 + 1.6, 2.3, -WD / 2 - 1.2)
      small.rotation.y = Math.PI / 2
      g.add(small)
      // Floodlight from below on the road faces.
      for (const f of [1, -1]) {
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(TW + 1, 15), this.gateWashMat ??= this.#gateWash())
        fl.position.set(tx, 7, f * (TD / 2 + 0.55))
        if (f < 0) fl.rotation.y = Math.PI
        g.add(fl)
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(WL, 9), this.gateWashMat)
        fw.position.set((x0 + x1) / 2, 4.5, f * (WD / 2 + 0.32))
        if (f < 0) fw.rotation.y = Math.PI
        g.add(fw)
      }
      // A small bronze plaque with the name on each tall tower's road face.
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), this.gatePlaqueMat ??= this.#gatePlaque())
      plaque.position.set(tx, 3.2, TD / 2 + 0.03)
      g.add(plaque)
    }
    // Round planters with clipped shrubs, across the road just inside.
    const potM = new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.85 })
    const shrubM = new THREE.MeshStandardMaterial({ color: '#2f5a2a', roughness: 0.9 })
    for (const px of [-0.36, -0.12, 0.12, 0.36]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 0.8, 20), potM)
      pot.position.set(px * span, 0.4, -4)
      pot.castShadow = pot.receiveShadow = true
      g.add(pot)
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), shrubM)
      shrub.scale.set(1, 0.85, 1)
      shrub.position.set(px * span, 1.25, -4)
      shrub.castShadow = true
      g.add(shrub)
    }
    const stone = new THREE.Mesh(mergeGeometries(stoneGeos), stoneM)
    stone.castShadow = stone.receiveShadow = true
    g.add(stone)
    const trim = new THREE.Mesh(mergeGeometries(trimGeos.map((x) => (x.deleteAttribute('uv'), x))), trimM)
    trim.castShadow = trim.receiveShadow = true
    g.add(trim)
    // Warm light between the gatehouses.
    const lamp = new THREE.PointLight('#ffbf7a', 30, 40, 1.6)
    lamp.position.set(0, 7, 0)
    g.add(lamp)
    this.gateLight = lamp
    // Full size: the real gatehouses are larger than the first estimate.
    g.scale.setScalar(1.35)
    this.gate = g
    this.scene.add(g)
    // The gate shot frames both gatehouses, 본관 between them.
    const tg = this.targets?.find((t) => t.key === 'gate')
    if (tg) {
      const r = (span / 2 + TW + 3) * 1.35
      tg.anchor.x = at.x
      tg.anchor.z = at.z
      tg.foot = { x0: at.x - r, x1: at.x + r, z0: at.z - r, z1: at.z + r, base: null, h: 20 }
    }
    // Which way along the road is campus: toward 본관.
    const main = DATA.buildings.filter((x) => x.n === '본관').map((x) => obb(x.p))[0]
    this.gateIn = tan.clone()
    if (main && (main.cx - at.x) * tan.x + (main.cz - at.z) * tan.z < 0) this.gateIn.negate()
    this.gateAt = new THREE.Vector3(at.x, 0, at.z)
  }

  #gateWash() {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 128
    const x = c.getContext('2d')
    const gr = x.createLinearGradient(0, 128, 0, 0)
    gr.addColorStop(0, 'rgba(255,190,110,0.5)')
    gr.addColorStop(0.55, 'rgba(255,170,90,0.15)')
    gr.addColorStop(1, 'rgba(255,160,80,0)')
    x.fillStyle = gr
    x.fillRect(0, 0, 4, 128)
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  }

  #gatePlaque() {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 192
    const x = c.getContext('2d')
    x.fillStyle = '#3a2c1c'
    x.fillRect(0, 0, 512, 192)
    x.strokeStyle = '#c9a25a'
    x.lineWidth = 8
    x.strokeRect(10, 10, 492, 172)
    x.fillStyle = '#e8c77e'
    x.font = '900 92px "Noto Serif KR", serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('高麗大學校', 256, 100)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.6 })
  }

  #ironMat
  #makeIron() {
    // Wrought iron: bars with spear tips, two rails, a ring between.
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const x = c.getContext('2d')
    x.strokeStyle = '#fff'
    x.fillStyle = '#fff'
    x.lineWidth = 14
    for (let i = 16; i < 256; i += 32) {
      x.beginPath()
      x.moveTo(i, 256)
      x.lineTo(i, 22)
      x.stroke()
      x.beginPath()
      x.moveTo(i - 12, 30)
      x.lineTo(i, 4)
      x.lineTo(i + 12, 30)
      x.fill()
    }
    x.fillRect(0, 40, 256, 14)
    x.fillRect(0, 226, 256, 18)
    x.lineWidth = 9
    for (let i = 32; i < 256; i += 64) {
      x.beginPath()
      x.arc(i, 80, 13, 0, Math.PI * 2)
      x.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(1.5, 1)
    return new THREE.MeshStandardMaterial({ color: '#2a2522', metalness: 0.6, roughness: 0.5, map: t, alphaTest: 0.5, side: THREE.DoubleSide })
  }

  // Street lamps along the film's road, both sides, staggered: a dark post,
  // a warm globe that blooms, and a pool of light on the ground under it.
  #buildLamps() {
    const L = this.route.getLength()
    this.lampAt = []
    for (let d = 8, k = 0; d < L - 8; d += 24, k++) {
      const u = d / L
      const q = this.route.getPointAt(u)
      const t = this.route.getTangentAt(u)
      const side = k % 2 ? 1 : -1
      // None in the gateway, where the real gate has its planters.
      if (this.gateAt && Math.hypot(q.x - this.gateAt.x, q.z - this.gateAt.z) < 34) continue
      this.lampAt.push([q.x - t.z * side * 6.5, q.z + t.x * side * 6.5])
    }
    const n = this.lampAt.length
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 5, 6).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.6, metalness: 0.5 }), n)
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 12, 10).translate(0, 5.2, 0), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), n)
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,200,130,0.38)')
    gr.addColorStop(0.45, 'rgba(255,180,110,0.13)')
    gr.addColorStop(1, 'rgba(255,170,100,0)')
    x.fillStyle = gr
    x.fillRect(0, 0, 64, 64)
    this.lampMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0 })
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), this.lampMat, n)
    this.lamps = [post, head, pool]
    for (const m of this.lamps) ((m.frustumCulled = false), this.scene.add(m))
    this.#placeLamps()
  }

  #placeLamps() {
    if (!this.lamps) return
    const m = new THREE.Matrix4()
    this.lampAt.forEach(([x, z], i) => {
      const y = this.groundAt(x, z)
      m.makeTranslation(x, y, z)
      this.lamps[0].setMatrixAt(i, m)
      this.lamps[1].setMatrixAt(i, m)
      m.makeTranslation(x, y + 0.15, z)
      this.lamps[2].setMatrixAt(i, m)
    })
    for (const l of this.lamps) l.instanceMatrix.needsUpdate = true
  }

  // 호상, as it stands on campus: a white granite tiger poised on top of a
  // carved stone globe, the globe on a round stepped base, in a small paved
  // plaza under the trees; floodlit at night.
  #buildStatue() {
    const [x, z] = DATA.landmarks.tiger
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const stone = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.85 })
    const pale = new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 })
    // Plaza and the round stepped base.
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.2, 0.4, 48), new THREE.MeshStandardMaterial({ color: '#c9c1b2', roughness: 0.9 }))
    plaza.position.y = -0.15
    plaza.receiveShadow = true
    g.add(plaza)
    const step = (r, h, y, m = pale) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, h, 48), m)
      s.position.y = y + h / 2
      s.castShadow = s.receiveShadow = true
      g.add(s)
    }
    step(4.2, 0.45, 0)
    step(3.4, 0.45, 0.45)
    step(2.3, 0.9, 0.9, stone)
    // The globe: granite, the continents raised a little and paler, lines of
    // latitude and longitude cut into it.
    const gc = document.createElement('canvas')
    gc.width = 1024
    gc.height = 512
    const gx = gc.getContext('2d')
    gx.fillStyle = '#b9b5ad'
    gx.fillRect(0, 0, 1024, 512)
    let seed = 9
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    gx.fillStyle = '#e4e0d8'
    for (const [cx, cy, rx, ry] of [[200, 170, 120, 90], [250, 330, 70, 110], [520, 150, 150, 80], [560, 280, 80, 110], [760, 170, 180, 95], [860, 360, 70, 45], [430, 440, 160, 30]]) {
      gx.beginPath()
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2
        const w = 0.75 + rnd() * 0.45
        gx.lineTo(cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w)
      }
      gx.fill()
    }
    gx.strokeStyle = 'rgba(70,66,60,0.55)'
    gx.lineWidth = 3
    for (let k = 1; k < 8; k++) {
      gx.beginPath()
      gx.moveTo(0, (k * 512) / 8)
      gx.lineTo(1024, (k * 512) / 8)
      gx.stroke()
    }
    for (let k = 0; k < 12; k++) {
      gx.beginPath()
      gx.moveTo((k * 1024) / 12, 0)
      gx.lineTo((k * 1024) / 12, 512)
      gx.stroke()
    }
    const gt = new THREE.CanvasTexture(gc)
    gt.colorSpace = THREE.SRGBColorSpace
    gt.anisotropy = 8
    const R = 1.9
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.8, bumpMap: gt, bumpScale: 2 }))
    globe.position.y = 1.8 + R * 0.96
    globe.castShadow = globe.receiveShadow = true
    g.add(globe)
    this.globeTop = 1.8 + R * 1.9
    // The name on a low stone in front.
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 192
    const cx = c.getContext('2d')
    cx.fillStyle = '#2f2b2a'
    cx.fillRect(0, 0, 512, 192)
    cx.fillStyle = '#efcf83'
    cx.textAlign = 'center'
    cx.textBaseline = 'middle'
    cx.font = '900 96px "Noto Serif KR", serif'
    cx.fillText('虎 像', 256, 100)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7), pale)
    block.position.set(0, 0.45, 4.9)
    g.add(block)
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.75), new THREE.MeshBasicMaterial({ map: tex, color: '#d8d0c0' }))
    plate.position.set(0, 0.48, 5.26)
    g.add(plate)
    // Benches and lantern posts round the plaza.
    const postM = new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.6, metalness: 0.5 })
    const globeM = new THREE.MeshBasicMaterial({ color: '#ffd9a0' })
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.6, 8), postM)
      post.position.set(Math.sin(a) * 9, 1.8, Math.cos(a) * 9)
      g.add(post)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), globeM)
      bulb.position.set(Math.sin(a) * 9, 3.8, Math.cos(a) * 9)
      g.add(bulb)
    }
    // Floodlights in the paving, and the light itself.
    const fixM = new THREE.MeshBasicMaterial({ color: '#fff0d0' })
    for (const [fx, fz] of [[-5, 6.2], [5, 6.2], [0, -7]]) {
      const fix = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.2, 12), fixM)
      fix.position.set(fx, 0.12, fz)
      g.add(fix)
      const sp = new THREE.SpotLight('#fff1dc', 240, 30, 0.3, 0.7, 2)
      sp.position.set(fx, 0.3, fz)
      sp.target.position.set(0, 5, 0)
      g.add(sp, sp.target)
    }
    this.statue = g
    this.scene.add(g)
    // The tiger itself: white granite, lightly veined, poised on the globe.
    this.bronze = new RunTiger(this.scene, undefined, { scale: 0.03, fur: 0, rim: 0 })
    this.bronze.onReady = () => {
      this.bronze.group.traverse((o) => {
        if (!o.isMesh) return
        const map = o.material.map
        const mat = new THREE.MeshStandardMaterial({ map, metalness: 0, roughness: 0.75 })
        mat.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
              {
                // Carved stone: the coat's stripes survive only as a faint grain.
                float lum = dot(diffuseColor.rgb, vec3(0.333));
                diffuseColor.rgb = mix(vec3(0.9, 0.89, 0.86), vec3(0.74, 0.73, 0.7), smoothstep(0.45, 0.2, lum) * 0.6);
              }`,
            )
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              totalEmissiveRadiance += diffuseColor.rgb * 0.08;`,
            )
        }
        o.material = mat
        o.castShadow = true
      })
      const gt2 = this.bronze.gait
      gt2.mix = 1
      // Poised, head up and alert, as the statue stands.
      // Crouched along the top of the globe, head low and forward, as the
      // statue lies in wait.
      gt2.hold([
        ['c_jaw_00', 0.15],
        ['c_neck_00', 0.22],
        ['c_neck_01', 0.1],
        ['c_head_00', -0.05],
        ['l_femurRibbonFront_00', -0.35],
        ['r_femurRibbonFront_00', -0.35],
        ['l_tibiaRibbonFront_00', 0.5],
        ['r_tibiaRibbonFront_00', 0.5],
        ['c_tail_00', 0.1, 0.1],
        ['c_tail_02', -0.08, 0.15],
        ['c_tail_04', -0.12, 0.15],
      ])
      this.bronze.group.visible = true
      this.#placeBronze()
    }
  }

  #placeBronze() {
    if (!this.bronze?.ready || !this.statue) return
    const g = this.statue
    this.bronze.group.position.set(g.position.x, g.position.y + (this.globeTop ?? 5.5) - 0.35, g.position.z)
    this.bronze.group.rotation.y = g.rotation.y
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
    // A device that keeps struggling (two slow spells running) steps down
    // once, a little, and stays there: switching resolution back and forth
    // re-samples the whole frame and reads as flicker.
    A.slow = avg > 1 / 28 ? (A.slow ?? 0) + 1 : 0
    if (A.scale < 1 || A.slow < 2) return
    const next = 0.85
    A.scale = next
    const pr = Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5) * next
    this.renderer.setPixelRatio(pr)
    this.composer.setPixelRatio(pr)
    this.resize()
  }

  resize() {
    this.mapAt = null
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
    const { up, i, k, map } = this.#schedule(u)
    this.overview = up
    this.shot = map ? -1 : i
    let pos
    let look
    if (this.shows && map) {
      // The map: a slow drone drift, pushing in toward the first stop.
      const m = this.#mapPose()
      const g = new THREE.Vector3(this.shows[0].shot.cx, 0, this.shows[0].shot.cz)
      const e = THREE.MathUtils.smoothstep(u, 0, SHOWS_START)
      pos = m.pos.lerp(g.clone().add(new THREE.Vector3(0, m.pos.y * 0.55, (m.pos.z - m.look.z) * 0.55)), e * 0.6)
      look = m.look.lerp(g, e * 0.6)
      this.lens = 0
    } else if (this.shows) {
      ;({ pos, look } = this.#shotPose(this.shows[i], k, MOVES[i % MOVES.length]))
      // The gate is shot on a longer lens, as in the photograph of it.
      this.lens = this.shows[i].key === 'gate' ? 1 - up : 0
      if (up > 0) {
        pos = pos.clone().lerp(new THREE.Vector3(-560, 540, 880), THREE.MathUtils.smootherstep(up, 0, 1))
        look = look.clone().lerp(new THREE.Vector3(60, 0, -380), THREE.MathUtils.smootherstep(up, 0, 0.45))
      }
    } else {
      // Terrain still loading: hold high over the main gate.
      const [gx, gz] = DATA.landmarks.gate
      pos = new THREE.Vector3(gx, 200, gz + 260)
      look = new THREE.Vector3(gx, 0, gz - 100)
    }
    // A breath of hand-held drift and pointer parallax.
    const side = new THREE.Vector3(look.z - pos.z, 0, pos.x - look.x).normalize()
    // (None over the map: from that height any drift makes the city shimmer.)
    const hand = map ? 0 : 1
    pos.addScaledVector(side, (-this.mouse.x * 1.5 * (1 - up) + Math.sin(this.time * 0.4) * 0.3) * hand)
    pos.y += (this.mouse.y * 0.8 * (1 - up) + Math.sin(this.time * 0.31) * 0.15) * hand
    pos.y = Math.max(pos.y, this.groundAt(pos.x, pos.z) + 1.5)
    look.y -= this.portrait ? up * 170 : 0
    return { pos, look }
  }

  render(dt) {
    this.time += dt
    const u = this.progress
    // Critically damped follow of the scroll position.
    // Heavily damped: wheel steps become one smooth glide, never a lurch.
    this.u = this.u === undefined ? u : this.u + (u - this.u) * (1 - Math.exp(-dt * 1.7))
    this.look ??= new THREE.Vector3()

    let pose = this.#tourPose(this.u)
    this.#updateTiger(dt)
    const sch = this.#schedule(this.u)
    this.cut = this.free ? 0 : sch.cut
    this.shotK = sch.map ? 0 : sch.k
    // A new shot snaps straight to its first frame (under the dip to black).
    if (this.shot !== this.lastShot) ((this.lastShot = this.shot), (this.placed = false))
    // How much of the illustrated map is showing (route ribbon, pins).
    this.map = this.free ? 0 : 1 - THREE.MathUtils.smoothstep(this.u, SHOWS_START * 0.75, SHOWS_START + 0.02)
    // The map's road line goes before the view reaches the ground.
    // From afar, clear air: every hall reads, right out to the edge of campus.
    const focus = Math.max(this.map, this.overview ?? 0)
    FOCUS.value = focus
    this.scene.fog.near = 700 + focus * 1600
    this.scene.fog.far = 3600 + focus * 1500
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
    if (import.meta.env.DEV && this.debugCam) ((pose = this.debugCam), (this.placed = false))
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
    this.roll = (this.roll ?? 0) + ((this.free ? 0 : -this.mouse.x * 0.03) - (this.roll ?? 0)) * (1 - Math.exp(-dt * 3))
    // Speed: the view widens and shivers as the flight rushes.
    const moved = this.lastPos ? this.camera.position.distanceTo(this.lastPos) : 0
    ;(this.lastPos ??= new THREE.Vector3()).copy(this.camera.position)
    this.speed += (Math.min(600, moved / Math.max(dt, 1e-3)) - this.speed) * (1 - Math.exp(-dt * 4))
    // Only the long glides between landmarks feel fast, and only a little.
    this.rush = THREE.MathUtils.clamp((this.speed - 120) / 500, 0, 0.35)
    const shiver = Math.sin(this.time * 31) * Math.sin(this.time * 17) * 0.006 * this.rush
    this.camera.quaternion.copy(this.camQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll + shiver))
    const fov = THREE.MathUtils.lerp(this.portrait ? 74 : 58, this.portrait ? 52 : 36, (this.map ?? 0) > 0.5 ? 0 : this.lens ?? 0) + this.rush * 16
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    // The whole film is a night on campus: moonlight, lit windows, lamps.
    const night = 1
    if (this.sky && Math.abs(night - NIGHT.value) > 0.002) this.#setNight(night)

    // Shadows over the whole showcase view, a wider box from afar.
    const box = Math.round(THREE.MathUtils.lerp(220, 360, Math.max(this.overview ?? 0, this.map ?? 0, this.free ? 1 : 0)) / 10) * 10
    const sc = this.sun.shadow.camera
    if (sc.right !== box) ((sc.left = sc.bottom = -box), (sc.right = sc.top = box), sc.updateProjectionMatrix())
    // Sun and its shadow box follow what we look at, snapped to whole shadow
    // texels (in the light's own frame) so shadow edges never crawl.
    {
      const d = this.lightDir
      const right = new THREE.Vector3(0, 1, 0).cross(d).normalize()
      const upL = d.clone().cross(right)
      const texel = (2 * box) / this.sun.shadow.mapSize.x
      const a = Math.round(this.look.dot(right) / texel) * texel
      const b = Math.round(this.look.dot(upL) / texel) * texel
      const c = this.look.dot(d)
      const focus = right.multiplyScalar(a).addScaledVector(upL, b).addScaledVector(d, c)
      this.sun.target.position.copy(focus)
      this.sun.position.copy(focus).addScaledVector(d, 900)
    }
    // Depth precision where it is needed: from high over the campus the near
    // plane moves out, so roofs and walls never fight (and flicker).
    const near = THREE.MathUtils.lerp(0.5, 8, Math.max(this.map ?? 0, this.overview ?? 0))
    if (Math.abs(near - this.camera.near) > 0.05) ((this.camera.near = near), this.camera.updateProjectionMatrix())

    this.#updatePaws()
    this.students?.update(dt, this.tiger.group.position)
    this.animeSky.update(dt, this.camera, this.sunDir, NIGHT.value)
    // Storybook finish and golden motes during the building shots.
    const story = this.free || sch.map ? 0 : 1 - sch.up
    this.grade.uniforms.uStory.value += (story - this.grade.uniforms.uStory.value) * Math.min(1, dt * 3)
    if (this.sparkles && this.shows && !sch.map) {
      const sh = this.shows[sch.i].shot
      this.sparkU.uC.value.set(sh.cx, sh.base, sh.cz)
      this.sparkU.uR.value = Math.max(30, sh.R * 0.9)
      this.sparkU.uH.value = Math.max(18, sh.hl * 2.4)
    }
    this.sparkU.uTime.value = this.time
    this.sparkU.uPx.value = this.renderer.getPixelRatio()
    this.sparkU.uA.value = this.grade.uniforms.uStory.value * (1 - NIGHT.value * 0.3)
    // The landmark in shot: on through the shot, easing in and out at the cuts.
    for (const t of this.targets) t.near = 0
    if (this.shows && !this.free && !sch.map && sch.up < 0.3)
      this.shows[sch.i].near = THREE.MathUtils.smoothstep(sch.k, 0.06, 0.18) * (sch.i === this.shows.length - 1 ? 1 : 1 - THREE.MathUtils.smoothstep(sch.k, 0.9, 0.97)) * (1 - sch.up / 0.3)
    this.bloom.strength = 0.25 + NIGHT.value * 0.55
    this.#adapt(dt)
    this.composer.render()
  }

  // The mascot: in each shot the tiger stands on the road in front of the
  // hall, three-quarter on to the camera, breathing (its own idle clip; no
  // walking, so nothing to look awkward). At the 호상 it sits by the bronze.
  #tigerAt(u) {
    const { i, map } = this.#schedule(u)
    const S = this.shows
    if (!S || map) {
      const p = this.route.getPointAt(0.0005)
      p.y = this.groundAt(p.x, p.z)
      return { p, d: this.route.getTangentAt(0.0005).setY(0).normalize(), hide: true }
    }
    const t = S[i]
    if (t.key === 'tiger' && this.statue) {
      const g = this.statue
      const a = g.rotation.y
      // The bronze has the shot to itself.
      return { p: g.position.clone(), d: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), hide: true }
    }
    // On the road nearest the hall, facing between the hall and the camera.
    const p = this.route.getPointAt(t.routeU)
    p.y = this.groundAt(p.x, p.z)
    const mid = (t.shot.a0 + t.shot.a1) / 2
    const cam = new THREE.Vector3(t.shot.cx + Math.sin(mid) * t.shot.R, 0, t.shot.cz + Math.cos(mid) * t.shot.R)
    const toCam = cam.sub(p).setY(0).normalize()
    const toHall = new THREE.Vector3(t.shot.cx - p.x, 0, t.shot.cz - p.z).normalize()
    return { p, d: toCam.lerp(toHall, 0.45).normalize() }
  }

  #updateTiger(dt) {
    if (!this.route) return
    const { p, d, hide } = this.#tigerAt(this.u)
    this.tigerDir = d
    this.tiger.update(dt, p, d, 0, 0)
    if (this.tiger.ready) this.tiger.group.visible = !hide
  }

  #updatePaws() {
    // The film has no trail of prints; the map's road line marks the way.
    if (this.paws) this.paws.visible = false
  }
}
