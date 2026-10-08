import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import WORLD from '../data/world.json'

// Mapped trees, tree rows and forest cover as instanced trees with real
// foliage: each crown is a cloud of leaf-cluster cards cut from photographed
// leaves (ambientCG LeafSet024 / LeafSet019, CC0), lit as one soft volume.
// Bark: Poly Haven bark_brown_02 / pine_bark (CC0). Far trees thin out
// (LOD in the vertex shader) since the aerial photo already shows canopies.
// Species mix of a Seoul campus in early autumn: zelkova and cherry starting
// to turn, ginkgo going yellow, and pines.

// Deterministic per-tree random.
const rnd = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

// A crown of `n` cards scattered through an ellipsoid; every vertex's normal
// points out from the crown's centre so the cloud shades like a solid mass.
function crown({ n, center, radius, size, half, seed, cone = 0 }) {
  const cards = []
  const v = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (let k = 0; k < n; k++) {
    // Point in the shell of the crown (denser toward the outside).
    const u = rnd(seed + k, 1) * 2 - 1
    const a = rnd(seed + k, 2) * Math.PI * 2
    const r = 0.55 + 0.45 * Math.sqrt(rnd(seed + k, 3))
    const s = Math.sqrt(1 - u * u)
    v.set(Math.cos(a) * s, u, Math.sin(a) * s)
    // Cone crowns (pines) narrow toward the top.
    const w = cone ? 1 - cone * (u * 0.5 + 0.5) : 1
    const p = new THREE.Vector3(v.x * radius.x * r * w, v.y * radius.y * r, v.z * radius.z * r * w).add(center)
    const g = new THREE.PlaneGeometry(size, size)
    // Face roughly outward with a random twist, tilted up a little.
    e.set(rnd(seed + k, 4) * 0.9 - 0.45, a + Math.PI / 2 + (rnd(seed + k, 5) - 0.5) * 1.2, rnd(seed + k, 6) * Math.PI * 2)
    g.applyQuaternion(q.setFromEuler(e))
    g.translate(p.x, p.y, p.z)
    const uv = g.attributes.uv
    for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * 0.5 + half * 0.5)
    const pos = g.attributes.position
    const nor = g.attributes.normal
    for (let j = 0; j < pos.count; j++) {
      v.set(pos.getX(j) - center.x, (pos.getY(j) - center.y) * 0.8 + radius.y * 0.35, pos.getZ(j) - center.z).normalize()
      nor.setXYZ(j, v.x, v.y, v.z)
    }
    cards.push(g)
  }
  return mergeGeometries(cards)
}

function trunk({ h, r0, r1, branches, seed, half = 0 }) {
  const parts = []
  const t = new THREE.CylinderGeometry(r1, r0, h, 7, 1, true)
  t.translate(0, h / 2, 0)
  parts.push(t)
  for (let k = 0; k < branches; k++) {
    const L = h * (0.45 + rnd(seed + k, 7) * 0.25)
    const b = new THREE.CylinderGeometry(r1 * 0.35, r1 * 0.7, L, 5, 1, true)
    b.translate(0, L / 2, 0)
    b.rotateZ(0.5 + rnd(seed + k, 8) * 0.4)
    b.rotateY((k / branches) * Math.PI * 2 + rnd(seed + k, 9))
    b.translate(0, h * (0.7 + rnd(seed + k, 10) * 0.25), 0)
    parts.push(b)
  }
  // UVs: once around, one repeat per 1.6 m up, in this species' half of the bark atlas.
  for (const g of parts) {
    const uv = g.attributes.uv
    const H = g.parameters.height
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 0.5 + half * 0.5, (uv.getY(j) * H) / 1.6)
  }
  return mergeGeometries(parts)
}

// Distance thinning: each tree has a fixed random rank; past `near` metres
// trees drop out in rank order until `keep` of them remain at `far`.
const LOD = /* glsl */ `
  vec3 lodAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float lodRank = fract(sin(dot(lodAt.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float lodD = distance(lodAt, cameraPosition);
  float lodKeep = mix(1.0, 0.3, smoothstep(260.0, 1100.0, lodD));
  if (lodRank > lodKeep) transformed = vec3(0.0);
`
function thin(m) {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r)
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + LOD)
  }
  return m
}

function foliageMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    // Keep the crown-volume normal on both faces of each card.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      // Light through the leaves: a little of the leaf colour glows on its own.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;')
  }
  return m
}

