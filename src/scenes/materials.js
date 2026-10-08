import * as THREE from 'three'

// Campus surface materials: the aerial photograph shared by the ground and
// the rooftops, photographed wall textures, and the building facade shader.
// NIGHT is the shared dusk uniform (0 day .. 1 night) driven by the flight.

export const NIGHT = { value: 0 }

// Real aerial photography under everything (ground, roads and rooftops):
// a wide base layer and a sharp one over the tour. Off until it has loaded.
export const AER = {
  uAerOn: { value: 0 },
  uBase: { value: null },
  uBaseX: { value: new THREE.Vector4() },
  uCore: { value: null },
  uCoreX: { value: new THREE.Vector4() },
}
export const AER_GLSL = /* glsl */ `
  uniform float uAerOn;
  uniform sampler2D uBase, uCore;
  uniform vec4 uBaseX, uCoreX;
  vec3 aerialAt(vec2 xz){
    vec2 uc = xz * uCoreX.xy + uCoreX.zw;
    vec2 ub = xz * uBaseX.xy + uBaseX.zw;
    vec2 e = smoothstep(0.0, 0.03, uc) * smoothstep(1.0, 0.97, uc);
    return mix(texture2D(uBase, ub).rgb, texture2D(uCore, uc).rgb, e.x * e.y);
  }
`
// Photographed CC0 surfaces (Poly Haven), with their normal maps.
// Real sizes: rough block granite 3.0 m, dressed ashlar 2.0 m, concrete 2.7 m, slate 3.0 m.
export const WALLTEX = {
  uStone: { value: null }, uStoneN: { value: null },
  uAsh: { value: null }, uAshN: { value: null },
  uConc: { value: null }, uConcN: { value: null },
  uSlate: { value: null }, uSlateN: { value: null },
}
{
  const tl = new THREE.TextureLoader()
  const files = { uStone: 'rough_block_wall', uAsh: 'medieval_blocks_03', uConc: 'concrete_wall_008', uSlate: 'roof_slates_02' }
  for (const [k, f] of Object.entries(files)) {
    for (const [key, file, srgb] of [[k, f, true], [k + 'N', f + '_nor', false]]) {
      const t = tl.load(`${import.meta.env.BASE_URL}textures/${file}.jpg`)
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
      WALLTEX[key].value = t
    }
  }
}

// Building styles (aB.x). 0-5 are facades from the map data; 6-8 are trim
// pieces built by the geometry: dressed stone bands, metal coping, slate roofs.
export const STYLE = { c: 0, g: 1, m: 2, h: 3, d: 4, t: 5, trim: 6, coping: 7, slate: 8 }

