import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The Fortress of Intellect: 본관, the 1934 granite gothic Main Hall, built
// from parts. A crimson scan line sweeps up it; scrolling (progress 0..1)
// bursts it apart into its parts in mid-air, holds it for exploring (hover a
// part to see it in red wireframe with its name), then slams it back together.

export const PARTS = [
  { key: 'base', name: '화강암 기단', en: 'Granite Plinth', info: '건물 전체를 받치는 화강암 기단.', dir: [0, -1.1, 0.3] },
  { key: 'wingL', name: '서쪽 날개', en: 'West Wing', info: '탑에서 서쪽으로 길게 뻗은 석조 날개.', dir: [-1.6, 0.1, 0] },
  { key: 'wingR', name: '동쪽 날개', en: 'East Wing', info: '서쪽과 대칭을 이루는 날개. 좌우 대칭은 본관 정면의 위엄을 만든다.', dir: [1.6, 0.1, 0] },
  { key: 'windows', name: '첨두아치 창', en: 'Pointed-Arch Windows', info: '끝이 뾰족한 아치 창. 하늘로 치솟는 고딕 양식의 상징이다.', dir: [0, 0.2, 1.6] },
  { key: 'buttress', name: '부벽', en: 'Buttresses', info: '벽을 바깥에서 받치는 돌기둥. 수직의 리듬으로 정면을 나눈다.', dir: [0, -0.3, 2.3] },
  { key: 'roof', name: '슬레이트 지붕', en: 'Slate Roof', info: '짙은 회색 슬레이트로 덮인 경사 지붕.', dir: [0, 1.3, -0.4] },
  { key: 'tower', name: '중앙 탑', en: 'Central Tower', info: '정면 한가운데 솟은 탑. 멀리서도 고려대임을 알아보게 하는 실루엣.', dir: [0, 1.7, 0.5] },
  { key: 'crown', name: '총안 흉벽', en: 'Battlements', info: '탑 꼭대기를 두른 요철 모양의 성벽. 석조 요새 같은 인상을 완성한다.', dir: [0, 2.8, 0.3] },
  { key: 'portal', name: '정면 현관', en: 'Main Portal', info: '첨두아치로 열린 현관. 본관의 얼굴이 되는 입구.', dir: [0, -0.5, 2.9] },
]

// Granite ashlar: speckled stone with block courses, drawn once.
function graniteTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#9d9a96'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 14000; i++) {
    const v = 120 + Math.random() * 110
    g.fillStyle = `rgba(${v},${v - 1},${v - 2},${0.25 + Math.random() * 0.4})`
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  g.strokeStyle = 'rgba(60,55,50,0.45)'
  g.lineWidth = 2
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    g.stroke()
    const off = (y / 64) % 2 ? 64 : 0
    for (let x = off; x <= 512; x += 128) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x, y + 64)
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// A pointed (equilateral gothic) arch outline, w wide, sides h tall: two
// arcs of radius w, each centred on the opposite springing point.
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

export class Fortress {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#0d0d11')
    this.scene.fog = new THREE.Fog('#0d0d11', 120, 260)
    this.camera = new THREE.PerspectiveCamera(36, 1, 1, 600)

