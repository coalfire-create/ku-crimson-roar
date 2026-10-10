import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RunTiger } from './runTiger.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Enter the Anam: the letter, then the roar. A crimson envelope sealed with
// gold wax floats in the dark. Scrolling (progress 0..1) breaks the seal,
// opens the flap, slides the letter out and up to the viewer, with their own
// greeting on it. Then the letter flies past and the camera looks up
// from low on the ground at the reveal: 본관's clock tower against the dawn,
// a great tiger roaring before it, beams of crimson and gold light sweeping
// the sky, the school's banners and sparks rising, confetti falling. Built
// around the centre of the frame, so it reads as well on a phone held
// upright (Reels) as on a wide screen. The letter is marked as a
// promotional flourish. The shield emblem is the university's own.

const S = THREE.MathUtils.smoothstep
const EMBLEM = new Image()
EMBLEM.src = `${import.meta.env.BASE_URL}brand/ku-emblem.png`
const EW = 3.4 // envelope width
const EH = 2.3 // envelope height

function sealTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const r = g.createRadialGradient(110, 100, 10, 128, 128, 128)
  r.addColorStop(0, '#c4283a')
  r.addColorStop(1, '#6e0c18')
  g.fillStyle = r
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,215,140,0.85)'
  g.lineWidth = 6
  g.beginPath()
  g.arc(128, 128, 96, 0, 7)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // The shield pressed into the wax.
  const press = () => {
    g.globalAlpha = 0.95
    g.drawImage(EMBLEM, 128 - 54, 128 - 72, 108, 145)
    g.globalAlpha = 1
    t.needsUpdate = true
  }
  if (EMBLEM.complete && EMBLEM.naturalWidth) press()
  else EMBLEM.addEventListener('load', press, { once: true })
  return t
}

