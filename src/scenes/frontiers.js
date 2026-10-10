import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// Frontiers: three fields only 고려대 leads in, one after another as the
// visitor scrolls (progress 0..1, a third each).
//  1. 사이버국방 — a lattice cube of light (the cyber matrix), code raining
//     past it, attacks streaking in from the dark and bursting on its shield.
//  2. 반도체 — a silicon wafer, iridescent like the real thing, with light
//     racing along its circuits and a memory stack rising from the middle.
//  3. KUBS 스타트업 — an idea lands as a spark, a city of lit glass towers
//     ripples out from it, links of light join them, and a rocket lifts off.

const TAU = Math.PI * 2
const S = THREE.MathUtils.smoothstep

// Glyph sheet for the code rain: hex digits and a few symbols, 8 x 8.
function glyphAtlas() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, 0, 512, 512)
  g.fillStyle = '#fff'
  g.font = 'bold 44px "JetBrains Mono", monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const chars = '0123456789ABCDEF<>/{}[]#$%&*+=?;:01高麗KUSECAI'
  for (let i = 0; i < 64; i++) g.fillText(chars[i % chars.length], (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

/* ---------- 1. cyber matrix ---------- */
function buildCyber() {
  const g = new THREE.Group()
  const N = 9
  const step = 0.42
  const cells = []
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++)
      for (let z = 0; z < N; z++) {
        const shell = x === 0 || y === 0 || z === 0 || x === N - 1 || y === N - 1 || z === N - 1
        if (shell || Math.random() < 0.08) cells.push(new THREE.Vector3(x - (N - 1) / 2, y - (N - 1) / 2, z - (N - 1) / 2).multiplyScalar(step))
      }
  const vox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), new THREE.MeshBasicMaterial({ toneMapped: false }), cells.length)
  const seed = cells.map(() => Math.random())
  g.add(vox)
  // Outer frame of the cube.
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(N * step + 0.3, N * step + 0.3, N * step + 0.3)), new THREE.LineBasicMaterial({ color: '#7ff6ff', toneMapped: false }))
  g.add(frame)
  // Shield: a geodesic shell round it.
  const shield = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.6, 2)), new THREE.LineBasicMaterial({ color: '#2a8cff', transparent: true, opacity: 0.22, toneMapped: false }))
  g.add(shield)
  // Code rain round the cube.
  const RN = 2600
  const rp = new Float32Array(RN * 3)
  const rs = new Float32Array(RN * 2)
  for (let i = 0; i < RN; i++) {
    const a = Math.random() * TAU
    const r = 4.2 + Math.random() * 7
    rp.set([Math.cos(a) * r, Math.random() * 14 - 7, Math.sin(a) * r - 2], i * 3)
    rs.set([Math.floor(Math.random() * 64), Math.random()], i * 2)
  }
  const rg = new THREE.BufferGeometry()
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3))
  rg.setAttribute('aG', new THREE.BufferAttribute(rs, 2))
  const rainU = { uTime: { value: 0 }, uAtlas: { value: glyphAtlas() }, uPx: { value: 1 } }
  const rain = new THREE.Points(
    rg,
    new THREE.ShaderMaterial({
      uniforms: rainU,
      vertexShader: `attribute vec2 aG; uniform float uTime, uPx; varying float vG; varying float vA;
        void main(){ vec3 p = position; float sp = 1.5 + aG.y * 2.5;
          p.y = mod(p.y - uTime * sp + 7.0, 14.0) - 7.0;
          vG = floor(mod(aG.x + floor(uTime * (2.0 + aG.y * 6.0)), 64.0));
          vA = smoothstep(7.0, 4.0, abs(p.y)) * (0.35 + aG.y * 0.65);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * 14.0 / -mv.z * 10.0; }`,
      fragmentShader: `uniform sampler2D uAtlas; varying float vG; varying float vA;
        void main(){ vec2 cell = vec2(mod(vG, 8.0), 7.0 - floor(vG / 8.0));
          float m = texture2D(uAtlas, (cell + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / 8.0).r;
          gl_FragColor = vec4(mix(vec3(0.2, 1.0, 0.75), vec3(0.85, 1.0, 1.0), m * vA) * m * vA * 0.7, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  rain.frustumCulled = false
  g.add(rain)
  // Attacks: crimson bolts from the dark, stopped dead at the shield.
  const AN = 26
  const bolts = []
  const boltGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6)
  boltGeo.rotateX(Math.PI / 2)
  for (let i = 0; i < AN; i++) {
    const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: '#ff2e4d', toneMapped: false, transparent: true }))
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd0d6', toneMapped: false, transparent: true }))
    g.add(m, flash)
    bolts.push({ m, flash, dir: new THREE.Vector3().randomDirection(), t: Math.random() * 3, speed: 5 + Math.random() * 5 })
  }
  const col = new THREE.Color()
  const mat = new THREE.Matrix4()
  return {
    group: g,
    update(t, l) {
      g.rotation.y = t * 0.18 + l * 1.6
      g.rotation.x = Math.sin(t * 0.2) * 0.25 + 0.35
      // A scan plane sweeps the cube; voxels it touches light up cyan, a few
      // flicker crimson (threats found and isolated).
      const scan = Math.sin(t * 1.1) * 2.2
      const open = S(l, 0.35, 0.6) * (1 - S(l, 0.8, 0.95))
      cells.forEach((c, i) => {
        const near = Math.exp(-((c.y - scan) ** 2) * 6)
        const alert = seed[i] > 0.97 && Math.sin(t * 7 + seed[i] * 40) > 0.6
        col.setRGB(0.02 + near * 0.35, 0.12 + near * 0.9, 0.22 + near * 1.0)
        if (alert) col.setRGB(1.4, 0.12, 0.22)
        vox.setColorAt(i, col)
        // Mid-chapter the cube opens into layers, then locks shut again.
        const off = c.clone().multiplyScalar(open * 0.35 * (1 + Math.sin(c.y * 3 + t) * 0.2))
        mat.makeTranslation(c.x + off.x, c.y + off.y, c.z + off.z)
        vox.setMatrixAt(i, mat)
      })
      vox.instanceColor.needsUpdate = true
      vox.instanceMatrix.needsUpdate = true
      shield.rotation.y = -t * 0.1
      rainU.uTime.value = t
      for (const b of bolts) {
        b.t += 1 / 60
        const d = 16 - b.t * b.speed
        if (d < 3.6) {
          // Hit the shield: a burst, then a new attack from somewhere else.
          const k = (3.6 - d) / 1.2
          b.m.visible = false
          b.flash.visible = k < 1
          b.flash.position.copy(b.dir).multiplyScalar(3.6)
          b.flash.scale.setScalar(0.5 + k * 2)
          b.flash.material.opacity = 1 - k
          if (k >= 1) ((b.t = 0), b.dir.randomDirection(), (b.speed = 5 + Math.random() * 5))
        } else {
          b.m.visible = true
          b.flash.visible = false
          b.m.position.copy(b.dir).multiplyScalar(d)
          b.m.lookAt(0, 0, 0)
        }
      }
    },
  }
}

/* ---------- 2. silicon wafer ---------- */
function buildWafer() {
  const g = new THREE.Group()
  const R = 4.2
  // The wafer: a die grid etched in, thin-film colours shifting with the
  // angle of view, the flat at the bottom edge.
  const waferU = { uTime: { value: 0 } }
  const wafer = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.08, 128),
    new THREE.ShaderMaterial({
      uniforms: waferU,
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vW;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float ndv = abs(dot(normalize(vN), V));
          vec2 d = vP.xz / 0.42;
          vec2 f = abs(fract(d) - 0.5);
          float street = smoothstep(0.44, 0.48, max(f.x, f.y));
          // Thin-film interference: hue cycles with path length through the film.
          float film = ndv * 3.2 + length(vP.xz) * 0.35 + uTime * 0.05;
          vec3 irid = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
          vec3 die = mix(vec3(0.16, 0.17, 0.22), irid * 0.9, 0.55 + 0.25 * sin(floor(d.x) * 1.7 + floor(d.y) * 2.3));
          vec3 c = mix(die * 0.5, vec3(0.42, 0.44, 0.5), street);
          c += pow(1.0 - ndv, 3.0) * 0.18;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  )
  g.add(wafer)
  // Circuits: Manhattan traces along the die streets, light racing down them.
  const pos = []
  const along = []
  const idx = []
  let vi = 0
  const W = 0.035
  for (let p = 0; p < 90; p++) {
    let x = (Math.random() * 2 - 1) * R * 0.75
    let z = (Math.random() * 2 - 1) * R * 0.75
    x = Math.round(x / 0.42) * 0.42
    z = Math.round(z / 0.42) * 0.42
    let len = 0
    const off = Math.random() * 10
    for (let s = 0; s < 6; s++) {
      const horiz = s % 2 === 0
      const n = (1 + Math.floor(Math.random() * 4)) * 0.42 * (Math.random() < 0.5 ? -1 : 1)
      const x2 = horiz ? x + n : x
      const z2 = horiz ? z : z + n
      if (Math.hypot(x2, z2) > R * 0.92) break
      const nx = horiz ? 0 : W
      const nz = horiz ? W : 0
      const L = Math.abs(n)
      pos.push(x - nx, 0.06, z - nz, x + nx, 0.06, z + nz, x2 - nx, 0.06, z2 - nz, x2 + nx, 0.06, z2 + nz)
      along.push(off + len, off + len, off + len + L, off + len + L)
      idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2)
      vi += 4
      len += L
      x = x2
      z = z2
    }
  }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  cg.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
  cg.setIndex(idx)
  const traceU = { uTime: { value: 0 }, uFlow: { value: 1 } }
  const traces = new THREE.Mesh(
    cg,
    new THREE.ShaderMaterial({
      uniforms: traceU,
      vertexShader: `attribute float aAlong; varying float vA; void main(){ vA = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uFlow; varying float vA;
        void main(){
          float head = fract(vA * 0.22 - uTime * 0.9);
          float pulse = pow(smoothstep(0.0, 1.0, head), 18.0);
          vec3 base = vec3(0.85, 0.6, 0.18) * 0.6;
          vec3 c = base + mix(vec3(1.0, 0.75, 0.3), vec3(0.6, 0.95, 1.0), step(0.5, fract(vA * 0.07))) * pulse * 4.0 * uFlow;
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  g.add(traces)
  // A stack of memory dies rising from the centre, edges lit.
  const stack = new THREE.Group()
  for (let i = 0; i < 8; i++) {
    const die = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.8), new THREE.MeshStandardMaterial({ color: '#2b2f3a', metalness: 0.6, roughness: 0.3, emissive: '#1a2a4a', emissiveIntensity: 0.4 }))
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(die.geometry), new THREE.LineBasicMaterial({ color: '#8fd8ff', toneMapped: false }))
    die.add(edge)
    die.userData.i = i
    stack.add(die)
  }
  g.add(stack)
  return {
    group: g,
    update(t, l) {
      g.rotation.y = t * 0.06 + l * 0.9
      g.rotation.x = THREE.MathUtils.lerp(0.95, 0.35, S(l, 0, 0.7))
      waferU.uTime.value = t
      traceU.uTime.value = t
      traceU.uFlow.value = 0.4 + S(l, 0.05, 0.4) * 0.6
      // The stack assembles die by die, then hovers.
      stack.children.forEach((d) => {
        const k = S(l, 0.3 + d.userData.i * 0.04, 0.45 + d.userData.i * 0.04)
        d.position.y = 0.15 + d.userData.i * 0.12 * k + (1 - k) * 3 + Math.sin(t * 1.4) * 0.03
        d.rotation.y = (1 - k) * 2
        d.visible = k > 0.01
      })
    },
  }
}

/* ---------- 3. KUBS startups ---------- */
// An idea becomes a company: a spark of light falls to the grid, and where it
// lands a city of glass towers ripples outward, their windows lighting floor
// by floor; links of light join the tallest; then a rocket lifts off from the
// centre on a column of flame and climbs away.
function buildStartups() {
  const g = new THREE.Group()
  const G = 13
  const bars = []
  const geo = new THREE.BoxGeometry(0.36, 1, 0.36)
  geo.translate(0, 0.5, 0)
  // Glass towers: windows tiled in world space so every height reads as
  // floors, lit from the ground up as the tower grows.
  const towerU = { uLit: { value: 0 } }
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.25 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLit = towerU.uLit
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wq = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vW = wq.xyz; vN = normal;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN; uniform float uLit;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float side = 1.0 - step(0.5, abs(vN.y));
          vec2 c = vec2((vN.x != 0.0 ? vW.z : vW.x) * 9.0, vW.y * 7.0);
          vec2 f = fract(c);
          float win = step(0.3, f.x) * step(f.x, 0.7) * step(0.35, f.y) * step(f.y, 0.75);
          float on = step(0.6, fract(sin(dot(floor(c), vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * win * on * side * uLit * 0.55;
        }`,
      )
  }
  const inst = new THREE.InstancedMesh(geo, mat, G * G)
  const col = new THREE.Color()
  for (let i = 0; i < G; i++)
    for (let j = 0; j < G; j++) {
      const x = (i - (G - 1) / 2) * 0.5
      const z = (j - (G - 1) / 2) * 0.5
      const r = Math.hypot(x, z)
      if (r < 1.3) {
        bars.push({ x, z, h: 0, d: r }) // the launch pad stays clear
        continue
      }
      // A skyline: tallest toward the middle, ragged at the edge.
      const h = 0.25 + Math.random() * 0.9 + Math.max(0, 3.4 - r) * (0.5 + Math.random() * 0.9)
      bars.push({ x, z, h: r > 3.4 && Math.random() < 0.35 ? 0 : h, d: r })
      inst.setColorAt(i * G + j, col.set(Math.random() < 0.15 ? '#d9b45a' : Math.random() < 0.45 ? '#8e1426' : '#3a3f52'))
    }
  g.add(inst)
  // Grid floor of light, and a glowing pad at the centre.
  const grid = new THREE.GridHelper(16, 32, '#ff3b55', '#3a1018')
  grid.material.transparent = true
  grid.material.opacity = 0.55
  g.add(grid)
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0, toneMapped: false }))
  pad.position.y = 0.01
  g.add(pad)
  // The ripple where the idea lands.
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  ripple.position.y = 0.02
  g.add(ripple)
  // The idea: a spark with a halo.
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false }))
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: (() => {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const x = c.getContext('2d')
        const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
        gr.addColorStop(0, 'rgba(255,230,170,1)')
        gr.addColorStop(0.3, 'rgba(255,170,90,0.5)')
        gr.addColorStop(1, 'rgba(255,120,60,0)')
        x.fillStyle = gr
        x.fillRect(0, 0, 64, 64)
        return new THREE.CanvasTexture(c)
      })(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  halo.scale.setScalar(2.2)
  spark.add(halo)
  g.add(spark)
  // Network: links between the tallest towers, pulses running along them.
  const tops = [...bars].filter((b) => b.h > 0).sort((a, b) => b.h - a.h).slice(0, 22)
  const lp = []
  const la = []
  for (let i = 0; i < tops.length; i++)
    for (let j = i + 1; j < tops.length; j++) {
      if (Math.random() > 0.16) continue
      const A = tops[i]
      const B = tops[j]
      const n = 24
      for (let k = 0; k < n; k++) {
        const f0 = k / n
        const f1 = (k + 1) / n
        const pt = (f) => [A.x + (B.x - A.x) * f, A.h + (B.h - A.h) * f + Math.sin(f * Math.PI) * 1.0, A.z + (B.z - A.z) * f]
        lp.push(...pt(f0), ...pt(f1))
        la.push(f0 + i * 0.37, f1 + i * 0.37)
      }
    }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
  lg.setAttribute('aA', new THREE.Float32BufferAttribute(la, 1))
  const linkU = { uTime: { value: 0 }, uGrow: { value: 0 } }
  const links = new THREE.LineSegments(
    lg,
    new THREE.ShaderMaterial({
      uniforms: linkU,
      vertexShader: `attribute float aA; uniform float uGrow; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position * vec3(1.0, uGrow, 1.0), 1.0); }`,
      fragmentShader: `uniform float uTime, uGrow; varying float vA;
        void main(){ float p = pow(fract(vA - uTime * 0.6), 10.0);
          gl_FragColor = vec4((vec3(1.0, 0.3, 0.4) * 0.3 + vec3(1.0, 0.85, 0.5) * p * 3.0) * uGrow, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  g.add(links)
  // The rocket: white body, crimson nose and fins, a porthole, a flame.
  const rocket = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: '#f4f1ec', metalness: 0.3, roughness: 0.35 })
  const crimson = new THREE.MeshStandardMaterial({ color: '#b5122a', metalness: 0.3, roughness: 0.4 })
  const body = new THREE.LatheGeometry(
    [[0, 0], [0.16, 0.02], [0.2, 0.2], [0.21, 0.6], [0.19, 0.9], [0.14, 1.1], [0.0, 1.12]].map(([r, y]) => new THREE.Vector2(r, y)),
    24,
  )
  rocket.add(new THREE.Mesh(body, white))
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.145, 0.32, 24), crimson)
  nose.position.y = 1.2
  rocket.add(nose)
  const port = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }))
  port.position.set(0, 0.75, 0.205)
  rocket.add(port)
  for (let k = 0; k < 3; k++) {
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.22, -0.12), new THREE.Vector2(0.22, 0.05), new THREE.Vector2(0, 0.35)]), { depth: 0.03, bevelEnabled: false }), crimson)
    fin.position.y = 0.05
    fin.rotation.y = (k / 3) * TAU
    const holder = new THREE.Group()
    fin.position.x = 0.17
    holder.add(fin)
    holder.rotation.y = (k / 3) * TAU
    rocket.add(holder)
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 16, 1, true).rotateX(Math.PI).translate(0, -0.35, 0), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  rocket.add(flame)
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 12, 1, true).rotateX(Math.PI).translate(0, -0.2, 0), new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  rocket.add(core)
  rocket.scale.setScalar(1.9)
  g.add(rocket)
  // Exhaust: smoke billowing at the pad, a glowing trail up the sky.
  const TN = 500
  const tp = new Float32Array(TN * 3)
  const tg = new THREE.BufferGeometry()
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3))
  const trail = new THREE.Points(tg, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  trail.frustumCulled = false
  g.add(trail)
  const SN = 260
  const smokeP = new Float32Array(SN * 3)
  const smokeS = Array.from({ length: SN }, () => ({ a: Math.random() * TAU, v: 0.4 + Math.random() * 1.2, ph: Math.random() }))
  const sgeo = new THREE.BufferGeometry()
  sgeo.setAttribute('position', new THREE.BufferAttribute(smokeP, 3))
  const smoke = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: '#c9b9b4', size: 0.45, transparent: true, opacity: 0, depthWrite: false }))
  smoke.frustumCulled = false
  g.add(smoke)
  const m = new THREE.Matrix4()
  return {
    group: g,
    update(t, l) {
      g.rotation.y = t * 0.06 + l * 1.0
      // 1. The idea falls and lands (0 - 0.18).
      const fall = S(l, 0.0, 0.18)
      spark.visible = l < 0.3
      spark.position.set(0, 6 * (1 - fall) + 0.25, 0)
      spark.scale.setScalar((1 + Math.sin(t * 6) * 0.08) * (1 - S(l, 0.2, 0.3)))
      const land = S(l, 0.16, 0.45)
      ripple.material.opacity = (1 - land) * (land > 0 ? 0.9 : 0)
      ripple.scale.setScalar(0.3 + land * 7)
      // 2. The city ripples outward from where it landed (0.16 - 0.6).
      bars.forEach((b, i) => {
        const k = S(land, b.d / 7, b.d / 7 + 0.3)
        m.makeScale(1, Math.max(0.001, b.h * k), 1).setPosition(b.x, 0, b.z)
        inst.setMatrixAt(i, m)
      })
      inst.instanceMatrix.needsUpdate = true
      towerU.uLit.value = S(l, 0.3, 0.6)
      // 3. Links of light (0.4 - 0.62).
      linkU.uTime.value = t
      linkU.uGrow.value = S(l, 0.4, 0.62)
      pad.material.opacity = S(l, 0.45, 0.55) * (0.6 + 0.4 * Math.sin(t * 8))
      // 4. Lift-off (0.55 - 1): a slow start, then away on a gentle arc.
      const lift = S(l, 0.55, 1)
      const climb = lift * lift * 10
      rocket.visible = l > 0.42
      rocket.position.set(Math.sin(lift * 2.2) * lift * 1.2, climb + 0.05, 0)
      rocket.rotation.z = -Math.cos(lift * 2.2) * lift * 0.35
      const fire = l > 0.52 ? 1 : 0
      flame.visible = core.visible = fire > 0
      flame.scale.set(1, 1 + Math.sin(t * 40) * 0.15 + lift * 1.2, 1)
      core.scale.set(1, 1 + Math.sin(t * 53) * 0.2, 1)
      for (let i = 0; i < TN; i++) {
        const f = (i / TN) * lift
        tp.set([Math.sin(f * 2.2) * f * 1.2, f * f * 10, 0], i * 3)
      }
      tg.attributes.position.needsUpdate = true
      trail.visible = lift > 0.01
      smoke.material.opacity = S(l, 0.52, 0.6) * (1 - S(l, 0.85, 1)) * 0.5
      smokeS.forEach((s, i) => {
        const age = (t * 0.5 + s.ph) % 1
        const r = age * s.v * 1.6
        smokeP.set([Math.cos(s.a) * r, 0.1 + age * 0.4, Math.sin(s.a) * r], i * 3)
      })
      sgeo.attributes.position.needsUpdate = true
    },
  }
}

