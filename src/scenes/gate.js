import * as THREE from 'three'

// Enter the Anam: a granite gothic gateway in the dark, its two stone doors
// carved with the motto ring split down the middle. As the visitor scrolls
// (progress 0..1) a crimson seam glows, the doors grind apart sideways onto
// the dawn behind (a transparent canvas: the DAWN shader shows through), and
// the camera walks through.

function doorTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 2048
  const g = c.getContext('2d')
  g.fillStyle = '#6f6a64'
  g.fillRect(0, 0, 2048, 2048)
  for (let i = 0; i < 60000; i++) {
    const v = 80 + Math.random() * 90
    g.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.2 + Math.random() * 0.35})`
    g.fillRect(Math.random() * 2048, Math.random() * 2048, 2, 2)
  }
  // Carved lines: a dark groove with a light lower lip.
  const carve = (draw, w = 10) => {
    g.save()
    g.lineWidth = w
    g.strokeStyle = 'rgba(20,16,14,0.85)'
    draw()
    g.stroke()
    g.translate(0, 4)
    g.lineWidth = w * 0.4
    g.strokeStyle = 'rgba(220,210,195,0.25)'
    draw()
    g.stroke()
    g.restore()
  }
  // Recessed panels on each door.
  for (const x0 of [140, 1164]) {
    for (const [y0, h] of [[260, 520], [1240, 560]]) carve(() => (g.beginPath(), g.rect(x0, y0, 744, h)), 12)
  }
  // The motto ring across both doors.
  carve(() => (g.beginPath(), g.arc(1024, 1010, 330, 0, Math.PI * 2)), 14)
  carve(() => (g.beginPath(), g.arc(1024, 1010, 250, 0, Math.PI * 2)), 8)
  g.fillStyle = 'rgba(25,20,18,0.9)'
  g.font = '700 54px "Cinzel", "Times New Roman", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const text = 'LIBERTAS · JUSTITIA · VERITAS · '
  const chars = [...text]
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2
    g.save()
    g.translate(1024 + Math.cos(a) * 290, 1010 + Math.sin(a) * 290)
    g.rotate(a + Math.PI / 2)
    g.fillText(ch, 0, 0)
    g.restore()
  })
  g.font = '900 230px "Noto Serif KR", serif'
  g.fillText('高麗', 1024, 1020)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

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

const AW = 20 // arch width
const AH = 18 // height of the arch's straight sides
const APEX = AH + AW * 0.866

export class Gate {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400)

    const stone = new THREE.MeshStandardMaterial({ color: '#57524d', roughness: 0.95 })
    // The wall with its pointed-arch doorway.
    const wallShape = new THREE.Shape([new THREE.Vector2(-120, -2), new THREE.Vector2(120, -2), new THREE.Vector2(120, 90), new THREE.Vector2(-120, 90)])
    wallShape.holes.push(new THREE.Path(archShape(AW, AH).getPoints(48)))
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: 6, bevelEnabled: false }), stone)
    wall.position.z = -3
    // Moulded arch frame, a little proud of the wall.
    const frameShape = archShape(AW + 4, AH)
    frameShape.holes.push(new THREE.Path(archShape(AW, AH).getPoints(48)))
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 2, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#8a847c', roughness: 0.85 }))
    frame.position.z = 3
    // Towers either side with battlements.
    const towers = []
    for (const x of [-AW / 2 - 9, AW / 2 + 9]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(10, APEX + 14, 12), stone)
      t.position.set(x, (APEX + 14) / 2 - 2, 2)
      towers.push(t)
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 12), stone)
        m.position.set(x - 3.6 + k * 2.4, APEX + 13.1, 2)
        towers.push(m)
      }
    }
    this.scene.add(wall, frame, ...towers)

    // The doors: each half of the arch, carved as one relief.
    const tex = doorTexture()
    const half = (side) => {
      // Each door is its half of the arch, split down the middle.
      const s = new THREE.Shape()
      if (side < 0) {
        s.moveTo(-AW / 2, 0)
        s.lineTo(0, 0)
        s.lineTo(0, APEX)
        s.absarc(AW / 2, AH, AW, (2 * Math.PI) / 3, Math.PI, false)
        s.lineTo(-AW / 2, 0)
      } else {
        s.moveTo(0, 0)
        s.lineTo(AW / 2, 0)
        s.lineTo(AW / 2, AH)
        s.absarc(-AW / 2, AH, AW, 0, Math.PI / 3, false)
        s.lineTo(0, 0)
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false })
      // Map the front face onto the full carving so the ring meets in the middle.
      const uv = geo.attributes.uv
      const p = geo.attributes.position
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + AW / 2) / AW, p.getY(i) / APEX)
      const door = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
      door.position.z = -0.8
      return door
    }
    this.left = half(-1)
    this.right = half(1)
    this.scene.add(this.left, this.right)

    // The crimson seam between the closed doors.
    this.seam = new THREE.Mesh(new THREE.PlaneGeometry(0.35, APEX), new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.seam.position.set(0, APEX / 2, 1)
    this.scene.add(this.seam)

    // Stone floor in front, lit by the light spilling through.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), new THREE.MeshStandardMaterial({ color: '#2a2624', roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -2, 60)
    this.scene.add(floor)
    this.moon = new THREE.DirectionalLight('#8a95c0', 0.6)
    this.moon.position.set(-30, 60, 80)
    this.spill = new THREE.SpotLight('#ffcf90', 0, 160, 0.5, 0.6, 1)
    this.spill.position.set(0, 16, -30)
    this.spill.target.position.set(0, -2, 40)
    this.scene.add(this.moon, this.spill, this.spill.target, new THREE.AmbientLight('#3a2a30', 1.2))

    this.progress = 0
    this.time = 0
    this.shake = 0
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // 0..1 how far apart the doors are.
  open() {
    return THREE.MathUtils.smoothstep(this.progress, 0.18, 0.55)
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const S = THREE.MathUtils.smoothstep
    const p = this.progress
    const o = this.open()
    // Grinding apart: a little shudder while they move.
    const moving = o > 0.001 && o < 0.999
    this.left.position.x = -o * (AW / 2 + 1)
    this.right.position.x = o * (AW / 2 + 1)
    this.seam.material.opacity = (0.3 + 0.7 * S(p, 0.02, 0.18)) * (1 - o) * (0.85 + 0.15 * Math.sin(this.time * 9))
    this.seam.scale.x = 1 + S(p, 0.05, 0.18) * 2
    this.spill.intensity = o * 900
    this.moon.intensity = 0.6 * (1 - o * 0.6)

    // Walk up to the gate and through it.
    const walk = S(p, 0.5, 0.95)
    const z0 = this.portrait ? 95 : 62
    const z = THREE.MathUtils.lerp(z0, -14, walk)
    const y = THREE.MathUtils.lerp(12, 11, walk)
    this.camera.position.set(0, y, z)
    this.camera.lookAt(0, THREE.MathUtils.lerp(15, 12, walk), -40)
    if (moving) {
      this.camera.position.x += (Math.random() - 0.5) * 0.18
      this.camera.position.y += (Math.random() - 0.5) * 0.18
    }
    this.renderer.render(this.scene, this.camera)
  }
}
