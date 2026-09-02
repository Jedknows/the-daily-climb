# What counts as what

The rubric behind every answer's tier. The readable, generated version — the ten newest prompts laid out by tier plus verified inference examples — is the review page *What Counts As What* published alongside the repo; `docs/inference.md` is the full machine-generated table of every shorthand the game accepts.

| tier | pts | where a run of this quality ends up | the rule |
| --- | --- | --- | --- |
| Dust | 10 | never leaves the air | The first thing most people say. It needs no thought, so it earns almost nothing. |
| Too Clever | 15 | still in the weather | The famous "obscure" pick — feels like a deep cut, is everyone's deep cut. Exactly one per prompt. The trap that makes the game a game. |
| Flocker | 30 | makes orbit | A solid, real answer most people would recognise. The broad middle. |
| Rare | 60 | high orbit, Moon in reach | Genuinely uncommon. You'd need a reason to know it. |
| Far Out | 85 | out among the planets | True obscurity. A specialist's answer, or one with a story attached. |
| Astronomical | 100 | interstellar | The designated gem: one per prompt, the rarest answer that is still unarguably correct. |

**The working test:** imagine ten people at a table given the prompt. If most say it, Dust. If it's the one someone says with a grin because it feels clever, Too Clever. If a couple would say it and everyone nods, Flocker. If one might, Rare. If none would but an expert could, Far Out. If it takes a story to explain why it counts, and it does count, that's the gem.

## Inference

On top of full names and authored aliases, `npm run keys` derives shorthand from every answer: each distinctive word of a multi-word name (four letters or more; function words, titles and colours excluded), the space-less join, and for three-plus-word names the first and last word pairs. A shorthand that several answers share counts as the **most common** of them (lowest tier) — "shepherd" is a German Shepherd, "weasley" is Ron — so a lazy word never buys a rare score. A full name or authored alias always beats a derived form; to change a resolution, add an alias in `data/questions.json`.