    const key = new THREE.DirectionalLight('#fff0e0', 2.1)
    key.position.set(40, 60, 70)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -70, right: 70, top: 70, bottom: -30, near: 10, far: 250 })
    const rim = new THREE.DirectionalLight('#ff2a2a', 3.2)
    rim.position.set(-60, 30, -60)
    this.scene.add(key, rim, new THREE.HemisphereLight('#6a5a66', '#140a0c', 0.55))

    // Ground with a faint survey grid.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#141318', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    const grid = new THREE.GridHelper(600, 120, '#5a1016', '#241a1e')
    grid.position.y = 0.02
    this.scene.add(ground, grid)

    this.tex = graniteTexture()
    this.parts = new Map()
    this.#build()

    // Crimson scan plane that sweeps up the building as it is "surveyed".
    this.scan = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 50),
      new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
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

  #part(key, geos, mat) {
    const def = PARTS.find((p) => p.key === key)
    const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.attributes.uv ? g : (g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)), g))))
    geo.computeBoundingBox()
    const center = geo.boundingBox.getCenter(new THREE.Vector3())
    geo.translate(-center.x, -center.y, -center.z)
    const m = mat.clone()
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = mesh.receiveShadow = true
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0 }))
    const group = new THREE.Group()
    group.add(mesh, wire)
    group.position.copy(center)
    group.userData = { ...def, home: center.clone(), mesh, wire, seed: Math.random(), glow: m.emissive?.getHex() ?? 0 }
    mesh.userData.part = group
    this.scene.add(group)
    this.parts.set(key, group)
  }

  #build() {
    const stone = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.92, metalness: 0 })
    const dark = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.35, metalness: 0.4, emissive: '#2a0606', emissiveIntensity: 0.4 })
    const slate = new THREE.MeshStandardMaterial({ color: '#3d4046', roughness: 0.7 })
    const box = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d)
      // Texture in metres so blocks keep their size.
      const uv = g.attributes.uv
      const n = g.attributes.normal
      const p = g.attributes.position
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(n.getX(i)) > 0.5 ? [p.getZ(i), p.getY(i)] : Math.abs(n.getY(i)) > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
        uv.setXY(i, (ax[0] + x) / 8, (ax[1] + y) / 8)
      }
      g.translate(x, y, z)
      return g
    }
    const W = 30 // half width of each wing's run from the tower
    const D = 14
    const H = 15
    this.#part('base', [box(W * 2 + 18, 2.4, D + 5, 0, 1.2, 0), box(22, 1.2, 8, 0, 0.6, D / 2 + 5)], stone)
    this.#part('wingL', [box(W, H, D, -(W / 2 + 6), 2.4 + H / 2, 0)], stone)
    this.#part('wingR', [box(W, H, D, W / 2 + 6, 2.4 + H / 2, 0)], stone)
    this.#part('tower', [box(12, 30, 12, 0, 2.4 + 15, 1)], stone)

    // Windows: three floors of pointed arches on both wings (front and back),
    // and a tall arch up the tower.
    const win = []
    const arch = archShape(2.2, 2.6)
    for (const side of [-1, 1])
      for (let bay = 0; bay < 7; bay++)
        for (let fl = 0; fl < 3; fl++)
          for (const face of [1, -1]) {
            const g = new THREE.ExtrudeGeometry(arch, { depth: 0.5, bevelEnabled: false })
            g.translate(0, 0, -0.25)
            if (face < 0) g.rotateY(Math.PI)
            g.translate(side * (8.5 + bay * 3.9), 2.4 + 2.2 + fl * 4.6, face * (D / 2 + 0.05))
            win.push(g)
          }
    const tall = new THREE.ExtrudeGeometry(archShape(3, 10), { depth: 0.5, bevelEnabled: false })
    tall.translate(0, 14, 7.05)
    win.push(tall)
    this.#part('windows', win, dark)

    // Buttresses between the bays, stepped at the top.
    const but = []
    for (const side of [-1, 1])
      for (let k = 0; k < 8; k++) {
        const x = side * (6.6 + k * 3.9)
        but.push(box(0.9, H - 1, 1.4, x, 2.4 + (H - 1) / 2, D / 2 + 0.7))
        but.push(box(0.9, 1.6, 0.8, x, 2.4 + H - 0.2, D / 2 + 0.4))
      }
    for (const x of [-6.6, 6.6]) but.push(box(1.6, 26, 1.8, x, 2.4 + 13, 7.9))
    this.#part('buttress', but, stone)

    // Pitched slate roofs over each wing.
    const roof = []
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1, false, Math.PI / 4)
      g.rotateY(0)
      g.scale(W * 0.72, 6, D * 0.72)
      g.translate(side * (W / 2 + 6), 2.4 + H + 3, 0)
      roof.push(g)
    }
    this.#part('roof', roof, slate)

    // Battlements and corner pinnacles crowning the tower.
    const crown = [box(13.4, 1.2, 13.4, 0, 2.4 + 30 + 0.6, 1)]
    for (let k = 0; k < 16; k++) {
      const s = k % 4
      const f = (Math.floor(k / 4) - 1.5) * 3.2
      const [x, z] = s === 0 ? [f, 7.2] : s === 1 ? [f, -5.2] : s === 2 ? [6.2, f + 1] : [-6.2, f + 1]
      crown.push(box(1.4, 1.8, 1.4, x, 2.4 + 31.2 + 0.9, z))
    }
    for (const [x, z] of [[-6.2, -5.2], [6.2, -5.2], [-6.2, 7.2], [6.2, 7.2]]) {
      const c = new THREE.ConeGeometry(1.1, 6, 4)
      c.rotateY(Math.PI / 4)
      c.translate(x, 2.4 + 33 + 3, z)
      crown.push(c)
    }
    this.#part('crown', crown, stone)

    // The pointed-arch portal with its steps.
    const portalArch = new THREE.ExtrudeGeometry(archShape(6.2, 5.5), { depth: 2.4, bevelEnabled: false })
    portalArch.translate(0, 2.4, 7.2)
    const portal = [portalArch, box(9, 0.6, 3, 0, 2.7, 9.6), box(11, 0.6, 3, 0, 2.1, 11.2)]
    this.#part('portal', portal, stone)
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
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
      u.wire.material.opacity += ((hot ? 1 : e * 0.18) - u.wire.material.opacity) * Math.min(1, dt * 8)
      u.mesh.material.emissive?.setHex(hot ? 0x5a0808 : u.glow)
      i++
    }

    // Scan line sweeps up once as the section arrives.
    const sp = S(p, 0.0, 0.12)
    this.scan.position.set(0, sp * 40, 1)
    this.scan.material.opacity = sp > 0 && sp < 1 ? 0.28 * Math.sin(sp * Math.PI) : 0

    // Camera: a slow orbit that widens while exploded; pointer adds parallax.
    const ang = -0.5 + p * 1.2 + this.mouse.x * 0.12
    const dist = (this.portrait ? 170 : 118) + e * 26
    const y = 34 + e * 16 - this.mouse.y * 8
    this.camera.position.set(Math.sin(ang) * dist, y, Math.cos(ang) * dist)
    this.camera.lookAt(0, 14 + e * 6, 0)
    if (this.shake > 0) {
      const s = this.shake * this.shake
      this.camera.position.x += (Math.random() - 0.5) * 2.4 * s
      this.camera.position.y += (Math.random() - 0.5) * 2.4 * s
    }

    // Hover: whichever part is under the pointer.
    this.ray.setFromCamera(this.pointer, this.camera)
    const hit = this.pointer.x < 5 && this.ray.intersectObjects([...this.parts.values()].map((g) => g.userData.mesh))[0]
    this.hovered = hit ? hit.object.userData.part : null
    this.renderer.render(this.scene, this.camera)
  }
}
