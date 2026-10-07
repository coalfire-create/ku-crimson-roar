import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { drawTigerMask } from './tigerMask.js'

// The Awakening: a tiger's face made of embers, smouldering in the dark.
// Its eyes open with the intro (open), blink now and then (blink), and
// follow the pointer. A roar() bursts every ember outward on a shockwave and
// pulls them back into the face. Scrolling away (progress) lifts the embers
// off like sparks from a fire. Drag to turn the face; it springs back.

const KIND = { fur: 0, pale: 1, stripe: 2, eye: 3, nose: 4 }
const SCALE = 3.1
const EYE = [0.29 * SCALE, 0.19 * SCALE]

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 aDir;
  attribute float aRand;
  attribute float aKind;
  attribute float aSize;
  uniform float uTime, uIntro, uOpen, uBlink, uBlast, uScroll, uSize, uHeat;
  uniform vec2 uLook;
  uniform vec3 uMouse;
  varying vec3 vColor;
  varying float vAlpha;

  void main(){
    vec3 p = position;
    bool isEye = aKind > 2.5 && aKind < 3.5;

    // Breath, and fur that wavers like heat over coals.
    p *= 1.0 + 0.012 * sin(uTime * 1.3);
    p.x += sin(p.y * 6.0 + uTime * 1.7 + aRand * 6.28) * 0.012;
    p.y += sin(p.x * 5.0 + uTime * 1.3 + aRand * 3.1) * 0.012;

    if (isEye) {
      // Lids: squash toward the eye's centre line; the iris drifts to look.
      vec2 c = vec2(sign(p.x) * ${EYE[0].toFixed(3)}, ${EYE[1].toFixed(3)});
      p.y = c.y + (p.y - c.y) * max(0.04, uOpen * (1.0 - uBlink));
      p.xy += uLook * 0.05;
    }

    // Intro: embers drift in from a wide cloud and settle into the face.
    float k = smoothstep(aRand * 0.45, aRand * 0.45 + 0.55, uIntro);
    p = mix(p + aDir * (6.0 + aRand * 10.0) + vec3(0.0, -3.0, 0.0), p, k);

    // Roar: thrown out on a shockwave, then drawn back.
    float b = uBlast;
    float out_ = smoothstep(0.0, 0.18, b) * (1.0 - smoothstep(0.35, 1.0, b));
    float wave = smoothstep(0.0, 0.25, b - length(position.xy) * 0.04);
    p += aDir * out_ * wave * (2.5 + aRand * 7.0);
    p.y -= out_ * out_ * aRand * 1.5;

    // Scroll: embers peel off upward.
    float lift = smoothstep(aRand * 0.6, aRand * 0.6 + 0.4, uScroll);
    p.y += lift * (3.0 + aRand * 9.0);
    p.x += lift * sin(aRand * 40.0 + uTime) * 1.5;

    // The pointer stirs the fur.
    vec2 d = p.xy - uMouse.xy;
    float push = exp(-dot(d, d) * 1.6) * uMouse.z;
    p.xy += normalize(d + 0.0001) * push * 0.35;
    p.z += push * 0.5;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float flicker = 0.72 + 0.28 * sin(uTime * (2.0 + aRand * 4.0) + aRand * 50.0);
    float hot = out_ + push * 0.6 + uHeat;
    vec3 col = aColor * (isEye ? 1.0 : flicker);
    col = mix(col, vec3(1.0, 0.72, 0.3) * 1.6, clamp(hot, 0.0, 1.0) * (isEye ? 0.0 : 0.7));
    if (isEye) col *= mix(0.15, 1.0, uOpen * (1.0 - uBlink * 0.8));
    // Tens of thousands overlap additively: each ember is only a faint glow.
    vColor = col * (isEye ? 0.5 : aKind > 0.5 && aKind < 1.5 ? 0.16 : 0.26);
    vAlpha = k * (1.0 - lift * smoothstep(0.4, 1.0, aRand + uScroll * 0.6));
    gl_PointSize = min(18.0, uSize * aSize * (1.0 + out_ * 0.6) / -mv.z);
  }
