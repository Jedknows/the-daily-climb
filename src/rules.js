// The Daily Climb — the whole scoring model in one file.
//
// Structural mirror of the dive game this is modelled on: 7 prompts, 25
// seconds each, six answer tiers, 700 points in a perfect run. What changes
// is the direction. Points don't sink you; they lift you, and the ladder
// they lift you up runs from a launch pad to the centre of the galaxy.

export const ROUNDS_PER_DAY = 7
export const SECONDS_PER_ROUND = 25
export const MAX_DAY_SCORE = 700 // 7 x the astronomical tier

// --- tiers -----------------------------------------------------------------
// `climb` is where the tier sits as a fraction of the full ladder — the
// reveal card uses it to place the tier badge on the altitude rail, so a
// Rare visibly lands higher up the strip than a Flocker.
export const TIERS = {
  dust: {
    id: 'dust',
    name: 'Dust',
    score: 10,
    emoji: '\u{1F32B}️',
    blurb: 'The answer everyone blurts out.',
    climb: 0.08,
  },
  tooclever: {
    id: 'tooclever',
    name: 'Too Clever',
    score: 15,
    emoji: '\u{1F921}',
    blurb: 'A famously “obscure” pick. Everyone reaches for it.',
    climb: 0.18,
  },
  flocker: {
    id: 'flocker',
    name: 'Flocker',
    score: 30,
    emoji: '\u{1F426}',
    blurb: 'Solid — flies with the flock.',
    climb: 0.36,
  },
  rare: {
    id: 'rare',
    name: 'Rare',
    score: 60,
    emoji: '☄️',
    blurb: 'Genuinely uncommon. Nice pull.',
    climb: 0.6,
  },
  farout: {
    id: 'farout',
    name: 'Far Out',
    score: 85,
    emoji: '\u{1F6F0}️',
    blurb: 'True obscurity. Few climb this high.',
    climb: 0.82,
  },
  astronomical: {
    id: 'astronomical',
    name: 'Astronomical',
    score: 100,
    emoji: '\u{1F31F}',
    blurb: 'The designated gem. The galactic core.',
    climb: 0.97,
  },
}

export const TIER_IDS = Object.keys(TIERS)
export const MISS_TIER = { id: null, name: 'Nothing Lifted', score: 0 }

// --- end-of-run verdict ----------------------------------------------------
export const SCORE_BANDS = [
  { min: 0, tier: 'dust', range: '0–150', verdict: 'Dust. Barely cleared the launch pad.' },
  { min: 151, tier: 'flocker', range: '151–250', verdict: 'Flocker. Cruising with the flock.' },
  { min: 251, tier: 'rare', range: '251–350', verdict: 'Rare. Above the weather. Nice.' },
  { min: 351, tier: 'farout', range: '351–449', verdict: 'Far out. Genuinely high orbit.' },
  { min: 450, tier: 'astronomical', range: '450+', verdict: 'Astronomical. You touched the core. Absurd.' },
]

export function bandFor(score) {
  return [...SCORE_BANDS].reverse().find((b) => score >= b.min) ?? SCORE_BANDS[0]
}

