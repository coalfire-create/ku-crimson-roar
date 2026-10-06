import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    this.camera.position.set(0, 0, 11)

    // Heart: two lobes and a point, as one faceted gem.
    const geo = new THREE.IcosahedronGeometry(1.6, 1)
    const p = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const y = v.y
      // Pull the bottom to a point and dent the top into two lobes.
      v.x *= 1 + 0.25 * Math.max(0, y)
      v.y = y > 0 ? y * 0.85 - 0.45 * Math.exp(-(v.x * v.x) * 3) * (y / 1.6) : y * 1.35 - 0.15 * (1 - Math.abs(v.x) / 1.6)
      v.z *= 0.8
      p.setXYZ(i, v.x, v.y + 0.2, v.z)
    }
    geo.computeVertexNormals()
    this.gem = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#8a0000', emissive: '#c8102e', emissiveIntensity: 0.35, roughness: 0.18, metalness: 0.3, flatShading: true }),
    )
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), new THREE.MeshBasicMaterial({ color: '#ff4500', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    core.scale.set(1.1, 1.1, 0.8)
    this.core = core
    this.heart = new THREE.Group()
    this.heart.add(this.gem, core)
    this.scene.add(this.heart)
    const key = new THREE.PointLight('#ffb080', 60, 30)
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

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.45)
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

  pump() {
    this.pulse = 1
    this.beats++
    this.energy = Math.min(1, this.energy + 0.075)
    this.#drum()
    const n = 90 + Math.round(this.energy * 160)
    for (let k = 0; k < n; k++) {
      const i = this.next
      this.next = (this.next + 1) % EMBERS
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(Math.random() * 2 - 1)
      const dir = new THREE.Vector3().setFromSphericalCoords(1, ph, th)
      this.pos.set([dir.x * 1.4, dir.y * 1.4, dir.z * 1.4], i * 3)
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
    this.camera.position.z = w / h < 0.8 ? 16 : 11
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    this.pulse = Math.max(0, this.pulse - dt * 3.2)
    this.energy = Math.max(0, this.energy - dt * 0.035)
    // Resting heartbeat: a double thump every second.
    const rest = Math.pow(Math.max(0, Math.sin(this.time * 6.28)), 12) + 0.6 * Math.pow(Math.max(0, Math.sin(this.time * 6.28 - 0.9)), 12)
    const s = 1 + rest * 0.05 + this.pulse * 0.28 + this.energy * 0.12
    this.heart.scale.setScalar(s)
    this.heart.rotation.y = this.time * 0.35
    this.heart.rotation.z = Math.sin(this.time * 0.7) * 0.08
    this.gem.material.emissiveIntensity = 0.3 + this.pulse * 0.6 + this.energy * 0.25
    this.core.material.opacity = 0.3 + this.pulse * 0.3
    this.bloom.strength = 0.55 + this.pulse * 0.45 + this.energy * 0.3

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
    this.composer.render()
  }
}
