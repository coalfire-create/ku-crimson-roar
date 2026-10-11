import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RunTiger } from './runTiger.js'

// 고려대의 상징, three full-screen sets along one camera path:
//  1. 크림슨 — a vast banner of crimson silk billowing in the wind, light
//     raking across its folds; the camera pushes in and passes through it.
//  2. 호랑이 — the tiger on a crag in a shaft of light, roaring, embers rising.
//  3. 막걸리 — a yellow 양은 kettle pouring a milky stream into a 사발 on a
//     low wooden table, the surface rippling, a warm lamp overhead.
// progress (0..1) drives the camera; each set holds while its words show.

const S = THREE.MathUtils.smoothstep
const CLOTH_VERT = /* glsl */ `
  uniform float uTime, uGust;
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  vec3 wave(vec2 p){
    float t = uTime;
    float a = sin(p.x * 0.35 + t * 1.3) * 1.2 + sin(p.x * 0.8 - t * 1.9 + p.y * 0.3) * 0.45 + sin(p.y * 0.5 + t * 0.9) * 0.6;
    // Free toward the right edge, held at the left (the pole).
    float hold = smoothstep(-20.0, -6.0, p.x);
    return vec3(0.0, sin(p.x * 0.6 + t * 1.5) * 0.25 * hold, a * hold * (1.0 + uGust));
  }
  void main(){
    vUv = uv;
    vec3 p = position + wave(position.xy);
    float e = 0.05;
    vec3 px = vec3(position.x + e, position.y, 0.0) + wave(position.xy + vec2(e, 0.0));
    vec3 py = vec3(position.x, position.y + e, 0.0) + wave(position.xy + vec2(0.0, e));
    vN = normalize(normalMatrix * cross(px - p, py - p));
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const CLOTH_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  varying vec2 vUv;
  void main(){
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vW);
    float diff = max(dot(n, normalize(uLight)), 0.0);
    // Silk: a soft sheen along the folds, deep shadow in the troughs.
    float sheen = pow(1.0 - abs(dot(n, v)), 2.0);
    // A broad, soft highlight: a tight one sparkles and flickers as the folds move.
    float spec = pow(max(dot(reflect(-normalize(uLight), n), v), 0.0), 8.0);
    vec3 base = vec3(0.3, 0.0, 0.045);
    vec3 col = base * (0.18 + diff * 1.1) + vec3(0.7, 0.08, 0.14) * sheen * 0.35 + vec3(1.0, 0.6, 0.55) * spec * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class Symbols3D {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.1 : 1.75))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#0a0306')
    this.scene.fog = new THREE.Fog('#0a0306', 25, 95)
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.2
    pm.dispose()
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
    this.scene.add(new THREE.HemisphereLight('#ffd9d0', '#200408', 0.35))

    // 1. Crimson: the banner, 44 x 26 m, on a pole at its left edge.
    this.clothU = { uTime: { value: 0 }, uGust: { value: 0 }, uLight: { value: new THREE.Vector3(-0.4, 0.6, 0.7) } }
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(44, 26, mobile ? 120 : 220, mobile ? 70 : 130), new THREE.ShaderMaterial({ uniforms: this.clothU, vertexShader: CLOTH_VERT, fragmentShader: CLOTH_FRAG, side: THREE.DoubleSide }))
    cloth.position.set(0, 9, 0)
    this.scene.add(cloth)
    this.cloth = cloth

    // 2. The tiger on its crag, 70 m further on.
    const T = (this.tigerAt = new THREE.Vector3(0, 0, -70))
    const crag = new THREE.Mesh(new THREE.DodecahedronGeometry(4, 2), new THREE.MeshStandardMaterial({ color: '#2b2422', roughness: 0.95, flatShading: true }))
    crag.scale.set(2.2, 0.9, 1.6)
    crag.position.copy(T).add(new THREE.Vector3(0, 0.2, 0))
    this.scene.add(crag)
    const key = new THREE.SpotLight('#ffe2c4', 160, 60, 0.35, 0.6, 1.6)
    key.position.copy(T).add(new THREE.Vector3(-6, 22, 10))
    key.target.position.copy(T).add(new THREE.Vector3(0, 4, 0))
    const rim = new THREE.SpotLight('#ff3048', 260, 60, 0.5, 0.7, 1.6)
    rim.position.copy(T).add(new THREE.Vector3(4, 10, -16))
    rim.target.position.copy(T).add(new THREE.Vector3(0, 4, 0))
    this.scene.add(key, key.target, rim, rim.target)
    this.tiger = new RunTiger(this.scene, undefined, { scale: 0.034, fur: mobile ? 0 : 6, furLen: 1.1, rim: 0.6 })
    // Embers rising around it.
    const EN = 700
    const ep = new Float32Array(EN * 3)
    for (let i = 0; i < EN; i++) ep.set([T.x + (Math.random() - 0.5) * 30, Math.random() * 20, T.z + (Math.random() - 0.5) * 20], i * 3)
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3))
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: '#ff7a3a', size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.scene.add(this.embers)

    // 3. Makgeolli, 70 m further still: a low table, a 사발, a kettle pouring.
    const M = (this.makAt = new THREE.Vector3(0, 0, -240))
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.65 })
    const table = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.35, 48), wood)
    table.position.copy(M).add(new THREE.Vector3(0, 1.6, 0))
    this.scene.add(table)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), wood)
      leg.position.copy(M).add(new THREE.Vector3(Math.cos(a) * 2.8, 0.75, Math.sin(a) * 2.8))
      this.scene.add(leg)
    }
    // The bowl: a hammered brass 양은 사발 (lathe), milky makgeolli inside.
    const brass = new THREE.MeshStandardMaterial({ color: '#d9b25a', metalness: 0.85, roughness: 0.32 })
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, 0], [0.55, 0], [0.62, 0.08], [1.05, 0.55], [1.32, 1.05], [1.38, 1.12], [1.3, 1.12], [1.24, 1.04], [0.98, 0.56], [0.5, 0.14], [0, 0.14]].map(([r, y]) => new THREE.Vector2(r, y)),
        64,
      ),
      brass,
    )
    bowl.position.copy(M).add(new THREE.Vector3(0.6, 1.78, 0.4))
    this.scene.add(bowl)
    this.milkU = { uTime: { value: 0 }, uFill: { value: 0 } }
    const milk = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 64),
      new THREE.ShaderMaterial({
        uniforms: this.milkU,
        vertexShader: `uniform float uTime; varying vec2 vP; void main(){ vP = position.xy; vec3 p = position; float r = length(p.xy); p.z += sin(r * 9.0 - uTime * 6.0) * 0.02 * smoothstep(1.2, 0.0, r); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vP; void main(){ float r = length(vP); float ring = 0.5 + 0.5 * sin(r * 18.0 - uTime * 6.0); vec3 c = mix(vec3(0.93, 0.9, 0.82), vec3(1.0, 0.98, 0.93), ring * smoothstep(1.1, 0.1, r)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    )
    milk.rotation.x = -Math.PI / 2
    this.milk = milk
    this.milkBase = M.clone().add(new THREE.Vector3(0.6, 1.95, 0.4))
    this.scene.add(milk)
    // The kettle: a yellow aluminium 주전자, body, lid, spout and handle.
    const tin = new THREE.MeshStandardMaterial({ color: '#e7c24a', metalness: 0.75, roughness: 0.28 })
    const kettle = new THREE.Group()
    kettle.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.1, 0], [1.25, 0.2], [1.3, 1.0], [1.1, 1.6], [0.6, 1.8], [0.6, 1.9], [0, 1.95]].map(([r, y]) => new THREE.Vector2(r, y)), 48), tin))
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), tin)
    knob.position.y = 2.05
    kettle.add(knob)
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 1.6, 16), tin)
    spout.position.set(1.45, 1.0, 0)
    spout.rotation.z = -0.9
    kettle.add(spout)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 10, 32, Math.PI), tin)
    handle.position.set(-1.1, 1.0, 0)
    handle.rotation.z = Math.PI / 2
    kettle.add(handle)
    kettle.position.copy(M).add(new THREE.Vector3(-2.7, 3.7, 0.4))
    kettle.rotation.z = -0.55
    this.kettle = kettle
    this.scene.add(kettle)
    // The stream from spout to bowl.
    this.streamU = { uTime: { value: 0 }, uOn: { value: 0 } }
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 1, 12, 20, true),
      new THREE.ShaderMaterial({
        uniforms: this.streamU,
        vertexShader: `uniform float uTime; varying float vY; void main(){ vY = position.y; vec3 p = position; p.x += sin(position.y * 20.0 + uTime * 14.0) * 0.012; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `uniform float uTime, uOn; varying float vY; void main(){ float f = 0.85 + 0.15 * sin(vY * 40.0 + uTime * 30.0); gl_FragColor = vec4(vec3(0.97, 0.95, 0.88) * f, uOn); }`,
        transparent: true,
      }),
    )
    this.stream = stream
    this.scene.add(stream)
    // A warm lamp hanging over the table.
    const lamp = new THREE.PointLight('#ffc27a', 45, 30, 1.6)
    lamp.position.copy(M).add(new THREE.Vector3(0, 8, 2))
    this.scene.add(lamp)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe0a8' }))
    bulb.position.copy(lamp.position)
    this.scene.add(bulb)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 6), new THREE.MeshBasicMaterial({ color: '#1a1210' }))
    cord.position.copy(lamp.position).add(new THREE.Vector3(0, 6, 0))
    this.scene.add(cord)
    const mkey = new THREE.SpotLight('#fff0dc', 90, 40, 0.5, 0.6, 1.6)
    mkey.position.copy(M).add(new THREE.Vector3(6, 12, 10))
    mkey.target.position.copy(M).add(new THREE.Vector3(0, 2, 0))
    this.scene.add(mkey, mkey.target)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 0.85)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    // Compile every shader up front (and the tiger's once it has loaded), so
    // nothing stalls the first time it comes into view.
    this.renderer.compileAsync(this.scene, this.camera).catch(() => {})
    this.tiger.onReady = () => {
      this.tiger.group.visible = true
      this.renderer.compileAsync(this.scene, this.camera).catch(() => {})
    }
    this.progress = 0
    this.time = 0
    this.mouse = new THREE.Vector2()
    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.fov = this.portrait ? 60 : 42
    this.camera.updateProjectionMatrix()
  }

  // Which set the camera is at: 0 crimson, 1 tiger, 2 makgeolli (fractional
  // during the flights between).
  act() {
    const p = this.progress
    return p < 0.3 ? 0 : p < 0.4 ? (p - 0.3) / 0.1 : p < 0.63 ? 1 : p < 0.73 ? 1 + (p - 0.63) / 0.1 : 2
  }

  render(dt) {
    this.time += dt
    const t = this.time
    const p = this.progress
    const P = this.portrait
    // Camera keyframes per set: [position, look].
    const K = [
      [new THREE.Vector3(-4, 8, P ? 34 : 24), new THREE.Vector3(2, 9, 0)],
      [new THREE.Vector3(5, 5.5, -70 + (P ? 22 : 15)), new THREE.Vector3(-1, 5.2, -70)],
      [new THREE.Vector3(3.5, 5.2, -240 + (P ? 13 : 9)), new THREE.Vector3(-0.3, 2.4, -240)],
    ]
    const a = this.act()
    const i = Math.min(1, Math.floor(a))
    const f = a - i
    const e = f * f * (3 - 2 * f)
    const pos = K[i][0].clone().lerp(K[i + 1][0], e)
    const look = K[i][1].clone().lerp(K[i + 1][1], e)
    // The flight from the banner passes right through it, rising a little.
    if (a > 0 && a < 1) pos.y += Math.sin(f * Math.PI) * 3
    if (a > 1 && a < 2) pos.y += Math.sin(f * Math.PI) * 4
    // A slow push in while each set holds.
    const hold = p < 0.3 ? p / 0.3 : p > 0.4 && p < 0.63 ? (p - 0.4) / 0.23 : p > 0.73 ? (p - 0.73) / 0.27 : 0
    pos.lerp(look, hold * 0.12)
    pos.x += this.mouse.x * 0.8
    pos.y += this.mouse.y * 0.4
    this.camera.position.copy(pos)
    this.camera.lookAt(look)

    // Crimson: the gust picks up as the camera approaches, then it flies.
    this.clothU.uTime.value = t
    this.clothU.uGust.value = S(p, 0.2, 0.36) * 1.2
    this.cloth.visible = this.camera.position.z > this.cloth.position.z - 1
    // Tiger: roars every few seconds while it is in view.
    if (this.tiger.ready) {
      // Alive on its crag: it paces across the top, turns, stops facing out
      // and roars, then paces back. Animated all the time (not only when in
      // view), so it never snaps into a pose as it appears.
      const C = 9 // seconds per cycle
      const c = (t % C) / C
      // 0-0.32 walk right, 0.32-0.5 stand and roar, 0.5-0.82 walk left, 0.82-1 roar.
      const walkR = S(c, 0, 0.32)
      const walkL = S(c, 0.5, 0.82)
      const x = -2.4 + 4.8 * walkR - 4.8 * walkL
      const moving = (c < 0.32 || (c > 0.5 && c < 0.82)) ? 1 : 0
      const dirX = c < 0.32 ? 1 : c > 0.5 && c < 0.82 ? -1 : 0
      const out = new THREE.Vector3(dirX * 0.9, 0, dirX ? 0.45 : 1).normalize()
      const roarK = Math.max(S(c, 0.36, 0.4) * (1 - S(c, 0.46, 0.5)), S(c, 0.86, 0.9) * (1 - S(c, 0.96, 1)))
      const pos = this.tigerAt.clone().add(new THREE.Vector3(x, 3.4, 0))
      this.tiger.update(dt, pos, out, moving ? 1.3 : 0, roarK * 0.9)
      this.tiger.group.visible = a > 0.4 && a < 1.7
    }
    const ep = this.embers.geometry.attributes.position
    for (let k = 0; k < ep.count; k++) ep.setY(k, (ep.getY(k) + dt * (0.8 + (k % 7) * 0.25)) % 20)
    ep.needsUpdate = true
    // Makgeolli: the kettle tips, the stream runs, the bowl fills.
    const pour = S(p, 0.76, 0.86)
    this.kettle.rotation.z = -0.3 - pour * 0.5
    this.kettle.updateMatrixWorld()
    const spout = new THREE.Vector3(1.45 + 0.8, 1.0 + 0.55, 0).applyMatrix4(this.kettle.matrixWorld)
    const fill = S(p, 0.8, 1)
    this.milkU.uFill.value = fill
    // The surface rises inside the bowl, as wide as the bowl is at that height.
    const hy = 0.2 + fill * 0.75
    const r = hy < 0.56 ? 0.5 + ((hy - 0.14) / 0.42) * 0.48 : 0.98 + ((hy - 0.56) / 0.48) * 0.26
    this.milk.position.copy(this.milkBase).add(new THREE.Vector3(0, hy - 0.17, 0))
    this.milk.scale.setScalar((r / 1.2) * 0.96)
    const dst = this.milk.position.clone()
    const len = Math.max(0.01, spout.distanceTo(dst))
    this.stream.position.copy(spout).lerp(dst, 0.5)
    this.stream.scale.set(1, len, 1)
    this.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spout.clone().sub(dst).normalize())
    this.streamU.uTime.value = t
    this.streamU.uOn.value = S(p, 0.78, 0.82)
    this.stream.visible = this.streamU.uOn.value > 0.01
    this.milkU.uTime.value = t
    this.bloom.strength = 0.25 + (a > 0.5 && a < 1.5 ? 0.15 : 0)
    this.composer.render()
  }
}
