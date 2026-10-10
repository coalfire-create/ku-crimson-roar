import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The campus drawn like an anime background: a painted sky with towering
// clouds, ink outlines round every shape, light that falls in a few flat
// bands, and the campus full of students walking between classes and
// sitting out on the lawns.

/* ---------- sky ---------- */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // On the far plane, but a hair inside it: exactly at it, Safari clips the
    // sky away and the page behind shows through.
    gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uNight, uTime;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
  void main(){
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    float sunAmt = max(dot(d, normalize(uSun)), 0.0);
    // Day: deep blue overhead to a pale, almost white horizon. Dusk: violet
    // overhead, a band of orange and pink along the horizon toward the sun.
    vec3 dayTop = vec3(0.12, 0.36, 0.78), dayHor = vec3(0.72, 0.86, 0.96);
    // Night: deep indigo overhead, a faint warm city glow along the horizon.
    vec3 duskTop = vec3(0.02, 0.035, 0.12), duskHor = mix(vec3(0.12, 0.12, 0.28), vec3(0.34, 0.2, 0.3), smoothstep(0.12, 0.0, h));
    vec3 top = mix(dayTop, duskTop, uNight), hor = mix(dayHor, duskHor, uNight);
    vec3 col = mix(hor, top, pow(smoothstep(0.0, 0.7, h), 0.7));
    col += vec3(1.0, 0.75, 0.45) * pow(sunAmt, 6.0) * 0.25 * (1.0 - uNight);
    // The moon: a crisp disc with a soft halo.
    col += vec3(0.55, 0.62, 0.9) * pow(sunAmt, 60.0) * 0.35 * uNight;
    // Cumulus on a high plane: crisp-edged, lit cream on top and shaded
    // lavender underneath, the way background painters do them.
    vec2 p = d.xz / max(d.y, 0.08) * 0.32 + vec2(uTime * 0.003, 0.0);
    float c = fbm(p) * 0.8 + fbm(p * 3.1) * 0.2;
    float body = smoothstep(0.54, 0.58, c) * smoothstep(0.03, 0.2, d.y);
    // Lit where the cloud thins toward the sun, shaded where it thickens away.
    vec2 toSun = normalize(uSun.xz + 0.0001) * 0.06;
    float c2 = fbm(p + toSun) * 0.8 + fbm((p + toSun) * 3.1) * 0.2;
    float lit = step(c2, c + 0.012);
    vec3 cLit = mix(vec3(1.0, 1.0, 0.98), vec3(0.42, 0.47, 0.7), uNight);
    vec3 cShade = mix(vec3(0.74, 0.8, 0.93), vec3(0.1, 0.11, 0.24), uNight);
    vec3 cloud = mix(cShade, cLit, lit);
    col = mix(col, cloud, body * mix(0.95, 0.75, uNight));
    float moon = smoothstep(0.9990, 0.9993, sunAmt) * uNight;
    col = mix(col, vec3(1.0, 0.97, 0.86), moon);
    // Stars come out overhead as it gets dark.
    vec3 q = floor(d * 380.0);
    float r = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float s = step(0.9965, r) * (0.55 + 0.45 * sin(uTime * (1.5 + r * 40.0) + r * 300.0));
    col += s * smoothstep(0.08, 0.4, h) * smoothstep(0.6, 1.0, uNight) * (1.0 - body) * (1.0 - moon);
    gl_FragColor = vec4(col, 1.0);
  }
