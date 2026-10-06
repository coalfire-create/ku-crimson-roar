// Fragment shaders for ShaderCanvas (the shared header declares uRes, uTime,
// uMouse, uHover, uProgress and fragColor).

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`

// The Awakening: tiger fur in crimson and obsidian, stripes flowing slowly.
// The pointer is a warm light raking the fur. Two amber eyes open in the
// dark (uOpen), follow the pointer and blink (uBlink). A roar (uBlast 0..1
// after a click) sends a shockwave ring out from the eyes. uProgress (scroll)
// lets it all sink back into the dark.
export const TIGER = /* glsl */ `
  uniform float uOpen;
  uniform float uBlink;
  uniform float uBlast;
  uniform vec2 uEyes;
  ${NOISE}

  // Narrow (portrait) screens get smaller eyes, set closer together.
  float es;

  // One almond eye centred at c; returns colour and writes coverage.
  vec3 eye(vec2 p, vec2 c, vec2 look, float open, out float cover){
    vec2 q = (p - c) / es;
    float w = 0.085;
    float h = 0.042 * open;
    // Almond: the gap between two arcs.
    float lid = abs(q.y) - h * (1.0 - pow(abs(q.x) / w, 2.0));
    cover = smoothstep(0.004, -0.002, lid) * step(abs(q.x), w);
    vec2 iris = q - look * 0.02;
    float r = length(iris);
    vec3 gold = mix(vec3(1.0, 0.33, 0.02), vec3(1.0, 0.8, 0.3), smoothstep(0.045, 0.0, r));
    float fib = 0.85 + 0.15 * sin(atan(iris.y, iris.x) * 40.0 + r * 200.0);
    vec3 col = gold * fib * 1.6;
    col *= smoothstep(0.012, 0.016, r);                      // round pupil
    col += vec3(1.0) * smoothstep(0.007, 0.0, length(iris - vec2(0.012, 0.012))) * 1.5;
    col *= 0.55 + 0.45 * smoothstep(-0.04, 0.0, -abs(q.y) + h * 0.2);
    return col;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 m = (uMouse - 0.5) * vec2(aspect, 1.0);
    vec2 ec = (uEyes - 0.5) * vec2(aspect, 1.0);
    es = clamp(aspect * 1.1, 0.55, 1.0);

    // Shockwave: a ring bending the fur as it passes.
    float ringR = uBlast * 1.9;
    float dr = length(p - ec) - ringR;
    float wave = exp(-dr * dr * 90.0) * (1.0 - uBlast);
    p += normalize(p - ec + 1e-4) * wave * 0.05;

    // Fur flows down and outward; stripes are warped bands across it.
    float t = uTime * 0.05;
    vec2 f = p * vec2(1.0, 1.6) + vec2(0.0, t);
    float warp = fbm(f * 1.4 + vec2(t, 0.0)) * 2.6;
    float band = sin((p.x * 5.2 + warp + p.y * 1.2) * 3.14159);
    float branch = fbm(f * 4.0) - 0.5;
    float stripe = smoothstep(0.35, 0.62, band + branch * 0.8);
    float hair = vnoise(vec2(p.x * 180.0, p.y * 14.0 + t * 20.0));

    vec3 crimson = mix(vec3(0.36, 0.0, 0.02), vec3(0.78, 0.06, 0.18), fbm(f * 2.0));
    vec3 fur = mix(crimson, vec3(0.02, 0.01, 0.02), stripe);
    fur *= 0.75 + 0.35 * hair;

    // Warm light where the pointer rakes the fur, dark elsewhere.
    float near = exp(-dot(p - m, p - m) * 2.2);
    vec3 col = fur * (0.16 + 0.95 * near) + vec3(1.0, 0.35, 0.1) * near * 0.05;
    col *= 1.0 - 0.6 * length((uv - vec2(0.6, 0.55)) * vec2(1.0, 1.3));

    // The eyes, and the glow they throw.
    vec2 look = clamp(m - ec, -1.0, 1.0);
    float open = uOpen * (1.0 - uBlink);
    float c1, c2;
    vec3 e1 = eye(p, ec + vec2(-0.16 * es, 0.0), look, open, c1);
    vec3 e2 = eye(p, ec + vec2(0.16 * es, 0.0), look, open, c2);
    col = mix(col, e1, c1);
    col = mix(col, e2, c2);
    float halo = exp(-length((p - ec) * vec2(0.8, 2.2)) * 5.0) * uOpen;
    col += vec3(1.0, 0.25, 0.05) * halo * (0.12 + 0.5 * uBlast * (1.0 - uBlast) * 4.0);

    // The roar's flash and its bright crest.
    col += vec3(1.0, 0.2, 0.08) * wave * 1.2;
    col += vec3(0.6, 0.02, 0.02) * (1.0 - smoothstep(0.0, 0.25, uBlast)) * step(0.001, uBlast) * 0.5;

    col *= 1.0 - 0.7 * uProgress;
    col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.03;
    fragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
  }
`

// IPSELENTI backdrop: crimson aurora curtains that swell with the crowd's
// energy (uEnergy 0..1) and flash on every beat (uBeat).
export const AURORA = /* glsl */ `
  uniform float uEnergy;
  uniform float uBeat;
  ${NOISE}
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    vec3 col = vec3(0.03, 0.01, 0.02);
    for (int i = 0; i < 4; i++){
      float fi = float(i);
      float x = p.x * (1.2 + fi * 0.35) + uTime * (0.04 + fi * 0.015);
      float y = 0.1 + 0.25 * (fbm(vec2(x, fi * 3.7)) - 0.5) + fi * 0.06;
      float d = p.y - y;
      float curtain = exp(-max(d, 0.0) * (5.0 - uEnergy * 3.0)) * smoothstep(-0.02, 0.05, d);
      curtain *= 0.5 + 0.5 * fbm(vec2(x * 6.0, uTime * 0.2));
      vec3 c = mix(vec3(0.55, 0.0, 0.05), vec3(1.0, 0.45, 0.1), fi / 3.0);
      col += c * curtain * (0.12 + 0.75 * uEnergy);
    }
    col += vec3(0.7, 0.02, 0.05) * uBeat * 0.25 * (1.0 - length(p));
    col *= 1.0 - 0.5 * length(uv - 0.5);
    fragColor = vec4(col, 1.0);
  }
`

// Behind the great gate: dawn over Anam, gold light pouring through the
// crack (uOpen 0..1 widens it).
export const DAWN = /* glsl */ `
  uniform float uOpen;
  ${NOISE}
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (uv - vec2(0.5, 0.42)) * vec2(uRes.x / uRes.y, 1.0);
    vec3 sky = mix(vec3(0.98, 0.78, 0.5), vec3(0.62, 0.05, 0.1), smoothstep(-0.1, 0.7, p.y));
    sky = mix(sky, vec3(0.08, 0.02, 0.04), smoothstep(0.4, 1.0, length(p)) * (1.0 - uOpen * 0.6));
    float a = atan(p.y, p.x);
    float rays = pow(0.5 + 0.5 * sin(a * 18.0 + uTime * 0.2 + fbm(vec2(a * 3.0, uTime * 0.1)) * 3.0), 6.0);
    sky += vec3(1.0, 0.8, 0.5) * rays * exp(-length(p) * 2.2) * (0.25 + uOpen * 0.5);
    sky += vec3(1.0, 0.9, 0.7) * exp(-length(p) * 7.0) * (0.4 + uOpen);
    fragColor = vec4(sky, 1.0);
  }
`
