// Content linter for data/questions.json. The answer table IS the game, so
// these are the invariants worth failing a build over.
import { readFileSync } from 'node:fs'
import { normalize } from '../src/normalize.js'

const TIER_ORDER = ['dust', 'tooclever', 'flocker', 'rare', 'farout', 'astronomical']
const doc = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)))
const problems = []
const warn = []
const redundant = []
const seenIds = new Set()

for (const q of doc.questions) {
  const where = `[${q.id}]`
  if (seenIds.has(q.id)) problems.push(`${where} duplicate question id`)
  seenIds.add(q.id)
  if (!q.prompt) problems.push(`${where} missing prompt`)

  const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]))
  const seenKeys = new Map()

  q.answers.forEach(([name, tier, , aliases = []], idx) => {
    if (!TIER_ORDER.includes(tier)) problems.push(`${where} "${name}" has unknown tier "${tier}"`)
    byTier[tier] = (byTier[tier] ?? 0) + 1
    for (const form of [name, ...aliases]) {
      const key = normalize(form)
      if (!key) {
        problems.push(`${where} "${name}" normalizes to an empty key`)
        continue
      }
      const prior = seenKeys.get(key)
      if (prior === undefined) {
        seenKeys.set(key, { name, idx })
      } else if (prior.idx !== idx) {
        // Two DIFFERENT entries claiming one key: the later one is
        // unreachable, and when they sit in different tiers the score for
        // that word is a coin flip. Always a bug — including the common
        // case of one answer pasted into two tiers.
        problems.push(
          `${where} "${form}" collides with "${prior.name}" (both normalize to "${key}")`
        )
      } else if (form !== name) {
        // An alias that already normalizes to its own answer's key — free to
        // drop, never harmful. Worth reporting so the seed stays tidy.
        redundant.push(`${where} alias "${form}" is redundant with "${name}"`)
      }
    }
  })

  if (byTier.astronomical !== 1)
    problems.push(`${where} needs exactly 1 astronomical answer, has ${byTier.astronomical}`)
  if (byTier.dust < 2) warn.push(`${where} only ${byTier.dust} dust answers — needs obvious picks`)
  if (byTier.tooclever < 1) warn.push(`${where} no Too Clever trap`)
  if (q.answers.length < 20) warn.push(`${where} only ${q.answers.length} answers — thin`)
}

const total = doc.questions.reduce((n, q) => n + q.answers.length, 0)
console.log(`${doc.questions.length} questions · ${total} answers`)
for (const r of redundant) console.log('  tidy  ' + r)
for (const w of warn) console.log('  warn  ' + w)
for (const p of problems) console.log('  FAIL  ' + p)
if (problems.length) {
  console.log(`\n${problems.length} problem(s).`)
  process.exit(1)
}
console.log(warn.length ? `\n${warn.length} warning(s), no failures.` : '\nclean.')
