import './style.css'
import gsap from 'gsap'
import * as THREE from 'three'
import Lenis from 'lenis'
import { Rivalry } from './scenes/rivalry.js'
import { Symbols3D } from './scenes/symbols3d.js'
import { ShaderCanvas } from './shader-canvas.js'
import { AURORA } from './scenes/shaders.js'
import { Hero3D } from './scenes/hero3d.js'
import { INFO } from './data/info.js'
import { LINEUP } from './data/lineup.js'
import { FRONTIERS } from './data/frontiers.js'
import { Ambience } from './ambience.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => t * t * (3 - 2 * t)
const TIMELINE = [
  [1905, '보성전문학교 개교'],
  [1932, '인촌 김성수, 학교 인수'],
  [1934, '안암 언덕에 본관 완공'],
  [1937, '석조 도서관 완공'],
  [1946, '종합대학 고려대학교로'],
  [1960, '4·18 고대생 의거'],
  [2005, '개교 100주년'],
  [2026, '그리고 지금, 당신의 차례'],
]
const KIND = { c: '캠퍼스 건물', g: '석조 건물', m: '현대식 건물', h: '의료 시설', d: '기숙사' }

function splitChars(el) {
  el.setAttribute('aria-label', el.textContent)
  const words = el.textContent.split(' ')
  el.textContent = ''
  words.forEach((w, n) => {
    const word = document.createElement('span')
    word.className = 'word'
    word.setAttribute('aria-hidden', 'true')
    for (const ch of w) {
      const c = document.createElement('span')
      c.className = 'char'
      c.textContent = ch
      word.appendChild(c)
    }
    el.appendChild(word)
    if (n < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
}

// Upload every texture a scene uses (maps, shader uniforms, background) to
// the GPU now, so none is uploaded mid-scroll: a big one stalls a phone for
// a second the first time its chapter draws.
function warmTextures(view) {
  const { renderer, scene } = view
  if (!renderer?.initTexture || !scene) return
  const seen = new Set()
  const add = (v) => v?.isTexture && !v.isRenderTargetTexture && v.image && seen.add(v)
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k in m) add(m[k])
      if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u?.value)
    }
  })
  add(scene.background)
  for (const t of seen) {
    try {
      renderer.initTexture(t)
    } catch {}
  }
}

// Textures that finish loading later (photographs, the aerial) are uploaded
// in the background, one per frame, before their chapter is reached.
const warmQ = []
const queued = new WeakSet()
function scanTextures(views) {
  for (const { renderer, scene } of views) {
    if (!renderer?.initTexture || !scene) continue
    scene.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        const cand = []
        for (const k in m) cand.push(m[k])
        if (m.uniforms) for (const u of Object.values(m.uniforms)) cand.push(u?.value)
        for (const t of cand) {
          if (!t?.isTexture || t.isRenderTargetTexture || !t.image || queued.has(t)) continue
          const img = t.image
          if (img instanceof HTMLImageElement && !(img.complete && img.naturalWidth)) continue
          if (renderer.properties.get(t).__version === t.version) continue
          queued.add(t)
          warmQ.push([renderer, t])
        }
      }
    })
  }
}
function warmOne() {
  const job = warmQ.shift()
  if (!job) return
  queued.delete(job[1])
  try {
    job[0].initTexture(job[1])
  } catch {}
}

// A roar: a low growl swelling under a noise burst.
let audio = null
let roarNoise = null
function roarSound() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)()
  const a = audio
  const t = a.currentTime
  const o = a.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(95, t)
  o.frequency.exponentialRampToValueAtTime(55, t + 1.1)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, t)
  lp.frequency.exponentialRampToValueAtTime(220, t + 1.2)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.3)
  // Growl flutter.
  const lfo = a.createOscillator()
  const lg = a.createGain()
  lfo.frequency.value = 23
  lg.gain.value = 0.25
  lfo.connect(lg).connect(g.gain)
  o.connect(lp).connect(g).connect(a.destination)
  const n = a.createBufferSource()
  // The noise burst is made once and reused (filling it is costly on phones).
  if (!roarNoise) {
    roarNoise = a.createBuffer(1, a.sampleRate * 1.2, a.sampleRate)
    const d = roarNoise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2)
  }
  n.buffer = roarNoise
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 500
  const ng = a.createGain()
  ng.gain.value = 0.35
  n.connect(bp).connect(ng).connect(a.destination)
  for (const s of [o, lfo, n]) (s.start(t), s.stop(t + 1.35))
}

// Ambience: each chapter has its sound; the mix follows what is on screen.
const amb = new Ambience()
const AMB = {
  hero: { drone: 0.6, wind: 0.25 },
  fortress: { wind: 0.6, drone: 0.25 },
  pride: { crowd: 0.8, beat: 1 },
  frontier: { crickets: 0.8, wind: 0.3 },
  fields: { drone: 0.4, crickets: 0.2 },
  rivalry: { crowd: 1, claps: 0.9 },
  symbols: { drone: 0.45, wind: 0.2 },
  gate: { crowd: 0.35, drone: 0.45, crickets: 0.25 },
}
function setupSound() {
  const btn = document.getElementById('soundBtn')
  const secs = Object.keys(AMB).map((id) => [id, document.getElementById(id)])
  btn.addEventListener('click', () => {
    if (amb.on) amb.disable()
    else amb.enable((audio ??= new (window.AudioContext || window.webkitAudioContext)()))
    btn.classList.toggle('is-on', amb.on)
    btn.setAttribute('aria-pressed', amb.on)
  })
  setInterval(() => {
    if (!amb.on) return
    const vh = innerHeight
    const lv = {}
    for (const [id, el] of secs) {
      const r = el.getBoundingClientRect()
      const w = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh
      if (!w) continue
      for (const [k, v] of Object.entries(AMB[id])) lv[k] = Math.max(lv[k] || 0, v * w)
      // The makgeolli pour, while the kettle tips (late in the symbols run).
      if (id === 'symbols') {
        const p = -r.top / Math.max(1, r.height - vh)
        if (p > 0.74 && p < 0.95) ((lv.pour = w), (lv.crickets = Math.max(lv.crickets || 0, 0.35 * w)))
      }
    }
    amb.mix(lv)
  }, 250)
}