// Facade shader. Walls carry uv = (metres along this wall, this wall's length)
// so window bays can be centred on each wall, with solid piers at the corners.
const buildingChunks = {
  vertexPars: /* glsl */ `
    attribute vec4 aB; // style, seed, base y, top y
    varying vec4 vB;
    varying vec3 vPos;
    varying vec3 vWN;
    varying vec2 vUv2;
    varying float vUp;
  `,
  vertex: /* glsl */ `
    vB = aB;
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vWN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vUv2 = uv;
    vUp = normal.y;
  `,
  fragmentPars: /* glsl */ `
    uniform float uNight;
    uniform sampler2D uStone, uStoneN, uAsh, uAshN, uConc, uConcN, uSlate, uSlateN;
    ${AER_GLSL}
    varying vec4 vB;
    varying vec3 vPos;
    varying vec3 vWN;
    varying vec2 vUv2;
    varying float vUp;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1,0), 1.0)), c = hash(vec3(i + vec2(0,1), 1.0)), d = hash(vec3(i + 1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    // Photo texture as detail over a tint: the texture over its own average colour.
    vec3 detail(sampler2D t, vec2 uv, float k){
      vec3 c = texture2D(t, uv).rgb / max(texture2D(t, uv, 14.0).rgb, vec3(0.02));
      return mix(vec3(1.0), c, k);
    }
    mat3 cotFrame(vec3 N, vec3 p, vec2 uv){
      vec3 dp1 = dFdx(p), dp2 = dFdy(p);
      vec2 du1 = dFdx(uv), du2 = dFdy(uv);
      vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
      vec3 T = dp2perp * du1.x + dp1perp * du2.x;
      vec3 B = dp2perp * du1.y + dp1perp * du2.y;
      float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
      return mat3(T * inv, B * inv, N);
    }
    // Per style: bay width, floor height, window w, window h; wall tint; frame width.
    void styleOf(float s, float seed, out vec4 g, out vec3 wall, out float fw){
      fw = 0.07;
      if (s < 0.5)      { g = vec4(3.4, 3.9, 1.7, 2.3); wall = vec3(0.62, 0.6, 0.55); fw = 0.16; }   // dressed granite
      else if (s < 1.5) { g = vec4(3.2, 4.2, 1.35, 2.55); wall = vec3(0.6, 0.57, 0.52); fw = 0.2; }  // KU gothic, rough-faced granite
      else if (s < 2.5) { g = vec4(1.5, 4.0, 1.42, 3.0); wall = vec3(0.32, 0.34, 0.36); }   // curtain wall
      else if (s < 3.5) { g = vec4(3.0, 3.8, 2.8, 1.7); wall = vec3(0.8, 0.8, 0.78); }  // hospital ribbon
      else if (s < 4.5) { g = vec4(2.7, 3.0, 1.3, 1.35); wall = vec3(0.72, 0.64, 0.54); }  // dorm
      else {
        g = vec4(3.0 + seed * 0.8, 2.9 + seed * 0.3, 1.4, 1.35);
        float k = floor(seed * 6.0);
        wall = k < 1.0 ? vec3(0.7, 0.67, 0.62) : k < 2.0 ? vec3(0.62, 0.52, 0.44) : k < 3.0 ? vec3(0.46, 0.3, 0.24) : k < 4.0 ? vec3(0.8, 0.79, 0.76) : k < 5.0 ? vec3(0.5, 0.52, 0.54) : vec3(0.72, 0.62, 0.5);
      }
    }
  `,
  color: /* glsl */ `
    float bStyle = vB.x, bSeed = vB.y, bBase = vB.z, bTop = vB.w;
    float hgt = vPos.y - bBase;
    float isWall = 1.0 - step(0.5, abs(vUp));
    float winMask = 0.0, lit = 0.0, rough = 0.88, metal = 0.0, nStr = 0.0;
    vec3 nTex = vec3(0.5, 0.5, 1.0);
    vec2 nUv = vec2(0.0);
    vec3 glassRefl = vec3(0.0);
    vec3 wall;
    if (bStyle > 7.5) {
      // Slate roof: uv in metres along the eave / up the slope.
      vec2 ruv = vUv2 / 3.0;
      wall = texture2D(uSlate, ruv).rgb * vec3(0.78, 0.82, 0.86);
      wall *= 0.85 + 0.25 * vnoise(vUv2 * 0.12 + bSeed * 9.0);
      nTex = texture2D(uSlateN, ruv).rgb; nUv = ruv; nStr = 1.0; rough = 0.62;
    } else if (isWall < 0.5) {
      // Flat roofs and the tops of trims: the real rooftop from the aerial photo.
      float n = vnoise(vPos.xz * 0.35 + bSeed * 20.0);
      wall = mix(vec3(0.42, 0.42, 0.41), vec3(0.52, 0.51, 0.49), n) * (0.9 + 0.1 * bSeed);
      if (uAerOn > 0.5 && bStyle < 5.5) wall = aerialAt(vPos.xz) * 1.15;
      if (bStyle > 6.5) wall = vec3(0.3, 0.31, 0.32);
    } else {
      float along = vUv2.x, len = vUv2.y;
      vec4 g; float fw;
      styleOf(min(bStyle, 5.0), bSeed, g, wall, fw);
      float stone = step(bStyle, 1.5);
      vec2 tuv = vec2(along, hgt) + bSeed * 17.0;
      // Masonry: rough granite on the gothic halls, dressed ashlar elsewhere in stone.
      if (bStyle > 0.5 && bStyle < 1.5) {
        wall *= detail(uStone, tuv / 3.0, 0.62);
        nTex = texture2D(uStoneN, tuv / 3.0).rgb; nUv = tuv / 3.0; nStr = 1.3;
      } else if (bStyle < 0.5 || (bStyle > 5.5 && bStyle < 6.5)) {
        wall *= detail(uAsh, tuv / 2.0, 0.75);
        nTex = texture2D(uAshN, tuv / 2.0).rgb; nUv = tuv / 2.0; nStr = 0.9;
        if (bStyle > 5.5) wall = vec3(0.66, 0.63, 0.58) * detail(uAsh, tuv / 2.0, 0.6);
      } else if (bStyle > 6.5) {
        wall = vec3(0.24, 0.25, 0.26); rough = 0.5; metal = 0.4; // aluminium coping
      } else {
        wall *= detail(uConc, tuv / 2.7, 0.8);
        nTex = texture2D(uConcN, tuv / 2.7).rgb; nUv = tuv / 2.7; nStr = 0.6;
      }
      // Large-scale weathering: patchy tone, darker at the foot, rain streaks.
      wall *= 0.93 + 0.12 * vnoise(vec2(along * 0.11, hgt * 0.07) + bSeed * 50.0);
      wall *= 0.82 + 0.18 * smoothstep(0.0, 2.5, hgt);
      float H = bTop - bBase;
      wall *= 1.0 - 0.18 * smoothstep(0.6, 0.0, H - hgt) * step(hgt, H + 0.01);

      if (bStyle < 5.5) {
        // Windows: whole bays centred on this wall, solid piers at the corners.
        float nB = floor((len - 1.4) / g.x);
        float margin = (len - nB * g.x) * 0.5;
        float lx = along - margin;
        float inBays = step(1.0, nB) * step(0.0, lx) * step(lx, nB * g.x);
        float bay = floor(lx / g.x);
        float fl = floor((hgt - 0.6) / g.y);
        vec2 cell = vec2(fract(lx / g.x) * g.x - g.x * 0.5, fract((hgt - 0.6) / g.y) * g.y - g.y * 0.52);
        float floorsOk = step(0.0, fl) * step(hgt, H - 1.1) * step(1.2, hgt);
        // Curtain walls run glass up to the parapet.
        if (bStyle > 1.5 && bStyle < 2.5) floorsOk = step(0.4, hgt) * step(hgt, H - 0.5);
        vec2 hw = g.zw * 0.5;
        vec2 dd = abs(cell) - hw;
        float on = inBays * floorsOk;
        float inside = on * step(max(dd.x, dd.y), 0.0);
        float frame = on * (1.0 - inside) * step(max(dd.x, dd.y), fw);
        float sill = on * step(abs(cell.x), hw.x + fw + 0.08) * step(-hw.y - fw - 0.14, cell.y) * step(cell.y, -hw.y - fw + 0.01);
        // Spandrel bands between floors on the modern blocks.
        if (bStyle > 1.5) {
          float slab = step(abs(fract((hgt - 0.6) / g.y) - 0.0), 0.06) + step(0.94, fract((hgt - 0.6) / g.y));
          wall *= 1.0 - 0.1 * slab * floorsOk;
        }
        // Grime washed down from each sill.
        float streak = on * step(abs(cell.x), hw.x) * smoothstep(-hw.y - 1.6, -hw.y - 0.2, cell.y) * step(cell.y, -hw.y - fw) * (0.5 + 0.5 * vnoise(vec2(cell.x * 6.0 + bay, fl)));
        wall *= 1.0 - 0.12 * streak;
        wall = mix(wall, wall * 1.18 + 0.02, sill * stone);
        wall = mix(wall, mix(wall * 1.12, vec3(0.06, 0.06, 0.065), 1.0 - stone), frame);
        if (frame + sill > 0.0) nStr *= 0.3;
        if (inside > 0.5) {
          float r = hash(vec3(fl, bay + floor(len * 7.0), bSeed * 91.0));
          // Casement bars: stone mullion and transom on the halls, thin frames elsewhere.
          // Bars antialiased against their on-screen size; they fade out with distance.
          float px = max(fwidth(cell.x), fwidth(cell.y));
          float far = smoothstep(0.04, 0.12, px);
          float bars = 0.0;
          if (bStyle < 1.5) {
            bars = smoothstep(0.08 + px, 0.08 - px, abs(cell.x)) + smoothstep(0.06 + px, 0.06 - px, abs(cell.y - (hw.y - 0.75)));
          } else {
            bars = smoothstep(0.045 + px, 0.045 - px, abs(cell.x)) * step(2.0, g.z) + smoothstep(0.04 + px, 0.04 - px, abs(cell.y - (hw.y - 0.6)));
          }
          bars *= 1.0 - far * 0.6;
          bars = min(bars, 1.0);
          // Reveal: the frame casts a shadow into the recess from above and one side.
          float reveal = smoothstep(hw.y - 0.22, hw.y, cell.y) + smoothstep(-hw.x + 0.16, -hw.x, cell.x);
          // Behind the glass: dark rooms, drawn blinds, a few lights on by day.
          vec3 room = r < 0.35 ? vec3(0.018, 0.02, 0.024) : r < 0.6 ? vec3(0.16, 0.15, 0.14) * (0.85 + 0.15 * smoothstep(-hw.y, hw.y, cell.y)) : r < 0.8 ? vec3(0.05, 0.045, 0.04) : vec3(0.2, 0.18, 0.15);
          room *= 1.0 - 0.6 * min(reveal, 1.0);
          vec3 frameCol = stone > 0.5 ? vec3(0.08, 0.075, 0.07) : vec3(0.1, 0.105, 0.11);
          wall = mix(room, frameCol, bars);
          winMask = 1.0 - bars;
          rough = mix(0.5, 0.06, winMask);
          metal = mix(0.3, 0.0, winMask);
          nStr = 0.0;
          lit = winMask * step(0.86 - uNight * 0.5, r) * (1.0 - min(reveal, 1.0) * 0.5);
          // Reflection of the sky: Fresnel-weighted, each pane at a slightly different tilt.
          vec3 V = normalize(vPos - cameraPosition);
          vec3 N = normalize(vWN + vec3(r - 0.5, hash(vec3(bay, fl, 3.0)) - 0.5, 0.0) * 0.05);
          vec3 R = reflect(V, N);
          vec3 skyC = mix(vec3(1.0, 0.78, 0.58), vec3(0.42, 0.56, 0.78), smoothstep(0.0, 0.45, R.y));
          skyC = mix(vec3(0.07, 0.065, 0.06), skyC, smoothstep(-0.06, 0.03, R.y));
          float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 4.0);
          glassRefl = winMask * skyC * fres * (1.0 - uNight * 0.85) * 1.1;
        }
      }
    }
    diffuseColor.rgb = wall;
  `,
  roughness: /* glsl */ `
    roughnessFactor = rough;
  `,
  metalness: /* glsl */ `
    metalnessFactor = metal;
  `,
  normal: /* glsl */ `
    if (nStr > 0.0) {
      mat3 tbn = cotFrame(normal, -vViewPosition, nUv);
      vec3 mapN = nTex * 2.0 - 1.0;
      mapN.xy *= nStr;
      normal = normalize(tbn * mapN);
    }
  `,
  emissive: /* glsl */ `
    totalEmissiveRadiance += glassRefl;
    totalEmissiveRadiance += vec3(1.0, 0.74, 0.44) * lit * (0.12 + uNight * 3.0);
  `,
}

