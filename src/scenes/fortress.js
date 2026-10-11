import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The Fortress of Intellect: 본관, the 1934 granite gothic Main Hall, through
// one year. Scrolling (progress 0..1) circles it slowly from spring blossom
// to a summer noon, an autumn evening and a snowy night with every window
// lit: sky, sun, lawn, trees and what falls through the air all follow the
// season. Hover a part of the hall for its name and story.

export const PARTS = [
  { key: 'base', name: '화강암 기단', en: 'Granite Plinth', info: '건물 전체를 받치는 화강암 기단과 현관 계단.', dir: [0, -1.1, 0.3] },
  { key: 'wingL', name: '서쪽 날개', en: 'West Wing', info: '탑에서 서쪽으로 뻗은 3층 석조 날개. 거친 화강암을 켜켜이 쌓아 올렸다.', dir: [-1.6, 0.1, 0] },
  { key: 'wingR', name: '동쪽 날개', en: 'East Wing', info: '서쪽과 대칭을 이루는 날개. 좌우 대칭은 본관 정면의 위엄을 만든다.', dir: [1.6, 0.1, 0] },
  { key: 'windows', name: '석조 창', en: 'Stone-Framed Windows', info: '돌 틀과 세로 창살로 나뉜 긴 직사각형 창. 3층에 걸쳐 일정한 리듬으로 정면을 채운다.', dir: [0, 0.2, 1.6] },
  { key: 'buttress', name: '부벽', en: 'Buttresses', info: '벽을 바깥에서 받치는 돌기둥. 수직의 리듬으로 정면을 나눈다.', dir: [0, -0.3, 2.3] },
  { key: 'roof', name: '슬레이트 지붕', en: 'Slate Roof & Dormers', info: '짙은 슬레이트로 덮인 가파른 박공지붕과 지붕창.', dir: [0, 1.3, -0.4] },
  { key: 'tower', name: '중앙탑', en: 'Central Tower', info: '정면 한가운데 솟은 6층 중앙탑. 좌우 대칭 H자형 본관의 중심이자, 정문에서 똑바로 보이는 실루엣.', dir: [0, 1.7, 0.5] },
  { key: 'crown', name: '총안 흉벽과 깃대', en: 'Battlements & Flags', info: '평평한 탑 꼭대기를 두른 요철 성벽과 네 모서리의 작은 망루, 그리고 두 개의 깃대.', dir: [0, 2.8, 0.3] },
  { key: 'portal', name: '정면 현관', en: 'Main Portal', info: '첨두아치로 깊게 파인 현관. 본관의 얼굴이 되는 입구.', dir: [0, -0.5, 2.9] },
]

// Granite ashlar: rough blocks in uneven courses, drawn once. The same
// picture doubles as a bump map.
export function graniteCanvas() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#a29d96'
  g.fillRect(0, 0, 1024, 1024)
  let y = 0
  while (y < 1024) {
    const h = 48 + Math.floor(Math.random() * 3) * 16
    let x = -Math.random() * 120
    while (x < 1024) {
      const w = 90 + Math.random() * 120
      const v = 140 + Math.random() * 50
      g.fillStyle = `rgb(${v},${v - 4},${v - 9})`
      g.fillRect(x + 3, y + 3, w - 6, h - 6)
      x += w
    }
    y += h
  }
  for (let i = 0; i < 90000; i++) {
    const v = 90 + Math.random() * 150
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.15 + Math.random() * 0.35})`
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  return c
}

function slateCanvas() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#2b2f36'
  g.fillRect(0, 0, 512, 512)
  for (let row = 0; row < 16; row++)
    for (let k = -1; k < 17; k++) {
      const v = 34 + Math.random() * 22
      g.fillStyle = `rgb(${v},${v + 3},${v + 9})`
      g.fillRect(k * 32 + (row % 2) * 16 + 1, row * 32 + 1, 30, 30)
    }
  return c
}

const tex = (canvas, repeat = 1, srgb = true) => {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// A pointed (equilateral gothic) arch outline, w wide, sides h tall.
function archShape(w, h) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h)
  s.absarc(-w / 2, h, w, 0, Math.PI / 3, false)
  s.absarc(w / 2, h, w, (2 * Math.PI) / 3, Math.PI, false)
  s.lineTo(-w / 2, 0)
  return s
}

// A plain rectangular window, w wide, h tall, as on 본관's ranges.
function rectShape(w, h) {
  return new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)])
}
function rectFrame(w, h, t) {
  const s = rectShape(w + t * 2, h + t)
  s.holes.push(new THREE.Path(rectShape(w, h).getPoints()))
  return s
}

// The arch as a frame of width t.
function archFrame(w, h, t) {
  const s = archShape(w + t * 2, h)
  s.holes.push(new THREE.Path(archShape(w, h).getPoints(24)))
  return s
}

// Sky: zenith to horizon in the season's colours, stars only after dark.
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop, uHor;
  uniform float uStars;
  varying vec3 vDir;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main(){
    float h = vDir.y;
    vec3 col = mix(uHor, uTop, smoothstep(-0.02, 0.5, h));
    vec3 q = floor(vDir * 420.0);
    float s = step(0.9975, hash(q)) * smoothstep(0.05, 0.4, h);
    col += vec3(0.9, 0.9, 1.0) * s * hash(q + 3.0) * uStars;
    gl_FragColor = vec4(col, 1.0);
  }
`

