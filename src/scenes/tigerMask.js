// A front-facing tiger face, drawn as flat layers on canvases so the hero can
// sample it into embers. Coordinates are in face units: x, y in -1..1, y up.
// Everything is drawn for the right half and mirrored, so the face stays
// perfectly symmetric like a carved crest.

const S = 768

const layer = () => {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.setTransform(S / 2, 0, 0, -S / 2, S / 2, S / 2) // face units, y up
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  return { c, g }
}

// Draw a path from a point list on both sides. `pts` are [x, y] or
// ['q', cx, cy, x, y] for a quadratic curve.
function sym(g, pts, { close = true, fill = true, width = 0 } = {}) {
  for (const s of [1, -1]) {
    g.beginPath()
    pts.forEach((p, i) => {
      if (p[0] === 'q') g.quadraticCurveTo(p[1] * s, p[2], p[3] * s, p[4])
      else if (i === 0) g.moveTo(p[0] * s, p[1])
      else g.lineTo(p[0] * s, p[1])
    })
    if (close) g.closePath()
    if (fill) g.fill()
    if (width) ((g.lineWidth = width), g.stroke())
  }
}

// A tapering stripe: a thick end at `a`, sweeping through `c` to a point at `b`.
function stripe(g, a, c, b, w) {
  const n = 18
  const L = []
  const R = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0]
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]
    const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0])
    const dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])
    const l = Math.hypot(dx, dy) || 1
    const hw = (w / 2) * Math.pow(1 - t, 0.8)
    L.push([x - (dy / l) * hw, y + (dx / l) * hw])
    R.push([x + (dy / l) * hw, y - (dx / l) * hw])
  }
  sym(g, [...L, ...R.reverse()])
}

