import * as THREE from 'three'
import { graniteCanvas } from './fortress.js'

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

    const gc = graniteCanvas()
    const gt = (srgb) => {
      const t = new THREE.CanvasTexture(gc)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(0.08, 0.08)
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      return t
    }
    const stone = new THREE.MeshStandardMaterial({ map: gt(true), bumpMap: gt(false), bumpScale: 2.5, color: '#a59d94', roughness: 0.95 })
    // The wall with its pointed-arch doorway.
    const wallShape = new THREE.Shape([new THREE.Vector2(-120, -2), new THREE.Vector2(120, -2), new THREE.Vector2(120, 90), new THREE.Vector2(-120, 90)])
    wallShape.holes.push(new THREE.Path(archShape(AW, AH).getPoints(48)))
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: 6, bevelEnabled: false }), stone)
    wall.position.z = -3
    // Moulded arch frame, a little proud of the wall.
    const frameShape = archShape(AW + 4, AH)
    frameShape.holes.push(new THREE.Path(archShape(AW, AH).getPoints(48)))
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 2, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4 }), new THREE.MeshStandardMaterial({ map: gt(true), bumpMap: gt(false), bumpScale: 1.5, color: '#d6cec4', roughness: 0.85 }))
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
      const door = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 3, roughness: 0.88, color: '#e8e0d6' }))
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
    floor.position.set(0, -2, 97)
    this.scene.add(floor)
    this.moon = new THREE.DirectionalLight('#8a95c0', 0.9)
    this.moon.position.set(-30, 60, 80)
    this.spill = new THREE.SpotLight('#ffcf90', 0, 160, 0.5, 0.6, 1)
    this.spill.position.set(0, 16, -30)
    this.spill.target.position.set(0, -2, 40)
    this.scene.add(this.moon, this.spill, this.spill.target, new THREE.HemisphereLight('#3a3550', '#1a0d0e', 1.1))
    // The seam's own crimson light on the doors and the floor.
    this.seamLight = new THREE.PointLight('#ff2a14', 0, 60, 1.6)
    this.seamLight.position.set(0, 10, 4)
    this.scene.add(this.seamLight)
    // Torches on both towers, flickering, with a flame you can see.
    this.torches = []
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const bracket = new THREE.MeshStandardMaterial({ color: '#1b1a1d', metalness: 0.7, roughness: 0.4 })
    for (const x of [-AW / 2 - 4.2, AW / 2 + 4.2]) {
      const l = new THREE.PointLight('#ff9a4a', 220, 70, 1.7)
      l.position.set(x, 15.5, 10.5)
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.4, 1.2, 10), bracket)
      cup.position.set(x, 14.4, 9.2)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.6), bracket)
      arm.position.set(x, 13.9, 8.2)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 10, 1, true), flameMat.clone())
      flame.position.set(x, 16.1, 9.2)
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.position.copy(flame.position)
      this.scene.add(l, cup, arm, flame, halo)
      this.torches.push({ l, flame, halo, seed: Math.random() * 10 })
    }
    // Dust drifting in the light that pours through the opening.
    const DN = 500
    const dp = new Float32Array(DN * 3)
    for (let i = 0; i < DN; i++) dp.set([(Math.random() - 0.5) * AW * 1.4, Math.random() * 26 - 2, Math.random() * 36 + 2], i * 3)
    const dg = new THREE.BufferGeometry()
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3))
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffd8a0', size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.scene.add(this.dust)

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
    this.moon.intensity = 0.9 * (1 - o * 0.6)
    this.seamLight.intensity = this.seam.material.opacity * 260
    for (const t of this.torches) {
      const f = 0.8 + 0.2 * Math.sin(this.time * 13 + t.seed) * Math.sin(this.time * 7.3 + t.seed * 2)
      t.l.intensity = 220 * f
      t.flame.scale.set(1, f * 1.1, 1)
      t.flame.material.opacity = 0.75 * f
      t.halo.scale.setScalar(0.9 + f * 0.3)
    }
    this.dust.material.opacity = o * 0.8
    this.dust.rotation.y = Math.sin(this.time * 0.1) * 0.02
    this.dust.position.y = Math.sin(this.time * 0.3) * 0.5

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
