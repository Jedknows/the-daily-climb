// Every sound is synthesised. No audio files means no extra requests, no
// decode cost on a cold portal load, and a bundle that stays a few hundred KB
// — which is the difference between a fast first play and a bounce.

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
    master.gain.value = 0.34
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Browsers won't start audio until the player does something; the first
// gesture unlocks the context for the rest of the session.
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
// The platform mute sits ABOVE the in-game toggle: when CrazyGames mutes the
// frame, nothing in the game can turn the sound back on.
export function setSdkMuted(v) {
  sdkMuted = !!v
  listeners.forEach((fn) => fn(muted))
}
export function onMuteChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const silent = () => muted || sdkMuted

function tone({ freq, to, dur = 0.15, type = 'square', gain = 0.3, delay = 0, sweep = 0 }) {
  if (silent()) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
  else if (sweep) osc.frequency.linearRampToValueAtTime(Math.max(1, freq + sweep), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

function noise({ dur = 0.3, gain = 0.2, delay = 0, hp = 320, lp = 5200 }) {
  if (silent()) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const hpf = c.createBiquadFilter()
  hpf.type = 'highpass'
  hpf.frequency.value = hp
  const lpf = c.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = lp
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(hpf)
  hpf.connect(lpf)
  lpf.connect(g)
  g.connect(master)
  src.start(t0)
}

const arp = (notes, step = 0.075, opts = {}) =>
  notes.forEach((f, i) => tone({ freq: f, dur: 0.16, delay: i * step, ...opts }))

export const sfx = {
  ui: () => tone({ freq: 520, dur: 0.05, gain: 0.16, type: 'square' }),
  type: () => tone({ freq: 900 + Math.random() * 180, dur: 0.02, gain: 0.045, type: 'square' }),
  launch: () => {
    noise({ dur: 1.1, gain: 0.3, hp: 90, lp: 1800 })
    tone({ freq: 70, to: 220, dur: 1.0, type: 'sawtooth', gain: 0.2 })
  },
  tick: () => tone({ freq: 1180, dur: 0.035, gain: 0.11, type: 'square' }),
  warn: () => tone({ freq: 300, to: 200, dur: 0.16, gain: 0.2, type: 'square' }),
  miss: () => {
    tone({ freq: 200, to: 70, dur: 0.5, type: 'sawtooth', gain: 0.22 })
    noise({ dur: 0.4, gain: 0.1, hp: 120, lp: 900 })
  },
  // Each tier gets a distinctly taller sound — the reward IS the fanfare.
  dust: () => arp([392, 440], 0.07, { gain: 0.18 }),
  tooclever: () => {
    tone({ freq: 520, to: 300, dur: 0.28, type: 'sawtooth', gain: 0.24 })
    tone({ freq: 260, to: 150, dur: 0.34, type: 'square', gain: 0.16, delay: 0.05 })
  },
  flocker: () => arp([523, 659, 784], 0.07),
  rare: () => arp([523, 659, 784, 1047], 0.068, { gain: 0.28 }),
  farout: () => {
    arp([523, 659, 784, 1047, 1319], 0.062, { gain: 0.3 })
    noise({ dur: 0.6, gain: 0.09, hp: 2200, delay: 0.1 })
  },
  astronomical: () => {
    arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.058, { gain: 0.32, type: 'square' })
    arp([262, 330, 392, 523], 0.058, { gain: 0.2, type: 'triangle', dur: 0.4 })
    noise({ dur: 1.2, gain: 0.11, hp: 1800, delay: 0.16 })
  },
  finish: () => arp([392, 523, 659, 784, 1047], 0.11, { gain: 0.26, type: 'triangle' }),
}

export function playTier(tierId) {
  ;(sfx[tierId] ?? sfx.dust)()
}
