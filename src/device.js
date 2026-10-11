// Device tier. Phones with little memory or few cores get the lite build:
// a lower render resolution, fewer people and particles, no fur shells.
// ?lite=1 forces it on, ?lite=0 off (for checking either on any device).
const q = new URLSearchParams(location.search).get('lite')
export const MOBILE = innerWidth < 760
const weak = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4
export const LITE = q === '1' || (q !== '0' && MOBILE && weak)
if (LITE) document.documentElement.classList.add('lite')

// The pixel ratio a scene renders at: its own caps, lowered further on lite.
export const pixelRatio = (mobileCap, desktopCap) => Math.min(devicePixelRatio, MOBILE ? (LITE ? Math.min(mobileCap, 0.85) : mobileCap) : LITE ? Math.min(desktopCap, 1) : desktopCap)

// A count or size: the full value, or the lite one.
export const tier = (full, lite) => (LITE ? lite : full)
