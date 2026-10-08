import * as THREE from 'three'

// A procedural gallop for the rigged tiger. The model ships with only an
// idle clip, so the run is driven bone by bone: each joint swings about the
// body's lateral axis on its own phase of the stride, the spine flexes and
// extends once per stride, the body bobs, the tail streams and the head holds
// steady. Rotations are about one shared axis, so the axis can be taken once
// in each bone's parent space at rest.

const LEGS = {
  // [hip, knee, ankle, ball] joints per leg, plus the leg's phase offset.
  hl: { bones: ['l_femurRibbon_00', 'l_tibiaRibbon_00', 'l_foot_00', 'l_ball_00'], phase: 0.0, front: false },
  hr: { bones: ['r_femurRibbon_00', 'r_tibiaRibbon_00', 'r_foot_00', 'r_ball_00'], phase: 0.1, front: false },
  fl: { bones: ['l_femurRibbonFront_00', 'l_tibiaRibbonFront_00', 'l_footFront_00', 'l_ballFront_00'], phase: 0.5, front: true },
  fr: { bones: ['r_femurRibbonFront_00', 'r_tibiaRibbonFront_00', 'r_footFront_00', 'r_ballFront_00'], phase: 0.6, front: true },
}
const SPINE = ['c_spine_00', 'c_spine_01', 'c_spine_02', 'c_spine_03', 'c_chest_00']
const NECK = ['c_neck_00', 'c_neck_01', 'c_head_00']
const TAIL = ['c_tail_00', 'c_tail_01', 'c_tail_02', 'c_tail_03', 'c_tail_04', 'c_tail_05', 'c_tail_06', 'c_tail_07']

const TAU = Math.PI * 2

export class TigerGait {
  // root: the loaded gltf.scene; lateral: the body's side axis in world space.
  constructor(root, { lateral = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0) } = {}) {
    this.bones = {}
    root.updateMatrixWorld(true)
    root.traverse((o) => {
      if (!o.isBone) return
      const key = o.name.replace(/_uJnt_\d+$/, '')
      this.bones[key] = o
    })
    this.rig = {}
    const q = new THREE.Quaternion()
    const prep = (key, worldAxis) => {
      const b = this.bones[key]
      if (!b) return null
      b.parent.getWorldQuaternion(q)
      const axis = worldAxis.clone().applyQuaternion(q.clone().invert()).normalize()
      return (this.rig[key] = { b, rest: b.quaternion.clone(), axis, restPos: b.position.clone() })
    }
    for (const leg of Object.values(LEGS)) leg.bones.forEach((k) => prep(k, lateral))
    SPINE.forEach((k) => prep(k, lateral))
    NECK.forEach((k) => prep(k, lateral))
    TAIL.forEach((k) => prep(k, lateral))
    this.tailYaw = TAIL.map((k) => {
      const b = this.bones[k]
      if (!b) return null
      b.parent.getWorldQuaternion(q)
      return up.clone().applyQuaternion(q.clone().invert()).normalize()
    })
    this.rootBone = this.bones['c_root_01']
    this.rootRest = this.rootBone?.position.clone()
    this.rootRestQ = this.rootBone?.quaternion.clone()
    this.rootAxis = prep('c_root_01', lateral)?.axis
    this.sign = 1 // flip if the model's joints swing the other way
    this.mix = 1 // 1 = full gallop pose, 0 = leave the bones as they are
    this.t = 0
  }

  // Set one joint to its rest pose turned `angle` about the lateral axis.
  #turn(key, angle, extraAxis, extraAngle) {
    const r = this.rig[key]
    if (!r) return
    const q = new THREE.Quaternion().setFromAxisAngle(r.axis, angle * this.sign)
    if (extraAxis) q.multiply(new THREE.Quaternion().setFromAxisAngle(extraAxis, extraAngle))
    q.multiply(r.rest)
    // Blend over whatever pose the bone already has (the idle clip).
    if (this.mix < 1) r.b.quaternion.slerp(q, this.mix)
    else r.b.quaternion.copy(q)
  }

  // speed: 0 (standing) .. 1 (full gallop). dt in seconds.
  update(dt, speed = 1) {
    const period = THREE.MathUtils.lerp(0.9, 0.42, speed)
    this.t = (this.t + dt / period) % 1
    const k = speed
    for (const leg of Object.values(LEGS)) {
      const p = (this.t + leg.phase) % 1
      const s = Math.sin(p * TAU)
      // Flexion peaks while the paw swings forward, off the ground.
      const swing = Math.max(0, Math.sin((p + 0.25) * TAU))
      const [hip, knee, ankle, ball] = leg.bones
      if (leg.front) {
        this.#turn(hip, s * 0.75 * k)
        this.#turn(knee, -swing * 1.2 * k)
        this.#turn(ankle, swing * 0.9 * k)
        this.#turn(ball, -swing * 0.5 * k)
      } else {
        this.#turn(hip, -s * 0.7 * k)
        this.#turn(knee, swing * 1.1 * k)
        this.#turn(ankle, -swing * 1.0 * k)
        this.#turn(ball, swing * 0.6 * k)
      }
    }
    // Spine gathers as the hind legs reach forward, stretches as they push.
    const flex = Math.sin((this.t + 0.15) * TAU)
    // Only the lumbar spine bends; the chest gives a little back so the body stays level.
    SPINE.forEach((key, i) => this.#turn(key, flex * k * [0.045, 0.04, 0.03, -0.02, -0.03][i]))
    // The head stays level against the body's pitch.
    NECK.forEach((key, i) => this.#turn(key, -flex * 0.02 * k + (i === 0 ? -0.08 * k : 0)))
    // Tail streams back and whips a little.
    TAIL.forEach((key, i) => {
      const yawAxis = this.tailYaw[i]
      this.#turn(key, Math.sin((this.t - i * 0.06) * TAU) * 0.018 * k, yawAxis, Math.sin((this.t * 0.5 - i * 0.08) * TAU) * 0.025 * k)
    })
    // Body bob and pitch through the stride.
    if (this.rootBone) {
      const bob = (Math.abs(Math.sin(this.t * TAU)) - 0.5) * 3 * k
      if (this.mix >= 1) this.rootBone.position.copy(this.rootRest)
      this.rootBone.position.y += bob * this.mix
      this.#turn('c_root_01', Math.sin((this.t + 0.1) * TAU) * 0.035 * k)
    }
  }
}