export class Frontiers {
  constructor(canvas) {
    this.canvas = canvas
    const mobile = innerWidth < 760
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#05060c')
    this.scene.fog = new THREE.FogExp2('#05060c', 0.035)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    this.scene.add(new THREE.HemisphereLight('#8aa0ff', '#1a0610', 1.2))
    const key = new THREE.DirectionalLight('#ffffff', 2.4)
    key.position.set(4, 8, 6)
    this.scene.add(key)
    // A faint field of stars behind everything.
    const sp = new Float32Array(1500 * 3)
    for (let i = 0; i < 1500; i++) sp.set(new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40).toArray(), i * 3)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#9fb0ff', size: 0.12, fog: false })))

    this.chapters = [buildCyber(), buildWafer(), buildStartups()]
    for (const c of this.chapters) this.scene.add(c.group)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.35)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.progress = 0
    this.time = 0
    this.mouse = new THREE.Vector2()
    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1))
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  // Which chapter (0..2) and how far through it.
  chapter() {
    const c = THREE.MathUtils.clamp(this.progress, 0, 0.9999) * 3
    return { i: Math.floor(c), l: c - Math.floor(c) }
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.portrait = w / h < 0.8
    this.camera.updateProjectionMatrix()
  }

  render(dt) {
    this.time += dt
    const t = this.time
    const c = THREE.MathUtils.clamp(this.progress, 0, 0.9999) * 3
    // Each chapter grows in, holds, and shrinks away into the next; a flare
    // of bloom covers the hand-over.
    let flare = 0
    this.chapters.forEach((ch, i) => {
      const w = S(c, i - 0.12, i + 0.08) * (i === 2 ? 1 : 1 - S(c, i + 0.92, i + 1.12))
      ch.group.visible = w > 0.01
      if (!ch.group.visible) return
      ch.group.scale.setScalar(0.35 + 0.65 * w)
      ch.update(t, THREE.MathUtils.clamp(c - i, 0, 1))
      flare = Math.max(flare, 1 - Math.abs(w * 2 - 1))
    })
    this.bloom.strength = 0.45 + flare * 0.7
    // Camera: on the right of the copy (desktop), drifting with the pointer.
    const { l } = this.chapter()
    const dist = (this.portrait ? 18 : 14) - l * 2
    this.camera.position.set(Math.sin(this.mouse.x * 0.3) * dist * 0.2 - (this.portrait ? 0 : 3.4), 3 + this.mouse.y * 0.8 + (this.portrait ? -2 : 0), dist)
    this.camera.lookAt(this.portrait ? 0 : -3.4, this.portrait ? -1.4 : 1.4, 0)
    this.composer.render()
  }
}