// --- the altitude ladder ---------------------------------------------------
// The dive game could be linear: one point sank you ten metres, and 700
// points was the trench floor at 7,000 m. Up has no such courtesy. The
// interesting sky spans ten orders of magnitude, so score maps to altitude
// through a hand-placed ladder of real landmarks, interpolated
// exponentially between rungs.
//
// The payoff of authoring it rather than fitting a curve: every iconic
// number lands on a clean score. The Karman line is exactly 300. The Moon is
// exactly 500. A perfect 700 is the galactic core.
//
// `m` is metres. Yes, the last few rungs are absurd numbers of metres —
// formatAltitude() switches units long before anyone has to read them.
export const LADDER = [
  { score: 0, m: 0, label: 'the launch pad' },
  { score: 12, m: 330, label: 'the Eiffel Tower' },
  { score: 24, m: 828, label: 'the Burj Khalifa' },
  { score: 38, m: 2_000, label: 'the base of the clouds' },
  { score: 55, m: 5_895, label: 'the summit of Kilimanjaro' },
  { score: 72, m: 8_849, label: 'the summit of Everest' },
  { score: 86, m: 10_600, label: 'airliner cruising altitude' },
  { score: 100, m: 12_000, label: 'the tropopause' },

  { score: 130, m: 18_000, label: 'the Armstrong limit' },
  { score: 160, m: 30_000, label: 'the ozone layer' },
  { score: 180, m: 38_969, label: "Baumgartner's jump" },
  { score: 200, m: 50_000, label: 'the stratopause' },

  { score: 230, m: 60_000, label: 'where meteors burn up' },
  { score: 260, m: 76_000, label: 'noctilucent clouds' },
  { score: 285, m: 85_000, label: 'the mesopause' },
  { score: 300, m: 100_000, label: 'the Kármán line — space' },

  { score: 330, m: 160_000, label: 'the lowest stable orbit' },
  { score: 360, m: 408_000, label: 'the Space Station' },
  { score: 380, m: 550_000, label: 'the Starlink shell' },
  { score: 400, m: 1_000_000, label: 'the top of the aurora' },

  { score: 430, m: 2_000_000, label: 'the Van Allen belts' },
  { score: 465, m: 35_786_000, label: 'geostationary orbit' },
  { score: 500, m: 384_400_000, label: 'the Moon' },

  { score: 530, m: 1_500_000_000, label: 'the Webb telescope at L2' },
  { score: 560, m: 149_600_000_000, label: 'the Sun' },
  { score: 580, m: 4_500_000_000_000, label: 'Neptune' },
  { score: 600, m: 23_000_000_000_000, label: 'Voyager 1, past the heliopause' },

  { score: 630, m: 4.0114e16, label: 'Proxima Centauri' },
  { score: 655, m: 6.06e18, label: 'Betelgeuse' },
  { score: 680, m: 7.09e19, label: 'the Pillars of Creation' },
  { score: 700, m: 2.46e20, label: 'the galactic core' },
]

// Altitude for any score, interpolated in log space between ladder rungs so
// the readout accelerates the way the real sky does.
export function altitudeFor(score) {
  const s = Math.max(0, Math.min(MAX_DAY_SCORE, score))
  if (s <= 0) return 0
  let lo = LADDER[0]
  let hi = LADDER[LADDER.length - 1]
  for (let i = 0; i < LADDER.length - 1; i++) {
    if (s >= LADDER[i].score && s <= LADDER[i + 1].score) {
      lo = LADDER[i]
      hi = LADDER[i + 1]
      break
    }
  }
  if (hi.score === lo.score) return hi.m
  const t = (s - lo.score) / (hi.score - lo.score)
  // The first rung starts at 0 m, where log space has no footing — walk that
  // one segment linearly and let every later segment go exponential.
  if (lo.m <= 0) return hi.m * t
  return lo.m * Math.pow(hi.m / lo.m, t)
}

// The nearest landmark at or below a score — the "you are passing…" line.
export function landmarkFor(score) {
  let found = LADDER[0]
  for (const rung of LADDER) if (score >= rung.score) found = rung
  return found
}

// --- units -----------------------------------------------------------------
const AU = 149_597_870_700
const LY = 9.4607e15

// Metres are unreadable past low orbit, so the readout climbs through units
// the same way the player climbs through the sky. Returns the pieces
// separately so the HUD can style the number and the unit differently.
export function formatAltitude(m) {
  const abs = Math.abs(m)
  // The boundaries are picked so the landmarks keep the numbers people know
  // them by: the Moon stays 384,400 km, L2 stays 1.5 M km, the Sun stays 1 AU.
  if (abs < 1_000) return { value: fmt(m, 0), unit: 'm' }
  if (abs < 1e9) return { value: fmt(m / 1e3, abs < 1e4 ? 1 : 0), unit: 'km' }
  if (abs < 0.3 * AU) return { value: fmt(m / 1e9, abs < 1e10 ? 1 : 0), unit: 'M km' }
  if (abs < 0.05 * LY) return { value: fmt(m / AU, abs / AU < 10 ? 2 : 0), unit: 'AU' }
  return { value: fmt(m / LY, m / LY < 10 ? 2 : m / LY < 1000 ? 0 : 0), unit: 'ly' }
}

export function altitudeText(m) {
  const { value, unit } = formatAltitude(m)
  return value + ' ' + unit
}

function fmt(n, places) {
  const rounded = places > 0 ? Number(n.toFixed(places)) : Math.round(n)
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  })
}

// --- camera ------------------------------------------------------------
// Where the player sits on screen, as a fraction of viewport height.
// Low at the start so the launch pad and the horizon are both in frame, and
// rising to mid-screen over the first 60 points, once there is nothing below
// worth looking at. Shared by the DOM world column, the sky and the sprite —
// if these three disagree the ground detaches from the player's feet.
export function cameraAnchor(score) {
  const t = Math.min(1, Math.max(0, score / 60))
  const ease = t * t * (3 - 2 * t)
  return 0.75 - 0.2 * ease
}
