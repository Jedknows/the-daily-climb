// Every sound is synthesised — no files, no decode on a cold portal load.
//
// The event table follows the dive game's bus closely (same envelope shapes,
// same registers) so the game FEELS the same, with the one big cue flipped:
// a landing there is a thud that falls in pitch; a landing here settles from
// above. "lift" replaces "sink".

let ctx = null
let master = null
let muted = false
let sdkMuted = false
const listeners = new Set()

const KEY = 'climb-muted'
try {
  muted = localStorage.getItem(KEY) === '1'
} catch { /* private mode — default to sound on */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.38
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function unlock() {
  ac()
}
export function isMuted() {
  return muted
}
export function toggleMuted() {
  setMuted(!muted)
  return muted
}
export function setMuted(v) {
  muted = !!v
  try {
    localStorage.setItem(KEY, muted ? '1' : '0')
  } catch { /* nothing to persist to */ }
  listeners.forEach((fn) => fn(muted))
}
// Platform mute sits ABOVE the in-game toggle: when the portal mutes the
// frame, nothing in here can turn sound back on.
export function setSdkMuted(v) {
  sdkMuted = !!v
  listeners.forEach((fn) => fn(muted))
}
export function onMuteChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const silent = () => muted || sdkMuted

// One oscillator with an optional pitch sweep (f0 -> f1) and lowpass.
function tone({ f0, f1, dur = 0.15, type = 'square', peak = 0.2, a = 0.008, lp = 0, delay = 0 }) {
  if (silent()) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t0)
  if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  let node = osc
  if (lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lp
    osc.connect(f)
    node = f
  }
  node.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

// Filtered noise; `sweepTo` slides the lowpass over the duration, which is
// what turns a hiss into a whoosh.
function noise({ dur = 0.3, peak = 0.2, lp = 4000, hp = 0, sweepTo = 0, delay = 0 }) {
  if (silent()) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const lpf = c.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.setValueAtTime(lp, t0)
  if (sweepTo) lpf.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
  let node = lpf
  src.connect(lpf)
  if (hp) {
    const hpf = c.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = hp
    lpf.connect(hpf)
    node = hpf
  }
  const g = c.createGain()
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  node.connect(g)
  g.connect(master)
  src.start(t0)
}

const arp = (notes, { step = 0.1, dur = 0.5, peak = 0.15, lp = 3000, type = 'square' } = {}) =>
  notes.forEach((f0, i) => tone({ f0, dur, peak, lp, type, delay: i * step }))

const EVENTS = {
  submit: () => tone({ f0: 1150, dur: 0.16, a: 0.003, peak: 0.16 }),
  reject: () => {
    noise({ dur: 0.22, lp: 420, peak: 0.2 })
    tone({ f0: 150, f1: 62, dur: 0.36, peak: 0.22, lp: 700 })
  },
  tierline: () => tone({ type: 'triangle', f0: 780, f1: 1560, dur: 0.07, peak: 0.13, lp: 2500 }),
  // Crossing a named zone: two rising notes, a beat apart.
  zone: () => {
    tone({ type: 'triangle', f0: 660, dur: 0.12, peak: 0.14, lp: 3000 })
    tone({ type: 'triangle', f0: 990, dur: 0.24, peak: 0.14, lp: 3000, delay: 0.11 })
  },
  // The answer lifting off: a rising sweep where the dive had a falling one.
  lift: () => {
    tone({ f0: 1150, dur: 0.7, a: 0.01, peak: 0.1 })
    noise({ dur: 1.3, lp: 180, sweepTo: 1400, peak: 0.16 })
    tone({ f0: 60, f1: 300, dur: 1.3, peak: 0.1 })
  },
  land_small: () => {
    tone({ f0: 140, f1: 70, dur: 0.25, peak: 0.28, lp: 600 })
    noise({ dur: 0.14, lp: 500, peak: 0.1 })
  },
  land_big: () => {
    tone({ f0: 80, f1: 45, dur: 0.6, peak: 0.38 })
    noise({ dur: 0.7, lp: 900, sweepTo: 200, peak: 0.18, delay: 0.02 })
    tone({ type: 'triangle', f0: 523, dur: 0.4, peak: 0.09, delay: 0.15 })
  },
  astronomical: () => {
    tone({ f0: 60, f1: 40, dur: 1.2, peak: 0.34 })
    arp([784, 988, 1175, 1568], { step: 0.13, dur: 0.7, peak: 0.15, lp: 3000 })
    noise({ dur: 1.4, lp: 2500, hp: 1200, peak: 0.05, delay: 0.3 })
  },
  miss: () => {
    tone({ f0: 220, f1: 52, dur: 0.7, peak: 0.24 })
    noise({ dur: 0.5, lp: 400, peak: 0.14, delay: 0.05 })
  },
  tick: () => {
    tone({ f0: 880, dur: 0.07, peak: 0.16 })
    tone({ f0: 880, dur: 0.05, peak: 0.06, delay: 0.12 })
  },
  blub: () => {
    const e = 0.85 + 0.45 * Math.random()
    tone({ f0: 260 * e, f1: 720 * e, dur: 0.13, peak: 0.22, lp: 2200 })
    noise({ dur: 0.05, lp: 1800, hp: 700, peak: 0.05 })
  },
  begin: () => {
    noise({ dur: 1.1, lp: 2000, sweepTo: 240, peak: 0.15 })
    tone({ f0: 110, f1: 48, dur: 1.2, peak: 0.32 })
    tone({ type: 'triangle', f0: 784, dur: 0.5, peak: 0.12, lp: 3000 })
    tone({ type: 'triangle', f0: 523, dur: 0.75, peak: 0.12, lp: 3000, delay: 0.22 })
  },
  finish: () => arp([392, 523, 659, 784, 1047], { step: 0.11, dur: 0.5, peak: 0.2, type: 'triangle' }),
  ui: () => tone({ f0: 520, dur: 0.05, peak: 0.14 }),
  type: () => tone({ f0: 900 + Math.random() * 180, dur: 0.02, peak: 0.04 }),
}

export function event(name) {
  ;(EVENTS[name] ?? (() => {}))()
}
export const sfx = new Proxy({}, { get: (_, k) => () => event(k) })