`

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
  }
`

// Smoke behind the face: slow crimson fbm, darker at the edges.
const SMOKE = /* glsl */ `
  uniform float uTime, uBlast, uScroll;
  uniform vec2 uRes, uCenter;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    vec2 c = p - uCenter;
    vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, -uTime * 0.05)), fbm(p * 1.6 + 4.0 - uTime * 0.04));
    float n = fbm(p * 2.2 + q * 2.4 + vec2(0.0, -uTime * 0.08));
    float glow = exp(-dot(c, c) * 1.4);
    vec3 col = vec3(0.018, 0.01, 0.013);
    col += vec3(0.32, 0.025, 0.02) * pow(n, 3.0) * (0.25 + glow * 0.6);
    // Shockwave ring from a roar.
    float r = length(c);
    float ring = exp(-pow((r - uBlast * 2.6) * 9.0, 2.0)) * (1.0 - uBlast) * step(0.001, uBlast);
    col += vec3(1.0, 0.25, 0.08) * ring * 0.9;
    col *= 1.0 - smoothstep(0.45, 1.25, length(p));
    col *= 1.0 - uScroll * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`

function sampleFace(count) {
  const m = drawTigerMask()
  const N = m.size
  const at = (layer, x, y) => {
    const px = Math.round(((x + 1) / 2) * (N - 1))
    const py = Math.round(((1 - y) / 2) * (N - 1))
    return layer[(py * N + px) * 4 + 3] > 127
  }
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const dir = new Float32Array(count * 3)
  const rand = new Float32Array(count)
  const kind = new Float32Array(count)
  const size = new Float32Array(count)
  const c = new THREE.Color()
  const fur = [new THREE.Color('#ff3a12'), new THREE.Color('#ff7a1c'), new THREE.Color('#c8102e')]
  let n = 0
  let guard = 0
  while (n < count && guard++ < count * 40) {
    const x = Math.random() * 2.1 - 1.05
    const y = Math.random() * 1.9 - 0.92
    const inEye = at(m.eye, x, y)
    if (!at(m.face, x, y) && !inEye) continue
    let k = KIND.fur
    if (inEye) {
      if (at(m.pupil, x, y)) continue
      k = KIND.eye
    } else if (at(m.nose, x, y)) k = KIND.nose
    else if (at(m.stripe, x, y)) k = KIND.stripe
    else if (at(m.pale, x, y)) k = KIND.pale
    // Stripes stay mostly dark: only a few dim embers keep their shape solid.
    if (k === KIND.stripe && Math.random() > 0.07) continue
    if (k === KIND.nose && Math.random() > 0.5) continue

    // A dome, the muzzle pushed forward, the eyes set back.
    const r2 = x * x * 0.8 + y * y
    let z = 0.55 * Math.sqrt(Math.max(0, 1 - r2))
    z += 0.32 * Math.exp(-(x * x) / 0.06 - ((y + 0.3) * (y + 0.3)) / 0.08)
    z += 0.1 * Math.exp(-(x * x) / 0.01 - ((y + 0.05) * (y + 0.05)) / 0.08)
    if (k === KIND.eye) z -= 0.03
    z += (Math.random() - 0.5) * 0.05
    pos.set([x * SCALE, y * SCALE, z * SCALE], n * 3)

    if (k === KIND.fur) c.copy(fur[Math.floor(Math.random() * 3)]).multiplyScalar(0.55 + Math.random() * 0.45)
    else if (k === KIND.pale) c.setRGB(1.0, 0.56 + Math.random() * 0.14, 0.2 + Math.random() * 0.12).multiplyScalar(0.85)
    else if (k === KIND.stripe) c.setRGB(0.25, 0.02, 0.03)
    else if (k === KIND.eye) c.setRGB(1.0, 0.75 + Math.random() * 0.2, 0.15).multiplyScalar(1.6)
    else c.setRGB(0.5, 0.06, 0.1)
    col.set([c.r, c.g, c.b], n * 3)

    const d = new THREE.Vector3(x, y, z * 0.3).normalize()
    d.x += (Math.random() - 0.5) * 0.6
    d.y += (Math.random() - 0.5) * 0.6
    d.z += (Math.random() - 0.5) * 0.6
    d.normalize()
    d.z *= 0.35
    dir.set([d.x, d.y, d.z], n * 3)
    rand[n] = Math.random()
    kind[n] = k
    size[n] = k === KIND.eye ? 1.3 : k === KIND.pale ? 1.05 : 0.7 + Math.random() * 0.6
    n++
  }
  return { n, pos, col, dir, rand, kind, size }
}

