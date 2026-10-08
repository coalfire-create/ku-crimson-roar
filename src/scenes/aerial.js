import * as THREE from 'three'

// Real aerial photography of the campus, fetched at run time from Esri World
// Imagery (Esri, Maxar, Earthstar Geographics) and stitched into one texture.
// The scene frame is metres around `origin`, x east and z south; over a couple
// of kilometres Web Mercator is linear enough that a scale and an offset map
// scene x, z straight to texture u, v (returned as `xform` for shaders).

const URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const M_LAT = 110540

export function loadAerial({ origin: [lat0, lon0], x0, x1, z0, z1, zoom, maxSize = 4096 }) {
  const M_LON = M_LAT * Math.cos((lat0 * Math.PI) / 180)
  const n = 2 ** zoom
  const tx = (lon) => ((lon + 180) / 360) * n
  const ty = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const lonOf = (x) => lon0 + x / M_LON
  const latOf = (z) => lat0 - z / M_LAT
  // Tile range, trimmed so the canvas stays within maxSize.
  let ax = Math.floor(tx(lonOf(x0)))
  let bx = Math.floor(tx(lonOf(x1)))
  let ay = Math.floor(ty(latOf(z0)))
  let by = Math.floor(ty(latOf(z1)))
  const cap = Math.floor(maxSize / 256)
  while (bx - ax + 1 > cap) (ax++, bx > ax && bx--)
  while (by - ay + 1 > cap) (ay++, by > ay && by--)
  const cv = document.createElement('canvas')
  cv.width = (bx - ax + 1) * 256
  cv.height = (by - ay + 1) * 256
  const ctx = cv.getContext('2d')
  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  // u = (tileX(x) - ax) / cols; tileX is linear in x, tileY close to linear in z.
  const cols = bx - ax + 1
  const rows = by - ay + 1
  const su = n / 360 / M_LON / cols
  const ou = (tx(lon0) - ax) / cols
  const dz = 50
  const sv = (ty(latOf(dz)) - ty(latOf(-dz))) / (2 * dz) / rows
  const ov = (ty(lat0) - ay) / rows
  // Texture v runs bottom-up (flipY), canvas rows top-down.
  const xform = new THREE.Vector4(su, -sv, ou, 1 - ov)
  let failed = 0
  const jobs = []
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      jobs.push(
        new Promise((done) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => (ctx.drawImage(img, (x - ax) * 256, (y - ay) * 256), done())
          img.onerror = () => (failed++, done())
          img.src = URL(zoom, x, y)
        }),
      )
  const ready = Promise.all(jobs).then(() => {
    texture.needsUpdate = true
    return { texture, ok: failed < jobs.length * 0.2 }
  })
  return { texture, xform, ready }
}