`

export class AnimeSky {
  constructor(scene) {
    this.uniforms = { uSun: { value: new THREE.Vector3(0, 0.2, -1) }, uNight: { value: 0 }, uTime: { value: 0 } }
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 48, 24),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
    )
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }
  update(dt, camera, sunDir, night) {
    this.uniforms.uTime.value += dt
    this.uniforms.uSun.value.copy(sunDir)
    this.uniforms.uNight.value = night
    this.mesh.position.copy(camera.position)
  }
}

/* ---------- ink outlines and flat light (post) ---------- */

// Outlines from the depth buffer: silhouettes where depth jumps, creases
// where it bends (wall corners, roof ridges, kerbs). They fade out with
// distance so the far city stays soft. Then the light is gently posterised
// into a few flat bands and the colour pushed, like a cel.
const INK = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 1 }, uFar: { value: 1000 }, uInk: { value: 1 }, uReach: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform vec2 uRes;
    uniform float uNear, uFar, uInk, uReach;
    varying vec2 vUv;
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - z * (uFar - uNear)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float z = texture2D(tDepth, vUv).x;
      if (z < 0.99999) {
        vec2 px = 1.5 / uRes;
        float d = lin(vUv);
        float l = lin(vUv - vec2(px.x, 0.0)), r = lin(vUv + vec2(px.x, 0.0));
        float u = lin(vUv + vec2(0.0, px.y)), b = lin(vUv - vec2(0.0, px.y));
        float sil = max(max(l - d, r - d), max(u - d, b - d)) / d;
        float lap = abs(l + r + u + b - 4.0 * d) / d;
        // Creases only where the surface really bends (not every leaf card).
        float e = max(smoothstep(0.03, 0.09, sil), smoothstep(0.03, 0.08, lap));
        // Outlines fade with distance; from afar (uReach) they carry further.
        e *= 1.0 - smoothstep(320.0 * uReach, 900.0 * uReach, d);
        // Cel light: luminance eased toward three flat steps, hue kept.
        float L = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float q = L * 3.0;
        float band = (floor(q) + smoothstep(0.35, 0.65, fract(q))) / 3.0;
        c.rgb *= mix(1.0, band / max(L, 1e-4), 0.25);
        // Lines in warm sepia, like an illustrated book, not hard black.
        c.rgb = mix(c.rgb, c.rgb * 0.35 + vec3(0.09, 0.05, 0.035), e * uInk * 0.7);
      }
      // Anime colour: richer and a touch brighter in the mid-tones.
      float l2 = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l2), c.rgb, 1.12), 0.0);
      gl_FragColor = c;
    }
  `,
}

