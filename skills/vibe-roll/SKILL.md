---
name: vibe-roll
description: Roll truly random anchors (words, senses, motives, transforms, tarot/I Ching...) from curated pools and build ideas from them, to escape predictable LLM defaults. Use only when the user invokes /vibe-roll or explicitly asks to "roll" or for random anchors -- not for every brainstorm.
license: MIT
compatibility: Requires bun, or Node.js >= 22.18 (native TypeScript type stripping). No dependencies.
metadata:
  version: "0.3.0"
---

# vibe-roll

LLMs collapse to the same few "creative" answers. This skill injects real randomness at the
**semantic** level: a script picks anchors from word pools (seeded from crypto randomness), and you
build the idea *from* them. The value comes entirely from the anchors being chosen outside your control.

## Running it

The script lives next to this file. Run with bun; fall back to node (>= 22.18) if bun is missing:

```bash
bun  <skill-dir>/scripts/roll.ts '<template | @preset>' [-n K] [--seed HEX] [--hide-roll]
node <skill-dir>/scripts/roll.ts ...      # fallback, same interface
bun  <skill-dir>/scripts/roll.ts --list   # all pools (with sizes) and presets
bun  <skill-dir>/scripts/roll.ts --check  # validate pools after editing them
```

Packs: `core` (concrete things and senses), `method` (transforms, lenses, constraints, questions),
`story` (situations, motives, flaws, forms), `oracle` (tarot, I Ching, runes), `rpg` (tabletop prep),
`game-design` (mechanics, arenas, roles, pressure, game-show rounds).

Template syntax, in short:
- `{core:color}` -- a random line from that pool; `{color}` -- short name, found in `core`
- `{rpg:*}` / `{*}` -- a random pool, then a line from it
- `{core:material 2 & rpg:material}` -- join pools with weights (here about 67% / 33%)
- Everything outside braces is literal text. Use labels: `'role: {rpg:trade}; secret: {rpg:secret}'`.

Presets are template files: `@name` runs `{core:_name}`, `@pack/name` runs `{pack:_name}`.
Available: `@spark` (default), `@vibe`, `@method/brainstorm`, `@method/research`, `@story/seed`,
`@story/character`, `@oracle/draw`, `@rpg/npc`, `@rpg/hook`, `@rpg/location`, `@rpg/item`,
`@rpg/faction`, `@rpg/encounter`, `@rpg/tavern`, `@rpg/trap`, `@rpg/rumor`,
`@game-design/mechanic`, `@game-design/setpiece`, `@game-design/show`. `--list` describes each.

Within one run every pool is dealt like a shuffled deck: nothing repeats across the `-n` rolls
until that pool runs out. The output is raw material for you, not finished prose -- write the idea
in your own words.

## Choosing what to run

1. If the user gave a template, preset or flags -- pass them **verbatim**.
2. Otherwise pick the closest preset, or write a template from the request
   (e.g. "a smuggler's hideout" -> `'site: {core:site}; run by: {rpg:trade}; secret: {rpg:secret}'`).
3. Ideation default: `-n 5`. A single requested thing: `-n 1` (or `-n 3` and offer the best).
4. Decide `-n` before rolling. One script call per request, unless the user asks for more.

## Rules -- these are the point of the skill

1. **The script rolls, you never do.** Don't invent "random" words, don't read pool files to pick or
   preview anchors, and don't re-run because you dislike the result. Awkward anchors are the feature.
   You may add details around the anchors, but the anchors stay the spine of the idea.
2. **At most one swap per roll, and only for a real reason:** an anchor makes the task impossible
   (it contradicts a hard requirement the user gave) or offensive in context. "Boring", "weird" or
   "hard to use" are not reasons. Re-roll just that slot from the same pool with a one-slot template
   (`'{rpg:secret}' -n 1`). The replacement is final.
   - With `show-roll=yes`, mark it: `[secret: started the fire, swapped: contradicts the brief]`.
   - With `show-roll=no`, swap silently.
3. **Load-bearing, not decorative.** Each anchor must shape the idea's *structure* -- premise,
   mechanism, conflict, setting or form -- not appear as a passing word. Test: remove the anchor; if the
   idea survives unchanged, you decorated. Rework it before presenting.
4. **Modes** (the user may name one; default `strict`). Both modes keep every anchor load-bearing.
   - `strict` -- each anchor is literally present and central.
   - `oblique` -- anchors work as mood, metaphor or hidden mechanism and need not be named.
5. **Research use (`@method/research` or similar):** anchors choose the *angle* (lens, scale,
   question) only. They never supply facts. Findings come from real sources, and you say that the
   angle was chosen at random.
6. **Fan out, then select.** One idea per roll; then point out the strongest one or two in a line, or
   let the user pick. Random anchors raise variance both ways -- selection turns that into quality.

## Output

The script's header line contains the seed and `show-roll=yes|no`.

- `show-roll=yes` (default): for each roll, list the anchors compactly, each with the part of the
  idea it drives, then the idea itself:
  `[motive: to see the sea once -> the goal] [secret: started the fire -> the conflict] [smell: tar -> the setting]`
  End with the full seed from the header: `seed 93cea81f0b2c4d17 (same roll: --seed 93cea81f0b2c4d17)`.
- `show-roll=no` (`--hide-roll`): present only the ideas. Don't mention anchors, swaps or the seed
  unless the user asks.

Keep each idea tight; expand only the one(s) the user picks.

## Your own pools and packs

Users can roll from their own lists alongside the shipped packs, e.g. `'{core:animal} is {my-thing:color}'`:

- `VIBE_ROLL_POOLS` -- pools folders to load on every roll, separated like `PATH`.
- `--pack <path>` (or `--pack name=<path>`) -- add one pack folder for this run. Repeatable.

When the user asks to create a pool, pack or template, or to save a list or theme for rolling,
read [references/pools.md](references/pools.md) first: it covers the file format, the full slot
syntax, templates, unions, joins, how packs connect, and how to write pools that work. Never write
inside this skill's folder (it is replaced on update): create the pack elsewhere (ask where if
`VIBE_ROLL_POOLS` is not set), run `--check` with `--pack`, roll it, and suggest adding its parent
folder to `VIBE_ROLL_POOLS`.