export class Tiger {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75))
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200)
    this.camera.position.set(0, 0, 16)

    // Smoke backdrop.
    this.smoke = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uBlast: { value: 0 }, uScroll: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
        fragmentShader: SMOKE,
        depthWrite: false,
        depthTest: false,
      }),
    )
    this.smoke.frustumCulled = false
    this.smoke.renderOrder = -1
    this.scene.add(this.smoke)

    // The face.
    const f = sampleFace(mobile ? 22000 : 42000)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(f.pos.subarray(0, f.n * 3), 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(f.col.subarray(0, f.n * 3), 3))
    g.setAttribute('aDir', new THREE.BufferAttribute(f.dir.subarray(0, f.n * 3), 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(f.rand.subarray(0, f.n), 1))
    g.setAttribute('aKind', new THREE.BufferAttribute(f.kind.subarray(0, f.n), 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(f.size.subarray(0, f.n), 1))
    this.u = {
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uOpen: { value: 0 },
      uBlink: { value: 0 },
      uBlast: { value: 0 },
      uScroll: { value: 0 },
      uHeat: { value: 0 },
      uLook: { value: new THREE.Vector2() },
      uMouse: { value: new THREE.Vector3(99, 99, 0) },
      uSize: { value: 1 },
    }
    this.face = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.face.frustumCulled = false
    this.group = new THREE.Group()
    this.group.add(this.face)
    this.scene.add(this.group)

    // Loose sparks rising through the dark around it.
    const SP = mobile ? 500 : 1200
    const sp = new Float32Array(SP * 3)
    const sr = new Float32Array(SP)
    for (let i = 0; i < SP; i++) {
      sp.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10 - 2], i * 3)
      sr[i] = Math.random()
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sg.setAttribute('aRand', new THREE.BufferAttribute(sr, 1))
    this.sparksU = { uTime: { value: 0 }, uSize: { value: 1 }, uBlast: { value: 0 } }
    this.sparks = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        uniforms: this.sparksU,
        vertexShader: /* glsl */ `
          attribute float aRand; uniform float uTime, uSize, uBlast; varying float vA;
          void main(){
            vec3 p = position;
            float t = fract(aRand * 7.0 + uTime * (0.03 + aRand * 0.05) * (1.0 + uBlast * 6.0));
            p.y = -9.0 + t * 18.0;
            p.x += sin(t * 9.0 + aRand * 30.0) * 0.8;
            vA = sin(t * 3.14159) * (0.4 + aRand * 0.6);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (0.6 + aRand * 1.4) / -mv.z;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(1.0, 0.45, 0.15) * a * vA, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.sparks.frustumCulled = false
    this.scene.add(this.sparks)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.3)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.time = 0
    this.intro = 0
    this.open = 0
    this.blink = 0
    this.progress = 0
    this.blastT = -1
    this.yaw = 0
    this.pitch = 0
    this.dragYaw = 0
    this.dragVel = 0
    this.pointer = { x: 0, y: 0, on: false }
    this.mouse = new THREE.Vector2()
    addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1
      this.pointer.on = e.pointerType === 'mouse'
      if (this.drag) {
        const dx = e.clientX - this.drag.x
        this.drag.x = e.clientX
        this.dragYaw += dx * 0.006
        this.dragVel = dx * 0.006
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

  // Where the face sits on screen: right of the title, or high up on phones.
  #layout() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    const portrait = w / h < 0.8
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z
    const vw = vh * this.camera.aspect
    this.home = portrait ? new THREE.Vector3(0, vh * 0.17, 0) : new THREE.Vector3(vw * 0.25, vh * 0.03, 0)
    this.group.scale.setScalar(portrait ? Math.min(1, (vw * 0.92) / (2 * SCALE)) : Math.min(1.08, (vh * 0.74) / (1.8 * SCALE), (vw * 0.44) / (2 * SCALE)))
    this.smoke.material.uniforms.uCenter.value.set(portrait ? 0 : 0.25 * (w / h), portrait ? 0.17 : 0.03)
  }

  // Screen position (px) of the space between the eyes, for the CSS layer.
  eyesOnScreen() {
    const v = new THREE.Vector3(0, EYE[1], 0.4 * SCALE).applyMatrix4(this.group.matrixWorld).project(this.camera)
    return [(v.x * 0.5 + 0.5) * this.canvas.clientWidth, (-v.y * 0.5 + 0.5) * this.canvas.clientHeight]
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const pr = this.renderer.getPixelRatio()
    this.u.uSize.value = (w < 760 ? 56 : 50) * pr * (h / 900)
    this.sparksU.uSize.value = 90 * pr * (h / 900)
    this.smoke.material.uniforms.uRes.value.set(w, h)
    this.bloom.resolution.set(w / 2, h / 2)
    this.#layout()
  }

  render(dt) {
    this.time += dt
    const u = this.u
    u.uTime.value = this.time
    this.sparksU.uTime.value = this.time
    u.uIntro.value = this.intro
    u.uOpen.value = this.open
    u.uBlink.value = this.blink
    u.uScroll.value = this.progress

    if (this.blastT >= 0) {
      this.blastT += dt
      const b = Math.min(1, this.blastT / 1.8)
      u.uBlast.value = b
      this.smoke.material.uniforms.uBlast.value = Math.min(1, this.blastT / 1.1)
      this.sparksU.uBlast.value = Math.max(0, 1 - this.blastT / 1.5)
      if (b >= 1) ((this.blastT = -1), (u.uBlast.value = 0), (this.smoke.material.uniforms.uBlast.value = 0))
    }
    this.smoke.material.uniforms.uTime.value = this.time
    this.smoke.material.uniforms.uScroll.value = this.progress

    // Drag turns the face; it coasts, then springs home.
    if (!this.drag) {
      this.dragYaw += this.dragVel
      this.dragVel *= 0.9
      this.dragYaw *= 1 - Math.min(1, dt * 2.2)
    }
    this.dragYaw = THREE.MathUtils.clamp(this.dragYaw, -1.1, 1.1)
    const k = Math.min(1, dt * 3)
    this.mouse.x += (this.pointer.x - this.mouse.x) * k
    this.mouse.y += (this.pointer.y - this.mouse.y) * k
    this.yaw += (this.mouse.x * 0.28 + this.dragYaw - this.yaw) * Math.min(1, dt * 6)
    this.pitch += (-this.mouse.y * 0.16 - this.pitch) * k
    this.group.position.copy(this.home)
    this.group.position.y += Math.sin(this.time * 0.6) * 0.06
    this.group.rotation.set(this.pitch, this.yaw, 0)
    u.uLook.value.set(this.mouse.x, this.mouse.y)

    // The pointer in the face's own plane, for stirring the fur.
    if (this.pointer.on) {
      const v = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera)
      const dir = v.sub(this.camera.position).normalize()
      const t = (this.home.z - this.camera.position.z) / dir.z
      const hit = this.camera.position.clone().addScaledVector(dir, t)
      this.group.updateMatrixWorld()
      this.group.worldToLocal(hit)
      u.uMouse.value.set(hit.x, hit.y, 1)
    } else u.uMouse.value.z *= 0.9

    this.bloom.strength = 0.7 + u.uBlast.value * (1 - u.uBlast.value) * 1.2
    this.composer.render()
    this.lastDrag = this.drag?.moved ?? this.lastDrag
  }
}