// Kuwahara filter: each pixel takes the mean of whichever of its four
// neighbouring squares is most even in colour. Textures melt into flat
// brushed patches while edges stay sharp: a hand-painted background.
export const PAINT = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: INK.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main(){
      vec2 px = 1.0 / uRes;
      vec3 m[4]; vec3 s[4];
      for (int k = 0; k < 4; k++){ m[k] = vec3(0.0); s[k] = vec3(0.0); }
      for (int j = -2; j <= 2; j++)
        for (int i = -2; i <= 2; i++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px).rgb;
          vec3 c2 = c * c;
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
          if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
          if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
          if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
        }
      float best = 1e9;
      vec3 outc = vec3(0.0);
      for (int k = 0; k < 4; k++) {
        vec3 mu = m[k] / 9.0;
        vec3 v = abs(s[k] / 9.0 - mu * mu);
        float vv = v.r + v.g + v.b;
        if (vv < best) { best = vv; outc = mu; }
      }
      gl_FragColor = vec4(outc, texture2D(tDiffuse, vUv).a);
    }
  `,
}

export class PaintPass extends ShaderPass {
  constructor() {
    super(PAINT)
  }
  setSize(w, h) {
    this.uniforms.uRes.value.set(w, h)
  }
}

// The scene pass, remembering which target it drew into (the composer
// ping-pongs two), so the ink can read that frame's depth later in the chain.
export class DepthRenderPass extends RenderPass {
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    this.target = readBuffer
    super.render(renderer, writeBuffer, readBuffer, dt, mask)
  }
}

export class InkPass extends ShaderPass {
  constructor(camera, scenePass) {
    super(INK)
    this.cam = camera
    this.scenePass = scenePass
  }
  setSize(w, h) {
    this.uniforms.uRes.value.set(w, h)
  }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    // The depth of the target the scene was rendered into this frame.
    this.uniforms.tDepth.value = (this.scenePass?.target ?? readBuffer).depthTexture
    this.uniforms.uNear.value = this.cam.near
    this.uniforms.uFar.value = this.cam.far
    super.render(renderer, writeBuffer, readBuffer, dt, mask)
  }
}

/* ---------- students ---------- */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
// What students wear: plenty of 고려대 crimson, then the usual campus mix.
const TOPS = ['#a3172e', '#a3172e', '#b8202f', '#f2efe8', '#f2efe8', '#25232a', '#2c3a5c', '#d9c4a0', '#8fb8de', '#e8c35a', '#6e8f5a', '#c7c9cc']
const PANTS = ['#3d5679', '#3d5679', '#2a3550', '#222226', '#c8b590', '#77777e', '#e9e4da', '#4a4038']
const HAIR = ['#1b1512', '#1b1512', '#2b1d16', '#3e2a1c', '#5a3c26', '#8a6440']
const SKIN = ['#f1d2b6', '#ecc7a6', '#e2b894', '#f5dcc4']
const BAGS = ['#1e1e22', '#2a2a30', '#5a1a24', '#3a4a5e', '#7a6a58', '#c9c2b4']

// One person, about 1.7 m, built from parts. Each vertex carries which part
// it belongs to (body, left/right thigh, shin, arm) so the vertex shader can
// swing the joints, and which colour slot it takes (top, trousers, skin,
// hair, shoe, bag, legs) so every instance can be dressed differently.
function personGeometry(long) {
  const parts = []
  const add = (geo, part, slot) => {
    geo = geo.index ? geo.toNonIndexed() : geo
    geo.deleteAttribute('uv')
    const n = geo.attributes.position.count
    geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1))
    geo.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1))
    parts.push(geo)
  }
  const T = 0, P = 1, SK = 2, H = 3, SH = 4, B = 5, LG = 6
  // Body: hips, torso, neck, head, hair, bag.
  add(new THREE.CapsuleGeometry(0.14, 0.06, 4, 10).scale(1, 1, 0.72).translate(0, 0.93, 0), 0, long ? T : P)
  add(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12).scale(1.08, 1, 0.66).translate(0, 1.2, 0), 0, T)
  add(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 8).translate(0, 1.47, 0), 0, SK)
  add(new THREE.SphereGeometry(0.105, 14, 10).scale(0.9, 1.06, 0.96).translate(0, 1.6, 0), 0, SK)
  const hairCap = new THREE.SphereGeometry(0.113, 14, 10, 0, Math.PI * 2, 0, Math.PI * (long ? 0.6 : 0.5))
  hairCap.rotateX(-0.5).translate(0, 1.62, -0.012)
  add(hairCap, 0, H)
  if (long) add(new THREE.CapsuleGeometry(0.09, 0.2, 4, 8).scale(1.1, 1, 0.5).translate(0, 1.5, -0.07), 0, H)
  add(new THREE.BoxGeometry(0.28, 0.36, 0.13).translate(0, 1.2, -0.15), 0, B)
  // A skirt for some: a short flare from the waist.
  if (long) add(new THREE.CylinderGeometry(0.15, 0.24, 0.36, 12, 1, true).scale(1, 1, 0.8).translate(0, 0.78, 0), 0, P)
  // Legs: thigh (1, 3), shin with shoe (2, 4).
  for (const [s, thigh, shin] of [[-1, 1, 2], [1, 3, 4]]) {
    add(new THREE.CylinderGeometry(0.07, 0.056, 0.44, 8).translate(s * 0.085, 0.7, 0), thigh, LG)
    add(new THREE.CylinderGeometry(0.052, 0.042, 0.42, 8).translate(s * 0.085, 0.27, 0), shin, LG)
    add(new THREE.BoxGeometry(0.095, 0.07, 0.22).translate(s * 0.085, 0.035, 0.035), shin, SH)
  }
  // Arms (5, 6): sleeve, forearm, hand.
  for (const [s, arm] of [[-1, 5], [1, 6]]) {
    add(new THREE.CylinderGeometry(0.052, 0.045, 0.3, 8).translate(s * 0.215, 1.27, 0), arm, T)
    add(new THREE.CylinderGeometry(0.04, 0.034, 0.26, 8).translate(s * 0.225, 0.99, 0.01), arm, SK)
    add(new THREE.SphereGeometry(0.042, 8, 6).scale(0.8, 1.2, 0.7).translate(s * 0.228, 0.83, 0.015), arm, SK)
  }
  return mergeGeometries(parts)
}

const PERSON_VERT_HEAD = /* glsl */ `
  attribute float aPart, aSlot;
  attribute vec3 iTop, iPants, iHair, iBag, iLeg, iSkin, iAnim;
  uniform float uTime;
  varying vec3 vCol;
  vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
  // Swing the joints: a walk cycle, or seated on the grass.
  vec3 pose(vec3 p, bool dir){
    float ph = uTime * 5.6 + iAnim.x;
    float walk = iAnim.y, sit = iAnim.z;
    float sw = sin(ph);
    float leg = aPart < 2.5 ? 1.0 : -1.0;
    float hipF = mix(sw * 0.42 * leg * walk, 1.45, sit);
    float knee = mix(max(0.0, cos(ph + (leg > 0.0 ? 0.0 : 3.14159))) * 0.75 * walk, 0.35, sit);
    vec3 hip = dir ? vec3(0.0) : vec3(0.0, 0.92, 0.0);
    vec3 kn = dir ? vec3(0.0) : vec3(0.0, 0.48, 0.0);
    vec3 sh = dir ? vec3(0.0) : vec3(0.0, 1.41, 0.0);
    if (aPart > 0.5 && aPart < 4.5) {
      if (aPart == 2.0 || aPart == 4.0) p = rotX(p - kn, knee) + kn;
      p = rotX(p - hip, -hipF) + hip;
    } else if (aPart > 4.5) {
      float arm = aPart < 5.5 ? -1.0 : 1.0;
      p = rotX(p - sh, -(sw * 0.38 * arm * walk + sit * 0.35)) + sh;
    } else if (!dir) {
      // A little rise and fall in the stride.
      p.y += abs(sw) * 0.025 * walk;
    }
    return p;
  }
