// Compiles data/questions.json (readable, editable, the authoring source)
// into src/data/keys.generated.js (what actually ships), and writes
// docs/inference.md, the human-readable record of every shorthand the
// game will accept and what it resolves to.
//
// Three things change in the crossing. Answers become salted hashes, so the
// bundle can score a guess without containing the answer list. Quips move
// into a shared pool addressed by index. And every answer gains DERIVED
// keys — its distinctive words, its space-less join, its first and last
// word pairs — so "golden" lands Golden Retriever and "pearl earring" lands
// the Vermeer, without anyone authoring those forms by hand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalize } from '../src/normalize.js'
import { keyHash, scramble } from '../src/hash.js'

const here = dirname(fileURLToPath(import.meta.url))
const TIER_ORDER = ['dust', 'tooclever', 'flocker', 'rare', 'farout', 'astronomical']
const TIER_NAME = { dust: 'Dust', tooclever: 'Too Clever', flocker: 'Flocker', rare: 'Rare', farout: 'Far Out', astronomical: 'Astronomical' }

// Words that never earn a derived key on their own: function words, place
// and title words, sizes, and colours. "golden" is deliberately absent —
// "golden" for Golden Retriever is the whole point — but "red" must not be
// a three-letter ticket to Red Onion.
const STOP = new Set(`
  the of and a an in on at to for with from by or nor de la le el los las del da di du von van der den y et
  new old big little great grand upper lower high low north south east west northern southern eastern western central
  saint st san santa santo mt mount mountain mountains lake river sea ocean island islands isle city town bay cape port fort point valley park national
  republic states state federal democratic federation people peoples union free holy royal
  sir mr mrs ms dr doctor captain general admiral king queen prince princess lord lady master professor madam miss
  red blue green black white yellow pink purple orange brown grey gray dark light
  super ultra mega mini max pro classic original special deluxe extra plus one two three
`.split(/\s+/).filter(Boolean))

const singular = (w) => w.replace(/(\w+?)(?<![us])s$/, '$1')

// Every shorthand a name (or an authored alias) implies.
function derive(forms) {
  const out = new Set()
  for (const form of forms) {
    const norm = normalize(form)
    if (!norm) continue
    const words = norm.split(' ')
    if (words.length < 2) continue
    out.add(words.join(''))
    for (const w of words) {
      const sw = singular(w)
      if (sw.length >= 4 && !STOP.has(sw) && !/^\d+$/.test(sw)) out.add(sw)
    }
    if (words.length >= 3) {
      out.add(normalize(words.slice(0, 2).join(' ')))
      out.add(normalize(words.slice(-2).join(' ')))
    }
    out.delete(norm)
  }
  return [...out].filter(Boolean)
}

const doc = JSON.parse(readFileSync(join(here, '..', 'data', 'questions.json')))

const quipPool = []
const quipIndex = new Map()
const quipRef = (text) => {
  if (!text) return -1
  if (!quipIndex.has(text)) {
    quipIndex.set(text, quipPool.length)
    quipPool.push(text)
  }
  return quipIndex.get(text)
}

let collisions = 0
let explicitCount = 0
let derivedCount = 0
let ambiguousCount = 0
const report = []

