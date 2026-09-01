import { ALL_QUESTIONS } from './answers.js'
import { ROUNDS_PER_DAY } from './rules.js'

// The day the game turns over: 04:00 UTC, so a run started late at night in
// the Americas doesn't get cut off mid-climb by the date rolling in Europe.
const RESET_HOUR_UTC = 4
const EPOCH = Date.UTC(2026, 7, 1, RESET_HOUR_UTC) // 2026-08-01 04:00 UTC = climb #1

export function dayNumber(now = new Date()) {
  return Math.max(1, Math.floor((now.getTime() - EPOCH) / 86_400_000) + 1)
}

export function nextResetAt(now = new Date()) {
  const d = new Date(now)
  d.setUTCHours(RESET_HOUR_UTC, 0, 0, 0)
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

// Mulberry32 — small, fast, and identical on every device, which is the only
// property that matters here: everyone must get the same seven prompts.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(list, seed) {
  const out = list.slice()
  const rand = rng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Seven prompts a day, drawn without repeats inside a cycle: each cycle
// reshuffles all 50 questions and hands out 7 a day for 7 days. Nobody sees
// the same prompt twice in a week, and the order is different every cycle.
export function promptsForDay(day = dayNumber()) {
  const perCycle = Math.floor(ALL_QUESTIONS.length / ROUNDS_PER_DAY)
  const cycle = Math.floor((day - 1) / perCycle)
  const dayInCycle = (day - 1) % perCycle
  const deck = shuffled(ALL_QUESTIONS, 0x5eed + cycle * 7919)
  return deck.slice(dayInCycle * ROUNDS_PER_DAY, dayInCycle * ROUNDS_PER_DAY + ROUNDS_PER_DAY)
}

// Endless mode: a fresh seven every time, seeded off the run counter so a
// reload doesn't hand back the same set.
export function promptsForEndless(runSeed) {
  return shuffled(ALL_QUESTIONS, (runSeed >>> 0) || 1).slice(0, ROUNDS_PER_DAY)
}