export function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT
    Object.assign(sh.uniforms, AER, WALLTEX)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + buildingChunks.vertexPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + buildingChunks.vertex)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + buildingChunks.fragmentPars)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + buildingChunks.color)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + buildingChunks.roughness)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + buildingChunks.metalness)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + buildingChunks.normal)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + buildingChunks.emissive)
  }
  mat.customProgramCacheKey = () => 'ku-building-2'
  return mat
}

// --- Geometry helpers for the buildings -----------------------------------

// Polygon [[x, z], ...] (closed or open) offset outward by d metres (negative: inward), mitred.
export function offsetPoly(pts, d) {
  const p = pts.length > 2 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts.slice()
  let area = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]
    const [x2, z2] = p[(i + 1) % p.length]
    area += x1 * z2 - x2 * z1
  }
  // Outward normal of edge (dx, dz) is (dz, -dx) for positive area in x-z.
  const sgn = area > 0 ? 1 : -1
  const out = []
  const n = p.length
  const nrm = (a, b) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    return [(dz / l) * sgn, (-dx / l) * sgn]
  }
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n]
    const b = p[i]
    const c = p[(i + 1) % n]
    const n1 = nrm(a, b)
    const n2 = nrm(b, c)
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1]
    let mx = (n1[0] + n2[0]) / Math.max(k, 0.25)
    let mz = (n1[1] + n2[1]) / Math.max(k, 0.25)
    const ml = Math.hypot(mx, mz)
    if (ml > 2.5) (mx *= 2.5 / ml), (mz *= 2.5 / ml)
    out.push([b[0] + mx * d, b[1] + mz * d])
  }
  out.push(out[0])
  return out
}

