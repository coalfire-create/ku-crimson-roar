import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RunTiger } from './runTiger.js'

// The Awakening: the real tiger stands in the dark, lit by one warm key light
// and a crimson rim. It breathes (its own idle clip) and watches the pointer.
// roar(), or the first scroll, throws its head up and its jaw open while
// embers burst from the floor; scrolling on, the roar carries through and the
// tiger turns away toward the campus. Same interface as the ember Tiger:
// progress, intro, open, blink, dragged, roar(), resize(), render(dt).

const SCALE = 0.026 // a big male: about 5 m nose to tail

// The opening: the tiger roars, bursts into embers, and the embers gather
// into the university's shield; a breath later they flow back into the
// tiger. Each particle starts on the tiger's (skinned) surface and ends on a
// pixel of the emblem, swinging out on a curve between the two.
const MORPH_VERT = /* glsl */ `
  attribute vec3 aTo;
  attribute vec3 aCol;
  attribute float aSeed;
  uniform float uM, uTime, uSize, uFlash, uFade;
  varying vec3 vCol;
  varying float vA;
  void main(){
    float d = aSeed * 0.35;
    float m = clamp((uM - d) / 0.65, 0.0, 1.0);
    float e = m * m * (3.0 - 2.0 * m);
    vec3 swirl = vec3(sin(aSeed * 40.0 + uTime * 1.3), cos(aSeed * 31.0 + uTime), sin(aSeed * 17.0 + uTime * 0.7));
    vec3 mid = mix(position, aTo, 0.5) + swirl * 0.9 + vec3(0.0, 0.4, 0.6);
    vec3 p = (1.0 - e) * (1.0 - e) * position + 2.0 * (1.0 - e) * e * mid + e * e * aTo;
    // Settled, the shield breathes a little.
    p += swirl * 0.012 * e;
    vCol = mix(vec3(1.0, 0.45, 0.15), aCol, smoothstep(0.55, 1.0, e));
    // A sweep of light across the shield as it locks into place.
    float sweep = exp(-pow((aTo.x + aTo.y * 0.6) * 1.2 - (1.0 - uFlash) * 6.0 + 3.0, 2.0) * 2.0);
    vCol += vec3(1.0, 0.85, 0.55) * (uFlash * 0.5 + sweep * uFlash) * e;
    // Faint sparks lifting off the coat at first, the shield brighter as it
    // forms; then gone as the crisp emblem takes their place.
    vA = smoothstep(0.0, 0.08, uM) * mix(0.35, 1.0, e) * (1.0 - uFade);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * mix(2.2, 1.0, e) / -mv.z;
  }
`
const MORPH_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main(){
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, r) * vA;
    if (a < 0.02) discard;
    gl_FragColor = vec4(vCol * 1.25, a);
  }
