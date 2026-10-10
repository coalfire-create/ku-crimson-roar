// 고연전: the stands as a card section. A stadium of supporters, each holding
// a card crimson on one side and white on the other; as the visitor scrolls
// a wave of flips runs across the stands and spells KOREA, then, once the
// scores are in, 우승. Drawn on a 2D canvas: a few thousand flipping cards.

const CRIMSON = '#a50034'
const WHITE = '#f6efe6'
const S = (x, a, b) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Which cards show white for a word: render it small, read it back.
function mask(word, cols, rows) {
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const g = c.getContext('2d', { willReadFrequently: true })
  g.fillStyle = '#000'
  g.fillRect(0, 0, cols, rows)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = rows * 0.86
  g.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`
  const w = g.measureText(word).width
  if (w > cols * 0.86) ((size *= (cols * 0.86) / w), (g.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`))
  g.fillText(word, cols / 2, rows / 2 + rows * 0.04)
  const d = g.getImageData(0, 0, cols, rows).data
  const out = new Uint8Array(cols * rows)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] > 128 ? 1 : 0
  return out
}

export class Rivalry {
  constructor(canvas) {
    this.canvas = canvas
    this.g = canvas.getContext('2d')
    this.progress = 0
    this.time = 0
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.w = w
    this.h = h
    this.portrait = w / h < 0.8
    this.cols = this.portrait ? 48 : 120
    this.rows = this.portrait ? 26 : 34
    this.words = [mask('KOREA', this.cols, this.rows), mask('우승', this.cols, this.rows)]
    this.seed = Float32Array.from({ length: this.cols * this.rows }, () => Math.random())
  }

  render(dt) {
    this.time += dt
    const { g, w, h, cols, rows } = this
    const p = this.progress
    // The night sky over the stadium, floodlit haze at the top.
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#120408')
    bg.addColorStop(0.5, '#1c060c')
    bg.addColorStop(1, '#09030a')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    for (const fx of [0.18, 0.82]) {
      const lg = g.createRadialGradient(w * fx, -h * 0.05, 0, w * fx, -h * 0.05, h * 0.7)
      lg.addColorStop(0, 'rgba(255,240,220,0.22)')
      lg.addColorStop(1, 'rgba(255,240,220,0)')
      g.fillStyle = lg
      g.fillRect(0, 0, w, h)
    }
    // The stands: rows rising away from us (smaller and closer together
    // toward the top), bowed a little like a real grandstand.
    const top = h * (this.portrait ? 0.08 : 0.06)
    const bottom = h * (this.portrait ? 0.4 : 0.62)
    const kWord = S(p, 0.04, 0.24) // KOREA forms
    const kWin = S(p, 0.72, 0.9) // and turns to VICTORY
    for (let r = 0; r < rows; r++) {
      const f = r / (rows - 1)
      const y = top + (bottom - top) * Math.pow(f, 1.25)
      const rowH = ((bottom - top) / rows) * (0.55 + f * 0.9)
      const inset = w * 0.06 * (1 - f)
      const cw = (w - inset * 2) / cols
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const s = this.seed[i]
        // Each card flips when the wave reaches its column.
        const at = (c / cols) * 0.55 + s * 0.08
        const t1 = Math.min(1, Math.max(0, kWord * 1.6 - at))
        const t2 = Math.min(1, Math.max(0, kWin * 1.6 - at))
        const a = this.words[0][i]
        const b = this.words[1][i]
        // From crimson, to the first word, to the second.
        let from = 0
        let to = a
        let t = t1
        if (t2 > 0) ((from = a), (to = b), (t = t2))
        const showTo = t > 0.5
        const side = from === to ? from : showTo ? to : from
        const flip = from === to ? 1 : Math.abs(Math.cos(t * Math.PI))
        // A ripple of hands raising cards, even at rest.
        const bob = Math.sin(this.time * 3 + c * 0.3 + r * 0.5) * rowH * 0.03
        const x = inset + c * cw + cw * 0.05
        const ww = cw * 0.9 * flip
        const hh = rowH * 0.86
        g.fillStyle = side ? WHITE : (r + c) % 2 ? CRIMSON : '#9d0f33'
        g.fillRect(x + (cw * 0.9 - ww) / 2, y + bob, ww, hh)
      }
    }
    // The supporters' heads in front of the bottom rows, and the field edge.
    g.fillStyle = '#0b0306'
    for (let c = 0; c < cols * 1.5; c++) {
      const x = (c / (cols * 1.5)) * w
      const y = bottom + h * 0.03 + Math.sin(this.time * 4 + c) * 2
      g.beginPath()
      g.arc(x, y, h * 0.018, 0, Math.PI * 2)
      g.fill()
    }
    const fg = g.createLinearGradient(0, bottom, 0, h)
    fg.addColorStop(0, 'rgba(9,3,10,0)')
    fg.addColorStop(0.25, 'rgba(9,3,10,0.92)')
    fg.addColorStop(1, '#09030a')
    g.fillStyle = fg
    g.fillRect(0, bottom, w, h - bottom)
  }
}
