import * as THREE from 'three'

// Procedural locomotion for the rigged tiger (the model ships with only an
// idle clip). Modelled on how big cats actually move:
//  - Walk: a four-beat lateral sequence (left hind, left fore, right hind,
//    right fore), each paw on the ground ~62% of the stride. The shoulder
//    blades roll up over each supporting foreleg, the head is carried low
//    and level, the spine sways side to side, the tail hangs and swings.
//  - Gallop: a rotary gallop, hind pair then fore pair, paws down only a
//    third of the stride; the spine coils and uncoils once per stride.
// Stride rate follows the ground speed (stride length scales with the
// body), so the paws do not slide; walk and gallop cross-fade with speed.
// Each joint turns about the body's lateral axis (taken once per bone, in
// its parent's space at rest); spine and tail also turn about the up axis.

const LEGS = {
  // [hip/shoulder, knee/elbow, ankle/wrist, ball] and the phase in each gait.
  hl: { bones: ['l_femurRibbon_00', 'l_tibiaRibbon_00', 'l_foot_00', 'l_ball_00'], walk: 0.0, run: 0.0, front: false },
  fl: { bones: ['l_femurRibbonFront_00', 'l_tibiaRibbonFront_00', 'l_footFront_00', 'l_ballFront_00'], walk: 0.27, run: 0.58, front: true },
  hr: { bones: ['r_femurRibbon_00', 'r_tibiaRibbon_00', 'r_foot_00', 'r_ball_00'], walk: 0.5, run: 0.12, front: false },
  fr: { bones: ['r_femurRibbonFront_00', 'r_tibiaRibbonFront_00', 'r_footFront_00', 'r_ballFront_00'], walk: 0.77, run: 0.48, front: true },
}
const SPINE = ['c_spine_00', 'c_spine_01', 'c_spine_02', 'c_spine_03', 'c_chest_00']
const NECK = ['c_neck_00', 'c_neck_01', 'c_head_00']
const ROAR = ['c_jaw_00', 'c_neck_00', 'c_neck_01', 'c_head_00', 'c_chest_00', 'l_femurRibbonFront_00', 'r_femurRibbonFront_00', 'l_ear_00', 'r_ear_00']
const TAIL = ['c_tail_00', 'c_tail_01', 'c_tail_02', 'c_tail_03', 'c_tail_04', 'c_tail_05', 'c_tail_06', 'c_tail_07']

// Per gait: duty factor (share of the stride a paw is down), and joint
// ranges in radians: hip/shoulder sweep, knee/elbow fold, ankle/wrist flick.
const GAIT = {
  walk: { duty: 0.62, hind: { sweep: 0.32, fold: 0.85, flick: 0.75 }, fore: { sweep: 0.36, fold: 1.15, flick: 1.1 } },
  run: { duty: 0.36, hind: { sweep: 0.62, fold: 1.15, flick: 1.0 }, fore: { sweep: 0.9, fold: 1.6, flick: 1.4 } },
}
// Signs that turn "swing forward / fold / flick" into this rig's rotations.
const SIGN = { hind: { sweep: -1, fold: 1, flick: -1 }, fore: { sweep: 1, fold: -1, flick: 1 } }

const TAU = Math.PI * 2
const ease = (x) => x * x * (3 - 2 * x)

// One leg's angles at phase p (0..1, touchdown at 0) for gait g.
function legPose(p, g, front) {
  const r = front ? g.fore : g.hind
  const D = g.duty
  let sweep, fold, flick
  if (p < D) {
    // Stance: the paw is planted and the leg rolls back under the body; the
    // joints give a little at mid-stance and the heel lifts at push-off.
    const u = p / D
    sweep = THREE.MathUtils.lerp(1, -1, u)
    fold = 0.12 * Math.sin(Math.PI * u)
    flick = 0.35 * ease(THREE.MathUtils.clamp((u - 0.7) / 0.3, 0, 1))
  } else {
    // Swing: the paw lifts, folds up under the body and reaches forward,
    // opening flat just before it lands.
    const v = (p - D) / (1 - D)
    sweep = THREE.MathUtils.lerp(-1, 1, ease(v))
    fold = Math.sin(Math.PI * Math.min(1, v * 1.15))
    flick = Math.sin(Math.PI * Math.min(1, v * 1.3)) ** 1.4
  }
  return { sweep: sweep * r.sweep, fold: fold * r.fold, flick: flick * r.flick, stance: p < D ? Math.sin((Math.PI * p) / D) : 0 }
}