// keep(x, z, s): optional filter; trees it rejects are left out (scaled to nothing).
export function buildTrees(scene, MOBILE, keep = null) {
  const group = new THREE.Group()
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/foliage.png`)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const leafMat = thin(foliageMaterial(tex))
  const barkTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/bark.jpg`)
  barkTex.colorSpace = THREE.SRGBColorSpace
  barkTex.wrapT = THREE.RepeatWrapping
  barkTex.anisotropy = 4
  const cards = MOBILE ? 16 : 32

  // Species: geometry (trunk + crown) and colour palette.
  const SPECIES = [
    {
      // Zelkova / cherry: broad vase crown.
      share: 0.62,
      trunk: trunk({ h: 4.2, r0: 0.46, r1: 0.26, branches: 4, seed: 11 }),
      crown: crown({ n: cards, center: new THREE.Vector3(0, 6.8, 0), radius: new THREE.Vector3(3.7, 2.9, 3.7), size: 3.9, half: 0, seed: 100 }),
      colors: [[0.62, 0.74, 0.5], [0.55, 0.68, 0.42], [0.72, 0.7, 0.42], [0.95, 0.62, 0.32], [0.78, 0.42, 0.28]],
      weights: [0.4, 0.3, 0.14, 0.1, 0.06],
    },
    {
      // Ginkgo: narrower, taller, turning yellow.
      share: 0.16,
      trunk: trunk({ h: 5.2, r0: 0.4, r1: 0.22, branches: 3, seed: 23 }),
      crown: crown({ n: cards, center: new THREE.Vector3(0, 7.6, 0), radius: new THREE.Vector3(2.6, 3.6, 2.6), size: 3.5, half: 0, seed: 300, cone: 0.35 }),
      colors: [[0.7, 0.76, 0.45], [1.15, 1.0, 0.38], [1.3, 1.08, 0.3]],
      weights: [0.35, 0.35, 0.3],
    },
    {
      // Korean red pine: tall bare trunk, irregular flat-topped crown.
      share: 0.22,
      trunk: trunk({ h: 6.0, r0: 0.38, r1: 0.2, branches: 3, seed: 37, half: 1 }),
      crown: crown({ n: Math.round(cards * 0.8), center: new THREE.Vector3(0, 8.0, 0), radius: new THREE.Vector3(3.1, 2.4, 3.1), size: 3.7, half: 1, seed: 500, cone: 0.25 }),
      colors: [[0.7, 0.78, 0.66], [0.6, 0.7, 0.56]],
      weights: [0.5, 0.5],
    },
  ]
  const all = WORLD.trees.length / 4
  const pick = MOBILE ? 2 : 1
  const n = Math.floor(all / pick)
  const of = (i) => {
    const r = rnd(i, 20)
    return r < SPECIES[0].share ? 0 : r < SPECIES[0].share + SPECIES[1].share ? 1 : 2
  }
  const counts = [0, 0, 0]
  for (let i = 0; i < n; i++) counts[of(i)]++
  const barkMat = thin(new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, metalness: 0 }))
  const meshes = SPECIES.map((sp, k) => {
    const leaves = new THREE.InstancedMesh(sp.crown, leafMat, Math.max(1, counts[k]))
    const bark = new THREE.InstancedMesh(sp.trunk, barkMat, Math.max(1, counts[k]))
    leaves.count = bark.count = counts[k]
    for (const m of [leaves, bark]) {
      m.castShadow = !MOBILE
      m.receiveShadow = false
      group.add(m)
    }
    return { leaves, bark, i: 0 }
  })
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const c = new THREE.Color()
  const barkCol = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const [x, z, y, s] = WORLD.trees.slice(i * pick * 4, i * pick * 4 + 4)
    const k = of(i)
    const sp = SPECIES[k]
    const M = meshes[k]
    q.setFromAxisAngle(up, rnd(i, 21) * Math.PI * 2)
    const sy = s * (0.88 + rnd(i, 22) * 0.3)
    const on = !keep || keep(x, z, s) ? 1 : 0
    m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(s * on, sy * on, s * on))
    M.leaves.setMatrixAt(M.i, m)
    M.bark.setMatrixAt(M.i, m)
    // Pick a palette colour by weight, then jitter it.
    let r = rnd(i, 23)
    let j = 0
    while (j < sp.colors.length - 1 && (r -= sp.weights[j]) > 0) j++
    const [cr, cg, cb] = sp.colors[j]
    const f = 0.85 + rnd(i, 24) * 0.3
    M.leaves.setColorAt(M.i, c.setRGB(cr * f, cg * f, cb * f))
    // Pines have reddish bark (its own texture); the rest grey-brown.
    M.bark.setColorAt(M.i, k === 2 ? barkCol.setRGB(1.0, 0.82, 0.74) : barkCol.setRGB(0.85, 0.82, 0.8))
    M.i++
  }
  scene.add(group)
  return group
}