const questions = doc.questions.map((q) => {
  const keys = {}
  const origin = new Map() // hash -> answer that claimed it
  const explicitNorms = new Map() // normalized explicit form -> answer idx
  const answers = q.answers.map(([name, tier, quip, aliases = []]) => ({
    name, tier, tierIdx: TIER_ORDER.indexOf(tier), quipIdx: quipRef(quip), aliases,
  }))

  // Explicit keys first: names and authored aliases. These always win.
  answers.forEach((a, idx) => {
    for (const form of [a.name, ...a.aliases]) {
      const norm = normalize(form)
      if (!norm) continue
      const h = keyHash(q.id, norm)
      if (h in keys && origin.get(h) !== a.name) {
        console.error(`  hash collision in [${q.id}]: "${form}" vs "${origin.get(h)}"`)
        collisions++
      }
      keys[h] = [a.tierIdx, a.quipIdx, idx, 0]
      origin.set(h, a.name)
      explicitNorms.set(norm, idx)
      explicitCount++
    }
  })

  // Derived keys: gather candidates per shorthand, then resolve. A shorthand
  // that several answers share goes to the most common of them — the lowest
  // tier — so a lazy word never buys a rare score.
  const candidates = new Map()
  answers.forEach((a, idx) => {
    for (const form of derive([a.name, ...a.aliases])) {
      if (explicitNorms.has(form)) continue // an explicit answer already owns this
      if (!candidates.has(form)) candidates.set(form, [])
      const list = candidates.get(form)
      if (!list.some((c) => c.idx === idx)) list.push({ idx, tierIdx: a.tierIdx })
    }
  })

  const lines = []
  for (const [form, list] of [...candidates].sort((x, y) => x[0].localeCompare(y[0]))) {
    const sorted = [...list].sort((x, y) => x.tierIdx - y.tierIdx || x.idx - y.idx)
    const chosen = answers[sorted[0].idx]
    keys[keyHash(q.id, form)] = [chosen.tierIdx, chosen.quipIdx, sorted[0].idx, 1]
    derivedCount++
    const alts = sorted.slice(1).map((c) => answers[c.idx].name)
    if (alts.length) ambiguousCount++
    lines.push(
      `| \`${form}\` | ${chosen.name} | ${TIER_NAME[chosen.tier]} |` +
        (alts.length ? ` also: ${alts.join(', ')} |` : ' |')
    )
  }
  report.push(`\n## ${q.prompt}\n\n_${q.id} · ${answers.length} answers · ${lines.length} inferred forms_\n\n| you type | it counts as | tier | ambiguity |\n| --- | --- | --- | --- |\n${lines.join('\n')}`)

  return {
    id: q.id,
    prompt: q.prompt,
    note: q.note ?? '',
    names: answers.map((a) => scramble(a.name, q.id)),
    keys,
  }
})

if (collisions) {
  console.error(`\n${collisions} hash collision(s) — change the salt in src/hash.js.`)
  process.exit(1)
}

mkdirSync(join(here, '..', 'src', 'data'), { recursive: true })
const out =
  '// GENERATED by scripts/build-answers.mjs — do not edit.\n' +
  '// Edit data/questions.json and run `npm run keys`.\n' +
  'export const QUIPS = ' +
  JSON.stringify(quipPool) +
  '\nexport const QUESTIONS = ' +
  JSON.stringify(questions) +
  '\n'
writeFileSync(join(here, '..', 'src', 'data', 'keys.generated.js'), out)

mkdirSync(join(here, '..', 'docs'), { recursive: true })
writeFileSync(
  join(here, '..', 'docs', 'inference.md'),
  `# What the game infers\n\nGenerated by \`npm run keys\` — do not edit by hand.\n\n` +
    `Every answer is matched by its full name and any authored aliases. On top of that, the compiler derives shorthand: ` +
    `each distinctive word of a multi-word name (four letters or more, not a function or colour word), the space-less join, ` +
    `and for names of three or more words the first and last word pairs. When a shorthand could mean several answers it counts as the ` +
    `**most common** of them (the lowest tier), listed here under _ambiguity_. An explicit name or alias always beats a derived form.\n\n` +
    `To change a resolution, add an alias in \`data/questions.json\` — aliases win.\n\n` +
    `**${doc.questions.length} questions · ${explicitCount} explicit keys · ${derivedCount} inferred forms (${ambiguousCount} ambiguous, resolved to the most common)**\n` +
    report.join('\n')
)

console.log(
  `built ${questions.length} questions · ${explicitCount} explicit + ${derivedCount} inferred keys ` +
    `(${ambiguousCount} ambiguous) · ${quipPool.length} quips · ${(out.length / 1024).toFixed(0)} KB · docs/inference.md`
)
