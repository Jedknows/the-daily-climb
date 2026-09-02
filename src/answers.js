import { QUESTIONS, QUIPS } from './data/keys.generated.js'
import { normalize } from './normalize.js'
import { keyHash, unscramble } from './hash.js'
import { TIERS, TIER_IDS } from './rules.js'

export const ALL_QUESTIONS = QUESTIONS

export function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) ?? null
}

// Score one typed guess against one question.
// Returns { hit, tier, points, quip, text, name, inferred } — `hit` false
// means the guess isn't on the board at all, which is worth nothing and
// says so. `name` is the canonical answer the guess counted as; `inferred`
// is true when it got there through shorthand ("golden" -> Golden
// Retriever) rather than the full name or an authored alias.
export function scoreGuess(question, raw) {
  const text = String(raw ?? '').trim()
  const norm = normalize(text)
  if (!norm) return { hit: false, tier: null, points: 0, quip: '', text: '' }

  const found = question.keys[keyHash(question.id, norm)]
  if (!found) return { hit: false, tier: null, points: 0, quip: '', text }

  const [tierIdx, quipIdx, nameIdx, derived] = found
  const tier = TIERS[TIER_IDS[tierIdx]]
  return {
    hit: true,
    tier,
    points: tier.score,
    quip: quipIdx >= 0 ? QUIPS[quipIdx] : tier.blurb,
    text, // what was typed
    name: unscramble(question.names[nameIdx], question.id), // what it counts as
    inferred: derived === 1, // matched through shorthand, not the full name or an alias
  }
}