export function drawTigerMask() {
  // Face silhouette: forehead, rounded ears, the flared ruff of cheek fur, chin.
  const face = layer()
  sym(face.g, [
    [0, 0.6],
    ['q', 0.22, 0.62, 0.4, 0.58],
    ['q', 0.44, 0.86, 0.62, 0.86],
    ['q', 0.8, 0.84, 0.78, 0.6],
    ['q', 0.86, 0.46, 0.86, 0.3],
    [1.02, 0.16],
    [0.9, 0.08],
    [1.0, -0.06],
    [0.87, -0.12],
    [0.94, -0.28],
    [0.78, -0.32],
    [0.8, -0.48],
    [0.62, -0.5],
    ['q', 0.5, -0.72, 0.24, -0.8],
    ['q', 0.1, -0.84, 0, -0.84],
    [0, 0.6],
  ])

  // Pale fur: inner ears, brows, cheeks, muzzle pads and chin.
  const pale = layer()
  const pg = pale.g
  sym(pg, [[0.5, 0.62], ['q', 0.56, 0.8, 0.64, 0.79], ['q', 0.72, 0.76, 0.71, 0.62], ['q', 0.62, 0.58, 0.5, 0.62]])
  for (const s of [1, -1]) {
    pg.beginPath()
    pg.ellipse(0.31 * s, 0.335, 0.13, 0.045, 0.32 * s, 0, Math.PI * 2)
    pg.fill()
  }
  sym(pg, [[0.14, 0.0], ['q', 0.36, 0.02, 0.5, -0.06], [0.66, -0.1], [0.58, -0.18], [0.7, -0.26], [0.56, -0.32], [0.6, -0.44], [0.44, -0.46], ['q', 0.32, -0.62, 0.16, -0.64], ['q', 0.06, -0.56, 0.06, -0.3]])
  for (const s of [1, -1]) {
    pg.beginPath()
    pg.arc(0.11 * s, -0.37, 0.13, 0, Math.PI * 2)
    pg.fill()
  }
  sym(pg, [[0, -0.54], ['q', 0.12, -0.56, 0.15, -0.68], ['q', 0.08, -0.78, 0, -0.78]])

  // Stripes: the forehead mark, temple arcs, cheek wedges, ear rims.
  const st = layer()
  const sg = st.g
  // Forehead: the 王 mark, three bars across a short upright.
  sym(sg, [[0, 0.58], [0.03, 0.56], [0.02, 0.36], [0, 0.32]])
  stripe(sg, [0.03, 0.55], [0.12, 0.57], [0.2, 0.53], 0.045)
  stripe(sg, [0.03, 0.47], [0.1, 0.48], [0.17, 0.44], 0.04)
  stripe(sg, [0.03, 0.39], [0.08, 0.4], [0.13, 0.36], 0.035)
  stripe(sg, [0.3, 0.62], [0.3, 0.54], [0.24, 0.47], 0.05)
  // Over the eyes, sweeping back to the temples.
  stripe(sg, [0.46, 0.4], [0.32, 0.34], [0.14, 0.27], 0.05)
  for (const s of [1, -1]) {
    sg.save()
    sg.translate(0.29 * s, 0.19)
    sg.rotate(0.34 * s)
    sg.lineWidth = 0.03
    sg.beginPath()
    sg.moveTo(-0.17 * s, -0.03)
    sg.quadraticCurveTo(0, 0.13, 0.16 * s, 0.03)
    sg.quadraticCurveTo(0, -0.1, -0.17 * s, -0.03)
    sg.stroke()
    sg.restore()
  }
  stripe(sg, [0.66, 0.5], [0.56, 0.48], [0.46, 0.38], 0.08)
  stripe(sg, [0.8, 0.36], [0.68, 0.32], [0.56, 0.24], 0.08)
  // Cheeks: wedges driving in from the ruff.
  stripe(sg, [0.98, 0.12], [0.82, 0.08], [0.62, 0.02], 0.09)
  stripe(sg, [0.96, -0.08], [0.8, -0.1], [0.6, -0.14], 0.09)
  stripe(sg, [0.9, -0.3], [0.76, -0.28], [0.6, -0.3], 0.08)
  stripe(sg, [0.78, -0.48], [0.68, -0.44], [0.56, -0.48], 0.06)
  // Ear rims.
  sym(sg, [[0.44, 0.7], ['q', 0.5, 0.88, 0.64, 0.88], ['q', 0.82, 0.86, 0.8, 0.62], [0.76, 0.62], ['q', 0.76, 0.82, 0.64, 0.83], ['q', 0.52, 0.82, 0.48, 0.66]])
  // Tear line from the inner eye down beside the nose.
  stripe(sg, [0.2, 0.16], [0.17, 0.08], [0.18, -0.02], 0.035)
  // Muzzle spots and the mouth line.
  sg.lineWidth = 0.026
  sym(sg, [[0, -0.46], ['q', 0.08, -0.52, 0.16, -0.5], ['q', 0.22, -0.5, 0.25, -0.57]], { close: false, fill: false, width: 0.028 })
  sym(sg, [[0, -0.32], [0, -0.44]], { close: false, fill: false, width: 0.024 })
  for (const [x, y] of [[0.1, -0.38], [0.16, -0.33], [0.2, -0.41], [0.08, -0.29]])
    for (const s of [1, -1]) {
      sg.beginPath()
      sg.arc(x * s, y, 0.013, 0, Math.PI * 2)
      sg.fill()
    }

  // Eyes: almonds tilted up and out.
  const eye = layer()
  for (const s of [1, -1]) {
    const g = eye.g
    g.save()
    g.translate(0.29 * s, 0.19)
    g.rotate(0.34 * s)
    g.beginPath()
    g.moveTo(-0.15 * s, -0.025)
    g.quadraticCurveTo(0, 0.11, 0.14 * s, 0.03)
    g.quadraticCurveTo(0, -0.08, -0.15 * s, -0.025)
    g.fill()
    g.restore()
  }
  // Pupils.
  const pupil = layer()
  for (const s of [1, -1]) {
    pupil.g.beginPath()
    pupil.g.ellipse(0.29 * s, 0.195, 0.022, 0.04, 0, 0, Math.PI * 2)
    pupil.g.fill()
  }

  // Nose: a broad rounded triangle.
  const nose = layer()
  sym(nose.g, [[0, -0.15], ['q', 0.12, -0.15, 0.15, -0.1], ['q', 0.13, -0.22, 0, -0.32]])

  const read = (l) => l.g.getImageData(0, 0, S, S).data
  return { size: S, face: read(face), pale: read(pale), stripe: read(st), eye: read(eye), pupil: read(pupil), nose: read(nose), canvases: { face, pale, st, eye, pupil, nose } }
}

// Debug: composite the layers into one picture.
export function previewTigerMask() {
  const m = drawTigerMask()
  const c = document.createElement('canvas')
  c.width = c.height = m.size
  const g = c.getContext('2d')
  const img = g.createImageData(m.size, m.size)
  for (let i = 0; i < m.size * m.size; i++) {
    const k = i * 4
    let col = [10, 8, 10]
    if (m.face[k + 3] > 128) col = [230, 100, 30]
    if (m.face[k + 3] > 128 && m.pale[k + 3] > 128) col = [250, 230, 200]
    if (m.face[k + 3] > 128 && m.stripe[k + 3] > 128) col = [30, 10, 10]
    if (m.nose[k + 3] > 128) col = [120, 40, 50]
    if (m.eye[k + 3] > 128) col = [255, 200, 40]
    if (m.pupil[k + 3] > 128 && m.eye[k + 3] > 128) col = [0, 0, 0]
    img.data.set([...col, 255], k)
  }
  g.putImageData(img, 0, 0)
  return c
}
