import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The IPSELENTI crowd: thousands of people on the field facing the beating
// heart, each holding a crimson light stick. Seen from behind, rim-lit red by
// the heart. Every pump sends a ring of lifted arms and flaring sticks out
// from the stage; the crowd's energy keeps them bouncing.

const LIFT = /* glsl */ `
  attribute vec3 aSeat;
  attribute float aRand;
  uniform float uTime, uEnergy;
  uniform vec4 uPulses; // start times of the last four pumps
  float wave;
  float lift(){
    float d = length(aSeat.xz - vec2(0.0, -2.0));
    wave = 0.0;
    for (int i = 0; i < 4; i++){
      float age = uTime - uPulses[i];
      if (age < 0.0 || age > 2.4) continue;
      float front = d - age * 9.0;
      wave += exp(-front * front * 0.6) * (1.0 - age / 2.4);
    }
    float bounce = max(0.0, sin(uTime * (5.0 + aRand * 2.0) + aRand * 40.0)) * (0.04 + uEnergy * 0.22);
    return wave * 0.35 + bounce;
  }
`

const bodyVert = /* glsl */ `
  ${LIFT}
  varying float vRim;
  varying float vGlow;
  varying float vRand;
  varying float vH;
  void main(){
    float j = lift();
    vec3 p = position;
    // Everyone turns to the heart at the origin.
    float yaw = atan(-aSeat.x, -aSeat.z) + sin(uTime * 1.1 + aRand * 20.0) * 0.12;
    float c = cos(yaw), s = sin(yaw);
    p.xz = mat2(c, -s, s, c) * p.xz;
    vec3 n = normal; n.xz = mat2(c, -s, s, c) * n.xz;
    vec3 world = aSeat + p + vec3(0.0, j, 0.0);
    // Rim light from the heart, seen from behind as a red edge.
    vec3 toHeart = normalize(vec3(0.0, 0.0, 0.0) - world);
    vRim = pow(1.0 - abs(dot(normalize(n), vec3(0.0, 0.0, 1.0))), 2.0) * max(0.0, dot(normalize(n), toHeart) + 0.4);
    vGlow = wave;
    vRand = aRand;
    vH = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`
const bodyFrag = /* glsl */ `
  uniform float uEnergy;
  varying float vRim;
  varying float vGlow;
  varying float vRand;
  varying float vH;
  void main(){
    vec3 col = mix(vec3(0.002, 0.001, 0.002), vec3(0.006, 0.002, 0.003), vRand);
    col += vec3(0.9, 0.05, 0.08) * vRim * (0.012 + uEnergy * 0.05 + vGlow * 0.12);
    gl_FragColor = vec4(col, 1.0);
  }
`
const stickVert = /* glsl */ `
  ${LIFT}
  uniform float uSize;
  varying vec3 vCol;
  void main(){
    float j = lift();
    float side = aRand > 0.5 ? 1.0 : -1.0;
    float t = uTime * (2.2 + aRand * 1.6) * (0.6 + uEnergy) + aRand * 40.0;
    vec3 hand = vec3(side * 0.2 + sin(t) * 0.16, 1.62 + wave * 0.3 + cos(t * 0.5) * 0.05, 0.0);
    float yaw = atan(-aSeat.x, -aSeat.z);
    float c = cos(yaw), s = sin(yaw);
    hand.xz = mat2(c, -s, s, c) * hand.xz;
    vec3 world = aSeat + hand + vec3(0.0, j, 0.0);
    // Crimson sticks; a few phone torches in warm white.
    vec3 base = aRand < 0.07 ? vec3(1.0, 0.85, 0.7) : mix(vec3(1.0, 0.02, 0.08), vec3(1.0, 0.18, 0.12), fract(aRand * 7.3));
    vCol = base * (1.5 + uEnergy * 2.0 + min(wave, 1.5) * 3.0);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (1.0 + wave * 0.6) / -mv.z, 2.0, 22.0);
  }
`
const stickFrag = /* glsl */ `
  varying vec3 vCol;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vCol * a * a, a);
  }
`

export class Crowd {
  constructor(scene, mobile) {
    const FLOOR = -3.4
    const seats = []
    const step = mobile ? 0.82 : 0.6
    for (let z = 1.0; z > -22; z -= step) {
      const half = 6 + (11 - z) * 0.52
      for (let x = -half; x <= half; x += step) {
        // Keep an aisle in front of the stage.
        if (Math.abs(x) < 2.2 && z > -4.5) continue
        seats.push([x + (Math.random() - 0.5) * step * 0.6, FLOOR, z + (Math.random() - 0.5) * step * 0.6])
      }
    }
    this.count = seats.length
    const rand = new Float32Array(seats.map(() => Math.random()))
    const seatAttr = new Float32Array(seats.flat())
    const attach = (geo) => {
      geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seatAttr, 3))
      geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
      geo.instanceCount = seats.length
      return geo
    }
    // One person: torso, shoulders, head.
    const person = mergeGeometries(
      [
        new THREE.CylinderGeometry(0.18, 0.23, 0.82, 7).translate(0, 0.68, 0),
        new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.5, 0.7).translate(0, 1.08, 0),
        new THREE.SphereGeometry(0.135, 8, 6).translate(0, 1.3, 0),
      ].map((g) => g.toNonIndexed()),
    )
    const bodyGeo = new THREE.InstancedBufferGeometry()
    bodyGeo.setAttribute('position', person.getAttribute('position'))
    bodyGeo.setAttribute('normal', person.getAttribute('normal'))
    attach(bodyGeo)
    this.uniforms = { uTime: { value: 0 }, uEnergy: { value: 0 }, uPulses: { value: new THREE.Vector4(-99, -99, -99, -99) }, uSize: { value: 60 } }
    const bodies = new THREE.Mesh(bodyGeo, new THREE.ShaderMaterial({ vertexShader: bodyVert, fragmentShader: bodyFrag, uniforms: this.uniforms }))
    bodies.frustumCulled = false
    const stickGeo = new THREE.InstancedBufferGeometry()
    stickGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    attach(stickGeo)
    const sticks = new THREE.Points(stickGeo, new THREE.ShaderMaterial({ vertexShader: stickVert, fragmentShader: stickFrag, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    sticks.frustumCulled = false
    // A faint glow on the field from all the sticks.
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff1030'), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    field.rotation.x = -Math.PI / 2
    field.position.set(0, FLOOR + 0.01, -8)
    this.field = field
    this.group = new THREE.Group()
    this.group.add(field, bodies, sticks)
    scene.add(this.group)
    this.next = 0
  }

  pump(time) {
    const p = this.uniforms.uPulses.value
    p.setComponent(this.next++ % 4, time)
  }

  setSize(px) {
    this.uniforms.uSize.value = px
  }

  update(time, energy) {
    this.uniforms.uTime.value = time
    this.uniforms.uEnergy.value = energy
    this.field.material.opacity = 0.02 + energy * 0.06
  }
}
