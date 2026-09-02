# The Daily Climb

Seven prompts. Twenty-five seconds each. Rarer answers climb higher — from a
launch pad to the centre of the galaxy.

A daily rarity-guessing game, structured after `krillion.io`'s daily dive and
re-skinned as an ascent. Built as a static bundle for the CrazyGames iframe.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:4173. Add `--host` (already in `.claude/launch.json`)
to reach it from a phone on the same wifi.

| script | what it does |
| --- | --- |
| `npm run dev` | dev server with hot reload |
| `npm run keys` | recompile `data/questions.json` → hashed runtime keys |
| `npm run check` | lint the question bank (duplicates, tiers, gaps) |
| `npm run build` | production build → `dist/` |
| `npm run build:portal` | CrazyGames build → `dist-portal/` |

## How scoring works

Six tiers. A perfect round is 100, a perfect run is 700.

| tier | pts | what it means |
| --- | --- | --- |
| Dust | 10 | the answer everyone blurts out |
| Too Clever | 15 | the famously "obscure" pick everyone reaches for |
| Flocker | 30 | solid — flies with the flock |
| Rare | 60 | genuinely uncommon |
| Far Out | 85 | true obscurity |
| Astronomical | 100 | the designated gem — one per prompt |

An answer that isn't on the board scores nothing. The **Too Clever** tier is
the trap that makes the game a game: the pick that feels clever is the one
everybody makes, so it pays barely more than the obvious answer.

## The altitude ladder

Score maps to altitude through a hand-placed ladder of real landmarks in
`src/rules.js`, interpolated exponentially between rungs. Authoring it rather
than fitting a curve means every iconic number lands on a clean score:

| score | altitude | landmark |
| --- | --- | --- |
| 62 | 12 km | the tropopause |
| 105 | 50 km | the stratopause |
| 150 | 100 km | **the Kármán line — space** |
| 200 | 408 km | the Space Station |
| 350 | 384,400 km | the Moon |
| 485 | 154 AU | Voyager 1, past the heliopause |
| 700 | 26,002 ly | **the galactic core** |

The ladder is deliberately compressed relative to real altitude (space would
otherwise be 300 and the Moon 500), so that a typical 150–250 run actually
gets to see the stars come out, and the tier bands line up with the zones:
Dust never leaves the air, Flocker makes orbit, Rare reaches for the Moon,
Far Out is out among the planets, Astronomical is interstellar.

## Editing the questions

`data/questions.json` is the authoring source and the only file to edit.
Each answer is `[name, tier, quip, aliases]`. After editing:

```bash
npm run check && npm run keys
```

`check` enforces the invariants that matter: exactly one Astronomical per
question, no answer reachable under two tiers, no alias colliding with another
answer once normalised.

`keys` compiles the bank into `src/data/keys.generated.js`, where answers are
stored as salted hashes and quips live in a shared pool addressed by index —
so the shipped bundle can score a guess without containing a readable answer
list. That file is generated; it is not in git.

Currently **50 questions · 2,619 answers**. The daily draw reshuffles all 50
each cycle and deals 7 a day, so nothing repeats inside a week.

## CrazyGames notes

`src/portal.js` is the only place the portal build differs from the web build —
the same bundle, packaged, never forked. It covers their load-time markers
(`loadingStart`/`loadingStop`), gameplay beacons, platform mute (which sits
*above* the in-game toggle, as their QA requires), and the mobile safe-area
inset quirk where the iframe is handed the parent page's inset and would
otherwise reserve that band twice.

Everything is self-contained: the font is vendored, all audio is synthesised
at runtime, and the sky is drawn procedurally rather than shipped as art. No
external requests, which keeps their measured load time honest.