`
// The exit: the tiger breaks into embers that swirl up and drift toward the
// viewer, glowing hottest as they go, and fade.
const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uE, uTime, uSize;
  varying vec3 vCol;
  varying float vA;
  void main(){
    float e = clamp((uE - aSeed * 0.3) / 0.7, 0.0, 1.0);
    vec3 sw = vec3(sin(aSeed * 40.0 + uTime * 2.0), cos(aSeed * 31.0 + uTime * 1.7), sin(aSeed * 17.0 + uTime * 1.3));
    // Spread out quickly, so it reads as sparks rather than a glowing mass.
    float spread = sqrt(e);
    vec3 p = position + sw * spread * 0.9 + vec3(0.0, e * e * (1.2 + aSeed * 2.8) + spread * 0.3, e * (0.4 + aSeed * 2.2));
    vCol = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.75, 0.4), aSeed) * 0.55;
    vA = smoothstep(0.0, 0.04, uE) * (1.0 - smoothstep(0.45, 1.0, e)) * mix(0.35, 0.8, spread);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * mix(1.2, 2.2, e) / -mv.z;
  }
`
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

    // Soft studio bounce for the eyes, nose and the sheen of the coat.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0
    pmrem.dispose()
    // Lights as on a wildlife shoot at dusk: a big soft warm key front-left,
    // a warm sun-like back light picking out the fur's edge, a cool sky fill.
    this.key = new THREE.SpotLight('#ffe6cc', 0, 30, 0.5, 0.9, 1.2)
    this.key.position.set(-3.2, 5.2, 4.2)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.02
    this.key.shadow.radius = 6
    this.rim = new THREE.SpotLight('#ffc89a', 0, 30, 0.6, 0.6, 1.2)
    this.rim.position.set(3.5, 3.0, -4.5)
    this.rim2 = new THREE.SpotLight('#9fb4dc', 0, 30, 0.6, 0.7, 1.2)
    this.rim2.position.set(-4, 2.2, -3.5)
    this.fill = new THREE.HemisphereLight('#7a8aa8', '#2a1a12', 0)
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target, this.rim2, this.rim2.target, this.fill)

    // Dense fine fur up close: more, thinner shells.
    this.tiger = new RunTiger(this.scene, undefined, { scale: SCALE, fur: mobile ? 5 : 10, furLen: 1.1, rim: 0 })

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

    // Multisampled, so each fur strand's soft edge (alpha to coverage) survives.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { samples: mobile ? 2 : 4, type: THREE.HalfFloatType }))
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

  // The morph's start points, sampled off the posed tiger a few thousand per
  // frame while the intro plays, so building it never stalls a frame.
  #prepMorph() {
    if (this.prep?.done) return true
    if (!this.prep) {
      const meshes = []
      this.tiger.group.traverse((o) => o.isSkinnedMesh && !o.userData.shell && meshes.push(o))
      if (!meshes.length) return false
      const N = innerWidth < 760 ? 14000 : 30000
      this.prep = { src: meshes[0], N, i: 0, from: new Float32Array(N * 3), seed: new Float32Array(N), done: false }
    }
    const P = this.prep
    P.src.updateMatrixWorld(true)
    const pos = P.src.geometry.attributes.position
    const v = new THREE.Vector3()
    const end = Math.min(P.N, P.i + 2500)
    for (; P.i < end; P.i++) {
      const k = Math.floor(Math.random() * pos.count)
      v.fromBufferAttribute(pos, k)
      P.src.applyBoneTransform(k, v)
      v.applyMatrix4(P.src.matrixWorld)
      P.from.set([v.x, v.y, v.z], P.i * 3)
      P.seed[P.i] = Math.random()
    }
    if (P.i >= P.N) P.done = true
    return P.done
  }

  // The emblem morph and the exit's embers, once the start points are in:
  // targets on the shield (cheap), and both shaders compiled up front.
  #buildMorph() {
    const img = this.emblem
    const { N, from, seed } = this.prep
    const to = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const v = new THREE.Vector3()
    const cw = 220
    const ch = Math.round((cw * img.naturalHeight) / img.naturalWidth)
    const cv = document.createElement('canvas')
    cv.width = cw
    cv.height = ch
    const g = cv.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0, cw, ch)
    const px = g.getImageData(0, 0, cw, ch).data
    const on = []
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (px[(y * cw + x) * 4 + 3] > 128) on.push([x, y])
    // Where the shield stands: big and square to the camera, in the open
    // part of the frame (right of the title; on phones, the upper half).
    const D = 4.2
    const vh = 2 * D * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const vw = vh * this.camera.aspect
    const fwd = this.camera.getWorldDirection(new THREE.Vector3())
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion)
    const H = vh * (this.portrait ? 0.26 : 0.34)
    const W = (H * cw) / ch
    const c0 = this.camera.position.clone().addScaledVector(fwd, D).addScaledVector(right, this.portrait ? 0 : vw * 0.02).addScaledVector(up, this.portrait ? vh * 0.24 : vh * 0.2)
    this.emb = { c0, up, H }
    for (let i = 0; i < N; i++) {
      const [x, y] = on[Math.floor(Math.random() * on.length)]
      const ox = (x / cw - 0.5) * W + (Math.random() - 0.5) * (W / cw)
      const oy = (0.5 - y / ch) * H + (Math.random() - 0.5) * (H / ch)
      v.copy(c0).addScaledVector(right, ox).addScaledVector(up, oy).addScaledVector(fwd, (Math.random() - 0.5) * 0.02)
      to.set([v.x, v.y, v.z], i * 3)
      const o = (y * cw + x) * 4
      col.set([(px[o] / 255) ** 2.2, (px[o + 1] / 255) ** 2.2, (px[o + 2] / 255) ** 2.2], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(from, 3))
    geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3))
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.morphU = { uM: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uSize: { value: 13 * this.renderer.getPixelRatio() } }
    this.morph = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.morphU, vertexShader: MORPH_VERT, fragmentShader: MORPH_FRAG, transparent: true, depthWrite: false }))
    this.morph.frustumCulled = false
    this.scene.add(this.morph)
    // The exit: the same points, blown up and away as embers.
    this.dustU = { uE: { value: 0 }, uTime: { value: 0 }, uSize: this.morphU.uSize }
    this.dust = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.dustU, vertexShader: DUST_VERT, fragmentShader: MORPH_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
    // Compile both in the background (parallel shader compile where the
    // browser has it), not on their first frame.
    // Neither is drawn until its shader is ready: a first draw before then
    // would make the browser finish compiling on the spot, and stall.
    // (compile only visits visible objects, so both are shown for the call.)
    this.morphReady = false
    this.morph.visible = this.dust.visible = true
    const jobs = [this.renderer.compileAsync(this.morph, this.camera, this.scene), this.renderer.compileAsync(this.dust, this.camera, this.scene)]
    this.morph.visible = this.dust.visible = false
    Promise.all(jobs)
      .catch(() => {})
      .finally(() => {
        // Drawn (fully transparent) from here on, so their buffers are on the
        // GPU before the moment they appear.
        this.morphReady = true
        this.morph.visible = this.dust.visible = true
      })
    this.seq = 0
  }

  // The opening sequence, once the lights are up: roar (0-1.2 s), burst into
  // the shield (from 1.2 s, formed by ~2.8 s), hold it, then back into the
  // tiger (from 6.3 s, or as soon as the visitor scrolls on).
  #morphStep(dt) {
    if (!this.emblem) {
      this.emblem = new Image()
      this.emblem.src = `${import.meta.env.BASE_URL}brand/ku-emblem.png`
    }
    if (!this.tiger.ready || !(this.emblem.complete && this.emblem.naturalWidth)) return
    // Sample while the lights come up; build (targets, shaders) just before.
    if (!this.#prepMorph()) return
    if (!this.morph && this.intro > 0.8) this.#buildMorph()
    if (this.seqDone || this.intro < 0.95 || !this.morph || !this.morphReady) return
    if (this.seq === 0) this.roar()
    this.seq += dt
    const t = this.seq
    // The tiger stays and roars; embers lift off its coat and gather into the
    // shield beside it; the shield then becomes the crisp emblem itself (on
    // the page, see onEmblem) and the embers fade. No dissolve, no flash.
    if (this.progress > 0.04 || (this.exit ?? 0) > 0) this.morphOut = true
    const want = t > 0.9 && !this.morphOut ? 1 : 0
    this.mLin = THREE.MathUtils.clamp((this.mLin ?? 0) + Math.sign(want - (this.mLin ?? 0)) * dt / 1.8, 0, 1)
    const m = ease(this.mLin)
    if (m > 0.995 && !this.formed) {
      this.formed = true
      this.formedT = t
      this.onEmblem?.(this.#emblemRect())
    }
    const fade = this.formed ? THREE.MathUtils.clamp((t - this.formedT) / 0.6, 0, 1) : this.morphOut ? 1 : 0
    this.morphU.uM.value = m
    this.morphU.uTime.value = t
    this.morphU.uFade.value = fade
    this.morph.visible = true
    this.morphing = m * (1 - fade)
    if (fade >= 1 || (this.morphOut && this.mLin === 0)) ((this.seqDone = true), (this.morph.visible = false))
  }

  // Where the shield formed, in page pixels: centre and height.
  #emblemRect() {
    const r = this.canvas.getBoundingClientRect()
    const toPx = (v) => {
      const p = v.clone().project(this.camera)
      return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height }
    }
    const { c0, up, H } = this.emb
    const a = toPx(c0.clone().addScaledVector(up, H / 2))
    const b = toPx(c0.clone().addScaledVector(up, -H / 2))
    const c = toPx(c0)
    return { x: c.x, y: c.y, h: Math.abs(b.y - a.y) }
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
    const held = THREE.MathUtils.smoothstep(p, 0.0, 0.05) * (1 - THREE.MathUtils.smoothstep(p, 0.12, 0.28))
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
    // The charge: after its roar the tiger turns to face us and runs
    // straight at the camera, gathering into a pounce that fills the frame
    // as the next chapter is torn in over it.
    const charge = THREE.MathUtils.smoothstep(p, 0.1, 1)
    const at0 = new THREE.Vector3(this.portrait ? 0.25 : 0.55, FLOOR, -0.2)
    const camXZ = this.portrait ? new THREE.Vector3(0.15, 0, 5.5) : new THREE.Vector3(-0.3, 0, 5.8)
    const toCam = camXZ.clone().sub(at0).setY(0)
    // A few bounding strides, then it leaps: up off the ground and straight
    // at the lens, jaws open, until its face fills the frame.
    const run = toCam.length() - 4.6
    const leapTo = toCam.length() - 3.6
    toCam.normalize()
    // Facing: three-quarter toward the camera at rest, square on as it charges.
    const rest = (this.portrait ? -0.35 : -0.62) + this.mouse.x * 0.12 + this.dragYaw
    const turn = THREE.MathUtils.smoothstep(charge, 0, 0.12)
    let face = rest + (Math.atan2(toCam.x, toCam.z) - rest) * turn
    const dir = new THREE.Vector3(Math.sin(face), 0, Math.cos(face))
    const runK = THREE.MathUtils.smoothstep(charge, 0, 0.62)
    const pounce = THREE.MathUtils.smoothstep(charge, 0.6, 1)
    const ease2 = runK * run + pounce * (leapTo - run)
    const at = at0.clone().addScaledVector(toCam, ease2)
    // The arc of the leap: up fast, still high as it reaches us.
    at.y += Math.sin(pounce * Math.PI) * 0.4 + pounce * 0.05
    // Running speed from how fast it actually closes in, never a crawl.
    const moved = Math.abs(ease2 - (this.lastCharge ?? ease2))
    this.lastCharge = ease2
    const rate = moved / Math.max(dt, 1e-3)
    const speed = rate > 0.2 ? THREE.MathUtils.clamp(Math.max(rate, 7), 0, 18) : 0
    // A snarl as it closes.
    // A snarl as it closes, a full roar as it pulls up.
    const snarl = Math.max(this.roarK * (1 - turn), THREE.MathUtils.smoothstep(charge, 0.55, 0.8) * 0.45 + THREE.MathUtils.smoothstep(charge, 0.82, 0.95) * 0.55)
    this.tiger.update(dt, at, dir, pounce > 0 ? Math.max(speed, 12) : speed, pounce > 0.05 ? 0.4 : Math.min(snarl, 0.45 + 0.55 * (1 - turn)))
    // Airborne: chest up at take-off, levelling out as it comes in.
    this.tiger.group.rotation.x = -Math.sin(pounce * Math.PI) * 0.22 + pounce * 0.12
    if (pounce > 0.05 && !this.leapRoared) ((this.leapRoared = true), this.onRoar?.())
    if (pounce < 0.01) this.leapRoared = false
    this.charge = charge
    this.#morphStep(dt)
    // The exit (driven by the first scroll): one roar, then the tiger breaks
    // into embers that rise and drift past as the next chapter fades in.
    const ex = this.exit ?? 0
    if (ex > 0.01 && !this.exitOn) ((this.exitOn = true), (this.morphOut = true), this.roar(), this.onRoar?.())
    if (ex < 0.005 && this.exitOn) {
      this.exitOn = false
      if (this.dust) this.dustU.uE.value = 0
      this.tiger.group.visible = true
    }
    if (this.exitOn) {
      if (!this.dust && this.prep && this.emblem?.naturalWidth) {
        while (!this.#prepMorph());
        this.#buildMorph()
      }
      const e = THREE.MathUtils.smoothstep(ex, 0.2, 1)
      if (this.dust) {
        this.dustU.uE.value = e
        this.dustU.uTime.value = this.time
        this.dust.visible = this.morphReady
      }
      if (e > 0.05 && this.morphReady) this.tiger.group.visible = false
      if (this.morph) this.morph.visible = false
    }
    // The head follows the pointer a touch (undone after the frame).
    const head = this.tiger.gait?.bones?.c_head_00
    const neck = this.tiger.gait?.bones?.c_neck_01
    const look = (1 - this.roarK) * (1 - this.charge)
    const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.mouse.y * 0.12 * look, this.mouse.x * 0.25 * look, 0))
    if (head) head.quaternion.multiply(qh)
    if (neck) neck.quaternion.multiply(qh)

    // Camera: low, close on the head and shoulders, breathing.
    const hp = this.#head(new THREE.Vector3())
    const intro = this.intro
    const breath = Math.sin(this.time * 0.5)
    const camBase = this.portrait ? new THREE.Vector3(0.15, 1.4, 5.5) : new THREE.Vector3(-0.3, 1.25, 5.8)
    const cam = camBase.clone()
    cam.x += breath * 0.05 + this.mouse.x * 0.18
    cam.y += Math.sin(this.time * 0.37) * 0.03 + this.mouse.y * 0.08 + this.roarK * -0.08
    cam.z += (1 - intro) * 2.2 - this.roarK * 0.35 * (1 - this.charge)
    // Leaving: the camera eases forward and up into the rising embers.
    const exE = ease(THREE.MathUtils.clamp(this.exit ?? 0, 0, 1))
    cam.z -= exE * 1.4
    cam.y += exE * 0.5
    // Rises a little with the leap, to meet its face.
    cam.y += Math.max(0, hp.y - 1.3) * 0.6 * this.charge
    // The ground shakes under it as it comes, harder the closer it gets.
    const quake = this.charge * this.charge * (speed > 0 ? 1 : 0.3)
    cam.x += (Math.random() - 0.5) * 0.05 * quake
    cam.y += (Math.random() - 0.5) * 0.05 * quake + Math.abs(Math.sin(this.time * 9)) * 0.02 * quake
    this.camera.position.copy(cam)
    this.lookAt ??= hp.clone()
    // Frame the head off-centre: right of the title on desktop, high on
    // phones; square on its face as it charges.
    const off = this.portrait ? new THREE.Vector3(0.0, -0.75, 0) : new THREE.Vector3(-1.0, -0.15, 0)
    const want = hp.clone().addScaledVector(off, 1 - THREE.MathUtils.smoothstep(this.charge, 0.05, 0.4))
    this.lookAt.lerp(want, Math.min(1, dt * (4 + this.charge * 10)))
    this.camera.lookAt(this.lookAt)
    this.camera.rotateZ(Math.sin(this.time * 0.29) * 0.004 + (burst > 0 ? (Math.random() - 0.5) * 0.012 * burst : 0) + (Math.random() - 0.5) * 0.01 * quake)

    // Lights come up with the intro; the rim flares with the roar.
    const lit = ease(THREE.MathUtils.clamp(intro, 0, 1))
    this.key.target.position.copy(hp).setY(hp.y * 0.6)
    this.rim.target.position.copy(hp)
    this.rim2.target.position.copy(hp).setY(hp.y * 0.7)
    this.key.intensity = 26 * lit
    this.rim.intensity = (26 + this.roarK * 14 + burst * 20) * lit * (0.4 + 0.6 * this.open)
    this.rim2.intensity = 10 * lit * (0.4 + 0.6 * this.open)
    this.fill.intensity = 0.5 * lit
    this.scene.environmentIntensity = 0.22 * lit
    this.backU.uIntro.value = lit
    this.backU.uGlow.value = this.roarK + burst
    this.fogU.uTime.value = this.time
    this.fogU.uIntro.value = lit
    this.emberU.uTime.value = this.time
    this.emberU.uBlast.value = burst
    this.emberU.uScroll.value = p
    this.finish.uniforms.uTime.value = this.time
    let flash = 0
    if (this.flashT >= 0) ((this.flashT += dt), (flash = Math.exp(-this.flashT * 3)), this.flashT > 2 && (this.flashT = -1))
    if (this.morphU) this.morphU.uFlash.value = flash
    this.bloom.strength = 0.18 + burst * 0.25 + (this.morphing ?? 0) * 0.35 + flash * 0.9 + (this.dustU ? this.dustU.uE.value * 0.2 : 0)

    this.composer.render()
    if (head) head.quaternion.multiply(qh.invert())
    if (neck) neck.quaternion.multiply(qh)
    this.lastDrag = this.drag?.moved ?? this.lastDrag
  }
}