// Give a non-indexed prism's side faces uv = (metres along their wall, wall length),
// matching each face to the nearest footprint edge; top/bottom faces get world x, z.
export function wallUV(geo, poly) {
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  const edges = []
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    if (len > 1e-3) edges.push({ ax, az, tx: (bx - ax) / len, tz: (bz - az) / len, len })
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3()
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f)
    b.fromBufferAttribute(pos, f + 1)
    c.fromBufferAttribute(pos, f + 2)
    nn.subVectors(c, b).cross(b.clone().sub(a)).normalize()
    if (Math.abs(nn.y) > 0.5 || !edges.length) {
      for (let k = 0; k < 3; k++) uv.set([pos.getX(f + k), pos.getZ(f + k)], (f + k) * 2)
      continue
    }
    const cx = (a.x + b.x + c.x) / 3
    const cz = (a.z + b.z + c.z) / 3
    let best = edges[0]
    let bd = Infinity
    for (const e of edges) {
      const t = THREE.MathUtils.clamp((cx - e.ax) * e.tx + (cz - e.az) * e.tz, 0, e.len)
      const d = Math.hypot(e.ax + e.tx * t - cx, e.az + e.tz * t - cz) + (1 - Math.abs(e.tx * nn.z - e.tz * nn.x)) * 5
      if (d < bd) (bd = d), (best = e)
    }
    for (let k = 0; k < 3; k++) {
      const along = (pos.getX(f + k) - best.ax) * best.tx + (pos.getZ(f + k) - best.az) * best.tz
      uv.set([along, best.len], (f + k) * 2)
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

// Sloped faces: uv in metres along the eave and up the slope.
export function slopeUV(geo) {
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3(), s = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f)
    b.fromBufferAttribute(pos, f + 1)
    c.fromBufferAttribute(pos, f + 2)
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize()
    e.crossVectors(up, n)
    if (e.lengthSq() < 1e-6) e.set(1, 0, 0)
    e.normalize()
    s.crossVectors(n, e).normalize()
    for (const [k, v] of [[0, a], [1, b], [2, c]]) uv.set([v.dot(e), v.dot(s)], (f + k) * 2)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

// Per-vertex building attribute: style, seed, base y, top y.
export function tagB(geo, style, seed, base, top) {
  const n = geo.attributes.position.count
  const a = new Float32Array(n * 4)
  for (let k = 0; k < n; k++) a.set([style, seed, base, top], k * 4)
  geo.setAttribute('aB', new THREE.BufferAttribute(a, 4))
  return geo
}