// What drifts down in each season: blossom petals, nothing, leaves, snow.
const FALL_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uSize, uSpeed;
  varying float vSeed;
  void main(){
    vec3 p = position;
    float t = uTime * uSpeed * (0.6 + aSeed.x * 0.8);
    p.y = mod(p.y - t * 6.0, 55.0) - 2.0;
    p.x += sin(t * 1.3 + aSeed.y * 30.0) * 2.5 + t * 1.5;
    p.x = mod(p.x + 70.0, 140.0) - 70.0;
    p.z += cos(t * 0.9 + aSeed.z * 20.0) * 1.8;
    vSeed = aSeed.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aSeed.w * 0.8) * 300.0 / -mv.z;
  }
`
const FALL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity, uFlat;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    // Petals and leaves are flattened ellipses at a tilt; snow is round.
    float a = vSeed * 6.28;
    vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
    r.y *= mix(1.0, 2.2, uFlat);
    float d = length(r);
    float m = smoothstep(0.5, 0.3, d);
    gl_FragColor = vec4(uColor * (0.85 + 0.3 * vSeed), m * uOpacity);
  }
`

// The four seasons, from the first scroll to the last.
export const SEASONS = [
  { key: 'spring', name: '봄', en: 'SPRING', line: '벚꽃이 흩날리는 새 학기의 본관', top: '#7fb0e4', hor: '#f3d9e0', fog: '#e9d8de', sun: ['#fff1e0', 2.8, 0.62, 0.7], hemi: ['#d6e4ff', '#5d6e3e', 1.0], lawn: '#5b8a3a', ground: '#6d6a5e', tree: '#f2b3c6', fall: ['#ffc4d4', 0.9, 0.55, 1, 0.6], glow: 0.08, stars: 0 },
  { key: 'summer', name: '여름', en: 'SUMMER', line: '한낮의 햇살을 받는 화강암', top: '#3f86d8', hor: '#cfe5f5', fog: '#cfe0ee', sun: ['#fff8ec', 3.4, 1.0, 0.25], hemi: ['#cfe3ff', '#4a6a30', 1.1], lawn: '#3c7a2a', ground: '#6a675c', tree: '#2f6e24', fall: ['#fff6c8', 0, 0.2, 0, 0.3], glow: 0.05, stars: 0 },
  { key: 'autumn', name: '가을', en: 'AUTUMN', line: '석양에 물드는 고딕의 실루엣', top: '#5577b0', hor: '#f4b878', fog: '#e4b98e', sun: ['#ffb36a', 2.6, 0.28, -0.6], hemi: ['#ffd2a8', '#5a4428', 0.8], lawn: '#7c7a36', ground: '#6a5e4c', tree: '#d8642a', fall: ['#e2702a', 0.95, 0.9, 1, 0.45], glow: 0.45, stars: 0 },
  { key: 'winter', name: '겨울', en: 'WINTER', line: '눈 내리는 밤, 불 밝힌 지성의 요새', top: '#050918', hor: '#1d2442', fog: '#151b2e', sun: ['#9fb2e6', 0.7, 0.75, 1.2], hemi: ['#3a4670', '#1a1e28', 0.55], lawn: '#d9e2ee', ground: '#b9c3d2', tree: '#aeb9cb', fall: ['#ffffff', 0.9, 0.35, 0, 0.3], glow: 1, stars: 1 },
]