async function boot() {
  setupSound()
  // The opening needs only its shader; every later chapter loads while the loader counts.
  const chapterMods = Promise.all([import('./scenes/fortress.js'), import('./scenes/heart.js'), import('./scenes/anam.js'), import('./scenes/gate.js'), import('./scenes/frontiers.js')])

  const num = document.getElementById('loaderNum')
  const bar = document.getElementById('loaderBar')
  // Loading progress follows the real stages (fonts, chapters, the tiger,
  // the campus, the warm-up), easing toward each.
  const c = { v: 0, target: 8 }
  const setLoad = (v) => (c.target = Math.max(c.target, v))
  const paint = () => {
    c.v += (c.target - c.v) * 0.06
    num.textContent = Math.round(c.v)
    bar.style.transform = `scaleX(${c.v / 100})`
  }
  gsap.ticker.add(paint)
  // Creeps on between stages, so the bar never looks stuck.
  const creep = setInterval(() => setLoad(Math.min(c.target + 1.5, 94)), 400)
  await Promise.race([
    Promise.all([
      document.fonts.load('900 100px "Noto Serif KR"', '高麗'),
      document.fonts.load('italic 400 60px "Instrument Serif"', 'Korea'),
      document.fonts.load('700 60px "Cinzel"', 'LIBERTAS'),
      document.fonts.load('500 12px "JetBrains Mono"', 'SPEED'),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ])
  setLoad(18)

  // Mobile browsers change innerHeight as the address bar slides; only take a
  // new viewport height when the width changes.
  let viewH = innerHeight
  let viewW = innerWidth
  addEventListener('resize', () => innerWidth !== viewW && ((viewW = innerWidth), (viewH = innerHeight)))
  const touch = matchMedia('(hover: none)').matches

  /* Opening: the real tiger, roaring in the dark. */
  const heroEl = document.getElementById('hero')
  const heroSticky = heroEl.querySelector('.scene__sticky')
  const hero = new Hero3D(document.getElementById('cvHero'))
  if (import.meta.env.DEV) window.__tiger = hero
  const eyeState = { open: 0, intro: 0 }
  let blinkAt = 3
  let blastT = -1
  const roar = () => {
    blastT = 0
    hero.roar()
    try {
      roarSound()
    } catch {}
  }
  // The first scroll wakes it too: the same growl and jolt.
  hero.onRoar = () => {
    blastT = 0
    try {
      roarSound()
    } catch {}
  }
  // A click roars; a drag only turns the face.
  heroEl.addEventListener('click', (e) => {
    if (e.target.closest('a')) return
    if (e.target.closest('button') && e.target.id !== 'roarBtn') return
    if (e.target.id !== 'roarBtn' && hero.dragged) return
    roar()
  })

  const heroBody = document.querySelector('.hero__body')
  const heroWord = document.querySelector('.hero__word')
  let time = 0
  const heroView = {
    render(dt) {
      hero.render(dt)
    },
  }
  // The opening is one beat, not a long scroll: the first scroll down sets the
  // tiger leaping at the viewer, and as it fills the frame the page carries
  // straight on into the next chapter. Back at the top, it is ready again.
  const LEAP_DUR = 2.2
  let chapterReady = null
  let chapterViews = []
  let chapterRenders = []
  let introDone = false
  let leapRun = null
  let leapP = 0
  const startLeap = () => {
    if (leapRun || !chapterTick || !introDone || scrollY > 4) return false
    leapRun = { t: 0, went: false }
    return true
  }
  addEventListener('wheel', (e) => e.deltaY > 4 && startLeap(), { passive: true })
  let touchY = null
  addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true })
  addEventListener('touchmove', (e) => touchY !== null && touchY - e.touches[0].clientY > 12 && startLeap(), { passive: true })
  addEventListener('keydown', (e) => ['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(e.key) && startLeap())
  const heroTick = (dt) => {
    if (leapRun) {
      leapRun.t += dt
      leapP = clamp01(leapRun.t / LEAP_DUR)
      // The next chapter starts fading in while the embers are still rising.
      if (!leapRun.went && leapRun.t > LEAP_DUR * 0.4) {
        leapRun.went = true
        lenis.start()
        lenis.scrollTo('#fortress', { duration: 1.8, force: true, easing: (x) => x * x * (3 - 2 * x), onComplete: () => (leapRun = null) })
      }
    } else if (chapterTick && scrollY <= 4) {
      // Back at the very top: the tiger stands ready and the page waits for the leap.
      leapP = 0
      if (!lenis.isStopped && !document.querySelector('.vmodal:not([hidden]), .vs:not([hidden])')) lenis.stop()
    } else if (scrollY > viewH * 0.5) leapP = 1
    else leapP = 0
    const hp = leapP
    // The tiger no longer charges; the opening ends in embers instead.
    hero.progress = 0
    hero.exit = hp
    heroBody.style.transform = `translateY(${hp * -18}vh)`
    heroBody.style.opacity = (1 - clamp01((hp - 0.6) / 0.4)).toFixed(3)
    heroWord.style.transform = `scale(${1 + hp * 0.08})`
    // The title steps back as the tiger charges in.
    heroWord.style.opacity = (1 - clamp01((hp - 0.5) / 0.22)).toFixed(3)
    // Blink now and then.
    blinkAt -= dt
    let blink = 0
    if (blinkAt < 0.16) blink = Math.sin(clamp01(1 - blinkAt / 0.16) * Math.PI)
    if (blinkAt < 0) blinkAt = 2.5 + Math.random() * 4
    hero.blink = blink
    hero.open = eyeState.open
    hero.intro = eyeState.intro
    // The roar: shockwave, shake.
    if (blastT >= 0) {
      blastT += dt
      const s = Math.max(0, 1 - blastT / 0.6)
      heroSticky.style.translate = s > 0 ? `${((Math.random() - 0.5) * 14 * s).toFixed(1)}px ${((Math.random() - 0.5) * 14 * s).toFixed(1)}px` : ''
      if (blastT > 1.2) blastT = -1
    }
  }

  document.querySelectorAll('.split').forEach(splitChars)

  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 })
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.stop()
  document.querySelectorAll('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      // The hero's own "Scroll" starts the leap; everything else just goes.
      if (a.getAttribute('href') === '#fortress' && a.closest('.hero') && startLeap()) return
      lenis.start()
      lenis.scrollTo(a.getAttribute('href'), { duration: 2, force: true })
    }),
  )

  let chapterTick = null
  let last = performance.now()
  gsap.ticker.add(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt
    if (chapterTick) chapterTick(dt)
    else {
      heroTick(dt)
      heroView.render(dt)
    }
  })

  // Build every chapter now, behind the loader: done later, it stalled the
  // opening (the tiger-to-shield morph) for most of a second.
  if (import.meta.env.DEV) window.__marks = { tween: performance.now() }
  const mods = await chapterMods
  setLoad(35)
  await new Promise((r) => requestAnimationFrame(r))
  chapterTick = setupChapters(mods)
  setLoad(55)
  if (import.meta.env.DEV) window.__marks.chapters = performance.now()
  // Hold the curtain until the tiger has loaded and everything behind it has
  // drawn a few frames (shaders compiled, buffers uploaded), so the curtain
  // lifts on a scene that is already running smoothly.
  for (let t0 = performance.now(); !hero.tiger?.ready && performance.now() - t0 < 5000; ) await new Promise((r) => setTimeout(r, 50))
  setLoad(70)
  await Promise.race([chapterReady, new Promise((r) => setTimeout(r, 6000))])
  setLoad(85)
  // With the campus fully built, put every chapter's textures on the GPU;
  // whatever loads later is picked up in the background.
  for (const v of chapterViews) warmTextures(v)
  setInterval(() => scanTextures(chapterViews), 1200)
  // And draw every chapter once, off screen: its first frame uploads all its
  // geometry, which otherwise lands mid-scroll (a second's stall on phones
  // as the campus first appears).
  for (const v of chapterRenders) {
    try {
      v.render(1 / 60)
    } catch {}
    await new Promise((r) => requestAnimationFrame(r))
  }
  for (let n = 0; n < 6; n++) await new Promise((r) => requestAnimationFrame(r))
  // Count to the top, hold a beat, then lift the curtain.
  clearInterval(creep)
  setLoad(100)
  while (c.v < 99) await new Promise((r) => requestAnimationFrame(r))
  c.v = 100
  paint()
  await new Promise((r) => setTimeout(r, 350))
  gsap.ticker.remove(paint)
  if (import.meta.env.DEV) window.__marks.lift = performance.now()
  /* intro: the pale screen wipes up, the eyes open, "Korea" rises */
  const intro = new Promise((done) =>
    gsap
      .timeline({ onComplete: done })
      .to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.inOut' })
      .to(eyeState, { intro: 1, duration: 3.2, ease: 'power2.out' }, '-=0.6')
      .to(eyeState, { open: 1, duration: 1.2, ease: 'power2.out' }, '-=1.0')
      .from('.hero .char', { yPercent: 110, opacity: 0, stagger: 0.07, duration: 1.4, ease: 'expo.out' }, '-=2.6')
      .from('.nav, .hero .eyebrow, .reveal-hero', { y: 20, opacity: 0, stagger: 0.08, duration: 1, ease: 'power3.out' }, '-=1.1'),
  )
  await intro
  introDone = true
  // A breath after the intro the tiger roars, and the emblem above the title
  // comes up with a sweep of light across it.
  gsap
    .timeline({ delay: 0.5 })
    .call(() => hero.roar())
    .fromTo('.hero__crest', { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'expo.out' }, 0.25)
    .fromTo('.hero__crest', { '--shine': '-60%' }, { '--shine': '160%', duration: 1.4, ease: 'power2.inOut' }, 0.6)
  if (import.meta.env.DEV) window.__marks.introDone = performance.now()
  lenis.start()

  function setupChapters([{ Fortress }, { Heart }, { AnamFlight }, { Gate }, { Frontiers }]) {
    const fields = new Frontiers(document.getElementById('cvFields'))
    const fortress = new Fortress(document.getElementById('cvFortress'))
    const heart = new Heart(document.getElementById('cvHeart'))
    const aurora = new ShaderCanvas(document.getElementById('cvAurora'), AURORA, { maxDpr: 1, uniforms: { uEnergy: 0, uBeat: 0 } })
    const flight = new AnamFlight(document.getElementById('cvFlight'))
    const rivalry = new Rivalry(document.getElementById('cvRivalry'))
    const symbols = new Symbols3D(document.getElementById('cvSymbols'))
    // All of 입실렌티's lineups, built now rather than at each act change.
    heart.stage.prepare(LINEUP.acts, heart.renderer, heart.scene, heart.camera, heart.composer)
    if (import.meta.env.DEV) window.__flight = flight
    chapterReady = flight.terrainReady
    // The campus tiger's roar: the growl and a jolt through the frame.
    flight.onRoar = () => {
      try {
        roarSound()
      } catch {}
      const st = document.querySelector('#frontier .scene__sticky')
      gsap.fromTo(st, { x: -12, y: 6 }, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.25)' })
    }
    const gate = new Gate(document.getElementById('cvGate'))
    gate.onRoar = () => {
      try {
        roarSound()
      } catch {}
    }
    if (import.meta.env.DEV) Object.assign(window, { __flight: flight, __fortress: fortress, __heart: heart, __gate: gate })

    // Compile every chapter's shaders now, behind the loading screen, so no
    // chapter stalls the first time it scrolls into view.
    chapterViews = [hero, fortress, heart, flight, fields, symbols, gate]
    for (const v of [fortress, heart, flight, fields, symbols]) v.renderer?.compileAsync?.(v.scene, v.camera).catch(() => {})

    let beat = 0
    const scenes = [
      { el: heroEl, view: heroView },
      { el: document.getElementById('fortress'), view: fortress },
      {
        el: document.getElementById('pride'),
        view: {
          render(dt) {
            beat = Math.max(0, beat - dt * 3)
            aurora.set('uEnergy', heart.energy)
            aurora.set('uBeat', beat)
            aurora.render(time, dt)
            heart.render(dt)
          },
        },
      },
      { el: document.getElementById('frontier'), view: flight },
      { el: document.getElementById('fields'), view: fields },
      { el: document.getElementById('rivalry'), view: rivalry },
      { el: document.getElementById('symbols'), view: symbols },
      {
        el: document.getElementById('gate'),
        view: {
          render(dt) {
            gate.render(dt)
          },
        },
      },
    ]
    chapterRenders = scenes.slice(1).map((s) => s.view)
    const io = new IntersectionObserver((es) => es.forEach((e) => (scenes.find((s) => s.el === e.target).on = e.isIntersecting)), { rootMargin: '5% 0px' })
    scenes.forEach((s) => io.observe(s.el))
    const progress = (el) => {
      const r = el.getBoundingClientRect()
      const last = el === scenes.at(-1).el
      return clamp01(-r.top / Math.max(1, r.height - viewH * (last ? 1 : 2)))
    }
    scenes.forEach((s, i) => {
      s.el.style.zIndex = i + 1
      s.sticky = s.el.querySelector('.scene__sticky')
      s.shade = document.createElement('div')
      s.shade.className = 'scene__shade'
      s.flash = document.createElement('div')
      s.flash.className = 'scene__flash'
      s.sticky.append(s.shade, s.flash)
    })

    // Headlines rise line by line, behind a mask, as their chapter arrives.
    const splitLines = (el) => {
      const parts = el.innerHTML.split(/<br\s*\/?>/i)
      el.innerHTML = parts.map((p) => `<span class="line"><span class="line__in">${p.trim()}</span></span>`).join('')
    }
    document.querySelectorAll('.fortress__head .h2, .pride__copy .h2, .flight__head .h2, .rivalry__copy .h2, .gate__title').forEach(splitLines)
    document.querySelectorAll('.gate__top, .gate__row').forEach((el) => el.classList.add('gate-extra'))
    // The finale's title comes letter by letter, and each line of its story
    // word by word: every text node is wrapped, keeping <em>, <small>, <br>.
    const wrapText = (root, cls, unit) => {
      const out = []
      for (const node of [...root.childNodes]) {
        if (node.nodeType === 1) {
          if (node.tagName !== 'SMALL' && node.tagName !== 'BR') out.push(...wrapText(node, cls, unit))
          continue
        }
        if (node.nodeType !== 3 || !node.textContent.trim()) continue
        const frag = document.createDocumentFragment()
        for (const part of node.textContent.split(unit === 'word' ? /(\s+)/ : /(\s)|/u).filter(Boolean)) {
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part))
            continue
          }
          const sp = document.createElement('span')
          sp.className = cls
          sp.textContent = part
          frag.appendChild(sp)
          out.push(sp)
        }
        node.replaceWith(frag)
      }
      return out
    }
    const gateBody = document.querySelector('.gate__body')
    const titleLines = [...document.querySelectorAll('.gate__title .line__in')].map((ln) => wrapText(ln, 'gch', 'char'))
    scenes.slice(1).forEach((s) => {
      // (The finale's title is revealed letter by letter instead.)
      s.lines = s.el.id === 'gate' ? [] : s.el.querySelectorAll('.line__in')
      s.extras = s.el.querySelectorAll(':scope .scene__sticky > div > .kicker, :scope .scene__sticky > div > .body, :scope .gate-extra')
      gsap.set(s.lines, { yPercent: 130 })
      gsap.set(s.extras, { opacity: 0, y: 18 })
      s.shown = false
    })
    gsap.set(titleLines.flat(), { opacity: 0 })
    // The finale's title, letter by letter: each one lands large and soft and
    // settles into place; a beat between the lines; then a glow runs through
    // the words and the emblem and the rest come up.
    const revealTitle = (s, on) => {
      gsap.killTweensOf([...titleLines.flat(), gateBody, '.gate__title', ...s.extras])
      if (!on) {
        gateBody.classList.remove('is-on')
        gsap.to(titleLines.flat(), { opacity: 0, duration: 0.3 })
        gsap.to(s.extras, { opacity: 0, y: 18, duration: 0.3 })
        return
      }
      gateBody.classList.add('is-on')
      const tl = gsap.timeline()
      let at = 0.15
      titleLines.forEach((chars) => {
        tl.fromTo(
          chars,
          { opacity: 0, scale: 2.1, yPercent: -22, filter: MOBILE ? 'none' : 'blur(18px)' },
          { opacity: 1, scale: 1, yPercent: 0, filter: MOBILE ? 'none' : 'blur(0px)', duration: 1.3, stagger: 0.11, ease: 'expo.out' },
          at,
        )
        at += chars.length * 0.11 + 0.45
      })
      tl.fromTo('.gate__title', { '--glow': 0 }, { '--glow': 1, duration: 0.45, ease: 'power2.out', yoyo: true, repeat: 1 }, at + 0.35)
      tl.fromTo(s.extras, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1, stagger: 0.1, ease: 'power3.out' }, at + 0.5)
    }
    const reveal = (s, on) => {
      if (on === s.shown) return
      s.shown = on
      if (s.el.id === 'gate') return revealTitle(s, on)
      if (on) {
        gsap.to(s.lines, { yPercent: 0, duration: 1.2, stagger: 0.09, ease: 'expo.out', overwrite: true })
        gsap.to(s.extras, { opacity: 1, y: 0, duration: 1, stagger: 0.08, delay: 0.25, ease: 'power3.out', overwrite: true })
      } else {
        gsap.to(s.lines, { yPercent: 130, duration: 0.4, ease: 'power2.in', overwrite: true })
        gsap.to(s.extras, { opacity: 0, y: 18, duration: 0.3, overwrite: true })
      }
    }

    // Chapters hand over by dissolving into one another (see transitions());
    // the blur is left off on phones, where it costs too much.
    const MOBILE = innerWidth < 760

    const navLinks = [...document.querySelectorAll('.nav__links a')]
    const progressLine = document.getElementById('progressLine')
    const pin = (s, top, on, extra = '') => (s.sticky.style.transform = on ? `translate3d(0, ${-top}px, 0) ${extra}` : '')
    let current = 0
    const transitions = () => {
      current = 0
      for (let i = 1; i < scenes.length; i++) {
        const s = scenes[i]
        const prev = scenes[i - 1]
        const top = s.el.getBoundingClientRect().top
        const k = clamp01(1 - top / viewH)
        const on = k > 0 && k < 1
        if (top <= viewH * 0.5) current = i
        if (i === 3) {
          // Into the campus: a dip through darkness, then the camera drops out of the sky.
          if (!MOBILE) pin(s, top, on, `scale(${1 + (1 - k) * 0.06})`)
          s.sticky.style.opacity = on ? ease(clamp01((k - 0.3) / 0.5)).toFixed(3) : ''
          flight.intro = 1 - k
          // A dip through darkness rather than a flash.
          prev.flash.style.opacity = '0'
          prev.shade.style.opacity = on ? (Math.sin(Math.PI * clamp01(k / 0.6)) * 0.8).toFixed(3) : '0'
          if (on && !MOBILE) prev.sticky.style.transform = `scale(${1 + k * 0.1})`
          reveal(s, k > 0.8)
          continue
        }
        // A cinematic dissolve: the next chapter fades up out of a soft blur,
        // settling from a slight zoom, while the last one drifts forward and
        // dims beneath it.
        const e = ease(clamp01((k - 0.05) / 0.85))
        // Phones: the next chapter simply rises with the page as it fades in;
        // nothing is moved from script, so touch scrolling stays native and
        // smooth (script-driven movement lags a frame behind the finger).
        if (MOBILE) {
          s.sticky.style.opacity = on ? e.toFixed(3) : ''
        } else {
          pin(s, top, on, `scale(${(1.06 - 0.06 * e).toFixed(4)})`)
          s.sticky.style.opacity = on ? e.toFixed(3) : ''
          s.sticky.style.filter = on ? `blur(${((1 - e) * 6).toFixed(2)}px)` : ''
          if (on) prev.sticky.style.transform = `scale(${(1 + k * 0.07).toFixed(4)})`
        }
        prev.shade.style.opacity = on ? (ease(k) * 0.55).toFixed(3) : '0'
        s.flash.style.opacity = '0'
        // The finale's words wait until the doors have opened.
        reveal(s, s.el.id === 'gate' ? (gate.story ?? 0) > 0.86 : k > 0.6)
      }
      navLinks.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + scenes[current].el.id))
      progressLine.style.transform = `scaleX(${clamp01(scrollY / Math.max(1, document.documentElement.scrollHeight - viewH))})`
    }

    /* Fortress: timeline and the floating part tag. */
    const tl = document.getElementById('timeline')
    const tlItems = TIMELINE.map(([y, t]) => {
      const li = document.createElement('li')
      li.innerHTML = `<b>${y}</b><span>${t}</span>`
      tl.appendChild(li)
      return li
    })
    const partTag = document.getElementById('partTag')
    // Season caption: changes as the year turns over.
    const seasonEl = document.getElementById('season')
    let seasonKey = null
    const showSeason = () => {
      const { a, t } = fortress.season()
      const s = t > 0.5 ? fortress.season().b : a
      if (s.key === seasonKey) return
      seasonKey = s.key
      seasonEl.querySelector('b').textContent = s.name
      seasonEl.querySelector('small').textContent = s.en
      seasonEl.querySelector('span').textContent = s.line
      gsap.fromTo(seasonEl, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', overwrite: true })
    }

    /* Frontiers: the copy for whichever field is on screen. */
    const fieldEls = Object.fromEntries(['No', 'Kind', 'Name', 'En', 'Head', 'Body', 'Facts'].map((k) => [k, document.getElementById('field' + k)]))
    const fieldSteps = FRONTIERS.map((f, i) => {
      const li = document.createElement('li')
      li.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span>${f.name}</span>`
      document.getElementById('fieldSteps').appendChild(li)
      return li
    })
    let fieldIdx = -1
    const showField = () => {
      const { i } = fields.chapter()
      fieldSteps.forEach((li, k) => li.classList.toggle('is-on', k === i))
      if (i === fieldIdx) return
      fieldIdx = i
      const f = FRONTIERS[i]
      fieldEls.No.textContent = `${String(i + 1).padStart(2, '0')} / ${String(FRONTIERS.length).padStart(2, '0')}`
      fieldEls.Kind.textContent = f.kind
      fieldEls.Name.textContent = f.name
      fieldEls.En.textContent = f.en
      fieldEls.Head.textContent = f.head
      fieldEls.Body.textContent = f.body
      fieldEls.Facts.innerHTML = f.facts.map((x) => `<li>${x}</li>`).join('')
      document.getElementById('fieldsCopy').dataset.key = f.key
      gsap.fromTo(Object.values(fieldEls), { opacity: 0, x: -24, filter: 'blur(8px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.05, ease: 'expo.out', overwrite: true })
    }

    /* Pride: the night's lineup, one act per stretch of scroll. */
    const actEl = document.getElementById('act')
    const actEls = Object.fromEntries(['No', 'Name', 'En', 'Sub'].map((k) => [k, document.getElementById('act' + k)]))
    const beams = document.getElementById('beams')
    document.getElementById('lineupTitle').textContent = `${LINEUP.year} IPSELENTI · ${LINEUP.edition}`
    document.getElementById('lineupNote').textContent = LINEUP.note
    // Desktop: the video card lives in the lineup panel, under the list,
    // clear of the act's name in the middle of the stage.
    if (innerWidth >= 760) document.querySelector('.lineup').appendChild(document.getElementById('stageScreen') ?? document.querySelector('.stage-screen'))
    const lineupItems = LINEUP.acts.map((a) => {
      const li = document.createElement('li')
      li.innerHTML = `<b>${a.name}</b><small>${a.en}</small>`
      document.getElementById('lineupList').appendChild(li)
      return li
    })
    const stageScreen = document.getElementById('stageScreen')
    const stageThumb = document.getElementById('stageThumb')
    const vmodal = document.getElementById('vmodal')
    const vframe = document.getElementById('vframe')
    const closeVideo = () => {
      vmodal.hidden = true
      vframe.src = ''
      lenis.start()
    }
    stageScreen.addEventListener('click', () => {
      vframe.src = `https://www.youtube-nocookie.com/embed/${stageScreen.dataset.video}?autoplay=1&rel=0&playsinline=1`
      vmodal.hidden = false
      lenis.stop()
    })
    document.getElementById('vclose').addEventListener('click', closeVideo)
    vmodal.addEventListener('click', (e) => e.target === vmodal && closeVideo())
    addEventListener('keydown', (e) => e.key === 'Escape' && !vmodal.hidden && closeVideo())
    let actIdx = -1
    const ACT_FROM = 0.08
    const ACT_TO = 0.9
    const showAct = (p) => {
      const n = LINEUP.acts.length
      const i = p < ACT_FROM ? -1 : Math.min(n - 1, Math.floor(((p - ACT_FROM) / (ACT_TO - ACT_FROM)) * n))
      lineupItems.forEach((li, k) => (li.classList.toggle('is-past', k < i), li.classList.toggle('is-on', k === i)))
      if (i === actIdx) return
      actIdx = i
      actEl.classList.toggle('is-on', i >= 0)
      heart.setAct(i >= 0 ? LINEUP.acts[i] : null)
      if (i < 0) return void (stageScreen.hidden = true)
      const a = LINEUP.acts[i]
      actEls.No.textContent = a.head ? 'HEADLINER' : `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`
      actEls.Name.textContent = a.name
      // Long names (올데이 프로젝트) step down so the whole name always fits.
      const len = [...a.name].length
      actEls.Name.style.fontSize = len > 4 ? `min(clamp(54px, 9vw, 140px), ${(88 / len).toFixed(1)}vw)` : ''
      actEls.En.textContent = a.en
      actEls.Sub.textContent = a.sub || ''
      actEl.classList.toggle('is-head', !!a.head)
      // The stage screen cuts to this act's footage.
      if (a.video) {
        stageScreen.hidden = false
        stageScreen.dataset.video = a.video
        stageThumb.src = `https://i.ytimg.com/vi/${a.video}/hqdefault.jpg`
        stageThumb.alt = `${a.name} 입실렌티 무대`
        gsap.fromTo(stageScreen, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out', overwrite: true })
      }
      // (Phones: opacity and scale only; animated blur and letter-spacing
      // repaint the whole huge word every frame.)
      if (MOBILE) gsap.fromTo(actEls.Name, { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'expo.out', overwrite: true })
      else gsap.fromTo(actEls.Name, { opacity: 0, scale: 1.25, filter: 'blur(14px)', letterSpacing: '0.2em' }, { opacity: 1, scale: 1, filter: 'blur(0px)', letterSpacing: '-0.04em', duration: 1.1, ease: 'expo.out', overwrite: true })
      gsap.fromTo([actEls.No, actEls.En, actEls.Sub], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.15, stagger: 0.06, ease: 'expo.out', overwrite: true })
      // Every new act: the heart beats and the crowd roars with it.
      heart.pump()
      setTimeout(() => heart.pump(), 260)
      if (a.head) setTimeout(() => heart.pump(), 520)
    }

    /* Pride: pump the heart. */
    const meterFill = document.getElementById('meterFill')
    const beatCount = document.getElementById('beatCount')
    const ipselenti = document.getElementById('ipselenti')
    if (touch) document.getElementById('prideHint').textContent = '화면을 탭해 심장을 뛰게 하세요'
    if (touch) {
      document.querySelector('.hint--fortress').lastChild.textContent = '건물 각 부분을 탭해 보세요'
      document.querySelector('.hint--flight').lastChild.textContent = '스크롤하면 다음 건물로 · 이름표를 탭해 자세히 보기'
    }
    heart.onPump = () => {
      beat = 1
      beatCount.textContent = heart.beats
    }
    document.getElementById('cvHeart').addEventListener('pointerdown', () => heart.pump())
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || current !== 2 || e.repeat) return
      if (e.target.closest?.('input, textarea')) return
      e.preventDefault()
      heart.pump()
    })
    const mute = document.getElementById('mute')
    mute.addEventListener('click', () => {
      heart.muted = !heart.muted
      mute.lastChild.textContent = heart.muted ? 'SOUND OFF' : 'SOUND ON'
      mute.classList.toggle('is-off', heart.muted)
    })

    /* Frontier: speed lines streaming past as the flight rushes. */
    const speedCv = document.getElementById('speedLines')
    const speedCtx = speedCv.getContext('2d')
    const streaks = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 0.6 + Math.random() * 1.6 }))
    let speedClear = true
    const drawSpeed = (dt, rush) => {
      const w = speedCv.clientWidth
      const h = speedCv.clientHeight
      if (speedCv.width !== w || speedCv.height !== h) ((speedCv.width = w), (speedCv.height = h))
      if (rush < 0.02) {
        if (!speedClear) speedCtx.clearRect(0, 0, w, h)
        speedClear = true
        return
      }
      speedClear = false
      const g = speedCtx
      g.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h * 0.45
      const R = Math.hypot(w, h) / 2
      const v = g.createRadialGradient(cx, cy, R * 0.35, cx, cy, R)
      v.addColorStop(0, 'rgba(13, 4, 6, 0)')
      v.addColorStop(1, `rgba(13, 4, 6, ${(rush * 0.55).toFixed(3)})`)
      g.fillStyle = v
      g.fillRect(0, 0, w, h)
      g.strokeStyle = '#ffd2c2'
      g.lineCap = 'round'
      for (const l of streaks) {
        l.r += dt * (0.4 + rush * 2.6)
        if (l.r > 1) ((l.r = 0.18 + Math.random() * 0.2), (l.a = Math.random() * Math.PI * 2))
        const r0 = l.r * R
        const r1 = r0 + rush * R * 0.3 * l.r
        g.globalAlpha = rush * 0.5 * l.r
        g.lineWidth = l.w
        g.beginPath()
        g.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0)
        g.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1)
        g.stroke()
      }
      g.globalAlpha = 1
    }

    /* 호랑이길: lock-on reticles and cards. */
    const locks = document.getElementById('locks')
    const lockEls = flight.targets.map((t) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'lock'
      el.innerHTML = `<span class="lock__box"></span><span class="lock__name">${t.name}</span>`
      el.addEventListener('click', () => openCard(t))
      locks.appendChild(el)
      return el
    })
    // Name tags for every other campus building.
    const tagEls = flight.halls.map((h) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'tag'
      el.textContent = h.name
      el.addEventListener('click', () =>
        openCard(h),
      )
      locks.prepend(el)
      h.alpha = 0
      return el
    })
    const placeTags = (dt, reserved, quiet = false) => {
      const cam = flight.camera.position
      // From afar (the map, the finale) every hall is named.
      const focus = Math.max(flight.overview ?? 0, flight.map ?? 0)
      const far = 260 + focus * 1600
      const max = quiet ? 0 : (innerWidth < 760 ? 5 : 16) + Math.round(focus * (innerWidth < 760 ? 5 : 70))
      // Keep clear of the chapter title while it is on screen.
      const keepOut = []
      if (+flightHead.style.opacity > 0.05) {
        const r = flightHead.getBoundingClientRect()
        keepOut.push([r.left - 8, r.top - 8, r.right + 8, r.bottom + 30])
      }
      const cand = []
      flight.halls.forEach((h, i) => {
        const d = cam.distanceTo(h.anchor)
        const sc = d < far && flight.screen(h.anchor)
        if (sc && sc.x > 10 && sc.x < innerWidth - 10 && sc.y > 70 && sc.y < viewH - 30) cand.push({ i, d, sc })
      })
      // Nearest first; skip tags that would overlap one already placed.
      cand.sort((a, b) => a.d - b.d)
      const placed = [...reserved]
      const shown = new Set()
      for (const c of cand) {
        if (placed.length - reserved.length >= max) break
        const w = tagEls[c.i].offsetWidth || 80
        // Kept whole on screen: a hall near the edge gets its tag nudged in.
        c.sc.x = Math.min(innerWidth - w / 2 - 6, Math.max(w / 2 + 6, c.sc.x))
        if (placed.some((p) => Math.abs(p.x - c.sc.x) < (p.w + w) / 2 + 4 && Math.abs(p.y - c.sc.y) < 24)) continue
        if (keepOut.some(([l, t, r, b]) => c.sc.x + w / 2 > l && c.sc.x - w / 2 < r && c.sc.y > t && c.sc.y - 24 < b)) continue
        placed.push({ x: c.sc.x, y: c.sc.y, w })
        shown.add(c.i)
        const el = tagEls[c.i]
        el.style.transform = `translate(${c.sc.x}px, ${c.sc.y}px) translate(-50%, -100%)`
      }
      // Fade rather than blink as tags come and go.
      flight.halls.forEach((h, i) => {
        h.alpha += ((shown.has(i) ? 1 : 0) - h.alpha) * Math.min(1, dt * 6)
        const el = tagEls[i]
        el.style.opacity = h.alpha.toFixed(2)
        el.style.visibility = h.alpha > 0.03 ? 'visible' : 'hidden'
        el.style.pointerEvents = shown.has(i) ? 'auto' : 'none'
      })
    }
    /* Building directory: pick any hall and the camera flies over to circle it. */
    const dir = document.getElementById('dir')
    const dirList = document.getElementById('dirList')
    const dirSearch = document.getElementById('dirSearch')
    const dirBack = document.getElementById('dirBack')
    document.getElementById('dirCount').textContent = flight.directory.length
    const dirItems = flight.directory.map((h) => {
      const li = document.createElement('li')
      li.innerHTML = `<button type="button"><span>${h.name}</span><small>${h.code ? h.code : ''}</small></button>`
      li.firstChild.addEventListener('click', () => {
        dir.hidden = true
        goTo(h)
      })
      dirList.appendChild(li)
      return { li, name: h.name }
    })
    dirSearch.addEventListener('input', () => {
      const q = dirSearch.value.trim()
      dirItems.forEach(({ li, name }) => (li.hidden = q && !name.includes(q)))
    })
    // Keep wheel/touch scrolling inside the list from driving the page.
    dirList.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
    dir.setAttribute('data-lenis-prevent', '')
    document.getElementById('dirBtn').addEventListener('click', () => {
      dir.hidden = !dir.hidden
      if (!dir.hidden) dirSearch.focus({ preventScroll: true })
    })
    document.getElementById('dirClose').addEventListener('click', () => (dir.hidden = true))
    dirBack.addEventListener('click', () => flight.exitFree())
    flight.onExitFree = () => {
      dirBack.hidden = true
      card.hidden = true
    }
    const card = document.getElementById('card')
    // Detail card: story, key facts, nearby halls, fly-to and map link.
    const cardEls = Object.fromEntries(['Code', 'Name', 'En', 'Body', 'Rows', 'Facts', 'Near', 'Go', 'Map'].map((k) => [k, document.getElementById('card' + k)]))
    const findHall = (name) => flight.directory.find((h) => h.name === name || h.name.startsWith(name))
    const openCard = (t) => {
      const hall = t.anchor ? t : findHall(t.name) || t
      const info = INFO[t.name] || INFO[t.name.replace(/병원 본관$/, '병원')] || {}
      const code = t.code || hall.code
      cardEls.Code.textContent = [info.kind || KIND[hall.style] || (t.key ? '랜드마크' : '캠퍼스 건물'), code ? `No. ${code}` : ''].filter(Boolean).join('  ·  ')
      cardEls.Name.textContent = t.name
      cardEls.En.textContent = t.en || hall.en || info.en || 'Korea University · Anam Campus'
      cardEls.Body.textContent = info.story || t.body || hall.body || '고려대학교 안암캠퍼스의 건물이에요.'
      const rows = [...(info.rows || [])]
      if ((t.lv || hall.lv) && !rows.some(([k]) => k === '층수')) rows.push(['층수', `지상 ${t.lv || hall.lv}층`])
      cardEls.Rows.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')
      cardEls.Facts.innerHTML = (info.facts || []).map((f) => `<li>${f}</li>`).join('')
      // Three nearest named halls, each a jump.
      const a = hall.anchor || t.anchor
      const near = a ? flight.directory.filter((h) => h.name !== t.name && h.anchor).map((h) => [h, Math.hypot(h.anchor.x - a.x, h.anchor.z - a.z)]).sort((x, y) => x[1] - y[1]).slice(0, 3) : []
      if (!info.story && !t.body && !hall.body && near.length)
        cardEls.Body.textContent = `${near[0][0].name}에서 ${Math.round(near[0][1])}m 떨어진 ${(KIND[hall.style] || '캠퍼스 건물').replace(/물$/, '물')}이에요. 아래 '가까이 날아가 보기'로 호랑이 발자국을 따라 둘러보세요.`
      cardEls.Near.innerHTML = near.length ? '<span>주변</span>' + near.map(([h, d]) => `<button type="button" data-n="${h.name}">${h.name} <small>${Math.round(d)}m</small></button>`).join('') : ''
      cardEls.Near.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goTo(findHall(b.dataset.n))))
      cardEls.Go.hidden = !a
      cardEls.Go.onclick = () => goTo({ ...hall, anchor: a, size: hall.size || 60, name: t.name })
      cardEls.Map.href = `https://map.kakao.com/?q=${encodeURIComponent('고려대학교 ' + t.name.replace(/고려대학교 /, ''))}`
      card.hidden = false
      card.openedAt = flight.progress
      gsap.fromTo(card, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true })
    }
    const goTo = (h) => {
      if (!h) return
      flight.flyTo(h)
      dirBack.hidden = false
      openCard(h)
    }
    document.getElementById('cardClose').addEventListener('click', () => (card.hidden = true))
    const filmCut = document.getElementById('filmCut')
    const filmBars = document.getElementById('filmBars')
    // The map: a numbered pin on every stop of the tour; a tap flies there.
    let pins = null
    const placePins = () => {
      const k = flight.map ?? 0
      if (!flight.shows) return
      pins ??= flight.shows.map((t, i) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'pin'
        el.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span>${t.name}</span>`
        el.addEventListener('click', () => goTo({ ...t, size: t.hall ? 60 : 40 }))
        locks.appendChild(el)
        return el
      })
      flight.shows.forEach((t, i) => {
        const el = pins[i]
        const sc = k > 0.02 && flight.screen(new THREE.Vector3(t.shot.cx, t.anchor.y, t.shot.cz))
        el.style.visibility = sc ? 'visible' : 'hidden'
        el.style.pointerEvents = k > 0.5 ? 'auto' : 'none'
        if (!sc) return
        el.style.opacity = k.toFixed(2)
        el.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -100%) scale(${0.85 + k * 0.15})`
      })
    }

    // Lower third for the landmark being passed: the same story as its card.
    const intro = document.getElementById('intro')
    const introEls = Object.fromEntries(['Kind', 'Name', 'En', 'Body', 'Scene', 'Rows', 'Facts'].map((k) => [k, document.getElementById('intro' + k)]))
    const introBar = document.getElementById('introBar')
    const introDots = flight.targets.map(() => {
      const li = document.createElement('li')
      document.getElementById('introDots').appendChild(li)
      return li
    })
    let introKey = null
    let introT = null
    document.getElementById('introMore').addEventListener('click', () => introT && openCard(introT))
    const showIntro = (t) => {
      const key = t ? t.name : null
      intro.classList.toggle('is-on', !!t)
      if (t) introT = t
      if (!t || key === introKey) return
      introKey = key
      const info = INFO[t.name] || {}
      const n = (flight.shows ? flight.shows.indexOf(t) : flight.targets.indexOf(t)) + 1
      introEls.Scene.textContent = `SCENE ${String(n).padStart(2, '0')}`
      introDots.forEach((d, k) => (d.classList.toggle('is-on', k === n - 1), d.classList.toggle('is-past', k < n - 1)))
      introEls.Kind.textContent = info.kind || (t.key ? '랜드마크' : '캠퍼스 건물')
      introEls.Name.textContent = t.name
      introEls.En.textContent = t.en || info.en || ''
      // One or two sentences: enough to read in the moment it is on screen.
      const story = info.story || t.body || ''
      introEls.Body.textContent = story.split(/(?<=[.다요])\s+/).slice(0, 2).join(' ')
      introEls.Rows.innerHTML = (info.rows || []).slice(0, 3).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')
      introEls.Facts.innerHTML = (info.facts || []).slice(0, 2).map((f) => `<li>${f}</li>`).join('')
      gsap.fromTo(
        intro.querySelectorAll('.intro__kind, .intro__name, .intro__en, .intro__body, .intro__rows > div, .intro__facts li'),
        { opacity: 0, y: 14, filter: 'blur(6px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, stagger: 0.07, ease: 'expo.out', overwrite: true },
      )
    }
    const speedEl = document.getElementById('speed')
    const lockName = document.getElementById('lockName')
    const flightHead = document.querySelector('.flight__head')

    // Each hint shows until the visitor acts (or for 7 s once in view).
    document.querySelectorAll('.hint').forEach((h) => {
      const sec = h.closest('.scene')
      let timer = 0
      const quiet = () => h.classList.add('is-quiet')
      sec?.addEventListener('pointerdown', quiet, { once: true })
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !timer) timer = setTimeout(quiet, 7000)
      }).observe(sec)
    })

    /* The Roar Carving. */
    const carve = document.getElementById('carve')
    const carveName = document.getElementById('carveName')
    let carving = null
    let carveRaf = 0
    const carveLoop = (t) => {
      carving.tick(1 / 60, t / 1000)
      carveRaf = requestAnimationFrame(carveLoop)
    }
    document.getElementById('carveBtn').addEventListener('click', async () => {
      const { RoarCarving } = await import('./carve.js')
      carving ??= new RoarCarving(document.getElementById('carveCv'))
      carve.hidden = false
      lenis.stop()
      carveRaf = requestAnimationFrame(carveLoop)
      carveName.focus({ preventScroll: true })
    })
    carveName.addEventListener('input', () => carving?.setText(carveName.value))
    document.getElementById('carveClear').addEventListener('click', () => (carving.clear(), (carveName.value = '')))
    document.getElementById('carveSave').addEventListener('click', (e) => (e.currentTarget.href = carving.toDataURL()))
    document.getElementById('carveClose').addEventListener('click', () => {
      carve.hidden = true
      cancelAnimationFrame(carveRaf)
      lenis.start()
    })

    /* VS mode: the blue feather. */
    const vs = document.getElementById('vs')
    document.getElementById('vsBtn').addEventListener('click', () => {
      vs.hidden = false
      lenis.stop()
      try {
        roarSound()
      } catch {}
    })
    document.getElementById('vsClose').addEventListener('click', () => ((vs.hidden = true), lenis.start()))

    const storyLines = [...document.querySelectorAll('#gateStory li')].map((li) => ({ li, small: li.querySelector('small'), words: wrapText(li, 'sw', 'word') }))

    /* 고연전: the five results come up one by one, then the title. */
    const GAMES = [
      ['야구', 2, 0],
      ['농구', 69, 53],
      ['빙구', 1, 2],
      ['축구', 1, 2],
      ['럭비', 35, 11],
    ]
    const scoreEl = document.getElementById('score')
    const scoreRows = GAMES.map(([name, ku, yu]) => {
      const li = document.createElement('li')
      li.innerHTML = `<b>${name}</b><span class="ku">${ku}</span><span class="score__vs">:</span><span class="yu">${yu}</span><span class="res ${ku > yu ? 'win' : ''}">${ku > yu ? '승' : '패'}</span>`
      scoreEl.appendChild(li)
      return li
    })
    const totalEl = document.getElementById('rivalryTotal')
    const rivalryEl = document.getElementById('rivalry')
    const updateRivalry = () => {
      const p = progress(rivalryEl)
      rivalry.progress = p
      scoreRows.forEach((li, i) => li.classList.toggle('is-on', p > 0.26 + i * 0.08))
      totalEl.classList.toggle('is-on', p > 0.7)
    }
    /* 상징: each set's words come up while the camera holds on it. */
    const symEls = [...document.querySelectorAll('.symx')]
    const symbolsEl = document.getElementById('symbols')
    const updateSymbols = () => {
      const p = progress(symbolsEl)
      symbols.progress = p
      const a = symbols.act()
      symEls.forEach((el, i) => {
        const k = clamp01(1 - Math.abs(a - i) * 2.2)
        el.style.opacity = ease(k).toFixed(3)
        el.style.transform = `translateY(${((1 - ease(k)) * 30).toFixed(1)}px)`
      })
    }

    // A phone that still struggles after the static tier check steps every
    // chapter down once (resolution ×0.8) and stays there; the campus film
    // keeps its own governor.
    const gov = { t: 0, n: 0, slow: 0, done: false }
    const govern = (dt) => {
      if (gov.done || document.hidden || dt > 0.25) return
      gov.t += dt
      gov.n++
      if (gov.t < 2) return
      gov.slow = gov.t / gov.n > 1 / 32 ? gov.slow + 1 : 0
      gov.t = gov.n = 0
      if (gov.slow < 2) return
      gov.done = true
      document.documentElement.classList.add('lite')
      for (const s of [hero, fortress, heart, fields, symbols, gate]) {
        if (!s?.renderer) continue
        const pr = s.renderer.getPixelRatio() * 0.8
        s.renderer.setPixelRatio(pr)
        s.composer?.setPixelRatio?.(pr)
        s.resize?.()
      }
    }

    return (dt) => {
      govern(dt)
      warmOne()
      transitions()
      heroTick(dt)

      fortress.progress = progress(scenes[1].el)
      const fp = progress(scenes[3].el)
      flight.progress = fp
      flightHead.style.opacity = 1 - clamp01((fp - 0.085) / 0.04)
      fields.progress = progress(scenes[4].el)
      if (scenes[4].on) showField()
      // The finale: the letter over the first half, the story over the second.
      const gp = progress(document.getElementById('gate'))
      gate.progress = clamp01(gp / 0.45)
      gate.story = clamp01((gp - 0.45) / 0.55)
      // Each line of the story arrives word by word, holds, then lifts away
      // whole. (Opacity and transform only: an animated blur on text this
      // large repaints it every frame and stutters.)
      if (scenes.at(-1).on)
        storyLines.forEach(({ li, small, words }, i) => {
          const at = ((gate.story - 0.04) / 0.8) * storyLines.length - i
          const inP = clamp01((at - 0.04) / 0.42)
          const out = ease(clamp01((at - 0.62) / 0.32))
          li.style.opacity = at > 0 && at < 1 ? (1 - out).toFixed(3) : '0'
          li.style.transform = `translate3d(0, ${(-out * 24).toFixed(1)}px, 0)`
          if (small) small.style.opacity = ease(clamp01(inP * 3)).toFixed(3)
          const n = words.length
          words.forEach((w, j) => {
            const k = ease(clamp01(inP * (n + 1.2) - j))
            w.style.opacity = k.toFixed(3)
            w.style.transform = `translate3d(0, ${((1 - k) * 0.45).toFixed(3)}em, 0) scale(${(1.14 - 0.14 * k).toFixed(3)})`
          })
        })
      updateRivalry()
      updateSymbols()
      // Once dawn floods in, the finale's text turns to ink.


      for (const s of scenes) if (s.on) s.view.render(dt)

      if (scenes[1].on) {
        const p = fortress.progress
        showSeason()
        const step = 0.95 / tlItems.length
        tlItems.forEach((li, n) => li.classList.toggle('is-on', p >= n * step && (n === tlItems.length - 1 || p < (n + 1) * step)))
        const h = fortress.hovered
        partTag.hidden = !h
        if (h) {
          const sc = fortress.screenOf(h)
          const u = h.userData
          if (partTag.dataset.key !== u.key) {
            partTag.dataset.key = u.key
            partTag.querySelector('b').textContent = u.name
            partTag.querySelector('span').textContent = u.en
            partTag.querySelector('p').textContent = u.info
          }
          const x = Math.min(innerWidth - 260, Math.max(12, sc.x + 24))
          const y = Math.min(viewH - 160, Math.max(80, sc.y - 40))
          partTag.style.transform = `translate(${x}px, ${y}px)`
        }
      }
      if (scenes[2].on) {
        meterFill.style.transform = `scaleX(${heart.energy.toFixed(3)})`
        showAct(progress(scenes[2].el))
        beams.style.setProperty('--e', heart.energy.toFixed(3))
        ipselenti.classList.toggle('is-on', heart.energy > 0.85)
      }
      if (scenes[3].on) {
        speedEl.textContent = Math.round(30 + flight.speed * 3.6)
        drawSpeed(dt, flight.rush)
        let best = null
        const lockBoxes = []
        flight.targets.forEach((t, i) => {
          const el = lockEls[i]
          const sc = t.near > 0.25 && flight.screen(t.anchor)
          const on = sc && sc.x > 20 && sc.x < innerWidth - 20 && sc.y > 80 && sc.y < viewH - 20
          el.style.visibility = on ? 'visible' : 'hidden'
          if (!on) return
          el.style.opacity = t.near
          el.style.transform = `translate(${sc.x}px, ${sc.y}px) translate(-50%, -50%) scale(${0.8 + t.near * 0.3})`
          el.classList.toggle('is-locked', t.near > 0.75)
          lockBoxes.push({ x: sc.x, y: sc.y + 30, w: 120 })
          if (!best || t.near > best.near) best = t
        })
        lockName.textContent = best && best.near > 0.75 ? best.name : '—'
        showIntro(best && best.near > 0.5 && card.hidden && !flight.free ? best : null)
        introBar.style.transform = `scaleX(${(flight.shotK ?? 0).toFixed(3)})`
        // While a landmark is on show, its caption speaks for it: no other tags.
        placeTags(dt, lockBoxes, best && best.near > 0.3)
        placePins()
        // Film: letterbox over the shots, a dip to black at every cut.
        filmCut.style.opacity = (flight.cut ?? 0).toFixed(3)
        filmBars.classList.toggle('is-on', flight.map < 0.5 && (flight.overview ?? 0) < 0.5 && !flight.free)
        // A card from the tour closes itself once the flight has moved on.
        if (!card.hidden && !flight.free && Math.abs(flight.progress - card.openedAt) > 0.04) card.hidden = true
      }
    }
  }
}

boot()
