import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { TigerGait } from './tigerGait.js'

// A real tiger running the tour: it lands on the pawprint trail just ahead of
// the camera and gallops along the route, its stride matched to the flight's
// speed; when the scroll stops it slows, stands and looks around (the
// model's own idle clip). The white tiger model is recoloured into a Bengal
// tiger: orange coat, cream belly, throat and muzzle, stripes kept.
// Model: "White Tiger (rigged animated)" by MotionStreamStudios, CC BY 4.0.

const SCALE = 0.045 // model is in centimetres; ~9 m long, large but still fits the roads

function bengal(material, box) {
  material.onBeforeCompile = (sh) => {
    // Positions may be quantized by compression: work in 0..1 of the model's bounds.
    sh.uniforms.uBMin = { value: box.min.clone() }
    sh.uniforms.uBSize = { value: box.getSize(new THREE.Vector3()) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;\nuniform vec3 uBMin, uBSize;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = (position - uBMin) / uBSize;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // Pale fur under the body and legs, on the throat and the muzzle.
          // Belly: the underside of the torso only (not the legs or tail).
          float band = smoothstep(0.6, 0.5, vBind.y) * smoothstep(0.36, 0.46, vBind.y);
          float mid = 1.0 - smoothstep(0.2, 0.34, abs(vBind.x - 0.5));
          float torso = smoothstep(0.22, 0.32, vBind.z) * smoothstep(0.86, 0.76, vBind.z);
          float belly = band * mid * torso;
          float face = smoothstep(0.83, 0.93, vBind.z) * smoothstep(0.84, 0.66, vBind.y);
          float paws = smoothstep(0.06, 0.015, vBind.y) * 0.7;
          float pale = clamp(max(max(belly, face), paws), 0.0, 1.0);
          vec3 orange = vec3(0.86, 0.33, 0.06);
          vec3 cream = vec3(0.95, 0.88, 0.76);
          // The texture is white fur with black stripes: keep the stripes dark.
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          vec3 coat = mix(orange, cream, pale) * smoothstep(0.08, 0.75, lum);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.25, coat, smoothstep(0.15, 0.55, lum));
        }`,
      )
      // A faint crimson rim so the tiger stands out against the campus at dusk.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.18, 0.08) * rim * 0.9;`,
      )
  }
  material.needsUpdate = true
}

export class RunTiger {
  constructor(scene, url = `${import.meta.env.BASE_URL}models/tiger.glb`) {
    this.group = new THREE.Group()
    this.group.visible = false
    scene.add(this.group)
    this.speed = 0
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(url, (g) => {
      const m = g.scene
      m.scale.setScalar(SCALE)
      m.traverse((o) => {
        if (!o.isMesh) return
        o.castShadow = true
        o.frustumCulled = false
        o.geometry.computeBoundingBox()
        bengal(o.material, o.geometry.boundingBox)
      })
      this.group.add(m)
      this.mixer = new THREE.AnimationMixer(m)
      if (g.animations[0]) this.mixer.clipAction(g.animations[0]).play()
      this.gait = new TigerGait(m)
      this.ready = true
    })
  }

  // pos: ground point; dir: heading on the ground plane; speed: m/s of the flight.
  update(dt, pos, dir, speed, roar = 0) {
    if (!this.ready) return
    this.group.visible = true
    this.speed += (THREE.MathUtils.clamp(speed / 45, 0, 1) - this.speed) * Math.min(1, dt * 2.5)
    this.group.position.copy(pos)
    const yaw = Math.atan2(dir.x, dir.z)
    let d = yaw - this.group.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.group.rotation.y += d * Math.min(1, dt * 5)
    this.mixer.update(dt)
    const run = THREE.MathUtils.smoothstep(this.speed, 0.08, 0.35)
    this.gait.mix = run
    if (run > 0.001) this.gait.update(dt, THREE.MathUtils.lerp(0.45, 1, this.speed))
    this.gait.roar(roar)
  }
}
