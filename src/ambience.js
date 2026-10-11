// Per-chapter ambience, synthesized with Web Audio (no files to fetch): a
// low drone, night wind, crickets on the campus, the 입실렌티 crowd and its
// kick drum, 고연전 claps, and the makgeolli pour. Each layer is a looping
// buffer or a small graph behind its own gain; mix() eases the gains toward
// the levels the page asks for, so moving between chapters crossfades.

const LOOP = 4 // seconds per baked loop

export class Ambience {
  on = false
  ctx = null
  layers = {}

  // The first enable() must come from a user gesture (autoplay policy).
  enable(ctx) {
    this.ctx ??= ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (!this.master) this.#build()
    this.ctx.resume()
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4)
    this.on = true
  }

  disable() {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
    this.on = false
  }

  // levels: { drone, wind, crickets, crowd, beat, claps, pour } in 0..1.
  mix(levels) {
    if (!this.on) return
    const t = this.ctx.currentTime
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime((levels[k] || 0) * g.peak, t, 0.6)
  }

  #build() {
    const a = this.ctx
    this.master = a.createGain()
    this.master.gain.value = 0
    // A gentle limiter so the crowd and the drum never clip together.
    const comp = a.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp).connect(a.destination)

    const layer = (name, peak) => {
      const g = a.createGain()
      g.gain.value = 0
      g.peak = peak
      g.connect(this.master)
      return (this.layers[name] = g)
    }
    const loop = (buf, out) => {
      const s = a.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.connect(out)
      s.start()
      return s
    }
    const noise = this.#bake((d) => {
      // Pink-ish noise (Paul Kellet's cheap filter).
      let b0 = 0, b1 = 0, b2 = 0
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
      }
    })

    // Drone: two low tones a fifth apart under a soft filter.
    const drone = layer('drone', 0.07)
    const dlp = a.createBiquadFilter()
    dlp.type = 'lowpass'
    dlp.frequency.value = 380
    dlp.connect(drone)
    for (const [f, type] of [[55, 'sawtooth'], [82.4, 'triangle'], [110.3, 'sine']]) {
      const o = a.createOscillator()
      o.type = type
      o.frequency.value = f
      o.connect(dlp)
      o.start()
    }

    // Wind: noise through a slowly breathing lowpass.
    const wind = layer('wind', 0.35)
    const wlp = a.createBiquadFilter()
    wlp.type = 'lowpass'
    wlp.frequency.value = 420
    wlp.connect(wind)
    const wl = a.createOscillator()
    const wg = a.createGain()
    wl.frequency.value = 0.08
    wg.gain.value = 220
    wl.connect(wg).connect(wlp.frequency)
    wl.start()
    loop(noise, wlp)

    // Crowd: noise shaped into voices (two vowel bands) that swell and ebb.
    const crowd = layer('crowd', 0.55)
    const swell = a.createGain()
    swell.gain.value = 0.75
    swell.connect(crowd)
    for (const [f, q] of [[650, 0.9], [1900, 1.4]]) {
      const bp = a.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = q
      bp.connect(swell)
      loop(noise, bp)
    }
    const cl = a.createOscillator()
    const cg = a.createGain()
    cl.frequency.value = 0.11
    cg.gain.value = 0.3
    cl.connect(cg).connect(swell.gain)
    cl.start()

    // 입실렌티 drum: four on the floor at 124 bpm, claps on two and four.
    const beat = layer('beat', 0.5)
    loop(
      this.#bake((d, sr) => {
        const spb = 60 / 124
        for (let n = 0; n * spb < LOOP; n++) {
          const s0 = Math.floor(n * spb * sr)
          for (let i = 0; i < sr * 0.35 && s0 + i < d.length; i++) {
            const t = i / sr
            d[s0 + i] += Math.sin(2 * Math.PI * (45 * t + (75 / 18) * (1 - Math.exp(-18 * t)))) * Math.exp(-7 * t) * 0.9
          }
          if (n % 2) for (let i = 0; i < sr * 0.12 && s0 + i < d.length; i++) d[s0 + i] += (Math.random() * 2 - 1) * Math.exp((-i / sr) * 40) * 0.35
        }
      }),
      beat,
    )

    // 고연전 응원: a crowd clapping a rhythm (짝짝 짝짝짝), with a little spread.
    const claps = layer('claps', 1.1)
    const chp = a.createBiquadFilter()
    chp.type = 'highpass'
    chp.frequency.value = 700
    chp.connect(claps)
    loop(
      this.#bake((d, sr) => {
        const hits = [0, 0.3, 0.9, 1.2, 1.5, 2, 2.3, 2.9, 3.2, 3.5]
        for (const h of hits)
          for (let k = 0; k < 14; k++) {
            const s0 = Math.floor((h + Math.random() * 0.035) * sr)
            for (let i = 0; i < sr * 0.05 && s0 + i < d.length; i++) d[s0 + i] += (Math.random() * 2 - 1) * Math.exp((-i / sr) * 90) * 0.12
          }
      }),
      chp,
    )

    // Crickets: two chirping at different rates — the campus at night.
    const crickets = layer('crickets', 0.22)
    loop(
      this.#bake((d, sr) => {
        for (const [f, every, offset] of [[4400, 0.62, 0], [5100, 0.83, 0.3]])
          for (let c = offset; c < LOOP - 0.2; c += every * (0.9 + Math.random() * 0.2))
            for (let p = 0; p < 3; p++) {
              const s0 = Math.floor((c + p * 0.045) * sr)
              for (let i = 0; i < sr * 0.03; i++) d[s0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * Math.sin((Math.PI * i) / (sr * 0.03)) * 0.5
            }
      }),
      crickets,
    )

    // Makgeolli: a thick stream into the bowl and bubbles that glug up in pitch.
    const pour = layer('pour', 0.5)
    const pbp = a.createBiquadFilter()
    pbp.type = 'bandpass'
    pbp.frequency.value = 1100
    pbp.Q.value = 0.7
    pbp.connect(pour)
    loop(
      this.#bake((d, sr) => {
        let ph = 0
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.18
        for (let b = 0; b < 70; b++) {
          const s0 = Math.floor(Math.random() * (LOOP - 0.1) * sr)
          const f0 = 280 + Math.random() * 520
          const len = 0.03 + Math.random() * 0.05
          for (let i = 0; i < sr * len; i++) {
            const t = i / sr
            ph += (2 * Math.PI * f0 * (1 + t * 14)) / sr
            d[s0 + i] += Math.sin(ph) * Math.exp(-t / (len * 0.4)) * 0.5
          }
        }
      }),
      pbp,
    )
  }

  // A mono loop buffer filled by fn(data, sampleRate).
  #bake(fn) {
    const a = this.ctx
    const buf = a.createBuffer(1, a.sampleRate * LOOP, a.sampleRate)
    fn(buf.getChannelData(0), a.sampleRate)
    return buf
  }
}