export class TigerGait {
  // root: the loaded gltf.scene.
  constructor(root, { lateral = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, 1) } = {}) {
    this.bones = {}
    root.updateMatrixWorld(true)
    root.traverse((o) => {
      if (!o.isBone) return
      this.bones[o.name.replace(/_uJnt_\d+$/, '')] = o
    })
    this.rig = {}
    const q = new THREE.Quaternion()
    const local = (b, world) => {
      b.parent.getWorldQuaternion(q)
      return world.clone().applyQuaternion(q.clone().invert()).normalize()
    }
    const prep = (key) => {
      const b = this.bones[key]
      if (!b) return null
      return (this.rig[key] = { b, rest: b.quaternion.clone(), axis: local(b, lateral), yaw: local(b, up), roll: local(b, forward) })
    }
    for (const leg of Object.values(LEGS)) leg.bones.forEach(prep)
    ;[...SPINE, ...NECK, ...TAIL, ...ROAR, 'c_root_01'].forEach((k) => this.rig[k] || prep(k))
    // Shoulder blades: the front legs' top joints slide along the body and up.
    this.scap = {}
    for (const leg of Object.values(LEGS)) {
      if (!leg.front) continue
      const b = this.bones[leg.bones[0]]
      if (!b) continue
      this.scap[leg.bones[0]] = { b, rest: b.position.clone(), fwd: local(b, forward), up: local(b, up), amp: b.position.length() * 0.12 }
    }
    this.rootBone = this.bones['c_root_01']
    this.rootRest = this.rootBone?.position.clone()
    this.mix = 1 // how much of the gait is laid over the idle clip
    this.t = 0
    this.run = 0 // 0 walk .. 1 gallop
    this.bodyLen = 200 // model units, nose to rump; set by the owner
    this.roarPose = { jaw: 0.78, neck0: 0.26, neck1: 0.2, head: 0.14, chest: 0.1, spine: 0.05, fore: -0.22 }
  }

  // Joint `key` at rest, turned by the given angles about its lateral, up and
  // forward axes, blended over its current pose by `mix`.
  #set(key, pitch, yaw = 0, roll = 0) {
    const r = this.rig[key]
    if (!r) return
    const q = new THREE.Quaternion().setFromAxisAngle(r.axis, pitch)
    if (yaw) q.multiply(new THREE.Quaternion().setFromAxisAngle(r.yaw, yaw))
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(r.roll, roll))
    q.multiply(r.rest)
    if (this.mix < 1) r.b.quaternion.slerp(q, this.mix)
    else r.b.quaternion.copy(q)
  }

  // A fixed pose for a statue: pairs of [joint, pitch, yaw], each turned from
  // rest about its lateral (and up) axis.
  hold(pose) {
    const keep = this.mix
    this.mix = 1
    for (const [key, pitch, yaw = 0] of pose) this.#set(key, pitch, yaw)
    this.mix = keep
  }

  // A roar on top of the current pose, k 0..1: jaw wide, head thrown up,
  // chest out, forelegs braced.
  roar(k) {
    if (k <= 0.001) return
    const keep = this.mix
    this.mix = k
    const R = this.roarPose
    this.#set('c_jaw_00', R.jaw)
    this.#set('c_neck_00', -R.neck0)
    this.#set('c_neck_01', -R.neck1)
    this.#set('c_head_00', -R.head)
    this.#set('c_chest_00', -R.chest)
    this.#set('c_spine_03', -R.spine)
    this.#set('l_femurRibbonFront_00', R.fore)
    this.#set('r_femurRibbonFront_00', R.fore)
    this.mix = keep
  }

  // v: ground speed in model units per second (body lengths matter, not metres).
  update(dt, v) {
    const L = this.bodyLen
    // Big cats walk up to ~0.9 body lengths a second, then break into a run.
    const target = THREE.MathUtils.smoothstep(v / L, 0.9, 2.2)
    this.run += (target - this.run) * Math.min(1, dt * 3)
    const w = this.run
    // Stride length: ~0.75 body lengths walking, ~1.6 at the gallop.
    const stride = L * THREE.MathUtils.lerp(0.75, 1.6, w)
    this.t = (this.t + (Math.max(v, L * 0.15) / stride) * dt) % 1
    const t = this.t

    const wv = GAIT.walk
    const rn = GAIT.run
    let scapUp = 0
    for (const leg of Object.values(LEGS)) {
      const a = legPose((t - leg.walk + 1) % 1, wv, leg.front)
      const b = legPose((t - leg.run + 1) % 1, rn, leg.front)
      const s = leg.front ? SIGN.fore : SIGN.hind
      const sweep = THREE.MathUtils.lerp(a.sweep, b.sweep, w) * s.sweep
      const fold = THREE.MathUtils.lerp(a.fold, b.fold, w) * s.fold
      const flick = THREE.MathUtils.lerp(a.flick, b.flick, w) * s.flick
      const [hip, knee, ankle, ball] = leg.bones
      this.#set(hip, sweep)
      this.#set(knee, fold)
      this.#set(ankle, flick * (leg.front ? 1 : 0.9))
      // The toes stay flat on the ground through the stance.
      this.#set(ball, -flick * 0.45)
      const sc = this.scap[hip]
      if (sc) {
        // Shoulder blade: rides up over the foreleg as it takes the weight
        // (the rolling shoulders of a walking cat), and slides with the reach.
        const st = THREE.MathUtils.lerp(a.stance, b.stance, w)
        sc.b.position.copy(sc.rest)
        sc.b.position.addScaledVector(sc.up, st * sc.amp * 0.5 * (1 - w) * this.mix)
        sc.b.position.addScaledVector(sc.fwd, (sweep * s.sweep) * sc.amp * 0.6 * this.mix)
        scapUp += st
      }
    }

    // Spine. Walking: a gentle side-to-side sway and a little roll with each
    // hind step. Galloping: coils up as the hind legs reach forward under the
    // chest, then stretches out at full extension.
    // Kept small: a big cat's walk rolls, it doesn't wag.
    const sway = Math.sin(t * TAU) * (1 - w) * 0.5
    const coil = Math.sin((t + 0.05) * TAU) * w
    SPINE.forEach((key, i) => {
      const k = [0.06, 0.05, 0.04, -0.03, -0.04][i]
      this.#set(key, coil * k * 2.6, sway * [0.04, 0.035, 0.025, 0.02, 0.015][i], sway * 0.02)
    })
    // Head low and steady: it counters the body's movement so the eyes stay level.
    // The head stays pointed down the road: the neck undoes the spine's sway.
    NECK.forEach((key, i) => this.#set(key, [-0.12, -0.04, 0.06][i] * (1 - w) - coil * 0.05, -sway * [0.06, 0.05, 0.04][i]))
    // Tail: hanging in a soft curve with a lazy swing when walking, streaming
    // out behind and whipping for balance at the gallop.
    TAIL.forEach((key, i) => {
      const f = i / (TAIL.length - 1)
      const hang = THREE.MathUtils.lerp(0.06 + f * 0.05, -0.01, w)
      const swing = Math.sin((t - f * 0.35) * TAU) * THREE.MathUtils.lerp(0.06, 0.03, w)
      const tip = f > 0.6 ? THREE.MathUtils.lerp(-0.1, 0, w) * (f - 0.6) * 2.5 : 0
      this.#set(key, hang + tip + coil * 0.03, swing)
    })
    // Body: dips slightly at each footfall when walking (two per stride);
    // rises and pitches through the gallop's suspension.
    if (this.rootBone) {
      const bob = -Math.abs(Math.sin(t * TAU)) * 0.012 * L * (1 - w) + Math.sin((t + 0.25) * TAU) * 0.03 * L * w
      if (this.mix >= 1) this.rootBone.position.copy(this.rootRest)
      this.rootBone.position.y += bob * this.mix
      this.#set('c_root_01', Math.sin((t + 0.1) * TAU) * 0.05 * w, 0, sway * 0.02)
    }
  }
}
