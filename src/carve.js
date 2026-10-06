// "The Roar Carving": the visitor carves a name (typed) and strokes (drawn)
// into a granite slab; the cuts glow with lava. Stone chips fly while
// carving. The finished slab saves as a 1080 x 1350 PNG for sharing.

const W = 1080
const H = 1350

function slab() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#3a3634')
  grad.addColorStop(1, '#1d1b1c')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 90000; i++) {
    const v = 40 + Math.random() * 90
    g.fillStyle = `rgba(${v},${v - 3},${v - 6},${Math.random() * 0.35})`
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  const vig = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.6)')
  g.fillStyle = vig
  g.fillRect(0, 0, W, H)
  // Inscription frame.
  g.fillStyle = 'rgba(210,195,180,0.5)'
  g.font = '600 26px "Cinzel", serif'
  g.textAlign = 'center'
  g.fillText('KOREA UNIVERSITY  ·  THE UNBROKEN ROAR', W / 2, 92)
  g.fillText('LIBERTAS  ·  JUSTITIA  ·  VERITAS', W / 2, H - 70)
  g.strokeStyle = 'rgba(210,195,180,0.25)'
  g.lineWidth = 2
  g.strokeRect(48, 48, W - 96, H - 96)
  return c
}

export class RoarCarving {
  constructor(canvas) {
    this.canvas = canvas
    canvas.width = W
    canvas.height = H
    this.g = canvas.getContext('2d')
    this.base = slab()
    this.text = ''
    this.strokes = []
    this.chips = []
    this.running = false
    const at = (e) => {
      const r = canvas.getBoundingClientRect()
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
    }
    let cur = null
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      cur = [at(e)]
      this.strokes.push(cur)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!cur) return
      const p = at(e)
      const q = cur.at(-1)
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 4) return
      cur.push(p)
      this.#chip(p, 3)
    })
    const end = () => (cur = null)
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)
  }

  setText(t) {
    const before = this.text
    this.text = t.slice(0, 12)
    if (this.text.length > before.length) for (let i = 0; i < 18; i++) this.#chip([W / 2 + (Math.random() - 0.5) * 600, H / 2 + (Math.random() - 0.5) * 120], 1)
  }

  clear() {
    this.text = ''
    this.strokes = []
  }

  #chip([x, y], n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 120 + Math.random() * 380
      this.chips.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: 1, r: 1.5 + Math.random() * 3.5 })
    }
  }

  // Cuts: a hot glow, a molten core, then a dark lip above and a pale lip below.
  #cut(g, draw, width, pulse) {
    g.save()
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.shadowColor = '#ff3a00'
    g.shadowBlur = 38 * pulse
    g.strokeStyle = '#8a0000'
    g.fillStyle = '#8a0000'
    g.lineWidth = width
    draw('base')
    g.shadowBlur = 12
    g.shadowColor = '#ffb040'
    g.strokeStyle = '#ff5a10'
    g.fillStyle = '#ff5a10'
    g.lineWidth = width * 0.45
    draw('core')
    g.shadowBlur = 0
    g.globalCompositeOperation = 'multiply'
    g.translate(0, -3)
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = width * 0.25
    draw('edge')
    g.restore()
  }

  draw(time = 0) {
    const g = this.g
    g.drawImage(this.base, 0, 0)
    const pulse = 0.85 + 0.15 * Math.sin(time * 3)
    for (const s of this.strokes) {
      if (s.length < 2) continue
      this.#cut(g, () => {
        g.beginPath()
        g.moveTo(...s[0])
        for (const p of s.slice(1)) g.lineTo(...p)
        g.stroke()
      }, 16, pulse)
    }
    if (this.text) {
      const size = Math.min(260, 1500 / Math.max(2, [...this.text].length))
      this.#cut(g, (mode) => {
        g.font = `900 ${size}px "Noto Serif KR", serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        if (mode === 'core') g.fillText(this.text, W / 2, H / 2)
        else {
          g.lineWidth = mode === 'base' ? size * 0.1 : size * 0.03
          g.strokeText(this.text, W / 2, H / 2)
          if (mode === 'base') g.fillText(this.text, W / 2, H / 2)
        }
      }, 16, pulse)
    }
    // Flying chips (live only).
    for (const c of this.chips) {
      g.fillStyle = `rgba(190,180,170,${c.life})`
      g.fillRect(c.x, c.y, c.r, c.r)
    }
  }

  tick(dt, time) {
    for (const c of this.chips) {
      c.vy += 900 * dt
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.life -= dt * 1.4
    }
    this.chips = this.chips.filter((c) => c.life > 0)
    this.draw(time)
  }

  toDataURL() {
    this.chips = []
    this.draw(0)
    return this.canvas.toDataURL('image/png')
  }
}
