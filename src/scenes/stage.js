import * as THREE from 'three'

// The 입실렌티 stage at the far end of the field, built after the real one:
// silver scaffold towers either side carrying tall LED screens (here showing
// a live close-up of the performers, as the real ones do), rows of red light
// bars beneath them, tall crimson banners with 高麗大學校 down them, a black
// backline with the band's drums and amps, a lighting truss overhead.
// The acts are anime-style dancers in each act's stage costume (generic
// faces, not likenesses): cel-shaded with an ink outline, jointed to move.

const TAU = Math.PI * 2

function toonRamp() {
  const d = new Uint8Array([80, 80, 80, 255, 170, 170, 170, 255, 255, 255, 255, 255])
  const t = new THREE.DataTexture(d, 3, 1)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

// Costumes, from the night's own footage.
const KR = '#9a0f22'
const BK = '#16161c'
const WH = '#f2efe8'
const LOOKS = {
  'H1GHR MUSIC': [
    { top: '#c8102e', jacket: '#c8102e', inner: WH, bottom: '#2a2a33', hairStyle: 'short' },
    { top: WH, stripes: '#c8102e', bottom: '#e9e4da', hairStyle: 'cap', cap: '#c8102e' },
    { top: WH, bottom: '#3a3a44', hairStyle: 'short' },
    { top: BK, bottom: '#3a3a44', hairStyle: 'cap', cap: BK },
  ],
  'YERIN BAEK': [{ top: '#b5122a', dress: '#b5122a', hairStyle: 'long' }],
  '10CM': [{ top: KR, print: 'KOREA', bottom: '#2a2a33', hairStyle: 'short', glasses: true }],
  'ALLDAY PROJECT': [
    { top: BK, print: 'KOREA', dress: BK, hairStyle: 'long', hair: '#2b1d16' },
    { top: KR, print: 'KOREA', dress: KR, hairStyle: 'long' },
    { top: WH, bottom: BK, hairStyle: 'cap', cap: BK },
    { top: KR, bottom: BK, hairStyle: 'short' },
    { top: BK, print: 'KOREA', skirt: KR, hairStyle: 'long', hair: '#5a3a22' },
  ],
  MEOVV: [
    { top: BK, print: 'KOREA', skirt: BK, hairStyle: 'long' },
    { top: WH, print: 'KOREA', skirt: KR, hairStyle: 'long', hair: '#2b1d16' },
    { top: KR, print: 'KOREA', skirt: BK, hairStyle: 'pony' },
    { top: BK, print: 'KOREA', bottom: BK, hairStyle: 'bob' },
    { top: WH, print: 'KOREA', skirt: BK, hairStyle: 'long', hair: '#3e2a1c' },
    { top: KR, print: 'KOREA', skirt: WH, hairStyle: 'long' },
  ],
  aespa: [
    { top: '#a3172e', print: 'IPSELENTI', skirt: BK, hairStyle: 'long' },
    { top: '#a3172e', skirt: WH, hairStyle: 'long', hair: '#e8d0a8' },
    { top: '#a3172e', skirt: BK, hairStyle: 'pony' },
    { top: '#a3172e', print: 'IPSELENTI', bottom: BK, hairStyle: 'long', hair: '#3e2a1c' },
  ],
  AKMU: [
    { top: BK, bottom: '#2a2a33', hairStyle: 'short' },
    { top: '#e8c0c8', bottom: BK, hairStyle: 'bob' },
  ],
  TAEYANG: [{ top: BK, jacket: BK, inner: '#f1cfb4', bottom: BK, hairStyle: 'short', hair: '#f4f0e6' }],
  // Before the first act: 고려대 응원단 opens the night, crimson and white,
  // pom-poms up.
  '고려대 응원단': [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
    k % 2
      ? { top: '#b5122a', print: 'KOREA', bottom: '#16161c', hairStyle: 'short', pom: '#f2efe8' }
      : { top: '#b5122a', print: 'KOREA', skirt: '#f2efe8', hairStyle: k % 4 ? 'pony' : 'long', pom: '#c8102e' },
  ),
  PSY: [
    { top: '#a3172e', print: 'KOREA', sleeveless: true, bottom: BK, hairStyle: 'short', shades: true, lead: true },
    { top: WH, skirt: '#c8102e', hairStyle: 'long' },
    { top: '#c8102e', bottom: WH, hairStyle: 'short' },
    { top: WH, skirt: '#c8102e', hairStyle: 'long' },
    { top: '#c8102e', bottom: WH, hairStyle: 'short' },
    { top: WH, skirt: '#c8102e', hairStyle: 'long' },
    { top: '#c8102e', bottom: WH, hairStyle: 'short' },
  ],
}

function textTexture(text, color = '#ffffff', w = 256, h = 96) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.fillStyle = color
  g.font = `900 ${Math.round(h * 0.62)}px "Pretendard Variable", Pretendard, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, w / 2, h / 2 + 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function stripeTexture(a, b) {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 64
  const g = c.getContext('2d')
  for (let y = 0; y < 64; y += 16) {
    g.fillStyle = a
    g.fillRect(0, y, 16, 8)
    g.fillStyle = b
    g.fillRect(0, y + 8, 16, 8)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function dancer(ramp, look, skin = '#f3d2b8') {
  const mat = (c, map, flat = false) => new THREE.MeshToonMaterial({ color: map ? '#ffffff' : c, map: map || null, gradientMap: ramp, flatShading: flat })
  const ink = new THREE.MeshBasicMaterial({ color: '#1a0c10', side: THREE.BackSide })
  const part = (geo, m, parent, outline = 1.06) => {
    const mesh = new THREE.Mesh(geo, m)
    parent.add(mesh)
    if (outline) {
      const line = new THREE.Mesh(geo, ink)
      line.scale.setScalar(outline)
      mesh.add(line)
    }
    return mesh
  }
  const flat = (geo, color, parent, x, y, z) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }))
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  const pivot = (parent, x, y, z = 0) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }
  // A body of revolution from (radius, height) pairs, flattened front to back.
  const lathe = (pts, depth = 0.74) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20)
    g.scale(1, 1, depth)
    return g
  }
  const top = look.top || BK
  const bottom = look.bottom || look.skirt || look.dress || BK
  const hair = look.hair || '#1a1214'
  const skinM = mat(skin)
  const topMat = look.stripes ? mat(null, stripeTexture(top, look.stripes)) : mat(top)
  const root = new THREE.Group()
  const hips = pivot(root, 0, 0.95)
  // Pelvis and torso: shaped, a waist between hips and chest.
  part(lathe([[0.0, -0.17], [0.12, -0.15], [0.175, -0.05], [0.165, 0.06], [0.145, 0.13]], 0.78), mat(bottom), hips)
  const chest = pivot(hips, 0, 0.12)
  const torso = lathe([[0.145, -0.02], [0.135, 0.1], [0.155, 0.24], [0.185, 0.37], [0.195, 0.46], [0.15, 0.53], [0.07, 0.57]], 0.7)
  part(torso, look.sleeveless || !look.jacket ? topMat : topMat, chest)
  if (look.jacket) {
    // An open jacket over the top, the inner showing down the front.
    const j = part(lathe([[0.16, 0.0], [0.155, 0.12], [0.17, 0.25], [0.2, 0.38], [0.21, 0.46], [0.165, 0.53], [0.08, 0.57]], 0.76), mat(look.jacket), chest)
    j.scale.set(1.03, 1, 1.03)
    flat(new THREE.PlaneGeometry(0.1, 0.44), look.inner || WH, chest, 0, 0.3, 0.155)
  }
  if (look.print) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), new THREE.MeshBasicMaterial({ map: textTexture(look.print, top === WH ? '#9a0f22' : '#ffffff'), transparent: true }))
    t.position.set(0, 0.33, 0.142)
    chest.add(t)
  }
  // Skirt or dress: a pleated flare from the waist.
  if (look.skirt || look.dress) {
    const len = look.dress ? 0.66 : 0.32
    const s = part(new THREE.CylinderGeometry(0.17, look.dress ? 0.34 : 0.3, len, 18, 1, true), mat(look.skirt || look.dress, null, true), hips, 1.04)
    s.position.y = -len / 2 + (look.dress ? 0.14 : 0.08)
    s.scale.z = 0.85
  }
  // Neck and head.
  const neck = pivot(chest, 0, 0.56)
  part(new THREE.CylinderGeometry(0.05, 0.058, 0.14, 12).translate(0, 0.05, 0), skinM, neck)
  const head = part(new THREE.SphereGeometry(0.19, 24, 18).translate(0, 0.22, 0), skinM, neck)
  head.scale.set(0.94, 1.04, 0.96)
  // Chin: the lower face narrows to a point, the anime way.
  part(new THREE.ConeGeometry(0.12, 0.14, 16).rotateX(Math.PI).translate(0, 0.09, 0.03), skinM, neck, 0)
  for (const s of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.035, 8, 6), skinM, neck, 0)
    ear.scale.set(0.5, 1, 0.8)
    ear.position.set(s * 0.178, 0.2, -0.01)
  }
  // Eyes: white, a coloured iris, pupil, two highlights, a lash line above.
  const iris = look.eyes || '#5a3422'
  for (const s of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(s * 0.068, 0.205, 0.168)
    eye.rotation.y = s * 0.32
    neck.add(eye)
    const white = flat(new THREE.CircleGeometry(0.036, 20), '#fbf7f2', eye, 0, 0, 0)
    white.scale.set(0.9, 1.25, 1)
    const ir = flat(new THREE.CircleGeometry(0.026, 20), iris, eye, 0, -0.004, 0.002)
    ir.scale.set(0.9, 1.2, 1)
    flat(new THREE.CircleGeometry(0.012, 12), '#120a0c', eye, 0, -0.004, 0.004).scale.set(0.9, 1.2, 1)
    flat(new THREE.CircleGeometry(0.008, 10), '#ffffff', eye, 0.01, 0.014, 0.006)
    flat(new THREE.CircleGeometry(0.004, 8), '#ffffff', eye, -0.009, -0.018, 0.006)
    const lash = flat(new THREE.PlaneGeometry(0.078, 0.013), '#140c10', eye, 0, 0.044, 0.007)
    lash.rotation.z = s * -0.12
    const brow = flat(new THREE.PlaneGeometry(0.06, 0.009), '#2a1a16', eye, s * 0.004, 0.078, 0.004)
    brow.rotation.z = s * -0.18
    if (look.glasses) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 20), new THREE.MeshBasicMaterial({ color: '#1c1018' }))
      rim.position.z = 0.02
      eye.add(rim)
    }
  }
  if (look.shades) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.075, 0.03), new THREE.MeshBasicMaterial({ color: '#08080a' }))
    sh.position.set(0, 0.205, 0.19)
    neck.add(sh)
  }
  const nose = part(new THREE.SphereGeometry(0.014, 8, 6), mat('#e9b89c'), neck, 0)
  nose.position.set(0, 0.165, 0.185)
  const mouth = flat(new THREE.CircleGeometry(0.02, 12), '#b03a50', neck, 0, 0.115, 0.178)
  mouth.scale.set(1.3, 0.55, 1)
  // Hair: a cap, a fringe of bangs across the brow, and the style's length.
  const hairM = mat(hair)
  const style = look.hairStyle || 'short'
  // The cap of hair is tipped back so the hairline sits high on the brow
  // and falls low at the nape.
  const capPivot = pivot(neck, 0, 0.23, -0.012)
  capPivot.rotation.x = -0.62
  const cap = part(new THREE.SphereGeometry(0.212, 22, 16, 0, TAU, 0, Math.PI * (style === 'bob' || style === 'long' ? 0.62 : 0.52)), hairM, capPivot)
  cap.scale.set(1.02, 1.06, 1.06)
  const bangs = style === 'short' || style === 'cap' ? 4 : 6
  for (let k = 0; k < bangs; k++) {
    const t = (k / (bangs - 1) - 0.5) * 1.6
    const b = part(new THREE.ConeGeometry(0.045, style === 'short' ? 0.1 : 0.14, 6).rotateX(Math.PI), hairM, neck, 0)
    b.position.set(Math.sin(t) * 0.17, 0.32 - (style === 'short' ? 0.0 : 0.02), Math.cos(t) * 0.17)
    b.rotation.set(-0.45, 0, -t * 0.4)
  }
  if (style === 'long' || style === 'bob') {
    const L = style === 'long' ? 0.46 : 0.18
    const back = part(new THREE.CapsuleGeometry(0.18, L, 4, 12), hairM, neck)
    back.position.set(0, 0.2 - L / 2, -0.09)
    back.scale.set(1.08, 1, 0.55)
    for (const s of [-1, 1]) {
      const lock = part(new THREE.CapsuleGeometry(0.045, L * 0.9, 4, 8), hairM, neck)
      lock.position.set(s * 0.17, 0.17 - L * 0.4, 0.04)
      lock.rotation.z = s * 0.06
    }
  }
  if (style === 'pony') {
    const tail = part(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), hairM, neck)
    tail.position.set(0, 0.18, -0.24)
    tail.rotation.x = 0.35
  }
  if (style === 'cap') {
    const crown = part(new THREE.SphereGeometry(0.225, 18, 12, 0, TAU, 0, Math.PI * 0.5), mat(look.cap || BK), neck)
    crown.position.y = 0.25
    const brim = part(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), mat(look.cap || BK), neck)
    brim.position.set(0, 0.29, 0.14)
    brim.scale.set(1.2, 1, 1.1)
  }
  // Arms with hands; legs with shoes.
  const limbs = {}
  const sleeve = look.sleeveless ? skinM : mat(look.jacket || top)
  const legColor = look.dress || look.skirt ? skinM : mat(bottom)
  for (const s of [-1, 1]) {
    const sh = pivot(chest, s * 0.215, 0.47)
    part(new THREE.SphereGeometry(0.065, 12, 10), sleeve, sh)
    part(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10).translate(0, -0.15, 0), sleeve, sh)
    const el = pivot(sh, 0, -0.3)
    part(new THREE.CapsuleGeometry(0.047, 0.21, 4, 10).translate(0, -0.13, 0), look.jacket ? mat(look.jacket) : skinM, el)
    const hand = part(new THREE.SphereGeometry(0.045, 10, 8), skinM, el)
    hand.position.y = -0.28
    hand.scale.set(0.8, 1.15, 0.6)
    if (look.pom) {
      // A pom-pom: a ball of streamers.
      const pom = part(new THREE.IcosahedronGeometry(0.13, 1), mat(look.pom, null, true), el, 1.04)
      pom.position.y = -0.33
    }
    const hip = pivot(hips, s * 0.095, -0.05)
    part(new THREE.CylinderGeometry(0.088, 0.066, 0.42, 12).translate(0, -0.21, 0), legColor, hip)
    const knee = pivot(hip, 0, -0.44)
    part(new THREE.CylinderGeometry(0.064, 0.045, 0.42, 12).translate(0, -0.21, 0), legColor, knee)
    const shoe = part(new THREE.CapsuleGeometry(0.055, 0.14, 4, 8).rotateX(Math.PI / 2).translate(0, -0.45, 0.05), mat(look.dress || look.skirt ? '#1a1a1e' : '#f2f2f2'), knee)
    shoe.scale.set(1.1, 0.8, 1)
    limbs[s] = { sh, el, hip, knee }
  }
  const mic = new THREE.Group()
  const micBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#1c1c1c', metalness: 0.6, roughness: 0.4 }))
  const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), new THREE.MeshStandardMaterial({ color: '#b8bcc4', metalness: 0.9, roughness: 0.35 }))
  micHead.position.y = 0.12
  mic.add(micBody, micHead)
  mic.position.set(0, -0.28, 0.05)
  mic.rotation.x = 0.4
  limbs[1].el.add(mic)
  return { root, hips, chest, neck, limbs, mic }
}

export class Stage {
  constructor(scene, mobile) {
    this.ramp = toonRamp()
    const g = (this.group = new THREE.Group())
    g.position.set(0, -3.4, -27)
    // Scaled so both towers and their banners sit inside the crowd's view.
    g.scale.setScalar(0.58)
    scene.add(g)
    const black = new THREE.MeshStandardMaterial({ color: '#141015', roughness: 0.7, metalness: 0.2 })
    const steel = new THREE.MeshStandardMaterial({ color: '#5e636c', metalness: 0.6, roughness: 0.45 })
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(x, y, z)
      g.add(mesh)
      return mesh
    }
    // Deck with its crimson edge, and the black backline.
    add(new THREE.BoxGeometry(26, 1.8, 10), black, 0, 0.9, 0)
    add(new THREE.BoxGeometry(26.2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: '#ff2a40' }), 0, 1.8, 5)
    add(new THREE.BoxGeometry(18, 12, 0.3), new THREE.MeshBasicMaterial({ color: '#0b080b' }), 0, 7.8, -4.8)
    // The band: drum kit on a riser, amps, a keyboard.
    add(new THREE.BoxGeometry(5, 0.6, 3), black, 0, 2.1, -3)
    const drum = new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.5, metalness: 0.2 })
    add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 20), drum, 0, 3.0, -2.6).rotation.x = Math.PI / 2
    for (const [x, y] of [[-0.9, 3.3], [0.9, 3.3], [-0.5, 3.6], [0.5, 3.6]]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 16), drum, x, y, -2.6)
    for (const x of [-1.5, 1.5]) add(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#d4b04a', metalness: 0.9, roughness: 0.3 }), x, 4.4, -2.8)
    for (const x of [-7, -5.8, 5.8, 7]) add(new THREE.BoxGeometry(1.1, 1.4, 0.8), black, x, 2.5, -3.6)
    add(new THREE.BoxGeometry(2.2, 0.2, 0.7), black, -4.2, 3.0, -3)
    // Scaffold towers either side: four uprights each, braced every 2 m.
    for (const s of [-1, 1]) {
      for (const [dx, dz] of [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.5], [2.2, 1.5]]) add(new THREE.CylinderGeometry(0.09, 0.09, 20, 8), steel, s * 15.5 + dx, 10, dz)
      for (let y = 2; y <= 19; y += 2)
        for (const dz of [-1.5, 1.5]) add(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), steel, s * 15.5, y, dz).rotation.set(0, 0, Math.PI / 2)
    }
    for (const dy of [0, 1]) add(new THREE.BoxGeometry(35, 0.25, 0.25), steel, 0, 18.6 + dy, -1)
    // LED screens on the towers, showing the live close-up.
    this.live = new THREE.WebGLRenderTarget(mobile ? 256 : 384, mobile ? 432 : 640)
    this.liveCam = new THREE.PerspectiveCamera(24, 384 / 640, 0.5, 200)
    this.screens = []
    for (const s of [-1, 1]) {
      const frame = add(new THREE.BoxGeometry(7.4, 12.2, 0.3), black, s * 15.5, 10.5, 1.7)
      const scr = add(new THREE.PlaneGeometry(7, 11.7), new THREE.MeshBasicMaterial({ map: this.live.texture }), s * 15.5, 10.5, 1.9)
      this.screens.push(scr, frame)
      // A row of red light bars beneath each screen.
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.35, 2.4, 0.2), new THREE.MeshBasicMaterial({ color: '#ff1e30' }), s * 15.5 - 2.6 + k * 1.04, 3.2, 1.9)
    }
    // Tall crimson banners with 高麗大學校 running down them.
    const banner = document.createElement('canvas')
    banner.width = 160
    banner.height = 1100
    const bc = banner.getContext('2d')
    bc.fillStyle = '#a3172e'
    bc.fillRect(0, 0, 160, 1100)
    bc.fillStyle = '#ffffff'
    bc.font = '900 150px "Noto Serif KR", serif'
    bc.textAlign = 'center'
    bc.textBaseline = 'middle'
    ;['高', '麗', '大', '學', '校'].forEach((ch, i) => bc.fillText(ch, 80, 150 + i * 200))
    const bt = new THREE.CanvasTexture(banner)
    bt.colorSpace = THREE.SRGBColorSpace
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(2.6, 18), new THREE.MeshBasicMaterial({ map: bt, color: '#c8c8c8' }), s * 20.8, 10, 1.4)
    // Header LED over the backline: the festival and the act.
    this.ledCanvas = document.createElement('canvas')
    this.ledCanvas.width = 2048
    this.ledCanvas.height = 300
    this.ledTex = new THREE.CanvasTexture(this.ledCanvas)
    this.ledTex.colorSpace = THREE.SRGBColorSpace
    add(new THREE.PlaneGeometry(17, 2.5), new THREE.MeshBasicMaterial({ map: this.ledTex, color: '#c0c0c0' }), 0, 15.6, -4.5)
    this.#drawLed(null)
    // Beams from the truss.
    this.beams = []
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.CylinderGeometry(0.1, 1.4, 26, 20, 1, true)
      geo.translate(0, -13, 0)
      const b = add(geo, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? '#ffffff' : '#ff2a3a', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), -14 + i * 3.1, 18.4, -0.8)
      b.userData.ph = i * 0.8
      this.beams.push(b)
    }
    // Light on the performers, and a red wash from behind.
    const key = new THREE.SpotLight('#ffe8d8', 14, 60, 0.5, 0.6, 1)
    key.position.set(0, 16, 14)
    key.target.position.set(0, 2.5, 0)
    g.add(key, key.target)
    const back = new THREE.PointLight('#ff2a40', 22, 24)
    back.position.set(0, 10, -1)
    g.add(back)
    this.cast = []
    this.style = 'ballad'
    this.t = 0
    this.setAct(null) // the cheer squad, until the first act comes on
  }

  #drawLed(act) {
    const c = this.ledCanvas.getContext('2d')
    const W = c.canvas.width
    const H = c.canvas.height
    c.fillStyle = '#5a0614'
    c.fillRect(0, 0, W, H)
    c.fillStyle = 'rgba(0,0,0,0.3)'
    for (let x = 0; x < W; x += 10) c.fillRect(x, 0, 2, H)
    for (let y = 0; y < H; y += 10) c.fillRect(0, y, W, 2)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#fff'
    const text = act ? `IPSELENTI 2026  ·  ${act.en}` : 'IPSELENTI 2026'
    // Fit the line to the screen: long names step the type down.
    let size = 150
    c.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`
    const w = c.measureText(text).width
    if (w > W * 0.9) ((size = Math.floor((size * W * 0.9) / w)), (c.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`))
    c.shadowColor = 'rgba(255,80,60,0.9)'
    c.shadowBlur = 30
    c.fillText(text, W / 2, H / 2 + 8)
    c.shadowBlur = 0
    this.ledTex.needsUpdate = true
  }

  setAct(act) {
    for (const d of this.cast) this.group.remove(d.root)
    this.cast = []
    if (!act) act = { en: '고려대 응원단', style: 'dance', cheer: true }
    this.#drawLed(act)
    this.lead = null
    this.style = act.style || 'dance'
    const looks = LOOKS[act.en] || [{ top: BK }]
    const withLead = !!looks[0].lead
    const n = looks.length
    looks.forEach((look, i) => {
      const d = dancer(this.ramp, look)
      // Formation: a shallow V, centred; a lead stands out front of the line.
      const slot = look.lead ? 0 : withLead ? i - 1 - (n - 2) / 2 : i - (n - 1) / 2
      const x = slot * (n > 4 ? 2.6 : 3.4)
      const z = look.lead ? 2.2 : 1.2 - Math.abs(slot) * 0.8 - (withLead ? 1.6 : 0)
      d.root.position.set(x, 1.8, z)
      d.root.scale.setScalar(look.lead || n === 1 ? 4.2 : 3.8)
      d.phase = i * 0.37
      d.lead = look.lead || n <= 2 || (!withLead && i === Math.floor((n - 1) / 2))
      d.backup = withLead && !look.lead
      d.mic.visible = !act.cheer && (d.lead || this.style === 'hiphop' || this.style === 'ballad')
      this.group.add(d.root)
      this.cast.push(d)
    })
    this.lead = this.cast.find((d) => d.lead) || this.cast[0]
    this.t = 0
  }

  // The tower screens' live close-up: a long lens on the lead's head and shoulders.
  renderLive(renderer, scene) {
    if (!this.lead) return
    const p = this.lead.neck.getWorldPosition(new THREE.Vector3())
    const k = this.lead.root.getWorldScale(new THREE.Vector3()).y
    this.liveCam.position.set(p.x + Math.sin(this.t * 0.3) * 0.4 * k, p.y + 0.12 * k, p.z + 3.6 * k)
    this.liveCam.lookAt(p.x, p.y + 0.12 * k, p.z)
    for (const s of this.screens) s.visible = false
    for (const b of this.beams) b.visible = false
    const keep = renderer.getRenderTarget()
    renderer.setRenderTarget(this.live)
    renderer.setClearColor(0x120608, 1)
    renderer.clear()
    renderer.render(scene, this.liveCam)
    renderer.setRenderTarget(keep)
    renderer.setClearColor(0x000000, 0)
    for (const s of this.screens) s.visible = true
    for (const b of this.beams) b.visible = true
  }

  update(dt, energy) {
    this.t += dt
    const t = this.t
    this.beams.forEach((b) => {
      b.rotation.z = Math.sin(t * 0.8 + b.userData.ph) * 0.55
      b.rotation.x = 0.35 + Math.sin(t * 0.6 + b.userData.ph * 1.7) * 0.25
      b.material.opacity = 0.014 + energy * 0.022
    })
    const bpm = { ballad: 70, pop: 112, hiphop: 96, dance: 124, party: 132 }[this.style] || 120
    for (const d of this.cast) {
      // Backup dancers dance the group choreography behind a party lead.
      const style = d.backup ? 'dance' : this.style
      const b = (t * bpm) / 60 + d.phase * (style === 'dance' ? 0 : 1)
      const beat = b * TAU
      const L = d.limbs[-1]
      const R = d.limbs[1]
      const bounce = Math.abs(Math.sin(beat / 2))
      let hipY = 0.95
      if (style === 'ballad') {
        d.root.rotation.y = Math.sin(beat / 4) * 0.25
        d.chest.rotation.z = Math.sin(beat / 2) * 0.05
        d.neck.rotation.x = -0.1 + Math.sin(beat / 2) * 0.05
        R.sh.rotation.set(-1.2, 0, 0.1)
        R.el.rotation.set(-1.3, 0, 0)
        L.sh.rotation.set(-0.5 - 0.6 * Math.max(0, Math.sin(beat / 8)), 0, -0.3 - 0.4 * Math.max(0, Math.sin(beat / 8)))
        L.el.rotation.set(-0.4, 0, 0)
        L.hip.rotation.x = R.hip.rotation.x = 0
        L.knee.rotation.x = R.knee.rotation.x = 0.05 + 0.05 * Math.sin(beat / 2)
      } else if (style === 'party') {
        // The party dance: a trotting bounce, wrists crossed, then a lasso.
        hipY += bounce * 0.12
        const lasso = Math.sin(beat / 16) > 0.3
        L.hip.rotation.x = Math.sin(beat) * 0.5
        R.hip.rotation.x = -Math.sin(beat) * 0.5
        L.knee.rotation.x = Math.max(0, Math.sin(beat)) * 0.9
        R.knee.rotation.x = Math.max(0, -Math.sin(beat)) * 0.9
        if (lasso) {
          R.sh.rotation.set(-2.8, 0, 0.2)
          R.el.rotation.set(-0.3 + Math.sin(beat * 2) * 0.6, 0, 0)
          L.sh.rotation.set(-1.0, 0, -0.4)
          L.el.rotation.set(-1.5, 0, 0)
        } else {
          L.sh.rotation.set(-1.1, 0, 0.55)
          R.sh.rotation.set(-1.1, 0, -0.55)
          L.el.rotation.set(-1.2, 0, 0)
          R.el.rotation.set(-1.2, 0, 0)
        }
        d.root.rotation.y = Math.sin(beat / 4) * 0.3
        d.chest.rotation.x = 0.15
      } else {
        // Pop, hip-hop and group choreography through a four-count.
        const k = style === 'hiphop' ? 0.8 : 1
        hipY += bounce * 0.07 * k
        const count = Math.floor(b) % 4
        const ph = b - Math.floor(b)
        const hit = Math.exp(-ph * 6)
        d.root.position.x += (Math.sin(beat / 2) * 0.012 - (d.root.position.x - (d.homeX ??= d.root.position.x)) * 0.05) * k
        d.root.rotation.y = (count % 2 ? 0.35 : -0.35) * (style === 'pop' ? 0.6 : 1) + Math.sin(beat / 4) * 0.1
        d.chest.rotation.z = Math.sin(beat / 2) * 0.12
        d.chest.rotation.x = style === 'hiphop' ? 0.18 : 0.05
        d.neck.rotation.x = -0.15 * hit
        const up = count === 0 || count === 2
        L.sh.rotation.set(up ? -2.6 + hit * 0.3 : -0.6, 0, up ? -0.2 : -0.6 * hit - 0.2)
        R.sh.rotation.set(count === 1 || count === 3 ? -2.6 + hit * 0.3 : -0.6, 0, count % 2 ? 0.2 : 0.6 * hit + 0.2)
        L.el.rotation.set(up ? -0.2 : -1.4, 0, 0)
        R.el.rotation.set(!up ? -0.2 : -1.4, 0, 0)
        if (d.mic.visible) (R.sh.rotation.set(-1.25, 0, 0.1), R.el.rotation.set(-1.35, 0, 0))
        L.hip.rotation.x = Math.max(0, Math.sin(beat / 2)) * 0.35 * k
        R.hip.rotation.x = Math.max(0, -Math.sin(beat / 2)) * 0.35 * k
        L.knee.rotation.x = 0.1 + Math.max(0, Math.sin(beat / 2)) * 0.5 * k
        R.knee.rotation.x = 0.1 + Math.max(0, -Math.sin(beat / 2)) * 0.5 * k
      }
      d.hips.position.y = hipY
    }
  }
}