export class Fortress {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.15 : 1.75))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2('#0a0709', 0.0042)
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 2000)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.12

    this.skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uStars: { value: 0 } }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }))
    this.scene.add(sky)

    // Sun (the moon in winter) with soft shadows, sky fill, and floodlights
    // from the lawn that only come on after dark.
    this.sun = new THREE.DirectionalLight('#fff', 3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
    Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 400 })
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.4
    this.hemi = new THREE.HemisphereLight('#fff', '#333', 1)
    this.scene.add(this.sun, this.sun.target, this.hemi)
    const flood = (x, color, power) => {
      const l = new THREE.SpotLight(color, power, 160, 0.62, 0.7, 1.4)
      l.position.set(x, 1.5, 46)
      l.target.position.set(x * 0.6, 18, 0)
      this.scene.add(l, l.target)
      return l
    }
    this.floods = [flood(0, '#ffc28a', 1500), flood(-34, '#ffb070', 1000), flood(34, '#ffb070', 1000)]

    // Lawn, a granite path up to the portal, dark ground beyond.
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#0d0c0f', roughness: 1 })
    this.lawnMat = new THREE.MeshStandardMaterial({ color: '#16241a', roughness: 1 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(130, 70), this.lawnMat)
    lawn.rotation.x = -Math.PI / 2
    lawn.position.set(0, 0.03, 44)
    lawn.receiveShadow = true
    const path = new THREE.Mesh(new THREE.PlaneGeometry(9, 62), new THREE.MeshStandardMaterial({ color: '#57524c', roughness: 0.9 }))
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.06, 44)
    path.receiveShadow = true
    this.scene.add(ground, lawn, path)
    // Lamp posts along the path.
    const postMat = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5, metalness: 0.6 })
    const lampMat = (this.lampMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0' }))
    for (const z of [22, 36, 50, 64])
      for (const x of [-7, 7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 8), postMat)
        post.position.set(x, 2.1, z)
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), lampMat)
        lamp.position.set(x, 4.4, z)
        this.scene.add(post, lamp)
      }

    const gc = graniteCanvas()
    this.stone = new THREE.MeshStandardMaterial({ map: tex(gc), bumpMap: tex(gc, 1, false), bumpScale: 2.2, roughness: 0.92, color: '#d8d2ca' })
    this.trim = new THREE.MeshStandardMaterial({ map: tex(gc), bumpMap: tex(gc, 1, false), bumpScale: 1, roughness: 0.85, color: '#efe8de' })
    this.slate = new THREE.MeshStandardMaterial({ map: tex(slateCanvas()), roughness: 0.55, metalness: 0.15 })
    this.glass = new THREE.MeshBasicMaterial({ vertexColors: true })
    this.dark = new THREE.MeshStandardMaterial({ color: '#0c0b0d', roughness: 0.6 })
    this.parts = new Map()
    this.meshes = []
    this.#build()

    this.#plantTrees()
    this.#buildCampus()
    // Particles drifting down through the whole scene.
    const n = mobile ? 900 : 2200
    const fp = new Float32Array(n * 3)
    const fs = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      fp.set([(Math.random() - 0.5) * 140, Math.random() * 55, -30 + Math.random() * 110], i * 3)
      fs.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const fg = new THREE.BufferGeometry()
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3))
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 4))
    this.fallU = { uTime: { value: 0 }, uSize: { value: 1 }, uSpeed: { value: 1 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uFlat: { value: 0 } }
    this.fall = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: this.fallU, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false }))
    this.fall.frustumCulled = false
    this.scene.add(this.fall)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.95)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.progress = 0
    this.time = 0
    this.hovered = null
    this.pointer = new THREE.Vector2(9, 9)
    this.mouse = new THREE.Vector2()
    this.ray = new THREE.Raycaster()
    const aim = (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    canvas.addEventListener('pointermove', aim)
    // A tap picks a part and keeps it picked until the next tap.
    canvas.addEventListener('pointerdown', aim)
    canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.pointer.set(9, 9))
    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // One part: several [geometries, material] layers moving as one.
  #part(key, layers) {
    const def = PARTS.find((p) => p.key === key)
    const prep = (g) => {
      g = g.index ? g.toNonIndexed() : g
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      return g
    }
    const merged = layers.map(([geos, mat]) => [mergeGeometries(geos.map(prep)), mat])
    const box = new THREE.Box3()
    merged.forEach(([g]) => (g.computeBoundingBox(), box.union(g.boundingBox)))
    const center = box.getCenter(new THREE.Vector3())
    const group = new THREE.Group()
    const mats = []
    const all = []
    for (const [g, mat] of merged) {
      g.translate(-center.x, -center.y, -center.z)
      const m = mat.clone()
      const mesh = new THREE.Mesh(g, m)
      mesh.castShadow = mesh.receiveShadow = mat !== this.glass
      mesh.userData.part = group
      group.add(mesh)
      this.meshes.push(mesh)
      mats.push(m)
      all.push(g)
    }
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(mergeGeometries(all.map((g) => new THREE.BufferGeometry().setAttribute('position', g.attributes.position))), 25), new THREE.LineBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0, fog: false }))
    group.add(wire)
    group.position.copy(center)
    group.userData = { ...def, home: center.clone(), wire, mats, seed: Math.random() }
    this.scene.add(group)
    this.parts.set(key, group)
  }

  // Avenue trees along the lawn and a grove either side of the hall: round,
  // slightly lumpy crowns on dark trunks, their colour set by the season.
  #plantTrees() {
    const spots = []
    for (const x of [-17, 17, -29, 29]) for (let z = 20; z <= 68; z += 12) spots.push([x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 3, 0.85 + Math.random() * 0.35])
    for (const x of [-48, -56, 48, 56]) for (const z of [-14, -2, 10]) spots.push([x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, 1 + Math.random() * 0.4])
    // A soft, billowing crown: a cluster of smooth lobes, lit pale on top and
    // shaded beneath (vertex colour), like the trees in a picture book.
    const lobes = [[0, 7.8, 0, 3.3], [0, 10.0, 0.2, 2.4]]
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3
      lobes.push([Math.cos(a) * 2.7, 7.0 + (k % 2) * 1.1, Math.sin(a) * 2.7, 2.1 + (k % 3) * 0.25])
    }
    const crownOf = (lobes, detail) => mergeGeometries(
      lobes.map(([x, y, z, r]) => {
        const g = mergeVertices(new THREE.IcosahedronGeometry(r, detail))
        g.deleteAttribute('uv')
        const p = g.attributes.position
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i)
          v.multiplyScalar(1 + 0.06 * Math.sin(v.x * 3 + v.y * 2) * Math.cos(v.z * 3))
          p.setXYZ(i, v.x + x, v.y * 0.92 + y, v.z + z)
        }
        g.computeVertexNormals()
        const n = g.attributes.normal
        const c = new Float32Array(p.count * 3)
        for (let i = 0; i < p.count; i++) {
          const k = 0.62 + 0.38 * THREE.MathUtils.smoothstep(n.getY(i) + (p.getY(i) - 7) * 0.12, -0.6, 0.9)
          c.set([k, k, k], i * 3)
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3))
        return g
      }),
    )
    const crown = crownOf(lobes, 3)
    // The hill's hundreds of trees, seen from afar: fewer, coarser lobes.
    this.hillCrownGeo = crownOf([lobes[0], lobes[1], lobes[2], lobes[4], lobes[6]], 1)
    const trunk = new THREE.CylinderGeometry(0.35, 0.55, 6, 8).translate(0, 3, 0)
    this.crownMat = new THREE.MeshStandardMaterial({ color: '#2f6e24', roughness: 0.9, vertexColors: true })
    const crowns = new THREE.InstancedMesh(crown, this.crownMat, spots.length)
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 1 }), spots.length)
    const m = new THREE.Matrix4()
    const tint = new THREE.Color()
    spots.forEach(([x, z, k], i) => {
      m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(k, k, k))
      crowns.setMatrixAt(i, m)
      trunks.setMatrixAt(i, m)
      // Each tree a shade apart, so the avenue never looks cloned.
      crowns.setColorAt(i, tint.setHSL(0, 0, 0.82 + Math.random() * 0.3))
    })
    crowns.castShadow = trunks.castShadow = true
    crowns.receiveShadow = true
    this.scene.add(crowns, trunks)
    this.crownGeo = crown
    this.trunkGeo = trunk
  }

  // The campus around 본관, as it is in 안암: granite gothic halls framing
  // the lawn and standing behind, two with towers; the wooded hill rising
  // beyond; the city's towers faint in the distance.
  #buildCampus() {
    // Facade: granite with bays of pointed-arch windows, 3 m bays, 4 m
    // floors; the windows double as the night's lit glass (emissive map).
    const W = 512
    const H = 512
    const face = document.createElement('canvas')
    face.width = W
    face.height = H
    const lit = document.createElement('canvas')
    lit.width = W
    lit.height = H
    const f = face.getContext('2d')
    const l = lit.getContext('2d')
    f.fillStyle = '#b9b0a5'
    f.fillRect(0, 0, W, H)
    for (let i = 0; i < 2600; i++) {
      const v = 150 + Math.random() * 50
      f.fillStyle = `rgba(${v},${v - 6},${v - 14},0.25)`
      f.fillRect(Math.random() * W, Math.random() * H, 10 + Math.random() * 24, 6 + Math.random() * 8)
    }
    l.fillStyle = '#000'
    l.fillRect(0, 0, W, H)
    const cols = 4
    const rows = 3
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * (W / cols)
        const y0 = r * (H / rows) + 34
        const ww = 46
        const wh = 92
        const arch = (g) => {
          g.beginPath()
          g.moveTo(cx - ww / 2, y0 + wh)
          g.lineTo(cx - ww / 2, y0 + 26)
          g.quadraticCurveTo(cx - ww / 2, y0 - 6, cx, y0 - 14)
          g.quadraticCurveTo(cx + ww / 2, y0 - 6, cx + ww / 2, y0 + 26)
          g.lineTo(cx + ww / 2, y0 + wh)
          g.closePath()
        }
        f.fillStyle = '#e6dfd3'
        f.fillRect(cx - ww / 2 - 6, y0 + wh, ww + 12, 8)
        arch(f)
        f.fillStyle = '#2a2e38'
        f.fill()
        f.fillStyle = '#d8d0c3'
        f.fillRect(cx - 2, y0 - 10, 4, wh + 10)
        arch(l)
        l.fillStyle = Math.random() < 0.7 ? '#ffb45a' : '#3a2410'
        l.fill()
      }
    const tex = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return t
    }
    this.campusMat = new THREE.MeshStandardMaterial({ map: tex(face, true), emissiveMap: tex(lit, true), emissive: '#ffc070', emissiveIntensity: 0, roughness: 0.9 })
    const plain = new THREE.MeshStandardMaterial({ color: '#b3aa9e', roughness: 0.9 })
    const slate = this.slate
    // A box whose faces carry the facade at its real size (12 m tile).
    const hallBox = (w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d)
      const uv = g.attributes.uv
      const nrm = g.attributes.normal
      const pos = g.attributes.position
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nrm.getX(i))
        const u = (nx > 0.5 ? pos.getZ(i) : pos.getX(i)) / 12
        uv.setXY(i, u, (pos.getY(i) + h / 2 - 1) / 12)
      }
      return g
    }
    const hall = (x, z, w, d, h, rot, tower = false) => {
      const g = new THREE.Group()
      const body = new THREE.Mesh(hallBox(w, h, d), [this.campusMat, this.campusMat, plain, plain, this.campusMat, this.campusMat])
      body.position.y = h / 2
      body.castShadow = body.receiveShadow = true
      g.add(body)
      // Plinth and cornice in paler stone.
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), plain)
      plinth.position.y = 0.6
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8), plain)
      cornice.position.y = h - 0.2
      g.add(plinth, cornice)
      // Steep slate roof along the long side.
      const long = w >= d
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, (long ? d : w) * 0.62, long ? w : d, 4, 1), slate)
      roof.rotation.set(long ? 0 : Math.PI / 2, Math.PI / 4, long ? Math.PI / 2 : 0)
      roof.scale.set(1, 1, 1)
      roof.position.y = h + (long ? d : w) * 0.18
      roof.castShadow = true
      g.add(roof)
      if (tower) {
        const t = new THREE.Mesh(hallBox(9, h * 1.9, 9), [this.campusMat, this.campusMat, plain, plain, this.campusMat, this.campusMat])
        t.position.set(long ? w / 2 - 6 : 0, (h * 1.9) / 2, long ? 0 : d / 2 - 6)
        t.castShadow = true
        g.add(t)
        for (const [px, pz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) {
          const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 6), plain)
          pin.position.set(t.position.x + px, h * 1.9 + 2, t.position.z + pz)
          g.add(pin)
        }
      }
      g.position.set(x, 0, z)
      g.rotation.y = rot
      this.scene.add(g)
    }
    // Framing the lawn either side, and around the back of 본관.
    hall(-74, 6, 34, 13, 15, 0.25)
    // (Set back from the camera's arc: at either end of the year it looks
    // across these corners at the hall.)
    hall(-98, 30, 13, 34, 14, 0)
    hall(76, 4, 34, 13, 16, -0.25, true)
    hall(98, 32, 13, 34, 14, 0)
    hall(-48, -46, 44, 14, 18, 0.05)
    hall(42, -50, 50, 15, 17, -0.08, true)
    hall(-112, -32, 38, 14, 14, 0.45)
    hall(116, -28, 36, 14, 15, -0.45)
    hall(-112, 62, 30, 13, 13, 0.1)
    hall(116, 66, 30, 13, 13, -0.1)
    hall(-20, -108, 64, 16, 20, 0, true)
    hall(84, -112, 42, 14, 18, -0.2)
    hall(-120, -104, 40, 14, 16, 0.3)
    // The wooded hill behind, trees in the season's colour.
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ color: '#3d5a2c', roughness: 1 }))
    hill.scale.set(420, 90, 160)
    hill.position.set(0, -20, -300)
    this.hillMat = hill.material
    this.scene.add(hill)
    const N = 420
    const crowns = new THREE.InstancedMesh(this.hillCrownGeo, this.crownMat, N)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const tint = new THREE.Color()
    for (let i = 0; i < N; i++) {
      // A point on the hill's front face, nudged out onto its surface.
      const a = (Math.random() - 0.5) * Math.PI * 0.9
      const b = Math.random() * 0.95
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(b * 1.2), Math.sin(b * 1.2), Math.cos(a) * Math.cos(b * 1.2))
      const p = new THREE.Vector3(dir.x * 420, dir.y * 90 - 20 - 2, dir.z * 160 - 300)
      if (p.y < 2 || p.z < -300 + 40) continue
      const k = 1.6 + Math.random() * 1.4
      m.compose(p, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(k, k, k))
      crowns.setMatrixAt(i, m)
      crowns.setColorAt(i, tint.setHSL(0, 0, 0.75 + Math.random() * 0.35))
    }
    this.scene.add(crowns)
    // The city beyond: tall blocks, pale in the haze.
    const city = new THREE.MeshStandardMaterial({ color: '#8a90a0', roughness: 1 })
    for (let i = 0; i < 26; i++) {
      const hgt = 40 + Math.random() * 70
      const b = new THREE.Mesh(new THREE.BoxGeometry(18 + Math.random() * 20, hgt, 18), city)
      const ang = -1.4 + (i / 25) * 2.8
      b.position.set(Math.sin(ang) * 520, hgt / 2 - 4, -Math.cos(ang) * 420 - 80)
      this.scene.add(b)
    }
  }

  #build() {
    // Boxes textured in metres so blocks keep their size.
    const box = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d)
      const uv = g.attributes.uv
      const n = g.attributes.normal
      const p = g.attributes.position
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(n.getX(i)) > 0.5 ? [p.getZ(i) + z, p.getY(i) + y] : Math.abs(n.getY(i)) > 0.5 ? [p.getX(i) + x, p.getZ(i) + z] : [p.getX(i) + x, p.getY(i) + y]
        uv.setXY(i, ax[0] / 12, ax[1] / 12)
      }
      g.translate(x, y, z)
      return g
    }
    const shapeAt = (shape, depth, x, y, z, rotY = 0, bevel = false) => {
      const g = depth ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 10 }) : new THREE.ShapeGeometry(shape, 10)
      if (rotY) g.rotateY(rotY)
      g.translate(x, y, z)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12)
      return g
    }
    // A pane of glass with its own warm glow (or dark, for an empty room).
    const lit = (g, k) => {
      const c = new THREE.Color().setRGB(1.0, 0.6, 0.26).multiplyScalar(k)
      const n = g.attributes.position.count
      const a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(a, 3))
      return g
    }
    const glow = () => (Math.random() < 0.22 ? 0.05 : 0.5 + Math.random() * 0.9)

    const P = 2.4 // plinth height
    const W = 30 // each wing's run
    const D = 14
    const H = 15
    const X0 = 6 // wings start at the tower's sides
    const front = D / 2

    this.#part('base', [[[box(2 * (X0 + W) + 6, P, D + 6, 0, P / 2, 0), box(14, 0.8, 4, 0, 0.4, front + 7.6), box(16, 0.8, 4, 0, 0.4 * 0, front + 9.6)], this.stone]])
    // A string course under the eaves, a little proud of the wall.
    for (const side of [-1, 1]) {
      const cx = side * (X0 + W / 2)
      this.#part(side < 0 ? 'wingL' : 'wingR', [[[box(W, H, D, cx, P + H / 2, 0), box(W + 0.4, 0.6, D + 0.6, cx, P + H - 0.3, 0), box(W + 0.4, 0.5, D + 0.5, cx, P + 0.25, 0)], this.stone]])
    }

    // Windows: three floors of tall rectangular windows on both wings, front
    // and back (as on the real 본관), glass inside a stone frame with a mullion.
    const glass = []
    const frames = []
    const sill = []
    for (const side of [-1, 1])
      for (let bay = 0; bay < 7; bay++)
        for (let fl = 0; fl < 3; fl++)
          for (const face of [1, -1]) {
            const x = side * (X0 + 2.4 + bay * 3.9 + 1.9 * 0)
            const y = P + 1.6 + fl * 4.7
            const z = face * (front + 0.02)
            const ry = face < 0 ? Math.PI : 0
            const w = 1.9
            const h = fl === 2 ? 2.2 : 2.9
            glass.push(lit(shapeAt(rectShape(w, h), 0, x, y, z, ry), glow()))
            frames.push(shapeAt(rectFrame(w, h, 0.28), 0.35, x, y, face > 0 ? z - 0.05 : z + 0.05, ry))
            frames.push(box(0.14, h, 0.2, x, y + h / 2, face * (front + 0.08)))
            frames.push(box(w, 0.12, 0.2, x, y + h * 0.66, face * (front + 0.08)))
            sill.push(box(w + 0.8, 0.28, 0.6, x, y - 0.14, face * (front + 0.2)))
          }
    // The central tower: no clock (that is the old library's), just floor
    // upon floor of paired rectangular windows over the portal.
    for (let fl = 0; fl < 5; fl++)
      for (const dx of [-1.5, 1.5]) {
        const y = P + 7.2 + fl * 4.4
        glass.push(lit(shapeAt(rectShape(1.6, 2.6), 0, dx, y, 7.03), glow()))
        frames.push(shapeAt(rectFrame(1.6, 2.6, 0.25), 0.35, dx, y, 6.95))
        sill.push(box(2.2, 0.25, 0.5, dx, y - 0.12, 7.2))
      }
    // End pavilions: each wing ends in a block stepped forward, gabled to the front.
    const PW = 11
    for (const side of [-1, 1]) {
      const cx = side * (X0 + W - PW / 2)
      frames.push(box(PW, H + 1.5, 5, cx, P + (H + 1.5) / 2, front + 2.5))
      for (let fl = 0; fl < 3; fl++)
        for (const dx of [-2.4, 0, 2.4]) {
          const y = P + 1.6 + fl * 4.7
          glass.push(lit(shapeAt(rectShape(1.7, fl === 2 ? 2.2 : 2.9), 0, cx + dx, y, front + 5.03), glow()))
          frames.push(shapeAt(rectFrame(1.7, fl === 2 ? 2.2 : 2.9, 0.25), 0.3, cx + dx, y, front + 4.95))
        }
      this.pavilions ??= []
      this.pavilions.push(cx)
    }
    this.#part('windows', [
      [glass, this.glass],
      [frames, this.trim],
      [sill, this.trim],
    ])

    // Buttresses between the bays, stepped twice on the way up.
    const but = []
    for (const side of [-1, 1])
      for (let k = 0; k <= 7; k++) {
        const x = side * (X0 + 0.45 + k * 3.9 + (k === 7 ? -0.9 : 0))
        but.push(box(0.9, H * 0.55, 1.6, x, P + (H * 0.55) / 2, front + 0.8))
        but.push(box(0.9, H * 0.35, 1.1, x, P + H * 0.55 + (H * 0.35) / 2, front + 0.55))
        but.push(box(0.9, 1.6, 0.7, x, P + H * 0.9 + 0.8, front + 0.35))
      }
    // Corner buttresses rising the full height of the tower.
    for (const x of [-6.3, 6.3]) but.push(box(1.6, 27, 1.8, x, P + 13.5, 7.6))
    this.#part('buttress', [[but, this.stone]])

    // Steep gabled slate roofs with dormers, stone gable ends.
    const roof = []
    const gables = []
    const dormerGlass = []
    const RH = 7
    const tri = new THREE.Shape([new THREE.Vector2(-(D / 2 + 0.6), 0), new THREE.Vector2(D / 2 + 0.6, 0), new THREE.Vector2(0, RH)])
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(tri, { depth: W, bevelEnabled: false })
      g.rotateY(Math.PI / 2)
      g.translate(side < 0 ? -(X0 + W) : X0, P + H, 0)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 10, uv.getY(i) / 10)
      roof.push(g)
      // The outer gable wall.
      const gw = shapeAt(new THREE.Shape([new THREE.Vector2(-(D / 2), 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, RH - 0.4)]), 0.8, side * (X0 + W) - (side > 0 ? 0.8 : 0) * 0 - 0.4, P + H, 0, Math.PI / 2)
      gables.push(gw)
      // Dormers on the front slope.
      for (let k = 0; k < 5; k++) {
        const x = side * (X0 + 4.4 + k * 5.6)
        gables.push(box(2.4, 2.6, 2.4, x, P + H + 1.7, front - 2.2))
        const dr = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-1.5, 0), new THREE.Vector2(1.5, 0), new THREE.Vector2(0, 1.5)]), { depth: 3, bevelEnabled: false })
        dr.translate(x, P + H + 3, front - 3.6)
        roof.push(dr)
        dormerGlass.push(lit(shapeAt(archShape(1.1, 1.0), 0, x, P + H + 0.9, front - 0.98), glow()))
      }
      // Chimneys.
      gables.push(box(1.6, 4, 1.6, side * (X0 + W * 0.55), P + H + RH - 0.8, -2))
      // The end pavilion's front gable and its roof, running front to back.
      const pcx = side * (X0 + W - 5.5)
      const ptri = new THREE.Shape([new THREE.Vector2(-6.1, 0), new THREE.Vector2(6.1, 0), new THREE.Vector2(0, RH)])
      const pr = new THREE.ExtrudeGeometry(ptri, { depth: D + 5.6, bevelEnabled: false })
      pr.translate(pcx, P + H + 1.5, -D / 2 - 0.3)
      roof.push(pr)
      gables.push(shapeAt(new THREE.Shape([new THREE.Vector2(-5.5, 0), new THREE.Vector2(5.5, 0), new THREE.Vector2(0, RH - 0.5)]), 0.8, pcx, P + H + 1.5, front + 4.3))
      dormerGlass.push(lit(shapeAt(rectShape(1.4, 2.2), 0, pcx, P + H + 2.3, front + 5.13), glow()))
    }
    this.#part('roof', [
      [roof, this.slate],
      [gables, this.stone],
      [dormerGlass, this.glass],
    ])

    // The tower itself, with an upper stage stepped in.
    this.#part('tower', [[[box(12, 22, 12, 0, P + 11, 1), box(11, 10, 11, 0, P + 22 + 5, 1), box(12.6, 0.7, 12.6, 0, P + 22, 1), box(12.2, 0.8, 12.2, 0, P + 31.6, 1)], this.stone]])

    // Battlements, and an octagonal pinnacle on every corner.
    const crown = []
    const TOP = P + 32
    for (let k = 0; k < 5; k++)
      for (const [dx, dz, w, d] of [
        [-4.4 + k * 2.2, 6.6, 1.2, 0.8],
        [-4.4 + k * 2.2, -4.6, 1.2, 0.8],
        [5.6, -3.4 + k * 2.2 + 1, 0.8, 1.2],
        [-5.6, -3.4 + k * 2.2 + 1, 0.8, 1.2],
      ])
        crown.push(box(w, 1.8, d, dx, TOP + 0.9, dz))
    for (const [x, z] of [[-6, -5], [6, -5], [-6, 7], [6, 7]]) {
      const shaft = new THREE.CylinderGeometry(1.0, 1.1, TOP + 3 - P, 8)
      shaft.translate(x, P + (TOP + 3 - P) / 2, z)
      crown.push(shaft)
      const cap = new THREE.CylinderGeometry(1.25, 1.25, 0.5, 8)
      cap.translate(x, TOP + 3.2, z)
      crown.push(cap)
      // No spires: the real turrets end in a little crenellated top.
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2 + Math.PI / 4
        crown.push(box(0.6, 0.7, 0.6, x + Math.cos(a) * 0.9, TOP + 3.8, z + Math.sin(a) * 0.9))
      }
    }
    this.#part('crown', [[crown, this.stone]])
    // Two flagpoles on the flat top of the tower, as on the real 본관.
    for (const [fx, col] of [[-2.2, '#f4f1ea'], [2.2, '#a50034']]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 8), new THREE.MeshStandardMaterial({ color: '#c9c9c9', metalness: 0.7, roughness: 0.3 }))
      pole.position.set(fx, TOP + 3.5, 1)
      this.scene.add(pole)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 8, 1), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }))
      flag.position.set(fx + 1.15, TOP + 6.2, 1)
      this.scene.add(flag)
      ;(this.flags ??= []).push(flag)
    }

    // The portal: a deep pointed arch with a dark door and lanterns.
    const portal = [shapeAt(archFrame(5, 4.6, 1.1), 2.6, 0, P, 7.0, 0, true), shapeAt(archFrame(4.2, 4.2, 0.4), 1.4, 0, P, 7.6)]
    const door = [shapeAt(archShape(4.2, 4.2), 0, 0, P, 7.4)]
    const lantern = [new THREE.SphereGeometry(0.38, 12, 8).translate(-4.2, P + 4.6, 9.8), new THREE.SphereGeometry(0.38, 12, 8).translate(4.2, P + 4.6, 9.8)]
    lantern.forEach((g) => lit(g, 2.2))
    this.#part('portal', [
      [portal, this.trim],
      [door, this.dark],
      [lantern, this.glass],
    ])
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.updateProjectionMatrix()
  }

  // The season at the current scroll: the two seasons either side and how
  // far between them. Each season holds, then turns over into the next.
  season() {
    const f = THREE.MathUtils.clamp(this.progress, 0, 0.999) * SEASONS.length
    const i = Math.floor(f)
    const t = i < SEASONS.length - 1 ? THREE.MathUtils.smoothstep(f - i, 0.8, 1) : 0
    return { i, t, a: SEASONS[i], b: SEASONS[Math.min(i + 1, SEASONS.length - 1)] }
  }

  // Screen position (px) of a part's centre.
  screenOf(part) {
    const v = part.getWorldPosition(new THREE.Vector3()).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: v.z > 1 }
  }

  render(dt) {
    // The flags stir in the wind.
    if (this.flags) {
      this.ft = (this.ft ?? 0) + dt
      for (const [k, f] of this.flags.entries()) {
        const p = f.geometry.attributes.position
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i) + 1.1
          p.setZ(i, Math.sin(this.ft * 4 + u * 3 + k) * 0.18 * u)
        }
        p.needsUpdate = true
      }
    }
    this.time += dt
    const p = this.progress
    const { t, a, b } = this.season()
    const col = (k, out) => out.set(a[k]).lerp(new THREE.Color(b[k]), t)
    const num = (x, y) => x + (y - x) * t
    const glow = num(a.glow, b.glow)

    // Sky, fog, sun and fill.
    col('top', this.skyU.uTop.value)
    col('hor', this.skyU.uHor.value)
    this.skyU.uStars.value = num(a.stars, b.stars)
    col('fog', this.scene.fog.color)
    this.sun.color.set(a.sun[0]).lerp(new THREE.Color(b.sun[0]), t)
    this.sun.intensity = num(a.sun[1], b.sun[1])
    const elev = num(a.sun[2], b.sun[2])
    const az = num(a.sun[3], b.sun[3])
    this.sun.position.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).multiplyScalar(200)
    this.sun.target.position.set(0, 10, 10)
    this.hemi.color.set(a.hemi[0]).lerp(new THREE.Color(b.hemi[0]), t)
    this.hemi.groundColor.set(a.hemi[1]).lerp(new THREE.Color(b.hemi[1]), t)
    this.hemi.intensity = num(a.hemi[2], b.hemi[2])
    this.scene.environmentIntensity = 0.3 * (1 - glow) + 0.08
    col('lawn', this.lawnMat.color)
    col('ground', this.groundMat.color)
    col('tree', this.crownMat.color)

    // Lit windows, lanterns and floodlights come on as the light goes.
    for (const part of this.parts.values())
      for (const m of part.userData.mats) if (m.vertexColors) m.color.setScalar(0.1 + glow * 0.9)
    // The halls around light up with 본관; the hill takes the season's tone.
    this.campusMat.emissiveIntensity = glow * 1.3
    this.hillMat.color.copy(this.crownMat.color).multiplyScalar(0.55)
    this.lampMat.color.set('#55524c').lerp(new THREE.Color('#ffd9a0'), glow)
    this.floods.forEach((l) => (l.intensity = (l.userData.base ??= l.intensity) * glow * 0.5))
    // Clear air by day, a little haze at night.
    this.scene.fog.density = 0.0018 + glow * 0.0022
    this.bloom.strength = 0.15 + glow * 0.4

    // Petals, leaves or snow.
    this.fallU.uTime.value = this.time
    this.fallU.uColor.value.set(a.fall[0]).lerp(new THREE.Color(b.fall[0]), t)
    this.fallU.uOpacity.value = num(a.fall[1], b.fall[1])
    this.fallU.uSize.value = num(a.fall[2], b.fall[2])
    this.fallU.uFlat.value = num(a.fall[3], b.fall[3])
    this.fallU.uSpeed.value = num(a.fall[4], b.fall[4])

    // Hover glow on the part under the pointer.
    for (const part of this.parts.values()) {
      const u = part.userData
      const hot = this.hovered === part ? 1 : 0
      u.wire.material.opacity += (hot * 0.9 - u.wire.material.opacity) * Math.min(1, dt * 8)
      for (const m of u.mats) m.emissive?.setHex(hot ? 0x3a0606 : 0)
    }

    // Camera: one slow half-circle round the hall over the year, low enough
    // to look up at the tower; the pointer adds a little parallax.
    const ang = -0.75 + p * 1.5 + this.mouse.x * 0.08
    const dist = this.portrait ? 175 : 112
    const y = 16 + Math.sin(p * Math.PI) * 10 - this.mouse.y * 5
    this.camera.position.set(Math.sin(ang) * dist, y, Math.cos(ang) * dist)
    this.camera.lookAt(this.portrait ? 0 : -9 * Math.cos(ang), 17, 0)

    // Hover: whichever part is under the pointer.
    this.ray.setFromCamera(this.pointer, this.camera)
    const hit = this.pointer.x < 5 && this.ray.intersectObjects(this.meshes)[0]
    this.hovered = hit ? hit.object.userData.part : null
    this.composer.render()
  }
}
