import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Crowd } from './crowd.js'
import { Stage } from './stage.js'

// The Crimson Core: a faceted ruby heart beating in the dark. Every pump
// (Space, click, tap) swells it, fires a ring of lava embers and a drum hit,
// and adds to the crowd's energy; at full energy the IPSELENTI aurora takes
// the whole screen. Transparent canvas: the aurora shader sits behind it.

const EMBERS = 2400

export class Heart {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.1 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    this.camera.position.set(0, 0, 11)

    // Heart: a cut ruby. A heart outline is the girdle; a smaller copy
    // raised in front is the table, a point set deep behind is the culet,
    // and flat facets join them, the way a stone cutter would.
    const hs = new THREE.Shape()
    hs.moveTo(0, -1.55)
    hs.bezierCurveTo(-0.6, -0.95, -1.75, -0.35, -1.6, 0.55)
    hs.bezierCurveTo(-1.45, 1.35, -0.45, 1.6, 0, 0.85)
    hs.bezierCurveTo(0.45, 1.6, 1.45, 1.35, 1.6, 0.55)
    hs.bezierCurveTo(1.75, -0.35, 0.6, -0.95, 0, -1.55)
    const ring = hs.getSpacedPoints(32).slice(0, -1)
    const mid = new THREE.Vector2(0, 0.1)
    const girdle = ring.map((p) => new THREE.Vector3(p.x, p.y, 0))
    const star = ring.map((p, i) => {
      const q = p.clone().sub(mid).multiplyScalar(0.78).add(mid)
      return new THREE.Vector3(q.x, q.y, 0.32 + (i % 2) * 0.04)
    })
    const table = ring.map((p) => {
      const q = p.clone().sub(mid).multiplyScalar(0.5).add(mid)
      return new THREE.Vector3(q.x, q.y, 0.5)
    })
    const pav = ring.map((p) => {
      const q = p.clone().sub(mid).multiplyScalar(0.55).add(mid)
      return new THREE.Vector3(q.x, q.y, -0.55)
    })
    const culet = new THREE.Vector3(mid.x, mid.y, -1.0)
    const tri = []
    const T = (a, b, c) => tri.push(a, b, c)
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      // Crown: girdle up to the star ring, star ring up to the table.
      T(girdle[i], girdle[j], star[j])
      T(girdle[i], star[j], star[i])
      T(star[i], star[j], table[j])
      T(star[i], table[j], table[i])
      // Pavilion: girdle down to the lower ring, then to the culet.
      T(girdle[j], girdle[i], pav[i])
      T(girdle[j], pav[i], pav[j])
      T(pav[j], pav[i], culet)
    }
    // The table itself, a flat heart.
    const faces = THREE.ShapeUtils.triangulateShape(table.map((v) => new THREE.Vector2(v.x, v.y)), [])
    for (const [a, b, c] of faces) T(table[a], table[b], table[c])
    const geo = new THREE.BufferGeometry().setFromPoints(tri)
    // Fix the winding of any face pointing inward.
    const pp = geo.attributes.position
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Vector3()
    for (let i = 0; i < pp.count; i += 3) {
      A.fromBufferAttribute(pp, i)
      B.fromBufferAttribute(pp, i + 1)
      C.fromBufferAttribute(pp, i + 2)
      N.subVectors(B, A).cross(M.subVectors(C, A))
      M.copy(A).add(B).add(C).divideScalar(3).sub(new THREE.Vector3(mid.x, mid.y, -0.1))
      if (N.dot(M) < 0) (pp.setXYZ(i + 1, C.x, C.y, C.z), pp.setXYZ(i + 2, B.x, B.y, B.z))
    }
    geo.computeVertexNormals()
    geo.translate(0, -0.1, 0.2)
    geo.scale(1.05, 1.05, 1.1)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
    this.gem = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        color: '#9a0016',
        emissive: '#5a000c',
        emissiveIntensity: 0.25,
        roughness: 0.06,
        metalness: 0.75,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 0.86,
        flatShading: true,
      }),
    )
    this.gem.renderOrder = 2
    // A molten core inside, seen through the stone.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 3), new THREE.MeshBasicMaterial({ color: '#ff2a0a', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }))
    core.scale.set(1.3, 1.1, 0.5)
    core.position.y = 0.05
    core.renderOrder = 1
    this.core = core
    // Facet edges catching the light.
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 8), new THREE.LineBasicMaterial({ color: '#ff9080', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.heart = new THREE.Group()
    this.heart.add(core, this.gem, this.edges)
    this.scene.add(this.heart)
    this.coreLight = new THREE.PointLight('#ff3a1a', 30, 12)
    this.heart.add(this.coreLight)
    const key = new THREE.PointLight('#ffd0b0', 70, 30)
    key.position.set(4, 5, 6)
    const rim = new THREE.PointLight('#ff2020', 80, 30)
    rim.position.set(-5, -2, -3)
    this.scene.add(key, rim, new THREE.AmbientLight('#401018', 1))

    // Embers: a pool of points, each flung outward on a pump and cooling.
    this.pos = new Float32Array(EMBERS * 3)
    this.vel = new Float32Array(EMBERS * 3)
    this.life = new Float32Array(EMBERS)
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    eg.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1))
    this.embers = new THREE.Points(
      eg,
      new THREE.ShaderMaterial({
        uniforms: { uSize: { value: 26 * this.renderer.getPixelRatio() } },
        vertexShader: `attribute float aLife; uniform float uSize; varying float vLife;
          void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uSize * aLife / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vLife;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            vec3 c = mix(vec3(0.6, 0.02, 0.02), vec3(1.0, 0.75, 0.3), vLife);
            gl_FragColor = vec4(c * 2.0, smoothstep(0.5, 0.0, d) * vLife); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.embers.frustumCulled = false
    this.scene.add(this.embers)
    this.next = 0

    // The crowd on the field, and the stage they face at its far end.
    this.crowd = new Crowd(this.scene, mobile)
    this.stage = new Stage(this.scene, mobile)
    // The heart now lives on the LED wall's glow; the stage is the show.
    this.heart.visible = false

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.7)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.time = 0
    this.pulse = 0 // swell from the last pump
    this.energy = 0 // 0..1 crowd energy
    this.beats = 0
    this.muted = false
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // Drum hit: a pitched-down kick with a bright click, louder with energy.
  #drum() {
    if (this.muted) return
    this.audio ??= new (window.AudioContext || window.webkitAudioContext)()
    const a = this.audio
    const t = a.currentTime
    const o = a.createOscillator()
    const g = a.createGain()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18)
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + 0.36)
    const n = a.createBufferSource()
    const buf = a.createBuffer(1, a.sampleRate * 0.05, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    n.buffer = buf
    const ng = a.createGain()
    ng.gain.value = 0.15 + this.energy * 0.25
    n.connect(ng).connect(a.destination)
    n.start(t)
  }

  // The act now on stage (null between acts).
  setAct(act) {
    this.stage.setAct(act)
    this.performing = !!act
  }

  pump() {
    this.pulse = 1
    this.beats++
    this.energy = Math.min(1, this.energy + 0.075)
    this.#drum()
    this.crowd.pump(this.time)
    const n = 90 + Math.round(this.energy * 160)
    for (let k = 0; k < n; k++) {
      const i = this.next
      this.next = (this.next + 1) % EMBERS
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(Math.random() * 2 - 1)
      const dir = new THREE.Vector3().setFromSphericalCoords(1, ph, th)
      // Sparks fly up off the front of the stage.
      this.pos.set([dir.x * 6, -1.2 + Math.abs(dir.y) * 0.5, -22.5 + dir.z * 0.5], i * 3)
      const sp = 2.5 + Math.random() * (3 + this.energy * 6)
      this.vel.set([dir.x * sp, dir.y * sp + 1.2, dir.z * sp], i * 3)
      this.life[i] = 1
    }
    this.onPump?.()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    // From the back of the crowd, over their heads, to the stage.
    const portrait = w / h < 0.8
    this.camera.fov = portrait ? 46 : 30
    this.camera.position.set(0, portrait ? 2.2 : 1.6, portrait ? 4 : 2)
    this.camera.lookAt(0, portrait ? 1.6 : 1.2, -27)
    this.camBase = { pos: this.camera.position.clone(), lookY: portrait ? 1.6 : 1.2, portrait }
    this.camera.updateProjectionMatrix()
    this.crowd.setSize(170 * this.renderer.getPixelRatio() * (h / 900))
  }

  render(dt) {
    this.time += dt
    this.pulse = Math.max(0, this.pulse - dt * 3.2)
    this.energy = Math.max(0, this.energy - dt * 0.035)
    // Resting heartbeat: a double thump every second.
    const rest = Math.pow(Math.max(0, Math.sin(this.time * 6.28)), 12) + 0.6 * Math.pow(Math.max(0, Math.sin(this.time * 6.28 - 0.9)), 12)
    const s = 1 + rest * 0.05 + this.pulse * 0.28 + this.energy * 0.12
    this.heart.scale.setScalar(s)
    this.heart.rotation.y = Math.sin(this.time * 0.45) * 0.7
    this.heart.rotation.z = Math.sin(this.time * 0.7) * 0.08
    this.gem.material.emissiveIntensity = 0.2 + this.pulse * 0.8 + this.energy * 0.4
    this.core.material.opacity = 0.3 + this.pulse * 0.5
    this.coreLight.intensity = 25 + this.pulse * 60 + this.energy * 30
    this.edges.material.opacity = 0.22 + this.pulse * 0.4
    this.bloom.strength = 0.3 + this.pulse * 0.25 + this.energy * 0.12

    for (let i = 0; i < EMBERS; i++) {
      if (this.life[i] <= 0) continue
      const k = i * 3
      this.vel[k + 1] += dt * 0.6 // embers rise as they cool
      this.vel[k] *= 1 - dt * 0.9
      this.vel[k + 1] *= 1 - dt * 0.9
      this.vel[k + 2] *= 1 - dt * 0.9
      this.pos[k] += this.vel[k] * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      this.life[i] = Math.max(0, this.life[i] - dt * 0.45)
    }
    this.embers.geometry.attributes.position.needsUpdate = true
    this.embers.geometry.attributes.aLife.needsUpdate = true
    // While an act is on, the crowd moves to the beat on its own and the
    // energy stays high.
    if (this.performing) {
      this.energy = Math.max(this.energy, 0.65)
      this.beatT = (this.beatT ?? 0) + dt
      if (this.beatT > 0.5) ((this.beatT = 0), this.crowd.pump(this.time))
    }
    this.stage.update(dt, this.energy)
    this.crowd.update(this.time, this.energy)
    // A camera on a crane over the crowd: it pushes slowly in toward the
    // stage and back, drifting side to side, so the stage reads in depth.
    if (this.camBase) {
      const b = this.camBase
      const k = 0.5 - 0.5 * Math.cos(this.time * 0.09)
      const sway = Math.sin(this.time * 0.13) * (b.portrait ? 1.2 : 3)
      this.camera.position.set(b.pos.x + sway, b.pos.y + k * 0.9, b.pos.z - k * (b.portrait ? 6 : 10))
      this.camera.lookAt(sway * 0.25, b.lookY + k * 0.7, -27)
    }
    this.stage.renderLive(this.renderer, this.scene)
    this.composer.render()
  }
}