// The letter, drawn on a canvas so the name can change as it is typed.
function drawLetter(c, name) {
  const g = c.getContext('2d')
  const W = c.width
  const H = c.height
  g.fillStyle = '#fbf6ec'
  g.fillRect(0, 0, W, H)
  // Faint paper grain (seeded, so redrawing for a new name doesn't flicker).
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(120,90,60,${rnd() * 0.04})`
    g.fillRect(rnd() * W, rnd() * H, 2, 2)
  }
  g.fillStyle = '#8a0f22'
  g.fillRect(0, 0, W, 120)
  g.fillStyle = '#f2cf7a'
  g.font = '700 46px "Noto Serif KR", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('高麗大學校  ·  KOREA UNIVERSITY', W / 2, 62)
  const em = EMBLEM.complete && EMBLEM.naturalWidth
  if (em) g.drawImage(EMBLEM, W / 2 - 46, 150, 92, 124)
  g.fillStyle = '#8a0f22'
  g.font = '900 96px "Noto Serif KR", serif'
  g.fillText('入學을 祝賀합니다', W / 2, em ? 345 : 300)
  g.fillStyle = '#2a1a1c'
  g.font = '700 64px "Pretendard Variable", Pretendard, sans-serif'
  g.fillText(name ? `${name} 님` : '새로운 호랑이에게', W / 2, 470)
  g.font = '400 40px "Pretendard Variable", Pretendard, sans-serif'
  g.fillStyle = '#4a3a3a'
  const lines = ['고려대학교의 새로운 호랑이가 되신 것을', '진심으로 환영합니다.', '', '자유와 정의와 진리의 안암에서,', '이제 당신의 포효가 시작됩니다.']
  lines.forEach((l, i) => g.fillText(l, W / 2, 600 + i * 64))
  // The seal: the university's shield.
  if (em) g.drawImage(EMBLEM, W - 270, H - 330, 140, 188)
  else {
    g.strokeStyle = '#b5122a'
    g.lineWidth = 8
    g.beginPath()
    g.arc(W - 200, H - 230, 92, 0, 7)
    g.stroke()
  }
  g.fillStyle = '#2a1a1c'
  g.font = '600 40px "Pretendard Variable", Pretendard, sans-serif'
  g.textAlign = 'left'
  g.fillText('KOREA UNIVERSITY', 110, H - 250)
  g.font = '400 30px "Pretendard Variable", Pretendard, sans-serif'
  g.fillStyle = '#8a7a72'
  g.fillText('안암 · 서울 성북구 안암로 145', 110, H - 200)
  // Not a real notice: said plainly at the foot of the page.
  g.textAlign = 'center'
  g.font = '400 24px "Pretendard Variable", Pretendard, sans-serif'
  g.fillStyle = '#a89a90'
  g.fillText('홍보 사이트 연출 · 실제 합격 통지가 아닙니다', W / 2, H - 60)
}

export class Gate {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#12060a')
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 600)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.22
    pmrem.dispose()
    const key = new THREE.DirectionalLight('#fff1e0', 1.3)
    key.position.set(-3, 5, 6)
    const rim = new THREE.DirectionalLight('#ff5a4a', 1.4)
    rim.position.set(4, 2, -5)
    this.scene.add(key, rim, new THREE.HemisphereLight('#ffd9c8', '#2a0a10', 0.5))

    // Envelope: back panel, the front pocket, the top flap hinged along the
    // top edge, and the wax seal on its point.
    const paper = new THREE.MeshStandardMaterial({ color: '#9a1226', roughness: 0.7, side: THREE.DoubleSide })
    const paperIn = new THREE.MeshStandardMaterial({ color: '#6e0c18', roughness: 0.8, side: THREE.DoubleSide })
    this.env = new THREE.Group()
    const back = new THREE.Mesh(new THREE.PlaneGeometry(EW, EH), paperIn)
    back.position.z = -0.045
    const pocket = new THREE.Shape([new THREE.Vector2(-EW / 2, -EH / 2), new THREE.Vector2(EW / 2, -EH / 2), new THREE.Vector2(EW / 2, EH / 2), new THREE.Vector2(0, -EH * 0.05), new THREE.Vector2(-EW / 2, EH / 2)])
    const front = new THREE.Mesh(new THREE.ShapeGeometry(pocket), paper)
    front.position.z = 0.02
    this.flapPivot = new THREE.Group()
    this.flapPivot.position.set(0, EH / 2, 0.03)
    const flapShape = new THREE.Shape([new THREE.Vector2(-EW / 2, 0), new THREE.Vector2(EW / 2, 0), new THREE.Vector2(0, -EH * 0.62)])
    const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), paper)
    this.flapPivot.add(flap)
    // The wax seal, in two halves that crack apart when it breaks. Turned on
    // its axis so the pressed shield stands upright, facing out.
    const sealMats = [
      new THREE.MeshStandardMaterial({ color: '#7a0e1c', roughness: 0.35, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ map: sealTexture(), roughness: 0.35, metalness: 0.15 }),
      new THREE.MeshStandardMaterial({ color: '#7a0e1c' }),
    ]
    this.sealHalves = [Math.PI / 2, -Math.PI / 2].map((t0) => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.08, 40, 1, false, t0, Math.PI), sealMats)
      h.rotation.set(Math.PI / 2, Math.PI / 2, 0)
      h.position.set(0, EH / 2 - EH * 0.6, 0.085)
      this.env.add(h)
      return h
    })
    // The letter, folded in three and tucked inside at first.
    this.letterCanvas = document.createElement('canvas')
    this.letterCanvas.width = 1024
    this.letterCanvas.height = 1400
    drawLetter(this.letterCanvas, '')
    this.name = ''
    if (!(EMBLEM.complete && EMBLEM.naturalWidth)) EMBLEM.addEventListener('load', () => this.setName(this.name), { once: true })
    this.letterTex = new THREE.CanvasTexture(this.letterCanvas)
    this.letterTex.colorSpace = THREE.SRGBColorSpace
    this.letterTex.anisotropy = 8
    const LW = EW * 0.88
    const LH = LW * (1400 / 1024)
    const face = new THREE.MeshStandardMaterial({ map: this.letterTex, roughness: 1, color: '#e8e2d8' })
    const backOf = new THREE.MeshStandardMaterial({ color: '#e4dccd', roughness: 1, side: THREE.BackSide })
    const panel = (k) => {
      // One third of the page: k = 0 bottom, 1 middle, 2 top.
      // A touch taller than a third (its texture stretched to match), so the
      // panels overlap at the creases instead of leaving a hairline gap.
      const over = 1.012
      const geo = new THREE.PlaneGeometry(LW, (LH / 3) * over)
      const uv = geo.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setY(i, (k + 0.5 + (uv.getY(i) - 0.5) * over) / 3)
      const m = new THREE.Mesh(geo, face)
      m.add(new THREE.Mesh(geo, backOf))
      return m
    }
    this.letter = new THREE.Group()
    this.letter.add(panel(1))
    // Hinged at the creases; folded flat over the middle, a hair apart.
    this.foldTop = new THREE.Group()
    this.foldTop.position.set(0, LH / 6, 0.008)
    const top = panel(2)
    top.position.y = LH / 6
    this.foldTop.add(top)
    this.foldBot = new THREE.Group()
    this.foldBot.position.set(0, -LH / 6, 0.004)
    const bot = panel(0)
    bot.position.y = -LH / 6
    this.foldBot.add(bot)
    this.letter.add(this.foldTop, this.foldBot)
    // Fully opened, the three panels give way to one whole sheet: no seams.
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), face)
    this.sheet.add(new THREE.Mesh(this.sheet.geometry, backOf))
    this.sheet.visible = false
    this.letter.add(this.sheet)
    this.panels = this.letter.children.filter((c) => c !== this.sheet)
    this.env.add(back, this.letter, front, this.flapPivot)
    this.scene.add(this.env)

    // Drifting embers in the dark, and confetti for the end.
    const n = 600
    const ep = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) ep.set([(Math.random() - 0.5) * 24, (Math.random() - 0.5) * 14, -4 - Math.random() * 12], i * 3)
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3))
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: '#ff8a5a', size: 0.06, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.scene.add(this.embers)
    const CN = mobile ? 300 : 700
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.16), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }), CN)
    const col = new THREE.Color()
    this.bits = []
    for (let i = 0; i < CN; i++) {
      this.confetti.setColorAt(i, col.set(['#b5122a', '#d4af37', '#f6efe4', '#e8344b'][i % 4]))
      this.bits.push({ v: new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 16, (Math.random() - 0.5) * 4 + 1.5), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), ph: Math.random() * 6, fall: 0.8 + Math.random() * 0.8 })
    }
    this.confetti.frustumCulled = false
    this.scene.add(this.confetti)

    this.#buildStage(mobile)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // Bloom only on what really glows (embers, gold), never the white paper.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.5, 1.3)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.progress = 0
    this.time = 0
    this.mouse = new THREE.Vector2()
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // The reveal, far behind the envelope: sky, hall, tiger, light, banners.
  #buildStage(mobile) {
    const st = (this.stage = new THREE.Group())
    st.position.z = -16
    // Night over 안암: deep blue overhead, stars, and a crimson glow low on
    // the horizon where the city and the crowd's lights rise.
    this.skyU = { uK: { value: 0 } }
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 160),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uK; varying vec2 vUv;
          void main(){
            float h = vUv.y;
            vec3 top = vec3(0.012, 0.016, 0.05), mid = vec3(0.05, 0.03, 0.09), hor = vec3(0.36, 0.05, 0.1);
            vec3 c = mix(hor, mid, smoothstep(0.1, 0.32, h));
            c = mix(c, top, smoothstep(0.32, 0.8, h));
            c += vec3(0.9, 0.2, 0.25) * exp(-pow((vUv.x - 0.5) * 3.0, 2.0) - pow((h - 0.12) * 8.0, 2.0)) * 0.35;
            vec2 q = floor(vUv * vec2(900.0, 360.0));
            float r = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
            c += step(0.9965, r) * smoothstep(0.3, 0.7, h) * 0.9;
            gl_FragColor = vec4(c * uK, 1.0);
          }`,
        depthWrite: false,
      }),
    )
    sky.position.set(0, 60, -170)
    sky.scale.setScalar(1.6)
    st.add(sky)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshStandardMaterial({ color: '#0b0909', roughness: 0.95 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.z = -60
    ground.scale.set(1.5, 2, 1)
    st.add(ground)
    // 본관 against the dawn: the H-plan granite hall, its central tower with
    // battlements and four corner turrets, forward wings with steep gables,
    // slate roofs, every pointed window lit.
    const ashlar = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const x = c.getContext('2d')
      let seed = 5
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let r = 0; r < 8; r++) {
        let cx = r % 2 ? -24 : 0
        while (cx < 256) {
          const w = 40 + rnd() * 34
          const v = 120 + rnd() * 26
          x.fillStyle = `rgb(${v},${v - 6},${v - 14})`
          x.fillRect(cx, r * 32, w, 32)
          x.fillStyle = 'rgba(40,32,30,0.6)'
          x.fillRect(cx, r * 32, 2, 32)
          cx += w
        }
        x.fillStyle = 'rgba(40,32,30,0.6)'
        x.fillRect(0, r * 32, 256, 2)
      }
      const t = new THREE.CanvasTexture(c)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const stone = new THREE.MeshStandardMaterial({ map: ashlar, color: '#a89a90', roughness: 0.9 })
    const trim = new THREE.MeshStandardMaterial({ color: '#8c7f74', roughness: 0.9 })
    const slate = new THREE.MeshStandardMaterial({ color: '#2a2430', roughness: 0.6 })
    const glow = new THREE.MeshBasicMaterial({ color: '#ffc879' })
    const hall = new THREE.Group()
    // World-scale UVs (one tile = 5 m) so the coursing is even everywhere.
    const wuv = (g) => {
      const p = g.attributes.position
      const n = g.attributes.normal
      const uv = g.attributes.uv
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i))
        uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / 5, p.getY(i) / 5)
      }
      return g
    }
    const box = (w, h, d, x, y, z, m = stone) => {
      const b = new THREE.Mesh(m === stone ? wuv(new THREE.BoxGeometry(w, h, d).translate(x, y, z)) : new THREE.BoxGeometry(w, h, d).translate(x, y, z), m)
      hall.add(b)
      return b
    }
    // A pitched slate roof along x (len), span across z.
    const roof = (len, span, rise, x, y, z, alongZ = false) => {
      const s = new THREE.Shape([new THREE.Vector2(-span / 2 - 0.4, 0), new THREE.Vector2(span / 2 + 0.4, 0), new THREE.Vector2(0, rise)])
      const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false })
      g.translate(0, 0, -len / 2)
      if (!alongZ) g.rotateY(Math.PI / 2)
      g.translate(x, y, z)
      hall.add(new THREE.Mesh(g, slate))
    }
    const lancet = (w, h) => {
      const s = new THREE.Shape()
      const r = w / 2
      s.moveTo(-r, 0)
      s.lineTo(-r, h - w)
      s.quadraticCurveTo(-r, h - w * 0.2, 0, h)
      s.quadraticCurveTo(r, h - w * 0.2, r, h - w)
      s.lineTo(r, 0)
      return new THREE.ShapeGeometry(s, 6)
    }
    const wins = []
    // Rectangular stone-framed windows, as on the real 본관.
    const win = (w, h, x, y, z) => wins.push(new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z))
    const crenel = (w, x, y, z, n) => {
      for (let k = 0; k < n; k++) box(w / n / 1.8, 1.1, 0.6, x - w / 2 + (w / n) * (k + 0.5), y + 0.55, z)
    }
    // Main range: 64 m long, 15 m to the eaves.
    box(64, 15, 12, 0, 7.5, 0)
    box(64.6, 0.6, 12.6, 0, 15.2, 0, trim)
    roof(64, 12, 7, 0, 15.5, 0)
    for (let x = -28; x <= 28; x += 4) if (Math.abs(x) > 8 && Math.abs(x) < 22) for (const y of [3, 9]) win(1.5, 3.6, x, y, 6.02)
    // Forward wings either end (the H), gabled to the front.
    for (const s of [-1, 1]) {
      const x = s * 27
      box(12, 18, 24, x, 9, 6)
      box(12.6, 0.6, 24.6, x, 18.2, 6, trim)
      roof(24, 12, 7.5, x, 18.5, 6, true)
      // Gable end with a tall traceried window.
      const gab = new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(6, 0), new THREE.Vector2(0, 7)])
      const gg = new THREE.ShapeGeometry(gab).translate(x, 18.5, 18.03)
      hall.add(new THREE.Mesh(gg, stone))
      win(3.2, 9, x, 6, 18.03)
      for (const dx of [-3.6, 3.6]) win(1.3, 3.4, x + dx, 2.5, 18.03)
      for (const dx of [-3.6, 3.6]) win(1.3, 3.4, x + dx, 11, 18.03)
      // Corner buttresses with pinnacles.
      for (const dx of [-6.2, 6.2]) {
        box(1.4, 20, 1.4, x + dx, 10, 18)
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 4), trim)
        pin.position.set(x + dx, 22, 18)
        pin.rotation.y = Math.PI / 4
        hall.add(pin)
      }
    }
    // Central tower: 14 m square, 38 m to the parapet, four octagonal turrets.
    box(14, 38, 14, 0, 19, 3)
    for (const y of [15.5, 27]) box(14.6, 0.5, 14.6, 0, y, 3, trim)
    box(15.2, 0.8, 15.2, 0, 38.4, 3, trim)
    for (const f of [-1, 1]) crenel(14, 0, 38.8, 3 + f * 7.2, 5)
    for (const [cx, cz] of [[-7, -4], [7, -4], [-7, 10], [7, 10]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 44, 8), stone)
      t.position.set(cx, 22, cz)
      hall.add(t)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 1.3, 8), stone)
      cap.position.set(cx, 44.6, cz)
      hall.add(cap)
    }
    // The entrance arch, then floor upon floor of paired windows up the
    // tower (no clock: that is the old library's), and two flags on top.
    wins.push(lancet(4.2, 8).translate(0, 0, 10.03))
    for (let fl = 0; fl < 6; fl++) for (const dx of [-2.6, 2.6]) win(1.6, 3.0, dx, 10 + fl * 4.6, 10.03)
    for (const [fx, col] of [[-2.5, '#f4f1ea'], [2.5, '#b5122a']]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 8), trim)
      pole.position.set(fx, 42.5, 3)
      hall.add(pole)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide }))
      flag.position.set(fx + 1.35, 45, 3)
      hall.add(flag)
    }
    // Merge every window into one glowing mesh.
    const wg = new THREE.BufferGeometry()
    {
      const pos = []
      for (const g of wins) {
        const p = (g.index ? g.toNonIndexed() : g).attributes.position
        for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i))
      }
      wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    }
    hall.add(new THREE.Mesh(wg, glow))
    hall.position.set(0, 0, -150)
    hall.scale.setScalar(1.3)
    st.add(hall)
    // The tiger stands on the granite terrace in front of the crowd, as if
    // on 본관's front steps, looking out over them.
    const terraceM = new THREE.MeshStandardMaterial({ color: '#3d3836', roughness: 0.85 })
    const rock = new THREE.Group()
    for (const [w, h, d, y] of [[13, 1.0, 7.5, 0.5], [10, 1.0, 6, 1.5], [7, 1.1, 4.4, 2.55]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), terraceM)
      b.position.y = y
      rock.add(b)
    }
    rock.position.set(-7, 0, -2)
    st.add(rock)
    // Beams of light behind, sweeping.
    this.beams = []
    for (let i = 0; i < 7; i++) {
      const g = new THREE.CylinderGeometry(0.4, 5, 120, 24, 1, true)
      g.translate(0, 60, 0)
      const b = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffcf7a' : '#ff3b4d', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      b.position.set((i - 3) * 14, 0, -110)
      b.userData.ph = i * 0.9
      st.add(b)
      this.beams.push(b)
    }
    // The crowd: thousands of students filling 중앙광장 between the terrace
    // and 본관, each holding up a phone light. They sway; a wave runs through
    // them; at the end every light turns crimson and rises.
    const CN2 = mobile ? 3500 : 8000
    const cp = new Float32Array(CN2 * 3)
    const cs = new Float32Array(CN2)
    for (let i = 0; i < CN2; i++) {
      const z = -10 - Math.random() * 110
      const half = 16 + (-z) * 0.4
      cp.set([(Math.random() - 0.5) * 2 * half, 1.5 + Math.random() * 0.5, z], i * 3)
      cs[i] = Math.random()
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3))
    cg.setAttribute('aSeed', new THREE.BufferAttribute(cs, 1))
    this.crowdU = { uTime: { value: 0 }, uWave: { value: 0 }, uCrimson: { value: 0 }, uRaise: { value: 0 }, uOn: { value: 0 }, uPx: { value: this.renderer.getPixelRatio() } }
    this.crowd = new THREE.Points(
      cg,
      new THREE.ShaderMaterial({
        uniforms: this.crowdU,
        vertexShader: `attribute float aSeed; uniform float uTime, uWave, uRaise, uPx; varying float vB; varying float vSeed;
          void main(){
            vec3 p = position;
            p.x += sin(uTime * 1.6 + aSeed * 40.0) * 0.25;
            float wave = 0.5 + 0.5 * sin(p.x * 0.12 - p.z * 0.05 - uTime * 3.2);
            p.y += uRaise * (0.6 + aSeed * 0.6) + wave * uWave * 0.5;
            vB = mix(0.55, 1.0, wave * uWave + (1.0 - uWave) * 0.8) * (0.75 + 0.25 * sin(uTime * 6.0 + aSeed * 90.0));
            vSeed = aSeed;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uPx * (1.4 + aSeed) * 220.0 / -mv.z;
          }`,
        fragmentShader: `uniform float uCrimson, uOn; varying float vB; varying float vSeed;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            float turned = step(vSeed, uCrimson * 1.05);
            vec3 c = mix(vec3(1.0, 0.92, 0.78), vec3(1.0, 0.16, 0.26), turned);
            gl_FragColor = vec4(c * vB * 2.2, a * a * uOn);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.crowd.frustumCulled = false
    st.add(this.crowd)
    // The students themselves: dark heads and shoulders under their lights.
    const hg = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.4, 3, 6), new THREE.MeshStandardMaterial({ color: '#0a0708', roughness: 1 }), Math.round(CN2 * 0.35))
    const hm = new THREE.Matrix4()
    for (let i = 0; i < hg.count; i++) {
      hm.makeTranslation(cp[i * 3] + 0.15, 0.7, cp[i * 3 + 2])
      hg.setMatrixAt(i, hm)
    }
    st.add(hg)
    // Sparks rising.
    const SN = mobile ? 400 : 1000
    const sp = new Float32Array(SN * 3)
    for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * 60, Math.random() * 40, -Math.random() * 40], i * 3)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffb36b', size: 0.18, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    st.add(this.sparks)
    // Light on the stage, rising with the reveal.
    this.stageKey = new THREE.DirectionalLight('#ffd9a8', 0)
    this.stageKey.position.set(-10, 20, 20)
    this.stageRim = new THREE.DirectionalLight('#ff4a3a', 0)
    this.stageRim.position.set(8, 10, -30)
    this.stageKey.target = rock
    this.stageRim.target = rock
    st.add(this.stageKey, this.stageRim)
    this.scene.add(st)
    this.stage.visible = false
    // The tiger itself, on the rock, facing out over the viewer.
    this.tiger = new RunTiger(this.scene, undefined, { scale: 0.05, fur: mobile ? 4 : 8, furLen: 1.1, rim: 0.5 })
  }

  setName(name) {
    this.name = name
    drawLetter(this.letterCanvas, name.trim().slice(0, 12))
    this.letterTex.needsUpdate = true
  }

  // How far the letter has opened (0..1).
  open() {
    return S(this.progress, 0.2, 0.6)
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 58 : 36
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const t = this.time
    const p = this.progress
    // The envelope floats in, turned a little, and settles square on.
    const arrive = S(p, 0, 0.18)
    this.env.position.set(0, THREE.MathUtils.lerp(-1.2, 0, arrive) + Math.sin(t * 0.8) * 0.05, 0)
    // Square to the viewer, without the drift, once the letter is out to be read.
    const held = 1 - S(p, 0.44, 0.56)
    this.env.rotation.set(0.25 * (1 - arrive) + this.mouse.y * 0.06 * held, -0.6 * (1 - arrive) + this.mouse.x * 0.1 * held, 0.05 * Math.sin(t * 0.5) * held)
    // The seal cracks in two and the halves drop away; the flap lifts toward
    // the viewer and lies back flat above the envelope, behind the letter.
    const brk = S(p, 0.2, 0.27)
    this.sealHalves.forEach((h, i) => {
      const s = i ? 1 : -1
      h.position.x = s * brk * 0.32
      h.position.y = EH / 2 - EH * 0.6 - brk * brk * 1.1
      h.rotation.z = s * brk * 0.7
      h.scale.setScalar(1 - S(brk, 0.7, 1))
      h.visible = brk < 0.99
    })
    const flap = S(p, 0.24, 0.36)
    this.flapPivot.rotation.x = -flap * Math.PI
    this.flapPivot.position.z = flap > 0.5 ? -0.035 : 0.03
    // The letter slides up out of the pocket, comes forward to the middle of
    // the frame as the envelope sinks away, unfolds facing the viewer, is held
    // to be read, then lowered, and what lies beyond it comes into view.
    const rise = S(p, 0.34, 0.46)
    const come = S(p, 0.44, 0.56)
    const lower = S(p, 0.7, 0.8)
    const openTop = S(p, 0.52, 0.6)
    const openBot = S(p, 0.56, 0.64)
    this.foldTop.rotation.x = Math.PI * (1 - openTop)
    this.foldBot.rotation.x = -Math.PI * (1 - openBot)
    // Folded, the panels sit a hair apart so they never fight; opened out,
    // they lie exactly flush, one unbroken sheet.
    this.foldTop.position.z = 0.008 * (1 - openTop)
    this.foldBot.position.z = 0.004 * (1 - openBot)
    const flat = openTop > 0.999 && openBot > 0.999
    this.sheet.visible = flat
    for (const c of this.panels) c.visible = !flat
    const sink = come * 3.4
    this.env.position.y -= sink
    const big = this.portrait ? 1.4 : 1
    this.letter.scale.setScalar(0.68 * THREE.MathUtils.lerp(1, big, come))
    const wy = THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.35, 1.5, rise), 0.05, come) - lower * 2.8
    this.letter.position.set(0, wy + sink, THREE.MathUtils.lerp(-0.012, 0.9, come))
    this.letter.rotation.set(-lower * 0.9 - 0.04 * come * (1 - lower), 0, 0)
    this.letter.visible = lower < 0.999
    // Once the letter is out, the envelope (now off below the frame) is hidden.
    for (const c of this.env.children) if (c !== this.letter && !this.sealHalves.includes(c)) c.visible = come < 0.999
    // The reveal: the stage lights up behind as the letter clears the view.
    const reveal = S(p, 0.7, 0.86)
    this.stage.visible = reveal > 0.001
    this.skyU.uK.value = reveal
    this.stageKey.intensity = reveal * 2.6
    this.stageRim.intensity = reveal * 3.5
    // The story (driven from the page after the letter): the crowd's lights
    // come up, a wave runs through them, they turn crimson and rise.
    const sto = this.story ?? 0
    this.crowdU.uTime.value = t
    this.crowdU.uOn.value = reveal
    this.crowdU.uWave.value = S(sto, 0.25, 0.5)
    this.crowdU.uCrimson.value = S(sto, 0.55, 0.85)
    this.crowdU.uRaise.value = S(sto, 0.8, 0.95)
    this.beams.forEach((b) => {
      b.material.opacity = reveal * 0.05 * (0.6 + 0.4 * Math.sin(t * 1.3 + b.userData.ph))
      b.rotation.z = Math.sin(t * 0.35 + b.userData.ph) * 0.35
      b.rotation.x = -0.15
    })
    this.sparks.material.opacity = reveal * 0.85
    if (reveal > 0.001) {
      const sp = this.sparks.geometry.attributes.position
      for (let i = 0; i < sp.count; i++) sp.setY(i, (sp.getY(i) + dt * (1.5 + (i % 5) * 0.4)) % 40)
      sp.needsUpdate = true
    }
    // The tiger roars on arrival, and again every few seconds.
    if (this.tiger.ready) {
      const cycle = (t % 5) / 5
      // Quiet while the story is told; roaring with the crowd at its height.
      const roar = sto > 0.82 ? S(cycle, 0, 0.06) * (1 - S(cycle, 0.4, 0.55)) : 0
      if (roar > 0.5 && !this.roared) ((this.roared = true), this.onRoar?.())
      if (roar < 0.1) this.roared = false
      this.tiger.update(dt, new THREE.Vector3(-7, 3.1, -18), new THREE.Vector3(0.55, 0, 1).normalize(), 0, roar)
      this.tiger.group.visible = reveal > 0.05
    }
    // Confetti falls once the letter is read.
    const burst = S(sto, 0.86, 0.95)
    this.confetti.visible = burst > 0
    if (this.confetti.visible) {
      this.bits.forEach((b, i) => {
        const y = ((((b.v.y - t * b.fall) % 16) + 16) % 16) - 7
        this._e.set(b.spin.x * t, b.spin.y * t, b.spin.z * t)
        this._p.set(b.v.x + Math.sin(t * 1.5 + b.ph) * 0.3, y, b.v.z)
        this._m.compose(this._p, this._q.setFromEuler(this._e), this._s.setScalar(burst))
        this.confetti.setMatrixAt(i, this._m)
      })
      this.confetti.instanceMatrix.needsUpdate = true
    }
    this.embers.rotation.y = t * 0.02
    // Camera: close on the envelope; for the reveal it sinks low and looks up
    // at the tiger and the tower (a hero shot).
    // After the letter: behind the tiger on the terrace, over the crowd to
    // 본관; through the story the camera cranes slowly up and in.
    const low = S(p, 0.7, 0.95)
    const crane = S(sto, 0, 1)
    const camZ = THREE.MathUtils.lerp(this.portrait ? 8.5 : 6.2, THREE.MathUtils.lerp(this.portrait ? 9 : 8, this.portrait ? 4 : 2, crane), low)
    const camY = THREE.MathUtils.lerp(0.15, THREE.MathUtils.lerp(5.5, 11, crane), low)
    this.camera.position.set(this.mouse.x * 0.4 + (this.portrait ? -2 : 2) * low, camY + this.mouse.y * 0.2, camZ)
    this.camera.lookAt((this.portrait ? -2.5 : 0) * low, THREE.MathUtils.lerp(0, THREE.MathUtils.lerp(6, 8, crane), low), THREE.MathUtils.lerp(0, -120, low))
    this.bloom.strength = 0.25 + burst * 0.15 + reveal * 0.25 + this.crowdU.uCrimson.value * 0.2
    this.composer.render()
  }
}
