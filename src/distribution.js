// Where a score sits among everyone else's.
//
// There is no server yet, so "everyone else" is a model: for each of the
// day's prompts, a prior over which tier a typical player lands, convolved
// across the seven rounds into a distribution over 0..700. It is the same
// for every player on a given day (it depends only on the prompts), it is
// right-skewed the way a real crowd is, and it is labelled as expected
// rather than observed. When real climbs exist, distributionFor() is the
// one function to swap; the chart and the caption read whatever it returns.
import { TIERS, MAX_DAY_SCORE, ROUNDS_PER_DAY } from './rules.js'
import { store } from './portal.js'

export const BUCKET = 25
export const BUCKETS = MAX_DAY_SCORE / BUCKET + 1 // 0..700 inclusive -> 29

// How a crowd splits on one prompt, before seeing the board. Modelled as a
// mixture of three kinds of player rather than one average one: rounds are
// not independent draws — a sharp player is sharp on all seven — and a
// single prior makes the crowd far tighter than any real crowd is.
const PRIORS = [
  { w: 0.55, p: { miss: 0.07, dust: 0.50, tooclever: 0.14, flocker: 0.21, rare: 0.06, farout: 0.018, astronomical: 0.002 } }, // casual
  { w: 0.33, p: { miss: 0.04, dust: 0.30, tooclever: 0.13, flocker: 0.29, rare: 0.17, farout: 0.06, astronomical: 0.01 } }, // regular
  { w: 0.12, p: { miss: 0.015, dust: 0.12, tooclever: 0.10, flocker: 0.25, rare: 0.30, farout: 0.17, astronomical: 0.045 } }, // sharp
]

// Nudge a prior by how the prompt's board is shaped: a board whose middle is
// thick gives the middle tiers more weight, a top-heavy board the obvious.
function priorFor(base, question) {
  const p = { ...base }
  if (question?.keys) {
    const counts = [0, 0, 0, 0, 0, 0]
    for (const [tierIdx] of Object.values(question.keys)) counts[tierIdx]++
    const total = counts.reduce((a, b) => a + b, 0) || 1
    const mid = (counts[2] + counts[3]) / total // flocker + rare share of the board
    const shift = (mid - 0.6) * 0.15 // boards are ~60% middle on average
    p.flocker += shift * 0.6
    p.rare += shift * 0.4
    p.dust -= shift
  }
  const sum = Object.values(p).reduce((a, b) => a + b, 0)
  for (const k in p) p[k] /= sum
  return p
}

function convolve(base, rounds) {
  let dist = new Float64Array(MAX_DAY_SCORE + 1)
  dist[0] = 1
  for (const q of rounds) {
    const p = priorFor(base, q)
    const next = new Float64Array(MAX_DAY_SCORE + 1)
    for (let s = 0; s <= MAX_DAY_SCORE; s++) {
      const m = dist[s]
      if (!m) continue
      next[s] += m * p.miss
      for (const id of Object.keys(TIERS)) {
        const t = Math.min(MAX_DAY_SCORE, s + TIERS[id].score)
        next[t] += m * p[id]
      }
    }
    dist = next
  }
  return dist
}

export function distributionFor(questions) {
  const rounds = questions?.length ? questions : Array.from({ length: ROUNDS_PER_DAY })
  const fine = new Float64Array(MAX_DAY_SCORE + 1)
  for (const { w, p } of PRIORS) {
    const d = convolve(p, rounds)
    for (let s = 0; s <= MAX_DAY_SCORE; s++) fine[s] += w * d[s]
  }
  // Bucket for the chart; keep the fine array for percentiles.
  const buckets = new Array(BUCKETS).fill(0)
  for (let s = 0; s <= MAX_DAY_SCORE; s++) buckets[Math.round(s / BUCKET)] += fine[s]
  return { fine, buckets, label: "today's climbers", modeled: true }
}

// Share of the population strictly below `score`, as a whole percentage.
export function betterThan(distribution, score) {
  const { fine } = distribution
  let below = 0
  for (let s = 0; s < Math.min(score, fine.length); s++) below += fine[s]
  return Math.round(below * 100)
}

// --- local record --------------------------------------------------------
// A tiny archive of your own finished climbs, so the summary can say
// "your best" and the daily can't be replayed for a better number.
const KEY = 'climb-history'

export function loadHistory() {
  try {
    const raw = store.get(KEY)
    const h = raw ? JSON.parse(raw) : {}
    return h && typeof h === 'object' ? h : {}
  } catch {
    return {}
  }
}

export function recordRun({ mode, day, score, tiers }) {
  const h = loadHistory()
  h.runs = Array.isArray(h.runs) ? h.runs : []
  h.runs.push({ mode, day, score, tiers, at: Date.now() })
  if (h.runs.length > 400) h.runs = h.runs.slice(-400)
  if (mode === 'daily') {
    h.daily = h.daily && typeof h.daily === 'object' ? h.daily : {}
    h.daily[day] = { score, tiers }
  }
  h.best = Math.max(h.best ?? 0, score)
  try {
    store.set(KEY, JSON.stringify(h))
  } catch { /* nothing to persist to */ }
  return h
}

export function dailyResult(day) {
  const h = loadHistory()
  return h.daily?.[day] ?? null
}
