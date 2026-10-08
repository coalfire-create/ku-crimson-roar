import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RunTiger } from './runTiger.js'

// The Awakening: the real tiger stands in the dark, lit by one warm key light
// and a crimson rim. It breathes (its own idle clip) and watches the pointer.
// roar(), or the first scroll, throws its head up and its jaw open while
// embers burst from the floor; scrolling on, the roar carries through and the
// tiger turns away toward the campus. Same interface as the ember Tiger:
// progress, intro, open, blink, dragged, roar(), resize(), render(dt).

const SCALE = 0.02 // real size: about 4 m nose to tail
const FLOOR = 0

const EMBER_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uSize, uBlast, uScroll;
  varying float vA;
  void main(){
    float life = fract(aSeed.w + uTime * (0.05 + aSeed.z * 0.06) + uBlast * 0.25);
    vec3 p = position;
    p.y += life * (2.8 + aSeed.z * 2.0) * (1.0 + uScroll);
    p.x += sin(uTime * 0.7 + aSeed.w * 30.0) * 0.25 * life;
    p.z += cos(uTime * 0.5 + aSeed.x * 20.0) * 0.2 * life;
    // The roar blows them outward from the tiger's head.
    vec3 away = normalize(p - vec3(0.0, 1.0, 0.6) + 0.001);
    p += away * uBlast * (1.5 + aSeed.z * 2.5);
    vA = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.6, 1.0, life)) * (0.35 + 0.65 * aSeed.z);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.4 + aSeed.z) / -mv.z;
  }
`
const EMBER_FRAG = /* glsl */ `
  uniform float uBlast;
  varying float vA;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.75, 0.4), a * a);
    gl_FragColor = vec4(c * (1.6 + uBlast * 3.0), a * a * vA);
  }
`
// Low drifting haze over the floor.
const FOG_FRAG = /* glsl */ `
  uniform float uTime, uIntro;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.02 + 7.3; a *= 0.5; } return v; }
  void main(){
    vec2 p = vUv * vec2(6.0, 3.0);
    float n = fbm(p + vec2(uTime * 0.05, uTime * 0.02)) * fbm(p * 1.7 - vec2(uTime * 0.03, 0.0));
    float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
    gl_FragColor = vec4(vec3(0.55, 0.16, 0.12) * n * 1.4, n * edge * 0.55 * uIntro);
  }
`
// Backdrop: near black, a faint crimson glow behind the tiger.
const BACK_FRAG = /* glsl */ `
  uniform float uIntro, uGlow;
  varying vec2 vUv;
  void main(){
    float d = length((vUv - vec2(0.62, 0.5)) * vec2(1.6, 1.0));
    vec3 c = vec3(0.004, 0.002, 0.003) + vec3(0.05, 0.005, 0.007) * exp(-d * d * 5.0) * (0.5 + uGlow);
    gl_FragColor = vec4(c * uIntro, 1.0);
  }
`
const PLANE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
// Film finish: vignette and fine grain.
const FINISH = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: PLANE_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c.rgb *= mix(0.25, 1.0, v);
      c.rgb += (hash(vUv * 1000.0 + fract(uTime) * 91.0) - 0.5) * 0.012;
      gl_FragColor = c;
    }
  `,
}

const ease = (x) => x * x * (3 - 2 * x)

export class Hero3D {
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
    this.scene.fog = new THREE.FogExp2('#050203', 0.06)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