`

// polylines: [[x, z], ...][]; clear(x, z): distance to the nearest wall.
export class Students {
  constructor(scene, { polylines, lawns, clear, groundAt, walkers = 700, sitters = 240, near = [], extra = 0 }) {
    this.groundAt = groundAt
    // Walk only on paths that never pass through a building.
    const lines = []
    for (const p of polylines) {
      if (p.length < 2) continue
      let ok = true
      const cum = [0]
      for (let i = 1; i < p.length && ok; i++) {
        const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
        for (let s = 0; s <= L; s += 2) {
          const f = L ? s / L : 0
          if (clear(p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f) < 2.2) ok = false
        }
        cum.push(cum[i - 1] + L)
      }
      if (ok && cum[cum.length - 1] > 15) lines.push({ p, cum, len: cum[cum.length - 1] })
    }
    const total = lines.reduce((a, l) => a + l.len, 0)
    const lineAt = () => {
      let r = Math.random() * total
      for (const l of lines) if ((r -= l.len) <= 0) return l
      return lines[lines.length - 1]
    }
    this.walkers = []
    if (lines.length)
      for (let i = 0; i < walkers; i++) {
        const line = lineAt()
        this.walkers.push({ line, s: Math.random() * line.len, v: (1.0 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), side: (Math.random() - 0.5) * 2.2, ph: Math.random() * 6.28 })
      }
    // More people where the film looks: on the paths near each landmark.
    const hot = lines.filter((l) => l.p.some(([x, z]) => near.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 55)))
    if (hot.length)
      for (let i = 0; i < extra; i++) {
        const line = pick(hot)
        // Start on the stretch nearest a landmark.
        let s0 = Math.random() * line.len
        for (let k = 0; k < line.p.length; k++) {
          const [x, z] = line.p[k]
          if (near.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 55)) {
            s0 = line.cum[k] + (Math.random() - 0.5) * 20
            break
          }
        }
        this.walkers.push({ line, s: Math.min(line.len, Math.max(0, s0)), v: (0.9 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), side: (Math.random() - 0.5) * 2.4, ph: Math.random() * 6.28 })
      }
    // Friends in pairs now and then: a second walker just beside the first.
    for (let i = 0; i < this.walkers.length; i += 5) {
      const a = this.walkers[i]
      const b = this.walkers[i + 1]
      if (b) Object.assign(b, { line: a.line, s: a.s, v: a.v, side: a.side + (a.side > 0 ? -0.7 : 0.7) })
    }
    // Groups sitting out on the lawns, facing each other.
    this.sitters = []
    for (let tries = 0; this.sitters.length < sitters && tries < sitters * 30; tries++) {
      const lawn = pick(lawns)
      const [x0, x1, z0, z1] = lawn.box
      const cx = x0 + Math.random() * (x1 - x0)
      const cz = z0 + Math.random() * (z1 - z0)
      if (!lawn.inside(cx, cz) || clear(cx, cz) < 5) continue
      const n = 2 + Math.floor(Math.random() * 4)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.4
        const x = cx + Math.cos(a) * 1.3
        const z = cz + Math.sin(a) * 1.3
        this.sitters.push({ x, z, yaw: Math.atan2(cx - x, cz - z) })
      }
    }

    // Two builds of figure (short hair and trousers; long hair and a skirt),
    // each one instanced mesh with its own clothes per instance.
    const S = 1.08
    this.uTime = { value: 0 }
    const people = [...this.walkers.map((w) => ({ w })), ...this.sitters.map((st) => ({ st }))]
    for (const p of people) p.long = Math.random() < 0.45
    this.meshes = [false, true].map((long) => {
      const list = people.filter((p) => p.long === long)
      const geo = personGeometry(long)
      const n = list.length
      const attr = (k) => new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
      const A = { iTop: attr(), iPants: attr(), iHair: attr(), iBag: attr(), iLeg: attr(), iSkin: attr(), iAnim: attr() }
      const c = new THREE.Color()
      list.forEach((p, i) => {
        p.mesh = long ? 1 : 0
        p.i = i
        const pants = c.set(pick(PANTS)).toArray()
        const skin = new THREE.Color(pick(SKIN)).toArray()
        A.iTop.setXYZ(i, ...c.set(pick(TOPS)).toArray())
        A.iPants.setXYZ(i, ...pants)
        A.iHair.setXYZ(i, ...c.set(pick(HAIR)).toArray())
        A.iBag.setXYZ(i, ...c.set(pick(BAGS)).toArray())
        A.iSkin.setXYZ(i, ...skin)
        // Bare legs under a skirt, trousers otherwise.
        A.iLeg.setXYZ(i, ...(long ? (Math.random() < 0.5 ? skin : c.set('#222226').toArray()) : pants))
        A.iAnim.setXYZ(i, p.w ? p.w.ph : 0, p.w ? 1 : 0, p.w ? 0 : 1)
      })
      for (const [k, v] of Object.entries(A)) geo.setAttribute(k, v)
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 })
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime
        sh.vertexShader = PERSON_VERT_HEAD + sh.vertexShader
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = pose(objectNormal, true);')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            transformed = pose(transformed, false);
            vCol = aSlot < 0.5 ? iTop : aSlot < 1.5 ? iPants : aSlot < 2.5 ? iSkin : aSlot < 3.5 ? iHair : aSlot < 4.5 ? vec3(0.9, 0.9, 0.88) * (0.25 + 0.75 * step(0.5, fract(iAnim.x * 3.7))) : aSlot < 5.5 ? iBag : iLeg;`,
          )
        sh.fragmentShader = 'varying vec3 vCol;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCol, opacity );')
      }
      mat.customProgramCacheKey = () => 'ku-person-1'
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n))
      m.count = n
      m.frustumCulled = false
      scene.add(m)
      return m
    })
    this.people = people
    this.scale = S
    this.m = new THREE.Matrix4()
    this.q = new THREE.Quaternion()
    this.up = new THREE.Vector3(0, 1, 0)
    this.pos = new THREE.Vector3()
    this.scl = new THREE.Vector3()
    // Sitters never move: place them once, down on the grass.
    for (const p of people) if (p.st) this.#place(p, p.st.x, groundAt(p.st.x, p.st.z) - 0.8 * S, p.st.z, p.st.yaw)
    this.time = 0
  }

  #place(p, x, y, z, yaw) {
    this.q.setFromAxisAngle(this.up, yaw)
    this.m.compose(this.pos.set(x, y, z), this.q, this.scl.setScalar(this.scale))
    this.meshes[p.mesh].setMatrixAt(p.i, this.m)
  }

  // avoid: a point (the tiger) that walkers step aside for.
  update(dt, avoid = null) {
    this.time += dt
    this.uTime.value = this.time
    for (const p of this.people) {
      const w = p.w
      if (!w) continue
      const { line } = w
      w.s += w.v * dt
      if (w.s < 0 || w.s > line.len) ((w.v = -w.v), (w.s = Math.min(line.len, Math.max(0, w.s))))
      let k = 1
      while (k < line.cum.length - 1 && line.cum[k] < w.s) k++
      const a = line.p[k - 1]
      const b = line.p[k]
      const L = line.cum[k] - line.cum[k - 1] || 1
      const f = (w.s - line.cum[k - 1]) / L
      const dx = (b[0] - a[0]) / L
      const dz = (b[1] - a[1]) / L
      // Keep to one side of the path, facing the way they walk.
      let x = a[0] + (b[0] - a[0]) * f - dz * w.side
      let z = a[1] + (b[1] - a[1]) * f + dx * w.side
      if (avoid) {
        const ax = x - avoid.x
        const az = z - avoid.z
        const r = Math.hypot(ax, az)
        if (r < 5 && r > 1e-3) ((x = avoid.x + (ax / r) * 5), (z = avoid.z + (az / r) * 5))
      }
      const dir = Math.sign(w.v)
      this.#place(p, x, this.groundAt(x, z), z, Math.atan2(dx * dir, dz * dir))
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true
  }
}
