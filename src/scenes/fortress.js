import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The Fortress of Intellect: 본관, the 1934 granite gothic Main Hall, at
// night, floodlit from the lawn with its windows lit. A crimson scan line
// surveys it; scrolling (progress 0..1) bursts it into its parts in mid-air,
// holds them for exploring (hover a part: red wireframe and its name), then
// slams it back together.

export const PARTS = [
  { key: 'base', name: '화강암 기단', en: 'Granite Plinth', info: '건물 전체를 받치는 화강암 기단과 현관 계단.', dir: [0, -1.1, 0.3] },
  { key: 'wingL', name: '서쪽 날개', en: 'West Wing', info: '탑에서 서쪽으로 뻗은 3층 석조 날개. 거친 화강암을 켜켜이 쌓아 올렸다.', dir: [-1.6, 0.1, 0] },
  { key: 'wingR', name: '동쪽 날개', en: 'East Wing', info: '서쪽과 대칭을 이루는 날개. 좌우 대칭은 본관 정면의 위엄을 만든다.', dir: [1.6, 0.1, 0] },
  { key: 'windows', name: '첨두아치 창', en: 'Pointed-Arch Windows', info: '끝이 뾰족한 아치 창. 하늘로 치솟는 고딕 양식의 상징이다.', dir: [0, 0.2, 1.6] },
  { key: 'buttress', name: '부벽', en: 'Buttresses', info: '벽을 바깥에서 받치는 돌기둥. 수직의 리듬으로 정면을 나눈다.', dir: [0, -0.3, 2.3] },
  { key: 'roof', name: '슬레이트 지붕', en: 'Slate Roof & Dormers', info: '짙은 슬레이트로 덮인 가파른 박공지붕과 지붕창.', dir: [0, 1.3, -0.4] },
  { key: 'tower', name: '시계탑', en: 'Clock Tower', info: '정면 한가운데 솟은 시계탑. 멀리서도 고려대임을 알아보게 하는 실루엣.', dir: [0, 1.7, 0.5] },
  { key: 'crown', name: '총안 흉벽과 첨탑', en: 'Battlements & Pinnacles', info: '탑 꼭대기를 두른 요철 성벽과 네 모서리의 팔각 첨탑. 석조 요새의 인상을 완성한다.', dir: [0, 2.8, 0.3] },
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

// The arch as a frame of width t.
function archFrame(w, h, t) {
  const s = archShape(w + t * 2, h)
  s.holes.push(new THREE.Path(archShape(w, h).getPoints(24)))
  return s
}

// Night sky: navy to a faint crimson glow on the horizon, with stars.
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main(){
    float h = vDir.y;
    vec3 col = mix(vec3(0.12, 0.03, 0.04), vec3(0.03, 0.035, 0.07), smoothstep(-0.02, 0.35, h));
    col = mix(col, vec3(0.01, 0.012, 0.03), smoothstep(0.35, 0.9, h));
    vec3 q = floor(vDir * 420.0);
    float s = step(0.9975, hash(q)) * smoothstep(0.05, 0.4, h);
    col += vec3(0.9, 0.9, 1.0) * s * hash(q + 3.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

export class Fortress {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75))
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

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }))
    this.scene.add(sky)

    // Moonlight from behind, crimson rim, floodlights from the lawn.
    const moon = new THREE.DirectionalLight('#9fb2e6', 0.9)
    moon.position.set(-50, 90, -40)
    const rim = new THREE.DirectionalLight('#ff2a2a', 2.6)
    rim.position.set(70, 25, -70)
    this.scene.add(moon, rim, new THREE.HemisphereLight('#2a3150', '#120809', 0.6))
    const flood = (x, color, power, shadow) => {
      const l = new THREE.SpotLight(color, power, 160, 0.62, 0.7, 1.4)
      l.position.set(x, 1.5, 46)
      l.target.position.set(x * 0.6, 18, 0)
      if (shadow) {
        l.castShadow = true
        l.shadow.mapSize.set(2048, 2048)
        l.shadow.bias = -0.0004
        l.shadow.camera.near = 5
        l.shadow.camera.far = 160
      }
      this.scene.add(l, l.target)
      return l
    }
    this.floods = [flood(0, '#ffc28a', 1500, true), flood(-34, '#ffb070', 1000, false), flood(34, '#ffb070', 1000, false)]

    // Lawn, a granite path up to the portal, dark ground beyond.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: '#0d0c0f', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(110, 60), new THREE.MeshStandardMaterial({ color: '#16241a', roughness: 1 }))
    lawn.rotation.x = -Math.PI / 2
    lawn.position.set(0, 0.03, 44)
    lawn.receiveShadow = true
    const path = new THREE.Mesh(new THREE.PlaneGeometry(9, 62), new THREE.MeshStandardMaterial({ color: '#57524c', roughness: 0.9 }))
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.06, 44)
    path.receiveShadow = true
    this.grid = new THREE.GridHelper(600, 120, '#7a141c', '#2a1418')
    this.grid.position.y = 0.1
    this.grid.material.transparent = true
    this.grid.material.opacity = 0
    this.scene.add(ground, lawn, path, this.grid)
    // Lamp posts along the path.
    const postMat = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5, metalness: 0.6 })
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0' })
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

    // Crimson scan plane that sweeps up the building as it is surveyed.
    this.scan = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 60),
      new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    this.scan.rotation.x = -Math.PI / 2
    this.scene.add(this.scan)

    // Dust ring for the slam.
    this.dust = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#d8c8b8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    )
    this.dust.rotation.x = -Math.PI / 2
    this.dust.position.y = 0.3
    this.scene.add(this.dust)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.95)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.progress = 0
    this.time = 0
    this.hovered = null
    this.shake = 0
    this.pointer = new THREE.Vector2(9, 9)
    this.mouse = new THREE.Vector2()
    this.ray = new THREE.Raycaster()
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    })
    canvas.addEventListener('pointerleave', () => this.pointer.set(9, 9))
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

    // Windows: three floors of pointed arches on both wings, front and back,
    // glass set back inside a trim frame with a mullion.
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
            const w = fl === 2 ? 1.6 : 1.9
            const h = fl === 2 ? 1.6 : 2.1
            glass.push(lit(shapeAt(archShape(w, h), 0, x, y, z, ry), glow()))
            frames.push(shapeAt(archFrame(w, h, 0.28), 0.35, x, y, face > 0 ? z - 0.05 : z + 0.05, ry))
            frames.push(box(0.14, h + w * 0.7, 0.2, x, y + (h + w * 0.7) / 2, face * (front + 0.08)))
            sill.push(box(w + 0.8, 0.28, 0.6, x, y - 0.14, face * (front + 0.2)))
          }
    // The tower: a tall lit window over the portal, a lit band of louvres
    // and the clock face.
    glass.push(lit(shapeAt(archShape(3.4, 9), 0, 0, P + 10.5, 7.03), 1.25))
    frames.push(shapeAt(archFrame(3.4, 9, 0.45), 0.5, 0, P + 10.5, 6.9))
    for (const dx of [-0.6, 0.6]) frames.push(box(0.16, 11.6, 0.25, dx, P + 10.5 + 5.8, 7.1))
    frames.push(box(3.6, 0.18, 0.25, 0, P + 15.5, 7.1))
    const dial = new THREE.CircleGeometry(2.3, 48)
    dial.translate(0, P + 25.4, 7.04)
    glass.push(lit(dial, 1.5))
    frames.push(shapeAt(Object.assign(new THREE.Shape().absarc(0, 0, 2.75, 0, Math.PI * 2), { holes: [new THREE.Path().absarc(0, 0, 2.3, 0, Math.PI * 2, true)] }), 0.4, 0, P + 25.4, 6.95))
    // Clock hands at ten past ten.
    const hand = (len, ang) => {
      const g = new THREE.BoxGeometry(0.16, len, 0.08)
      g.translate(0, len / 2, 0)
      g.rotateZ(ang)
      g.translate(0, P + 25.4, 7.2)
      return g
    }
    sill.push(hand(1.4, Math.PI / 3), hand(2.0, -Math.PI / 3))
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
      const spire = new THREE.ConeGeometry(1.05, 6.5, 8)
      spire.translate(x, TOP + 3.4 + 3.25, z)
      crown.push(spire)
    }
    this.#part('crown', [[crown, this.stone]])

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

  // 0..1 how exploded the building is; per-part stagger inside.
  explode() {
    const S = THREE.MathUtils.smoothstep
    const p = this.progress
    return S(p, 0.14, 0.46) * (1 - S(p, 0.74, 0.86))
  }

  // Screen position (px) of a part's centre.
  screenOf(part) {
    const v = part.getWorldPosition(new THREE.Vector3()).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: v.z > 1 }
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    const S = THREE.MathUtils.smoothstep
    const e = this.explode()

    // The slam: when it snaps back together, the ground shakes and dust rings out.
    const slam = S(p, 0.84, 0.86)
    if (slam > 0.5 && !this.slammed) {
      this.slammed = true
      this.shake = 1
      this.dustT = 0
      this.onSlam?.()
    }
    if (p < 0.8) this.slammed = false
    this.shake = Math.max(0, this.shake - dt * 1.8)
    if (this.dustT !== undefined) {
      this.dustT += dt
      const k = Math.min(1, this.dustT / 1.4)
      this.dust.scale.setScalar(10 + k * 90)
      this.dust.material.opacity = (1 - k) * 0.6
    }

    let i = 0
    for (const part of this.parts.values()) {
      const u = part.userData
      const k = S(e, i * 0.05, 0.6 + i * 0.05)
      const d = new THREE.Vector3(...u.dir).multiplyScalar(14 * k)
      part.position.copy(u.home).add(d)
      part.position.y += Math.sin(this.time * 0.8 + u.seed * 10) * 0.6 * k
      part.rotation.set(Math.sin(u.seed * 20) * 0.12 * k, Math.sin(u.seed * 31) * 0.18 * k, Math.sin(u.seed * 47) * 0.08 * k)
      const hot = this.hovered === part ? 1 : 0
      u.wire.material.opacity += ((hot ? 1 : e * 0.22) - u.wire.material.opacity) * Math.min(1, dt * 8)
      for (const m of u.mats) m.emissive?.setHex(hot ? 0x5a0808 : 0)
      i++
    }
    // While apart, the survey grid glows under the parts and the lights dim.
    this.grid.material.opacity = 0.15 + e * 0.6
    this.floods.forEach((l) => (l.intensity = l.userData.base ??= l.intensity))
    this.floods.forEach((l) => (l.intensity = l.userData.base * (1 - e * 0.45)))

    // Scan line sweeps up once as the section arrives.
    const sp = S(p, 0.0, 0.12)
    this.scan.position.set(0, sp * 44, 1)
    this.scan.material.opacity = sp > 0 && sp < 1 ? 0.16 * Math.sin(sp * Math.PI) : 0

    // Camera: a slow orbit that widens while exploded; pointer adds parallax.
    const ang = -0.55 + p * 1.2 + this.mouse.x * 0.12
    const dist = (this.portrait ? 190 : 128) + e * 28
    const y = 26 + e * 18 - this.mouse.y * 8
    this.camera.position.set(Math.sin(ang) * dist, y, Math.cos(ang) * dist)
    this.camera.lookAt(this.portrait ? 0 : -6 * Math.cos(ang), 17 + e * 6, 0)
    if (this.shake > 0) {
      const s = this.shake * this.shake
      this.camera.position.x += (Math.random() - 0.5) * 2.4 * s
      this.camera.position.y += (Math.random() - 0.5) * 2.4 * s
    }

    // Hover: whichever part is under the pointer.
    this.ray.setFromCamera(this.pointer, this.camera)
    const hit = this.pointer.x < 5 && this.ray.intersectObjects(this.meshes)[0]
    this.hovered = hit ? hit.object.userData.part : null
    this.composer.render()
  }
}