    // Backdrop wall far behind.
    this.backU = { uIntro: { value: 0 }, uGlow: { value: 0 } }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.ShaderMaterial({ uniforms: this.backU, vertexShader: PLANE_VERT, fragmentShader: BACK_FRAG, depthWrite: false, fog: false }))
    back.position.set(0, 6, -14)
    this.scene.add(back)
    // Floor: dark wet stone that catches the key light and the rim.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#100c0b', roughness: 0.55, metalness: 0.1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR
    floor.receiveShadow = true
    this.scene.add(floor)

    // Lights: warm key high front-left, crimson rim behind right, cold fill.
    this.key = new THREE.SpotLight('#ffd2a6', 0, 30, 0.42, 0.65, 1.2)
    this.key.position.set(-3.2, 5.2, 4.2)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.02
    this.rim = new THREE.SpotLight('#ff4a30', 0, 30, 0.6, 0.6, 1.2)
    this.rim.position.set(3.5, 3.0, -4.5)
    this.rim2 = new THREE.SpotLight('#ff5a2a', 0, 30, 0.6, 0.7, 1.2)
    this.rim2.position.set(-4, 2.2, -3.5)
    this.fill = new THREE.HemisphereLight('#4a5a78', '#1a0806', 0)
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target, this.rim2, this.rim2.target, this.fill)

    this.tiger = new RunTiger(this.scene, undefined, { scale: SCALE, fur: mobile ? 4 : 8, furLen: 1.2, rim: 0 })

    // Embers rising off the floor.
    const n = mobile ? 500 : 1100
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const r = 0.6 + Math.pow(Math.random(), 0.7) * 5
      const a = Math.random() * Math.PI * 2
      pos.set([Math.cos(a) * r, FLOOR + Math.random() * 0.2, Math.sin(a) * r - 0.5], i * 3)
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    eg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    this.emberU = { uTime: { value: 0 }, uSize: { value: 60 }, uBlast: { value: 0 }, uScroll: { value: 0 } }
    this.embers = new THREE.Points(eg, new THREE.ShaderMaterial({ uniforms: this.emberU, vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.embers.frustumCulled = false
    this.scene.add(this.embers)
    // Haze: two layers of drifting fog low over the floor.
    this.fogU = { uTime: { value: 0 }, uIntro: { value: 0 } }
    for (const [y, z, s] of [[0.25, 1.5, 1], [0.6, -1.5, 1.3]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16 * s, 3 * s), new THREE.ShaderMaterial({ uniforms: this.fogU, vertexShader: PLANE_VERT, fragmentShader: FOG_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      m.position.set(0, y, z)
      this.scene.add(m)
    }

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.6, 0.85)
    this.composer.addPass(this.bloom)
    this.finish = new ShaderPass(FINISH)
    this.composer.addPass(this.finish)
    this.composer.addPass(new OutputPass())

    this.time = 0
    this.intro = 0
    this.open = 0
    this.blink = 0
    this.progress = 0
    this.blastT = -1
    this.roarK = 0
    this.yaw = 0
    this.dragYaw = 0
    this.dragVel = 0
    this.pointer = { x: 0, y: 0 }
    this.mouse = new THREE.Vector2()
    this.scrollRoared = false
    addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1
      if (this.drag) {
        const dx = e.clientX - this.drag.x
        this.drag.x = e.clientX
        this.dragYaw += dx * 0.005
        this.dragVel = dx * 0.005
        this.drag.moved += Math.abs(dx)
      }
    })
    canvas.parentElement.addEventListener('pointerdown', (e) => (this.drag = { x: e.clientX, moved: 0 }))
    addEventListener('pointerup', () => (this.drag = null))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // True when the last press was a drag rather than a click.
  get dragged() {
    return (this.lastDrag ?? 0) > 6
  }

  roar() {
    this.blastT = 0
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 44 : 30
    this.camera.updateProjectionMatrix()
    this.emberU.uSize.value = 26 * this.renderer.getPixelRatio() * (h / 900)
    this.bloom.resolution.set(w / 2, h / 2)
  }

  // Where the head is now (world), for the camera to frame.
  #head(out) {
    const b = this.tiger.gait?.bones?.c_head_00
    if (b) b.getWorldPosition(out)
    else out.set(0, 1.0, 1.2)
    return out
  }

  render(dt) {
    this.time += dt
    const p = this.progress
    // The first scroll wakes it: one roar each time the scroll passes by.
    if (p > 0.04 && !this.scrollRoared) ((this.scrollRoared = true), this.onRoar?.(), this.roar())
    if (p < 0.01) this.scrollRoared = false

    // Roar envelope: up fast, hold, settle; scrolling keeps the mouth open.
    let blast = 0
    if (this.blastT >= 0) {
      this.blastT += dt
      const t = this.blastT
      blast = Math.min(1, t / 0.22) * (1 - ease(THREE.MathUtils.clamp((t - 1.9) / 0.8, 0, 1)))
      if (t > 2.8) this.blastT = -1
    }
    const held = THREE.MathUtils.smoothstep(p, 0.03, 0.12) * (1 - THREE.MathUtils.smoothstep(p, 0.42, 0.6))
    const target = Math.max(blast, held)
    this.roarK += (target - this.roarK) * Math.min(1, dt * (target > this.roarK ? 14 : 4))
    const burst = this.blastT >= 0 ? Math.max(0, 1 - this.blastT / 1.6) : 0

    // Pointer and drag turn the tiger a little; scrolling away turns it to the campus.
    if (!this.drag) {
      this.dragYaw += this.dragVel
      this.dragVel *= 0.9
      this.dragYaw *= 1 - Math.min(1, dt * 1.8)
    }
    this.dragYaw = THREE.MathUtils.clamp(this.dragYaw, -0.9, 0.9)
    const k = Math.min(1, dt * 2.5)
    this.mouse.x += (this.pointer.x - this.mouse.x) * k
    this.mouse.y += (this.pointer.y - this.mouse.y) * k
    const leave = ease(THREE.MathUtils.smoothstep(p, 0.5, 0.95))
    // Facing: three-quarter toward the camera, turning away to the right as it leaves.
    const face = (this.portrait ? -0.35 : -0.62) + this.mouse.x * 0.12 + this.dragYaw + leave * 1.9
    const dir = new THREE.Vector3(Math.sin(face), 0, Math.cos(face))
    const at = new THREE.Vector3(this.portrait ? 0.25 : 0.55, FLOOR, -0.2)
    this.tiger.update(dt, at, dir, 0, this.roarK)
    // The head follows the pointer a touch (undone after the frame).
    const head = this.tiger.gait?.bones?.c_head_00
    const neck = this.tiger.gait?.bones?.c_neck_01
    const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.mouse.y * 0.12 * (1 - this.roarK), this.mouse.x * 0.25 * (1 - this.roarK), 0))
    if (head) head.quaternion.multiply(qh)
    if (neck) neck.quaternion.multiply(qh)

    // Camera: low, close on the head and shoulders, breathing; drifts back as we leave.
    const hp = this.#head(new THREE.Vector3())
    const intro = this.intro
    const breath = Math.sin(this.time * 0.5)
    const camBase = this.portrait ? new THREE.Vector3(0.15, 1.4, 5.5) : new THREE.Vector3(-0.3, 1.25, 5.8)
    const cam = camBase.clone()
    cam.x += breath * 0.05 + this.mouse.x * 0.18
    cam.y += Math.sin(this.time * 0.37) * 0.03 + this.mouse.y * 0.08 + this.roarK * -0.08
    cam.z += (1 - intro) * 2.2 + leave * 2.5 - this.roarK * 0.35
    this.camera.position.copy(cam)
    this.lookAt ??= hp.clone()
    // Frame the head off-centre: right of the title on desktop, high on phones.
    const want = hp.clone().add(this.portrait ? new THREE.Vector3(0.0, -0.75, 0) : new THREE.Vector3(-1.0, -0.15, 0))
    this.lookAt.lerp(want, Math.min(1, dt * 3))
    this.camera.lookAt(this.lookAt)
    this.camera.rotateZ(Math.sin(this.time * 0.29) * 0.004 + (burst > 0 ? (Math.random() - 0.5) * 0.012 * burst : 0))

    // Lights come up with the intro; the rim flares with the roar.
    const lit = ease(THREE.MathUtils.clamp(intro, 0, 1))
    this.key.target.position.copy(hp).setY(hp.y * 0.6)
    this.rim.target.position.copy(hp)
    this.rim2.target.position.copy(hp).setY(hp.y * 0.7)
    this.key.intensity = 22 * lit * (1 - leave * 0.3)
    this.rim.intensity = (30 + this.roarK * 50 + burst * 70) * lit * (0.4 + 0.6 * this.open)
    this.rim2.intensity = (12 + this.roarK * 20) * lit * (0.4 + 0.6 * this.open)
    this.fill.intensity = 0.35 * lit
    this.backU.uIntro.value = lit
    this.backU.uGlow.value = this.roarK + burst
    this.fogU.uTime.value = this.time
    this.fogU.uIntro.value = lit
    this.emberU.uTime.value = this.time
    this.emberU.uBlast.value = burst
    this.emberU.uScroll.value = p
    this.finish.uniforms.uTime.value = this.time
    this.bloom.strength = 0.18 + burst * 0.25

    this.composer.render()
    if (head) head.quaternion.multiply(qh.invert())
    if (neck) neck.quaternion.multiply(qh)
    this.lastDrag = this.drag?.moved ?? this.lastDrag
  }
}
